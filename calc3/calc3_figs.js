/* Shared figure rendering for Calc III chapter pages.
   3-D figures use Three.js + OrbitControls (drag to rotate, scroll to zoom).
   Inherently 2-D figures use a lightweight Canvas 2-D animation loop.
   Each chapter page emits <canvas data-fig="name"></canvas> elements,
   then imports this and calls initFigures(). */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ============================================================
   2-D canvas infrastructure
   ============================================================ */

function build2D(canvas, drawFn, period = 6000) {
  let start = null;
  let grad = null, gradH = 0, gradW = 0;
  let visible = true;
  new IntersectionObserver(es => { for (const e of es) visible = e.isIntersecting; }).observe(canvas);
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = canvas.clientWidth  * dpr;
    canvas.height = canvas.clientHeight * dpr;
    grad = null;
  }
  resize();
  new ResizeObserver(resize).observe(canvas);
  function frame(ts) {
    if (!visible) { start = null; requestAnimationFrame(frame); return; }
    if (!start) start = ts;
    const t = ((ts - start) % period) / period; // 0..1 looping
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    // soft radial-ish vertical gradient background (prettier than flat #111)
    if (!grad || gradW !== W || gradH !== H) {
      grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#16171b');
      grad.addColorStop(1, '#0d0e11');
      gradW = W; gradH = H;
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    drawFn(ctx, W, H, t);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* Returns a function (wx, wy) → [px, py] fitting world rect into canvas.
   World bounds are attached as properties so helpers can draw a grid. */
function makeXf(W, H, x0, x1, y0, y1, pad = 0.1) {
  const pw = W * pad, ph = H * pad;
  const s = Math.min((W - 2*pw) / (x1 - x0), (H - 2*ph) / (y1 - y0));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const f = (wx, wy) => [W/2 + (wx - cx)*s, H/2 - (wy - cy)*s];
  f.x0 = x0; f.x1 = x1; f.y0 = y0; f.y1 = y1; f.s = s;
  return f;
}

/* nice round grid step so we get ~8 divisions across the wider span */
function niceStep(span) {
  const raw = span / 8;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  const m = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
  return m * pow;
}

function d2Axes(ctx, xf, W, H) {
  const [ox, oy] = xf(0, 0);
  const arw = Math.min(W, H) * 0.022;
  ctx.save();
  // faint world-aligned grid (only when bounds are known)
  if (xf.x0 !== undefined) {
    const stepX = niceStep(xf.x1 - xf.x0), stepY = niceStep(xf.y1 - xf.y0);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.beginPath();
    for (let gx = Math.ceil(xf.x0/stepX)*stepX; gx <= xf.x1; gx += stepX) {
      const px = xf(gx, 0)[0];
      ctx.moveTo(px, 6); ctx.lineTo(px, H - 6);
    }
    for (let gy = Math.ceil(xf.y0/stepY)*stepY; gy <= xf.y1; gy += stepY) {
      const py = xf(0, gy)[1];
      ctx.moveTo(6, py); ctx.lineTo(W - 6, py);
    }
    ctx.stroke();
  }
  // axes
  ctx.strokeStyle = '#6b6f78'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(6, oy); ctx.lineTo(W - 6, oy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ox, H - 6); ctx.lineTo(ox, 6); ctx.stroke();
  ctx.fillStyle = '#6b6f78';
  ctx.beginPath(); ctx.moveTo(W-6, oy); ctx.lineTo(W-6-arw, oy-arw*.45); ctx.lineTo(W-6-arw, oy+arw*.45); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(ox, 6); ctx.lineTo(ox-arw*.45, 6+arw); ctx.lineTo(ox+arw*.45, 6+arw); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function d2Path(ctx, xf, pts, color, lw = 2, glow = false) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 12; }
  ctx.beginPath();
  ctx.moveTo(...xf(pts[0][0], pts[0][1]));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(...xf(pts[i][0], pts[i][1]));
  ctx.stroke(); ctx.restore();
}

function d2Dot(ctx, xf, wx, wy, r, color, glow = true) {
  const [px, py] = xf(wx, wy);
  ctx.save(); ctx.fillStyle = color;
  if (glow) { ctx.shadowColor = color; ctx.shadowBlur = r * 2.2; }
  ctx.beginPath(); ctx.arc(px, py, r, 0, 2*Math.PI); ctx.fill();
  ctx.restore();
}

function d2Circle(ctx, xf, cx, cy, rWorld, color, lw = 1.5) {
  const [px, py] = xf(cx, cy);
  const [px2] = xf(cx + rWorld, cy);
  const r = Math.abs(px2 - px);
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.arc(px, py, r, 0, 2*Math.PI); ctx.stroke(); ctx.restore();
}

function d2Arrow(ctx, xf, x0, y0, x1, y1, color, lw = 2) {
  const [px0, py0] = xf(x0, y0), [px1, py1] = xf(x1, y1);
  const dx = px1-px0, dy = py1-py0, L = Math.hypot(dx, dy);
  if (L < 3) return;
  const ux = dx/L, uy = dy/L, arw = Math.max(6, L*0.22);
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.moveTo(px0, py0); ctx.lineTo(px1, py1); ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(px1, py1);
  ctx.lineTo(px1 - arw*ux + arw*.4*uy, py1 - arw*uy - arw*.4*ux);
  ctx.lineTo(px1 - arw*ux - arw*.4*uy, py1 - arw*uy + arw*.4*ux);
  ctx.closePath(); ctx.fill(); ctx.restore();
}

function polarPts(rfn, t0, t1, N = 500) {
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = t0 + (t1 - t0)*i/N;
    const r = rfn(t);
    if (isFinite(r)) pts.push([r*Math.cos(t), r*Math.sin(t)]);
  }
  return pts;
}

/* text helper, size is in device px, callers pass H-relative sizes for crispness */
function d2Text(ctx, s, px, py, color, size, opts = {}) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${opts.bold ? 'bold ' : ''}${size}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = opts.align || 'left';
  ctx.textBaseline = opts.base || 'top';
  if (opts.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = 4; }
  ctx.fillText(s, px, py);
  ctx.restore();
}

/* lightweight canvas math text that renders ^x / ^{..} / _x / _{..} as real
   super/sub-scripts so labels on figures don't show literal ^ _ { } chars. */
function d2Math(ctx, s, px, py, color, size, opts = {}) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  if (opts.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = 4; }
  const fam = 'ui-sans-serif, system-ui, sans-serif';
  const setFont = (fs) => { ctx.font = `${opts.bold ? 'bold ' : ''}${fs}px ${fam}`; };
  let x = px, i = 0;
  const draw = (str, fs, dy) => { setFont(fs); ctx.fillText(str, x, py + dy); x += ctx.measureText(str).width; };
  while (i < s.length) {
    const ch = s[i];
    if (ch === '^' || ch === '_') {
      i++;
      let tok = '';
      if (s[i] === '{') { const e = s.indexOf('}', i); tok = s.slice(i + 1, e < 0 ? s.length : e); i = e < 0 ? s.length : e + 1; }
      else { tok = s[i] ?? ''; i++; }
      draw(tok, size * 0.72, ch === '^' ? -size * 0.12 : size * 0.42);
    } else {
      let j = i;
      while (j < s.length && s[j] !== '^' && s[j] !== '_') j++;
      draw(s.slice(i, j), size, 0);
      i = j;
    }
  }
  ctx.restore();
  return x - px;
}

/* filled polar sector { (r(θ)cosθ, r(θ)sinθ) : a ≤ θ ≤ b } from the pole */
function d2Sector(ctx, xf, rfn, a, b, fill, N = 160) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(...xf(0, 0));
  for (let i = 0; i <= N; i++) {
    const th = a + (b - a) * i / N, r = rfn(th);
    ctx.lineTo(...xf(r*Math.cos(th), r*Math.sin(th)));
  }
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.restore();
}

function parametricPts(fn, t0, t1, N = 400) {
  const pts = [];
  for (let i = 0; i <= N; i++) pts.push(fn(t0 + (t1 - t0)*i/N));
  return pts;
}

/* ============================================================
   3-D helpers
   ============================================================ */

function makeLabel(text, hexColor) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 80px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8;
  ctx.fillStyle = hexColor;
  ctx.fillText(text, c.width/2, c.height/2);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  spr.scale.set(0.6, 0.3, 1);
  return spr;
}

function axes(L) {
  const g = new THREE.Group();
  const defs = [
    [new THREE.Vector3(1,0,0), 0xff5555, '#ff5555', 'x'],
    [new THREE.Vector3(0,1,0), 0x55cc55, '#55cc55', 'y'],
    [new THREE.Vector3(0,0,1), 0x5599ff, '#5599ff', 'z'],
  ];
  for (const [dir, color, hex, lbl] of defs) {
    g.add(new THREE.ArrowHelper(dir, new THREE.Vector3(), L, color, 0.18, 0.1));
    const sp = makeLabel(lbl, hex);
    sp.position.copy(dir).multiplyScalar(L + 0.35);
    g.add(sp);
  }
  return g;
}

/* grid lines that lie ON a surface.  P(a,b) maps the unit square to a point
   [x,y,z], we draw G lines each way, each sampled with S segments so curved
   surfaces get smooth grid curves.  Returned as a child of the surface mesh. */
function surfaceGrid(P, opts={}) {
  const G = opts.gridLines ?? 8, S = opts.gridSeg ?? 40;
  const pos = [];
  const addLine = (pts) => { for (let k=0;k<pts.length-1;k++) pos.push(...pts[k], ...pts[k+1]); };
  for (let gi=0; gi<=G; gi++) { const a=gi/G, pts=[]; for (let z=0;z<=S;z++) pts.push(P(a, z/S)); addLine(pts); }
  for (let gj=0; gj<=G; gj++) { const b=gj/G, pts=[]; for (let z=0;z<=S;z++) pts.push(P(z/S, b)); addLine(pts); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color: opts.gridColor ?? 0x20262b, transparent: true, opacity: opts.gridOpacity ?? 0.33, depthWrite: false });
  return new THREE.LineSegments(geo, mat);
}

function surfaceMesh(f, x0, x1, y0, y1, n, color, opts={}) {
  const geo = new THREE.BufferGeometry();
  const pos=[], idx=[];
  const Z = (x,y) => { const z=f(x,y); return isFinite(z) ? Math.max(-5, Math.min(5, z)) : 0; };
  for (let i=0;i<=n;i++) for (let j=0;j<=n;j++) {
    const x=x0+(x1-x0)*i/n, y=y0+(y1-y0)*j/n;
    pos.push(x, y, Z(x,y));
  }
  for (let i=0;i<n;i++) for (let j=0;j<n;j++) { const a=i*(n+1)+j; idx.push(a,a+1,a+n+2,a,a+n+2,a+n+1); }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({color, side:THREE.DoubleSide, shininess:60, opacity:opts.opacity??1, transparent:!!opts.transparent, wireframe:!!opts.wireframe, polygonOffset:true, polygonOffsetFactor:1, polygonOffsetUnits:1}));
  if (opts.grid !== false && !opts.wireframe) {
    mesh.add(surfaceGrid((a,b) => { const x=x0+(x1-x0)*a, y=y0+(y1-y0)*b; return [x, y, Z(x,y)]; }, opts));
  }
  return mesh;
}

function parametricMesh(f, n, color, opts={}) {
  const geo = new THREE.BufferGeometry();
  const pos=[], idx=[]; const t=new THREE.Vector3();
  for (let i=0;i<=n;i++) for (let j=0;j<=n;j++) { f(i/n, j/n, t); pos.push(t.x, t.y, t.z); }
  for (let i=0;i<n;i++) for (let j=0;j<n;j++) { const a=i*(n+1)+j; idx.push(a,a+1,a+n+2,a,a+n+2,a+n+1); }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({color, side:THREE.DoubleSide, shininess:60, opacity:opts.opacity??1, transparent:!!opts.transparent, wireframe:!!opts.wireframe, polygonOffset:true, polygonOffsetFactor:1, polygonOffsetUnits:1}));
  if (opts.grid !== false && !opts.wireframe) {
    const tg = new THREE.Vector3();
    mesh.add(surfaceGrid((a,b) => { f(a, b, tg); return [tg.x, tg.y, tg.z]; }, opts));
  }
  return mesh;
}

function tubeCurve(points, color, r=0.04) {
  return new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), points.length, r, 8, false),
    new THREE.MeshPhongMaterial({color, shininess:80})
  );
}

function vectorArrow(from, to, color) {
  const d=new THREE.Vector3().subVectors(to, from); const L=d.length(); d.normalize();
  return new THREE.ArrowHelper(d, from, L, color, 0.18, 0.1);
}

function point(x, y, z, color=0xffff66, r=0.07) {
  const m=new THREE.Mesh(new THREE.SphereGeometry(r,16,16), new THREE.MeshPhongMaterial({color}));
  m.position.set(x, y, z); return m;
}

function vectorField(F, x0,x1,y0,y1,z0,z1, step, color, scale=0.5) {
  const g=new THREE.Group();
  for (let x=x0;x<=x1;x+=step) for (let y=y0;y<=y1;y+=step) for (let z=z0;z<=z1;z+=step) {
    const v=F(x,y,z); const L=Math.hypot(v[0],v[1],v[2])*scale;
    if (L<1e-3) continue;
    const d=new THREE.Vector3(v[0],v[1],v[2]).normalize();
    g.add(new THREE.ArrowHelper(d, new THREE.Vector3(x,y,z), L, color, L*0.35, L*0.2));
  }
  return g;
}

/* ============================================================
   2-D figure definitions (FIGS2D)
   ============================================================ */

