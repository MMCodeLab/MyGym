// Seconda pagina della barra in alto: Spotify (apre l'app) e quattro strumenti
// da palestra (il timer e' una finestra che resta e si sposta). Sostituisce js/mini-player.js. Per aggiungere uno strumento:
// una funzione qui, una voce in TOOLS e un pulsante .app-chip con data-tool.
(function () {

const M = () => window.MyGym;
const num = (v) => {
  const n = parseFloat(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const fmt = (n) => Number(n).toLocaleString('it-IT', { maximumFractionDigits: 2 });
const roundTo = (n, step) => Math.round(n / step) * step;
const SELECTED = 'background:var(--accent-gradient);border-color:transparent';

// ---------- Spotify: apre l'app ----------
function openSpotify() {
  // Se l'app non risponde (PC senza Spotify, ad esempio) si apre la versione web.
  const fallback = setTimeout(() => {
    if (!document.hidden) window.open('https://open.spotify.com', '_blank', 'noopener');
  }, 1500);
  document.addEventListener('visibilitychange', () => clearTimeout(fallback), { once: true });
  window.location.href = 'spotify://';
}

// ---------- Calcolatore dischi ----------
const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

function openPlates() {
  M().openModal({
    title: 'Calcolatore dischi',
    bodyHtml: `
      <div class="measure-grid">
        <div class="field">
          <label for="pl-target">Carico totale (kg)</label>
          <input class="input" id="pl-target" type="text" inputmode="decimal" placeholder="es. 100" />
        </div>
        <div class="field">
          <label for="pl-bar">Bilanciere (kg)</label>
          <input class="input" id="pl-bar" type="text" inputmode="decimal" value="20" />
        </div>
      </div>
      <div class="field">
        <label>Dischi che hai (tocca per escludere)</label>
        <div class="chip-row" id="pl-chips">
          ${PLATES.map((p) => `<span class="chip selected" data-plate="${p}" style="${SELECTED}">${fmt(p)}</span>`).join('')}
        </div>
      </div>
      <div id="pl-out" class="tool-out"></div>`,
    onMount: (body) => {
      const on = new Set(PLATES);
      const out = body.querySelector('#pl-out');

      const calc = () => {
        const target = num(body.querySelector('#pl-target').value);
        const bar = num(body.querySelector('#pl-bar').value);
        if (target == null || bar == null) { out.innerHTML = ''; return; }
        if (target < bar) { out.innerHTML = '<p class="form-error">Il carico è inferiore al bilanciere.</p>'; return; }

        let rem = (target - bar) / 2;
        const used = [];
        [...on].sort((a, b) => b - a).forEach((p) => {
          const n = Math.floor(rem / p + 1e-9);
          if (n > 0) { used.push([p, n]); rem -= n * p; }
        });
        const reached = bar + used.reduce((s, [p, n]) => s + p * n, 0) * 2;

        const rows = used.length
          ? `<div class="food-list">${used.map(([p, n]) => `
              <div class="food-row"><span class="food-name">${n} × ${fmt(p)} kg</span><span class="food-unit">per lato</span></div>`).join('')}</div>`
          : '<p class="text-secondary">Solo il bilanciere.</p>';
        const note = rem > 0.001
          ? `<p class="form-error">Con questi dischi arrivi a ${fmt(reached)} kg (mancano ${fmt(rem * 2)} kg).</p>`
          : `<p class="text-secondary">Totale: ${fmt(reached)} kg.</p>`;
        out.innerHTML = rows + note;
      };

      body.querySelectorAll('[data-plate]').forEach((chip) => {
        chip.addEventListener('click', () => {
          const p = Number(chip.dataset.plate);
          const sel = !on.has(p);
          if (sel) on.add(p); else on.delete(p);
          chip.classList.toggle('selected', sel);
          chip.setAttribute('style', sel ? SELECTED : '');
          calc();
        });
      });
      body.querySelectorAll('input').forEach((i) => i.addEventListener('input', calc));
    },
  });
}

// ---------- Massimale stimato (stessa formula di Epley dell'app) ----------
function openOneRm() {
  M().openModal({
    title: 'Massimale stimato',
    bodyHtml: `
      <div class="measure-grid">
        <div class="field">
          <label for="rm-w">Peso (kg)</label>
          <input class="input" id="rm-w" type="text" inputmode="decimal" placeholder="es. 80" />
        </div>
        <div class="field">
          <label for="rm-r">Ripetizioni</label>
          <input class="input" id="rm-r" type="text" inputmode="numeric" placeholder="es. 6" />
        </div>
      </div>
      <div id="rm-out" class="tool-out"></div>`,
    onMount: (body) => {
      const out = body.querySelector('#rm-out');
      const calc = () => {
        const w = num(body.querySelector('#rm-w').value);
        const r = num(body.querySelector('#rm-r').value);
        if (!w || !r || r < 1) { out.innerHTML = ''; return; }
        const rm = w * (1 + r / 30);
        const rows = [95, 90, 85, 80, 75, 70, 65, 60, 50].map((p) => `
          <div class="food-row"><span class="food-name">${p}%</span><span class="food-kcal">${fmt(roundTo(rm * p / 100, 0.5))} kg</span></div>`).join('');
        out.innerHTML = `
          <div class="food-tot kcal"><div class="v">${fmt(roundTo(rm, 0.5))} kg</div><div class="l">massimale stimato (1 ripetizione)</div></div>
          <div class="food-list" style="margin-top:10px">${rows}</div>
          ${r > 12 ? '<p class="food-note">Sopra le 12 ripetizioni la stima è meno precisa.</p>' : ''}`;
      };
      body.querySelectorAll('input').forEach((i) => i.addEventListener('input', calc));
    },
  });
}

// ---------- Serie di riscaldamento ----------
function openWarmup() {
  M().openModal({
    title: 'Serie di riscaldamento',
    bodyHtml: `
      <div class="measure-grid">
        <div class="field">
          <label for="wu-w">Carico di lavoro (kg)</label>
          <input class="input" id="wu-w" type="text" inputmode="decimal" placeholder="es. 100" />
        </div>
        <div class="field">
          <label for="wu-bar">Bilanciere (kg)</label>
          <input class="input" id="wu-bar" type="text" inputmode="decimal" value="20" />
        </div>
      </div>
      <div id="wu-out" class="tool-out"></div>`,
    onMount: (body) => {
      const out = body.querySelector('#wu-out');
      const STEPS = [[0, 10], [0.4, 8], [0.6, 5], [0.8, 3], [0.9, 1]];
      const calc = () => {
        const work = num(body.querySelector('#wu-w').value);
        const bar = num(body.querySelector('#wu-bar').value) || 0;
        if (!work) { out.innerHTML = ''; return; }
        if (work <= bar) { out.innerHTML = '<p class="text-secondary">Il carico è già quello del bilanciere: non serve riscaldarsi con altri pesi.</p>'; return; }

        const list = [];
        STEPS.forEach(([p, reps]) => {
          const kg = p === 0 ? bar : Math.max(bar, roundTo(work * p, 2.5));
          if (kg >= work) return;
          if (list.length && kg <= list[list.length - 1].kg) return;
          list.push({ kg, reps });
        });
        out.innerHTML = `
          <div class="food-list">${list.map((s, i) => `
            <div class="food-row">
              <span class="food-name">Serie ${i + 1}<small>${s.kg === bar ? 'bilanciere vuoto' : Math.round(s.kg / work * 100) + '% del carico'}</small></span>
              <span class="food-kcal">${fmt(s.kg)} kg × ${s.reps}</span>
            </div>`).join('')}
            <div class="food-row"><span class="food-name">Serie di lavoro</span><span class="food-kcal">${fmt(work)} kg</span></div>
          </div>
          <p class="food-note">Riposo breve tra le serie leggere (circa 1 minuto), più lungo vicino al carico di lavoro.</p>`;
      };
      body.querySelectorAll('input').forEach((i) => i.addEventListener('input', calc));
    },
  });
}

// ---------- Timer: finestra grande che resta, si riduce e si sposta ----------
// Sta fuori dalle schermate dell'app, quindi non si ferma cambiando pagina. Si
// chiude solo con la X. Il tempo si ricalcola sempre dall'orologio e lo stato
// si salva: anche ricaricando l'app il timer riparte da dov'era.
const TIMER_KEY = 'mygym.timer.v1'; // chiave a parte: non finisce nei backup ne' nel cloud

const mk = (work, rest, rounds, prep, workLabel = 'Lavoro') => ({ mode: 'intervals', work, rest, rounds, prep, workLabel });
const PRESETS = {
  r60: { name: 'Riposo 60 s', auto: true, cfg: mk(60, 0, 1, 0, 'Riposo') },
  r90: { name: 'Riposo 90 s', auto: true, cfg: mk(90, 0, 1, 0, 'Riposo') },
  r120: { name: 'Riposo 2 min', auto: true, cfg: mk(120, 0, 1, 0, 'Riposo') },
  r180: { name: 'Riposo 3 min', auto: true, cfg: mk(180, 0, 1, 0, 'Riposo') },
  tabata: { name: 'Tabata 20/10 ×8', cfg: mk(20, 10, 8, 5) },
  hiit: { name: 'HIIT 30/30 ×10', cfg: mk(30, 30, 10, 5) },
  circuito: { name: 'Circuito 40/20 ×6', cfg: mk(40, 20, 6, 5) },
  emom: { name: 'EMOM ×10', cfg: mk(60, 0, 10, 5) },
  boxe: { name: 'Boxe 3 min ×12', cfg: mk(180, 60, 12, 10, 'Round') },
  amrap10: { name: 'AMRAP 10 min', cfg: mk(600, 0, 1, 5, 'AMRAP') },
  amrap15: { name: 'AMRAP 15 min', cfg: mk(900, 0, 1, 5, 'AMRAP') },
  amrap20: { name: 'AMRAP 20 min', cfg: mk(1200, 0, 1, 5, 'AMRAP') },
  cron: { name: 'Cronometro', cfg: { mode: 'stopwatch', work: 0, rest: 0, rounds: 1, prep: 0, workLabel: 'Cronometro' } },
};
const PRESET_GROUPS = [
  { title: 'Riposo tra le serie · parte subito', ids: ['r60', 'r90', 'r120', 'r180'] },
  { title: 'Intervalli', ids: ['tabata', 'hiit', 'circuito', 'emom', 'boxe'] },
  { title: 'Altro', ids: ['amrap10', 'amrap15', 'amrap20', 'cron'] },
];

function defaultTimer() {
  return {
    open: false, min: true, corner: 'tr', sound: true,
    cfg: { ...mk(40, 20, 6, 5), preset: 'circuito' },
    accMs: 0, resumedAt: null, started: false, finished: false,
  };
}
function loadTimer() {
  try { return { ...defaultTimer(), ...(JSON.parse(localStorage.getItem(TIMER_KEY)) || {}) }; } catch (e) { return defaultTimer(); }
}
const S = loadTimer();
function saveTimer() {
  try { localStorage.setItem(TIMER_KEY, JSON.stringify(S)); } catch (e) { /* niente */ }
}

const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const clockLong = (s) => (s >= 3600
  ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  : clock(s));
const elapsedMs = () => S.accMs + (S.resumedAt ? Date.now() - S.resumedAt : 0);

function buildPhases(cfg) {
  const list = [];
  if (cfg.prep > 0) list.push({ label: 'Preparati', kind: 'prep', secs: cfg.prep });
  for (let i = 1; i <= cfg.rounds; i++) {
    list.push({ label: cfg.workLabel, kind: cfg.workLabel === 'Riposo' ? 'rest' : 'work', secs: cfg.work, round: i });
    if (cfg.rest > 0 && i < cfg.rounds) list.push({ label: 'Riposo', kind: 'rest', secs: cfg.rest, round: i });
  }
  return list;
}
function locate(el, phases) {
  let acc = 0;
  for (let i = 0; i < phases.length; i++) {
    const end = acc + phases[i].secs * 1000;
    if (el < end) return { i, start: acc, end };
    acc = end;
  }
  return null;
}

// Suoni e vibrazione
let audioCtx = null;
function ensureAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { /* senza audio resta la vibrazione */ }
}
function beep(freq, ms) {
  try {
    if (!audioCtx || !S.sound) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = freq;
    g.gain.value = 0.18;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + ms / 1000);
  } catch (e) { /* niente */ }
}
function cue(kind) { // 1 = riposo, 2 = lavoro, 3 = fine, 4 = preparazione
  beep(kind === 1 ? 600 : kind === 4 ? 500 : 900, kind === 3 ? 700 : 220);
  if (navigator.vibrate) navigator.vibrate(kind === 3 ? [250, 100, 250, 100, 250] : 160);
}
function tickBeep() {
  beep(700, 90);
  if (navigator.vibrate) navigator.vibrate(40);
}

// Schermo acceso mentre il timer gira
let wake = null;
async function acquireWake() {
  try {
    if (navigator.wakeLock && !wake) {
      wake = await navigator.wakeLock.request('screen');
      wake.addEventListener('release', () => { wake = null; });
    }
  } catch (e) { /* non e' indispensabile */ }
}
function releaseWake() {
  if (wake) { wake.release().catch(() => {}); wake = null; }
}

let tRoot = null;
let tPill = null;
let tOverlay = null;
let tCard = null;
let tTick = null;
let lastIdx = -1;
let lastRem = null;
const tq = (sel) => tRoot.querySelector(sel);

function insets() {
  const p = document.createElement('div');
  p.style.cssText = 'position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';
  document.body.appendChild(p);
  const cs = getComputedStyle(p);
  const r = { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
  p.remove();
  return r;
}

// La pillola sta sempre in uno dei quattro angoli: in alto sotto la barra,
// in basso sopra la barra di navigazione.
function placePill() {
  if (!tPill || tPill.hidden) return;
  const ins = insets();
  const w = tPill.offsetWidth;
  const h = tPill.offsetHeight;
  const m = 12;
  tPill.style.left = `${S.corner.includes('r') ? window.innerWidth - w - m : m}px`;
  tPill.style.top = `${S.corner.includes('t') ? ins.top + 70 : window.innerHeight - h - ins.bottom - 100}px`;
}

function paintSetup() {
  tRoot.querySelectorAll('[data-preset]').forEach((c) => {
    const on = c.dataset.preset === S.cfg.preset;
    c.classList.toggle('selected', on);
    c.setAttribute('style', on ? SELECTED : '');
  });
  ['work', 'rest', 'rounds', 'prep'].forEach((k) => {
    const input = tq(`#it-${k}`);
    if (input && document.activeElement !== input) input.value = S.cfg[k];
  });
}

function updateTimer() {
  if (!tRoot) return;
  const stopwatch = S.cfg.mode === 'stopwatch';
  const el = elapsedMs();
  let kind = 'idle';
  let phaseText = 'Pronto';
  let timeText = '0:00';
  let subText = '\u00a0';
  let pct = 0;

  if (stopwatch) {
    kind = S.started ? 'work' : 'idle';
    phaseText = S.started && !S.resumedAt ? 'In pausa' : 'Cronometro';
    timeText = clockLong(Math.floor(el / 1000));
  } else {
    const phases = buildPhases(S.cfg);
    const totalSecs = phases.reduce((s, p) => s + p.secs, 0);
    if (!S.started) {
      const first = phases.find((p) => p.kind !== 'prep') || { secs: 0 };
      timeText = clock(first.secs);
      subText = `${S.cfg.rounds > 1 ? `${S.cfg.rounds} giri · ` : ''}totale ${clockLong(totalSecs)}`;
    } else {
      const loc = locate(el, phases);
      if (!loc) {
        kind = 'done';
        phaseText = 'Finito!';
        if (!S.finished) {
          S.finished = true;
          S.accMs = totalSecs * 1000;
          S.resumedAt = null;
          stopTick();
          releaseWake();
          if (el - totalSecs * 1000 < 3000) cue(3);
          saveTimer();
        }
      } else {
        const ph = phases[loc.i];
        kind = ph.kind;
        phaseText = ph.label;
        const remaining = Math.ceil((loc.end - el) / 1000);
        timeText = clock(remaining);
        pct = ((el - loc.start) / (loc.end - loc.start)) * 100;
        if (ph.round && S.cfg.rounds > 1) subText = `Giro ${ph.round} di ${S.cfg.rounds}`;
        else if (ph.kind === 'prep') subText = 'Preparati…';
        if (!S.resumedAt) subText = 'In pausa';
        if (S.resumedAt) {
          if (loc.i !== lastIdx) {
            lastIdx = loc.i;
            lastRem = null;
            cue(ph.kind === 'rest' ? 1 : ph.kind === 'prep' ? 4 : 2);
          }
          if (remaining <= 3 && remaining >= 1 && remaining !== lastRem) {
            lastRem = remaining;
            tickBeep();
          }
        }
      }
    }
  }

  tCard.dataset.kind = kind;
  tPill.dataset.kind = kind;
  tCard.classList.toggle('is-active', S.started);
  tCard.classList.toggle('is-stopwatch', stopwatch);
  tq('.it-phase').textContent = phaseText;
  tq('.it-time').textContent = timeText;
  tq('.it-sub').textContent = subText;
  tq('.it-bar-fill').style.width = `${Math.min(100, Math.max(0, pct))}%`;
  tq('.it-go').textContent = !S.started ? 'Avvia' : S.finished ? 'Ricomincia' : S.resumedAt ? 'Pausa' : 'Riprendi';
  tq('.it-pill-phase').textContent = S.started ? phaseText : 'Timer';
  tq('.it-pill-time').textContent = S.started || stopwatch ? timeText : '–:––';
  tq('.it-pill .it-pill-btn').textContent = S.resumedAt ? '❚❚' : '▶';
  tq('[data-it="sound"]').textContent = S.sound ? '🔊 Suono' : '🔇 Muto';
}

function renderTimer() {
  if (!tRoot) return;
  tOverlay.hidden = !(S.open && !S.min);
  tPill.hidden = !(S.open && S.min);
  paintSetup();
  updateTimer();
  placePill();
}

function ensureTick() { if (!tTick) tTick = setInterval(updateTimer, 200); }
function stopTick() { clearInterval(tTick); tTick = null; }

function startTimer() {
  ensureAudio();
  if (S.finished) resetRun();
  if (!S.started) {
    S.accMs = 0;
    S.started = true;
    S.finished = false;
    lastIdx = -1;
    lastRem = null;
  }
  S.resumedAt = Date.now();
  acquireWake();
  ensureTick();
  saveTimer();
  updateTimer();
}
function pauseTimer() {
  S.accMs = elapsedMs();
  S.resumedAt = null;
  stopTick();
  releaseWake();
  saveTimer();
  updateTimer();
}
function resetRun() {
  stopTick();
  releaseWake();
  Object.assign(S, { accMs: 0, resumedAt: null, started: false, finished: false });
  lastIdx = -1;
  lastRem = null;
  saveTimer();
  updateTimer();
}
function setElapsed(ms) {
  S.accMs = Math.max(0, ms);
  if (S.resumedAt) S.resumedAt = Date.now();
  lastIdx = -1;
  saveTimer();
  updateTimer();
}
function currentPhase() {
  if (!S.started || S.finished || S.cfg.mode === 'stopwatch') return null;
  return locate(elapsedMs(), buildPhases(S.cfg));
}

function openTimerWidget() {
  ensureTimerRoot();
  S.open = true;
  S.min = false;
  saveTimer();
  renderTimer();
}
function minimizeTimer() {
  S.min = true;
  saveTimer();
  renderTimer();
}
function closeTimer() {
  if (S.started && !S.finished && !window.confirm('Chiudere il timer? Verrà azzerato.')) return;
  stopTick();
  releaseWake();
  Object.assign(S, { open: false, min: true, accMs: 0, resumedAt: null, started: false, finished: false });
  lastIdx = -1;
  lastRem = null;
  saveTimer();
  renderTimer();
}

function ensureTimerRoot() {
  if (tRoot) return;
  const presetsHtml = PRESET_GROUPS.map((g) => `
    <div class="it-group-title">${g.title}</div>
    <div class="chip-row it-chips">
      ${g.ids.map((id) => `<span class="chip" data-preset="${id}">${PRESETS[id].name}</span>`).join('')}
    </div>`).join('');

  tRoot = document.createElement('div');
  tRoot.className = 'it-root';
  tRoot.innerHTML = `
    <div class="it-pill" hidden data-kind="idle">
      <button type="button" class="it-pill-btn" data-it="toggle" aria-label="Avvia o metti in pausa">▶</button>
      <span class="it-pill-text"><span class="it-pill-phase">Timer</span><span class="it-pill-time">–:––</span></span>
      <button type="button" class="it-pill-btn it-pill-x" data-it="close" aria-label="Chiudi il timer">✕</button>
    </div>
    <div class="it-overlay" hidden>
      <div class="it-card glass" data-kind="idle">
        <div class="it-head">
          <strong>Timer</strong>
          <button type="button" class="icon-btn" data-it="minimize" aria-label="Riduci">▾</button>
          <button type="button" class="icon-btn" data-it="close" aria-label="Chiudi il timer">✕</button>
        </div>
        <div class="it-display">
          <div class="it-phase">Pronto</div>
          <div class="it-time">0:00</div>
          <div class="it-sub">&nbsp;</div>
          <div class="it-bar"><span class="it-bar-fill"></span></div>
        </div>
        <div class="it-main">
          <button type="button" class="btn btn-glass it-side it-adj" data-it="back">↺ Fase</button>
          <button type="button" class="btn btn-primary it-go" data-it="toggle">Avvia</button>
          <button type="button" class="btn btn-glass it-side it-adj" data-it="skip">Salta ›</button>
        </div>
        <div class="it-tools">
          <button type="button" class="btn btn-glass btn-sm it-adj" data-it="minus">−10 s</button>
          <button type="button" class="btn btn-glass btn-sm it-adj" data-it="plus">+10 s</button>
          <button type="button" class="btn btn-glass btn-sm it-act" data-it="reset">Azzera</button>
          <button type="button" class="btn btn-glass btn-sm" data-it="sound">🔊 Suono</button>
        </div>
        <div class="it-setup">
          ${presetsHtml}
          <div class="measure-grid it-fields">
            <div class="field"><label for="it-work">Lavoro (s)</label><input class="input" id="it-work" data-field="work" type="text" inputmode="numeric" /></div>
            <div class="field"><label for="it-rest">Riposo (s)</label><input class="input" id="it-rest" data-field="rest" type="text" inputmode="numeric" /></div>
            <div class="field"><label for="it-rounds">Giri</label><input class="input" id="it-rounds" data-field="rounds" type="text" inputmode="numeric" /></div>
            <div class="field"><label for="it-prep">Preparazione (s)</label><input class="input" id="it-prep" data-field="prep" type="text" inputmode="numeric" /></div>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(tRoot);
  tPill = tq('.it-pill');
  tOverlay = tq('.it-overlay');
  tCard = tq('.it-card');

  tRoot.addEventListener('click', (ev) => {
    if (ev.target === tOverlay) { minimizeTimer(); return; } // tocco fuori: si riduce, non si chiude

    const chip = ev.target.closest('[data-preset]');
    if (chip) {
      const p = PRESETS[chip.dataset.preset];
      S.cfg = { ...p.cfg, preset: chip.dataset.preset };
      saveTimer();
      paintSetup();
      updateTimer();
      if (p.auto) startTimer();
      return;
    }

    const btn = ev.target.closest('[data-it]');
    if (!btn) return;
    const act = btn.dataset.it;
    const loc = currentPhase();
    const el = elapsedMs();

    if (act === 'toggle') { if (S.resumedAt) pauseTimer(); else startTimer(); }
    else if (act === 'close') closeTimer();
    else if (act === 'minimize') minimizeTimer();
    else if (act === 'reset') resetRun();
    else if (act === 'sound') { S.sound = !S.sound; saveTimer(); updateTimer(); }
    else if (act === 'back' && loc) setElapsed(loc.start);
    else if (act === 'skip' && loc) setElapsed(loc.end);
    else if (act === 'plus' && loc) setElapsed(Math.max(loc.start, el - 10000));
    else if (act === 'minus' && loc) setElapsed(Math.min(loc.end, el + 10000));
  });

  tRoot.addEventListener('input', (ev) => {
    const key = ev.target.dataset && ev.target.dataset.field;
    if (!key) return;
    const n = Math.max(key === 'rounds' ? 1 : 0, Math.round(num(ev.target.value) || 0));
    S.cfg = { ...S.cfg, [key]: n, preset: null };
    saveTimer();
    paintSetup();
    updateTimer();
  });

  // Trascinamento della pillola: segue il dito e al rilascio va nell'angolo piu' vicino.
  let drag = null;
  tPill.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = tPill.getBoundingClientRect();
    drag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top, x0: e.clientX, y0: e.clientY, moved: false };
    tPill.setPointerCapture(e.pointerId);
  });
  tPill.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) {
      drag.moved = true;
      tPill.classList.add('is-dragging');
    }
    if (drag.moved) {
      tPill.style.left = `${e.clientX - drag.dx}px`;
      tPill.style.top = `${e.clientY - drag.dy}px`;
    }
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    tPill.classList.remove('is-dragging');
    if (d.moved) {
      const r = tPill.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      S.corner = (cy < window.innerHeight / 2 ? 't' : 'b') + (cx < window.innerWidth / 2 ? 'l' : 'r');
      saveTimer();
      placePill();
    } else if (e.type === 'pointerup') {
      S.min = false; // un tocco sulla pillola la riapre grande
      saveTimer();
      renderTimer();
    }
  };
  tPill.addEventListener('pointerup', endDrag);
  tPill.addEventListener('pointercancel', endDrag);
}

window.addEventListener('resize', placePill);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !tRoot) return;
  if (S.resumedAt) acquireWake();
  updateTimer();
});

// Se il timer era aperto prima di un ricaricamento, riparte da dov'era.
if (S.open) {
  ensureTimerRoot();
  renderTimer();
  if (S.resumedAt) { acquireWake(); ensureTick(); }
}

// ---------- La barra in alto a due pagine ----------
const TOOLS = {
  spotify: openSpotify,
  dischi: openPlates,
  massimale: openOneRm,
  timer: openTimerWidget,
  riscalda: openWarmup,
};

const pager = document.getElementById('topbar-pager');
const dots = document.getElementById('topbar-dots');

if (pager && dots) {
  pager.addEventListener('scroll', () => {
    const idx = pager.scrollLeft > pager.clientWidth / 2 ? 1 : 0;
    dots.querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i === idx));
  }, { passive: true });

  pager.addEventListener('click', (ev) => {
    const chip = ev.target.closest('.app-chip');
    if (!chip) return;
    pager.scrollTo({ left: 0, behavior: 'smooth' }); // la barra torna sul titolo
    const open = TOOLS[chip.dataset.tool];
    if (open) open();
  });
}

})();