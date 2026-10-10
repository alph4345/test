// Shared request handler used by the worker and by the same-thread fallback.
// loadWasm may return undefined: manifold-3d then loads its own (inlined) wasm.
import { initManifold } from './manifold.js';
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
      throw new Error(`unknown request ${kind}`);
    },
  };
}

export function transferList(result) {
  const t = [];
  if (result && result.pieces) {
    for (const p of result.pieces) {
      t.push(p.verts.buffer, p.tris.buffer, p.triTags.buffer);
      if (p.stl) t.push(p.stl);
      for (const q of p.parts || []) t.push(q.verts.buffer, q.stl);
    }
  }
  return t;
}
