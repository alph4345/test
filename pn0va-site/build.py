#!/usr/bin/env python3
"""
Build the new pn0va.com from the last packaged build + the 2026 brand kit.

    python build.py

Produces two complete, deployable sites:

    with-store/  every page, including a rebuilt store
    no-store/    the same site with the store removed everywhere

Both are generated from one source so they cannot drift apart. Re-run this
after changing anything in ../pn0va-brand and both variants pick it up.

What it does to the 2026-07-06 build:
  * swaps the corrected logotype (katakana ピー・ノバ, outlined)
  * retires geocache.html -> drops.html and drops the dead geo-* CSS
  * migrates the palette: body copy off pure white onto linen, yellow out,
    greys warmed, the two drifted reds fixed
  * self-hosts Press Start 2P and CreateJS, removing both CDN dependencies
  * rewrites the nav and home menu on every page
  * bumps every cache-bust string
"""

import pathlib, re, shutil, sys

ROOT = pathlib.Path(__file__).resolve().parent
VER  = "20260802a"

# The 2026-07-06 build this derives from ships in _source/ so the script stays
# re-runnable. It originally read from a temp scratch folder, which would have
# broken the moment that got cleaned up.
SRC = next((c for c in [
    ROOT / "_source/website-fixed",
    pathlib.Path("C:/Users/N0VA/AppData/Local/Temp/claude/C--Users-N0VA-claude"
                 "/8d1c7ee0-d41c-4cda-8511-6ed506731efb/scratchpad/site/website-fixed"),
] if c.exists()), None)

# The brand kit — wherever it happens to live. The real kit always wins; the
# bundled snapshot is only the fallback, so this folder still builds on a
# machine (or in a fresh checkout) that has never seen Desktop\PN0VA.
# The snapshot was reconstructed from the 2026-08-19 build output and rebuilds
# that output byte-for-byte.
BRAND = next((c for c in [
    ROOT.parent / "PN0VA",
    ROOT.parent / "pn0va-brand",
    pathlib.Path("C:/Users/N0VA/claude/pn0va-brand"),
    ROOT / "_source/brand-kit",
] if (c / "tokens.css").exists()), None)

if SRC is None:
    sys.exit("source build not found. Expected _source/website-fixed —\n"
             "re-extract website-fixed.zip from 'Website files july 2026'.")
if BRAND is None:
    sys.exit("brand kit not found. Expected a sibling folder named PN0VA\n"
             "(or pn0va-brand) containing tokens.css.")

PAGES = ["index.html", "blog.html", "projects.html", "about.html"]

# Every generated file is written with Windows line endings, whichever OS
# runs the build. The ?v= stamps hash the bytes, so without this a build on
# Linux or macOS changed every stamp (and every line) for no reason.
NL = "\r\n"


# ---------------------------------------------------------------- palette ---
# Only the values that actually change. Everything else was already correct.
CSS_SWAPS = [
    # the two drifted reds — one blue channel off, invisible by eye
    ("#ff1608",                "var(--pn-red)"),
    ("rgba(255, 22, 8, 0.5)",  "var(--pn-red-50)"),
    ("rgba(255,22,8,0.5)",     "var(--pn-red-50)"),
    # yellow is retired: state goes to bone, sub-headings go to the chroma
    ("#ffff00",                "var(--pn-signal)"),
    ("rgba(255, 255, 0, 0.7)", "rgba(255,255,255,.7)"),
    ("rgba(255, 255, 0, 0.6)", "rgba(255,255,255,.6)"),
    ("rgba(255,255,0,0.7)",    "rgba(255,255,255,.7)"),
    # neutrals warmed so they read as chosen rather than inherited
    ("#8C8280",                "var(--pn-ink-muted)"),
    ("#888",                   "var(--pn-ink-faint)"),
    ("#999",                   "var(--pn-ink-faint)"),
    ("#aa4444",                "var(--pn-ink-faint)"),
]


def wipe(path: pathlib.Path):
    """rmtree, but survive a preview server holding a handle.

    Windows refuses to delete a directory something has open, and a running
    `python -m http.server` on the output folder does exactly that. Retry,
    then fall back to emptying the contents in place.
    """
    import time
    if not path.exists():
        return
    for attempt in range(6):
        try:
            shutil.rmtree(path)
            return
        except PermissionError:
            time.sleep(0.4 * (attempt + 1))
    for child in path.iterdir():                 # last resort: empty it
        try:
            shutil.rmtree(child) if child.is_dir() else child.unlink()
        except PermissionError:
            pass


def migrate_css(text: str) -> str:
    for old, new in CSS_SWAPS:
        text = text.replace(old, new)

    # Body copy comes off pure white onto linen. This is the change the whole
    # signal scheme rests on: bone can only mean "you are here" if it is rare.
    text = text.replace("background: #000000;\n  font-family: 'Press Start 2P', monospace;\n  color: #fff;",
                        "background: var(--pn-ground);\n  font-family: 'Press Start 2P', monospace;\n  color: var(--pn-ink);")
    # window titles stay bone — they are the panel's identity
    text = text.replace(".text-window h2\n{\n  color: #fff;",
                        ".text-window h2\n{\n  color: var(--pn-ink-strong);")
    # h3 was yellow for no reason; it is a sub-heading, so it takes the chroma
    text = text.replace(".text-window h3\n{\n  color: var(--pn-signal);",
                        ".text-window h3\n{\n  color: var(--pn-red);")
    # remaining plain white becomes linen; nav hover/active handled by the
    # swaps above
    text = re.sub(r"color:\s*#fff\b(?!\w)", "color: var(--pn-ink)", text)

    # Press Start 2P: self-hosted, so the @import (and its ordering trap) goes
    text = text.replace(
        "@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');",
        "/* Self-hosted — no Google Fonts request, and no @import ordering trap.\n"
        "   The face MUST still be declared before anything that uses it. */\n"
        "@font-face{\n"
        "  font-family:'Press Start 2P';\n"
        "  src:url('fonts/press-start-2p-latin-400-normal.woff2') format('woff2');\n"
        "  font-weight:400; font-style:normal; font-display:block;\n"
        "}")
    return text


def strip_geo_css(text: str) -> str:
    """geocache.html is gone, so every geo-* rule is dead weight.

    An earlier version cut one contiguous block and left 45 lines behind —
    the html.js and media-query variants live elsewhere in the file. This
    walks rules instead, so placement doesn't matter.
    """
    out, i, n = [], 0, len(text)
    while i < n:
        brace = text.find("{", i)
        if brace == -1:
            out.append(text[i:]); break
        selector = text[i:brace]
        # find the matching close brace, allowing one level of nesting (@media)
        depth, j = 1, brace + 1
        while j < n and depth:
            if text[j] == "{": depth += 1
            elif text[j] == "}": depth -= 1
            j += 1
        block = text[i:j]
        # the leading class also has to allow "(" — body:has(#geo-container)
        if re.search(r"(^|[\s,(])[.#]?geo[-\w]*", selector) and "@media" not in selector:
            # drop the rule, and any comment banner immediately above it
            while out and out[-1].strip().startswith("/*") and "geo" in out[-1].lower():
                out.pop()
        elif "@media" in selector:
            inner = strip_geo_css(block[block.find("{") + 1: block.rfind("}")])
            out.append(block[:block.find("{") + 1] + inner + "}") if inner.strip() else None
        else:
            out.append(block)
        i = j
    text = "".join(out)
    # tidy the banner comments that described the removed page
    text = re.sub(r"/\*[^*]*Geocache[^*]*\*/\s*", "", text, flags=re.I)
    return re.sub(r"\n{3,}", "\n\n", text)


