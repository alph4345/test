// ------------------------------------------------------------
// Paged window navigation (Blog & Projects)
//
// Two levels:
//  - EDGE ARROWS on the sides of the window (and touch swipes)
//    turn pages WITHIN the current post/project
//  - the bottom-bar arrows flip to the previous / next item
//  - archive links warp straight to an item (bookmark jump)
//
// The unit name ("Post", "Project") comes from
// <main id="windows" data-unit="...">.
// ------------------------------------------------------------
window.addEventListener('DOMContentLoaded', function () {
  const main = document.getElementById('windows');
  if (!main || !main.classList.contains('paged')) return;

  const unit = main.dataset.unit || 'Page';
  const container = document.getElementById('window-left');
  const indicator = document.getElementById('page-indicator');
  const items = Array.from(container.querySelectorAll('.page-content'));
  const totalItems = items.length;
  if (!totalItems) return;

  let currentItem = 1;
  let currentSub = 1;
  let busy = false;

  const subsOf = (n) => items[n - 1].querySelectorAll('.sub-page');

  // ---------- edge arrows + swipe hint (built here: JS-only UI) ----------
  const mkEdge = (side) => {
    const b = document.createElement('button');
    b.className = 'edge-arrow edge-' + side;
    b.setAttribute('aria-label', side === 'prev' ? 'Previous page' : 'Next page');
    b.innerHTML = '<span class="edge-chevron"></span>';
    container.appendChild(b);
    return b;
  };
  const edgePrev = mkEdge('prev');
  const edgeNext = mkEdge('next');

  const hint = document.createElement('div');
  hint.className = 'edge-hint';
  hint.textContent = 'TURN PAGE';
  container.appendChild(hint);

  // intro: arrows nudge back and forth, hint fades away on its own
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduceMotion) {
    edgePrev.classList.add('edge-nudge');
    edgeNext.classList.add('edge-nudge');
    setTimeout(() => {
      edgePrev.classList.remove('edge-nudge');
      edgeNext.classList.remove('edge-nudge');
    }, 3200);
  }
  setTimeout(() => hint.remove(), 4600);

  // ---------- navigation state ----------
  function updateNavigation() {
    const subCount = subsOf(currentItem).length;
    indicator.innerHTML = unit + ' ' + currentItem + '/' + totalItems +
      ' \u00B7 Page ' + currentSub + '/' + subCount;
    document.getElementById('prev-item').classList.toggle('disabled', currentItem === 1);
    document.getElementById('next-item').classList.toggle('disabled', currentItem === totalItems);
    edgePrev.classList.toggle('edge-off', currentSub === 1);
    edgeNext.classList.toggle('edge-off', currentSub === subCount);
  }

  function resetSubs(n) {
    subsOf(n).forEach((s, i) => s.classList.toggle('current', i === 0));
    currentSub = 1;
  }

  // ---------- page turn within the current item ----------
  function turnPage(target) {
    const subs = subsOf(currentItem);
    if (busy || target < 1 || target > subs.length || target === currentSub) return;
    busy = true;

    const forward = target > currentSub;
    const from = subs[currentSub - 1];
    const to = subs[target - 1];

    container.classList.add('flipping');
    from.classList.add(forward ? 'flip-out-left' : 'flip-out-right');

    setTimeout(() => {
      from.classList.remove('current', 'flip-out-left', 'flip-out-right');
      to.classList.add('current', forward ? 'flip-in-right' : 'flip-in-left');
      container.scrollTop = 0;

      setTimeout(() => {
        to.classList.remove('flip-in-right', 'flip-in-left');
        container.classList.remove('flipping');
        busy = false;
      }, 450);
    }, 350);

    currentSub = target;
    updateNavigation();
  }

  // ---------- flip to another item ----------
  function flipToItem(target, mode) {
    if (busy || target < 1 || target > totalItems || target === currentItem) return;
    busy = true;

    const forward = target > currentItem;
    const from = items[currentItem - 1];
    const to = items[target - 1];
    resetSubs(target);

    if (mode === 'bookmark') {
      container.classList.add('bookmarking');
      from.classList.add('bookmark-out');
      setTimeout(() => {
        from.classList.remove('current', 'bookmark-out');
        to.classList.add('current', 'bookmark-in');
        container.scrollTop = 0;
        setTimeout(() => {
          to.classList.remove('bookmark-in');
          container.classList.remove('bookmarking');
          busy = false;
        }, 460);
      }, 240);
    } else {
      container.classList.add('flipping');
      from.classList.add(forward ? 'flip-out-left' : 'flip-out-right');
      setTimeout(() => {
        from.classList.remove('current', 'flip-out-left', 'flip-out-right');
        to.classList.add('current', forward ? 'flip-in-right' : 'flip-in-left');
        container.scrollTop = 0;
        setTimeout(() => {
          to.classList.remove('flip-in-right', 'flip-in-left');
          container.classList.remove('flipping');
          busy = false;
        }, 450);
      }, 350);
    }

    currentItem = target;
    updateNavigation();
  }

  // ---------- wiring ----------
  edgePrev.addEventListener('click', () => turnPage(currentSub - 1));
  edgeNext.addEventListener('click', () => turnPage(currentSub + 1));
  document.getElementById('prev-item').addEventListener('click', () => flipToItem(currentItem - 1));
  document.getElementById('next-item').addEventListener('click', () => flipToItem(currentItem + 1));

  document.querySelectorAll('.archive-link').forEach(link => {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      flipToItem(parseInt(this.getAttribute('data-page'), 10), 'bookmark');
    });
  });

  // touch swipe = page turn (what the nudging arrows advertise)
  let swipeX = null;
  container.addEventListener('touchstart', (e) => {
    swipeX = e.touches[0].clientX;
  }, { passive: true });
  container.addEventListener('touchend', (e) => {
    if (swipeX === null) return;
    const dx = e.changedTouches[0].clientX - swipeX;
    swipeX = null;
    if (Math.abs(dx) < 45) return;
    if (dx < 0) turnPage(currentSub + 1);
    else turnPage(currentSub - 1);
  }, { passive: true });

  updateNavigation();
});
