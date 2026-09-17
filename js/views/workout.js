// Script classico (non un modulo ES): espone tutto su window.MyGym.views.workout.
(function () {

const { store, MUSCLE_GROUPS, muscleGroup, icon, escapeHtml, openModal, closeModal, showToast, confirmAction, navigate, findAutoExerciseMatch } = window.MyGym;

let currentContainer = null;
let justFinished = null; // record appena salvato, per mostrare il riepilogo
let tickInterval = null;
let restTickInterval = null;
let wakeLockSentinel = null;

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function currentElapsedMs(w) {
  return w.elapsedMs + (w.running ? Date.now() - w.startedAt : 0);
}

// Marca (o smarca) visivamente una serie come record personale, confrontandola
// con il meglio storico. Non mostra il toast: serve sia per il check silenzioso
// al render sia come base per la celebrazione al cambio valore. Ritorna true/false.
function evaluateSetRecord(entry, setIndex, row) {
  if (entry.kind === 'cardio') return false; // tempo e velocita' non fanno massimali
  const set = entry.sets[setIndex];
  const label = row.querySelector('.set-label');
  const isPr = !!(set && set.weight && set.reps &&
    store.checkPersonalRecord({ exerciseId: entry.exerciseId, name: entry.name, weight: set.weight, reps: set.reps })?.isRecord);
  row.classList.toggle('is-pr', isPr);
  if (label) label.innerHTML = (isPr ? icon('sparkles') : '') + `Serie ${setIndex + 1}`;
  return isPr;
}

// Ricontrolla tutte le serie gia' compilate (es. dopo un refresh a meta' allenamento
// o dopo aver aggiunto/rimosso un esercizio), senza celebrare nulla.
function markExistingRecords(container) {
  const w = store.getActiveWorkout();
  if (!w) return;
  container.querySelectorAll('.workout-exercise-card').forEach((card) => {
    const entry = w.exercises.find((e) => e.id === card.dataset.entryId);
    if (!entry) return;
    card.querySelectorAll('.set-row').forEach((row, i) => evaluateSetRecord(entry, i, row));
  });
}

// ---------- Timer di recupero ----------

function formatRestTime(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// Tiene lo schermo acceso mentre si riposa, cosi' non si blocca da solo per
// inattivita' prima che il timer finisca. Il browser rilascia da solo il
// wake lock quando la scheda va in background: non c'e' nulla da fare in
// quel caso, e' un limite della piattaforma (vedi nota nel README).
async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLockSentinel = await navigator.wakeLock.request('screen');
    wakeLockSentinel.addEventListener('release', () => { wakeLockSentinel = null; });
  } catch (e) {
    // negato o non disponibile in questo contesto: si procede comunque, il
    // countdown resta corretto perche' si basa sull'orario assoluto di fine
  }
}
function releaseWakeLock() {
  if (wakeLockSentinel) {
    wakeLockSentinel.release().catch(() => {});
    wakeLockSentinel = null;
  }
}

// Richiesta silenziosa e non bloccante, solo se non e' mai stata ne' concessa
// ne' negata: il timer parte comunque, la notifica e' solo un canale in piu'.
function requestRestNotificationPermissionIfNeeded() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

function fireRestTimerCompleteAlert() {
  if (typeof navigator.vibrate === 'function') navigator.vibrate([250, 100, 250, 100, 400]);

  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification('Tempo di recupero finito', {
        body: 'Torna alla prossima serie.',
        icon: 'icons/icon-192.png',
        tag: 'mygym-rest-timer',
        renotify: true,
        vibrate: [250, 100, 250, 100, 400],
      });
      n.onclick = () => { window.focus(); n.close(); };
    } catch (e) {
      // qualche browser puo' comunque rifiutare la notifica anche a permesso concesso
    }
  }

  showToast('⏱️ Tempo di recupero finito!');
}

function restProgressPct(remainingSec) {
  const total = store.get().restTimerSeconds || 90;
  return Math.max(0, Math.min(100, (remainingSec / total) * 100));
}

// Forma estesa: il rettangolo che si apre sotto il cronometro dell'allenamento
// quando si e' in cima alla pagina.
function restTimerBarHtml(restTimer) {
  const remainingSec = Math.ceil((restTimer.endTime - Date.now()) / 1000);
  return `
    <div class="rest-timer-running">
      <div class="rest-timer-progress-fill" id="rest-timer-progress-fill" style="width:${restProgressPct(remainingSec)}%"></div>
      <span class="rest-timer-icon">${icon('stopwatch')}</span>
      <div class="rest-timer-info">
        <span class="rest-timer-time" id="rest-timer-time">${formatRestTime(remainingSec)}</span>
        <span class="rest-timer-label">Recupero in corso…</span>
      </div>
      <button class="icon-btn icon-btn-sm" id="rest-timer-cancel-btn" aria-label="Annulla recupero">${icon('close')}</button>
    </div>
  `;
}

// Forma compatta: vive dentro la topbar sticky, accanto al tempo
// dell'allenamento, cosi' il recupero resta visibile anche scorrendo gli
// esercizi.
function restTimerMiniHtml(restTimer) {
  const remainingSec = Math.ceil((restTimer.endTime - Date.now()) / 1000);
  return `
    <button class="rest-mini" id="rest-mini-btn" aria-label="Tempo di recupero: torna in cima">
      <span class="rest-mini-fill" id="rest-mini-fill" style="width:${restProgressPct(remainingSec)}%"></span>
      <span class="rest-mini-icon">${icon('stopwatch')}</span>
      <span class="rest-mini-time" id="rest-mini-time">${formatRestTime(remainingSec)}</span>
    </button>
  `;
}

let restCompact = false; // forma corrente del timer: chip nella topbar o barra estesa
let restScrollRaf = null;

