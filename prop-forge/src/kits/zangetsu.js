// Zangetsu (Bleach, Shikai): the creator's unreleased V1 (file units,
// scaled up), with a pointed or cut-off heel. Also the generic "cleaver
// sword" generator: no guard, tang handle to wrap in cloth.
import { COLORS as C, P, blade, box, ring, dowel, design } from '../templates/helpers.js';
import { choice, range, toggle, fil, group, sizeGroup, sectionWarp, icon } from './core.js';
import { meshPart, palette, thumbOf, pillow, xy } from './parts.js';

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
// The heel (the corner of the blade nearest the handle, on the edge side)
// is at (-18.9, -20.3); the V1 file ends it in a slanted cut, so by default
// it is drawn out into a point.
const heelIcon = (pointed) => icon([[-8, 14], [-8, pointed ? -7 : -2], [2, -1], [2, -12], [4, -12], [4, 14]]);

const modelVariant = {
  label: 'Your model',
  groups: () => [
    sizeGroup(),
    group('Proportions', [
      range('bladeLen', 'Blade length', 75, 125, 100, { unit: '%' }),
      range('bladeWidth', 'Blade width', 80, 125, 100, { unit: '%', hint: 'Widens toward the edge; the spine stays straight.' }),
      range('handleLen', 'Handle length', 70, 140, 100, { unit: '%', hint: 'The handle prints bare: wrap it with real cloth or bandage afterwards.' }),
    ]),
    group('Blade heel', [
      choice('heel', 'Corner of the blade by the handle', [
        { v: 'pointed', label: 'Pointed', icon: heelIcon(true) },
        { v: 'cut', label: 'Cut off (as in V1)', icon: heelIcon(false) },
      ], 'pointed'),
      range('heelLen', 'Point length', 15, 140, 60, { show: (o) => o.heel === 'pointed', hint: 'How far the point reaches down past the cut-off corner.' }),
    ]),
    group('Strength', [dowelChoice()]),
    group('Colours', [fil('fil_blade', 'Print colour', 1)]),
  ],
  build(o) {
    const w = sectionWarp([
      { y0: -80, y1: -12, len: o.handleLen / 100 },
      { y0: -12, y1: 205, len: o.bladeLen / 100, width: o.bladeWidth / 100 },
    ], { anchor: -12, cx: 9.5, ramp: 3 });
    const sc = UNIT * ((o.size || 100) / 100);
    const warp = o.heel === 'pointed' ? { ...w.warp, heel: { x0: -19, x1: -4, y0: -20.3, y1: -5, d: o.heelLen / sc } } : w.warp;
    const parts = [meshPart('Zangetsu', 'zangetsu_v1', { warp, filament: o.fil_blade })];
    const features = o.dowel === 'none' ? [] : [dowel('Handle dowel', [8.9, w.mapY(-71), 1.5], [8.6, w.mapY(-8), 1.5], +o.dowel, { id: 'k-dowel' })];
    const d = design('Zangetsu', parts, { features, meta: { bayPos: [-4, 60, 1.5], baySize: [40, 80, 10] } });
    d.scale = UNIT;
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
  thumb: () => thumbOf(['zangetsu_v1'], [C.steel]),
  variants: { model: modelVariant },
};

export const cleaver = {
  id: 'gen-cleaver', generator: true,
  name: 'Cleaver sword', type: 'cleaver sword',
  blurb: 'Huge single-edged cleavers with no guard and a tang handle to wrap in cloth.',
  models: [],
  variants: { generated: generatedVariant },
};
