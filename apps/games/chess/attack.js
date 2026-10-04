// Attack-map computation, built on top of chess.js's board() grid.
// board() format: 8x8 array, row 0 = rank 8 .. row 7 = rank 1, each cell
// null or { square, type, color }.

const FILES = 'abcdefgh';
const KNIGHT_OFFS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING_OFFS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
function alg(r, c) { return FILES[c] + (8 - r); }

// Returns a Set of algebraic squares that `color` attacks/controls, including
// squares occupied by its own pieces (i.e. "defended" squares), matching the
// standard attack-map concept: sliding pieces stop at the first blocker
// (friend or foe) but that blocking square itself still counts as attacked.
export function computeAttacks(boardGrid, color) {
  const attacked = new Set();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = boardGrid[r][c];
      if (!cell || cell.color !== color) continue;
      const type = cell.type;
      if (type === 'p') {
        const dir = color === 'w' ? -1 : 1;
        for (const dc of [-1, 1]) {
          const nr = r + dir, nc = c + dc;
          if (inBounds(nr, nc)) attacked.add(alg(nr, nc));
        }
      } else if (type === 'n' || type === 'k') {
        for (const [dr, dc] of (type === 'n' ? KNIGHT_OFFS : KING_OFFS)) {
          const nr = r + dr, nc = c + dc;
          if (inBounds(nr, nc)) attacked.add(alg(nr, nc));
        }
      } else {
        const dirs = type === 'b' ? BISHOP_DIRS : type === 'r' ? ROOK_DIRS : BISHOP_DIRS.concat(ROOK_DIRS);
        for (const [dr, dc] of dirs) {
          let nr = r + dr, nc = c + dc;
          while (inBounds(nr, nc)) {
            attacked.add(alg(nr, nc));
            if (boardGrid[nr][nc]) break;
            nr += dr; nc += dc;
          }
        }
      }
    }
  }
  return attacked;
}

// Returns { [square]: { piece: {type,color,square}, attackerColor } } for
// every occupied square whose piece is attacked by the OPPOSING color.
export function attackedPieces(boardGrid, attackedByWhite, attackedByBlack) {
  const result = {};
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = boardGrid[r][c];
      if (!cell) continue;
      const opponentAttacks = cell.color === 'w' ? attackedByBlack : attackedByWhite;
      if (opponentAttacks.has(cell.square)) {
        result[cell.square] = { piece: cell, attackerColor: cell.color === 'w' ? 'b' : 'w' };
      }
    }
  }
  return result;
}
