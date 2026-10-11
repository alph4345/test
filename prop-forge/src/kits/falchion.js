// Generic falchion: a one-handed, single-edged sword whose blade widens
// toward the point. Original outlines after the historical families
// (broad cleaver falchions, cusped, clipped "chopper" and curved messer-like
// blades), with the guard, grip and pommel a sword needs.
import { COLORS as C, P, blade, flat, box, cyl, sphere, lathe, dowel, design } from '../templates/helpers.js';
import { choice, range, toggle, fil, group, sizeGroup, circlePoly, icon } from './core.js';
import { palette, wrappedGrip, xy, clipAbove } from './parts.js';

const PALETTE = () => palette(['Silver', '#9aa2ad'], ['Dark grey', '#4a4f57'], ['Brown (grip)', '#5a3b26'], ['Brass', '#b8893a']);

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// Blade outline: spine on the right (+x), the edge on the left, starting
// 3 mm inside the guard. Returns outline points.
function bladeOutline(o) {
  const L = o.bladeLen, W0 = o.width, Wm = W0 * (o.flare / 100), sp = W0 / 2;
  const fe = o.falseEdge ? 's' : '';
  const pts = [];
  const edgeUp = (edgeX, ts) => ts.map((t) => P(edgeX(t), L * t, 'sc'));
  if (o.shape === 'clipped') {
    // straight edge, straight spine, angled clip down to a point near the edge
    const edgeX = (t) => sp - (W0 + (Wm - W0) * t);
    const yc = L * 0.74, tip = [edgeX(1) + 3, L];
    pts.push(P(edgeX(0), -3, 's'), P(sp, -3), P(sp, yc));
    pts.push(P((sp + tip[0]) / 2 + 2, (yc + L) / 2, fe));
    pts.push(P(tip[0], tip[1], 's'));
    pts.push(P(edgeX(0.5), L * 0.5, 's'));
    return pts;
  }
  if (o.shape === 'curved') {
    // the whole blade bends back toward the spine; clipped point
    const c = (t) => 0.1 * L * t * t;
    const Wt = (t) => W0 + (Wm - W0) * smooth(t / 0.85);
    const spineX = (t) => sp + c(t), edgeX = (t) => sp + c(t) - Wt(t);
    const tc = 0.8, tip = [edgeX(1) + Wt(1) * 0.18, L];
    pts.push(P(edgeX(0), -3, 's'), P(sp, -3));
    for (const t of [0.3, 0.55]) pts.push(P(spineX(t), L * t, 'c'));
    pts.push(P(spineX(tc), L * tc));
    pts.push(P((spineX(tc) + tip[0]) / 2 + Wt(1) * 0.06, L * (tc + 1) / 2, `${fe}c`));
    pts.push(P(tip[0], tip[1], 's'));
    pts.push(...edgeUp(edgeX, [0.88, 0.7, 0.5, 0.3, 0.12]));
    return pts;
  }
  // broad (cleaver falchion) and cusped: straight spine, the edge widens and
  // sweeps up into the point
  const tw = 0.78;
  const Wt = (t) => W0 + (Wm - W0) * smooth(t / tw);
  const edgeX = (t) => sp - Wt(t);
  const xe = edgeX(tw), ye = L * tw;
  let tip;
  pts.push(P(edgeX(0), -3, 's'), P(sp, -3));
  if (o.shape === 'cusped') {
    // the back swells out into a cusp, then a hollow clip rises to the point
    tip = [sp - Wm * 0.42, L];
    pts.push(P(sp, L * 0.62), P(sp + W0 * 0.08, L * 0.74, 'c'), P(sp + W0 * 0.14, L * 0.8));
    pts.push(P(sp - Wm * 0.1, L * 0.9, `${fe}c`));
    pts.push(P(tip[0], tip[1], 's'));
  } else {
    tip = [sp - 4, L];
    pts.push(P(sp, L * 0.86), P(tip[0], tip[1], 's'));
  }
  // round sweep from the point down to the widest part of the edge
  for (const u of [0.3, 0.55, 0.8]) {
    const a = (u * Math.PI) / 2;
    pts.push(P(tip[0] + (xe - tip[0]) * Math.sin(a), ye + (L - ye) * Math.cos(a), 'sc'));
  }
  pts.push(...edgeUp(edgeX, [tw, 0.55, 0.35, 0.15]));
  return pts;
}

