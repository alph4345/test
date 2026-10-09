/* ==========================================================================
   DROPS — the world view
   --------------------------------------------------------------------------
   One page, two screens. The WORLD: a globe with a point for every drop and
   the list of drops with their names and dates. A DROP: the record drops.js
   already draws (frequency bar, street map, hint, brief, item).

     drops         the world
     drops#003     drop 003 (a link to one drop opens straight on it)

   The world opens with no drop chosen, the globe turned to where the drops
   are. Choose one in the list (a click, Enter or the arrow keys) and the
   globe flies to it: the drop in the middle, as close as the globe goes.
   Click a drop's point on the globe instead and the globe stays where it
   is. Either way a prompt opens by the point: what the drop is (its title,
   when it was placed, where, its item and hint, the first line of its
   story), ZOOM IN (ZOOM OUT once there) and OPEN DROP. On a phone, where
   the globe is small, the same opens under the drop's row instead. The
   prompt's x, Esc, or a click on bare globe closes it.

   OPEN DROP is the only way in: the globe dives, the list flies off, and
   the drop's windows fly in with the About page's flight and red
   after-images, at twice its speed. The drop screen shows that one drop;
   WORLD MAP (heading its top bar, or floating at the foot of the screen
   where the page scrolls, and on the street map), Esc or the browser's
   Back pulls back out to the globe.

   The globe is a map: coast, lakes, country borders, state and province
   lines, and the names of countries, states, cities, peaks and landmarks.
   They come from Natural Earth (public domain) at four levels of detail
   made by tools/make-world: the whole globe loads at once, and closer in,
   finer levels load for the part in view. Each level is the same coastline
   simplified to the pixel, so zooming in only sharpens it. Landmarks come
   from maps/landmarks.json, which is meant to be added to.

   Every drop has its own point, which grows as you zoom in. Drops too close
   to tell apart sit on a ring round the spot they share, each on a thread
   back to it. Hover a point for what the drop is (as the prompt says it,
   short of where and the hint), or a city, peak or landmark for what it is
   (pointing at a drop in the list marks its point too). Zoom with + and -,
   the mouse wheel, a pinch, or the + - 0 keys; the globe button goes back
   to the whole globe.

   It reads the same <article class="dp-entry"> records as drops.js, so a
   new drop is on the globe with nothing more to do. A drop is NEW for its
   first week. One marked data-claimed="2026.06.28" (or just data-claimed)
   shows CLAIMED on its page, in both lists and on the globe; a drop without
   it shows nothing either way.

   Colours come from tokens.css: an ember sea, slate land, ash coasts and
   state lines, taupe borders, red instruments (graticule, rim, pointer),
   linen points and names, bone for the drop you are on.
   ========================================================================== */

