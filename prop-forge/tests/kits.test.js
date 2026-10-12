import test from 'node:test';
import assert from 'node:assert/strict';
import { initManifold } from '../src/engine/manifold.js';
import { runBuild } from '../src/engine/index.js';
import { KITS, variantsOf, recipeFor, designFromRecipe } from '../src/kits/index.js';
import { decodeBuiltin } from '../src/ui/stlimport.js';

const M = await initManifold();

async function withMeshes(d) {
  d.__meshes = {};
  for (const p of d.parts) if (p.type === 'mesh') d.__meshes[p.meshRef] = await decodeBuiltin(p.meshRef.slice(8));
  return d;
}

const summary = (r) => r.pieces.map((p) => `${p.name} ${(p.volume / 1000).toFixed(0)}cm³`).join(', ');

for (const kit of KITS) {
  for (const variant of variantsOf(kit)) {
    test(`${kit.id} / ${variant}: default options build cleanly`, async () => {
      const d = await withMeshes(designFromRecipe(recipeFor(kit, variant)));
      const r = runBuild(M, d);
      assert.deepEqual(r.warnings, [], r.warnings.join('; '));
      assert.ok(r.pieces.length > 0);
      assert.ok(r.pieces.every((p) => p.volume > 0));
      console.log(`  ${kit.id}/${variant}: ${r.pieces.length} pieces in ${r.ms} ms: ${summary(r).slice(0, 220)}`);
    });
  }
  if (kit.generator) {
    test(`${kit.id}: random variations build cleanly`, async () => {
      for (let seed = 1; seed <= 12; seed++) {
        const d = await withMeshes(designFromRecipe(recipeFor(kit, 'generated', { random: true, seed })));
        const r = runBuild(M, d);
        assert.deepEqual(r.warnings, [], `seed ${seed}: ${r.warnings.join('; ')} ${JSON.stringify(d.recipe.opts)}`);
        assert.ok(r.pieces.length > 0 && r.pieces.every((p) => p.volume > 0), `seed ${seed}`);
        // one fused main body; every other piece is a part meant to print on its own
        const own = new Set(d.parts.filter((p) => p.separate).map((p) => p.name));
        const main = r.pieces.filter((p) => p.name === 'Full model' || p.name.endsWith('(main body)'));
        const loose = r.pieces.filter((p) => !main.includes(p) && !own.has(p.name));
        assert.ok(main.length <= 1 && !loose.length, `seed ${seed}: loose pieces ${loose.map((p) => p.name).join(', ')}`);
      }
    });
  }
}

test('changing an option keeps hand-made parts, inserts and colours', async () => {
  const kit = KITS.find((k) => k.id === 'gen-greatsword');
  const d0 = designFromRecipe(recipeFor(kit, 'generated'));
  d0.parts.push({ id: 'mine', name: 'My part', type: 'box', op: 'add', size: [10, 10, 10], pos: [0, 0, 0], rot: [0, 0, 0], stretch: [1, 1, 1], copies: { mode: 'none' }, filament: 1, color: '#fff' });
  d0.filaments[0].color = '#123456';
  d0.features.find((f) => f.id === 'k-rod').diameter = 6;
  d0.name = 'Mine';
  const d1 = designFromRecipe({ ...d0.recipe, opts: { ...d0.recipe.opts, guard: 'swept' } }, d0);
  assert.ok(d1.parts.some((p) => p.id === 'mine'));
  assert.equal(d1.filaments[0].color, '#123456');
  assert.equal(d1.features.find((f) => f.id === 'k-rod').diameter, 6);
  assert.equal(d1.name, 'Mine');
  assert.ok(d1.parts.some((p) => p.name === 'Swept guard'));
});

