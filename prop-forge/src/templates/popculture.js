import { P, COLORS as C, blade, flat, lathe, box, cyl, sphere, hole, ring, gripPoints, dowel, bay, design, uid } from './helpers.js';

export const busterSword = {
  id: 'buster-sword', name: 'Buster Sword', category: 'Pop culture', source: 'Final Fantasy VII',
  blurb: 'Huge single-edged slab with the two materia holes in the base plate.',
  build() {
    return design('Buster Sword', [
      blade('Blade', [
        P(-135, 0), P(132, 0), P(138, 30, 's'), P(138, 1060, 's'), P(70, 1165, 'sc'), P(-135, 1250, 's'), P(-135, 1215),
      ], { thickness: 22, edge: 3, bevel: 70 }),
      flat('Base plate', [P(-142, -6), P(142, -6), P(142, 200), P(-142, 200)], 27, { color: C.dark }),
      hole('Materia hole 1', 24, [-52, 100, 0], 60, { color: C.dark }),
      hole('Materia hole 2', 24, [52, 100, 0], 60, { color: C.dark }),
      ...[[-110, 30], [110, 30], [-110, 170], [110, 170]].map(([x, y], i) =>
        sphere(`Rivet ${i + 1}`, 7, [x, y, 12.5], { color: C.steel, sides: 24, copies: { mode: 'mirrorZ', count: 2 } })),
      box('Hilt block', [90, 60, 52], [0, -36, 0], { color: C.dark }),
      lathe('Collar', [P(32, -66), P(32, -96), P(20, -106)], { color: C.steel }),
      lathe('Grip', gripPoints(-104, -420, 17, { ridges: 12, ridgeDepth: 1.2 }), { color: C.wrap }),
      lathe('Pommel', [P(18, -418), P(27, -432, 'c'), P(26, -458, 'c'), P(12, -472)], { color: C.steel }),
    ], {
      features: [dowel('Handle dowel', [0, -470, 0], [0, 260, 0], 9.53)],
      meta: { handle: { from: [0, -470, 0], to: [0, 260, 0] }, bayPos: [0, 168, 0], baySize: [80, 40, 14] },
    });
  },
};

export const zangetsu = {
  id: 'zangetsu', name: 'Zangetsu (Shikai)', category: 'Pop culture', source: 'Bleach',
  blurb: 'Ichigo\'s guardless cleaver with a cloth-wrapped tang and ring.',
  build() {
    return design('Zangetsu', [
      blade('Blade', [
        P(-110, 0), P(150, 0), P(176, 45, 's'), P(176, 880, 's'), P(150, 1060, 'sc'), P(70, 1180, 'sc'), P(-110, 1265, 's'), P(-110, 1235),
      ], { thickness: 16, edge: 2.4, bevel: 85 }),
      flat('Tang', [P(-92, 10), P(-48, 10), P(-48, -430), P(-92, -430)], 14, { color: C.dark }),
      lathe('Cloth wrap', gripPoints(-4, -428, 19, { ridges: 16, ridgeDepth: 1.5 }), { color: C.cloth, pos: [-70, 0, 0], sides: 10, stretch: [1, 1, 0.75] }),
      ring('Pommel ring', 16, 5, [-70, -446, 0], { color: C.dark }),
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
        { symmetric: true, thickness: 30, edge: 6, bevel: 45, color: C.dark }),
      box('Crossguard', [340, 48, 64], [0, -24, 0], { color: C.black }),
      lathe('Grip', gripPoints(-46, -440, 22, { ridges: 14, ridgeDepth: 1.5 }), { color: C.leather }),
      lathe('Pommel', [P(22, -436), P(32, -452, 'c'), P(30, -480, 'c'), P(14, -494)], { color: C.black }),
    ], {
      features: [dowel('Handle dowel', [0, -492, 0], [0, 300, 0], 12.7)],
      meta: { handle: { from: [0, -492, 0], to: [0, 300, 0] }, bayPos: [0, 200, 0], baySize: [100, 60, 16] },
    });
  },
};

