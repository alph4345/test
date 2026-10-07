/* n0va Books · util.js
 * Shared helpers. Money is always an integer count of the currency's minor unit
 * (cents for USD); dates are local calendar days written 'YYYY-MM-DD'.
 * Loads as a classic script in the browser and with require() in Node (tests). */
(function (NB) {
  'use strict';

  function uid() {
    const c = globalThis.crypto;
    if (c && typeof c.randomUUID === 'function') {
      try { return c.randomUUID(); } catch (e) { /* insecure context: fall through */ }
    }
    let s = '';
    while (s.length < 24) s += Math.random().toString(36).slice(2);
    return s.slice(0, 24);
  }

  function clone(v) {
    return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  }

  function clamp(n, lo, hi) {
    return Math.min(Math.max(n, lo), hi);
  }

  // Round half away from zero after trimming float noise (1.005 * 100 = 100.4999…).
  function roundMinor(x) {
    const n = Number(x);
    if (!isFinite(n)) return 0;
    return (Math.sign(n) * Math.round(Math.abs(Number(n.toFixed(6))))) || 0;
  }

  // A typed number with either decimal mark. "1,5" and "1.5" are one and a half;
  // "1,234" and "1.234,56" use grouping. Empty is 0; text without digits is NaN.
  function parseDecimal(input) {
    let s = String(input == null ? '' : input).trim();
    if (!s) return 0;
    const negative = /^\(.*\)$/.test(s) || /^-|^[^\d]*-/.test(s);
    s = s.replace(/[^\d.,]/g, '');
    if (!/\d/.test(s)) return NaN;
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    let dec = -1;
    if (lastDot > -1 && lastComma > -1) dec = Math.max(lastDot, lastComma);
    else if (lastComma > -1) dec = s.indexOf(',') === lastComma && s.length - lastComma - 1 !== 3 ? lastComma : -1;
    else if (lastDot > -1) dec = s.indexOf('.') === lastDot ? lastDot : -1;
    const intPart = (dec > -1 ? s.slice(0, dec) : s).replace(/[.,]/g, '');
    const fracPart = dec > -1 ? s.slice(dec + 1).replace(/[.,]/g, '') : '';
    const num = parseFloat((intPart || '0') + '.' + (fracPart || '0'));
    if (!isFinite(num)) return NaN;
    return negative ? -num : num;
  }

  // ---------------------------------------------------------------- money
  const digitCache = {};
  const formatCache = {};

  const Money = {
    digits(currency) {
      const cur = currency || 'USD';
      if (!(cur in digitCache)) {
        let d = 2;
        try {
          d = new Intl.NumberFormat('en', { style: 'currency', currency: cur }).resolvedOptions().maximumFractionDigits;
        } catch (e) { /* unknown code: assume cents */ }
        digitCache[cur] = d;
      }
      return digitCache[cur];
    },

    factor(currency) {
      return Math.pow(10, Money.digits(currency));
    },

    format(minor, currency, locale) {
      const cur = currency || 'USD';
      const v = (Number(minor) || 0) / Money.factor(cur);
      const key = (locale || '') + '|' + cur;
      try {
        if (!formatCache[key]) formatCache[key] = new Intl.NumberFormat(locale || undefined, { style: 'currency', currency: cur });
        return formatCache[key].format(v);
      } catch (e) {
        return cur + ' ' + v.toFixed(Money.digits(cur));
      }
    },

    // Accepts what people type: "12", "12.5", "$1,234.56", "1.234,56", "(5.00)".
    // Returns minor units, or NaN when there is no number in the text.
    parse(input, currency) {
      if (typeof input === 'number') return roundMinor(input * Money.factor(currency));
      const n = parseDecimal(input);
      return isNaN(n) ? NaN : roundMinor(n * Money.factor(currency));
    },

    // Plain number for an <input>: 1250 -> "12.50".
    toInput(minor, currency) {
      const d = Money.digits(currency);
      return ((Number(minor) || 0) / Math.pow(10, d)).toFixed(d);
    },
  };

  // ---------------------------------------------------------------- dates
  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  const Dates = {
    iso(d) {
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    },
    today() {
      return Dates.iso(new Date());
    },
    parse(s) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
      return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
    },
    valid(s) {
      const d = Dates.parse(s);
      return !!d && Dates.iso(d) === s;
    },
    addDays(s, n) {
      const d = Dates.parse(s) || new Date();
      d.setDate(d.getDate() + n);
      return Dates.iso(d);
    },
    // Whole calendar days from a to b (positive when b is later).
    diff(a, b) {
      const da = Dates.parse(a);
      const db = Dates.parse(b);
      if (!da || !db) return 0;
      const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
      const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
      return Math.round((ub - ua) / 86400000);
    },
    format(s, locale, opts) {
      const d = Dates.parse(s);
      if (!d) return '';
      try {
        return new Intl.DateTimeFormat(locale || undefined, opts || { year: 'numeric', month: 'short', day: 'numeric' }).format(d);
      } catch (e) {
        return s;
      }
    },
    month(s) {
      return String(s || '').slice(0, 7);
    },
    addMonths(ym, n) {
      const parts = ym.split('-').map(Number);
      const d = new Date(parts[0], parts[1] - 1 + n, 1);
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
    },
    monthLabel(ym, locale, style) {
      const parts = ym.split('-').map(Number);
      const opts = style === 'long' ? { month: 'long', year: 'numeric' } : style === 'name' ? { month: 'long' } : { month: 'short' };
      try {
        return new Intl.DateTimeFormat(locale || undefined, opts).format(new Date(parts[0], parts[1] - 1, 1));
      } catch (e) {
        return ym;
      }
    },
  };

  // ---------------------------------------------------------------- text
  function firstName(name) {
    const s = String(name || '').trim();
    return s.split(/\s+/)[0] || s;
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    const a = parts[0][0] || '';
    const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (a + b).toUpperCase();
  }

  function fold(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  // Every word of the query must appear somewhere in the fields.
  function matches(query, fields) {
    const q = fold(query).trim();
    if (!q) return true;
    const hay = fold(fields.filter(Boolean).join(' '));
    return q.split(/\s+/).every((t) => hay.includes(t));
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many || one + 's');
  }

  function fmtQty(q, locale) {
    const n = Number(q) || 0;
    try {
      return new Intl.NumberFormat(locale || undefined, { maximumFractionDigits: 3 }).format(n);
    } catch (e) {
      return String(n);
    }
  }

  function safeFilename(s) {
    return String(s || 'file')
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
  }

  // RFC 4180 CSV. Text that a spreadsheet would run as a formula gets a leading apostrophe.
  function csv(rows, columns) {
    const cell = (v) => {
      if (v == null) return '';
      let s = String(v);
      if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [columns.map((c) => cell(c.label)).join(',')];
    rows.forEach((r) => lines.push(columns.map((c) => cell(c.value(r))).join(',')));
    return lines.join('\r\n') + '\r\n';
  }

  function debounce(fn, ms) {
    let t = null;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  }

  function sum(list, pick) {
    return list.reduce((a, x) => a + (Number(pick(x)) || 0), 0);
  }

  NB.util = { uid, clone, clamp, roundMinor, parseDecimal, Money, Dates, firstName, initials, fold, matches, plural, fmtQty, safeFilename, csv, debounce, sum };
})(typeof window !== 'undefined' ? (window.NB = window.NB || {}) : (globalThis.NB = globalThis.NB || {}));
