// Script classico (non un modulo ES): espone tutto su window.MyGym.streak.
//
// La streak dei giorni di palestra. Non si salva da nessuna parte: si
// ricostruisce ogni volta dallo storico degli allenamenti, come i record, cosi'
// cancellando un allenamento sbagliato la streak si corregge da sola.
//
// Come funziona:
// - ogni giorno in cui ti alleni la streak cresce di uno;
// - un giorno intero senza palestra la fa addormentare (dormiente), il
//   secondo la ghiaccia (ghiacciata), il terzo la spegne e si riparte da zero;
// - allenandoti mentre dorme o e' ghiacciata torna accesa e riprende a
//   contare. Nei giorni saltati il numero resta fermo: e' in pausa.
// Oggi non conta come saltato finche' non e' finito: la giornata e' ancora
// aperta, e chi va in palestra la sera non deve vedersi la fiamma spenta a
// pranzo.
(function () {

const { store, escapeHtml, openModal } = window.MyGym;

// Quanti giorni interi di fila si possono saltare senza perdere la streak.
// Due giorni di riposo sono normali in palestra (il fine settimana, per
// dire): una streak che si perdesse per quelli non motiverebbe nessuno.
const MAX_SALTATI = 2;

// L'ordine conta: e' quello dei giorni saltati (0, 1, 2).
const STATI_VIVI = ['attiva', 'dormiente', 'ghiacciata'];

const STATI = {
  attiva: {
    label: 'Streak attiva',
    giorno: 'allenato',
    spiegazione: 'Ogni giorno in palestra la fa crescere di uno.',
  },
  dormiente: {
    label: 'Streak dormiente',
    giorno: 'streak dormiente',
    spiegazione: 'Un giorno saltato: la streak è in pausa. Allenati il giorno dopo e si risveglia.',
  },
  ghiacciata: {
    label: 'Streak ghiacciata',
    giorno: 'streak ghiacciata',
    spiegazione: 'Due giorni saltati: si è congelata. Hai ancora un giorno per salvarla.',
  },
  spenta: {
    label: 'Nessuna streak accesa',
  },
};

// ---------- Giorni ----------
// I giorni si contano come numeri interi presi dalla data locale: fra due
// date con l'ora legale di mezzo passano 23 o 25 ore, e un allenamento finito
// a mezzanotte e mezza e' di quel giorno, non del precedente.

const GIORNO_MS = 86400000;

function dayNumber(date) {
  const d = new Date(date);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / GIORNO_MS);
}

// ---------- Il calcolo ----------

function computeStreak(workouts, now) {
  const oggi = dayNumber(now || new Date());
  const allenati = [...new Set(workouts.map((w) => dayNumber(w.date)))]
    .filter((n) => n <= oggi)
    .sort((a, b) => a - b);

  // Le streak una dopo l'altra: si resta nella stessa finche' fra due giorni
  // di palestra non ci sono piu' di MAX_SALTATI giorni vuoti.
  const catene = [];
  allenati.forEach((n) => {
    const ultima = catene[catene.length - 1];
    if (ultima && n - ultima.ultimo - 1 <= MAX_SALTATI) {
      ultima.giorni.push(n);
      ultima.ultimo = n;
    } else {
      catene.push({ primo: n, ultimo: n, giorni: [n] });
    }
  });

  // Com'era la streak giorno per giorno, per i calendari: accesa nei giorni
  // di palestra, addormentata o ghiacciata in quelli saltati. La striscia
  // lega il primo e l'ultimo allenamento della stessa streak; i giorni in cui
  // si e' spenta restano fuori, cosi' si vede dove e' finita.
  const giorni = new Map();
  catene.forEach((c) => {
    const fatti = new Set(c.giorni);
    const lunga = c.giorni.length > 1;
    // Dopo l'ultimo allenamento si segnano solo i giorni gia' finiti.
    const fine = Math.max(c.ultimo, Math.min(c.ultimo + MAX_SALTATI, oggi - 1));
    let saltati = 0;
    for (let n = c.primo; n <= fine; n++) {
      saltati = fatti.has(n) ? 0 : saltati + 1;
      giorni.set(n, {
        stato: STATI_VIVI[saltati],
        striscia: lunga && n <= c.ultimo,
        inizio: lunga && n === c.primo,
        fine: lunga && n === c.ultimo,
      });
    }
  });

  const ultima = catene[catene.length - 1] || null;
  const saltati = ultima ? Math.max(0, oggi - ultima.ultimo - 1) : Infinity;
  const viva = saltati <= MAX_SALTATI;

  return {
    oggi,
    catene,
    giorni,
    stato: viva ? STATI_VIVI[saltati] : 'spenta',
    conta: viva ? ultima.giorni.length : 0,
    catena: viva ? ultima : null,
    // La streak appena spenta, per dire quanto era durata.
    finita: viva ? null : ultima,
    fattaOggi: viva && ultima.ultimo === oggi,
    record: catene.reduce((max, c) => Math.max(max, c.giorni.length), 0),
  };
}

function currentStreak() {
  return computeStreak(store.get().workouts);
}

function giorniLabel(n) {
  return `${n} ${n === 1 ? 'giorno' : 'giorni'}`;
}

// ---------- Le tre fiamme ----------
// Disegnate qui, prendendo spunto dall'immagine delle tre streak: la fiamma
// accesa lucida con la scintilla, quella viola che dorme con gli zZ, quella
// di cristallo coi fiocchi di neve. "spenta" e' la fiamma accesa senza colore
// (il grigio lo mette il CSS).
//
// Gli id dei gradienti cambiano a ogni disegno: la stessa fiamma compare in
// piu' punti della pagina, e un id doppio fa pescare al browser il gradiente
// di un'altra copia, magari nascosta, che non si vede.

const FIAMMA = 'M50 96C32 96 18 82 18 64.5C18 49.5 21 36.5 25 24C28.5 32.5 33.5 38.5 39.5 42C39.5 26.5 46 12.5 56.5 4C58.5 15.5 66 24.5 72.5 32.5C78.5 40 82 51 82 64.5C82 82 68 96 50 96Z';
const NUCLEO = 'M50 91.5C38.5 91.5 30.5 83.5 30.5 73.5C30.5 62 40 54 50.5 44.5C53 53 61 58 65.5 63.5C68.5 67 69.5 70.5 69.5 73.5C69.5 83.5 61.5 91.5 50 91.5Z';
const SCINTILLA = 'M84 30C80.5 30 78.5 27.5 78.5 24.5C78.5 20.5 81.5 17.5 85 12C86.5 17 89.5 19.5 89.5 24.5C89.5 27.5 87 30 84 30Z';
const GOCCIA = 'M50 96C31.5 96 18 82.5 18 65.5C18 47 30 34.5 39.5 24.5C43 20.5 45.5 15 46 8C52.5 14.5 55.5 20.5 57.5 25.5C60 24 61.5 21.5 62 18.5C71 27.5 82 43 82 65.5C82 82.5 68.5 96 50 96Z';

// Le facce del cristallo: i vertici della fiamma piu' qualche punto interno.
const VERTICI = {
  A: [50, 96], B: [18, 64.5], C: [25, 24], D: [39.5, 42], E: [56.5, 4], F: [72.5, 32.5], G: [82, 64.5],
  H: [46, 56], I: [61, 46], J: [33, 79], K: [66, 80], L: [54, 29], M: [71, 61], N: [50, 73],
};
const FACCE = [
  ['ELF', '#ffffff', 0.38],
  ['EDL', '#e6f7ff', 0.3],
  ['CDHB', '#1583d1', 0.22],
  ['DLIH', '#ffffff', 0.2],
  ['LFI', '#58b8f5', 0.25],
  ['FGMI', '#1583d1', 0.2],
  ['HIMN', '#ffffff', 0.3],
  ['BHNJ', '#58b8f5', 0.22],
  ['JNKA', '#ffffff', 0.14],
  ['MGKN', '#0d6fb8', 0.25],
  ['BJA', '#0d6fb8', 0.3],
  ['KGA', '#0a5fa0', 0.32],
];

let flameSeq = 0;

function num(n) {
  return Number(n.toFixed(2));
}

function facciaPath(vertici) {
  return `M${[...vertici].map((v) => VERTICI[v].join(' ')).join('L')}Z`;
}

// Sei bracci, ognuno con due rametti a meta'.
function fioccoPath(cx, cy, r) {
  let d = '';
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 2 + (Math.PI / 3) * i;
    d += `M${cx} ${cy}L${num(cx + r * Math.cos(a))} ${num(cy - r * Math.sin(a))}`;
    const bx = cx + r * 0.55 * Math.cos(a);
    const by = cy - r * 0.55 * Math.sin(a);
    [-0.8, 0.8].forEach((k) => {
      d += `M${num(bx)} ${num(by)}L${num(bx + r * 0.36 * Math.cos(a + k))} ${num(by - r * 0.36 * Math.sin(a + k))}`;
    });
  }
  return d;
}