// La forma compatta subentra quando la barra estesa finirebbe sotto la topbar
// sticky. La soglia si calcola sulle posizioni statiche (offsetTop), non sui
// rect correnti: la barra resta nel flusso e sfuma senza collassare, cosi' il
// passaggio tra le due forme non sposta mai il contenuto sotto.
function updateRestCompact(container) {
  const bar = container.querySelector('#rest-timer-bar');
  const topbar = container.querySelector('#workout-topbar');
  if (!bar || !topbar) return;

  if (!bar.classList.contains('is-active')) {
    bar.classList.remove('is-collapsed');
    topbar.classList.remove('has-rest-mini');
    return;
  }

  const stickyTop = parseFloat(topbar.style.top) || 0;
  // Si passa al chip quando la barra e' scivolata sotto la topbar per la maggior
  // parte: cosi' lo spazio che lascia libero sfumando resta minimo.
  const triggerY = Math.max(0, bar.offsetTop + bar.offsetHeight * 0.6 - topbar.offsetHeight - stickyTop);
  const compact = window.scrollY > triggerY;
  bar.classList.toggle('is-collapsed', compact);
  topbar.classList.toggle('has-rest-mini', compact);

  // L'animazione d'ingresso del chip parte solo al passaggio esteso -> compatto:
  // renderActive ricrea la topbar a ogni modifica (serie, muscoli, pausa...) e
  // senza questo flag il chip "rimbalzerebbe" a ogni ridisegno.
  if (compact && !restCompact) {
    const mini = topbar.querySelector('.rest-mini');
    if (mini) mini.classList.add('is-entering');
  }
  restCompact = compact;
}

function onRestScroll() {
  if (restScrollRaf) return;
  restScrollRaf = requestAnimationFrame(() => {
    restScrollRaf = null;
    if (currentContainer) updateRestCompact(currentContainer);
  });
}
window.addEventListener('scroll', onRestScroll, { passive: true });
window.addEventListener('resize', onRestScroll);

function startRestTimer(container) {
  store.startRestTimer(store.get().restTimerSeconds || 90);
  requestRestNotificationPermissionIfNeeded();
  acquireWakeLock();
  renderRestTimerBar(container);
}

// Ridisegna il timer di recupero nelle sue due forme (senza toccare il resto
// dello schermo allenamento) e gestisce il proprio giro di aggiornamento: il
// tempo rimasto si ricalcola sempre dall'orario assoluto di fine, mai da un
// contatore che scala, cosi' resta corretto anche se il tick e' arrivato in
// ritardo (tab in background, dispositivo rallentato, ecc.).
function renderRestTimerBar(container) {
  const bar = container.querySelector('#rest-timer-bar');
  const miniSlot = container.querySelector('#rest-mini-slot');
  const circleBtn = container.querySelector('#rest-timer-circle-btn');
  if (!bar || !miniSlot) return;
  clearInterval(restTickInterval);

  const w = store.getActiveWorkout();
  const restTimer = w && w.restTimer;

  if (restTimer && restTimer.endTime <= Date.now()) {
    store.clearRestTimer();
    releaseWakeLock();
    fireRestTimerCompleteAlert();
    renderRestTimerBar(container);
    return;
  }

  if (!restTimer) {
    releaseWakeLock();
    bar.innerHTML = '';
    miniSlot.innerHTML = '';
    bar.classList.remove('is-active');
    if (circleBtn) circleBtn.classList.remove('is-running');
    updateRestCompact(container);
    return;
  }

  bar.innerHTML = restTimerBarHtml(restTimer);
  miniSlot.innerHTML = restTimerMiniHtml(restTimer);
  bar.classList.add('is-active');
  if (circleBtn) circleBtn.classList.add('is-running');
  updateRestCompact(container);

  bar.querySelector('#rest-timer-cancel-btn').addEventListener('click', () => {
    store.clearRestTimer();
    releaseWakeLock();
    renderRestTimerBar(container);
  });

  // Dal chip compatto si torna in cima, dove c'e' la barra estesa con
  // l'annulla: il chip da solo e' troppo piccolo per un tasto distruttivo.
  miniSlot.querySelector('#rest-mini-btn').addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  restTickInterval = setInterval(() => {
    const active = store.getActiveWorkout();
    const timer = active && active.restTimer;
    if (!timer) { clearInterval(restTickInterval); releaseWakeLock(); return; }

    const remainingMs = timer.endTime - Date.now();
    if (remainingMs <= 0) {
      clearInterval(restTickInterval);
      store.clearRestTimer();
      releaseWakeLock();
      fireRestTimerCompleteAlert();
      renderRestTimerBar(container);
      return;
    }

    const remainingSec = Math.ceil(remainingMs / 1000);
    const label = formatRestTime(remainingSec);
    const pct = `${restProgressPct(remainingSec)}%`;
    const timeEl = bar.querySelector('#rest-timer-time');
    const fillEl = bar.querySelector('#rest-timer-progress-fill');
    const miniTimeEl = miniSlot.querySelector('#rest-mini-time');
    const miniFillEl = miniSlot.querySelector('#rest-mini-fill');
    if (timeEl) timeEl.textContent = label;
    if (fillEl) fillEl.style.width = pct;
    if (miniTimeEl) miniTimeEl.textContent = label;
    if (miniFillEl) miniFillEl.style.width = pct;
  }, 250);
}

// Il wake lock viene rilasciato dal browser quando la scheda va in
// background: quando torna visibile, lo riprendiamo e ri-sincronizziamo
// subito la barra (utile anche se il timer e' scaduto nel frattempo).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const w = store.getActiveWorkout();
  if (w && w.restTimer && currentContainer) {
    acquireWakeLock();
    renderRestTimerBar(currentContainer);
  }
});

function startTicking() {
  clearInterval(tickInterval);
  tickInterval = setInterval(() => {
    const el = document.getElementById('stopwatch-time');
    const w = store.getActiveWorkout();
    if (!el || !w) {
      clearInterval(tickInterval);
      return;
    }
    el.textContent = formatElapsed(currentElapsedMs(w));
  }, 1000);
}

// ---------- Schermata 1: scelta del giorno ----------

function pad2(n) { return String(n).padStart(2, '0'); }
// Il giorno in ora locale, non quello UTC della data salvata: un allenamento
// finito a mezzanotte e mezza e' di quel giorno, non del precedente.
function dateKey(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

const WEEKDAY_LABELS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

// La settimana in corso, da lunedi' a domenica, con gli stessi pallini del
// calendario di Progressi: prima di scegliere si vede se si e' in pari.
function weekStripHtml(workouts) {
  const trained = new Set(workouts.map((w) => dateKey(new Date(w.date))));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));

  let count = 0;
  const cells = WEEKDAY_LABELS.map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const filled = trained.has(dateKey(d));
    if (filled) count += 1;
    const cls = filled ? 'streak-cell-filled' : (d > today ? 'streak-cell-future' : 'streak-cell-empty');
    const isToday = d.getTime() === today.getTime();
    return `<span class="streak-cell ${cls}${isToday ? ' streak-cell-today' : ''}">${d.getDate()}</span>`;
  }).join('');

  return `
    <div class="card glass chart-card">
      <div class="flex items-center justify-between" style="margin-bottom:10px">
        <span style="font-weight:700;font-size:0.9rem">Questa settimana</span>
        <span class="text-secondary" style="font-size:0.78rem">${count ? `${count} allenament${count === 1 ? 'o' : 'i'}` : 'ancora nessun allenamento'}</span>
      </div>
      <div class="streak-weekdays">${WEEKDAY_LABELS.map((l) => `<span>${l}</span>`).join('')}</div>
      <div class="streak-grid">${cells}</div>
    </div>
  `;
}

