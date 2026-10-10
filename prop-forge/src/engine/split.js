// Cutting a model into printable pieces, and the joints that hold the
// pieces together again.
import { signedArea, interiorSamples, spreadPoints, polysBounds, pointInPolys, distToPolys, convexHull, fitHullInRect } from './geom2d.js';
import { TAG_JOINT } from './build.js';

export const DOWELS = [
  { d: 12.7, label: '1/2" dowel' },
  { d: 9.53, label: '3/8" dowel' },
  { d: 8, label: '8 mm dowel' },
  { d: 7.94, label: '5/16" dowel' },
  { d: 6.35, label: '1/4" dowel' },
  { d: 6, label: '6 mm dowel' },
  { d: 5, label: '5 mm rod' },
  { d: 4, label: '4 mm rod' },
  { d: 3, label: '3 mm rod' },
];

const AX = { x: 0, y: 1, z: 2 };
const NORMALS = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

// Rotations that bring the cut axis to +Z ("frame"), and back.
const TO_FRAME = { x: [0, -90, 0], y: [90, 0, 0], z: [0, 0, 0] };
const FROM_FRAME = { x: [0, 90, 0], y: [-90, 0, 0], z: [0, 0, 0] };
const toFrame = (m, axis) => (axis === 'z' ? m : m.rotate(TO_FRAME[axis]));
const fromFrame = (m, axis) => (axis === 'z' ? m : m.rotate(FROM_FRAME[axis]));

function section(M, framed, h) {
  const cs = framed.slice(h);
  return cs.isEmpty() ? null : cs;
}

// Frame-space prism of a cross-section between heights z0 and z1.
function prism(cs, z0, z1) {
  const lo = Math.min(z0, z1), hi = Math.max(z0, z1);
  return cs.extrude(hi - lo).translate([0, 0, lo]);
}

function cylZ(M, u, v, r, z0, z1) {
  const lo = Math.min(z0, z1), hi = Math.max(z0, z1);
  return M.Manifold.cylinder(hi - lo, r, r, 32, false).translate([u, v, lo]);
}

function minorExtent(polys) {
  const b = polysBounds(polys);
  return Math.min(b.maxX - b.minX, b.maxY - b.minY);
}

// chord length of the section along a line u = a (vertical) or v = a
function chordAt(polys, a, alongV) {
  const hits = [];
  for (const poly of polys) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const p = poly[j], q = poly[i];
      const pa = alongV ? p[0] : p[1], qa = alongV ? q[0] : q[1];
      if ((pa > a) !== (qa > a)) {
        const t = (a - pa) / (qa - pa);
        hits.push(alongV ? p[1] + t * (q[1] - p[1]) : p[0] + t * (q[0] - p[0]));
      }
    }
  }
  hits.sort((x, y) => x - y);
  let len = 0;
  for (let i = 0; i + 1 < hits.length; i += 2) len += hits[i + 1] - hits[i];
  return len;
}

// Pick the joint type 'auto' resolves to for this section.
function autoType(polys) {
  return minorExtent(polys) >= 16 ? 'tenon' : 'tabs';
}

// ---- individual joint builders. Each returns {owner, female, extras, note}
// owner: piece the male part is attached to. dir: +1 if male points to +axis.

