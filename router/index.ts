import { createRouter, createWebHistory } from 'vue-router'
import Intro from '@/views/Intro.vue'
import HomeMenu from '@/views/HomeMenu.vue'
import ContactPage from '@/views/ContactPage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'intro',
      component: Intro
    },
    {
      path: '/home',
      name: 'home',
      component: HomeMenu
    },
    {
      path: '/contact',
      name: 'contact',
      component: ContactPage
    },
    {
      // Lazy : ShopPage tire ProductCanvas → Three.js/TresJS (~1 Mo min) ;
      // le split évite de charger la 3D sur les pages qui ne l'utilisent pas.
      path: '/shop',
      name: 'shop',
      component: () => import('@/views/ShopPage.vue')
    },
    {
      path: '/shop/:slug',
      name: 'product',
      component: () => import('@/views/ProductDetailPage.vue')
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('@/views/AboutPage.vue')
    },
    {
      path: '/game',
      name: 'game',
      component: () => import('@/views/GamePage.vue')
    }
  ]
})

export default router

