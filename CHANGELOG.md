# Changelog

Journal des modifications du repo. Nouvelle entrée EN HAUT à chaque changement de code
(ordre antéchronologique) — voir la règle dans `CLAUDE.md`. Ne jamais réécrire une
entrée existante.

---

## 2026-07-11 — branche `feat/balance-spawn-bombe` (2ᵉ passe)

**Résumé** : retours de jeu (« encore trop d'ennemis, on n'arrive pas à se déplacer ni
où aller, pas assez puissant, gameplay à accélérer ») — grosse passe de power-fantasy :
1) Encore moins d'ennemis : intervalle 3.0 s → plancher 0.8 s (pente 0.010), vagues +1
toutes les 60 s (desktop) / 75 s (mobile), plafonds 140/60, PV ennemis scalés ×0.008/s
(au lieu de 0.010). 2) Joueur agressif : vitesse 158 → 185, spray 0.13 s/14 dmg (dps
+73 %), marker 0.24 s/12 dmg/pierce 5 (coût énergie 3 → 2), bombe 55 dmg + flaque 30
dps (coût 20 → 15), aero 5 dmg — et **recul sur chaque tir touché** (`SHOT_KB` 12 px,
5 px aero, boss insensible, borné par les murs) : le feu ouvre des couloirs dans la
meute. 3) Rythme accéléré : aimant de ramassage 78 → 110 px (vitesse 340), régén 3 s /
9 HP/s, paliers de portes [25, 60, 100], boss à 130 kills. 4) « Où aller » : les
pointillés pointent en continu (pulse 2 s) vers le cache non ramassé le plus proche
quand aucun hint de porte/boss n'est actif.

**Fichiers modifiés**
- `game/engine/engine.ts` — constantes armes/joueur/spawn/portes/boss, recul dans la
  passe de collision des tirs, cap permanent vers le cache (ré-armé par frame, zéro alloc)
- `game/engine/quality.ts` — `maxEnemies` 60/140, `batchPeriod` 75/60
- `CLAUDE.md` — table d'armes, bombes, profils, état joueur/boss

**Comment tester** : `npm run build` puis `/game` — le joueur court plus vite que tout
sauf les chiens, le spray repousse visiblement la meute, la pression reste lisible
après 2 min, les pointillés guident vers le cache. Vérifié headless : recul 72 px sur
6 tirs (12 px/tir), dégâts 6×14, cap pointé pile sur le cache après expiration du hint
de porte, densité à 2 min passives = cap (60 mobile) avec un rythme de spawn (~0.4-1/s)
très inférieur à la capacité de kill (~2.5/s au spray).

**Comment annuler** : `git checkout 6c1b0b3 -- game/engine/engine.ts game/engine/quality.ts CLAUDE.md`

**TODO / limitations** : gros batch de tuning à re-ressentir en une session complète
(early/mid/boss) ; le cap cache pulse toutes les 2 s (fondu du ttl ré-armé — assumé) ;
avec moins de kills/min, vérifier que la boucle d'énergie (drops buffer/drone) ne
devient pas trop rare.

---

## 2026-07-11 — branche `feat/balance-spawn-bombe`

**Résumé** : retours de jeu — 1) moins d'ennemis : plancher d'intervalle de spawn
0.45 → 0.6 s, pente 0.013 → 0.012, vagues qui grossissent plus lentement
(`batchPeriod` 34 → 44 desktop, 40 → 52 mobile), plafonds 220 → 180 / 80 → 70.
2) PAINT BOMB en **ciblage automatique courte portée** : à chaque tir elle tombe sur
l'ennemi le plus proche dans un rayon de 300 px (`BOMB_MAX_THROW` 520 → 300, sert de
rayon d'acquisition) — les ennemis étant vite au contact, viser la distance à la main
était pénible. Sans cible à portée : repli sur la visée manuelle (direction + aimReach,
bornes 130..300).

**Fichiers modifiés**
- `game/engine/engine.ts` — courbe d'intervalle ; `fireWeapon` case bombe : acquisition
  auto (balayage linéaire du pool, ~1 tir/s) + repli manuel
- `game/engine/quality.ts` — `maxEnemies` 70/180, `batchPeriod` 52/44
- `CLAUDE.md` — table d'armes, section Bombes, table des profils

