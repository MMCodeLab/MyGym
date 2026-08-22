// Central state store, persisted to localStorage. No build step, no framework.
// Script classico (non un modulo ES): espone tutto su window.MyGym, cosi'
// funziona anche aperto come file locale (file://), dove Chrome blocca
// il caricamento dei moduli ES per motivi di CORS.
(function () {

const STORAGE_KEY = 'mygym.data.v1';

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

function defaultState() {
  return { theme: 'dark', exercises: [], days: [] };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed };
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

  // ---- Exercises (global library) ----
  addExercise({ name, muscleGroupKey, imageUrl, description }) {
    const ex = {
      id: uid(),
      name: name.trim(),
      muscleGroup: muscleGroupKey,
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
  moveDayEntry(dayId, exerciseId, direction) {
    const day = state.days.find((d) => d.id === dayId);
    if (!day) return;
    const idx = day.entries.findIndex((e) => e.exerciseId === exerciseId);
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= day.entries.length) return;
    const [item] = day.entries.splice(idx, 1);
    day.entries.splice(target, 0, item);
    save();
  },

  // ---- Backup ----
  exportData() {
    return JSON.stringify(state, null, 2);
  },
  importData(json) {
    const parsed = JSON.parse(json);
    state = { ...defaultState(), ...parsed };
    save();
    applyTheme();
  },
  clearAll() {
    state = defaultState();
    save();
  },
};

window.MyGym = window.MyGym || {};
Object.assign(window.MyGym, { store, MUSCLE_GROUPS, muscleGroup, uid, applyTheme });

})();
