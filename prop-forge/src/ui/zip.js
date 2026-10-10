// Minimal ZIP writer (stored, no compression). STL files zip poorly
// anyway and this keeps the app dependency-free.
const table = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function makeZip(files, type = "application/zip") {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(8, 0, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(local.buffer), name, data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, data.length, true);
    cen.setUint32(24, data.length, true);
    cen.setUint16(28, name.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cenSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type });
}

// Inside the claude.ai artifact viewer, files go through the viewer's
// "downloads" capability (which only allows some types, so an STL is
// zipped). Everywhere else a normal browser download is used.
let viewerDownloads;
function getViewerDownloads() {
  if (viewerDownloads === undefined) {
    viewerDownloads = window.claude && typeof window.claude.use === 'function'
      ? window.claude.use('downloads').catch(() => null)
      : Promise.resolve(null);
  }
  return viewerDownloads;
}
if (typeof window !== 'undefined') getViewerDownloads();

const ALLOWED = /\.(zip|json|txt|csv|md|png|svg|pdf|html)$/i; // 3mf/stl get zipped in the viewer

export async function download(blob, filename) {
  const dl = await getViewerDownloads();
  if (dl) {
    let data = blob, name = filename;
    if (!ALLOWED.test(name)) {
      data = makeZip([{ name, data: new Uint8Array(await blob.arrayBuffer()) }]);
      name = name.replace(/\.[^.]+$/, '') + '.zip';
    }
    try { await dl.save({ filename: name, data }); } catch (e) {
      if (e && e.code !== 'declined') throw new Error(e.message || e.code || 'download failed');
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
