// Generic scythe: a long snath (staff) that comes apart, a head (collar)
// that slips onto its top, and a curved blade. Original shapes, not tied to
// any one character's weapon.
import { COLORS as C, P, blade, cyl, sphere, lathe, design } from '../templates/helpers.js';
import { choice, range, toggle, fil, group, sizeGroup, icon } from './core.js';
import { palette } from './parts.js';
import { staffStrength, fixStaff, coreChannel, apartPlan, staffNotes, staffSteps } from './staff.js';

const PALETTE = () => palette(['Silver', '#9aa2ad'], ['Dark wood', '#5b3a22'], ['Black', '#2b2d31'], ['Gold', '#c9a23f']);

const SHAPES = {
  reaper: { a: 2.4, b: 1.6, belly: 0.06, rise: 0.08, drop: 0.36, h: 1 },
  hooked: { a: 5, b: 3, belly: 0.1, rise: 0.03, drop: 0.32, h: 0.9 },
  broad: { a: 2, b: 1.3, belly: 0.4, rise: 0.05, drop: 0.3, h: 1.3 },
  crescent: { a: 1.6, b: 2, belly: 0.25, rise: 0.12, drop: 0.55, h: 0.85 },
};

// Blade outline lying along +x from its root at (0, 0): spine on top, the
// cutting edge underneath (on the inside of the curve).
function bladeWorld(o) {
  const sh = SHAPES[o.shape] || SHAPES.reaper;
  const L = o.bladeLen, H = o.bladeH * sh.h;
  const notch = (t) => {
    if (o.spine === 'plain' || t < 0.12 || t > 0.72) return 0;
    const u = ((t - 0.12) / 0.6) * o.spineN;
    const f = u % 1;
    return (o.spine === 'spiked' ? 18 : 7) * (f < 0.5 ? f * 2 : (1 - f) * 2);
  };
  const spine = (t) => sh.rise * L * Math.sin(Math.PI * Math.min(1, t * 1.3)) * (1 - t) - sh.drop * L * t ** sh.a;
  const height = (t) => H * (1 + sh.belly * Math.sin(Math.PI * t)) * (1 - t ** sh.b);
  const N = o.spine === 'plain' ? 18 : 60;
  const top = [], bottom = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    top.push([L * t, spine(t) + notch(t)]);
    bottom.push([L * t, spine(t) - height(t)]);
  }
  // root (overlaps into the collar), bottom edge out to the point, back along the spine
  const pts = [[-12, -H, ''], [0, -H, '']];
  for (let i = 1; i < N; i++) pts.push([bottom[i][0], bottom[i][1], 'sc']);
  pts.push([L, spine(1), 's']);
  for (let i = N - 1; i >= 1; i--) pts.push([top[i][0], top[i][1], o.spine === 'plain' ? 'c' : '']);
  pts.push([0, 0, ''], [-12, 0, '']);
  return { pts, H };
}

// The blade is built lying along local +y and turned into place, so the
// grind's taper runs from the root to the point.
const toLocal = (pts) => pts.map(([x, y, f]) => P(-y, x, f));

const bladeIcon = (shape) => icon(bladeWorld({ shape, bladeLen: 800, bladeH: 120, spine: 'plain', spineN: 6 }).pts.map(([x, y]) => [x, y]));
const spineIcon = (spine) => icon(bladeWorld({ shape: 'reaper', bladeLen: 800, bladeH: 120, spine, spineN: 6 }).pts.map(([x, y]) => [x, y]));

