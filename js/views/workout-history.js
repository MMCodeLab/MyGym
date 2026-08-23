// Script classico (non un modulo ES): espone tutto su window.MyGym.views.workoutHistory.
(function () {

const { store, muscleGroup, icon, escapeHtml, openModal, showToast, confirmAction, navigate } = window.MyGym;

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m} min`;
}

function startOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function buildWeeklyBuckets(workouts, weeks) {
  const thisWeekStart = startOfWeek(new Date());
  const buckets = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(thisWeekStart);
    start.setDate(start.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const count = workouts.filter((w) => {
      const d = new Date(w.date);
      return d >= start && d < end;
    }).length;
    buckets.push({ start, count });
  }
  return buckets;
}

function chartHtml(buckets) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const W = 320, H = 120, PAD_X = 14, PAD_TOP = 20;
  const plotH = H - PAD_TOP;
  const n = buckets.length;
  const stepX = (W - PAD_X * 2) / (n - 1);

  const points = buckets.map((b, i) => ({
    x: PAD_X + i * stepX,
    y: PAD_TOP + plotH - (b.count / max) * plotH,
    count: b.count,
  }));

  // Curva morbida: una Bezier cubica tra ogni coppia di punti.
  let linePath = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cx = (p0.x + p1.x) / 2;
    linePath += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  const areaPath = `${linePath} L ${points[n - 1].x} ${H} L ${points[0].x} ${H} Z`;

  const dots = points.map((p, i) => `
    <circle cx="${p.x}" cy="${p.y}" r="${i === n - 1 ? 5 : 3}" class="line-chart-dot${i === n - 1 ? ' line-chart-dot-current' : ''}" />
    ${p.count ? `<text x="${p.x}" y="${p.y - 9}" class="line-chart-value" text-anchor="middle">${p.count}</text>` : ''}
  `).join('');

  const labels = points.map((p, i) => `
    <text x="${p.x}" y="${H + 15}" class="line-chart-label" text-anchor="middle">${buckets[i].start.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}</text>
  `).join('');

  return `
    <svg viewBox="0 0 ${W} ${H + 20}" class="line-chart-svg" role="img" aria-label="Andamento allenamenti per settimana">
      <defs>
        <linearGradient id="lineChartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent-a)" stop-opacity="0.35" />
          <stop offset="100%" stop-color="var(--accent-a)" stop-opacity="0" />
        </linearGradient>
        <linearGradient id="lineChartStroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="var(--accent-a)" />
          <stop offset="100%" stop-color="var(--accent-b)" />
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#lineChartFill)" stroke="none" />
      <path d="${linePath}" fill="none" stroke="url(#lineChartStroke)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      ${dots}
      ${labels}
    </svg>
  `;
}

function openWorkoutDetailModal(w) {
  const musclesHtml = w.muscles.map((key) => {
    const mg = muscleGroup(key);
    return `<span class="badge" style="background:${mg.color}">${escapeHtml(mg.label)}</span>`;
  }).join(' ');

  const exercisesHtml = w.exercises.map((e) => `
    <div class="card glass workout-exercise-card">
      <div class="exercise-name">${escapeHtml(e.name)}</div>
      <div class="sets-list mt-2">
        ${e.sets.map((s, i) => `<div class="set-row set-row-readonly"><span class="set-label">Serie ${i + 1}</span><span class="text-secondary">${s.reps || 0} reps × ${s.weight || 0} kg</span></div>`).join('')}
      </div>
    </div>
  `).join('');

  openModal({
    title: `${w.weekday} — ${new Date(w.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    bodyHtml: `
      <p class="text-secondary" style="margin-top:0">${formatDuration(w.durationSeconds)} · ${w.exercises.length} esercizi</p>
      <div class="flex gap-2" style="flex-wrap:wrap;margin-bottom:12px">${musclesHtml}</div>
      ${exercisesHtml}
    `,
  });
}

function historyCardHtml(w) {
  const muscles = w.muscles.slice(0, 5).map((key) => {
    const mg = muscleGroup(key);
    return `<span class="badge" style="background:${mg.color}">${escapeHtml(mg.label)}</span>`;
  }).join('');
  const dateStr = new Date(w.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });

  return `
    <div class="card day-card glass" data-workout-id="${w.id}">
      <div class="day-card-head">
        <span class="day-card-title">${escapeHtml(w.weekday)}</span>
        <button class="icon-btn danger" data-delete-workout="${w.id}" aria-label="Elimina allenamento">${icon('trash')}</button>
      </div>
      <span class="day-card-meta">${dateStr} · ${formatDuration(w.durationSeconds)} · ${w.exercises.length} esercizi</span>
      <div class="day-card-chips">${muscles}</div>
    </div>
  `;
}

function render(container) {
  const workouts = store.getWorkouts();

  if (!workouts.length) {
    container.innerHTML = `
      <div class="flex items-center gap-3">
        <button class="icon-btn" id="back-btn" aria-label="Indietro">${icon('back')}</button>
        <h1 class="section-title" style="margin:0">Allenamenti</h1>
      </div>
      <div class="empty-state glass mt-4">
        <div class="empty-emoji">📊</div>
        <div class="empty-title">Nessun allenamento salvato</div>
        <div class="empty-text">Vai su "Allenamento" nella barra in basso per registrare il primo.</div>
      </div>
    `;
    container.querySelector('#back-btn').addEventListener('click', () => navigate('#/impostazioni'));
    return;
  }

  const buckets = buildWeeklyBuckets(workouts, 8);

  container.innerHTML = `
    <div class="flex items-center gap-3">
      <button class="icon-btn" id="back-btn" aria-label="Indietro">${icon('back')}</button>
      <h1 class="section-title" style="margin:0">Allenamenti</h1>
    </div>
    <p class="section-subtitle">${workouts.length} allenamenti registrati.</p>

    <div class="card glass chart-card">
      <div class="flex items-center gap-2" style="margin-bottom:6px">
        ${icon('chartBar')}
        <span style="font-weight:700;font-size:0.9rem">Allenamenti per settimana</span>
      </div>
      ${chartHtml(buckets)}
    </div>

    <div id="history-list" class="mt-4">
      ${workouts.map(historyCardHtml).join('')}
    </div>
  `;

  container.querySelector('#back-btn').addEventListener('click', () => navigate('#/impostazioni'));

  container.querySelectorAll('[data-workout-id]').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-delete-workout]')) return;
      const w = store.getWorkout(card.dataset.workoutId);
      if (w) openWorkoutDetailModal(w);
    });
  });

  container.querySelectorAll('[data-delete-workout]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.deleteWorkout;
      confirmAction({
        title: 'Eliminare l\'allenamento?',
        message: 'Questo allenamento verrà rimosso dallo storico.',
        confirmLabel: 'Elimina',
        onConfirm: () => {
          store.deleteWorkout(id);
          showToast('Allenamento eliminato');
          render(container);
        },
      });
    });
  });
}

window.MyGym = window.MyGym || {};
window.MyGym.views = window.MyGym.views || {};
window.MyGym.views.workoutHistory = { render };

})();
