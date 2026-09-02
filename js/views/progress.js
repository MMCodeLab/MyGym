// Script classico (non un modulo ES): espone tutto su window.MyGym.views.progress.
(function () {

const { store, MUSCLE_GROUPS, icon, escapeHtml, navigate, BODY_METRICS } = window.MyGym;

// ---------- Scorciatoia allo storico + record personali ----------

function formatKg(value) {
  return Number(value || 0).toLocaleString('it-IT', { maximumFractionDigits: 1 });
}

// L'anno si mostra solo se il record non e' di quest'anno: nelle righe strette
// dello storico ogni parola in meno conta.
function formatRecordDate(iso) {
  const d = new Date(iso);
  const opts = { day: '2-digit', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('it-IT', opts);
}

function formatRecordTime(iso) {
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function totalVolume(workouts) {
  return workouts.reduce((sum, w) => sum + w.exercises.reduce((s, e) => (
    s + e.sets.reduce((x, set) => x + (set.reps || 0) * (set.weight || 0), 0)
  ), 0), 0);
}

function statsHeroHtml() {
  const { workouts } = store.get();
  const metrics = workouts.length
    ? `
      <span class="stats-hero-metrics">
        <span><strong>${workouts.length}</strong> allenament${workouts.length === 1 ? 'o' : 'i'}</span>
        <span><strong>${formatKg(Math.round(totalVolume(workouts)))}</strong> kg sollevati</span>
      </span>`
    : '';

  return `
    <button class="stats-hero" id="workouts-row">
      <span class="stats-hero-icon">${icon('chartBar')}</span>
      <span class="stats-hero-text">
        <span class="stats-hero-title">Allenamenti</span>
        <span class="stats-hero-desc">${workouts.length ? 'Storico completo e grafico dei progressi' : 'Qui compariranno storico e grafico dei progressi'}</span>
        ${metrics}
      </span>
      <span class="stats-hero-chevron">${icon('chevronDown')}</span>
    </button>
  `;
}

// Quante misure diverse sono state segnate almeno una volta: e' il modo piu'
// onesto di riassumere in una riga uno storico fatto di campi facoltativi.
function trackedMetricCount(measurements) {
  return BODY_METRICS.filter((m) => measurements.some((e) => e.values[m.key] != null)).length;
}

function measuresHeroHtml() {
  const measurements = store.getMeasurements();
  const weight = store.latestMeasurementValue('peso');

  let metrics = '';
  if (measurements.length) {
    const tracked = trackedMetricCount(measurements);
    metrics = `
      <span class="stats-hero-metrics">
        ${weight ? `<span><strong>${formatKg(weight.value)}</strong> kg oggi</span>` : ''}
        <span><strong>${measurements.length}</strong> misurazion${measurements.length === 1 ? 'e' : 'i'}</span>
        <span><strong>${tracked}</strong> misur${tracked === 1 ? 'a' : 'e'} seguite</span>
      </span>`;
  }

  return `
    <button class="stats-hero" id="measures-row">
      <span class="stats-hero-icon">${icon('ruler')}</span>
      <span class="stats-hero-text">
        <span class="stats-hero-title">Misure</span>
        <span class="stats-hero-desc">${measurements.length ? 'Peso, altezza e circonferenze, con il loro andamento' : "Segna peso, altezza e circonferenze e guardane l'andamento"}</span>
        ${metrics}
      </span>
      <span class="stats-hero-chevron">${icon('chevronDown')}</span>
    </button>
  `;
}

function recordHistoryRowHtml(item, isCurrent) {
  return `
    <div class="record-history-row${isCurrent ? ' is-current' : ''}">
      <span class="record-history-when">
        <span class="record-history-date">${formatRecordDate(item.date)}${isCurrent ? '<span class="record-now">attuale</span>' : ''}</span>
        <span class="record-history-time">ore ${formatRecordTime(item.date)}</span>
      </span>
      <span class="record-history-load">${formatKg(item.weight)} kg × ${item.reps}</span>
    </div>
  `;
}

function recordCardHtml(record, index) {
  const beaten = record.history.length - 1;
  const sub = beaten
    ? `Battuto ${beaten} volt${beaten === 1 ? 'a' : 'e'} · ${formatRecordDate(record.best.date)}`
    : `Primo record · ${formatRecordDate(record.best.date)}`;
  // Dal piu' recente al piu' vecchio: il record attuale sta in cima.
  const rows = [...record.history].reverse()
    .map((item, i) => recordHistoryRowHtml(item, i === 0))
    .join('');

  return `
    <div class="record-card glass" data-record="${index}">
      <button class="record-head" data-record-toggle="${index}" aria-expanded="false">
        <span class="record-medal">${icon('sparkles')}</span>
        <span class="record-info">
          <span class="record-name">${escapeHtml(record.name)}</span>
          <span class="record-sub">${sub}</span>
        </span>
        <span class="record-best">${formatKg(record.best.weight)}<small>kg</small> × ${record.best.reps}</span>
        <span class="record-chevron">${icon('chevronDown')}</span>
      </button>
      <div class="record-history">${rows}</div>
    </div>
  `;
}

function recordsSectionHtml() {
  const records = store.getPersonalRecords();

  const body = records.length
    ? records.map(recordCardHtml).join('')
    : `
      <div class="settings-row glass">
        <div class="settings-row-text">
          <div class="settings-row-title">Ancora nessun record</div>
          <div class="settings-row-desc">Segna reps e carico durante l'allenamento: qui trovi il massimo di ogni esercizio e tutte le volte che l'hai battuto.</div>
        </div>
      </div>
    `;

  return `
    <div class="settings-section">
      <h3>I tuoi record</h3>
      ${records.length ? '<p class="settings-section-hint">Tocca un esercizio per vedere quando hai battuto il record.</p>' : ''}
      ${body}
    </div>
  `;
}


// ---------- Mappa dei muscoli ----------
// Le figure vengono da una mappa anatomica open source (js/body-paths.js:
// react-native-body-highlighter, licenza MIT, (c) 2022 ELABBASSI Hicham): di
// quel progetto usiamo solo i tracciati, medaglie e interazione sono nostre.

// Ogni pezzo anatomico ricade in un gruppo muscolare di MyGym.
const GROUP_BY_SLUG = {
  chest: 'petto',
  trapezius: 'trapezio',
  deltoids: 'spalle',
  biceps: 'bicipiti',
  triceps: 'tricipiti',
  forearm: 'avambracci',
  abs: 'addominali',
  obliques: 'addominali',
  'upper-back': 'schiena',
  'lower-back': 'schiena',
  gluteal: 'glutei',
  quadriceps: 'gambe',
  hamstring: 'gambe',
  adductors: 'gambe',
  calves: 'polpacci',
  tibialis: 'polpacci',
};
// Testa, collo, mani, piedi e articolazioni non si allenano: restano sagoma.
const NEUTRAL_SLUGS = ['head', 'hair', 'neck', 'hands', 'feet', 'knees', 'ankles'];

const TIERS = [
  { key: 'da-allenare', label: 'Da allenare', art: 'la prima medaglia', emoji: '💤', color: 'rgba(255,255,255,.16)' },
  { key: 'bronzo',   label: 'Bronzo',   art: 'il bronzo',   emoji: '🥉', color: '#c9803f' },
  { key: 'argento',  label: 'Argento',  art: "l'argento",   emoji: '🥈', color: '#c3ccd8' },
  { key: 'oro',      label: 'Oro',      art: "l'oro",       emoji: '🥇', color: '#f4b740' },
  { key: 'diamante', label: 'Diamante', art: 'il diamante', emoji: '💎', color: '#5ed9f5' },
  { key: 'platino',  label: 'Platino',  art: 'il platino',  emoji: '👑', color: '#c4b5fd' },
];

// Traguardi: per ogni medaglia un carico e delle ripetizioni precise, uguali
// per tutti. Niente peso corporeo di mezzo, cosi' l'obiettivo si capisce al
// volo e non cambia se ingrassi o dimagrisci.
// Ordine: bronzo, argento, oro, diamante, platino.
const STANDARDS = {
  petto: { ref: 'Panca piana',
    maschio: [[40, 8], [60, 8], [80, 6], [100, 5], [120, 3]],
    femmina: [[20, 8], [30, 8], [40, 6], [50, 5], [60, 3]] },
  schiena: { ref: 'Rematore o trazioni zavorrate',
    maschio: [[40, 8], [60, 8], [80, 6], [100, 5], [120, 3]],
    femmina: [[20, 8], [30, 8], [40, 6], [50, 5], [60, 3]] },
  trapezio: { ref: 'Scrollate',
    maschio: [[40, 12], [70, 10], [100, 8], [140, 6], [180, 5]],
    femmina: [[25, 12], [45, 10], [65, 8], [90, 6], [115, 5]] },
  spalle: { ref: 'Lento avanti',
    maschio: [[25, 8], [40, 8], [55, 6], [70, 5], [85, 3]],
    femmina: [[12, 8], [20, 8], [30, 6], [38, 5], [45, 3]] },
  bicipiti: { ref: 'Curl con bilanciere',
    maschio: [[20, 10], [30, 10], [40, 8], [50, 6], [60, 5]],
    femmina: [[10, 10], [15, 10], [22, 8], [28, 6], [35, 5]] },
  tricipiti: { ref: 'French press o panca stretta',
    maschio: [[20, 10], [35, 10], [50, 8], [65, 6], [80, 5]],
    femmina: [[10, 10], [18, 10], [26, 8], [34, 6], [42, 5]] },
  avambracci: { ref: 'Curl inverso',
    maschio: [[15, 12], [25, 12], [35, 10], [45, 8], [55, 6]],
    femmina: [[8, 12], [14, 12], [20, 10], [26, 8], [32, 6]] },
  addominali: { ref: 'Crunch ai cavi',
    maschio: [[15, 12], [25, 12], [40, 10], [55, 8], [70, 6]],
    femmina: [[8, 12], [15, 12], [22, 10], [30, 8], [38, 6]] },
  glutei: { ref: 'Hip thrust o stacco',
    maschio: [[60, 10], [100, 8], [140, 6], [180, 5], [220, 3]],
    femmina: [[40, 10], [70, 8], [100, 6], [130, 5], [160, 3]] },
  gambe: { ref: 'Squat',
    maschio: [[60, 8], [90, 6], [120, 5], [150, 4], [180, 3]],
    femmina: [[40, 8], [60, 6], [80, 5], [100, 4], [120, 3]] },
  polpacci: { ref: 'Calf raise',
    maschio: [[40, 15], [70, 15], [100, 12], [140, 10], [180, 8]],
    femmina: [[25, 15], [45, 15], [65, 12], [90, 10], [115, 8]] },
};

let selectedMuscle = 'petto';

function estimated1RM(weight, reps) {
  if (!weight || !reps) return 0;
  return weight * (1 + reps / 30);
}

function targetsFor(groupKey) {
  const std = STANDARDS[groupKey];
  return std ? std[store.get().sex === 'femmina' ? 'femmina' : 'maschio'] : null;
}

// Il traguardo si scrive com'e' ("100 kg x 5"), ma per assegnarlo si confronta
// la forza espressa: chi fa 110 x 3 e' piu' forte di chi fa 100 x 5 e non puo'
// restare indietro solo perche' ha scelto un'altra serie.
function tierFor(groupKey, oneRM) {
  const t = targetsFor(groupKey);
  if (!t || !oneRM) return TIERS[0];
  let idx = 0;
  t.forEach(([kg, reps], i) => { if (oneRM >= estimated1RM(kg, reps) - 0.001) idx = i + 1; });
  return TIERS[idx];
}

function nextGoalFor(groupKey, oneRM) {
  const t = targetsFor(groupKey);
  if (!t) return null;
  for (let i = 0; i < t.length; i++) {
    const [kg, reps] = t[i];
    if ((oneRM || 0) < estimated1RM(kg, reps)) return { tier: TIERS[i + 1], kg, reps };
  }
  return null;
}

function muscleScores() {
  const bests = store.getMuscleBests();
  const out = {};
  MUSCLE_GROUPS.forEach((g) => {
    const best = bests[g.key] || null;
    out[g.key] = {
      group: g,
      best,
      tier: tierFor(g.key, best && best.oneRM),
      goal: nextGoalFor(g.key, best && best.oneRM),
      misurabile: !!STANDARDS[g.key],
    };
  });
  return out;
}

function bodyFigureHtml(side, scores) {
  const sex = store.get().sex === 'femmina' ? 'femmina' : 'maschio';
  const figura = (window.BODY_PATHS || {})[sex] && window.BODY_PATHS[sex][side];
  if (!figura) return '';

  const sagoma = figura.parts
    .filter((part) => NEUTRAL_SLUGS.includes(part.slug))
    .map((part) => part.d.map((d) => `<path d="${d}" />`).join('')).join('');

  const perGruppo = new Map();
  figura.parts.forEach((part) => {
    const key = GROUP_BY_SLUG[part.slug];
    if (!key) return;
    if (!perGruppo.has(key)) perGruppo.set(key, []);
    perGruppo.get(key).push(...part.d);
  });

  const muscoli = [...perGruppo.entries()].map(([key, ds]) => {
    const sc = scores[key];
    const spento = sc.tier.key === 'da-allenare';
    return `<g class="muscle-zone${spento ? ' is-untrained' : ''}${key === selectedMuscle ? ' is-active' : ''}" data-muscle="${key}"${spento ? '' : ` fill="${sc.tier.color}"`}>
      <title>${escapeHtml(sc.group.label)} — ${sc.tier.label}</title>
      ${ds.map((d) => `<path d="${d}" />`).join('')}
    </g>`;
  }).join('');

  return `
    <div class="body-figure">
      <div class="body-figure-label">${side === 'front' ? 'Fronte' : 'Retro'}</div>
      <svg class="body-svg" viewBox="${figura.viewBox}" role="img" aria-label="Corpo visto ${side === 'front' ? 'di fronte' : 'di spalle'}">
        <g class="body-silhouette">${sagoma}</g>
        ${muscoli}
        <path class="body-outline" d="${figura.outline}" />
      </svg>
    </div>`;
}

function muscleDetailHtml(scores) {
  const s = scores[selectedMuscle];

  if (!s.misurabile) {
    return `
      <div class="muscle-detail-head">
        <span class="muscle-medal" style="background:rgba(255,255,255,.10)">🫀</span>
        <span class="muscle-detail-text">
          <span class="muscle-detail-name">${escapeHtml(s.group.label)}</span>
          <span class="muscle-detail-tier text-secondary">Non assegna medaglie</span>
        </span>
      </div>
      <p class="muscle-note">Il cardio si segna a minuti e velocità: una medaglia di forza qui non vorrebbe dire niente.</p>`;
  }

  const t = s.tier;
  const scaletta = TIERS.slice(1).map((x) => {
    const presa = TIERS.indexOf(x) <= TIERS.indexOf(t);
    return `<span class="${presa ? 'is-reached' : ''}" ${presa ? `style="border-color:${x.color};background:${x.color}22;color:#fff"` : ''}>${x.emoji}<br>${x.label}</span>`;
  }).join('');

  return `
    <div class="muscle-detail-head">
      <span class="muscle-medal" style="background:${t.color}22;border:1px solid ${t.color}">${t.emoji}</span>
      <span class="muscle-detail-text">
        <span class="muscle-detail-name">${escapeHtml(s.group.label)}</span>
        <span class="muscle-detail-tier" style="color:${t.color}">${t.key === 'da-allenare' ? 'Nessuna medaglia' : 'Medaglia ' + t.label.toLowerCase()}</span>
      </span>
    </div>
    <div class="muscle-ladder">${scaletta}</div>
    ${s.best ? `
      <div class="muscle-row"><span class="l">La tua serie migliore</span><span class="v">${escapeHtml(s.best.name)}<br>${s.best.weight} kg × ${s.best.reps}</span></div>
      ${s.goal
        ? `<div class="muscle-row"><span class="l">Per ${s.goal.tier.art}</span><span class="v">${s.goal.tier.emoji} ${s.goal.kg} kg × ${s.goal.reps}</span></div>`
        : `<div class="muscle-row"><span class="l">Livello</span><span class="v">Il massimo 👑</span></div>`}
      <p class="muscle-note">Traguardi su <strong>${escapeHtml(STANDARDS[selectedMuscle].ref)}</strong> o su un esercizio equivalente per lo stesso gruppo: vale anche una serie diversa di pari valore.</p>`
      : `<p class="muscle-note">Non hai ancora segnato una serie con carico per ${escapeHtml(s.group.label.toLowerCase())}: appena la registri arriva la prima medaglia.</p>`}`;
}

function muscleMapHtml() {
  if (!window.BODY_PATHS) return '';
  const scores = muscleScores();
  const fuoriFigura = ['cardio', 'altro'].map((key) => `
    <button class="muscle-extra${key === selectedMuscle ? ' is-active' : ''}" data-muscle="${key}">
      <span class="muscle-extra-name">${escapeHtml(scores[key].group.label)}</span>
      <span class="muscle-extra-note">senza medaglia</span>
    </button>`).join('');

  return `
    <div class="page-section">
      <h3>Mappa dei muscoli</h3>
      <p class="settings-section-hint">Tocca un muscolo per vedere la medaglia e il prossimo traguardo.</p>
      <div class="card glass muscle-map-card">
        <div class="body-figures">
          ${bodyFigureHtml('front', scores)}
          ${bodyFigureHtml('back', scores)}
        </div>
        <div class="muscle-legend">
          ${TIERS.map((t) => `<span><i style="background:${t.color}"></i>${t.label}</span>`).join('')}
        </div>
        <div class="muscle-extra-row">${fuoriFigura}</div>
      </div>
      <div class="card glass muscle-detail" id="muscle-detail">${muscleDetailHtml(scores)}</div>
    </div>`;
}

function render(container) {
  container.innerHTML = `
    <h1 class="section-title">Progressi</h1>
    <p class="section-subtitle">Storico, grafici e record personali.</p>

    <div class="page-section stats-hero-stack">
      ${statsHeroHtml()}
      ${measuresHeroHtml()}
    </div>

    ${recordsSectionHtml()}
    ${muscleMapHtml()}
  `;

  container.querySelector('#workouts-row').addEventListener('click', () => navigate('#/storico'));
  container.querySelector('#measures-row').addEventListener('click', () => navigate('#/misure'));

  container.querySelectorAll('[data-muscle]').forEach((el) => {
    el.addEventListener('click', () => {
      selectedMuscle = el.dataset.muscle;
      render(container);
    });
  });

  container.querySelectorAll('[data-record-toggle]').forEach((head) => {
    head.addEventListener('click', () => {
      const card = head.closest('.record-card');
      const open = card.classList.toggle('is-open');
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });
}

window.MyGym = window.MyGym || {};
window.MyGym.views = window.MyGym.views || {};
window.MyGym.views.progress = { render };

})();