export const FIGS2D = {

  /* Ch 10 -------------------------------------------------- */

  cardioid: (ctx, W, H, t) => {
    // trace the cardioid r = 1 - cos θ from 0 to 2π
    const xf = makeXf(W, H, -2.2, 2.2, -2.2, 2.2);
    d2Axes(ctx, xf, W, H);
    const fullPts = polarPts(th => 1 - Math.cos(th), 0, 2*Math.PI);
    d2Path(ctx, xf, fullPts, '#333', 1); // ghost
    const tEnd = t * 2*Math.PI;
    const tracePts = polarPts(th => 1 - Math.cos(th), 0, tEnd, Math.max(2, Math.round(t*400)));
    d2Path(ctx, xf, tracePts, '#ff4488', 2.5);
    if (tracePts.length) {
      const [lx, ly] = tracePts[tracePts.length - 1];
      d2Dot(ctx, xf, lx, ly, 5, '#ffff66');
    }
  },

  rose: (ctx, W, H, t) => {
    // trace r = cos(3θ), one full period [0, π]
    const xf = makeXf(W, H, -1.3, 1.3, -1.3, 1.3);
    d2Axes(ctx, xf, W, H);
    const fullPts = polarPts(th => Math.cos(3*th), 0, Math.PI);
    d2Path(ctx, xf, fullPts, '#333', 1);
    const tEnd = t * Math.PI;
    const tracePts = polarPts(th => Math.cos(3*th), 0, tEnd, Math.max(2, Math.round(t*400)));
    d2Path(ctx, xf, tracePts, '#aa66ff', 2.5);
    if (tracePts.length) {
      const [lx, ly] = tracePts[tracePts.length - 1];
      d2Dot(ctx, xf, lx, ly, 5, '#ffff66');
    }
  },

  lemniscate: (ctx, W, H, t) => {
    // r² = cos(2θ): two lobes, static (discontinuous curve, animation less clear)
    const xf = makeXf(W, H, -1.3, 1.3, -1.3, 1.3);
    d2Axes(ctx, xf, W, H);
    // right lobe: θ ∈ [-π/4, π/4]
    const lobe = (a, b) => {
      const pts = [];
      for (let i = 0; i <= 300; i++) {
        const th = a + (b-a)*i/300, r2 = Math.cos(2*th);
        if (r2 < 0) continue;
        pts.push([Math.sqrt(r2)*Math.cos(th), Math.sqrt(r2)*Math.sin(th)]);
      }
      return pts;
    };
    d2Path(ctx, xf, lobe(-Math.PI/4, Math.PI/4), '#44ddaa', 2.5);
    d2Path(ctx, xf, lobe(3*Math.PI/4, 5*Math.PI/4), '#44ddaa', 2.5);
    // small pulse animation on the lemniscate
    const pulse = t * 2*Math.PI;
    const rp = Math.sqrt(Math.max(0, Math.cos(2*pulse)));
    if (rp > 0.01) d2Dot(ctx, xf, rp*Math.cos(pulse), rp*Math.sin(pulse), 5, '#ffff66');
  },

  cycloid: (ctx, W, H, t) => {
    // show the rolling circle generating the cycloid
    // x = a(θ - sinθ), y = a(1 - cosθ), a=1, θ: 0..4π
    const a = 1, tMax = 4*Math.PI;
    const xf = makeXf(W, H, -0.3, tMax + 0.3, -0.3, 2.5);
    d2Axes(ctx, xf, W, H);
    // Full cycloid ghost
    const ghost = parametricPts(th => [a*(th - Math.sin(th)), a*(1 - Math.cos(th))], 0, tMax);
    d2Path(ctx, xf, ghost, '#333', 1);
    // Traced portion
    const tNow = t * tMax;
    const trace = parametricPts(th => [a*(th - Math.sin(th)), a*(1 - Math.cos(th))], 0, tNow, Math.max(2, Math.round(t*400)));
    d2Path(ctx, xf, trace, '#44ccff', 2.5);
    // Rolling circle
    const cx = a*(tNow - Math.sin(tNow)), cy = a*(1 - Math.cos(tNow));
    const circCx = a*tNow, circCy = a; // centre of rolling circle
    d2Circle(ctx, xf, circCx, circCy, a, '#555', 1);
    // Spoke from centre to contact point on curve
    d2Path(ctx, xf, [[circCx, circCy], [cx, cy]], '#888', 1);
    d2Dot(ctx, xf, cx, cy, 5, '#ffff66');
    d2Dot(ctx, xf, circCx, circCy, 3, '#aaaaaa');
  },

  astroid: (ctx, W, H, t) => {
    // trace x = cos³t, y = sin³t
    const xf = makeXf(W, H, -1.3, 1.3, -1.3, 1.3);
    d2Axes(ctx, xf, W, H);
    const fullPts = parametricPts(th => [Math.cos(th)**3, Math.sin(th)**3], 0, 2*Math.PI);
    d2Path(ctx, xf, fullPts, '#333', 1);
    const tEnd = t * 2*Math.PI;
    const tracePts = parametricPts(th => [Math.cos(th)**3, Math.sin(th)**3], 0, tEnd, Math.max(2, Math.round(t*300)));
    d2Path(ctx, xf, tracePts, '#ff8844', 2.5);
    if (tracePts.length) {
      const [lx, ly] = tracePts[tracePts.length - 1];
      d2Dot(ctx, xf, lx, ly, 5, '#ffff66');
    }
  },

  spiral: (ctx, W, H, t) => {
    // trace the Archimedean spiral r = 0.4θ, θ: 0..6π
    const tMax = 6*Math.PI;
    const xf = makeXf(W, H, -8, 8, -8, 8);
    d2Axes(ctx, xf, W, H);
    const fullPts = polarPts(th => 0.4*th, 0, tMax, 600);
    d2Path(ctx, xf, fullPts, '#333', 1);
    const tEnd = t * tMax;
    const tracePts = polarPts(th => 0.4*th, 0, tEnd, Math.max(2, Math.round(t*600)));
    d2Path(ctx, xf, tracePts, '#ffaa22', 2.5);
    if (tracePts.length) {
      const [lx, ly] = tracePts[tracePts.length - 1];
      d2Dot(ctx, xf, lx, ly, 5, '#ffff66');
    }
  },

  /* Ch 13 -------------------------------------------------- */

  osculating: (ctx, W, H, t) => {
    // osculating circle slides along y = x²/2
    // At x=a: κ = 1/(1+a²)^(3/2), ρ = (1+a²)^(3/2)
    // Centre of osculating circle at (a, x²/2 + ρ) in normal direction
    const xf = makeXf(W, H, -2.5, 2.5, -0.3, 5.5);
    d2Axes(ctx, xf, W, H);
    const curvePts = parametricPts(x => [x, 0.5*x*x], -2.2, 2.2);
    d2Path(ctx, xf, curvePts, '#44ccff', 2.5);
    // Parameter a sweeps -2 → 2
    const a = -2 + t * 4;
    const y0 = 0.5*a*a;
    const kappa = 1 / Math.pow(1 + a*a, 1.5);
    const rho = 1 / kappa; // radius of curvature
    // Unit normal (pointing up for y=x²/2): tangent = [1, a]/|...|, normal = [-a, 1]/|...|
    const tLen = Math.hypot(1, a);
    const nx = -a / tLen, ny = 1 / tLen;
    const ocx = a + rho*nx, ocy = y0 + rho*ny;
    d2Circle(ctx, xf, ocx, ocy, rho, '#ffaa22', 1.5);
    d2Dot(ctx, xf, a, y0, 5, '#ff4444');          // point on curve
    d2Dot(ctx, xf, ocx, ocy, 3, '#ffaa22');        // centre of curvature
  },

  projectile: (ctx, W, H, t) => {
    // Animate a projectile along its parabolic trajectory
    const v0 = 12, alpha = Math.PI/3, g = 9.8;
    const tf = 2*v0*Math.sin(alpha)/g;
    const xMax = v0*Math.cos(alpha)*tf;
    const yMax = (v0*Math.sin(alpha))**2 / (2*g);
    const xf = makeXf(W, H, -0.2, xMax*1.1, -0.1, yMax*1.4);
    d2Axes(ctx, xf, W, H);
    // Full parabola ghost
    const ghost = parametricPts(s => [v0*Math.cos(alpha)*s, v0*Math.sin(alpha)*s - 0.5*g*s*s], 0, tf);
    d2Path(ctx, xf, ghost, '#333', 1);
    // Traced path
    const tNow = t * tf;
    const trace = parametricPts(s => [v0*Math.cos(alpha)*s, v0*Math.sin(alpha)*s - 0.5*g*s*s], 0, tNow, Math.max(2, Math.round(t*200)));
    d2Path(ctx, xf, trace, '#ff8844', 2.5);
    // Projectile dot + velocity arrow
    const px = v0*Math.cos(alpha)*tNow;
    const py = v0*Math.sin(alpha)*tNow - 0.5*g*tNow*tNow;
    const vx = v0*Math.cos(alpha), vy = v0*Math.sin(alpha) - g*tNow;
    const scale = 0.25;
    d2Arrow(ctx, xf, px, py, px + vx*scale, py + vy*scale, '#ff4444', 2);
    d2Dot(ctx, xf, px, py, 6, '#ffff66');
  },

  /* Ch 14 -------------------------------------------------- */

  lagrange: (ctx, W, H, t) => {
    // level curves of f=xy (hyperbolas) + constraint circle x²+y²=8
    // with tangency points marked
    const xf = makeXf(W, H, -3.5, 3.5, -3.5, 3.5);
    d2Axes(ctx, xf, W, H);
    // Constraint circle x²+y²=8 (r=2√2)
    const R = Math.sqrt(8);
    const circlePts = parametricPts(th => [R*Math.cos(th), R*Math.sin(th)], 0, 2*Math.PI + 0.01);
    d2Path(ctx, xf, circlePts, '#ff4444', 2);
    // Level curves of f=xy: xy=k → y=k/x
    for (const k of [-3, -1.5, 1.5, 3]) {
      const color = k > 0 ? '#4488ff' : '#44aaff';
      const pts1 = [], pts2 = [];
      for (let i = 1; i <= 200; i++) {
        const x = 0.15 + 3.2*i/200; pts1.push([x, k/x]);
        pts2.push([-x, k/(-x)]);
      }
      d2Path(ctx, xf, pts1, color, 1.5);
      d2Path(ctx, xf, pts2, color, 1.5);
    }
    // Tangency points at (±2, ±2) (max f=4) and (±2, ∓2) (min f=-4)
    const pts_max = [[2,2],[-2,-2]], pts_min = [[2,-2],[-2,2]];
    for (const [x,y] of pts_max) d2Dot(ctx, xf, x, y, 6, '#ffff66');
    for (const [x,y] of pts_min) d2Dot(ctx, xf, x, y, 6, '#ff8844');
    // a point traces the constraint circle with gradient arrows
    const th = t * 2*Math.PI;
    const px = R*Math.cos(th), py = R*Math.sin(th);
    // ∇f = <y, x>, ∇g = 2<x, y>
    const scale = 0.35;
    d2Arrow(ctx, xf, px, py, px + py*scale, py + px*scale, '#44ff88', 2);
    d2Arrow(ctx, xf, px, py, px + 2*px*scale, py + 2*py*scale, '#ff8844', 2);
    d2Dot(ctx, xf, px, py, 5, '#ffffff');
  },

  /* Ch 16 -------------------------------------------------- */

  swirl: (ctx, W, H, _t) => {
    // Vector field F = <-y, x>, static arrow grid
    const xf = makeXf(W, H, -2.2, 2.2, -2.2, 2.2);
    d2Axes(ctx, xf, W, H);
    const step = 0.7;
    for (let x = -1.75; x <= 1.75; x += step) {
      for (let y = -1.75; y <= 1.75; y += step) {
        const fx = -y, fy = x;
        const L = Math.hypot(fx, fy);
        if (L < 0.01) continue;
        const s = 0.28 / L;
        d2Arrow(ctx, xf, x, y, x + fx*s, y + fy*s, '#4488ff', 1.5);
      }
    }
  },

  gradField: (ctx, W, H, _t) => {
    // Conservative field F = ∇(xy) = <y, x>
    const xf = makeXf(W, H, -2.2, 2.2, -2.2, 2.2);
    d2Axes(ctx, xf, W, H);
    // Level curves of φ=xy (same hyperbolas as lagrange, grey)
    for (const k of [-1.5, -0.5, 0.5, 1.5]) {
      const pts1 = [], pts2 = [];
      for (let i = 1; i <= 150; i++) {
        const x = 0.15 + 2*i/150; pts1.push([x, k/x]); pts2.push([-x, k/(-x)]);
      }
      d2Path(ctx, xf, pts1, '#333', 1);
      d2Path(ctx, xf, pts2, '#333', 1);
    }
    const step = 0.7;
    for (let x = -1.75; x <= 1.75; x += step) {
      for (let y = -1.75; y <= 1.75; y += step) {
        const fx = y, fy = x;
        const L = Math.hypot(fx, fy);
        if (L < 0.01) continue;
        const s = 0.28 / L;
        d2Arrow(ctx, xf, x, y, x + fx*s, y + fy*s, '#44dd88', 1.5);
      }
    }
  },

  shear: (ctx, W, H, _t) => {
    // Shear field F = <y, 0>
    const xf = makeXf(W, H, -2.2, 2.2, -2.2, 2.2);
    d2Axes(ctx, xf, W, H);
    const step = 0.7;
    for (let x = -1.75; x <= 1.75; x += step) {
      for (let y = -1.75; y <= 1.75; y += step) {
        const fx = y, fy = 0;
        if (Math.abs(fx) < 0.01) continue;
        const s = 0.28 / Math.abs(fx);
        d2Arrow(ctx, xf, x, y, x + fx*s, y + fy*s, '#ff66aa', 1.5);
      }
    }
  },

  greens: (ctx, W, H, t) => {
    // Closed curve C (slightly bumpy circle) + filled region D
    // show the CCW orientation with a moving dot
    const xf = makeXf(W, H, -2.2, 2.2, -2.2, 2.2);
    d2Axes(ctx, xf, W, H);
    const curveFn = th => {
      const r = 1.5 + 0.3*Math.cos(3*th);
      return [r*Math.cos(th), r*Math.sin(th)];
    };
    const N = 200;
    const pts = parametricPts(th => curveFn(th), 0, 2*Math.PI, N);
    // Fill region
    const [cx0, cy0] = xf(pts[0][0], pts[0][1]);
    const ctx2 = ctx;
    ctx2.save();
    ctx2.fillStyle = 'rgba(68, 136, 255, 0.2)';
    ctx2.beginPath();
    ctx2.moveTo(cx0, cy0);
    for (let i = 1; i < pts.length; i++) { const [px, py] = xf(pts[i][0], pts[i][1]); ctx2.lineTo(px, py); }
    ctx2.closePath(); ctx2.fill(); ctx2.restore();
    d2Path(ctx, xf, [...pts, pts[0]], '#4488ff', 2.5);
    // Animated dot moving CCW
    const th = t * 2*Math.PI;
    const [dx, dy] = curveFn(th);
    d2Dot(ctx, xf, dx, dy, 6, '#ffff66');
    // Arrow showing CCW direction
    const dth = 0.15;
    const [dx2, dy2] = curveFn(th + dth);
    d2Arrow(ctx, xf, dx, dy, dx2, dy2, '#ffaa22', 2);
  },
};

/* particle-flow helper.  draws an arrow grid for F and animates particles
   along its integral curves (Euler integration). */
const _flowState = new WeakMap();
function flowField(ctx, W, H, F, opts = {}) {
  const xMin = opts.xMin ?? -2.2, xMax = opts.xMax ?? 2.2;
  const yMin = opts.yMin ?? -2.2, yMax = opts.yMax ?? 2.2;
  const arrowColor = opts.arrowColor ?? '#4488ff';
  const particleColor = opts.particleColor ?? '#ffcc44';
  const N = opts.N ?? 70;          // number of particles
  const speed = opts.speed ?? 0.02; // world-units per frame
  const xf = makeXf(W, H, xMin, xMax, yMin, yMax);
  d2Axes(ctx, xf, W, H);

  // background arrow grid
  const step = opts.step ?? 0.7;
  for (let x = xMin + step/2; x <= xMax - step/2; x += step) {
    for (let y = yMin + step/2; y <= yMax - step/2; y += step) {
      const [fx, fy] = F(x, y);
      const L = Math.hypot(fx, fy);
      if (L < 0.005) continue;
      const s = Math.min(0.32, 0.28 * L) / L;
      d2Arrow(ctx, xf, x, y, x + fx*s, y + fy*s, arrowColor, 1.3);
    }
  }

  // particle state per canvas
  let state = _flowState.get(ctx.canvas);
  if (!state || state.N !== N) {
    state = { N, P: [] };
    for (let i = 0; i < N; i++) {
      state.P.push({
        x: xMin + Math.random() * (xMax - xMin),
        y: yMin + Math.random() * (yMax - yMin),
        age: Math.random() * 200
      });
    }
    _flowState.set(ctx.canvas, state);
  }

  // advance and draw
  for (const p of state.P) {
    const [fx, fy] = F(p.x, p.y);
    const L = Math.hypot(fx, fy);
    if (L > 1e-4) {
      p.x += speed * fx / Math.max(1, L);
      p.y += speed * fy / Math.max(1, L);
    }
    p.age++;
    if (p.x < xMin || p.x > xMax || p.y < yMin || p.y > yMax || p.age > 300) {
      p.x = xMin + Math.random() * (xMax - xMin);
      p.y = yMin + Math.random() * (yMax - yMin);
      p.age = 0;
    }
    d2Dot(ctx, xf, p.x, p.y, 2.2, particleColor);
  }
}

/* add flow versions to FIGS2D */
Object.assign(FIGS2D, {
  swirlFlow: (ctx, W, H, _t) =>
    flowField(ctx, W, H, (x, y) => [-y, x], { arrowColor: '#4488ff', particleColor: '#ffe066', speed: 0.018 }),
  radialFlow: (ctx, W, H, _t) =>
    flowField(ctx, W, H, (x, y) => [x, y], { arrowColor: '#ff8844', particleColor: '#ffe066', speed: 0.025 }),
  gradFlow: (ctx, W, H, _t) =>
    flowField(ctx, W, H, (x, y) => [y, x], { arrowColor: '#44dd88', particleColor: '#ffe066', speed: 0.018 }),
  shearFlow: (ctx, W, H, _t) =>
    flowField(ctx, W, H, (x, y) => [y, 0], { arrowColor: '#ff66aa', particleColor: '#ffe066', speed: 0.018 }),
  curlFlow: (ctx, W, H, _t) =>
    flowField(ctx, W, H, (x, y) => [-y, x], { arrowColor: '#4488ff', particleColor: '#ffaa22', speed: 0.02, N: 90 }),
  divPlusFlow: (ctx, W, H, _t) =>
    flowField(ctx, W, H, (x, y) => [x, y], { arrowColor: '#ff7733', particleColor: '#ffe066', speed: 0.025, N: 90 }),
  divMinusFlow: (ctx, W, H, _t) =>
    flowField(ctx, W, H, (x, y) => [-x, -y], { arrowColor: '#33aacc', particleColor: '#ffe066', speed: 0.025, N: 90 }),

  /* projectile motion, a particle on the parabola y(x) = x - g x^2 / (2 v0^2 cos^2 alpha)
     animated over its full flight, with T, N, a, a_T, a_N drawn at each instant.
     parameters chosen so the path fits the box, v0 = 1, alpha = 60 deg, g = 1.6 → range ~ 0.54,
     so scale up by 6.   reset every period. */
  projectileTNa: (ctx, W, H, t) => {
    const v0 = 6, alpha = Math.PI/3, g = 6;
    const vx = v0 * Math.cos(alpha), vy = v0 * Math.sin(alpha);
    const tf = 2 * vy / g;            // flight time
    const tau = t * tf;               // current time
    const x = vx * tau;
    const y = vy * tau - 0.5 * g * tau * tau;
    const range = vx * tf;
    const xMax = range + 1, yMax = vy*vy/(2*g) + 1;
    const xf = makeXf(W, H, -0.3, xMax, -0.3, yMax);

    d2Axes(ctx, xf, W, H);

    // the full parabolic path
    const path = [];
    for (let i = 0; i <= 200; i++) {
      const s = i/200 * tf;
      path.push([vx * s, vy * s - 0.5*g*s*s]);
    }
    d2Path(ctx, xf, path, '#3399ff', 2);

    // velocity vector v = <vx, vy - g*tau>
    const vxNow = vx, vyNow = vy - g * tau;
    const speed = Math.hypot(vxNow, vyNow);
    // unit tangent T and unit normal N (counterclockwise rotation of T)
    const Tx = vxNow / speed, Ty = vyNow / speed;
    const Nx = -Ty,           Ny =  Tx;        // points up/left when v points up/right

    // acceleration is constant, a = <0, -g>
    const ax = 0, ay = -g;
    // tangential / normal decomposition
    const aT = ax*Tx + ay*Ty;
    const aN = ax*Nx + ay*Ny;

    // pick visualisation lengths in world coords
    const sV = 0.6, sA = 0.18;     // scale velocity and accel arrows so they fit
    // unit T and N arrows for direction only
    d2Arrow(ctx, xf, x, y, x + 0.7*Tx, y + 0.7*Ty, '#22cc66', 2.4);
    d2Arrow(ctx, xf, x, y, x + 0.7*Nx, y + 0.7*Ny, '#ff66aa', 2.4);
    // full acceleration a (purple, points straight down)
    d2Arrow(ctx, xf, x, y, x + sA*ax, y + sA*ay, '#aa44dd', 2.6);
    // tangential component a_T T  (along curve)
    d2Arrow(ctx, xf, x, y, x + sA*aT*Tx, y + sA*aT*Ty, '#22cc66', 1.6);
    // normal component a_N N (perpendicular)
    d2Arrow(ctx, xf, x + sA*aT*Tx, y + sA*aT*Ty, x + sA*ax, y + sA*ay, '#ff66aa', 1.6);

    // body
    d2Dot(ctx, xf, x, y, 6, '#ffaa22');

    // text overlay
    d2Math(ctx, `t = ${tau.toFixed(2)}    |v| = ${speed.toFixed(2)}`, 12, 8, '#eee', 14, {bold:true});
    d2Math(ctx, `a_T = ${aT.toFixed(2)}    a_N = ${aN.toFixed(2)}    g = ${g}`, 12, 28, '#eee', 14, {bold:true});
  },
});

/* ============================================================
   New figures (added): tangents, polar area, dot product, curvature
   ============================================================ */
