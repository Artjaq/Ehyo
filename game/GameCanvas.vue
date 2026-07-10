<script setup lang="ts">
// Composant unique <GameCanvas> : encapsule tout le jeu (moteur Canvas 2D custom).
//
// Choix d'architecture HUD (hybride) :
//  - Valeurs par frame (HP, peinture, chrono, kills) → écrites en DOM DIRECT via
//    des template refs, jamais via la réactivité Vue : 60 écritures/s de
//    textContent/style.width ne coûtent rien, 60 re-renders/s si.
//  - Événements rares (écrans start/game over, déblocage d'arme, changement
//    d'arme active) → refs Vue réactives : v-if/v-for restent le moyen le plus
//    propre de gérer overlays et barre d'armes.
// L'état du jeu (positions, ennemis…) vit intégralement dans GameEngine.

import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import {
  GameEngine,
  type GameOverStats,
  type HudState,
  type UnlockInfo,
  type WeaponUi,
  type ZoneInfo,
} from './engine/engine'

const props = withDefaults(
  defineProps<{
    neon?: string
    difficulty?: 'easy' | 'normal' | 'hard'
    // Profil de qualité : 'auto' détecte mobile/desktop au runtime (override possible).
    quality?: 'auto' | 'mobile' | 'desktop'
  }>(),
  { neon: '#ff00cc', difficulty: 'normal', quality: 'auto' },
)

// --- éléments DOM ---
const wrap = ref<HTMLDivElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const moveJoyBase = ref<HTMLDivElement | null>(null)
const moveJoyStick = ref<HTMLDivElement | null>(null)
const aimJoyBase = ref<HTMLDivElement | null>(null)
const aimJoyStick = ref<HTMLDivElement | null>(null)
// refs HUD écrites en DOM direct (hors réactivité)
const paintFill = ref<HTMLDivElement | null>(null)
const paintEl = ref<HTMLElement | null>(null)
const nextWrap = ref<HTMLElement | null>(null)
const nextEl = ref<HTMLElement | null>(null)
const hpFill = ref<HTMLDivElement | null>(null)
const hpText = ref<HTMLSpanElement | null>(null)
const timeEl = ref<HTMLSpanElement | null>(null)
const killEl = ref<HTMLElement | null>(null)
// Barre de HP du boss : affichée/masquée et remplie en DOM direct chaque frame.
const bossWrap = ref<HTMLDivElement | null>(null)
const bossFill = ref<HTMLDivElement | null>(null)

// --- état réactif basse fréquence ---
type Screen = 'start' | 'playing' | 'over'
const screen = ref<Screen>('start')
const weaponsUi = shallowRef<WeaponUi[]>([])
const finalStats = shallowRef<GameOverStats>({ time: '00:00', kills: 0, paint: 0 })
const toast = shallowRef<UnlockInfo | null>(null)
const zoneToast = shallowRef<ZoneInfo | null>(null)
// Overlay CRT : activé selon le profil de qualité (désactivé sur mobile).
const crtOn = ref(true)

let engine: GameEngine | null = null
let toastTimer = 0
let zoneToastTimer = 0

// Moteur → DOM : valeurs prêtes à afficher, écrites telles quelles chaque frame.
function onHud(h: HudState): void {
  if (hpFill.value) hpFill.value.style.width = h.hpPct + '%'
  if (hpText.value) hpText.value.textContent = String(h.hp)
  if (paintFill.value) paintFill.value.style.width = h.paintPct + '%'
  if (paintEl.value) paintEl.value.textContent = String(h.paint)
  if (timeEl.value) timeEl.value.textContent = h.time
  if (killEl.value) killEl.value.textContent = String(h.kills)
  if (nextWrap.value) nextWrap.value.style.visibility = h.nextCost === null ? 'hidden' : 'visible'
  if (nextEl.value && h.nextCost !== null) nextEl.value.textContent = String(h.nextCost)
  if (bossWrap.value) bossWrap.value.style.display = h.bossPct >= 0 ? 'block' : 'none'
  if (bossFill.value && h.bossPct >= 0) bossFill.value.style.width = h.bossPct + '%'
}

function onWeapons(list: WeaponUi[]): void {
  weaponsUi.value = list
}

function onUnlock(info: UnlockInfo): void {
  toast.value = info
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (toast.value = null), 2600)
}

