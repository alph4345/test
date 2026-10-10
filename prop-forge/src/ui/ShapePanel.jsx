import { store, edit, setUI } from '../state.js';
import { symmetryPatch } from './ProfileEditor.jsx';
import { Num, Vec3, Select, Check, Text, Color, Section, Help } from './controls.jsx';
import { blade, flat, lathe, box, cyl, sphere, hole, P, COLORS, uid, gripPoints } from '../templates/helpers.js';

const TYPE_LABEL = { profile: 'flat / blade', lathe: 'round', box: 'box', cylinder: 'cylinder', sphere: 'sphere' };

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
      {part.op === 'subtract' && (
        <Select label="Cut from" value={part.target || ''} hint="Cut only one part, e.g. the opening of a loop guard without cutting the grip inside it"
          options={[['', 'Everything it touches'], ...addParts.map((p) => [p.id, p.name])]} onChange={(v) => set({ target: v || undefined })} />
      )}
      {part.type === 'profile' && (
        <>
          <Num label="Thickness" unit="mm" value={part.thickness} min={1} max={150} step={0.5} slider onChange={(v) => set({ thickness: v }, 'th')} hint="Full thickness of the flat middle" />
          <Num label="Edge thickness" unit="mm" value={part.edge} min={0.8} max={part.thickness} step={0.1} slider onChange={(v) => set({ edge: v }, 'edge')} hint="How thick the 'sharp' edges end up. 1.5–3 mm prints well and is safe." />
          <Num label="Bevel width" unit="mm" value={part.bevel} min={0} max={150} step={0.5} slider onChange={(v) => set({ bevel: v }, 'bevel')} hint="How far in from the edge the grind starts. 0 = flat slab." />
          <Check label="Mirror left/right (edit one half)" checked={part.symmetric} onChange={(v) => set(symmetryPatch(part, v))} />
          <Help>Orange points/edges in the outline editor are sharpened. Edit the outline below the 3D view.</Help>
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
      </Section>
      <Section title="Parts" right={<span class="muted">click a part in 3D to select it</span>}>
        <ul class="list">
          {d.parts.map((p) => (
            <li key={p.id} class={p.id === sel ? 'on' : ''} onClick={() => setUI({ sel: { kind: 'part', id: p.id }, pointSel: null })}>
              <span class="dot" style={{ background: p.op === 'subtract' ? 'transparent' : p.color, borderColor: p.color }} />
              <span class="nm">{p.name}</span>
              <span class="muted small">{p.op === 'subtract' ? 'hole' : TYPE_LABEL[p.type]}</span>
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
        </div>
      </Section>
      {selIdx >= 0 && <PartEditor key={d.parts[selIdx].id} part={d.parts[selIdx]} idx={selIdx} />}
    </div>
  );
}