const SHAPES = [
  { v: 'broad', label: 'Broad (cleaver)', weight: 3 },
  { v: 'cusped', label: 'Cusped', weight: 2 },
  { v: 'clipped', label: 'Clipped', weight: 2 },
  { v: 'curved', label: 'Curved', weight: 2 },
];
// icons show the upper part of the blade, where the shapes differ
const shapeIcon = (shape) => icon(clipAbove(xy(bladeOutline({ shape, bladeLen: 720, width: 55, flare: 160, falseEdge: false })), 330));

function guardIcon(style) {
  const g = {
    bar: [[-15, 1], [-11, 3], [11, 3], [15, 1], [15, 8], [11, 6], [-11, 6], [-15, 8]],
    scurve: [[-15, -2], [-4, 3], [4, 3], [15, 10], [15, 13], [4, 6], [-4, 6], [-15, 1]],
    down: [[-15, -4], [-6, 3], [6, 3], [15, -4], [15, -1], [6, 6], [-6, 6], [-15, -1]],
    disc: [[-10, 3], [10, 3], [10, 6], [-10, 6]],
    none: [[-3, 3], [3, 3], [3, 6], [-3, 6]],
  }[style];
  return icon([[-3, 6], [3, 6], [3, 22], [-7, 22], [-7, 14]], g, [[-2, -10], [2, -10], [2, 3], [-2, 3]]);
}

function pommelIcon(style) {
  const grip = [[-2, 0], [2, 0], [2, 12], [-2, 12]];
  const p = {
    wheel: circlePoly(5.5, 24, 0, -5), scent: [[-3, 0], [3, 0], [4, -4], [2.5, -9], [0, -11], [-2.5, -9], [-4, -4]],
    ball: circlePoly(4.5, 20, 0, -4), cap: circlePoly(2.8, 16, 0, 0),
  }[style];
  return icon(grip, p);
}

// Guard as a flat outline across the blade (in X/Y), `e` = half width.
function guardPoints(style, e, h) {
  const band = (centre) => {
    // a quillon bar of half-height h/2 following centre(x) out to both ends
    const xs = [];
    for (let i = 0; i <= 8; i++) xs.push(-e + (2 * e * i) / 8);
    const top = xs.map((x) => P(x, centre(x) + h / 2, 'c'));
    const bottom = xs.map((x) => P(x, centre(x) - h / 2, 'c')).reverse();
    top[0] = { ...top[0], c: undefined }; top[8] = { ...top[8], c: undefined };
    bottom[0] = { ...bottom[0], c: undefined }; bottom[8] = { ...bottom[8], c: undefined };
    return [...bottom.reverse(), ...top.reverse()];
  };
  const u = (x) => Math.max(0, (Math.abs(x) - 14) / (e - 14));
  if (style === 'scurve') return band((x) => -h / 2 + Math.sign(x) * 20 * u(x) ** 2);
  if (style === 'down') return band((x) => -h / 2 - 24 * u(x) ** 2);
  // straight bar that flares at the ends
  const f = h * 0.45;
  return [P(-e, -h - f), P(-e + 28, -h), P(e - 28, -h), P(e, -h - f), P(e, f), P(e - 28, 0), P(-e + 28, 0), P(-e, f)];
}

