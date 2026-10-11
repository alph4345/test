import { useMemo, useState } from 'preact/hooks';
import { TEMPLATES, CATEGORIES, WISHLIST, REFERENCE_HOWTO } from '../templates/index.js';
import { importSTL } from './importer.js';
import { store, openProject, toast, setUI, blankDesign, projectState, draftList, jobList, jobDesign, openDraft, openJob, saveCurrent, saveDraft, discardDraft, deleteJob } from '../state.js';
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

const when = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  return new Date(t).toLocaleDateString();
};

async function withMeshes(d) {
  const ids = (d?.parts || []).filter((p) => p.type === 'mesh').map((p) => p.meshRef);
  if (ids.length) await loadMeshes(ids);
}

export async function openAndGo(fn) {
  const r = fn();
  await withMeshes(store.design);
  setUI({ tab: 'custom', refit: true, sel: null });
  return r;
}

// Save the open project, asking for a name the first time.
export function saveWithName({ asNew = false } = {}) {
  const cur = projectState();
  let name = store.design.name;
  if (!cur.jobId || asNew) {
    name = window.prompt(asNew ? 'Save a copy as:' : 'Save this job as:', asNew ? `${name} (copy)` : name);
    if (name == null) return null;
    name = name.trim() || store.design.name;
  }
  const job = saveCurrent({ asNew, name });
  if (job) toast(`Saved "${job.design.name}" in Saved jobs`);
  return job;
}

// Drafts (unfinished work, autosaved) and saved jobs.
function YourWork({ drafts, jobs, cur, importFile }) {
  const jobName = (id) => jobs.find((j) => j.id === id)?.name;
  const exportFile = () => download(new Blob([JSON.stringify({ ...store.design, meshes: packMeshes(store.design) }, null, 1)], { type: 'application/json' }), `${store.design.name || 'prop'}.propforge.json`);
  return (
    <>
      <Section title={`Drafts${drafts.length ? ` (${drafts.length})` : ''}`}>
        <Help>Work you haven't saved yet. Every change autosaves here, so you can leave a job half done and come back to it. Save it to keep it in Saved jobs, or discard it.</Help>
        {drafts.length ? (
          <ul class="lib">
            {drafts.map((x) => {
              const open = x.id === cur.draftId;
              return (
                <li key={x.id} class={open ? 'on' : ''}>
                  <div class="lib-main">
                    {open ? <b>{x.name}</b> : <button class="link" onClick={() => openAndGo(() => openDraft(x.id))}>{x.name}</button>}
                    <span class="muted small">{open ? 'open now · ' : ''}{x.jobId && jobName(x.jobId) ? `changes to "${jobName(x.jobId)}" · ` : ''}{when(x.updatedAt)}</span>
                  </div>
                  <button title="Save as a job" onClick={() => {
                    if (open) { saveWithName(); return; }
                    const j = saveDraft(x.id);
                    if (j) toast(`Saved "${j.design.name}" in Saved jobs`);
                  }}>Save</button>
                  <button class="danger-btn" title="Throw this draft away" onClick={() => {
                    if (!window.confirm(`Discard the draft "${x.name}"?${x.jobId ? ' The saved job stays as it was.' : ' This can\'t be undone.'}`)) return;
                    discardDraft(x.id, blankDesign);
                    if (open) setUI({ refit: true, sel: null });
                  }}>Discard</button>
                </li>
              );
            })}
          </ul>
        ) : <Help>No drafts: everything is saved.</Help>}
      </Section>
      <Section title={`Saved jobs${jobs.length ? ` (${jobs.length})` : ''}`}>
        <div class="row-btns">
          <button class="primary" onClick={() => saveWithName()}>{cur.jobId ? 'Save changes' : 'Save current as a job'}</button>
          {cur.jobId && <button onClick={() => saveWithName({ asNew: true })}>Save a copy</button>}
        </div>
        {jobs.length > 0 && (
          <ul class="lib">
            {jobs.map((x) => {
              const open = x.id === cur.jobId;
              const hasDraft = drafts.some((dr) => dr.jobId === x.id);
              return (
                <li key={x.id} class={open ? 'on' : ''}>
                  <div class="lib-main">
                    <button class="link" onClick={() => openAndGo(() => {
                      const r = openJob(x.id);
                      if (r === 'draft') toast('Opened with your unsaved changes (its draft). Discard the draft to go back to the saved version.', 6000);
                    })}>{x.name}</button>
                    <span class="muted small">{open ? 'open now · ' : ''}saved {when(x.savedAt)}{hasDraft ? ' · has unsaved changes in Drafts' : ''}</span>
                  </div>
                  <button title="Download this job as a project file" onClick={() => {
                    const d = jobDesign(x.id);
                    if (d) download(new Blob([JSON.stringify({ ...d, meshes: packMeshes(d) }, null, 1)], { type: 'application/json' }), `${x.name || 'prop'}.propforge.json`);
                  }}>File</button>
                  <button class="icon" title="Delete this job" onClick={() => { if (window.confirm(`Delete the saved job "${x.name}"?`)) deleteJob(x.id); }}>✕</button>
                </li>
              );
            })}
          </ul>
        )}
        <Help>Jobs and drafts live in this browser. To move a job to another computer or keep a backup, save it as a file.</Help>
        <div class="row-btns">
          <button onClick={exportFile}>Save open project to a file</button>
          <label class="btn">Open a project file<input type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f); }} /></label>
        </div>
      </Section>
    </>
  );
}

