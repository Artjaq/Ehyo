// Moteur du jeu : boucle rAF, entrées, entités, combat, rendu Canvas 2D.
// Porté du prototype "Neon Graffiti Survivor" ; l'arène rectangulaire codée en dur
// est remplacée par le système de chunks de level.ts (collision par grille + flow field).
//
// IMPORTANT : tout l'état vit ici, dans des objets simples — jamais dans la
// réactivité Vue. La communication avec le composant passe par des hooks (callbacks)
// à basse fréquence + un hook HUD par frame que le composant écrit en DOM direct.

import { buildGlows, buildSprites, buildTile, drawSprite, NEONS, type BakedSprite } from './sprites'
import { generateLevel, Level } from './level'

// ---------------------------------------------------------------------------
// Types publics (contrat moteur ↔ composant Vue)
// ---------------------------------------------------------------------------
export interface HudState {
  hpPct: number
  hp: number
  xpPct: number
  level: number
  time: string
  kills: number
}

export interface UpgradeCard {
  id: string
  tag: string
  color: string
  title: string
  desc: string
}

export interface GameOverStats {
  time: string
  kills: number
  level: number
}

export interface EngineHooks {
  hud(h: HudState): void
  levelUp(cards: UpgradeCard[]): void
  gameOver(stats: GameOverStats): void
}

export interface EngineOptions {
  wrap: HTMLElement // conteneur : reçoit les pointer events + sert de référence de taille
  canvas: HTMLCanvasElement
  joyBase: HTMLElement // visuels du joystick virtuel (manipulés en DOM direct)
  joyStick: HTMLElement
  hooks: EngineHooks
  neon?: string
  difficulty?: 'easy' | 'normal' | 'hard'
}

// ---------------------------------------------------------------------------
// Entités (objets simples, pas de classes : pooling inutile ici, le GC tient)
// ---------------------------------------------------------------------------
interface PlayerState {
  x: number; y: number
  hp: number; maxHp: number
  speed: number; face: number
  dmgMul: number; areaMul: number; fireMul: number; spdMul: number
  pickup: number; bombs: number
  fireCd: number; fireT: number
  level: number; xp: number; xpNext: number
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

interface BombEnt { x: number; y: number; sx: number; sy: number; tx: number; ty: number; prog: number; spd: number; col: string; rot: number }
interface OrbEnt { x: number; y: number; xp: number; vx: number; vy: number }
interface PartEnt { x: number; y: number; vx: number; vy: number; r: number; col: string; life: number; max: number }
interface SplatDecal { x: number; y: number; col: string; blobs: { dx: number; dy: number; r: number }[] }
interface FloatTag { x: number; y: number; txt: string; col: string; life: number }

interface JoyState { id: number; ox: number; oy: number; x: number; y: number }

type EngineState = 'idle' | 'playing' | 'levelup' | 'over'

interface UpgradeDef extends UpgradeCard { ap(p: PlayerState): void }

const ENEMY_DEFS: Record<EnemyType, { spr: string; hp: number; spd: number; dmg: number; size: number; xp: number }> = {
  dog: { spr: 'dog', hp: 26, spd: 118, dmg: 7, size: 26, xp: 3 },
  tagger: { spr: 'tagger', hp: 46, spd: 74, dmg: 9, size: 30, xp: 4 },
  cop: { spr: 'cop', hp: 64, spd: 56, dmg: 13, size: 32, xp: 6 },
  buffer: { spr: 'buffer', hp: 96, spd: 44, dmg: 11, size: 36, xp: 8 },
  drone: { spr: 'drone', hp: 24, spd: 88, dmg: 6, size: 26, xp: 3 },
}

const KILL_WORDS = ['REKT', 'BOOM', 'TAGGED', 'FRESH', 'SPLAT', "BUFF'D"]

// ---------------------------------------------------------------------------
// Moteur
// ---------------------------------------------------------------------------
export class GameEngine {
  state: EngineState = 'idle'

  private wrap!: HTMLElement
  private canvas!: HTMLCanvasElement
  private ctx!: CanvasRenderingContext2D
  private joyBase!: HTMLElement
  private joyStick!: HTMLElement
  private hooks!: EngineHooks
  private neon = '#ff2fb9'
  private dm = 1 // multiplicateur de difficulté

