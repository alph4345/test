// 2D outline editor for blade-style (profile) and round (lathe) parts.
// Works like the node tool of a vector drawing app: drag nodes, click a
// "+" on any segment to insert a node there, right-click (or Delete) to
// remove one, and drag the round handles of a curve node to bend it.
import { useEffect, useRef, useState } from 'preact/hooks';
import { outlineOf, silhouette } from './silhouette.js';
import { expandSymmetric, signedArea, segmentControls, bezierPoint, autoHandle, segmentMidpoint } from '../engine/geom2d.js';

const HIT = 9;

// split segment i at parameter t, keeping the outline's shape
function insertPoint(pts, i, t, closed) {
  const n = pts.length;
  const j = (i + 1) % n;
  const a = pts[i], b = pts[j];
  const c = segmentControls(pts, i, closed);
  const next = pts.map((p) => ({ ...p }));
  let np;
  if (!c) {
    np = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  } else {
    // de Casteljau split
    const lerp = (p, q) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    const p01 = lerp(c[0], c[1]), p12 = lerp(c[1], c[2]), p23 = lerp(c[2], c[3]);
    const p012 = lerp(p01, p12), p123 = lerp(p12, p23), m = lerp(p012, p123);
    np = { x: m[0], y: m[1], c: 1, hi: [p012[0] - m[0], p012[1] - m[1]], ho: [p123[0] - m[0], p123[1] - m[1]] };
    next[i].ho = [p01[0] - a.x, p01[1] - a.y];
    next[j].hi = [p23[0] - b.x, p23[1] - b.y];
  }
  np.x = Math.round(np.x * 10) / 10;
  np.y = Math.round(np.y * 10) / 10;
  if (a.s && b.s) np.s = 1;
  next.splice(i + 1, 0, np);
  return next;
}

