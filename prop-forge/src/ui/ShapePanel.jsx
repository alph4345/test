import { store, edit, setUI, filamentsOf, toast, bumpMeshes } from '../state.js';
import { parseSTL, repairMesh, putMesh } from './stlimport.js';
import { symmetryPatch } from './ProfileEditor.jsx';
import { grindHeights } from '../engine/blade.js';
import { Num, Vec3, Select, Check, Text, Color, Section, Help, FilamentPick } from './controls.jsx';
import { blade, flat, lathe, box, cyl, sphere, hole, P, COLORS, uid, gripPoints } from '../templates/helpers.js';

const TYPE_LABEL = { profile: 'flat / blade', lathe: 'round', box: 'box', cylinder: 'cylinder', sphere: 'sphere', mesh: 'imported' };

async function importSTL(file) {
  const mesh = parseSTL(await file.arrayBuffer());
  if (!mesh.tris.length) { toast('That file has no triangles in it.'); return; }
  const rep = repairMesh(mesh);
  const id = uid('mesh');
  await putMesh(id, rep.mesh);
  const [sx, sy, sz] = mesh.size;
  const rot = sx > sy && sx >= sz ? [0, 0, 90] : sz > sy && sz > sx ? [-90, 0, 0] : [0, 0, 0];
  const longest = Math.max(sx, sy, sz);
  const part = {
    id: uid(), name: file.name.replace(/\.stl$/i, ''), type: 'mesh', op: 'add', meshRef: id, unit: 1,
    color: COLORS.steel, pos: [0, 0, 0], rot, stretch: [1, 1, 1], copies: { mode: 'none', count: 2 },
    info: { tris: rep.mesh.tris.length / 3, repaired: rep.filled, size: mesh.size },
  };
  edit((dd) => { dd.parts.push(part); });
  bumpMeshes();
  setUI({ sel: { kind: 'part', id: part.id } });
  toast(`Imported ${part.name}: ${Math.round(longest)} units long${rep.filled ? `, closed ${rep.filled} hole${rep.filled > 1 ? 's' : ''}` : ''}. If it's too small, set Units to cm or inches.`, 7000);
}

function newPart(kind, at) {
  const y = at;
  switch (kind) {
    case 'blade': return blade('New blade', [P(0, y), P(25, y), P(22, y + 300, 's'), P(0, y + 380, 's')], { symmetric: true, thickness: 8, edge: 1.6, bevel: 14 });
    case 'flat': return flat('New flat shape', [P(-40, y - 15), P(40, y - 15), P(40, y + 15), P(-40, y + 15)], 15);
    case 'lathe': return lathe('New round part', gripPoints(y, y - 120, 15, { ridges: 0 }), { color: COLORS.leather });
    case 'box': return box('New box', [60, 30, 30], [0, y, 0], { color: COLORS.dark });
    case 'cylinder': return cyl('New cylinder', 20, 20, 40, [0, y, 0], { color: COLORS.dark });
    case 'sphere': return sphere('New sphere', 20, [0, y, 0], { color: COLORS.dark });
    case 'hole': return hole('New hole', 15, [0, y, 0], 200);
    case 'cutshape': return flat('New cut-out shape', [P(-20, y - 20), P(20, y - 20), P(20, y + 20), P(-20, y + 20)], 200, { op: 'subtract', color: COLORS.dark });
    default: return null;
  }
}

// Cross-section from the edge to the middle of the blade, to scale.
function GrindPreview({ part }) {
  const T = +part.thickness || 10;
  const bevel = +part.bevel || 0;
  const opts = { thickness: T, edge: Math.min(+part.edge || T, T), bevel, grind: part.grind || 'flat', sides: part.sides || 'both' };
  const span = Math.max(bevel * 1.35, T * 1.5, 10);
  const W = 300, H = 92, pad = 10;
  const k = Math.min((W - 2 * pad) / span, (H - 26) / T);
  const top = [], bot = [];
  for (let i = 0; i <= 60; i++) {
    const d = (span * i) / 60;
    const [a, b] = grindHeights(opts, d, 0);
    const x = pad + d * k;
    top.push(`${x.toFixed(1)},${(H / 2 - 8 - a * k).toFixed(1)}`);
    bot.push(`${x.toFixed(1)},${(H / 2 - 8 - b * k).toFixed(1)}`);
  }
  const bx = pad + bevel * k;
  return (
    <figure class="grind">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Blade cross-section">
        <polygon points={top.concat(bot.reverse()).join(' ')} class="g-fill" />
        {bevel > 0 && <line x1={bx} x2={bx} y1={6} y2={H - 22} class="g-mark" />}
        <text x={pad} y={H - 6} class="g-txt">edge {opts.edge} mm</text>
        {bevel > 0 && <text x={Math.min(bx + 4, W - 110)} y={H - 6} class="g-txt">grind starts {bevel} mm in</text>}
        <text x={W - pad} y={14} class="g-txt" text-anchor="end">{T} mm</text>
      </svg>
      <figcaption>Cross-section from the edge (left) toward the middle, to scale.</figcaption>
    </figure>
  );
}

