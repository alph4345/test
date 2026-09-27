# Store — taking real money

The store works end to end **except** the last step. Adding, removing, quantities,
the subtotal and persistence all function; `Checkout` currently shows you what
*would* be sent instead of charging anyone.

Everything below is about flipping that last switch.

---

## The one thing that matters

**Your Square access token must never appear in `store.js`.** Anything in that
file is public — anyone can read it. A leaked token lets someone issue refunds
from your account.

That single constraint is what decides which mode you can use.

---

## Choose a mode

Open `store.js`. Near the bottom:

```js
var CHECKOUT = {
  mode: "demo",          //  "demo" | "link" | "api"
  currency: "USD",
  links: { "pin-gameboy": "", "key-digivice": "", "plate-custom": "" },
  endpoint: "/api/checkout"
};
```

| Mode | Backend needed | Multi-item cart | Good for |
|---|---|---|---|
| `demo` | none | — | what ships now |
| **`link`** | **none** | ✗ one item at a time | **start here** |
| `api` | yes, small | ✓ | when one-at-a-time starts costing you sales |

### Mode `"link"` — no server, works today

Square calls these **Payment Links**. Each is a hosted checkout page for one
product, and the URL is safe to publish.

1. Square Dashboard → **Online → Payment Links → Create**
2. Choose *Accept a payment* (or *Sell an item* to attach the photo and stock).
3. Set the name and price so they **match this page exactly** — the customer
   will compare, and a mismatch reads as a scam.
4. Turn on **Collect shipping address** if you're posting it.
5. Copy the `https://square.link/u/XXXXXXX` URL.
6. Paste it against the matching `data-id`:

```js
mode: "link",
links: {
  "pin-gameboy":  "https://square.link/u/AbCdEfGh",
  "key-digivice": "https://square.link/u/IjKlMnOp",
  "plate-custom": "https://square.link/u/QrStUvWx"
}
```

The cart still works for browsing; at checkout it redirects to that product's
Square page. If more than one line is in the cart it says so rather than
charging the wrong amount.

**The limitation is real.** Someone buying three pins pays three times, in three
transactions, with three shipping fees. That is the moment to move to `api`.

### Mode `"api"` — a real cart

Needs one server endpoint. Netlify Functions, Vercel, Cloudflare Workers — all
have free tiers that comfortably cover a maker store.

It receives `{ lines, currency }` and returns `{ url }`:

```js
// netlify/functions/checkout.js
const { randomUUID } = require("crypto");

// PRICES LIVE HERE, NOT IN THE BROWSER. Never trust a price the client sends —
// anyone can edit data-price in devtools and buy a $30 plate for $0.01.
const PRICES = {
  "pin-gameboy":  { name: "Game Boy Pin",     cents: 1800 },
  "key-digivice": { name: "Digivice Keychain", cents: 2200 },
  "plate-custom": { name: "Custom Art Plate",  cents: 3000 }
};

exports.handler = async (event) => {
  const { lines } = JSON.parse(event.body);

  const order = {
    idempotency_key: randomUUID(),
    order: {
      location_id: process.env.SQUARE_LOCATION_ID,
      line_items: lines.map(l => {
        const p = PRICES[l.id];
        if (!p) throw new Error("unknown product " + l.id);
        return {
          name: p.name,
          quantity: String(Math.max(1, Math.min(99, l.qty | 0))),
          base_price_money: { amount: p.cents, currency: "USD" }
        };
      })
    },
    checkout_options: {
      redirect_url: "https://pn0va.com/store?paid=1",
      ask_for_shipping_address: true
    }
  };

  const res = await fetch(
    "https://connect.squareup.com/v2/online-checkout/payment-links", {
      method: "POST",
      headers: {
        "Square-Version": "2025-01-23",
        "Authorization": `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(order)
    });

  const data = await res.json();
  if (!res.ok) return { statusCode: 502, body: JSON.stringify(data) };

  return { statusCode: 200, body: JSON.stringify({ url: data.payment_link.url }) };
};
```

Then set `mode: "api"`. Test against Square's **sandbox** credentials first —
they issue a separate token and card numbers that never move money.

> **Read that `PRICES` comment twice.** The single most common way small stores
> get robbed is trusting the price the browser sends. The server must look up
> its own prices from the product id and ignore whatever arrived.

---

## Before you list anything real

**Legally required in most places**
- A refund/returns policy, and shipping times, on the page or linked from it.
- Sales tax. Square can calculate and collect it — turn it on per location.
- A real contact address on the site.

**You will regret skipping these**
- **Stock.** Nothing here knows what's sold out. Until it does, either mark
  items sold out by hand or let Square's inventory do it (in `link` mode,
  Square hides a sold-out link for you).
- **Shipping cost.** Currently £0/$0. Set it in Square per item or per order.
- **Order notifications.** Square emails you, but set it up deliberately rather
  than finding out three days later.
- **A sold-out state on the card.** The design has one already — reuse the
  `CLAIMED` treatment from Drops: ash, struck through.

**Worth doing early**
- **Variants** (size, colourway). Neither the cart nor `data-id` handles these.
  The cheapest fix is one `data-id` per variant.
- **Real photos.** The placeholders are obviously placeholders and will kill
  trust faster than anything else on this list.
- **`og:` tags** so a link to the store previews with the logo instead of
  nothing. Currently missing sitewide.

---

## If Square turns out to be the wrong fit

The cart is deliberately payment-agnostic — `cartLines()` and `total()` are all
any provider needs.

- **Stripe Payment Links** — same shape as Square's, often simpler dashboard.
- **Shopify Buy Button** — heaviest, but inventory/tax/shipping all solved.
- **Gumroad / Etsy** — they take a cut and own the customer relationship, but
  you list an item and you're selling the same afternoon.

Swapping means rewriting one function, `checkout()`. Nothing else in the store
knows or cares who takes the money.
