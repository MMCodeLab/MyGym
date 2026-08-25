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
setAppHeight();
requestAnimationFrame(() => requestAnimationFrame(setAppHeight));
setTimeout(setAppHeight, 300);
window.addEventListener('resize', setAppHeight);
window.addEventListener('orientationchange', () => setTimeout(setAppHeight, 200));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) setTimeout(setAppHeight, 100);
});
if (window.visualViewport) window.visualViewport.addEventListener('resize', setAppHeight);

// Icone della bottom nav.
document.querySelectorAll('.nav-icon').forEach((el) => {
  el.innerHTML = icon(el.dataset.icon);
});

initRouter();

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
