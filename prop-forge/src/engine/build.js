// Design -> solid model: parts are unioned (or subtracted), then the
// inserts (dowel channels, electronics bays with lids) are cut in.
import { partInstances, rod, boxFromBounds } from './parts.js';

export const TAG_FEATURE = -1;
export const TAG_CUT = -2;
export const TAG_JOINT = -3;
export const TAG_LID = -4;

export class TagMap {
  constructor() { this.map = new Map(); }
  tag(m, value) {
    const o = m.asOriginal();
    this.map.set(o.originalID(), value);
    return o;
  }
  get(id) { return this.map.has(id) ? this.map.get(id) : TAG_CUT; }
}

const sc = (v, s) => [v[0] * s, v[1] * s, v[2] * s];

export function buildModel(M, design, tags) {
  const warnings = [];
  const s = design.scale || 1;
  const adds = [], subs = [];
  const targeted = new Map(); // part id -> subtract solids aimed at it
  const solids = [];
  design.parts.forEach((part, idx) => {
    if (part.hidden) return;
    let inst;
    try { inst = partInstances(M, part); } catch (err) {
      warnings.push(`Part "${part.name}" could not be built (${err.message || err}).`);
      return;
    }
    if (!inst.length) { warnings.push(`Part "${part.name}" has an invalid shape.`); return; }
    let solid = inst.length === 1 ? inst[0] : M.Manifold.union(inst);
    if (s !== 1) solid = solid.scale(s);
    solid = tags.tag(solid, idx);
    if (part.op === 'subtract') {
      if (part.target) {
        if (!targeted.has(part.target)) targeted.set(part.target, []);
        targeted.get(part.target).push(solid);
      } else subs.push(solid);
    } else solids.push({ part, solid });
  });
  for (const { part, solid } of solids) {
    const t = targeted.get(part.id);
    adds.push(t ? solid.subtract(t.length === 1 ? t[0] : M.Manifold.union(t)) : solid);
  }
  if (!adds.length) return { model: null, lids: [], warnings: warnings.concat('Nothing to build: add a part.') };
  let model = adds.length === 1 ? adds[0] : M.Manifold.union(adds);
  if (subs.length) model = model.subtract(subs.length === 1 ? subs[0] : M.Manifold.union(subs));

  const lids = [];
  for (const f of design.features || []) {
    if (f.hidden) continue;
    const res = applyFeature(M, model, f, s, tags, warnings);
    model = res.model;
    if (res.lid) lids.push(res.lid);
  }
  return { model, lids, warnings };
}

const AXES = { x: 0, y: 1, z: 2 };

export function applyFeature(M, model, f, s, tags, warnings) {
  if (f.type === 'channel') {
    const a = sc(f.from, s), b = sc(f.to, s);
    const r = rod(M, a, b, (+f.diameter || 9.5) / 2 + (+f.clearance || 0), 32);
    if (!r) return { model };
    return { model: model.subtract(tags.tag(r, TAG_FEATURE)) };
  }
  if (f.type === 'cavity') {
    const c = sc(f.pos, s);
    const size = f.size;
    const min = [c[0] - size[0] / 2, c[1] - size[1] / 2, c[2] - size[2] / 2];
    const max = [c[0] + size[0] / 2, c[1] + size[1] / 2, c[2] + size[2] / 2];
    const cav = boxFromBounds(M, min, max);
    if (!cav) return { model };
    let out = model.subtract(tags.tag(cav, TAG_FEATURE));
    let lid = null;
    if (f.lid && f.lid.enabled) {
      const side = f.lid.side || '+z';
      const k = AXES[side[1]];
      const sign = side[0] === '-' ? -1 : 1;
      const ledge = Math.max(0, +f.lid.ledge || 0);
      const clr = Math.max(0, f.lid.clearance == null ? 0.25 : +f.lid.clearance);
      const top = sign > 0 ? max[k] : min[k];
      const omin = min.map((v) => v - ledge), omax = max.map((v) => v + ledge);
      if (sign > 0) { omin[k] = top; omax[k] = top + 5000; } else { omax[k] = top; omin[k] = top - 5000; }
      const opening = boxFromBounds(M, omin, omax);
      const smin = omin.map((v, i) => (i === k ? v : v + clr)), smax = omax.map((v, i) => (i === k ? v : v - clr));
      const shrunk = boxFromBounds(M, smin, smax);
      let lidSolid = model.intersect(shrunk);
      out = out.subtract(tags.tag(opening, TAG_FEATURE));
      const mag = f.lid.magnets;
      if (mag && mag.enabled && ledge > 0 && !lidSolid.isEmpty()) {
        const md = +mag.diameter || 6.2, depth = +mag.depth || 3.2;
        const others = [0, 1, 2].filter((i) => i !== k);
        const off = ledge / 2;
        for (const su of [-1, 1]) for (const sv of [-1, 1]) {
          const p = [0, 0, 0];
          p[others[0]] = su < 0 ? min[others[0]] - off : max[others[0]] + off;
          p[others[1]] = sv < 0 ? min[others[1]] - off : max[others[1]] + off;
          p[k] = top;
          const a = p.slice(), b = p.slice();
          a[k] = top - sign * depth; b[k] = top + sign * depth;
          const pocket = rod(M, a, b, md / 2, 24);
          if (pocket) {
            const t = tags.tag(pocket, TAG_FEATURE);
            out = out.subtract(t);
            lidSolid = lidSolid.subtract(t);
          }
        }
      }
      if (lidSolid.isEmpty()) warnings.push(`"${f.name}": the lid opening does not reach the surface on side ${side}.`);
      else lid = { m: lidSolid, name: `${f.name} lid`, featureId: f.id, side };
    }
    return { model: out, lid };
  }
  return { model };
}
