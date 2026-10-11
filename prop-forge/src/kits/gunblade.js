// Revolver gunblade (Final Fantasy VIII). Model variant: the creator's own
// model (Thingiverse 3825730) with a rebuilt, fluted revolver cylinder.
import { COLORS as C, P, blade, flat, cyl, dowel, design, hole as holePart } from '../templates/helpers.js';
import { choice, range, toggle, fil, group, sizeGroup, sectionWarp, circlePoly, icon, hole } from './core.js';
import { meshPart, palette, thumbOf, revolver, pillow, clipAbove, xy } from './parts.js';

const PALETTE = () => palette(['Silver', '#9aa2ad'], ['Gunmetal', '#4a4f57'], ['Black', '#2b2d31'], ['Gold', '#d4a63a']);

// ---- revolver cylinder options (shared by both variants) ----
function cylinderIcon(n, style, holes = true) {
  const R = 10, fr = 2.4, d = R + fr - 1.3;
  const out = [];
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    let r = R;
    if (style !== 'none') {
      for (let k = 0; k < n; k++) {
        const b = ((k + 0.5) / n) * Math.PI * 2;
        const fx = d * Math.cos(b), fy = d * Math.sin(b);
        while (r > 0 && Math.hypot(r * Math.cos(a) - fx, r * Math.sin(a) - fy) < fr) r -= 0.1;
      }
    }
    out.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  const items = [out];
  if (holes) for (let k = 0; k < n; k++) { const b = (k / n) * Math.PI * 2; items.push(hole(circlePoly(1.8, 16, 5.6 * Math.cos(b), 5.6 * Math.sin(b)))); }
  items.push(hole(circlePoly(1, 12)));
  return icon(...items);
}

function fluteIcon(style) {
  const body = [[-8, -12], [8, -12], [8, 12], [-8, 12]];
  const slot = (y0, y1, round0, round1) => {
    const p = [];
    const w = 2.2;
    for (let i = 0; i <= 8; i++) { const a = Math.PI + (i / 8) * Math.PI; p.push([w * Math.cos(a), round0 ? y0 + w * Math.sin(a) + w : y0]); }
    for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; p.push([w * Math.cos(a), round1 ? y1 + w * Math.sin(a) - w : y1]); }
    return p;
  };
  if (style === 'none') return icon(body);
  const ys = { front: [-2, 12, true, false], closed: [-7, 7, true, true], full: [-12, 12, false, false] }[style];
  return icon(body, ...[-4.5, 0, 4.5].map((x) => hole(slot(ys[0], ys[1], ys[2], ys[3]).map(([a, b]) => [a + x, b]))));
}

const cylinderOptions = (extra = []) => group('Revolver cylinder', [
  ...extra,
  choice('chambers', 'Chambers', [5, 6, 7, 8].map((n) => ({ v: n, label: `${n}`, icon: cylinderIcon(n, 'front') })), 6,
    { hint: 'Number of chambers (and flutes) around the cylinder' }),
  choice('flutes', 'Flutes (grooves along the outside)', [
    { v: 'front', label: 'Open at the front', icon: fluteIcon('front') },
    { v: 'closed', label: 'Rounded both ends', icon: fluteIcon('closed') },
    { v: 'full', label: 'Full length', icon: fluteIcon('full') },
    { v: 'none', label: 'Smooth', icon: fluteIcon('none') },
  ], 'front'),
  range('fluteLen', 'Flute length', 30, 95, 60, { unit: '%', show: (o) => o.flutes !== 'none' && o.flutes !== 'full', hint: 'How far the flutes run along the cylinder' }),
  range('fluteW', 'Flute width', 6, 16, 12, { step: 0.5, show: (o) => o.flutes !== 'none' }),
  toggle('chamberHoles', 'Chamber holes in the front face', true),
  toggle('notches', 'Cylinder-stop notches at the back', false, { p: 0.4 }),
  toggle('turns', 'Cylinder turns on a pin (prints as its own piece)', true, { random: false,
    hint: 'The cylinder and its pin print separately: slide the cylinder onto the pin, then glue the pin into the frame. An 8 mm steel rod or dowel can replace the printed pin.' }),
]);