function jointTenon(M, ctx, j) {
  const { framed, pos, dir, polys } = ctx;
  const wall = j.wall == null ? Math.max(2.4, Math.min(6, minorExtent(polys) * 0.22)) : +j.wall;
  let L = j.length == null ? Math.max(12, Math.min(32, minorExtent(polys) * 1.6)) : +j.length;
  const clr = j.clearance == null ? 0.2 : +j.clearance;
  for (let attempt = 0; attempt < 3; attempt++) {
    let core = null;
    // the plug must fit inside both faces of the cut and stay inside the
    // socket piece over its whole depth
    for (const h of [pos - dir * 0.3, pos + dir * Math.min(1, L * 0.05), pos + dir * L * 0.5, pos + dir * L]) {
      const s = section(M, framed, h);
      if (!s) { core = null; break; }
      core = core ? core.intersect(s) : s;
    }
    if (core) {
      const S = core.offset(-wall, 'Round', 2, 24);
      if (!S.isEmpty() && S.area() > 30) {
        const male = S.offset(-clr, 'Round', 2, 24);
        if (!male.isEmpty()) {
          return {
            male: prism(male, pos - dir * 1, pos + dir * L),
            socket: prism(S, pos - dir * 1, pos + dir * (L + 0.6)),
            note: `tenon ${L.toFixed(0)} mm deep, ${wall.toFixed(1)} mm walls`,
          };
        }
      }
    }
    L *= 0.6;
  }
  return null;
}

function depthSafeSamples(M, ctx, depth, polysList) {
  const { polys } = ctx;
  const samples = interiorSamples(polys, 56);
  for (const s of samples) {
    for (const p of polysList) {
      const d = pointInPolys(p, s.x, s.y) ? distToPolys(p, s.x, s.y) : -1;
      s.d = Math.min(s.d, d);
    }
  }
  return samples;
}

function jointPins(M, ctx, j) {
  const { framed, pos, polys } = ctx;
  const wall = 2;
  let d = +j.diameter || 0;
  let depth = +j.depth || 0;
  // sample a few candidate depths for auto sizes
  const tryDepth = depth || 25;
  const other = [];
  for (const h of [pos - tryDepth, pos + tryDepth]) {
    const s = section(M, framed, h);
    if (s) other.push(s.toPolygons());
  }
  const samples = depthSafeSamples(M, ctx, tryDepth, other);
  if (!samples.length) return null;
  const maxD = samples.reduce((a, s) => Math.max(a, s.d), 0);
  if (!d) {
    const fit = DOWELS.find((x) => x.d / 2 + wall <= maxD && x.d <= 12.7);
    if (!fit) return null;
    d = fit.d;
  }
  if (!depth) depth = Math.max(10, Math.min(40, d * 2.5));
  const b = polysBounds(polys);
  const span = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  const count = j.count && j.count !== 'auto' ? +j.count : span > 220 ? 3 : span > 70 ? 2 : 1;
  const clr = j.clearance == null ? 0.15 : +j.clearance;
  const picks = spreadPoints(samples, count, d / 2 + wall);
  if (!picks.length) return null;
  const holes = picks.map((p) => cylZ(M, p.x, p.y, d / 2 + clr, pos - depth, pos + depth));
  const pins = j.printPins
    ? picks.map((p) => cylZ(M, p.x, p.y, d / 2 - 0.1, pos - depth + 0.5, pos + depth - 0.5))
    : [];
  return {
    holes: M.Manifold.union(holes),
    pins: pins.length ? M.Manifold.union(pins) : null,
    note: `${picks.length} × ${d.toFixed(d % 1 ? 2 : 0)} mm pin${picks.length > 1 ? 's' : ''}, ${depth.toFixed(0)} mm each side`,
    pinInfo: { count: picks.length, d, length: depth * 2 - 1 },
  };
}

