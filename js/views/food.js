// Script classico (non un modulo ES): espone tutto su window.MyGym.views.food.
//
// Sezione "Cibo": si fotografa il piatto, l'AI dice cosa c'e' dentro con una
// stima dei grammi, tu correggi, e solo allora si calcolano i valori. Il
// secondo passaggio e' separato apposta: da una foto non si vedono ne' il peso
// reale ne' i condimenti, quindi la precisione arriva dai grammi confermati da
// te, non da quello che il modello ha indovinato a occhio.
//
// La chiave di Groq non sta qui: la richiesta passa dal Worker Cloudflare, lo
// stesso del Virtual PT, che la tiene nascosta come secret.
(function () {

const { store, icon, escapeHtml, showToast, confirmAction, navigate } = window.MyGym;

const WORKER_URL = 'https://mygym-pt.minnitijunior.workers.dev/';

let currentContainer = null;
// La sezione si apre da Progressi oppure dal Virtual PT: l'indietro deve
// riportare dove si era, non sempre nello stesso posto.
let backTo = '#/progressi';
let photo = null;      // data URL della foto compressa
let dish = '';         // nome del piatto proposto dall'AI
let uncertain = '';    // cosa l'AI non ha saputo distinguere
let items = [];        // { nome, grammi, nota }
let result = null;     // valori calcolati, in attesa di essere salvati
let busy = '';         // messaggio di attesa in corso
let error = '';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function formatNumber(value, decimali) {
  return Number(value || 0).toLocaleString('it-IT', { maximumFractionDigits: decimali === undefined ? 1 : decimali });
}

// ---------- Chiamate al Worker ----------

async function askWorker(payload) {
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = String(data.detail || '');
    // Il piano gratuito di Groq concede poche richieste al minuto: capita di
    // sbatterci contro facendo due analisi di fila, e va detto in chiaro.
    if (/rate.?limit/i.test(detail)) {
      const attesa = detail.match(/try again in ([\d.]+)s/i);
      throw new Error(attesa
        ? `Groq ha raggiunto il limite di richieste al minuto: riprova tra ${Math.ceil(Number(attesa[1]))} secondi.`
        : 'Groq ha raggiunto il limite di richieste al minuto: aspetta un momento e riprova.');
    }
    throw new Error(data.error || `Errore ${res.status}`);
  }
  return data;
}

// ---------- Foto ----------

// Una foto da telefono pesa 3-5 MB: ridotta a 1024px e ricompressa scende
// sotto il mezzo mega, cosi' l'analisi parte in fretta anche con poca rete.
function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const lato = 1024;
        const scala = Math.min(1, lato / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scala);
        canvas.height = Math.round(img.height * scala);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('Immagine non leggibile.'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Non riesco a leggere il file.'));
    reader.readAsDataURL(file);
  });
}

async function analyzePhoto() {
  error = '';
  busy = 'Sto guardando la foto…';
  render(currentContainer);
  try {
    const out = await askWorker({ task: 'cibo-foto', image: photo });
    // Se il modello non ha davvero guardato la foto risponde fuori tema o con
    // una lista vuota: meglio dirlo che mostrare numeri inventati.
    if (!Array.isArray(out.alimenti)) throw new Error('Il modello non ha riconosciuto il piatto. Riprova.');
    if (!out.alimenti.length) throw new Error(out.incerto || 'Nella foto non è stato riconosciuto del cibo. Riprova più da vicino, con il piatto ben illuminato.');

    dish = String(out.piatto || '').trim();
    uncertain = String(out.incerto || '').trim();
    items = out.alimenti.map((a) => ({
      nome: String(a.nome || '').trim(),
      grammi: Math.max(0, Math.round(Number(a.grammi) || 0)),
      // Una porzione oltre il chilo e mezzo non e' un piatto: quasi sempre
      // significa che la stima e' campata in aria, e va segnalata.
      nota: Number(a.grammi) > 1500 ? 'stima poco credibile, correggila' : String(a.nota || '').trim(),
    })).filter((a) => a.nome);
    result = null;
  } catch (e) {
    error = e.message;
  } finally {
    busy = '';
    render(currentContainer);
  }
}

async function computeValues() {
  error = '';
  const lista = items.filter((a) => a.grammi > 0);
  if (!lista.length) {
    error = 'Metti almeno un alimento con i grammi.';
    render(currentContainer);
    return;
  }
  busy = 'Calcolo i valori…';
  render(currentContainer);
  try {
    const out = await askWorker({
      task: 'cibo-valori',
      alimenti: lista.map(({ nome, grammi }) => ({ nome, grammi })),
    });
    if (!out || !out.totale || !Number(out.totale.kcal)) {
      throw new Error('Il modello ha risposto senza calorie. Riprova.');
    }
    result = out;
  } catch (e) {
    error = e.message;
  } finally {
    busy = '';
    render(currentContainer);
  }
}

