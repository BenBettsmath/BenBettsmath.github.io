/* Shared figure rendering for Calc I chapter pages.
   Every figure is a 2-D canvas animation (same loop and look as calc3_figs.js).
   A figure may declare a slider and/or option buttons. The slider animates on its
   own until the reader grabs it, then holds the reader's value. The play button
   resumes the animation.
   Each chapter page emits <canvas data-fig="name"></canvas> elements,
   then imports this module and calls initFigures(). */

/* ============================================================
   control row styling (injected once so chapter.css stays a copy of calc3's)
   ============================================================ */
function injectStyle() {
  if (document.getElementById('c1-fig-style')) return;
  const st = document.createElement('style');
  st.id = 'c1-fig-style';
  st.textContent = `
.c1-ctrl { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5em 0.8em; padding: 0.45em 0.7em; border-top: 1px solid #ddd; font-size: 0.88em; font-family: ui-sans-serif, system-ui, sans-serif; }
.c1-ctrl label { display: flex; align-items: center; gap: 0.5em; flex: 1 1 200px; }
.c1-ctrl input[type=range] { flex: 1 1 120px; min-width: 0; }
.c1-ctrl .c1-val { font-variant-numeric: tabular-nums; min-width: 3.5em; color: #333; }
.c1-ctrl button { font: inherit; font-size: 0.92em; padding: 0.12em 0.65em; border: 1px solid #bbb; border-radius: 3px; background: #fff; color: #333; cursor: pointer; }
.c1-ctrl button.on { background: #3a5a8a; border-color: #3a5a8a; color: #fff; }
.c1-ctrl .c1-opts { display: flex; gap: 0.3em; }
`;
  document.head.appendChild(st);
}

/* ============================================================
   2-D canvas infrastructure
   ============================================================ */

const tri = t => 0.5 - 0.5 * Math.cos(2 * Math.PI * t);         // 0 → 1 → 0 smoothly
const logLerp = (a, b, u) => a * Math.pow(b / a, u);

function build2D(canvas, spec) {
  if (typeof spec === 'function') spec = { draw: spec };
  const period = spec.period || 6000;
  if (spec.height) canvas.style.height = spec.height + 'px';
  const state = { auto: true, s: spec.slider ? spec.slider.value : 0, opt: 0 };
  let input = null, valSpan = null, playBtn = null;

  if (spec.slider || spec.options) {
    injectStyle();
    const row = document.createElement('div');
    row.className = 'c1-ctrl';
    if (spec.slider) {
      const sl = spec.slider;
      const lab = document.createElement('label');
      const name = document.createElement('span');
      name.textContent = sl.label;
      input = document.createElement('input');
      input.type = 'range';
      input.min = sl.min; input.max = sl.max; input.step = sl.step || (sl.max - sl.min) / 400;
      input.value = sl.value;
      valSpan = document.createElement('span');
      valSpan.className = 'c1-val';
      lab.append(name, input, valSpan);
      row.appendChild(lab);
      input.addEventListener('input', () => {
        state.auto = false; state.s = +input.value;
        playBtn.textContent = 'play'; playBtn.classList.remove('on');
      });
      playBtn = document.createElement('button');
      playBtn.type = 'button';
      playBtn.textContent = 'pause'; playBtn.classList.add('on');
      playBtn.addEventListener('click', () => {
        state.auto = !state.auto;
        playBtn.textContent = state.auto ? 'pause' : 'play';
        playBtn.classList.toggle('on', state.auto);
      });
      row.appendChild(playBtn);
    }
    if (spec.options) {
      const box = document.createElement('span');
      box.className = 'c1-opts';
      const btns = spec.options.map((o, i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = o;
        if (i === 0) b.classList.add('on');
        b.addEventListener('click', () => {
          state.opt = i;
          btns.forEach((bb, j) => bb.classList.toggle('on', j === i));
        });
        box.appendChild(b);
        return b;
      });
      row.appendChild(box);
    }
    canvas.insertAdjacentElement('afterend', row);
  }

  let start = null, grad = null, gradH = 0, gradW = 0, visible = true, lastShown = null;
  new IntersectionObserver(es => { for (const e of es) visible = e.isIntersecting; }).observe(canvas);
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    grad = null;
  }
  resize();
  new ResizeObserver(resize).observe(canvas);
  function frame(ts) {
    if (!visible) { start = null; requestAnimationFrame(frame); return; }
    if (!start) start = ts - (state.tOff || 0) * period;
    const t = ((ts - start) % period) / period;
    if (spec.slider && state.auto) {
      const sl = spec.slider;
      let v = sl.anim ? sl.anim(t) : sl.min + (sl.max - sl.min) * tri(t);
      if (sl.step >= 1) v = Math.round(v);
      state.s = v;
      input.value = v;
    }
    if (valSpan) {
      const txt = spec.slider.fmt ? spec.slider.fmt(state.s) : (+state.s).toFixed(2);
      if (txt !== lastShown) { valSpan.textContent = txt; lastShown = txt; }
    }
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    if (W === 0 || H === 0) { requestAnimationFrame(frame); return; }
    if (!grad || gradW !== W || gradH !== H) {
      grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#16171b');
      grad.addColorStop(1, '#0d0e11');
      gradW = W; gradH = H;
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    spec.draw(ctx, W, H, t, state);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* A panel maps a world rectangle into a pixel rectangle rect = [px, py, pw, ph].
   With equal: true both axes get the same scale (circles stay round). */
function panel(W, H, x0, x1, y0, y1, o = {}) {
  const r = o.rect || [0, 0, W, H];
  const pl = (o.padL ?? 0.07) * r[2], pr = (o.padR ?? 0.04) * r[2];
  const pt = (o.padT ?? 0.07) * r[3], pb = (o.padB ?? 0.09) * r[3];
  let sx = (r[2] - pl - pr) / (x1 - x0), sy = (r[3] - pt - pb) / (y1 - y0);
  if (o.equal) { const s = Math.min(sx, sy); sx = s; sy = s; }
  const cxp = r[0] + pl + (r[2] - pl - pr) / 2, cyp = r[1] + pt + (r[3] - pt - pb) / 2;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const f = (x, y) => [cxp + (x - mx) * sx, cyp - (y - my) * sy];
  f.inv = (px, py) => [mx + (px - cxp) / sx, my - (py - cyp) / sy];
  f.sx = sx; f.sy = sy; f.rect = r;
  f.fs = Math.max(11, Math.min(H * 0.046, W * 0.03));
  [f.vx0, f.vy1] = f.inv(r[0], r[1]);
  [f.vx1, f.vy0] = f.inv(r[0] + r[2], r[1] + r[3]);
  return f;
}

function niceStep(span, div = 8) {
  const raw = span / div;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  const m = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
  return m * pow;
}

function clip(ctx, f) {
  const r = f.rect;
  ctx.beginPath(); ctx.rect(r[0], r[1], r[2], r[3]); ctx.clip();
}

const fmtTick = (v, step) => {
  const d = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const s = v.toFixed(Math.min(d, 4));
  return s === '-0' ? '0' : s;
};

/* grid, axes, tick numbers. o.xl / o.yl axis names, o.ticks=false to hide numbers */
function axes(ctx, f, o = {}) {
  const r = f.rect;
  const fs = o.fs || f.fs * 0.85;
  ctx.save(); clip(ctx, f);
  const stepX = o.stepX || niceStep(f.vx1 - f.vx0, o.divX || 8);
  const stepY = o.stepY || niceStep(f.vy1 - f.vy0, o.divY || 6);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.beginPath();
  for (let gx = Math.ceil(f.vx0 / stepX) * stepX; gx <= f.vx1; gx += stepX) {
    const px = f(gx, 0)[0]; ctx.moveTo(px, r[1]); ctx.lineTo(px, r[1] + r[3]);
  }
  for (let gy = Math.ceil(f.vy0 / stepY) * stepY; gy <= f.vy1; gy += stepY) {
    const py = f(0, gy)[1]; ctx.moveTo(r[0], py); ctx.lineTo(r[0] + r[2], py);
  }
  ctx.stroke();
  // axis positions (pinned to the panel edge when 0 is off-screen)
  let [ox, oy] = f(0, 0);
  ox = Math.min(Math.max(ox, r[0] + 2), r[0] + r[2] - 2);
  oy = Math.min(Math.max(oy, r[1] + 2), r[1] + r[3] - 2);
  const pinB = oy > r[1] + r[3] - fs * 1.6, pinL = ox < r[0] + fs * 2.6;
  ctx.strokeStyle = '#6b6f78'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(r[0] + 4, oy); ctx.lineTo(r[0] + r[2] - 4, oy); ctx.stroke();
  if (!o.noY) { ctx.beginPath(); ctx.moveTo(ox, r[1] + r[3] - 4); ctx.lineTo(ox, r[1] + 4); ctx.stroke(); }
  const arw = Math.min(r[2], r[3]) * 0.022;
  ctx.fillStyle = '#6b6f78';
  const xe = r[0] + r[2] - 4, ye = r[1] + 4;
  ctx.beginPath(); ctx.moveTo(xe, oy); ctx.lineTo(xe - arw, oy - arw * .45); ctx.lineTo(xe - arw, oy + arw * .45); ctx.closePath(); ctx.fill();
  if (!o.noY) { ctx.beginPath(); ctx.moveTo(ox, ye); ctx.lineTo(ox - arw * .45, ye + arw); ctx.lineTo(ox + arw * .45, ye + arw); ctx.closePath(); ctx.fill(); }
  if (o.ticks !== false) {
    ctx.font = `${fs * 0.8}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillStyle = '#80848c';
    ctx.textAlign = 'center'; ctx.textBaseline = pinB ? 'bottom' : 'top';
    for (let gx = Math.ceil(f.vx0 / stepX) * stepX; gx <= f.vx1; gx += stepX) {
      if (Math.abs(gx) < stepX * 1e-6) continue;
      const px = f(gx, 0)[0];
      if (px < r[0] + fs || px > r[0] + r[2] - fs * 1.5) continue;
      ctx.fillText(fmtTick(gx, stepX), px, pinB ? oy - 3 : oy + 3);
    }
    if (!o.noY) {
      ctx.textAlign = pinL ? 'left' : 'right'; ctx.textBaseline = 'middle';
      for (let gy = Math.ceil(f.vy0 / stepY) * stepY; gy <= f.vy1; gy += stepY) {
        if (Math.abs(gy) < stepY * 1e-6) continue;
        const py = f(0, gy)[1];
        if (py < r[1] + fs || py > r[1] + r[3] - fs) continue;
        ctx.fillText(fmtTick(gy, stepY), pinL ? ox + 4 : ox - 4, py);
      }
    }
  }
  ctx.fillStyle = '#9a9ea6';
  ctx.font = `italic ${fs}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillText(o.xl ?? 'x', xe - 2, oy - 4);
  if (!o.noY) { ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(o.yl ?? 'y', ox + 6, ye); }
  ctx.restore();
}

/* graph of y = fn(x) on [a, b], broken at non-finite values and huge jumps */
function plot(ctx, f, fn, a, b, color, lw = 2.5, o = {}) {
  const N = o.N || 600;
  ctx.save(); clip(ctx, f);
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (o.dash) ctx.setLineDash(o.dash);
  if (o.glow) { ctx.shadowColor = color; ctx.shadowBlur = 10; }
  ctx.beginPath();
  let pen = false, lastPy = 0;
  const big = f.rect[3] * 4;
  for (let i = 0; i <= N; i++) {
    const x = a + (b - a) * i / N, y = fn(x);
    if (!isFinite(y)) { pen = false; continue; }
    let [px, py] = f(x, y);
    py = Math.max(-big, Math.min(big + f.rect[3], py));
    if (pen && Math.abs(py - lastPy) > f.rect[3] * 1.5) pen = false;
    if (pen) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    pen = true; lastPy = py;
  }
  ctx.stroke(); ctx.restore();
}

function line(ctx, f, x0, y0, x1, y1, color, lw = 2, dash = null) {
  ctx.save(); clip(ctx, f);
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(...f(x0, y0)); ctx.lineTo(...f(x1, y1)); ctx.stroke();
  ctx.restore();
}

/* the full line through (x0, y0) with slope m, across the panel */
function slopeLine(ctx, f, x0, y0, m, color, lw = 2, dash = null) {
  const a = f.vx0, b = f.vx1;
  line(ctx, f, a, y0 + m * (a - x0), b, y0 + m * (b - x0), color, lw, dash);
}

function dot(ctx, f, x, y, r, color, o = {}) {
  const [px, py] = f(x, y);
  ctx.save();
  if (o.open) {
    ctx.fillStyle = '#111'; ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, r, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  } else {
    ctx.fillStyle = color;
    if (o.glow !== false) { ctx.shadowColor = color; ctx.shadowBlur = r * 2.2; }
    ctx.beginPath(); ctx.arc(px, py, r, 0, 2 * Math.PI); ctx.fill();
  }
  ctx.restore();
}

function arrow(ctx, f, x0, y0, x1, y1, color, lw = 2) {
  const [px0, py0] = f(x0, y0), [px1, py1] = f(x1, y1);
  const dx = px1 - px0, dy = py1 - py0, L = Math.hypot(dx, dy);
  if (L < 3) return;
  const ux = dx / L, uy = dy / L, aw = Math.min(14, Math.max(6, L * 0.25));
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.moveTo(px0, py0); ctx.lineTo(px1 - ux * aw * 0.6, py1 - uy * aw * 0.6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(px1, py1);
  ctx.lineTo(px1 - aw * ux + aw * .42 * uy, py1 - aw * uy - aw * .42 * ux);
  ctx.lineTo(px1 - aw * ux - aw * .42 * uy, py1 - aw * uy + aw * .42 * ux);
  ctx.closePath(); ctx.fill(); ctx.restore();
}

/* filled region between y = top(x) and y = bot(x) on [a, b] */
function fillBetween(ctx, f, top, bot, a, b, color, N = 200) {
  if (b <= a) return;
  ctx.save(); clip(ctx, f);
  ctx.beginPath();
  for (let i = 0; i <= N; i++) { const x = a + (b - a) * i / N; const p = f(x, top(x)); i ? ctx.lineTo(...p) : ctx.moveTo(...p); }
  for (let i = N; i >= 0; i--) { const x = a + (b - a) * i / N; ctx.lineTo(...f(x, bot(x))); }
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  ctx.restore();
}

/* signed area under fn on [a, b]: positive part one color, negative part another */
function fillSigned(ctx, f, fn, a, b, cPos, cNeg) {
  fillBetween(ctx, f, x => Math.max(fn(x), 0), () => 0, a, b, cPos);
  fillBetween(ctx, f, () => 0, x => Math.min(fn(x), 0), a, b, cNeg);
}

function rectW(ctx, f, x0, y0, x1, y1, fill, stroke) {
  const [ax, ay] = f(x0, y0), [bx, by] = f(x1, y1);
  ctx.save(); clip(ctx, f);
  if (fill) { ctx.fillStyle = fill; ctx.fillRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay)); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.strokeRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay)); }
  ctx.restore();
}

