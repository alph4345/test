/* ==========================================================================
   READER — blog & projects
   ONE axis of navigation: pick an item. The body scrolls inside its own panel,
   so there are no sub-pages, no edge arrows and no item arrows.

   The old layout had two sets of arrows that looked identical but moved on
   different axes — side chevrons turned pages within a post, bottom arrows
   flipped between posts — with nothing on screen to tell them apart. Letting
   the body scroll makes sub-pages unnecessary and deletes the ambiguity.

   Each item has its own address (blog#my-first-blog-post), so one can be
   linked to. Choosing another flies the reader window out and back in with
   it, the About page's flight and after-images, as on the Drops page. The
   article reads in a column a comfortable line long, its date and reading
   time under its title, the previous and next items at its end.

   Keys: left and right change item (up and down too, in the list); up, down,
   Page Up, Page Down and Space scroll the article.

   Content lives in the HTML; this file counts it at runtime.
   ========================================================================== */
(function () {
  "use strict";

  var entries = [].slice.call(document.querySelectorAll(".rd-entry"));
  if (!entries.length) return;

  var rows  = document.getElementById("rd-rows");
  var body  = document.getElementById("rd-body");
  var title = document.getElementById("rd-title");
  var date  = document.getElementById("rd-date");
  var count = document.getElementById("rd-count");
  var panel = body.closest(".rd-reader");
  var unit  = (panel && panel.getAttribute("aria-label")) || "Item";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var current = -1;

  function pad(n) { return String(n).padStart(2, "0"); }
  function el(tag, cls, text) {
    var x = document.createElement(tag);
    if (cls) x.className = cls;
    if (text != null) x.textContent = text;
    return x;
  }

  // each item's address: its title in lower case, words joined by dashes
  var slugs = [];
  entries.forEach(function (e, i) {
    var s = (e.dataset.title || "").toLowerCase().normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || String(i + 1);
    var base = s, n = 2;
    while (slugs.indexOf(s) >= 0) s = base + "-" + n++;
    slugs.push(s);
  });

  entries.forEach(function (e, i) {
    var b = el("button", "rd-row");
    b.type = "button";
    b.setAttribute("aria-current", "false");
    b.appendChild(el("span", "rd-row__n", pad(i + 1)));
    b.appendChild(el("span", "rd-row__t", e.dataset.title));
    b.appendChild(el("span", "rd-row__d", e.dataset.date || ""));
    b.addEventListener("click", function () { go(i); });
    rows.appendChild(b);
  });
  if (count) count.textContent = pad(entries.length) + " REC";
  if (date) date.hidden = true;            // the date is under the title now

  function readingTime(e) {
    var words = (e.textContent || "").trim().split(/\s+/).length;
    return Math.max(1, Math.round(words / 200)) + " min read";
  }

  function show(i, quiet) {
    if (i === current || !entries[i]) return;
    current = i;
    var e = entries[i];
    [].forEach.call(rows.children, function (r, n) {
      r.setAttribute("aria-current", n === i ? "true" : "false");
    });
    title.textContent = unit + " " + pad(i + 1) + " / " + pad(entries.length);
    var art = el("article", "rd-article");
    art.innerHTML = e.innerHTML;
    var meta = el("p", "rd-meta", [e.dataset.date, readingTime(e)].filter(Boolean).join("  \u00b7  "));
    var h = art.querySelector("h2");
    if (h) h.parentNode.insertBefore(meta, h.nextSibling); else art.insertBefore(meta, art.firstChild);
    art.appendChild(neighbours(i));
    body.textContent = "";
    body.appendChild(art);
    body.scrollTop = 0;                    // a new item starts at the top
    if (!quiet) history.replaceState(history.state, "", "#" + slugs[i]);
    // on a phone the list is a strip: bring the item into it
    var row = rows.children[i];
    if (row && rows.scrollWidth > rows.clientWidth) {
      var a = row.getBoundingClientRect(), b = rows.getBoundingClientRect();
      rows.scrollLeft += (a.left - b.left) - Math.max(0, (b.width - a.width) / 2);
    }
  }

  // the previous and next items, at the end of the article (a div: the
  // site's own menu bar styles every <nav>)
  function neighbours(i) {
    var nav = el("div", "rd-next");
    nav.setAttribute("role", "navigation");
    nav.setAttribute("aria-label", "More " + unit.toLowerCase() + "s");
    [[i - 1, "Previous"], [i + 1, "Next"]].forEach(function (p) {
      var k = p[0];
      if (!entries[k]) { nav.appendChild(el("span")); return; }
      var b = el("button", "rd-next__b rd-next__b--" + p[1].toLowerCase());
      b.type = "button";
      b.appendChild(el("span", "k", p[1] + " " + unit.toLowerCase()));
      b.appendChild(el("span", "t", entries[k].dataset.title));
      b.addEventListener("click", function () { go(k); });
      nav.appendChild(b);
    });
    return nav;
  }

  // One change at a time: the reader flies out and back in with the new
  // item; a newer choice made meanwhile is the one that lands.
  var busy = false, wanted = -1;
  async function go(i) {
    if (!entries[i]) return;
    wanted = i;
    if (busy) return;
    busy = true;
    while (wanted >= 0) {
      var k = wanted; wanted = -1;
      if (k === current) continue;
      var fly = !reduceMotion && panel && window.pn0vaFly;
      if (!fly) { show(k); continue; }
      await fly.exit(panel);
      if (wanted >= 0) { k = wanted; wanted = -1; }
      show(k);
      fly.reset(panel);
      await fly.enter(panel);
    }
    busy = false;
  }

  document.addEventListener("keydown", function (ev) {
    var t = ev.target;
    if (t && t.closest && t.closest("input, textarea, [contenteditable]")) return;
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
    var inList = t && t.closest && t.closest("#rd-rows");
    var step = { ArrowRight: 1, ArrowLeft: -1 }[ev.key] ||
               (inList ? { ArrowDown: 1, ArrowUp: -1 }[ev.key] : 0);
    if (step) {
      var from = wanted >= 0 ? wanted : current, to = from + step;
      if (to >= 0 && to < entries.length) { ev.preventDefault(); go(to); }
      return;
    }
    // the page itself never scrolls: these scroll the article
    var by = { ArrowDown: 48, ArrowUp: -48, PageDown: 0.9, PageUp: -0.9, " ": ev.shiftKey ? -0.9 : 0.9 }[ev.key];
    if (by && !(t && t.closest && t.closest("button, a, summary"))) {
      ev.preventDefault();
      body.scrollBy({ top: Math.abs(by) < 1 ? by * body.clientHeight : by });
    }
  });

  // the address decides the item: on arrival, and when it is changed by hand
  function fromHash() {
    var id = "";
    try { id = decodeURIComponent(location.hash.slice(1)); } catch (e) { /* a mangled address */ }
    return slugs.indexOf(id);
  }
  window.addEventListener("hashchange", function () {
    var i = fromHash();
    if (i >= 0) go(i);
  });
  var first = fromHash();
  show(first >= 0 ? first : 0, true);
})();
