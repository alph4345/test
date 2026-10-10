import { useState } from 'preact/hooks';
import { store, toast, setUI, filamentsOf } from '../state.js';
import { build3MF } from './threemf.js';
import { request } from '../engine/client.js';
import { makeZip, download } from './zip.js';
import { packMeshes } from './stlimport.js';
import { Section, Help } from './controls.jsx';

const safe = (s) => (s || 'prop').replace(/[^a-z0-9-_]+/gi, '_').replace(/^_|_$/g, '');
const inch = (mm) => {
  const v = mm / 25.4;
  const known = { 0.125: '1/8"', 0.25: '1/4"', 0.3125: '5/16"', 0.375: '3/8"', 0.5: '1/2"', 0.625: '5/8"', 0.75: '3/4"', 1: '1"' };
  const hit = Object.keys(known).find((k) => Math.abs(+k - v) < 0.01);
  return hit ? known[hit] : null;
};

export function shoppingList(design, reports) {
  const s = design.scale || 1;
  const items = [];
  for (const f of design.features || []) {
    if (f.hidden) continue;
    if (f.type === 'channel' && f.clearance > 0) {
      const len = Math.hypot(...f.to.map((v, i) => v - f.from[i])) * s;
      const i = inch(f.diameter);
      items.push(`${f.name}: ${i ? `${i} (${f.diameter} mm)` : `${f.diameter} mm`} dowel or rod, cut to about ${Math.round(len - 2)} mm (${(len / 25.4).toFixed(1)} in)`);
    }
    if (f.type === 'cavity' && f.lid?.enabled && f.lid.magnets?.enabled) {
      items.push(`${f.name}: 8 disc magnets ${f.lid.magnets.diameter - 0.2} × ${f.lid.magnets.depth - 0.2} mm (4 in the body, 4 in the lid — check polarity!)`);
    }
  }
  const pins = new Map();
  const other = new Map();
  for (const r of reports || []) for (const b of r.bom || []) {
    if (b.text) { other.set(b.text, (other.get(b.text) || 0) + b.qty); continue; }
    const key = `${b.d}|${b.length}`;
    pins.set(key, (pins.get(key) || 0) + b.qty);
  }
  for (const [text, qty] of other) items.push(`${qty} × ${text}`);
  for (const [key, qty] of pins) {
    const [d, len] = key.split('|');
    const i = inch(+d);
    items.push(`Joint pins: ${qty} × ${i ? `${i} (${d} mm)` : `${d} mm`} dowel / rod, ${len} mm long`);
  }
  return items;
}

