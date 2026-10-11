// Shared vocabulary for weapon kits.
//
// A kit is one weapon type (Buster Sword, gunblade, katana…). It has up to
// two variants: `model` (the creator's own mesh, with options that suit a
// finished model: proportions, details, colours) and `generated` (a fully
// parametric weapon of the same type that can be randomised). Each variant
// lists option groups and a build(opts) that returns a design.

// Small seeded random generator (mulberry32), so a variation can be
// reproduced from its seed.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const newSeed = () => (Math.random() * 2 ** 31) >>> 0;

// ---- option definitions ----
// choice: chips, optionally with a small outline icon ([{poly, hole}]).
export const choice = (key, label, choices, def, o = {}) => ({ type: 'choice', key, label, choices, default: def, ...o });
// range: slider + number. `rand: [lo, hi]` narrows what "surprise me" picks.
export const range = (key, label, min, max, def, o = {}) => ({ type: 'range', key, label, min, max, default: def, step: 1, unit: 'mm', ...o });
export const toggle = (key, label, def, o = {}) => ({ type: 'toggle', key, label, default: def, ...o });
// filament slot for one region of the weapon
export const fil = (key, label, def, o = {}) => ({ type: 'filament', key, label, default: def, random: false, ...o });
export const group = (title, options, o = {}) => ({ title, options, ...o });

export const sizeGroup = (o = {}) => group('Size', [
  range('size', 'Overall size', 50, 150, 100, { unit: '%', random: false, hint: '100% is the size shown in the card. Inserts (dowels, magnets) keep their real sizes.', ...o }),
]);

export function optionsOf(groups) {
  return groups.flatMap((g) => g.options);
}

export function defaultsOf(groups) {
  const o = {};
  for (const opt of optionsOf(groups)) o[opt.key] = opt.default;
  return o;
}

const snap = (v, step) => Math.round(v / step) * step;

// Random values for every option that allows it.
export function randomOpts(groups, r, base) {
  const o = { ...base };
  for (const opt of optionsOf(groups)) {
    if (opt.random === false) continue;
    if (opt.type === 'choice') {
      const pool = opt.choices.filter((c) => c.random !== false);
      const total = pool.reduce((s, c) => s + (c.weight ?? 1), 0);
      let x = r() * total;
      for (const c of pool) { x -= c.weight ?? 1; if (x <= 0) { o[opt.key] = c.v; break; } }
    } else if (opt.type === 'range') {
      const [lo, hi] = opt.rand || [opt.min, opt.max];
      o[opt.key] = +snap(lo + r() * (hi - lo), opt.step || 1).toFixed(3);
    } else if (opt.type === 'toggle') {
      o[opt.key] = r() < (opt.p ?? 0.5);
    }
  }
  return o;
}

// ---- proportions of a mesh model ----
// sections: contiguous [{y0, y1, len, width, thick}] along Y. The boundary
// at `anchor` stays put; every section is stretched by `len`, and its
// width / thickness scaled by `width` / `thick` (ramping smoothly over
// `ramp` mm at the boundaries). Returns the part warp plus helpers to move
// other parts (zones, dowels) along with the model.
export function sectionWarp(sections, { anchor = 0, cx = 0, cz = 0, ramp = 6, core = 0 } = {}) {
  const bounds = [sections[0].y0, ...sections.map((s) => s.y1)];
  let ai = bounds.findIndex((b) => Math.abs(b - anchor) < 1e-6);
  if (ai < 0) ai = 0;
  const mapped = bounds.slice();
  for (let i = ai + 1; i < bounds.length; i++) mapped[i] = mapped[i - 1] + (bounds[i] - bounds[i - 1]) * (sections[i - 1].len ?? 1);
  for (let i = ai - 1; i >= 0; i--) mapped[i] = mapped[i + 1] - (bounds[i + 1] - bounds[i]) * (sections[i].len ?? 1);
  const stops = bounds.map((b, i) => [b, mapped[i]]);
  const table = (key) => {
    const out = [];
    sections.forEach((s, i) => {
      const r = Math.min(ramp, (s.y1 - s.y0) / 3);
      const v = s[key] ?? 1;
      out.push([i === 0 ? s.y0 : s.y0 + r, v], [i === sections.length - 1 ? s.y1 : s.y1 - r, v]);
    });
    return out;
  };
  const warp = { stops, widths: table('width'), thick: table('thick'), cx, cz, core };
  const at = (tab, y, slope) => {
    if (y <= tab[0][0]) return slope ? tab[0][1] + (y - tab[0][0]) : tab[0][1];
    const n = tab.length;
    if (y >= tab[n - 1][0]) return slope ? tab[n - 1][1] + (y - tab[n - 1][0]) : tab[n - 1][1];
    let i = 1;
    while (tab[i][0] < y) i++;
    const [y0, v0] = tab[i - 1], [y1, v1] = tab[i];
    return v0 + ((v1 - v0) * (y - y0)) / (y1 - y0 || 1);
  };
  const mapY = (y) => at(stops, y, true);
  const point = ([x, y, z]) => {
    const dx = x - cx, k = at(warp.widths, y, false);
    const ax = Math.abs(dx) <= core ? dx : Math.sign(dx) * (core + (Math.abs(dx) - core) * k);
    return [cx + ax, mapY(y), cz + (z - cz) * at(warp.thick, y, false)];
  };
  return { warp, mapY, point, width: (y) => at(warp.widths, y, false), thick: (y) => at(warp.thick, y, false) };
}

// Stable ids for generated parts, so a selection survives a rebuild.
export function stableIds(list, prefix) {
  const seen = new Map();
  for (const p of list) {
    const base = `${prefix}-${String(p.name || p.type).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    p.id = n > 1 ? `${base}-${n}` : base;
  }
  return list;
}

// ---- 2D helpers for icons and outlines ----
export const circlePoly = (r, n = 32, cx = 0, cy = 0, a0 = 0) =>
  Array.from({ length: n }, (_, i) => { const a = a0 + (i / n) * Math.PI * 2; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });

export const icon = (...items) => items.map((it) => (Array.isArray(it) ? { poly: it } : it));
export const hole = (poly) => ({ poly, hole: true });
