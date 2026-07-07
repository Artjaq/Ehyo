<script setup lang="ts">
// Composant unique <GameCanvas> : encapsule tout le jeu (moteur Canvas 2D custom).
//
// Choix d'architecture HUD (hybride, le meilleur des deux mondes) :
//  - Valeurs par frame (HP, XP, chrono, kills) → écrites en DOM DIRECT via des
//    template refs, jamais via la réactivité Vue : 60 écritures/s de textContent
//    et style.width ne coûtent rien, alors que 60 re-renders/s tueraient les perfs.
//  - Transitions d'écran rares (start / level-up / game over) et cartes
//    d'amélioration → refs Vue réactives : v-if/v-for restent le moyen le plus
//    propre de gérer ces overlays, et un re-render toutes les ~30 s est gratuit.
// L'état du jeu (positions, ennemis…) vit intégralement dans GameEngine.

import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { GameEngine, type GameOverStats, type HudState, type UpgradeCard } from './engine/engine'

const props = withDefaults(
  defineProps<{
    neon?: string
    difficulty?: 'easy' | 'normal' | 'hard'
  }>(),
  { neon: '#ff2fb9', difficulty: 'normal' },
)

// --- éléments DOM ---
const wrap = ref<HTMLDivElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const joyBase = ref<HTMLDivElement | null>(null)
const joyStick = ref<HTMLDivElement | null>(null)
// refs HUD écrites en DOM direct (hors réactivité)
const xpFill = ref<HTMLDivElement | null>(null)
const hpFill = ref<HTMLDivElement | null>(null)
const hpText = ref<HTMLSpanElement | null>(null)
const lvlEl = ref<HTMLElement | null>(null)
const timeEl = ref<HTMLSpanElement | null>(null)
const killEl = ref<HTMLElement | null>(null)

// --- état réactif basse fréquence (écrans + cartes) ---
type Screen = 'start' | 'playing' | 'levelup' | 'over'
const screen = ref<Screen>('start')
const cards = shallowRef<UpgradeCard[]>([])
const finalStats = shallowRef<GameOverStats>({ time: '00:00', kills: 0, level: 1 })

let engine: GameEngine | null = null

// Phaser → DOM : le moteur pousse des valeurs prêtes à afficher, on les écrit telles quelles.
function onHud(h: HudState): void {
  if (hpFill.value) hpFill.value.style.width = h.hpPct + '%'
  if (hpText.value) hpText.value.textContent = String(h.hp)
  if (xpFill.value) xpFill.value.style.width = h.xpPct + '%'
  if (lvlEl.value) lvlEl.value.textContent = String(h.level)
  if (timeEl.value) timeEl.value.textContent = h.time
  if (killEl.value) killEl.value.textContent = String(h.kills)
}

function onLevelUp(picks: UpgradeCard[]): void {
  cards.value = picks
  screen.value = 'levelup'
}

function onGameOver(stats: GameOverStats): void {
  finalStats.value = stats
  screen.value = 'over'
}

function start(): void {
  engine?.start()
  screen.value = 'playing'
}

function pick(id: string): void {
  if (!engine) return
  const next = engine.pickUpgrade(id)
  if (next) cards.value = next // plusieurs level-ups d'un coup : on enchaîne
  else screen.value = 'playing'
}

onMounted(() => {
  if (!wrap.value || !canvas.value || !joyBase.value || !joyStick.value) return
  wrap.value.style.setProperty('--neon', props.neon)
  engine = new GameEngine()
  engine.init({
    wrap: wrap.value,
    canvas: canvas.value,
    joyBase: joyBase.value,
    joyStick: joyStick.value,
    neon: props.neon,
    difficulty: props.difficulty,
    hooks: { hud: onHud, levelUp: onLevelUp, gameOver: onGameOver },
  })
  // Poignée de debug en dev uniquement (inspection console / tests)
  if (import.meta.env.DEV) (window as unknown as { __ngs?: GameEngine }).__ngs = engine
})

