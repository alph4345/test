import test from 'node:test';
import assert from 'node:assert/strict';
import { initManifold, withArena } from '../src/engine/manifold.js';
import { runBuild } from '../src/engine/index.js';
import { TagMap, buildModel } from '../src/engine/build.js';
import { splitModel } from '../src/engine/split.js';
import { P, blade, flat, lathe, box, design } from '../src/templates/helpers.js';
import { build3MF } from '../src/ui/threemf.js';
import { parseSTL, repairMesh } from '../src/ui/stlimport.js';

const M = await initManifold();

const staff = () => ({ scale: 1, parts: [{ id: 'a', name: 'Staff', type: 'lathe', sides: 48, pos: [0, 0, 0], rot: [0, 0, 0], points: [{ x: 16, y: 0 }, { x: 16, y: 600 }] }], features: [] });

test('screw thread joint unscrews without colliding', () => {
  withArena(() => {
    const tags = new TagMap();
    const { model } = buildModel(M, staff(), tags);
    const { pieces, reports } = splitModel(M, model, [{ id: 'c', axis: 'y', pos: 300, joints: [{ type: 'thread', pitch: 5 }] }], tags);
    assert.match(reports[0].notes[0], /screw thread/);
    const [A, B] = pieces.map((p) => p.m);
    assert.ok(A.intersect(B).volume() < 0.01, 'assembled pieces overlap');
    for (const deg of [30, 90, 180, 400]) {
      const moved = A.rotate([0, -deg, 0]).translate([0, (-5 * deg) / 360, 0]);
      assert.ok(moved.intersect(B).volume() < 0.5, `collides after ${deg}°`);
    }
  });
});

test('threaded rod + insert joint drills both pieces and lists hardware', () => {
  withArena(() => {
    const tags = new TagMap();
    const { model } = buildModel(M, staff(), tags);
    const { pieces, reports } = splitModel(M, model, [{ id: 'c', axis: 'y', pos: 300, joints: [{ type: 'hardware', size: 'M8' }] }], tags);
    assert.equal(pieces.length, 2);
    assert.ok(pieces.every((p) => p.m.genus() === 0 && p.m.volume() < model.volume() / 2));
    assert.match(reports[0].bom[0].text, /M8 threaded rod/);
  });
});

// a 610 mm dished shield, 6 mm shell, like the old star shield fixture
function shield() {
  const zf = (r) => 60 * (1 - (r / 305) ** 2) ** 0.9;
  const pts = [];
  for (let i = 0; i <= 8; i++) { const r = (305 * i) / 8; pts.push(P(r, zf(r), i && i < 8 ? 'c' : '')); }
  for (let i = 8; i >= 0; i--) { const r = (305 * i) / 8; pts.push(P(r, zf(r) - 6, i && i < 8 ? 'c' : '')); }
  const d = design('Shield', [lathe('Dish', pts, { closedRing: true, rot: [90, 0, 0], sides: 96 })]);
  d.features = [
    { id: 'g', type: 'mount', name: 'Hand grip', style: 'grip', side: '-z', pos: [0, -150], angle: 0, span: 120, gap: 38, bar: 28 },
    { id: 'l1', type: 'mount', name: 'Loop L', style: 'loop', side: '-z', pos: [-85, 70], angle: 90, span: 46, gap: 6, bar: 9 },
    { id: 'l2', type: 'mount', name: 'Loop R', style: 'loop', side: '-z', pos: [85, 70], angle: 90, span: 46, gap: 6, bar: 9 },
  ];
  return d;
}

test('shield grip and strap loops attach to the curved back', () => {
  const d = shield();
  const r = runBuild(M, d);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.pieces.length, 1, 'hardware fused to the shield');
  assert.ok(r.pieces[0].bbox.min[2] < -20, 'grip stands off the back');
});

