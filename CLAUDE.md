# CLAUDE.md

Guide pour tout agent (Claude Code) travaillant sur ce repo. Lis-le en entier avant
de toucher au code. Écrit en français, comme les commentaires du projet.

## Projet

**EHYO** (ehyo.ch) — site cyberpunk / esthétique terminal, deux volets imbriqués :
une boutique e-commerce en drops limités (marché suisse, CHF, TWINT à venir) et une
**section gaming**. Ce document couvre tout le repo, avec une section détaillée sur le
jeu (branche `game`).

- **Stack** : Vue 3 (`<script setup>`, Composition API) + Vite + TypeScript, Vue Router 4,
  TresJS v5 (canvas 3D sur certaines pages), TailwindCSS v4, `class-variance-authority`
  pour les variants UI.
- **Hosting** : Firebase Hosting (projet `ehyo-947a4`, déployé sur ehyo.ch, DNS Infomaniak).
- **Paiements (prévu, pas actif)** : Stripe (Checkout + TWINT), Upstash Redis pour le stock,
  Resend pour l'email transactionnel. Les clés secrètes ne doivent JAMAIS être dans le front —
  serverless functions obligatoires.

> Le `README.md` décrit une structure `src/…` héritée de la migration React→Vue : c'est
> **périmé**. Les fichiers vivent à la **racine** du repo (voir ci-dessous). L'alias `@`
> pointe sur la racine.

## Commandes

```bash
npm run dev            # serveur de dev Vite
npm run build          # vue-tsc (typecheck) puis build Vite
npm run preview        # sert le build
npm run lint           # eslint --fix sur .vue/.ts/.js…
npm run deploy         # build + firebase deploy --only hosting
npm run deploy:preview # build + canal de preview Firebase (expire 7j)
```

Toujours faire passer `npm run build` (il typecheck via `vue-tsc`) avant de considérer
un changement comme terminé.

## Structure

```
assets/            # CSS, images statiques
components/        # composants Vue réutilisables (ui/ = primitives)
data/              # modèle produits e-commerce
lib/               # utilitaires
router/index.ts    # routes (dont /game)
views/             # pages : Intro, HomeMenu, ContactPage, ShopPage,
                   #         ProductDetailPage, AboutPage, GamePage
game/              # LE JEU (présent sur la branche game)
  GameCanvas.vue   #   composant unique : monte le moteur + HUD + joysticks
  engine/
    engine.ts      #   moteur complet (~1564 lignes) — voir section Jeu
    quality.ts     #   profils perf mobile/desktop + scaler dynamique
    level.ts       #   génération de niveau, colliders, flow field
    sprites.ts     #   sprites/halos bakés offscreen
App.vue, main.ts, index.html, firebase.json, vite.config.ts, tailwind.config.ts …
```

Conventions transverses : commentaires en **français**.

## Charte graphique

Voir **`CHARTE-GRAPHIQUE.md`** pour le détail complet. En bref — identité cyberpunk /
terminal / CRT. Deux couches : tokens sémantiques **shadcn/ui en `oklch`** (clair + `.dark`)
pour l'UI standard, et une **couche néon rétro** pour la personnalité. Le système de couleurs
vit dans `assets/globals.css` (pas dans Tailwind, dont le thème est vide).

- **Néons** : cyan `#00eaff` (signature — bordures, focus, hover, HUD), magenta `#ff00cc`
  (CTA marque), amber `#ffaa00`, green `#39ff14` ; rouge glitch `#ff004c`.
- **Fond sombre** `#00040a` ; conteneur `.terminal-wrap` (fond `rgba(0,4,10,0.88)`, bordure
  cyan `rgba(0,234,255,0.12)`, glow).
- **Polices** : `Geist` (corps), `Geist Mono` (technique/terminal), `Press Start 2P`
  (titres/HUD/CTA, avec parcimonie).
- **Composants/effets signature à réutiliser** : `.crt`, `.glitch` (dédoublement RGB),
  `.hud-corner-*`, `.hud-glow`, `.terminal-input`, `.terminal-label`, et la bibliothèque
  d'animations de `globals.css` (`neonPulse`, `crtFlicker`, `cardGlitch`, `scanLine`…).

**Règle** : réutiliser les tokens/classes existants, ne pas hardcoder de couleurs à côté ;
le néon reste un accent (sobre et sombre par défaut) ; effets CRT/glitch budgétisés (coupés
sur mobile / profil perf bas).

---

## Le jeu — NEON GRAFFITI SURVIVOR

Twin-stick survivor. **Moteur Canvas 2D custom, aucun Phaser** (rien dans les dépendances).
Tu tiens un pâté de maisons, tu vises ta bombe de peinture et tu spray les ennemis ;
la peinture ramassée débloque des armes plus lourdes. Route `/game` → `views/GamePage.vue`
→ `game/GameCanvas.vue`.

### Architecture

Une seule classe `GameEngine` dans `engine/engine.ts`. **Tout l'état vit dans le moteur,
jamais dans la réactivité Vue.** Communication moteur → composant via `EngineHooks` :