# ------------------------------------------------------------------- nav ---
def nav_html(current: str, with_shop: bool) -> str:
    items = [("index.html", "Home"), ("blog.html", "Blog"),
             ("projects.html", "Projects"), ("drops.html", "Drops")]
    if with_shop:
        items.append(("store.html", "Store"))
    items.append(("about.html", "About"))
    out = []
    for href, label in items:
        cls = ' class="active"' if href == current else ""
        out.append(f'      <li><a href="{href}"{cls}>{label}</a></li>')
    return "\n".join(out)


def retarget_nav(html: str, page: str, with_shop: bool) -> str:
    m = re.search(r"(<nav[^>]*>\s*<ul>\s*)(.*?)(\s*</ul>\s*</nav>)", html, re.S)
    if not m:
        return html
    return html[:m.start(2)] + "\n" + nav_html(page, with_shop) + "\n    " + html[m.end(2):]


HOME_MENU = {
    True:  ('    <a href="blog.html" class="menu-item">Blog</a>\n'
            '    <a href="projects.html" class="menu-item">Projects</a>\n'
            '    <a href="drops.html" class="menu-item">Drops</a>\n'
            '    <a href="store.html" class="menu-item">Store</a>\n'
            '    <a href="about.html" class="menu-item">About</a>'),
    False: ('    <a href="blog.html" class="menu-item">Blog</a>\n'
            '    <a href="projects.html" class="menu-item">Projects</a>\n'
            '    <a href="drops.html" class="menu-item">Drops</a>\n'
            '    <a href="about.html" class="menu-item">About</a>'),
}


READER_CSS = """
/* ==========================================================================
   READER — blog & projects
   Same instrument chrome as DROPS. Classes are separate (.rd-* not .dp-*) so
   the two pages cannot break each other; the shared look lives in the tokens.
   ========================================================================== */
.rd-panel{
  position:relative; display:flex; flex-direction:column; min-height:0;
  background:var(--pn-surface);
  border:var(--pn-hairline-w) solid var(--pn-hairline);
  border-radius:var(--pn-radius-sm);
}
.rd-panel::before,.rd-panel::after{
  content:""; position:absolute; width:9px; height:9px; pointer-events:none;
  border-color:var(--pn-red); border-style:solid; border-width:0;
}
.rd-panel::before{ top:-1px; left:-1px; border-top-width:2px; border-left-width:2px; }
.rd-panel::after{ bottom:-1px; right:-1px; border-bottom-width:2px; border-right-width:2px; }
.rd-panel__head{
  display:flex; align-items:center; justify-content:space-between; gap:10px;
  padding:7px 11px; border-bottom:var(--pn-hairline-w) solid var(--pn-hairline);
  font-size:9px; letter-spacing:.18em; text-transform:uppercase;
  color:var(--pn-red); flex:0 0 auto;
}
.rd-panel__head .rd-idx{ color:var(--pn-ink-faint); letter-spacing:.14em; white-space:nowrap; }
.rd-panel__body{ flex:1 1 auto; min-height:0; overflow-y:auto; padding:16px 20px 20px; }

/* Single screen. The PAGE never scrolls; the reader body does. */
html.js body:has(.rd-shell){ overflow:hidden; }
.rd-shell{
  display:grid; grid-template-columns:250px minmax(0,1fr); gap:12px;
  height:100vh; height:100dvh; padding:74px 14px 14px;
  max-width:1400px; margin:0 auto;
}

.rd-manifest .rd-panel__body{ padding:0; }
.rd-row{
  position:relative; display:grid; grid-template-columns:auto 1fr; gap:3px 9px;
  width:100%; text-align:left; background:none; border:0;
  border-bottom:1px solid var(--pn-divider); padding:11px 12px;
  cursor:pointer; font:inherit; color:var(--pn-ink-muted);
  transition:color var(--pn-dur-state) ease, background var(--pn-dur-state) ease;
}
.rd-row:hover{ color:var(--pn-ink); background:var(--pn-red-07); }
.rd-row:focus-visible{ outline:2px solid var(--pn-focus); outline-offset:-2px; }
.rd-row__n{ font-size:10px; color:var(--pn-red); font-variant-numeric:tabular-nums; }
.rd-row__t{ font-size:10px; letter-spacing:.06em; line-height:1.5; }
.rd-row__d{ grid-column:2; font-size:8px; letter-spacing:.12em; color:var(--pn-ink-faint); }
.rd-row[aria-current="true"]{ color:var(--pn-signal); background:var(--pn-red-20); }
.rd-row[aria-current="true"] .rd-row__n{ color:var(--pn-signal); }
.rd-row[aria-current="true"]::before{
  content:""; position:absolute; left:0; top:0; width:3px; height:100%;
  background:var(--pn-red);
}

.rd-reader .rd-panel__body h2{
  font-size:var(--pn-size-title); letter-spacing:var(--pn-track);
  text-transform:uppercase; color:var(--pn-ink-strong); margin:0 0 12px;
  padding-bottom:8px; text-shadow:var(--pn-glow-text);
  border-bottom:1px solid var(--pn-red-50);
}
.rd-reader .rd-panel__body h3{
  font-size:var(--pn-size-sub); letter-spacing:var(--pn-track);
  text-transform:uppercase; color:var(--pn-red); margin:18px 0 8px;
}
.rd-reader .rd-panel__body p{
  font-family:var(--pn-face-body); font-size:var(--pn-size-body);
  line-height:var(--pn-lh-body); color:var(--pn-ink); margin:0 0 10px; max-width:68ch;
}
.rd-reader .rd-panel__body p.date{
  font-family:var(--pn-face-display); font-size:9px; letter-spacing:.14em;
  text-transform:uppercase; color:var(--pn-ink-faint); margin:-4px 0 14px;
}
.rd-reader img{
  max-width:100%; height:auto; display:block; margin:0 0 12px;
  border:1px solid var(--pn-hairline);
}

@media (max-width:900px){
  /* still no page scroll: manifest becomes a channel strip, reader takes the rest */
  .rd-shell{
    grid-template-columns:1fr; grid-template-rows:auto minmax(0,1fr);
    padding:58px 10px 10px; gap:8px;
  }
  .rd-manifest .rd-panel__head{ display:none; }
  .rd-manifest .rd-panel__body{ display:flex; overflow-x:auto; overflow-y:hidden; }
  .rd-row{
    grid-template-columns:auto auto; align-items:baseline; gap:6px;
    border-bottom:0; border-right:1px solid var(--pn-divider);
    padding:9px 13px; white-space:nowrap; flex:0 0 auto;
  }
  .rd-row__d{ display:none; }
  .rd-row[aria-current="true"]::before{ width:100%; height:2px; top:auto; bottom:0; }
  .rd-panel__body{ padding:13px 15px 16px; }
}
"""

