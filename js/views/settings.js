// Script classico (non un modulo ES): espone tutto su window.MyGym.views.settings.
(function () {

const { store, icon, showToast, confirmAction, navigate, openModal } = window.MyGym;

const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xykgbzya';
const INSTAGRAM_URL = 'https://www.instagram.com/myproject_pwa?igsi=aTNwM3dpdWw1ZjU%3D&utm_source=qr';
const GITHUB_URL = 'https://github.com/MMCodeLab';

function openContactModal() {
  openModal({
    title: 'Contattaci',
    bodyHtml: `
      <p class="text-secondary" style="margin-top:0">Hai trovato un bug, hai un'idea o vuoi solo salutare? Scrivi un messaggio e ti risponderò appena possibile.</p>
      <form id="contact-form">
        <input type="hidden" name="_subject" value="Nuovo messaggio da MyGym" />
        <div class="field">
          <label for="contact-email-input">La tua email</label>
          <input type="email" class="input" id="contact-email-input" name="email" placeholder="La tua email" required />
        </div>
        <div class="field">
          <label for="contact-message-input">Il tuo messaggio</label>
          <textarea class="textarea" id="contact-message-input" name="message" rows="4" placeholder="Il tuo messaggio" required></textarea>
        </div>
        <button type="submit" class="btn btn-primary btn-block" id="contact-submit-btn">Invia</button>
        <p id="contact-status" class="form-error" style="display:none"></p>
      </form>
      <div class="social-row">
        <a href="${INSTAGRAM_URL}" target="_blank" rel="noopener noreferrer" class="btn btn-glass social-btn">${icon('instagram')} Instagram</a>
        <a href="${GITHUB_URL}" target="_blank" rel="noopener noreferrer" class="btn btn-glass social-btn">${icon('github')} GitHub</a>
      </div>
    `,
    onMount: (body) => {
      const form = body.querySelector('#contact-form');
      const statusEl = body.querySelector('#contact-status');
      const submitBtn = body.querySelector('#contact-submit-btn');

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        statusEl.style.display = 'none';
        statusEl.classList.remove('form-success');
        statusEl.classList.add('form-error');

        submitBtn.disabled = true;
        submitBtn.textContent = 'Invio in corso…';

        try {
          const res = await fetch(FORMSPREE_ENDPOINT, {
            method: 'POST',
            headers: { Accept: 'application/json' },
            body: new FormData(form),
          });
          if (res.ok) {
            statusEl.textContent = 'Messaggio inviato, grazie!';
            statusEl.classList.remove('form-error');
            statusEl.classList.add('form-success');
            statusEl.style.display = 'block';
            form.reset();
          } else {
            statusEl.textContent = 'Qualcosa è andato storto. Riprova.';
            statusEl.style.display = 'block';
          }
        } catch (err) {
          statusEl.textContent = 'Errore di rete. Riprova.';
          statusEl.style.display = 'block';
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Invia';
        }
      });
    },
  });
}

const REST_DURATION_PRESETS = [30, 60, 90, 120, 180, 300];

