<script setup lang="ts">
/**
 * Styleguide vivante — rend la charte graphique avec ses propres tokens.
 * Page de référence interne : tout ce qui est affiché ici vient de
 * `assets/globals.css` (aucune couleur hardcodée hors des hex cités comme
 * valeur de token, qui sont la donnée même affichée).
 */
import { onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import GlitchText from '@/components/GlitchText.vue'
import GlitchTextFx from '@/components/GlitchTextFx.vue'
import StartButton from '@/components/StartButton.vue'
import Button from '@/components/ui/Button.vue'
import logoUrl from '@/assets/picture/ehyo-blanc.svg'

const router = useRouter()

/* ── Accents néon (couche rétro) ── */
const neons = [
  { token: '--neon-cyan',    hex: '#00eaff', role: 'accent principal — bordures, focus, hover, HUD' },
  { token: '--neon-magenta', hex: '#ff00cc', role: 'accent secondaire — CTA de marque' },
  { token: '--neon-amber',   hex: '#ffaa00', role: 'accent tertiaire — alertes douces' },
  { token: '--neon-green',   hex: '#39ff14', role: 'accent quaternaire — états « on »' },
  { token: '(glitch)',       hex: '#ff004c', role: 'rouge de dédoublement glitch' }
]

/* ── Fonds & surfaces ── */
const surfaces = [
  { label: 'fond profond',      value: '#00040a',               css: 'background: #00040a' },
  { label: 'terminal-wrap',     value: 'rgba(0,4,10,0.88)',     css: '.terminal-wrap' },
  { label: 'bordure fine',      value: 'rgba(0,234,255,0.12)',  css: 'border' },
  { label: 'bracket HUD',       value: 'rgba(0,234,255,0.45)',  css: '.hud-corner-*' }
]

/* ── Échelle de texte (du plus clair au plus discret) ── */
const textScale = ['#e9edf2', '#c7ced5', '#8a9098', '#6b7076']

/* ── Typographie ── */
const fonts = [
  { varName: '--font-geist-sans', name: 'Geist',          usage: 'corps de texte (défaut du body)', family: 'var(--font-geist-sans)', sample: 'Catch the signal or don\'t.' },
  { varName: '--font-geist-mono', name: 'Geist Mono',     usage: 'libellés techniques, terminal, HUD texte', family: 'var(--font-geist-mono)', sample: '> DROP_04 // STOCK: 12' },
  { varName: '--font-pressstart', name: 'Press Start 2P', usage: 'titres, boutons arcade, HUD chiffré', family: 'var(--font-pressstart)', sample: 'EHYO 0042' }
]

/* ── Mapping des accents dans le moteur de jeu ── */
const engineVars = [
  { v: '--neon',   token: 'magenta',      hex: '#ff00cc' },
  { v: '--neon2',  token: 'cyan',         hex: '#00eaff' },
  { v: '--neon3',  token: 'amber',        hex: '#ffaa00' },
  { v: '--neon4',  token: 'green',        hex: '#39ff14' },
  { v: '--glitch', token: 'rouge glitch', hex: '#ff004c' }
]

/* ── Bibliothèque d'animations : rejouables au clic ── */
const anims = [
  { name: 'crtFlicker',       duration: '4s',   note: 'scintillement de titre' },
  { name: 'neonPulse',        duration: '1.8s', note: 'respiration du bouton START' },
  { name: 'pulse-glow-cyan',  duration: '1.8s', note: 'glow cyan pulsé' },
  { name: 'cardGlitch',       duration: '0.5s', note: 'glitch au survol des cards' },
  { name: 'scanLine',         duration: '2.4s', note: 'faisceau de scan (slots boutique)' },
  { name: 'blink-cursor',     duration: '1.1s', note: 'curseur _ clignotant' }
]
/** Compteur par animation : incrémenté au clic pour forcer un remount (:key) donc un replay. */
const replays = ref<Record<string, number>>({})
const replay = (name: string) => {
  replays.value[name] = (replays.value[name] ?? 0) + 1
}

/* ── Toggle CRT global : l'effet est budgétisé, on doit pouvoir le couper ── */
const crtOn = ref(true)

/* ── Copie de token au clic ── */
const copied = ref('')
let copyTimer: number | null = null
const copy = async (value: string) => {
  try {
    await navigator.clipboard.writeText(value)
    copied.value = value
    if (copyTimer !== null) clearTimeout(copyTimer)
    copyTimer = window.setTimeout(() => { copied.value = '' }, 1200)
  } catch {
    /* clipboard refusé (contexte non sécurisé) — on ignore silencieusement */
  }
}

onUnmounted(() => {
  if (copyTimer !== null) clearTimeout(copyTimer)
})
</script>

<template>
  <main class="sg-root" :class="{ crt: crtOn }">
    <div class="sg-shell">

      <!-- ══ En-tête ══ -->
      <header class="terminal-wrap sg-head rounded-2xl">
        <span class="hud-corner hud-corner-tl" />
        <span class="hud-corner hud-corner-tr" />
        <span class="hud-corner hud-corner-bl" />
        <span class="hud-corner hud-corner-br" />

        <GlitchTextFx text="STYLEGUIDE" class="font-press sg-title" />
        <p class="sg-sub font-press">// EHYO // CHARTE GRAPHIQUE - REFERENCE VIVANTE</p>

        <label class="sg-toggle font-press">
          <input type="checkbox" v-model="crtOn" />
          <span>CRT&nbsp;{{ crtOn ? 'ON' : 'OFF' }}</span>
        </label>
      </header>

      <!-- ══ 01 — Accents néon ══ -->
      <section class="sg-section">
        <h2 class="sg-h2 font-press">01 // ACCENTS NEON</h2>
        <p class="sg-note">Le néon est un accent, jamais un fond. Cyan = fil conducteur.</p>

        <div class="sg-grid">
          <button
            v-for="n in neons"
            :key="n.token"
            class="sg-swatch hud-glow"
            :style="{ '--c': n.hex }"
            @click="copy(n.hex)"
          >
            <span class="sg-chip" />
            <span class="sg-swatch-meta">
              <code class="sg-token">{{ n.token }}</code>
              <code class="sg-hex">{{ copied === n.hex ? 'COPIÉ ✓' : n.hex }}</code>
              <span class="sg-role">{{ n.role }}</span>
            </span>
          </button>
        </div>
      </section>

      <!-- ══ 02 — Fonds, surfaces, texte ══ -->
      <section class="sg-section">
        <h2 class="sg-h2 font-press">02 // FONDS &amp; SURFACES</h2>

        <div class="sg-grid sg-grid-tight">
          <button
            v-for="s in surfaces"
            :key="s.label"
            class="sg-surface hud-glow"
            @click="copy(s.value)"
          >
            <code class="sg-token">{{ s.css }}</code>
            <code class="sg-hex">{{ copied === s.value ? 'COPIÉ ✓' : s.value }}</code>
            <span class="sg-role">{{ s.label }}</span>
          </button>
        </div>

        <h3 class="sg-h3 font-press">echelle de texte</h3>
        <div class="sg-textscale">
          <button
            v-for="(c, i) in textScale"
            :key="c"
            class="sg-textstep"
            :style="{ color: c }"
            @click="copy(c)"
          >
            niveau {{ i + 1 }} — {{ copied === c ? 'copié ✓' : c }}
          </button>
        </div>
      </section>

      <!-- ══ 03 — Typographie ══ -->
      <section class="sg-section">
        <h2 class="sg-h2 font-press">03 // TYPOGRAPHIE</h2>
        <p class="sg-note">
          <code class="sg-token">Press Start 2P</code> avec parcimonie : letter-spacing généreux,
          tailles maîtrisées, jamais pour du texte courant.
        </p>

        <div class="sg-fonts">
          <div v-for="f in fonts" :key="f.varName" class="sg-font">
            <div class="sg-font-head">
              <code class="sg-token">{{ f.varName }}</code>
              <span class="sg-role">{{ f.usage }}</span>
            </div>
            <p class="sg-font-sample" :style="{ fontFamily: f.family }">{{ f.sample }}</p>
            <p class="sg-font-name">{{ f.name }}</p>
          </div>
        </div>
      </section>

      <!-- ══ 04 — Titres glitch ══ -->
      <section class="sg-section">
        <h2 class="sg-h2 font-press">04 // TITRES GLITCH</h2>
        <p class="sg-note">
          <code class="sg-token">GlitchText</code> pour tout titre de marque ;
          <code class="sg-token">GlitchTextFx</code> (+ jitter au survol / touche Entrée)
          réservé aux titres héro.
        </p>

        <div class="sg-demo-row">
          <div class="sg-demo">
            <GlitchText text="DROP" class="font-press sg-demo-title" />
            <span class="sg-caption">GlitchText — statique</span>
          </div>
          <div class="sg-demo">
            <GlitchTextFx text="DROP" class="font-press sg-demo-title" />
            <span class="sg-caption">GlitchTextFx — survole-moi</span>
          </div>
        </div>
      </section>

      <!-- ══ 05 — Composants signature ══ -->
      <section class="sg-section">
        <h2 class="sg-h2 font-press">05 // COMPOSANTS SIGNATURE</h2>

        <!-- hud-glow + brackets -->
        <div class="sg-demo-row">
          <div class="sg-card hud-glow">
            <span class="hud-corner hud-corner-tl" />
            <span class="hud-corner hud-corner-tr" />
            <span class="hud-corner hud-corner-bl" />
            <span class="hud-corner hud-corner-br" />
            <span class="sg-caption">.hud-glow + .hud-corner-* — survole</span>
          </div>

          <!-- slot boutique avec faisceau de scan -->
          <div class="sg-slot">
            <span class="sg-scanbeam" />
            <span class="sg-caption">@keyframes scanLine — slot boutique</span>
          </div>
        </div>

        <!-- terminal input / label -->
        <h3 class="sg-h3 font-press">terminal</h3>
        <div class="sg-form">
          <label class="terminal-label sg-label font-press">IDENTIFIANT</label>
          <input
            class="terminal-input sg-input"
            type="text"
            placeholder="saisis puis focus — soulignement cyan"
          />
        </div>

        <!-- CTA -->
        <h3 class="sg-h3 font-press">CTA</h3>
        <div class="sg-demo-row sg-demo-row-center">
          <StartButton />
          <button class="sg-arcade font-press">PLAY</button>
        </div>
        <p class="sg-note">
          CTA arcade : fond néon plein, texte sombre <code class="sg-token">#00040a</code>,
          ombre dure décalée + glow, translate au hover/active.
        </p>

        <!-- Tokens shadcn — section passée en .dark, comme documenté -->
        <h3 class="sg-h3 font-press">UI standard - tokens shadcn (.dark)</h3>
        <p class="sg-note">
          UI « propre » → tokens sémantiques <code class="sg-token">oklch</code>.
          Le mode sombre s'active via la classe <code class="sg-token">.dark</code>.
        </p>
        <div class="dark sg-shadcn">
          <Button variant="default">default</Button>
          <Button variant="secondary">secondary</Button>
          <Button variant="outline">outline</Button>
          <Button variant="ghost">ghost</Button>
          <Button variant="destructive">destructive</Button>
          <Button variant="link">link</Button>
        </div>
      </section>

      <!-- ══ 06 — Animations ══ -->
      <section class="sg-section">
        <h2 class="sg-h2 font-press">06 // BIBLIOTHEQUE D'ANIMATIONS</h2>
        <p class="sg-note">Réutiliser celles-ci avant d'en créer de nouvelles. Clique pour rejouer.</p>

        <div class="sg-grid sg-grid-tight">
          <button
            v-for="a in anims"
            :key="a.name"
            class="sg-anim"
            @click="replay(a.name)"
          >
            <span class="sg-anim-stage">
              <span
                :key="`${a.name}-${replays[a.name] ?? 0}`"
                class="sg-anim-dot"
                :style="{ animation: `${a.name} ${a.duration} ease-in-out infinite` }"
              />
            </span>
            <code class="sg-token">{{ a.name }}</code>
            <span class="sg-role">{{ a.note }}</span>
          </button>
        </div>
      </section>

      <!-- ══ 07 — Mapping moteur ══ -->
      <section class="sg-section">
        <h2 class="sg-h2 font-press">07 // MAPPING MOTEUR (NEON GRAFFITI SURVIVOR)</h2>
        <p class="sg-note">
          Le moteur redéfinit localement les mêmes accents — garder ce mapping cohérent.
        </p>

        <div class="sg-table font-press">
          <div v-for="e in engineVars" :key="e.v" class="sg-row">
            <code class="sg-token">{{ e.v }}</code>
            <span class="sg-arrow">→</span>
            <span class="sg-role">{{ e.token }}</span>
            <span class="sg-dot" :style="{ background: e.hex, boxShadow: `0 0 10px ${e.hex}` }" />
            <code class="sg-hex">{{ e.hex }}</code>
          </div>
        </div>
      </section>

      <!-- ══ Règles ══ -->
      <section class="sg-section">
        <h2 class="sg-h2 font-press">// REGLES D'USAGE</h2>
        <ol class="sg-rules">
          <li>Réutiliser les tokens et classes existants — ne rien hardcoder à côté.</li>
          <li>UI standard → tokens shadcn ; accents/personnalité → couche néon.</li>
          <li>Le néon est un accent, pas un fond : sobre et sombre par défaut.</li>
          <li>Cyan = fil conducteur. Magenta pour les CTA de marque.</li>
          <li><code class="sg-token">Press Start 2P</code> avec parcimonie.</li>
          <li>Effets rétro budgétisés — coupés sur mobile / profil perf bas.</li>
          <li>Toujours <strong>EHYO</strong>, jamais EYHO.</li>
        </ol>
      </section>

      <!-- ══ Pied ══ -->
      <footer class="sg-foot">
        <img :src="logoUrl" alt="EHYO" class="sg-logo" />
        <p class="sg-foot-line font-press">© 2025 EHYO — CHARTE-GRAPHIQUE.MD</p>
        <a
          href="/home"
          @click.prevent="router.push('/home')"
          class="sg-back font-press"
        >[ ← RETURN TO DIR ]</a>
      </footer>

    </div>
  </main>
</template>

<style scoped>
/* ── Coquille ── */
.sg-root {
  min-height: 100vh;
  background: #00040a;
  padding: 2.5rem 1rem 3rem;
}

.sg-shell {
  width: 100%;
  max-width: 64rem;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* ── En-tête ── */
.sg-head {
  position: relative;
  padding: 2.25rem 1.5rem 1.75rem;
  text-align: center;
}

.sg-title {
  font-size: clamp(1.4rem, 6vw, 3rem);
  color: #e9edf2;
  letter-spacing: 0.08em;
  text-shadow: 0 0 22px rgba(0, 234, 255, 0.35), 4px 4px 0 #00040a;
  animation: crtFlicker 6s infinite;
}

.sg-sub {
  margin-top: 0.9rem;
  font-size: 7px;
  letter-spacing: 0.18em;
  color: rgba(0, 234, 255, 0.4);
}

.sg-toggle {
  margin-top: 1.1rem;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 7px;
  letter-spacing: 0.16em;
  color: rgba(0, 234, 255, 0.55);
  cursor: pointer;
  border: 1px solid rgba(0, 234, 255, 0.2);
  border-radius: 0.3rem;
  padding: 0.45rem 0.8rem;
}
.sg-toggle input { accent-color: var(--neon-cyan); }

/* ── Sections ── */
.sg-section {
  background: rgba(0, 4, 10, 0.88);
  border: 1px solid rgba(0, 234, 255, 0.12);
  border-radius: 1rem;
  padding: 1.5rem 1.25rem;
}

.sg-h2 {
  font-size: 9px;
  letter-spacing: 0.2em;
  color: rgba(0, 234, 255, 0.75);
  text-shadow: 0 0 12px rgba(0, 234, 255, 0.25);
  margin-bottom: 0.9rem;
}

.sg-h3 {
  font-size: 7px;
  letter-spacing: 0.2em;
  color: rgba(255, 0, 204, 0.45);
  margin: 1.6rem 0 0.7rem;
  text-transform: uppercase;
}

.sg-note {
  font-family: var(--font-geist-mono);
  font-size: 0.72rem;
  line-height: 1.7;
  color: #8a9098;
  margin-bottom: 1.1rem;
}

/* ── Grilles ── */
.sg-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.6rem;
}
@media (min-width: 640px) {
  .sg-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sg-grid-tight { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

/* ── Swatch néon ── */
.sg-swatch {
  --c: var(--neon-cyan);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  text-align: left;
  padding: 0.7rem;
  border: 1px solid color-mix(in srgb, var(--c) 20%, transparent);
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--c) 4%, #00040a);
  cursor: pointer;
}

.sg-chip {
  flex: 0 0 auto;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.35rem;
  background: var(--c);
  box-shadow: 0 0 18px color-mix(in srgb, var(--c) 55%, transparent);
}

.sg-swatch-meta {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

/* ── Surfaces ── */
.sg-surface {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  text-align: left;
  padding: 0.7rem;
  border: 1px solid rgba(0, 234, 255, 0.12);
  border-radius: 0.5rem;
  background: rgba(0, 4, 10, 0.88);
  cursor: pointer;
}

/* ── Libellés partagés ── */
.sg-token {
  font-family: var(--font-geist-mono);
  font-size: 0.7rem;
  color: rgba(0, 234, 255, 0.8);
  letter-spacing: 0.04em;
}

.sg-hex {
  font-family: var(--font-geist-mono);
  font-size: 0.68rem;
  color: #c7ced5;
}

.sg-role {
  font-family: var(--font-geist-mono);
  font-size: 0.62rem;
  color: #6b7076;
  line-height: 1.5;
}

.sg-caption {
  font-family: var(--font-geist-mono);
  font-size: 0.6rem;
  color: #6b7076;
  letter-spacing: 0.08em;
}

/* ── Échelle de texte ── */
.sg-textscale {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.sg-textstep {
  font-family: var(--font-geist-mono);
  font-size: 0.78rem;
  text-align: left;
  background: none;
  border: none;
  padding: 0.2rem 0;
  cursor: pointer;
}

/* ── Typographie ── */
.sg-fonts {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.sg-font {
  border-left: 2px solid rgba(0, 234, 255, 0.22);
  padding-left: 0.9rem;
}

.sg-font-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.6rem;
  margin-bottom: 0.45rem;
}

.sg-font-sample {
  color: #e9edf2;
  font-size: 1.05rem;
  line-height: 1.6;
  letter-spacing: 0.06em;
  word-break: break-word;
}

.sg-font-name {
  font-family: var(--font-geist-mono);
  font-size: 0.6rem;
  color: #6b7076;
  margin-top: 0.3rem;
}

/* ── Démos ── */
.sg-demo-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}
.sg-demo-row-center { align-items: center; }

.sg-demo {
  flex: 1 1 12rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 1.25rem 0.75rem;
  border: 1px dashed rgba(0, 234, 255, 0.14);
  border-radius: 0.5rem;
}

.sg-demo-title {
  font-size: clamp(1.1rem, 4vw, 1.75rem);
  color: #e9edf2;
}

.sg-card {
  position: relative;
  flex: 1 1 12rem;
  min-height: 7rem;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0.9rem;
  border: 1px solid rgba(0, 234, 255, 0.12);
  border-radius: 0.5rem;
  background: rgba(0, 4, 10, 0.88);
}
.sg-card:hover { animation: cardGlitch 0.5s ease forwards; }

/* Slot boutique + faisceau de scan */
.sg-slot {
  position: relative;
  flex: 1 1 12rem;
  min-height: 7rem;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0.9rem;
  border: 1px solid rgba(255, 0, 204, 0.18);
  border-radius: 0.5rem;
  background: rgba(0, 4, 10, 0.88);
  overflow: hidden;
}

.sg-scanbeam {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--neon-cyan), transparent);
  box-shadow: 0 0 12px rgba(0, 234, 255, 0.6);
  animation: scanLine 2.4s ease-in-out infinite;
  pointer-events: none;
}

/* ── Terminal ── */
.sg-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-width: 28rem;
}

