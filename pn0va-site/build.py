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

# Link previews and canonical URLs need the public address. Change it here if
# the domain ever moves.
SITE_URL = "https://pn0va.com"

# favicon.ico / favicon.svg / apple-touch-icon.png / og-image.png, cut from the
# logo by tools/make-icons.js. Committed, so the build never needs Node for them.
ICONS = ROOT / "_source/icons"

# What each page says about itself in search results and link previews:
# (clean URL path, description). {store} only reads out on the store build.
PAGE_META = {
    "index.html":    ("", "P_N0VA: a retro JRPG-styled home for writing, projects "
                          "and real-world drops{store}."),
    "blog.html":     ("blog", "Posts from P_N0VA on development, creative projects "
                              "and building this site."),
    "projects.html": ("projects", "Projects by P_N0VA: web, animation and game experiments."),
    "drops.html":    ("drops", "Drops: items P_N0VA has hidden at real locations, each "
                               "with coordinates, a photo hint and a little lore."),
    "store.html":    ("store", "Handmade layered wood and acrylic pins, keychains and "
                               "custom art plates from P_N0VA."),
    "about.html":    ("about", "About P_N0VA, the operator behind the site."),
}


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


def add_head_tags(html: str, page: str, with_shop: bool) -> str:
    """Favicon, description, canonical URL and link-preview tags, after <title>.

    Every page gets the same set, so a shared link to any of them previews
    with the logo instead of bare text.
    """
    from html import escape
    path, desc = PAGE_META[page]
    desc = desc.format(store=", plus a small handmade store" if with_shop else "")
    url = SITE_URL + "/" + path
    # the home page carried a one-line description; this set replaces it
    html = re.sub(r'[ \t]*<meta name="description"[^>]*>\n', "", html)
    m = re.search(r"^([ \t]*)<title>(.*?)</title>[ \t]*\n", html, re.M)
    indent, title = m.group(1), escape(m.group(2))
    desc = escape(desc)
    tags = [
        f'<meta name="description" content="{desc}">',
        f'<link rel="canonical" href="{url}">',
        '<link rel="icon" href="favicon.ico" sizes="32x32">',
        '<link rel="icon" href="favicon.svg" type="image/svg+xml">',
        '<link rel="apple-touch-icon" href="apple-touch-icon.png">',
        '<meta name="theme-color" content="#000000">',
        '<meta property="og:type" content="website">',
        '<meta property="og:site_name" content="P_N0VA">',
        f'<meta property="og:title" content="{title}">',
        f'<meta property="og:description" content="{desc}">',
        f'<meta property="og:url" content="{url}">',
        f'<meta property="og:image" content="{SITE_URL}/images/og-image.png">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        '<meta property="og:image:alt" content="The P_N0VA logo">',
        '<meta name="twitter:card" content="summary_large_image">',
    ]
    return html[:m.end()] + "".join(indent + t + "\n" for t in tags) + html[m.end():]


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

/* The article: the item's own content in a column a comfortable line long,
   centred in the reader (.rd-entry is the same content seen with JavaScript
   off; see the end of this file). Text is set for reading, 16.5px Arial at
   1.72, about 70 characters a line: the brand's 12.5px body size is meant
   for captions and labels, and in a 1,000px panel it ran 150 to a line. */
.rd-reader .rd-panel__body{ padding:24px clamp(16px, 4vw, 48px) 40px; }
.rd-article, .rd-entry{ max-width:44rem; margin:0 auto; }
.rd-article h2, .rd-entry h2{
  font-size:clamp(15px, 1.4vw, 20px); line-height:1.45; letter-spacing:.06em;
  text-transform:uppercase; color:var(--pn-ink-strong); margin:0 0 10px;
  text-shadow:var(--pn-glow-text); text-wrap:balance;
}
.rd-article .rd-meta{
  font-family:var(--pn-face-display); font-size:9px; line-height:1.6; letter-spacing:.16em; text-transform:uppercase;
  color:var(--pn-ink-muted); margin:0 0 22px; padding-bottom:14px; border-bottom:1px solid var(--pn-red-50);
}
.rd-article h3, .rd-entry h3{
  font-size:12px; line-height:1.6; letter-spacing:.1em; text-transform:uppercase;
  color:var(--pn-red); margin:30px 0 12px;
}
.rd-article p, .rd-entry p, .rd-article li, .rd-entry li{
  font-family:var(--pn-face-body); font-size:16.5px; line-height:1.72;
  color:var(--pn-ink); margin:0 0 16px;
}
.rd-article p.date{ display:none; }          /* it is under the title */
.rd-entry p.date{
  font-family:var(--pn-face-display); font-size:9px; letter-spacing:.14em;
  text-transform:uppercase; color:var(--pn-ink-faint); margin:-4px 0 14px;
}
.rd-article ul, .rd-entry ul{ margin:0 0 18px; padding-left:22px; }
.rd-article li, .rd-entry li{ margin-bottom:6px; }
.rd-article li::marker, .rd-entry li::marker{ color:var(--pn-red); }
.rd-article strong, .rd-entry strong{ color:var(--pn-ink-strong); }
.rd-article a, .rd-entry a{ color:var(--pn-red); text-underline-offset:3px; }
.rd-article a:hover, .rd-entry a:hover{ color:var(--pn-signal); }
/* Pictures: the lead one across the column and no taller than 40% of the
   screen, so the words start above the fold; one beside the text floats in
   the column, not out at the panel's far edge. */
.rd-article img, .rd-entry img{ max-width:100%; height:auto; display:block; }
.rd-article .photo-cover, .rd-entry .photo-cover{
  width:100%; height:auto; aspect-ratio:16/7; max-height:40vh; object-fit:cover; margin:0 0 24px;
}
.rd-article .photo-wide, .rd-entry .photo-wide{
  width:100%; height:auto; aspect-ratio:3/1; object-fit:cover; margin:8px 0 22px;
}
.rd-article .photo-right, .rd-entry .photo-right{ float:right; width:min(40%, 260px); height:auto; margin:6px 0 14px 24px; }
.rd-article .photo-left, .rd-entry .photo-left{ float:left; width:min(40%, 260px); height:auto; margin:6px 24px 14px 0; }
.rd-article .photo-inset, .rd-entry .photo-inset{ width:min(80%, 460px); height:auto; margin:26px auto; }

/* the previous and next items, at the article's end */
.rd-next{
  clear:both; display:grid; grid-template-columns:1fr 1fr; gap:12px;
  margin:40px 0 0; padding-top:20px; border-top:1px solid var(--pn-hairline);
}
.rd-next__b{
  display:block; text-align:left; cursor:pointer; font:inherit; color:var(--pn-ink); background:none;
  border:1px solid var(--pn-hairline); border-radius:var(--pn-radius-sm); padding:12px 14px;
  transition:border-color var(--pn-dur-state) ease, background var(--pn-dur-state) ease;
}
.rd-next__b--next{ grid-column:2; text-align:right; }
.rd-next__b .k{
  display:block; font-size:8px; letter-spacing:.16em; text-transform:uppercase;
  color:var(--pn-red); margin-bottom:7px;
}
.rd-next__b .t{ display:block; font-size:10px; letter-spacing:.06em; line-height:1.5; }
.rd-next__b:hover{ border-color:var(--pn-red); background:var(--pn-red-07); }
.rd-next__b:focus-visible{ outline:2px solid var(--pn-focus); outline-offset:2px; }
/* the reader's head says which item of how many, on one line */
.rd-reader .rd-panel__head #rd-title{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }

/* The entries are read from here by reader.js. Hidden only while JavaScript
   runs: without it the reader cannot work, so the entries become the page. */
html.js #rd-data{ display:none; }
html:not(.js) .rd-shell{ display:none; }
html:not(.js) #rd-data{ max-width:900px; margin:0 auto; padding:74px 16px 32px; }
html:not(.js) .rd-entry{
  display:flow-root; margin:0 0 28px; padding:0 0 20px;
  border-bottom:1px solid var(--pn-hairline);
}

