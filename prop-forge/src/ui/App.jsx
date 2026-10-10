import { useEffect, useRef, useState } from 'preact/hooks';
import { useStore, store, edit, setUI, setBuild, setModelBox, undo, redo, canUndo, canRedo, subscribe, filamentsOf, bumpMeshes } from '../state.js';
import { loadMeshes } from './stlimport.js';
import { previewBuild } from '../engine/client.js';
import { Viewport, pieceColor, tagColor } from './Viewport.js';
import { ProfileEditor } from './ProfileEditor.jsx';
import { ForgePanel } from './ForgePanel.jsx';
import { ShapePanel } from './ShapePanel.jsx';
import { InsertsPanel } from './InsertsPanel.jsx';
import { SplitPanel } from './SplitPanel.jsx';
import { ExportPanel } from './ExportPanel.jsx';

const TABS = [
  ['forge', 'Forge', 'Templates'],
  ['shape', 'Shape', 'Edit parts'],
  ['inserts', 'Inserts', 'Dowels & bays'],
  ['split', 'Split', 'Cuts & joints'],
  ['export', 'Export', 'STL files'],
];
const AX = { x: 0, y: 1, z: 2 };

function unionBox(pieces) {
  if (!pieces.length) return null;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of pieces) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], p.bbox.min[i]); max[i] = Math.max(max[i], p.bbox.max[i]); }
  return { min, max };
}

function limitOk(cut, bb) {
  if (!cut.limit) return true;
  for (const a of ['x', 'y', 'z']) {
    const r = cut.limit[a];
    if (!Array.isArray(r)) continue;
    const c = (bb.min[AX[a]] + bb.max[AX[a]]) / 2;
    if (c < r[0] || c > r[1]) return false;
  }
  return true;
}

function explodeOffsets(pieces, cuts, gap) {
  return pieces.map((p) => {
    const off = [0, 0, 0];
    const c = [0, 1, 2].map((i) => (p.bbox.min[i] + p.bbox.max[i]) / 2);
    for (const cut of cuts) {
      const k = AX[cut.axis];
      if (!limitOk(cut, p.bbox)) continue;
      if (Math.abs(c[k] - cut.pos) < 0.5) continue;
      off[k] += (c[k] > cut.pos ? 0.5 : -0.5) * gap;
    }
    if (p.kind === 'lid' && p.side) {
      off[AX[p.side[1]]] += (p.side[0] === '-' ? -1 : 1) * Math.max(gap, 30);
    }
    return off;
  });
}

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (v, s) => (v >> s) & 255;
  const m = (s) => Math.round(ch(pa, s) * (1 - t) + ch(pb, s) * t);
  return `#${((m(16) << 16) | (m(8) << 8) | m(0)).toString(16).padStart(6, '0')}`;
}

