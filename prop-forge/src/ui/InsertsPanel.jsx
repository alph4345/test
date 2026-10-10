import { store, edit, setUI } from '../state.js';
import { Num, Vec3, Select, Check, Text, Section, Help } from './controls.jsx';
import { dowel, bay, uid } from '../templates/helpers.js';
import { DOWELS } from '../engine/split.js';

const SIDES = [['+z', 'Front face (+Z)'], ['-z', 'Back face (−Z)'], ['+x', 'Right side (+X)'], ['-x', 'Left side (−X)'], ['+y', 'Top end (+Y)'], ['-y', 'Bottom end (−Y)']];

function defaults() {
  const d = store.design;
  const s = d.scale || 1;
  const box = store.modelBox;
  const meta = d.meta || {};
  const cy = box ? (box.min[1] + box.max[1]) / 2 / s : 0;
  const bottom = box ? box.min[1] / s : -200;
  const handle = meta.handle || { from: [0, bottom + 5, 0], to: [0, cy, 0] };
  const bladePart = d.parts.find((p) => p.type === 'profile' && /blade|head/i.test(p.name));
  return { s, box, meta, cy, handle, bladePart };
}

function addFeature(kind) {
  const { meta, cy, handle, bladePart } = defaults();
  let f;
  if (kind === 'dowel') f = dowel('Handle dowel', handle.from.slice(), handle.to.slice(), 9.53);
  else if (kind === 'rod') f = dowel('Steel rod', handle.from.slice(), [handle.to[0], handle.to[1] + 200, handle.to[2]], 6, { clearance: 0.15 });
  else if (kind === 'bay') f = bay('Electronics bay', (meta.bayPos || [0, cy, 0]).slice(), (meta.baySize || [30, 60, 14]).slice(), { lid: { side: meta.baySide || '+z', ledge: 8, magnets: { enabled: true, diameter: 6.2, depth: 3.2 } } });
  else if (kind === 'battery') f = bay('18650 battery bay', (meta.bayPos || [0, cy, 0]).slice(), [21, 70, 21], { lid: { side: meta.baySide || '+z', ledge: 7, magnets: { enabled: true, diameter: 5.2, depth: 2.2 } } });
  else if (kind === 'wire') {
    const p = meta.bayPos || [0, cy, 0];
    f = dowel('Wire channel', p.slice(), [p[0], p[1] + 150, p[2]], 6, { clearance: 0 });
  } else if (kind === 'led') {
    const T = bladePart ? bladePart.thickness / 2 : 5;
    const ys = bladePart ? bladePart.points.map((q) => q.y) : [0, 600];
    const y0 = Math.min(...ys), y1 = Math.max(...ys);
    const len = (y1 - y0) * 0.75;
    const x = bladePart ? bladePart.pos[0] + (bladePart.symmetric ? 0 : (Math.min(...bladePart.points.map((q) => q.x)) + Math.max(...bladePart.points.map((q) => q.x))) / 2) : 0;
    f = bay('LED strip groove', [x, y0 + (y1 - y0) * 0.45, T], [12, Math.round(len), 8], { lid: { enabled: false } });
    f.lid.enabled = false;
  }
  if (!f) return;
  edit((dd) => { dd.features.push(f); });
  setUI({ sel: { kind: 'feature', id: f.id } });
}

