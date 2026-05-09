<script setup lang="ts">
import { computed } from 'vue'
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
  cn(
    "glitch select-none tracking-tight font-extrabold uppercase",
    props.className
  )
)
</script>

<template>
  <component
    :is="as"
    :aria-label="text"
    :data-text="text"
    :class="componentClass"
  >
    {{ text }}
  </component>
</template>

