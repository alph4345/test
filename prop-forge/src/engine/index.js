// Engine entry: one call turns a design into displayable / printable
// pieces. Runs inside a Web Worker in the app, and directly in tests.
import { withArena } from './manifold.js';
import { buildModel, TagMap } from './build.js';
import { splitModel, fitPlate, orientForPrint } from './split.js';
export { DOWELS } from './split.js';
import { toBinarySTL } from './stl.js';

function meshData(m, tags) {
  const mesh = m.getMesh();
  const np = mesh.numProp;
  const nv = mesh.vertProperties.length / np;
  const verts = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    verts[i * 3] = mesh.vertProperties[i * np];
    verts[i * 3 + 1] = mesh.vertProperties[i * np + 1];
    verts[i * 3 + 2] = mesh.vertProperties[i * np + 2];
  }
  const tris = new Uint32Array(mesh.triVerts);
  const triTags = new Int16Array(tris.length / 3);
  const runs = mesh.runIndex, ids = mesh.runOriginalID;
  for (let r = 0; r < ids.length; r++) {
    const t = tags.get(ids[r]);
    for (let k = runs[r] / 3; k < runs[r + 1] / 3; k++) triTags[k] = t;
  }
  return { verts, tris, triTags };
}

// Split a solid into its loose bodies. Sealed internal voids (a dowel
// channel that ends inside the model) come back from decompose() as
// inside-out shells; they are put back into the body that encloses them.
function separateBodies(M, m) {
  const comps = m.decompose();
  if (comps.length === 1) return comps;
  const solids = [], voids = [];
  for (const c of comps) {
    const v = c.volume();
    if (v > 1) solids.push({ m: c, bb: c.boundingBox(), voids: [] });
    else if (v < -1e-6) voids.push({ m: c, bb: c.boundingBox() });
  }
  for (const v of voids) {
    const host = solids.find((s) => [0, 1, 2].every((k) => s.bb.min[k] <= v.bb.min[k] + 1e-3 && s.bb.max[k] >= v.bb.max[k] - 1e-3));
    if (host) host.voids.push(v.m);
  }
  return solids.map((s) => (s.voids.length ? M.Manifold.compose([s.m, ...s.voids]) : s.m));
}

function bboxOf(m) {
  const b = m.boundingBox();
  return { min: Array.from(b.min), max: Array.from(b.max) };
}

const DEFAULT_PLATE = { x: 256, y: 256, z: 256 };

// mode: 'model' (no cuts) | 'split'
export function runBuild(M, design, { mode = 'model', withStl = false } = {}) {
  return withArena(() => {
    const tags = new TagMap();
    const t0 = Date.now();
    const { model, lids, warnings } = buildModel(M, design, tags);
    if (!model || model.isEmpty()) return { pieces: [], warnings: warnings.length ? warnings : ['Model is empty.'], reports: [] };
    const plate = design.split?.plate || DEFAULT_PLATE;
    let bodies = [];
    let reports = [];
    if (mode === 'split' && design.split?.cuts?.length) {
      const res = splitModel(M, model, design.split.cuts, tags);
      reports = res.reports;
      res.pieces.forEach((p) => bodies.push({ m: p.m, kind: 'piece' }));
      res.extras.forEach((e) => bodies.push({ m: e.m, kind: e.kind, name: e.name }));
    } else {
      bodies.push({ m: model, kind: 'piece' });
    }
    lids.forEach((l) => bodies.push({ m: l.m, kind: 'lid', name: l.name, side: l.side }));

    // separate loose bodies so each printable part is its own piece
    const out = [];
    for (const b of bodies) {
      for (const m of b.kind === 'pins' ? [b.m] : separateBodies(M, b.m)) out.push({ ...b, m });
    }
    out.forEach((b) => { b.bb = bboxOf(b.m); });
    const order = { piece: 0, lid: 1, pins: 2 };
    out.sort((a, b) => (order[a.kind] - order[b.kind])
      || ((a.bb.min[1] + a.bb.max[1]) - (b.bb.min[1] + b.bb.max[1]))
      || ((a.bb.min[0] + a.bb.max[0]) - (b.bb.min[0] + b.bb.max[0])));
    let n = 0;
    const pieces = out.map((b) => {
      const data = meshData(b.m, tags);
      const fit = fitPlate(vertsOf(b.m.hull()), plate);
      const name = b.kind === 'piece' ? (mode === 'split' ? `Piece ${++n}` : 'Full model') : b.name;
      const piece = { name, kind: b.kind, side: b.side, bbox: b.bb, volume: b.m.volume(), fit, ...data };
      if (withStl) piece.stl = toBinarySTL(orientForPrint(data.verts, fit, plate), data.tris, name);
      return piece;
    });
    return { pieces, warnings, reports, ms: Date.now() - t0 };
  });
}