**Comment tester** : `npm run build` puis `/game` — la pression doit monter nettement
plus doucement après 1 min 30 ; à la bombe (touche 3), tirer SANS viser un ennemi
proche : elle tombe dessus toute seule ; sans ennemi à ~300 px, elle part dans la
direction visée. Vérifié headless : visée à l'opposé + ennemi à 200 px → bombe pile
sur l'ennemi (<2 px) ; ennemi à 400 px → repli (0, −300) ; profils 70/180 et 52/44
actifs ; build 0 erreur.

**Comment annuler** : `git checkout 8eb4bab -- game/engine/engine.ts game/engine/quality.ts CLAUDE.md`

**TODO / limitations** : la bombe ne cible pas à travers la logique de ligne de vue
(elle peut lober par-dessus un mur vers un ennemi proche — assumé, c'est une lobée) ;
intensité des vagues à re-ressentir en vraie partie, surtout autour du boss (160 kills
plus longs à atteindre avec moins d'ennemis).

---

## 2026-07-10 — branche `feat/energy-gauge`

**Résumé** : jauge d'énergie partagée (`ENERGY_MAX = 100`, pas de régén passive)
consommée par les armes lourdes à chaque tir (marker 3, bombe 20, aero 1 — spray
jamais), rechargée uniquement par des pickups amber (+25) lâchés par les ennemis
« porteurs » (buffer, drone). À sec, l'arme lourde ne tire plus (cd clampé à 0 :
pas de rafale de rattrapage au refill) ; le spray reste toujours disponible.

**Fichiers modifiés**
- `game/engine/engine.ts` — `WeaponDef.heavy/ammo`, `energy` + reset, garde dans la
  boucle de tir, `AmmoEnt` poolé (`POOL_AMMO = 40`, pré-alloc/reset/swap-remove),
  drop dans `killEnemyAt` (buffer/drone), passe de collecte après les orbes (dérive/
  aimant/ramassage, clamp `ENERGY_MAX`), rendu pickups amber, liseré amber « porteur »
  dans `drawEnemy` (coupé si halos off), `HudState.energyPct`
- `game/GameCanvas.vue` — barre ENERGY amber sous la barre HP (ref `energyFill`,
  DOM direct dans `onHud`)

**Comment tester** : `npm run build` puis `/game` — au MARKER maintenu, la jauge fond
(3/tir) puis le tir s'arrête à sec (le spray continue de tirer) ; tuer un buffer/drone
(cerclés d'amber) lâche un pickup ambre aimanté → +25. Vérifié headless : 100 → 33 tirs
→ reste 1 → 0 tir à sec, spray OK à sec, drop → 26, clamp 90+25 → 100, barre DOM synchro.

**Comment annuler** : `git checkout c56871e -- game/engine/engine.ts game/GameCanvas.vue`

**TODO / limitations** : équilibrage volontairement non traité (coûts/drops/quantités
à ressentir en jeu) ; pas d'indicateur « à sec » sur les slots d'armes (piste UI).

---

## 2026-07-10 — branche `feat/weapons-rework`

**Résumé** : refonte des armes 2 et 3 pour leur donner un vrai rôle. Slot 2 : FAT CAP
(éventail) → **MARKER**, trait perçant rapide (dmg 8, cadence 0.30 s) qui traverse
jusqu'à 4 ennemis alignés (`pierce`, anti double-frappe via `lastHit`). Slot 3 : la
PAINT BOMB perd sa distance FIXE — le jet est **contrôlé par la visée** (`p.aimReach`
0..1 : amplitude du stick / distance du curseur, bornes 130..520 ; à la souris la bombe
tombe sous le curseur) et l'explosion dépose une **flaque corrosive** (r 70, 22 dégâts/s,
3.5 s — pool 10, passe dédiée lisant le hash spatial, placée avec les bombes).

**Fichiers modifiés**
- `game/engine/engine.ts` — `WeaponKind`/`makeWeapons` (marker), `ShotEnt.pierce/lastHit`,
  `PuddleEnt` + pool, `resolveAim` (aimReach), `fireWeapon` (marker + throwDist), passe
  flaques dans `update()` (post-hash), flaque dans `explode()` (si dmg > 0 : pas sur le
  splat de mort du boss), rendus marker (trait) + flaque (disque + liseré pulsé coupé en
  perf bas), `debugInfo.puddles/aimReach`
- `CLAUDE.md` — table d'armes + section Bombes à jour

**Comment tester** : `npm run build` puis `/game` — débloquer le MARKER (28 paint,
touche 2) : le trait ambre traverse une file d'ennemis (4 max). Bombe (touche 3) :
curseur proche = jet court, loin = long (clamp 130/520) ; au stick, l'amplitude module.
La flaque magenta blesse ~22/s pendant 3.5 s. Vérifié headless : pierce [8,8,8,8,0],
jets souris 150/400/520/130, stick 325/520, DoT 22/s, expiration, témoin hors zone
intact, rendu perf bas OK, 0 erreur console.

**Comment annuler** : `git checkout 8b8f04b -- game/engine/engine.ts CLAUDE.md`

**TODO / limitations** : valeurs de départ à ressentir en jeu (dmg/cadence marker,
dps/ttl flaque, bornes de jet). Le `lastHit` ne mémorise qu'un ennemi : en tas très
dense, un aller-retour A-B-A peut re-toucher A (rare, borné par le budget pierce).

---

## 2026-07-10 — branche `feat/minimap`

**Résumé** : minimap en coin haut-droit du canvas — layout du monde baké dans un
offscreen (`Level.getMinimap`) et re-baké UNIQUEMENT à l'ouverture d'une porte ; par
frame le moteur ne paie qu'un `drawImage` + quelques points (joueur, rect caméra,
caches clignotants, boss). Secteurs fermés assombris (teasing), portes en rouge glitch,
arène teintée magenta. Aucun nouvel élément DOM ni hook — tout sur le canvas principal.