function PartEditor({ part, idx }) {
  const d = store.design;
  const set = (patch, key) => edit((dd) => { Object.assign(dd.parts[idx], patch); }, key ? `${part.id}-${key}` : null);
  const addParts = d.parts.filter((p) => p.op !== 'subtract' && p.id !== part.id);
  return (
    <Section title={`Edit: ${part.name}`} right={<span class="badge">{TYPE_LABEL[part.type]}</span>}>
      <Text label="Name" value={part.name} onChange={(v) => set({ name: v }, 'name')} />
      <div class="two">
        <Select label="Mode" value={part.op || 'add'} options={[['add', 'Add material'], ['subtract', 'Cut away (hole)']]} onChange={(v) => set({ op: v })} />
        <Color label="Colour" value={part.color} onChange={(v) => set({ color: v }, 'color')} />
      </div>
      {part.op !== 'subtract' && (
        <FilamentPick value={part.filament} filaments={filamentsOf(d)} onChange={(v) => set({ filament: v })} />
      )}
      {part.op === 'subtract' && (
        <Select label="Cut from" value={part.target || ''} hint="Cut only one part, e.g. the opening of a loop guard without cutting the grip inside it"
          options={[['', 'Everything it touches'], ...addParts.map((p) => [p.id, p.name])]} onChange={(v) => set({ target: v || undefined })} />
      )}
      {part.type === 'profile' && (
        <>
          <Num label="Thickness" unit="mm" value={part.thickness} min={1} max={150} step={0.5} slider onChange={(v) => set({ thickness: v }, 'th')} hint="Full thickness of the blade's flat (or the spine)" />
          <Check label="Mirror left/right (edit one half)" checked={part.symmetric} onChange={(v) => set(symmetryPatch(part, v))} />
          <h4>Edge grind <span class="muted small">(orange nodes in the outline)</span></h4>
          <Num label="Grind starts" unit="mm" value={part.bevel} min={0} max={200} step={0.5} slider onChange={(v) => set({ bevel: v }, 'bevel')} hint="How far in from the edge the bevel starts. 0 = flat slab, no edge." />
          <Num label="Edge thickness" unit="mm" value={part.edge} min={0.4} max={part.thickness} step={0.1} slider onChange={(v) => set({ edge: v }, 'edge')} hint="How sharp the edge ends up. Thinner = sharper looking. 1.5–3 mm prints cleanly and keeps the prop con-safe." />
          <div class="two">
            <Select label="Grind shape" value={part.grind || 'flat'} options={[['flat', 'Flat (V)'], ['convex', 'Convex'], ['hollow', 'Hollow']]} onChange={(v) => set({ grind: v })} />
            <Select label="Ground on" value={part.sides || 'both'} options={[['both', 'Both faces'], ['front', 'Front only (chisel)'], ['back', 'Back only (chisel)']]} onChange={(v) => set({ sides: v })} />
          </div>
          <Check label="Distal taper (thinner toward the tip)" checked={part.tipThickness != null} onChange={(v) => set({ tipThickness: v ? Math.round(part.thickness * 0.6 * 10) / 10 : null })} />
          {part.tipThickness != null && (
            <Num label="Tip thickness" unit="mm" value={part.tipThickness} min={0.6} max={part.thickness * 2} step={0.5} slider onChange={(v) => set({ tipThickness: v }, 'tip')} hint="Thickness at the far end of the outline (top, +Y); it tapers smoothly from the base." />
          )}
          <GrindPreview part={part} />
          {!(part.points || []).some((q) => q.s) && <Help warn>No node is marked sharp, so there is no edge. Select nodes in the outline editor and press "Sharp" (or "All sharp").</Help>}
        </>
      )}
      {part.type === 'lathe' && (
        <>
          <Select label="Cross-section" value={String([0, 4, 6, 8, 12].includes(part.sides) ? part.sides : 0)}
            options={[['0', 'Round'], ['12', '12-sided'], ['8', 'Octagonal'], ['6', 'Hexagonal'], ['4', 'Square (diamond)']]}
            onChange={(v) => set({ sides: +v || 64 })} />
          <Num label="Sweep" unit="°" value={part.sweep ?? 360} min={10} max={360} step={5} slider onChange={(v) => set({ sweep: v }, 'sweep')} hint="360 = full turn. Less makes an arc." />
          <Check label="Ring (profile does not touch the axis)" checked={part.closedRing} onChange={(v) => set({ closedRing: v })} />
          <Help>The outline editor shows the profile (radius × length) that is spun around the blue axis.</Help>
        </>
      )}
      {part.type === 'box' && <Vec3 label="Size" value={part.size} onChange={(v) => set({ size: v.map((x) => Math.max(0.5, x)) }, 'size')} />}
      {part.type === 'cylinder' && (
        <>
          <div class="two">
            <Num label="Bottom radius" unit="mm" value={part.r1} min={0} step={0.5} onChange={(v) => set({ r1: v }, 'r1')} />
            <Num label="Top radius" unit="mm" value={part.r2 ?? part.r1} min={0} step={0.5} onChange={(v) => set({ r2: v }, 'r2')} />
          </div>
          <div class="two">
            <Num label="Length" unit="mm" value={part.height} min={0.5} step={1} onChange={(v) => set({ height: v }, 'h')} />
            <Num label="Sides" value={part.sides} min={3} max={128} step={1} onChange={(v) => set({ sides: Math.round(v) }, 'sides')} />
          </div>
        </>
      )}
      {part.type === 'mesh' && (
        <>
          <Select label="File units" value={String(part.unit || 1)} options={[['1', 'millimetres'], ['10', 'centimetres (×10)'], ['25.4', 'inches (×25.4)'], ['1000', 'metres (×1000)']]}
            onChange={(v) => set({ unit: +v })} hint="STL files have no units. If the model came out tiny, it was probably made in cm or inches." />
          {part.info && <Help>{part.info.tris.toLocaleString()} triangles · {part.info.size.map((v) => Math.round(v * (part.unit || 1))).join(' × ')} mm{part.info.repaired ? ` · ${part.info.repaired} hole${part.info.repaired > 1 ? 's' : ''} closed on import` : ''}</Help>}
          <div class="row-btns">
            <button onClick={() => set({ rot: [0, 0, 0] })}>Reset rotation</button>
            <button onClick={() => set({ rot: [part.rot[0], part.rot[1], (part.rot[2] + 90) % 360] })}>Turn 90° (Z)</button>
            <button onClick={() => set({ rot: [(part.rot[0] + 90) % 360, part.rot[1], part.rot[2]] })}>Tip 90° (X)</button>
          </div>
          <Help>The weapon's length should run along Y (up in the 3D view), with the flat of the blade facing you, so cuts and dowels line up.</Help>
        </>
      )}
      {part.type === 'sphere' && <Num label="Radius" unit="mm" value={part.r} min={1} step={0.5} slider max={300} onChange={(v) => set({ r: v }, 'r')} />}
      <Vec3 label="Position" value={part.pos} onChange={(v) => set({ pos: v }, 'pos')} />
      <Vec3 label="Rotation" unit="°" step={5} value={part.rot} onChange={(v) => set({ rot: v }, 'rot')} />
      <Vec3 label="Stretch" unit="×" step={0.05} value={part.stretch || [1, 1, 1]} onChange={(v) => set({ stretch: v.map((x) => x || 1) }, 'stretch')} />
      <div class="two">
        <Select label="Copies" value={part.copies?.mode || 'none'}
          options={[['none', 'None'], ['mirrorX', 'Mirror left/right'], ['mirrorZ', 'Mirror front/back'], ['radial', 'Radial around Y']]}
          onChange={(v) => set({ copies: { ...(part.copies || {}), mode: v, count: part.copies?.count || 4 } })} />
        {part.copies?.mode === 'radial' && <Num label="Count" value={part.copies.count} min={2} max={36} step={1} onChange={(v) => set({ copies: { ...part.copies, count: Math.round(v) } }, 'count')} />}
      </div>
      <div class="row-btns">
        <button onClick={() => edit((dd) => { const c = structuredClone(part); c.id = uid(); c.name = `${part.name} copy`; c.pos = [c.pos[0] + 20, c.pos[1], c.pos[2]]; dd.parts.splice(idx + 1, 0, c); setUI({ sel: { kind: 'part', id: c.id } }); })}>Duplicate</button>
        <button class="danger" onClick={() => { edit((dd) => { dd.parts.splice(idx, 1); }); setUI({ sel: null }); }}>Delete part</button>
      </div>
    </Section>
  );
}

