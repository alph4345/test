// Part builders shared by the kits (on top of templates/helpers.js).
import { COLORS as C, uid, P, blade as bladePart, lathe } from '../templates/helpers.js';
import { MODEL_THUMBS } from '../templates/models.js';

export const meshPart = (name, key, o = {}) => ({
  id: uid(), name, type: 'mesh', op: 'add', meshRef: `builtin:${key}`, unit: 1,
  color: o.color || C.steel, pos: [0, 0, 0], rot: [0, 0, 0], stretch: [1, 1, 1],
  copies: { mode: 'none', count: 2 }, filament: o.filament || 1,
  ...(o.warp ? { warp: o.warp } : {}), ...(o.separate ? { separate: true } : {}),
});

// A region painted with another filament (adds no material). `on: 'main'`
// keeps its paint guide lines off pieces printed on their own.
export const zone = (name, part, filament, o = {}) => ({ ...part, name, op: 'paint', color: '#8f6bd8', filament, ...(o.on ? { on: o.on } : {}) });

export const palette = (...names) => names.map(([name, color]) => ({ name, color }));

export const thumbOf = (keys, colors) => keys.flatMap((k, i) => (MODEL_THUMBS[k] || []).map((poly) => ({ poly, color: colors[Math.min(i, colors.length - 1)] })));

// Revolver cylinder part (see engine/parts.js revolverSolid).
export function revolver(name, o) {
  return {
    id: uid(), name, type: 'revolver', op: 'add', color: o.color || C.steel,
    pos: o.pos || [0, 0, 0], rot: o.rot || [0, 0, 0], stretch: [1, 1, 1], copies: { mode: 'none', count: 2 },
    filament: o.filament || 1, ...(o.separate ? { separate: true } : {}),
    r: o.r, length: o.length, chamfer: o.chamfer ?? 2,
    flutes: o.flutes || 0, fluteR: o.fluteR, fluteDepth: o.fluteDepth, fluteLen: o.fluteLen, fluteStyle: o.fluteStyle || 'front',
    chambers: o.chambers || 0, chamberR: o.chamberR, chamberDepth: o.chamberDepth, chamberAt: o.chamberAt,
    pinR: o.pinR || 0, notches: !!o.notches,
  };
}

// Flat outline with softly rounded edges all round (grips, guards): a
// "blade" whose every node is sharp, with a convex grind that stops short
// of a real edge.
export function pillow(name, points, thickness, o = {}) {
  const round = o.round ?? Math.min(6, thickness * 0.35);
  const part = bladePart(name, points.map((p) => ({ ...p, s: 1 })), {
    color: C.dark, ...o, thickness, edge: thickness * (o.edgeFrac ?? 0.55), bevel: round,
  });
  return { ...part, grind: 'convex' };
}

// Wrapped grip turned around Y, from yTop down to yBottom.
export function wrappedGrip(name, yTop, yBottom, r, o = {}) {
  const pts = [];
  const L = yTop - yBottom;
  const n = Math.max(2, Math.round(o.ridges ?? L / 14));
  const depth = o.ridgeDepth ?? 1.2;
  pts.push(P(r + (o.flareTop || 0), yTop));
  for (let i = 1; i < n * 2; i++) {
    const t = i / (n * 2);
    const y = yTop - L * t;
    const sw = (o.swell || 0) * Math.sin(Math.PI * t);
    pts.push(P(r + sw + (i % 2 ? depth : 0), y, 'c'));
  }
  pts.push(P(r + (o.flareBottom || 0), yBottom));
  return lathe(name, pts, { color: C.wrap, sides: o.sides ?? 48, ...o });
}

// Points of a polygon given as [[x, y], ...] -> outline points.
export const pts = (arr, flags = '') => arr.map(([x, y, f]) => P(x, y, f ?? flags));

// Clip a closed polygon to y >= y0 (for tip icons).
export function clipAbove(poly, y0) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ia = a[1] >= y0, ib = b[1] >= y0;
    if (ia) out.push(a);
    if (ia !== ib) { const t = (y0 - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, y0]); }
  }
  return out;
}

export const xy = (points) => points.map((p) => [p.x, p.y]);
