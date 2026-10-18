// The About page's status card (about.html). Its command menu, BIO,
// SKILLS and SITE, shows one part of the card in the text window at a time:
// the hand points at the one chosen and the bar over the menu says what it
// is. A click, or the arrow keys once the menu has the focus, chooses; Home
// and End go to the ends. The level in the box on the card's corner is the
// years since data-since. Without JavaScript every part simply shows.

(function ()
{
  "use strict";

  var card = document.querySelector(".status");
  if (!card) return;
  var tabs = [].slice.call(card.querySelectorAll('[role="tab"]'));
  var menu = card.querySelector(".st-menu");
  var hand = card.querySelector(".st-hand");
  var help = document.getElementById("st-help");
  var chosen = null;

  // the hand at the chosen command's middle, its fingertip on the menu
  function point()
  {
    if (!hand || !chosen) return;
    hand.style.top = (menu.offsetTop + chosen.offsetTop + chosen.offsetHeight / 2 - hand.offsetHeight / 2) + "px";
    hand.style.left = (menu.offsetLeft + chosen.offsetLeft - hand.offsetWidth + 6) + "px";
  }

  function choose(tab, focus)
  {
    chosen = tab;
    tabs.forEach(function (t)
    {
      var on = t === tab, panel = document.getElementById(t.getAttribute("aria-controls"));
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      if (panel) panel.hidden = !on;
    });
    if (help) help.textContent = tab.getAttribute("data-help") || "";
    point();
    if (focus) tab.focus();
  }

  tabs.forEach(function (tab, i)
  {
    tab.addEventListener("click", function () { choose(tab, false); });
    tab.addEventListener("keydown", function (e)
    {
      var to = null, n = tabs.length;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") to = (i + 1) % n;
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") to = (i - 1 + n) % n;
      else if (e.key === "Home") to = 0;
      else if (e.key === "End") to = n - 1;
      if (to === null) return;
      e.preventDefault();
      choose(tabs[to], true);
    });
  });

  card.classList.add("st-live");     // one part at a time from here
  choose(tabs.filter(function (t) { return t.getAttribute("aria-selected") === "true"; })[0] || tabs[0], false);
  window.addEventListener("resize", point);
  // the menu's words in their own face can land after this runs
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(point);

  // LV: the years since it began (never under 1)
  var lv = card.querySelector("[data-since]");
  if (lv)
  {
    var years = new Date().getFullYear() - parseInt(lv.getAttribute("data-since"), 10);
    if (years >= 1) lv.textContent = (years < 10 ? "0" : "") + years;
  }
})();
