// STL import: parse (binary or ASCII), weld duplicate vertices so the mesh
// can be treated as a solid, and keep mesh data outside the design (in
// IndexedDB) so undo history and autosave stay small.

export function parseSTL(buffer) {
  const bytes = new Uint8Array(buffer);
  const head = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 1024)));
  const dv = new DataView(buffer);
  const binCount = bytes.length >= 84 ? dv.getUint32(80, true) : 0;
  const isBinary = bytes.length === 84 + binCount * 50;
  let soup;
  if (!isBinary && head.trimStart().startsWith('solid')) {
    const text = new TextDecoder().decode(bytes);
    const nums = [];
    const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
    let m;
    while ((m = re.exec(text))) nums.push(+m[1], +m[2], +m[3]);
    soup = new Float32Array(nums);
  } else {
    soup = new Float32Array(binCount * 9);
    for (let i = 0; i < binCount; i++) for (let k = 0; k < 9; k++) soup[i * 9 + k] = dv.getFloat32(84 + i * 50 + 12 + k * 4, true);
  }
  return weld(soup);
}

function weld(soup) {
  const map = new Map();
  const verts = [];
  const tris = new Uint32Array(soup.length / 3);
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < soup.length; i += 3) {
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], soup[i + k]); max[k] = Math.max(max[k], soup[i + k]); }
  }
  const q = Math.max(...max.map((v, k) => v - min[k])) * 1e-6 || 1e-6;
  for (let i = 0; i < soup.length; i += 3) {
    const key = `${Math.round(soup[i] / q)},${Math.round(soup[i + 1] / q)},${Math.round(soup[i + 2] / q)}`;
    let id = map.get(key);
    if (id === undefined) { id = verts.length / 3; map.set(key, id); verts.push(soup[i], soup[i + 1], soup[i + 2]); }
    tris[i / 3] = id;
  }
  // centre on the origin
  const c = min.map((v, k) => (v + max[k]) / 2);
  const v = new Float32Array(verts);
  for (let i = 0; i < v.length; i++) v[i] -= c[i % 3];
  // drop degenerate triangles
  const keep = [];
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t + 1], d = tris[t + 2];
    if (a !== b && b !== d && a !== d) keep.push(a, b, d);
  }
  return { verts: v, tris: new Uint32Array(keep), size: max.map((x, k) => x - min[k]) };
}

// Close small holes: every chain of edges that only one triangle uses is
// walked into a loop and filled with a fan of triangles. This fixes the
// usual export faults (T-junctions, missing caps) in downloaded STLs.
export function repairMesh(mesh) {
  const { tris } = mesh;
  const he = new Set();
  for (let t = 0; t < tris.length; t += 3) {
    he.add(`${tris[t]},${tris[t + 1]}`); he.add(`${tris[t + 1]},${tris[t + 2]}`); he.add(`${tris[t + 2]},${tris[t]}`);
  }
  // missing half-edges b->a (the face that would close the hole)
  const next = new Map();
  let bad = false;
  for (const k of he) {
    const [a, b] = k.split(',').map(Number);
    if (!he.has(`${b},${a}`)) {
      if (next.has(b)) bad = true;
      next.set(b, a);
    }
  }
  if (!next.size) return { mesh, filled: 0, open: 0 };
  const extra = [];
  const seen = new Set();
  let filled = 0;
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let v = start, guard = 0;
    while (!seen.has(v) && next.has(v) && guard++ < 100000) { seen.add(v); loop.push(v); v = next.get(v); }
    if (v !== start || loop.length < 3) continue;
    for (let i = 1; i + 1 < loop.length; i++) extra.push(loop[0], loop[i], loop[i + 1]);
    filled++;
  }
  const out = new Uint32Array(tris.length + extra.length);
  out.set(tris); out.set(extra, tris.length);
  return { mesh: { ...mesh, tris: out }, filled, open: next.size, complex: bad };
}

// ---- mesh store (IndexedDB, with an in-memory cache) ----
const cache = new Map();
let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((resolve) => {
      try {
        const req = indexedDB.open('prop-forge', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('meshes');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
  }
  return dbp;
}

export async function putMesh(id, mesh) {
  cache.set(id, mesh);
  const d = await db();
  if (!d) return;
  try { d.transaction('meshes', 'readwrite').objectStore('meshes').put({ verts: mesh.verts, tris: mesh.tris }, id); } catch { /* storage unavailable */ }
}

export async function loadMeshes(ids) {
  const missing = ids.filter((id) => !cache.has(id));
  if (missing.length) {
    const d = await db();
    if (d) {
      await Promise.all(missing.map((id) => new Promise((res) => {
        try {
          const r = d.transaction('meshes').objectStore('meshes').get(id);
          r.onsuccess = () => { if (r.result) cache.set(id, r.result); res(); };
          r.onerror = () => res();
        } catch { res(); }
      })));
    }
  }
  return ids.filter((id) => cache.has(id));
}

export function meshesFor(design) {
  const out = {};
  for (const p of design.parts) if (p.type === 'mesh' && cache.has(p.meshRef)) out[p.meshRef] = cache.get(p.meshRef);
  return out;
}

const toB64 = (arr) => { let s = ''; const b = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (str, Type) => { const s = atob(str); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return new Type(b.buffer); };

// project files carry their imported meshes
export function packMeshes(design) {
  const out = {};
  for (const [id, m] of Object.entries(meshesFor(design))) out[id] = { verts: toB64(m.verts), tris: toB64(m.tris) };
  return out;
}

export async function unpackMeshes(packed) {
  for (const [id, m] of Object.entries(packed || {})) await putMesh(id, { verts: fromB64(m.verts, Float32Array), tris: fromB64(m.tris, Uint32Array) });
}
