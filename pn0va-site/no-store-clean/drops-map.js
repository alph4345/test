/* ==========================================================================
   DROPS — the street map, served by this site
   The streets used to come from Carto's tile servers, until Carto began
   answering keyless requests with "API key required" tiles. They now come
   from maps/drops.pmtiles on this server: OpenStreetMap data around the
   drops, cut out by tools/make-map.py. No key, no usage limits, and no
   visitor request goes to anyone else's server.

   protomaps-leaflet paints streets, water and names from that vector data in
   the colours below, so the CSS filters that bent Carto's tiles toward this
   palette are gone, and the map stays sharp at every zoom and screen density.

   drops.js calls pn0vaBasemap(map) where it used to add the Carto layers.
   ========================================================================== */
(function () {
  "use strict";

  var me = document.currentScript;
  var FILE = me && me.dataset.map ? new URL(me.dataset.map, me.src).href : null;

  /* The palette. The ground is the site's slate, streets climb toward ash,
     names are linen and bone on halos of the sea colour. Red stays off the
     terrain: it belongs to the instruments drawn on top of it. */
  var SEA = "#1B1918", LAND = "#403B37", ZONE = "#3B3633", PARK = "#3A3D35",
      BLDG = "#37322F", CASE = "#2B2725", MINOR = "#5E5752", MAJOR = "#736B65",
      HWY = "#857C75", RAIL = "#4C4642",
      INK = "#E8E2DC", BONE = "#FFFFFF", TAUPE = "#B0A49B", ASH = "#7A716B";

  var FLAVOR = {
    background: SEA, earth: LAND, water: SEA,
    park_a: PARK, park_b: PARK, wood_a: PARK, wood_b: PARK, scrub_a: PARK, scrub_b: PARK,
    zoo: PARK, glacier: ZONE, sand: ZONE, beach: ZONE, hospital: ZONE, industrial: ZONE,
    school: ZONE, military: ZONE, pedestrian: ZONE, aerodrome: ZONE, runway: MINOR,
    pier: MINOR, buildings: BLDG,

    tunnel_other_casing: CASE, tunnel_minor_casing: CASE, tunnel_link_casing: CASE,
    tunnel_major_casing: CASE, tunnel_highway_casing: CASE,
    tunnel_other: ZONE, tunnel_minor: ZONE, tunnel_link: ZONE, tunnel_major: ZONE,
    tunnel_highway: ZONE,

    minor_service_casing: CASE, minor_casing: CASE, link_casing: CASE,
    major_casing_late: CASE, highway_casing_late: CASE, major_casing_early: CASE,
    highway_casing_early: CASE,
    other: MINOR, minor_service: MINOR, minor_a: MINOR, minor_b: MINOR,
    link: MAJOR, major: MAJOR, highway: HWY,

    bridges_other_casing: CASE, bridges_minor_casing: CASE, bridges_link_casing: CASE,
    bridges_major_casing: CASE, bridges_highway_casing: CASE,
    bridges_other: MINOR, bridges_minor: MINOR, bridges_link: MAJOR, bridges_major: MAJOR,
    bridges_highway: HWY,

    railway: RAIL, boundaries: ASH,

    roads_label_minor: TAUPE, roads_label_minor_halo: SEA,
    roads_label_major: INK, roads_label_major_halo: SEA,
    ocean_label: ASH,
    subplace_label: TAUPE, subplace_label_halo: SEA,
    city_label: BONE, city_label_halo: SEA,
    state_label: ASH, state_label_halo: SEA,
    country_label: ASH,
    address_label: ASH, address_label_halo: SEA,

    pois: { blue: ASH, green: ASH, lapis: ASH, pink: ASH, red: ASH, slategray: ASH,
            tangerine: ASH, turquoise: ASH },
    landcover: { grassland: PARK, barren: ZONE, urban_area: LAND, farmland: ZONE,
                 glacier: ZONE, scrub: PARK, forest: PARK }
  };

  var ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' +
             ' contributors &middot; <a href="https://protomaps.com">Protomaps</a>';

  /* Street names from zoom 15, where a drop usually opens (the library's
     default waits until 16), and no shop or café icons: the instrument
     shows ground and names, nothing that competes with the marker. */
  function labels() {
    return protomapsL.labelRules(FLAVOR, "en")
      .filter(function (r) { return r.dataLayer !== "pois"; })
      .map(function (r) {
        return r.dataLayer === "roads" && r.minzoom === 16
          ? Object.assign({}, r, { minzoom: 15 }) : r;
      });
  }

  /* Add the streets under the rings. If the map file is missing (tools/
     make-map.py not run yet) or the server cannot send parts of a file, the
     page falls back to the rings and marker on plain ground, plus the link to
     OpenStreetMap, instead of a grid of error tiles. */
  window.pn0vaBasemap = function (map) {
    var panel = map.getContainer().closest(".dp-map");
    function fallback(why) {
      if (panel) panel.classList.add("dp-nomap");
      console.info("drops-map.js: no street map (" + why + "). Run tools/make-map.py, then build.py.");
    }
    if (!FILE) { fallback("this build has no map file"); return; }
    if (!window.protomapsL || !window.fetch) { fallback("renderer not loaded"); return; }

    fetch(FILE, { headers: { Range: "bytes=0-6" } })
      .then(function (r) {
        // 206 = the server sends parts of files, which the map needs. A 200
        // would be the whole file, so stop reading it.
        if (r.status !== 206) { if (r.body) r.body.cancel(); throw new Error("HTTP " + r.status); }
        return r.text();
      })
      .then(function (magic) {
        if (magic.slice(0, 7) !== "PMTiles") throw new Error("not a map file");
        protomapsL.leafletLayer({
          url: FILE, pane: "base", maxDataZoom: 15,
          paintRules: protomapsL.paintRules(FLAVOR), labelRules: labels(),
          backgroundColor: FLAVOR.background, attribution: ATTR
        }).addTo(map);
      })
      .catch(function (err) { fallback(err.message); });
  };
})();
