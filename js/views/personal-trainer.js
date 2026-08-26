// Script classico (non un modulo ES): espone tutto su window.MyGym.views.personalTrainer.
// La scheda viene generata da un'IA (Groq) tramite un Cloudflare Worker che
// nasconde la chiave API — vedi cloudflare-worker/worker.js. Il Worker va
// distribuito una volta sola; l'URL qui sotto va aggiornato con quello reale.
(function () {

const { store, MUSCLE_GROUPS, muscleGroup, MAX_MUSCLE_GROUPS_PER_EXERCISE, icon, escapeHtml, showToast, navigate, findAutoExerciseMatch } = window.MyGym;

const WORKER_URL = 'https://mygym-pt.minnitijunior.workers.dev/';

const GENDERS = ['Uomo', 'Donna'];
const GOALS = ['Dimagrimento', 'Massa muscolare', 'Forza', 'Resistenza', 'Tonificazione', 'Definizione', 'Mobilità e flessibilità', 'Benessere generale'];
const LEVELS = ['Principiante', 'Intermedio', 'Avanzato'];
const DAYS_OPTIONS = [2, 3, 4, 5, 6];
const EQUIPMENT = ['Palestra completa', 'Manubri a casa', 'Kettlebell', 'Fasce elastiche', 'Calisthenics', 'Corpo libero'];
const WEIGHT_UNITS = ['kg', 'lbs'];
const HEIGHT_UNITS = ['cm', 'ft'];

let currentContainer = null;
let screen = 'form'; // 'form' | 'loading' | 'result' | 'error'
let lastPlan = null;
let lastError = null;

let formState = {
  name: '',
  surname: '',
  age: '',
  weight: '',
  weightUnit: 'kg',
  height: '',
  heightFeet: '',
  heightInches: '',
  heightUnit: 'cm',
  gender: 'Uomo',
  goal: 'Massa muscolare',
  level: 'Intermedio',
  daysPerWeek: 3,
  equipment: 'Palestra completa',
  notes: '',
};

// Il Worker/l'IA ragionano sempre in kg e cm: qui convertiamo solo al momento
// dell'invio, cosi' l'utente puo' continuare a digitare nell'unita' scelta.
function normalizedWeightKg() {
  const w = parseFloat((formState.weight || '').replace(',', '.'));
  if (!w || Number.isNaN(w)) return '';
  const kg = formState.weightUnit === 'lbs' ? w * 0.453592 : w;
  return Math.round(kg * 10) / 10;
}

function normalizedHeightCm() {
  if (formState.heightUnit === 'ft') {
    const ft = parseFloat(formState.heightFeet) || 0;
    const inch = parseFloat(formState.heightInches) || 0;
    if (!ft && !inch) return '';
    return Math.round((ft * 12 + inch) * 2.54);
  }
  const h = parseFloat((formState.height || '').replace(',', '.'));
  return h && !Number.isNaN(h) ? Math.round(h) : '';
}

function renderCurrent() {
  if (currentContainer) render(currentContainer);
}

// ---------- Helpers UI ----------

function chipRow(idPrefix, options, selected) {
  return `
    <div class="chip-row" id="${idPrefix}-row" style="flex-wrap:wrap;overflow:visible">
      ${options.map((opt) => `
        <span class="chip ${String(opt) === String(selected) ? 'selected' : ''}" data-value="${escapeHtml(String(opt))}"
          style="${String(opt) === String(selected) ? 'background:var(--accent-gradient);color:#fff;' : ''}">
          ${escapeHtml(String(opt))}
        </span>
      `).join('')}
    </div>
  `;
}

function bindChipRow(body, idPrefix, onSelect) {
  body.querySelector(`#${idPrefix}-row`).querySelectorAll('[data-value]').forEach((chip) => {
    chip.addEventListener('click', () => {
      onSelect(chip.dataset.value);
      body.querySelector(`#${idPrefix}-row`).querySelectorAll('[data-value]').forEach((c) => {
        c.classList.remove('selected');
        c.style.cssText = '';
      });
      chip.classList.add('selected');
      chip.style.cssText = 'background:var(--accent-gradient);color:#fff;';
    });
  });
}

// Come bindChipRow, ma per i toggle di unita' (kg/lbs, cm/ft): cambiare
// unita' cambia anche quali campi numerici sono visibili, quindi qui serve
// un re-render completo del form invece del solo restyle del chip.
function bindUnitToggle(body, idPrefix, onSelect) {
  body.querySelector(`#${idPrefix}-row`).querySelectorAll('[data-value]').forEach((chip) => {
    chip.addEventListener('click', () => {
      onSelect(chip.dataset.value);
      renderCurrent();
    });
  });
}

// ---------- Schermata 1: form dati ----------

function renderForm(container) {
  container.innerHTML = `
    <div class="flex items-center gap-2">
      <span style="width:26px;height:26px;color:var(--accent-a)">${icon('sparkles')}</span>
      <h1 class="section-title" style="margin:0">Virtual Personal Trainer</h1>
    </div>
    <p class="section-subtitle">Racconta qualcosa di te: un'IA prepara una scheda su misura.</p>

    <div class="flex gap-3">
      <div class="field" style="flex:1">
        <label for="pt-name">Nome</label>
        <input type="text" class="input" id="pt-name" placeholder="Il tuo nome" maxlength="40" value="${escapeHtml(formState.name)}" />
      </div>
      <div class="field" style="flex:1">
        <label for="pt-surname">Cognome</label>
        <input type="text" class="input" id="pt-surname" placeholder="Il tuo cognome" maxlength="40" value="${escapeHtml(formState.surname)}" />
      </div>
    </div>

    <div class="field">
      <label for="pt-age">Età</label>
      <input type="text" inputmode="numeric" class="input" id="pt-age" placeholder="anni" value="${escapeHtml(formState.age)}" style="max-width:120px" />
    </div>

    <div class="field">
      <label for="pt-weight">Peso</label>
      <div class="flex items-center gap-2 mt-2" style="flex-wrap:wrap">
        <input type="text" inputmode="decimal" class="input" id="pt-weight" placeholder="${formState.weightUnit}" value="${escapeHtml(formState.weight)}" style="max-width:96px" />
        ${chipRow('pt-weight-unit', WEIGHT_UNITS, formState.weightUnit)}
      </div>
    </div>

    <div class="field">
      <label>Altezza</label>
      <div class="flex items-center gap-2 mt-2" style="flex-wrap:wrap">
        ${formState.heightUnit === 'ft' ? `
          <input type="text" inputmode="numeric" class="input" id="pt-height-ft" placeholder="piedi" value="${escapeHtml(formState.heightFeet)}" style="max-width:76px" />
          <input type="text" inputmode="numeric" class="input" id="pt-height-in" placeholder="pollici" value="${escapeHtml(formState.heightInches)}" style="max-width:76px" />
        ` : `
          <input type="text" inputmode="numeric" class="input" id="pt-height" placeholder="cm" value="${escapeHtml(formState.height)}" style="max-width:96px" />
        `}
        ${chipRow('pt-height-unit', HEIGHT_UNITS, formState.heightUnit)}
      </div>
    </div>

    <div class="field">
      <label>Sesso</label>
      ${chipRow('pt-gender', GENDERS, formState.gender)}
    </div>

    <div class="field">
      <label>Obiettivo</label>
      ${chipRow('pt-goal', GOALS, formState.goal)}
    </div>

    <div class="field">
      <label>Livello di esperienza</label>
      ${chipRow('pt-level', LEVELS, formState.level)}
    </div>

    <div class="field">
      <label>Giorni di allenamento a settimana</label>
      ${chipRow('pt-days', DAYS_OPTIONS, formState.daysPerWeek)}
    </div>

    <div class="field">
      <label>Attrezzatura disponibile</label>
      ${chipRow('pt-equipment', EQUIPMENT, formState.equipment)}
    </div>

    <div class="field">
      <label for="pt-notes">Note, preferenze o infortuni <span class="text-secondary" style="font-weight:400">(opzionale)</span></label>
      <textarea class="input textarea" id="pt-notes" rows="3" placeholder="Es. mal di schiena, preferisco non fare corsa...">${escapeHtml(formState.notes)}</textarea>
    </div>

    <button class="btn btn-primary btn-block mt-2" id="pt-generate-btn">${icon('sparkles')} Genera la mia scheda</button>
    <p class="text-secondary text-center" style="font-size:0.72rem;margin-top:10px">La scheda è generata da un'intelligenza artificiale: rivedila con buon senso, specialmente in caso di patologie o infortuni.</p>
  `;

  container.querySelector('#pt-name').addEventListener('change', (e) => { formState.name = e.target.value; });
  container.querySelector('#pt-surname').addEventListener('change', (e) => { formState.surname = e.target.value; });
  container.querySelector('#pt-age').addEventListener('change', (e) => { formState.age = e.target.value; });
  container.querySelector('#pt-weight').addEventListener('change', (e) => { formState.weight = e.target.value; });
  container.querySelector('#pt-notes').addEventListener('change', (e) => { formState.notes = e.target.value; });

  const heightCmInput = container.querySelector('#pt-height');
  if (heightCmInput) heightCmInput.addEventListener('change', (e) => { formState.height = e.target.value; });
  const heightFtInput = container.querySelector('#pt-height-ft');
  if (heightFtInput) heightFtInput.addEventListener('change', (e) => { formState.heightFeet = e.target.value; });
  const heightInInput = container.querySelector('#pt-height-in');
  if (heightInInput) heightInInput.addEventListener('change', (e) => { formState.heightInches = e.target.value; });

  bindChipRow(container, 'pt-gender', (v) => { formState.gender = v; });
  bindChipRow(container, 'pt-goal', (v) => { formState.goal = v; });
  bindChipRow(container, 'pt-level', (v) => { formState.level = v; });
  bindChipRow(container, 'pt-days', (v) => { formState.daysPerWeek = Number(v); });
  bindChipRow(container, 'pt-equipment', (v) => { formState.equipment = v; });
  bindUnitToggle(container, 'pt-weight-unit', (v) => { formState.weightUnit = v; });
  bindUnitToggle(container, 'pt-height-unit', (v) => { formState.heightUnit = v; });

  container.querySelector('#pt-generate-btn').addEventListener('click', submitForm);
}

// ---------- Schermata 2: caricamento ----------

function renderLoading(container) {
  container.innerHTML = `
    <div class="empty-state glass mt-4">
      <div class="empty-emoji" style="animation:spin 1.6s linear infinite; display:inline-block">${icon('sparkles')}</div>
      <div class="empty-title">Il tuo personal trainer sta pensando...</div>
      <div class="empty-text">Sto preparando una scheda su misura, qualche secondo.</div>
    </div>
  `;
}

// ---------- Chiamata al Worker ----------

async function submitForm() {
  if (WORKER_URL.includes('REPLACE-WITH-YOUR-WORKER-URL')) {
    lastError = 'Il Virtual Personal Trainer non è ancora collegato: manca l\'URL del Cloudflare Worker (vedi cloudflare-worker/worker.js per i passaggi di configurazione).';
    screen = 'error';
    renderCurrent();
    return;
  }

  screen = 'loading';
  renderCurrent();

  try {
    // Il Worker/l'IA ricevono sempre kg e cm, a prescindere dall'unita' scelta
    // dall'utente (conversione fatta qui, vedi normalizedWeightKg/Cm sopra).
    const payload = {
      ...formState,
      weight: normalizedWeightKg(),
      height: normalizedHeightCm(),
    };
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    let data;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error('Risposta non valida dal servizio IA.');
    }

    if (!res.ok) {
      throw new Error(data.error || 'Errore nella generazione della scheda.');
    }
    if (!data.days || !Array.isArray(data.days) || !data.days.length) {
      throw new Error('La scheda ricevuta non è nel formato atteso. Riprova.');
    }

    lastPlan = data;
    screen = 'result';
    renderCurrent();
  } catch (err) {
    lastError = err.message || 'Errore di rete: controlla la connessione e riprova.';
    screen = 'error';
    renderCurrent();
  }
}

// ---------- Schermata 3: errore ----------

function renderError(container) {
  container.innerHTML = `
    <div class="empty-state glass mt-4">
      <div class="empty-emoji">⚠️</div>
      <div class="empty-title">Qualcosa non ha funzionato</div>
      <div class="empty-text">${escapeHtml(lastError || 'Errore sconosciuto.')}</div>
      <button class="btn btn-primary" id="pt-retry-btn">Torna al modulo</button>
    </div>
  `;
  container.querySelector('#pt-retry-btn').addEventListener('click', () => {
    screen = 'form';
    renderCurrent();
  });
}

// ---------- Schermata 4: risultato ----------

function planExerciseCardHtml(ex) {
  const groups = (ex.muscleGroups || []).filter((k) => MUSCLE_GROUPS.some((mg) => mg.key === k)).slice(0, MAX_MUSCLE_GROUPS_PER_EXERCISE);
  const badges = groups.map((key) => {
    const mg = muscleGroup(key);
    return `<span class="badge" style="background:${mg.color}">${escapeHtml(mg.label)}</span>`;
  }).join(' ');
  return `
    <div class="set-row set-row-readonly">
      <span class="set-label" style="width:auto;flex:1;color:var(--text-primary);font-weight:600">${escapeHtml(ex.name || 'Esercizio')}</span>
      <span class="flex gap-2" style="flex-wrap:wrap;justify-content:flex-end">${badges}</span>
      <span class="text-secondary" style="white-space:nowrap;margin-left:8px">${ex.sets || 3}×${ex.reps || 10}</span>
    </div>
  `;
}

function planDayCardHtml(day) {
  return `
    <div class="card glass workout-exercise-card">
      <div class="exercise-name">${escapeHtml(day.name || 'Giorno')}</div>
      <div class="sets-list mt-2">
        ${(day.exercises || []).map(planExerciseCardHtml).join('')}
      </div>
    </div>
  `;
}

// Le foto vengono cercate nello stesso dataset usato dalla ricerca manuale
// (vedi exercise-api.js: findAutoExerciseMatch). Prima si raccolgono tutti i
// nomi nuovi della scheda (una sola ricerca per nome, anche se ricorre in piu'
// giorni) e si cercano in parallelo, poi si creano davvero i giorni/esercizi.
async function importPlanToDays(plan) {
  const existingByName = new Map(store.get().exercises.map((e) => [e.name.toLowerCase(), e]));
  const toMatch = new Map(); // nome minuscolo -> { name, groups }

  plan.days.forEach((day) => {
    (day.exercises || []).forEach((ex) => {
      const name = (ex.name || 'Esercizio').trim();
      const key = name.toLowerCase();
      if (existingByName.has(key) || toMatch.has(key)) return;
      const groups = (ex.muscleGroups || []).filter((k) => MUSCLE_GROUPS.some((mg) => mg.key === k)).slice(0, MAX_MUSCLE_GROUPS_PER_EXERCISE);
      toMatch.set(key, { name, groups });
    });
  });

  const matches = new Map(); // nome minuscolo -> { imageUrl, description } | null
  await Promise.all(Array.from(toMatch.values()).map(async ({ name, groups }) => {
    const match = await findAutoExerciseMatch(name, groups).catch(() => null);
    matches.set(name.toLowerCase(), match);
  }));

  plan.days.forEach((day) => {
    const newDay = store.addDay(day.name || 'Giorno IA');
    (day.exercises || []).forEach((ex) => {
      const name = (ex.name || 'Esercizio').trim();
      const key = name.toLowerCase();
      let existing = existingByName.get(key);
      if (!existing) {
        const pending = toMatch.get(key);
        const match = matches.get(key);
        existing = store.addExercise({
          name,
          muscleGroups: pending.groups.length ? pending.groups : ['altro'],
          imageUrl: match ? match.imageUrl : null,
          description: match ? match.description : null,
        });
        existingByName.set(key, existing);
      }
      store.addExerciseToDay(newDay.id, existing.id, { sets: ex.sets || 3, reps: ex.reps || 10 });
    });
  });
}

function renderResult(container, plan) {
  container.innerHTML = `
    <div class="flex items-center gap-2">
      <span style="width:26px;height:26px;color:var(--accent-a)">${icon('sparkles')}</span>
      <h1 class="section-title" style="margin:0">La tua scheda</h1>
    </div>
    <div class="card glass mt-2">
      <p style="margin:0;line-height:1.5">${escapeHtml(plan.note || '')}</p>
    </div>
    <div class="mt-4">${plan.days.map(planDayCardHtml).join('')}</div>
    <button class="btn btn-primary btn-block mt-4" id="pt-import-btn">${icon('check')} Aggiungi questi giorni ai miei Giorni</button>
    <button class="btn btn-glass btn-block mt-2" id="pt-again-btn">Genera un'altra scheda</button>
  `;

  container.querySelector('#pt-import-btn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (btn.disabled) return;
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span style="display:inline-block;animation:spin 1.6s linear infinite">${icon('sparkles')}</span> Cerco le foto degli esercizi...`;
    try {
      await importPlanToDays(plan);
      showToast('Giorni aggiunti alla tua libreria');
      screen = 'form';
      navigate('#/');
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      showToast('Errore durante l\'importazione, riprova.');
    }
  });

  container.querySelector('#pt-again-btn').addEventListener('click', () => {
    screen = 'form';
    renderCurrent();
  });
}

// ---------- Dispatch ----------

function render(container) {
  currentContainer = container;
  if (screen === 'loading') renderLoading(container);
  else if (screen === 'result' && lastPlan) renderResult(container, lastPlan);
  else if (screen === 'error') renderError(container);
  else renderForm(container);
}

window.MyGym = window.MyGym || {};
window.MyGym.views = window.MyGym.views || {};
window.MyGym.views.personalTrainer = { render };

})();
