// JRPG Style Tween Animations – Strict Cardinal Movement + Red Theme
//
// Every content window marked data-fly flies in from off-screen, trailing
// red after-images, and snaps into place. The final resting position of
// every window is defined purely in CSS, so placement is identical on
// desktop, tablet and mobile, and identical whether this script runs or
// not: it only ever animates a transform back to zero.
//
//   data-fly="left|right|top|bottom"  where the window comes from
//   data-fly-delay="60"               when it sets off, in ms
//   data-fly-each="bottom"            on a container: every visible child
//                                     flies in turn (the store's cards)
//
// On a narrow screen every window rises from the bottom, one after another
// down the page, and a window that starts below the screen simply appears:
// nobody would see it fly.
//
// Pages that change screens without loading (Drops: the world view and a
// drop) move their windows with the same flight:
//
//   pn0vaFly.enter(scope, { speed, distance })  fly scope's windows in
//   pn0vaFly.exit(scope, { speed, distance })   fly them back out
//   pn0vaFly.reset(scope)             clear what exit() leaves behind,
//                                     once the scope is hidden
//
// enter() and exit() return a promise that settles when the last window
// has stopped. speed scales the timing (.5 is twice as fast, after-images
// as close together along the way) and distance how far off-screen the
// flight starts or ends (.5 is half as far).
//
// The after-images are laid out the moment a window sets off: its flight
// is known (where it starts, where it lands, how long, on which curve), so
// each outline is put where the window will be at its moment and fades on
// its own. The browser runs those fades itself, so a page busy with other
// work as its windows land (the Drops street map drawing its tiles) can no
// longer leave a flight without them, as a timer sampling the windows did.

