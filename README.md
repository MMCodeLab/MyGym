# MyGym

<p align="center">
  <img src="icons/icon-512.png" width="160" alt="MyGym">
</p>

<h3 align="center">Il tuo diario di allenamento.</h3>

<p align="center">
  Organizza i tuoi allenamenti in giorni ed esercizi, con immagini illustrative.
</p>

---

## Cos'è

**MyGym** è una Progressive Web App (PWA) personale per organizzare gli allenamenti in palestra. Permette di creare **giorni** di allenamento (es. Lunedì, Martedì...) e assegnare a ciascuno gli **esercizi** da svolgere, con gruppo muscolare e immagine illustrativa trovata automaticamente.

Nessun account, nessuna pubblicità: solo uno strumento semplice per tenere organizzata la propria scheda.

## Funzionalità principali

- Elenco **giorni** di allenamento: crea, rinomina, elimina, con anteprima dei gruppi muscolari coinvolti.
- Dentro ogni giorno: aggiungi/rimuovi esercizi dalla tua libreria, imposta serie × ripetizioni.
- Libreria **esercizi** globale: crea un esercizio scegliendo nome, fino a 3 parti del corpo e immagine illustrativa suggerita automaticamente (con descrizione tradotta in italiano).
- **Inizia allenamento**: cronometro, registrazione serie×reps×kg per ogni esercizio con suggerimenti dal giorno scelto, riepilogo finale.
- **Storico allenamenti** e grafico dei progressi (Progressi → Allenamenti).
- **Misure del corpo** (Progressi → Misure): peso, altezza, massa grassa e le circonferenze che si prendono col metro, con data e ora registrate da sole a ogni misurazione, indice di massa corporea e grafico dell'andamento di ogni misura.
- **Virtual Personal Trainer**: genera una scheda su misura con l'IA (Groq) a partire da dati, obiettivo e livello — vedi [`cloudflare-worker/`](cloudflare-worker/worker.js) per la configurazione.
- **Impostazioni**: tema chiaro/scuro (scuro di default), esportazione/importazione backup in JSON.
- Installabile come app, con funzionamento offline.

## Privacy e dati

- Nessuna registrazione, nessun account.
- Nessun tracciamento e nessuna raccolta dati personali.
- Tutti i dati (giorni, esercizi, impostazioni) restano sul dispositivo, salvati in `localStorage`.
- Backup/ripristino manuale in JSON, sempre sotto il tuo controllo.

## Tecnologie

- HTML5, CSS3, JavaScript (script "classici", senza build step)
- `localStorage` per la persistenza dei dati
- Progressive Web App: manifest + service worker per l'installazione e l'uso offline
- [free-exercise-db](https://github.com/yuhonas/free-exercise-db) per le immagini illustrative degli esercizi, con traduzione automatica IT→EN via [MyMemory Translation API](https://mymemory.translated.net/)

## Come avviarla in locale

Puoi aprire `index.html` con doppio click: funziona subito, perché il codice usa script "classici" (non moduli ES).

Per la PWA vera e propria (installazione come app, funzionamento offline via service worker) serve però un server, anche minimo, perché i browser non attivano queste funzioni su `file://` per motivi di sicurezza. È incluso `serve.py`, che usa solo Python (già presente sul tuo sistema):

```bash
python serve.py
```

Poi apri **http://localhost:5500**. Per fermarlo, `Ctrl+C`. In alternativa va bene qualsiasi altro server statico (es. l'estensione "Live Server" di VS Code).

## Struttura del progetto

```
index.html                punto di ingresso
manifest.webmanifest       manifest PWA (nome, icone, colori)
sw.js                       service worker (funzionamento offline)
serve.py                    server locale di sviluppo
css/styles.css               design system: glassmorphism, temi, animazioni
js/
  app.js                    bootstrap dell'app
  state.js                  store dati + persistenza in localStorage
  router.js                  routing via hash (#/, #/day/:id, #/esercizi, #/allenamento, #/progressi, #/storico, #/misure, #/pt, #/impostazioni)
  components.js              helper UI condivisi (modali, toast, icone SVG)
  exercise-api.js            ricerca immagini esercizio + traduzione
  pwa-shell.js               avviso di nuova versione, stato offline, promemoria del backup
  views/
    home.js, day.js            giorni di allenamento
    exercises.js                libreria esercizi
    workout.js                  Inizia allenamento (cronometro, serie/reps/kg)
    workout-history.js          storico + grafico progressi
    progress.js                 Progressi: scorciatoie ad allenamenti e misure, record personali
    measurements.js             Misure: peso, altezza, circonferenze e grafico dell'andamento
    personal-trainer.js         Virtual Personal Trainer (IA via Cloudflare Worker)
    settings.js                 impostazioni
icons/                        icone PWA
cloudflare-worker/worker.js   proxy verso Groq per il Virtual Personal Trainer (chiave nascosta lato server)
wrangler.toml                 config per il deploy automatico del Worker (Cloudflare Workers Builds)
```

## Virtual Personal Trainer

Genera una scheda di allenamento con l'IA (modello Llama 3.3 via [Groq](https://groq.com), gratuito) a partire da età, peso, obiettivo, livello e giorni disponibili. Per funzionare usa un piccolo Cloudflare Worker (`mygym-pt`) che fa da proxy verso Groq, così la chiave API resta nascosta e non finisce mai nel codice pubblicato su GitHub.

Il Worker è collegato a questo repository tramite **Cloudflare Workers Builds**: ad ogni push su GitHub, Cloudflare lo ridistribuisce da solo leggendo [`wrangler.toml`](wrangler.toml) (nella radice) e [`cloudflare-worker/worker.js`](cloudflare-worker/worker.js) — nessun passaggio manuale da rifare. L'unica cosa impostata una volta sola nella dashboard di Cloudflare (Settings del Worker → Variables and Secrets) è il *secret* `GROQ_API_KEY`, che i push non toccano.

L'URL del Worker va incollato in [`js/views/personal-trainer.js`](js/views/personal-trainer.js) (costante `WORKER_URL`). Senza questo passaggio la sezione mostra un messaggio che lo spiega, il resto dell'app funziona comunque normalmente.

## Note tecniche: l'API per le foto degli esercizi

Per associare una foto a ogni esercizio sono state valutate tre opzioni:

- **Usata in questo progetto — [free-exercise-db](https://github.com/yuhonas/free-exercise-db)**: dataset open-source (dominio pubblico) con ~800 esercizi, ciascuno con nome, gruppo muscolare e foto reali. Nessuna API key né registrazione richieste: viene scaricato come singolo file JSON da jsDelivr e implementato in [`js/exercise-api.js`](js/exercise-api.js). La ricerca in italiano viene tradotta al volo con MyMemory Translation API prima di interrogare il dataset.
- **Scartata — [wger.de](https://wger.de/en/software/api)**: API pubblica gratuita con nomi anche in italiano, ma immagini scarse (disegni amatoriali in bianco e nero) e copertura limitata a 365 esercizi su migliaia.
- **Alternativa possibile in futuro — [ExerciseDB su RapidAPI](https://rapidapi.com/justin-WFnsXH_t6/api/exercisedb)**: illustrazioni/GIF anatomiche più curate e coerenti, ma richiede un account RapidAPI e una API key con limiti di richieste.

---

Fa parte della famiglia di app **My**, insieme a MyVerse, MyMoney, MySchool e MySite.
