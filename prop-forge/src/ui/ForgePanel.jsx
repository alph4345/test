import { useMemo, useState } from 'preact/hooks';
import { TEMPLATES, CATEGORIES } from '../templates/index.js';
import { store, replaceDesign, libraryList, librarySave, libraryDelete, toast, setUI } from '../state.js';
import { designSilhouettes } from './silhouette.js';
import { download } from './zip.js';
import { packMeshes, unpackMeshes, loadMeshes } from './stlimport.js';
import { Section, Help } from './controls.jsx';

function Thumb({ design, thumb }) {
  const sils = useMemo(() => (thumb && thumb.length ? thumb : designSilhouettes(design)), [design, thumb]);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of sils) for (const [x, y] of s.poly) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  if (!sils.length) return <svg class="thumb" />;
  const w = maxX - minX, h = maxY - minY;
  // long weapons are drawn lying down, tip to the right
  const rotate = h > w * 1.3;
  const pad = Math.max(w, h) * 0.06;
  const vb = rotate ? [minY - pad, -maxX - pad, h + 2 * pad, w + 2 * pad] : [minX - pad, -maxY - pad, w + 2 * pad, h + 2 * pad];
  const pt = ([x, y]) => (rotate ? `${y},${-x}` : `${x},${-y}`);
  return (
    <svg class="thumb" viewBox={vb.join(' ')} preserveAspectRatio="xMidYMid meet">
      {sils.filter((s) => !s.sub).map((s, i) => <polygon key={i} points={s.poly.map(pt).join(' ')} fill={s.color} />)}
      {sils.filter((s) => s.sub).map((s, i) => <polygon key={`h${i}`} points={s.poly.map(pt).join(' ')} class="thumb-hole" />)}
    </svg>
  );
}

export function ForgePanel() {
  const [cat, setCat] = useState('All');
  const [q, setQ] = useState('');
  const built = useMemo(() => TEMPLATES.map((t) => ({ t, d: t.build() })), []);
  const shown = built.filter(({ t }) => (cat === 'All' || t.category === cat)
    && (!q || `${t.name} ${t.source} ${t.category}`.toLowerCase().includes(q.toLowerCase())));
  const lib = libraryList();

  const pick = async (t) => {
    const d = t.build();
    d.meta = { ...(d.meta || {}), templateId: t.id };
    const ids = d.parts.filter((p) => p.type === 'mesh').map((p) => p.meshRef);
    if (ids.length) await loadMeshes(ids);
    replaceDesign(d);
    setUI({ tab: 'shape', refit: true });
    toast(`Loaded ${t.name}. Edit the shape, add inserts, then split it for your printer.`);
  };

  const importFile = (file) => {
    const r = new FileReader();
    r.onload = async () => {
      try {
        const d = JSON.parse(r.result);
        await unpackMeshes(d.meshes);
        delete d.meshes;
        if (!Array.isArray(d.parts)) throw new Error('not a Prop Forge project');
        d.features ||= []; d.split ||= { plate: { x: 256, y: 256, z: 256 }, cuts: [] };
        replaceDesign(d);
        setUI({ tab: 'shape', refit: true });
        toast(`Opened ${d.name}`);
      } catch (e) { toast(`Could not open file: ${e.message}`); }
    };
    r.readAsText(file);
  };

  return (
    <div>
      <Section title="Pick a template">
        <Help>Start from a template, then change anything you like. Everything is in real-world millimetres.</Help>
        <input class="search" type="search" placeholder="Search weapons…" value={q} onInput={(e) => setQ(e.target.value)} />
        <div class="chips">
          {CATEGORIES.map((c) => <button key={c} class={`chip${c === cat ? ' on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
        </div>
        <div class="cards">
          {shown.map(({ t, d }) => (
            <button key={t.id} class={`card${store.design.meta?.templateId === t.id ? ' current' : ''}`} onClick={() => pick(t)}>
              <Thumb design={d} thumb={t.thumb} />
              <span class="card-name">{t.name}</span>
              <span class="card-src">{t.source}</span>
              <span class="card-blurb">{t.blurb}</span>
              {t.credit && <span class="card-credit">{t.credit}</span>}
            </button>
          ))}
        </div>
      </Section>
      <Section title="My designs">
        <Help>Your work is autosaved in this browser. Save named copies here, or export a project file to back it up.</Help>
        <div class="row-btns">
          <button class="primary" onClick={() => { librarySave(store.design); toast(`Saved "${store.design.name}"`); }}>Save current design</button>
          <button onClick={() => download(new Blob([JSON.stringify({ ...store.design, meshes: packMeshes(store.design) }, null, 1)], { type: 'application/json' }), `${store.design.name || 'prop'}.propforge.json`)}>Export file</button>
          <label class="btn">Open file<input type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files[0] && importFile(e.target.files[0])} /></label>
        </div>
        {lib.length > 0 && (
          <ul class="lib">
            {lib.map((x) => (
              <li key={x.name}>
                <button class="link" onClick={() => { replaceDesign(structuredClone(x.design)); setUI({ tab: 'shape', refit: true }); }}>{x.name}</button>
                <span class="muted">{new Date(x.savedAt).toLocaleDateString()}</span>
                <button class="icon" title="Delete" onClick={() => libraryDelete(x.name)}>✕</button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
