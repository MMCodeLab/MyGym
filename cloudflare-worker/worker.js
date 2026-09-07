// MyGym — Virtual Personal Trainer — Cloudflare Worker
//
// Fa da proxy verso l'API di Groq, cosi' la chiave API resta nascosta
// (salvata come "secret" su Cloudflare) e non finisce mai nel codice
// statico dell'app pubblicato su GitHub.
//
// Distribuzione: il Worker "mygym-pt" e' collegato al repository GitHub
// tramite Cloudflare Workers Builds (Settings -> Build, gia' configurato).
// Ad ogni push su GitHub, Cloudflare esegue da solo "npx wrangler deploy"
// leggendo questo file tramite wrangler.toml nella radice del repo — non
// serve incollare nulla a mano nella dashboard.
//
// L'UNICO passaggio manuale, da fare una volta sola nella dashboard
// (e che i push successivi non toccano):
//   1. https://dash.cloudflare.com -> Workers e Pages -> "mygym-pt".
//   2. Tab "Settings" -> nella sidebar della pagina Settings, voce "Runtime"
//      (NON la voce generica in cima, e NON "Build": sono tre pannelli
//      diversi con nomi simili. Solo "Runtime" e' quello letto dal Worker
//      quando risponde a una richiesta — stessa impostazione usata da
//      MySchool per il suo worker "myschool-groq-proxy").
//   3. "Runtime variables and secrets" -> "Add variable".
//   4. Type: "Secret" (non "Text", cosi' resta cifrata).
//      Name: GROQ_API_KEY
//      Value: la tua chiave da https://console.groq.com/keys
//   5. Salva. Non serve un binding "Secrets Store" — e' un prodotto diverso,
//      pensato per condividere un secret tra piu' Worker, e per un singolo
//      Worker come questo aggiunge solo complicazioni inutili.
//
// L'URL del Worker (tipo https://mygym-pt.<tuo-account>.workers.dev) si
// trova in cima alla pagina del Worker su Cloudflare e va incollato in
// js/views/personal-trainer.js (costante WORKER_URL).

const MODEL = 'openai/gpt-oss-120b';

const MUSCLE_KEYS = [
  'petto', 'schiena', 'gambe', 'spalle', 'bicipiti', 'tricipiti',
  'addominali', 'glutei', 'polpacci', 'avambracci', 'cardio', 'altro',
];

const SYSTEM_PROMPT = `Sei un personal trainer esperto e prudente. Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo, con esattamente questa struttura:
{
  "note": "breve nota introduttiva del personal trainer, 2-3 frasi in italiano",
  "days": [
    {
      "name": "Nome del giorno, es. Giorno 1 - Petto e Tricipiti",
      "exercises": [
        { "name": "Nome esercizio in italiano", "muscleGroups": ["petto"], "sets": 4, "reps": 10 }
      ]
    }
  ]
}
Regole:
- "muscleGroups" puo' contenere solo valori tra: ${MUSCLE_KEYS.join(', ')}. Massimo 3 per esercizio.
- Crea un numero di "days" pari ai giorni di allenamento a settimana indicati dall'utente.
- Ogni giorno deve avere tra 4 e 7 esercizi, adatti a obiettivo, livello e attrezzatura indicati.
- "sets" e "reps" sono numeri interi ragionevoli per l'obiettivo indicato.
- Se l'utente indica infortuni o limitazioni, evita esercizi rischiosi per quella zona.
- Non aggiungere alcun campo oltre a quelli sopra elencati.`;

function buildUserPrompt(p) {
  return `Crea una scheda di allenamento personalizzata per questa persona:
- Nome: ${p.name || 'utente'}
- Eta': ${p.age || 'non indicata'}
- Peso: ${p.weight || 'non indicato'} kg
- Altezza: ${p.height || 'non indicata'} cm
- Sesso: ${p.gender || 'non indicato'}
- Obiettivo: ${p.goal || 'non indicato'}
- Livello di esperienza: ${p.level || 'non indicato'}
- Giorni di allenamento a settimana: ${p.daysPerWeek || 3}
- Attrezzatura disponibile: ${p.equipment || 'non indicata'}
- Note, preferenze o infortuni: ${p.notes || 'nessuna'}`;
}

// ---------------------------------------------------------------------------
// Sezione "Cibo": riconoscere un piatto da una foto e calcolarne i valori.
// Sono due passaggi separati apposta. Il primo guarda la foto e propone gli
// alimenti con una stima dei grammi; l'utente li corregge; il secondo calcola i
// valori su quei grammi confermati. E' li' che si guadagna la precisione: da
// una foto non si vedono ne' il peso reale ne' i condimenti.
// ---------------------------------------------------------------------------
const FOOD_PHOTO_PROMPT = `Sei un nutrizionista che guarda la foto di un piatto.
Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo:
{
  "piatto": "nome del piatto in italiano",
  "alimenti": [
    { "nome": "alimento in italiano", "grammi": 120, "nota": "come hai stimato la quantita', massimo 6 parole" }
  ],
  "incerto": "cosa non riesci a distinguere o potrebbe essere nascosto, una frase"
}
Regole:
- elenca gli alimenti separatamente (pasta, sugo, olio, formaggio...), non il piatto intero;
- includi anche i condimenti che presumi ci siano, dicendolo in "nota";
- "grammi" e' la tua stima migliore guardando le proporzioni nel piatto;
- se la foto non contiene cibo, rispondi con "alimenti": [] e spiegalo in "incerto".`;

