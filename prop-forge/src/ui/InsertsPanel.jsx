import { store, edit, setUI, filamentsOf } from '../state.js';
import { Num, Vec3, Select, Check, Text, Section, Help, FilamentPick } from './controls.jsx';
import { dowel, bay, uid } from '../templates/helpers.js';
import { DOWELS } from '../engine/split.js';
import { MOUNT_PRESETS } from '../engine/build.js';

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

function mount(name, style, pos, angle, side = '-z') {
  const p = MOUNT_PRESETS[style];
  return { id: uid('f'), type: 'mount', name, style, side, pos, angle, span: p.span, gap: p.gap, bar: p.bar };
}

// forearm strap (two loops the strap runs through) plus a hand grip
// nearer the rim, the layout used on most worn shields
export function shieldSet(cy = 0) {
  return [
    mount('Hand grip', 'grip', [0, cy - 150], 0),
    mount('Forearm strap loop L', 'loop', [-85, cy + 60], 90),
    mount('Forearm strap loop R', 'loop', [85, cy + 60], 90),
  ];
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
  else if (kind === 'grip' || kind === 'loop') {
    f = mount(kind === 'grip' ? 'Hand grip' : 'Strap loop', kind, [0, cy], 0);
  } else if (kind === 'shieldset') {
    const list = shieldSet(cy);
    edit((dd) => { dd.features.push(...list); });
    setUI({ sel: { kind: 'feature', id: list[0].id } });
    return;
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
      {f.type === 'mount' && (
        <>
          <div class="two">
            <Select label="Type" value={f.style} options={[['grip', 'Hand grip'], ['loop', 'Strap loop']]}
              onChange={(v) => set((x) => { x.style = v; Object.assign(x, MOUNT_PRESETS[v]); })} />
            <Select label="On face" value={f.side || '-z'} options={[['-z', 'Back (−Z)'], ['+z', 'Front (+Z)']]} onChange={(v) => set((x) => { x.side = v; })} />
          </div>
          <div class="two">
            <Num label="Centre X" unit="mm" value={f.pos[0]} step={1} onChange={(v) => set((x) => { x.pos = [v, x.pos[1]]; }, 'px')} />
            <Num label="Centre Y" unit="mm" value={f.pos[1]} step={1} onChange={(v) => set((x) => { x.pos = [x.pos[0], v]; }, 'py')} />
          </div>
          <Num label="Angle" unit="°" value={f.angle || 0} min={-180} max={180} step={5} slider onChange={(v) => set((x) => { x.angle = v; }, 'ang')} />
          <Num label={f.style === 'grip' ? 'Grip length' : 'Strap opening'} unit="mm" value={f.span} min={20} max={300} step={1} onChange={(v) => set((x) => { x.span = v; }, 'span')}
            hint={f.style === 'grip' ? 'Post to post. 110–130 mm fits most hands.' : 'Post to post. Strap width + about 8 mm (46 mm for 1.5 in / 38 mm webbing).'} />
          <div class="two">
            <Num label="Clearance" unit="mm" value={f.gap} min={2} max={80} step={1} onChange={(v) => set((x) => { x.gap = v; }, 'gap')}
              hint={f.style === 'grip' ? 'Gap between surface and bar for your fingers (35–40 mm).' : 'Room for the strap thickness (4–6 mm).'} />
            <Num label="Bar Ø" unit="mm" value={f.bar} min={4} max={50} step={1} onChange={(v) => set((x) => { x.bar = v; }, 'bar')} />
          </div>
          <FilamentPick value={f.filament} filaments={filamentsOf(store.design)} onChange={(v) => set((x) => { x.filament = v; })} />
          <Help>Posts reach down to the surface wherever it is, so this works on domed shields. Print the piece with the hardware facing up, and use 4+ walls.</Help>
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
        <Help>Hollow spaces cut into the prop (a dowel or steel-rod channel through the handle, bays for batteries, LEDs, speakers or boards) and hardware added to it (hand grips and strap loops for shields). Sizes are real millimetres and don't change when you rescale.</Help>
        <div class="add-grid">
          <span class="muted">Add:</span>
          <button onClick={() => addFeature('dowel')}>Handle dowel</button>
          <button onClick={() => addFeature('rod')}>Steel rod</button>
          <button onClick={() => addFeature('bay')}>Electronics bay</button>
          <button onClick={() => addFeature('battery')}>18650 battery</button>
          <button onClick={() => addFeature('wire')}>Wire channel</button>
          <button onClick={() => addFeature('led')}>LED strip groove</button>
          <button onClick={() => addFeature('grip')} title="D-handle you hold, e.g. on the back of a shield">Hand grip</button>
          <button onClick={() => addFeature('loop')} title="Bridge for a nylon or leather strap">Strap loop</button>
          <button onClick={() => addFeature('shieldset')} title="Forearm strap loops + hand grip">Shield straps set</button>
        </div>
        <ul class="list">
          {d.features.map((f) => (
            <li key={f.id} class={f.id === sel ? 'on' : ''} onClick={() => setUI({ sel: { kind: 'feature', id: f.id } })}>
              <span class="dot ins" />
              <span class="nm">{f.name}</span>
              <span class="muted small">{f.type === 'channel' ? `Ø${f.diameter}` : f.type === 'mount' ? (f.style === 'grip' ? 'grip' : 'strap loop') : f.size.join('×')}</span>
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