function onZone(info: ZoneInfo): void {
  zoneToast.value = info
  window.clearTimeout(zoneToastTimer)
  zoneToastTimer = window.setTimeout(() => (zoneToast.value = null), 2600)
}

function onGameOver(stats: GameOverStats): void {
  finalStats.value = stats
  screen.value = 'over'
}

function start(): void {
  engine?.start()
  screen.value = 'playing'
}

function selectWeapon(id: string): void {
  engine?.selectWeapon(id)
}

onMounted(() => {
  if (!wrap.value || !canvas.value || !moveJoyBase.value || !moveJoyStick.value || !aimJoyBase.value || !aimJoyStick.value) return
  wrap.value.style.setProperty('--neon', props.neon)
  engine = new GameEngine()
  engine.init({
    wrap: wrap.value,
    canvas: canvas.value,
    moveJoyBase: moveJoyBase.value,
    moveJoyStick: moveJoyStick.value,
    aimJoyBase: aimJoyBase.value,
    aimJoyStick: aimJoyStick.value,
    neon: props.neon,
    difficulty: props.difficulty,
    quality: props.quality,
    hooks: { hud: onHud, weapons: onWeapons, unlock: onUnlock, zone: onZone, gameOver: onGameOver },
  })
  crtOn.value = engine.qualityProfile.crt
  if (import.meta.env.DEV) (window as unknown as { __ngs?: GameEngine }).__ngs = engine
})

onBeforeUnmount(() => {
  // Destruction propre : rAF annulé + tous les listeners retirés (AbortController).
  window.clearTimeout(toastTimer)
  window.clearTimeout(zoneToastTimer)
  engine?.destroy()
  engine = null
  if (import.meta.env.DEV) delete (window as unknown as { __ngs?: GameEngine }).__ngs
})
</script>

