import { P, COLORS as C, blade, flat, lathe, box, cyl, sphere, hole, ring, gripPoints, dowel, bay, design, uid } from './helpers.js';

// Filament slots used below (see defaultFilaments): 1 silver, 2 black,
// 3 brown, 4 gold. Change them per part in the Shape tab.
const F = { silver: 1, black: 2, brown: 3, gold: 4 };

const mount = (name, style, pos, angle, extra = {}) => ({
  id: uid('f'), type: 'mount', name, style, side: '-z', pos, angle,
  ...(style === 'grip' ? { span: 120, gap: 38, bar: 28 } : { span: 46, gap: 6, bar: 9 }), ...extra,
});

export const busterSword = {
  id: 'buster-sword', name: 'Buster Sword', category: 'Pop culture', source: 'Final Fantasy VII / Crisis Core',
  blurb: '1.8 m single-edged slab, 41 mm thick, long clipped tip, raised base plate with two materia holes.',
  credit: 'Proportions measured from "Zach Fair Buster Sword" by Budward (thingiverse.com/thing:1794243, CC BY-NC-SA).',
  build() {
    return design('Buster Sword', [
      // spine on +X (blunt), edge on -X, tip clipped from the edge up to the spine
      blade('Blade', [
        P(-102.5, 0), P(102.5, 0), P(102.5, 1327, 's'), P(-102.5, 991, 's'), P(-102.5, 200, 's'), P(-102.5, 185),
      ], { thickness: 41, edge: 2.4, bevel: 60, filament: F.silver }),
      flat('Base plate', [P(-58, 0), P(58, 0), P(58, 178), P(-58, 178)], 50, { color: C.dark, filament: F.silver }),
      hole('Materia hole 1', 19.5, [0, 45, 0], 80, { color: C.dark }),
      hole('Materia hole 2', 19.5, [0, 135, 0], 80, { color: C.dark }),
      box('Hilt block', [205, 62, 65], [0, -30, 0], { color: C.dark, filament: F.black }),
      box('Hilt flange (lower)', [222, 7, 65], [0, -64.5, 0], { color: C.dark, filament: F.black }),
      box('Hilt flange (upper)', [222, 7, 65], [0, -10.5, 0], { color: C.dark, filament: F.black }),
      lathe('Collar', [P(23, -60), P(23, -80), P(17, -84)], { color: C.steel, filament: F.silver }),
      lathe('Grip', gripPoints(-78, -469, 16.5, { ridges: 0 }), { color: C.wrap, filament: F.black }),
      lathe('Pommel', [P(16.5, -466), P(18, -474, 'c'), P(12, -484, 'c'), P(0, -487)], { color: C.steel, filament: F.silver }),
    ], {
      features: [dowel('Handle dowel', [0, -484, 0], [0, 260, 0], 12.7)],
      meta: { handle: { from: [0, -484, 0], to: [0, 260, 0] }, bayPos: [0, 90, 0], baySize: [70, 40, 20] },
    });
  },
};

