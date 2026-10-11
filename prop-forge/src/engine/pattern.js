// Colour patterns that belong to a blade outline (e.g. the red toothed band
// along a scythe's edge). They are worked out from the outline as it is
// now, so when its nodes are dragged the pattern carries on along the new
// shape instead of staying where it was drawn.
import { profileOutline } from './parts.js';
import { expandSymmetric, segmentControls, bezierPoint, signedArea } from './geom2d.js';

// The cutting edge: the longest run of sharp segments (both nodes sharp),
// sampled along its curves and walked counter-clockwise like the outline.
function edgeRun(part) {
  const nodes = part.symmetric ? expandSymmetric(part.points) : part.points;
  const n = nodes.length;
  if (n < 3) return null;
  const sharp = (i) => !!(nodes[i].s && nodes[(i + 1) % n].s);
  const idx = [...Array(n).keys()];
  if (!idx.some(sharp)) return null;
  const start = idx.find((i) => !sharp(i));
  const runs = [];
  if (start === undefined) runs.push(idx);
  else {
    let cur = null;
    for (let k = 1; k <= n; k++) {
      const i = (start + k) % n;
      if (sharp(i)) (cur ||= []).push(i);
      else if (cur) { runs.push(cur); cur = null; }
    }
    if (cur) runs.push(cur);
  }
  const sampleRun = (segs) => {
    const out = [];
    for (const i of segs) {
      const a = nodes[i], b = nodes[(i + 1) % n];
      const c = segmentControls(nodes, i, true);
      if (!out.length) out.push([a.x, a.y]);
      if (!c) out.push([b.x, b.y]);
      else for (let k = 1; k <= 24; k++) out.push(bezierPoint(c, k / 24));
    }
    return out;
  };
  let best = null, bestLen = -1;
  for (const r of runs) {
    const pts = sampleRun(r);
    const L = pts.reduce((a, p, i) => (i ? a + len(pts[i - 1], p) : 0), 0);
    if (L > bestLen) { best = pts; bestLen = L; }
  }
  if (!best || best.length < 2) return null;
  if (signedArea(nodes.map((q) => [q.x, q.y])) < 0) best.reverse();
  return best;
}

const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// Resample a polyline every `step`.
function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const L = len(a, b);
    let t = step - carry;
    while (t < L) { out.push([a[0] + ((b[0] - a[0]) * t) / L, a[1] + ((b[1] - a[1]) * t) / L]); t += step; }
    carry = L - (t - step);
  }
  const last = pts[pts.length - 1];
  if (len(out[out.length - 1], last) > step * 0.3) out.push(last);
  return out;
}

// Distance from p along direction n to the outline (first crossing beyond 0.5 mm).
function rayToOutline(poly, p, n) {
  let best = Infinity;
  for (let i = 0, m = poly.length; i < m; i++) {
    const a = poly[i], b = poly[(i + 1) % m];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const den = n[0] * ey - n[1] * ex;
    if (Math.abs(den) < 1e-12) continue;
    const wx = a[0] - p[0], wy = a[1] - p[1];
    const t = (wx * ey - wy * ex) / den; // along the ray
    const u = (wx * n[1] - wy * n[0]) / den; // along the segment
    if (t > 0.5 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return best;
}

// Toothed band along the edge: `band` % of the blade's height plus teeth of
// `toothH` % pointing in from the edge. The teeth keep their spacing when
// the edge gets longer or shorter (`refLen` is the edge length they were
// counted on). `lead` carries the band back past the first sharp node (e.g.
// to where the blade leaves its socket).
function teethPolygon(part, pat) {
  const poly = profileOutline(part).map((s) => s.p);
  let edge = edgeRun(part);
  if (!edge) return null;
  // walk back from the start of the run for `lead` mm
  if (+pat.lead > 0) {
    const back = [];
    let i = 0, bestD = Infinity;
    poly.forEach((q, k) => { const d = len(q, edge[0]); if (d < bestD) { bestD = d; i = k; } });
    let need = +pat.lead, prev = edge[0];
    for (let k = 0; k < poly.length && need > 0; k++) {
      i = (i - 1 + poly.length) % poly.length;
      const q = poly[i], d = len(prev, q);
      if (d >= need) { back.unshift([prev[0] + ((q[0] - prev[0]) * need) / d, prev[1] + ((q[1] - prev[1]) * need) / d]); need = 0; } else { back.unshift(q); need -= d; }
      prev = q;
    }
    edge = back.concat(edge);
  }
  const pts = resample(edge, 3);
  if (pts.length < 3) return null;
  const total = pts.reduce((a, p, i) => (i ? a + len(pts[i - 1], p) : 0), 0);
  const teeth = Math.max(1, Math.round((+pat.teeth || 8) * (pat.refLen ? total / pat.refLen : 1)));
  const outer = [], inner = [];
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) s += len(pts[i - 1], pts[i]);
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const tl = len(a, b) || 1;
    const t = [(b[0] - a[0]) / tl, (b[1] - a[1]) / tl];
    const nIn = [-t[1], t[0]]; // the outline runs counter-clockwise, so inside is on the left
    const u = s / total;
    // blade height here (a ray that slips out at a sharp tip counts as none)
    let h = rayToOutline(poly, pts[i], nIn);
    if (!Number.isFinite(h)) h = 0;
    const f = (u * teeth) % 1;
    const tooth = f < 0.5 ? f * 2 : (1 - f) * 2; // triangle wave, peaks pointing in
    const band = Math.min(h - 1.5, h * ((+pat.band || 0) / 100) * (1 - 0.3 * u) + h * ((+pat.toothH || 0) / 100) * tooth * (1 - 0.5 * u));
    outer.push([pts[i][0] - nIn[0] * 6, pts[i][1] - nIn[1] * 6]);
    inner.push([pts[i][0] + nIn[0] * Math.max(0.5, band), pts[i][1] + nIn[1] * Math.max(0.5, band)]);
    if (i === 0) outer.unshift([outer[0][0] - t[0] * 6, outer[0][1] - t[1] * 6]);
    if (i === pts.length - 1) outer.push([outer[outer.length - 1][0] + t[0] * 8, outer[outer.length - 1][1] + t[1] * 8]);
  }
  return outer.concat(inner.reverse());
}

// Zone parts for every part that carries a pattern, in the same place as
// that part (they colour, they add no material).
export function patternZones(parts) {
  const out = [];
  for (const part of parts) {
    if (!part.pattern || part.hidden || part.type !== 'profile' || part.op === 'subtract') continue;
    const pat = part.pattern;
    let poly = null;
    try { if (pat.type === 'teeth') poly = teethPolygon(part, pat); } catch { poly = null; }
    if (!poly || poly.length < 3) continue;
    out.push({
      id: `${part.id}-pattern`, name: `${part.name}: pattern`, type: 'profile', op: 'paint', fromPattern: part.id,
      // guide lines only on the piece the pattern belongs to
      on: part.separate ? (part.separate === true ? part.id : String(part.separate)) : 'main',
      points: poly.map(([x, y]) => ({ x, y })), thickness: (+part.thickness || 10) + 8, edge: (+part.thickness || 10) + 8, bevel: 0,
      pos: part.pos, rot: part.rot, stretch: part.stretch, copies: part.copies, filament: +pat.filament || 2, color: '#8f6bd8',
    });
  }
  return out;
}

// Length of a part's cutting edge (for `refLen`).
export function edgeLength(part) {
  const run = edgeRun(part);
  return run ? run.reduce((a, p, i) => (i ? a + len(run[i - 1], p) : 0), 0) : 0;
}