/* canvas math text: ^x, ^{..}, _x, _{..} become real super/subscripts */
function mtext(ctx, s, px, py, color, size, opts = {}) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  if (opts.shadow !== false) { ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 4; }
  const fam = 'ui-sans-serif, system-ui, sans-serif';
  const setFont = fs => { ctx.font = `${opts.bold ? 'bold ' : ''}${opts.italic ? 'italic ' : ''}${fs}px ${fam}`; };
  // measure first for alignment
  const pieces = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '^' || ch === '_') {
      i++;
      let tok = '';
      if (s[i] === '{') { const e = s.indexOf('}', i); tok = s.slice(i + 1, e < 0 ? s.length : e); i = e < 0 ? s.length : e + 1; }
      else { tok = s[i] ?? ''; i++; }
      pieces.push([tok, size * 0.72, ch === '^' ? -size * 0.14 : size * 0.42]);
    } else {
      let j = i;
      while (j < s.length && s[j] !== '^' && s[j] !== '_') j++;
      pieces.push([s.slice(i, j), size, 0]);
      i = j;
    }
  }
  let w = 0;
  for (const [str, fs] of pieces) { setFont(fs); w += ctx.measureText(str).width; }
  let x = px;
  if (opts.align === 'center') x -= w / 2; else if (opts.align === 'right') x -= w;
  let y = py;
  if (opts.base === 'middle') y -= size / 2; else if (opts.base === 'bottom') y -= size;
  ctx.textAlign = 'left';
  for (const [str, fs, dy] of pieces) { setFont(fs); ctx.fillText(str, x, y + dy); x += ctx.measureText(str).width; }
  ctx.restore();
  return w;
}

