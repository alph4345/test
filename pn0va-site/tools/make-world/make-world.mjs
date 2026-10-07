/* ==========================================================================
   make-world.mjs — the Drops globe's map, from Natural Earth
   --------------------------------------------------------------------------
   The globe on the Drops page draws the world at four levels of detail:

     level 0   the whole globe       one file      data/0.json      (30° pieces)
     level 1   continents            one file      data/1.json      (15° pieces)
     level 2   countries, states     30° squares   data/2/X_Y.json  (10° pieces)
     level 3   a region              15° squares   data/3/X_Y.json  (5° pieces)

   Every level is cut from the same 1:10m coastline, simplified until it is
   accurate to about a pixel at the zoom it is drawn at, so zooming in only
   ever sharpens it. Each file carries coast, land, lakes, country borders
   and state/province lines, and the names shown at its zoom: countries,
   states and provinces, cities and peaks. The page loads level 0 at once
   and the other files only for the part of the world in view.

   The output is committed (_source/world/data), so this only needs running
   to rebuild it:
       cd tools/make-world
       npm install
       node make-world.mjs
   On the first run it downloads its sources (about 60 MB) into
   tools/make-world/cache: Natural Earth 5.1.2 from GitHub, and Natural
   Earth's 1:10m land and countries as TopoJSON from world-atlas 2.0.2
   (npm). Natural Earth is public domain.
   ========================================================================== */

import fs from "fs";
import path from "path";
import zlib from "zlib";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import * as client from "topojson-client";
import { topology } from "topojson-server";
import * as simp from "topojson-simplify";
import { geoArea } from "d3-geo";
import { clipPolygon, clipPolyline } from "lineclip";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, "cache");
const OUT = path.resolve(HERE, "../../_source/world/data");
const NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/";
const ATLAS = "https://registry.npmjs.org/world-atlas/-/world-atlas-2.0.2.tgz";

// The globe's radius at zoom 1 on a desktop screen, in px. The page picks
// levels by scale (radius x zoom), so a phone, with a smaller globe, moves
// up a level later and draws no more points than it needs.
const R = 288;
// fid: the zoom a level is exact to (a pixel), half the zoom it is used up
// to, where it is out by up to two: too little to see, and a third the size.
const LEVELS = [
  { id: 0, fid: 2,  until: 3,  file: 360, piece: 30 },
  { id: 1, fid: 4,  until: 8,  file: 360, piece: 15 },
  { id: 2, fid: 12, until: 24, file: 30,  piece: 10 },
  { id: 3, fid: 32, until: 64, file: 15,  piece: 5 },
];
// one square pixel at zoom z, in steradians: the simplification's yardstick
const px2 = z => Math.pow(1 / (R * z), 2);
// the web-map zoom with the same scale; Natural Earth's label zooms use it
const webZoom = z => Math.log2(R * z / 40.74);