test('flutes are cut into the revolver cylinder', async () => {
  const kit = KITS.find((k) => k.id === 'revolver-gunblade-model');
  const vol = async (flutes) => {
    const r = recipeFor(kit, variantsOf(kit)[0]);
    const d = await withMeshes(designFromRecipe({ ...r, opts: { ...r.opts, flutes } }));
    const cylPiece = runBuild(M, d).pieces.find((p) => p.name === 'Revolver cylinder');
    return cylPiece.volume;
  };
  const smooth = await vol('none'), fluted = await vol('front');
  assert.ok(fluted < smooth - 2000, `smooth ${smooth.toFixed(0)} vs fluted ${fluted.toFixed(0)}`);
});

test('Buster Sword: resin materia domes with LEDs, wiring and a battery bay', async () => {
  const kit = KITS.find((k) => k.id === 'buster-sword-model');
  const r0 = recipeFor(kit);
  const d = await withMeshes(designFromRecipe({ ...r0, opts: { ...r0.opts, materia: 'resin', led: true, ledSwitch: true } }));
  const r = runBuild(M, d);
  assert.deepEqual(r.warnings, [], r.warnings.join('; '));
  const domes = r.pieces.filter((p) => p.name.startsWith('Materia'));
  assert.equal(domes.length, 4, 'front and back dome for each materia');
  assert.ok(domes.every((p) => p.resin), 'domes are resin pieces');
  // hollow: well under a solid half ball
  const half = (2 / 3) * Math.PI * 19.7 ** 3;
  assert.ok(domes.every((p) => p.volume < half * 0.5), domes.map((p) => p.volume.toFixed(0)).join(', '));
  const lid = r.pieces.find((p) => p.kind === 'lid');
  assert.ok(lid, 'the bay lid is its own piece');
  // the lid covers the whole 40 mm bay (plus its ledge), not a sliver of it
  assert.ok(lid.bbox.max[0] - lid.bbox.min[0] > 44, `lid width ${(lid.bbox.max[0] - lid.bbox.min[0]).toFixed(1)}`);
  assert.ok(lid.volume > 20000, `lid volume ${lid.volume.toFixed(0)}`);
  // auto-split keeps clear of the materia and the bay
  const { autoSplit } = await import('../src/engine/index.js');
  const cuts = autoSplit(M, d).cuts.filter((c) => c.axis === 'y' && !c.target);
  assert.ok(cuts.every((c) => c.pos < 13 || c.pos > 187), cuts.map((c) => c.pos).join(', '));
  const out = runBuild(M, d, { withStl: true });
  const resin = out.pieces.filter((p) => p.resin);
  assert.equal(resin.length, 4);
  assert.ok(resin.every((p) => p.stl && p.stl.byteLength > 84), 'resin pieces export as STL');
});

test('Maka: the toothed pattern follows a hand-edited blade, and survives option changes', async () => {
  const { patternZones } = await import('../src/engine/pattern.js');
  const { profileOutline } = await import('../src/engine/parts.js');
  const kit = KITS.find((k) => k.id === 'maka-scythe-parts');
  const d0 = designFromRecipe(recipeFor(kit));
  const blade = d0.parts.find((p) => p.name === 'Blade');
  assert.ok(blade.pattern, 'the blade carries its pattern');
  const spanY = (pts) => Math.max(...pts.map((p) => p.y ?? p[1])) - Math.min(...pts.map((p) => p.y ?? p[1]));
  const zone0 = patternZones([blade])[0];
  // drag every node past the middle of the blade 200 mm further out (local +y is along the blade)
  const mid = (Math.min(...blade.points.map((p) => p.y)) + Math.max(...blade.points.map((p) => p.y))) / 2;
  blade.points = blade.points.map((p) => (p.y > mid ? { ...p, y: p.y + 200 } : p));
  blade.edited = 1;
  const zone1 = patternZones([blade])[0];
  assert.ok(spanY(zone1.points) > spanY(zone0.points) + 180, `pattern ${spanY(zone0.points).toFixed(0)} -> ${spanY(zone1.points).toFixed(0)}`);
  // the pattern stays inside the blade's length
  const bladeSpan = spanY(profileOutline(blade).map((q) => q.p));
  assert.ok(spanY(zone1.points) < bladeSpan + 20);
  // changing an option keeps the hand-made shape but takes the new tooth count
  const d1 = designFromRecipe({ ...d0.recipe, opts: { ...d0.recipe.opts, teeth: 12 } }, d0);
  const b1 = d1.parts.find((p) => p.name === 'Blade');
  assert.deepEqual(b1.points, blade.points);
  assert.equal(b1.pattern.teeth, 12);
});

