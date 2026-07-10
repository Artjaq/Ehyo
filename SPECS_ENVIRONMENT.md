# SPECS_ENVIRONMENT.md — Enrichissement de l'environnement

Projet : **Neon Graffiti** (street shooter mobile-first, Phaser 3 dans Vue.js)
Cible : la scène de jeu principale (`GameScene.js` ou équivalent).

## Objectif

Ajouter deux systèmes complémentaires à l'environnement :

1. **Décor urbain** — tags, panneaux de rue et mobilier urbain posés dans le monde pour l'ambiance graffiti.
2. **Expansion progressive de la map** — le monde s'agrandit à mesure que le joueur élimine des ennemis, en réutilisant le système de décor pour peupler les nouvelles zones.

## Décisions par défaut (à ajuster si besoin)

- **Expansion par paliers** : 30 → 60 → 90 → 120 kills (roguelite qui escalade), et pas une seule fois.
- **Direction** : la map grandit **autour** de la zone de jeu (extension symétrique), pas dans une seule direction.

Ces deux choix vivent dans `ENV_CONFIG` ci-dessous : changer `expansionThresholds` et `expansionMode` suffit à basculer de comportement.

## Conventions (rappel projet)

- Commentaires en **français**, noms de variables/fonctions en **anglais**.
- Code **production-ready**, pas de placeholder laissé en l'état.
- Phaser 3, respect du cycle `preload()` / `create()` / `update()`.
- Prompts scopés : implémenter Scope 1 **puis** Scope 2, pas les deux d'un bloc si un doute subsiste.

## CONFIG partagée (constantes en haut de scène)

```js
const ENV_CONFIG = {
  // --- Décor ---
  decorDensity: 0.00008,      // décos par pixel² de zone à peupler
  clearRadius: 80,            // rayon mini (px) à préserver autour des points sensibles
  placementRetries: 12,       // essais avant d'abandonner un placement
  scaleRange: [0.7, 1.15],    // variation d'échelle aléatoire
  tintChance: 0.35,           // proba d'appliquer une teinte néon à un tag

  // --- Expansion ---
  worldStart:   { width: 1600, height: 1200 }, // taille initiale du monde
  expansionThresholds: [30, 60, 90, 120],      // paliers de kills
  expansionMode: 'around',                     // 'around' | 'right' | 'up' | 'down' | 'left'
  expansionStep: { width: 800, height: 800 },  // agrandissement par palier
};
```

---

## Scope 1 — Système de décor (tags & mobilier urbain)

### Comportement attendu

- Le décor est **data-driven** : une liste de définitions, pas des `add.image()` codés en dur.
- Chaque zone rectangulaire à peupler reçoit un nombre de décos calculé depuis `decorDensity × aire`.
- Variation aléatoire par instance : échelle (`scaleRange`), rotation, `flipX`, teinte optionnelle (`tint`) pour les tags.
- Les placements évitent les **points sensibles** (spawn joueur, spawns ennemis, décos déjà posées) via `clearRadius` + `placementRetries`.

### Structure de données

Un registre de définitions, chacune décrivant un type de déco :

```js
// category : 'tag' (au sol) | 'prop' (mobilier, potentiellement bloquant)
// collidable : true => corps physique statique + collision joueur/ennemis
{ key: 'tag_arrow',   category: 'tag',  collidable: false, tintable: true  },
{ key: 'sign_stop',   category: 'prop', collidable: true,  tintable: false },
{ key: 'dumpster',    category: 'prop', collidable: true,  tintable: false },
{ key: 'tag_throwup', category: 'tag',  collidable: false, tintable: true  },
// ...
```

### Fonction à implémenter

```js
/**
 * Peuple une zone rectangulaire avec des décos aléatoires.
 * @param {Phaser.Geom.Rectangle} area - zone à peupler (coords monde)
 * @param {Array}  keepClearPoints    - points à préserver [{x, y}, ...]
 * @returns {Array} liste des décos créées (pour cumul entre appels)
 */
placeDecorations(area, keepClearPoints) { ... }
```

Responsabilités : calcul du nombre de décos, tirage d'une définition, position candidate + rejet si trop proche d'un point sensible, application des variations, ajout au bon groupe (voir ci-dessous).

### Profondeur & collisions — **le point à ne pas rater**

- **Tags (`category: 'tag'`)** : `setDepth(DEPTH.GROUND)` — toujours en fond, sous joueur/ennemis. Pas de physique.
- **Props (`category: 'prop'`)** : profondeur triée par `y` (`setDepth(sprite.y)`) pour un rendu 2.5D correct (le joueur passe devant/derrière). Si `collidable`, l'ajouter à un `staticGroup` et poser la collision.
- Définir des constantes de couches : `const DEPTH = { BACKGROUND: 0, GROUND: 1, ENTITIES: 'sortByY' };`
- Un seul `staticGroup` pour tous les props bloquants, avec `this.physics.add.collider(player, propsGroup)` et `collider(enemies, propsGroup)`.