/* --- sources ------------------------------------------------------------- */
async function download(url, file) {
  if (fs.existsSync(file)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  console.log("  fetching", url);
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status + " " + url);
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    // behind a proxy node's fetch can fail where curl works
    execFileSync("curl", ["-sSfL", "-o", file, url], { stdio: "inherit" });
  }
}
// the two TopoJSON files out of world-atlas's npm package (a .tgz)
function untar(tgz, want) {
  const tar = zlib.gunzipSync(fs.readFileSync(tgz)), out = {};
  for (let at = 0; at + 512 <= tar.length;) {
    const name = tar.toString("utf8", at, at + 100).replace(/\0.*$/s, "");
    if (!name) break;
    const size = parseInt(tar.toString("utf8", at + 124, at + 136).replace(/\0.*$/s, "").trim() || "0", 8);
    const base = path.basename(name);
    if (want.includes(base)) out[base] = JSON.parse(tar.toString("utf8", at + 512, at + 512 + size));
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}
async function ne(name) {
  const file = path.join(CACHE, name + ".geojson");
  await download(NE + name + ".geojson", file);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/* --- geometry helpers ---------------------------------------------------- */
function simplified(topo, minWeight, ringMin) {
  let t = simp.presimplify(JSON.parse(JSON.stringify(topo)), simp.sphericalTriangleArea);
  t = simp.simplify(t, minWeight);
  if (ringMin) t = simp.filter(t, simp.filterWeight(t, ringMin, simp.sphericalRingArea));
  return t;
}
// GeoJSON (Feature, FeatureCollection, geometry) -> list of polygons, each a list of rings
function polygonsOf(g) {
  const out = [];
  (function walk(x) {
    if (!x) return;
    if (x.type === "FeatureCollection") x.features.forEach(walk);
    else if (x.type === "Feature") walk(x.geometry);
    else if (x.type === "GeometryCollection") x.geometries.forEach(walk);
    else if (x.type === "Polygon") out.push(x.coordinates);
    else if (x.type === "MultiPolygon") x.coordinates.forEach(c => out.push(c));
  })(g);
  return out;
}
function linesOf(g) {
  const out = [];
  (function walk(x) {
    if (!x) return;
    if (x.type === "FeatureCollection") x.features.forEach(walk);
    else if (x.type === "Feature") walk(x.geometry);
    else if (x.type === "GeometryCollection") x.geometries.forEach(walk);
    else if (x.type === "LineString") out.push(x.coordinates);
    else if (x.type === "MultiLineString") x.coordinates.forEach(c => out.push(c));
  })(g);
  return out;
}
// d3-geo reads a ring's direction to tell inside from outside: a polygon
// that comes out bigger than a hemisphere is wound the other way round.
function d3Wound(poly) {
  return geoArea({ type: "Polygon", coordinates: poly }) > 2 * Math.PI
    ? poly.map(r => r.slice().reverse()) : poly;
}
// Antarctica and the islands cut at 180° carry edges along the date line
// and the pole that are not coast; drop those stretches from the lines.
function realCoast(line) {
  const runs = [];
  let run = [line[0]];
  for (let k = 1; k < line.length; k++) {
    const a = line[k - 1], b = line[k];
    const fake = (Math.abs(a[0]) > 179.999 && Math.abs(b[0]) > 179.999) || (a[1] < -89.999 && b[1] < -89.999);
    if (fake) { if (run.length > 1) runs.push(run); run = [b]; }
    else run.push(b);
  }
  if (run.length > 1) runs.push(run);
  return runs;
}
// A few of Natural Earth's shapes cross the 180° meridian (Chukotka, Wrangel
// Island, Fiji), and Antarctica's coast goes all the way round the pole. In
// flat longitude and latitude, the step from 180 to -180 would cut straight
// back across the world. Unwrapped, longitude runs on past 180 instead; a
// ring round a pole is closed along it; and the clipping below tries each
// piece at its own longitude and a turn either side.
function unwrap(line) {
  const out = [line[0].slice()];
  for (let k = 1; k < line.length; k++) {
    let x = line[k][0];
    const px = out[k - 1][0];
    while (x - px > 180) x -= 360;
    while (x - px < -180) x += 360;
    out.push([x, line[k][1]]);
  }
  return out;
}
function plainRing(ring) {
  const u = unwrap(ring), turn = u[u.length - 1][0] - u[0][0];
  if (Math.abs(turn) > 180) {                     // round a pole: close along it
    const pole = u.reduce((a, p) => a + p[1], 0) / u.length < 0 ? -90 : 90;
    u.push([u[u.length - 1][0], pole], [u[0][0], pole], u[0].slice());
  }
  return u;
}
const TURNS = [0, -360, 360];
function bboxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  return [x0, y0, x1, y1];
}
const meets = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
// Where a polygon is cut along a piece's top or bottom, the new edge follows
// a parallel; drawn straight between its ends it would cut the corner. A
// point every sixth of the piece keeps it within a third of a pixel of the
// parallel at the closest zoom the level is drawn at. (Cuts along a side
// follow a meridian, which projects straight.)
function densify(pts, box) {
  const out = [pts[0]], step = (box[2] - box[0]) / 6;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k];
    const along = a[1] === b[1] && (a[1] === box[1] || a[1] === box[3]);
    const n = along ? Math.ceil(Math.abs(b[0] - a[0]) / step) : 1;
    for (let s = 1; s < n; s++) out.push([a[0] + (b[0] - a[0]) * s / n, a[1]]);
    out.push(b);
  }
  return out;
}
function closed(ring) {
  if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) ring.push(ring[0].slice());
  return ring;
}
function planarArea(ring) {
  let a = 0;
  for (let k = 1; k < ring.length; k++) a += ring[k - 1][0] * ring[k][1] - ring[k][0] * ring[k - 1][1];
  return a / 2;
}
// Sutherland-Hodgman against the piece's box: the polygon keeps its
// direction, so d3 still reads its inside correctly.
const shift = (pts, dx) => dx ? pts.map(p => [p[0] + dx, p[1]]) : pts;
function clipPolygons(polys, box0) {
  const out = [];
  for (const turn of TURNS) {
    const box = [box0[0] + turn, box0[1], box0[2] + turn, box0[3]];
    for (const p of polys) {
      if (!meets(p.bbox, box)) continue;
      const outer = closed(clipPolygon(p.rings[0], box));
      if (outer.length < 4 || Math.abs(planarArea(outer)) < 1e-12) continue;
      const rings = [shift(densify(outer, box), -turn)];
      for (let k = 1; k < p.rings.length; k++) {
        if (!meets(p.holes[k - 1], box)) continue;
        const h = closed(clipPolygon(p.rings[k], box));
        if (h.length >= 4 && Math.abs(planarArea(h)) >= 1e-12) rings.push(shift(densify(h, box), -turn));
      }
      out.push(rings);
    }
  }
  return out;
}
function clipLines(lines, box0) {
  const out = [];
  for (const turn of TURNS) {
    const box = [box0[0] + turn, box0[1], box0[2] + turn, box0[3]];
    for (const l of lines) {
      if (!meets(l.bbox, box)) continue;
      for (const part of clipPolyline(l.pts, box)) if (part.length > 1) out.push(shift(part, -turn));
    }
  }
  return out;
}
const withBoxes = polys => polys.map(rings => {
  rings = rings.map(plainRing);
  return { rings, bbox: bboxOf(rings[0]), holes: rings.slice(1).map(bboxOf) };
});
const lineBoxes = lines => lines.map(pts => { pts = unwrap(pts); return { pts, bbox: bboxOf(pts) }; });