// ---------- Pezzi di interfaccia ----------

function totalsHtml(totale, etichetta) {
  return `
    <div class="food-totals">
      <div class="food-tot kcal">
        <div class="v">${Math.round(totale.kcal || 0).toLocaleString('it-IT')} kcal</div>
        <div class="l">${etichetta}</div>
      </div>
      <div class="food-tot"><div class="v">${formatNumber(totale.proteine)} g</div><div class="l">proteine</div></div>
      <div class="food-tot"><div class="v">${formatNumber(totale.carboidrati)} g</div><div class="l">carboidrati</div></div>
      <div class="food-tot"><div class="v">${formatNumber(totale.grassi)} g</div><div class="l">grassi</div></div>
      <div class="food-tot"><div class="v">${formatNumber(totale.fibre)} g</div><div class="l">fibre</div></div>
    </div>`;
}

function photoCardHtml() {
  return `
    <div class="card glass">
      ${photo ? `<img class="food-preview" src="${photo}" alt="Il piatto fotografato" />` : ''}
      <button class="food-drop" id="pick-photo">
        <span class="food-drop-icon">${icon('fotocamera')}</span>
        <strong>${photo ? 'Cambia foto' : 'Scatta o scegli una foto'}</strong>
        <span>Inquadra il piatto dall'alto, con tutto il contenuto visibile</span>
      </button>
      <input type="file" id="photo-input" accept="image/*" capture="environment" hidden />
      ${photo ? `<button class="btn btn-primary btn-block mt-2" id="analyze-btn" ${busy ? 'disabled' : ''}>Analizza il piatto</button>` : ''}
    </div>`;
}