  private spr!: Record<string, BakedSprite>
  private glows!: Record<string, HTMLCanvasElement>
  private shadow!: HTMLCanvasElement
  private tilePattern!: CanvasPattern

  private level!: Level
  private p!: PlayerState
  private cam = { x: 0, y: 0 }
  private enemies: EnemyEnt[] = []
  private bombs: BombEnt[] = []
  private orbs: OrbEnt[] = []
  private parts: PartEnt[] = []
  private splats: SplatDecal[] = []
  private tags: FloatTag[] = []

  private time = 0
  private kills = 0
  private spawnT = 0
  private shake = 0
  private pending = 0 // level-ups en attente (peut monter de 2 niveaux d'un coup)
  private flowT = 0

  private keys: Record<string, boolean> = {}
  private joy: JoyState | null = null
  private raf = 0
  private last = 0
  private vw = 640
  private vh = 480
  private dpr = 1
  private ac = new AbortController() // détache TOUS les listeners d'un coup
  private ro: ResizeObserver | null = null
  private destroyed = false

  // ---------- cycle de vie ----------
  init(opts: EngineOptions): void {
    this.wrap = opts.wrap
    this.canvas = opts.canvas
    this.joyBase = opts.joyBase
    this.joyStick = opts.joyStick
    this.hooks = opts.hooks
    this.neon = opts.neon || '#ff2fb9'
    this.dm = { easy: 0.8, normal: 1, hard: 1.35 }[opts.difficulty || 'normal']

    this.ctx = this.canvas.getContext('2d')!
    this.spr = buildSprites(this.neon)
    const gk = buildGlows(this.neon)
    this.glows = gk.glows
    this.shadow = gk.shadow
    this.tilePattern = this.ctx.createPattern(buildTile(), 'repeat')!

    // Préchargement de la police pixel utilisée dans le canvas (non bloquant).
    document.fonts?.load("700 16px 'Silkscreen'").catch(() => {})

    const sig = this.ac.signal
    window.addEventListener('keydown', this.onKey, { signal: sig })
    window.addEventListener('keyup', this.onKey, { signal: sig })
    this.wrap.addEventListener('pointerdown', (e) => this.onPointer('down', e), { signal: sig })
    this.wrap.addEventListener('pointermove', (e) => this.onPointer('move', e), { signal: sig })
    this.wrap.addEventListener('pointerup', (e) => this.onPointer('up', e), { signal: sig })
    this.wrap.addEventListener('pointercancel', (e) => this.onPointer('up', e), { signal: sig })

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(this.wrap)
    this.resize()

    this.initWorld() // le monde sert de fond à l'écran titre
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

  // (Re)génère un monde + état joueur frais. Nouveau layout de rues à chaque run.
  private initWorld(): void {
    this.level = generateLevel()
    this.p = {
      x: this.level.spawnX, y: this.level.spawnY,
      hp: 110, maxHp: 110, speed: 158, face: 1,
      dmgMul: 1, areaMul: 1, fireMul: 1, spdMul: 1,
      pickup: 78, bombs: 1,
      fireCd: 1.05, fireT: 0,
      level: 1, xp: 0, xpNext: 6,
    }
    this.enemies = []
    this.bombs = []
    this.orbs = []
    this.parts = []
    this.splats = []
    this.tags = []
    this.time = 0
    this.kills = 0
    this.spawnT = 0
    this.shake = 0
    this.pending = 0
    this.flowT = 0
    this.updateCamera()
  }

  start(): void {
    this.initWorld()
    this.state = 'playing'
  }

  // Applique une amélioration choisie ; retourne les cartes suivantes s'il reste
  // des level-ups en attente, sinon null (le jeu reprend).
  pickUpgrade(id: string): UpgradeCard[] | null {
    const def = this.upgradeDefs().find((u) => u.id === id)
    if (def) def.ap(this.p)
    this.pending--
    if (this.pending > 0) return this.rollCards()
    this.state = 'playing'
    return null
  }

  // ---------- entrées ----------
  private onKey = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase()
    const map: Record<string, 1> = { w: 1, a: 1, s: 1, d: 1, arrowup: 1, arrowdown: 1, arrowleft: 1, arrowright: 1 }
    if (map[k]) {
      this.keys[k] = e.type === 'keydown'
      e.preventDefault()
    }
  }

