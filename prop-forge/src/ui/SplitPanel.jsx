import { store, edit, setUI, toast, filamentsOf } from '../state.js';
import { request } from '../engine/client.js';
import { Num, Select, Check, Section, Help } from './controls.jsx';
import { uid } from '../templates/helpers.js';
import { pieceColor } from './Viewport.js';

export const PRINTERS = [
  ['snapmaker-u1', 'Snapmaker U1 (4 toolheads)', 270, 270, 270],
  ['bambu', 'Bambu Lab X1 / P1 / A1', 256, 256, 256],
  ['bambu-mini', 'Bambu Lab A1 mini', 180, 180, 180],
  ['bambu-h2d', 'Bambu Lab H2D', 325, 320, 325],
  ['prusa-mk4', 'Prusa MK4 / MK3', 250, 210, 220],
  ['prusa-core', 'Prusa Core One', 250, 220, 270],
  ['prusa-xl', 'Prusa XL', 360, 360, 360],
  ['ender3', 'Creality Ender 3 / V3 SE', 220, 220, 250],
  ['k1', 'Creality K1 / K1C', 220, 220, 250],
  ['k1max', 'Creality K1 Max', 300, 300, 300],
  ['ender5max', 'Creality Ender 5 Max', 400, 400, 400],
  ['neptune4max', 'Elegoo Neptune 4 Max', 420, 420, 480],
  ['custom', 'Custom size', null, null, null],
];

export const JOINTS = [
  ['auto', 'Auto (best fit)'],
  ['tenon', 'Shaped plug (tenon)'],
  ['tabs', 'Puzzle tabs'],
  ['pins', 'Dowel pins'],
  ['key', 'Key peg'],
  ['thread', 'Screw thread (take apart)'],
  ['hardware', 'Threaded rod + insert (take apart)'],
  ['none', 'None (glue only)'],
];

const JOINT_HELP = {
  auto: 'Thick sections get a shaped plug, thin flat blades get puzzle tabs. Falls back to pins.',
  tenon: 'A plug shaped like the cross-section (inset by the wall thickness) slides into a matching socket. Very strong, self-aligning, lots of glue area.',
  tabs: 'Jigsaw-style dovetail knobs through the thickness. Lock the pieces together lengthwise; ideal for flat blades.',
  pins: 'Matching holes in both faces for wooden dowels, steel rod or printed pins. Simple and strong.',
  key: 'A square, round or cross-shaped peg on one side. Cross / square keys stop twisting.',
  thread: 'A printed screw: one piece screws into the other, no glue or tools. Use it where the prop must come apart for travel or con rules (staffs, polearms, long swords). Works best on round sections; print with 3+ walls.',
  hardware: 'Strongest take-apart joint: a steel threaded rod is epoxied into one piece and screws into a heat-set insert or glued-in coupling nut in the other. Needs a round-ish section big enough for the insert.',
  none: 'Flat faces. Glue (CA or epoxy) only.',
};

