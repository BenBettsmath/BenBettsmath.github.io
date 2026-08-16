import { Chess } from './chess.js';
import { computeAttacks, attackedPieces } from './attack.js';
import { getBotMove, getHints } from './bot.js';

const STORAGE_KEY = 'chess.v1';
const FILES = 'abcdefgh';
// Both colors use the SOLID glyph variants (Unicode's "black chess piece"
// set) — the hollow "white chess piece" glyphs are nearly empty outlines, so
// coloring them light just leaves a dark stroke with little fillable area.
// Differentiating white vs black by CSS color on the same solid shape gives
// an actually-filled look for both.
const PIECE_UNICODE = {
  w: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
};

function algFromRC(r, c) { return FILES[c] + (8 - r); }

function defaultUI() {
  return {
    screen: 'setup', // setup | game
    mode: 'bot', // local | bot
    botDifficulty: 'medium',
    humanColor: 'w', // w | b | random (setup preference)
    activeHumanColor: 'w', // resolved color for the current game
    boardFlipped: false,
    showAttacks: true,
    moveHistorySAN: [],
  };
}

function loadUI() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return Object.assign(defaultUI(), JSON.parse(raw));
  } catch (e) { /* corrupt data, fall through */ }
  return defaultUI();
}

let ui = loadUI();
let chess = Chess();
if (ui.moveHistorySAN && ui.moveHistorySAN.length) {
  for (const san of ui.moveHistorySAN) {
    if (!chess.move(san)) { ui = defaultUI(); chess = Chess(); break; }
  }
}

const runtime = { selectedSquare: null, legalTargets: [], hints: [], pendingPromotion: null, thinking: false };

function persist() {
  ui.moveHistorySAN = chess.history();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ui));
}

// ---------- DOM refs ----------
const appEl = document.getElementById('app');
const topTitle = document.getElementById('topTitle');
const backBtn = document.getElementById('backBtn');
const flipBtn = document.getElementById('flipBtn');

backBtn.addEventListener('click', () => { ui.screen = 'setup'; persist(); render(); });
flipBtn.addEventListener('click', () => { ui.boardFlipped = !ui.boardFlipped; persist(); render(); });

function modeLabel() {
  if (ui.mode === 'local') return 'Local 2-Player';
  return `vs Bot (${ui.botDifficulty[0].toUpperCase() + ui.botDifficulty.slice(1)})`;
}

function render() {
  if (ui.screen === 'setup') {
    backBtn.classList.add('hidden');
    flipBtn.classList.add('hidden');
    topTitle.textContent = 'Chess';
    renderSetup();
  } else {
    backBtn.classList.remove('hidden');
    flipBtn.classList.remove('hidden');
    topTitle.textContent = modeLabel();
    renderGame();
  }
}

// ---------- Setup screen ----------
function renderSetup() {
  appEl.innerHTML = `
    <div class="setup-section">
      <div class="setup-label">Mode</div>
      <div class="segmented" id="modeSeg">
        <button data-val="local" class="${ui.mode === 'local' ? 'active' : ''}">Local 2-Player</button>
        <button data-val="bot" class="${ui.mode === 'bot' ? 'active' : ''}">vs Bot</button>
      </div>
    </div>
    <div class="setup-section ${ui.mode === 'bot' ? '' : 'hidden'}" id="botOptions">
      <div class="setup-label">Difficulty</div>
      <div class="segmented" id="diffSeg">
        <button data-val="easy" class="${ui.botDifficulty === 'easy' ? 'active' : ''}">Easy</button>
        <button data-val="medium" class="${ui.botDifficulty === 'medium' ? 'active' : ''}">Medium</button>
        <button data-val="hard" class="${ui.botDifficulty === 'hard' ? 'active' : ''}">Hard</button>
      </div>
      <div class="setup-label" style="margin-top:16px">Play as</div>
      <div class="segmented" id="colorSeg">
        <button data-val="w" class="${ui.humanColor === 'w' ? 'active' : ''}">White</button>
        <button data-val="b" class="${ui.humanColor === 'b' ? 'active' : ''}">Black</button>
        <button data-val="random" class="${ui.humanColor === 'random' ? 'active' : ''}">Random</button>
      </div>
    </div>
    <button id="startBtn" class="primary-btn">Start Game</button>
  `;

  document.getElementById('modeSeg').querySelectorAll('button').forEach(b =>
    b.addEventListener('click', () => { ui.mode = b.dataset.val; persist(); render(); }));
  document.getElementById('diffSeg').querySelectorAll('button').forEach(b =>
    b.addEventListener('click', () => { ui.botDifficulty = b.dataset.val; persist(); render(); }));
  document.getElementById('colorSeg').querySelectorAll('button').forEach(b =>
    b.addEventListener('click', () => { ui.humanColor = b.dataset.val; persist(); render(); }));
  document.getElementById('startBtn').addEventListener('click', startGame);
}