// Un allenamento appartiene a un giorno dal suo id; quelli salvati prima che
// l'id venisse registrato si riconoscono dal nome.
function workoutOfDay(w, day) {
  return w.dayId ? w.dayId === day.id : w.weekday === day.name;
}

// workouts va dal piu' recente al piu' vecchio (store.getWorkouts).
function lastTimeLabel(day, workouts) {
  const last = workouts.find((w) => workoutOfDay(w, day));
  if (!last) return 'mai fatto';
  const then = new Date(last.date);
  then.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today - then) / 86400000);
  if (days <= 0) return 'fatto oggi';
  if (days === 1) return 'ultima volta ieri';
  return `ultima volta ${days} giorni fa`;
}

// Il giorno che tocca e' quello dopo l'ultimo allenato, nell'ordine in cui
// sono messi i giorni: chi segue una scheda a rotazione la ritrova da sola,
// senza doversi ricordare dove era arrivato.
function nextDayId(days, workouts) {
  for (const w of workouts) {
    const i = days.findIndex((d) => workoutOfDay(w, d));
    if (i !== -1) return days[(i + 1) % days.length].id;
  }
  return days[0].id;
}

function pickDayCardHtml(day, { selected, next, lastLabel }) {
  const exercises = day.entries.map((e) => store.getExercise(e.exerciseId)).filter(Boolean);
  const groups = [...new Set(exercises.flatMap((ex) => ex.muscleGroups || []))];
  const badges = groups.slice(0, 4).map((key) => {
    const mg = muscleGroup(key);
    return `<span class="badge" style="background:${mg.color}">${escapeHtml(mg.label)}</span>`;
  }).join('') + (groups.length > 4 ? `<span class="badge" style="background:var(--mg-altro)">+${groups.length - 4}</span>` : '');
  const thumbs = exercises.slice(0, 4).map((ex) => `
    <span class="pick-day-thumb">${ex.imageUrl ? `<img src="${escapeHtml(ex.imageUrl)}" alt="" loading="lazy" draggable="false" />` : icon('dumbbell')}</span>
  `).join('') + (exercises.length > 4 ? `<span class="pick-day-thumb pick-day-thumb-more">+${exercises.length - 4}</span>` : '');
  const count = exercises.length
    ? `${exercises.length} eserciz${exercises.length === 1 ? 'io' : 'i'}`
    : 'Nessun esercizio nella scheda';

  return `
    <div class="card glass pick-day-card${selected ? ' selected' : ''}" data-day-id="${day.id}" role="button" aria-pressed="${selected}">
      <div class="pick-day-head">
        <span class="pick-day-name">${escapeHtml(day.name)}</span>
        ${next ? '<span class="badge badge-next">Tocca a questo</span>' : ''}
        <span class="pick-day-check">${icon('check')}</span>
      </div>
      <span class="day-card-meta">${count} · ${lastLabel}</span>
      ${exercises.length ? `<div class="pick-day-thumbs">${thumbs}</div>` : ''}
      ${groups.length ? `<div class="day-card-chips">${badges}</div>` : ''}
    </div>
  `;
}

function renderPickDay(container) {
  const { days } = store.get();

  if (!days.length) {
    container.innerHTML = `
      <h1 class="section-title">Inizia allenamento</h1>
      <div class="empty-state glass mt-4">
        <div class="empty-emoji">📅</div>
        <div class="empty-title">Nessun giorno creato</div>
        <div class="empty-text">Prima di iniziare un allenamento devi creare almeno un giorno nella sezione "Giorni" (es. Lunedì) e aggiungere gli esercizi che vuoi fare quel giorno.</div>
        <button class="btn btn-primary" id="go-to-days-btn">Vai a "Giorni"</button>
      </div>
    `;
    container.querySelector('#go-to-days-btn').addEventListener('click', () => navigate('#/'));
    return;
  }

  const workouts = store.getWorkouts();
  const suggestedId = nextDayId(days, workouts);
  // Il giorno che tocca parte gia' scelto: nel caso normale basta un tocco
  // su "Inizia".
  let selectedDayId = suggestedId;
  const startLabel = () => {
    const day = days.find((d) => d.id === selectedDayId);
    return `${icon('play')}<span class="pick-day-start-label">Inizia ${escapeHtml(day ? day.name : 'allenamento')}</span>`;
  };

  container.innerHTML = `
    <h1 class="section-title">Inizia allenamento</h1>
    <p class="section-subtitle">Quale giorno vuoi allenare?</p>
    ${weekStripHtml(workouts)}
    <div class="pick-day-list" id="day-grid">
      ${days.map((d) => pickDayCardHtml(d, {
        selected: d.id === selectedDayId,
        next: d.id === suggestedId,
        lastLabel: lastTimeLabel(d, workouts),
      })).join('')}
    </div>
    <button class="btn btn-primary btn-block pick-day-start" id="start-workout-btn">${startLabel()}</button>
  `;

  const grid = container.querySelector('#day-grid');
  const startBtn = container.querySelector('#start-workout-btn');

  grid.querySelectorAll('[data-day-id]').forEach((card) => {
    card.addEventListener('click', () => {
      selectedDayId = card.dataset.dayId;
      grid.querySelectorAll('[data-day-id]').forEach((c) => {
        c.classList.toggle('selected', c === card);
        c.setAttribute('aria-pressed', c === card ? 'true' : 'false');
      });
      startBtn.innerHTML = startLabel();
    });
  });

  startBtn.addEventListener('click', () => {
    if (!selectedDayId) return;
    store.startActiveWorkout(selectedDayId);
    render(container);
  });
}

// ---------- Schermata 2: allenamento in corso ----------

function muscleMultiChipsHtml(entryId, selected) {
  return MUSCLE_GROUPS.map((mg) => `
    <span class="chip ${selected.includes(mg.key) ? 'selected' : ''}" data-mg="${mg.key}" data-entry="${entryId}"
      style="${selected.includes(mg.key) ? `background:${mg.color};` : ''}">
      ${escapeHtml(mg.label)}
    </span>
  `).join('');
}

