// Step 2: the weapon's own options (shapes, sizes, details, colours), a
// switch between the creator's model and generated variations, and the
// hand-editing tools for people who want them.
import { store, edit, setUI, filamentsOf, toast } from '../state.js';
import { kitById, recipeFor, designFromRecipe } from '../kits/index.js';
import { rng, newSeed, randomOpts } from '../kits/core.js';
import { loadMeshes } from './stlimport.js';
import { Num, Check, Section, Help, FilamentPick } from './controls.jsx';
import { finishOf } from '../engine/paint.js';
import { ShapePanel } from './ShapePanel.jsx';
import { NextStep } from './NextStep.jsx';

// Small outline preview for a choice: [{poly, hole, color}], y up.
export function OptIcon({ items }) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const it of items) for (const [x, y] of it.poly) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const w = maxX - minX || 1, h = maxY - minY || 1, pad = Math.max(w, h) * 0.08;
  // long thin shapes are drawn lying down
  const rotate = h > w * 2.2;
  const pt = ([x, y]) => (rotate ? `${(y).toFixed(2)},${(x).toFixed(2)}` : `${x.toFixed(2)},${(-y).toFixed(2)}`);
  const vb = rotate ? [minY - pad, minX - pad, h + 2 * pad, w + 2 * pad] : [minX - pad, -maxY - pad, w + 2 * pad, h + 2 * pad];
  return (
    <svg class="opt-icon" viewBox={vb.join(' ')} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {items.map((it, i) => (
        <polygon key={i} points={it.poly.map(pt).join(' ')} class={it.hole ? 'oi-hole' : it.color ? '' : 'oi-fill'} style={it.color && !it.hole ? { fill: it.color } : null} />
      ))}
    </svg>
  );
}

function Option({ opt, value, onChange, fils }) {
  if (opt.type === 'choice') {
    const icons = opt.choices.some((c) => c.icon);
    return (
      <div class="opt">
        <span class="opt-lbl">{opt.label}</span>
        <div class={`opt-chips${icons ? ' icons' : ''}`}>
          {opt.choices.map((c) => (
            <button key={String(c.v)} type="button" class={`opt-chip${c.v === value ? ' on' : ''}`} title={c.label} onClick={() => onChange(c.v)}>
              {c.icon && <OptIcon items={c.icon} />}
              <span>{c.label}</span>
            </button>
          ))}
        </div>
        {opt.hint && <Help>{opt.hint}</Help>}
      </div>
    );
  }
  if (opt.type === 'range') {
    return <Num label={opt.label} value={value} min={opt.min} max={opt.max} step={opt.step} unit={opt.unit} slider hint={opt.hint} onChange={(v) => onChange(Math.min(opt.max, Math.max(opt.min, v)))} />;
  }
  if (opt.type === 'toggle') {
    return (
      <>
        <Check label={opt.label} checked={value} onChange={onChange} />
        {opt.hint && value && <Help>{opt.hint}</Help>}
      </>
    );
  }
  if (opt.type === 'filament') return <FilamentPick label={opt.label} value={value} filaments={fils} onChange={onChange} />;
  return null;
}

// Rebuild the design from a new recipe, keeping what was made by hand.
async function apply(recipe, key, { refit = false } = {}) {
  const preview = designFromRecipe(recipe, store.design);
  if (!preview) return;
  const ids = preview.parts.filter((p) => p.type === 'mesh').map((p) => p.meshRef);
  if (ids.length) await loadMeshes(ids);
  edit((d) => {
    const nd = designFromRecipe(recipe, d);
    for (const k of Object.keys(d)) delete d[k];
    Object.assign(d, nd);
  }, key);
  if (refit) setUI({ refit: true });
}

// Colours printed in filament, or painted (with guide lines cut where
// colours meet). Every design with colour zones or patterns gets this.
export function FinishOptions() {
  const d = store.design;
  const hasColours = d.parts.some((p) => (p.op === 'paint' || p.pattern) && !p.hidden);
  if (!hasColours) return null;
  const f = finishOf(d);
  const set = (patch, key) => edit((dd) => { dd.finish = { ...finishOf(dd), ...patch }; }, key);
  return (
    <Section title="Paint or print the colours">
      <Check label="Print the colours in filament (multi-colour print)" checked={f.colours !== 'paint'} onChange={(v) => set({ colours: v ? 'print' : 'paint' })} />
      <Help>{f.colours === 'paint'
        ? 'Every piece prints in one filament, to be glued, filled, sanded and painted. The 3D view still shows the colours as your paint guide.'
        : 'Each colour prints in its own filament (one toolhead each on the U1). Best for small or scaled-down props whose seams you won\'t paint over.'}</Help>
      <Check label="Paint guide lines (shallow grooves where colours meet)" checked={!!f.lines} onChange={(v) => set({ lines: v })} />
      {f.lines && (
        <>
          <div class="two">
            <Num label="Line width" unit="mm" value={f.lineWidth} min={0.6} max={3} step={0.1} onChange={(v) => set({ lineWidth: Math.min(3, Math.max(0.6, v)) }, 'lw')} />
            <Num label="Depth" unit="mm" value={f.lineDepth} min={0.3} max={1.5} step={0.1} onChange={(v) => set({ lineDepth: Math.min(1.5, Math.max(0.3, v)) }, 'ld')} />
          </div>
          <Help>A groove shows where each colour starts after the print is primed, and gives masking tape or a brush an edge to follow. 1–1.5 mm wide and 0.5–0.8 mm deep survives filler primer and light sanding; sand along the line, not across it. Cutting the lines adds a second or two to each rebuild.</Help>
        </>
      )}
    </Section>
  );
}

