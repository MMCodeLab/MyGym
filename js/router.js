// Script classico (non un modulo ES): espone tutto su window.MyGym.
// Le viste sono gia' tutte caricate (nessun import dinamico), perche' Chrome
// blocca il caricamento dei moduli ES quando la pagina e' aperta via file://.
(function () {

const { store } = window.MyGym;

const WORKOUT_ROUTE = '#/allenamento';

// Scroll da ripristinare al primo render dopo l'avvio: fuori da quel momento
// resta null e ogni navigazione riparte dall'alto, come sempre.
let pendingScrollY = null;
let savePositionTimer = null;

function container() {
  return document.getElementById('view');
}

function currentRoute() {
  return location.hash && location.hash !== '#' ? location.hash : '#/';
}

// Si tiene traccia solo della schermata dell'allenamento: e' l'unica che viene
// ripristinata, e restando l'ultima salvata la si ritrova anche se si e' fatto
// un giro in un'altra sezione prima che il telefono chiudesse l'app.
function saveCurrentPosition() {
  if (currentRoute() !== WORKOUT_ROUTE) return;
  store.setLastPosition({ route: WORKOUT_ROUTE, scrollY: Math.round(window.scrollY) });
}

// Lo scroll salvato serve solo al prossimo avvio: basta scriverlo ogni tanto
// (e sempre quando l'app va in background, che e' il momento in cui il
// telefono puo' chiuderla senza preavviso).
function scheduleSavePosition() {
  if (savePositionTimer) return;
  savePositionTimer = setTimeout(() => {
    savePositionTimer = null;
    saveCurrentPosition();
  }, 600);
}

// Il layout puo' assestarsi qualche istante dopo il render (font, immagini,
// correzioni di viewport all'avvio della PWA): riapplichiamo la posizione
// qualche volta invece di fidarci del primo tentativo.
function restoreScroll(y) {
  const events = ['touchstart', 'wheel', 'keydown'];
  let cancelled = false;
  const stop = () => { cancelled = true; };
  // Se l'utente comincia subito a scorrere per conto suo ha ragione lui:
  // smettiamo di riportarlo alla posizione salvata.
  events.forEach((ev) => window.addEventListener(ev, stop, { passive: true }));

  const apply = () => { if (!cancelled) window.scrollTo(0, y); };
  apply();
  requestAnimationFrame(apply);
  setTimeout(apply, 120);
  setTimeout(() => {
    apply();
    events.forEach((ev) => window.removeEventListener(ev, stop));
  }, 400);
}

// A freddo l'app riparte dalla schermata iniziale, come qualsiasi altra volta.
// L'unica eccezione e' l'allenamento in corso: li' si torna dov'eri, cosi' non
// devi ricercare l'esercizio che stavi compilando.
// Vale solo partendo dall'ingresso normale (la PWA installata apre sempre lo
// start_url, senza hash): un link diretto a una schermata precisa vince.
function restoreLastPosition() {
  if (location.hash && location.hash !== '#' && location.hash !== '#/') return;
  if (!store.getActiveWorkout()) return;

  const last = store.getLastPosition();
  if (last && last.route === WORKOUT_ROUTE) pendingScrollY = last.scrollY || 0;

  try {
    // replaceState e non location.hash: non lascia una voce di cronologia in
    // piu', altrimenti il "indietro" del telefono resterebbe intrappolato
    // sulla schermata d'ingresso.
    history.replaceState(null, '', WORKOUT_ROUTE);
  } catch (e) {
    // aperta come file locale (file://) alcuni browser bloccano replaceState:
    // il ripristino della sezione salta, quello dello scroll no
    pendingScrollY = null;
  }
}

// Posiziona la pillola della bottom nav misurando il vero elemento attivo
// (in pixel, non in percentuale) cosi' funziona con un numero qualsiasi di
// voci, anche quando la barra scorre orizzontalmente su schermi stretti.
function positionNavPill(nav) {
  const active = nav.querySelector('.nav-item.active');
  const pill = document.getElementById('nav-pill');
  if (!active || !pill) return;
  pill.style.width = `${active.offsetWidth}px`;
  pill.style.height = `${active.offsetHeight}px`;
  pill.style.transform = `translateX(${active.offsetLeft}px)`;

  // La voce attiva si porta in vista scorrendo SOLO la barra. Con
  // scrollIntoView (block: 'nearest') il browser puo' scorrere anche la
  // pagina: all'apertura su iPhone, mentre il viewport si assesta, la barra
  // fixed puo' risultare per un istante fuori dal viewport e quello scroll
  // partiva davvero, facendo sobbalzare la parte bassa.
  // Scorrimento immediato e non animato: 'smooth' su questo elemento viene
  // ignorato in alcuni motori (lo scroll resta a zero e la voce attiva
  // rimane tagliata), e comunque a muoversi qui e' solo la barra.
  const target = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
  const maxLeft = Math.max(0, nav.scrollWidth - nav.clientWidth);
  nav.scrollLeft = Math.min(Math.max(0, target), maxLeft);
}

function updateNavActive(routeKey) {
  const nav = document.getElementById('bottom-nav');
  const items = nav.querySelectorAll('.nav-item');
  items.forEach((item) => item.classList.toggle('active', item.dataset.route === routeKey));
  positionNavPill(nav);
}

function route() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const parts = hash.split('/').filter(Boolean);
  const el = container();
  const views = window.MyGym.views;

  let routeKey = 'giorni';
  let renderFn;
  let arg;

  if (!parts.length || parts[0] === '') {
    routeKey = 'giorni';
    renderFn = views.home.render;
  } else if (parts[0] === 'day' && parts[1]) {
    routeKey = 'giorni';
    renderFn = views.day.render;
    arg = parts[1];
  } else if (parts[0] === 'allenamento') {
    routeKey = 'allenamento';
    renderFn = views.workout.render;
  } else if (parts[0] === 'progressi') {
    routeKey = 'progressi';
    renderFn = views.progress.render;
  } else if (parts[0] === 'storico') {
    // Lo storico e' il dettaglio di "Progressi": la voce evidenziata resta quella.
    routeKey = 'progressi';
    renderFn = views.workoutHistory.render;
  } else if (parts[0] === 'esercizi') {
    routeKey = 'esercizi';
    renderFn = views.exercises.render;
  } else if (parts[0] === 'pt') {
    routeKey = 'pt';
    renderFn = views.personalTrainer.render;
  } else if (parts[0] === 'impostazioni') {
    routeKey = 'impostazioni';
    renderFn = views.settings.render;
  } else {
    renderFn = views.home.render;
  }

  updateNavActive(routeKey);
  el.classList.remove('view');
  void el.offsetWidth; // restart entrance animation
  el.classList.add('view');
  renderFn(el, arg);

  if (pendingScrollY != null) {
    const y = pendingScrollY;
    pendingScrollY = null;
    restoreScroll(y);
  } else {
    window.scrollTo(0, 0);
  }
}

function navigate(hash) {
  location.hash = hash;
}

function initRouter() {
  // La posizione la decide l'app (vedi restoreLastPosition): senza questo, al
  // reload il browser rimetterebbe da solo lo scroll di prima, sovrapponendosi
  // alla regola "a freddo si riparte dalla schermata iniziale".
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  window.addEventListener('hashchange', route);
  window.addEventListener('resize', () => positionNavPill(document.getElementById('bottom-nav')));

  window.addEventListener('scroll', scheduleSavePosition, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveCurrentPosition();
  });
  // pagehide copre anche la chiusura vera e propria su iOS, dove "unload" non
  // e' affidabile nelle PWA installate.
  window.addEventListener('pagehide', saveCurrentPosition);

  restoreLastPosition();
  route();
}

window.MyGym = window.MyGym || {};
Object.assign(window.MyGym, { navigate, initRouter });

})();
