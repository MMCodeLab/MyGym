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
//   2. Tab "Settings" -> "Variables and Secrets" -> "Add".
//   3. Type: "Secret" (non "Text", cosi' resta cifrata).
//      Name: GROQ_API_KEY
//      Value: la tua chiave da https://console.groq.com/keys
//   4. Salva (ed esegui un deploy se richiesto).
//
// L'URL del Worker (tipo https://mygym-pt.<tuo-account>.workers.dev) si
// trova in cima alla pagina del Worker su Cloudflare e va incollato in
// js/views/personal-trainer.js (costante WORKER_URL).
//
// Nota: se aggiungi/modifichi il secret DOPO che il Worker e' gia' stato
// distribuito, potrebbe non agganciarsi alla versione gia' attiva finche'
// non parte una build nuova (un push, o "Retry deployment" dalla dashboard).

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
        // DEBUG TEMPORANEO — nessun dato sensibile: solo forma/lunghezza
        // della chiave usata, per capire perche' Groq la rifiuta. Da
        // rimuovere non appena risolto.
        const keyDebug = {
          bindingType: typeof env.GROQ_API_KEY,
          hasGetMethod: !!(env.GROQ_API_KEY && typeof env.GROQ_API_KEY.get === 'function'),
          resolvedType: typeof groqApiKey,
          length: groqApiKey ? groqApiKey.length : 0,
          prefix: groqApiKey ? groqApiKey.slice(0, 6) : null,
          suffix: groqApiKey ? groqApiKey.slice(-4) : null,
          hasWhitespace: groqApiKey ? /\s/.test(groqApiKey) : null,
          trimmedLength: groqApiKey ? groqApiKey.trim().length : 0,
        };
        return json({ error: 'Groq ha risposto con un errore.', detail, keyDebug }, 502, origin);
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