function jointKey(M, ctx, j) {
  const { framed, pos, dir, polys } = ctx;
  const wall = 2.4;
  let L = +j.length || 0;
  const tryL = L || 25;
  const other = [];
  const s1 = section(M, framed, pos + dir * tryL);
  if (s1) other.push(s1.toPolygons());
  const samples = depthSafeSamples(M, ctx, tryL, other);
  const best = samples.reduce((a, s) => (!a || s.d > a.d ? s : a), null);
  if (!best || best.d < wall + 3) return null;
  const shape = j.shape || 'square';
  let size = +j.size || 0; // full width
  if (!size) size = shape === 'round' ? 2 * (best.d - wall) : 2 * ((best.d - wall) / Math.SQRT2);
  size = Math.min(size, 40);
  if (!L) L = Math.max(10, Math.min(35, size * 1.4));
  const clr = j.clearance == null ? 0.2 : +j.clearance;
  const shape2d = (half) => {
    if (shape === 'round') return M.CrossSection.circle(half, 40);
    if (shape === 'cross') {
      const a = M.CrossSection.square([half * 2, half * 0.8], true);
      const b2 = M.CrossSection.square([half * 0.8, half * 2], true);
      return a.add(b2);
    }
    return M.CrossSection.square([half * 2, half * 2], true);
  };
  const S = shape2d(size / 2).translate([best.x, best.y]);
  const male = shape2d(size / 2 - clr).translate([best.x, best.y]);
  return {
    male: prism(male, pos - dir * 1, pos + dir * L),
    socket: prism(S, pos - dir * 1, pos + dir * (L + 0.6)),
    note: `${shape} key ${size.toFixed(0)} mm, ${L.toFixed(0)} mm deep`,
  };
}

function jointTabs(M, ctx, j) {
  const { pos, dir, polys } = ctx;
  const b = polysBounds(polys);
  const wu = b.maxX - b.minX, wv = b.maxY - b.minY;
  const majorU = wu >= wv; // tabs spread along the long side of the section
  const lo = majorU ? b.minX : b.minY, hi = majorU ? b.maxX : b.maxY;
  const major = hi - lo;
  let R = +j.size ? +j.size / 2 : Math.max(5, Math.min(14, major * 0.11));
  const clr = j.clearance == null ? 0.25 : +j.clearance;
  const neckW = R * 1.1, neckL = R * 0.5;
  // thickness profile along the major axis
  const steps = 120;
  const prof = [];
  let maxT = 0;
  for (let i = 0; i <= steps; i++) {
    const a = lo + (major * i) / steps;
    const t = chordAt(polys, a, majorU);
    prof.push({ a, t });
    if (t > maxT) maxT = t;
  }
  const good = (a) => {
    for (const p of prof) if (Math.abs(p.a - a) <= R + 2 && p.t < maxT * 0.55) return false;
    return a - R - 2 >= lo && a + R + 2 <= hi;
  };
  const cand = prof.filter((p) => good(p.a));
  if (!cand.length) return null;
  const count = j.count && j.count !== 'auto' ? +j.count : Math.max(1, Math.min(4, Math.floor(major / 90)));
  const picks = [];
  const mid = (lo + hi) / 2;
  if (count === 1) picks.push(cand.reduce((x, y) => (Math.abs(y.a - mid) < Math.abs(x.a - mid) ? y : x)).a);
  else {
    for (let k = 0; k < count; k++) {
      const target = lo + (major * (k + 0.5)) / count;
      const c = cand.reduce((x, y) => (Math.abs(y.a - target) < Math.abs(x.a - target) ? y : x));
      if (picks.every((p) => Math.abs(p - c.a) > 2 * R + 6)) picks.push(c.a);
    }
  }
  const mLo = (majorU ? b.minY : b.minX) - 5, mHi = (majorU ? b.maxY : b.maxX) + 5;
  const build = (shrink) => {
    const parts = [];
    for (const a of picks) {
      const r = R - shrink, nw = neckW - 2 * shrink;
      const kz = pos + dir * (neckL + R * 0.75);
      const z0 = pos - dir * 1, z1 = pos + dir * (neckL + R * 0.75);
      const zl = Math.min(z0, z1), zh = Math.max(z0, z1);
      let neck, knob;
      if (majorU) {
        neck = M.Manifold.cube([nw, mHi - mLo, zh - zl], false).translate([a - nw / 2, mLo, zl]);
        knob = M.Manifold.cylinder(mHi - mLo, r, r, 40, false).rotate([-90, 0, 0]).translate([a, mLo, kz]);
      } else {
        neck = M.Manifold.cube([mHi - mLo, nw, zh - zl], false).translate([mLo, a - nw / 2, zl]);
        knob = M.Manifold.cylinder(mHi - mLo, r, r, 40, false).rotate([0, 90, 0]).translate([mLo, a, kz]);
      }
      parts.push(neck, knob);
    }
    return M.Manifold.union(parts);
  };
  return {
    socket: build(0),
    maleRegion: build(clr),
    note: `${picks.length} puzzle tab${picks.length > 1 ? 's' : ''}, ${(2 * R).toFixed(0)} mm knob`,
  };
}