@media (max-width:900px){
  /* still no page scroll: manifest becomes a channel strip, reader takes the rest.
     minmax(0,1fr), not 1fr: a 1fr track grows to its widest unbreakable
     content, and the one-line channel strip made the page 786-945px wide
     on a 390px phone, cutting the reader off at the right edge. */
  .rd-shell{
    grid-template-columns:minmax(0,1fr); grid-template-rows:auto minmax(0,1fr);
    padding:58px 10px 10px; gap:8px;
  }
  .rd-manifest .rd-panel__head{ display:none; }
  .rd-manifest .rd-panel__body{ display:flex; overflow-x:auto; overflow-y:hidden; }
  .rd-row{
    width:auto;           /* not the list's 100%: one row filled the strip and
                             hid the rest off-screen */
    grid-template-columns:auto auto; align-items:baseline; gap:6px;
    border-bottom:0; border-right:1px solid var(--pn-divider);
    padding:9px 13px; white-space:nowrap; flex:0 0 auto;
  }
  .rd-row__d{ display:none; }
  .rd-row[aria-current="true"]::before{ width:100%; height:2px; top:auto; bottom:0; }
  .rd-panel__body{ padding:13px 15px 16px; }
  .rd-reader .rd-panel__body{ padding:18px 16px 28px; }
  .rd-article p, .rd-entry p, .rd-article li, .rd-entry li{ font-size:15.5px; line-height:1.65; }
  .rd-article h2, .rd-entry h2{ font-size:15px; }
  /* beside the text there is no room on a phone: the picture takes the width */
  .rd-article .photo-right, .rd-article .photo-left,
  .rd-entry .photo-right, .rd-entry .photo-left{ float:none; width:100%; margin:4px 0 18px; }
  .rd-article .photo-inset, .rd-entry .photo-inset{ width:100%; }
  .rd-next{ grid-template-columns:1fr; }
  .rd-next__b--next{ grid-column:auto; }
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

   Each item has its own address (blog#my-first-blog-post), so one can be
   linked to. Choosing another flies the reader window out and back in with
   it, the About page's flight and after-images, as on the Drops page. The
   article reads in a column a comfortable line long, its date and reading
   time under its title, the previous and next items at its end.

   Keys: left and right change item (up and down too, in the list); up, down,
   Page Up, Page Down and Space scroll the article.

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
  var panel = body.closest(".rd-reader");
  var unit  = (panel && panel.getAttribute("aria-label")) || "Item";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var current = -1;

  function pad(n) { return String(n).padStart(2, "0"); }
  function el(tag, cls, text) {
    var x = document.createElement(tag);
    if (cls) x.className = cls;
    if (text != null) x.textContent = text;
    return x;
  }

  // each item's address: its title in lower case, words joined by dashes
  var slugs = [];
  entries.forEach(function (e, i) {
    var s = (e.dataset.title || "").toLowerCase().normalize("NFKD")
      .replace(/[\\u0300-\\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || String(i + 1);
    var base = s, n = 2;
    while (slugs.indexOf(s) >= 0) s = base + "-" + n++;
    slugs.push(s);
  });

  entries.forEach(function (e, i) {
    var b = el("button", "rd-row");
    b.type = "button";
    b.setAttribute("aria-current", "false");
    b.appendChild(el("span", "rd-row__n", pad(i + 1)));
    b.appendChild(el("span", "rd-row__t", e.dataset.title));
    b.appendChild(el("span", "rd-row__d", e.dataset.date || ""));
    b.addEventListener("click", function () { go(i); });
    rows.appendChild(b);
  });
  if (count) count.textContent = pad(entries.length) + " REC";
  if (date) date.hidden = true;            // the date is under the title now

  function readingTime(e) {
    var words = (e.textContent || "").trim().split(/\\s+/).length;
    return Math.max(1, Math.round(words / 200)) + " min read";
  }

  function show(i, quiet) {
    if (i === current || !entries[i]) return;
    current = i;
    var e = entries[i];
    [].forEach.call(rows.children, function (r, n) {
      r.setAttribute("aria-current", n === i ? "true" : "false");
    });
    title.textContent = unit + " " + pad(i + 1) + " / " + pad(entries.length);
    var art = el("article", "rd-article");
    art.innerHTML = e.innerHTML;
    var meta = el("p", "rd-meta", [e.dataset.date, readingTime(e)].filter(Boolean).join("  \\u00b7  "));
    var h = art.querySelector("h2");
    if (h) h.parentNode.insertBefore(meta, h.nextSibling); else art.insertBefore(meta, art.firstChild);
    art.appendChild(neighbours(i));
    body.textContent = "";
    body.appendChild(art);
    body.scrollTop = 0;                    // a new item starts at the top
    if (!quiet) history.replaceState(history.state, "", "#" + slugs[i]);
    // on a phone the list is a strip: bring the item into it
    var row = rows.children[i];
    if (row && rows.scrollWidth > rows.clientWidth) {
      var a = row.getBoundingClientRect(), b = rows.getBoundingClientRect();
      rows.scrollLeft += (a.left - b.left) - Math.max(0, (b.width - a.width) / 2);
    }
  }

  // the previous and next items, at the end of the article (a div: the
  // site's own menu bar styles every <nav>)
  function neighbours(i) {
    var nav = el("div", "rd-next");
    nav.setAttribute("role", "navigation");
    nav.setAttribute("aria-label", "More " + unit.toLowerCase() + "s");
    [[i - 1, "Previous"], [i + 1, "Next"]].forEach(function (p) {
      var k = p[0];
      if (!entries[k]) { nav.appendChild(el("span")); return; }
      var b = el("button", "rd-next__b rd-next__b--" + p[1].toLowerCase());
      b.type = "button";
      b.appendChild(el("span", "k", p[1] + " " + unit.toLowerCase()));
      b.appendChild(el("span", "t", entries[k].dataset.title));
      b.addEventListener("click", function () { go(k); });
      nav.appendChild(b);
    });
    return nav;
  }

  // One change at a time: the reader flies out and back in with the new
  // item; a newer choice made meanwhile is the one that lands.
  var busy = false, wanted = -1;
  async function go(i) {
    if (!entries[i]) return;
    wanted = i;
    if (busy) return;
    busy = true;
    while (wanted >= 0) {
      var k = wanted; wanted = -1;
      if (k === current) continue;
      var fly = !reduceMotion && panel && window.pn0vaFly;
      if (!fly) { show(k); continue; }
      await fly.exit(panel);
      if (wanted >= 0) { k = wanted; wanted = -1; }
      show(k);
      fly.reset(panel);
      await fly.enter(panel);
    }
    busy = false;
  }

  document.addEventListener("keydown", function (ev) {
    var t = ev.target;
    if (t && t.closest && t.closest("input, textarea, [contenteditable]")) return;
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
    var inList = t && t.closest && t.closest("#rd-rows");
    var step = { ArrowRight: 1, ArrowLeft: -1 }[ev.key] ||
               (inList ? { ArrowDown: 1, ArrowUp: -1 }[ev.key] : 0);
    if (step) {
      var from = wanted >= 0 ? wanted : current, to = from + step;
      if (to >= 0 && to < entries.length) { ev.preventDefault(); go(to); }
      return;
    }
    // the page itself never scrolls: these scroll the article
    var by = { ArrowDown: 48, ArrowUp: -48, PageDown: 0.9, PageUp: -0.9, " ": ev.shiftKey ? -0.9 : 0.9 }[ev.key];
    if (by && !(t && t.closest && t.closest("button, a, summary"))) {
      ev.preventDefault();
      body.scrollBy({ top: Math.abs(by) < 1 ? by * body.clientHeight : by });
    }
  });

  // the address decides the item: on arrival, and when it is changed by hand
  function fromHash() {
    var id = "";
    try { id = decodeURIComponent(location.hash.slice(1)); } catch (e) { /* a mangled address */ }
    return slugs.indexOf(id);
  }
  window.addEventListener("hashchange", function () {
    var i = fromHash();
    if (i >= 0) go(i);
  });
  var first = fromHash();
  show(first >= 0 ? first : 0, true);
})();
"""

def div_blocks(html: str, cls: str) -> list[tuple[str, str]]:
    """(attributes, inner HTML) of every <div class="cls...">, each cut at its
    OWN </div>.

    A non-greedy regex stops at the first </div> it meets. On projects.html
    that was the inner .project wrapper's, so every wrapper lost its closing
    tag and the page shipped with ten unclosed <div>s nested inside each other.
    """
    tag = re.compile(r"<(/?)div\b[^>]*>")
    blocks = []
    for m in re.finditer(r'<div class="' + re.escape(cls) + r'[^"]*"([^>]*)>', html):
        depth = 1
        for t in tag.finditer(html, m.end()):
            depth += -1 if t.group(1) else 1
            if not depth:
                blocks.append((m.group(1), html[m.end():t.start()]))
                break
    return blocks


def build_reader(html: str, unit: str) -> str:
    """Rewrite a paged-window page into the manifest + reader layout."""
    items = div_blocks(html, "page-content")
    if not items:
        return html

    articles = []
    for attrs, inner in items:
        _id = re.search(r'id="([^"]+)"', attrs).group(1)
        subs = [sub for _a, sub in div_blocks(inner, "sub-page")]
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
        '    <section class="rd-panel rd-manifest" aria-label="' + unit + 's" data-fly="left">\n'
        '      <div class="rd-panel__head"><span>' + unit + 's</span>'
        '<span class="rd-idx" id="rd-count">--</span></div>\n'
        '      <div class="rd-panel__body" id="rd-rows"></div>\n'
        '    </section>\n'
        '    <section class="rd-panel rd-reader" aria-label="' + unit + '" data-fly="bottom">\n'
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
        # not the hidden attribute: reader.css hides this only when JS is on,
        # so with JS off the entries read as one long page instead of the
        # reader's two empty frames
        '  <div id="rd-data">\n' + "\n".join(articles) + '\n  </div>')

    start = html.find('<main id="windows"')
    end = html.find("</main>", start) + len("</main>")
    html = html[:start] + shell + html[end:]

    # NOTE: this runs BEFORE the ?v= rewrite, so the version string here is
    # still the ORIGINAL one from the 2026-07-06 build. Match it loosely.
    # page-script.js flies in the two panels (data-fly above). It goes after
    # reader.js, which fills the list the panels are measured with.
    html = re.sub(r'\s*<script src="page-script\.js[^"]*"></script>', '', html)
    html = re.sub(r'<script src="paged-window\.js[^"]*"></script>',
                  '<script src="reader.js"></script>\n'
                  '  <script src="page-script.js?v=' + VER + '"></script>', html)
    html = re.sub(r'(<link rel="stylesheet" href="page-style\.css[^"]*">)',
                  lambda m: m.group(1)
                            + chr(10) + '  <link rel="stylesheet" href="reader.css">',
                  html)
    return html


# Appended to the brand kit's drops.css, so the kit itself stays untouched.
DROPS_BAR_CSS = """
/* --------------------------------------------------------------------------
   FREQUENCY BAR HEIGHT — added by build.py
   drops.css means the bar to "stay about 70px and give the height back to
   the map", but Placed and Elapsed are <dl>s, and a browser gives every <dl>
   1em of margin above and below: the bar was 96px on a desktop and 113px on
   a phone. Without the margins it is 75px and 85px, and the map gets the rest.
   -------------------------------------------------------------------------- */
.dp-bar .dp-readout{ margin:0; }
"""

DROPS_PHONE_CSS = """
/* --------------------------------------------------------------------------
   PHONE FREQUENCY BAR — added by build.py
   One row could not hold DROP #003, both coordinates and the status chip:
   below ~700px they were drawn on top of each other. It is two rows now —
   identity and state on top, the coordinates across the full width below.

   The bar's head also stays. It holds the only "What is a drop?" button,
   so hiding it left phone visitors no way to open the explainer. Only the
   "Frequency" label goes, to make room.
   -------------------------------------------------------------------------- */
@media (max-width:900px){
  /* 1fr lets a single unbreakable line stretch the column, and with it the
     whole page, past the edge of the screen. Pin the column to the screen. */
  .dp-shell, .dp-detail{ grid-template-columns:minmax(0,1fr); }

  .dp-bar .dp-panel__body{
    grid-template-columns:minmax(0,1fr) auto;
    grid-template-areas:"desig meta" "freq freq";
    row-gap:6px;
  }
  .dp-desig{ grid-area:desig; }
  .dp-meta { grid-area:meta; }
  .dp-freq { grid-area:freq; }
  .dp-freq .v{ font-size:clamp(13px,4.3vw,18px); }

  .dp-bar .dp-panel__head{ display:flex; padding:4px 8px 4px 6px; }
  .dp-bar .dp-panel__head > span:first-child{ display:none; }
  .dp-bar .dp-headgroup{ flex:1 1 auto; min-width:0; justify-content:space-between; }
  .dp-bar #dp-rev{ min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

  /* Placed and Elapsed were hidden here "because they live in the help
     panel", which never showed them, so phones had neither. Elapsed fits
     on nearly any phone; the placed date joins it where there is room. */
  .dp-meta .dp-readout:nth-of-type(2){ display:flex; }

  /* The channel strip's rows kept the desktop list's width:100%, so each
     one filled the strip and the others sat off-screen with nothing to
     say they were there. Sized to their content, several show at once. */
  .dp-row{ width:auto; }
}
/* Widths measured with the widest values, DROP #888 and 8888 days: the
   placed date fits from 520px, and below 340px the elapsed readout doesn't. */
@media (min-width:520px) and (max-width:900px){
  .dp-meta .dp-readout:nth-of-type(1){ display:flex; }
}
@media (max-width:339px){
  .dp-meta .dp-readout:nth-of-type(2){ display:none; }
}

/* Laptops (901-1340px): the one-row bar needs ~1,100px, so it overlapped
   itself by up to 175px here too. Same two rows as on phones; the readouts
   wrap inside their cell rather than run into the designation. */
@media (min-width:901px) and (max-width:1340px){
  .dp-bar .dp-panel__body{
    grid-template-columns:auto minmax(0,1fr);
    grid-template-areas:"desig meta" "freq freq";
    row-gap:6px;
  }
  .dp-desig{ grid-area:desig; }
  .dp-meta { grid-area:meta; }
  .dp-freq { grid-area:freq; }
}
"""


# --- the street map: served by this site, not by Carto ----------------------
# Carto began answering keyless tile requests with "API key required", which
# blanked the Drops map. The streets now come from maps/drops.pmtiles (cut from
# OpenStreetMap by tools/make-map.py) and are painted by drops-map.js.
MAP_SRC = ROOT / "_source/map"

DROPS_MAP_CSS = """
/* --------------------------------------------------------------------------
   SELF-HOSTED MAP — added by build.py
   drops-map.js paints the streets in the site palette itself, so the filters
   that bent Carto's tiles toward it (inline in drops.html) must not touch
   the new ones.
   -------------------------------------------------------------------------- */
.dp-mapcanvas .dp-pane-base, .dp-mapcanvas .dp-pane-labels{ filter:none; }

/* No map file yet: rings and marker on plain ground, plus the way out to a
   full map, instead of a grid of error tiles. */
.dp-nomap .dp-map-fallback{
  display:block; position:absolute; left:50%; bottom:26px; transform:translateX(-50%);
  z-index:480; padding:10px 14px; white-space:nowrap;
  background:rgba(0,0,0,.85); border:1px solid var(--pn-hairline);
}
"""


def self_hosted_map_js(js: str) -> str:
    """drops.js: swap Carto's two tile layers for pn0vaBasemap()."""
    js, n = re.subn(r"  /\* Carto ships the ground.*?carto\.com/attributions\">CARTO</a>';\n",
                    "  /* Streets: pn0vaBasemap() in drops-map.js, from maps/drops.pmtiles. */\n",
                    js, count=1, flags=re.S)
    subs = [
        ('    L.tileLayer(TILE_BASE,   { pane:"base",   subdomains:"abcd", maxZoom:20, attribution:ATTR }).addTo(map);\n'
         '    L.tileLayer(TILE_LABELS, { pane:"labels", subdomains:"abcd", maxZoom:20 }).addTo(map);\n',
         '    if (window.pn0vaBasemap) pn0vaBasemap(map);\n'),
        ('      scrollWheelZoom:false, attributionControl:false,\n',
         '      scrollWheelZoom:false, attributionControl:false,\n'
         '      minZoom:8, maxZoom:18,   // the map file holds zooms 8-15; above that it is scaled up\n'),
    ]
    for old, new in subs:
        n += old in js
        js = js.replace(old, new, 1)
    if n != 3 or "cartocdn" in js:
        sys.exit("drops.js changed; update self_hosted_map_js() in build.py")
    return js


def self_hosted_map_html(html: str) -> str:
    """drops.html: load the map renderer and drops-map.js ahead of drops.js."""
    old = '<script src="drops.js'
    if old not in html or "Carto dark · OSM" not in html:
        sys.exit("drops.html changed; update self_hosted_map_html() in build.py")
    # no map file yet: say nothing, so the page doesn't ask for one and 404
    has_map = (MAP_SRC / "drops.pmtiles").exists()
    html = html.replace(old,
        '<script src="vendor/protomaps-leaflet/protomaps-leaflet.js?v=' + VER + '"></script>\n'
        '<script src="drops-map.js?v=' + VER + '"'
        + (' data-map="maps/drops.pmtiles"' if has_map else '') + '></script>\n'
        + old, 1)
    return html.replace("Carto dark · OSM", "OpenStreetMap", 1)


# --- open / claimed: removed ---------------------------------------------------
# Every drop showed OPEN or CLAIMED from a data-status set by hand, so the page
# claimed to know something nobody had confirmed. Drops have no status now; a
# data-status left in drops.html is ignored.
def omit_status_html(html: str) -> str:
    """drops.html: no status chip in the frequency bar, no Open/Recovered tally."""
    html, a = re.subn(r'\n[ \t]*<div class="dp-tally">.*?</div>', "", html, count=1, flags=re.S)
    html, b = re.subn(r'\n[ \t]*<span class="dp-status[^"]*" id="r-status">[^<]*</span>', "",
                      html, count=1)
    if not (a and b):
        sys.exit("drops.html changed; update omit_status_html() in build.py")
    # the how-to comment at the top: data-claimed replaced data-status
    return html.replace('data-status   "open" or "recovered"',
                        'data-claimed  YYYY.MM.DD, only once you know the drop was found:\n'
                        '                        CLAIMED shows on its page, in the lists and\n'
                        '                        on the globe. Leave it off and nothing shows.', 1)


def fly_in_drops(html: str) -> str:
    """drops.html: the About page's window entrance, for the six panels.

    page-script.js flies each one in from the edge it sits against (the list
    from the left, the frequency bar from the top, the map from the right,
    the bottom strip from below). It loads after drops.js, so the list and
    the map are built before anything moves."""
    panels = [('class="dp-panel dp-manifest"', "left", 60),
              ('class="dp-panel dp-codec dp-bar"', "top", 60),
              ('class="dp-panel dp-map dp-scan"', "right", 140),
              ('class="dp-panel dp-slot dp-slot--hint"', "bottom", 140),
              ('class="dp-panel dp-codec dp-brief"', "bottom", 200),
              ('class="dp-panel dp-slot dp-slot--item"', "bottom", 260)]
    for cls, where, delay in panels:
        if html.count(cls) != 1:
            sys.exit("drops.html changed; update fly_in_drops() in build.py")
        html = html.replace(cls, f'{cls} data-fly="{where}" data-fly-delay="{delay}"')
    html, n = re.subn(r'(<script src="drops\.js[^"]*"></script>)',
                      r'\1\n<script src="page-script.js?v=' + VER + '"></script>', html, count=1)
    if not n:
        sys.exit("drops.html changed; update fly_in_drops() in build.py")
    return html


# --- the world view: the Drops page's first screen ----------------------------
# A globe with a point for every drop and the list of drops beside it; choosing
# one dives into the drop's record, all on one page (drops#003 is drop 003).
# drops-world.js does it, with d3-geo. The map it draws is Natural Earth at
# four levels of detail, made once by tools/make-world into _source/world/data;
# the landmarks are _source/world/landmarks.json. The record screen itself is
# the brand kit's, with names and a claimed mark added by drops-world.js.
WORLD_SRC = ROOT / "_source/world"


def world_version() -> str:
    """A hash of the map data, so a browser never keeps a stale piece of it."""
    import hashlib
    h = hashlib.sha1()
    for f in sorted((WORLD_SRC / "data").rglob("*.json")):
        h.update(f.relative_to(WORLD_SRC).as_posix().encode())
        h.update(f.read_bytes())
    return h.hexdigest()[:8]

WORLD_HTML = """
<!-- ============ WORLD: every drop on the globe (drops-world.js) ============
     The first screen. html[data-view] says which one is showing; without
     JavaScript this one stays hidden and the drops read as one long page. -->
<section class="dw-shell" id="dw" aria-label="Drops around the world">
  <section class="dp-panel dw-list" aria-label="Drops" data-fly="left" data-fly-delay="60">
    <div class="dp-panel__head"><span>Drops</span><span class="dp-idx" id="dw-count">&mdash;</span></div>
    <p class="dw-help"><b>Help</b>Pick a drop to fly to it.</p>
    <div class="dp-panel__body" id="dw-rows"></div>
  </section>
  <section class="dp-panel dw-stage" aria-label="World" data-fly="right" data-fly-delay="60">
    <div class="dp-panel__head"><span>World</span>__HELP__</div>
    <div class="dp-panel__body dw-globe" id="dw-globe">
      <canvas id="dw-canvas" aria-hidden="true"></canvas>
      <div class="dw-callout" id="dw-callout" aria-hidden="true" hidden></div>
      <div class="dw-card" id="dw-card" role="group" aria-label="Chosen drop" hidden></div>
    </div>
  </section>
</section>

"""


def world_view(html: str) -> str:
    """drops.html: the world screen, its scripts, and which screen to open on."""
    js_on = "<script>document.documentElement.classList.add('js');</script>"
    help_box = re.search(r'<details class="dp-help" id="dp-help">.*?</details>', html, re.S)
    if html.count(js_on) != 1 or not help_box or html.count('<main class="dp-shell">') != 1:
        sys.exit("drops.html changed; update world_view() in build.py")
    # decided before the page draws, so the other screen never flashes past
    html = html.replace(js_on, js_on + "\n<script>document.documentElement.dataset.view"
                        " = /^#./.test(location.hash) ? \"drop\" : \"world\";</script>", 1)
    # the world has its own "What is a drop?", top right as on a drop: the
    # other lives in a panel that is hidden here
    html = html.replace('<main class="dp-shell">', WORLD_HTML.replace(
        "__HELP__", help_box.group(0).replace('id="dp-help"', 'id="dw-help"')) +
        '<main class="dp-shell">', 1)
    html, n = re.subn(r'(<script src="drops\.js[^"]*"></script>)', lambda m: m.group(1) + "".join(
        f'\n<script src="vendor/world/{lib}.min.js?v={VER}"></script>'
        for lib in ("d3-array", "d3-geo", "topojson-client")) +
        f'\n<script src="drops-world.js?v={VER}" data-world="maps/world/" data-world-v="{world_version()}"'
        f' data-landmarks="maps/landmarks.json"></script>', html, count=1)
    if not n:
        sys.exit("drops.html changed; update world_view() in build.py")
    return html


def drops_api_js(js: str) -> str:
    """drops.js: open on the drop in the address, say when the drop changes,
    let drops-world.js open one, and label the hemispheres properly."""
    subs = [
        ("""    el.lat.textContent    = mag(d.lat);
    el.lng.textContent    = mag(d.lng);
""", """    el.lat.textContent    = mag(d.lat);
    el.lng.textContent    = mag(d.lng);
    /* the unit says which side of the equator and of Greenwich (build.py) */
    el.lat.nextElementSibling.textContent = "\\u00b0" + (+d.lat < 0 ? "S" : "N");
    el.lng.nextElementSibling.textContent = "\\u00b0" + (+d.lng < 0 ? "W" : "E");
"""),
        ("""    moveMap(+d.lat, +d.lng, +(d.zoom || 15));
  }
""", """    moveMap(+d.lat, +d.lng, +(d.zoom || 15));
    document.dispatchEvent(new CustomEvent("pn0va:drop", { detail: { index: i } }));
  }
"""),
        ("""  buildManifest();
  show(0);
  setTimeout(function(){ if (map) map.invalidateSize(); }, 250);
})();""", """  buildManifest();
  /* drops#003 opens on drop 003 (build.py; see drops-world.js) */
  var start = 0;
  entries.forEach(function (e, i) { if ("#" + e.dataset.n === location.hash) start = i; });
  show(start);
  setTimeout(function(){ if (map) map.invalidateSize(); }, 250);

  /* For drops-world.js, which moves between the world view and a drop. */
  window.pn0vaDrops = {
    entries: entries,
    current: function () { return current; },
    map: function () { return map; },
    /* Show drop i in a panel that has just become visible. Size the map
       first: while hidden, Leaflet measured it as nothing. */
    open: function (i) {
      if (map) map.invalidateSize({ pan: false });
      current = -1;
      show(i);
    }
  };
})();"""),
    ]
    for old, new in subs:
        if js.count(old) != 1:
            sys.exit("drops.js changed; update drops_api_js() in build.py")
        js = js.replace(old, new)
    return js


DROPS_WORLD_CSS = """
/* --------------------------------------------------------------------------
   WORLD VIEW — added by build.py (drops-world.js)
   The page's first screen: the list of drops beside a globe. html[data-view]
   says which screen shows; it is set from the address before the page draws
   (drops#003 is a drop), so the other screen never flashes past.
   -------------------------------------------------------------------------- */
html.js[data-view="world"] .dp-shell{ display:none; }
html:not(.js) .dw-shell, html.js:not([data-view="world"]) .dw-shell{ display:none; }

.dw-shell{
  display:grid; grid-template-columns:340px minmax(0,1fr); gap:12px;
  padding:74px 14px 14px; height:100vh; height:100dvh;
  max-width:1400px; margin:0 auto; position:relative; z-index:1;
}
.dw-list .dp-panel__body{ padding:0; overflow-y:auto; }
.dw-help{
  margin:0; padding:11px 12px 10px; border-bottom:1px solid var(--pn-divider);
  font-size:9px; letter-spacing:.16em; text-transform:uppercase; color:var(--pn-ink);
}
.dw-help b{ font-weight:400; color:var(--pn-red); font-size:8px; margin-right:10px; }
.dw-item{ position:relative; border-bottom:1px solid var(--pn-divider); }
.dw-row{
  position:relative; display:grid; grid-template-columns:auto minmax(0,1fr) auto auto;
  column-gap:10px; row-gap:5px; align-items:baseline; width:100%; margin:0; padding:12px 12px 11px;
  background:none; border:0; border-radius:0;
  font:inherit; text-align:left; cursor:pointer; color:var(--pn-ink-muted);
  transition:color var(--pn-dur-state) ease, background var(--pn-dur-state) ease;
}
/* pointed at: marked; chosen: lit, with the bar down its side */
.dw-row:hover{ background:var(--pn-red-07); color:var(--pn-ink); }
.dw-row[aria-current="true"]{ background:var(--pn-red-20); color:var(--pn-signal); }
.dw-item:has(> .dw-row[aria-current="true"])::before{
  content:""; position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--pn-red); z-index:1;
}
/* the second line: the drop's title and the start of its story */
.dw-line{
  grid-column:2 / -1; min-width:0; white-space:normal;
  font-family:var(--pn-face-body); font-size:12px; line-height:1.45; letter-spacing:0; text-transform:none;
  color:var(--pn-ink-muted);
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
}
.dw-row:hover .dw-line, .dw-row[aria-current="true"] .dw-line{ color:var(--pn-ink); }
.dw-row:focus-visible{ outline:2px solid var(--pn-focus); outline-offset:-2px; }
.dw-n{ font-size:12px; letter-spacing:.06em; color:var(--pn-red); font-variant-numeric:tabular-nums; }
.dw-row[aria-current="true"] .dw-n{ color:var(--pn-signal); }
.dw-place{
  font-size:9px; letter-spacing:.12em; text-transform:uppercase; color:var(--pn-ink);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.dw-date{ font-size:9px; letter-spacing:.1em; font-variant-numeric:tabular-nums; }
/* the cut between screens: a red flash that fades (drops-world.js) */
.dw-cut{
  position:fixed; inset:0; z-index:90; pointer-events:none;
  background:radial-gradient(ellipse at 50% 55%, var(--pn-red-30), var(--pn-red-07) 55%, transparent 80%);
  animation:dw-cut .45s ease-out forwards;
}
@keyframes dw-cut{ from{ opacity:1; } to{ opacity:0; } }

/* a menu confirms a choice by flashing it */
.dw-row.is-chosen{ animation:dw-confirm .42s steps(1,end); }
@keyframes dw-confirm{
  0%, 50%{ background:var(--pn-red-60); }
  25%, 75%{ background:var(--pn-red-20); }
}

/* NEW: a drop's first week. Red, like the pointer: it is where to look. */
.dp-new{
  display:inline-block; align-self:center; justify-self:end; padding:3px 4px 2px;
  font-size:7px; line-height:1; letter-spacing:.14em; text-transform:uppercase;
  color:var(--pn-void); background:var(--pn-red); border-radius:2px;
}

/* CLAIMED: the owner's mark (data-claimed in drops.html). In the lists a
   quiet tag; on the drop's page a chip in the frequency bar and a word in
   the item's head. A drop without the mark shows nothing either way. */
.dp-claimed-tag{
  display:inline-block; align-self:center; justify-self:end; padding:2px 4px 1px;
  font-size:7px; line-height:1; letter-spacing:.14em; text-transform:uppercase;
  color:var(--pn-ink-muted); border:1px solid var(--pn-ash); border-radius:2px;
}
.dp-claimed{
  display:inline-flex; align-items:center; gap:.7em; min-height:22px; padding:0 7px; flex:0 0 auto;
  font-size:8px; letter-spacing:.14em; text-transform:uppercase; white-space:nowrap;
  border-radius:2px; border:1px solid var(--pn-red);
  color:var(--pn-red); background:var(--pn-red-07);
}
.dp-claimed[hidden]{ display:none; }
@media (max-width:520px){ .dp-claimed .d{ display:none; } }
/* the item's own head says so too, in red beside its label: the photo is
   left clear, so whoever comes later can still see what was there */
.dp-item-claimed{
  min-width:0; color:var(--pn-red); letter-spacing:.14em;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.dp-item-claimed[hidden]{ display:none; }
/* ...and the photo's tag (IMG-B) beside it stays on one line */
.dp-slot .dp-panel__head > .dp-idx{ flex:0 0 auto; white-space:nowrap; }
@media (max-width:520px){ .dp-item-claimed .d{ display:none; } }

/* One drop at a time: the drop screen has no list of the others (the world
   has that) and no way to step through them, so the record takes the whole
   width. drops-world.js sets dw-ready; should it not run, drops.js's list
   stays, the only way between drops then. */
html.dw-ready .dp-manifest{ display:none; }
html.dw-ready .dp-shell{ grid-template-columns:minmax(0,1fr); }

.dw-stage .dw-globe{ padding:0; position:relative; overflow:hidden; flex:1 1 auto; min-height:0; }
.dw-globe canvas{
  position:absolute; inset:0; width:100%; height:100%; display:block;
  cursor:grab; touch-action:none;
}
.dw-globe::after{             /* the scanline wash from the street map */
  content:""; position:absolute; inset:0; pointer-events:none;
  background:repeating-linear-gradient(to bottom, rgba(0,0,0,.14) 0 1px, transparent 1px 4px);
}
.dw-callout{
  position:absolute; z-index:2; pointer-events:none; padding:6px 9px 5px;
  background:rgba(0,0,0,.82); border:1px solid var(--pn-red); border-radius:2px;
  font-size:8px; line-height:1.8; letter-spacing:.14em; text-transform:uppercase;
  color:var(--pn-ink-muted); white-space:nowrap;
}
.dw-callout[hidden]{ display:none; }
.dw-callout > b{ display:block; font-weight:400; font-size:10px; color:var(--pn-signal); }
.dw-callout:not(.is-drop) > span{ display:block; }     /* a place's lines; a drop's are its details' */
.dw-callout > em{ display:block; font-style:normal; color:var(--pn-red); }

/* A drop's details, wherever they show (the prompt, the popup over its
   point, the row opened on a phone): labels in the pixel face, what they
   say in the body face, which reads at any size. */
.dw-callout.is-drop{ width:max-content; max-width:min(260px, calc(100% - 16px)); white-space:normal; }
.dw-card{ width:max-content; max-width:min(284px, calc(100% - 16px)); white-space:normal; }
.dw-callout .dw-place, .dw-card .dw-place{ display:block; color:var(--pn-ink); white-space:normal; }
.dw-title{
  display:block; margin:3px 0 2px;
  font-family:var(--pn-face-body); font-size:13px; font-style:italic; line-height:1.3;
  letter-spacing:0; text-transform:none; color:var(--pn-ink-strong);
}
.dw-at{ display:block; }
/* when it was placed, and how long ago: one line with a dot between, or
   two where they don't fit, and then no dot (it sits in the gap, and a
   half that wraps takes its dot outside the line, where it is cut off) */
.dw-when{ display:flex; flex-wrap:wrap; column-gap:1.5em; overflow:hidden; }
.dw-when > span{ position:relative; white-space:nowrap; }
.dw-when > span + span::before{ content:"\\00B7"; position:absolute; right:100%; width:1.5em; text-align:center; }
.dw-at{ color:var(--pn-ink); font-variant-numeric:tabular-nums; }
.kv{
  display:block; margin-top:3px;
  font-family:var(--pn-face-body); font-size:12px; line-height:1.4; letter-spacing:0; text-transform:none;
  color:var(--pn-ink);
}
.kv b{
  font-family:var(--pn-face-display); font-weight:400; font-size:7.5px; letter-spacing:.14em;
  text-transform:uppercase; color:var(--pn-red); margin-right:7px;
}
.dw-teaser{
  display:block; margin-top:6px; quotes:"\\201C" "\\201D";
  font-family:var(--pn-face-body); font-size:12px; font-style:italic; line-height:1.45;
  letter-spacing:0; text-transform:none; color:var(--pn-ink-muted);
}

/* The prompt: by the chosen drop whenever the globe is still, all there is
   to say about it and OPEN DROP, the one way into it. It pops in as a menu
   window would, the cursor blinking. */
.dw-card{
  position:absolute; z-index:3; padding:7px 9px 9px;
  background:rgba(0,0,0,.9); border:1px solid var(--pn-red); border-radius:2px;
  box-shadow:0 0 16px var(--pn-red-30);
  font-size:8px; line-height:1.8; letter-spacing:.14em; text-transform:uppercase;
  color:var(--pn-ink-muted);
}
.dw-card[hidden]{ display:none; }
.dw-card > b{ display:block; padding-right:24px; font-weight:400; font-size:10px; color:var(--pn-signal); }
.dw-card > em{ display:block; font-style:normal; color:var(--pn-red); }
.dw-card.is-in{ animation:dw-card-in .16s ease-out; }
@keyframes dw-card-in{ from{ opacity:0; transform:translateY(5px) scale(.97); } }
.dw-open{
  display:flex; align-items:center; gap:8px; margin-top:8px; min-height:30px; padding:0 12px 0 9px;
  font-size:9px; letter-spacing:.16em; color:var(--pn-ink-strong); text-decoration:none;
  background:var(--pn-red-07); border:2px solid var(--pn-red); border-radius:var(--pn-radius-sm);
  transition:color var(--pn-dur-state) ease, background var(--pn-dur-state) ease,
             box-shadow var(--pn-dur-state) ease;
}
.dw-open .cur{ color:var(--pn-red); font-size:10px; animation:dw-cursor 1.05s steps(1,end) infinite; }
@keyframes dw-cursor{ 50%{ opacity:0; } }
.dw-open:hover{ color:var(--pn-signal); background:var(--pn-red-20); box-shadow:var(--pn-glow-hover); }
.dw-open:focus-visible{ outline:2px solid var(--pn-focus); outline-offset:2px; }
@media (prefers-reduced-motion:reduce){ .dw-card.is-in, .dw-open .cur{ animation:none; } }
/* OPEN DROP sits beside ZOOM IN (ZOOM OUT once the globe is as close as it
   goes); the x at the prompt's corner closes it. */
.dw-acts{ display:flex; gap:6px; margin-top:9px; }
.dw-acts > *{ flex:1 1 auto; min-width:0; margin:0; justify-content:center; white-space:nowrap; }
.dw-acts .dw-open{ font-size:8.5px; letter-spacing:.12em; }
.dw-zoomto{
  display:flex; align-items:center; gap:6px; min-height:30px; padding:0 9px;
  font:inherit; font-size:8.5px; letter-spacing:.12em; text-transform:uppercase; cursor:pointer;
  color:var(--pn-ink); background:none; border:1px solid var(--pn-red-50); border-radius:var(--pn-radius-sm);
  transition:color var(--pn-dur-state) ease, background var(--pn-dur-state) ease,
             border-color var(--pn-dur-state) ease;
}
.dw-zoomto svg{ width:13px; height:13px; flex:0 0 auto; fill:none; stroke:var(--pn-red); stroke-width:1.5; }
.dw-zoomto:hover{ color:var(--pn-signal); border-color:var(--pn-red); background:var(--pn-red-07); }
.dw-zoomto:focus-visible{ outline:2px solid var(--pn-focus); outline-offset:2px; }
.dw-x{
  position:absolute; top:4px; right:4px; width:26px; height:26px; padding:0;
  display:grid; place-items:center; cursor:pointer;
  color:var(--pn-ink-muted); background:none; border:0; border-radius:2px;
}
.dw-x svg{ width:10px; height:10px; fill:none; stroke:currentColor; stroke-width:1.6; }
.dw-x:hover{ color:var(--pn-signal); background:var(--pn-red-20); }
.dw-x:focus-visible{ outline:2px solid var(--pn-focus); outline-offset:-2px; }
/* On a phone the chosen row opens up underneath (drops-world.js): the rest
   of the details and its OPEN DROP, the width of the list, a thumb's height. */
.dw-more{
  padding:2px 14px 14px 46px; background:var(--pn-red-07);
  font-size:8px; line-height:1.8; letter-spacing:.14em; text-transform:uppercase;
  color:var(--pn-ink-muted);
}
.dw-more[hidden]{ display:none; }
.dw-more > em{ display:block; font-style:normal; color:var(--pn-red); }
.dw-more .dw-title{ margin-top:0; }
.dw-more .dw-acts{ margin:10px 0 0 -32px; }      /* out under the number: room for both */
.dw-more .dw-acts > *{ min-height:44px; font-size:9px; }
.dw-more .dw-teaser{ display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.dw-item.is-open .dw-line{ display:none; }       /* the details say it in full */

/* zoom: + and - a doubling at a time, the globe back to the whole globe.
   Drawn like the street map's own controls, bars rather than glyphs. */
.dw-zoom{
  position:absolute; left:10px; top:10px; z-index:3;
  display:flex; flex-direction:column;
}
.dw-zoom button{
  position:relative; display:grid; place-items:center;
  width:28px; height:28px; padding:0; cursor:pointer; font:inherit;
  background:rgba(0,0,0,.85); color:var(--pn-red);
  border:1px solid var(--pn-hairline); border-radius:0;
  transition:color var(--pn-dur-state) ease;
}
.dw-zoom .dw-zoom-out{ border-top:0; }
.dw-zoom .dw-zoom-all{ margin-top:6px; }
.dw-zoom .dw-zoom-in::before, .dw-zoom .dw-zoom-in::after, .dw-zoom .dw-zoom-out::before{
  content:""; position:absolute; left:50%; top:50%; background:currentColor;
}
.dw-zoom .dw-zoom-in::before, .dw-zoom .dw-zoom-out::before{ width:11px; height:2px; margin:-1px 0 0 -5.5px; }
.dw-zoom .dw-zoom-in::after{ width:2px; height:11px; margin:-5.5px 0 0 -1px; }
.dw-zoom svg{ width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:1.3; }
.dw-zoom button:hover{ color:var(--pn-signal); }
.dw-zoom button[aria-disabled="true"]{ color:var(--pn-ink-faint); cursor:default; }
.dw-zoom button:focus-visible{ outline:2px solid var(--pn-focus); outline-offset:2px; }

/* WORLD MAP: the way back, heading the drop's top bar where the word
   "Frequency" was. The loudest thing on the screen: solid red with black
   letters (as NEW is), a back arrow and the globe, and Esc beside them for
   keyboards. */
.dp-bar .dp-panel__head > .dp-world-back + span{ display:none; }
.dp-world-back, .dw-home{
  display:flex; align-items:center; gap:9px; flex:0 0 auto;
  margin:0; min-height:38px; padding:0 14px 0 10px; cursor:pointer; text-align:left;
  font:inherit; font-size:10px; letter-spacing:.16em; text-transform:uppercase; white-space:nowrap;
  color:var(--pn-void); background:var(--pn-red);
  border:2px solid var(--pn-red); border-radius:var(--pn-radius-sm);
  box-shadow:0 0 18px var(--pn-red-50);
  transition:box-shadow var(--pn-dur-state) ease, filter var(--pn-dur-state) ease;
}
.dp-world-back .arr, .dw-home .arr{ font-size:9px; }
.dp-world-back svg, .dw-home svg{
  width:17px; height:17px; flex:0 0 auto;
  fill:none; stroke:var(--pn-void); stroke-width:1.4;
}
.dp-world-back .key, .dw-home .key{
  margin-left:4px; padding:3px 4px 2px; font-size:7px; letter-spacing:.1em;
  color:var(--pn-void); border:1px solid rgba(0,0,0,.45); border-radius:2px;
}
.dp-world-back:hover, .dw-home:hover{ filter:brightness(1.12); box-shadow:var(--pn-glow-hover); }
.dp-world-back:focus-visible, .dw-home:focus-visible{ outline:2px solid var(--pn-focus); outline-offset:3px; }
@media (pointer:coarse){ .dp-world-back .key, .dw-home .key{ display:none; } }

/* Where a drop's page scrolls (a phone; any screen under 560px tall) the
   bar's head scrolls away with it, so there the way back floats at the
   foot of the screen instead, a thumb's size, over everything but the
   help, and the page keeps room under its last line for it. */
.dw-home{ display:none; }
@media (max-width:900px), (max-height:560px){
  html.dw-ready .dp-bar .dp-world-back{ display:none; }
  html.js[data-view="drop"] .dw-home{
    display:flex; position:fixed; z-index:400; left:50%; bottom:max(14px, env(safe-area-inset-bottom));
    transform:translateX(-50%); min-height:48px; padding:0 20px 0 16px; font-size:11px;
    animation:dw-home-in .3s ease-out .35s both;
  }
  html:has(.dp-help[open]) .dw-home{ display:none; }
  html.dw-ready .dp-shell{ padding-bottom:84px; }
}
@keyframes dw-home-in{ from{ opacity:0; transform:translate(-50%, 18px); } }
@media (prefers-reduced-motion:reduce){ html.js[data-view="drop"] .dw-home{ animation:none; } }

/* ...and on the street map, the globe under recentre */
.dp-recenter.dp-to-world a{ display:grid; place-items:center; text-indent:0; }
.dp-recenter.dp-to-world a::before, .dp-recenter.dp-to-world a::after{ content:none; }
.dp-recenter.dp-to-world svg{ width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:1.3; }

@media (max-width:900px){
  .dw-shell{
    grid-template-columns:minmax(0,1fr); grid-template-rows:minmax(0,1.2fr) minmax(0,1fr);
    padding:58px 10px 10px; gap:8px;
  }
  .dw-stage{ order:-1; }
  .dw-row{ padding:11px 12px 10px; }
  .dw-line{ -webkit-line-clamp:1; }
  .dw-list .dw-help{ display:none; }          /* the opened row says what to do */
  .dw-zoom button{ width:40px; height:40px; }
  .dw-open{ min-height:40px; }
  /* The drop screen: no strip of drops above the bar now, so the record
     starts at the top. The way back floats at the foot of the screen (see
     WORLD MAP); the help is the bar's "?", and the drop's place name loses
     its "Memory ·". */
  html.dw-ready .dp-shell{ grid-template-rows:minmax(0,1fr); }
  .dp-bar .dp-help > summary{ min-height:36px; min-width:36px; justify-content:center; padding:0; }
  .dp-bar .dp-help > summary .lbl{ display:none; }
  .dp-bar #dp-rev{ font-size:0; letter-spacing:0; }
  .dp-bar #r-place{
    display:inline-block; max-width:100%; vertical-align:bottom; font-size:9px; letter-spacing:.14em;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  }
}

/* --------------------------------------------------------------------------
   A DROP ON A PHONE — a page that scrolls, so nothing is left out. Held to
   one screen it dropped the hint and item photos on every phone under 680px
   tall (an iPhone in Safari among them) and left the brief two lines in a
   box. The street map keeps half the screen; the photos sit side by side
   under it, and the brief reads in full. (The world stays one screen.)
   -------------------------------------------------------------------------- */
@media (max-width:900px){
  html.js[data-view="drop"] body:has(.dp-shell){ overflow:auto; }
  html.dw-ready .dp-shell{ height:auto; min-height:100vh; min-height:100dvh; grid-template-rows:auto; }
  html.dw-ready .dp-detail{ grid-template-rows:auto auto auto; }
  html.dw-ready .dp-map{ height:52vh; height:52svh; min-height:240px; }
  html.dw-ready .dp-strip{
    grid-template-columns:minmax(0,1fr) minmax(0,1fr); grid-template-areas:"hint item" "brief brief";
  }
  html.dw-ready .dp-slot{ display:flex; height:auto; }
  html.dw-ready .dp-slot .dp-panel__body{ flex:0 0 auto; aspect-ratio:4/3; }
  html.dw-ready .dp-brief{ height:auto; }
  html.dw-ready .dp-brief .dp-panel__body{ overflow:visible; }
  html.dw-ready .dp-brief .dp-panel__body p{ font-size:14px; line-height:1.6; }
}

/* --------------------------------------------------------------------------
   ON ITS SIDE — a phone held sideways is wide and short. Stacked, the globe
   was a strip 120px tall over a list no taller, too short for the chosen
   drop's row to open in: they sit side by side instead, as on a desktop,
   each the full height. A drop's photos flank its brief, as on a desktop,
   rather than each filling the screen.
   -------------------------------------------------------------------------- */
@media (max-width:900px) and (min-width:560px) and (orientation:landscape){
  .dw-shell{ grid-template-columns:minmax(270px,40%) minmax(0,1fr); grid-template-rows:minmax(0,1fr); }
  .dw-stage{ order:0; }
  html.dw-ready .dp-strip{
    grid-template-columns:minmax(0,.82fr) minmax(0,2fr) minmax(0,.82fr); grid-template-areas:"hint brief item";
  }
}

/* A wide screen that is short (a big phone on its side, a window halved):
   the drop's page scrolls, rather than squeezing the street map to a
   sliver between the bar and the photos. */
@media (min-width:901px) and (max-height:560px){
  html.js[data-view="drop"] body:has(.dp-shell){ overflow:auto; }
  html.dw-ready .dp-shell{ height:auto; min-height:100vh; min-height:100dvh; }
  html.dw-ready .dp-detail{ grid-template-rows:auto max(280px, 64vh) clamp(164px,23vh,212px); }
}
"""


def omit_status_js(js: str) -> str:
    """drops.js: rows without OPEN / CLAIMED, and nothing written to the
    chip and tally omit_status_html() removed."""
    subs = [
        ("""'<span class="dp-row__d">' + e.dataset.placed + '</span>' +
        '<span class="dp-row__s ' + (live ? "is-open" : "is-done") + '">' +
          (live ? "OPEN" : "CLAIMED") + '</span>';
""", """'<span class="dp-row__d">' + e.dataset.placed + '</span>';
"""),
        ("""    el.open.textContent  = open;
    el.done.textContent  = entries.length - open;
""", ""),
        ("""    el.status.textContent = live ? "Open" : "Claimed";
    el.status.className   = "dp-status " + (live ? "dp-status--open" : "dp-status--done");
""", ""),
    ]
    for old, new in subs:
        if old not in js:
            sys.exit("drops.js changed; update omit_status_js() in build.py")
        js = js.replace(old, new, 1)
    return js


# Appended to style.css (home page only).
HOME_CSS = """
/* Keyboard focus — added by build.py. TAP TO ENTER takes focus on load so
   Enter and Space work at once; it draws no outline, by design: the words
   are the only thing on screen and already say what to do. */
#start-overlay:focus{ outline:none; }
.menu-item:focus-visible{ outline:2px solid var(--pn-focus); outline-offset:2px; }
"""


def keyboard_start(html: str) -> str:
    """Make TAP TO ENTER work from a keyboard.

    The overlay was a bare <div> with a click handler, and the menu stays
    display:none until that handler runs, so without a mouse or a touch
    screen the home page was a dead end: nothing to Tab to, nothing for
    Enter to press.
    """
    subs = [
        ('<div id="start-overlay">',
         '<div id="start-overlay" role="button" tabindex="0">'),
        ('<div id="animation_container" style=',
         '<div id="animation_container" role="img" aria-label="P_N0VA logo" style='),
        ("    startOverlay.addEventListener('click', function()\n",
         "    // Enter or Space press it too. It takes focus on load, and a\n"
         "    // keyboard start passes focus on to the first menu item.\n"
         "    let byKeyboard = false;\n"
         "    startOverlay.addEventListener('keydown', function(e)\n"
         "    {\n"
         "      if (e.key !== 'Enter' && e.key !== ' ') return;\n"
         "      e.preventDefault();\n"
         "      byKeyboard = true;\n"
         "      startOverlay.click();\n"
         "    });\n"
         "    startOverlay.focus();\n"
         "\n"
         "    startOverlay.addEventListener('click', function()\n"),
        ("          menu.classList.add('show');\n",
         "          menu.classList.add('show');\n"
         "          if (byKeyboard) menu.querySelector('a').focus();\n"),
        # a second click (or Enter) ran init() again on top of the first
        ("    }); // end of click\n", "    }, { once: true }); // end of click\n"),
    ]
    for old, new in subs:
        if old not in html:
            sys.exit("index.html changed; update keyboard_start() for:\n  " + old.strip())
        html = html.replace(old, new, 1)
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
    drops = world_view(fly_in_drops(omit_status_html(self_hosted_map_html(drops))))
    (out / "drops.html").write_text(drops, encoding="utf-8", newline=NL)

    # No FIREFLY_CSS here: the living layer belongs to the home page only.
    # Interior pages are pure instrument — a firefly drifting over a map you
    # are trying to read is atmosphere in the wrong place.
    shutil.copy(BRAND / "drops/drops.css", out / "drops.css")
    (out / "drops.css").write_text((out / "drops.css").read_text(encoding="utf-8")
                                   + DROPS_BAR_CSS + DROPS_PHONE_CSS + DROPS_MAP_CSS
                                   + DROPS_WORLD_CSS, encoding="utf-8", newline=NL)
    (out / "drops.js").write_text(
        drops_api_js(omit_status_js(self_hosted_map_js(
            (BRAND / "drops/drops.js").read_text(encoding="utf-8")))),
        encoding="utf-8", newline=NL)
    shutil.copy(MAP_SRC / "drops-map.js", out / "drops-map.js")
    (out / "vendor/protomaps-leaflet").mkdir(parents=True, exist_ok=True)
    for f in ("protomaps-leaflet.js", "protomaps-leaflet.LICENSE"):
        shutil.copy(MAP_SRC / "vendor" / f, out / "vendor/protomaps-leaflet" / f)
    # the world view: its script, d3-geo and friends, the map and the landmarks
    shutil.copy(WORLD_SRC / "drops-world.js", out / "drops-world.js")
    shutil.copytree(WORLD_SRC / "vendor", out / "vendor/world", dirs_exist_ok=True)
    (out / "maps").mkdir(exist_ok=True)
    shutil.copytree(WORLD_SRC / "data", out / "maps/world", dirs_exist_ok=True)
    shutil.copy(WORLD_SRC / "landmarks.json", out / "maps/landmarks.json")
    shutil.copy(WORLD_SRC / "world-atlas.LICENSE", out / "maps/world.LICENSE")
    # the map itself exists once tools/make-map.py has been run
    if (MAP_SRC / "drops.pmtiles").exists():
        (out / "maps").mkdir(exist_ok=True)
        shutil.copy(MAP_SRC / "drops.pmtiles", out / "maps/drops.pmtiles")
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
        migrate_css((out / "style.css").read_text(encoding="utf-8")) + HOME_CSS,
        encoding="utf-8", newline=NL)

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
            html = keyboard_start(html)
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

    # --- icons & link previews ------------------------------------------------
    # There was no favicon (a blank tab, and /favicon.ico fell through to
    # ErrorDocument and came back as the home page) and no og: tags (a shared
    # link previewed as bare text). Both now come from the logo itself.
    for name in ("favicon.ico", "favicon.svg", "apple-touch-icon.png"):
        shutil.copy(ICONS / name, out / name)
    shutil.copy(ICONS / "og-image.png", out / "images/og-image.png")
    for page in PAGES + ["drops.html"] + (["store.html"] if with_shop else []):
        f = out / page
        f.write_text(add_head_tags(f.read_text(encoding="utf-8"), page, with_shop),
                     encoding="utf-8", newline=NL)

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
  font-family:Arial, sans-serif; font-size:14px; line-height:1.6;
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

/* back from Square: a notice over the grid, so pagination is not disturbed */
#store-thanks{
  position:fixed; top:66px; left:50%; transform:translateX(-50%); z-index:125;
  width:min(560px, calc(100vw - 24px));
  display:flex; align-items:center; gap:12px; padding:12px 14px;
  background:var(--pn-surface-alt); border:2px solid var(--pn-red);
  border-radius:var(--pn-radius-sm); box-shadow:var(--pn-glow-window);
}
#store-thanks[hidden]{ display:none; }
#store-thanks p{
  flex:1 1 auto; margin:0; font-family:Arial, sans-serif; font-size:12.5px;
  line-height:1.5; color:var(--pn-ink-strong);
}
#store-thanks button{
  flex:0 0 auto; background:none; border:1px solid var(--pn-red); border-radius:2px;
  color:var(--pn-red); font-family:'Press Start 2P', monospace; font-size:10px;
  padding:6px 9px; cursor:pointer;
}
#store-thanks button:hover{ color:var(--pn-signal); border-color:var(--pn-signal); }
#store-thanks button:focus-visible{ outline:2px solid var(--pn-focus); outline-offset:2px; }