export const masterSword = {
  id: 'master-sword', name: 'Master Sword', category: 'Pop culture', source: 'The Legend of Zelda',
  blurb: 'Slim double-edged blade, swept wing guard with a gem, blue grip.',
  build() {
    const guard = uid();
    return design('Master Sword', [
      blade('Blade', [P(0, 0), P(25, 0), P(24, 12, 's'), P(20, 560, 's'), P(21, 700, 'sc'), P(0, 800, 's')],
        { symmetric: true, thickness: 8, edge: 1.6, bevel: 14 }),
      flat('Guard', [
        P(0, -44), P(18, -44), P(30, -30, 'c'), P(64, -10, 'c'), P(108, 18, 'c'), P(126, 50), P(98, 30, 'c'), P(60, 12, 'c'), P(36, 12), P(28, 22), P(0, 22),
      ], 26, { symmetric: true, color: C.blue, id: guard }),
      flat('Gem', [P(0, -32), P(9, -20), P(0, -6)], 30, { symmetric: true, color: C.gold }),
      lathe('Grip', gripPoints(-42, -232, 14, { ridges: 10, ridgeDepth: 0.8 }), { color: C.blue, sides: 8 }),
      lathe('Pommel', [P(14, -230), P(21, -242, 'c'), P(19, -264, 'c'), P(8, -276)], { color: C.gold }),
    ], {
      features: [
        dowel('Handle dowel', [0, -274, 0], [0, -10, 0], 9.53),
        dowel('Blade rod', [0, -200, 0], [0, 450, 0], 4),
      ],
      meta: { handle: { from: [0, -274, 0], to: [0, -10, 0] }, bayPos: [0, -137, 0], baySize: [14, 80, 14] },
    });
  },
};

export const kingdomKey = {
  id: 'kingdom-key', name: 'Kingdom Key', category: 'Pop culture', source: 'Kingdom Hearts',
  blurb: 'Keyblade with crown teeth, loop guard and a keychain token.',
  build() {
    const guard = uid();
    return design('Kingdom Key', [
      cyl('Shaft', 13, 13, 620, [0, 310, 0], { color: C.steel }),
      flat('Teeth', [P(0, 520), P(40, 520), P(40, 548), P(70, 548), P(70, 520), P(112, 520), P(112, 580), P(86, 580), P(86, 602), P(60, 602), P(60, 620), P(0, 620)], 16, { color: C.steel }),
      flat('Guard', [P(0, -212), P(70, -212, 'c'), P(98, -150, 'c'), P(98, -30, 'c'), P(70, 12, 'c'), P(0, 12)], 22, { symmetric: true, color: C.gold, id: guard }),
      flat('Guard opening', [P(0, -186), P(52, -186, 'c'), P(72, -140, 'c'), P(72, -40, 'c'), P(52, -14, 'c'), P(0, -14)], 40,
        { symmetric: true, op: 'subtract', target: guard, color: C.gold }),
      lathe('Grip', gripPoints(0, -200, 15, { ridges: 8, ridgeDepth: 0.8 }), { color: C.black }),
      cyl('Chain', 3, 3, 50, [0, -232, 0], { color: C.steel }),
      cyl('Token head', 22, 22, 8, [0, -278, 0], { rot: [90, 0, 0], color: C.steel }),
      cyl('Token ear L', 13, 13, 8, [-22, -252, 0], { rot: [90, 0, 0], color: C.steel }),
      cyl('Token ear R', 13, 13, 8, [22, -252, 0], { rot: [90, 0, 0], color: C.steel }),
    ], {
      features: [dowel('Shaft dowel', [0, -205, 0], [0, 560, 0], 9.53)],
      meta: { handle: { from: [0, -205, 0], to: [0, 560, 0] }, bayPos: [0, -100, 0], baySize: [16, 120, 16] },
    });
  },
};

