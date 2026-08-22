// Script classico (non un modulo ES): espone tutto su window.MyGym.views.exercises.
(function () {

const { store, MUSCLE_GROUPS, muscleGroup, icon, escapeHtml, openModal, closeModal, showToast, confirmAction, searchExerciseImages, translateInstructionsToItalian } = window.MyGym;

let activeFilter = 'tutti';
let searchQuery = '';

function exerciseCardHtml(ex) {
  const mg = muscleGroup(ex.muscleGroup);
  const thumb = ex.imageUrl
    ? `<img src="${escapeHtml(ex.imageUrl)}" alt="${escapeHtml(ex.name)}" loading="lazy" draggable="false" />`
    : icon('dumbbell');
  return `
    <div class="card exercise-card glass" data-exercise-id="${ex.id}">
      <div class="exercise-thumb">${thumb}</div>
      <div class="exercise-info">
        <div class="exercise-name">${escapeHtml(ex.name)}</div>
        <span class="badge" style="background:${mg.color}">${escapeHtml(mg.label)}</span>
      </div>
      <div class="exercise-row-actions">
        <button class="icon-btn danger" data-delete-exercise="${ex.id}" aria-label="Elimina esercizio">${icon('trash')}</button>
      </div>
    </div>
  `;
}

function muscleChipsHtml(selected, includeAll = true) {
  const all = includeAll
    ? [{ key: 'tutti', label: 'Tutti', color: 'var(--accent-a)' }, ...MUSCLE_GROUPS]
    : MUSCLE_GROUPS;
  return all.map((mg) => `
    <span class="chip ${selected === mg.key ? 'selected' : ''}" data-mg="${mg.key}"
      style="${selected === mg.key ? `background:${mg.color};` : ''}">
      ${escapeHtml(mg.label)}
    </span>
  `).join('');
}

// ---------- Add / edit exercise modal ----------

let selectedSuggestionImage = null;
let selectedMuscleGroup = null;
let selectedDescription = null;
let searchDebounce = null;

function openExerciseModal(existing) {
  selectedSuggestionImage = existing ? existing.imageUrl : null;
  selectedMuscleGroup = existing ? existing.muscleGroup : null;
  selectedDescription = existing ? existing.description : null;

  openModal({
    title: existing ? 'Modifica esercizio' : 'Nuovo esercizio',
    bodyHtml: `
      <div class="field">
        <label for="ex-name-input">Nome esercizio</label>
        <input type="text" class="input" id="ex-name-input" placeholder="Es. Panca piana, Squat, Curl bicipiti..." maxlength="60" value="${existing ? escapeHtml(existing.name) : ''}" />
      </div>

      <div class="field">
        <label>Immagine illustrativa <span class="text-secondary" style="font-weight:400">(puoi cercare anche in italiano)</span></label>
        <div id="suggestion-status" class="text-secondary" style="font-size:0.8rem;min-height:1.2em;"></div>
        <div class="suggestion-row" id="suggestion-row"></div>
        ${existing && existing.imageUrl ? `
          <div class="flex items-center gap-2 mt-2">
            <img src="${escapeHtml(existing.imageUrl)}" alt="" draggable="false" style="width:44px;height:44px;border-radius:10px;object-fit:cover" />
            <span class="text-secondary" style="font-size:0.8rem">Immagine attuale</span>
          </div>` : ''}
      </div>

      <div class="field">
        <label>Parte del corpo</label>
        <div class="chip-row" id="mg-picker" style="flex-wrap:wrap;overflow:visible">
          ${muscleChipsHtml(selectedMuscleGroup, false)}
        </div>
      </div>

      <button class="btn btn-primary btn-block" id="save-exercise-btn">Salva esercizio</button>
    `,
    onMount: (body) => {
      const nameInput = body.querySelector('#ex-name-input');
      const suggestionRow = body.querySelector('#suggestion-row');
      const status = body.querySelector('#suggestion-status');
      const mgPicker = body.querySelector('#mg-picker');
      nameInput.focus();

      function paintMgPicker() {
        mgPicker.innerHTML = muscleChipsHtml(selectedMuscleGroup, false);
        mgPicker.querySelectorAll('[data-mg]').forEach((chip) => {
          chip.addEventListener('click', () => {
            selectedMuscleGroup = chip.dataset.mg;
            paintMgPicker();
          });
        });
      }
      paintMgPicker();

      let lastSuggestions = [];

      function paintSuggestions(items) {
        lastSuggestions = items;
        suggestionRow.innerHTML = items.map((s, i) => `
          <div class="suggestion-card ${s.imageUrl === selectedSuggestionImage ? 'selected' : ''}" data-idx="${i}">
            ${s.imageUrl ? `<img src="${escapeHtml(s.imageUrl)}" loading="lazy" alt="" draggable="false" />` : `<div class="exercise-thumb" style="width:72px;height:72px;margin:0 auto 4px">${icon('image')}</div>`}
            <div class="suggestion-name">${escapeHtml(s.name)}</div>
          </div>
        `).join('');
        suggestionRow.querySelectorAll('.suggestion-card').forEach((card) => {
          card.addEventListener('click', async () => {
            const s = lastSuggestions[Number(card.dataset.idx)];
            selectedSuggestionImage = s.imageUrl || null;
            if (!selectedMuscleGroup && s.muscleHint) {
              selectedMuscleGroup = s.muscleHint;
              paintMgPicker();
            }
            suggestionRow.querySelectorAll('.suggestion-card').forEach((c) => c.classList.remove('selected'));
            card.classList.add('selected');

            selectedDescription = null;
            status.textContent = 'Traduco la descrizione...';
            const translated = await translateInstructionsToItalian(s.instructions);
            selectedDescription = translated || null;
            status.textContent = translated ? 'Descrizione tradotta.' : '';
          });
        });
      }

      async function runSearch(term) {
        if (term.trim().length < 2) {
          suggestionRow.innerHTML = '';
          status.textContent = '';
          return;
        }
        status.textContent = 'Cerco immagini...';
        suggestionRow.innerHTML = Array.from({ length: 3 }).map(() => `
          <div class="suggestion-card"><div class="skeleton" style="width:72px;height:72px;"></div></div>
        `).join('');
        try {
          const results = await searchExerciseImages(term);
          if (!results.length) {
            status.textContent = 'Nessuna immagine trovata. Puoi salvare comunque senza immagine.';
            suggestionRow.innerHTML = '';
            return;
          }
          status.textContent = `${results.length} suggerimenti trovati — tocca per scegliere`;
          paintSuggestions(results);
        } catch (err) {
          status.textContent = 'Ricerca immagini non disponibile (offline?). Puoi salvare senza immagine.';
          suggestionRow.innerHTML = '';
        }
      }

      nameInput.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        const term = nameInput.value;
        searchDebounce = setTimeout(() => runSearch(term), 400);
      });

      if (existing) runSearch(existing.name);

      body.querySelector('#save-exercise-btn').addEventListener('click', () => {
        const name = nameInput.value.trim();
        if (!name) { nameInput.focus(); return; }
        if (!selectedMuscleGroup) {
          status.textContent = 'Seleziona una parte del corpo prima di salvare.';
          mgPicker.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        if (existing) {
          store.updateExercise(existing.id, {
            name,
            muscleGroup: selectedMuscleGroup,
            imageUrl: selectedSuggestionImage !== null ? selectedSuggestionImage : existing.imageUrl,
            description: selectedDescription !== null ? selectedDescription : existing.description,
          });
          showToast('Esercizio aggiornato');
        } else {
          store.addExercise({ name, muscleGroupKey: selectedMuscleGroup, imageUrl: selectedSuggestionImage, description: selectedDescription });
          showToast('Esercizio aggiunto');
        }
        closeModal();
        renderCurrent();
      });
    },
  });
}

let currentContainer = null;
function renderCurrent() {
  if (currentContainer) render(currentContainer);
}

// ---------- Detail card ----------

function openExerciseDetailModal(ex) {
  const mg = muscleGroup(ex.muscleGroup);
  openModal({
    title: ex.name,
    bodyHtml: `
      <div class="text-center">
        ${ex.imageUrl
          ? `<img src="${escapeHtml(ex.imageUrl)}" alt="${escapeHtml(ex.name)}" draggable="false" style="width:100%;max-height:280px;object-fit:cover;border-radius:var(--radius-lg);margin-bottom:12px" />`
          : `<div class="exercise-thumb" style="width:100%;height:180px;margin-bottom:12px">${icon('dumbbell')}</div>`}
        <span class="badge" style="background:${mg.color}">${escapeHtml(mg.label)}</span>
      </div>
      <p class="text-secondary mt-4" style="line-height:1.5">${ex.description ? escapeHtml(ex.description) : 'Nessuna descrizione disponibile.'}</p>
      <div class="flex gap-3 mt-4">
        <button class="btn btn-glass w-full" id="detail-edit-btn">${icon('edit')} Modifica</button>
        <button class="btn btn-danger w-full" id="detail-delete-btn">${icon('trash')} Elimina</button>
      </div>
    `,
    onMount: (body) => {
      body.querySelector('#detail-edit-btn').addEventListener('click', () => {
        openExerciseModal(ex);
      });
      body.querySelector('#detail-delete-btn').addEventListener('click', () => {
        confirmAction({
          title: 'Eliminare esercizio?',
          message: `"${ex.name}" verrà rimosso dalla libreria e da tutti i giorni in cui è usato.`,
          confirmLabel: 'Elimina',
          onConfirm: () => {
            store.deleteExercise(ex.id);
            showToast('Esercizio eliminato');
            renderCurrent();
          },
        });
      });
    },
  });
}

function render(container) {
  currentContainer = container;
  const { exercises } = store.get();

  const filtered = exercises.filter((ex) => {
    const matchesFilter = activeFilter === 'tutti' || ex.muscleGroup === activeFilter;
    const matchesSearch = !searchQuery || ex.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const list = exercises.length === 0
    ? `
      <div class="empty-state glass">
        <div class="empty-emoji">🏋️</div>
        <div class="empty-title">La tua libreria è vuota</div>
        <div class="empty-text">Aggiungi i tuoi esercizi: cerca il nome e ti mostro una foto illustrativa, se disponibile.</div>
        <button class="btn btn-primary" id="empty-add-exercise">Aggiungi il primo esercizio</button>
      </div>
    `
    : filtered.length === 0
      ? `<p class="text-secondary text-center mt-4">Nessun esercizio trovato per questo filtro.</p>`
      : filtered.map(exerciseCardHtml).join('');

  container.innerHTML = `
    <h1 class="section-title">Esercizi</h1>
    <p class="section-subtitle">La tua libreria personale di esercizi.</p>
    <input type="text" class="input mt-2" id="search-exercises" placeholder="Cerca un esercizio..." value="${escapeHtml(searchQuery)}" style="margin-bottom:12px" />
    <div class="chip-row" id="mg-filter">${muscleChipsHtml(activeFilter)}</div>
    <div id="exercises-list">${list}</div>
    <button class="fab" id="fab-add-exercise" aria-label="Nuovo esercizio">${icon('plus')}</button>
  `;

  container.querySelector('#fab-add-exercise').addEventListener('click', () => openExerciseModal(null));
  const emptyBtn = container.querySelector('#empty-add-exercise');
  if (emptyBtn) emptyBtn.addEventListener('click', () => openExerciseModal(null));

  const searchInput = container.querySelector('#search-exercises');
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    render(container);
    container.querySelector('#search-exercises').focus();
    const val = container.querySelector('#search-exercises');
    val.selectionStart = val.selectionEnd = val.value.length;
  });

  container.querySelectorAll('#mg-filter [data-mg]').forEach((chip) => {
    chip.addEventListener('click', () => {
      activeFilter = chip.dataset.mg;
      render(container);
    });
  });

  container.querySelectorAll('[data-exercise-id]').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-delete-exercise]')) return;
      const ex = store.getExercise(card.dataset.exerciseId);
      if (ex) openExerciseDetailModal(ex);
    });
  });

  container.querySelectorAll('[data-delete-exercise]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.deleteExercise;
      const ex = store.getExercise(id);
      confirmAction({
        title: 'Eliminare esercizio?',
        message: `"${ex.name}" verrà rimosso dalla libreria e da tutti i giorni in cui è usato.`,
        confirmLabel: 'Elimina',
        onConfirm: () => {
          store.deleteExercise(id);
          showToast('Esercizio eliminato');
          render(container);
        },
      });
    });
  });
}

window.MyGym = window.MyGym || {};
window.MyGym.views = window.MyGym.views || {};
window.MyGym.views.exercises = { render, openExerciseModal };

})();