- `hud(state)` : appelé **chaque frame**, écrit en **DOM direct** via des template refs
  (`textContent`, `style.width`) — jamais via des refs réactives.
- `weapons(list)` / `unlock(info)` / `gameOver(stats)` : rares → refs Vue réactives
  (overlays, barre d'armes).

Boucle `requestAnimationFrame` : `dt` clampé à 0.05 s ; `update()` seulement si
`state === 'playing'`, `render()` toujours. Points clés :

- **Pooling swap-remove** : toutes les entités pré-allouées une fois. Capacités —
  ennemis 240, tirs 160, bombes 24, orbes 240, particules 320, splats 60. Convention
  `[0, count)` = vivants ; mort = swap avec le dernier vivant + `count--`. **Jamais de
  `splice`/`push` par frame.** Les profils bornent le nombre *vivant*, pas la capacité.
- **Hash spatial** (Int32Array, têtes de liste par cellule) reconstruit chaque frame
  pour les collisions tirs↔ennemis et le balayage des explosions.
- **Culling viewport** sur toutes les entités (marge = `profile.cullMargin`).
- **Rendu Canvas 2D** : décor statique blitté depuis des **tuiles pré-rendues** (cache LRU),
  sprites/halos bakés offscreen (`sprites.ts`), halos en `globalCompositeOperation='lighter'`,
  `imageSmoothingEnabled=false` (pixel art), transform DPR via `setTransform`.
- **Tri en profondeur** : tableau persistant `sortSlots`, comparateur constant (pas de closure).
- **Cycle de vie** : `init()` / `start()` / `destroy()`. Tous les listeners passent par un
  `AbortController` ; `ResizeObserver` sur le wrap. `destroy()` annule le rAF et coupe tout.

### Profil de qualité / perf (`quality.ts`)

Seul tuning **centralisé** du projet. Détection mobile/desktop (`pointer: coarse` ou plus
petit côté < 768 px ; override via prop `quality` ou `?quality=`).

| Champ | mobile | desktop |
|---|---|---|
| DPR max | 1 | 2 |
| ennemis max | 80 | 220 |
| particules max | 90 | 300 |
| halos | `near` | `full` |
| CRT | non | oui |

Scaler dynamique : EMA du temps de frame > `FRAME_BUDGET_MS` (20 ms) pendant
> `SLOW_GRACE_S` (2 s) → `perfLevel++` (0 → `MAX_PERF_LEVEL` = 2), ce qui coupe halos,
ombres et réduit ennemis/particules. **La dégradation est unidirectionnelle : `perfLevel`
ne redescend jamais dans un run.**

### Input

Routeur unique `onPointer`. **Tactile** : deux joysticks virtuels — moitié gauche de
l'écran = déplacement, moitié droite = visée + tir. Chaque stick suit son propre
`pointerId` (les deux en parallèle). Deadzones : suivi de visée > 6 px, tir > 16 px.
CSS du composant : `touch-action: none` et `overscroll-behavior: none` (**critique** :
sans ça les sticks se battent contre scroll/zoom/pull-to-refresh), + safe-areas encoche.
**Desktop** : WASD/flèches = déplacement, souris = visée, **clic maintenu = spray continu**,
`1-4` = switch d'arme, molette = cycle. Tir continu framerate-indépendant
(`while (cd<=0) { fire(); cd += rate }`).

### Armes (`makeWeapons()`)

Débloquées par paliers de **peinture cumulée**, switch manuel `1-4`.

| Slot | id | Nom | Coût | Cadence | Comportement |
|---|---|---|---|---|---|
| 1 | `spray` | SPRAY CAN | 0 | 0.16 s | 1 projectile droit, dmg 10 |
| 2 | `fan` | FAT CAP | 28 | 0.55 s | éventail 5 gouttes en cône (~28°), dmg 7 |
| 3 | `bomb` | PAINT BOMB | 80 | 0.9 s | bombe lobée, explosion de zone |
| 4 | `aero` | AERO TORCH | 165 | 0.045 s | jet continu courte portée, dmg 4/tick, gros DPS |

### Bombes (le splat signature)

`BOMB_THROW = 330` (distance fixe, direction = visée), `BOMB_RADIUS = 80`, `BOMB_DMG = 40`.
Hop parabolique jusqu'à la cible → `explode()` : dégâts + recul via hash spatial. Dépose un
**splat de peinture permanent** au sol (ring buffer 60, 5-8 blobs) + particules + screen shake.
**Seules les bombes créent des splats permanents** ; un tir direct sur un mur ne fait qu'un `puff`.

### Niveau (`level.ts`)

`CELL = 160`. Génération procédurale par **chunks** (corridor/turn/cross/plaza), rotations
par quarts, assemblage port-à-port avec tirage pondéré anti-répétition. Grille `Uint8Array`
(1=sol/0=vide), colliders (piliers, bancs, mobilier urbain) en buckets par cellule,
**flow field BFS** recalculé ~toutes les 0.35 s pour le pathing. Décor et logos (kit de
marque) bakés dans les tuiles. **Mobilier urbain data-driven** : registre `PROP_DEFS`
dans `level.ts` (benne, barrière, cône, borne, panneaux) + sprites `buildProps()` dans
`sprites.ts` — ajouter un prop = une entrée + un sprite, rien d'autre. **Secteurs à
déverrouiller** : monde ~14 chunks derrière des portes (grille `2` = fermée, barricade
bakée), ouvertes aux paliers `GATE_KILLS` (engine.ts) ; spawns ennemis limités aux
cellules atteignables (`openCells`), anti-leak par BFS au build (cf.
`SPECS_ENVIRONMENT.md`). **Pas de seed** → génération non déterministe.

### État actuel

Moteur mature et complet dans son périmètre, **pas de TODO/placeholder** dans le code.
Fonctionnel : boucle, 4 armes, 5 ennemis (dog/tagger/cop/buffer/drone volant) + élites
après 78 s + scaling temporel, **boss d'arène** (THE BUFF KING à `BOSS_KILLS = 160`,
confiné dans l'arène, slam de zone, barre HP dédiée dans le HUD, jackpot d'orbes à sa
mort — un par run), **récompenses de zone** (cache de peinture au fond de chaque secteur
ouvert, +30/+45/+60), **minimap** (coin haut-droit, layout baké par `Level.getMinimap`,
re-baké seulement à l'ouverture d'une porte ; joueur/caméra/caches/boss par-dessus),
spawn en vagues, flow field, orbes de peinture (aimant),
i-frames + régén, HUD, game over, génération de niveau, 3 difficultés (easy/normal/hard —
`hard` augmente dégâts subis **et** cadence de spawn). Joueur : 130 HP, i-frame 0.45 s,
régén après 3.5 s. Hook DEV : en dev uniquement, `window.__ngs` expose le moteur (câblé
dans `GameCanvas.vue`), getter `debugInfo` complet.

