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