function scheggiaPath(x, y, h) {
  return `M${x} ${y - h}L${num(x + h * 0.45)} ${y}L${x} ${y + h}L${num(x - h * 0.45)} ${y}Z`;
}

function riflesso(d, opacita = 0.38, spessore = 3.2) {
  return `<path d="${d}" fill="none" stroke="#fff" stroke-opacity="${opacita}" stroke-width="${spessore}" stroke-linecap="round"/>`;
}

// compact toglie quello che sta attorno alla fiamma (scintilla, zZ, fiocchi)
// e stringe l'inquadratura: sotto i 30px sarebbero solo puntini. animated
// accende i movimenti del CSS. xmlns c'e' sempre perche' la stessa stringa
// diventa anche un'immagine, nella foto da condividere.
function flameSvg(stato, { size = 48, compact = false, animated = false } = {}) {
  const id = `fiamma${++flameSeq}`;
  const viewBox = compact ? '14 2 72 96' : '0 0 100 100';
  const apertura = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${size}" height="${size}" aria-hidden="true" class="flame flame-${stato}${animated ? ' flame-anim' : ''}">`;

  if (stato === 'dormiente') {
    return apertura
      + `<defs><radialGradient id="${id}o" gradientUnits="userSpaceOnUse" cx="40" cy="48" r="62">`
      + '<stop offset="0" stop-color="#cdb8ff"/><stop offset=".42" stop-color="#9d6bff"/><stop offset="1" stop-color="#5b21d6"/>'
      + '</radialGradient></defs>'
      + `<path class="flame-body" d="${GOCCIA}" fill="url(#${id}o)"/>`
      + riflesso('M25 71C24 59 27 48 33 39')
      + '<g stroke="#f3ecff" stroke-width="3.4" stroke-linecap="round" fill="none" opacity=".92">'
      + '<path d="M31 66Q37.5 72.5 44 66"/><path d="M56 66Q62.5 72.5 69 66"/></g>'
      + (compact ? '' : '<g fill="none" stroke="#a78bfa" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">'
        + '<path class="flame-z1" d="M74 24h6l-6 7h6"/><path class="flame-z2" d="M84 6h10l-10 12h10"/></g>')
      + '</svg>';
  }

  if (stato === 'ghiacciata') {
    const facce = FACCE.map(([v, colore, opacita]) => `<path d="${facciaPath(v)}" fill="${colore}" fill-opacity="${opacita}"/>`).join('');
    const spigoli = FACCE.map(([v]) => facciaPath(v)).join('');
    return apertura
      + `<defs><linearGradient id="${id}o" gradientUnits="userSpaceOnUse" x1="42" y1="6" x2="58" y2="96">`
      + '<stop offset="0" stop-color="#f0fbff"/><stop offset=".45" stop-color="#9fdcff"/><stop offset="1" stop-color="#3aa6f0"/>'
      + `</linearGradient><clipPath id="${id}k"><path d="${FIAMMA}"/></clipPath></defs>`
      + `<path class="flame-body" d="${FIAMMA}" fill="url(#${id}o)"/>`
      + `<g clip-path="url(#${id}k)">${facce}<path d="${spigoli}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width=".9" stroke-linejoin="round"/></g>`
      + `<path d="${FIAMMA}" fill="none" stroke="#e8f8ff" stroke-opacity=".85" stroke-width="1.6" stroke-linejoin="round"/>`
      + (compact ? '' : '<g class="flame-flakes" stroke="#8fd6ff" stroke-width="1.8" stroke-linecap="round" fill="none">'
        + `<path d="${fioccoPath(11, 21, 7.5)}"/><path d="${fioccoPath(91, 50, 5.5)}"/><path d="${fioccoPath(88, 87, 6)}"/></g>`
        + `<g fill="#bfe9ff" opacity=".9"><path d="${scheggiaPath(87, 22, 5)}"/><path d="${scheggiaPath(9, 52, 4.5)}"/><path d="${scheggiaPath(93, 69, 4)}"/></g>`)
      + '</svg>';
  }

  return apertura
    + '<defs>'
    + `<radialGradient id="${id}o" gradientUnits="userSpaceOnUse" cx="46" cy="72" r="58">`
    + '<stop offset="0" stop-color="#ffc247"/><stop offset=".38" stop-color="#ff7b1c"/><stop offset=".72" stop-color="#ff4321"/><stop offset="1" stop-color="#d91c2a"/>'
    + '</radialGradient>'
    + `<radialGradient id="${id}c" gradientUnits="userSpaceOnUse" cx="49" cy="80" r="34">`
    + '<stop offset="0" stop-color="#fff7c2"/><stop offset=".45" stop-color="#ffd23f"/><stop offset="1" stop-color="#ff9a1a"/>'
    + '</radialGradient>'
    + `<linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff3d2a"/><stop offset="1" stop-color="#ff8a2a"/></linearGradient>`
    + '</defs>'
    + `<path class="flame-body" d="${FIAMMA}" fill="url(#${id}o)"/>`
    + (compact ? '' : `<path class="flame-spark" d="${SCINTILLA}" fill="url(#${id}s)"/>`)
    + `<path class="flame-core" d="${NUCLEO}" fill="url(#${id}c)"/>`
    + riflesso('M24 68C23 56 24 44 27 35')
    + riflesso('M38 77C37.5 71 39.5 65.5 43.5 61', 0.6, 2.4)
    + '</svg>';
}