function startGame() {
  chess = Chess();
  runtime.selectedSquare = null;
  runtime.legalTargets = [];
  runtime.hints = [];
  runtime.pendingPromotion = null;
  runtime.thinking = false;

  if (ui.mode === 'bot') {
    ui.activeHumanColor = ui.humanColor === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : ui.humanColor;
    ui.boardFlipped = ui.activeHumanColor === 'b';
  } else {
    ui.activeHumanColor = 'w';
    ui.boardFlipped = false;
  }
  ui.screen = 'game';
  persist();
  render();
  maybeTriggerBotMove();
}

// ---------- Game screen ----------
function statusInfo() {
  if (runtime.thinking) return { text: 'Bot is thinking…', cls: 'thinking' };
  if (chess.in_checkmate()) {
    const winner = chess.turn() === 'w' ? 'Black' : 'White';
    return { text: `Checkmate — ${winner} wins`, cls: 'over' };
  }
  if (chess.in_stalemate()) return { text: 'Stalemate — draw', cls: 'over' };
  if (chess.in_draw()) return { text: 'Draw', cls: 'over' };
  const mover = chess.turn() === 'w' ? 'White' : 'Black';
  if (chess.in_check()) return { text: `${mover} to move — Check!`, cls: 'check' };
  return { text: `${mover} to move`, cls: '' };
}

function hintColor(rank, total) {
  const tFrac = total <= 1 ? 0 : rank / (total - 1);
  const from = [74, 222, 128];
  const to = [250, 204, 21];
  const c = from.map((v, i) => Math.round(v + (to[i] - v) * tFrac));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function lastMoveSquares() {
  const hist = chess.history({ verbose: true });
  if (!hist.length) return null;
  const last = hist[hist.length - 1];
  return { from: last.from, to: last.to };
}

// Counts every square exactly once: contested (both attack) takes priority
// over single-side control, so counts always sum to 64.
function controlStats(wAtk, bAtk) {
  let w = 0, b = 0, c = 0, n = 0;
  for (let r = 0; r < 8; r++) {
    for (let col = 0; col < 8; col++) {
      const sqr = algFromRC(r, col);
      const hw = wAtk.has(sqr), hb = bAtk.has(sqr);
      if (hw && hb) c++; else if (hw) w++; else if (hb) b++; else n++;
    }
  }
  return { w, b, c, n };
}

function renderGame() {
  const grid = chess.board();
  const wAtk = ui.showAttacks ? computeAttacks(grid, 'w') : new Set();
  const bAtk = ui.showAttacks ? computeAttacks(grid, 'b') : new Set();
  const hanging = ui.showAttacks ? attackedPieces(grid, wAtk, bAtk) : {};
  const lastMove = lastMoveSquares();
  const status = statusInfo();
  const gameOver = chess.game_over();

  appEl.innerHTML = `
    <div class="status-bar ${status.cls}">${status.text}</div>
    <div class="captured-row" id="capturedRow"></div>
    <div class="board-wrap"><div class="board-grid" id="boardGrid"></div></div>
    <div class="board-controls">
      <button id="hintBtn" ${runtime.thinking || gameOver ? 'disabled' : ''}>Hint</button>
      <button id="undoBtn" ${chess.history().length === 0 || runtime.thinking ? 'disabled' : ''}>Undo</button>
      <button id="atkToggleBtn" class="${ui.showAttacks ? 'toggle-on' : ''}">Attacks: ${ui.showAttacks ? 'On' : 'Off'}</button>
    </div>
    <div id="controlSummary"></div>
    <div class="legend-row ${ui.showAttacks ? '' : 'hidden'}">
      <span class="legend-item"><span class="legend-swatch sq-atk-w"></span>White attacks</span>
      <span class="legend-item"><span class="legend-swatch sq-atk-b"></span>Black attacks</span>
      <span class="legend-item"><span class="legend-swatch sq-atk-contested"></span>Contested</span>
      <span class="legend-item"><span class="legend-swatch sq-last-move"></span>Last move</span>
    </div>
    <div id="hintList" class="hint-list"></div>
  `;

  renderCaptured();
  renderBoard(grid, wAtk, bAtk, hanging, lastMove);
  renderControlSummary(wAtk, bAtk);
  renderHintList();

  document.getElementById('hintBtn').addEventListener('click', onHintPressed);
  document.getElementById('undoBtn').addEventListener('click', onUndo);
  document.getElementById('atkToggleBtn').addEventListener('click', () => { ui.showAttacks = !ui.showAttacks; persist(); render(); });

  if (runtime.pendingPromotion) renderPromotionPicker();
}

function renderControlSummary(wAtk, bAtk) {
  const el = document.getElementById('controlSummary');
  if (!ui.showAttacks) { el.innerHTML = ''; return; }
  const { w, b, c } = controlStats(wAtk, bAtk);
  el.innerHTML = `
    <div class="control-label">Board control</div>
    <div class="control-bar">
      <div class="control-seg w" style="flex:${w}"></div>
      <div class="control-seg c" style="flex:${c}"></div>
      <div class="control-seg b" style="flex:${b}"></div>
    </div>
    <div class="control-counts">
      <span class="cw">White ${w}</span>
      <span class="cc">Contested ${c}</span>
      <span class="cb">Black ${b}</span>
    </div>
  `;
}

function renderCaptured() {
  const hist = chess.history({ verbose: true });
  const byWhite = [], byBlack = [];
  for (const m of hist) {
    if (m.captured) {
      if (m.color === 'w') byWhite.push(m.captured); else byBlack.push(m.captured);
    }
  }
  const fmt = (arr, color) => arr.map(t => PIECE_UNICODE[color][t]).join(' ');
  const row = document.getElementById('capturedRow');
  row.innerHTML = `<div style="flex:1">${fmt(byWhite, 'b')}</div><div style="flex:1;text-align:right">${fmt(byBlack, 'w')}</div>`;
}

function squareOrder() {
  const order = [];
  if (!ui.boardFlipped) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) order.push([r, c]);
  } else {
    for (let r = 7; r >= 0; r--) for (let c = 7; c >= 0; c--) order.push([r, c]);
  }
  return order;
}

