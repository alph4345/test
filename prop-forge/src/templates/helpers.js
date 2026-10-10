// Small vocabulary for writing templates. Units are millimetres; Y runs
// along the weapon (blade up), X is the width, Z the thickness.

export const COLORS = {
  steel: '#b9c2cc', dark: '#6f7a85', black: '#2a2d33', gold: '#d4a63a', brass: '#b8893a',
  leather: '#6b4226', wrap: '#3a2c2a', wood: '#8b5a2b', cloth: '#e9e3d3', red: '#a3262a',
  blue: '#2b4c94', white: '#ecebe6', crystal: '#7fd3ff', green: '#2f6b45', purple: '#5b3a8c',
};

let counter = 0;
export const uid = (p = 'p') => `${p}${Date.now().toString(36)}${(counter++).toString(36)}`;

// outline point: flags 's' = sharp edge (bevelled), 'c' = curve through it
export const P = (x, y, f = '') => {
  const p = { x: +x.toFixed(2), y: +y.toFixed(2) };
  if (f.includes('s')) p.s = 1;
  if (f.includes('c')) p.c = 1;
  return p;
};

const base = (name, type, o) => ({
  id: o.id || uid(),
  name,
  type,
  op: o.op || 'add',
  color: o.color || COLORS.steel,
  pos: o.pos || [0, 0, 0],
  rot: o.rot || [0, 0, 0],
  stretch: o.stretch || [1, 1, 1],
  copies: o.copies || { mode: 'none', count: 2 },
  filament: o.filament || 1,
  ...(o.target ? { target: o.target } : {}),
  ...(o.hidden ? { hidden: true } : {}),
});

// Flat outline extruded through Z. With sharp points + bevel it becomes a
// blade that tapers to `edge` thickness.
export function blade(name, points, o = {}) {
  return {
    ...base(name, 'profile', o),
    symmetric: !!o.symmetric,
    thickness: o.thickness ?? 10,
    edge: o.edge ?? 2,
    bevel: o.bevel ?? 15,
    points,
  };
}

export function flat(name, points, thickness, o = {}) {
  return blade(name, points, { color: COLORS.dark, ...o, thickness, edge: thickness, bevel: 0 });
}

// Revolved profile around the Y axis. points are (radius, y).
export function lathe(name, points, o = {}) {
  return { ...base(name, 'lathe', o), sides: o.sides ?? 48, sweep: o.sweep ?? 360, closedRing: !!o.closedRing, points };
}

export function box(name, size, pos, o = {}) {
  return { ...base(name, 'box', { ...o, pos }), size };
}

export function cyl(name, r1, r2, height, pos, o = {}) {
  return { ...base(name, 'cylinder', { ...o, pos }), r1, r2, height, sides: o.sides ?? 48 };
}

export function sphere(name, r, pos, o = {}) {
  return { ...base(name, 'sphere', { ...o, pos }), r, sides: o.sides ?? 48 };
}

// Through-hole along Z (e.g. the holes in a blade)
export function hole(name, r, pos, depth = 400, o = {}) {
  return cyl(name, r, r, depth, pos, { rot: [90, 0, 0], op: 'subtract', color: o.color || COLORS.dark, ...o });
}

// Torus lying in the XY plane (rings, keychain loops)
export function ring(name, radius, tube, pos, o = {}) {
  return lathe(name, [P(radius + tube, 0, 'c'), P(radius, tube, 'c'), P(radius - tube, 0, 'c'), P(radius, -tube, 'c')],
    { sides: 40, closedRing: true, rot: [90, 0, 0], ...o, pos });
}

// Grip profile from yTop down to yBottom with wrap ridges.
export function gripPoints(yTop, yBottom, r, { ridges = 0, ridgeDepth = 1, swell = 0, flareTop = 0, flareBottom = 0 } = {}) {
  const pts = [P(r + flareTop, yTop)];
  const L = yTop - yBottom;
  const n = ridges > 0 ? ridges * 2 : 6;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const y = yTop - L * t;
    const sw = swell * Math.sin(Math.PI * t);
    const rr = r + sw + (ridges > 0 ? (i % 2 ? ridgeDepth : 0) : 0);
    pts.push(P(rr, y, 'c'));
  }
  pts.push(P(r + flareBottom, yBottom));
  return pts;
}

export function dowel(name, from, to, diameter = 9.53, o = {}) {
  return { id: uid('f'), type: 'channel', name, from, to, diameter, clearance: 0.2, ...o };
}

export function bay(name, pos, size, o = {}) {
  return {
    id: uid('f'), type: 'cavity', name, pos, size,
    lid: { enabled: true, side: '+z', ledge: 3, clearance: 0.25, magnets: { enabled: false, diameter: 6.2, depth: 3.2 }, ...(o.lid || {}) },
    ...(o.hidden ? { hidden: true } : {}),
  };
}

export function defaultFilaments() {
  return [
    { name: 'Silver / grey', color: '#c3c8cf' },
    { name: 'Black', color: '#2b2d31' },
    { name: 'Brown', color: '#7a4f2c' },
    { name: 'Gold', color: '#d4a63a' },
  ];
}

export function design(name, parts, { features = [], meta = {} } = {}) {
  return {
    version: 1,
    name,
    scale: 1,
    parts,
    features,
    meta,
    filaments: defaultFilaments(),
    split: { plate: { x: 270, y: 270, z: 270, name: 'Snapmaker U1 (4 toolheads)' }, cuts: [] },
  };
}

// A curved single-edged blade (katana, scimitar, glaive). Edge on +X,
// spine on -X, bending towards the spine.
export function curvedBlade({ length, baseWidth, tipWidth, sori, tipLen, belly = 0 }) {
  const N = 7;
  const cx = (y) => -sori * (y / length) ** 2;
  const w = (y) => baseWidth + (tipWidth - baseWidth) * (y / length) + belly * Math.sin(Math.PI * Math.min(1, y / length));
  const edge = [], spine = [];
  for (let i = 0; i <= N; i++) {
    const y = ((length - tipLen) * i) / N;
    edge.push(P(cx(y) + w(y) / 2, y, i === 0 ? 's' : 'sc'));
    spine.push(P(cx(y) - w(y) / 2, y, i === 0 || i === N ? '' : 'c'));
  }
  const yt = length - tipLen;
  const tip = P(cx(length) - w(yt) / 2 + 2, length, 's');
  const mid = P(cx(yt + tipLen * 0.6) + w(yt) * 0.25, yt + tipLen * 0.6, 'sc');
  // CCW: bottom spine -> bottom edge -> up the edge -> tip -> down the spine
  const pts = [spine[0], ...edge, mid, tip];
  pts.push(P(spine[N].x, spine[N].y + tipLen * 0.15));
  for (let i = N; i >= 1; i--) pts.push(spine[i]);
  return pts;
}
