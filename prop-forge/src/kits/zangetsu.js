// Zangetsu (Bleach, Shikai): the creator's unreleased V1 (file units,
// scaled up) with its blade as an editable outline. Also the generic
// "cleaver sword" generator: no guard, tang handle to wrap in cloth.
import { COLORS as C, P, blade, box, ring, dowel, design } from '../templates/helpers.js';
import { choice, range, toggle, fil, group, sizeGroup, sectionWarp, icon } from './core.js';
import { meshPart, palette, pillow, xy } from './parts.js';
import { MODEL_SHAPES } from '../templates/models.js';

const PALETTE = () => palette(['Silver', '#9aa2ad'], ['White', '#f7f7f4'], ['Black', '#2b2d31'], ['Red', '#a3262a']);
const UNIT = 1700 / 270.8; // the V1 file is 270.8 units long; shown at 1.70 m

const dowelChoice = () => choice('dowel', 'Wooden dowel through the handle', [
  { v: 'none', label: 'None' }, { v: 9.53, label: '3/8 in' }, { v: 12.7, label: '1/2 in' },
], 9.53, { random: false, hint: 'Runs from the end of the handle up into the blade.' });

// Rigid chain hanging from the end of the handle. Links alternate between
// facing you and edge-on, overlapping so the chain prints as one piece.
function chain(n, top, s, o) {
  const parts = [];
  const pitch = 26 / s, R = 10 / s, tube = 3.2 / s;
  for (let i = 0; i < n; i++) {
    const c = [top[0], top[1] - pitch * (i + 0.5), top[2]];
    const link = ring(`Chain link ${i + 1}`, R, tube, c, { color: C.dark, filament: o.fil_chain });
    link.stretch = [1, 1, 1.45];
    if (i % 2 === 0) link.rot = [90, 90, 0];
    parts.push(link);
  }
  return parts;
}

const chainIcon = (n) => icon([[-3, 4], [3, 4], [3, 14], [-3, 14]], ...Array.from({ length: n }, (_, i) => {
  const y = 2 - i * 4.4;
  return i % 2 ? [[-0.8, y - 3], [0.8, y - 3], [0.8, y + 3], [-0.8, y + 3]] : [[-2.5, y - 3], [2.5, y - 3], [2.5, y + 3], [-2.5, y + 3]];
}));

// ---------------------------------------------------------------------
// Your model (coordinates in file units; the design scale makes them mm).
// The blade is an outline traced from the V1 file, so its shape can be
// edited node by node; the handle is your mesh. The V1 file ends the heel
// (the corner by the handle, on the edge side) in a slanted cut; here it
// comes to a point, and the outline editor can change it.
const Z = -1.475; // the blade's centre plane in the V1 file
// the blade outline traced from the V1 file (kept with the unreleased model)
const BLADE = () => MODEL_SHAPES.zangetsu_v1?.blade || [];
// thickness 3.05 at the root, tapering to 0.97 between y -8 and 78
const T0 = 3.05, T1 = 0.97, TAPER = [-8, 78];
const thickAt = (y) => T0 + (T1 - T0) * Math.min(1, Math.max(0, (y - TAPER[0]) / (TAPER[1] - TAPER[0])));
const yForThick = (t) => (t >= T0 ? TAPER[0] : t <= T1 ? Infinity : TAPER[0] + ((T0 - t) / (T0 - T1)) * (TAPER[1] - TAPER[0]));