**Fichiers modifiés**
- `game/engine/level.ts` — `getMinimap(maxPx)` (canvas caché + `miniDirty` posé par
  `openGate`), couleurs par état de cellule (ouvert/fermé/porte/arène)
- `game/engine/engine.ts` — `drawMinimap()` appelé en espace écran après le
  `ctx.restore()` (état `playing` uniquement) : fond/bordure charte, blit du layout,
  rect caméra, points caches (magenta clignotant), boss (rouge clignotant), joueur
  (néon + blanc) ; taille adaptative `min(150, max(96, vw×0.16))`

**Comment tester** : `npm run build` puis `/game` — minimap sous le bouton MENU :
secteurs fermés sombres, portes rouges ; ouvrir une porte (`__ngs.kills = 30`) → la
zone s'éclaire et un point magenta clignote sur le cache ; boss → point rouge.
Vérifié headless desktop + mobile (`?quality=mobile`) : frameMs ~16.7, perfLevel 0.

**Comment annuler** : `git checkout 2e234b5 -- game/engine/level.ts game/engine/engine.ts CLAUDE.md SPECS_ENVIRONMENT.md`

**TODO / limitations** : pas de points ennemis (bruit + coût, volontaire) ; la minimap
révèle la silhouette des secteurs fermés (choix assumé : teasing d'exploration).

---

## 2026-07-10 — branche `feat/cache-zone`

**Résumé** : récompense de zone — à chaque porte ouverte en jeu, un PAINT CACHE
(palette de bombes néon, halo magenta pulsé) est posé **au fond du nouveau secteur**
(queue du BFS d'atteignabilité = cellules les plus profondes). Ramassage au contact :
+30/+45/+60 peinture selon le secteur. Le toast de zone affiche « PAINT CACHE AHEAD ».

**Fichiers modifiés**
- `game/engine/level.ts` — type `Cache`, tableau `Level.caches`, placement dans
  `openGate(g, withCache)` (cellule profonde dégagée des obstacles, 8 tentatives ;
  pas de cache pour les fusions anti-leak du build), retour enrichi d'`openNextGate`
- `game/engine/engine.ts` — `ZoneInfo.cache`, passe de ramassage au contact (3 max,
  zéro alloc), rendu sprite + halo pulsé (affiché même en profil bas : c'est un
  objectif), `debugInfo.cachesLeft`
- `game/engine/sprites.ts` — sprite `cache` dans `buildProps` (palette + 3 bombes néon)
- `game/GameCanvas.vue` — toast : « PAINT CACHE AHEAD » quand un cache existe
- `CLAUDE.md`, `SPECS_ENVIRONMENT.md` — état à jour (récompense + boss marqués faits)

**Comment tester** : `npm run build` puis `/game`, 30 kills (`__ngs.kills = 30`) →
toast « PAINT CACHE AHEAD », explorer le secteur ouvert jusqu'au cache lumineux,
marcher dessus → « +30 PAINT ». Vérifié headless : cache sur sol jouable au fond du
secteur, ramassage 0→30 peinture, `cachesLeft` correct, cohabitation des toasts
arme+zone sans chevauchement.

**Comment annuler** : `git checkout bc6c6d0 -- game/ CLAUDE.md SPECS_ENVIRONMENT.md`

**TODO / limitations** : pas de cache si la porte est fusionnée au build (anti-leak,
voulu) ou si aucune cellule dégagée en 8 tirages (rare) — le toast dit alors
« FOLLOW THE DOTS ». Montants 30/45/60 à ajuster au ressenti.

---

## 2026-07-10 — branche `game`

**Résumé** : équilibrage — début de partie adouci : intervalle de spawn initial 1.75 s
→ 2.3 s, pente 0.011 → 0.013 (≈ 30-40 % d'ennemis en moins les 2 premières minutes ;
les courbes se rejoignent vers 2 min 20, plancher 0.45 s inchangé).

**Fichiers modifiés**
- `game/engine/engine.ts` — courbe d'intervalle de spawn dans `update()`

**Comment tester** : `npm run build` puis `/game` — la première minute doit laisser le
temps de ramasser la peinture et débloquer le FAT CAP avant d'être submergé.

**Comment annuler** : restaurer `1.75 - this.time * 0.011` dans la ligne `interval`.

**TODO / limitations** : tuning au ressenti — à affiner après retours en vraie partie.

---

## 2026-07-10 — branche `feat/boss-arene`

**Résumé** : boss d'arène — THE BUFF KING, nettoyeur géant couronné (accent magenta de
l'arène). Apparaît une fois par run à `BOSS_KILLS = 160` (après la dernière porte),
confiné dans l'arène (poursuite en ligne droite, retour au centre si le joueur fuit),
slam de zone périodique, barre de HP dédiée dans le HUD, jackpot d'orbes + splat géant
à sa mort. Vit dans le pool d'ennemis existant → tirs/explosions/contact gratuits.

**Fichiers modifiés**
- `game/engine/sprites.ts` — sprite `boss` (18×16, couronne ambre, armure magenta)
- `game/engine/engine.ts` — type `'boss'` + entrée `ENEMY_DEFS` (poids 0, jamais au
  hasard) ; constantes `BOSS_KILLS/BOSS_SLAM_*` ; `spawnBoss()` (centre arène, décalé si
  joueur dessus, cap pointillé réutilisé) ; branche boss dans la passe ennemis
  (confinement + slam, i-frames respectées) ; mort spéciale dans `killEnemyAt`
  (explode 0 dégât = splat + recul, 8 orbes, « BOSS DOWN ») ; `HudState.bossPct`
  (-1 = masqué) ; `bossRef` stable (le swap-remove déplace les index, pas les objets) ;
  `debugInfo.boss`
- `game/GameCanvas.vue` — barre de HP boss (label + jauge magenta) écrite en DOM direct
- `CLAUDE.md` — état actuel (boss)

**Comment tester** : `npm run build` puis `/game`, atteindre 160 kills (ou
`__ngs.kills = 160`) → « BOSS IN THE ARENA », cap vers l'arène, barre THE BUFF KING ;
au corps-à-corps : contact + SLAM toutes les 3.2 s ; fuir l'arène → le boss y reste ;
le tuer → splat géant, 8 orbes, barre masquée. Vérifié headless (screenshots + mesures :
130→100 HP en 4 s au contact, confinement OK, 9 orbes à la mort).

**Comment annuler** : `git checkout 069e702 -- game/engine/engine.ts game/engine/sprites.ts game/GameCanvas.vue CLAUDE.md`

**TODO / limitations** : un seul boss par run (pas de re-pop) ; en test forcé
(kills 0→160 d'un coup) les mots flottants porte+boss se chevauchent une seconde —
impossible en partie réelle (paliers espacés de 30+ kills). Équilibrage : HP 1500 × dm,
slam 16 × dm — à ajuster en vraie partie si besoin.

---

## 2026-07-10 — branche `feat/zone-toast`

**Résumé** : v2.1 des secteurs — toast Vue « ZONE OPEN x/y » à l'ouverture d'une porte,
via un nouveau hook typé `zone(info)` dans `EngineHooks` (événement rare → réactivité
légitime). Harmonisation du copy : le mot flottant « ZONE OUVERTE » devient « ZONE OPEN »
(tout le copy du jeu est en anglais).

**Fichiers modifiés**
- `game/engine/engine.ts` — interface `ZoneInfo { opened, total }` (en secteurs, S0
  inclus), hook `zone()` dans `EngineHooks`, émission à l'ouverture d'une porte,
  mot flottant en anglais
- `game/GameCanvas.vue` — handler `onZone` + `zoneToast` (shallowRef) + timer dédié
  (2,6 s, nettoyé au démontage), toast cyan `.ngs-toast-zone` positionné sous le toast
  d'arme (les deux peuvent tomber en même temps)

**Comment tester** : `npm run build` puis `/game`, atteindre 30 kills (ou
`__ngs.kills = 30` en dev) → toast « ZONE OPEN 2/4 · FOLLOW THE DOTS » 2,6 s sous la
barre HUD, en plus du feedback in-canvas. Vérifié headless (screenshot + disparition).

**Comment annuler** : `git checkout 4e7694c -- game/engine/engine.ts game/GameCanvas.vue`

**TODO / limitations** : aucun.

---

## 2026-07-10 — branche `feat/secteurs`

**Résumé** : Scope 2 v2 — secteurs à déverrouiller. Le monde passe à ~14 chunks découpés
en 4 secteurs par 3 portes fermées (barricades néon bakées) ; chaque palier de kills
(`GATE_KILLS = [30, 75, 130]`) ouvre la porte suivante avec feedback in-canvas. Zéro
realloc en run : le monde complet est dimensionné au boot, l'ouverture mute la grille.

**Fichiers modifiés**
- `game/engine/level.ts` — enregistrement des portes dans `tryBuild`/`attach` (spans de
  ports aux indices `GATE_AT = [3,6,9]`) ; grille `2` = porte fermée (bloque collisions,
  flow field et spawns sans code nouveau) ; `openCells`/`openMask` + `floodOpen` (BFS,
  réutilise `flowQueue`) ; anti-leak au build (porte contournée = fusionnée/ouverte) ;
  `openGate` avec éviction CIBLÉE du cache de tuiles ; `openNextGate()` public ;
  `randomSpawnPoint` échantillonne `openCells` ; rendu barricade dans `renderTile`
  (`drawGateCell` : rayures glitch/noir, liseré cyan, plaque CLOSED) ; génération 8→12
  chunks cibles
- `game/engine/engine.ts` — `GATE_KILLS`/`GATE_HINT_TTL` ; vérification du palier dans
  `update()` (une comparaison/frame) ; feedback : shake + burst de particules cyan +
  mots flottants (« OPEN! », « ZONE OUVERTE ») + cap pointillé 4 s vers la porte
  (scratch réutilisé, zéro alloc) ; `spawnWord()` factorisé depuis `spawnTag` ;
  `debugInfo` expose `gatesOpen`/`gatesTotal`/`gateTier`
- `CLAUDE.md` — section Niveau (secteurs/portes)

**Comment tester** : `npm run build` puis `/game` — au départ ~1/3 du monde accessible,
barricades visibles en bout de rue ; à 30/75/130 kills : shake, « ZONE OUVERTE », cap
pointillé, barricade disparue et zone franchissable. Debug : `__ngs.debugInfo.gatesOpen`
et `__ngs.kills = 30` pour forcer. Vérifié headless : 3 portes, blocage effectif,
ouverture aux paliers, openCells 212→620, ennemis au sol jamais derrière une porte.

**Comment annuler** : `git checkout 77aed1d -- game/engine/level.ts game/engine/engine.ts CLAUDE.md`

**TODO / limitations** : toast Vue à l'ouverture (v2.1, demanderait un nouveau hook) ;
les drones survolent les portes (accepté, thématique) ; paliers excédentaires ignorés
si la génération produit moins de 3 portes.

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
