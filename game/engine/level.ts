// Génération de niveau par chunks composables sur une grille de cellules.
// Le monde est un réseau de rues (couloirs, virages, carrefours, places) assemblé
// bout à bout à chaque run.
//
// Perf mobile :
//  - Le décor statique (sol, façades, toits, arêtes, graffitis, panneaux, logos,
//    flaques) est PRÉ-RENDU en tuiles offscreen avec un petit cache LRU : le rendu
//    par frame se réduit à quelques drawImage au lieu de centaines de fills,
//    gradients et textes vectoriels.
//  - pushOut passe par une grille spatiale d'obstacles (buckets par cellule) :
//    chaque entité ne teste que les obstacles de SA cellule.
//  - computeFlow / steerInto sont déroulés sans aucune allocation (l'ancien steer()
//    créait 5 tableaux par ennemi par frame → pression GC → micro-saccades).

import { NEONS } from './sprites'

// Taille d'une cellule en pixels monde. Couloir standard = 4 cellules (640 px),
// ruelle = 2 cellules (320 px).
export const CELL = 160

// Tuiles du décor statique pré-rendu (cache LRU).
const TILE = 512
const TILE_CACHE_MAX = 20

type Side = 'N' | 'S' | 'E' | 'W'

interface Port {
  side: Side
  at: number // index de la première cellule du span
  width: number // largeur du span en cellules
}

interface ChunkDef {
  name: string
  cells: string[] // '.' = sol, '#' = vide
  entry: Port // toujours côté W en orientation canonique
  exits: Port[]
}

// ---------------------------------------------------------------------------
// Bibliothèque de chunks (orientation canonique, entrée à l'Ouest)
// ---------------------------------------------------------------------------
const CHUNK_LIB: ChunkDef[] = [
  // Couloir droit : la rue de base
  {
    name: 'corridor',
    cells: ['......', '......', '......', '......'],
    entry: { side: 'W', at: 0, width: 4 },
    exits: [{ side: 'E', at: 0, width: 4 }],
  },
  // Virage en L vers le bas (Sud)
  {
    name: 'turnS',
    cells: ['......', '......', '......', '......', '##....', '##....'],
    entry: { side: 'W', at: 0, width: 4 },
    exits: [{ side: 'S', at: 2, width: 4 }],
  },
  // Virage en L vers le haut (Nord)
  {
    name: 'turnN',
    cells: ['##....', '##....', '......', '......', '......', '......'],
    entry: { side: 'W', at: 2, width: 4 },
    exits: [{ side: 'N', at: 2, width: 4 }],
  },
  // Carrefour en croix : l'assembleur ne poursuit que par UNE sortie,
  // les bras restants deviennent des culs-de-sac (variété gratuite)
  {
    name: 'cross',
    cells: [
      '##....##',
      '##....##',
      '........',
      '........',
      '........',
      '........',
      '##....##',
      '##....##',
    ],
    entry: { side: 'W', at: 2, width: 4 },
    exits: [
      { side: 'E', at: 2, width: 4 },
      { side: 'N', at: 2, width: 4 },
      { side: 'S', at: 2, width: 4 },
    ],
  },
  // Ruelle étroite qui débouche sur une place ouverte, puis repart en ruelle
  {
    name: 'alleyPlaza',
    cells: [
      '##......##',
      '##......##',
      '..........',
      '..........',
      '##......##',
      '##......##',
    ],
    entry: { side: 'W', at: 2, width: 2 },
    exits: [{ side: 'E', at: 2, width: 2 }],
  },
]

// Arène néon : salle spéciale AUTORÉE, volontairement hors de CHUNK_LIB (jamais
// tirée au hasard — posée de façon garantie par tryBuild sur le premier port du
// cross de départ). Grand octogone ouvert de 12×12 cellules (1920 px de côté,
// vs 1280 pour un cross), coins biseautés, traversant W→E avec sortie S possible.
const ARENA_DEF: ChunkDef = {
  name: 'arena',
  cells: [
    '###......###',
    '##........##',
    '#..........#',
    '............',
    '............',
    '............',
    '............',
    '............',
    '............',
    '#..........#',
    '##........##',
    '###......###',
  ],
  entry: { side: 'W', at: 4, width: 4 },
  exits: [
    { side: 'E', at: 4, width: 4 },
    { side: 'S', at: 4, width: 4 },
  ],
}

// ---------------------------------------------------------------------------
// Rotation d'un chunk par quarts de tour horaires
// ---------------------------------------------------------------------------

// Grille tournée de 90° horaire : la cellule (r, c) devient (c, R-1-r).
function rotateCellsCW(cells: string[]): string[] {
  const R = cells.length
  const C = cells[0].length
  const out: string[] = []
  for (let c = 0; c < C; c++) {
    let row = ''
    for (let r = R - 1; r >= 0; r--) row += cells[r][c]
    out.push(row)
  }
  return out
}

// Transforme un port lors d'une rotation horaire (R = nb de lignes AVANT rotation).
function rotatePortCW(p: Port, R: number): Port {
  switch (p.side) {
    case 'W': return { side: 'N', at: R - p.at - p.width, width: p.width }
    case 'N': return { side: 'E', at: p.at, width: p.width }
    case 'E': return { side: 'S', at: R - p.at - p.width, width: p.width }
    case 'S': return { side: 'W', at: p.at, width: p.width }
  }
}

interface RotatedChunk {
  name: string
  cells: string[]
  rows: number
  cols: number
  entry: Port
  exits: Port[]
}

function rotateChunk(def: ChunkDef, k: number): RotatedChunk {
  let cells = def.cells
  let entry = def.entry
  let exits = def.exits
  for (let i = 0; i < k; i++) {
    const R = cells.length
    entry = rotatePortCW(entry, R)
    exits = exits.map((p) => rotatePortCW(p, R))
    cells = rotateCellsCW(cells)
  }
  return { name: def.name, cells, rows: cells.length, cols: cells[0].length, entry, exits }
}

// Nombre de rotations horaires pour amener l'entrée canonique (W) sur le côté voulu.
const ROTATION_FOR_ENTRY: Record<Side, number> = { W: 0, N: 1, E: 2, S: 3 }
const OPPOSITE: Record<Side, Side> = { N: 'S', S: 'N', E: 'W', W: 'E' }

// ---------------------------------------------------------------------------
// Assemblage
// ---------------------------------------------------------------------------

// Port ouvert en coordonnées monde : (x, y) = première cellule du span de sortie
// (située DANS le chunk qui vient d'être posé), dir = direction de croissance.
interface OpenPort {
  dir: Side
  x: number
  y: number
  width: number
}

interface PlacedChunk {
  name: string
  ox: number // origine en cellules monde
  oy: number
  rows: number
  cols: number
}

const cellKey = (x: number, y: number) => `${x},${y}`

function pickWeighted(weights: Record<string, number>): string {
  let total = 0
  for (const k in weights) total += weights[k]
  let r = Math.random() * total
  for (const k in weights) {
    r -= weights[k]
    if (r <= 0) return k
  }
  return Object.keys(weights)[0]
}

// Porte de secteur : span de cellules (coords monde non normalisées) posé sur
// le port d'entrée du premier chunk d'un nouveau secteur.
interface GateCells {
  cells: { x: number; y: number }[]
}

// Indices de chunk (ordre de pose) qui OUVRENT un nouveau secteur : leur port
// d'entrée devient une porte fermée. S0 = cross + arène + 1 chunk, puis 3 chunks
// par secteur. Au plus 3 portes (aligné sur GATE_KILLS côté moteur).
const GATE_AT = [3, 6, 9]

interface BuildResult {
  carved: Map<string, true>
  placed: PlacedChunk[]
  spawnCell: { cx: number; cy: number }
  gates: GateCells[]
}

