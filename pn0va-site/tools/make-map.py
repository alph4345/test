#!/usr/bin/env python3
"""
Download the map for the Drops page: OpenStreetMap streets, water, parks and
place names around every drop point, as one file the site serves itself.

    pip install pmtiles requests
    python tools/make-map.py

Writes _source/map/drops.pmtiles, which build.py copies into every build as
maps/drops.pmtiles. build.py runs this itself when a drop point is outside the
map, so adding a point somewhere new needs no separate step.

Why a file and not a map service: Carto started answering keyless requests
with "API key required" tiles, which broke the page overnight. A file on your
own server needs no key, has no usage limits, sends visitors' IP addresses to
no one, and cannot be switched off by somebody else.

Where it comes from: Protomaps publishes the whole world as one PMTiles
archive every day (https://build.protomaps.com). PMTiles is built to be read
in pieces over plain HTTP, so this script asks for only the tiles near your
drop points, not the ~120 GB planet:

  * close-up detail (zoom 12-15) within DETAIL_KM of each point;
  * a wider view (zoom 8-11) within CONTEXT_KM of each point.

Each point gets its own area, so points in two cities cost two small areas,
not everything in between: one box around San Francisco and Arizona together
would be a thousand kilometres across.

The map can zoom in past 15: the renderer scales the vector data up, so it
stays sharp. The data is © OpenStreetMap contributors (ODbL); the attribution
on the map is required and already set up.
"""

import argparse, datetime, gzip, json, math, pathlib, re, sys

try:
    from pmtiles.tile import (Compression, deserialize_directory, deserialize_header,
                              find_tile, zxy_to_tileid)
    from pmtiles.writer import Writer
except ImportError:
    sys.exit("pip install pmtiles requests")
try:
    import requests
except ImportError:
    sys.exit("pip install pmtiles requests")

SITE = pathlib.Path(__file__).resolve().parent.parent
OUT = SITE / "_source" / "map" / "drops.pmtiles"
BUILDS = "https://build.protomaps.com/{}.pmtiles"

DETAIL_KM, DETAIL_ZOOMS = 4.0, range(12, 16)
CONTEXT_KM, CONTEXT_ZOOMS = 30.0, range(8, 12)

# Merge tile reads that sit this close together in the archive into one
# request. Neighbouring tiles are stored near each other, so a few hundred
# tiles usually arrive in a few dozen requests.
MERGE_GAP = 64 * 1024
MERGE_MAX = 8 * 1024 * 1024


# ------------------------------------------------------------------ drops ---
def brand_kit() -> pathlib.Path:
    for c in (SITE.parent / "PN0VA", SITE.parent / "pn0va-brand", SITE / "_source" / "brand-kit"):
        if (c / "tokens.css").exists():
            return c
    sys.exit("brand kit not found (see build.py)")


def drop_points() -> list[tuple[float, float]]:
    """Where the drop points are (a <section class="dp-point">), and any drop
    that has a place of its own."""
    html = (brand_kit() / "drops" / "drops.html").read_text(encoding="utf-8")
    pts = []
    for m in re.finditer(r'<(?:section class="dp-point"|article class="dp-entry")(.*?)>', html, re.S):
        lat = re.search(r'data-lat="([-\d.]+)"', m.group(1))
        lng = re.search(r'data-lng="([-\d.]+)"', m.group(1))
        if lat and lng:
            pts.append((float(lat.group(1)), float(lng.group(1))))
    if not pts:
        sys.exit("no drop points with data-lat / data-lng found in drops.html")
    return pts


# ------------------------------------------------------------------- tiles ---
def box(lat: float, lng: float, km: float) -> tuple[float, float, float, float]:
    """(west, south, east, north) of a square km out from a point."""
    dlat = km / 110.574
    dlng = km / (111.320 * math.cos(math.radians(lat)))
    return lng - dlng, lat - dlat, lng + dlng, lat + dlat