.sg-label {
  font-size: 7px;
  letter-spacing: 0.18em;
  color: rgba(0, 234, 255, 0.6);
}

.sg-input {
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(0, 234, 255, 0.18);
  padding: 0.5rem 0.1rem;
  font-family: var(--font-geist-mono);
  font-size: 0.8rem;
  color: #e9edf2;
}
.sg-input::placeholder { color: #6b7076; }

/* ── CTA arcade ── */
.sg-arcade {
  background: var(--neon-magenta);
  color: #00040a;
  border: none;
  border-radius: 0.4rem;
  padding: 0.9rem 1.6rem;
  font-size: 0.7rem;
  letter-spacing: 0.16em;
  cursor: pointer;
  box-shadow: 6px 6px 0 #00040a, 0 0 22px rgba(255, 0, 204, 0.35);
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.sg-arcade:hover  { transform: translate(-2px, -2px); box-shadow: 8px 8px 0 #00040a, 0 0 30px rgba(255, 0, 204, 0.5); }
.sg-arcade:active { transform: translate(3px, 3px);  box-shadow: 2px 2px 0 #00040a, 0 0 14px rgba(255, 0, 204, 0.3); }

/* ── shadcn ── */
.sg-shadcn {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  padding: 1rem;
  border-radius: 0.5rem;
  background: var(--background);
  /* `color` explicite : sans lui, ghost/outline heriteraient du foreground
     clair pose sur <body> et deviendraient illisibles dans ce bloc .dark */
  color: var(--foreground);
  border: 1px solid var(--border);
}

/* ── Animations rejouables ── */
.sg-anim {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.4rem;
  text-align: left;
  padding: 0.8rem;
  border: 1px solid rgba(0, 234, 255, 0.12);
  border-radius: 0.5rem;
  background: rgba(0, 4, 10, 0.88);
  cursor: pointer;
}
.sg-anim:hover { border-color: rgba(0, 234, 255, 0.3); }

/* Scène bornée : scanLine anime `top` en %, il lui faut un bloc conteneur */
.sg-anim-stage {
  position: relative;
  display: block;
  width: 100%;
  height: 2.6rem;
  overflow: hidden;
}

.sg-anim-dot {
  position: absolute;
  top: 0;
  left: 0;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 0.3rem;
  background: rgba(0, 234, 255, 0.12);
  border: 1px solid rgba(0, 234, 255, 0.35);
}

/* ── Table de mapping ── */
.sg-table {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.sg-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  font-size: 7px;
  letter-spacing: 0.12em;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid rgba(0, 234, 255, 0.08);
}

.sg-arrow { color: #6b7076; }

.sg-dot {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 999px;
}

/* ── Règles ── */
.sg-rules {
  list-style: decimal;
  padding-left: 1.3rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  font-family: var(--font-geist-mono);
  font-size: 0.74rem;
  line-height: 1.6;
  color: #8a9098;
}
.sg-rules strong { color: var(--neon-cyan); }

/* ── Pied ── */
.sg-foot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1.5rem 0 0.5rem;
}

.sg-logo {
  height: 2rem;
  width: auto;
  opacity: 0.4;
  user-select: none;
  pointer-events: none;
  filter: drop-shadow(0 0 8px rgba(255, 0, 204, 0.2));
}

.sg-foot-line {
  font-size: 7px;
  letter-spacing: 0.14em;
  color: rgba(255, 255, 255, 0.18);
}

.sg-back {
  font-size: 7px;
  letter-spacing: 0.16em;
  color: rgba(0, 234, 255, 0.45);
  text-decoration: none;
  border: 1px solid rgba(0, 234, 255, 0.18);
  padding: 0.5rem 1.1rem;
  border-radius: 0.3rem;
  transition: color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}
.sg-back:hover {
  color: var(--neon-cyan);
  border-color: rgba(0, 234, 255, 0.55);
  box-shadow: 0 0 12px rgba(0, 234, 255, 0.28);
}

/* ── Respect des préférences système ── */
@media (prefers-reduced-motion: reduce) {
  .sg-title,
  .sg-scanbeam,
  .sg-anim-dot { animation: none !important; }
}
</style>
