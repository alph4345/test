// Generic greatsword: a broad, cleaver-sized two-handed blade with the
// parts a sword has (guard, ricasso with parrying hooks, fuller, grip,
// pommel). Every option can be changed and "Generate another" rolls more.
import { COLORS as C, P, blade, flat, box, cyl, sphere, lathe, ring, dowel, design, hole as holePart } from '../templates/helpers.js';
import { choice, range, toggle, fil, group, sizeGroup, circlePoly, icon, hole } from './core.js';
import { palette, wrappedGrip, clipAbove, xy } from './parts.js';

const PALETTE = () => palette(['Silver', '#9aa2ad'], ['Dark grey', '#4a4f57'], ['Brown (grip)', '#5a3b26'], ['Gold', '#c9a23f']);

const SINGLE = new Set(['cleaver', 'falchion']);

// Left (edge, -x) and right (+x) sides of the blade as functions of y, the
// height where the point begins, and the point itself (right to left).
function shapeOf(o) {
  const W = o.bladeWidth, L = o.bladeLen, h = W / 2;
  switch (o.shape) {
    case 'cleaver': return {
      left: (y) => h - W * (1 - (Math.max(0, y) / L) ** 2.4), right: () => h, top: L * 0.96, curved: true,
      tip: [[h - 1, L, 's']],
    };
    case 'falchion': {
      const tx = h - W * 0.38;
      const left = (y) => -h - W * 0.16 * Math.sin((Math.PI * y) / (0.95 * L));
      const right = (y) => (y < 0.74 * L ? h : h - (h - tx - 4) * ((y - 0.74 * L) / (0.24 * L)) ** 1.6);
      return {
        left, right, top: 0.82 * L, curved: true,
        tip: [[right(0.9 * L), 0.9 * L, 'c'], [tx, L, 's'], [(left(0.82 * L) + tx) / 2 - W * 0.06, 0.93 * L, 'sc']],
      };
    }
    case 'leaf': {
      const right = (y) => h * (1 + 0.24 * Math.sin((Math.PI * Math.min(y, 0.8 * L)) / (1.25 * L)));
      return {
        left: (y) => -right(y), right, top: 0.8 * L, curved: true,
        tip: [[right(0.8 * L) * 0.55, 0.91 * L, 'sc'], [0, L, 's'], [-right(0.8 * L) * 0.55, 0.91 * L, 'sc']],
      };
    }
    default: { // straight, with a choice of point
      const tips = {
        spear: { top: L - W * 0.9, tip: [[0, L, 's']] },
        coffin: { top: L - W * 0.4, tip: [[h * 0.35, L, 's'], [-h * 0.35, L, 's']] },
        curved: { top: L - W * 1.35, tip: [[-h * 0.1, L - W * 0.45, 'sc']], rightTop: L },
        angled: { top: L - W * 1.68, tip: [], rightTop: L },
        square: { top: L - 14, tip: [[h - 14, L, ''], [-h + 14, L, '']] },
      };
      const t = tips[o.tip] || tips.spear;
      return { left: () => -h, right: () => h, top: t.top, rightTop: t.rightTop, tip: t.tip, curved: false };
    }
  }
}

function bladeOutline(o) {
  const s = shapeOf(o);
  const single = SINGLE.has(o.shape) || o.edges === 'one';
  const ric = o.ricasso ? o.ricLen : 0;
  // the blade starts 3 mm inside the guard so the two fuse
  const ys = [-3];
  const top = s.top, rTop = s.rightTop || top;
  if (ric > 0 && ric < top - 10) ys.push(ric);
  // curve samples keep clear of the ricasso corner (points bunched up on a
  // curve make it loop)
  if (s.curved) for (let i = 1; i <= 10; i++) { const y = (top * i) / 10; if (y > ric + 30 || i === 10) ys.push(y); }
  else ys.push(top);
  const uniq = [...new Set(ys.map((y) => Math.round(y * 10) / 10))].sort((a, b) => a - b);
  const flag = (y, sharpSide, last) => ((y >= ric && sharpSide) ? 's' : '') + (s.curved && !last && y > ric + 1 ? 'c' : '');
  const pts = [P(s.left(-3), -3, ric > 0 ? '' : 's'), P(s.right(-3), -3, ric > 0 || single ? '' : 's')];
  // up the right side
  const rys = uniq.filter((y) => y > -3);
  if (rTop > top) rys.push(rTop);
  // the top corner of an angled or curved cut is the point itself: sharp
  rys.forEach((y, i) => pts.push(P(s.right(Math.min(y, top)), y, y >= rTop && rTop > top ? 's' : flag(y, !single, i === rys.length - 1))));
  for (const [x, y, f] of s.tip) pts.push(P(x, y, f));
  // down the left side (the main edge)
  uniq.filter((y) => y > -3).reverse().forEach((y, i) => pts.push(P(s.left(y), y, flag(y, true, i === 0))));
  return pts;
}

