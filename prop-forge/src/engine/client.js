// Main-thread side of the geometry engine. Uses a Web Worker when the
// browser allows it (hosted pages); pages opened straight from disk cannot
// start module workers, so the engine then runs on the main thread.
import EngineWorker from './worker.js?worker&inline';

let nextId = 1;
const pending = new Map();
let worker = null;
let local = null; // same-thread handler (lazy)
let mode = 'starting'; // 'worker' | 'local' | 'starting'
const waiting = [];

function useLocal(reason) {
  if (mode === 'local') return;
  if (reason) console.info(`Prop Forge: running geometry on the main thread (${reason}).`);
  mode = 'local';
  worker?.terminate();
  worker = null;
  const stuck = Array.from(pending.values());
  pending.clear();
  for (const job of stuck.concat(waiting.splice(0))) runLocal(job);
}

async function runLocal(job) {
  if (!local) {
    const { createHandler } = await import('./handler.js');
    local = createHandler(async () => undefined);
  }
  // let the UI paint "Building…" first
  await new Promise((r) => setTimeout(r, 16));
  try { job.resolve(await local.handle(job.msg)); } catch (e) { job.reject(e); }
}

try {
  worker = new EngineWorker();
  worker.onerror = () => useLocal('worker unavailable');
  worker.onmessage = (ev) => {
    const { id, ok, result, error } = ev.data;
    if (id === 0) { mode = 'worker'; for (const j of waiting.splice(0)) send(j); return; }
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    ok ? p.resolve(result) : p.reject(new Error(error));
  };
  worker.postMessage({ id: 0, kind: 'ping' });
  setTimeout(() => { if (mode === 'starting') useLocal('worker did not start'); }, 15000);
} catch {
  useLocal('worker unavailable');
}

function send(job) {
  pending.set(job.msg.id, job);
  worker.postMessage(job.msg);
}

export function request(kind, design, opts) {
  return new Promise((resolve, reject) => {
    const job = { msg: { id: nextId++, kind, design, opts }, resolve, reject };
    if (mode === 'worker') send(job);
    else if (mode === 'local') runLocal(job);
    else waiting.push(job);
  });
}

let busy = false;
let queued = null;

// Preview build: resolves only for the newest request.
export function previewBuild(design, opts, onResult, onError) {
  queued = { design, opts, onResult, onError };
  if (!busy) pump();
}

async function pump() {
  if (!queued) return;
  const job = queued;
  queued = null;
  busy = true;
  try {
    const r = await request('build', job.design, job.opts);
    if (!queued) job.onResult(r);
  } catch (e) {
    if (!queued) job.onError(e);
  } finally {
    busy = false;
    if (queued) pump();
  }
}
