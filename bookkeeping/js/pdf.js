/* n0va Books · pdf.js
 * Vector PDFs for estimates, invoices and receipts, drawn with jsPDF (loaded on first use).
 * The built-in PDF fonts cover Windows-1252 (Latin letters, €, curly quotes, dashes);
 * clean() maps or replaces anything else so a stray symbol can't garble a line. */
(function (NB) {
  'use strict';
  const { Money } = NB.util;

  const C = { ink: '#1d1838', body: '#3a3555', muted: '#6b6785', line: '#e3e0ec', wash: '#f5f3fa', good: '#1f7a50', grey: '#8a869c' };
  const CP1252 = '\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178';
  const OUTSIDE = new RegExp('[^\\x0A\\x20-\\x7E\\xA0-\\xFF' + CP1252 + ']', 'g');
  const SPARKS = /[\u2726\u2727\u2728\u2605\u2606\u2733\u2734]/g;
  const HAS_SPARK = /[\u2726\u2727\u2728\u2605\u2606\u2733\u2734]/;

  function clean(s) {
    return String(s == null ? '' : s)
      .normalize('NFC')
      .replace(/\u2212/g, '-')
      .replace(/[\u2000-\u200A\u202F\u205F\t]/g, ' ')
      .replace(/[\u200B-\u200D\u2060\uFEFF\r]/g, '')
      .replace(SPARKS, '')
      .replace(OUTSIDE, '?');
  }

  function money(minor) {
    const s = NB.store.settings();
    const out = clean(Money.format(minor, s.docs.currency, s.docs.locale));
    if (!out.includes('?')) return out;
    try {
      return clean(new Intl.NumberFormat(s.docs.locale, { style: 'currency', currency: s.docs.currency, currencyDisplay: 'code' }).format((Number(minor) || 0) / Money.factor(s.docs.currency)));
    } catch (e) {
      return out;
    }
  }

  const date = (iso, opts) => clean(NB.ui.fmt.date(iso, opts));
  const qty = (q) => clean(NB.ui.fmt.qty(q));

  async function lib() {
    if (!(window.jspdf && window.jspdf.jsPDF)) await NB.ui.loadScript('vendor/jspdf.umd.min.js');
    if (!(window.jspdf && window.jspdf.jsPDF)) throw new Error('The PDF library did not load.');
    return window.jspdf.jsPDF;
  }

  // ---------------------------------------------------------------- drawing helpers

  function font(doc, size, style, color) {
    doc.setFont('helvetica', style || 'normal');
    doc.setFontSize(size);
    doc.setTextColor(color || C.ink);
  }

  function widthOf(doc, text, charSpace) {
    return doc.getTextWidth(text) + (charSpace || 0) * Math.max(0, text.length - 1);
  }

  function textRight(doc, text, xRight, y, charSpace) {
    const t = clean(text);
    doc.text(t, xRight - widthOf(doc, t, charSpace), y, charSpace ? { charSpace } : undefined);
  }

  function label(doc, text, x, y) {
    font(doc, 6.8, 'bold', C.muted);
    doc.text(clean(text).toUpperCase(), x, y, { charSpace: 0.9 });
  }

  function hairline(doc, x1, y, x2) {
    doc.setDrawColor(C.line);
    doc.setLineWidth(0.7);
    doc.line(x1, y, x2, y);
  }

  function start(JsPDF, s, title) {
    const doc = new JsPDF({ unit: 'pt', format: s.docs.paper === 'a4' ? 'a4' : 'letter', compress: true });
    doc.setProperties({ title: clean(title), author: clean(s.business.name), creator: 'n0va Books' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    return { doc, s, W, H, M: 48, y: 48, bottom: H - 76, accent: NB.brand.accentTokens(s.brand.color).sheet };
  }

  function newPage(p) {
    p.doc.addPage();
    p.y = 56;
  }

  function ensure(p, height, after) {
    if (p.y + height > p.bottom) {
      newPage(p);
      if (after) after();
    }
  }

  function imageFormat(dataUrl) {
    return /^data:image\/png/i.test(dataUrl) ? 'PNG' : 'JPEG';
  }

  function header(p, logo, kind, number) {
    const { doc, s, W, M } = p;
    const top = 44;
    let brandBottom;
    if (s.brand.logoMode === 'image' && logo && logo.dataUrl && logo.width && logo.height) {
      const r = Math.min(180 / logo.width, 56 / logo.height);
      const w = logo.width * r;
      const h = logo.height * r;
      doc.addImage(logo.dataUrl, imageFormat(logo.dataUrl), M, top, w, h, undefined, 'FAST');
      brandBottom = top + h;
    } else if (s.brand.logoMode === 'text') {
      font(doc, 17, 'bold', C.ink);
      const lines = doc.splitTextToSize(clean(s.business.name), 280);
      doc.text(lines, M, top + 15, { lineHeightFactor: 1.2 });
      brandBottom = top + 15 + (lines.length - 1) * 20.4 + 4;
    } else {
      NB.brand.pdfWordmark(doc, M, top, 30, C.ink);
      font(doc, 6.4, 'bold', C.muted);
      doc.text('CRAFTS & CREATIONS', M + 1, top + 42, { charSpace: 1.7 });
      brandBottom = top + 44;
    }
    font(doc, 19, 'bold', p.accent);
    textRight(doc, kind.toUpperCase(), W - M, top + 17, 2.4);
    if (number) {
      font(doc, 10.5, 'bold', C.body);
      textRight(doc, number, W - M, top + 34, 0.5);
    }
    p.y = Math.max(brandBottom, top + 40) + 16;
    hairline(doc, M, p.y, W - M);
    p.y += 24;
  }

  // A labelled block of lines inside a column. Returns the y below it.
  function block(p, x, width, title, rows) {
    const { doc } = p;
    label(doc, title, x, p.y);
    let y = p.y + 15;
    rows.forEach((r) => {
      if (!r || !r.text) return;
      font(doc, r.size || 9.3, r.bold ? 'bold' : 'normal', r.muted ? C.muted : r.bold ? C.ink : C.body);
      doc.splitTextToSize(clean(r.text), width).forEach((line) => {
        doc.text(line, x, y);
        y += 12.6;
      });
    });
    return y;
  }

  function businessRows(s) {
    const b = s.business;
    const rows = [{ text: b.name, bold: true }];
    if (b.owner) rows.push({ text: b.owner });
    NB.sheet.lines(b.address).forEach((l) => rows.push({ text: l }));
    if (b.email) rows.push({ text: b.email });
    if (b.phone) rows.push({ text: b.phone });
    if (b.website) rows.push({ text: b.website });
    if (b.taxId) rows.push({ text: 'Tax ID ' + b.taxId, muted: true });
    return rows;
  }

  function customerRows(c) {
    if (!c) return [{ text: 'No customer', muted: true }];
    const rows = [{ text: c.name, bold: true }];
    if (c.company) rows.push({ text: c.company });
    NB.sheet.customerAddress(c).forEach((l) => rows.push({ text: l }));
    if (c.email) rows.push({ text: c.email });
    if (c.phone) rows.push({ text: c.phone });
    return rows;
  }

  // Label/value pairs, value right-aligned. The last pair can be the headline.
  function metaList(p, x, xRight, pairs, headline) {
    const { doc } = p;
    let y = p.y;
    pairs.forEach((pair) => {
      label(doc, pair[0], x, y);
      font(doc, 9.3, 'normal', C.body);
      textRight(doc, pair[1], xRight, y);
      y += 17;
    });
    if (headline) {
      y += 3;
      hairline(doc, x, y - 11, xRight);
      label(doc, headline[0], x, y + 2);
      font(doc, 13, 'bold', p.accent);
      textRight(doc, headline[1], xRight, y + 3);
      y += 20;
    }
    return y;
  }

  function stamp(p, text, color, cx, cy) {
    const { doc } = p;
    const theta = (9 * Math.PI) / 180;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const rot = (dx, dy) => [cx + dx * cos + dy * sin, cy - dx * sin + dy * cos];
    const t = clean(text).toUpperCase();
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: 0.82 }));
    font(doc, 17, 'bold', color);
    const cs = 3;
    const tw = widthOf(doc, t, cs);
    const hw = tw / 2 + 14;
    const hh = 16;
    doc.setDrawColor(color);
    [[hw, hh, 1.8], [hw - 3.5, hh - 3.5, 0.7]].forEach((b) => {
      const pts = [rot(-b[0], -b[1]), rot(b[0], -b[1]), rot(b[0], b[1]), rot(-b[0], b[1])];
      doc.setLineWidth(b[2]);
      const segs = pts.slice(1).map((q, i) => [q[0] - pts[i][0], q[1] - pts[i][1]]);
      doc.lines(segs, pts[0][0], pts[0][1], [1, 1], 'S', true);
    });
    const o = rot(-tw / 2, 6);
    doc.text(t, o[0], o[1], { angle: 9, charSpace: cs });
    doc.restoreGraphicsState();
  }

  function qrBlock(doc, link, x, y, size) {
    const qr = NB.sheet.qrMatrix(link);
    if (!qr) return false;
    const n = qr.getModuleCount();
    const m = size / (n + 4);
    doc.setFillColor('#ffffff');
    doc.rect(x, y, size, size, 'F');
    doc.setFillColor(C.ink);
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (!qr.isDark(r, c)) { c++; continue; }
        const s0 = c;
        while (c < n && qr.isDark(r, c)) c++;
        doc.rect(x + (s0 + 2) * m, y + (r + 2) * m, (c - s0) * m + 0.05, m + 0.05, 'F');
      }
    }
    return true;
  }

  function footers(p) {
    const { doc, s, W, H, M } = p;
    const n = doc.getNumberOfPages();
    const message = clean(s.brand.footer || '').trim();
    const sparkle = HAS_SPARK.test(s.brand.footer || '');
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      hairline(doc, M, H - 50, W - M);
      font(doc, 8, 'normal', C.muted);
      if (message) {
        doc.text(message, M, H - 34);
        if (sparkle) NB.brand.pdfSparkle(doc, M + doc.getTextWidth(message) + 8, H - 37, 3.4, 5.2, 0.6, NB.brand.STAR_DEEP);
      }
      font(doc, 8, 'normal', C.muted);
      const right = n > 1 ? 'Page ' + i + ' of ' + n : [s.business.email, s.business.website].filter(Boolean).join(' · ');
      if (right) textRight(doc, right, W - M, H - 34);
    }
  }

  // ---------------------------------------------------------------- estimate & invoice

  function itemsTable(p, items, lines) {
    const { doc, W, M } = p;
    const qtyR = W - M - 186;
    const priceR = W - M - 92;
    const descW = qtyR - 44 - M;

    const head = () => {
      doc.setFillColor(C.wash);
      doc.rect(M, p.y - 12, W - 2 * M, 20, 'F');
      label(doc, 'Item', M + 8, p.y + 1);
      font(doc, 6.8, 'bold', C.muted);
      textRight(doc, 'QTY', qtyR, p.y + 1, 0.9);
      textRight(doc, 'PRICE', priceR, p.y + 1, 0.9);
      textRight(doc, 'AMOUNT', W - M - 8, p.y + 1, 0.9);
      p.y += 24;
    };
    ensure(p, 60);
    head();

    if (!items.length) {
      font(doc, 9.5, 'normal', C.muted);
      doc.text('No items yet', M + 8, p.y);
      p.y += 18;
    }
    items.forEach((it, i) => {
      font(doc, 9.8, 'bold', C.ink);
      const d = doc.splitTextToSize(clean(it.description || 'Item'), descW);
      font(doc, 8.4, 'normal', C.muted);
      const det = it.details ? doc.splitTextToSize(clean(it.details), descW) : [];
      const h = d.length * 12.6 + det.length * 11 + 12;
      ensure(p, h, head);
      let y = p.y;
      font(doc, 9.8, 'bold', C.ink);
      d.forEach((l) => { doc.text(l, M + 8, y); y += 12.6; });
      font(doc, 8.4, 'normal', C.muted);
      det.forEach((l) => { doc.text(l, M + 8, y - 1); y += 11; });
      font(doc, 9.8, 'normal', C.body);
      textRight(doc, qty(it.qty), qtyR, p.y);
      textRight(doc, money(it.unitPrice), priceR, p.y);
      font(doc, 9.8, 'bold', C.ink);
      textRight(doc, money(lines[i]), W - M - 8, p.y);
      p.y += h;
      hairline(doc, M, p.y - 13, W - M);
    });
    p.y += 6;
  }

  function totalsAndNotes(p, kind, d, t, state) {
    const { doc, s, W, M } = p;
    const tx = W - M - 214;
    const tr = W - M - 8;
    const rows = [['Subtotal', money(t.subtotal)]];
    if (t.discount) rows.push([d.discountType === 'percent' ? 'Discount (' + qty(d.discountPercent) + '%)' : 'Discount', '-' + money(t.discount)]);
    if (t.shipping) rows.push(['Shipping', money(t.shipping)]);
    if (t.tax || t.taxRate) rows.push([(s.docs.taxLabel || 'Tax') + (t.taxRate ? ' (' + qty(t.taxRate) + '%)' : ''), money(t.tax)]);
    const isInvoice = kind === 'invoice';
    const showPaid = isInvoice && state && state.paid;
    const totalsH = rows.length * 17 + 30 + (showPaid ? 46 : 0) + (!isInvoice && t.deposit ? 28 : 0);

    // Left column: payment link + QR, notes.
    const nx = M;
    const nw = tx - 28 - M;
    const link = isInvoice && (!state || (state.balance > 0 && state.key !== 'void')) ? d.paymentLink || '' : '';
    font(doc, 9, 'normal', C.body);
    const noteLines = d.notes ? doc.splitTextToSize(clean(d.notes), nw) : [];
    const instr = s.docs.paymentInstructions ? doc.splitTextToSize(clean(s.docs.paymentInstructions), link ? nw - 84 : nw) : [];
    const notesH = (link ? 92 : isInvoice && instr.length ? instr.length * 12 + 30 : 0) + (noteLines.length ? noteLines.length * 12 + 26 : 0);

    ensure(p, Math.min(Math.max(totalsH, notesH), p.bottom - 60));
    const top = p.y;

    // Totals
    let y = top;
    rows.forEach((r) => {
      font(doc, 9.3, 'normal', C.body);
      doc.text(clean(r[0]), tx, y);
      textRight(doc, r[1], tr, y);
      y += 17;
    });
    hairline(doc, tx, y - 9, W - M);
    y += 7;
    font(doc, 11.5, 'bold', C.ink);
    doc.text('Total', tx, y);
    textRight(doc, money(t.total), tr, y);
    y += 22;
    if (showPaid) {
      font(doc, 9.3, 'normal', C.body);
      doc.text('Paid', tx, y);
      textRight(doc, '-' + money(state.paid), tr, y);
      y += 10;
      doc.setFillColor(NB.brand.mix(p.accent, '#ffffff', 0.9));
      doc.rect(tx - 8, y - 2, W - M - tx + 8, 26, 'F');
      font(doc, 11.5, 'bold', p.accent);
      doc.text(state.balance < 0 ? 'Credit' : 'Balance due', tx, y + 15);
      textRight(doc, money(Math.abs(state.balance)), tr, y + 15);
      y += 36;
    }
    if (!isInvoice && t.deposit) {
      doc.setFillColor(NB.brand.mix(p.accent, '#ffffff', 0.9));
      doc.rect(tx - 8, y - 14, W - M - tx + 8, 24, 'F');
      font(doc, 9.8, 'bold', p.accent);
      doc.text('Deposit to start (' + qty(t.depositPercent) + '%)', tx, y + 2);
      textRight(doc, money(t.deposit), tr, y + 2);
      y += 26;
    }

    // Notes column
    let ny = top;
    if (link) {
      const hasQr = qrBlock(doc, link, nx, ny - 8, 72);
      const lx = hasQr ? nx + 84 : nx;
      label(doc, 'Pay online with Square', lx, ny + 2);
      font(doc, 9, 'bold', p.accent);
      const linkLines = doc.splitTextToSize(clean(link), nw - (hasQr ? 84 : 0));
      linkLines.forEach((l, i) => doc.textWithLink(l, lx, ny + 16 + i * 12, { url: link }));
      let iy = ny + 16 + linkLines.length * 12 + 4;
      font(doc, 8.6, 'normal', C.muted);
      doc.splitTextToSize(clean(s.docs.paymentInstructions || ''), nw - (hasQr ? 84 : 0)).forEach((l) => { doc.text(l, lx, iy); iy += 11.4; });
      ny = Math.max(ny + 78, iy) + 12;
    } else if (isInvoice && instr.length) {
      label(doc, 'How to pay', nx, ny + 2);
      font(doc, 9, 'normal', C.body);
      instr.forEach((l, i) => doc.text(l, nx, ny + 16 + i * 12));
      ny += 16 + instr.length * 12 + 14;
    }
    if (noteLines.length) {
      label(doc, 'Notes', nx, ny + 2);
      font(doc, 9, 'normal', C.body);
      let ly = ny + 16;
      noteLines.forEach((l) => {
        if (ly > p.bottom) { newPage(p); ly = p.y; }
        doc.text(l, nx, ly);
        ly += 12;
      });
      ny = ly;
    }
    p.y = Math.max(y, ny) + 10;
  }

  async function documentPDF(kind, d) {
    const JsPDF = await lib();
    const s = NB.store.settings();
    const customer = NB.store.get('customers', d.customerId);
    const isInvoice = kind === 'invoice';
    const t = NB.calc.totals(d);
    const state = isInvoice ? NB.calc.invoiceState(d, NB.store.all('payments'), NB.util.Dates.today()) : null;
    const est = isInvoice ? null : NB.calc.estimateState(d, NB.util.Dates.today());
    const p = start(JsPDF, s, (isInvoice ? 'Invoice ' : 'Estimate ') + (d.number || ''));
    const { doc, W, M } = p;

    header(p, NB.store.logo(), isInvoice ? 'Invoice' : 'Estimate', d.number);

    const colW = 150;
    const metaX = W - M - 168;
    const yFrom = block(p, M, colW, 'From', businessRows(s));
    const yTo = block(p, M + colW + 22, colW, isInvoice ? 'Bill to' : 'Prepared for', customerRows(customer));
    const pairs = isInvoice
      ? [['Issued', date(d.issueDate)], ['Due', date(d.dueDate)]]
      : [['Issued', date(d.issueDate)], ['Valid until', date(d.validUntil)]];
    const head = isInvoice
      ? ['Balance due', money(state ? Math.max(state.balance, 0) : t.total)]
      : [t.deposit ? 'Deposit to start' : 'Total', money(t.deposit || t.total)];
    const yMeta = metaList(p, metaX, W - M, pairs, head);
    p.y = Math.max(yFrom, yTo, yMeta) + 10;

    if (d.title) {
      label(doc, 'Project', M, p.y);
      font(doc, 11.5, 'bold', C.ink);
      doc.text(doc.splitTextToSize(clean(d.title), W - 2 * M - 70), M + 58, p.y + 0.5);
      p.y += 22;
    }

    itemsTable(p, d.items || [], t.lines);
    totalsAndNotes(p, kind, d, t, state);

    if (isInvoice && state && (state.key === 'paid' || state.key === 'void')) {
      doc.setPage(1);
      stamp(p, state.key === 'paid' ? 'Paid' : 'Void', state.key === 'paid' ? C.good : C.grey, W * 0.56, 76);
    } else if (est && (est.key === 'accepted' || est.key === 'invoiced')) {
      doc.setPage(1);
      stamp(p, 'Accepted', C.good, W * 0.56, 76);
    }
    footers(p);
    return { blob: doc.output('blob'), filename: NB.util.safeFilename((d.number || kind) + ' ' + (customer ? customer.name : '')) + '.pdf' };
  }

  // ---------------------------------------------------------------- receipt

  async function receiptPDF(pay) {
    const JsPDF = await lib();
    const s = NB.store.settings();
    const customer = NB.store.get('customers', pay.customerId);
    const inv = NB.store.get('invoices', pay.invoiceId);
    const st = inv ? NB.calc.invoiceState(inv, NB.store.all('payments'), NB.util.Dates.today()) : null;
    const p = start(JsPDF, s, 'Receipt ' + (pay.receiptNumber || ''));
    const { doc, W, M } = p;

    header(p, NB.store.logo(), 'Receipt', pay.receiptNumber);

    label(doc, 'Payment received', M, p.y);
    font(doc, 30, 'bold', C.ink);
    doc.text(money(pay.amount), M, p.y + 32);
    font(doc, 10, 'normal', C.muted);
    doc.text(clean(date(pay.date, { year: 'numeric', month: 'long', day: 'numeric' }) + ' · ' + (pay.methodName || 'Payment')), M, p.y + 50);
    stamp(p, 'Received', C.good, W - M - 92, p.y + 22);
    p.y += 80;

    const colW = (W - 2 * M - 30) / 2;
    const y1 = block(p, M, colW, 'Received from', customerRows(customer));
    const y2 = block(p, M + colW + 30, colW, 'From', businessRows(s));
    p.y = Math.max(y1, y2) + 14;

    const facts = [];
    if (inv) facts.push(['Applied to', 'Invoice ' + inv.number + (inv.title ? ' · ' + inv.title : '')]);
    if (pay.memo) facts.push(['For', pay.memo]);
    if (pay.reference) facts.push(['Reference', pay.reference]);
    if (inv && st) {
      facts.push(['Invoice total', money(st.total)]);
      facts.push(['Paid to date', money(st.paid)]);
    }
    hairline(doc, M, p.y - 12, W - M);
    facts.forEach((f) => {
      label(doc, f[0], M, p.y + 2);
      font(doc, 9.6, 'normal', C.body);
      const lines = doc.splitTextToSize(clean(f[1]), W - 2 * M - 150);
      lines.forEach((l, i) => textRight(doc, l, W - M, p.y + 2 + i * 12.6));
      p.y += 12.6 * lines.length + 10;
      hairline(doc, M, p.y - 8, W - M);
    });
    if (inv && st) {
      doc.setFillColor(NB.brand.mix(p.accent, '#ffffff', 0.9));
      doc.rect(M, p.y - 6, W - 2 * M, 28, 'F');
      font(doc, 11.5, 'bold', p.accent);
      doc.text(st.balance < 0 ? 'Credit' : 'Balance remaining', M + 8, p.y + 12);
      textRight(doc, money(Math.abs(st.balance)), W - M - 8, p.y + 12);
      p.y += 40;
    }
    if (s.docs.receiptNote) {
      p.y += 8;
      font(doc, 8.8, 'normal', C.muted);
      doc.splitTextToSize(clean(s.docs.receiptNote), W - 2 * M).forEach((l) => { doc.text(l, M, p.y); p.y += 12; });
    }
    footers(p);
    return { blob: doc.output('blob'), filename: NB.util.safeFilename((pay.receiptNumber || 'Receipt') + ' ' + (customer ? customer.name : '')) + '.pdf' };
  }

  async function download(kind, rec) {
    const out = kind === 'receipt' ? await receiptPDF(rec) : await documentPDF(kind, rec);
    const saved = await NB.ui.saveFile(out.filename, out.blob, 'application/pdf');
    if (saved) NB.ui.toast('Saved ' + out.filename);
    return out;
  }

  NB.pdf = { clean, documentPDF, receiptPDF, download };
})(window.NB = window.NB || {});
