import { P, COLORS as C, blade, flat, lathe, box, cyl, sphere, ring, gripPoints, dowel, design, curvedBlade, uid } from './helpers.js';

// pick a sensible filament slot from each part's colour (1 silver, 2 black,
// 3 brown, 4 gold)
const SLOT = { [C.steel]: 1, [C.white]: 1, [C.crystal]: 1, [C.cloth]: 1, [C.dark]: 2, [C.black]: 2, [C.blue]: 2, [C.wood]: 3, [C.leather]: 3, [C.wrap]: 3, [C.red]: 3, [C.gold]: 4, [C.brass]: 4 };
function withFilaments(d) {
  for (const p of d.parts) if (p.op !== 'subtract') p.filament = SLOT[p.color] || 1;
  return d;
}
const takeApart = (d, joint = 'thread') => { d.split.defaultJoint = joint; return d; };

const swordMeta = (bottom, top, bayY = (bottom + top) / 2) => ({
  handle: { from: [0, bottom, 0], to: [0, top, 0] }, bayPos: [0, bayY, 0], baySize: [16, 70, 16],
});

export const longsword = {
  id: 'longsword', name: 'Longsword', category: 'Swords', source: 'Medieval',
  blurb: 'Diamond-section double edge, flared crossguard, wheel pommel.',
  build() {
    return withFilaments(design('Longsword', [
      blade('Blade', [P(0, 0), P(27, 0), P(26, 15, 's'), P(20, 780, 's'), P(0, 900, 's')], { symmetric: true, thickness: 9, edge: 1.6, bevel: 22 }),
      flat('Crossguard', [P(0, -20), P(60, -18), P(110, -14, 'c'), P(120, -6, 'c'), P(120, 6, 'c'), P(110, 12), P(60, 10), P(0, 12)], 22, { symmetric: true }),
      lathe('Grip', gripPoints(-17, -232, 14, { swell: 2.5, ridges: 0 }), { color: C.leather, sides: 12 }),
      cyl('Pommel wheel', 30, 30, 20, [0, -256, 0], { rot: [90, 0, 0] }),
      cyl('Pommel boss', 14, 14, 30, [0, -256, 0], { rot: [90, 0, 0] }),
    ], { features: [dowel('Handle dowel', [0, -284, 0], [0, -6, 0], 9.53), dowel('Blade rod', [0, -200, 0], [0, 450, 0], 4)], meta: swordMeta(-284, -6) }));
  },
};

export const claymore = {
  id: 'claymore', name: 'Claymore', category: 'Swords', source: 'Scottish greatsword',
  blurb: 'Two-handed greatsword with forward-swept quillons and quatrefoils.',
  build() {
    return withFilaments(design('Claymore', [
      blade('Blade', [P(0, 0), P(30, 0), P(30, 110), P(28, 125, 's'), P(22, 950, 's'), P(0, 1060, 's')], { symmetric: true, thickness: 10, edge: 1.8, bevel: 22 }),
      flat('Crossguard', [P(0, -26), P(32, -26), P(120, 18), P(146, 52, 'c'), P(166, 74, 'c'), P(152, 90, 'c'), P(128, 74, 'c'), P(104, 38), P(32, 10), P(0, 10)], 24, { symmetric: true }),
      lathe('Grip', gripPoints(-26, -400, 16, { swell: 2, ridges: 0 }), { color: C.leather, sides: 12 }),
      sphere('Pommel', 30, [0, -425, 0]),
    ], { features: [dowel('Handle dowel', [0, -450, 0], [0, -10, 0], 9.53), dowel('Blade rod', [0, -300, 0], [0, 500, 0], 5)], meta: swordMeta(-450, -10) }));
  },
};

export const katana = {
  id: 'katana', name: 'Katana', category: 'Swords', source: 'Japanese',
  blurb: 'Curved single edge with kissaki tip, oval tsuba and ridged tsuka.',
  build() {
    return withFilaments(design('Katana', [
      blade('Blade', curvedBlade({ length: 710, baseWidth: 32, tipWidth: 24, sori: 18, tipLen: 50 }), { thickness: 7, edge: 1.4, bevel: 12 }),
      box('Habaki', [36, 30, 12], [0, 10, 0], { color: C.brass }),
      flat('Tsuba', [P(0, -40), P(30, -36, 'c'), P(41, 0, 'c'), P(30, 36, 'c'), P(0, 40)], 6, { symmetric: true, rot: [90, 0, 0], pos: [0, -3, 0], color: C.black }),
      cyl('Fuchi', 16, 16, 12, [0, -12, 0], { color: C.brass, stretch: [1, 1, 0.78] }),
      lathe('Tsuka', gripPoints(-16, -262, 15, { ridges: 11, ridgeDepth: 1 }), { color: C.black, stretch: [1, 1, 0.78] }),
      lathe('Kashira', [P(15, -260), P(16, -270, 'c'), P(9, -278)], { color: C.brass, stretch: [1, 1, 0.78] }),
    ], { features: [dowel('Handle dowel', [0, -276, 0], [0, -6, 0], 9.53), dowel('Blade rod', [0, -200, 0], [0, 300, 0], 3)], meta: swordMeta(-276, -6) }));
  },
};

