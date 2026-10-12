// Shared request handler used by the worker and by the same-thread fallback.
// loadWasm may return undefined: manifold-3d then loads its own (inlined) wasm.
import { initManifold, withArena } from './manifold.js';
import { runBuild, autoSplit } from './index.js';

export function createHandler(loadWasm) {
  const ready = (async () => initManifold(await loadWasm()))();
  return {
    ready,
    async handle({ kind, design, opts }) {
      const M = await ready;
      if (kind === 'build') return runBuild(M, design, opts);
      if (kind === 'autosplit') return autoSplit(M, design, opts);
      if (kind === 'ping') return 'pong';
      if (kind === 'prepare') return prepareMesh(M, opts);
      throw new Error(`unknown request ${kind}`);
    },
  };
}

// Check an imported mesh and thin out over-dense ones (e.g. Blender
// exports with subdivision applied). Deviation stays below ~1/60000 of the
// model's size, far under a printer's resolution.
function prepareMesh(M, { verts, tris, maxTris = 80000 }) {
  return withArena(() => {
    const mesh = new M.Mesh({ numProp: 3, vertProperties: verts, triVerts: tris });
    mesh.merge();
    let m;
    try { m = M.newManifold(mesh); } catch { return { ok: false, verts, tris }; }
    if (m.status() !== 'NoError' || m.isEmpty()) return { ok: false, verts, tris };
    const before = tris.length / 3;
    if (before > maxTris) {
      const b = m.boundingBox();
      const size = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
      let tol = size / 60000;
      let s = m.simplify(tol);
      while (s.numTri() > maxTris * 2 && tol < size / 4000) { tol *= 2; s = m.simplify(tol); }
      m = s;
    }
    const g = m.getMesh();
    const np = g.numProp;
    const v = new Float32Array((g.vertProperties.length / np) * 3);
    for (let i = 0; i < v.length / 3; i++) { v[i * 3] = g.vertProperties[i * np]; v[i * 3 + 1] = g.vertProperties[i * np + 1]; v[i * 3 + 2] = g.vertProperties[i * np + 2]; }
    return { ok: true, verts: v, tris: new Uint32Array(g.triVerts), before, after: g.triVerts.length / 3, volume: m.volume() };
  });
}

// Buffers handed over to the page instead of copied. Anything missing is
// skipped, and each buffer is listed once (a repeat makes postMessage fail).
export function transferList(result) {
  const t = new Set();
  const add = (x) => { const buf = x instanceof ArrayBuffer ? x : x?.buffer; if (buf instanceof ArrayBuffer && buf.byteLength) t.add(buf); };
  if (result && result.verts && result.tris && !result.pieces) { add(result.verts); add(result.tris); }
  if (result && result.pieces) {
    for (const p of result.pieces) {
      add(p.verts); add(p.tris); add(p.triTags); add(p.triFil); add(p.stl);
      for (const q of p.parts || []) { add(q.verts); add(q.stl); }
    }
  }
  return [...t];
}
