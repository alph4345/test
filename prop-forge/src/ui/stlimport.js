// STL import: parse (binary or ASCII), weld duplicate vertices so the mesh
// can be treated as a solid, and keep mesh data outside the design (in
// IndexedDB) so undo history and autosave stay small.

export function parseSTL(buffer) {
  return weld(readSoup(buffer), true);
}

// same, but keeps the file's coordinates (no centring)
export function parseSTLRaw(buffer) {
  return weld(readSoup(buffer), false);
}

function readSoup(buffer) {
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
  return soup;
}

function weld(soup, centre) {
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < soup.length; i += 3) {
    for (let k = 0; k < 3; k++) { const v = soup[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
  }
  // positions are snapped to a 2^21 grid over the model's size (about a
  // millionth of its length) and looked up through a numeric hash, far
  // faster than string keys on meshes with hundreds of thousands of faces
  const G = 2097151;
  const size = Math.max(...max.map((v, k) => v - min[k])) || 1;
  const inv = G / size;
  const map = new Map();
  const q = new Int32Array(soup.length); // quantised coords per unique vertex
  const verts = new Float32Array(soup.length);
  let nv = 0;
  const tris = new Uint32Array(soup.length / 3);
  for (let i = 0; i < soup.length; i += 3) {
    const xi = Math.round((soup[i] - min[0]) * inv), yi = Math.round((soup[i + 1] - min[1]) * inv), zi = Math.round((soup[i + 2] - min[2]) * inv);
    const h = (Math.imul(xi, 73856093) ^ Math.imul(yi, 19349663) ^ Math.imul(zi, 83492791)) >>> 0;
    let bucket = map.get(h);
    let id = -1;
    if (bucket !== undefined) {
      if (typeof bucket === 'number') bucket = [bucket];
      for (const c of bucket) if (q[c * 3] === xi && q[c * 3 + 1] === yi && q[c * 3 + 2] === zi) { id = c; break; }
    }
    if (id < 0) {
      id = nv++;
      q[id * 3] = xi; q[id * 3 + 1] = yi; q[id * 3 + 2] = zi;
      verts[id * 3] = soup[i]; verts[id * 3 + 1] = soup[i + 1]; verts[id * 3 + 2] = soup[i + 2];
      if (bucket === undefined) map.set(h, id);
      else { bucket.push(id); map.set(h, bucket); }
    }
    tris[i / 3] = id;
  }
  // centre on the origin
  const c = centre ? min.map((v, k) => (v + max[k]) / 2) : [0, 0, 0];
  const v = verts.slice(0, nv * 3);
  for (let i = 0; i < v.length; i++) v[i] -= c[i % 3];
  // drop degenerate triangles
  const keep = new Uint32Array(tris.length);
  let nk = 0;
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t + 1], d = tris[t + 2];
    if (a !== b && b !== d && a !== d) { keep[nk++] = a; keep[nk++] = b; keep[nk++] = d; }
  }
  return { verts: v, tris: keep.slice(0, nk), size: max.map((x, k) => x - min[k]) };
}

// Close small holes: every chain of edges that only one triangle uses is
// walked into a loop and filled with a fan of triangles. This fixes the
// usual export faults (T-junctions, missing caps) in downloaded STLs.
export function repairMesh(mesh) {
  const { tris } = mesh;
  const N = mesh.verts.length / 3 + 1;
  const he = new Set();
  for (let t = 0; t < tris.length; t += 3) {
    he.add(tris[t] * N + tris[t + 1]); he.add(tris[t + 1] * N + tris[t + 2]); he.add(tris[t + 2] * N + tris[t]);
  }
  // missing half-edges b->a (the face that would close the hole)
  const next = new Map();
  let bad = false;
  for (const k of he) {
    const a = Math.floor(k / N), b = k - a * N;
    if (!he.has(b * N + a)) {
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

// models bundled with the app (templates made from the creator's STLs)
export async function decodeBuiltin(key) {
  const { MODEL_DATA } = await import('../templates/models.js');
  const b64 = MODEL_DATA[key];
  if (!b64) return null;
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  const [nv, nt] = new Uint32Array(buf.slice(0, 8));
  return { verts: new Float32Array(buf.slice(8, 8 + nv * 4)), tris: new Uint32Array(buf.slice(8 + nv * 4, 8 + nv * 4 + nt * 4)) };
}

export async function loadMeshes(ids) {
  for (const id of ids) {
    if (id.startsWith('builtin:') && !cache.has(id)) {
      const m = await decodeBuiltin(id.slice(8));
      if (m) cache.set(id, m);
    }
  }
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