function cylinderParts(o, { cx, cy, R, L, frameId }) {
  const nf = o.flutes === 'none' ? 0 : o.chambers;
  const fr = (o.fluteW || 12) / 2;
  const parts = [revolver('Revolver cylinder', {
    pos: [cx, cy, 0], r: R, length: L, color: C.steel, filament: o.fil_cyl, separate: o.turns,
    flutes: nf, fluteR: fr, fluteDepth: Math.min(fr * 0.6, R * 0.16), fluteLen: (o.fluteLen || 60) / 100, fluteStyle: o.flutes,
    chambers: o.chamberHoles ? o.chambers : 0, chamberR: R * 0.2 * (6 / Math.max(6, o.chambers)), chamberDepth: L * 0.22,
    chamberAt: R * 0.56, pinR: o.turns ? 4.4 : 0, notches: o.notches,
  })];
  // the pin runs into the frame above and below the window
  parts.push(cyl('Cylinder pin', 4, 4, L + 18, [cx, cy, 0], { color: C.steel, filament: o.fil_cyl, ...(o.turns ? { separate: true } : {}) }));
  if (o.turns) parts.push(cyl('Pin hole', 4.2, 4.2, L + 19, [cx, cy, 0], { op: 'subtract', target: frameId, color: C.dark }));
  return parts;
}

const rodGroup = () => group('Strength', [
  choice('rod', 'Steel rod through the blade', [
    { v: 'none', label: 'None' }, { v: 4, label: '4 mm' }, { v: 6, label: '6 mm' }, { v: 8, label: '8 mm' },
  ], 4, { random: false, hint: 'A channel for a steel rod (or carbon tube) from the frame up the blade. Glue the rod in when you assemble the blade pieces.' }),
]);

const colourGroup = () => group('Colours', [
  fil('fil_blade', 'Blade', 1), fil('fil_frame', 'Frame', 2), fil('fil_grip', 'Grip', 3), fil('fil_cyl', 'Cylinder and pin', 1),
]);

// ---------------------------------------------------------------------
// Your model
const MODEL_KEYS = ['gunblade_blade', 'gunblade_blade_tip', 'gunblade_frame', 'gunblade_handle'];

const modelVariant = {
  label: 'Your model',
  base: { length: 863 },
  groups: () => [
    sizeGroup(),
    group('Blade', [
      range('bladeLen', 'Blade length', 70, 140, 100, { unit: '%', hint: 'Stretches the blade only; the frame and grip keep their size.' }),
      range('bladeWidth', 'Blade width', 80, 125, 100, { unit: '%' }),
    ]),
    cylinderOptions(),
    rodGroup(),
    colourGroup(),
  ],
  build(o) {
    const w = sectionWarp([
      { y0: -200, y1: 170 },
      { y0: 170, y1: 700, len: o.bladeLen / 100, width: o.bladeWidth / 100 },
    ], { anchor: 170, cx: -2 });
    const frameId = 'frame';
    const parts = [
      meshPart('Blade', 'gunblade_blade', { warp: w.warp, filament: o.fil_blade }),
      meshPart('Blade tip', 'gunblade_blade_tip', { warp: w.warp, filament: o.fil_blade }),
      { ...meshPart('Frame', 'gunblade_frame', { color: C.dark, filament: o.fil_frame }), id: frameId },
      meshPart('Grip', 'gunblade_handle', { color: C.wrap, filament: o.fil_grip }),
      ...cylinderParts(o, { cx: 3, cy: 67, R: 25.7, L: 64, frameId }),
    ];
    const features = o.rod === 'none' ? [] : [dowel('Blade rod', [-2, 112, 0], [-2, w.mapY(520), 0], +o.rod, { id: 'k-rod' })];
    const d = design('Revolver Gunblade', parts, { features, meta: { handle: { from: [-55, -130, 0], to: [-6, 120, 0] }, bayPos: [8, 135, 0], baySize: [40, 50, 22] } });
    d.filaments = PALETTE();
    return d;
  },
};

export const gunblade = {
  id: 'revolver-gunblade-model',
  name: 'Revolver Gunblade', category: 'Final Fantasy', source: 'Final Fantasy VIII',
  blurb: '87 cm. Blade, frame and grip from your model, with a fluted revolver cylinder that turns on a pin.',
  credit: 'Your model · thingiverse.com/thing:3825730',
  models: MODEL_KEYS,
  thumb: () => thumbOf(MODEL_KEYS, [C.steel, C.steel, C.dark, C.wrap]),
  variants: { model: modelVariant },
};