READER_JS = """/* ==========================================================================
   READER — blog & projects
   ONE axis of navigation: pick an item. The body scrolls inside its own panel,
   so there are no sub-pages, no edge arrows and no item arrows.

   The old layout had two sets of arrows that looked identical but moved on
   different axes — side chevrons turned pages within a post, bottom arrows
   flipped between posts — with nothing on screen to tell them apart. Letting
   the body scroll makes sub-pages unnecessary and deletes the ambiguity.

   Content lives in the HTML; this file counts it at runtime.
   ========================================================================== */
(function () {
  "use strict";

  var entries = [].slice.call(document.querySelectorAll(".rd-entry"));
  if (!entries.length) return;

  var rows  = document.getElementById("rd-rows");
  var body  = document.getElementById("rd-body");
  var title = document.getElementById("rd-title");
  var date  = document.getElementById("rd-date");
  var count = document.getElementById("rd-count");
  var current = -1;

  entries.forEach(function (e, i) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "rd-row";
    b.setAttribute("aria-current", "false");
    b.innerHTML =
      '<span class="rd-row__n">' + String(i + 1).padStart(2, "0") + '</span>' +
      '<span class="rd-row__t">' + e.dataset.title + '</span>' +
      '<span class="rd-row__d">' + (e.dataset.date || "") + '</span>';
    b.addEventListener("click", function () { show(i); });
    rows.appendChild(b);
  });
  if (count) count.textContent = String(entries.length).padStart(2, "0") + " REC";

  function show(i) {
    if (i === current || !entries[i]) return;
    current = i;
    var e = entries[i];
    [].forEach.call(rows.children, function (r, n) {
      r.setAttribute("aria-current", n === i ? "true" : "false");
    });
    title.textContent = e.dataset.title;
    if (date) date.textContent = e.dataset.date || "";
    body.innerHTML = e.innerHTML;
    body.scrollTop = 0;                    // a new item starts at the top
  }

  document.addEventListener("keydown", function (ev) {
    var t = ev.target;
    if (t && t.closest && t.closest("input, textarea, [contenteditable]")) return;
    if (ev.key === "ArrowDown" || ev.key === "ArrowRight") {
      if (current < entries.length - 1) { show(current + 1); ev.preventDefault(); }
    } else if (ev.key === "ArrowUp" || ev.key === "ArrowLeft") {
      if (current > 0) { show(current - 1); ev.preventDefault(); }
    }
  });

  show(0);
})();
"""

def build_reader(html: str, unit: str) -> str:
    """Rewrite a paged-window page into the manifest + reader layout."""
    items = re.findall(
        r'<div class="page-content[^"]*"[^>]*id="([^"]+)"[^>]*>(.*?)\n    </div>',
        html, re.S)
    if not items:
        return html

    articles = []
    for _id, inner in items:
        subs = re.findall(r'<div class="sub-page[^"]*"[^>]*>(.*?)</div>', inner, re.S)
        if not subs:
            subs = [inner]
        t = re.search(r"<h2>(.*?)</h2>", inner, re.S)
        title = re.sub(r"<[^>]+>", "", t.group(1)).strip() if t else _id
        d = re.search(r'<p class="date">(.*?)</p>', inner, re.S)
        when = re.sub(r"<[^>]+>", "", d.group(1)).strip() if d else ""

        merged = []
        for k, sub in enumerate(subs):
            part = sub
            if k:      # every sub-page repeated the title; keep it once
                part = re.sub(r"<h2>.*?</h2>\s*", "", part, count=1, flags=re.S)
            merged.append(part.strip())
        articles.append(
            '  <article class="rd-entry" data-title="' + title +
            '" data-date="' + when + '">\n' + "\n".join(merged) + "\n  </article>")

    shell = (
        '  <main class="rd-shell">\n'
        '    <section class="rd-panel rd-manifest" aria-label="' + unit + 's">\n'
        '      <div class="rd-panel__head"><span>' + unit + 's</span>'
        '<span class="rd-idx" id="rd-count">--</span></div>\n'
        '      <div class="rd-panel__body" id="rd-rows"></div>\n'
        '    </section>\n'
        '    <section class="rd-panel rd-reader" aria-label="' + unit + '">\n'
        '      <div class="rd-panel__head"><span id="rd-title">--</span>'
        '<span class="rd-idx" id="rd-date"></span></div>\n'
        '      <div class="rd-panel__body" id="rd-body"></div>\n'
        '    </section>\n'
        '  </main>\n\n'
        '  <!-- ============================================================\n'
        '       ADD A ' + unit.upper() + '\n'
        '       Copy an <article class="rd-entry">. data-title and data-date\n'
        '       feed the list on the left; everything inside is the body and\n'
        '       it scrolls on its own. No sub-pages, no arrows to wire up.\n'
        '       ============================================================ -->\n'
        '  <div hidden id="rd-data">\n' + "\n".join(articles) + '\n  </div>')

    start = html.find('<main id="windows"')
    end = html.find("</main>", start) + len("</main>")
    html = html[:start] + shell + html[end:]

    # NOTE: this runs BEFORE the ?v= rewrite, so the version string here is
    # still the ORIGINAL one from the 2026-07-06 build. Match it loosely.
    html = re.sub(r'<script src="paged-window\.js[^"]*"></script>',
                  '<script src="reader.js"></script>', html)
    # page-script.js animates #window-left / #window-right, which no longer
    # exist on these pages — leaving it in would be a silent no-op at best
    html = re.sub(r'\s*<script src="page-script\.js[^"]*"></script>', '', html)
    html = re.sub(r'(<link rel="stylesheet" href="page-style\.css[^"]*">)',
                  lambda m: m.group(1)
                            + chr(10) + '  <link rel="stylesheet" href="reader.css">',
                  html)
    return html


