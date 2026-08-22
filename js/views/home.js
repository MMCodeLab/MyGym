// Script classico (non un modulo ES): espone tutto su window.MyGym.views.home.
(function () {

const { store, muscleGroup, icon, escapeHtml, openModal, closeModal, showToast, confirmAction, navigate } = window.MyGym;

const QUICK_NAMES = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];

function dayCardHtml(day) {
  const groups = [...new Set(
    day.entries
      .map((e) => store.getExercise(e.exerciseId))
      .filter(Boolean)
      .map((ex) => ex.muscleGroup)
  )];

  const chips = groups.slice(0, 4).map((key) => {
    const mg = muscleGroup(key);
    return `<span class="badge" style="background:${mg.color}">${escapeHtml(mg.label)}</span>`;
  }).join('');

  const extra = groups.length > 4 ? `<span class="badge" style="background:var(--mg-altro)">+${groups.length - 4}</span>` : '';

  return `
    <div class="card day-card glass" data-day-id="${day.id}">
      <div class="day-card-head">
        <span class="day-card-title">${escapeHtml(day.name)}</span>
        <button class="icon-btn danger" data-delete-day="${day.id}" aria-label="Elimina giorno">${icon('trash')}</button>
      </div>
      <span class="day-card-meta">${day.entries.length} esercizi${day.entries.length === 1 ? 'o' : ''}</span>
      <div class="day-card-chips">${chips}${extra}</div>
    </div>
  `;
}

function openNewDayModal() {
  openModal({
    title: 'Nuovo giorno',
    bodyHtml: `
      <div class="field">
        <label>Scelta rapida</label>
        <div class="chip-row" id="quick-day-names">
          ${QUICK_NAMES.map((n) => `<span class="chip" data-quick="${escapeHtml(n)}">${escapeHtml(n)}</span>`).join('')}
        </div>
      </div>
      <div class="field">
        <label for="day-name-input">Nome del giorno</label>
        <input type="text" class="input" id="day-name-input" placeholder="Es. Lunedì — Petto e Spalle" maxlength="40" />
      </div>
      <button class="btn btn-primary btn-block" id="create-day-btn">Crea giorno</button>
    `,
    onMount: (body) => {
      const input = body.querySelector('#day-name-input');
      input.focus();
      body.querySelectorAll('[data-quick]').forEach((chip) => {
        chip.addEventListener('click', () => {
          input.value = chip.dataset.quick;
          input.focus();
        });
      });
      const create = () => {
        const name = input.value.trim();
        if (!name) {
          input.focus();
          return;
        }
        const day = store.addDay(name);
        closeModal();
        showToast(`Giorno "${name}" creato`);
        navigate(`#/day/${day.id}`);
      };
      body.querySelector('#create-day-btn').addEventListener('click', create);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') create();
      });
    },
  });
}

function render(container) {
  const { days } = store.get();

  const list = days.length
    ? days.map(dayCardHtml).join('')
    : `
      <div class="empty-state glass">
        <div class="empty-emoji">📅</div>
        <div class="empty-title">Nessun giorno ancora</div>
        <div class="empty-text">Crea il tuo primo giorno di allenamento (es. Lunedì) e aggiungi gli esercizi che vuoi fare.</div>
        <button class="btn btn-primary" id="empty-create-day">Crea il primo giorno</button>
      </div>
    `;

  container.innerHTML = `
    <h1 class="section-title">I tuoi giorni</h1>
    <p class="section-subtitle">Organizza l'allenamento in giorni, come una scheda in palestra.</p>
    <div id="days-list">${list}</div>
    <button class="fab" id="fab-add-day" aria-label="Nuovo giorno">${icon('plus')}</button>
  `;

  container.querySelector('#fab-add-day').addEventListener('click', openNewDayModal);
  const emptyBtn = container.querySelector('#empty-create-day');
  if (emptyBtn) emptyBtn.addEventListener('click', openNewDayModal);

  container.querySelectorAll('[data-day-id]').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-delete-day]')) return;
      navigate(`#/day/${card.dataset.dayId}`);
    });
  });

  container.querySelectorAll('[data-delete-day]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const dayId = btn.dataset.deleteDay;
      const day = store.getDay(dayId);
      confirmAction({
        title: 'Eliminare il giorno?',
        message: `"${day.name}" verrà eliminato. Gli esercizi restano nella tua libreria.`,
        confirmLabel: 'Elimina',
        onConfirm: () => {
          store.deleteDay(dayId);
          showToast('Giorno eliminato');
          render(container);
        },
      });
    });
  });
}

window.MyGym = window.MyGym || {};
window.MyGym.views = window.MyGym.views || {};
window.MyGym.views.home = { render };

})();
