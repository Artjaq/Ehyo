// Moteur du jeu : boucle rAF, entrées, entités, combat, rendu Canvas 2D.
//
// Optimisation mobile — principes appliqués dans ce fichier :
//  - Profil de qualité centralisé (quality.ts) : DPR plafonné, budget d'ennemis,
//    politique de halos/ombres, budget de particules — détecté au runtime, avec un
//    moniteur de FPS qui dégrade dynamiquement (perfLevel 0→2) si ça rame.
//  - ZÉRO allocation dans le hot path : toutes les entités sont poolées
//    (swap-remove, jamais de splice/push par frame), le tri en profondeur réutilise
//    un tableau persistant (pas de closures), le HUD réutilise le même objet.
//  - Culling viewport de TOUTES les entités (ennemis, orbes, splats, tirs, bombes,
//    particules) avec la marge du profil.
//  - Collisions tirs↔ennemis via un hash spatial (têtes de liste par cellule,
//    Int32Array) reconstruit chaque frame ; pushOut passe par les buckets
//    statiques du niveau.
//  - Le décor statique est blitté depuis les tuiles pré-rendues de level.ts.
//
// IMPORTANT : tout l'état vit ici, jamais dans la réactivité Vue. La communication
// avec le composant passe par des hooks basse fréquence + un hook HUD par frame.

import { buildGlows, buildProps, buildSprites, buildTile, drawSprite, NEONS, type BakedSprite } from './sprites'
import { CELL, generateLevel, Level, type LogoKit, type PropInst } from './level'
import {
  detectProfile,
  FRAME_BUDGET_MS,
  MAX_PERF_LEVEL,
  SLOW_GRACE_S,
  type GlowMode,
  type QualityProfile,
} from './quality'
import logoBlackUrl from '../src/logo-black.svg'

// ---------------------------------------------------------------------------
// Types publics (contrat moteur ↔ composant Vue)
// ---------------------------------------------------------------------------
export interface HudState {
  hpPct: number
  hp: number
  paint: number
  paintPct: number // progression vers le prochain palier (100 si tout débloqué)
  nextCost: number | null // coût du prochain déblocage, null si tout est ouvert
  time: string
  kills: number
  bossPct: number // HP du boss en % ; -1 = pas de boss actif (barre masquée)
}

export interface WeaponUi {
  id: string
  slot: number // 1..4 (touche clavier associée)
  name: string
  tag: string
  color: string
  cost: number
  unlocked: boolean
  active: boolean
}

export interface UnlockInfo {
  name: string
  color: string
  slot: number
}

// Ouverture d'un secteur (porte tombée) : compte en SECTEURS, S0 inclus.
export interface ZoneInfo {
  opened: number // secteurs accessibles après l'ouverture
  total: number // secteurs du niveau (portes + 1)
  cache: boolean // une récompense de zone attend dans le nouveau secteur
}

export interface GameOverStats {
  time: string
  kills: number
  paint: number
}

export interface EngineHooks {
  hud(h: HudState): void
  weapons(list: WeaponUi[]): void // à chaque déblocage / changement d'arme
  unlock(info: UnlockInfo): void // toast "nouvelle arme"
  zone(info: ZoneInfo): void // toast "zone ouverte" (rare : 3 fois par run max)
  gameOver(stats: GameOverStats): void
}

export interface EngineOptions {
  wrap: HTMLElement
  canvas: HTMLCanvasElement
  // Deux paires d'éléments joystick : gauche = déplacement, droite = visée/tir.
  moveJoyBase: HTMLElement
  moveJoyStick: HTMLElement
  aimJoyBase: HTMLElement
  aimJoyStick: HTMLElement
  hooks: EngineHooks
  neon?: string
  difficulty?: 'easy' | 'normal' | 'hard'
  quality?: 'auto' | 'mobile' | 'desktop' // override du profil (défaut : détection)
}

// ---------------------------------------------------------------------------
// Armes : débloquées par paliers de peinture cumulée, switch manuel 1-4.
// ---------------------------------------------------------------------------
type WeaponKind = 'spray' | 'fan' | 'bomb' | 'aero'

interface WeaponDef {
  id: WeaponKind
  slot: number
  name: string
  tag: string
  color: string
  cost: number // peinture cumulée requise (0 = arme de départ)
  rate: number // secondes entre deux tirs (tir continu tant que maintenu)
  cd: number // décompte interne
  unlocked: boolean
}

function makeWeapons(): WeaponDef[] {
  return [
    // Tir direct rapide : l'arme de base, précise à moyenne portée.
    { id: 'spray', slot: 1, name: 'SPRAY CAN', tag: 'S', color: '#00eaff', cost: 0, rate: 0.16, cd: 0, unlocked: true },
    // Éventail : 5 gouttes en cône, contrôle de foule à courte-moyenne portée.
    { id: 'fan', slot: 2, name: 'FAT CAP', tag: 'F', color: '#ffaa00', cost: 28, rate: 0.55, cd: 0, unlocked: false },
    // Bombe lobée : explose en zone à l'impact (le splat signature du proto).
    { id: 'bomb', slot: 3, name: 'PAINT BOMB', tag: 'B', color: '#ff00cc', cost: 80, rate: 0.9, cd: 0, unlocked: false },
    // Jet d'aérosol continu : lance-flamme courte portée, gros DPS risqué.
    { id: 'aero', slot: 4, name: 'AERO TORCH', tag: 'A', color: '#39ff14', cost: 165, rate: 0.045, cd: 0, unlocked: false },
  ]
}

const BOMB_THROW = 330 // distance de lancer fixe (la direction vient de la visée)
const BOMB_RADIUS = 80
const BOMB_DMG = 40

// Portes de secteur : paliers de kills qui ouvrent la porte suivante (source
// unique : this.kills). Moins de portes que de paliers → paliers ignorés.
const GATE_KILLS = [30, 75, 130]
const GATE_HINT_TTL = 4 // durée (s) du cap pointillé vers la porte ouverte

// Accessibilité : survie du joueur.
const HIT_IFRAME = 0.45 // invulnérabilité globale après un coup (amortit les nuées)
const REGEN_DELAY = 3.5 // secondes sans coup avant de récupérer des HP
const REGEN_RATE = 7 // HP/s régénérés hors combat (récompense le repli)

// Capacités des pools — pré-alloués une fois au boot ; les profils de qualité
// bornent le nombre VIVANT, jamais la capacité (pas de realloc en cours de run).
const POOL_ENEMIES = 240
const POOL_SHOTS = 160
const POOL_BOMBS = 24
const POOL_ORBS = 240
const POOL_PARTS = 320
const POOL_TAGS = 16
const POOL_SPLATS = 60
const MAX_SPLAT_BLOBS = 9

// ---------------------------------------------------------------------------
// Entités (objets poolés : réutilisés, jamais recréés en cours de partie)
// ---------------------------------------------------------------------------
interface PlayerState {
  x: number; y: number
  hp: number; maxHp: number
  speed: number; face: number
  aimX: number; aimY: number // dernière direction de visée (normalisée)
  firing: boolean
  paint: number // peinture cumulée = monnaie de progression
  hurt: number // i-frame global : compte à rebours après un coup encaissé
  safe: number // temps écoulé depuis le dernier coup (déclenche la régén)
}

type EnemyType = 'dog' | 'tagger' | 'cop' | 'buffer' | 'drone' | 'boss'

interface EnemyEnt {
  type: EnemyType; spr: string
  x: number; y: number
  hp: number; maxHp: number
  spd: number; dmg: number; size: number; xp: number
  face: number; hitT: number; flash: number
  elite: boolean; scale: number
}

// Projectile en ligne droite (spray / éventail / aérosol).
interface ShotEnt {
  x: number; y: number; vx: number; vy: number
  ttl: number; max: number
  dmg: number; r: number; col: string
  kind: 'shot' | 'aero'
}
interface BombEnt { x: number; y: number; sx: number; sy: number; tx: number; ty: number; prog: number; spd: number; col: string; rot: number }
interface OrbEnt { x: number; y: number; xp: number; vx: number; vy: number; col: string }
interface PartEnt { x: number; y: number; vx: number; vy: number; r: number; col: string; life: number; max: number }
interface SplatBlob { dx: number; dy: number; r: number }
interface SplatDecal { x: number; y: number; col: string; blobs: SplatBlob[]; nb: number }
interface FloatTag { x: number; y: number; txt: string; col: string; life: number }

interface JoyState { id: number; ox: number; oy: number; x: number; y: number }

type EngineState = 'idle' | 'playing' | 'over'

// Tri en profondeur sans allocation : créneaux persistants triés par y.
// kind : 0 = banc, 1 = pilier, 2 = ennemi, 3 = joueur, 4 = prop urbain.
// y = Infinity → inutilisé. Marge statique : bancs+piliers+props (~37 max) + joueur.
interface SortSlot { y: number; kind: number; ref: unknown }
const SORT_CAP = POOL_ENEMIES + 80
const SORT_BY_Y = (a: SortSlot, b: SortSlot) => a.y - b.y

const ENEMY_DEFS: Record<EnemyType, { spr: string; hp: number; spd: number; dmg: number; size: number; xp: number }> = {
  dog: { spr: 'dog', hp: 26, spd: 118, dmg: 7, size: 26, xp: 3 },
  tagger: { spr: 'tagger', hp: 46, spd: 74, dmg: 9, size: 30, xp: 4 },
  cop: { spr: 'cop', hp: 64, spd: 56, dmg: 13, size: 32, xp: 6 },
  buffer: { spr: 'buffer', hp: 96, spd: 44, dmg: 11, size: 36, xp: 8 },
  drone: { spr: 'drone', hp: 24, spd: 88, dmg: 6, size: 26, xp: 3 },
  // Jamais tiré au hasard (poids 0) : spawné une fois par run via spawnBoss().
  boss: { spr: 'boss', hp: 1500, spd: 46, dmg: 24, size: 84, xp: 0 },
}

