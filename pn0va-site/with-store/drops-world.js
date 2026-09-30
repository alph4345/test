/* ==========================================================================
   DROPS — the world view
   --------------------------------------------------------------------------
   One page, two screens. The WORLD: a globe with a point for every drop and
   the list of drops with their dates. A DROP: the record drops.js already
   draws (frequency bar, street map, hint, brief, item).

     drops         the world
     drops#003     drop 003 (a link to one drop opens straight on it)

   Point at a drop in the list and the globe turns to it. Choose it and the
   globe dives in, the list flies off, and the drop's windows fly in.
   < WORLD, Esc or the browser's Back returns, pulling back out to the globe.

   It reads the same <article class="dp-entry"> records as drops.js, so a
   new drop is on the globe with nothing more to do. A drop is marked NEW
   for its first week.

   The globe is Natural Earth's coastline (public domain, 1:50m simplified)
   drawn with d3-geo in the brand palette: an ember sea, slate land, ash
   coasts, red instruments (graticule, rim, pointer), linen points, and bone
   for the drop you are on. Colours come from tokens.css; the translucent
   glows are the same red and linen at strengths the tokens don't list.
   ========================================================================== */

(function () {
  "use strict";

  var NEW_DAYS = 7;                     // a drop is NEW for its first week

  var me = document.currentScript;
  var LAND = me && me.dataset.land ? new URL(me.dataset.land, me.src).href : null;
  var drops = window.pn0vaDrops;        // from drops.js
  var root = document.documentElement;
  var world = document.getElementById("dw");
  var shell = document.querySelector(".dp-shell");
  if (!drops || !world || !shell) return;

  var fly = function () { return window.pn0vaFly; };   // page-script.js loads after this
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var TITLE = document.title;

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
  var list = drops.entries.map(function (e, i) {
    var d = e.dataset;
    return { i: i, n: d.n, placed: d.placed || "", place: d.place || d.title || "",
             lat: parseFloat(d.lat), lng: parseFloat(d.lng),
             isNew: daysSince(d.placed) < NEW_DAYS };
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
  function el(tag, cls, text) {
    var x = document.createElement(tag);
    if (cls) x.className = cls;
    if (text != null) x.textContent = text;
    return x;
  }
  function newBadge() { return el("span", "dp-new", "New"); }

  /* --- the list ----------------------------------------------------------- */
  var rows = document.getElementById("dw-rows");
  document.getElementById("dw-count").textContent = String(list.length).padStart(2, "0") + " REC";
  list.forEach(function (d) {
    var a = el("a", "dw-row");
    a.href = "#" + d.n;
    a.appendChild(el("span", "dw-n", d.n));
    a.appendChild(el("span", "dw-place", d.place));
    a.appendChild(d.isNew ? newBadge() : el("span"));
    a.appendChild(el("span", "dw-date", d.placed));
    a.addEventListener("mouseenter", function () { select(d.i); });
    a.addEventListener("focus", function () { select(d.i); });
    rows.appendChild(a);
  });

  // the drop screen's list gets the NEW badges too, and the way back
  var rail = document.getElementById("dp-rows");
  if (rail) list.forEach(function (d) {
    if (d.isNew && rail.children[d.i]) rail.children[d.i].appendChild(newBadge());
  });
  var manifest = rail && rail.closest(".dp-manifest");
  var back = el("button", "dp-world-back");
  back.type = "button";
  back.innerHTML = '<span aria-hidden="true">&lt;</span> World';
  back.setAttribute("aria-label", "Back to the world view");
  back.addEventListener("click", toWorldByHand);
  if (manifest) manifest.insertBefore(back, rail);

  /* --- the globe ---------------------------------------------------------- */
  var box = document.getElementById("dw-globe");
  var canvas = document.getElementById("dw-canvas");
  var callout = document.getElementById("dw-callout");
  var ctx = canvas.getContext("2d");
  var hasGlobe = !!(window.d3 && d3.geoOrthographic && window.topojson);
  var proj, path, grat, land = null, landLo = null;
  if (hasGlobe) {
    proj = d3.geoOrthographic().clipAngle(90).precision(0.4);
    path = d3.geoPath(proj, ctx);
    grat = d3.geoGraticule().step([15, 15])();
    if (LAND) fetch(LAND).then(function (r) { return r.json(); }).then(function (t) {
      land = topojson.feature(t, t.objects.land);
      landLo = inside(topojson.feature(coarsen(t, 3), t.objects.land));
      draw();
    }).catch(function () { /* the globe works without coastlines */ });
  } else {
    canvas.hidden = true;
  }

  // While the globe moves it draws about half the coastline's points: the
  // eye can't follow the detail, and a phone keeps its frame rate.
  function coarsen(t, step) {
    var q = !!t.transform;
    return { type: t.type, transform: t.transform, objects: t.objects, arcs: t.arcs.map(function (arc) {
      var x = 0, y = 0, abs = arc.map(function (p) {
        if (!q) return p;
        x += p[0]; y += p[1]; return [x, y];
      });
      // small islands keep every point: thinned, they turn inside out
      var keep = abs.length <= 4 * step ? abs :
        abs.filter(function (p, i) { return i % step === 0 || i === abs.length - 1; });
      if (!q) return keep;
      var px = 0, py = 0;
      return keep.map(function (p) { var d = [p[0] - px, p[1] - py]; px = p[0]; py = p[1]; return d; });
    }) };
  }

  // A ring thinned the wrong way round encloses the rest of the planet, and
  // would paint the whole globe as land. No land mass covers a hemisphere, so
  // anything bigger than one is dropped.
  function inside(f) {
    function fix(g) {
      if (!g) return g;
      var small = function (c) { return d3.geoArea({ type: "Polygon", coordinates: c }) < 2 * Math.PI; };
      if (g.type === "Polygon") return small(g.coordinates) ? g : null;
      if (g.type === "MultiPolygon") g.coordinates = g.coordinates.filter(small);
      return g;
    }
    (f.features || [f]).forEach(function (x) { x.geometry = fix(x.geometry); });
    return f;
  }

  var W = 0, H = 0, R = 0, DPR = 1, CX = 0, CY = 0, halo = null, inMotion = false;
  var sel = Math.max(0, drops.current());
  var view = aim(sel);                  // { lng, lat, zoom }: what the globe faces

  // Resting view: the drop sits up and left of centre, the callout beside it.
  function aim(i) {
    var d = list[i] || {};
    if (!hasPos(d)) return { lng: 0, lat: 20, zoom: 1 };
    return { lng: d.lng + 10, lat: Math.max(-70, Math.min(70, d.lat - 6)), zoom: 1 };
  }
  // Diving: the drop dead centre, the globe far bigger than the screen.
  function dive(i) {
    var d = list[i] || {};
    return hasPos(d) ? { lng: d.lng, lat: d.lat, zoom: 6 } : aim(i);
  }

  function size() {
    var r = box.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    R = Math.min(W, H) * 0.42;
    CX = W / 2; CY = H / 2;
    halo = drawHalo();
    return true;
  }

  // The rim with the window glow, and a bezel of ash ticks as on the street
  // map. They don't turn with the globe, and the glow is the costliest thing
  // on it, so they are drawn once per size and stamped on every frame.
  function drawHalo() {
    var c = document.createElement("canvas");
    c.width = canvas.width; c.height = canvas.height;
    var h = c.getContext("2d");
    h.setTransform(DPR, 0, 0, DPR, 0, 0);
    h.beginPath(); h.arc(CX, CY, R, 0, 2 * Math.PI);
    h.shadowColor = "rgba(255,22,9,.6)"; h.shadowBlur = 26;
    h.lineWidth = 1.5; h.strokeStyle = RED; h.stroke();
    h.shadowBlur = 0; h.strokeStyle = ASH; h.lineWidth = 1; h.globalAlpha = 0.55;
    h.beginPath();
    for (var a = 0; a < 360; a += 5) {
      var t = a * Math.PI / 180, long = a % 30 === 0, r0 = R + 7, r1 = R + (long ? 15 : 11);
      h.moveTo(CX + r0 * Math.cos(t), CY + r0 * Math.sin(t));
      h.lineTo(CX + r1 * Math.cos(t), CY + r1 * Math.sin(t));
    }
    h.stroke();
    return c;
  }

  function draw() {
    if (!hasGlobe || !W) return;
    var r = R * view.zoom, rest = Math.max(0, Math.min(1, 1.6 - view.zoom * 0.6));  // 1 at rest, 0 diving
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    proj.scale(r).translate([CX, CY]).rotate([-view.lng, -view.lat]);

    // sea: ember, lit from the upper left by the one chroma
    ctx.beginPath(); ctx.arc(CX, CY, r, 0, 2 * Math.PI);
    ctx.fillStyle = EMBER; ctx.fill();
    var lit = ctx.createRadialGradient(CX - r * .38, CY - r * .42, r * .05, CX, CY, r * 1.02);
    lit.addColorStop(0, "rgba(255,22,9,.16)"); lit.addColorStop(.6, "rgba(255,22,9,.05)"); lit.addColorStop(1, "rgba(255,22,9,0)");
    ctx.fillStyle = lit; ctx.fill();

    // land: slate, coasts in ash
    var shape = inMotion && landLo ? landLo : land;
    if (shape) {
      ctx.beginPath(); path(shape);
      ctx.fillStyle = SLATE; ctx.fill();
      ctx.lineWidth = 0.7; ctx.strokeStyle = ASH; ctx.globalAlpha = 0.85; ctx.stroke(); ctx.globalAlpha = 1;
    }
    // a linen sheen where the light falls, over land and sea alike
    ctx.beginPath(); ctx.arc(CX, CY, r, 0, 2 * Math.PI);
    var sheen = ctx.createRadialGradient(CX - r * .4, CY - r * .45, 0, CX - r * .2, CY - r * .2, r * 1.1);
    sheen.addColorStop(0, "rgba(232,226,220,.10)"); sheen.addColorStop(1, "rgba(232,226,220,0)");
    ctx.fillStyle = sheen; ctx.fill();

    // instruments: graticule every 15 degrees, the equator a little stronger
    ctx.beginPath(); path(grat);
    ctx.lineWidth = 0.6; ctx.strokeStyle = RED; ctx.globalAlpha = 0.17; ctx.stroke();
    ctx.beginPath(); path({ type: "LineString", coordinates: [[-180, 0], [-90, 0], [0, 0], [90, 0], [180, 0]] });
    ctx.globalAlpha = 0.34; ctx.stroke(); ctx.globalAlpha = 1;

    if (rest > 0 && halo) {
      // the rim and bezel, grown with the globe as it dives and faded out
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = rest;
      var z = view.zoom, dw = canvas.width * z, dh = canvas.height * z;
      ctx.drawImage(halo, CX * DPR * (1 - z), CY * DPR * (1 - z), dw, dh);
      ctx.restore();
    }

    drawPoints(r, rest);
  }

  // Points: drops closer than 10px share one, with a count.
  var groups = [];
  function drawPoints(r, rest) {
    groups = [];
    var centre = [view.lng, view.lat];
    list.forEach(function (d) {
      if (!hasPos(d) || d3.geoDistance([d.lng, d.lat], centre) > Math.PI / 2 - 0.02) return;
      var p = proj([d.lng, d.lat]);
      var g = null;
      for (var k = 0; k < groups.length; k++)
        if (Math.hypot(groups[k].p[0] - p[0], groups[k].p[1] - p[1]) < 10) { g = groups[k]; break; }
      if (g) g.ids.push(d.i); else groups.push({ p: p, ids: [d.i] });
    });
    var shown = null;
    groups.forEach(function (g) {
      var on = g.ids.indexOf(sel) >= 0, fresh = g.ids.some(function (i) { return list[i].isNew; });
      ctx.save();
      ctx.shadowColor = RED; ctx.shadowBlur = on ? 14 : 9;
      ctx.beginPath(); ctx.arc(g.p[0], g.p[1], on ? 4.5 : 3.2, 0, 2 * Math.PI);
      ctx.fillStyle = on ? BONE : fresh ? RED : LINEN; ctx.fill();
      ctx.restore();
      if (g.ids.length > 1 && rest > 0.5) {
        ctx.font = "8px 'Press Start 2P', monospace"; ctx.fillStyle = TAUPE;
        ctx.fillText("x" + g.ids.length, g.p[0] - 26, g.p[1] + 18);
      }
      if (on) { shown = g; pointer(g.p, rest); }
    });
    // the callout rides with the pointer while the globe is at rest
    if (shown && rest > 0.9 && !inMotion) {
      var d = list[sel];
      callout.textContent = "";
      callout.appendChild(el("b", null, "Drop #" + d.n));
      callout.appendChild(el("span", null, d.placed));
      callout.hidden = false;
      var cw = callout.offsetWidth, ch = callout.offsetHeight;
      var x = shown.p[0] + 48, y = shown.p[1] - 70;
      if (x + cw > W - 8) x = shown.p[0] - 48 - cw;            // no room on the right
      callout.style.left = Math.max(8, x) + "px";
      callout.style.top = Math.max(8, Math.min(H - ch - 8, y)) + "px";
    } else {
      callout.hidden = true;
    }
  }

  // The pointer from the reference screen: a red wedge aimed at the point,
  // with a ring around it.
  function pointer(p, rest) {
    ctx.save();
    ctx.beginPath(); ctx.arc(p[0], p[1], 11, 0, 2 * Math.PI);
    ctx.lineWidth = 1.2; ctx.strokeStyle = RED; ctx.stroke();
    ctx.globalAlpha = Math.max(rest, 0.35);
    var tx = p[0] + 7, ty = p[1] - 7;
    ctx.shadowColor = "rgba(255,22,9,.8)"; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + 34, ty - 12); ctx.lineTo(tx + 14, ty - 32);
    ctx.closePath(); ctx.fillStyle = RED; ctx.fill();
    ctx.restore();
  }

  /* --- moving the globe ---------------------------------------------------- */
  var anim = 0;
  function ease(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function easeIn(t) { return t * t * t; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  // Turn along the great circle, and zoom, from where the globe is to `to`.
  function turnTo(to, ms, curve) {
    var me = ++anim;
    if (!hasGlobe || reduceMotion || !ms || !W) { inMotion = false; view = to; draw(); return Promise.resolve(); }
    var from = view, arc = d3.geoInterpolate([from.lng, from.lat], [to.lng, to.lat]);
    var t0 = performance.now();
    inMotion = true;
    return new Promise(function (done) {
      (function step(t) {
        if (me !== anim) return done();
        var k = Math.min(1, (t - t0) / ms), e = (curve || ease)(k), ll = arc(e);
        view = { lng: ll[0], lat: ll[1], zoom: from.zoom + (to.zoom - from.zoom) * e };
        if (k >= 1) inMotion = false;        // the last frame at full detail
        draw();
        if (k < 1) requestAnimationFrame(step); else done();
      })(t0);
    });
  }

  /* --- choosing ------------------------------------------------------------ */
  var bar = { to: document.getElementById("dw-to"), coords: document.getElementById("dw-coords"),
              go: document.getElementById("dw-go") };

  // how: "jump" moves the globe at once, "hold" leaves it where it is (a
  // dive is about to take it there), anything else turns it there.
  function select(i, how) {
    if (!list[i]) return;
    var d = list[i];
    sel = i;
    [].forEach.call(rows.children, function (r, k) {
      r.setAttribute("aria-current", k === i ? "true" : "false");
    });
    bar.to.textContent = "Drop #" + d.n + " · " + d.place;
    bar.coords.textContent = hasPos(d) ? coords(d) : "";
    bar.go.href = "#" + d.n;
    if (how === "hold") return;
    if (root.dataset.view === "world") turnTo(aim(i), how === "jump" ? 0 : 650);
    else view = aim(i);
  }

  // Keys in the world view: arrows walk the list (drops.js would otherwise
  // change the hidden drop underneath), Enter opens. Esc on a drop goes back.
  document.addEventListener("keydown", function (ev) {
    var t = ev.target;
    if (t && t.closest && t.closest("input, textarea, select, [contenteditable]")) return;
    if (root.dataset.view === "world") {
      var step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[ev.key];
      if (step) {
        ev.preventDefault(); ev.stopImmediatePropagation();
        var i = Math.max(0, Math.min(list.length - 1, sel + step));
        rows.children[i].focus();
      } else if (ev.key === "Escape" && worldHelp && worldHelp.open) {
        worldHelp.open = false;
      } else if (ev.key === "Enter" && !(t && t.closest && t.closest("a, button, summary"))) {
        location.hash = "#" + list[sel].n;
      }
    } else if (ev.key === "Escape") {
      var help = document.getElementById("dp-help");
      if (help && help.open) return;            // drops.js closes the help first
      ev.preventDefault();
      toWorldByHand();
    }
  }, true);

  // Drag spins the globe; a tap on a point selects it, a second tap opens it.
  var drag = null;
  canvas.addEventListener("pointerdown", function (ev) {
    drag = { x: ev.clientX, y: ev.clientY, moved: false, v: view };
    canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener("pointermove", function (ev) {
    if (!drag) {
      canvas.style.cursor = hit(ev) ? "pointer" : "grab";
      return;
    }
    var dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true; anim++; inMotion = true;
    var k = 180 / Math.PI / (R * view.zoom);
    view = { lng: drag.v.lng - dx * k, lat: Math.max(-80, Math.min(80, drag.v.lat + dy * k)), zoom: view.zoom };
    canvas.style.cursor = "grabbing";
    draw();
  });
  canvas.addEventListener("pointerup", function (ev) {
    var was = drag; drag = null;
    if (was && was.moved) { inMotion = false; draw(); }
    if (!was || was.moved) return;
    var g = hit(ev);
    if (!g) return;
    if (g.ids.indexOf(sel) >= 0) location.hash = "#" + list[sel].n;
    else select(g.ids[0]);
  });
  canvas.addEventListener("pointercancel", function () { drag = null; inMotion = false; draw(); });
  function hit(ev) {
    var r = canvas.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    for (var k = 0; k < groups.length; k++)
      if (Math.hypot(groups[k].p[0] - x, groups[k].p[1] - y) < 14) return groups[k];
    return null;
  }

  // The world view has its own "What is a drop?" (the drop screen's lives
  // in a panel that is hidden here); like that one, a click outside closes it.
  var worldHelp = document.getElementById("dw-help");
  if (worldHelp) document.addEventListener("click", function (ev) {
    if (worldHelp.open && !worldHelp.contains(ev.target)) worldHelp.open = false;
  });

  /* --- screens ------------------------------------------------------------- */
  var listPanel = world.querySelector(".dw-list");

  function wait(ms) { return new Promise(function (done) { setTimeout(done, ms); }); }
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
    var r = rows.children[i];
    if (!r || reduceMotion) return;
    r.classList.add("is-chosen");
    setTimeout(function () { r.classList.remove("is-chosen"); }, 420);
  }

  async function toDrop(i) {
    var d = list[i];
    if (root.dataset.view === "drop") {        // drop to drop: cut, as the rail does
      if (drops.current() !== i) drops.open(i);
      return;
    }
    var fromList = world.contains(document.activeElement);
    select(i, "hold");
    if (moving()) {
      blink(i);
      var diving = turnTo(dive(i), 560, easeIn);
      await wait(150);
      await Promise.all([diving, fly().exit(listPanel, { distance: 0.45 })]);
    }
    root.dataset.view = "drop";
    if (moving()) flash();
    if (fly()) fly().reset(world);
    drops.open(i);                              // sizes the map now it can be seen
    document.title = TITLE.replace(/DROPS$/, "DROP #" + d.n);
    if (fromList) {
      var row = rail && rail.children[i];
      if (row) row.focus({ preventScroll: true });
    }
    if (moving()) await fly().enter(shell, { speed: 0.55, distance: 0.45 });
  }

  async function toWorld() {
    if (root.dataset.view === "world") return;
    var i = Math.max(0, drops.current()), fromDrop = shell.contains(document.activeElement);
    if (moving()) await fly().exit(shell, { distance: 0.45 });
    root.dataset.view = "world";
    if (moving()) flash();
    if (fly()) fly().reset(shell);
    document.title = TITLE;
    size();
    select(i, "jump");
    if (fromDrop && rows.children[i]) rows.children[i].focus({ preventScroll: true });
    if (moving()) {
      view = dive(i); draw();                   // start inside the drop we left
      fly().enter(listPanel, { speed: 0.55, distance: 0.45 });
      await turnTo(aim(i), 720, easeOut);       // and pull back out to the globe
    }
  }

  // One screen change at a time; a newer request replaces a waiting one.
  var busy = null, next = null;
  function go(target) {
    next = target;
    if (busy) return;
    busy = (async function () {
      while (next) {
        var t = next; next = null;
        try { await (t.i >= 0 ? toDrop(t.i) : toWorld()); } catch (e) { console.error(e); }
      }
      busy = null;
    })();
  }

  // The address decides the screen: drops#003 is drop 003, anything else the
  // world. Choosing a drop is a link, so Back, reload and sharing just work.
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

  // < WORLD: step back if we came from the world, so Back and Forward stay
  // one step apart; otherwise (a shared link to one drop) go forward to it.
  function toWorldByHand() {
    if (history.state && history.state.fromWorld) { history.back(); return; }
    history.pushState(null, "", location.pathname + location.search);
    go({ i: -1 });
  }

  // The rail and the arrow keys change drops inside the drop screen: keep
  // the address and the title in step, without adding history.
  document.addEventListener("pn0va:drop", function (ev) {
    if (root.dataset.view !== "drop") return;
    var d = list[ev.detail.index];
    history.replaceState(history.state, "", "#" + d.n);
    document.title = TITLE.replace(/DROPS$/, "DROP #" + d.n);
  });

  /* --- start --------------------------------------------------------------- */
  route(true);
  select(sel, "jump");
  if (hasGlobe) {
    if (window.ResizeObserver) new ResizeObserver(function () { if (size()) draw(); }).observe(box);
    else window.addEventListener("resize", function () { if (size()) draw(); });
    if (size()) draw();
    if (document.fonts) document.fonts.ready.then(draw);
  }
})();
