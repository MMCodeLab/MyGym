// Piccoli helper UI condivisi: icone SVG inline, modali, toast.
// Script classico (non un modulo ES): espone tutto su window.MyGym.
(function () {

const ICONS = {
  giorni: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/></svg>',
  esercizi: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10v4M22 10v4M6 12h12"/><rect x="4" y="8" width="4" height="8" rx="1"/><rect x="16" y="8" width="4" height="8" rx="1"/></svg>',
  allenamento: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6M12 2v3"/></svg>',
  impostazioni: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-.87 14.14A2 2 0 0 1 16.14 22H7.86a2 2 0 0 1-1.99-1.86L5 6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  dumbbell: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5 17.5 17.5"/><path d="M18.5 15.5a3 3 0 1 0-4-4l-4 4a3 3 0 1 0 4 4Z"/></svg>',
  moon: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  chevronUp: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>',
  chevronDown: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  image: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  stopwatch: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6M12 2v3"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" stroke="none"><path d="M8 5v14l11-7Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" stroke="none"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  flag: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4"/><path d="M4 4h14l-3 4 3 4H4"/></svg>',
  chartBar: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M12 20V4M20 20v-7"/><path d="M2 20h20"/></svg>',
  sparkles: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" stroke="none"><path d="M12 2.5c.35 0 .66.23.76.57l1.28 4.3 4.3 1.28a.79.79 0 0 1 0 1.52l-4.3 1.28-1.28 4.3a.79.79 0 0 1-1.52 0l-1.28-4.3-4.3-1.28a.79.79 0 0 1 0-1.52l4.3-1.28 1.28-4.3c.1-.34.41-.57.76-.57Z"/><path d="M19 14.2c.28 0 .53.19.6.46l.5 1.75 1.75.5a.63.63 0 0 1 0 1.2l-1.75.5-.5 1.75a.63.63 0 0 1-1.2 0l-.5-1.75-1.75-.5a.63.63 0 0 1 0-1.2l1.75-.5.5-1.75a.63.63 0 0 1 .6-.46Z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" width="20" height="20"><defs><linearGradient id="igGradient" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stop-color="#833AB4"/><stop offset="50%" stop-color="#E1306C"/><stop offset="100%" stop-color="#F77737"/></linearGradient></defs><rect x="1" y="1" width="22" height="22" rx="6" fill="url(#igGradient)"/><rect x="6" y="6" width="12" height="12" rx="3.5" fill="none" stroke="white" stroke-width="1.6"/><circle cx="12" cy="12" r="3.2" fill="none" stroke="white" stroke-width="1.6"/><circle cx="16.4" cy="7.6" r="1" fill="white"/></svg>',
  github: '<svg viewBox="0 0 24 24" width="20" height="20"><rect x="1" y="1" width="22" height="22" rx="6" fill="#181717"/><path fill="white" transform="translate(4,4) scale(0.7)" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>',
};

function icon(name) {
  return ICONS[name] || '';
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ---------- Modal ----------
let modalCloseHandler = null;

function openModal({ title, bodyHtml, onMount }) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal-panel glass" id="modal-panel" role="dialog" aria-modal="true">
        <div class="modal-handle"></div>
        <div class="modal-header">
          <span class="modal-title">${escapeHtml(title)}</span>
          <button class="icon-btn" id="modal-close-btn" aria-label="Chiudi">${icon('close')}</button>
        </div>
        <div id="modal-body">${bodyHtml}</div>
      </div>
    </div>
  `;

  const backdrop = document.getElementById('modal-backdrop');
  const closeBtn = document.getElementById('modal-close-btn');

  modalCloseHandler = (e) => {
    if (e.key === 'Escape') closeModal();
  };
  document.addEventListener('keydown', modalCloseHandler);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });
  closeBtn.addEventListener('click', closeModal);

  if (onMount) onMount(document.getElementById('modal-body'));
}

function closeModal() {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
  if (modalCloseHandler) {
    document.removeEventListener('keydown', modalCloseHandler);
    modalCloseHandler = null;
  }
}

// ---------- Toast ----------
function showToast(message, { variant } = {}) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = variant ? `toast toast-${variant}` : 'toast';
  el.textContent = message;
  root.appendChild(el);
  const duration = variant === 'record' ? 3200 : 2200;
  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 320);
  }, duration);
}

// ---------- Confirm ----------
function confirmAction({ title, message, confirmLabel = 'Conferma', danger = true, onConfirm, onCancel }) {
  openModal({
    title,
    bodyHtml: `
      <p class="text-secondary" style="margin-top:0">${escapeHtml(message)}</p>
      <div class="flex gap-3 mt-4">
        <button class="btn btn-glass w-full" id="confirm-cancel">Annulla</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} w-full" id="confirm-ok">${escapeHtml(confirmLabel)}</button>
      </div>
    `,
    onMount: (body) => {
      // onCancel serve a chi ha aperto la conferma da dentro un'altra finestra:
      // openModal riusa un solo contenitore, quindi la precedente e' gia' stata
      // sostituita e va riaperta a mano.
      body.querySelector('#confirm-cancel').addEventListener('click', () => {
        closeModal();
        if (onCancel) onCancel();
      });
      body.querySelector('#confirm-ok').addEventListener('click', () => {
        closeModal();
        onConfirm();
      });
    },
  });
}

window.MyGym = window.MyGym || {};
Object.assign(window.MyGym, { icon, escapeHtml, openModal, closeModal, showToast, confirmAction });

})();
