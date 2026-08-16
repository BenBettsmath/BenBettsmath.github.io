// Evaluation + minimax/alpha-beta search on top of a chess.js instance.
// Operates by mutating the passed-in `chess` instance via move()/undo() and
// always restoring it before returning (safe for the caller's live game state).

const PIECE_VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const MATE_VALUE = 100000;

function t(...vals) { return vals; }
// Row 0 = rank 8 .. row 7 = rank 1, from White's perspective. Flattened row-major.
const PST = {
  p: [].concat(
    t(0, 0, 0, 0, 0, 0, 0, 0),
    t(50, 50, 50, 50, 50, 50, 50, 50),
    t(10, 10, 20, 30, 30, 20, 10, 10),
    t(5, 5, 10, 25, 25, 10, 5, 5),
    t(0, 0, 0, 20, 20, 0, 0, 0),
    t(5, -5, -10, 0, 0, -10, -5, 5),
    t(5, 10, 10, -20, -20, 10, 10, 5),
    t(0, 0, 0, 0, 0, 0, 0, 0)
  ),
  n: [].concat(
    t(-50, -40, -30, -30, -30, -30, -40, -50),
    t(-40, -20, 0, 0, 0, 0, -20, -40),
    t(-30, 0, 10, 15, 15, 10, 0, -30),
    t(-30, 5, 15, 20, 20, 15, 5, -30),
    t(-30, 0, 15, 20, 20, 15, 0, -30),
    t(-30, 5, 10, 15, 15, 10, 5, -30),
    t(-40, -20, 0, 5, 5, 0, -20, -40),
    t(-50, -40, -30, -30, -30, -30, -40, -50)
  ),
  b: [].concat(
    t(-20, -10, -10, -10, -10, -10, -10, -20),
    t(-10, 0, 0, 0, 0, 0, 0, -10),
    t(-10, 0, 5, 10, 10, 5, 0, -10),
    t(-10, 5, 5, 10, 10, 5, 5, -10),
    t(-10, 0, 10, 10, 10, 10, 0, -10),
    t(-10, 10, 10, 10, 10, 10, 10, -10),
    t(-10, 5, 0, 0, 0, 0, 5, -10),
    t(-20, -10, -10, -10, -10, -10, -10, -20)
  ),
  r: [].concat(
    t(0, 0, 0, 0, 0, 0, 0, 0),
    t(5, 10, 10, 10, 10, 10, 10, 5),
    t(-5, 0, 0, 0, 0, 0, 0, -5),
    t(-5, 0, 0, 0, 0, 0, 0, -5),
    t(-5, 0, 0, 0, 0, 0, 0, -5),
    t(-5, 0, 0, 0, 0, 0, 0, -5),
    t(-5, 0, 0, 0, 0, 0, 0, -5),
    t(0, 0, 0, 5, 5, 0, 0, 0)
  ),
  q: [].concat(
    t(-20, -10, -10, -5, -5, -10, -10, -20),
    t(-10, 0, 0, 0, 0, 0, 0, -10),
    t(-10, 0, 5, 5, 5, 5, 0, -10),
    t(-5, 0, 5, 5, 5, 5, 0, -5),
    t(0, 0, 5, 5, 5, 5, 0, -5),
    t(-10, 5, 5, 5, 5, 5, 0, -10),
    t(-10, 0, 5, 0, 0, 0, 0, -10),
    t(-20, -10, -10, -5, -5, -10, -10, -20)
  ),
  k: [].concat(
    t(-30, -40, -40, -50, -50, -40, -40, -30),
    t(-30, -40, -40, -50, -50, -40, -40, -30),
    t(-30, -40, -40, -50, -50, -40, -40, -30),
    t(-30, -40, -40, -50, -50, -40, -40, -30),
    t(-20, -30, -30, -40, -40, -30, -30, -20),
    t(-10, -20, -20, -20, -20, -20, -20, -10),
    t(20, 20, 0, 0, 0, 0, 20, 20),
    t(20, 30, 10, 0, 0, 10, 30, 20)
  ),
};

