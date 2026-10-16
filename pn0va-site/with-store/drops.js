/* ==========================================================================
   DROPS — caches and the drops left at them
   rev 2026.10.11
   --------------------------------------------------------------------------
   Content lives in the HTML: each cache is a <section class="dp-cache">
   with data-* attributes, holding the drops left there as <article
   class="dp-entry"> blocks, newest first. This file reads them at runtime
   and never needs editing to add a cache or a drop.

   A cache's screen: the frequency bar (its name and number, coordinates,
   latest drop and how many), the street map round it, and on the map the
   one menu: the drops left there. Choosing one opens its windows round the
   list: photos of the spot it was left at and of what was left, each to go
   through left and right, and between them its transmission, what was left
   and why. Closing them (CLOSE in the transmission's head, Esc, Back; a
   phone's way back along the top) leaves the list on its own again.

   Two registers, kept apart on purpose:
     This page is register A only — instrument. The living layer (fireflies)
     belongs to the home page, where the identity is stated; interior pages are
     working surfaces and stay quiet.
   ========================================================================== */

(function () {
  "use strict";

  /* Streets: pn0vaBasemap() in drops-map.js, from maps/drops.pmtiles. */

  /* Range rings, in metres, round the cache: the scale of the ground you
     will be walking, so these are information, not decoration. Sized for
     street level, where a cache opens. */
  var RINGS = [50, 100, 250];

  /* .dp-zone and .dp-point: what a cache was called before; still read */
  var entries = [].slice.call(document.querySelectorAll(".dp-cache, .dp-zone, .dp-point"));
  if (!entries.length) return;
  /* each cache's drops, newest first */
  var dropsOf = entries.map(function (pt) {
    return [].filter.call(pt.children, function (c) { return c.classList.contains("dp-entry"); });
  });

  var map = null, marker = null, current = -1, opened = -1;

  function $(id){ return document.getElementById(id); }
  var el = {
    rows:    $("dp-rows"),
    count:   $("dp-count"),
    osm:     $("dp-osm"),
    n:       $("r-n"),
    lat:     $("r-lat"),
    lng:     $("r-lng"),
    placed:  $("r-placed"),
    drops:   $("r-count"),
    place:   $("r-place"),
    about:   $("r-about"),
    detail:  document.querySelector(".dp-detail"),
    log:     $("dp-log"),
    logn:    $("r-logn"),
    drop:    $("dp-drop"),
    close:   $("dp-close"),
    title:   $("r-title"),
    meta:    $("r-meta"),
    brief:   $("dp-brief"),
    dropn:   $("r-dropn")
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
  function make(tag, cls, text){
    var x = document.createElement(tag);
    if (cls) x.className = cls;
    if (text != null) x.textContent = text;
    return x;
  }

  /* On a phone, and on any screen under 560px tall, a drop opens under its
     row in the log (see the CSS), not in its own place beside the log. */
  var sheet = window.matchMedia("(max-width:900px), (max-height:560px)");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  /* page-script.js's window flight, which loads after this */
  function flight(){ return !reduceMotion && window.pn0vaFly; }

  /* --- manifest: the caches --------------------------------------------- */

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
      b.addEventListener("click", function(){ show(i, -1); });
      frag.appendChild(b);
    });
    el.rows.appendChild(frag);
    el.count.textContent = String(entries.length).padStart(2, "0") + (entries.length === 1 ? " CACHE" : " CACHES");
  }

  /* --- a cache ------------------------------------------------------------ */

  /* Cache i, with its drop j open (-1, or none given: just the list). */
  function show(i, j){
    if (!entries[i]) return;
    j = j == null || !dropsOf[i][j] ? -1 : j;
    if (i !== current){
      var pt = entries[i], d = pt.dataset, drops = dropsOf[i];
      closeDrop(true);
      current = i;

      entries.forEach(function(x){ x.classList.remove("is-current"); });
      pt.classList.add("is-current");
      [].forEach.call(el.rows.children, function(r, n){
        r.setAttribute("aria-current", n === i ? "true" : "false");
      });

      el.n.textContent      = d.n;
      el.lat.textContent    = mag(d.lat);
      el.lng.textContent    = mag(d.lng);
      /* the unit says which side of the equator and of Greenwich */
      el.lat.nextElementSibling.textContent = "°" + (+d.lat < 0 ? "S" : "N");
      el.lng.nextElementSibling.textContent = "°" + (+d.lng < 0 ? "W" : "E");
      el.placed.textContent = drops[0] ? drops[0].dataset.placed : "—";
      el.drops.textContent  = drops.length;
      el.place.textContent  = d.place || "—";
      /* what the cache is and where, under its name (its data-about) */
      if (el.about){ el.about.textContent = d.about || ""; el.about.hidden = !d.about; }

      buildLog(drops);
      spot.set(spotsOf(pt, drops), "of cache " + d.n);   // the cache's, whatever is open

      el.osm.href = "https://www.openstreetmap.org/?mlat=" + d.lat + "&mlon=" + d.lng +
                    "#map=" + (d.zoom || 17) + "/" + d.lat + "/" + d.lng;

      moveMap(+d.lat, +d.lng, +(d.zoom || 17));
    }
    if (j >= 0) openDrop(j); else closeDrop();
  }

  /* The drops left at the cache, newest first: number, title, date, and
     NEW or CLAIMED, and the row's toggle, OPEN or HIDE. Choosing one opens
     it; choosing it again hides it. */
  function buildLog(drops){
    if (el.log.contains(el.drop)){ opened = -1; placeDrop(); }    /* its windows home first */
    el.log.textContent = "";
    el.logn.textContent = plural(drops.length, "drop");
    if (!drops.length){ el.log.appendChild(make("p", "dp-log__none", "Nothing left here yet")); return; }
    drops.forEach(function (e, j) {
      var x = e.dataset, claimed = claimedOf(e);
      var b = document.createElement("button");
      b.type = "button";
      b.className = "dp-logrow";
      b.setAttribute("aria-current", "false");
      b.setAttribute("aria-controls", "dp-drop");
      b.setAttribute("aria-expanded", "false");
      b.innerHTML =
        '<span class="dp-logrow__n"></span><span class="dp-logrow__t"></span>' +
        '<span class="dp-logrow__d"></span><span class="dp-logrow__s"></span>' +
        '<span class="dp-logrow__x" aria-hidden="true"></span>';
      b.children[0].textContent = x.n;
      b.children[1].textContent = x.title || "Drop " + x.n;
      b.children[2].textContent = x.placed || "";
      if (claimed !== null){ b.children[3].textContent = "Claimed"; b.children[3].className += " is-claimed"; }
      else if (isNew(e)){ b.children[3].textContent = "New"; b.children[3].className += " is-new"; }
      b.addEventListener("click", function(){ ask(j); });
      el.log.appendChild(b);
    });
  }

  /* A drop opened or closed by hand (a row, CLOSE, Esc). drops-world.js,
     where it runs, keeps the address and Back in step and opens it from
     there; without it, straight here. */
  function ask(j){
    if (j === opened && j >= 0) j = -1;        /* the open one, chosen again: hidden */
    if (j === opened) return;
    var api = window.pn0vaDrops;
    if (api && typeof api.navigate === "function"){ api.navigate(current, j); return; }
    show(current, j);
    var e = j >= 0 ? dropsOf[current][j] : entries[current];
    try { history.replaceState(history.state, "", "#" + e.dataset.n); } catch (err) {}
  }

  /* --- a drop at the cache ------------------------------------------------ */

  var turnOver = 0;                     // one open or close at a time
  var IN = { speed: 0.45, distance: 0.6 }, OUT = { speed: 0.5, distance: 0.6 };

  /* the list's rows (an open drop's windows sit among them on a phone) */
  function rowsOf(){ return el.log.querySelectorAll(".dp-logrow"); }
  /* Where an open drop's windows go: round the list on a wide screen, in
     the page's grid; on a phone, under the row that opened them. */
  var dropHome = el.drop.parentNode, dropBefore = el.drop.nextSibling;
  function placeDrop(){
    var row = sheet.matches && opened >= 0 ? rowsOf()[opened] : null;
    if (row){ if (row.nextSibling !== el.drop) el.log.insertBefore(el.drop, row.nextSibling); }
    else if (el.drop.parentNode !== dropHome) dropHome.insertBefore(el.drop, dropBefore);
  }
  if (sheet.addEventListener) sheet.addEventListener("change", placeDrop);
  else if (sheet.addListener) sheet.addListener(placeDrop);
  /* a phone: the row that opened near the top of the screen, its drop under it */
  function showRow(j){
    var r = rowsOf()[j];
    if (!r) return;
    var top = r.getBoundingClientRect().top;
    if (top < 60 || top > innerHeight * 0.45)
      window.scrollTo({ top: scrollY + top - 64, behavior: reduceMotion ? "auto" : "smooth" });
  }
  /* a desktop too short for the grid scrolls: the drop's place, beside the
     log, brought whole into view as a drop opens (still clear of the nav) */
  var place = document.querySelector(".dp-nodrop");
  function showPlace(){
    if (!place) return;
    var r = place.getBoundingClientRect(), over = r.bottom + 12 - innerHeight;
    if (over > 0) window.scrollTo({ top: scrollY + Math.min(over, r.top - 64), behavior: reduceMotion ? "auto" : "smooth" });
  }
  /* The photos of the spot: the cache's own, one place however many drops
     are left there (data-spots on its <section>, which build.py fills in
     from the images named cache<n>_<MMDDYY>). A page from before has them
     on its drops (data-spots, or data-photos): those, oldest drop first. */
  function spotsOf(pt, drops){
    var own = listOf(pt, "spots");
    if (own) return own;
    var all = [];
    drops.slice().reverse().forEach(function(e){
      (listOf(e, "spots") || listOf(e, "photos") || []).forEach(function(s){ if (all.indexOf(s) < 0) all.push(s); });
    });
    return all;
  }

  function openDrop(j){
    var drops = dropsOf[current], e = drops && drops[j];
    if (!e || j === opened) return;
    var x = e.dataset, claimed = claimedOf(e), was = opened;
    opened = j;
    turnOver++;

    drops.forEach(function(y){ y.classList.remove("is-current"); });
    e.classList.add("is-current");
    [].forEach.call(rowsOf(), function(r, n){
      r.setAttribute("aria-current", n === j ? "true" : "false");
      r.setAttribute("aria-expanded", n === j ? "true" : "false");
    });

    /* the transmission: its title, when it was left and what, its words */
    el.title.textContent = x.title || "Drop " + x.n;
    el.dropn.textContent = "#" + x.n;
    el.meta.textContent = "";
    /* when it was left, NEW or CLAIMED (and when), and what */
    if (x.placed) el.meta.appendChild(fact("Left", x.placed));
    if (claimed !== null) el.meta.appendChild(claimed ? fact("Claimed", claimed) : make("span", "is-claimed", "Claimed"));
    else if (isNew(e)) el.meta.appendChild(make("span", "is-new", "New"));
    if (x.itemcap) el.meta.appendChild(fact("Item", x.itemcap));
    el.brief.textContent = "";
    [].forEach.call(e.querySelectorAll("p"), function(p){
      el.brief.appendChild(p.cloneNode(true));
    });
    el.brief.parentNode.scrollTop = 0;

    items.set(listOf(e, "items") || (x.item ? [x.item] : []), "at drop " + x.n);

    placeDrop();
    if (was < 0){
      el.drop.hidden = false;
      el.detail.classList.add("is-open");
      /* in its place beside the log, flown in; on a phone, unfolded under its row */
      var f = !sheet.matches && flight();
      if (f) f.enter(el.drop, IN);
      else mark(el.drop);
    }
    if (sheet.matches) showRow(j);
    else showPlace();
    document.dispatchEvent(new CustomEvent("pn0va:drop", { detail: { index: current, drop: j } }));
  }
  function fact(label, value){
    var s = make("span");
    s.appendChild(make("b", null, label));
    s.appendChild(document.createTextNode(" " + value));
    return s;
  }
  /* windows page-script.js would mark as landed: shown in place */
  function mark(scope){
    [].forEach.call(scope.querySelectorAll("[data-fly]"), function(w){ w.classList.add("landed"); });
  }

  /* Back to the log: the drop flies off (folds away on a phone) and is
     gone, its place saying how to choose another. now: at once (another
     cache taking the screen). */
  function closeDrop(now){
    if (opened < 0) return;
    var row = rowsOf()[opened], inside = el.drop.contains(document.activeElement);
    var me = ++turnOver;
    opened = -1;
    dropsOf[current].forEach(function(y){ y.classList.remove("is-current"); });
    [].forEach.call(rowsOf(), function(r){
      r.setAttribute("aria-current", "false");
      r.setAttribute("aria-expanded", "false");
    });
    el.detail.classList.remove("is-open");
    var f = !now && !sheet.matches && flight();
    function gone(){
      if (me !== turnOver) return;           // opened again meanwhile
      el.drop.hidden = true;
      if (window.pn0vaFly) window.pn0vaFly.reset(el.drop);
      placeDrop();                           // home, in its place beside the log
    }
    if (f) f.exit(el.drop, OUT).then(gone);   /* windows out of sight just go */
    else gone();
    /* the keyboard back on the row it opened */
    if (row && (inside || document.activeElement === document.body)) row.focus({ preventScroll: true });
    document.dispatchEvent(new CustomEvent("pn0va:drop", { detail: { index: current, drop: -1 } }));
  }
  el.close.addEventListener("click", function(){ ask(-1); });

  /* "images/a.jpg images/b.jpg" in data-spots, data-items (or the old
     data-photos, of the spot): a list, or null where there is none */
  function listOf(e, name){
    var v = (e.getAttribute("data-" + name) || "").split(/\s+/).filter(Boolean);
    return v.length ? v : null;
  }

  /* --- the photos: the spot's, and what a drop left ----------------------
     Each in date order (build.py fills data-spots and data-items in from
     the images named cache<n>_<MMDDYY> and item<n>_<MMDDYY>: cache3_092326.jpg
     is cache 03's spot on 2026.09.23, item4_092326.jpg what drop 004 left).
     The arrows, the arrow keys and a swipe go round them; each says its
     file's name and the date in it. */
  /* "item4_092326b.jpg" -> "2026.09.23"; "" where the name has no date */
  function dateIn(name){
    var m = /_(\d\d)(\d\d)(\d\d)[a-z0-9-]*\.[a-z0-9]+$/i.exec(name);
    if (!m || +m[1] < 1 || +m[1] > 12 || +m[2] < 1 || +m[2] > 31) return "";
    return "20" + m[3] + "." + m[1] + "." + m[2];
  }
  function Gallery(o){
    /* the placeholder as the page names it: the build roots and stamps
       that path, so it loads wherever the page is served from */
    var none = o.img.getAttribute("src"), photos = [], shown = 0, whose = "";
    var bg = o.frame.querySelector(".dp-gallery__bg");
    /* a photo already showing is left be: set again, it would be fetched
       again, and one still on its way dropped */
    function put(img, src){ if (img && img.getAttribute("src") !== src) img.src = src; }
    function draw(){
      if (!photos.length){
        put(o.img, none);
        put(bg, none);
        o.img.alt = o.cap.textContent = o.empty;
        o.count.textContent = "—";
        return;
      }
      var src = photos[shown], name = decodeURIComponent(src.split("/").pop().split("?")[0]), date = dateIn(name);
      put(o.img, src);
      put(bg, src);
      o.img.alt = o.what + (whose ? " " + whose : "") +
                  (date ? ", photographed " + date : "") + (photos.length > 1 ? " (photo " + (shown + 1) + " of " + photos.length + ")" : "");
      o.cap.textContent = name + (date ? " · " + date : "");
      o.count.textContent = photos.length > 1 ? (shown + 1) + "/" + photos.length : (date || "1/1");
      /* the next one ready before it is asked for */
      if (photos.length > 1) (new Image()).src = photos[(shown + 1) % photos.length];
    }
    function turn(step){
      if (photos.length < 2) return;
      shown = (shown + step + photos.length) % photos.length;
      draw();
    }
    o.prev.addEventListener("click", function(){ turn(-1); });
    o.next.addEventListener("click", function(){ turn(1); });
    /* a swipe across the photo turns it (a photo opens nowhere else) */
    var at = null;
    o.frame.addEventListener("pointerdown", function(ev){ at = { x: ev.clientX, y: ev.clientY }; });
    o.frame.addEventListener("pointerup", function(ev){
      if (!at) return;
      var dx = ev.clientX - at.x, dy = ev.clientY - at.y;
      at = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > 2 * Math.abs(dy) && photos.length > 1) turn(dx < 0 ? 1 : -1);
    });
    o.frame.addEventListener("pointercancel", function(){ at = null; });
    o.frame.addEventListener("dragstart", function(ev){ ev.preventDefault(); });
    return {
      box: o.box,
      set: function(list, n){
        photos = list; shown = 0; whose = n || "";
        o.prev.hidden = o.next.hidden = photos.length < 2;
        draw();
      },
      turn: turn
    };
  }
  var spot = Gallery({ box: document.querySelector(".dp-spot"), img: $("s-spot"), frame: $("s-spotframe"),
                       cap: $("s-spotcap"), count: $("r-spotn"), prev: $("s-spotprev"), next: $("s-spotnext"),
                       what: "The spot", empty: "No photo of the spot yet" });
  var items = Gallery({ box: document.querySelector(".dp-items"), img: $("s-item"), frame: $("s-itemframe"),
                        cap: $("s-itemcap"), count: $("r-itemn"), prev: $("s-itemprev"), next: $("s-itemnext"),
                        what: "What was left", empty: "No photo yet" });

  /* --- map -------------------------------------------------------------- */

  var rings = [], ringLabels = [];
  var home = null;              // where the current cache actually is
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
      minZoom:8, maxZoom:19,   // the map file holds zooms 8-15; above that it is scaled up
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
        color:"#FFFFFF", weight:1.2, opacity:.55 - i * .1,
        fill:true, fillColor:"#FFFFFF", fillOpacity:i === 0 ? .06 : .025,
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
       the +/- bars, and it dims itself when you are already on the cache.
       Its clicks stop here: a double-click that reached the map zoomed it in
       about the button, and the second recentre then landed somewhere odd.
       ------------------------------------------------------------------ */
    var Recenter = L.Control.extend({
      options: { position: "topleft" },
      onAdd: function () {
        var box = L.DomUtil.create("div", "leaflet-bar dp-recenter");
        var a = L.DomUtil.create("a", "", box);
        a.href = "#";
        a.title = "Recenter on the cache";
        a.setAttribute("role", "button");
        a.setAttribute("aria-label", "Recenter on the cache");
        L.DomEvent.disableClickPropagation(box);
        L.DomEvent.on(a, "click dblclick", L.DomEvent.stop);
        L.DomEvent.on(a, "click", recenter);
        recenterBtn = box;
        return box;
      }
    });
    map.addControl(new Recenter());

    map.on("move zoom viewreset", drawGraticule);
    map.on("moveend zoomend", markHome);
    map.on("zoomend", fitRingLabels);
    placeRingLabels(lat, lng);
    drawGraticule();
    markHome();
  }

  /* the map on the cache, its mark in the middle */
  function homeView(){ map.setView([home.lat, home.lng], home.zoom, { animate:false }); }

  function moveMap(lat, lng, zoom){
    if (typeof L === "undefined") return;
    home = { lat: lat, lng: lng, zoom: zoom };
    if (!map){ buildMap(lat, lng, zoom); return; }

    marker.setLatLng([lat, lng]);
    rings.forEach(function(c){ c.setLatLng([lat, lng]); });
    /* Instrument register: the map cuts to the new coordinates, it does not
       glide there. Panning would read as organic motion. */
    map.invalidateSize({ pan:false });
    homeView();
    markHome();
    placeRingLabels(lat, lng);
    drawGraticule();
  }

  function recenter(){
    if (!map || !home) return;
    homeView();
    markHome();
  }

  /* Dim the control while the view already matches the cache, so it reads
     as state rather than as a button that may or may not do anything. */
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

  /* Ring labels ride due east of centre, from each ring's edge. */
  function placeRingLabels(lat, lng){
    if (!map) return;
    var mPerDeg = 111320 * Math.cos(lat * Math.PI / 180);
    RINGS.forEach(function(r, i){
      ringLabels[i].setLatLng([lat, lng + (r / mPerDeg)]);
    });
    fitRingLabels();
  }
  /* ...and show only where there is room for them: past the crosshair's
     arm (41px out) and short of the next ring's label. Zoomed out, the
     inner rings close up on the marker and their labels give way. */
  function fitRingLabels(){
    if (!map || !home) return;
    var mpp = 40075016.686 * Math.cos(home.lat * Math.PI / 180) / Math.pow(2, map.getZoom() + 8);
    RINGS.forEach(function(r, i){
      var out = r / mpp, room = i + 1 < RINGS.length ? (RINGS[i + 1] - r) / mpp : Infinity;
      var tag = ringLabels[i].getElement();
      if (tag) tag.style.visibility = out >= 44 && room >= 36 ? "" : "hidden";
    });
  }

  /* --- graticule: edge ticks + live bounds ------------------------------
     The mm-ruler habit from the pin work, applied to a map. Ticks are drawn
     in screen space along the panel edges; the corner readout reports the
     visible extent so the panel always says what it is showing. */
  function drawGraticule(){
    var host = $("dp-grat");
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
    $("dp-bounds").innerHTML =
      'N <b>' + b.getNorth().toFixed(3) + '</b><br>' +
      'S <b>' + b.getSouth().toFixed(3) + '</b><br>' +
      'W <b>' + Math.abs(b.getWest()).toFixed(3) + '</b>';
  }

  /* --- keyboard ------------------------------------------------------------
     The arrows walk the list they are in: up and down the drops (moving the
     cursor; with a drop open, opening the next as they go), round a drop's
     photos (left and right, on its spot or its items), from cache to cache
     in the list of caches. Esc closes the open drop (drops-world.js, where
     it runs, sees it first). Nowhere else: on the rest of the screen they
     are the page's (or the street map's). */

  document.addEventListener("keydown", function(ev){
    /* target is document itself when nothing is focused in some browsers,
       and document has no .closest — guard before reaching for it */
    var t = ev.target;
    if (!t || !t.closest || t.closest("input, textarea, select, [contenteditable]")) return;
    if (ev.key === "Escape" && opened >= 0 && !ev.defaultPrevented){
      var help = $("dp-help");
      if (help && help.open) return;
      ask(-1); ev.preventDefault(); return;
    }
    var step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[ev.key];
    if (!step || ev.altKey || ev.ctrlKey || ev.metaKey) return;   /* Alt+Left is Back */
    if (t.closest(".dp-gallery")){
      if (ev.key === "ArrowLeft" || ev.key === "ArrowRight"){
        (t.closest(".dp-items") ? items : spot).turn(step); ev.preventDefault();
      }
    } else if (t.closest(".dp-logrow")){
      if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") return;
      var rows = rowsOf(), at = [].indexOf.call(rows, t.closest(".dp-logrow"));
      var j = (at < 0 ? (opened >= 0 ? opened : -1) : at) + step;
      if (rows[j]){ rows[j].focus(); if (opened >= 0) ask(j); }
      ev.preventDefault();
    } else if (t.closest("#dp-rows")){
      var i = current + step;
      if (entries[i]){ show(i, -1); el.rows.children[i].focus(); }
      ev.preventDefault();
    }
  });

  /* The map's box changes size: the view stays where it was or, left on
     the cache, stays on it. */
  function resized(){
    if (!map) return;
    var was = !!home && !!recenterBtn && recenterBtn.classList.contains("is-home");
    map.invalidateSize();
    if (was){ homeView(); markHome(); }
  }
  window.addEventListener("resize", resized);
  /* ...and whenever the map's box changes size with the window as it was:
     as the page starts, the world view gives the map the list's column,
     sometimes after the map is drawn. Hidden (nothing by nothing), the map
     is left alone. */
  if (window.ResizeObserver) new ResizeObserver(function(es){
    var r = es[es.length - 1].contentRect;
    if (map && r.width && r.height) resized();
  }).observe($("dp-map"));

  /* --- help panel ------------------------------------------------------
     <details> already gives us open/close, keyboard operation and Esc for
     free, and it all works with JS off. The only thing it can't do on its
     own is close when you click elsewhere, so that's all we add. */
  (function(){
    var help = $("dp-help");
    if (!help) return;
    document.addEventListener("click", function(ev){
      if (help.open && !help.contains(ev.target)) help.open = false;
    });
    document.addEventListener("keydown", function(ev){
      if (ev.key === "Escape" && help.open) help.open = false;
    });
  })();

  buildManifest();

  /* drops#03 opens on cache 03, drops#003 on the cache drop 003 was left
     at, with that drop open; anything else, on the newest cache, its list */
  function find(id){
    for (var i = 0; i < entries.length; i++){
      if (entries[i].dataset.n === id) return [i, -1];
      for (var j = 0; j < dropsOf[i].length; j++)
        if (dropsOf[i][j].dataset.n === id) return [i, j];
    }
    return null;
  }
  var at = find(decodeURIComponent(location.hash.slice(1))) || [0, -1];
  show(at[0], at[1]);
  setTimeout(resized, 250);

  /* For drops-world.js, which moves between the world view and a cache. */
  window.pn0vaDrops = {
    entries: entries,
    drops: function (i) { return dropsOf[i] || []; },
    find: find,
    current: function () { return current; },
    opened: function () { return opened; },
    map: function () { return map; },
    /* Cache i with drop j open (-1: its list alone), on the screen as it is. */
    show: function (i, j) { show(i, j); },
    /* Show cache i (drop j open) in a panel that has just become visible.
       Size the map first: while hidden, Leaflet measured it as nothing. */
    open: function (i, j) {
      if (map) map.invalidateSize({ pan: false });
      closeDrop(true);
      current = -1;
      show(i, j);
    },
    /* Set by drops-world.js: a drop opened (j) or closed (-1) by hand at
       cache i goes through it, for the address and Back. */
    navigate: null
  };
})();
