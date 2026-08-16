// ---------- Storage ----------
const STORAGE_KEY = 'flashcards.v2';
const ACTIVE_LANGUAGE = 'german';

const TYPE_META = {
  vocab:    { label: 'Vocab',                  chip: 'vocab' },
  meaning:  { label: 'Conjugation meaning',    chip: 'meaning' },
  sentence: { label: 'Valid sentence?',        chip: 'sentence' },
  conj:     { label: 'Correct conjugation?',   chip: 'conj' },
  rule:     { label: 'Rule satisfied?',        chip: 'rule' },
};
const JUDGMENT_TYPES = new Set(['sentence', 'conj', 'rule']);
// Judgment types whose German-language prompt needs an explicit English translation on reveal.
const TRANSLATION_TYPES = new Set(['sentence', 'conj']);

function emptyLevel() {
  return { cards: [], dailySets: {}, setHistory: {} };
}

function seedData() {
  return {
    contentVersion: 0,
    languages: {
      german: {
        levels: {
          beginner: emptyLevel(),
          medium: emptyLevel(),
          hard: emptyLevel(),
        },
      },
    },
  };
}

function mkCard(type, prompt, answer, translation, explanation) {
  return { id: uid(), type, prompt, answer, translation: translation || '', explanation: explanation || '', seen: 0, correct: 0 };
}

// Bundled content (content-german.js) is reconciled against each level's
// authoritative card list, keyed by type+prompt. Any existing card whose key
// matches the bundle but sits in the WRONG level (it was recategorized in a
// content update) is removed from there and re-added to its correct level.
// A card whose key doesn't match anything in the bundle at all is a genuine
// user-added custom card and is never touched. Bump CONTENT_VERSION whenever
// new bundled content or a re-leveling ships so existing installs pick it up.
const CONTENT_VERSION = 3;

function applyContentUpdates(d) {
  if ((d.contentVersion || 0) >= CONTENT_VERSION) return d;
  const lvl = d.languages.german.levels;
  const bundle = (typeof GERMAN_CONTENT !== 'undefined') ? GERMAN_CONTENT : {};

  const bundleKeyToLevel = {};
  ['beginner', 'medium', 'hard'].forEach(levelKey => {
    (bundle[levelKey] || []).forEach(c => { bundleKeyToLevel[c.type + '||' + c.prompt] = levelKey; });
  });

  ['beginner', 'medium', 'hard'].forEach(levelKey => {
    if (!lvl[levelKey]) lvl[levelKey] = emptyLevel();
    lvl[levelKey].cards = lvl[levelKey].cards.filter(c => {
      const key = c.type + '||' + c.prompt;
      const correctLevel = bundleKeyToLevel[key];
      return !correctLevel || correctLevel === levelKey;
    });
  });

  ['beginner', 'medium', 'hard'].forEach(levelKey => {
    const existingKeys = new Set(lvl[levelKey].cards.map(c => c.type + '||' + c.prompt));
    (bundle[levelKey] || []).forEach(c => {
      const key = c.type + '||' + c.prompt;
      if (existingKeys.has(key)) return;
      existingKeys.add(key);
      lvl[levelKey].cards.push(mkCard(c.type, c.prompt, c.answer, c.translation, c.explanation));
    });
  });

  d.contentVersion = CONTENT_VERSION;
  return d;
}

function loadData() {
  let d;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    d = raw ? JSON.parse(raw) : seedData();
  } catch (e) {
    d = seedData();
  }
  return applyContentUpdates(d);
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

let data = loadData();
saveData(); // persist any content merge from loadData() so it isn't recomputed every load

function currentLevel() {
  return data.languages[ACTIVE_LANGUAGE].levels[state.level];
}

const LEVEL_LABELS = { beginner: 'Beginner', medium: 'Medium', hard: 'Hard' };