Object.assign(FIGS2D, {

  /* Ch 10, a parametric Lissajous curve with live velocity vector.
     Marks where the tangent is horizontal (dy/dt=0) or vertical (dx/dt=0). */
  lissajousTangent: (ctx, W, H, t) => {
    const F = Math.round(H * 0.038);
    const xf = makeXf(W, H, -1.5, 1.5, -1.5, 1.5);
    d2Axes(ctx, xf, W, H);
    const fn = th => [Math.cos(th), Math.sin(2*th)];
    d2Path(ctx, xf, parametricPts(fn, 0, 2*Math.PI), '#2c303a', 1.6);
    const tEnd = t * 2*Math.PI;
    d2Path(ctx, xf, parametricPts(fn, 0, tEnd, Math.max(2, Math.round(t*420))), '#46c8ff', 2.6, true);
    // fixed markers, horizontal tangents at cos2t=0 (t=π/4,3π/4,…), vertical at sin t=0 (t=0,π)
    for (const tt of [Math.PI/4, 3*Math.PI/4, 5*Math.PI/4, 7*Math.PI/4]) {
      const [x,y] = fn(tt); d2Dot(ctx, xf, x, y, 3.2, '#5bd6a0', false);
    }
    for (const tt of [0, Math.PI]) { const [x,y] = fn(tt); d2Dot(ctx, xf, x, y, 3.2, '#c08af0', false); }
    // moving point + velocity arrow
    const [px,py] = fn(tEnd);
    const vx = -Math.sin(tEnd), vy = 2*Math.cos(2*tEnd);
    const L = Math.hypot(vx,vy), sc = 0.55 / Math.max(0.7, L);
    d2Arrow(ctx, xf, px, py, px+vx*sc, py+vy*sc, '#ff5d73', 2.6);
    d2Dot(ctx, xf, px, py, 5.5, '#ffe066');
    d2Text(ctx, 'x = cos t,   y = sin 2t', 12, 8, '#dfe3ea', F, {bold:true, shadow:true});
    d2Text(ctx, '● horizontal tangent  dy/dt = 0', 12, 12+F*1.3, '#5bd6a0', F*0.86, {shadow:true});
    d2Text(ctx, '● vertical tangent  dx/dt = 0', 12, 12+F*2.4, '#c08af0', F*0.86, {shadow:true});
  },

  /* Ch 10, polar area as a sweeping wedge.  Fills the sector swept so far and
     shows the running value of A = ½∫ r² dθ for the cardioid r = 1 - cos θ. */
  polarAreaSweep: (ctx, W, H, t) => {
    const F = Math.round(H * 0.038);
    const xf = makeXf(W, H, -2.6, 1.4, -2.1, 2.1);
    d2Axes(ctx, xf, W, H);
    const rfn = th => 1 - Math.cos(th);
    const thEnd = t * 2*Math.PI;
    // shade swept sector
    d2Sector(ctx, xf, rfn, 0, Math.max(0.0001, thEnd), 'rgba(70,200,255,0.16)');
    // full cardioid ghost + traced part
    d2Path(ctx, xf, polarPts(rfn, 0, 2*Math.PI), '#2c303a', 1.6);
    d2Path(ctx, xf, polarPts(rfn, 0, thEnd, Math.max(2, Math.round(t*420))), '#46c8ff', 2.4, true);
    // sweeping radius
    const re = rfn(thEnd);
    d2Arrow(ctx, xf, 0, 0, re*Math.cos(thEnd), re*Math.sin(thEnd), '#ffaa3a', 2.2);
    d2Dot(ctx, xf, re*Math.cos(thEnd), re*Math.sin(thEnd), 4.5, '#ffe066');
    // running area, numerically integrated
    let area = 0; const M = Math.max(1, Math.round(thEnd/0.01));
    for (let i=0;i<M;i++){const th=thEnd*(i+0.5)/M; const r=rfn(th); area += 0.5*r*r*(thEnd/M);}
    d2Text(ctx, 'r = 1 - cos θ', 12, 8, '#dfe3ea', F, {bold:true, shadow:true});
    d2Math(ctx, `A = ½∫_0^θ r² dθ = ${area.toFixed(3)}`, 12, 12+F*1.3, '#9fe6c4', F*0.92, {shadow:true});
    d2Text(ctx, `θ = ${thEnd.toFixed(2)}    (total → 3π/2 ≈ 4.712)`, 12, 12+F*2.5, '#9aa0aa', F*0.82, {shadow:true});
  },

  /* Ch 10, area inside the cardioid r = 1 + sin θ and outside the circle r = 1
     (the worked example).  Shades the crescent and reports A = 2 + π/4. */
  polarBetween: (ctx, W, H, t) => {
    const F = Math.round(H * 0.038);
    const xf = makeXf(W, H, -2.2, 2.2, -1.3, 2.5);
    d2Axes(ctx, xf, W, H);
    const card = th => 1 + Math.sin(th);
    // crescent region (θ ∈ [0,π], between circle r=1 and cardioid)
    ctx.save(); ctx.beginPath();
    const N = 160;
    for (let i=0;i<=N;i++){const th=Math.PI*i/N; const r=card(th); if(i===0)ctx.moveTo(...xf(r*Math.cos(th),r*Math.sin(th))); else ctx.lineTo(...xf(r*Math.cos(th),r*Math.sin(th)));}
    for (let i=N;i>=0;i--){const th=Math.PI*i/N; ctx.lineTo(...xf(Math.cos(th),Math.sin(th)));}
    ctx.closePath(); ctx.fillStyle='rgba(70,200,255,0.16)'; ctx.fill(); ctx.restore();
    // curves
    d2Path(ctx, xf, polarPts(card, 0, 2*Math.PI), '#46c8ff', 2.4, true);
    d2Path(ctx, xf, polarPts(()=>1, 0, 2*Math.PI), '#ff8a5c', 2.0);
    // intersection points θ=0,π → (1,0),(-1,0)
    d2Dot(ctx, xf, 1, 0, 4, '#ffe066'); d2Dot(ctx, xf, -1, 0, 4, '#ffe066');
    // moving ray showing the gap r=1 .. 1+sinθ
    const th = Math.PI * (0.5 - 0.5*Math.cos(2*Math.PI*t)); // eased 0..π..0
    const c=Math.cos(th), s=Math.sin(th);
    d2Path(ctx, xf, [[c, s],[card(th)*c, card(th)*s]], '#ffd24a', 2.4);
    d2Text(ctx, 'inside r = 1 + sin θ,  outside r = 1', 12, 8, '#dfe3ea', F, {bold:true, shadow:true});
    d2Math(ctx, 'A = ½∫_0^π [(1+sinθ)² - 1] dθ = 2 + π/4 ≈ 2.785', 12, 12+F*1.3, '#9fe6c4', F*0.84, {shadow:true});
  },

  /* Ch 12, dot product as projection.  Vector a is fixed, b rotates.
     Shows proj_a b, the angle θ, and the live value a·b = |a||b|cosθ. */
  dotProjection: (ctx, W, H, t) => {
    const F = Math.round(H * 0.038);
    const xf = makeXf(W, H, -2.4, 2.4, -2.4, 2.4);
    d2Axes(ctx, xf, W, H);
    const a = [2.0, 0.75];
    const aLen = Math.hypot(a[0], a[1]);
    const ah = [a[0]/aLen, a[1]/aLen];
    const phi = 2*Math.PI*t;
    const bLen = 1.7;
    const b = [bLen*Math.cos(phi), bLen*Math.sin(phi)];
    const dot = a[0]*b[0] + a[1]*b[1];
    const scal = dot / aLen;              // comp_a b
    const proj = [scal*ah[0], scal*ah[1]];
    // line of a (faint, both directions)
    d2Path(ctx, xf, [[-2.4*ah[0], -2.4*ah[1]], [2.4*ah[0], 2.4*ah[1]]], '#2c303a', 1.4);
    // projection segment (pink) then dashed drop from b tip
    d2Path(ctx, xf, [[0,0], proj], '#ff5d99', 5);
    ctx.save(); ctx.setLineDash([6,5]);
    d2Path(ctx, xf, [b, proj], '#7f8794', 1.6);
    ctx.restore();
    d2Arrow(ctx, xf, 0,0, a[0],a[1], '#9aa6c8', 2.6);
    d2Arrow(ctx, xf, 0,0, b[0],b[1], '#46c8ff', 2.8);
    d2Dot(ctx, xf, b[0], b[1], 4.5, '#ffe066');
    const theta = Math.acos(Math.max(-1,Math.min(1, dot/(aLen*bLen))));
    d2Text(ctx, 'a · b = |a||b| cos θ', 12, 8, '#dfe3ea', F, {bold:true, shadow:true});
    d2Text(ctx, `θ = ${(theta*180/Math.PI).toFixed(0)}°    a · b = ${dot.toFixed(2)}`,
           12, 12+F*1.3, dot>=0?'#9fe6c4':'#ff8a5c', F*0.92, {shadow:true});
    d2Text(ctx, 'pink = proj of b onto a', 12, 12+F*2.5, '#ff5d99', F*0.82, {shadow:true});
  },

  /* Ch 13, osculating circle gliding around an ellipse r(t)=(2cos t, sin t).
     κ = 2/(4sin²t+cos²t)^{3/2}, centre = P + ρ N (inward normal). */
  osculatingEllipse: (ctx, W, H, t) => {
    const F = Math.round(H * 0.038);
    const xf = makeXf(W, H, -3.0, 3.0, -2.4, 2.4);
    d2Axes(ctx, xf, W, H);
    d2Path(ctx, xf, parametricPts(th => [2*Math.cos(th), Math.sin(th)], 0, 2*Math.PI), '#46c8ff', 2.6, true);
    const tt = 2*Math.PI*t;
    const P = [2*Math.cos(tt), Math.sin(tt)];
    const d1 = [-2*Math.sin(tt), Math.cos(tt)];
    const speed = Math.hypot(d1[0], d1[1]);
    const cross = 2;                       // x'y''-y'x'' = 2 for this ellipse
    const kappa = Math.abs(cross) / speed**3;
    const rho = 1/kappa;
    const N = [-d1[1]/speed, d1[0]/speed];  // inward normal (CCW)
    const C = [P[0] + rho*N[0], P[1] + rho*N[1]];
    d2Circle(ctx, xf, C[0], C[1], rho, '#ffaa3a', 1.8);
    d2Path(ctx, xf, [P, C], '#7f8794', 1.4);
    d2Dot(ctx, xf, C[0], C[1], 3.5, '#ffaa3a');
    d2Dot(ctx, xf, P[0], P[1], 5.5, '#ffe066');
    d2Text(ctx, 'ellipse  x²/4 + y² = 1', 12, 8, '#dfe3ea', F, {bold:true, shadow:true});
    d2Text(ctx, `κ = ${kappa.toFixed(3)}    ρ = 1/κ = ${rho.toFixed(3)}`, 12, 12+F*1.3, '#ffd07a', F*0.92, {shadow:true});
    d2Text(ctx, 'tight turns at the ends, gentle at top/bottom', 12, 12+F*2.5, '#9aa0aa', F*0.8, {shadow:true});
  },

});

/* ============================================================
   3-D figure definitions (FIGS)
   ============================================================ */

/* Build a tetrahedron x+y+z <= 1 with a sweeping plane perpendicular to the
   chosen outer axis ('x', 'y', or 'z').  As t : 0 -> 1 the swept-through chunk
   fills in solid, the rest is wireframe. */
function makeTetraOrder(s, outerAxis, label) {
  s.add(axes(1.6));

  // four vertices of the unit tetrahedron
  const V = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ];

  // helper, build a Mesh from a list of triangles given by index triples into V
  function tetMesh(color, opacity, wire = false) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(V.flatMap(v => [v.x, v.y, v.z]));
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex([0,1,2, 0,2,3, 0,3,1, 1,3,2]);
    g.computeVertexNormals();
    return new THREE.Mesh(g, new THREE.MeshPhongMaterial({color, opacity, transparent: true, wireframe: wire, side: THREE.DoubleSide}));
  }

  // outline of the whole tetrahedron always shown
  const outline = tetMesh(0x88aaff, 0.15);
  s.add(outline);
  const wire = tetMesh(0x6688cc, 0.7, true);
  s.add(wire);

  // group holding the swept (solid) slab that we will rebuild every frame
  const slab = new THREE.Group();
  s.add(slab);

  // text overlay for current slice value
  const sweepNote = document.createElement('canvas');
  sweepNote.width = 256; sweepNote.height = 64;
  // we draw label dynamically through the userData.tick hook

  // helper, at parameter t, build the filled chunk where outerAxis <= t
  function rebuild(t) {
    while (slab.children.length) slab.remove(slab.children[0]);
    if (t <= 0.005) return;

    // chunk = tetrahedron intersected with {outerAxis <= t}
    // its vertices are the original tetrahedron vertices plus three new ones
    // where the cutting plane meets the three edges from the "outer" vertex.
    // for clarity we just discretise, build a thick slab of axis-aligned tiny
    // box columns within the cut chunk.
    const N = 16;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        // pick coordinates a, b for the two non-outer axes
        const a = (i + 0.5) / N;
        const b = (j + 0.5) / N;
        // upper bound of the outer coord at (a, b) inside the tetrahedron
        // outer + a + b <= 1, so outer <= 1 - a - b
        const cap = 1 - a - b;
        if (cap <= 0) continue;
        // the column of outer values in [0, min(t, cap)]
        const hi = Math.min(t, cap);
        const dx = 1 / N;
        let pos;
        if (outerAxis === 'z') pos = new THREE.Vector3(a, b, hi/2);
        if (outerAxis === 'y') pos = new THREE.Vector3(a, hi/2, b);
        if (outerAxis === 'x') pos = new THREE.Vector3(hi/2, a, b);
        const size = [dx, dx, dx];
        if (outerAxis === 'z') size[2] = hi;
        if (outerAxis === 'y') size[1] = hi;
        if (outerAxis === 'x') size[0] = hi;
        const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
        const mat = new THREE.MeshPhongMaterial({color: 0xff8844, opacity: 0.7, transparent: true});
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        slab.add(mesh);
      }
    }
  }

  // sweeping plane visualisation
  const planeGeo = new THREE.PlaneGeometry(2, 2);
  const planeMat = new THREE.MeshPhongMaterial({color: 0xffe066, opacity: 0.25, transparent: true, side: THREE.DoubleSide});
  const sweepPlane = new THREE.Mesh(planeGeo, planeMat);
  s.add(sweepPlane);

  s.userData.tick = (tsec) => {
    // ping-pong: 0 -> 1 over 6 s, then 1 -> 0 over 6 s
    const period = 12;
    let t = (tsec % period) / period * 2; // 0..2
    if (t > 1) t = 2 - t;
    rebuild(t);
    // position + orient the cutting plane
    if (outerAxis === 'z') { sweepPlane.position.set(0.5, 0.5, t); sweepPlane.rotation.set(0, 0, 0); }
    if (outerAxis === 'y') { sweepPlane.position.set(0.5, t, 0.5); sweepPlane.rotation.set(Math.PI/2, 0, 0); }
    if (outerAxis === 'x') { sweepPlane.position.set(t, 0.5, 0.5); sweepPlane.rotation.set(0, Math.PI/2, 0); }
  };
  s.userData.tick(0);
}

