<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GlitchText from '@/components/GlitchText.vue'
import ProductCanvas from '@/components/ProductCanvas.vue'
import { getProductBySlug } from '@/data/products'

const route = useRoute()
const router = useRouter()

const slug = route.params.slug as string
const product = getProductBySlug(slug)

if (!product) {
  router.replace('/shop')
}

const quantity = ref(1)

const displayPrice = computed(() =>
  product ? `CHF ${(product.price / 100).toFixed(2)}` : ''
)

function decrement() {
  if (quantity.value > 1) quantity.value--
}

function increment() {
  if (quantity.value < 5) quantity.value++
}

function handleBuy() {
  console.log('TODO: checkout', { slug, quantity: quantity.value })
}
</script>

<template>
  <main class="min-h-screen bg-black text-white flex items-center justify-center py-8">
    <section
      v-if="product"
      class="terminal-wrap crt w-[92vw] max-w-5xl mx-auto p-6 sm:p-8 rounded-2xl"
    >
      <!-- Title -->
      <div class="text-center mb-6">
        <GlitchText :text="product.name" class="font-press text-4xl sm:text-5xl" />
        <p class="sys-label font-press mt-2">PRODUCT // UNIT DETAILS</p>
      </div>

      <!-- Two-column layout: card left, info right -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10">

        <!-- Left: 3D slot card -->
        <div class="slot-card" :style="{ '--c': product.color }">
          <div class="slot-grid" />
          <ProductCanvas :model-path="product.modelPath" />
          <span class="corner tl" />
          <span class="corner tr" />
          <span class="corner bl" />
          <span class="corner br" />
        </div>

        <!-- Right: info panel -->
        <div class="flex flex-col gap-5 justify-center" :style="{ '--c': product.color }">

          <h2 class="font-press text-2xl sm:text-3xl product-name">{{ product.name }}</h2>

          <p class="font-press text-xl product-price">{{ displayPrice }}</p>

          <p class="font-press text-[8px] sm:text-[9px] leading-6 tracking-widest product-desc">
            {{ product.description }}
          </p>

          <p class="sys-label font-press">LIMITED // {{ product.maxStock }} UNITS MAX</p>

          <!-- Quantity selector -->
          <div class="qty-row">
            <span class="sys-label font-press mr-4">QTY</span>
            <div class="qty-selector">
              <button class="qty-btn font-press" :disabled="quantity <= 1" @click="decrement">−</button>
              <span class="qty-value font-press">{{ quantity }}</span>
              <button class="qty-btn font-press" :disabled="quantity >= 5" @click="increment">+</button>
            </div>
          </div>

          <!-- Buy button -->
          <button class="buy-btn font-press" @click="handleBuy">
            BUY NOW
          </button>

        </div>
      </div>

      <!-- Back link -->
      <div class="mt-8 text-center">
        <a
          href="/shop"
          @click.prevent="router.push('/shop')"
          class="back-link font-press"
        >
          [ ← BACK TO SHOP ]
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
}

/* Tech grid background */
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

/* HUD corner brackets */
.corner {
  position: absolute;
  width: 12px;
  height: 12px;
  border-color: var(--c);
  border-style: solid;
  opacity: 0.6;
  z-index: 2;
  pointer-events: none;
}
.corner.tl { top: 10px;    left: 10px;    border-width: 1.5px 0 0 1.5px; }
.corner.tr { top: 10px;    right: 10px;   border-width: 1.5px 1.5px 0 0; }
.corner.bl { bottom: 10px; left: 10px;    border-width: 0 0 1.5px 1.5px; }
.corner.br { bottom: 10px; right: 10px;   border-width: 0 1.5px 1.5px 0; }

/* Product info */
.product-name {
  color: var(--c);
  text-shadow: 0 0 12px color-mix(in srgb, var(--c) 40%, transparent);
}
.product-price {
  color: var(--c);
  opacity: 0.85;
}
.product-desc {
  color: rgba(255, 255, 255, 0.45);
  max-width: 38ch;
}

/* Quantity row */
.qty-row {
  display: flex;
  align-items: center;
}
.qty-selector {
  display: flex;
  align-items: center;
  border: 1px solid color-mix(in srgb, var(--c) 30%, transparent);
  border-radius: 0.3rem;
  overflow: hidden;
}
.qty-btn {
  background: color-mix(in srgb, var(--c) 6%, #000408);
  border: none;
  color: var(--c);
  font-size: 14px;
  line-height: 1;
  padding: 0.45rem 0.9rem;
  cursor: pointer;
  transition: background 0.2s ease;
}
.qty-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--c) 16%, #000408);
}
.qty-btn:disabled {
  opacity: 0.25;
  cursor: not-allowed;
}
.qty-value {
  padding: 0.45rem 1rem;
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--c);
  border-left: 1px solid color-mix(in srgb, var(--c) 20%, transparent);
  border-right: 1px solid color-mix(in srgb, var(--c) 20%, transparent);
  min-width: 2.5rem;
  text-align: center;
}

/* Buy button */
.buy-btn {
  width: 100%;
  padding: 0.9rem;
  font-size: 10px;
  letter-spacing: 0.2em;
  color: var(--c);
  background: color-mix(in srgb, var(--c) 7%, #000408);
  border: 1px solid color-mix(in srgb, var(--c) 38%, transparent);
  border-radius: 0.3rem;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 0 8px color-mix(in srgb, var(--c) 18%, transparent);
}
.buy-btn:hover {
  background: color-mix(in srgb, var(--c) 14%, #000408);
  border-color: color-mix(in srgb, var(--c) 65%, transparent);
  box-shadow:
    0 0 18px color-mix(in srgb, var(--c) 42%, transparent),
    0 0 36px color-mix(in srgb, var(--c) 18%, transparent);
}

/* Back link */
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