def build(with_shop: bool):
    out = ROOT / ("with-store" if with_shop else "no-store")
    wipe(out)
    shutil.copytree(SRC, out, dirs_exist_ok=True)

    # --- assets from the brand kit -----------------------------------------
    shutil.copy(BRAND / "tokens.css", out / "tokens.css")
    (out / "fonts").mkdir(exist_ok=True)
    shutil.copy(BRAND / "fonts/press-start-2p-latin-400-normal.woff2", out / "fonts")
    shutil.copy(BRAND / "logo/pn0va-logo.svg", out / "images/logo.svg")
    # The raster art had the OLD katakana baked in — the animated homepage logo
    # and the no-JS fallback both still read ピー・ノーバー. All three are
    # regenerated in the brand kit:
    #   index_atlas_1.png  cell 0 repainted ーバー -> バ, so the sprite sequence
    #                      ピ+ー+・+ノ+[cell0] now spells ピー・ノバ. No change to
    #                      script.js, and the glyph is cut from the original art
    #                      so it stays in Kozuka Gothic.
    #   logo2.png          no-JS fallback. Now RED — it was 100% black, sitting
    #                      on the black homepage with no filter, i.e. invisible.
    #   logo.png           black variant, for light grounds.
    for raster in ("index_atlas_1.png", "logo2.png", "logo.png"):
        src = BRAND / "logo" / raster
        if src.exists():
            shutil.copy(src, out / "images" / raster)

    # The ANIMATED logo lives in script.js — a second copy of the same Animate
    # export as logo-anim/pn0va-anim-export.js. Taking it from _source meant
    # every logo change (the katakana, then the sword) landed on the static
    # assets while the homepage animation quietly kept the old art. Copy the
    # brand kit's copy instead, so the two can never drift again.
    anim = BRAND / "logo-anim" / "pn0va-anim-export.js"
    if anim.exists():
        shutil.copy(anim, out / "script.js")
    # CreateJS was loaded from a CDN the site already had failure handling for
    (out / "vendor").mkdir(exist_ok=True)
    shutil.copy(BRAND / "logo-anim/vendor/createjs-1.0.0.min.js", out / "vendor")

    # --- drops replaces geocache -------------------------------------------
    (out / "geocache.html").unlink(missing_ok=True)
    drops = (BRAND / "drops/drops.html").read_text(encoding="utf-8")
    # brand-kit paths -> site root
    drops = (drops.replace('href="../tokens.css', 'href="tokens.css')
                  .replace("url('../fonts/", "url('fonts/"))
    # Drop the components.css link ENTIRELY — the site styles from
    # page-style.css. Stripping only the href leaves "<link rel=stylesheet "
    # dangling, which then swallows the following line into malformed markup.
    drops = re.sub(r'[ \t]*<link rel="stylesheet" href="\.\./components\.css[^>]*>\n?',
                   '', drops)
    # use the site's own nav markup so every page matches
    drops = re.sub(r'<nav class="pn-nav">.*?</nav>',
                   '<nav id="navbar">\n    <ul>\n' + nav_html("drops.html", with_shop) +
                   "\n    </ul>\n  </nav>", drops, flags=re.S)
    drops = drops.replace('<link rel="stylesheet" href="drops.css',
                          '<link rel="stylesheet" href="page-style.css?v=' + VER +
                          '">\n<link rel="stylesheet" href="drops.css')
    (out / "drops.html").write_text(drops, encoding="utf-8", newline=NL)

    # No FIREFLY_CSS here: the living layer belongs to the home page only.
    # Interior pages are pure instrument — a firefly drifting over a map you
    # are trying to read is atmosphere in the wrong place.
    shutil.copy(BRAND / "drops/drops.css", out / "drops.css")
    shutil.copy(BRAND / "drops/drops.js", out / "drops.js")
    for img in (BRAND / "drops/images").glob("*.svg"):
        shutil.copy(img, out / "images")
    shutil.rmtree(out / "images/geocache", ignore_errors=True)   # page is gone
    # the placeholder art still carried the retired yellow
    for svg in (out / "images").rglob("*.svg"):
        if svg.name == "logo.svg":
            continue
        t = svg.read_text(encoding="utf-8")
        svg.write_text(t.replace("#ffff00", "#B0A49B").replace("#FFFF00", "#B0A49B")
                        .replace("#999", "#7A716B"), encoding="utf-8", newline=NL)

    # --- reader: blog & projects lose the nested paged-window navigation ----
    (out / "reader.css").write_text(READER_CSS, encoding="utf-8", newline=NL)
    (out / "reader.js").write_text(READER_JS, encoding="utf-8", newline=NL)
    (out / "paged-window.js").unlink(missing_ok=True)
    for page, unit in (("blog.html", "Post"), ("projects.html", "Project")):
        f = out / page
        f.write_text(build_reader(f.read_text(encoding="utf-8"), unit), encoding="utf-8", newline=NL)

    # --- stylesheets --------------------------------------------------------
    ps = migrate_css(strip_geo_css((out / "page-style.css").read_text(encoding="utf-8")))
    (out / "page-style.css").write_text(ps, encoding="utf-8", newline=NL)
    (out / "style.css").write_text(
        migrate_css((out / "style.css").read_text(encoding="utf-8")), encoding="utf-8", newline=NL)

    # --- pages --------------------------------------------------------------
    for page in PAGES + ["drops.html"]:
        f = out / page
        html = f.read_text(encoding="utf-8")
        html = retarget_nav(html, page, with_shop)
        if page == "index.html":
            html = re.sub(r'    <a href="blog\.html" class="menu-item">.*?class="menu-item">About</a>',
                          HOME_MENU[with_shop], html, flags=re.S)
            html = html.replace('<script src="https://code.createjs.com/1.0.0/createjs.min.js"></script>',
                                '<script src="vendor/createjs-1.0.0.min.js?v=' + VER + '"></script>')
        # tokens must load before anything that uses them
        if "tokens.css" not in html:
            html = re.sub(r'(\n\s*<link rel="stylesheet")',
                          '\n  <link rel="stylesheet" href="tokens.css?v=' + VER + '">\\1',
                          html, count=1)
        # inline style attributes are HTML, so migrate_css never reached them
        html = html.replace('style="color: #999;', 'style="color: var(--pn-ink-faint);')
        # inline style attributes live in the HTML, so migrate_css never saw them
        html = html.replace('style="color: #999;', 'style="color: var(--pn-ink-faint);')
        html = re.sub(r"\?v=\d{8}[a-z]", "?v=" + VER, html)
        # assets added by build_reader arrive without a stamp
        html = re.sub(r'(href|src)="(reader\.(?:css|js))"',
                      lambda m: m.group(1) + '="' + m.group(2)
                                + '?v=' + VER + '"', html)
        f.write_text(html, encoding="utf-8", newline=NL)

    if with_shop:
        (out / "store.html").write_text(
            STORE.replace("__NAV__", nav_html("store.html", True)).replace("__VER__", VER),
            encoding="utf-8", newline=NL)
        (out / "store.js").write_text(STORE_JS, encoding="utf-8", newline=NL)
        (out / "page-style.css").write_text(
            (out / "page-style.css").read_text(encoding="utf-8") + STORE_CSS, encoding="utf-8", newline=NL)
        (out / "images/store").mkdir(parents=True, exist_ok=True)
        for n in ("1", "2", "3"):
            (out / f"images/store/item-{n}.svg").write_text(PLACEHOLDER, encoding="utf-8", newline=NL)

    return out


PLACEHOLDER = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
  <rect width="400" height="300" fill="#0A0000"/>
  <rect x="1" y="1" width="398" height="298" fill="none" stroke="#FF1609" stroke-width="2"/>
  <path d="M150 110h100v80H150z" fill="none" stroke="#FF1609" stroke-opacity=".5" stroke-dasharray="6 5"/>
  <text x="200" y="158" text-anchor="middle" font-family="monospace" font-size="13"
        letter-spacing="3" fill="#B0A49B">PRODUCT</text>
  <text x="200" y="176" text-anchor="middle" font-family="monospace" font-size="10"
        letter-spacing="2" fill="#7A716B">4:3 IMAGE</text>
</svg>
"""

STORE_CSS = """

/* ==========================================================================
   STORE — rebuilt 2026.08.02 from the description in PROJECT-HISTORY.md
   (the original was lost when the dev container reset mid-session and was
   never packaged into the zips). Behaviour matches what was documented.
   ========================================================================== */
/* The store never scrolls the page. Items that do not fit go on the NEXT
   PAGE, the same way the drops manifest pages through records. store.js
   measures how many cards actually fit and sets --per-page from that. */
html.js body:has(#store-shell){ overflow:hidden; }
#store-shell{
  display:grid; grid-template-rows:minmax(0,1fr) auto;
  height:100vh; height:100dvh;
  padding:82px 20px 14px; max-width:1320px; margin:0 auto; gap:12px;
}
/* auto-FIT + a max track width, so cards keep their size and the row centres
   instead of three items stretching edge to edge on a wide screen */
#store-grid{
  display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 330px));
  grid-auto-rows:max-content;   /* NOT 1fr — rows must keep their natural
                                   height, or they squash to fit any space
                                   and pagination never triggers */
  justify-content:center; align-content:start;
  gap:20px; min-height:0; overflow:hidden;
}
.store-item[hidden]{ display:none; }

