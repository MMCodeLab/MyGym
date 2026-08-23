// Script classico (non un modulo ES): espone tutto su window.MyGym.
// Le viste sono gia' tutte caricate (nessun import dinamico), perche' Chrome
// blocca il caricamento dei moduli ES quando la pagina e' aperta via file://.
(function () {

function container() {
  return document.getElementById('view');
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
  active.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
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
  } else if (parts[0] === 'storico') {
    routeKey = 'impostazioni';
    renderFn = views.workoutHistory.render;
  } else if (parts[0] === 'esercizi') {
    routeKey = 'esercizi';
    renderFn = views.exercises.render;
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
  window.scrollTo(0, 0);
}

function navigate(hash) {
  location.hash = hash;
}

function initRouter() {
  window.addEventListener('hashchange', route);
  window.addEventListener('resize', () => positionNavPill(document.getElementById('bottom-nav')));
  route();
}

window.MyGym = window.MyGym || {};
Object.assign(window.MyGym, { navigate, initRouter });

})();
