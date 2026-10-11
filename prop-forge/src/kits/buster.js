// Buster Sword (Final Fantasy VII), from the creator's 1:1 model
// (Thingiverse 1794243), with options of its own: proportions, materia
// (filament or resin, optionally lit by LEDs) and strengthening.
// Also the generic "greatsword" generator.
import { COLORS as C, P, blade, box, cyl, sphere, lathe, ring, dowel, bay, design, hole as holePart } from '../templates/helpers.js';
import { choice, range, toggle, fil, group, sizeGroup, sectionWarp, circlePoly, icon, hole } from './core.js';
import { meshPart, zone, palette, thumbOf, wrappedGrip, clipAbove, xy } from './parts.js';

const PALETTE = () => palette(['Silver', '#c3c8cf'], ['Dark grey', '#4a4f57'], ['Brown (grip)', '#5a3b26'], ['Green (materia)', '#3fae5a']);

const dowelChoice = (def = 12.7, hint = 'A hardwood dowel from the pommel up into the blade keeps a long grip from snapping at the guard.') => choice('dowel', 'Wooden dowel through the grip', [
  { v: 'none', label: 'None' }, { v: 9.53, label: '3/8 in' }, { v: 12.7, label: '1/2 in' }, { v: 15.88, label: '5/8 in' },
], def, { random: false, hint });

const MATERIA_Y = [45, 135]; // centres of the two holes (r 20.1)
const MATERIA_R = 19.7;

const materiaIcon = (fillColor, lit) => icon(blockIcon(),
  ...[4, 12].flatMap((y) => [
    fillColor ? { poly: circlePoly(3, 16, 0, y), color: fillColor } : hole(circlePoly(3, 16, 0, y)),
    ...(lit ? [{ poly: circlePoly(1.1, 10, 0, y), color: '#fff6b0' }] : []),
  ]));

// Materia balls for the holes: printed in filament or resin; with LEDs
// they are hollow with a 5 mm LED socket facing down the wire channel.
function materiaParts(o, at) {
  const parts = [];
  if (o.materia === 'open') return parts;
  const resin = o.materia === 'resin';
  at.forEach(([x, y, z], i) => {
    const id = `materia${i}`;
    parts.push({ ...sphere(`Materia ${i + 1}`, MATERIA_R, [x, y, z], { color: '#3fae5a', filament: o.fil_materia, separate: true, sides: 64 }), id, ...(resin ? { resin: true } : {}) });
    if (o.led) {
      parts.push(sphere(`Materia ${i + 1} hollow`, MATERIA_R - (resin ? 2.2 : 2.6), [x, y, z], { op: 'subtract', target: id }));
      parts.push(cyl(`Materia ${i + 1} LED socket`, 2.65, 2.65, MATERIA_R + 2, [x, y - MATERIA_R / 2, z], { op: 'subtract', target: id, sides: 24 }));
    }
  });
  return parts;
}

