// Sprites pixel art générés par code : rects colorés "bakés" sur des canvas offscreen.
// Zéro asset externe — tout le rendu rétro vient d'ici (repris du prototype Canvas 2D).

// Palette néon du jeu = accents de la marque du site :
// magenta dominant + cyan / ambre / vert. Le rouge glitch (#ff004c) est réservé
// au danger (drones, HP, game over).
export const NEONS = ['#ff00cc', '#00eaff', '#ffaa00', '#39ff14']
export const GLITCH_RED = '#ff004c'

export interface BakedSprite {
  cv: HTMLCanvasElement
  w: number
  h: number
  anchor: 'foot' | 'center'
  glow: string
}

// [x, y, largeur, hauteur, clé de palette]
type SpriteRect = [number, number, number, number, string]

interface SpriteDef {
  w: number
  h: number
  anchor: 'foot' | 'center'
  glow: string
  pal: Record<string, string>
  r: SpriteRect[]
}

// Peint une grille de rects sur un canvas offscreen (une seule fois au boot).
function bake(w: number, h: number, rects: SpriteRect[], pal: Record<string, string>): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const x = c.getContext('2d')!
  rects.forEach(([rx, ry, rw, rh, k]) => {
    x.fillStyle = pal[k]
    x.fillRect(rx, ry, rw, rh)
  })
  return c
}

// Construit tous les sprites du jeu (joueur + 5 types d'ennemis).
export function buildSprites(neon: string): Record<string, BakedSprite> {
  const P: Record<string, SpriteDef> = {
    // Joueur : silhouette de tagueur, hoodie + sac de bombes magenta
    player: {
      w: 12, h: 14, anchor: 'foot', glow: neon,
      pal: { g: '#7a7f86', f: '#22252b', c: '#00eaff', m: neon, s: '#e3e7ec', d: '#43464c', k: '#0b0b0d' },
      r: [[3, 0, 6, 1, 'k'], [3, 1, 6, 5, 'g'], [4, 3, 4, 2, 'f'], [2, 6, 8, 4, 'g'], [2, 6, 8, 1, 'c'], [9, 6, 2, 4, 'm'], [10, 5, 1, 1, 's'], [3, 10, 2, 4, 'd'], [7, 10, 2, 4, 'd']],
    },
    // Flic : uniforme bleu nuit + visière cyan
    cop: {
      w: 12, h: 14, anchor: 'foot', glow: '#00eaff',
      pal: { b: '#2a3350', h: '#151a2e', v: '#00eaff', S: '#8f959c', k: '#101218', t: '#3a4256' },
      r: [[3, 0, 6, 3, 'h'], [4, 1, 4, 1, 'v'], [3, 3, 6, 7, 'b'], [3, 4, 6, 1, 'k'], [1, 4, 2, 8, 'S'], [1, 4, 2, 1, 'k'], [3, 10, 2, 4, 'k'], [7, 10, 2, 4, 'k']],
    },
    // Buffer : nettoyeur de graffs au rouleau jaune (le "tank")
    buffer: {
      w: 14, h: 14, anchor: 'foot', glow: '#ffaa00',
      pal: { g: '#797d84', f: '#25272c', r: '#ffaa00', y: '#ffc933', w: '#5b4626', k: '#101218' },
      r: [[4, 0, 5, 2, 'g'], [4, 2, 5, 2, 'f'], [3, 4, 7, 6, 'r'], [3, 4, 7, 1, 'k'], [4, 10, 2, 4, 'g'], [7, 10, 2, 4, 'g'], [10, 5, 1, 4, 'w'], [11, 4, 3, 3, 'y']],
    },
    // Tagueur rival : tout en lime
    tagger: {
      w: 12, h: 14, anchor: 'foot', glow: '#39ff14',
      pal: { G: '#39ff14', k: '#0e120d', y: '#8aff5c', d: '#2f3a24', s: '#e3e7ec' },
      r: [[3, 0, 6, 1, 'k'], [3, 1, 6, 5, 'G'], [4, 3, 4, 2, 'k'], [2, 6, 8, 5, 'G'], [9, 7, 2, 3, 'y'], [10, 6, 1, 1, 's'], [3, 11, 2, 3, 'd'], [7, 11, 2, 3, 'd']],
    },
    // Chien de garde : rapide, profil bas
    dog: {
      w: 14, h: 9, anchor: 'foot', glow: neon,
      pal: { d: '#4a4d52', c: '#00eaff', r: '#ff004c', k: '#0e0f12' },
      r: [[2, 2, 9, 4, 'd'], [10, 1, 4, 3, 'd'], [12, 2, 1, 1, 'r'], [9, 2, 1, 4, 'c'], [1, 3, 1, 2, 'd'], [3, 6, 1, 3, 'k'], [5, 6, 1, 3, 'k'], [8, 6, 1, 3, 'k'], [11, 6, 1, 3, 'k']],
    },
    // Drone de surveillance : vole (ignore murs et obstacles)
    drone: {
      w: 12, h: 10, anchor: 'center', glow: '#ff004c',
      pal: { p: '#9aa0a6', b: '#2a2d33', r: '#ff004c', k: '#121418' },
      r: [[0, 0, 4, 1, 'p'], [8, 0, 4, 1, 'p'], [1, 1, 10, 1, 'k'], [3, 2, 6, 4, 'b'], [3, 3, 6, 2, 'r'], [3, 5, 6, 1, 'k']],
    },
    // THE BUFF KING : boss de l'arène — nettoyeur géant couronné, rouleau et
    // armure magenta (l'accent de l'arène), visière cyan.
    boss: {
      w: 18, h: 16, anchor: 'foot', glow: '#ff00cc',
      pal: { g: '#797d84', v: '#00eaff', m: '#ff00cc', y: '#ffc933', w: '#5b4626', k: '#101218' },
      r: [
        [4, 0, 2, 2, 'y'], [8, 0, 2, 2, 'y'], [12, 0, 2, 2, 'y'], // pointes de couronne
        [4, 2, 10, 1, 'y'], // bandeau
        [5, 3, 8, 4, 'g'], // tête
        [6, 4, 6, 1, 'v'], // visière
        [3, 7, 12, 6, 'm'], // torse magenta
        [3, 7, 12, 1, 'k'],
        [1, 8, 2, 6, 'g'], // bras gauche
        [15, 7, 1, 5, 'w'], // manche du rouleau
        [14, 4, 4, 3, 'm'], // rouleau magenta
        [5, 13, 3, 3, 'k'], [10, 13, 3, 3, 'k'], // jambes
      ],
    },
  }
  const out: Record<string, BakedSprite> = {}
  for (const key in P) {
    const s = P[key]
    out[key] = { cv: bake(s.w, s.h, s.r, s.pal), w: s.w, h: s.h, anchor: s.anchor, glow: s.glow }
  }
  return out
}

