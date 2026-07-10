<script setup lang="ts">
import { RouterLink } from 'vue-router'
import GameCanvas from '@/game/GameCanvas.vue'
</script>

<template>
  <main class="game-page">
    <RouterLink to="/home" class="back">← MENU</RouterLink>
    <GameCanvas />
  </main>
</template>

<style scoped>
.game-page {
  position: fixed;
  inset: 0;
  background: #00040a;
}
.back {
  position: absolute;
  top: 14px;
  right: 16px;
  z-index: 30; /* au-dessus des overlays du jeu : porte de sortie toujours cliquable */
  font-family: 'Geist Mono', monospace;
  font-size: 13px;
  letter-spacing: 2px;
  color: #9ca3af;
  text-decoration: none;
  padding: 6px 10px;
  border: 1px solid rgba(0, 234, 255, 0.12);
  border-radius: 8px;
  background: rgba(0, 4, 10, 0.7);
}
.back:hover {
  color: #fff;
}
</style>