// THE BUFF KING : boss unique, confiné dans l'arène, déclenché aux kills.
const BOSS_KILLS = 160 // après la dernière porte (GATE_KILLS max = 130)
const BOSS_SLAM_CD = 3.2 // secondes entre deux slams
const BOSS_SLAM_RANGE = 170 // portée du slam (px)
const BOSS_SLAM_DMG = 16 // dégâts du slam (× multiplicateur de difficulté)

const KILL_WORDS = ['REKT', 'BOOM', 'TAGGED', 'FRESH', 'SPLAT', "BUFF'D"]

// Zones mortes des sticks (en px écran depuis l'origine du stick).
const AIM_DEADZONE = 16 // au-delà : on tire
const AIM_TRACK = 6 // au-delà : la direction de visée suit le stick

// ---------------------------------------------------------------------------
// Moteur
// ---------------------------------------------------------------------------
export class GameEngine {
  state: EngineState = 'idle'

  private wrap!: HTMLElement
  private canvas!: HTMLCanvasElement
  private ctx!: CanvasRenderingContext2D
  private moveJoyBase!: HTMLElement
  private moveJoyStick!: HTMLElement
  private aimJoyBase!: HTMLElement
  private aimJoyStick!: HTMLElement
  private hooks!: EngineHooks
  private neon = '#ff00cc'
  private dm = 1
  private logos: LogoKit = { white: null, black: null }

  // Profil de qualité + dégradation dynamique
  private profile: QualityProfile = detectProfile('desktop')
  private perfLevel = 0 // 0 = plein profil, 1 = -halos/-particules, 2 = -ennemis/-ombres
  private frameEma = 16 // EMA du temps de frame brut (ms)
  private slowT = 0 // temps passé au-dessus du budget
  private frameNo = 0

  private spr!: Record<string, BakedSprite>
  private propSpr!: Record<string, BakedSprite>
  private glows!: Record<string, HTMLCanvasElement>
  private shadow!: HTMLCanvasElement
  private tilePattern!: CanvasPattern

  private level!: Level
  private p!: PlayerState
  private cam = { x: 0, y: 0 }
  private weapons: WeaponDef[] = makeWeapons()
  private activeId: WeaponKind = 'spray'

  // Pools d'entités : [0, count) = vivants, swap-remove à la mort.
  private enemies: EnemyEnt[] = []
  private enemyCount = 0
  private shots: ShotEnt[] = []
  private shotCount = 0
  private bombs: BombEnt[] = []
  private bombCount = 0
  private orbs: OrbEnt[] = []
  private orbCount = 0
  private parts: PartEnt[] = []
  private partCount = 0
  private tags: FloatTag[] = []
  private tagCount = 0
  // Splats : ring buffer (les plus vieux sont recouverts, comme l'ancien cap).
  private splats: SplatDecal[] = []
  private splatHead = 0

  // Hash spatial des ennemis : têtes de liste par cellule + chaînage par index.
  private hashHeads = new Int32Array(0)
  private hashNext = new Int32Array(POOL_ENEMIES)

  // Tri en profondeur persistant (aucune closure par frame).
  private sortSlots: SortSlot[] = []

  // Scratch réutilisés chaque frame (zéro alloc).
  private mv = { x: 0, y: 0 }
  private steerV = { x: 0, y: 0 }
  private hudState: HudState = { hpPct: 100, hp: 0, paint: 0, paintPct: 0, nextCost: null, time: '00:00', kills: 0, bossPct: -1 }

  // Politique d'effets calculée une fois par frame (lue par drawEnemy).
  private frGlowMode: GlowMode = 'full'
  private frNearD2 = 0
  private frShadows = true
  private frFx = true // halos des tirs/orbes (composite 'lighter')

  private time = 0
  private kills = 0
  private spawnT = 0
  private shake = 0
  private flowT = 0
  private gateTier = 0 // prochain palier de GATE_KILLS à franchir
  private gateHint = { x: 0, y: 0, ttl: 0 } // cap visuel vers porte ouverte / boss (scratch)
  // Boss d'arène : référence stable (le swap-remove déplace les index, pas les
  // objets), null quand mort ou pas encore apparu. Un seul boss par run.
  private bossRef: EnemyEnt | null = null
  private bossDone = false
  private bossSlamT = 0

  // Entrées : clavier + souris (desktop) + deux joysticks tactiles (mobile).
  private keys: Record<string, boolean> = {}
  private mouse = { x: 0, y: 0, down: false, seen: false }
  private moveJoy: JoyState | null = null
  private aimJoy: JoyState | null = null

  private raf = 0
  private last = 0
  private vw = 640
  private vh = 480
  private dpr = 1
  private ac = new AbortController()
  private ro: ResizeObserver | null = null
  private destroyed = false

  // Le composant lit le profil (ex. pour l'overlay CRT).
  get qualityProfile(): QualityProfile {
    return this.profile
  }

  // ---------- cycle de vie ----------
  init(opts: EngineOptions): void {
    this.wrap = opts.wrap
    this.canvas = opts.canvas
    this.moveJoyBase = opts.moveJoyBase
    this.moveJoyStick = opts.moveJoyStick
    this.aimJoyBase = opts.aimJoyBase
    this.aimJoyStick = opts.aimJoyStick
    this.hooks = opts.hooks
    this.neon = opts.neon || '#ff00cc'
    this.dm = { easy: 0.8, normal: 1, hard: 1.35 }[opts.difficulty || 'normal']
    this.profile = detectProfile(opts.quality)

    this.ctx = this.canvas.getContext('2d')!
    this.spr = buildSprites(this.neon)
    this.propSpr = buildProps()
    const gk = buildGlows(this.neon)
    this.glows = gk.glows
    this.shadow = gk.shadow
    this.tilePattern = this.ctx.createPattern(buildTile(), 'repeat')!

    this.allocPools()

    // Police pixel : les tuiles statiques contiennent du texte → on ré-invalide
    // le cache quand elle arrive (sinon les graffitis bakent en police fallback).
    document.fonts
      ?.load("12px 'Press Start 2P'")
      .then(() => {
        if (!this.destroyed) this.level?.invalidateStatic()
      })
      .catch(() => {})
    this.loadLogos()

    const sig = this.ac.signal
    window.addEventListener('keydown', this.onKey, { signal: sig })
    window.addEventListener('keyup', this.onKey, { signal: sig })
    this.wrap.addEventListener('pointerdown', (e) => this.onPointer('down', e), { signal: sig })
    this.wrap.addEventListener('pointermove', (e) => this.onPointer('move', e), { signal: sig })
    this.wrap.addEventListener('pointerup', (e) => this.onPointer('up', e), { signal: sig })
    this.wrap.addEventListener('pointercancel', (e) => this.onPointer('up', e), { signal: sig })
    this.wrap.addEventListener('wheel', (e) => this.onWheel(e), { signal: sig, passive: true })

    // Couvre aussi les changements d'orientation mobile (le wrap change de taille).
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(this.wrap)
    this.resize()

    this.initWorld()
    this.last = performance.now()
    this.raf = requestAnimationFrame((t) => this.loop(t))
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    cancelAnimationFrame(this.raf)
    this.ac.abort()
    this.ro?.disconnect()
    this.ro = null
  }

  // Pré-alloue tous les pools une seule fois (aucune création d'objet en partie).
  private allocPools(): void {
    for (let i = 0; i < POOL_ENEMIES; i++) {
      this.enemies.push({ type: 'dog', spr: 'dog', x: 0, y: 0, hp: 0, maxHp: 0, spd: 0, dmg: 0, size: 0, xp: 0, face: 1, hitT: 0, flash: 0, elite: false, scale: 1 })
    }
    for (let i = 0; i < POOL_SHOTS; i++) {
      this.shots.push({ x: 0, y: 0, vx: 0, vy: 0, ttl: 0, max: 1, dmg: 0, r: 0, col: '#fff', kind: 'shot' })
    }
    for (let i = 0; i < POOL_BOMBS; i++) {
      this.bombs.push({ x: 0, y: 0, sx: 0, sy: 0, tx: 0, ty: 0, prog: 0, spd: 0, col: '#fff', rot: 0 })
    }
    for (let i = 0; i < POOL_ORBS; i++) {
      this.orbs.push({ x: 0, y: 0, xp: 0, vx: 0, vy: 0, col: '#fff' })
    }
    for (let i = 0; i < POOL_PARTS; i++) {
      this.parts.push({ x: 0, y: 0, vx: 0, vy: 0, r: 1, col: '#fff', life: 0, max: 1 })
    }
    for (let i = 0; i < POOL_TAGS; i++) {
      this.tags.push({ x: 0, y: 0, txt: '', col: '#fff', life: 0 })
    }
    for (let i = 0; i < POOL_SPLATS; i++) {
      const blobs: SplatBlob[] = []
      for (let b = 0; b < MAX_SPLAT_BLOBS; b++) blobs.push({ dx: 0, dy: 0, r: 0 })
      this.splats.push({ x: 0, y: 0, col: '#fff', blobs, nb: 0 })
    }
    for (let i = 0; i < SORT_CAP; i++) {
      this.sortSlots.push({ y: Infinity, kind: 0, ref: null })
    }
  }

