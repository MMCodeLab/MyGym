// Script classico (non un modulo ES): espone tutto su window.MyGym.views.workoutHistory.
(function () {

const { store, muscleGroup, icon, escapeHtml, openModal, showToast, confirmAction, navigate } = window.MyGym;

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m} min`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('it-IT', { maximumFractionDigits: 2 });
}

function computeWorkoutVolume(w) {
  return w.exercises.reduce((sum, e) => (
    sum + e.sets.reduce((s, set) => s + (set.reps || 0) * (set.weight || 0), 0)
  ), 0);
}

// ---------- Grafico: andamento del carico sollevato, per allenamento ----------
// Stesso stile "a linea morbida" di prima, ma un punto per allenamento
// (in ordine cronologico) invece che un punto per settimana.
// Con monthKey il grafico mostra tutto e solo quel mese: sono al massimo una
// trentina di allenamenti, ci stanno. Senza, ricade sugli ultimi 10 (o 30
// nella versione grande), che e' come si comportava prima.

function volumeChartHtml(workouts, { large = false, monthKey = null } = {}) {
  const inScope = monthKey ? workouts.filter((w) => monthKeyOf(w.date) === monthKey) : workouts;
  const chronological = [...inScope].sort((a, b) => new Date(a.date) - new Date(b.date));
  const recent = monthKey ? chronological : chronological.slice(large ? -30 : -10);
  const n = recent.length;

  if (n < 2) {
    const testo = monthKey
      ? `${primaMaiuscola(inMese(monthKey))} non ci sono abbastanza allenamenti con i pesi per disegnare l'andamento del carico.`
      : "Registra almeno 2 allenamenti con dei pesi per vedere l'andamento del carico.";
    return `<p class="text-secondary text-center" style="padding:16px 4px 4px">${testo}</p>`;
  }

  const values = recent.map((w) => Math.round(computeWorkoutVolume(w)));
  const max = Math.max(1, ...values);
  const W = 320, H = large ? 210 : 120, PAD_X = 14, PAD_TOP = 20;
  const plotH = H - PAD_TOP;
  const stepX = (W - PAD_X * 2) / (n - 1);

  const points = recent.map((w, i) => ({
    x: PAD_X + i * stepX,
    y: PAD_TOP + plotH - (values[i] / max) * plotH,
    value: values[i],
    date: new Date(w.date),
  }));

  // Curva morbida: una Bezier cubica tra ogni coppia di punti.
  let linePath = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cx = (p0.x + p1.x) / 2;
    linePath += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  const areaPath = `${linePath} L ${points[n - 1].x} ${H} L ${points[0].x} ${H} Z`;

  // Solo l'ultimo punto (l'allenamento piu' recente) mostra il valore in
  // etichetta, per non affollare il grafico con tanti punti vicini. In grande
  // c'e' spazio anche per il massimo, che e' il riferimento da battere.
  const peak = large ? values.indexOf(Math.max(...values)) : -1;
  const dots = points.map((p, i) => `
    <circle cx="${p.x}" cy="${p.y}" r="${i === n - 1 ? 5 : 3}" class="line-chart-dot${i === n - 1 ? ' line-chart-dot-current' : ''}" />
    ${i === n - 1 || i === peak ? `<text x="${p.x}" y="${p.y - 9}" class="line-chart-value" text-anchor="middle">${p.value} kg</text>` : ''}
  `).join('');

  const labelEvery = Math.max(1, Math.ceil(n / (large ? 6 : 4)));
  const labels = points.map((p, i) => (i % labelEvery === 0 || i === n - 1) ? `
    <text x="${p.x}" y="${H + 15}" class="line-chart-label" text-anchor="middle">${p.date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}</text>
  ` : '').join('');

  return `
    <svg viewBox="0 0 ${W} ${H + 20}" class="line-chart-svg" role="img" aria-label="Andamento del carico sollevato per allenamento">
      <defs>
        <linearGradient id="lineChartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent-a)" stop-opacity="0.35" />
          <stop offset="100%" stop-color="var(--accent-a)" stop-opacity="0" />
        </linearGradient>
        <linearGradient id="lineChartStroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="var(--accent-a)" />
          <stop offset="100%" stop-color="var(--accent-b)" />
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#lineChartFill)" stroke="none" />
      <path d="${linePath}" fill="none" stroke="url(#lineChartStroke)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      ${dots}
      ${labels}
    </svg>
  `;
}

// ---------- Il mese che si sta guardando ----------
// La scelta e' condivisa fra Progressi e questa schermata: se sfogli fino ad
// agosto e poi tocchi il grafico per aprirlo in grande, ti ritrovi ad agosto
// e non di nuovo al mese corrente.

let selectedMonth = null;

