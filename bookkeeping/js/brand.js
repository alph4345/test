/* n0va Books · brand.js
 * The n0va wordmark: monoline geometric letters where the 0 is a ring holding a
 * four-point star (the nova). Drawn from the same geometry in SVG (screens) and
 * jsPDF vector paths (documents), so it needs no font and no image.
 * Also derives readable accent tokens from whatever brand color is chosen. */
(function (NB) {
  'use strict';

  const INK = '#1d1838';
  const STAR = '#f2b544';
  const STAR_DEEP = '#d8961c';

  // ---------------------------------------------------------------- color math
  function hexToRgb(hex) {
    let h = String(hex || '').trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((c) => c + c).join('');
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }

  function rgbToHex(c) {
    const p = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
    return '#' + p(c.r) + p(c.g) + p(c.b);
  }

  function luminance(hex) {
    const c = hexToRgb(hex);
    if (!c) return 0;
    const ch = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  }

  function contrast(a, b) {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  // t = share of b in the mix.
  function mix(a, b, t) {
    const x = hexToRgb(a);
    const y = hexToRgb(b);
    if (!x || !y) return a;
    return rgbToHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
  }

  // Walk the color toward `toward` until it reaches the target contrast on `ground`.
  function reach(color, ground, target, toward) {
    let c = color;
    for (let i = 0; i < 40 && contrast(c, ground) < target; i++) c = mix(c, toward, 0.06);
    return c;
  }

  function validColor(hex) {
    return hexToRgb(hex) ? rgbToHex(hexToRgb(hex)) : '#c83672';
  }

  // Accent tokens for both themes from one brand color.
  function accentTokens(brandColor) {
    const accent = validColor(brandColor);
    const lightGround = '#f6f5fa';
    const darkGround = '#1c1930';
    const onAccent = contrast(accent, '#ffffff') >= 4.5 ? '#ffffff' : INK;
    return {
      accent,
      onAccent,
      inkLight: reach(accent, lightGround, 4.8, '#000000'),
      inkDark: reach(accent, darkGround, 5.2, '#ffffff'),
      washLight: mix(accent, '#ffffff', 0.88),
      washDark: mix(accent, darkGround, 0.8),
      lineLight: mix(accent, '#ffffff', 0.55),
      lineDark: mix(accent, darkGround, 0.4),
      sheet: reach(accent, '#ffffff', 4.6, '#000000'),
    };
  }

  // Writes the brand tokens as one stylesheet so both themes stay in sync.
  function apply(settings) {
    const t = accentTokens(settings.brand.color);
    const paper = settings.docs.paper === 'a4' ? 'A4' : 'letter';
    const css =
      ':root{--accent:' + t.accent + ';--on-accent:' + t.onAccent + ';--accent-ink:' + t.inkLight +
      ';--accent-wash:' + t.washLight + ';--accent-line:' + t.lineLight + ';--sheet-accent:' + t.sheet + '}' +
      '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--accent-ink:' + t.inkDark +
      ';--accent-wash:' + t.washDark + ';--accent-line:' + t.lineDark + '}}' +
      ':root[data-theme="dark"]{--accent-ink:' + t.inkDark + ';--accent-wash:' + t.washDark + ';--accent-line:' + t.lineDark + '}' +
      '@page{size:' + paper + ';margin:0.5in}';
    let el = document.getElementById('nb-brand');
    if (!el) {
      el = document.createElement('style');
      el.id = 'nb-brand';
      document.head.appendChild(el);
    }
    if (el.textContent !== css) el.textContent = css;
    return t;
  }

  // ---------------------------------------------------------------- SVG

  const STAR_PATH = 'M69 13.5Q70.3 23.7 76.5 25Q70.3 26.3 69 36.5Q67.7 26.3 61.5 25Q67.7 23.7 69 13.5Z';

  function wordmark(label) {
    return (
      '<svg class="wordmark" viewBox="0 -2 181 54" role="img" aria-label="' + (label || 'n0va') + '">' +
      '<g fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M6 46.5V30a16.5 16.5 0 0 1 33 0v16.5"/>' +
      '<ellipse cx="69" cy="25" rx="14" ry="21.5"/>' +
      '<path d="M99 13.5l13.5 33 13.5-33"/>' +
      '<circle cx="158.5" cy="30" r="16.5"/>' +
      '<path d="M175 13.5v33"/></g>' +
      '<path class="wm-star" d="' + STAR_PATH + '"/></svg>'
    );
  }

  function markSVG(size) {
    const s = size ? ' width="' + size + '" height="' + size + '"' : '';
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"' + s + ' aria-hidden="true">' +
      '<rect width="64" height="64" rx="15" fill="' + INK + '"/>' +
      '<ellipse cx="32" cy="32" rx="12.5" ry="19" fill="none" stroke="#ffffff" stroke-width="6"/>' +
      '<path fill="' + STAR + '" d="M32 21Q33.3 30.7 39.5 32Q33.3 33.3 32 43Q30.7 33.3 24.5 32Q30.7 30.7 32 21Z"/></svg>'
    );
  }

  function faviconHref() {
    return 'data:image/svg+xml,' + encodeURIComponent(markSVG());
  }

  // The brand block used in the app rail and on document sheets.
  function lockup(settings, logo, where) {
    const esc = NB.ui ? NB.ui.esc : (s) => s;
    const name = settings.business.name || 'n0va crafts & creations';
    const mode = settings.brand.logoMode;
    if (mode === 'image' && logo && logo.dataUrl) {
      return '<div class="lockup lockup-image lockup-' + where + '"><img src="' + esc(logo.dataUrl) + '" alt="' + esc(name) + '"></div>';
    }
    if (mode === 'text') {
      return '<div class="lockup lockup-text lockup-' + where + '"><span class="lockup-name">' + esc(name) + '</span></div>';
    }
    return (
      '<div class="lockup lockup-mark lockup-' + where + '">' + wordmark(esc(name)) +
      '<span class="lockup-sub" aria-hidden="true">crafts &amp; creations</span></div>'
    );
  }

  // ---------------------------------------------------------------- jsPDF

  // Absolute path commands -> jsPDF lines() (each segment relative to the previous point).
  function pdfPath(doc, cmds, X, Y, style, closed) {
    let cx = X(cmds[0][1]);
    let cy = Y(cmds[0][2]);
    const x0 = cx;
    const y0 = cy;
    const segs = [];
    for (const c of cmds.slice(1)) {
      if (c[0] === 'L') {
        const nx = X(c[1]);
        const ny = Y(c[2]);
        segs.push([nx - cx, ny - cy]);
        cx = nx;
        cy = ny;
      } else {
        const ex = X(c[5]);
        const ey = Y(c[6]);
        segs.push([X(c[1]) - cx, Y(c[2]) - cy, X(c[3]) - cx, Y(c[4]) - cy, ex - cx, ey - cy]);
        cx = ex;
        cy = ey;
      }
    }
    doc.lines(segs, x0, y0, [1, 1], style, !!closed);
  }

  // Four-point star with concave sides, centred on (cx, cy).
  function pdfSparkle(doc, cx, cy, rx, ry, pinch, color) {
    const q = (p0, ctrl, p1) => ['C',
      p0[0] + (2 / 3) * (ctrl[0] - p0[0]), p0[1] + (2 / 3) * (ctrl[1] - p0[1]),
      p1[0] + (2 / 3) * (ctrl[0] - p1[0]), p1[1] + (2 / 3) * (ctrl[1] - p1[1]),
      p1[0], p1[1]];
    const T = [cx, cy - ry];
    const R = [cx + rx, cy];
    const B = [cx, cy + ry];
    const L = [cx - rx, cy];
    const id = (v) => v;
    doc.setFillColor(color);
    pdfPath(doc, [
      ['M', T[0], T[1]],
      q(T, [cx + pinch, cy - pinch], R),
      q(R, [cx + pinch, cy + pinch], B),
      q(B, [cx - pinch, cy + pinch], L),
      q(L, [cx - pinch, cy - pinch], T),
    ], id, id, 'F', true);
  }

  // Draws the wordmark with its top-left at (x, y), `height` tall. Returns its width.
  function pdfWordmark(doc, x, y, height, ink) {
    const s = height / 54;
    const X = (v) => x + v * s;
    const Y = (v) => y + (v + 2) * s;
    const k = 0.5523 * 16.5;
    doc.setLineWidth(7 * s);
    doc.setLineCap('round');
    doc.setLineJoin('round');
    doc.setDrawColor(ink || INK);
    pdfPath(doc, [['M', 6, 46.5], ['L', 6, 30], ['C', 6, 30 - k, 22.5 - k, 13.5, 22.5, 13.5], ['C', 22.5 + k, 13.5, 39, 30 - k, 39, 30], ['L', 39, 46.5]], X, Y, 'S');
    doc.ellipse(X(69), Y(25), 14 * s, 21.5 * s, 'S');
    pdfPath(doc, [['M', 99, 13.5], ['L', 112.5, 46.5], ['L', 126, 13.5]], X, Y, 'S');
    doc.circle(X(158.5), Y(30), 16.5 * s, 'S');
    doc.line(X(175), Y(13.5), X(175), Y(46.5));
    pdfSparkle(doc, X(69), Y(25), 7.5 * s, 11.5 * s, 1.3 * s, STAR_DEEP);
    doc.setLineCap('butt');
    doc.setLineJoin('miter');
    return 181 * s;
  }

  NB.brand = { INK, STAR, STAR_DEEP, hexToRgb, rgbToHex, contrast, mix, accentTokens, apply, wordmark, markSVG, faviconHref, lockup, pdfPath, pdfSparkle, pdfWordmark };
})(window.NB = window.NB || {});
