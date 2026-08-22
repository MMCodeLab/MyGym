// Script classico (non un modulo ES): espone tutto su window.MyGym.
// Le viste sono gia' tutte caricate (nessun import dinamico), perche' Chrome
// blocca il caricamento dei moduli ES quando la pagina e' aperta via file://.
(function () {

const ROUTE_ORDER = ['giorni', 'esercizi', 'impostazioni'];

function container() {
  return document.getElementById('view');
}

function updateNavActive(routeKey) {
  const nav = document.getElementById('bottom-nav');
  const items = nav.querySelectorAll('.nav-item');
  items.forEach((item) => item.classList.toggle('active', item.dataset.route === routeKey));
  const index = ROUTE_ORDER.indexOf(routeKey);
  nav.style.setProperty('--active-index', String(Math.max(index, 0)));
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
  route();
}

window.MyGym = window.MyGym || {};
Object.assign(window.MyGym, { navigate, initRouter });

})();
