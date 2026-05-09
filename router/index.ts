import { createRouter, createWebHistory } from 'vue-router'
import Intro from '@/views/Intro.vue'
import HomeMenu from '@/views/HomeMenu.vue'
import ContactPage from '@/views/ContactPage.vue'
import ShopPage from '@/views/ShopPage.vue'

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
      path: '/shop',
      name: 'shop',
      component: ShopPage
    }
  ]
})

export default router

