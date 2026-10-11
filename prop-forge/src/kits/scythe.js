// Maka's scythe (Soul Eater). Model variant: the creator's topper and
// Soul's cuff buttons (Thingiverse 1863433), plus a printable blade drawn
// after the board blade in the creator's photos (black with a red toothed
// edge) whose tab slides into the topper's blade slot. Generated variant:
// a whole scythe of the same design.
import { COLORS as C, P, blade, box, cyl, sphere, lathe, dowel, design, hole as holePart } from '../templates/helpers.js';
import { choice, range, toggle, fil, group, sizeGroup, circlePoly, icon, hole, defaultsOf } from './core.js';
import { meshPart, zone, palette, thumbOf } from './parts.js';

const PALETTE = () => palette(['Black', '#2b2d31'], ['Red', '#c4262e'], ['Silver', '#c3c8cf'], ['White', '#ecebe6']);

// Topper frame (the creator's model, printed at 150%): body r 22.5 on the
// staff axis, blade slot on +x from y 52.5 to 157.5 and 15 mm wide.
const SLOT = { y0: 52.5, y1: 157.5, w: 15, depth: 22 };

// ---- blade (world coordinates: x along the blade, y up) ----
function bladeCurves(o, slot = SLOT, r = 22.5) {
  const x0 = r, L = o.bladeLen;
  const top0 = slot.y1 - 0.5, H = slot.y1 - slot.y0 - 1;
  const drop = H + o.droop / 100 * L;
  const top = (t) => top0 + o.rise * Math.sin(Math.PI * Math.min(1, t * 1.25)) * (1 - t) - (drop - 0) * t ** o.curve;
  const height = (t) => H * (1 + 0.18 * Math.sin(Math.PI * t)) * (1 - t ** 2.3);
  return { x0, L, top, bottom: (t) => top(t) - height(t), height };
}

function bladeOutlineWorld(o, slot, r) {
  const b = bladeCurves(o, slot, r);
  const N = 18;
  const pts = [];
  // tab that slides into the slot, then the bottom (cutting) edge out to the tip
  pts.push([r - slot.depth + 0.5, slot.y0 + 0.5, ''], [b.x0, slot.y0 + 0.5, '']);
  for (let i = 1; i < N; i++) { const t = i / N; pts.push([b.x0 + b.L * t, b.bottom(t), 'sc']); }
  pts.push([b.x0 + b.L, b.top(1), 's']);
  for (let i = N - 1; i >= 1; i--) { const t = i / N; pts.push([b.x0 + b.L * t, b.top(t), 'c']); }
  pts.push([b.x0, slot.y1 - 0.5, ''], [r - slot.depth + 0.5, slot.y1 - 0.5, '']);
  return pts;
}

// The blade is built lying along local +y and turned onto +x, so the
// grind's taper runs from the tab to the tip.
const toLocal = (pts) => pts.map(([x, y, f]) => P(-y, x, f));

// Red band along the edge with teeth pointing up into the black.
function teethZone(o, slot, r, thick, filament) {
  const b = bladeCurves(o, slot, r);
  const outer = [], inner = [];
  const n = 240;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = b.x0 + b.L * t;
    const h = b.height(t);
    const u = (t * o.teeth) % 1;
    const tooth = u < 0.5 ? u / 0.5 : (1 - u) / 0.5; // triangle wave, peaks pointing up
    const band = h * (o.band / 100) * (1 - 0.3 * t) + h * (o.toothH / 100) * tooth * (1 - 0.5 * t);
    outer.push([x, b.bottom(t) - 6]);
    inner.push([x, Math.min(b.top(t) - 1.5, b.bottom(t) + band)]);
  }
  outer.push([b.x0 + b.L + 8, b.top(1) - 6]);
  const pts = [[b.x0 - 4, slot.y0 - 6], ...outer, ...inner.reverse(), [b.x0 - 4, inner[inner.length - 1][1]]];
  return zone('Red teeth', { ...blade('', toLocal(pts.map(([x, y]) => [x, y, ''])), { thickness: thick, edge: thick, bevel: 0 }), rot: [0, 0, -90] }, filament);
}

function bladeParts(o, slot = SLOT, r = 22.5) {
  const pts = bladeOutlineWorld(o, slot, r);
  const T = slot.w - 0.6; // tab fits the slot with 0.3 mm each side
  const parts = [{
    ...blade('Blade', toLocal(pts), { thickness: T, edge: 2.2, bevel: o.bevel, tipThickness: Math.max(5, T * o.tipThick / 100), color: C.black, filament: o.fil_blade, separate: true }),
    rot: [0, 0, -90],
  }];
  parts[0].id = 'blade';
  if (o.teethOn) parts.push(teethZone(o, slot, r, T + 8, o.fil_teeth));
  return parts;
}