export const gunblade = {
  id: 'revolver-gunblade', name: 'Revolver Gunblade', category: 'Pop culture', source: 'Final Fantasy VIII',
  blurb: 'Blade on a revolver body with drum, trigger guard and angled grip.',
  build() {
    const tg = uid();
    return design('Revolver Gunblade', [
      blade('Blade', [P(-32, 0), P(36, 0), P(42, 22, 's'), P(42, 700, 's'), P(26, 790, 'sc'), P(-32, 840, 's'), P(-32, 810)],
        { thickness: 9, edge: 1.6, bevel: 18 }),
      flat('Receiver', [P(-48, 6), P(48, 6), P(50, -150), P(-52, -150), P(-60, -60)], 34, { color: C.dark }),
      cyl('Cylinder drum', 31, 31, 64, [0, -80, 0], { color: C.steel, sides: 6 }),
      box('Hammer', [18, 26, 12], [-58, -146, 0], { color: C.dark, rot: [0, 0, 25] }),
      flat('Grip', [P(-50, -150), P(30, -150), P(18, -230, 'c'), P(22, -330), P(-40, -338, 'c'), P(-66, -250, 'c')], 30, { color: C.black }),
      flat('Trigger guard', [P(24, -148), P(76, -150), P(82, -186, 'c'), P(62, -218, 'c'), P(18, -214)], 14, { color: C.dark, id: tg }),
      flat('Guard opening', [P(32, -158), P(66, -160), P(70, -184, 'c'), P(56, -204, 'c'), P(28, -200)], 40, { op: 'subtract', target: tg }),
      flat('Trigger', [P(40, -146), P(48, -146), P(52, -185, 'c'), P(44, -195)], 8, { color: C.steel }),
    ], {
      features: [dowel('Grip rod', [-12, -330, 0], [-8, -20, 0], 9.53), dowel('Blade rod', [0, -120, 0], [0, 420, 0], 4)],
      meta: { handle: { from: [-12, -330, 0], to: [-8, -20, 0] }, bayPos: [0, -60, 0], baySize: [50, 80, 18] },
    });
  },
};

export const leviathanAxe = {
  id: 'leviathan-axe', name: 'Leviathan Axe', category: 'Pop culture', source: 'God of War',
  blurb: 'Bearded frost axe with wrapped handle and pommel knob.',
  build() {
    return design('Leviathan Axe', [
      lathe('Haft', [P(16, -10), P(15, 300, 'c'), P(14, 560)], { color: C.wood }),
      lathe('Handle wrap', gripPoints(230, 0, 17, { ridges: 10, ridgeDepth: 1 }), { color: C.leather }),
      lathe('Pommel', [P(17, 2), P(24, -10, 'c'), P(22, -32, 'c'), P(10, -42)], { color: C.steel }),
      blade('Head', [
        P(12, 400), P(45, 380, 'c'), P(82, 330, 'c'), P(118, 288, 's'), P(142, 350, 'sc'), P(160, 450, 'sc'), P(165, 540, 's'), P(118, 535), P(60, 522, 'c'), P(12, 520),
      ], { thickness: 24, edge: 2.4, bevel: 38 }),
      box('Back spike', [44, 56, 26], [-32, 470, 0], { color: C.steel }),
      lathe('Head collar', [P(22, 380), P(22, 545)], { color: C.dark }),
    ], {
      features: [dowel('Haft dowel', [0, -40, 0], [0, 540, 0], 12.7)],
      meta: { handle: { from: [0, -40, 0], to: [0, 540, 0] }, bayPos: [70, 455, 0], baySize: [50, 60, 12] },
    });
  },
};