### Assets attendus

Textures chargées en `preload()` (fournir des placeholders si absents, à ne pas laisser en prod) :
`tag_arrow`, `tag_throwup`, `sign_stop`, `sign_oneway`, `dumpster`, `barrier`, `traffic_cone`, `fire_hydrant`.

---

## Scope 2 — Expansion progressive de la map

### Comportement attendu

Au franchissement d'un palier de `expansionThresholds`, le monde s'agrandit de `expansionStep` selon `expansionMode`, la nouvelle zone est peuplée (via Scope 1) et un feedback est joué.

### Compteur de kills — source unique

Éviter les doubles comptes : **un seul point d'incrément**. À la mort d'un ennemi, émettre un event ; la scène écoute et gère le palier.

```js
// dans le handler de mort d'ennemi (un seul endroit) :
this.events.emit('enemy-killed', enemy);

// dans create() :
this.killCount = 0;
this.currentTier = 0;
this.events.on('enemy-killed', this.handleEnemyKilled, this);

handleEnemyKilled() {
  this.killCount++;
  const next = ENV_CONFIG.expansionThresholds[this.currentTier];
  if (next !== undefined && this.killCount >= next) {
    this.currentTier++;
    this.expandMap();
  }
}
```

> Pour une escalade infinie, remplacer le tableau par une formule (`next = base * (tier + 1)`). Le tableau est gardé par défaut pour la lisibilité.

### Fonction à implémenter

```js
/** Agrandit le monde d'un palier et peuple la nouvelle zone. */
expandMap() { ... }
```

Responsabilités :

1. Calculer les nouvelles bornes selon `expansionMode` (`'around'` = étendre des deux côtés sur chaque axe).
2. `this.physics.world.setBounds(...)` **et** `this.cameras.main.setBounds(...)` avec les mêmes valeurs.
3. Redimensionner le fond (voir ci-dessous).
4. Déterminer la (les) zone(s) nouvellement révélée(s) sous forme de `Rectangle`, puis appeler `placeDecorations()` dessus en passant les points sensibles courants.
5. (Optionnel) ajouter des points de spawn ennemis dans la nouvelle zone et monter légèrement la difficulté.
6. Jouer le feedback.

### Fond (background)

- Utiliser un **`TileSprite`** couvrant tout le monde, `setScrollFactor(1)`, `setDepth(DEPTH.BACKGROUND)`.
- À l'expansion : ajuster `bg.width` / `bg.height` et repositionner l'origine pour couvrir les nouvelles bornes. Le TileSprite re-tile automatiquement, pas besoin de recréer la texture.
- Si un vrai level design est souhaité plus tard, migrer sur une tilemap — hors scope ici.

### Feedback (au moment de l'expansion)

- Léger flash caméra (`this.cameras.main.flash(...)`) ou shake court.
- Texte temporaire centré « ZONE ÉTENDUE » qui fade out.
- Son dédié si disponible.

### Synergie avec Scope 1

L'expansion **ne réimplémente rien** : elle appelle `placeDecorations(newArea, keepClearPoints)`. Implémenter Scope 1 en premier rend Scope 2 presque trivial.

---

## Pièges à éviter

- **World bounds ≠ camera bounds** : les deux doivent être mis à jour ensemble, sinon la caméra bloque le joueur dans l'ancienne zone (ou l'inverse).
- **Double comptage des kills** : n'incrémenter que depuis l'event `enemy-killed`, jamais dans plusieurs handlers.
- **Depth des props** : sans tri par `y`, le joueur apparaît sous un panneau qu'il devrait masquer.
- **Décos sur les spawns** : toujours passer les points sensibles à `placeDecorations`, sinon un ennemi peut apparaître dans une benne.
- **Fuite mémoire** : garder les décos dans des groupes clairs ; si la scène se relance, nettoyer (`destroy`) proprement.

## Definition of done

- [ ] `placeDecorations()` peuple une zone avec variation et respect des `keepClearPoints`.
- [ ] Tags en fond, props triés par `y`, props bloquants en collision.
- [ ] `killCount` incrémenté depuis une source unique, paliers respectés.
- [ ] `expandMap()` met à jour world **et** camera bounds, redimensionne le fond, peuple la nouvelle zone via Scope 1.
- [ ] Feedback visuel + (optionnel) sonore au franchissement d'un palier.
- [ ] Changer `expansionThresholds` / `expansionMode` modifie le comportement sans toucher au reste du code.

## Hors scope

- Tilemap / level design manuel (le fond reste un TileSprite procédural).
- Nouveaux types d'ennemis (seulement, en option, plus de spawns).
- Assets définitifs (placeholders acceptés le temps du dev, à remplacer avant prod).