const bladeIcon = (curve, droop) => {
  const o = { bladeLen: 800, rise: 20, droop, curve };
  return icon(bladeOutlineWorld(o, SLOT, 22.5).map(([x, y]) => [x, y]));
};

const bladeGroup = (extra = []) => group('Blade', [
  choice('curve', 'Shape', [
    { v: 2.6, label: 'Long sweep', icon: bladeIcon(2.6, 18) },
    { v: 1.8, label: 'Even curve', icon: bladeIcon(1.8, 18) },
    { v: 3.6, label: 'Hooked tip', icon: bladeIcon(3.6, 18) },
  ], 2.6),
  range('bladeLen', 'Blade length', 450, 1300, 820, { step: 10, rand: [650, 1100] }),
  range('droop', 'How far the tip drops', 0, 40, 18, { unit: '%', rand: [10, 28] }),
  range('rise', 'Arch of the back', 0, 60, 20, { rand: [5, 40] }),
  range('bevel', 'Edge grind width', 8, 40, 22, { rand: [14, 30] }),
  range('tipThick', 'Thickness at the tip', 40, 100, 60, { unit: '%', random: false }),
  toggle('teethOn', 'Red toothed edge (multi-filament)', true, { random: false }),
  range('teeth', 'Number of teeth', 4, 16, 9, { unit: '', show: (o) => o.teethOn, rand: [7, 12] }),
  range('band', 'Red band height', 5, 50, 22, { unit: '%', show: (o) => o.teethOn, rand: [15, 30] }),
  range('toothH', 'Tooth height', 5, 60, 30, { unit: '%', show: (o) => o.teethOn, rand: [20, 42] }),
  ...extra,
]);

const staffGroup = (def = 'rod') => group('Staff', [
  choice('staff', 'Staff', [
    { v: 'rod', label: '17 mm metal rod (not printed)' },
    { v: 'printed', label: 'Printed, comes apart' },
  ], def, { random: false, hint: 'The topper fits a 17 mm (about 11/16 in) rod or tube. A printed staff is cut into screw-together pieces in the Split step.' }),
  range('staffLen', 'Staff length', 900, 1700, 1400, { step: 10, show: (o) => o.staff === 'printed', random: false }),
]);

function staffParts(o, socketR = 8.5) {
  if (o.staff !== 'printed') return [];
  const L = o.staffLen;
  // one piece of its own (cut into screw-together lengths in the Split step)
  return [
    { ...cyl('Staff', 15, 15, L, [0, -L / 2, 0], { color: C.steel, filament: o.fil_staff, separate: 'staff' }), joint: 'thread' },
    cyl('Staff peg', socketR - 0.3, socketR - 0.3, 48, [0, 20, 0], { color: C.steel, filament: o.fil_staff, separate: 'staff' }),
    lathe('Staff end cap', [P(17, -L + 2), P(18, -L - 14, 'c'), P(10, -L - 30, 'c'), P(0, -L - 34)], { color: C.black, filament: o.fil_trim, separate: 'staff' }),
  ];
}

// eye zones on both faces of the topper
function eyeZones(o, { y, z, r, stretch }) {
  const parts = [];
  for (const s of [-1, 1]) {
    parts.push(zone('Eye white', { ...sphere('', r + 0.6, [0, y, s * z]), stretch: [1, stretch, 1] }, o.fil_eye));
    parts.push(zone('Iris', { ...cyl('', r * 0.62, r * 0.62, r + 2, [0, y, s * (z + r * 0.55)], { rot: [90, 0, 0] }), stretch: [1, 1, stretch * 0.95] }, o.fil_iris));
    parts.push(zone('Pupil', { ...cyl('', r * 0.26, r * 0.26, r + 3, [0, y, s * (z + r * 0.6)], { rot: [90, 0, 0] }), stretch: [1, 1, stretch * 0.9] }, o.fil_trim));
  }
  return parts;
}

// ---------------------------------------------------------------------
// Your model
const MODEL_KEYS = ['maka_top', 'maka_shim', 'maka_shim2', 'maka_button', 'maka_pin'];

