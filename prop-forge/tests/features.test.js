import test from 'node:test';
import assert from 'node:assert/strict';
import { initManifold, withArena } from '../src/engine/manifold.js';
import { runBuild } from '../src/engine/index.js';
import { TagMap, buildModel } from '../src/engine/build.js';
import { splitModel } from '../src/engine/split.js';
import { findTemplate } from '../src/templates/index.js';
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

test('shield grip and strap loops attach to the curved back', () => {
  const d = findTemplate('star-shield').build();
  const r = runBuild(M, d);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.pieces.length, 1, 'hardware fused to the shield');
  assert.ok(r.pieces[0].bbox.min[2] < -20, 'grip stands off the back');
});

test('every bladed template part has a real edge grind', () => {
  for (const id of ['buster-sword', 'zangetsu', 'leviathan-axe', 'battle-axe', 'katana', 'revolver-gunblade']) {
    const r = runBuild(M, findTemplate(id).build());
    assert.deepEqual(r.warnings, [], id);
  }
});

test('multi-filament pieces export as a valid Orca-style 3MF', async () => {
  const d = findTemplate('master-sword').build();
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