export const gunblade = {
  id: 'revolver-gunblade', name: 'Revolver Gunblade', category: 'Pop culture', source: 'Final Fantasy VIII',
  blurb: '87 cm gunblade: broad blade with a hooked tip, revolver frame with chamber window and trigger guard, curved grip.',
  credit: 'Outlines traced from "Gunblade" by Chemvaldes (thingiverse.com/thing:3825730, CC BY-SA).',
  build() {
    const frame = uid(), handle = uid();
    return design('Revolver Gunblade', [
      blade('Blade', [
        P(-43, 169), P(37, 169), P(37, 189), P(34, 197), P(40, 202), P(36, 280), P(35, 399), P(34, 553, 'c'), P(32, 584, 'c'), P(25, 615, 'c'),
        P(24, 685, 's'), P(21, 685, 's'), P(3, 630, 'sc'), P(-10, 552, 'sc'), P(-21, 448, 'sc'), P(-25, 399, 's'), P(-43, 185, 's'),
      ], { thickness: 15, edge: 2, bevel: 20, filament: F.silver }),
      flat('Frame', [
        P(37.2, 169.4), P(37.1, 113.4), P(39.2, 101.9), P(39.3, 49.8), P(42.9, 40.6), P(43.1, 29.6), P(36.2, 29.4), P(40.2, 19.2), P(39.7, 12), P(36.7, 12),
        P(35.8, 16.6), P(28.7, 24.9), P(20.8, 16.5), P(19.1, -10.7), P(7.4, -11.8), P(4.9, -9.3), P(4.6, 0.9), P(-4.3, 8.3), P(-10.7, -11.4), P(-17.8, -9.2),
        P(-11.4, 10.5), P(-30.5, 12.8), P(-37.8, 9.7), P(-63, 26.9), P(-65, 30.6), P(-54.1, 67.1), P(-52.1, 68.8), P(-34.9, 73.7), P(-30.6, 77.2), P(-30.2, 109.5),
        P(-23.4, 110.2), P(-16.2, 113.5), P(-12.2, 118.9), P(-21, 147), P(-34.4, 154.9), P(-44.3, 157.5), P(-43.3, 169.7),
      ], 40, { color: C.dark, id: frame, filament: F.black }),
      flat('Chamber window', [P(29.5, 101.4), P(-22.9, 101.2), P(-22.8, 33.3), P(26, 33.1), P(28.8, 34.2)], 60, { op: 'subtract', target: frame }),
      flat('Trigger guard opening', [
        P(-30.5, 65.3), P(-35, 68.3), P(-51.4, 64.7), P(-60.5, 31.3), P(-44, 20.8), P(-36.1, 20.7), P(-30.3, 27.1), P(-30.4, 41.5), P(-42.6, 42.3), P(-45.7, 44.8),
        P(-45.8, 45.9), P(-42.6, 43.9), P(-38.8, 43.7), P(-30.4, 46.9),
      ], 60, { op: 'subtract', target: frame }),
      cyl('Revolver chamber', 25.7, 25.7, 64, [3, 67, 0], { color: C.steel, filament: F.silver }),
      cyl('Chamber pin', 4, 4, 80, [3, 67, 0], { color: C.steel, filament: F.silver }),
      flat('Grip', [
        P(-31.5, -8), P(-24.8, -8), P(-17, -8), P(4.8, -14.4), P(11.2, -18.9), P(14.7, -24.3), P(16.3, -33.6), P(4.5, -40.7), P(-1.3, -46.7), P(-10.6, -65.6),
        P(-13.7, -77.1), P(-16, -111.3), P(-20.5, -138.6), P(-36.6, -177.1), P(-42.1, -182.3), P(-59.1, -176.1), P(-65.5, -181.5), P(-81.8, -165.5), P(-75.8, -157.8),
        P(-80.7, -148), P(-80.5, -143.3), P(-55.8, -113.9), P(-48.4, -100.5), P(-44.6, -80.6), P(-48.3, -61), P(-46.8, -58.9), P(-36.7, -56.1), P(-30.7, -35.3),
        P(-26.6, -31.6), P(-31.9, -19.5),
      ], 28, { color: C.wrap, id: handle, filament: F.black }),
      flat('Lanyard hole', [P(-61, -173.9), P(-74.6, -159.6), P(-79.1, -165.5), P(-64.8, -178.7)], 60, { op: 'subtract', target: handle }),
    ], {
      features: [
        dowel('Grip rod', [-55, -130, 0], [-6, 120, 0], 6.35),
        dowel('Blade rod', [-2, 100, 0], [-2, 520, 0], 4),
      ],
      meta: { handle: { from: [-55, -130, 0], to: [-6, 120, 0] }, bayPos: [8, 135, 0], baySize: [40, 50, 22] },
    });
  },
};