export function ForgePanel() {
  const [cat, setCat] = useState('All');
  const [q, setQ] = useState('');
  const legendary = useMemo(() => TEMPLATES.filter((t) => !t.generator).map((t) => ({ t, thumb: t.thumb ? t.thumb() : null })), []);
  // generator tiles show their default (unrandomised) weapon
  const generators = useMemo(() => TEMPLATES.filter((t) => t.generator).map((t) => ({ t, d: t.build({ random: false }) })), []);
  const shown = legendary.filter(({ t }) => (cat === 'All' || t.category === cat)
    && (!q || `${t.name} ${t.source} ${t.category}`.toLowerCase().includes(q.toLowerCase())));
  const drafts = draftList();
  const jobs = jobList();
  const cur = projectState();

  const pick = async (t) => {
    const d = t.build();
    const ids = d.parts.filter((p) => p.type === 'mesh').map((p) => p.meshRef);
    if (ids.length) await loadMeshes(ids);
    openProject(d);
    setUI({ tab: 'custom', refit: true, sel: null, advanced: false });
    toast(t.generator
      ? `New ${t.kit.type} generated. Change its options, or press "Generate another".`
      : `Loaded ${t.name}. Pick options for it here, then follow the steps along the top.`);
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
        openProject(d);
        setUI({ tab: 'custom', refit: true, sel: null });
        toast(`Opened ${d.name}`);
      } catch (e) { toast(`Could not open file: ${e.message}`); }
    };
    r.readAsText(file);
  };

  return (
    <div>
      <Section title="How it works">
        <ol class="steps">
          <li><b>Pick</b> one of your models below.</li>
          <li><b>Customize</b> it with options made for that weapon, or press 🎲 to generate a new one in the same style.</li>
          <li><b>Inserts</b>: channels for dowels and steel rods, bays for electronics.</li>
          <li><b>Split</b> it into pieces that fit your printer, with joints that lock together.</li>
          <li><b>Export</b> the files for your slicer.</li>
        </ol>
      </Section>
      <YourWork drafts={drafts} jobs={jobs} cur={cur} importFile={importFile} />
      <Section title="Legendary weapons">
        <Help>Named weapons from your own models, in real-world millimetres. Each has options made for it, and every part can still be edited by hand.</Help>
        <input class="search" type="search" placeholder="Search weapons…" value={q} onInput={(e) => setQ(e.target.value)} />
        <div class="chips">
          {CATEGORIES.map((c) => <button key={c} class={`chip${c === cat ? ' on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
        </div>
        <div class="cards">
          {shown.map(({ t, thumb }) => (
            <button key={t.id} class={`card${store.design.meta?.templateId === t.id ? ' current' : ''}`} onClick={() => pick(t)}>
              <Thumb thumb={thumb} />
              <span class="card-name">{t.name}</span>
              <span class="card-src">{t.source}</span>
              <span class="card-blurb">{t.blurb}</span>
              {t.credit && <span class="card-credit">{t.credit}</span>}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Generate a weapon">
        <Help>Rolls a new weapon of a general type, drawn in the style of your models. Press again for another one; every option can be changed afterwards.</Help>
        <div class="cards gen">
          {generators.map(({ t, d }) => (
            <button key={t.id} class={`card${store.design.meta?.templateId === t.id ? ' current' : ''}`} onClick={() => pick(t)}>
              <Thumb design={d} />
              <span class="card-name"><span aria-hidden="true">🎲</span> New {t.kit.type}</span>
              <span class="card-blurb">{t.blurb}</span>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Start something new">
        <div class="row-btns">
          <label class="btn primary-btn" title="Open an STL as its own project (it is laid flat and simplified if very dense)">
            Open an STL…<input type="file" accept=".stl,model/stl" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importSTL(f, { newProject: true }).catch((err) => toast(`Import failed: ${err.message}`)); }} />
          </label>
          <button onClick={() => { openProject(blankDesign()); setUI({ tab: 'custom', refit: true, sel: null }); }}>Blank project</button>
        </div>
      </Section>
      <Section title={`Waiting for a reference (${WISHLIST.length})`}>
        <Help>{REFERENCE_HOWTO}</Help>
        <ul class="wish">
          {WISHLIST.map((w) => (
            <li key={w.name}><b>{w.name}</b> <span class="muted">{w.source}{w.note ? ` · ${w.note}` : ''}</span></li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