// ---------- Suggerimento del carico ----------

// I dischi piu' piccoli che si trovano in una palestra normale sono da 1,25 kg
// per lato: suggerire 61,3 kg vorrebbe dire suggerire un peso che nessuno puo'
// caricare davvero.
function roundToPlate(kg) {
  return Math.round(kg / 2.5) * 2.5;
}

// Progressione volutamente elementare: se l'ultima volta hai chiuso almeno 8
// ripetizioni sei pronto ad aggiungere carico, altrimenti resti sul peso e ne
// aggiungi una. Niente parametri da configurare, perche' un suggerimento che si
// capisce a colpo d'occhio viene seguito, uno perfetto ma da impostare no.
function suggestFromLast(last) {
  if (!last || !last.weight || !last.reps) return null;
  return last.reps >= 8
    ? { weight: roundToPlate(last.weight + 2.5), reps: last.reps }
    : { weight: last.weight, reps: last.reps + 1 };
}

function loadSuggestionHtml(entry) {
  if (entry.kind === 'cardio') return '';
  const last = store.lastPerformance(entry.exerciseId, entry.name);
  const next = suggestFromLast(last);
  if (!next) return ''; // prima volta con questo esercizio: non c'e' niente da confrontare

  // Le ripetizioni si ripetono solo quando cambiano: "prova 62,5 kg" si legge
  // piu' in fretta di "prova 62,5 kg x 8" quando le 8 sono le stesse di prima.
  const consiglio = next.reps === last.reps
    ? `prova ${formatNumber(next.weight)} kg`
    : `prova ${formatNumber(next.weight)} kg × ${next.reps}`;
  const testo = `Ultima volta ${formatNumber(last.weight)} kg × ${last.reps} → ${consiglio}`;

  // Con tutte le serie gia' compilate non c'e' niente da riempire: la riga
  // resta un'informazione e smette di essere un pulsante che non fa niente.
  const vuota = entry.sets.findIndex((s) => s.reps == null && s.weight == null);
  if (vuota === -1) return `<p class="set-suggestion">${escapeHtml(testo)}</p>`;

  return `<button class="set-suggestion is-tappable" data-suggest="${entry.id}" data-suggest-index="${vuota}"
    data-suggest-reps="${next.reps}" data-suggest-weight="${next.weight}"
    title="Tocca per compilare la serie ${vuota + 1}">${escapeHtml(testo)}</button>`;
}

// Sul tapis roulant (e in genere sul cardio) chiedere carico e ripetizioni non
// ha senso: la stessa riga cambia i due campi in tempo e velocita' media.
function setFieldsHtml(entry, set, index) {
  const attrs = (field) => `data-set-field="${field}" data-entry="${entry.id}" data-index="${index}"`;
  if (entry.kind === 'cardio') {
    return `
      <input type="text" inputmode="decimal" class="input input-set" placeholder="min" value="${set.minutes ?? ''}" ${attrs('minutes')} />
      <span class="set-unit">min</span>
      <input type="text" inputmode="decimal" class="input input-set" placeholder="km/h" value="${set.speed ?? ''}" ${attrs('speed')} />
      <span class="set-unit">km/h</span>
    `;
  }
  return `
    <input type="text" inputmode="decimal" class="input input-set" placeholder="reps" value="${set.reps ?? ''}" ${attrs('reps')} />
    <span class="set-x">×</span>
    <input type="text" inputmode="decimal" class="input input-set" placeholder="kg" value="${set.weight ?? ''}" ${attrs('weight')} />
    <span class="set-unit">kg</span>
  `;
}

function setRowHtml(entry, set, index, total) {
  return `
    <div class="set-row">
      <span class="set-label">Serie ${index + 1}</span>
      ${setFieldsHtml(entry, set, index)}
      ${total > 1
        ? `<button class="icon-btn danger set-remove-btn" data-remove-set data-entry="${entry.id}" data-index="${index}" aria-label="Rimuovi serie">${icon('trash')}</button>`
        : `<span class="set-remove-spacer"></span>`}
    </div>
  `;
}

function exerciseEntryHtml(entry, extra) {
  const isCardio = entry.kind === 'cardio';
  return `
    <div class="card glass workout-exercise-card" data-entry-id="${entry.id}">
      <div class="flex items-center justify-between gap-2">
        <input type="text" class="input workout-exercise-name" value="${escapeHtml(entry.name)}" data-rename="${entry.id}" maxlength="60" />
        <button class="icon-btn kind-toggle-btn${isCardio ? ' is-cardio' : ''}" data-toggle-kind="${entry.id}"
          aria-label="${isCardio ? 'Passa a ripetizioni e carico' : 'Passa a tempo e velocità'}"
          title="${isCardio ? 'Ora chiede tempo e velocità: tocca per tornare a ripetizioni e carico' : 'Ora chiede ripetizioni e carico: tocca per passare a tempo e velocità'}">${icon(isCardio ? 'stopwatch' : 'esercizi')}</button>
        <button class="icon-btn danger" data-remove-exercise="${entry.id}" aria-label="Rimuovi esercizio">${icon('trash')}</button>
      </div>
      ${extra ? '<span class="badge badge-extra workout-extra-badge">Extra · fuori dalla scheda</span>' : ''}
      <div class="chip-row mt-2" data-muscle-picker="${entry.id}">
        ${muscleMultiChipsHtml(entry.id, entry.muscles)}
      </div>
      ${loadSuggestionHtml(entry)}
      <div class="sets-list mt-3">
        ${entry.sets.map((s, i) => setRowHtml(entry, s, i, entry.sets.length)).join('')}
      </div>
      <button class="btn btn-glass btn-sm mt-2" data-add-set="${entry.id}">${icon('plus')} Serie</button>
    </div>
  `;
}

// Gli esercizi liberi (digitati a mano, senza scheda in libreria) non hanno un
// id: si confrontano per nome, cosi' "Panca piana" scritto a mano e la "Panca
// piana" della libreria contano come lo stesso esercizio.
function exerciseKey(exerciseId, name) {
  return exerciseId || `free:${(name || '').trim().toLowerCase()}`;
}

