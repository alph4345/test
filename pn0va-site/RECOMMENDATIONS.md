# pn0va.com — review and recommendations

2026.09.27. Everything below was checked in a real browser (Chromium, desktop
and phone sizes, JavaScript on and off) and, for the server rules, on Apache
2.4. What was fixed is listed in README.md under *2026.09.27 update*; this file
is what's left, and the answers to the security questions.

## Do these first

1. **Make the map file, then upload the new `with-store-clean` (or
   `no-store-clean`) folder.** The live Drops map says "API key required"
   because Carto now wants a key. `python tools/make-map.py` then
   `python build.py` creates the self-hosted replacement (README, *The Drops
   map*). The upload also replaces the old `.htaccess`, which sends every page
   into a redirect loop on a standard Apache server ("too many redirects"). If
   pn0va.com loads fine today, your host behaves differently from stock
   Apache, but the new file works either way.
2. **Turn on HTTPS**, then force it (see README, *The server*). This matters
   most for the store: over plain HTTP, someone on the same public Wi-Fi can
   change the page on its way to a buyer, including where Checkout sends them.
3. **Keep the store offline until checkout is set up.** It is in demo mode:
   buyers can fill a cart but cannot pay. Use `no-store-clean` until then.
4. **Replace the template content.** The blog posts, the projects (Task Manager
   App, Weather Dashboard…), the About text and every image are placeholders.
   This is what visitors will notice first.
5. **Add a way to reach you.** About says "get in touch", but there is no email
   or social link anywhere, and a store legally needs contact details in most
   places.

## The logo

**The logo file is up to date.** The image you sent is byte-for-byte the site's
`images/logo2.png`. It is also now the favicon source, the iPhone home-screen
icon and the link-preview image.

**The homepage animation is not an exact copy of it.** The animation is a
separate Adobe Animate export (`script.js` + `images/index_atlas_1.png`) and
has always been composed differently. At the same letter height:

- the letters are about 23% wider, the whole lockup is squashed vertically,
  and the bar runs much further past the P and the A;
- the katakana is larger and tighter and starts right after the sword, where
  your file spreads it across the right side. When ピー・ノーバー became
  ピー・ノバ, only one glyph of the animation was repainted, so the text now
  stops under the V;
- the middle dot is square rather than round.

Three ways forward:

| | What it means | Trade-off |
|---|---|---|
| **A. Re-compose the animation** | Adjust its final frame to match your file exactly | Stays in Adobe Animate; the letters remain a bitmap that looks soft on high-resolution screens |
| **B. Rebuild the intro from `logo.svg`** | Same choreography (bar grows, letters rise, sword drops, katakana fades) in SVG and CSS | Exact match forever, sharp on every screen, about 300 KB lighter; no longer edited in Animate |
| C. Leave it | The animation stays its own variant | The homepage and your logo file differ |

My recommendation is **B**, unless you edit the animation in Animate yourself.

## Security

### Drops: can someone edit its data?

**No, not in a way anyone else would see.** The page is a set of plain files.
A visitor can change what their own browser shows (every browser's developer
tools can), but nothing they do reaches the server or other visitors.

The ways to change what everyone sees:

- your **hosting account** (control panel, FTP, file manager);
- your **domain registrar** (where pn0va.com is registered) and DNS;
- the **computer you build and upload from**;
- the **email** that can reset all of the above.

Use a unique password and two-factor login on each. Use SFTP rather than FTP if
your host offers it.

**Everything on the page is public**, including what the page doesn't display:

- The page source lists every drop's exact coordinates (to about 10 cm), hint
  and caption, including claimed ones.
- Files on the server can be fetched even when no page links to them. Folder
  listings are now switched off, but a guessable name like
  `images/drop-004-hint.jpg` can still be opened. Don't upload a drop's photos
  until you publish it.
- Never put a claim code, answer or other secret in the page or its scripts.
  If you want "enter the code you found" claiming, or hints that unlock over
  time, that needs a small server. I can build it.

**In the real world:**

- Coordinates plus dates show where you were and when, so keep drops away from
  home and work and publish after you've left the area.
- Drop #002's coordinates are 31 m from the centre of Alcatraz Island, which is
  National Park Service land. Leaving items there generally needs permission,
  and many parks have rules on caches.

