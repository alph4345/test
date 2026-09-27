/* ==========================================================================
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
