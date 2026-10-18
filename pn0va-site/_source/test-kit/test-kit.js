/* ==========================================================================
   TEST KIT ONLY — a build made with  python build.py --test-kit  (the demo
   kit) carries this; the site you upload never does.
   --------------------------------------------------------------------------
   On a desktop, PHONE VIEW at the top right of every page opens that page
   in a phone-sized frame (phone-view), to see the phone layout without a
   phone. Inside the frame this shows nothing, and lays the scrollbars over
   the page as a phone's browser does, so the page keeps a phone's width.
   ========================================================================== */
(function () {
  "use strict";
  var me = document.currentScript;
  if (!me) return;
  if (window.top !== window.self) {
    var bars = document.createElement("style");
    bars.textContent = "html{scrollbar-width:none}" +
      "html::-webkit-scrollbar,body::-webkit-scrollbar,*::-webkit-scrollbar{width:0;height:0}";
    document.head.appendChild(bars);
    return;
  }
  var phone = me.getAttribute("data-phone");
  if (!phone) return;
  // the site's top: where this script is
  var siteTop = me.src.replace(/test-kit\.js(\?[^#]*)?$/, "");
  function here() { var h = location.href; return h.indexOf(siteTop) === 0 ? h.slice(siteTop.length) : ""; }

  var css = document.createElement("style");
  css.textContent =
    ".tk-phone{position:fixed;top:9px;right:12px;z-index:2147483000;display:none;align-items:center;gap:8px;" +
    "padding:8px 10px 7px;font:8px/1 'Press Start 2P',ui-monospace,monospace;letter-spacing:.12em;" +
    "text-transform:uppercase;text-decoration:none;color:#E8E2DC;background:#000;" +
    "border:1px dashed rgba(255,22,9,.7);border-radius:3px;}" +
    ".tk-phone::before{content:'';flex:0 0 auto;width:6px;height:11px;border:2px solid #FF1609;border-radius:2px;}" +
    ".tk-phone:hover{color:#fff;border-style:solid;border-color:#FF1609;}" +
    ".tk-phone:focus-visible{outline:2px solid #fff;outline-offset:2px;}" +
    "@media (min-width:1200px) and (hover:hover){.tk-phone{display:inline-flex;}}";
  document.head.appendChild(css);

  var a = document.createElement("a");
  a.className = "tk-phone";
  a.textContent = "Phone view";
  a.title = "This page at a phone's size (test kit only)";
  a.href = phone + "#" + here();
  // the address as it is when clicked (a site or cache chosen since)
  a.addEventListener("click", function () { a.href = phone + "#" + here(); });
  document.body.appendChild(a);
})();