// ---------- Calendari ----------
// Il mese di Progressi e la settimana di "Inizia allenamento" disegnano i
// giorni allo stesso modo: il pallino del giorno e, dietro, la striscia che
// lo lega agli altri giorni della stessa streak. col e' la colonna
// (0 = lunedi'): a capo della settimana la striscia si ferma sul bordo invece
// di uscire dalla riga.

function dayCellHtml(date, streak, { col = -1, isToday = false } = {}) {
  const n = dayNumber(date);
  const g = streak.giorni.get(n);
  const cls = g ? `streak-cell-${g.stato}` : (n > streak.oggi ? 'streak-cell-future' : 'streak-cell-empty');
  const titolo = date.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }) + (g ? ` — ${STATI[g.stato].giorno}` : '');
  const striscia = g && g.striscia
    ? ` in-band${g.inizio ? ' band-start' : ''}${g.fine ? ' band-end' : ''}${col === 0 ? ' band-row-start' : ''}${col === 6 ? ' band-row-end' : ''}`
    : '';
  return `<span class="streak-day${striscia}"><span class="streak-cell ${cls}${isToday ? ' streak-cell-today' : ''}" title="${escapeHtml(titolo)}">${date.getDate()}</span></span>`;
}

function legendHtml() {
  return `
    <div class="streak-legend">
      ${STATI_VIVI.map((s) => `<span>${flameSvg(s, { size: 16, compact: true })}${s === 'attiva' ? 'allenato' : s}</span>`).join('')}
    </div>`;
}

