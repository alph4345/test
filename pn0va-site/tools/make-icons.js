#!/usr/bin/env node
/*
 * Regenerate the favicon set and the link-preview image from the logo.
 *
 *     node tools/make-icons.js
 *
 * Reads logo/pn0va-logo.svg from the brand kit (the real PN0VA folder beside
 * this one if it exists, otherwise _source/brand-kit) and writes into
 * _source/icons/, which build.py copies into every build:
 *
 *   favicon.svg           P + sword monogram, red on a black tile
 *   favicon.ico           16/32/48 px copies of the same, for older browsers
 *   apple-touch-icon.png  180 px, square and opaque (iOS rounds the corners)
 *   og-image.png          1200 x 630 link preview: the full lockup on black
 *
 * The monogram is the logo's own first two glyphs, cut straight from the
 * vector, so it can never drift from the lockup. The full wordmark is
 * unreadable at tab size; the sword alone turns into a hairline at 16 px.
 *
 * Needs Node and Playwright (npm i -g playwright). Only run it when the logo
 * changes; the generated files are committed, so build.py does not need it.
 */
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const SITE = path.resolve(__dirname, '..');
const KIT = [path.join(SITE, '..', 'PN0VA'), path.join(SITE, '..', 'pn0va-brand'),
             path.join(SITE, '_source', 'brand-kit')]
  .find(d => fs.existsSync(path.join(d, 'tokens.css')));
const OUT = path.join(SITE, '_source', 'icons');
const RED = '#FF1609';

const logo = fs.readFileSync(path.join(KIT, 'logo', 'pn0va-logo.svg'), 'utf8');
const pathOf = start => {
  const m = logo.match(new RegExp('<path class="cls-4" d="(' + start + '[^"]*)"'));
  if (!m) throw new Error('logo.svg changed: no path starting ' + start);
  return m[1];
};
const P = pathOf('M140\\.19'), SWORD = pathOf('M 241\\.24');

// P spans x 49.01-140.19, the sword 127.9-241.25; top of the sword -16, the
// letter baseline 280.61 (measured with getBBox on pn0va-logo.svg).
function monogram({ tile, margin, rx }) {
  const x0 = 49.01, x1 = 241.25, y0 = -16, y1 = 280.61;
  const side = (y1 - y0) * margin, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const x = cx - side / 2, y = cy - side / 2, f = n => n.toFixed(2);
  const bg = tile ? `<rect x="${f(x)}" y="${f(y)}" width="${f(side)}" height="${f(side)}" rx="${f(side * rx)}" fill="#000"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(x)} ${f(y)} ${f(side)} ${f(side)}">` +
         `${bg}<g fill="${RED}"><path d="${P}"/><path d="${SWORD}"/></g></svg>\n`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const favicon = monogram({ tile: true, margin: 1.29, rx: 0.16 });
  const touch = monogram({ tile: true, margin: 1.45, rx: 0 });
  fs.writeFileSync(path.join(OUT, 'favicon.svg'), favicon);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  async function png(svg, w, h, file) {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<html><body style="margin:0;background:transparent">` +
      `<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${w}" height="${h}" style="display:block"></body></html>`);
    await page.waitForFunction(() => document.images[0].complete);
    await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
  }
  // favicon.ico: each size rendered from the vector at that size (sharper than
  // shrinking one big bitmap), stored as PNG frames, which every browser and
  // Windows since Vista reads. The format is a 6-byte header, a 16-byte entry
  // per frame, then the frames.
  const frames = [];
  for (const s of [16, 32, 48]) {
    const f = path.join(OUT, `.favicon-${s}.png`);
    await png(favicon, s, s, f);
    frames.push({ s, data: fs.readFileSync(f) });
    fs.unlinkSync(f);
  }
  const head = Buffer.alloc(6 + 16 * frames.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(frames.length, 4);
  let offset = head.length;
  frames.forEach((fr, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(fr.s, e); head.writeUInt8(fr.s, e + 1);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(fr.data.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += fr.data.length;
  });
  fs.writeFileSync(path.join(OUT, 'favicon.ico'), Buffer.concat([head, ...frames.map(f => f.data)]));

  await png(touch, 180, 180, path.join(OUT, 'apple-touch-icon.png'));

  // Link preview: the whole lockup, centred on black at the 1.91:1 size every
  // network crops to, with enough margin that no platform's crop clips it.
  const lockup = logo.replace(/<\?xml[^>]*>\s*/, '').replace('<svg ', '<svg width="760" ');
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(`<html><body style="margin:0;width:1200px;height:630px;background:#000;` +
    `display:flex;align-items:center;justify-content:center">${lockup}</body></html>`);
  await page.screenshot({ path: path.join(OUT, 'og-image.png') });
  await browser.close();
  console.log('icons written to', path.relative(process.cwd(), OUT));
})();