function pad2(n) { return String(n).padStart(2, '0'); }
function dateKey(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function monthKeyOf(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

// "ad agosto", "a settembre": la d eufonica davanti a vocale, altrimenti si
// legge male ad alta voce.
function inMese(key) {
  const nome = monthLabel(key);
  return `${'aeiou'.includes(nome[0]) ? 'ad' : 'a'} ${nome}`;
}

function primaMaiuscola(testo) {
  return testo.charAt(0).toUpperCase() + testo.slice(1);
}

function monthLabel(key) {
  const [anno, mese] = key.split('-');
  return new Date(Number(anno), Number(mese) - 1, 1)
    .toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
}

// I mesi che hanno almeno un allenamento, piu' quello corrente: anche se in
// questo mese non ti sei ancora mosso, sfogliando devi poterci tornare.
function monthsWithWorkouts(workouts) {
  const chiavi = new Set(workouts.map((w) => monthKeyOf(w.date)));
  chiavi.add(monthKeyOf(new Date().toISOString()));
  return [...chiavi].sort();
}

// L'ultimo della lista ordinata e' il mese corrente, che e' sempre dentro:
// quindi al primo ingresso si apre su questo mese, come prima.
function activeMonth(workouts) {
  const mesi = monthsWithWorkouts(workouts);
  if (!selectedMonth || !mesi.includes(selectedMonth)) selectedMonth = mesi[mesi.length - 1];
  return selectedMonth;
}

function monthNavHtml(workouts) {
  const mesi = monthsWithWorkouts(workouts);
  const indice = mesi.indexOf(activeMonth(workouts));
  return `
    <div class="recap-month month-nav">
      <button class="icon-btn" data-month-prev ${indice <= 0 ? 'disabled' : ''} aria-label="Mese precedente">${icon('back')}</button>
      <span class="recap-month-label">${escapeHtml(monthLabel(mesi[indice]))}</span>
      <button class="icon-btn recap-next" data-month-next ${indice >= mesi.length - 1 ? 'disabled' : ''} aria-label="Mese successivo">${icon('back')}</button>
    </div>`;
}

// onChange decide cosa ridisegnare: Progressi rifa' la sua pagina, lo storico
// la sua. stopPropagation perche' in Progressi le frecce finiscono dentro una
// card che al tocco apre lo storico.
function bindMonthNav(container, workouts, onChange) {
  const mesi = monthsWithWorkouts(workouts);
  const indice = mesi.indexOf(activeMonth(workouts));
  const vai = (nuovoIndice) => (e) => {
    e.stopPropagation();
    if (nuovoIndice < 0 || nuovoIndice > mesi.length - 1) return;
    selectedMonth = mesi[nuovoIndice];
    onChange();
  };
  const prev = container.querySelector('[data-month-prev]');
  const next = container.querySelector('[data-month-next]');
  if (prev) prev.addEventListener('click', vai(indice - 1));
  if (next) next.addEventListener('click', vai(indice + 1));
}

// ---------- Calendario del mese: i giorni della streak ----------
// Ogni giorno prende il colore della sua fiamma (vedi js/streak.js): acceso
// se ti sei allenato, viola o azzurro se la streak dormiva o era ghiacciata.
// Sfogliando i mesi si rivedono anche le streak passate. Il conto dei giorni
// di streak di oggi sta nella card qui sopra, in Progressi.

const WEEKDAY_LABELS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

// Con nav a true, l'intestazione del calendario diventa le frecce del mese:
// stanno dentro la card invece che sopra, cosi' il nome del mese non e'
// scritto due volte a due centimetri di distanza.
function streakGridHtml(workouts, monthKey, { nav = false } = {}) {
  const { computeStreak, dayCellHtml, legendHtml } = window.MyGym.streak;
  const allKeys = new Set(workouts.map((w) => dateKey(new Date(w.date))));
  const streak = computeStreak(workouts);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const key = monthKey || monthKeyOf(today.toISOString());
  const year = Number(key.split('-')[0]);
  const month = Number(key.split('-')[1]) - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // 0 = Lunedi

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push('<span class="streak-cell streak-cell-pad"></span>');
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(dayCellHtml(new Date(year, month, day), streak));
  }

  const workoutsThisMonth = [...allKeys].filter((k) => k.startsWith(key)).length;
  const conteggio = `${workoutsThisMonth} allenament${workoutsThisMonth === 1 ? 'o' : 'i'}`;

  const intestazione = nav
    ? `${monthNavHtml(workouts)}
       <div class="text-secondary text-center" style="font-size:0.78rem;margin:-2px 0 10px">${conteggio}</div>`
    : `<div class="flex items-center justify-between" style="margin-bottom:10px">
         <span style="font-weight:700;font-size:0.9rem;text-transform:capitalize">${escapeHtml(monthLabel(key))}</span>
         <span class="text-secondary" style="font-size:0.78rem">${conteggio}</span>
       </div>`;

  return `
    ${intestazione}
    <div class="streak-weekdays">${WEEKDAY_LABELS.map((l) => `<span>${l}</span>`).join('')}</div>
    <div class="streak-grid">${cells.join('')}</div>
    ${legendHtml()}
  `;
}

function openWorkoutDetailModal(w) {
  const musclesHtml = w.muscles.map((key) => {
    const mg = muscleGroup(key);
    return `<span class="badge" style="background:${mg.color}">${escapeHtml(mg.label)}</span>`;
  }).join(' ');

  const exercisesHtml = w.exercises.map((e) => `
    <div class="card glass workout-exercise-card">
      <div class="exercise-name">${escapeHtml(e.name)}</div>
      <div class="sets-list mt-2">
        ${e.sets.map((s, i) => `<div class="set-row set-row-readonly"><span class="set-label">Serie ${i + 1}</span><span class="text-secondary">${e.kind === 'cardio' ? `${formatNumber(s.minutes)} min · ${formatNumber(s.speed)} km/h` : `${formatNumber(s.reps)} reps × ${formatNumber(s.weight)} kg`}</span></div>`).join('')}
      </div>
    </div>
  `).join('');

  openModal({
    title: `${w.weekday} — ${new Date(w.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    bodyHtml: `
      <p class="text-secondary" style="margin-top:0">${formatDuration(w.durationSeconds)} · ${w.exercises.length} esercizi</p>
      <div class="flex gap-2" style="flex-wrap:wrap;margin-bottom:12px">${musclesHtml}</div>
      ${exercisesHtml}
    `,
  });
}

function historyCardHtml(w) {
  const muscles = w.muscles.slice(0, 5).map((key) => {
    const mg = muscleGroup(key);
    return `<span class="badge" style="background:${mg.color}">${escapeHtml(mg.label)}</span>`;
  }).join('');
  const dateStr = new Date(w.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });

  return `
    <div class="card day-card glass" data-workout-id="${w.id}">
      <div class="day-card-head">
        <span class="day-card-title">${escapeHtml(w.weekday)}</span>
        <button class="icon-btn danger" data-delete-workout="${w.id}" aria-label="Elimina allenamento">${icon('trash')}</button>
      </div>
      <span class="day-card-meta">${dateStr} · ${formatDuration(w.durationSeconds)} · ${w.exercises.length} esercizi</span>
      <div class="day-card-chips">${muscles}</div>
    </div>
  `;
}

function render(container) {
  const workouts = store.getWorkouts();

  if (!workouts.length) {
    container.innerHTML = `
      <div class="flex items-center gap-3">
        <button class="icon-btn" id="back-btn" aria-label="Indietro">${icon('back')}</button>
        <h1 class="section-title" style="margin:0">Allenamenti</h1>
      </div>
      <div class="empty-state glass mt-4">
        <div class="empty-emoji">📊</div>
        <div class="empty-title">Nessun allenamento salvato</div>
        <div class="empty-text">Vai su "Allenamento" nella barra in basso per registrare il primo.</div>
      </div>
    `;
    container.querySelector('#back-btn').addEventListener('click', () => navigate('#/progressi'));
    return;
  }

  // Un mese per volta: la lista di tutti gli allenamenti messi in fila
  // seppelliva quelli vecchi, e il grafico si fermava comunque agli ultimi 30.
  const mese = activeMonth(workouts);
  const delMese = workouts.filter((w) => monthKeyOf(w.date) === mese);

  container.innerHTML = `
    <div class="flex items-center gap-3">
      <button class="icon-btn" id="back-btn" aria-label="Indietro">${icon('back')}</button>
      <h1 class="section-title" style="margin:0">Allenamenti</h1>
    </div>
    <p class="section-subtitle">${workouts.length} allenament${workouts.length === 1 ? 'o' : 'i'} in tutto.</p>

    ${monthNavHtml(workouts)}

    <div class="card glass chart-card mt-2">
      <div class="flex items-center gap-2" style="margin-bottom:6px">
        ${icon('chartBar')}
        <span style="font-weight:700;font-size:0.9rem">Carico per allenamento</span>
      </div>
      ${volumeChartHtml(workouts, { large: true, monthKey: mese })}
    </div>

    <div id="history-list" class="mt-4">
      ${delMese.length ? delMese.map(historyCardHtml).join('') : `
        <div class="empty-state glass">
          <div class="empty-emoji">🗓️</div>
          <div class="empty-title">Niente ${escapeHtml(inMese(mese))}</div>
          <div class="empty-text">Con le frecce qui sopra ti sposti sugli altri mesi.</div>
        </div>`}
    </div>
  `;

  container.querySelector('#back-btn').addEventListener('click', () => navigate('#/progressi'));
  bindMonthNav(container, workouts, () => render(container));

  container.querySelectorAll('[data-workout-id]').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-delete-workout]')) return;
      const w = store.getWorkout(card.dataset.workoutId);
      if (w) openWorkoutDetailModal(w);
    });
  });

  container.querySelectorAll('[data-delete-workout]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.deleteWorkout;
      confirmAction({
        title: 'Eliminare l\'allenamento?',
        message: 'Questo allenamento verrà rimosso dallo storico.',
        confirmLabel: 'Elimina',
        onConfirm: () => {
          store.deleteWorkout(id);
          showToast('Allenamento eliminato');
          render(container);
        },
      });
    });
  });
}

window.MyGym = window.MyGym || {};
window.MyGym.views = window.MyGym.views || {};
// Calendario e grafico stanno anche in cima a Progressi (vedi progress.js).
window.MyGym.views.workoutHistory = { render, streakGridHtml, volumeChartHtml, monthNavHtml, bindMonthNav, activeMonth, monthLabel };

})();