// Assemble une suite de chunks en avançant de port en port.
function tryBuild(targetChunks: number): BuildResult {
  const carved = new Map<string, true>()
  const placed: PlacedChunk[] = []
  const gates: GateCells[] = []

  // Pose les cellules jouables d'un chunk ; refuse tout chevauchement.
  const stamp = (rc: RotatedChunk, ox: number, oy: number): boolean => {
    const keys: string[] = []
    for (let r = 0; r < rc.rows; r++) {
      for (let c = 0; c < rc.cols; c++) {
        if (rc.cells[r][c] !== '.') continue
        const k = cellKey(ox + c, oy + r)
        if (carved.has(k)) return false
        keys.push(k)
      }
    }
    keys.forEach((k) => carved.set(k, true))
    placed.push({ name: rc.name, ox, oy, rows: rc.rows, cols: rc.cols })
    return true
  }

  // Convertit un port local (du chunk posé en ox,oy) en port ouvert monde.
  const toWorldPort = (rc: RotatedChunk, ox: number, oy: number, p: Port): OpenPort => {
    switch (p.side) {
      case 'E': return { dir: 'E', x: ox + rc.cols - 1, y: oy + p.at, width: p.width }
      case 'W': return { dir: 'W', x: ox, y: oy + p.at, width: p.width }
      case 'S': return { dir: 'S', x: ox + p.at, y: oy + rc.rows - 1, width: p.width }
      case 'N': return { dir: 'N', x: ox + p.at, y: oy, width: p.width }
    }
  }

  // Chunk de départ : un carrefour, joueur au centre.
  const start = rotateChunk(CHUNK_LIB.find((c) => c.name === 'cross')!, 0)
  stamp(start, 0, 0)
  const spawnCell = { cx: 4, cy: 4 } // centre du cross 8×8

  let open = toWorldPort(start, 0, 0, start.exits[Math.floor(Math.random() * start.exits.length)])
  let lastName = 'cross'

  // Tourne, aligne et pose un chunk sur le port ouvert courant ; en cas de
  // succès, avance le port sur une sortie du chunk posé. (Même math qu'avant,
  // factorisée pour servir aussi au placement garanti de l'arène.)
  // gated : le span d'entrée du chunk posé devient une porte de secteur.
  const attach = (def: ChunkDef, gated = false): boolean => {
    const entrySide = OPPOSITE[open.dir]
    const rc = rotateChunk(def, ROTATION_FOR_ENTRY[entrySide])
    const e = rc.entry
    // Alignement centré des spans (gère couloir 4 ↔ ruelle 2).
    const shift = Math.floor((open.width - e.width) / 2)
    let ox: number
    let oy: number
    if (open.dir === 'E') {
      ox = open.x + 1
      oy = open.y + shift - e.at
    } else if (open.dir === 'W') {
      ox = open.x - 1 - (rc.cols - 1)
      oy = open.y + shift - e.at
    } else if (open.dir === 'S') {
      oy = open.y + 1
      ox = open.x + shift - e.at
    } else {
      oy = open.y - 1 - (rc.rows - 1)
      ox = open.x + shift - e.at
    }
    if (!stamp(rc, ox, oy)) return false

    // Porte de secteur : les cellules du span d'entrée du chunk fraîchement posé
    // (1 cellule de profondeur × largeur du port).
    if (gated) {
      const cells: { x: number; y: number }[] = []
      for (let k = 0; k < e.width; k++) {
        if (e.side === 'W') cells.push({ x: ox, y: oy + e.at + k })
        else if (e.side === 'E') cells.push({ x: ox + rc.cols - 1, y: oy + e.at + k })
        else if (e.side === 'N') cells.push({ x: ox + e.at + k, y: oy })
        else cells.push({ x: ox + e.at + k, y: oy + rc.rows - 1 })
      }
      gates.push({ cells })
    }

    // Prochaine sortie : au hasard parmi les exits du chunk posé.
    const exit = rc.exits[Math.floor(Math.random() * rc.exits.length)]
    open = toWorldPort(rc, ox, oy, exit)
    lastName = def.name
    return true
  }

  // Arène néon : posée de façon GARANTIE sur le premier port du cross de départ
  // (seul le cross est stampé à ce stade → aucun chevauchement possible), donc
  // toujours présente et adjacente au spawn. Le parcours continue par sa sortie.
  attach(ARENA_DEF)

  for (let n = 0; n < targetChunks; n++) {
    // Tirage pondéré avec anti-répétition simple.
    const weights: Record<string, number> = { corridor: 3, turnS: 2, turnN: 2, cross: 1.4, alleyPlaza: 1.6 }
    if (lastName in weights) weights[lastName] *= 0.35

    // Essaie plusieurs candidats avant d'abandonner ce port.
    const candidates = Object.keys(weights).sort(() => Math.random() - 0.5)
    candidates.unshift(pickWeighted(weights)) // le favori d'abord

    // Frontière de secteur : le prochain chunk posé (quel qu'il soit) est gaté.
    const gated = GATE_AT.includes(placed.length)

    let placedOne = false
    for (const name of candidates) {
      if (attach(CHUNK_LIB.find((c) => c.name === name)!, gated)) {
        placedOne = true
        break
      }
    }
    if (!placedOne) break // parcours bloqué : le niveau se termine en cul-de-sac
  }

  return { carved, placed, spawnCell, gates }
}

// ---------------------------------------------------------------------------
// Décor généré par niveau
// ---------------------------------------------------------------------------

export interface Decal {
  x: number
  y: number
  txt: string
  col: string
  sz: number
  rot: number
  a: number
}
export interface Sign { x: number; y: number; txt: string }
// Logos du site intégrés au décor. Canvases teintés fournis par le moteur
// (null tant que le SVG n'est pas chargé — on saute simplement le dessin).
export interface LogoKit { white: CanvasImageSource | null; black: CanvasImageSource | null }
export interface WallLogo { x: number; y: number; w: number; variant: 'white' | 'black' }
export interface FloorLogo { x: number; y: number; w: number; rot: number }
export interface Puddle { x: number; y: number; r: number; col: string }
// Emprise de l'arène néon en pixels monde (bornes du chunk 'arena').
export interface ArenaRect { x0: number; y0: number; x1: number; y1: number }
// Porte de secteur finalisée : indices de cellules (grille = 2 tant que fermée),
// centre en px monde (feedback), état. Ouvertes dans l'ordre du tableau.
export interface Gate { cells: number[]; x: number; y: number; open: boolean }
export interface Obstacle { x: number; y: number; r: number }
export interface Pillar { x: number; y: number }
export interface Bench { x: number; y: number }
// Instance de mobilier urbain posée dans le monde. `key` référence un sprite
// baké dans sprites.ts (buildProps) ; `flip` = miroir horizontal aléatoire.
export interface PropInst { key: string; x: number; y: number; flip: number }

// Registre data-driven du mobilier urbain : ajouter un prop = une entrée ici
// + son sprite dans buildProps() (sprites.ts), rien d'autre.
//  - zone       : 'wall' = adossé aux façades, 'floor' = en pleine rue
//  - cap / per  : budget = min(cap, cellules_zone / per), scalé par la densité
//  - wallOffset : décalage y depuis le haut de cellule (zone 'wall' uniquement)
//  - spawnDist  : rayon préservé autour du spawn joueur (px)
//  - spacing    : distance min aux obstacles déjà posés (px)
//  - circles    : colliders circulaires relatifs au pied (dx miroité par flip) ;
//                 r ≤ 38 obligatoire (hypothèse du pad des buckets d'obstacles)
interface PropDef {
  key: string
  zone: 'wall' | 'floor'
  cap: number
  per: number
  wallOffset?: number
  spawnDist: number
  spacing: number
  circles: { dx: number; r: number }[]
}

