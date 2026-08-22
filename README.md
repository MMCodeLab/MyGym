# MyGym — base di partenza

PWA per organizzare i tuoi allenamenti in **giorni** (es. Lunedì, Martedì...) con **esercizi** assegnati a ciascun giorno, gruppo muscolare e immagine illustrativa cercata automaticamente.

Nessun build step: HTML/CSS/JS puro, pensato così perché sulla macchina non risulta installato Node.js/npm. I dati restano sul dispositivo (`localStorage`).

## Come avviarla

Puoi aprire `index.html` con doppio click, esattamente come faresti con qualsiasi altra pagina HTML: funziona subito, perché il codice usa script "classici" (non moduli ES — vedi nota più sotto sul perché).

Per la PWA vera e propria (installazione come app, funzionamento offline via service worker) serve però un server, anche minimo, perché i browser non attivano queste funzioni su `file://` per motivi di sicurezza. È incluso `serve.py`, che usa solo Python (già presente sul tuo sistema):

```bash
python serve.py
```

Poi apri **http://localhost:5500**. Per fermarlo, `Ctrl+C`. In alternativa va bene qualsiasi altro server statico (es. l'estensione "Live Server" di VS Code, oppure `npx serve` se in futuro installi Node).

### Perché non erano usati i moduli ES (`import`/`export`)

La prima versione usava moduli ES (`<script type="module">`), lo standard moderno per organizzare il JS in file separati. Funzionano perfettamente da un server, ma **Chrome ed Edge bloccano il loro caricamento quando la pagina è aperta come file locale** (`file:///C:/...`) per policy di sicurezza (CORS) — la pagina restava quindi senza stile e senza logica, come hai visto. Per questo il codice è stato riscritto usando script "classici" (senza `import`/`export`, comunicano tra loro tramite un unico oggetto globale `window.MyGym`): identico risultato, ma compatibile sia con il doppio click sia con un server.

## Struttura del progetto

```
index.html              punto di ingresso
manifest.webmanifest     manifest PWA (nome, icone, colori)
sw.js                     service worker (funzionamento offline)
serve.py                  server locale di sviluppo
css/styles.css            design system: glassmorphism, temi, animazioni
js/
  app.js                  bootstrap dell'app
  state.js                store dati + persistenza in localStorage
  router.js                routing via hash (#/, #/day/:id, #/esercizi, #/impostazioni)
  components.js            helper UI condivisi (modali, toast, icone SVG)
  exercise-api.js          ricerca immagini esercizio (vedi sotto)
  views/
    home.js                elenco "giorni"
    day.js                 dettaglio giorno: esercizi assegnati, serie/ripetizioni, ordine
    exercises.js            libreria esercizi: crea/modifica/elimina, filtro per parte del corpo
    settings.js              tema chiaro/scuro, backup JSON, cancellazione dati
icons/                     icone PWA generate (nessuna dipendenza grafica esterna)
```

## L'API per le foto degli esercizi

Hai chiesto se esiste un'API che, dato il nome di un esercizio, restituisce una foto illustrativa. Sì, e ne ho valutate tre:

- **Usata in questo progetto — [free-exercise-db](https://github.com/yuhonas/free-exercise-db)**: dataset open-source (dominio pubblico) con ~800 esercizi, ciascuno con nome, gruppo muscolare e 1-2 immagini illustrative (foto reali, non disegni). Non serve nessuna API key né registrazione: viene scaricato come singolo file JSON da jsDelivr (CDN gratuita che serve i contenuti di GitHub) e le immagini vengono caricate direttamente da lì. È implementata in [`js/exercise-api.js`](js/exercise-api.js).
  - **Ricerca in italiano**: dato che i nomi nel dataset sono in inglese, il termine che scrivi viene tradotto automaticamente al volo con [MyMemory Translation API](https://mymemory.translated.net/) (gratuita, senza chiave, CORS abilitato) prima di cercare — puoi scrivere "panca piana" e trova comunque "Flat Bench...". Se la traduzione fallisce (es. sei offline) la ricerca prosegue comunque col termine originale.
- **Scartata — [wger.de](https://wger.de/en/software/api)**: applicativo open-source per il fitness con REST API pubblica gratuita e nomi disponibili anche in italiano. L'ho testata a fondo ma **scartata**: le immagini sono disegni amatoriali in bianco e nero di qualità piuttosto bassa, e coprono solo 365 esercizi su migliaia (la maggior parte delle ricerche non troverebbe nulla). In più i filtri di ricerca dell'istanza pubblica risultano rotti (ignorano i parametri `language`/`search`), quindi andrebbe comunque scaricato tutto il dataset e filtrato lato client.
- **Alternativa più ricca ma con registrazione — [ExerciseDB su RapidAPI](https://rapidapi.com/justin-WFnsXH_t6/api/exercisedb)**: non ufficiale ma molto usata, ha illustrazioni/GIF anatomiche moderne e coerenti (stile "app", non foto). Resta comunque solo in inglese. Richiede un account gratuito RapidAPI e una API key (con limiti di richieste). Se in futuro preferisci questo stile grafico al posto delle foto reali, è possibile integrarla in `exercise-api.js` — basta procurarsi la chiave e dirmelo.

## Cosa è già implementato

- Elenco **giorni** (crea, rinomina, elimina), con anteprima dei gruppi muscolari coinvolti.
- Dentro un giorno: aggiungi/rimuovi esercizi dalla tua libreria, imposta serie × ripetizioni, riordina.
- Libreria **esercizi** globale: crea un esercizio scegliendo nome, parte del corpo (scelta obbligatoria tra 12 gruppi muscolari) e immagine (suggerita dall'API o nessuna).
- **Impostazioni**: tema chiaro/scuro (scuro di default), esportazione/importazione backup in JSON, cancellazione dati.
- PWA installabile (manifest + icone + service worker con cache offline dell'app shell).

## Cosa manca / prossimi passi possibili

Questa è una base solida ma volutamente essenziale. Idee per le prossime iterazioni, da fare insieme:

- Drag & drop per riordinare gli esercizi (ora ci sono le frecce su/giù).
- Tracciamento dei carichi/pesi sessione per sessione (storico), non solo serie×ripetizioni target.
- Timer di recupero tra le serie.
- Statistiche/grafici sui progressi.
- Migrazione a un vero build step (Vite + framework) se in futuro installi Node.js — la struttura attuale è già modulare e si presta bene a una migrazione incrementale.