// Wire channels from the materia holes to a battery bay in the hilt.
function ledFeatures(o, pt) {
  if (o.materia === 'open' || !o.led) return [];
  const ch = (name, a, b) => dowel(name, pt(a), pt(b), 6, { id: `k-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, clearance: 0 });
  // the hilt is solid from y -5 to -52 (below that it opens round the grip)
  return [
    ch('LED wire, lower materia', [0, 24, 0], [30, -22, 0]),
    ch('LED wire, upper materia', [0, 116, 0], [33, 90, 0]),
    ch('LED wire, upper materia 2', [33, 90, 0], [33, 4, 0]),
    ch('LED wire, upper materia 3', [33, 4, 0], [38, -22, 0]),
    { ...bay('LED battery bay', pt([38, -31, 0]), [40, 34, 24], { lid: { side: '-z', magnets: { enabled: true, diameter: 6.2, depth: 3.2 } } }), id: 'k-led-bay' },
  ];
}

// ---------------------------------------------------------------------
// Blade 0…1327.5 mm, hilt -75…0, grip and pommel -487.5…-75.
const modelVariant = {
  label: 'Your model',
  groups: () => [
    sizeGroup(),
    group('Proportions', [
      range('bladeLen', 'Blade length', 70, 130, 100, { unit: '%' }),
      range('bladeWidth', 'Blade width', 80, 120, 100, { unit: '%', hint: 'The middle strip with the materia holes keeps its size, so the holes stay round.' }),
      range('gripLen', 'Grip length', 70, 130, 100, { unit: '%' }),
    ]),
    group('Materia', [
      choice('materia', 'The two holes by the hilt', [
        { v: 'open', label: 'Open holes', icon: materiaIcon(null) },
        { v: 'filament', label: 'Printed in filament', icon: materiaIcon('#3fae5a') },
        { v: 'resin', label: 'Resin-printed', icon: materiaIcon('#7fe39a') },
      ], 'open', { hint: 'Materia are separate 39.4 mm balls glued into the holes. Resin materia are exported as their own STL files (in a "resin" folder) for your resin printer; use clear or translucent green resin.' }),
      toggle('led', 'LED lights inside the materia', false, {
        show: (o) => o.materia !== 'open',
        hint: 'Each materia is hollow with a socket for a 5 mm LED facing down a wire channel in the blade; the wires run to a battery bay with a magnetic lid on the back of the hilt. Print the materia in clear/translucent resin or filament.',
      }),
    ]),
    group('Strength', [
      dowelChoice(12.7, 'From the pommel into the base of the blade (it stops just below the materia holes).'),
      choice('rods', 'Steel rods up the blade', [{ v: 'none', label: 'None' }, { v: 6, label: '2 × 6 mm' }, { v: 8, label: '2 × 8 mm' }], 6,
        { hint: 'Two rods either side of the materia holes, from inside the hilt to 70 cm up the blade, so the blade pieces cannot snap apart at the joints.' }),
    ]),
    group('Colours', [fil('fil_blade', 'Blade', 1), fil('fil_hilt', 'Hilt', 2), fil('fil_grip', 'Grip', 3), fil('fil_materia', 'Materia', 4, { show: (o) => o.materia === 'filament' })]),
  ],
  build(o) {
    const w = sectionWarp([
      { y0: -500, y1: -75, len: o.gripLen / 100 },
      { y0: -75, y1: 0 },
      { y0: 0, y1: 1340, len: o.bladeLen / 100, width: o.bladeWidth / 100 },
    ], { anchor: 0, core: 24, ramp: 4 });
    const gy0 = w.mapY(-468), gy1 = w.mapY(-75);
    const parts = [
      meshPart('Buster Sword', 'buster', { warp: w.warp, filament: o.fil_blade }),
      zone('Hilt colour', box('', [240, 75, 90], [0, -37.5, 0]), o.fil_hilt),
      zone('Grip colour', cyl('', 26, 26, gy1 - gy0, [0, (gy0 + gy1) / 2, 0]), o.fil_grip),
      ...materiaParts(o, MATERIA_Y.map((y) => [0, w.mapY(y), 0])),
    ];
    const features = [];
    if (o.dowel !== 'none') features.push(dowel('Handle dowel', [0, w.mapY(-484), 0], [0, 18, 0], +o.dowel, { id: 'k-dowel' }));
    if (o.rods !== 'none') for (const s of [-1, 1]) features.push(dowel(s < 0 ? 'Blade rod (left)' : 'Blade rod (right)', w.point([s * 72, -48, 0]), w.point([s * 72, 700, 0]), +o.rods, { id: s < 0 ? 'k-rod-l' : 'k-rod-r', clearance: 0.2 }));
    features.push(...ledFeatures(o, w.point));
    const d = design('Buster Sword', parts, { features, meta: { bayPos: [0, w.mapY(300), 0], baySize: [70, 40, 20] } });
    if (o.led && o.materia !== 'open') d.meta.notes = ['LEDs: 2 × 5 mm LEDs (or 5 mm WS2812 pixels), thin hook-up wire, a small slide switch and a battery that fits the 40 × 34 × 24 mm hilt bay: a flat 1S LiPo (e.g. 503035) with a USB-C charge board, or a 2 × CR2032 holder'];
    d.filaments = PALETTE();
    return d;
  },
};

function blockIcon() { return [[-8, -2], [8, -2], [8, 20], [-8, 20]]; }

// ---------------------------------------------------------------------
// Generated great sword
function bladeOutline(o) {
  const W = o.bladeWidth, L = o.bladeLen, h = W / 2;
  const s = o.edges === 'both' ? 's' : '';
  // the blade starts 3 mm inside the guard so the two fuse
  const pts = [P(-h, -3, 's'), P(h, -3, s)];
  const up = (x, y, f = '') => pts.push(P(x, y, f));
  switch (o.tip) {
    case 'spear': up(h, L - W * 0.9, s); up(0, L, 's'); up(-h, L - W * 0.9, 's'); break;
    case 'coffin': up(h, L - W * 0.4, s); up(h * 0.35, L, 's'); up(-h * 0.35, L, 's'); up(-h, L - W * 0.4, 's'); break;
    case 'curved': up(h, L, s); up(-h * 0.1, L - W * 0.45, 'sc'); up(-h, L - W * 1.35, 's'); break;
    case 'square': up(h, L - 14, s); up(h - 14, L, ''); up(-h + 14, L, ''); up(-h, L - 14, 's'); break;
    default: up(h, L, s); up(-h, L - W * 1.68, 's'); // angled, like the Buster Sword
  }
  return pts;
}

function tipIcon(tip) {
  return icon(clipAbove(xy(bladeOutline({ bladeWidth: 200, bladeLen: 1300, tip, edges: 'both' })), 850));
}

function guardIcon(style) {
  const g = { block: [[-11, 0], [11, 0], [11, 2], [10, 2], [10, 7], [11, 7], [11, 9], [-11, 9], [-11, 7], [-10, 7], [-10, 2], [-11, 2]],
    cross: [[-16, 3], [16, 3], [16, 7], [-16, 7]],
    winged: [[-15, 9], [-10, 4], [-4, 2], [4, 2], [10, 4], [15, 9], [9, 7], [0, 6], [-9, 7]],
    none: [[-3, 3], [3, 3], [3, 7], [-3, 7]] }[style];
  return icon([[-8, 9], [8, 9], [8, 22], [-8, 22]], g, [[-2.5, -10], [2.5, -10], [2.5, 1], [-2.5, 1]]);
}

function pommelIcon(style) {
  const grip = [[-2.5, 0], [2.5, 0], [2.5, 14], [-2.5, 14]];
  const p = {
    cap: circlePoly(3, 16, 0, 0),
    ball: circlePoly(5, 20, 0, -4),
    disc: circlePoly(6.5, 24, 0, -5),
    spike: [[-4, 0], [4, 0], [0, -11]],
    ring: [...circlePoly(6, 24, 0, -6)],
  }[style];
  const items = [grip, p];
  if (style === 'ring') items.push(hole(circlePoly(3.5, 20, 0, -6)));
  return icon(...items);
}

function holeIcon(shape) {
  const s = 7;
  const poly = {
    round: circlePoly(s, 24),
    square: [[-s, -s], [s, -s], [s, s], [-s, s]],
    diamond: [[0, -s * 1.3], [s * 1.3, 0], [0, s * 1.3], [-s * 1.3, 0]],
    hex: circlePoly(s * 1.1, 6, 0, 0, Math.PI / 6),
  }[shape];
  return icon([[-11, -11], [11, -11], [11, 11], [-11, 11]], hole(poly));
}

// Generic greatsword: a big two-handed sword; every option can be changed
// and "Generate another" rolls new ones.
const generatedVariant = {
  label: 'Greatsword',
  groups: () => [
    sizeGroup(),
    group('Blade', [
      choice('tip', 'Tip', [
        { v: 'spear', label: 'Spear', icon: tipIcon('spear'), weight: 4 },
        { v: 'coffin', label: 'Coffin', icon: tipIcon('coffin'), weight: 1.5 },
        { v: 'curved', label: 'Curved cut', icon: tipIcon('curved'), weight: 1 },
        { v: 'angled', label: 'Angled cut', icon: tipIcon('angled'), weight: 1 },
        { v: 'square', label: 'Square', icon: tipIcon('square'), weight: 0.5 },
      ], 'spear'),
      range('bladeLen', 'Blade length', 700, 1500, 1100, { step: 5, rand: [950, 1250] }),
      range('bladeWidth', 'Blade width', 45, 260, 70, { rand: [55, 110] }),
      range('thickness', 'Thickness', 7, 45, 11, { step: 0.5, rand: [9, 15], hint: 'Thinner prints faster and is lighter to carry; 9–14 mm stays stiff with a steel rod inside.' }),
      choice('edges', 'Sharp edges', [{ v: 'both', label: 'Both sides', weight: 4 }, { v: 'one', label: 'One side' }], 'both'),
      range('bevel', 'Edge grind width', 6, 70, 18, { rand: [12, 26] }),
      choice('fuller', 'Groove down the middle', [{ v: 'fuller', label: 'Fuller', weight: 2 }, { v: 'none', label: 'None' }], 'fuller'),
    ]),
    group('Holes', [
      range('holes', 'Number of holes', 0, 4, 0, { unit: '', rand: [0, 0.65] }),
      choice('holeShape', 'Hole shape', ['round', 'square', 'diamond', 'hex'].map((v) => ({ v, label: v[0].toUpperCase() + v.slice(1), icon: holeIcon(v) })), 'round', { show: (o) => o.holes > 0 }),
      range('holeSize', 'Hole size', 15, 60, 30, { show: (o) => o.holes > 0, rand: [20, 40] }),
      toggle('materia', 'Gems in the holes (print separately)', false, { show: (o) => o.holes > 0 && o.holeShape === 'round', p: 0.3 }),
    ]),
    group('Hilt', [
      choice('guard', 'Guard', ['cross', 'winged', 'block', 'none'].map((v) => ({ v, label: { block: 'Block', cross: 'Cross bar', winged: 'Winged', none: 'Collar only' }[v], icon: guardIcon(v), weight: { cross: 4, winged: 2, block: 1, none: 0.5 }[v] })), 'cross'),
      range('guardW', 'Guard width', 120, 420, 280, { show: (o) => o.guard === 'cross' || o.guard === 'winged', rand: [220, 340] }),
      range('gripLen', 'Grip length', 180, 480, 300, { step: 2, rand: [240, 360] }),
      range('gripR', 'Grip thickness', 24, 40, 31, { unit: 'mm Ø', rand: [28, 34] }),
      choice('wrap', 'Grip', [{ v: 'ridges', label: 'Wrapped' }, { v: 'smooth', label: 'Smooth' }], 'ridges'),
      choice('pommel', 'Pommel', ['disc', 'ball', 'cap', 'spike', 'ring'].map((v) => ({ v, label: v[0].toUpperCase() + v.slice(1), icon: pommelIcon(v), weight: { disc: 3, ball: 2, cap: 1, spike: 1, ring: 0.6 }[v] })), 'disc'),
    ]),
    group('Strength', [
      dowelChoice(12.7, 'Through the grip and guard (and into the blade if it is thick enough).'),
      choice('rod', 'Steel rod up the blade', [{ v: 'none', label: 'None' }, { v: 4, label: '4 mm' }, { v: 6, label: '6 mm' }, { v: 8, label: '8 mm' }], 6,
        { random: false, hint: 'From inside the guard to 60% up the blade; it keeps the blade pieces from snapping at the joints. Thin blades get a thinner rod automatically.' }),
    ]),
    group('Colours', [fil('fil_blade', 'Blade', 1), fil('fil_hilt', 'Guard', 2), fil('fil_grip', 'Grip', 3), fil('fil_pommel', 'Pommel', 2), fil('fil_materia', 'Gems', 4, { show: (o) => o.materia })]),
  ],
  tidy(o) {
    if (o.holeShape !== 'round') o.materia = false;
    if (o.tip === 'spear' && o.holes > 2) o.holes = 2;
    // broad slab blades get a block guard and thicker steel, like anime greatswords
    if (o.bladeWidth > 150 && o.guard === 'cross') o.guard = 'block';
    return o;
  },
  build(o) {
    const W = o.bladeWidth, T = o.thickness, h = W / 2;
    const bladeId = 'blade';
    const parts = [{ ...blade('Blade', bladeOutline(o), { thickness: T, edge: 2.5, bevel: o.bevel, tipThickness: T * 0.75, color: C.steel, filament: o.fil_blade }), id: bladeId }];
    // holes down the middle, starting near the hilt
    const hs = o.holeSize, n = o.holes | 0;
    for (let i = 0; i < n; i++) {
      const y = hs * 0.6 + 20 + i * hs * 2.2;
      const pos = [0, y, 0];
      if (o.holeShape === 'round') parts.push(holePart(`Hole ${i + 1}`, hs / 2, pos, T * 3, { target: bladeId }));
      else if (o.holeShape === 'hex') parts.push(cyl(`Hole ${i + 1}`, hs * 0.55, hs * 0.55, T * 3, pos, { sides: 6, rot: [90, 0, 0], op: 'subtract', target: bladeId }));
      else parts.push(box(`Hole ${i + 1}`, [hs, hs, T * 3], pos, { op: 'subtract', target: bladeId, rot: o.holeShape === 'diamond' ? [0, 0, 45] : [0, 0, 0] }));
      if (o.materia && o.holeShape === 'round') parts.push(sphere(`Gem ${i + 1}`, hs / 2 - 0.3, pos, { color: '#3fae5a', filament: o.fil_materia, separate: true }));
    }
    if (o.fuller === 'fuller') {
      const y0 = n ? hs * 0.6 + 20 + (n - 1) * hs * 2.2 + hs : 60;
      const y1 = o.bladeLen - W * (o.tip === 'angled' ? 1.9 : 1.1);
      if (y1 > y0 + 50) for (const z of [-1, 1]) parts.push(box('Fuller', [W * 0.16, y1 - y0, 6], [0, (y0 + y1) / 2, z * T / 2], { op: 'subtract', target: bladeId }));
    }
    // guard
    let gh = 0;
    if (o.guard === 'block') {
      gh = 75;
      parts.push(box('Guard top plate', [W + 22, 10, T + 22], [0, -5, 0], { color: C.dark, filament: o.fil_hilt }));
      parts.push(box('Guard block', [W + 4, 55, T + 16], [0, -37.5, 0], { color: C.dark, filament: o.fil_hilt }));
      parts.push(box('Guard bottom plate', [W + 22, 10, T + 22], [0, -70, 0], { color: C.dark, filament: o.fil_hilt }));
    } else if (o.guard === 'cross') {
      gh = 30;
      const bw = Math.max(W + 40, o.guardW || W + 120);
      parts.push(box('Cross guard', [bw, 30, T + 14], [0, -15, 0], { color: C.dark, filament: o.fil_hilt }));
      for (const s of [-1, 1]) parts.push(sphere('Guard end', 20, [s * bw / 2, -15, 0], { color: C.dark, filament: o.fil_hilt }));
    } else if (o.guard === 'winged') {
      gh = 30;
      const span = Math.max(W / 2 + 40, (o.guardW || W + 160) / 2);
      parts.push(blade('Winged guard', [P(-span, 34), P(-span + 30, 4, 'c'), P(-h * 0.5, -30), P(h * 0.5, -30), P(span - 30, 4, 'c'), P(span, 34), P(span - 50, 8, 'c'), P(0, 0), P(-span + 50, 8, 'c')],
        { thickness: T + 16, edge: T + 16, bevel: 0, color: C.dark, filament: o.fil_hilt }));
    } else {
      gh = 22;
      parts.push(cyl('Collar', o.gripR / 2 + 7, o.gripR / 2 + 7, 22, [0, -11, 0], { color: C.dark, filament: o.fil_hilt }));
    }
    // grip and pommel
    const r = o.gripR / 2, yTop = -gh, yEnd = -gh - o.gripLen;
    parts.push(wrappedGrip('Grip', yTop + 2, yEnd, r, { ridges: o.wrap === 'ridges' ? Math.round(o.gripLen / 16) : 0, ridgeDepth: o.wrap === 'ridges' ? 1.4 : 0, filament: o.fil_grip }));
    const pf = { color: C.dark, filament: o.fil_pommel };
    if (o.pommel === 'cap') parts.push(lathe('Pommel', [P(r + 1.5, yEnd + 6), P(r + 1.5, yEnd - 4, 'c'), P(r * 0.7, yEnd - r * 0.9, 'c'), P(0, yEnd - r * 1.05)], pf));
    else if (o.pommel === 'ball') parts.push(sphere('Pommel', r * 1.9, [0, yEnd - r * 1.4, 0], pf));
    else if (o.pommel === 'disc') parts.push(cyl('Pommel', r * 2.3, r * 2.3, r * 1.4, [0, yEnd - r * 2, 0], { ...pf, rot: [90, 0, 0] }));
    else if (o.pommel === 'spike') parts.push(lathe('Pommel', [P(r + 4, yEnd + 4), P(r + 6, yEnd - 12, 'c'), P(0, yEnd - 70)], pf));
    else parts.push(ring('Pommel ring', r * 1.6, r * 0.5, [0, yEnd - r * 1.9, 0], pf));
    const features = [];
    if (o.dowel !== 'none') {
      const intoBlade = T >= +o.dowel + 8;
      const top = !intoBlade ? -4 : n ? hs * 0.1 + 12 : Math.min(300, o.bladeLen * 0.25); // stop below any holes
      features.push(dowel('Handle dowel', [0, yEnd + 6, 0], [0, top, 0], +o.dowel, { id: 'k-dowel' }));
    }
    const rodD = o.rod === 'none' ? 0 : Math.min(+o.rod, Math.floor(T - 5));
    if (rodD >= 3) {
      const top = o.bladeLen * 0.6;
      if (!n) features.push(dowel('Blade rod', [0, -gh + 4, 0], [0, top, 0], rodD, { id: 'k-rod', clearance: 0.2 }));
      else {
        // holes run down the middle: two rods either side of them, or one that stops below them
        const off = hs / 2 + rodD / 2 + 4;
        if (h - o.bevel > off + rodD) for (const sx of [-1, 1]) features.push(dowel(sx < 0 ? 'Blade rod (left)' : 'Blade rod (right)', [sx * off, -gh + 4, 0], [sx * off, top, 0], rodD, { id: sx < 0 ? 'k-rod-l' : 'k-rod-r', clearance: 0.2 }));
        else features.push(dowel('Blade rod', [0, -gh + 4, 0], [0, hs * 0.1 + 12, 0], rodD, { id: 'k-rod', clearance: 0.2 }));
      }
    }
    const d = design('Greatsword', parts, { features, meta: { bayPos: [0, 350, 0], baySize: [Math.min(70, W * 0.6), 40, Math.max(6, T - 6)] } });
    d.filaments = PALETTE();
    return d;
  },
};

export const buster = {
  id: 'buster-sword-model',
  name: 'Buster Sword', category: 'Final Fantasy', source: 'Final Fantasy VII / Crisis Core',
  blurb: '1:1, 1.8 m. Materia in filament or resin, with optional LED lights and a battery bay in the hilt.',
  credit: 'Your model · thingiverse.com/thing:1794243',
  models: ['buster'],
  thumb: () => thumbOf(['buster'], [C.steel]),
  variants: { model: modelVariant },
};

export const greatsword = {
  id: 'gen-greatsword', generator: true,
  name: 'Greatsword', type: 'greatsword',
  blurb: 'Big two-handed swords: tip, guard, grip and pommel styles, fuller, optional holes.',
  models: [],
  variants: { generated: generatedVariant },
};
