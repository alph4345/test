// Paint guide lines: shallow grooves along the borders between colour
// zones, so a prop printed in one colour shows where each paint colour
// goes (and gives masking tape and a brush an edge to follow).
//
// A zone's border is a thin shell around the zone (grown by half the line
// width minus shrunk by half). The groove is that shell where it lies
// within `depth` of the model's surface; the surface layer is the body
// minus the body eroded by `depth` (the body intersected with copies of
// itself nudged in 14 directions), so it works on any shape.
import { partSolid, placeInstances, profileOutline } from './parts.js';

export const FINISH_DEFAULTS = { colours: 'print', lines: false, lineWidth: 1.2, lineDepth: 0.6 };
export const finishOf = (design) => ({ ...FINISH_DEFAULTS, ...(design.finish || {}) });

// The zone part grown (delta > 0) or shrunk (delta < 0) by `delta` mm in
// the finished model (the design is scaled by `s` afterwards).
function grownSolid(M, part, delta, s) {
  const st = (part.stretch || [1, 1, 1]).map((v) => +v || 1);
  const k = delta / s;
  let base = null;
  switch (part.type) {
    case 'box': {
      const size = (part.size || [10, 10, 10]).map((v, i) => v + (2 * k) / st[i]);
      if (size.some((v) => v <= 0.05)) return null;
      base = partSolid(M, { ...part, size });
      break;
    }
    case 'cylinder': {
      const r1 = (+part.r1 || 5) + k / st[0], r2 = (part.r2 == null ? +part.r1 || 5 : +part.r2) + k / st[0];
      const height = (+part.height || 10) + (2 * k) / st[1];
      if (r1 <= 0.05 || r2 < 0 || height <= 0.05) return null;
      base = partSolid(M, { ...part, r1, r2, height });
      break;
    }
    case 'sphere': {
      const r = (+part.r || 10) + k / Math.max(...st);
      if (r <= 0.05) return null;
      base = partSolid(M, { ...part, r });
      break;
    }
    case 'profile': {
      const poly = profileOutline(part).map((q) => q.p);
      if (poly.length < 3) return null;
      const cs = M.newCrossSection([poly]).offset(k / Math.max(st[0], st[1]), 'Round', 2, 24);
      if (cs.isEmpty()) return null;
      const t = (+part.thickness || 10) + (2 * k) / st[2];
      if (t <= 0.05) return null;
      base = cs.extrude(t).translate([0, 0, -t / 2]);
      break;
    }
    default:
      return null; // lathe / mesh zones: no guide lines
  }
  if (!base || base.isEmpty()) return null;
  const inst = placeInstances(base, part);
  let m = inst.length === 1 ? inst[0] : M.Manifold.union(inst);
  if (s !== 1) m = m.scale(s);
  return m;
}

const overlaps = (a, b, pad = 0) => [0, 1, 2].every((i) => a.min[i] - pad <= b.max[i] && b.min[i] - pad <= a.max[i]);

// Border shells for the zones, in the zones' order (later zones paint over
// earlier ones, so an earlier border hidden under a later zone gets no line).
// `bodies` is [{filament, bb}] of the printed parts, to skip zones that have
// the same colour as everything under them.
export function zoneBorders(M, zoneParts, s, width, depth, bodies) {
  const half = width / 2;
  const list = zoneParts.map((part) => {
    const outer = grownSolid(M, part, half, s);
    if (!outer) return null;
    const inner = grownSolid(M, part, -half, s);
    return { part, outer, inner, bb: outer.boundingBox() };
  });
  // a wider band around each border: the only part of a body the grooves
  // are worked out in (its sides stay clear of the grooves by depth + 1 mm)
  const reach = half + depth + 1;
  const band = (part) => {
    const o = grownSolid(M, part, reach, s);
    if (!o) return null;
    const i = grownSolid(M, part, -reach, s);
    return i ? o.subtract(i) : o;
  };
  const out = [];
  list.forEach((z, i) => {
    if (!z) return;
    const under = bodies.filter((b) => overlaps(b.bb, z.bb));
    if (!under.length || under.every((b) => b.filament === (+z.part.filament || 1))) return;
    let shell = z.inner ? z.outer.subtract(z.inner) : z.outer;
    const later = list.slice(i + 1).filter((y) => y && y.inner && overlaps(y.bb, z.bb));
    if (later.length) shell = shell.subtract(later.length === 1 ? later[0].inner : M.Manifold.union(later.map((y) => y.inner)));
    if (shell.isEmpty()) return;
    const wide = band(z.part);
    if (wide) out.push({ m: shell, wide, bb: shell.boundingBox(), on: z.part.on });
  });
  return out;
}

// erosion directions: along the axes (a surface that faces diagonally gets
// a groove about 0.6 x as deep, so the depth is stretched a little)
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const STRETCH = 1.25;

// Drop specks a groove may have cut loose (e.g. right at a sharp tip).
function dropSpecks(M, m) {
  const parts = m.decompose();
  if (parts.length < 2) return m;
  const vols = parts.map((p) => p.volume());
  const big = Math.max(...vols);
  const keep = parts.filter((p, i) => vols[i] < 0 || vols[i] > Math.max(50, big * 0.002));
  return keep.length === parts.length ? m : M.Manifold.compose(keep);
}

// Cut the borders into a body as grooves `depth` deep.
// Grooves already worked out, by what they were cut into (working them
// out takes a second or two; most rebuilds change something else).
const cache = new Map();
function remember(k, m) {
  const mesh = m.getMesh();
  cache.set(k, { numProp: mesh.numProp, vertProperties: Float32Array.from(mesh.vertProperties), triVerts: Uint32Array.from(mesh.triVerts) });
  while (cache.size > 12) cache.delete(cache.keys().next().value);
}

// `key` names the body ('main' or a separate piece's key); a zone marked
// `on` another body leaves this one alone. `cacheKey` describes everything
// the grooves depend on (the body's parts and the zones).
export function engrave(M, body, borders, depth, key = 'main', cacheKey = null, tag = (m) => m) {
  if (!body || body.isEmpty() || !borders.length) return body;
  const bb = body.boundingBox();
  const hits = borders.filter((b) => (!b.on || b.on === key) && overlaps(b.bb, bb));
  if (!hits.length) return body;
  const ck = cacheKey && `${key}|${depth}|${cacheKey}`;
  if (ck && cache.has(ck)) {
    const c = cache.get(ck);
    cache.delete(ck); cache.set(ck, c); // most recently used
    if (!c.triVerts.length) return body;
    const mesh = new M.Mesh({ numProp: c.numProp, vertProperties: c.vertProperties, triVerts: c.triVerts });
    return dropSpecks(M, body.subtract(tag(M.newManifold(mesh))));
  }
  const lines = hits.length === 1 ? hits[0].m : M.Manifold.union(hits.map((h) => h.m));
  const wide = hits.length === 1 ? hits[0].wide : M.Manifold.union(hits.map((h) => h.wide));
  // work on a narrow band of the body around the lines only
  const chunk = body.intersect(wide);
  if (chunk.isEmpty()) { if (ck) remember(ck, chunk); return body; }
  let deep = chunk;
  const d = depth * STRETCH;
  for (const v of DIRS) deep = deep.intersect(chunk.translate([v[0] * d, v[1] * d, v[2] * d]));
  const skin = chunk.subtract(deep);
  const groove = lines.intersect(skin);
  if (ck) remember(ck, groove);
  if (groove.isEmpty()) return body;
  return dropSpecks(M, body.subtract(tag(groove)));
}
