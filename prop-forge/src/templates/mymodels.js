// Templates made from the creator's own models. New weapons are added here
// once the creator has supplied a reference (see wishlist.js).
import { COLORS as C, box, cyl, sphere, dowel, design, uid } from './helpers.js';
import { MODEL_THUMBS, hasModel } from './models.js';

const meshPart = (name, key, o = {}) => ({
  id: uid(), name, type: 'mesh', op: 'add', meshRef: `builtin:${key}`, unit: 1,
  color: o.color || C.steel, pos: o.pos || [0, 0, 0], rot: o.rot || [0, 0, 0], stretch: [1, 1, 1],
  copies: { mode: 'none', count: 2 }, filament: o.filament || 1, ...(o.separate ? { separate: true } : {}),
});
const zone = (name, part, filament) => ({ ...part, name, op: 'paint', color: '#8f6bd8', filament });
const thumbOf = (keys, colors) => keys.flatMap((k, i) => (MODEL_THUMBS[k] || []).map((poly) => ({ poly, color: colors[Math.min(i, colors.length - 1)] })));
const palette = (...names) => names.map(([name, color]) => ({ name, color }));

export const busterModel = {
  id: 'buster-sword-model', name: 'Buster Sword', category: 'Final Fantasy', source: 'Final Fantasy VII / Crisis Core',
  blurb: '1:1, 1.8 m. Engraved hilt, circuit grooves, materia holes. Filament zones colour the hilt and grip.',
  credit: 'Your model · thingiverse.com/thing:1794243',
  models: ['buster'],
  thumb: () => thumbOf(['buster'], [C.steel]),
  build() {
    return design('Buster Sword', [
      meshPart('Buster Sword', 'buster'),
      zone('Hilt zone', box('', [240, 75, 90], [0, -37.5, 0]), 2),
      zone('Grip zone', cyl('', 26, 26, 393, [0, -271.5, 0]), 3),
    ], {
      features: [dowel('Handle dowel', [0, -484, 0], [0, 260, 0], 12.7)],
      meta: { handle: { from: [0, -484, 0], to: [0, 260, 0] }, bayPos: [0, 90, 0], baySize: [70, 40, 20] },
    });
  },
};

export const gunbladeModel = {
  id: 'revolver-gunblade-model', name: 'Revolver Gunblade', category: 'Final Fantasy', source: 'Final Fantasy VIII',
  blurb: '87 cm. Blade, tip, frame and grips assembled, with a chamber that turns on a pin.',
  credit: 'Your model · thingiverse.com/thing:3825730 (chamber and pin rebuilt as clean cylinders)',
  models: ['gunblade_blade', 'gunblade_blade_tip', 'gunblade_frame', 'gunblade_handle'],
  thumb: () => thumbOf(['gunblade_blade', 'gunblade_blade_tip', 'gunblade_frame', 'gunblade_handle'], [C.steel, C.steel, C.dark, C.wrap]),
  build() {
    return design('Revolver Gunblade', [
      meshPart('Blade', 'gunblade_blade'),
      meshPart('Blade tip', 'gunblade_blade_tip'),
      meshPart('Frame', 'gunblade_frame', { color: C.dark, filament: 2 }),
      meshPart('Grip', 'gunblade_handle', { color: C.wrap, filament: 3 }),
      cyl('Revolver chamber', 25.7, 25.7, 64, [3, 67, 0], { color: C.steel }),
      cyl('Chamber pin', 4, 4, 80, [3, 67, 0], { color: C.steel }),
    ], {
      features: [dowel('Blade rod', [-2, 100, 0], [-2, 520, 0], 4)],
      meta: { handle: { from: [-55, -130, 0], to: [-6, 120, 0] }, bayPos: [8, 135, 0], baySize: [40, 50, 22] },
    });
  },
};

export const zangetsuModel = {
  id: 'zangetsu-v1', name: 'Zangetsu (V1)', category: 'Bleach', source: 'Bleach',
  blurb: 'Shikai Zangetsu with its long tang handle. The file is 271 units long; scaled here to 1.70 m (change "Overall length").',
  credit: 'Your model · unreleased',
  models: ['zangetsu_v1'],
  thumb: () => thumbOf(['zangetsu_v1'], [C.steel]),
  build() {
    const d = design('Zangetsu', [
      meshPart('Zangetsu', 'zangetsu_v1'),
      zone('Handle wrap zone', box('', [12, 64, 8], [8.9, -44, 1.5]), 2),
    ], {
      features: [dowel('Handle dowel', [8.9, -71, 1.5], [8.6, -8, 1.5], 9.53)],
      meta: { handle: { from: [8.9, -71, 1.5], to: [8.6, -8, 1.5] }, bayPos: [-4, 60, 1.5], baySize: [40, 80, 10] },
    });
    d.scale = 1700 / 270.8;
    d.filaments = palette(['Silver', '#c3c8cf'], ['White (wrap)', '#ecebe6'], ['Black', '#2b2d31'], ['Red', '#a3262a']);
    return d;
  },
};

