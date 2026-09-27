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