// Esercizi gia' presenti nell'allenamento in corso: nella finestra di scelta
// vengono mostrati in grigio, per non rifarli per sbaglio.
function doneExerciseKeys() {
  const w = store.getActiveWorkout();
  if (!w) return new Set();
  const keys = new Set();
  w.exercises.forEach((e) => {
    keys.add(exerciseKey(e.exerciseId, e.name));
    keys.add(exerciseKey(null, e.name));
  });
  return keys;
}

// Chiavi degli esercizi nella scheda di un giorno, con le regole di
// exerciseKey: uno scritto a mano con lo stesso nome di uno della scheda e' lo
// stesso esercizio, non un extra.
function dayPlanKeys(day) {
  const keys = new Set();
  if (!day) return keys;
  day.entries.forEach((entry) => {
    const ex = store.getExercise(entry.exerciseId);
    if (!ex) return;
    keys.add(exerciseKey(ex.id, ex.name));
    keys.add(exerciseKey(null, ex.name));
  });
  return keys;
}

// "Extra" e' quello che si fa in piu' rispetto alla scheda del giorno. Non si
// salva da nessuna parte: si ricava confrontando con la scheda, cosi' resta
// giusto anche se la scheda cambia a meta' allenamento.
function isExtra(planKeys, exerciseId, name) {
  return !planKeys.has(exerciseKey(exerciseId, name)) && !planKeys.has(exerciseKey(null, name));
}

function exercisePickCardHtml(ex, done, extra) {
  const thumb = ex.imageUrl ? `<img src="${escapeHtml(ex.imageUrl)}" alt="" loading="lazy" draggable="false" />` : icon('dumbbell');
  const badges = (ex.muscleGroups || []).map((key) => {
    const mg = muscleGroup(key);
    return `<span class="badge" style="background:${mg.color}">${escapeHtml(mg.label)}</span>`;
  }).join(' ');
  const doneBadge = done ? `<span class="badge badge-done">${icon('check')} Già fatto</span>` : '';
  const extraBadge = extra ? '<span class="badge badge-extra">Extra</span>' : '';
  return `
    <div class="card exercise-card glass ${done ? 'is-done' : ''}" data-pick-exercise="${ex.id}">
      <div class="exercise-thumb">${thumb}</div>
      <div class="exercise-info">
        <div class="exercise-name">${escapeHtml(ex.name)}</div>
        <div class="flex gap-2" style="flex-wrap:wrap">${doneBadge}${extraBadge}${badges}</div>
      </div>
    </div>
  `;
}

function openAddExerciseModal(initialQuery) {
  const { exercises } = store.get();
  const activeWorkout = store.getActiveWorkout();
  const day = activeWorkout && activeWorkout.dayId ? store.getDay(activeWorkout.dayId) : null;
  const suggested = day
    ? day.entries.map((e) => store.getExercise(e.exerciseId)).filter(Boolean)
    : [];
  const done = doneExerciseKeys();
  const isDone = (exerciseId, name) => done.has(exerciseKey(exerciseId, name)) || done.has(exerciseKey(null, name));
  const planKeys = dayPlanKeys(day);
  // L'etichetta "Extra" serve solo nei risultati della ricerca, dove la scheda
  // e il resto della libreria sono mescolati. Con la scheda vuota tutto
  // sarebbe extra, e l'etichetta non direbbe niente.
  const cardHtml = (ex, markExtra) => exercisePickCardHtml(ex, isDone(ex.id, ex.name),
    markExtra && planKeys.size > 0 && isExtra(planKeys, ex.id, ex.name));

  const renderList = (filterText) => {
    const q = (filterText || '').trim().toLowerCase();

    if (!q && suggested.length) {
      // Sotto la scheda c'e' il resto della libreria: gli esercizi fatti in
      // piu' si trovano scorrendo, senza dover sapere che vanno cercati.
      const others = exercises.filter((ex) => isExtra(planKeys, ex.id, ex.name));
      return `
        <p class="text-secondary" style="font-size:0.8rem;margin:0 0 8px">Esercizi di "${escapeHtml(day.name)}"</p>
        ${suggested.map((ex) => cardHtml(ex, false)).join('')}
        <p class="text-secondary" style="font-size:0.8rem;margin:20px 0 8px">Extra — fuori dalla scheda</p>
        ${others.map((ex) => cardHtml(ex, false)).join('')}
        <p class="text-secondary text-center" style="font-size:0.8rem;margin:8px 0 0">Non lo trovi? Scrivi il nome qui sopra per aggiungerlo.</p>
      `;
    }

    const matches = q.length ? exercises.filter((ex) => ex.name.toLowerCase().includes(q)) : exercises;
    const listHtml = matches.length
      ? matches.map((ex) => cardHtml(ex, true)).join('')
      : `<p class="text-secondary text-center mt-4">Nessun esercizio trovato nella libreria.</p>`;

    const freeButton = q.length >= 2
      ? `<button class="btn btn-glass btn-block mt-2" id="add-free-exercise-btn">${icon('plus')} Aggiungi "${escapeHtml(filterText.trim())}" come esercizio libero</button>`
      : '';

    return listHtml + freeButton;
  };

  openModal({
    title: 'Aggiungi esercizio',
    bodyHtml: `
      <input type="text" class="input" id="pick-search" inputmode="search" enterkeyhint="search" placeholder="Cerca in tutta la libreria..." style="margin-bottom:12px" value="${escapeHtml(initialQuery || '')}" />
      <div id="pick-list">${renderList(initialQuery || '')}</div>
    `,
    onMount: (body) => {
      const listEl = body.querySelector('#pick-list');
      const searchInput = body.querySelector('#pick-search');
      searchInput.focus();

      function addExercise({ exerciseId, name }) {
        const ex = exerciseId ? store.getExercise(exerciseId) : null;
        store.addActiveWorkoutExercise({
          exerciseId: exerciseId || null,
          name,
          muscles: ex ? [...(ex.muscleGroups || [])] : [],
          // Per un esercizio libero il tipo lo indovina lo store dal nome.
          kind: ex ? ex.kind : undefined,
        });
        closeModal();
        renderCurrent();
      }

      // Su un esercizio gia' segnato si chiede conferma invece di aggiungerlo
      // di slancio. Annullando si torna alla lista com'era: openModal riusa un
      // solo contenitore, quindi la finestra di scelta va riaperta.
      function pickExercise({ exerciseId, name }) {
        if (!isDone(exerciseId, name)) {
          addExercise({ exerciseId, name });
          return;
        }
        const query = searchInput.value;
        confirmAction({
          title: 'Esercizio già svolto',
          message: 'Hai già svolto questo esercizio, confermi di volerlo aggiungere comunque?',
          confirmLabel: 'Aggiungi comunque',
          danger: false,
          onConfirm: () => addExercise({ exerciseId, name }),
          onCancel: () => openAddExerciseModal(query),
        });
      }

      function bind() {
        listEl.querySelectorAll('[data-pick-exercise]').forEach((card) => {
          card.addEventListener('click', () => {
            const ex = store.getExercise(card.dataset.pickExercise);
            if (ex) pickExercise({ exerciseId: ex.id, name: ex.name });
          });
        });
        const freeBtn = listEl.querySelector('#add-free-exercise-btn');
        if (freeBtn) {
          freeBtn.addEventListener('click', () => pickExercise({ exerciseId: null, name: searchInput.value.trim() }));
        }
      }
      bind();

      searchInput.addEventListener('input', () => {
        listEl.innerHTML = renderList(searchInput.value);
        bind();
      });
    },
  });
}

