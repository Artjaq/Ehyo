# Migration React vers Vue 3

Ce projet contient la version Vue 3 du projet React original.

## Structure du projet

```
src/
├── assets/          # Fichiers statiques (CSS, images)
├── components/      # Composants Vue réutilisables
│   ├── ui/         # Composants UI de base
│   └── ...         # Autres composants
├── lib/            # Utilitaires et helpers
├── router/         # Configuration Vue Router
├── views/          # Pages/Vues (équivalent aux pages Next.js)
├── App.vue         # Composant racine
├── main.ts         # Point d'entrée de l'application
└── index.html      # Template HTML
```

## Conversions effectuées

### Hooks React → Composition API Vue

- `useState` → `ref()` ou `reactive()`
- `useEffect` (sans dépendances) → `onMounted()`
- `useEffect` (avec dépendances) → `watch()` avec `immediate: true` si nécessaire
- `useMemo` → `computed()`
- `useCallback` → Fonctions simples (non nécessaires en Vue)
- `useRouter` (Next.js) → `useRouter()` (Vue Router)

### Composants

- **GlitchText** : Converti en composant Vue avec `defineProps` et `computed`
- **GlitchTextFx** : Converti avec gestion d'événements clavier et animations
- **StartButton** : Converti avec animation de scale utilisant `requestAnimationFrame`
- **Button** : Composant UI avec variants utilisant `class-variance-authority`

### Pages

- **Intro** : Page d'accueil avec GlitchText et StartButton
- **HomeMenu** : Menu principal avec animations d'apparition
- **ContactPage** : Formulaire de contact
- **ShopPage** : Page boutique

### Routing

- Next.js App Router → Vue Router 4
- Routes configurées dans `src/router/index.ts`

## Installation

```bash
cd src
npm install
```

## Développement

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Différences principales avec React

1. **Syntaxe** : Utilisation de `<script setup>` pour la Composition API
2. **Templates** : Directives Vue (`v-if`, `v-for`, `v-model`, etc.) au lieu de JSX
3. **Routing** : Vue Router au lieu de Next.js App Router
4. **Animations** : Animations CSS natives et `requestAnimationFrame` au lieu de Framer Motion (peut être ajouté si nécessaire)
5. **Polices** : Chargement via Google Fonts dans `index.html` au lieu de `next/font`

## Notes

- Les styles CSS/Tailwind sont conservés à l'identique
- Le niveau TypeScript est maintenu
- Les classes CSS personnalisées (`.glitch`, `.crt`) sont préservées
- Les fonctionnalités sont équivalentes à la version React

