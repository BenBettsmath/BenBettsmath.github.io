// ---------- Storage ----------
const STORAGE_KEY = 'daycolors.v1';

const DEFAULT_LABELS = [
  { id: 'run', name: 'Run', color: '#38bdf8' },
  { id: 'gym', name: 'Gym', color: '#1d4ed8' },
  { id: 'store', name: 'Store', color: '#22c55e' },
  { id: 'misc', name: 'Miscellaneous', color: '#ef4444' },
  { id: 'habit1', name: 'Bad habit 1', color: '#f97316' },
  { id: 'habit2', name: 'Bad habit 2', color: '#eab308' },
  { id: 'sleep', name: 'Low sleep', color: '#a855f7' },
];

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* corrupt data, fall through to default */ }
  return { labels: DEFAULT_LABELS.map(l => ({ ...l })), days: {} };
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

let data = loadData();

// ---------- Date helpers ----------
function dateKey(y, m, d) {
  const mm = String(m + 1).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEKDAYS = ['S','M','T','W','T','F','S'];

const today = new Date();
const state = {
  year: today.getFullYear(),
  month: today.getMonth(), // 0-11
  selectedDateKey: null,
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---------- DOM refs ----------
const monthTitle = document.getElementById('monthTitle');
const calendarGrid = document.getElementById('calendarGrid');
const weekdayRow = document.getElementById('weekdayRow');

WEEKDAYS.forEach(w => {
  const el = document.createElement('div');
  el.textContent = w;
  weekdayRow.appendChild(el);
});

document.getElementById('prevBtn').addEventListener('click', () => {
  state.month--;
  if (state.month < 0) { state.month = 11; state.year--; }
  renderCalendar();
});

document.getElementById('nextBtn').addEventListener('click', () => {
  state.month++;
  if (state.month > 11) { state.month = 0; state.year++; }
  renderCalendar();
});

// ---------- Calendar render ----------
function renderCalendar() {
  monthTitle.textContent = `${MONTH_NAMES[state.month]} ${state.year}`;
  calendarGrid.innerHTML = '';

  const firstOfMonth = new Date(state.year, state.month, 1);
  const startWeekday = firstOfMonth.getDay(); // 0=Sun
  const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();
  const daysInPrevMonth = new Date(state.year, state.month, 0).getDate();

  const cells = [];

  // leading days from previous month
  for (let i = startWeekday - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, otherMonth: true, y: state.month === 0 ? state.year - 1 : state.year, m: state.month === 0 ? 11 : state.month - 1 });
  }
  // this month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, otherMonth: false, y: state.year, m: state.month });
  }
  // trailing days to fill last week
  while (cells.length % 7 !== 0) {
    const idx = cells.length - (startWeekday + daysInMonth);
    cells.push({ day: idx + 1, otherMonth: true, y: state.month === 11 ? state.year + 1 : state.year, m: state.month === 11 ? 0 : state.month + 1 });
  }

  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

  cells.forEach(cell => {
    const key = dateKey(cell.y, cell.m, cell.day);
    const cellEl = document.createElement('div');
    cellEl.className = 'day-cell' + (cell.otherMonth ? ' other-month' : '') + (key === todayKey ? ' today' : '');

    const numEl = document.createElement('div');
    numEl.className = 'day-num';
    numEl.textContent = cell.day;
    cellEl.appendChild(numEl);

    const dotsEl = document.createElement('div');
    dotsEl.className = 'day-dots';
    const activeLabelIds = data.days[key] || [];
    activeLabelIds.forEach(labelId => {
      const label = data.labels.find(l => l.id === labelId);
      if (!label) return;
      const dot = document.createElement('span');
      dot.className = 'day-dot';
      dot.style.background = label.color;
      dotsEl.appendChild(dot);
    });
    cellEl.appendChild(dotsEl);

    cellEl.addEventListener('click', () => openDayModal(key, cell));
    calendarGrid.appendChild(cellEl);
  });
}

