#!/usr/bin/env python3
"""
Markdown -> branded PDF.

    python tools/md2pdf.py                    every .md under PN0VA + this folder
    python tools/md2pdf.py path/to/FILE.md    just that one

Writes FILE.pdf beside FILE.md and never touches the markdown. The markdown
stays the source of truth — greppable and diffable; the PDF is the readable copy.

Uses the **light / print expression** of the identity: black mark, red rules and
headings, white ground. Not the dark screen palette — that would be unreadable
on paper and a crime against toner.

Rendering is pure Python (fpdf2). Headless Edge and Chrome are BOTH blocked in
this environment — they exit silently without producing a file, and even
`--version` prints nothing — so do not reach for `--print-to-pdf`. pandoc,
wkhtmltopdf and weasyprint are not installed either.

    pip install fpdf2 markdown
"""

import io, pathlib, re, sys

try:
    import markdown
    from fpdf import FPDF
    from fpdf.enums import XPos, YPos
    from fpdf.fonts import TextStyle
except ImportError:
    sys.exit("pip install fpdf2 markdown")

HERE  = pathlib.Path(__file__).resolve().parent.parent
BRAND = next((c for c in [HERE.parent / "PN0VA",
                          pathlib.Path("C:/Users/N0VA/Desktop/PN0VA")]
              if (c / "tokens.css").exists()), None)

RED   = (255, 22, 9)
INK   = (25, 20, 19)
MUTED = (110, 100, 98)
FAINT = (138, 128, 123)
RULE  = (226, 220, 216)
WASH  = (251, 248, 247)
PAGE  = (255, 255, 255)      # page ground; only painted in dark mode
DARK  = False


def use_dark():
    """Swap to the dark/screen expression. Opt-in via --dark.

    The light palette above stays the default so every other document in the
    system renders exactly as before. Red is unchanged — it is the signature
    and it reads well on both grounds.
    """
    global INK, MUTED, FAINT, RULE, WASH, PAGE, DARK
    DARK  = True
    PAGE  = (13, 12, 12)         # near-black, warmed slightly to match the ink
    INK   = (234, 230, 227)
    MUTED = (154, 146, 142)
    FAINT = (112, 105, 102)
    RULE  = (52, 47, 46)
    WASH  = (26, 24, 23)


def pixel_font() -> pathlib.Path | None:
    """Press Start 2P ships as woff2; fpdf needs a ttf. Decompress once, cache."""
    if not BRAND:
        return None
    src = BRAND / "fonts/press-start-2p-latin-400-normal.woff2"
    dst = pathlib.Path(__file__).parent / "press-start-2p.ttf"
    if dst.exists():
        return dst
    if not src.exists():
        return None
    try:
        from fontTools.ttLib import TTFont
        f = TTFont(str(src))
        f.flavor = None                     # drop woff2 compression
        f.save(str(dst))
        return dst
    except Exception:
        return None


def light_logo() -> pathlib.Path | None:
    """The brand mark is pure black on transparent, so it disappears on a dark
    ground. Recolour it to the ink tone once, keeping alpha, and cache."""
    if not BRAND:
        return None
    src = BRAND / "logo/logo.png"
    if not src.exists():
        return None
    # The cache key carries the tint, and validity is decided by mtime.
    #
    # Both halves were bugs. The old `if dst.exists()` never expired, so the
    # sword reforge reached every other logo asset while this one quietly kept
    # the one-handed sword. And a single fixed filename meant a call made
    # before use_dark() would bake the LIGHT ink into the file the dark build
    # then reuses — dark mark on a dark page.
    dst = pathlib.Path(__file__).parent / ("logo-tint-%02x%02x%02x.png" % INK)
    if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
        return dst
    try:
        from PIL import Image
        im = Image.open(src).convert("RGBA")
        r, g, b, a = im.split()
        tint = Image.new("RGBA", im.size, INK + (255,))
        tint.putalpha(a)                    # keep the mark's silhouette exactly
        tint.save(dst)
        return dst
    except Exception:
        return None


