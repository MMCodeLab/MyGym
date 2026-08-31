// Script classico (non un modulo ES) caricato per ultimo: a questo punto
// window.MyGym contiene gia' store, componenti, router e tutte le viste.
(function () {

const { applyTheme, icon, initRouter } = window.MyGym;

// Tema applicato subito, prima del primo paint utile.
applyTheme();

// Misura l'altezza vera del viewport e la passa al CSS (--app-vh in
// css/styles.css), perche' iOS e alcuni Android riportano un'altezza non
// ancora aggiornata all'apertura della PWA.
//
// Qui non si tocca piu' nient'altro. Prima c'era anche un "nudge": un
// micro-scroll di 1px con un filo di overflow finto, per obbligare WebKit a
// ricalcolare il layout. Su iPhone quel movimento faceva sobbalzare la barra
// in basso e il FAB - che sono fixed e si riposizionano a ogni scroll -
// proprio mentre il sistema anima l'apertura dell'app: la parte bassa si
// vedeva vibrare. Ridurlo a un solo nudge non e' bastato (anzi, isolato si
// notava di piu'), quindi e' stato tolto. Scrivere una variabile CSS, invece,
// non muove nulla.
let appliedHeight = 0;

function viewportHeight() {
  return Math.round((window.visualViewport && window.visualViewport.height) || window.innerHeight);
}

function setAppHeight() {
  const h = viewportHeight();
  // Sotto i 2px sono oscillazioni di misura, non un viewport davvero diverso:
  // riscrivere la variabile a ogni frame dell'animazione di apertura non
  // servirebbe a niente.
  if (Math.abs(h - appliedHeight) < 2) return;
  appliedHeight = h;
  document.documentElement.style.setProperty('--app-vh', `${h}px`);
}

setAppHeight();
window.addEventListener('resize', setAppHeight);
window.addEventListener('orientationchange', () => setTimeout(setAppHeight, 200));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) setAppHeight();
});
if (window.visualViewport) window.visualViewport.addEventListener('resize', setAppHeight);

// Icone della bottom nav.
document.querySelectorAll('.nav-icon').forEach((el) => {
  el.innerHTML = icon(el.dataset.icon);
});

initRouter();

// Una misura appena la schermata esiste e una quando iOS ha finito di animare
// l'apertura: se nel frattempo l'altezza non e' cambiata, la seconda non
// riscrive nulla.
setAppHeight();
setTimeout(setAppHeight, 400);

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