// ---------- Card in Progressi ----------

function cardHint(streak) {
  switch (streak.stato) {
    case 'attiva':
      return streak.fattaOggi
        ? 'Oggi l\'hai già nutrita: torna domani per farla crescere.'
        : 'Allenati oggi per farla crescere. Se riposi, domani la trovi addormentata.';
    case 'dormiente':
      return 'Ieri niente palestra e si è addormentata: allenati oggi per risvegliarla.';
    case 'ghiacciata':
      return 'Due giorni senza palestra: si è congelata. Oggi è l\'ultimo giorno per salvarla!';
    default:
      return streak.finita
        ? `L'ultima è durata ${giorniLabel(streak.finita.giorni.length)}. Allenati per accenderne una nuova.`
        : 'Allenati per accendere la fiamma: ogni giorno in palestra la fa crescere.';
  }
}

function recordLine(streak) {
  if (streak.conta > 1 && streak.conta === streak.record) return 'È la tua streak più lunga di sempre';
  if (streak.record > streak.conta && streak.record > 1) return `Record: ${giorniLabel(streak.record)}`;
  return '';
}

function cardHtml() {
  const streak = currentStreak();
  const { stato, conta } = streak;
  const record = recordLine(streak);
  return `
    <div class="card glass streak-card streak-card-${stato}" id="streak-card" role="button" aria-label="Come funziona la streak">
      <span class="streak-card-flame">${flameSvg(stato, { size: 84, animated: stato !== 'spenta' })}</span>
      <div class="streak-card-text">
        <div class="streak-card-count">${conta ? `<strong>${conta}</strong> ${conta === 1 ? 'giorno' : 'giorni'} di streak` : escapeHtml(STATI.spenta.label)}</div>
        ${conta ? `<div class="streak-card-state">${escapeHtml(STATI[stato].label)}</div>` : ''}
        <div class="streak-card-hint">${escapeHtml(cardHint(streak))}</div>
        ${record ? `<div class="streak-card-record">${escapeHtml(record)}</div>` : ''}
      </div>
    </div>`;
}

