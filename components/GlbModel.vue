<script setup lang="ts">
/**
 * GlbModel — async GLB/GLTF loader with auto-rotate.
 * Usage inside ProductCanvas:
 *   <GlbModel path="/models/sneaker.glb" :speed="0.5" />
 */
import { computed, shallowRef } from 'vue'
import { useGLTF } from '@tresjs/cientos'
import { useLoop } from '@tresjs/core'

const props = withDefaults(defineProps<{
  path: string
  speed?: number
}>(), {
  speed: 0.5,
})

const { state, isLoading } = useGLTF(computed(() => props.path))

const groupRef = shallowRef()

const { onBeforeRender } = useLoop()

onBeforeRender(({ delta }) => {
  if (!groupRef.value) return
  groupRef.value.rotation.y += delta * props.speed
})
</script>

<template>
  <!-- Show placeholder while loading -->
  <HoloMesh v-if="isLoading || !state" />

  <!-- Render loaded scene graph -->
  <TresPrimitive
    v-else
    ref="groupRef"
    :object="state.scene"
  />
</template>