export const FIGS = {

  /* Ch 12 -------------------------------------------------- */
  cross: s => {
    s.add(axes(3));
    const a=new THREE.Vector3(2,0.4,0.2), b=new THREE.Vector3(0.5,1.8,0.3), c=new THREE.Vector3().crossVectors(a,b), O=new THREE.Vector3();
    s.add(vectorArrow(O,a,0xff4444)); s.add(vectorArrow(O,b,0x44aaff)); s.add(vectorArrow(O,c,0x88ff44));
    const v=new Float32Array([0,0,0, a.x,a.y,a.z, a.x+b.x,a.y+b.y,a.z+b.z, b.x,b.y,b.z]);
    const g=new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(v,3)); g.setIndex([0,1,2,0,2,3]); g.computeVertexNormals();
    s.add(new THREE.Mesh(g, new THREE.MeshPhongMaterial({color:0x6688aa, opacity:0.45, transparent:true, side:THREE.DoubleSide})));
  },
  planeDist: s => {
    s.add(axes(3));
    s.add(parametricMesh((u,v,t)=>{const x=(u-0.5)*4,y=(v-0.5)*4; t.set(x,y,1-x-y);}, 40, 0x88aaff, {opacity:0.55, transparent:true}));
    const Q0=new THREE.Vector3(0.3,0.3,0.4), P=new THREE.Vector3(1.7,1.4,2.0), n=new THREE.Vector3(1,1,1).normalize();
    const d=P.clone().sub(Q0).dot(n); const foot=P.clone().sub(n.clone().multiplyScalar(d));
    s.add(point(P.x,P.y,P.z,0xff4444)); s.add(point(Q0.x,Q0.y,Q0.z,0xffaa44));
    s.add(vectorArrow(foot, P, 0xff8844));            // D (orange)
    s.add(vectorArrow(Q0, P, 0x4488ff));              // Q_0 P (blue)
    s.add(vectorArrow(Q0, Q0.clone().add(n), 0xff66aa)); // n hat (pink)
    // dashed line from P down to the foot of the perpendicular
    const dashGeo = new THREE.BufferGeometry().setFromPoints([P, foot]);
    const dashLine = new THREE.Line(dashGeo, new THREE.LineDashedMaterial({color: 0xff4444, dashSize: 0.12, gapSize: 0.08}));
    dashLine.computeLineDistances();
    s.add(dashLine);
  },

  /* projection with shadow.  a rotates around the origin in the xy plane.
     b sits along the world x axis.  a light source straight above (z = 4) shines down,
     casting a's shadow on the b-axis.  the shadow length = proj_b a = (a . b_hat). */
  projShadow: s => {
    s.add(axes(3));
    // floor plane (the xy-plane) shaded so the shadow is visible
    s.add(parametricMesh((u, v, t) => { t.set((u-0.5)*4, (v-0.5)*4, 0); }, 30, 0xbbcccc, {opacity:0.25, transparent:true}));
    // fixed b along x axis, length 2.4
    const b = new THREE.Vector3(2.4, 0, 0);
    s.add(vectorArrow(new THREE.Vector3(), b, 0x4488ff));
    // dynamic a, its tail is at origin and it rotates with time
    const aGroup = new THREE.Group();
    s.add(aGroup);
    const lightMesh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), new THREE.MeshPhongMaterial({color: 0xffe066, emissive: 0xffaa00}));
    lightMesh.position.set(0, 0, 3.2);
    s.add(lightMesh);
    // animation hook via userData
    s.userData.tick = (tsec) => {
      // a rotates in the xz plane sweeping from 30 deg to 150 deg
      const ang = Math.PI/2 + 0.6 * Math.sin(tsec);
      const ax = 2.2 * Math.cos(ang), az = 2.2 * Math.sin(ang);
      const a = new THREE.Vector3(ax, 0, az);
      // clear and redraw aGroup
      while (aGroup.children.length) aGroup.remove(aGroup.children[0]);
      // a arrow (red)
      aGroup.add(vectorArrow(new THREE.Vector3(), a, 0xff4444));
      // shadow of a on b axis = (a . b_hat) along b
      const shadowLen = (a.x * b.x + a.y * b.y + a.z * b.z) / b.length();
      const shadowEnd = new THREE.Vector3(shadowLen, 0, 0);
      // thick segment along the x axis representing the shadow
      const cylH = Math.abs(shadowLen);
      if (cylH > 0.01) {
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, cylH, 12), new THREE.MeshPhongMaterial({color: 0xff66aa, opacity: 0.9, transparent: true}));
        cyl.position.set(shadowLen/2, 0, 0);
        cyl.rotation.z = Math.PI/2;
        aGroup.add(cyl);
      }
      // dashed line from a tip down to its shadow on the floor
      const fall = new THREE.Vector3(a.x, 0, 0); // light is parallel to z so shadow is (a.x, 0, 0)
      const lineGeo = new THREE.BufferGeometry().setFromPoints([a, fall]);
      const dashMat = new THREE.LineDashedMaterial({color: 0xffaa66, dashSize: 0.12, gapSize: 0.08});
      const line = new THREE.Line(lineGeo, dashMat);
      line.computeLineDistances();
      aGroup.add(line);
    };
    s.userData.tick(0);
  },
  ellipsoid: s => { s.add(axes(4)); s.add(parametricMesh((u,v,t)=>{const ph=u*Math.PI, th=v*2*Math.PI; t.set(2*Math.sin(ph)*Math.cos(th), Math.sin(ph)*Math.sin(th), 3*Math.cos(ph));}, 60, 0x44cc88)); },
  paraboloid: s => { s.add(axes(3)); s.add(surfaceMesh((x,y)=>x*x+y*y, -2, 2, -2, 2, 60, 0x4488ff)); },
  saddle:    s => { s.add(axes(3)); s.add(surfaceMesh((x,y)=>x*x-y*y, -2, 2, -2, 2, 60, 0xff6644)); },
  cone:      s => { s.add(axes(3)); s.add(parametricMesh((u,v,t)=>{const r=(u-0.5)*4, th=v*2*Math.PI; t.set(Math.abs(r)*Math.cos(th), Math.abs(r)*Math.sin(th), r);}, 60, 0xff4488)); },
  hyp1:      s => { s.add(axes(3)); s.add(parametricMesh((u,v,t)=>{const z=(u-0.5)*4, th=v*2*Math.PI, r=Math.sqrt(1+z*z); t.set(r*Math.cos(th), r*Math.sin(th), z);}, 60, 0xffaa22)); },
  hyp2:      s => {
    s.add(axes(4));
    s.add(parametricMesh((u,v,t)=>{const r=u*2, th=v*2*Math.PI; t.set(r*Math.cos(th), r*Math.sin(th), Math.sqrt(1+r*r));}, 50, 0xaa55ff));
    s.add(parametricMesh((u,v,t)=>{const r=u*2, th=v*2*Math.PI; t.set(r*Math.cos(th), r*Math.sin(th), -Math.sqrt(1+r*r));}, 50, 0xaa55ff));
  },

  /* Ch 13 -------------------------------------------------- */
  helix: s => {
    s.add(axes(4));
    const pts=[]; for (let i=0;i<=400;i++){const t=(i/400)*4*Math.PI; pts.push(new THREE.Vector3(Math.cos(t), Math.sin(t), t/2));}
    s.add(tubeCurve(pts, 0x44ccff));
  },
  taylorCurve: s => {
    // Space curve r(t) = (t, t²/2, t³/6) with linear and quadratic approximations in 3-D
    s.add(axes(3));
    const a=[], l=[], q=[];
    for (let i=0;i<=200;i++){const t=-1.5+3*i/200; a.push(new THREE.Vector3(t, t*t/2, t*t*t/6)); l.push(new THREE.Vector3(t,0,0)); q.push(new THREE.Vector3(t, t*t/2, 0));}
    s.add(tubeCurve(a, 0x44ccff, 0.04)); s.add(tubeCurve(l, 0xff4444, 0.025)); s.add(tubeCurve(q, 0x44ff88, 0.025));
    s.add(point(0,0,0, 0xffff66));
  },

  /* Ch 14 -------------------------------------------------- */
  tangentPlane: s => {
    s.add(axes(3));
    s.add(surfaceMesh((x,y)=>0.5*(x*x+y*y), -2,2,-2,2, 60, 0x4488ff));
    const a=1, b=0.5, z0=0.5*(a*a+b*b);
    s.add(parametricMesh((u,v,t)=>{const x=a+(u-0.5)*2, y=b+(v-0.5)*2; t.set(x,y, z0+a*(x-a)+b*(y-b));}, 30, 0xff8844, {opacity:0.55, transparent:true}));
    s.add(point(a,b,z0, 0xffff66));
  },
  gradLevel: s => {
    s.add(axes(3));
    s.add(surfaceMesh((x,y)=>0.4*(x*x+y*y), -2,2,-2,2, 50, 0x4488ff));
    for (const k of [0.4, 0.9, 1.6]) {
      const r=Math.sqrt(k/0.4), pts=[];
      for (let i=0;i<=80;i++){const t=i/80*2*Math.PI; pts.push(new THREE.Vector3(r*Math.cos(t), r*Math.sin(t), k+0.02));}
      s.add(tubeCurve(pts, 0xffaa22, 0.018));
    }
    const a=1.2, b=0.6, P=new THREE.Vector3(a,b, 0.4*(a*a+b*b));
    const grad=new THREE.Vector3(0.8*a, 0.8*b, 0).normalize().multiplyScalar(1.2);
    s.add(vectorArrow(P, P.clone().add(grad), 0xff4444));
  },
  directional: s => {
    s.add(axes(3));
    s.add(surfaceMesh((x,y)=>1.5-0.3*(x*x+y*y), -2,2,-2,2, 50, 0x4488ff));
    const a=0.6, b=0.4, u=new THREE.Vector3(0.8, 0.6, 0).normalize();
    const pts=[]; for (let i=-100;i<=100;i++){const t=i*0.02, x=a+t*u.x, y=b+t*u.y; pts.push(new THREE.Vector3(x,y, 1.5-0.3*(x*x+y*y)));}
    s.add(tubeCurve(pts, 0xff8844, 0.03));
    s.add(vectorArrow(new THREE.Vector3(a,b,0), new THREE.Vector3(a+u.x, b+u.y, 0), 0xff4444));
    s.add(point(a,b, 1.5-0.3*(a*a+b*b), 0xffff66));
  },
  levelSurfaces: s => {
    s.add(axes(3));
    for (const k of [0.6, 1.0, 1.5]) {
      s.add(parametricMesh((u,v,t)=>{const ph=u*Math.PI, th=v*2*Math.PI; t.set(k*Math.sin(ph)*Math.cos(th), k*Math.sin(ph)*Math.sin(th), k*Math.cos(ph));}, 40, 0x4488ff, {opacity:0.30, transparent:true, wireframe:true}));
    }
    const P=new THREE.Vector3(0.7, 0.6, 0.65);
    s.add(vectorArrow(P, P.clone().add(P.clone().normalize().multiplyScalar(1.2)), 0xff4444));
  },
  hessMin:    s => { s.add(axes(2)); s.add(surfaceMesh((x,y)=>0.4*(x*x+y*y), -1.5,1.5,-1.5,1.5, 50, 0x44aaff)); s.add(point(0,0,0, 0xff4444)); },
  hessMax:    s => { s.add(axes(2)); s.add(surfaceMesh((x,y)=>1-0.4*(x*x+y*y), -1.5,1.5,-1.5,1.5, 50, 0xff8844)); s.add(point(0,0,1, 0xff4444)); },
  hessSaddle: s => { s.add(axes(2)); s.add(surfaceMesh((x,y)=>0.4*(x*x-y*y), -1.5,1.5,-1.5,1.5, 50, 0xaa55ff)); s.add(point(0,0,0, 0xff4444)); },
  /* Ch 15 -------------------------------------------------- */
  riemann: s => {
    s.add(axes(3));
    const f=(x,y)=>1+0.3*Math.cos(x)+0.25*Math.sin(y);
    s.add(surfaceMesh(f, -1.5, 1.5, -1.5, 1.5, 50, 0x4488ff));
    const N=6;
    for (let i=0;i<N;i++) for (let j=0;j<N;j++) {
      const x=-1.5+3*(i+0.5)/N, y=-1.5+3*(j+0.5)/N, h=f(x,y);
      const b=new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, h), new THREE.MeshPhongMaterial({color:0xff8844, opacity:0.5, transparent:true}));
      b.position.set(x, y, h/2);
      s.add(b);
    }
  },
  /* Three views of the same tetrahedron x+y+z <= 1, first octant, animated by
     sweeping a plane perpendicular to the outer integration axis from 0 to 1.
     The "already integrated" piece (slab thickness < t) is rendered solid, the
     "yet to come" piece is shown as a wireframe so you can see what is left. */
  tetraOrderZ: s => makeTetraOrder(s, 'z', 'outer integral over z'),
  tetraOrderY: s => makeTetraOrder(s, 'y', 'outer integral over y'),
  tetraOrderX: s => makeTetraOrder(s, 'x', 'outer integral over x'),

  tetrahedron: s => {
    s.add(axes(2));
    const g=new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0,0,0, 1,0,0, 0,1,0, 0,0,1]), 3));
    g.setIndex([0,1,2, 0,1,3, 0,2,3, 1,2,3]); g.computeVertexNormals();
    s.add(new THREE.Mesh(g, new THREE.MeshPhongMaterial({color:0x66aaff, opacity:0.55, transparent:true, side:THREE.DoubleSide})));
    const sx=0.3, sy=0.3;
    s.add(point(sx, sy, 0, 0xff4444));
    s.add(tubeCurve([new THREE.Vector3(sx,sy,0), new THREE.Vector3(sx,sy,1-sx-sy)], 0xff8844, 0.025));
  },
  cylWedge: s => {
    s.add(axes(3));
    const r0=1.0, r1=1.7, t0=Math.PI/8, t1=Math.PI/2.2, z0=0, z1=1.0;
    const verts=[], idx=[];
    function aq(a,b,c,d){const i=verts.length/3; verts.push(a.x,a.y,a.z, b.x,b.y,b.z, c.x,c.y,c.z, d.x,d.y,d.z); idx.push(i,i+1,i+2, i,i+2,i+3);}
    const rA=[], rB=[], rC=[], rD=[];
    for (let i=0;i<=10;i++) { const t=t0+(t1-t0)*i/10;
      rA.push(new THREE.Vector3(r0*Math.cos(t), r0*Math.sin(t), z0));
      rB.push(new THREE.Vector3(r0*Math.cos(t), r0*Math.sin(t), z1));
      rC.push(new THREE.Vector3(r1*Math.cos(t), r1*Math.sin(t), z0));
      rD.push(new THREE.Vector3(r1*Math.cos(t), r1*Math.sin(t), z1));
    }
    for (let i=0;i<10;i++) { aq(rA[i], rA[i+1], rB[i+1], rB[i]); aq(rC[i], rC[i+1], rD[i+1], rD[i]); }
    aq(rA[0], rC[0], rD[0], rB[0]); aq(rA[10], rB[10], rD[10], rC[10]);
    for (let i=0;i<10;i++) { aq(rA[i], rC[i], rC[i+1], rA[i+1]); aq(rB[i], rB[i+1], rD[i+1], rD[i]); }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setIndex(idx); g.computeVertexNormals();
    s.add(new THREE.Mesh(g, new THREE.MeshPhongMaterial({color:0xff8844, opacity:0.65, transparent:true, side:THREE.DoubleSide})));
  },
  sphWedge: s => {
    s.add(axes(3));
    const rA=1.2, rB=1.8, pA=Math.PI/3, pB=Math.PI/2, tA=Math.PI/6, tB=Math.PI/2.5;
    const verts=[], idx=[];
    function aq(a,b,c,d){const i=verts.length/3; verts.push(a.x,a.y,a.z, b.x,b.y,b.z, c.x,c.y,c.z, d.x,d.y,d.z); idx.push(i,i+1,i+2, i,i+2,i+3);}
    function sph(r,p,t){return new THREE.Vector3(r*Math.sin(p)*Math.cos(t), r*Math.sin(p)*Math.sin(t), r*Math.cos(p));}
    const N=8;
    for (let i=0;i<N;i++) for (let j=0;j<N;j++) {
      const p1=pA+(pB-pA)*i/N, p2=pA+(pB-pA)*(i+1)/N, t1=tA+(tB-tA)*j/N, t2=tA+(tB-tA)*(j+1)/N;
      aq(sph(rA,p1,t1), sph(rA,p2,t1), sph(rA,p2,t2), sph(rA,p1,t2));
      aq(sph(rB,p1,t1), sph(rB,p1,t2), sph(rB,p2,t2), sph(rB,p2,t1));
    }
    for (let i=0;i<N;i++) {
      const p1=pA+(pB-pA)*i/N, p2=pA+(pB-pA)*(i+1)/N, t1=tA+(tB-tA)*i/N, t2=tA+(tB-tA)*(i+1)/N;
      aq(sph(rA,p1,tA), sph(rB,p1,tA), sph(rB,p2,tA), sph(rA,p2,tA));
      aq(sph(rA,p1,tB), sph(rA,p2,tB), sph(rB,p2,tB), sph(rB,p1,tB));
      aq(sph(rA,pA,t1), sph(rA,pA,t2), sph(rB,pA,t2), sph(rB,pA,t1));
      aq(sph(rA,pB,t1), sph(rB,pB,t1), sph(rB,pB,t2), sph(rA,pB,t2));
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setIndex(idx); g.computeVertexNormals();
    s.add(new THREE.Mesh(g, new THREE.MeshPhongMaterial({color:0xff8844, opacity:0.7, transparent:true, side:THREE.DoubleSide})));
  },

  /* Ch 16 -------------------------------------------------- */
  radial: s => { s.add(axes(2)); s.add(vectorField((x,y,z)=>[x,y,z], -1.5,1.5,-1.5,1.5,-1.5,1.5, 1, 0xff8844, 0.4)); },
  fence: s => {
    s.add(axes(3));
    const C=[]; for (let i=0;i<=200;i++){const t=i/200*Math.PI; C.push(new THREE.Vector3(2*Math.cos(t)+0.2, 2*Math.sin(t)+0.2, 0));}
    s.add(tubeCurve(C, 0x44aaff, 0.03));
    const verts=[], idx=[];
    for (let i=0;i<C.length;i++) { const h=0.7+0.3*Math.sin(i/C.length*4); verts.push(C[i].x, C[i].y, 0, C[i].x, C[i].y, h); }
    for (let i=0;i<C.length-1;i++) { const a=i*2; idx.push(a, a+2, a+3, a, a+3, a+1); }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setIndex(idx); g.computeVertexNormals();
    s.add(new THREE.Mesh(g, new THREE.MeshPhongMaterial({color:0xff8844, opacity:0.7, transparent:true, side:THREE.DoubleSide})));
  },
};

/* ============================================================
   New 3-D figures (added)
   ============================================================ */