function renderActive(container) {
  const w = store.getActiveWorkout();
  const planKeys = dayPlanKeys(w.dayId ? store.getDay(w.dayId) : null);

  const exercisesHtml = w.exercises.length
    ? w.exercises.map((e) => exerciseEntryHtml(e, planKeys.size > 0 && isExtra(planKeys, e.exerciseId, e.name))).join('')
    : `
      <div class="empty-state glass">
        <div class="empty-emoji">💪</div>
        <div class="empty-title">Nessun esercizio ancora</div>
        <div class="empty-text">Aggiungi il primo esercizio che stai per fare.</div>
      </div>
    `;

  container.innerHTML = `
    <div class="workout-topbar glass" id="workout-topbar">
      <div class="workout-topbar-left">
        <div class="stopwatch">
          <span class="stopwatch-icon">${icon('stopwatch')}</span>
          <span class="stopwatch-time" id="stopwatch-time">${formatElapsed(currentElapsedMs(w))}</span>
        </div>
        <div class="rest-mini-slot" id="rest-mini-slot"></div>
      </div>
      <div class="workout-topbar-actions">
        <button class="icon-btn rest-circle-btn" id="rest-timer-circle-btn" aria-label="Avvia tempo di recupero" title="Tempo di recupero">${icon('stopwatch')}</button>
        <button class="icon-btn" id="stopwatch-toggle" aria-label="${w.running ? 'Pausa' : 'Riprendi'}">${icon(w.running ? 'pause' : 'play')}</button>
        <button class="btn btn-danger btn-sm" id="finish-workout-btn" aria-label="Termina l'allenamento">${icon('flag')}<span class="btn-label">Termina</span></button>
      </div>
    </div>
    <div class="rest-timer-bar glass" id="rest-timer-bar"></div>
    <div class="flex items-center justify-between">
      <p class="section-subtitle" style="margin:0">Allenamento di <strong>${escapeHtml(w.weekday)}</strong></p>
      <button class="chip" id="cancel-workout-btn" style="color:var(--danger)">Annulla</button>
    </div>
    <div id="workout-exercises-list" class="mt-2">${exercisesHtml}</div>
    <button class="btn btn-glass btn-block mt-2" id="add-exercise-btn">${icon('plus')} Aggiungi esercizio</button>
  `;

  const topbarEl = document.querySelector('.topbar');
  const workoutTopbar = document.getElementById('workout-topbar');
  if (topbarEl && workoutTopbar) {
    workoutTopbar.style.top = `${topbarEl.offsetHeight + 8}px`;
  }

  if (w.running) startTicking();
  markExistingRecords(container);
  renderRestTimerBar(container);

  container.querySelector('#rest-timer-circle-btn').addEventListener('click', () => startRestTimer(container));

  container.querySelector('#stopwatch-toggle').addEventListener('click', () => {
    const active = store.getActiveWorkout();
    if (!active) return;
    if (active.running) {
      store.updateActiveWorkout({ running: false, elapsedMs: currentElapsedMs(active) });
    } else {
      store.updateActiveWorkout({ running: true, startedAt: Date.now() });
    }
    renderActive(container);
  });

  container.querySelector('#cancel-workout-btn').addEventListener('click', () => {
    confirmAction({
      title: 'Annullare l\'allenamento?',
      message: 'Tutti gli esercizi registrati finora andranno persi.',
      confirmLabel: 'Annulla allenamento',
      onConfirm: () => {
        clearInterval(tickInterval);
        clearInterval(restTickInterval);
        releaseWakeLock();
        store.discardActiveWorkout();
        showToast('Allenamento annullato');
        render(container);
      },
    });
  });

  container.querySelector('#finish-workout-btn').addEventListener('click', () => {
    if (!w.exercises.length) {
      showToast('Aggiungi almeno un esercizio prima di terminare');
      return;
    }
    confirmAction({
      title: 'Terminare l\'allenamento?',
      message: 'Il cronometro si fermerà e l\'allenamento verrà salvato nello storico.',
      confirmLabel: 'Termina',
      danger: false,
      onConfirm: () => {
        clearInterval(tickInterval);
        clearInterval(restTickInterval);
        releaseWakeLock();
        justFinished = store.finishActiveWorkout();
        showToast('Allenamento salvato');
        render(container);
        openExtrasToDayModal(justFinished);
      },
    });
  });

  container.querySelector('#add-exercise-btn').addEventListener('click', () => openAddExerciseModal());

  container.querySelectorAll('[data-rename]').forEach((input) => {
    input.addEventListener('blur', () => {
      const val = input.value.trim();
      if (val) store.updateActiveWorkoutExercise(input.dataset.rename, { name: val });
      else render(container);
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  });

  // Il cestino sta a pochi millimetri dai campi che si compilano durante la
  // serie: senza conferma un tocco storto cancella il lavoro appena segnato.
  container.querySelectorAll('[data-toggle-kind]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const entryId = btn.dataset.toggleKind;
      const entry = store.getActiveWorkout().exercises.find((e) => e.id === entryId);
      if (!entry) return;
      const next = entry.kind === 'cardio' ? 'forza' : 'cardio';
      store.setActiveWorkoutExerciseKind(entryId, next);
      showToast(next === 'cardio' ? 'Ora chiede tempo e velocità' : 'Ora chiede ripetizioni e carico');
      renderActive(container);
    });
  });

  container.querySelectorAll('[data-remove-exercise]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const entry = store.getActiveWorkout().exercises.find((e) => e.id === btn.dataset.removeExercise);
      if (!entry) return;
      confirmAction({
        title: 'Rimuovere l\'esercizio?',
        message: `"${entry.name}" e le serie che hai segnato verranno tolti da questo allenamento.`,
        confirmLabel: 'Rimuovi',
        onConfirm: () => {
          store.removeActiveWorkoutExercise(entry.id);
          renderActive(container);
        },
      });
    });
  });

  container.querySelectorAll('[data-muscle-picker] [data-mg]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const entryId = chip.dataset.entry;
      const entry = store.getActiveWorkout().exercises.find((e) => e.id === entryId);
      if (!entry) return;
      const set = new Set(entry.muscles);
      const key = chip.dataset.mg;
      if (set.has(key)) set.delete(key); else set.add(key);
      store.updateActiveWorkoutExercise(entryId, { muscles: [...set] });
      renderActive(container);
    });
  });

  container.querySelectorAll('[data-add-set]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.addActiveWorkoutSet(btn.dataset.addSet);
      renderActive(container);
    });
  });

  container.querySelectorAll('[data-suggest]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.updateActiveWorkoutSet(btn.dataset.suggest, Number(btn.dataset.suggestIndex), {
        reps: Number(btn.dataset.suggestReps),
        weight: Number(btn.dataset.suggestWeight),
      });
      renderActive(container);
    });
  });

  container.querySelectorAll('[data-remove-set]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const entryId = btn.dataset.entry;
      const index = Number(btn.dataset.index);
      const entry = store.getActiveWorkout().exercises.find((e) => e.id === entryId);
      const set = entry && entry.sets[index];
      if (!set) return;
      const done = entry.kind === 'cardio'
        ? (set.minutes && set.speed ? ` (${set.minutes} min a ${set.speed} km/h)` : '')
        : (set.reps && set.weight ? ` (${set.reps} reps × ${set.weight} kg)` : '');
      confirmAction({
        title: 'Rimuovere la serie?',
        message: `La serie ${index + 1}${done} di "${entry.name}" verrà tolta da questo allenamento.`,
        confirmLabel: 'Rimuovi',
        onConfirm: () => {
          store.removeActiveWorkoutSet(entryId, index);
          renderActive(container);
        },
      });
    });
  });

  container.querySelectorAll('[data-set-field]').forEach((input) => {
    input.addEventListener('change', () => {
      const raw = input.value.trim().replace(',', '.');
      const parsed = raw === '' ? null : parseFloat(raw);
      const value = parsed === null || Number.isNaN(parsed) ? null : parsed;
      input.value = value ?? '';
      const entryId = input.dataset.entry;
      const setIndex = Number(input.dataset.index);
      store.updateActiveWorkoutSet(entryId, setIndex, { [input.dataset.setField]: value });

      const entry = store.getActiveWorkout().exercises.find((e) => e.id === entryId);
      const row = input.closest('.set-row');
      const wasPr = row.classList.contains('is-pr');
      const isPr = evaluateSetRecord(entry, setIndex, row);
      if (isPr && !wasPr) {
        const set = entry.sets[setIndex];
        showToast(`🏆 Nuovo record! ${entry.name} — ${set.reps} reps × ${set.weight} kg`, { variant: 'record' });
      }
    });
  });
}

