// Buster Sword (Final Fantasy VII), from the creator's 1:1 model
// (Thingiverse 1794243), with options of its own: proportions, materia
// (filament or resin, optionally lit by LEDs) and strengthening.
import { COLORS as C, P, box, cyl, lathe, dowel, bay, design } from '../templates/helpers.js';
import { choice, range, toggle, fil, group, sizeGroup, sectionWarp, circlePoly, icon, hole } from './core.js';
import { meshPart, zone, palette, thumbOf } from './parts.js';

const PALETTE = () => palette(['Silver', '#9aa2ad'], ['Dark grey', '#4a4f57'], ['Brown (grip)', '#5a3b26'], ['Green (materia)', '#3fae5a']);

const dowelChoice = (def = 12.7, hint = 'A hardwood dowel from the pommel up into the blade keeps a long grip from snapping at the guard.') => choice('dowel', 'Wooden dowel through the grip', [
  { v: 'none', label: 'None' }, { v: 9.53, label: '3/8 in' }, { v: 12.7, label: '1/2 in' }, { v: 15.88, label: '5/8 in' },
], def, { random: false, hint });

const MATERIA_Y = [45, 135]; // centres of the two through-holes (r 20.1)

const materiaIcon = (fillColor, lit) => icon(blockIcon(),
  ...[4, 12].flatMap((y) => [
    fillColor ? { poly: circlePoly(3, 16, 0, y), color: fillColor } : hole(circlePoly(3, 16, 0, y)),
    ...(lit ? [{ poly: circlePoly(1.1, 10, 0, y), color: '#fff6b0' }] : []),
  ]));

// One materia dome, lying on +Z (rot turns it to face front or back): the
// outer ball (r 19.7) above a flat face at z 2.75, with a solid rim band
// (z 2.75…6, from r 13 out) for the magnets. Hollow ones let LED light in.
function domeProfile(hollow) {
  const R = 19.7, z0 = 2.75, zb = 6, ri = 17.3, rin = 13;
  const pts = [];
  const outer = (i, n) => { const a = Math.asin(z0 / R) + (Math.PI / 2 - Math.asin(z0 / R)) * (i / n); return P(R * Math.cos(a), R * Math.sin(a)); };
  if (!hollow) {
    pts.push(P(0, z0), P(Math.sqrt(R * R - z0 * z0), z0));
    for (let i = 1; i <= 16; i++) pts.push(outer(i, 16));
    return { pts, ring: false };
  }
  pts.push(P(rin, z0), P(Math.sqrt(R * R - z0 * z0), z0));
  for (let i = 1; i <= 16; i++) pts.push(outer(i, 16));
  for (let i = 0; i <= 16; i++) { const a = Math.PI / 2 - (Math.PI / 2 - Math.asin(zb / ri)) * (i / 16); pts.push(P(ri * Math.cos(a), ri * Math.sin(a))); }
  pts.push(P(rin, zb));
  return { pts, ring: true };
}