export function ExportPanel() {
  const [busy, setBusy] = useState(false);
  const d = store.design;
  const b = store.build;
  const pieces = b.mode === 'split' ? b.pieces : b.pieces;
  const bad = pieces.filter((p) => p.kind === 'piece' && !p.fit.fits).length;
  const hasCuts = d.split.cuts.length > 0;

  const fils = filamentsOf(d);
  const multi = new Set(d.parts.filter((p) => p.op !== 'subtract' && !p.hidden).map((p) => p.filament || 1)).size > 1;

  const piece3mf = (r, idxs) => {
    const plate = d.split.plate;
    const cols = Math.max(1, Math.ceil(Math.sqrt(idxs.length)));
    return build3MF(idxs.map((i, k) => ({
      name: r.pieces[i].name,
      parts: r.pieces[i].parts.map((q) => ({ ...q, name: `${r.pieces[i].name} – ${fils[q.filament - 1]?.name || `filament ${q.filament}`}` })),
      offset: idxs.length > 1 ? [(k % cols) * (plate.x + 20), -Math.floor(k / cols) * (plate.y + 20)] : [0, 0],
    })), { title: d.name, filamentNames: fils.map((f) => f.name) });
  };

  const exportAll = async (mode, single, format = 'zip') => {
    setBusy(true);
    try {
      const r = await request('build', store.design, { mode, withStl: true });
      const base = (p, i) => `${String(i + 1).padStart(2, '0')}_${safe(p.name)}`;
      if (single != null) {
        const p = r.pieces[single];
        if (format === '3mf') await download(piece3mf(r, [single]), `${safe(d.name)}_${base(p, single)}.3mf`);
        else await download(new Blob([p.stl], { type: 'model/stl' }), `${safe(d.name)}_${base(p, single)}.stl`);
      } else if (format === '3mf') {
        await download(piece3mf(r, r.pieces.map((_, i) => i)), `${safe(d.name)}_all_pieces.3mf`);
      } else {
        const files = [];
        r.pieces.forEach((p, i) => {
          files.push({ name: `stl/${base(p, i)}.stl`, data: p.stl });
          files.push({ name: `3mf/${base(p, i)}.3mf`, blob: piece3mf(r, [i]) });
          if (p.parts.length > 1) {
            for (const q of p.parts) files.push({ name: `stl_by_filament/${base(p, i)}__filament${q.filament}_${safe(fils[q.filament - 1]?.name || '')}.stl`, data: q.stl });
          }
        });
        files.push({ name: `${safe(d.name)}_all_pieces.3mf`, blob: piece3mf(r, r.pieces.map((_, i) => i)) });
        const readme = [
          `${d.name} — exported from Prop Forge`, '',
          `Printer bed: ${d.split.plate.x} × ${d.split.plate.y} × ${d.split.plate.z} mm (${d.split.plate.name || 'custom'})`,
          'Every file is already laid out for printing (flat side down, rotated to fit the bed).', '',
          'Folders:',
          '  3mf/              one 3MF per piece. Pieces that use several filaments keep each filament as its own',
          '                    part with its filament slot set: open in Snapmaker Orca / OrcaSlicer / Bambu Studio.',
          '  stl/              one STL per piece (single filament, any slicer).',
          '  stl_by_filament/  the filament parts of multi-filament pieces as separate STLs. Load all files of one',
          '                    piece together and answer "yes" to "load as a single object with multiple parts".',
          `  ${safe(d.name)}_all_pieces.3mf  every piece in one project; use Arrange to spread them over plates.`, '',
          'Filament slots:', ...fils.map((f, i) => `  ${i + 1}: ${f.name}`), '',
          'Pieces:', ...r.pieces.map((p, i) => `  ${base(p, i)}  ${p.parts.length > 1 ? `[filaments ${p.parts.map((q) => q.filament).join(', ')}]` : `[filament ${p.parts[0]?.filament || 1}]`}${p.fit.fits ? '' : '  (TOO BIG for this bed!)'}`), '',
          'Joints:', ...(r.reports || []).map((x, i) => `  Cut ${i + 1}: ${Array.from(new Set(x.notes)).join('; ')}`), '',
          'Shopping list:', ...shoppingList(d, r.reports).map((x) => `  - ${x}`), '',
          'Assembly: dry-fit everything first. Glue joints with CA or 5-minute epoxy (screw joints stay unglued),',
          'push the dowel/rod through the handle with epoxy, then fill seams with wood filler, sand and paint.',
        ].join('\n');
        files.push({ name: 'README.txt', data: new TextEncoder().encode(readme) });
        files.push({ name: `${safe(d.name)}.propforge.json`, data: new TextEncoder().encode(JSON.stringify({ ...d, meshes: packMeshes(d) }, null, 1)) });
        for (const f of files) if (f.blob) { f.data = new Uint8Array(await f.blob.arrayBuffer()); delete f.blob; }
        await download(makeZip(files), `${safe(d.name)}_print_files.zip`);
      }
      toast('Download ready');
    } catch (e) { toast(`Export failed: ${e.message}`); }
    setBusy(false);
  };

  const list = shoppingList(d, b.reports);

  return (
    <div>
      <Section title="Download for printing">
        {!hasCuts && <Help warn>No cuts yet. If the prop is bigger than your printer, go to <button class="link" onClick={() => setUI({ tab: 'split' })}>Split</button> first.</Help>}
        {hasCuts && bad > 0 && <Help warn>{bad} piece{bad > 1 ? 's are' : ' is'} still too big for the bed.</Help>}
        <button class="primary wide" disabled={busy} onClick={() => exportAll(hasCuts ? 'split' : 'model')}>
          {busy ? 'Preparing files…' : `Download all ${pieces.length > 1 ? `${pieces.length} pieces` : 'files'} (.zip)`}
        </button>
        <button class="wide" disabled={busy} onClick={() => exportAll(hasCuts ? 'split' : 'model', null, '3mf')}>
          One 3MF project with every piece{multi ? ' (multi-filament)' : ''}
        </button>
        <Help>The ZIP holds a 3MF and an STL per piece (already laid flat for printing){multi ? ', STLs per filament,' : ''} a README with the joints and shopping list, and your project file.</Help>
        {multi && <Help>Multi-filament: in the 3MFs every filament is its own part with its slot (1–{fils.length}) set, ready for Snapmaker Orca on the U1. Load matching filaments into those toolheads.</Help>}
        {hasCuts && pieces.length > 1 && (
          <ul class="pieces">
            {pieces.map((p, i) => (
              <li key={i}>
                <span class="nm">{p.name}</span>
                <span class={p.fit.fits ? 'good' : 'bad'}>{p.fit.fits ? '✓' : '✗'}</span>
                <button class="link" disabled={busy} onClick={() => exportAll('split', i)}>STL</button>
                <button class="link" disabled={busy} onClick={() => exportAll('split', i, '3mf')}>3MF</button>
              </li>
            ))}
          </ul>
        )}
        <div class="row-btns">
          {hasCuts && <button disabled={busy} onClick={() => exportAll('model')}>Uncut model (.stl)</button>}
          <button onClick={() => download(new Blob([JSON.stringify({ ...d, meshes: packMeshes(d) }, null, 1)], { type: 'application/json' }), `${safe(d.name)}.propforge.json`)}>Project file (.json)</button>
        </div>
      </Section>
      <Section title="Shopping list">
        {list.length ? <ul class="bullets">{list.map((x, i) => <li key={i}>{x}</li>)}</ul> : <Help>Nothing extra needed: no dowels, pins or magnets in this design yet.</Help>}
      </Section>
      <Section title="Print & finish tips">
        <ul class="bullets">
          <li>Print blades flat or on edge (the export already does this), never standing on end: layer lines then run along the blade, which is the strong direction.</li>
          <li>Keep edges at least 2 mm thick and round off points: most conventions require blunt edges on printed props.</li>
          <li>Take-apart joints: print screw-thread pieces with 3+ walls, and test-fit one thread before printing everything.</li>
          <li>3–4 walls and 10–15% gyroid infill keeps big props light but stiff. Use 5+ walls around joints.</li>
          <li>Test-print one joint first. If plugs are tight, raise "Fit clearance" on the cut; if loose, lower it.</li>
          <li>Dry-fit, then glue with CA (fast) or epoxy (gap-filling). Push the handle dowel in with epoxy for a solid core.</li>
          <li>Fill seams with wood filler or spot putty, sand 120 → 220 → 400, prime with filler primer, then paint.</li>
        </ul>
      </Section>
    </div>
  );
}