export const scimitar = {
  id: 'scimitar', name: 'Scimitar', category: 'Swords', source: 'Middle Eastern',
  blurb: 'Strongly curved blade that widens toward the tip.',
  build() {
    return withFilaments(design('Scimitar', [
      blade('Blade', curvedBlade({ length: 760, baseWidth: 36, tipWidth: 52, sori: 90, tipLen: 120, belly: 6 }), { thickness: 7, edge: 1.4, bevel: 14 }),
      flat('Guard', [P(0, -16), P(50, -14), P(70, -4, 'c'), P(76, 12, 'c'), P(64, 8), P(44, 8), P(0, 10)], 16, { symmetric: true, color: C.brass }),
      lathe('Grip', gripPoints(-13, -150, 13, { swell: 1.5 }), { color: C.wood, sides: 12 }),
      lathe('Pommel', [P(13, -148), P(20, -156, 'c'), P(16, -172, 'c'), P(6, -178)], { color: C.brass }),
    ], { features: [dowel('Handle dowel', [0, -176, 0], [0, -6, 0], 6.35)], meta: swordMeta(-176, -6) }));
  },
};

export const dagger = {
  id: 'dagger', name: 'Dagger', category: 'Daggers', source: 'Generic',
  blurb: 'Double-edged dagger with simple guard and ball pommel.',
  build() {
    return withFilaments(design('Dagger', [
      blade('Blade', [P(0, 0), P(22, 0), P(20, 10, 's'), P(15, 180, 's'), P(0, 250, 's')], { symmetric: true, thickness: 7, edge: 1.4, bevel: 14 }),
      flat('Guard', [P(0, -14), P(55, -10), P(60, -4, 'c'), P(60, 4, 'c'), P(55, 8), P(0, 10)], 16, { symmetric: true }),
      lathe('Grip', gripPoints(-11, -120, 12, { ridges: 6, ridgeDepth: 0.8 }), { color: C.leather, sides: 10 }),
      sphere('Pommel', 17, [0, -130, 0]),
    ], { features: [dowel('Handle dowel', [0, -140, 0], [0, -4, 0], 6.35)], meta: swordMeta(-140, -4) }));
  },
};

export const kunai = {
  id: 'kunai', name: 'Kunai', category: 'Daggers', source: 'Ninja / anime',
  blurb: 'Leaf blade, wrapped handle and ring pommel.',
  build() {
    return withFilaments(design('Kunai', [
      blade('Blade', [P(0, 0), P(9, 0), P(22, 60, 'sc'), P(18, 112, 'sc'), P(0, 172, 's')], { symmetric: true, thickness: 8, edge: 1.6, bevel: 10 }),
      lathe('Handle', gripPoints(2, -120, 8, { ridges: 8, ridgeDepth: 1 }), { color: C.black, sides: 10 }),
      ring('Ring', 20, 5, [0, -142, 0], { color: C.dark }),
    ], { features: [dowel('Handle rod', [0, -118, 0], [0, 40, 0], 4)], meta: swordMeta(-118, 40) }));
  },
};

const axeHead = (pos = [0, 0, 0]) => blade('Head', [
  P(12, -35), P(60, -30), P(120, -110, 'c'), P(165, -140, 's'), P(186, 0, 'sc'), P(165, 140, 's'), P(120, 110, 'c'), P(60, 30), P(12, 35),
], { thickness: 24, edge: 2.5, bevel: 45, pos });

