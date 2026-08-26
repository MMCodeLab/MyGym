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
    // MyMemory risponde comunque con HTTP 200 anche a quota giornaliera esaurita
    // o altri errori, mettendo un messaggio di avviso al posto della traduzione:
    // va controllato responseStatus, altrimenti quel testo finirebbe in cache
    // come se fosse una traduzione vera.
    if (!data || data.responseStatus !== 200 || !data.responseData || !data.responseData.translatedText) {
      return fallback;
    }
    const translated = data.responseData.translatedText;
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

// ---------- Abbinamento automatico (import scheda dal Virtual PT) ----------
// searchExerciseImages sopra e' pensata per un umano che sceglie tra piu'
// suggerimenti (ricerca manuale). Quando gli esercizi arrivano dalla scheda
// generata dall'IA non c'e' nessuno che sceglie, quindi qui serve un solo
// abbinamento il piu' possibile affidabile: si confrontano le PAROLE del nome
// (non un'unica sottostringa intera) e, se il punteggio non supera una soglia
// minima, si preferisce non mettere nessuna immagine piuttosto che una sbagliata.

// Termini da palestra che la traduzione automatica generica (MyMemory) rende
// spesso in modo diverso dal vocabolario del dataset (es. "affondi" -> "lunges"
// e non varianti piu' letterali). Applicato parola per parola, in aggiunta
// alla traduzione automatica: le due versioni si integrano invece di escludersi.
const GYM_GLOSSARY_IT_EN = {
  manubrio: 'dumbbell', manubri: 'dumbbell',
  bilanciere: 'barbell',
  cavo: 'cable', cavi: 'cable',
  kettlebell: 'kettlebell',
  panca: 'bench press', distensione: 'bench press', distensioni: 'bench press',
  elastico: 'band', elastica: 'band', fascia: 'band',
  macchina: 'machine', multipower: 'smith machine',
  corpo: 'bodyweight', libero: 'bodyweight',
  squat: 'squat',
  affondo: 'lunge', affondi: 'lunge',
  stacco: 'deadlift', stacchi: 'deadlift',
  spinta: 'press', spinte: 'press',
  croce: 'flye', croci: 'flye',
  trazione: 'pullup', trazioni: 'pullup',
  // "rematore"/"remata" da soli, in italiano, indicano quasi sempre il rematore
  // col bilanciere PIEGATI in avanti (non quello in piedi/verticale, che e'
  // tutt'altro esercizio): mappare alla frase intera evita di confonderli.
  rematore: 'bent over row', remata: 'bent over row', vogatore: 'row',
  alzata: 'raise', alzate: 'raise', sollevamento: 'raise',
  laterale: 'lateral', laterali: 'lateral',
  frontale: 'front', frontali: 'front',
  military: 'military', lento: 'press',
  piedi: 'standing', seduto: 'seated', seduta: 'seated',
  estensione: 'extension', estensioni: 'extension', sopra: 'overhead',
  neutro: 'neutral', neutra: 'neutral', martello: 'hammer',
  plank: 'plank',
  crunch: 'crunch',
  addominali: 'abdominal', addome: 'abdominal',
  piegamento: 'pushup', piegamenti: 'pushup',
  polpaccio: 'calf', polpacci: 'calf',
  petto: 'chest', pettorali: 'chest',
  schiena: 'back', dorsali: 'lat',
  gamba: 'leg', gambe: 'leg',
  spalla: 'shoulder', spalle: 'shoulder',
  bicipite: 'bicep', bicipiti: 'bicep',
  tricipite: 'tricep', tricipiti: 'tricep',
  gluteo: 'glute', glutei: 'glute',
  avambraccio: 'forearm', avambracci: 'forearm',
  bulgaro: 'bulgarian', bulgara: 'bulgarian',
  inclinata: 'incline', inclinato: 'incline',
  declinata: 'decline', declinato: 'decline',
  piana: 'flat', piano: 'flat',
  presa: 'grip', stretta: 'close', stretto: 'close',
  larga: 'wide', largo: 'wide',
  sumo: 'sumo', rumeno: 'romanian', rumena: 'romanian',
};

