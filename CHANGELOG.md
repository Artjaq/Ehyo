# Changelog

Journal des modifications du repo. Nouvelle entrée EN HAUT à chaque changement de code
(ordre antéchronologique) — voir la règle dans `CLAUDE.md`. Ne jamais réécrire une
entrée existante.

---

## 2026-07-10 — branche `game`

**Résumé** : réécriture de `SPECS_ENVIRONMENT.md` (v2) pour le moteur custom — le Scope 2
« expansion de map » (resize de world bounds Phaser, impossible ici sans realloc) devient
un **déverrouillage de secteurs** : monde complet généré au boot (~14 chunks), portes
bakées ouvertes aux paliers de kills. Spec seulement, aucune implémentation.

**Fichiers modifiés**
- `SPECS_ENVIRONMENT.md` — v2 complète (secteurs, portes grille=2, openCells,
  anti-leak BFS, éviction ciblée du cache de tuiles, feedback in-canvas, DoD)

**Comment tester** : n/a (documentation) — relire la spec avant d'implémenter.

**Comment annuler** : `git checkout 156c237 -- SPECS_ENVIRONMENT.md`

**TODO / limitations** : implémentation à faire après validation de la spec ;
toast Vue et récompenses de zone repoussés en v2.1.

---

## 2026-07-10 — branche `feat/arene-neon`

**Résumé** : arène néon v1 — salle spéciale autorée (octogone 12×12 cellules, 1920 px),
posée de façon **garantie** sur le premier port du cross de départ (adjacente au spawn),
avec identité visuelle propre : voile magenta au sol, périmètre néon cyan, anneau magenta
+ logo EHYO géant au centre, tags autorés aux coins, enseigne « NEON ARENA ».

**Fichiers modifiés**
- `game/engine/level.ts` — chunk `ARENA_DEF` (hors CHUNK_LIB, jamais aléatoire) ;
  factorisation `attach()` dans `tryBuild` (même math d'alignement) + placement garanti ;
  `Level.arena` (emprise px) / `arenaLogo` ; helpers `inArena`/`cellInArena` ; exclusion
  du décor aléatoire dans l'arène (tags sol, flaques, piliers, bancs, props) ; décor
  autoré ; identité visuelle bakée dans `renderTile` (voile, lisières cyan, anneau, logo)

**Comment tester** : `npm run build` puis `/game` — l'arène est à un chunk du spawn
(`__ngs.debugInfo.chunks` contient `arena` en 2ᵉ position). Vérifier : salle traversable,
lisible comme lieu à part (sol magenta, bords cyan, anneau + logo géant), pas de mobilier
aléatoire dedans, fluide, OK en `?quality=mobile`. Vérifié via Chrome headless (screenshots).

**Comment annuler** : `git checkout d3269ef -- game/engine/level.ts` (ou drop de la branche).

**TODO / limitations** : renforcement CRT/glitch à l'entrée non fait (optionnel v1,
demanderait un hook moteur→composant) ; gameplay spécial (déclencheur, boss) hors
périmètre v1 ; l'enseigne nord est sautée si un chunk ultérieur a creusé au-dessus (rare).

---

## 2026-07-10 — branche `game`

