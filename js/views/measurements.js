// Script classico (non un modulo ES): espone tutto su window.MyGym.views.measurements.
//
// Misure del corpo: peso, altezza e le circonferenze che si prendono col metro
// in palestra. Ogni misurazione registra da sola la data e l'ora in cui e'
// stata salvata - non c'e' nessun campo data da compilare a mano.
(function () {

const { store, BODY_METRICS, bodyMetric, icon, escapeHtml, openModal, closeModal, showToast, confirmAction, navigate } = window.MyGym;

// La misura mostrata nel grafico quando si apre la pagina. Cambia toccando le
// pastiglie sopra il grafico e resta scelta finche' si sta nella schermata.
let selectedMetric = 'peso';

// ---------- Formattazione ----------

function formatValue(value, unit) {
  const n = Number(value || 0).toLocaleString('it-IT', { maximumFractionDigits: 1 });
  return unit ? `${n} ${unit}` : n;
}

function formatDateLong(iso) {
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function daysAgoLabel(iso) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'oggi';
  if (days === 1) return 'ieri';
  return `${days} giorni fa`;
}

// Indice di massa corporea: ha senso solo se si conoscono peso e altezza, che
// possono venire da due misurazioni diverse (l'altezza si segna una volta sola).
function bmi() {
  const weight = store.latestMeasurementValue('peso');
  const height = store.latestMeasurementValue('altezza');
  if (!weight || !height || !height.value) return null;
  const m = height.value / 100;
  return weight.value / (m * m);
}

// ---------- Grafico dell'andamento ----------

function metricChartHtml(entries, metricKey) {
  const metric = bodyMetric(metricKey);
  const series = entries
    .filter((e) => e.values[metricKey] != null)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(-12);
  const n = series.length;

  if (n < 2) {
    return `<p class="text-secondary text-center" style="padding:16px 4px 4px">Segna ${escapeHtml(metric.label.toLowerCase())} almeno due volte per vedere l'andamento.</p>`;
  }

  const values = series.map((e) => e.values[metricKey]);
  // La scala parte dal minimo e non da zero: sul peso corporeo le differenze
  // che contano sono di qualche chilo, e partendo da zero il grafico sarebbe
  // una riga piatta. Il margine tiene la linea staccata dai bordi.
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = (max - min) || Math.max(1, max * 0.02);
  const lo = min - span * 0.35;
  const hi = max + span * 0.35;

  const W = 320, H = 120, PAD_X = 14, PAD_TOP = 20;
  const plotH = H - PAD_TOP;
  const stepX = (W - PAD_X * 2) / (n - 1);

  const points = series.map((e, i) => ({
    x: PAD_X + i * stepX,
    y: PAD_TOP + plotH - ((values[i] - lo) / (hi - lo)) * plotH,
    value: values[i],
    date: new Date(e.date),
  }));

  // Curva morbida: una Bezier cubica tra ogni coppia di punti, come nel
  // grafico del carico sollevato.
  let linePath = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cx = (p0.x + p1.x) / 2;
    linePath += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  const areaPath = `${linePath} L ${points[n - 1].x} ${H} L ${points[0].x} ${H} Z`;

  const dots = points.map((p, i) => `
    <circle cx="${p.x}" cy="${p.y}" r="${i === n - 1 ? 5 : 3}" class="line-chart-dot${i === n - 1 ? ' line-chart-dot-current' : ''}" />
    ${i === n - 1 ? `<text x="${p.x}" y="${p.y - 9}" class="line-chart-value" text-anchor="middle">${formatValue(p.value, metric.unit)}</text>` : ''}
  `).join('');

  const labelEvery = Math.max(1, Math.ceil(n / 4));
  const labels = points.map((p, i) => (i % labelEvery === 0 || i === n - 1) ? `
    <text x="${p.x}" y="${H + 15}" class="line-chart-label" text-anchor="middle">${p.date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}</text>
  ` : '').join('');

  // Gli id dei gradienti sono diversi da quelli dello storico allenamenti: in
  // uno stesso documento due gradienti con lo stesso id si sovrascrivono.
  return `
    <svg viewBox="0 0 ${W} ${H + 20}" class="line-chart-svg" role="img" aria-label="Andamento di ${escapeHtml(metric.label.toLowerCase())}">
      <defs>
        <linearGradient id="measureChartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent-a)" stop-opacity="0.35" />
          <stop offset="100%" stop-color="var(--accent-a)" stop-opacity="0" />
        </linearGradient>
        <linearGradient id="measureChartStroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="var(--accent-a)" />
          <stop offset="100%" stop-color="var(--accent-b)" />
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#measureChartFill)" stroke="none" />
      <path d="${linePath}" fill="none" stroke="url(#measureChartStroke)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      ${dots}
      ${labels}
    </svg>
  `;
}

// Nel grafico si possono scegliere solo le misure davvero segnate: le
// pastiglie delle altre non servirebbero a niente.
function trackedMetrics(entries) {
  return BODY_METRICS.filter((m) => entries.some((e) => e.values[m.key] != null));
}

function chartSectionHtml(entries) {
  const tracked = trackedMetrics(entries);
  if (!tracked.some((m) => m.key === selectedMetric)) selectedMetric = tracked[0].key;

  const chips = tracked.map((m) => `
    <span class="chip ${m.key === selectedMetric ? 'selected' : ''}" data-metric="${m.key}"
      ${m.key === selectedMetric ? 'style="background:var(--accent-gradient);border-color:transparent"' : ''}>${escapeHtml(m.label)}</span>
  `).join('');

  return `
    <div class="card glass chart-card">
      <div class="flex items-center gap-2" style="margin-bottom:10px">
        ${icon('progressi')}
        <span style="font-weight:700;font-size:0.9rem">Andamento</span>
      </div>
      <div class="chip-row" id="metric-chips" style="margin-bottom:10px">${chips}</div>
      <div id="metric-chart">${metricChartHtml(entries, selectedMetric)}</div>
    </div>
  `;
}

// ---------- Riepilogo in cima ----------

function summaryHtml() {
  const weight = store.latestMeasurementValue('peso');
  const imc = bmi();

  const tiles = [];
  if (weight) {
    tiles.push(`
      <span class="measure-tile glass">
        <span class="measure-tile-label">Peso attuale</span>
        <span class="measure-tile-value">${formatValue(weight.value, 'kg')}</span>
        <span class="measure-tile-sub">${escapeHtml(daysAgoLabel(weight.date))}</span>
      </span>
    `);
  }
  if (imc) {
    tiles.push(`
      <span class="measure-tile glass">
        <span class="measure-tile-label">Massa corporea</span>
        <span class="measure-tile-value">${imc.toLocaleString('it-IT', { maximumFractionDigits: 1 })}</span>
        <span class="measure-tile-sub">IMC, da peso e altezza</span>
      </span>
    `);
  }
  return tiles.length ? `<div class="measure-tiles">${tiles.join('')}</div>` : '';
}

// ---------- Elenco delle misurazioni ----------

function entryCardHtml(entry) {
  const chips = BODY_METRICS
    .filter((m) => entry.values[m.key] != null)
    .map((m) => `<span class="measure-chip"><span class="measure-chip-label">${escapeHtml(m.label)}</span>${formatValue(entry.values[m.key], m.unit)}</span>`)
    .join('');

  return `
    <div class="card day-card glass" data-measurement="${entry.id}">
      <div class="day-card-head">
        <span class="day-card-title">${escapeHtml(formatDateLong(entry.date))}</span>
        <button class="icon-btn danger" data-delete-measurement="${entry.id}" aria-label="Elimina misurazione">${icon('trash')}</button>
      </div>
      <span class="day-card-meta">ore ${escapeHtml(formatTime(entry.date))}</span>
      <div class="day-card-chips">${chips}</div>
    </div>
  `;
}

// ---------- Modulo di inserimento ----------

function openAddModal(onSaved) {
  // I campi partono con l'ultimo valore noto di ogni misura: cosi' si corregge
  // il peso e si lascia stare il resto, invece di riscrivere ogni volta anche
  // l'altezza e le circonferenze che non cambiano.
  const fieldsHtml = BODY_METRICS.map((m) => {
    const last = store.latestMeasurementValue(m.key);
    return `
      <div class="field measure-field">
        <label for="measure-${m.key}">${escapeHtml(m.label)} <span class="measure-unit">${escapeHtml(m.unit)}</span></label>
        <input type="number" inputmode="decimal" step="${m.step}" min="0" class="input" id="measure-${m.key}"
          data-metric-input="${m.key}" value="${last ? last.value : ''}" placeholder="—" />
      </div>
    `;
  }).join('');

  openModal({
    title: 'Nuova misurazione',
    bodyHtml: `
      <p class="text-secondary" style="margin-top:0">Data e ora vengono registrate da sole. I campi partono dall'ultimo valore segnato: cambia quelli che vuoi e svuota quelli che non misuri.</p>
      <div class="measure-grid">${fieldsHtml}</div>
      <p id="measure-error" class="form-error" style="display:none">Compila almeno una misura.</p>
      <button class="btn btn-primary btn-block mt-4" id="measure-save">Salva misurazione</button>
    `,
    onMount: (body) => {
      body.querySelector('#measure-save').addEventListener('click', () => {
        const values = {};
        body.querySelectorAll('[data-metric-input]').forEach((input) => {
          values[input.dataset.metricInput] = input.value;
        });

        const saved = store.addMeasurement(values);
        if (!saved) {
          body.querySelector('#measure-error').style.display = 'block';
          return;
        }

        closeModal();
        showToast('Misurazione salvata');
        onSaved();
      });
    },
  });
}

// ---------- Schermata ----------

function render(container) {
  const entries = store.getMeasurements();

  const header = `
    <div class="flex items-center gap-3">
      <button class="icon-btn" id="back-btn" aria-label="Indietro">${icon('back')}</button>
      <h1 class="section-title" style="margin:0">Misure</h1>
    </div>
  `;

  if (!entries.length) {
    container.innerHTML = `
      ${header}
      <p class="section-subtitle">Peso, altezza e circonferenze, con la data di ogni misurazione.</p>
      <div class="empty-state glass mt-4">
        <div class="empty-emoji">📏</div>
        <div class="empty-title">Ancora nessuna misurazione</div>
        <div class="empty-text">Segna peso, altezza e le circonferenze che ti interessano: l'app tiene la data e l'ora di ogni volta e ne disegna l'andamento.</div>
        <button class="btn btn-primary" id="add-first">Aggiungi la prima</button>
      </div>
    `;
    container.querySelector('#back-btn').addEventListener('click', () => navigate('#/progressi'));
    container.querySelector('#add-first').addEventListener('click', () => openAddModal(() => render(container)));
    return;
  }

  container.innerHTML = `
    ${header}
    <p class="section-subtitle">${entries.length} misurazion${entries.length === 1 ? 'e registrata' : 'i registrate'}.</p>

    ${summaryHtml()}
    ${chartSectionHtml(entries)}

    <div class="page-section mt-4">
      <h3>Storico</h3>
      ${entries.map(entryCardHtml).join('')}
    </div>

    <button class="fab" id="add-measurement" aria-label="Aggiungi misurazione">${icon('plus')}</button>
  `;

  container.querySelector('#back-btn').addEventListener('click', () => navigate('#/progressi'));
  container.querySelector('#add-measurement').addEventListener('click', () => openAddModal(() => render(container)));

  // Cambiare misura ridisegna solo il grafico e le pastiglie: il resto della
  // pagina non ha motivo di rifarsi.
  container.querySelectorAll('[data-metric]').forEach((chip) => {
    chip.addEventListener('click', () => {
      selectedMetric = chip.dataset.metric;
      container.querySelector('#metric-chart').innerHTML = metricChartHtml(entries, selectedMetric);
      container.querySelectorAll('#metric-chips .chip').forEach((c) => {
        const on = c.dataset.metric === selectedMetric;
        c.classList.toggle('selected', on);
        c.setAttribute('style', on ? 'background:var(--accent-gradient);border-color:transparent' : '');
      });
    });
  });

  container.querySelectorAll('[data-delete-measurement]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.deleteMeasurement;
      const entry = entries.find((m) => m.id === id);
      confirmAction({
        title: 'Eliminare la misurazione?',
        message: `La misurazione del ${formatDateLong(entry.date)} alle ${formatTime(entry.date)} verrà rimossa dallo storico.`,
        confirmLabel: 'Elimina',
        onConfirm: () => {
          store.deleteMeasurement(id);
          showToast('Misurazione eliminata');
          render(container);
        },
      });
    });
  });
}

window.MyGym = window.MyGym || {};
window.MyGym.views = window.MyGym.views || {};
window.MyGym.views.measurements = { render };

})();
