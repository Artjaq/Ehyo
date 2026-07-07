// Moteur du jeu : boucle rAF, entrées, entités, combat, rendu Canvas 2D.
// Porté du prototype "Neon Graffiti Survivor", puis retravaillé :
//  - le tir automatique est REMPLACÉ par une visée manuelle (double joystick
//    tactile sur mobile, souris + clic maintenu sur desktop) ;
//  - les cartes d'amélioration aléatoires sont REMPLACÉES par des armes
//    débloquées à des paliers de peinture ramassée (les anciennes orbes d'XP
//    servent de monnaie de progression cumulative) ;
//  - l'arène codée en dur est remplacée par le système de chunks de level.ts.
//
// IMPORTANT : tout l'état vit ici, dans des objets simples — jamais dans la
// réactivité Vue. La communication avec le composant passe par des hooks
// basse fréquence + un hook HUD par frame écrit en DOM direct côté composant.

import { buildGlows, buildSprites, buildTile, drawSprite, NEONS, type BakedSprite } from './sprites'
import { generateLevel, Level } from './level'

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

export interface GameOverStats {
  time: string
  kills: number
  paint: number
}

export interface EngineHooks {
  hud(h: HudState): void
  weapons(list: WeaponUi[]): void // à chaque déblocage / changement d'arme
  unlock(info: UnlockInfo): void // toast "nouvelle arme"
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
    { id: 'spray', slot: 1, name: 'SPRAY CAN', tag: 'S', color: '#22e0e0', cost: 0, rate: 0.16, cd: 0, unlocked: true },
    // Éventail : 5 gouttes en cône, contrôle de foule à courte-moyenne portée.
    { id: 'fan', slot: 2, name: 'FAT CAP', tag: 'F', color: '#e8ff33', cost: 35, rate: 0.55, cd: 0, unlocked: false },
    // Bombe lobée : explose en zone à l'impact (le splat signature du proto).
    { id: 'bomb', slot: 3, name: 'PAINT BOMB', tag: 'B', color: '#ff2fb9', cost: 100, rate: 0.9, cd: 0, unlocked: false },
    // Jet d'aérosol continu : lance-flamme courte portée, gros DPS risqué.
    { id: 'aero', slot: 4, name: 'AERO TORCH', tag: 'A', color: '#6cff3a', cost: 200, rate: 0.045, cd: 0, unlocked: false },
  ]
}

const BOMB_THROW = 330 // distance de lancer fixe (la direction vient de la visée)
const BOMB_RADIUS = 80
const BOMB_DMG = 40

// ---------------------------------------------------------------------------
// Entités
// ---------------------------------------------------------------------------
interface PlayerState {
  x: number; y: number
  hp: number; maxHp: number
  speed: number; face: number
  aimX: number; aimY: number // dernière direction de visée (normalisée)
  firing: boolean
  paint: number // peinture cumulée = monnaie de progression
}

type EnemyType = 'dog' | 'tagger' | 'cop' | 'buffer' | 'drone'

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
interface SplatDecal { x: number; y: number; col: string; blobs: { dx: number; dy: number; r: number }[] }
interface FloatTag { x: number; y: number; txt: string; col: string; life: number }

interface JoyState { id: number; ox: number; oy: number; x: number; y: number }

type EngineState = 'idle' | 'playing' | 'over'