/* --- places -------------------------------------------------------------- */
// [kind, name, lng, lat, from, to, note]  kind: c country, s state, k capital,
// t town, p peak; from/to: the web-map zooms it is labelled between.
const round = v => Math.round(v * 1e4) / 1e4;
function places(n) {
  const out = [];
  const nations = n.nations.features.map(f => f.properties);
  for (const p of nations) {
    if (p.LABEL_X == null) continue;
    out.push(["c", p.NAME, round(p.LABEL_X), round(p.LABEL_Y), p.MIN_LABEL, p.MAX_LABEL, null]);
  }
  // states: one label point each, from the 1:50m polygons where they exist,
  // otherwise the best of the 1:10m label points
  const covered = new Set();
  for (const f of n.states50.features) {
    const p = f.properties;
    if (p.longitude == null || !p.name) continue;
    covered.add(p.adm0_a3);
    out.push(["s", p.name, round(p.longitude), round(p.latitude), p.min_label, p.max_label, p.admin]);
  }
  const groups = new Map();
  for (const f of n.stateLabels.features) {
    const p = f.properties, a3 = p.sr_adm0_a3;
    if (!p.name || covered.has(a3)) continue;
    const key = a3 + "|" + p.name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ p, c: f.geometry.coordinates });
  }
  for (const g of groups.values()) {
    const best = Math.min(...g.map(x => x.p.scalerank));
    const pick = g.filter(x => x.p.scalerank === best);
    const mx = pick.reduce((a, x) => a + x.c[0], 0) / pick.length, my = pick.reduce((a, x) => a + x.c[1], 0) / pick.length;
    pick.sort((a, b) => Math.hypot(a.c[0] - mx, a.c[1] - my) - Math.hypot(b.c[0] - mx, b.c[1] - my));
    const x = pick[0];
    out.push(["s", x.p.name, round(x.c[0]), round(x.c[1]), Math.min(8, 3.5 + 0.5 * best), 9.5, x.p.admin]);
  }
  for (const f of n.towns.features) {
    const p = f.properties;
    const kind = p.featurecla === "Admin-0 capital" ? "k" : "t";
    const where = p.adm0name === "United States of America" ? p.adm1name : p.adm0name;
    out.push([kind, p.name, round(p.longitude), round(p.latitude), p.min_zoom, 99, where || null]);
  }
  for (const f of n.peaks.features) {
    const p = f.properties;
    if (!p.name || p.featurecla !== "mountain" || !(p.elevation > 0)) continue;
    out.push(["p", p.name, round(f.geometry.coordinates[0]), round(f.geometry.coordinates[1]), p.min_zoom, 99, p.elevation]);
  }
  return out;
}