/* stacked lines of text in a corner box; lines = [[text, color], ...] */
function readout(ctx, f, lines, o = {}) {
  const r = f.rect, fs = o.fs || f.fs;
  const pad = fs * 0.5;
  let x = o.right ? r[0] + r[2] - pad : r[0] + pad + (o.dx || 0);
  if (o.atX !== undefined) x = f(o.atX, 0)[0] + pad;
  let y = o.bottom ? r[1] + r[3] - pad - lines.length * fs * 1.3 : r[1] + pad + (o.dy || 0);
  // measure, then a translucent backing so text stays legible over curves
  ctx.save();
  ctx.font = `${fs}px ui-sans-serif, system-ui, sans-serif`;
  let wmax = 0;
  for (const [s] of lines) wmax = Math.max(wmax, ctx.measureText(s.replace(/[_^]\{([^}]*)\}|[_^](.)/g, '$1$2')).width);
  const bx = o.right ? x - wmax - pad * 0.6 : x - pad * 0.6, by = y - pad * 0.4;
  ctx.fillStyle = 'rgba(13,14,17,0.72)';
  ctx.fillRect(bx, by, wmax + pad * 1.2, lines.length * fs * 1.3 + pad * 0.5);
  ctx.restore();
  for (const [s, c] of lines) {
    mtext(ctx, s, x, y, c || '#ddd', fs, { align: o.right ? 'right' : 'left' });
    y += fs * 1.3;
  }
}

function labelAt(ctx, f, s, x, y, color, o = {}) {
  const [px, py] = f(x, y);
  const fs = o.fs || f.fs * 0.95;
  mtext(ctx, s, px + (o.dx || 0) * fs, py + (o.dy || 0) * fs, color, fs, o);
}

const fx = (v, d = 3) => {
  if (!isFinite(v)) return v > 0 ? '∞' : '−∞';
  const s = v.toFixed(d);
  return (s.startsWith('-') ? '−' + s.slice(1) : s).replace(/^−0\.0+$/, '0.000'.slice(0, d + 2));
};

/* colors, matching the calc3 palette */
const C = {
  curve: '#44ccff', curve2: '#ff8844', tan: '#44ddaa', sec: '#ff8844', hi: '#ffff66',
  pink: '#ff4488', purple: '#aa66ff', text: '#dddddd', dim: '#9a9ea6', ghost: '#3a3d44',
  fillPos: 'rgba(68,204,255,0.28)', fillNeg: 'rgba(255,68,136,0.30)'
};

/* bisection root of g on [a, b] with a sign change */
function bisect(g, a, b) {
  let ga = g(a);
  for (let k = 0; k < 60; k++) {
    const m = (a + b) / 2, gm = g(m);
    if ((gm > 0) === (ga > 0)) { a = m; ga = gm; } else b = m;
  }
  return (a + b) / 2;
}
function allRoots(g, a, b, N = 400) {
  const out = [];
  let x0 = a, g0 = g(a);
  for (let i = 1; i <= N; i++) {
    const x1 = a + (b - a) * i / N, g1 = g(x1);
    if (g0 === 0) out.push(x0);
    else if (g0 * g1 < 0) out.push(bisect(g, x0, x1));
    x0 = x1; g0 = g1;
  }
  if (g0 === 0) out.push(b);
  return out;
}

/* numeric integral (Simpson) */
function integrate(fn, a, b, N = 400) {
  if (a === b) return 0;
  const h = (b - a) / N;
  let s = fn(a) + fn(b);
  for (let i = 1; i < N; i++) s += fn(a + i * h) * (i % 2 ? 4 : 2);
  return s * h / 3;
}

/* ============================================================
   Figures
   ============================================================ */