const PROP_DEFS: PropDef[] = [
  { key: 'dumpster', zone: 'wall', cap: 4, per: 9, wallOffset: 46, spawnDist: 360, spacing: CELL * 1.3, circles: [{ dx: -20, r: 22 }, { dx: 20, r: 22 }] },
  { key: 'hydrant', zone: 'wall', cap: 3, per: 11, wallOffset: 36, spawnDist: 300, spacing: CELL * 1.1, circles: [{ dx: 0, r: 11 }] },
  { key: 'sign_stop', zone: 'wall', cap: 2, per: 13, wallOffset: 32, spawnDist: 300, spacing: CELL * 1.5, circles: [{ dx: 0, r: 8 }] },
  { key: 'sign_oneway', zone: 'wall', cap: 2, per: 13, wallOffset: 32, spawnDist: 300, spacing: CELL * 1.5, circles: [{ dx: 0, r: 8 }] },
  { key: 'barrier', zone: 'floor', cap: 4, per: 24, spawnDist: 360, spacing: CELL * 1.4, circles: [{ dx: -18, r: 15 }, { dx: 18, r: 15 }] },
  { key: 'cone', zone: 'floor', cap: 7, per: 16, spawnDist: 260, spacing: CELL * 0.9, circles: [{ dx: 0, r: 9 }] },
]

export interface LevelOpts {
  decalDensity?: number // multiplicateur de densité des graffitis/flaques (profil)
}

const GRAFFITI_WORDS = ['REX', 'ZK', 'VYBE', 'OMEN', 'SL8', 'KAPO', 'NÎM', 'FLUX', '13', 'WAKE']
const SIGN_NAMES = ['NORTHGATE', 'CANAL ROW', '13TH ALLEY', 'MARKET SQ', 'DOCK ST']

interface TileEntry { cv: HTMLCanvasElement; last: number }

// ---------------------------------------------------------------------------
// Niveau finalisé : grille dense + requêtes gameplay + décor statique pré-rendu
// ---------------------------------------------------------------------------
export class Level {
  cols: number
  rows: number
  grid: Uint8Array // 1 = sol jouable, 0 = vide/bâtiment
  W: number // dimensions en pixels
  H: number
  spawnX: number
  spawnY: number

  decals: Decal[] = []
  signs: Sign[] = []
  puddles: Puddle[] = []
  obstacles: Obstacle[] = []
  pillars: Pillar[] = []
  benches: Bench[] = []
  props: PropInst[] = [] // mobilier urbain (registre PROP_DEFS)
  floorLogo: FloorLogo | null = null // logo blanc au sol : UN SEUL par niveau
  arena: ArenaRect | null = null // emprise de l'arène néon (chunk garanti)
  arenaLogo: FloorLogo | null = null // logo EHYO géant au centre de l'arène
  gates: Gate[] = [] // portes de secteur, dans l'ordre d'ouverture
  wallLogos: WallLogo[] = []
  chunkNames: string[] = [] // pour debug/inspection

  private density: number
  private walkCells: number[] = [] // toutes les cellules de sol (décor : monde entier)
  // Cellules ATTEIGNABLES portes fermées comprises : seules elles reçoivent des
  // spawns ennemis. Grossit à chaque ouverture de porte (événement rare).
  private openCells: number[] = []
  private openMask!: Uint8Array // 1 = cellule atteignable actuellement
  private flow: Int32Array // distance BFS au joueur, -1 = non atteint
  private flowQueue: Int32Array

  // Grille spatiale d'obstacles : bucket par cellule → pushOut en O(obstacles proches).
  private obstacleBuckets = new Map<number, Obstacle[]>()

  // Décor statique pré-rendu par tuiles (cache LRU).
  private tileCache = new Map<number, TileEntry>()
  private tilesX = 0
  private pattern: CanvasPattern | null = null
  private logos: LogoKit | null = null

  constructor(build: BuildResult, density: number) {
    this.density = density
    // Bounding box des cellules creusées + marge de 1 cellule (toits/façades autour).
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const k of build.carved.keys()) {
      const [x, y] = k.split(',').map(Number)
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    const margin = 1
    this.cols = maxX - minX + 1 + margin * 2
    this.rows = maxY - minY + 1 + margin * 2
    this.grid = new Uint8Array(this.cols * this.rows)
    for (const k of build.carved.keys()) {
      const [x, y] = k.split(',').map(Number)
      this.grid[(y - minY + margin) * this.cols + (x - minX + margin)] = 1
    }
    this.W = this.cols * CELL
    this.H = this.rows * CELL
    this.tilesX = Math.ceil(this.W / TILE)
    this.spawnX = (build.spawnCell.cx - minX + margin + 0.5) * CELL
    this.spawnY = (build.spawnCell.cy - minY + margin + 0.5) * CELL
    this.chunkNames = build.placed.map((p) => p.name)

    // Emprise de l'arène néon (chunk posé de façon garantie par tryBuild).
    const ap = build.placed.find((p) => p.name === 'arena')
    if (ap) {
      this.arena = {
        x0: (ap.ox - minX + margin) * CELL,
        y0: (ap.oy - minY + margin) * CELL,
        x1: (ap.ox - minX + margin + ap.cols) * CELL,
        y1: (ap.oy - minY + margin + ap.rows) * CELL,
      }
    }

    this.flow = new Int32Array(this.cols * this.rows).fill(-1)
    this.flowQueue = new Int32Array(this.cols * this.rows)
    this.openMask = new Uint8Array(this.cols * this.rows)

    // Portes de secteur : cellules passées de sol (stampées '.') à 2 = fermée.
    // Le monde COMPLET est déjà dimensionné : ouvrir une porte ne fera que muter
    // des valeurs, jamais réallouer (invariant zéro-realloc en run).
    for (const g of build.gates) {
      const cells: number[] = []
      let sx = 0
      let sy = 0
      for (const c of g.cells) {
        const gx = c.x - minX + margin
        const gy = c.y - minY + margin
        const idx = gy * this.cols + gx
        this.grid[idx] = 2
        cells.push(idx)
        sx += (gx + 0.5) * CELL
        sy += (gy + 0.5) * CELL
      }
      this.gates.push({ cells, x: sx / cells.length, y: sy / cells.length, open: false })
    }

    for (let i = 0; i < this.grid.length; i++) if (this.grid[i] === 1) this.walkCells.push(i)

    // Atteignabilité initiale (portes fermées) depuis le spawn.
    const spawnIdx = Math.floor(this.spawnY / CELL) * this.cols + Math.floor(this.spawnX / CELL)
    this.floodOpen(spawnIdx)
    // Anti-leak : une porte dont TOUT le voisinage jouable est déjà atteignable
    // est contournée (chunks devenus adjacents sans port) → fusion : on l'ouvre
    // d'office pour garder des paliers cohérents. Jamais de softlock.
    for (const g of this.gates) {
      let blocks = false
      for (const ci of g.cells) {
        const cx = ci % this.cols
        const cy = (ci / this.cols) | 0
        if (
          (this.cellWalkable(cx - 1, cy) && !this.openMask[ci - 1]) ||
          (this.cellWalkable(cx + 1, cy) && !this.openMask[ci + 1]) ||
          (this.cellWalkable(cx, cy - 1) && !this.openMask[ci - this.cols]) ||
          (this.cellWalkable(cx, cy + 1) && !this.openMask[ci + this.cols])
        ) {
          blocks = true
          break
        }
      }
      if (!blocks) this.openGate(g)
    }

    this.generateDecor()
    this.buildObstacleBuckets()
  }

  // ---- Portes de secteur ----

  // Flood fill : marque atteignable tout le sol connecté aux graines (grille==1).
  // Réutilise flowQueue comme file (événement rare : build + ouvertures).
  private floodOpen(...seeds: number[]): void {
    const q = this.flowQueue
    const cols = this.cols
    let head = 0
    let tail = 0
    for (const s of seeds) {
      if (this.grid[s] !== 1 || this.openMask[s]) continue
      this.openMask[s] = 1
      this.openCells.push(s)
      q[tail++] = s
    }
    while (head < tail) {
      const i = q[head++]
      const cx = i % cols
      const cy = (i / cols) | 0
      // 4 voisins orthogonaux
      if (cx > 0 && this.grid[i - 1] === 1 && !this.openMask[i - 1]) { this.openMask[i - 1] = 1; this.openCells.push(i - 1); q[tail++] = i - 1 }
      if (cx < cols - 1 && this.grid[i + 1] === 1 && !this.openMask[i + 1]) { this.openMask[i + 1] = 1; this.openCells.push(i + 1); q[tail++] = i + 1 }
      if (cy > 0 && this.grid[i - cols] === 1 && !this.openMask[i - cols]) { this.openMask[i - cols] = 1; this.openCells.push(i - cols); q[tail++] = i - cols }
      if (cy < this.rows - 1 && this.grid[i + cols] === 1 && !this.openMask[i + cols]) { this.openMask[i + cols] = 1; this.openCells.push(i + cols); q[tail++] = i + cols }
    }
  }