test('blade outlines get a real edge grind (no silent flat fallback)', () => {
  const outlines = {
    // long straight edges with collinear points (used to break the triangulation)
    cleaver: { pts: [P(-102.5, 0), P(102.5, 0), P(102.5, 1327, 's'), P(-102.5, 991, 's'), P(-102.5, 200, 's'), P(-102.5, 185)], t: 41, e: 2.4, b: 60 },
    // axe head that used to fall back to flat
    axe: { pts: [P(12, -35), P(60, -30), P(120, -110, 'c'), P(165, -140, 's'), P(186, 0, 'sc'), P(165, 140, 's'), P(120, 110, 'c'), P(60, 30), P(12, 35)], t: 24, e: 2.5, b: 45 },
    // curved clipped tip
    zan: { pts: [P(-110, 0), P(150, 0), P(176, 45, 's'), P(176, 880, 's'), P(150, 1060, 'sc'), P(70, 1180, 'sc'), P(-110, 1265, 's'), P(-110, 1235)], t: 16, e: 2.4, b: 85 },
  };
  for (const [name, o] of Object.entries(outlines)) {
    const d = design(name, [blade('Blade', o.pts, { thickness: o.t, edge: o.e, bevel: o.b })]);
    const r = runBuild(M, d);
    assert.deepEqual(r.warnings, [], name);
    const flatD = design(name, [blade('Blade', o.pts, { thickness: o.t, edge: o.t, bevel: 0 })]);
    assert.ok(r.pieces[0].volume < runBuild(M, flatD).pieces[0].volume * 0.97, `${name} is ground`);
  }
});

test('multi-filament pieces export as a valid Orca-style 3MF', async () => {
  const d = design('Sword', [
    blade('Blade', [P(0, 0), P(25, 0), P(21, 640, 's'), P(0, 900, 's')], { symmetric: true, thickness: 9, edge: 1.6, bevel: 20, filament: 1 }),
    flat('Guard', [P(-120, -20), P(120, -20), P(120, 20), P(-120, 20)], 26, { filament: 2 }),
    flat('Gem', [P(0, -14), P(10, 0), P(0, 14), P(-10, 0)], 30, { filament: 4 }),
    lathe('Grip', [P(14, -15), P(14, -230)], { filament: 3 }),
  ]);
  const r = runBuild(M, d, { mode: 'model', withStl: true });
  const p = r.pieces[0];
  assert.ok(p.parts.length >= 3, 'blade, guard/grip and gold parts are separate');
  const sum = p.parts.reduce((s, q) => s + q.tris.length, 0);
  assert.ok(sum > 0);
  const blob = build3MF([{ name: p.name, parts: p.parts }], { title: 't' });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  assert.ok(text.includes('Metadata/model_settings.config') && text.includes('3D/3dmodel.model'));
  const parts = [...text.matchAll(/<part id="(\d+)" subtype="normal_part">/g)].map((m) => m[1]);
  const comps = [...text.matchAll(/<component objectid="(\d+)"\/>/g)].map((m) => m[1]);
  assert.deepEqual(parts, comps);
  const extruders = [...text.matchAll(/<part [^>]+>\s*<metadata key="name" value="[^"]*"\/>\s*<metadata key="extruder" value="(\d)"/g)].map((m) => +m[1]);
  assert.deepEqual(new Set(extruders), new Set(p.parts.map((q) => q.filament)));
});

test('STL import welds vertices and closes small holes', () => {
  // unit cube as a binary STL with one triangle missing
  const v = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  const tris = f.slice(1);
  const buf = new ArrayBuffer(84 + tris.length * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, tris.length, true);
  tris.forEach((t, i) => t.forEach((vi, k) => v[vi].forEach((c, j) => dv.setFloat32(84 + i * 50 + 12 + k * 12 + j * 4, c * 20, true))));
  const mesh = parseSTL(buf);
  assert.equal(mesh.verts.length / 3, 8);
  const rep = repairMesh(mesh);
  assert.equal(rep.filled, 1);
  const d = { scale: 1, parts: [{ id: 'm', name: 'cube', type: 'mesh', meshRef: 'x', pos: [0, 0, 0], rot: [0, 0, 0] }], features: [], __meshes: { x: rep.mesh } };
  const r = runBuild(M, d);
  assert.deepEqual(r.warnings, []);
  assert.ok(Math.abs(r.pieces[0].volume - 8000) < 1);
});
