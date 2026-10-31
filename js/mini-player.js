// Mini-player incorporato (Spotify). Sta fuori dalle schermate dell'app, cosi'
// non si ricarica quando si cambia pagina. Per aggiungere un'app: una voce in
// APPS e un pulsante .app-chip in index.html con lo stesso data-app.
(function () {

const KEY = 'mygym.player.v1'; // chiave a parte: non finisce nei backup ne' nel cloud

const APPS = {
  spotify: {
    label: 'Spotify',
    hint: 'Incolla il link di una playlist, un album o un brano (in Spotify: Condividi → Copia link).',
    toEmbed(text) {
      const t = (text || '').trim();
      let m = t.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(playlist|album|track|artist|episode|show)\/([A-Za-z0-9]+)/);
      if (!m) m = t.match(/^spotify:(playlist|album|track|artist|episode|show):([A-Za-z0-9]+)$/);
      return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator` : null;
    },
  },
};

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
}
function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
}

let panel = null;
let bodyEl = null;
let titleEl = null;
let minBtn = null;
let currentApp = null;

function setMinimized(min) {
  panel.classList.toggle('is-min', min);
  minBtn.textContent = min ? '▴' : '▾';
  minBtn.setAttribute('aria-label', min ? 'Espandi' : 'Riduci');
}

function showPlayer(appKey, embed) {
  bodyEl.innerHTML = '';
  const frame = document.createElement('iframe');
  frame.dataset.app = appKey;
  frame.src = embed;
  frame.width = '100%';
  frame.height = '152';
  frame.setAttribute('frameborder', '0');
  frame.setAttribute('allow', 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture');
  frame.style.border = '0';
  frame.style.borderRadius = '12px';
  bodyEl.appendChild(frame);
    const open = panel.querySelector('.mini-player-open');
  open.href = embed.replace('/embed/', '/').split('?')[0];
  open.hidden = false;
}

function showForm(appKey) {
    panel.querySelector('.mini-player-open').hidden = true;
  const app = APPS[appKey];
  const hasSaved = !!(load()[appKey] || {}).embed;
  bodyEl.innerHTML = `
    <div class="mini-player-form">
      <p>${app.hint}</p>
      <input class="auth-input" type="text" inputmode="url" placeholder="Incolla qui il link" autocomplete="off" />
      <p class="mini-player-msg" role="alert"></p>
      <div class="flex gap-2">
        <button type="button" class="btn btn-primary w-full" data-mp="save">Salva e avvia</button>
        ${hasSaved ? '<button type="button" class="btn btn-glass" data-mp="cancel">Annulla</button>' : ''}
      </div>
    </div>`;
}

function ensurePanel() {
  if (panel) return;
  panel = document.createElement('div');
  panel.className = 'mini-player glass';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="mini-player-head">
      <strong class="mini-player-title"></strong>
            <a class="icon-btn icon-btn-sm mini-player-open" target="_blank" rel="noopener" aria-label="Apri in Spotify" hidden>↗</a>
      <button type="button" class="icon-btn icon-btn-sm" data-mp="change" aria-label="Cambia link">✎</button>
      <button type="button" class="icon-btn icon-btn-sm" data-mp="min" aria-label="Riduci">▾</button>
      <button type="button" class="icon-btn icon-btn-sm" data-mp="close" aria-label="Chiudi">✕</button>
    </div>
    <div class="mini-player-body"></div>`;
  document.body.appendChild(panel);
  bodyEl = panel.querySelector('.mini-player-body');
  titleEl = panel.querySelector('.mini-player-title');
  minBtn = panel.querySelector('[data-mp="min"]');

  panel.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-mp]');
    if (!t || !currentApp) return;
    const a = t.dataset.mp;
    const app = APPS[currentApp];

    if (a === 'min') {
      setMinimized(!panel.classList.contains('is-min'));
    } else if (a === 'close') {
      bodyEl.innerHTML = ''; // toglie il player: la musica si ferma
      panel.hidden = true;
      currentApp = null;
    } else if (a === 'change') {
      setMinimized(false);
      showForm(currentApp);
    } else if (a === 'cancel') {
      showPlayer(currentApp, load()[currentApp].embed);
    } else if (a === 'save') {
      const input = bodyEl.querySelector('input');
      const msg = bodyEl.querySelector('.mini-player-msg');
      const embed = app.toEmbed(input.value);
      if (!embed) { msg.textContent = 'Questo link non sembra valido.'; return; }
      const data = load();
      data[currentApp] = { embed };
      save(data);
      showPlayer(currentApp, embed);
    }
  });
}

function openApp(appKey) {
  const app = APPS[appKey];
  if (!app) return;
  ensurePanel();

  // Stessa app gia' aperta e in riproduzione: si riespande senza ricaricare.
  const playing = bodyEl.querySelector('iframe');
  if (currentApp === appKey && playing) {
    panel.hidden = false;
    setMinimized(false);
    return;
  }

  currentApp = appKey;
  titleEl.textContent = app.label;
  panel.hidden = false;
  setMinimized(false);
  const saved = load()[appKey];
  if (saved && saved.embed) showPlayer(appKey, saved.embed);
  else showForm(appKey);
}

// ---- La barra in alto a due pagine ----
const pager = document.getElementById('topbar-pager');
const dots = document.getElementById('topbar-dots');

if (pager && dots) {
  pager.addEventListener('scroll', () => {
    const idx = pager.scrollLeft > pager.clientWidth / 2 ? 1 : 0;
    dots.querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i === idx));
  }, { passive: true });

  pager.addEventListener('click', (ev) => {
    const chip = ev.target.closest('.app-chip');
    if (!chip) return;
    openApp(chip.dataset.app);
    pager.scrollTo({ left: 0, behavior: 'smooth' }); // la barra torna sul titolo
  });
}

})();