# Changelog

Journal des modifications du repo. Nouvelle entrée EN HAUT à chaque changement de code
(ordre antéchronologique) — voir la règle dans `CLAUDE.md`. Ne jamais réécrire une
entrée existante.

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
