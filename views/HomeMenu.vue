<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const items = [
  { label: "SHOP",    href: "/shop",    color: "#00eaff", coords: "X:04 Y:12" },
  { label: "ABOUT",   href: "/about",   color: "#ff00cc", coords: "X:08 Y:03" },
  { label: "GAME",    href: "/game",    color: "#39ff14", coords: "X:15 Y:07" },
  { label: "CONTACT", href: "/contact", color: "#ffaa00", coords: "X:02 Y:19" },
]

const opacity = ref(0)
const y = ref(8)
const itemOpacity = ref<number[]>(items.map(() => 0))
const itemY = ref<number[]>(items.map(() => 10))

onMounted(() => {
  setTimeout(() => { opacity.value = 1; y.value = 0 }, 0)
  items.forEach((_, i) => {
    setTimeout(() => {
      itemOpacity.value[i] = 1
      itemY.value[i] = 0
    }, 80 * (i + 1))
  })
})
</script>

<template>
  <main class="min-h-screen bg-black flex items-center justify-center">
    <div class="terminal-wrap crt w-[92vw] max-w-5xl mx-auto p-6 sm:p-8 rounded-2xl">

      <div
        :style="{
          opacity,
          transform: `translateY(${y}px)`,
          transition: 'opacity 0.4s, transform 0.4s',
        }"
        class="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6"
      >
        <div
          v-for="(item, i) in items"
          :key="item.label"
          :style="{
            opacity: itemOpacity[i],
            transform: `translateY(${itemY[i]}px)`,
            transition: `opacity 0.4s ${0.08 * (i + 1)}s, transform 0.4s ${0.08 * (i + 1)}s`,
          }"
        >
          <a
            :href="item.href"
            @click.prevent="router.push(item.href)"
            class="nav-card font-press"
            :style="{ '--c': item.color }"
          >
            <!-- HUD corner brackets -->
            <span class="corner tl" />
            <span class="corner tr" />
            <span class="corner bl" />
            <span class="corner br" />

            <!-- Top coordinate readout -->
            <span class="hud-coord">{{ item.coords }}</span>

            <!-- Main nav label -->
            <span class="nav-label">{{ item.label }}</span>

            <!-- Bottom status bar -->
            <span class="hud-status">SYS: ACTIVE</span>
          </a>
        </div>
      </div>

      <p class="footer-line mt-6 text-center font-press">
        © 2025 EYHO —
        <span class="footer-link" style="color: rgba(0,234,255,0.35)">TERMS</span>
        ·
        <span class="footer-link" style="color: rgba(255,0,204,0.35)">PRIVACY</span>
      </p>

    </div>
  </main>
</template>

<style scoped>
/* ── Nav card base ── */
.nav-card {
  --c: #00eaff;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1 / 1;
  border-radius: 1rem;
  border: 1px solid color-mix(in srgb, var(--c) 30%, transparent);
  background: color-mix(in srgb, var(--c) 4%, #000408);
  color: var(--c);
  text-decoration: none;
  overflow: hidden;
  cursor: pointer;
  transition:
    box-shadow 0.3s ease,
    border-color 0.3s ease,
    transform 0.25s ease;
  box-shadow:
    0 0 8px  color-mix(in srgb, var(--c) 20%, transparent),
    inset 0 0 20px color-mix(in srgb, var(--c) 4%, transparent);
}

/* ── Hover: glitch animation + intensified glow ── */
.nav-card:hover {
  animation: cardGlitch 0.38s ease-out forwards;
  border-color: color-mix(in srgb, var(--c) 65%, transparent);
  box-shadow:
    0 0 18px color-mix(in srgb, var(--c) 50%, transparent),
    0 0 42px color-mix(in srgb, var(--c) 22%, transparent),
    inset 0 0 30px color-mix(in srgb, var(--c) 8%, transparent);
}

/* Gradient sweep reveal on hover */
.nav-card::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    160deg,
    color-mix(in srgb, var(--c) 10%, transparent) 0%,
    transparent 50%,
    color-mix(in srgb, var(--c) 5%, transparent) 100%
  );
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}
.nav-card:hover::before { opacity: 1; }

/* ── HUD corner brackets ── */
.corner {
  position: absolute;
  width: 10px;
  height: 10px;
  border-color: var(--c);
  border-style: solid;
  opacity: 0.4;
  transition: opacity 0.3s ease;
}
.nav-card:hover .corner { opacity: 1; }

.corner.tl { top: 8px;    left: 8px;    border-width: 1.5px 0 0 1.5px; }
.corner.tr { top: 8px;    right: 8px;   border-width: 1.5px 1.5px 0 0; }
.corner.bl { bottom: 8px; left: 8px;    border-width: 0 0 1.5px 1.5px; }
.corner.br { bottom: 8px; right: 8px;   border-width: 0 1.5px 1.5px 0; }

/* ── Coordinate readout ── */
.hud-coord {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 6px;
  letter-spacing: 0.08em;
  color: color-mix(in srgb, var(--c) 45%, transparent);
  white-space: nowrap;
  pointer-events: none;
}

/* ── Status bar ── */
.hud-status {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 5px;
  letter-spacing: 0.12em;
  color: color-mix(in srgb, var(--c) 40%, transparent);
  white-space: nowrap;
  pointer-events: none;
  transition: color 0.3s ease;
}
.nav-card:hover .hud-status {
  color: color-mix(in srgb, var(--c) 85%, transparent);
}

/* ── Main label — chromatic aberration text-shadow ── */
.nav-label {
  font-size: clamp(14px, 3.8vw, 24px);
  letter-spacing: 0.18em;
  text-shadow:
    -1px 0 rgba(255, 0, 204, 0.65),
     1px 0 rgba(0, 234, 255, 0.65);
  z-index: 1;
  user-select: none;
}

/* ── Footer ── */
.footer-line {
  font-size: 9px;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.18);
}
.footer-link {
  transition: color 0.2s ease;
}
.footer-link:hover {
  filter: brightness(2);
}
</style>
