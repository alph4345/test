import { useState } from 'preact/hooks';
import { store, toast, setUI } from '../state.js';
import { request } from '../engine/client.js';
import { makeZip, download } from './zip.js';
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
  for (const r of reports || []) for (const b of r.bom || []) {
    const key = `${b.d}|${b.length}`;
    pins.set(key, (pins.get(key) || 0) + b.qty);
  }
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

  const exportAll = async (mode, single) => {
    setBusy(true);
    try {
      const r = await request('build', store.design, { mode, withStl: true });
      const files = r.pieces.map((p, i) => ({ name: `${String(i + 1).padStart(2, '0')}_${safe(p.name)}.stl`, data: p.stl }));
      if (single != null) {
        const f = files[single];
        download(new Blob([f.data], { type: 'model/stl' }), `${safe(d.name)}_${f.name}`);
      } else if (files.length === 1) {
        download(new Blob([files[0].data], { type: 'model/stl' }), `${safe(d.name)}.stl`);
      } else {
        const readme = [
          `${d.name} — exported from Prop Forge`, '',
          `Printer bed: ${d.split.plate.x} × ${d.split.plate.y} × ${d.split.plate.z} mm`,
          'Each STL is already laid out for printing (flat side down, rotated to fit the bed).', '',
          'Pieces:', ...r.pieces.map((p, i) => `  ${files[i].name}  ${p.fit.fits ? '' : '(TOO BIG for this bed!)'}`), '',
          'Joints:', ...(r.reports || []).map((x, i) => `  Cut ${i + 1}: ${Array.from(new Set(x.notes)).join('; ')}`), '',
          'Shopping list:', ...shoppingList(d, r.reports).map((x) => `  - ${x}`), '',
          'Assembly: dry-fit everything first. Glue joints with CA or 5-minute epoxy,',
          'push the dowel/rod through the handle with epoxy, then fill seams with wood filler, sand and paint.',
        ].join('\n');
        files.push({ name: 'README.txt', data: new TextEncoder().encode(readme) });
        files.push({ name: `${safe(d.name)}.propforge.json`, data: new TextEncoder().encode(JSON.stringify(d, null, 1)) });
        download(makeZip(files), `${safe(d.name)}_print_files.zip`);
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
          {busy ? 'Preparing files…' : hasCuts ? `Download all ${pieces.length} pieces (.zip)` : 'Download model (.stl)'}
        </button>
        <Help>The ZIP holds one STL per piece (already oriented flat for printing), a README with the joint and shopping list, and your project file.</Help>
        {hasCuts && pieces.length > 1 && (
          <ul class="pieces">
            {pieces.map((p, i) => (
              <li key={i}>
                <span class="nm">{p.name}</span>
                <span class={p.fit.fits ? 'good' : 'bad'}>{p.fit.fits ? '✓' : '✗'}</span>
                <button class="link" disabled={busy} onClick={() => exportAll('split', i)}>STL</button>
              </li>
            ))}
          </ul>
        )}
        <div class="row-btns">
          {hasCuts && <button disabled={busy} onClick={() => exportAll('model')}>Uncut model (.stl)</button>}
          <button onClick={() => download(new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' }), `${safe(d.name)}.propforge.json`)}>Project file (.json)</button>
        </div>
      </Section>
      <Section title="Shopping list">
        {list.length ? <ul class="bullets">{list.map((x, i) => <li key={i}>{x}</li>)}</ul> : <Help>Nothing extra needed: no dowels, pins or magnets in this design yet.</Help>}
      </Section>
      <Section title="Print & finish tips">
        <ul class="bullets">
          <li>Print blades flat on the bed (the export already does this); layer lines then run along the blade, which is the strong direction.</li>
          <li>3–4 walls and 10–15% gyroid infill keeps big props light but stiff. Use 5+ walls around joints.</li>
          <li>Test-print one joint first. If plugs are tight, raise "Fit clearance" on the cut; if loose, lower it.</li>
          <li>Dry-fit, then glue with CA (fast) or epoxy (gap-filling). Push the handle dowel in with epoxy for a solid core.</li>
          <li>Fill seams with wood filler or spot putty, sand 120 → 220 → 400, prime with filler primer, then paint.</li>
        </ul>
      </Section>
    </div>
  );
}