function itemsCardHtml() {
  if (!items.length) return '';
  return `
    <div class="page-section">
      <h3>Quanto ce n'è</h3>
      <div class="card glass">
        ${dish ? `<p class="food-dish">Sembra: <strong>${escapeHtml(dish)}</strong></p>` : ''}
        ${uncertain ? `<p class="food-note">L'AI non è sicura di: ${escapeHtml(uncertain)}</p>` : ''}
        <div class="food-list">
          ${items.map((a, i) => `
            <div class="food-row">
              <span class="food-name">${escapeHtml(a.nome)}${a.nota ? `<small>${escapeHtml(a.nota)}</small>` : ''}</span>
              <input type="text" inputmode="numeric" class="input food-grams" value="${a.grammi}" data-grams="${i}" />
              <span class="food-unit">g</span>
              <button class="icon-btn danger" data-remove-item="${i}" aria-label="Togli ${escapeHtml(a.nome)}">${icon('trash')}</button>
            </div>`).join('')}
        </div>
        <div class="food-add">
          <input type="text" class="input" id="add-name" placeholder="Aggiungi quello che manca" maxlength="60" />
          <input type="text" inputmode="numeric" class="input food-grams" id="add-grams" placeholder="g" />
          <button class="icon-btn" id="add-item" aria-label="Aggiungi">${icon('plus')}</button>
        </div>
        <button class="btn btn-primary btn-block mt-2" id="calc-btn" ${busy ? 'disabled' : ''}>Calcola i valori nutrizionali</button>
      </div>
    </div>`;
}

function resultCardHtml() {
  if (!result) return '';
  return `
    <div class="page-section">
      <h3>Valori del piatto</h3>
      <div class="card glass">
        ${totalsHtml(result.totale || {}, 'totale del piatto')}
        <div class="food-list mt-3">
          ${(result.alimenti || []).map((a) => `
            <div class="food-row food-row-readonly">
              <span class="food-name">${escapeHtml(a.nome)}<small>${a.grammi} g · P ${formatNumber(a.proteine)} · C ${formatNumber(a.carboidrati)} · G ${formatNumber(a.grassi)}</small></span>
              <span class="food-kcal">${Math.round(a.kcal || 0)} kcal</span>
            </div>`).join('')}
        </div>
        ${result.nota ? `<p class="food-note">${escapeHtml(result.nota)}</p>` : ''}
        <button class="btn btn-primary btn-block mt-2" id="save-meal">Salva nel diario di oggi</button>
      </div>
    </div>`;
}

function diaryHtml() {
  const meals = store.getMealsByDay(todayKey());
  if (!meals.length) return '';
  const somma = meals.reduce((acc, m) => {
    ['kcal', 'proteine', 'carboidrati', 'grassi', 'fibre'].forEach((k) => {
      acc[k] = (acc[k] || 0) + (Number(m.totals[k]) || 0);
    });
    return acc;
  }, {});

  return `
    <div class="page-section">
      <h3>Diario di oggi</h3>
      <div class="card glass">
        ${totalsHtml(somma, `totale di oggi · ${meals.length} past${meals.length === 1 ? 'o' : 'i'}`)}
        <div class="food-list mt-3">
          ${meals.map((m) => `
            <div class="food-row">
              <span class="food-name">${escapeHtml(m.name)}<small>${new Date(m.date).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} · ${m.items.length} aliment${m.items.length === 1 ? 'o' : 'i'}</small></span>
              <span class="food-kcal">${Math.round(m.totals.kcal || 0)} kcal</span>
              <button class="icon-btn danger" data-delete-meal="${m.id}" aria-label="Elimina ${escapeHtml(m.name)}">${icon('trash')}</button>
            </div>`).join('')}
        </div>
      </div>
    </div>`;
}

// ---------- Render ----------

function render(container, origin) {
  currentContainer = container;
  if (origin === 'pt') backTo = '#/pt';
  else if (origin !== undefined) backTo = '#/progressi';

  container.innerHTML = `
    <div class="flex items-center gap-3">
      <button class="icon-btn" id="back-btn" aria-label="Indietro">${icon('back')}</button>
      <h1 class="section-title" style="margin:0">Cibo</h1>
    </div>
    <p class="section-subtitle">Fotografa il piatto: l'AI dice cosa contiene, tu correggi i grammi.</p>

    <div class="page-section">
      ${photoCardHtml()}
      ${busy ? `<p class="food-busy">${busy}</p>` : ''}
      ${error ? `<p class="form-error">${escapeHtml(error)}</p>` : ''}
    </div>

    ${itemsCardHtml()}
    ${resultCardHtml()}
    ${diaryHtml()}

    <p class="food-privacy">La foto viene inviata a Groq per l'analisi e non viene conservata da nessuna parte: nel diario restano solo gli alimenti con i grammi e i valori calcolati.</p>
  `;

  container.querySelector('#back-btn').addEventListener('click', () => navigate(backTo));

  const input = container.querySelector('#photo-input');
  container.querySelector('#pick-photo').addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      photo = await compressPhoto(file);
      items = [];
      result = null;
      dish = '';
      uncertain = '';
      error = '';
    } catch (e) {
      error = e.message;
    }
    render(container);
  });

  const analyzeBtn = container.querySelector('#analyze-btn');
  if (analyzeBtn) analyzeBtn.addEventListener('click', analyzePhoto);

  container.querySelectorAll('[data-grams]').forEach((field) => {
    field.addEventListener('change', () => {
      const raw = field.value.trim().replace(',', '.');
      items[Number(field.dataset.grams)].grammi = Math.max(0, Math.round(Number(raw) || 0));
      result = null;
      render(container);
    });
  });

  container.querySelectorAll('[data-remove-item]').forEach((btn) => {
    btn.addEventListener('click', () => {
      items.splice(Number(btn.dataset.removeItem), 1);
      result = null;
      render(container);
    });
  });

  const addItem = container.querySelector('#add-item');
  if (addItem) {
    addItem.addEventListener('click', () => {
      const nome = container.querySelector('#add-name').value.trim();
      const grammi = Math.max(0, Math.round(Number(container.querySelector('#add-grams').value.replace(',', '.')) || 0));
      if (!nome) return;
      items.push({ nome, grammi, nota: 'aggiunto da te' });
      result = null;
      render(container);
    });
  }

  const calcBtn = container.querySelector('#calc-btn');
  if (calcBtn) calcBtn.addEventListener('click', computeValues);

  const saveBtn = container.querySelector('#save-meal');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      store.addMeal({ name: dish || 'Pasto', items, totals: result.totale || {} });
      showToast('Pasto salvato nel diario');
      photo = null;
      items = [];
      result = null;
      dish = '';
      uncertain = '';
      render(container);
    });
  }

  container.querySelectorAll('[data-delete-meal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const meal = store.getMealsByDay(todayKey()).find((m) => m.id === btn.dataset.deleteMeal);
      if (!meal) return;
      confirmAction({
        title: 'Eliminare il pasto?',
        message: `"${meal.name}" (${Math.round(meal.totals.kcal || 0)} kcal) verrà tolto dal diario di oggi.`,
        confirmLabel: 'Elimina',
        onConfirm: () => {
          store.deleteMeal(meal.id);
          showToast('Pasto eliminato');
          render(container);
        },
      });
    });
  });
}

window.MyGym = window.MyGym || {};
window.MyGym.views = window.MyGym.views || {};
window.MyGym.views.food = { render };

})();