const modelVariant = {
  label: 'Your model',
  groups: () => [
    sizeGroup({ hint: 'Scales everything, including the slot and the 17 mm rod socket. Keep 100% to fit a 17 mm rod.' }),
    group('Blade type', [
      toggle('board', 'Use a board blade instead (prints your blade shims)', false, { random: false,
        hint: 'Your original build: a wooden or foam-board blade packed into the slot with the 2 mm and 3 mm shims.' }),
    ]),
    { ...bladeGroup(), show: (o) => !o.board },
    group('Topper', [
      toggle('eyeColour', 'Print the eye in colour (white, red iris, black pupil)', true, { random: false }),
      toggle('bandColour', 'Black band at the bottom', true, { random: false }),
    ]),
    staffGroup('rod'),
    group('Extras', [toggle('buttons', 'Soul\'s cuff buttons', true, { random: false })]),
    group('Colours', [
      fil('fil_top', 'Topper', 3), fil('fil_blade', 'Blade', 1, { show: (o) => !o.board }), fil('fil_teeth', 'Teeth', 2, { show: (o) => o.teethOn && !o.board }),
      fil('fil_eye', 'Eye white', 4, { show: (o) => o.eyeColour }), fil('fil_iris', 'Iris', 2, { show: (o) => o.eyeColour }),
      fil('fil_trim', 'Pupil, band, end cap', 1), fil('fil_staff', 'Staff', 3, { show: (o) => o.staff === 'printed' }),
    ]),
  ],
  build(o) {
    const parts = [meshPart('Scythe topper', 'maka_top', { filament: o.fil_top })];
    if (o.eyeColour) parts.push(...eyeZones(o, { y: 105, z: 15, r: 15, stretch: 3.5 }));
    if (o.bandColour) parts.push(zone('Bottom band', cyl('', 24, 24, 47, [0, 23.5, 0]), o.fil_trim));
    if (!o.board) parts.push(...bladeParts(o));
    parts.push(...staffParts(o));
    if (o.board) {
      // shims that pack a board blade (instead of the printed one) in the slot
      parts.push({ ...meshPart('Blade shim (2 mm)', 'maka_shim', { color: C.wood, filament: o.fil_top, separate: true }), pos: [-240, -230, 0] });
      parts.push({ ...meshPart('Blade shim (3 mm)', 'maka_shim2', { color: C.wood, filament: o.fil_top, separate: true }), pos: [-240, -230, 0] });
    }
    if (o.buttons) {
      // laid out behind the topper
      parts.push({ ...meshPart('Cuff button', 'maka_button', { color: C.white, filament: o.fil_eye, separate: true }), pos: [-260, -40, 0] });
      parts.push({ ...meshPart('Cuff button pin', 'maka_pin', { color: C.dark, filament: o.fil_trim, separate: true }), pos: [-260, -40, 0] });
    }
    const d = design('Maka\'s Scythe', parts, { meta: { bayPos: [0, 120, 0], baySize: [14, 60, 14] } });
    d.filaments = PALETTE();
    return d;
  },
};

// ---------------------------------------------------------------------
// Generated: topper, blade and staff
const EYES = { almond: { r: 15, stretch: 3.5 }, round: { r: 17, stretch: 1.4 }, slit: { r: 12, stretch: 4.6 } };

const eyeIcon = (e) => {
  const s = EYES[e];
  const body = [[-9, -14], [9, -14], [9, 14], [-9, 14]];
  if (!s) return icon(body);
  const k = 7.5 / s.r;
  const eye = circlePoly(s.r * k * 0.8, 32).map(([x, y]) => [x, y * Math.min(1.8, s.stretch * 0.5)]);
  return icon(body, { poly: eye, color: '#ecebe6' }, { poly: circlePoly(2.6, 16).map(([x, y]) => [x, y * Math.min(1.8, s.stretch * 0.5)]), color: '#c4262e' });
};