function JointEditor({ j, onChange, onRemove }) {
  const set = (patch) => onChange({ ...j, ...patch });
  return (
    <div class="joint">
      <div class="two">
        <Select label="Joint" value={j.type} options={JOINTS} onChange={(v) => onChange({ type: v })} />
        <Check label="Flip side" checked={j.flip} onChange={(v) => set({ flip: v })} hint="Put the plug / tabs on the other piece" />
      </div>
      <Help>{JOINT_HELP[j.type]}</Help>
      {j.type === 'tenon' && (
        <div class="two">
          <Num label="Wall" unit="mm" placeholder="auto" value={j.wall} min={1.2} max={20} step={0.2} onChange={(v) => set({ wall: v })} hint="Material left around the socket" />
          <Num label="Depth" unit="mm" placeholder="auto" value={j.length} min={5} max={80} step={1} onChange={(v) => set({ length: v })} />
        </div>
      )}
      {j.type === 'tabs' && (
        <div class="two">
          <Num label="Knob Ø" unit="mm" placeholder="auto" value={j.size} min={6} max={80} step={1} onChange={(v) => set({ size: v })} />
          <Num label="Count" placeholder="auto" value={j.count === 'auto' ? null : j.count} min={1} max={8} step={1} onChange={(v) => set({ count: v ?? 'auto' })} />
        </div>
      )}
      {j.type === 'pins' && (
        <>
          <div class="two">
            <Num label="Pin Ø" unit="mm" placeholder="auto" value={j.diameter} min={2} max={25} step={0.1} onChange={(v) => set({ diameter: v })} />
            <Num label="Depth each side" unit="mm" placeholder="auto" value={j.depth} min={4} max={80} step={1} onChange={(v) => set({ depth: v })} />
          </div>
          <div class="two">
            <Num label="Count" placeholder="auto" value={j.count === 'auto' ? null : j.count} min={1} max={8} step={1} onChange={(v) => set({ count: v ?? 'auto' })} />
            <Check label="Print the pins too" checked={j.printPins} onChange={(v) => set({ printPins: v })} />
          </div>
        </>
      )}
      {j.type === 'key' && (
        <div class="two">
          <Select label="Shape" value={j.shape || 'square'} options={[['square', 'Square'], ['cross', 'Cross'], ['round', 'Round']]} onChange={(v) => set({ shape: v })} />
          <Num label="Width" unit="mm" placeholder="auto" value={j.size} min={3} max={60} step={0.5} onChange={(v) => set({ size: v })} />
        </div>
      )}
      {j.type === 'thread' && (
        <div class="three">
          <Num label="Diameter" unit="mm" placeholder="auto" value={j.diameter} min={8} max={60} step={1} onChange={(v) => set({ diameter: v })} />
          <Num label="Pitch" unit="mm" placeholder="auto" value={j.pitch} min={2} max={10} step={0.5} onChange={(v) => set({ pitch: v })} />
          <Num label="Length" unit="mm" placeholder="auto" value={j.length} min={8} max={60} step={1} onChange={(v) => set({ length: v })} />
        </div>
      )}
      {j.type === 'hardware' && (
        <div class="two">
          <Select label="Rod size" value={j.size || 'M8'} options={[['M5', 'M5'], ['M6', 'M6'], ['M8', 'M8'], ['quarter', '1/4"-20'], ['fivesixteenth', '5/16"-18']]} onChange={(v) => set({ size: v })} />
          <Select label="Female side" value={j.hardware || 'insert'} options={[['insert', 'Heat-set insert'], ['nut', 'Coupling nut (glued)']]} onChange={(v) => set({ hardware: v })} />
        </div>
      )}
      {j.type !== 'none' && j.type !== 'auto' && j.type !== 'hardware' && (
        <Num label="Fit clearance" unit="mm" placeholder="default" value={j.clearance} min={0} max={1} step={0.05} onChange={(v) => set({ clearance: v })}
          hint="Gap per side between plug and socket. 0.15–0.25 mm for a snug glue fit; more if your printer over-extrudes." />
      )}
      <button class="link danger" onClick={onRemove}>Remove joint</button>
    </div>
  );
}