**The map** no longer depends on anyone. Carto now answers keyless requests
with "API key required" tiles, so the streets come from a file on your own
server instead (README, *The Drops map*). Visitors' browsers ask no map
company for anything, and no one can change its terms or switch it off.

### Store: how safe is it?

**Safe to browse, not ready to sell.**

- **Card details never touch your site.** Buyers type them on Square's page.
  That's the safest setup a small store can have: there is nothing on your
  server worth stealing.
- **Nobody can pay less than your price.** A visitor can edit a price in their
  browser, but it only changes their own screen. Square charges the payment
  link's price in `link` mode, or your server's price list in `api` mode. I
  tested it: an edited $0.01 price has no effect, and the cart now ignores
  edited prices too.
- **Fixed today:**
  - saved carts kept old prices after you changed one;
  - buyers came back from Square to a full cart;
  - customers saw developer instructions at checkout;
  - text saved in the cart could run as code.
- **Before taking real orders:**
  - choose a checkout mode (STORE-SETUP.md);
  - add real photos;
  - add a refund/returns policy, shipping costs and times, sales tax, and
    contact details;
  - set up Square order notifications and two-factor login on Square.
  - In `api` mode the Square access token lives only on the server, never in
    `store.js`.
- **`?paid=1` is not proof of payment.** It is just the address Square sends
  buyers back to, and anyone can type it. Ship orders from Square's
  notifications or dashboard.

### The server

The fixed `.htaccess` also:

- stops folder listings;
- stops other sites loading yours inside a frame to trick clicks;
- sends the standard browser-protection headers;
- has the HTTPS switch ready to turn on.

A full Content-Security-Policy is worth adding once you know which outside
scripts you'll use (Square, analytics); adding it now risks breaking them.

## Page by page

### Home

- **TAP TO ENTER** hides everything until someone taps, and it has no
  technical purpose: there's no sound to unlock. First-time visitors and search
  engines see a black screen and one line of text. Consider starting the
  animation straight away. It's your call; it is part of the JRPG feel.
- **Weight.** The animation library (240 KB, 64 KB compressed) and the atlas
  (95 KB) are most of the page. Option B above removes both.
- **Fireflies.** Up to 50 animated dots run for as long as the page is open.
  They should respect the phone or computer's "reduce motion" setting and pause
  in background tabs, to save battery.
- **Search.** Apart from the menu, the home page has no words search engines
  can read. One line about who you are and what the site is would help people
  find you.

### Blog and Projects

- Every post lives at `/blog` and opens on the first one. Give each post its
  own link (e.g. `pn0va.com/blog#building-with-createjs`) so a single post can
  be shared.
- The first post says "browse through the archive on the right"; the list is
  on the left now.
- Projects have no dates, so the date slot in the header is empty. Add dates
  or hide the slot.
- The title and date appear twice in each post: in the header and again in the
  body.

### Drops

- Every drop uses the same placeholder hint and item images.
- The page calls a finished drop both "Recovered" (tally) and "Claimed" (list,
  status). Pick one word.
- For a claimed drop, "Elapsed" keeps counting from the day it was placed:
  Drop #001 shows 104 days, though it was found after 13. Recording the found
  date would let the page show that instead.
- Coordinates are always labelled °N and °W, so a drop south of the equator
  or east of Greenwich would show the wrong hemisphere.
- The "100 m" and "250 m" ring labels overlap at the default zoom.

### Store

- Everything under *Store: how safe is it?* above. Keep `no-store-clean` live
  until then.
- STORE-SETUP.md also covers sold-out states, product variants and shipping.

### About

- The portrait and text are placeholders. The text still says "geocaching
  adventures" (the page is Drops now), invites people to get in touch with no
  way to do it, and lists generic skills.

### Everywhere

- Page titles mix styles: "P_N0VA - Blog" and "P_N0VA — DROPS".
- A missing page shows the home page (TAP TO ENTER). A small "signal lost"
  page with the menu would be clearer.
- If you want to know which pages people visit, a privacy-friendly counter
  (Plausible, GoatCounter) is enough. Mention it in a privacy note if you add
  one.
- `README.pdf` and `STORE-SETUP.pdf` are out of date. `python tools/md2pdf.py`
  refreshes them on your PC.
