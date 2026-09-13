// Script classico (non un modulo ES): espone tutto su window.MyGym.
//
// L'immagine quadrata-verticale del resoconto mensile, disegnata con un canvas
// 1080x1920 e passata a navigator.share. Tutto avviene sul telefono: nessun
// server, nessuna immagine caricata da nessuna parte.
//
// Il criterio del disegno e' quello di una storia su Instagram: pochi numeri
// molto grandi, tanto spazio vuoto, e i colori delle medaglie come unico
// accento. A schermo piccolo si legge quello che risalta, il resto e' rumore.
(function () {

const { bodySvgHtml } = window.MyGym;

const W = 1080;
const H = 1920;

// I colori del tema scuro scritti a mano: la figura finisce dentro un'immagine
// che si guarda fuori dall'app, dove il tema chiaro dell'utente non c'entra
// niente e un fondo bianco sparirebbe sulla card scura.
const FIGURE_COLORS = {
  silhouette: 'rgba(255,255,255,0.13)',
  untrained: 'rgba(255,255,255,0.26)',
  outline: 'rgba(255,255,255,0.45)',
  zoneStroke: 'rgba(0,0,0,0.28)',
};

const BIANCO = '#f5f6fa';
const GRIGIO = 'rgba(245,246,250,0.62)';

// ---------- Utilita' di disegno ----------

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Non riesco a preparare l\'immagine.'));
    img.src = src;
  });
}

// I font arrivano da Google Fonts e il canvas non li aspetta: senza questa
// attesa la prima condivisione esce col font di sistema e la seconda no.
async function ensureFonts() {
  if (!document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load('800 96px Sora'),
      document.fonts.load('800 62px Sora'),
      document.fonts.load('600 34px Inter'),
      document.fonts.load('700 40px Inter'),
    ]);
    await document.fonts.ready;
  } catch (e) {
    // pazienza: si disegna col font di sistema, l'immagine resta leggibile
  }
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function panel(ctx, x, y, w, h, r) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawText(ctx, testo, x, y, font, color, align) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align || 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(testo, x, y);
}

// Rimpicciolisce finche' non ci sta: i chili di un mese pesante sono un numero
// molto piu' lungo di "3" allenamenti, e le tre colonne devono restare uguali.
function fitFont(ctx, testo, maxWidth, peso, dimensione, famiglia) {
  let size = dimensione;
  do {
    ctx.font = `${peso} ${size}px ${famiglia}`;
    if (ctx.measureText(testo).width <= maxWidth) break;
    size -= 4;
  } while (size > 24);
  return ctx.font;
}

function background(ctx) {
  ctx.fillStyle = '#0b0e1a';
  ctx.fillRect(0, 0, W, H);

  // Le stesse macchie sfocate che l'app ha dietro al vetro.
  const blob = (x, y, r, colore, alpha) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, colore);
    g.addColorStop(1, 'rgba(11,14,26,0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  };
  blob(120, 200, 720, '#7c3aed', 0.60);
  blob(980, 1560, 780, '#06b6d4', 0.45);
  blob(760, 820, 640, '#ec4899', 0.16);
}

// ---------- La figura del corpo ----------