// Parole troppo generiche per distinguere un esercizio dall'altro (comprese
// preposizioni articolate italiane: "alla", "ai", "allo"...) piu' le comuni
// stopword inglesi/italiane. "up"/"down" NON sono qui perche' nel dataset
// sono spesso la parte che distingue l'esercizio ("Pull-Up", "Push-Up").
const STOPWORDS = new Set([
  'with', 'and', 'the', 'a', 'an', 'of', 'on', 'for', 'to', 'in', 'at', 'your', 'from', 'is', 'are',
  'exercise', 'exercises', 'movement', 'variation', 'workout', 'training',
  'su', 'con', 'del', 'della', 'dello', 'dei', 'delle', 'e', 'di', 'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'una',
  'da', 'al', 'allo', 'alla', 'ai', 'agli', 'alle', 'esercizio', 'esercizi',
]);

// Attrezzi cosi' "di default" che, quando compaiono nel nome del dataset ma
// non nella ricerca, non vanno considerati una vera discrepanza SOLO se la
// ricerca non ha gia' chiesto un attrezzo preciso (es. "Stacco da terra",
// senza attrezzo specificato -> va bene "Barbell Deadlift"). Se pero' la
// ricerca chiede esplicitamente un attrezzo diverso (es. "con manubri") un
// risultato con un attrezzo diverso da quello chiesto conta come discrepanza.
const EQUIPMENT_TOKENS = new Set(['barbell', 'dumbbell', 'bodyweight', 'machine']);

// Parole sempre neutre, a prescindere dall'attrezzo chiesto: "grip"/"medium"
// sono il modo standard di dire "presa normale" quando non specificato altro.
const NEUTRAL_DESCRIPTORS = new Set(['grip', 'medium']);

// Il dataset a volte abbrevia ("DB" invece di "Dumbbell", "Ab" invece di
// "Abdominal"): si normalizzano queste sigle alla parola intera cosi' il
// confronto funziona indipendentemente da quale forma usa il dataset.
const TOKEN_ALIASES = { db: 'dumbbell', ab: 'abdominal', abs: 'abdominal' };

// Suffissi che nel dataset a volte sono attaccati alla parola precedente
// ("Pullups") e a volte separati da uno spazio o trattino ("Pull-Up"): si
// uniscono sempre alla parola precedente cosi' il confronto non dipende da
// quale delle due forme usa il dataset o la traduzione.
const JOINABLE_SUFFIXES = new Set(['up', 'down']);

function glossarize(text) {
  return (text || '')
    .toLowerCase()
    .split(/\s+/)
    .map((w) => GYM_GLOSSARY_IT_EN[w.replace(/[^a-zàèéìòù]/g, '')] || w)
    .join(' ');
}

// Riduce alla radice le forme plurali piu' comuni ("raises" -> "raise",
// "dumbbells" -> "dumbbell", "crunches" -> "crunch") cosi' il confronto con
// il dataset (spesso al singolare) non fallisce solo per il plurale.
function stem(token) {
  if (token.length > 4 && /(ches|shes|xes|sses)$/.test(token)) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

function stripAccents(text) {
  return text
    .replace(/[àáâ]/g, 'a')
    .replace(/[èéê]/g, 'e')
    .replace(/[ìíî]/g, 'i')
    .replace(/[òóô]/g, 'o')
    .replace(/[ùúû]/g, 'u');
}

function tokenize(text) {
  const base = stripAccents((text || '').toLowerCase())
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(stem)
    .map((t) => TOKEN_ALIASES[t] || t)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));

  const tokens = [];
  for (let i = 0; i < base.length; i++) {
    if (i < base.length - 1 && JOINABLE_SUFFIXES.has(base[i + 1])) {
      tokens.push(base[i] + base[i + 1]);
      i += 1; // il suffisso e' gia' stato unito alla parola precedente
    } else {
      tokens.push(base[i]);
    }
  }
  return tokens;
}

