/* KaratUAE interface: drawer menu, search palette, search page, table-of-contents highlight. */
(function () {
  "use strict";
  var K = window.KARAT || {};
  var drawer = document.querySelector("[data-drawer]"), palette = document.querySelector("[data-search]");
  var lastFocus = null;

  function openDrawer() { lastFocus = document.activeElement; drawer.hidden = false; document.body.style.overflow = "hidden"; var c = drawer.querySelector("[data-menu-close]"); if (c) c.focus(); setExpanded(true); }
  function closeDrawer() { drawer.hidden = true; document.body.style.overflow = ""; setExpanded(false); if (lastFocus) lastFocus.focus(); }
  function setExpanded(v) { var b = document.querySelectorAll("[data-menu-open]"); for (var i = 0; i < b.length; i++) b[i].setAttribute("aria-expanded", v ? "true" : "false"); }

  var index = null, loading = null;
  function loadIndex() {
    if (index) return Promise.resolve(index);
    if (!loading) loading = fetch(K.index).then(function (r) { return r.json(); }).then(function (j) { index = j; return j; }).catch(function () { index = []; return index; });
    return loading;
  }
  function norm(s) { return (s || "").toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي"); }
  function search(q, rows) {
    q = norm(q).trim();
    if (q.length < 2) return [];
    var terms = q.split(/\s+/);
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], t = norm(r.t), n = norm(r.n), d = norm(r.d), k = norm(r.k), s = norm(r.s), score = 0;
      for (var j = 0; j < terms.length; j++) {
        var w = terms[j];
        if (t.indexOf(w) >= 0) score += 6;
        if (n.indexOf(w) >= 0) score += 5;
        if (s.indexOf(w) >= 0) score += 2;
        if (k.indexOf(w) >= 0) score += 3;
        if (d.indexOf(w) >= 0) score += 1;
      }
      if (score) out.push({ r: r, s: score });
    }
    out.sort(function (a, b) { return b.s - a.s; });
    return out.slice(0, 12).map(function (o) { return o.r; });
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function render(list, hintEl, rows) {
    list.innerHTML = rows.map(function (r) {
      return '<li><a href="' + esc(r.u) + '">' + (r.s ? '<span class="r__s">' + esc(r.s) + "</span>" : "") + '<span class="r__t">' + esc(r.t) + '</span><span class="r__d">' + esc(r.d) + "</span></a></li>";
    }).join("");
    if (hintEl) hintEl.textContent = rows.length ? rows.length + " " + K.t.results : K.t.none;
  }

  function openPalette() {
    lastFocus = document.activeElement; palette.hidden = false; document.body.style.overflow = "hidden";
    var input = palette.querySelector("[data-search-input]"); input.value = ""; input.focus();
    palette.querySelector("[data-search-results]").innerHTML = "";
    loadIndex();
  }
  function closePalette() { palette.hidden = true; document.body.style.overflow = ""; if (lastFocus) lastFocus.focus(); }

  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-menu-open]")) { e.preventDefault(); openDrawer(); }
    else if (e.target.closest("[data-menu-close]") || (drawer && e.target === drawer)) closeDrawer();
    else if (e.target.closest("[data-search-open]")) { e.preventDefault(); openPalette(); }
    else if (e.target.closest("[data-search-close]") || (palette && e.target === palette)) closePalette();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { if (palette && !palette.hidden) closePalette(); if (drawer && !drawer.hidden) closeDrawer(); }
    if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName) && palette && palette.hidden) { e.preventDefault(); openPalette(); }
    if (palette && !palette.hidden && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      var items = palette.querySelectorAll("[data-search-results] li");
      if (!items.length) return;
      e.preventDefault();
      var cur = palette.querySelector("[data-search-results] li.is-on"), idx = cur ? Array.prototype.indexOf.call(items, cur) : -1;
      idx = e.key === "ArrowDown" ? Math.min(items.length - 1, idx + 1) : Math.max(0, idx - 1);
      for (var i = 0; i < items.length; i++) items[i].classList.toggle("is-on", i === idx);
      items[idx].scrollIntoView({ block: "nearest" });
    }
    if (palette && !palette.hidden && e.key === "Enter") {
      var on = palette.querySelector("[data-search-results] li.is-on a") || palette.querySelector("[data-search-results] li a");
      if (on) { e.preventDefault(); window.location.href = on.getAttribute("href"); }
    }
  });
  if (palette) {
    var input = palette.querySelector("[data-search-input]"), results = palette.querySelector("[data-search-results]"), hint = palette.querySelector("[data-search-hint]");
    var timer;
    input.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(function () { loadIndex().then(function (rows) { var q = input.value; if (norm(q).trim().length < 2) { results.innerHTML = ""; hint.textContent = ""; return; } render(results, hint, search(q, rows)); }); }, 120);
    });
  }

  // dedicated /search/ page
  var pageInput = document.querySelector("[data-search-page-input]");
  if (pageInput) {
    var pageResults = document.querySelector("[data-search-page-results]"), pageHint = document.querySelector("[data-search-page-hint]");
    var q0 = new URLSearchParams(window.location.search).get("q") || "";
    pageInput.value = q0;
    var run = function () { loadIndex().then(function (rows) { render(pageResults, pageHint, search(pageInput.value, rows)); }); };
    if (q0) run();
    var t2; pageInput.addEventListener("input", function () { clearTimeout(t2); t2 = setTimeout(run, 150); });
  }

  // table of contents highlight
  var links = document.querySelectorAll(".toc a[href^='#']");
  if (links.length && "IntersectionObserver" in window) {
    var map = {};
    for (var i = 0; i < links.length; i++) map[links[i].getAttribute("href").slice(1)] = links[i];
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { for (var k in map) map[k].classList.remove("is-on"); var l = map[en.target.id]; if (l) l.classList.add("is-on"); }
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    for (var id in map) { var el = document.getElementById(id); if (el) io.observe(el); }
  }
})();