async function bodyImage(side, scores, altezza) {
  const svg = bodySvgHtml(side, scores, {
    interactive: false,
    colors: FIGURE_COLORS,
    svgAttrs: ' xmlns="http://www.w3.org/2000/svg"',
  });
  if (!svg) return null;

  const vb = (svg.match(/viewBox="([^"]+)"/) || [])[1];
  if (!vb) return null;
  const [, , vbW, vbH] = vb.split(/\s+/).map(Number);
  const larghezza = Math.round(altezza * (vbW / vbH));

  // width e height espliciti: senza, alcuni browser disegnano l'SVG alla sua
  // misura di ripiego (300x150) e la figura esce schiacciata.
  const conMisure = svg.replace('<svg', `<svg width="${larghezza}" height="${altezza}"`);
  const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(conMisure)}`);
  return { img, larghezza, altezza };
}

// ---------- La card ----------

async function drawCard(recap) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  background(ctx);

  // --- intestazione: logo e nome ---
  const logo = await loadImage('icons/icon-192.png').catch(() => null);
  const titoloLogo = 'MyGym';
  ctx.font = '800 48px Sora, sans-serif';
  const largLogoTesto = ctx.measureText(titoloLogo).width;
  const lato = 78;
  const totale = (logo ? lato + 22 : 0) + largLogoTesto;
  let cursore = (W - totale) / 2;
  if (logo) {
    ctx.save();
    roundRectPath(ctx, cursore, 96, lato, lato, 22);
    ctx.clip();
    ctx.drawImage(logo, cursore, 96, lato, lato);
    ctx.restore();
    cursore += lato + 22;
  }
  drawText(ctx, titoloLogo, cursore, 154, '800 48px Sora, sans-serif', BIANCO, 'left');

  // --- mese ---
  const mese = recap.titolo.charAt(0).toUpperCase() + recap.titolo.slice(1);
  ctx.font = fitFont(ctx, mese, W - 160, 800, 92, 'Sora, sans-serif');
  drawText(ctx, mese, W / 2, 296, ctx.font, BIANCO);
  drawText(ctx, 'IL TUO MESE IN PALESTRA', W / 2, 348, '700 30px Inter, sans-serif', GRIGIO);

  // --- figura del corpo ---
  const figuraH = 700;
  panel(ctx, 60, 400, W - 120, figuraH + 60, 44);
  const fronte = await bodyImage('front', recap.scores, figuraH);
  const retro = await bodyImage('back', recap.scores, figuraH);
  const figure = [fronte, retro].filter(Boolean);
  if (figure.length) {
    const gap = 40;
    const largTot = figure.reduce((s, f) => s + f.larghezza, 0) + gap * (figure.length - 1);
    let x = (W - largTot) / 2;
    figure.forEach((f) => {
      ctx.drawImage(f.img, x, 430, f.larghezza, f.altezza);
      x += f.larghezza + gap;
    });
  }

  // --- i tre numeri ---
  const numeri = [
    [String(recap.allenamenti), recap.allenamenti === 1 ? 'allenamento' : 'allenamenti'],
    [recap.tempo, 'in palestra'],
    [recap.kg, 'kg sollevati'],
  ];
  const largCol = 320;
  const gapCol = 30;
  const inizio = (W - (largCol * 3 + gapCol * 2)) / 2;
  numeri.forEach(([valore, etichetta], i) => {
    const x = inizio + i * (largCol + gapCol);
    panel(ctx, x, 1200, largCol, 180, 36);
    ctx.font = fitFont(ctx, valore, largCol - 48, 800, 72, 'Sora, sans-serif');
    drawText(ctx, valore, x + largCol / 2, 1290, ctx.font, BIANCO);
    drawText(ctx, etichetta, x + largCol / 2, 1338, '600 26px Inter, sans-serif', GRIGIO);
  });

  // --- medaglie nuove ---
  // Tre e non tutte: sotto ci deve restare aria e il link in fondo, e una lista
  // lunga in una storia su Instagram non la legge nessuno comunque.
  const PRIMA_RIGA = 1548;
  const PASSO_RIGA = 70;
  const medaglie = recap.medaglie.slice(0, 3);
  const extra = recap.medaglie.length - medaglie.length;
  const ultimaRiga = PRIMA_RIGA + Math.max(0, medaglie.length - 1) * PASSO_RIGA;
  const fondoLista = extra > 0 ? ultimaRiga + 56 : ultimaRiga;
  panel(ctx, 60, 1430, W - 120, fondoLista + 28 - 1430, 44);
  drawText(ctx, 'MEDAGLIE DEL MESE', W / 2, 1494, '700 30px Inter, sans-serif', GRIGIO);

  if (!medaglie.length) {
    drawText(ctx, 'Nessun passaggio di livello', W / 2, PRIMA_RIGA, '600 36px Inter, sans-serif', BIANCO);
  } else {
    medaglie.forEach((m, i) => {
      const y = PRIMA_RIGA + i * PASSO_RIGA;
      drawText(ctx, m.ora.emoji, 130, y, '400 44px sans-serif', BIANCO, 'left');
      drawText(ctx, m.group.label, 198, y, '700 38px Inter, sans-serif', BIANCO, 'left');
      const passo = m.prima.key === 'da-allenare'
        ? m.ora.label.toLowerCase()
        : `${m.prima.label.toLowerCase()} → ${m.ora.label.toLowerCase()}`;
      drawText(ctx, passo, W - 100, y, '600 32px Inter, sans-serif', m.ora.color, 'right');
    });
    if (extra > 0) {
      const scritta = extra === 1 ? 'e un\'altra ancora' : `e altre ${extra}`;
      drawText(ctx, scritta, W / 2, fondoLista, '600 30px Inter, sans-serif', GRIGIO);
    }
  }

  // --- piede ---
  drawText(ctx, 'mmcodelab.github.io/MyGym/', W / 2, 1840, '700 36px Inter, sans-serif', '#06b6d4');

  return canvas;
}

function toBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Non sono riuscito a creare l\'immagine.'));
    }, 'image/png');
  });
}

// Ritorna 'share', 'download' o 'cancel', cosi' la vista sa se dire qualcosa.
async function shareRecapCard(recap) {
  await ensureFonts();
  const canvas = await drawCard(recap);
  const blob = await toBlob(canvas);

  const nome = `mygym-${recap.titolo.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.png`;
  const file = new File([blob], nome, { type: 'image/png' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `MyGym — ${recap.titolo}` });
      return 'share';
    } catch (err) {
      // Chi annulla il foglio di condivisione ha deciso: scaricargli comunque
      // un file nei download sarebbe l'opposto di quello che ha chiesto.
      if (err && err.name === 'AbortError') return 'cancel';
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return 'download';
}

window.MyGym = window.MyGym || {};
Object.assign(window.MyGym, { shareRecapCard });

})();
