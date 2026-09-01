// Script classico (non un modulo ES) caricato per ultimo: a questo punto
// window.MyGym contiene gia' store, componenti, router e tutte le viste.
(function () {

const { applyTheme, icon, initRouter, store, navigate } = window.MyGym;

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

// Il guscio comune (js/pwa-shell.js) si occupa da solo del service worker,
// dell'avviso di nuova versione e della barretta "sei offline". Qui gli si
// dice soltanto come sono fatti i dati di MyGym.
if (window.PwaShell) {
  window.PwaShell.configure({
    // Senza giorni ne' esercizi non c'e' ancora niente da salvare, quindi il
    // promemoria del backup non ha motivo di comparire.
    hasData: () => {
      const { days, exercises, workouts } = store.get();
      return days.length > 0 || exercises.length > 0 || workouts.length > 0;
    },
    onBackupRequest: () => navigate('#/impostazioni'),
  });
}

})();