  // Charge le logo du site et prépare deux teintes sur canvas offscreen.
  // NB : le fichier "logo-blanc.svg" fourni est un pochoir inversé (feuille
  // blanche pleine, logo évidé) — on part donc du NOIR (formes propres sur fond
  // transparent) et on le teinte, ce qui donne les deux variantes fiables.
  private loadLogos(): void {
    const img = new Image()
    img.onload = () => {
      if (this.destroyed) return
      const tint = (color: string): HTMLCanvasElement => {
        const c = document.createElement('canvas')
        c.width = 512
        c.height = 384 // ratio 4:3 du logo
        const x = c.getContext('2d')!
        x.drawImage(img, 0, 0, c.width, c.height)
        x.globalCompositeOperation = 'source-in'
        x.fillStyle = color
        x.fillRect(0, 0, c.width, c.height)
        return c
      }
      this.logos.white = tint('#ffffff')
      this.logos.black = tint('#050608')
      // Les tuiles déjà bakées ne contiennent pas les logos → re-bake à la demande.
      this.level?.invalidateStatic()
    }
    img.src = logoBlackUrl
  }

  // (Re)génère un monde + état frais. Nouveau layout de rues à chaque run.
  private initWorld(): void {
    this.level = generateLevel({ decalDensity: this.profile.decalDensity })
    this.level.setStaticAssets(this.tilePattern, this.logos)
    // Hash spatial dimensionné sur la grille du niveau (réalloué par run, pas par frame).
    this.hashHeads = new Int32Array(this.level.cols * this.level.rows)
    this.p = {
      x: this.level.spawnX, y: this.level.spawnY,
      hp: 130, maxHp: 130, speed: 158, face: 1,
      aimX: 1, aimY: 0, firing: false,
      paint: 0,
      hurt: 0, safe: 0,
    }
    this.weapons = makeWeapons()
    this.activeId = 'spray'
    this.enemyCount = 0
    this.shotCount = 0
    this.bombCount = 0
    this.orbCount = 0
    this.partCount = 0
    this.tagCount = 0
    this.splatHead = 0
    for (const s of this.splats) s.nb = 0
    this.time = 0
    this.kills = 0
    this.spawnT = 0
    this.shake = 0
    this.flowT = 0
    this.gateTier = 0
    this.gateHint.ttl = 0
    this.bossRef = null
    this.bossDone = false
    this.bossSlamT = 0
    this.moveJoy = null
    this.aimJoy = null
    this.mouse.down = false
    this.updateCamera()
    this.emitWeapons()
  }

  start(): void {
    this.initWorld()
    this.state = 'playing'
  }

  // ---------- armes : sélection ----------
  selectWeapon(id: string): void {
    const def = this.weapons.find((w) => w.id === id)
    if (!def || !def.unlocked) return
    this.activeId = def.id
    this.emitWeapons()
  }

  private selectSlot(slot: number): void {
    const def = this.weapons.find((w) => w.slot === slot)
    if (def) this.selectWeapon(def.id)
  }

  private cycleWeapon(dir: number): void {
    const owned = this.weapons.filter((w) => w.unlocked)
    if (owned.length < 2) return
    const idx = owned.findIndex((w) => w.id === this.activeId)
    this.selectWeapon(owned[(idx + dir + owned.length) % owned.length].id)
  }

  private emitWeapons(): void {
    this.hooks.weapons(
      this.weapons.map((w) => ({
        id: w.id, slot: w.slot, name: w.name, tag: w.tag, color: w.color,
        cost: w.cost, unlocked: w.unlocked, active: w.id === this.activeId,
      })),
    )
  }

