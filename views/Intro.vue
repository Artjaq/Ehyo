<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import GlitchText from '@/components/GlitchText.vue'
import StartButton from '@/components/StartButton.vue'
import logoUrl from '@/assets/picture/ehyo-blanc.svg'

const router = useRouter()

/* Clé de session : le boot ne rejoue pas sur une navigation interne /home -> / */
const BOOT_FLAG = 'ehyo-booted'

/* Lignes du POST / boot — éditables librement, "" = ligne vide */
const BOOT_LINES: string[] = [
  'EHYO BIOS v2.26.07 — Cybernetic Display Unit',
  'Copyright (c) 2025 EHYO Systems Corp.',
  '',
  'CPU: Neural-Mesh NX-7700K @ 4.2 GHz',
  'MEM: 65536 MB HOLO-DDR6 .............. OK',
  'GPU: NeonPulse RTX 4090-X ............. OK',
  'NET: Mesh uplink established .......... OK',
  '',
  'Booting EHYO-OS v3.1.4 ...',
  'Loading kernel ehyo-core.bin .......... OK',
  'Mounting /dev/neon0 ................... OK',
  'Mounting /dev/canvas .................. OK',
  'Initializing glyph renderer .......... OK',
  'Loading font matrix [Geist|Mono|PressStart2P] ... OK',
  'Scanning drop inventory ... 1 unit(s) found',
  'Syncing firebase node [ehyo-947a4] .... OK',
  'Establishing Stripe handshake ......... STANDBY',
  'CRT filter calibration ............... OK',
  'Scanline overlay ..................... OK',
  '',
  'All systems nominal.',
  'Welcome to EHYO.',
  '',
  'init --mode=terminal',
  'Loading interface...',
]

const fading = ref(false)      // fade-out du contenu (logo / titre / bouton)
const booting = ref(false)     // overlay boot affiché
const lines = ref<string[]>([]) // lignes déjà "imprimées"

/* Tous les timers en vol, purgés au skip / démontage */
let timers: ReturnType<typeof setTimeout>[] = []
let done = false

const clearTimers = () => {
  timers.forEach(clearTimeout)
  timers = []
}

const later = (fn: () => void, ms: number) => {
  timers.push(setTimeout(fn, ms))
}

/* Découpe une ligne en segments colorés (mots-clés du boot) */
type Segment = { text: string; kind: 'ok' | 'brand' | 'warn' | 'plain' }

const segments = (line: string): Segment[] => {
  const parts = line.split(/(\[ OK \]|\bOK\b|\bSTANDBY\b|\bEHYO\b)/g)
  return parts
    .filter((text) => text.length > 0)
    .map((text) => {
      if (text === '[ OK ]' || text === 'OK') return { text, kind: 'ok' as const }
      if (text === 'STANDBY') return { text, kind: 'warn' as const }
      if (text === 'EHYO') return { text, kind: 'brand' as const }
      return { text, kind: 'plain' as const }
    })
}

/* Fin de séquence (boot complet ou skip) — one-shot */
const finish = () => {
  if (done) return
  done = true
  clearTimers()
  sessionStorage.setItem(BOOT_FLAG, '1')
  router.push('/home')
}

/* Imprime les lignes une par une (instant print, 40-80 ms) */
const printLine = (index: number) => {
  if (index >= BOOT_LINES.length) {
    later(finish, 500)
    return
  }
  lines.value.push(BOOT_LINES[index])
  later(() => printLine(index + 1), 40 + Math.random() * 40)
}

const handleStartClick = () => {
  /* Déjà booté dans cette session -> navigation directe */
  if (sessionStorage.getItem(BOOT_FLAG) === '1') {
    router.push('/home')
    return
  }

  fading.value = true
  later(() => {
    booting.value = true
    printLine(0)
  }, 250)
}

onUnmounted(clearTimers)
</script>

<template>
  <main
    class="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-8 intro-content"
    :class="{ 'is-fading': fading }"
  >
    <img
      :src="logoUrl"
      alt="EHYO"
      class="h-28 sm:h-44 md:h-64 lg:h-80 w-auto select-none pointer-events-none"
      :style="{
        filter: 'drop-shadow(0 0 12px rgba(0, 234, 255, 0.25)) drop-shadow(0 0 24px rgba(0, 234, 255, 0.12))'
      }"
    />

    <section class="crt text-center px-4 sm:px-8 py-4 sm:py-6 border border-zinc-700/80 bg-zinc-950/70 rounded-2xl">
      <GlitchText text="ENTER TO EHYO" class="text-3xl sm:text-5xl md:text-7xl lg:text-8xl" />
    </section>

    <StartButton :on-click="handleStartClick" />
  </main>

  <!-- Overlay boot sequence : clic / tap n'importe où = skip -->
  <div v-if="booting" class="boot-overlay crt" @click="finish" @touchstart="finish">
    <div class="boot-screen">
      <p v-for="(line, i) in lines" :key="i" class="boot-line">
        <span v-for="(seg, j) in segments(line)" :key="j" :class="`seg-${seg.kind}`">{{ seg.text }}</span>
      </p>
    </div>
    <span class="boot-skip">[ CLICK TO SKIP ]</span>
  </div>
</template>

<style scoped>
.intro-content {
  transition: opacity 250ms ease-out;
}

.intro-content.is-fading {
  opacity: 0;
  pointer-events: none;
}

.boot-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: #00040a;
  overflow: hidden;
  cursor: pointer;
  /* safe-areas encoche + padding mobile confortable */
  padding: calc(env(safe-area-inset-top, 0px) + 1rem)
           calc(env(safe-area-inset-right, 0px) + 1rem)
           calc(env(safe-area-inset-bottom, 0px) + 1rem)
           calc(env(safe-area-inset-left, 0px) + 1rem);
}

/* justify-end : les nouvelles lignes poussent les anciennes hors du cadre */
.boot-screen {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  overflow: hidden;
}

.boot-line {
  font-family: 'Geist Mono', ui-monospace, monospace;
  font-size: 11px;
  line-height: 1.55;
  min-height: 1.55em;
  color: rgba(255, 255, 255, 0.7);
  white-space: pre-wrap;
  word-break: break-word;
}

.seg-ok    { color: var(--neon-green); }
.seg-brand { color: var(--neon-cyan); }
.seg-warn  { color: var(--neon-amber); }

.boot-skip {
  position: absolute;
  right: calc(env(safe-area-inset-right, 0px) + 1rem);
  bottom: calc(env(safe-area-inset-bottom, 0px) + 1rem);
  font-family: 'Geist Mono', ui-monospace, monospace;
  font-size: 9px;
  color: rgba(255, 255, 255, 0.2);
  pointer-events: none;
}
</style>