export const zangetsu = {
  id: 'zangetsu', name: 'Zangetsu (Shikai)', category: 'Pop culture', source: 'Bleach',
  blurb: 'Ichigo\'s 1.7 m guardless cleaver: wide silver edge, clipped tip, long cloth-wrapped tang.',
  build() {
    return design('Zangetsu', [
      blade('Blade', [
        P(-110, 0), P(150, 0), P(176, 45, 's'), P(176, 880, 's'), P(150, 1060, 'sc'), P(70, 1180, 'sc'), P(-110, 1265, 's'), P(-110, 1235),
      ], { thickness: 16, edge: 2.4, bevel: 85, filament: F.silver }),
      flat('Tang', [P(-92, 10), P(-48, 10), P(-48, -430), P(-92, -430)], 14, { color: C.dark, filament: F.black }),
      lathe('Cloth wrap', gripPoints(-4, -428, 19, { ridges: 16, ridgeDepth: 1.5 }), { color: C.cloth, pos: [-70, 0, 0], sides: 10, stretch: [1, 1, 0.75], filament: F.silver }),
      lathe('Tang end', [P(15, -426), P(16, -436, 'c'), P(8, -444)], { color: C.dark, pos: [-70, 0, 0], stretch: [1, 1, 0.75], filament: F.black }),
    ], {
      features: [dowel('Handle dowel', [-70, -440, 0], [-70, 220, 0], 9.53)],
      meta: { handle: { from: [-70, -440, 0], to: [-70, 220, 0] }, bayPos: [20, 160, 0], baySize: [90, 60, 10] },
    });
  },
};

export const dragonSlayer = {
  id: 'dragon-slayer', name: 'Dragon Slayer', category: 'Pop culture', source: 'Berserk',
  blurb: 'Too big, too thick, too heavy, too rough. A two-metre iron slab.',
  build() {
    return design('Dragon Slayer', [
      blade('Blade', [P(0, 0), P(150, 0), P(156, 60, 's'), P(150, 1300, 's'), P(112, 1440, 'sc'), P(0, 1510, 's')],
        { symmetric: true, thickness: 30, edge: 6, bevel: 45, color: C.dark, filament: F.black }),
      box('Crossguard', [340, 48, 64], [0, -24, 0], { color: C.black, filament: F.black }),
      lathe('Grip', gripPoints(-46, -440, 22, { ridges: 14, ridgeDepth: 1.5 }), { color: C.leather, filament: F.brown }),
      lathe('Pommel', [P(22, -436), P(32, -452, 'c'), P(30, -480, 'c'), P(14, -494)], { color: C.black, filament: F.black }),
    ], {
      features: [dowel('Handle dowel', [0, -492, 0], [0, 300, 0], 12.7)],
      meta: { handle: { from: [0, -492, 0], to: [0, 300, 0] }, bayPos: [0, 200, 0], baySize: [100, 60, 16] },
    });
  },
};

export const masterSword = {
  id: 'master-sword', name: 'Master Sword', category: 'Pop culture', source: 'The Legend of Zelda: Breath of the Wild',
  blurb: '1.24 m life size: diamond-section blade, 250 mm swept guard with the Triforce gem, blue grip.',
  build() {
    const guard = uid();
    const F = { silver: 1, black: 2, gold: 4 }; // slot 2 is blue for this sword
    const d = design('Master Sword', [
      blade('Blade', [P(0, 0), P(25, 0), P(25, 18, 's'), P(21, 640, 's'), P(23.5, 800, 'sc'), P(0, 905, 's')],
        { symmetric: true, thickness: 9, edge: 1.6, bevel: 20, filament: F.silver }),
      flat('Guard', [
        P(0, -46), P(18, -46), P(30, -32, 'c'), P(64, -12, 'c'), P(108, 18, 'c'), P(125, 52), P(98, 32, 'c'), P(60, 14, 'c'), P(36, 13), P(28, 24), P(0, 24),
      ], 28, { symmetric: true, color: C.blue, id: guard, filament: F.black }),
      flat('Gem', [P(0, -34), P(10, -20), P(0, -6)], 32, { symmetric: true, color: C.gold, filament: F.gold }),
      lathe('Grip', gripPoints(-44, -264, 15, { ridges: 11, ridgeDepth: 0.8 }), { color: C.blue, sides: 8, filament: F.black }),
      flat('Pommel wings', [P(0, -262), P(22, -262), P(42, -280, 'c'), P(30, -300, 'c'), P(14, -292), P(0, -300)], 22, { symmetric: true, color: C.blue, filament: F.black }),
      lathe('Pommel cap', [P(15, -262), P(18, -282, 'c'), P(10, -306, 'c'), P(0, -312)], { color: C.gold, filament: F.gold }),
    ], {
      features: [
        dowel('Handle dowel', [0, -305, 0], [0, -10, 0], 9.53),
        dowel('Blade rod', [0, -230, 0], [0, 480, 0], 4),
      ],
      meta: { handle: { from: [0, -305, 0], to: [0, -10, 0] }, bayPos: [0, -150, 0], baySize: [14, 80, 14] },
    });
    d.filaments = [{ name: 'Silver', color: '#c3c8cf' }, { name: 'Blue', color: '#2b4c94' }, { name: 'Brown', color: '#7a4f2c' }, { name: 'Gold', color: '#d4a63a' }];
    return d;
  },
};