export const battleAxe = {
  id: 'battle-axe', name: 'Double Battle Axe', category: 'Axes', source: 'Fantasy',
  blurb: 'Twin crescent heads on a long haft.',
  build() {
    const head = axeHead([0, 40, 0]);
    head.copies = { mode: 'mirrorX', count: 2 };
    return withFilaments(design('Double Battle Axe', [
      lathe('Haft', [P(16, -720), P(17, -300, 'c'), P(16, 150)], { color: C.wood }),
      head,
      cyl('Socket', 26, 26, 100, [0, 40, 0], { color: C.dark }),
      lathe('Top spike', [P(18, 90), P(10, 140), P(0, 180)], { color: C.steel }),
      lathe('Wrap', gripPoints(-420, -700, 18, { ridges: 10, ridgeDepth: 1 }), { color: C.leather }),
      lathe('End cap', [P(18, -716), P(22, -728, 'c'), P(10, -742)], { color: C.dark }),
    ], { features: [dowel('Haft dowel', [0, -740, 0], [0, 100, 0], 12.7)], meta: { handle: { from: [0, -740, 0], to: [0, 100, 0] }, bayPos: [0, 40, 0], baySize: [24, 70, 16] } }));
  },
};

export const beardedAxe = {
  id: 'bearded-axe', name: 'Bearded Axe', category: 'Axes', source: 'Viking',
  blurb: 'Single bearded head with a long hooked edge.',
  build() {
    return withFilaments(design('Bearded Axe', [
      lathe('Haft', [P(15, -20), P(16, 300, 'c'), P(14, 780)], { color: C.wood }),
      blade('Head', [
        P(12, 640), P(40, 610, 'c'), P(70, 540, 'c'), P(102, 490, 's'), P(128, 560, 'sc'), P(142, 680, 'sc'), P(140, 760, 's'), P(100, 752), P(50, 742, 'c'), P(12, 742),
      ], { thickness: 20, edge: 2.2, bevel: 34 }),
      lathe('Head eye', [P(22, 630), P(22, 760)], { color: C.dark }),
      lathe('Pommel', [P(15, -16), P(20, -26, 'c'), P(8, -40)], { color: C.dark }),
    ], { features: [dowel('Haft dowel', [0, -38, 0], [0, 740, 0], 12.7)], meta: { handle: { from: [0, -38, 0], to: [0, 740, 0] }, bayPos: [60, 700, 0], baySize: [40, 50, 10] } }));
  },
};

export const warhammer = {
  id: 'warhammer', name: 'Warhammer', category: 'Hammers & maces', source: 'Medieval',
  blurb: 'Square hammer face with a back spike on a long haft.',
  build() {
    return withFilaments(design('Warhammer', [
      lathe('Haft', [P(15, -700), P(16, -300, 'c'), P(15, 120)], { color: C.wood }),
      box('Face', [90, 70, 70], [55, 60, 0], { color: C.steel }),
      blade('Back spike', [P(-20, 30), P(-60, 40, 'c'), P(-150, 62, 's'), P(-60, 80, 'c'), P(-20, 90)], { thickness: 30, edge: 3, bevel: 12, color: C.steel }),
      cyl('Socket', 25, 25, 110, [0, 60, 0], { color: C.dark }),
      lathe('Top spike', [P(16, 110), P(8, 160), P(0, 200)], { color: C.steel }),
      lathe('Wrap', gripPoints(-420, -690, 17, { ridges: 10, ridgeDepth: 1 }), { color: C.leather }),
    ], { features: [dowel('Haft dowel', [0, -700, 0], [0, 100, 0], 12.7)], meta: { handle: { from: [0, -700, 0], to: [0, 100, 0] }, bayPos: [55, 60, 0], baySize: [50, 40, 40] } }));
  },
};

export const flangedMace = {
  id: 'flanged-mace', name: 'Flanged Mace', category: 'Hammers & maces', source: 'Medieval',
  blurb: 'Seven radial flanges around a round head.',
  build() {
    const flange = blade('Flange', [P(18, 0), P(42, 12, 'c'), P(70, 60, 's'), P(66, 118, 's'), P(40, 156, 'c'), P(18, 160)], { thickness: 10, edge: 2, bevel: 10 });
    flange.copies = { mode: 'radial', count: 7 };
    return withFilaments(design('Flanged Mace', [
      lathe('Shaft', [P(15, -460), P(16, 0, 'c'), P(15, 150)], { color: C.wood }),
      lathe('Head core', [P(26, -6), P(30, 80, 'c'), P(24, 166)], { color: C.dark }),
      flange,
      lathe('Finial', [P(16, 160), P(14, 180, 'c'), P(0, 200)], { color: C.steel }),
      lathe('Grip', gripPoints(-260, -456, 17, { ridges: 8, ridgeDepth: 1 }), { color: C.leather }),
      lathe('Pommel', [P(17, -454), P(22, -466, 'c'), P(8, -480)], { color: C.dark }),
    ], { features: [dowel('Shaft dowel', [0, -478, 0], [0, 140, 0], 12.7)], meta: { handle: { from: [0, -478, 0], to: [0, 140, 0] }, bayPos: [0, 80, 0], baySize: [24, 80, 24] } }));
  },
};