const shapeIcon = (shape, tip = 'spear') => icon(xy(bladeOutline({ bladeWidth: 170, bladeLen: 1150, shape, tip, edges: 'both', ricasso: false })));
const tipIcon = (tip) => icon(clipAbove(xy(bladeOutline({ bladeWidth: 170, bladeLen: 1150, shape: 'straight', tip, edges: 'both' })), 650));

function guardIcon(style) {
  const g = {
    cross: [[-16, 3], [16, 3], [16, 7], [-16, 7]],
    swept: [[-16, -2], [-12, 5], [0, 7], [12, 5], [16, -2], [14, -3], [10, 2], [0, 3], [-10, 2], [-14, -3]],
    winged: [[-15, 9], [-10, 4], [-4, 2], [4, 2], [10, 4], [15, 9], [9, 7], [0, 6], [-9, 7]],
    block: [[-11, 0], [11, 0], [11, 9], [-11, 9]],
    disc: [[-12, 4], [12, 4], [12, 7], [-12, 7]],
    none: [[-3, 3], [3, 3], [3, 7], [-3, 7]],
  }[style];
  return icon([[-8, 9], [8, 9], [8, 22], [-8, 22]], g, [[-2.5, -10], [2.5, -10], [2.5, 1], [-2.5, 1]]);
}

function pommelIcon(style) {
  const grip = [[-2.5, 0], [2.5, 0], [2.5, 14], [-2.5, 14]];
  const p = {
    disc: circlePoly(6.5, 24, 0, -5), ball: circlePoly(5, 20, 0, -4), cap: circlePoly(3, 16, 0, 0),
    spike: [[-4, 0], [4, 0], [0, -11]], ring: circlePoly(6, 24, 0, -6),
  }[style];
  return icon(grip, p, ...(style === 'ring' ? [hole(circlePoly(3.5, 20, 0, -6))] : []));
}

function holeIcon(shape) {
  const s = 7;
  const poly = {
    round: circlePoly(s, 24), square: [[-s, -s], [s, -s], [s, s], [-s, s]],
    diamond: [[0, -s * 1.3], [s * 1.3, 0], [0, s * 1.3], [-s * 1.3, 0]], hex: circlePoly(s * 1.1, 6, 0, 0, Math.PI / 6),
  }[shape];
  return icon([[-11, -11], [11, -11], [11, 11], [-11, 11]], hole(poly));
}

const dowelChoice = () => choice('dowel', 'Wooden dowel through the grip', [
  { v: 'none', label: 'None' }, { v: 9.53, label: '3/8 in' }, { v: 12.7, label: '1/2 in' }, { v: 15.88, label: '5/8 in' },
], 12.7, { random: false, hint: 'Through the grip and guard (and into the blade if it is thick enough).' });

