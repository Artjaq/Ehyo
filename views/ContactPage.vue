<script setup lang="ts">
import { useRouter } from 'vue-router'
import GlitchText from '@/components/GlitchText.vue'

const router = useRouter()
</script>

<template>
  <main class="min-h-screen bg-black text-white flex flex-col items-center justify-center font-press">
    <section class="terminal-wrap crt w-[95vw] max-w-2xl mx-auto p-4 sm:p-6 md:p-8 rounded-2xl">

      <!-- Title -->
      <div class="text-center pb-3 mb-5" style="border-bottom: 1px solid rgba(0,234,255,0.14)">
        <GlitchText text="CONTACT" class="font-press text-[40px]" />
      </div>

      <!-- Form grid -->
      <div class="grid grid-cols-[110px_1fr] gap-3 text-left">

        <label class="terminal-label bg-zinc-900 text-[9px] tracking-widest border border-zinc-700 rounded-sm flex items-center justify-center" style="color: rgba(0,234,255,0.7)">
          EMAIL
        </label>
        <input
          type="email"
          placeholder="user@ehyo.io"
          class="terminal-input bg-zinc-950 px-3 py-2 border border-zinc-800 font-mono text-sm placeholder-zinc-600 rounded-sm"
          style="color: #00eaff"
        />

        <label class="terminal-label bg-zinc-900 text-[9px] tracking-widest border border-zinc-700 rounded-sm flex items-center justify-center" style="color: rgba(255,0,204,0.7)">
          SUBJECT
        </label>
        <input
          type="text"
          placeholder="..."
          class="terminal-input bg-zinc-950 px-3 py-2 border border-zinc-800 font-mono text-sm placeholder-zinc-600 rounded-sm"
          style="color: #ff00cc"
        />

        <label class="terminal-label bg-zinc-900 text-[9px] tracking-widest border border-zinc-700 rounded-sm flex items-center justify-center" style="color: rgba(57,255,20,0.7)">
          MESSAGE
        </label>
        <textarea
          placeholder="..."
          :rows="4"
          class="terminal-input bg-zinc-950 px-3 py-2 border border-zinc-800 font-mono text-sm placeholder-zinc-600 resize-none rounded-sm"
          style="color: #39ff14"
        />

      </div>

      <!-- Buttons -->
      <div class="mt-5 grid grid-cols-2 gap-3">
        <button
          class="hud-glow relative overflow-hidden bg-zinc-900 border border-zinc-700 py-3 text-[9px] tracking-[0.15em] rounded-sm transition-colors"
          style="color: #00eaff"
        >
          SEND TO EHYO
        </button>
        <button
          class="hud-glow relative overflow-hidden bg-zinc-900 border border-zinc-700 py-3 text-[9px] tracking-[0.15em] rounded-sm transition-colors"
          style="color: rgba(255,0,204,0.8)"
        >
          ORDER SUPPORT
        </button>
      </div>

      <!-- Footer -->
      <p class="mt-5 text-center text-[8px] tracking-wide" style="color: rgba(255,255,255,0.18)">
        © 2025 EHYO —
        <span style="color: rgba(0,234,255,0.3)">TERMS</span> ·
        <span style="color: rgba(255,0,204,0.3)">PRIVACY</span>
      </p>

      <!-- Back link -->
      <div class="mt-3 text-center">
        <a
          href="/home"
          @click.prevent="router.push('/home')"
          class="inline-block font-press text-[8px] tracking-wider transition-colors duration-200"
          style="color: rgba(0,234,255,0.4)"
          onmouseover="this.style.color='#00eaff'"
          onmouseout="this.style.color='rgba(0,234,255,0.4)'"
        >
          [ ← RETURN TO DIR ]
        </a>
      </div>

    </section>
  </main>
</template>
