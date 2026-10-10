// 2D outline editor for blade-style (profile) and round (lathe) parts.
import { useEffect, useRef, useState } from 'preact/hooks';
import { outlineOf, silhouette } from './silhouette.js';
import { expandSymmetric, signedArea } from '../engine/geom2d.js';

const HIT = 9;

export function ProfileEditor({ part, parts, onPoints, onPatch, pointSel, setPointSel, dark }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const view = useRef({ z: 0.5, ox: 200, oy: 300, fittedFor: null });
  const drag = useRef(null);
  const [refImgs, setRefImgs] = useState({});
  const [imgMode, setImgMode] = useState(false);
  const [, force] = useState(0);
  const refImg = refImgs[part.id];
  const imgEl = useRef({});

  const pts = part.points;
  const isLathe = part.type === 'lathe';
  const sym = part.type === 'profile' && part.symmetric;

  const toScreen = (x, y) => { const v = view.current; return [v.ox + x * v.z, v.oy - y * v.z]; };
  const toWorld = (sx, sy) => { const v = view.current; return [(sx - v.ox) / v.z, (v.oy - sy) / v.z]; };

  const fit = () => {
    const c = canvasRef.current;
    if (!c) return;
    const W = c.clientWidth, H = c.clientHeight;
    const all = outlineOf(part).map((o) => o.p).concat(pts.map((p) => [p.x, p.y]));
    if (isLathe || sym) all.push(...all.map(([x, y]) => [-x, y]));
    if (!all.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of all) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const z = Math.min((W - 60) / Math.max(10, maxX - minX), (H - 50) / Math.max(10, maxY - minY));
    view.current.z = z;
    view.current.ox = W / 2 - ((minX + maxX) / 2) * z;
    view.current.oy = H / 2 + ((minY + maxY) / 2) * z;
    draw();
  };

  const draw = () => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth, H = c.clientHeight;
    if (c.width !== W * dpr || c.height !== H * dpr) { c.width = W * dpr; c.height = H * dpr; }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = dark ? '#111318' : '#f7f8fa';
    g.fillRect(0, 0, W, H);
    const v = view.current;
    // reference image
    if (refImg && imgEl.current[part.id]?.complete) {
      const im = imgEl.current[part.id];
      const w = refImg.w, h = (refImg.w * im.naturalHeight) / im.naturalWidth;
      const [sx, sy] = toScreen(refImg.x - w / 2, refImg.y + h / 2);
      g.globalAlpha = refImg.opacity;
      g.drawImage(im, sx, sy, w * v.z, h * v.z);
      g.globalAlpha = 1;
    }
    // grid
    const minor = v.z > 2 ? 5 : v.z > 0.6 ? 10 : v.z > 0.2 ? 50 : 100;
    const major = minor * (minor === 50 ? 2 : 5);
    const [x0, y1] = toWorld(0, 0), [x1, y0] = toWorld(W, H);
    g.lineWidth = 1;
    for (let gx = Math.floor(x0 / minor) * minor; gx <= x1; gx += minor) {
      const [sx] = toScreen(gx, 0);
      g.strokeStyle = gx === 0 ? (dark ? '#5a6476' : '#8a95a8') : gx % major === 0 ? (dark ? '#2b313c' : '#d5d9e0') : (dark ? '#1c2028' : '#eceef2');
      g.beginPath(); g.moveTo(sx + 0.5, 0); g.lineTo(sx + 0.5, H); g.stroke();
    }
    for (let gy = Math.floor(y0 / minor) * minor; gy <= y1; gy += minor) {
      const [, sy] = toScreen(0, gy);
      g.strokeStyle = gy === 0 ? (dark ? '#5a6476' : '#8a95a8') : gy % major === 0 ? (dark ? '#2b313c' : '#d5d9e0') : (dark ? '#1c2028' : '#eceef2');
      g.beginPath(); g.moveTo(0, sy + 0.5); g.lineTo(W, sy + 0.5); g.stroke();
    }
    g.fillStyle = dark ? '#6b7385' : '#7a8495';
    g.font = '11px system-ui, sans-serif';
    for (let gx = Math.floor(x0 / major) * major; gx <= x1; gx += major) { const [sx] = toScreen(gx, 0); g.fillText(String(gx), sx + 3, H - 5); }
    for (let gy = Math.floor(y0 / major) * major; gy <= y1; gy += major) { const [, sy] = toScreen(0, gy); g.fillText(String(gy), 4, sy - 3); }
    // other parts for context
    g.strokeStyle = dark ? 'rgba(160,170,190,0.35)' : 'rgba(80,90,110,0.3)';
    g.setLineDash([4, 3]);
    for (const o of parts) {
      if (o.id === part.id || o.hidden) continue;
      const sil = silhouette(o);
      if (!sil) continue;
      for (const poly of sil) {
        g.beginPath();
        poly.forEach(([x, y], i) => { const [sx, sy] = toScreen(x - part.pos[0], y - part.pos[1]); i ? g.lineTo(sx, sy) : g.moveTo(sx, sy); });
        g.closePath(); g.stroke();
      }
    }
    g.setLineDash([]);
    // outline (filled)
    const out = outlineOf(part);
    if (out.length > 2) {
      const fillPoly = (arr, mirror) => {
        g.beginPath();
        arr.forEach((o, i) => { const [sx, sy] = toScreen(mirror ? -o.p[0] : o.p[0], o.p[1]); i ? g.lineTo(sx, sy) : g.moveTo(sx, sy); });
        g.closePath();
      };
      g.fillStyle = part.op === 'subtract' ? 'rgba(220,80,60,0.18)' : dark ? 'rgba(120,150,200,0.22)' : 'rgba(60,100,170,0.15)';
      fillPoly(out, false); g.fill();
      if (isLathe) { g.fillStyle = dark ? 'rgba(120,150,200,0.1)' : 'rgba(60,100,170,0.07)'; fillPoly(out, true); g.fill(); }
      g.lineWidth = 2;
      for (let i = 0; i < out.length; i++) {
        const a = out[i], b = out[(i + 1) % out.length];
        g.strokeStyle = a.s && b.s ? '#ff7a45' : dark ? '#cfd6e4' : '#33415c';
        const [ax, ay] = toScreen(...a.p), [bx, by] = toScreen(...b.p);
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      }
    }
    if (isLathe) {
      g.strokeStyle = '#3aa0ff'; g.setLineDash([8, 4]);
      const [sx] = toScreen(0, 0);
      g.beginPath(); g.moveTo(sx, 0); g.lineTo(sx, H); g.stroke(); g.setLineDash([]);
    }
    // handles
    pts.forEach((p, i) => {
      const [sx, sy] = toScreen(p.x, p.y);
      const selp = i === pointSel;
      g.fillStyle = p.s ? '#ff7a45' : '#3aa0ff';
      g.strokeStyle = selp ? (dark ? '#fff' : '#000') : dark ? '#0b0d10' : '#fff';
      g.lineWidth = selp ? 3 : 1.5;
      const r = selp ? 7 : 5.5;
      g.beginPath();
      if (p.c) g.arc(sx, sy, r, 0, Math.PI * 2); else g.rect(sx - r, sy - r, r * 2, r * 2);
      g.fill(); g.stroke();
    });
  };

  useEffect(() => {
    if (view.current.fittedFor !== part.id) { view.current.fittedFor = part.id; requestAnimationFrame(fit); }
    draw();
  });

  useEffect(() => {
    const ro = new ResizeObserver(() => draw());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const hitPoint = (sx, sy) => {
    let best = -1, bd = HIT;
    pts.forEach((p, i) => { const [px, py] = toScreen(p.x, p.y); const d = Math.hypot(px - sx, py - sy); if (d < bd) { bd = d; best = i; } });
    return best;
  };

  const local = (e) => { const r = canvasRef.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

  const constrain = (i, x, y) => {
    if (sym && (i === 0 || i === pts.length - 1)) x = 0;
    if (sym) x = Math.max(0, x);
    if (isLathe) x = Math.max(0, x);
    return [x, y];
  };

  const snap = (v, e) => { const s = e.shiftKey ? 5 : e.altKey ? 0.1 : 0.5; return Math.round(v / s) * s; };

  const onDown = (e) => {
    canvasRef.current.focus();
    const [sx, sy] = local(e);
    const i = imgMode ? -1 : hitPoint(sx, sy);
    canvasRef.current.setPointerCapture(e.pointerId);
    if (i >= 0) {
      setPointSel(i);
      drag.current = { kind: 'point', i };
    } else if (imgMode && refImg) {
      drag.current = { kind: 'img', start: [sx, sy], orig: [refImg.x, refImg.y] };
    } else {
      drag.current = { kind: 'pan', start: [sx, sy], orig: [view.current.ox, view.current.oy] };
    }
  };

  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const [sx, sy] = local(e);
    if (d.kind === 'pan') {
      view.current.ox = d.orig[0] + sx - d.start[0];
      view.current.oy = d.orig[1] + sy - d.start[1];
      draw();
    } else if (d.kind === 'img') {
      const z = view.current.z;
      setRefImgs((m) => ({ ...m, [part.id]: { ...refImg, x: d.orig[0] + (sx - d.start[0]) / z, y: d.orig[1] - (sy - d.start[1]) / z } }));
    } else {
      let [x, y] = toWorld(sx, sy);
      [x, y] = constrain(d.i, snap(x, e), snap(y, e));
      const next = pts.map((p, k) => (k === d.i ? { ...p, x, y } : p));
      onPoints(next, `drag-${part.id}-${d.i}`);
    }
  };

  const onUp = () => { drag.current = null; };

  const onWheel = (e) => {
    e.preventDefault();
    const [sx, sy] = local(e);
    const v = view.current;
    const [wx, wy] = toWorld(sx, sy);
    v.z = Math.min(40, Math.max(0.02, v.z * Math.exp(-e.deltaY * 0.0015)));
    v.ox = sx - wx * v.z;
    v.oy = sy + wy * v.z;
    draw();
  };

  const onDbl = (e) => {
    const [sx, sy] = local(e);
    const i = hitPoint(sx, sy);
    if (i >= 0) { toggle(i, 'c'); return; }
    // insert on nearest segment of the control polygon
    const closed = !isLathe && !sym;
    const n = pts.length;
    let best = -1, bd = 14, bpt = null;
    const segs = closed ? n : n - 1;
    for (let k = 0; k < segs; k++) {
      const a = toScreen(pts[k].x, pts[k].y), b = toScreen(pts[(k + 1) % n].x, pts[(k + 1) % n].y);
      const ex = b[0] - a[0], ey = b[1] - a[1];
      const l2 = ex * ex + ey * ey || 1;
      const t = Math.max(0, Math.min(1, ((sx - a[0]) * ex + (sy - a[1]) * ey) / l2));
      const d = Math.hypot(a[0] + t * ex - sx, a[1] + t * ey - sy);
      if (d < bd) { bd = d; best = k; bpt = [a[0] + t * ex, a[1] + t * ey]; }
    }
    if (best < 0) return;
    let [x, y] = toWorld(...bpt);
    [x, y] = constrain(best + 1, Math.round(x * 2) / 2, Math.round(y * 2) / 2);
    const a = pts[best], b = pts[(best + 1) % n];
    const np = { x, y, ...(a.s && b.s ? { s: 1 } : {}), ...(a.c || b.c ? { c: 1 } : {}) };
    const next = pts.slice(0, best + 1).concat([np], pts.slice(best + 1));
    onPoints(next, null);
    setPointSel(best + 1);
  };

  const toggle = (i, flag) => {
    if (i == null || !pts[i]) return;
    const next = pts.map((p, k) => {
      if (k !== i) return p;
      const q = { ...p };
      if (q[flag]) delete q[flag]; else q[flag] = 1;
      return q;
    });
    onPoints(next, null);
  };

  const remove = (i) => {
    if (i == null || pts.length <= 3) return;
    if (sym && (i === 0 || i === pts.length - 1)) return;
    onPoints(pts.filter((_, k) => k !== i), null);
    setPointSel(null);
  };

  const onKey = (e) => {
    const i = pointSel;
    if (e.key === 'Delete' || e.key === 'Backspace') { remove(i); e.preventDefault(); }
    else if (e.key === 's' || e.key === 'S') toggle(i, 's');
    else if (e.key === 'c' || e.key === 'C') toggle(i, 'c');
    else if (e.key === 'f' || e.key === 'F') fit();
    else if (i != null && e.key.startsWith('Arrow')) {
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowDown' ? -step : e.key === 'ArrowUp' ? step : 0;
      const [x, y] = constrain(i, pts[i].x + dx, pts[i].y + dy);
      onPoints(pts.map((p, k) => (k === i ? { ...p, x, y } : p)), `nudge-${part.id}-${i}`);
      e.preventDefault();
    } else return;
    e.stopPropagation();
  };

  const loadImage = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      const im = new Image();
      im.onload = () => {
        imgEl.current[part.id] = im;
        const outline = outlineOf(part).map((o) => o.p);
        const ys = outline.map((p) => p[1]);
        const h = ys.length ? Math.max(...ys) - Math.min(...ys) : 500;
        const w = (h * im.naturalWidth) / im.naturalHeight;
        setRefImgs((m) => ({ ...m, [part.id]: { src: reader.result, w: Math.round(w), x: 0, y: ys.length ? Math.round((Math.max(...ys) + Math.min(...ys)) / 2) : 0, opacity: 0.5 } }));
        setImgMode(true);
      };
      im.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const sp = pointSel != null ? pts[pointSel] : null;
  const setSel = (k, val) => {
    if (!sp || !Number.isFinite(val)) return;
    let { x, y } = { ...sp, [k]: val };
    [x, y] = constrain(pointSel, x, y);
    onPoints(pts.map((p, i) => (i === pointSel ? { ...p, x, y } : p)), `field-${part.id}-${pointSel}-${k}`);
  };

  return (
    <div class="pe">
      <div class="pe-bar">
        <strong class="pe-title">{part.name}</strong>
        <span class="pe-sub">{isLathe ? 'profile (radius × length), spun around the blue axis' : sym ? 'right half, mirrored' : 'outline'} · mm</span>
        <div class="pe-tools">
          {sp ? (
            <>
              <label>X <input type="number" step="0.5" value={sp.x} onInput={(e) => setSel('x', parseFloat(e.target.value))} /></label>
              <label>Y <input type="number" step="0.5" value={sp.y} onInput={(e) => setSel('y', parseFloat(e.target.value))} /></label>
              {!isLathe && <button class={sp.s ? 'on' : ''} title="Sharp edge (S)" onClick={() => toggle(pointSel, 's')}>Sharp</button>}
              <button class={sp.c ? 'on' : ''} title="Smooth curve through this point (C)" onClick={() => toggle(pointSel, 'c')}>Curve</button>
              <button title="Delete point (Del)" onClick={() => remove(pointSel)}>Delete</button>
            </>
          ) : <span class="muted">Click a point to edit it</span>}
          <span class="sep" />
          {part.type === 'profile' && (
            <label class="chk"><input type="checkbox" checked={!!part.symmetric} onChange={(e) => onPatch(symmetryPatch(part, e.target.checked))} /> Mirror</label>
          )}
          <button onClick={fit} title="Fit view (F)">Fit</button>
          <label class="btn" title="Load a picture of the weapon to trace over">
            Trace image<input type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && loadImage(e.target.files[0])} />
          </label>
        </div>
      </div>
      {refImg && (
        <div class="pe-bar pe-img">
          <span>Reference:</span>
          <label>width <input type="number" value={refImg.w} onInput={(e) => setRefImgs((m) => ({ ...m, [part.id]: { ...refImg, w: +e.target.value || refImg.w } }))} /> mm</label>
          <label>opacity <input type="range" min="0.05" max="1" step="0.05" value={refImg.opacity} onInput={(e) => setRefImgs((m) => ({ ...m, [part.id]: { ...refImg, opacity: +e.target.value } }))} /></label>
          <label class="chk"><input type="checkbox" checked={imgMode} onChange={(e) => setImgMode(e.target.checked)} /> drag image</label>
          <button onClick={() => { setRefImgs((m) => { const n = { ...m }; delete n[part.id]; return n; }); setImgMode(false); }}>Remove</button>
        </div>
      )}
      <div class="pe-canvas" ref={wrapRef}>
        <canvas ref={canvasRef} tabIndex={0} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          onWheel={onWheel} onDblClick={onDbl} onKeyDown={onKey} />
        <div class="pe-help">Drag points · double-click a line to add a point · double-click a point to curve it · Del deletes · S = sharp edge · scroll to zoom, drag to pan</div>
      </div>
    </div>
  );
}

export function symmetryPatch(part, on) {
  if (!!part.symmetric === on) return {};
  return { symmetric: on, points: on ? toHalf(part.points) : expandSymmetric(part.points) };
}

// convert a full outline into a right half running bottom-centre -> top-centre
function toHalf(points) {
  let pts = points;
  if (signedArea(pts.map((p) => [p.x, p.y])) < 0) pts = pts.slice().reverse();
  const n = pts.length;
  let bi = 0, ti = 0;
  pts.forEach((p, i) => { if (p.y < pts[bi].y) bi = i; if (p.y > pts[ti].y) ti = i; });
  const half = [];
  for (let i = bi, guard = 0; guard <= n; i = (i + 1) % n, guard++) { half.push(pts[i]); if (i === ti) break; }
  if (half.length < 2) return points;
  const mid = half.slice(1, -1).map((p) => ({ ...p, x: Math.max(0.5, p.x) }));
  return [{ ...half[0], x: 0 }, ...mid, { ...half[half.length - 1], x: 0 }];
}