  // ---------- entrées ----------
  private onKey = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase()
    const map: Record<string, 1> = { w: 1, a: 1, s: 1, d: 1, arrowup: 1, arrowdown: 1, arrowleft: 1, arrowright: 1 }
    if (map[k]) {
      this.keys[k] = e.type === 'keydown'
      e.preventDefault()
      return
    }
    // Touches 1-4 : changement d'arme (desktop)
    if (e.type === 'keydown' && this.state === 'playing' && (k === '1' || k === '2' || k === '3' || k === '4')) {
      this.selectSlot(Number(k))
    }
  }

  private onWheel(e: WheelEvent): void {
    if (this.state !== 'playing') return
    this.cycleWeapon(e.deltaY > 0 ? 1 : -1) // molette = cycle des armes possédées
  }

  // Routage des pointeurs : tactile → deux joysticks (par moitié d'écran),
  // souris → visée continue + tir au clic maintenu.
  private onPointer(kind: 'down' | 'move' | 'up', e: PointerEvent): void {
    if (this.state !== 'playing') return
    const r = this.wrap.getBoundingClientRect()
    const px = e.clientX - r.left
    const py = e.clientY - r.top

    if (e.pointerType === 'touch') {
      this.onTouch(kind, e.pointerId, px, py)
      return
    }

    // Souris / stylet (desktop)
    if (kind === 'down') {
      if (e.button === 0) this.mouse.down = true
      this.mouse.x = px
      this.mouse.y = py
      this.mouse.seen = true
    } else if (kind === 'move') {
      this.mouse.x = px
      this.mouse.y = py
      this.mouse.seen = true
    } else if (e.button === 0 || e.type === 'pointercancel') {
      this.mouse.down = false
    }
  }

  // Multi-touch : moitié gauche = stick de déplacement, moitié droite = stick de
  // visée/tir. Chaque stick suit SON pointerId : les deux vivent en parallèle.
  private onTouch(kind: 'down' | 'move' | 'up', id: number, px: number, py: number): void {
    if (kind === 'down') {
      if (px < this.vw / 2 && !this.moveJoy) {
        this.moveJoy = { id, ox: px, oy: py, x: px, y: py }
        this.showJoy(this.moveJoyBase, this.moveJoyStick, px, py)
      } else if (px >= this.vw / 2 && !this.aimJoy) {
        this.aimJoy = { id, ox: px, oy: py, x: px, y: py }
        this.showJoy(this.aimJoyBase, this.aimJoyStick, px, py)
      }
    } else if (kind === 'move') {
      if (this.moveJoy && id === this.moveJoy.id) {
        this.moveJoy.x = px
        this.moveJoy.y = py
        this.dragJoy(this.moveJoyStick, this.moveJoy, 52)
      } else if (this.aimJoy && id === this.aimJoy.id) {
        this.aimJoy.x = px
        this.aimJoy.y = py
        this.dragJoy(this.aimJoyStick, this.aimJoy, 48)
      }
    } else {
      if (this.moveJoy && id === this.moveJoy.id) {
        this.moveJoy = null
        this.moveJoyBase.style.display = 'none'
      } else if (this.aimJoy && id === this.aimJoy.id) {
        this.aimJoy = null
        this.aimJoyBase.style.display = 'none'
      }
    }
  }

  private showJoy(base: HTMLElement, stick: HTMLElement, px: number, py: number): void {
    base.style.display = 'block'
    base.style.left = px + 'px'
    base.style.top = py + 'px'
    stick.style.left = '50%'
    stick.style.top = '50%'
  }

  private dragJoy(stick: HTMLElement, joy: JoyState, max: number): void {
    let dx = joy.x - joy.ox
    let dy = joy.y - joy.oy
    const d = Math.hypot(dx, dy)
    if (d > max) {
      dx = (dx / d) * max
      dy = (dy / d) * max
    }
    stick.style.left = 60 + dx + 'px'
    stick.style.top = 60 + dy + 'px'
  }

  // Vecteur de déplacement : clavier + stick gauche (écrit dans le scratch this.mv).
  private moveVec(): { x: number; y: number } {
    const m = this.mv
    m.x = 0
    m.y = 0
    const k = this.keys
    if (k.a || k.arrowleft) m.x -= 1
    if (k.d || k.arrowright) m.x += 1
    if (k.w || k.arrowup) m.y -= 1
    if (k.s || k.arrowdown) m.y += 1
    if (this.moveJoy) {
      const dx = this.moveJoy.x - this.moveJoy.ox
      const dy = this.moveJoy.y - this.moveJoy.oy
      const d = Math.hypot(dx, dy)
      if (d > 8) {
        m.x = dx / d
        m.y = dy / d
      }
    }
    const len = Math.hypot(m.x, m.y)
    if (len > 1) {
      m.x /= len
      m.y /= len
    }
    return m
  }

  // Résout la visée : stick droit prioritaire (mobile), sinon souris (desktop).
  // Met à jour p.aimX/aimY (direction persistante) et retourne l'état du tir.
  private resolveAim(): boolean {
    const p = this.p
    if (this.aimJoy) {
      const dx = this.aimJoy.x - this.aimJoy.ox
      const dy = this.aimJoy.y - this.aimJoy.oy
      const d = Math.hypot(dx, dy)
      if (d > AIM_TRACK) {
        p.aimX = dx / d
        p.aimY = dy / d
      }
      return d > AIM_DEADZONE // tir continu au-delà de la zone morte
    }
    if (this.mouse.seen) {
      // Souris : viser le curseur (coordonnées écran → monde via la caméra).
      const wx = this.mouse.x + this.cam.x
      const wy = this.mouse.y + this.cam.y
      const dx = wx - p.x
      const dy = wy - (p.y - 12) // on vise depuis le buste, pas les pieds
      const d = Math.hypot(dx, dy)
      if (d > 4) {
        p.aimX = dx / d
        p.aimY = dy / d
      }
      return this.mouse.down
    }
    return false
  }

  private resize(): void {
    const r = this.wrap.getBoundingClientRect()
    // Levier perf n°1 : DPR plafonné par le profil (1 sur mobile, pixel art oblige).
    this.dpr = Math.min(this.profile.dprCap, window.devicePixelRatio || 1)
    this.vw = Math.max(320, r.width)
    this.vh = Math.max(320, r.height)
    this.canvas.width = Math.floor(this.vw * this.dpr)
    this.canvas.height = Math.floor(this.vh * this.dpr)
  }

  // ---------- qualité effective (profil + dégradation dynamique) ----------
  private enemyGlowMode(): GlowMode {
    const base = this.profile.glow
    if (this.perfLevel === 0) return base
    if (this.perfLevel === 1) return base === 'full' ? 'near' : 'elite'
    return base === 'full' ? 'elite' : 'off'
  }

  private effMaxEnemies(): number {
    return this.perfLevel >= 2 ? Math.floor(this.profile.maxEnemies * 0.7) : this.profile.maxEnemies
  }

  private effMaxParticles(): number {
    return Math.min(POOL_PARTS, this.perfLevel >= 1 ? this.profile.maxParticles >> 1 : this.profile.maxParticles)
  }

  private shadowsOn(): boolean {
    return this.profile.shadows && this.perfLevel < 2
  }

  // ---------- boucle ----------
  private loop(t: number): void {
    if (this.destroyed) return
    const rawMs = Math.min(100, t - this.last)
    let dt = (t - this.last) / 1000
    this.last = t
    if (dt > 0.05) dt = 0.05

    // Moniteur de FPS : EMA du temps de frame → dégradation par paliers si le
    // budget est dépassé de façon soutenue (rend le jeu jouable sur des
    // téléphones plus faibles sans toucher au profil).
    this.frameEma += (rawMs - this.frameEma) * 0.08
    if (this.state === 'playing') {
      if (this.frameEma > FRAME_BUDGET_MS) {
        this.slowT += dt
        if (this.slowT > SLOW_GRACE_S && this.perfLevel < MAX_PERF_LEVEL) {
          this.perfLevel++
          this.slowT = 0
        }
      } else if (this.slowT > 0) {
        this.slowT = Math.max(0, this.slowT - dt * 0.5)
      }
      this.update(dt)
    }
    this.render()
    this.raf = requestAnimationFrame((tt) => this.loop(tt))
  }

  private updateCamera(): void {
    const L = this.level
    const cx = this.p.x - this.vw / 2
    const cy = this.p.y - this.vh / 2
    this.cam.x = L.W <= this.vw ? (L.W - this.vw) / 2 : Math.max(0, Math.min(L.W - this.vw, cx))
    this.cam.y = L.H <= this.vh ? (L.H - this.vh) / 2 : Math.max(0, Math.min(L.H - this.vh, cy))
  }

  private update(dt: number): void {
    const p = this.p
    const L = this.level
    this.time += dt

    // Déplacement : collision grille (glissement) + obstacles (buckets spatiaux).
    const mv = this.moveVec()
    L.moveCircle(p, mv.x * p.speed * dt, mv.y * p.speed * dt, 12)
    L.pushOut(p, 12)

    this.updateCamera()

    // Visée + tir manuel.
    p.firing = this.resolveAim()
    if (p.firing) p.face = p.aimX < 0 ? -1 : 1
    else if (mv.x) p.face = mv.x < 0 ? -1 : 1

    // Cadence : décompte permanent, tir tant que maintenu.
    for (const w of this.weapons) {
      w.cd -= dt
      if (!p.firing || w.id !== this.activeId) {
        if (w.cd < 0) w.cd = 0
      }
    }
    if (p.firing) {
      const w = this.weapons.find((x) => x.id === this.activeId)!
      while (w.cd <= 0) {
        this.fireWeapon(w)
        w.cd += w.rate
      }
    }

    // Survie : i-frame global + régénération hors combat.
    if (p.hurt > 0) p.hurt -= dt
    p.safe += dt
    if (p.safe > REGEN_DELAY && p.hp < p.maxHp) {
      p.hp = Math.min(p.maxHp, p.hp + REGEN_RATE * dt)
    }

    // Flow field pour le pathing des ennemis au sol.
    this.flowT -= dt
    if (this.flowT <= 0) {
      this.flowT = 0.35
      L.computeFlow(p.x, p.y)
    }

    // Vagues : courbe scalée par le profil de qualité. Départ adouci (2.3 s
    // entre spawns au lieu de 1.75) avec une pente un peu plus raide : la
    // densité rejoint l'ancienne courbe vers ~2 min 20 et le plancher reste 0.45.
    this.spawnT -= dt
    const interval = (Math.max(0.45, 2.3 - this.time * 0.013) * this.profile.spawnIntervalScale) / this.dm
    if (this.spawnT <= 0 && this.enemyCount < this.effMaxEnemies()) {
      this.spawnT = interval
      const batch = 1 + Math.floor(this.time / this.profile.batchPeriod)
      for (let i = 0; i < batch; i++) this.spawnEnemy()
    }

    // Ennemis : déplacement + contact + morts (les dégâts des tirs de CETTE frame
    // seront appliqués après le hash → morts effectives à la frame suivante,
    // ce qui garde le hash spatial valide toute la frame).
    for (let i = this.enemyCount - 1; i >= 0; i--) {
      const e = this.enemies[i]
      const dx = p.x - e.x
      const dy = p.y - e.y
      const d = Math.hypot(dx, dy) || 1
      if (e.type === 'boss') {
        // Boss : confiné à l'arène (ouverte et sans obstacle → ligne droite).
        // Poursuit le joueur s'il est dedans, sinon regagne le centre.
        const a = L.arena!
        const pIn = p.x > a.x0 && p.x < a.x1 && p.y > a.y0 && p.y < a.y1
        const tx = pIn ? p.x : (a.x0 + a.x1) / 2
        const ty = pIn ? p.y : (a.y0 + a.y1) / 2
        const bdx = tx - e.x
        const bdy = ty - e.y
        const bd = Math.hypot(bdx, bdy)
        if (bd > 8) L.moveCircle(e, (bdx / bd) * e.spd * dt, (bdy / bd) * e.spd * dt, e.size * 0.28)
        e.x = Math.max(a.x0 + 70, Math.min(a.x1 - 70, e.x))
        e.y = Math.max(a.y0 + 70, Math.min(a.y1 - 70, e.y))
        // Slam de zone périodique quand le joueur est à portée.
        this.bossSlamT -= dt
        if (this.bossSlamT <= 0 && d < BOSS_SLAM_RANGE) {
          this.bossSlamT = BOSS_SLAM_CD
          this.puff(e.x, e.y - 8, '#ff00cc', 16)
          this.spawnWord(e.x, e.y - 70, 'SLAM', '#ff00cc', 0.9)
          this.shake = Math.min(12, this.shake + 7)
          if (p.hurt <= 0) {
            p.hurt = HIT_IFRAME
            p.safe = 0
            p.hp -= BOSS_SLAM_DMG * this.dm
            if (p.hp <= 0) return this.gameOver()
          }
        }
      } else if (e.type === 'drone') {
        // Les drones volent : ligne droite au-dessus des toits.
        e.x += (dx / d) * e.spd * dt
        e.y += (dy / d) * e.spd * dt
      } else {
        // Au sol : flow field si dispo, sinon ligne droite (steerInto : zéro alloc).
        const hasFlow = L.steerInto(e.x, e.y, this.steerV)
        const ux = hasFlow ? this.steerV.x : dx / d
        const uy = hasFlow ? this.steerV.y : dy / d
        L.moveCircle(e, ux * e.spd * dt, uy * e.spd * dt, e.size * 0.28)
        L.pushOut(e, e.size * 0.28)
      }
      e.face = dx < 0 ? -1 : 1
      e.hitT -= dt
      // Contact : l'ennemi doit être prêt (hitT) ET le joueur hors i-frame global.
      if (d < e.size * 0.5 + 12 && e.hitT <= 0 && p.hurt <= 0) {
        e.hitT = 0.6
        p.hurt = HIT_IFRAME
        p.safe = 0
        p.hp -= e.dmg * this.dm
        this.shake = Math.min(9, this.shake + 4)
        if (p.hp <= 0) return this.gameOver()
      }
      e.flash = Math.max(0, e.flash - dt * 6)
      if (e.hp <= 0) this.killEnemyAt(i)
    }

    // Hash spatial des ennemis (reconstruit chaque frame, zéro allocation).
    this.buildEnemyHash()

    // Projectiles directs : collisions via le hash (cellule ±1).
    const cols = L.cols
    const rows = L.rows
    outer: for (let i = this.shotCount - 1; i >= 0; i--) {
      const s = this.shots[i]
      s.x += s.vx * dt
      s.y += s.vy * dt
      s.ttl -= dt
      if (s.ttl <= 0) {
        this.killShotAt(i)
        continue
      }
      // La peinture s'écrase sur les murs.
      if (!L.walkableAt(s.x, s.y)) {
        this.puff(s.x, s.y, s.col, 2)
        this.killShotAt(i)
        continue
      }
      const scx = (s.x / CELL) | 0
      const scy = (s.y / CELL) | 0
      for (let cy = scy - 1; cy <= scy + 1; cy++) {
        if (cy < 0 || cy >= rows) continue
        for (let cx = scx - 1; cx <= scx + 1; cx++) {
          if (cx < 0 || cx >= cols) continue
          for (let j = this.hashHeads[cy * cols + cx]; j !== -1; j = this.hashNext[j]) {
            const e = this.enemies[j]
            const rr = e.size * 0.4 + s.r
            const ddx = e.x - s.x
            const ddy = e.y - 10 - s.y // corps ≈ 10px au-dessus des pieds
            if (ddx * ddx + ddy * ddy < rr * rr) {
              e.hp -= s.dmg
              e.flash = 1
              this.puff(s.x, s.y, s.col, s.kind === 'aero' ? 1 : 3)
              this.killShotAt(i)
              continue outer
            }
          }
        }
      }
    }

    // Bombes lobées → explosion en zone à l'arrivée.
    for (let i = this.bombCount - 1; i >= 0; i--) {
      const b = this.bombs[i]
      const dx = b.tx - b.x
      const dy = b.ty - b.y
      const d = Math.hypot(dx, dy) || 1
      const step = b.spd * dt
      b.rot += dt * 14
      if (d <= step + 4) {
        this.explode(b.tx, b.ty, BOMB_RADIUS, BOMB_DMG, b.col)
        this.bombCount--
        this.bombs[i] = this.bombs[this.bombCount]
        this.bombs[this.bombCount] = b
      } else {
        b.x += (dx / d) * step
        b.y += (dy / d) * step
        b.prog = 1 - d / (Math.hypot(b.tx - b.sx, b.ty - b.sy) || 1)
      }
    }

    // Orbes de peinture : dérive + aimant + ramassage → progression.
    for (let i = this.orbCount - 1; i >= 0; i--) {
      const o = this.orbs[i]
      o.x += o.vx * dt
      o.y += o.vy * dt
      o.vx *= 0.9
      o.vy *= 0.9
      const dx = p.x - o.x
      const dy = p.y - o.y
      const d = Math.hypot(dx, dy) || 1
      if (d < 78) {
        o.x += (dx / d) * 260 * dt
        o.y += (dy / d) * 260 * dt
      }
      if (d < 16) {
        const gained = o.xp
        this.orbCount--
        this.orbs[i] = this.orbs[this.orbCount]
        this.orbs[this.orbCount] = o
        this.gainPaint(gained)
      }
    }

    // Caches de peinture : ramassage au contact (3 max par run — boucle triviale).
    for (let i = 0; i < L.caches.length; i++) {
      const c = L.caches[i]
      if (c.taken) continue
      const cdx = p.x - c.x
      const cdy = p.y - c.y
      if (cdx * cdx + cdy * cdy < 32 * 32) {
        c.taken = true
        this.puff(c.x, c.y - 8, '#ff00cc', 12)
        this.spawnWord(c.x, c.y - 34, '+' + c.paint + ' PAINT', '#00eaff', 1.5)
        this.gainPaint(c.paint)
      }
    }

    // Particules
    for (let i = this.partCount - 1; i >= 0; i--) {
      const q = this.parts[i]
      q.x += q.vx * dt
      q.y += q.vy * dt
      q.vx *= 0.92
      q.vy *= 0.92
      q.life -= dt
      if (q.life <= 0) {
        this.partCount--
        this.parts[i] = this.parts[this.partCount]
        this.parts[this.partCount] = q
      }
    }
    // Mots flottants
    for (let i = this.tagCount - 1; i >= 0; i--) {
      const tg = this.tags[i]
      tg.y -= 26 * dt
      tg.life -= dt
      if (tg.life <= 0) {
        this.tagCount--
        this.tags[i] = this.tags[this.tagCount]
        this.tags[this.tagCount] = tg
      }
    }

    // Portes de secteur : palier de kills franchi → ouverture + feedback
    // (uniquement via les systèmes existants : shake, particules, mots, cap).
    if (this.gateTier < GATE_KILLS.length && this.kills >= GATE_KILLS[this.gateTier]) {
      const g = L.openNextGate()
      this.gateTier++
      if (g) {
        this.shake = Math.min(12, this.shake + 6)
        this.puff(g.x, g.y, '#00eaff', 14)
        this.spawnWord(g.x, g.y - 30, 'OPEN!', '#00eaff', 1.4)
        this.spawnWord(p.x, p.y - 46, 'ZONE OPEN', '#00eaff', 1.6)
        this.gateHint.x = g.x
        this.gateHint.y = g.y
        this.gateHint.ttl = GATE_HINT_TTL
        // Toast Vue : événement rare → réactivité légitime (cf. EngineHooks).
        this.hooks.zone({
          opened: this.level.gates.filter((gg) => gg.open).length + 1,
          total: this.level.gates.length + 1,
          cache: g.cache,
        })
      } else {
        this.gateTier = GATE_KILLS.length // plus de porte : on ne reteste plus
      }
    }
    if (this.gateHint.ttl > 0) this.gateHint.ttl -= dt

    // Boss d'arène : un seul par run, déclenché au palier de kills.
    if (!this.bossDone && !this.bossRef && this.kills >= BOSS_KILLS) {
      this.spawnBoss()
    }

    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 22)

    // HUD : objet réutilisé (pas d'allocation), écrit en DOM direct côté composant.
    let next: WeaponDef | null = null
    let prev = 0
    for (const w of this.weapons) {
      if (!w.unlocked && !next) next = w
      if (w.unlocked && w.cost > prev) prev = w.cost
    }
    const h = this.hudState
    h.hpPct = Math.max(0, (p.hp / p.maxHp) * 100)
    h.hp = Math.max(0, Math.ceil(p.hp))
    h.paint = p.paint
    h.paintPct = next ? Math.min(100, ((p.paint - prev) / (next.cost - prev)) * 100) : 100
    h.nextCost = next ? next.cost : null
    h.time = this.fmt(this.time)
    h.kills = this.kills
    h.bossPct = this.bossRef ? Math.max(0, (this.bossRef.hp / this.bossRef.maxHp) * 100) : -1
    this.hooks.hud(h)
  }

  // Fait apparaître THE BUFF KING au centre de l'arène (décalé si le joueur y
  // est déjà) et pointe le cap dessus. Sans arène (jamais en pratique), on
  // marque le boss comme fait pour ne pas retester chaque frame.
  private spawnBoss(): void {
    const a = this.level.arena
    if (!a || this.enemyCount >= POOL_ENEMIES) {
      this.bossDone = true
      return
    }
    const acx = (a.x0 + a.x1) / 2
    const acy = (a.y0 + a.y1) / 2
    const d = ENEMY_DEFS.boss
    const e = this.enemies[this.enemyCount++]
    e.type = 'boss'
    e.spr = d.spr
    e.x = acx
    // Si le joueur campe le centre, le boss tombe un peu plus bas dans l'arène.
    e.y = Math.hypot(this.p.x - acx, this.p.y - acy) < 140 ? acy + 240 : acy
    e.hp = d.hp * this.dm
    e.maxHp = e.hp
    e.spd = d.spd
    e.dmg = d.dmg
    e.size = d.size
    e.xp = d.xp
    e.face = 1
    e.hitT = 0
    e.flash = 0
    e.elite = true // halo garanti même en profil mobile (glow 'near'/'elite')
    e.scale = 1.7
    this.bossRef = e
    this.bossSlamT = BOSS_SLAM_CD
    this.shake = Math.min(12, this.shake + 8)
    this.puff(e.x, e.y - 10, '#ff00cc', 16)
    this.spawnWord(e.x, e.y - 90, 'THE BUFF KING', '#ff00cc', 2.2)
    this.spawnWord(this.p.x, this.p.y - 46, 'BOSS IN THE ARENA', '#ff00cc', 1.8)
    // Cap pointillé vers l'arène (réutilise le hint des portes).
    this.gateHint.x = e.x
    this.gateHint.y = e.y
    this.gateHint.ttl = GATE_HINT_TTL + 2
  }

  // Mort d'un ennemi : compteur, orbe de peinture, mot flottant, swap-remove.
  private killEnemyAt(i: number): void {
    const e = this.enemies[i]
    this.kills++
    // Boss : jackpot de peinture + splat signature (explode à 0 dégât = recul
    // + décal permanent + particules), puis l'objet repart dans le pool.
    if (e.type === 'boss') {
      this.bossRef = null
      this.bossDone = true
      this.explode(e.x, e.y, 110, 0, '#ff00cc')
      for (let k = 0; k < 8 && this.orbCount < POOL_ORBS; k++) {
        const o = this.orbs[this.orbCount++]
        const ang = (k / 8) * Math.PI * 2
        o.x = e.x + Math.cos(ang) * 30
        o.y = e.y + Math.sin(ang) * 30
        o.xp = 10
        o.vx = Math.cos(ang) * 130
        o.vy = Math.sin(ang) * 130
        o.col = k % 2 ? '#ff00cc' : '#00eaff'
      }
      this.spawnWord(e.x, e.y - 60, 'BOSS DOWN', '#ff00cc', 2.2)
      this.shake = 12
    }
    if (this.orbCount < POOL_ORBS) {
      const o = this.orbs[this.orbCount++]
      o.x = e.x
      o.y = e.y
      o.xp = e.xp
      o.vx = (Math.random() - 0.5) * 40
      o.vy = (Math.random() - 0.5) * 40
      o.col = NEONS[(Math.random() * 4) | 0]
    }
    if (Math.random() < 0.14) this.spawnTag(e.x, e.y)
    this.enemyCount--
    this.enemies[i] = this.enemies[this.enemyCount]
    this.enemies[this.enemyCount] = e
  }

  private killShotAt(i: number): void {
    const s = this.shots[i]
    this.shotCount--
    this.shots[i] = this.shots[this.shotCount]
    this.shots[this.shotCount] = s
  }

  // Reconstruit le hash spatial : tête de liste par cellule + chaînage par index.
  private buildEnemyHash(): void {
    this.hashHeads.fill(-1)
    const cols = this.level.cols
    const rows = this.level.rows
    for (let i = 0; i < this.enemyCount; i++) {
      const e = this.enemies[i]
      let cx = (e.x / CELL) | 0
      let cy = (e.y / CELL) | 0
      if (cx < 0) cx = 0
      else if (cx >= cols) cx = cols - 1
      if (cy < 0) cy = 0
      else if (cy >= rows) cy = rows - 1
      const cell = cy * cols + cx
      this.hashNext[i] = this.hashHeads[cell]
      this.hashHeads[cell] = i
    }
  }

  // ---------- tir ----------
  private fireWeapon(w: WeaponDef): void {
    const p = this.p
    // Départ du tir : le buste, légèrement décalé vers la visée.
    const mx = p.x + p.aimX * 16
    const my = p.y - 12 + p.aimY * 16
    const base = Math.atan2(p.aimY, p.aimX)

    switch (w.id) {
      case 'spray':
        this.spawnShot(mx, my, base, 520, 10, 4, 1.1, '#00eaff', 'shot')
        break
      case 'fan':
        // 5 gouttes en cône (~28°)
        for (let i = 0; i < 5; i++) this.spawnShot(mx, my, base + (i - 2) * 0.12, 470, 7, 4, 0.75, '#ffaa00', 'shot')
        break
      case 'bomb': {
        if (this.bombCount < POOL_BOMBS) {
          const b = this.bombs[this.bombCount++]
          b.x = mx
          b.y = my
          b.sx = mx
          b.sy = my
          b.tx = p.x + p.aimX * BOMB_THROW
          b.ty = p.y + p.aimY * BOMB_THROW
          b.prog = 0
          b.spd = 430
          b.col = NEONS[(Math.random() * 4) | 0]
          b.rot = 0
        }
        break
      }
      case 'aero':
        // Jet continu : 2 particules par tick, jitter d'angle, portée courte.
        for (let i = 0; i < 2; i++) {
          const jitter = (Math.random() - 0.5) * 0.3
          const spd = 340 + Math.random() * 120
          this.spawnShot(mx, my, base + jitter, spd, 4, 3, 0.26 + Math.random() * 0.1, Math.random() < 0.5 ? '#39ff14' : '#8aff5c', 'aero')
        }
        break
    }
  }

  private spawnShot(x: number, y: number, angle: number, speed: number, dmg: number, r: number, ttl: number, col: string, kind: 'shot' | 'aero'): void {
    if (this.shotCount >= POOL_SHOTS) return
    const s = this.shots[this.shotCount++]
    s.x = x
    s.y = y
    s.vx = Math.cos(angle) * speed
    s.vy = Math.sin(angle) * speed
    s.ttl = ttl
    s.max = ttl
    s.dmg = dmg
    s.r = r
    s.col = col
    s.kind = kind
  }

  // Petit nuage de gouttelettes à l'impact (borné par le budget du profil).
  private puff(x: number, y: number, col: string, n: number): void {
    const budget = this.effMaxParticles()
    for (let i = 0; i < n; i++) {
      if (this.partCount >= budget) return
      const q = this.parts[this.partCount++]
      const a = Math.random() * 7
      const s = 30 + Math.random() * 90
      q.x = x
      q.y = y
      q.vx = Math.cos(a) * s
      q.vy = Math.sin(a) * s
      q.r = 1.5 + Math.random() * 2.5
      q.col = col
      q.life = 0.18 + Math.random() * 0.2
      q.max = 0.35
    }
  }

  private spawnEnemy(): void {
    if (this.enemyCount >= Math.min(POOL_ENEMIES, this.effMaxEnemies())) return
    const t = this.time
    // Pondération évolutive : les types durs arrivent avec le temps.
    const weights: Record<EnemyType, number> = {
      dog: 3 + Math.max(0, t * 0.02),
      tagger: 1.5 + t * 0.03,
      cop: t > 25 ? 1 + t * 0.03 : 0.2,
      buffer: t > 50 ? 0.8 + t * 0.02 : 0,
      drone: t > 15 ? 1 + t * 0.02 : 0.3,
      boss: 0, // jamais au hasard : spawnBoss() uniquement
    }
    let total = 0
    for (const k in weights) total += weights[k as EnemyType]
    let r = Math.random() * total
    let key: EnemyType = 'dog'
    for (const k in weights) {
      r -= weights[k as EnemyType]
      if (r <= 0) {
        key = k as EnemyType
        break
      }
    }
    const d = ENEMY_DEFS[key]
    let ex: number
    let ey: number
    if (key === 'drone') {
      // Les drones arrivent par les airs : anneau autour du joueur, murs ignorés.
      const ang = Math.random() * Math.PI * 2
      const rad = Math.max(this.vw, this.vh) * 0.62 + 60
      ex = Math.max(30, Math.min(this.level.W - 30, this.p.x + Math.cos(ang) * rad))
      ey = Math.max(30, Math.min(this.level.H - 30, this.p.y + Math.sin(ang) * rad))
    } else {
      // Au sol : cellule jouable hors écran dans un anneau de distance.
      const rmin = Math.max(this.vw, this.vh) * 0.5 + 80
      const pt = this.level.randomSpawnPoint(this.p.x, this.p.y, rmin, rmin + 560, this.cam.x, this.cam.y, this.vw, this.vh)
      if (!pt) return
      ex = pt.x
      ey = pt.y
    }
    const elite = t > 78 && Math.random() < 0.07
    const hpScale = 1 + t * 0.010
    const e = this.enemies[this.enemyCount++]
    e.type = key
    e.spr = d.spr
    e.x = ex
    e.y = ey
    e.hp = d.hp * hpScale * (elite ? 2.4 : 1)
    e.maxHp = e.hp
    e.spd = d.spd * (elite ? 0.85 : 1)
    e.dmg = d.dmg * (elite ? 1.6 : 1)
    e.size = d.size * (elite ? 1.4 : 1)
    e.xp = d.xp * (elite ? 4 : 1)
    e.face = 1
    e.hitT = 0
    e.flash = 0
    e.elite = elite
    e.scale = elite ? 1.4 : 1
  }

  private explode(x: number, y: number, radius: number, dmg: number, col: string): void {
    // Dégâts + recul via le hash spatial (portée bombe < 2 cellules).
    const L = this.level
    const cols = L.cols
    const rows = L.rows
    const reach = radius + 45
    const c0x = Math.max(0, ((x - reach) / CELL) | 0)
    const c1x = Math.min(cols - 1, ((x + reach) / CELL) | 0)
    const c0y = Math.max(0, ((y - reach) / CELL) | 0)
    const c1y = Math.min(rows - 1, ((y + reach) / CELL) | 0)
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        for (let j = this.hashHeads[cy * cols + cx]; j !== -1; j = this.hashNext[j]) {
          const e = this.enemies[j]
          const d = Math.hypot(e.x - x, e.y - y)
          if (d < radius + e.size * 0.4) {
            e.hp -= dmg
            e.flash = 1
            // Recul, borné par les murs pour ne pas éjecter un ennemi dans un bâtiment.
            const k = Math.max(0, 1 - d / radius) * 40
            const a = Math.atan2(e.y - y, e.x - x)
            if (e.type === 'drone') {
              e.x += Math.cos(a) * k
              e.y += Math.sin(a) * k
            } else {
              L.moveCircle(e, Math.cos(a) * k, Math.sin(a) * k, e.size * 0.28)
            }
          }
        }
      }
    }
    // Splat de peinture permanent (ring buffer : recouvre le plus ancien).
    const sp = this.splats[this.splatHead]
    this.splatHead = (this.splatHead + 1) % POOL_SPLATS
    sp.x = x
    sp.y = y
    sp.col = col
    sp.nb = 5 + ((Math.random() * 4) | 0)
    for (let i = 0; i < sp.nb; i++) {
      const b = sp.blobs[i]
      b.dx = (Math.random() - 0.5) * radius * 1.1
      b.dy = (Math.random() - 0.5) * radius * 1.1
      b.r = radius * (0.18 + Math.random() * 0.34)
    }
    // Particules (bornées par le budget du profil)
    const budget = this.effMaxParticles()
    for (let i = 0; i < 16; i++) {
      if (this.partCount >= budget) break
      const q = this.parts[this.partCount++]
      const a = Math.random() * 7
      const s = 60 + Math.random() * 220
      q.x = x
      q.y = y
      q.vx = Math.cos(a) * s
      q.vy = Math.sin(a) * s
      q.r = 2 + Math.random() * 4
      q.col = col
      q.life = 0.4 + Math.random() * 0.4
      q.max = 0.8
    }
    this.shake = Math.min(12, this.shake + radius * 0.06)
  }

  // Mot flottant explicite (pool FloatTag) — sert au feedback des portes.
  private spawnWord(x: number, y: number, txt: string, col: string, life: number): void {
    if (this.tagCount >= POOL_TAGS) return
    const tg = this.tags[this.tagCount++]
    tg.x = x
    tg.y = y
    tg.txt = txt
    tg.col = col
    tg.life = life
  }

  private spawnTag(x: number, y: number): void {
    this.spawnWord(x, y, KILL_WORDS[(Math.random() * KILL_WORDS.length) | 0], NEONS[(Math.random() * 4) | 0], 0.9)
  }

  // ---------- progression : peinture cumulée → déblocages ----------
  private gainPaint(v: number): void {
    this.p.paint += v
    for (const w of this.weapons) {
      if (!w.unlocked && this.p.paint >= w.cost) {
        w.unlocked = true
        this.hooks.unlock({ name: w.name, color: w.color, slot: w.slot })
        this.emitWeapons()
      }
    }
  }

  private gameOver(): void {
    this.state = 'over'
    this.hooks.gameOver({ time: this.fmt(this.time), kills: this.kills, paint: this.p.paint })
  }

  private fmt(t: number): string {
    const m = Math.floor(t / 60)
    const s = Math.floor(t % 60)
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
  }

  // ---------- rendu ----------
  private glow(col: string, x: number, y: number, size: number, a: number): void {
    const g = this.glows[col] || this.glows['#ffffff']
    const ctx = this.ctx
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = a
    ctx.drawImage(g, x - size / 2, y - size / 2, size, size)
    ctx.restore()
  }

  private render(): void {
    const ctx = this.ctx
    if (!ctx) return
    this.frameNo++
    const dpr = this.dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, this.vw, this.vh)

    let sx = 0
    let sy = 0
    if (this.shake > 0) {
      sx = (Math.random() - 0.5) * this.shake
      sy = (Math.random() - 0.5) * this.shake
    }
    ctx.save()
    ctx.translate(-this.cam.x + sx, -this.cam.y + sy)

    // Décor statique : blit des tuiles pré-rendues (sol, murs, graffitis, logos…).
    this.level.drawStatic(ctx, this.cam.x, this.cam.y, this.vw, this.vh, this.frameNo)

    // Cadre de culling de la frame (marge du profil).
    const m = this.profile.cullMargin
    const x0 = this.cam.x - m
    const x1 = this.cam.x + this.vw + m
    const y0 = this.cam.y - m
    const y1 = this.cam.y + this.vh + m

    // Politique d'effets de la frame (lue par drawEnemy).
    this.frGlowMode = this.enemyGlowMode()
    this.frNearD2 = this.profile.glowNearDist * this.profile.glowNearDist
    this.frShadows = this.shadowsOn()
    this.frFx = this.profile.shotGlow && this.perfLevel === 0

    const p = this.p

    // Splats de peinture (ring ; les blobs débordent → marge élargie)
    for (let i = 0; i < POOL_SPLATS; i++) {
      const s = this.splats[i]
      if (s.nb === 0) continue
      if (s.x < x0 - 140 || s.x > x1 + 140 || s.y < y0 - 140 || s.y > y1 + 140) continue
      ctx.globalAlpha = 0.82
      ctx.fillStyle = s.col
      for (let b = 0; b < s.nb; b++) {
        const bl = s.blobs[b]
        ctx.beginPath()
        ctx.arc(s.x + bl.dx, s.y + bl.dy, bl.r, 0, 7)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    // Orbes de peinture (halo composite seulement si le profil le permet)
    for (let i = 0; i < this.orbCount; i++) {
      const o = this.orbs[i]
      if (o.x < x0 || o.x > x1 || o.y < y0 || o.y > y1) continue
      if (this.frFx) {
        this.glow(o.col, o.x, o.y, 20, 0.7)
        ctx.fillStyle = '#f4feff'
        ctx.beginPath()
        ctx.arc(o.x, o.y, 3.4, 0, 7)
        ctx.fill()
      } else {
        // Version mobile : deux disques pleins, pas de composite 'lighter'.
        ctx.globalAlpha = 0.8
        ctx.fillStyle = o.col
        ctx.beginPath()
        ctx.arc(o.x, o.y, 5, 0, 7)
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.fillStyle = '#f4feff'
        ctx.beginPath()
        ctx.arc(o.x, o.y, 2.4, 0, 7)
        ctx.fill()
      }
    }

    // Caches de peinture : sprite baké + halo magenta pulsé (3 max par run,
    // toujours affiché même en profil bas — c'est un objectif, pas du décor).
    for (let i = 0; i < this.level.caches.length; i++) {
      const c = this.level.caches[i]
      if (c.taken) continue
      if (c.x < x0 || c.x > x1 || c.y < y0 || c.y > y1) continue
      this.glow('#ff00cc', c.x, c.y - 12, 44, 0.38 + 0.18 * Math.sin(this.time * 3.2))
      drawSprite(ctx, this.propSpr.cache, c.x, c.y, 3.5, 1)
    }

    // Tri en profondeur : créneaux persistants, entités cullées à l'insertion.
    const slots = this.sortSlots
    let n = 0
    for (const b of this.level.benches) {
      if (b.x < x0 || b.x > x1 || b.y < y0 || b.y > y1) continue
      const sl = slots[n++]
      sl.y = b.y + 12
      sl.kind = 0
      sl.ref = b
    }
    for (const pl of this.level.pillars) {
      if (pl.x < x0 || pl.x > x1 || pl.y < y0 || pl.y > y1) continue
      const sl = slots[n++]
      sl.y = pl.y + 24
      sl.kind = 1
      sl.ref = pl
    }
    for (const pr of this.level.props) {
      if (pr.x < x0 || pr.x > x1 || pr.y < y0 || pr.y > y1) continue
      const sl = slots[n++]
      sl.y = pr.y
      sl.kind = 4
      sl.ref = pr
    }
    for (let i = 0; i < this.enemyCount; i++) {
      const e = this.enemies[i]
      if (e.x < x0 || e.x > x1 || e.y < y0 || e.y > y1) continue
      const sl = slots[n++]
      sl.y = e.y
      sl.kind = 2
      sl.ref = e
    }
    {
      const sl = slots[n++]
      sl.y = p.y
      sl.kind = 3
      sl.ref = null
    }
    for (let i = n; i < slots.length; i++) slots[i].y = Infinity
    slots.sort(SORT_BY_Y)
    for (let i = 0; i < slots.length; i++) {
      const sl = slots[i]
      if (sl.y === Infinity) break
      switch (sl.kind) {
        case 0: {
          const b = sl.ref as { x: number; y: number }
          this.drawBench(b.x, b.y)
          break
        }
        case 1: {
          const pl = sl.ref as { x: number; y: number }
          this.drawPillar(pl.x, pl.y)
          break
        }
        case 2:
          this.drawEnemy(sl.ref as EnemyEnt)
          break
        case 3:
          this.drawPlayer()
          break
        case 4:
          this.drawProp(sl.ref as PropInst)
          break
      }
    }

    // Cap vers la porte fraîchement ouverte : pointillés cyan depuis le joueur
    // (même style que l'indicateur de visée, fade avec le ttl — zéro alloc).
    if (this.state === 'playing' && this.gateHint.ttl > 0) {
      const gh = this.gateHint
      const gdx = gh.x - p.x
      const gdy = gh.y - (p.y - 12)
      const gd = Math.hypot(gdx, gdy)
      if (gd > 60) {
        const fade = Math.min(1, this.gateHint.ttl / GATE_HINT_TTL)
        ctx.fillStyle = '#00eaff'
        for (let i = 0; i < 3; i++) {
          const dist = 52 + i * 16
          ctx.globalAlpha = 0.6 * fade * (1 - i * 0.22)
          ctx.beginPath()
          ctx.arc(p.x + (gdx / gd) * dist, p.y - 12 + (gdy / gd) * dist, 2.6, 0, 7)
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }
    }

    // Indicateur de visée : pointillés dans la direction du tir.
    if (this.state === 'playing') {
      const w = this.weapons.find((x) => x.id === this.activeId)!
      const baseA = p.firing ? 0.55 : 0.22
      ctx.fillStyle = w.color
      for (let i = 0; i < 3; i++) {
        const dist = 26 + i * 15
        ctx.globalAlpha = baseA * (1 - i * 0.28)
        ctx.beginPath()
        ctx.arc(p.x + p.aimX * dist, p.y - 12 + p.aimY * dist, 2.4, 0, 7)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    // Projectiles directs
    for (let i = 0; i < this.shotCount; i++) {
      const s = this.shots[i]
      if (s.x < x0 || s.x > x1 || s.y < y0 || s.y > y1) continue
      const a = s.kind === 'aero' ? Math.max(0, s.ttl / s.max) : 1
      if (s.kind === 'shot' && this.frFx) this.glow(s.col, s.x, s.y, 16, 0.5)
      ctx.globalAlpha = a
      ctx.fillStyle = s.col
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.r, 0, 7)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // Bombes en vol (hop parabolique — rares, on garde leur halo)
    for (let i = 0; i < this.bombCount; i++) {
      const b = this.bombs[i]
      if (b.x < x0 || b.x > x1 || b.y < y0 || b.y > y1) continue
      const hop = Math.sin(b.prog * Math.PI) * 18
      ctx.globalAlpha = 0.4
      ctx.drawImage(this.shadow, b.x - 8, b.y, 16, 7)
      ctx.globalAlpha = 1
      const by = b.y - hop
      this.glow(b.col, b.x, by, 22, 0.8)
      ctx.save()
      ctx.translate(b.x, by)
      ctx.rotate(b.rot)
      ctx.fillStyle = '#141518'
      ctx.fillRect(-5, -5, 10, 10)
      ctx.fillStyle = b.col
      ctx.fillRect(-2, -2, 4, 4)
      ctx.restore()
    }

    // Particules
    for (let i = 0; i < this.partCount; i++) {
      const q = this.parts[i]
      if (q.x < x0 || q.x > x1 || q.y < y0 || q.y > y1) continue
      ctx.globalAlpha = Math.max(0, q.life / q.max)
      ctx.fillStyle = q.col
      ctx.beginPath()
      ctx.arc(q.x, q.y, q.r, 0, 7)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // Mots flottants (police définie UNE fois pour le lot)
    if (this.tagCount > 0) {
      ctx.font = "12px 'Press Start 2P', monospace"
      ctx.textAlign = 'center'
      for (let i = 0; i < this.tagCount; i++) {
        const tg = this.tags[i]
        if (tg.x < x0 || tg.x > x1 || tg.y < y0 || tg.y > y1) continue
        ctx.globalAlpha = Math.min(1, tg.life * 1.6)
        ctx.fillStyle = '#0a0a0c'
        ctx.fillText(tg.txt, tg.x + 2, tg.y + 2)
        ctx.fillStyle = tg.col
        ctx.fillText(tg.txt, tg.x, tg.y)
      }
      ctx.globalAlpha = 1
      ctx.textAlign = 'left'
    }

    ctx.restore()

    // Minimap (espace écran, coin haut-droit) : layout baké par level.ts +
    // points dynamiques. Coût par frame : 1 drawImage + ~6 fills, zéro alloc.
    if (this.state === 'playing') this.drawMinimap()
  }

  // Minimap : joueur, rect caméra, caches actifs (clignotants), boss.
  private drawMinimap(): void {
    const ctx = this.ctx
    const L = this.level
    const box = Math.min(150, Math.max(96, this.vw * 0.16))
    const mini = L.getMinimap(box)
    const ms = mini.width / L.W
    const mx = this.vw - mini.width - 12
    const my = 56 // sous le lien MENU (haut-droit)
    ctx.globalAlpha = 0.85
    ctx.fillStyle = 'rgba(0,4,10,0.78)'
    ctx.fillRect(mx - 4, my - 4, mini.width + 8, mini.height + 8)
    ctx.drawImage(mini, mx, my)
    ctx.strokeStyle = 'rgba(0,234,255,0.3)'
    ctx.lineWidth = 1
    ctx.strokeRect(mx - 4.5, my - 4.5, mini.width + 9, mini.height + 9)
    // Rect caméra (repère d'orientation)
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.strokeRect(mx + this.cam.x * ms, my + this.cam.y * ms, this.vw * ms, this.vh * ms)
    // Caches de peinture actifs : point magenta clignotant
    const blink = 0.55 + 0.45 * Math.sin(this.time * 5)
    ctx.fillStyle = '#ff00cc'
    for (let i = 0; i < L.caches.length; i++) {
      const c = L.caches[i]
      if (c.taken) continue
      ctx.globalAlpha = 0.85 * blink
      ctx.fillRect(mx + c.x * ms - 2, my + c.y * ms - 2, 4, 4)
    }
    // Boss vivant : point rouge glitch clignotant
    if (this.bossRef) {
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.time * 6)
      ctx.fillStyle = '#ff004c'
      ctx.fillRect(mx + this.bossRef.x * ms - 2.5, my + this.bossRef.y * ms - 2.5, 5, 5)
    }
    // Joueur : point blanc cerclé néon
    ctx.globalAlpha = 1
    ctx.fillStyle = this.neon
    ctx.fillRect(mx + this.p.x * ms - 3, my + this.p.y * ms - 3, 6, 6)
    ctx.fillStyle = '#f4feff'
    ctx.fillRect(mx + this.p.x * ms - 1.5, my + this.p.y * ms - 1.5, 3, 3)
  }

  // Dessin d'un ennemi selon la politique d'effets de la frame.
  private drawEnemy(e: EnemyEnt): void {
    const ctx = this.ctx
    const sp = this.spr[e.spr]
    const sc = 3.5 * e.scale
    if (this.frShadows) {
      ctx.globalAlpha = 0.5
      ctx.drawImage(this.shadow, e.x - 14, e.y + 2, 28, 12)
      ctx.globalAlpha = 1
    }
    // Halo : full → toujours ; near → elites + proches du joueur ; elite → elites.
    let glowOn = false
    if (this.frGlowMode === 'full') glowOn = true
    else if (this.frGlowMode === 'near') {
      const dx = e.x - this.p.x
      const dy = e.y - this.p.y
      glowOn = e.elite || dx * dx + dy * dy < this.frNearD2
    } else if (this.frGlowMode === 'elite') glowOn = e.elite
    if (glowOn) {
      if (e.type === 'drone') this.glow(sp.glow, e.x, e.y, 34 * e.scale, 0.5)
      else this.glow(sp.glow, e.x, e.y - 4, 30 * e.scale, 0.38)
    }
    drawSprite(ctx, sp, e.x, e.y, sc, e.face)
    if (e.flash > 0) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = e.flash * 0.8
      ctx.fillStyle = '#fff'
      ctx.fillRect(e.x - (sp.w * sc) / 2, e.y - sp.h * sc, sp.w * sc, sp.h * sc)
      ctx.restore()
    }
  }

  private drawPlayer(): void {
    const ctx = this.ctx
    const p = this.p
    if (this.frShadows) {
      ctx.globalAlpha = 0.5
      ctx.drawImage(this.shadow, p.x - 16, p.y + 2, 32, 13)
      ctx.globalAlpha = 1
    }
    // Halo vert discret quand on régénère (hors combat), sinon halo néon.
    const regen = p.safe > REGEN_DELAY && p.hp < p.maxHp
    this.glow(regen ? '#39ff14' : this.neon, p.x, p.y - 6, 34, regen ? 0.5 : 0.45)
    // Clignotement pendant l'i-frame pour signaler l'invulnérabilité.
    ctx.globalAlpha = p.hurt > 0 ? 0.45 + 0.3 * Math.sin(this.time * 40) : 1
    drawSprite(ctx, this.spr.player, p.x, p.y, 3.5, p.face)
    ctx.globalAlpha = 1
  }

  private drawPillar(x: number, y: number): void {
    const ctx = this.ctx
    const s = 58
    if (this.frShadows) {
      ctx.globalAlpha = 0.45
      ctx.drawImage(this.shadow, x - s * 0.85, y + s * 0.26, s * 1.7, s * 0.62)
      ctx.globalAlpha = 1
    }
    ctx.fillStyle = '#0d0e11'
    ctx.fillRect(x - s / 2 - 3, y - s / 2 - 3, s + 6, s + 6)
    ctx.fillStyle = '#3d4149'
    ctx.fillRect(x - s / 2, y - s / 2, s, s)
    ctx.fillStyle = '#50555e'
    ctx.fillRect(x - s / 2, y - s / 2, s, 10)
    ctx.fillStyle = '#2c2f35'
    ctx.fillRect(x - s / 2, y + s / 2 - 14, s, 14)
    const seg = s / 6
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? '#ffaa00' : '#17181c'
      ctx.fillRect(x - s / 2 + i * seg, y + s / 2 - 6, seg, 6)
    }
    ctx.fillStyle = NEONS[((x / 560) | 0) % 4]
    ctx.globalAlpha = 0.8
    ctx.fillRect(x - 14, y - 6, 20, 4)
    ctx.fillRect(x - 8, y + 2, 16, 4)
    ctx.fillRect(x - 16, y + 10, 12, 4)
    ctx.globalAlpha = 1
  }

  // Mobilier urbain : sprite baké (buildProps), ancre au pied, flip aléatoire
  // fixé au placement. Pas de halo : le décor reste sobre, budget mobile oblige.
  private drawProp(pr: PropInst): void {
    const ctx = this.ctx
    const sp = this.propSpr[pr.key]
    if (!sp) return
    const w = sp.w * 3.5
    if (this.frShadows) {
      ctx.globalAlpha = 0.4
      ctx.drawImage(this.shadow, pr.x - w * 0.45, pr.y - 3, w * 0.9, 11)
      ctx.globalAlpha = 1
    }
    drawSprite(ctx, sp, pr.x, pr.y, 3.5, pr.flip)
  }

  private drawBench(x: number, y: number): void {
    const ctx = this.ctx
    const w = 132
    const h = 38
    if (this.frShadows) {
      ctx.globalAlpha = 0.4
      ctx.drawImage(this.shadow, x - w / 2, y + h / 2 - 8, w, 18)
      ctx.globalAlpha = 1
    }
    ctx.fillStyle = '#0f1013'
    ctx.fillRect(x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4)
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? '#59452e' : '#6a5338'
      ctx.fillRect(x - w / 2, y - h / 2 + i * (h / 4) + 1, w, h / 4 - 2)
    }
    ctx.fillStyle = '#22242a'
    ctx.fillRect(x - w / 2, y - h / 2, 6, h)
    ctx.fillRect(x + w / 2 - 6, y - h / 2, 6, h)
  }

  // Accès debug (uniquement en dev, via GameCanvas)
  get debugInfo(): {
    chunks: string[]; W: number; H: number; enemies: number; time: number
    player: { x: number; y: number }; paint: number; firing: boolean
    aim: { x: number; y: number }; active: string; shots: number
    weapons: { id: string; unlocked: boolean }[]
    profile: string; perfLevel: number; frameMs: number; dpr: number; parts: number
    gatesOpen: number; gatesTotal: number; gateTier: number
    boss: number | null
    cachesLeft: number
  } {
    return {
      chunks: this.level.chunkNames,
      W: this.level.W,
      H: this.level.H,
      enemies: this.enemyCount,
      time: this.time,
      player: { x: this.p.x, y: this.p.y },
      paint: this.p.paint,
      firing: this.p.firing,
      aim: { x: this.p.aimX, y: this.p.aimY },
      active: this.activeId,
      shots: this.shotCount,
      weapons: this.weapons.map((w) => ({ id: w.id, unlocked: w.unlocked })),
      profile: this.profile.name,
      perfLevel: this.perfLevel,
      frameMs: this.frameEma,
      dpr: this.dpr,
      parts: this.partCount,
      gatesOpen: this.level.gates.filter((g) => g.open).length,
      gatesTotal: this.level.gates.length,
      gateTier: this.gateTier,
      boss: this.bossRef ? Math.round(this.bossRef.hp) : null,
      cachesLeft: this.level.caches.filter((c) => !c.taken).length,
    }
  }
}