function vertsOf(m) {
  const mesh = m.getMesh();
  const np = mesh.numProp, v = mesh.vertProperties;
  const n = v.length / np;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { out[i * 3] = v[i * np]; out[i * 3 + 1] = v[i * np + 1]; out[i * 3 + 2] = v[i * np + 2]; }
  return out;
}

const r1 = (v) => Math.round(v * 10) / 10;

// Choose cuts so every piece fits the plate. Long things are sliced along
// their length (Y); sections that are too wide even as thin slices (guards,
// shields, scythe blades) are cut lengthwise / crosswise as well.
export function autoSplit(M, design, opts = {}) {
  return withArena(() => {
    const tags = new TagMap();
    const { model } = buildModel(M, design, tags);
    if (!model || model.isEmpty()) return { cuts: [], message: 'Model is empty.' };
    const plate = design.split?.plate || DEFAULT_PLATE;
    const allowance = opts.jointAllowance ?? 36; // room for tenons / tabs
    const cuts = [];
    let failed = false;

    const fits = (m, padAxis, padAt, pad) => {
      if (m.isEmpty()) return true;
      const v = vertsOf(m.hull());
      if (pad) {
        const k = padAxis;
        for (let i = k; i < v.length; i += 3) if (v[i] >= padAt - 0.01) v[i] += pad;
      }
      return fitPlate(v, plate, { ups: ['z', 'x'] }).fits;
    };
    const slab = (m, k, a, b) => {
      const n = [0, 0, 0], q = [0, 0, 0];
      n[k] = 1; q[k] = -1;
      return m.trimByPlane(n, a).trimByPlane(q, -b);
    };
    const limitOf = (bb) => ({ x: [r1(bb.min[0] - 1), r1(bb.max[0] + 1)], y: [r1(bb.min[1] - 1), r1(bb.max[1] + 1)], z: [r1(bb.min[2] - 1), r1(bb.max[2] + 1)] });

    const short = Math.min(plate.x, plate.y);
    const minSlab = short * 0.35; // slabs shorter than this mean "too wide, cut lengthwise"
    const widthAt = (m, y, thin) => { const sl = slab(m, 1, y, y + thin); if (sl.isEmpty()) return 0; const b = sl.boundingBox(); return b.max[0] - b.min[0]; };

    // halves of a lengthwise split get staggered cuts so the seams of the
    // two halves never line up
    const bisect = (m, k, limit, depth, padTop) => {
      const bb = m.boundingBox();
      const mid = r1((bb.min[k] + bb.max[k]) / 2);
      cuts.push({ axis: 'xyz'[k], pos: mid, limit });
      const [hi, lo] = m.splitByPlane(k === 0 ? [1, 0, 0] : k === 1 ? [0, 1, 0] : [0, 0, 1], mid);
      solve(lo, false, depth + 1, undefined, { padTop });
      solve(hi, false, depth + 1, undefined, { padTop, stagger: true });
    };

    const solve = (m, isRoot, depth, forceAxis, { padTop = false, stagger = false } = {}) => {
      if (m.isEmpty() || fits(m)) return;
      if (depth > 7) { failed = true; return; }
      const bb = m.boundingBox();
      const ext = [0, 1, 2].map((k) => bb.max[k] - bb.min[k]);
      const limit = isRoot ? undefined : limitOf(bb);
      let k = forceAxis ?? (ext[1] >= ext[0] ? 1 : 0);
      if (forceAxis == null && ext[2] > ext[k]) k = 2;
      if (k !== 1) { bisect(m, k, limit, depth, padTop); return; }
      // slice along Y from the bottom up
      const y1 = bb.max[1];
      let cur = bb.min[1];
      let guard = 0;
      // a joint plug sticks out of the top if another cut sits there
      const restFits = (a) => (padTop ? fits(slab(m, 1, a, y1 + 1), 1, y1 - 0.5, allowance) : fits(slab(m, 1, a, y1 + 1)));
      while (guard++ < 60) {
        if (restFits(cur)) return;
        const thin = Math.min(20, (y1 - cur) / 2);
        let lo = cur, hi = y1;
        if (fits(slab(m, 1, cur, cur + thin), 1, cur + thin, allowance)) {
          lo = cur + thin;
          for (let it = 0; it < 13; it++) {
            const mid = (lo + hi) / 2;
            if (fits(slab(m, 1, cur, mid), 1, mid, allowance)) lo = mid; else hi = mid;
          }
        }
        if (lo - cur >= minSlab || lo - cur >= y1 - cur - 1) {
          if (stagger && guard === 1 && lo - cur >= 2 * minSlab) lo = cur + (lo - cur) / 2;
          cuts.push({ axis: 'y', pos: r1(lo), limit });
          cur = lo;
          continue;
        }
        // a wide stretch (big blade, guard, shield): find where it ends,
        // cut it off, and split that stretch lengthwise
        let end = cur + thin;
        while (end < y1 - 1 && widthAt(m, end, thin) > short * 0.8) end += 10;
        end = Math.min(end, y1);
        if (end - cur < thin) end = Math.min(y1, cur + thin * 2);
        if (end < y1 - 1) cuts.push({ axis: 'y', pos: r1(end), limit });
        const zone = slab(m, 1, cur, end);
        const zb = zone.boundingBox();
        const zoneTop = end < y1 - 1 || padTop;
        if (zb.max[0] - zb.min[0] > zb.max[2] - zb.min[2]) bisect(zone, 0, limitOf(zb), depth + 1, zoneTop);
        else bisect(zone, 2, limitOf(zb), depth + 1, zoneTop);
        cur = end;
        if (cur >= y1 - 1) return;
      }
    };
    solve(model, true, 0);
    // check with real joints (they add length) and re-cut what overflows
    for (let round = 0; round < 2 && cuts.length; round++) {
      const trial = cuts.map((c, i) => ({ ...c, id: `t${i}`, joints: [{ type: 'auto' }] }));
      const { pieces } = splitModel(M, model, trial, tags);
      const bad = pieces.filter((p) => !fits(p.m));
      if (!bad.length) break;
      for (const p of bad) solve(p.m, false, 0);
    }
    if (!cuts.length) return { cuts: [], message: 'The whole model already fits your printer.' };
    // even out simple length-only splits
    if (cuts.every((c) => c.axis === 'y' && !c.limit)) {
      const bb = model.boundingBox();
      const n = cuts.length;
      const even = Array.from({ length: n }, (_, i) => r1(bb.min[1] + ((bb.max[1] - bb.min[1]) * (i + 1)) / (n + 1)));
      let ok = true, prev = bb.min[1];
      for (const y of even.concat([bb.max[1] + 1])) {
        if (!fits(slab(model, 1, prev, y), 1, y, y < bb.max[1] ? allowance : 0)) { ok = false; break; }
        prev = y;
      }
      if (ok) cuts.forEach((c, i) => { c.pos = even[i]; });
    }
    const msg = `${cuts.length} cut${cuts.length > 1 ? 's' : ''}` + (failed ? ' (some pieces may still be too big; adjust by hand)' : '');
    return { cuts, message: msg };
  });
}

export function modelSize(M, design) {
  return withArena(() => {
    const tags = new TagMap();
    const { model } = buildModel(M, { ...design, features: [] }, tags);
    if (!model || model.isEmpty()) return null;
    return bboxOf(model);
  });
}