export const morningStar = {
  id: 'morning-star', name: 'Morning Star', category: 'Hammers & maces', source: 'Medieval / fantasy',
  blurb: 'Spiked ball head on a short haft.',
  build() {
    const R = 70, H = 50, cy = 100;
    const spike = (name, tiltDeg, count) => {
      const t = (tiltDeg * Math.PI) / 180;
      const d = [Math.cos(t), Math.sin(t), 0];
      const dist = R + H / 2 - 6;
      const a = (Math.asin(d[2]) * 180) / Math.PI, b = (Math.atan2(-d[0], d[1]) * 180) / Math.PI;
      return cyl(name, 14, 0, H, [d[0] * dist, cy + d[1] * dist, d[2] * dist], { rot: [a, 0, b], sides: 24, copies: { mode: 'radial', count }, color: C.steel });
    };
    return withFilaments(design('Morning Star', [
      lathe('Haft', [P(16, -460), P(17, -100, 'c'), P(16, 40)], { color: C.wood }),
      sphere('Ball', R, [0, cy, 0], { color: C.dark }),
      spike('Equator spikes', 0, 8),
      spike('Upper spikes', 50, 6),
      spike('Lower spikes', -45, 6),
      cyl('Top spike', 14, 0, H, [0, cy + R + H / 2 - 6, 0], { sides: 24, color: C.steel }),
      lathe('Grip', gripPoints(-240, -456, 17, { ridges: 8, ridgeDepth: 1 }), { color: C.leather }),
    ], { features: [dowel('Haft dowel', [0, -470, 0], [0, 80, 0], 12.7)], meta: { handle: { from: [0, -470, 0], to: [0, 80, 0] }, bayPos: [0, cy, 0], baySize: [50, 50, 50] } }));
  },
};

export const spear = {
  id: 'spear', name: 'Spear', category: 'Polearms', source: 'Generic',
  blurb: 'Leaf-bladed spear whose shaft unscrews into sections (con-friendly for travel).',
  build() {
    return takeApart(withFilaments(design('Spear', [
      lathe('Shaft', [P(15, -1600), P(15, -800, 'c'), P(14, 20)], { color: C.wood }),
      lathe('Socket', [P(16, -90), P(18, -20, 'c'), P(13, 10)], { color: C.dark }),
      blade('Head', [P(0, 0), P(15, 0), P(36, 100, 'sc'), P(28, 210, 'sc'), P(0, 330, 's')], { symmetric: true, thickness: 10, edge: 1.6, bevel: 20 }),
      lathe('Butt cap', [P(15, -1590), P(17, -1610, 'c'), P(8, -1625)], { color: C.dark }),
    ], { features: [dowel('Head rod', [0, -200, 0], [0, 150, 0], 6.35)], meta: { handle: { from: [0, -1620, 0], to: [0, 120, 0] }, bayPos: [0, -60, 0], baySize: [16, 60, 16] } })));
  },
};

export const glaive = {
  id: 'glaive', name: 'Glaive / Naginata', category: 'Polearms', source: 'Medieval / Japanese',
  blurb: 'Curved single-edged blade on a polearm that unscrews into sections.',
  build() {
    return takeApart(withFilaments(design('Glaive', [
      lathe('Shaft', [P(15, -1300), P(16, -600, 'c'), P(15, 10)], { color: C.wood }),
      blade('Blade', curvedBlade({ length: 560, baseWidth: 40, tipWidth: 48, sori: 40, tipLen: 90, belly: 4 }), { thickness: 9, edge: 1.6, bevel: 16 }),
      lathe('Collar', [P(18, -70), P(18, 12)], { color: C.dark }),
      lathe('Butt cap', [P(15, -1290), P(17, -1310, 'c'), P(8, -1325)], { color: C.dark }),
    ], { features: [dowel('Blade rod', [0, -200, 0], [0, 250, 0], 4)], meta: { handle: { from: [0, -1320, 0], to: [0, 150, 0] }, bayPos: [0, -30, 0], baySize: [16, 60, 16] } })));
  },
};