Object.assign(FIGS, {

  /* Ch 12, scalar triple product as a volume.  b, c span a base in the
     xy-plane, a is the slant edge.  Vol = |a·(b×c)| = (base area) times (height).
     The height of a animates so you can watch the volume grow and shrink. */
  tripleProduct: s => {
    s.add(axes(3));
    const b = new THREE.Vector3(2.0, 0.4, 0);
    const c = new THREE.Vector3(0.5, 1.8, 0);
    const bc = new THREE.Vector3().crossVectors(b, c);     // points +z
    s.add(vectorArrow(new THREE.Vector3(), b, 0xff5555));
    s.add(vectorArrow(new THREE.Vector3(), c, 0x46c8ff));
    s.add(vectorArrow(new THREE.Vector3(), bc.clone().normalize().multiplyScalar(2.2), 0x9a7bff)); // b×c dir
    const grp = new THREE.Group(); s.add(grp);
    const mat = new THREE.MeshPhongMaterial({color:0xffaa44, opacity:0.4, transparent:true, side:THREE.DoubleSide, shininess:40});
    s.userData.tick = (tsec) => {
      while (grp.children.length) grp.remove(grp.children[0]);
      const h = 1.6 + 1.1*Math.sin(tsec*0.9);
      const a = new THREE.Vector3(0.55, 0.5, h);
      grp.add(vectorArrow(new THREE.Vector3(), a, 0x55dd88));
      // 8 corners, base {0,b,c,b+c} and top {+a}
      const O=new THREE.Vector3(), B=b, C=c, BC=new THREE.Vector3().addVectors(b,c);
      const base=[O,B,BC,C], top=base.map(p=>p.clone().add(a));
      const pos=[]; const quad=(p,q,r,u)=>{pos.push(p.x,p.y,p.z, q.x,q.y,q.z, r.x,r.y,r.z, p.x,p.y,p.z, r.x,r.y,r.z, u.x,u.y,u.z);};
      quad(base[0],base[1],base[2],base[3]);
      quad(top[0],top[1],top[2],top[3]);
      for(let i=0;i<4;i++){const j=(i+1)%4; quad(base[i],base[j],top[j],top[i]);}
      const g=new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3)); g.computeVertexNormals();
      grp.add(new THREE.Mesh(g, mat));
    };
    s.userData.tick(0);
  },

  /* Ch 12, plane through three points.  n = PQ × PR is the normal, the
     translucent patch is the plane spanned by PQ and PR through P. */
  planeThreePoints: s => {
    s.add(axes(3));
    const P=new THREE.Vector3(0.6,0.3,0.4), Q=new THREE.Vector3(2.0,0.5,0.7), R=new THREE.Vector3(0.7,1.9,0.6);
    const PQ=new THREE.Vector3().subVectors(Q,P), PR=new THREE.Vector3().subVectors(R,P);
    const n=new THREE.Vector3().crossVectors(PQ,PR);
    // plane patch
    s.add(parametricMesh((u,v,t)=>{ const uu=(u-0.5)*3, vv=(v-0.5)*3;
      t.copy(P).addScaledVector(PQ, uu).addScaledVector(PR, vv); }, 24, 0x4a7fd6, {opacity:0.32, transparent:true}));
    s.add(vectorArrow(P, Q, 0xff5555));
    s.add(vectorArrow(P, R, 0x46c8ff));
    s.add(point(P.x,P.y,P.z,0xffe066)); s.add(point(Q.x,Q.y,Q.z,0xff8a8a,0.05)); s.add(point(R.x,R.y,R.z,0x8ad0ff,0.05));
    const nhat=n.clone().normalize().multiplyScalar(1.8);
    s.add(vectorArrow(P, P.clone().add(nhat), 0x9a7bff));   // normal
  },

  /* Ch 12, quadric traces.  A horizontal plane z = k sweeps up the elliptic
     paraboloid z = x²+y², leaving the circular trace at each height. */
  quadricTraces: s => {
    s.add(axes(3));
    s.add(surfaceMesh((x,y)=>x*x+y*y, -1.5, 1.5, -1.5, 1.5, 60, 0x4a7fd6, {opacity:0.55, transparent:true}));
    const planeMat=new THREE.MeshPhongMaterial({color:0xffe066, opacity:0.18, transparent:true, side:THREE.DoubleSide});
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(3.4,3.4), planeMat); s.add(plane);
    const ring=new THREE.Group(); s.add(ring);
    s.userData.tick=(tsec)=>{
      const k=1.4+1.2*Math.sin(tsec*0.8);   // height in [0.2,2.6]
      plane.position.set(0,0,k);
      while(ring.children.length) ring.remove(ring.children[0]);
      if(k>0.03){ const rad=Math.sqrt(k), pts=[];
        for(let i=0;i<=80;i++){const th=i/80*2*Math.PI; pts.push(new THREE.Vector3(rad*Math.cos(th),rad*Math.sin(th),k));}
        ring.add(tubeCurve(pts, 0xffaa3a, 0.035));
      }
    };
    s.userData.tick(0);
  },

  /* Ch 13, moving Frenet frame on the helix r(t)=(cos t, sin t, t/2).
     T (green) tangent, N (pink) inward normal, B (blue) binormal. */
  frenetHelix: s => {
    s.add(axes(2.6));
    const r  = t => new THREE.Vector3(Math.cos(t), Math.sin(t), t/2);
    const pts=[]; for(let i=0;i<=400;i++){const t=-Math.PI + (i/400)*2*Math.PI; pts.push(r(t));}
    s.add(tubeCurve(pts, 0x46c8ff, 0.03));
    const grp=new THREE.Group(); s.add(grp);
    s.userData.tick=(tsec)=>{
      while(grp.children.length) grp.remove(grp.children[0]);
      const tt = -Math.PI + ((tsec*0.6) % (2*Math.PI));
      const p=r(tt);
      const d1=new THREE.Vector3(-Math.sin(tt), Math.cos(tt), 0.5);
      const T=d1.clone().normalize();
      const N=new THREE.Vector3(-Math.cos(tt), -Math.sin(tt), 0);   // inward normal
      const B=new THREE.Vector3().crossVectors(T, N).normalize();
      grp.add(vectorArrow(p, p.clone().addScaledVector(T, 0.9), 0x55dd88));
      grp.add(vectorArrow(p, p.clone().addScaledVector(N, 0.9), 0xff5d99));
      grp.add(vectorArrow(p, p.clone().addScaledVector(B, 0.9), 0x9a7bff));
      grp.add(point(p.x,p.y,p.z, 0xffe066, 0.08));
    };
    s.userData.tick(0);
  },

});

/* ---- figures used by the solutions page ---- */
Object.assign(FIGS2D, {

  /* Double integral over the region between y=x and y=x² on [0,1].
     A vertical strip sweeps across, ∫₀¹∫_{x²}^{x} xy dy dx = 1/24. */
  regionTypeI: (ctx, W, H, t) => {
    const F = Math.round(H * 0.04);
    const xf = makeXf(W, H, -0.18, 1.25, -0.18, 1.25);
    d2Axes(ctx, xf, W, H);
    ctx.save(); ctx.beginPath();
    for (let i=0;i<=100;i++){const x=i/100; ctx.lineTo(...xf(x,x));}
    for (let i=100;i>=0;i--){const x=i/100; ctx.lineTo(...xf(x,x*x));}
    ctx.closePath(); ctx.fillStyle='rgba(70,200,255,0.14)'; ctx.fill(); ctx.restore();
    d2Path(ctx, xf, parametricPts(x=>[x,x], 0, 1.2), '#ff8a5c', 2.0);
    d2Path(ctx, xf, parametricPts(x=>[x,x*x], 0, 1.2), '#46c8ff', 2.4, true);
    const x0 = Math.max(0.002, Math.min(1, 0.5 - 0.5*Math.cos(2*Math.PI*t)));
    d2Path(ctx, xf, [[x0,x0*x0],[x0,x0]], '#ffd24a', 4);
    d2Dot(ctx, xf, x0, x0, 4, '#ffe066'); d2Dot(ctx, xf, x0, x0*x0, 4, '#ffe066');
    d2Dot(ctx, xf, 1, 1, 4, '#ffffff');
    d2Text(ctx, 'y = x  (top),   y = x²  (bottom)', 12, 8, '#dfe3ea', F, {bold:true, shadow:true});
    d2Math(ctx, '∫_0^1 ∫_{x²}^{x} xy dy dx = 1/24', 12, 12+F*1.3, '#9fe6c4', F*0.88, {shadow:true});
  },

  /* Reversing the order of integration on the triangle 0 ≤ x ≤ y ≤ 1.
     Alternates vertical strips (dy dx) and horizontal strips (dx dy). */
  reverseOrder: (ctx, W, H, t) => {
    const F = Math.round(H * 0.04);
    const xf = makeXf(W, H, -0.22, 1.3, -0.22, 1.3);
    d2Axes(ctx, xf, W, H);
    ctx.save(); ctx.beginPath();
    ctx.moveTo(...xf(0,0)); ctx.lineTo(...xf(0,1)); ctx.lineTo(...xf(1,1)); ctx.closePath();
    ctx.fillStyle='rgba(70,200,255,0.13)'; ctx.fill(); ctx.restore();
    d2Path(ctx, xf, [[0,0],[1,1]], '#ff8a5c', 2.2);
    d2Path(ctx, xf, [[0,1],[1,1]], '#5b6273', 1.5);
    d2Path(ctx, xf, [[0,0],[0,1]], '#5b6273', 1.5);
    const phase = Math.floor(t*2)%2, sub = (t*2)%1;
    if (phase === 0) {
      const x = sub; d2Path(ctx, xf, [[x,x],[x,1]], '#ffd24a', 4);
      d2Text(ctx, '∫₀¹ ∫ₓ¹ f dy dx', 12, 8, '#dfe3ea', F, {bold:true, shadow:true});
      d2Text(ctx, 'vertical strip:  x ≤ y ≤ 1', 12, 12+F*1.3, '#ffd24a', F*0.88, {shadow:true});
    } else {
      const y = sub; d2Path(ctx, xf, [[0,y],[y,y]], '#9a7bff', 4);
      d2Text(ctx, '∫₀¹ ∫₀ʸ f dx dy', 12, 8, '#dfe3ea', F, {bold:true, shadow:true});
      d2Text(ctx, 'horizontal strip:  0 ≤ x ≤ y', 12, 12+F*1.3, '#bfa8ff', F*0.88, {shadow:true});
    }
  },

});

Object.assign(FIGS, {

  /* √3 diagonal of the unit cube, built from a √2 base diagonal plus one unit up.
     Centred on the origin so the camera (which targets 0) frames it nicely. */
  cubeDiagonal: s => {
    s.add(axes(1.6));
    const o = new THREE.Vector3(-0.5, -0.5, -0.5);   // shift cube to sit on the origin
    const v=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]]
      .map(p=>new THREE.Vector3(...p).add(o));
    const E=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
    const lm=new THREE.LineBasicMaterial({color:0x55607a, transparent:true, opacity:0.7});
    for (const [a,b] of E){ const g=new THREE.BufferGeometry().setFromPoints([v[a],v[b]]); s.add(new THREE.Line(g,lm)); }
    s.add(tubeCurve([v[0],v[2]], 0x46c8ff, 0.022));   // base diagonal √2
    s.add(tubeCurve([v[2],v[6]], 0xff5555, 0.022));   // up 1
    s.add(tubeCurve([v[0],v[6]], 0x9a7bff, 0.03));    // space diagonal √3
    s.add(point(v[6].x, v[6].y, v[6].z, 0xffe066, 0.05));
    const lbl=(txt,pos,col)=>{const sp=makeLabel(txt,col); sp.position.copy(pos); sp.scale.set(0.5,0.25,1); s.add(sp);};
    lbl('√2', new THREE.Vector3(0.05, 0.0, -0.66), '#46c8ff');
    lbl('1',  new THREE.Vector3(0.68, 0.5, 0.0),  '#ff5555');
    lbl('√3', new THREE.Vector3(-0.2, -0.04, 0.16),'#9a7bff');
  },

  /* Triangle area = ½|AB×AC| for A(1,0,0),B(0,2,0),C(0,0,3), area = 7/2. */
  triangleArea3D: s => {
    s.add(axes(3.6));
    const A=new THREE.Vector3(1,0,0), B=new THREE.Vector3(0,2,0), C=new THREE.Vector3(0,0,3);
    const g=new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([A.x,A.y,A.z,B.x,B.y,B.z,C.x,C.y,C.z],3));
    g.computeVertexNormals();
    s.add(new THREE.Mesh(g, new THREE.MeshPhongMaterial({color:0x4a7fd6, opacity:0.5, transparent:true, side:THREE.DoubleSide})));
    s.add(vectorArrow(A,B,0xff5555)); s.add(vectorArrow(A,C,0x46c8ff));
    const AB=new THREE.Vector3().subVectors(B,A), AC=new THREE.Vector3().subVectors(C,A);
    const n=new THREE.Vector3().crossVectors(AB,AC);
    const cen=new THREE.Vector3().addVectors(A,B).add(C).multiplyScalar(1/3);
    s.add(vectorArrow(cen, cen.clone().add(n.clone().normalize().multiplyScalar(1.7)), 0x9a7bff));
    [A,B,C].forEach(p=>s.add(point(p.x,p.y,p.z,0xffe066,0.06)));
  },

  /* Line x=1+t, y=2-t, z=3t meeting the plane 2x+y-z=5 at t=-½ → (½,5/2,-3/2). */
  linePlaneHit: s => {
    s.add(axes(3));
    const hit=new THREE.Vector3(0.5, 2.5, -1.5);
    // two in-plane directions for 2x+y-z=5 (normal <2,1,-1>), patch kept near the line
    const e1=new THREE.Vector3(1,0,2), e2=new THREE.Vector3(0,1,1);
    s.add(parametricMesh((u,v,t)=>{ const a=(u-0.5)*2.6, b=(v-0.5)*2.6;
      t.copy(hit).addScaledVector(e1, a).addScaledVector(e2, b); }, 24, 0x4a7fd6, {opacity:0.32, transparent:true}));
    const L=t=>new THREE.Vector3(1+t, 2-t, 3*t);
    const pts=[]; for(let i=0;i<=100;i++){const t=-1+2*i/100; pts.push(L(t));}
    s.add(tubeCurve(pts, 0xff7755, 0.03));
    s.add(point(hit.x,hit.y,hit.z, 0x55dd88, 0.1));
    const dot=point(0,0,0, 0xffe066, 0.07); s.add(dot);
    s.userData.tick=(tsec)=>{ const t=-1 + ((tsec*0.5)%2); dot.position.copy(L(t)); };
    s.userData.tick(0);
  },

});

/* ---- 2-D figures for the gradient spine on the solutions page ---- */
Object.assign(FIGS2D, {

  /* Ch 14. One dimension first.  The tangent line at a on a concave-down curve
     rides above the curve, so its prediction is too high.  Toggle between the
     concave-down f = sqrt(x) (over-estimate) and the concave-up f = x^2/2 (under).
     The vertical gap line is the error the linearization makes. */
  overUnder1D: (ctx, W, H, t) => {
    const F = Math.round(H * 0.04)
    const phase = Math.floor(t * 2) % 2
    const sub = (t * 2) % 1
    const concaveDown = phase === 0
    const xf = makeXf(W, H, -0.4, 5.2, -0.4, 3.2)
    d2Axes(ctx, xf, W, H)
    const f  = concaveDown ? (x => Math.sqrt(Math.max(0, x))) : (x => 0.18 * x * x)
    const fp = concaveDown ? (x => 0.5 / Math.sqrt(Math.max(1e-3, x))) : (x => 0.36 * x)
    const a = concaveDown ? 4 : 1.2 + 2.4 * sub
    const aMove = concaveDown ? 4 : a
    d2Path(ctx, xf, parametricPts(x => [x, f(x)], 0.02, 5.1), '#46c8ff', 2.6, true)
    const ya = f(aMove), m = fp(aMove)
    d2Path(ctx, xf, [[0, ya - m * aMove], [5.1, ya + m * (5.1 - aMove)]], '#ff8a5c', 2.0)
    d2Dot(ctx, xf, aMove, ya, 5, '#ffe066')
    const q = aMove + (concaveDown ? 0.1 : 0.6)
    const Lq = ya + m * (q - aMove), fq = f(q)
    ctx.save(); ctx.setLineDash([5, 4])
    d2Path(ctx, xf, [[q, fq], [q, Lq]], '#ff5d99', 2.2)
    ctx.restore()
    d2Dot(ctx, xf, q, Lq, 3.5, '#ff8a5c', false)
    d2Dot(ctx, xf, q, fq, 3.5, '#46c8ff', false)
    if (concaveDown) {
      d2Text(ctx, 'f = √x   concave down', 12, 8, '#dfe3ea', F, { bold: true, shadow: true })
      d2Text(ctx, 'tangent rides above  →  L over-estimates', 12, 12 + F * 1.3, '#ff8a5c', F * 0.84, { shadow: true })
      d2Text(ctx, '√4.1 ≈ L(4.1) = 2.025  (true 2.0249)', 12, 12 + F * 2.5, '#9fe6c4', F * 0.82, { shadow: true })
    } else {
      d2Text(ctx, 'f = x²/2   concave up', 12, 8, '#dfe3ea', F, { bold: true, shadow: true })
      d2Text(ctx, 'tangent rides below  →  L under-estimates', 12, 12 + F * 1.3, '#bfa8ff', F * 0.84, { shadow: true })
      d2Text(ctx, 'sign of the error is the sign of the bend', 12, 12 + F * 2.5, '#9aa0aa', F * 0.82, { shadow: true })
    }
  },

  /* Ch 14. Gradient perpendicular to a level curve, killing the "points to the
     origin" idea.  f = x^2 + 3y^2, so the ellipses are squashed and the gradient
     (2x, 6y) leans toward the y-axis, never along the position vector except on
     the axes. */
  gradPerpLevel: (ctx, W, H, _t) => {
    const F = Math.round(H * 0.04)
    const xf = makeXf(W, H, -2.6, 2.6, -2.0, 2.0)
    d2Axes(ctx, xf, W, H)
    for (const k of [0.5, 1.5, 3, 5]) {
      const pts = parametricPts(th => [Math.sqrt(k) * Math.cos(th), Math.sqrt(k / 3) * Math.sin(th)], 0, 2 * Math.PI + 0.01)
      d2Path(ctx, xf, pts, '#2c303a', 1.6)
    }
    const step = 0.85
    for (let x = -2.1; x <= 2.1; x += step) {
      for (let y = -1.6; y <= 1.6; y += step) {
        if (Math.abs(x) < 0.05 && Math.abs(y) < 0.05) continue
        const gx = 2 * x, gy = 6 * y, L = Math.hypot(gx, gy)
        const sc = 0.34 / L
        d2Arrow(ctx, xf, x, y, x + gx * sc, y + gy * sc, '#44dd88', 1.5)
      }
    }
    const px = 1, py = 1, gx = 2, gy = 6, L = Math.hypot(gx, gy)
    ctx.save(); ctx.setLineDash([5, 4])
    d2Path(ctx, xf, [[0, 0], [px, py]], '#7f8794', 1.6)
    ctx.restore()
    d2Arrow(ctx, xf, px, py, px + gx * 0.7 / L, py + gy * 0.7 / L, '#ff5d73', 2.6)
    d2Dot(ctx, xf, px, py, 5, '#ffe066')
    d2Text(ctx, 'f = x² + 3y²', 12, 8, '#dfe3ea', F, { bold: true, shadow: true })
    d2Text(ctx, '∇f ⟂ level curve, not aimed at the origin', 12, 12 + F * 1.3, '#9fe6c4', F * 0.84, { shadow: true })
    d2Text(ctx, 'at (1,1):  ∇f = ⟨2,6⟩,  position ⟨1,1⟩', 12, 12 + F * 2.5, '#ff8a5c', F * 0.82, { shadow: true })
  },

  /* Ch 14. Contour signatures of the four shapes, cycling, bowl (circles),
     saddle (hyperbolas plus the two zero lines), squashed elliptic bowl, and the
     rotated bowl whose level lines tilt off the axes, the cross-term fingerprint. */
  contourZoo: (ctx, W, H, t) => {
    const F = Math.round(H * 0.04)
    const which = Math.floor(t * 4) % 4
    const xf = makeXf(W, H, -2.2, 2.2, -2.2, 2.2)
    d2Axes(ctx, xf, W, H)
    const drawContours = (f, levels, color) => {
      const N = 90, xs = [], lo = -2.2, hi = 2.2
      for (let i = 0; i <= N; i++) xs.push(lo + (hi - lo) * i / N)
      for (const k of levels) {
        const pts = []
        for (let i = 0; i <= N; i++) {
          const x = xs[i]
          for (let j = 0; j < N; j++) {
            const y0 = xs[j], y1 = xs[j + 1]
            const a = f(x, y0) - k, b = f(x, y1) - k
            if (a === 0) pts.push([x, y0])
            if (a * b < 0) { const y = y0 + (y1 - y0) * a / (a - b); pts.push([x, y]) }
          }
        }
        for (const [x, y] of pts) d2Dot(ctx, xf, x, y, 1.1, color, false)
      }
    }
    let label, sub, f, levels, color
    if (which === 0) { f = (x, y) => x * x + y * y; levels = [0.25, 1, 2.25, 4]; color = '#46c8ff'; label = 'bowl  z = x² + y²'; sub = 'circles, one min, no special direction' }
    else if (which === 1) { f = (x, y) => x * x - y * y; levels = [-2, -1, 1, 2]; color = '#ff8a5c'; label = 'saddle  z = x² - y²'; sub = 'hyperbolas, up along x, down along y' }
    else if (which === 2) { f = (x, y) => x * x + 3 * y * y; levels = [0.5, 1.5, 3, 5]; color = '#9fe6c4'; label = 'elliptic bowl  z = x² + 3y²'; sub = 'squashed ellipses, steep in y, gentle in x' }
    else { f = (x, y) => 2 * x * x + 2 * x * y + 2 * y * y - 1.5; levels = [-1, 0, 1, 2]; color = '#bfa8ff'; label = 'rotated bowl  z = 2x² + 2xy + 2y²'; sub = 'axes tilt 45°, the xy term is the turn' }
    if (which === 1) {
      d2Path(ctx, xf, [[-2.2, -2.2], [2.2, 2.2]], '#3a4150', 1.4)
      d2Path(ctx, xf, [[-2.2, 2.2], [2.2, -2.2]], '#3a4150', 1.4)
    }
    drawContours(f, levels, color)
    d2Text(ctx, label, 12, 8, '#dfe3ea', F, { bold: true, shadow: true })
    d2Text(ctx, sub, 12, 12 + F * 1.3, color, F * 0.84, { shadow: true })
  },

  /* Ch 14. A contour map you read partials off of.  Level ellipses of
     f = x^2/4 + y^2, at (2,1) step right and up by the spacing to read f_x and
     f_y as rise over run.  Tighter spacing means a steeper climb. */
  contourRead: (ctx, W, H, _t) => {
    const F = Math.round(H * 0.04)
    const xf = makeXf(W, H, -0.6, 4.6, -0.6, 3.2)
    d2Axes(ctx, xf, W, H)
    for (const k of [1, 2, 3, 4, 5]) {
      const pts = parametricPts(th => [2 * Math.sqrt(k) * Math.cos(th), Math.sqrt(k) * Math.sin(th)], 0, 2 * Math.PI + 0.01)
      d2Path(ctx, xf, pts, '#2c303a', 1.4)
    }
    const px = 2, py = 1
    d2Arrow(ctx, xf, px, py, px + 0.9, py, '#ff5d73', 2.2)
    d2Arrow(ctx, xf, px, py, px, py + 0.7, '#46c8ff', 2.2)
    const gx = 1, gy = 2, L = Math.hypot(gx, gy)
    d2Arrow(ctx, xf, px, py, px + gx * 0.95 / L, py + gy * 0.95 / L, '#9fe6c4', 2.4)
    d2Dot(ctx, xf, px, py, 5, '#ffe066')
    d2Text(ctx, 'contours of  f = x²/4 + y²', 12, 8, '#dfe3ea', F, { bold: true, shadow: true })
    d2Text(ctx, 'f_x = rise/run stepping right,  f_y stepping up', 12, 12 + F * 1.3, '#9aa0aa', F * 0.8, { shadow: true })
    d2Text(ctx, 'green ∇f crosses the contours at a right angle', 12, 12 + F * 2.5, '#9fe6c4', F * 0.8, { shadow: true })
  },

  /* Ch 14. Lagrange on the ellipse x^2/4 + y^2 = 1 maximizing f = xy.  The
     hyperbola level curves xy = k ride out until one kisses the ellipse.  At
     those four tangency points grad f and grad g line up, the extrema of xy. */
  lagrangeEllipse: (ctx, W, H, t) => {
    const F = Math.round(H * 0.04)
    const xf = makeXf(W, H, -3.0, 3.0, -2.2, 2.2)
    d2Axes(ctx, xf, W, H)
    d2Path(ctx, xf, parametricPts(th => [2 * Math.cos(th), Math.sin(th)], 0, 2 * Math.PI + 0.01), '#ff5d73', 2.2)
    for (const k of [-1, -0.5, 0.5, 1]) {
      const a = [], b = []
      for (let i = 1; i <= 160; i++) { const x = 0.12 + 3 * i / 160; a.push([x, k / x]); b.push([-x, k / -x]) }
      d2Path(ctx, xf, a, '#2c303a', 1.3); d2Path(ctx, xf, b, '#2c303a', 1.3)
    }
    const rt2 = Math.SQRT2, hh = 1 / Math.SQRT2
    for (const [x, y] of [[rt2, hh], [-rt2, -hh]]) d2Dot(ctx, xf, x, y, 5.5, '#ffe066')
    for (const [x, y] of [[rt2, -hh], [-rt2, hh]]) d2Dot(ctx, xf, x, y, 5.5, '#ff8a5c')
    const th = t * 2 * Math.PI
    const x = 2 * Math.cos(th), y = Math.sin(th)
    const gfx = y, gfy = x
    const ggx = x / 2, ggy = 2 * y
    const sf = 0.6 / Math.max(0.4, Math.hypot(gfx, gfy))
    const sg = 0.6 / Math.max(0.4, Math.hypot(ggx, ggy))
    d2Arrow(ctx, xf, x, y, x + gfx * sf, y + gfy * sf, '#9fe6c4', 2.2)
    d2Arrow(ctx, xf, x, y, x + ggx * sg, y + ggy * sg, '#bfa8ff', 2.2)
    d2Dot(ctx, xf, x, y, 4, '#ffffff')
    d2Text(ctx, 'max xy on  x²/4 + y² = 1', 12, 8, '#dfe3ea', F, { bold: true, shadow: true })
    d2Text(ctx, '∇f (green) ∥ ∇g (purple) only at the tangencies', 12, 12 + F * 1.3, '#9fe6c4', F * 0.8, { shadow: true })
  },

});

