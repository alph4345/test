// Katana (Demon Slayer). Model variant: Tanjiro's katana from the creator's
// model (Thingiverse 4708245), already cut into 7 print pieces. Generated
// variant: a katana with the same build (tsuba that slides on, wrapped
// tsuka) and a choice of kissaki, hamon and tsuba.
import { COLORS as C, P, blade, flat, cyl, lathe, dowel, design } from '../templates/helpers.js';
import { MODEL_THUMBS } from '../templates/models.js';
import { choice, range, toggle, fil, group, sizeGroup, sectionWarp, circlePoly, icon, hole } from './core.js';
import { meshPart, zone, palette, thumbOf, xy } from './parts.js';

const PALETTE = () => palette(['Black', '#2b2d31'], ['Black (handle)', '#1d1f22'], ['Gold', '#c9a23f'], ['Silver', '#c3c8cf']);

// ---- tsuba shapes (outline in the plane of the guard, radius ~1) ----
function tsubaShape(style, R, n = 120) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    let r = R;
    if (style === 'mokko') r = R * (1 - 0.13 * Math.abs(Math.sin(2 * a)) ** 0.6);
    else if (style === 'aoi') r = R * (1 - 0.24 * Math.abs(Math.sin(2 * a)) ** 2.5);
    else if (style === 'square') { const p = 5; r = R * 0.9 / (Math.abs(Math.cos(a)) ** p + Math.abs(Math.sin(a)) ** p) ** (1 / p); }
    else if (style === 'flame') {
      // eight flame tongues curling the same way round
      const u = ((a * 8) / (Math.PI * 2)) % 1;
      r = R * (0.74 + 0.26 * (u < 0.75 ? (u / 0.75) ** 1.8 : 1 - (u - 0.75) / 0.25));
    }
    out.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return out;
}

const tsubaIcon = (style) => icon(tsubaShape(style === 'yours' || style === 'spokes' ? 'round' : style, 10, 64), hole(circlePoly(2.6, 16)),
  ...(style === 'yours' || style === 'spokes' ? Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * Math.PI * 2; const c = Math.cos(a), s = Math.sin(a); return hole([[4.5 * c - 0.4 * s, 4.5 * s + 0.4 * c], [8.8 * c - 0.7 * s, 8.8 * s + 0.7 * c], [8.8 * c + 0.7 * s, 8.8 * s - 0.7 * c], [4.5 * c + 0.4 * s, 4.5 * s - 0.4 * c]]); }) : []));

const TSUBA_LABEL = { spokes: 'Spokes', round: 'Round', mokko: 'Mokko', aoi: 'Aoi', square: 'Rounded square', flame: 'Flame' };

// Guard lying across the blade (plane XZ), centred on `y`, as its own piece.
function tsubaParts(style, { R, t, y, holeR, o }) {
  const parts = [];
  const pts = tsubaShape(style === 'spokes' ? 'round' : style, R).map(([x, z]) => P(x, z));
  const id = 'tsuba';
  parts.push({ ...flat('Tsuba', pts, t, { rot: [90, 0, 0], pos: [0, y, 0], color: C.black, filament: o.fil_tsuba, separate: true }), id });
  parts.push(cyl('Tsuba hole', holeR, holeR, t + 4, [0, y, 0], { op: 'subtract', target: id, sides: 40 }));
  if (style === 'spokes') {
    const slot = [P(R * 0.42, -1.1), P(R * 0.86, -1.9), P(R * 0.86, 1.9), P(R * 0.42, 1.1)];
    parts.push({ ...flat('Tsuba slot', slot, t + 4, { rot: [90, 0, 0], pos: [0, y, 0], op: 'subtract', target: id }), copies: { mode: 'radial', count: 28 } });
  }
  return parts;
}

// ---- hamon: the lighter edge line along the cutting edge ----
function hamonOffset(style, y, band, amp) {
  if (style === 'wavy') return band + amp * Math.sin((y / 110) * Math.PI * 2);
  if (style === 'clove') return band + amp * (Math.abs(Math.sin((y / 34) * Math.PI)) - 0.5) * 2;
  return band;
}

