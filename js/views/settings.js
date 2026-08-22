// Script classico (non un modulo ES): espone tutto su window.MyGym.views.settings.
(function () {

const { store, icon, showToast, confirmAction } = window.MyGym;

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
  const { theme } = store.get();
  const activeIndex = theme === 'dark' ? 0 : 1;

  container.innerHTML = `
    <h1 class="section-title">Impostazioni</h1>
    <p class="section-subtitle">Personalizza l'app.</p>

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

    <p class="text-center text-secondary" style="font-size:0.75rem;margin-top:8px">© ${new Date().getFullYear()} Matteo Minniti. Tutti i diritti riservati.</p>
  `;

  const segmented = container.querySelector('#theme-segmented');
  segmented.querySelectorAll('[data-theme-opt]').forEach((opt) => {
    opt.addEventListener('click', () => {
      const newTheme = opt.dataset.themeOpt;
      store.setTheme(newTheme);
      render(container);
    });
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