function CutEditor({ cut, idx, box, report }) {
  const set = (fn, key) => edit((dd) => fn(dd.split.cuts[idx]), key ? `${cut.id}-${key}` : null);
  const k = { x: 0, y: 1, z: 2 }[cut.axis];
  const lo = box ? Math.floor(box.min[k]) : -500, hi = box ? Math.ceil(box.max[k]) : 500;
  const lim = cut.limit || {};
  return (
    <Section title={`Cut ${idx + 1}`}>
      <Select label="Direction" value={cut.axis} onChange={(v) => set((c) => { c.axis = v; c.pos = box ? Math.round((box.min[{ x: 0, y: 1, z: 2 }[v]] + box.max[{ x: 0, y: 1, z: 2 }[v]]) / 2) : 0; })}
        options={[['y', 'Across the length (Y)'], ['x', 'Lengthwise, left/right (X)'], ['z', 'Front/back halves, clamshell (Z)']]} />
      <Num label="Position" unit="mm" value={cut.pos} min={lo} max={hi} step={0.5} slider onChange={(v) => set((c) => { c.pos = v; }, 'pos')} />
      <details class="limit" open={!!cut.limit}>
        <summary>Only cut part of the model</summary>
        <Help>Limit this cut to pieces whose centre lies inside these ranges, e.g. split only the handle into clamshell halves.</Help>
        {['x', 'y', 'z'].filter((a) => a !== cut.axis).map((a) => (
          <div class="two" key={a}>
            <Check label={`${a.toUpperCase()} range`} checked={Array.isArray(lim[a])} onChange={(v) => set((c) => {
              c.limit = { ...(c.limit || {}) };
              const ai = { x: 0, y: 1, z: 2 }[a];
              if (v) c.limit[a] = box ? [Math.round(box.min[ai]), Math.round(box.max[ai])] : [-100, 100]; else delete c.limit[a];
              if (!Object.keys(c.limit).length) delete c.limit;
            })} />
            {Array.isArray(lim[a]) && (
              <span class="range">
                <input type="number" value={lim[a][0]} onInput={(e) => set((c) => { c.limit[a][0] = +e.target.value; }, `l${a}0`)} />
                <span>to</span>
                <input type="number" value={lim[a][1]} onInput={(e) => set((c) => { c.limit[a][1] = +e.target.value; }, `l${a}1`)} />
              </span>
            )}
          </div>
        ))}
      </details>
      <h4>Joints</h4>
      {(cut.joints || []).map((j, ji) => (
        <JointEditor key={ji} j={j} onChange={(nj) => set((c) => { c.joints[ji] = nj; }, `j${ji}`)} onRemove={() => set((c) => { c.joints.splice(ji, 1); })} />
      ))}
      <div class="row-btns">
        <button onClick={() => set((c) => { c.joints = [...(c.joints || []), { type: 'pins' }]; })}>+ Add joint</button>
        <button class="danger" onClick={() => { edit((dd) => { dd.split.cuts.splice(idx, 1); }); setUI({ sel: null }); }}>Delete cut</button>
      </div>
      {report && report.notes.length > 0 && <Help>Result: {Array.from(new Set(report.notes)).join(' · ')}</Help>}
      {report && report.hit === 0 && <Help warn>This cut doesn't pass through any piece.</Help>}
    </Section>
  );
}

const grams = (mm3) => Math.round((mm3 / 1000) * 1.24 * 0.45);

export function SplitPanel() {
  const d = store.design;
  const split = d.split;
  const plate = split.plate;
  const box = store.modelBox;
  const match = PRINTERS.find((p) => p[1] === plate.name) || PRINTERS.find((p) => p[2] === plate.x && p[3] === plate.y && p[4] === plate.z);
  const preset = match ? match[0] : 'custom';
  const sel = store.ui.sel?.kind === 'cut' ? store.ui.sel.id : null;
  const idx = split.cuts.findIndex((c) => c.id === sel);
  const b = store.build;
  const pieces = b.mode === 'split' ? b.pieces : [];
  const reports = new Map((b.reports || []).map((r) => [r.id, r]));

  const auto = async () => {
    setUI({ autoBusy: true });
    try {
      const dj = store.design.split.defaultJoint;
      const r = await request('autosplit', store.design, { jointAllowance: dj === 'thread' || dj === 'hardware' ? 44 : undefined });
      edit((dd) => { dd.split.cuts = r.cuts.map((c) => ({ ...c, id: uid('c'), joints: [{ type: dd.split.defaultJoint || 'auto' }] })); });
      if (!r.limit) setUI({ sel: null });
      toast(r.message);
    } catch (e) { toast(`Auto-split failed: ${e.message}`); }
    setUI({ autoBusy: false });
  };

  const addCut = (axis) => {
    const k = { x: 0, y: 1, z: 2 }[axis];
    const c = { id: uid('c'), axis, pos: box ? Math.round((box.min[k] + box.max[k]) / 2) : 0, joints: [{ type: axis === 'z' ? 'pins' : (d.split.defaultJoint || 'auto') }] };
    if (axis === 'z') {
      const h = d.meta?.handle;
      const s = d.scale || 1;
      c.pos = box ? Math.round((box.min[2] + box.max[2]) / 2) : 0;
      if (h) c.limit = { y: [Math.round(Math.min(h.from[1], h.to[1]) * s), Math.round(Math.max(h.from[1], h.to[1]) * s)] };
      c.joints = [{ type: 'pins', diameter: 3, depth: 5, count: 3 }];
    }
    edit((dd) => { dd.split.cuts.push(c); });
    setUI({ sel: { kind: 'cut', id: c.id } });
  };

  const bad = pieces.filter((p) => p.kind === 'piece' && !p.fit.fits).length;

  return (
    <div>
      <Section title="Your printer">
        <Select label="Printer" value={preset} options={PRINTERS.map((p) => [p[0], p[2] ? `${p[1]} — ${p[2]}×${p[3]}×${p[4]}` : p[1]])}
          onChange={(v) => { const p = PRINTERS.find((x) => x[0] === v); edit((dd) => { dd.split.plate = p[2] ? { x: p[2], y: p[3], z: p[4], name: p[1] } : { ...dd.split.plate, name: 'Custom size' }; }); }} />
        <div class="three">
          <Num label="Bed X" unit="mm" value={plate.x} min={50} step={1} onChange={(v) => edit((dd) => { dd.split.plate = { ...dd.split.plate, x: v, name: 'Custom size' }; }, 'px')} />
          <Num label="Bed Y" unit="mm" value={plate.y} min={50} step={1} onChange={(v) => edit((dd) => { dd.split.plate = { ...dd.split.plate, y: v, name: 'Custom size' }; }, 'py')} />
          <Num label="Height" unit="mm" value={plate.z} min={50} step={1} onChange={(v) => edit((dd) => { dd.split.plate = { ...dd.split.plate, z: v, name: 'Custom size' }; }, 'pz')} />
        </div>
        <Select label="Joint for new cuts" value={split.defaultJoint || 'auto'} options={JOINTS.filter((x) => x[0] !== 'none')}
          hint="Used by auto-split and new cuts. Pick a take-apart joint if the prop has to break down for travel."
          onChange={(v) => edit((dd) => { dd.split.defaultJoint = v; })} />
        <button class="primary wide" disabled={store.ui.autoBusy} onClick={auto}>{store.ui.autoBusy ? 'Working out cuts…' : 'Auto-split to fit my printer'}</button>
        <Help>Pieces are allowed to lie diagonally on the bed. Joints are added automatically; change them per cut below.</Help>
      </Section>
      <Section title="Filaments">
        <Help>Give every part a filament slot (Shape tab). On a multi-toolhead printer like the U1, a piece that holds several filaments prints in one go: the export keeps each filament as its own part in the 3MF.</Help>
        <ul class="fil-list">
          {filamentsOf(d).map((f, i) => (
            <li key={i}>
              <b>{i + 1}</b>
              <input type="color" value={f.color} onInput={(e) => edit((dd) => { dd.filaments = filamentsOf(dd).map((x, k) => (k === i ? { ...x, color: e.target.value } : x)); }, `fc${i}`)} />
              <input type="text" value={f.name} onInput={(e) => edit((dd) => { dd.filaments = filamentsOf(dd).map((x, k) => (k === i ? { ...x, name: e.target.value } : x)); }, `fn${i}`)} />
              <span class="muted small">{d.parts.filter((p) => p.op !== 'subtract' && !p.hidden && (p.filament || 1) === i + 1).length} parts</span>
            </li>
          ))}
        </ul>
        <div class="row-btns">
          <button disabled={filamentsOf(d).length >= 16} onClick={() => edit((dd) => { dd.filaments = [...filamentsOf(dd), { name: `Filament ${filamentsOf(dd).length + 1}`, color: '#8f6bd8' }]; })}>+ Slot</button>
          <button disabled={filamentsOf(d).length <= 1} onClick={() => edit((dd) => { dd.filaments = filamentsOf(dd).slice(0, -1); })}>− Slot</button>
        </div>
        <Check label="Print each filament as its own pieces (single-nozzle printers)" checked={split.byFilament}
          onChange={(v) => edit((dd) => { dd.split.byFilament = v; })}
          hint="Cuts every piece along the filament boundaries so each colour prints separately and is glued afterwards. Leave off on the U1." />
      </Section>
      <Section title="Cuts" right={split.cuts.length ? <button class="link danger" onClick={() => { edit((dd) => { dd.split.cuts = []; }); setUI({ sel: null }); }}>clear all</button> : null}>
        <ul class="list">
          {split.cuts.map((c, i) => (
            <li key={c.id} class={c.id === sel ? 'on' : ''} onClick={() => setUI({ sel: { kind: 'cut', id: c.id } })}>
              <span class="dot cut" />
              <span class="nm">Cut {i + 1}: {c.axis.toUpperCase()} at {Math.round(c.pos)}{c.limit ? ' (partial)' : ''}</span>
              <span class="muted small">{(c.joints || []).map((j) => JOINTS.find((x) => x[0] === j.type)?.[1].split(' ')[0]).join(' + ') || 'glue'}</span>
            </li>
          ))}
          {!split.cuts.length && <li class="empty">No cuts. Use auto-split, or add cuts by hand.</li>}
        </ul>
        <div class="add-grid">
          <span class="muted">Add:</span>
          <button onClick={() => addCut('y')}>Across</button>
          <button onClick={() => addCut('x')}>Lengthwise</button>
          <button onClick={() => addCut('z')} title="Split the handle into front and back halves, e.g. to fit electronics">Clamshell handle</button>
        </div>
      </Section>
      {idx >= 0 && <CutEditor key={split.cuts[idx].id} cut={split.cuts[idx]} idx={idx} box={box} report={reports.get(split.cuts[idx].id)} />}
      <Section title="View">
        <Num label="Explode" value={store.ui.explode} min={0} max={200} step={1} slider unit="mm" onChange={(v) => setUI({ explode: v })} />
        <Select label="Colour by" value={store.ui.colorBy} options={[['part', 'Part colours'], ['filament', 'Filament'], ['piece', 'Piece']]} onChange={(v) => setUI({ colorBy: v })} />
      </Section>
      {pieces.length > 0 && (
        <Section title={`Pieces (${pieces.length})`} right={bad ? <span class="bad">{bad} too big</span> : <span class="good">all fit</span>}>
          <ul class="pieces">
            {pieces.map((p, i) => (
              <li key={i}>
                <span class="dot" style={{ background: pieceColor(i) }} />
                <span class="nm">{p.name}{p.filament ? ` (filament ${p.filament})` : ''}</span>
                <span class="muted small">{Math.round(p.fit.w || 0)}×{Math.round(p.fit.h || 0)}×{Math.round(p.fit.height)} mm · ~{grams(p.volume)} g</span>
                <span class={p.fit.fits ? 'good' : 'bad'}>{p.fit.fits ? '✓' : '✗'}</span>
              </li>
            ))}
          </ul>
          <Help>Weights are rough PLA estimates (3 walls, ~15% infill).</Help>
        </Section>
      )}
    </div>
  );
}