// Band between the edge curve and a line `width` inside it.
function hamonZone(edgeAt, { y0, y1, style, width, thick, side = 1, filament }) {
  const outer = [], inner = [];
  const n = Math.max(24, Math.round((y1 - y0) / 6));
  for (let i = 0; i <= n; i++) {
    const y = y0 + ((y1 - y0) * i) / n;
    const e = edgeAt(y);
    const d = hamonOffset(style, y, width, width * 0.35) * Math.min(1, (y - y0 + 4) / 30);
    outer.push(P(e + side * 4, y));
    inner.push(P(e - side * Math.max(0.5, d), y));
  }
  const pts = side > 0 ? [...outer, ...inner.reverse()] : [...inner, ...outer.reverse()];
  return zone('Hamon (edge line)', flat('', pts, thick), filament);
}

const hamonIcon = (style) => {
  const top = [], bot = [];
  for (let i = 0; i <= 40; i++) { const x = -12 + (24 * i) / 40; top.push([x, 2 + hamonOffset(style, x * 9, 2.5, 1.2) * 1.6]); bot.push([x, -4]); }
  return icon([[-12, -4], [12, -4], [12, 9], [-12, 9]], { poly: [...bot, ...top.reverse()], color: '#c3c8cf' });
};

const hamonChoice = (def) => choice('hamon', 'Edge line (hamon)', [
  { v: 'none', label: 'None', icon: icon([[-12, -4], [12, -4], [12, 9], [-12, 9]]) },
  { v: 'straight', label: 'Straight', icon: hamonIcon('straight') },
  { v: 'wavy', label: 'Wavy', icon: hamonIcon('wavy') },
  { v: 'clove', label: 'Clove', icon: hamonIcon('clove') },
], def, { hint: 'Prints the edge in another filament (e.g. silver on a black blade) on a multi-toolhead printer, or marks where to paint.' });

// Edge (+x side) of the creator's blade, from the outlines of pt1–pt4.
let edgeTable = null;
function modelEdge() {
  if (edgeTable) return edgeTable;
  const polys = ['tanjiro_pt1', 'tanjiro_pt2', 'tanjiro_pt3', 'tanjiro_pt4'].flatMap((k) => MODEL_THUMBS[k] || []);
  const rows = [];
  for (let y = 0; y <= 620; y += 5) {
    let best = -Infinity;
    for (const poly of polys) {
      for (let i = 0; i < poly.length; i++) {
        const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
        if ((ay - y) * (by - y) > 0 || ay === by) continue;
        best = Math.max(best, ax + ((bx - ax) * (y - ay)) / (by - ay));
      }
    }
    if (best > -Infinity) rows.push([y, best]);
  }
  edgeTable = rows;
  return rows;
}
const tableAt = (rows, y) => {
  if (!rows.length) return 0;
  if (y <= rows[0][0]) return rows[0][1];
  for (let i = 1; i < rows.length; i++) if (rows[i][0] >= y) { const [y0, a] = rows[i - 1], [y1, b] = rows[i]; return a + ((b - a) * (y - y0)) / (y1 - y0); }
  return rows[rows.length - 1][1];
};

// ---------------------------------------------------------------------
// Your model
const MODEL_KEYS = ['tanjiro_pt1', 'tanjiro_pt2', 'tanjiro_pt3', 'tanjiro_pt4', 'tanjiro_pt5', 'tanjiro_pt6', 'tanjiro_pt7'];