class Doc(FPDF):
    def __init__(self, title: str, subtitle: str):
        super().__init__(format="A4", unit="mm")
        self.title_text, self.subtitle = title, subtitle
        self.set_margins(16, 16, 16)
        self.set_auto_page_break(True, margin=18)
        self.set_title(title)

        # Core PDF fonts (helvetica/courier) are Latin-1 only, and these docs
        # are full of em-dashes, arrows, x-signs and katakana. Embed real
        # Unicode faces, with Noto Sans JP as the fallback so ピー・ノバ renders
        # instead of throwing.
        W = pathlib.Path("C:/Windows/Fonts")
        self.body_family, self.mono_family = "helvetica", "courier"
        if (W / "segoeui.ttf").exists():
            self.add_font("body", "",  str(W / "segoeui.ttf"))
            self.add_font("body", "B", str(W / "segoeuib.ttf"))
            self.add_font("body", "I", str(W / "segoeuii.ttf"))
            self.add_font("body", "BI", str(W / "segoeuiz.ttf"))   # bold-italic
            self.body_family = "body"
        if (W / "consola.ttf").exists():
            self.add_font("mono", "",  str(W / "consola.ttf"))
            self.add_font("mono", "B",  str(W / "consolab.ttf"))
            self.add_font("mono", "I",  str(W / "consolai.ttf"))
            self.add_font("mono", "BI", str(W / "consolaz.ttf"))
            self.mono_family = "mono"
        # Fallbacks, in order: Noto Sans JP covers ピー・ノバ and the rest of CJK,
        # Segoe UI Symbol covers check marks, crosses and arrows that Segoe UI
        # itself is missing.
        fallbacks = []
        if (W / "NotoSansJP-Regular.ttf").exists():
            # every style, not just regular — the katakana appears inside
            # **bold** in the docs, and a fallback with no bold face is skipped
            self.add_font("jp", "",  str(W / "NotoSansJP-Regular.ttf"))
            bold = W / ("NotoSansJP-Bold.ttf" if (W / "NotoSansJP-Bold.ttf").exists()
                        else "NotoSansJP-Regular.ttf")
            self.add_font("jp", "B",  str(bold))
            self.add_font("jp", "I",  str(W / "NotoSansJP-Regular.ttf"))
            self.add_font("jp", "BI", str(bold))
            fallbacks.append("jp")
        if (W / "seguisym.ttf").exists():
            self.add_font("sym", "", str(W / "seguisym.ttf"))
            fallbacks.append("sym")
        if fallbacks:
            self.set_fallback_fonts(fallbacks)

        self.pixel = pixel_font()
        if self.pixel:
            self.add_font("pixel", "", str(self.pixel))

    # Masthead geometry, worked out rather than guessed. The logo is 1600x984,
    # so at LOGO_W mm wide it stands LOGO_W * 984/1600 tall. The rule has to
    # clear the bottom of that, and the body has to clear the rule — otherwise
    # the first heading prints straight through the mark.
    LOGO_W = 27.0
    LOGO_H = LOGO_W * 984 / 1600          # ~16.6mm

    def header(self):
        # PDF has no page background colour — in dark mode every page needs an
        # explicit full-bleed rect, painted before anything else so all content
        # lands on top of it.
        if DARK:
            self.set_fill_color(*PAGE)
            self.rect(0, 0, self.w, self.h, style="F")

        top = self.t_margin - 3
        logo = light_logo() if DARK else ((BRAND / "logo/logo.png") if BRAND else None)
        if logo and logo.exists():
            self.image(str(logo), x=self.l_margin, y=top, w=self.LOGO_W)

        self.set_xy(self.l_margin, top + 1)
        self.set_font(self.body_family, "", 6.5)
        self.set_text_color(*FAINT)
        self.cell(0, 4, self.subtitle.upper(), align="R",
                  new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.cell(0, 4, f"PAGE {self.page_no()}", align="R",
                  new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        rule_y = top + self.LOGO_H + 2.5
        self.set_draw_color(*RED)
        self.set_line_width(0.7)
        self.line(self.l_margin, rule_y, self.w - self.r_margin, rule_y)
        self.set_y(rule_y + 6)

    def footer(self):
        self.set_y(-13)
        self.set_draw_color(*RULE)
        self.set_line_width(0.2)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.set_y(-10)
        self.set_font(self.body_family, "", 6.5)
        self.set_text_color(*FAINT)
        self.cell(0, 4, "P_N0VA", align="L")
        self.set_y(-10)
        self.cell(0, 4, self.title_text, align="R")


def to_html(md_text: str) -> tuple[str, str]:
    m = re.match(r"^#\s+(.+)", md_text)
    title = m.group(1).strip() if m else "Document"
    if m:                                   # the h1 becomes the cover line
        md_text = md_text[m.end():]

    html = markdown.markdown(md_text, extensions=["extra", "sane_lists"],
                             output_format="html5")

    # fpdf2's HTML subset is small — normalise what it cannot render
    html = re.sub(r"<pre><code[^>]*>(.*?)</code></pre>",
                  lambda mm: "<pre>" + mm.group(1) + "</pre>", html, flags=re.S)
    html = html.replace("<blockquote>", "<p><i>").replace("</blockquote>", "</i></p>")
    html = re.sub(r"</?(sup|sub|del|s)>", "", html)

    # Markdown's table extension expresses column alignment as an inline style
    # (`style="text-align: right;"`), which fpdf2's HTML subset ignores — every
    # column ends up left-aligned regardless of the |---:| markers. Translate it
    # to the `align` attribute, which fpdf2 does honour.
    html = re.sub(r'style="text-align:\s*(left|right|center);?"',
                  lambda mm: f'align="{mm.group(1)}"', html)

    # fpdf2 raises on ANY nested tag inside <td>/<th>. Flatten cell contents
    # to plain text — emphasis is decoration in a table, the words are the
    # point. Each tag is handled separately so a <td> can never close on a
    # </th>, and so no regex backreference is needed.
    for _t in ("td", "th"):
        # the (whitespace...)? is load-bearing: "<th([^>]*)>" happily matches
        # <thead>, treating "ead" as attributes and eating the <tr>
        _open  = "<" + _t + r"((?:\s[^>]*)?)>"
        _close = "</" + _t + ">"
        html = re.sub(
            _open + "(.*?)" + _close,
            lambda mm, t=_t: "<" + t + (mm.group(1) or "") + ">"
                             + re.sub("<[^>]+>", "", mm.group(2))
                             + "</" + t + ">",
            html, flags=re.S)
    html = re.sub(r"\s*<br\s*/?>\s*", "<br>", html)
    return title, html


def convert(md_path: pathlib.Path) -> pathlib.Path:
    text = md_path.read_text(encoding="utf-8")
    title, html = to_html(text)

    where = md_path.parent.name or md_path.parent.parent.name
    doc = Doc(title, f"{where} / {md_path.name}")
    doc.add_page()

    # cover line, in the display face when it is available
    doc.set_text_color(*INK)
    if doc.pixel:
        doc.set_font("pixel", "", 12)
        doc.multi_cell(0, 7.5, title, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    else:
        doc.set_font(doc.body_family, "B", 17)
        doc.multi_cell(0, 8, title, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    doc.ln(4)

    doc.set_font(doc.body_family, "", 9.6)
    doc.set_text_color(*INK)
    doc.set_draw_color(*RULE)      # table rules follow the palette
    doc.set_fill_color(*WASH)
    doc.write_html(
        html,
        tag_styles={
            "h1": TextStyle(color=RED,   font_size_pt=13,   font_style="B",
                            t_margin=5,   b_margin=2),
            "h2": TextStyle(color=RED,   font_size_pt=11.5, font_style="B",
                            t_margin=4.5, b_margin=1.6),
            "h3": TextStyle(color=INK,   font_size_pt=10.2, font_style="B",
                            t_margin=3.4, b_margin=1.2),
            "h4": TextStyle(color=MUTED, font_size_pt=9.4,  font_style="B",
                            t_margin=3,   b_margin=1),
            "a":  TextStyle(color=RED),
            "code": TextStyle(font_family=doc.mono_family, font_size_pt=8.4,
                              color=INK),
            "pre":  TextStyle(font_family=doc.mono_family, font_size_pt=8.0,
                              color=INK, t_margin=2, b_margin=3),
        },
        table_line_separators=True,
        li_prefix_color=RED,
    )

    out = md_path.with_suffix(".pdf")
    doc.output(str(out))
    return out


def main():
    args = [a for a in sys.argv[1:] if a != "--dark"]
    if "--dark" in sys.argv[1:]:
        use_dark()
    if args:
        targets = [pathlib.Path(a).resolve() for a in args]
    else:
        roots = [HERE] + ([BRAND] if BRAND else [])
        targets = sorted({p for r in roots for p in r.rglob("*.md")
                          if "node_modules" not in p.parts and "_source" not in p.parts})

    ok = 0
    for md in targets:
        try:
            pdf = convert(md)
            print(f"  {md.parent.name}/{md.name:22s} -> {pdf.name:22s} "
                  f"{pdf.stat().st_size/1024:6.1f} KB")
            ok += 1
        except Exception as e:
            print(f"  {md.parent.name}/{md.name:22s} FAILED  {type(e).__name__}: {e}")
    print(f"\n  {ok}/{len(targets)} converted")


if __name__ == "__main__":
    main()