// Materia that come off: each hole gets a seat ring (part of the blade, in
// the middle of its thickness) and two domes, front and back, that sit on
// it and are held by 4 x 2 mm disc magnets. With LEDs, a 5 mm LED lies in
// the seat at 3 o'clock, pointing at the centre, its wires running straight
// out to the battery bay. `k` turns real millimetres into model units.
const SEAT = { rOut: 20.4, rIn: 13.5, half: 2.7, magR: 16.75 };
function materiaParts(o, at, k) {
  const parts = [];
  if (o.materia === 'open') return parts;
  const resin = o.materia === 'resin';
  const hollow = resin || o.led;
  const mag = { r: 2.1 * k, depth: 2.2 * k };
  at.forEach(([x, y, z], i) => {
    const n = i + 1;
    const seatId = `seat${i}`;
    parts.push({ ...cyl(`Materia ${n} seat`, SEAT.rOut, SEAT.rOut, SEAT.half * 2, [x, y, z], { rot: [90, 0, 0], sides: 64, filament: o.fil_blade }), id: seatId });
    parts.push(cyl(`Materia ${n} seat opening`, SEAT.rIn, SEAT.rIn, 10, [x, y, z], { rot: [90, 0, 0], sides: 64, op: 'subtract', target: seatId }));
    // magnets at 12 and 6 o'clock, both faces of the seat and of each dome
    const spots = [90, 270].map((a) => [x + SEAT.magR * Math.cos((a * Math.PI) / 180), y + SEAT.magR * Math.sin((a * Math.PI) / 180)]);
    for (const [px, py] of spots) for (const sz of [-1, 1]) {
      parts.push(cyl(`Materia ${n} seat magnet`, mag.r, mag.r, mag.depth + 1, [px, py, z + sz * (SEAT.half - mag.depth / 2 + 0.5)], { rot: [90, 0, 0], sides: 24, op: 'subtract', target: seatId }));
    }
    if (o.led) parts.push(cyl(`Materia ${n} LED socket`, 2.65 * k, 2.65 * k, 11, [x + SEAT.rIn + 5, y, z], { rot: [0, 0, 90], sides: 24, op: 'subtract' }));
    const prof = domeProfile(hollow);
    for (const sz of [1, -1]) {
      const id = `dome${i}${sz > 0 ? 'f' : 'b'}`;
      const name = `Materia ${n} ${sz > 0 ? 'front' : 'back'}`;
      parts.push({
        ...lathe(name, prof.pts, { closedRing: prof.ring, sides: 72, color: '#3fae5a', filament: o.fil_materia, separate: true }),
        id, pos: [x, y, z], rot: [sz > 0 ? 90 : -90, 0, 0], ...(resin ? { resin: true } : {}),
      });
      for (const [px, py] of spots) parts.push(cyl(`${name} magnet`, mag.r, mag.r, mag.depth + 1, [px, py, z + sz * (2.75 + mag.depth / 2 - 0.5)], { rot: [90, 0, 0], sides: 24, op: 'subtract', target: id }));
    }
  });
  return parts;
}

// LED wiring: a straight 8 mm channel from each LED socket to a battery bay
// in the back of the blade beside the materia (3 x AAA box or 18650 holder),
// with a magnetic lid and a hole for a 7 mm push-button switch.
function ledFeatures(o, pt, ys, sc) {
  if (o.materia === 'open' || !o.led) return [];
  const yMid = (ys[0] + ys[1]) / 2;
  const height = Math.round((ys[1] - ys[0]) * sc + 30);
  const out = ys.map((y, i) => dowel(`LED wire channel ${i + 1}`, pt([21, y, 0]), pt([44, y, -3]), 8, { id: `k-led-wire-${i + 1}`, clearance: 0 }));
  out.push({
    // the blade is 41 mm thick here (z ±20.6, engraving 2.2 mm deep): a
    // 24.5 mm deep bay leaves a 3–5 mm lid on the back and 9+ mm in front.
    // x 34…74 plus the 7 mm ledge keeps 7 mm of wall to the materia holes
    // and clear of the steel rods at x ±90
    ...bay('LED battery bay', pt([54, yMid, -3.25]), [40, height, 24.5], {
      lid: { side: '-z', ledge: 7, magnets: { enabled: true, diameter: 5.2, depth: 2.2 }, switchHole: o.ledSwitch ? { d: 7.2, offset: [0, height / 2 - 12] } : null },
    }),
    id: 'k-led-bay',
  });
  return out;
}

