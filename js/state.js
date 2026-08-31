// Central state store, persisted to localStorage. No build step, no framework.
// Script classico (non un modulo ES): espone tutto su window.MyGym, cosi'
// funziona anche aperto come file locale (file://), dove Chrome blocca
// il caricamento dei moduli ES per motivi di CORS.
(function () {

const STORAGE_KEY = 'mygym.data.v1';
// Ultima posizione nell'app (rotta + scroll), tenuta in una chiave separata:
// si riscrive di continuo mentre si scorre e non ha senso che finisca nei
// backup di exportData(), che contengono i dati veri dell'utente.
const UI_KEY = 'mygym.ui.v1';

const MUSCLE_GROUPS = [
  { key: 'petto', label: 'Petto', color: 'var(--mg-petto)' },
  { key: 'schiena', label: 'Schiena', color: 'var(--mg-schiena)' },
  { key: 'gambe', label: 'Gambe', color: 'var(--mg-gambe)' },
  { key: 'spalle', label: 'Spalle', color: 'var(--mg-spalle)' },
  { key: 'bicipiti', label: 'Bicipiti', color: 'var(--mg-bicipiti)' },
  { key: 'tricipiti', label: 'Tricipiti', color: 'var(--mg-tricipiti)' },
  { key: 'addominali', label: 'Addominali', color: 'var(--mg-addominali)' },
  { key: 'glutei', label: 'Glutei', color: 'var(--mg-glutei)' },
  { key: 'polpacci', label: 'Polpacci', color: 'var(--mg-polpacci)' },
  { key: 'avambracci', label: 'Avambracci', color: 'var(--mg-avambracci)' },
  { key: 'cardio', label: 'Cardio', color: 'var(--mg-cardio)' },
  { key: 'altro', label: 'Altro', color: 'var(--mg-altro)' },
];

function muscleGroup(key) {
  return MUSCLE_GROUPS.find((m) => m.key === key) || MUSCLE_GROUPS[MUSCLE_GROUPS.length - 1];
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Stima del massimale (formula di Epley): permette di confrontare serie con
// combinazioni diverse di peso/reps sulla stessa scala per capire qual e' la piu' forte.
function estimated1RM(weight, reps) {
  if (!weight || !reps) return 0;
  return weight * (1 + reps / 30);
}

// Le serie "libere" (senza esercizio in libreria) vengono confrontate per nome,
// cosi' un record personale funziona anche senza aver salvato l'esercizio.
function recordKey(exerciseId, name) {
  return exerciseId || `free:${(name || '').trim().toLowerCase()}`;
}

function defaultState() {
  return { theme: 'dark', exercises: [], days: [], workouts: [], activeWorkout: null, restTimerSeconds: 90 };
}

const MAX_MUSCLE_GROUPS_PER_EXERCISE = 3;

// Migra gli esercizi salvati prima dell'introduzione dei gruppi muscolari
// multipli (campo singolare "muscleGroup") al nuovo campo array "muscleGroups".
function migrateExercise(ex) {
  if (ex.muscleGroups) return ex;
  const { muscleGroup, ...rest } = ex;
  return { ...rest, muscleGroups: muscleGroup ? [muscleGroup] : [] };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const merged = { ...defaultState(), ...parsed };
    merged.exercises = (merged.exercises || []).map(migrateExercise);
    return merged;
  } catch (e) {
    console.warn('Impossibile leggere i dati salvati, riparto da zero.', e);
    return defaultState();
  }
}

let state = load();
const listeners = new Set();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Impossibile salvare i dati (storage pieno?).', e);
  }
  listeners.forEach((fn) => fn(state));
}

function clearUiPosition() {
  try {
    localStorage.removeItem(UI_KEY);
  } catch (e) {
    // niente da fare: al massimo l'app si riapre su una schermata vuota
  }
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  const meta = document.getElementById('theme-color-meta');
  if (meta) meta.setAttribute('content', state.theme === 'dark' ? '#0b0e1a' : '#eef1f8');
}

