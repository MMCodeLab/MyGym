// Traguardi, medaglie e figura del corpo: la parte "da manuale di palestra"
// della mappa dei muscoli, tenuta fuori dalle viste perche' la usano sia
// Progressi sia il resoconto mensile, che deve poterla disegnare anche dentro
// un'immagine da condividere.
//
// Script classico (non un modulo ES): espone tutto su window.MyGym.
// Le figure vengono da una mappa anatomica open source (js/body-paths.js:
// react-native-body-highlighter, licenza MIT, (c) 2022 ELABBASSI Hicham): di
// quel progetto usiamo solo i tracciati, medaglie e interazione sono nostre.
(function () {

const { store, MUSCLE_GROUPS, escapeHtml } = window.MyGym;

// Ogni pezzo anatomico ricade in un gruppo muscolare di MyGym.
const GROUP_BY_SLUG = {
  chest: 'petto',
  trapezius: 'trapezio',
  deltoids: 'spalle',
  biceps: 'bicipiti',
  triceps: 'tricipiti',
  forearm: 'avambracci',
  abs: 'addominali',
  obliques: 'addominali',
  'upper-back': 'schiena',
  'lower-back': 'schiena',
  gluteal: 'glutei',
  quadriceps: 'gambe',
  hamstring: 'gambe',
  adductors: 'gambe',
  calves: 'polpacci',
  tibialis: 'polpacci',
};
// Testa, collo, mani, piedi e articolazioni non si allenano: restano sagoma.
const NEUTRAL_SLUGS = ['head', 'hair', 'neck', 'hands', 'feet', 'knees', 'ankles'];

const TIERS = [
  { key: 'da-allenare', label: 'Da allenare', art: 'la prima medaglia', emoji: '💤', color: 'rgba(255,255,255,.16)' },
  { key: 'bronzo',   label: 'Bronzo',   art: 'il bronzo',   emoji: '🥉', color: '#c9803f' },
  { key: 'argento',  label: 'Argento',  art: "l'argento",   emoji: '🥈', color: '#c3ccd8' },
  { key: 'oro',      label: 'Oro',      art: "l'oro",       emoji: '🥇', color: '#f4b740' },
  { key: 'diamante', label: 'Diamante', art: 'il diamante', emoji: '💎', color: '#5ed9f5' },
  { key: 'platino',  label: 'Platino',  art: 'il platino',  emoji: '👑', color: '#c4b5fd' },
];

// Traguardi: per ogni medaglia un carico e delle ripetizioni precise, uguali
// per tutti. Niente peso corporeo di mezzo, cosi' l'obiettivo si capisce al
// volo e non cambia se ingrassi o dimagrisci.
// Ordine: bronzo, argento, oro, diamante, platino.
const STANDARDS = {
  petto: { ref: 'Panca piana',
    maschio: [[40, 8], [60, 8], [80, 6], [100, 5], [120, 3]],
    femmina: [[20, 8], [30, 8], [40, 6], [50, 5], [60, 3]] },
  schiena: { ref: 'Rematore o trazioni zavorrate',
    maschio: [[40, 8], [60, 8], [80, 6], [100, 5], [120, 3]],
    femmina: [[20, 8], [30, 8], [40, 6], [50, 5], [60, 3]] },
  trapezio: { ref: 'Scrollate',
    maschio: [[40, 12], [70, 10], [100, 8], [140, 6], [180, 5]],
    femmina: [[25, 12], [45, 10], [65, 8], [90, 6], [115, 5]] },
  spalle: { ref: 'Lento avanti',
    maschio: [[25, 8], [40, 8], [55, 6], [70, 5], [85, 3]],
    femmina: [[12, 8], [20, 8], [30, 6], [38, 5], [45, 3]] },
  bicipiti: { ref: 'Curl con bilanciere',
    maschio: [[20, 10], [30, 10], [40, 8], [50, 6], [60, 5]],
    femmina: [[10, 10], [15, 10], [22, 8], [28, 6], [35, 5]] },
  tricipiti: { ref: 'French press o panca stretta',
    maschio: [[20, 10], [35, 10], [50, 8], [65, 6], [80, 5]],
    femmina: [[10, 10], [18, 10], [26, 8], [34, 6], [42, 5]] },
  avambracci: { ref: 'Curl inverso',
    maschio: [[15, 12], [25, 12], [35, 10], [45, 8], [55, 6]],
    femmina: [[8, 12], [14, 12], [20, 10], [26, 8], [32, 6]] },
  addominali: { ref: 'Crunch ai cavi',
    maschio: [[15, 12], [25, 12], [40, 10], [55, 8], [70, 6]],
    femmina: [[8, 12], [15, 12], [22, 10], [30, 8], [38, 6]] },
  glutei: { ref: 'Hip thrust o stacco',
    maschio: [[60, 10], [100, 8], [140, 6], [180, 5], [220, 3]],
    femmina: [[40, 10], [70, 8], [100, 6], [130, 5], [160, 3]] },
  gambe: { ref: 'Squat',
    maschio: [[60, 8], [90, 6], [120, 5], [150, 4], [180, 3]],
    femmina: [[40, 8], [60, 6], [80, 5], [100, 4], [120, 3]] },
  polpacci: { ref: 'Calf raise',
    maschio: [[40, 15], [70, 15], [100, 12], [140, 10], [180, 8]],
    femmina: [[25, 15], [45, 15], [65, 12], [90, 10], [115, 8]] },
};

function estimated1RM(weight, reps) {
  if (!weight || !reps) return 0;
  return weight * (1 + reps / 30);
}

function targetsFor(groupKey) {
  const std = STANDARDS[groupKey];
  return std ? std[store.get().sex === 'femmina' ? 'femmina' : 'maschio'] : null;
}

// Il traguardo si scrive com'e' ("100 kg x 5"), ma per assegnarlo si confronta
// la forza espressa: chi fa 110 x 3 e' piu' forte di chi fa 100 x 5 e non puo'
// restare indietro solo perche' ha scelto un'altra serie.
function tierFor(groupKey, oneRM) {
  const t = targetsFor(groupKey);
  if (!t || !oneRM) return TIERS[0];
  let idx = 0;
  t.forEach(([kg, reps], i) => { if (oneRM >= estimated1RM(kg, reps) - 0.001) idx = i + 1; });
  return TIERS[idx];
}

function nextGoalFor(groupKey, oneRM) {
  const t = targetsFor(groupKey);
  if (!t) return null;
  for (let i = 0; i < t.length; i++) {
    const [kg, reps] = t[i];
    if ((oneRM || 0) < estimated1RM(kg, reps)) return { tier: TIERS[i + 1], kg, reps };
  }
  return null;
}

// Si puo' passare una raccolta di migliori gia' calcolata su un pezzo dello
// storico: e' cosi' che il resoconto mensile sa a che livello eri prima che il
// mese cominciasse.
function muscleScores(bests) {
  const migliori = bests || store.getMuscleBests();
  const out = {};
  MUSCLE_GROUPS.forEach((g) => {
    const best = migliori[g.key] || null;
    out[g.key] = {
      group: g,
      best,
      tier: tierFor(g.key, best && best.oneRM),
      goal: nextGoalFor(g.key, best && best.oneRM),
      misurabile: !!STANDARDS[g.key],
    };
  });
  return out;
}

// L'SVG della figura, senza cornice. Le opzioni:
//   selected      gruppo muscolare da evidenziare
//   interactive   false toglie i data-muscle: nel resoconto non si tocca niente
//   colors        scrive i colori come attributi invece di lasciarli al CSS.
//                 Serve all'immagine da condividere: serializzando l'SVG per
//                 disegnarlo su un canvas il foglio di stile non lo segue piu',
//                 e senza questi attributi la figura verrebbe fuori bianca.
//   svgAttrs      attributi in piu' sul tag <svg> (xmlns, width, height)
function bodySvgHtml(side, scores, options) {
  const opt = options || {};
  const sex = store.get().sex === 'femmina' ? 'femmina' : 'maschio';
  const figura = (window.BODY_PATHS || {})[sex] && window.BODY_PATHS[sex][side];
  if (!figura) return '';

  const c = opt.colors || null;

  const sagoma = figura.parts
    .filter((part) => NEUTRAL_SLUGS.includes(part.slug))
    .map((part) => part.d.map((d) => `<path d="${d}" />`).join('')).join('');

  const perGruppo = new Map();
  figura.parts.forEach((part) => {
    const key = GROUP_BY_SLUG[part.slug];
    if (!key) return;
    if (!perGruppo.has(key)) perGruppo.set(key, []);
    perGruppo.get(key).push(...part.d);
  });

  const muscoli = [...perGruppo.entries()].map(([key, ds]) => {
    const sc = scores[key];
    const spento = sc.tier.key === 'da-allenare';
    const classi = ['muscle-zone'];
    if (spento) classi.push('is-untrained');
    if (key === opt.selected) classi.push('is-active');
    if (opt.interactive === false) classi.push('is-static');
    const fill = spento ? (c ? c.untrained : null) : sc.tier.color;
    return `<g class="${classi.join(' ')}"${opt.interactive === false ? '' : ` data-muscle="${key}"`}${fill ? ` fill="${fill}"` : ''}${c ? ` stroke="${c.zoneStroke}" stroke-width="1"` : ''}>
      <title>${escapeHtml(sc.group.label)} — ${sc.tier.label}</title>
      ${ds.map((d) => `<path d="${d}" />`).join('')}
    </g>`;
  }).join('');

  return `<svg${opt.svgAttrs || ''} class="body-svg" viewBox="${figura.viewBox}" role="img" aria-label="Corpo visto ${side === 'front' ? 'di fronte' : 'di spalle'}">
      <g class="body-silhouette"${c ? ` fill="${c.silhouette}"` : ''}>${sagoma}</g>
      ${muscoli}
      <path class="body-outline" d="${figura.outline}"${c ? ` fill="none" stroke="${c.outline}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"` : ''} />
    </svg>`;
}

function bodyFigureHtml(side, scores, options) {
  const svg = bodySvgHtml(side, scores, options);
  if (!svg) return '';
  return `
    <div class="body-figure">
      <div class="body-figure-label">${side === 'front' ? 'Fronte' : 'Retro'}</div>
      ${svg}
    </div>`;
}

window.MyGym = window.MyGym || {};
Object.assign(window.MyGym, {
  TIERS, STANDARDS, estimated1RM, tierFor, nextGoalFor, muscleScores, bodySvgHtml, bodyFigureHtml,
});

})();
