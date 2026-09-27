// JRPG Style Tween Animations – Strict Cardinal Movement + Red Theme
//
// The final resting position of every window is defined purely in CSS
// (flexbox in page-style.css), so placement is identical on desktop,
// tablet and mobile, and identical whether this script runs or not.
// This script only animates each window FROM offscreen TO its natural
// position using transforms, adding the motion-trail after-images and
// the impact snap on landing.

window.addEventListener("load", function()
{
  const left  = document.getElementById("window-left");
  const right = document.getElementById("window-right");

  if (!left || !right) return;

  const MAIN_COLOR = "#ff1609"; // Red theme matching main page

  const DURATION_MS = 1400;     // Slowed animation
  const TRAIL_INTERVAL_MS = 70;
  const TRAIL_FADE_MS = 600;

  // Random easing curves
  const easings = [
    "cubic-bezier(.25,.9,.35,1)",
    "cubic-bezier(.22,.9,.21,1)",
    "cubic-bezier(.16,.84,.44,1)",
    "cubic-bezier(.19,1,.22,1)"
  ];

  const reduceMotion =
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // After-image outline
  function spawnBorderClone(el)
  {
    const r = el.getBoundingClientRect();
    const clone = document.createElement('div');
    clone.style.position = 'fixed';
    clone.style.left = `${r.left}px`;
    clone.style.top = `${r.top}px`;
    clone.style.width = `${r.width}px`;
    clone.style.height = `${r.height}px`;
    clone.style.border = `2px solid ${MAIN_COLOR}`;
    clone.style.background = 'transparent';
    clone.style.borderRadius = getComputedStyle(el).borderRadius;
    clone.style.pointerEvents = 'none';
    clone.style.zIndex = '50';
    clone.style.opacity = '0.7';

    clone.style.transition = `opacity ${TRAIL_FADE_MS}ms linear`;
    document.body.appendChild(clone);

    requestAnimationFrame(() =>
    {
      clone.style.opacity = '0';
    });

    setTimeout(() => clone.remove(), TRAIL_FADE_MS + 50);
  }

  // Fly a window in from a cardinal direction; it lands exactly on
  // its natural (CSS flexbox) position because we only ever animate
  // transform back to zero.
  function flyIn(el, dir, easing, delayMs)
  {
    const OFF = 800; // extra distance beyond the viewport edge

    let start;
    if (dir === 'left')        start = `translateX(${-(window.innerWidth  + OFF)}px)`;
    else if (dir === 'right')  start = `translateX(${ (window.innerWidth  + OFF)}px)`;
    else if (dir === 'top')    start = `translateY(${-(window.innerHeight + OFF)}px)`;
    else /* bottom */          start = `translateY(${ (window.innerHeight + OFF)}px)`;

    el.style.transition = 'none';
    el.style.transform = start;
    el.classList.add('landed');   // opacity handled by CSS class
    // force style flush so the starting transform is applied
    void el.offsetWidth;

    let trail = null;

    setTimeout(() =>
    {
      el.style.transition =
        `transform ${DURATION_MS}ms ${easing}`;
      el.style.transform = 'translate(0, 0)';

      trail = setInterval(() => spawnBorderClone(el), TRAIL_INTERVAL_MS);

      setTimeout(() =>
      {
        clearInterval(trail);
        // settle cleanly: hand control back to the stylesheet
        el.style.transition = '';
        el.style.transform = '';
      }, DURATION_MS + 60);
    }, delayMs);
  }

  function runSequence()
  {
    if (reduceMotion)
    {
      // no motion: just show the windows in place
      left.classList.add('landed');
      right.classList.add('landed');
      return;
    }

    // The offscreen start positions extend the document below the
    // viewport, which flashes a scrollbar while the windows fly in.
    // Suppress scrolling for the duration of the entrance.
    const prevOverflow = document.documentElement.style.overflowY;
    document.documentElement.style.overflowY = 'hidden';
    setTimeout(() =>
    {
      document.documentElement.style.overflowY = prevOverflow;
    }, DURATION_MS + 400);

    const isMobile = window.matchMedia('(max-width: 700px)').matches;

    // FIXED DIRECTIONS: Left window from bottom, right window from left
    const easingA = easings[Math.floor(Math.random() * easings.length)];
    const easingB = easings[Math.floor(Math.random() * easings.length)];

    flyIn(left, 'bottom', easingA, 60);
    flyIn(right, isMobile ? 'bottom' : 'left', easingB, isMobile ? 210 : 60);
  }

  runSequence();
});