**Résumé** : ajout de `SPECS_ENVIRONMENT.md` au repo (trace de la spec d'origine).
Attention : rédigée pour Phaser (avant le pivot moteur custom) — le Scope 1 a été
implémenté en adaptation (voir entrée précédente), le Scope 2 est à re-spécifier.

**Fichiers créés**
- `SPECS_ENVIRONMENT.md` — spec décor + expansion de map, versionnée telle quelle

**Comment tester** : n/a (documentation).

**Comment annuler** : `git rm SPECS_ENVIRONMENT.md`

**TODO / limitations** : réécrire la spec pour le moteur custom avant d'attaquer le
Scope 2 (expansion par déverrouillage de chunks plutôt que resize de world bounds).

---

## 2026-07-10 — branche `game`

**Résumé** : mobilier urbain data-driven (Scope 1 de `SPECS_ENVIRONMENT.md`, adapté au
moteur custom — la spec visait Phaser, retiré au pivot) : benne, barrière, cône, borne
incendie, panneaux STOP/ONE WAY, avec collision et tri en profondeur.

**Fichiers modifiés**
- `game/engine/sprites.ts` — `buildProps()` : 6 sprites pixel-art bakés par code
- `game/engine/level.ts` — registre `PROP_DEFS` (zone, budget, espacement, colliders),
  type `PropInst`, tableau `Level.props`, passe de placement dans `generateDecor()`
  (shuffle + budget × densité du profil, évitement spawn/obstacles, colliders poussés
  dans `obstacles` avant `buildObstacleBuckets`)
- `game/engine/engine.ts` — bake `propSpr`, insertion des props dans le tri `sortSlots`
  (kind 4), `drawProp()` (ombre + sprite, pas de halo), `SORT_CAP` 40 → 80 de marge
- `CLAUDE.md` — section Niveau mise à jour (registre PROP_DEFS)

**Comment tester** : `npm run build` puis partie sur `/game` — vérifier : props visibles
en rue et contre les façades, joueur/ennemis bloqués dessus (pushOut), joueur passe
devant/derrière correctement (tri y), rien sur le spawn, densité réduite sur mobile
(`?quality=mobile`).

**Comment annuler** : `git checkout 6e96d59 -- game/ CLAUDE.md`

**TODO / limitations** : Scope 2 (expansion de map par kills) NON implémenté — la spec
Phaser est incompatible avec le monde fixe par chunks, à re-spécifier avant chantier.
Placement aléatoire non seedé (comme le reste de la génération).

---

## 2026-07-10 — branche `game`

**Résumé** : code-split de Three.js/TresJS — la route `/shop` devient lazy dans le
router, ce qui sort la 3D du chunk initial (1 081 kB → 128 kB, 309 → 47 kB gzippé).
Mise à jour de la base Browserslist (caniuse-lite) au passage.

**Fichiers modifiés**
- `router/index.ts` — `/shop` en `component: () => import(...)` (comme `/shop/:slug`,
  `/about`, `/game`) ; import statique de `ShopPage` retiré
- `package-lock.json` — `npx update-browserslist-db@latest` (aucun changement de cibles)

**Comment tester** : `npm run build` → le chunk `index-*.js` doit faire ~128 kB et un
chunk `products-*.js` (~950 kB, Three.js) doit apparaître. En dev : naviguer `/home` →
`/shop` → `/shop/:slug`, la 3D doit se charger normalement à l'arrivée sur le shop.

**Comment annuler** : `git revert` du commit correspondant.

**TODO / limitations** : l'avertissement Vite « chunk > 500 kB » subsiste pour
`products-*.js` — c'est Three.js lui-même, chargé seulement sur le shop ; pas d'action
prévue. Brève latence possible à la première navigation vers `/shop` (fetch du chunk).

---

## 2026-07-10 — branche `game`

**Résumé** : renommage des assets logo `chyo-*` → `ehyo-*` pour aligner le kit d'assets
sur la marque EHYO (suite de la correction EYHO → EHYO).

**Fichiers renommés**
- `assets/picture/chyo-blanc.svg` → `ehyo-blanc.svg`
- `assets/picture/chyo-noir.svg` → `ehyo-noir.svg`
- `assets/picture/chyo-transparent.svg` → `ehyo-transparent.svg`

**Fichiers modifiés**
- `views/Intro.vue`, `views/HomeMenu.vue`, `views/ShopPage.vue`,
  `views/ProductDetailPage.vue`, `views/AboutPage.vue`, `views/ContactPage.vue`
  — import `@/assets/picture/chyo-blanc.svg` → `ehyo-blanc.svg`

**Comment tester** : `npm run build` puis vérifier que le logo s'affiche sur `/`,
`/home`, `/shop`, `/about`, `/contact` ; `grep -ri chyo views/ assets/` ne doit rien
retourner.

**Comment annuler** : `git revert` du commit correspondant (les renommages sont suivis
par git, le revert restaure noms et imports).

**TODO / limitations** : `ehyo-noir.svg` et `ehyo-transparent.svg` ne sont référencés
nulle part dans le code (assets dormants, conservés pour le kit de marque).

---

## 2026-07-10 — branche `game`

**Résumé** : correction de la marque résiduelle `EYHO` → `EHYO` (cohérence avec le reste
du site et le domaine ehyo.ch).

**Fichiers modifiés**
- `views/HomeMenu.vue` — footer « © 2025 EYHO » → « © 2025 EHYO »
- `package.json` — `name: "eyho-vue"` → `"ehyo-vue"`
- `package-lock.json` — champs `name` alignés sur le nouveau nom de package

**Comment tester** : `npm run build` (typecheck + build), puis `npm run dev` et vérifier
le footer de `/home` (© 2025 EHYO). `grep -ri eyho package.json views/` ne doit rien retourner.

**Comment annuler** : `git checkout 7240570 -- views/HomeMenu.vue package.json package-lock.json`

**TODO / limitations** : le dossier local du repo s'appelle toujours `eyho-vue` (chemin
disque, hors périmètre git) ; le nom du repo GitHub reste `Artjaq/Ehyo`.

---

## 2026-07-10 — branche `chore/changelog-convention`

**Résumé** : mise en place de la convention de journal de modifications (ce fichier)
et de la règle correspondante dans `CLAUDE.md`. Le commit embarque aussi les deux
documents projet fraîchement rédigés (guide agent + charte graphique), présents dans
le working tree au moment de la mise en place.

**Fichiers créés**
- `CHANGELOG.md` — ce journal, avec sa première entrée
- `CLAUDE.md` — guide projet pour les agents (stack, structure, doc moteur du jeu,
  invariants perf) + section « Journal des modifications (obligatoire) »
- `CHARTE-GRAPHIQUE.md` — charte graphique (tokens shadcn/oklch + couche néon)

**Comment tester** : `cat CLAUDE.md CHANGELOG.md CHARTE-GRAPHIQUE.md` — vérifier que
la section « Journal des modifications (obligatoire) » est bien présente dans
`CLAUDE.md`. Aucun code exécutable touché (docs uniquement), rien à builder.

**Comment annuler** : supprimer la branche —
`git checkout game && git branch -D chore/changelog-convention`

**TODO / limitations** : convention non rétroactive — l'historique antérieur à cette
date n'est pas documenté ici (se référer à `git log`).
