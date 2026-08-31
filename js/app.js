// Script classico (non un modulo ES) caricato per ultimo: a questo punto
// window.MyGym contiene gia' store, componenti, router e tutte le viste.
(function () {

const { applyTheme, icon, initRouter } = window.MyGym;

// Tema applicato subito, prima del primo paint utile.
applyTheme();

// Corregge l'altezza reale della shell (vedi --app-vh in css/styles.css):
// iOS e alcuni Android, all'apertura della PWA o al ritorno in foreground,
// a volte riportano un'altezza di viewport non ancora aggiornata, lasciando
// uno spazio vuoto sotto la bottom nav finche' l'utente non scorre. Misuriamo
// l'altezza vera piu' volte, nei momenti in cui puo' cambiare.
function setAppHeight() {
  const h = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
  document.documentElement.style.setProperty('--app-vh', `${h}px`);
}
// Su alcuni WebKit (iOS, soprattutto da PWA installata) leggere l'altezza
// giusta non basta: il motore di rendering ricalcola davvero il layout solo
// quando arriva un vero evento di scroll. Lo simuliamo noi (spostamento di 1px
// e subito indietro, impercettibile) cosi' l'utente non deve farlo a mano.
function nudgeViewport() {
  const de = document.documentElement;
  // La posizione va conservata: questa funzione gira anche al ritorno in
  // foreground, e riportare in cima significherebbe far ricercare all'utente
  // l'esercizio che stava compilando.
  const y = window.scrollY;
  // Se la pagina e' piu' corta del viewport (es. un giorno senza esercizi,
  // vedi screenshot del bug) non c'e' nulla da scorrere: scrollTo sotto
  // sarebbe un no-op e non forzerebbe alcun ricalcolo. Garantiamo sempre un
  // filo di overflow finto solo per la durata del nudge. Usiamo innerHeight
  // (mai 0) e non clientHeight, che a script appena partito - prima che il
  // layout esista - puo' leggere 0.
  de.style.minHeight = `${window.innerHeight + 40}px`;
  window.scrollTo(0, y + 1);
  // setTimeout invece di requestAnimationFrame: rAF puo' non scattare mai se
  // la scheda non e' visibile/in primo piano nel momento in cui l'app si
  // apre (es. tornando da un'altra app), lasciando lo scroll bloccato a 1px.
  // Nessun altro codice imposta un min-height inline su <html>: pulire
  // sempre a stringa vuota (invece di salvare/ripristinare un valore
  // "precedente") evita che chiamate ravvicinate si accavallino e lascino un
  // valore intermedio incastrato.
  setTimeout(() => {
    window.scrollTo(0, y);
    de.style.minHeight = '';
  }, 16);
}
function refreshViewport() {
  setAppHeight();
  nudgeViewport();
}
setAppHeight();
window.addEventListener('resize', setAppHeight);
window.addEventListener('orientationchange', () => setTimeout(refreshViewport, 200));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) setTimeout(refreshViewport, 100);
});
if (window.visualViewport) window.visualViewport.addEventListener('resize', setAppHeight);

// Icone della bottom nav.
document.querySelectorAll('.nav-icon').forEach((el) => {
  el.innerHTML = icon(el.dataset.icon);
});

// Il router per primo: rende la schermata (ed eventualmente ripristina la
// posizione salvata) prima che partano le correzioni di altezza del viewport,
// che da li' in poi si limitano a conservare il punto in cui si e'.
initRouter();

refreshViewport();
requestAnimationFrame(() => requestAnimationFrame(refreshViewport));
setTimeout(refreshViewport, 50);
setTimeout(refreshViewport, 300);

// Il service worker richiede http/https: se la pagina e' aperta come file
// locale (file://) semplicemente non si registra, senza errori bloccanti.
const isLocalDev = ['localhost', '127.0.0.1'].includes(location.hostname);

if ('serviceWorker' in navigator) {
  if (isLocalDev) {
    // In sviluppo locale il service worker fa piu' danni che altro: mette in
    // cache i file e poi li riserve anche dopo che li hai modificati, dando
    // l'impressione che le modifiche non vengano applicate. Lo disattiviamo
    // e ripuliamo eventuali cache lasciate da una registrazione precedente,
    // cosi' si vede sempre l'ultima versione dei file.
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => reg.unregister());
    });
    if (window.caches) {
      caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
    }
  } else if (location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => {
        console.warn('Registrazione service worker fallita:', err);
      });
    });
  }
}

})();
