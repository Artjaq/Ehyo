# Brief — Survivor-like "street" (proto Phaser 3 + Vue)

## Objectif
Proto **jouable rapidement** d'un shooter survivor-like intégré dans un site Vue.
Priorité au feeling mobile + desktop avant le style final. On vise le cœur jouable
d'abord, on habille après.

## Stack & conventions
- **Moteur** : Phaser 3 (`npm install phaser`)
- **Intégration** : composant Vue unique
- **Conventions de code** : commentaires en **français**, variables et fonctions en
  **anglais**, code prêt pour `git push`

## Principe de jeu
Survivor-like : le joueur ne contrôle **que le déplacement**. Le tir est **automatique**
sur l'ennemi le plus proche. Les ennemis affluent en vagues. But : survivre, compteur de kills.
C'est le tir auto qui rend le jeu jouable au doigt sur mobile — point central du design.

## Contrôles (abstraction unique)
Les deux entrées alimentent un seul `moveVector {x, y}` normalisé, que le player consomme :
- **Desktop** : WASD + flèches (Phaser keyboard)
- **Mobile** : joystick virtuel tactile en zone bas-gauche, codé à la main avec les
  pointer events (pas de plugin pour le proto, on garde les dépendances minimales)
- **Tir** : 100 % auto, aucune action requise du joueur

## Architecture Phaser
**Scenes**
- `BootScene` : génère les textures par code (voir *Sprites*), puis lance `GameScene`
- `GameScene` : boucle de jeu

**Systèmes**
1. **Player** — sprite + corps physique arcade, vélocité pilotée par `moveVector`
2. **Auto-fire** — timer ; à chaque tick : trouver l'ennemi le plus proche, calculer
   l'angle vers lui, spawn un projectile dans cette direction (si aucun ennemi, ne tire pas)
3. **Enemies** — groupe physique, spawn hors écran, se dirigent vers le player chaque frame
4. **Projectiles** — groupe physique avec pooling ; overlap ennemi → dégâts + recycle
5. **Weapons** — plusieurs styles de tir (voir plus bas)
6. **Waves** — spawn croissant dans le temps
7. **Score** — compteur de kills

## Styles de tir (le "plusieurs styles")
Système d'armes simple, chaque arme = `{ fireRate, spawnLogic }` :
- **Spray** (défaut) : projectiles rapides unitaires sur le plus proche
- **Bombe de peinture** : projectile lobé ; à l'impact → splat qui s'étend et inflige
  des dégâts en **zone (AoE)**. C'est l'arme signature "street"
- *(optionnel proto)* **Spread** : 3 projectiles en cône

**Pour le proto** : Spray + Bombe de peinture actives. Les autres armes = plus tard.

## Sprites — génération par code
Claude Code ne dessine pas comme un artiste, mais génère les sprites **par code**.
Pour le proto, **pixel art programmatique** :
- Définir des palettes + grilles de pixels, rendre vers des textures Phaser
  (Graphics / RenderTexture, ou générer un canvas puis en faire une texture)
- Rendu rétro qui colle au style rue 90s, **zéro asset externe**
- Sprites proto : player (silhouette style tagueur), 1–2 types d'ennemis, projectile
  spray, bombe + splat de peinture

Plus tard pour le vrai jeu : packs gratuits (Kenney, itch.io, OpenGameArt) ou sprites custom.

## Style "street" (proto : UNE arène d'abord)
- Commencer par **une seule arène** : **quai de métro avec tags** (lisible et stylé).
  Toits + ruelles = variantes à ajouter après le proto.
- Fond : béton / asphalte sombre, marquages au sol, tags = texte/formes colorées sur les murs
- Palette : gris urbains + accents néon (magenta, cyan, jaune, lime) pour la peinture

## Intégration Vue (NON négociable)
- Composant unique `<GameCanvas>`
- `onMounted` : `new Phaser.Game(...)` monté sur un `div` ref
- `onBeforeUnmount` : `game.destroy(true)` (sinon fuite mémoire)
- **L'état du jeu** (positions, vie, ennemis, projectiles) vit dans Phaser, **jamais**
  dans des `ref` / `reactive` Vue — sinon re-render à 60 fps et perfs mortes
- **Communication par events** : la scène Phaser émet (`kill`, `playerDied`, `score`) →
  Vue écoute pour afficher le HUD ; Vue → Phaser (`pause`, `restart`) par le même canal.
  Un émetteur partagé (EventEmitter de Phaser ou une instance `mitt`)
- **Responsive** : Scale Manager (`Scale.FIT` ou `Scale.RESIZE`), gérer le resize pour
  couvrir mobile + desktop

## Perfs
- Pooling des projectiles + ennemis (groupes Phaser `get` / recycle)
- État de jeu hors de la réactivité Vue
- Plafonner le nombre d'entités actives

## Découpage par phases
- **Phase 1 (cœur du proto)** : déplacement (joystick + clavier) + tir auto + 1 type
  d'ennemi + vagues simples + compteur de kills → jouable, testable sur téléphone
- **Phase 2** : bombes de peinture (AoE) + 2ᵉ style de tir + HUD Vue via events
- **Phase 3** : style street (arène métro + tags + palette néon)
- **Phase 4** : difficulté progressive + écran game over (avec restart)

**Proto = Phases 1–2.** Le reste s'enchaîne ensuite.