@media screen and (max-width:700px){
  #store-shell{ padding:66px 12px 8px; gap:9px; }
  #store-grid{ gap:14px; grid-template-columns:repeat(auto-fit, minmax(230px, 340px)); }
  /* A 4:3 image plus full copy made the card 433px, so only ONE fit per page
     on a phone and 326px sat empty. Shorter image and a description clamped
     to four readable lines: two per page on a tall phone, one on the rest. */
  .store-item img{ aspect-ratio:16/9; }
  .store-item .body{ padding:10px 12px 11px; }
  .store-item h2{ font-size:11px; margin-bottom:6px; }
  .store-item .price{ font-size:12px; margin-bottom:7px; }
  .store-item p{
    font-size:13.5px; line-height:1.5; margin-bottom:11px;
    display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical;
    overflow:hidden;
  }
  .store-item button{ padding:9px; font-size:9px; }
  /* a bar along the bottom: the pager on the left, the cart on the right
     (centred on the same line), so the cart never covers NEXT */
  #store-pager{ justify-content:flex-start; gap:8px; height:48px; padding:0 140px 0 2px; }
  .store-page-btn{ min-width:44px; height:36px; padding:0 10px; font-size:9px; }
  .store-page-btn .pg-word{ display:none; }
  #store-count{ font-size:8px; min-width:0; white-space:nowrap; }
  #cart-toggle{ right:12px; bottom:10px; height:44px; padding:0 14px; }
}
@media screen and (max-width:360px){
  #store-count .pg-word{ display:none; }
}
/* too short for one card (store.js decides): the page scrolls instead */
html.js body:has(#store-shell.scrolls){ overflow:auto; }
#store-shell.scrolls{ height:auto; }
#store-shell.scrolls #store-grid{ overflow:visible; }
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
    <div id="store-grid" data-fly-each="bottom">

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
    <!-- not a <nav>: the site's menu bar styles every <nav>, and pinned this
         over the menu at the top of the screen -->
    <div id="store-pager" role="navigation" aria-label="Store pages">
      <button class="store-page-btn" id="store-prev" type="button" aria-label="Previous page">&#171;<span class="pg-word"> Prev</span></button>
      <span id="store-count">--</span>
      <button class="store-page-btn" id="store-next" type="button" aria-label="Next page"><span class="pg-word">Next </span>&#187;</button>
    </div>
  </main>

  <!-- shown by store.js when Square sends the buyer back with ?paid=1 -->
  <div id="store-thanks" role="status" hidden>
    <p>Thank you! Your payment went through. Square will email your receipt.</p>
    <button id="store-thanks-close" type="button" aria-label="Dismiss">X</button>
  </div>

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
  <script src="page-script.js?v=__VER__"></script>
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

  /* The products on THIS page are the only source of names and prices. A
     saved cart is reduced to ids and quantities and re-priced from the page
     on every load, so a price change reaches returning visitors (who were
     otherwise shown the old price while Square charged the new one), items
     since removed from the page drop out, and nothing typed into
     localStorage ever reaches the page as markup. */
  var products = {};
  [].forEach.call(document.querySelectorAll(".store-item"), function (it) {
    products[it.dataset.id] = { name: it.dataset.name, price: parseFloat(it.dataset.price) };
  });
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
    var saved, clean = {};
    try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch (e) { saved = {}; }
    Object.keys(saved).forEach(function (id) {
      var p = products[id], qty = parseInt(saved[id] && saved[id].qty, 10);
      if (p && qty > 0) clean[id] = { name: p.name, price: p.price, qty: Math.min(qty, 99) };
    });
    return clean;
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
      // fixed markup only; every value goes in as text
      li.innerHTML =
        '<span class="nm"></span><span class="ln"></span>' +
        '<span class="qty">' +
          '<button type="button" data-act="dec">-</button>' +
          '<span></span>' +
          '<button type="button" data-act="inc">+</button>' +
          '<button type="button" class="rm" data-act="rm">Remove</button>' +
        '</span>';
      li.querySelector(".nm").textContent = l.name;
      li.querySelector(".ln").textContent = money(l.price * l.qty);
      li.querySelector(".qty span").textContent = l.qty;
      // name the product, or a screen reader hears "One more" on every line
      li.querySelector('[data-act="dec"]').setAttribute("aria-label", "One fewer " + l.name);
      li.querySelector('[data-act="inc"]').setAttribute("aria-label", "One more " + l.name);
      li.querySelector(".rm").setAttribute("aria-label", "Remove " + l.name);
      li.dataset.id = l.id;
      el.lines.appendChild(li);
    });
  }

  function add(id) {
    var p = products[id];
    if (!p) return;
    if (!cart[id]) cart[id] = { name: p.name, price: p.price, qty: 0 };
    if (cart[id].qty < 99) cart[id].qty++;
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
  var shell  = document.getElementById("store-shell");
  var grid   = document.getElementById("store-grid");
  var pager  = document.getElementById("store-pager");
  var label  = document.getElementById("store-count");
  var prev   = document.getElementById("store-prev");
  var next   = document.getElementById("store-next");
  var page   = 0, perPage = items.length;

  function measure() {
    shell.classList.remove("scrolls");
    items.forEach(function (it) { it.hidden = false; });
    var cols = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
    // the tallest card, so a row with a long description is not cut off
    var card = Math.max.apply(null, items.map(function (it) {
      return it.getBoundingClientRect().height;
    }));
    var gap  = parseFloat(getComputedStyle(grid).rowGap) || 0;
    function fit() {
      var rows = Math.max(1, Math.floor((grid.clientHeight + gap) / (card + gap)));
      return Math.max(1, cols * rows);
    }
    // the pager takes a row of its own, so it is only shown when needed
    pager.hidden = true;
    perPage = fit();
    if (perPage < items.length) { pager.hidden = false; perPage = fit(); }
    // a screen too short for even one card (a phone on its side) has no
    // pages: the store scrolls like any other page instead of cutting the
    // card's ADD TO CART off
    if (card > grid.clientHeight) {
      shell.classList.add("scrolls");
      perPage = items.length;
    } else if (window.scrollY) {
      window.scrollTo(0, 0);           // back from scrolling: the top again
    }
  }

  function paint() {
    var pages = Math.max(1, Math.ceil(items.length / perPage));
    if (page >= pages) page = pages - 1;
    items.forEach(function (it, i) {
      it.hidden = Math.floor(i / perPage) !== page;
    });
    pager.hidden = pages < 2;
    var word = document.createElement("span");
    word.className = "pg-word"; word.textContent = "PAGE ";
    label.replaceChildren(word, (page + 1) + " / " + pages);
    prev.disabled = page === 0;
    next.disabled = page >= pages - 1;
  }

  function repaginate() { measure(); paint(); }

  /* A page turn is the same flight as the windows on arrival: this page's
     cards fly out and the next page's fly in. A click made meanwhile decides
     the page that lands. Without motion the page just changes. */
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var turning = false, wanted = -1;
  function turn(by) {
    var to = (wanted >= 0 ? wanted : page) + by;
    if (to < 0 || to * perPage >= items.length) return;
    wanted = to;
    if (turning) return;
    var fly = !reduceMotion && window.pn0vaFly;
    if (!fly) { page = wanted; wanted = -1; paint(); return; }
    turning = true;
    (function step() {
      if (wanted < 0) { turning = false; return; }
      fly.exit(grid).then(function () {
        page = wanted; wanted = -1;
        paint();
        // the cards just flown out stay off-screen until this clears them
        items.forEach(function (it) {
          it.style.transition = it.style.transform = it.style.willChange = "";
        });
        return fly.enter(grid);
      }).then(step);
    })();
  }
  prev.addEventListener("click", function () { turn(-1); });
  next.addEventListener("click", function () { turn(1); });

  var t;
  window.addEventListener("resize", function () {
    clearTimeout(t); t = setTimeout(repaginate, 150);
  });
  repaginate();

  /* --- wiring ------------------------------------------------------------ */
  document.querySelectorAll(".store-item button").forEach(function (b) {
    b.addEventListener("click", function () {
      add(b.closest(".store-item").dataset.id);
    });
  });

  el.lines.addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-act]");
    if (!b) return;
    var id = b.closest("li").dataset.id;
    if (b.dataset.act === "inc") { if (cart[id].qty < 99) cart[id].qty++; }
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

  function esc(s){
    var d = document.createElement("div");
    d.textContent = String(s);
    return d.innerHTML;
  }

  function preview(title, body){
    var box = document.getElementById("checkout-preview");
    box.innerHTML = "<h3>" + esc(title) + "</h3>" + body;
    box.hidden = false;
  }

  /* Customers see these panels, so they speak to customers. Notes meant for
     the owner (which mode is on, what to configure) go to the console. */
  function checkout(){
    var lines = cartLines();
    if (!lines.length) return;

    if (CHECKOUT.mode === "link"){
      if (lines.length > 1 || lines[0].qty > 1){
        preview("One item at a time",
          "<p>Checkout takes one product per order for now. Remove the others " +
          "(and set the quantity to 1) to continue.</p>");
        console.info("store.js: payment links check out one product at a time; " +
                     "CHECKOUT.mode 'api' takes the whole cart. See STORE-SETUP.md.");
        return;
      }
      var url = CHECKOUT.links[lines[0].id];
      if (!url){
        preview("Not available yet",
          "<p>This item can't be bought online just yet. Nothing was charged.</p>");
        console.warn("store.js: no Square payment link for '" + lines[0].id +
                     "' in CHECKOUT.links.");
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
        // Ids and quantities only. The server prices every line from its own
        // list, so a price edited in the browser has nothing to travel in.
        body: JSON.stringify({
          lines: lines.map(function(l){ return { id: l.id, qty: l.qty }; }),
          currency: CHECKOUT.currency
        })
      })
      .then(function(r){ if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function(d){
        if (!d.url) throw new Error("no checkout url returned");
        window.location.href = d.url;                 // Square hosted page
      })
      .catch(function(err){
        el.pay.disabled = false;
        el.pay.textContent = "Checkout";
        console.error("store.js: checkout failed:", err);
        preview("Checkout could not start",
          "<p>Please try again in a moment. Your cart is untouched and nothing " +
          "was charged.</p>");
      });
      return;
    }

    /* ---- demo: no payment provider connected yet ---- */
    var rows = lines.map(function(l){
      return "<tr><td>" + l.qty + " &times;</td><td>" + esc(l.name) +
             "</td><td>" + money(l.price * l.qty) + "</td></tr>";
    }).join("");
    preview("Checkout opens soon",
      "<table>" + rows +
      "<tr class='tot'><td></td><td>Total</td><td>" + money(total()) + "</td></tr></table>" +
      "<p>The store isn't taking orders yet. Nothing was charged.</p>");
    console.info("store.js: CHECKOUT.mode is 'demo', so nothing was sent. In 'link' " +
                 "mode this goes to the product's Square payment page; in 'api' mode " +
                 "the cart is POSTed to " + CHECKOUT.endpoint + ". See STORE-SETUP.md.");
  }
  el.pay.addEventListener("click", checkout);

  /* Back from Square after paying: the redirect URL in STORE-SETUP.md ends
     in ?paid=1. Empty the cart, which otherwise still held everything just
     bought and invited paying twice, and say thanks. Anyone can type ?paid=1,
     so all it can ever do is clear that visitor's own cart; Square's order
     notifications, not this page, are the record of what was paid. */
  if (new URLSearchParams(window.location.search).get("paid") === "1"){
    cart = {};
    save();
    var thanks = document.getElementById("store-thanks");
    if (thanks){
      thanks.hidden = false;
      document.getElementById("store-thanks-close").addEventListener("click", function(){
        thanks.hidden = true;
      });
    }
    if (window.history.replaceState) window.history.replaceState(null, "", window.location.pathname);
  }

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
# -Indexes: never list a folder's files. Without it, /images/ could show
# every image uploaded, including photos for a drop not published yet.
Options -MultiViews -Indexes
# Every page is a folder (drops/index.html) served at a URL with no trailing
# slash. Apache's own habit is to redirect folder URLs to add the slash; the
# rule below strips it again, and the two bounced every page back and forth
# until the browser gave up ("too many redirects"). Tested on Apache 2.4.
DirectorySlash Off
RewriteEngine On

