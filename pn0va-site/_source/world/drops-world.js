/* ==========================================================================
   DROPS — the world view
   --------------------------------------------------------------------------
   One page, two screens. The WORLD: a globe with every drop zone on it
   and the list of zones, each with how many drops were left there and
   when the latest was. A ZONE: the page drops.js draws (frequency bar,
   street map, the drops left there, the chosen one's story and item).

     drops         the world
     drops#03      zone 03 (a link to one zone opens straight on it)
     drops#003     drop 003, on the page of the zone it was left at

   The world opens with no zone chosen, the globe turned to where the
   zones are. Choose one in the list (a click, Enter or the arrow keys)
   and the globe turns to it, the zone in the middle, at the zoom it is at
   (from far off it flies out and back down to that zoom). Click a zone on
   the globe instead and the globe stays where it is. Either way a prompt
   opens by the zone: what is there (how many drops, when the latest was
   left, its title, item and the first line of its story, and where the
   zone is), ZOOM IN (ZOOM OUT once there), the one thing that zooms to a
   zone, and OPEN ZONE. On a phone, where the globe is small, the same
   opens under the zone's row instead. The prompt's x, Esc, or a click on
   bare globe closes it.

   OPEN ZONE is the only way in: the globe dives, the list flies off, and
   the zone's windows fly in with the About page's flight and red
   after-images, at twice its speed. The zone's screen shows that one
   zone; choosing one of its drops keeps the address in step (drops#003),
   so a link from there opens on that drop. WORLD MAP (heading its top bar,
   or floating at the foot of the screen where the page scrolls, and on the
   street map), Esc or the browser's Back pulls back out to the globe.

   The globe is a map: coast, lakes, country borders, state and province
   lines, and the names of countries, states, cities, peaks and landmarks.
   They come from Natural Earth (public domain) at four levels of detail
   made by tools/make-world: the whole globe loads at once, and closer in,
   finer levels load for the part in view. Each level is the same coastline
   simplified to the pixel, so zooming in only sharpens it. Landmarks come
   from maps/landmarks.json, which is meant to be added to.

   Every zone has its own mark, which grows as you zoom in. Zones too
   close to tell apart sit on a ring round the spot they share, each on a
   thread back to it. Hover one for what is there (as the prompt says it,
   short of where), or a city, peak or landmark for what it is (pointing at
   a zone in the list marks it on the globe too). Zoom with + and -, the
   mouse wheel, a pinch, or the + - 0 keys; the globe button goes back to
   the whole globe.

   It reads the same <section class="dp-zone"> records as drops.js, so a
   new zone, or a new drop at one, is on the globe with nothing more to
   do. A zone is NEW while its latest drop is in its first week. Once every
   drop left at a zone is marked data-claimed, the zone is drawn hollow,
   CLAIMED in the list; a drop without the mark shows nothing either way.

   Colours come from tokens.css: an ember sea, slate land, ash coasts and
   state lines, taupe borders, red instruments (graticule, rim, pointer),
   linen marks and names, bone for the zone you are on.
   ========================================================================== */