// Punteggio di somiglianza (indice di Tversky) tra le parole cercate e il
// nome di un esercizio del dataset: premia quante parole della ricerca sono
// state trovate e penalizza le parole del dataset che restano senza
// corrispondenza, TRANNE quelle neutre (vedi NEUTRAL_DESCRIPTORS/EQUIPMENT_TOKENS)
// che da sole non bastano a considerare due esercizi diversi. Risultato 0-1:
// 1 = corrispondenza perfetta, 0 = nessuna parola in comune.
function scoreCandidate(queryTokens, name) {
  if (!queryTokens.length) return 0;
  const nameTokens = tokenize(name);
  if (!nameTokens.length) return 0;

  const querySet = new Set(queryTokens);
  const nameSet = new Set(nameTokens);

  let matched = 0;
  querySet.forEach((t) => { if (nameSet.has(t)) matched += 1; });
  if (!matched) return 0;

  const queryHasEquipment = queryTokens.some((t) => EQUIPMENT_TOKENS.has(t));
  const missing = querySet.size - matched;
  let extra = 0;
  nameSet.forEach((t) => {
    if (querySet.has(t) || NEUTRAL_DESCRIPTORS.has(t)) return;
    if (EQUIPMENT_TOKENS.has(t) && !queryHasEquipment) return; // attrezzo non richiesto: nessuna discrepanza
    extra += 1;
  });
  return matched / (matched + missing + extra);
}

const AUTO_MATCH_TEXT_THRESHOLD = 0.5;
const AUTO_MATCH_MUSCLE_BONUS = 0.12;

/**
 * Trova un solo abbinamento automatico nel dataset per un nome esercizio
 * generato dall'IA. A differenza di searchExerciseImages non c'e' un umano
 * che sceglie tra piu' opzioni: se nessun nome del dataset supera la soglia
 * minima di somiglianza si restituisce null (meglio nessuna foto che una
 * foto sbagliata) invece di indovinare il primo risultato qualsiasi.
 */
async function findAutoExerciseMatch(name, muscleGroupKeys) {
  const original = (name || '').trim();
  if (original.length < 2) return null;

  const dataset = await getDataset();
  const translated = await translateToEnglish(original);
  const glossaried = glossarize(original);

  const candidateTokenSets = [...new Set([translated, glossaried, original].filter(Boolean))]
    .map(tokenize)
    .filter((tokens) => tokens.length);
  if (!candidateTokenSets.length) return null;

  const groups = muscleGroupKeys || [];
  let best = null;
  let bestScore = 0;
  for (const e of dataset) {
    let textScore = 0;
    for (const tokens of candidateTokenSets) {
      textScore = Math.max(textScore, scoreCandidate(tokens, e.name));
    }
    if (textScore < AUTO_MATCH_TEXT_THRESHOLD) continue;
    const score = textScore + (groups.includes(e.muscle) ? AUTO_MATCH_MUSCLE_BONUS : 0);
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  if (!best) return null;

  // La foto (sopra) e' gia' pronta a questo punto: la traduzione della
  // descrizione e' un extra e non deve bloccare l'importazione se il
  // servizio di traduzione e' lento o sovraccarico. Con un timeout, nel
  // caso peggiore l'esercizio resta semplicemente senza descrizione.
  const description = await Promise.race([
    translateInstructionsToItalian(best.instructions),
    new Promise((resolve) => setTimeout(() => resolve(null), 4000)),
  ]);

  return {
    imageUrl: best.image ? IMAGE_BASE + best.image : null,
    description: description || null,
  };
}

window.MyGym = window.MyGym || {};
Object.assign(window.MyGym, { searchExerciseImages, isDatasetCached, translateInstructionsToItalian, findAutoExerciseMatch });

})();
