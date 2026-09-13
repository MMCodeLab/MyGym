// Script classico (non un modulo ES): espone tutto su window.MyGym.views.monthlyRecap.
//
// Resoconto mensile: quello che in un mese e' successo davvero, in una
// schermata sola e in una figura colorata. Non si salva niente di nuovo, si
// rilegge lo storico degli allenamenti: cancellandone uno il resoconto cambia
// di conseguenza, che e' l'unico modo perche' resti onesto.
(function () {

const {
  store, icon, escapeHtml, navigate, showToast, MUSCLE_GROUPS,
  TIERS, STANDARDS, muscleScores, bodyFigureHtml, shareRecapCard,
} = window.MyGym;

let selectedMonth = null; // 'AAAA-MM', deciso al primo render
let sharing = false;

// Il mese si prende dall'ora locale e non dalla "Z" della data salvata: un
// allenamento dell'1 settembre alle 00:30 in Italia e' registrato come 31
// agosto alle 22:30 UTC e finirebbe nel mese sbagliato.
function monthKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
  const [anno, mese] = key.split('-');
  return new Date(Number(anno), Number(mese) - 1, 1)
    .toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
}

// Solo i mesi in cui ci si e' allenati: sfogliare mesi vuoti non racconta
// niente e allunga solo la strada per arrivare a quello buono.
function monthsWithWorkouts() {
  return [...new Set(store.get().workouts.map((w) => monthKey(w.date)))].sort();
}

function formatKg(value) {
  return Number(value || 0).toLocaleString('it-IT', { maximumFractionDigits: 0 });
}

function formatDuration(seconds) {
  const ore = Math.floor(seconds / 3600);
  const minuti = Math.round((seconds % 3600) / 60);
  if (!ore) return `${minuti} min`;
  return minuti ? `${ore}h ${minuti}m` : `${ore}h`;
}

function formatDay(iso) {
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
}

// ---------- I conti del mese ----------

function volumeOf(workouts) {
  return workouts.reduce((sum, w) => sum + w.exercises.reduce((s, e) => (
    e.kind === 'cardio' ? s : s + e.sets.reduce((x, set) => x + (set.reps || 0) * (set.weight || 0), 0)
  ), 0), 0);
}

// Quante serie per gruppo muscolare: e' la misura piu' leale di "quanto l'hai
// allenato", perche' non premia chi carica tanto su un esercizio solo.
function setsByMuscle(workouts) {
  const conteggio = {};
  MUSCLE_GROUPS.forEach((g) => { conteggio[g.key] = 0; });
  workouts.forEach((w) => {
    w.exercises.forEach((e) => {
      (e.muscles || []).forEach((key) => {
        if (conteggio[key] === undefined) return;
        conteggio[key] += e.sets.length;
      });
    });
  });
  return conteggio;
}

function recapFor(key) {
  const tutti = store.get().workouts;
  const delMese = tutti.filter((w) => monthKey(w.date) === key);
  const primaDelMese = tutti.filter((w) => monthKey(w.date) < key);
  const finoAlMese = tutti.filter((w) => monthKey(w.date) <= key);

  const scores = muscleScores(store.getMuscleBests(finoAlMese));
  const scoresPrima = muscleScores(store.getMuscleBests(primaDelMese));

  // Una medaglia e' "del mese" se il livello raggiunto a fine mese e' piu' alto
  // di quello che avevi il giorno prima che cominciasse.
  const medaglie = MUSCLE_GROUPS.filter((g) => STANDARDS[g.key]).map((g) => {
    const ora = TIERS.indexOf(scores[g.key].tier);
    const prima = TIERS.indexOf(scoresPrima[g.key].tier);
    return ora > prima ? { group: g, prima: TIERS[prima], ora: TIERS[ora] } : null;
  }).filter(Boolean);

  // I record si rileggono dalla storia gia' ricostruita dallo store: ogni voce
  // e' una volta in cui quel record e' stato alzato.
  const records = [];
  store.getPersonalRecords().forEach((r) => {
    r.history.forEach((voce, i) => {
      if (monthKey(voce.date) !== key) return;
      records.push({ name: r.name, primo: i === 0, ...voce });
    });
  });
  records.sort((a, b) => new Date(b.date) - new Date(a.date));

  const serie = setsByMuscle(delMese);
  // Solo i gruppi che assegnano medaglie: dire "hai trascurato il cardio" a chi
  // fa pesi non e' un rimprovero utile.
  const misurabili = MUSCLE_GROUPS.filter((g) => STANDARDS[g.key]);
  const ordinati = [...misurabili].sort((a, b) => serie[b.key] - serie[a.key]);

  return {
    key,
    workouts: delMese,
    allenamenti: delMese.length,
    secondi: delMese.reduce((s, w) => s + (w.durationSeconds || 0), 0),
    kg: Math.round(volumeOf(delMese)),
    scores,
    medaglie,
    records,
    piuAllenato: ordinati.length ? { group: ordinati[0], serie: serie[ordinati[0].key] } : null,
    piuTrascurato: ordinati.length ? { group: ordinati[ordinati.length - 1], serie: serie[ordinati[ordinati.length - 1].key] } : null,
  };
}

// ---------- Pezzi di interfaccia ----------

function monthPickerHtml(mesi, indice) {
  return `
    <div class="recap-month">
      <button class="icon-btn" id="recap-prev" ${indice <= 0 ? 'disabled' : ''} aria-label="Mese precedente">${icon('back')}</button>
      <span class="recap-month-label">${escapeHtml(monthLabel(mesi[indice]))}</span>
      <button class="icon-btn recap-next" id="recap-next" ${indice >= mesi.length - 1 ? 'disabled' : ''} aria-label="Mese successivo">${icon('back')}</button>
    </div>`;
}

function numbersHtml(r) {
  return `
    <div class="recap-numbers">
      <div class="recap-number">
        <span class="v">${r.allenamenti}</span>
        <span class="l">allenament${r.allenamenti === 1 ? 'o' : 'i'}</span>
      </div>
      <div class="recap-number">
        <span class="v">${formatDuration(r.secondi)}</span>
        <span class="l">in palestra</span>
      </div>
      <div class="recap-number">
        <span class="v">${formatKg(r.kg)}</span>
        <span class="l">kg sollevati</span>
      </div>
    </div>`;
}

function medalsHtml(r) {
  if (!r.medaglie.length) {
    return `<p class="muscle-note">Nessun passaggio di livello questo mese: le medaglie si alzano di rado, e va bene così.</p>`;
  }
  return `
    <div class="recap-medals">
      ${r.medaglie.map((m) => `
        <div class="recap-medal">
          <span class="recap-medal-emoji" style="background:${m.ora.color}22;border:1px solid ${m.ora.color}">${m.ora.emoji}</span>
          <span class="recap-medal-text">
            <span class="recap-medal-name">${escapeHtml(m.group.label)}</span>
            <span class="recap-medal-step">${m.prima.key === 'da-allenare'
              ? `prima medaglia · <strong style="color:${m.ora.color}">${escapeHtml(m.ora.label)}</strong>`
              : `${escapeHtml(m.prima.label)} → <strong style="color:${m.ora.color}">${escapeHtml(m.ora.label)}</strong>`}</span>
          </span>
        </div>`).join('')}
    </div>`;
}

function recordsHtml(r) {
  if (!r.records.length) {
    return `<p class="muscle-note">Nessun record battuto questo mese.</p>`;
  }
  return `
    <div class="food-list">
      ${r.records.map((rec) => `
        <div class="food-row food-row-readonly">
          <span class="food-name">${escapeHtml(rec.name)}<small>${rec.primo ? 'primo record' : 'record battuto'} · ${formatDay(rec.date)}</small></span>
          <span class="food-kcal">${Number(rec.weight).toLocaleString('it-IT', { maximumFractionDigits: 1 })} kg × ${rec.reps}</span>
        </div>`).join('')}
    </div>`;
}

function focusHtml(r) {
  if (!r.piuAllenato) return '';
  return `
    <div class="recap-focus">
      <div class="muscle-row">
        <span class="l">Più allenato</span>
        <span class="v">${escapeHtml(r.piuAllenato.group.label)}<br><small class="text-secondary">${r.piuAllenato.serie} serie</small></span>
      </div>
      <div class="muscle-row">
        <span class="l">Più trascurato</span>
        <span class="v">${escapeHtml(r.piuTrascurato.group.label)}<br><small class="text-secondary">${r.piuTrascurato.serie === 0 ? 'mai allenato' : `${r.piuTrascurato.serie} serie`}</small></span>
      </div>
    </div>`;
}

function emptyHtml(container) {
  container.innerHTML = `
    <div class="flex items-center gap-3">
      <button class="icon-btn" id="back-btn" aria-label="Indietro">${icon('back')}</button>
      <h1 class="section-title" style="margin:0">Resoconto</h1>
    </div>
    <div class="empty-state glass mt-4">
      <div class="empty-emoji">📅</div>
      <div class="empty-title">Ancora nessun allenamento</div>
      <div class="empty-text">Il resoconto riassume un mese di palestra: appena registri il primo allenamento comincia a riempirsi.</div>
    </div>`;
  container.querySelector('#back-btn').addEventListener('click', () => navigate('#/progressi'));
}

// ---------- Render ----------

function render(container) {
  const mesi = monthsWithWorkouts();
  if (!mesi.length) {
    emptyHtml(container);
    return;
  }

  // Di default il mese corrente. Se pero' non ci si e' ancora allenati si apre
  // sull'ultimo mese che ha qualcosa da raccontare, invece che su una pagina
  // vuota.
  const corrente = monthKey(new Date().toISOString());
  if (!selectedMonth || !mesi.includes(selectedMonth)) {
    selectedMonth = mesi.includes(corrente) ? corrente : mesi[mesi.length - 1];
  }
  const indice = mesi.indexOf(selectedMonth);
  const r = recapFor(selectedMonth);

  container.innerHTML = `
    <div class="flex items-center gap-3">
      <button class="icon-btn" id="back-btn" aria-label="Indietro">${icon('back')}</button>
      <h1 class="section-title" style="margin:0">Resoconto</h1>
    </div>
    <p class="section-subtitle">Com'è andato il mese, in una schermata sola.</p>

    ${monthPickerHtml(mesi, indice)}

    <div class="card glass mt-2">
      ${numbersHtml(r)}
    </div>

    <div class="page-section">
      <h3>Il tuo corpo a fine mese</h3>
      <div class="card glass muscle-map-card">
        <div class="body-figures">
          ${bodyFigureHtml('front', r.scores, { interactive: false })}
          ${bodyFigureHtml('back', r.scores, { interactive: false })}
        </div>
        <div class="muscle-legend">
          ${TIERS.map((t) => `<span><i style="background:${t.color}"></i>${t.label}</span>`).join('')}
        </div>
      </div>
    </div>

    <div class="page-section">
      <h3>Medaglie di questo mese</h3>
      <div class="card glass">${medalsHtml(r)}</div>
    </div>

    <div class="page-section">
      <h3>Record battuti</h3>
      <div class="card glass">${recordsHtml(r)}</div>
    </div>

    ${r.piuAllenato ? `
      <div class="page-section">
        <h3>Dove hai messo il lavoro</h3>
        <div class="card glass">${focusHtml(r)}</div>
      </div>` : ''}

    <button class="btn btn-primary btn-block mt-3" id="recap-share" ${sharing ? 'disabled' : ''}>
      ${icon('sparkles')} ${sharing ? 'Sto preparando l\'immagine…' : 'Condividi il resoconto'}
    </button>
    <p class="food-privacy">L'immagine si crea sul telefono e non passa da nessun server: la condividi tu, con chi vuoi.</p>
  `;

  container.querySelector('#back-btn').addEventListener('click', () => navigate('#/progressi'));

  container.querySelector('#recap-prev').addEventListener('click', () => {
    if (indice <= 0) return;
    selectedMonth = mesi[indice - 1];
    render(container);
  });
  container.querySelector('#recap-next').addEventListener('click', () => {
    if (indice >= mesi.length - 1) return;
    selectedMonth = mesi[indice + 1];
    render(container);
  });

  container.querySelector('#recap-share').addEventListener('click', async () => {
    if (sharing) return;
    sharing = true;
    render(container);
    try {
      // Alla card si passano i numeri gia' scritti come vanno letti: cosi'
      // l'immagine si limita a disegnare e le regole di formato restano qui.
      const esito = await shareRecapCard({
        titolo: monthLabel(r.key),
        allenamenti: r.allenamenti,
        tempo: formatDuration(r.secondi),
        kg: formatKg(r.kg),
        scores: r.scores,
        medaglie: r.medaglie,
      });
      if (esito === 'download') showToast('Immagine salvata tra i download');
    } catch (e) {
      showToast(e.message || 'Non sono riuscito a creare l\'immagine');
    } finally {
      sharing = false;
      render(container);
    }
  });
}

window.MyGym = window.MyGym || {};
window.MyGym.views = window.MyGym.views || {};
window.MyGym.views.monthlyRecap = { render };

})();
