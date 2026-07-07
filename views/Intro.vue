<script setup lang="ts">
import { useRouter } from 'vue-router'
import GlitchText from '@/components/GlitchText.vue'
import StartButton from '@/components/StartButton.vue'
import logoUrl from '@/assets/picture/chyo-blanc.svg'

const router = useRouter()

const handleStartClick = () => {
  router.push('/home')
}
</script>

<template>
  <main class="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-8">
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
</template>

