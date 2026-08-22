// Suggerimenti immagine esercizio, basati sul dataset open-source "free-exercise-db"
// (https://github.com/yuhonas/free-exercise-db, dominio pubblico / Unlicense), servito
// via jsDelivr CDN — nessuna API key richiesta. I nomi nel dataset sono in inglese,
// quindi il termine digitato in italiano viene tradotto al volo (MyMemory Translation
// API, gratuita e senza chiave) prima di cercare.
// Script classico (non un modulo ES): espone tutto su window.MyGym.
(function () {

const DATASET_URL = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/dist/exercises.json';
const IMAGE_BASE = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/';
const CACHE_KEY = 'mygym.exercise-dataset.v3';

const TRANSLATE_URL = 'https://api.mymemory.translated.net/get';
const TRANSLATE_CACHE_KEY = 'mygym.translate-cache.v1';

const MUSCLE_MAP = {
  abdominals: 'addominali',
  abductors: 'gambe',
  adductors: 'gambe',
  biceps: 'bicipiti',
  calves: 'polpacci',
  chest: 'petto',
  forearms: 'avambracci',
  glutes: 'glutei',
  hamstrings: 'gambe',
  lats: 'schiena',
  'lower back': 'schiena',
  'middle back': 'schiena',
  neck: 'altro',
  quadriceps: 'gambe',
  shoulders: 'spalle',
  traps: 'schiena',
  triceps: 'tricipiti',
};

function guessMuscleGroup(entry) {
  if (entry.category === 'cardio') return 'cardio';
  const primary = entry.primaryMuscles && entry.primaryMuscles[0];
  return MUSCLE_MAP[primary] || 'altro';
}

function loadCached() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

let datasetPromise = null;

async function getDataset() {
  const cached = loadCached();
  if (cached) return cached;
  if (!datasetPromise) {
    datasetPromise = fetch(DATASET_URL)
      .then((res) => {
        if (!res.ok) throw new Error('Errore di rete nel caricare il database esercizi.');
        return res.json();
      })
      .then((data) => {
        const slim = data.map((e) => ({
          id: e.id,
          name: e.name,
          image: e.images && e.images[0] ? e.images[0] : null,
          muscle: guessMuscleGroup(e),
          instructions: e.instructions || [],
        }));
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(slim));
        } catch (e) {
          // storage pieno: va bene, useremo la promise in memoria per questa sessione
        }
        return slim;
      })
      .catch((err) => {
        datasetPromise = null; // consenti un nuovo tentativo alla prossima ricerca
        throw err;
      });
  }
  return datasetPromise;
}

// ---------- Traduzione IT -> EN (MyMemory, gratuita, senza chiave) ----------

function loadTranslateCache() {
  try {
    const raw = localStorage.getItem(TRANSLATE_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveTranslateCache(cache) {
  try {
    localStorage.setItem(TRANSLATE_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    // cache non salvata: non e' un problema bloccante
  }
}

async function translate(text, langpair, fallback) {
  const key = `${langpair}:${text.trim().toLowerCase()}`;
  const cache = loadTranslateCache();
  if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];

  try {
    const url = `${TRANSLATE_URL}?q=${encodeURIComponent(text.slice(0, 490))}&langpair=${langpair}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Traduzione non disponibile');
    const data = await res.json();
    const translated = data && data.responseData && data.responseData.translatedText
      ? data.responseData.translatedText
      : fallback;
    cache[key] = translated;
    saveTranslateCache(cache);
    return translated;
  } catch (e) {
    return fallback; // offline o servizio non raggiungibile
  }
}

function translateToEnglish(text) {
  return translate(text, 'it|en', null);
}

/**
 * Traduce un elenco di frasi (es. le istruzioni di un esercizio, in inglese)
 * in italiano, una alla volta (il servizio ha un limite di 500 caratteri a
 * richiesta) e le unisce in un unico testo. Se la traduzione non riesce per
 * una frase, quella frase resta in inglese invece di sparire.
 */
async function translateInstructionsToItalian(instructions) {
  if (!instructions || !instructions.length) return '';
  const translated = await Promise.all(
    instructions.map((s) => translate(s, 'en|it', s))
  );
  return translated.join(' ');
}

/**
 * Cerca esercizi per nome e restituisce fino a 8 suggerimenti con immagine e
 * gruppo muscolare stimato. Il termine puo' essere scritto in italiano: viene
 * tradotto automaticamente in inglese (il dataset ha solo nomi inglesi) e si
 * cerca con entrambe le versioni, cosi' funziona anche digitando direttamente
 * in inglese.
 */
async function searchExerciseImages(term) {
  const original = (term || '').trim();
  if (original.length < 2) return [];

  const dataset = await getDataset();
  const translated = await translateToEnglish(original);

  const queries = [];
  if (translated && translated.trim().toLowerCase() !== original.toLowerCase()) {
    queries.push(translated.trim().toLowerCase());
  }
  queries.push(original.toLowerCase());

  const seen = new Set();
  const results = [];
  for (const q of queries) {
    if (results.length >= 8) break;
    for (const e of dataset) {
      if (results.length >= 8) break;
      if (seen.has(e.id)) continue;
      if (e.name.toLowerCase().includes(q)) {
        seen.add(e.id);
        results.push(e);
      }
    }
  }

  return results.map((e) => ({
    id: e.id,
    name: e.name,
    imageUrl: e.image ? IMAGE_BASE + e.image : null,
    muscleHint: e.muscle,
    instructions: e.instructions,
  }));
}

function isDatasetCached() {
  return !!loadCached();
}

window.MyGym = window.MyGym || {};
Object.assign(window.MyGym, { searchExerciseImages, isDatasetCached, translateInstructionsToItalian });

})();
