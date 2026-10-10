// 3MF writer for multi-filament prints. Each piece becomes one object made
// of one part per filament; Metadata/model_settings.config gives every part
// its filament ("extruder") number. This is the layout OrcaSlicer and its
// forks (Snapmaker Orca, Bambu Studio) read per-part filaments from: an
// object with <components>, one mesh object per component, and a config
// <part id=component object id> carrying an "extruder" value.
import { makeZip } from './zip.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (v) => {
  const s = v.toFixed(4);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
};

function meshXml(id, verts, tris) {
  const out = [`  <object id="${id}" type="model"><mesh><vertices>`];
  for (let i = 0; i < verts.length; i += 3) out.push(`<vertex x="${num(verts[i])}" y="${num(verts[i + 1])}" z="${num(verts[i + 2])}"/>`);
  out.push('</vertices><triangles>');
  for (let i = 0; i < tris.length; i += 3) out.push(`<triangle v1="${tris[i]}" v2="${tris[i + 1]}" v3="${tris[i + 2]}"/>`);
  out.push('</triangles></mesh></object>');
  return out.join('');
}

// objects: [{name, parts: [{filament, name, verts, tris}], offset: [x, y]}]
export function build3MF(objects, { title = 'Prop Forge', filamentNames = [] } = {}) {
  let nextId = 1;
  const resources = [];
  const build = [];
  const config = ['<?xml version="1.0" encoding="UTF-8"?>', '<config>'];
  for (const obj of objects) {
    const comps = [];
    const partIds = [];
    for (const p of obj.parts) {
      const id = nextId++;
      resources.push(meshXml(id, p.verts, p.tris));
      comps.push(`<component objectid="${id}"/>`);
      partIds.push({ id, p });
    }
    const oid = nextId++;
    resources.push(`  <object id="${oid}" type="model"><components>${comps.join('')}</components></object>`);
    const [ox, oy] = obj.offset || [0, 0];
    build.push(`  <item objectid="${oid}" transform="1 0 0 0 1 0 0 0 1 ${num(ox)} ${num(oy)} 0" printable="1"/>`);
    const mainFilament = obj.parts.reduce((a, b) => (b.tris.length > a.tris.length ? b : a)).filament;
    config.push(`  <object id="${oid}">`, `    <metadata key="name" value="${esc(obj.name)}"/>`, `    <metadata key="extruder" value="${mainFilament}"/>`);
    for (const { id, p } of partIds) {
      const label = p.name || `${obj.name} – ${filamentNames[p.filament - 1] || `filament ${p.filament}`}`;
      config.push(`    <part id="${id}" subtype="normal_part">`, `      <metadata key="name" value="${esc(label)}"/>`, `      <metadata key="extruder" value="${p.filament}"/>`, '    </part>');
    }
    config.push('  </object>');
  }
  config.push('</config>');
  const model = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    `  <metadata name="Title">${esc(title)}</metadata>`,
    '  <metadata name="Application">Prop Forge</metadata>',
    '  <resources>', ...resources, '  </resources>',
    '  <build>', ...build, '  </build>',
    '</model>',
  ].join('\n');
  const enc = new TextEncoder();
  return makeZip([
    { name: '[Content_Types].xml', data: enc.encode('<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="config" ContentType="text/xml"/></Types>') },
    { name: '_rels/.rels', data: enc.encode('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>') },
    { name: '3D/3dmodel.model', data: enc.encode(model) },
    { name: 'Metadata/model_settings.config', data: enc.encode(config.join('\n')) },
  ], 'model/3mf');
}