  // Ouvre une porte : cellules → sol, atteignabilité étendue, éviction CIBLÉE
  // des tuiles couvrant la porte (jamais invalidateStatic : re-bake local only).
  private openGate(g: Gate): void {
    g.open = true
    for (const ci of g.cells) this.grid[ci] = 1
    this.floodOpen(...g.cells)
    for (const ci of g.cells) {
      const cx = ci % this.cols
      const cy = (ci / this.cols) | 0
      const t0x = Math.floor((cx * CELL) / TILE)
      const t1x = Math.floor(((cx + 1) * CELL - 1) / TILE)
      const t0y = Math.floor((cy * CELL) / TILE)
      const t1y = Math.floor(((cy + 1) * CELL - 1) / TILE)
      for (let ty = t0y; ty <= t1y; ty++) {
        for (let tx = t0x; tx <= t1x; tx++) this.tileCache.delete(ty * this.tilesX + tx)
      }
    }
  }

  // Ouvre la prochaine porte fermée. Retourne son centre (feedback) ou null.
  openNextGate(): { x: number; y: number } | null {
    for (const g of this.gates) {
      if (!g.open) {
        this.openGate(g)
        return { x: g.x, y: g.y }
      }
    }
    return null
  }

  // ---- Requêtes de base ----
  cellWalkable(cx: number, cy: number): boolean {
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return false
    return this.grid[cy * this.cols + cx] === 1
  }

  walkableAt(px: number, py: number): boolean {
    return this.cellWalkable(Math.floor(px / CELL), Math.floor(py / CELL))
  }

  private cellCenter(i: number): { x: number; y: number } {
    return { x: ((i % this.cols) + 0.5) * CELL, y: (Math.floor(i / this.cols) + 0.5) * CELL }
  }

  // Vrai si le point (px, py) est dans l'arène néon (pad élargit l'emprise).
  private inArena(px: number, py: number, pad = 0): boolean {
    const a = this.arena
    return !!a && px > a.x0 - pad && px < a.x1 + pad && py > a.y0 - pad && py < a.y1 + pad
  }

  // Variante cellule (centre de cellule) pour le bake des tuiles.
  private cellInArena(cx: number, cy: number): boolean {
    return this.inArena((cx + 0.5) * CELL, (cy + 0.5) * CELL)
  }

  // Vrai si le cercle (x, y, r) repose entièrement sur du sol jouable.
  private circleFits(x: number, y: number, r: number): boolean {
    const c0x = Math.floor((x - r) / CELL)
    const c1x = Math.floor((x + r) / CELL)
    const c0y = Math.floor((y - r) / CELL)
    const c1y = Math.floor((y + r) / CELL)
    for (let cy = c0y; cy <= c1y; cy++)
      for (let cx = c0x; cx <= c1x; cx++)
        if (!this.cellWalkable(cx, cy)) return false
    return true
  }

  // Déplacement d'un cercle avec glissement le long des murs (axe par axe).
  moveCircle(ent: { x: number; y: number }, dx: number, dy: number, r: number): void {
    // Déjà hors zone (poussé par une explosion…) : laisser bouger pour s'échapper.
    const free = this.circleFits(ent.x, ent.y, r)
    if (dx !== 0) {
      const nx = ent.x + dx
      if (!free || this.circleFits(nx, ent.y, r)) ent.x = nx
      else if (dx > 0) ent.x = Math.floor((nx + r) / CELL) * CELL - r - 0.01
      else ent.x = (Math.floor((nx - r) / CELL) + 1) * CELL + r + 0.01
    }
    if (dy !== 0) {
      const ny = ent.y + dy
      if (!free || this.circleFits(ent.x, ny, r)) ent.y = ny
      else if (dy > 0) ent.y = Math.floor((ny + r) / CELL) * CELL - r - 0.01
      else ent.y = (Math.floor((ny - r) / CELL) + 1) * CELL + r + 0.01
    }
  }

  // ---- Grille spatiale d'obstacles (piliers, bancs) ----
  // Chaque obstacle est enregistré dans toutes les cellules que son cercle élargi
  // touche ; une entité ne teste ensuite que le bucket de SA cellule.
  private buildObstacleBuckets(): void {
    const pad = 60 // rayon obstacle max (38) + rayon entité max (~14) + marge
    for (const o of this.obstacles) {
      const c0x = Math.max(0, Math.floor((o.x - o.r - pad) / CELL))
      const c1x = Math.min(this.cols - 1, Math.floor((o.x + o.r + pad) / CELL))
      const c0y = Math.max(0, Math.floor((o.y - o.r - pad) / CELL))
      const c1y = Math.min(this.rows - 1, Math.floor((o.y + o.r + pad) / CELL))
      for (let cy = c0y; cy <= c1y; cy++) {
        for (let cx = c0x; cx <= c1x; cx++) {
          const k = cy * this.cols + cx
          let bucket = this.obstacleBuckets.get(k)
          if (!bucket) {
            bucket = []
            this.obstacleBuckets.set(k, bucket)
          }
          bucket.push(o)
        }
      }
    }
  }

  // Repousse une entité hors des obstacles circulaires de sa cellule.
  pushOut(ent: { x: number; y: number }, er: number): void {
    const cx = Math.max(0, Math.min(this.cols - 1, (ent.x / CELL) | 0))
    const cy = Math.max(0, Math.min(this.rows - 1, (ent.y / CELL) | 0))
    const bucket = this.obstacleBuckets.get(cy * this.cols + cx)
    if (!bucket) return
    for (let i = 0; i < bucket.length; i++) {
      const o = bucket[i]
      const dx = ent.x - o.x
      const dy = ent.y - o.y
      const d = Math.hypot(dx, dy)
      const min = o.r + er
      if (d > 0.01 && d < min) {
        ent.x = o.x + (dx / d) * min
        ent.y = o.y + (dy / d) * min
      }
    }
  }

  // ---- Flow field : BFS depuis le joueur (recalculé à intervalle par le moteur).
  // Déroulé sans allocation : c'est un point chaud sur mobile.
  computeFlow(px: number, py: number): void {
    this.flow.fill(-1)
    const sx = Math.floor(px / CELL)
    const sy = Math.floor(py / CELL)
    if (!this.cellWalkable(sx, sy)) return
    let head = 0
    let tail = 0
    const cols = this.cols
    const startIdx = sy * cols + sx
    this.flow[startIdx] = 0
    this.flowQueue[tail++] = startIdx
    while (head < tail) {
      const i = this.flowQueue[head++]
      const d = this.flow[i] + 1
      const cx = i % cols
      // 4 voisins orthogonaux, déroulés
      if (cx > 0 && this.grid[i - 1] === 1 && this.flow[i - 1] === -1) {
        this.flow[i - 1] = d
        this.flowQueue[tail++] = i - 1
      }
      if (cx < cols - 1 && this.grid[i + 1] === 1 && this.flow[i + 1] === -1) {
        this.flow[i + 1] = d
        this.flowQueue[tail++] = i + 1
      }
      if (i >= cols && this.grid[i - cols] === 1 && this.flow[i - cols] === -1) {
        this.flow[i - cols] = d
        this.flowQueue[tail++] = i - cols
      }
      if (i < this.grid.length - cols && this.grid[i + cols] === 1 && this.flow[i + cols] === -1) {
        this.flow[i + cols] = d
        this.flowQueue[tail++] = i + cols
      }
    }
  }