function FeatureEditor({ f, idx }) {
  const set = (fn, key) => edit((dd) => fn(dd.features[idx]), key ? `${f.id}-${key}` : null);
  const { handle } = defaults();
  const len = f.type === 'channel' ? Math.hypot(...f.to.map((v, i) => v - f.from[i])) * (store.design.scale || 1) : 0;
  const dowelOpts = [...DOWELS.map((x) => [String(x.d), `${x.label} (${x.d} mm)`]), ['custom', 'Custom…']];
  const known = DOWELS.some((x) => x.d === f.diameter);
  return (
    <Section title={`Edit: ${f.name}`}>
      <Text label="Name" value={f.name} onChange={(v) => set((x) => { x.name = v; }, 'name')} />
      {f.type === 'channel' && (
        <>
          <Select label="Size" value={known ? String(f.diameter) : 'custom'} options={dowelOpts}
            onChange={(v) => v !== 'custom' && set((x) => { x.diameter = +v; })} />
          <div class="two">
            <Num label="Diameter" unit="mm" value={f.diameter} min={1} max={60} step={0.1} onChange={(v) => set((x) => { x.diameter = v; }, 'd')} />
            <Num label="Extra clearance" unit="mm" value={f.clearance ?? 0.2} min={0} max={2} step={0.05} onChange={(v) => set((x) => { x.clearance = v; }, 'c')} hint="Added to the radius so the dowel slides in. 0.15–0.3 mm is typical." />
          </div>
          <Vec3 label="Start" value={f.from} onChange={(v) => set((x) => { x.from = v; }, 'from')} />
          <Vec3 label="End" value={f.to} onChange={(v) => set((x) => { x.to = v; }, 'to')} />
          <Help>Length {Math.round(len)} mm. Cut your dowel/rod about 2 mm shorter than this.</Help>
          <div class="row-btns">
            <button onClick={() => set((x) => { x.from = handle.from.slice(); x.to = handle.to.slice(); })}>Run through the handle</button>
          </div>
        </>
      )}
      {f.type === 'cavity' && (
        <>
          <Vec3 label="Centre" value={f.pos} onChange={(v) => set((x) => { x.pos = v; }, 'pos')} />
          <Vec3 label="Size" labels={['W', 'L', 'D']} value={f.size} onChange={(v) => set((x) => { x.size = v.map((q) => Math.max(1, q)); }, 'size')} />
          <Check label="Removable lid / hatch" checked={f.lid?.enabled} onChange={(v) => set((x) => { x.lid = { ...(x.lid || {}), enabled: v }; })}
            hint="Cuts an opening to the surface with a ledge. The lid is printed as its own piece, shaped like the surface it came from." />
          {f.lid?.enabled && (
            <>
              <Select label="Lid on" value={f.lid.side || '+z'} options={SIDES} onChange={(v) => set((x) => { x.lid.side = v; })} />
              <div class="two">
                <Num label="Ledge" unit="mm" value={f.lid.ledge} min={0} max={20} step={0.5} onChange={(v) => set((x) => { x.lid.ledge = v; }, 'ledge')} hint="Lip around the opening the lid rests on" />
                <Num label="Lid gap" unit="mm" value={f.lid.clearance} min={0} max={1.5} step={0.05} onChange={(v) => set((x) => { x.lid.clearance = v; }, 'lc')} />
              </div>
              <Check label="Magnet pockets (4 corners)" checked={f.lid.magnets?.enabled} onChange={(v) => set((x) => { x.lid.magnets = { diameter: 6.2, depth: 3.2, ...(x.lid.magnets || {}), enabled: v }; })} />
              {f.lid.magnets?.enabled && (
                <div class="two">
                  <Num label="Magnet Ø" unit="mm" value={f.lid.magnets.diameter} min={2} max={20} step={0.1} onChange={(v) => set((x) => { x.lid.magnets.diameter = v; }, 'md')} />
                  <Num label="Depth" unit="mm" value={f.lid.magnets.depth} min={1} max={10} step={0.1} onChange={(v) => set((x) => { x.lid.magnets.depth = v; }, 'mdep')} />
                </div>
              )}
              {f.lid.magnets?.enabled && f.lid.ledge < f.lid.magnets.diameter + 1 && <Help warn>Ledge is narrower than the magnets; widen the ledge to at least {Math.ceil(f.lid.magnets.diameter + 1.5)} mm.</Help>}
            </>
          )}
        </>
      )}
      <div class="row-btns">
        <button onClick={() => edit((dd) => { const c = structuredClone(f); c.id = uid('f'); c.name += ' copy'; dd.features.push(c); })}>Duplicate</button>
        <button class="danger" onClick={() => { edit((dd) => { dd.features.splice(idx, 1); }); setUI({ sel: null }); }}>Delete</button>
      </div>
    </Section>
  );
}

export function InsertsPanel() {
  const d = store.design;
  const sel = store.ui.sel?.kind === 'feature' ? store.ui.sel.id : null;
  const idx = d.features.findIndex((f) => f.id === sel);
  return (
    <div>
      <Section title="Inserts & compartments">
        <Help>Hollow spaces cut into the prop: a channel for a wooden dowel or steel rod through the handle (the backbone of the prop), and bays for batteries, LEDs, speakers or boards. Sizes are real millimetres and don't change when you rescale.</Help>
        <div class="add-grid">
          <span class="muted">Add:</span>
          <button onClick={() => addFeature('dowel')}>Handle dowel</button>
          <button onClick={() => addFeature('rod')}>Steel rod</button>
          <button onClick={() => addFeature('bay')}>Electronics bay</button>
          <button onClick={() => addFeature('battery')}>18650 battery</button>
          <button onClick={() => addFeature('wire')}>Wire channel</button>
          <button onClick={() => addFeature('led')}>LED strip groove</button>
        </div>
        <ul class="list">
          {d.features.map((f) => (
            <li key={f.id} class={f.id === sel ? 'on' : ''} onClick={() => setUI({ sel: { kind: 'feature', id: f.id } })}>
              <span class="dot ins" />
              <span class="nm">{f.name}</span>
              <span class="muted small">{f.type === 'channel' ? `Ø${f.diameter}` : f.size.join('×')}</span>
              <button class="icon" title={f.hidden ? 'Enable' : 'Disable'} onClick={(e) => { e.stopPropagation(); edit((dd) => { const q = dd.features.find((x) => x.id === f.id); q.hidden = !q.hidden; }); }}>{f.hidden ? '◌' : '●'}</button>
            </li>
          ))}
          {!d.features.length && <li class="empty">No inserts yet.</li>}
        </ul>
        <Help>Drag the orange shapes in the 3D view with the arrows, or type exact positions. Positions are in the template's units (before scaling).</Help>
      </Section>
      {idx >= 0 && <FeatureEditor key={d.features[idx].id} f={d.features[idx]} idx={idx} />}
    </div>
  );
}