#store-pager{
  display:flex; align-items:center; justify-content:center; gap:18px;
  padding:9px 0 2px; border-top:1px solid var(--pn-hairline);
}
#store-pager[hidden]{ display:none; }
#store-count{
  font-family:'Press Start 2P', monospace; font-size:9px; letter-spacing:.16em;
  color:var(--pn-ink-muted); font-variant-numeric:tabular-nums; min-width:96px;
  text-align:center;
}
.store-page-btn{
  font-family:'Press Start 2P', monospace; font-size:9px; letter-spacing:.12em;
  color:var(--pn-ink); background:transparent;
  border:2px solid var(--pn-red); border-radius:var(--pn-radius-sm);
  padding:9px 13px; cursor:pointer;
  transition:color var(--pn-dur-state) ease, background var(--pn-dur-state) ease;
}
.store-page-btn:hover:not(:disabled){ color:var(--pn-signal); background:var(--pn-red-07); }
.store-page-btn:focus-visible{ outline:2px solid var(--pn-focus); outline-offset:2px; }
.store-page-btn:disabled{ color:var(--pn-ink-faint); border-color:var(--pn-ink-faint); cursor:default; }
.store-item{
  display:flex; flex-direction:column;
  background:rgba(0,0,0,.95);
  border:2px solid var(--pn-red); border-radius:var(--pn-radius);
  box-shadow:var(--pn-glow-window);
}
.store-item img{
  width:100%; aspect-ratio:4/3; object-fit:cover; display:block;
  border-bottom:1px solid var(--pn-red-50);
}
.store-item .body{ padding:14px 15px 16px; display:flex; flex-direction:column; flex:1 1 auto; }
.store-item h2{
  font-size:12px; letter-spacing:.1em; text-transform:uppercase;
  color:var(--pn-ink-strong); margin:0 0 8px; text-shadow:var(--pn-glow-text);
}
.store-item .price{
  font-size:14px; color:var(--pn-red); margin-bottom:10px;
  font-variant-numeric:tabular-nums; text-shadow:var(--pn-glow-active);
}
.store-item p{
  font-family:Arial, sans-serif; font-size:12.5px; line-height:1.6;
  color:var(--pn-ink); margin:0 0 16px; flex:1 1 auto;
}
.store-item button{
  font-family:'Press Start 2P', monospace; font-size:10px; letter-spacing:.12em;
  color:var(--pn-ink); background:transparent;
  border:2px solid var(--pn-red); border-radius:var(--pn-radius-sm);
  padding:11px; cursor:pointer; margin-top:auto;
  transition:color .2s ease, background .2s ease;
}
.store-item button:hover{ color:var(--pn-signal); background:var(--pn-red-07); }
.store-item button:focus-visible{ outline:2px solid var(--pn-focus); outline-offset:2px; }

/* floating cart button */
#cart-toggle{
  position:fixed; right:18px; bottom:18px; z-index:120;
  font-family:'Press Start 2P', monospace; font-size:10px; letter-spacing:.12em;
  color:var(--pn-ink); background:rgba(0,0,0,.9);
  border:2px solid var(--pn-red); border-radius:var(--pn-radius-sm);
  padding:13px 15px; cursor:pointer; box-shadow:var(--pn-glow-window);
}
#cart-toggle:hover{ color:var(--pn-signal); }
#cart-toggle:focus-visible{ outline:2px solid var(--pn-focus); outline-offset:2px; }
#cart-count{
  display:inline-block; min-width:17px; margin-left:7px; padding:2px 4px;
  background:var(--pn-red); color:var(--pn-void); border-radius:2px;
  font-variant-numeric:tabular-nums;
}
#cart-toggle.bump #cart-count{ animation:cart-pulse .45s ease; }
@keyframes cart-pulse{ 50%{ transform:scale(1.5) } }

/* slide-in panel */
#cart-backdrop{
  position:fixed; inset:0; background:rgba(0,0,0,.66); z-index:130;
  opacity:0; pointer-events:none; transition:opacity .25s ease;
}
#cart-backdrop.open{ opacity:1; pointer-events:auto; }
#cart-panel{
  position:fixed; top:0; right:0; z-index:140;
  width:min(370px, 92vw); height:100%;
  background:var(--pn-surface-alt); border-left:2px solid var(--pn-red);
  transform:translateX(100%); transition:transform .3s var(--pn-ease-land);
  display:flex; flex-direction:column;
}
#cart-panel.open{ transform:none; }
#cart-panel header{
  display:flex; justify-content:space-between; align-items:center;
  padding:15px 16px; border-bottom:1px solid var(--pn-red-50);
  font-size:12px; letter-spacing:.14em; text-transform:uppercase;
  color:var(--pn-ink-strong);
}
#cart-close{
  background:none; border:1px solid var(--pn-red); border-radius:2px;
  color:var(--pn-red); font-family:'Press Start 2P', monospace; font-size:10px;
  padding:6px 9px; cursor:pointer;
}
#cart-close:hover{ color:var(--pn-signal); border-color:var(--pn-signal); }
#cart-lines{ flex:1 1 auto; overflow-y:auto; overflow-x:hidden;
  padding:6px 16px; margin:0; list-style:none; }
/* minmax(0,1fr) is the fix: a plain 1fr track refuses to shrink below its
   content, so a long product name pushed the row wider than the panel and
   "Remove" fell off the right edge. */
#cart-lines li{
  display:grid; grid-template-columns:minmax(0,1fr) auto; gap:6px 10px;
  padding:13px 0; border-bottom:1px solid var(--pn-hairline);
}
#cart-lines .nm{ font-size:10px; letter-spacing:.06em; color:var(--pn-ink);
  min-width:0; overflow-wrap:anywhere; line-height:1.5; }
#cart-lines .ln{ font-size:11px; color:var(--pn-red); font-variant-numeric:tabular-nums; }
#cart-lines .qty{ display:flex; gap:6px; align-items:center; grid-column:1/-1;
  flex-wrap:wrap; min-width:0; }
/* :not(.rm) matters — Remove is also a button inside .qty, and a blanket
   width:24px was clamping it to 24px and clipping the word. */
#cart-lines .qty button:not(.rm){
  width:24px; height:24px; flex:0 0 auto; cursor:pointer;
  background:transparent; border:1px solid var(--pn-red); border-radius:2px;
  color:var(--pn-red); font-family:'Press Start 2P', monospace; font-size:9px;
}
#cart-lines .qty button:hover{ color:var(--pn-signal); border-color:var(--pn-signal); }
#cart-lines .qty span{ font-size:11px; color:var(--pn-ink-strong); min-width:20px; text-align:center;
  font-variant-numeric:tabular-nums; }
#cart-lines .rm{ margin-left:auto; color:var(--pn-ink-faint); font-size:8.5px;
  background:none; border:0; cursor:pointer; letter-spacing:.06em;
  padding:4px 0 4px 8px; white-space:nowrap;
  width:auto; height:auto; flex:0 0 auto; }
