/* ==========================================================================
   DROPS — the world view
   --------------------------------------------------------------------------
   One page, two screens. The WORLD: a globe with a point for every drop and
   the list of drops with their dates. A DROP: the record drops.js already
   draws (frequency bar, street map, hint, brief, item).

     drops         the world
     drops#003     drop 003 (a link to one drop opens straight on it)

   Point at a drop in the list and the globe turns to it. Choose it and the
   globe dives in, the list flies off, and the drop's windows fly in. WORLD
   MAP (top of the drop list, and on the street map), Esc or the browser's
   Back returns, pulling back out to the globe. Changing drops on the drop
   screen, from its list or with the arrow keys, flies the windows out and
   back in with the new drop.

   Every drop has its own point. Drops too close to tell apart at the
   current zoom are spread around the spot they share, each on a thread back
   to it. The globe zooms with its + and - buttons, the mouse wheel, a pinch,
   or the + - 0 keys; the globe button goes back to the whole globe.

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
  var ZOOM_MAX = 16;                    // a state across; closer, the 1:50m coast turns to polygons
  var SPREAD = 18;                      // px: points closer than this are moved apart

  // A wireframe globe, on every way back to the whole world.
  var GLOBE = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
              '<circle cx="8" cy="8" r="6.5"/><ellipse cx="8" cy="8" rx="2.7" ry="6.5"/>' +
              '<path d="M1.5 8h13M2.6 4.7h10.8M2.6 11.3h10.8"/></svg>';

  var me = document.currentScript;
  var LAND = me && me.dataset.land ? new URL(me.dataset.land, me.src).href : null;
  var drops = window.pn0vaDrops;        // from drops.js
  var root = document.documentElement;
  var world = document.getElementById("dw");
  var shell = document.querySelector(".dp-shell");
  if (!drops || !world || !shell) return;
  var detail = shell.querySelector(".dp-detail") || shell;

  var fly = function () { return window.pn0vaFly; };   // page-script.js loads after this
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var TITLE = document.title;

  /* --- palette: the brand tokens ----------------------------------------- */
  var css = getComputedStyle(root);
  function tok(name, fallback) { return css.getPropertyValue(name).trim() || fallback; }
  var RED = tok("--pn-red", "#FF1609"), EMBER = tok("--pn-ember", "#0A0000"),
      BONE = tok("--pn-bone", "#FFFFFF"), LINEN = tok("--pn-linen", "#E8E2DC"),
      ASH = tok("--pn-ash", "#7A716B"), SLATE = tok("--pn-slate", "#3A3532");

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
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
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

  // The drop screen's list gets the NEW badges too, and, at its top, the
  // way back: a real button, so nobody has to hunt for it.
  var rail = document.getElementById("dp-rows");
  if (rail) list.forEach(function (d) {
    if (d.isNew && rail.children[d.i]) rail.children[d.i].appendChild(newBadge());
  });
  var manifest = rail && rail.closest(".dp-manifest");
  var back = el("button", "dp-world-back");
  back.type = "button";
  back.title = "Back to the world map (Esc)";
  back.innerHTML = GLOBE + '<span class="lbl">World map</span><span class="key" aria-hidden="true">Esc</span>';
  back.addEventListener("click", toWorldByHand);
  if (manifest) manifest.insertBefore(back, manifest.firstChild);

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

  /* --- the globe ---------------------------------------------------------- */
  var box = document.getElementById("dw-globe");
  var canvas = document.getElementById("dw-canvas");
  var callout = document.getElementById("dw-callout");
  var ctx = canvas.getContext("2d");
  var hasGlobe = !!(window.d3 && d3.geoOrthographic && window.topojson);
  var proj, path, land = null, landLo = null;
  if (hasGlobe) {
    proj = d3.geoOrthographic().clipAngle(90).precision(0.4);
    path = d3.geoPath(proj, ctx);
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
  // What the globe faces: a centre, the zoom chosen with the buttons, wheel
  // or pinch, and a dive that multiplies it while a drop opens or closes.
  var view = aim(sel, 1);

  // Resting view: the drop sits up and left of centre with the callout
  // beside it, the same distance from the centre on screen at any zoom.
  function aim(i, z) {
    var d = list[i] || {};
    if (!hasPos(d)) return { lng: 0, lat: 20, zoom: z, dive: 1 };
    return { lng: d.lng + 10 / z, lat: clamp(d.lat - 6 / z, -80, 80), zoom: z, dive: 1 };
  }
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

    // land: slate, coasts in ash
    var shape = inMotion && landLo ? landLo : land;
    if (shape) {
      ctx.beginPath(); path(shape);
      ctx.fillStyle = SLATE; ctx.fill();
      ctx.lineWidth = 0.7; ctx.strokeStyle = ASH; ctx.globalAlpha = 0.85; ctx.stroke(); ctx.globalAlpha = 1;
    }
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

    drawPoints(rest);
    zoomButtons();
  }

  // Points: one for every drop on this side of the globe. Drops closer
  // together than SPREAD are moved apart, each on a red thread back to the
  // ash mark where it really is; zoom in far enough and they separate.
  var hits = [];
  function drawPoints(rest) {
    var centre = [view.lng, view.lat], pts = [], shown = null;
    list.forEach(function (d) {
      if (!hasPos(d) || d3.geoDistance([d.lng, d.lat], centre) > Math.PI / 2 - 0.02) return;
      var p = proj([d.lng, d.lat]);
      pts.push({ i: d.i, at: p, x: p[0], y: p[1] });
    });
    spreadOut(pts);
    hits = pts;

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

    pts.forEach(function (q) { if (q.i === sel) shown = q; });
    if (shown) pointer(shown, rest);            // under the points, so it hides none
    var others = pts.filter(function (q) { return q !== shown; });
    dots(others.filter(function (q) { return !list[q.i].isNew; }), LINEN, false);
    dots(others.filter(function (q) { return list[q.i].isNew; }), RED, false);
    if (shown) dots([shown], BONE, true);

    // the callout rides with the pointer while the globe is at rest
    if (shown && rest > 0.9 && !inMotion) {
      var d = list[sel];
      callout.textContent = "";
      callout.appendChild(el("b", null, "Drop #" + d.n));
      callout.appendChild(el("span", null, d.placed));
      callout.hidden = false;
      var cw = callout.offsetWidth, ch = callout.offsetHeight, px = shown.x, py = shown.y;
      // Up and right of the pointer if it fits, else the first place round
      // the point that keeps clear of it, the pointer and the zoom buttons
      // (on a phone the left is where the buttons are), else the least bad.
      var avoid = [[px - 14, py - 14, px + 14, py + 14], [px + 5, py - 41, px + 43, py - 5],
                   [zoomBox.offsetLeft - 6, zoomBox.offsetTop - 6,
                    zoomBox.offsetLeft + zoomBox.offsetWidth + 6, zoomBox.offsetTop + zoomBox.offsetHeight + 6]];
      var best = null;
      [[px + 48, py - 70], [px - 48 - cw, py - 70], [px + 48, py + 26], [px - 48 - cw, py + 26],
       [px - cw / 2, py + 30], [px - cw / 2, py - 50 - ch]].forEach(function (c) {
        var x = clamp(c[0], 8, W - cw - 8), y = clamp(c[1], 8, H - ch - 8), cost = 0;
        avoid.forEach(function (a) {
          cost += Math.max(0, Math.min(x + cw, a[2]) - Math.max(x, a[0])) *
                  Math.max(0, Math.min(y + ch, a[3]) - Math.max(y, a[1]));
        });
        if (!best || cost < best.cost) best = { x: x, y: y, cost: cost };
      });
      callout.style.left = best.x + "px";
      callout.style.top = best.y + "px";
    } else {
      callout.hidden = true;
    }
  }

  // Drops within SPREAD of each other (directly or through a neighbour)
  // form a group, set out on a ring around the group's middle in the order
  // they really lie round it, turned to match (in San Francisco, Alcatraz
  // is the top one). As the zoom parts them, the ring eases into their true
  // places; by the time they are SPREAD apart they are there. A drop with
  // room around it never moves.
  function spreadOut(pts) {
    var up = pts.map(function (q, k) { return k; });
    function top(k) { while (up[k] !== k) k = up[k] = up[up[k]]; return k; }
    var a, b, p, q;
    for (a = 0; a < pts.length; a++) for (b = a + 1; b < pts.length; b++)
      if (Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y) < SPREAD) up[top(a)] = top(b);
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
      var turn = Math.atan2(sy, sx), r = SPREAD / (2 * Math.sin(Math.PI / n));
      var real = Math.pow(Math.min(1, near / SPREAD), 2);       // 0 together .. 1 apart
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
        if (gap >= SPREAD - 0.01) continue;
        if (gap < 1e-6) { dx = Math.cos(b * 2.4); dy = Math.sin(b * 2.4); gap = 1; }   // the very same spot
        var push = (SPREAD - gap) / 2 / gap;
        p.x -= dx * push; p.y -= dy * push; q.x += dx * push; q.y += dy * push;
        again = true;
      }
      if (!again) break;
    }
  }

  // Points of one colour as one shape: the glow is the costly part of a
  // point, and this way it is drawn once for all of them.
  function dots(qs, colour, on) {
    if (!qs.length) return;
    var r = on ? 4.5 : 3.2;
    ctx.save();
    ctx.shadowColor = RED; ctx.shadowBlur = on ? 14 : 9;
    ctx.beginPath();
    qs.forEach(function (q) { ctx.moveTo(q.x + r, q.y); ctx.arc(q.x, q.y, r, 0, 2 * Math.PI); });
    ctx.fillStyle = colour; ctx.fill();
    ctx.restore();
  }

  // The pointer from the reference screen: a red wedge aimed at the point,
  // with a ring around it.
  function pointer(q, rest) {
    ctx.save();
    ctx.beginPath(); ctx.arc(q.x, q.y, 11, 0, 2 * Math.PI);
    ctx.lineWidth = 1.2; ctx.strokeStyle = RED; ctx.stroke();
    ctx.globalAlpha = Math.max(rest, 0.35);
    var tx = q.x + 7, ty = q.y - 7;
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

  // Turn along the great circle from where the globe is to `to`, zooming and
  // diving in step (on a log scale, so each doubling takes as long). A long
  // way at a close zoom rises out on the way and comes back down, as a
  // flight would, rather than smearing the ground past.
  function turnTo(to, ms, curve) {
    var me = ++anim;
    if (!hasGlobe || reduceMotion || !ms || !W) { inMotion = false; view = to; draw(); return Promise.resolve(); }
    var from = view, a = [from.lng, from.lat], b = [to.lng, to.lat];
    var arc = d3.geoInterpolate(a, b), far = d3.geoDistance(a, b);
    var z0 = Math.log(from.zoom), z1 = Math.log(to.zoom), v0 = Math.log(from.dive), v1 = Math.log(to.dive);
    var fits = Math.log(Math.max(1, 1.9 / Math.max(far, 1e-9)));   // the zoom that shows both ends
    var dip = Math.max(0, (z0 + z1) / 2 - fits);
    if (dip > 0.3) ms *= 1.4;
    var t0 = performance.now();
    inMotion = true;
    return new Promise(function (done) {
      (function step(t) {
        if (me !== anim) return done();
        var k = Math.min(1, (t - t0) / ms), e = (curve || ease)(k), ll = arc(e);
        view = { lng: ll[0], lat: ll[1], zoom: Math.exp(z0 + (z1 - z0) * e - dip * 4 * e * (1 - e)),
                 dive: Math.exp(v0 + (v1 - v0) * e) };
        if (k >= 1) { inMotion = false; view = to; }   // the last frame at full detail
        draw();
        if (k < 1) requestAnimationFrame(step); else done();
      })(t0);
    });
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

  // Zoom to z, keeping the ground at screen point p where it is.
  function zoomTo(z, p, ms) {
    var me = ++anim, z0 = view.zoom, g = groundAt(p);
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

  // A moment after the last wheel turn or pinch, redraw at full detail.
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

  // + and -: a doubling at a time, about the selected drop while it is in
  // view (so it stays where it is), otherwise about the centre.
  function zoomBy(dir) {
    var l = Math.log2(view.zoom);
    var z = clamp(Math.pow(2, dir > 0 ? Math.floor(l + 1e-6) + 1 : Math.ceil(l - 1e-6) - 1), 1, ZOOM_MAX);
    if (z !== view.zoom) zoomTo(z, selOnScreen() || [CX, CY], 380);
  }
  function selOnScreen() {
    var d = list[sel];
    if (!d || !hasPos(d) || d3.geoDistance([d.lng, d.lat], [view.lng, view.lat]) > Math.PI / 2 - 0.05) return null;
    face(view);
    var p = proj([d.lng, d.lat]);
    return p[0] > 8 && p[0] < W - 8 && p[1] > 8 && p[1] < H - 8 ? p : null;
  }
  // 0 and the globe button: back out to the whole globe, on the selected drop.
  function whole() {
    if (zoomAll.getAttribute("aria-disabled") !== "true") turnTo(aim(sel, 1), 700);
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
    if (root.dataset.view === "world") turnTo(aim(i, view.zoom), how === "jump" ? 0 : 650);
    else view = aim(i, view.zoom);
  }

  // Keys. World: arrows walk the list, Enter opens, + - 0 zoom. A drop:
  // arrows change drops (or pan the street map while it has focus), Esc goes
  // back. drops.js never sees the arrows: it would cut to the next drop,
  // where this flies the windows. With Alt, Ctrl or Cmd they are the
  // browser's (Alt+Left is Back).
  document.addEventListener("keydown", function (ev) {
    var t = ev.target;
    if (t && t.closest && t.closest("input, textarea, select, [contenteditable]")) return;
    var step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[ev.key];
    var plain = !(ev.altKey || ev.ctrlKey || ev.metaKey);
    if (step) {
      ev.stopImmediatePropagation();
      if (!plain) return;
      ev.preventDefault();
      if (root.dataset.view === "world") {
        rows.children[clamp(sel + step, 0, list.length - 1)].focus();
      } else if (t && t.closest && t.closest(".leaflet-container")) {
        panStreet(ev.key, ev.shiftKey);
      } else {
        var from = target >= 0 ? target : drops.current();
        var to = clamp(from + step, 0, list.length - 1);
        if (to !== from) switchTo(to);
      }
    } else if (root.dataset.view === "world") {
      if (ev.key === "Escape" && worldHelp && worldHelp.open) {
        worldHelp.open = false;
      } else if (ev.key === "Enter" && !(t && t.closest && t.closest("a, button, summary"))) {
        location.hash = "#" + list[sel].n;
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
  // zoom. A tap on a point selects it, a second tap opens it.
  var drag = null, touches = {}, pinch = null;
  function twoFingers() {
    var ids = Object.keys(touches);
    if (ids.length !== 2) return null;
    var a = touches[ids[0]], b = touches[ids[1]], r = canvas.getBoundingClientRect();
    return { gap: Math.hypot(a.x - b.x, a.y - b.y), mid: [(a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top] };
  }
  canvas.addEventListener("pointerdown", function (ev) {
    touches[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
    canvas.setPointerCapture(ev.pointerId);
    var two = twoFingers();
    if (two) {
      drag = null; anim++; inMotion = true;
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
      canvas.style.cursor = hit(ev) ? "pointer" : "grab";
      return;
    }
    var dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true; anim++; inMotion = true;
    var k = 180 / Math.PI / scale(view);
    view = { lng: drag.v.lng - dx * k, lat: clamp(drag.v.lat + dy * k, -80, 80), zoom: view.zoom, dive: view.dive };
    canvas.style.cursor = "grabbing";
    draw();
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
    if (!q) return;
    if (q.i === sel) location.hash = "#" + list[sel].n;
    else select(q.i);
  });
  canvas.addEventListener("pointercancel", function (ev) { lift(ev); drag = null; inMotion = false; draw(); });
  function hit(ev) {
    var r = canvas.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    var best = null, reach = ev.pointerType === "touch" ? 22 : 14;
    hits.forEach(function (q) {
      var gap = Math.hypot(q.x - x, q.y - y);
      if (gap < reach) { reach = gap; best = q; }
    });
    return best;
  }

  // The wheel zooms about the point under the mouse.
  canvas.addEventListener("wheel", function (ev) {
    if (!hasGlobe || !W) return;
    ev.preventDefault();
    var dy = ev.deltaY * (ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? H : 1);
    var z = clamp(view.zoom * Math.exp(-dy * (ev.ctrlKey ? 0.01 : 0.004)), 1, ZOOM_MAX);
    if (Math.abs(z - view.zoom) < 1e-6) return;
    var r = canvas.getBoundingClientRect(), p = [ev.clientX - r.left, ev.clientY - r.top];
    anim++; inMotion = true;
    zoomAbout(groundAt(p), p, z);
    draw();
    settleSoon();
  }, { passive: false });

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

  // The drop screen's list marks the drop asked for at once; drops.js marks
  // it again when the drop is shown.
  function markRail(i) {
    if (rail) [].forEach.call(rail.children, function (r, k) {
      r.setAttribute("aria-current", k === i ? "true" : "false");
    });
  }

  async function toDrop(i) {
    if (root.dataset.view === "drop") {
      // drop to drop: the record's windows fly out, and back in with the
      // new drop; the list stays where it is
      if (drops.current() === i) return;
      if (moving()) {
        await fly().exit(detail, { speed: 0.6, distance: 0.45 });
        if (next && next.i >= 0) { i = next.i; next = null; }   // chosen again meanwhile
      }
      if (drops.current() !== i) drops.open(i);
      if (fly()) fly().reset(detail);
      if (moving()) await fly().enter(detail, { speed: 0.4, distance: 0.45 });
      return;
    }
    var d = list[i];
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
      await turnTo(aim(i, view.zoom), 720, easeOut);   // and pull back out, to the zoom we left
    }
  }

  // One screen change at a time; a newer request replaces a waiting one.
  // target is the drop asked for last, so arrows pressed during a change
  // step on from it rather than from the drop still showing.
  var busy = null, next = null, target = -1;
  function go(job) {
    next = job;
    if (busy) return;
    busy = (async function () {
      while (next) {
        var j = next; next = null;
        try { await (j.i >= 0 ? toDrop(j.i) : toWorld()); } catch (e) { console.error(e); }
      }
      busy = null;
      target = -1;
    })();
  }

  // The drop screen's list and arrow keys change drops in place: no new
  // history, the address and title follow (see pn0va:drop below).
  function switchTo(i) {
    if (!list[i]) return;
    target = i;
    markRail(i);
    go({ i: i });
  }
  // drops.js would cut straight to the row clicked: catch the click first.
  // Caught, it no longer reaches the page either, so close "What is a
  // drop?" here, as a click anywhere outside it does.
  if (rail) rail.addEventListener("click", function (ev) {
    var row = ev.target.closest && ev.target.closest(".dp-row");
    if (!row || row.parentNode !== rail) return;
    ev.stopPropagation();
    var help = document.getElementById("dp-help");
    if (help && help.open) help.open = false;
    switchTo([].indexOf.call(rail.children, row));
  }, true);

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
    if (i >= 0) { target = i; if (root.dataset.view === "drop") markRail(i); }
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

  // Keep the address and the title in step with the drop showing, without
  // adding history.
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