const modelVariant = {
  label: 'Your model',
  groups: () => [
    sizeGroup(),
    group('Blade', [
      range('bladeLen', 'Blade length', 85, 120, 100, { unit: '%', hint: 'Stretches the four blade pieces; the handle and tsuba keep their size.' }),
      hamonChoice('none'),
      range('hamonW', 'Edge line width', 3, 12, 6, { step: 0.5, show: (o) => o.hamon !== 'none' }),
    ]),
    group('Tsuba (guard)', [
      choice('tsuba', 'Shape', ['yours', 'flame', 'mokko', 'aoi', 'square', 'round'].map((v) => ({ v, label: v === 'yours' ? 'Your tsuba' : TSUBA_LABEL[v], icon: tsubaIcon(v) })), 'yours',
        { hint: 'Other shapes are generated with the same centre hole, so they slide on like yours. The flame tsuba is the one Tanjiro carries later in the story.' }),
    ]),
    group('Colours', [fil('fil_blade', 'Blade', 1), fil('fil_hamon', 'Edge line', 4, { show: (o) => o.hamon !== 'none' }), fil('fil_handle', 'Handle', 2), fil('fil_tsuba', 'Tsuba', 1)]),
  ],
  build(o) {
    const w = sectionWarp([{ y0: -300, y1: 0 }, { y0: 0, y1: 640, len: o.bladeLen / 100 }], { anchor: 0, ramp: 2 });
    const bladeOpts = { color: C.black, separate: true, filament: o.fil_blade, warp: w.warp };
    const parts = [
      meshPart('Blade tip (pt1)', 'tanjiro_pt1', bladeOpts),
      meshPart('Blade (pt2)', 'tanjiro_pt2', bladeOpts),
      meshPart('Blade (pt3)', 'tanjiro_pt3', bladeOpts),
      meshPart('Blade base + tang (pt4)', 'tanjiro_pt4', bladeOpts),
      meshPart('Handle (pt6)', 'tanjiro_pt6', { color: C.black, filament: o.fil_handle, separate: true }),
      meshPart('Handle end (pt5)', 'tanjiro_pt5', { color: C.black, filament: o.fil_handle, separate: true }),
    ];
    if (o.tsuba === 'yours') parts.push(meshPart('Tsuba (pt7)', 'tanjiro_pt7', { color: C.dark, filament: o.fil_tsuba, separate: true }));
    else parts.push(...tsubaParts(o.tsuba, { R: 33, t: 8.8, y: -4.4, holeR: 8.6, o }));
    if (o.hamon !== 'none') {
      const rows = modelEdge();
      const edgeAt = (y) => tableAt(rows, y);
      const z = hamonZone((y) => edgeAt(y), { y0: 2, y1: 612, style: o.hamon, width: o.hamonW, thick: 40, filament: o.fil_hamon });
      z.points = z.points.map((p) => ({ ...p, y: w.mapY(p.y) }));
      parts.push(z);
    }
    const d = design('Tanjiro Katana', parts, { meta: { bayPos: [0, -200, 0], baySize: [14, 80, 14] } });
    d.filaments = PALETTE();
    return d;
  },
};

// ---------------------------------------------------------------------
// Generated katana. Edge on +x, spine on -x, curving back toward the spine.
function geometry(o) {
  const L = o.bladeLen, wb = o.width, wt = o.width * o.taper / 100, sori = o.sori;
  const kl = wt * { ko: 1.0, chu: 1.5, o: 2.3 }[o.kissaki];
  const c = (y) => -sori * (y / L) ** 2;
  const w = (y) => wb + (wt - wb) * (y / L);
  const edge = (y) => c(y) + w(y) / 2, spine = (y) => c(y) - w(y) / 2;
  return { L, kl, c, w, edge, spine, yk: L - kl };
}

function bladeOutline(o, tang = 0) {
  const g = geometry(o);
  const N = 9;
  const s0 = g.spine(0), e0 = g.edge(0);
  // nakago (tang) runs down inside the handle
  const pts = tang > 0
    ? [P(s0, 0), P(s0 + 1, -tang + 10), P(s0 + 5, -tang, 'c'), P(e0 - 9, -tang + 8, 'c'), P(e0 - 3, -4), P(e0, 0, 's')]
    : [P(s0, 0), P(e0, 0, 's')];
  for (let i = 1; i <= N; i++) { const y = (g.yk * i) / N; pts.push(P(g.edge(y), y, i === N ? 's' : 'sc')); }
  // fukura: the curved edge of the point, from the yokote to the tip
  const tipX = g.spine(g.L) + 1.5;
  const ek = g.edge(g.yk);
  pts.push(P(ek - (ek - tipX) * 0.18, g.yk + g.kl * 0.45, 'sc'), P(ek - (ek - tipX) * 0.55, g.yk + g.kl * 0.85, 'sc'), P(tipX, g.L, 's'));
  pts.push(P(g.spine(g.L - g.kl * 0.4), g.L - g.kl * 0.4, 'c'));
  for (let i = N - 1; i >= 1; i--) { const y = (g.yk * i) / N; pts.push(P(g.spine(y), y, 'c')); }
  return pts;
}

const kissakiIcon = (k) => {
  const o = { bladeLen: 700, width: 32, taper: 70, sori: 18, kissaki: k };
  const pts = xy(bladeOutline(o)).filter(([, y]) => y > 590).map(([x, y]) => [x, y]);
  return icon(pts.length > 2 ? [[pts[0][0], 590], ...pts, [pts[pts.length - 1][0], 590]] : pts);
};