// Mobilier urbain (props du décor) : mêmes conventions de bake que les
// personnages — pixel art, ancre au pied, dessiné à l'échelle par le moteur.
// Le registre de placement vit dans level.ts (PROP_DEFS) ; ici on ne fait
// que fournir les visuels, clés identiques.
export function buildProps(): Record<string, BakedSprite> {
  const P: Record<string, SpriteDef> = {
    // Benne à ordures taguée : le gros bloc contre les façades
    dumpster: {
      w: 24, h: 13, anchor: 'foot', glow: '#39ff14',
      pal: { b: '#2e4a3a', l: '#3c6350', k: '#101315', t: '#ff00cc', s: '#22303a' },
      r: [[1, 0, 22, 3, 'l'], [0, 3, 24, 8, 'b'], [0, 3, 24, 1, 'k'], [4, 6, 7, 3, 't'], [14, 5, 2, 5, 's'], [18, 5, 2, 5, 's'], [3, 11, 3, 2, 'k'], [18, 11, 3, 2, 'k']],
    },
    // Barrière de chantier : deux lisses rayées amber/noir sur pieds
    barrier: {
      w: 22, h: 9, anchor: 'foot', glow: '#ffaa00',
      pal: { a: '#ffaa00', k: '#17181c', s: '#3d4149' },
      r: [[1, 0, 5, 2, 'a'], [6, 0, 5, 2, 'k'], [11, 0, 5, 2, 'a'], [16, 0, 5, 2, 'k'], [1, 4, 5, 2, 'k'], [6, 4, 5, 2, 'a'], [11, 4, 5, 2, 'k'], [16, 4, 5, 2, 'a'], [2, 2, 2, 7, 's'], [18, 2, 2, 7, 's']],
    },
    // Cône de circulation : petit, bande réfléchissante blanche
    cone: {
      w: 7, h: 8, anchor: 'foot', glow: '#ffaa00',
      pal: { a: '#ffaa00', w: '#e9edf2', k: '#17181c' },
      r: [[3, 0, 1, 2, 'a'], [2, 2, 3, 2, 'a'], [2, 4, 3, 1, 'w'], [1, 5, 5, 2, 'a'], [0, 7, 7, 1, 'k']],
    },
    // Borne incendie : rouge sombre (le glitch pur reste réservé au danger)
    hydrant: {
      w: 7, h: 9, anchor: 'foot', glow: '#ff004c',
      pal: { r: '#c1203c', d: '#7e1428', k: '#101214' },
      r: [[2, 0, 3, 2, 'r'], [1, 2, 5, 6, 'r'], [0, 3, 1, 2, 'd'], [6, 3, 1, 2, 'd'], [1, 4, 5, 1, 'd'], [1, 8, 5, 1, 'k']],
    },
    // Panneau STOP sur poteau
    sign_stop: {
      w: 9, h: 16, anchor: 'foot', glow: '#ff004c',
      pal: { r: '#ff004c', w: '#e9edf2', s: '#8f959c', k: '#101214' },
      r: [[1, 0, 7, 7, 'r'], [2, 3, 5, 1, 'w'], [4, 7, 1, 8, 's'], [3, 15, 3, 1, 'k']],
    },
    // Panneau sens unique : plaque blanche, flèche noire
    sign_oneway: {
      w: 12, h: 15, anchor: 'foot', glow: '#00eaff',
      pal: { w: '#e9edf2', k: '#101214', s: '#8f959c' },
      r: [[0, 1, 12, 5, 'w'], [2, 3, 6, 1, 'k'], [7, 2, 2, 1, 'k'], [8, 3, 2, 1, 'k'], [7, 4, 2, 1, 'k'], [5, 6, 1, 8, 's'], [4, 14, 3, 1, 'k']],
    },
    // Cache de peinture : récompense de zone — palette de bombes néon
    cache: {
      w: 14, h: 10, anchor: 'foot', glow: '#ff00cc',
      pal: { w: '#5b4626', k: '#101218', c: '#00eaff', m: '#ff00cc', g: '#39ff14', s: '#e9edf2' },
      r: [
        [0, 8, 14, 2, 'w'], [0, 8, 14, 1, 'k'], // palette
        [2, 2, 3, 6, 'c'], [2, 1, 3, 1, 's'], // bombe cyan
        [6, 3, 3, 5, 'm'], [6, 2, 3, 1, 's'], // bombe magenta
        [10, 2, 3, 6, 'g'], [10, 1, 3, 1, 's'], // bombe verte
      ],
    },
  }
  const out: Record<string, BakedSprite> = {}
  for (const key in P) {
    const s = P[key]
    out[key] = { cv: bake(s.w, s.h, s.r, s.pal), w: s.w, h: s.h, anchor: s.anchor, glow: s.glow }
  }
  return out
}