export function ProfileEditor({ part, parts, onPoints, onPatch, pointSel, setPointSel, dark }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const view = useRef({ z: 0.5, ox: 200, oy: 300, fittedFor: null });
  const drag = useRef(null);
  const hover = useRef(null);
  const [refImgs, setRefImgs] = useState({});
  const [imgMode, setImgMode] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const refImg = refImgs[part.id];
  const imgEl = useRef({});

  const pts = part.points;
  const isLathe = part.type === 'lathe';
  const sym = part.type === 'profile' && part.symmetric;
  const closed = !isLathe && !sym;

  // long outlines are shown lying down (tip to the right) so they use the
  // wide editor panel; `rot` swaps the axes
  const [rotPref, setRotPref] = useState(null);
  const ys = pts.map((p) => p.y), xs = pts.map((p) => p.x);
  const autoRot = (Math.max(...ys) - Math.min(...ys)) > 1.6 * Math.max(1, (Math.max(...xs) - Math.min(...xs)) * (isLathe || sym ? 2 : 1));
  const rot = rotPref == null ? autoRot : rotPref;
  const toScreen = (x, y) => { const v = view.current; return rot ? [v.ox + y * v.z, v.oy + x * v.z] : [v.ox + x * v.z, v.oy - y * v.z]; };
  const toWorld = (sx, sy) => { const v = view.current; return rot ? [(sy - v.oy) / v.z, (sx - v.ox) / v.z] : [(sx - v.ox) / v.z, (v.oy - sy) / v.z]; };

  const segCount = closed ? pts.length : pts.length - 1;
  const handleOf = (i, which) => autoHandle(pts, i, closed, which);

  const fit = () => {
    const c = canvasRef.current;
    if (!c) return;
    const W = c.clientWidth, H = c.clientHeight;
    const all = outlineOf(part).map((o) => o.p).concat(pts.map((p) => [p.x, p.y]));
    if (isLathe || sym) all.push(...all.map(([x, y]) => [-x, y]));
    if (!all.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of all) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const ew = rot ? maxY - minY : maxX - minX, eh = rot ? maxX - minX : maxY - minY;
    const z = Math.min((W - 60) / Math.max(10, ew), (H - 50) / Math.max(10, eh));
    view.current.z = z;
    view.current.ox = 0; view.current.oy = 0;
    const [cx, cy] = toScreen((minX + maxX) / 2, (minY + maxY) / 2);
    view.current.ox = W / 2 - cx;
    view.current.oy = H / 2 - cy;
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
      const [sx, sy] = toScreen(refImg.x, refImg.y);
      g.save();
      g.globalAlpha = refImg.opacity;
      g.translate(sx, sy);
      if (rot) g.rotate(Math.PI / 2);
      g.drawImage(im, (-w / 2) * v.z, (-h / 2) * v.z, w * v.z, h * v.z);
      g.restore();
    }
    // grid (drawn in world coordinates so it works in either orientation)
    const minor = v.z > 2 ? 5 : v.z > 0.6 ? 10 : v.z > 0.2 ? 50 : 100;
    const major = minor * (minor === 50 ? 2 : 5);
    const corners = [toWorld(0, 0), toWorld(W, 0), toWorld(0, H), toWorld(W, H)];
    const wx0 = Math.min(...corners.map((c) => c[0])), wx1 = Math.max(...corners.map((c) => c[0]));
    const wy0 = Math.min(...corners.map((c) => c[1])), wy1 = Math.max(...corners.map((c) => c[1]));
    g.lineWidth = 1;
    const gridColor = (val) => (val === 0 ? (dark ? '#5a6476' : '#8a95a8') : val % major === 0 ? (dark ? '#2b313c' : '#d5d9e0') : (dark ? '#1c2028' : '#eceef2'));
    const line = (a1, a2, val) => {
      const [ax, ay] = toScreen(...a1), [bx, by] = toScreen(...a2);
      g.strokeStyle = gridColor(val);
      g.beginPath(); g.moveTo(Math.round(ax) + 0.5, Math.round(ay) + 0.5); g.lineTo(Math.round(bx) + 0.5, Math.round(by) + 0.5); g.stroke();
    };
    for (let gx = Math.floor(wx0 / minor) * minor; gx <= wx1; gx += minor) line([gx, wy0], [gx, wy1], gx);
    for (let gy = Math.floor(wy0 / minor) * minor; gy <= wy1; gy += minor) line([wx0, gy], [wx1, gy], gy);
    g.fillStyle = dark ? '#6b7385' : '#7a8495';
    g.font = '11px system-ui, sans-serif';
    let lab = major;
    while (lab * v.z < 70) lab *= lab % 25 === 0 ? 2 : 2.5;
    for (let gy = Math.floor(wy0 / lab) * lab; gy <= wy1; gy += lab) {
      const [sx, sy] = toScreen(rot ? 0 : wx0, gy);
      if (rot) g.fillText(`y ${gy}`, sx + 3, H - 5); else g.fillText(`y ${gy}`, 4, sy - 3);
    }
    for (let gx = Math.floor(wx0 / lab) * lab; gx <= wx1; gx += lab) {
      const [sx, sy] = toScreen(gx, rot ? wy0 : 0);
      if (rot) g.fillText(`x ${gx}`, 4, sy - 3); else g.fillText(`x ${gx}`, sx + 3, H - 5);
    }
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
    // "+" insert markers at the middle of every segment
    for (let i = 0; i < segCount; i++) {
      const [mx, my] = toScreen(...segmentMidpoint(pts, i, closed));
      const hot = hover.current && hover.current.kind === 'mid' && hover.current.i === i;
      g.fillStyle = hot ? '#2fbf71' : dark ? 'rgba(47,191,113,0.55)' : 'rgba(30,150,90,0.55)';
      g.beginPath(); g.arc(mx, my, hot ? 7 : 5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(mx - 3, my); g.lineTo(mx + 3, my); g.moveTo(mx, my - 3); g.lineTo(mx, my + 3); g.stroke();
    }
    // Bezier handles of the selected node
    if (pointSel != null && pts[pointSel] && pts[pointSel].c) {
      const p = pts[pointSel];
      const [px, py] = toScreen(p.x, p.y);
      for (const which of ['in', 'out']) {
        const h = handleOf(pointSel, which);
        if (!h) continue;
        const [hx, hy] = toScreen(p.x + h[0], p.y + h[1]);
        g.strokeStyle = '#b07cff'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(px, py); g.lineTo(hx, hy); g.stroke();
        g.fillStyle = (which === 'in' ? p.hi : p.ho) ? '#b07cff' : dark ? '#111318' : '#fff';
        g.beginPath(); g.arc(hx, hy, 5, 0, Math.PI * 2); g.fill(); g.stroke();
      }
    }
    // nodes
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
    const key = `${part.id}|${rot}`;
    if (view.current.fittedFor !== key) { view.current.fittedFor = key; requestAnimationFrame(fit); }
    draw();
  });

  useEffect(() => {
    const ro = new ResizeObserver(() => draw());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // what is under the cursor: node, handle, "+" marker, or a segment
  const hitTest = (sx, sy) => {
    if (pointSel != null && pts[pointSel]?.c) {
      const p = pts[pointSel];
      for (const which of ['in', 'out']) {
        const h = handleOf(pointSel, which);
        if (!h) continue;
        const [hx, hy] = toScreen(p.x + h[0], p.y + h[1]);
        if (Math.hypot(hx - sx, hy - sy) < HIT) return { kind: 'handle', i: pointSel, which };
      }
    }
    let best = null, bd = HIT;
    pts.forEach((p, i) => { const [px, py] = toScreen(p.x, p.y); const d = Math.hypot(px - sx, py - sy); if (d < bd) { bd = d; best = { kind: 'node', i }; } });
    if (best) return best;
    for (let i = 0; i < segCount; i++) {
      const [mx, my] = toScreen(...segmentMidpoint(pts, i, closed));
      if (Math.hypot(mx - sx, my - sy) < HIT) return { kind: 'mid', i };
    }
    return null;
  };

  // nearest position on the outline (segment index + parameter)
  const nearestOnOutline = (sx, sy, maxDist = 12) => {
    let best = null, bd = maxDist;
    for (let i = 0; i < segCount; i++) {
      const c = segmentControls(pts, i, closed);
      const a = pts[i], b = pts[(i + 1) % pts.length];
      for (let k = 0; k <= 40; k++) {
        const t = k / 40;
        const p = c ? bezierPoint(c, t) : [a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t];
        const [px, py] = toScreen(p[0], p[1]);
        const d = Math.hypot(px - sx, py - sy);
        if (d < bd) { bd = d; best = { i, t: Math.min(0.97, Math.max(0.03, t)) }; }
      }
    }
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

  const insertAt = (i, t) => {
    const next = insertPoint(pts, i, t, closed);
    const [x, y] = constrain(i + 1, next[i + 1].x, next[i + 1].y);
    next[i + 1].x = x; next[i + 1].y = y;
    onPoints(next, null);
    setPointSel(i + 1);
  };

  const onDown = (e) => {
    canvasRef.current.focus();
    if (e.button === 2) return; // context menu handles deletes
    const [sx, sy] = local(e);
    canvasRef.current.setPointerCapture(e.pointerId);
    if (imgMode && refImg) {
      drag.current = { kind: 'img', start: [sx, sy], orig: [refImg.x, refImg.y] };
      return;
    }
    const hit = hitTest(sx, sy);
    if (hit?.kind === 'handle') { drag.current = { kind: 'handle', i: hit.i, which: hit.which }; return; }
    if (hit?.kind === 'node') { setPointSel(hit.i); drag.current = { kind: 'point', i: hit.i }; return; }
    if (hit?.kind === 'mid') { insertAt(hit.i, 0.5); drag.current = { kind: 'point', i: hit.i + 1 }; return; }
    if (addMode) {
      const near = nearestOnOutline(sx, sy, 30);
      if (near) { insertAt(near.i, near.t); drag.current = { kind: 'point', i: near.i + 1 }; return; }
    }
    drag.current = { kind: 'pan', start: [sx, sy], orig: [view.current.ox, view.current.oy] };
  };

  const onMove = (e) => {
    const [sx, sy] = local(e);
    const d = drag.current;
    if (!d) {
      const h = hitTest(sx, sy);
      const key = h ? `${h.kind}${h.i}${h.which || ''}` : '';
      if (key !== (hover.current?.key || '')) { hover.current = h ? { ...h, key } : null; draw(); }
      canvasRef.current.style.cursor = h ? (h.kind === 'mid' ? 'copy' : 'grab') : addMode ? 'copy' : 'crosshair';
      return;
    }
    if (d.kind === 'pan') {
      view.current.ox = d.orig[0] + sx - d.start[0];
      view.current.oy = d.orig[1] + sy - d.start[1];
      draw();
    } else if (d.kind === 'img') {
      const z = view.current.z;
      setRefImgs((m) => ({ ...m, [part.id]: { ...refImg, x: d.orig[0] + (sx - d.start[0]) / z, y: d.orig[1] - (sy - d.start[1]) / z } }));
    } else if (d.kind === 'handle') {
      const p = pts[d.i];
      const [wx, wy] = toWorld(sx, sy);
      const h = [snap(wx - p.x, e), snap(wy - p.y, e)];
      const q = { ...p };
      const other = d.which === 'in' ? 'ho' : 'hi';
      q[d.which === 'in' ? 'hi' : 'ho'] = h;
      if (!e.altKey) {
        // smooth node: keep the opposite handle in line (its own length)
        const o = handleOf(d.i, d.which === 'in' ? 'out' : 'in');
        const len = o ? Math.hypot(o[0], o[1]) : Math.hypot(h[0], h[1]);
        const hl = Math.hypot(h[0], h[1]) || 1;
        q[other] = [(-h[0] / hl) * len, (-h[1] / hl) * len];
      } else if (!q[other]) {
        const o = handleOf(d.i, d.which === 'in' ? 'out' : 'in');
        if (o) q[other] = o;
      }
      onPoints(pts.map((pp, k) => (k === d.i ? q : pp)), `handle-${part.id}-${d.i}`);
    } else {
      let [x, y] = toWorld(sx, sy);
      [x, y] = constrain(d.i, snap(x, e), snap(y, e));
      onPoints(pts.map((p, k) => (k === d.i ? { ...p, x, y } : p)), `drag-${part.id}-${d.i}`);
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
    const hit = hitTest(sx, sy);
    if (hit?.kind === 'node') { toggle(hit.i, 'c'); return; }
    const near = nearestOnOutline(sx, sy);
    if (near) insertAt(near.i, near.t);
  };

  const onContext = (e) => {
    e.preventDefault();
    const [sx, sy] = local(e);
    const hit = hitTest(sx, sy);
    if (hit?.kind === 'node') remove(hit.i);
  };

  const toggle = (i, flag) => {
    if (i == null || !pts[i]) return;
    onPoints(pts.map((p, k) => {
      if (k !== i) return p;
      const q = { ...p };
      if (q[flag]) { delete q[flag]; if (flag === 'c') { delete q.hi; delete q.ho; } } else q[flag] = 1;
      return q;
    }), null);
  };

  const setAll = (flag, on) => onPoints(pts.map((p) => { const q = { ...p }; if (on) q[flag] = 1; else delete q[flag]; return q; }), null);

  const resetHandles = (i) => onPoints(pts.map((p, k) => { if (k !== i) return p; const q = { ...p }; delete q.hi; delete q.ho; return q; }), null);

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
    else if (e.key === 'a' || e.key === 'A') setAddMode((m) => !m);
    else if (e.key === 'f' || e.key === 'F') fit();
    else if (i != null && e.key.startsWith('Arrow')) {
      const step = e.shiftKey ? 10 : 1;
      let dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      let dy = e.key === 'ArrowDown' ? -step : e.key === 'ArrowUp' ? step : 0;
      if (rot) [dx, dy] = [-dy, dx];
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
        <span class="pe-sub">{isLathe ? 'profile (radius × length), spun around the blue axis' : sym ? 'right half, mirrored' : 'outline'} · {pts.length} nodes · mm</span>
        <div class="pe-tools">
          <button class={addMode ? 'on' : ''} title="Add nodes: click anywhere on the outline (A)" onClick={() => setAddMode(!addMode)}>+ Add node</button>
          <button disabled={!sp || pts.length <= 3} title="Delete the selected node (Del or right-click a node)" onClick={() => remove(pointSel)}>− Delete node</button>
          <span class="sep" />
          {sp ? (
            <>
              <label>X <input type="number" step="0.5" value={+sp.x.toFixed(2)} onInput={(e) => setSel('x', parseFloat(e.target.value))} /></label>
              <label>Y <input type="number" step="0.5" value={+sp.y.toFixed(2)} onInput={(e) => setSel('y', parseFloat(e.target.value))} /></label>
              {!isLathe && <button class={sp.s ? 'on' : ''} title="Sharpened edge at this node (S)" onClick={() => toggle(pointSel, 's')}>Sharp</button>}
              <button class={sp.c ? 'on' : ''} title="Curve: smooth node with handles (C)" onClick={() => toggle(pointSel, 'c')}>Curve</button>
              {sp.c && (sp.hi || sp.ho) && <button title="Back to automatic smooth handles" onClick={() => resetHandles(pointSel)}>Auto handles</button>}
            </>
          ) : <span class="muted">Click a node to edit it</span>}
          <span class="sep" />
          {!isLathe && (
            <>
              <button title="Mark every node as a sharpened edge" onClick={() => setAll('s', true)}>All sharp</button>
              <button title="Make every edge blunt" onClick={() => setAll('s', false)}>All blunt</button>
            </>
          )}
          {part.type === 'profile' && (
            <label class="chk"><input type="checkbox" checked={!!part.symmetric} onChange={(e) => onPatch(symmetryPatch(part, e.target.checked))} /> Mirror</label>
          )}
          <button class={rot ? 'on' : ''} title="Lay the outline sideways (tip to the right) to use the wide panel" onClick={() => setRotPref(!rot)}>Sideways</button>
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
          onWheel={onWheel} onDblClick={onDbl} onContextMenu={onContext} onKeyDown={onKey} />
        <div class="pe-help">
          <span><b class="k">drag</b> move node</span>
          <span><b class="k plus">+</b> insert node</span>
          <span><b class="k">right-click</b> delete</span>
          <span><b class="k">Curve</b> → purple handles</span>
          <span><b class="k sharp">orange</b> = sharp edge</span>
          <span><b class="k">scroll</b> zoom</span>
        </div>
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
