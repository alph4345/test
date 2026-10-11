// Maka's scythe (Soul Eater): the creator's eye topper (Thingiverse
// 1863433) on its staff, with a printable blade drawn after the board blade
// in the creator's photos (black with a red toothed edge) whose tab slides
// into the topper's blade slot.
import { COLORS as C, P, blade, box, cyl, sphere, lathe, dowel, design, hole as holePart } from '../templates/helpers.js';
import { choice, range, toggle, fil, group, sizeGroup, circlePoly, icon, hole, defaultsOf } from './core.js';
import { meshPart, zone, palette, thumbOf } from './parts.js';
import { edgeLength } from '../engine/pattern.js';
import { CORES, staffStrength, fixStaff, coreChannel, apartPlan, staffNotes, staffSteps } from './staff.js';

const PALETTE = () => palette(['Black', '#2b2d31'], ['Red', '#c4262e'], ['Silver', '#9aa2ad'], ['White', '#f7f7f4']);

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

function bladeParts(o, slot = SLOT, r = 22.5) {
  const pts = bladeOutlineWorld(o, slot, r);
  const T = slot.w - 0.6; // tab fits the slot with 0.3 mm each side
  const parts = [{
    ...blade('Blade', toLocal(pts), { thickness: T, edge: 2.2, bevel: o.bevel, tipThickness: Math.max(5, T * o.tipThick / 100), color: C.black, filament: o.fil_blade, separate: true }),
    // hidden plugs, so the glued seams are straight lines to fill and sand
    rot: [0, 0, -90], joint: 'tenon',
  }];
  parts[0].id = 'blade';
  // red band along the edge with teeth pointing up into the black; it is
  // worked out from the outline, so it follows the blade when its nodes are
  // dragged. It starts 10 mm inside the topper's slot.
  if (o.teethOn) {
    const lead = Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]) + 10;
    const pattern = { type: 'teeth', teeth: o.teeth, band: o.band, toothH: o.toothH, lead, filament: o.fil_teeth };
    parts[0].pattern = { ...pattern, refLen: edgeLength(parts[0]) };
  }
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
  toggle('teethOn', 'Red toothed edge', true, { random: false, hint: 'Painted, or printed in a second filament (see "Paint or print the colours" below). It follows the blade\'s outline, also when you reshape the blade by hand.' }),
  range('teeth', 'Number of teeth', 4, 16, 9, { unit: '', show: (o) => o.teethOn, rand: [7, 12] }),
  range('band', 'Red band height', 5, 50, 22, { unit: '%', show: (o) => o.teethOn, rand: [15, 30] }),
  range('toothH', 'Tooth height', 5, 60, 30, { unit: '%', show: (o) => o.teethOn, rand: [20, 42] }),
  ...extra,
]);

const staffGroup = (def = 'printed') => group('Staff (handle)', [
  choice('staff', 'Staff', [
    { v: 'printed', label: 'Printed, comes apart' },
    { v: 'rod', label: '17 mm metal rod (bought)' },
  ], def, { random: false, hint: 'A printed staff is cut into screw-together lengths in the Split step. A metal rod or tube (17 mm, about 11/16 in) is shown see-through for size and isn\'t printed; only its end cap is.' }),
  range('staffLen', 'Staff length', 900, 1700, 1400, { step: 10, random: false, hint: 'Many conventions allow staffs and polearms up to about 180 cm overall.' }),
  range('staffD', 'Staff thickness', 22, 40, 28, { unit: 'mm Ø', show: (o) => o.staff === 'printed', random: false }),
  ...staffStrength({ apart: 2, core: 'dowel12' }).map((x) => ({ ...x, show: (o) => o.staff === 'printed' })),
]);

function staffParts(o, socketR = 8.5) {
  const L = o.staffLen;
  if (o.staff === 'rod') {
    const r = socketR - 0.1;
    return [
      { ...cyl('Metal rod (17 mm, not printed)', r, r, L + 44, [0, -L / 2 + 22, 0], { color: C.steel }), reference: true },
      { ...lathe('Staff end cap', [P(r + 0.25, -L + 22), P(r + 4, -L + 22), P(r + 5.5, -L - 4, 'c'), P(r + 1, -L - 22, 'c'), P(0, -L - 25)], { color: C.black, filament: o.fil_trim, separate: true }), id: 'endcap' },
      cyl('End cap socket', r + 0.25, r + 0.25, 30, [0, -L + 7, 0], { op: 'subtract', target: 'endcap' }),
    ];
  }
  const R = (o.staffD || 28) / 2;
  const core = CORES[o.core] || CORES.none;
  // a core too thick for a printed peg around it goes into the topper's
  // socket itself (5/8 in and 16 mm fit the 17 mm socket with a wrap of tape)
  const bare = core.d > 2 * (socketR - 0.3) - 3.2;
  // one piece of its own (cut into screw-together lengths in the Split step)
  const parts = [
    { ...cyl('Staff', R, R, L, [0, -L / 2, 0], { color: C.steel, filament: o.fil_staff, separate: 'staff' }), ...apartPlan(o) },
    lathe('Staff end cap', [P(R + 2, -L + 2), P(R + 3, -L - 14, 'c'), P(R * 0.6, -L - 30, 'c'), P(0, -L - 34)], { color: C.black, filament: o.fil_trim, separate: 'staff' }),
  ];
  if (!bare) parts.splice(1, 0, cyl('Staff peg', socketR - 0.3, socketR - 0.3, 48, [0, 20, 0], { color: C.steel, filament: o.fil_staff, separate: 'staff' }));
  else parts.push({ ...cyl(`Core (${core.label.split(' (')[0]}, not printed)`, core.d / 2, core.d / 2, 44, [0, 22, 0], { color: core.d === 16.1 ? C.steel : C.wood }), reference: true });
  parts.push(...coreChannel(o, 'staff', -L - 6, bare ? 2 : 41));
  return parts;
}

