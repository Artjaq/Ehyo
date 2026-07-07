// Sprites pixel art générés par code : rects colorés "bakés" sur des canvas offscreen.
// Zéro asset externe — tout le rendu rétro vient d'ici (repris du prototype Canvas 2D).

// Palette néon du jeu : magenta dominant + cyan / jaune / lime en accents.
export const NEONS = ['#ff2fb9', '#22e0e0', '#e8ff33', '#6cff3a']

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
      pal: { g: '#7a7f86', f: '#22252b', c: '#22e0e0', m: neon, s: '#e3e7ec', d: '#43464c', k: '#0b0b0d' },
      r: [[3, 0, 6, 1, 'k'], [3, 1, 6, 5, 'g'], [4, 3, 4, 2, 'f'], [2, 6, 8, 4, 'g'], [2, 6, 8, 1, 'c'], [9, 6, 2, 4, 'm'], [10, 5, 1, 1, 's'], [3, 10, 2, 4, 'd'], [7, 10, 2, 4, 'd']],
    },
    // Flic : uniforme bleu nuit + visière cyan
    cop: {
      w: 12, h: 14, anchor: 'foot', glow: '#22e0e0',
      pal: { b: '#2a3350', h: '#151a2e', v: '#22e0e0', S: '#8f959c', k: '#101218', t: '#3a4256' },
      r: [[3, 0, 6, 3, 'h'], [4, 1, 4, 1, 'v'], [3, 3, 6, 7, 'b'], [3, 4, 6, 1, 'k'], [1, 4, 2, 8, 'S'], [1, 4, 2, 1, 'k'], [3, 10, 2, 4, 'k'], [7, 10, 2, 4, 'k']],
    },
    // Buffer : nettoyeur de graffs au rouleau jaune (le "tank")
    buffer: {
      w: 14, h: 14, anchor: 'foot', glow: '#ff7a1a',
      pal: { g: '#797d84', f: '#25272c', r: '#ff7a1a', y: '#f4e21a', w: '#5b4626', k: '#101218' },
      r: [[4, 0, 5, 2, 'g'], [4, 2, 5, 2, 'f'], [3, 4, 7, 6, 'r'], [3, 4, 7, 1, 'k'], [4, 10, 2, 4, 'g'], [7, 10, 2, 4, 'g'], [10, 5, 1, 4, 'w'], [11, 4, 3, 3, 'y']],
    },
    // Tagueur rival : tout en lime
    tagger: {
      w: 12, h: 14, anchor: 'foot', glow: '#6cff3a',
      pal: { G: '#6cff3a', k: '#0e120d', y: '#d0ff2a', d: '#2f3a24', s: '#e3e7ec' },
      r: [[3, 0, 6, 1, 'k'], [3, 1, 6, 5, 'G'], [4, 3, 4, 2, 'k'], [2, 6, 8, 5, 'G'], [9, 7, 2, 3, 'y'], [10, 6, 1, 1, 's'], [3, 11, 2, 3, 'd'], [7, 11, 2, 3, 'd']],
    },
    // Chien de garde : rapide, profil bas
    dog: {
      w: 14, h: 9, anchor: 'foot', glow: neon,
      pal: { d: '#4a4d52', c: '#22e0e0', r: '#ff3b3b', k: '#0e0f12' },
      r: [[2, 2, 9, 4, 'd'], [10, 1, 4, 3, 'd'], [12, 2, 1, 1, 'r'], [9, 2, 1, 4, 'c'], [1, 3, 1, 2, 'd'], [3, 6, 1, 3, 'k'], [5, 6, 1, 3, 'k'], [8, 6, 1, 3, 'k'], [11, 6, 1, 3, 'k']],
    },
    // Drone de surveillance : vole (ignore murs et obstacles)
    drone: {
      w: 12, h: 10, anchor: 'center', glow: '#ff3b3b',
      pal: { p: '#9aa0a6', b: '#2a2d33', r: '#ff3b3b', k: '#121418' },
      r: [[0, 0, 4, 1, 'p'], [8, 0, 4, 1, 'p'], [1, 1, 10, 1, 'k'], [3, 2, 6, 4, 'b'], [3, 3, 6, 2, 'r'], [3, 5, 6, 1, 'k']],
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
  ;[neon, '#22e0e0', '#e8ff33', '#6cff3a', '#ff7a1a', '#ff3b3b', '#ffffff'].forEach((c) => (glows[c] = mk(c)))

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