const modelVariant = {
  label: 'Your model',
  groups: () => [
    sizeGroup(),
    group('Proportions', [
      range('bladeLen', 'Blade length', 75, 125, 100, { unit: '%' }),
      range('bladeWidth', 'Blade width', 80, 125, 100, { unit: '%', hint: 'Widens toward the edge; the spine stays straight. To change the shape itself (the heel, the point, the curve of the edge), use "Edit parts by hand" below and drag the blade\'s nodes.' }),
      range('handleLen', 'Handle length', 70, 140, 100, { unit: '%', hint: 'The handle prints bare: wrap it with real cloth or bandage afterwards.' }),
    ]),
    group('Strength', [
      choice('dowel', 'Wooden dowel through the handle', [
        { v: 'none', label: 'None' }, { v: 9.53, label: '3/8 in' }, { v: 12.7, label: '1/2 in' },
      ], 9.53, { random: false, hint: 'Runs from the end of the handle well up into the blade, as far as the blade is thick enough to hold it.' }),
      choice('rod', 'Carbon or steel rod further up the blade', [{ v: 'none', label: 'None' }, { v: 3, label: '3 mm' }, { v: 4, label: '4 mm' }], 3,
        { random: false, hint: 'Carries on where the dowel stops, through the middle of the blade toward the point, so the glued blade pieces can\'t snap apart. A 3 mm rod reaches furthest; 4 mm stops where the blade gets thin.' }),
    ]),
    group('Colours', [fil('fil_blade', 'Print colour', 1)]),
  ],
  // Everything is worked out in the V1 file's units and turned into
  // millimetres (U per unit), so the outline editor shows real sizes.
  build(o) {
    const U = UNIT;
    const w = sectionWarp([
      { y0: -80 * U, y1: -12 * U, len: o.handleLen / 100 },
      { y0: -12 * U, y1: 205 * U, len: o.bladeLen / 100, width: o.bladeWidth / 100 },
    ], { anchor: -12 * U, cx: 9.5 * U, ramp: 3 * U });
    const mm = ([x, y, z = Z]) => [x * U, y * U, z * U];
    const sc = UNIT * ((o.size || 100) / 100); // mm per file unit in the finished prop
    const kb = o.bladeWidth / 100;
    // blade points left of the handle (the heel) follow the blade's width
    const map = ([x, y, f = '']) => P(x < 4 ? (9.5 + (x - 9.5) * kb) * U : w.point(mm([x, y, 0]))[0], w.mapY(y * U), f);
    const parts = [{
      ...blade('Blade', BLADE().map(map), { thickness: T0 * U, edge: 0.4 * U, bevel: 14.5 * U, tipThickness: T1 * U, color: C.steel, filament: o.fil_blade }),
      pos: [0, 0, Z * U], taperY: TAPER.map((y) => +w.mapY(y * U).toFixed(1)), id: 'blade',
    }];
    // your handle, with the V1 blade taken off it
    const handle = { ...meshPart('Handle', 'zangetsu_v1', { warp: w.warp, filament: o.fil_blade }), unit: U, id: 'handle' };
    parts.push(handle);
    const cut = w.mapY(-16.2 * U);
    parts.push(box('Handle: blade removed', [700, 2600, 260], [9.5 * U, cut + 1300, 0], { op: 'subtract', target: 'handle' }));
    parts.push(box('Handle: heel removed', [380, 250, 260], [2.3 * U - 190, cut - 125, 0], { op: 'subtract', target: 'handle' }));
    // dowel up the middle of the handle and on into the blade, as far as
    // the blade keeps about 2 mm of wall around it
    const features = [];
    if (o.dowel !== 'none') {
      const D = +o.dowel;
      const yTop = Math.min(60, yForThick((D + 4) / sc)) - (D / 2 + 2) / sc;
      features.push(dowel('Handle dowel', [8.9 * U, w.mapY(-71 * U), Z * U], [5.5 * U, w.mapY(yTop * U), Z * U], D, { id: 'k-dowel' }));
    }
    if (o.rod !== 'none') {
      const D = +o.rod;
      const yTop = Math.min(150, yForThick((D + 2.8) / sc) - 4);
      const x = (y) => 1.5 + 3.5 * (y / 150);
      features.push(dowel('Blade rod', w.point(mm([x(0), 0])), w.point(mm([x(yTop), yTop])), D, { id: 'k-rod', clearance: 0.2 }));
    }
    const d = design('Zangetsu', parts, { features, meta: { bayPos: mm([-4, 60]), baySize: [40, 80, 10] } });
    d.filaments = PALETTE();
    return d;
  },
};

// ---------------------------------------------------------------------
// Generated cleaver
const CURVE = { classic: 2.2, broad: 3.6, slim: 1.35 };

function bladeOutline(o) {
  const L = o.bladeLen, W = o.bladeWidth, sx = 0; // spine along x = 0, edge toward -x
  const k = CURVE[o.tip] || 2.2;
  const pts = [P(sx - W, -W * 0.06, 's')];
  const N = 9;
  for (let i = 1; i < N; i++) {
    const t = i / N;
    pts.push(P(sx - W * (1 - t ** k), L * t, 'sc'));
  }
  pts.push(P(sx + (o.tip === 'hooked' ? -4 : 0), L, 's'));
  pts.push(P(sx + 3, L * 0.6, 'c'), P(sx + 4, L * 0.2, 'c'), P(sx + 4, 0));
  // blade root steps down into the tang with a small hooked notch
  const tw = o.tangW;
  pts.push(P(sx + 4, -12), P(sx + 4 - tw, -12), P(sx + 4 - tw - 6, -6, 'c'), P(sx - W * 0.45, 2, 'c'));
  return pts;
}