function formatRestPresetLabel(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}:${String(s).padStart(2, '0')}` : `${m} min`;
}

function restNotifStatus() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

const REST_NOTIF_COPY = {
  unsupported: { title: 'Non disponibili', desc: 'Il tuo browser non supporta le notifiche.' },
  denied: { title: 'Bloccate dal browser', desc: 'Hai bloccato le notifiche per questo sito: riattivale dalle impostazioni del browser per usarle anche a schermo spento.' },
  granted: { title: 'Attive', desc: 'Quando il timer di recupero finisce ricevi una notifica con vibrazione, anche se cambi app.' },
  default: { title: 'Da attivare', desc: 'Tocca per attivarle: ti avvisano anche se sei uscito dall\'app mentre il timer è in corso.' },
};

function download(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function render(container) {
  const { theme, restTimerSeconds } = store.get();
  const activeIndex = theme === 'dark' ? 0 : 1;

  container.innerHTML = `
    <h1 class="section-title">Impostazioni</h1>
    <p class="section-subtitle">Personalizza l'app.</p>

    <div class="settings-section">
      <div class="settings-row settings-row-lg glass" id="workouts-row">
        <span class="settings-row-lg-icon">${icon('chartBar')}</span>
        <div class="settings-row-text">
          <div class="settings-row-title">Allenamenti</div>
          <div class="settings-row-desc">Storico completo e grafico dei progressi.</div>
        </div>
        <span class="settings-row-lg-chevron">${icon('chevronDown')}</span>
      </div>
    </div>

    <div class="settings-section">
      <h3>Aspetto</h3>
      <div class="settings-row glass">
        <div class="settings-row-text">
          <div class="settings-row-title">Tema</div>
          <div class="settings-row-desc">Scuro di default, oppure passa al tema chiaro.</div>
        </div>
      </div>
      <div class="segmented" id="theme-segmented" data-active="${activeIndex}">
        <span class="segmented-thumb"></span>
        <span class="segmented-opt ${theme === 'dark' ? 'active' : ''}" data-theme-opt="dark">${icon('moon')} Scuro</span>
        <span class="segmented-opt ${theme === 'light' ? 'active' : ''}" data-theme-opt="light">${icon('sun')} Chiaro</span>
      </div>
    </div>

    <div class="settings-section">
      <h3>Timer di recupero</h3>
      <div class="settings-row glass">
        <div class="settings-row-text">
          <div class="settings-row-title">Durata predefinita</div>
          <div class="settings-row-desc">Usata dal tasto "Tempo di recupero" durante l'allenamento.</div>
        </div>
      </div>
      <div class="chip-row" id="rest-duration-chips">
        ${REST_DURATION_PRESETS.map((s) => `
          <span class="chip ${s === restTimerSeconds ? 'selected' : ''}" data-rest-seconds="${s}" ${s === restTimerSeconds ? 'style="background:var(--accent-gradient);border-color:transparent"' : ''}>${formatRestPresetLabel(s)}</span>
        `).join('')}
      </div>
      <div class="settings-row glass" id="rest-notif-row" ${restNotifStatus() === 'default' ? 'style="cursor:pointer"' : ''}>
        <div class="settings-row-text">
          <div class="settings-row-title">Notifiche a fine recupero — ${REST_NOTIF_COPY[restNotifStatus()].title}</div>
          <div class="settings-row-desc">${REST_NOTIF_COPY[restNotifStatus()].desc}</div>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h3>Dati</h3>
      <div class="settings-row glass" id="export-row" style="cursor:pointer">
        <div class="settings-row-text">
          <div class="settings-row-title">Esporta backup</div>
          <div class="settings-row-desc">Scarica un file JSON con giorni ed esercizi.</div>
        </div>
      </div>
      <div class="settings-row glass" id="import-row" style="cursor:pointer">
        <div class="settings-row-text">
          <div class="settings-row-title">Importa backup</div>
          <div class="settings-row-desc">Ripristina i dati da un file JSON esportato in precedenza.</div>
        </div>
      </div>
      <input type="file" id="import-file" accept="application/json" style="display:none" />
      <div class="settings-row glass" id="clear-row" style="cursor:pointer">
        <div class="settings-row-text">
          <div class="settings-row-title" style="color:var(--danger)">Cancella tutti i dati</div>
          <div class="settings-row-desc">Elimina definitivamente giorni ed esercizi da questo dispositivo.</div>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h3>Informazioni</h3>
      <div class="settings-row glass">
        <div class="settings-row-text">
          <div class="settings-row-title">Immagini esercizi</div>
          <div class="settings-row-desc">Le foto suggerite provengono dal dataset open-source "free-exercise-db", nessuna registrazione richiesta.</div>
        </div>
      </div>
      <div class="settings-row glass">
        <div class="settings-row-text">
          <div class="settings-row-title">MyGym</div>
          <div class="settings-row-desc">Versione 0.1.0 — i tuoi dati restano solo su questo dispositivo.</div>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h3>Contattaci</h3>
      <div class="settings-row glass" id="contact-row" style="cursor:pointer">
        <div class="settings-row-text">
          <div class="settings-row-title">Scrivici un messaggio</div>
          <div class="settings-row-desc">Bug, idee o solo per salutare: siamo su un modulo di contatto, Instagram e GitHub.</div>
        </div>
      </div>
    </div>

    <p class="text-center text-secondary" style="font-size:0.75rem;margin-top:8px">© ${new Date().getFullYear()} Matteo Minniti. Tutti i diritti riservati.</p>
  `;

  container.querySelector('#workouts-row').addEventListener('click', () => navigate('#/storico'));
  container.querySelector('#contact-row').addEventListener('click', openContactModal);

  const segmented = container.querySelector('#theme-segmented');
  segmented.querySelectorAll('[data-theme-opt]').forEach((opt) => {
    opt.addEventListener('click', () => {
      const newTheme = opt.dataset.themeOpt;
      store.setTheme(newTheme);
      render(container);
    });
  });

  container.querySelectorAll('[data-rest-seconds]').forEach((chip) => {
    chip.addEventListener('click', () => {
      store.setRestTimerSeconds(Number(chip.dataset.restSeconds));
      render(container);
    });
  });

  container.querySelector('#rest-notif-row').addEventListener('click', async () => {
    if (restNotifStatus() !== 'default') return;
    await Notification.requestPermission();
    render(container);
  });

  container.querySelector('#export-row').addEventListener('click', () => {
    const json = store.exportData();
    const date = new Date().toISOString().slice(0, 10);
    download(`mygym-backup-${date}.json`, json);
    showToast('Backup scaricato');
  });

  const fileInput = container.querySelector('#import-file');
  container.querySelector('#import-row').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        store.importData(reader.result);
        showToast('Dati importati con successo');
        render(container);
      } catch (e) {
        showToast('File non valido');
      }
    };
    reader.readAsText(file);
    fileInput.value = '';
  });

  container.querySelector('#clear-row').addEventListener('click', () => {
    confirmAction({
      title: 'Cancellare tutti i dati?',
      message: 'Questa azione eliminerà definitivamente tutti i giorni e gli esercizi salvati su questo dispositivo.',
      confirmLabel: 'Cancella tutto',
      onConfirm: () => {
        store.clearAll();
        showToast('Dati cancellati');
        render(container);
      },
    });
  });
}

window.MyGym = window.MyGym || {};
window.MyGym.views = window.MyGym.views || {};
window.MyGym.views.settings = { render };

})();
