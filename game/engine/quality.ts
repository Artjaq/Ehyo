// Profils de qualité : TOUTES les constantes de tuning perf sont centralisées ici.
// Deux profils (mobile / desktop) détectés au runtime, avec override manuel
// (prop Vue ou ?quality= dans l'URL). Le moteur applique en plus un "perf level"
// dynamique (0..2) qui dégrade la qualité si le temps de frame dépasse le budget.

export type GlowMode = 'full' | 'near' | 'elite' | 'off'

export interface QualityProfile {
  name: 'mobile' | 'desktop'
  dprCap: number // plafond devicePixelRatio (pixel art → 1 suffit sur mobile)
  maxEnemies: number // plafond d'ennemis actifs
  spawnIntervalScale: number // multiplie l'intervalle entre vagues (>1 = plus lent)
  batchPeriod: number // secondes pour +1 ennemi par vague
  glow: GlowMode // politique de halos des ennemis
  glowNearDist: number // distance "proche" (px) pour glow === 'near'
  shotGlow: boolean // halos des projectiles + orbes (composite 'lighter' coûteux)
  maxParticles: number // budget de particules vivantes
  cullMargin: number // marge de culling viewport (px)
  decalDensity: number // multiplicateur de densité des graffitis/flaques
  crt: boolean // overlay CRT (CSS uniquement)
  shadows: boolean // ombres portées des entités
}

export const PROFILES: Record<'mobile' | 'desktop', QualityProfile> = {
  mobile: {
    name: 'mobile',
    dprCap: 1,
    maxEnemies: 60,
    spawnIntervalScale: 1.15,
    batchPeriod: 75,
    glow: 'near',
    glowNearDist: 300,
    shotGlow: false,
    maxParticles: 90,
    cullMargin: 80,
    decalDensity: 0.6,
    crt: false,
    shadows: true,
  },
  desktop: {
    name: 'desktop',
    dprCap: 2,
    maxEnemies: 140,
    spawnIntervalScale: 1,
    batchPeriod: 60,
    glow: 'full',
    glowNearDist: 0,
    shotGlow: true,
    maxParticles: 300,
    cullMargin: 120,
    decalDensity: 1,
    crt: true,
    shadows: true,
  },
}

// Détecte le profil : override explicite > ?quality= dans l'URL > heuristique
// (pointeur grossier = tactile, ou petit écran).
export function detectProfile(override?: 'auto' | 'mobile' | 'desktop'): QualityProfile {
  if (override === 'mobile' || override === 'desktop') return PROFILES[override]
  try {
    const q = new URLSearchParams(window.location.search).get('quality')
    if (q === 'mobile' || q === 'desktop') return PROFILES[q]
  } catch {
    /* pas d'URL (SSR/tests) : on retombe sur l'heuristique */
  }
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const small = Math.min(window.screen?.width ?? 1920, window.screen?.height ?? 1080) < 768
  return coarse || small ? PROFILES.mobile : PROFILES.desktop
}

// Budgets du scaler dynamique (moniteur de FPS embarqué dans le moteur).
export const FRAME_BUDGET_MS = 20 // au-delà (EMA), on considère la frame trop lente
export const SLOW_GRACE_S = 2 // durée soutenue au-dessus du budget avant de dégrader
export const MAX_PERF_LEVEL = 2 // 0 = plein profil, 1 = -halos/-particules, 2 = -ennemis/-ombres
