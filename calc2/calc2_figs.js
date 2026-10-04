/* Shared figure rendering for Calc II chapter pages.
   Every figure is a 2-D canvas. A page emits <canvas data-fig="name"></canvas>,
   imports this module and calls initFigures(). A figure is either a plain
   draw function (ctx, W, H, t), with t in [0, 1) looping, or an object
     { state, controls, handles, draw(ctx, W, H, t, S) }
   where S is the figure's live state, controls are sliders / buttons built
   under the canvas, and handles(S) lists draggable points. W and H are in
   CSS pixels (the context is pre-scaled by devicePixelRatio). */

/* ============================================================
   infrastructure
   ============================================================ */

const C = {
  text: '#dfe3ea', dim: '#9aa0aa', faint: '#4a505a', ghost: '#353a42',
  blue: '#4fc3f7', orange: '#ffa75a', green: '#5bd6a0', purple: '#c08af0',
  pink: '#ff5d99', yellow: '#ffd166', red: '#ff6b6b', white: '#e8eaef',
};
const FAM = 'ui-sans-serif, system-ui, sans-serif';
const PI = Math.PI;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fact = n => { let p = 1; for (let k = 2; k <= n; k++) p *= k; return p; };
const fmt = (v, d = 3) => {
  if (!isFinite(v)) return v > 0 ? '∞' : (v < 0 ? '−∞' : 'undefined');
  if (Math.abs(v) >= 1e5) return v.toExponential(2).replace(/-/g, '−');
  return v.toFixed(d).replace(/-/g, '−');
};
/* label size: scales down on narrow canvases (phones) so readouts fit */
let CUR_W = 560;
const fs = H => Math.max(10, Math.min(15, Math.round(Math.min(H * 0.041, CUR_W * 0.0275))));

function build2D(canvas, spec) {
  const isFn = typeof spec === 'function';
  const draw = isFn ? spec : spec.draw;
  const period = (!isFn && spec.period) || 6000;
  const S = isFn ? {} : Object.assign({}, spec.state || {});
  S._ui = [];
  if (!isFn && spec.controls) makeControls(canvas, spec.controls, S);
  if (!isFn && spec.handles) attachDrag(canvas, spec.handles, S);
  let start = null, visible = true, grad = null, gH = 0;
  new IntersectionObserver(es => { for (const e of es) visible = e.isIntersecting; }).observe(canvas);
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    grad = null;
  }
  resize();
  new ResizeObserver(resize).observe(canvas);
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!visible) { start = null; return; }
    if (start === null) start = ts;
    const t = ((ts - start) % period) / period;
    const ctx = canvas.getContext('2d');
    const dpr = canvas.width / Math.max(1, canvas.clientWidth);
    const W = canvas.clientWidth, H = canvas.clientHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!grad || gH !== H) {
      grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#16171b'); grad.addColorStop(1, '#0d0e11'); gH = H;
    }
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    CUR_W = W;
    draw(ctx, W, H, t, S);
  }
  requestAnimationFrame(frame);
}

function makeControls(canvas, defs, S) {
  const box = document.createElement('div');
  box.className = 'fig-ctrl';
  const refresh = () => S._ui.forEach(f => f());
  for (const d of defs) {
    if (d.type === 'range') {
      if (S[d.key] === undefined) S[d.key] = d.value;
      const lab = document.createElement('label');
      const name = document.createElement('span'); name.innerHTML = d.label;
      const inp = document.createElement('input');
      inp.type = 'range'; inp.min = d.min; inp.max = d.max; inp.step = d.step;
      const out = document.createElement('span'); out.className = 'val';
      const f = d.fmt || (v => String(v));
      const sync = () => { inp.value = S[d.key]; out.textContent = f(S[d.key]); };
      inp.addEventListener('input', () => { S[d.key] = +inp.value; out.textContent = f(S[d.key]); });
      S._ui.push(sync); sync();
      lab.append(name, inp, out); box.append(lab);
    } else if (d.type === 'buttons') {
      if (S[d.key] === undefined) S[d.key] = d.value;
      const grp = document.createElement('span'); grp.className = 'grp';
      if (d.label) { const n = document.createElement('span'); n.innerHTML = d.label; grp.append(n); }
      const btns = d.options.map(([v, txt]) => {
        const b = document.createElement('button'); b.type = 'button'; b.innerHTML = txt;
        b.addEventListener('click', () => { S[d.key] = v; if (d.onChange) d.onChange(S); refresh(); });
        grp.append(b); return [v, b];
      });
      S._ui.push(() => btns.forEach(([v, b]) => b.classList.toggle('on', S[d.key] === v)));
      box.append(grp);
    } else if (d.type === 'action') {
      const b = document.createElement('button'); b.type = 'button'; b.innerHTML = d.label;
      b.addEventListener('click', () => { d.run(S); refresh(); });
      box.append(b);
    }
  }
  refresh();
  canvas.insertAdjacentElement('afterend', box);
}

function attachDrag(canvas, handlesFn, S) {
  canvas.classList.add('draggable');
  let active = null;
  const pos = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('pointerdown', e => {
    if (!S.xf) return;
    const [px, py] = pos(e);
    let best = null, bd = 22;
    for (const h of handlesFn(S)) {
      const xf = h.xf || S.xf;
      const [hx, hy] = xf(h.x, h.y);
      const d = Math.hypot(hx - px, hy - py);
      if (d < bd) { bd = d; best = h; }
    }
    if (best) { active = best; canvas.setPointerCapture(e.pointerId); e.preventDefault(); }
  });
  canvas.addEventListener('pointermove', e => {
    if (!active) return;
    const [px, py] = pos(e);
    const xf = active.xf || S.xf;
    const [wx, wy] = xf.inv(px, py);
    active.set(wx, wy);
    const idx = active.id;
    if (idx !== undefined) active = handlesFn(S).find(h => h.id === idx) || active;
  });
  const end = () => { active = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}

/* world rect [x0,x1]x[y0,y1] into the pixel box (L, T, w, h). */
function frameXf(L, T, w, h, x0, x1, y0, y1, equal = true) {
  let sx = w / (x1 - x0), sy = h / (y1 - y0);
  if (equal) sx = sy = Math.min(sx, sy);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, qx = L + w / 2, qy = T + h / 2;
  const f = (x, y) => [qx + (x - cx) * sx, qy - (y - cy) * sy];
  f.inv = (px, py) => [cx + (px - qx) / sx, cy - (py - qy) / sy];
  f.sx = sx; f.sy = sy; f.box = [L, T, w, h];
  return f;
}
function makeXf(W, H, x0, x1, y0, y1, opts = {}) {
  const p = opts.pad ?? 0.06;
  const f = frameXf(W * p, H * p, W * (1 - 2 * p), H * (1 - 2 * p), x0, x1, y0, y1, opts.equal ?? true);
  f.box = [0, 0, W, H];
  return f;
}
function visBounds(xf) {
  const [L, T, w, h] = xf.box;
  const [a, d] = xf.inv(L, T + h), [b, c] = xf.inv(L + w, T);
  return { x0: a, x1: b, y0: d, y1: c };
}

function niceStep(span) {
  const raw = span / 8, pow = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / pow;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * pow;
}

function d2Axes(ctx, xf, opts = {}) {
  const [L, T, w, h] = xf.box;
  const B = visBounds(xf);
  const [ox, oy] = xf(0, 0);
  ctx.save();
  ctx.beginPath(); ctx.rect(L, T, w, h); ctx.clip();
  if (opts.grid !== false) {
    const sx = opts.gx || niceStep(B.x1 - B.x0), sy = opts.gy || niceStep(B.y1 - B.y0);
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.045)'; ctx.beginPath();
    for (let g = Math.ceil(B.x0 / sx) * sx; g <= B.x1; g += sx) { const p = xf(g, 0)[0]; ctx.moveTo(p, T); ctx.lineTo(p, T + h); }
    for (let g = Math.ceil(B.y0 / sy) * sy; g <= B.y1; g += sy) { const p = xf(0, g)[1]; ctx.moveTo(L, p); ctx.lineTo(L + w, p); }
    ctx.stroke();
  }
  ctx.strokeStyle = '#6b6f78'; ctx.fillStyle = '#6b6f78'; ctx.lineWidth = 1.5;
  const a = 7;
  if (oy >= T && oy <= T + h) {
    ctx.beginPath(); ctx.moveTo(L + 4, oy); ctx.lineTo(L + w - 4, oy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(L + w - 4, oy); ctx.lineTo(L + w - 4 - a, oy - a * 0.45); ctx.lineTo(L + w - 4 - a, oy + a * 0.45); ctx.fill();
  }
  if (opts.yaxis !== false && ox >= L && ox <= L + w) {
    ctx.beginPath(); ctx.moveTo(ox, T + h - 4); ctx.lineTo(ox, T + 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox, T + 4); ctx.lineTo(ox - a * 0.45, T + 4 + a); ctx.lineTo(ox + a * 0.45, T + 4 + a); ctx.fill();
  }
  ctx.restore();
}

/* numeric tick labels on the x axis (and optionally y axis) */
function d2Ticks(ctx, xf, H, xs = [], ys = []) {
  const F = fs(H) * 0.82;
  const [ox, oy] = xf(0, 0);
  for (const [v, s] of xs) {
    const [px] = xf(v, 0);
    ctx.save(); ctx.strokeStyle = '#6b6f78'; ctx.beginPath(); ctx.moveTo(px, oy - 3); ctx.lineTo(px, oy + 3); ctx.stroke(); ctx.restore();
    d2Text(ctx, s, px, oy + 5, C.dim, F, { align: 'center' });
  }
  for (const [v, s] of ys) {
    const py = xf(0, v)[1];
    ctx.save(); ctx.strokeStyle = '#6b6f78'; ctx.beginPath(); ctx.moveTo(ox - 3, py); ctx.lineTo(ox + 3, py); ctx.stroke(); ctx.restore();
    d2Text(ctx, s, ox - 6, py, C.dim, F, { align: 'right', base: 'middle' });
  }
}

function strokeStyle(ctx, color, lw, dash) {
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (dash) ctx.setLineDash(dash);
}

function plotFn(ctx, xf, f, a, b, color, lw = 2, opts = {}) {
  const N = opts.N || 500;
  const [L, T, w, h] = xf.box;
  ctx.save();
  ctx.beginPath(); ctx.rect(L, T, w, h); ctx.clip();
  strokeStyle(ctx, color, lw, opts.dash);
  ctx.beginPath();
  let pen = false, prev = 0;
  for (let i = 0; i <= N; i++) {
    const x = a + (b - a) * i / N, y = f(x);
    if (!isFinite(y)) { pen = false; continue; }
    const [px, py] = xf(x, y);
    if (py < T - 3 * h || py > T + 4 * h) { pen = false; continue; }
    if (pen && Math.abs(py - prev) > 1.5 * h) pen = false;
    if (pen) ctx.lineTo(px, py); else { ctx.moveTo(px, py); pen = true; }
    prev = py;
  }
  ctx.stroke(); ctx.restore();
}

function d2Path(ctx, xf, pts, color, lw = 2, dash = null) {
  if (pts.length < 2) return;
  const [L, T, w, h] = xf.box;
  ctx.save(); ctx.beginPath(); ctx.rect(L, T, w, h); ctx.clip();
  strokeStyle(ctx, color, lw, dash);
  ctx.beginPath(); ctx.moveTo(...xf(...pts[0]));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(...xf(...pts[i]));
  ctx.stroke(); ctx.restore();
}
const d2Seg = (ctx, xf, x0, y0, x1, y1, color, lw = 1.5, dash = null) => d2Path(ctx, xf, [[x0, y0], [x1, y1]], color, lw, dash);

function d2Poly(ctx, xf, pts, fill) {
  if (pts.length < 3) return;
  const [L, T, w, h] = xf.box;
  ctx.save(); ctx.beginPath(); ctx.rect(L, T, w, h); ctx.clip();
  ctx.beginPath(); ctx.moveTo(...xf(...pts[0]));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(...xf(...pts[i]));
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.restore();
}

function d2Dot(ctx, xf, x, y, r, color, opts = {}) {
  const [px, py] = xf(x, y);
  ctx.save();
  ctx.beginPath(); ctx.arc(px, py, r, 0, 2 * PI);
  if (opts.hollow) { ctx.fillStyle = '#121317'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke(); }
  else { ctx.fillStyle = color; if (opts.glow !== false) { ctx.shadowColor = color; ctx.shadowBlur = r * 2; } ctx.fill(); }
  if (opts.ring) { ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(px, py, r + 4, 0, 2 * PI); ctx.stroke(); }
  ctx.restore();
}

function d2Arrow(ctx, xf, x0, y0, x1, y1, color, lw = 2) {
  const [a, b] = xf(x0, y0), [c, d] = xf(x1, y1);
  const dx = c - a, dy = d - b, L = Math.hypot(dx, dy);
  if (L < 2) return;
  const ux = dx / L, uy = dy / L, h = Math.min(11, Math.max(6, L * 0.3));
  ctx.save(); strokeStyle(ctx, color, lw);
  ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c - ux * h * 0.6, d - uy * h * 0.6); ctx.stroke();
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(c, d);
  ctx.lineTo(c - h * ux + h * 0.42 * uy, d - h * uy - h * 0.42 * ux);
  ctx.lineTo(c - h * ux - h * 0.42 * uy, d - h * uy + h * 0.42 * ux);
  ctx.closePath(); ctx.fill(); ctx.restore();
}

