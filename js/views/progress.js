// Script classico (non un modulo ES): espone tutto su window.MyGym.views.progress.
(function () {

const { store, icon, escapeHtml, navigate, BODY_METRICS } = window.MyGym;

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

function render(container) {
  container.innerHTML = `
    <h1 class="section-title">Progressi</h1>
    <p class="section-subtitle">Storico, grafici e record personali.</p>

    <div class="page-section stats-hero-stack">
      ${statsHeroHtml()}
      ${measuresHeroHtml()}
    </div>

    ${recordsSectionHtml()}
  `;

  container.querySelector('#workouts-row').addEventListener('click', () => navigate('#/storico'));
  container.querySelector('#measures-row').addEventListener('click', () => navigate('#/misure'));

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
