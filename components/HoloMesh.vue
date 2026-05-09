<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useLoop, useTresContext } from '@tresjs/core'
import * as THREE from 'three'
import doormatUrl from '../assets/doormat-texture.png'

const { scene, renderer } = useTresContext()
let doormat: THREE.Mesh | null = null

// 45° base tilt — top face tilted toward the camera (+Z)
const BASE_ROT_X = Math.PI / 4

// Animation accumulators
let elapsedTime = 0

// Hover tilt state (offsets from BASE_ROT_X)
let tiltOffsetX = 0
let tiltOffsetZ = 0
let tiltTargetX = 0
let tiltTargetZ = 0

function createCocoFiberBumpTexture(): THREE.CanvasTexture {
  const SIZE = 512
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#555'
  ctx.fillRect(0, 0, SIZE, SIZE)

  const FIBER_H = 4
  for (let y = 0; y < SIZE; y += FIBER_H) {
    for (let x = 0; x < SIZE; x++) {
      const v = 100 + Math.random() * 60 + Math.sin(x * 0.15) * 20
      ctx.fillStyle = `rgb(${v | 0},${v | 0},${v | 0})`
      ctx.fillRect(x, y, 1, FIBER_H - 1)
    }
  }

  const FIBER_V = 8
  for (let x = 0; x < SIZE; x += FIBER_V) {
    for (let y = 0; y < SIZE; y++) {
      const v = 60 + Math.random() * 40
      ctx.fillStyle = `rgba(${v | 0},${v | 0},${v | 0},0.6)`
      ctx.fillRect(x, y, FIBER_V - 3, 1)
    }
  }

  return new THREE.CanvasTexture(canvas)
}

function onPointerMove(e: PointerEvent) {
  const el = renderer.value?.domElement
  if (!el) return
  const { left, top, width, height } = el.getBoundingClientRect()
  // Normalize to -1..1 (nx: left=-1, right=+1 / ny: bottom=-1, top=+1)
  const nx = ((e.clientX - left) / width) * 2 - 1
  const ny = -((e.clientY - top) / height) * 2 + 1
  tiltTargetX =  ny * 0.15   // mouse up   → tilt top toward viewer
  tiltTargetZ = -nx * 0.15   // mouse right → tilt right
}

function onPointerLeave() {
  tiltTargetX = 0
  tiltTargetZ = 0
}

onMounted(() => {
  const bumpMap = createCocoFiberBumpTexture()

  const topTex = new THREE.TextureLoader().load(doormatUrl)
  topTex.colorSpace = THREE.SRGBColorSpace
  topTex.wrapS = THREE.RepeatWrapping
  topTex.wrapT = THREE.RepeatWrapping
  topTex.repeat.set(1, 1)

  const topMat = new THREE.MeshStandardMaterial({
    map: topTex,
    bumpMap,
    bumpScale: 0.6,
    roughness: 0.9,
    metalness: 0,
  })

  const rubberMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.95,
    metalness: 0,
  })

  const geo = new THREE.BoxGeometry(1.5, 0.04, 1)
  doormat = new THREE.Mesh(geo, [rubberMat, rubberMat, topMat, rubberMat, rubberMat, rubberMat])
  doormat.rotation.x = BASE_ROT_X

  const el = renderer.value?.domElement
  el?.addEventListener('pointermove', onPointerMove)
  el?.addEventListener('pointerleave', onPointerLeave)

  scene.value.add(doormat)
})

onUnmounted(() => {
  const el = renderer.value?.domElement
  el?.removeEventListener('pointermove', onPointerMove)
  el?.removeEventListener('pointerleave', onPointerLeave)

  if (doormat) {
    scene.value?.remove(doormat)
    doormat.geometry.dispose()
    doormat = null
  }
})

const { onBeforeRender } = useLoop()
onBeforeRender(({ delta }) => {
  if (!doormat) return

  elapsedTime += delta

  // Frame-rate-independent lerp toward tilt target
  const a = Math.min(delta * 10, 1)
  tiltOffsetX += (tiltTargetX - tiltOffsetX) * a
  tiltOffsetZ += (tiltTargetZ - tiltOffsetZ) * a

  // Idle: slow Y rotation + vertical bob
  doormat.rotation.y += delta * 0.15
  doormat.rotation.x = BASE_ROT_X + tiltOffsetX
  doormat.rotation.z = tiltOffsetZ
  doormat.position.y = Math.sin(elapsedTime * 1.5) * 0.05
})
</script>

<template></template>