export function App() {
  const s = useStore();
  const vpEl = useRef(null);
  const vp = useRef(null);
  const [dark, setDark] = useState(() => { try { return localStorage.getItem('prop-forge:theme') !== 'light'; } catch { return true; } });
  const [editorH, setEditorH] = useState(300);
  const lastSent = useRef('');
  const firstFit = useRef(true);
  const { design, ui, build } = s;
  const splitMode = (ui.tab === 'split' || ui.tab === 'export') && design.split.cuts.length > 0;

  // viewport lifecycle
  useEffect(() => {
    vp.current = new Viewport(vpEl.current, {
      onPick: (hit) => {
        const tab = store.ui.tab;
        if (!hit) { if (tab !== 'split') setUI({ sel: null }); return; }
        if (hit.kind === 'mesh' && hit.tag <= -100) { const f = store.design.features[-100 - hit.tag]; if (f) setUI({ sel: { kind: 'feature', id: f.id }, tab: 'inserts' }); return; }
        if (hit.kind === 'feature') setUI({ sel: { kind: 'feature', id: hit.id }, tab: 'inserts' });
        else if (hit.kind === 'cut') setUI({ sel: { kind: 'cut', id: hit.id } });
        else if (hit.kind === 'mesh' && hit.tag >= 0 && (tab === 'shape' || tab === 'forge')) {
          const part = store.design.parts[hit.tag];
          if (part) setUI({ sel: { kind: 'part', id: part.id }, tab: 'shape', pointSel: null });
        }
      },
      onGizmo: (t, pos) => {
        const sc = store.design.scale || 1;
        const r = (v) => Math.round(v * 2) / 2;
        edit((d) => {
          if (t.kind === 'part') {
            const p = d.parts.find((x) => x.id === t.id); if (p) p.pos = pos.map((v) => r(v / sc));
          } else if (t.kind === 'feature') {
            const f = d.features.find((x) => x.id === t.id);
            if (!f) return;
            if (f.type === 'cavity') f.pos = pos.map((v) => r(v / sc));
            else if (f.type === 'mount') f.pos = [r(pos[0] / sc), r(pos[1] / sc)];
            else {
              const mid = f.from.map((v, i) => (v + f.to[i]) / 2);
              const delta = pos.map((v, i) => v / sc - mid[i]);
              f.from = f.from.map((v, i) => r(v + delta[i]));
              f.to = f.to.map((v, i) => r(v + delta[i]));
            }
          } else if (t.kind === 'cut') {
            const c = d.split.cuts.find((x) => x.id === t.id); if (c) c.pos = r(pos[AX[c.axis]]);
          }
        }, `gizmo-${t.id}`);
      },
    });
    return () => vp.current.dispose();
  }, []);

  useEffect(() => {
    vp.current.setBackground(dark);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem('prop-forge:theme', dark ? 'dark' : 'light'); } catch { /* ignore */ }
  }, [dark]);

  // rebuild whenever the design or mode changes
  useEffect(() => {
    const mode = splitMode ? 'split' : 'model';
    const key = mode + store.meshVersion + JSON.stringify(design);
    if (key === lastSent.current) return;
    lastSent.current = key;
    setUI({ busy: true });
    previewBuild(design, { mode }, (r) => {
      setBuild({ ...r, mode, error: null });
      const box = unionBox(r.pieces.filter((p) => p.kind === 'piece'));
      if (mode === 'model' && box) setModelBox(box);
      if (box && (firstFit.current || store.ui.refit)) {
        vp.current.setGrid(box);
        vp.current.fit(box);
        firstFit.current = false;
        setUI({ refit: false });
      }
      setUI({ busy: false });
    }, (e) => { setBuild({ ...store.build, error: e.message }); setUI({ busy: false }); });
  });

  // push build results into the scene
  const colorOf = (piece, index, tag) => {
    const sel = store.ui.sel;
    const d = store.design;
    if (store.ui.colorBy === 'piece' && store.build.mode === 'split') return tag === -3 ? mix(pieceColor(index), '#000000', 0.25) : pieceColor(index);
    if (store.ui.colorBy === 'filament') {
      const fils = filamentsOf(d);
      if (piece.filament) return fils[piece.filament - 1]?.color || '#999999';
      let f = null;
      if (tag >= 0) f = d.parts[tag]?.filament || 1;
      else if (tag <= -100) f = d.features[-100 - tag]?.filament || 1;
      return f ? fils[f - 1]?.color || '#999999' : mix(fils[0]?.color || '#999999', '#000000', 0.2);
    }
    let c = tag >= 0 ? d.parts[tag]?.color || '#999999' : tag <= -100 ? (d.features[-100 - tag]?.color || '#7a5232') : tagColor(tag);
    if (sel?.kind === 'part' && tag >= 0 && store.design.parts[tag]?.id === sel.id && store.ui.tab === 'shape') c = mix(c, '#ffb347', 0.45);
    return c;
  };
  useEffect(() => {
    const offs = build.mode === 'split' ? explodeOffsets(build.pieces, design.split.cuts, ui.explode) : null;
    vp.current.setPieces(build.pieces, { colorOf, offsets: offs });
  }, [build]);
  useEffect(() => { vp.current.recolor(colorOf); }, [ui.sel, ui.colorBy, ui.tab, design.parts, design.filaments]);
  useEffect(() => {
    if (build.mode === 'split') vp.current.setOffsets(explodeOffsets(build.pieces, design.split.cuts, ui.explode));
  }, [ui.explode]);

  // ghosts, cut planes, gizmo
  useEffect(() => {
    const sc = design.scale || 1;
    const showGhosts = ui.tab === 'inserts';
    const mbox = store.modelBox;
    const ghosts = showGhosts ? design.features.filter((f) => !f.hidden).map((f) => {
      if (f.type === 'channel') return { id: f.id, type: 'rod', a: f.from.map((v) => v * sc), b: f.to.map((v) => v * sc), r: f.diameter / 2 };
      if (f.type === 'mount') {
        const a = ((f.angle || 0) * Math.PI) / 180, h = (f.span || 100) / 2;
        const z = mbox ? (f.side === '+z' ? mbox.max[2] + 4 : mbox.min[2] - 4) : 0;
        const c = [f.pos[0] * sc, f.pos[1] * sc];
        return { id: f.id, type: 'rod', a: [c[0] - h * Math.cos(a), c[1] - h * Math.sin(a), z], b: [c[0] + h * Math.cos(a), c[1] + h * Math.sin(a), z], r: (f.bar || 10) / 2 };
      }
      return { id: f.id, type: 'box', min: f.pos.map((v, i) => v * sc - f.size[i] / 2), max: f.pos.map((v, i) => v * sc + f.size[i] / 2) };
    }) : [];
    vp.current.setGhosts(ghosts, ui.sel?.id);
    const box = store.modelBox;
    const cutsVis = (ui.tab === 'split' && box) ? design.split.cuts.map((c) => {
      const b = { min: box.min.slice(), max: box.max.slice() };
      if (c.limit) for (const a of ['x', 'y', 'z']) if (Array.isArray(c.limit[a])) { b.min[AX[a]] = Math.max(b.min[AX[a]], c.limit[a][0]); b.max[AX[a]] = Math.min(b.max[AX[a]], c.limit[a][1]); }
      return { id: c.id, axis: c.axis, pos: c.pos, box: b };
    }) : [];
    const allPlanes = ui.explode < 1 || build.mode !== 'split';
    vp.current.setCuts(allPlanes ? cutsVis : cutsVis.filter((c) => c.id === ui.sel?.id), ui.sel?.id);
    // gizmo
    let target = null, pos = null;
    const sel = ui.sel;
    if (sel?.kind === 'part' && ui.tab === 'shape') {
      const p = design.parts.find((x) => x.id === sel.id);
      if (p) { target = { kind: 'part', id: p.id }; pos = p.pos.map((v) => v * sc); }
    } else if (sel?.kind === 'feature' && ui.tab === 'inserts') {
      const f = design.features.find((x) => x.id === sel.id);
      if (f) {
        target = { kind: 'feature', id: f.id };
        if (f.type === 'mount') {
          const z = store.modelBox ? (f.side === '+z' ? store.modelBox.max[2] + 4 : store.modelBox.min[2] - 4) : 0;
          pos = [f.pos[0] * sc, f.pos[1] * sc, z];
          target.axis = 'xy';
        } else pos = (f.type === 'cavity' ? f.pos : f.from.map((v, i) => (v + f.to[i]) / 2)).map((v) => v * sc);
      }
    } else if (sel?.kind === 'cut' && ui.tab === 'split' && box) {
      const c = design.split.cuts.find((x) => x.id === sel.id);
      if (c) { target = { kind: 'cut', id: c.id, axis: c.axis }; pos = box.min.map((v, i) => (v + box.max[i]) / 2); pos[AX[c.axis]] = c.pos; }
    }
    vp.current.setGizmo(target, pos, ui.gizmo);
  });

  // imported meshes live in IndexedDB; load the ones this design uses
  const meshIds = design.parts.filter((p) => p.type === 'mesh').map((p) => p.meshRef).join(',');
  useEffect(() => {
    if (meshIds) loadMeshes(meshIds.split(',')).then(() => bumpMeshes());
  }, [meshIds]);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if (e.key === 'Escape') setUI({ sel: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selPart = ui.sel?.kind === 'part' ? design.parts.find((p) => p.id === ui.sel.id) : null;
  const selIdx = selPart ? design.parts.indexOf(selPart) : -1;
  const showEditor = ui.tab === 'shape' && selPart && (selPart.type === 'profile' || selPart.type === 'lathe') && ui.editorOpen;

  const startResize = (e) => {
    const y0 = e.clientY, h0 = editorH;
    const move = (ev) => setEditorH(Math.max(160, Math.min(window.innerHeight - 200, h0 + (y0 - ev.clientY))));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const warnings = build.error ? [build.error] : build.warnings || [];

  return (
    <div class="app">
      <header class="top">
        <div class="brand"><Logo /> Prop Forge</div>
        <div class="title">{design.name}</div>
        <div class="top-tools">
          <button class="icon" title="Undo (Ctrl+Z)" disabled={!canUndo()} onClick={undo}>↶</button>
          <button class="icon" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo()} onClick={redo}>↷</button>
          <button class="icon" title="Light / dark" onClick={() => setDark(!dark)}>{dark ? '☀' : '☾'}</button>
        </div>
      </header>
      <div class="main">
        <aside class="side">
          <nav class="tabs">
            {TABS.map(([id, label, sub], i) => (
              <button key={id} class={ui.tab === id ? 'on' : ''} onClick={() => setUI({ tab: id })}>
                <b>{i + 1}. {label}</b><small>{sub}</small>
              </button>
            ))}
          </nav>
          <div class="panel">
            {ui.tab === 'forge' && <ForgePanel />}
            {ui.tab === 'shape' && <ShapePanel />}
            {ui.tab === 'inserts' && <InsertsPanel />}
            {ui.tab === 'split' && <SplitPanel />}
            {ui.tab === 'export' && <ExportPanel />}
          </div>
        </aside>
        <section class="stage">
          <div class="viewport" ref={vpEl}>
            <div class="vp-tools">
              <button onClick={() => vp.current.fit(unionBox(build.pieces) || store.modelBox, 'front')}>Front</button>
              <button onClick={() => vp.current.fit(unionBox(build.pieces) || store.modelBox, 'side')}>Side</button>
              <button onClick={() => vp.current.fit(unionBox(build.pieces) || store.modelBox, 'top')}>Top</button>
              <button onClick={() => vp.current.fit(unionBox(build.pieces) || store.modelBox, 'back')}>Back</button>
              <label class="chk"><input type="checkbox" checked={ui.gizmo} onChange={(e) => setUI({ gizmo: e.target.checked })} /> Move arrows</label>
              {selPart && (selPart.type === 'profile' || selPart.type === 'lathe') && ui.tab === 'shape' && (
                <label class="chk"><input type="checkbox" checked={ui.editorOpen} onChange={(e) => setUI({ editorOpen: e.target.checked })} /> Outline editor</label>
              )}
            </div>
            <div class={`status${ui.busy ? ' busy' : ''}`}>{ui.busy ? 'Building…' : `${build.pieces.length} ${build.pieces.length === 1 ? 'piece' : 'pieces'} · ${build.ms || 0} ms`}</div>
            {warnings.length > 0 && <div class="warn-box">{warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}</div>}
            {ui.tab === 'inserts' && <div class="legend"><span class="sw ins" /> inserts (cut out of the model)</div>}
          </div>
          {showEditor && (
            <div class="editor" style={{ height: `${editorH}px` }}>
              <div class="resizer" onPointerDown={startResize} />
              <ProfileEditor part={selPart} parts={design.parts} dark={dark}
                pointSel={ui.pointSel} setPointSel={(i) => setUI({ pointSel: i })}
                onPoints={(pts, key) => edit((d) => { d.parts[selIdx].points = pts; }, key)}
                onPatch={(patch) => edit((d) => { Object.assign(d.parts[selIdx], patch); })} />
            </div>
          )}
        </section>
      </div>
      {ui.toast && <div class="toast">{ui.toast}</div>}
    </div>
  );
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.5 2 22 2 22 9.5 10 21.5 6.5 21.5 2.5 17.5 2.5 14z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
      <path d="M5 13l6 6M4 20l3-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    </svg>
  );
}