#cart-lines .rm:hover{ color:var(--pn-red); }
#cart-empty{ padding:26px 16px; font-size:10px; letter-spacing:.1em; color:var(--pn-ink-faint); }
#checkout-preview{
  flex:0 0 auto; max-height:46%; overflow-y:auto;
  padding:13px 16px; border-top:1px solid var(--pn-red-50);
  background:rgba(255,22,9,.06);
}
#checkout-preview h3{
  font-size:9.5px; letter-spacing:.16em; text-transform:uppercase;
  color:var(--pn-red); margin:0 0 8px;
}
#checkout-preview p{
  font-family:Arial, sans-serif; font-size:11.5px; line-height:1.55;
  color:var(--pn-ink-muted); margin:8px 0 0;
}
#checkout-preview code{
  font-family:'Press Start 2P', monospace; font-size:8.5px;
  color:var(--pn-ink); background:rgba(255,22,9,.14); padding:1px 4px; border-radius:2px;
}
#checkout-preview table{ width:100%; border-collapse:collapse; font-size:10px; }
#checkout-preview td{
  padding:3px 0; color:var(--pn-ink); vertical-align:top;
  font-variant-numeric:tabular-nums;
}
#checkout-preview td:first-child{ width:32px; color:var(--pn-ink-faint); }
#checkout-preview td:last-child{ text-align:right; color:var(--pn-red); white-space:nowrap; }
#checkout-preview .tot td{
  border-top:1px solid var(--pn-hairline); padding-top:7px;
  color:var(--pn-ink-strong); letter-spacing:.08em;
}
#cart-foot{ padding:15px 16px; border-top:1px solid var(--pn-red-50); }
#cart-total{
  display:flex; justify-content:space-between; font-size:12px;
  color:var(--pn-ink-strong); margin-bottom:13px; font-variant-numeric:tabular-nums;
}
#checkout{
  width:100%; font-family:'Press Start 2P', monospace; font-size:11px;
  letter-spacing:.12em; color:var(--pn-void); background:var(--pn-red);
  border:2px solid var(--pn-red); border-radius:var(--pn-radius-sm);
  padding:13px; cursor:pointer;
}
#checkout:hover{ background:transparent; color:var(--pn-red); }
#checkout:focus-visible{ outline:2px solid var(--pn-focus); outline-offset:2px; }

html:not(.js) #cart-toggle, html:not(.js) #cart-panel,
html:not(.js) #cart-backdrop, html:not(.js) .store-item button{ display:none; }