export const kingdomKey = {
  id: 'kingdom-key', name: 'Kingdom Key', category: 'Pop culture', source: 'Kingdom Hearts',
  blurb: '90 cm keyblade with crown teeth, gold loop guard and a keychain token.',
  build() {
    const guard = uid();
    return design('Kingdom Key', [
      cyl('Shaft', 13, 13, 620, [0, 310, 0], { color: C.steel, filament: F.silver }),
      flat('Teeth', [P(0, 520), P(40, 520), P(40, 548), P(70, 548), P(70, 520), P(112, 520), P(112, 580), P(86, 580), P(86, 602), P(60, 602), P(60, 620), P(0, 620)], 16, { color: C.steel, filament: F.silver }),
      flat('Guard', [P(0, -212), P(70, -212, 'c'), P(98, -150, 'c'), P(98, -30, 'c'), P(70, 12, 'c'), P(0, 12)], 22, { symmetric: true, color: C.gold, id: guard, filament: F.gold }),
      flat('Guard opening', [P(0, -186), P(52, -186, 'c'), P(72, -140, 'c'), P(72, -40, 'c'), P(52, -14, 'c'), P(0, -14)], 40,
        { symmetric: true, op: 'subtract', target: guard, color: C.gold }),
      lathe('Grip', gripPoints(0, -200, 15, { ridges: 8, ridgeDepth: 0.8 }), { color: C.black, filament: F.black }),
      cyl('Chain', 3, 3, 50, [0, -232, 0], { color: C.steel, filament: F.silver }),
      cyl('Token head', 22, 22, 8, [0, -278, 0], { rot: [90, 0, 0], color: C.steel, filament: F.silver }),
      cyl('Token ear L', 13, 13, 8, [-22, -252, 0], { rot: [90, 0, 0], color: C.steel, filament: F.silver }),
      cyl('Token ear R', 13, 13, 8, [22, -252, 0], { rot: [90, 0, 0], color: C.steel, filament: F.silver }),
    ], {
      features: [dowel('Shaft dowel', [0, -205, 0], [0, 560, 0], 9.53)],
      meta: { handle: { from: [0, -205, 0], to: [0, 560, 0] }, bayPos: [0, -100, 0], baySize: [16, 120, 16] },
    });
  },
};

export const leviathanAxe = {
  id: 'leviathan-axe', name: 'Leviathan Axe', category: 'Pop culture', source: 'God of War',
  blurb: '92 cm frost axe: 350 mm head with a long curved edge and hooked beard, wrapped haft.',
  build() {
    return design('Leviathan Axe', [
      lathe('Haft', [P(16, -10), P(16.5, 400, 'c'), P(15, 905)], { color: C.wood, filament: F.brown }),
      lathe('Handle wrap', gripPoints(320, 0, 18, { ridges: 12, ridgeDepth: 1 }), { color: C.leather, filament: F.black }),
      lathe('Pommel', [P(18, 4), P(26, -10, 'c'), P(24, -32, 'c'), P(10, -44)], { color: C.steel, filament: F.silver }),
      blade('Head', [
        P(14, 610), P(60, 598, 'c'), P(118, 560, 'c'), P(176, 528, 's'), P(214, 612, 'sc'), P(240, 740, 'sc'), P(232, 862, 's'), P(172, 852), P(100, 832, 'c'), P(14, 832),
      ], { thickness: 26, edge: 2.4, bevel: 50, filament: F.silver }),
      box('Back knob', [72, 64, 32], [-48, 728, 0], { color: C.steel, filament: F.silver }),
      lathe('Head collar', [P(24, 598), P(24, 844)], { color: C.dark, filament: F.black }),
      lathe('Top cap', [P(17, 842), P(20, 905, 'c'), P(10, 918)], { color: C.steel, filament: F.silver }),
    ], {
      features: [dowel('Haft dowel', [0, -40, 0], [0, 890, 0], 12.7)],
      meta: { handle: { from: [0, -40, 0], to: [0, 890, 0] }, bayPos: [120, 730, 0], baySize: [60, 80, 14] },
    });
  },
};

