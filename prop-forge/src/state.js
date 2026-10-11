// Global app store: the design (undoable, autosaved) plus UI state.
import { useEffect, useState } from 'preact/hooks';
import { findTemplate } from './templates/index.js';
import { defaultFilaments, design as newDesign } from './templates/helpers.js';

export const blankDesign = () => newDesign('New prop', []);

export const filamentsOf = (d) => (d.filaments && d.filaments.length ? d.filaments : defaultFilaments());

const SAVE_KEY = 'prop-forge:current';
const LIB_KEY = 'prop-forge:library'; // saved designs from older versions
const DRAFTS_KEY = 'prop-forge:drafts'; // [{id, name, updatedAt, jobId}]
const JOBS_KEY = 'prop-forge:jobs'; // [{id, name, savedAt}]
const SESSION_KEY = 'prop-forge:session'; // {draftId, jobId} of the open project
const draftKey = (id) => `prop-forge:draft:${id}`;
const jobKey = (id) => `prop-forge:job:${id}`;

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
let warnedFull = false;
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch {
    if (!warnedFull) { warnedFull = true; setTimeout(() => toast('Browser storage is full: save the project to a file (Export step or Pick → Saved jobs), or discard old drafts.', 8000), 0); }
    return false;
  }
}
function drop(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } }
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// designs saved by older versions become saved jobs
(function migrate() {
  const old = load(LIB_KEY, null);
  if (!Array.isArray(old)) return;
  const jobs = load(JOBS_KEY, []);
  for (const x of old) {
    const id = newId();
    if (save(jobKey(id), x.design)) jobs.push({ id, name: x.name, savedAt: x.savedAt || Date.now() });
  }
  save(JOBS_KEY, jobs);
  drop(LIB_KEY);
})();

let session = load(SESSION_KEY, { draftId: null, jobId: null });
const initialDesign = (session.draftId && load(draftKey(session.draftId), null)) || load(SAVE_KEY, null)
  || (findTemplate('buster-sword-model') || { build: () => blankDesign() }).build();

export const store = {
  design: initialDesign,
  ui: {
    tab: 'forge',
    sel: null, // { kind: 'part' | 'feature' | 'cut', id }
    explode: 40,
    colorBy: 'filament',
    advanced: false, // "Edit parts by hand" open in the Customize step
    gizmo: true,
    editorOpen: true,
    pointSel: null,
    busy: false,
    autoBusy: false,
    toast: null,
  },
  build: { pieces: [], warnings: [], reports: [], ms: 0, error: null, mode: 'model' },
  modelBox: null,
  meshVersion: 0,
};

export function bumpMeshes() { store.meshVersion++; emit(); }

const subs = new Set();
const past = [];
const future = [];
let lastCommitKey = null;
let lastCommitAt = 0;

function emit() { subs.forEach((f) => f()); }

export function useStore() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const f = () => setTick((t) => t + 1);
    subs.add(f);
    return () => subs.delete(f);
  }, []);
  return store;
}

export function subscribe(f) { subs.add(f); return () => subs.delete(f); }

// Change the design. `key` groups rapid edits of the same control into one
// undo step (e.g. dragging a slider).
export function edit(fn, key = null) {
  const now = Date.now();
  if (!(key && key === lastCommitKey && now - lastCommitAt < 1200)) {
    past.push(JSON.stringify(store.design));
    if (past.length > 120) past.shift();
    future.length = 0;
  }
  lastCommitKey = key;
  lastCommitAt = now;
  const d = structuredClone(store.design);
  fn(d);
  store.design = d;
  autosave();
  emit();
}

// ---- drafts and saved jobs ----
// Every project you change is a draft until you save it as a job. Drafts
// keep autosaving, so unfinished work waits in the Drafts list; saving moves
// it to Saved jobs, discarding throws it away.
function autosave() {
  save(SAVE_KEY, store.design);
  if (!session.draftId) { session = { ...session, draftId: newId() }; save(SESSION_KEY, session); }
  save(draftKey(session.draftId), store.design);
  const list = load(DRAFTS_KEY, []).filter((x) => x.id !== session.draftId);
  list.unshift({ id: session.draftId, name: store.design.name || 'Untitled', updatedAt: Date.now(), jobId: session.jobId || null });
  save(DRAFTS_KEY, list);
}

export const projectState = () => ({ ...session, unsaved: !!session.draftId });
export const draftList = () => load(DRAFTS_KEY, []).sort((a, b) => b.updatedAt - a.updatedAt);
export const jobList = () => load(JOBS_KEY, []).sort((a, b) => b.savedAt - a.savedAt);
export const jobDesign = (id) => load(jobKey(id), null);