// Every card across all three levels, each tagged with its levelKey — used
// by the Vocab/Grammar reference tabs, which show the whole set regardless
// of which level tab is currently selected.
function allLevelsCards() {
  const levels = data.languages[ACTIVE_LANGUAGE].levels;
  const out = [];
  ['beginner', 'medium', 'hard'].forEach(levelKey => {
    levels[levelKey].cards.forEach(c => out.push(Object.assign({ levelKey }, c)));
  });
  return out;
}

// ---------- Date helpers ----------
function dateKey(y, m, d) {
  const mm = String(m + 1).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEKDAYS = ['S','M','T','W','T','F','S'];
const today = new Date();
const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---------- App state ----------
const state = {
  level: 'beginner',
  view: 'calendar', // calendar | dayDetail | quiz | manage
  calYear: today.getFullYear(),
  calMonth: today.getMonth(),
  selectedDateKey: null,
  selectedSetIndex: null,
  quizQueue: [],
  quizIndex: 0,
  quizCorrect: 0,
  manageTab: 'add', // add | import | vocab | grammar
};

// ---------- DOM refs ----------
const appEl = document.getElementById('app');
const topTitle = document.getElementById('topTitle');
const backBtn = document.getElementById('backBtn');
const manageBtn = document.getElementById('manageBtn');

document.querySelectorAll('.level-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    state.level = tab.dataset.level;
    state.view = 'calendar';
    state.calYear = today.getFullYear();
    state.calMonth = today.getMonth();
    document.querySelectorAll('.level-tab').forEach(t => t.classList.toggle('active', t === tab));
    render();
  });
});

backBtn.addEventListener('click', () => {
  if (state.view === 'quiz') state.view = 'dayDetail';
  else if (state.view === 'dayDetail') state.view = 'calendar';
  else if (state.view === 'manage') state.view = 'calendar';
  render();
});

manageBtn.addEventListener('click', () => {
  state.view = 'manage';
  state.manageTab = 'add';
  render();
});

// ---------- Daily set generation ----------
// Builds the 3 sets one at a time. Each pick prefers whichever card(s) have
// been used LEAST so far today (a running frequency count, not just a
// used/unused flag) — this keeps overlap spread as evenly as possible and
// bounded to the mathematical minimum for the pool size, instead of letting
// a card get drawn 3 times while others are never reused. Never repeats a
// card within the same set unless the pool itself has fewer than 10 cards.
function generateDailySets(dateKey) {
  const lvl = currentLevel();
  const pool = lvl.cards;
  if (pool.length === 0) return null;

  const allIds = pool.map(c => c.id);
  const usageCount = new Map(allIds.map(id => [id, 0]));
  const sets = [[], [], []];

  for (let s = 0; s < 3; s++) {
    while (sets[s].length < 10) {
      const notInSet = allIds.filter(id => !sets[s].includes(id));
      const eligible = notInSet.length > 0 ? notInSet : allIds; // pool < 10: repeats within a set are unavoidable
      const minCount = Math.min(...eligible.map(id => usageCount.get(id)));
      const candidates = eligible.filter(id => usageCount.get(id) === minCount);
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      sets[s].push(pick);
      usageCount.set(pick, usageCount.get(pick) + 1);
    }
  }
  lvl.dailySets[dateKey] = sets;
  if (!lvl.setHistory) lvl.setHistory = {};
  lvl.setHistory[dateKey] = [[], [], []];
  saveData();
  return sets;
}

// Defensive accessor: backfills setHistory for data saved before this field existed.
function getSetHistoryArr(lvl, dateKey, setIndex) {
  if (!lvl.setHistory) lvl.setHistory = {};
  if (!lvl.setHistory[dateKey]) lvl.setHistory[dateKey] = [[], [], []];
  if (!lvl.setHistory[dateKey][setIndex]) lvl.setHistory[dateKey][setIndex] = [];
  return lvl.setHistory[dateKey][setIndex];
}