(function () {
  "use strict";

  var NEW_DAYS = 7;                     // a drop is NEW for its first week
  var ZOOM_MAX = 64;                    // a city and its surroundings; the drop's own map has the streets
  var LABEL_BIAS = 0.4;                 // names a little sparser than a web map's

  // A wireframe globe, on every way back to the whole world.
  var GLOBE = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
              '<circle cx="8" cy="8" r="6.5"/><ellipse cx="8" cy="8" rx="2.7" ry="6.5"/>' +
              '<path d="M1.5 8h13M2.6 4.7h10.8M2.6 11.3h10.8"/></svg>';

  var me = document.currentScript;
  function attr(name) { return me && me.dataset[name] ? new URL(me.dataset[name], me.src).href : null; }
  var WORLD = attr("world"), WORLD_V = (me && me.dataset.worldV) || "", MARKS = attr("landmarks");
  var drops = window.pn0vaDrops;        // from drops.js
  var root = document.documentElement;
  var world = document.getElementById("dw");
  var shell = document.querySelector(".dp-shell");
  if (!drops || !world || !shell) return;
  var detail = shell.querySelector(".dp-detail") || shell;

  var fly = function () { return window.pn0vaFly; };   // page-script.js loads after this
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var TITLE = document.title;
  // the drop screen loses drops.js's list from here on (see the CSS)
  root.classList.add("dw-ready");

  /* --- palette: the brand tokens ----------------------------------------- */
  var css = getComputedStyle(root);
  function tok(name, fallback) { return css.getPropertyValue(name).trim() || fallback; }
  var RED = tok("--pn-red", "#FF1609"), EMBER = tok("--pn-ember", "#0A0000"),
      BONE = tok("--pn-bone", "#FFFFFF"), LINEN = tok("--pn-linen", "#E8E2DC"),
      TAUPE = tok("--pn-taupe", "#B0A49B"), ASH = tok("--pn-ash", "#7A716B"),
      SLATE = tok("--pn-slate", "#3A3532");

  /* --- the drops ---------------------------------------------------------- */
  function daysSince(stamp) {
    var p = String(stamp).split(".");
    var then = new Date(+p[0], +p[1] - 1, +p[2]);
    return isNaN(then) ? Infinity : (Date.now() - then) / 86400000;
  }
  // data-claimed="2026.06.28" or bare data-claimed: claimed ("" if no date)
  function claimedOf(e) {
    if (!e.hasAttribute("data-claimed")) return null;
    var v = (e.getAttribute("data-claimed") || "").trim();
    return /^(no|false|0)$/i.test(v) ? null : v;
  }
  var list = drops.entries.map(function (e, i) {
    var d = e.dataset;
    return { i: i, n: d.n, placed: d.placed || "", place: d.place || d.title || "",
             lat: parseFloat(d.lat), lng: parseFloat(d.lng),
             isNew: daysSince(d.placed) < NEW_DAYS, claimed: claimedOf(e) };
  });
  function indexOf(n) {
    for (var i = 0; i < list.length; i++) if (list[i].n === n) return i;
    return -1;
  }
  function hasPos(d) { return isFinite(d.lat) && isFinite(d.lng); }
  function coords(d) {
    return Math.abs(d.lat).toFixed(4) + "°" + (d.lat < 0 ? "S" : "N") + "  " +
           Math.abs(d.lng).toFixed(4) + "°" + (d.lng < 0 ? "W" : "E");
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function el(tag, cls, text) {
    var x = document.createElement(tag);
    if (cls) x.className = cls;
    if (text != null) x.textContent = text;
    return x;
  }
  // Claimed outranks NEW: the item is gone, however recent the drop.
  function tagFor(d) {
    if (d.claimed !== null) return el("span", "dp-claimed-tag", "Claimed");
    if (d.isNew) return el("span", "dp-new", "New");
    return null;
  }

  /* --- what each drop's record says --------------------------------------- */
  // Its title (unless it only repeats the place), the captions of its item
  // and hint photos, and the first sentence of its brief, as a teaser.
  function about(d) {
    var e = drops.entries[d.i], ds = e.dataset, p = e.querySelector("p");
    var text = p ? p.textContent.replace(/\s+/g, " ").trim() : "";
    var first = text.match(/^.+?[.!?](?=\s|$)/);
    return {
      title: ds.title && ds.title.toLowerCase() !== d.place.toLowerCase() ? ds.title : "",
      item: ds.itemcap || "", hint: ds.hintcap || "",
      teaser: first ? first[0] : text
    };
  }
  // how long ago it was placed: "79 days ago"
  function age(d) {
    var n = Math.floor(daysSince(d.placed));
    if (!isFinite(n) || n < 0) return "";
    return n === 0 ? "today" : n === 1 ? "yesterday" : n + " days ago";
  }
  // a label and its value: "ITEM  Enamel pin — Game Boy"
  function kv(label, value) {
    var s = el("span", "kv");
    s.appendChild(el("b", null, label));
    s.appendChild(document.createTextNode(value));
    return s;
  }
  // What there is to say about drop d, into box (after its number and
  // place). how: "popup" over a point; "prompt", the chosen drop's, by its
  // point, with where it is, the hint and OPEN DROP; "row", the same opened
  // under its row on a phone, kept short (where it is and the hint are on
  // the drop's own page) so the rows round it stay in view.
  function describe(box, d, how) {
    var x = about(d), a = age(d), when = el("span", "dw-when");
    if (x.title) box.appendChild(el("i", "dw-title", x.title));
    when.appendChild(el("span", null, "Placed " + d.placed));       // two halves, each kept
    if (a) when.appendChild(el("span", null, a));                    // whole (see the CSS)
    box.appendChild(when);
    if (d.claimed !== null) box.appendChild(el("em", null, "Claimed" + (d.claimed ? " " + d.claimed : "")));
    else if (d.isNew) box.appendChild(el("em", null, "New"));
    if (how === "prompt" && hasPos(d)) box.appendChild(el("span", "dw-at", coords(d)));
    if (x.item) box.appendChild(kv("Item", x.item));
    if (how === "prompt" && x.hint) box.appendChild(kv("Hint", x.hint));
    if (x.teaser) box.appendChild(el("q", "dw-teaser", x.teaser));
    if (how === "popup") return;
    // ZOOM IN / ZOOM OUT, for a drop the globe can show, and OPEN DROP
    var acts = el("div", "dw-acts");
    if (hasGlobe && hasPos(d)) {
      var zb = el("button", "dw-zoomto");
      zb.type = "button";
      zb.addEventListener("click", function (ev) {
        if (how === "row" && ghost(ev)) return;
        if (ev.detail) zb.blur();             // clicked: the prompt goes while the globe moves
        zoomToggle();
      });
      acts.appendChild(zb);
    }
    var go = el("a", "dw-open");
    go.href = "#" + d.n;
    go.innerHTML = '<span class="cur" aria-hidden="true">&#9656;</span>Open drop';
    if (how === "row") go.addEventListener("click", function (ev) { if (ghost(ev)) ev.preventDefault(); });
    acts.appendChild(go);
    box.appendChild(acts);
    zoomLabels();
  }
  // Opened under its row, the rows round it move, and its buttons can come
  // to rest under the finger that chose it: a second tap on that spot
  // straight after (a double tap) is not a request for either.
  function ghost(ev) {
    return !!ev.detail && !!tapped && Date.now() - tapped.t < 450 &&
           Math.hypot(ev.clientX - tapped.x, ev.clientY - tapped.y) < 30;
  }
  // The magnifier on ZOOM IN and ZOOM OUT.
  function lens(plus) {
    return '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="6.5" cy="6.5" r="4.6"/>' +
           '<path d="M10 10l4.4 4.4M4.4 6.5h4.2' + (plus ? "M6.5 4.4v4.2" : "") + '"/></svg>';
  }
  // ZOOM IN until the globe is as close as it goes, ZOOM OUT from there.
  function zoomLabels() {
    var out = view.zoom >= CLOSE - 1e-6;
    [card, rows].forEach(function (box) {
      Array.prototype.forEach.call(box.querySelectorAll(".dw-zoomto"), function (b) {
        if (b.dataset.out === String(out)) return;
        b.dataset.out = out;
        b.innerHTML = lens(!out) + (out ? "Zoom out" : "Zoom in");
      });
    });
  }

  /* --- the list ----------------------------------------------------------- */
  // A row chooses its drop: the globe flies to it and the prompt opens
  // there. It never opens the drop itself. Pointing at a row only marks the
  // drop's point, so running the mouse down the list doesn't send the globe
  // about.
  // Each row says what the drop is (its title and the start of its story);
  // on a phone the chosen one opens up underneath with the rest, and its
  // OPEN DROP, instead of a prompt over the small globe.
  var rows = document.getElementById("dw-rows"), rowBtns = [], mores = [];
  var tapped = null;                    // where and when a row was last pressed
  var quiet = false;                    // a row focused by this script, not chosen by it
  // whether an element's focus came from the keyboard (where a browser
  // doesn't know :focus-visible, it is taken to have, as it always was)
  function byKeys(x) {
    try { return x.matches(":focus-visible"); } catch (e) { return true; }
  }
  document.getElementById("dw-count").textContent = String(list.length).padStart(2, "0") + " REC";
  list.forEach(function (d) {
    var item = el("div", "dw-item"), a = el("button", "dw-row"), x = about(d);
    a.type = "button";
    a.appendChild(el("span", "dw-n", d.n));
    a.appendChild(el("span", "dw-place", d.place));
    a.appendChild(tagFor(d) || el("span"));
    a.appendChild(el("span", "dw-date", d.placed));
    var line = [x.title, x.teaser].filter(Boolean).join(" — ");
    if (line) a.appendChild(el("span", "dw-line", line));
    a.addEventListener("mouseenter", function () { if (d.i !== sel) setHover({ drop: d.i }); });
    a.addEventListener("mouseleave", function () { if (hover && hover.drop === d.i) setHover(null); });
    // Focus from the keyboard (Tab, the arrows) chooses the drop at once; a
    // press chooses it with its click. Chosen as the button took the focus
    // of a tap, a phone's row opened before the tap's click arrived, and
    // the click landed on whatever had moved under the finger: another row,
    // or the drop's own OPEN DROP.
    a.addEventListener("focus", function () { if (!quiet && byKeys(a)) select(d.i, "fly"); });
    a.addEventListener("pointerdown", function (ev) { tapped = { x: ev.clientX, y: ev.clientY, t: Date.now() }; });
    // From the keyboard (no pointer, so no click count), Enter goes on to
    // the prompt's OPEN DROP, so a second Enter opens it. A row opened
    // underneath (a phone) closes again at a second tap.
    a.addEventListener("click", function (ev) {
      if (ev.detail && d.i === sel && docked()) { select(-1); return; }
      select(d.i, "fly");
      if (!ev.detail) promptFocus();
    });
    var more = el("div", "dw-more");
    more.hidden = true;
    item.appendChild(a);
    item.appendChild(more);
    rows.appendChild(item);
    rowBtns.push(a);
    mores.push(more);
  });

  // Where the prompt goes: by the drop's point on the globe, or under its
  // row: on a phone, and wherever the globe can't show the drop.
  var narrow = window.matchMedia("(max-width: 900px)");
  function docked() { return narrow.matches || !hasGlobe || !hasPos(list[sel] || {}); }
  function dock() {
    mores.forEach(function (m, k) {
      var on = docked() && k === sel;
      if (on && !m.childNodes.length) describe(m, list[k], "row");
      m.hidden = !on;
      m.parentNode.classList.toggle("is-open", on);
      if (on) reveal(m.parentNode);
    });
  }
  // the opened row in full view inside the list, which scrolls on its own
  function reveal(item) {
    var a = item.getBoundingClientRect(), b = rows.getBoundingClientRect();
    if (!b.height) return;
    if (a.bottom > b.bottom) rows.scrollTop += a.bottom - b.bottom + 4;
    if (a.top < b.top) rows.scrollTop -= b.top - a.top + 4;
  }
  function onNarrow() { dock(); draw(); }
  // a row given the focus back (the prompt closing, the world returning),
  // without that choosing it again
  function focusRow(i) {
    if (!rowBtns[i]) return;
    quiet = true;
    rowBtns[i].focus({ preventScroll: true });
    quiet = false;
  }
  if (narrow.addEventListener) narrow.addEventListener("change", onNarrow); else narrow.addListener(onNarrow);

  // The drop screen shows one drop: drops.js's list of them is hidden (see
  // the CSS), and the way back, a real button so nobody has to hunt for it,
  // heads its top bar in place of the word "Frequency". Where the drop's
  // page scrolls (a phone, a short screen) that would scroll away with it:
  // there the way back floats at the foot of the screen instead, always in
  // reach. The CSS shows the one or the other.
  var BACK = '<span class="arr" aria-hidden="true">&#9666;</span>' + GLOBE +
             '<span class="lbl">World map</span><span class="key" aria-hidden="true">Esc</span>';
  var back = el("button", "dp-world-back");
  back.type = "button";
  back.title = "Back to the world map (Esc)";
  back.innerHTML = BACK;
  back.addEventListener("click", toWorldByHand);
  var barHead = document.querySelector(".dp-bar .dp-panel__head");
  if (barHead) barHead.insertBefore(back, barHead.firstChild);
  var floatBack = el("button", "dw-home");
  floatBack.type = "button";
  floatBack.title = back.title;
  floatBack.innerHTML = BACK;
  floatBack.addEventListener("click", toWorldByHand);
  document.body.appendChild(floatBack);
  function backButton() { return floatBack.getClientRects().length ? floatBack : back; }

  // The street map has one too, under its recentre control, for whoever is
  // looking at the map rather than the list.
  var street = drops.map && drops.map();
  if (street && window.L) {
    var ToWorld = L.Control.extend({
      options: { position: "topleft" },
      onAdd: function () {
        var c = L.DomUtil.create("div", "leaflet-bar dp-recenter dp-to-world");
        var a = L.DomUtil.create("a", "", c);
        a.href = "#";
        a.title = "Back to the world map";
        a.setAttribute("role", "button");
        a.setAttribute("aria-label", "Back to the world map");
        a.innerHTML = GLOBE;
        L.DomEvent.disableClickPropagation(c);
        L.DomEvent.on(a, "click", L.DomEvent.stop);
        L.DomEvent.on(a, "click", function () { toWorldByHand(); });
        return c;
      }
    });
    street.addControl(new ToWorld());
  }

  // CLAIMED on the drop's page: a chip at the head of the frequency bar
  // (its readouts have no room to spare), and the word in the item's own
  // head, so the photo stays clear for whoever looks later. Nothing for a
  // drop that isn't marked.
  var chip = el("span", "dp-claimed");
  chip.hidden = true;
  var head = document.querySelector(".dp-bar .dp-headgroup");
  if (head) head.insertBefore(chip, head.firstChild);
  var itemMark = el("span", "dp-item-claimed");
  itemMark.hidden = true;
  var itemHead = document.querySelector(".dp-slot--item .dp-panel__head");
  if (itemHead && itemHead.lastElementChild) itemHead.insertBefore(itemMark, itemHead.lastElementChild);
  function showClaimed(i) {
    var d = list[i], on = !!d && d.claimed !== null;
    chip.hidden = itemMark.hidden = !on;
    chip.textContent = on ? "Claimed" : "";
    if (on && d.claimed) chip.appendChild(el("span", "d", d.claimed));
    itemMark.textContent = on ? "Claimed" : "";
    if (on && d.claimed) itemMark.appendChild(el("span", "d", " " + d.claimed));
  }

  /* --- the map's data ----------------------------------------------------- */
  // Files from tools/make-world: "0" is the whole globe and carries the
  // index of the rest; each holds pieces (a square of map: land, lakes,
  // coast, borders, states) and the names to show at its zoom.
  var box = document.getElementById("dw-globe");
  var canvas = document.getElementById("dw-canvas");
  var callout = document.getElementById("dw-callout");
  var card = document.getElementById("dw-card");
  var ctx = canvas.getContext("2d");
  var hasGlobe = !!(window.d3 && d3.geoOrthographic && window.topojson);
  var REF_R = 288;                      // the desktop globe's radius the levels are cut for
  var proj, path, index = null, files = {}, marks = [];
  if (hasGlobe) {
    proj = d3.geoOrthographic().clipAngle(90).precision(0.4);
    path = d3.geoPath(proj, ctx);
    if (WORLD) load("0");
    if (MARKS) fetch(MARKS).then(function (r) { return r.json(); }).then(function (j) {
      // [kind, name, lng, lat, from, to, note], as in the map's files; a
      // landmark's zoom is the globe's, its "from" the web map's equivalent
      marks = (j.landmarks || []).filter(function (m) {
        return m && m.name && isFinite(m.lat) && isFinite(m.lng);
      }).map(function (m) {
        return ["l", String(m.name), +m.lng, +m.lat, Math.log2(REF_R * (+m.zoom || 8) / 40.74), 99, m.note ? String(m.note) : null];
      });
      draw();
    }).catch(function () { /* the globe works without landmarks */ });
  } else {
    canvas.hidden = true;
  }

  function load(name) {
    if (files[name]) return files[name];
    var f = files[name] = { ready: false, pieces: [], places: [] };
    var lvl = +name.split("/")[0];
    fetch(WORLD + name + ".json" + (WORLD_V ? "?v=" + WORLD_V : "")).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    }).then(function (t) {
      if (t.index) index = t.index;
      var size = index ? index.levels[lvl].piece : 360, byKey = {};
      ["land", "lakes", "coast", "borders", "states"].forEach(function (layer) {
        if (!t.objects[layer]) return;
        topojson.feature(t, t.objects[layer]).features.forEach(function (ft) {
          var k = ft.properties.p;
          if (!byKey[k]) {
            var ij = k.split(","), x0 = ij[0] * size - 180, y0 = ij[1] * size - 90;
            var bx = [x0, y0, x0 + size, y0 + size], c = [x0 + size / 2, y0 + size / 2];
            // its middle and how far it reaches round the globe, to skip it
            // when it is wholly on the far side
            var reach = 0;
            [[bx[0], bx[1]], [bx[2], bx[1]], [bx[0], bx[3]], [bx[2], bx[3]], [c[0], bx[1]], [c[0], bx[3]]].forEach(function (q) {
              reach = Math.max(reach, d3.geoDistance(c, q));
            });
            byKey[k] = { box: bx, c: c, reach: reach };
          }
          byKey[k][layer] = layer === "land" || layer === "lakes" ? shapesOf(ft.geometry) : linesOf(ft.geometry);
        });
      });
      f.pieces = Object.keys(byKey).map(function (k) { return byKey[k]; });
      f.places = t.places || [];
      f.ready = true;
      draw();
    }).catch(function () {
      f.ready = true;                   // nothing there: the map goes on without it
      draw();
    });
    return f;
  }

  // The map's points become unit vectors once, when a file arrives: then a
  // frame costs a few multiplications a point, and no trigonometry.
  var RAD = Math.PI / 180;
  function vectors(ring) {
    var v = new Float64Array(ring.length * 3);
    for (var k = 0; k < ring.length; k++) {
      var l = ring[k][0] * RAD, f = ring[k][1] * RAD, c = Math.cos(f);
      v[3 * k] = c * Math.cos(l); v[3 * k + 1] = c * Math.sin(l); v[3 * k + 2] = Math.sin(f);
    }
    return v;
  }
  // Land and lakes: each shape with the cap it lies in (its middle and how
  // far its outline reaches), to tell in front, behind and across the horizon.
  function shapesOf(g) {
    var polys = g.type === "MultiPolygon" ? g.coordinates : g.type === "Polygon" ? [g.coordinates] : [];
    return polys.map(function (rings) {
      var v = rings.map(vectors), o = v[0], x = 0, y = 0, z = 0, k;
      for (k = 0; k < o.length; k += 3) { x += o[k]; y += o[k + 1]; z += o[k + 2]; }
      var m = Math.hypot(x, y, z) || 1, c = [x / m, y / m, z / m], low = 1;
      for (k = 0; k < o.length; k += 3) low = Math.min(low, c[0] * o[k] + c[1] * o[k + 1] + c[2] * o[k + 2]);
      return { v: v, c: c, reach: Math.acos(clamp(low, -1, 1)) };
    });
  }
  function linesOf(g) {
    return (g.type === "MultiLineString" ? g.coordinates : g.type === "LineString" ? [g.coordinates] : []).map(vectors);
  }

  /* --- the view ------------------------------------------------------------ */
  var W = 0, H = 0, R = 0, DPR = 1, CX = 0, CY = 0, halo = null, inMotion = false;
  var sel = -1;                         // the chosen drop: none, until one is chosen
  var CLOSE = ZOOM_MAX;                 // how close the globe flies in to a drop

  // Where the drops are: the middle of them all, which the globe faces
  // while none is chosen.
  var HOME = (function () {
    var x = 0, y = 0, z = 0;
    list.forEach(function (d) {
      if (!hasPos(d)) return;
      var l = d.lng * RAD, f = d.lat * RAD;
      x += Math.cos(f) * Math.cos(l); y += Math.cos(f) * Math.sin(l); z += Math.sin(f);
    });
    if (Math.hypot(x, y, z) < 1e-9) return [0, 20];
    return [Math.atan2(y, x) / RAD, clamp(Math.atan2(z, Math.hypot(x, y)) / RAD, -60, 60)];
  })();
  function home(z) { return { lng: HOME[0], lat: HOME[1], zoom: z, dive: 1 }; }
  // A drop in the middle of the globe at zoom z (none, or one the globe
  // can't show: where the drops are).
  function aim(i, z) {
    var d = list[i];
    if (!d || !hasPos(d)) return home(z);
    return { lng: d.lng, lat: clamp(d.lat, -80, 80), zoom: z, dive: 1 };
  }
  // What the globe faces: a centre, the zoom chosen with the buttons, wheel
  // or pinch, and a dive that multiplies it while a drop opens or closes.
  var view = home(1);
  // Diving: the drop dead centre, the globe six times bigger.
  function dive(i) {
    var d = list[i] || {};
    return hasPos(d) ? { lng: d.lng, lat: d.lat, zoom: view.zoom, dive: 6 } : aim(i, view.zoom);
  }
  function scale(v) { return R * v.zoom * v.dive; }
  function face(v) { proj.scale(scale(v)).translate([CX, CY]).rotate([-v.lng, -v.lat]); }

  function size() {
    var r = box.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    R = Math.min(W, H) * 0.42;
    CX = W / 2; CY = H / 2;
    if (hasGlobe) proj.clipExtent([[-2, -2], [W + 2, H + 2]]);
    halo = null;
    return true;
  }

  // The level of detail for the zoom, by scale rather than zoom: a phone's
  // smaller globe moves up a level later, and draws no more than it shows.
  function levelFor() {
    if (!index) return 0;
    var ze = R * view.zoom / index.R, lv = index.levels;
    for (var k = 0; k < lv.length - 1; k++) if (ze < lv[k].until) return k;
    return lv.length - 1;
  }
  // The longitudes and latitudes on screen, from points round its edge.
  function viewBox() {
    face(view);
    var lons = [], lats = [], c = view.lng;
    function take(x, y) {
      var g = proj.invert([x, y]);
      if (!g || !isFinite(g[0]) || !isFinite(g[1])) return;
      var lon = g[0];
      while (lon < c - 180) lon += 360;
      while (lon > c + 180) lon -= 360;
      lons.push(lon); lats.push(g[1]);
    }
    for (var k = 0; k <= 8; k++) { take(W * k / 8, 0); take(W * k / 8, H); take(0, H * k / 8); take(W, H * k / 8); }
    take(CX, CY);
    var b = { lon0: Math.min.apply(null, lons), lon1: Math.max.apply(null, lons),
              lat0: Math.min.apply(null, lats), lat1: Math.max.apply(null, lats) };
    var dx = (b.lon1 - b.lon0) * 0.1 + 0.2, dy = (b.lat1 - b.lat0) * 0.1 + 0.2;
    b.lon0 -= dx; b.lon1 += dx; b.lat0 = Math.max(-90, b.lat0 - dy); b.lat1 = Math.min(90, b.lat1 + dy);
    // a pole in view: every longitude
    [[0, 90], [0, -90]].forEach(function (pole) {
      if (d3.geoDistance(pole, [view.lng, view.lat]) > Math.PI / 2) return;
      var p = proj(pole);
      if (p[0] < 0 || p[0] > W || p[1] < 0 || p[1] > H) return;
      b.lon0 = c - 180; b.lon1 = c + 180;
      if (pole[1] > 0) b.lat1 = 90; else b.lat0 = -90;
    });
    return b;
  }
  function inView(bx, vb) {
    if (bx[3] < vb.lat0 || bx[1] > vb.lat1) return false;
    for (var k = -1; k <= 1; k++) if (bx[0] + 360 * k <= vb.lon1 && bx[2] + 360 * k >= vb.lon0) return true;
    return false;
  }
  function fileNames(lv, vb) {
    var F = lv.file, n = 360 / F, have = index.files[lv.id] || [], out = [];
    var j0 = Math.max(0, Math.floor((vb.lat0 + 90) / F)), j1 = Math.min(180 / F - 1, Math.floor((vb.lat1 + 90) / F));
    for (var i = Math.floor((vb.lon0 + 180) / F); i <= Math.floor((vb.lon1 + 180) / F); i++)
      for (var j = j0; j <= j1; j++) {
        var key = (((i % n) + n) % n) + "_" + j, name = lv.id + "/" + key;
        if (have.indexOf(key) >= 0 && out.indexOf(name) < 0) out.push(name);
      }
    return out;
  }
  // What to draw: the level the zoom wants if its files for the part in
  // view are all here (asking for any that aren't), else the next coarser,
  // down to the whole globe. Never a mix, so the coast never jumps about.
  function mapNow() {
    var want = levelFor(), vb = want > 0 ? viewBox() : null;
    for (var L = want; L >= 0; L--) {
      var names = L === 0 ? ["0"] : L === 1 ? ["1"] : fileNames(index.levels[L], vb);
      var got = names.map(load), complete = got.every(function (f) { return f.ready; });
      if (!complete) continue;
      var pieces = [], places = [], centre = [view.lng, view.lat];
      got.forEach(function (f) {
        f.pieces.forEach(function (p) {
          var d = d3.geoDistance(p.c, centre);
          if (d - p.reach > Math.PI / 2) return;                // the far side
          if (L > 0 && !inView(p.box, vb)) return;               // off the screen
          p.near = d + p.reach < Math.PI / 2 - 0.01;             // nowhere near the horizon
          pieces.push(p);
        });
        places = places.concat(f.places);
      });
      return { level: L, pieces: pieces, places: places };
    }
    return { level: 0, pieces: [], places: [] };
  }

  // The rim with the window glow, and a bezel of ash ticks as on the street
  // map. They don't turn with the globe, and the glow is the costliest thing
  // on it, so they are drawn once for a size and stamped on every frame,
  // stretched while the globe zooms or dives.
  function drawHalo(s) {
    var c = document.createElement("canvas");
    c.width = canvas.width; c.height = canvas.height;
    var h = c.getContext("2d");
    h.setTransform(DPR, 0, 0, DPR, 0, 0);
    h.beginPath(); h.arc(CX, CY, s, 0, 2 * Math.PI);
    h.shadowColor = "rgba(255,22,9,.6)"; h.shadowBlur = 26;
    h.lineWidth = 1.5; h.strokeStyle = RED; h.stroke();
    h.shadowBlur = 0; h.strokeStyle = ASH; h.lineWidth = 1; h.globalAlpha = 0.55;
    h.beginPath();
    for (var a = 0; a < 360; a += 5) {
      var t = a * Math.PI / 180, long = a % 30 === 0, r0 = s + 7, r1 = s + (long ? 15 : 11);
      h.moveTo(CX + r0 * Math.cos(t), CY + r0 * Math.sin(t));
      h.lineTo(CX + r1 * Math.cos(t), CY + r1 * Math.sin(t));
    }
    h.stroke();
    return { s: s, c: c };
  }

  // Graticule: every 15 degrees on the whole globe, every 5 closer in and
  // every degree closest, made only for the part in view.
  var gratKey = "", gratLines = null;
  function graticule(v) {
    var z = v.zoom * v.dive, step = z < 3 ? 15 : z < 12 ? 5 : 1;
    var reach = Math.asin(Math.min(1, Math.hypot(CX, CY) / scale(v))) * 180 / Math.PI;
    var g = d3.geoGraticule().step([step, step]), key = String(step);
    if (reach < 60) {
      var lat0 = clamp(Math.floor((v.lat - reach) / step - 1) * step, -90, 90),
          lat1 = clamp(Math.ceil((v.lat + reach) / step + 1) * step, -90, 90),
          far = Math.max(Math.abs(lat0), Math.abs(lat1)),
          span = far >= 89 ? 180 : Math.min(180, reach / Math.cos(far * Math.PI / 180)),
          lng0 = span >= 180 ? -180 : Math.floor((v.lng - span) / step - 1) * step,
          lng1 = span >= 180 ? 180 : Math.ceil((v.lng + span) / step + 1) * step;
      g.extent([[lng0, lat0], [lng1, lat1]]);
      key = [step, lat0, lat1, lng0, lng1].join();
    }
    if (key !== gratKey) { gratKey = key; gratLines = g(); }
    return gratLines;
  }

  // The view as three directions: C out of the screen at its centre, E and
  // N across it to the east and north. A point lands on the screen at its
  // parts along E and N (the orthographic projection), and its part along C
  // says whether it is in front of the horizon or behind it.
  var FC = [1, 0, 0], FE = [0, 1, 0], FN = [0, 0, 1], FS = 1;
  function frame() {
    var l = view.lng * RAD, f = view.lat * RAD, cl = Math.cos(l), sl = Math.sin(l), cf = Math.cos(f), sf = Math.sin(f);
    FC = [cf * cl, cf * sl, sf]; FE = [-sl, cl, 0]; FN = [-sf * cl, -sf * sl, cf]; FS = scale(view);
  }
  // A ring or a line into the path. fold: points behind the horizon go onto
  // it at their own bearing, so a shape across it is cut off by the globe's
  // edge, as the eye would see it.
  function ring(v, fold, closing) {
    for (var k = 0; k < v.length; k += 3) {
      var X = v[k], Y = v[k + 1], Z = v[k + 2];
      var x = X * FE[0] + Y * FE[1], y = X * FN[0] + Y * FN[1] + Z * FN[2];
      if (fold && X * FC[0] + Y * FC[1] + Z * FC[2] < 0) { var m = Math.hypot(x, y) || 1; x /= m; y /= m; }
      if (k) ctx.lineTo(CX + FS * x, CY - FS * y); else ctx.moveTo(CX + FS * x, CY - FS * y);
    }
    if (closing) ctx.closePath();
  }
  // A line across the horizon: drawn up to it, and on again from it.
  function cutLine(v) {
    var px = 0, py = 0, pz = 0, down = false;
    for (var k = 0; k < v.length; k += 3) {
      var X = v[k], Y = v[k + 1], Z = v[k + 2];
      var x = X * FE[0] + Y * FE[1], y = X * FN[0] + Y * FN[1] + Z * FN[2], z = X * FC[0] + Y * FC[1] + Z * FC[2];
      if (z >= 0) {
        if (down) ctx.lineTo(CX + FS * x, CY - FS * y);
        else {
          if (k) { var t = pz / (pz - z); ctx.moveTo(CX + FS * (px + (x - px) * t), CY - FS * (py + (y - py) * t)); ctx.lineTo(CX + FS * x, CY - FS * y); }
          else ctx.moveTo(CX + FS * x, CY - FS * y);
          down = true;
        }
      } else if (down) {
        var u = pz / (pz - z);
        ctx.lineTo(CX + FS * (px + (x - px) * u), CY - FS * (py + (y - py) * u));
        down = false;
      }
      px = x; py = y; pz = z;
    }
  }
  // Land or lakes into the path: in front, as they are; behind, not at all;
  // across the horizon, folded onto it.
  function shapes(pieces, layer) {
    ctx.beginPath();
    pieces.forEach(function (p) {
      (p[layer] || []).forEach(function (s) {
        var fold = false;
        if (!p.near) {
          var d = Math.acos(clamp(s.c[0] * FC[0] + s.c[1] * FC[1] + s.c[2] * FC[2], -1, 1));
          if (d - s.reach > Math.PI / 2) return;
          fold = d + s.reach > Math.PI / 2 - 0.01;
        }
        s.v.forEach(function (v) { ring(v, fold, true); });
      });
    });
  }
  function stroke(pieces, layer, width, colour, alpha, dash) {
    ctx.beginPath();
    pieces.forEach(function (p) {
      (p[layer] || []).forEach(function (item) {
        (item.v || [item]).forEach(function (v) {           // a lake's rings, or a line
          if (p.near) ring(v, false, false); else cutLine(v);
        });
      });
    });
    ctx.lineWidth = width; ctx.strokeStyle = colour; ctx.globalAlpha = alpha;
    if (dash) ctx.setLineDash(dash);
    ctx.stroke();
    if (dash) ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  function draw() {
    if (!hasGlobe || !W) return;
    var s = scale(view), rest = clamp(1.6 - view.dive * 0.6, 0, 1);   // 1 at rest, 0 diving
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    face(view);

    // sea: ember, lit from the upper left by the one chroma
    ctx.beginPath(); ctx.arc(CX, CY, s, 0, 2 * Math.PI);
    ctx.fillStyle = EMBER; ctx.fill();
    var lit = ctx.createRadialGradient(CX - s * .38, CY - s * .42, s * .05, CX, CY, s * 1.02);
    lit.addColorStop(0, "rgba(255,22,9,.16)"); lit.addColorStop(.6, "rgba(255,22,9,.05)"); lit.addColorStop(1, "rgba(255,22,9,0)");
    ctx.fillStyle = lit; ctx.fill();

    // the map: land in slate, lakes in the sea's ember, borders in taupe
    // over a dark edge, so they hold their own against the land, thickening
    // as the globe comes in; state lines the same, dashed, lighter and
    // fading in; the coast in ash
    var map = mapNow(), pieces = map.pieces;
    frame();
    shapes(pieces, "land");
    ctx.fillStyle = SLATE; ctx.fill();
    shapes(pieces, "lakes");
    ctx.fillStyle = EMBER; ctx.fill();
    var ze = index ? R * view.zoom / index.R : view.zoom;
    var bw = clamp(1.2 + 0.2 * Math.log2(view.zoom), 1.2, 2.2);
    stroke(pieces, "states", bw * 0.6, TAUPE, 0.55 * clamp((ze - 1.3) / 2, 0, 1), [4, 3]);
    stroke(pieces, "borders", bw + 1.6, EMBER, 0.45);
    stroke(pieces, "borders", bw, TAUPE, 0.9);
    stroke(pieces, "lakes", 0.6, ASH, 0.7);
    stroke(pieces, "coast", 0.7, ASH, 0.85);

    // a linen sheen where the light falls, over land and sea alike
    ctx.beginPath(); ctx.arc(CX, CY, s, 0, 2 * Math.PI);
    var sheen = ctx.createRadialGradient(CX - s * .4, CY - s * .45, 0, CX - s * .2, CY - s * .2, s * 1.1);
    sheen.addColorStop(0, "rgba(232,226,220,.10)"); sheen.addColorStop(1, "rgba(232,226,220,0)");
    ctx.fillStyle = sheen; ctx.fill();

    // instruments: the graticule, the equator a little stronger
    ctx.beginPath(); path(graticule(view));
    ctx.lineWidth = 0.6; ctx.strokeStyle = RED; ctx.globalAlpha = 0.17; ctx.stroke();
    ctx.beginPath(); path({ type: "LineString", coordinates: [[-180, 0], [-90, 0], [0, 0], [90, 0], [180, 0]] });
    ctx.globalAlpha = 0.34; ctx.stroke(); ctx.globalAlpha = 1;

    // the rim and bezel while they are on screen, faded out as the globe dives
    if (rest > 0 && s - 3 < Math.hypot(CX, CY)) {
      if (!halo || (!inMotion && Math.abs(halo.s - s) > 0.5)) halo = drawHalo(s);
      var k = s / halo.s;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = rest;
      ctx.drawImage(halo.c, CX * DPR * (1 - k), CY * DPR * (1 - k), canvas.width * k, canvas.height * k);
      ctx.restore();
    }

    // the drops are laid out first, then the prompt and the callout, so the
    // names on the map make way for all three; the drops are drawn last, on top
    var lay = layoutDrops(), avoid = dropBoxes(lay);
    var kbox = placeCard(lay, rest, avoid);
    if (kbox) avoid.push(kbox);
    var cbox = placeCallout(lay, rest, avoid);
    if (cbox) avoid.push(cbox);
    placeHits = [];
    if (rest > 0.98) drawPlaces(map.places.concat(marks), avoid);
    drawDrops(lay, rest);
    zoomButtons();
    if (sel >= 0) zoomLabels();
  }

  /* --- the drops on the globe --------------------------------------------- */
  // Points grow with the zoom (a fifth power: about twice the size at 32x),
  // and the room each needs grows with them.
  function radii() {
    var g = Math.pow(view.zoom, 0.2);
    return { dot: 3.2 * g, sel: 4.5 * g, room: Math.max(18, 9 * g + 9) };
  }
  var hits = [];
  function layoutDrops() {
    var centre = [view.lng, view.lat], pts = [], rr = radii(), shown = null;
    list.forEach(function (d) {
      if (!hasPos(d) || d3.geoDistance([d.lng, d.lat], centre) > Math.PI / 2 - 0.02) return;
      var p = proj([d.lng, d.lat]);
      pts.push({ i: d.i, at: p, x: p[0], y: p[1], r: d.i === sel ? rr.sel : rr.dot });
    });
    spreadOut(pts, rr.room);
    hits = pts;
    pts.forEach(function (q) { if (q.i === sel) shown = q; });
    return { pts: pts, shown: shown, rr: rr, labels: (index ? R * view.zoom / index.R : view.zoom) >= 3 };
  }
  // A drop's number sits on the side away from the spot it was moved off
  // (the outside of its ring), or to the right of a drop that wasn't moved.
  var NUM_W = 23;                       // three digits of the pixel face at 7px
  function numberAt(q) {
    var dx = q.x - q.at[0], dy = q.y - q.at[1], d = Math.hypot(dx, dy);
    var right = d < 2 || dx >= -0.3 * d;
    var x = right ? q.x + q.r + 4 : q.x - q.r - 4 - NUM_W;
    return { x: x, y: q.y + (d < 2 ? 0 : (dy / d) * 4), box: [x - 1, q.y - 6, x + NUM_W + 1, q.y + 6] };
  }
  // the room the drops, their numbers and the pointer take on screen
  function dropBoxes(lay) {
    var out = [];
    lay.pts.forEach(function (q) {
      var pad = q.r + 4;
      out.push([q.x - pad, q.y - pad, q.x + pad, q.y + pad]);
      if (lay.labels && q !== lay.shown) out.push(numberAt(q).box);
    });
    if (lay.shown) {
      var s = lay.shown;
      out.push([s.x + s.r, s.y - s.r - 40, s.x + s.r + 42, s.y - s.r]);
    }
    return out;
  }

  // Drops within `room` of each other (directly or through a neighbour)
  // form a group, set out on a ring around the group's middle in the order
  // they really lie round it, turned to match (in San Francisco, Alcatraz
  // is the top one). As the zoom parts them, the ring eases into their true
  // places; by the time they are `room` apart they are there. A drop with
  // room around it never moves.
  function spreadOut(pts, room) {
    var up = pts.map(function (q, k) { return k; });
    function top(k) { while (up[k] !== k) k = up[k] = up[up[k]]; return k; }
    var a, b, p, q;
    for (a = 0; a < pts.length; a++) for (b = a + 1; b < pts.length; b++)
      if (Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y) < room) up[top(a)] = top(b);
    var groups = {};
    pts.forEach(function (q, k) { (groups[top(k)] = groups[top(k)] || []).push(q); });
    Object.keys(groups).forEach(function (key) {
      var g = groups[key], n = g.length;
      if (n < 2) return;
      var cx = 0, cy = 0, near = Infinity;
      g.forEach(function (q) { cx += q.x / n; cy += q.y / n; });
      for (a = 0; a < n; a++) for (b = a + 1; b < n; b++)
        near = Math.min(near, Math.hypot(g[a].x - g[b].x, g[a].y - g[b].y));
      g.forEach(function (q, k) {
        var dx = q.x - cx, dy = q.y - cy;
        q.bearing = Math.hypot(dx, dy) > 1e-9 ? Math.atan2(dy, dx) : k * 2.4;   // the very same spot
      });
      g.sort(function (p, q) { return p.bearing - q.bearing; });
      // turn the ring to sit as close as it can to the true bearings
      var sx = 0, sy = 0, step = 2 * Math.PI / n;
      g.forEach(function (q, k) { sx += Math.cos(q.bearing - k * step); sy += Math.sin(q.bearing - k * step); });
      var turn = Math.atan2(sy, sx), r = room / (2 * Math.sin(Math.PI / n));
      var real = Math.pow(Math.min(1, near / room), 2);         // 0 together .. 1 apart
      g.forEach(function (q, k) {
        var x = cx + r * Math.cos(turn + k * step), y = cy + r * Math.sin(turn + k * step);
        q.x = x + (q.x - x) * real; q.y = y + (q.y - y) * real;
      });
    });
    // whatever still overlaps (a ring against a neighbour): pushed apart
    for (var round = 0; round < 40; round++) {
      var again = false;
      for (a = 0; a < pts.length; a++) for (b = a + 1; b < pts.length; b++) {
        p = pts[a]; q = pts[b];
        var dx = q.x - p.x, dy = q.y - p.y, gap = Math.hypot(dx, dy);
        if (gap >= room - 0.01) continue;
        if (gap < 1e-6) { dx = Math.cos(b * 2.4); dy = Math.sin(b * 2.4); gap = 1; }   // the very same spot
        var push = (room - gap) / 2 / gap;
        p.x -= dx * push; p.y -= dy * push; q.x += dx * push; q.y += dy * push;
        again = true;
      }
      if (!again) break;
    }
  }

  function drawDrops(lay, rest) {
    var pts = lay.pts, shown = lay.shown;
    // threads from moved points back to where the drops are, marked in ash
    var moved = pts.filter(function (q) { return Math.hypot(q.x - q.at[0], q.y - q.at[1]) > 2; });
    if (moved.length) {
      ctx.save();
      ctx.beginPath();
      moved.forEach(function (q) { ctx.moveTo(q.at[0], q.at[1]); ctx.lineTo(q.x, q.y); });
      ctx.lineWidth = 1; ctx.strokeStyle = RED; ctx.globalAlpha = 0.6; ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = ASH;
      ctx.beginPath();
      moved.forEach(function (q) { ctx.moveTo(q.at[0] + 2, q.at[1]); ctx.arc(q.at[0], q.at[1], 2, 0, 2 * Math.PI); });
      ctx.fill();
      ctx.restore();
    }
    if (shown) pointer(shown, rest);            // under the points, so it hides none
    var others = pts.filter(function (q) { return q !== shown; });
    var claimed = others.filter(function (q) { return list[q.i].claimed !== null; });
    var open = others.filter(function (q) { return list[q.i].claimed === null; });
    dots(open.filter(function (q) { return !list[q.i].isNew; }), LINEN, 9);
    dots(open.filter(function (q) { return list[q.i].isNew; }), RED, 9);
    rings(claimed, ASH);                        // claimed: hollow, the item is gone
    if (shown) dots([shown], BONE, 14);
    // the pointed-at drop gets a ring of its own
    var hv = hover && hover.drop != null && hover.drop !== sel && pts.filter(function (q) { return q.i === hover.drop; })[0];
    if (hv) {
      ctx.beginPath(); ctx.arc(hv.x, hv.y, hv.r + 5, 0, 2 * Math.PI);
      ctx.lineWidth = 1; ctx.strokeStyle = LINEN; ctx.globalAlpha = 0.8; ctx.stroke(); ctx.globalAlpha = 1;
    }
    // numbers beside the points once there is room for them
    if (lay.labels) {
      ctx.save();
      ctx.font = "7px 'Press Start 2P', monospace"; ctx.textBaseline = "middle";
      ctx.lineJoin = "round"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(10,0,0,.85)";
      others.forEach(function (q) {
        var at = numberAt(q);
        ctx.strokeText(list[q.i].n, at.x, at.y);
        ctx.fillStyle = list[q.i].claimed !== null ? ASH : LINEN;
        ctx.fillText(list[q.i].n, at.x, at.y);
      });
      ctx.restore();
    }
  }

  // Points of one colour as one shape: the glow is the costly part of a
  // point, and this way it is drawn once for all of them.
  function dots(qs, colour, blur) {
    if (!qs.length) return;
    ctx.save();
    ctx.shadowColor = RED; ctx.shadowBlur = blur;
    ctx.beginPath();
    qs.forEach(function (q) { ctx.moveTo(q.x + q.r, q.y); ctx.arc(q.x, q.y, q.r, 0, 2 * Math.PI); });
    ctx.fillStyle = colour; ctx.fill();
    ctx.restore();
  }
  function rings(qs, colour) {
    if (!qs.length) return;
    ctx.save();
    ctx.beginPath();
    qs.forEach(function (q) { ctx.moveTo(q.x + q.r, q.y); ctx.arc(q.x, q.y, q.r, 0, 2 * Math.PI); });
    ctx.fillStyle = "rgba(10,0,0,.8)"; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = colour; ctx.stroke();
    ctx.restore();
  }

  // The pointer from the reference screen: a red wedge aimed at the point,
  // with a ring around it.
  function pointer(q, rest) {
    ctx.save();
    ctx.beginPath(); ctx.arc(q.x, q.y, q.r + 6.5, 0, 2 * Math.PI);
    ctx.lineWidth = 1.2; ctx.strokeStyle = RED; ctx.stroke();
    ctx.globalAlpha = Math.max(rest, 0.35);
    var tx = q.x + q.r + 2.5, ty = q.y - q.r - 2.5;
    ctx.shadowColor = "rgba(255,22,9,.8)"; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + 34, ty - 12); ctx.lineTo(tx + 14, ty - 32);
    ctx.closePath(); ctx.fillStyle = RED; ctx.fill();
    ctx.restore();
  }

  /* --- the prompt and the callout ------------------------------------------ */
  // The prompt sits by the chosen drop whenever the globe is still: all
  // there is to say about it (see describe) and OPEN DROP, the way into it.
  // The callout says what the mouse (or a tap) is on: another drop, much as
  // the prompt does, or a city, a peak, a landmark. Each keeps clear of the
  // points, the pointer, the zoom buttons and the other.
  var hover = null;                     // { drop: i } or { place: [...] }, under the mouse
  var calloutKey = "", cardKey = "", wantFocus = false, focusLate = 0;
  // the prompt's x: closes it, the keyboard going back to the drop's row
  var closer = el("button", "dw-x");
  closer.type = "button";
  closer.title = "Close (Esc)";
  closer.setAttribute("aria-label", "Close");
  closer.innerHTML = '<svg viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7"/></svg>';
  closer.addEventListener("click", function (ev) { var i = sel; select(-1); if (!ev.detail) focusRow(i); });
  function dropHead(box, d) {
    box.appendChild(el("b", null, "Drop #" + d.n));
    box.appendChild(el("span", "dw-place", d.place));
  }
  var KIND = { c: "Country", s: "State / province", k: "Capital", t: "City", p: "Peak", l: "Landmark" };
  function placeLines(pl) {
    var kind = pl[0], note = pl[6], what = KIND[kind];
    if (kind === "l") return note ? [["b", pl[1]], ["span", note]] : [["b", pl[1]], ["span", what]];
    if (kind === "p" && note) what += " · " + Number(note).toLocaleString("en-US") + " m";
    else if (note) what += " · " + note;
    return [["b", pl[1]], ["span", what]];
  }
  function fill(box, lines) {
    lines.forEach(function (l) { box.appendChild(el(l[0], null, l[1])); });
  }
  function onScreen(x, y) { return x >= 0 && x <= W && y >= 0 && y <= H; }

  // Up and right of the point if it fits, else the first place round it
  // that keeps clear of everything in avoid and of the zoom buttons (on a
  // phone the left is where they are), else the least bad.
  function placeBox(box, px, py, r, avoid) {
    var cw = box.offsetWidth, ch = box.offsetHeight, o = r + 44;
    var clear = avoid.concat([[zoomBox.offsetLeft - 6, zoomBox.offsetTop - 6,
      zoomBox.offsetLeft + zoomBox.offsetWidth + 6, zoomBox.offsetTop + zoomBox.offsetHeight + 6]]);
    var best = null;
    [[px + o, py - o - 26], [px - o - cw, py - o - 26], [px + o, py + o - 18], [px - o - cw, py + o - 18],
     [px - cw / 2, py + r + 26], [px - cw / 2, py - r - 46 - ch]].forEach(function (c) {
      var x = clamp(c[0], 8, W - cw - 8), y = clamp(c[1], 8, H - ch - 8), cost = 0;
      clear.forEach(function (a) {
        cost += Math.max(0, Math.min(x + cw, a[2]) - Math.max(x, a[0])) *
                Math.max(0, Math.min(y + ch, a[3]) - Math.max(y, a[1]));
      });
      if (!best || cost < best.cost) best = { x: x, y: y, cost: cost };
    });
    box.style.left = best.x + "px";
    box.style.top = best.y + "px";
    return [best.x, best.y, best.x + cw, best.y + ch];
  }

  // The prompt: while the globe is still and the drop on screen (or while
  // the keyboard is on its button, so moving the globe doesn't lose it). It
  // pops in each time it opens.
  function placeCard(lay, rest, avoid) {
    var q = lay.shown, held = card.contains(document.activeElement);
    if (docked() || !q || !onScreen(q.x, q.y) || rest < 0.9 || (inMotion && !held)) {
      card.hidden = true; cardKey = "";
      return null;
    }
    var d = list[sel];
    if (cardKey !== "d" + sel) {
      cardKey = "d" + sel;
      card.textContent = "";
      card.appendChild(closer);
      dropHead(card, d);
      describe(card, d, "prompt");
      card.hidden = false;
      card.classList.remove("is-in");
      void card.offsetWidth;                   // restart the pop
      card.classList.add("is-in");
    }
    card.hidden = false;
    var b = placeBox(card, q.x, q.y, q.r, avoid);
    if (wantFocus) { wantFocus = false; card.querySelector(".dw-open").focus({ preventScroll: true }); }
    return b;
  }
  // Enter on a row goes on to the prompt's OPEN DROP: at once when it opens
  // under the row, or as soon as the globe has flown and it opens there.
  function promptFocus() {
    clearTimeout(focusLate);
    if (sel < 0) return;
    var under = docked() && mores[sel].querySelector(".dw-open");
    if (under) { under.focus({ preventScroll: true }); return; }
    if (!card.hidden && !inMotion) { card.querySelector(".dw-open").focus({ preventScroll: true }); return; }
    wantFocus = true;
    focusLate = setTimeout(function () { wantFocus = false; }, 2400);
  }

  // The callout: what the mouse or a tap is on. Not the chosen drop, whose
  // prompt by its point says all that already; but where that prompt is
  // under the drop's row (a narrow window), its point says it too.
  function placeCallout(lay, rest, avoid) {
    var target = null;
    if (hover && hover.drop != null && (hover.drop !== sel || docked())) {
      var q = lay.pts.filter(function (p) { return p.i === hover.drop; })[0], d = q && list[q.i];
      if (q) target = { key: "d" + q.i, x: q.x, y: q.y, r: q.r,
                        make: function (box) { dropHead(box, d); describe(box, d, "popup"); } };
    } else if (hover && hover.place) {
      var pl = hover.place;
      if (d3.geoDistance([pl[2], pl[3]], [view.lng, view.lat]) < Math.PI / 2) {
        var pp = proj([pl[2], pl[3]]);
        target = { key: "p" + pl[0] + pl[1] + pl[2], x: pp[0], y: pp[1], r: 4,
                   make: function (box) { fill(box, placeLines(pl)); } };
      }
    }
    // nothing to point at on screen: no callout (not one pinned in a corner)
    if (target && !onScreen(target.x, target.y)) target = null;
    if (!target) { callout.hidden = true; calloutKey = ""; return null; }
    if (target.key !== calloutKey) {
      calloutKey = target.key;
      callout.textContent = "";
      target.make(callout);
      callout.classList.toggle("is-drop", target.key.charAt(0) === "d");
    }
    callout.hidden = false;
    return placeBox(callout, target.x, target.y, target.r, avoid);
  }

  /* --- names on the map ------------------------------------------------------ */
  // Countries, states, capitals, cities, peaks and landmarks, each from the
  // zoom Natural Earth gives it (landmarks: their own). The most important
  // first; a name that would overlap one already down, a drop or the
  // callout is left out.
  var STYLE = {
    c: { font: "8px 'Press Start 2P', monospace", size: 8, fill: TAUPE, alpha: 0.8, upper: true },
    s: { font: "bold 9px Arial, Helvetica, sans-serif", size: 9, fill: ASH, alpha: 1, upper: true },
    k: { font: "bold 11px Arial, Helvetica, sans-serif", size: 11, fill: LINEN, alpha: 0.95, mark: "square" },
    t: { font: "11px Arial, Helvetica, sans-serif", size: 11, fill: LINEN, alpha: 0.85, mark: "dot" },
    p: { font: "italic 10px Arial, Helvetica, sans-serif", size: 10, fill: TAUPE, alpha: 0.9, mark: "peak" },
    l: { font: "11px Arial, Helvetica, sans-serif", size: 11, fill: LINEN, alpha: 0.95, mark: "diamond" }
  };
  var ORDER = { l: 0, c: 1, k: 2, t: 3, s: 4, p: 5 };
  var widths = {}, placeHits = [];
  function textWidth(font, text) {
    var k = font + "|" + text;
    if (!(k in widths)) { ctx.font = font; widths[k] = ctx.measureText(text).width; }
    return widths[k];
  }
  function drawPlaces(all, placed) {
    var zw = Math.log2(R * view.zoom / 40.74) - LABEL_BIAS, centre = [view.lng, view.lat], cand = [];
    all.forEach(function (pl) {
      if (pl[4] > zw || zw > pl[5] + 0.5) return;
      if (d3.geoDistance([pl[2], pl[3]], centre) > 1.2) return;   // squeezed on the horizon
      var p = proj([pl[2], pl[3]]);
      if (p[0] < -40 || p[0] > W + 40 || p[1] < -10 || p[1] > H + 10) return;
      cand.push({ pl: pl, x: p[0], y: p[1] });
    });
    // A landmark goes down as if it showed a zoom and a half sooner than it
    // does: ahead of the towns and peaks round it, still after the cities.
    // Come in to twice its own zoom and it goes before every name, the city
    // it stands in included: that close, it is what there is to see (and
    // its note names the city).
    var deep = Math.log2(view.zoom * REF_R / 40.74);
    function rank(pl) {
      if (pl[0] !== "l") return pl[4];
      return deep >= pl[4] + 1 ? pl[4] - 100 : pl[4] - 1.5;
    }
    cand.sort(function (a, b) { return (rank(a.pl) - rank(b.pl)) || (ORDER[a.pl[0]] - ORDER[b.pl[0]]); });
    if (cand.length > 400) cand.length = 400;
    // where the landmarks stand: a landmark's name keeps off the others'
    // marks where it can, so two close together both show (Christ the
    // Redeemer and Sugarloaf, Horseshoe Bend and Antelope Canyon)
    var marks = cand.filter(function (c) { return c.pl[0] === "l"; });
    function onMark(c, b) {
      return marks.some(function (o) {
        return o !== c && b[0] < o.x + 5 && o.x - 5 < b[2] && b[1] < o.y + 5 && o.y - 5 < b[3];
      });
    }
    function free(b) {
      if (b[0] < 2 || b[2] > W - 2 || b[1] < 2 || b[3] > H - 2) return false;
      for (var k = 0; k < placed.length; k++) {
        var a = placed[k];
        if (b[0] < a[2] && a[0] < b[2] && b[1] < a[3] && a[1] < b[3]) return false;
      }
      return true;
    }
    ctx.save();
    ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    cand.forEach(function (c) {
      var st = STYLE[c.pl[0]], text = st.upper ? c.pl[1].toUpperCase() : c.pl[1];
      var w = textWidth(st.font, text), h = st.size + 2, x = c.x, y = c.y, spot = null;
      if (!st.mark) {
        var b = [x - w / 2 - 2, y - h / 2, x + w / 2 + 2, y + h / 2];
        if (free(b)) spot = { b: b, tx: x - w / 2, ty: y };
      } else {
        var m = [x - 4, y - 4, x + 4, y + 4], sides = [[x + 7, y], [x - 7 - w, y], [x - w / 2, y - 11], [x - w / 2, y + 11]];
        [c.pl[0] === "l", false].some(function (shy) {        // a landmark: first a side clear of the others
          return sides.some(function (o) {
            var b2 = [o[0] - 2, o[1] - h / 2, o[0] + w + 2, o[1] + h / 2];
            if (!free(b2) || !free(m) || (shy && onMark(c, b2))) return false;
            spot = { b: b2, m: m, tx: o[0], ty: o[1] };
            return true;
          });
        });
      }
      if (!spot) return;
      placed.push(spot.b);
      if (spot.m) { placed.push(spot.m); mark(st.mark, x, y); placeHits.push({ x: x, y: y, pl: c.pl }); }
      ctx.font = st.font;
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(10,0,0,.85)"; ctx.globalAlpha = 1;
      ctx.strokeText(text, spot.tx, spot.ty);
      ctx.fillStyle = st.fill; ctx.globalAlpha = st.alpha;
      ctx.fillText(text, spot.tx, spot.ty);
      ctx.globalAlpha = 1;
    });
    ctx.restore();
  }
  function mark(kind, x, y) {
    ctx.beginPath();
    if (kind === "dot") { ctx.arc(x, y, 2, 0, 2 * Math.PI); ctx.fillStyle = LINEN; ctx.fill(); return; }
    if (kind === "square") { ctx.rect(x - 2.5, y - 2.5, 5, 5); ctx.fillStyle = LINEN; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = "rgba(10,0,0,.85)"; ctx.stroke(); return; }
    if (kind === "peak") { ctx.moveTo(x, y - 3.5); ctx.lineTo(x + 3.5, y + 2.5); ctx.lineTo(x - 3.5, y + 2.5); ctx.closePath(); ctx.fillStyle = TAUPE; ctx.fill(); return; }
    // a landmark: the street map's red diamond, outlined
    ctx.moveTo(x, y - 4.5); ctx.lineTo(x + 4.5, y); ctx.lineTo(x, y + 4.5); ctx.lineTo(x - 4.5, y); ctx.closePath();
    ctx.fillStyle = "rgba(10,0,0,.85)"; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = RED; ctx.stroke();
  }

  /* --- moving the globe ---------------------------------------------------- */
  var anim = 0;
  function ease(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function easeIn(t) { return t * t * t; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  // Turn along the great circle from where the globe is to `to`, zooming and
  // diving in step (on a log scale, so each doubling takes as long). A long
  // way at a close zoom rises out on the way and comes back down, as a
  // flight would, rather than smearing the ground past.
  // flight: a way worked out by flyTo, which the turn follows instead.
  function turnTo(to, ms, curve, flight) {
    var me = ++anim;
    if (!hasGlobe || reduceMotion || !ms || !W) { inMotion = false; view = to; draw(); return Promise.resolve(); }
    var from = view, a = [from.lng, from.lat], b = [to.lng, to.lat];
    var arc = d3.geoInterpolate(a, b), far = d3.geoDistance(a, b);
    var z0 = Math.log(from.zoom), z1 = Math.log(to.zoom), v0 = Math.log(from.dive), v1 = Math.log(to.dive);
    var fits = Math.log(Math.max(1, 1.9 / Math.max(far, 1e-9)));   // the zoom that shows both ends
    var dip = flight ? 0 : Math.max(0, (z0 + z1) / 2 - fits);
    if (dip > 0.3) ms *= 1.4;
    var t0 = performance.now();
    inMotion = true;
    return new Promise(function (done) {
      (function step(t) {
        if (me !== anim) return done();
        var k = Math.min(1, (t - t0) / ms), e = (curve || ease)(k), u = e, z;
        if (flight) { var f = flight(e); u = clamp(f[0], 0, 1); z = clamp(f[1], 1, ZOOM_MAX); }
        else z = Math.exp(z0 + (z1 - z0) * e - dip * 4 * e * (1 - e));
        var ll = arc(u);
        view = { lng: ll[0], lat: ll[1], zoom: z, dive: Math.exp(v0 + (v1 - v0) * e) };
        if (k >= 1) { inMotion = false; view = to; }   // the last frame settles the callout
        draw();
        if (k < 1) requestAnimationFrame(step); else done();
      })(t0);
    });
  }

  // Fly to drop i (none: where the drops are) at zoom z, as close as the
  // globe goes unless told: the drop ends in the middle. The way is van Wijk
  // and Nuij's smooth zooming and panning, as d3's interpolateZoom draws it:
  // out as far as the distance needs, across, and back down, never losing
  // sight of where it is going. Its length sets the time it takes; pace
  // shortens that (pulling back out is quicker than going in).
  function flyTo(i, z, pace) {
    aimed = i;
    var to = aim(i, z || CLOSE);
    if (!hasGlobe || !W) { view = to; draw(); return Promise.resolve(); }
    var far = d3.geoDistance([view.lng, view.lat], [to.lng, to.lat]);
    var way = flight(view.zoom, to.zoom, far, clamp(W / R, 2, 3.5));
    return turnTo(to, clamp(250 + way.length * 330, 550, 1500) * (pace || 1), ease, way.at);
  }
  // From zoom z0 to z1 over d radians, the screen spanning `span` radians
  // at zoom 1. at(t): how far along the way (0..1), and the zoom.
  function flight(z0, z1, d, span) {
    var w0 = span / z0, w1 = span / z1, S, at;
    if (d < 1e-6) {
      S = Math.log(w1 / w0) / Math.SQRT2;
      at = function (t) { return [t, span / (w0 * Math.exp(Math.SQRT2 * t * S))]; };
    } else {
      var b0 = (w1 * w1 - w0 * w0 + 4 * d * d) / (4 * w0 * d),
          b1 = (w1 * w1 - w0 * w0 - 4 * d * d) / (4 * w1 * d),
          r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0),
          r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1), c0 = Math.cosh(r0);
      S = (r1 - r0) / Math.SQRT2;
      at = function (t) {
        var r = Math.SQRT2 * t * S + r0;
        return [w0 / (2 * d) * (c0 * Math.tanh(r) - Math.sinh(r0)), span * Math.cosh(r) / (w0 * c0)];
      };
    }
    return { at: at, length: Math.abs(S) };
  }
  // The prompt's ZOOM IN flies to its drop; ZOOM OUT, from as close as the
  // globe goes, back out to the whole globe, still on the drop.
  function zoomToggle() {
    if (sel < 0) return;
    if (view.zoom >= CLOSE - 1e-6) flyTo(sel, 1, 0.65); else flyTo(sel);
  }
  // the globe as close as it goes, on drop i
  function atDrop(i) {
    var d = list[i];
    return !!d && hasPos(d) && hasGlobe && view.zoom >= CLOSE - 1e-6 &&
           d3.geoDistance([d.lng, d.lat], [view.lng, view.lat]) * R * view.zoom < 4;
  }

  // Turn the globe so the ground at g (lng, lat) sits at screen point p, at
  // zoom z. A few rounds of "what is at p now, and how far off is it" land
  // it to well under a pixel.
  function placeAt(g, p, z) {
    var v = { lng: view.lng, lat: view.lat, zoom: z, dive: view.dive };
    for (var n = 0; n < 4; n++) {
      face(v);
      var h = proj.invert(p);
      if (!h || !isFinite(h[0]) || !isFinite(h[1])) break;
      v.lng += ((g[0] - h[0]) % 360 + 540) % 360 - 180;
      v.lat = clamp(v.lat + g[1] - h[1], -80, 80);
    }
    v.lng = ((v.lng + 180) % 360 + 360) % 360 - 180;
    view = v;
  }
  // The ground at screen point p, or null off the edge of the globe.
  function groundAt(p) {
    face(view);
    var g = proj.invert(p);
    return g && isFinite(g[0]) && isFinite(g[1]) ? g : null;
  }
  function zoomAbout(g, p, z) {
    if (g) placeAt(g, p, z);
    else view = { lng: view.lng, lat: view.lat, zoom: z, dive: view.dive };
  }

  // Zoom to z, keeping the ground at screen point p where it is. Unless
  // that is the chosen drop, the globe is no longer pointed at it.
  function zoomTo(z, p, ms, onDrop) {
    var me = ++anim, z0 = view.zoom, g = groundAt(p);
    if (!onDrop) aimed = -1;
    if (reduceMotion || !ms) { inMotion = false; zoomAbout(g, p, z); draw(); return; }
    var t0 = performance.now();
    inMotion = true;
    (function step(t) {
      if (me !== anim) return;
      var k = Math.min(1, (t - t0) / ms);
      zoomAbout(g, p, z0 * Math.pow(z / z0, ease(k)));
      if (k >= 1) inMotion = false;
      draw();
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }

  // A moment after the last wheel turn or pinch, the callout comes back.
  var settling = 0;
  function settleSoon() {
    clearTimeout(settling);
    settling = setTimeout(function () { inMotion = false; draw(); }, 160);
  }

  /* --- zoom ---------------------------------------------------------------- */
  var zoomBox = el("div", "dw-zoom");
  zoomBox.setAttribute("role", "group");
  zoomBox.setAttribute("aria-label", "Zoom");
  function zoomButton(cls, label, key, act) {
    var b = el("button", cls);
    b.type = "button";
    b.title = label + " (" + key + ")";
    b.setAttribute("aria-label", label);
    b.setAttribute("aria-keyshortcuts", key);
    b.addEventListener("click", act);
    zoomBox.appendChild(b);
    return b;
  }
  var zoomIn = zoomButton("dw-zoom-in", "Zoom in", "+", function () { zoomBy(1); });
  var zoomOut = zoomButton("dw-zoom-out", "Zoom out", "-", function () { zoomBy(-1); });
  var zoomAll = zoomButton("dw-zoom-all", "Whole globe", "0", whole);
  zoomAll.innerHTML = GLOBE;
  if (hasGlobe) box.appendChild(zoomBox);

  // + and -: a doubling at a time, about the chosen drop while the globe is
  // still pointed at it (so it stays where it is), otherwise about the
  // centre: dragged off to Europe, + goes into Europe, not back to the drop
  // sitting at the edge.
  function zoomBy(dir) {
    var l = Math.log2(view.zoom);
    var z = clamp(Math.pow(2, dir > 0 ? Math.floor(l + 1e-6) + 1 : Math.ceil(l - 1e-6) - 1), 1, ZOOM_MAX);
    var on = sel >= 0 && aimed === sel ? selOnScreen() : null;
    if (z !== view.zoom) zoomTo(z, on || [CX, CY], 380, !!on);
  }
  function selOnScreen() {
    var d = list[sel];
    if (!d || !hasPos(d) || d3.geoDistance([d.lng, d.lat], [view.lng, view.lat]) > Math.PI / 2 - 0.05) return null;
    face(view);
    var p = proj([d.lng, d.lat]);
    return p[0] > 8 && p[0] < W - 8 && p[1] > 8 && p[1] < H - 8 ? p : null;
  }
  // 0 and the globe button: back out to the whole globe, on the chosen drop
  // (none: where the drops are).
  function whole() {
    if (zoomAll.getAttribute("aria-disabled") !== "true") flyTo(sel, 1, 0.65);
  }

  // The buttons say when there is nothing left to do. They stay focusable
  // (aria-disabled, not disabled) so the keyboard doesn't lose its place.
  var zoomState = "";
  function zoomButtons() {
    var z = view.zoom, home = aim(sel, 1);
    var state = [z >= ZOOM_MAX - 1e-6, z <= 1.001,
                 z <= 1.001 && view.dive === 1 && Math.abs(view.lat - home.lat) < 0.5 &&
                 Math.abs(((view.lng - home.lng) % 360 + 540) % 360 - 180) < 0.5];
    if (state.join() === zoomState) return;
    zoomState = state.join();
    zoomIn.setAttribute("aria-disabled", state[0]);
    zoomOut.setAttribute("aria-disabled", state[1]);
    zoomAll.setAttribute("aria-disabled", state[2]);
  }

  /* --- choosing ------------------------------------------------------------ */
  // Choosing a drop: the list marks it, and its prompt opens (by its point
  // once the globe is still, or under its row on a phone). It is never
  // opened from here. how: "fly" takes the globe to it (the list), "stay"
  // leaves the globe where it is (a click on its point), "jump" turns the
  // globe to it at once, "hold" leaves it for a dive about to take it there.
  // Chosen again while the globe is on its way to it, or there already, the
  // globe carries on. -1 chooses none: the prompt closes.
  var aimed = -1;                       // the drop + and - zoom about, while the globe stays on it
  function select(i, how) {
    if (i >= 0 && !list[i]) return;
    var again = i === sel && aimed === i;
    if (i !== sel) wantFocus = false;
    sel = i;
    rowBtns.forEach(function (r, k) { r.setAttribute("aria-current", k === i ? "true" : "false"); });
    dock();
    if (i < 0) { aimed = -1; draw(); return; }
    if (hover && hover.drop === i) hover = null;      // its prompt says it now
    if (how === "hold") return;
    aimed = i;
    if (root.dataset.view !== "world") { view = aim(i, view.zoom); return; }
    if (how === "stay") { draw(); return; }
    if (how === "jump") { turnTo(aim(i, view.zoom), 0); return; }
    if (again && (inMotion || atDrop(i))) { draw(); return; }
    flyTo(i);
  }

  // Keys. World: arrows walk the list (choosing as they go), Enter on a
  // drop goes on to its OPEN DROP, + - 0 zoom. A drop: Esc goes back, and
  // the arrows pan the street map while it has focus. drops.js never sees
  // the arrows: it would step to the next drop, and a drop's screen shows
  // that one drop. With Alt, Ctrl or Cmd they are the browser's (Alt+Left
  // is Back).
  document.addEventListener("keydown", function (ev) {
    var t = ev.target;
    if (t && t.closest && t.closest("input, textarea, select, [contenteditable]")) return;
    var step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[ev.key];
    var plain = !(ev.altKey || ev.ctrlKey || ev.metaKey);
    if (step) {
      ev.stopImmediatePropagation();
      if (!plain) return;
      if (root.dataset.view === "world") {
        ev.preventDefault();
        rowBtns[clamp(sel + step, 0, list.length - 1)].focus();
      } else if (t && t.closest && t.closest(".leaflet-container")) {
        ev.preventDefault();
        panStreet(ev.key, ev.shiftKey);
      }
    } else if (root.dataset.view === "world") {
      if (ev.key === "Escape" && worldHelp && worldHelp.open) {
        worldHelp.open = false;
      } else if (ev.key === "Escape" && sel >= 0) {
        var was = sel, inPrompt = card.contains(t) || mores[was].contains(t);
        select(-1);
        if (inPrompt) focusRow(was);
      } else if (hasGlobe && plain && (ev.key === "+" || ev.key === "=")) {
        ev.preventDefault(); zoomBy(1);
      } else if (hasGlobe && plain && (ev.key === "-" || ev.key === "_")) {
        ev.preventDefault(); zoomBy(-1);
      } else if (hasGlobe && plain && ev.key === "0") {
        ev.preventDefault(); whole();
      }
    } else if (ev.key === "Escape") {
      var help = document.getElementById("dp-help");
      if (help && help.open) return;            // drops.js closes the help first
      ev.preventDefault();
      toWorldByHand();
    }
  }, true);

  // The street map pans with the arrows while it has focus, as Leaflet's
  // own keyboard would (that listens on the document, which the arrows no
  // longer reach).
  function panStreet(key, far) {
    var m = drops.map && drops.map();
    var n = far ? 240 : 80;
    var by = { ArrowLeft: [-n, 0], ArrowRight: [n, 0], ArrowUp: [0, -n], ArrowDown: [0, n] }[key];
    if (m && by) m.panBy(by, { animate: false });
  }

  // One finger or the mouse drags the globe round; two fingers pinch to
  // zoom. A click or tap on a point chooses it where it is (never opens it:
  // that is the prompt's OPEN DROP); a tap on a city, peak or landmark says
  // what it is; on bare globe, it closes the prompt.
  var drag = null, touches = {}, pinch = null;
  function twoFingers() {
    var ids = Object.keys(touches);
    if (ids.length !== 2) return null;
    var a = touches[ids[0]], b = touches[ids[1]], r = canvas.getBoundingClientRect();
    return { gap: Math.hypot(a.x - b.x, a.y - b.y), mid: [(a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top] };
  }
  function setHover(next) {
    var a = hover ? (hover.drop != null ? "d" + hover.drop : "p" + hover.place[1] + hover.place[2]) : "";
    var b = next ? (next.drop != null ? "d" + next.drop : "p" + next.place[1] + next.place[2]) : "";
    hover = next;
    if (a !== b) draw();
  }
  canvas.addEventListener("pointerdown", function (ev) {
    touches[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
    canvas.setPointerCapture(ev.pointerId);
    var two = twoFingers();
    if (two) {
      drag = null; anim++; inMotion = true; aimed = -1;
      pinch = { gap: Math.max(1, two.gap), zoom: view.zoom, g: groundAt(two.mid) };
      return;
    }
    drag = { x: ev.clientX, y: ev.clientY, moved: false, v: view };
  });
  canvas.addEventListener("pointermove", function (ev) {
    if (touches[ev.pointerId]) touches[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
    if (pinch) {
      var two = twoFingers();
      if (!two) return;
      zoomAbout(pinch.g, two.mid, clamp(pinch.zoom * two.gap / pinch.gap, 1, ZOOM_MAX));
      draw();
      return;
    }
    if (!drag) {
      // the mouse over a point or a name: say what it is
      var q = hit(ev), pl = q ? null : hitPlace(ev);
      canvas.style.cursor = q ? "pointer" : pl ? "help" : "grab";
      if (ev.pointerType === "mouse" || ev.pointerType === "pen") setHover(q ? { drop: q.i } : pl ? { place: pl } : null);
      return;
    }
    var dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true; anim++; inMotion = true; hover = null; aimed = -1;
    var k = 180 / Math.PI / scale(view);
    view = { lng: drag.v.lng - dx * k, lat: clamp(drag.v.lat + dy * k, -80, 80), zoom: view.zoom, dive: view.dive };
    canvas.style.cursor = "grabbing";
    draw();
  });
  canvas.addEventListener("pointerleave", function (ev) {
    if (ev.pointerType === "mouse" && !drag) setHover(null);
  });
  // A finger lifting from a pinch: the pinch is over, and it wasn't a tap.
  function lift(ev) {
    delete touches[ev.pointerId];
    if (!pinch) return false;
    if (Object.keys(touches).length < 2) { pinch = null; inMotion = false; draw(); }
    return true;
  }
  canvas.addEventListener("pointerup", function (ev) {
    var pinched = lift(ev), was = drag;
    drag = null;
    if (pinched) return;
    if (was && was.moved) { inMotion = false; draw(); }
    if (!was || was.moved) return;
    var q = hit(ev);
    if (q) {
      hover = null;
      select(q.i, "stay");
      return;
    }
    // a tap on a name shows what it is until the next tap
    var pl = hitPlace(ev);
    if (ev.pointerType !== "mouse") setHover(pl ? { place: pl } : null);
    if (!pl && sel >= 0) select(-1);
  });
  canvas.addEventListener("pointercancel", function (ev) { lift(ev); drag = null; inMotion = false; draw(); });
  function hit(ev) {
    var r = canvas.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    var best = null, reach = ev.pointerType === "touch" ? 22 : 14;
    hits.forEach(function (q) {
      var gap = Math.hypot(q.x - x, q.y - y);
      if (gap < Math.max(reach, q.r + 6) && (!best || gap < best.gap)) best = { q: q, gap: gap };
    });
    return best && best.q;
  }
  function hitPlace(ev) {
    var r = canvas.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    var best = null, reach = ev.pointerType === "touch" ? 16 : 9;
    placeHits.forEach(function (h) {
      var gap = Math.hypot(h.x - x, h.y - y);
      if (gap < reach) { reach = gap; best = h.pl; }
    });
    return best;
  }

  // The wheel zooms about the point under the mouse.
  function wheelZoom(ev) {
    if (!hasGlobe || !W) return;
    ev.preventDefault();
    var dy = ev.deltaY * (ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? H : 1);
    var z = clamp(view.zoom * Math.exp(-dy * (ev.ctrlKey ? 0.01 : 0.004)), 1, ZOOM_MAX);
    if (Math.abs(z - view.zoom) < 1e-6) return;
    var r = canvas.getBoundingClientRect(), p = [ev.clientX - r.left, ev.clientY - r.top];
    anim++; inMotion = true; aimed = -1;
    zoomAbout(groundAt(p), p, z);
    draw();
    settleSoon();
  }
  canvas.addEventListener("wheel", wheelZoom, { passive: false });
  // over the prompt too: it covers a good part of the globe, and has
  // nothing of its own to scroll
  card.addEventListener("wheel", wheelZoom, { passive: false });

  // The world view has its own "What is a drop?" (the drop screen's lives
  // in a panel that is hidden here); like that one, a click outside closes it.
  var worldHelp = document.getElementById("dw-help");
  if (worldHelp) document.addEventListener("click", function (ev) {
    if (worldHelp.open && !worldHelp.contains(ev.target)) worldHelp.open = false;
  });

  /* --- screens ------------------------------------------------------------- */
  // Every flight here is the About page's, with the same red after-images,
  // at twice its speed and from two thirds as far (still off the screen):
  // a screen change is not a page arriving, and the windows are in sight
  // sooner after the cut. page-script.js lays the after-images out as each
  // window sets off, so the street map drawing its tiles meanwhile can't
  // thin them out.
  var IN = { speed: 0.5, distance: 0.65 }, OUT = { speed: 0.6, distance: 0.65 };
  var listPanel = world.querySelector(".dw-list");

  function moving() { return !reduceMotion && fly(); }

  // The cut between screens: a red flash that fades, as a JRPG cuts to a scene.
  function flash() {
    if (reduceMotion) return;
    var f = el("div", "dw-cut");
    document.body.appendChild(f);
    setTimeout(function () { f.remove(); }, 500);
  }

  // A menu confirms a choice by flashing it.
  function blink(i) {
    var r = rowBtns[i];
    if (!r || reduceMotion) return;
    r.classList.add("is-chosen");
    setTimeout(function () { r.classList.remove("is-chosen"); }, 420);
  }

  // A frame drawn, or 50ms if the tab is in the background and draws none.
  function nextFrame() {
    return new Promise(function (done) { requestAnimationFrame(done); setTimeout(done, 50); });
  }
  // The drop's windows set off first, and only once they are on their way
  // (the browser flies them, after-images and all, from then on) does
  // drops.js put the drop in them: its street map takes a moment to draw,
  // which would otherwise hold them at the edge of the screen. They are
  // still off it when it does.
  async function arrive(i, scope) {
    if (!moving()) { drops.open(i); return; }
    var landed = fly().enter(scope, IN);
    await nextFrame(); await nextFrame();
    drops.open(i);
    await landed;
  }

  async function toDrop(i) {
    if (root.dataset.view === "drop") {
      // the address changed from one drop to another (typed, or a link):
      // the record's windows fly out, and back in with that drop
      if (drops.current() === i) return;
      if (moving()) {
        await fly().exit(detail, OUT);
        if (next && next.i >= 0) { i = next.i; next = null; }   // asked for again meanwhile
      }
      if (fly()) fly().reset(detail);
      window.scrollTo(0, 0);                    // a phone scrolls a drop's page
      await arrive(i, detail);
      return;
    }
    var d = list[i];
    var fromWorld = world.contains(document.activeElement);
    hover = null;
    select(i, "hold");
    if (moving()) {
      blink(i);
      await Promise.all([turnTo(dive(i), 420, easeIn), fly().exit(listPanel, OUT)]);
    }
    root.dataset.view = "drop";
    window.scrollTo(0, 0);
    if (moving()) flash();
    if (fly()) fly().reset(world);
    document.title = TITLE.replace(/DROPS$/, "DROP #" + d.n);
    if (fromWorld) backButton().focus({ preventScroll: true });   // the keyboard's way back
    await arrive(i, shell);                     // drops.open sizes the map, now it can be seen
  }

  async function toWorld() {
    if (root.dataset.view === "world") return;
    var i = Math.max(0, drops.current()), fromDrop = shell.contains(document.activeElement);
    if (moving()) await fly().exit(shell, OUT);
    root.dataset.view = "world";
    window.scrollTo(0, 0);                      // wherever the drop's page was scrolled to
    if (moving()) flash();
    if (fly()) fly().reset(shell);
    document.title = TITLE;
    size();
    select(i, "jump");
    if (fromDrop) focusRow(i);
    if (moving()) {
      fly().enter(listPanel, IN);
      view = dive(i); draw();                   // start inside the drop we left
      await turnTo(aim(i, view.zoom), 600, easeOut);   // and pull back out, to the zoom we left
    }
  }

  // One screen change at a time; a newer request replaces a waiting one.
  var busy = null, next = null;
  function go(job) {
    next = job;
    if (busy) return;
    busy = (async function () {
      while (next) {
        var j = next; next = null;
        try { await (j.i >= 0 ? toDrop(j.i) : toWorld()); } catch (e) { console.error(e); }
      }
      busy = null;
    })();
  }

  // The address decides the screen: drops#003 is drop 003, anything else the
  // world. OPEN DROP is a link to it, so Back, reload and sharing just work.
  function hashId() {
    try { return decodeURIComponent(location.hash.slice(1)); }
    catch (e) { return ""; }                    // a mangled address: the world
  }
  function route(initial) {
    var i = indexOf(hashId());
    if (i < 0 && location.hash) history.replaceState(null, "", location.pathname + location.search);
    if (initial) {                               // no animation on arrival
      root.dataset.view = i < 0 ? "world" : "drop";
      if (i >= 0) { document.title = TITLE.replace(/DROPS$/, "DROP #" + list[i].n); sel = i; }
      return;
    }
    if (i >= 0 && root.dataset.view === "world") history.replaceState({ fromWorld: true }, "");
    go({ i: i });
  }
  window.addEventListener("hashchange", function () { route(false); });

  // WORLD MAP: step back if we came from the world, so Back and Forward stay
  // one step apart; otherwise (a shared link to one drop) go forward to it.
  function toWorldByHand() {
    if (history.state && history.state.fromWorld) { history.back(); return; }
    history.pushState(null, "", location.pathname + location.search);
    go({ i: -1 });
  }

  // Keep the claimed chip, the address and the title in step with the drop
  // showing; the address without adding history.
  document.addEventListener("pn0va:drop", function (ev) {
    showClaimed(ev.detail.index);
    if (root.dataset.view !== "drop") return;
    var d = list[ev.detail.index];
    history.replaceState(history.state, "", "#" + d.n);
    document.title = TITLE.replace(/DROPS$/, "DROP #" + d.n);
  });

  /* --- start --------------------------------------------------------------- */
  route(true);
  showClaimed(drops.current());
  if (sel >= 0) select(sel, "jump");
  if (hasGlobe) {
    if (window.ResizeObserver) new ResizeObserver(function () { if (size()) draw(); }).observe(box);
    else window.addEventListener("resize", function () { if (size()) draw(); });
    if (size()) draw();
    if (document.fonts) document.fonts.ready.then(draw);
  }
})();