const variant = {
  label: 'Greatsword',
  groups: () => [
    sizeGroup(),
    group('Blade', [
      choice('shape', 'Shape', [
        { v: 'straight', label: 'Straight', icon: shapeIcon('straight'), weight: 3 },
        { v: 'cleaver', label: 'Cleaver', icon: shapeIcon('cleaver'), weight: 2 },
        { v: 'falchion', label: 'Falchion', icon: shapeIcon('falchion'), weight: 1.5 },
        { v: 'leaf', label: 'Leaf', icon: shapeIcon('leaf'), weight: 1.5 },
      ], 'straight'),
      choice('tip', 'Point', [
        { v: 'spear', label: 'Spear', icon: tipIcon('spear'), weight: 3 },
        { v: 'angled', label: 'Angled cut', icon: tipIcon('angled'), weight: 2 },
        { v: 'curved', label: 'Curved cut', icon: tipIcon('curved'), weight: 1.5 },
        { v: 'coffin', label: 'Coffin', icon: tipIcon('coffin'), weight: 1 },
        { v: 'square', label: 'Square', icon: tipIcon('square'), weight: 0.4 },
      ], 'spear', { show: (o) => o.shape === 'straight' }),
      range('bladeLen', 'Blade length', 800, 1500, 1150, { step: 5, rand: [1000, 1350] }),
      range('bladeWidth', 'Blade width', 90, 260, 170, { rand: [130, 220] }),
      range('thickness', 'Thickness', 10, 34, 18, { step: 0.5, rand: [14, 24], hint: 'A broad blade 15–22 mm thick prints stiff and still carries well with a steel rod inside.' }),
      choice('edges', 'Sharp edges', [{ v: 'both', label: 'Both sides', weight: 3 }, { v: 'one', label: 'One side' }], 'both', { show: (o) => !SINGLE.has(o.shape) }),
      range('bevel', 'Edge grind width', 10, 70, 30, { rand: [18, 45] }),
      choice('fuller', 'Fuller (groove)', [{ v: 'single', label: 'Single', weight: 2 }, { v: 'double', label: 'Double' }, { v: 'none', label: 'None', weight: 1.5 }], 'single'),
      toggle('ricasso', 'Ricasso (blunt section above the guard)', true, { p: 0.55 }),
      range('ricLen', 'Ricasso length', 50, 260, 130, { show: (o) => o.ricasso, rand: [90, 180] }),
      toggle('flukes', 'Parrying hooks at the top of the ricasso', true, { show: (o) => o.ricasso, p: 0.5 }),
    ]),
    group('Guard', [
      choice('guard', 'Handguard', ['cross', 'swept', 'winged', 'block', 'disc', 'none'].map((v) => ({
        v, label: { cross: 'Cross bar', swept: 'Swept down', winged: 'Winged', block: 'Block', disc: 'Disc', none: 'Collar only' }[v],
        icon: guardIcon(v), weight: { cross: 3, swept: 2, winged: 2, block: 1.5, disc: 1, none: 0.4 }[v],
      })), 'cross'),
      range('guardW', 'Guard width', 160, 480, 320, { show: (o) => ['cross', 'swept', 'winged'].includes(o.guard), rand: [260, 400] }),
      range('guardH', 'Guard thickness', 18, 50, 30, { show: (o) => ['cross', 'swept'].includes(o.guard), rand: [22, 40] }),
    ]),
    group('Grip and pommel', [
      range('gripLen', 'Grip length', 220, 480, 330, { step: 2, rand: [270, 400] }),
      range('gripR', 'Grip thickness', 26, 42, 32, { unit: 'mm Ø', rand: [29, 36] }),
      choice('wrap', 'Grip surface', [{ v: 'smooth', label: 'Bare (wrap with real leather or cord)', weight: 2 }, { v: 'ridges', label: 'Printed ridges' }], 'smooth'),
      choice('pommel', 'Pommel', ['disc', 'ball', 'cap', 'spike', 'ring'].map((v) => ({ v, label: v[0].toUpperCase() + v.slice(1), icon: pommelIcon(v), weight: { disc: 3, ball: 2, cap: 1, spike: 1, ring: 0.6 }[v] })), 'disc'),
    ]),
    group('Holes', [
      range('holes', 'Number of holes', 0, 4, 0, { unit: '', rand: [0, 0.7] }),
      choice('holeShape', 'Hole shape', ['round', 'square', 'diamond', 'hex'].map((v) => ({ v, label: v[0].toUpperCase() + v.slice(1), icon: holeIcon(v) })), 'round', { show: (o) => o.holes > 0 }),
      range('holeSize', 'Hole size', 15, 60, 32, { show: (o) => o.holes > 0, rand: [22, 44] }),
      toggle('gems', 'Gems in the holes (print separately)', false, { show: (o) => o.holes > 0 && o.holeShape === 'round', p: 0.3 }),
    ]),
    group('Strength', [
      dowelChoice(),
      choice('rod', 'Steel rod up the blade', [{ v: 'none', label: 'None' }, { v: 4, label: '4 mm' }, { v: 6, label: '6 mm' }, { v: 8, label: '8 mm' }], 6,
        { random: false, hint: 'From inside the guard to 60% up the blade; it keeps the blade pieces from snapping at the joints. Thin blades get a thinner rod automatically.' }),
    ]),
    group('Colours', [fil('fil_blade', 'Blade', 1), fil('fil_hilt', 'Guard', 2), fil('fil_grip', 'Grip', 3), fil('fil_pommel', 'Pommel', 2), fil('fil_gems', 'Gems', 4, { show: (o) => o.gems })]),
  ],
  tidy(o) {
    if (SINGLE.has(o.shape)) o.edges = 'one';
    if (o.holeShape !== 'round') o.gems = false;
    if (o.ricasso && o.ricLen > o.bladeLen * 0.25) o.ricLen = Math.round(o.bladeLen * 0.15);
    return o;
  },
  build(o) {
    const W = o.bladeWidth, T = o.thickness, h = W / 2;
    const s = shapeOf(o);
    const bladeId = 'blade';
    const parts = [{ ...blade('Blade', bladeOutline(o), { thickness: T, edge: 2.5, bevel: o.bevel, tipThickness: T * 0.75, color: C.steel, filament: o.fil_blade }), id: bladeId }];
    const ric = o.ricasso ? o.ricLen : 0;
    // parrying hooks: small curved spikes either side at the top of the ricasso
    if (ric && o.flukes) {
      // one hook on each side, rooted 6 mm inside that side's edge
      for (const [side, ex] of [[1, s.right(ric)], [-1, s.left(ric)]]) {
        const hk = [[-6, -8], [18, -16, 'c'], [34, -34], [30, -10, 'c'], [10, 8], [-6, 8]];
        const pts = hk.map(([dx, dy, f]) => P(ex + side * dx, ric + dy, f || ''));
        parts.push(flat('Parrying hook', side > 0 ? pts : pts.reverse(), T * 0.85, { color: C.steel, filament: o.fil_blade }));
      }
    }
    // holes down the middle, starting above the ricasso
    const hs = o.holeSize, n = o.holes | 0;
    const hole0 = Math.max(ric + hs * 0.6 + 10, hs * 0.6 + 20);
    const holeX = (s.left(hole0) + s.right(hole0)) / 2;
    for (let i = 0; i < n; i++) {
      const pos = [holeX, hole0 + i * hs * 2.2, 0];
      if (o.holeShape === 'round') parts.push(holePart(`Hole ${i + 1}`, hs / 2, pos, T * 3, { target: bladeId }));
      else if (o.holeShape === 'hex') parts.push(cyl(`Hole ${i + 1}`, hs * 0.55, hs * 0.55, T * 3, pos, { sides: 6, rot: [90, 0, 0], op: 'subtract', target: bladeId }));
      else parts.push(box(`Hole ${i + 1}`, [hs, hs, T * 3], pos, { op: 'subtract', target: bladeId, rot: o.holeShape === 'diamond' ? [0, 0, 45] : [0, 0, 0] }));
      if (o.gems && o.holeShape === 'round') parts.push(sphere(`Gem ${i + 1}`, hs / 2 - 0.3, pos, { color: '#3fae5a', filament: o.fil_gems, separate: true }));
    }
    // fuller(s): shallow grooves on both faces, toward the spine on single-edged blades
    if (o.fuller !== 'none') {
      const y0 = n ? hole0 + (n - 1) * hs * 2.2 + hs : ric + 40;
      const y1 = Math.min(s.top - W * 0.3, o.bladeLen * 0.7);
      if (y1 > y0 + 80) {
        const mid = (y) => (SINGLE.has(o.shape) ? s.right(y) - W * 0.3 : 0);
        const xs = o.fuller === 'double' ? [-W * 0.13, W * 0.13] : [0];
        for (const dx of xs) for (const z of [-1, 1]) parts.push(box('Fuller', [W * (o.fuller === 'double' ? 0.07 : 0.12), y1 - y0, 6], [mid(y0) + dx, (y0 + y1) / 2, z * T / 2], { op: 'subtract', target: bladeId }));
      }
    }
    // guard
    const gc = { color: C.dark, filament: o.fil_hilt };
    const gw = Math.max(W + 50, o.guardW || W + 120), gb = o.guardH || 30;
    let gh;
    if (o.guard === 'block') {
      gh = 75;
      parts.push(box('Guard top plate', [W + 22, 10, T + 22], [0, -5, 0], gc));
      parts.push(box('Guard block', [W + 4, 55, T + 16], [0, -37.5, 0], gc));
      parts.push(box('Guard bottom plate', [W + 22, 10, T + 22], [0, -70, 0], gc));
    } else if (o.guard === 'cross') {
      gh = gb;
      parts.push(box('Cross guard', [gw, gb, T + 14], [0, -gb / 2, 0], gc));
      for (const sx of [-1, 1]) parts.push(sphere('Guard end', gb * 0.65, [sx * gw / 2, -gb / 2, 0], gc));
    } else if (o.guard === 'swept') {
      gh = gb + 6;
      const e = gw / 2, drop = gb + 34;
      parts.push(flat('Swept guard', [
        P(-e, -drop), P(-e + 26, -10, 'c'), P(0, 0), P(e - 26, -10, 'c'), P(e, -drop),
        P(e - 16, -drop - 4), P(e - 40, -gb - 2, 'c'), P(0, -gb - 6), P(-e + 40, -gb - 2, 'c'), P(-e + 16, -drop - 4),
      ], T + 14, gc));
    } else if (o.guard === 'winged') {
      gh = 30;
      const span = gw / 2;
      parts.push(flat('Winged guard', [P(-span, 34), P(-span + 30, 4, 'c'), P(-h * 0.5, -30), P(h * 0.5, -30), P(span - 30, 4, 'c'), P(span, 34), P(span - 50, 8, 'c'), P(0, 0), P(-span + 50, 8, 'c')], T + 16, gc));
    } else if (o.guard === 'disc') {
      gh = 16;
      const dr = Math.max(h + 22, T + 40);
      parts.push(cyl('Disc guard', dr, dr, 16, [0, -8, 0], { ...gc, sides: 64 }));
    } else {
      gh = 22;
      parts.push(cyl('Collar', o.gripR / 2 + 7, o.gripR / 2 + 7, 22, [0, -11, 0], gc));
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
    // strength: a dowel through the grip, a steel rod up the blade (around any holes)
    const features = [];
    if (o.dowel !== 'none') {
      const intoBlade = T >= +o.dowel + 8;
      const top = !intoBlade ? -4 : n ? hole0 - hs / 2 - 8 : Math.min(300, o.bladeLen * 0.25);
      features.push(dowel('Handle dowel', [0, yEnd + 6, 0], [0, top, 0], +o.dowel, { id: 'k-dowel' }));
    }
    const rodD = o.rod === 'none' ? 0 : Math.min(+o.rod, Math.floor(T - 5));
    if (rodD >= 3) {
      const top = o.bladeLen * 0.6;
      const off = n ? hs / 2 + rodD / 2 + 4 : 0;
      const half = Math.min(s.right(top) - holeX, holeX - s.left(top));
      if (!n) features.push(dowel('Blade rod', [holeX, -gh + 4, 0], [holeX, top, 0], rodD, { id: 'k-rod', clearance: 0.2 }));
      else if (half - o.bevel > off + rodD) for (const sx of [-1, 1]) features.push(dowel(sx < 0 ? 'Blade rod (left)' : 'Blade rod (right)', [holeX + sx * off, -gh + 4, 0], [holeX + sx * off, top, 0], rodD, { id: sx < 0 ? 'k-rod-l' : 'k-rod-r', clearance: 0.2 }));
      else features.push(dowel('Blade rod', [holeX, -gh + 4, 0], [holeX, hole0 - hs / 2 - 8, 0], rodD, { id: 'k-rod', clearance: 0.2 }));
    }
    const d = design('Greatsword', parts, { features, meta: { bayPos: [holeX, 350, 0], baySize: [Math.min(70, W * 0.5), 40, Math.max(6, T - 8)] } });
    d.filaments = PALETTE();
    return d;
  },
};

export const greatsword = {
  id: 'gen-greatsword', generator: true,
  name: 'Greatsword', type: 'greatsword',
  blurb: 'Broad two-handed blades with a handguard, ricasso and parrying hooks, fuller, grip and pommel.',
  models: [],
  variants: { generated: variant },
};