(function ()
{
  const MAIN_COLOR = "#ff1609"; // Red theme matching main page

  const DURATION_MS = 1400;     // Slowed animation
  const EXIT_MS = 420;          // leaving is quicker than arriving
  const TRAIL_INTERVAL_MS = 70; // one after-image this often along a flight
  const TRAIL_FADE_MS = 600;
  const TRAIL_GAP_PX = 6;       // closer than this to the last one: left out
  const START_MS = 60;
  const NARROW = "(max-width: 700px)";

  // Random easing curves
  const easings = [
    "cubic-bezier(.25,.9,.35,1)",
    "cubic-bezier(.22,.9,.21,1)",
    "cubic-bezier(.16,.84,.44,1)",
    "cubic-bezier(.19,1,.22,1)"
  ];
  const EASE_AWAY = "cubic-bezier(.55,.085,.68,.53)";   // accelerates off

  const reduceMotion =
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // The windows inside scope, as { el, dir, delay }. Hidden ones (a store
  // card on another page) land at once, so they show when paged to.
  function findWindows(scope)
  {
    const list = [];
    // the scope itself counts: exit(panel) moves that panel
    function all(sel)
    {
      const found = Array.prototype.slice.call(scope.querySelectorAll(sel));
      if (scope.matches && scope.matches(sel)) found.unshift(scope);
      return found;
    }
    all("[data-fly]").forEach(function (el)
    {
      list.push({ el: el, dir: el.dataset.fly, delay: +(el.dataset.flyDelay || START_MS) });
    });
    all("[data-fly-each]").forEach(function (box)
    {
      let n = 0;
      Array.prototype.forEach.call(box.children, function (el)
      {
        if (el.hidden || !el.getClientRects().length) { el.classList.add("landed"); return; }
        list.push({ el: el, dir: box.dataset.flyEach, delay: START_MS + 90 * n++ });
      });
    });
    return list;
  }

  // An easing curve as a function of time (0..1 -> 0..1), to know where a
  // window will be: the cubic-bezier() the browser animates it with.
  function curveOf(css)
  {
    const p = /cubic-bezier\(([^)]*)\)/.exec(css)[1].split(",").map(Number);
    const cx = 3 * p[0], bx = 3 * (p[2] - p[0]) - cx, ax = 1 - cx - bx;
    const cy = 3 * p[1], by = 3 * (p[3] - p[1]) - cy, ay = 1 - cy - by;
    const X = (t) => ((ax * t + bx) * t + cx) * t;
    const Y = (t) => ((ay * t + by) * t + cy) * t;
    return function (x)
    {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let lo = 0, hi = 1, t = x;
      for (let i = 0; i < 24; i++)       // X rises with t: halve the interval
      {
        const v = X(t);
        if (Math.abs(v - x) < 1e-5) break;
        if (v < x) lo = t; else hi = t;
        t = (lo + hi) / 2;
      }
      return Y(t);
    };
  }

  // A window's after-images, all laid out as it sets off. r is where the
  // window rests; off is how far from there the flight starts (arriving) or
  // ends (leaving). Each outline waits, unseen, until the window passes its
  // spot, shows at .7 and fades. Spots off the screen, or on top of the one
  // before, are left out.
  function trailsFor(w, r, off, away, curve, ms, step)
  {
    if (!document.body.animate) return;
    const radius = getComputedStyle(w.el).borderRadius;
    const made = [];
    let last = null;
    for (let t = step / 2; t < ms; t += step)
    {
      const p = curve(t / ms), k = away ? p : 1 - p;   // how far from its place
      const x = r.left + off[0] * k, y = r.top + off[1] * k;
      if (y + r.height < 0 || y > window.innerHeight ||
          x + r.width < 0 || x > window.innerWidth) continue;          // off-screen
      if (last && Math.hypot(x - last[0], y - last[1]) < TRAIL_GAP_PX) continue;
      last = [x, y];
      const clone = document.createElement('div');
      clone.style.position = 'fixed';
      clone.style.left = `${x}px`;
      clone.style.top = `${y}px`;
      clone.style.width = `${r.width}px`;
      clone.style.height = `${r.height}px`;
      clone.style.border = `2px solid ${MAIN_COLOR}`;
      clone.style.background = 'transparent';
      clone.style.borderRadius = radius;
      clone.style.pointerEvents = 'none';
      clone.style.zIndex = '50';
      clone.style.opacity = '0';                        // until its moment
      document.body.appendChild(clone);
      clone.animate([{ opacity: 0.7 }, { opacity: 0 }],
                    { duration: TRAIL_FADE_MS, delay: t, easing: 'linear', fill: 'forwards' });
      made.push(clone);
    }
    setTimeout(() => made.forEach((c) => c.remove()), ms + TRAIL_FADE_MS + 100);
  }

  // The offscreen start positions extend the document past the viewport,
  // which flashes scrollbars while the windows fly. Suppress scrolling
  // until the last flight in progress has ended.
  let locks = 0, prevOverflow = '';
  function lockScroll(ms)
  {
    if (!locks++)
    {
      prevOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
    }
    setTimeout(() =>
    {
      if (!--locks) document.documentElement.style.overflow = prevOverflow;
    }, ms);
  }

  // How far off-screen a flight starts or ends, as [x, y]. k < 1 starts
  // nearer the edge: screen changes arrive sooner than a page.
  function shift(dir, k)
  {
    const OFF = 800; // extra distance beyond the viewport edge
    if (dir === 'left')   return [-(window.innerWidth  + OFF) * k, 0];
    if (dir === 'right')  return [ (window.innerWidth  + OFF) * k, 0];
    if (dir === 'top')    return [0, -(window.innerHeight + OFF) * k];
    /* bottom */          return [0,  (window.innerHeight + OFF) * k];
  }
  function offscreen(dir, k)
  {
    const s = shift(dir, k);
    return `translate(${s[0]}px, ${s[1]}px)`;
  }

  function fly(scope, away, opts)
  {
    const speed = (opts && opts.speed) || 1;
    const reach = (opts && opts.distance) || 1;
    const windows = findWindows(scope || document);
    if (!windows.length) return Promise.resolve();

    if (reduceMotion)
    {
      // no motion: just show the windows in place
      windows.forEach(function (w) { w.el.classList.add('landed'); });
      return Promise.resolve();
    }

    // Narrow screens: everything rises from the bottom, top to bottom down
    // the page, spread over at most ~450ms however many windows there are.
    if (window.matchMedia(NARROW).matches)
    {
      windows.sort(function (a, b)
      {
        const ra = a.el.getBoundingClientRect(), rb = b.el.getBoundingClientRect();
        return (ra.top - rb.top) || (ra.left - rb.left);
      });
      const step = windows.length > 1 ? Math.min(150, 450 / (windows.length - 1)) : 0;
      windows.forEach(function (w, i) { w.dir = 'bottom'; w.delay = START_MS + step * i; });
    }
    windows.forEach(function (w)
    {
      // leaving: all together, the order of arrival kept as a slight stagger
      w.delay = away ? (w.delay - START_MS) * 0.4 * speed : w.delay * speed;
    });

    // A window that starts wholly below or beside the screen just appears.
    // Where each rests is kept: its after-images are measured from there.
    const inView = windows.filter(function (w)
    {
      const r = w.r = w.el.getBoundingClientRect();
      const seen = r.bottom > 0 && r.top < window.innerHeight &&
                   r.right > 0 && r.left < window.innerWidth;
      if (!seen) w.el.classList.add('landed');
      return seen;
    });
    if (!inView.length) return Promise.resolve();

    const duration = (away ? EXIT_MS : DURATION_MS) * speed;
    const last = Math.max.apply(null, inView.map(function (w) { return w.delay; }));
    lockScroll(last + duration + 400);

    inView.forEach(function (w)
    {
      const el = w.el;
      el.style.transition = 'none';
      el.style.transform = away ? '' : offscreen(w.dir, reach);
      el.style.willChange = 'transform';
      el.classList.add('landed');   // opacity handled by CSS class
      // force style flush so the starting transform is applied
      void el.offsetWidth;

      const easing = away ? EASE_AWAY : easings[Math.floor(Math.random() * easings.length)];

      setTimeout(() =>
      {
        el.style.transition =
          `transform ${duration}ms ${easing}`;
        el.style.transform = away ? offscreen(w.dir, reach) : 'translate(0, 0)';
        trailsFor(w, w.r, shift(w.dir, reach), away, curveOf(easing), duration,
                  TRAIL_INTERVAL_MS * speed);

        setTimeout(() =>
        {
          if (away) return;          // stays out until reset()
          // settle cleanly: hand control back to the stylesheet
          el.style.transition = '';
          el.style.transform = '';
          el.style.willChange = '';
        }, duration + 60);
      }, w.delay);
    });

    return new Promise(function (done) { setTimeout(done, last + duration + 80); });
  }

  function reset(scope)
  {
    findWindows(scope).forEach(function (w)
    {
      w.el.style.transition = '';
      w.el.style.transform = '';
      w.el.style.willChange = '';
    });
  }

  window.pn0vaFly = {
    enter: function (scope, opts) { return fly(scope, false, opts); },
    exit:  function (scope, opts) { return fly(scope, true, opts); },
    reset: reset
  };

  // Once the page's own scripts have built their windows (the store pages
  // its cards, the reader fills its list) but without waiting for images.
  function entrance() { fly(document, false); }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", entrance);
  else
    entrance();
})();