# HTTPS. Uncomment the three lines below once https://pn0va.com opens with a
# padlock (or use the host's "Force HTTPS" switch, which does the same). They
# ship switched off because forcing HTTPS on a site with no certificate takes
# the whole site down. The X-Forwarded-Proto line stops a redirect loop on
# hosts that sit behind Cloudflare or a similar proxy.
# RewriteCond %{HTTPS} off
# RewriteCond %{HTTP:X-Forwarded-Proto} !https
# RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]

# strip a trailing slash: /drops/ -> /drops
RewriteCond %{REQUEST_FILENAME} -d
RewriteCond %{REQUEST_URI} ^(.+)/$
RewriteRule ^ %1 [R=301,L]

# /drops -> /drops/index.html
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME}/index.html -f
RewriteRule ^(.*)$ $1/index.html [L]

# old URLs keep working. index.html only when the visitor typed it: Apache
# serves / from index.html internally, and redirecting that looped forever.
RewriteCond %{THE_REQUEST} \\s/+index\\.html[\\s?]
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

# Security headers. Nothing on this site is meant to be shown inside another
# site's page, and it uses no camera, microphone or location.
<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  # stops another site loading the store invisibly and steering clicks
  Header always set X-Frame-Options "SAMEORIGIN"
  Header always set Content-Security-Policy "frame-ancestors 'self'"
  Header always set Permissions-Policy "camera=(), microphone=(), geolocation=()"
  # With HTTPS forced (above), also uncomment this so browsers refuse plain
  # HTTP for a year, even on a first click from a public Wi-Fi network.
  # Header always set Strict-Transport-Security "max-age=31536000"