  private onPointer(kind: 'down' | 'move' | 'up', e: PointerEvent): void {
    if (this.state !== 'playing') return
    const r = this.wrap.getBoundingClientRect()
    const px = e.clientX - r.left
    const py = e.clientY - r.top
    if (kind === 'down') {
      this.joy = { id: e.pointerId, ox: px, oy: py, x: px, y: py }
      this.joyBase.style.display = 'block'
      this.joyBase.style.left = px + 'px'
      this.joyBase.style.top = py + 'px'
      this.joyStick.style.left = '50%'
      this.joyStick.style.top = '50%'
    } else if (kind === 'move' && this.joy && e.pointerId === this.joy.id) {
      this.joy.x = px
      this.joy.y = py
      let dx = px - this.joy.ox
      let dy = py - this.joy.oy
      const d = Math.hypot(dx, dy)
      const max = 52
      if (d > max) {
        dx = (dx / d) * max
        dy = (dy / d) * max
      }
      this.joyStick.style.left = 60 + dx + 'px'
      this.joyStick.style.top = 60 + dy + 'px'
    } else if (kind === 'up' && this.joy && e.pointerId === this.joy.id) {
      this.joy = null
      this.joyBase.style.display = 'none'
    }
  }

  // Fusionne clavier + joystick en un seul vecteur normalisé.
  private moveVec(): { x: number; y: number } {
    let x = 0
    let y = 0
    const k = this.keys
    if (k.a || k.arrowleft) x -= 1
    if (k.d || k.arrowright) x += 1
    if (k.w || k.arrowup) y -= 1
    if (k.s || k.arrowdown) y += 1
    if (this.joy) {
      const dx = this.joy.x - this.joy.ox
      const dy = this.joy.y - this.joy.oy
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
    if (dt > 0.05) dt = 0.05 // clamp anti-spirale (retour d'onglet, etc.)
    if (this.state === 'playing') this.update(dt)
    this.render()
    this.raf = requestAnimationFrame((tt) => this.loop(tt))
  }

  private updateCamera(): void {
    const L = this.level
    // Centre si le monde est plus petit que l'écran, sinon clamp aux bords.
    const cx = this.p.x - this.vw / 2
    const cy = this.p.y - this.vh / 2
    this.cam.x = L.W <= this.vw ? (L.W - this.vw) / 2 : Math.max(0, Math.min(L.W - this.vw, cx))
    this.cam.y = L.H <= this.vh ? (L.H - this.vh) / 2 : Math.max(0, Math.min(L.H - this.vh, cy))
  }

  private update(dt: number): void {
    const p = this.p
    const L = this.level
    this.time += dt

    // Déplacement joueur : collision grille (glissement) + obstacles circulaires.
    const mv = this.moveVec()
    L.moveCircle(p, mv.x * p.speed * p.spdMul * dt, mv.y * p.speed * p.spdMul * dt, 12)
    this.pushOut(p, 12)
    if (mv.x) p.face = mv.x < 0 ? -1 : 1

    this.updateCamera()

    // Flow field recalculé à intervalle : les ennemis contournent les angles.
    this.flowT -= dt
    if (this.flowT <= 0) {
      this.flowT = 0.35
      L.computeFlow(p.x, p.y)
    }

    // Vagues : intervalle qui se resserre, taille de batch qui grossit.
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
        // Les drones volent : ligne droite au-dessus des toits, rien ne les bloque.
        e.x += (dx / d) * e.spd * dt
        e.y += (dy / d) * e.spd * dt
      } else {
        // Au sol : suivre le flow field si dispo, sinon viser en ligne droite.
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
        this.orbs.push({ x: e.x, y: e.y, xp: e.xp, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40 })
        if (Math.random() < 0.14) this.spawnTag(e.x, e.y)
      }
    }

