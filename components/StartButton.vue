<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import Button from '@/components/ui/Button.vue'

interface Props {
  onClick?: () => void
}

const props = defineProps<Props>()

const scale = ref(1)
let animationId: number | null = null

const animate = () => {
  const start = Date.now()
  const duration = 1500

  const step = () => {
    const elapsed = Date.now() - start
    const progress = (elapsed % duration) / duration

    if (progress < 0.5) {
      scale.value = 1 + (0.04 * (progress * 2))
    } else {
      scale.value = 1.04 - (0.04 * ((progress - 0.5) * 2))
    }

    animationId = requestAnimationFrame(step)
  }

  step()
}

onMounted(() => {
  animate()
})

onUnmounted(() => {
  if (animationId !== null) {
    cancelAnimationFrame(animationId)
  }
})

const handleClick = () => {
  props.onClick?.()
}
</script>

<template>
  <div
    :style="{ transform: `scale(${scale})`, animation: 'pulse-glow-cyan 1.8s ease-in-out infinite' }"
    class="inline-block rounded-xl"
  >
    <Button
      @click="handleClick"
      class="font-press px-15 py-4 text-xl uppercase tracking-wider bg-zinc-950 text-[#00eaff] hover:bg-zinc-900 border border-[#00eaff]/40 hover:border-[#00eaff]/70 rounded-xl transition-colors"
    >
      START
    </Button>
  </div>
</template>