export interface GlowKit {
  glows: Record<string, HTMLCanvasElement>
  shadow: HTMLCanvasElement
}

// Halos néon pré-rendus (dégradés radiaux) + ellipse d'ombre portée.
export function buildGlows(neon: string): GlowKit {
  const glows: Record<string, HTMLCanvasElement> = {}
  const mk = (col: string) => {
    const c = document.createElement('canvas')
    c.width = 64
    c.height = 64
    const x = c.getContext('2d')!
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32)
    g.addColorStop(0, col)
    g.addColorStop(0.4, col)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    x.globalAlpha = 0.55
    x.fillStyle = g
    x.beginPath()
    x.arc(32, 32, 32, 0, 7)
    x.fill()
    return c
  }
  ;[neon, '#00eaff', '#ffaa00', '#39ff14', GLITCH_RED, '#ffffff'].forEach((c) => (glows[c] = mk(c)))

  const s = document.createElement('canvas')
  s.width = 64
  s.height = 32
  const sx = s.getContext('2d')!
  const sg = sx.createRadialGradient(32, 16, 0, 32, 16, 32)
  sg.addColorStop(0, 'rgba(0,0,0,.5)')
  sg.addColorStop(1, 'rgba(0,0,0,0)')
  sx.fillStyle = sg
  sx.fillRect(0, 0, 64, 32)

  return { glows, shadow: s }
}

// Tuile de béton 220px (bruit + fissures) utilisée en motif répété pour le sol.
export function buildTile(): HTMLCanvasElement {
  const T = 220
  const c = document.createElement('canvas')
  c.width = T
  c.height = T
  const x = c.getContext('2d')!
  x.fillStyle = '#232427'
  x.fillRect(0, 0, T, T)
  // grain
  for (let i = 0; i < 1400; i++) {
    const g = 18 + Math.random() * 26
    x.fillStyle = `rgba(${g},${g + 2},${g + 4},${Math.random() * 0.5})`
    x.fillRect(Math.random() * T, Math.random() * T, 2, 2)
  }
  // fissures
  x.strokeStyle = 'rgba(0,0,0,.35)'
  x.lineWidth = 2
  for (let i = 0; i < 3; i++) {
    x.beginPath()
    let px = Math.random() * T
    let py = Math.random() * T
    x.moveTo(px, py)
    for (let j = 0; j < 5; j++) {
      px += (Math.random() - 0.5) * 70
      py += (Math.random() - 0.5) * 70
      x.lineTo(px, py)
    }
    x.stroke()
  }
  // joints de dalle
  x.strokeStyle = 'rgba(0,0,0,.5)'
  x.lineWidth = 3
  x.strokeRect(1, 1, T - 2, T - 2)
  return c
}

// Dessine un sprite baké à l'échelle, avec flip horizontal selon la direction.
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sp: BakedSprite,
  x: number,
  y: number,
  scale: number,
  dir: number,
): void {
  const w = sp.w * scale
  const h = sp.h * scale
  const dy = sp.anchor === 'center' ? -h / 2 : -h
  ctx.save()
  ctx.translate(Math.round(x), Math.round(y))
  ctx.scale(dir, 1)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(sp.cv, Math.round(-w / 2), Math.round(dy), w, h)
  ctx.restore()
}