function diamondZones(y0, y1, w, thick, filament) {
  const out = [];
  const step = w * 1.15;
  for (let y = y0 - step / 2; y > y1 + step / 2; y -= step) {
    out.push(zone('Wrap diamond', flat('', [P(0, y - step * 0.38), P(w * 0.34, y), P(0, y + step * 0.38), P(-w * 0.34, y)], thick), filament));
  }
  return out;
}

const generatedVariant = {
  label: 'Katana',
  groups: () => [
    sizeGroup(),
    group('Blade', [
      range('bladeLen', 'Blade length (nagasa)', 550, 780, 700, { step: 5, rand: [640, 740] }),
      range('sori', 'Curve (sori)', 6, 30, 17, { rand: [12, 24] }),
      range('width', 'Width at the base', 26, 38, 32, { step: 0.5, rand: [29, 35] }),
      range('taper', 'Width at the tip', 55, 90, 70, { unit: '%', rand: [62, 80] }),
      choice('kissaki', 'Point (kissaki)', [{ v: 'ko', label: 'Small', icon: kissakiIcon('ko') }, { v: 'chu', label: 'Medium', icon: kissakiIcon('chu') }, { v: 'o', label: 'Large', icon: kissakiIcon('o') }], 'chu'),
      range('thickness', 'Thickness', 6, 10, 7.5, { step: 0.5, rand: [7, 8.5] }),
      hamonChoice('wavy'),
      range('hamonW', 'Edge line width', 3, 12, 7, { step: 0.5, show: (o) => o.hamon !== 'none', rand: [5, 9] }),
    ]),
    group('Tsuba and fittings', [
      choice('tsuba', 'Tsuba', ['round', 'mokko', 'aoi', 'square', 'spokes', 'flame'].map((v) => ({ v, label: TSUBA_LABEL[v], icon: tsubaIcon(v), weight: { round: 3, mokko: 3, aoi: 2, square: 2, spokes: 1, flame: 1 }[v] })), 'mokko'),
      range('tsubaD', 'Tsuba size', 60, 90, 74, { unit: 'mm Ø', rand: [66, 82] }),
      toggle('habaki', 'Habaki (collar above the tsuba)', true, { p: 0.85 }),
    ]),
    group('Handle (tsuka)', [
      range('tsukaLen', 'Length', 200, 320, 265, { step: 5, rand: [240, 290] }),
      choice('wrap', 'Wrap', [{ v: 'diamond', label: 'Diamond pattern' }, { v: 'ridges', label: 'Ridges' }, { v: 'plain', label: 'Plain' }], 'diamond'),
      toggle('menuki', 'Mekugi peg', true, { random: false }),
    ]),
    group('Strength', [
      choice('rod', 'Steel rod from the handle into the blade', [{ v: 'none', label: 'None' }, { v: 3, label: '3 mm' }, { v: 4, label: '4 mm' }], 3,
        { random: false, hint: 'A katana blade is thin; a 3 mm steel rod (or carbon rod) stops it snapping at the tsuba.' }),
    ]),
    group('Colours', [
      fil('fil_blade', 'Blade', 1), fil('fil_hamon', 'Edge line', 4, { show: (o) => o.hamon !== 'none' }), fil('fil_tsuba', 'Tsuba', 2),
      fil('fil_fittings', 'Habaki and end cap', 3), fil('fil_handle', 'Handle wrap', 2), fil('fil_same', 'Diamonds (ray skin)', 4, { show: (o) => o.wrap === 'diamond' }),
    ]),
  ],
  build(o) {
    const g = geometry(o);
    const T = o.thickness;
    const tt = 6.5;
    const y0 = -0.5 - tt - 1.2, y1 = y0 - o.tsukaLen;
    const parts = [blade('Blade', bladeOutline(o, -y1 - 25), { thickness: T, edge: 1.6, bevel: g.w(0) * 0.42, tipThickness: T * 0.7, color: C.black, filament: o.fil_blade })];
    if (o.hamon !== 'none') parts.push(hamonZone(g.edge, { y0: 0, y1: g.L, style: o.hamon, width: o.hamonW, thick: T + 6, filament: o.fil_hamon }));
    // habaki: collar at the base of the blade
    if (o.habaki) parts.push(flat('Habaki', [P(g.spine(0) - 2.5, -1.5), P(g.edge(0) + 2.5, -1.5), P(g.edge(30) + 1.5, 32, 'c'), P(g.spine(30) - 1.5, 32, 'c')], T + 5, { color: C.gold, filament: o.fil_fittings }));
    // tsuba and a seppa (washer) under it; everything is threaded on the tang
    const tc = g.c(0);
    const tsuba = tsubaParts(o.tsuba, { R: o.tsubaD / 2, t: tt, y: -0.5 - tt / 2, holeR: 0.1, o });
    delete tsuba[0].separate; // fused: the generated katana is cut into pieces in the Split step
    tsuba[0].pos = [tc, -0.5 - tt / 2, 0];
    parts.push(tsuba[0], ...tsuba.slice(2).map((p) => ({ ...p, pos: [tc, p.pos[1], 0] })));
    parts.push(cyl('Seppa', 20, 20, 1.6, [tc, -0.5 - tt - 0.6, 0], { color: C.gold, filament: o.fil_fittings }));
    // tsuka: oval handle
    const r = g.w(0) / 2 + 1.5;
    const ridges = o.wrap === 'ridges' ? Math.round(o.tsukaLen / 18) : 0;
    const tsukaPts = [P(r + 2.5, y0 + 0.4)];
    for (let i = 1; i < 12; i++) { const t = i / 12; tsukaPts.push(P(r - 1.2 * Math.sin(Math.PI * t) + (ridges && i % 2 ? 1.2 : 0), y0 - o.tsukaLen * t, 'c')); }
    tsukaPts.push(P(r + 1.5, y1 + 8));
    parts.push({ ...lathe('Tsuka', tsukaPts, { color: C.black, filament: o.fil_handle }), pos: [tc, 0, 0], stretch: [1, 1, 0.78] });
    if (o.wrap === 'diamond') parts.push(...diamondZones(y0 - 8, y1 + 22, r * 2, r * 2 + 6, o.fil_same).map((z) => ({ ...z, pos: [tc, 0, 0] })));
    parts.push(cyl('Fuchi', r + 2.8, r + 2.8, 9, [tc, y0 - 4.5, 0], { color: C.gold, filament: o.fil_fittings, stretch: [1, 1, 0.8] }));
    parts.push({ ...lathe('Kashira', [P(r + 2.2, y1 + 10), P(r + 2.6, y1 + 2, 'c'), P(r * 0.8, y1 - 5, 'c'), P(0, y1 - 6)], { color: C.gold, filament: o.fil_fittings }), pos: [tc, 0, 0], stretch: [1, 1, 0.8] });
    if (o.menuki) parts.push(cyl('Mekugi', 2.6, 2.6, r * 2.4, [tc, y0 - 32, 0], { rot: [90, 0, 0], color: C.wood, filament: o.fil_fittings }));
    const features = o.rod === 'none' ? [] : [dowel('Steel rod', [tc, y1 + 8, 0], [g.c(150), 150, 0], +o.rod, { id: 'k-rod', clearance: 0.15 })];
    const d = design('Katana', parts, { features, meta: { bayPos: [0, y0 - 120, 0], baySize: [14, 80, 14] } });
    d.filaments = palette(['Steel grey', '#9aa1aa'], ['Black', '#2b2d31'], ['Gold', '#c9a23f'], ['White / bright silver', '#e6e8eb']);
    return d;
  },
};

export const katana = {
  id: 'tanjiro-katana',
  name: 'Tanjiro\'s Katana', category: 'Demon Slayer', source: 'Demon Slayer',
  blurb: '89 cm nichirin katana in your 7 print pieces. Other tsuba shapes and a silver edge line.',
  credit: 'Your model · thingiverse.com/thing:4708245',
  models: MODEL_KEYS,
  thumb: () => thumbOf(['tanjiro_pt1', 'tanjiro_pt2', 'tanjiro_pt3', 'tanjiro_pt4', 'tanjiro_pt6', 'tanjiro_pt5', 'tanjiro_pt7'], [C.black, C.black, C.black, C.black, C.black, C.black, C.dark]),
  variants: { model: modelVariant },
};

export const katanaGen = {
  id: 'gen-katana', generator: true,
  name: 'Katana', type: 'katana',
  blurb: 'Curve, point, hamon edge line, tsuba shape and handle wrap.',
  models: [],
  variants: { generated: generatedVariant },
};
