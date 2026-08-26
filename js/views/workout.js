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

function restTimerBarHtml(restTimer) {
  if (!restTimer) {
    return `<button class="btn btn-glass btn-block rest-timer-start-btn" id="rest-timer-start-btn">${icon('stopwatch')} Tempo di recupero</button>`;
  }
  const remainingSec = Math.ceil((restTimer.endTime - Date.now()) / 1000);
  const total = store.get().restTimerSeconds || 90;
  const pct = Math.max(0, Math.min(100, (remainingSec / total) * 100));
  return `
    <div class="rest-timer-running">
      <div class="rest-timer-progress-fill" id="rest-timer-progress-fill" style="width:${pct}%"></div>
      <div class="rest-timer-info">
        <span class="rest-timer-time" id="rest-timer-time">${formatRestTime(remainingSec)}</span>
        <span class="rest-timer-label">Recupero in corso…</span>
      </div>
      <button class="icon-btn" id="rest-timer-cancel-btn" aria-label="Annulla recupero">${icon('close')}</button>
    </div>
  `;
}

// Ridisegna solo la barra del timer di recupero (non tutto lo schermo
// allenamento), e gestisce il proprio giro di aggiornamento: il tempo
// rimasto si ricalcola sempre dall'orario assoluto di fine, mai da un
// contatore che scala, cosi' resta corretto anche se il tick e' arrivato
// in ritardo (tab in background, dispositivo rallentato, ecc.).
function renderRestTimerBar(container) {
  const bar = container.querySelector('#rest-timer-bar');
  if (!bar) return;
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

  bar.innerHTML = restTimerBarHtml(restTimer);

  if (!restTimer) {
    releaseWakeLock();
    const startBtn = bar.querySelector('#rest-timer-start-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        store.startRestTimer(store.get().restTimerSeconds || 90);
        requestRestNotificationPermissionIfNeeded();
        acquireWakeLock();
        renderRestTimerBar(container);
      });
    }
    return;
  }

  const cancelBtn = bar.querySelector('#rest-timer-cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      store.clearRestTimer();
      releaseWakeLock();
      renderRestTimerBar(container);
    });
  }

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
    const timeEl = bar.querySelector('#rest-timer-time');
    const fillEl = bar.querySelector('#rest-timer-progress-fill');
    if (timeEl) timeEl.textContent = formatRestTime(remainingSec);
    if (fillEl) {
      const total = store.get().restTimerSeconds || 90;
      fillEl.style.width = `${Math.max(0, Math.min(100, (remainingSec / total) * 100))}%`;
    }
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

function exercisePickCardHtml(ex) {
  const thumb = ex.imageUrl ? `<img src="${escapeHtml(ex.imageUrl)}" alt="" loading="lazy" draggable="false" />` : icon('dumbbell');
  const badges = (ex.muscleGroups || []).map((key) => {
    const mg = muscleGroup(key);
    return `<span class="badge" style="background:${mg.color}">${escapeHtml(mg.label)}</span>`;
  }).join(' ');
  return `
    <div class="card exercise-card glass" data-pick-exercise="${ex.id}">
      <div class="exercise-thumb">${thumb}</div>
      <div class="exercise-info">
        <div class="exercise-name">${escapeHtml(ex.name)}</div>
        <div class="flex gap-2" style="flex-wrap:wrap">${badges}</div>
      </div>
    </div>
  `;
}

function openAddExerciseModal() {
  const { exercises } = store.get();
  const activeWorkout = store.getActiveWorkout();
  const day = activeWorkout && activeWorkout.dayId ? store.getDay(activeWorkout.dayId) : null;
  const suggested = day
    ? day.entries.map((e) => store.getExercise(e.exerciseId)).filter(Boolean)
    : [];

  const renderList = (filterText) => {
    const q = (filterText || '').trim().toLowerCase();

    if (!q && suggested.length) {
      return `
        <p class="text-secondary" style="font-size:0.8rem;margin:0 0 8px">Esercizi di "${escapeHtml(day.name)}"</p>
        ${suggested.map(exercisePickCardHtml).join('')}
      `;
    }

    const matches = q.length ? exercises.filter((ex) => ex.name.toLowerCase().includes(q)) : exercises;
    const listHtml = matches.length
      ? matches.map(exercisePickCardHtml).join('')
      : `<p class="text-secondary text-center mt-4">Nessun esercizio trovato nella libreria.</p>`;

    const freeButton = q.length >= 2
      ? `<button class="btn btn-glass btn-block mt-2" id="add-free-exercise-btn">${icon('plus')} Aggiungi "${escapeHtml(filterText.trim())}" come esercizio libero</button>`
      : '';

    return listHtml + freeButton;
  };

  openModal({
    title: 'Aggiungi esercizio',
    bodyHtml: `
      <input type="text" class="input" id="pick-search" inputmode="search" enterkeyhint="search" placeholder="Cerca in tutta la libreria..." style="margin-bottom:12px" />
      <div id="pick-list">${renderList('')}</div>
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

      function bind() {
        listEl.querySelectorAll('[data-pick-exercise]').forEach((card) => {
          card.addEventListener('click', () => {
            const ex = store.getExercise(card.dataset.pickExercise);
            if (ex) addExercise({ exerciseId: ex.id, name: ex.name });
          });
        });
        const freeBtn = listEl.querySelector('#add-free-exercise-btn');
        if (freeBtn) {
          freeBtn.addEventListener('click', () => addExercise({ exerciseId: null, name: searchInput.value.trim() }));
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
      <div class="stopwatch">
        <span class="stopwatch-icon">${icon('stopwatch')}</span>
        <span class="stopwatch-time" id="stopwatch-time">${formatElapsed(currentElapsedMs(w))}</span>
      </div>
      <div class="flex items-center gap-2">
        <button class="icon-btn" id="stopwatch-toggle" aria-label="${w.running ? 'Pausa' : 'Riprendi'}">${icon(w.running ? 'pause' : 'play')}</button>
        <button class="btn btn-danger btn-sm" id="finish-workout-btn">${icon('flag')} Termina</button>
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

  container.querySelector('#add-exercise-btn').addEventListener('click', openAddExerciseModal);

  container.querySelectorAll('[data-rename]').forEach((input) => {
    input.addEventListener('blur', () => {
      const val = input.value.trim();
      if (val) store.updateActiveWorkoutExercise(input.dataset.rename, { name: val });
      else render(container);
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  });

  container.querySelectorAll('[data-remove-exercise]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.removeActiveWorkoutExercise(btn.dataset.removeExercise);
      renderActive(container);
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
      store.removeActiveWorkoutSet(btn.dataset.entry, Number(btn.dataset.index));
      renderActive(container);
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
