// 2D helpers: outline sampling, polygon tests, distance fields and
// build-plate footprint fitting. Pure functions, no DOM or WASM.

export function signedArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export function ensureCCW(pts) {
  return signedArea(pts) < 0 ? pts.slice().reverse() : pts;
}

// A symmetric outline stores only the right half, from the bottom centre
// to the top centre. Mirror it into a full closed outline.
export function expandSymmetric(points) {
  if (points.length < 2) return points.slice();
  const half = points.map((p, i) =>
    i === 0 || i === points.length - 1 ? { ...p, x: 0 } : { ...p, x: Math.abs(p.x) });
  const mirror = [];
  for (let i = half.length - 2; i >= 1; i--) mirror.push({ ...half[i], x: -half[i].x });
  return half.concat(mirror);
}

function hermite(p0, p1, m0, m1, t) {
  const t2 = t * t, t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
  return [
    h00 * p0[0] + h10 * m0[0] + h01 * p1[0] + h11 * m1[0],
    h00 * p0[1] + h10 * m0[1] + h01 * p1[1] + h11 * m1[1],
  ];
}

// Points carry {x, y, s (sharp edge), c (curve through this point)}.
// Returns [{p:[x,y], s:boolean}] densely sampled. Corner points (c=false)
// are kept exactly; curve points get a Catmull-Rom style tangent.
export function sampleCurve(points, closed, step = 6) {
  const n = points.length;
  if (n < 2) return points.map((p) => ({ p: [p.x, p.y], s: !!p.s }));
  const P = points.map((p) => [p.x, p.y]);
  const get = (i) => (closed ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
  const tangent = (i, segFrom, segTo) => {
    const pt = points[closed ? (i + n) % n : i];
    if (!pt.c || (!closed && (i === 0 || i === n - 1))) {
      return [(segTo[0] - segFrom[0]) * 0.0, (segTo[1] - segFrom[1]) * 0.0];
    }
    const a = get(i - 1), b = get(i + 1);
    return [(b[0] - a[0]) * 0.5, (b[1] - a[1]) * 0.5];
  };
  const out = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    const a = P[i], b = P[j];
    const pa = points[i], pb = points[j];
    out.push({ p: a.slice(), s: !!pa.s });
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!pa.c && !pb.c) continue; // straight segment
    let m0 = tangent(i, a, b), m1 = tangent(j, a, b);
    // a corner end of a curved segment points straight at the other end
    if (!pa.c) m0 = [(b[0] - a[0]), (b[1] - a[1])];
    if (!pb.c) m1 = [(b[0] - a[0]), (b[1] - a[1])];
    const k = Math.max(2, Math.min(40, Math.ceil(len / step)));
    for (let t = 1; t < k; t++) {
      const u = t / k;
      const s = pa.s && pb.s ? true : (!pa.s && !pb.s ? false : (u < 0.5 ? !!pa.s : !!pb.s));
      out.push({ p: hermite(a, b, m0, m1, u), s });
    }
  }
  if (!closed) out.push({ p: P[n - 1].slice(), s: !!points[n - 1].s });
  // drop near-duplicate consecutive points
  const clean = [];
  for (const q of out) {
    const last = clean[clean.length - 1];
    if (last && Math.hypot(last.p[0] - q.p[0], last.p[1] - q.p[1]) < 1e-3) continue;
    clean.push(q);
  }
  if (closed && clean.length > 2) {
    const f = clean[0], l = clean[clean.length - 1];
    if (Math.hypot(f.p[0] - l.p[0], f.p[1] - l.p[1]) < 1e-3) clean.pop();
  }
  return clean;
}

function segIntersect(a, b, c, d) {
  const d1x = b[0] - a[0], d1y = b[1] - a[1], d2x = d[0] - c[0], d2y = d[1] - c[1];
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-12) return false;
  const t = ((c[0] - a[0]) * d2y - (c[1] - a[1]) * d2x) / den;
  const u = ((c[0] - a[0]) * d1y - (c[1] - a[1]) * d1x) / den;
  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9;
}