export const mjolnir = {
  id: 'mjolnir', name: 'Mjolnir', category: 'Pop culture', source: 'Thor / Norse myth',
  blurb: 'Chamfered hammer head with a wrapped handle and wrist strap loop.',
  build() {
    return design('Mjolnir', [
      blade('Head', [P(0, -62.5, 's'), P(93, -62.5, 's'), P(105, -50.5, 's'), P(105, 50.5, 's'), P(93, 62.5, 's'), P(0, 62.5, 's')],
        { symmetric: true, thickness: 125, edge: 100, bevel: 12.5, color: C.steel }),
      lathe('Handle', gripPoints(-60, -285, 17, { ridges: 9, ridgeDepth: 1.2 }), { color: C.leather }),
      lathe('Pommel', [P(18, -282), P(23, -292, 'c'), P(21, -308, 'c'), P(8, -316)], { color: C.steel }),
      ring('Strap loop', 18, 4, [0, -330, 0], { color: C.leather }),
    ], {
      features: [dowel('Handle dowel', [0, -316, 0], [0, 30, 0], 12.7)],
      meta: { handle: { from: [0, -316, 0], to: [0, 30, 0] }, bayPos: [0, 0, 0], baySize: [90, 60, 60], baySide: '+z' },
    });
  },
};

export const starShield = {
  id: 'star-shield', name: 'Star Shield', category: 'Pop culture', source: 'Captain America',
  blurb: '24" concentric dish with a raised star and back straps.',
  build() {
    const r = (name, r0, r1, z0, z1, color) => lathe(name,
      [P(r0, z0), P(r1, z1), P(r1, z1 - 7), P(r0, z0 - 7)], { closedRing: true, rot: [90, 0, 0], sides: 120, color });
    const star = [];
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? 40 : 104;
      star.push(P(rr * Math.cos(a), rr * Math.sin(a)));
    }
    return design('Star Shield', [
      lathe('Centre', [P(0, 24), P(113, 22.5), P(113, 15.5), P(0, 17)], { rot: [90, 0, 0], sides: 120, color: C.blue }),
      r('Ring 1', 112, 173, 21, 17, C.red),
      r('Ring 2', 172, 235, 16.5, 11, C.white),
      r('Ring 3', 234, 305, 10.5, 2, C.red),
      flat('Star', star, 6, { pos: [0, 0, 24], color: C.white }),
      box('Strap 1', [36, 220, 12], [-70, 0, 9], { color: C.leather }),
      box('Strap 2', [36, 220, 12], [70, 0, 9], { color: C.leather }),
    ], { meta: { bayPos: [0, 0, 8], baySize: [80, 80, 10], baySide: '-z' } });
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
      ], { sides: 64, color: C.steel, id: hilt }),
      lathe('Grip ridges', gripPoints(150, 92, 18.6, { ridges: 7, ridgeDepth: 1.6 }), { color: C.black, sides: 64 }),
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
  blurb: 'Tall snath with a long crescent blade and side grip.',
  build() {
    return design('Reaper Scythe', [
      lathe('Snath', [P(16, -1500), P(17, -700, 'c'), P(15, 230)], { color: C.wood }),
      blade('Blade', [
        P(25, 236), P(-200, 268, 'c'), P(-480, 236, 'c'), P(-700, 156, 'c'), P(-800, 56, 's'), P(-610, 118, 'sc'), P(-360, 158, 'sc'), P(-120, 166, 'sc'), P(10, 172, 's'), P(25, 176),
      ], { thickness: 10, edge: 1.6, bevel: 30 }),
      box('Blade collar', [46, 90, 38], [0, 200, 0], { color: C.dark }),
      cyl('Side grip', 12, 12, 140, [60, -520, 0], { rot: [0, 0, 90], color: C.wood }),
      lathe('End cap', [P(17, -1495), P(20, -1510, 'c'), P(10, -1522)], { color: C.dark }),
    ], {
      features: [dowel('Snath dowel', [0, -1520, 0], [0, 200, 0], 12.7)],
      meta: { handle: { from: [0, -1520, 0], to: [0, 200, 0] }, bayPos: [0, 200, 0], baySize: [20, 60, 20] },
    });
  },
};

export default [busterSword, zangetsu, dragonSlayer, masterSword, kingdomKey, gunblade, leviathanAxe, mjolnir, starShield, laserSword, reaperScythe];