// ---------- Render dispatch ----------
function render() {
  const levelLabel = state.level.charAt(0).toUpperCase() + state.level.slice(1);

  if (state.view === 'calendar') {
    backBtn.classList.add('hidden');
    manageBtn.classList.remove('hidden');
    topTitle.textContent = levelLabel;
    renderCalendar();
  } else if (state.view === 'dayDetail') {
    backBtn.classList.remove('hidden');
    manageBtn.classList.add('hidden');
    topTitle.textContent = formatDateTitle(state.selectedDateKey);
    renderDayDetail();
  } else if (state.view === 'quiz') {
    backBtn.classList.remove('hidden');
    manageBtn.classList.add('hidden');
    topTitle.textContent = `Set ${state.selectedSetIndex + 1}`;
    renderQuiz();
  } else if (state.view === 'manage') {
    backBtn.classList.remove('hidden');
    manageBtn.classList.add('hidden');
    topTitle.textContent = `Manage ${levelLabel} Cards`;
    renderManage();
  }
}

function formatDateTitle(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// ---------- Calendar view ----------
function renderCalendar() {
  const lvl = currentLevel();

  appEl.innerHTML = `
    <div class="month-nav">
      <button id="prevMonthBtn" class="icon-btn">&larr;</button>
      <h2 id="monthLabel"></h2>
      <button id="nextMonthBtn" class="icon-btn">&rarr;</button>
    </div>
    <div id="weekdayRow" class="weekday-row"></div>
    <div id="calendarGrid" class="calendar-grid"></div>
    <p class="hint">Tap a day to lock in and study its 3 sets of 10. Green = already opened. ${lvl.cards.length} cards in this level's pool.</p>
  `;

  document.getElementById('monthLabel').textContent = `${MONTH_NAMES[state.calMonth]} ${state.calYear}`;

  const weekdayRow = document.getElementById('weekdayRow');
  WEEKDAYS.forEach(w => {
    const el = document.createElement('div');
    el.textContent = w;
    weekdayRow.appendChild(el);
  });

  document.getElementById('prevMonthBtn').addEventListener('click', () => {
    state.calMonth--;
    if (state.calMonth < 0) { state.calMonth = 11; state.calYear--; }
    renderCalendar();
  });
  document.getElementById('nextMonthBtn').addEventListener('click', () => {
    state.calMonth++;
    if (state.calMonth > 11) { state.calMonth = 0; state.calYear++; }
    renderCalendar();
  });

  const grid = document.getElementById('calendarGrid');
  const firstOfMonth = new Date(state.calYear, state.calMonth, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(state.calYear, state.calMonth + 1, 0).getDate();

  for (let i = 0; i < startWeekday; i++) {
    const filler = document.createElement('div');
    filler.className = 'day-cell other-month';
    grid.appendChild(filler);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const key = dateKey(state.calYear, state.calMonth, d);
    const isFuture = key > todayKey;
    const isOpened = !!lvl.dailySets[key];
    const btn = document.createElement('button');
    btn.className = 'day-cell' + (key === todayKey ? ' today' : '') + (isOpened ? ' opened' : '') + (isFuture ? ' future' : '');
    btn.textContent = d;
    if (!isFuture) {
      btn.addEventListener('click', () => openDate(key));
    } else {
      btn.disabled = true;
    }
    grid.appendChild(btn);
  }
}

function openDate(key) {
  const lvl = currentLevel();
  if (!lvl.dailySets[key]) {
    if (lvl.cards.length === 0) {
      alert('This level has no cards yet. Tap the pencil icon to add some first.');
      return;
    }
    generateDailySets(key);
  }
  state.selectedDateKey = key;
  state.view = 'dayDetail';
  render();
}

// ---------- Day detail view ----------
function renderDayDetail() {
  const lvl = currentLevel();
  const sets = lvl.dailySets[state.selectedDateKey] || [];

  appEl.innerHTML = '<div class="set-list" id="setList"></div>';
  const listEl = document.getElementById('setList');

  sets.forEach((setIds, i) => {
    const hist = getSetHistoryArr(lvl, state.selectedDateKey, i);
    const lastScore = hist.length ? hist[hist.length - 1] : null;
    const last3 = hist.slice(-3);
    const avgLast3 = last3.length ? (last3.reduce((a, b) => a + b, 0) / last3.length) : null;
    const masteryCount = hist.filter(s => s >= 9).length;

    const item = document.createElement('div');
    item.className = 'set-card';
    item.innerHTML = `
      <div>
        <div class="set-title">Set ${i + 1} ${masteryCount > 0 ? `<span class="mastery-badge" title="Times scored 9+/10">&#9733;${masteryCount}</span>` : ''}</div>
        <div class="set-sub">${setIds.length} cards${lastScore !== null ? ` &middot; last ${lastScore}/10` : ' &middot; not started'}${avgLast3 !== null ? ` &middot; avg(3) ${avgLast3.toFixed(1)}/10` : ''}</div>
      </div>
      <button class="primary-btn">Study</button>
    `;
    item.querySelector('.primary-btn').addEventListener('click', () => startQuiz(i));
    listEl.appendChild(item);
  });
}

function startQuiz(setIndex) {
  const lvl = currentLevel();
  const setIds = lvl.dailySets[state.selectedDateKey][setIndex];
  state.selectedSetIndex = setIndex;
  state.quizQueue = shuffle(setIds.slice());
  state.quizIndex = 0;
  state.quizCorrect = 0;
  state.quizRecorded = false;
  state.view = 'quiz';
  render();
}

// ---------- Quiz view ----------
function renderQuiz() {
  const lvl = currentLevel();
  const queue = state.quizQueue;

  if (state.quizIndex >= queue.length) {
    if (!state.quizRecorded) {
      const hist = getSetHistoryArr(lvl, state.selectedDateKey, state.selectedSetIndex);
      hist.push(state.quizCorrect);
      state.quizRecorded = true;
      saveData();
    }
    appEl.innerHTML = `
      <div class="empty">
        <p>Set complete: ${state.quizCorrect}/${queue.length}</p>
        <button id="quizDoneBtn" class="primary-btn">Back to Day</button>
      </div>
    `;
    document.getElementById('quizDoneBtn').addEventListener('click', () => {
      state.view = 'dayDetail';
      render();
    });
    return;
  }

  const cardId = queue[state.quizIndex];
  const card = lvl.cards.find(c => c.id === cardId);

  if (!card) { state.quizIndex++; render(); return; }

  const meta = TYPE_META[card.type];
  const isJudgment = JUDGMENT_TYPES.has(card.type);
  const backText = isJudgment ? (card.answer ? 'Yes' : 'No') : card.answer;
  const backTranslation = TRANSLATION_TYPES.has(card.type) ? card.translation : '';

  appEl.innerHTML = `
    <div class="study-wrap">
      <div class="study-progress">${state.quizIndex + 1} / ${queue.length}</div>
      <div id="flashcard" class="flashcard">
        <div class="flashcard-inner">
          <div class="flashcard-face front">
            <span class="type-chip ${meta.chip}">${meta.label}</span>
            <span class="face-text">${escapeHtml(card.prompt)}</span>
          </div>
          <div class="flashcard-face back">
            <span class="face-text">${escapeHtml(backText)}</span>
            ${backTranslation ? `<span class="face-translation">${escapeHtml(backTranslation)}</span>` : ''}
            ${card.explanation ? `<span class="face-explain">${escapeHtml(card.explanation)}</span>` : ''}
          </div>
        </div>
      </div>
      <p class="hint">Tap card to flip</p>
      <div id="studyButtons" class="study-buttons hidden">
        <button id="knowNoBtn" class="grade-btn no">Missed it</button>
        <button id="knowYesBtn" class="grade-btn yes">Got it</button>
      </div>
    </div>
  `;

  const flashcardEl = document.getElementById('flashcard');
  const buttonsEl = document.getElementById('studyButtons');
  let flipped = false;

  flashcardEl.addEventListener('click', () => {
    flipped = !flipped;
    flashcardEl.classList.toggle('flipped', flipped);
    buttonsEl.classList.toggle('hidden', !flipped);
  });

  function grade(gotIt) {
    card.seen++;
    if (gotIt) { card.correct++; state.quizCorrect++; }
    saveData();
    state.quizIndex++;
    render();
  }

  document.getElementById('knowYesBtn').addEventListener('click', () => grade(true));
  document.getElementById('knowNoBtn').addEventListener('click', () => grade(false));
}

// ---------- Manage view ----------
function renderManage() {
  const lvl = currentLevel();
  const all = allLevelsCards();

  const vocabCount = all.filter(c => !JUDGMENT_TYPES.has(c.type)).length;
  const grammarCount = all.filter(c => JUDGMENT_TYPES.has(c.type)).length;

  appEl.innerHTML = `
    <div class="tabs">
      <button id="tabAdd" class="tab">Add Card</button>
      <button id="tabImport" class="tab">Bulk Import</button>
      <button id="tabVocab" class="tab">Vocab (${vocabCount})</button>
      <button id="tabGrammar" class="tab">Grammar (${grammarCount})</button>
    </div>
    <div id="addPane" class="pane"></div>
    <div id="importPane" class="pane hidden"></div>
    <div id="vocabPane" class="hidden"></div>
    <div id="grammarPane" class="hidden"></div>
  `;

  const tabAdd = document.getElementById('tabAdd');
  const tabImport = document.getElementById('tabImport');
  const tabVocab = document.getElementById('tabVocab');
  const tabGrammar = document.getElementById('tabGrammar');
  const addPane = document.getElementById('addPane');
  const importPane = document.getElementById('importPane');
  const vocabPane = document.getElementById('vocabPane');
  const grammarPane = document.getElementById('grammarPane');

  function setTab(tab) {
    state.manageTab = tab;
    tabAdd.classList.toggle('active', tab === 'add');
    tabImport.classList.toggle('active', tab === 'import');
    tabVocab.classList.toggle('active', tab === 'vocab');
    tabGrammar.classList.toggle('active', tab === 'grammar');
    addPane.classList.toggle('hidden', tab !== 'add');
    importPane.classList.toggle('hidden', tab !== 'import');
    vocabPane.classList.toggle('hidden', tab !== 'vocab');
    grammarPane.classList.toggle('hidden', tab !== 'grammar');
  }
  tabAdd.addEventListener('click', () => setTab('add'));
  tabImport.addEventListener('click', () => setTab('import'));
  tabVocab.addEventListener('click', () => setTab('vocab'));
  tabGrammar.addEventListener('click', () => setTab('grammar'));

  renderAddPane(addPane);
  renderImportPane(importPane);
  renderVocabPane(vocabPane);
  renderGrammarPane(grammarPane);

  setTab(state.manageTab);
}

function renderAddPane(addPane) {
  addPane.innerHTML = `
    <select id="newType">
      ${Object.entries(TYPE_META).map(([key, meta]) => `<option value="${key}">${meta.label}</option>`).join('')}
    </select>
    <input id="newPrompt" type="text" placeholder="Prompt (e.g. das Haus, or Ich habe ein Buch.)">
    <input id="newAnswerText" type="text" placeholder="Translation">
    <select id="newAnswerBool" class="hidden">
      <option value="true">Yes / Correct</option>
      <option value="false">No / Incorrect</option>
    </select>
    <input id="newTranslation" type="text" placeholder="Translation (always shown on reveal)" class="hidden">
    <input id="newExplanation" type="text" placeholder="Explanation (optional)" class="hidden">
    <button id="addCardBtn" class="primary-btn">Add Card</button>
  `;

  const typeSelect = document.getElementById('newType');
  const answerText = document.getElementById('newAnswerText');
  const answerBool = document.getElementById('newAnswerBool');
  const translationField = document.getElementById('newTranslation');
  const explanation = document.getElementById('newExplanation');

  function syncFields() {
    const type = typeSelect.value;
    const isJudgment = JUDGMENT_TYPES.has(type);
    const needsTranslation = TRANSLATION_TYPES.has(type);
    answerText.classList.toggle('hidden', isJudgment);
    answerBool.classList.toggle('hidden', !isJudgment);
    translationField.classList.toggle('hidden', !needsTranslation);
    explanation.classList.toggle('hidden', !isJudgment);
  }
  typeSelect.addEventListener('change', syncFields);
  syncFields();

  document.getElementById('addCardBtn').addEventListener('click', () => {
    const lvl = currentLevel();
    const type = typeSelect.value;
    const prompt = document.getElementById('newPrompt').value.trim();
    if (!prompt) { alert('Enter a prompt.'); return; }
    let card;
    if (JUDGMENT_TYPES.has(type)) {
      let translation = '';
      if (TRANSLATION_TYPES.has(type)) {
        translation = translationField.value.trim();
        if (!translation) { alert('Enter a translation — it\'s always shown when the card is revealed.'); return; }
      }
      card = mkCard(type, prompt, answerBool.value === 'true', translation, explanation.value.trim());
    } else {
      const answer = answerText.value.trim();
      if (!answer) { alert('Enter a translation.'); return; }
      card = mkCard(type, prompt, answer);
    }
    lvl.cards.push(card);
    saveData();
    document.getElementById('newPrompt').value = '';
    answerText.value = '';
    translationField.value = '';
    explanation.value = '';
    render();
  });
}

function renderImportPane(importPane) {
  importPane.innerHTML = `
    <p class="hint">
      One card per line, columns separated by <code>|</code>:<br>
      <code>VOCAB | prompt | translation</code><br>
      <code>MEANING | prompt | translation</code><br>
      <code>SENTENCE | prompt | true/false | translation | explanation (optional)</code><br>
      <code>CONJ | prompt | true/false | translation | explanation (optional)</code><br>
      <code>RULE | prompt | true/false | explanation (optional)</code><br>
      SENTENCE/CONJ always need a translation — it's shown every time the card is revealed.
    </p>
    <textarea id="importText" rows="8" placeholder="VOCAB | das Haus | the house&#10;SENTENCE | Ich habe ein Buch. | true | I have a book. | Correct dative/accusative usage."></textarea>
    <button id="importBtn" class="primary-btn">Import</button>
  `;

  document.getElementById('importBtn').addEventListener('click', () => {
    const lvl = currentLevel();
    const text = document.getElementById('importText').value;
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    let added = 0, skipped = 0;

    lines.forEach(line => {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length < 3) { skipped++; return; }
      const typeKey = parts[0].toLowerCase();
      const typeMap = { vocab: 'vocab', meaning: 'meaning', sentence: 'sentence', conj: 'conj', rule: 'rule' };
      const type = typeMap[typeKey];
      if (!type) { skipped++; return; }
      const prompt = parts[1];
      if (!prompt) { skipped++; return; }

      if (JUDGMENT_TYPES.has(type)) {
        const boolStr = (parts[2] || '').toLowerCase();
        const answer = ['true', 'yes', 'y', '1'].includes(boolStr) ? true : ['false', 'no', 'n', '0'].includes(boolStr) ? false : null;
        if (answer === null) { skipped++; return; }
        if (TRANSLATION_TYPES.has(type)) {
          const translation = (parts[3] || '').trim();
          if (!translation) { skipped++; return; }
          const explanation = parts[4] || '';
          lvl.cards.push(mkCard(type, prompt, answer, translation, explanation));
        } else {
          const explanation = parts[3] || '';
          lvl.cards.push(mkCard(type, prompt, answer, '', explanation));
        }
      } else {
        const answer = parts[2];
        if (!answer) { skipped++; return; }
        lvl.cards.push(mkCard(type, prompt, answer));
      }
      added++;
    });

    saveData();
    render();
    alert(`Imported ${added} card(s).${skipped ? ` Skipped ${skipped} invalid line(s).` : ''}`);
  });
}

function deleteCardEverywhere(card) {
  const levels = data.languages[ACTIVE_LANGUAGE].levels;
  const lvl = levels[card.levelKey];
  lvl.cards = lvl.cards.filter(c => c.id !== card.id);
  saveData();
  render();
}

// Concise, alphabetically-sorted reference list of the WHOLE vocab set across
// all three levels (not just the currently selected level tab) — for
// reading/lookup, not quizzing.
function renderVocabPane(pane) {
  const cards = allLevelsCards().filter(c => !JUDGMENT_TYPES.has(c.type))
    .sort((a, b) => a.prompt.localeCompare(b.prompt, 'de'));

  pane.innerHTML = '<div class="ref-list" id="vocabList"></div>';
  const list = document.getElementById('vocabList');
  if (cards.length === 0) { list.innerHTML = '<p class="empty">No vocab cards yet.</p>'; return; }

  cards.forEach(card => {
    const row = document.createElement('div');
    row.className = 'ref-row';
    row.innerHTML = `
      <div class="ref-row-main">
        <span class="ref-prompt">${escapeHtml(card.prompt)}</span>
        <span class="ref-answer">&rarr; ${escapeHtml(card.answer)}</span>
        ${card.type === 'meaning' ? '<span class="ref-tag">conj.</span>' : ''}
        <span class="ref-tag level-${card.levelKey}">${LEVEL_LABELS[card.levelKey]}</span>
      </div>
      <button class="ref-delete">&times;</button>
    `;
    row.querySelector('.ref-delete').addEventListener('click', () => deleteCardEverywhere(card));
    list.appendChild(row);
  });
}

// Concise reference list of the WHOLE grammar set across all three levels,
// grouped by subtype — Sentences / Conjugations / Rules, each alphabetical,
// always showing translation (when applicable) + explanation.
function renderGrammarPane(pane) {
  const groups = [
    { key: 'sentence', label: 'Sentences' },
    { key: 'conj', label: 'Conjugations' },
    { key: 'rule', label: 'Rules' },
  ];
  const allGrammar = allLevelsCards().filter(c => JUDGMENT_TYPES.has(c.type));

  pane.innerHTML = '<div class="ref-list" id="grammarList"></div>';
  const list = document.getElementById('grammarList');
  if (allGrammar.length === 0) { list.innerHTML = '<p class="empty">No grammar cards yet.</p>'; return; }

  groups.forEach(({ key, label }) => {
    const cards = allGrammar.filter(c => c.type === key).sort((a, b) => a.prompt.localeCompare(b.prompt, 'de'));
    if (cards.length === 0) return;

    const header = document.createElement('div');
    header.className = 'ref-section-header';
    header.textContent = `${label} (${cards.length})`;
    list.appendChild(header);

    cards.forEach(card => {
      const row = document.createElement('div');
      row.className = 'ref-row';
      row.innerHTML = `
        <div class="ref-row-main">
          <div><span class="ref-prompt">${escapeHtml(card.prompt)}</span> <span class="ref-answer">&mdash; ${card.answer ? 'Yes' : 'No'}</span> <span class="ref-tag level-${card.levelKey}">${LEVEL_LABELS[card.levelKey]}</span></div>
          ${card.translation ? `<div class="ref-translation">${escapeHtml(card.translation)}</div>` : ''}
          ${card.explanation ? `<div class="ref-explain">${escapeHtml(card.explanation)}</div>` : ''}
        </div>
        <button class="ref-delete">&times;</button>
      `;
      row.querySelector('.ref-delete').addEventListener('click', () => deleteCardEverywhere(card));
      list.appendChild(row);
    });
  });
}

// ---------- Helpers ----------
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

// ---------- Service worker (offline support) ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// ---------- Init ----------
render();
