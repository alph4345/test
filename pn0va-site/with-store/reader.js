/* ==========================================================================
   READER — blog & projects
   ONE axis of navigation: pick an item. The body scrolls inside its own panel,
   so there are no sub-pages, no edge arrows and no item arrows.

   The old layout had two sets of arrows that looked identical but moved on
   different axes — side chevrons turned pages within a post, bottom arrows
   flipped between posts — with nothing on screen to tell them apart. Letting
   the body scroll makes sub-pages unnecessary and deletes the ambiguity.

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
  var current = -1;

  entries.forEach(function (e, i) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "rd-row";
    b.setAttribute("aria-current", "false");
    b.innerHTML =
      '<span class="rd-row__n">' + String(i + 1).padStart(2, "0") + '</span>' +
      '<span class="rd-row__t">' + e.dataset.title + '</span>' +
      '<span class="rd-row__d">' + (e.dataset.date || "") + '</span>';
    b.addEventListener("click", function () { show(i); });
    rows.appendChild(b);
  });
  if (count) count.textContent = String(entries.length).padStart(2, "0") + " REC";

  function show(i) {
    if (i === current || !entries[i]) return;
    current = i;
    var e = entries[i];
    [].forEach.call(rows.children, function (r, n) {
      r.setAttribute("aria-current", n === i ? "true" : "false");
    });
    title.textContent = e.dataset.title;
    if (date) date.textContent = e.dataset.date || "";
    body.innerHTML = e.innerHTML;
    body.scrollTop = 0;                    // a new item starts at the top
  }

  document.addEventListener("keydown", function (ev) {
    var t = ev.target;
    if (t && t.closest && t.closest("input, textarea, [contenteditable]")) return;
    if (ev.key === "ArrowDown" || ev.key === "ArrowRight") {
      if (current < entries.length - 1) { show(current + 1); ev.preventDefault(); }
    } else if (ev.key === "ArrowUp" || ev.key === "ArrowLeft") {
      if (current > 0) { show(current - 1); ev.preventDefault(); }
    }
  });

  show(0);
})();