// Le stesse tre fiamme dell'immagine da cui sono nate, con due righe per
// ciascuna: e' l'unico posto in cui le regole si leggono tutte insieme.
function openInfoModal() {
  openModal({
    title: 'Come funziona la streak',
    bodyHtml: `
      <div class="streak-info">
        ${STATI_VIVI.map((s) => `
          <div class="streak-info-row">
            ${flameSvg(s, { size: 64 })}
            <div class="streak-info-text">
              <strong>${escapeHtml(STATI[s].label)}</strong>
              <span>${escapeHtml(STATI[s].spiegazione)}</span>
            </div>
          </div>`).join('')}
      </div>
      <p class="text-secondary streak-info-note">Al terzo giorno senza palestra si spegne e si riparte da zero.</p>
    `,
  });
}

function bindCard(container) {
  const card = container.querySelector('#streak-card');
  if (card) card.addEventListener('click', openInfoModal);
}

// ---------- Fiammella in alto ----------
// Si vede da ogni schermata, perche' una streak funziona se ce l'hai sotto
// gli occhi. Chi non si e' ancora mai allenato non la vede: una fiamma grigia
// su un'app appena installata sarebbe solo un rimprovero.

function renderChip() {
  const chip = document.getElementById('streak-chip');
  if (!chip) return;
  const streak = currentStreak();
  if (!streak.catene.length) {
    chip.hidden = true;
    return;
  }
  // Si ridisegna solo se e' cambiato qualcosa: lo store avvisa a ogni serie
  // segnata, e rifare l'SVG ogni volta farebbe solo lavorare il telefono.
  const firma = `${streak.stato}:${streak.conta}`;
  chip.hidden = false;
  if (chip.dataset.firma === firma) return;
  chip.dataset.firma = firma;
  chip.className = `streak-chip streak-chip-${streak.stato}`;
  chip.innerHTML = `${flameSvg(streak.stato, { size: 22, compact: true })}<span>${streak.conta}</span>`;
  chip.setAttribute('aria-label', streak.conta
    ? `${STATI[streak.stato].label}: ${giorniLabel(streak.conta)}`
    : STATI.spenta.label);
}

// Chiamata da app.js all'avvio. Il ritorno dallo sfondo e' anche il momento
// in cui puo' essere cambiato il giorno: la fiammella si riguarda li'.
function init() {
  renderChip();
  store.onChange(renderChip);
  window.addEventListener('hashchange', renderChip);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) renderChip();
  });
}

window.MyGym = window.MyGym || {};
window.MyGym.streak = {
  computeStreak, currentStreak, flameSvg, dayCellHtml, legendHtml, cardHtml, bindCard, init,
};

})();