/* ---- 3-D figures for the gradient spine on the solutions page ---- */
Object.assign(FIGS, {

  /* Ch 14. The dome z = 1 - x^2 - y^2 with its tangent plane at P=(1/2,1/2,1/2).
     The plane is the linearization.  Because the dome bends below it, the plane
     sits on top everywhere, so the estimate is always too high. */
  domeTangent: s => {
    s.add(axes(1.8))
    const f = (x, y) => 1 - x * x - y * y
    s.add(surfaceMesh(f, -1.0, 1.0, -1.0, 1.0, 60, 0x4a7fd6, { opacity: 0.9 }))
    const a = 0.5, b = 0.5, z0 = f(a, b)
    const fx = -2 * a, fy = -2 * b
    s.add(parametricMesh((u, v, t) => {
      const x = a + (u - 0.5) * 1.4, y = b + (v - 0.5) * 1.4
      t.set(x, y, z0 + fx * (x - a) + fy * (y - b))
    }, 24, 0xff8844, { opacity: 0.5, transparent: true }))
    s.add(point(a, b, z0, 0xffe066))
    s.add(vectorArrow(new THREE.Vector3(a, b, 0), new THREE.Vector3(a + fx, b + fy, 0), 0xff4444))
    s.add(point(a, b, 0, 0xff8a8a, 0.04))
  },

  /* Ch 14. Gradient used four ways on the dome at P.  The level curve through P,
     the diagonal slice climbing the dome, the in-plane gradient, and the unit
     step u along y = x.  One vector, four readings. */
  gradFourWays: s => {
    s.add(axes(1.8))
    const f = (x, y) => 1 - x * x - y * y
    s.add(surfaceMesh(f, -1.0, 1.0, -1.0, 1.0, 50, 0x4a7fd6, { opacity: 0.62, transparent: true }))
    const a = 0.5, b = 0.5, z0 = f(a, b)
    const R = Math.sqrt(1 - z0), lc = []
    for (let i = 0; i <= 120; i++) { const th = i / 120 * 2 * Math.PI; lc.push(new THREE.Vector3(R * Math.cos(th), R * Math.sin(th), z0 + 0.005)) }
    s.add(tubeCurve(lc, 0xffaa22, 0.02))
    const sl = []; for (let i = 0; i <= 100; i++) { const tt = -0.95 + 1.9 * i / 100; sl.push(new THREE.Vector3(tt, tt, 1 - 2 * tt * tt)) }
    s.add(tubeCurve(sl, 0x55dd88, 0.022))
    s.add(point(a, b, z0, 0xffe066))
    const fx = -2 * a, fy = -2 * b
    s.add(vectorArrow(new THREE.Vector3(a, b, 0), new THREE.Vector3(a + fx, b + fy, 0), 0xff4444))
    const us = 0.7 / Math.SQRT2
    s.add(vectorArrow(new THREE.Vector3(a, b, 0), new THREE.Vector3(a + us, b + us, 0), 0x9a7bff))
    s.add(point(a, b, 0, 0xff8a8a, 0.04))
  },

  /* Ch 14. Second derivative test by shapes.  A downward elliptic paraboloid
     z = 1 - 3x^2 - y^2 turns about its peak to z = 1 - 2x^2 - 2xy - 2y^2 (same
     bowl, 45 deg rotated).  Two rods mark the steepest and gentlest drops, they
     rotate with the surface, so the cross term turns. */
  paraboloidTurn: s => {
    s.add(axes(1.8))
    const grp = new THREE.Group(); s.add(grp)
    const rods = new THREE.Group(); s.add(rods)
    s.userData.tick = (tsec) => {
      clearGroup(grp)
      while (rods.children.length) rods.remove(rods.children[0])
      const ang = (Math.PI / 4) * (0.5 - 0.5 * Math.cos(tsec * 0.6))
      const ca = Math.cos(ang), sa = Math.sin(ang)
      const f = (x, y) => { const X = ca * x + sa * y, Y = -sa * x + ca * y; return 1 - 3 * X * X - Y * Y }
      grp.add(surfaceMesh(f, -0.85, 0.85, -0.85, 0.85, 48, 0xff6644, { opacity: 0.85 }))
      const peak = new THREE.Vector3(0, 0, 1)
      const steep = new THREE.Vector3(ca, sa, 0).multiplyScalar(0.8)
      const gentle = new THREE.Vector3(-sa, ca, 0).multiplyScalar(0.8)
      rods.add(vectorArrow(peak, peak.clone().add(steep), 0xffe066))
      rods.add(vectorArrow(peak, peak.clone().add(gentle), 0x46c8ff))
      rods.add(point(0, 0, 1, 0xffffff, 0.05))
    }
    s.userData.tick(0)
  },

  /* Ch 12 and 14. The saddle z = x^2 - y^2 assembled from its slices.  An upward
     parabola in x and a downward parabola in y cross at the origin. */
  saddleTraces: s => {
    s.add(axes(2.2))
    s.add(surfaceMesh((x, y) => x * x - y * y, -1.4, 1.4, -1.4, 1.4, 50, 0xaa55ff, { opacity: 0.5, transparent: true }))
    const up = []; for (let i = 0; i <= 60; i++) { const x = -1.4 + 2.8 * i / 60; up.push(new THREE.Vector3(x, 0, x * x)) }
    const dn = []; for (let i = 0; i <= 60; i++) { const y = -1.4 + 2.8 * i / 60; dn.push(new THREE.Vector3(0, y, -y * y)) }
    s.add(tubeCurve(up, 0x55dd88, 0.03))
    s.add(tubeCurve(dn, 0xff5d99, 0.03))
    s.add(point(0, 0, 0, 0xffe066))
    s.add(tubeCurve([new THREE.Vector3(-1.4, -1.4, 0), new THREE.Vector3(1.4, 1.4, 0)], 0x3a4150, 0.012))
    s.add(tubeCurve([new THREE.Vector3(-1.4, 1.4, 0), new THREE.Vector3(1.4, -1.4, 0)], 0x3a4150, 0.012))
  },

  /* Ch 12. Two skew lines.  r1 = (1,2,0)+t(1,-1,2), r2 = (2,1,3)+s(2,1,-1).
     They never meet and are not parallel.  The dashed segment is the gap. */
  skewLines: s => {
    s.add(axes(3.2))
    const L1 = t => new THREE.Vector3(1 + t, 2 - t, 2 * t)
    const L2 = u => new THREE.Vector3(2 + 2 * u, 1 + u, 3 - u)
    const p1 = [], p2 = []
    for (let i = 0; i <= 80; i++) { const t = -1.6 + 3.2 * i / 80; p1.push(L1(t)); p2.push(L2(t)) }
    s.add(tubeCurve(p1, 0x46c8ff, 0.03))
    s.add(tubeCurve(p2, 0xff7755, 0.03))
    const A = L1(1.314), B = L2(0.114)
    const gap = new THREE.BufferGeometry().setFromPoints([A, B])
    const gline = new THREE.Line(gap, new THREE.LineDashedMaterial({ color: 0xffe066, dashSize: 0.12, gapSize: 0.08 }))
    gline.computeLineDistances(); s.add(gline)
    s.add(point(A.x, A.y, A.z, 0x8ad0ff, 0.05))
    s.add(point(B.x, B.y, B.z, 0xffb38a, 0.05))
  },

  /* Ch 12. Two planes meeting in a line.  x + 2y + z = 4 and 2x - y + z = 3.
     The intersection direction is n1 x n2 = (3,1,-5) through (2,1,0). */
  planeIntersect: s => {
    s.add(axes(3.2))
    s.add(parametricMesh((u, v, t) => {
      const a = (u - 0.5) * 3.2, b = (v - 0.5) * 3.2
      t.set(2 + 2 * a, 1 - a + b, 0 - 2 * b)
    }, 20, 0x4a7fd6, { opacity: 0.35, transparent: true }))
    s.add(parametricMesh((u, v, t) => {
      const a = (u - 0.5) * 3.2, b = (v - 0.5) * 3.2
      t.set(2 + a, 1 + 2 * a + b, 0 + b)
    }, 20, 0xff8844, { opacity: 0.35, transparent: true }))
    const d = new THREE.Vector3(3, 1, -5), p0 = new THREE.Vector3(2, 1, 0)
    const lp = []; for (let i = 0; i <= 40; i++) { const t = -0.6 + 1.2 * i / 40; lp.push(p0.clone().addScaledVector(d, t)) }
    s.add(tubeCurve(lp, 0xffe066, 0.035))
    s.add(point(2, 1, 0, 0xffffff, 0.05))
  },

  /* Ch 12. Hyperboloid of one sheet x^2 + y^2 - z^2 = 1.  A horizontal plane
     z = k sweeps up and the circular trace (radius sqrt(1+k^2)) grows.  The
     waist is the unit circle at z = 0. */
  hyperboloidTrace: s => {
    s.add(axes(3))
    s.add(parametricMesh((u, v, t) => {
      const z = (u - 0.5) * 4, th = v * 2 * Math.PI, r = Math.sqrt(1 + z * z)
      t.set(r * Math.cos(th), r * Math.sin(th), z)
    }, 60, 0x4a7fd6, { opacity: 0.5, transparent: true }))
    const planeMat = new THREE.MeshPhongMaterial({ color: 0xffe066, opacity: 0.18, transparent: true, side: THREE.DoubleSide })
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), planeMat); s.add(plane)
    const ring = new THREE.Group(); s.add(ring)
    s.userData.tick = (tsec) => {
      const k = 1.7 * Math.sin(tsec * 0.7)
      plane.position.set(0, 0, k)
      while (ring.children.length) ring.remove(ring.children[0])
      const rad = Math.sqrt(1 + k * k), pts = []
      for (let i = 0; i <= 80; i++) { const th = i / 80 * 2 * Math.PI; pts.push(new THREE.Vector3(rad * Math.cos(th), rad * Math.sin(th), k)) }
      ring.add(tubeCurve(pts, 0xffaa3a, 0.035))
    }
    s.userData.tick(0)
  },

  /* Ch 13. The cylinder x^2 + y^2 = 1 met by the plane z = x + y.  Their
     intersection is the ellipse r(t) = (cos t, sin t, cos t + sin t), tangent
     line drawn at (1,0,1).  The grey circle on the floor is the shadow. */
  curveIntersect: s => {
    s.add(axes(2.4))
    s.add(parametricMesh((u, v, t) => {
      const th = u * 2 * Math.PI, z = -1.6 + 3.2 * v
      t.set(Math.cos(th), Math.sin(th), z)
    }, 48, 0x4a7fd6, { opacity: 0.22, transparent: true }))
    s.add(parametricMesh((u, v, t) => {
      const x = (u - 0.5) * 2.6, y = (v - 0.5) * 2.6
      t.set(x, y, x + y)
    }, 20, 0xff8844, { opacity: 0.3, transparent: true }))
    const r = t => new THREE.Vector3(Math.cos(t), Math.sin(t), Math.cos(t) + Math.sin(t))
    const cur = []; for (let i = 0; i <= 200; i++) { const t = i / 200 * 2 * Math.PI; cur.push(r(t)) }
    s.add(tubeCurve(cur, 0xffe066, 0.028))
    const sh = []; for (let i = 0; i <= 120; i++) { const t = i / 120 * 2 * Math.PI; sh.push(new THREE.Vector3(Math.cos(t), Math.sin(t), 0)) }
    s.add(tubeCurve(sh, 0x3a4150, 0.012))
    const P = r(0), d = new THREE.Vector3(0, 1, 1)
    s.add(tubeCurve([P.clone().addScaledVector(d, -1.1), P.clone().addScaledVector(d, 1.1)], 0xff5d99, 0.022))
    s.add(point(P.x, P.y, P.z, 0xffffff, 0.06))
  },

});

