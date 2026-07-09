# Charte graphique — EHYO

Identité visuelle du projet, extraite du code réel (`assets/globals.css`, `index.html`,
CSS du jeu). Référence pour tout ajout d'UI : **réutiliser ces tokens et ces composants
signature, ne pas réinventer.** Deux couches coexistent :

1. **Couche UI structurelle** — système de tokens sémantiques shadcn/ui en `oklch`,
   thèmes clair + `.dark`. Pour boutons, cards, inputs, formulaires « propres ».
2. **Couche rétro-futuriste** — accents néon, CRT, glitch, terminal. C'est la
   personnalité de la marque : cyberpunk / esthétique terminal.

## Direction artistique

Cyberpunk, esthétique terminal / CRT. Fond quasi noir bleuté, texte clair, **accents néon**
qui « respirent » (glow pulsé), scanlines discrètes, éclats **glitch** (dédoublement RGB
rouge/cyan). Coins d'interface en crochets type HUD, curseur clignotant sur les labels
« terminal ». Sobre et sombre par défaut, le néon sert d'accent — pas de surcharge.

## Couleurs

### Accents néon (couche rétro — `:root`)

| Token | Hex | Rôle |
|---|---|---|
| `--neon-cyan` | `#00eaff` | accent principal (glow, bordures, focus, HUD) |
| `--neon-magenta` | `#ff00cc` | accent secondaire / CTA marque |
| `--neon-amber` | `#ffaa00` | accent tertiaire / alertes douces |
| `--neon-green` | `#39ff14` | accent quaternaire / états « on » |
| *(glitch)* | `#ff004c` | rouge de dédoublement glitch (+ cyan `#00eaff`) |

Le **cyan `#00eaff` est la couleur signature** : bordures fines `rgba(0,234,255,0.12)`,
glow de survol, faisceaux de scan, brackets HUD `rgba(0,234,255,0.45)`.

### Fond & surfaces

- Fond profond du jeu / scènes sombres : `#00040a`.
- Conteneur terminal (`.terminal-wrap`) : `background: rgba(0, 4, 10, 0.88)`,
  bordure `1px solid rgba(0,234,255,0.12)`, triple ombre
  (`0 0 0 1px rgba(0,234,255,0.04)`, `0 0 60px rgba(0,234,255,0.05)`,
  `inset 0 0 80px rgba(0,0,0,0.6)`).
- Textes (échelle sombre, du plus clair au plus discret) :
  `#e9edf2` → `#c7ced5` → `#8a9098` → `#6b7076`.

### Tokens sémantiques shadcn (`oklch`, thèmes clair + `.dark`)

Système standard shadcn (`--background`, `--foreground`, `--card`, `--primary`,
`--muted`, `--destructive`, `--border`, `--ring`, `--chart-1..5`, `--sidebar-*`).
Palette neutre bleutée. `--radius: 0.625rem` (dérive `sm/md/lg/xl`).
**Utiliser ces tokens pour l'UI standard** ; ne pas hardcoder de couleurs neutres à côté.
Le mode sombre s'active via la classe `.dark`.

## Typographie

Chargées via Google Fonts dans `index.html`. Variables CSS :

| Variable | Police | Usage |
|---|---|---|
| `--font-geist-sans` | **Geist** | corps de texte (police par défaut du `body`) |
| `--font-geist-mono` | **Geist Mono** | libellés techniques, terminal, HUD texte |
| `--font-pressstart` | **Press Start 2P** | titres, boutons arcade, HUD chiffré |

`Press Start 2P` = pixel : toujours avec un `letter-spacing` généreux (1–4 px) et des
tailles maîtrisées (elle « pèse » lourd). Souvent rehaussée d'un glow
(`text-shadow: 0 0 22px <neon>`) et d'une ombre dure décalée (`4px 4px 0 <dark>`) pour
l'effet pixel/arcade.

## Effets & composants signature

- **CRT** (`.crt`) : `filter: contrast(1.05)` + scanlines en `::after`
  (`--scanline-opacity: 0.08`, `mix-blend-mode: soft-light`). Dans le jeu, overlay de
  scanlines animées + vignette radiale (désactivé sur le profil mobile pour la perf).