const variant = {
  label: 'Falchion',
  groups: () => [
    sizeGroup(),
    group('Blade', [
      choice('shape', 'Shape', SHAPES.map((s) => ({ ...s, icon: shapeIcon(s.v) })), 'broad'),
      range('bladeLen', 'Blade length', 450, 950, 720, { step: 5, rand: [600, 820] }),
      range('width', 'Width at the guard', 36, 90, 55, { rand: [44, 66] }),
      range('flare', 'Width at the widest', 100, 220, 160, { unit: '%', rand: [125, 185], hint: 'How much wider the blade gets toward the point.' }),
      range('thickness', 'Thickness', 6, 16, 9, { step: 0.5, rand: [8, 11], hint: 'Real falchions are 4–6 mm; 8–10 mm prints stiff enough for a prop and still holds a 4 mm rod.' }),
      range('bevel', 'Edge grind width', 8, 40, 20, { rand: [14, 28] }),
      toggle('falseEdge', 'Sharpen the clip (false edge)', true, { show: (o) => o.shape !== 'broad', p: 0.6 }),
      choice('fuller', 'Fuller (groove)', [{ v: 'none', label: 'None', weight: 2 }, { v: 'spine', label: 'Along the spine', weight: 2 }, { v: 'two', label: 'Two narrow' }], 'spine'),
    ]),
    group('Guard', [
      choice('guard', 'Handguard', ['bar', 'scurve', 'down', 'disc', 'none'].map((v) => ({
        v, label: { bar: 'Flared bar', scurve: 'S-curve', down: 'Curved down', disc: 'Disc', none: 'Collar only' }[v],
        icon: guardIcon(v), weight: { bar: 3, scurve: 2, down: 2, disc: 1, none: 0.4 }[v],
      })), 'bar'),
      range('guardW', 'Guard width', 110, 280, 190, { show: (o) => ['bar', 'scurve', 'down'].includes(o.guard), rand: [150, 230] }),
      range('guardH', 'Guard height', 8, 24, 13, { show: (o) => ['bar', 'scurve', 'down'].includes(o.guard), rand: [10, 18] }),
    ]),
    group('Grip and pommel', [
      range('gripLen', 'Grip length', 90, 200, 120, { step: 2, rand: [100, 150], hint: '100–120 mm is one hand; 150 mm and up is hand-and-a-half.' }),
      range('gripR', 'Grip thickness', 24, 36, 28, { unit: 'mm Ø', rand: [26, 31] }),
      choice('wrap', 'Grip surface', [{ v: 'smooth', label: 'Bare (wrap with real leather or cord)', weight: 2 }, { v: 'ridges', label: 'Printed ridges' }], 'smooth'),
      choice('pommel', 'Pommel', ['wheel', 'scent', 'ball', 'cap'].map((v) => ({ v, label: { wheel: 'Wheel', scent: 'Scent stopper', ball: 'Ball', cap: 'Cap' }[v], icon: pommelIcon(v), weight: { wheel: 3, scent: 2, ball: 1, cap: 1 }[v] })), 'wheel'),
    ]),
    group('Strength', [
      choice('dowel', 'Wooden dowel through the grip', [{ v: 'none', label: 'None' }, { v: 9.53, label: '3/8 in' }, { v: 12.7, label: '1/2 in' }], 9.53, { random: false }),
      choice('rod', 'Steel rod up the blade', [{ v: 'none', label: 'None' }, { v: 3, label: '3 mm' }, { v: 4, label: '4 mm' }, { v: 6, label: '6 mm' }], 4,
        { random: false, hint: 'From the grip to 60% up the blade, close to the spine where the blade is thickest. Thin blades get a thinner rod automatically.' }),
    ]),
    group('Colours', [fil('fil_blade', 'Blade', 1), fil('fil_hilt', 'Guard', 2), fil('fil_grip', 'Grip', 3), fil('fil_pommel', 'Pommel', 2)]),
  ],
  tidy(o) {
    if (o.shape === 'curved' && o.flare > 170) o.flare = 160;
    return o;
  },
  build(o) {
    const T = o.thickness, W0 = o.width, L = o.bladeLen, sp = W0 / 2;
    const bladeId = 'blade';
    const parts = [{ ...blade('Blade', bladeOutline(o), { thickness: T, edge: 2, bevel: o.bevel, tipThickness: Math.max(4, T * 0.7), color: C.steel, filament: o.fil_blade }), id: bladeId }];
    // fullers: shallow grooves on both faces, by the spine
    if (o.fuller !== 'none') {
      const y0 = 25, y1 = L * 0.55;
      const fw = W0 * (o.fuller === 'two' ? 0.08 : 0.16), depth = Math.min(1.6, T * 0.18);
      const xs = o.fuller === 'two' ? [sp - W0 * 0.2, sp - W0 * 0.36] : [sp - W0 * 0.28];
      for (const x of xs) for (const z of [-1, 1]) parts.push(box('Fuller', [fw, y1 - y0, depth * 2], [x, (y0 + y1) / 2, z * T / 2], { op: 'subtract', target: bladeId }));
    }
    // guard
    const gc = { color: C.dark, filament: o.fil_hilt };
    const gt = T + 10;
    let gh;
    if (['bar', 'scurve', 'down'].includes(o.guard)) {
      gh = o.guardH;
      parts.push(flat('Guard', guardPoints(o.guard, Math.max(W0 / 2 + 30, o.guardW / 2), gh), gt, gc));
    } else if (o.guard === 'disc') {
      gh = 10;
      const dr = Math.max(W0 / 2 + 16, gt + 22);
      parts.push(cyl('Disc guard', dr, dr, 10, [0, -5, 0], { ...gc, sides: 64 }));
    } else {
      gh = 16;
      parts.push(cyl('Collar', o.gripR / 2 + 5, o.gripR / 2 + 5, 16, [0, -8, 0], gc));
    }
    // grip and pommel
    const r = o.gripR / 2, yTop = -gh, yEnd = -gh - o.gripLen;
    parts.push(wrappedGrip('Grip', yTop + 2, yEnd, r, { ridges: o.wrap === 'ridges' ? Math.round(o.gripLen / 14) : 0, ridgeDepth: o.wrap === 'ridges' ? 1.2 : 0, swell: 1.5, filament: o.fil_grip }));
    const pf = { color: C.brass, filament: o.fil_pommel };
    if (o.pommel === 'wheel') {
      parts.push(cyl('Pommel', r * 2, r * 2, r * 1.2, [0, yEnd - r * 1.7, 0], { ...pf, rot: [90, 0, 0], sides: 64 }));
      for (const z of [-1, 1]) parts.push(cyl('Pommel boss', r * 0.9, r * 0.7, 5, [0, yEnd - r * 1.7, z * (r * 0.6 + 2)], { ...pf, rot: [z * 90, 0, 0] }));
    } else if (o.pommel === 'scent') {
      parts.push(lathe('Pommel', [P(r + 1, yEnd + 4), P(r * 1.45, yEnd - 12, 'c'), P(r * 1.15, yEnd - 32, 'c'), P(r * 0.35, yEnd - 42, 'c'), P(0, yEnd - 44)], pf));
    } else if (o.pommel === 'ball') parts.push(sphere('Pommel', r * 1.6, [0, yEnd - r * 1.2, 0], pf));
    else parts.push(lathe('Pommel', [P(r + 1.5, yEnd + 5), P(r + 1.5, yEnd - 3, 'c'), P(r * 0.7, yEnd - r * 0.9, 'c'), P(0, yEnd - r)], pf));
    // strength
    const features = [];
    if (o.dowel !== 'none') {
      const intoBlade = T >= +o.dowel + 6;
      features.push(dowel('Handle dowel', [0, yEnd + 5, 0], [0, intoBlade ? Math.min(160, L * 0.2) : -4, 0], +o.dowel, { id: 'k-dowel' }));
    }
    const rodD = o.rod === 'none' ? 0 : Math.min(+o.rod, Math.floor(T - 4));
    if (rodD >= 2.5) {
      // close to the spine, clear of the fuller
      const x = sp - Math.max(6, W0 * 0.12);
      features.push(dowel('Blade rod', [x, yTop + 4, 0], [x, L * 0.6, 0], rodD, { id: 'k-rod', clearance: 0.2 }));
    }
    const d = design('Falchion', parts, { features, meta: { bayPos: [sp - W0 * 0.6, L * 0.4, 0], baySize: [Math.min(40, W0 * 0.5), 40, Math.max(4, T - 6)] } });
    d.filaments = PALETTE();
    return d;
  },
};

export const falchion = {
  id: 'gen-falchion', generator: true,
  name: 'Falchion', type: 'falchion',
  blurb: 'One-handed single-edged swords that widen toward the point: broad, cusped, clipped and curved, with guard, grip and pommel.',
  models: [],
  variants: { generated: variant },
};
