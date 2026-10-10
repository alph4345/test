// 2D (XY) outlines of parts, for the outline editor and template thumbnails.
import { profileOutline, latheOutline } from '../engine/parts.js';

export function outlineOf(part) {
  try {
    if (part.type === 'profile') return profileOutline(part).map((s) => ({ p: s.p, s: s.s }));
    if (part.type === 'lathe') return latheOutline(part).map((p) => ({ p, s: false }));
  } catch { /* invalid while editing */ }
  return [];
}

// rough XY silhouette of other parts for context
export function silhouette(part) {
  const r = part.rot || [0, 0, 0];
  if (r[0] || r[1]) return null;
  const st = part.stretch || [1, 1, 1];
  let pts = null;
  if (part.type === 'profile') pts = outlineOf(part).map((o) => o.p);
  else if (part.type === 'lathe') {
    const half = latheOutline(part);
    pts = half.concat(half.slice().reverse().map(([x, y]) => [-x, y]));
  } else if (part.type === 'box') {
    const [w, h] = part.size; pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  } else if (part.type === 'cylinder') {
    const h = part.height / 2, a = part.r1, b = part.r2 ?? part.r1; pts = [[-a, -h], [a, -h], [b, h], [-b, h]];
  } else if (part.type === 'sphere') {
    pts = Array.from({ length: 24 }, (_, i) => [part.r * Math.cos((i / 24) * 2 * Math.PI), part.r * Math.sin((i / 24) * 2 * Math.PI)]);
  }
  if (!pts) return null;
  const a = ((r[2] || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const out = pts.map(([x, y]) => { x *= st[0]; y *= st[1]; return [x * c - y * s + part.pos[0], x * s + y * c + part.pos[1]]; });
  const mirrors = [out];
  if (part.copies?.mode === 'mirrorX') mirrors.push(out.map(([x, y]) => [-x, y]));
  return mirrors;
}


export function designSilhouettes(design) {
  const out = [];
  for (const p of design.parts) {
    if (p.hidden) continue;
    const sil = silhouette(p);
    if (sil) sil.forEach((poly) => out.push({ poly, color: p.color, sub: p.op === 'subtract' }));
  }
  return out;
}