const staffCoreLen = (o) => o.staffLen + 6 + ((CORES[o.core] || CORES.none).d > 2 * 8.2 - 3.2 ? 44 : 41);

// eye zones on both faces of the topper
function eyeZones(o, { y, z, r, stretch }) {
  const parts = [];
  for (const s of [-1, 1]) {
    parts.push(zone('Eye white', { ...sphere('', r + 0.6, [0, y, s * z]), stretch: [1, stretch, 1] }, o.fil_eye, { on: 'main' }));
    parts.push(zone('Iris', { ...cyl('', r * 0.62, r * 0.62, r + 2, [0, y, s * (z + r * 0.55)], { rot: [90, 0, 0] }), stretch: [1, 1, stretch * 0.95] }, o.fil_iris, { on: 'main' }));
    parts.push(zone('Pupil', { ...cyl('', r * 0.26, r * 0.26, r + 3, [0, y, s * (z + r * 0.6)], { rot: [90, 0, 0] }), stretch: [1, 1, stretch * 0.9] }, o.fil_trim, { on: 'main' }));
  }
  return parts;
}

// ---------------------------------------------------------------------
// Your model
const MODEL_KEYS = ['maka_top', 'maka_shim', 'maka_shim2'];

const modelVariant = {
  label: 'Your model',
  fix: (o) => fixStaff(o),
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
    staffGroup('printed'),
    group('Colours', [
      fil('fil_top', 'Topper', 3), fil('fil_blade', 'Blade', 1, { show: (o) => !o.board }), fil('fil_teeth', 'Teeth', 2, { show: (o) => o.teethOn && !o.board }),
      fil('fil_eye', 'Eye white', 4, { show: (o) => o.eyeColour }), fil('fil_iris', 'Iris', 2, { show: (o) => o.eyeColour }),
      fil('fil_trim', 'Pupil, band, end cap', 1), fil('fil_staff', 'Staff', 3, { show: (o) => o.staff === 'printed' }),
    ]),
  ],
  build(o) {
    const parts = [meshPart('Scythe topper', 'maka_top', { filament: o.fil_top })];
    if (o.eyeColour) parts.push(...eyeZones(o, { y: 105, z: 15, r: 15, stretch: 3.5 }));
    if (o.bandColour) parts.push(zone('Bottom band', cyl('', 24, 24, 47, [0, 23.5, 0]), o.fil_trim, { on: 'main' }));
    if (!o.board) parts.push(...bladeParts(o));
    parts.push(...staffParts(o));
    if (o.board) {
      // shims that pack a board blade (instead of the printed one) in the slot
      parts.push({ ...meshPart('Blade shim (2 mm)', 'maka_shim', { color: C.wood, filament: o.fil_top, separate: true }), pos: [-240, -230, 0] });
      parts.push({ ...meshPart('Blade shim (3 mm)', 'maka_shim2', { color: C.wood, filament: o.fil_top, separate: true }), pos: [-240, -230, 0] });
    }
    const meta = { bayPos: [0, 120, 0], baySize: [14, 60, 14] };
    if (o.staff === 'printed') { meta.notes = staffNotes(o, staffCoreLen(o)); meta.steps = staffSteps(o); }
    const d = design('Maka\'s Scythe', parts, { meta });
    d.filaments = PALETTE();
    // full size it is printed in one colour, glued, filled and painted, with
    // grooves showing where the red and black meet
    d.finish = { colours: 'paint', lines: true };
    return d;
  },
};

export const scythe = {
  id: 'maka-scythe-parts',
  name: 'Maka\'s Scythe', category: 'Soul Eater', source: 'Soul Eater',
  blurb: 'Your eye topper on its staff, with a printable blade that slides into the topper\'s slot. The red teeth are marked with paint guide lines (or printed in colour).',
  credit: 'Your model · thingiverse.com/thing:1863433 (blade drawn from your photos)',
  models: MODEL_KEYS,
  // topper plus the default printed blade
  thumb: () => [...thumbOf(['maka_top'], [C.steel]), { poly: bladeOutlineWorld({ ...defaultsOf(modelVariant.groups()) }, SLOT, 22.5).map(([x, y]) => [x, y]), color: '#2b2d31' }],
  variants: { model: modelVariant },
};