  // Direction à suivre depuis (x, y) pour se rapprocher du joueur via le réseau.
  // Écrit dans `out` et retourne true, ou false = viser en ligne droite.
  // Zéro allocation (appelé pour chaque ennemi au sol, chaque frame).
  steerInto(x: number, y: number, out: { x: number; y: number }): boolean {
    const cols = this.cols
    const cx = (x / CELL) | 0
    const cy = (y / CELL) | 0
    if (cx < 0 || cy < 0 || cx >= cols || cy >= this.rows) return false
    const i = cy * cols + cx
    if (this.grid[i] !== 1) return false
    const d = this.flow[i]
    if (d <= 0) return false
    let best = -1
    let bd = d
    // 4 voisins déroulés
    if (cx > 0 && this.grid[i - 1] === 1) {
      const nd = this.flow[i - 1]
      if (nd >= 0 && nd < bd) { bd = nd; best = i - 1 }
    }
    if (cx < cols - 1 && this.grid[i + 1] === 1) {
      const nd = this.flow[i + 1]
      if (nd >= 0 && nd < bd) { bd = nd; best = i + 1 }
    }
    if (i >= cols && this.grid[i - cols] === 1) {
      const nd = this.flow[i - cols]
      if (nd >= 0 && nd < bd) { bd = nd; best = i - cols }
    }
    if (i < this.grid.length - cols && this.grid[i + cols] === 1) {
      const nd = this.flow[i + cols]
      if (nd >= 0 && nd < bd) { bd = nd; best = i + cols }
    }
    if (best < 0) return false
    const tx = ((best % cols) + 0.5) * CELL
    const ty = (((best / cols) | 0) + 0.5) * CELL
    const dx = tx - x
    const dy = ty - y
    const m = Math.hypot(dx, dy) || 1
    out.x = dx / m
    out.y = dy / m
    return true
  }

  // Point de spawn au sol : cellule jouable dans un anneau de distance autour du
  // joueur, de préférence hors champ de la caméra.
  randomSpawnPoint(
    px: number, py: number, rmin: number, rmax: number,
    camX: number, camY: number, vw: number, vh: number,
  ): { x: number; y: number } | null {
    // Échantillonne les cellules ATTEIGNABLES (openCells) : pas de spawn derrière
    // une porte fermée (l'ennemi y resterait figé, flow field à -1).
    const n = this.openCells.length
    if (!n) return null
    for (let t = 0; t < 40; t++) {
      const c = this.cellCenter(this.openCells[(Math.random() * n) | 0])
      const x = c.x + (Math.random() - 0.5) * CELL * 0.6
      const y = c.y + (Math.random() - 0.5) * CELL * 0.6
      const d = Math.hypot(x - px, y - py)
      const loose = t >= 24 // on relâche les contraintes en fin de tirage
      if (d < (loose ? rmin * 0.6 : rmin) || d > (loose ? rmax * 1.8 : rmax)) continue
      const onScreen = x > camX - 40 && x < camX + vw + 40 && y > camY - 40 && y < camY + vh + 40
      if (onScreen && t < 16) continue // d'abord on cherche hors écran
      return { x, y }
    }
    return null
  }

