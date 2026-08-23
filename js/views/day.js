// Script classico (non un modulo ES): espone tutto su window.MyGym.views.day.
(function () {

const { store, muscleGroup, icon, escapeHtml, openModal, closeModal, showToast, confirmAction, navigate } = window.MyGym;

let currentDayId = null;
let currentContainer = null;

function badgesHtml(muscleGroups) {
  return (muscleGroups || []).map((key) => {
    const mg = muscleGroup(key);
    return `<span class="badge" style="background:${mg.color}">${escapeHtml(mg.label)}</span>`;
  }).join(' ');
}

function entryRowHtml(day, entry, index) {
  const ex = store.getExercise(entry.exerciseId);
  if (!ex) return '';
  const thumb = ex.imageUrl
    ? `<img src="${escapeHtml(ex.imageUrl)}" alt="" loading="lazy" draggable="false" />`
    : icon('dumbbell');

  return `
    <div class="card exercise-card glass" data-entry-exercise="${ex.id}">
      <div class="exercise-thumb">${thumb}</div>
      <div class="exercise-info">
        <div class="exercise-name">${escapeHtml(ex.name)}</div>
        <div class="flex items-center gap-2 mt-2" style="flex-wrap:wrap">
          ${badgesHtml(ex.muscleGroups)}
          <span class="flex items-center gap-2" style="font-size:0.78rem" onclick="event.stopPropagation()">
            <input type="number" class="input input-number" min="1" max="20" value="${entry.sets}" data-field="sets" data-exercise="${ex.id}" />
            <span class="text-secondary">×</span>
            <input type="number" class="input input-number" min="1" max="100" value="${entry.reps}" data-field="reps" data-exercise="${ex.id}" />
          </span>
        </div>
      </div>
      <div class="exercise-row-actions">
        <button class="icon-btn danger" data-remove-entry="${ex.id}" aria-label="Rimuovi dal giorno">${icon('trash')}</button>
      </div>
    </div>
  `;
}

function openAddExerciseToDayModal(day) {
  const { exercises } = store.get();
  const availableIds = new Set(day.entries.map((e) => e.exerciseId));

  const renderList = (filterText) => {
    const q = (filterText || '').toLowerCase();
    const items = exercises.filter((ex) => ex.name.toLowerCase().includes(q));
    if (!items.length) {
      return `<p class="text-secondary text-center mt-4">Nessun esercizio trovato.</p>`;
    }
    return items.map((ex) => {
      const added = availableIds.has(ex.id);
      const thumb = ex.imageUrl ? `<img src="${escapeHtml(ex.imageUrl)}" alt="" loading="lazy" draggable="false" />` : icon('dumbbell');
      return `
        <div class="card exercise-card glass" data-pick-exercise="${ex.id}" style="${added ? 'opacity:.5' : ''}">
          <div class="exercise-thumb">${thumb}</div>
          <div class="exercise-info">
            <div class="exercise-name">${escapeHtml(ex.name)}</div>
            <div class="flex gap-2" style="flex-wrap:wrap">${badgesHtml(ex.muscleGroups)}</div>
          </div>
          <div class="exercise-row-actions">
            ${added ? icon('check') : icon('plus')}
          </div>
        </div>
      `;
    }).join('');
  };

  openModal({
    title: 'Aggiungi esercizio',
    bodyHtml: `
      <input type="text" class="input" id="pick-search" placeholder="Cerca nella tua libreria..." style="margin-bottom:12px" />
      <div id="pick-list">${renderList('')}</div>
      <button class="btn btn-glass btn-block mt-4" id="create-new-exercise-btn">${icon('plus')} Crea nuovo esercizio</button>
    `,
    onMount: (body) => {
      const listEl = body.querySelector('#pick-list');
      const searchInput = body.querySelector('#pick-search');
      searchInput.focus();

      function bindPicks() {
        listEl.querySelectorAll('[data-pick-exercise]').forEach((card) => {
          card.addEventListener('click', () => {
            const exId = card.dataset.pickExercise;
            if (availableIds.has(exId)) {
              store.removeExerciseFromDay(day.id, exId);
              availableIds.delete(exId);
            } else {
              store.addExerciseToDay(day.id, exId);
              availableIds.add(exId);
            }
            listEl.innerHTML = renderList(searchInput.value);
            bindPicks();
          });
        });
      }
      bindPicks();

      searchInput.addEventListener('input', () => {
        listEl.innerHTML = renderList(searchInput.value);
        bindPicks();
      });

      body.querySelector('#create-new-exercise-btn').addEventListener('click', () => {
        closeModal();
        window.MyGym.views.exercises.openExerciseModal(null);
        // Dopo la creazione l'utente può riaprire "Aggiungi esercizio" per assegnarlo al giorno.
      });
    },
  });

  // Al termine (chiusura), aggiorna la vista del giorno con eventuali modifiche.
  const observer = new MutationObserver(() => {
    if (!document.getElementById('modal-backdrop')) {
      observer.disconnect();
      if (currentContainer) render(currentContainer, currentDayId);
    }
  });
  observer.observe(document.getElementById('modal-root'), { childList: true });
}

function render(container, dayId) {
  currentContainer = container;
  currentDayId = dayId;
  const day = store.getDay(dayId);

  if (!day) {
    container.innerHTML = `
      <div class="empty-state glass">
        <div class="empty-emoji">🤔</div>
        <div class="empty-title">Giorno non trovato</div>
        <button class="btn btn-primary mt-2" id="back-home">Torna ai giorni</button>
      </div>
    `;
    container.querySelector('#back-home').addEventListener('click', () => navigate('#/'));
    return;
  }

  const entriesHtml = day.entries.length
    ? day.entries.map((entry, i) => entryRowHtml(day, entry, i)).join('')
    : `
      <div class="empty-state glass">
        <div class="empty-emoji">➕</div>
        <div class="empty-title">Nessun esercizio in questo giorno</div>
        <div class="empty-text">Aggiungi gli esercizi che vuoi svolgere in questa sessione.</div>
      </div>
    `;

  container.innerHTML = `
    <div class="flex items-center gap-3">
      <button class="icon-btn" id="back-btn" aria-label="Indietro">${icon('back')}</button>
      <div style="flex:1; min-width:0">
        <input type="text" id="day-name-edit" class="input" style="font-family:var(--font-display);font-weight:700;font-size:1.1rem;border:none;background:transparent;padding:8px 4px" value="${escapeHtml(day.name)}" maxlength="40" />
      </div>
      <button class="icon-btn danger" id="delete-day-btn" aria-label="Elimina giorno">${icon('trash')}</button>
    </div>
    <p class="section-subtitle" style="margin-left:4px">${day.entries.length} esercizi${day.entries.length === 1 ? 'o' : ''}</p>
    <div id="entries-list">${entriesHtml}</div>
    <button class="fab" id="fab-add-entry" aria-label="Aggiungi esercizio">${icon('plus')}</button>
  `;

  container.querySelector('#back-btn').addEventListener('click', () => navigate('#/'));

  const nameInput = container.querySelector('#day-name-edit');
  nameInput.addEventListener('blur', () => {
    const val = nameInput.value.trim();
    if (val && val !== day.name) {
      store.updateDay(day.id, { name: val });
      showToast('Nome aggiornato');
    } else {
      nameInput.value = day.name;
    }
  });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') nameInput.blur();
  });

  container.querySelector('#delete-day-btn').addEventListener('click', () => {
    confirmAction({
      title: 'Eliminare il giorno?',
      message: `"${day.name}" verrà eliminato. Gli esercizi restano nella tua libreria.`,
      confirmLabel: 'Elimina',
      onConfirm: () => {
        store.deleteDay(day.id);
        showToast('Giorno eliminato');
        navigate('#/');
      },
    });
  });

  container.querySelector('#fab-add-entry').addEventListener('click', () => openAddExerciseToDayModal(day));

  container.querySelectorAll('[data-field]').forEach((input) => {
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('change', () => {
      const exId = input.dataset.exercise;
      const field = input.dataset.field;
      const value = Math.max(1, parseInt(input.value, 10) || 1);
      store.updateDayEntry(day.id, exId, { [field]: value });
    });
  });

  container.querySelectorAll('[data-remove-entry]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.removeExerciseFromDay(day.id, btn.dataset.removeEntry);
      showToast('Esercizio rimosso dal giorno');
      render(container, dayId);
    });
  });
}

window.MyGym = window.MyGym || {};
window.MyGym.views = window.MyGym.views || {};
window.MyGym.views.day = { render };

})();