// ---------- Esercizi extra: dentro la scheda o solo per oggi ----------

// Nella scheda l'esercizio entra con quello che e' stato fatto davvero: le
// serie segnate e le ripetizioni migliori, che sono il traguardo da rifare la
// volta dopo. Il cardio non ha ripetizioni e resta sul valore predefinito.
function planFromSets(exercise) {
  const filled = exercise.sets.filter((s) => (exercise.kind === 'cardio' ? s.minutes || s.speed : s.reps || s.weight));
  const sets = Math.min(20, Math.max(1, filled.length || exercise.sets.length));
  const bestReps = exercise.kind === 'cardio' ? 0 : Math.max(0, ...exercise.sets.map((s) => s.reps || 0));
  return { sets, reps: bestReps ? Math.min(100, Math.round(bestReps)) : 10 };
}

function workoutExtras(record) {
  const day = record.dayId ? store.getDay(record.dayId) : null;
  if (!day) return { day: null, extras: [] };
  const planKeys = dayPlanKeys(day);
  // Lo stesso esercizio aggiunto due volte ("Aggiungi comunque") si propone
  // una volta sola.
  const seen = new Set();
  const extras = record.exercises.filter((e) => {
    if (!isExtra(planKeys, e.exerciseId, e.name)) return false;
    const keys = [exerciseKey(e.exerciseId, e.name), exerciseKey(null, e.name)];
    if (keys.some((k) => seen.has(k))) return false;
    keys.forEach((k) => seen.add(k));
    return true;
  });
  return { day, extras };
}

