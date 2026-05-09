<script setup lang="ts">
/**
 * ProductCanvas — drop-in 3D display case for shop slots.
 *
 * Props:
 *   modelPath?: string   — path to a .glb file. Omit to show placeholder.
 *
 * Swap model per slot in ShopPage:
 *   <ProductCanvas model-path="/models/cap.glb" />
 */
import { TresCanvas } from '@tresjs/core'
import HoloMesh from './HoloMesh.vue'
import GlbModel from './GlbModel.vue'

defineProps<{
  modelPath?: string
}>()
</script>

<template>
  <TresCanvas
    :alpha="true"
    :antialias="true"
    :shadows="false"
    :window-size="false"
    :clear-alpha="0"
    class="tres-canvas"
  >
    <!-- Fixed display camera — no controls intentionally -->
  <TresPerspectiveCamera
    :position="[0, 0, 4.5]"  :fov="42"
    :near="0.1"
    :far="100"
    />

    <!-- Soft fill light + key directional -->
    <TresAmbientLight :intensity="0.6" />
    <TresDirectionalLight :position="[3, 4, 3]" :intensity="1.2" />
    <TresDirectionalLight :position="[-3, -2, -3]" :intensity="0.3" color="#00eaff" />

    <!-- Model: GLB if path provided, holographic placeholder otherwise -->
    <GlbModel v-if="modelPath" :path="modelPath" />
    <HoloMesh v-else />
  </TresCanvas>
</template>

<style scoped>
/*
  TresCanvas renders a div > canvas structure.
  This makes both fill the slot card absolutely.
*/
.tres-canvas {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
}

.tres-canvas :deep(canvas) {
  width: 100% !important;
  height: 100% !important;
  display: block;
}
</style>