    // Tir automatique : bombes lobées vers l'ennemi le plus proche.
    p.fireT -= dt
    if (p.fireT <= 0 && this.enemies.length) {
      let best: EnemyEnt | null = null
      let bd = 1e9
      for (const e of this.enemies) {
        const dd = (e.x - p.x) ** 2 + (e.y - p.y) ** 2
        if (dd < bd) {
          bd = dd
          best = e
        }
      }
      if (best) {
        p.fireT = p.fireCd / p.fireMul
        const base = Math.atan2(best.y - p.y, best.x - p.x)
        const range = Math.max(120, Math.min(560, Math.sqrt(bd)))
        const n = p.bombs
        const spread = 0.28
        for (let i = 0; i < n; i++) {
          const a = base + (i - (n - 1) / 2) * spread
          const tx = p.x + Math.cos(a) * range
          const ty = p.y + Math.sin(a) * range
          this.bombs.push({ x: p.x, y: p.y, sx: p.x, sy: p.y, tx, ty, prog: 0, spd: 430, col: NEONS[(Math.random() * 4) | 0], rot: 0 })
        }
      }
    }

    // Bombes en vol → explosion en zone à l'arrivée.
    const baseR = 70
    const baseDmg = 34
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i]
      const dx = b.tx - b.x
      const dy = b.ty - b.y
      const d = Math.hypot(dx, dy) || 1
      const step = b.spd * dt
      b.rot += dt * 14
      if (d <= step + 4) {
        this.explode(b.tx, b.ty, baseR * p.areaMul, baseDmg * p.dmgMul, b.col)
        this.bombs.splice(i, 1)
      } else {
        b.x += (dx / d) * step
        b.y += (dy / d) * step
        b.prog = 1 - d / (Math.hypot(b.tx - b.sx, b.ty - b.sy) || 1)
      }
    }

    // Orbes d'XP : dérive, aimant dans le rayon de ramassage.
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i]
      o.x += o.vx * dt
      o.y += o.vy * dt
      o.vx *= 0.9
      o.vy *= 0.9
      const dx = p.x - o.x
      const dy = p.y - o.y
      const d = Math.hypot(dx, dy) || 1
      if (d < p.pickup) {
        o.x += (dx / d) * 260 * dt
        o.y += (dy / d) * 260 * dt
      }
      if (d < 16) {
        this.orbs.splice(i, 1)
        this.gainXp(o.xp)
      }
    }

    // Particules d'explosion
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

    // HUD : valeurs prêtes à afficher, écrites en DOM direct par le composant.
    this.hooks.hud({
      hpPct: Math.max(0, (p.hp / p.maxHp) * 100),
      hp: Math.max(0, Math.ceil(p.hp)),
      xpPct: (p.xp / p.xpNext) * 100,
      level: p.level,
      time: this.fmt(this.time),
      kills: this.kills,
    })
  }

  private spawnEnemy(): void {
    const t = this.time
    // Pondération évolutive : les types durs arrivent avec le temps.
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
      // Les drones arrivent par les airs : anneau autour du joueur, murs ignorés.
      const ang = Math.random() * Math.PI * 2
      const rad = Math.max(this.vw, this.vh) * 0.62 + 60
      ex = Math.max(30, Math.min(this.level.W - 30, this.p.x + Math.cos(ang) * rad))
      ey = Math.max(30, Math.min(this.level.H - 30, this.p.y + Math.sin(ang) * rad))
    } else {
      // Au sol : cellule jouable hors écran dans un anneau de distance.
      const rmin = Math.max(this.vw, this.vh) * 0.5 + 80
      const pt = this.level.randomSpawnPoint(this.p.x, this.p.y, rmin, rmin + 560, this.cam.x, this.cam.y, this.vw, this.vh)
      if (!pt) return // aucun point valable ce tick, on retente au prochain
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
        // Recul, borné par les murs pour ne pas éjecter un ennemi dans un bâtiment.
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
    // Splat de peinture permanent
    const blobs: SplatDecal['blobs'] = []
    const nb = 5 + ((Math.random() * 4) | 0)
    for (let i = 0; i < nb; i++) {
      blobs.push({ dx: (Math.random() - 0.5) * radius * 1.1, dy: (Math.random() - 0.5) * radius * 1.1, r: radius * (0.18 + Math.random() * 0.34) })
    }
    this.splats.push({ x, y, col, blobs })
    // Particules
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

  // ---------- progression ----------
  private gainXp(v: number): void {
    const p = this.p
    p.xp += v
    let leveled = 0
    while (p.xp >= p.xpNext) {
      p.xp -= p.xpNext
      p.level++
      p.xpNext = Math.floor(p.xpNext * 1.32 + 4)
      leveled++
    }
    if (leveled) {
      this.pending += leveled
      this.state = 'levelup'
      this.hooks.levelUp(this.rollCards())
    }
  }

  private upgradeDefs(): UpgradeDef[] {
    return [
      { id: 'area', tag: 'A', color: '#ff2fb9', title: 'FAT CAP', desc: '+28% paint bomb blast radius.', ap: (p) => (p.areaMul *= 1.28) },
      { id: 'dmg', tag: 'D', color: '#e8ff33', title: 'HEAVY INK', desc: '+22% bomb damage.', ap: (p) => (p.dmgMul *= 1.22) },
      { id: 'fire', tag: 'F', color: '#22e0e0', title: 'RAPID SHAKE', desc: '+20% throw speed.', ap: (p) => (p.fireMul *= 1.2) },
      { id: 'spd', tag: 'S', color: '#6cff3a', title: 'FRESH KICKS', desc: '+14% move speed.', ap: (p) => (p.spdMul *= 1.14) },
      { id: 'bomb', tag: '+', color: '#ff7a1a', title: 'DOUBLE TOSS', desc: 'Throw one more bomb per volley.', ap: (p) => (p.bombs += 1) },
      { id: 'pick', tag: 'P', color: '#22e0e0', title: 'DEEP POCKETS', desc: '+30% paint pickup range.', ap: (p) => (p.pickup *= 1.3) },
      { id: 'hp', tag: 'H', color: '#ff2f5e', title: 'IRON LUNGS', desc: '+25 max HP and patch up.', ap: (p) => { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25) } },
      { id: 'heal', tag: '♥', color: '#6cff3a', title: 'FRESH COAT', desc: 'Heal 45% of max HP now.', ap: (p) => { p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.45) } },
    ]
  }

  // Tire 3 cartes distinctes au hasard.
  private rollCards(): UpgradeCard[] {
    const pool = this.upgradeDefs()
    const picks: UpgradeCard[] = []
    for (let i = 0; i < 3 && pool.length; i++) {
      const idx = (Math.random() * pool.length) | 0
      const u = pool.splice(idx, 1)[0]
      picks.push({ id: u.id, tag: u.tag, color: u.color, title: u.title, desc: u.desc })
    }
    return picks
  }

  private gameOver(): void {
    this.state = 'over'
    this.hooks.gameOver({ time: this.fmt(this.time), kills: this.kills, level: this.p.level })
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

    // Décor du niveau (sol, façades, toits, flaques, panneaux) — avec culling.
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

    // Orbes d'XP
    for (const o of this.orbs) {
      this.glow('#22e0e0', o.x, o.y, 20, 0.7)
      ctx.fillStyle = '#bffcff'
      ctx.beginPath()
      ctx.arc(o.x, o.y, 3.4, 0, 7)
      ctx.fill()
    }

    // Objets du monde triés en profondeur (y-sort) : bancs, piliers, ennemis, joueur.
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

    // Bombes en vol (parabole simulée par un hop sinusoïdal)
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

    // Mots flottants sur les kills
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
    // bande de danger au pied
    const seg = s / 6
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? '#e8ff33' : '#17181c'
      ctx.fillRect(x - s / 2 + i * seg, y + s / 2 - 6, seg, 6)
    }
    // gribouillis de tag enroulé
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
  get debugInfo(): { chunks: string[]; W: number; H: number; enemies: number; time: number; player: { x: number; y: number } } {
    return {
      chunks: this.level.chunkNames,
      W: this.level.W,
      H: this.level.H,
      enemies: this.enemies.length,
      time: this.time,
      player: { x: this.p.x, y: this.p.y },
    }
  }
}