const ENEMY_DEFS: Record<EnemyType, { spr: string; hp: number; spd: number; dmg: number; size: number; xp: number }> = {
  dog: { spr: 'dog', hp: 26, spd: 118, dmg: 7, size: 26, xp: 3 },
  tagger: { spr: 'tagger', hp: 46, spd: 74, dmg: 9, size: 30, xp: 4 },
  cop: { spr: 'cop', hp: 64, spd: 56, dmg: 13, size: 32, xp: 6 },
  buffer: { spr: 'buffer', hp: 96, spd: 44, dmg: 11, size: 36, xp: 8 },
  drone: { spr: 'drone', hp: 24, spd: 88, dmg: 6, size: 26, xp: 3 },
}

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
  private neon = '#ff2fb9'
  private dm = 1

  private spr!: Record<string, BakedSprite>
  private glows!: Record<string, HTMLCanvasElement>
  private shadow!: HTMLCanvasElement
  private tilePattern!: CanvasPattern

  private level!: Level
  private p!: PlayerState
  private cam = { x: 0, y: 0 }
  private weapons: WeaponDef[] = makeWeapons()
  private activeId: WeaponKind = 'spray'
  private enemies: EnemyEnt[] = []
  private shots: ShotEnt[] = []
  private bombs: BombEnt[] = []
  private orbs: OrbEnt[] = []
  private parts: PartEnt[] = []
  private splats: SplatDecal[] = []
  private tags: FloatTag[] = []

  private time = 0
  private kills = 0
  private spawnT = 0
  private shake = 0
  private flowT = 0

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

  // ---------- cycle de vie ----------
  init(opts: EngineOptions): void {
    this.wrap = opts.wrap
    this.canvas = opts.canvas
    this.moveJoyBase = opts.moveJoyBase
    this.moveJoyStick = opts.moveJoyStick
    this.aimJoyBase = opts.aimJoyBase
    this.aimJoyStick = opts.aimJoyStick
    this.hooks = opts.hooks
    this.neon = opts.neon || '#ff2fb9'
    this.dm = { easy: 0.8, normal: 1, hard: 1.35 }[opts.difficulty || 'normal']

    this.ctx = this.canvas.getContext('2d')!
    this.spr = buildSprites(this.neon)
    const gk = buildGlows(this.neon)
    this.glows = gk.glows
    this.shadow = gk.shadow
    this.tilePattern = this.ctx.createPattern(buildTile(), 'repeat')!

    document.fonts?.load("700 16px 'Silkscreen'").catch(() => {})

    const sig = this.ac.signal
    window.addEventListener('keydown', this.onKey, { signal: sig })
    window.addEventListener('keyup', this.onKey, { signal: sig })
    this.wrap.addEventListener('pointerdown', (e) => this.onPointer('down', e), { signal: sig })
    this.wrap.addEventListener('pointermove', (e) => this.onPointer('move', e), { signal: sig })
    this.wrap.addEventListener('pointerup', (e) => this.onPointer('up', e), { signal: sig })
    this.wrap.addEventListener('pointercancel', (e) => this.onPointer('up', e), { signal: sig })
    this.wrap.addEventListener('wheel', (e) => this.onWheel(e), { signal: sig, passive: true })

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

  // (Re)génère un monde + état frais. Nouveau layout de rues à chaque run.
  private initWorld(): void {
    this.level = generateLevel()
    this.p = {
      x: this.level.spawnX, y: this.level.spawnY,
      hp: 110, maxHp: 110, speed: 158, face: 1,
      aimX: 1, aimY: 0, firing: false,
      paint: 0,
    }
    this.weapons = makeWeapons()
    this.activeId = 'spray'
    this.enemies = []
    this.shots = []
    this.bombs = []
    this.orbs = []
    this.parts = []
    this.splats = []
    this.tags = []
    this.time = 0
    this.kills = 0
    this.spawnT = 0
    this.shake = 0
    this.flowT = 0
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

  // Vecteur de déplacement : clavier + stick gauche.
  private moveVec(): { x: number; y: number } {
    let x = 0
    let y = 0
    const k = this.keys
    if (k.a || k.arrowleft) x -= 1
    if (k.d || k.arrowright) x += 1
    if (k.w || k.arrowup) y -= 1
    if (k.s || k.arrowdown) y += 1
    if (this.moveJoy) {
      const dx = this.moveJoy.x - this.moveJoy.ox
      const dy = this.moveJoy.y - this.moveJoy.oy
      const d = Math.hypot(dx, dy)
      if (d > 8) {
        x = dx / d
        y = dy / d
      }
    }
    const m = Math.hypot(x, y)
    if (m > 1) {
      x /= m
      y /= m
    }
    return { x, y }
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
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    this.vw = Math.max(320, r.width)
    this.vh = Math.max(320, r.height)
    this.canvas.width = Math.floor(this.vw * this.dpr)
    this.canvas.height = Math.floor(this.vh * this.dpr)
  }

  // ---------- boucle ----------
  private loop(t: number): void {
    if (this.destroyed) return
    let dt = (t - this.last) / 1000
    this.last = t
    if (dt > 0.05) dt = 0.05
    if (this.state === 'playing') this.update(dt)
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

    // Déplacement : collision grille (glissement) + obstacles circulaires.
    const mv = this.moveVec()
    L.moveCircle(p, mv.x * p.speed * dt, mv.y * p.speed * dt, 12)
    this.pushOut(p, 12)

    this.updateCamera()

    // Visée + tir manuel. Le perso regarde où il vise quand il tire,
    // sinon dans sa direction de déplacement.
    p.firing = this.resolveAim()
    if (p.firing) p.face = p.aimX < 0 ? -1 : 1
    else if (mv.x) p.face = mv.x < 0 ? -1 : 1

    // Cadence : décompte permanent, tir tant que maintenu (rattrape les frames longues).
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

    // Flow field pour le pathing des ennemis au sol.
    this.flowT -= dt
    if (this.flowT <= 0) {
      this.flowT = 0.35
      L.computeFlow(p.x, p.y)
    }

    // Vagues (inchangé) : intervalle qui se resserre, batch qui grossit.
    this.spawnT -= dt
    const interval = Math.max(0.3, 1.5 - this.time * 0.013) / this.dm
    if (this.spawnT <= 0 && this.enemies.length < 240) {
      this.spawnT = interval
      const batch = 1 + Math.floor(this.time / 26)
      for (let i = 0; i < batch; i++) this.spawnEnemy()
    }

    // Ennemis
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i]
      const dx = p.x - e.x
      const dy = p.y - e.y
      const d = Math.hypot(dx, dy) || 1
      if (e.type === 'drone') {
        e.x += (dx / d) * e.spd * dt
        e.y += (dy / d) * e.spd * dt
      } else {
        const fs = L.steer(e.x, e.y)
        const ux = fs ? fs.x : dx / d
        const uy = fs ? fs.y : dy / d
        L.moveCircle(e, ux * e.spd * dt, uy * e.spd * dt, e.size * 0.28)
        this.pushOut(e, e.size * 0.28)
      }
      e.face = dx < 0 ? -1 : 1
      e.hitT -= dt
      if (d < e.size * 0.5 + 12 && e.hitT <= 0) {
        e.hitT = 0.6
        p.hp -= e.dmg * this.dm
        this.shake = Math.min(9, this.shake + 4)
        if (p.hp <= 0) return this.gameOver()
      }
      e.flash = Math.max(0, e.flash - dt * 6)
      if (e.hp <= 0) {
        this.enemies.splice(i, 1)
        this.kills++
        this.orbs.push({
          x: e.x, y: e.y, xp: e.xp,
          vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40,
          col: NEONS[(Math.random() * 4) | 0],
        })
        if (Math.random() < 0.14) this.spawnTag(e.x, e.y)
      }
    }

    // Projectiles directs (spray / éventail / aérosol)
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]
      s.x += s.vx * dt
      s.y += s.vy * dt
      s.ttl -= dt
      if (s.ttl <= 0) {
        this.shots.splice(i, 1)
        continue
      }
      // La peinture s'écrase sur les murs.
      if (!L.walkableAt(s.x, s.y)) {
        this.puff(s.x, s.y, s.col, 2)
        this.shots.splice(i, 1)
        continue
      }
      for (const e of this.enemies) {
        const dd = Math.hypot(e.x - s.x, (e.y - 10) - s.y) // corps ≈ 10px au-dessus des pieds
        if (dd < e.size * 0.4 + s.r) {
          e.hp -= s.dmg
          e.flash = 1
          this.puff(s.x, s.y, s.col, s.kind === 'aero' ? 1 : 3)
          this.shots.splice(i, 1)
          break
        }
      }
    }

    // Bombes lobées → explosion en zone à l'arrivée.
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i]
      const dx = b.tx - b.x
      const dy = b.ty - b.y
      const d = Math.hypot(dx, dy) || 1
      const step = b.spd * dt
      b.rot += dt * 14
      if (d <= step + 4) {
        this.explode(b.tx, b.ty, BOMB_RADIUS, BOMB_DMG, b.col)
        this.bombs.splice(i, 1)
      } else {
        b.x += (dx / d) * step
        b.y += (dy / d) * step
        b.prog = 1 - d / (Math.hypot(b.tx - b.sx, b.ty - b.sy) || 1)
      }
    }

    // Orbes de peinture : dérive + aimant + ramassage → progression.
    for (let i = this.orbs.length - 1; i >= 0; i--) {
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
        this.orbs.splice(i, 1)
        this.gainPaint(o.xp)
      }
    }

    // Particules
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i]
      q.x += q.vx * dt
      q.y += q.vy * dt
      q.vx *= 0.92
      q.vy *= 0.92
      q.life -= dt
      if (q.life <= 0) this.parts.splice(i, 1)
    }
    // Mots flottants
    for (let i = this.tags.length - 1; i >= 0; i--) {
      const tg = this.tags[i]
      tg.y -= 26 * dt
      tg.life -= dt
      if (tg.life <= 0) this.tags.splice(i, 1)
    }

    if (this.splats.length > 60) this.splats.splice(0, this.splats.length - 60)
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 22)

    // HUD (écrit en DOM direct côté composant)
    const next = this.weapons.find((w) => !w.unlocked) || null
    const prev = next ? Math.max(0, ...this.weapons.filter((w) => w.unlocked).map((w) => w.cost)) : 0
    this.hooks.hud({
      hpPct: Math.max(0, (p.hp / p.maxHp) * 100),
      hp: Math.max(0, Math.ceil(p.hp)),
      paint: p.paint,
      paintPct: next ? Math.min(100, ((p.paint - prev) / (next.cost - prev)) * 100) : 100,
      nextCost: next ? next.cost : null,
      time: this.fmt(this.time),
      kills: this.kills,
    })
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
        this.spawnShot(mx, my, base, 520, 10, 4, 1.1, '#22e0e0', 'shot')
        break
      case 'fan':
        // 5 gouttes en cône (~28°)
        for (let i = 0; i < 5; i++) this.spawnShot(mx, my, base + (i - 2) * 0.12, 470, 7, 4, 0.75, '#e8ff33', 'shot')
        break
      case 'bomb': {
        const tx = p.x + p.aimX * BOMB_THROW
        const ty = p.y + p.aimY * BOMB_THROW
        this.bombs.push({ x: mx, y: my, sx: mx, sy: my, tx, ty, prog: 0, spd: 430, col: NEONS[(Math.random() * 4) | 0], rot: 0 })
        break
      }
      case 'aero':
        // Jet continu : 2 particules par tick, jitter d'angle, portée courte.
        for (let i = 0; i < 2; i++) {
          const jitter = (Math.random() - 0.5) * 0.3
          const spd = 340 + Math.random() * 120
          this.spawnShot(mx, my, base + jitter, spd, 4, 3, 0.26 + Math.random() * 0.1, Math.random() < 0.5 ? '#6cff3a' : '#d0ff2a', 'aero')
        }
        break
    }
  }

  private spawnShot(x: number, y: number, angle: number, speed: number, dmg: number, r: number, ttl: number, col: string, kind: 'shot' | 'aero'): void {
    this.shots.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, ttl, max: ttl, dmg, r, col, kind })
  }

  // Petit nuage de gouttelettes à l'impact.
  private puff(x: number, y: number, col: string, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 7
      const s = 30 + Math.random() * 90
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 1.5 + Math.random() * 2.5, col, life: 0.18 + Math.random() * 0.2, max: 0.35 })
    }
  }

  private spawnEnemy(): void {
    const t = this.time
    const weights: Record<EnemyType, number> = {
      dog: 3 + Math.max(0, t * 0.02),
      tagger: 1.5 + t * 0.03,
      cop: t > 25 ? 1 + t * 0.03 : 0.2,
      buffer: t > 50 ? 0.8 + t * 0.02 : 0,
      drone: t > 15 ? 1 + t * 0.02 : 0.3,
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
      const ang = Math.random() * Math.PI * 2
      const rad = Math.max(this.vw, this.vh) * 0.62 + 60
      ex = Math.max(30, Math.min(this.level.W - 30, this.p.x + Math.cos(ang) * rad))
      ey = Math.max(30, Math.min(this.level.H - 30, this.p.y + Math.sin(ang) * rad))
    } else {
      const rmin = Math.max(this.vw, this.vh) * 0.5 + 80
      const pt = this.level.randomSpawnPoint(this.p.x, this.p.y, rmin, rmin + 560, this.cam.x, this.cam.y, this.vw, this.vh)
      if (!pt) return
      ex = pt.x
      ey = pt.y
    }
    const elite = t > 60 && Math.random() < 0.09
    const hpScale = 1 + t * 0.012
    this.enemies.push({
      type: key,
      spr: d.spr,
      x: ex,
      y: ey,
      hp: d.hp * hpScale * (elite ? 2.4 : 1),
      maxHp: d.hp * hpScale * (elite ? 2.4 : 1),
      spd: d.spd * (elite ? 0.85 : 1),
      dmg: d.dmg * (elite ? 1.6 : 1),
      size: d.size * (elite ? 1.4 : 1),
      xp: d.xp * (elite ? 4 : 1),
      face: 1,
      hitT: 0,
      flash: 0,
      elite,
      scale: elite ? 1.4 : 1,
    })
  }

  private explode(x: number, y: number, radius: number, dmg: number, col: string): void {
    for (const e of this.enemies) {
      const d = Math.hypot(e.x - x, e.y - y)
      if (d < radius + e.size * 0.4) {
        e.hp -= dmg
        e.flash = 1
        const k = Math.max(0, 1 - d / radius) * 40
        const a = Math.atan2(e.y - y, e.x - x)
        if (e.type === 'drone') {
          e.x += Math.cos(a) * k
          e.y += Math.sin(a) * k
        } else {
          this.level.moveCircle(e, Math.cos(a) * k, Math.sin(a) * k, e.size * 0.28)
        }
      }
    }
    const blobs: SplatDecal['blobs'] = []
    const nb = 5 + ((Math.random() * 4) | 0)
    for (let i = 0; i < nb; i++) {
      blobs.push({ dx: (Math.random() - 0.5) * radius * 1.1, dy: (Math.random() - 0.5) * radius * 1.1, r: radius * (0.18 + Math.random() * 0.34) })
    }
    this.splats.push({ x, y, col, blobs })
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * 7
      const s = 60 + Math.random() * 220
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 2 + Math.random() * 4, col, life: 0.4 + Math.random() * 0.4, max: 0.8 })
    }
    this.shake = Math.min(12, this.shake + radius * 0.06)
  }

  private spawnTag(x: number, y: number): void {
    this.tags.push({ x, y, txt: KILL_WORDS[(Math.random() * KILL_WORDS.length) | 0], col: NEONS[(Math.random() * 4) | 0], life: 0.9 })
  }

  private pushOut(ent: { x: number; y: number }, er: number): void {
    for (const o of this.level.obstacles) {
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

    this.level.draw(ctx, this.cam.x, this.cam.y, this.vw, this.vh, this.tilePattern)

    // Graffitis d'ambiance
    for (const d of this.level.decals) {
      if (d.x < this.cam.x - 120 || d.x > this.cam.x + this.vw + 120 || d.y < this.cam.y - 120 || d.y > this.cam.y + this.vh + 120) continue
      ctx.save()
      ctx.translate(d.x, d.y)
      ctx.rotate(d.rot)
      ctx.globalAlpha = d.a
      ctx.font = `700 ${d.sz}px 'Silkscreen', monospace`
      ctx.fillStyle = d.col
      ctx.fillText(d.txt, 0, 0)
      ctx.restore()
    }

    // Splats de peinture
    for (const s of this.splats) {
      ctx.save()
      ctx.globalAlpha = 0.82
      ctx.fillStyle = s.col
      for (const b of s.blobs) {
        ctx.beginPath()
        ctx.arc(s.x + b.dx, s.y + b.dy, b.r, 0, 7)
        ctx.fill()
      }
      ctx.restore()
    }

    // Orbes de peinture (colorées : ce sont des gouttes de bombe)
    for (const o of this.orbs) {
      this.glow(o.col, o.x, o.y, 20, 0.7)
      ctx.fillStyle = '#f4feff'
      ctx.beginPath()
      ctx.arc(o.x, o.y, 3.4, 0, 7)
      ctx.fill()
    }

    // Objets du monde triés en profondeur : bancs, piliers, ennemis, joueur.
    const S = 3.5
    const p = this.p
    const list: { y: number; f: () => void }[] = []
    for (const b of this.level.benches) list.push({ y: b.y + 12, f: () => this.drawBench(b.x, b.y) })
    for (const pl of this.level.pillars) list.push({ y: pl.y + 24, f: () => this.drawPillar(pl.x, pl.y) })
    for (const e of this.enemies) {
      list.push({
        y: e.y,
        f: () => {
          const sp = this.spr[e.spr]
          const sc = S * e.scale
          ctx.globalAlpha = 0.5
          ctx.drawImage(this.shadow, e.x - 14, e.y + 2, 28, 12)
          ctx.globalAlpha = 1
          if (e.type === 'drone') this.glow(sp.glow, e.x, e.y, 34 * e.scale, 0.5)
          else this.glow(sp.glow, e.x, e.y - 4, 30 * e.scale, 0.38)
          drawSprite(ctx, sp, e.x, e.y, sc, e.face)
          if (e.flash > 0) {
            ctx.save()
            ctx.globalCompositeOperation = 'lighter'
            ctx.globalAlpha = e.flash * 0.8
            ctx.fillStyle = '#fff'
            ctx.fillRect(e.x - (sp.w * sc) / 2, e.y - sp.h * sc, sp.w * sc, sp.h * sc)
            ctx.restore()
          }
        },
      })
    }
    list.push({
      y: p.y,
      f: () => {
        ctx.globalAlpha = 0.5
        ctx.drawImage(this.shadow, p.x - 16, p.y + 2, 32, 13)
        ctx.globalAlpha = 1
        this.glow(this.neon, p.x, p.y - 6, 34, 0.45)
        drawSprite(ctx, this.spr.player, p.x, p.y, S, p.face)
      },
    })
    list.sort((a, b) => a.y - b.y)
    for (const it of list) it.f()

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
    for (const s of this.shots) {
      const a = s.kind === 'aero' ? Math.max(0, s.ttl / s.max) : 1
      if (s.kind === 'shot') this.glow(s.col, s.x, s.y, 16, 0.5)
      ctx.globalAlpha = a
      ctx.fillStyle = s.col
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.r, 0, 7)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // Bombes en vol (hop parabolique)
    for (const b of this.bombs) {
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
    for (const q of this.parts) {
      ctx.globalAlpha = Math.max(0, q.life / q.max)
      ctx.fillStyle = q.col
      ctx.beginPath()
      ctx.arc(q.x, q.y, q.r, 0, 7)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // Mots flottants
    for (const tg of this.tags) {
      ctx.save()
      ctx.globalAlpha = Math.min(1, tg.life * 1.6)
      ctx.font = "700 16px 'Silkscreen', monospace"
      ctx.textAlign = 'center'
      ctx.fillStyle = '#0a0a0c'
      ctx.fillText(tg.txt, tg.x + 2, tg.y + 2)
      ctx.fillStyle = tg.col
      ctx.fillText(tg.txt, tg.x, tg.y)
      ctx.restore()
    }
    ctx.textAlign = 'left'

    ctx.restore()
  }

  private drawPillar(x: number, y: number): void {
    const ctx = this.ctx
    const s = 58
    ctx.globalAlpha = 0.45
    ctx.drawImage(this.shadow, x - s * 0.85, y + s * 0.26, s * 1.7, s * 0.62)
    ctx.globalAlpha = 1
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
      ctx.fillStyle = i % 2 ? '#e8ff33' : '#17181c'
      ctx.fillRect(x - s / 2 + i * seg, y + s / 2 - 6, seg, 6)
    }
    ctx.fillStyle = NEONS[((x / 560) | 0) % 4]
    ctx.globalAlpha = 0.8
    ctx.fillRect(x - 14, y - 6, 20, 4)
    ctx.fillRect(x - 8, y + 2, 16, 4)
    ctx.fillRect(x - 16, y + 10, 12, 4)
    ctx.globalAlpha = 1
  }

  private drawBench(x: number, y: number): void {
    const ctx = this.ctx
    const w = 132
    const h = 38
    ctx.globalAlpha = 0.4
    ctx.drawImage(this.shadow, x - w / 2, y + h / 2 - 8, w, 18)
    ctx.globalAlpha = 1
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
  } {
    return {
      chunks: this.level.chunkNames,
      W: this.level.W,
      H: this.level.H,
      enemies: this.enemies.length,
      time: this.time,
      player: { x: this.p.x, y: this.p.y },
      paint: this.p.paint,
      firing: this.p.firing,
      aim: { x: this.p.aimX, y: this.p.aimY },
      active: this.activeId,
      shots: this.shots.length,
      weapons: this.weapons.map((w) => ({ id: w.id, unlocked: w.unlocked })),
    }
  }
}
