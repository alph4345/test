/* ==========================================================================
   DROPS — drop points and the drops left at them
   rev 2026.10.09
   --------------------------------------------------------------------------
   Content lives in the HTML: each drop point is a <section class="dp-point">
   with data-* attributes, holding the drops left there as <article
   class="dp-entry"> blocks, newest first. This file reads them at runtime
   and never needs editing to add a point or a drop.

   A point's screen: the frequency bar (its number, coordinates, latest drop
   and how many), the street map round it, the list of its drops, and the
   chosen drop's transmission (its story) and item.

   Two registers, kept apart on purpose:
     This page is register A only — instrument. The living layer (fireflies)
     belongs to the home page, where the identity is stated; interior pages are
     working surfaces and stay quiet.
   ========================================================================== */

(function () {
  "use strict";

  /* Streets: pn0vaBasemap() in drops-map.js, from maps/drops.pmtiles. */

  /* Range rings, in metres, round the point: the scale of the ground you
     will be walking, so these are information, not decoration. */
  var RINGS = [100, 250, 500];

  var entries = [].slice.call(document.querySelectorAll(".dp-point"));
  if (!entries.length) return;
  /* each point's drops, newest first */
  var dropsOf = entries.map(function (pt) {
    return [].filter.call(pt.children, function (c) { return c.classList.contains("dp-entry"); });
  });

  var map = null, marker = null, current = -1, chosen = -1;

  var el = {
    rows:    document.getElementById("dp-rows"),
    count:   document.getElementById("dp-count"),
    brief:   document.getElementById("dp-brief"),
    osm:     document.getElementById("dp-osm"),
    n:       document.getElementById("r-n"),
    lat:     document.getElementById("r-lat"),
    lng:     document.getElementById("r-lng"),
    placed:  document.getElementById("r-placed"),
    drops:   document.getElementById("r-count"),
    place:   document.getElementById("r-place"),
    title:   document.getElementById("r-title"),
    log:     document.getElementById("dp-log"),
    logn:    document.getElementById("r-logn"),
    item:    document.getElementById("s-item"),
    itemc:   document.getElementById("s-itemcap"),
    dropn:   document.getElementById("r-dropn"),
    claimed: document.getElementById("r-claimed")
  };

  /* --- helpers ---------------------------------------------------------- */

  /* Coordinates are shown as unsigned magnitudes with a hemisphere unit in
     the markup (°N / °W), so the sign has to come off the number. */
  function mag(v){ return Math.abs(parseFloat(v)).toFixed(4); }

  function daysSince(stamp){
    var p = String(stamp).split(".");
    if (p.length !== 3) return NaN;
    var then = new Date(+p[0], +p[1] - 1, +p[2]);
    return isNaN(then) ? NaN : (Date.now() - then) / 86400000;
  }

  /* NEW for a drop's first week. CLAIMED once data-claimed says so, with
     its date if it has one; a drop without it shows nothing either way. */
  function isNew(e){ return daysSince(e.dataset.placed) < 7; }
  function claimedOf(e){
    if (!e.hasAttribute("data-claimed")) return null;
    var v = (e.getAttribute("data-claimed") || "").trim();
    return /^(no|false|0)$/i.test(v) ? null : v;
  }
  function plural(n, one){ return n + " " + one + (n === 1 ? "" : "s"); }

  /* --- manifest: the points --------------------------------------------- */

  function buildManifest(){
    var frag = document.createDocumentFragment();
    entries.forEach(function (pt, i) {
      var latest = dropsOf[i][0];
      var b = document.createElement("button");
      b.type = "button";
      b.className = "dp-row";
      b.setAttribute("aria-current", "false");
      b.innerHTML =
        '<span class="dp-row__n">' + pt.dataset.n + '</span>' +
        '<span class="dp-row__d">' + (latest ? latest.dataset.placed : "") + '</span>';
      b.addEventListener("click", function(){ show(i); });
      frag.appendChild(b);
    });
    el.rows.appendChild(frag);
    el.count.textContent = String(entries.length).padStart(2, "0") + " PTS";
  }

  /* --- a point ------------------------------------------------------------ */

  /* Point i, with its drop j chosen (its newest, unless told). */
  function show(i, j){
    if (!entries[i]) return;
    j = dropsOf[i][j] ? j : 0;
    if (i === current){ pick(j); return; }
    var pt = entries[i], d = pt.dataset, drops = dropsOf[i];
    current = i;
    chosen = -1;

    entries.forEach(function(x){ x.classList.remove("is-current"); });
    pt.classList.add("is-current");
    [].forEach.call(el.rows.children, function(r, n){
      r.setAttribute("aria-current", n === i ? "true" : "false");
    });

    el.n.textContent      = d.n;
    el.lat.textContent    = mag(d.lat);
    el.lng.textContent    = mag(d.lng);
    /* the unit says which side of the equator and of Greenwich */
    el.lat.nextElementSibling.textContent = "\u00b0" + (+d.lat < 0 ? "S" : "N");
    el.lng.nextElementSibling.textContent = "\u00b0" + (+d.lng < 0 ? "W" : "E");
    el.placed.textContent = drops[0] ? drops[0].dataset.placed : "—";
    el.drops.textContent  = drops.length;
    el.place.textContent  = d.place || "—";

    buildLog(drops);

    el.osm.href = "https://www.openstreetmap.org/?mlat=" + d.lat + "&mlon=" + d.lng +
                  "#map=" + (d.zoom || 15) + "/" + d.lat + "/" + d.lng;

    moveMap(+d.lat, +d.lng, +(d.zoom || 15));
    pick(j);
  }

  /* The drops left at the point, newest first: number, title, date, and
     NEW or CLAIMED. Choosing one shows its transmission and its item. */
  function buildLog(drops){
    el.log.textContent = "";
    el.logn.textContent = plural(drops.length, "drop");
    drops.forEach(function (e, j) {
      var x = e.dataset, claimed = claimedOf(e);
      var b = document.createElement("button");
      b.type = "button";
      b.className = "dp-logrow";
      b.setAttribute("aria-current", "false");
      b.innerHTML =
        '<span class="dp-logrow__n"></span><span class="dp-logrow__t"></span>' +
        '<span class="dp-logrow__d"></span><span class="dp-logrow__s"></span>';
      b.children[0].textContent = x.n;
      b.children[1].textContent = x.title || "Drop " + x.n;
      b.children[2].textContent = x.placed || "";
      if (claimed !== null){ b.children[3].textContent = "Claimed"; b.children[3].className += " is-claimed"; }
      else if (isNew(e)){ b.children[3].textContent = "New"; b.children[3].className += " is-new"; }
      b.addEventListener("click", function(){ pick(j); });
      el.log.appendChild(b);
    });
  }

  /* --- a drop at the point ------------------------------------------------- */

  function pick(j){
    var drops = dropsOf[current], e = drops && drops[j];
    if (!e){ if (drops && !drops.length) nothingYet(); return; }
    if (j === chosen) return;
    var x = e.dataset, claimed = claimedOf(e);
    chosen = j;

    drops.forEach(function(y){ y.classList.remove("is-current"); });
    e.classList.add("is-current");
    [].forEach.call(el.log.children, function(r, n){
      r.setAttribute("aria-current", n === j ? "true" : "false");
    });

    el.title.textContent = x.title || "";
    el.dropn.textContent = "#" + x.n;
    el.item.src = x.item || "images/item-placeholder.svg";
    el.item.alt = "The item left at drop " + x.n;
    el.itemc.textContent = x.itemcap || "";
    /* CLAIMED in the item's head, the photo left clear; the date where the
       head has room for it (the CSS decides) */
    el.claimed.hidden = claimed === null;
    el.claimed.textContent = claimed === null ? "" : "Claimed";
    if (claimed){
      var when = document.createElement("span");
      when.className = "d";
      when.textContent = " " + claimed;
      el.claimed.appendChild(when);
    }

    el.brief.innerHTML = "";
    [].forEach.call(e.querySelectorAll("p"), function(p){
      el.brief.appendChild(p.cloneNode(true));
    });

    document.dispatchEvent(new CustomEvent("pn0va:drop", { detail: { index: current, drop: j } }));
  }

  /* A point with no drop at it yet: nothing to show but the place. */
  function nothingYet(){
    chosen = -1;
    el.title.textContent = "—";
    el.dropn.textContent = "—";
    el.item.src = "images/item-placeholder.svg";
    el.item.alt = "";
    el.itemc.textContent = "—";
    el.claimed.hidden = true;
    el.claimed.textContent = "";
    el.brief.innerHTML = "";
    document.dispatchEvent(new CustomEvent("pn0va:drop", { detail: { index: current, drop: -1 } }));
  }

  /* --- map -------------------------------------------------------------- */

  var rings = [], ringLabels = [];
  var home = null;              // where the current point actually is
  var recenterBtn = null;

  function buildMap(lat, lng, zoom){
    /* All three animations off. Two reasons, and they agree:

       Register — this is equipment. It cuts to a new state, it does not
       glide there. Gliding would read as organic motion, which belongs to
       the fireflies and nowhere else.

       Robustness — every one of these is driven by requestAnimationFrame,
       which browsers stop firing when the document is hidden or throttled.
       With them on, a backgrounded tab can strand tiles at opacity 0 and
       leave the zoom buttons doing nothing at all. */
    home = { lat: lat, lng: lng, zoom: zoom };
    map = L.map("dp-map", {
      scrollWheelZoom:false, attributionControl:false,
      minZoom:8, maxZoom:18,   // the map file holds zooms 8-15; above that it is scaled up
      fadeAnimation:false, zoomAnimation:false, markerZoomAnimation:false
    }).setView([lat, lng], zoom);
    L.control.attribution({ position:"bottomright", prefix:false }).addTo(map);

    /* Two panes so each tile set can carry its own CSS filter.

       BOTH z-indexes must be set explicitly. Leaflet's stylesheet gives every
       .leaflet-pane a default z-index of 400, so setting only the label pane
       leaves the opaque ground tiles painting on top of it and the street
       names vanish. Stack it the way Leaflet stacks its own panes:
         200 ground · 350 labels · 400 overlay (rings) · 600 marker          */
    map.createPane("base");   map.getPane("base").className   += " dp-pane-base";
    map.createPane("labels"); map.getPane("labels").className += " dp-pane-labels";
    map.getPane("base").style.zIndex   = 200;
    map.getPane("labels").style.zIndex = 350;
    map.getPane("labels").style.pointerEvents = "none";

    if (window.pn0vaBasemap) pn0vaBasemap(map);

    RINGS.forEach(function(r, i){
      rings.push(L.circle([lat, lng], {
        radius:r, className:"dp-ring", interactive:false,
        color:"#FF1609", weight:1, opacity:.30 - i * .06,
        fill:true, fillColor:"#FF1609", fillOpacity:i === 0 ? .05 : .02,
        dashArray:i === 0 ? null : "3 5"
      }).addTo(map));

      ringLabels.push(L.marker([lat, lng], {
        interactive:false,
        icon:L.divIcon({ className:"", iconSize:[0,0],
          html:'<span class="dp-ring-label">' + r + ' m</span>' })
      }).addTo(map));
    });

    marker = L.marker([lat, lng], {
      icon: L.divIcon({ className:"", html:'<div class="dp-marker"><i></i></div>',
                        iconSize:[14,14], iconAnchor:[7,7] })
    }).addTo(map);

    /* ------------------------------------------------------------------
       RECENTER. The map is draggable, so the marker can be pushed off screen
       with no way back — switching records and returning was the only reset.
       This is the standard "locate" affordance, drawn as a reticle to match
       the +/- bars, and it dims itself when you are already on the point.
       ------------------------------------------------------------------ */
    var Recenter = L.Control.extend({
      options: { position: "topleft" },
      onAdd: function () {
        var box = L.DomUtil.create("div", "leaflet-bar dp-recenter");
        var a = L.DomUtil.create("a", "", box);
        a.href = "#";
        a.title = "Recenter on the point";
        a.setAttribute("role", "button");
        a.setAttribute("aria-label", "Recenter on the point");
        L.DomEvent.on(a, "click", L.DomEvent.stop);
        L.DomEvent.on(a, "click", recenter);
        recenterBtn = box;
        return box;
      }
    });
    map.addControl(new Recenter());

    map.on("move zoom viewreset", drawGraticule);
    map.on("moveend zoomend", markHome);
    placeRingLabels(lat, lng);
    drawGraticule();
    markHome();
  }

  function moveMap(lat, lng, zoom){
    if (typeof L === "undefined") return;
    home = { lat: lat, lng: lng, zoom: zoom };
    if (!map){ buildMap(lat, lng, zoom); return; }

    marker.setLatLng([lat, lng]);
    rings.forEach(function(c){ c.setLatLng([lat, lng]); });
    /* Instrument register: the map cuts to the new coordinates, it does not
       glide there. Panning would read as organic motion. */
    map.setView([lat, lng], zoom, { animate:false });
    map.invalidateSize();
    markHome();
    placeRingLabels(lat, lng);
    drawGraticule();
  }

  function recenter(){
    if (!map || !home) return;
    map.setView([home.lat, home.lng], home.zoom, { animate: false });
    markHome();
  }

  /* Dim the control while the view already matches the point, so it reads as
     state rather than as a button that may or may not do anything. */
  function markHome(){
    if (!map || !home || !recenterBtn) return;
    /* Compare in PIXELS, not degrees. setView lands on a whole pixel, so the
       centre it reports can sit ~2e-5 deg off the requested point at zoom 15 —
       wider than any sensible degree tolerance, and it changes with zoom.
       Pixels are exact and scale-free. */
    var here = map.latLngToContainerPoint([home.lat, home.lng]);
    var mid  = map.getSize().divideBy(2);
    var put  = map.getZoom() === home.zoom &&
               Math.abs(here.x - mid.x) < 2 && Math.abs(here.y - mid.y) < 2;
    recenterBtn.classList.toggle("is-home", put);
  }

  /* Ring labels ride due east of centre, just inside each ring. */
  function placeRingLabels(lat, lng){
    if (!map) return;
    var mPerDeg = 111320 * Math.cos(lat * Math.PI / 180);
    RINGS.forEach(function(r, i){
      ringLabels[i].setLatLng([lat, lng + (r / mPerDeg)]);
    });
  }

  /* --- graticule: edge ticks + live bounds ------------------------------
     The mm-ruler habit from the pin work, applied to a map. Ticks are drawn
     in screen space along the panel edges; the corner readout reports the
     visible extent so the panel always says what it is showing. */
  function drawGraticule(){
    var host = document.getElementById("dp-grat");
    if (!host || !map) return;

    var s = map.getSize(), w = s.x, h = s.y;
    if (!w || !h) return;

    var parts = [], STEP = 26, i;
    for (i = STEP; i < w; i += STEP){
      var tall = (i / STEP) % 5 === 0;
      parts.push('<line x1="' + i + '" y1="0" x2="' + i + '" y2="' + (tall ? 9 : 5) + '"/>');
      parts.push('<line x1="' + i + '" y1="' + h + '" x2="' + i + '" y2="' + (h - (tall ? 9 : 5)) + '"/>');
    }
    for (i = STEP; i < h; i += STEP){
      var big = (i / STEP) % 5 === 0;
      parts.push('<line x1="0" y1="' + i + '" x2="' + (big ? 9 : 5) + '" y2="' + i + '"/>');
      parts.push('<line x1="' + w + '" y1="' + i + '" x2="' + (w - (big ? 9 : 5)) + '" y2="' + i + '"/>');
    }

    host.innerHTML =
      '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
        '<g stroke="currentColor" stroke-width="1" opacity=".42">' + parts.join("") + '</g>' +
      '</svg>';

    var b = map.getBounds();
    document.getElementById("dp-bounds").innerHTML =
      'N <b>' + b.getNorth().toFixed(3) + '</b><br>' +
      'S <b>' + b.getSouth().toFixed(3) + '</b><br>' +
      'W <b>' + Math.abs(b.getWest()).toFixed(3) + '</b>';
  }

  /* --- keyboard: the arrows walk the list they are in ---------------------
     In the list of drops, from one drop to the next at this point; in the
     list of points, from point to point. Nowhere else: on the rest of the
     screen they are the page's (or the street map's). */

  document.addEventListener("keydown", function(ev){
    /* target is document itself when nothing is focused in some browsers,
       and document has no .closest — guard before reaching for it */
    var t = ev.target;
    if (!t || !t.closest || t.closest("input, textarea, select, [contenteditable]")) return;
    var step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[ev.key];
    if (!step || ev.altKey || ev.ctrlKey || ev.metaKey) return;   /* Alt+Left is Back */
    if (t.closest("#dp-log")){
      var j = chosen + step;
      if (dropsOf[current][j]){ pick(j); el.log.children[j].focus(); }
      ev.preventDefault();
    } else if (t.closest("#dp-rows")){
      var i = current + step;
      if (entries[i]){ show(i); el.rows.children[i].focus(); }
      ev.preventDefault();
    }
  });

  window.addEventListener("resize", function(){ if (map) map.invalidateSize(); });

  /* --- help panel ------------------------------------------------------
     <details> already gives us open/close, keyboard operation and Esc for
     free, and it all works with JS off. The only thing it can't do on its
     own is close when you click elsewhere, so that's all we add. */
  (function(){
    var help = document.getElementById("dp-help");
    if (!help) return;
    document.addEventListener("click", function(ev){
      if (help.open && !help.contains(ev.target)) help.open = false;
    });
    document.addEventListener("keydown", function(ev){
      if (ev.key === "Escape" && help.open) help.open = false;
    });
  })();

  buildManifest();

  /* drops#03 opens on point 03, drops#003 on the point drop 003 was left at,
     with that drop chosen; anything else, on the newest point */
  function find(id){
    for (var i = 0; i < entries.length; i++){
      if (entries[i].dataset.n === id) return [i, 0];
      for (var j = 0; j < dropsOf[i].length; j++)
        if (dropsOf[i][j].dataset.n === id) return [i, j];
    }
    return null;
  }
  var at = find(decodeURIComponent(location.hash.slice(1))) || [0, 0];
  show(at[0], at[1]);
  setTimeout(function(){ if (map) map.invalidateSize(); }, 250);

  /* For drops-world.js, which moves between the world view and a point. */
  window.pn0vaDrops = {
    entries: entries,
    drops: function (i) { return dropsOf[i] || []; },
    find: find,
    current: function () { return current; },
    chosen: function () { return chosen; },
    map: function () { return map; },
    /* Point i with drop j chosen, on the screen as it is. */
    show: function (i, j) { show(i, j); },
    /* Show point i (drop j chosen) in a panel that has just become visible.
       Size the map first: while hidden, Leaflet measured it as nothing. */
    open: function (i, j) {
      if (map) map.invalidateSize({ pan: false });
      current = -1;
      show(i, j);
    }
  };
})();