Object.assign(FIGS2D, {

  /* Ch 15. The polar area element.  A single cell of the polar grid slides
     outward at fixed angular width; its radial side is always dr but its arc
     side r dθ grows with r, so the cell fattens.  That growth is the Jacobian. */
  polarCell: (ctx, W, H, t) => {
    const F = Math.round(H * 0.04)
    const xf = makeXf(W, H, -0.25, 2.45, -0.25, 2.45)
    d2Axes(ctx, xf, W, H)
    // faint polar grid
    for (const rg of [0.5, 1, 1.5, 2]) {
      const pts = parametricPts(th => [rg * Math.cos(th), rg * Math.sin(th)], 0, Math.PI / 2, 120)
      d2Path(ctx, xf, pts, '#2c303a', 1.4)
    }
    for (let k = 0; k <= 6; k++) {
      const th = k * Math.PI / 12
      d2Path(ctx, xf, [[0, 0], [2.2 * Math.cos(th), 2.2 * Math.sin(th)]], '#2c303a', 1.0)
    }
    // the moving cell
    const dr = 0.3, dth = Math.PI / 9, th0 = Math.PI / 6
    const r0 = 0.35 + 1.45 * 0.5 * (1 - Math.cos(2 * Math.PI * t))   // ping-pong 0.35..1.8
    const arc = (rr, a, b, N = 40) => {
      const pts = []
      for (let i = 0; i <= N; i++) { const th = a + (b - a) * i / N; pts.push([rr * Math.cos(th), rr * Math.sin(th)]) }
      return pts
    }
    const inner = arc(r0, th0, th0 + dth), outer = arc(r0 + dr, th0 + dth, th0)
    ctx.save(); ctx.beginPath()
    for (const [x, y] of [...inner, ...outer]) ctx.lineTo(...xf(x, y))
    ctx.closePath(); ctx.fillStyle = 'rgba(255,210,74,0.30)'; ctx.fill(); ctx.restore()
    d2Path(ctx, xf, inner, '#ffd24a', 2.2)
    d2Path(ctx, xf, outer, '#ffd24a', 2.2)
    d2Path(ctx, xf, [[r0 * Math.cos(th0), r0 * Math.sin(th0)], [(r0 + dr) * Math.cos(th0), (r0 + dr) * Math.sin(th0)]], '#ff8a5c', 2.6)
    d2Path(ctx, xf, [[r0 * Math.cos(th0 + dth), r0 * Math.sin(th0 + dth)], [(r0 + dr) * Math.cos(th0 + dth), (r0 + dr) * Math.sin(th0 + dth)]], '#ffd24a', 2.2)
    // side labels beside the cell
    const midR = r0 + dr / 2
    const [lx, ly] = xf((midR + 0.16) * Math.cos(th0 - 0.06), (midR + 0.16) * Math.sin(th0 - 0.06))
    d2Math(ctx, 'dr', lx, ly, '#ff8a5c', F * 0.9, { shadow: true })
    const [ax, ay] = xf((r0 + dr + 0.12) * Math.cos(th0 + dth / 2), (r0 + dr + 0.12) * Math.sin(th0 + dth / 2))
    d2Math(ctx, 'r dθ', ax - F * 0.4, ay - F * 0.6, '#46c8ff', F * 0.9, { shadow: true })
    d2Path(ctx, xf, arc(r0 + dr + 0.02, th0, th0 + dth), '#46c8ff', 2.6)
    const area = midR * dr * dth
    d2Text(ctx, 'polar tile, two sides', 12, 8, '#dfe3ea', F, { bold: true, shadow: true })
    d2Math(ctx, 'dA ≈ (r dθ)(dr) = r dr dθ', 12, 12 + F * 1.3, '#9fe6c4', F * 0.88, { shadow: true })
    d2Math(ctx, `r = ${r0.toFixed(2)},  dA ≈ ${area.toFixed(3)}`, 12, 12 + F * 2.5, '#ffd24a', F * 0.84, { shadow: true })
  },

  /* Ch 16. Path independence for a gradient field.  Three different paths from
     A(1,0) to B(0,0) on the dome f = 1 - x^2 - y^2.  Work accumulated so far is
     just current height minus start height, so the three running totals differ
     mid-trip but land on the same number f(B) - f(A) = 1. */
  pathIndependence: (ctx, W, H, t) => {
    const F = Math.round(H * 0.04)
    const xf = makeXf(W, H, -1.45, 1.75, -1.35, 1.35)
    d2Axes(ctx, xf, W, H)
    const f = (x, y) => 1 - x * x - y * y
    // level circles of f at k = 0.75, 0.5, 0.25, 0
    for (const k of [0.75, 0.5, 0.25, 0]) {
      d2Circle(ctx, xf, 0, 0, Math.sqrt(1 - k), '#2c303a', 1.5)
    }
    const A = [1, 0], B = [0, 0]
    const paths = [
      { fn: u => [1 - u, 0], color: '#ffd24a', name: 'straight' },
      { fn: u => [1 - u, 0.75 * Math.sin(Math.PI * u)], color: '#46c8ff', name: 'high road' },
      { fn: u => [1 - u, -1.05 * Math.sin(Math.PI * u) * (1 - 0.4 * u)], color: '#ff8a5c', name: 'low road' },
    ]
    const u = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, t * 1.25))   // ease, hold at end
    let line = 0
    for (const p of paths) {
      d2Path(ctx, xf, parametricPts(p.fn, 0, 1, 160), '#3a4150', 1.4)
      d2Path(ctx, xf, parametricPts(p.fn, 0, Math.max(u, 0.002), Math.max(2, Math.round(u * 160))), p.color, 2.4, true)
      const [px, py] = p.fn(u)
      d2Dot(ctx, xf, px, py, 4.5, p.color)
      const Wnow = f(px, py) - f(A[0], A[1])
      d2Math(ctx, `${p.name}:  W = ${Wnow.toFixed(2)}`, 12, 12 + F * 1.3 * (1.0 + line), p.color, F * 0.84, { shadow: true })
      line++
    }
    d2Dot(ctx, xf, A[0], A[1], 4, '#ffffff')
    d2Dot(ctx, xf, B[0], B[1], 4, '#ffffff')
    const [axp, ayp] = xf(1.06, -0.05); d2Text(ctx, 'A', axp, ayp, '#dfe3ea', F * 0.9, { bold: true, shadow: true })
    const [bxp, byp] = xf(-0.16, -0.05); d2Text(ctx, 'B', bxp, byp, '#dfe3ea', F * 0.9, { bold: true, shadow: true })
    d2Math(ctx, 'F = ∇f,  f = 1 − x² − y²,  W so far = f(now) − f(A)', 12, 8, '#dfe3ea', F * 0.9, { bold: true, shadow: true })
    if (u > 0.995) d2Math(ctx, 'all three give f(B) − f(A) = 1', 12, 12 + F * 1.3 * 4, '#9fe6c4', F * 0.88, { shadow: true })
  },

});

/* empty a per-tick group, disposing geometry and material so rebuilt
   figures do not grow GPU memory */
function clearGroup(grp) {
  while (grp.children.length) {
    const c = grp.children[0]
    c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose() })
    grp.remove(c)
  }
}

/* ---- quad-mesh helper shared by the coordinate-grid figures ---- */
function quadMesh(quads, color, opacity = 0.65) {
  const verts = [], idx = []
  for (const [a, b, c, d] of quads) {
    const i = verts.length / 3
    verts.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z)
    idx.push(i, i + 1, i + 2, i, i + 2, i + 3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  g.setIndex(idx); g.computeVertexNormals()
  return new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color, opacity, transparent: true, side: THREE.DoubleSide }))
}
function cylCellMesh(r0, dr, t0, dt, z0, dz, color) {
  const P = (r, t, z) => new THREE.Vector3(r * Math.cos(t), r * Math.sin(t), z)
  const quads = [], N = 6
  for (let i = 0; i < N; i++) {
    const a = t0 + dt * i / N, b = t0 + dt * (i + 1) / N
    quads.push([P(r0, a, z0), P(r0, b, z0), P(r0, b, z0 + dz), P(r0, a, z0 + dz)])
    quads.push([P(r0 + dr, a, z0), P(r0 + dr, b, z0), P(r0 + dr, b, z0 + dz), P(r0 + dr, a, z0 + dz)])
    quads.push([P(r0, a, z0), P(r0 + dr, a, z0), P(r0 + dr, b, z0), P(r0, b, z0)])
    quads.push([P(r0, a, z0 + dz), P(r0 + dr, a, z0 + dz), P(r0 + dr, b, z0 + dz), P(r0, b, z0 + dz)])
  }
  for (const t of [t0, t0 + dt]) {
    quads.push([P(r0, t, z0), P(r0 + dr, t, z0), P(r0 + dr, t, z0 + dz), P(r0, t, z0 + dz)])
  }
  return quadMesh(quads, color, 0.8)
}
function sphCellMesh(rho0, drho, p0, dp, t0, dt, color) {
  const P = (r, p, t) => new THREE.Vector3(r * Math.sin(p) * Math.cos(t), r * Math.sin(p) * Math.sin(t), r * Math.cos(p))
  const quads = [], N = 5
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const p1 = p0 + dp * i / N, p2 = p0 + dp * (i + 1) / N, a = t0 + dt * j / N, b = t0 + dt * (j + 1) / N
    quads.push([P(rho0, p1, a), P(rho0, p2, a), P(rho0, p2, b), P(rho0, p1, b)])
    quads.push([P(rho0 + drho, p1, a), P(rho0 + drho, p2, a), P(rho0 + drho, p2, b), P(rho0 + drho, p1, b)])
  }
  for (let i = 0; i < N; i++) {
    const p1 = p0 + dp * i / N, p2 = p0 + dp * (i + 1) / N
    for (const t of [t0, t0 + dt]) quads.push([P(rho0, p1, t), P(rho0 + drho, p1, t), P(rho0 + drho, p2, t), P(rho0, p2, t)])
    const a = t0 + dt * i / N, b = t0 + dt * (i + 1) / N
    for (const p of [p0, p0 + dp]) quads.push([P(rho0, p, a), P(rho0 + drho, p, a), P(rho0 + drho, p, b), P(rho0, p, b)])
  }
  return quadMesh(quads, color, 0.85)
}

Object.assign(FIGS, {

  /* Ch 14.  Degree 2 Taylor approximation at the two critical points of
     f = x^3 - 3x + y^2.  At the minimum (1, 0) the local quadric is
     Q = -2 + 3h^2 + k^2, an elliptic paraboloid (orange).  At the saddle
     (-1, 0) it is Q = 2 - 3h^2 + k^2 (purple).  Each quadric hugs the
     surface near its critical point. */
  taylorQuad: s => {
    s.add(axes(2.6))
    const f = (x, y) => x * x * x - 3 * x + y * y
    s.add(surfaceMesh(f, -2.0, 2.0, -1.4, 1.4, 60, 0x4a7fd6, { opacity: 0.45, transparent: true }))
    s.add(parametricMesh((u, v, t) => {
      const h = (u - 0.5) * 1.5, k = (v - 0.5) * 1.5
      t.set(1 + h, k, -2 + 3 * h * h + k * k)
    }, 30, 0xff8844, { opacity: 0.6, transparent: true }))
    s.add(parametricMesh((u, v, t) => {
      const h = (u - 0.5) * 1.5, k = (v - 0.5) * 1.5
      t.set(-1 + h, k, 2 - 3 * h * h + k * k)
    }, 30, 0xaa55ff, { opacity: 0.6, transparent: true }))
    s.add(point(1, 0, -2, 0xffffff, 0.07))
    s.add(point(-1, 0, 2, 0xffffff, 0.07))
  },

  /* Ch 14.  Tangent vectors sweep out the tangent plane on the dome
     f = 1 - x^2 - y^2 at (1/2, 1/2, 1/2).  Static red <1,0,f_x> and green
     <0,1,f_y> come from the y = 1/2 and x = 1/2 slices.  A vertical plane
     through the point rotates with θ, its trace is highlighted, and the
     yellow vector <cosθ, sinθ, D_u f> is the trace's tangent, always lying
     in the orange tangent plane. */
  tangentVectors: s => {
    s.add(axes(2.2))
    const f = (x, y) => 1 - x * x - y * y
    const px = 0.5, py = 0.5, pz = 0.5, fx = -1, fy = -1
    s.add(surfaceMesh(f, -1.25, 1.25, -1.25, 1.25, 60, 0x4a7fd6, { opacity: 0.55, transparent: true }))
    s.add(parametricMesh((u, v, t) => {
      const x = px + (u - 0.5) * 2.0, y = py + (v - 0.5) * 2.0
      t.set(x, y, pz + fx * (x - px) + fy * (y - py))
    }, 24, 0xff8844, { opacity: 0.35, transparent: true }))
    const P = new THREE.Vector3(px, py, pz)
    const draw = (dx, dy, dz, col) => {
      const v = new THREE.Vector3(dx, dy, dz).normalize().multiplyScalar(1.0)
      s.add(vectorArrow(P, P.clone().add(v), col))
    }
    draw(1, 0, fx, 0xff5555)
    draw(0, 1, fy, 0x55dd88)
    s.add(point(px, py, pz, 0xffffff, 0.06))
    const grp = new THREE.Group(); s.add(grp)
    s.userData.tick = (tsec) => {
      clearGroup(grp)
      const th = tsec * 0.5
      const c = Math.cos(th), sn = Math.sin(th)
      const Du = fx * c + fy * sn
      grp.add(parametricMesh((u, v, t) => {
        const a = (u - 0.5) * 2.6, b = -1.2 + v * 2.6
        t.set(px + a * c, py + a * sn, b)
      }, 16, 0xffe066, { opacity: 0.12, transparent: true }))
      const tr = []
      for (let i = 0; i <= 80; i++) {
        const a = -1.3 + 2.6 * i / 80
        tr.push(new THREE.Vector3(px + a * c, py + a * sn, f(px + a * c, py + a * sn)))
      }
      grp.add(tubeCurve(tr, 0xff5d99, 0.025))
      const v3 = new THREE.Vector3(c, sn, Du).normalize()
      grp.add(vectorArrow(P, P.clone().addScaledVector(v3, 1.0), 0xffe066))
    }
    s.userData.tick(0)
  },

  /* Ch 14.  A function of three variables f = x^2 + 2y^2 + z^2 seen through
     its level surface f = k, with k oscillating in time.  The white point
     rides the surface, the red arrow is ∇f there, and the small grey patch is
     the tangent plane, always perpendicular to the gradient. */
  levelSurfGrad: s => {
    s.add(axes(2.6))
    const grp = new THREE.Group(); s.add(grp)
    const ph0 = 1.05, th0 = 0.65
    s.userData.tick = (tsec) => {
      clearGroup(grp)
      const k = 1.6 + 1.1 * Math.sin(tsec * 0.6)
      grp.add(parametricMesh((u, v, t) => {
        const ph = u * Math.PI, th = v * 2 * Math.PI
        t.set(Math.sqrt(k) * Math.sin(ph) * Math.cos(th), Math.sqrt(k / 2) * Math.sin(ph) * Math.sin(th), Math.sqrt(k) * Math.cos(ph))
      }, 44, 0x4a7fd6, { opacity: 0.45, transparent: true }))
      const P = new THREE.Vector3(Math.sqrt(k) * Math.sin(ph0) * Math.cos(th0), Math.sqrt(k / 2) * Math.sin(ph0) * Math.sin(th0), Math.sqrt(k) * Math.cos(ph0))
      const g = new THREE.Vector3(2 * P.x, 4 * P.y, 2 * P.z)
      const n = g.clone().normalize()
      const e1 = new THREE.Vector3(-n.y, n.x, 0).normalize()
      const e2 = new THREE.Vector3().crossVectors(n, e1)
      grp.add(quadMesh([[
        P.clone().addScaledVector(e1, -0.55).addScaledVector(e2, -0.55),
        P.clone().addScaledVector(e1, 0.55).addScaledVector(e2, -0.55),
        P.clone().addScaledVector(e1, 0.55).addScaledVector(e2, 0.55),
        P.clone().addScaledVector(e1, -0.55).addScaledVector(e2, 0.55)]], 0xcfd6e4, 0.45))
      grp.add(vectorArrow(P, P.clone().addScaledVector(n, 0.9), 0xff5555))
      grp.add(point(P.x, P.y, P.z, 0xffffff, 0.06))
    }
    s.userData.tick(0)
  },

  /* Ch 13.  r(t) = (cos t, sin t, 0.05 t^2), a helix that climbs faster and
     faster.  Moving point with unit tangent (green), principal normal (pink),
     and the osculating circle (yellow), radius 1/κ computed from
     κ = |r'×r''| / |r'|^3.  The circle tightens as the climb steepens. */
  helixT2: s => {
    s.add(axes(2.6))
    const a = 0.05, tMax = 2.5 * Math.PI
    const r = t => new THREE.Vector3(Math.cos(t), Math.sin(t), a * t * t)
    const pts = []; for (let i = 0; i <= 400; i++) pts.push(r(tMax * i / 400))
    s.add(tubeCurve(pts, 0x46c8ff, 0.028))
    const grp = new THREE.Group(); s.add(grp)
    s.userData.tick = (tsec) => {
      clearGroup(grp)
      const t = 0.4 + ((tsec * 0.45) % (tMax - 0.8))
      const p = r(t)
      const d1 = new THREE.Vector3(-Math.sin(t), Math.cos(t), 2 * a * t)
      const d2 = new THREE.Vector3(-Math.cos(t), -Math.sin(t), 2 * a)
      const T = d1.clone().normalize()
      const cr = new THREE.Vector3().crossVectors(d1, d2)
      const kappa = cr.length() / Math.pow(d1.length(), 3)
      const B = cr.clone().normalize()
      const N = new THREE.Vector3().crossVectors(B, T)
      const rho = 1 / kappa
      const C = p.clone().addScaledVector(N, rho)
      const circ = []
      for (let i = 0; i <= 90; i++) {
        const sAng = i / 90 * 2 * Math.PI
        circ.push(C.clone().addScaledVector(N, -rho * Math.cos(sAng)).addScaledVector(T, rho * Math.sin(sAng)))
      }
      grp.add(tubeCurve(circ, 0xffe066, 0.02))
      grp.add(vectorArrow(p, p.clone().addScaledVector(T, 0.8), 0x55dd88))
      grp.add(vectorArrow(p, p.clone().addScaledVector(N, 0.8), 0xff5d99))
      grp.add(point(p.x, p.y, p.z, 0xffffff, 0.07))
    }
    s.userData.tick(0)
  },

  /* Ch 15.  The cylindrical coordinate grid.  Coordinate surfaces r = const
     (cylinders), θ = const (half-planes), z = const (rings), with a dV block
     r dr dθ dz wandering through the solid cylinder. */
  cylGrid: s => {
    s.add(axes(2.8))
    for (const rr of [0.8, 1.6]) {
      s.add(parametricMesh((u, v, t) => {
        const th = u * 2 * Math.PI, z = v * 2.0
        t.set(rr * Math.cos(th), rr * Math.sin(th), z)
      }, 40, 0x4a7fd6, { opacity: 0.16, transparent: true }))
    }
    for (let k = 0; k < 8; k++) {
      const th = k * Math.PI / 4
      const q = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1.9 * Math.cos(th), 1.9 * Math.sin(th), 0),
        new THREE.Vector3(1.9 * Math.cos(th), 1.9 * Math.sin(th), 2.0), new THREE.Vector3(0, 0, 2.0)]
      s.add(quadMesh([q], 0x55dd88, 0.07))
    }
    for (const z of [0, 1.0, 2.0]) for (const rr of [0.8, 1.6]) {
      const ring = []; for (let i = 0; i <= 80; i++) { const th = i / 80 * 2 * Math.PI; ring.push(new THREE.Vector3(rr * Math.cos(th), rr * Math.sin(th), z)) }
      s.add(tubeCurve(ring, 0x3a4150, 0.012))
    }
    const grp = new THREE.Group(); s.add(grp)
    const ease = x => x * x * (3 - 2 * x)
    const lerp = (a, b, w) => a + (b - a) * w
    s.userData.tick = (tsec) => {
      clearGroup(grp)
      // one coordinate at a time: out along r, around in theta, down in z,
      // then back the same way
      const u6 = ((tsec % 15) / 15) * 6
      const ph = Math.floor(u6), fr = ease(u6 - ph)
      let r0 = 0.5, th0 = 0.2, z0 = 1.5
      if (ph === 0) r0 = lerp(0.5, 1.25, fr)
      else if (ph === 1) { r0 = 1.25; th0 = lerp(0.2, 2.2, fr) }
      else if (ph === 2) { r0 = 1.25; th0 = 2.2; z0 = lerp(1.5, 0.3, fr) }
      else if (ph === 3) { r0 = lerp(1.25, 0.5, fr); th0 = 2.2; z0 = 0.3 }
      else if (ph === 4) { r0 = 0.5; th0 = lerp(2.2, 0.2, fr); z0 = 0.3 }
      else z0 = lerp(0.3, 1.5, fr)
      grp.add(cylCellMesh(r0, 0.28, th0, 0.5, z0, 0.3, 0xff8844))
    }
    s.userData.tick(0)
  },

  /* Ch 15.  The spherical coordinate grid.  Coordinate surfaces ρ = const
     (spheres), φ = const (cones), θ = const (half-planes), with a dV block
     ρ^2 sinφ dρ dφ dθ wandering through the ball. */
  sphGrid: s => {
    s.add(axes(2.8))
    for (const rr of [1.0, 1.9]) {
      s.add(parametricMesh((u, v, t) => {
        const ph = u * Math.PI, th = v * 2 * Math.PI
        t.set(rr * Math.sin(ph) * Math.cos(th), rr * Math.sin(ph) * Math.sin(th), rr * Math.cos(ph))
      }, 40, 0x4a7fd6, { opacity: 0.14, transparent: true }))
    }
    for (const ph of [Math.PI / 5, Math.PI / 2.4]) {
      s.add(parametricMesh((u, v, t) => {
        const rr = u * 2.0, th = v * 2 * Math.PI
        t.set(rr * Math.sin(ph) * Math.cos(th), rr * Math.sin(ph) * Math.sin(th), rr * Math.cos(ph))
      }, 32, 0x55dd88, { opacity: 0.12, transparent: true }))
    }
    for (let k = 0; k < 6; k++) {
      const th = k * Math.PI / 3, m = []
      for (let i = 0; i <= 60; i++) { const ph = i / 60 * Math.PI; m.push(new THREE.Vector3(1.9 * Math.sin(ph) * Math.cos(th), 1.9 * Math.sin(ph) * Math.sin(th), 1.9 * Math.cos(ph))) }
      s.add(tubeCurve(m, 0x3a4150, 0.012))
    }
    const grp = new THREE.Group(); s.add(grp)
    const ease = x => x * x * (3 - 2 * x)
    const lerp = (a, b, w) => a + (b - a) * w
    s.userData.tick = (tsec) => {
      clearGroup(grp)
      // one coordinate at a time: out along rho, around in theta, down in
      // phi, then back the same way
      const u6 = ((tsec % 15) / 15) * 6
      const ph = Math.floor(u6), fr = ease(u6 - ph)
      let rho = 0.6, th0 = 0.2, ph0 = 0.5
      if (ph === 0) rho = lerp(0.6, 1.5, fr)
      else if (ph === 1) { rho = 1.5; th0 = lerp(0.2, 2.0, fr) }
      else if (ph === 2) { rho = 1.5; th0 = 2.0; ph0 = lerp(0.5, 1.35, fr) }
      else if (ph === 3) { rho = lerp(1.5, 0.6, fr); th0 = 2.0; ph0 = 1.35 }
      else if (ph === 4) { rho = 0.6; th0 = lerp(2.0, 0.2, fr); ph0 = 1.35 }
      else ph0 = lerp(1.35, 0.5, fr)
      grp.add(sphCellMesh(rho, 0.3, ph0, 0.35, th0, 0.4, 0xff8844))
    }
    s.userData.tick(0)
  },

});