def tile_xy(lng: float, lat: float, z: int) -> tuple[int, int]:
    n = 2 ** z
    lat = max(min(lat, 85.0511), -85.0511)
    x = int((lng + 180) / 360 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return min(max(x, 0), n - 1), min(max(y, 0), n - 1)


def tiles_in(b, zooms) -> set[int]:
    west, south, east, north = b
    ids = set()
    for z in zooms:
        x0, y0 = tile_xy(west, north, z)
        x1, y1 = tile_xy(east, south, z)
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                ids.add(zxy_to_tileid(z, x, y))
    return ids


# ------------------------------------------------------------------ remote ---
class Remote:
    """Read byte ranges of a PMTiles archive over HTTP."""

    def __init__(self, url: str):
        self.url, self.s, self.requests, self.bytes = url, requests.Session(), 0, 0

    def get(self, offset: int, length: int) -> bytes:
        # stream=True: check the reply BEFORE reading the body. A server that
        # ignores Range answers 200 with the whole file, and for the planet
        # archive that is ~120 GB.
        with self.s.get(self.url, headers={"Range": f"bytes={offset}-{offset + length - 1}"},
                        timeout=120, stream=True) as r:
            r.raise_for_status()
            if r.status_code != 206:
                sys.exit(f"{self.url} ignored the Range header; cannot read it in pieces")
            body = r.content
        self.requests += 1
        self.bytes += len(body)
        return body


def latest_build(days: int = 21) -> str:
    s = requests.Session()
    today = datetime.date.today()
    for back in range(days):
        url = BUILDS.format((today - datetime.timedelta(days=back)).strftime("%Y%m%d"))
        with s.get(url, headers={"Range": "bytes=0-6"}, timeout=60, stream=True) as r:
            if r.status_code == 206 and r.content == b"PMTiles":
                return url
    sys.exit(f"no Protomaps build found in the last {days} days; pass --source URL")


# --------------------------------------------------------------- extract ---
def extract(src: Remote, wanted: set[int]):
    first = src.get(0, 16384)             # header + root directory, by spec
    h = deserialize_header(first[:127])
    if h["internal_compression"] != Compression.GZIP:
        sys.exit("unsupported archive: directories are not gzip-compressed")
    root = deserialize_directory(first[h["root_offset"]:h["root_offset"] + h["root_length"]])
    leaves: dict[int, list] = {}

    def locate(tid: int):
        entries = root
        for _ in range(4):                  # the spec allows at most 3 leaf levels
            e = find_tile(entries, tid)
            if e is None:
                return None
            if e.run_length > 0:
                return h["tile_data_offset"] + e.offset, e.length
            if e.offset not in leaves:
                leaves[e.offset] = deserialize_directory(
                    src.get(h["leaf_directory_offset"] + e.offset, e.length))
            entries = leaves[e.offset]
        return None

    where = {tid: locate(tid) for tid in sorted(wanted)}
    where = {tid: loc for tid, loc in where.items() if loc}

    # fetch each distinct stored tile once, merging neighbours into one request
    spans = sorted(set(where.values()))
    data: dict[tuple[int, int], bytes] = {}
    i = 0
    while i < len(spans):
        start, end, j = spans[i][0], spans[i][0] + spans[i][1], i + 1
        while (j < len(spans) and spans[j][0] - end <= MERGE_GAP
               and spans[j][0] + spans[j][1] - start <= MERGE_MAX):
            end = max(end, spans[j][0] + spans[j][1])
            j += 1
        blob = src.get(start, end - start)
        for off, length in spans[i:j]:
            data[(off, length)] = blob[off - start:off - start + length]
        i = j

    meta = src.get(h["metadata_offset"], h["metadata_length"])
    if h["internal_compression"] == Compression.GZIP:
        meta = gzip.decompress(meta)
    return h, json.loads(meta), {tid: data[loc] for tid, loc in where.items()}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--source", help="PMTiles basemap URL (default: newest Protomaps build)")
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()

    pts = drop_points()
    wanted, boxes = set(), []
    for lat, lng in pts:
        wanted |= tiles_in(box(lat, lng, DETAIL_KM), DETAIL_ZOOMS)
        boxes.append(box(lat, lng, CONTEXT_KM))
        wanted |= tiles_in(boxes[-1], CONTEXT_ZOOMS)
    # the header's bounds hold every area; its centre is the newest point
    context = (min(b[0] for b in boxes), min(b[1] for b in boxes),
               max(b[2] for b in boxes), max(b[3] for b in boxes))
    mid = pts[0]

    url = args.source or latest_build()
    print(f"  {len(pts)} drop points -> {len(wanted)} tiles from {url}")
    src = Remote(url)
    h, meta, tiles = extract(src, wanted)
    if not tiles:
        sys.exit("none of those tiles exist in the source archive")

    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    header = {
        "tile_type": h["tile_type"], "tile_compression": h["tile_compression"],
        "min_lon_e7": round(context[0] * 1e7), "min_lat_e7": round(context[1] * 1e7),
        "max_lon_e7": round(context[2] * 1e7), "max_lat_e7": round(context[3] * 1e7),
        "center_zoom": 14,
        "center_lon_e7": round(mid[1] * 1e7), "center_lat_e7": round(mid[0] * 1e7),
    }
    # build.py reads the list of points back, to warn when a new one is outside
    meta["pn0va"] = {"source": url, "drops": [[lat, lng] for lat, lng in pts],
                     "detail_km": DETAIL_KM,
                     "detail_zooms": [DETAIL_ZOOMS[0], DETAIL_ZOOMS[-1]],
                     "context_km": CONTEXT_KM,
                     "context_zooms": [CONTEXT_ZOOMS[0], CONTEXT_ZOOMS[-1]]}
    with open(out, "wb") as f:
        w = Writer(f)
        for tid in sorted(tiles):
            w.write_tile(tid, tiles[tid])
        w.finalize(header, meta)
    print(f"  wrote {out.relative_to(SITE) if out.is_relative_to(SITE) else out}: "
          f"{len(tiles)} tiles, {out.stat().st_size / 1e6:.1f} MB "
          f"({src.requests} requests, {src.bytes / 1e6:.1f} MB downloaded)")


if __name__ == "__main__":
    main()
