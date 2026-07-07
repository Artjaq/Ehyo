// Génération de niveau par chunks composables sur une grille de cellules.
// Remplace l'arène rectangulaire codée en dur du prototype : le monde est un réseau
// de rues (couloirs, virages, carrefours, places) assemblé bout à bout à chaque run.
//
// Principe :
//  - Chaque chunk = motif ASCII de cellules ('.' sol jouable, '#' vide/bâtiment)
//    défini UNE fois en orientation canonique (entrée côté Ouest), puis tourné
//    par quarts de tour selon la direction d'assemblage.
//  - L'assembleur avance de port en port : la sortie du chunk N devient l'entrée
//    du chunk N+1. Les sorties non utilisées deviennent des culs-de-sac naturels.
//  - Le résultat est "baké" en grille dense pour des requêtes O(1) : collision,
//    spawn, flow field (guidage des ennemis autour des angles).

import { NEONS } from './sprites'

// Taille d'une cellule en pixels monde. Couloir standard = 4 cellules (640 px),
// ruelle = 2 cellules (320 px) : assez large pour esquiver une horde.
export const CELL = 160

type Side = 'N' | 'S' | 'E' | 'W'

interface Port {
  side: Side
  at: number // index de la première cellule du span (ligne ou colonne selon le côté)
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

interface BuildResult {
  carved: Map<string, true>
  placed: PlacedChunk[]
  spawnCell: { cx: number; cy: number }
}

// Assemble une suite de chunks en avançant de port en port.
function tryBuild(targetChunks: number): BuildResult {
  const carved = new Map<string, true>()
  const placed: PlacedChunk[] = []

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

  for (let n = 0; n < targetChunks; n++) {
    // Tirage pondéré avec anti-répétition simple.
    const weights: Record<string, number> = { corridor: 3, turnS: 2, turnN: 2, cross: 1.4, alleyPlaza: 1.6 }
    if (lastName in weights) weights[lastName] *= 0.35

    // Essaie plusieurs candidats avant d'abandonner ce port.
    const candidates = Object.keys(weights).sort(() => Math.random() - 0.5)
    candidates.unshift(pickWeighted(weights)) // le favori d'abord

    let placedOne = false
    for (const name of candidates) {
      const def = CHUNK_LIB.find((c) => c.name === name)!
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
      if (!stamp(rc, ox, oy)) continue

      // Prochaine sortie : au hasard parmi les exits du chunk posé.
      const exit = rc.exits[Math.floor(Math.random() * rc.exits.length)]
      open = toWorldPort(rc, ox, oy, exit)
      lastName = name
      placedOne = true
      break
    }
    if (!placedOne) break // parcours bloqué : le niveau se termine en cul-de-sac
  }

  return { carved, placed, spawnCell }
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
export interface Puddle { x: number; y: number; r: number; col: string }
export interface Obstacle { x: number; y: number; r: number }
export interface Pillar { x: number; y: number }
export interface Bench { x: number; y: number }

const GRAFFITI_WORDS = ['REX', 'ZK', 'VYBE', 'OMEN', 'SL8', 'KAPO', 'NÎM', 'FLUX', '13', 'WAKE']
const SIGN_NAMES = ['NORTHGATE', 'CANAL ROW', '13TH ALLEY', 'MARKET SQ', 'DOCK ST']

// ---------------------------------------------------------------------------
// Niveau finalisé : grille dense + requêtes gameplay + rendu du décor
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
  chunkNames: string[] = [] // pour debug/inspection

  private walkCells: number[] = [] // indices de cellules jouables (spawn sampling)
  private flow: Int32Array // distance BFS au joueur, -1 = non atteint
  private flowQueue: Int32Array

  constructor(build: BuildResult) {
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
    this.spawnX = (build.spawnCell.cx - minX + margin + 0.5) * CELL
    this.spawnY = (build.spawnCell.cy - minY + margin + 0.5) * CELL
    this.chunkNames = build.placed.map((p) => p.name)

    this.flow = new Int32Array(this.cols * this.rows).fill(-1)
    this.flowQueue = new Int32Array(this.cols * this.rows)

    for (let i = 0; i < this.grid.length; i++) if (this.grid[i]) this.walkCells.push(i)

    this.generateDecor()
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
  // Remplace le clamp rectangulaire du prototype ; conserve le feeling "slide".
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

  // ---- Flow field : BFS depuis le joueur, recalculé à intervalle par le moteur.
  // Guide les ennemis au sol autour des angles (sinon ils collent aux murs).
  computeFlow(px: number, py: number): void {
    this.flow.fill(-1)
    const sx = Math.floor(px / CELL)
    const sy = Math.floor(py / CELL)
    if (!this.cellWalkable(sx, sy)) return
    let head = 0
    let tail = 0
    const startIdx = sy * this.cols + sx
    this.flow[startIdx] = 0
    this.flowQueue[tail++] = startIdx
    while (head < tail) {
      const i = this.flowQueue[head++]
      const d = this.flow[i]
      const cx = i % this.cols
      const cy = Math.floor(i / this.cols)
      // 4 voisins orthogonaux
      const neighbors = [
        [cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1],
      ]
      for (const [nx, ny] of neighbors) {
        if (!this.cellWalkable(nx, ny)) continue
        const ni = ny * this.cols + nx
        if (this.flow[ni] !== -1) continue
        this.flow[ni] = d + 1
        this.flowQueue[tail++] = ni
      }
    }
  }

  // Direction à suivre depuis (x, y) pour se rapprocher du joueur via le réseau.
  // null = viser le joueur en ligne droite (même cellule, ou flow indisponible).
  steer(x: number, y: number): { x: number; y: number } | null {
    const cx = Math.floor(x / CELL)
    const cy = Math.floor(y / CELL)
    if (!this.cellWalkable(cx, cy)) return null
    const i = cy * this.cols + cx
    const d = this.flow[i]
    if (d <= 0) return null
    let best = -1
    let bestD = d
    const neighbors = [
      [cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1],
    ]
    for (const [nx, ny] of neighbors) {
      if (!this.cellWalkable(nx, ny)) continue
      const ni = ny * this.cols + nx
      const nd = this.flow[ni]
      if (nd !== -1 && nd < bestD) {
        bestD = nd
        best = ni
      }
    }
    if (best === -1) return null
    const t = this.cellCenter(best)
    const dx = t.x - x
    const dy = t.y - y
    const m = Math.hypot(dx, dy) || 1
    return { x: dx / m, y: dy / m }
  }

  // Point de spawn au sol : cellule jouable dans un anneau de distance autour du
  // joueur, de préférence hors champ de la caméra.
  randomSpawnPoint(
    px: number, py: number, rmin: number, rmax: number,
    camX: number, camY: number, vw: number, vh: number,
  ): { x: number; y: number } | null {
    const n = this.walkCells.length
    if (!n) return null
    for (let t = 0; t < 40; t++) {
      const c = this.cellCenter(this.walkCells[(Math.random() * n) | 0])
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

  // ---- Décor : graffitis, panneaux, flaques, piliers, bancs ----
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

    // Gros graffitis néon sur les façades
    for (const i of shuffle(facadeCells.slice())) {
      if (this.decals.length >= Math.min(40, facadeCells.length * 0.5)) break
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
    // Tags discrets au sol
    const floorTagCount = Math.min(26, (this.walkCells.length / 12) | 0)
    for (let i = 0; i < floorTagCount; i++) {
      const c = this.cellCenter(this.walkCells[(Math.random() * this.walkCells.length) | 0])
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
    // Flaques avec reflets néon
    const puddleCount = Math.min(16, (this.walkCells.length / 18) | 0)
    for (let i = 0; i < puddleCount; i++) {
      const c = this.cellCenter(this.walkCells[(Math.random() * this.walkCells.length) | 0])
      this.puddles.push({
        x: c.x + (Math.random() - 0.5) * CELL * 0.8,
        y: c.y + (Math.random() - 0.5) * CELL * 0.8,
        r: 26 + Math.random() * 46,
        col: NEONS[(Math.random() * 4) | 0],
      })
    }
    // Piliers en intérieur de zone (obstacles circulaires, comme le prototype)
    let pillarBudget = Math.min(8, Math.max(3, (interiorCells.length / 6) | 0))
    for (const i of shuffle(interiorCells.slice())) {
      if (pillarBudget <= 0) break
      const c = this.cellCenter(i)
      if (Math.hypot(c.x - this.spawnX, c.y - this.spawnY) < 380) continue
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
      if (!farFromObstacles(bx, by, CELL * 1.2)) continue
      this.benches.push({ x: bx, y: by })
      this.obstacles.push({ x: bx - 34, y: by, r: 24 }, { x: bx + 34, y: by, r: 24 })
      benchBudget--
    }
  }

  // ---- Rendu du décor (sol, façades, toits, arêtes) avec culling caméra ----
  draw(
    ctx: CanvasRenderingContext2D,
    camX: number, camY: number, vw: number, vh: number,
    tilePattern: CanvasPattern,
  ): void {
    const c0x = Math.max(0, Math.floor((camX - 8) / CELL))
    const c1x = Math.min(this.cols - 1, Math.floor((camX + vw + 8) / CELL))
    const c0y = Math.max(0, Math.floor((camY - 8) / CELL))
    const c1y = Math.min(this.rows - 1, Math.floor((camY + vh + 8) / CELL))

    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const x = cx * CELL
        const y = cy * CELL
        if (this.cellWalkable(cx, cy)) {
          // Sol en béton
          ctx.fillStyle = tilePattern
          ctx.fillRect(x, y, CELL, CELL)
        } else if (this.cellWalkable(cx, cy + 1)) {
          // Façade d'immeuble (mur visible car du sol passe juste dessous)
          this.drawFacade(ctx, x, y)
        } else {
          // Toit / vide urbain
          ctx.fillStyle = '#0b0c0f'
          ctx.fillRect(x, y, CELL, CELL)
          ctx.save()
          ctx.globalAlpha = 0.1
          ctx.fillStyle = tilePattern
          ctx.fillRect(x, y, CELL, CELL)
          ctx.restore()
        }
      }
    }

    // Arêtes des cellules de sol : ombres portées et lisières
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        if (!this.cellWalkable(cx, cy)) continue
        const x = cx * CELL
        const y = cy * CELL
        // Ombre du mur au-dessus (comme la back wall du prototype)
        if (!this.cellWalkable(cx, cy - 1)) {
          const g = ctx.createLinearGradient(0, y, 0, y + 30)
          g.addColorStop(0, 'rgba(0,0,0,.55)')
          g.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.fillStyle = g
          ctx.fillRect(x, y, CELL, 30)
        }
        // Lisière basse : lip + ligne jaune (ADN du quai de métro)
        if (!this.cellWalkable(cx, cy + 1)) {
          ctx.fillStyle = '#33353b'
          ctx.fillRect(x, y + CELL - 14, CELL, 14)
          ctx.fillStyle = 'rgba(232,255,51,.55)'
          ctx.fillRect(x, y + CELL - 10, CELL, 5)
          ctx.fillStyle = '#0a0b0d'
          ctx.fillRect(x, y + CELL - 3, CELL, 3)
        }
        // Bords latéraux : liseré sombre + ombre légère
        if (!this.cellWalkable(cx - 1, cy)) {
          ctx.fillStyle = '#0a0b0d'
          ctx.fillRect(x, y, 5, CELL)
          const g = ctx.createLinearGradient(x, 0, x + 22, 0)
          g.addColorStop(0, 'rgba(0,0,0,.4)')
          g.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.fillStyle = g
          ctx.fillRect(x, y, 22, CELL)
        }
        if (!this.cellWalkable(cx + 1, cy)) {
          ctx.fillStyle = '#0a0b0d'
          ctx.fillRect(x + CELL - 5, y, 5, CELL)
          const g = ctx.createLinearGradient(x + CELL - 22, 0, x + CELL, 0)
          g.addColorStop(0, 'rgba(0,0,0,0)')
          g.addColorStop(1, 'rgba(0,0,0,.4)')
          ctx.fillStyle = g
          ctx.fillRect(x + CELL - 22, y, 22, CELL)
        }
      }
    }

    // Flaques (reflets néon au sol)
    for (const pd of this.puddles) {
      if (pd.x < camX - 100 || pd.x > camX + vw + 100 || pd.y < camY - 100 || pd.y > camY + vh + 100) continue
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
      if (s.x < camX - 200 || s.x > camX + vw + 200 || s.y < camY - 120 || s.y > camY + vh + 120) continue
      const w = 30 + s.txt.length * 15
      ctx.fillStyle = '#0c0d10'
      ctx.fillRect(s.x - w / 2 - 3, s.y - 3, w + 6, 46)
      ctx.fillStyle = '#e9e6dc'
      ctx.fillRect(s.x - w / 2, s.y, w, 40)
      ctx.fillStyle = '#15171b'
      ctx.font = "700 17px 'Silkscreen', monospace"
      ctx.fillText(s.txt, s.x, s.y + 27)
    }
    ctx.textAlign = 'left'
  }

  // Façade de brique avec assises, bandeau et pied de mur.
  private drawFacade(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.fillStyle = '#141519'
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
    ctx.fillStyle = '#4b1230'
    ctx.fillRect(x, y + CELL - 28, CELL, 10)
    ctx.fillStyle = '#0a0b0d'
    ctx.fillRect(x, y + CELL - 8, CELL, 8)
  }
}

// Génère un niveau complet (relance l'assemblage si le parcours se bloque trop tôt).
export function generateLevel(): Level {
  let best: BuildResult | null = null
  for (let attempt = 0; attempt < 10; attempt++) {
    const build = tryBuild(8)
    if (build.placed.length >= 6) return new Level(build)
    if (!best || build.placed.length > best.placed.length) best = build
  }
  // Filet de sécurité : on garde le meilleur parcours obtenu (le chunk de départ
  // réussit toujours, donc `best` n'est jamais null).
  return new Level(best!)
}
