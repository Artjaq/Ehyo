# SPECS_ENVIRONMENT.md — Enrichissement de l'environnement (v2, moteur custom)

Projet : **NEON GRAFFITI SURVIVOR** (twin-stick survivor mobile-first, moteur Canvas 2D
custom dans Vue 3 — **aucun Phaser**). Cible : `game/engine/level.ts` + `game/engine/engine.ts`.

> **Historique** : la v1 de ce document (voir git, commit `d3269ef`) visait Phaser 3,
> abandonné au pivot de juillet 2026. Le **Scope 1 (décor urbain)** a été implémenté en
> adaptation : registre data-driven `PROP_DEFS` + sprites `buildProps()` (commit `c339538`)
> et arène néon garantie (commit `156c237`). Ce document re-spécifie le **Scope 2** pour
> le moteur custom. Le Scope 1 est clos.

## Objectif du Scope 2 — l'espace s'ouvre avec les kills

Sensation recherchée (inchangée) : roguelite qui escalade — plus le joueur élimine
d'ennemis, plus le monde jouable s'agrandit, et les nouvelles zones sont déjà décorées.

**Décision de design v2 : pas d'expansion réelle → DÉVERROUILLAGE DE SECTEURS.**
Le monde complet est généré au boot (comme aujourd'hui, avec plus de chunks) ; le chemin
est découpé en **secteurs** séparés par des **portes** infranchissables et visibles.
Chaque palier de kills ouvre la porte suivante.

Pourquoi : le moteur dimensionne UNE fois par run la grille (`Uint8Array`), le flow field
(`Int32Array cols×rows`), le hash spatial (`hashHeads`), les `walkCells` et le cache de
tuiles (`tilesX`). Redimensionner le monde en cours de run imposerait des realloc et une
invalidation totale du cache (hitch garanti en pleine partie) — contraire aux invariants.
Le déverrouillage donne la même perception d'expansion pour un coût quasi nul.

## Découpage en secteurs (génération, `level.ts`)

- `tryBuild(targetChunks)` passe de 8 à **~14 chunks**. La chaîne placée est découpée en
  secteurs par ordre de pose : **S0 = cross de départ + arène + 1 chunk** (l'arène reste
  accessible immédiatement, comme en v1), puis **3-4 chunks par secteur** (≈ 3 portes par
  run, selon ce que la génération a réussi à poser).
- **Porte** = le span de cellules du port reliant le dernier chunk d'un secteur au premier
  du suivant (1 cellule de profondeur × largeur du port). Enregistrée pendant l'assemblage
  (dans `attach()`, qui connaît le port ouvert au moment du stamp).
- Encodage grille : nouvelle valeur **`2` = porte fermée** (`0` vide, `1` sol).
  `cellWalkable()` ne retourne `true` que pour `1` → collisions, flow field, `moveCircle`,
  `pushOut` et spawns respectent les portes **sans aucun code nouveau**.
- **Cellules ouvertes** : `Level` maintient `openCells: number[]` = cellules atteignables
  depuis le spawn portes fermées (BFS au build, réutiliser la mécanique de `computeFlow`).
  `randomSpawnPoint()` échantillonne `openCells` (et plus `walkCells`) → aucun ennemi ne
  spawn dans un secteur fermé. À chaque ouverture, BFS incrémental → `openCells` grossit.
- **Validation de continuité (anti-leak)** : deux chunks posés séparément peuvent se
  retrouver adjacents sans port (le chemin qui reboucle) → contournement possible d'une
  porte. Au build, BFS portes fermées : si des cellules d'un secteur N+1 sont déjà
  atteignables, ce secteur est **fusionné** dans le précédent (sa porte s'ouvre d'office).
  Jamais de softlock, comportement toujours défini.

## Ouverture (runtime, `engine.ts` + `level.ts`)

- **Source unique du compteur** : `this.kills`, déjà incrémenté au seul endroit
  `killEnemyAt()`. Le moteur compare `kills` au palier courant dans `update()` (une
  comparaison par frame, zéro alloc) et appelle `level.openNextGate()`.
- `openNextGate()` : cellules `2 → 1`, ajout au `openCells` (BFS incrémental), **éviction
  ciblée** des tuiles touchées (`tileCache.delete` des clés de la porte — PAS
  `invalidateStatic()`, qui re-bakerait tout le monde), retourne la position de la porte
  (pour le feedback) ou `null` s'il n'y a plus de porte.
- **Paliers** : constante `GATE_KILLS = [30, 75, 130]` en tête d'`engine.ts`, à côté des
  autres constantes gameplay (`BOMB_*`, `HIT_IFRAME`…). S'il y a moins de portes que de
  paliers (génération courte, fusion anti-leak), les paliers excédentaires sont ignorés.

## Visuel & feedback (charte)

- **Porte fermée** (bakée dans `renderTile`, zéro coût par frame) : sol de rue normal +
  barricade néon en travers — bandes obliques rouge glitch `#ff004c` / noir (danger,
  cohérent charte), liseré supérieur cyan, texte pixel « CLOSED » (Press Start 2P, comme
  les enseignes). Doit se lire comme un mur temporaire, pas un bug de décor.
- **À l'ouverture** (uniquement via les systèmes existants — pas de nouveau hook Vue) :
  - screen shake court (`this.shake`),
  - burst de particules cyan à la porte (pool existant, borné par le budget du profil),
  - mot flottant « OPEN! » à la porte + « ZONE OUVERTE » au-dessus du joueur
    (pool `FloatTag` existant),
  - **cap visuel** : pendant ~4 s, 3 points pointillés (même style que l'indicateur de
    visée) orientés du joueur vers la porte ouverte — un seul état `{x, y, ttl}` réutilisé,
    zéro alloc.
- Un toast Vue (hook dédié type `unlock`) est **optionnel v2.1**, pas requis.

## Ce qui ne change PAS

- Ordre des passes de `update()`, pooling, hash spatial : intacts.
- La courbe de spawn reste temporelle (pas de difficulté par secteur — hors scope).
- Les drones volants ignorent déjà les murs : ils pourront survoler une porte fermée.
  **Accepté** (thématique) et borné : ils ne *spawnent* que dans l'anneau autour du
  joueur, clampé au monde.
- Décor : les secteurs fermés sont décorés dès le build (Scope 1 tourne sur le monde
  entier) — rien à repeupler à l'ouverture, contrairement à la spec v1.
- Tuning perf : rien de nouveau dans `quality.ts` (les portes sont du décor baké).

## Pièges à éviter

- **Aucun realloc en run** : `grid`, `flow`, `hashHeads`, pools — dimensionnés au build
  sur le monde COMPLET (portes comprises). L'ouverture ne fait que muter des valeurs.
- **Éviction ciblée du cache de tuiles**, jamais `invalidateStatic()` à l'ouverture.
- **`openCells` vs `walkCells`** : les spawns ennemis doivent utiliser `openCells`, sinon
  des ennemis apparaissent coincés derrière les portes (flow field à -1 → figés au mur).
- **Le flow field se recalcule tout seul** (cadence 0.35 s) : ne pas forcer de recalcul
  synchrone à l'ouverture.
- **Anti-leak par BFS** au build (fusion de secteur), sinon une adjacence fortuite entre
  chunks rend une porte contournable et les paliers incohérents.

## Definition of done

- [ ] Monde ~14 chunks découpé en secteurs derrière des portes fermées ; toutes les
      structures allouées une fois au build (zéro realloc en run).
- [ ] Portes visibles (barricade bakée), infranchissables joueur ET ennemis au sol ;
      spawns ennemis limités aux secteurs ouverts.
- [ ] Paliers `GATE_KILLS` déclenchés depuis la source unique `kills` ; changer le tableau
      suffit à changer le rythme.
- [ ] Ouverture : porte → sol, éviction ciblée des tuiles, `openCells` à jour, feedback
      complet (shake + particules + tags + cap visuel) sans nouveau hook Vue.
- [ ] Cas dégénérés sûrs : moins de portes que de paliers, secteur fusionné (anti-leak),
      génération courte (filet de sécurité existant) — jamais de softlock.
- [ ] `npm run build` vert ; fluide desktop, jouable mobile (`?quality=mobile`).

## Hors scope (v2.1+)

- Toast Vue à l'ouverture (nouveau hook moteur→composant typé).
- Difficulté par secteur, nouveaux ennemis, boss d'arène.
- Minimap / boussole permanente.
- Récompense de zone (cache de peinture dans le secteur ouvert) — bonne idée, plus tard.