function d2Arc(ctx, xf, cx, cy, r, a0, a1, color, lw = 1.5) {
  const [px, py] = xf(cx, cy), R = r * xf.sx;
  ctx.save(); strokeStyle(ctx, color, lw);
  ctx.beginPath(); ctx.arc(px, py, R, -a0, -a1, a1 > a0); ctx.stroke(); ctx.restore();
}

function d2Text(ctx, s, px, py, color, size, opts = {}) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${opts.bold ? 'bold ' : ''}${opts.italic ? 'italic ' : ''}${size}px ${FAM}`;
  ctx.textAlign = opts.align || 'left';
  ctx.textBaseline = opts.base || 'top';
  ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 4;
  ctx.fillText(s, px, py);
  ctx.restore();
}

/* text with ^x, ^{..}, _x, _{..} drawn as real super/subscripts */
function mathWidth(ctx, s, size, bold) {
  let w = 0;
  mathRun(s, size, (str, f) => { ctx.font = `${bold ? 'bold ' : ''}${f}px ${FAM}`; w += ctx.measureText(str).width; });
  return w;
}
function mathRun(s, size, cb) {
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '^' || ch === '_') {
      i++; let tok = '';
      if (s[i] === '{') { const e = s.indexOf('}', i); tok = s.slice(i + 1, e < 0 ? s.length : e); i = e < 0 ? s.length : e + 1; }
      else { tok = s[i] ?? ''; i++; }
      cb(tok, size * 0.72, ch === '^' ? -size * 0.14 : size * 0.42);
    } else {
      let j = i; while (j < s.length && s[j] !== '^' && s[j] !== '_') j++;
      cb(s.slice(i, j), size, 0); i = j;
    }
  }
}
function d2Math(ctx, s, px, py, color, size, opts = {}) {
  ctx.save();
  ctx.fillStyle = color; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 4;
  let x = px;
  if (opts.align === 'center') x -= mathWidth(ctx, s, size, opts.bold) / 2;
  if (opts.align === 'right') x -= mathWidth(ctx, s, size, opts.bold);
  mathRun(s, size, (str, f, dy) => {
    ctx.font = `${opts.bold ? 'bold ' : ''}${f}px ${FAM}`;
    ctx.fillText(str, x, py + dy); x += ctx.measureText(str).width;
  });
  ctx.restore();
}

/* stacked readout lines [[text, color, bold?], ...] on a translucent panel */
function d2Panel(ctx, lines, x, y, F, opts = {}) {
  const lh = F * 1.42;
  let w = 0;
  for (const [s, , b] of lines) w = Math.max(w, mathWidth(ctx, s, F, b));
  ctx.save();
  ctx.fillStyle = 'rgba(10,11,14,0.62)';
  const X = opts.right ? x - w - 16 : x;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(X, y, w + 16, lines.length * lh + 8, 5); else ctx.rect(X, y, w + 16, lines.length * lh + 8);
  ctx.fill(); ctx.restore();
  lines.forEach(([s, col, b], k) => d2Math(ctx, s, X + 8, y + 6 + k * lh, col || C.text, F, { bold: b }));
}

/* horizontal line through the plot box at world height y */
function hLine(ctx, xf, y, color, dash = [5, 5], lw = 1.2) {
  const B = visBounds(xf); d2Seg(ctx, xf, B.x0, y, B.x1, y, color, lw, dash);
}

/* sampled slope field for y' = F(x, y) */
function slopeField(ctx, xf, F, step, color = '#56637a', len = 13) {
  const B = visBounds(xf);
  ctx.save(); strokeStyle(ctx, color, 1.3);
  ctx.beginPath();
  for (let x = Math.ceil(B.x0 / step) * step; x <= B.x1; x += step)
    for (let y = Math.ceil(B.y0 / step) * step; y <= B.y1; y += step) {
      const m = F(x, y);
      const [px, py] = xf(x, y);
      let ux, uy;
      if (!isFinite(m)) { ux = 0; uy = 1; }
      else { const dx = xf.sx, dy = -m * xf.sy, L = Math.hypot(dx, dy); ux = dx / L; uy = dy / L; }
      ctx.moveTo(px - ux * len / 2, py - uy * len / 2); ctx.lineTo(px + ux * len / 2, py + uy * len / 2);
    }
  ctx.stroke(); ctx.restore();
}

function simpsonExact(f, a, b, n = 2000) {
  const h = (b - a) / n; let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
  return s * h / 3;
}

const fmtC = (a, b, d = 2) => `${fmt(a, d)} ${b < 0 ? '−' : '+'} ${Math.abs(b).toFixed(d)}i`;
const deg = th => `${(th * 180 / PI).toFixed(0)}°`;

/* ============================================================
   figures
   ============================================================ */

export const FIGS2D = {

  /* ---------- Chapter 6 ---------- */

  /* f and f^{-1} reflected across y = x, with tangent slopes m and 1/m */
  inverseSlope: {
    state: { a: 1.2 },
    handles: S => {
      const f = x => x * x * x / 8 + x / 2 + 1, b = f(S.a);
      return [
        { x: S.a, y: b, set: (x) => { S.a = clamp(x, -2.6, 2.1); } },
        { x: b, y: S.a, set: (x, y) => { S.a = clamp(y, -2.6, 2.1); } },
      ];
    },
    draw(ctx, W, H, t, S) {
      const f = x => x * x * x / 8 + x / 2 + 1, fp = x => 3 * x * x / 8 + 0.5;
      const xf = makeXf(W, H, -4.2, 4.2, -4, 4); S.xf = xf;
      d2Axes(ctx, xf);
      d2Seg(ctx, xf, -5, -5, 5, 5, C.dim, 1.2, [5, 5]);
      plotFn(ctx, xf, f, -3.4, 2.5, C.blue, 2.5);
      const inv = []; for (let i = 0; i <= 300; i++) { const x = -3.4 + 5.9 * i / 300; inv.push([f(x), x]); }
      d2Path(ctx, xf, inv, C.orange, 2.5);
      const a = S.a, b = f(a), m = fp(a), L = 1.3;
      const n1 = Math.hypot(1, m), n2 = Math.hypot(m, 1);
      d2Seg(ctx, xf, a - L / n1, b - L * m / n1, a + L / n1, b + L * m / n1, C.blue, 1.6, [6, 4]);
      d2Seg(ctx, xf, b - L * m / n2, a - L / n2, b + L * m / n2, a + L / n2, C.orange, 1.6, [6, 4]);
      d2Seg(ctx, xf, a, b, b, a, C.faint, 1.2, [3, 4]);
      d2Dot(ctx, xf, a, b, 5, C.blue, { ring: true });
      d2Dot(ctx, xf, b, a, 5, C.orange, { ring: true });
      const F = fs(H);
      d2Panel(ctx, [
        ['f(x) = x³/8 + x/2 + 1', C.blue, true],
        ['f⁻¹ = reflection across y = x', C.orange, true],
        [`on f: (b, a) = (${fmt(a, 2)}, ${fmt(b, 2)}),   on f⁻¹: (a, b)`, C.text],
        [`slope of f at (b, a):  f '(b) = ${fmt(m)}`, C.blue],
        [`slope of f⁻¹ at (a, b):  1/f '(b) = ${fmt(1 / m)}`, C.orange],
        ['drag either point', C.dim],
      ], 8, 8, F);
    },
  },

  /* b^x and log_b x for a slider base b, with the tangent to b^x at 0 */
  expBase: {
    state: { b: 2 },
    controls: [
      { type: 'range', key: 'b', label: 'base <i>b</i>', min: 1.2, max: 6, step: 0.01, value: 2, fmt: v => v.toFixed(2) },
      { type: 'action', label: 'set <i>b</i> = <i>e</i>', run: S => { S.b = Math.E; } },
    ],
    draw(ctx, W, H, t, S) {
      const b = S.b, lb = Math.log(b);
      const xf = makeXf(W, H, -3.5, 5.5, -2.6, 5); S.xf = xf;
      d2Axes(ctx, xf);
      d2Seg(ctx, xf, -4, -4, 7, 7, C.dim, 1.1, [5, 5]);
      const isE = Math.abs(b - Math.E) < 0.006;
      if (!isE) {
        plotFn(ctx, xf, Math.exp, -5, 3, C.ghost, 1.5);
        plotFn(ctx, xf, Math.log, 0.001, 8, C.ghost, 1.5);
      }
      plotFn(ctx, xf, x => Math.exp(lb * x), -5, 4, C.blue, 2.5);
      plotFn(ctx, xf, x => Math.log(x) / lb, 0.0005, 8, C.orange, 2.5, { N: 900 });
      d2Seg(ctx, xf, -2.2, 1 - 2.2 * lb, 2.2, 1 + 2.2 * lb, C.green, 1.8, [6, 4]);
      d2Dot(ctx, xf, 0, 1, 4.5, C.green);
      d2Dot(ctx, xf, 1, 0, 4.5, C.orange);
      const F = fs(H);
      d2Panel(ctx, [
        [`y = b^x,  b = ${b.toFixed(2)}`, C.blue, true],
        ['y = log_b x  (inverse of b^x)', C.orange, true],
        [`slope of b^x at x = 0:  ln b = ${fmt(lb)}`, C.green],
        isE ? ['b = e: slope exactly 1', C.yellow, true] : ['grey: e^x and ln x for comparison', C.dim],
      ], 8, 8, F);
    },
  },

  /* inverse trig: restricted branches, horizontal line test, reflection */
  invTrig: {
    state: { fn: 'sin' },
    controls: [{ type: 'buttons', key: 'fn', value: 'sin', options: [['sin', 'sin'], ['cos', 'cos'], ['tan', 'tan']] }],
    draw(ctx, W, H, t, S) {
      const D = {
        sin: { f: Math.sin, g: Math.asin, a: -PI / 2, b: PI / 2, ga: -1, gb: 1, l1: 'y = sin x on [−π/2, π/2]', l2: 'y = sin⁻¹ x : [−1, 1] → [−π/2, π/2]', amp: 0.8 },
        cos: { f: Math.cos, g: Math.acos, a: 0, b: PI, ga: -1, gb: 1, l1: 'y = cos x on [0, π]', l2: 'y = cos⁻¹ x : [−1, 1] → [0, π]', amp: 0.8 },
        tan: { f: Math.tan, g: Math.atan, a: -PI / 2 + 1e-4, b: PI / 2 - 1e-4, ga: -6, gb: 6, l1: 'y = tan x on (−π/2, π/2)', l2: 'y = tan⁻¹ x : ℝ → (−π/2, π/2)', amp: 2.4 },
      }[S.fn];
      const xf = makeXf(W, H, -4, 4, -3.4, 3.6); S.xf = xf;
      d2Axes(ctx, xf);
      d2Ticks(ctx, xf, H, [[PI / 2, 'π/2'], [-PI / 2, '−π/2'], [PI, 'π']], []);
      d2Seg(ctx, xf, -5, -5, 5, 5, C.dim, 1.1, [5, 5]);
      plotFn(ctx, xf, D.f, -6, 6, C.faint, 1.6, { N: 1200 });
      plotFn(ctx, xf, D.f, D.a, D.b, C.blue, 2.8, { N: 600 });
      plotFn(ctx, xf, D.g, D.ga, D.gb, C.orange, 2.8, { N: 600 });
      if (S.fn === 'tan') {
        hLine(ctx, xf, PI / 2, 'rgba(255,167,90,0.45)', [4, 5]);
        hLine(ctx, xf, -PI / 2, 'rgba(255,167,90,0.45)', [4, 5]);
      }
      /* horizontal line test: a sweeping line y = h */
      const h = D.amp * Math.sin(2 * PI * t);
      hLine(ctx, xf, h, 'rgba(255,209,102,0.55)', null, 1.2);
      const xs = []; const N = 3000;
      for (let i = 0; i < N; i++) {
        const x0 = -4.5 + 9 * i / N, x1 = x0 + 9 / N;
        const y0 = D.f(x0) - h, y1 = D.f(x1) - h;
        if (y0 * y1 <= 0 && Math.abs(y0 - y1) < 1) xs.push(x0 - y0 * (x1 - x0) / (y1 - y0));
      }
      for (const x of xs) {
        const inside = x >= D.a - 1e-6 && x <= D.b + 1e-6;
        d2Dot(ctx, xf, x, h, inside ? 5 : 3.5, inside ? C.yellow : C.dim, { glow: inside });
      }
      const F = fs(H);
      d2Panel(ctx, [
        [D.l1, C.blue, true],
        [D.l2, C.orange, true],
        ['grey: the full graph meets a horizontal line many times', C.dim],
        ['yellow: the restricted piece meets it once', C.yellow],
      ], 8, 8, F);
    },
  },

  /* the point (cosh t, sinh t) on the hyperbola x^2 - y^2 = 1, sector area t/2 */
  hyperbola: {
    state: { t: 1 },
    controls: [{ type: 'range', key: 't', label: '<i>t</i>', min: -1.9, max: 1.9, step: 0.01, value: 1, fmt: v => v.toFixed(2) }],
    draw(ctx, W, H, tt, S) {
      const t = S.t, c = Math.cosh(t), s = Math.sinh(t);
      const xf = makeXf(W, H, -2.6, 4.2, -3.6, 3.6); S.xf = xf;
      d2Axes(ctx, xf);
      d2Seg(ctx, xf, -5, -5, 5, 5, C.ghost, 1.2, [5, 5]);
      d2Seg(ctx, xf, -5, 5, 5, -5, C.ghost, 1.2, [5, 5]);
      const pts = [[0, 0]];
      const n = 80; for (let i = 0; i <= n; i++) { const u = t * i / n; pts.push([Math.cosh(u), Math.sinh(u)]); }
      d2Poly(ctx, xf, pts, 'rgba(255,167,90,0.32)');
      const br = []; for (let i = 0; i <= 200; i++) { const u = -2.2 + 4.4 * i / 200; br.push([Math.cosh(u), Math.sinh(u)]); }
      d2Path(ctx, xf, br, C.blue, 2.5);
      d2Path(ctx, xf, br.map(([x, y]) => [-x, y]), C.blue, 2.5);
      d2Seg(ctx, xf, 0, 0, c, s, C.orange, 1.6);
      d2Seg(ctx, xf, 0, 0, c, 0, C.purple, 3.5);
      d2Seg(ctx, xf, c, 0, c, s, C.green, 3.5);
      d2Dot(ctx, xf, c, s, 5.5, C.yellow, { ring: true });
      const F = fs(H);
      const [px, py] = xf(c, s / 2);
      d2Text(ctx, 'sinh t', px + 6, py, C.green, F * 0.9, { base: 'middle' });
      const [qx, qy] = xf(c / 2, 0);
      d2Text(ctx, 'cosh t', qx, qy + (s >= 0 ? 6 : -F - 4), C.purple, F * 0.9, { align: 'center' });
      d2Panel(ctx, [
        ['x² − y² = 1', C.blue, true],
        [`t = ${t.toFixed(2)}`, C.text],
        [`cosh t = ${fmt(c)},  sinh t = ${fmt(s)}`, C.text],
        [`cosh²t − sinh²t = ${fmt(c * c - s * s)}`, C.dim],
        [`shaded area = |t|/2 = ${fmt(Math.abs(t) / 2)}`, C.orange],
      ], 8, 8, F);
    },
  },

  /* cosh and sinh as averages of e^x/2 and e^{-x}/2 */
  coshSinh: (ctx, W, H, t) => {
    const xf = makeXf(W, H, -3.2, 3.2, -3, 4.2);
    d2Axes(ctx, xf);
    plotFn(ctx, xf, x => Math.exp(x) / 2, -4, 3, C.green, 1.6, { dash: [6, 4] });
    plotFn(ctx, xf, x => Math.exp(-x) / 2, -3, 4, C.purple, 1.6, { dash: [6, 4] });
    plotFn(ctx, xf, Math.cosh, -4, 4, C.blue, 2.6);
    plotFn(ctx, xf, Math.sinh, -4, 4, C.orange, 2.6);
    const x = 2.2 * Math.sin(2 * PI * t);
    const a = Math.exp(x) / 2, b = Math.exp(-x) / 2;
    d2Seg(ctx, xf, x, -3, x, 4.5, 'rgba(255,255,255,0.12)', 1);
    d2Dot(ctx, xf, x, a, 3.5, C.green); d2Dot(ctx, xf, x, b, 3.5, C.purple);
    d2Dot(ctx, xf, x, a + b, 5, C.blue); d2Dot(ctx, xf, x, a - b, 5, C.orange);
    const F = fs(H);
    d2Panel(ctx, [
      ['cosh x = (e^x + e^{−x})/2', C.blue, true],
      ['sinh x = (e^x − e^{−x})/2', C.orange, true],
      ['dashed: e^x/2 and e^{−x}/2', C.dim],
      [`x = ${fmt(x, 2)}:  cosh x = ${fmt(a + b)},  sinh x = ${fmt(a - b)}`, C.text],
    ], 8, 8, F);
  },

  /* exponential growth/decay: equal time steps multiply by equal factors */
  doubling: {
    state: { k: 0.45 },
    controls: [{ type: 'range', key: 'k', label: 'rate <i>k</i>', min: -1, max: 1, step: 0.01, value: 0.45, fmt: v => v.toFixed(2) }],
    draw(ctx, W, H, t, S) {
      let k = S.k; if (Math.abs(k) < 0.08) k = k < 0 ? -0.08 : 0.08;
      const grow = k > 0, y0 = grow ? 0.5 : 8;
      const xf = makeXf(W, H, -0.6, 10.5, -0.8, 12, { equal: false }); S.xf = xf;
      d2Axes(ctx, xf);
      const T = Math.LN2 / Math.abs(k);
      const F = fs(H);
      for (let j = 0; j < 5; j++) {
        const lvl = grow ? y0 * 2 ** j : y0 / 2 ** j, tj = j * T;
        if (tj > 10.4 || lvl > 12) break;
        d2Seg(ctx, xf, 0, lvl, tj, lvl, 'rgba(255,209,102,0.35)', 1, [4, 4]);
        d2Seg(ctx, xf, tj, 0, tj, lvl, 'rgba(255,209,102,0.35)', 1, [4, 4]);
        d2Dot(ctx, xf, tj, lvl, 4, C.yellow);
        const [px, py] = xf(tj, 0);
        d2Text(ctx, j === 0 ? '0' : `${j}T`, px, py + 5, C.dim, F * 0.8, { align: 'center' });
      }
      plotFn(ctx, xf, x => y0 * Math.exp(k * x), 0, 10.5, C.blue, 2.6);
      d2Panel(ctx, [
        [`y = y_0 e^{kt},  y_0 = ${y0},  k = ${k.toFixed(2)}`, C.blue, true],
        [grow ? `doubling time T = ln 2 / k = ${fmt(T, 2)}` : `half-life T = ln 2 / |k| = ${fmt(T, 2)}`, C.yellow],
        [grow ? 'every T units of time, y doubles' : 'every T units of time, y halves', C.text],
      ], W - 8, 8, F, { right: true });
    },
  },

  /* L'Hopital: near a, f/g is a ratio of heights of two tangent lines */
  lhopital: {
    state: { x: 0.5 },
    controls: [{ type: 'range', key: 'x', label: '<i>x</i>', min: -0.7, max: 0.7, step: 0.005, value: 0.5, fmt: v => v.toFixed(3) }],
    handles: S => [{ x: S.x, y: Math.exp(S.x) - 1, set: x => { S.x = clamp(x, -0.7, 0.7); } }],
    draw(ctx, W, H, t, S) {
      let x = S.x; if (Math.abs(x) < 0.004) x = 0.004;
      const f = u => Math.exp(u) - 1, g = u => Math.sin(2 * u);
      const xf = makeXf(W, H, -0.85, 0.85, -1.4, 1.75, { equal: false }); S.xf = xf;
      d2Axes(ctx, xf);
      d2Seg(ctx, xf, -1, -1, 1, 1, 'rgba(79,195,247,0.5)', 1.3, [6, 4]);
      d2Seg(ctx, xf, -1, -2, 1, 2, 'rgba(255,167,90,0.5)', 1.3, [6, 4]);
      plotFn(ctx, xf, f, -1, 1, C.blue, 2.6);
      plotFn(ctx, xf, g, -1, 1, C.orange, 2.6);
      const [px] = xf(x, 0);
      const [, p0] = xf(0, 0), [, pf] = xf(0, f(x)), [, pg] = xf(0, g(x));
      ctx.save(); ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.strokeStyle = C.blue; ctx.beginPath(); ctx.moveTo(px - 4, p0); ctx.lineTo(px - 4, pf); ctx.stroke();
      ctx.strokeStyle = C.orange; ctx.beginPath(); ctx.moveTo(px + 4, p0); ctx.lineTo(px + 4, pg); ctx.stroke();
      ctx.restore();
      d2Dot(ctx, xf, x, f(x), 4.5, C.blue, { ring: true }); d2Dot(ctx, xf, x, g(x), 4.5, C.orange);
      const F = fs(H);
      d2Panel(ctx, [
        ['f(x) = e^x − 1,   g(x) = sin 2x,   f(0) = g(0) = 0', C.text, true],
        ['dashed: tangent lines y = x and y = 2x at 0', C.dim],
        [`x = ${fmt(x)}:   f(x)/g(x) = ${fmt(f(x) / g(x), 4)}`, C.blue],
        [`f '(x)/g'(x) = ${fmt(Math.exp(x) / (2 * Math.cos(2 * x)), 4)}`, C.orange],
        ['limit as x → 0:  f \'(0)/g\'(0) = 1/2', C.yellow],
      ], 8, 8, F);
    },
  },

  /* ---------- Chapter 7 ---------- */

  /* integration by parts as a split rectangle */
  byParts: {
    state: { u2: 2.4 },
    controls: [{ type: 'range', key: 'u2', label: '<i>u</i><sub>2</sub>', min: 1.3, max: 3, step: 0.01, value: 2.4, fmt: v => v.toFixed(2) }],
    draw(ctx, W, H, t, S) {
      const v = u => 0.35 + 0.28 * u * u, u1 = 0.7, u2 = S.u2, v1 = v(u1), v2 = v(u2);
      const xf = makeXf(W, H, -0.3, 6.2, -0.3, 3.1, { equal: false }); S.xf = xf;
      d2Axes(ctx, xf);
      d2Poly(ctx, xf, [[0, 0], [u1, 0], [u1, v1], [0, v1]], 'rgba(160,165,175,0.35)');
      const under = [[u1, 0]], left = [[0, v1]];
      for (let i = 0; i <= 120; i++) { const u = u1 + (u2 - u1) * i / 120; under.push([u, v(u)]); left.push([u, v(u)]); }
      under.push([u2, 0]); left.push([0, v2]);
      d2Poly(ctx, xf, under, 'rgba(79,195,247,0.35)');
      d2Poly(ctx, xf, left, 'rgba(255,167,90,0.35)');
      d2Path(ctx, xf, [[0, v2], [u2, v2], [u2, 0]], C.dim, 1.2, [5, 4]);
      plotFn(ctx, xf, v, 0, 3.2, C.white, 2.4);
      d2Dot(ctx, xf, u1, v1, 4, C.white); d2Dot(ctx, xf, u2, v2, 4.5, C.yellow, { ring: true });
      const F = fs(H);
      const lab = (s, x, y, col) => { const [px, py] = xf(x, y); d2Math(ctx, s, px, py, col, F, { align: 'center', bold: true }); };
      lab('∫ v du', (u1 + u2) / 2 + 0.1, v1 * 0.45, '#bfe9ff');
      lab('∫ u dv', u1 * 0.55, (v1 + v2) / 2 + 0.05, '#ffd9b5');
      lab('u_1v_1', u1 / 2, v1 / 2 - 0.08, C.text);
      const Iv = 0.35 * (u2 - u1) + 0.28 / 3 * (u2 ** 3 - u1 ** 3);
      const Iu = u2 * v2 - u1 * v1 - Iv;
      d2Panel(ctx, [
        ['curve: u increases from u_1 to u_2, v = v(u)', C.text, true],
        [`blue:  ∫ v du = ${fmt(Iv)}`, C.blue],
        [`orange:  ∫ u dv = ${fmt(Iu)}`, C.orange],
        [`sum = u_2v_2 − u_1v_1 = ${fmt(u2 * v2 - u1 * v1)}`, C.yellow],
      ], W - 8, H * 0.42, F, { right: true });
    },
  },

  /* reference triangles for the three trig substitutions */
  trigSub: {
    state: { form: 'sin', th: 35 },
    controls: [
      { type: 'buttons', key: 'form', value: 'sin', options: [['sin', '√(a² − x²)'], ['tan', '√(a² + x²)'], ['sec', '√(x² − a²)']] },
      { type: 'range', key: 'th', label: 'θ', min: 12, max: 72, step: 1, value: 35, fmt: v => `${v}°` },
    ],
    draw(ctx, W, H, t, S) {
      const th = S.th * PI / 180, c = Math.cos(th), s = Math.sin(th);
      const D = {
        sin: { hyp: 'a', opp: 'x', adj: '√(a² − x²)', L: ['x = a sin θ,   dx = a cos θ dθ', '√(a² − x²) = a cos θ', 'θ = sin⁻¹(x/a),  −π/2 ≤ θ ≤ π/2'] },
        tan: { hyp: '√(a² + x²)', opp: 'x', adj: 'a', L: ['x = a tan θ,   dx = a sec²θ dθ', '√(a² + x²) = a sec θ', 'θ = tan⁻¹(x/a),  −π/2 < θ < π/2'] },
        sec: { hyp: 'x', opp: '√(x² − a²)', adj: 'a', L: ['x = a sec θ,   dx = a sec θ tan θ dθ', '√(x² − a²) = a tan θ', '0 ≤ θ < π/2  (or π ≤ θ < 3π/2)'] },
      }[S.form];
      const F = fs(H);
      const top = 4 * F * 1.42 + 22;
      const rw = W * 0.8, rh = H - top - 2.2 * F;
      const k = Math.min(rw / c, rh / s) * 0.9;
      const ox = (W - k * c) / 2, oy = H - 1.6 * F;
      const A = [ox, oy], B = [ox + k * c, oy], Cc = [ox + k * c, oy - k * s];
      ctx.save();
      ctx.fillStyle = 'rgba(79,195,247,0.12)'; ctx.strokeStyle = C.blue; ctx.lineWidth = 2.4; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(...A); ctx.lineTo(...B); ctx.lineTo(...Cc); ctx.closePath(); ctx.fill(); ctx.stroke();
      const q = 12; ctx.lineWidth = 1.3; ctx.strokeStyle = C.dim;
      ctx.beginPath(); ctx.moveTo(B[0] - q, B[1]); ctx.lineTo(B[0] - q, B[1] - q); ctx.lineTo(B[0], B[1] - q); ctx.stroke();
      ctx.strokeStyle = C.yellow; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(A[0], A[1], 34, -th, 0); ctx.stroke();
      ctx.restore();
      d2Text(ctx, 'θ', A[0] + 40 * Math.cos(th / 2), A[1] - 40 * Math.sin(th / 2), C.yellow, F, { base: 'middle', bold: true });
      d2Math(ctx, D.adj, (A[0] + B[0]) / 2, oy + 4, C.text, F, { align: 'center', bold: true });
      d2Math(ctx, D.opp, B[0] + 8, (B[1] + Cc[1]) / 2 - F / 2, C.text, F, { bold: true });
      const mx = (A[0] + Cc[0]) / 2, my = (A[1] + Cc[1]) / 2;
      d2Math(ctx, D.hyp, mx - 10 * s, my - 10 * c - F, C.text, F, { align: 'right', bold: true });
      d2Panel(ctx, [[D.L[0], C.orange, true], [D.L[1], C.green], [D.L[2], C.dim], ['side labels: Pythagoras on the triangle', C.dim]], 8, 8, F);
    },
  },

  /* left / right / midpoint / trapezoid / Simpson with over/under shading */
  riemann: {
    state: { fn: 'exp', m: 'L', n: 4 },
    controls: [
      { type: 'buttons', key: 'fn', value: 'exp', options: [['exp', 'e<sup><i>x</i>/2</sup>'], ['sin', 'sin <i>x</i>'], ['rec', '1/<i>x</i>']] },
      { type: 'buttons', key: 'm', value: 'L', options: [['L', 'L'], ['R', 'R'], ['M', 'M'], ['T', 'T'], ['S', 'S']] },
      { type: 'range', key: 'n', label: '<i>n</i>', min: 1, max: 24, step: 1, value: 4 },
    ],
    draw(ctx, W, H, t, S) {
      const D = {
        exp: { f: x => Math.exp(x / 2), a: 0, b: 2, lab: 'f(x) = e^{x/2} on [0, 2]: increasing, concave up', ym: 2.9, ta: '0', tb: '2' },
        sin: { f: Math.sin, a: 0, b: PI, lab: 'f(x) = sin x on [0, π]: concave down', ym: 1.05, ta: '0', tb: 'π' },
        rec: { f: x => 1 / x, a: 1, b: 3, lab: 'f(x) = 1/x on [1, 3]: decreasing, concave up', ym: 1.05, ta: '1', tb: '3' },
      }[S.fn];
      const { f, a, b } = D;
      let n = S.n; if (S.m === 'S' && n % 2) n += 1;
      const dx = (b - a) / n;
      const xf = makeXf(W, H, a - (b - a) * 0.1, b + (b - a) * 0.06, -D.ym * 0.1, D.ym * 1.75, { equal: false }); S.xf = xf;
      const A = x => {
        let i = Math.min(n - 1, Math.max(0, Math.floor((x - a) / dx))); const xi = a + i * dx;
        if (S.m === 'L') return f(xi);
        if (S.m === 'R') return f(xi + dx);
        if (S.m === 'M') return f(xi + dx / 2);
        if (S.m === 'T') return f(xi) + (f(xi + dx) - f(xi)) * (x - xi) / dx;
        const j = Math.floor(i / 2), x0 = a + 2 * j * dx, x1 = x0 + dx, x2 = x0 + 2 * dx;
        return f(x0) * (x - x1) * (x - x2) / (2 * dx * dx) - f(x1) * (x - x0) * (x - x2) / (dx * dx) + f(x2) * (x - x0) * (x - x1) / (2 * dx * dx);
      };
      /* pixel-column shading */
      const [pa] = xf(a, 0), [pb] = xf(b, 0), [, p0] = xf(0, 0);
      ctx.save();
      for (let px = Math.ceil(pa); px < pb; px++) {
        const [x] = xf.inv(px + 0.5, 0), y = f(x), ya = A(x);
        const [, py] = xf(0, y), [, pya] = xf(0, ya);
        ctx.fillStyle = 'rgba(79,195,247,0.20)'; ctx.fillRect(px, Math.max(py, pya), 1, p0 - Math.max(py, pya));
        if (Math.abs(py - pya) > 0.3) {
          ctx.fillStyle = ya > y ? 'rgba(255,107,107,0.75)' : 'rgba(91,214,160,0.75)';
          ctx.fillRect(px, Math.min(py, pya), 1, Math.abs(py - pya));
        }
      }
      ctx.restore();
      d2Axes(ctx, xf, { yaxis: a <= 0 });
      d2Ticks(ctx, xf, H, [[a, D.ta], [b, D.tb]]);
      /* shape outlines */
      for (let i = 0; i < n; i++) {
        const x0 = a + i * dx, x1 = x0 + dx;
        if (S.m === 'S') {
          if (i % 2) continue;
          const pts = []; for (let k = 0; k <= 40; k++) { const x = x0 + 2 * dx * k / 40; pts.push([x, A(Math.min(x, b - 1e-12))]); }
          d2Path(ctx, xf, [[x0, 0], ...pts, [x0 + 2 * dx, 0]], C.blue, 1.4);
          d2Seg(ctx, xf, x1, 0, x1, f(x1), 'rgba(79,195,247,0.4)', 1, [3, 3]);
        } else {
          const ya = A(x0 + 1e-12), yb = A(x1 - 1e-12);
          d2Path(ctx, xf, [[x0, 0], [x0, ya], [x1, yb], [x1, 0]], C.blue, 1.4);
        }
      }
      plotFn(ctx, xf, f, a - (b - a) * 0.05, b + (b - a) * 0.04, C.white, 2.4);
      if (S.m === 'M') for (let i = 0; i < n; i++) d2Dot(ctx, xf, a + (i + 0.5) * dx, f(a + (i + 0.5) * dx), 2.6, C.yellow, { glow: false });
      /* the estimate */
      let est = 0;
      if (S.m === 'L') for (let i = 0; i < n; i++) est += f(a + i * dx) * dx;
      else if (S.m === 'R') for (let i = 1; i <= n; i++) est += f(a + i * dx) * dx;
      else if (S.m === 'M') for (let i = 0; i < n; i++) est += f(a + (i + 0.5) * dx) * dx;
      else if (S.m === 'T') { for (let i = 0; i <= n; i++) est += f(a + i * dx) * (i === 0 || i === n ? 1 : 2); est *= dx / 2; }
      else { for (let i = 0; i <= n; i++) est += f(a + i * dx) * (i === 0 || i === n ? 1 : (i % 2 ? 4 : 2)); est *= dx / 3; }
      const ex = simpsonExact(f, a, b), err = est - ex;
      const name = { L: 'left endpoints L_n', R: 'right endpoints R_n', M: 'midpoints M_n', T: 'trapezoids T_n', S: 'Simpson S_n (n even)' }[S.m];
      const F = fs(H);
      d2Panel(ctx, [
        [D.lab, C.text, true],
        [`${name},  n = ${n}`, C.blue],
        [`estimate = ${fmt(est, 5)},  exact = ${fmt(ex, 5)}`, C.text],
        [`error = estimate − exact = ${fmt(err, 5)}`, Math.abs(err) < 5e-6 ? C.dim : (err > 0 ? C.red : C.green)],
        ['red: shape above the curve (over),  green: below (under)', C.dim],
      ], 8, 8, F);
    },
  },

  /* improper integrals of x^{-p}: type 1 on [1, b], type 2 on [t, 1] */
  improper: {
    state: { kind: 1, p: 2, s: 0.8 },
    controls: [
      { type: 'buttons', key: 'kind', value: 1, options: [[1, 'type 1: [1, <i>b</i>]'], [2, 'type 2: [<i>t</i>, 1]']] },
      { type: 'range', key: 'p', label: '<i>p</i>', min: 0.3, max: 2.5, step: 0.05, value: 2, fmt: v => v.toFixed(2) },
      { type: 'range', key: 's', label: 'push the bound', min: 0, max: 3, step: 0.01, value: 0.8, fmt: v => '' },
    ],
    draw(ctx, W, H, t, S) {
      const p = S.p, f = x => Math.pow(x, -p), one = Math.abs(p - 1) < 0.026;
      const F = fs(H);
      let xf, val, lim, bnd, lines;
      if (S.kind === 1) {
        const b = Math.pow(10, S.s);
        xf = makeXf(W, H, -0.4, 10.6, -0.25, 2.4, { equal: false });
        const vb = Math.min(b, 10.6);
        const pts = [[1, 0]]; for (let i = 0; i <= 200; i++) { const x = 1 + (vb - 1) * i / 200; pts.push([x, f(x)]); } pts.push([vb, 0]);
        d2Poly(ctx, xf, pts, 'rgba(255,167,90,0.38)');
        d2Axes(ctx, xf);
        d2Ticks(ctx, xf, H, [[1, '1'], [5, '5'], [10, '10']]);
        plotFn(ctx, xf, f, 0.05, 10.6, C.blue, 2.5, { N: 800 });
        if (b <= 10.6) d2Seg(ctx, xf, b, 0, b, f(b), C.orange, 2);
        else { const [px, py] = xf(10.2, 0.35); d2Text(ctx, '→', px, py, C.orange, F * 1.3, { bold: true }); }
        val = one ? Math.log(b) : (Math.pow(b, 1 - p) - 1) / (1 - p);
        lim = p > 1 && !one ? 1 / (p - 1) : Infinity;
        bnd = `b = ${b < 100 ? b.toFixed(2) : b.toFixed(0)}`;
        lines = [[`∫_1^b x^{−p} dx = ${fmt(val)}`, C.orange]];
      } else {
        const tt = Math.pow(10, -S.s);
        xf = makeXf(W, H, -0.12, 2.2, -0.5, 7.5, { equal: false });
        const pts = [[tt, 0]]; for (let i = 0; i <= 300; i++) { const x = tt + (1 - tt) * (i / 300) ** 2; pts.push([x, Math.min(f(x), 30)]); } pts.push([1, 0]);
        d2Poly(ctx, xf, pts, 'rgba(255,167,90,0.38)');
        d2Axes(ctx, xf);
        d2Ticks(ctx, xf, H, [[1, '1'], [2, '2']]);
        plotFn(ctx, xf, f, 0.002, 2.2, C.blue, 2.5, { N: 1500 });
        d2Seg(ctx, xf, tt, 0, tt, Math.min(f(tt), 30), C.orange, 2);
        val = one ? -Math.log(tt) : (1 - Math.pow(tt, 1 - p)) / (1 - p);
        lim = p < 1 && !one ? 1 / (1 - p) : Infinity;
        bnd = `t = ${tt >= 0.01 ? tt.toFixed(3) : tt.toExponential(1)}`;
        lines = [[`∫_t^1 x^{−p} dx = ${fmt(val)}`, C.orange]];
      }
      d2Panel(ctx, [
        [`y = 1/x^p,   p = ${one ? '1' : p.toFixed(2)},   ${bnd}`, C.blue, true],
        ...lines,
        isFinite(lim) ? [`limit: converges to ${fmt(lim)}`, C.green, true] : ['limit: diverges to ∞', C.red, true],
      ], W - 8, 8, F, { right: true });
    },
  },

  /* comparison: e^{-x^2} <= e^{-x} on [1, oo) */
  comparison: (ctx, W, H, t) => {
    const xf = makeXf(W, H, -0.25, 4.3, -0.12, 1.45, { equal: false });
    const up = [[1, 0]], lo = [[1, 0]];
    for (let i = 0; i <= 200; i++) { const x = 1 + 3.3 * i / 200; up.push([x, Math.exp(-x)]); lo.push([x, Math.exp(-x * x)]); }
    up.push([4.3, 0]); lo.push([4.3, 0]);
    d2Poly(ctx, xf, up, 'rgba(255,167,90,0.28)');
    d2Poly(ctx, xf, lo, 'rgba(79,195,247,0.45)');
    d2Axes(ctx, xf);
    d2Ticks(ctx, xf, H, [[1, '1'], [2, '2'], [3, '3'], [4, '4']], [[1, '1']]);
    plotFn(ctx, xf, x => Math.exp(-x), 0, 4.3, C.orange, 2.4);
    plotFn(ctx, xf, x => Math.exp(-x * x), 0, 4.3, C.blue, 2.4);
    const F = fs(H);
    d2Panel(ctx, [
      ['0 ≤ e^{−x²} ≤ e^{−x}  for x ≥ 1', C.text, true],
      ['orange area: ∫_1^∞ e^{−x} dx = 1/e, finite', C.orange],
      ['blue area sits inside it, so ∫_1^∞ e^{−x²} dx converges', C.blue],
    ], W - 8, 8, F, { right: true });
  },

  /* ---------- Chapter 9 ---------- */

  /* slope field of y' = x + y with Euler steps and the true solution */
  euler: {
    state: { x0: 0, y0: 1, h: 0.5 },
    controls: [{ type: 'range', key: 'h', label: 'step <i>h</i>', min: 0.05, max: 1, step: 0.05, value: 0.5, fmt: v => v.toFixed(2) }],
    handles: S => [{ x: S.x0, y: S.y0, set: (x, y) => { S.x0 = clamp(x, -3, 1); S.y0 = clamp(y, -2.4, 4.5); } }],
    draw(ctx, W, H, t, S) {
      const Fd = (x, y) => x + y;
      const xf = makeXf(W, H, -3.2, 1.7, -2.6, 5.4); S.xf = xf;
      d2Axes(ctx, xf);
      slopeField(ctx, xf, Fd, 0.4);
      const { x0, y0, h } = S, K = y0 + x0 + 1;
      const exact = x => K * Math.exp(x - x0) - x - 1;
      plotFn(ctx, xf, exact, -3.5, x0, 'rgba(91,214,160,0.35)', 2);
      plotFn(ctx, xf, exact, x0, 1.8, C.green, 2.6);
      const pts = [[x0, y0]]; let x = x0, y = y0;
      while (x + h <= 1.5 + 1e-9 && Math.abs(y) < 50) { y += h * Fd(x, y); x += h; pts.push([x, y]); }
      d2Path(ctx, xf, pts, C.orange, 2.2);
      for (const [a, b] of pts.slice(1)) d2Dot(ctx, xf, a, b, 3, C.orange, { glow: false });
      d2Dot(ctx, xf, x0, y0, 5.5, C.yellow, { ring: true });
      const [xe, ye] = pts[pts.length - 1];
      const F = fs(H);
      d2Panel(ctx, [
        ["y' = x + y", C.text, true],
        [`start (x_0, y_0) = (${fmt(x0, 2)}, ${fmt(y0, 2)}),  h = ${h.toFixed(2)}`, C.yellow],
        [`Euler at x = ${fmt(xe, 2)}:  y ≈ ${fmt(ye)}`, C.orange],
        [`exact:  y = ${fmt(exact(xe))}`, C.green],
        ['drag the yellow start point', C.dim],
      ], 8, 8, F);
    },
  },

  /* y' = -x/y: separable, implicit solutions are circles */
  circles: {
    state: { px: 1.2, py: 1.6 },
    handles: S => [{ x: S.px, y: S.py, set: (x, y) => { S.px = clamp(x, -2.8, 2.8); S.py = Math.abs(y) < 0.08 ? (y < 0 ? -0.08 : 0.08) : clamp(y, -2.8, 2.8); } }],
    draw(ctx, W, H, t, S) {
      const xf = makeXf(W, H, -3.1, 3.1, -3.1, 3.1); S.xf = xf;
      d2Axes(ctx, xf);
      slopeField(ctx, xf, (x, y) => (Math.abs(y) < 1e-9 ? Infinity : -x / y), 0.4);
      const r2 = S.px * S.px + S.py * S.py, r = Math.sqrt(r2), up = S.py > 0;
      const half = (sg, col, lw, dash) => { const pts = []; for (let i = 0; i <= 200; i++) { const u = PI * i / 200; pts.push([r * Math.cos(u), sg * r * Math.sin(u)]); } d2Path(ctx, xf, pts, col, lw, dash); };
      half(up ? -1 : 1, 'rgba(91,214,160,0.3)', 1.6, [5, 5]);
      half(up ? 1 : -1, C.green, 2.8);
      d2Dot(ctx, xf, S.px, S.py, 5.5, C.yellow, { ring: true });
      const F = fs(H);
      d2Panel(ctx, [
        ['dy/dx = −x/y', C.text, true],
        ['separate:  y dy = −x dx', C.text],
        ['integrate:  y²/2 = −x²/2 + C', C.text],
        [`through (${fmt(S.px, 2)}, ${fmt(S.py, 2)}):  x² + y² = ${fmt(r2, 2)}`, C.green],
        [`solution: y = ${up ? '' : '−'}√(${fmt(r2, 2)} − x²)`, C.green, true],
        ['drag the point', C.dim],
      ], 8, 8, F);
    },
  },

  /* logistic solutions for several P(0), carrying capacity M = 10 */
  logistic: {
    state: { k: 0.8, P0: 1.5 },
    controls: [
      { type: 'range', key: 'k', label: '<i>k</i>', min: 0.2, max: 2, step: 0.05, value: 0.8, fmt: v => v.toFixed(2) },
      { type: 'range', key: 'P0', label: '<i>P</i>(0)', min: 0.2, max: 18, step: 0.1, value: 1.5, fmt: v => v.toFixed(1) },
    ],
    draw(ctx, W, H, t, S) {
      const M = 10, k = S.k;
      const xf = makeXf(W, H, -0.5, 12.5, -1.2, 25, { equal: false }); S.xf = xf;
      d2Axes(ctx, xf);
      d2Ticks(ctx, xf, H, [[4, '4'], [8, '8'], [12, '12']], [[5, '5'], [10, '10'], [20, '20']]);
      hLine(ctx, xf, M, 'rgba(91,214,160,0.7)', [6, 4], 1.4);
      hLine(ctx, xf, M / 2, 'rgba(255,209,102,0.45)', [3, 5], 1.2);
      const sol = P0 => x => M / (1 + (M - P0) / P0 * Math.exp(-k * x));
      for (const q of [0.4, 1, 3, 7, 13, 18]) plotFn(ctx, xf, sol(q), 0, 12.5, C.faint, 1.5);
      plotFn(ctx, xf, sol(S.P0), 0, 12.5, C.blue, 2.8);
      d2Dot(ctx, xf, 0, S.P0, 5, C.blue, { ring: true });
      const Aval = (M - S.P0) / S.P0;
      if (S.P0 < M / 2) { const ts = Math.log(Aval) / k; if (ts <= 12.5) d2Dot(ctx, xf, ts, M / 2, 5, C.yellow); }
      const F = fs(H);
      d2Panel(ctx, [
        ['dP/dt = kP(1 − P/M),   M = 10', C.text, true],
        [`P(t) = M / (1 + A e^{−kt}),   A = (M − P_0)/P_0 = ${fmt(Aval, 2)}`, C.blue],
        ['green: equilibrium P = M.   yellow: P = M/2, fastest growth', C.dim],
      ], W - 8, 8, F, { right: true });
    },
  },

  /* dP/dt versus P for the logistic equation, with flow arrows */
  logisticRate: (ctx, W, H, t) => {
    const k = 0.8, M = 10, g = P => k * P * (1 - P / M);
    const xf = makeXf(W, H, -1.2, 14.5, -2.6, 3.3, { equal: false });
    d2Axes(ctx, xf);
    d2Ticks(ctx, xf, H, [[5, 'M/2'], [10, 'M']]);
    plotFn(ctx, xf, g, -0.8, 14.5, C.purple, 2.6);
    for (const P of [1.5, 3.5, 6.5, 8.5, 12, 13.8]) {
      const v = g(P), d = v > 0 ? 0.6 : -0.6;
      d2Arrow(ctx, xf, P - d / 2, 0, P + d / 2, 0, v > 0 ? C.green : C.red, 2.5);
    }
    /* moving tracers obeying the equation */
    for (const P0 of [0.6, 13.5]) {
      let P = P0; const T = 9 * t, n = 90;
      for (let i = 0; i < n; i++) P += (T / n) * g(P);
      d2Dot(ctx, xf, P, 0, 4.5, C.yellow);
    }
    d2Dot(ctx, xf, 0, 0, 5, C.text, { hollow: true });
    d2Dot(ctx, xf, M, 0, 5.5, C.green);
    const F = fs(H);
    d2Panel(ctx, [
      ['height = dP/dt = kP(1 − P/M)', C.purple, true],
      ['above the axis P increases, below it P decreases', C.text],
      ['P = 0 repels (hollow), P = M attracts (filled)', C.dim],
    ], W - 8, 8, F, { right: true });
  },

  /* ---------- Chapter 11 ---------- */

  /* the definition of a limit of a sequence with an epsilon band */
  seqLimit: {
    state: { sq: 'e', eps: 0.1 },
    controls: [
      { type: 'buttons', key: 'sq', value: 'e', options: [['e', '(1 + 1/<i>n</i>)<sup><i>n</i></sup>'], ['alt', '(−1)<sup><i>n</i></sup>/<i>n</i>'], ['rat', '<i>n</i>/(<i>n</i>+1)'], ['osc', '(−1)<sup><i>n</i></sup>']] },
      { type: 'range', key: 'eps', label: 'ε', min: 0.02, max: 0.5, step: 0.01, value: 0.1, fmt: v => v.toFixed(2) },
    ],
    draw(ctx, W, H, t, S) {
      const D = {
        e: { a: n => (1 + 1 / n) ** n, L: Math.E, Ls: 'e', lab: 'a_n = (1 + 1/n)^n → e', y: [1.85, 2.85] },
        alt: { a: n => (-1) ** n / n, L: 0, Ls: '0', lab: 'a_n = (−1)^n/n → 0', y: [-1.1, 0.6] },
        rat: { a: n => n / (n + 1), L: 1, Ls: '1', lab: 'a_n = n/(n + 1) → 1', y: [0.4, 1.15] },
        osc: { a: n => (-1) ** n, L: 1, Ls: '1?', lab: 'a_n = (−1)^n has no limit', y: [-1.4, 1.4] },
      }[S.sq];
      const eps = S.eps, [y0, y1] = D.y;
      const xf = makeXf(W, H, -1, 41, y0, y1 + (y1 - y0) * 0.75, { equal: false }); S.xf = xf;
      const B = visBounds(xf);
      d2Poly(ctx, xf, [[B.x0, D.L - eps], [B.x1, D.L - eps], [B.x1, D.L + eps], [B.x0, D.L + eps]], 'rgba(91,214,160,0.13)');
      d2Axes(ctx, xf, { yaxis: false });
      hLine(ctx, xf, D.L, 'rgba(91,214,160,0.8)', [6, 4], 1.2);
      hLine(ctx, xf, D.L + eps, 'rgba(91,214,160,0.35)', [2, 4], 1);
      hLine(ctx, xf, D.L - eps, 'rgba(91,214,160,0.35)', [2, 4], 1);
      let N = 1;
      for (let n = 1; n <= 4000; n++) if (Math.abs(D.a(n) - D.L) >= eps) N = n + 1;
      const conv = S.sq !== 'osc';
      if (conv && N <= 40) {
        const [px] = xf(N - 0.5, 0); /* first index in the band is N, so n > N - 1 */ ctx.save(); ctx.strokeStyle = C.yellow; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(px, xf.box[1] + H * 0.3); ctx.lineTo(px, H - 6); ctx.stroke(); ctx.restore();
      }
      for (let n = 1; n <= 40; n++) {
        const v = D.a(n), ok = Math.abs(v - D.L) < eps;
        d2Dot(ctx, xf, n, v, 3.2, ok ? C.green : C.red, { glow: false });
      }
      const F = fs(H);
      d2Panel(ctx, [
        [D.lab, C.text, true],
        [`band: |a_n − ${D.Ls}| < ε = ${eps.toFixed(2)}`, C.green],
        conv ? [`every term with n > N = ${N - 1} is in the band`, C.yellow] : ['for ε < 1 no N works, for any candidate L', C.red],
        ['shrink ε: N grows but always exists (if a_n → L)', C.dim],
      ], 8, 8, F);
    },
  },

  /* partial sums s_N of several series */
  partialSums: {
    state: { sr: 'geo', N: 10 },
    controls: [
      { type: 'buttons', key: 'sr', value: 'geo', options: [['geo', '1/2<sup><i>n</i></sup>'], ['tel', '1/(<i>n</i>(<i>n</i>+1))'], ['har', '1/<i>n</i>'], ['p2', '1/<i>n</i><sup>2</sup>'], ['alt', '(−1)<sup><i>n</i>+1</sup>/<i>n</i>']] },
      { type: 'range', key: 'N', label: '<i>N</i>', min: 1, max: 60, step: 1, value: 10 },
    ],
    draw(ctx, W, H, t, S) {
      const D = {
        geo: { a: n => 0.5 ** n, S: 1, lab: 'Σ_{n≥1} 1/2^n   geometric, r = 1/2', note: 's_N = 1 − 1/2^N → 1' },
        tel: { a: n => 1 / (n * (n + 1)), S: 1, lab: 'Σ_{n≥1} 1/(n(n + 1))   telescoping', note: 's_N = 1 − 1/(N + 1) → 1' },
        har: { a: n => 1 / n, S: Infinity, lab: 'Σ_{n≥1} 1/n   harmonic', note: 'a_n → 0, but s_N → ∞ (slowly)' },
        p2: { a: n => 1 / (n * n), S: PI * PI / 6, lab: 'Σ_{n≥1} 1/n^2   p-series, p = 2', note: 's_N → π²/6' },
        alt: { a: n => (-1) ** (n + 1) / n, S: Math.LN2, lab: 'Σ_{n≥1} (−1)^{n+1}/n   alternating harmonic', note: 's_N → ln 2' },
      }[S.sr];
      const s = [0]; for (let n = 1; n <= 60; n++) s.push(s[n - 1] + D.a(n));
      let ymax = 0, ymin = 0; for (let n = 1; n <= 60; n++) { ymax = Math.max(ymax, s[n], D.a(n)); ymin = Math.min(ymin, s[n], D.a(n)); }
      if (isFinite(D.S)) ymax = Math.max(ymax, D.S);
      const xmax = Math.max(12, S.N + 2), xs = xmax / 1.025;
      const xf = makeXf(W, H, -0.025 * xmax, xmax, ymin - 0.08 * ymax, ymax * 1.65, { equal: false }); S.xf = xf;
      d2Axes(ctx, xf);
      const tstep = xmax <= 25 ? 5 : 10, tk = []; for (let k = tstep; k < xs; k += tstep) tk.push([k, String(k)]);
      d2Ticks(ctx, xf, H, tk, [[1, '1']]);
      if (isFinite(D.S)) hLine(ctx, xf, D.S, 'rgba(91,214,160,0.8)', [6, 4], 1.3);
      for (let n = 1; n <= S.N; n++) { const [x0, ya] = xf(n - 0.3, D.a(n)), [x1, yb] = xf(n + 0.3, 0); ctx.fillStyle = 'rgba(192,138,240,0.6)'; ctx.fillRect(x0, Math.min(ya, yb), x1 - x0, Math.abs(yb - ya)); }
      d2Path(ctx, xf, s.slice(1, S.N + 1).map((v, i) => [i + 1, v]), 'rgba(79,195,247,0.5)', 1.2);
      for (let n = 1; n <= S.N; n++) d2Dot(ctx, xf, n, s[n], n === S.N ? 5 : 2.8, n === S.N ? C.yellow : C.blue, { glow: n === S.N });
      const F = fs(H);
      d2Panel(ctx, [
        [D.lab, C.text, true],
        [`N = ${S.N}:   s_N = ${fmt(s[S.N], 5)}`, C.yellow],
        [D.note, C.green],
        isFinite(D.S) ? [`S − s_N = ${fmt(D.S - s[S.N], 5)}`, C.dim] : ['no finite S: the dots climb past any height', C.red],
        ['purple bars: the terms a_n.   blue dots: s_n', C.dim],
      ], W - 8, 8, F, { right: true });
    },
  },

  /* integral test: rectangles of height 1/n^p under and over y = 1/x^p */
  integralTest: {
    state: { p: 1.5, side: 'under' },
    controls: [
      { type: 'range', key: 'p', label: '<i>p</i>', min: 0.5, max: 3, step: 0.05, value: 1.5, fmt: v => v.toFixed(2) },
      { type: 'buttons', key: 'side', value: 'under', options: [['under', 'rectangles under'], ['over', 'rectangles over']] },
    ],
    draw(ctx, W, H, t, S) {
      const p = S.p, f = x => x ** -p;
      const xf = makeXf(W, H, -0.4, 12.6, -0.12, 1.9, { equal: false }); S.xf = xf;
      const pts = [[1, 0]]; for (let i = 0; i <= 200; i++) { const x = 1 + 11.6 * i / 200; pts.push([x, f(x)]); } pts.push([12.6, 0]);
      d2Poly(ctx, xf, pts, 'rgba(79,195,247,0.18)');
      for (let n = 1; n <= 12; n++) {
        const [x0, x1] = S.side === 'under' ? [n - 1, n] : [n, n + 1];
        if (S.side === 'under' && n === 1) continue;
        d2Poly(ctx, xf, [[x0, 0], [x1, 0], [x1, f(n)], [x0, f(n)]], S.side === 'under' ? 'rgba(91,214,160,0.45)' : 'rgba(255,107,107,0.4)');
        d2Path(ctx, xf, [[x0, 0], [x0, f(n)], [x1, f(n)], [x1, 0]], S.side === 'under' ? C.green : C.red, 1.2);
      }
      d2Axes(ctx, xf);
      d2Ticks(ctx, xf, H, [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [6, '6'], [8, '8'], [10, '10'], [12, '12']], [[1, '1']]);
      plotFn(ctx, xf, f, 0.55, 12.6, C.white, 2.4);
      const F = fs(H), conv = p > 1.0001;
      d2Panel(ctx, [
        [`a_n = 1/n^p,   f(x) = 1/x^p,   p = ${p.toFixed(2)}`, C.text, true],
        S.side === 'under' ? ['a_2 + a_3 + ⋯ ≤ ∫_1^∞ f(x) dx', C.green] : ['∫_1^∞ f(x) dx ≤ a_1 + a_2 + ⋯', C.red],
        conv ? [`p > 1: ∫_1^∞ f dx = 1/(p − 1) = ${fmt(1 / (p - 1))}, series converges`, C.blue, true]
             : ['p ≤ 1: ∫_1^∞ f dx = ∞, series diverges', C.orange, true],
      ], W - 8, 8, F, { right: true });
    },
  },

  /* alternating series: partial sums bracket the sum */
  alternating: {
    state: { sr: 'h', N: 5 },
    controls: [
      { type: 'buttons', key: 'sr', value: 'h', options: [['h', '1/<i>n</i>'], ['sq', '1/<i>n</i><sup>2</sup>'], ['f', '1/<i>n</i>!']] },
      { type: 'range', key: 'N', label: '<i>N</i>', min: 1, max: 30, step: 1, value: 5 },
    ],
    draw(ctx, W, H, t, S) {
      const D = {
        h: { b: n => 1 / n, S: Math.LN2, lab: 'Σ (−1)^{n−1}/n = ln 2' },
        sq: { b: n => 1 / (n * n), S: PI * PI / 12, lab: 'Σ (−1)^{n−1}/n^2 = π²/12' },
        f: { b: n => 1 / fact(n), S: 1 - 1 / Math.E, lab: 'Σ (−1)^{n−1}/n! = 1 − 1/e' },
      }[S.sr];
      const s = [0]; for (let n = 1; n <= 31; n++) s.push(s[n - 1] + (-1) ** (n - 1) * D.b(n));
      const xf = makeXf(W, H, -0.8, 31, 0.32, 1.55, { equal: false }); S.xf = xf;
      d2Axes(ctx, xf, { yaxis: false });
      d2Ticks(ctx, xf, H, []);
      hLine(ctx, xf, D.S, 'rgba(91,214,160,0.85)', [6, 4], 1.3);
      const N = S.N, lo = Math.min(s[N], s[N + 1]), hi = Math.max(s[N], s[N + 1]);
      const B = visBounds(xf);
      d2Poly(ctx, xf, [[B.x0, lo], [B.x1, lo], [B.x1, hi], [B.x0, hi]], 'rgba(255,209,102,0.12)');
      d2Path(ctx, xf, s.slice(1, 31).map((v, i) => [i + 1, v]), C.ghost, 1);
      d2Path(ctx, xf, s.slice(1, N + 1).map((v, i) => [i + 1, v]), 'rgba(79,195,247,0.7)', 1.4);
      for (let n = 1; n <= 30; n++) d2Dot(ctx, xf, n, s[n], n === N ? 5 : 2.8, n <= N ? (n === N ? C.yellow : C.blue) : C.faint, { glow: n === N });
      d2Seg(ctx, xf, N + 0.6, s[N], N + 0.6, s[N + 1], C.yellow, 2.5);
      const F = fs(H);
      d2Panel(ctx, [
        [D.lab, C.text, true],
        [`N = ${N}:   s_N = ${fmt(s[N], 5)}`, C.yellow],
        [`actual error |S − s_N| = ${fmt(Math.abs(D.S - s[N]), 5)}`, C.text],
        [`bound b_{N+1} = ${fmt(D.b(N + 1), 5)}`, C.yellow],
        ['yellow band: S lies between s_N and s_{N+1}', C.dim],
      ], W - 8, 8, F, { right: true });
    },
  },

  /* interval of convergence on a number line, partial sums at a dragged x */
  powerInterval: {
    state: { ps: 'a', x: 0.5 },
    controls: [{ type: 'buttons', key: 'ps', value: 'a', options: [['a', '<i>x<sup>n</sup></i>/<i>n</i>'], ['b', '<i>x<sup>n</sup></i>/<i>n</i><sup>2</sup>'], ['c', '(<i>x</i>−2)<sup><i>n</i></sup>/3<sup><i>n</i></sup>'], ['d', '<i>x<sup>n</sup></i>/<i>n</i>!'], ['e', '<i>n</i>! <i>x<sup>n</sup></i>']], onChange: S => { S.x = 0.5; } }],
    handles: S => [{ x: S.x, y: 0, xf: S.xfN, set: x => {
      const D = PSER[S.ps]; let v = clamp(x, -5.8, 5.8);
      for (const e of [D.a - D.R, D.a + D.R]) if (isFinite(e) && Math.abs(v - e) < 0.08) v = e;
      if (Math.abs(v - D.a) < 0.06) v = D.a;
      S.x = v; } }],
    draw(ctx, W, H, t, S) {
      const D = PSER[S.ps], F = fs(H);
      const top = 3 * F * 1.42 + 18;
      const xfN = frameXf(14, top, W - 28, 2.6 * F, -6, 6, -1, 1, false); S.xfN = xfN; S.xf = xfN;
      const [, ny] = xfN(0, 0);
      ctx.save(); ctx.strokeStyle = '#6b6f78'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(10, ny); ctx.lineTo(W - 10, ny); ctx.stroke(); ctx.restore();
      for (let k = -6; k <= 6; k++) { const [px] = xfN(k, 0); ctx.strokeStyle = '#6b6f78'; ctx.beginPath(); ctx.moveTo(px, ny - 4); ctx.lineTo(px, ny + 4); ctx.stroke(); d2Text(ctx, String(k).replace('-', '−'), px, ny + 8, C.dim, F * 0.78, { align: 'center' }); }
      const lo = Math.max(-6.3, D.a - D.R), hi = Math.min(6.3, D.a + D.R);
      if (D.R > 0) {
        const [p0] = xfN(lo, 0), [p1] = xfN(hi, 0);
        ctx.save(); ctx.strokeStyle = C.green; ctx.lineWidth = 6; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(p0, ny); ctx.lineTo(p1, ny); ctx.stroke(); ctx.restore();
        if (isFinite(D.R)) { d2Dot(ctx, xfN, D.a - D.R, 0, 6, C.green, { hollow: !D.ends[0], glow: false }); d2Dot(ctx, xfN, D.a + D.R, 0, 6, C.green, { hollow: !D.ends[1], glow: false }); }
      } else d2Dot(ctx, xfN, D.a, 0, 5, C.green, { glow: false });
      const [ax] = xfN(D.a, 0); d2Text(ctx, 'a', ax, ny - F * 1.5, C.green, F * 0.9, { align: 'center', bold: true });
      d2Dot(ctx, xfN, S.x, 0, 6.5, C.yellow, { ring: true });
      /* partial sums at x */
      const x = S.x, sN = []; let sum = 0;
      for (let n = D.n0; n <= D.n0 + 30; n++) { sum += D.c(n) * (x - D.a) ** n; sN.push(sum); }
      const dist = Math.abs(x - D.a), end = isFinite(D.R) && D.R > 0 && Math.abs(dist - D.R) < 1e-9;
      const conv = dist < D.R - 1e-9 || (end && D.ends[x < D.a ? 0 : 1]) || dist < 1e-12;
      const finite = sN.filter(isFinite);
      let y0 = Math.min(...finite), y1 = Math.max(...finite);
      y0 = Math.max(y0, -6); y1 = Math.min(y1, 6); if (y1 - y0 < 1) { y0 -= 0.5; y1 += 0.5; }
      const pTop = top + 3.6 * F, xfP = frameXf(40, pTop, W - 56, H - pTop - 1.8 * F, -0.5, 31, y0 - 0.08 * (y1 - y0), y1 + 0.08 * (y1 - y0), false);
      d2Axes(ctx, xfP, { yaxis: false, grid: false });
      if (conv && D.sum) { const L = D.sum(x); if (isFinite(L)) hLine(ctx, xfP, L, 'rgba(91,214,160,0.75)', [6, 4], 1.2); }
      sN.forEach((v, i) => {
        const yc = clamp(v, y0 - 0.06 * (y1 - y0), y1 + 0.06 * (y1 - y0));
        d2Dot(ctx, xfP, i, isFinite(yc) ? yc : (v > 0 ? y1 : y0), 2.8, conv ? C.blue : C.red, { glow: false });
      });
      d2Math(ctx, 'partial sums s_N(x),  N = 0, 1, …, 30', 44, H - 1.5 * F, C.dim, F * 0.8);
      const verdict = dist < 1e-12 ? 'x = a: every power series converges at its center'
        : dist < D.R - 1e-9 ? '|x − a| < R: converges (absolutely)'
        : end ? `endpoint: test separately → ${D.ends[x < D.a ? 0 : 1] ? 'converges' : 'diverges'}`
        : '|x − a| > R: terms do not → 0, diverges';
      d2Panel(ctx, [
        [`${D.lab},   a = ${D.a},   R = ${isFinite(D.R) ? D.R : '∞'},   interval ${D.I}`, C.text, true],
        [`x = ${fmt(x, 2)}`, C.yellow],
        [verdict, conv ? C.green : C.red],
      ], 8, 6, F);
    },
  },

  /* Taylor polynomials with a degree slider and a probe point */
  taylor: {
    state: { tf: 'sin', n: 3, x: 2 },
    controls: [
      { type: 'buttons', key: 'tf', value: 'sin', options: [['sin', 'sin <i>x</i>'], ['cos', 'cos <i>x</i>'], ['exp', '<i>e<sup>x</sup></i>'], ['ln', 'ln(1+<i>x</i>)'], ['geo', '1/(1−<i>x</i>)'], ['atan', 'tan<sup>−1</sup><i>x</i>']], onChange: S => { if (S.tf === 'ln' || S.tf === 'geo' || S.tf === 'atan') S.x = 0.6; } },
      { type: 'range', key: 'n', label: 'degree <i>n</i>', min: 0, max: 20, step: 1, value: 3 },
    ],
    handles: S => [{ x: S.x, y: 0, set: x => { S.x = clamp(x, -6.2, 6.2); } }],
    draw(ctx, W, H, t, S) {
      const D = TAY[S.tf], n = S.n;
      const T = x => { let s = 0, p = 1; for (let k = 0; k <= n; k++) { s += D.c(k) * p; p *= x; } return s; };
      const xf = makeXf(W, H, -6.6, 6.6, -3.4, 4.2); S.xf = xf;
      const B = visBounds(xf);
      if (isFinite(D.R)) {
        d2Poly(ctx, xf, [[B.x0, B.y0], [-D.R, B.y0], [-D.R, B.y1], [B.x0, B.y1]], 'rgba(255,107,107,0.08)');
        d2Poly(ctx, xf, [[D.R, B.y0], [B.x1, B.y0], [B.x1, B.y1], [D.R, B.y1]], 'rgba(255,107,107,0.08)');
      }
      d2Axes(ctx, xf);
      plotFn(ctx, xf, D.f, -7, 7, C.white, 2.4, { N: 1400 });
      plotFn(ctx, xf, T, -7, 7, C.blue, 2.4, { N: 1400 });
      const x = S.x, fx = D.f(x), tx = T(x);
      if (isFinite(fx)) d2Seg(ctx, xf, x, fx, x, clamp(tx, -50, 50), C.yellow, 2);
      if (isFinite(fx)) d2Dot(ctx, xf, x, fx, 4, C.white, { glow: false });
      d2Dot(ctx, xf, x, clamp(tx, -50, 50), 4, C.blue, { glow: false });
      d2Dot(ctx, xf, x, 0, 5.5, C.yellow, { ring: true });
      const F = fs(H);
      const lines = [
        [`f(x) = ${D.lab}   (white),   T_n(x) about 0 (blue),   n = ${n}`, C.text, true],
        [`at x = ${fmt(x, 2)}:  f = ${fmt(fx, 4)},  T_n = ${fmt(tx, 4)},  |R_n| = ${fmt(Math.abs(fx - tx), 4)}`, C.yellow],
      ];
      if (D.M) lines.push([`Taylor bound M|x|^{n+1}/(n+1)! = ${fmt(D.M(x) * Math.abs(x) ** (n + 1) / fact(n + 1), 4)}`, C.green]);
      else lines.push(['radius of convergence R = 1: outside (red) T_n does not settle', C.red]);
      lines.push(['drag the yellow point on the x-axis', C.dim]);
      d2Panel(ctx, lines, 8, 8, F);
    },
  },

  /* ---------- Complex numbers ---------- */

  /* multiplication: moduli multiply, arguments add */
  complexMult: {
    state: { zx: 1.4, zy: 0.6, wx: 0.5, wy: 1.2 },
    handles: S => {
      const lim = (x, y) => { const r = Math.hypot(x, y); return r > 1.8 ? [x * 1.8 / r, y * 1.8 / r] : [x, y]; };
      return [
        { x: S.zx, y: S.zy, set: (x, y) => { [S.zx, S.zy] = lim(x, y); } },
        { x: S.wx, y: S.wy, set: (x, y) => { [S.wx, S.wy] = lim(x, y); } },
      ];
    },
    draw(ctx, W, H, t, S) {
      const xf = makeXf(W, H, -3.4, 3.4, -3.3, 3.5); S.xf = xf;
      d2Axes(ctx, xf);
      const pts = []; for (let i = 0; i <= 120; i++) pts.push([Math.cos(2 * PI * i / 120), Math.sin(2 * PI * i / 120)]);
      d2Path(ctx, xf, pts, C.ghost, 1.3);
      const { zx, zy, wx, wy } = S, px = zx * wx - zy * wy, py = zx * wy + zy * wx;
      const az = Math.atan2(zy, zx), aw = Math.atan2(wy, wx);
      d2Arc(ctx, xf, 0, 0, 0.55, 0, az, C.blue, 2);
      d2Arc(ctx, xf, 0, 0, 0.75, 0, aw, C.orange, 2);
      d2Arc(ctx, xf, 0, 0, 0.95, 0, az + aw, C.green, 2);
      d2Arrow(ctx, xf, 0, 0, zx, zy, C.blue, 2.5);
      d2Arrow(ctx, xf, 0, 0, wx, wy, C.orange, 2.5);
      d2Arrow(ctx, xf, 0, 0, px, py, C.green, 3);
      d2Dot(ctx, xf, zx, zy, 5, C.blue, { ring: true }); d2Dot(ctx, xf, wx, wy, 5, C.orange, { ring: true });
      const F = fs(H);
      const lab = (s, x, y, col) => { const [a, b] = xf(x, y); d2Text(ctx, s, a + 7, b - F - 2, col, F, { bold: true }); };
      lab('z', zx, zy, C.blue); lab('w', wx, wy, C.orange); lab('zw', px, py, C.green);
      const rz = Math.hypot(zx, zy), rw = Math.hypot(wx, wy);
      d2Panel(ctx, [
        [`z = ${fmtC(zx, zy)},   w = ${fmtC(wx, wy)}`, C.text, true],
        [`zw = ${fmtC(px, py)}`, C.green, true],
        [`|z||w| = ${fmt(rz, 2)} · ${fmt(rw, 2)} = ${fmt(rz * rw, 2)} = |zw|`, C.text],
        [`arg z + arg w = ${deg(az)} + ${deg(aw)} = ${deg(az + aw)}`, C.text],
        ['drag z and w', C.dim],
      ], 8, 8, F);
    },
  },

  /* powers z^k (De Moivre) and nth roots */
  complexPowers: {
    state: { zx: 0.95, zy: 0.38, n: 6, mode: 'pow' },
    controls: [
      { type: 'buttons', key: 'mode', value: 'pow', options: [['pow', 'powers <i>z<sup>k</sup></i>'], ['root', '<i>n</i>th roots of <i>z</i>']] },
      { type: 'range', key: 'n', label: '<i>n</i>', min: 1, max: 12, step: 1, value: 6 },
    ],
    handles: S => [{ x: S.zx, y: S.zy, set: (x, y) => { const r = Math.hypot(x, y), m = S.mode === 'pow' ? 1.15 : 2.3; [S.zx, S.zy] = r > m ? [x * m / r, y * m / r] : [x, y]; } }],
    draw(ctx, W, H, t, S) {
      const xf = makeXf(W, H, -2.5, 2.5, -2.3, 2.7); S.xf = xf;
      d2Axes(ctx, xf);
      const circ = (R, col, lw, dash) => { const pts = []; for (let i = 0; i <= 160; i++) pts.push([R * Math.cos(2 * PI * i / 160), R * Math.sin(2 * PI * i / 160)]); d2Path(ctx, xf, pts, col, lw, dash); };
      circ(1, C.ghost, 1.3);
      let r = Math.hypot(S.zx, S.zy), th = Math.atan2(S.zy, S.zx);
      if (S.mode === 'pow' && r > 1.15) { S.zx *= 1.15 / r; S.zy *= 1.15 / r; r = 1.15; }
      const n = S.n, F = fs(H);
      if (S.mode === 'pow') {
        const pts = []; for (let k = 0; k <= n; k++) pts.push([r ** k * Math.cos(k * th), r ** k * Math.sin(k * th)]);
        d2Path(ctx, xf, pts, 'rgba(79,195,247,0.55)', 1.4);
        pts.forEach(([a, b], k) => { d2Dot(ctx, xf, a, b, k === n ? 5.5 : 3.2, k === n ? C.green : C.blue, { glow: k === n }); });
        d2Arrow(ctx, xf, 0, 0, pts[n][0], pts[n][1], C.green, 2);
        d2Dot(ctx, xf, S.zx, S.zy, 5.5, C.yellow, { ring: true });
        d2Panel(ctx, [
          [`z = r(cos θ + i sin θ),  r = ${fmt(r, 2)},  θ = ${deg(th)}`, C.yellow, true],
          [`z^n = r^n(cos nθ + i sin nθ),  n = ${n}`, C.green, true],
          [`r^n = ${fmt(r ** n, 3)},   nθ = ${deg(n * th)}`, C.green],
          ['blue dots: 1, z, z², …, z^n.  drag z', C.dim],
        ], 8, 8, F);
      } else {
        const R = r ** (1 / n);
        circ(R, 'rgba(255,167,90,0.45)', 1.2, [4, 4]);
        const pts = []; for (let k = 0; k < n; k++) { const a = (th + 2 * PI * k) / n; pts.push([R * Math.cos(a), R * Math.sin(a)]); }
        if (n > 2) d2Path(ctx, xf, [...pts, pts[0]], 'rgba(255,167,90,0.6)', 1.4);
        pts.forEach(([a, b], k) => d2Dot(ctx, xf, a, b, k === 0 ? 5 : 4, C.orange, { glow: k === 0 }));
        d2Arrow(ctx, xf, 0, 0, S.zx, S.zy, C.yellow, 2);
        d2Dot(ctx, xf, S.zx, S.zy, 5.5, C.yellow, { ring: true });
        d2Panel(ctx, [
          [`z = r(cos θ + i sin θ),  r = ${fmt(r, 2)},  θ = ${deg(th)}`, C.yellow, true],
          [`the ${n} values of z^{1/${n}}: radius r^{1/n} = ${fmt(R, 3)}`, C.orange, true],
          ['angles (θ + 2πk)/n,  k = 0, 1, …, n − 1', C.orange],
          ['they form a regular n-gon.  drag z', C.dim],
        ], 8, 8, F);
      }
    },
  },

  /* partial sums of the series for e^{i theta}, head to tail */
  eulerSeries: {
    state: { th: 2, N: 4 },
    controls: [
      { type: 'range', key: 'th', label: 'θ', min: 0, max: 6.28, step: 0.01, value: 2, fmt: v => v.toFixed(2) },
      { type: 'range', key: 'N', label: 'terms through <i>k</i> =', min: 0, max: 20, step: 1, value: 4 },
    ],
    draw(ctx, W, H, t, S) {
      const xf = makeXf(W, H, -3.6, 3.6, -3.6, 3.2); S.xf = xf;
      d2Axes(ctx, xf);
      const pts = []; for (let i = 0; i <= 160; i++) pts.push([Math.cos(2 * PI * i / 160), Math.sin(2 * PI * i / 160)]);
      d2Path(ctx, xf, pts, C.ghost, 1.4);
      const th = S.th, cols = [C.blue, C.orange, C.blue, C.orange];
      let x = 0, y = 0, mag = 1;
      for (let k = 0; k <= S.N; k++) {
        if (k > 0) mag *= th / k;
        const dir = [[1, 0], [0, 1], [-1, 0], [0, -1]][k % 4];
        const nx = x + mag * dir[0], ny = y + mag * dir[1];
        d2Arrow(ctx, xf, x, y, nx, ny, cols[k % 4], 2);
        x = nx; y = ny;
      }
      d2Dot(ctx, xf, Math.cos(th), Math.sin(th), 6, C.yellow, { ring: true });
      d2Dot(ctx, xf, x, y, 4, C.green);
      const F = fs(H);
      d2Panel(ctx, [
        ['e^{iθ} = Σ (iθ)^k/k! = 1 + iθ − θ²/2! − iθ³/3! + ⋯', C.text, true],
        [`partial sum through k = ${S.N}:  ${fmtC(x, y, 3)}`, C.green],
        [`cos θ + i sin θ = ${fmtC(Math.cos(th), Math.sin(th), 3)}   (yellow)`, C.yellow],
        ['blue steps: real terms (cos).  orange: imaginary (sin)', C.dim],
      ], 8, H - 4 * F * 1.42 - 16, F);
    },
  },
};