const variant = {
  label: 'Scythe',
  groups: () => [
    sizeGroup(),
    group('Blade', [
      choice('shape', 'Shape', [
        { v: 'reaper', label: 'Reaper', icon: bladeIcon('reaper'), weight: 3 },
        { v: 'hooked', label: 'Hooked', icon: bladeIcon('hooked'), weight: 2 },
        { v: 'broad', label: 'Broad', icon: bladeIcon('broad'), weight: 2 },
        { v: 'crescent', label: 'Deep crescent', icon: bladeIcon('crescent'), weight: 2 },
      ], 'reaper'),
      range('bladeLen', 'Blade length', 450, 1100, 780, { step: 10, rand: [600, 950] }),
      range('bladeH', 'Blade width at the root', 70, 200, 120, { rand: [90, 160] }),
      range('angle', 'Blade angle', 0, 75, 8, { unit: '°', rand: [0, 25], hint: '0° sticks straight out from the staff like a field scythe; tilt it up for a war scythe.' }),
      toggle('double', 'A blade on each side', false, { p: 0.2 }),
      choice('spine', 'Back of the blade', [
        { v: 'plain', label: 'Plain', icon: spineIcon('plain'), weight: 3 },
        { v: 'notched', label: 'Notched', icon: spineIcon('notched') },
        { v: 'spiked', label: 'Spiked', icon: spineIcon('spiked') },
      ], 'plain'),
      range('spineN', 'Notches', 3, 12, 6, { unit: '', show: (o) => o.spine !== 'plain', rand: [4, 9] }),
      range('thickness', 'Thickness', 6, 16, 10, { step: 0.5, rand: [8, 13] }),
      range('bevel', 'Edge grind width', 8, 45, 22, { rand: [14, 32] }),
    ]),
    group('Head and staff', [
      choice('finial', 'Top of the head', [{ v: 'spike', label: 'Spike', weight: 2 }, { v: 'ball', label: 'Ball' }, { v: 'cap', label: 'Rounded cap', weight: 2 }, { v: 'none', label: 'Flat' }], 'cap'),
      range('staffLen', 'Staff length', 1000, 1800, 1450, { step: 10, rand: [1300, 1600], hint: 'Many conventions allow staffs and polearms up to about 180 cm overall.' }),
      range('staffD', 'Staff thickness', 26, 44, 32, { unit: 'mm Ø', rand: [28, 36] }),
      choice('grips', 'Grips on the staff', [{ v: 'none', label: 'None', weight: 3 }, { v: 'two', label: 'Two (like a field scythe)' }], 'none'),
      choice('butt', 'Bottom of the staff', [{ v: 'cap', label: 'Rounded cap', weight: 2 }, { v: 'spike', label: 'Spike' }, { v: 'ring', label: 'Ferrule' }], 'cap'),
    ]),
    group('Strength', staffStrength({ apart: 2, core: 'dowel12' })),
    group('Colours', [fil('fil_blade', 'Blade', 1), fil('fil_staff', 'Staff', 2), fil('fil_fittings', 'Head and fittings', 3)]),
  ],
  tidy(o) {
    if (o.double && o.angle > 40) o.angle = 20;
    return o;
  },
  fix: (o) => fixStaff(o),
  build(o) {
    const rS = o.staffD / 2, L = o.staffLen;
    const fit = { color: C.dark, filament: o.fil_fittings };
    const { pts, H } = bladeWorld(o);
    const Hc = H + 40; // collar height
    const headId = 'head';
    const parts = [];
    // collar (the head) with a socket for the staff's peg
    const rc = rS + 7;
    parts.push({ ...lathe('Head', [P(rc + 3, 8), P(rc + 3, 0), P(rc, -4), P(rc, -Hc + 6), P(rc + 3, -Hc + 2), P(rc + 3, -Hc)], { ...fit, sides: 64 }), id: headId });
    const pegR = rS * 0.62;
    parts.push(cyl('Staff socket', pegR + 0.25, pegR + 0.25, Hc - 10, [0, -Hc + (Hc - 10) / 2 - 1, 0], { op: 'subtract', target: headId }));
    if (o.finial === 'spike') parts.push(lathe('Top spike', [P(rc, 7), P(rc * 0.55, 30, 'c'), P(0, 110)], fit));
    else if (o.finial === 'ball') parts.push(sphere('Top ball', rc * 1.15, [0, 8 + rc * 0.8, 0], fit));
    else if (o.finial === 'cap') parts.push(lathe('Top cap', [P(rc + 3, 7), P(rc + 2, 18, 'c'), P(rc * 0.6, 30, 'c'), P(0, 33)], fit));
    // blade(s), rooted in the side of the head and turned up by the blade angle
    const bladePart = {
      ...blade('Blade', toLocal(pts), { thickness: o.thickness, edge: 2.2, bevel: o.bevel, tipThickness: Math.max(4, o.thickness * 0.6), color: C.steel, filament: o.fil_blade }),
      rot: [0, 0, o.angle - 90], pos: [rc - 4, -6, 0],
    };
    if (o.double) bladePart.copies = { mode: 'mirrorX', count: 2 };
    parts.push(bladePart);
    // the staff: its own piece (cut into screw-together lengths in the Split step)
    const st = { color: C.wood, filament: o.fil_staff, separate: 'staff' };
    parts.push({ ...cyl('Staff', rS, rS, L, [0, -Hc - L / 2, 0], st), ...apartPlan(o) });
    parts.push(cyl('Staff peg', pegR, pegR, Hc - 12, [0, -Hc + (Hc - 12) / 2 - 2, 0], st));
    // the core runs from the butt up through the peg into the head
    parts.push(...coreChannel(o, 'staff', -Hc - L - 6, -17));
    if (o.grips === 'two') {
      for (const f of [0.28, 0.62]) {
        const y = -Hc - L * f;
        parts.push(cyl('Staff grip', 11, 11, 120, [0, y, rS + 55], { ...st, rot: [90, 0, 0] }));
        parts.push(sphere('Grip knob', 15, [0, y, rS + 118], st));
      }
    }
    const yb = -Hc - L;
    const bf = { ...fit, separate: 'staff' };
    if (o.butt === 'spike') parts.push(lathe('Butt spike', [P(rS + 3, yb + 30), P(rS + 3, yb), P(rS * 0.5, yb - 30, 'c'), P(0, yb - 90)], bf));
    else if (o.butt === 'ring') parts.push(lathe('Ferrule', [P(rS + 3, yb + 45), P(rS + 3, yb + 2), P(rS, yb - 4), P(0, yb - 4)], bf));
    else parts.push(lathe('Butt cap', [P(rS + 3, yb + 25), P(rS + 3, yb), P(rS * 0.7, yb - 14, 'c'), P(0, yb - 18)], bf));
    const d = design('Scythe', parts, { meta: { bayPos: [0, -Hc - 200, 0], baySize: [16, 70, 16], notes: staffNotes(o, L + Hc - 11), steps: staffSteps(o) } });
    d.filaments = PALETTE();
    return d;
  },
};

export const reaper = {
  id: 'gen-scythe', generator: true,
  name: 'Scythe', type: 'scythe',
  blurb: 'Reaper, hooked, broad and crescent blades on a staff that comes apart, with optional grips and spikes.',
  models: [],
  variants: { generated: variant },
};
