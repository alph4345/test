// Revolver gunblade (Final Fantasy VIII). Model variant: the creator's own
// model (Thingiverse 3825730) with a rebuilt, fluted revolver cylinder.
// Also the generic "gunblade" generator.
import { COLORS as C, P, blade, flat, cyl, dowel, design, hole as holePart } from '../templates/helpers.js';
import { choice, range, toggle, fil, group, sizeGroup, sectionWarp, circlePoly, icon, hole } from './core.js';
import { meshPart, palette, thumbOf, revolver, pillow, clipAbove, xy } from './parts.js';

const PALETTE = () => palette(['Silver', '#c3c8cf'], ['Gunmetal', '#4a4f57'], ['Black', '#2b2d31'], ['Gold', '#d4a63a']);

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

// ---------------------------------------------------------------------
// Generated
function bladeOutline(o, yB) {
  const L = o.bladeLen, W = o.bladeWidth;
  const sx = W * 0.47, ex = -W * 0.53; // spine (+x) and edge (-x) at the base
  const narrow = (o.taper / 100) * W * 0.45;
  const yT = yB + L;
  const pts = [P(ex, yB, 's')];
  const ex2 = ex + narrow;
  const tip = o.tip;
  const notch = o.spineNotch ? [P(sx, yB + 30), P(sx - 4, yB + 37), P(sx + 1.5, yB + 43)] : [];
  if (tip === 'revolver') {
    // narrow point near the spine, with a stepped spine
    pts.push(P(ex2, yB + L * 0.55, 'sc'), P(ex2 + W * 0.2, yB + L * 0.82, 'sc'), P(sx - W * 0.17, yT, 's'), P(sx - W * 0.13, yT));
    pts.push(P(sx - W * 0.13, yT - L * 0.13), P(sx - 2, yT - L * 0.2, 'c'), P(sx, yT - L * 0.26));
  } else if (tip === 'clip') {
    pts.push(P(ex2, yB + L * 0.62, 'sc'), P(ex2 + W * 0.12, yB + L * 0.86, 'sc'), P((ex2 + sx) / 2 - W * 0.05, yT, 's'));
    pts.push(P(sx - W * 0.22, yT - L * 0.1, 'sc'), P(sx, yT - L * 0.2, 's'));
  } else if (tip === 'spear') {
    const mid = (ex2 + sx) / 2;
    pts.push(P(ex2, yT - W * 1.4, 'sc'), P(mid, yT, 's'), P(sx, yT - W * 1.4, 's'));
  } else { // chisel: straight cut from the spine down to the edge
    pts.push(P(ex2, yT - W * 1.1, 's'), P(sx, yT, 's'));
  }
  pts.push(...notch.reverse());
  pts.push(P(sx, yB));
  return pts;
}

function tipIcon(tip) {
  const o = { bladeLen: 500, bladeWidth: 80, taper: 45, tip, spineNotch: false };
  return icon(clipAbove(xy(bladeOutline(o, 0)), 330));
}

function gripOutline(o, top) {
  const a = (o.gripAngle * Math.PI) / 180;
  const dir = [-Math.sin(a), -Math.cos(a)], n = [Math.cos(a), -Math.sin(a)]; // n points to the back (+x)
  const Lg = o.gripLen;
  const left = [], right = [];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const bend = 6 * Math.sin(Math.PI * t);
    const c = [top[0] + dir[0] * Lg * t - n[0] * bend, top[1] + dir[1] * Lg * t - n[1] * bend];
    let wb = 21 - 4 * Math.sin(Math.PI * Math.min(1, t * 1.6)), wf = 21 - 3 * Math.sin(Math.PI * Math.min(1, t * 1.4));
    if (o.butt === 'flared' && t > 0.6) wf += 14 * ((t - 0.6) / 0.4) ** 1.6;
    if (o.butt === 'flared' && t > 0.75) wb += 3 * ((t - 0.75) / 0.25);
    right.push([c[0] + n[0] * wb, c[1] + n[1] * wb]);
    left.push([c[0] - n[0] * wf, c[1] - n[1] * wf]);
  }
  const end = [top[0] + dir[0] * Lg, top[1] + dir[1] * Lg];
  const cap = [];
  if (o.butt === 'round') {
    for (let i = 1; i < 6; i++) {
      const t = i / 6, b = Math.PI * t;
      cap.push([end[0] + n[0] * 19 * Math.cos(b) + dir[0] * 10 * Math.sin(b), end[1] + n[1] * 19 * Math.cos(b) + dir[1] * 10 * Math.sin(b)]);
    }
  }
  // CCW: down the back (+x side), across the butt, up the front
  const poly = [...right, ...cap, ...left.reverse()];
  return { points: poly.map(([x, y], i) => P(x, y, i === 0 || i === poly.length - 1 ? '' : 'c')), end, dir, n };
}