function Palette() {
  const d = store.design;
  return (
    <ul class="fil-list">
      {filamentsOf(d).map((f, i) => (
        <li key={i}>
          <b>{i + 1}</b>
          <input type="color" value={f.color} aria-label={`Filament ${i + 1} colour`} onInput={(e) => edit((dd) => { dd.filaments = filamentsOf(dd).map((x, k) => (k === i ? { ...x, color: e.target.value } : x)); }, `fc${i}`)} />
          <input type="text" value={f.name} aria-label={`Filament ${i + 1} name`} onInput={(e) => edit((dd) => { dd.filaments = filamentsOf(dd).map((x, k) => (k === i ? { ...x, name: e.target.value } : x)); }, `fn${i}`)} />
        </li>
      ))}
    </ul>
  );
}

export function CustomizePanel() {
  const d = store.design;
  const r = d.recipe;
  const kit = r && kitById(r.kit);
  const box = store.modelBox;
  const advanced = store.ui.advanced;

  if (!kit) {
    const old = d.meta?.templateId && kitById(d.meta.templateId);
    return (
      <div>
        <Section title="Customize">
          {old ? (
            <>
              <Help>This {old.name} was saved by an older version of Prop Forge, before weapons had options.</Help>
              <button class="primary wide" onClick={async () => {
                const nd = designFromRecipe(recipeFor(old));
                await loadMeshes(nd.parts.filter((p) => p.type === 'mesh').map((p) => p.meshRef));
                edit((dd) => { for (const k of Object.keys(dd)) delete dd[k]; Object.assign(dd, nd); });
                setUI({ refit: true });
              }}>Reload {old.name} with its options</button>
              <Help>This starts it fresh from your model (undo brings the old one back).</Help>
            </>
          ) : (
            <Help>This project isn't one of your weapon templates (it's an STL you opened or a blank project), so it has no weapon options. You can still move, reshape and add parts by hand below, or pick a template in step 1.</Help>
          )}
        </Section>
        <FinishOptions />
        <ShapePanel />
        <NextStep tab="inserts" label="Dowels & electronics" />
      </div>
    );
  }

  const v = kit.variants[r.variant];
  const groups = v.groups();
  const o = r.opts;
  const fils = filamentsOf(d);
  const gen = !!kit.generator;
  const setOpt = (key, value) => apply({ ...r, opts: { ...o, [key]: value } }, `opt-${key}`);
  const another = () => {
    apply(recipeFor(kit, r.variant, { random: true, seed: newSeed(), base: o }), null, { refit: true });
    toast(`New ${kit.type}. Roll again, or fine-tune the options below.`);
  };
  const reroll = (g) => {
    const seed = newSeed();
    const opts = randomOpts([g], rng(seed), o);
    apply({ ...r, opts: v.tidy ? v.tidy(opts, rng(seed + 1)) : opts, seed }, null);
  };

  return (
    <div>
      <Section title={gen ? `${kit.name} (generated)` : kit.name} right={kit.source ? <span class="muted">{kit.source}</span> : null}>
        <Help>
          {gen
            ? <>A {kit.type} generated in the style of your models. Change any option below, or roll a new one.</>
            : <>Your own model. The options below are made for this weapon; pick one and the 3D view updates. For anything else, open "Edit parts by hand" at the bottom.</>}
        </Help>
        {gen && (
          <button class="primary wide dice" onClick={another}>
            <span aria-hidden="true">🎲</span> Generate another {kit.type}
          </button>
        )}
      </Section>
      {groups.filter((g) => !g.show || g.show(o)).map((g) => (
        <Section key={g.title} title={g.title}
          right={gen && g.options.some((x) => x.random !== false && x.type !== 'filament')
            ? <button class="icon-btn" title={`Randomize only "${g.title}"`} onClick={() => reroll(g)}>🎲</button> : null}>
          {g.options.filter((x) => !x.show || x.show(o)).map((opt) => (
            <Option key={opt.key} opt={opt} value={o[opt.key]} fils={fils} onChange={(val) => setOpt(opt.key, val)} />
          ))}
          {g.title === 'Size' && box && (
            <Help>Now {Math.round(box.max[1] - box.min[1])} mm long, {Math.round(box.max[0] - box.min[0])} mm wide, {Math.round(box.max[2] - box.min[2])} mm thick.</Help>
          )}
          {g.title === 'Size' && box && box.max[1] - box.min[1] > 1500 && (
            <Help warn>Over 150 cm. Many conventions cap props at 150 cm (180 cm for staffs and spears) and want big props to come apart. Pick a take-apart joint in step 4.</Help>
          )}
          {g.title === 'Colours' && (
            <>
              <Help>Each part prints in one of your filament slots. Change a slot's colour here; on the U1 each slot is a toolhead.</Help>
              <Palette />
            </>
          )}
        </Section>
      ))}
      <FinishOptions />
      <section class="sec">
        <button class={`disclose${advanced ? ' open' : ''}`} aria-expanded={!!advanced} onClick={() => setUI({ advanced: !advanced, sel: null })}>
          <span aria-hidden="true">{advanced ? '▾' : '▸'}</span> Edit parts by hand <span class="muted">(advanced)</span>
        </button>
        {advanced && (
          <Help>The weapon is made of parts (blade, guard, grip…). Pick one in the list or in 3D to move or reshape it; blades and flat parts open an outline editor with nodes to drag. A part you reshape keeps your shape when you change the options above; parts you add yourself are kept too.</Help>
        )}
      </section>
      {advanced && <ShapePanel embedded />}
      <NextStep tab="inserts" label="Dowels & electronics" />
    </div>
  );
}