const store = {
  get() {
    return state;
  },
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  // ---- Theme ----
  setTheme(theme) {
    state.theme = theme;
    save();
    applyTheme();
  },

  // ---- Timer di recupero ----
  setRestTimerSeconds(seconds) {
    state.restTimerSeconds = seconds;
    save();
  },
  // Salva solo l'orario di fine (non un countdown che ticchetta): cosi' il
  // tempo rimasto si ricalcola sempre dall'orologio reale, anche se l'app
  // e' rimasta in background e i timer del browser sono stati rallentati.
  startRestTimer(seconds) {
    if (!state.activeWorkout) return null;
    state.activeWorkout.restTimer = { endTime: Date.now() + seconds * 1000 };
    save();
    return state.activeWorkout.restTimer;
  },
  clearRestTimer() {
    if (!state.activeWorkout) return;
    state.activeWorkout.restTimer = null;
    save();
  },

  // ---- Exercises (global library) ----
  addExercise({ name, muscleGroups, imageUrl, description }) {
    const ex = {
      id: uid(),
      name: name.trim(),
      muscleGroups: (muscleGroups || []).slice(0, MAX_MUSCLE_GROUPS_PER_EXERCISE),
      imageUrl: imageUrl || null,
      description: description || null,
      createdAt: Date.now(),
    };
    state.exercises.push(ex);
    save();
    return ex;
  },
  updateExercise(id, patch) {
    const ex = state.exercises.find((e) => e.id === id);
    if (!ex) return;
    if (patch.muscleGroups) patch = { ...patch, muscleGroups: patch.muscleGroups.slice(0, MAX_MUSCLE_GROUPS_PER_EXERCISE) };
    Object.assign(ex, patch);
    save();
  },
  deleteExercise(id) {
    state.exercises = state.exercises.filter((e) => e.id !== id);
    state.days.forEach((d) => {
      d.entries = d.entries.filter((entry) => entry.exerciseId !== id);
    });
    save();
  },
  getExercise(id) {
    return state.exercises.find((e) => e.id === id) || null;
  },

  // ---- Days ----
  addDay(name) {
    const day = {
      id: uid(),
      name: name.trim(),
      createdAt: Date.now(),
      entries: [], // { exerciseId, sets, reps }
    };
    state.days.push(day);
    save();
    return day;
  },
  updateDay(id, patch) {
    const day = state.days.find((d) => d.id === id);
    if (!day) return;
    Object.assign(day, patch);
    save();
  },
  deleteDay(id) {
    state.days = state.days.filter((d) => d.id !== id);
    save();
  },
  getDay(id) {
    return state.days.find((d) => d.id === id) || null;
  },

  addExerciseToDay(dayId, exerciseId, { sets = 3, reps = 10 } = {}) {
    const day = state.days.find((d) => d.id === dayId);
    if (!day) return;
    if (day.entries.some((e) => e.exerciseId === exerciseId)) return;
    day.entries.push({ exerciseId, sets, reps });
    save();
  },
  removeExerciseFromDay(dayId, exerciseId) {
    const day = state.days.find((d) => d.id === dayId);
    if (!day) return;
    day.entries = day.entries.filter((e) => e.exerciseId !== exerciseId);
    save();
  },
  updateDayEntry(dayId, exerciseId, patch) {
    const day = state.days.find((d) => d.id === dayId);
    if (!day) return;
    const entry = day.entries.find((e) => e.exerciseId === exerciseId);
    if (!entry) return;
    Object.assign(entry, patch);
    save();
  },
  // ---- Allenamento in corso (sopravvive a un refresh, finche' non termini) ----
  getActiveWorkout() {
    return state.activeWorkout;
  },
  startActiveWorkout(dayId) {
    const day = state.days.find((d) => d.id === dayId);
    if (!day) return null;
    const workout = {
      dayId: day.id,
      weekday: day.name,
      startedAt: Date.now(),
      elapsedMs: 0,
      running: true,
      exercises: [], // { id, exerciseId, name, muscles: [], sets: [{ reps, weight }] }
      restTimer: null, // { endTime } quando il timer di recupero e' attivo
    };
    state.activeWorkout = workout;
    save();
    // La posizione salvata era di un altro allenamento: questo comincia
    // dall'alto.
    clearUiPosition();
    return workout;
  },
  updateActiveWorkout(patch) {
    if (!state.activeWorkout) return;
    Object.assign(state.activeWorkout, patch);
    save();
  },
  addActiveWorkoutExercise({ exerciseId, name, muscles }) {
    if (!state.activeWorkout) return null;
    const entry = {
      id: uid(),
      exerciseId: exerciseId || null,
      name: name.trim(),
      muscles: muscles || [],
      sets: [{ reps: null, weight: null }],
    };
    state.activeWorkout.exercises.push(entry);
    save();
    return entry;
  },
  updateActiveWorkoutExercise(entryId, patch) {
    if (!state.activeWorkout) return;
    const entry = state.activeWorkout.exercises.find((e) => e.id === entryId);
    if (!entry) return;
    Object.assign(entry, patch);
    save();
  },
  removeActiveWorkoutExercise(entryId) {
    if (!state.activeWorkout) return;
    state.activeWorkout.exercises = state.activeWorkout.exercises.filter((e) => e.id !== entryId);
    save();
  },
  addActiveWorkoutSet(entryId) {
    if (!state.activeWorkout) return;
    const entry = state.activeWorkout.exercises.find((e) => e.id === entryId);
    if (!entry) return;
    entry.sets.push({ reps: null, weight: null });
    save();
  },
  removeActiveWorkoutSet(entryId, setIndex) {
    if (!state.activeWorkout) return;
    const entry = state.activeWorkout.exercises.find((e) => e.id === entryId);
    if (!entry || entry.sets.length <= 1) return;
    entry.sets.splice(setIndex, 1);
    save();
  },
  updateActiveWorkoutSet(entryId, setIndex, patch) {
    if (!state.activeWorkout) return;
    const entry = state.activeWorkout.exercises.find((e) => e.id === entryId);
    if (!entry || !entry.sets[setIndex]) return;
    Object.assign(entry.sets[setIndex], patch);
    save();
  },
  discardActiveWorkout() {
    state.activeWorkout = null;
    save();
    clearUiPosition();
  },

  // ---- Record personali ----
  // Cerca, in tutto lo storico salvato, la serie con la stima di massimale piu' alta
  // per lo stesso esercizio (o lo stesso nome, per gli esercizi liberi).
  bestHistoricalSet(exerciseId, name) {
    const key = recordKey(exerciseId, name);
    let best = null;
    state.workouts.forEach((w) => {
      w.exercises.forEach((e) => {
        if (recordKey(e.exerciseId, e.name) !== key) return;
        e.sets.forEach((s) => {
          const oneRM = estimated1RM(s.weight, s.reps);
          if (oneRM > 0 && (!best || oneRM > best.oneRM)) {
            best = { weight: s.weight, reps: s.reps, oneRM };
          }
        });
      });
    });
    return best;
  },
  // Ritorna null se non c'e' ancora abbastanza storico per un confronto
  // (niente peso/reps, oppure prima volta in assoluto per questo esercizio).
  checkPersonalRecord({ exerciseId, name, weight, reps }) {
    const oneRM = estimated1RM(weight, reps);
    if (!oneRM) return null;
    const best = store.bestHistoricalSet(exerciseId, name);
    if (!best) return null;
    return { isRecord: oneRM > best.oneRM, previousBest: best, oneRM };
  },

  // ---- Storico allenamenti ----
  finishActiveWorkout() {
    if (!state.activeWorkout) return null;
    const w = state.activeWorkout;
    const elapsedMs = w.elapsedMs + (w.running ? Date.now() - w.startedAt : 0);
    const muscles = [...new Set(w.exercises.flatMap((e) => e.muscles))];
    const record = {
      id: uid(),
      dayId: w.dayId || null,
      weekday: w.weekday,
      date: new Date().toISOString(),
      durationSeconds: Math.round(elapsedMs / 1000),
      exercises: w.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        name: e.name,
        muscles: e.muscles,
        sets: e.sets.map((s) => ({ reps: s.reps || 0, weight: s.weight || 0 })),
      })),
      muscles,
    };
    state.workouts.push(record);
    state.activeWorkout = null;
    save();
    clearUiPosition();
    return record;
  },
  getWorkouts() {
    return [...state.workouts].sort((a, b) => new Date(b.date) - new Date(a.date));
  },
  getWorkout(id) {
    return state.workouts.find((w) => w.id === id) || null;
  },
  deleteWorkout(id) {
    state.workouts = state.workouts.filter((w) => w.id !== id);
    save();
  },

  // ---- Ultima posizione nell'app (per riaprirla dov'era) ----
  getLastPosition() {
    try {
      const raw = localStorage.getItem(UI_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },
  setLastPosition(position) {
    try {
      localStorage.setItem(UI_KEY, JSON.stringify(position));
    } catch (e) {
      // storage pieno o non disponibile: si perde solo il ripristino
    }
  },
  clearLastPosition: clearUiPosition,

  // ---- Backup ----
  exportData() {
    return JSON.stringify(state, null, 2);
  },
  importData(json) {
    const parsed = JSON.parse(json);
    state = { ...defaultState(), ...parsed };
    save();
    applyTheme();
    // I dati sono altri: la vecchia posizione punterebbe a schermate che
    // potrebbero non esistere piu'.
    clearUiPosition();
  },
  clearAll() {
    state = defaultState();
    save();
    clearUiPosition();
  },
};

window.MyGym = window.MyGym || {};
Object.assign(window.MyGym, { store, MUSCLE_GROUPS, muscleGroup, uid, applyTheme, MAX_MUSCLE_GROUPS_PER_EXERCISE });

})();