export const roundShield = {
  id: 'round-shield', name: 'Round Shield', category: 'Shields', source: 'Viking',
  blurb: '80 cm board shield: hand hole behind a hollow domed boss, grip bar across it, carry-strap loops.',
  build() {
    const board = uid();
    return withFilaments(design('Round Shield', [
      lathe('Board', [P(0, 4), P(400, 4), P(400, -4), P(0, -4)], { rot: [90, 0, 0], sides: 160, color: C.wood, id: board }),
      cyl('Hand hole', 62, 62, 40, [0, 0, 0], { rot: [90, 0, 0], op: 'subtract', target: board }),
      lathe('Boss', [P(0, 72), P(52, 64, 'c'), P(76, 40, 'c'), P(84, 12), P(98, 9), P(98, 3), P(60, 3), P(70, 36, 'c'), P(48, 58, 'c'), P(0, 66)],
        { rot: [90, 0, 0], sides: 96, closedRing: true, color: C.steel }),
      lathe('Rim', [P(396, 6), P(404, 6, 'c'), P(408, 0, 'c'), P(404, -6, 'c'), P(396, -6)], { rot: [90, 0, 0], sides: 160, closedRing: true, color: C.leather }),
      box('Grip bar', [300, 32, 18], [0, 0, -12.5], { color: C.wood }),
    ], {
      features: [
        { id: uid('f'), type: 'mount', name: 'Carry strap loop L', style: 'loop', side: '-z', pos: [-170, 230], angle: 60, span: 46, gap: 6, bar: 9 },
        { id: uid('f'), type: 'mount', name: 'Carry strap loop R', style: 'loop', side: '-z', pos: [170, 230], angle: -60, span: 46, gap: 6, bar: 9 },
      ],
      meta: { bayPos: [0, 0, 30], baySize: [90, 90, 20], baySide: '-z', note: 'Your hand goes through the hole behind the boss and holds the grip bar.' },
    }));
  },
};

export const wizardStaff = {
  id: 'wizard-staff', name: 'Wizard Staff', category: 'Staffs & wands', source: 'Fantasy',
  blurb: '1.7 m staff that unscrews into short sections, three-prong claw, hexagonal crystal with an LED channel.',
  build() {
    const claw = blade('Claw prong', [P(12, -20), P(30, -10, 'c'), P(48, 30, 'c'), P(46, 90, 'c'), P(32, 140, 's'), P(34, 90, 'c'), P(30, 40, 'c'), P(10, 20)], { thickness: 14, edge: 3, bevel: 5, color: C.dark });
    claw.copies = { mode: 'radial', count: 3 };
    return takeApart(withFilaments(design('Wizard Staff', [
      lathe('Staff', [P(15, -1500), P(16, -1000, 'c'), P(18, -500, 'c'), P(20, 0)], { color: C.wood, sides: 16 }),
      lathe('Knots', gripPoints(-300, -700, 18.5, { ridges: 5, ridgeDepth: 2 }), { color: C.wood, sides: 16 }),
      lathe('Cup', [P(20, -10), P(30, 10, 'c'), P(26, 30)], { color: C.dark }),
      claw,
      lathe('Crystal', [P(0, 20), P(28, 50), P(28, 120), P(0, 170)], { sides: 6, color: C.crystal }),
    ], {
      features: [dowel('LED wire channel', [0, -240, 0], [0, 60, 0], 6, { clearance: 0 })],
      meta: { handle: { from: [0, -1500, 0], to: [0, -150, 0] }, bayPos: [0, -120, 0], baySize: [20, 110, 20] },
    })));
  },
};

export const blankBlade = {
  id: 'blank-blade', name: 'Blank Sword (start here)', category: 'Swords', source: 'Starter',
  blurb: 'A plain sword to reshape into your own design.',
  build() {
    return withFilaments(design('My Sword', [
      blade('Blade', [P(0, 0), P(30, 0), P(30, 20, 's'), P(28, 650, 's'), P(0, 760, 's')], { symmetric: true, thickness: 10, edge: 1.8, bevel: 20 }),
      box('Guard', [180, 26, 30], [0, -13, 0], { color: C.dark }),
      lathe('Grip', gripPoints(-26, -230, 15, { ridges: 8, ridgeDepth: 1 }), { color: C.leather }),
      sphere('Pommel', 22, [0, -245, 0], { color: C.dark }),
    ], { features: [dowel('Handle dowel', [0, -266, 0], [0, 150, 0], 6.35)], meta: swordMeta(-266, 150, -130) }));
  },
};

export default [blankBlade, longsword, claymore, katana, scimitar, dagger, kunai, battleAxe, beardedAxe, warhammer, flangedMace, morningStar, spear, glaive, roundShield, wizardStaff];
