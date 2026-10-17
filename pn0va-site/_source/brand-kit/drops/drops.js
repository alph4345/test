/* ==========================================================================
   CACHES — sites and the caches hidden at them
   rev 2026.10.17
   --------------------------------------------------------------------------
   Content lives in the HTML: each site is a <section class="dp-site">
   with data-* attributes, holding the caches hidden there as <article
   class="dp-entry"> blocks, newest first. This file reads them at runtime
   and never needs editing to add a site or a cache.

   A site's screen: its number and name across the top, its street map and
   its photos side by side, and under them the one menu: the caches hidden
   there. Choosing one opens it beside the list: what is inside, one thing
   at a time with arrows, and its log. Choosing it again (or Esc, or Back)
   puts it away. Only the cache comes and goes.

   Two registers, kept apart on purpose:
     This page is register A only — instrument. The living layer (fireflies)
     belongs to the home page, where the identity is stated; interior pages are
     working surfaces and stay quiet.
   ========================================================================== */

(function () {
  "use strict";

  /* Carto ships the ground and the lettering as separate layers. Keeping them
     apart is the whole trick: the ground can stay a neutral dark while the
     street names get pushed to white, instead of one filter dragging both
     into the same red. Filters live on the panes, in drops.html. */
  var TILE_BASE   = "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png";
  var TILE_LABELS = "https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png";
  var ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' +
             ' contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

  /* Range rings, in metres, round the cache: the scale of the ground you
     will be walking, so these are information, not decoration. Sized for
     street level, where a cache opens. */
  var RINGS = [50, 100, 250];

  /* .dp-cache, .dp-zone and .dp-point: what a site was called before;
     still read */
  var entries = [].slice.call(document.querySelectorAll(".dp-site, .dp-cache, .dp-zone, .dp-point"));
  if (!entries.length) return;
  /* each site's caches, newest first (dropsOf, opened, openDrop...: a cache
     was a "drop" before; the names inside this file stay) */
  var dropsOf = entries.map(function (pt) {
    return [].filter.call(pt.children, function (c) { return c.classList.contains("dp-entry"); });
  });

  var map = null, marker = null, current = -1, opened = -1;

  function $(id){ return document.getElementById(id); }
  var el = {
    rows:    $("dp-rows"),
    count:   $("dp-count"),
    osm:     document.querySelectorAll(".dp-osm"),
    n:       $("r-n"),
    lat:     $("r-lat"),
    lng:     $("r-lng"),
    place:   $("r-place"),
    about:   $("r-about"),
    detail:  document.querySelector(".dp-detail"),
    log:     $("dp-log"),
    logn:    $("r-logn"),
    drop:    $("dp-drop"),
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

  /* NEW for a cache's first week. FOUND once data-found says so (or
     data-claimed, from before), with its date if it has one; a cache
     without it shows nothing either way. */
  function isNew(e){ return daysSince(e.dataset.placed) < 7; }
  function claimedOf(e){
    var a = e.hasAttribute("data-found") ? "data-found" : e.hasAttribute("data-claimed") ? "data-claimed" : null;
    if (!a) return null;
    var v = (e.getAttribute(a) || "").trim();
    return /^(no|false|0)$/i.test(v) ? null : v;
  }
  function plural(n, one){ return n + " " + one + (n === 1 ? "" : "s"); }
  function make(tag, cls, text){
    var x = document.createElement(tag);
    if (cls) x.className = cls;
    if (text != null) x.textContent = text;
    return x;
  }

  /* On a phone, and on any screen under 560px tall, a cache opens under its
     row in the list (see the CSS), not in its own place beside the list. */
  var sheet = window.matchMedia("(max-width:900px), (max-height:560px)");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  /* page-script.js's window flight, which loads after this */
  function flight(){ return !reduceMotion && window.pn0vaFly; }

  /* --- manifest: the sites ---------------------------------------------- */

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
    el.count.textContent = String(entries.length).padStart(2, "0") + (entries.length === 1 ? " SITE" : " SITES");
  }

  /* --- a site ------------------------------------------------------------- */

  /* Site i, with its cache j open (-1, or none given: just the list). */
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
      el.place.textContent  = d.place || "—";
      /* what the site is and where, under its name (its data-about) */
      if (el.about){ el.about.textContent = d.about || ""; el.about.hidden = !d.about; }

      buildLog(drops);
      spot.set(spotsOf(pt, drops), "at site " + d.n);    // the site's, whatever is open

      /* the coordinates over the map, and the map's own way out with no
         JavaScript or no map file: the place on OpenStreetMap */
      var osm = "https://www.openstreetmap.org/?mlat=" + d.lat + "&mlon=" + d.lng +
                "#map=" + (d.zoom || 17) + "/" + d.lat + "/" + d.lng;
      [].forEach.call(el.osm, function(a){ a.href = osm; });

      moveMap(+d.lat, +d.lng, +(d.zoom || 17));
    }
    if (j >= 0) openDrop(j); else closeDrop();
  }

  /* The caches hidden at the site, newest first: number, title, date, and
     NEW or FOUND, and the row's toggle, a quiet wedge or, on the open one,
     HIDE. Choosing one opens it; choosing it again puts it away. */
  function buildLog(drops){
    if (el.log.contains(el.drop)){ opened = -1; placeDrop(); }    /* its windows home first */
    el.log.textContent = "";
    el.logn.textContent = plural(drops.length, "cache");
    if (!drops.length){ el.log.appendChild(make("p", "dp-log__none", "Nothing hidden here yet")); return; }
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
      b.children[1].textContent = x.title || "Cache " + x.n;
      b.children[2].textContent = x.placed || "";
      if (claimed !== null){ b.children[3].textContent = "Found"; b.children[3].className += " is-claimed"; }
      else if (isNew(e)){ b.children[3].textContent = "New"; b.children[3].className += " is-new"; }
      b.addEventListener("click", function(){ ask(j); });
      el.log.appendChild(b);
    });
  }

  /* A cache opened or put away by hand (its row, Esc). drops-world.js,
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

  /* the list's rows (an open cache sits among them on a phone) */
  function rowsOf(){ return el.log.querySelectorAll(".dp-logrow"); }
  /* Where an open cache goes: beside the list on a wide screen, in the
     page's grid; on a phone, under the row that opened it, the two in one
     box that the row is pinned to the top of while the cache is read, so
     its HIDE is always to hand (see the CSS). */
  var dropHome = el.drop.parentNode, dropBefore = el.drop.nextSibling;
  var group = make("div", "dp-open");
  function placeDrop(){
    var row = sheet.matches && opened >= 0 ? rowsOf()[opened] : null;
    var had = document.activeElement;           /* a moved row loses the focus: it gets it back */
    if (row){
      if (row.parentNode !== group){ unwrap(); el.log.insertBefore(group, row); group.appendChild(row); }
      if (row.nextSibling !== el.drop) group.appendChild(el.drop);
    } else {
      unwrap();
      if (el.drop.parentNode !== dropHome) dropHome.insertBefore(el.drop, dropBefore);
    }
    if (had && had !== document.activeElement && had.isConnected && had.closest && had.closest("#dp-log"))
      had.focus({ preventScroll: true });
  }
  /* the box undone: its row back in the list where it was, the cache home */
  function unwrap(){
    var at = group.parentNode;
    if (!at) return;
    if (el.drop.parentNode === group) dropHome.insertBefore(el.drop, dropBefore);
    while (group.firstChild) at.insertBefore(group.firstChild, group);
    at.removeChild(group);
  }
  if (sheet.addEventListener) sheet.addEventListener("change", placeDrop);
  else if (sheet.addListener) sheet.addListener(placeDrop);
  /* where the fixed nav ends, for an open row to pin under (see the CSS):
     its height, which a transform (its slide in) does not change, measured
     again whenever it changes (its letters arriving, the window resized) */
  var navBar = document.querySelector("nav");
  function underNav(){
    if (navBar) document.documentElement.style.setProperty("--dp-under-nav", navBar.getBoundingClientRect().height + "px");
  }
  underNav();
  if (navBar && window.ResizeObserver) new ResizeObserver(underNav).observe(navBar);
  else window.addEventListener("resize", underNav);
  /* a phone: the row that opened near the top of the screen, its cache under it */
  function showRow(j){
    var r = rowsOf()[j];
    if (!r) return;
    var top = r.getBoundingClientRect().top;
    if (top < 60 || top > innerHeight * 0.45)
      window.scrollTo({ top: scrollY + top - 64, behavior: reduceMotion ? "auto" : "smooth" });
  }
  /* a desktop too short for the grid scrolls: the cache's place, beside the
     list, brought whole into view as a cache opens (still clear of the nav) */
  var place = document.querySelector(".dp-nodrop");
  function showPlace(){
    if (!place) return;
    var r = place.getBoundingClientRect(), over = r.bottom + 12 - innerHeight;
    if (over > 0) window.scrollTo({ top: scrollY + Math.min(over, r.top - 64), behavior: reduceMotion ? "auto" : "smooth" });
  }
  /* The photos of the site: its own, one place however many caches are
     hidden there (data-photos on its <section>, which build.py fills in
     from the images named site<n>_<MMDDYY>; data-spots, from before). A
     page from before has them on its caches (data-spots, or data-photos):
     those, oldest cache first. */
  function spotsOf(pt, drops){
    var own = listOf(pt, "photos") || listOf(pt, "spots");
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

    /* the cache: its title, when it was hidden, NEW or FOUND (and when),
       its log */
    el.title.textContent = x.title || "Cache " + x.n;
    el.dropn.textContent = "#" + x.n;
    el.meta.textContent = "";
    if (x.placed) el.meta.appendChild(fact("Hidden", x.placed));
    if (claimed !== null) el.meta.appendChild(claimed ? fact("Found", claimed) : make("span", "is-claimed", "Found"));
    else if (isNew(e)) el.meta.appendChild(make("span", "is-new", "New"));
    el.brief.textContent = "";
    [].forEach.call(e.querySelectorAll("p"), function(p){
      el.brief.appendChild(p.cloneNode(true));
    });
    el.brief.parentNode.scrollTop = 0;

    /* what is inside: each thing data-inside names (data-itemcap, from
       before), with the photos of it in turn */
    items.set(listOf(e, "items") || (x.item ? [x.item] : []), "in cache " + x.n, thingsIn(e));

    placeDrop();
    if (was < 0){
      el.drop.hidden = false;
      el.detail.classList.add("is-open");
      /* in its place beside the list, flown in; on a phone, unfolded under its row */
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

  /* Back to the list: the cache flies off (folds away on a phone) and is
     gone, its place saying how to choose another. now: at once (another
     site taking the screen). */
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
      placeDrop();                           // home, in its place beside the list
    }
    if (f) f.exit(el.drop, OUT).then(gone);   /* windows out of sight just go */
    else gone();
    /* the keyboard back on the row it opened */
    if (row && (inside || document.activeElement === document.body)) row.focus({ preventScroll: true });
    document.dispatchEvent(new CustomEvent("pn0va:drop", { detail: { index: current, drop: -1 } }));
  }

  /* "images/a.jpg images/b.jpg" in data-photos, data-items (or data-spots,
     from before): a list, or null where there is none */
  function listOf(e, name){
    var v = (e.getAttribute("data-" + name) || "").split(/\s+/).filter(Boolean);
    return v.length ? v : null;
  }
  /* what is inside cache e: "Zine, issue 3; Sticker sheet" in data-inside
     (data-itemcap, from before), a thing at a time */
  function thingsIn(e){
    var v = e.getAttribute("data-inside");
    if (v == null) v = e.getAttribute("data-itemcap") || "";
    return v.split(";").map(function(s){ return s.trim(); }).filter(Boolean);
  }

  /* --- the photos: the site's, and what is inside a cache ----------------
     Each in date order (build.py fills data-photos and data-items in from
     the images named site<n>_<MMDDYY> and item<n>_<MMDDYY>: site3_092326.jpg
     is site 03 on 2026.09.23, item4_092326.jpg what is inside cache 004).
     The arrows, the arrow keys and a swipe go round them. A site's photo
     says the date in its name; inside a cache, each thing says its name
     (its photos in turn, the first photo the first thing named), and the
     count says how many. */
  /* "item4_092326b.jpg" -> "2026.09.23"; "" where the name has no date */
  function dateIn(name){
    var m = /_(\d\d)(\d\d)(\d\d)[a-z0-9-]*\.[a-z0-9]+$/i.exec(name);
    if (!m || +m[1] < 1 || +m[1] > 12 || +m[2] < 1 || +m[2] > 31) return "";
    return "20" + m[3] + "." + m[1] + "." + m[2];
  }
  function Gallery(o){
    /* the placeholder as the page names it: the build roots and stamps
       that path, so it loads wherever the page is served from */
    var none = o.img.getAttribute("src"), shots = [], shown = 0, whose = "";
    var bg = o.frame.querySelector(".dp-gallery__bg");
    /* a photo already showing is left be: set again, it would be fetched
       again, and one still on its way dropped */
    function put(img, src){ if (img && img.getAttribute("src") !== src) img.src = src; }
    var ticket = 0;                       /* the latest draw; one overtaken does nothing */
    function draw(){
      var t = ++ticket;
      o.frame.classList.remove("is-turning");
      if (!shots.length){
        put(o.img, none);
        put(bg, none);
        o.img.alt = o.empty;
        o.cap.textContent = "";
        o.count.textContent = "";
        o.box.classList.add("is-empty");
        return;
      }
      o.box.classList.remove("is-empty");
      var s = shots[shown], src = s.src || none,
          file = s.src ? decodeURIComponent(s.src.split("/").pop().split("?")[0]) : "", date = dateIn(file);
      /* the photo and its words change together: a photo still on its way
         (a phone's full-size one can take a while) leaves the one before
         dimmed, and its words, until it comes, so a name is never under
         another thing's photo */
      function show(){
        if (t !== ticket) return;
        o.frame.classList.remove("is-turning");
        put(o.img, src);
        put(bg, src);
        o.img.alt = (s.name || o.what) + (whose ? ", " + whose : "") + (s.src ? "" : ", no photo yet") +
                    (date ? ", photographed " + date : "") + (shots.length > 1 ? " (" + (shown + 1) + " of " + shots.length + ")" : "");
        o.cap.textContent = s.name || date;
        o.count.textContent = shots.length > 1 ? (shown + 1) + "/" + shots.length : "";
      }
      if (o.img.getAttribute("src") === src) show();
      else {
        var coming = new Image();
        coming.onload = coming.onerror = show;
        coming.src = src;
        if (coming.complete) show(); else o.frame.classList.add("is-turning");
      }
      /* the next one ready before it is asked for */
      var next = shots.length > 1 && shots[(shown + 1) % shots.length].src;
      if (next) (new Image()).src = next;
    }
    function turn(step){
      if (shots.length < 2) return;
      shown = (shown + step + shots.length) % shots.length;
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
      if (Math.abs(dx) > 40 && Math.abs(dx) > 2 * Math.abs(dy) && shots.length > 1) turn(dx < 0 ? 1 : -1);
    });
    o.frame.addEventListener("pointercancel", function(){ at = null; });
    o.frame.addEventListener("dragstart", function(ev){ ev.preventDefault(); });
    return {
      box: o.box,
      /* photos, and what they show: several names, a thing per photo in
         turn (one with none yet keeps the placeholder); one name, every
         photo of that one thing; none, just the photos */
      set: function(photos, n, names){
        names = names || [];
        var k = Math.max(photos.length, names.length > 1 ? names.length : 0, names.length ? 1 : 0);
        shots = [];
        for (var i = 0; i < k; i++)
          shots.push({ src: photos[i] || "", name: names.length > 1 ? names[i] || "" : names[0] || "" });
        shown = 0; whose = n || "";
        o.prev.hidden = o.next.hidden = shots.length < 2;
        draw();
      },
      turn: turn
    };
  }
  var spot = Gallery({ box: document.querySelector(".dp-spot"), img: $("s-spot"), frame: $("s-spotframe"),
                       cap: $("s-spotcap"), count: $("r-spotn"), prev: $("s-spotprev"), next: $("s-spotnext"),
                       what: "The site", empty: "No photo of the site yet" });
  var items = Gallery({ box: document.querySelector(".dp-items"), img: $("s-item"), frame: $("s-itemframe"),
                        cap: $("s-itemcap"), count: $("r-itemn"), prev: $("s-itemprev"), next: $("s-itemnext"),
                        what: "What is inside", empty: "No photo of what is inside yet" });

  /* --- map -------------------------------------------------------------- */

  var rings = [], ringLabels = [];
  var home = null;              // where the current site actually is
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
      fadeAnimation:false, zoomAnimation:false, markerZoomAnimation:false
    }).setView([lat, lng], zoom);
    var credit = L.control.attribution({ position:"bottomright", prefix:false }).addTo(map).getContainer();
    /* On a map too narrow for its credit (half a phone's screen) the credit
       shows as the page opens, then folds to a © after a few seconds or as
       the map is first moved, as OpenStreetMap's guidelines allow; a tap
       on the © opens it again. */
    function foldCredit(){ if (map.getSize().x < 330) credit.classList.add("dp-credit--folded"); }
    setTimeout(foldCredit, 5000);
    map.on("movestart zoomstart", foldCredit);
    credit.addEventListener("click", function(ev){
      if (!credit.classList.contains("dp-credit--folded")) return;
      ev.preventDefault(); ev.stopPropagation();
      credit.classList.remove("dp-credit--folded");
    });
    map.on("resize", function(){ if (map.getSize().x >= 330) credit.classList.remove("dp-credit--folded"); });

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

    L.tileLayer(TILE_BASE,   { pane:"base",   subdomains:"abcd", maxZoom:20, attribution:ATTR }).addTo(map);
    L.tileLayer(TILE_LABELS, { pane:"labels", subdomains:"abcd", maxZoom:20 }).addTo(map);

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
        a.title = "Recenter on the site";
        a.setAttribute("role", "button");
        a.setAttribute("aria-label", "Recenter on the site");
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

  /* --- graticule: edge ticks --------------------------------------------
     The mm-ruler habit from the pin work, applied to a map. Ticks are drawn
     in screen space along the panel edges. (The corner readout of what the
     map showed went: the site's coordinates head the map instead.) */
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
  }

  /* --- keyboard ------------------------------------------------------------
     The arrows walk the list they are in: up and down the caches (moving
     the cursor; with a cache open, opening the next as they go), round the
     photos (left and right, of the site or of what is inside), from site to
     site in the list of sites. Esc puts the open cache away (drops-world.js,
     where it runs, sees it first). Nowhere else: on the rest of the screen
     they are the page's (or the street map's). */

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
     the site, stays on it. */
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

  /* caches#03 opens on site 03, caches#003 on the site cache 003 is hidden
     at, with that cache open; anything else, on the newest site, its list */
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

  /* For drops-world.js, which moves between the world view and a site. */
  window.pn0vaDrops = {
    entries: entries,
    drops: function (i) { return dropsOf[i] || []; },
    find: find,
    current: function () { return current; },
    opened: function () { return opened; },
    map: function () { return map; },
    /* Site i with cache j open (-1: its list alone), on the screen as it is. */
    show: function (i, j) { show(i, j); },
    /* Show site i (cache j open) in a panel that has just become visible.
       Size the map first: while hidden, Leaflet measured it as nothing. */
    open: function (i, j) {
      if (map) map.invalidateSize({ pan: false });
      closeDrop(true);
      current = -1;
      show(i, j);
    },
    /* Set by drops-world.js: a cache opened (j) or put away (-1) by hand
       at site i goes through it, for the address and Back. */
    navigate: null
  };
})();