// Apply every joint of a cut. P is the uncut piece, A/B the two halves
// (A on the negative side of the plane).
export function applyJoints(M, P, A, B, cut, tags) {
  const axis = cut.axis;
  const notes = [], extras = [], bom = [];
  const joints = cut.joints && cut.joints.length ? cut.joints : [{ type: 'auto' }];
  let fA = toFrame(A, axis), fB = toFrame(B, axis);
  const framed = toFrame(P, axis);
  const sec = section(M, framed, cut.pos);
  if (!sec) return { A, B, notes: ['no material at cut'], extras, bom };
  const polys = sec.toPolygons();
  const holes = polys.filter((p) => signedArea(p) < -10).length;
  for (const j0 of joints) {
    if (j0.type === 'none') continue;
    let type = j0.type === 'auto' ? autoType(polys) : j0.type;
    const flip = !!j0.flip;
    const dir = flip ? -1 : 1;
    const ctx = { framed, pos: cut.pos, dir, polys, sec };
    let r = null;
    const run = (t) => {
      if (t === 'tenon') return jointTenon(M, ctx, j0);
      if (t === 'pins') return jointPins(M, ctx, j0);
      if (t === 'key') return jointKey(M, ctx, j0);
      if (t === 'tabs') return jointTabs(M, ctx, j0);
      return null;
    };
    r = run(type);
    if (!r && j0.type === 'auto' && type !== 'pins') { type = 'pins'; r = run('pins'); }
    if (!r) {
      notes.push(holes ? 'aligned by the dowel / rod running through this cut' : `${type}: no room at this cut`);
      continue;
    }
    if (type === 'pins') {
      const holes = tags.tag(r.holes, TAG_JOINT);
      fA = fA.subtract(holes); fB = fB.subtract(holes);
      if (r.pins) extras.push({ m: fromFrame(r.pins, axis), name: `Pins (${r.pinInfo.count}× ${r.pinInfo.d} mm)`, kind: 'pins' });
      else bom.push({ d: r.pinInfo.d, qty: r.pinInfo.count, length: Math.round(r.pinInfo.length) });
    } else if (type === 'tabs') {
      const socket = tags.tag(r.socket, TAG_JOINT);
      const maleTab = framed.intersect(tags.tag(r.maleRegion, TAG_JOINT));
      if (flip) { fA = fA.subtract(socket); fB = fB.add(maleTab); }
      else { fB = fB.subtract(socket); fA = fA.add(maleTab); }
    } else {
      const socket = tags.tag(r.socket, TAG_JOINT), male = tags.tag(r.male, TAG_JOINT);
      if (flip) { fA = fA.subtract(socket); fB = fB.add(male); }
      else { fB = fB.subtract(socket); fA = fA.add(male); }
    }
    notes.push(r.note + (r.pinInfo ? '' : flip ? ' (male on upper side)' : ''));
  }
  return { A: fromFrame(fA, axis), B: fromFrame(fB, axis), notes, extras, bom };
}

// A cut can be limited to pieces whose centre lies inside a box, given as
// optional [min, max] ranges per axis: { y: [-400, 0] }.
export const hasLimit = (cut) => !!cut.limit && ['x', 'y', 'z'].some((k) => Array.isArray(cut.limit[k]));

function limitOk(cut, bb) {
  if (!hasLimit(cut)) return true;
  for (const k of ['x', 'y', 'z']) {
    const r = cut.limit[k];
    if (!Array.isArray(r)) continue;
    const i = AX[k];
    const c = (bb.min[i] + bb.max[i]) / 2;
    if (c < (r[0] ?? -Infinity) || c > (r[1] ?? Infinity)) return false;
  }
  return true;
}

