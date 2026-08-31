// Script classico (non un modulo ES): espone tutto su window.MyGym.views.workout.
(function () {

const { store, MUSCLE_GROUPS, muscleGroup, icon, escapeHtml, openModal, closeModal, showToast, confirmAction, navigate } = window.MyGym;

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

  container.innerHTML = `
    <h1 class="section-title">Inizia allenamento</h1>
    <p class="section-subtitle">Quale giorno vuoi allenare?</p>
    <div class="weekday-grid" id="day-grid">
      ${days.map((d) => `<span class="chip chip-lg" data-day-id="${d.id}">${escapeHtml(d.name)}</span>`).join('')}
    </div>
    <button class="btn btn-primary btn-block mt-4" id="start-workout-btn" disabled>Inizia allenamento</button>
  `;

  let selectedDayId = null;
  const grid = container.querySelector('#day-grid');
  const startBtn = container.querySelector('#start-workout-btn');

  grid.querySelectorAll('[data-day-id]').forEach((chip) => {
    chip.addEventListener('click', () => {
      selectedDayId = chip.dataset.dayId;
      grid.querySelectorAll('[data-day-id]').forEach((c) => c.classList.remove('selected'));
      chip.classList.add('selected');
      startBtn.disabled = false;
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

function setRowHtml(entryId, set, index, total) {
  return `
    <div class="set-row">
      <span class="set-label">Serie ${index + 1}</span>
      <input type="text" inputmode="decimal" class="input input-set" placeholder="reps" value="${set.reps ?? ''}" data-set-field="reps" data-entry="${entryId}" data-index="${index}" />
      <span class="set-x">×</span>
      <input type="text" inputmode="decimal" class="input input-set" placeholder="kg" value="${set.weight ?? ''}" data-set-field="weight" data-entry="${entryId}" data-index="${index}" />
      <span class="set-unit">kg</span>
      ${total > 1
        ? `<button class="icon-btn danger set-remove-btn" data-remove-set data-entry="${entryId}" data-index="${index}" aria-label="Rimuovi serie">${icon('trash')}</button>`
        : `<span class="set-remove-spacer"></span>`}
    </div>
  `;
}

function exerciseEntryHtml(entry) {
  return `
    <div class="card glass workout-exercise-card" data-entry-id="${entry.id}">
      <div class="flex items-center justify-between gap-2">
        <input type="text" class="input workout-exercise-name" value="${escapeHtml(entry.name)}" data-rename="${entry.id}" maxlength="60" />
        <button class="icon-btn danger" data-remove-exercise="${entry.id}" aria-label="Rimuovi esercizio">${icon('trash')}</button>
      </div>
      <div class="chip-row mt-2" data-muscle-picker="${entry.id}">
        ${muscleMultiChipsHtml(entry.id, entry.muscles)}
      </div>
      <div class="sets-list mt-3">
        ${entry.sets.map((s, i) => setRowHtml(entry.id, s, i, entry.sets.length)).join('')}
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

function exercisePickCardHtml(ex, done) {
  const thumb = ex.imageUrl ? `<img src="${escapeHtml(ex.imageUrl)}" alt="" loading="lazy" draggable="false" />` : icon('dumbbell');
  const badges = (ex.muscleGroups || []).map((key) => {
    const mg = muscleGroup(key);
    return `<span class="badge" style="background:${mg.color}">${escapeHtml(mg.label)}</span>`;
  }).join(' ');
  const doneBadge = done ? `<span class="badge badge-done">${icon('check')} Già fatto</span>` : '';
  return `
    <div class="card exercise-card glass ${done ? 'is-done' : ''}" data-pick-exercise="${ex.id}">
      <div class="exercise-thumb">${thumb}</div>
      <div class="exercise-info">
        <div class="exercise-name">${escapeHtml(ex.name)}</div>
        <div class="flex gap-2" style="flex-wrap:wrap">${doneBadge}${badges}</div>
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
  const cardHtml = (ex) => exercisePickCardHtml(ex, isDone(ex.id, ex.name));

  const renderList = (filterText) => {
    const q = (filterText || '').trim().toLowerCase();

    if (!q && suggested.length) {
      return `
        <p class="text-secondary" style="font-size:0.8rem;margin:0 0 8px">Esercizi di "${escapeHtml(day.name)}"</p>
        ${suggested.map(cardHtml).join('')}
      `;
    }

    const matches = q.length ? exercises.filter((ex) => ex.name.toLowerCase().includes(q)) : exercises;
    const listHtml = matches.length
      ? matches.map(cardHtml).join('')
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

  const exercisesHtml = w.exercises.length
    ? w.exercises.map(exerciseEntryHtml).join('')
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

  container.querySelectorAll('[data-remove-set]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const entryId = btn.dataset.entry;
      const index = Number(btn.dataset.index);
      const entry = store.getActiveWorkout().exercises.find((e) => e.id === entryId);
      const set = entry && entry.sets[index];
      if (!set) return;
      const done = set.reps && set.weight ? ` (${set.reps} reps × ${set.weight} kg)` : '';
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

// ---------- Schermata 3: riepilogo ----------

function renderSummary(container, record) {
  const totalSets = record.exercises.reduce((sum, e) => sum + e.sets.length, 0);
  const totalVolume = record.exercises.reduce((sum, e) => sum + e.sets.reduce((s, set) => s + (set.reps * set.weight), 0), 0);

  const musclesHtml = record.muscles.map((key) => {
    const mg = muscleGroup(key);
    return `<span class="badge" style="background:${mg.color}">${escapeHtml(mg.label)}</span>`;
  }).join(' ');

  const exercisesHtml = record.exercises.map((e) => `
    <div class="card glass workout-exercise-card">
      <div class="exercise-name">${escapeHtml(e.name)}</div>
      <div class="sets-list mt-2">
        ${e.sets.map((s, i) => `<div class="set-row set-row-readonly"><span class="set-label">Serie ${i + 1}</span><span class="text-secondary">${s.reps || 0} reps × ${s.weight || 0} kg</span></div>`).join('')}
      </div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="empty-state glass text-center">
      <div class="empty-emoji">🎉</div>
      <div class="empty-title">Allenamento completato!</div>
      <div class="section-subtitle" style="margin-bottom:2px">${escapeHtml(record.weekday)} — ${new Date(record.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
      <p class="text-secondary" style="font-family:var(--font-display);font-size:1.4rem;font-weight:800;margin:6px 0">${formatElapsed(record.durationSeconds * 1000)}</p>
      <p class="text-secondary" style="font-size:0.82rem">${record.exercises.length} esercizi · ${totalSets} serie · volume totale ${Math.round(totalVolume)} kg</p>
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
