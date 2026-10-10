// STL import: read, repair, lay flat, simplify (in the geometry worker) and
// add to the design, or open as a new project.
import { store, edit, setUI, toast, bumpMeshes, replaceDesign, blankDesign } from '../state.js';
import { parseSTL, repairMesh, putMesh } from './stlimport.js';
import { request } from '../engine/client.js';
import { COLORS, uid } from '../templates/helpers.js';

// Lay an imported model out the Prop Forge way: longest axis along Y (the
// weapon's length), thinnest along Z (thickness), so the blade faces you.
function layFlat(mesh) {
  const order = [0, 1, 2].sort((i, j) => mesh.size[i] - mesh.size[j]); // thin, mid, long
  const [T, W, L] = order;
  // rows of the rotation: x <- W, y <- L, z <- T; flip z if that would mirror
  const det = (r) => r[0][0] * (r[1][1] * r[2][2] - r[1][2] * r[2][1]) - r[0][1] * (r[1][0] * r[2][2] - r[1][2] * r[2][0]) + r[0][2] * (r[1][0] * r[2][1] - r[1][1] * r[2][0]);
  const e = (i) => [0, 1, 2].map((k) => (k === i ? 1 : 0));
  const rows = [e(W), e(L), e(T)];
  const sz = det(rows) < 0 ? -1 : 1;
  const v = new Float32Array(mesh.verts.length);
  for (let i = 0; i < v.length; i += 3) {
    v[i] = mesh.verts[i + W]; v[i + 1] = mesh.verts[i + L]; v[i + 2] = sz * mesh.verts[i + T];
  }
  return { ...mesh, verts: v, size: [mesh.size[W], mesh.size[L], mesh.size[T]] };
}

export async function importSTL(file, { newProject = false } = {}) {
  toast(`Reading ${file.name}…`, 60000);
  const raw = parseSTL(await file.arrayBuffer());
  if (!raw.tris.length) { toast('That file has no triangles in it.'); return; }
  const rep = repairMesh(raw);
  const flat = layFlat({ ...rep.mesh, size: raw.size });
  if (rep.mesh.tris.length / 3 > 80000) toast(`${file.name}: ${(raw.tris.length / 3).toLocaleString()} triangles, simplifying…`, 60000);
  const prep = await request('prepare', null, { verts: flat.verts, tris: flat.tris });
  const mesh = prep.ok ? { verts: prep.verts, tris: prep.tris } : { verts: flat.verts, tris: flat.tris };
  const id = uid('mesh');
  await putMesh(id, mesh);
  const longest = Math.max(...raw.size);
  const part = {
    id: uid(), name: file.name.replace(/\.stl$/i, ''), type: 'mesh', op: 'add', meshRef: id, unit: 1,
    color: COLORS.steel, pos: [0, 0, 0], rot: [0, 0, 0], stretch: [1, 1, 1], copies: { mode: 'none', count: 2 }, filament: 1,
    info: { tris: mesh.tris.length / 3, original: raw.tris.length / 3, repaired: rep.filled, size: flat.size, watertight: prep.ok },
  };
  if (newProject) {
    const d = blankDesign();
    d.name = part.name;
    d.parts.push(part);
    replaceDesign(d);
    setUI({ tab: 'shape' });
  } else edit((dd) => { dd.parts.push(part); });
  bumpMeshes();
  setUI({ sel: { kind: 'part', id: part.id }, refit: true });
  const notes = [];
  if (prep.ok && prep.after < prep.before) notes.push(`simplified ${prep.before.toLocaleString()} → ${prep.after.toLocaleString()} triangles`);
  if (rep.filled) notes.push(`closed ${rep.filled} hole${rep.filled > 1 ? 's' : ''}`);
  if (!prep.ok) notes.push('NOT watertight: it will show but cannot be cut or joined');
  toast(`Imported ${part.name}: ${Math.round(longest)} units long${notes.length ? `, ${notes.join(', ')}` : ''}. If it's the wrong size, change "File units" or "Overall length".`, 9000);
}
