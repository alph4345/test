// Design -> solid model: parts are unioned (or subtracted), then the
// inserts (dowel channels, electronics bays with lids) are cut in.
import { partInstances, rod, boxFromBounds, setMeshSource } from './parts.js';

export const TAG_FEATURE = -1;
export const TAG_CUT = -2;
export const TAG_JOINT = -3;
export const TAG_LID = -4;
export const TAG_MOUNT = -5;
export const TAG_MOUNT_BASE = -100; // mount i is tagged -100 - i

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
  setMeshSource(design.__meshes);
  const s = design.scale || 1;
  const adds = [], subs = [];
  const targeted = new Map(); // part id -> subtract solids aimed at it
  const solids = [];
  const zones = []; // filament zones: colour a region without adding material
  design.parts.forEach((part, idx) => {
    if (part.hidden) return;
    let inst;
    try { inst = partInstances(M, part, (w) => warnings.push(w)); } catch (err) {
      warnings.push(`Part "${part.name}" could not be built (${err.message || err}).`);
      return;
    }
    if (!inst.length) { warnings.push(`Part "${part.name}" has an invalid shape.`); return; }
    let solid = inst.length === 1 ? inst[0] : M.Manifold.union(inst);
    if (s !== 1) solid = solid.scale(s);
    if (part.op === 'paint') { zones.push({ filament: +part.filament || 1, solid }); return; }
    solid = tags.tag(solid, idx);
    if (part.op === 'subtract') {
      if (part.target) {
        if (!targeted.has(part.target)) targeted.set(part.target, []);
        targeted.get(part.target).push(solid);
      } else subs.push(solid);
    } else solids.push({ part, solid });
  });
  const materials = []; // [{filament, solid}] in part order, later parts win overlaps
  for (const { part, solid } of solids) {
    const t = targeted.get(part.id);
    const final = t ? solid.subtract(t.length === 1 ? t[0] : M.Manifold.union(t)) : solid;
    adds.push(final);
    materials.push({ filament: +part.filament || 1, solid: final });
  }
  materials.push(...zones);
  if (!adds.length) return { model: null, lids: [], materials, warnings: warnings.concat('Nothing to build: add a part.') };
  let model = adds.length === 1 ? adds[0] : M.Manifold.union(adds);
  if (subs.length) model = model.subtract(subs.length === 1 ? subs[0] : M.Manifold.union(subs));

  const lids = [];
  for (const [fi, f] of (design.features || []).entries()) {
    if (f.hidden) continue;
    const res = applyFeature(M, model, f, s, tags, warnings, fi);
    model = res.model;
    if (res.added) materials.push({ filament: +f.filament || 1, solid: res.added });
    if (res.lid) lids.push(res.lid);
  }
  return { model, lids, warnings, materials };
}

// One solid region per filament. Where parts of different filaments
// overlap, the part listed later wins (like painting over).
export function materialRegions(M, materials) {
  const regions = new Map();
  for (const { filament, solid } of materials) {
    for (const [f, r] of regions) if (f !== filament) regions.set(f, r.subtract(solid));
    regions.set(filament, regions.has(filament) ? regions.get(filament).add(solid) : solid);
  }
  return regions;
}

// Split a printable piece into per-filament volumes. Material that belongs
// to no part (joint plugs, printed pins) goes to the piece's main filament.
export function partitionByFilament(M, piece, regions) {
  if (regions.size <= 1) return [{ filament: regions.keys().next().value || 1, m: piece }];
  const parts = [];
  let covered = null;
  for (const [f, r] of regions) {
    const m = piece.intersect(r);
    if (!m.isEmpty() && m.volume() > 0.5) parts.push({ filament: f, m });
    covered = covered ? covered.add(r) : r;
  }
  const rest = piece.subtract(covered);
  if (!rest.isEmpty() && rest.volume() > 0.5) {
    if (!parts.length) return [{ filament: 1, m: piece }];
    const main = parts.reduce((a, b) => (b.m.volume() > a.m.volume() ? b : a));
    main.m = main.m.add(rest);
  }
  return parts.length ? parts : [{ filament: 1, m: piece }];
}

const AXES = { x: 0, y: 1, z: 2 };

export function applyFeature(M, model, f, s, tags, warnings, index = 0) {
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
  if (f.type === 'mount') {
    const hw = mountSolid(M, model, f, s, tags, warnings, index);
    return hw ? { model: model.add(hw), added: hw } : { model };
  }
  return { model };
}

// Hand grips and strap loops on the back (or front) of a shield or other
// broad part. Each post finds the surface under it with a ray, so the
// hardware sits on curved, domed or stepped surfaces.
export const MOUNT_PRESETS = {
  grip: { span: 120, gap: 38, bar: 28 }, // fist-sized D-handle
  loop: { span: 46, gap: 6, bar: 9 }, // loop for 38 mm (1.5 in) webbing
};

function mountSolid(M, model, f, s, tags, warnings, index) {
  const preset = MOUNT_PRESETS[f.style] || MOUNT_PRESETS.grip;
  const span = +f.span || preset.span;
  const gap = f.gap == null ? preset.gap : +f.gap;
  const bar = +f.bar || preset.bar;
  const r = bar / 2;
  const side = f.side === '+z' ? 1 : -1; // direction pointing away from the surface
  const a = ((+f.angle || 0) * Math.PI) / 180;
  const cx = f.pos[0] * s, cy = f.pos[1] * s;
  const ends = [-1, 1].map((k) => [cx + (k * span) / 2 * Math.cos(a), cy + (k * span) / 2 * Math.sin(a)]);
  const bb = model.boundingBox();
  const far = side < 0 ? bb.min[2] - 100 : bb.max[2] + 100;
  const near = side < 0 ? bb.max[2] + 100 : bb.min[2] - 100;
  const hits = ends.map(([x, y]) => model.rayCast([x, y, far], [x, y, near]));
  if (hits.some((h) => !h.length)) {
    warnings.push(`"${f.name}": a post is not over the model; move it or shorten its span.`);
    return null;
  }
  const surf = hits.map((h) => h[0].position[2]);
  const thick = hits.map((h) => (h.length > 1 ? Math.abs(h[1].position[2] - h[0].position[2]) : 10));
  const outer = side < 0 ? Math.min(...surf) : Math.max(...surf);
  const zb = outer + side * (gap + r);
  const postR = Math.max(r * 1.15, 6);
  const solids = [];
  ends.forEach(([x, y], i) => {
    const embed = Math.min(1.5, thick[i] * 0.35);
    const z0 = surf[i] - side * embed, z1 = surf[i] + side * 1;
    const foot = M.Manifold.cylinder(Math.abs(z1 - z0), postR * 1.25, postR * 1.25, 32, false).translate([x, y, Math.min(z0, z1)]);
    const knob = M.Manifold.sphere(r, 32).translate([x, y, zb]);
    solids.push(M.Manifold.hull([foot, knob]));
  });
  solids.push(rod(M, [ends[0][0], ends[0][1], zb], [ends[1][0], ends[1][1], zb], r, 32));
  return tags.tag(M.Manifold.union(solids), TAG_MOUNT_BASE - index);
}