function gripIcon(butt) {
  return icon(xy(gripOutline({ gripAngle: 17, gripLen: 165, butt }, [0, 0]).points));
}

const generatedVariant = {
  label: 'Gunblade',
  base: { length: 863 },
  groups: () => [
    sizeGroup(),
    group('Blade', [
      choice('tip', 'Tip', [
        { v: 'revolver', label: 'Stepped spine', icon: tipIcon('revolver') },
        { v: 'clip', label: 'Clip point', icon: tipIcon('clip') },
        { v: 'spear', label: 'Spear point', icon: tipIcon('spear') },
        { v: 'chisel', label: 'Angled cut', icon: tipIcon('chisel') },
      ], 'revolver'),
      range('bladeLen', 'Blade length', 380, 720, 515, { step: 5, rand: [430, 640] }),
      range('bladeWidth', 'Blade width', 55, 115, 81, { rand: [62, 100] }),
      range('taper', 'Narrows toward the tip', 0, 80, 45, { unit: '%' }),
      range('thickness', 'Thickness', 10, 20, 15, { step: 0.5, rand: [12, 17] }),
      range('bevel', 'Edge grind width', 6, 30, 18, { rand: [10, 24], hint: 'How far in from the edge the bevel starts' }),
      toggle('spineNotch', 'Notch in the spine', true),
    ]),
    cylinderOptions([
      range('cylD', 'Cylinder diameter', 40, 58, 51.4, { step: 0.5, rand: [44, 56] }),
      range('cylL', 'Cylinder length', 46, 72, 64, { rand: [52, 70] }),
    ]),
    group('Frame and grip', [
      choice('guard', 'Trigger guard', [{ v: 'classic', label: 'Angular' }, { v: 'ring', label: 'Round' }, { v: 'none', label: 'None' }], 'classic'),
      choice('hammer', 'Hammer', [{ v: 'spur', label: 'Spur' }, { v: 'round', label: 'Round' }, { v: 'none', label: 'None' }], 'spur'),
      choice('butt', 'Grip end', [
        { v: 'flared', label: 'Flared', icon: gripIcon('flared') },
        { v: 'round', label: 'Rounded', icon: gripIcon('round') },
        { v: 'straight', label: 'Square', icon: gripIcon('straight') },
      ], 'flared'),
      range('gripAngle', 'Grip angle', 5, 32, 17, { unit: '°', rand: [10, 26] }),
      range('gripLen', 'Grip length', 120, 200, 165, { rand: [140, 185] }),
      toggle('ring', 'Ring for a chain charm', true, { p: 0.6 }),
      choice('barrel', 'Barrel along the spine', [{ v: 'none', label: 'None' }, { v: 'short', label: 'Short' }, { v: 'long', label: 'Long' }], 'short'),
    ]),
    rodGroup(),
    colourGroup(),
  ],
  build(o) {
    const R = o.cylD / 2, L = o.cylL;
    const yb = 0; // bottom of the frame
    const cy = yb + 14 + L / 2;
    const yTop = cy + L / 2 + 70;
    const xl = -R - 8, xr = R + 11;
    const W = o.bladeWidth, sx = W * 0.47, ex = -W * 0.53;
    const frameId = 'frame';
    const parts = [];
    // blade, starting 12 mm inside the frame
    parts.push(blade('Blade', bladeOutline(o, yTop - 12), { thickness: o.thickness, edge: 2.4, bevel: o.bevel, color: C.steel, filament: o.fil_blade, tipThickness: o.thickness * 0.75 }));
    // frame
    const frame = flat('Frame', [
      P(xl + 6, yb), P(xr - 4, yb), P(xr, yb + 6), P(xr, cy + L / 2 + 8), P(xr - 3, cy + L / 2 + 16), P(xr - 3, yTop - 14),
      P(Math.max(xr - 3, sx), yTop - 6), P(sx + 1, yTop), P(ex - 1, yTop), P(ex - 1, yTop - 10),
      P(Math.min(xl + 4, ex + 10), yTop - 26, 'c'), P(xl + 4, cy + L / 2 + 22, 'c'), P(xl, cy + L / 2 + 8), P(xl, yb + 10),
    ], 16, { color: C.dark, filament: o.fil_frame });
    parts.push({ ...frame, id: frameId });
    parts.push(flat('Cylinder window', [P(-R - 0.8, cy - L / 2 - 1), P(R + 0.8, cy - L / 2 - 1), P(R + 0.8, cy + L / 2 + 1), P(-R - 0.8, cy + L / 2 + 1)], 60, { op: 'subtract', target: frameId }));
    // trigger guard and trigger
    if (o.guard !== 'none') {
      const gy0 = yb - 6, gy1 = cy + 4, gx = xl - 34;
      const outer = o.guard === 'ring'
        ? circlePoly((gy1 - gy0) / 2, 28, xl - 8, (gy0 + gy1) / 2).map(([x, y]) => P(x, y, 'c'))
        : [P(xl + 4, gy0), P(xl + 4, gy1), P(xl - 12, gy1 + 2), P(gx + 6, gy1 - 6), P(gx, gy0 + 14), P(gx + 4, gy0 + 4), P(xl - 14, gy0 - 6)];
      const cxg = outer.reduce((s, p) => s + p.x, 0) / outer.length, cyg = outer.reduce((s, p) => s + p.y, 0) / outer.length;
      const inner = outer.map((p) => { const dx = p.x - cxg, dy = p.y - cyg, l = Math.hypot(dx, dy) || 1; const k = Math.max(0.2, (l - 8) / l); return P(cxg + dx * k, cyg + dy * k, p.c ? 'c' : ''); });
      const guardId = 'guard';
      parts.push({ ...pillow('Trigger guard', outer, 12, { filament: o.fil_frame }), id: guardId });
      parts.push(flat('Trigger guard opening', inner, 40, { op: 'subtract', target: guardId }));
      parts.push(flat('Trigger', [P(xl + 2, cy - 10), P(xl - 12, cy - 18, 'c'), P(xl - 15, cy - 32, 'c'), P(xl - 9, cy - 42), P(xl - 6, cy - 30, 'c'), P(xl + 2, cy - 22)], 6, { color: C.dark, filament: o.fil_frame }));
    }
    if (o.hammer === 'spur') parts.push(flat('Hammer', [P(xr - 8, yb + 20), P(xr - 6, yb + 4), P(xr + 6, yb - 6), P(xr + 16, yb - 8), P(xr + 9, yb + 2), P(xr + 2, yb + 22)], 9, { color: C.dark, filament: o.fil_frame }));
    if (o.hammer === 'round') parts.push(cyl('Hammer', 9, 9, 9, [xr - 2, yb + 4, 0], { rot: [90, 0, 0], color: C.dark, filament: o.fil_frame }));
    // cylinder and pin
    parts.push(...cylinderParts(o, { cx: 0, cy, R, L, frameId }));
    // grip
    const g = gripOutline(o, [(xl + xr) / 2 - 10, yb + 12]);
    parts.push(pillow('Grip', g.points, 22, { color: C.wrap, filament: o.fil_grip, round: 6 }));
    if (o.ring) {
      const c = [g.end[0] + g.dir[0] * 4 - g.n[0] * 10, g.end[1] + g.dir[1] * 4 - g.n[1] * 10];
      parts.push({ ...cyl('Charm ring', 9, 9, 6, [c[0], c[1], 0], { rot: [90, 0, 0], color: C.steel, filament: o.fil_cyl }), id: 'ring' });
      parts.push(holePart('Charm ring hole', 5, [c[0], c[1], 0], 20, { target: 'ring' }));
    }
    // barrel lying along the spine, with a bore at the muzzle
    if (o.barrel !== 'none') {
      const len = o.barrel === 'long' ? o.bladeLen * 0.55 : o.bladeLen * 0.28;
      const br = Math.min(11, o.thickness * 0.6 + 2);
      const bx = sx + br * 0.45;
      const y0b = cy + L / 2 + 6, y1b = yTop + len;
      parts.push({ ...cyl('Barrel', br, br, y1b - y0b, [bx, (y0b + y1b) / 2, 0], { color: C.dark, filament: o.fil_frame }), id: 'barrel' });
      parts.push(cyl('Muzzle ring', br + 2, br + 2, 10, [bx, y1b - 5, 0], { color: C.dark, filament: o.fil_frame }));
      parts.push(cyl('Bore', br * 0.45, br * 0.45, 30, [bx, y1b, 0], { op: 'subtract', color: C.dark }));
    }
    const midX = (sx + ex) / 2 + W * 0.05;
    const features = o.rod === 'none' ? [] : [dowel('Blade rod', [midX, cy + L / 2 + 14, 0], [midX, yTop + o.bladeLen * 0.7, 0], +o.rod, { id: 'k-rod' })];
    const d = design('Gunblade', parts, { features, meta: { bayPos: [0, yTop - 30, 0], baySize: [40, 40, 12] } });
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

export const gunbladeGen = {
  id: 'gen-gunblade', generator: true,
  name: 'Gunblade', type: 'gunblade',
  blurb: 'A blade on a revolver frame: tip, cylinder, guard, hammer, grip and barrel styles.',
  models: [],
  variants: { generated: generatedVariant },
};
