// Global app store: the design (undoable, autosaved) plus UI state.
import { useEffect, useState } from 'preact/hooks';
import { findTemplate } from './templates/index.js';
import { defaultFilaments } from './templates/helpers.js';

export const filamentsOf = (d) => (d.filaments && d.filaments.length ? d.filaments : defaultFilaments());

const SAVE_KEY = 'prop-forge:current';
const LIB_KEY = 'prop-forge:library';

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
}

const initialDesign = load(SAVE_KEY, null) || findTemplate('buster-sword').build();

export const store = {
  design: initialDesign,
  ui: {
    tab: 'forge',
    sel: null, // { kind: 'part' | 'feature' | 'cut', id }
    explode: 40,
    colorBy: 'part',
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
  save(SAVE_KEY, d);
  emit();
}

export function replaceDesign(d) {
  past.push(JSON.stringify(store.design));
  future.length = 0;
  store.design = d;
  store.ui.sel = null;
  store.ui.pointSel = null;
  save(SAVE_KEY, d);
  emit();
}

export function undo() {
  if (!past.length) return;
  future.push(JSON.stringify(store.design));
  store.design = JSON.parse(past.pop());
  lastCommitKey = null;
  save(SAVE_KEY, store.design);
  emit();
}

export function redo() {
  if (!future.length) return;
  past.push(JSON.stringify(store.design));
  store.design = JSON.parse(future.pop());
  lastCommitKey = null;
  save(SAVE_KEY, store.design);
  emit();
}

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

// ---- library of saved designs (browser storage) ----
export function libraryList() { return load(LIB_KEY, []); }
export function librarySave(design) {
  const lib = libraryList().filter((x) => x.name !== design.name);
  lib.unshift({ name: design.name, savedAt: Date.now(), design });
  save(LIB_KEY, lib.slice(0, 60));
  emit();
}
export function libraryDelete(name) {
  save(LIB_KEY, libraryList().filter((x) => x.name !== name));
  emit();
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