const LED_NOTES = [
  'Materia magnets: 16 × 4 × 2 mm neodymium discs (2 per seat face, 2 per dome). Check polarity before gluing: every dome must stick to its seat.',
  'LEDs: 2 × 5 mm wide-angle ("straw hat") or diffused LEDs in your materia colour, one resistor each (100 Ω on 3 × AAA for green / blue / white, 150 Ω for red / yellow), and a 2-pin JST-PH plug + socket per LED so they unplug at the bay.',
  'Battery: a 3 × AAA box with a built-in switch (about 48 × 36 × 14 mm) fits the bay; or an 18650 holder (77 × 21 × 20 mm) with a protected cell and 68 Ω resistors. Two LEDs at 15 mA run about 30 hours on alkaline AAAs.',
];
const LED_STEPS = [
  'LED materia: solder each LED to its resistor and JST plug with about 15 cm of thin wire, then feed the plug from the materia hole along the channel into the bay before the blade pieces are glued.',
  'Push the LED into its seat socket (3 o\'clock) with the dome pointing at the centre; a dab of hot glue holds it and still comes off.',
  'Sand the inside of the resin domes (or use frosted / translucent resin) so they glow instead of showing a bright dot. Glue the magnets into the seats and domes, then click the domes on from each face.',
  'Battery bay: the lid on the back of the blade lifts off (4 magnets). Test the circuit before closing it up.',
];

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
      ], 'open', { hint: 'Each materia is two domes (front and back) that click onto a seat inside the hole with small magnets, so they come off to swap colours or reach an LED. Resin domes go in their own "resin" folder on export.' }),
      toggle('led', 'Light them up (LEDs)', false, {
        show: (o) => o.materia !== 'open',
        hint: 'Adds a 5 mm LED socket in each seat, a straight wire channel to a battery bay on the back of the blade (magnetic lid, fits a 3 × AAA box or an 18650 holder) and hollow domes. Print the domes in clear or translucent resin / filament.',
      }),
      toggle('ledSwitch', 'Hole in the bay lid for a 7 mm push-button switch', true, { show: (o) => o.materia !== 'open' && o.led, random: false }),
    ]),
    group('Strength', [
      dowelChoice(12.7, 'From the pommel into the base of the blade (it stops just below the materia holes).'),
      choice('rods', 'Steel rods up the blade', [{ v: 'none', label: 'None' }, { v: 6, label: '2 × 6 mm' }, { v: 8, label: '2 × 8 mm' }], 6,
        { hint: 'Two rods near the edges, from inside the hilt to 70 cm up the blade, so the blade pieces cannot snap apart at the joints.' }),
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
      ...materiaParts(o, MATERIA_Y.map((y) => [0, w.mapY(y), 0]), 100 / (o.size || 100)),
    ];
    const features = [];
    if (o.dowel !== 'none') features.push(dowel('Handle dowel', [0, w.mapY(-484), 0], [0, 18, 0], +o.dowel, { id: 'k-dowel' }));
    if (o.rods !== 'none') for (const s of [-1, 1]) features.push(dowel(s < 0 ? 'Blade rod (left)' : 'Blade rod (right)', w.point([s * 90, -48, 0]), w.point([s * 90, 700, 0]), +o.rods, { id: s < 0 ? 'k-rod-l' : 'k-rod-r', clearance: 0.2 }));
    features.push(...ledFeatures(o, w.point, MATERIA_Y.map((y) => w.mapY(y)), (o.size || 100) / 100));
    const d = design('Buster Sword', parts, { features, meta: { bayPos: [0, w.mapY(300), 0], baySize: [70, 40, 20] } });
    // auto-split keeps its cuts clear of the materia (and the LED bay)
    if (o.materia !== 'open') d.meta.keepOut = [[w.mapY(MATERIA_Y[0]) - 32, w.mapY(MATERIA_Y[1]) + 32]];
    if (o.materia !== 'open') {
      d.meta.notes = o.led ? LED_NOTES : [LED_NOTES[0]];
      d.meta.steps = o.led ? LED_STEPS : ['Materia: glue the magnets into the seats and the domes (check polarity), then click the domes on from each face.'];
    }
    d.filaments = PALETTE();
    return d;
  },
};

function blockIcon() { return [[-8, -2], [8, -2], [8, 20], [-8, 20]]; }

export const buster = {
  id: 'buster-sword-model',
  name: 'Buster Sword', category: 'Final Fantasy', source: 'Final Fantasy VII / Crisis Core',
  blurb: '1:1, 1.8 m. Magnetic materia domes in filament or resin, with optional LED lights and a battery bay beside them.',
  credit: 'Your model · thingiverse.com/thing:1794243',
  models: ['buster'],
  thumb: () => thumbOf(['buster'], [C.steel]),
  variants: { model: modelVariant },
};

