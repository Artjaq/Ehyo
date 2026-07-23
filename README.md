```
███████╗██╗  ██╗██╗   ██╗ ██████╗
██╔════╝██║  ██║╚██╗ ██╔╝██╔═══██╗
█████╗  ███████║ ╚████╔╝ ██║   ██║
██╔══╝  ██╔══██║  ╚██╔╝  ██║   ██║
███████╗██║  ██║   ██║   ╚██████╔╝
╚══════╝╚═╝  ╚═╝   ╚═╝    ╚═════╝
```

> `> boot ehyo.ch ................ OK`
> `> mode: cyberpunk / terminal / CRT`
> `> payload: streetwear en drops limités + un twin-stick survivor maison`

**[ehyo.ch](https://ehyo.ch)** — marque de streetwear suisse et terrain de jeu web.
Le site n'est pas une vitrine e-commerce de plus : c'est une **interface terminal**
dans laquelle on entre par un écran d'intro glitché, on navigue au clavier comme dans
une console, et où l'onglet `GAME` lance un vrai jeu d'arcade développé from scratch.

---

## `> whoami`

Projet perso complet, conçu et développé seul : direction artistique, design system,
front-end, moteur de jeu 2D, pipeline 3D produit et déploiement.

| | |
|---|---|
| **Rôle** | Design + développement front-end + game dev |
| **Statut** | En production sur ehyo.ch |
| **Volets** | Boutique (drops limités, CHF, TWINT à venir) · Section gaming |

---

## `> stack`

```
Vue 3 (<script setup>, Composition API)  ·  TypeScript  ·  Vite
Vue Router 4                             ·  TailwindCSS v4
TresJS v5 / Three.js  (3D produit)       ·  Canvas 2D custom  (le jeu)
class-variance-authority                 ·  Firebase Hosting
```

Paiements prévus : Stripe (Checkout + TWINT), Upstash Redis pour le stock temps réel,
Resend pour le transactionnel — via serverless functions, **aucune clé secrète dans le front**.

---

## `> identity`

Une esthétique tenue de bout en bout, documentée dans [`CHARTE-GRAPHIQUE.md`](CHARTE-GRAPHIQUE.md) :

- **Néons** — cyan `#00eaff` (signature), magenta `#ff00cc` (CTA), amber `#ffaa00`,
  green `#39ff14`, rouge glitch `#ff004c`, sur fond quasi noir `#00040a`.
- **Effets signature** — scanlines CRT, dédoublement RGB `.glitch`, brackets HUD,
  curseur clignotant, glow pulsé. Tous budgétisés : coupés sur mobile et profil perf bas.
- **Typo** — `Geist` / `Geist Mono` pour le corps et le technique, `Press Start 2P`
  pour les titres et le HUD, avec parcimonie.
- **Deux couches assumées** — tokens sémantiques shadcn/ui en `oklch` pour l'UI
  structurelle, couche néon rétro par-dessus pour la personnalité.

---

## `> map`

| Route | Écran |
|---|---|
| `/` | Intro glitchée, bouton START qui « respire » |
| `/home` | Menu principal type console |
| `/shop` | Grille de drops, faisceau de scan sur les slots |
| `/shop/:slug` | Fiche produit avec rendu **3D temps réel** (TresJS, lazy-loadé) |
| `/about` | Manifeste de la marque |
| `/contact` | Formulaire en look terminal |
| `/game` | **NEON GRAFFITI SURVIVOR** |

---

## `> game — NEON GRAFFITI SURVIVOR`

La pièce technique du projet. Un twin-stick survivor jouable au clavier/souris comme au
doigt, **écrit sur un moteur Canvas 2D maison — pas de Phaser, pas de moteur tiers**.

> Tu tiens un pâté de maisons. Tu vises ta bombe de peinture, tu spray les vagues.
> La peinture ramassée débloque des armes plus lourdes.

**Contenu** — 4 armes (spray, marker perçant, bombe à ciblage auto, lance-flammes),
5 types d'ennemis + élites, un boss d'arène, un monde à secteurs qu'on déverrouille au
compteur de kills, minimap, bonus au sol, 3 difficultés.

**Ce qui rend la chose intéressante côté ingénierie :**

- **Zéro état de jeu dans Vue.** Tout vit dans le moteur ; le HUD s'écrit en DOM direct
  à chaque frame, seuls les événements rares (unlock, game over) passent par la réactivité.
- **Zéro allocation dans le hot path.** Entités pré-allouées, pooling *swap-remove*,
  tableaux de tri persistants — aucun `push`/`splice` par frame.
- **Hash spatial** en `Int32Array` reconstruit chaque frame pour les collisions et les explosions.
- **Niveau procédural par chunks** (corridors, carrefours, places), colliders en buckets,
  **flow field BFS** pour le pathing, décor baké dans des tuiles pré-rendues (cache LRU).
- **Profil de qualité adaptatif** — détection mobile/desktop, puis scaler dynamique qui
  dégrade halos, ombres et densité d'entités si le temps de frame dérape.
- **Tactile natif** — deux joysticks virtuels avec suivi indépendant des `pointerId`,
  déplacement à gauche, visée + tir à droite.

---

## `> run`

```bash
npm install
npm run dev             # serveur de dev Vite
npm run build           # vue-tsc (typecheck) puis build
npm run preview         # sert le build
npm run deploy          # build + Firebase Hosting
npm run deploy:preview  # canal de preview (expire 7j)
```

Structure à la **racine** du repo (l'alias `@` y pointe) :
`components/` · `views/` · `router/` · `data/` · `lib/` · `assets/` · `game/`

---

## `> docs`

- [`CLAUDE.md`](CLAUDE.md) — architecture, invariants du moteur, dette technique
- [`CHARTE-GRAPHIQUE.md`](CHARTE-GRAPHIQUE.md) — tokens, effets, règles d'usage
- [`CHANGELOG.md`](CHANGELOG.md) — journal antéchronologique des modifications

```
> session end ......................... ▮
```