export const mjolnir = {
  id: 'mjolnir', name: 'Mjolnir', category: 'Pop culture', source: 'Thor (MCU)',
  blurb: '44 cm hammer: 215 × 135 mm chamfered head, 30 cm leather-wrapped handle, wrist loop.',
  build() {
    return design('Mjolnir', [
      blade('Head', [P(0, -67.5, 's'), P(95, -67.5, 's'), P(107.5, -55, 's'), P(107.5, 55, 's'), P(95, 67.5, 's'), P(0, 67.5, 's')],
        { symmetric: true, thickness: 135, edge: 105, bevel: 15, color: C.steel, filament: F.silver }),
      lathe('Handle', gripPoints(-64, -365, 17, { ridges: 11, ridgeDepth: 1.2 }), { color: C.leather, filament: F.brown }),
      lathe('Pommel', [P(18, -362), P(23, -372, 'c'), P(21, -390, 'c'), P(8, -398)], { color: C.steel, filament: F.silver }),
      ring('Strap loop', 18, 4, [0, -412, 0], { color: C.leather, filament: F.brown }),
    ], {
      features: [dowel('Handle dowel', [0, -398, 0], [0, 30, 0], 12.7)],
      meta: { handle: { from: [0, -398, 0], to: [0, 30, 0] }, bayPos: [0, 0, 0], baySize: [90, 70, 70], baySide: '+z' },
    });
  },
};

export const starShield = {
  id: 'star-shield', name: 'Star Shield', category: 'Pop culture', source: 'Captain America',
  blurb: '24 in (610 mm) dished shield, 60 mm deep, raised star, forearm strap loops and a hand grip on the back.',
  build() {
    // dish: height of the front surface at radius r (6 mm shell)
    const T = 6;
    const zf = (r) => 60 * (1 - (r / 305) ** 2) ** 0.9;
    const band = (name, r0, r1, color, filament) => {
      const pts = [];
      const n = 6;
      for (let i = 0; i <= n; i++) { const r = r0 + ((r1 - r0) * i) / n; pts.push(P(r, zf(r), i && i < n ? 'c' : '')); }
      for (let i = n; i >= 0; i--) { const r = r0 + ((r1 - r0) * i) / n; pts.push(P(r, zf(r) - T, i && i < n ? 'c' : '')); }
      return lathe(name, pts, { closedRing: true, rot: [90, 0, 0], sides: 144, color, filament });
    };
    const star = [];
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? 40 : 104;
      star.push(P(rr * Math.cos(a), rr * Math.sin(a)));
    }
    const centre = [P(0, zf(0)), P(56, zf(56), 'c'), P(113, zf(113)), P(113, zf(113) - T), P(56, zf(56) - T, 'c'), P(0, zf(0) - T)];
    // filament slots for this shield: 1 white, 2 blue, 3 red, 4 brown (straps)
    const d = design('Star Shield', [
      lathe('Centre', centre, { rot: [90, 0, 0], sides: 144, color: C.blue, filament: 2 }),
      band('Ring 1 (red)', 112, 165, C.red, 3),
      band('Ring 2 (white)', 164, 236, C.white, 1),
      band('Ring 3 (red)', 235, 305, C.red, 3),
      flat('Star', star, 8, { pos: [0, 0, zf(0) - 2], color: C.white, filament: 1 }),
    ], {
      features: [
        mount('Hand grip', 'grip', [0, -150], 0, { filament: 4 }),
        mount('Forearm strap loop L', 'loop', [-85, 70], 90, { filament: 4 }),
        mount('Forearm strap loop R', 'loop', [85, 70], 90, { filament: 4 }),
      ],
      meta: { bayPos: [0, 0, 40], baySize: [80, 80, 10], baySide: '-z', note: 'Run a 38 mm (1.5 in) strap through both loops and around your forearm; grip the handle with your hand.' },
    });
    d.filaments = [{ name: 'White', color: '#ecebe6' }, { name: 'Blue', color: '#2b4c94' }, { name: 'Red', color: '#a3262a' }, { name: 'Brown', color: '#7a4f2c' }];
    return d;
  },
};