const generatedVariant = {
  label: 'Scythe',
  groups: () => [
    sizeGroup(),
    bladeGroup(),
    group('Topper', [
      choice('eye', 'Eye on the topper', ['none', 'almond', 'round', 'slit'].map((v) => ({ v, label: v[0].toUpperCase() + v.slice(1), icon: eyeIcon(v), weight: v === 'none' ? 3 : 1 })), 'none'),
      range('topH', 'Topper height', 140, 230, 178, { rand: [160, 200] }),
      range('finHoles', 'Holes in the back fin', 0, 4, 2, { unit: '', rand: [0, 4] }),
      toggle('eyeColour', 'Print the eye in colour', true, { random: false, show: (o) => o.eye !== 'none' }),
      toggle('bandColour', 'Dark band at the bottom', true),
    ]),
    staffGroup('printed'),
    group('Colours', [
      fil('fil_top', 'Topper', 3), fil('fil_blade', 'Blade', 1), fil('fil_teeth', 'Teeth', 2, { show: (o) => o.teethOn }),
      fil('fil_eye', 'Eye white', 4, { show: (o) => o.eyeColour && o.eye !== 'none' }), fil('fil_iris', 'Iris', 2, { show: (o) => o.eyeColour && o.eye !== 'none' }),
      fil('fil_trim', 'Pupil, band, end cap', 1), fil('fil_staff', 'Staff', 3, { show: (o) => o.staff === 'printed' }),
    ]),
  ],
  build(o) {
    const r = 22.5, H = o.topH, k = H / 178.5;
    const slot = { y0: 52.5 * k, y1: 157.5 * k, w: 15, depth: 22 };
    const bodyId = 'topper';
    const cap = 15;
    const parts = [{
      ...lathe('Topper', [P(r, 0), P(r, H - cap - 1.5), P(r - 1.5, H - cap - 1.5), P(r - 1.5, H - cap), P(r, H - cap), P(r, H - 1.2), P(r - 1.2, H)], { color: C.steel, filament: o.fil_top, sides: 72 }),
      id: bodyId,
    }];
    parts.push(box('Blade slot', [slot.depth + 10, slot.y1 - slot.y0, slot.w], [r - slot.depth + (slot.depth + 10) / 2, (slot.y0 + slot.y1) / 2, 0], { op: 'subtract', target: bodyId }));
    parts.push(box('Cap slot', [9, 10, 2 * r + 4], [0, H - 4, 0], { op: 'subtract', target: bodyId }));
    parts.push(cyl('Rod socket', 8.5, 8.5, 90, [0, 0, 0], { op: 'subtract', target: bodyId }));
    // back fin with holes
    const finId = 'fin';
    parts.push({ ...blade('Back fin', [P(-r + 2, slot.y0), P(-r + 2, slot.y1), P(-r - 22, slot.y1), P(-r - 22, slot.y0 + 38), P(-r - 8, slot.y0 + 14, 'c'), P(-r - 3, slot.y0)], { thickness: 15, edge: 15, bevel: 0, color: C.steel, filament: o.fil_top }), id: finId });
    const nh = o.finHoles | 0;
    for (let i = 0; i < nh; i++) {
      const y = slot.y1 - 15 - i * ((slot.y1 - slot.y0 - 45) / Math.max(1, nh - 1 || 1));
      parts.push(holePart(`Fin hole ${i + 1}`, 6.75, [-r - 11, nh === 1 ? (slot.y0 + slot.y1) / 2 + 10 : y, 0], 30, { target: finId }));
    }
    // eyes on both faces
    const e = EYES[o.eye];
    if (e) {
      for (const s of [-1, 1]) parts.push({ ...sphere('Eye', e.r, [0, 105 * k, s * 15]), stretch: [1, e.stretch * k, 1], color: C.white, filament: o.fil_top });
      if (o.eyeColour) parts.push(...eyeZones(o, { y: 105 * k, z: 15, r: e.r, stretch: e.stretch * k }));
    }
    if (o.bandColour) parts.push(zone('Bottom band', cyl('', 24, 24, slot.y0 - 6, [0, (slot.y0 - 6) / 2, 0]), o.fil_trim));
    parts.push(...bladeParts(o, slot, r));
    parts.push(...staffParts(o));
    const d = design('Scythe', parts, { meta: { bayPos: [0, 120, 0], baySize: [14, 60, 14] } });
    d.filaments = PALETTE();
    return d;
  },
};

export const scythe = {
  id: 'maka-scythe-parts',
  name: 'Maka\'s Scythe', category: 'Soul Eater', source: 'Soul Eater',
  blurb: 'Your eye topper with a printable blade (red teeth in a second filament) that slides into its slot, plus Soul\'s cuff buttons.',
  credit: 'Your model · thingiverse.com/thing:1863433 (blade drawn from your photos)',
  models: MODEL_KEYS,
  // topper plus the default printed blade
  thumb: () => [...thumbOf(['maka_top'], [C.steel]), { poly: bladeOutlineWorld({ ...defaultsOf(modelVariant.groups()) }, SLOT, 22.5).map(([x, y]) => [x, y]), color: '#2b2d31' }],
  variants: { model: modelVariant },
};

export const scytheGen = {
  id: 'gen-scythe', generator: true,
  name: 'Scythe', type: 'scythe',
  blurb: 'Blade shape, toothed two-colour edge, topper and a take-apart printed staff.',
  models: [],
  variants: { generated: generatedVariant },
};
