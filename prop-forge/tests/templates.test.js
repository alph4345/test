import test from 'node:test';
import assert from 'node:assert/strict';
import { initManifold } from '../src/engine/manifold.js';
import { runBuild, autoSplit } from '../src/engine/index.js';
import { TEMPLATES } from '../src/templates/index.js';

const M = await initManifold();

for (const t of TEMPLATES) {
  test(`template ${t.id} builds and splits`, () => {
    const d = t.build();
    const r = runBuild(M, d);
    assert.deepEqual(r.warnings, [], r.warnings.join('; '));
    const main = r.pieces.filter((p) => p.kind === 'piece');
    const bb = main.reduce((b, p) => ({ min: p.bbox.min.map((v, i) => Math.min(v, b.min[i])), max: p.bbox.max.map((v, i) => Math.max(v, b.max[i])) }), { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] });
    const a = autoSplit(M, d);
    d.split.cuts = a.cuts.map((c, i) => ({ ...c, id: 'c' + i, joints: [{ type: d.split.defaultJoint || 'auto' }] }));
    const s = runBuild(M, d, { mode: 'split' });
    const pcs = s.pieces.filter((p) => p.kind === 'piece');
    const bad = pcs.filter((p) => !p.fit.fits).length;
    console.log(`${t.id.padEnd(20)} ${main.length} bodies, ${bb.max.map((v, i) => (v - bb.min[i]).toFixed(0)).join('x')} mm, ${r.ms}ms | ${a.cuts.length} cuts -> ${pcs.length} pieces (${bad} too big) ${s.ms}ms | ${a.message} | ${s.reports.map((x) => x.notes.join(',')).join(' / ').slice(0, 150)}`);
  });
}