export const laserSword = {
  id: 'laser-sword-hilt', name: 'Laser Sword Hilt', category: 'Sci-fi', source: 'Space opera',
  blurb: 'Hilt with emitter, grip ridges, battery bay and switch hole. Blade tube optional.',
  build() {
    const hilt = uid();
    return design('Laser Sword Hilt', [
      lathe('Hilt', [
        P(19, 0), P(19, 40), P(17, 44), P(17, 60), P(19.5, 64), P(19.5, 80), P(18, 84), P(18, 160), P(20, 164), P(20, 200),
        P(22, 206), P(26, 236, 'c'), P(25, 270), P(22, 280),
      ], { sides: 64, color: C.steel, id: hilt, filament: F.silver }),
      lathe('Grip ridges', gripPoints(150, 92, 18.6, { ridges: 7, ridgeDepth: 1.6 }), { color: C.black, sides: 64, filament: F.black }),
      cyl('Blade socket', 12.8, 12.8, 50, [0, 262, 0], { op: 'subtract', target: hilt }),
      cyl('Blade tube', 12.5, 12.5, 860, [0, 700, 0], { color: C.crystal, hidden: true }),
    ], {
      features: [
        bay('Battery + board bay', [0, 120, 0], [24, 150, 24], { lid: { side: '+z', ledge: 5.5, magnets: { enabled: true, diameter: 4.2, depth: 2.2 } } }),
        dowel('Switch hole', [0, 222, 0], [0, 222, 30], 12, { clearance: 0 }),
        dowel('LED channel', [0, 190, 0], [0, 245, 0], 10, { clearance: 0 }),
      ],
      meta: { bayPos: [0, 120, 0], baySize: [24, 150, 24] },
    });
  },
};

export const reaperScythe = {
  id: 'reaper-scythe', name: 'Reaper Scythe', category: 'Polearms', source: 'Grim reaper / fantasy',
  blurb: 'Snath that unscrews into sections for travel, long crescent blade and side grip.',
  build() {
    const d = design('Reaper Scythe', [
      lathe('Snath', [P(16, -1500), P(17, -700, 'c'), P(15, 230)], { color: C.wood, filament: F.brown }),
      blade('Blade', [
        P(25, 236), P(-200, 268, 'c'), P(-480, 236, 'c'), P(-700, 156, 'c'), P(-800, 56, 's'), P(-610, 118, 'sc'), P(-360, 158, 'sc'), P(-120, 166, 'sc'), P(10, 172, 's'), P(25, 176),
      ], { thickness: 10, edge: 1.6, bevel: 30, filament: F.silver }),
      box('Blade collar', [46, 90, 38], [0, 200, 0], { color: C.dark, filament: F.black }),
      cyl('Side grip', 12, 12, 140, [60, -520, 0], { rot: [0, 0, 90], color: C.wood, filament: F.brown }),
      lathe('End cap', [P(17, -1495), P(20, -1510, 'c'), P(10, -1522)], { color: C.dark, filament: F.black }),
    ], { meta: { handle: { from: [0, -1520, 0], to: [0, 200, 0] }, bayPos: [0, 200, 0], baySize: [20, 60, 20] } });
    d.split.defaultJoint = 'thread';
    return d;
  },
};

export default [busterSword, zangetsu, dragonSlayer, masterSword, kingdomKey, gunblade, leviathanAxe, mjolnir, starShield, laserSword, reaperScythe];