export const FIGS2D = {

  /* Ch 1 -------------------------------------------------- */

  // secant lines through P = (4, 2) on y = √x converge to the tangent as h → 0
  secantTangent: {
    period: 10000,
    slider: {
      label: 'h', min: -3.5, max: 5, step: 0.01, value: 2,
      anim: t => t < 0.5 ? Math.max(0.02, 5 * (1 - t / 0.42)) : Math.min(-0.02, -3.5 * (1 - (t - 0.5) / 0.42)),
      fmt: v => fx(v, 2)
    },
    draw: (ctx, W, H, t, st) => {
      const fn = x => Math.sqrt(x);
      const f = panel(W, H, -0.6, 9.6, -0.6, 3.6);
      axes(ctx, f);
      let h = st.s; if (Math.abs(h) < 0.01) h = h < 0 ? -0.01 : 0.01;
      const a = 4, fa = 2, xq = a + h, fq = fn(xq), m = (fq - fa) / h;
      slopeLine(ctx, f, a, fa, 0.25, C.tan, 1.8, [7, 6]);
      plot(ctx, f, fn, 0, 9.6, C.curve, 2.6);
      slopeLine(ctx, f, a, fa, m, C.sec, 2.2);
      line(ctx, f, a, fa, xq, fa, C.dim, 1.2, [3, 4]);
      line(ctx, f, xq, fa, xq, fq, C.dim, 1.2, [3, 4]);
      dot(ctx, f, a, fa, 5, C.hi);
      dot(ctx, f, xq, fq, 5, C.pink);
      labelAt(ctx, f, 'P', a, fa, C.hi, { dx: -0.4, dy: -1.3 });
      labelAt(ctx, f, 'Q', xq, fq, C.pink, { dx: 0.4, dy: 0.2 });
      readout(ctx, f, [
        ['f(x) = √x,  P = (4, 2),  Q = (4 + h, √(4 + h))', C.curve],
        ['secant slope = (√(4 + h) − 2)/h = ' + fx(m, 4), C.sec],
        ['tangent slope = lim_{h→0} = 1/4 = 0.25', C.tan]
      ], { atX: 0 });
    }
  },

  // one-sided limits that disagree: a jump at a = 1, with f(1) off on its own
  oneSided: {
    period: 8000,
    slider: { label: 'distance δ from 1', min: 0.02, max: 1.5, step: 0.01, value: 0.6, anim: t => logLerp(1.5, 0.02, tri(t)) },
    draw: (ctx, W, H, t, st) => {
      const fn = x => x < 1 ? x + 1 : 0.5 + (x - 1) * (x - 1);
      const f = panel(W, H, -1.2, 3.2, -0.6, 4.4);
      axes(ctx, f);
      plot(ctx, f, x => x < 1 ? x + 1 : NaN, -1.2, 0.9999, C.curve, 2.6);
      plot(ctx, f, x => x > 1 ? 0.5 + (x - 1) ** 2 : NaN, 1.0001, 3.2, C.curve, 2.6);
      dot(ctx, f, 1, 2, 5, C.curve, { open: true });
      dot(ctx, f, 1, 0.5, 5, C.curve, { open: true });
      dot(ctx, f, 1, 3, 5, C.curve, { glow: false });
      labelAt(ctx, f, 'f(1) = 3', 1, 3, C.dim, { dx: -0.6, dy: -0.5, align: 'right' });
      const d = st.s, xl = 1 - d, xr = 1 + d;
      for (const [xx, col] of [[xl, C.sec], [xr, C.pink]]) {
        const yy = fn(xx);
        line(ctx, f, xx, 0, xx, yy, col, 1.2, [3, 4]);
        line(ctx, f, xx, yy, 0, yy, col, 1.2, [3, 4]);
        dot(ctx, f, xx, yy, 5, col);
        dot(ctx, f, xx, 0, 3.5, col);
      }
      readout(ctx, f, [
        ['x = 1 − δ:  f(x) = ' + fx(fn(xl)) + '  → 2', C.sec],
        ['x = 1 + δ:  f(x) = ' + fx(fn(xr)) + '  → 0.5', C.pink],
        ['left and right limits differ, so lim_{x→1} f(x) DNE', C.text]
      ], { right: true });
    }
  },

  // infinite one-sided limits at the vertical asymptote x = 2 of f(x) = 1/(x − 2)
  vertAsym: {
    period: 8000,
    slider: { label: 'distance δ from 2', min: 0.05, max: 1.5, step: 0.005, value: 0.5, anim: t => logLerp(1.5, 0.05, tri(t)), fmt: v => fx(v, 3) },
    draw: (ctx, W, H, t, st) => {
      const fn = x => 1 / (x - 2);
      const f = panel(W, H, -1.5, 5.5, -9, 9);
      axes(ctx, f, { stepY: 2 });
      line(ctx, f, 2, -10, 2, 10, C.dim, 1.4, [6, 6]);
      plot(ctx, f, x => x < 2 ? fn(x) : NaN, -1.5, 1.999, C.curve, 2.6, { N: 1200 });
      plot(ctx, f, x => x > 2 ? fn(x) : NaN, 2.001, 5.5, C.curve, 2.6, { N: 1200 });
      const d = st.s;
      for (const [xx, col] of [[2 - d, C.sec], [2 + d, C.pink]]) {
        const yy = fn(xx);
        line(ctx, f, xx, 0, xx, yy, col, 1.2, [3, 4]);
        dot(ctx, f, xx, yy, 5, col);
      }
      labelAt(ctx, f, 'x = 2', 2, 8.2, C.dim, { dx: 0.4 });
      readout(ctx, f, [
        ['f(2 − δ) = ' + fx(fn(2 - d), 2) + '  → −∞', C.sec],
        ['f(2 + δ) = ' + fx(fn(2 + d), 2) + '  → +∞', C.pink]
      ], { right: true, bottom: true });
    }
  },

  // squeeze theorem: −x² ≤ x² sin(1/x) ≤ x², zooming in on 0
  squeeze: {
    period: 10000,
    slider: { label: 'window half-width', min: 0.01, max: 1, step: 0.001, value: 1, anim: t => logLerp(1, 0.01, tri(t)), fmt: v => fx(v, 3) },
    draw: (ctx, W, H, t, st) => {
      const w = st.s;
      const f = panel(W, H, -w, w, -0.65 * w, 0.65 * w);
      axes(ctx, f, { divX: 5 });
      plot(ctx, f, x => x * x, -w, w, C.sec, 2, { dash: [7, 5] });
      plot(ctx, f, x => -x * x, -w, w, C.sec, 2, { dash: [7, 5] });
      plot(ctx, f, x => x === 0 ? 0 : x * x * Math.sin(1 / x), -w, w, C.curve, 2, { N: 4000 });
      dot(ctx, f, 0, 0, 4.5, C.hi);
      readout(ctx, f, [
        ['y = x^2 sin(1/x)', C.curve],
        ['y = ±x^2', C.sec],
        ['both bounds → 0 as x → 0, so the middle does too', C.text]
      ]);
    }
  },

  // IVT: every height N between f(a) and f(b) is hit at least once on [a, b]
  ivt: {
    period: 9000,
    slider: { label: 'height N', min: -1, max: 3, step: 0.01, value: 1.5 },
    draw: (ctx, W, H, t, st) => {
      const fn = x => x * x * x - 3 * x + 1, a = -2, b = 2;
      const f = panel(W, H, -2.6, 2.6, -2, 4);
      axes(ctx, f);
      // band of heights between f(a) and f(b) on the y-axis
      rectW(ctx, f, -2.6, fn(a), -2.45, fn(b), 'rgba(255,255,102,0.35)');
      line(ctx, f, a, 0, a, fn(a), C.dim, 1.2, [3, 4]);
      line(ctx, f, b, 0, b, fn(b), C.dim, 1.2, [3, 4]);
      plot(ctx, f, fn, -2.6, 2.6, C.ghost, 1.5);
      plot(ctx, f, fn, a, b, C.curve, 2.6);
      dot(ctx, f, a, fn(a), 4.5, C.curve, { glow: false });
      dot(ctx, f, b, fn(b), 4.5, C.curve, { glow: false });
      labelAt(ctx, f, '(a, f(a))', a, fn(a), C.dim, { dx: 0.3, dy: 0.2 });
      labelAt(ctx, f, '(b, f(b))', b, fn(b), C.dim, { dx: -4.6, dy: -0.4 });
      const N = st.s;
      line(ctx, f, -2.6, N, 2.6, N, C.hi, 1.6, [6, 5]);
      const cs = allRoots(x => fn(x) - N, a, b, 800);
      for (const c of cs) {
        line(ctx, f, c, 0, c, N, C.pink, 1.2, [3, 4]);
        dot(ctx, f, c, N, 5.5, C.pink);
        dot(ctx, f, c, 0, 3.5, C.pink);
      }
      readout(ctx, f, [
        ['f(x) = x^3 − 3x + 1 on [−2, 2]', C.curve],
        ['N = ' + fx(N, 2) + ', between f(−2) = −1 and f(2) = 3', C.hi],
        ['c with f(c) = N:  ' + cs.map(c => fx(c, 2)).join(',  '), C.pink]
      ], { right: true, bottom: true });
    }
  },

  /* Ch 2 -------------------------------------------------- */

  // f on top with its tangent, f′ below: the height of f′ is the slope of f
  fAndFprime: {
    period: 9000, height: 460,
    slider: { label: 'x', min: -2.4, max: 2.4, step: 0.01, value: -1.5, anim: t => -2.4 + 4.8 * tri(t) },
    draw: (ctx, W, H, t, st) => {
      const fn = x => x * x * x / 3 - x, dfn = x => x * x - 1;
      const top = panel(W, H, -2.6, 2.6, -2.2, 2.2, { rect: [0, 0, W, H * 0.5] });
      const bot = panel(W, H, -2.6, 2.6, -1.6, 5, { rect: [0, H * 0.5, W, H * 0.5] });
      axes(ctx, top, { yl: 'y = f(x)' });
      axes(ctx, bot, { yl: 'y = f′(x)' });
      const x = st.s;
      slopeLine(ctx, top, x, fn(x), dfn(x), C.tan, 2);
      plot(ctx, top, fn, -2.6, 2.6, C.curve, 2.6);
      dot(ctx, top, x, fn(x), 5, C.hi);
      plot(ctx, bot, dfn, -2.6, 2.6, C.ghost, 1.5);
      plot(ctx, bot, dfn, -2.6, x, C.tan, 2.6);
      dot(ctx, bot, x, dfn(x), 5, C.hi);
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,102,0.35)'; ctx.setLineDash([3, 5]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(...top(x, fn(x))); ctx.lineTo(...bot(x, dfn(x))); ctx.stroke(); ctx.restore();
      readout(ctx, top, [['f(x) = x^3/3 − x', C.curve], ['slope of tangent = ' + fx(dfn(x), 2), C.tan]]);
      readout(ctx, bot, [['f′(x) = x^2 − 1', C.tan], ['f′ = 0 where f has a horizontal tangent', C.dim]], { right: true, bottom: true });
    }
  },

  // zooming in: a differentiable graph straightens out, a corner, cusp or vertical tangent does not
  cornerCusp: {
    period: 10000, height: 460,
    slider: { label: 'window half-width', min: 0.01, max: 2, step: 0.001, value: 2, anim: t => logLerp(2, 0.01, tri(t)), fmt: v => fx(v, 3) },
    draw: (ctx, W, H, t, st) => {
      const w = st.s;
      const cb = x => Math.cbrt(x);
      const items = [
        ['smooth: y = x^2 + x', x => x * x + x, C.curve],
        ['corner: y = |x|', x => Math.abs(x), C.sec],
        ['cusp: y = x^{2/3}', x => cb(x) ** 2, C.pink],
        ['vertical tangent: y = x^{1/3}', x => cb(x), C.purple]
      ];
      items.forEach(([name, fn, col], k) => {
        const rect = [(k % 2) * W / 2, Math.floor(k / 2) * H / 2, W / 2, H / 2];
        const f = panel(W, H, -w, w, -w, w, { rect, equal: true, padT: 0.14 });
        axes(ctx, f, { ticks: false, yl: '' });
        plot(ctx, f, fn, -w, w, col, 2.4, { N: 800 });
        dot(ctx, f, 0, 0, 4, C.hi);
        mtext(ctx, name, rect[0] + rect[2] * 0.05, rect[1] + rect[3] * 0.03, col, f.fs * 0.85);
        ctx.save(); ctx.strokeStyle = '#2a2c31'; ctx.lineWidth = 1; ctx.strokeRect(rect[0] + 0.5, rect[1] + 0.5, rect[2] - 1, rect[3] - 1); ctx.restore();
      });
    }
  },

  // chain rule: a short interval is stretched by g′(x), then by f′(u)
  chainStretch: {
    period: 9000,
    slider: { label: 'x', min: 0.1, max: 1.85, step: 0.01, value: 0.8 },
    draw: (ctx, W, H, t, st) => {
      const g = x => x * x, dg = x => 2 * x, F = u => Math.sin(u), dF = u => Math.cos(u);
      const f = panel(W, H, -1.4, 4.4, 0, 3.4, { padT: 0.04, padB: 0.04 });
      const x = st.s, dx = 0.12;
      const lines = [[2.75, 'x', C.curve], [1.65, 'u = g(x) = x^2', C.sec], [0.55, 'y = f(u) = sin u', C.pink]];
      const fs = f.fs;
      for (const [yy, name, col] of lines) {
        line(ctx, f, -1.3, yy, 4.3, yy, '#6b6f78', 1.5);
        for (let k = -1; k <= 4; k++) {
          line(ctx, f, k, yy - 0.06, k, yy + 0.06, '#6b6f78', 1.2);
          labelAt(ctx, f, String(k).replace('-', '−'), k, yy - 0.09, '#80848c', { align: 'center', fs: fs * 0.8 });
        }
        labelAt(ctx, f, name, -1.3, yy + 0.42, col, { fs });
      }
      const ints = [[x, x + dx], [g(x), g(x + dx)], [F(g(x)), F(g(x + dx))]];
      const cols = ['rgba(68,204,255,', 'rgba(255,136,68,', 'rgba(255,68,136,'];
      for (let k = 0; k < 2; k++) {
        const [a0, a1] = ints[k], [b0, b1] = ints[k + 1];
        const ya = lines[k][0], yb = lines[k + 1][0];
        ctx.save(); ctx.beginPath();
        ctx.moveTo(...f(a0, ya)); ctx.lineTo(...f(a1, ya)); ctx.lineTo(...f(b1, yb)); ctx.lineTo(...f(b0, yb)); ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,102,0.10)'; ctx.fill(); ctx.restore();
        line(ctx, f, a0, ya, b0, yb, 'rgba(255,255,102,0.45)', 1, [3, 4]);
        line(ctx, f, a1, ya, b1, yb, 'rgba(255,255,102,0.45)', 1, [3, 4]);
      }
      ints.forEach(([a0, a1], k) => {
        const yy = lines[k][0];
        line(ctx, f, a0, yy, a1, yy, cols[k] + '1)', 6);
        dot(ctx, f, a0, yy, 3.5, cols[k] + '1)', { glow: false });
      });
      const u = g(x);
      readout(ctx, f, [
        ['g′(x) = 2x = ' + fx(dg(x), 2), C.sec],
        ['f′(u) = cos u = ' + fx(dF(u), 2), C.pink],
        ['(f∘g)′(x) = f′(g(x)) g′(x) = ' + fx(dF(u) * dg(x), 2), C.hi]
      ], { right: true });
    }
  },

  // implicit differentiation on the folium x³ + y³ = 9xy
  implicitTangent: {
    period: 12000,
    slider: { label: 'point on curve', min: -0.6, max: 6, step: 0.01, value: 1, anim: t => -0.6 + 6.6 * tri(t), fmt: v => 't = ' + fx(v, 2) },
    draw: (ctx, W, H, t, st) => {
      const P = s => [9 * s / (1 + s ** 3), 9 * s * s / (1 + s ** 3)];
      const dP = s => { const d = (1 + s ** 3) ** 2; return [(9 - 18 * s ** 3) / d, (18 * s - 9 * s ** 4) / d]; };
      const f = panel(W, H, -6.5, 6.5, -6.5, 6.5, { equal: true });
      axes(ctx, f);
      const seg = (s0, s1) => {
        ctx.save(); clip(ctx, f); ctx.strokeStyle = C.curve; ctx.lineWidth = 2.6; ctx.beginPath();
        for (let i = 0; i <= 600; i++) { const s = s0 + (s1 - s0) * i / 600; const p = f(...P(s)); i ? ctx.lineTo(...p) : ctx.moveTo(...p); }
        ctx.stroke(); ctx.restore();
      };
      seg(-0.8, 0); seg(0, 60); seg(-60, -1.25);
      line(ctx, f, -9, 6, 6, -9, C.ghost, 1.2, [5, 5]);  // asymptote x + y = −3
      const s = st.s, [x, y] = P(s), [vx, vy] = dP(s);
      const L = 12 / Math.hypot(vx, vy);
      line(ctx, f, x - vx * L, y - vy * L, x + vx * L, y + vy * L, C.tan, 2);
      dot(ctx, f, x, y, 5, C.hi);
      const den = y * y - 3 * x, num = 3 * y - x * x;
      const slope = Math.abs(den) < 1e-6 ? (Math.abs(num) < 1e-6 ? '0/0, the curve crosses itself' : 'undefined (vertical)') : fx(num / den, 3);
      readout(ctx, f, [
        ['x^3 + y^3 = 9xy', C.curve],
        ['(x, y) = (' + fx(x, 2) + ', ' + fx(y, 2) + ')', C.hi],
        ['dy/dx = (3y − x^2)/(y^2 − 3x) = ' + slope, C.tan]
      ], { bottom: true });
    }
  },

  // related rates: a 13 ft ladder whose foot slides out at 2 ft/s
  ladder: {
    period: 9000,
    slider: { label: 'x (ft)', min: 0.8, max: 12.8, step: 0.01, value: 5, anim: t => 0.8 + 12 * t, fmt: v => fx(v, 2) },
    draw: (ctx, W, H, t, st) => {
      const f = panel(W, H, -2.5, 16, -1.5, 14, { equal: true });
      const x = st.s, y = Math.sqrt(169 - x * x), dydt = -2 * x / y;
      rectW(ctx, f, -2.5, -1.5, 16, 0, '#26282e');
      rectW(ctx, f, -1.2, 0, 0, 14, '#26282e');
      line(ctx, f, 0, 0, 16, 0, '#6b6f78', 1.5);
      line(ctx, f, 0, 0, 0, 14, '#6b6f78', 1.5);
      line(ctx, f, x, 0, 0, y, C.sec, 5);
      dot(ctx, f, x, 0, 5, C.curve);
      dot(ctx, f, 0, y, 5, C.pink);
      arrow(ctx, f, x, 0.45, x + 2, 0.45, C.curve, 2.2);
      arrow(ctx, f, 0.45, y, 0.45, y + Math.max(-5.5, dydt), C.pink, 2.2);
      labelAt(ctx, f, 'x', x / 2, 0, C.curve, { dy: 0.3, align: 'center' });
      labelAt(ctx, f, 'y', 0, y / 2, C.pink, { dx: -1.2 });
      labelAt(ctx, f, '13', x / 2, y / 2, C.sec, { dx: 0.5 });
      readout(ctx, f, [
        ['x^2 + y^2 = 169,  dx/dt = 2 ft/s', C.text],
        ['x = ' + fx(x, 2) + ',  y = ' + fx(y, 2), C.text],
        ['dy/dt = −(x/y) dx/dt = ' + fx(dydt, 3) + ' ft/s', C.pink]
      ], { right: true });
    }
  },

  // linear approximation: zoom in at a = 9 on y = √x and the tangent line merges with the curve
  linApprox: {
    period: 10000,
    slider: { label: 'window half-width', min: 0.05, max: 9, step: 0.001, value: 9, anim: t => logLerp(9, 0.05, tri(t)), fmt: v => fx(v, 3) },
    draw: (ctx, W, H, t, st) => {
      const w = st.s, fn = x => Math.sqrt(x), Lf = x => 3 + (x - 9) / 6;
      const f = panel(W, H, 9 - w, 9 + w, 3 - 0.4 * w, 3 + 0.4 * w);
      axes(ctx, f);
      plot(ctx, f, Lf, 4 - w, 4 + w, C.tan, 2.2);
      plot(ctx, f, x => x >= 0 ? fn(x) : NaN, Math.max(0, 9 - w), 9 + w, C.curve, 2.6);
      const xt = 9 + 0.7 * w;
      line(ctx, f, xt, fn(xt), xt, Lf(xt), C.pink, 3);
      dot(ctx, f, 9, 3, 5, C.hi);
      dot(ctx, f, xt, fn(xt), 3.5, C.curve, { glow: false });
      dot(ctx, f, xt, Lf(xt), 3.5, C.tan, { glow: false });
      readout(ctx, f, [
        ['f(x) = √x', C.curve],
        ['L(x) = 3 + (x − 9)/6', C.tan],
        ['at x = ' + fx(xt, 3) + ':  L − f = ' + (Lf(xt) - fn(xt)).toExponential(2), C.pink]
      ], { right: true, bottom: true });
    }
  },

  /* Ch 3 -------------------------------------------------- */

  // closed interval method on [−1, b] for f(x) = x³ − 3x² + 1
  closedInterval: {
    period: 10000,
    slider: { label: 'right endpoint b', min: 0.5, max: 3.6, step: 0.01, value: 2.5 },
    draw: (ctx, W, H, t, st) => {
      const fn = x => x ** 3 - 3 * x * x + 1, a = -1, b = st.s;
      const f = panel(W, H, -1.6, 4, -4, 12.5);
      axes(ctx, f, { stepY: 2 });
      plot(ctx, f, fn, -1.6, 4, C.ghost, 1.5);
      plot(ctx, f, fn, a, b, C.curve, 2.6);
      const cand = [[a, 'endpoint'], [b, 'endpoint']];
      for (const c of [0, 2]) if (c > a && c < b) cand.push([c, 'critical']);
      cand.sort((p, q) => p[0] - q[0]);
      const vals = cand.map(([c]) => fn(c));
      const mx = Math.max(...vals), mn = Math.min(...vals);
      line(ctx, f, a, -4, a, 12.5, C.ghost, 1, [4, 4]);
      line(ctx, f, b, -4, b, 12.5, C.ghost, 1, [4, 4]);
      const rows = [['f(x) = x^3 − 3x^2 + 1 on [−1, ' + fx(b, 2) + ']', C.curve]];
      for (const [c, kind] of cand) {
        const v = fn(c);
        const col = Math.abs(v - mx) < 1e-9 ? C.tan : Math.abs(v - mn) < 1e-9 ? C.pink : C.dim;
        dot(ctx, f, c, v, 5.5, col);
        rows.push([kind + ' x = ' + fx(c, 2) + ':  f = ' + fx(v, 2) + (col === C.tan ? '  abs max' : col === C.pink ? '  abs min' : ''), col]);
      }
      readout(ctx, f, rows, { atX: 0.05 });
    }
  },

  // mean value theorem: tangent slopes vs the secant slope on [−2, 2.5]
  mvt: {
    period: 10000,
    slider: { label: 'c', min: -2, max: 2.5, step: 0.005, value: 0 },
    draw: (ctx, W, H, t, st) => {
      const fn = x => x ** 3 - 3 * x, df = x => 3 * x * x - 3, a = -2, b = 2.5;
      const m = (fn(b) - fn(a)) / (b - a);
      const f = panel(W, H, -2.6, 3, -3.5, 12);
      axes(ctx, f, { stepY: 2 });
      plot(ctx, f, fn, -2.6, 3, C.ghost, 1.5);
      plot(ctx, f, fn, a, b, C.curve, 2.6);
      line(ctx, f, a, fn(a), b, fn(b), C.sec, 2.2);
      dot(ctx, f, a, fn(a), 4.5, C.sec, { glow: false });
      dot(ctx, f, b, fn(b), 4.5, C.sec, { glow: false });
      const cs = [-Math.sqrt(1.75), Math.sqrt(1.75)];
      for (const c of cs) { line(ctx, f, c, 0, c, fn(c), C.dim, 1, [3, 4]); dot(ctx, f, c, 0, 3.5, C.dim, { glow: false }); }
      const c = st.s, close = Math.abs(df(c) - m) < 0.15;
      slopeLine(ctx, f, c, fn(c), df(c), close ? C.hi : C.tan, close ? 2.8 : 2);
      dot(ctx, f, c, fn(c), 5, close ? C.hi : C.tan);
      readout(ctx, f, [
        ['f(x) = x^3 − 3x on [−2, 2.5]', C.curve],
        ['secant slope (f(b) − f(a))/(b − a) = ' + fx(m, 3), C.sec],
        ['f′(c) = ' + fx(df(c), 3), close ? C.hi : C.tan],
        ['f′(c) = secant slope at c = ±√1.75 ≈ ±1.323', C.dim]
      ]);
    }
  },

  // concavity and inflection: the tangent sits below the graph where f″ > 0, above where f″ < 0
  concavity: {
    period: 9000,
    slider: { label: 'x', min: -2, max: 2, step: 0.01, value: -1, anim: t => -2 + 4 * tri(t) },
    draw: (ctx, W, H, t, st) => {
      const fn = x => x ** 3 - 3 * x, df = x => 3 * x * x - 3, d2 = x => 6 * x;
      const f = panel(W, H, -2.4, 2.4, -3.2, 4.8);
      axes(ctx, f);
      plot(ctx, f, fn, -2.4, 0, C.pink, 2.8);
      plot(ctx, f, fn, 0, 2.4, C.tan, 2.8);
      dot(ctx, f, 0, 0, 5, C.hi);
      labelAt(ctx, f, 'inflection point', 0, 0, C.hi, { dx: 0.5, dy: 0.2 });
      const x = st.s;
      slopeLine(ctx, f, x, fn(x), df(x), C.curve, 2);
      dot(ctx, f, x, fn(x), 5, C.curve);
      const up = d2(x) > 0;
      readout(ctx, f, [
        ['f(x) = x^3 − 3x', C.text],
        ['f′(x) = ' + fx(df(x), 2) + ',  f″(x) = 6x = ' + fx(d2(x), 2), C.curve],
        [Math.abs(x) < 0.02 ? 'f″ changes sign here' : up ? 'concave up: tangent below the graph' : 'concave down: tangent above the graph', Math.abs(x) < 0.02 ? C.hi : up ? C.tan : C.pink]
      ]);
    }
  },

  // horizontal asymptote y = 2 for f(x) = (2x² + 3x)/(x² + 1); the graph may cross it
  horizAsym: {
    period: 10000,
    slider: { label: 'window half-width', min: 3, max: 80, step: 0.1, value: 3, anim: t => logLerp(3, 80, tri(t)), fmt: v => fx(v, 1) },
    draw: (ctx, W, H, t, st) => {
      const R = st.s, fn = x => (2 * x * x + 3 * x) / (x * x + 1);
      const f = panel(W, H, -R, R, -2.8, 3.8);
      axes(ctx, f, { stepY: 1 });
      line(ctx, f, -R, 2, R, 2, C.sec, 1.6, [7, 6]);
      plot(ctx, f, fn, -R, R, C.curve, 2.6, { N: 1500 });
      dot(ctx, f, 2 / 3, 2, 4.5, C.hi);
      readout(ctx, f, [
        ['f(x) = (2x^2 + 3x)/(x^2 + 1)', C.curve],
        ['y = 2 (dashed)', C.sec],
        ['f(' + fx(R, 0) + ') = ' + fx(fn(R), 4) + ',   f(−' + fx(R, 0) + ') = ' + fx(fn(-R), 4), C.text],
        ['crosses y = 2 at x = 2/3', C.hi]
      ], { right: true, bottom: true });
    }
  },

  // optimization: cut squares of side x from a 12 by 12 sheet, fold up an open box
  optBox: {
    period: 10000,
    slider: { label: 'x', min: 0.05, max: 5.95, step: 0.01, value: 2 },
    draw: (ctx, W, H, t, st) => {
      const x = st.s, V = x * (12 - 2 * x) ** 2;
      const L = panel(W, H, -1, 13, -1, 13, { rect: [0, 0, W * 0.44, H], equal: true, padT: 0.12 });
      const R = panel(W, H, 0, 6.3, 0, 180, { rect: [W * 0.44, 0, W * 0.56, H], padL: 0.13 });
      rectW(ctx, L, 0, 0, 12, 12, 'rgba(68,204,255,0.18)', C.curve);
      for (const [cx, cy] of [[0, 0], [12 - x, 0], [0, 12 - x], [12 - x, 12 - x]]) rectW(ctx, L, cx, cy, cx + x, cy + x, '#111', C.pink);
      for (const k of [x, 12 - x]) { line(ctx, L, k, x, k, 12 - x, C.dim, 1, [4, 4]); line(ctx, L, x, k, 12 - x, k, C.dim, 1, [4, 4]); }
      labelAt(ctx, L, 'x', x / 2, 12, C.pink, { dy: -1.3, align: 'center' });
      labelAt(ctx, L, '12 − 2x', 6, 12, C.text, { dy: -1.3, align: 'center' });
      mtext(ctx, '12 by 12 sheet', L.rect[0] + L.rect[2] * 0.06, H * 0.02, C.dim, L.fs);
      axes(ctx, R, { yl: 'V', stepY: 40 });
      plot(ctx, R, s => s * (12 - 2 * s) ** 2, 0, 6, C.curve, 2.6);
      line(ctx, R, 2, 0, 2, 128, C.ghost, 1, [4, 4]);
      dot(ctx, R, x, V, 5, C.hi);
      readout(ctx, R, [
        ['V(x) = x(12 − 2x)^2', C.curve],
        ['x = ' + fx(x, 2) + ',  V = ' + fx(V, 1), C.hi],
        ['max V = 128 at x = 2', C.dim]
      ], { right: true });
    }
  },

  // antiderivatives: the family x³/3 − x + C all have slope x² − 1 at each x
  antiFamily: {
    period: 9000,
    slider: { label: 'C', min: -3, max: 3, step: 0.01, value: 1 },
    draw: (ctx, W, H, t, st) => {
      const F = x => x ** 3 / 3 - x, fn = x => x * x - 1;
      const f = panel(W, H, -2.6, 2.6, -4, 4);
      axes(ctx, f);
      // slope field of y′ = x² − 1
      ctx.save(); clip(ctx, f); ctx.strokeStyle = 'rgba(170,102,255,0.55)'; ctx.lineWidth = 1.3;
      for (let gx = -2.4; gx <= 2.41; gx += 0.4) for (let gy = -3.6; gy <= 3.61; gy += 0.6) {
        const m = fn(gx), [px, py] = f(gx, gy);
        const ux = f.sx, uy = -m * f.sy, Ln = Math.hypot(ux, uy), s = Math.min(W, H) * 0.022;
        ctx.beginPath(); ctx.moveTo(px - ux / Ln * s, py - uy / Ln * s); ctx.lineTo(px + ux / Ln * s, py + uy / Ln * s); ctx.stroke();
      }
      ctx.restore();
      for (let c = -3; c <= 3; c++) plot(ctx, f, x => F(x) + c, -2.6, 2.6, C.ghost, 1.3);
      plot(ctx, f, x => F(x) + st.s, -2.6, 2.6, C.curve, 2.6);
      dot(ctx, f, 0, st.s, 5, C.hi);
      readout(ctx, f, [
        ['F(x) = x^3/3 − x + C,  C = ' + fx(st.s, 2), C.curve],
        ['segments: slope F′(x) = x^2 − 1', C.purple],
        ['F(0) = C picks one member', C.hi]
      ], { right: true, bottom: true });
    }
  },

  /* Ch 4 -------------------------------------------------- */

  // Riemann sums for f(x) = x²/4 + 1 on [0, 4] with left, right, or midpoint samples
  riemann: {
    period: 12000,
    slider: { label: 'n', min: 1, max: 40, step: 1, value: 4, fmt: v => String(v) },
    options: ['left', 'right', 'midpoint'],
    draw: (ctx, W, H, t, st) => {
      const fn = x => x * x / 4 + 1, a = 0, b = 4, n = Math.max(1, Math.round(st.s));
      const f = panel(W, H, -0.4, 4.6, -0.6, 7);
      axes(ctx, f);
      const dx = (b - a) / n, off = [0, 1, 0.5][st.opt];
      let S = 0;
      for (let i = 0; i < n; i++) {
        const xi = a + i * dx, xs = xi + off * dx, h = fn(xs);
        S += h * dx;
        rectW(ctx, f, xi, 0, xi + dx, h, 'rgba(255,136,68,0.30)', n <= 40 ? 'rgba(255,136,68,0.9)' : null);
        if (n <= 12) dot(ctx, f, xs, h, 3.5, C.hi, { glow: false });
      }
      plot(ctx, f, fn, -0.4, 4.6, C.curve, 2.6);
      readout(ctx, f, [
        ['f(x) = x^2/4 + 1 on [0, 4],  Δx = 4/n = ' + fx(dx, 3), C.curve],
        [['left', 'right', 'midpoint'][st.opt] + ' sum R = Σ f(x_i^*) Δx = ' + fx(S, 4), C.sec],
        ['exact area = 28/3 ≈ 9.3333', C.text]
      ], { atX: 0 });
    }
  },

  // FTC 1: g(x) = ∫₀ˣ f(t) dt, the area so far; its slope at x is f(x)
  ftcAccum: {
    period: 12000, height: 460,
    slider: { label: 'x', min: 0, max: 6.5, step: 0.01, value: 2, anim: t => 6.5 * tri(t) },
    draw: (ctx, W, H, t, st) => {
      const fn = s => 1 + 2 * Math.sin(s), G = x => x + 2 - 2 * Math.cos(x);
      const top = panel(W, H, -0.4, 6.8, -1.6, 3.4, { rect: [0, 0, W, H * 0.5] });
      const bot = panel(W, H, -0.4, 6.8, -0.8, 12, { rect: [0, H * 0.5, W, H * 0.5] });
      axes(ctx, top, { xl: 't', yl: 'y = f(t)' });
      axes(ctx, bot, { yl: 'y = g(x)', stepY: 3 });
      const x = st.s;
      fillSigned(ctx, top, fn, 0, x, C.fillPos, C.fillNeg);
      plot(ctx, top, fn, -0.4, 6.8, C.curve, 2.6);
      line(ctx, top, x, 0, x, fn(x), C.hi, 2);
      dot(ctx, top, x, fn(x), 5, C.hi);
      plot(ctx, bot, G, 0, 6.8, C.ghost, 1.5);
      plot(ctx, bot, G, 0, x, C.tan, 2.6);
      const [px, py] = bot(x, G(x));
      ctx.save(); clip(ctx, bot); ctx.strokeStyle = C.hi; ctx.lineWidth = 1.8;
      const k = 0.9; ctx.beginPath(); ctx.moveTo(...bot(x - k, G(x) - k * fn(x))); ctx.lineTo(...bot(x + k, G(x) + k * fn(x))); ctx.stroke(); ctx.restore();
      dot(ctx, bot, x, G(x), 5, C.hi);
      readout(ctx, top, [['f(t) = 1 + 2 sin t', C.curve], ['f(x) = ' + fx(fn(x), 3), C.hi]], { right: true });
      readout(ctx, bot, [['g(x) = ∫_0^x f(t) dt = ' + fx(G(x), 3), C.tan], ['slope g′(x) = f(x) = ' + fx(fn(x), 3), C.hi]], { atX: 1.2 });
    }
  },

  // net change: v(t) = (t − 1)(t − 4), displacement is signed area, distance is total area
  netChange: {
    period: 12000, height: 420,
    slider: { label: 't', min: 0, max: 5, step: 0.01, value: 2.5, anim: t => 5 * Math.min(1, t / 0.85) },
    draw: (ctx, W, H, t, st) => {
      const v = s => (s - 1) * (s - 4), S = s => s ** 3 / 3 - 2.5 * s * s + 4 * s;
      const top = panel(W, H, -0.3, 5.4, -2.8, 4.6, { rect: [0, 0, W, H * 0.72] });
      const bot = panel(W, H, -3.2, 2.6, -1, 1, { rect: [0, H * 0.72, W, H * 0.28], padT: 0.05, padB: 0.25 });
      axes(ctx, top, { xl: 't', yl: 'v(t)' });
      const T = st.s;
      fillSigned(ctx, top, v, 0, T, C.fillPos, C.fillNeg);
      plot(ctx, top, v, -0.3, 5.4, C.curve, 2.6);
      dot(ctx, top, T, v(T), 5, C.hi);
      // distance so far = ∫|v|
      const dist = integrate(s => Math.abs(v(s)), 0, T, 600);
      readout(ctx, top, [
        ['v(t) = (t − 1)(t − 4) m/s', C.curve],
        ['displacement ∫_0^t v = ' + fx(S(T), 3) + ' m', C.text],
        ['distance ∫_0^t |v| = ' + fx(dist, 3) + ' m', C.sec]
      ], { atX: 0.9 });
      // position line
      axes(ctx, bot, { noY: true, xl: 's', stepX: 1 });
      ctx.save(); clip(ctx, bot); ctx.strokeStyle = 'rgba(255,136,68,0.7)'; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i <= 300; i++) { const s = T * i / 300; const p = bot(S(s), 0.35 - 0.5 * (s / 5)); i ? ctx.lineTo(...p) : ctx.moveTo(...p); }
      ctx.stroke(); ctx.restore();
      dot(ctx, bot, 0, 0, 3.5, C.dim, { glow: false });
      dot(ctx, bot, S(T), 0, 6, C.hi);
    }
  },

  // substitution u = x²: strips of width dx under 2x cos(x²) match strips of width du = 2x dx under cos u
  substitution: {
    period: 11000, height: 460,
    slider: { label: 'upper limit a', min: 0.2, max: 1.75, step: 0.005, value: 1.2 },
    draw: (ctx, W, H, t, st) => {
      const g = x => 2 * x * Math.cos(x * x), h = u => Math.cos(u);
      const top = panel(W, H, -0.15, 1.9, -2.9, 1.5, { rect: [0, 0, W, H * 0.5] });
      const bot = panel(W, H, -0.3, 3.4, -1.15, 1.25, { rect: [0, H * 0.5, W, H * 0.5] });
      axes(ctx, top, { yl: 'y = 2x cos(x^2)', stepX: 0.25 });
      axes(ctx, bot, { xl: 'u', yl: 'y = cos u', stepX: 0.5 });
      const a = st.s, n = 6;
      const pal = ['rgba(68,204,255,0.45)', 'rgba(255,136,68,0.45)', 'rgba(170,102,255,0.45)', 'rgba(68,221,170,0.45)', 'rgba(255,68,136,0.45)', 'rgba(255,255,102,0.40)'];
      for (let k = 0; k < n; k++) {
        const x0 = a * k / n, x1 = a * (k + 1) / n;
        fillBetween(ctx, top, g, () => 0, x0, x1, pal[k], 60);
        fillBetween(ctx, bot, h, () => 0, x0 * x0, x1 * x1, pal[k], 60);
      }
      plot(ctx, top, g, 0, 1.9, C.curve, 2.4);
      plot(ctx, bot, h, 0, 3.4, C.curve, 2.4);
      line(ctx, top, a, -3, a, 1.5, C.hi, 1.4, [4, 4]);
      line(ctx, bot, a * a, -1.2, a * a, 1.3, C.hi, 1.4, [4, 4]);
      readout(ctx, top, [['∫_0^a 2x cos(x^2) dx,  a = ' + fx(a, 3), C.text]], { right: true });
      readout(ctx, bot, [['∫_0^{a^2} cos u du,  a^2 = ' + fx(a * a, 3), C.text], ['both = sin(a^2) = ' + fx(Math.sin(a * a), 4), C.hi]], { right: true });
    }
  },

  /* Ch 5 -------------------------------------------------- */

  // area between y = 3 + 2x − x² and y = x + 1 by vertical strips
  areaBetween: {
    period: 9000,
    slider: { label: 'strip at x', min: -1, max: 2, step: 0.01, value: 0.5 },
    draw: (ctx, W, H, t, st) => {
      const T = x => 3 + 2 * x - x * x, B = x => x + 1;
      const f = panel(W, H, -2, 3, -1.2, 6.4);
      axes(ctx, f);
      fillBetween(ctx, f, T, B, -1, 2, 'rgba(68,204,255,0.22)');
      plot(ctx, f, T, -2, 3, C.curve, 2.6);
      plot(ctx, f, B, -2, 3, C.sec, 2.6);
      dot(ctx, f, -1, 0, 4.5, C.dim, { glow: false });
      dot(ctx, f, 2, 3, 4.5, C.dim, { glow: false });
      const x = st.s, dx = 0.12;
      rectW(ctx, f, x - dx / 2, B(x), x + dx / 2, T(x), 'rgba(255,255,102,0.55)', C.hi);
      readout(ctx, f, [
        ['top y = 3 + 2x − x^2', C.curve],
        ['bottom y = x + 1', C.sec],
        ['strip height = 2 + x − x^2 = ' + fx(T(x) - B(x), 3), C.hi],
        ['A = ∫_{−1}^2 (2 + x − x^2) dx = 9/2', C.text]
      ]);
    }
  },

  // washers: rotate the region between y = x and y = x² (0 ≤ x ≤ 1) about a horizontal line
  washer: {
    period: 9000,
    slider: { label: 'slice at x', min: 0.02, max: 0.98, step: 0.005, value: 0.6 },
    options: ['about y = 0', 'about y = −1'],
    draw: (ctx, W, H, t, st) => {
      const c = st.opt === 0 ? 0 : -1;       // axis of rotation y = c
      const out = x => x, inn = x => x * x;  // outer and inner curves
      const R = x => out(x) - c, r = x => inn(x) - c;
      const f = panel(W, H, -0.2, 2.3, c === 0 ? -1.25 : -3.15, 1.3);
      axes(ctx, f);
      const k = 0.32;  // foreshortening of the circular cross-sections
      const ell = (x, rad, col, lw, fill) => {
        const [px, py] = f(x, c);
        ctx.save(); clip(ctx, f); ctx.beginPath();
        ctx.ellipse(px, py, rad * k * f.sx, rad * f.sy, 0, 0, 2 * Math.PI);
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (col) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke(); }
        ctx.restore();
      };
      for (let i = 1; i <= 9; i++) ell(i / 10, R(i / 10), 'rgba(68,204,255,0.18)', 1);
      plot(ctx, f, x => c - R(x), 0, 1, 'rgba(68,204,255,0.45)', 1.5);
      plot(ctx, f, x => c - r(x), 0, 1, 'rgba(255,136,68,0.45)', 1.5);
      fillBetween(ctx, f, out, inn, 0, 1, 'rgba(68,204,255,0.25)');
      plot(ctx, f, out, 0, 1, C.curve, 2.4);
      plot(ctx, f, inn, 0, 1, C.sec, 2.4);
      line(ctx, f, -0.2, c, 2.3, c, C.purple, 1.5, [7, 5]);
      const x = st.s, Rx = R(x), rx = r(x);
      // washer face (ring), even-odd fill
      const [px, py] = f(x, c);
      ctx.save(); clip(ctx, f); ctx.beginPath();
      ctx.ellipse(px, py, Rx * k * f.sx, Rx * f.sy, 0, 0, 2 * Math.PI);
      ctx.ellipse(px, py, rx * k * f.sx, rx * f.sy, 0, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(255,255,102,0.35)'; ctx.fill('evenodd'); ctx.restore();
      ell(x, Rx, C.curve, 2); ell(x, rx, C.sec, 2);
      line(ctx, f, x, c, x, out(x), C.curve, 2.4);
      line(ctx, f, x + 0.012, c, x + 0.012, inn(x), C.sec, 2.4);
      const vol = st.opt === 0 ? '2π/15' : '7π/15';
      readout(ctx, f, [
        ['R(x) = ' + (c === 0 ? 'x' : 'x + 1') + ' = ' + fx(Rx, 3), C.curve],
        ['r(x) = ' + (c === 0 ? 'x^2' : 'x^2 + 1') + ' = ' + fx(rx, 3), C.sec],
        ['A(x) = π(R^2 − r^2) = ' + fx(Math.PI * (Rx * Rx - rx * rx), 3), C.hi],
        ['V = ∫_0^1 A(x) dx = ' + vol, C.text]
      ], { right: true });
    }
  },

  // average value: the level h where the area above h matches the gap below h
  avgValue: {
    period: 9000,
    slider: { label: 'level h', min: 0.3, max: 2.25, step: 0.01, value: 1 },
    draw: (ctx, W, H, t, st) => {
      const fn = x => 3 * x - x * x, a = 0, b = 3, h = st.s;
      const f = panel(W, H, -0.4, 3.5, -0.4, 2.7);
      axes(ctx, f);
      fillBetween(ctx, f, fn, x => Math.min(fn(x), h), a, b, C.fillPos);
      fillBetween(ctx, f, x => Math.max(fn(x), h), fn, a, b, C.fillNeg);
      plot(ctx, f, fn, -0.4, 3.5, C.curve, 2.6);
      line(ctx, f, a, h, b, h, C.hi, 2);
      line(ctx, f, a, 1.5, b, 1.5, C.dim, 1, [4, 4]);
      const diff = 4.5 - 3 * h;
      readout(ctx, f, [
        ['f(x) = 3x − x^2 on [0, 3]', C.curve],
        ['∫_0^3 (f − h) dx = 9/2 − 3h = ' + fx(diff, 3), Math.abs(diff) < 0.05 ? C.hi : C.text],
        ['balanced at h = f_{ave} = 3/2', C.dim]
      ], { right: true });
    }
  },

  // work against a spring: W = ∫ kx dx is the area under F = kx (k = 30 N/m)
  spring: {
    period: 9000, height: 420,
    slider: { label: 'stretch x (m)', min: 0, max: 0.5, step: 0.005, value: 0.3, fmt: v => fx(v, 3) },
    draw: (ctx, W, H, t, st) => {
      const k = 30, x = st.s;
      const top = panel(W, H, -0.08, 0.95, -0.12, 0.12, { rect: [0, 0, W, H * 0.3], padT: 0.1, padB: 0.1 });
      const bot = panel(W, H, -0.04, 0.56, -1.5, 16.5, { rect: [0, H * 0.3, W, H * 0.7] });
      // wall, spring, block
      rectW(ctx, top, -0.08, -0.12, -0.02, 0.12, '#26282e');
      const Lnat = 0.35, end = Lnat + x;
      ctx.save(); clip(ctx, top); ctx.strokeStyle = C.curve; ctx.lineWidth = 2; ctx.beginPath();
      const coils = 12; ctx.moveTo(...top(-0.02, 0));
      for (let i = 0; i <= coils * 2; i++) { const xx = -0.02 + (end + 0.02) * i / (coils * 2); ctx.lineTo(...top(xx, i === 0 || i === coils * 2 ? 0 : (i % 2 ? 0.06 : -0.06))); }
      ctx.stroke(); ctx.restore();
      rectW(ctx, top, end, -0.08, end + 0.1, 0.08, 'rgba(255,136,68,0.6)', C.sec);
      line(ctx, top, Lnat, -0.11, Lnat, 0.11, C.dim, 1, [3, 3]);
      labelAt(ctx, top, 'natural length', Lnat, 0.11, C.dim, { dx: 0.3, dy: 0, fs: top.fs * 0.8 });
      axes(ctx, bot, { yl: 'F (N)', xl: 'x (m)', stepY: 3, stepX: 0.1 });
      fillBetween(ctx, bot, s => k * s, () => 0, 0, x, 'rgba(255,255,102,0.3)');
      plot(ctx, bot, s => k * s, 0, 0.56, C.sec, 2.6);
      dot(ctx, bot, x, k * x, 5, C.hi);
      readout(ctx, bot, [
        ['Hooke: F(x) = kx,  k = 30 N/m', C.sec],
        ['F = ' + fx(k * x, 2) + ' N', C.text],
        ['W = ∫_0^x 30s ds = 15x^2 = ' + fx(15 * x * x, 3) + ' J', C.hi]
      ], { atX: 0.01 });
    }
  }
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
