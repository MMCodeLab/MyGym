// Script classico (non un modulo ES): espone tutto su window.MyGym.views.progress.
(function () {

const {
  store, icon, escapeHtml, navigate, showToast, confirmAction, BODY_METRICS,
  TIERS, STANDARDS, muscleScores, bodyFigureHtml,
} = window.MyGym;

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
      <span class="choice-card-meta">
        <span><strong>${workouts.length}</strong> allenament${workouts.length === 1 ? 'o' : 'i'}</span>
        <span><strong>${formatKg(Math.round(totalVolume(workouts)))}</strong> kg sollevati</span>
      </span>`
    : '';

  return `
    <button class="choice-card choice-card-workouts glass" id="workouts-row">
      <span class="choice-card-icon">${icon('chartBar')}</span>
      <span class="choice-card-body">
        <span class="choice-card-title">Allenamenti</span>
        <span class="choice-card-desc">${workouts.length ? 'Storico completo e grafico dei progressi' : 'Qui compariranno storico e grafico dei progressi'}</span>
        ${metrics}
      </span>
      <span class="choice-card-go">${icon('chevronDown')}</span>
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
      <span class="choice-card-meta">
        ${weight ? `<span><strong>${formatKg(weight.value)}</strong> kg oggi</span>` : ''}
        <span><strong>${measurements.length}</strong> misurazion${measurements.length === 1 ? 'e' : 'i'}</span>
        <span><strong>${tracked}</strong> misur${tracked === 1 ? 'a' : 'e'} seguite</span>
      </span>`;
  }

  return `
    <button class="choice-card choice-card-measures glass" id="measures-row">
      <span class="choice-card-icon">${icon('ruler')}</span>
      <span class="choice-card-body">
        <span class="choice-card-title">Misure</span>
        <span class="choice-card-desc">${measurements.length ? 'Peso, altezza e circonferenze, con il loro andamento' : "Segna peso, altezza e circonferenze e guardane l'andamento"}</span>
        ${metrics}
      </span>
      <span class="choice-card-go">${icon('chevronDown')}</span>
    </button>
  `;
}

// Gli allenamenti del mese in corso: servono solo a dare alla card del
// resoconto qualcosa da dire prima ancora di aprirla.
function workoutsThisMonth() {
  const ora = new Date();
  return store.get().workouts.filter((w) => {
    const d = new Date(w.date);
    return d.getFullYear() === ora.getFullYear() && d.getMonth() === ora.getMonth();
  });
}

function recapHeroHtml() {
  const delMese = workoutsThisMonth();
  const kg = Math.round(totalVolume(delMese));

  return `
    <button class="choice-card choice-card-recap glass" id="recap-row">
      <span class="choice-card-icon">${icon('flag')}</span>
      <span class="choice-card-body">
        <span class="choice-card-title">Resoconto mensile</span>
        <span class="choice-card-desc">${store.get().workouts.length
          ? 'Il riassunto del mese, con la figura colorata, da condividere come immagine'
          : 'Qui comparirà il riassunto del mese, pronto da condividere'}</span>
        ${delMese.length ? `
          <span class="choice-card-meta">
            <span><strong>${delMese.length}</strong> questo mese</span>
            <span><strong>${formatKg(kg)}</strong> kg sollevati</span>
          </span>` : ''}
      </span>
      <span class="choice-card-go">${icon('chevronDown')}</span>
    </button>
  `;
}

// ---------- Diario alimentare ----------
// Qui si guarda soltanto: le foto si fanno dal Virtual PT, che e' il posto
// dove vive l'intelligenza artificiale. In Progressi resta il consuntivo.

function mealTotals(meals) {
  return meals.reduce((acc, m) => {
    ['kcal', 'proteine', 'carboidrati', 'grassi', 'fibre'].forEach((k) => {
      acc[k] = (acc[k] || 0) + (Number(m.totals[k]) || 0);
    });
    return acc;
  }, {});
}

function foodTotalsHtml(totale, etichetta) {
  return `
    <div class="food-totals">
      <div class="food-tot kcal">
        <div class="v">${Math.round(totale.kcal || 0).toLocaleString('it-IT')} kcal</div>
        <div class="l">${etichetta}</div>
      </div>
      <div class="food-tot"><div class="v">${formatKg(totale.proteine)} g</div><div class="l">proteine</div></div>
      <div class="food-tot"><div class="v">${formatKg(totale.carboidrati)} g</div><div class="l">carboidrati</div></div>
      <div class="food-tot"><div class="v">${formatKg(totale.grassi)} g</div><div class="l">grassi</div></div>
      <div class="food-tot"><div class="v">${formatKg(totale.fibre)} g</div><div class="l">fibre</div></div>
    </div>`;
}

function formatDayLabel(dayKey) {
  const oggi = new Date().toISOString().slice(0, 10);
  if (dayKey === oggi) return 'Oggi';
  const ieri = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dayKey === ieri) return 'Ieri';
  return new Date(`${dayKey}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'short' });
}