<template>
  <div ref="wrap" class="ngs">
    <canvas ref="canvas" class="ngs-canvas"></canvas>

    <!-- Overlay CRT (CSS uniquement, coupé sur le profil mobile) + vignette -->
    <div v-if="crtOn" class="ngs-crt"></div>
    <div class="ngs-vignette"></div>

    <!-- HUD (persiste dans le DOM via v-show : les refs restent valides) -->
    <div v-show="screen === 'playing'" class="ngs-hud">
      <!-- Jauge de peinture : progression vers le prochain déblocage d'arme -->
      <div class="ngs-paintbar">
        <div ref="paintFill" class="ngs-paintfill"></div>
      </div>
      <div class="ngs-stats">
        <span class="ngs-paint"><b ref="paintEl">0</b> PAINT</span>
        <span ref="nextWrap" class="ngs-next">NEXT TOOL <b ref="nextEl">35</b></span>
        <span ref="timeEl" class="ngs-time">00:00</span>
        <span class="ngs-kills"><b ref="killEl">0</b> TAGGED</span>
      </div>

      <!-- Barre de HP du boss (masquée tant qu'il n'est pas apparu) -->
      <div ref="bossWrap" class="ngs-bosswrap" style="display: none">
        <div class="ngs-bosslabel">THE BUFF KING</div>
        <div class="ngs-bossbar">
          <div ref="bossFill" class="ngs-bossfill"></div>
        </div>
      </div>

      <div class="ngs-spacer"></div>

      <!-- Barre d'armes : 1-4 au clavier, tapable au doigt.
           @pointerdown.stop : un tap ici ne doit PAS invoquer le joystick de visée. -->
      <div class="ngs-weapons" @pointerdown.stop>
        <button
          v-for="w in weaponsUi"
          :key="w.id"
          class="ngs-slot"
          :class="{ locked: !w.unlocked, active: w.active }"
          :style="w.active ? { borderColor: w.color, boxShadow: `0 0 14px ${w.color}` } : {}"
          :disabled="!w.unlocked"
          @click="selectWeapon(w.id)"
        >
          <span class="ngs-slotkey">{{ w.slot }}</span>
          <span class="ngs-slottag" :style="{ color: w.unlocked ? w.color : '#4a4f56' }">{{ w.tag }}</span>
          <span v-if="!w.unlocked" class="ngs-slotcost">{{ w.cost }}</span>
        </button>
      </div>

      <div class="ngs-hpwrap">
        <div class="ngs-hplabel">
          <span>HP</span><span ref="hpText">110</span>
        </div>
        <div class="ngs-hpbar">
          <div ref="hpFill" class="ngs-hpfill"></div>
        </div>
      </div>
    </div>

    <!-- Toast de déblocage d'arme -->
    <div
      v-if="toast"
      class="ngs-toast"
      :style="{ borderColor: toast.color, boxShadow: `0 0 22px ${toast.color}` }"
    >
      NEW TOOL: <b :style="{ color: toast.color }">{{ toast.name }}</b>
      <span class="ngs-toastkey">[{{ toast.slot }}]</span>
    </div>

    <!-- Toast d'ouverture de zone (positionné sous le toast d'arme : les deux
         peuvent tomber en même temps, ex. déblocage au même palier de peinture) -->
    <div v-if="zoneToast" class="ngs-toast ngs-toast-zone">
      ZONE OPEN <b>{{ zoneToast.opened }}/{{ zoneToast.total }}</b>
      <span class="ngs-toastkey">FOLLOW THE DOTS</span>
    </div>

    <!-- Joysticks virtuels : gauche = déplacement, droite = visée/tir -->
    <div ref="moveJoyBase" class="ngs-joybase">
      <div ref="moveJoyStick" class="ngs-joystick move"></div>
    </div>
    <div ref="aimJoyBase" class="ngs-joybase">
      <div ref="aimJoyStick" class="ngs-joystick aim"></div>
    </div>

    <!-- ÉCRAN TITRE (panneau style "terminal" de la marque) -->
    <div v-if="screen === 'start'" class="ngs-overlay ngs-start">
      <div class="ngs-panel">
        <div class="ngs-kicker">— A 3AM STREET RUN —</div>
        <h1 class="ngs-title">
          <span class="t1">NEON</span><br />
          <span class="t2">GRAFFITI</span>
          <span class="t3">SURVIVOR</span>
        </h1>
        <p class="ngs-pitch">
          Hold the block. Aim your can and spray the heat yourself —
          grab spilled paint to unlock heavier tools.
        </p>
        <div class="ngs-help">
          WASD MOVE · MOUSE AIM · HOLD CLICK TO SPRAY · 1-4 SWAP<br />
          ON TOUCH: LEFT STICK MOVE · RIGHT STICK AIM &amp; FIRE
        </div>
        <button class="ngs-cta" @click="start">START RUN ▸</button>
      </div>
    </div>

    <!-- GAME OVER -->
    <div v-if="screen === 'over'" class="ngs-overlay ngs-gameover">
      <div class="ngs-panel">
        <div class="ngs-busted">BUSTED</div>
        <div class="ngs-final">
          You held out for <b class="c2">{{ finalStats.time }}</b> ·
          <b class="c3">{{ finalStats.kills }}</b> tagged ·
          <b class="cw">{{ finalStats.paint }}</b> paint
        </div>
        <button class="ngs-cta cta2" @click="start">RUN IT BACK ▸</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ngs {
  position: absolute;
  inset: 0;
  /* Accents néon de la marque du site */
  --neon: #ff00cc;
  --neon2: #00eaff;
  --neon3: #ffaa00;
  --neon4: #39ff14;
  --glitch: #ff004c;
  background: #00040a;
  overflow: hidden;
  font-family: 'Geist Mono', monospace;
  color: #e9edf2;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  touch-action: none; /* critique : sans ça les sticks se battent contre scroll/zoom */
  overscroll-behavior: none; /* bloque le pull-to-refresh */
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
  /* Safe-areas : le HUD ne passe ni sous l'encoche ni sous la barre système */
  padding: calc(12px + env(safe-area-inset-top, 0px)) calc(14px + env(safe-area-inset-right, 0px))
    calc(12px + env(safe-area-inset-bottom, 0px)) calc(14px + env(safe-area-inset-left, 0px));
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ngs-paintbar {
  height: 12px;
  border: 2px solid #0e141c;
  background: #060b12;
  box-shadow: 0 0 0 2px #000;
  overflow: hidden;
}
.ngs-paintfill {
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
  font-family: 'Press Start 2P', monospace;
  font-size: 10px;
  letter-spacing: 1px;
  flex-wrap: wrap;
}
.ngs-paint { color: var(--neon2); text-shadow: 0 0 10px var(--neon2); }
.ngs-next { color: #8a9098; font-size: 8px; letter-spacing: 2px; }
.ngs-time { color: #e9edf2; text-shadow: 0 0 8px rgba(233, 237, 242, 0.5); }
.ngs-kills { color: var(--neon3); text-shadow: 0 0 10px var(--neon3); }
.ngs-spacer { flex: 1; }
.ngs-hpwrap { width: min(320px, 64%); align-self: center; }
.ngs-hplabel {
  font-family: 'Press Start 2P', monospace;
  font-size: 8px;
  letter-spacing: 1px;
  color: #b9c0c8;
  margin-bottom: 4px;
  display: flex;
  justify-content: space-between;
}
.ngs-hpbar {
  height: 16px;
  border: 2px solid #0e141c;
  background: #060b12;
  box-shadow: 0 0 0 2px #000;
  overflow: hidden;
}
.ngs-hpfill {
  height: 100%;
  width: 100%;
  background: linear-gradient(90deg, #ff004c, #ffaa00);
  box-shadow: 0 0 12px rgba(255, 0, 76, 0.6);
  transition: width 0.1s linear;
}

/* --- barre de HP du boss (magenta, accent de l'arène) --- */
.ngs-bosswrap {
  width: min(420px, 78%);
  align-self: center;
  margin-top: 2px;
}
.ngs-bosslabel {
  font-family: 'Press Start 2P', monospace;
  font-size: 8px;
  letter-spacing: 2px;
  color: var(--neon);
  text-shadow: 0 0 10px var(--neon);
  text-align: center;
  margin-bottom: 4px;
}
.ngs-bossbar {
  height: 10px;
  border: 2px solid #0e141c;
  background: #060b12;
  box-shadow: 0 0 0 2px #000;
  overflow: hidden;
}
.ngs-bossfill {
  height: 100%;
  width: 100%;
  background: var(--neon);
  box-shadow: 0 0 12px var(--neon);
  transition: width 0.1s linear;
}

/* --- barre d'armes --- */
.ngs-weapons {
  pointer-events: auto;
  align-self: center;
  display: flex;
  gap: 10px;
  margin-bottom: 8px;
}
.ngs-slot {
  position: relative;
  width: 46px;
  height: 46px;
  cursor: pointer;
  background: rgba(0, 4, 10, 0.9);
  border: 2px solid rgba(0, 234, 255, 0.12);
  color: inherit;
  font-family: 'Press Start 2P', monospace;
  display: grid;
  place-items: center;
  transition: transform 0.08s;
}
.ngs-slot:hover:not(:disabled) { transform: translateY(-3px); }
.ngs-slot.locked { cursor: default; opacity: 0.65; }
.ngs-slotkey {
  position: absolute;
  top: 3px;
  left: 4px;
  font-size: 7px;
  color: #6b7076;
}
.ngs-slottag { font-size: 13px; text-shadow: 0 0 10px currentColor; }
.ngs-slot.locked .ngs-slottag { text-shadow: none; }
.ngs-slotcost {
  position: absolute;
  bottom: 3px;
  right: 4px;
  font-size: 7px;
  color: #8a9098;
}

/* --- toast de déblocage --- */
@keyframes ngs-toast-in {
  from { opacity: 0; transform: translate(-50%, -10px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}
.ngs-toast {
  position: absolute;
  top: calc(84px + env(safe-area-inset-top, 0px));
  left: 50%;
  transform: translate(-50%, 0);
  z-index: 9;
  pointer-events: none;
  font-family: 'Press Start 2P', monospace;
  font-size: 9px;
  letter-spacing: 1px;
  color: #e9edf2;
  background: rgba(0, 4, 10, 0.92);
  border: 2px solid;
  padding: 10px 18px;
  animation: ngs-toast-in 0.22s ease both;
}
.ngs-toastkey { color: #8a9098; margin-left: 8px; }
/* Variante zone : cyan signature, décalé sous le toast d'arme */
.ngs-toast-zone {
  top: calc(132px + env(safe-area-inset-top, 0px));
  border-color: var(--neon2);
  box-shadow: 0 0 22px var(--neon2);
}
.ngs-toast-zone b { color: var(--neon2); }

/* --- joysticks virtuels --- */
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
  transform: translate(-50%, -50%);
}
.ngs-joystick.move { background: var(--neon); box-shadow: 0 0 18px var(--neon); }
.ngs-joystick.aim { background: var(--neon2); box-shadow: 0 0 18px var(--neon2); }

/* --- overlays --- */
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
/* Panneau "terminal" de la marque : fond sombre, bordure et glow cyan */
.ngs-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: rgba(0, 4, 10, 0.88);
  border: 1px solid rgba(0, 234, 255, 0.12);
  border-radius: 14px;
  padding: 34px 40px;
  box-shadow: 0 0 46px rgba(0, 234, 255, 0.2);
  max-width: min(640px, 92vw);
}
.ngs-start { background: radial-gradient(90% 80% at 50% 40%, rgba(10, 0, 16, 0.55), rgba(0, 4, 10, 0.9)); }
.ngs-kicker {
  font-family: 'Press Start 2P', monospace;
  font-size: 9px;
  letter-spacing: 4px;
  color: #8a9098;
  margin-bottom: 16px;
}
.ngs-title {
  font-family: 'Press Start 2P', monospace;
  font-size: clamp(17px, 4.2vw, 40px);
  line-height: 1.45;
  letter-spacing: 1px;
  margin: 0;
}
.ngs-title .t1 { color: var(--neon); text-shadow: 0 0 22px var(--neon), 4px 4px 0 #120a10; }
.ngs-title .t2 { color: var(--neon2); text-shadow: 0 0 22px var(--neon2), 4px 4px 0 #061214; }
.ngs-title .t3 { color: var(--neon3); text-shadow: 0 0 22px var(--neon3), 4px 4px 0 #14140a; }
.ngs-pitch {
  font-size: 14px;
  line-height: 1.6;
  color: #c7ced5;
  max-width: 480px;
  margin: 20px 0 4px;
}
.ngs-help {
  font-family: 'Press Start 2P', monospace;
  font-size: 8px;
  letter-spacing: 2px;
  line-height: 2.2;
  color: #7d848c;
  margin: 14px 0 26px;
}
.ngs-cta {
  pointer-events: auto;
  cursor: pointer;
  font-family: 'Press Start 2P', monospace;
  font-size: 12px;
  letter-spacing: 2px;
  color: #00040a;
  background: var(--neon);
  border: none;
  padding: 16px 34px;
  box-shadow: 6px 6px 0 #120a10, 0 0 28px var(--neon);
  transition: transform 0.08s;
}
.ngs-cta:hover { transform: translate(-2px, -2px); box-shadow: 8px 8px 0 #120a10, 0 0 34px var(--neon); }
.ngs-cta:active { transform: translate(2px, 2px); box-shadow: 3px 3px 0 #120a10; }
.ngs-cta.cta2 {
  background: var(--neon2);
  font-size: 12px;
  padding: 14px 30px;
  box-shadow: 6px 6px 0 #061214, 0 0 26px var(--neon2);
}
.ngs-cta.cta2:hover { box-shadow: 8px 8px 0 #061214, 0 0 32px var(--neon2); }

/* Petit écran : cibles tactiles plus grandes (pouces), pas un simple scale */
@media (max-width: 520px) {
  .ngs-weapons {
    gap: 12px;
  }
  .ngs-slot {
    width: 54px;
    height: 54px;
  }
  .ngs-slottag {
    font-size: 15px;
  }
  .ngs-hpwrap {
    width: min(280px, 72%);
  }
}

/* game over : rouge glitch de la marque */
.ngs-gameover { background: radial-gradient(90% 80% at 50% 45%, rgba(28, 0, 14, 0.62), rgba(0, 4, 10, 0.92)); z-index: 22; }
.ngs-busted {
  font-family: 'Press Start 2P', monospace;
  font-size: clamp(18px, 4vw, 34px);
  letter-spacing: 1px;
  color: var(--glitch);
  text-shadow: 0 0 24px var(--glitch), 4px 4px 0 #120a10;
}
.ngs-final { font-size: 14px; line-height: 1.7; color: #c7ced5; margin: 18px 0 22px; }
.ngs-final .c2 { color: var(--neon2); }
.ngs-final .c3 { color: var(--neon3); }
.ngs-final .cw { color: #fff; }
</style>
