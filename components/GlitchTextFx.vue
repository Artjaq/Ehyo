<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { cn } from '@/lib/utils'

interface Props {
  text: string
  className?: string
  as?: string
}

const props = withDefaults(defineProps<Props>(), {
  as: 'h1'
})

const componentClass = computed(() =>
  cn("glitch select-none tracking-tight font-extrabold uppercase", props.className)
)

const x = ref(0)
const y = ref(0)

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    const sequence = [0, -2, 2, -1, 1, 0]
    const times = [0, 0.2, 0.4, 0.6, 0.8, 1]
    const duration = 250
    
    sequence.forEach((value, index) => {
      setTimeout(() => {
        x.value = value
      }, duration * times[index])
    })
    
    setTimeout(() => {
      x.value = 0
    }, duration)
  }
}

const handleMouseEnter = () => {
  const sequenceX = [0, -1, 1, 0]
  const sequenceY = [0, 0, -1, 0]
  const duration = 200
  
  sequenceX.forEach((value, index) => {
    setTimeout(() => {
      x.value = value
      y.value = sequenceY[index]
    }, (duration / sequenceX.length) * index)
  })
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div
    :style="{ transform: `translate(${x}px, ${y}px)` }"
    @mouseenter="handleMouseEnter"
    style="transition: transform 0.2s ease"
  >
    <component
      :is="as"
      :aria-label="text"
      :data-text="text"
      :class="componentClass"
    >
      {{ text }}
    </component>
  </div>
</template>