Object.assign(FIGS2D, {

  /* Ch 14.  Level ellipses of the downward paraboloid z = 1 - 3x^2 - y^2 as
     it turns through 45°.  The Hessian eigenvectors (arrows) are the ellipse
     axes and turn with the surface.  The cross term appears and the
     eigenvalues -6, -2 never change. */
  hessEigen: (ctx, W, H, t) => {
    const F = Math.round(H * 0.04)
    const xf = makeXf(W, H, -2.1, 2.1, -2.1, 2.1)
    d2Axes(ctx, xf, W, H)
    const al = (Math.PI / 4) * 0.5 * (1 - Math.cos(2 * Math.PI * t))   // 0 → 45° → 0
    const c = Math.cos(al), sn = Math.sin(al)
    for (const k of [0.4, 1.1, 2.2, 3.6]) {
      const pts = []
      for (let i = 0; i <= 140; i++) {
        const s2 = i / 140 * 2 * Math.PI
        const u = Math.sqrt(k / 3) * Math.cos(s2), v = Math.sqrt(k) * Math.sin(s2)
        pts.push([c * u - sn * v, sn * u + c * v])
      }
      d2Path(ctx, xf, pts, '#46c8ff', 1.6)
    }
    d2Arrow(ctx, xf, 0, 0, 1.5 * c, 1.5 * sn, '#ff5d73', 2.6)
    d2Arrow(ctx, xf, 0, 0, -1.5 * sn, 1.5 * c, '#55dd88', 2.6)
    const A = (1 + 2 * c * c).toFixed(1), Bc = (4 * c * sn).toFixed(1), Cc = (1 + 2 * sn * sn).toFixed(1)
    d2Text(ctx, 'z = 1 − 3x² − y², turned', 12, 8, '#dfe3ea', F, { bold: true, shadow: true })
    d2Math(ctx, `z = 1 − ${A}x² − ${Bc}xy − ${Cc}y²`, 12, 12 + F * 1.3, '#9fe6c4', F * 0.86, { shadow: true })
    d2Math(ctx, 'eigenvectors = ellipse axes,  λ = −6, −2,  D = 12', 12, 12 + F * 2.5, '#ffb38a', F * 0.8, { shadow: true })
  },

  /* Ch 14.  Same picture for the saddle z = x^2 - y^2.  Level hyperbolas,
     eigenvector axes, and the zero level (the two crossing lines).  At 45°
     the form becomes 2xy. */
  saddleEigen: (ctx, W, H, t) => {
    const F = Math.round(H * 0.04)
    const xf = makeXf(W, H, -2.1, 2.1, -2.1, 2.1)
    d2Axes(ctx, xf, W, H)
    const al = (Math.PI / 4) * 0.5 * (1 - Math.cos(2 * Math.PI * t))
    const c = Math.cos(al), sn = Math.sin(al)
    const f = (x, y) => { const u = c * x + sn * y, v = -sn * x + c * y; return u * u - v * v }
    const N = 88, lo = -2.1, hi = 2.1
    for (const [k, col] of [[0.7, '#ff8a5c'], [1.8, '#ff8a5c'], [-0.7, '#46c8ff'], [-1.8, '#46c8ff'], [0, '#8a93a5']]) {
      for (let i = 0; i <= N; i++) {
        const x = lo + (hi - lo) * i / N
        for (let j = 0; j < N; j++) {
          const y0 = lo + (hi - lo) * j / N, y1 = lo + (hi - lo) * (j + 1) / N
          const a2 = f(x, y0) - k, b2 = f(x, y1) - k
          if (a2 * b2 < 0) { const y = y0 + (y1 - y0) * a2 / (a2 - b2); d2Dot(ctx, xf, x, y, 1.1, col, false) }
        }
      }
    }
    d2Arrow(ctx, xf, 0, 0, 1.5 * c, 1.5 * sn, '#ff5d73', 2.6)
    d2Arrow(ctx, xf, 0, 0, -1.5 * sn, 1.5 * c, '#55dd88', 2.6)
    d2Text(ctx, 'z = x² − y², turned', 12, 8, '#dfe3ea', F, { bold: true, shadow: true })
    d2Math(ctx, 'at 45°,  z = 2xy', 12, 12 + F * 1.3, '#9fe6c4', F * 0.86, { shadow: true })
    d2Math(ctx, 'λ = +2, −2,  D = −4,  saddle', 12, 12 + F * 2.5, '#ffb38a', F * 0.8, { shadow: true })
  },

  /* Ch 15.  Classic area of a circle.  The disk is a stack of thin rings.
     Each ring of radius r unrolls into a strip of length 2πr, and the strips
     stack into a triangle of base 2πR and height R, area (1/2)(2πR)(R) = πR².
     This is the polar integral ∫ 2πr dr drawn as a picture. */
  circleArea: (ctx, W, H, t) => {
    const F = Math.round(H * 0.04)
    const R = 1.0
    const xf = makeXf(W, H, -1.3, 5.3, -1.45, 1.45)
    const u = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, t * 1.3))   // 0..1 unroll, hold
    const cx = -0.05, cy = 0.35
    const NR = 22
    for (let i = 0; i < NR; i++) {
      const r = R * (i + 0.5) / NR
      const col = i % 2 ? '#46c8ff' : '#3d8fc0'
      // each ring interpolates from a circle at (cx,cy) to a horizontal strip
      // at height y = r - 1.2, from x = 0 to 2πr (unrolled length)
      const pts = []
      for (let j = 0; j <= 120; j++) {
        const s = j / 120
        const th = Math.PI / 2 + s * 2 * Math.PI
        const px = cx + r * Math.cos(th), py = cy + r * Math.sin(th)
        const qx = -1.1 + s * 2 * Math.PI * r, qy = r - 1.25
        pts.push([px + u * (qx - px), py + u * (qy - py)])
      }
      d2Path(ctx, xf, pts, col, Math.max(1.6, (H / NR) * 0.14))
    }
    if (u > 0.98) {
      d2Path(ctx, xf, [[-1.1, -1.25], [-1.1, R - 1.25], [-1.1 + 2 * Math.PI * R, R - 1.25], [-1.1, -1.25]], '#ffd24a', 2.0)
      d2Math(ctx, 'A = ½ · base · height = ½ (2πR)(R) = πR²', 12, 12 + F * 1.3, '#9fe6c4', F * 0.9, { shadow: true })
    }
    d2Text(ctx, 'a disk is a stack of rings, each of area 2πr dr', 12, 8, '#dfe3ea', F * 0.92, { bold: true, shadow: true })
  },

  /* Ch 16.  Trying to draw level curves of a potential.  Left, F = <x, y> is
     conservative and the curves perpendicular to F are circles, one value
     each.  Right, F = <-y, x> is not, the perpendicular curves are rays that
     all collide at the origin, and marching the value around the circle comes
     back different, so no single-valued potential exists. */
  potentialContours: (ctx, W, H, t) => {
    const F = Math.round(H * 0.04)
    const half = W / 2
    const panel = (x0, drawFn) => { ctx.save(); ctx.translate(x0, 0); ctx.beginPath(); ctx.rect(0, 0, half, H); ctx.clip(); drawFn(); ctx.restore() }
    const prog = Math.min(1, t * 1.2)
    panel(0, () => {
      const xf = makeXf(half, H, -2.1, 2.1, -2.1, 2.1)
      d2Axes(ctx, xf, half, H)
      for (let x = -1.8; x <= 1.9; x += 0.9) for (let y = -1.8; y <= 1.9; y += 0.9) {
        const L = Math.hypot(x, y); if (L < 0.1) continue
        d2Arrow(ctx, xf, x, y, x + 0.3 * x / L, y + 0.3 * y / L, '#3d5f8a', 1.3)
      }
      const rings = [0.5, 0.9, 1.3, 1.7]
      const nShow = Math.max(1, Math.ceil(prog * rings.length))
      for (let i = 0; i < nShow; i++) {
        d2Circle(ctx, xf, 0, 0, rings[i], '#55dd88', 2.0)
        const [px, py] = xf(rings[i] * 0.71, rings[i] * 0.71)
        d2Math(ctx, `f=${(rings[i] * rings[i] / 2).toFixed(2)}`, px + 3, py - F, '#9fe6c4', F * 0.72, { shadow: true })
      }
      d2Math(ctx, 'F = ⟨x, y⟩  conservative', 10, 8, '#dfe3ea', F * 0.85, { bold: true, shadow: true })
      d2Math(ctx, 'f = (x²+y²)/2, one value per curve', 10, 10 + F * 1.2, '#9aa0aa', F * 0.72, { shadow: true })
    })
    panel(half, () => {
      const xf = makeXf(half, H, -2.1, 2.1, -2.1, 2.1)
      d2Axes(ctx, xf, half, H)
      for (let x = -1.8; x <= 1.9; x += 0.9) for (let y = -1.8; y <= 1.9; y += 0.9) {
        const L = Math.hypot(x, y); if (L < 0.1) continue
        d2Arrow(ctx, xf, x, y, x - 0.3 * y / L, y + 0.3 * x / L, '#7a4a5f', 1.3)
      }
      const nRays = 10
      const nShow = Math.max(1, Math.ceil(prog * (nRays + 1)))
      for (let i = 0; i < Math.min(nShow, nRays + 1); i++) {
        const th = i * 2 * Math.PI / nRays
        const conflict = i === nRays
        d2Path(ctx, xf, [[0.0, 0.0], [2.0 * Math.cos(th), 2.0 * Math.sin(th)]], conflict ? '#ff5d73' : '#ffd24a', conflict ? 2.6 : 1.8)
        const [px, py] = xf(1.55 * Math.cos(th), 1.55 * Math.sin(th))
        d2Math(ctx, `f=${(i * 0.63).toFixed(1)}${conflict ? '?' : ''}`, px + 2, py - F * 0.6, conflict ? '#ff5d73' : '#ffe08a', F * 0.68, { shadow: true })
      }
      d2Dot(ctx, xf, 0, 0, 5, '#ff5d73')
      d2Math(ctx, 'F = ⟨−y, x⟩  not conservative', 10, 8, '#dfe3ea', F * 0.85, { bold: true, shadow: true })
      if (nShow > nRays) d2Math(ctx, 'every curve hits 0, and f=0 returns as f=6.3', 10, 10 + F * 1.2, '#ff8a9a', F * 0.72, { shadow: true })
    })
  },

});

/* ============================================================
   Scene scaffolding + lazy WebGL init
   ============================================================ */

function build3D(canvas, drawFn) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias:true});
  renderer.setPixelRatio(window.devicePixelRatio);
  const scene = new THREE.Scene();
  // gradient background via a small canvas texture (prettier than flat dark)
  const bgC = document.createElement('canvas'); bgC.width = 2; bgC.height = 256;
  const bgX = bgC.getContext('2d');
  const bgGrad = bgX.createLinearGradient(0, 0, 0, 256);
  bgGrad.addColorStop(0, '#1a1c22'); bgGrad.addColorStop(1, '#0c0d10');
  bgX.fillStyle = bgGrad; bgX.fillRect(0, 0, 2, 256);
  const bgTex = new THREE.CanvasTexture(bgC);
  scene.background = bgTex;
  scene.fog = new THREE.Fog(0x101115, 9, 22);
  const cam = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
  // z is up.  put the camera in front-right of the scene, looking back at the origin.
  cam.up.set(0, 0, 1);
  cam.position.set(6, -5, 4);
  cam.lookAt(0, 0, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x202028, 0.55));
  const dl = new THREE.DirectionalLight(0xffffff, 1.05); dl.position.set(5, 8, 6); scene.add(dl);
  const rim = new THREE.DirectionalLight(0x88aaff, 0.4); rim.position.set(-6, -4, 3); scene.add(rim);
  // faint ground grid in the z = 0 plane for depth reference
  const grid = new THREE.GridHelper(12, 24, 0x3a4254, 0x252a36);
  grid.rotation.x = Math.PI / 2;
  grid.material.transparent = true; grid.material.opacity = 0.28;
  scene.add(grid);
  const ctrls = new OrbitControls(cam, renderer.domElement); ctrls.enableDamping = true; ctrls.dampingFactor = 0.08;
  // keep "up" aligned with the world z so rotating doesn't flip the scene upside down
  ctrls.target.set(0, 0, 0);
  drawFn(scene);
  function resize() { const w=canvas.clientWidth, h=canvas.clientHeight; renderer.setSize(w, h, false); cam.aspect = w/h; cam.updateProjectionMatrix(); }
  resize(); new ResizeObserver(resize).observe(canvas);
  let t0 = null;
  let visible = true;
  new IntersectionObserver(es => { for (const e of es) visible = e.isIntersecting; }).observe(canvas);
  (function animate(now){
    requestAnimationFrame(animate);
    if (!visible) return;
    ctrls.update();
    if (scene.userData && typeof scene.userData.tick === 'function') {
      if (t0 === null) t0 = now || performance.now();
      const tsec = ((now || performance.now()) - t0) / 1000;
      scene.userData.tick(tsec);
    }
    renderer.render(scene, cam);
  })();
}

export function initFigures() {
  const init = new WeakSet();
  const obs = new IntersectionObserver(es => {
    for (const e of es) if (e.isIntersecting && !init.has(e.target)) {
      const name = e.target.dataset.fig;
      const fn2D = FIGS2D[name];
      const fn3D = FIGS[name];
      if (fn2D) { build2D(e.target, fn2D); init.add(e.target); }
      else if (fn3D) { build3D(e.target, fn3D); init.add(e.target); }
    }
  }, { rootMargin: '300px' });
  for (const c of document.querySelectorAll('canvas[data-fig]')) obs.observe(c);
}