// Switch to another project (the one that was open stays in Drafts if it
// has unsaved changes).
export function openProject(d, { draftId = null, jobId = null } = {}) {
  past.length = 0; future.length = 0; lastCommitKey = null;
  store.design = d;
  store.ui.sel = null;
  store.ui.pointSel = null;
  session = { draftId, jobId };
  save(SESSION_KEY, session);
  save(SAVE_KEY, d);
  emit();
}

export function openDraft(id) {
  const meta = load(DRAFTS_KEY, []).find((x) => x.id === id);
  const d = load(draftKey(id), null);
  if (!meta || !d) return false;
  openProject(d, { draftId: id, jobId: meta.jobId || null });
  return true;
}

// A job with unsaved changes opens at its draft.
export function openJob(id) {
  const draft = load(DRAFTS_KEY, []).find((x) => x.jobId === id);
  if (draft && openDraft(draft.id)) return 'draft';
  const d = load(jobKey(id), null);
  if (!d) return false;
  openProject(d, { jobId: id });
  return 'job';
}

function writeJob(design, { jobId = null, name } = {}) {
  const id = jobId || newId();
  const d = { ...design, name: name || design.name || 'Untitled' };
  if (!save(jobKey(id), d)) return null;
  const jobs = load(JOBS_KEY, []).filter((x) => x.id !== id);
  jobs.unshift({ id, name: d.name, savedAt: Date.now() });
  save(JOBS_KEY, jobs);
  return { id, design: d };
}

function forgetDraft(id) {
  drop(draftKey(id));
  save(DRAFTS_KEY, load(DRAFTS_KEY, []).filter((x) => x.id !== id));
}

// Save the open project as a job (over its own job, or as a new one).
export function saveCurrent({ asNew = false, name } = {}) {
  const job = writeJob(store.design, { jobId: asNew ? null : session.jobId, name });
  if (!job) return null;
  if (session.draftId) forgetDraft(session.draftId);
  store.design = job.design;
  session = { draftId: null, jobId: job.id };
  save(SESSION_KEY, session);
  save(SAVE_KEY, store.design);
  emit();
  return job;
}

// Save a draft that isn't open.
export function saveDraft(id) {
  if (id === session.draftId) return saveCurrent();
  const meta = load(DRAFTS_KEY, []).find((x) => x.id === id);
  const d = load(draftKey(id), null);
  if (!meta || !d) return null;
  const job = writeJob(d, { jobId: meta.jobId });
  if (job) { forgetDraft(id); emit(); }
  return job;
}

// Throw a draft away. The open one goes back to its saved job, or to `fallback`.
export function discardDraft(id, fallback) {
  forgetDraft(id);
  if (id === session.draftId) {
    const saved = session.jobId && load(jobKey(session.jobId), null);
    if (saved) openProject(saved, { jobId: session.jobId });
    else openProject(fallback());
  } else emit();
}

export function deleteJob(id) {
  drop(jobKey(id));
  save(JOBS_KEY, load(JOBS_KEY, []).filter((x) => x.id !== id));
  // its draft (if any) becomes plain unsaved work
  save(DRAFTS_KEY, load(DRAFTS_KEY, []).map((x) => (x.jobId === id ? { ...x, jobId: null } : x)));
  if (session.jobId === id) { session = { ...session, jobId: null }; save(SESSION_KEY, session); autosave(); }
  emit();
}

export function undo() {
  if (!past.length) return;
  future.push(JSON.stringify(store.design));
  store.design = JSON.parse(past.pop());
  lastCommitKey = null;
  autosave();
  emit();
}

export function redo() {
  if (!future.length) return;
  past.push(JSON.stringify(store.design));
  store.design = JSON.parse(future.pop());
  lastCommitKey = null;
  autosave();
  emit();
}

// Kit parts changed by hand are kept as they are when an option changes.
export function markEdited(p) { if (p && p.gen) p.edited = 1; }

export const canUndo = () => past.length > 0;
export const canRedo = () => future.length > 0;

export function setUI(patch) {
  Object.assign(store.ui, typeof patch === 'function' ? patch(store.ui) : patch);
  emit();
}

export function setBuild(b) {
  store.build = b;
  emit();
}

export function setModelBox(b) { store.modelBox = b; }

export function toast(msg, ms = 3500) {
  setUI({ toast: msg });
  clearTimeout(toast.t);
  toast.t = setTimeout(() => setUI({ toast: null }), ms);
}


export const selected = () => {
  const s = store.ui.sel;
  if (!s) return null;
  const d = store.design;
  if (s.kind === 'part') return d.parts.find((p) => p.id === s.id) || null;
  if (s.kind === 'feature') return d.features.find((p) => p.id === s.id) || null;
  if (s.kind === 'cut') return d.split.cuts.find((p) => p.id === s.id) || null;
  return null;
};
