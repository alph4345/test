#!/usr/bin/env python3
"""
Preview the site on this computer, the way the web host will serve it.

    python tools/preview.py                    # pick a build from a list
    python tools/preview.py no-store-clean     # or name one (any site folder works)

On Windows, double-click PREVIEW.cmd instead: it does the same with nothing
installed. tools/preview.ps1 is its server; keep the two in step.

Why not just double-click index.html: the -clean builds link to /style.css,
/drops and so on, which only mean "the top of the website" on a web server.
And why not `python -m http.server`: it cannot send parts of files, which the
Drops map needs, and it knows nothing about the .htaccess rules.

This server reads the build's own .htaccess and follows it the way Apache
does, so the preview cannot drift from the real site:

  * /drops is served from drops/index.html, and /drops/ redirects to /drops;
  * old addresses (/drops.html, /geocache.html, /shop ...) redirect;
  * a missing page shows the home page, with a 404 status.

It also answers range requests (the Drops map reads its file in pieces) and
tells the browser to cache nothing, so a rebuild shows on the next reload.
Only this computer can open it: it listens on 127.0.0.1.
"""

import argparse, http.server, pathlib, re, sys, urllib.parse, webbrowser

SITE = pathlib.Path(__file__).resolve().parent.parent
PORT = 8940

KNOWN = {                                   # build folder -> what it is
    "with-store-clean": "upload-ready, with the store",
    "no-store-clean": "upload-ready, without the store",
    "with-store": "flat copy, with the store",
    "no-store": "flat copy, without the store",
}

# Fixed rather than Python's mimetypes: on Windows that reads the registry,
# where some programs register .js as text/plain, and the site's nosniff
# header would then stop every script from running.
TYPES = {
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8", ".json": "application/json",
    ".txt": "text/plain; charset=utf-8", ".xml": "application/xml",
    ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
    ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff",
    ".ttf": "font/ttf", ".pdf": "application/pdf",
    ".webmanifest": "application/manifest+json",
    ".pmtiles": "application/octet-stream",
}


# -------------------------------------------------------------- the site ---
class Site:
    """A build folder plus the .htaccess rules that shape its addresses."""

    def __init__(self, root: pathlib.Path):
        self.root = root.resolve()
        self.redirects = []                 # [(compiled pattern, target)]
        self.not_found = None               # ErrorDocument 404 target
        ht = self.root / ".htaccess"
        if ht.is_file():
            for line in ht.read_text(encoding="utf-8").splitlines():
                m = re.match(r"\s*RewriteRule\s+(\S+)\s+(/\S*)\s+\[R=301,L\]", line)
                if m:
                    self.redirects.append((re.compile(m.group(1)), m.group(2)))
                m = re.match(r"\s*ErrorDocument\s+404\s+(/\S*)", line)
                if m:
                    self.not_found = m.group(1)

    def resolve(self, path: str):
        """("file", f), ("redirect", address) or ("missing", None), in Apache's order."""
        rel = path.lstrip("/")
        # dot files (.htaccess) are never served; this also refuses "..".
        if "\0" in rel or any(p.startswith(".") for p in re.split(r"[\\/]", rel)):
            return "missing", None
        f = (self.root / rel).resolve()
        if f != self.root and self.root not in f.parents:
            return "missing", None
        # /drops/ -> /drops
        if path != "/" and path.endswith("/") and f.is_dir():
            return "redirect", path.rstrip("/") or "/"
        # /drops -> drops/index.html
        if f.is_dir() and (f / "index.html").is_file():
            return "file", f / "index.html"
        # old addresses. Apache applies these before looking for the file.
        for rx, to in self.redirects:
            if rx.search(rel):
                return "redirect", to
        if f.is_file():
            return "file", f
        return "missing", None


def byte_range(header: str, size: int):
    """(start, end) for a Range header, "unsatisfiable", or None to send it all."""
    m = re.fullmatch(r"\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*", header)
    if not m or not (m.group(1) or m.group(2)):
        return None                         # several ranges, or not bytes
    if not m.group(1):                      # bytes=-500: the last 500
        n = int(m.group(2))
        return (max(size - n, 0), size - 1) if n and size else "unsatisfiable"
    start = int(m.group(1))
    if m.group(2) and int(m.group(2)) < start:
        return None                         # malformed: ignore it, as the spec says
    if start >= size:
        return "unsatisfiable"
    return start, min(int(m.group(2)), size - 1) if m.group(2) else size - 1