// Si apre sopra il riepilogo, ad allenamento gia' salvato: chiudere la
// finestra non perde niente e vale come "solo per oggi".
function openExtrasToDayModal(record) {
  const { day, extras } = workoutExtras(record);
  if (!day || !extras.length) return;

  const plans = extras.map(planFromSets);
  const selected = new Set(extras.map((_, i) => i));
  // Foto trovate da sole per gli esercizi che non ne hanno una (vedi onMount).
  const found = extras.map(() => null);
  const lookups = extras.map(() => null);

  const cardHtml = (e, i) => {
    const ex = store.findExercise(e.exerciseId, e.name);
    const imageUrl = (ex && ex.imageUrl) || (found[i] && found[i].imageUrl);
    const thumb = imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="" loading="lazy" draggable="false" />` : icon('dumbbell');
    const on = selected.has(i);
    const detail = e.kind === 'cardio' ? 'Cardio' : `${plans[i].sets} × ${plans[i].reps}`;
    return `
      <div class="card exercise-card glass${on ? ' is-picked' : ' is-skipped'}" data-extra-index="${i}" role="button" aria-pressed="${on}">
        <div class="exercise-thumb">${thumb}</div>
        <div class="exercise-info">
          <div class="exercise-name">${escapeHtml(e.name)}</div>
          <div class="text-secondary" style="font-size:0.78rem;margin-top:2px">${detail}</div>
        </div>
        <div class="exercise-row-actions">${on ? icon('check') : icon('plus')}</div>
      </div>
    `;
  };

  const message = extras.length === 1
    ? `Oggi hai fatto "${extras[0].name}", che non è nella scheda di "${day.name}". Vuoi aggiungerlo?`
    : `Oggi hai fatto ${extras.length} esercizi che non sono nella scheda di "${day.name}". Vuoi aggiungerli? Tocca quelli da lasciare fuori.`;

  openModal({
    title: 'Esercizi extra',
    bodyHtml: `
      <p class="text-secondary" style="margin-top:0">${escapeHtml(message)}</p>
      <div id="extras-list">${extras.map(cardHtml).join('')}</div>
      <div class="flex gap-3 mt-4">
        <button class="btn btn-glass w-full" id="extras-skip">Solo per oggi</button>
        <button class="btn btn-primary w-full" id="extras-add">Aggiungi</button>
      </div>
    `,
    onMount: (body) => {
      const listEl = body.querySelector('#extras-list');
      const addBtn = body.querySelector('#extras-add');

      function renderList() {
        listEl.innerHTML = extras.map(cardHtml).join('');
        bind();
      }

      // Lasciare fuori un esercizio si annulla con un secondo tocco: niente
      // conferma, come nella finestra che aggiunge esercizi a un giorno.
      function bind() {
        listEl.querySelectorAll('[data-extra-index]').forEach((card) => {
          card.addEventListener('click', () => {
            const i = Number(card.dataset.extraIndex);
            if (selected.has(i)) selected.delete(i); else selected.add(i);
            addBtn.disabled = !selected.size;
            renderList();
          });
        });
      }
      bind();

      // Un esercizio scritto a mano non ha la foto, e nemmeno uno della
      // libreria salvato senza: la si cerca da sola nel database degli
      // esercizi, come per le schede del Virtual PT. Arriva dopo qualche
      // istante e compare nella finestra appena c'e'.
      extras.forEach((e, i) => {
        const ex = store.findExercise(e.exerciseId, e.name);
        if (ex && ex.imageUrl) return;
        lookups[i] = findAutoExerciseMatch(e.name, e.muscles)
          .catch(() => null)
          .then((match) => {
            found[i] = match;
            if (match && match.imageUrl && listEl.isConnected) renderList();
            return match;
          });
      });

      body.querySelector('#extras-skip').addEventListener('click', closeModal);

      addBtn.addEventListener('click', () => {
        extras.forEach((e, i) => {
          if (!selected.has(i)) return;
          const ex = store.addWorkoutExerciseToDay(day.id, record.id, {
            exerciseId: e.exerciseId, name: e.name, muscles: e.muscles, kind: e.kind, ...plans[i],
          });
          if (!ex || ex.imageUrl || !lookups[i]) return;
          // La foto puo' arrivare anche a finestra chiusa: si mette appena
          // c'e', ma solo se nel frattempo non ne e' stata scelta una a mano.
          lookups[i].then((match) => {
            const current = store.getExercise(ex.id);
            if (!match || !match.imageUrl || !current || current.imageUrl) return;
            store.updateExercise(ex.id, { imageUrl: match.imageUrl, description: current.description || match.description });
          });
        });
        const count = selected.size;
        closeModal();
        showToast(count === 1 ? `Aggiunto alla scheda di "${day.name}"` : `${count} esercizi aggiunti alla scheda di "${day.name}"`);
      });
    },
  });
}

// ---------- Schermata 3: riepilogo ----------

function formatNumber(value) {
  return Number(value || 0).toLocaleString('it-IT', { maximumFractionDigits: 2 });
}

function formatSetSummary(exercise, set) {
  return exercise.kind === 'cardio'
    ? `${formatNumber(set.minutes)} min · ${formatNumber(set.speed)} km/h`
    : `${formatNumber(set.reps)} reps × ${formatNumber(set.weight)} kg`;
}

function renderSummary(container, record) {
  const totalSets = record.exercises.reduce((sum, e) => sum + e.sets.length, 0);
  const totalVolume = record.exercises.reduce((sum, e) => (
    e.kind === 'cardio' ? sum : sum + e.sets.reduce((s, set) => s + (set.reps * set.weight), 0)
  ), 0);
  const cardioMinutes = record.exercises.reduce((sum, e) => (
    e.kind === 'cardio' ? sum + e.sets.reduce((s, set) => s + (set.minutes || 0), 0) : sum
  ), 0);

  const musclesHtml = record.muscles.map((key) => {
    const mg = muscleGroup(key);
    return `<span class="badge" style="background:${mg.color}">${escapeHtml(mg.label)}</span>`;
  }).join(' ');

  const exercisesHtml = record.exercises.map((e) => `
    <div class="card glass workout-exercise-card">
      <div class="exercise-name">${escapeHtml(e.name)}</div>
      <div class="sets-list mt-2">
        ${e.sets.map((s, i) => `<div class="set-row set-row-readonly"><span class="set-label">Serie ${i + 1}</span><span class="text-secondary">${formatSetSummary(e, s)}</span></div>`).join('')}
      </div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="empty-state glass text-center">
      <div class="empty-emoji">🎉</div>
      <div class="empty-title">Allenamento completato!</div>
      <div class="section-subtitle" style="margin-bottom:2px">${escapeHtml(record.weekday)} — ${new Date(record.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
      <p class="text-secondary" style="font-family:var(--font-display);font-size:1.4rem;font-weight:800;margin:6px 0">${formatElapsed(record.durationSeconds * 1000)}</p>
      <p class="text-secondary" style="font-size:0.82rem">${record.exercises.length} esercizi · ${totalSets} serie${totalVolume ? ` · volume totale ${Math.round(totalVolume)} kg` : ''}${cardioMinutes ? ` · ${Math.round(cardioMinutes)} min di cardio` : ''}</p>
      <div class="flex gap-2" style="justify-content:center;flex-wrap:wrap;margin-top:8px">${musclesHtml}</div>
    </div>
    <div class="mt-4">${exercisesHtml}</div>
    <button class="btn btn-primary btn-block mt-4" id="summary-done-btn">Fatto</button>
  `;

  container.querySelector('#summary-done-btn').addEventListener('click', () => {
    justFinished = null;
    render(container);
  });
}

// ---------- Dispatch ----------

function renderCurrent() {
  if (currentContainer) render(currentContainer);
}

function render(container) {
  currentContainer = container;
  clearInterval(tickInterval);

  const active = store.getActiveWorkout();
  if (active) {
    renderActive(container);
  } else if (justFinished) {
    renderSummary(container, justFinished);
  } else {
    renderPickDay(container);
  }
}

window.MyGym = window.MyGym || {};
window.MyGym.views = window.MyGym.views || {};
window.MyGym.views.workout = { render };

})();