function renderBoard(grid, wAtk, bAtk, hanging, lastMove) {
  const boardGrid = document.getElementById('boardGrid');
  boardGrid.innerHTML = '';

  // Hints are sorted best-first; if two suggested moves share a destination
  // square (different piece, same target), the best-ranked one wins the
  // square's badge/color rather than being silently overwritten.
  const hintColorMap = {};
  const hintRankMap = {};
  runtime.hints.forEach((h, i) => {
    if (h.move.to in hintRankMap) return;
    hintColorMap[h.move.to] = hintColor(i, runtime.hints.length);
    hintRankMap[h.move.to] = i + 1;
  });

  const targetSquares = new Set(runtime.legalTargets.map(m => m.to));
  const captureSquares = new Set(runtime.legalTargets.filter(m => m.captured).map(m => m.to));

  for (const [r, c] of squareOrder()) {
    const cell = grid[r][c];
    const square = cell ? cell.square : algFromRC(r, c);
    const light = (r + c) % 2 === 0;
    const div = document.createElement('div');
    div.className = 'square ' + (light ? 'light' : 'dark');
    div.dataset.square = square;

    if (lastMove && (square === lastMove.from || square === lastMove.to)) {
      const l = document.createElement('div'); l.className = 'sq-layer sq-last-move'; div.appendChild(l);
    }
    const hw = wAtk.has(square), hb = bAtk.has(square);
    if (hw && hb) {
      const l = document.createElement('div'); l.className = 'sq-layer sq-atk-contested'; div.appendChild(l);
    } else if (hw) {
      const l = document.createElement('div'); l.className = 'sq-layer sq-atk-w'; div.appendChild(l);
    } else if (hb) {
      const l = document.createElement('div'); l.className = 'sq-layer sq-atk-b'; div.appendChild(l);
    }
    if (runtime.selectedSquare === square) div.classList.add('sq-selected');
    if (targetSquares.has(square)) div.classList.add(captureSquares.has(square) ? 'sq-capture-ring' : 'sq-move-dot');
    if (hintColorMap[square]) {
      div.classList.add('sq-hint-ring');
      div.style.setProperty('--hint-color', hintColorMap[square]);
      const badge = document.createElement('div');
      badge.className = 'sq-hint-badge';
      badge.style.setProperty('--hint-color', hintColorMap[square]);
      badge.textContent = hintRankMap[square];
      div.appendChild(badge);
    }

    if (cell) {
      if (hanging[square]) {
        const ring = document.createElement('span');
        ring.className = 'piece-under-attack';
        ring.style.setProperty('--ring-color', hanging[square].attackerColor === 'w' ? 'rgba(250,204,21,0.9)' : 'rgba(239,68,68,0.9)');
        div.appendChild(ring);
      }
      const pieceSpan = document.createElement('span');
      pieceSpan.className = 'piece ' + (cell.color === 'w' ? 'white' : 'black');
      pieceSpan.textContent = PIECE_UNICODE[cell.color][cell.type];
      div.appendChild(pieceSpan);
    }

    div.addEventListener('click', () => onSquareTap(square));
    boardGrid.appendChild(div);
  }
}

