/* n0va Books · views/settings.js
 * Business details, branding, document defaults and numbering, payment methods
 * and fees, and the data tools (backup, restore, CSV, sample data). */
(function (NB) {
  'use strict';
  NB.views = NB.views || {};
  const { html, raw, out, icon, fmt } = NB.ui;
  const { Dates, Money, plural, clone, uid } = NB.util;

  const SWATCHES = [
    ['#c83672', 'Nova rose'], ['#7a4bd8', 'Nebula violet'], ['#2f5bd3', 'Night blue'], ['#0f7c80', 'Lagoon teal'],
    ['#2f7d4f', 'Fern green'], ['#c4581f', 'Ember orange'], ['#9c6a12', 'Brass'], ['#3a3555', 'Ink'],
  ];
  const CURRENCIES = ['USD', 'CAD', 'GBP', 'EUR', 'AUD', 'NZD', 'JPY', 'MXN'];

  // ---------------------------------------------------------------- backups & exports
  async function downloadBackup() {
    const json = JSON.stringify(await NB.store.exportData(), null, 1);
    const ok = await NB.ui.saveFile('n0va-books-backup-' + Dates.today() + '.json', json, 'application/json');
    if (ok) {
      NB.ui.prefs.set('lastBackup', Dates.today());
      NB.ui.toast('Backup saved');
      NB.app.renderShell();
    }
  }

  function csvFor(kind) {
    const cur = NB.store.settings().docs.currency;
    const m = (v) => Money.toInput(v || 0, cur);
    const data = NB.store.snapshot();
    const today = Dates.today();
    const ix = NB.calc.index(data, today);
    const who = new Map(data.customers.map((c) => [c.id, c]));
    const name = (id) => (who.get(id) || {}).name || '';
    if (kind === 'customers') {
      return NB.util.csv(data.customers.slice().sort((a, b) => a.name.localeCompare(b.name)), [
        { label: 'Name', value: (c) => c.name }, { label: 'Business', value: (c) => c.company },
        { label: 'Email', value: (c) => c.email }, { label: 'Phone', value: (c) => c.phone }, { label: 'Social', value: (c) => c.social },
        { label: 'Address 1', value: (c) => c.address1 }, { label: 'Address 2', value: (c) => c.address2 }, { label: 'City', value: (c) => c.city },
        { label: 'State/Province', value: (c) => c.region }, { label: 'Postal code', value: (c) => c.postal }, { label: 'Country', value: (c) => c.country },
        { label: 'Tags', value: (c) => (c.tags || []).join('; ') }, { label: 'Notes', value: (c) => c.notes },
        { label: 'Owes you', value: (c) => m((ix.byCustomer.get(c.id) || {}).open) }, { label: 'Paid to date', value: (c) => m((ix.byCustomer.get(c.id) || {}).paid) },
        { label: 'Archived', value: (c) => (c.archived ? 'yes' : '') },
      ]);
    }
    if (kind === 'invoices') {
      return NB.util.csv(data.invoices.slice().sort((a, b) => (a.seq || 0) - (b.seq || 0)), [
        { label: 'Number', value: (d) => d.number }, { label: 'Customer', value: (d) => name(d.customerId) }, { label: 'Project', value: (d) => d.title },
        { label: 'Issued', value: (d) => d.issueDate }, { label: 'Due', value: (d) => d.dueDate }, { label: 'Status', value: (d) => ix.inv.get(d.id).label },
        { label: 'Subtotal', value: (d) => m(ix.inv.get(d.id).totals.subtotal) }, { label: 'Discount', value: (d) => m(ix.inv.get(d.id).totals.discount) },
        { label: 'Shipping', value: (d) => m(ix.inv.get(d.id).totals.shipping) }, { label: 'Tax', value: (d) => m(ix.inv.get(d.id).totals.tax) },
        { label: 'Total', value: (d) => m(ix.inv.get(d.id).total) }, { label: 'Paid', value: (d) => m(ix.inv.get(d.id).paid) },
        { label: 'Balance', value: (d) => m(ix.inv.get(d.id).balance) },
      ]);
    }
    if (kind === 'estimates') {
      return NB.util.csv(data.estimates.slice().sort((a, b) => (a.seq || 0) - (b.seq || 0)), [
        { label: 'Number', value: (d) => d.number }, { label: 'Customer', value: (d) => name(d.customerId) }, { label: 'Project', value: (d) => d.title },
        { label: 'Issued', value: (d) => d.issueDate }, { label: 'Valid until', value: (d) => d.validUntil }, { label: 'Status', value: (d) => ix.est.get(d.id).label },
        { label: 'Total', value: (d) => m(ix.est.get(d.id).total) }, { label: 'Deposit', value: (d) => m(ix.est.get(d.id).totals.deposit) },
        { label: 'Invoice', value: (d) => (NB.store.get('invoices', d.invoiceId) || {}).number || '' },
      ]);
    }
    if (kind === 'expenses') return NB.expenses.expensesCSV(data.expenses);
    if (kind === 'mileage') return NB.expenses.mileageCSV(data.mileage);
    return NB.payments.exportCSV(data.payments.slice().sort((a, b) => b.date.localeCompare(a.date)));
  }

  // ---------------------------------------------------------------- logo
  function readFile(file, as) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('That file could not be read.'));
      if (as === 'text') r.readAsText(file);
      else r.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('That image could not be opened. Try a PNG or JPG.'));
      img.src = src;
    });
  }

  // Shrinks the logo to fit one record (and PDF-friendly PNG/JPEG).
  async function processLogo(file) {
    if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)) throw new Error('Choose a PNG, JPG, WebP or SVG image.');
    const img = await loadImage(await readFile(file));
    let w = img.naturalWidth || 600;
    let h = img.naturalHeight || 200;
    let scale = Math.min(1, 900 / w, 320 / h);
    for (let attempt = 0; attempt < 5; attempt++) {
      const cw = Math.max(1, Math.round(w * scale));
      const ch = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, cw, ch);
      let dataUrl;
      try {
        dataUrl = canvas.toDataURL('image/png');
      } catch (e) {
        throw new Error('This browser blocked reading that image. Try saving it as a PNG first.');
      }
      if (dataUrl.length > 190000) {
        const flat = document.createElement('canvas');
        flat.width = cw;
        flat.height = ch;
        const fctx = flat.getContext('2d');
        fctx.fillStyle = '#ffffff';
        fctx.fillRect(0, 0, cw, ch);
        fctx.drawImage(canvas, 0, 0);
        const jpg = flat.toDataURL('image/jpeg', 0.88);
        if (jpg.length <= 190000) return { dataUrl: jpg, width: cw, height: ch, name: file.name };
        scale *= 0.7;
        continue;
      }
      return { dataUrl, width: cw, height: ch, name: file.name };
    }
    throw new Error('That image is too detailed to store. Try a smaller or simpler version.');
  }

  // ---------------------------------------------------------------- sections
  function businessSection(s) {
    const b = s.business;
    const f = (name, label, value, extra) => html`<label class="field${extra && extra.wide ? ' field-wide' : ''}"><span>${label}</span>
      <input name="${name}" id="set-${name}" value="${value || ''}" ${raw((extra && extra.attrs) || '')} autocomplete="off"></label>`;
    return html`<form class="card form" id="set-business" data-section="business" novalidate>
      <header class="card-head"><h2>Business details</h2><p class="card-sub">Shown on every estimate, invoice and receipt</p></header>
      <div class="form-grid">
        ${f('name', 'Business name', b.name, { wide: true, attrs: 'required' })}
        ${f('owner', 'Your name (signs your messages)', b.owner)}
        ${f('email', 'Email', b.email, { attrs: 'type="email" inputmode="email"' })}
        ${f('phone', 'Phone', b.phone, { attrs: 'type="tel" inputmode="tel"' })}
        ${f('website', 'Website or shop link', b.website)}
        ${f('social', 'Instagram or other social', b.social)}
        ${f('taxId', 'Tax or seller’s permit number (optional)', b.taxId)}
        <label class="field field-wide"><span>Address, as it should appear on documents</span>
          <textarea name="address" id="set-address" rows="3" placeholder="Street&#10;City, State ZIP">${b.address || ''}</textarea></label>
      </div>
      <div class="form-actions"><button type="submit" class="btn btn-primary">Save business details</button></div>
    </form>`;
  }

  function brandPreview(s, logo) {
    return html`<div class="brand-preview" style="--sheet-accent:${NB.brand.accentTokens(s.brand.color).sheet}">
      <div class="sh-head">
        <div class="sh-brand">${raw(NB.brand.lockup(s, logo, 'sheet'))}</div>
        <div class="sh-title"><div class="sh-kind">Invoice</div><div class="sh-num">${s.numbering.invoice.prefix}${'0'.repeat(Math.max(0, (s.numbering.pad || 4) - 1))}1</div></div>
      </div>
      <p class="brand-preview-foot">${s.brand.footer || ''}</p>
    </div>`;
  }

  function brandSection(s, logo) {
    const mode = s.brand.logoMode;
    const color = s.brand.color;
    const opt = (value, title, sub) => html`<label class="choice">
      <input type="radio" name="logoMode" value="${value}" ${mode === value ? raw('checked') : ''}>
      <span class="choice-body"><strong>${title}</strong><span>${sub}</span></span></label>`;
    return html`<form class="card form" id="set-brand" data-section="brand" novalidate>
      <header class="card-head"><h2>Logo and colors</h2><p class="card-sub">How your brand looks in the app and on documents</p></header>
      <div class="brand-grid">
        <div class="brand-controls">
          <fieldset class="field field-wide"><legend>Logo</legend>
            <div class="choices">
              ${opt('wordmark', 'The n0va wordmark', 'The 0 is a ring holding a star')}
              ${opt('image', 'Your own logo', logo ? 'Using ' + (logo.name || 'your image') : 'Upload a PNG, JPG or SVG')}
              ${opt('text', 'Business name in text', s.business.name)}
            </div>
            <div class="logo-tools">
              <input type="file" id="logo-file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>
              <button type="button" class="btn btn-quiet btn-sm" data-act="logo-upload">${icon('upload')}<span>${logo ? 'Replace logo' : 'Upload logo'}</span></button>
              ${logo ? html`<button type="button" class="btn btn-quiet btn-sm" data-act="logo-remove">${icon('trash')}<span>Remove logo</span></button>` : ''}
            </div>
          </fieldset>
          <fieldset class="field field-wide"><legend>Brand color</legend>
            <div class="swatches">${SWATCHES.map((sw) => html`<label class="swatch" title="${sw[1]}">
              <input type="radio" name="swatch" value="${sw[0]}" ${sw[0].toLowerCase() === color.toLowerCase() ? raw('checked') : ''} aria-label="${sw[1]}">
              <span style="background:${sw[0]}"></span></label>`)}
              <label class="swatch swatch-custom" title="Pick any color"><input type="color" id="set-color-picker" value="${color}" aria-label="Pick any color"></label>
            </div>
            <label class="field field-inline"><span>Hex</span><input name="color" id="set-color" class="mono" value="${color}" maxlength="7" autocomplete="off"></label>
          </fieldset>
          <label class="field field-wide"><span>Thank-you line at the bottom of documents</span>
            <input name="footer" id="set-footer" value="${s.brand.footer || ''}" autocomplete="off"></label>
        </div>
        <div class="brand-side"><p class="sh-label">Preview</p><div data-brand-preview>${brandPreview(s, logo)}</div></div>
      </div>
      <div class="form-actions"><button type="submit" class="btn btn-primary">Save logo and colors</button></div>
    </form>`;
  }

  function docsSection(s) {
    const d = s.docs;
    const n = s.numbering;
    const currencies = CURRENCIES.includes(d.currency) ? CURRENCIES : CURRENCIES.concat([d.currency]);
    const numRow = (kind, label) => html`<div class="num-row">
      <span class="num-row-label">${label}</span>
      <label class="field"><span>Prefix</span><input name="${kind}Prefix" id="set-${kind}-prefix" class="mono" value="${n[kind].prefix}" maxlength="12" autocomplete="off"></label>
      <label class="field"><span>Next number</span><input name="${kind}Next" id="set-${kind}-next" class="num" inputmode="numeric" value="${NB.store.peekNumber(kind).seq}"
        data-initial="${NB.store.peekNumber(kind).seq}" autocomplete="off"></label>
      <span class="num-row-sample mono" data-sample="${kind}">${NB.store.peekNumber(kind).number}</span>
    </div>`;
    return html`<form class="card form" id="set-docs" data-section="docs" novalidate>
      <header class="card-head"><h2>Estimates and invoices</h2><p class="card-sub">Defaults for every new document</p></header>
      <div class="form-grid">
        <label class="field"><span>Currency</span><select name="currency" id="set-currency">${currencies.map((c) => html`<option ${c === d.currency ? raw('selected') : ''}>${c}</option>`)}</select></label>
        <label class="field"><span>Paper size</span><select name="paper" id="set-paper">
          <option value="letter" ${d.paper !== 'a4' ? raw('selected') : ''}>US Letter</option><option value="a4" ${d.paper === 'a4' ? raw('selected') : ''}>A4</option></select></label>
        <label class="field"><span>Invoices are due after (days)</span><input name="invoiceDays" id="set-invoice-days" class="num" inputmode="numeric" value="${d.invoiceDays}"></label>
        <label class="field"><span>Estimates are valid for (days)</span><input name="estimateDays" id="set-estimate-days" class="num" inputmode="numeric" value="${d.estimateDays}"></label>
        <label class="field"><span>Deposit asked on estimates (%)</span><input name="depositPercent" id="set-deposit" class="num" inputmode="decimal" value="${fmt.qtyInput(d.depositPercent)}"></label>
      </div>
      <h3 class="form-sub">Numbering</h3>
      <p class="hint">Numbers only go up, so a number is never used twice. To start at 1001, set the next number to 1001.</p>
      <div class="num-rows">${numRow('estimate', 'Estimates')}${numRow('invoice', 'Invoices')}${numRow('receipt', 'Receipts')}</div>
      <h3 class="form-sub">Wording</h3>
      <div class="form-grid">
        <label class="field field-wide"><span>Default notes on estimates</span><textarea name="estimateNotes" id="set-est-notes" rows="3">${d.estimateNotes}</textarea></label>
        <label class="field field-wide"><span>Default notes on invoices</span><textarea name="invoiceNotes" id="set-inv-notes" rows="2">${d.invoiceNotes}</textarea></label>
        <label class="field field-wide"><span>How customers can pay (printed on invoices)</span><textarea name="paymentInstructions" id="set-pay-instr" rows="2">${d.paymentInstructions}</textarea></label>
        <label class="field field-wide"><span>Default Square payment link (optional)</span>
          <input type="url" name="paymentLink" id="set-pay-link" value="${d.paymentLink}" placeholder="https://square.link/u/…" autocomplete="off">
          <span class="hint">Added to new invoices. You can still paste a different link on each invoice.</span></label>
        <label class="field field-wide"><span>Note on receipts</span><textarea name="receiptNote" id="set-receipt-note" rows="2">${d.receiptNote}</textarea></label>
      </div>
      <div class="form-actions"><button type="submit" class="btn btn-primary">Save document settings</button></div>
    </form>`;
  }

  function methodRow(m, i) {
    return html`<div class="method-row" data-method="${i}">
      <label class="field method-name"><span>Name</span><input data-mf="name" value="${m.name}" autocomplete="off" aria-label="Method ${i + 1} name"></label>
      <label class="field"><span>Fee %</span><input data-mf="feePercent" class="num" inputmode="decimal" value="${fmt.qtyInput(m.feePercent)}" aria-label="Method ${i + 1} percent fee"></label>
      <label class="field"><span>+ fixed</span><input data-mf="feeFixed" class="num" inputmode="decimal" value="${fmt.input(m.feeFixed)}" aria-label="Method ${i + 1} fixed fee"></label>
      <label class="field"><span>Minimum</span><input data-mf="feeMin" class="num" inputmode="decimal" value="${fmt.input(m.feeMin)}" aria-label="Method ${i + 1} minimum fee"></label>
      <button type="button" class="btn btn-icon btn-quiet btn-sm" data-act="method-remove" aria-label="Remove ${m.name}">${icon('x')}</button>
    </div>`;
  }

  function methodsSection(s) {
    return html`<form class="card form" id="set-methods" data-section="methods" novalidate>
      <header class="card-head"><h2>Payment methods and fees</h2><p class="card-sub">Used to estimate the processing fee on each payment</p></header>
      <p class="hint">Defaults are Square's US rates on the Free plan as of January 2026. If you're on Square Plus or Premium, or outside the US, change them to match your plan.</p>
      <div class="methods" data-methods>${s.paymentMethods.map(methodRow)}</div>
      <div class="form-actions form-actions-split">
        <div class="btn-row">
          <button type="button" class="btn btn-quiet btn-sm" data-act="method-add">${icon('plus')}<span>Add method</span></button>
          <button type="button" class="btn btn-quiet btn-sm" data-act="method-reset">${icon('undo')}<span>Reset to Square's rates</span></button>
        </div>
        <button type="submit" class="btn btn-primary">Save payment methods</button>
      </div>
    </form>`;
  }

  function profileRow(p, i) {
    return html`<div class="profile-row" data-profile="${i}">
      <label class="field profile-name"><span>Name</span>
        <input data-pf="name" value="${p.name}" placeholder="Arizona: Tucson" autocomplete="off" aria-label="Profile ${i + 1} name"></label>
      <label class="field"><span>Rate (%)</span>
        <input data-pf="rate" class="num" inputmode="decimal" value="${fmt.qtyInput(p.rate)}" autocomplete="off" aria-label="Profile ${i + 1} rate"></label>
      <label class="check profile-ship"><input type="checkbox" data-pf="taxShipping" ${p.taxShipping ? 'checked' : ''}><span>Tax shipping</span></label>
      <button type="button" class="btn btn-icon btn-quiet btn-sm" data-act="profile-remove" aria-label="Remove ${p.name || 'this profile'}">${icon('x')}</button>
      <label class="field profile-note"><span>Note to yourself</span>
        <input data-pf="note" value="${p.note || ''}" placeholder="Where it applies, when you last checked the rate" autocomplete="off" aria-label="Profile ${i + 1} note"></label>
    </div>`;
  }

  function defaultProfileOptions(list, selected) {
    return html`<option value="">No sales tax</option>
      ${list.map((p) => html`<option value="${p.id}" ${p.id === selected ? raw('selected') : ''}>${p.name || 'Unnamed profile'}</option>`)}`;
  }

  function taxSection(s) {
    return html`<form class="card form" id="set-tax" data-section="tax" novalidate>
      <header class="card-head"><h2>Sales tax profiles</h2><p class="card-sub">Saved rates to pick on estimates, invoices and market sales</p></header>
      <p class="hint">The rate depends on where you make the sale. Arizona adds county and city rates on top of its 5.6% state rate; Oregon has no sales tax. Check your state’s rate lookup and update these when rates change. Documents you already made keep the rate they were made with.</p>
      <div class="profiles" data-profiles>${s.taxProfiles.map(profileRow)}</div>
      <div class="form-grid tax-defaults">
        <label class="field"><span>Use on new estimates and invoices</span>
          <select name="defaultTaxProfileId" id="set-default-profile">${defaultProfileOptions(s.taxProfiles, s.docs.defaultTaxProfileId)}</select>
          <span class="hint">A customer’s own profile is used first.</span></label>
        <label class="field"><span>Name printed on documents</span>
          <input name="taxLabel" id="set-tax-label" value="${s.docs.taxLabel}" placeholder="Sales tax" autocomplete="off">
          <span class="hint">Shown next to the tax amount, as in “Sales tax (8.7%)”.</span></label>
      </div>
      <div class="form-actions form-actions-split">
        <button type="button" class="btn btn-quiet btn-sm" data-act="profile-add">${icon('plus')}<span>Add profile</span></button>
        <button type="submit" class="btn btn-primary">Save tax profiles</button>
      </div>
    </form>`;
  }

  function rateRow(r, i) {
    return html`<div class="rate-row" data-rate="${i}">
      <label class="field"><span>Starting</span><input type="date" data-rf="from" value="${r.from}" aria-label="Rate ${i + 1} start date"></label>
      <label class="field"><span>Cents per mile</span>
        <input data-rf="cents" class="num" inputmode="decimal" value="${fmt.qtyInput(r.cents)}" autocomplete="off" aria-label="Rate ${i + 1} cents per mile"></label>
      <button type="button" class="btn btn-icon btn-quiet btn-sm" data-act="rate-remove" aria-label="Remove the rate starting ${r.from}">${icon('x')}</button>
    </div>`;
  }

  function mileageSection(s) {
    const rates = s.mileageRates.slice().sort((a, b) => b.from.localeCompare(a.from));
    return html`<form class="card form" id="set-mileage" data-section="mileage" novalidate>
      <header class="card-head"><h2>Mileage rates</h2><p class="card-sub">The IRS standard rate for business driving</p></header>
      <p class="hint">Each rate applies from its date until the next one. For 2026 the IRS set 72.5¢ a mile, then raised it to 76¢ from July 1. Add a line when the IRS announces a new rate, usually in December.</p>
      <div class="rates" data-rates>${rates.map(rateRow)}</div>
      <div class="form-actions form-actions-split">
        <div class="btn-row">
          <button type="button" class="btn btn-quiet btn-sm" data-act="rate-add">${icon('plus')}<span>Add rate</span></button>
          <button type="button" class="btn btn-quiet btn-sm" data-act="rate-reset">${icon('undo')}<span>Reset to IRS rates</span></button>
        </div>
        <button type="submit" class="btn btn-primary">Save mileage rates</button>
      </div>
    </form>`;
  }

  function dataSection() {
    const st = NB.store;
    const counts = st.snapshot();
    const last = NB.ui.prefs.get('lastBackup');
    const where = st.mode === 'cloud'
      ? html`${icon('cloud')}<p>Your books are saved to this app's private database on your claude.ai account. They're there on any device where you sign in, and only you and people you give edit access can see them.</p>`
      : st.mode === 'local'
        ? html`${icon('device')}<p>Your books are saved in this browser on this device. Clearing the browser's site data deletes them, so download a backup regularly and keep it somewhere safe, like a cloud drive.</p>`
        : html`${icon('alert')}<p><strong>Nothing is being saved.</strong> This browser is blocking storage. Download a backup before closing the tab.</p>`;
    return html`<section class="card" id="set-data" data-section="data">
      <header class="card-head"><h2>Backup and your data</h2><p class="card-sub">${plural(counts.customers.length, 'customer')} · ${plural(counts.invoices.length, 'invoice')} · ${plural(counts.payments.length, 'payment')} · ${plural(counts.expenses.length, 'expense')} · ${plural(counts.mileage.length, 'trip')}</p></header>
      <div class="where">${where}</div>
      <div class="data-actions">
        <div class="data-action"><div><strong>Download a backup</strong><p>One file with everything: customers, documents, payments, expenses, trips, receipt photos, settings and logo.${last ? ' Last backup on this device: ' + fmt.date(last) + '.' : ''}</p></div>
          <button type="button" class="btn btn-primary btn-sm" data-act="backup">${icon('download')}<span>Download backup</span></button></div>
        <div class="data-action"><div><strong>Restore from a backup</strong><p>Replaces everything here with the contents of a backup file.</p></div>
          <input type="file" id="restore-file" accept="application/json,.json" hidden>
          <button type="button" class="btn btn-quiet btn-sm" data-act="restore">${icon('upload')}<span>Choose backup file</span></button></div>
        <div class="data-action"><div><strong>Spreadsheets for your accountant</strong><p>CSV files open in Excel, Numbers and Google Sheets.</p></div>
          <div class="btn-row">
            <button type="button" class="btn btn-quiet btn-sm" data-csv="customers">Customers</button>
            <button type="button" class="btn btn-quiet btn-sm" data-csv="estimates">Estimates</button>
            <button type="button" class="btn btn-quiet btn-sm" data-csv="invoices">Invoices</button>
            <button type="button" class="btn btn-quiet btn-sm" data-csv="payments">Payments</button>
            <button type="button" class="btn btn-quiet btn-sm" data-csv="expenses">Expenses</button>
            <button type="button" class="btn btn-quiet btn-sm" data-csv="mileage">Mileage log</button>
          </div></div>
        <div class="data-action"><div><strong>Sample data</strong><p>${st.hasSample() ? 'Example customers, documents, payments and expenses are loaded.' : 'Load example customers, estimates, invoices, payments and expenses to explore.'}</p></div>
          ${st.hasSample()
            ? html`<button type="button" class="btn btn-quiet btn-sm" data-clear-sample>Remove sample data</button>`
            : html`<button type="button" class="btn btn-quiet btn-sm" data-act="sample">${icon('spark')}<span>Load sample data</span></button>`}</div>
        <div class="data-action data-danger"><div><strong>Erase everything</strong><p>Deletes all customers, documents, payments, expenses, receipt photos and settings in this copy of the app.</p></div>
          <button type="button" class="btn btn-danger btn-sm" data-act="erase">${icon('trash')}<span>Erase everything</span></button></div>
      </div>
    </section>`;
  }

  // ---------------------------------------------------------------- page
  function sectionNav() {
    const items = [['set-business', 'Business details'], ['set-brand', 'Logo and colors'], ['set-docs', 'Estimates and invoices'], ['set-tax', 'Sales tax profiles'],
      ['set-methods', 'Payment methods'], ['set-mileage', 'Mileage rates'], ['set-data', 'Backup and data']];
    return html`<nav class="settings-nav" aria-label="Settings sections">${items.map((i) => html`<button type="button" data-jump="${i[0]}">${i[1]}</button>`)}</nav>`;
  }

  NB.views.settings = {
    title: 'Settings',
    live: false,
    render(root) {
      const s = NB.store.settings();
      const logo = NB.store.logo();
      root.innerHTML = out(html`<div class="page page-settings">
        <header class="page-head"><div><h1>Settings</h1><p class="page-sub">Your business, your brand and how your books work</p></div></header>
        <div class="settings">
          ${sectionNav()}
          <div class="settings-body">
            ${businessSection(s)}
            ${brandSection(s, logo)}
            ${docsSection(s)}
            ${taxSection(s)}
            ${methodsSection(s)}
            ${mileageSection(s)}
            <div data-data-section>${dataSection()}</div>
          </div>
        </div>
      </div>`);
      bind(root);
    },
  };

  function rerenderData(root) {
    const box = root.querySelector('[data-data-section]');
    if (box) box.innerHTML = out(dataSection());
  }

  function bind(root) {
    const brandForm = root.querySelector('#set-brand');
    let methods = clone(NB.store.settings().paymentMethods);
    let profiles = clone(NB.store.settings().taxProfiles);
    let rates = clone(NB.store.settings().mileageRates).sort((a, b) => b.from.localeCompare(a.from));
    const renderProfiles = () => {
      root.querySelector('[data-profiles]').innerHTML = out(profiles.map(profileRow));
      refreshDefault();
    };
    const refreshDefault = () => {
      const sel = root.querySelector('#set-default-profile');
      const keep = sel.value;
      sel.innerHTML = out(defaultProfileOptions(profiles, keep));
      sel.value = profiles.some((p) => p.id === keep) ? keep : '';
    };
    const renderRates = () => {
      root.querySelector('[data-rates]').innerHTML = out(rates.map(rateRow));
    };

    const brandState = () => {
      const s = clone(NB.store.settings());
      const v = NB.ui.formValues(brandForm);
      s.brand.logoMode = v.logoMode || s.brand.logoMode;
      s.brand.color = /^#[0-9a-f]{6}$/i.test(v.color) ? v.color : s.brand.color;
      s.brand.footer = v.footer;
      return s;
    };
    const refreshPreview = () => {
      root.querySelector('[data-brand-preview]').innerHTML = out(brandPreview(brandState(), NB.store.logo()));
    };
    const refreshSamples = () => {
      const f = root.querySelector('#set-docs');
      ['estimate', 'invoice', 'receipt'].forEach((k) => {
        const prefix = f.querySelector('#set-' + k + '-prefix').value;
        const next = parseInt(f.querySelector('#set-' + k + '-next').value, 10) || 1;
        f.querySelector('[data-sample="' + k + '"]').textContent = prefix + String(next).padStart(NB.store.settings().numbering.pad || 4, '0');
      });
    };
    const renderMethods = () => {
      root.querySelector('[data-methods]').innerHTML = out(methods.map(methodRow));
    };

    root.oninput = (e) => {
      const el = e.target;
      if (el.closest('#set-brand')) {
        if (el.id === 'set-color-picker') {
          root.querySelector('#set-color').value = el.value;
          root.querySelectorAll('input[name="swatch"]').forEach((r) => { r.checked = r.value.toLowerCase() === el.value.toLowerCase(); });
        }
        refreshPreview();
      }
      if (el.closest('#set-docs') && /-(prefix|next)$/.test(el.id)) refreshSamples();
      const prow = el.closest('[data-profile]');
      if (prow && el.dataset.pf && el.dataset.pf !== 'taxShipping') {
        const pr = profiles[+prow.dataset.profile];
        if (el.dataset.pf === 'rate') pr.rate = Math.max(0, NB.ui.num(el.value));
        else pr[el.dataset.pf] = el.value;
        if (el.dataset.pf === 'name') refreshDefault();
      }
      const rrow = el.closest('[data-rate]');
      if (rrow && el.dataset.rf) {
        const r = rates[+rrow.dataset.rate];
        if (el.dataset.rf === 'cents') r.cents = Math.max(0, NB.ui.num(el.value));
        else r.from = el.value;
      }
      const row = el.closest('[data-method]');
      if (row && el.dataset.mf) {
        const m = methods[+row.dataset.method];
        const f = el.dataset.mf;
        if (f === 'name') m.name = el.value;
        else if (f === 'feePercent') m.feePercent = Math.max(0, NB.ui.num(el.value));
        else { const v = fmt.parse(el.value); m[f] = isNaN(v) ? 0 : Math.max(0, v); }
      }
    };

    root.onchange = async (e) => {
      const el = e.target;
      if (el.dataset && el.dataset.pf === 'taxShipping') {
        profiles[+el.closest('[data-profile]').dataset.profile].taxShipping = el.checked;
        return;
      }
      if (el.name === 'swatch') {
        root.querySelector('#set-color').value = el.value;
        root.querySelector('#set-color-picker').value = el.value;
        refreshPreview();
      } else if (el.name === 'logoMode') {
        if (el.value === 'image' && !NB.store.logo()) root.querySelector('#logo-file').click();
        refreshPreview();
      } else if (el.id === 'logo-file' && el.files && el.files[0]) {
        const file = el.files[0];
        el.value = '';
        await NB.ui.busy(root.querySelector('[data-act="logo-upload"]'), async () => {
          const logo = await processLogo(file);
          await NB.store.setLogo(logo);
          await NB.store.saveSettings({ brand: { logoMode: 'image' } });
          NB.ui.toast('Logo saved');
          NB.views.settings.render(root);
        });
      } else if (el.id === 'restore-file' && el.files && el.files[0]) {
        const file = el.files[0];
        el.value = '';
        restore(root, file);
      }
    };

    root._focusout = (e) => {
      const row = e.target.closest && e.target.closest('[data-method]');
      if (row && (e.target.dataset.mf === 'feeFixed' || e.target.dataset.mf === 'feeMin')) {
        e.target.value = fmt.input(methods[+row.dataset.method][e.target.dataset.mf]);
      }
    };

    root.onclick = async (e) => {
      const jump = e.target.closest('[data-jump]');
      if (jump) {
        const target = root.querySelector('#' + jump.dataset.jump);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const csv = e.target.closest('[data-csv]');
      if (csv) {
        NB.ui.busy(csv, async () => {
          const ok = await NB.ui.saveFile(csv.dataset.csv + '-' + Dates.today() + '.csv', csvFor(csv.dataset.csv), 'text/csv');
          if (ok) NB.ui.toast('Exported ' + csv.dataset.csv);
        });
        return;
      }
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'logo-upload') root.querySelector('#logo-file').click();
      else if (act === 'logo-remove') {
        await NB.ui.busy(b, async () => {
          await NB.store.setLogo(null);
          if (NB.store.settings().brand.logoMode === 'image') await NB.store.saveSettings({ brand: { logoMode: 'wordmark' } });
          NB.ui.toast('Logo removed');
          NB.views.settings.render(root);
        });
      } else if (act === 'profile-add') {
        profiles.push({ id: uid(), name: '', rate: 0, taxShipping: false, note: '' });
        renderProfiles();
        const names = root.querySelectorAll('[data-profile] [data-pf="name"]');
        names[names.length - 1].focus();
      } else if (act === 'profile-remove') {
        profiles.splice(+b.closest('[data-profile]').dataset.profile, 1);
        renderProfiles();
      } else if (act === 'rate-add') {
        rates.unshift({ from: Dates.today(), cents: rates.length ? rates[0].cents : 0 });
        renderRates();
        root.querySelector('[data-rate="0"] [data-rf="cents"]').focus();
      } else if (act === 'rate-remove') {
        if (rates.length <= 1) { NB.ui.toast('Keep at least one mileage rate.'); return; }
        rates.splice(+b.closest('[data-rate]').dataset.rate, 1);
        renderRates();
      } else if (act === 'rate-reset') {
        rates = clone(NB.tax.MILEAGE_RATES).sort((a, c) => c.from.localeCompare(a.from));
        renderRates();
        NB.ui.toast('IRS rates restored. Save to keep them.');
      } else if (act === 'method-add') {
        methods.push({ id: uid(), name: '', feePercent: 0, feeFixed: 0, feeMin: 0 });
        renderMethods();
        const rows = root.querySelectorAll('[data-method] [data-mf="name"]');
        rows[rows.length - 1].focus();
      } else if (act === 'method-remove') {
        if (methods.length <= 1) { NB.ui.toast('Keep at least one payment method.'); return; }
        methods.splice(+b.closest('[data-method]').dataset.method, 1);
        renderMethods();
      } else if (act === 'method-reset') {
        methods = clone(NB.store.DEFAULT_METHODS);
        renderMethods();
        NB.ui.toast("Square's rates restored. Save to keep them.");
      } else if (act === 'backup') NB.ui.busy(b, downloadBackup);
      else if (act === 'restore') root.querySelector('#restore-file').click();
      else if (act === 'sample') {
        NB.ui.busy(b, async () => {
          await NB.store.loadSample();
          NB.ui.toast('Sample data loaded');
          rerenderData(root);
        });
      } else if (act === 'erase') {
        const ok = await NB.ui.confirm({
          title: 'Erase everything?',
          message: 'This deletes every customer, estimate, invoice, payment and setting in this copy of the app. Download a backup first if you might want any of it back.',
          confirm: 'Erase everything',
          danger: true,
          typed: 'ERASE',
        });
        if (!ok) return;
        await NB.ui.busy(b, async () => {
          await NB.store.eraseAll();
          NB.ui.toast('Everything was erased');
          NB.app.go('dashboard', {}, { replace: true });
        });
      }
    };

    root.onsubmit = async (e) => {
      e.preventDefault();
      const form = e.target;
      const v = NB.ui.formValues(form);
      const button = form.querySelector('[type="submit"]');
      const section = form.dataset.section;
      if (section === 'business') {
        if (!v.name.trim()) return NB.ui.fieldError(form, 'name', 'Your business name appears on every document.');
        if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) return NB.ui.fieldError(form, 'email', 'This email address looks incomplete.');
        await NB.ui.busy(button, async () => {
          const b = {};
          ['name', 'owner', 'email', 'phone', 'website', 'social', 'taxId', 'address'].forEach((k) => { b[k] = (v[k] || '').trim(); });
          await NB.store.saveSettings({ business: b });
          NB.ui.toast('Business details saved');
        });
      } else if (section === 'brand') {
        if (!/^#[0-9a-f]{6}$/i.test(v.color)) return NB.ui.fieldError(form, 'color', 'Use a six-digit hex color like #c83672.');
        if (v.logoMode === 'image' && !NB.store.logo()) { NB.ui.toast('Upload a logo first, or pick another logo style.', 'error'); return; }
        await NB.ui.busy(button, async () => {
          await NB.store.saveSettings({ brand: { logoMode: v.logoMode, color: v.color.toLowerCase(), footer: v.footer.trim() } });
          NB.ui.toast('Logo and colors saved');
        });
      } else if (section === 'docs') {
        // A next number is only stored when it was changed here, so numbers used by
        // sample data don't become a permanent floor once the samples are removed.
        const numbering = {};
        const changed = [];
        for (const k of ['estimate', 'invoice', 'receipt']) {
          const nextEl = form.querySelector('#set-' + k + '-next');
          const next = parseInt(v[k + 'Next'], 10);
          if (!(next >= 1)) return NB.ui.fieldError(form, k + 'Next', 'Use a whole number of 1 or more.');
          const prefix = v[k + 'Prefix'];
          if (/[^\w\-./# ]/.test(prefix)) return NB.ui.fieldError(form, k + 'Prefix', 'Use letters, numbers, dashes, dots or slashes.');
          numbering[k] = { prefix };
          if (String(next) !== nextEl.dataset.initial) {
            numbering[k].start = next;
            changed.push(k);
          }
        }
        if (v.paymentLink && !/^https?:\/\/\S+$/i.test(v.paymentLink.trim())) return NB.ui.fieldError(form, 'paymentLink', 'Paste the full link, starting with https://');
        await NB.ui.busy(button, async () => {
          await NB.store.saveSettings({
            docs: {
              currency: v.currency, paper: v.paper,
              invoiceDays: Math.max(0, parseInt(v.invoiceDays, 10) || 0),
              estimateDays: Math.max(0, parseInt(v.estimateDays, 10) || 0),
              depositPercent: Math.min(100, Math.max(0, NB.ui.num(v.depositPercent))),
              estimateNotes: v.estimateNotes.trim(), invoiceNotes: v.invoiceNotes.trim(),
              paymentInstructions: v.paymentInstructions.trim(), paymentLink: v.paymentLink.trim(), receiptNote: v.receiptNote.trim(),
            },
            numbering,
          });
          const capped = changed.filter((k) => NB.store.peekNumber(k).seq !== numbering[k].start);
          NB.ui.toast(capped.length ? 'Saved. Some next numbers stay higher because those numbers were already used.' : 'Document settings saved');
          NB.views.settings.render(root);
          root.querySelector('#set-docs').scrollIntoView({ block: 'start' });
        });
      } else if (section === 'tax') {
        for (let i = 0; i < profiles.length; i++) {
          const p = profiles[i];
          p.name = (p.name || '').trim();
          p.note = (p.note || '').trim();
          const nameEl = root.querySelectorAll('[data-profile] [data-pf="name"]')[i];
          if (!p.name) { NB.ui.toast('Give every tax profile a name.', 'error'); nameEl.focus(); return; }
          if (!(p.rate >= 0 && p.rate <= 25)) {
            NB.ui.toast(p.name + ': use a rate between 0% and 25%.', 'error');
            root.querySelectorAll('[data-profile] [data-pf="rate"]')[i].focus();
            return;
          }
        }
        await NB.ui.busy(button, async () => {
          const def = profiles.some((p) => p.id === v.defaultTaxProfileId) ? v.defaultTaxProfileId : '';
          await NB.store.saveSettings({ taxProfiles: profiles, docs: { defaultTaxProfileId: def, taxLabel: (v.taxLabel || '').trim() || 'Sales tax' } });
          NB.ui.toast('Tax profiles saved');
        });
      } else if (section === 'mileage') {
        const seen = new Set();
        for (let i = 0; i < rates.length; i++) {
          const r = rates[i];
          const at = (f) => root.querySelectorAll('[data-rate] [data-rf="' + f + '"]')[i];
          if (!Dates.valid(r.from)) { NB.ui.toast('Choose a start date for every rate.', 'error'); at('from').focus(); return; }
          if (seen.has(r.from)) { NB.ui.toast('Two rates start on ' + fmt.date(r.from) + '. Keep one.', 'error'); at('from').focus(); return; }
          if (!(r.cents > 0 && r.cents < 500)) { NB.ui.toast('Use cents per mile, like 72.5.', 'error'); at('cents').focus(); return; }
          seen.add(r.from);
        }
        await NB.ui.busy(button, async () => {
          await NB.store.saveSettings({ mileageRates: rates.slice().sort((a, c) => a.from.localeCompare(c.from)) });
          NB.ui.toast('Mileage rates saved');
        });
      } else if (section === 'methods') {
        const clean = methods.map((m) => Object.assign(m, { name: (m.name || '').trim() }));
        const blank = clean.findIndex((m) => !m.name);
        if (blank > -1) {
          const el = root.querySelectorAll('[data-method] [data-mf="name"]')[blank];
          NB.ui.toast('Give every payment method a name.', 'error');
          if (el) el.focus();
          return;
        }
        await NB.ui.busy(button, async () => {
          await NB.store.saveSettings({ paymentMethods: clean });
          NB.ui.toast('Payment methods saved');
        });
      }
    };
  }

  async function restore(root, file) {
    let json;
    try {
      json = JSON.parse(await readFile(file, 'text'));
    } catch (e) {
      NB.ui.toast("That file isn't a backup made by n0va Books.", 'error');
      return;
    }
    let counts;
    try {
      counts = NB.store.readBackup(json);
    } catch (e) {
      NB.ui.toast(e.message, 'error');
      return;
    }
    const ok = await NB.ui.confirm({
      title: 'Restore this backup?',
      message: 'It has ' + plural(counts.customers, 'customer') + ', ' + plural(counts.estimates, 'estimate') + ', ' + plural(counts.invoices, 'invoice') + ', ' +
        plural(counts.payments, 'payment') + ', ' + plural(counts.expenses, 'expense') + ' and ' + plural(counts.mileage, 'trip') + (json.exportedAt ? ', saved ' + fmt.date(String(json.exportedAt).slice(0, 10)) : '') +
        '. Everything currently here will be replaced.',
      confirm: 'Replace with backup',
      danger: true,
    });
    if (!ok) return;
    await NB.ui.busy(null, async () => {
      const { missingFiles } = await NB.store.importData(json);
      NB.ui.toast(missingFiles ? 'Backup restored, but ' + plural(missingFiles, 'receipt file') + ' couldn’t be stored here' : 'Backup restored',
        missingFiles ? 'error' : undefined);
      NB.views.settings.render(root);
    });
  }

  NB.settings = { downloadBackup, csvFor, processLogo };
})(window.NB = window.NB || {});