/* data tables used above */
const PSER = {
  a: { c: n => 1 / n, n0: 1, a: 0, R: 1, ends: [true, false], I: '[−1, 1)', lab: 'Σ_{n≥1} x^n/n', sum: x => -Math.log(1 - x) },
  b: { c: n => 1 / (n * n), n0: 1, a: 0, R: 1, ends: [true, true], I: '[−1, 1]', lab: 'Σ_{n≥1} x^n/n²', sum: null },
  c: { c: n => 1 / 3 ** n, n0: 0, a: 2, R: 3, ends: [false, false], I: '(−1, 5)', lab: 'Σ_{n≥0} (x − 2)^n/3^n', sum: x => 3 / (5 - x) },
  d: { c: n => 1 / fact(n), n0: 0, a: 0, R: Infinity, ends: [true, true], I: '(−∞, ∞)', lab: 'Σ_{n≥0} x^n/n!', sum: Math.exp },
  e: { c: n => fact(n), n0: 0, a: 0, R: 0, ends: [false, false], I: '{0}', lab: 'Σ_{n≥0} n! x^n', sum: null },
};
const TAY = {
  sin: { f: Math.sin, c: k => (k % 2 ? (-1) ** ((k - 1) / 2) / fact(k) : 0), lab: 'sin x', R: Infinity, M: () => 1 },
  cos: { f: Math.cos, c: k => (k % 2 ? 0 : (-1) ** (k / 2) / fact(k)), lab: 'cos x', R: Infinity, M: () => 1 },
  exp: { f: Math.exp, c: k => 1 / fact(k), lab: 'e^x', R: Infinity, M: x => Math.exp(Math.max(x, 0)) },
  ln: { f: x => (x > -1 ? Math.log(1 + x) : NaN), c: k => (k === 0 ? 0 : (-1) ** (k + 1) / k), lab: 'ln(1 + x)', R: 1, M: null },
  geo: { f: x => 1 / (1 - x), c: () => 1, lab: '1/(1 − x)', R: 1, M: null },
  atan: { f: Math.atan, c: k => (k % 2 ? (-1) ** ((k - 1) / 2) / k : 0), lab: 'tan⁻¹ x', R: 1, M: null },
};

export function initFigures() {
  const init = new WeakSet();
  const obs = new IntersectionObserver(es => {
    for (const e of es) if (e.isIntersecting && !init.has(e.target)) {
      const spec = FIGS2D[e.target.dataset.fig];
      if (spec) { build2D(e.target, spec); init.add(e.target); }
    }
  }, { rootMargin: '300px' });
  for (const c of document.querySelectorAll('canvas[data-fig]')) obs.observe(c);
}