function foodDiaryHtml() {
  const giorni = store.getMealDays();

  if (!giorni.length) {
    return `
      <div class="page-section">
        <h3>Diario alimentare</h3>
        <div class="settings-row glass">
          <div class="settings-row-text">
            <div class="settings-row-title">Ancora nessun pasto</div>
            <div class="settings-row-desc">Fotografa un piatto da "Virtual PT → Informazioni sul cibo": qui restano le calorie e i valori di quello che hai mangiato, giorno per giorno.</div>
          </div>
        </div>
      </div>`;
  }

  const oggi = new Date().toISOString().slice(0, 10);
  const mealsOggi = store.getMealsByDay(oggi);
  const altriGiorni = giorni.filter((g) => g !== oggi).slice(0, 6);

  return `
    <div class="page-section">
      <h3>Diario alimentare</h3>
      <p class="settings-section-hint">Le foto si fanno dal Virtual PT: qui c'è il conto di quello che hai mangiato.</p>

      <div class="card glass">
        ${foodTotalsHtml(mealTotals(mealsOggi), mealsOggi.length
          ? `oggi · ${mealsOggi.length} past${mealsOggi.length === 1 ? 'o' : 'i'}`
          : 'oggi · ancora niente')}
        ${mealsOggi.length ? `
          <div class="food-list mt-3">
            ${mealsOggi.map((m) => `
              <div class="food-row">
                <span class="food-name">${escapeHtml(m.name)}<small>${new Date(m.date).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} · ${m.items.map((i) => escapeHtml(i.nome)).join(', ')}</small></span>
                <span class="food-kcal">${Math.round(m.totals.kcal || 0)} kcal</span>
                <button class="icon-btn danger" data-delete-meal="${m.id}" aria-label="Elimina ${escapeHtml(m.name)}">${icon('trash')}</button>
              </div>`).join('')}
          </div>` : ''}
      </div>

      ${altriGiorni.length ? `
        <div class="card glass">
          <div class="food-list">
            ${altriGiorni.map((g) => {
              const meals = store.getMealsByDay(g);
              const t = mealTotals(meals);
              return `
                <div class="food-row food-row-readonly">
                  <span class="food-name">${formatDayLabel(g)}<small>${meals.length} past${meals.length === 1 ? 'o' : 'i'} · P ${formatKg(t.proteine)} · C ${formatKg(t.carboidrati)} · G ${formatKg(t.grassi)}</small></span>
                  <span class="food-kcal">${Math.round(t.kcal || 0)} kcal</span>
                </div>`;
            }).join('')}
          </div>
        </div>` : ''}
    </div>`;
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
// Medaglie, traguardi e figura del corpo vivono in js/muscle-standards.js,
// perche' li usa anche il resoconto mensile: qui resta solo il modo in cui
// si mostrano.

let selectedMuscle = 'petto';

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
          ${bodyFigureHtml('front', scores, { selected: selectedMuscle })}
          ${bodyFigureHtml('back', scores, { selected: selectedMuscle })}
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

    <div class="page-section choice-cards">
      ${statsHeroHtml()}
      ${measuresHeroHtml()}
      ${recapHeroHtml()}
    </div>

    ${foodDiaryHtml()}
    ${recordsSectionHtml()}
    ${muscleMapHtml()}
  `;

  container.querySelector('#workouts-row').addEventListener('click', () => navigate('#/storico'));
  container.querySelector('#measures-row').addEventListener('click', () => navigate('#/misure'));
  container.querySelector('#recap-row').addEventListener('click', () => navigate('#/resoconto'));
  container.querySelectorAll('[data-delete-meal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const meal = store.getMealsByDay(new Date().toISOString().slice(0, 10))
        .find((m) => m.id === btn.dataset.deleteMeal);
      if (!meal) return;
      confirmAction({
        title: 'Eliminare il pasto?',
        message: `"${meal.name}" (${Math.round(meal.totals.kcal || 0)} kcal) verrà tolto dal diario di oggi.`,
        confirmLabel: 'Elimina',
        onConfirm: () => {
          store.deleteMeal(meal.id);
          showToast('Pasto eliminato');
          render(container);
        },
      });
    });
  });

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