</IfModule>

# Caching. Pages, stylesheets and scripts are re-checked on every visit (a
# cheap "not modified" reply when nothing changed), so an edit shows up at
# once, even one made to store.js directly on the server. Images and fonts
# keep for a day; the build gives every image link a ?v= stamp that changes
# with the file, so rebuilt art shows at once too.
<IfModule mod_headers.c>
  <FilesMatch "\\.(html|css|js)$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
  <FilesMatch "\\.(png|jpe?g|gif|webp|svg|ico|woff2|pmtiles|json)$">
    Header set Cache-Control "public, max-age=86400"
  </FilesMatch>
</IfModule>

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css text/plain text/xml application/xml application/javascript text/javascript application/json image/svg+xml
</IfModule>
"""


def robots_and_sitemap(out: pathlib.Path, pages: list[str]):
    """Tell search engines where the pages are (clean builds only: those are
    the ones that go on the server)."""
    (out / "robots.txt").write_text(
        "User-agent: *\nAllow: /\n\nSitemap: " + SITE_URL + "/sitemap.xml\n",
        encoding="utf-8", newline=NL)
    urls = "".join(f"  <url><loc>{SITE_URL}/{p}</loc></url>\n" for p in [""] + pages)
    (out / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + urls + "</urlset>\n", encoding="utf-8", newline=NL)


def build_clean(flat: pathlib.Path, with_shop: bool) -> pathlib.Path:
    out = flat.parent / (flat.name + "-clean")
    wipe(out)
    shutil.copytree(flat, out, dirs_exist_ok=True)

    pages = ["blog", "projects", "drops", "about"] + (["store"] if with_shop else [])
    assets = ("style.css", "page-style.css", "drops.css", "reader.css", "tokens.css",
              "script.js", "page-script.js", "reader.js", "drops.js", "store.js",
              "drops-map.js", "drops-world.js", "favicon.ico", "favicon.svg", "apple-touch-icon.png")

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
    robots_and_sitemap(out, pages)
    (out / "READ-ME-FIRST.txt").write_text(
        "This folder is the website, ready to upload. Upload everything in it\n"
        "except this note, including .htaccess and the maps folder.\n"
        "\n"
        "Double-clicking index.html shows a bare page: the pages link to\n"
        "/style.css, /drops and so on, and \"/\" means the top of the website on\n"
        "a web server but the top of the drive on your computer.\n"
        "\n"
        "To see the site on your computer first, double-click PREVIEW.cmd in the\n"
        "pn0va-site folder, or drag this folder onto it. It shows this folder\n"
        "the way the web host will, Drops map included, with nothing to install.\n",
        encoding="utf-8", newline=NL)
    return out


def stamp_assets(folder: pathlib.Path):
    """Rewrite every ?v= to a hash of the file it points at.

    A hand-maintained version string only busts the cache if someone remembers
    to bump it — and forgetting is the single worst bug in this site's history
    (new HTML served against stale CSS, twice). Deriving the stamp from the
    bytes makes that failure impossible: change a file, its URL changes.

    Images get the same stamp. An image URL that never changes can keep
    showing old art from a browser's cache after new art is live — the logo
    has changed twice this year — and the atlas is the worst case: new frame
    coordinates in script.js drawn from a cached old atlas is garbage.
    """
    import hashlib
    cache: dict[str, str] = {}

    def digest(rel: str) -> str | None:
        rel = rel.replace(SITE_URL, "", 1)          # og:image is absolute
        if rel not in cache:
            f = folder / rel.lstrip("/")
            cache[rel] = (hashlib.sha1(f.read_bytes()).hexdigest()[:8]
                          if f.is_file() else None)
        return cache[rel]

    def sub(m):
        d = digest(m.group(2))
        return m.group(1) + m.group(2) + (f"?v={d}" if d else "") + m.group(3)

    # the Animate export names its atlas in a manifest inside script.js. Stamp
    # that first: it changes script.js, and so script.js's own stamp.
    atlas = re.compile(r'(src:")([^"?]+\.png)(?:\?v=[^"]*)?(")')
    for js in folder.glob("*.js"):
        text = js.read_text(encoding="utf-8")
        if atlas.search(text):
            js.write_text(atlas.sub(sub, text), encoding="utf-8", newline=NL)

    pat = re.compile(r'((?:href|src)=")([^"?]+\.(?:css|js))\?v=[^"]*(")')
    img = re.compile(r'((?:href|src|content|data-hint|data-item|data-map|data-landmarks)=")'
                     r'((?:' + re.escape(SITE_URL) + r')?[^":?#]+\.(?:png|svg|ico|jpe?g|webp|gif|pmtiles|json))'
                     r'(?:\?v=[^"]*)?(")')
    for html in folder.rglob("*.html"):
        text = html.read_text(encoding="utf-8")
        html.write_text(img.sub(sub, pat.sub(sub, text)), encoding="utf-8", newline=NL)


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


def map_gaps():
    """The drops the street map does not cover, as "DROP #004 (33.3902, -111.8684)".

    None means there is no map file at all. One map file covers every drop; it
    only needs making again when a drop sits outside the area it was cut for,
    so compare the drops in drops.html with the list tools/make-map.py
    recorded inside the file.
    """
    import gzip, json, math
    f = MAP_SRC / "drops.pmtiles"
    if not f.exists():
        return None
    with open(f, "rb") as fh:                   # PMTiles header: metadata offset
        head = fh.read(127)                     # and length at bytes 24-40,
        fh.seek(int.from_bytes(head[24:32], "little"))   # compression at 97
        raw = fh.read(int.from_bytes(head[32:40], "little"))
    info = json.loads(gzip.decompress(raw) if head[97] == 2 else raw).get("pn0va", {})
    made_for, km = info.get("drops"), info.get("detail_km", 0)
    if not isinstance(made_for, list):
        return []                               # made before drops were recorded

    def km_between(a, b):
        dlat = (a[0] - b[0]) * 110.574
        dlng = (a[1] - b[1]) * 111.320 * math.cos(math.radians((a[0] + b[0]) / 2))
        return math.hypot(dlat, dlng)

    html = (BRAND / "drops/drops.html").read_text(encoding="utf-8")
    outside = []
    for m in re.finditer(r'<article class="dp-entry"(.*?)>', html, re.S):
        attrs = dict(re.findall(r'data-(n|lat|lng)="([^"]*)"', m.group(1)))
        if "lat" not in attrs or "lng" not in attrs:
            continue
        here = (float(attrs["lat"]), float(attrs["lng"]))
        # covered = at least 1 km of detail on every side of the marker
        if not any(km_between(here, d) <= km - 1 for d in made_for):
            outside.append(f"DROP #{attrs.get('n', '?')} ({here[0]:.4f}, {here[1]:.4f})")
    return outside


def have_map_tools() -> bool:
    import importlib.util
    return all(importlib.util.find_spec(m) for m in ("pmtiles", "requests"))


def ensure_map() -> None:
    """Before building, cut the street map again if a drop is outside it.

    So adding a drop somewhere new takes nothing but adding it to drops.html
    and building: tools/make-map.py fetches the area around every drop from
    the newest OpenStreetMap build (build.protomaps.com), a few MB per city.
    Without the tools or a connection the build goes on with the map it has,
    and check_map() says so at the end.
    """
    import subprocess
    gaps = map_gaps()
    if gaps == [] or not have_map_tools():
        return
    what = "no street map yet" if gaps is None else "outside the street map: " + ", ".join(gaps)
    print(f"  map: {what}. Fetching the area from OpenStreetMap...")
    subprocess.run([sys.executable, str(ROOT / "tools/make-map.py")])
    print()


def check_map() -> None:
    """After building, say if a drop is still without a street map."""
    gaps = map_gaps()
    if gaps == []:
        return
    what = "no street map yet" if gaps is None else "outside the street map: " + ", ".join(gaps)
    fix = ("Fetching it failed (see above). Build again when online." if have_map_tools()
           else "To fetch it:  pip install pmtiles requests  then build again.")
    print(f"\n  map: {what}.\n       {fix}")


if __name__ == "__main__":
    ensure_map()
    for flag in (True, False):
        d = build(flag)
        check_js(d)
        stamp_assets(d)
        c = build_clean(d, flag)
        check_js(c)
        stamp_assets(c)
        print(f"  built {d.name:11s} {len(list(d.rglob('*'))):3d} files"
              f"   +  {c.name:17s} {len(list(c.rglob('*'))):3d} files")
    print("\n  -clean       = pn0va.com/drops URLs: the one you upload")
    print("  flat builds  = open by double-clicking (no street map)")
    print("  preview      = double-click PREVIEW.cmd, or  python tools/preview.py")
    check_map()