export function ShapePanel() {
  const d = store.design;
  const sel = store.ui.sel?.kind === 'part' ? store.ui.sel.id : null;
  const selIdx = d.parts.findIndex((p) => p.id === sel);
  const box = store.modelBox;
  const length = box ? box.max[1] - box.min[1] : null;

  const add = (kind) => {
    const at = box ? Math.round(((box.min[1] + box.max[1]) / 2) / (d.scale || 1)) : 0;
    const p = newPart(kind, at);
    edit((dd) => { dd.parts.push(p); });
    setUI({ sel: { kind: 'part', id: p.id }, editorOpen: true });
  };

  return (
    <div>
      <Section title="Design">
        <Text label="Name" value={d.name} onChange={(v) => edit((dd) => { dd.name = v; }, 'name')} />
        <div class="two">
          <Num label="Overall length" unit="mm" value={length} step={10} min={50}
            hint="Scales the whole prop. Inserts keep their real sizes (a 3/8 in dowel stays 3/8 in)."
            onChange={(v) => { if (length && v > 20) edit((dd) => { dd.scale = (dd.scale || 1) * (v / length); }, 'len'); }} />
          <Num label="Scale" unit="%" value={Math.round((d.scale || 1) * 1000) / 10} step={1} min={5} max={500}
            onChange={(v) => edit((dd) => { dd.scale = Math.max(0.05, v / 100); }, 'scale')} />
        </div>
        {box && <Help>Size: {Math.round(box.max[0] - box.min[0])} × {Math.round(length)} × {Math.round(box.max[2] - box.min[2])} mm (width × length × thickness)</Help>}
        {length > 1500 && (
          <Help warn>Over 150 cm. Many conventions cap props at 150 cm (180 cm for narrow staffs and spears) and ask that bigger props come apart without tools. Use "Screw thread" or "Threaded rod + insert" joints in the Split tab, and check your event's prop rules.</Help>
        )}
      </Section>
      <Section title="Parts" right={<span class="muted">click a part in 3D to select it</span>}>
        <ul class="list">
          {d.parts.map((p) => (
            <li key={p.id} class={p.id === sel ? 'on' : ''} onClick={() => setUI({ sel: { kind: 'part', id: p.id }, pointSel: null })}>
              <span class="dot" style={{ background: p.op === 'subtract' ? 'transparent' : p.color, borderColor: p.color }} />
              <span class="nm">{p.name}</span>
              <span class="muted small">{p.op === 'subtract' ? 'hole' : TYPE_LABEL[p.type]}</span>
              {p.op !== 'subtract' && <span class="fil-badge" title={`Filament ${p.filament || 1}`} style={{ background: filamentsOf(d)[(p.filament || 1) - 1]?.color }}>{p.filament || 1}</span>}
              <button class="icon" title={p.hidden ? 'Show' : 'Hide'} onClick={(e) => { e.stopPropagation(); edit((dd) => { const q = dd.parts.find((x) => x.id === p.id); q.hidden = !q.hidden; }); }}>{p.hidden ? '◌' : '●'}</button>
            </li>
          ))}
        </ul>
        <div class="add-grid">
          <span class="muted">Add:</span>
          <button onClick={() => add('blade')}>Blade</button>
          <button onClick={() => add('flat')}>Flat shape</button>
          <button onClick={() => add('lathe')}>Round (grip, pommel)</button>
          <button onClick={() => add('box')}>Box</button>
          <button onClick={() => add('cylinder')}>Cylinder</button>
          <button onClick={() => add('sphere')}>Sphere</button>
          <button onClick={() => add('hole')}>Round hole</button>
          <button onClick={() => add('cutshape')}>Shaped cut-out</button>
          <label class="btn" title="Bring in an STL (e.g. from Thingiverse/Printables) to split, add inserts and joints to">
            Import STL…<input type="file" accept=".stl,model/stl" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importSTL(f).catch((err) => toast(`Import failed: ${err.message}`)); }} />
          </label>
        </div>
      </Section>
      {selIdx >= 0 && <PartEditor key={d.parts[selIdx].id} part={d.parts[selIdx]} idx={selIdx} />}
    </div>
  );
}
