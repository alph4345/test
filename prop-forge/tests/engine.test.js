import test from 'node:test';
import assert from 'node:assert/strict';
import { initManifold } from '../src/engine/manifold.js';
import { runBuild, autoSplit } from '../src/engine/index.js';

const M = await initManifold();

const sword = () => ({
  name: 'Test', scale: 1,
  parts: [
    { id: 'b', name: 'Blade', type: 'profile', symmetric: true, thickness: 12, edge: 2, bevel: 18, pos: [0, 0, 0], rot: [0, 0, 0],
      points: [{ x: 0, y: 0 }, { x: 30, y: 0, s: 1 }, { x: 25, y: 700, s: 1, c: 1 }, { x: 0, y: 800, s: 1 }] },
    { id: 'g', name: 'Guard', type: 'box', size: [180, 25, 30], pos: [0, -12.5, 0], rot: [0, 0, 0] },
    { id: 'h', name: 'Grip', type: 'lathe', sides: 8, pos: [0, -25, 0], rot: [0, 0, 0],
      points: [{ x: 16, y: 0 }, { x: 17, y: -100, c: 1 }, { x: 16, y: -200 }] },
  ],
  features: [
    { id: 'f1', type: 'channel', name: 'Dowel', from: [0, -230, 0], to: [0, 150, 0], diameter: 6.35, clearance: 0.2 },
    { id: 'f2', type: 'cavity', name: 'Bay', pos: [0, -120, 0], size: [16, 60, 12], lid: { enabled: true, side: '+z', ledge: 4, clearance: 0.25, magnets: { enabled: false } } },
  ],
  split: { plate: { x: 256, y: 256, z: 256 }, cuts: [] },
});

test('builds a watertight model', () => {
  const r = runBuild(M, sword());
  assert.equal(r.warnings.length, 0, r.warnings.join());
  const full = r.pieces.find((p) => p.kind === 'piece');
  assert.ok(full.volume > 100000, 'volume ' + full.volume);
  assert.ok(r.pieces.some((p) => p.kind === 'lid'), 'lid made');
  console.log('model ms', r.ms, 'tris', full.tris.length / 3);
});

test('bevelled blade is thinner at the edge', () => {
  const d = sword(); d.parts = [d.parts[0]]; d.features = [];
  const r = runBuild(M, d);
  const v = r.pieces[0].volume;
  // flat 12 mm extrusion would be about 12 * area
  assert.ok(v < 12 * 2 * 30 * 800 * 0.95 && v > 0);
});

test('auto split and joints', () => {
  const d = sword();
  const a = autoSplit(M, d);
  console.log(a);
  assert.ok(a.cuts.length >= 3);
  for (const type of ['auto', 'tenon', 'pins', 'tabs', 'key']) {
    d.split.cuts = a.cuts.map((c, i) => ({ ...c, id: 'c' + i, joints: [{ type, printPins: true }] }));
    const r = runBuild(M, d, { mode: 'split', withStl: true });
    const pcs = r.pieces.filter((p) => p.kind === 'piece');
    console.log(type, r.ms + 'ms', pcs.length, 'pieces', r.reports.map((x) => x.notes.join('; ')).join(' | '));
    assert.equal(pcs.length, a.cuts.length + 1, type);
    assert.ok(pcs.every((p) => p.fit.fits), 'all fit ' + type);
    assert.ok(r.pieces.every((p) => p.stl.byteLength > 84));
  }
});

test('clamshell z cut on handle', () => {
  const d = sword();
  d.split.cuts = [{ id: 'z', axis: 'z', pos: 0, limit: { y: [-400, -20] }, joints: [{ type: 'pins', diameter: 3, depth: 4 }] },
    { id: 'y', axis: 'y', pos: -10, joints: [{ type: 'key' }] }];
  const r = runBuild(M, d, { mode: 'split' });
  console.log(r.pieces.map((p) => p.name + ':' + p.kind), r.reports.map((x) => x.notes));
  assert.ok(r.pieces.filter((p) => p.kind === 'piece').length >= 2);
});

test('joints conserve material (plug fills socket)', () => {
  const d = sword();
  d.features = [];
  const whole = runBuild(M, d).pieces[0].volume;
  for (const type of ['tenon', 'tabs', 'key']) {
    d.split.cuts = [{ id: 'c', axis: 'y', pos: 300, joints: [{ type }] }];
    const r = runBuild(M, d, { mode: 'split' });
    const sum = r.pieces.reduce((s, p) => s + p.volume, 0);
    const loss = (whole - sum) / whole;
    assert.ok(loss > 0 && loss < 0.01, `${type}: ${(loss * 100).toFixed(3)}% lost`);
  }
});

test('auto split keeps blade pieces flat or on edge', async () => {
  const { findTemplate } = await import('../src/templates/index.js');
  for (const id of ['buster-sword', 'zangetsu', 'katana', 'longsword']) {
    const d = findTemplate(id).build();
    d.split.cuts = autoSplit(M, d).cuts.map((c, i) => ({ ...c, id: `c${i}`, joints: [{ type: 'auto' }] }));
    const r = runBuild(M, d, { mode: 'split' });
    const upright = r.pieces.filter((p) => p.fit.up === 'y');
    assert.equal(upright.length, 0, `${id}: ${upright.map((p) => p.name).join(', ')} stand on end`);
  }
});