onBeforeUnmount(() => {
  // Destruction propre : rAF annulé + tous les listeners retirés (AbortController).
  engine?.destroy()
  engine = null
  if (import.meta.env.DEV) delete (window as unknown as { __ngs?: GameEngine }).__ngs
})
</script>

<template>
  <div ref="wrap" class="ngs">
    <canvas ref="canvas" class="ngs-canvas"></canvas>

    <!-- Overlay CRT : scanlines + vignette -->
    <div class="ngs-crt"></div>
    <div class="ngs-vignette"></div>

    <!-- HUD (persiste dans le DOM via v-show : les refs restent valides) -->
    <div v-show="screen === 'playing'" class="ngs-hud">
      <div class="ngs-xpbar">
        <div ref="xpFill" class="ngs-xpfill"></div>
      </div>
      <div class="ngs-stats">
        <span class="ngs-lv">LV <b ref="lvlEl">1</b></span>
        <span ref="timeEl" class="ngs-time">00:00</span>
        <span class="ngs-kills"><b ref="killEl">0</b> TAGGED</span>
      </div>
      <div class="ngs-spacer"></div>
      <div class="ngs-hpwrap">
        <div class="ngs-hplabel">
          <span>HP</span><span ref="hpText">110</span>
        </div>
        <div class="ngs-hpbar">
          <div ref="hpFill" class="ngs-hpfill"></div>
        </div>
      </div>
    </div>

    <!-- Joystick virtuel (positionné par le moteur en DOM direct) -->
    <div ref="joyBase" class="ngs-joybase">
      <div ref="joyStick" class="ngs-joystick"></div>
    </div>

    <!-- ÉCRAN TITRE -->
    <div v-if="screen === 'start'" class="ngs-overlay ngs-start">
      <div class="ngs-kicker">— A 3AM STREET RUN —</div>
      <h1 class="ngs-title">
        <span class="t1">NEON</span><br />
        <span class="t2">GRAFFITI</span>
        <span class="t3">SURVIVOR</span>
      </h1>
      <p class="ngs-pitch">
        Hold the block. Move to dodge — your can auto-sprays the nearest heat.
        Level up, stack upgrades, don't get buffed.
      </p>
      <div class="ngs-help">WASD / ARROWS · DRAG TO MOVE ON TOUCH</div>
      <button class="ngs-cta" @click="start">START RUN ▸</button>
    </div>

    <!-- LEVEL UP -->
    <div v-if="screen === 'levelup'" class="ngs-overlay ngs-levelup">
      <div class="ngs-lvtitle">LEVEL UP</div>
      <div class="ngs-lvsub">Pick a piece for your kit</div>
      <div class="ngs-cards">
        <button v-for="card in cards" :key="card.id" class="ngs-card" @click="pick(card.id)">
          <div class="ngs-cardhead">
            <span class="ngs-cardtag" :style="{ background: card.color, boxShadow: `0 0 14px ${card.color}` }">{{ card.tag }}</span>
            <span class="ngs-cardtitle">{{ card.title }}</span>
          </div>
          <div class="ngs-carddesc">{{ card.desc }}</div>
        </button>
      </div>
    </div>

    <!-- GAME OVER -->
    <div v-if="screen === 'over'" class="ngs-overlay ngs-gameover">
      <div class="ngs-busted">BUSTED</div>
      <div class="ngs-final">
        You held out for <b class="c2">{{ finalStats.time }}</b> ·
        <b class="c3">{{ finalStats.kills }}</b> tagged ·
        reached <b class="cw">LV {{ finalStats.level }}</b>
      </div>
      <button class="ngs-cta cta2" @click="start">RUN IT BACK ▸</button>
    </div>
  </div>
</template>

<style scoped>
.ngs {
  position: absolute;
  inset: 0;
  --neon: #ff2fb9;
  --neon2: #22e0e0;
  --neon3: #e8ff33;
  --neon4: #6cff3a;
  background: #0a0a0c;
  overflow: hidden;
  font-family: 'VT323', monospace;
  color: #e9edf2;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  cursor: crosshair;
}
.ngs-canvas {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
}