const tipIcon = (tip) => icon(xy(bladeOutline({ bladeLen: 120, bladeWidth: 26, tip, tangW: 6 })));

const generatedVariant = {
  label: 'Cleaver sword',
  groups: () => [
    sizeGroup(),
    group('Blade', [
      choice('tip', 'Blade shape', [
        { v: 'classic', label: 'Classic', icon: tipIcon('classic') },
        { v: 'broad', label: 'Broad', icon: tipIcon('broad') },
        { v: 'slim', label: 'Slim', icon: tipIcon('slim') },
      ], 'classic'),
      range('bladeLen', 'Blade length', 700, 1450, 1250, { step: 10, rand: [900, 1350] }),
      range('bladeWidth', 'Blade width', 120, 240, 190, { rand: [150, 220] }),
      range('thickness', 'Thickness at the base', 10, 24, 16, { step: 0.5, rand: [12, 19] }),
      range('bevel', 'Edge grind width', 10, 50, 28, { rand: [18, 40] }),
    ]),
    group('Handle', [
      range('handleLen', 'Handle length', 220, 460, 370, { step: 5, rand: [300, 420] }),
      range('tangW', 'Handle width', 32, 56, 44, { rand: [38, 50] }),
      choice('wrap', 'Handle', [{ v: 'plain', label: 'Bare (wrap it with real cloth)', weight: 3 }, { v: 'bands', label: 'Printed cloth bands' }], 'plain'),
      choice('chain', 'Chain at the end of the handle', [0, 2, 3, 4, 5].map((n) => ({ v: n, label: n ? `${n} links` : 'None', icon: chainIcon(n), weight: n ? 0.25 : 3 })), 0),
    ]),
    group('Strength', [dowelChoice()]),
    group('Colours', [fil('fil_blade', 'Blade', 1), fil('fil_wrap', 'Handle', 1), fil('fil_chain', 'Chain', 3, { show: (o) => o.chain > 0 })]),
  ],
  build(o) {
    const L = o.bladeLen, T = o.thickness, tw = o.tangW, hl = o.handleLen;
    const parts = [blade('Blade', bladeOutline(o), { thickness: T, edge: 2.4, bevel: o.bevel, tipThickness: Math.max(6, T * 0.6), color: C.steel, filament: o.fil_blade })];
    const hx = 4 - tw / 2;
    const ht = Math.max(T + 12, tw * 0.75);
    parts.push(pillow('Handle', [P(hx - tw / 2, -6), P(hx + tw / 2, -6), P(hx + tw / 2, -hl), P(hx - tw / 2, -hl)], ht, { color: C.cloth, filament: o.fil_wrap, round: 7 }));
    if (o.wrap === 'bands') {
      for (let y = -24, i = 0; y > -hl + 10; y -= 22, i++) {
        parts.push(box('Wrap band', [tw + 3, 9, ht + 2.5], [hx, y, 0], { rot: [0, 0, i % 2 ? 22 : -22], color: C.cloth, filament: o.fil_wrap }));
      }
    }
    parts.push(...chain(o.chain, [hx, -hl + 4, 0], 1, o));
    const features = o.dowel === 'none' ? [] : [dowel('Handle dowel', [hx, -hl + 8, 0], [hx, L * 0.15, 0], +o.dowel, { id: 'k-dowel' })];
    const d = design('Cleaver', parts, { features, meta: { bayPos: [-o.bladeWidth / 2, 300, 0], baySize: [60, 60, 8] } });
    d.filaments = PALETTE();
    return d;
  },
};

export const zangetsu = {
  id: 'zangetsu-v1',
  name: 'Zangetsu (V1)', category: 'Bleach', source: 'Bleach',
  blurb: 'Shikai Zangetsu with its long tang handle, shown at 1.70 m.',
  credit: 'Your model · unreleased',
  models: ['zangetsu_v1'],
  thumb: () => [
    { poly: BLADE().map(([x, y]) => [x, y]), color: C.steel },
    { poly: MODEL_SHAPES.zangetsu_v1?.handleThumb || [], color: C.steel },
  ],
  variants: { model: modelVariant },
};

export const cleaver = {
  id: 'gen-cleaver', generator: true,
  name: 'Cleaver sword', type: 'cleaver sword',
  blurb: 'Huge single-edged cleavers with no guard and a tang handle to wrap in cloth.',
  models: [],
  variants: { generated: generatedVariant },
};