const FOOD_VALUES_PROMPT = `Sei un nutrizionista. Ricevi una lista di alimenti con i grammi gia' confermati dall'utente.
Rispondi SOLO con un oggetto JSON valido:
{
  "alimenti": [
    { "nome": "", "grammi": 0, "kcal": 0, "proteine": 0, "carboidrati": 0, "grassi": 0, "fibre": 0 }
  ],
  "totale": { "kcal": 0, "proteine": 0, "carboidrati": 0, "grassi": 0, "fibre": 0 },
  "nota": "una frase sull'affidabilita' della stima"
}
Regole:
- usa valori nutrizionali medi per l'alimento come descritto nel nome;
- i macronutrienti sono in grammi, arrotondati a una cifra decimale;
- "totale" e' la somma esatta delle righe;
- non aggiungere altri campi.`;

// Il nome del modello con la vista non lo scriviamo qui: cambierebbe da solo
// nel giro di qualche mese. Lo chiediamo a Groq e teniamo il primo che dal nome
// risulta multimodale. La scelta resta in memoria finche' il Worker vive.
const VISION_HINTS = ['vision', 'scout', 'maverick', 'llava', 'pixtral', 'qwen', 'llama-4', 'gemma-3'];
let visionModelCache = null;

async function pickVisionModel(apiKey) {
  if (visionModelCache) return visionModelCache;
  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const ids = (data.data || []).map((m) => m.id);
  visionModelCache = ids.find((id) => VISION_HINTS.some((h) => id.toLowerCase().includes(h))) || null;
  return visionModelCache;
}

async function askGroq(apiKey, model, messages, temperature) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature, response_format: { type: 'json_object' } }),
  });
  const testo = await res.text();
  if (!res.ok) return { errore: testo };
  const data = JSON.parse(testo);
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  return content ? { content } : { errore: 'Risposta vuota dal modello.' };
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Metodo non consentito, usa POST.' }, 405, origin);
    }
    // I binding "Secrets Store" di Cloudflare non sono una stringa diretta:
    // espongono un metodo .get() che restituisce il valore vero (async). I
    // vecchi Worker Secret "classici" invece SONO gia' una stringa. Gestiamo
    // entrambi i casi, cosi' funziona a prescindere dal tipo di binding.
    const groqApiKey = env.GROQ_API_KEY && typeof env.GROQ_API_KEY.get === 'function'
      ? await env.GROQ_API_KEY.get()
      : env.GROQ_API_KEY;

    if (!groqApiKey) {
      return json({ error: 'GROQ_API_KEY non configurata sul Worker.' }, 500, origin);
    }

    let profile;
    try {
      profile = await request.json();
    } catch (e) {
      return json({ error: 'Corpo della richiesta non e\' JSON valido.' }, 400, origin);
    }

    // La sezione "Cibo" manda un "task": senza, la richiesta e' quella storica
    // del Virtual PT e prosegue come ha sempre fatto.
    if (profile.task === 'cibo-foto') {
      if (!profile.image) return json({ error: 'Manca la foto.' }, 400, origin);
      const model = await pickVisionModel(groqApiKey);
      if (!model) {
        return json({ error: 'Nessun modello con la vista disponibile su questo account Groq.' }, 502, origin);
      }
      const out = await askGroq(groqApiKey, model, [
        { role: 'system', content: FOOD_PHOTO_PROMPT },
        { role: 'user', content: [
          { type: 'text', text: 'Che cosa c\'e\' in questo piatto?' },
          { type: 'image_url', image_url: { url: profile.image } },
        ] },
      ], 0.2);
      if (out.errore) {
        // Un limite di richieste al minuto non dice niente sul modello: la
        // scelta si azzera solo se l'errore riguarda il modello o le immagini,
        // cosi' al giro dopo se ne cerca un altro davvero utile.
        if (!/rate.?limit|too many requests/i.test(out.errore)) visionModelCache = null;
        return json({ error: 'Groq ha risposto con un errore.', detail: out.errore, model }, 502, origin);
      }
      return new Response(out.content, { headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    if (profile.task === 'cibo-valori') {
      const alimenti = Array.isArray(profile.alimenti) ? profile.alimenti : [];
      if (!alimenti.length) return json({ error: 'Nessun alimento da calcolare.' }, 400, origin);
      const out = await askGroq(groqApiKey, MODEL, [
        { role: 'system', content: FOOD_VALUES_PROMPT },
        { role: 'user', content: JSON.stringify({ alimenti }) },
      ], 0.2);
      if (out.errore) {
        return json({ error: 'Groq ha risposto con un errore.', detail: out.errore }, 502, origin);
      }
      return new Response(out.content, { headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    try {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(profile) },
          ],
          temperature: 0.6,
          response_format: { type: 'json_object' },
        }),
      });

      if (!groqRes.ok) {
        const detail = await groqRes.text();
        return json({ error: 'Groq ha risposto con un errore.', detail }, 502, origin);
      }

      const data = await groqRes.json();
      const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!content) {
        return json({ error: 'Risposta vuota dal modello.' }, 502, origin);
      }

      // response_format json_object garantisce che "content" sia gia' JSON valido.
      return new Response(content, { headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } });
    } catch (err) {
      return json({ error: 'Errore imprevisto nel Worker.', detail: String(err) }, 500, origin);
    }
  },
};
