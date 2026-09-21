// Script classico (non un modulo ES) caricato per ultimo: a questo punto
// window.MyGym contiene gia' store, componenti, router e tutte le viste.
(function () {

const { applyTheme, icon, initRouter, store, navigate, openModal, closeModal, refreshRoute } = window.MyGym;

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

// ---------------------------------------------------------------------------
// Prima apertura: uomo o donna
// ---------------------------------------------------------------------------
// I traguardi di forza delle medaglie e la figura del corpo in Progressi sono
// diversi per uomo e donna, ma l'app partiva da "maschio" senza chiedere
// niente: per chi maschio non e', i livelli erano tarati sulla persona
// sbagliata fin dal primo allenamento, e la cosa restava nascosta in fondo
// alle Impostazioni. Si chiede una volta sola, appena l'app e' in piedi.
//
// Se la finestra viene chiusa senza rispondere non si segna niente e la
// domanda torna alla prossima apertura: tirare a indovinare e' esattamente il
// problema da cui si parte.
function chiediSessoAllaPrimaApertura() {
  if (store.get().sexChosen) return;

  openModal({
    title: 'Prima di cominciare',
    bodyHtml: `
      <p class="text-secondary" style="margin-top:0">
        Sei uomo o donna? I traguardi di forza delle medaglie non sono gli stessi,
        e cambia anche la figura del corpo che vedi in Progressi. Si cambia quando
        vuoi dalle Impostazioni.
      </p>
      <div class="flex gap-3 mt-4">
        <button class="btn btn-glass w-full" data-scelta-sesso="maschio">Maschio</button>
        <button class="btn btn-glass w-full" data-scelta-sesso="femmina">Femmina</button>
      </div>
    `,
    onMount: (body) => {
      body.querySelectorAll('[data-scelta-sesso]').forEach((btn) => {
        btn.addEventListener('click', () => {
          store.setSex(btn.dataset.sceltaSesso);
          closeModal();
          // La schermata sotto puo' gia' mostrare medaglie e figura del corpo:
          // senza ridisegnarla resterebbe quella di prima della risposta.
          refreshRoute();
        });
      });
    },
  });
}

chiediSessoAllaPrimaApertura();

// La fiammella della streak in alto e il traguardo ogni 10 giorni (vedi
// js/streak.js): dopo la domanda della prima apertura, che ha la precedenza
// su tutto il resto.
window.MyGym.streak.init();

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