export function splitModel(M, model, cuts, tags) {
  let pieces = [{ m: model }];
  const extras = [];
  const reports = [];
  // unlimited cuts first, then cuts limited to a range (e.g. a clamshell
  // split of just the handle)
  const ordered = cuts.filter((c) => !hasLimit(c)).concat(cuts.filter(hasLimit));
  for (const cut of ordered) {
    const k = AX[cut.axis];
    const next = [];
    const report = { id: cut.id, notes: [], hit: 0, bom: [] };
    for (const pc of pieces) {
      const bb = pc.m.boundingBox();
      if (!(cut.pos > bb.min[k] + 0.5 && cut.pos < bb.max[k] - 0.5) || !limitOk(cut, bb)) { next.push(pc); continue; }
      const [pos, neg] = pc.m.splitByPlane(NORMALS[cut.axis], cut.pos);
      if (pos.isEmpty() || neg.isEmpty()) { next.push(pc); continue; }
      const res = applyJoints(M, pc.m, neg, pos, cut, tags);
      report.hit++;
      report.notes.push(...res.notes);
      report.bom.push(...res.bom);
      extras.push(...res.extras);
      next.push({ m: res.A }, { m: res.B });
    }
    reports.push(report);
    pieces = next;
  }
  return { pieces, extras, reports };
}

// --- build plate fitting --------------------------------------------------

const ORIENT = {
  z: (p) => [p[0], p[1], p[2]],
  x: (p) => [p[1], p[2], p[0]], // X becomes up
  y: (p) => [p[0], -p[2], p[1]], // Y becomes up
};

// verts: Float32Array xyz. Returns the printing orientation to use.
// Orientations are tried in order of preference: lying flat (thickness
// up), then on its edge (width up), then standing on end (length up,
// weakest because the layers stack along the weapon).
export function fitPlate(verts, plate, { ups = ['z', 'x', 'y'], margin = 3 } = {}) {
  let first = null;
  for (const up of ups) {
    const f = ORIENT[up];
    const pts = [];
    let zmin = Infinity, zmax = -Infinity;
    for (let i = 0; i < verts.length; i += 3) {
      const p = f([verts[i], verts[i + 1], verts[i + 2]]);
      pts.push([p[0], p[1]]);
      if (p[2] < zmin) zmin = p[2]; if (p[2] > zmax) zmax = p[2];
    }
    const height = zmax - zmin;
    const hull = convexHull(pts);
    const fit = fitHullInRect(hull, plate.x - 2 * margin, plate.y - 2 * margin);
    let w = fit?.w, h = fit?.h;
    if (!fit) {
      const xs = hull.map((p) => p[0]), ys = hull.map((p) => p[1]);
      w = Math.max(...xs) - Math.min(...xs); h = Math.max(...ys) - Math.min(...ys);
    }
    const cand = { up, height, angle: fit ? fit.angle : 0, fits: !!fit && height <= plate.z - margin, w, h };
    if (cand.fits) return cand;
    if (!first) first = cand;
  }
  return first;
}

export function orientForPrint(verts, fit, plate) {
  const f = ORIENT[fit.up];
  const a = (fit.angle * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const out = new Float32Array(verts.length);
  for (let i = 0; i < verts.length; i += 3) {
    const p = f([verts[i], verts[i + 1], verts[i + 2]]);
    out[i] = p[0] * c - p[1] * s;
    out[i + 1] = p[0] * s + p[1] * c;
    out[i + 2] = p[2];
  }
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < out.length; i++) { const k = i % 3; if (out[i] < min[k]) min[k] = out[i]; if (out[i] > max[k]) max[k] = out[i]; }
  const off = [plate.x / 2 - (min[0] + max[0]) / 2, plate.y / 2 - (min[1] + max[1]) / 2, -min[2]];
  for (let i = 0; i < out.length; i++) out[i] += off[i % 3];
  return out;
}