@media screen and (max-width:700px){
  #store-shell{ padding:66px 12px 10px; gap:9px; }
  #store-grid{ gap:14px; grid-template-columns:repeat(auto-fit, minmax(230px, 340px)); }
  /* A 4:3 image plus full copy made the card 433px, so only ONE fit per page
     on a phone and 326px sat empty. Shorter image, clamped description, two
     per page. */
  .store-item img{ aspect-ratio:16/9; }
  .store-item .body{ padding:10px 12px 11px; }
  .store-item h2{ font-size:11px; margin-bottom:6px; }
  .store-item .price{ font-size:12px; margin-bottom:7px; }
  .store-item p{
    font-size:11.5px; line-height:1.5; margin-bottom:11px;
    display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical;
    overflow:hidden;
  }
  .store-item button{ padding:9px; font-size:9px; }
  #store-count{ font-size:8px; min-width:80px; }
  .store-page-btn{ font-size:8px; padding:8px 10px; }
}
/* no JS: pagination cannot work, so let the page scroll and show everything */
html:not(.js) body:has(#store-shell){ overflow:auto; }
html:not(.js) #store-shell{ height:auto; }
html:not(.js) #store-grid{ overflow:visible; }
html:not(.js) #store-pager{ display:none; }
"""

STORE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>P_N0VA - Store</title>
  <script>document.documentElement.classList.add('js');</script>
  <link rel="stylesheet" href="tokens.css?v=__VER__">
  <link rel="stylesheet" href="page-style.css?v=__VER__">
</head>

<body>
  <nav id="navbar">
    <ul>
__NAV__
    </ul>
  </nav>

  <!-- ============================================================
       HOW TO ADD A PRODUCT
       ------------------------------------------------------------
       Copy one <article class="store-item"> block. Everything the
       cart needs lives in its data-* attributes:
           data-id     unique, stable. Never reuse an old id.
           data-name   shown in the cart
           data-price  number only, no currency symbol
       Swap the image and the copy. Descriptions can be any length —
       the card stretches and ADD TO CART stays pinned to the bottom.
       Then bump ?v= on the stylesheet and script links.
       ============================================================ -->

  <main id="store-shell">
    <div id="store-grid">

    <article class="store-item" data-id="pin-gameboy" data-name="Game Boy Pin" data-price="18">
      <img src="images/store/item-1.svg" alt="Layered wood and acrylic Game Boy pin">
      <div class="body">
        <h2>Game Boy Pin</h2>
        <div class="price">$18.00</div>
        <p>Four layers of Baltic birch and clear acrylic over an engraved
           anodized plate. Cut and assembled by hand, so no two are identical.
           Rubber clutch backing.</p>
        <button type="button">Add to cart</button>
      </div>
    </article>

    <article class="store-item" data-id="key-digivice" data-name="Digivice Keychain" data-price="22">
      <img src="images/store/item-2.svg" alt="Digivice keychain">
      <div class="body">
        <h2>Digivice Keychain</h2>
        <div class="price">$22.00</div>
        <p>The same layered build as the pins, fused into a solid loop tab so
           there is no narrow neck to snap. Ships on a split ring.</p>
        <button type="button">Add to cart</button>
      </div>
    </article>

    <article class="store-item" data-id="plate-custom" data-name="Custom Art Plate" data-price="30">
      <img src="images/store/item-3.svg" alt="Custom engraved metal art plate">
      <div class="body">
        <h2>Custom Art Plate</h2>
        <div class="price">$30.00</div>
        <p>Send your own artwork and it gets engraved onto an anodized aluminium
           plate, then set behind the acrylic window of any pin or keychain in
           the store. Allow two weeks.</p>
        <button type="button">Add to cart</button>
      </div>
    </article>

    </div>
    <nav id="store-pager" aria-label="Store pages">
      <button class="store-page-btn" id="store-prev" type="button">&#171; Prev</button>
      <span id="store-count">--</span>
      <button class="store-page-btn" id="store-next" type="button">Next &#187;</button>
    </nav>
  </main>

  <button id="cart-toggle" type="button" aria-haspopup="dialog">
    Cart <span id="cart-count">0</span>
  </button>

  <div id="cart-backdrop" hidden></div>

  <aside id="cart-panel" role="dialog" aria-modal="true" aria-label="Cart" hidden>
    <header>
      <span>Cart</span>
      <button id="cart-close" type="button" aria-label="Close cart">X</button>
    </header>
    <ul id="cart-lines"></ul>
    <div id="cart-empty">Nothing in the cart yet.</div>
    <div id="checkout-preview" role="status" hidden></div>
    <div id="cart-foot">
      <div id="cart-total"><span>Subtotal</span><span id="cart-sum">$0.00</span></div>
      <button id="checkout" type="button">Checkout</button>
    </div>
  </aside>

  <script src="store.js?v=__VER__"></script>
</body>
</html>
"""

STORE_JS = """/* ==========================================================================
   STORE — cart
   Rebuilt 2026.08.02 from the description in PROJECT-HISTORY.md; the original
   was lost when the dev container reset mid-session and never made it into the
   packaged zips.

   Products live in the HTML as data-* attributes. This file never needs
   editing to add one.
   ========================================================================== */
(function () {
  "use strict";

  var KEY = "pn0va-cart";          // same storage key as the original
  var cart = load();

  var el = {
    toggle: document.getElementById("cart-toggle"),
    count:  document.getElementById("cart-count"),
    panel:  document.getElementById("cart-panel"),
    back:   document.getElementById("cart-backdrop"),
    close:  document.getElementById("cart-close"),
    lines:  document.getElementById("cart-lines"),
    empty:  document.getElementById("cart-empty"),
    sum:    document.getElementById("cart-sum"),
    pay:    document.getElementById("checkout")
  };

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch (e) { return {}; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) {}
  }

  /* --- public surface the checkout integration expects ------------------- */
  function cartLines() {
    return Object.keys(cart).map(function (id) {
      return { id: id, name: cart[id].name, price: cart[id].price, qty: cart[id].qty };
    });
  }
  function total() {
    return cartLines().reduce(function (s, l) { return s + l.price * l.qty; }, 0);
  }
  window.cartLines = cartLines;
  window.total = total;

  /* --- rendering --------------------------------------------------------- */
  function render() {
    var lines = cartLines();
    var units = lines.reduce(function (s, l) { return s + l.qty; }, 0);

    el.count.textContent = units;
    el.sum.textContent = money(total());
    el.empty.hidden = lines.length > 0;
    el.pay.disabled = lines.length === 0;

    var pv = document.getElementById("checkout-preview");
    if (pv) pv.hidden = true;          // never show a stale quote

    el.lines.innerHTML = "";
    lines.forEach(function (l) {
      var li = document.createElement("li");
      li.innerHTML =
        '<span class="nm">' + l.name + '</span>' +
        '<span class="ln">' + money(l.price * l.qty) + '</span>' +
        '<span class="qty">' +
          '<button type="button" data-act="dec" aria-label="One fewer">-</button>' +
          '<span>' + l.qty + '</span>' +
          '<button type="button" data-act="inc" aria-label="One more">+</button>' +
          '<button type="button" class="rm" data-act="rm">Remove</button>' +
        '</span>';
      li.dataset.id = l.id;
      el.lines.appendChild(li);
    });
  }

  function add(id, name, price) {
    if (!cart[id]) cart[id] = { name: name, price: price, qty: 0 };
    cart[id].qty++;
    save(); render();
    el.toggle.classList.remove("bump");
    void el.toggle.offsetWidth;          // restart the pulse
    el.toggle.classList.add("bump");
  }

  /* ----------------------------------------------------------------------
     PAGINATION
     The page must not scroll, so items that do not fit go on the next page.
     How many fit is measured, not guessed: one card is laid out, then the
     grid's own column count and the available height decide the rest. This
     re-runs on resize, so rotating a phone repaginates rather than clipping.
     ---------------------------------------------------------------------- */
  var items  = [].slice.call(document.querySelectorAll(".store-item"));
  var grid   = document.getElementById("store-grid");
  var pager  = document.getElementById("store-pager");
  var label  = document.getElementById("store-count");
  var prev   = document.getElementById("store-prev");
  var next   = document.getElementById("store-next");
  var page   = 0, perPage = items.length;

  function measure() {
    items.forEach(function (it) { it.hidden = false; });
    var cols = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
    var card = items[0].getBoundingClientRect().height;
    var gap  = parseFloat(getComputedStyle(grid).rowGap) || 0;
    var rows = Math.max(1, Math.floor((grid.clientHeight + gap) / (card + gap)));
    perPage  = Math.max(1, cols * rows);
  }

  function paint() {
    var pages = Math.max(1, Math.ceil(items.length / perPage));
    if (page >= pages) page = pages - 1;
    items.forEach(function (it, i) {
      it.hidden = Math.floor(i / perPage) !== page;
    });
    pager.hidden = pages < 2;
    label.textContent = "PAGE " + (page + 1) + " / " + pages;
    prev.disabled = page === 0;
    next.disabled = page >= pages - 1;
  }

  function repaginate() { measure(); paint(); }

  prev.addEventListener("click", function () { if (page > 0) { page--; paint(); } });
  next.addEventListener("click", function () {
    if ((page + 1) * perPage < items.length) { page++; paint(); }
  });

  var t;
  window.addEventListener("resize", function () {
    clearTimeout(t); t = setTimeout(repaginate, 150);
  });
  repaginate();

  /* --- wiring ------------------------------------------------------------ */
  document.querySelectorAll(".store-item button").forEach(function (b) {
    b.addEventListener("click", function () {
      var card = b.closest(".store-item");
      add(card.dataset.id, card.dataset.name, parseFloat(card.dataset.price));
    });
  });

  el.lines.addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-act]");
    if (!b) return;
    var id = b.closest("li").dataset.id;
    if (b.dataset.act === "inc") cart[id].qty++;
    else if (b.dataset.act === "dec" && --cart[id].qty < 1) delete cart[id];
    else if (b.dataset.act === "rm") delete cart[id];
    save(); render();
  });

  function open(yes) {
    el.panel.hidden = el.back.hidden = false;
    el.panel.classList.toggle("open", yes);
    el.back.classList.toggle("open", yes);
    if (yes) el.close.focus(); else el.toggle.focus();
  }
  el.toggle.addEventListener("click", function () { open(true); });
  el.close.addEventListener("click", function () { open(false); });
  el.back.addEventListener("click", function () { open(false); });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && el.panel.classList.contains("open")) open(false);
  });

  /* ======================================================================
     CHECKOUT — set CHECKOUT.mode when you are ready to take money.

     "demo"  what ships now. Shows exactly what would be sent, so you can see
             the shape without any account wired up.

     "link"  Square Payment Links. ZERO backend — you make one link per
             product in the Square dashboard and paste the URL below. The
             catch: a payment link is per-product, so it can only check out
             ONE line at a time. Fine for a handful of pins.

     "api"   A real multi-item cart. Needs a small server endpoint that calls
             Square's Orders + Checkout API and returns { url }. Your Square
             ACCESS TOKEN lives there and must NEVER appear in this file —
             anything in here is public.

     See STORE-SETUP.md for step-by-step.
     ====================================================================== */
  var CHECKOUT = {
    mode: "demo",
    currency: "USD",
    // mode "link" — paste one Square payment link per product id
    links: {
      "pin-gameboy":  "",
      "key-digivice": "",
      "plate-custom": ""
    },
    // mode "api" — your endpoint. It receives {lines, currency}, returns {url}
    endpoint: "/api/checkout"
  };

  function money(n){ return "$" + n.toFixed(2); }

  function preview(title, body){
    var box = document.getElementById("checkout-preview");
    box.innerHTML = "<h3>" + title + "</h3>" + body;
    box.hidden = false;
  }

  function checkout(){
    var lines = cartLines();
    if (!lines.length) return;

    if (CHECKOUT.mode === "link"){
      if (lines.length > 1 || lines[0].qty > 1){
        preview("One item at a time",
          "<p>Payment links are per product, so this mode can only check out a " +
          "single item. Switch <code>CHECKOUT.mode</code> to <code>&quot;api&quot;</code> " +
          "for a real multi-item cart.</p>");
        return;
      }
      var url = CHECKOUT.links[lines[0].id];
      if (!url){
        preview("No link set for this product",
          "<p>Add a Square payment link for <code>" + lines[0].id +
          "</code> in <code>CHECKOUT.links</code>.</p>");
        return;
      }
      window.location.href = url;
      return;
    }

    if (CHECKOUT.mode === "api"){
      el.pay.disabled = true;
      el.pay.textContent = "Contacting Square...";
      fetch(CHECKOUT.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: lines, currency: CHECKOUT.currency })
      })
      .then(function(r){ if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function(d){
        if (!d.url) throw new Error("no checkout url returned");
        window.location.href = d.url;                 // Square hosted page
      })
      .catch(function(err){
        el.pay.disabled = false;
        el.pay.textContent = "Checkout";
        preview("Checkout could not start",
          "<p>" + err.message + "</p><p>The cart is untouched — nothing was charged.</p>");
      });
      return;
    }

    /* ---- demo ---- */
    var rows = lines.map(function(l){
      return "<tr><td>" + l.qty + " &times;</td><td>" + l.name +
             "</td><td>" + money(l.price * l.qty) + "</td></tr>";
    }).join("");
    preview("This is what would be sent",
      "<table>" + rows +
      "<tr class='tot'><td></td><td>Total</td><td>" + money(total()) + "</td></tr></table>" +
      "<p>In <b>link</b> mode the browser would go straight to that product’s " +
      "Square payment page. In <b>api</b> mode this cart is POSTed to " +
      "<code>" + CHECKOUT.endpoint + "</code>, which creates a Square order and " +
      "returns a hosted checkout URL to redirect to.</p>" +
      "<p>Nothing was charged. Set <code>CHECKOUT.mode</code> in " +
      "<code>store.js</code> when you are ready.</p>");
  }
  el.pay.addEventListener("click", checkout);

  render();
})();
"""


# ------------------------------------------------------------ clean URLs ---
# pn0va.com/drops instead of pn0va.com/drops.html. Every page except the home
# page becomes its own folder with an index.html inside, so the server can
# serve it from a bare path. That means the pages sit one level deep, so every
# asset path has to become root-relative — which is exactly why this build
# MUST be served and can never be opened by double-clicking a file.

HTACCESS = """# Clean URLs — serve /drops from /drops/index.html
Options -MultiViews
RewriteEngine On

# strip a trailing slash: /drops/ -> /drops
RewriteCond %{REQUEST_FILENAME} -d
RewriteCond %{REQUEST_URI} ^(.+)/$
RewriteRule ^ %1 [R=301,L]

# /drops -> /drops/index.html
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME}/index.html -f
RewriteRule ^(.*)$ $1/index.html [L]

# old URLs keep working
RewriteRule ^index\\.html$      /            [R=301,L]
RewriteRule ^blog\\.html$       /blog        [R=301,L]
RewriteRule ^projects\\.html$   /projects    [R=301,L]
RewriteRule ^about\\.html$      /about       [R=301,L]
RewriteRule ^store\\.html$      /store       [R=301,L]
RewriteRule ^drops\\.html$      /drops       [R=301,L]

# these two were renamed, not just re-pathed
RewriteRule ^geocache\\.html$   /drops       [R=301,L]
RewriteRule ^geocache/?$        /drops       [R=301,L]
RewriteRule ^shop\\.html$       /store       [R=301,L]
RewriteRule ^shop/?$            /store       [R=301,L]

ErrorDocument 404 /
"""


def build_clean(flat: pathlib.Path, with_shop: bool) -> pathlib.Path:
    out = flat.parent / (flat.name + "-clean")
    wipe(out)
    shutil.copytree(flat, out, dirs_exist_ok=True)

    pages = ["blog", "projects", "drops", "about"] + (["store"] if with_shop else [])
    assets = ("style.css", "page-style.css", "drops.css", "reader.css", "tokens.css",
              "script.js", "page-script.js", "reader.js", "drops.js", "store.js")

    def rootify(html: str) -> str:
        # assets -> /asset
        for a in assets:
            html = re.sub(r'(href|src)="' + re.escape(a), r'\1="/' + a, html)
        html = html.replace('="images/', '="/images/').replace('="fonts/', '="/fonts/')
        html = html.replace('="vendor/', '="/vendor/')
        html = html.replace("url('fonts/", "url('/fonts/")
        # data-* attributes on the drop records point at images too
        html = html.replace('="images/', '="/images/')
        # page links -> clean paths
        html = html.replace('href="index.html"', 'href="/"')
        for p in pages:
            html = html.replace(f'href="{p}.html"', f'href="/{p}"')
        return html

    # home page stays at the root
    (out / "index.html").write_text(rootify((out / "index.html").read_text(encoding="utf-8")),
                                    encoding="utf-8", newline=NL)
    # everything else becomes folder/index.html
    for p in pages:
        src = out / f"{p}.html"
        (out / p).mkdir(exist_ok=True)
        (out / p / "index.html").write_text(rootify(src.read_text(encoding="utf-8")),
                                            encoding="utf-8", newline=NL)
        src.unlink()

    # stylesheets are at the root, so their url()s are already root-relative
    for css in ("page-style.css", "drops.css"):
        f = out / css
        if f.exists():
            f.write_text(f.read_text(encoding="utf-8").replace("url('fonts/", "url('/fonts/"),
                         encoding="utf-8", newline=NL)
    # the Animate export loads its atlas by manifest path
    sj = out / "script.js"
    sj.write_text(sj.read_text(encoding="utf-8").replace('src:"images/', 'src:"/images/'),
                  encoding="utf-8", newline=NL)

    (out / ".htaccess").write_text(HTACCESS, encoding="utf-8", newline=NL)
    (out / "READ-ME-FIRST.txt").write_text(
        "This build uses root-relative paths so the URLs can be pn0va.com/drops.\n"
        "It MUST be served by a web server. Opening index.html by double-clicking\n"
        "will show an unstyled page, because /style.css resolves to your drive\n"
        "root. Use the flat build next door for local double-click previews.\n",
        encoding="utf-8", newline=NL)
    return out


def stamp_assets(folder: pathlib.Path):
    """Rewrite every ?v= to a hash of the file it points at.

    A hand-maintained version string only busts the cache if someone remembers
    to bump it — and forgetting is the single worst bug in this site's history
    (new HTML served against stale CSS, twice). Deriving the stamp from the
    bytes makes that failure impossible: change a file, its URL changes.
    """
    import hashlib
    cache: dict[str, str] = {}

    def digest(rel: str) -> str | None:
        if rel not in cache:
            f = folder / rel.lstrip("/")
            cache[rel] = (hashlib.sha1(f.read_bytes()).hexdigest()[:8]
                          if f.is_file() else None)
        return cache[rel]

    pat = re.compile(r'((?:href|src)=")([^"?]+\.(?:css|js))\?v=[^"]*(")')
    for html in folder.rglob("*.html"):
        text = html.read_text(encoding="utf-8")
        def sub(m):
            d = digest(m.group(2))
            return m.group(1) + m.group(2) + (f"?v={d}" if d else "") + m.group(3)
        html.write_text(pat.sub(sub, text), encoding="utf-8", newline=NL)


def check_js(folder: pathlib.Path):
    """Syntax-gate every emitted script.

    The JS in this file lives inside Python strings, so a backslash eaten by
    Python silently produces a broken script that still *looks* fine in the
    source. That shipped once. Never again — if node is around, it checks.
    """
    node = shutil.which("node")
    if not node:
        return "  (node not found — JS not syntax-checked)"
    import subprocess
    bad = []
    for js in sorted(folder.glob("*.js")):
        r = subprocess.run([node, "--check", str(js)], capture_output=True, text=True)
        if r.returncode:
            first = next((l for l in r.stderr.splitlines() if "Error" in l), r.stderr[:90])
            bad.append(f"{js.name}: {first.strip()}")
    if bad:
        sys.exit("\n  JAVASCRIPT IS BROKEN — build aborted:\n    " + "\n    ".join(bad))
    return None


if __name__ == "__main__":
    for flag in (True, False):
        d = build(flag)
        check_js(d)
        stamp_assets(d)
        c = build_clean(d, flag)
        check_js(c)
        stamp_assets(c)
        print(f"  built {d.name:11s} {len(list(d.rglob('*'))):3d} files"
              f"   +  {c.name:17s} {len(list(c.rglob('*'))):3d} files")
    print("\n  flat builds  = double-click previewable")
    print("  -clean       = pn0va.com/drops URLs, must be served")