/* --- build ---------------------------------------------------------------- */
async function main() {
  await download(ATLAS, path.join(CACHE, "world-atlas-2.0.2.tgz"));
  const atlas = untar(path.join(CACHE, "world-atlas-2.0.2.tgz"), ["land-10m.json", "countries-10m.json"]);
  const src = {
    admin1: await ne("ne_10m_admin_1_states_provinces_lines"),
    lakes: await ne("ne_10m_lakes"),
    towns: await ne("ne_10m_populated_places_simple"),
    peaks: await ne("ne_10m_geography_regions_elevation_points"),
    nations: await ne("ne_50m_admin_0_countries"),
    states50: await ne("ne_50m_admin_1_states_provinces"),
    stateLabels: await ne("ne_10m_admin_1_label_points"),
  };
  // State and province lines only, not statistical or regional boundaries.
  // Zoomed out, the 1:50m set, which has them for nine large countries (the
  // USA, Canada, Brazil, Australia, Russia, China, India, Indonesia and South
  // Africa); from level 2, the 1:10m set, which has every country's.
  // "statistical" too: Natural Earth files some real state lines that way
  // (California - Nevada, Arizona - California, Quebec - Ontario...)
  const admin = fc => ({ ...fc, features: fc.features.filter(f => f.geometry &&
    /^Admin-1 (statistical )?boundary/.test(f.properties.FEATURECLA)) });
  const admin1T = topology({ states: admin(src.admin1) }, 1e6);
  const admin1Wide = topology({ states: admin(await ne("ne_50m_admin_1_states_provinces_lines")) }, 1e6);
  src.lakes.features.forEach(f => {
    const g = f.geometry;
    if (g.type === "Polygon") g.coordinates = d3Wound(g.coordinates);
    if (g.type === "MultiPolygon") g.coordinates = g.coordinates.map(d3Wound);
  });
  const lakesT = topology({ lakes: src.lakes }, 1e6);
  const allPlaces = places(src);

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const index = { R, levels: LEVELS.map(({ id, until, file, piece }) => ({ id, until, file, piece })), files: {} };
  let total = 0;

  for (const L of LEVELS) {
    const w = px2(L.fid);
    const landT = simplified(atlas["land-10m.json"], w, w * 4);
    const land = withBoxes(polygonsOf(client.feature(landT, landT.objects.land)));
    const coast = lineBoxes(linesOf(client.mesh(landT, landT.objects.land)).flatMap(realCoast));
    // borders and state lines are drawn fine and faint: they can be coarser
    const ctryT = simplified(atlas["countries-10m.json"], w * 2);
    const borders = lineBoxes(linesOf(client.mesh(ctryT, ctryT.objects.countries, (a, b) => a !== b)).flatMap(realCoast));
    const stT = simplified(L.id < 2 ? admin1Wide : admin1T, w * 8);
    const states = lineBoxes(linesOf(client.mesh(stT, stT.objects.states)));
    const lkT = simplified(lakesT, w * 2, w * 64);      // lakes under 8 x 8 px go
    const lakes = withBoxes(polygonsOf(client.feature(lkT, lkT.objects.lakes)));
    const upTo = webZoom(L.until) + 1e-9;
    const shown = allPlaces.filter(p => p[4] <= upTo);

    const files = [];
    for (let fx = -180; fx < 180; fx += L.file) for (let fy = -90; fy < 90; fy += L.file) {
      const fbox = [fx, fy, fx + L.file, fy + L.file];
      const objects = { land: [], lakes: [], coast: [], borders: [], states: [] };
      for (let px = fx; px < fx + L.file; px += L.piece) for (let py = fy; py < fy + L.file; py += L.piece) {
        const box = [px, py, px + L.piece, py + L.piece];
        const key = Math.round((px + 180) / L.piece) + "," + Math.round((py + 90) / L.piece);
        const add = (name, type, coords) => {
          if (coords.length) objects[name].push({ type: "Feature", properties: { p: key }, geometry: { type, coordinates: coords } });
        };
        // every level comes in pieces, so the page can skip the ones out
        // of sight (on the far side of the globe, or off the screen)
        add("land", "MultiPolygon", clipPolygons(land, box));
        add("lakes", "MultiPolygon", clipPolygons(lakes, box));
        add("coast", "MultiLineString", clipLines(coast, box));
        add("borders", "MultiLineString", clipLines(borders, box));
        add("states", "MultiLineString", clipLines(states, box));
      }
      const here = shown.filter(p => p[2] >= fbox[0] && p[2] < fbox[2] && p[3] >= fbox[1] && p[3] < fbox[3]);
      if (!objects.land.length && !objects.lakes.length && !objects.coast.length && !here.length) continue;
      const t = topology(Object.fromEntries(Object.entries(objects).map(([k, v]) => [k, { type: "FeatureCollection", features: v }])),
                         L.file === 360 ? 1e5 : 2e4);
      t.places = here;
      const name = L.file === 360 ? `${L.id}.json` : `${L.id}/${Math.round((fx + 180) / L.file)}_${Math.round((fy + 90) / L.file)}.json`;
      if (L.file !== 360) files.push(name.slice(name.indexOf("/") + 1, -5));
      if (L.id === 0) t.index = index;              // written last, below
      fs.mkdirSync(path.dirname(path.join(OUT, name)), { recursive: true });
      fs.writeFileSync(path.join(OUT, name), JSON.stringify(t));
    }
    if (L.file !== 360) index.files[L.id] = files.sort();
    let bytes = 0, n = 0;
    (function sum(dir) {
      for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) { if (f === String(L.id)) sum(p); }
        else if (f === `${L.id}.json` || dir.endsWith(path.sep + L.id)) { bytes += fs.statSync(p).size; n++; }
      }
    })(OUT);
    total += bytes;
    console.log(`level ${L.id}: ${n} file(s), ${(bytes / 1024).toFixed(0)} KB, ${shown.length} places up to web zoom ${upTo.toFixed(1)}`);
  }
  // level 0 carries the index of every file, written now it is complete
  const zero = JSON.parse(fs.readFileSync(path.join(OUT, "0.json"), "utf8"));
  zero.index = index;
  zero.source = "Natural Earth 5.1.2 (public domain), 1:10m land and countries via world-atlas 2.0.2";
  fs.writeFileSync(path.join(OUT, "0.json"), JSON.stringify(zero));
  console.log(`total ${(total / 1048576).toFixed(1)} MB in ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