---

## Règles à respecter (invariants — ne pas casser)

1. **L'état du jeu reste hors de Vue.** Ne jamais déplacer positions/ennemis/etc. dans des
   refs réactives. Le HUD par frame s'écrit en DOM direct ; seuls les événements rares
   passent par la réactivité.
2. **Zéro allocation dans le hot path.** Pas de `splice`/`push`/closures par frame ; respecter
   le pattern pooling swap-remove et les tableaux persistants (`sortSlots`, hash).
3. **Ne pas réordonner les passes de `update()` à la légère.** Les dégâts de tirs sont
   appliqués *après* la construction du hash spatial (les morts prennent effet à la frame
   suivante — commentaire explicite). Toucher l'ordre peut casser des index / rater des collisions.
4. **Tuning perf = `quality.ts` uniquement.** Ne pas disséminer de nouveaux réglages perf ailleurs.
5. **Nettoyage propre obligatoire.** Tout listener passe par l'`AbortController` ; `destroy()`
   doit tout couper (rAF, listeners, observer).
6. **Ne pas retirer `touch-action: none` / `overscroll-behavior: none`** du composant.
7. **Commentaires et copy en cohérence** avec l'existant (FR pour le code, néons de marque).

## Zones à risque / dette technique

- **`engine.ts` monolithe (~1564 lignes)** : input, armes, combat, spawn, rendu, HUD, perf
  dans une seule classe. Fort couplage, non testable unitairement. Risque n°1 — tout refactor
  doit être incrémental et vérifié en jeu.
- **Constantes de gameplay magiques disséminées** dans `update`/`spawnEnemy` (rayons `size*0.4`,
  offsets buste `-12`, seuils d'aimant 78/16, courbes de spawn). Contrairement au tuning perf,
  le tuning gameplay **n'est pas centralisé** : rééquilibrer = chasser des littéraux.
- **`perfLevel` ne remonte jamais** dans un run.
- **Pools à capacité fixe, dépassement silencieux** (`if (count >= POOL) return`) : en pic
  (aero + explosions), des tirs/particules sont ignorés sans erreur.
- **Dépendances async** (police `Press Start 2P`, logos SVG) invalident le cache de tuiles →
  possible re-bake complet en pleine partie.
- **Génération de niveau non déterministe** (pas de seed) : non reproductible pour le debug ;
  filet de sécurité qui peut retomber sur un niveau minimal.
- **Couplage moteur↔composant non typé** : `qualityProfile` / `debugInfo` / `__ngs` sont un
  contrat documenté en commentaire, pas en types.

## Journal des modifications (obligatoire)
À CHAQUE modification du code de ce repo, tu DOIS mettre à jour `CHANGELOG.md`
à la racine AVANT de commit. Ajoute une nouvelle entrée EN HAUT du fichier
(ordre antéchronologique) contenant :
- Date (AAAA-MM-JJ) + branche courante
- Résumé en 1-2 phrases de ce qui a été fait et pourquoi
- Fichiers créés / modifiés / supprimés
- Comment tester (commande + ce qu'il faut vérifier)
- Comment annuler (hash du commit de référence ou `git checkout ...`)
- TODO ou limitations connues laissées
Ne réécris jamais une entrée existante : tu ne fais qu'ajouter la nouvelle en haut.