test('paint guide lines are cut into the surface; painted props print one filament per piece', async () => {
  const kit = KITS.find((k) => k.id === 'maka-scythe-parts');
  const base = await withMeshes(designFromRecipe(recipeFor(kit)));
  const vol = (finish) => {
    const d = { ...base, finish };
    const r = runBuild(M, d, { withStl: true });
    assert.deepEqual(r.warnings, [], r.warnings.join('; '));
    return r;
  };
  const plain = vol({ colours: 'print', lines: false });
  const lined = vol({ colours: 'paint', lines: true, lineWidth: 1.2, lineDepth: 0.6 });
  const bladeVol = (r) => r.pieces.find((p) => p.name === 'Blade').volume;
  const removed = bladeVol(plain) - bladeVol(lined);
  // a ~1.2 x 0.6 mm groove along a couple of metres of border, both faces
  assert.ok(removed > 300 && removed < 8000, `groove volume ${removed.toFixed(0)} mm³`);
  assert.equal(lined.pieces.length, plain.pieces.length, 'no loose specks');
  assert.ok(plain.pieces.some((p) => p.parts.length > 1), 'printed colours: multi-filament pieces');
  assert.ok(lined.pieces.every((p) => p.parts.length === 1), 'painted: one filament per piece');
});

test('a staff comes apart into the chosen number of sections around its core', async () => {
  const { autoSplit } = await import('../src/engine/index.js');
  for (const [id, opts] of [['maka-scythe-parts', { apart: 3, core: 'tube16' }], ['gen-scythe', { apart: 2, core: 'dowel12' }]]) {
    const kit = KITS.find((k) => k.id === id);
    const r0 = recipeFor(kit, variantsOf(kit)[0]);
    const d = await withMeshes(designFromRecipe({ ...r0, opts: { ...r0.opts, ...opts } }));
    if (opts.core === 'tube16') assert.ok(d.recipe.opts.staffD >= 32, 'staff thickened to fit a 16 mm core');
    const cuts = autoSplit(M, d).cuts.filter((c) => c.targetName === 'Staff');
    assert.equal(cuts.filter((c) => c.joint === 'thread').length, opts.apart - 1, `${id}: ${cuts.map((c) => c.joint).join(',')}`);
    d.split.cuts = cuts.map(({ joint, ...c }, i) => ({ ...c, id: `c${i}`, joints: [{ type: joint }] }));
    const r = runBuild(M, d, { mode: 'split' });
    assert.deepEqual(r.warnings, [], r.warnings.join('; '));
    const threads = r.reports.filter((x) => x.notes.some((n) => n.startsWith('screw thread')));
    assert.equal(threads.length, opts.apart - 1, `${id}: printed threads fit around the core`);
  }
});

test('every build result can be handed back from the worker (see-through parts included)', async () => {
  const { transferList } = await import('../src/engine/handler.js');
  const cases = KITS.map((kit) => [kit, {}]);
  const maka = KITS.find((k) => k.id === 'maka-scythe-parts');
  cases.push([maka, { core: 'tube16' }], [maka, { staff: 'rod' }]);
  for (const [kit, extra] of cases) {
    const r0 = recipeFor(kit, variantsOf(kit)[0]);
    const d = await withMeshes(designFromRecipe({ ...r0, opts: { ...r0.opts, ...extra } }));
    for (const withStl of [false, true]) {
      const r = runBuild(M, d, { withStl });
      assert.ok(r.pieces.every((p) => p.verts && p.tris && p.triTags && p.triFil), `${kit.id}: every piece has its mesh arrays`);
      assert.doesNotThrow(() => structuredClone(r, { transfer: transferList(r) }), `${kit.id} ${JSON.stringify(extra)}`);
    }
  }
});