export const tanjiroModel = {
  id: 'tanjiro-katana', name: 'Tanjiro\'s Katana', category: 'Demon Slayer', source: 'Demon Slayer',
  blurb: '89 cm nichirin katana, already split into your 7 print pieces, kept as 7 separate pieces.',
  credit: 'Your model · thingiverse.com/thing:4708245',
  models: ['tanjiro_pt1', 'tanjiro_pt2', 'tanjiro_pt3', 'tanjiro_pt4', 'tanjiro_pt5', 'tanjiro_pt6', 'tanjiro_pt7'],
  thumb: () => thumbOf(['tanjiro_pt1', 'tanjiro_pt2', 'tanjiro_pt3', 'tanjiro_pt4', 'tanjiro_pt6', 'tanjiro_pt5', 'tanjiro_pt7'], [C.black, C.black, C.black, C.black, C.black, C.black, C.dark]),
  build() {
    const d = design('Tanjiro Katana', [
      // already cut into print pieces, so each one stays its own piece
      meshPart('Blade tip (pt1)', 'tanjiro_pt1', { color: C.black, separate: true }),
      meshPart('Blade (pt2)', 'tanjiro_pt2', { color: C.black, separate: true }),
      meshPart('Blade (pt3)', 'tanjiro_pt3', { color: C.black, separate: true }),
      meshPart('Blade base + tang (pt4)', 'tanjiro_pt4', { color: C.black, separate: true }),
      meshPart('Handle (pt6)', 'tanjiro_pt6', { color: C.black, filament: 2, separate: true }),
      meshPart('Handle end (pt5)', 'tanjiro_pt5', { color: C.black, filament: 2, separate: true }),
      meshPart('Tsuba (pt7)', 'tanjiro_pt7', { color: C.dark, separate: true }),
    ], { meta: { bayPos: [0, -200, 0], baySize: [14, 80, 14] } });
    d.filaments = palette(['Black', '#2b2d31'], ['Black (handle)', '#1d1f22'], ['Red', '#a3262a'], ['Silver', '#c3c8cf']);
    return d;
  },
};

export const makaModel = {
  id: 'maka-scythe-parts', name: 'Maka\'s Scythe topper + Soul\'s buttons', category: 'Soul Eater', source: 'Soul Eater',
  blurb: 'Eye topper that screws onto a 17 mm rod, blade shims for board blades, and Soul\'s X cuff buttons. Eye whites as a filament zone.',
  credit: 'Your model · thingiverse.com/thing:1863433',
  models: ['maka_top', 'maka_shim', 'maka_shim2', 'maka_button', 'maka_pin'],
  thumb: () => thumbOf(['maka_top', 'maka_shim', 'maka_shim2', 'maka_button', 'maka_pin'], [C.steel, C.wood, C.wood, C.white, C.dark]),
  build() {
    const d = design('Maka Scythe parts', [
      meshPart('Scythe topper', 'maka_top'),
      zone('Eye white (left)', { ...sphere('', 10.6, [0, 70, 10]), stretch: [1, 3.5, 1] }, 2),
      zone('Eye white (right)', { ...sphere('', 10.6, [0, 70, -10]), stretch: [1, 3.5, 1] }, 2),
      meshPart('Blade shim (2 mm)', 'maka_shim', { color: C.wood }),
      meshPart('Blade shim (3 mm)', 'maka_shim2', { color: C.wood }),
      meshPart('Cuff button', 'maka_button', { color: C.white, filament: 2 }),
      meshPart('Cuff button pin', 'maka_pin', { color: C.dark, filament: 3 }),
    ], { meta: { bayPos: [0, 120, 0], baySize: [14, 60, 14] } });
    d.filaments = palette(['Silver', '#c3c8cf'], ['White', '#ecebe6'], ['Black', '#2b2d31'], ['Red', '#a3262a']);
    return d;
  },
};

export const MY_MODELS = [busterModel, gunbladeModel, zangetsuModel, tanjiroModel, makaModel]
  .filter((t) => t.models.every(hasModel));
