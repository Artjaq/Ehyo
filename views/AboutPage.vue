<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import GlitchText from '@/components/GlitchText.vue'

const router = useRouter()

const headerOpacity = ref(0)
const headerY = ref(8)
const blockOpacity = ref(0)
const blockY = ref(10)
const footerOpacity = ref(0)

onMounted(() => {
  setTimeout(() => { headerOpacity.value = 1; headerY.value = 0 }, 0)
  setTimeout(() => { blockOpacity.value = 1; blockY.value = 0 }, 120)
  setTimeout(() => { footerOpacity.value = 1 }, 280)
})
</script>

<template>
  <main class="min-h-screen bg-black text-white flex items-center justify-center py-8">
    <section class="terminal-wrap crt w-[92vw] max-w-3xl mx-auto p-6 sm:p-8 rounded-2xl">

      <!-- Title -->
      <div
        class="text-center mb-8"
        :style="{
          opacity: headerOpacity,
          transform: `translateY(${headerY}px)`,
          transition: 'opacity 0.4s, transform 0.4s',
        }"
      >
        <GlitchText text="ABOUT" class="font-press text-4xl sm:text-5xl md:text-6xl" />
        <p class="sys-label font-press mt-2">MANIFESTO // SIGNAL ORIGIN</p>
      </div>

      <!-- Manifesto block with HUD corners -->
      <div
        class="manifesto-block"
        :style="{
          opacity: blockOpacity,
          transform: `translateY(${blockY}px)`,
          transition: 'opacity 0.45s 0.12s, transform 0.45s 0.12s',
        }"
      >
        <!-- Tech grid background -->
        <div class="manifesto-grid" />

        <!-- HUD corners -->
        <span class="corner tl" />
        <span class="corner tr" />
        <span class="corner bl" />
        <span class="corner br" />

        <!-- Content -->
        <div class="manifesto-content font-press">
          <p class="intro-line">EHYO is a signal. Not a brand.</p>

          <div class="block-section">
            <p class="section-label">// PROTOCOL // DROP</p>
            <p>
              > Objects have no fixed category.<br>
              > Textile or plastic. Digital or physical.<br>
              > Nothing is defined in advance.<br>
              > The drop names itself.
            </p>
          </div>

          <div class="block-section">
            <p class="section-label">// FREQUENCY // NONE</p>
            <p>
              > No schedule. No season. No collection.<br>
              > The signal drops when it drops.<br>
              > Catch it or don't.
            </p>
          </div>

          <div class="block-section">
            <p class="section-label">// INVENTORY // LOW</p>
            <p>
              > Short runs. No restock. No exceptions.<br>
              > Each object exists once, then disappears.<br>
              > Scarcity is not a strategy. It is the design.
            </p>
          </div>

          <p class="closing-line">
            If you caught the signal, you're already in the grid.
          </p>
        </div>
      </div>

      <!-- Footer + back link -->
      <div
        :style="{
          opacity: footerOpacity,
          transition: 'opacity 0.4s 0.28s',
        }"
      >
        <p class="footer-line font-press mt-6 text-center">
          © 2025 EHYO —
          <span style="color: rgba(0,234,255,0.3)">TERMS</span> ·
          <span style="color: rgba(255,0,204,0.3)">PRIVACY</span>
        </p>

        <div class="mt-3 text-center">
          <a
            href="/home"
            @click.prevent="router.push('/home')"
            class="back-link font-press"
          >
            [ ← RETURN TO DIR ]
          </a>
        </div>
      </div>

    </section>
  </main>
</template>

<style scoped>
.manifesto-block { --c: #ff00cc; }

.sys-label {
  font-size: 6px;
  letter-spacing: 0.16em;
  color: rgba(255, 0, 204, 0.32);
}

/* ── Manifesto block ── */
.manifesto-block {
  position: relative;
  border-radius: 0.75rem;
  border: 1px solid color-mix(in srgb, var(--c) 22%, transparent);
  background: color-mix(in srgb, var(--c) 3%, #000408);
  overflow: hidden;
  padding: 1.75rem 1.5rem;
  box-shadow:
    0 0 6px  color-mix(in srgb, var(--c) 14%, transparent),
    inset 0 0 24px color-mix(in srgb, var(--c) 4%, transparent);
}

/* Tech grid */
.manifesto-grid {
  position: absolute;
  inset: 0;
  z-index: 0;
  background-image:
    linear-gradient(color-mix(in srgb, var(--c) 4%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--c) 4%, transparent) 1px, transparent 1px);
  background-size: 28px 28px;
  pointer-events: none;
}

/* HUD corner brackets */
.corner {
  position: absolute;
  width: 12px;
  height: 12px;
  border-color: var(--c);
  border-style: solid;
  opacity: 0.45;
  z-index: 2;
  pointer-events: none;
}
.corner.tl { top: 10px;    left: 10px;    border-width: 1.5px 0 0 1.5px; }
.corner.tr { top: 10px;    right: 10px;   border-width: 1.5px 1.5px 0 0; }
.corner.bl { bottom: 10px; left: 10px;    border-width: 0 0 1.5px 1.5px; }
.corner.br { bottom: 10px; right: 10px;   border-width: 0 1.5px 1.5px 0; }

/* Content */
.manifesto-content {
  position: relative;
  z-index: 1;
  font-size: 9px;
  line-height: 1.75;
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.55);
}

@media (min-width: 640px) {
  .manifesto-content { font-size: 10px; }
}

.intro-line {
  color: color-mix(in srgb, var(--c) 85%, #fff);
  font-size: 11px;
  letter-spacing: 0.15em;
  margin-bottom: 1.5rem;
  text-shadow: 0 0 10px color-mix(in srgb, var(--c) 40%, transparent);
}

@media (min-width: 640px) {
  .intro-line { font-size: 12px; }
}

.block-section {
  margin-bottom: 1.25rem;
}

.section-label {
  color: color-mix(in srgb, var(--c) 60%, transparent);
  letter-spacing: 0.2em;
  margin-bottom: 0.4rem;
}

.closing-line {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid color-mix(in srgb, var(--c) 14%, transparent);
  color: color-mix(in srgb, var(--c) 50%, rgba(255, 255, 255, 0.3));
  letter-spacing: 0.14em;
}

/* Footer */
.footer-line {
  font-size: 9px;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.18);
}

/* Back link — magenta */
.back-link {
  font-size: 9px;
  letter-spacing: 0.15em;
  color: rgba(255, 0, 204, 0.40);
  text-decoration: none;
  border: 1px solid rgba(255, 0, 204, 0.18);
  padding: 0.4rem 1.1rem;
  border-radius: 0.3rem;
  display: inline-block;
  transition: color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}
.back-link:hover {
  color: #ff00cc;
  border-color: rgba(255, 0, 204, 0.55);
  box-shadow: 0 0 12px rgba(255, 0, 204, 0.28);
}
</style>
