/* n0va Books · views/customers.js
 * Customer list, profile (contact details, balances, history) and the edit form. */
(function (NB) {
  'use strict';
  NB.views = NB.views || {};
  const { html, raw, out, icon, fmt, link, pill, empty, avatar } = NB.ui;
  const { Dates, matches, plural } = NB.util;

  const listState = { q: '', archived: false };

  function blankCustomer() {
    return { name: '', company: '', email: '', phone: '', social: '', address1: '', address2: '', city: '', region: '', postal: '', country: '', tags: [], notes: '', archived: false };
  }

  function tagsFrom(text) {
    const seen = new Set();
    return String(text || '').split(',').map((t) => t.trim()).filter((t) => {
      const k = t.toLowerCase();
      if (!t || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  function notFound(what, back) {
    return out(html`<div class="page"><div class="empty">
      <span class="empty-mark">${icon('spark')}</span>
      <p class="empty-title">${what} not found</p>
      <p class="empty-body">It may have been deleted.</p>
      ${link(back, {}, 'Go back', 'class="btn btn-quiet"')}</div></div>`);
  }

  // ---------------------------------------------------------------- list
  NB.views.customers = {
    title: 'Customers',
    render(root) {
      root.innerHTML = out(html`<div class="page">
        <header class="page-head">
          <div><h1>Customers</h1><p class="page-sub" data-count></p></div>
          <div class="head-actions">${link('customer-edit', {}, html`${icon('plus')}<span>Add customer</span>`, 'class="btn btn-primary"')}</div>
        </header>
        <div class="toolbar">
          <label class="search">${icon('search')}<input type="search" id="customer-search" value="${listState.q}"
            placeholder="Search name, email, phone or tag" aria-label="Search customers" autocomplete="off"></label>
          <label class="check"><input type="checkbox" id="customer-archived" ${listState.archived ? 'checked' : ''}><span>Show archived</span></label>
        </div>
        <div data-results></div>
      </div>`);
      root.oninput = (e) => {
        if (e.target.id === 'customer-search') {
          listState.q = e.target.value;
          NB.views.customers.update(root);
        }
      };
      root.onchange = (e) => {
        if (e.target.id === 'customer-archived') {
          listState.archived = e.target.checked;
          NB.views.customers.update(root);
        }
      };
      NB.views.customers.update(root);
    },
    update(root) {
      const box = root.querySelector('[data-results]');
      if (!box) return NB.views.customers.render(root);
      const data = NB.store.snapshot();
      const ix = NB.calc.index(data, Dates.today());
      const all = data.customers;
      const list = all
        .filter((c) => listState.archived || !c.archived)
        .filter((c) => matches(listState.q, [c.name, c.company, c.email, c.phone, c.social, c.city, (c.tags || []).join(' ')]))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      const active = all.filter((c) => !c.archived).length;
      root.querySelector('[data-count]').textContent = plural(active, 'customer') + (all.length > active ? ' · ' + (all.length - active) + ' archived' : '');

      if (!all.length) {
        box.innerHTML = out(empty('No customers yet', 'Add the people you make things for: contact details, addresses and notes all live here.',
          link('customer-edit', {}, 'Add your first customer', 'class="btn btn-primary"')));
        return;
      }
      if (!list.length) {
        box.innerHTML = out(empty('No matches', 'Try a different name, email or tag.'));
        return;
      }
      box.innerHTML = out(html`<div class="card card-flush"><table class="table table-rows">
        <thead><tr><th>Customer</th><th>Contact</th><th class="num">Owes you</th><th class="num">Paid to date</th><th>Last activity</th></tr></thead>
        <tbody>${list.map((c) => {
          const st = ix.byCustomer.get(c.id) || { open: 0, overdue: 0, paid: 0, last: '' };
          return html`<tr data-go="customer" data-id="${c.id}" class="is-clickable">
            <td data-label="Customer"><span class="who">${avatar(c.name)}<span class="who-text">
              ${link('customer', { id: c.id }, c.name, 'class="who-name"')}
              ${c.company ? html`<span class="who-sub">${c.company}</span>` : ''}
              ${c.archived ? html`<span class="who-sub">${pill('muted', 'Archived')}</span>` : ''}</span></span></td>
            <td data-label="Contact"><span class="stack"><span>${c.email || ''}</span><span class="muted">${c.phone || c.social || ''}</span></span></td>
            <td data-label="Owes you" class="num">${st.open ? fmt.money(st.open) : html`<span class="muted">—</span>`}
              ${st.overdue ? html`<span class="cell-pill">${pill('overdue', 'Overdue')}</span>` : ''}</td>
            <td data-label="Paid to date" class="num">${st.paid ? fmt.money(st.paid) : html`<span class="muted">—</span>`}</td>
            <td data-label="Last activity">${st.last ? fmt.date(st.last) : html`<span class="muted">—</span>`}</td>
          </tr>`;
        })}</tbody>
      </table></div>`);
    },
  };

  // ---------------------------------------------------------------- profile
  function contactRow(ic, label, value, opts) {
    if (!value) return '';
    const o = opts || {};
    return html`<div class="contact-row">
      <span class="contact-ic">${icon(ic)}</span>
      <div class="contact-text"><span class="contact-label">${label}</span>
        ${o.href ? html`<a href="${o.href}" class="contact-value">${value}</a>` : html`<span class="contact-value">${o.multiline ? raw(value) : value}</span>`}</div>
      ${o.copy ? html`<button type="button" class="btn btn-icon btn-quiet btn-sm" data-copy="${o.copy}" aria-label="Copy ${label.toLowerCase()}">${icon('copy')}</button>` : ''}
    </div>`;
  }

  function docTable(kind, docs, states) {
    if (!docs.length) return html`<p class="muted small">No ${kind}s yet.</p>`;
    return html`<table class="table table-compact table-rows">
      <thead><tr><th>Number</th><th>Project</th><th>${kind === 'invoice' ? 'Issued' : 'Date'}</th><th class="num">Total</th><th class="num">Status</th></tr></thead>
      <tbody>${docs.map((d) => {
        const st = states.get(d.id);
        return html`<tr data-go="doc" data-kind="${kind}" data-id="${d.id}" class="is-clickable">
          <td data-label="Number">${link('doc', { kind, id: d.id }, d.number, 'class="mono"')}</td>
          <td data-label="Project">${d.title || html`<span class="muted">—</span>`}</td>
          <td data-label="Date">${fmt.date(d.issueDate)}</td>
          <td data-label="Total" class="num">${fmt.money(st.total)}</td>
          <td data-label="Status" class="num">${pill(st.key, st.label)}</td></tr>`;
      })}</tbody></table>`;
  }

  NB.views.customer = {
    title: (p) => (NB.store.get('customers', p.id) || {}).name || 'Customer',
    render(root, params) {
      const c = NB.store.get('customers', params.id);
      if (!c) { root.innerHTML = notFound('Customer', 'customers'); return; }
      const data = NB.store.snapshot();
      const today = Dates.today();
      const ix = NB.calc.index(data, today);
      const st = ix.byCustomer.get(c.id) || { open: 0, overdue: 0, paid: 0, invoices: 0, estimates: 0, payments: 0 };
      const byDate = (a, b) => (b.issueDate || '').localeCompare(a.issueDate || '') || (b.seq || 0) - (a.seq || 0);
      const invoices = data.invoices.filter((d) => d.customerId === c.id).sort(byDate);
      const estimates = data.estimates.filter((d) => d.customerId === c.id).sort(byDate);
      const payments = data.payments.filter((p) => p.customerId === c.id).sort((a, b) => b.date.localeCompare(a.date));
      const address = NB.sheet.customerAddress(c);
      const selfHosted = !NB.env.hosted;

      root.innerHTML = out(html`<div class="page">
        ${link('customers', {}, html`${icon('back')}<span>Customers</span>`, 'class="back-link"')}
        <header class="page-head">
          <div class="who who-lg">${avatar(c.name, 'avatar-lg')}<div>
            <h1>${c.name}</h1>
            <p class="page-sub">${[c.company, 'Customer since ' + fmt.date((c.createdAt || '').slice(0, 10) || today, { month: 'long', year: 'numeric' })].filter(Boolean).join(' · ')}</p>
            ${(c.tags || []).length || c.archived ? html`<p class="tags">${c.archived ? pill('muted', 'Archived') : ''}${(c.tags || []).map((t) => html`<span class="tag">${t}</span>`)}</p>` : ''}
          </div></div>
          <div class="head-actions">
            ${link('payment-edit', { customerId: c.id }, html`${icon('payment')}<span>Record payment</span>`, 'class="btn btn-quiet"')}
            ${link('doc-edit', { kind: 'estimate', customerId: c.id }, html`${icon('estimate')}<span>New estimate</span>`, 'class="btn btn-quiet"')}
            ${link('doc-edit', { kind: 'invoice', customerId: c.id }, html`${icon('plus')}<span>New invoice</span>`, 'class="btn btn-primary"')}
            <button type="button" class="btn btn-icon btn-quiet" data-act="more" aria-label="More actions" aria-haspopup="menu">${icon('more')}</button>
          </div>
        </header>

        <section class="kpis kpis-3">
          <div class="kpi"><p class="kpi-label">Owes you</p><p class="kpi-value">${fmt.money(st.open)}</p>
            <p class="kpi-sub">${st.overdue ? html`${pill('overdue', fmt.money(st.overdue) + ' overdue')}` : 'Nothing overdue'}</p></div>
          <div class="kpi"><p class="kpi-label">Paid to date</p><p class="kpi-value">${fmt.money(st.paid)}</p>
            <p class="kpi-sub">${plural(payments.length, 'payment')}</p></div>
          <div class="kpi"><p class="kpi-label">Documents</p><p class="kpi-value">${invoices.length + estimates.length}</p>
            <p class="kpi-sub">${plural(invoices.length, 'invoice')} · ${plural(estimates.length, 'estimate')}</p></div>
        </section>

        <div class="split">
          <aside class="split-side">
            <section class="card">
              <header class="card-head"><h2>Contact</h2>${link('customer-edit', { id: c.id }, 'Edit', 'class="card-link"')}</header>
              ${c.email || c.phone || c.social || address.length ? html`<div class="contact">
                ${contactRow('mail', 'Email', c.email, { copy: c.email, href: selfHosted && c.email ? 'mailto:' + c.email : '' })}
                ${contactRow('phone', 'Phone', c.phone, { copy: c.phone, href: selfHosted && c.phone ? 'tel:' + c.phone.replace(/[^\d+]/g, '') : '' })}
                ${contactRow('at', 'Social', c.social, { copy: c.social })}
                ${address.length ? contactRow('pin', 'Address', out(address.map((l) => html`<span class="line">${l}</span>`)), { multiline: true, copy: [c.name].concat(address).join('\n') }) : ''}
              </div>` : html`<p class="muted small">No contact details yet. ${link('customer-edit', { id: c.id }, 'Add them')}</p>`}
            </section>
            <section class="card">
              <header class="card-head"><h2>Notes</h2></header>
              ${c.notes ? html`<div class="prose">${NB.sheet.lines(c.notes).map((l) => html`<p>${l}</p>`)}</div>`
                : html`<p class="muted small">Sizes, allergies, favourite colours, where you met: anything you want to remember.</p>`}
            </section>
          </aside>
          <div class="split-main">
            <section class="card">
              <header class="card-head"><h2>Invoices</h2><p class="card-sub">${plural(invoices.length, 'invoice')}</p></header>
              ${docTable('invoice', invoices, ix.inv)}
            </section>
            <section class="card">
              <header class="card-head"><h2>Estimates</h2><p class="card-sub">${plural(estimates.length, 'estimate')}</p></header>
              ${docTable('estimate', estimates, ix.est)}
            </section>
            <section class="card">
              <header class="card-head"><h2>Payments</h2><p class="card-sub">${fmt.money(st.paid)} received</p></header>
              ${payments.length ? html`<table class="table table-compact table-rows">
                <thead><tr><th>Date</th><th>Receipt</th><th>For</th><th>Method</th><th class="num">Amount</th></tr></thead>
                <tbody>${payments.map((p) => {
                  const inv = NB.store.get('invoices', p.invoiceId);
                  return html`<tr data-go="payment" data-id="${p.id}" class="is-clickable">
                    <td data-label="Date">${fmt.date(p.date)}</td>
                    <td data-label="Receipt">${link('payment', { id: p.id }, p.receiptNumber, 'class="mono"')}</td>
                    <td data-label="For">${inv ? html`<span class="mono">${inv.number}</span>` : p.memo || html`<span class="muted">—</span>`}</td>
                    <td data-label="Method">${p.methodName || ''}</td>
                    <td data-label="Amount" class="num">${fmt.money(p.amount)}</td></tr>`;
                })}</tbody></table>` : html`<p class="muted small">No payments yet.</p>`}
            </section>
          </div>
        </div>
      </div>`);

      root.onclick = async (e) => {
        const copy = e.target.closest('[data-copy]');
        if (copy) {
          e.stopPropagation();
          NB.ui.toast((await NB.ui.copyText(copy.dataset.copy)) ? 'Copied' : 'Select the text to copy it');
          return;
        }
        const more = e.target.closest('[data-act="more"]');
        if (more) {
          NB.app.menu(more, [
            { label: 'Edit details', icon: 'edit', run: () => NB.app.go('customer-edit', { id: c.id }) },
            c.archived
              ? { label: 'Restore from archive', icon: 'undo', run: () => setArchived(c, false) }
              : { label: 'Archive', icon: 'archive', run: () => setArchived(c, true) },
            { sep: true },
            { label: 'Delete customer', icon: 'trash', danger: true, run: () => removeCustomer(c, invoices.length + estimates.length + payments.length) },
          ]);
        }
      };
    },
  };

  async function setArchived(c, archived) {
    await NB.ui.busy(null, async () => {
      await NB.store.save('customers', Object.assign(NB.util.clone(c), { archived }));
      NB.ui.toast(archived ? c.name + ' archived' : c.name + ' restored');
    });
  }

  async function removeCustomer(c, linked) {
    if (linked) {
      NB.ui.modal({
        title: "This customer can't be deleted",
        body: html`<p class="dlg-text">${c.name} has ${plural(linked, 'estimate, invoice or payment', 'estimates, invoices and payments')} on record.
          Your books need those to stay accurate, so archive the customer instead. Archived customers are hidden from lists and pickers.</p>`,
        foot: html`<button type="button" class="btn btn-quiet" data-close>Close</button>
          ${c.archived ? '' : html`<button type="button" class="btn btn-primary" data-archive>Archive instead</button>`}`,
        onMount(el, api) {
          const b = el.querySelector('[data-archive]');
          if (b) b.addEventListener('click', () => { api.close(); setArchived(c, true); });
        },
      });
      return;
    }
    const ok = await NB.ui.confirm({ title: 'Delete ' + c.name + '?', message: 'Their contact details and notes will be removed. This cannot be undone.', confirm: 'Delete customer', danger: true });
    if (!ok) return;
    await NB.ui.busy(null, async () => {
      await NB.store.remove('customers', c.id);
      NB.ui.toast(c.name + ' deleted');
      NB.app.go('customers', {}, { replace: true });
    });
  }

  // ---------------------------------------------------------------- form
  function fields(v, compact) {
    const f = (name, label, value, attrs) => html`<label class="field${attrs && attrs.wide ? ' field-wide' : ''}">
      <span>${label}</span><input name="${name}" id="cust-${name}" value="${value || ''}" ${raw((attrs && attrs.extra) || '')}></label>`;
    return html`<div class="form-grid">
      ${f('name', 'Name', v.name, { extra: 'required autocomplete="off" autocapitalize="words"' + (compact ? ' autofocus' : '') })}
      ${f('company', 'Business name (optional)', v.company, { extra: 'autocomplete="off"' })}
      ${f('email', 'Email', v.email, { extra: 'type="email" inputmode="email" autocomplete="off"' })}
      ${f('phone', 'Phone', v.phone, { extra: 'type="tel" inputmode="tel" autocomplete="off"' })}
      ${compact ? '' : html`
        ${f('social', 'Instagram, Etsy or website', v.social, { extra: 'autocomplete="off"', wide: true })}
        ${f('address1', 'Street address', v.address1, { extra: 'autocomplete="off"' })}
        ${f('address2', 'Apartment, suite, etc.', v.address2, { extra: 'autocomplete="off"' })}
        ${f('city', 'City', v.city, { extra: 'autocomplete="off"' })}
        <div class="field-pair">
          ${f('region', 'State or province', v.region, { extra: 'autocomplete="off"' })}
          ${f('postal', 'ZIP or postal code', v.postal, { extra: 'autocomplete="off"' })}
        </div>
        ${f('country', 'Country (if not local)', v.country, { extra: 'autocomplete="off"' })}
        ${f('tags', 'Tags', (v.tags || []).join(', '), { extra: 'autocomplete="off" placeholder="wholesale, market regular"' })}
        <label class="field field-wide"><span>Notes (only you see these)</span>
          <textarea name="notes" id="cust-notes" rows="4" placeholder="Sizes, allergies, favourite colours, where you met">${v.notes || ''}</textarea></label>`}
    </div>`;
  }

  function readForm(form, base) {
    const v = NB.ui.formValues(form);
    const out = Object.assign(NB.util.clone(base), {
      name: (v.name || '').trim(),
      company: (v.company || '').trim(),
      email: (v.email || '').trim(),
      phone: (v.phone || '').trim(),
    });
    if ('social' in v) {
      Object.assign(out, {
        social: v.social.trim(), address1: v.address1.trim(), address2: v.address2.trim(), city: v.city.trim(),
        region: v.region.trim(), postal: v.postal.trim(), country: v.country.trim(), tags: tagsFrom(v.tags), notes: v.notes.trim(),
      });
    }
    return out;
  }

  function validate(form, rec) {
    if (!rec.name) { NB.ui.fieldError(form, 'name', 'Add a name so you can find this customer.'); return false; }
    if (rec.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rec.email)) { NB.ui.fieldError(form, 'email', 'This email address looks incomplete.'); return false; }
    return true;
  }

  NB.views['customer-edit'] = {
    title: (p) => (p.id ? 'Edit customer' : 'New customer'),
    live: false,
    render(root, params) {
      const existing = params.id ? NB.store.get('customers', params.id) : null;
      if (params.id && !existing) { root.innerHTML = notFound('Customer', 'customers'); return; }
      const base = existing || blankCustomer();
      root.innerHTML = out(html`<div class="page page-narrow">
        <button type="button" class="back-link" data-act="cancel">${icon('back')}<span>${existing ? existing.name : 'Customers'}</span></button>
        <header class="page-head"><div><h1>${existing ? 'Edit customer' : 'New customer'}</h1></div></header>
        <form class="card form" id="customer-form" novalidate>
          ${fields(base, false)}
          <div class="form-actions">
            <button type="button" class="btn btn-quiet" data-act="cancel">Cancel</button>
            <button type="submit" class="btn btn-primary">${icon('check')}<span>Save customer</span></button>
          </div>
        </form>
      </div>`);
      const form = root.querySelector('#customer-form');
      if (!existing) form.querySelector('#cust-name').focus();
      let dirty = false;
      NB.app.setGuard(() => dirty);
      root.oninput = () => { dirty = true; };
      root.onclick = (e) => {
        if (e.target.closest('[data-act="cancel"]')) NB.app.back(existing ? 'customer' : 'customers', existing ? { id: existing.id } : {});
      };
      root.onsubmit = async (e) => {
        e.preventDefault();
        const rec = readForm(form, base);
        if (!validate(form, rec)) return;
        await NB.ui.busy(form.querySelector('[type="submit"]'), async () => {
          const saved = await NB.store.save('customers', rec);
          dirty = false;
          NB.ui.toast(existing ? 'Customer updated' : saved.name + ' added');
          NB.app.go('customer', { id: saved.id }, { replace: true });
        });
      };
    },
  };

  // Small dialog used from the estimate/invoice/payment forms. Resolves the new customer or null.
  function quickAdd(prefill) {
    return new Promise((resolve) => {
      let created = null;
      NB.ui.modal({
        title: 'New customer',
        body: html`<form id="quick-customer" novalidate>${fields(Object.assign(blankCustomer(), prefill || {}), true)}
          <p class="hint">You can add an address and notes later from their profile.</p></form>`,
        foot: html`<button type="button" class="btn btn-quiet" data-close>Cancel</button>
          <button type="submit" form="quick-customer" class="btn btn-primary">Add customer</button>`,
        onMount(el, api) {
          const form = el.querySelector('#quick-customer');
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const rec = readForm(form, blankCustomer());
            if (!validate(form, rec)) return;
            await NB.ui.busy(el.querySelector('[form="quick-customer"]'), async () => {
              created = await NB.store.save('customers', rec);
              NB.ui.toast(created.name + ' added');
              api.close();
            });
          });
        },
        onClose() { resolve(created); },
      });
    });
  }

  NB.customers = { quickAdd, blankCustomer };
})(window.NB = window.NB || {});