function renderHintList() {
  const list = document.getElementById('hintList');
  if (!runtime.hints.length) { list.innerHTML = ''; return; }
  list.innerHTML = runtime.hints.map((h, i) => `
    <div class="hint-item">
      <span class="dot" style="background:${hintColor(i, runtime.hints.length)}"></span>
      <span>${i + 1}. ${escapeHtml(h.move.san)}</span>
    </div>
  `).join('');
}

function renderPromotionPicker() {
  const div = document.createElement('div');
  div.className = 'sheet-backdrop';
  const color = chess.turn();
  div.innerHTML = `
    <div class="promo-picker">
      <p>Promote to:</p>
      <div class="promo-options">
        ${['q', 'r', 'b', 'n'].map(p => `<button data-p="${p}">${PIECE_UNICODE[color][p]}</button>`).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(div);
  div.querySelectorAll('button').forEach(b =>
    b.addEventListener('click', () => { document.body.removeChild(div); choosePromotion(b.dataset.p); }));
}

// ---------- Interaction ----------
function isHumanTurn() {
  if (ui.mode === 'local') return true;
  return chess.turn() === ui.activeHumanColor;
}

function pieceAtSquare(square) {
  const grid = chess.board();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (grid[r][c] && grid[r][c].square === square) return grid[r][c];
  return null;
}

function onSquareTap(square) {
  if (runtime.thinking || runtime.pendingPromotion || chess.game_over() || !isHumanTurn()) return;

  if (runtime.selectedSquare) {
    const moves = runtime.legalTargets.filter(m => m.to === square);
    if (moves.length > 0) {
      if (moves.length > 1) {
        runtime.pendingPromotion = { from: runtime.selectedSquare, to: square };
        runtime.selectedSquare = null;
        runtime.legalTargets = [];
        render();
        return;
      }
      performMove(moves[0]);
      return;
    }
    const cell = pieceAtSquare(square);
    if (cell && cell.color === chess.turn()) { selectSquare(square); return; }
    runtime.selectedSquare = null;
    runtime.legalTargets = [];
    render();
    return;
  }
  const cell = pieceAtSquare(square);
  if (cell && cell.color === chess.turn()) selectSquare(square);
}

function selectSquare(square) {
  runtime.selectedSquare = square;
  runtime.legalTargets = chess.moves({ square, verbose: true });
  runtime.hints = [];
  render();
}

function performMove(move) {
  chess.move(move);
  runtime.selectedSquare = null;
  runtime.legalTargets = [];
  runtime.hints = [];
  persist();
  render();
  maybeTriggerBotMove();
}

function choosePromotion(piece) {
  const { from, to } = runtime.pendingPromotion;
  const options = chess.moves({ square: from, verbose: true }).filter(m => m.to === to && m.promotion === piece);
  runtime.pendingPromotion = null;
  if (options[0]) performMove(options[0]); else render();
}

function onHintPressed() {
  if (runtime.thinking || runtime.pendingPromotion || chess.game_over()) return;
  runtime.selectedSquare = null;
  runtime.legalTargets = [];
  runtime.hints = getHints(chess, 4);
  render();
}

function onUndo() {
  if (runtime.thinking || chess.history().length === 0) return;
  chess.undo();
  if (ui.mode === 'bot' && chess.history().length > 0 && chess.turn() !== ui.activeHumanColor) {
    chess.undo();
  }
  runtime.selectedSquare = null;
  runtime.legalTargets = [];
  runtime.hints = [];
  runtime.pendingPromotion = null;
  persist();
  render();
}

const BOT_MIN_PAUSE_MS = 1000;

function maybeTriggerBotMove() {
  if (ui.screen !== 'game' || ui.mode !== 'bot' || chess.game_over() || chess.turn() === ui.activeHumanColor) return;
  runtime.thinking = true;
  render();
  setTimeout(() => {
    const startedAt = Date.now();
    const mv = getBotMove(chess, ui.botDifficulty);
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(0, BOT_MIN_PAUSE_MS - elapsed);
    setTimeout(() => {
      if (mv) chess.move(mv);
      runtime.thinking = false;
      persist();
      render();
    }, remaining);
  }, 60);
}

// ---------- Helpers ----------
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
if (ui.screen === 'game') maybeTriggerBotMove();
