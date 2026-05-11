<script setup lang="ts">
import { useRouter } from 'vue-router'
import GlitchText from '@/components/GlitchText.vue'
import ProductCanvas from '@/components/ProductCanvas.vue'
import { products } from '@/data/products'

const router = useRouter()

const product = products[0]

function navigateToProduct(slug: string) {
  router.push(`/shop/${slug}`)
}
</script>

<template>
  <main class="min-h-screen bg-black text-white flex items-center justify-center">
    <section class="terminal-wrap crt w-[92vw] max-w-5xl mx-auto p-6 sm:p-8 rounded-2xl">

      <!-- Title -->
      <div class="text-center mb-6">
        <GlitchText text="SHOP" class="font-press text-4xl sm:text-5xl md:text-6xl" />
        <p class="sys-label font-press mt-2">INVENTORY // SCANNING UNITS</p>
      </div>

      <!-- Single unit slot -->
      <div class="flex justify-center">
        <div
          class="slot-card cursor-pointer w-full max-w-[320px] sm:max-w-[380px]"
          :style="{ '--c': product.color }"
          @click="navigateToProduct(product.slug)"
        >
          <!-- Layer 0: faint tech grid (background) -->
          <div class="slot-grid" />

          <!-- Layer 1: 3D canvas (fills card, transparent bg) -->
          <ProductCanvas
            :model-path="product.modelPath"
            :scale="0.5" />

          <!-- Layer 2: HUD overlays (float above canvas) -->
          <span class="corner tl" />
          <span class="corner tr" />
          <span class="corner bl" />
          <span class="corner br" />

          <span class="unit-label font-press">{{ product.name }}</span>
          <span class="slot-status font-press">// AWAITING DROP //</span>
        </div>
      </div>

      <!-- Terminal back link -->
      <div class="mt-8 text-center">
        <a
          href="/home"
          @click.prevent="router.push('/home')"
          class="back-link font-press"
        >
          [ ← RETURN TO DIR ]
        </a>
      </div>

    </section>
  </main>
</template>

<style scoped>
.sys-label {
  font-size: 6px;
  letter-spacing: 0.16em;
  color: rgba(0, 234, 255, 0.32);
}

/* ── Slot card ── */
.slot-card {
  --c: #00eaff;
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: 0.75rem;
  border: 1px solid color-mix(in srgb, var(--c) 28%, transparent);
  background: color-mix(in srgb, var(--c) 3%, #000408);
  overflow: hidden;
  box-shadow:
    0 0 6px  color-mix(in srgb, var(--c) 18%, transparent),
    inset 0 0 20px color-mix(in srgb, var(--c) 4%, transparent);
  transition: box-shadow 0.3s ease, border-color 0.3s ease;
}
.slot-card:hover {
  border-color: color-mix(in srgb, var(--c) 55%, transparent);
  box-shadow:
    0 0 16px color-mix(in srgb, var(--c) 45%, transparent),
    0 0 36px color-mix(in srgb, var(--c) 20%, transparent),
    inset 0 0 28px color-mix(in srgb, var(--c) 7%, transparent);
}

/* Layer 0: faint tech grid */
.slot-grid {
  position: absolute;
  inset: 0;
  z-index: 0;
  background-image:
    linear-gradient(color-mix(in srgb, var(--c) 5%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--c) 5%, transparent) 1px, transparent 1px);
  background-size: 24px 24px;
  pointer-events: none;
}

/* Layer 2: HUD corner brackets */
.corner {
  position: absolute;
  width: 10px;
  height: 10px;
  border-color: var(--c);
  border-style: solid;
  opacity: 0.45;
  z-index: 2;
  pointer-events: none;
  transition: opacity 0.3s ease;
}
.slot-card:hover .corner { opacity: 1; }
.corner.tl { top: 8px;    left: 8px;    border-width: 1.5px 0 0 1.5px; }
.corner.tr { top: 8px;    right: 8px;   border-width: 1.5px 1.5px 0 0; }
.corner.bl { bottom: 8px; left: 8px;    border-width: 0 0 1.5px 1.5px; }
.corner.br { bottom: 8px; right: 8px;   border-width: 0 1.5px 1.5px 0; }

/* Unit ID — top center */
.unit-label {
  position: absolute;
  top: 11px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 6px;
  letter-spacing: 0.1em;
  color: color-mix(in srgb, var(--c) 50%, transparent);
  white-space: nowrap;
  z-index: 2;
  pointer-events: none;
}

/* Status — bottom center */
.slot-status {
  position: absolute;
  bottom: 11px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 5px;
  letter-spacing: 0.1em;
  color: color-mix(in srgb, var(--c) 35%, transparent);
  white-space: nowrap;
  z-index: 2;
  pointer-events: none;
  transition: color 0.3s ease;
}
.slot-card:hover .slot-status {
  color: color-mix(in srgb, var(--c) 70%, transparent);
}

/* Terminal back link */
.back-link {
  font-size: 9px;
  letter-spacing: 0.15em;
  color: rgba(0, 234, 255, 0.40);
  text-decoration: none;
  border: 1px solid rgba(0, 234, 255, 0.18);
  padding: 0.4rem 1.1rem;
  border-radius: 0.3rem;
  display: inline-block;
  transition: color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}
.back-link:hover {
  color: #00eaff;
  border-color: rgba(0, 234, 255, 0.55);
  box-shadow: 0 0 12px rgba(0, 234, 255, 0.28);
}
</style>