  // ---- Décor : graffitis, panneaux, flaques, piliers, bancs, logos ----
  private generateDecor(): void {
    const facadeCells: number[] = [] // cellules vides avec du sol juste dessous
    const interiorCells: number[] = [] // sol entouré de sol (pour les piliers)
    const underWallCells: number[] = [] // sol avec façade au-dessus (pour les bancs)

    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const walk = this.cellWalkable(cx, cy)
        if (!walk && this.cellWalkable(cx, cy + 1)) facadeCells.push(cy * this.cols + cx)
        if (walk && !this.cellWalkable(cx, cy - 1)) underWallCells.push(cy * this.cols + cx)
        if (
          walk &&
          this.cellWalkable(cx - 1, cy) && this.cellWalkable(cx + 1, cy) &&
          this.cellWalkable(cx, cy - 1) && this.cellWalkable(cx, cy + 1)
        ) interiorCells.push(cy * this.cols + cx)
      }
    }

    const shuffle = <T,>(arr: T[]): T[] => arr.sort(() => Math.random() - 0.5)
    const farFromObstacles = (x: number, y: number, min: number) =>
      this.obstacles.every((o) => Math.hypot(o.x - x, o.y - y) >= min)

    // Gros graffitis néon sur les façades (densité scalée par le profil qualité)
    const graffitiCap = Math.round(Math.min(40, facadeCells.length * 0.5) * this.density)
    for (const i of shuffle(facadeCells.slice())) {
      if (this.decals.length >= graffitiCap) break
      const c = this.cellCenter(i)
      this.decals.push({
        x: c.x + (Math.random() - 0.5) * 60,
        y: c.y + 20 + Math.random() * 40,
        txt: GRAFFITI_WORDS[(Math.random() * GRAFFITI_WORDS.length) | 0],
        col: NEONS[(Math.random() * 4) | 0],
        sz: 26 + Math.random() * 30,
        rot: (Math.random() - 0.5) * 0.12,
        a: 0.38 + Math.random() * 0.25,
      })
    }
    // Tags discrets au sol (hors arène : son sol est autoré, pas aléatoire)
    const floorTagCount = Math.round(Math.min(26, (this.walkCells.length / 12) | 0) * this.density)
    for (let i = 0; i < floorTagCount; i++) {
      const c = this.cellCenter(this.walkCells[(Math.random() * this.walkCells.length) | 0])
      if (this.inArena(c.x, c.y)) continue
      this.decals.push({
        x: c.x + (Math.random() - 0.5) * CELL,
        y: c.y + (Math.random() - 0.5) * CELL,
        txt: GRAFFITI_WORDS[(Math.random() * GRAFFITI_WORDS.length) | 0],
        col: NEONS[(Math.random() * 4) | 0],
        sz: 14 + Math.random() * 26,
        rot: (Math.random() - 0.5) * 0.5,
        a: 0.09 + Math.random() * 0.12,
      })
    }
    // Panneaux de rue sur les longues façades (2 cellules mini)
    let signBudget = 4
    for (const i of shuffle(facadeCells.slice())) {
      if (signBudget <= 0) break
      const cx = i % this.cols
      const cy = Math.floor(i / this.cols)
      if (!facadeCells.includes(i + 1) || cx + 1 >= this.cols) continue
      this.signs.push({
        x: (cx + 1) * CELL,
        y: cy * CELL + 64,
        txt: SIGN_NAMES[(Math.random() * SIGN_NAMES.length) | 0],
      })
      signBudget--
    }
    // Logo BLANC au sol : un seul exemplaire par niveau, peint au point de départ
    // (le joueur démarre dessus, comme une marque de spawn à la bombe).
    this.floorLogo = { x: this.spawnX, y: this.spawnY, w: 220, rot: (Math.random() - 0.5) * 0.2 }

    // Logos muraux sur les façades : le blanc se bombe directement sur la brique,
    // le noir repose TOUJOURS sur un carré blanc (consigne d'usage de la marque).
    let logoBudget = 6
    let whiteTurn = true
    for (const i of shuffle(facadeCells.slice())) {
      if (logoBudget <= 0) break
      const c = this.cellCenter(i)
      if (this.signs.some((s) => Math.hypot(s.x - c.x, s.y - c.y) < 220)) continue
      if (this.wallLogos.some((l) => Math.hypot(l.x - c.x, l.y - c.y) < CELL * 2.5)) continue
      this.wallLogos.push({ x: c.x, y: c.y - 8, w: whiteTurn ? 104 : 72, variant: whiteTurn ? 'white' : 'black' })
      whiteTurn = !whiteTurn
      logoBudget--
    }
    // Dégage les graffitis d'ambiance autour des logos muraux (pas de recouvrement).
    this.decals = this.decals.filter((d) => this.wallLogos.every((l) => Math.hypot(d.x - l.x, d.y - l.y) > 130))

    // Flaques avec reflets néon (hors arène, même raison)
    const puddleCount = Math.round(Math.min(16, (this.walkCells.length / 18) | 0) * this.density)
    for (let i = 0; i < puddleCount; i++) {
      const c = this.cellCenter(this.walkCells[(Math.random() * this.walkCells.length) | 0])
      if (this.inArena(c.x, c.y)) continue
      this.puddles.push({
        x: c.x + (Math.random() - 0.5) * CELL * 0.8,
        y: c.y + (Math.random() - 0.5) * CELL * 0.8,
        r: 26 + Math.random() * 46,
        col: NEONS[(Math.random() * 4) | 0],
      })
    }
    // Piliers en intérieur de zone (obstacles circulaires)
    let pillarBudget = Math.min(8, Math.max(3, (interiorCells.length / 6) | 0))
    for (const i of shuffle(interiorCells.slice())) {
      if (pillarBudget <= 0) break
      const c = this.cellCenter(i)
      if (Math.hypot(c.x - this.spawnX, c.y - this.spawnY) < 380) continue
      if (this.inArena(c.x, c.y, CELL * 0.5)) continue // l'arène reste dégagée
      if (!farFromObstacles(c.x, c.y, CELL * 1.6)) continue
      this.pillars.push({ x: c.x, y: c.y })
      this.obstacles.push({ x: c.x, y: c.y, r: 38 })
      pillarBudget--
    }
    // Bancs adossés aux façades
    let benchBudget = Math.min(7, Math.max(2, (underWallCells.length / 7) | 0))
    for (const i of shuffle(underWallCells.slice())) {
      if (benchBudget <= 0) break
      const c = this.cellCenter(i)
      const bx = c.x
      const by = c.y - CELL / 2 + 40 // contre le mur du haut
      if (Math.hypot(bx - this.spawnX, by - this.spawnY) < 340) continue
      if (this.inArena(bx, by, CELL * 0.5)) continue // l'arène reste dégagée
      if (!farFromObstacles(bx, by, CELL * 1.2)) continue
      this.benches.push({ x: bx, y: by })
      this.obstacles.push({ x: bx - 34, y: by, r: 24 }, { x: bx + 34, y: by, r: 24 })
      benchBudget--
    }
    // Mobilier urbain data-driven : une passe par entrée du registre PROP_DEFS.
    // Même logique que piliers/bancs : shuffle + budget + évitement (spawn,
    // obstacles déjà posés) ; les colliders vont dans this.obstacles AVANT
    // buildObstacleBuckets(), donc pushOut les prend en compte gratuitement.
    for (const def of PROP_DEFS) {
      const cells = def.zone === 'wall' ? underWallCells : this.walkCells
      let budget = Math.round(Math.min(def.cap, (cells.length / def.per) | 0) * this.density)
      for (const i of shuffle(cells.slice())) {
        if (budget <= 0) break
        const c = this.cellCenter(i)
        const px = c.x + (Math.random() - 0.5) * (def.zone === 'wall' ? 40 : CELL * 0.5)
        const py = def.zone === 'wall'
          ? c.y - CELL / 2 + (def.wallOffset ?? 40)
          : c.y + (Math.random() - 0.5) * CELL * 0.5
        if (Math.hypot(px - this.spawnX, py - this.spawnY) < def.spawnDist) continue
        if (this.inArena(px, py, CELL * 0.5)) continue // l'arène reste dégagée
        if (!farFromObstacles(px, py, def.spacing)) continue
        // Props de rue : rester entièrement sur du sol jouable (pas à cheval sur un mur).
        if (def.zone === 'floor' && !this.circleFits(px, py, 30)) continue
        const flip = Math.random() < 0.5 ? -1 : 1
        this.props.push({ key: def.key, x: px, y: py, flip })
        for (const cir of def.circles) this.obstacles.push({ x: px + cir.dx * flip, y: py - 4, r: cir.r })
        budget--
      }
    }

    // ---- Décor AUTORÉ de l'arène néon (le reste de la salle est volontairement
    // vide : le lieu se lit par son sol, pas par l'encombrement) ----
    if (this.arena) {
      const a = this.arena
      const acx = (a.x0 + a.x1) / 2
      const acy = (a.y0 + a.y1) / 2
      // Pièce maîtresse : logo EHYO géant bombé au centre (blanc, consigne de marque)
      this.arenaLogo = { x: acx, y: acy, w: 480, rot: (Math.random() - 0.5) * 0.06 }
      // Tags aux quatre coins intérieurs : magenta (accent arène) / cyan (signature)
      const inset = CELL * 1.7
      const corners: [number, number][] = [
        [a.x0 + inset, a.y0 + inset], [a.x1 - inset, a.y0 + inset],
        [a.x1 - inset, a.y1 - inset], [a.x0 + inset, a.y1 - inset],
      ]
      for (let k = 0; k < 4; k++) {
        this.decals.push({
          x: corners[k][0], y: corners[k][1],
          txt: GRAFFITI_WORDS[(Math.random() * GRAFFITI_WORDS.length) | 0],
          col: k % 2 ? '#00eaff' : '#ff00cc',
          sz: 42, rot: (Math.random() - 0.5) * 0.24, a: 0.55,
        })
      }
      // Enseigne dédiée sur la façade nord (seulement si c'est bien un mur :
      // un chunk ultérieur peut, rarement, avoir creusé au-dessus de l'arène).
      if (!this.walkableAt(acx, a.y0 - CELL / 2)) {
        this.signs.push({ x: acx, y: a.y0 - CELL + 64, txt: 'NEON ARENA' })
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Décor statique pré-rendu : tuiles offscreen + cache LRU
  // ---------------------------------------------------------------------------

  // Fournit les assets nécessaires au bake (motif béton + logos). Invalide le
  // cache : les tuiles seront re-rendues à la demande avec les nouveaux assets.
  setStaticAssets(pattern: CanvasPattern, logos: LogoKit): void {
    this.pattern = pattern
    this.logos = logos
    this.invalidateStatic()
  }

  // À appeler quand un asset asynchrone arrive (police pixel, logos SVG).
  invalidateStatic(): void {
    this.tileCache.clear()
  }

  // Blitte les tuiles visibles (les rend à la demande, cache LRU borné).
  drawStatic(ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number, frame: number): void {
    const tilesY = Math.ceil(this.H / TILE)
    const t0x = Math.max(0, Math.floor(camX / TILE))
    const t1x = Math.min(this.tilesX - 1, Math.floor((camX + vw) / TILE))
    const t0y = Math.max(0, Math.floor(camY / TILE))
    const t1y = Math.min(tilesY - 1, Math.floor((camY + vh) / TILE))
    for (let ty = t0y; ty <= t1y; ty++) {
      for (let tx = t0x; tx <= t1x; tx++) {
        const key = ty * this.tilesX + tx
        let entry = this.tileCache.get(key)
        if (!entry) {
          entry = { cv: this.renderTile(tx, ty), last: frame }
          this.tileCache.set(key, entry)
          this.evictTiles()
        }
        entry.last = frame
        ctx.drawImage(entry.cv, tx * TILE, ty * TILE)
      }
    }
  }

  // Éviction LRU : borne la mémoire du cache (~20 tuiles de 512²).
  private evictTiles(): void {
    while (this.tileCache.size > TILE_CACHE_MAX) {
      let oldestKey = -1
      let oldest = Infinity
      for (const [k, e] of this.tileCache) {
        if (e.last < oldest) {
          oldest = e.last
          oldestKey = k
        }
      }
      if (oldestKey < 0) return
      this.tileCache.delete(oldestKey)
    }
  }

  // Rend UNE tuile du décor statique : cellules (sol/façades/toits), arêtes,
  // logo au sol, flaques, panneaux, logos muraux, graffitis. Tout ce qui était
  // redessiné chaque frame ne coûte désormais qu'un drawImage.
  private renderTile(tx: number, ty: number): HTMLCanvasElement {
    const cv = document.createElement('canvas')
    cv.width = TILE
    cv.height = TILE
    const ctx = cv.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    const ox = tx * TILE
    const oy = ty * TILE
    ctx.translate(-ox, -oy)

    // Fond toit par défaut (couvre aussi le débord hors-monde de la dernière tuile).
    ctx.fillStyle = '#04070e'
    ctx.fillRect(ox, oy, TILE, TILE)

    const c0x = Math.max(0, Math.floor(ox / CELL))
    const c1x = Math.min(this.cols - 1, Math.floor((ox + TILE - 1) / CELL))
    const c0y = Math.max(0, Math.floor(oy / CELL))
    const c1y = Math.min(this.rows - 1, Math.floor((oy + TILE - 1) / CELL))

    // Passe 1 : sol / façades / toits / portes de secteur
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const x = cx * CELL
        const y = cy * CELL
        // Porte fermée (grille == 2) : sol de rue normal + barricade en travers.
        if (this.grid[cy * this.cols + cx] === 2) {
          if (this.pattern) {
            ctx.fillStyle = this.pattern
            ctx.fillRect(x, y, CELL, CELL)
          } else {
            ctx.fillStyle = '#232427'
            ctx.fillRect(x, y, CELL, CELL)
          }
          // Passage vertical (sol au-dessus/en-dessous) → barricade horizontale.
          this.drawGateCell(ctx, x, y, this.cellWalkable(cx, cy - 1) || this.cellWalkable(cx, cy + 1))
          continue
        }
        if (this.cellWalkable(cx, cy)) {
          if (this.pattern) {
            ctx.fillStyle = this.pattern
            ctx.fillRect(x, y, CELL, CELL)
          } else {
            ctx.fillStyle = '#232427'
            ctx.fillRect(x, y, CELL, CELL)
          }
          // Sol de l'arène : voile magenta subtil — l'accent propre à la salle
          // (bake uniquement, aucun coût par frame).
          if (this.cellInArena(cx, cy)) {
            ctx.save()
            ctx.globalAlpha = 0.055
            ctx.fillStyle = '#ff00cc'
            ctx.fillRect(x, y, CELL, CELL)
            ctx.restore()
          }
        } else if (this.cellWalkable(cx, cy + 1)) {
          this.drawFacade(ctx, x, y)
        } else {
          // Toit / vide urbain : base déjà peinte, on ajoute le grain
          if (this.pattern) {
            ctx.save()
            ctx.globalAlpha = 0.1
            ctx.fillStyle = this.pattern
            ctx.fillRect(x, y, CELL, CELL)
            ctx.restore()
          }
        }
      }
    }

    // Passe 2 : arêtes des cellules de sol (ombres portées et lisières)
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        if (!this.cellWalkable(cx, cy)) continue
        const x = cx * CELL
        const y = cy * CELL
        // Dans l'arène, le périmètre passe au néon cyan (fil conducteur charte).
        const inA = this.cellInArena(cx, cy)
        // Ombre du mur au-dessus
        if (!this.cellWalkable(cx, cy - 1)) {
          const g = ctx.createLinearGradient(0, y, 0, y + 30)
          g.addColorStop(0, 'rgba(0,0,0,.55)')
          g.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.fillStyle = g
          ctx.fillRect(x, y, CELL, 30)
          if (inA) {
            ctx.fillStyle = 'rgba(0,234,255,.16)' // halo doux baké
            ctx.fillRect(x, y, CELL, 12)
            ctx.fillStyle = 'rgba(0,234,255,.85)'
            ctx.fillRect(x, y + 1, CELL, 3)
          }
        }
        // Lisière basse : lip + ligne néon (ambre en ville, cyan dans l'arène)
        if (!this.cellWalkable(cx, cy + 1)) {
          ctx.fillStyle = '#33353b'
          ctx.fillRect(x, y + CELL - 14, CELL, 14)
          ctx.fillStyle = inA ? 'rgba(0,234,255,.75)' : 'rgba(255,170,0,.6)'
          ctx.fillRect(x, y + CELL - 10, CELL, 5)
          ctx.fillStyle = '#0a0b0d'
          ctx.fillRect(x, y + CELL - 3, CELL, 3)
        }
        // Bords latéraux : liseré sombre + ombre légère (+ néon cyan dans l'arène)
        if (!this.cellWalkable(cx - 1, cy)) {
          ctx.fillStyle = '#0a0b0d'
          ctx.fillRect(x, y, 5, CELL)
          const g = ctx.createLinearGradient(x, 0, x + 22, 0)
          g.addColorStop(0, 'rgba(0,0,0,.4)')
          g.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.fillStyle = g
          ctx.fillRect(x, y, 22, CELL)
          if (inA) {
            ctx.fillStyle = 'rgba(0,234,255,.16)'
            ctx.fillRect(x + 5, y, 10, CELL)
            ctx.fillStyle = 'rgba(0,234,255,.85)'
            ctx.fillRect(x + 5, y, 3, CELL)
          }
        }
        if (!this.cellWalkable(cx + 1, cy)) {
          ctx.fillStyle = '#0a0b0d'
          ctx.fillRect(x + CELL - 5, y, 5, CELL)
          const g = ctx.createLinearGradient(x + CELL - 22, 0, x + CELL, 0)
          g.addColorStop(0, 'rgba(0,0,0,0)')
          g.addColorStop(1, 'rgba(0,0,0,.4)')
          ctx.fillStyle = g
          ctx.fillRect(x + CELL - 22, y, 22, CELL)
          if (inA) {
            ctx.fillStyle = 'rgba(0,234,255,.16)'
            ctx.fillRect(x + CELL - 15, y, 10, CELL)
            ctx.fillStyle = 'rgba(0,234,255,.85)'
            ctx.fillRect(x + CELL - 8, y, 3, CELL)
          }
        }
      }
    }

    // Bornes de recouvrement : un élément dont l'origine est hors tuile peut
    // déborder dedans (texte tourné, logo…) → on prend une marge large.
    const px0 = ox - 280
    const px1 = ox + TILE + 280
    const py0 = oy - 280
    const py1 = oy + TILE + 280
    const inReach = (x: number, y: number) => x > px0 && x < px1 && y > py0 && y < py1

    // Logo blanc peint au sol (unique par niveau)
    if (this.floorLogo && this.logos?.white && inReach(this.floorLogo.x, this.floorLogo.y)) {
      const f = this.floorLogo
      const h = f.w * 0.75
      ctx.save()
      ctx.translate(f.x, f.y)
      ctx.rotate(f.rot)
      ctx.globalAlpha = 0.5
      ctx.drawImage(this.logos.white, -f.w / 2, -h / 2, f.w, h)
      ctx.restore()
    }

    // Pièce maîtresse de l'arène : anneau magenta + logo EHYO géant au centre.
    // Marge de recouvrement dédiée (l'anneau déborde bien au-delà des 280 px
    // de la marge standard).
    if (this.arenaLogo) {
      const alg = this.arenaLogo
      const reach = 620
      if (alg.x > ox - reach && alg.x < ox + TILE + reach && alg.y > oy - reach && alg.y < oy + TILE + reach) {
        // Anneau double (trait net + halo large), accent magenta de l'arène
        ctx.save()
        ctx.strokeStyle = '#ff00cc'
        ctx.globalAlpha = 0.13
        ctx.lineWidth = 18
        ctx.beginPath()
        ctx.arc(alg.x, alg.y, 300, 0, 7)
        ctx.stroke()
        ctx.globalAlpha = 0.42
        ctx.lineWidth = 5
        ctx.beginPath()
        ctx.arc(alg.x, alg.y, 300, 0, 7)
        ctx.stroke()
        // Graduations cyan aux quatre points cardinaux de l'anneau
        ctx.fillStyle = '#00eaff'
        ctx.globalAlpha = 0.6
        ctx.fillRect(alg.x - 3, alg.y - 316, 6, 32)
        ctx.fillRect(alg.x - 3, alg.y + 284, 6, 32)
        ctx.fillRect(alg.x - 316, alg.y - 3, 32, 6)
        ctx.fillRect(alg.x + 284, alg.y - 3, 32, 6)
        ctx.restore()
        // Logo EHYO géant bombé au sol (blanc, comme la marque de spawn)
        if (this.logos?.white) {
          const h = alg.w * 0.75
          ctx.save()
          ctx.translate(alg.x, alg.y)
          ctx.rotate(alg.rot)
          ctx.globalAlpha = 0.55
          ctx.drawImage(this.logos.white, -alg.w / 2, -h / 2, alg.w, h)
          ctx.restore()
        }
      }
    }

    // Flaques (reflets néon au sol)
    for (const pd of this.puddles) {
      if (!inReach(pd.x, pd.y)) continue
      ctx.save()
      ctx.globalAlpha = 0.15
      ctx.fillStyle = pd.col
      ctx.beginPath()
      ctx.ellipse(pd.x, pd.y, pd.r, pd.r * 0.28, 0, 0, 7)
      ctx.fill()
      ctx.restore()
    }

    // Panneaux de rue sur les façades
    ctx.textAlign = 'center'
    for (const s of this.signs) {
      if (!inReach(s.x, s.y)) continue
      const w = 24 + s.txt.length * 11
      ctx.fillStyle = '#0c0d10'
      ctx.fillRect(s.x - w / 2 - 3, s.y - 3, w + 6, 46)
      ctx.fillStyle = '#e9e6dc'
      ctx.fillRect(s.x - w / 2, s.y, w, 40)
      ctx.fillStyle = '#15171b'
      ctx.font = "10px 'Press Start 2P', monospace"
      ctx.fillText(s.txt, s.x, s.y + 25)
    }
    ctx.textAlign = 'left'

    // Logos muraux sur les façades
    if (this.logos) {
      for (const lg of this.wallLogos) {
        if (!inReach(lg.x, lg.y)) continue
        const img = lg.variant === 'white' ? this.logos.white : this.logos.black
        if (!img) continue
        const h = lg.w * 0.75
        if (lg.variant === 'black') {
          // Consigne de marque : le logo noir repose toujours sur un carré blanc.
          const s = lg.w + 22
          ctx.fillStyle = '#0c0d10'
          ctx.fillRect(lg.x - s / 2 - 3, lg.y - s / 2 - 3, s + 6, s + 6)
          ctx.fillStyle = '#f4f6f7'
          ctx.fillRect(lg.x - s / 2, lg.y - s / 2, s, s)
          ctx.drawImage(img, lg.x - lg.w / 2, lg.y - h / 2, lg.w, h)
        } else {
          // Blanc : bombé directement sur la brique
          ctx.save()
          ctx.globalAlpha = 0.88
          ctx.drawImage(img, lg.x - lg.w / 2, lg.y - h / 2, lg.w, h)
          ctx.restore()
        }
      }
    }

    // Graffitis d'ambiance (texte : bakés une fois ici, plus jamais par frame)
    for (const d of this.decals) {
      if (!inReach(d.x, d.y)) continue
      ctx.save()
      ctx.translate(d.x, d.y)
      ctx.rotate(d.rot)
      ctx.globalAlpha = d.a
      ctx.font = `${d.sz}px 'Press Start 2P', monospace`
      ctx.fillStyle = d.col
      ctx.fillText(d.txt, 0, 0)
      ctx.restore()
    }

    return cv
  }

  // Barricade de porte fermée, bakée dans la tuile : bandes obliques rouge
  // glitch/noir (danger), liseré cyan, plaque « CLOSED ». horiz = barre en
  // travers d'un passage vertical ; sinon barre verticale (passage horizontal).
  private drawGateCell(ctx: CanvasRenderingContext2D, x: number, y: number, horiz: boolean): void {
    const cx = x + CELL / 2
    const cy = y + CELL / 2
    ctx.save()
    ctx.translate(cx, cy)
    if (!horiz) ctx.rotate(Math.PI / 2)
    // Halo au sol (danger diffus) + base sombre de la barre
    ctx.globalAlpha = 0.12
    ctx.fillStyle = '#ff004c'
    ctx.fillRect(-CELL / 2, -30, CELL, 60)
    ctx.globalAlpha = 1
    ctx.fillStyle = '#101214'
    ctx.fillRect(-CELL / 2, -17, CELL, 34)
    // Bandes obliques rouge glitch / noir (clip sur la barre)
    ctx.beginPath()
    ctx.rect(-CELL / 2, -17, CELL, 34)
    ctx.clip()
    for (let s = -CELL; s < CELL; s += 26) {
      ctx.fillStyle = ((s / 26) | 0) % 2 ? '#17181c' : '#ff004c'
      ctx.beginPath()
      ctx.moveTo(s, 17)
      ctx.lineTo(s + 13, 17)
      ctx.lineTo(s + 13 + 20, -17)
      ctx.lineTo(s + 20, -17)
      ctx.closePath()
      ctx.fill()
    }
    // Liseré supérieur cyan (fil conducteur charte)
    ctx.fillStyle = 'rgba(0,234,255,.8)'
    ctx.fillRect(-CELL / 2, -17, CELL, 3)
    // Montants latéraux
    ctx.fillStyle = '#0c0d10'
    ctx.fillRect(-CELL / 2, -22, 8, 44)
    ctx.fillRect(CELL / 2 - 8, -22, 8, 44)
    ctx.restore()
    // Plaque « CLOSED » toujours horizontale (lisible quelle que soit l'orientation)
    ctx.fillStyle = '#0c0d10'
    ctx.fillRect(cx - 46, cy - 9, 92, 18)
    ctx.fillStyle = '#ff004c'
    ctx.font = "10px 'Press Start 2P', monospace"
    ctx.textAlign = 'center'
    ctx.fillText('CLOSED', cx, cy + 4)
    ctx.textAlign = 'left'
  }

  // Façade de brique avec assises, bandeau et pied de mur.
  private drawFacade(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.fillStyle = '#10131b'
    ctx.fillRect(x, y, CELL, CELL)
    // assises de briques
    ctx.strokeStyle = 'rgba(255,255,255,.055)'
    ctx.lineWidth = 2
    for (let ty = y + 26; ty < y + CELL - 30; ty += 26) {
      ctx.beginPath()
      ctx.moveTo(x, ty)
      ctx.lineTo(x + CELL, ty)
      ctx.stroke()
    }
    for (let row = 0; row < 5; row++) {
      const ty = y + row * 26
      const offx = (row % 2) * 23
      for (let tx = x + offx; tx < x + CELL; tx += 46) {
        ctx.beginPath()
        ctx.moveTo(tx, ty)
        ctx.lineTo(tx, Math.min(ty + 26, y + CELL - 30))
        ctx.stroke()
      }
    }
    // bandeau coloré + pied de mur
    ctx.fillStyle = '#420f38'
    ctx.fillRect(x, y + CELL - 28, CELL, 10)
    ctx.fillStyle = '#0a0b0d'
    ctx.fillRect(x, y + CELL - 8, CELL, 8)
  }
}

// Génère un niveau complet (relance l'assemblage si le parcours se bloque trop tôt).
// 12 chunks après cross+arène : le monde est découpé en secteurs (portes GATE_AT).
export function generateLevel(opts?: LevelOpts): Level {
  const density = opts?.decalDensity ?? 1
  let best: BuildResult | null = null
  for (let attempt = 0; attempt < 10; attempt++) {
    const build = tryBuild(12)
    if (build.placed.length >= 6) return new Level(build, density)
    if (!best || build.placed.length > best.placed.length) best = build
  }
  // Filet de sécurité : on garde le meilleur parcours obtenu (le chunk de départ
  // réussit toujours, donc `best` n'est jamais null).
  return new Level(best!, density)
}