# ---------------------------------------------------------------- server ---
class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "pn0va-preview"
    sys_version = ""

    def do_GET(self):
        self.answer(body=True)

    def do_HEAD(self):
        self.answer(body=False)

    def log_message(self, *args):           # replaced by note()
        pass

    def note(self, status: int, extra: str = ""):
        print(f"  {status}  {urllib.parse.unquote(self.path)}{extra}", flush=True)

    def answer(self, body: bool):
        site = self.server.site
        # one leading slash: a redirect to //drops would send the browser to a
        # host called "drops" (and urlsplit would read it that way too)
        raw, _, query = self.path.partition("?")
        path = "/" + urllib.parse.unquote(raw).lstrip("/")
        query = "?" + query if query else ""
        try:
            kind, where = site.resolve(path)
            if kind == "redirect":
                self.note(301, f"  -> {where}{query}")
                self.send(301, headers={"Location": where + query}, body=body)
                return
            if kind == "file":
                self.send_file(where, 200, body)
                return
            # ErrorDocument 404 / : the host shows the home page, status 404
            kind, where = site.resolve(site.not_found) if site.not_found else ("missing", None)
            if kind == "file":
                self.note(404, "  (shows the home page, as the host will)")
                self.send_file(where, 404, body)
            else:
                self.note(404)
                self.send(404, b"Not found\n", body=body)
        except OSError:                     # the browser gave up on this request
            self.close_connection = True

    def send(self, status: int, data: bytes = b"", headers=None, body=True):
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if body:
            self.wfile.write(data)

    def send_file(self, f: pathlib.Path, status: int, body: bool):
        size = f.stat().st_size
        start, end = 0, size - 1
        if status == 200 and "Range" in self.headers:
            r = byte_range(self.headers["Range"], size)
            if r == "unsatisfiable":
                self.note(416)
                return self.send(416, headers={"Content-Range": f"bytes */{size}"}, body=body)
            if r:
                (start, end), status = r, 206
        kind = TYPES.get(f.suffix.lower(), "application/octet-stream")
        if status == 200 and kind.startswith("text/html"):
            self.note(200)
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Accept-Ranges", "bytes")
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        # cache nothing, so a rebuild shows at once. This covers the 301s too:
        # a browser keeps a cached 301 for good, and the flat builds, if
        # previewed at this address later, have no /drops to be sent to.
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")     # as the host sends
        self.end_headers()
        if not body:
            return
        with open(f, "rb") as fh:
            fh.seek(start)
            left = end - start + 1
            while left > 0:
                chunk = fh.read(min(65536, left))
                if not chunk:
                    break
                self.wfile.write(chunk)
                left -= len(chunk)


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    # On Windows this option lets a second server share a busy port, and the
    # two then split the requests between them. Refuse, and try the next port.
    allow_reuse_address = sys.platform != "win32"


def serve(site: Site, port: int) -> Server:
    # a few ports up from the usual one, then any free port: Windows reserves
    # blocks of ports for Hyper-V and WSL, sometimes right where 8940 is
    for p in list(range(port, port + 20)) + [0]:
        try:
            server = Server(("127.0.0.1", p), Handler)
        except OSError:
            continue
        server.site = site
        return server
    sys.exit("  Could not find a free port.")


# ---------------------------------------------------------------- picking ---
def sites_in(base: pathlib.Path) -> list:
    """Folders in base with an index.html, the four builds first."""
    order = list(KNOWN)
    found = [d for d in base.iterdir() if d.is_dir() and (d / "index.html").is_file()]
    return sorted(found, key=lambda d: (order.index(d.name) if d.name in KNOWN else len(order),
                                        d.name.lower()))


def pick(arg) -> pathlib.Path:
    base = SITE
    if arg:
        p = pathlib.Path(arg)
        if not p.is_dir() and (SITE / arg).is_dir():
            p = SITE / arg
        if not p.is_dir():
            sys.exit(f"  There is no folder called {arg}.")
        if (p / "index.html").is_file():
            return p
        base = p                            # a folder of builds: choose below
    found = sites_in(base)
    if not found:
        sys.exit(f"  No site folder in {base}.\n"
                 f"  Run build.py first, or name a folder that has an index.html in it.")
    if len(found) == 1 or not sys.stdin.isatty():
        return found[0]
    print("\n  Which build?\n")
    for i, d in enumerate(found, 1):
        print(f"    {i}  {d.name:<18} {KNOWN.get(d.name, '')}".rstrip())
    while True:
        try:
            answer = input("\n  Type a number and press Enter (just Enter for 1): ").strip()
        except EOFError:
            answer = ""
        if not answer:
            return found[0]
        if answer.isdigit() and 1 <= int(answer) <= len(found):
            return found[int(answer) - 1]


def main():
    ap = argparse.ArgumentParser(description=__doc__.strip().split("\n")[0])
    ap.add_argument("folder", nargs="?", help="build folder to serve (default: choose from a list)")
    ap.add_argument("--port", type=int, default=PORT, help=f"port to try first (default {PORT})")
    ap.add_argument("--no-browser", action="store_true", help="don't open a browser window")
    args = ap.parse_args()

    site = Site(pick(args.folder))
    server = serve(site, args.port)
    url = f"http://localhost:{server.server_address[1]}"
    print(f"\n  Previewing {site.root.name} at {url}\n\n"
          f"  Your browser should open on its own. If it doesn't, type that address\n"
          f"  into it. Leave this running while you look around; press Ctrl+C or\n"
          f"  close the window to stop.\n", flush=True)
    if not args.no_browser:
        webbrowser.open(url + "/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.")


if __name__ == "__main__":
    main()