- **Glitch** (`.glitch`, avec `data-text`) : dédoublement RGB — couche rouge `#ff004c` et
  couche cyan `#00eaff` en `mix-blend-mode: screen`, animations `glitchX` / `glitchY`.
- **Titres glitch (composants prêts à l'emploi)** — dans `components/` :
  - `GlitchText.vue` : titre glitch **statique**. Props `text`, `className`, `as`
    (défaut `h1`). Applique `glitch select-none tracking-tight font-extrabold uppercase`
    et passe `data-text` (requis par l'effet CSS). C'est le composant à utiliser pour tout
    titre de marque.
  - `GlitchTextFx.vue` : idem **+ secousse interactive** — jitter au survol (`mouseenter`)
    et séquence de tremblement à la touche **Entrée** (translate `x/y` sur ~250 ms). À
    réserver aux titres « héro » / accueil.
  - Les deux dépendent du CSS `.glitch` de `globals.css` et de `cn()` (`@/lib/utils`).
- **Brackets HUD** (`.hud-corner-*`) : 4 petits crochets d'angle 9×9 px, bordure cyan
  `rgba(0,234,255,0.45)`.
- **Boutons / cards néon** :
  - `.hud-glow` : glow cyan au survol (`0 0 22px rgba(0,234,255,0.10)` + bordure
    `rgba(0,234,255,0.38)`).
  - Bouton START : « respiration » néon via `@keyframes neonPulse`.
  - CTA arcade (jeu) : fond néon plein, texte sombre `#00040a`, ombre dure décalée
    (`6px 6px 0 <dark>`) + glow, `translate` au hover/active (effet « pression »).
- **Terminal** :
  - `.terminal-input` : soulignement cyan au focus (`box-shadow: 0 2px 0 0 rgba(0,234,255,0.32)`),
    pas d'outline.
  - `.terminal-label::after` : curseur `_` clignotant (`blink-cursor`).

### Bibliothèque d'animations (dans `globals.css`)

`crtFlicker` (scintillement de titre), `scanLine` (faisceau de scan des slots boutique),
`neonPulse` (respiration du bouton start), `cardGlitch` (glitch au survol des cards),
`pulse-glow-cyan`, `blink-cursor`, `glitchX`/`glitchY`. **Réutiliser celles-ci** avant d'en
créer de nouvelles.

## Charte appliquée au jeu (NEON GRAFFITI SURVIVOR)

Le moteur redéfinit localement les mêmes accents (garder ce mapping cohérent) :

| Var moteur | = token charte | Hex |
|---|---|---|
| `--neon` | magenta | `#ff00cc` |
| `--neon2` | cyan | `#00eaff` |
| `--neon3` | amber | `#ffaa00` |
| `--neon4` | green | `#39ff14` |
| `--glitch` | rouge glitch | `#ff004c` |

Fond `#00040a`, `image-rendering: pixelated`, HUD en `Press Start 2P`, écrans « terminal »
(panneau sombre, bordure + glow cyan). Palette des armes alignée : SPRAY cyan, FAT CAP amber,
PAINT BOMB magenta, AERO TORCH green.

## Règles d'usage

1. **Réutiliser les tokens et classes existants** (`--neon-*`, tokens shadcn, `.terminal-wrap`,
   `.hud-glow`, `.crt`, `.glitch`…) ; ne pas hardcoder de couleurs en dur à côté.
2. **UI standard → tokens shadcn `oklch`** ; **accents/personnalité → couche néon**. Ne pas
   mélanger n'importe comment.
3. **Le néon est un accent**, pas un fond : sobre et sombre par défaut, glow parcimonieux.
4. **Cyan = fil conducteur** (bordures, focus, hover). Magenta pour les CTA de marque.
5. **`Press Start 2P` avec parcimonie** (titres/HUD/CTA), jamais pour du texte courant.
6. **Effets rétro à budgétiser** : CRT/glitch coûtent — les couper sur mobile / profil perf
   bas (déjà le cas côté jeu).
7. Cohérence de marque : toujours **EHYO** (corriger tout `EYHO`/`eyho` résiduel).

> Note dette : `tailwind.config.ts` a un `theme.extend` vide et un `content` qui pointe encore
> sur `./src/**` (structure périmée) — les couleurs vivent dans `globals.css`, pas dans Tailwind.
> À nettoyer si on veut exposer les néons comme utilitaires Tailwind.
