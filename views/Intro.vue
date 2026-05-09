<script setup lang="ts">
import { useRouter } from 'vue-router'
import GlitchText from '@/components/GlitchText.vue'
import StartButton from '@/components/StartButton.vue'

const router = useRouter()

const handleStartClick = () => {
  router.push('/home')
}
</script>

<template>
  <main class="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-10">
    <section class="crt text-center px-6 sm:px-12 py-8 sm:py-12 border border-zinc-700/80 bg-zinc-950/70 rounded-2xl">
      <GlitchText text="ENTER TO EHYO" class="text-5xl md:text-7xl" />
    </section>

    <StartButton :on-click="handleStartClick" />
  </main>
</template>

