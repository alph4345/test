// Loads manifold-3d and adds a simple arena so every intermediate solid
// created during a build is freed afterwards (WASM objects are not garbage
// collected).
import Module from 'manifold-3d';

let arena = null;

function track(obj) {
  if (arena && obj && typeof obj.delete === 'function') arena.add(obj);
  return obj;
}

function wrapResult(r) {
  if (Array.isArray(r)) { r.forEach(track); return r; }
  return track(r);
}

// manifold-3d puts the methods on a parent prototype, so walk the chain up
// to embind's base handle class. Statics live on the constructors.
function patch(cls) {
  const targets = [];
  for (let p = cls.prototype; p && p !== Object.prototype && !Object.prototype.hasOwnProperty.call(p, 'isAliasOf'); p = Object.getPrototypeOf(p)) targets.push(p);
  for (let c = cls; c && c !== Function.prototype; c = Object.getPrototypeOf(c)) targets.push(c);
  for (const target of targets) {
    for (const name of Object.getOwnPropertyNames(target)) {
      if (['delete', 'constructor', 'prototype', 'length', 'name', 'isDeleted', 'clone'].includes(name)) continue;
      const d = Object.getOwnPropertyDescriptor(target, name);
      if (!d || typeof d.value !== 'function') continue;
      const fn = d.value;
      target[name] = function (...args) { return wrapResult(fn.apply(this, args)); };
    }
  }
}

export async function initManifold(wasmBinary) {
  const M = await Module(wasmBinary ? { wasmBinary } : undefined);
  M.setup();
  patch(M.Manifold);
  patch(M.CrossSection);
  const RawManifold = M.Manifold, RawCS = M.CrossSection;
  // constructors also go through the arena
  M.newManifold = (mesh) => track(new RawManifold(mesh));
  M.newCrossSection = (polys, rule = 'Positive') => track(new RawCS(polys, rule));
  return M;
}

// Run fn with an arena; everything created inside is deleted afterwards.
export function withArena(fn) {
  const prev = arena;
  arena = new Set();
  try {
    return fn();
  } finally {
    for (const o of arena) { try { o.delete(); } catch { /* already freed */ } }
    arena = prev;
  }
}