export function isSimplePolygon(pts) {
  const n = pts.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segIntersect(a, b, pts[j], pts[(j + 1) % n])) return false;
    }
  }
  return Math.abs(signedArea(pts)) > 1e-6;
}

// distance along ray from o in direction d to polygon boundary, ignoring
// the edges touching vertex index skip
export function rayHit(pts, o, d, skip) {
  let best = Infinity;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (i === skip || j === skip) continue;
    const a = pts[i], b = pts[j];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const den = d[0] * ey - d[1] * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((a[0] - o[0]) * ey - (a[1] - o[1]) * ex) / den;
    const u = ((a[0] - o[0]) * d[1] - (a[1] - o[1]) * d[0]) / den;
    if (t > 1e-6 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return best;
}

// polys: array of contours ([[x,y],...]); even-odd containment
export function pointInPolys(polys, x, y) {
  let inside = false;
  for (const poly of polys) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

export function distToPolys(polys, x, y) {
  let best = Infinity;
  for (const poly of polys) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const ax = poly[j][0], ay = poly[j][1], bx = poly[i][0], by = poly[i][1];
      const ex = bx - ax, ey = by - ay;
      const l2 = ex * ex + ey * ey;
      let t = l2 > 0 ? ((x - ax) * ex + (y - ay) * ey) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      const dx = ax + t * ex - x, dy = ay + t * ey - y;
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
  }
  return Math.sqrt(best);
}

export function polysBounds(polys) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polys) for (const [x, y] of poly) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

// Grid sample of interior points with their distance to the boundary.
export function interiorSamples(polys, res = 48) {
  const b = polysBounds(polys);
  const w = b.maxX - b.minX, h = b.maxY - b.minY;
  if (!(w > 0 && h > 0)) return [];
  const step = Math.max(w, h) / res;
  const out = [];
  for (let y = b.minY + step / 2; y < b.maxY; y += step) {
    for (let x = b.minX + step / 2; x < b.maxX; x += step) {
      if (pointInPolys(polys, x, y)) out.push({ x, y, d: distToPolys(polys, x, y) });
    }
  }
  return out;
}

// Choose up to `count` well-spread points whose clearance to the boundary
// is at least minD. First pick is the deepest point.
export function spreadPoints(samples, count, minD) {
  const ok = samples.filter((s) => s.d >= minD);
  if (!ok.length || count < 1) return [];
  const picks = [];
  if (count === 1) {
    picks.push(ok.reduce((a, b) => (b.d > a.d ? b : a)));
    return picks;
  }
  // start from the point farthest from the centroid of valid points, then
  // farthest-point sampling
  const cx = ok.reduce((s, p) => s + p.x, 0) / ok.length;
  const cy = ok.reduce((s, p) => s + p.y, 0) / ok.length;
  let first = ok[0], fd = -1;
  for (const p of ok) {
    const d = Math.hypot(p.x - cx, p.y - cy) + p.d * 0.25;
    if (d > fd) { fd = d; first = p; }
  }
  picks.push(first);
  while (picks.length < count) {
    let best = null, bd = -1;
    for (const p of ok) {
      let m = Infinity;
      for (const q of picks) m = Math.min(m, Math.hypot(p.x - q.x, p.y - q.y));
      const score = m + p.d * 0.25;
      if (score > bd) { bd = score; best = p; }
    }
    if (!best || bd < minD * 2.2) break;
    picks.push(best);
  }
  return picks;
}

export function convexHull(points) {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

// Find a rotation (degrees) at which the convex hull fits inside a W x H
// rectangle. Returns {angle, w, h} or null.
export function fitHullInRect(hull, W, H) {
  let best = null;
  for (let deg = 0; deg < 180; deg += 1) {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of hull) {
      const u = x * c - y * s, v = x * s + y * c;
      if (u < minX) minX = u; if (u > maxX) maxX = u;
      if (v < minY) minY = v; if (v > maxY) maxY = v;
    }
    const w = maxX - minX, h = maxY - minY;
    const slack = Math.min(W - w, H - h);
    if (slack >= 0 && (!best || slack > best.slack)) best = { angle: deg, w, h, slack };
  }
  return best;
}
