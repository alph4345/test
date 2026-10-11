// Bundles the creator's own models into the app as templates.
//
//   node scripts/bundle-models.mjs <models dir>
//
// <models dir> holds the original downloads, unpacked:
//   buster/buster_sword_complete.stl            (Thingiverse 1794243)
//   gunblade/gb_*.stl                           (Thingiverse 3825730)
//   tanjiro/pt1.stl … pt7.stl                   (Thingiverse 4708245)
//   maka/ScytheTop.stl, BladeShims*.stl            (Thingiverse 1863433)
//   zangetsu-V1.stl                             (unreleased)
//
// Each mesh is repaired, moved into the template frame (Y along the weapon,
// blade starting at y = 0, X across the width, Z through the thickness,
// millimetres), lightly simplified (0.03 mm deviation at template size),
// gzipped and written to src/templates/bundled-models.js. Models
// marked `unreleased` go to src/templates/bundled-unreleased.js instead,
// which git ignores so they are never published by accident.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { initManifold } from '../src/engine/manifold.js';
import { parseSTLRaw, repairMesh } from '../src/ui/stlimport.js';

const dir = process.argv[2];
if (!dir) { console.error('usage: node scripts/bundle-models.mjs <models dir>'); process.exit(1); }

// (x, y, z) in the file -> template frame. Rotations are proper (no mirror).
const MODELS = [
  { key: 'buster', file: 'buster/buster_sword_complete.stl', map: (x, y, z) => [x * 10 - 151.5, y * 10 + 337, z * 10 + 28.55] },
  // gunblade: file X thickness, Y length (blade towards -Y), Z width
  ...Object.entries({ blade: [-169, -3], blade_tip: [-399, 15], frame: [0, 0], handle: [90, 5] }).map(([name, [dy, dz]]) => ({
    key: `gunblade_${name}`, file: `gunblade/gb_${name}.stl`, centreX: true, map: (x, y, z, c) => [z + dz - 40, -(y + dy), x - c[0]],
  })),
  // tanjiro: Z up with the blade towards -Z; tsuba centre at (23.8, -6), blade starts at z = 3.2
  ...['pt1', 'pt2', 'pt3', 'pt4', 'pt5', 'pt6', 'pt7'].map((n) => ({ key: `tanjiro_${n}`, file: `tanjiro/${n}.stl`, map: (x, y, z) => [x - 23.8, 3.2 - z, y + 6] })),
  // maka: topper stands on Z; the blade shims laid out beside it
  { key: 'maka_top', file: 'maka/ScytheTop.stl', map: (x, y, z) => [x, z, -y] },
  { key: 'maka_shim', file: 'maka/BladeShims.stl', map: (x, y, z) => [x + 60, y, z] },
  { key: 'maka_shim2', file: 'maka/BladeShims2.stl', map: (x, y, z) => [x + 95, y, z] },
  // zangetsu: file X length, Y thickness, Z width
  { key: 'zangetsu_v1', file: 'zangetsu-V1.stl', unreleased: true, finalScale: 6.28, map: (x, y, z) => [z, x, y] },
];

const M = await initManifold();

function solid(spec) {
  const buf = fs.readFileSync(path.join(dir, spec.file));
  const mesh = repairMesh(parseSTLRaw(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))).mesh;
  const c = [0, 0, 0];
  if (spec.centreX) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < mesh.verts.length; i += 3) { lo = Math.min(lo, mesh.verts[i]); hi = Math.max(hi, mesh.verts[i]); }
    c[0] = (lo + hi) / 2;
  }
  const v = new Float32Array(mesh.verts.length);
  for (let i = 0; i < v.length; i += 3) {
    const p = spec.map(mesh.verts[i], mesh.verts[i + 1], mesh.verts[i + 2], c);
    v[i] = p[0]; v[i + 1] = p[1]; v[i + 2] = p[2];
  }
  const mm = new M.Mesh({ numProp: 3, vertProperties: v, triVerts: mesh.tris });
  mm.merge();
  let m = new M.Manifold(mm);
  if (m.volume() < 0) throw new Error(`${spec.file}: inside-out mesh`);
  // shells that only touch (e.g. a grip modelled as two halves) stay
  // separate after a union; grow each by 0.05 mm so they fuse
  const comps = m.decompose().filter((x) => x.volume() > 0);
  if (comps.length > 1) {
    const u = M.Manifold.union(comps);
    if (u.decompose().filter((x) => x.volume() > 0).length > 1) {
      m = M.Manifold.union(comps.map((x) => {
        const b = x.boundingBox();
        const ctr = [0, 1, 2].map((k) => (b.min[k] + b.max[k]) / 2);
        const k = [0, 1, 2].map((i) => 1 + 0.1 / Math.max(1, b.max[i] - b.min[i]));
        return x.translate(ctr.map((q) => -q)).scale(k).translate(ctr);
      }));
    } else m = u;
  }
  // 0.03 mm deviation at the size the template uses
  return m.simplify(0.03 / (spec.finalScale || 1));
}

const out = { public: { MODELS: {}, THUMBS: {} }, unreleased: { MODELS: {}, THUMBS: {} } };
for (const spec of MODELS) {
  const m = solid(spec);
  const g = m.getMesh();
  const np = g.numProp;
  const verts = new Float32Array((g.vertProperties.length / np) * 3);
  for (let i = 0; i < verts.length / 3; i++) for (let k = 0; k < 3; k++) verts[i * 3 + k] = g.vertProperties[i * np + k];
  const tris = new Uint32Array(g.triVerts);
  const raw = Buffer.concat([Buffer.from(new Uint32Array([verts.length, tris.length]).buffer), Buffer.from(verts.buffer), Buffer.from(tris.buffer)]);
  const target = spec.unreleased ? out.unreleased : out.public;
  target.MODELS[spec.key] = zlib.gzipSync(raw, { level: 9 }).toString('base64');
  target.THUMBS[spec.key] = m.project().simplify(0.4).toPolygons().map((p) => p.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]));
  const bb = m.boundingBox();
  console.log(spec.key.padEnd(16), `${String(tris.length / 3).padStart(6)} tris`, `${(m.volume() / 1000).toFixed(1).padStart(7)} cm³`,
    `${(target.MODELS[spec.key].length / 1024).toFixed(0).padStart(4)} KB`, bb.min.map(Math.round).join(','), '→', bb.max.map(Math.round).join(','), spec.unreleased ? '(unreleased)' : '');
}

const header = (what) => `// Generated by scripts/bundle-models.mjs. Do not edit.
// ${what}
`;
const write = (file, data, what) => fs.writeFileSync(new URL(`../src/templates/${file}`, import.meta.url),
  `${header(what)}export const MODELS = ${JSON.stringify(data.MODELS, null, 1)};\nexport const THUMBS = ${JSON.stringify(data.THUMBS)};\n`);
write('bundled-models.js', out.public, "The creator's own published models (Thingiverse 1794243, 3825730, 4708245, 1863433), bundled with their permission.");
write('bundled-unreleased.js', out.unreleased, "The creator's unreleased models. Git-ignored: never commit this file without the creator's say-so.");
console.log('written src/templates/bundled-models.js and bundled-unreleased.js');