(function () {
  "use strict";

  var NEW_DAYS = 7;                     // a zone is NEW for its latest drop's first week
  var ZOOM_BASE = 64;                   // as close as Natural Earth has detail for; over the street map, closer
  var STREET_ZOOM = 17;                 // the web zoom a zone's street map opens at: the globe comes in that far
  var ZOOM_LIMIT = 1e6;                 // no flight goes past this, whatever its ends
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
  // the zone's screen loses drops.js's list of zones from here on (see the CSS)
  root.classList.add("dw-ready");

  /* --- palette: the brand tokens ----------------------------------------- */
  var css = getComputedStyle(root);
  function tok(name, fallback) { return css.getPropertyValue(name).trim() || fallback; }
  var RED = tok("--pn-red", "#FF1609"), EMBER = tok("--pn-ember", "#0A0000"),
      BONE = tok("--pn-bone", "#FFFFFF"), LINEN = tok("--pn-linen", "#E8E2DC"),
      TAUPE = tok("--pn-taupe", "#B0A49B"), ASH = tok("--pn-ash", "#7A716B"),
      SLATE = tok("--pn-slate", "#3A3532");
  // shades between the tokens, as the street map has them (drops-map.js):
  // built-up land a step up from the slate, parks a step toward green, and
  // the reds of the smaller roads
  var URBAN = "#48423E", PARKS = "#333729", MAJOR = "#E3170C", MINOR = "#A3150C", LANE = "#73130D";

  /* --- the drop zones ---------------------------------------------------- */
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
  // A zone: where it is and the drops left there, newest first. NEW while
  // its latest drop is in its first week (and not claimed: the item is
  // gone, however recent the drop); claimed once every drop there is.
  var list = drops.entries.map(function (e, i) {
    var d = e.dataset, left = drops.drops(i), latest = left[0] || null;
    return { i: i, n: d.n || "", place: d.place || "", lat: parseFloat(d.lat), lng: parseFloat(d.lng),
             drops: left, latest: latest, placed: latest ? latest.dataset.placed || "" : "",
             isNew: !!latest && claimedOf(latest) === null && daysSince(latest.dataset.placed) < NEW_DAYS,
             claimed: left.length > 0 && left.every(function (x) { return claimedOf(x) !== null; }) };
  });
  // drops#03 is zone 03, drops#003 drop 003 at its zone: [zone, drop]
  function find(id) { return id ? drops.find(id) : null; }
  // "P_N0VA — ZONE 03 · TELEGRAPH HILL"
  function title(i) {
    var d = list[i];
    return TITLE.replace(/DROPS$/, "ZONE " + d.n + (d.place ? " \u00b7 " + d.place.toUpperCase() : ""));
  }
  function plural(n, one) { return n + " " + one + (n === 1 ? "" : "s"); }
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
  function tagFor(d) {
    if (d.claimed) return el("span", "dp-claimed-tag", "Claimed");
    if (d.isNew) return el("span", "dp-new", "New");
    return null;
  }

  /* --- what each zone has to say ----------------------------------------- */
  // Its latest drop: its number and title, the caption of its item, and the
  // first sentence of its story, as a teaser.
  function about(d) {
    var e = d.latest;
    if (!e) return { n: "", title: "", item: "", teaser: "" };
    var ds = e.dataset, p = e.querySelector("p");
    var text = p ? p.textContent.replace(/\s+/g, " ").trim() : "";
    var first = text.match(/^.+?[.!?](?=\s|$)/);
    return { n: ds.n || "", title: ds.title || "", item: ds.itemcap || "", teaser: first ? first[0] : text };
  }
  // how long ago the latest drop was left: "79 days ago"
  function age(d) {
    var n = Math.floor(daysSince(d.placed));
    if (!isFinite(n) || n < 0) return "";
    return n === 0 ? "today" : n === 1 ? "yesterday" : n + " days ago";
  }
  // a label and its value: "ITEM  Enamel pin — Game Boy"
  function kv(label, value) {
    var s = el("span", "kv");
    s.appendChild(el("b", null, label));
    s.appendChild(typeof value === "string" ? document.createTextNode(value) : value);
    return s;
  }
  // What there is to say about zone d, into box (after its number and
  // name). how: "popup" over it on the globe; "prompt", the chosen zone's,
  // by it, with where it is and OPEN ZONE; "row", the same opened under its
  // row on a phone, kept short (where it is is on the zone's own page) so
  // the rows round it stay in view.
  function describe(box, d, how) {
    var x = about(d), a = age(d), when = el("span", "dw-when"), many = d.drops.length !== 1;
    when.appendChild(el("span", null, plural(d.drops.length, "drop")));     // each part kept
    if (d.placed) when.appendChild(el("span", null, (many ? "Latest " : "Left ") + d.placed));
    if (a) when.appendChild(el("span", null, a));                         // whole (see the CSS)
    box.appendChild(when);
    if (d.claimed) box.appendChild(el("em", null, many ? "All claimed" : "Claimed"));
    else if (d.isNew) box.appendChild(el("em", null, "New"));
    if (how === "prompt" && hasPos(d)) box.appendChild(el("span", "dw-at", coords(d)));
    if (x.title) box.appendChild(kv("Drop #" + x.n, el("i", null, x.title)));
    if (x.item) box.appendChild(kv("Item", x.item));
    if (x.teaser) box.appendChild(el("q", "dw-teaser", x.teaser));
    if (how === "popup") return;
    // ZOOM IN / ZOOM OUT, for a zone the globe can show, and OPEN ZONE
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
    go.innerHTML = '<span class="tri" aria-hidden="true"></span>Open zone';
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
  // ZOOM IN until the globe is as close as it goes, ZOOM OUT from there: by
  // the zoom a turn is heading for, not the one it passes through (a short
  // way at 64x dips a hair below it, and the label flickered).
  var heading = null;
  function zoomLabels() {
    var out = (heading != null ? heading : view.zoom) >= closeFor(sel) * (1 - 1e-6);
    [card, rows].forEach(function (box) {
      Array.prototype.forEach.call(box.querySelectorAll(".dw-zoomto"), function (b) {
        if (b.dataset.out === String(out)) return;
        b.dataset.out = out;
        b.innerHTML = lens(!out) + (out ? "Zoom out" : "Zoom in");
      });
    });
  }

  /* --- the list ----------------------------------------------------------- */
  // A row chooses its zone: the globe turns to it, at the zoom it is at,
  // and the prompt opens there. It never opens the zone itself, and never
  // zooms (ZOOM IN does). Pointing at a row only marks the zone on the
  // globe, so running the mouse down the list doesn't send the globe about.
  // Each row says what is there (how many drops, the latest one's title and
  // the start of its story); on a phone the chosen one opens up underneath
  // with the rest, and its OPEN ZONE, instead of a prompt over the small
  // globe.
  var rows = document.getElementById("dw-rows"), rowBtns = [], mores = [];
  var tapped = null;                    // where and when a row was last pressed
  var quiet = false;                    // a row focused by this script, not chosen by it
  // whether an element's focus came from the keyboard (where a browser
  // doesn't know :focus-visible, it is taken to have, as it always was)
  function byKeys(x) {
    try { return x.matches(":focus-visible"); } catch (e) { return true; }
  }
  document.getElementById("dw-count").textContent = String(list.length).padStart(2, "0") + (list.length === 1 ? " ZONE" : " ZONES");
  list.forEach(function (d) {
    var item = el("div", "dw-item"), a = el("button", "dw-row"), x = about(d);
    a.type = "button";
    a.appendChild(el("span", "dw-n", d.n));
    a.appendChild(el("span", "dw-place", d.place));
    a.appendChild(tagFor(d) || el("span"));
    a.appendChild(el("span", "dw-date", d.placed));
    var line = plural(d.drops.length, "drop") +
               (x.title ? (d.drops.length > 1 ? " \u00b7 latest \u201c" : " \u00b7 \u201c") + x.title + "\u201d" : "") +
               (x.teaser ? " \u2014 " + x.teaser : "");
    a.appendChild(el("span", "dw-line", line));
    a.addEventListener("mouseenter", function () { if (d.i !== sel) setHover({ drop: d.i }); });
    a.addEventListener("mouseleave", function () { if (hover && hover.drop === d.i) setHover(null); });
    // Focus from the keyboard (Tab, the arrows) chooses the zone at once; a
    // press chooses it with its click. Chosen as the button took the focus
    // of a tap, a phone's row opened before the tap's click arrived, and
    // the click landed on whatever had moved under the finger: another row,
    // or the zone's own OPEN ZONE.
    a.addEventListener("focus", function () { if (!quiet && byKeys(a)) select(d.i, "fly"); });
    a.addEventListener("pointerdown", function (ev) { tapped = { x: ev.clientX, y: ev.clientY, t: Date.now() }; });
    // From the keyboard (no pointer, so no click count), Enter goes on to
    // the prompt's OPEN ZONE, so a second Enter opens it. A row opened
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

  // Where the prompt goes: by the zone on the globe, or under its row: on
  // a phone, and wherever the globe can't show the zone.
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

  // A zone's screen shows one zone: drops.js's list of them is hidden
  // (see the CSS), and the way back, a real button so nobody has to hunt
  // for it, heads its top bar in place of the word "Frequency". Where the
  // page scrolls (a phone, a short screen) that would scroll away with it:
  // there the way back floats at the foot of the screen instead, always in
  // reach. The CSS shows the one or the other.
  var BACK = '<span class="tri" aria-hidden="true"></span>' + GLOBE +
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

  // A file that comes in while the globe is moving waits to be read until it
  // is still, one a frame: reading one takes tens of milliseconds, several
  // times that on a slower phone, and in the middle of a flight it stalled
  // the flight. Meanwhile the globe draws the finest level it already has.
  var waiting = [], reading = false;
  function readSoon() {
    if (reading || !waiting.length || inMotion) return;
    reading = true;
    requestAnimationFrame(function () {
      reading = false;
      if (inMotion) return;               // moving again: at the next stop
      waiting.shift()();
      readSoon();
    });
  }
  function load(name) {
    if (files[name]) return files[name];
    var f = files[name] = { ready: false, pieces: [], places: [] };
    var lvl = +name.split("/")[0];
    function lost() {
      f.ready = true;                   // nothing there: the map goes on without it
      draw();
    }
    fetch(WORLD + name + ".json" + (WORLD_V ? "?v=" + WORLD_V : "")).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      if (!inMotion) return r.json().then(read);
      waiting.push(function () { r.json().then(read).catch(lost); });
    }).catch(lost);
    function read(t) {
      if (t.index) index = t.index;
      var size = index ? index.levels[lvl].piece : 360, byKey = {};
      ["land", "lakes", "coast", "borders", "states", "urban", "rivers", "roads", "highways"].forEach(function (layer) {
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
          byKey[k][layer] = layer === "land" || layer === "lakes" || layer === "urban" ? shapesOf(ft.geometry) : linesOf(ft.geometry);
        });
      });
      f.pieces = Object.keys(byKey).map(function (k) { return byKey[k]; });
      f.places = t.places || [];
      f.ready = true;
      draw();
    }
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

  /* --- the streets near the zones ------------------------------------------- */
  // Close in near a zone the globe draws from the street map's own file, the
  // one a zone's page reads (maps/drops.pmtiles, OpenStreetMap): land and
  // water, parks, the streets in red as on the street map, railways, and
  // the names of neighbourhoods. The file holds a box round every zone, 30 km
  // out at web zooms 8 to 11 and 4 km out from 12 to 15 (tools/make-map.py),
  // and is read in small pieces as they come into view. Over it the globe
  // zooms on in, to the street level a zone's page opens at; elsewhere it
  // stops at 64x, where Natural Earth's detail runs out. Without the file,
  // or opened from the disk (which can't read a file in parts), it stops at
  // 64x everywhere.
  var streets = null;
  (function () {
    var tag = document.querySelector("script[data-map]");
    if (!hasGlobe || !tag || !tag.dataset.map || !window.protomapsL || !protomapsL.PmtilesSource || !window.fetch) return;
    var url = new URL(tag.dataset.map, tag.src).href;
    fetch(url, { headers: { Range: "bytes=0-6" } }).then(function (r) {
      if (r.status !== 206) { if (r.body) r.body.cancel(); throw new Error("HTTP " + r.status); }
      // false: keep every request (the library's own map cancels those at
      // other zooms, but the globe draws two zooms at once)
      var src = new protomapsL.PmtilesSource(url, false);
      return src.p.getMetadata().then(function (meta) {
        var m = (meta && meta.pn0va) || {}, made = Array.isArray(m.drops) ? m.drops : [];
        if (!made.length) return;
        var detail = +m.detail_km || 4, context = +m.context_km || 30;
        streets = { cache: new protomapsL.TileCache(src, 512), tiles: {}, failed: {}, asking: 0,
                    boxes: made.map(function (p) {
                      return { detail: boxAround(+p[0], +p[1], detail), context: boxAround(+p[0], +p[1], context) };
                    }) };
        zoomButtons(); zoomLabels(); draw();
      });
    }).catch(function () { /* no street map: the globe stops at 64x */ });
  })();
  // [west, south, east, north] km out from a place
  function boxAround(lat, lng, km) {
    var dlat = km / 110.574, dlng = km / (111.320 * Math.cos(lat * RAD));
    return [lng - dlng, lat - dlat, lng + dlng, lat + dlat];
  }
  function inBox(b, lng, lat) { return lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3]; }
  // The closest web zoom the street map has at a place (its own zooms run to
  // 15; drawn on, to a zone's street level), or 0 where it has nothing.
  function streetZoomAt(lng, lat) {
    var best = 0;
    if (streets) streets.boxes.forEach(function (b) {
      if (inBox(b.detail, lng, lat)) best = STREET_ZOOM;
      else if (!best && inBox(b.context, lng, lat)) best = 12;
    });
    return best;
  }
  // The globe's zoom and a web map's: at zoom z the globe shows as much
  // ground to a pixel as a web map at webAt(z) does at that latitude.
  function webAt(z, lat) { return R ? Math.log2(R * z * 2 * Math.PI * Math.cos(lat * RAD) / 256) : 0; }
  function zoomFor(web, lat) { return R ? 256 * Math.pow(2, web) / (2 * Math.PI * R * Math.max(0.05, Math.cos(lat * RAD))) : ZOOM_BASE; }
  // How close the globe comes in at a place: 64x anywhere, and over the
  // street map on in to the zone's street level.
  function capAt(lng, lat) {
    var w = streetZoomAt(lng, lat);
    return w ? Math.max(ZOOM_BASE, zoomFor(w, lat)) : ZOOM_BASE;
  }
  function zoomCap() { return capAt(view.lng, view.lat); }
  function closeFor(i) { var d = list[i]; return d && hasPos(d) ? capAt(d.lng, Math.max(-80, Math.min(80, d.lat))) : ZOOM_BASE; }
  // A zoom asked for, kept in bounds: in no closer than the place allows
  // (or than the globe already is, dragged off the street map close in),
  // out no further than the whole globe.
  function capped(z) {
    return clamp(z, 1, z > view.zoom ? Math.max(zoomCap(), view.zoom) : ZOOM_LIMIT);
  }

  // A tile's x and y at zoom z, and the tiles at z over the part of box b
  // that is in view (vb, from viewBox).
  function tileOf(lng, lat, z) {
    var n = Math.pow(2, z), f = clamp(lat, -85.05, 85.05) * RAD;
    return [clamp(Math.floor((lng + 180) / 360 * n), 0, n - 1),
            clamp(Math.floor((1 - Math.log(Math.tan(f) + 1 / Math.cos(f)) / Math.PI) / 2 * n), 0, n - 1)];
  }
  function tilesOver(b, vb, z, out) {
    var w = Math.max(b[0], vb.lon0), e = Math.min(b[2], vb.lon1), s = Math.max(b[1], vb.lat0), n = Math.min(b[3], vb.lat1);
    if (w > e || s > n) return;
    var a = tileOf(w, n, z), c = tileOf(e, s, z);
    for (var x = a[0]; x <= c[0]; x++) for (var y = a[1]; y <= c[1]; y++) {
      var k = z + "/" + x + "/" + y;
      if (out.indexOf(k) < 0) out.push(k);
    }
  }
  // A tile, asked for once (and not while the globe moves, nor more than a
  // few at a time); read into unit vectors when the globe is still, as the
  // map's own files are.
  function askTile(key) {
    var t = streets.tiles[key];
    if (t || inMotion || streets.asking >= 6 || streets.failed[key] >= 2) return t || null;
    var zxy = key.split("/").map(Number);
    t = streets.tiles[key] = { ready: false };
    streets.asking++;
    streets.cache.get({ z: zxy[0], x: zxy[1], y: zxy[2] }).then(function (layers) {
      streets.asking--;
      waiting.push(function () { streets.tiles[key] = streetTile(zxy, layers); draw(); });
      readSoon();
    }).catch(function () {                   // asked again later, once
      streets.asking--;
      delete streets.tiles[key];
      streets.failed[key] = (streets.failed[key] || 0) + 1;
    });
    return t;
  }
  // What a tile has for the globe, as unit vectors. Its corners are in tile
  // pixels (512 to the tile), Web Mercator.
  var PARKISH = /^(park|wood|forest|grass|grassland|garden|nature_reserve|national_park|protected_area|golf_course|cemetery|recreation_ground|playground|meadow|scrub|village_green|dog_park|heath)$/;
  function streetTile(zxy, layers) {
    var z = zxy[0], tx = zxy[1], ty = zxy[2], n = Math.pow(2, z), S = 512;
    if (!layers || !layers.size) return { ready: true, empty: true };
    function lngOf(px) { return ((tx + px / S) / n * 2 - 1) * Math.PI; }
    function latOf(py) { return Math.atan(Math.sinh(Math.PI * (1 - 2 * (ty + py / S) / n))); }
    function vec(pts) {
      var v = new Float64Array(pts.length * 3);
      for (var k = 0; k < pts.length; k++) {
        var l = lngOf(pts[k].x), f = latOf(pts[k].y), c = Math.cos(f);
        v[3 * k] = c * Math.cos(l); v[3 * k + 1] = c * Math.sin(l); v[3 * k + 2] = Math.sin(f);
      }
      return v;
    }
    var t = { ready: true, earth: [], water: [], rivers: [], parks: [], places: [],
              roads: { highway: [], major: [], minor: [], lane: [], rail: [] } };
    // the tile's own square, its edges followed (a parallel bends)
    var sq = [], s;
    for (s = 0; s <= 8; s++) sq.push({ x: s * S / 8, y: 0 });
    for (s = 1; s <= 8; s++) sq.push({ x: S, y: s * S / 8 });
    for (s = 7; s >= 0; s--) sq.push({ x: s * S / 8, y: S });
    for (s = 7; s >= 1; s--) sq.push({ x: 0, y: s * S / 8 });
    t.square = vec(sq);
    function each(layer, fn) { (layers.get(layer) || []).forEach(fn); }
    each("earth", function (f) { if (f.geomType === 3) f.geom.forEach(function (r) { t.earth.push(vec(r)); }); });
    each("water", function (f) {
      if (f.geomType === 3) f.geom.forEach(function (r) { t.water.push(vec(r)); });
      else if (f.geomType === 2) f.geom.forEach(function (l) { t.rivers.push(vec(l)); });
    });
    each("landuse", function (f) {
      if (f.geomType === 3 && PARKISH.test(f.props.kind)) f.geom.forEach(function (r) { t.parks.push(vec(r)); });
    });
    each("roads", function (f) {
      var k = f.props.kind, cls = k === "highway" ? "highway" : k === "major_road" ? "major" :
        k === "minor_road" ? (f.props.kind_detail === "service" ? "lane" : "minor") :
        k === "path" || k === "other" ? "lane" : k === "rail" ? "rail" : null;
      if (cls && f.geomType === 2) f.geom.forEach(function (l) { t.roads[cls].push(vec(l)); });
    });
    // towns, and the neighbourhoods in them, as names on the map
    each("places", function (f) {
      var p = f.props, g = f.geom[0] && f.geom[0][0];
      if (!g || !p.name || !/^(locality|macrohood|neighbourhood)$/.test(p.kind)) return;
      t.places.push([p.kind === "locality" ? "t" : "n", String(p.name), lngOf(g.x) / RAD, latOf(g.y) / RAD,
                     isFinite(p.min_zoom) ? +p.min_zoom : 12, 99, null]);
    });
    return t;
  }
  // The tiles to draw for web zoom e: the wide ones (to web zoom 11) over
  // the boxes round the zones, then the close ones over the 4 km boxes; each
  // where it has come in, or else the nearest wider one that has. The tiles
  // are 512px, so the data a zoom below the view's is as sharp as the screen.
  function streetTiles(e, vb) {
    var dz = clamp(Math.floor(e) - 1, 8, 15), out = [], keys = [];
    var tiers = [{ z: Math.min(dz, 11), low: 8, box: "context" }];
    if (dz >= 12) tiers.push({ z: dz, low: 12, box: "detail" });
    var mid = tileOf(view.lng, view.lat, dz);
    tiers.forEach(function (tier) {
      var want = [], m = tier.z === dz ? mid : tileOf(view.lng, view.lat, tier.z);
      streets.boxes.forEach(function (b) { tilesOver(b[tier.box], vb, tier.z, want); });
      // the middle of the view first
      want.sort(function (a, b) {
        var p = a.split("/"), q = b.split("/");
        return Math.hypot(p[1] - m[0], p[2] - m[1]) - Math.hypot(q[1] - m[0], q[2] - m[1]);
      });
      want.slice(0, 40).forEach(function (k) {
        var t = askTile(k), zxy = k.split("/").map(Number), z = zxy[0], x = zxy[1], y = zxy[2];
        while (!(t && t.ready && !t.empty) && z > tier.low) { z--; x = Math.floor(x / 2); y = Math.floor(y / 2); t = streets.tiles[z + "/" + x + "/" + y]; }
        var kk = z + "/" + x + "/" + y;
        if (t && t.ready && !t.empty && keys.indexOf(kk) < 0) { keys.push(kk); out.push(t); }
      });
    });
    return out;
  }
  // The streets over the map, from web zoom 9, coming in over its first
  // zoom; land and water in the globe's own slate and ember, so where the
  // street map ends the globe goes on in the same colours. Returns the names
  // they bring, for drawPlaces.
  function drawStreets(e) {
    if (!streets || e < 9) return [];
    var tiles = streetTiles(e, viewBox(true));
    if (!tiles.length) return [];
    var fade = clamp(e - 9, 0, 1), names = [];
    function fill(get, colour) {
      ctx.beginPath();
      tiles.forEach(function (t) { get(t).forEach(function (v) { ring(v, false, true); }); });
      ctx.fillStyle = colour; ctx.globalAlpha = fade; ctx.fill();
    }
    function line(get, width, colour, alpha, dash) {
      if (alpha <= 0) return;
      ctx.beginPath();
      tiles.forEach(function (t) { get(t).forEach(function (v) { ring(v, false, false); }); });
      ctx.lineWidth = clamp(width, 0.5, 14); ctx.strokeStyle = colour; ctx.globalAlpha = fade * alpha;
      if (dash) ctx.setLineDash(dash);
      ctx.stroke();
      if (dash) ctx.setLineDash([]);
    }
    var w = Math.pow(2, (e - 12) / 2.5);                  // twice as wide every two and a half zooms
    ctx.save();
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    fill(function (t) { return [t.square]; }, EMBER);
    fill(function (t) { return t.earth; }, SLATE);
    fill(function (t) { return t.parks; }, PARKS);
    fill(function (t) { return t.water; }, EMBER);
    line(function (t) { return t.rivers; }, 1.2 * w, EMBER, 1);
    line(function (t) { return t.roads.rail; }, 0.8 * w, TAUPE, 0.55 * clamp(e - 11, 0, 1), [3, 3]);
    line(function (t) { return t.roads.lane; }, 0.55 * w, LANE, 0.7 * clamp(e - 13, 0, 1));
    line(function (t) { return t.roads.minor; }, 0.8 * w, MINOR, 0.85 * clamp(e - 11, 0, 1));
    line(function (t) { return t.roads.major; }, 1.25 * w, MAJOR, 0.95);
    line(function (t) { return t.roads.highway; }, 1.8 * w, RED, 1);
    ctx.restore();
    if (fade >= 1) tiles.forEach(function (t) { names = names.concat(t.places); });
    return names;
  }

  /* --- the view ------------------------------------------------------------ */
  var W = 0, H = 0, R = 0, DPR = 1, CX = 0, CY = 0, halo = null, inMotion = false;
  var sel = -1;                         // the chosen zone: none, until one is chosen

  // Where the zones are: the middle of them all, which the globe faces
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
  // A zone in the middle of the globe at zoom z (none, or one the globe
  // can't show: where the zones are).
  function aim(i, z) {
    var d = list[i];
    if (!d || !hasPos(d)) return home(z);
    return { lng: d.lng, lat: clamp(d.lat, -80, 80), zoom: z, dive: 1 };
  }
  // What the globe faces: a centre, the zoom chosen with the buttons, wheel
  // or pinch, and a dive that multiplies it while a drop opens or closes.
  var view = home(1);
  // Diving: the zone dead centre, the globe six times bigger.
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
  // The longitudes and latitudes on screen, from points round its edge, with
  // a margin round them: a tenth of the span and a fifth of a degree (for
  // the map's files), or only the tenth (tight, for the street map's tiles).
  function viewBox(tight) {
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
    var dx = (b.lon1 - b.lon0) * 0.1 + (tight ? 0 : 0.2), dy = (b.lat1 - b.lat0) * 0.1 + (tight ? 0 : 0.2);
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

  // Graticule: every 15 degrees on the whole globe, closer in every 5, then
  // every degree, and on down to a thousandth over a street, at least 60px
  // apart; made only for the part in view.
  var gratKey = "", gratLines = null, STEPS = [15, 5, 1, 0.5, 0.1, 0.05, 0.01, 0.005, 0.001];
  function graticule(v) {
    var step = STEPS[0];
    for (var i = 1; i < STEPS.length && STEPS[i] * RAD * scale(v) >= 60; i++) step = STEPS[i];
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

    // sea: ember, lit from the upper left by the one chroma. The light and
    // the sheen below are a curve across the whole globe: close in, where it
    // is many times the screen and all but flat, they fade out (spread over
    // a globe that size they were the costliest thing in a frame).
    var whole = Math.hypot(CX, CY), lights = clamp((4 * whole - s) / (2 * whole), 0, 1);
    ctx.beginPath(); ctx.arc(CX, CY, s, 0, 2 * Math.PI);
    ctx.fillStyle = EMBER; ctx.fill();
    if (lights > 0) {
      var lit = ctx.createRadialGradient(CX - s * .38, CY - s * .42, s * .05, CX, CY, s * 1.02);
      lit.addColorStop(0, "rgba(255,22,9,.16)"); lit.addColorStop(.6, "rgba(255,22,9,.05)"); lit.addColorStop(1, "rgba(255,22,9,0)");
      ctx.globalAlpha = lights; ctx.fillStyle = lit; ctx.fill(); ctx.globalAlpha = 1;
    }

    // the map: land in slate, built-up areas a shade lighter, lakes and
    // rivers in the sea's ember; roads in red, as on the street map,
    // highways brighter and heavier, coming in as the globe does; state
    // lines dashed in taupe; borders in bone over a dark edge, so they hold
    // their own against the land and the roads, thickening as the globe
    // comes in; the coast in ash
    var map = mapNow(), pieces = map.pieces;
    frame();
    shapes(pieces, "land");
    ctx.fillStyle = SLATE; ctx.fill();
    var ze = index ? R * view.zoom / index.R : view.zoom, lz = Math.log2(Math.max(1, ze));
    var near = clamp((ze - 3) / 3, 0, 1);                       // 0 at 3x, 1 from 6x
    if (near > 0) {
      shapes(pieces, "urban");
      ctx.fillStyle = URBAN; ctx.globalAlpha = near; ctx.fill(); ctx.globalAlpha = 1;
    }
    shapes(pieces, "lakes");
    ctx.fillStyle = EMBER; ctx.fill();
    var bw = clamp(1.2 + 0.2 * Math.log2(Math.min(view.zoom, ZOOM_BASE)), 1.2, 2.2);
    if (near > 0) {
      stroke(pieces, "rivers", clamp(0.5 + 0.2 * lz, 0.6, 1.8), EMBER, 0.95 * near);
      stroke(pieces, "roads", clamp(0.2 * lz, 0.4, 1.2), MINOR, 0.8 * clamp((ze - 6) / 6, 0, 1));
      stroke(pieces, "highways", clamp(0.3 * lz, 0.6, 2), RED, 0.85 * near);
    }
    stroke(pieces, "states", bw * 0.6, TAUPE, 0.55 * clamp((ze - 1.3) / 2, 0, 1), [4, 3]);
    stroke(pieces, "borders", bw + 1.6, EMBER, 0.5);
    stroke(pieces, "borders", bw, BONE, 0.7);
    stroke(pieces, "lakes", 0.6, ASH, 0.7);
    stroke(pieces, "coast", 0.7, ASH, 0.85);

    // close in near a zone, the street map's own streets over it all
    var web = webAt(view.zoom * view.dive, view.lat);
    var streetNames = drawStreets(web);

    // a linen sheen where the light falls, over land and sea alike
    if (lights > 0) {
      ctx.beginPath(); ctx.arc(CX, CY, s, 0, 2 * Math.PI);
      var sheen = ctx.createRadialGradient(CX - s * .4, CY - s * .45, 0, CX - s * .2, CY - s * .2, s * 1.1);
      sheen.addColorStop(0, "rgba(232,226,220,.10)"); sheen.addColorStop(1, "rgba(232,226,220,0)");
      ctx.globalAlpha = lights; ctx.fillStyle = sheen; ctx.fill(); ctx.globalAlpha = 1;
    }

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
    if (rest > 0.98) drawPlaces(map.places.concat(marks, streetNames), avoid);
    drawDrops(lay, rest);
    zoomButtons();
    if (sel >= 0) zoomLabels();
    if (!inMotion) readSoon();
  }

  /* --- the zones on the globe -------------------------------------------- */
  // Points grow with the zoom (a fifth power: about twice the size at 32x,
  // and no bigger past 64x), and the room each needs grows with them.
  function radii() {
    var g = Math.pow(Math.min(view.zoom, ZOOM_BASE), 0.2);
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
  // A point's number sits on the side away from the spot it was moved off
  // (the outside of its ring), or to the right of a point that wasn't moved.
  function numberAt(q) {
    var w = 7 * list[q.i].n.length + 2;   // the pixel face at 7px: 7px a digit
    var dx = q.x - q.at[0], dy = q.y - q.at[1], d = Math.hypot(dx, dy);
    var right = d < 2 || dx >= -0.3 * d;
    var x = right ? q.x + q.r + 4 : q.x - q.r - 4 - w;
    return { x: x, y: q.y + (d < 2 ? 0 : (dy / d) * 4), box: [x - 1, q.y - 6, x + w + 1, q.y + 6] };
  }
  // the room the zones, their numbers and the pointer take on screen
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

  // Points within `room` of each other (directly or through a neighbour)
  // form a group, set out on a ring around the group's middle in the order
  // they really lie round it, turned to match (in San Francisco, Alcatraz
  // is the top one). As the zoom parts them, the ring eases into their true
  // places; by the time they are `room` apart they are there. A point with
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
    // threads from moved points back to where they really are, marked in ash
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
    if (shown) pointer(shown, rest);            // under the zones, so it hides none
    var others = pts.filter(function (q) { return q !== shown; });
    var claimed = others.filter(function (q) { return list[q.i].claimed; });
    var open = others.filter(function (q) { return !list[q.i].claimed; });
    dots(open.filter(function (q) { return !list[q.i].isNew; }), LINEN, 9);
    dots(open.filter(function (q) { return list[q.i].isNew; }), RED, 9);
    rings(claimed, ASH);                        // every drop claimed: hollow, the items are gone
    if (shown) dots([shown], BONE, 14);
    // the pointed-at point gets a ring of its own
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
        ctx.fillStyle = list[q.i].claimed ? ASH : LINEN;
        ctx.fillText(list[q.i].n, at.x, at.y);
      });
      ctx.restore();
    }
  }

  // Glowing points. The glow is the costly part of a point, so each colour,
  // size and glow is drawn once, into a little canvas of its own, and
  // stamped where it is wanted: a glow worked out afresh on every frame held
  // a flight to a few frames a second on a slower phone.
  var sprites = {};
  function sprite(colour, r, blur) {
    var key = colour + "|" + Math.round(r * 4) + "|" + blur + "|" + DPR;
    if (sprites[key]) return sprites[key];
    var pad = Math.ceil(r + blur + 2), c = document.createElement("canvas");
    c.width = c.height = 2 * Math.ceil(pad * DPR);
    var g = c.getContext("2d"), mid = c.width / 2 / DPR;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.shadowColor = RED; g.shadowBlur = blur;
    g.beginPath(); g.arc(mid, mid, Math.round(r * 4) / 4, 0, 2 * Math.PI);
    g.fillStyle = colour; g.fill();
    return (sprites[key] = { c: c, mid: mid, size: c.width / DPR });
  }
  // stamped on whole device pixels, a copy of the stamp: between them it
  // would be blurred
  function dots(qs, colour, blur) {
    qs.forEach(function (q) {
      var sp = sprite(colour, q.r, blur);
      ctx.drawImage(sp.c, Math.round((q.x - sp.mid) * DPR) / DPR, Math.round((q.y - sp.mid) * DPR) / DPR, sp.size, sp.size);
    });
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

  // The pointer from the reference screen: a red wedge aimed at the zone,
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
  // The prompt sits by the chosen zone whenever the globe is still: all
  // there is to say about it (see describe) and OPEN ZONE, the way into it.
  // The callout says what the mouse (or a tap) is on: another zone, much as
  // the prompt does, or a city, a peak, a landmark. Each keeps clear of the
  // points, the pointer, the zoom buttons and the other.
  var hover = null;                     // { drop: i } or { place: [...] }, under the mouse
  var calloutKey = "", cardKey = "", wantFocus = false, focusLate = 0;
  // the prompt's x: closes it, the keyboard going back to the zone's row
  var closer = el("button", "dw-x");
  closer.type = "button";
  closer.title = "Close (Esc)";
  closer.setAttribute("aria-label", "Close");
  closer.innerHTML = '<svg viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7"/></svg>';
  closer.addEventListener("click", function (ev) { var i = sel; select(-1); if (!ev.detail) focusRow(i); });
  function zoneHead(box, d) {
    box.appendChild(el("b", null, "Zone " + d.n));
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

  // Up and right of the zone if it fits, else the first place round it
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
      zoneHead(card, d);
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
  // Enter on a row goes on to the prompt's OPEN ZONE: at once when it opens
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

  // The callout: what the mouse or a tap is on. Not the chosen zone, whose
  // prompt by it says all that already; but where that prompt is under the
  // zone's row (a narrow window), the zone on the globe says it too.
  function placeCallout(lay, rest, avoid) {
    var target = null;
    if (hover && hover.drop != null && (hover.drop !== sel || docked())) {
      var q = lay.pts.filter(function (p) { return p.i === hover.drop; })[0], d = q && list[q.i];
      if (q) target = { key: "d" + q.i, x: q.x, y: q.y, r: q.r,
                        make: function (box) { zoneHead(box, d); describe(box, d, "popup"); } };
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
  // first; a name that would overlap one already down, a zone or the
  // callout is left out.
  var STYLE = {
    c: { font: "8px 'Press Start 2P', monospace", size: 8, fill: TAUPE, alpha: 0.8, upper: true },
    s: { font: "bold 9px Arial, Helvetica, sans-serif", size: 9, fill: ASH, alpha: 1, upper: true },
    k: { font: "bold 11px Arial, Helvetica, sans-serif", size: 11, fill: LINEN, alpha: 0.95, mark: "square" },
    t: { font: "11px Arial, Helvetica, sans-serif", size: 11, fill: LINEN, alpha: 0.85, mark: "dot" },
    p: { font: "italic 10px Arial, Helvetica, sans-serif", size: 10, fill: TAUPE, alpha: 0.9, mark: "peak" },
    l: { font: "11px Arial, Helvetica, sans-serif", size: 11, fill: BONE, alpha: 0.95, mark: "diamond" },
    n: { font: "bold 9px Arial, Helvetica, sans-serif", size: 9, fill: TAUPE, alpha: 0.95, upper: true }
  };
  var ORDER = { l: 0, c: 1, k: 2, t: 3, s: 4, n: 5, p: 6 };
  var widths = {}, placeHits = [];
  function textWidth(font, text) {
    var k = font + "|" + text;
    if (!(k in widths)) { ctx.font = font; widths[k] = ctx.measureText(text).width; }
    return widths[k];
  }
  function drawPlaces(all, placed) {
    var zw = Math.log2(R * view.zoom / 40.74) - LABEL_BIAS, centre = [view.lng, view.lat], cand = [], seen = {};
    all.forEach(function (pl) {
      if (pl[4] > zw || zw > pl[5] + 0.5) return;
      // a town the street map names as well as Natural Earth: once
      var said = pl[0] + pl[1].toLowerCase();
      if (pl[0] === "t" || pl[0] === "k") { if (seen["t" + pl[1].toLowerCase()]) return; seen["t" + pl[1].toLowerCase()] = 1; }
      else if (seen[said]) return;
      else seen[said] = 1;
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
    if (!hasGlobe || reduceMotion || !ms || !W) { inMotion = false; heading = null; view = to; draw(); return Promise.resolve(); }
    var from = view, a = [from.lng, from.lat], b = [to.lng, to.lat];
    var arc = d3.geoInterpolate(a, b), far = d3.geoDistance(a, b);
    var z0 = Math.log(from.zoom), z1 = Math.log(to.zoom), v0 = Math.log(from.dive), v1 = Math.log(to.dive);
    var fits = Math.log(Math.max(1, 1.9 / Math.max(far, 1e-9)));   // the zoom that shows both ends
    var dip = flight ? 0 : Math.max(0, (z0 + z1) / 2 - fits);
    if (dip > 0.3) ms *= 1.4;
    var t0 = performance.now();
    inMotion = true; heading = to.zoom;
    return new Promise(function (done) {
      (function step(t) {
        if (me !== anim) return done();
        var k = Math.min(1, (t - t0) / ms), e = (curve || ease)(k), u = e, z;
        if (flight) { var f = flight(e); u = clamp(f[0], 0, 1); z = clamp(f[1], 1, ZOOM_LIMIT); }
        else z = Math.exp(z0 + (z1 - z0) * e - dip * 4 * e * (1 - e));
        var ll = arc(u);
        view = { lng: ll[0], lat: ll[1], zoom: z, dive: Math.exp(v0 + (v1 - v0) * e) };
        if (k >= 1) { inMotion = false; heading = null; view = to; }   // the last frame settles the callout
        draw();
        if (k < 1) requestAnimationFrame(step); else done();
      })(t0);
    });
  }

  // Fly to zone i (none: where the zones are) at zoom z, as close as the
  // globe goes unless told: the zone ends in the middle. The way is van Wijk
  // and Nuij's smooth zooming and panning, as d3's interpolateZoom draws it:
  // out as far as the distance needs, across, and back down, never losing
  // sight of where it is going. Its length sets the time it takes; pace
  // shortens that (pulling back out is quicker than going in).
  function flyTo(i, z, pace) {
    aimed = i;
    var to = aim(i, z || closeFor(i));
    if (!hasGlobe || !W) { view = to; draw(); return Promise.resolve(); }
    var far = d3.geoDistance([view.lng, view.lat], [to.lng, to.lat]);
    var way = flight(view.zoom, to.zoom, far, clamp(W / R, 2, 3.5));
    return turnTo(to, clamp(250 + way.length * 330, 550, 2000) * (pace || 1), ease, way.at);
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
  // The prompt's ZOOM IN flies to its zone, as close as the globe goes
  // there (over the street map, its street level); ZOOM OUT, from there,
  // back out to the whole globe, still on the zone.
  function zoomToggle() {
    if (sel < 0) return;
    if (view.zoom >= closeFor(sel) * (1 - 1e-6)) flyTo(sel, 1, 0.65); else flyTo(sel);
  }
  // zone i in the middle of the globe, as it is
  function centred(i) {
    var d = list[i];
    return !!d && hasPos(d) && hasGlobe &&
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
  // that is the chosen zone, the globe is no longer pointed at it.
  function zoomTo(z, p, ms, onDrop) {
    var me = ++anim, z0 = view.zoom, g = groundAt(p);
    if (!onDrop) aimed = -1;
    if (reduceMotion || !ms) { inMotion = false; heading = null; zoomAbout(g, p, z); draw(); return; }
    var t0 = performance.now();
    inMotion = true; heading = z;
    (function step(t) {
      if (me !== anim) return;
      var k = Math.min(1, (t - t0) / ms);
      zoomAbout(g, p, z0 * Math.pow(z / z0, ease(k)));
      if (k >= 1) { inMotion = false; heading = null; }
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

  // + and -: a doubling at a time, about the chosen zone while the globe
  // is still pointed at it (so it stays where it is), otherwise about the
  // centre: dragged off to Europe, + goes into Europe, not back to the zone
  // sitting at the edge.
  function zoomBy(dir) {
    var l = Math.log2(view.zoom);
    var z = capped(Math.pow(2, dir > 0 ? Math.floor(l + 1e-6) + 1 : Math.ceil(l - 1e-6) - 1));
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
  // 0 and the globe button: back out to the whole globe, on the chosen
  // zone (none: where the zones are).
  function whole() {
    if (zoomAll.getAttribute("aria-disabled") !== "true") flyTo(sel, 1, 0.65);
  }

  // The buttons say when there is nothing left to do. They stay focusable
  // (aria-disabled, not disabled) so the keyboard doesn't lose its place.
  var zoomState = "";
  function zoomButtons() {
    var z = view.zoom, home = aim(sel, 1);
    var state = [z >= zoomCap() * (1 - 1e-6), z <= 1.001,
                 z <= 1.001 && view.dive === 1 && Math.abs(view.lat - home.lat) < 0.5 &&
                 Math.abs(((view.lng - home.lng) % 360 + 540) % 360 - 180) < 0.5];
    if (state.join() === zoomState) return;
    zoomState = state.join();
    zoomIn.setAttribute("aria-disabled", state[0]);
    zoomOut.setAttribute("aria-disabled", state[1]);
    zoomAll.setAttribute("aria-disabled", state[2]);
  }

  /* --- choosing ------------------------------------------------------------ */
  // Choosing a zone: the list marks it, and its prompt opens (by it on the
  // globe once the globe is still, or under its row on a phone). It is never
  // opened from here. how: "fly" turns the globe to it, at the zoom it is
  // at (the list), "stay" leaves the globe where it is (a click on its
  // zone), "jump" turns the globe to it at once, "hold" leaves it for a
  // dive about to take it there. Chosen again while the globe is on its way
  // to it, the globe carries on; one already in the middle just opens its
  // prompt. -1 chooses none: the prompt closes.
  var aimed = -1;                       // the zone + and - zoom about, while the globe stays on it
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
    if ((again && inMotion) || (!inMotion && centred(i))) { draw(); return; }
    flyTo(i, view.zoom);
  }

  // Keys. World: arrows walk the list (choosing as they go), Enter on a
  // zone goes on to its OPEN ZONE, + - 0 zoom. A zone: Esc goes back,
  // the arrows walk its list of drops and turn its photos of the spot
  // (drops.js does both), and pan the street map while it has focus.
  // drops.js sees no other arrows: it would
  // step to the next zone, and a zone's screen shows that one zone. With
  // Alt, Ctrl or Cmd they are the browser's (Alt+Left is Back).
  document.addEventListener("keydown", function (ev) {
    var t = ev.target;
    if (t && t.closest && t.closest("input, textarea, select, [contenteditable]")) return;
    var step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[ev.key];
    var plain = !(ev.altKey || ev.ctrlKey || ev.metaKey);
    // a zone's list of drops and its photos of the spot: drops.js walks them
    if (step && root.dataset.view !== "world" && t && t.closest && t.closest("#dp-log, .dp-spot")) return;
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
  // zoom. A click or tap on a zone chooses it where it is (never opens it:
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
      drag = null; anim++; inMotion = true; heading = null; aimed = -1;
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
      zoomAbout(pinch.g, two.mid, capped(pinch.zoom * two.gap / pinch.gap));
      draw();
      return;
    }
    if (!drag) {
      // the mouse over a zone or a name: say what it is
      var q = hit(ev), pl = q ? null : hitPlace(ev);
      canvas.style.cursor = q ? "pointer" : pl ? "help" : "grab";
      if (ev.pointerType === "mouse" || ev.pointerType === "pen") setHover(q ? { drop: q.i } : pl ? { place: pl } : null);
      return;
    }
    var dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true; anim++; inMotion = true; heading = null; hover = null; aimed = -1;
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
    var z = capped(view.zoom * Math.exp(-dy * (ev.ctrlKey ? 0.01 : 0.004)));
    if (Math.abs(z - view.zoom) < 1e-6) return;
    var r = canvas.getBoundingClientRect(), p = [ev.clientX - r.left, ev.clientY - r.top];
    anim++; inMotion = true; heading = null; aimed = -1;
    zoomAbout(groundAt(p), p, z);
    draw();
    settleSoon();
  }
  canvas.addEventListener("wheel", wheelZoom, { passive: false });
  // over the prompt too: it covers a good part of the globe, and has
  // nothing of its own to scroll
  card.addEventListener("wheel", wheelZoom, { passive: false });

  // The world view has its own "What is a drop?" (the zone screen's lives
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
  // The zone's windows set off first, and only once they are on their way
  // (the browser flies them, after-images and all, from then on) does
  // drops.js put the zone in them: its street map takes a moment to draw,
  // which would otherwise hold them at the edge of the screen. They are
  // still off it when it does. j: the drop chosen there.
  async function arrive(i, j, scope) {
    if (!moving()) { drops.open(i, j); return; }
    var landed = fly().enter(scope, IN);
    await nextFrame(); await nextFrame();
    drops.open(i, j);
    await landed;
  }

  async function toDrop(i, j) {
    if (root.dataset.view === "drop") {
      // the address changed (typed, a link, Back): another drop at this
      // zone is just chosen; for another zone the windows fly out, and
      // back in with it
      if (drops.current() === i) { drops.show(i, j); return; }
      if (moving()) {
        await fly().exit(detail, OUT);
        if (next && next.i >= 0) { i = next.i; j = next.j; next = null; }   // asked for again meanwhile
      }
      if (fly()) fly().reset(detail);
      window.scrollTo(0, 0);                    // a phone scrolls a zone's page
      await arrive(i, j, detail);
      return;
    }
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
    document.title = title(i);
    if (fromWorld) backButton().focus({ preventScroll: true });   // the keyboard's way back
    await arrive(i, j, shell);                  // drops.open sizes the map, now it can be seen
  }

  async function toWorld() {
    if (root.dataset.view === "world") return;
    var i = Math.max(0, drops.current()), fromDrop = shell.contains(document.activeElement);
    if (moving()) await fly().exit(shell, OUT);
    root.dataset.view = "world";
    window.scrollTo(0, 0);                      // wherever the zone's page was scrolled to
    if (moving()) flash();
    if (fly()) fly().reset(shell);
    document.title = TITLE;
    size();
    select(i, "jump");
    if (fromDrop) focusRow(i);
    if (moving()) {
      fly().enter(listPanel, IN);
      view = dive(i); draw();                   // start inside the zone we left
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
        try { await (j.i >= 0 ? toDrop(j.i, j.j) : toWorld()); } catch (e) { console.error(e); }
      }
      busy = null;
    })();
  }

  // The address decides the screen: drops#03 is zone 03, drops#003 drop 003
  // at its zone, anything else the world. OPEN ZONE is a link to the zone,
  // so Back, reload and sharing just work.
  function hashId() {
    try { return decodeURIComponent(location.hash.slice(1)); }
    catch (e) { return ""; }                    // a mangled address: the world
  }
  function route(initial) {
    var at = find(hashId()), i = at ? at[0] : -1;
    if (i < 0 && location.hash) history.replaceState(null, "", location.pathname + location.search);
    if (initial) {                               // no animation on arrival
      root.dataset.view = i < 0 ? "world" : "drop";
      if (i >= 0) { document.title = title(i); sel = i; }
      return;
    }
    if (i >= 0 && root.dataset.view === "world") history.replaceState({ fromWorld: true }, "");
    go({ i: i, j: at ? at[1] : 0 });
  }
  window.addEventListener("hashchange", function () { route(false); });

  // WORLD MAP: step back if we came from the world, so Back and Forward stay
  // one step apart; otherwise (a shared link to one zone) go forward to it.
  function toWorldByHand() {
    if (history.state && history.state.fromWorld) { history.back(); return; }
    history.pushState(null, "", location.pathname + location.search);
    go({ i: -1 });
  }

  // Keep the address and the title in step with the zone showing and the
  // drop chosen there, the address without adding history: left as it is
  // while it already says them (the zone's own, opened on its newest drop),
  // else the drop's, so a link shared from here opens on that drop.
  document.addEventListener("pn0va:drop", function (ev) {
    var d = list[ev.detail.index];
    if (root.dataset.view !== "drop" || !d) return;
    var j = ev.detail.drop, at = find(hashId());
    if (!at || at[0] !== d.i || at[1] !== Math.max(j, 0)) {
      var e = d.drops[j];
      history.replaceState(history.state, "", "#" + (e ? e.dataset.n : d.n));
    }
    document.title = title(d.i);
  });

  /* --- start --------------------------------------------------------------- */
  route(true);
  if (sel >= 0) select(sel, "jump");
  if (hasGlobe) {
    if (window.ResizeObserver) new ResizeObserver(function () { if (size()) draw(); }).observe(box);
    else window.addEventListener("resize", function () { if (size()) draw(); });
    if (size()) draw();
    if (document.fonts) document.fonts.ready.then(draw);
    // The next level of detail, which any zoom or flight past the whole
    // globe needs, read while the page is idle rather than in the first
    // flight (the largest file: 400 KB as served, three times that read).
    // Asked to save data, or on a slow connection, it waits for a sign of
    // interest instead: the pointer, the keyboard or a finger on the world.
    var idle = window.requestIdleCallback ? function (fn) { requestIdleCallback(fn, { timeout: 3000 }); }
                                          : function (fn) { setTimeout(fn, 1500); };
    var early = function () {
      if (files["0"] && files["0"].ready) load("1");
      else setTimeout(function () { idle(early); }, 800);
    };
    var net = navigator.connection;
    if (net && (net.saveData || /2g/.test(net.effectiveType || ""))) {
      ["pointerover", "focusin", "touchstart"].forEach(function (type) {
        world.addEventListener(type, function () { idle(early); }, { once: true, passive: true });
      });
    } else idle(early);
  }
})();