/* --- CRT --- */
@keyframes ngs-scan {
  0% { background-position: 0 0; }
  100% { background-position: 0 -240px; }
}
.ngs-crt {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 5;
  mix-blend-mode: multiply;
  opacity: 0.55;
  background: repeating-linear-gradient(0deg, rgba(0, 0, 0, 0) 0px, rgba(0, 0, 0, 0) 2px, rgba(0, 0, 0, 0.3) 3px, rgba(0, 0, 0, 0) 4px);
  animation: ngs-scan 8s linear infinite;
}
.ngs-vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 6;
  background: radial-gradient(120% 110% at 50% 45%, rgba(0, 0, 0, 0) 52%, rgba(0, 0, 0, 0.72) 100%);
}

/* --- HUD --- */
.ngs-hud {
  position: absolute;
  inset: 0;
  z-index: 8;
  pointer-events: none;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ngs-xpbar {
  height: 12px;
  border: 2px solid #17181c;
  background: #141518;
  box-shadow: 0 0 0 2px #000;
  overflow: hidden;
}
.ngs-xpfill {
  height: 100%;
  width: 0%;
  background: var(--neon2);
  box-shadow: 0 0 12px var(--neon2);
  transition: width 0.12s linear;
}
.ngs-stats {
  display: flex;
  align-items: center;
  gap: 18px;
  font-family: 'Silkscreen', monospace;
  font-size: 15px;
  letter-spacing: 1px;
}
.ngs-lv { color: var(--neon); text-shadow: 0 0 10px var(--neon); }
.ngs-time { color: #e9edf2; text-shadow: 0 0 8px rgba(233, 237, 242, 0.5); }
.ngs-kills { color: var(--neon3); text-shadow: 0 0 10px var(--neon3); }
.ngs-spacer { flex: 1; }
.ngs-hpwrap { width: min(320px, 64%); align-self: center; }
.ngs-hplabel {
  font-family: 'Silkscreen', monospace;
  font-size: 11px;
  letter-spacing: 1px;
  color: #b9c0c8;
  margin-bottom: 4px;
  display: flex;
  justify-content: space-between;
}
.ngs-hpbar {
  height: 16px;
  border: 2px solid #17181c;
  background: #141518;
  box-shadow: 0 0 0 2px #000;
  overflow: hidden;
}
.ngs-hpfill {
  height: 100%;
  width: 100%;
  background: linear-gradient(90deg, #ff2f5e, #ff7a1a);
  box-shadow: 0 0 12px rgba(255, 60, 80, 0.7);
  transition: width 0.1s linear;
}

/* --- joystick virtuel --- */
.ngs-joybase {
  position: absolute;
  z-index: 9;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.18);
  background: rgba(20, 21, 24, 0.35);
  display: none;
  pointer-events: none;
  transform: translate(-50%, -50%);
}
.ngs-joystick {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--neon);
  box-shadow: 0 0 18px var(--neon);
  transform: translate(-50%, -50%);
}

/* --- overlays --- */
@keyframes ngs-in {
  from { opacity: 0; transform: translateY(14px) scale(0.98); }
  to { opacity: 1; transform: none; }
}
.ngs-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px;
}
.ngs-start { background: radial-gradient(90% 80% at 50% 40%, rgba(20, 10, 26, 0.55), rgba(5, 5, 7, 0.9)); }
.ngs-kicker {
  font-family: 'Silkscreen', monospace;
  font-size: 11px;
  letter-spacing: 5px;
  color: #8a9098;
  margin-bottom: 16px;
}
.ngs-title {
  font-family: 'Silkscreen', monospace;
  font-weight: 700;
  font-size: clamp(30px, 7vw, 66px);
  line-height: 1.05;
  letter-spacing: 1px;
  margin: 0;
}
.ngs-title .t1 { color: var(--neon); text-shadow: 0 0 22px var(--neon), 4px 4px 0 #120a10; }
.ngs-title .t2 { color: var(--neon2); text-shadow: 0 0 22px var(--neon2), 4px 4px 0 #061214; }
.ngs-title .t3 { color: var(--neon3); text-shadow: 0 0 22px var(--neon3), 4px 4px 0 #14140a; }
.ngs-pitch {
  font-size: 24px;
  line-height: 1.35;
  color: #c7ced5;
  max-width: 520px;
  margin: 20px 0 4px;
}
.ngs-help {
  font-family: 'Silkscreen', monospace;
  font-size: 11px;
  letter-spacing: 2px;
  color: #7d848c;
  margin: 14px 0 26px;
}
.ngs-cta {
  pointer-events: auto;
  cursor: pointer;
  font-family: 'Silkscreen', monospace;
  font-size: 20px;
  letter-spacing: 2px;
  color: #0a0a0c;
  background: var(--neon);
  border: none;
  padding: 18px 42px;
  box-shadow: 6px 6px 0 #120a10, 0 0 28px var(--neon);
  transition: transform 0.08s;
}
.ngs-cta:hover { transform: translate(-2px, -2px); box-shadow: 8px 8px 0 #120a10, 0 0 34px var(--neon); }
.ngs-cta:active { transform: translate(2px, 2px); box-shadow: 3px 3px 0 #120a10; }
.ngs-cta.cta2 {
  background: var(--neon2);
  font-size: 19px;
  padding: 16px 38px;
  box-shadow: 6px 6px 0 #061214, 0 0 26px var(--neon2);
}
.ngs-cta.cta2:hover { box-shadow: 8px 8px 0 #061214, 0 0 32px var(--neon2); }

/* level up */
.ngs-levelup { background: rgba(5, 5, 7, 0.82); z-index: 22; }
.ngs-lvtitle {
  font-family: 'Silkscreen', monospace;
  font-size: clamp(20px, 4vw, 34px);
  letter-spacing: 2px;
  color: var(--neon3);
  text-shadow: 0 0 20px var(--neon3);
  margin-bottom: 6px;
}
.ngs-lvsub { font-size: 22px; color: #aeb5bd; margin-bottom: 26px; }
.ngs-cards {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  justify-content: center;
  max-width: 820px;
}
.ngs-card {
  pointer-events: auto;
  cursor: pointer;
  width: 220px;
  text-align: left;
  background: #131418;
  border: 2px solid #23252b;
  border-top: 4px solid var(--neon);
  padding: 20px;
  box-shadow: 6px 6px 0 #000;
  animation: ngs-in 0.28s ease both;
  transition: transform 0.1s;
  color: inherit;
  font-family: inherit;
}
.ngs-card:hover { transform: translateY(-5px); border-color: var(--neon); }
.ngs-cardhead { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.ngs-cardtag {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  font-family: 'Silkscreen', monospace;
  font-size: 16px;
  color: #0a0a0c;
}
.ngs-cardtitle {
  font-family: 'Silkscreen', monospace;
  font-size: 13px;
  letter-spacing: 0.5px;
  color: #eef2f6;
}
.ngs-carddesc { font-size: 19px; line-height: 1.3; color: #aab1b9; }

/* game over */
.ngs-gameover { background: radial-gradient(90% 80% at 50% 45%, rgba(40, 6, 20, 0.6), rgba(5, 5, 7, 0.92)); z-index: 22; }
.ngs-busted {
  font-family: 'Silkscreen', monospace;
  font-size: clamp(28px, 6vw, 58px);
  letter-spacing: 1px;
  color: var(--neon);
  text-shadow: 0 0 24px var(--neon), 4px 4px 0 #120a10;
}
.ngs-final { font-size: 24px; color: #c7ced5; margin: 18px 0 22px; }
.ngs-final .c2 { color: var(--neon2); }
.ngs-final .c3 { color: var(--neon3); }
.ngs-final .cw { color: #fff; }
</style>
