/* ==========================================================================
   DROPS — manifest + record viewer
   rev 2026.07.31
   --------------------------------------------------------------------------
   Content lives in the HTML as <article class="dp-entry"> blocks with data-*
   attributes; this file counts them at runtime and never needs editing to
   add a record.

   Two registers, kept apart on purpose:
     This page is register A only — instrument. The living layer (fireflies)
     belongs to the home page, where the identity is stated; interior pages are
     working surfaces and stay quiet.
   ========================================================================== */

(function () {
  "use strict";

  /* Streets: pn0vaBasemap() in drops-map.js, from maps/drops.pmtiles. */

  /* Search rings, in metres. A drop is somewhere inside the smallest one you
     can stand in, so these are information, not decoration. */
  var RINGS = [100, 250, 500];

  var entries = [].slice.call(document.querySelectorAll(".dp-entry"));
  if (!entries.length) return;

  var map = null, marker = null, current = -1;

  var el = {
    rows:   document.getElementById("dp-rows"),
    count:  document.getElementById("dp-count"),
    open:   document.getElementById("dp-open"),
    done:   document.getElementById("dp-done"),
    brief:  document.getElementById("dp-brief"),
    osm:    document.getElementById("dp-osm"),
    n:      document.getElementById("r-n"),
    status: document.getElementById("r-status"),
    lat:    document.getElementById("r-lat"),
    lng:    document.getElementById("r-lng"),
    placed: document.getElementById("r-placed"),
    days:   document.getElementById("r-days"),
    place:  document.getElementById("r-place"),
    title:  document.getElementById("r-title"),
    hint:   document.getElementById("s-hint"),
    hintc:  document.getElementById("s-hintcap"),
    item:   document.getElementById("s-item"),
    itemc:  document.getElementById("s-itemcap")
  };

  /* --- helpers ---------------------------------------------------------- */

  function isOpen(e){ return (e.dataset.status || "open").toLowerCase() !== "recovered"; }

  /* Coordinates are shown as unsigned magnitudes with a hemisphere unit in
     the markup (°N / °W), so the sign has to come off the number. */
  function mag(v){ return Math.abs(parseFloat(v)).toFixed(4); }

  function daysSince(stamp){
    var p = String(stamp).split(".");
    if (p.length !== 3) return "—";
    var then = new Date(+p[0], +p[1] - 1, +p[2]);
    if (isNaN(then)) return "—";
    return String(Math.max(0, Math.round((Date.now() - then) / 86400000)));
  }

  /* --- manifest --------------------------------------------------------- */

  function buildManifest(){
    var frag = document.createDocumentFragment(), open = 0;

    entries.forEach(function (e, i) {
      var live = isOpen(e);
      if (live) open++;

      var b = document.createElement("button");
      b.type = "button";
      b.className = "dp-row";
      b.setAttribute("aria-current", "false");
      /* Status in the manifest is DATA, not position — many rows can be open
         at once, so it uses the chroma, not the signal. Bone is reserved for
         the selected row (see .dp-row[aria-current] in drops.css). */
      b.innerHTML =
        '<span class="dp-row__n">' + e.dataset.n + '</span>' +
        '<span class="dp-row__d">' + e.dataset.placed + '</span>';
      b.addEventListener("click", function(){ show(i); });
      frag.appendChild(b);
    });

    el.rows.appendChild(frag);
    el.count.textContent = String(entries.length).padStart(2, "0") + " REC";
  }

  /* --- record ----------------------------------------------------------- */

  function show(i){
    if (i === current || !entries[i]) return;
    var e = entries[i], d = e.dataset, live = isOpen(e);
    current = i;

    entries.forEach(function(x){ x.classList.remove("is-current"); });
    e.classList.add("is-current");

    [].forEach.call(el.rows.children, function(r, n){
      r.setAttribute("aria-current", n === i ? "true" : "false");
    });

    el.n.textContent      = d.n;
    el.lat.textContent    = mag(d.lat);
    el.lng.textContent    = mag(d.lng);
    el.placed.textContent = d.placed;
    el.days.textContent   = daysSince(d.placed);
    el.place.textContent  = d.place || "—";
    el.title.textContent  = d.title || "";

    el.hint.src = d.hint; el.hint.alt = "Photo hint for drop " + d.n;
    el.item.src = d.item; el.item.alt = "The item left at drop " + d.n;
    el.hintc.textContent = d.hintcap || "";
    el.itemc.textContent = d.itemcap || "";

    el.brief.innerHTML = "";
    [].forEach.call(e.querySelectorAll("p"), function(p){
      el.brief.appendChild(p.cloneNode(true));
    });

    el.osm.href = "https://www.openstreetmap.org/?mlat=" + d.lat + "&mlon=" + d.lng +
                  "#map=" + (d.zoom || 15) + "/" + d.lat + "/" + d.lng;

    moveMap(+d.lat, +d.lng, +(d.zoom || 15));
  }

  /* --- map -------------------------------------------------------------- */

  var rings = [], ringLabels = [];
  var home = null;              // where the current drop actually is
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
       the +/- bars, and it dims itself when you are already on the drop.
       ------------------------------------------------------------------ */
    var Recenter = L.Control.extend({
      options: { position: "topleft" },
      onAdd: function () {
        var box = L.DomUtil.create("div", "leaflet-bar dp-recenter");
        var a = L.DomUtil.create("a", "", box);
        a.href = "#";
        a.title = "Recenter on the drop";
        a.setAttribute("role", "button");
        a.setAttribute("aria-label", "Recenter on the drop");
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

  /* Dim the control while the view already matches the drop, so it reads as
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

  /* --- keyboard: the manifest is a list, so arrows walk it -------------- */

  document.addEventListener("keydown", function(ev){
    /* target is document itself when nothing is focused in some browsers,
       and document has no .closest — guard before reaching for it */
    var t = ev.target;
    if (t && t.closest && t.closest("input, textarea, select, [contenteditable]")) return;
    if (ev.key === "ArrowDown" || ev.key === "ArrowRight"){
      if (current < entries.length - 1){ show(current + 1); ev.preventDefault(); }
    } else if (ev.key === "ArrowUp" || ev.key === "ArrowLeft"){
      if (current > 0){ show(current - 1); ev.preventDefault(); }
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
  show(0);
  setTimeout(function(){ if (map) map.invalidateSize(); }, 250);
})();