const FILES = 'abcdefgh';
function rcOf(square) {
  const col = FILES.indexOf(square[0]);
  const rank = parseInt(square[1], 10);
  return { row: 8 - rank, col };
}
function pstValue(type, square, color) {
  const { row, col } = rcOf(square);
  const r = color === 'w' ? row : 7 - row;
  return PST[type][r * 8 + col];
}

export function evaluate(chess) {
  let score = 0;
  const grid = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = grid[r][c];
      if (!cell) continue;
      const val = PIECE_VALUE[cell.type] + pstValue(cell.type, cell.square, cell.color);
      score += cell.color === 'w' ? val : -val;
    }
  }
  return score;
}

export function evaluateRelative(chess) {
  const v = evaluate(chess);
  return chess.turn() === 'w' ? v : -v;
}

function orderScore(m) {
  let s = 0;
  if (m.captured) s += PIECE_VALUE[m.captured] * 10 - PIECE_VALUE[m.piece];
  if (m.promotion) s += PIECE_VALUE[m.promotion];
  if (m.flags.includes('k') || m.flags.includes('q')) s += 20;
  return s;
}
function orderedMoves(chess) {
  const moves = chess.moves({ verbose: true });
  moves.sort((a, b) => orderScore(b) - orderScore(a));
  return moves;
}

function gameStatusFor(chess) {
  if (chess.in_checkmate()) return { over: true, reason: 'checkmate' };
  if (chess.in_draw() || chess.in_stalemate()) return { over: true, reason: 'draw' };
  return { over: false };
}

function quiescence(chess, alpha, beta, qdepth) {
  const standPat = evaluateRelative(chess);
  if (qdepth <= 0) return standPat;
  if (standPat >= beta) return beta;
  if (alpha < standPat) alpha = standPat;
  const captures = orderedMoves(chess).filter(m => m.captured);
  for (const m of captures) {
    chess.move(m);
    const score = -quiescence(chess, -beta, -alpha, qdepth - 1);
    chess.undo();
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(chess, depth, alpha, beta, ply, useQuiescence) {
  const status = gameStatusFor(chess);
  if (status.over) {
    if (status.reason === 'checkmate') return -(MATE_VALUE - ply);
    return 0;
  }
  if (depth === 0) {
    return useQuiescence ? quiescence(chess, alpha, beta, 4) : evaluateRelative(chess);
  }
  const moves = orderedMoves(chess);
  let best = -Infinity;
  for (const m of moves) {
    chess.move(m);
    const score = -negamax(chess, depth - 1, -beta, -alpha, ply + 1, useQuiescence);
    chess.undo();
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

// Returns [{move, score}, ...] sorted best-first, score relative to side-to-move.
export function searchTopMoves(chess, depth, useQuiescence) {
  const moves = orderedMoves(chess);
  const results = [];
  let alpha = -Infinity;
  const beta = Infinity;
  for (const m of moves) {
    chess.move(m);
    const score = -negamax(chess, depth - 1, -beta, -alpha, 1, useQuiescence);
    chess.undo();
    results.push({ move: m, score });
    if (score > alpha) alpha = score;
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}

function pickFromTop(results, margin) {
  if (results.length === 0) return null;
  const top = results[0].score;
  const candidates = results.filter(r => top - r.score <= margin);
  return candidates[Math.floor(Math.random() * candidates.length)].move;
}

function chooseEasyMove(chess) {
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return null;
  let best = null, bestScore = -Infinity;
  for (const m of moves) {
    chess.move(m);
    let s = -evaluateRelative(chess);
    chess.undo();
    s += (Math.random() - 0.5) * 300;
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best;
}

// depth = total plies searched from the current position.
export function getBotMove(chess, difficulty) {
  if (difficulty === 'easy') return chooseEasyMove(chess);
  if (difficulty === 'medium') return pickFromTop(searchTopMoves(chess, 3, false), 15);
  return pickFromTop(searchTopMoves(chess, 4, true), 5);
}

// Top-N candidate moves for the hint feature, for whoever's turn it is.
export function getHints(chess, topN) {
  return searchTopMoves(chess, 3, false).slice(0, topN || 4);
}