// ---------- Day modal ----------
const dayModal = document.getElementById('dayModal');
const dayModalTitle = document.getElementById('dayModalTitle');
const dayLabelList = document.getElementById('dayLabelList');

function openDayModal(key, cell) {
  state.selectedDateKey = key;
  const d = new Date(cell.y, cell.m, cell.day);
  dayModalTitle.textContent = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  renderDayLabelList();
  dayModal.classList.remove('hidden');
}

function renderDayLabelList() {
  dayLabelList.innerHTML = '';
  const key = state.selectedDateKey;
  const active = new Set(data.days[key] || []);

  if (data.labels.length === 0) {
    dayLabelList.innerHTML = '<p class="hint">No labels yet. Tap the legend icon to add some.</p>';
    return;
  }

  data.labels.forEach(label => {
    const row = document.createElement('div');
    row.className = 'label-toggle' + (active.has(label.id) ? ' active' : '');
    row.style.setProperty('--lc', label.color);
    row.innerHTML = `
      <span class="label-swatch" style="background:${label.color}"></span>
      <span class="label-name">${escapeHtml(label.name)}</span>
      <span class="check-mark">&check;</span>
    `;
    row.addEventListener('click', () => {
      const set = new Set(data.days[key] || []);
      if (set.has(label.id)) set.delete(label.id);
      else set.add(label.id);
      data.days[key] = Array.from(set);
      if (data.days[key].length === 0) delete data.days[key];
      saveData();
      renderDayLabelList();
      renderCalendar();
    });
    dayLabelList.appendChild(row);
  });
}

document.getElementById('dayModalClose').addEventListener('click', () => {
  dayModal.classList.add('hidden');
});
dayModal.addEventListener('click', (e) => {
  if (e.target === dayModal) dayModal.classList.add('hidden');
});

// ---------- Legend modal ----------
const legendModal = document.getElementById('legendModal');
const legendList = document.getElementById('legendList');

document.getElementById('legendBtn').addEventListener('click', () => {
  renderLegendList();
  legendModal.classList.remove('hidden');
});
document.getElementById('legendModalClose').addEventListener('click', () => {
  legendModal.classList.add('hidden');
  renderCalendar();
});
legendModal.addEventListener('click', (e) => {
  if (e.target === legendModal) { legendModal.classList.add('hidden'); renderCalendar(); }
});

function renderLegendList() {
  legendList.innerHTML = '';
  data.labels.forEach(label => {
    const row = document.createElement('div');
    row.className = 'list-item';
    row.innerHTML = `
      <input type="color" value="${label.color}" class="legend-color">
      <span class="li-title">${escapeHtml(label.name)}</span>
      <button class="li-delete">&times;</button>
    `;
    row.querySelector('.legend-color').addEventListener('input', (e) => {
      label.color = e.target.value;
      saveData();
    });
    row.querySelector('.li-delete').addEventListener('click', () => {
      if (confirm(`Delete label "${label.name}"? It will be removed from all days.`)) {
        data.labels = data.labels.filter(l => l.id !== label.id);
        Object.keys(data.days).forEach(key => {
          data.days[key] = data.days[key].filter(id => id !== label.id);
          if (data.days[key].length === 0) delete data.days[key];
        });
        saveData();
        renderLegendList();
      }
    });
    legendList.appendChild(row);
  });
}

document.getElementById('addLabelBtn').addEventListener('click', () => {
  const nameInput = document.getElementById('newLabelName');
  const colorInput = document.getElementById('newLabelColor');
  const name = nameInput.value.trim();
  if (!name) { alert('Give the label a name.'); return; }
  data.labels.push({ id: uid(), name, color: colorInput.value });
  saveData();
  nameInput.value = '';
  renderLegendList();
});

// ---------- Helpers ----------
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Service worker (offline support) ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// ---------- Init ----------
renderCalendar();
