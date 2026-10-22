/* KaratUAE rate engine.
   Spot price (USD/oz) from a free keyless API -> AED at the 3.6725 peg -> per karat, per unit, per currency.
   Every element with data-gp="KARAT:UNIT:CURRENCY" gets a number. Falls back to /data/history.json. */
(function () {
  "use strict";
  var K = window.KARAT || {};
  var OZ = K.oz || 31.1034768, TOLA = K.tola || 11.6638, PEG = K.usdAed || 3.6725;
  var PURITY = K.karats || { "24": 0.999, "22": 0.916, "21": 0.875, "18": 0.75 };
  var LANG = K.lang || "en", LOCALE = LANG === "ar" ? "ar-AE-u-nu-latn" : "en-AE";
  var S = { usd: null, prev: null, fx: { USD: 1, AED: PEG }, live: false, at: null, days: [] };
  var fmtCache = {};

  function fmt(n, cur) {
    var dec = 2;
    if (n >= 10000) dec = 0;
    if (/^(INR|PKR|NPR|LKR|BDT|PHP|EGP)$/.test(cur) && n >= 1000) dec = 0;
    var key = cur + dec;
    if (!fmtCache[key]) fmtCache[key] = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: dec, maximumFractionDigits: dec });
    return fmtCache[key].format(n);
  }
  function grams(unit) {
    if (unit === "tola") return TOLA;
    if (unit === "oz") return OZ;
    if (unit === "kg") return 1000;
    var m = /^(\d+(?:\.\d+)?)g$/.exec(unit);
    return m ? +m[1] : 1;
  }
  function value(karat, unit, cur) {
    if (S.usd == null) return null;
    var rate = S.fx[cur];
    if (rate == null) return null;
    var purity = karat === "spot" ? 1 : (PURITY[karat] || 1);
    return S.usd / OZ * purity * grams(unit) * rate;
  }

  function paint() {
    var els = document.querySelectorAll("[data-gp]");
    for (var i = 0; i < els.length; i++) {
      var p = els[i].getAttribute("data-gp").split(":"), unit = p[1];
      if (unit === "unit") {
        var board = els[i].closest("[data-board]");
        unit = board ? board.getAttribute("data-unit-sel") || "g" : "g";
      }
      var v = value(p[0], unit, p[2]);
      els[i].textContent = v == null ? "…" : fmt(v, p[2]);
    }
    var fx = document.querySelectorAll("[data-fx]");
    for (var j = 0; j < fx.length; j++) {
      var c = fx[j].getAttribute("data-fx");
      fx[j].textContent = S.fx[c] ? fmt(S.fx[c], c) : "…";
    }
    var ch = document.querySelectorAll("[data-gold-change]");
    for (var q = 0; q < ch.length; q++) {
      if (S.usd && S.prev) {
        var d = S.usd - S.prev, pct = d / S.prev * 100, up = d >= 0;
        ch[q].innerHTML = '<span class="' + (up ? "up" : "down") + '">' + (up ? "▲ +" : "▼ −") + fmt(Math.abs(d), "USD") + " (" + Math.abs(pct).toFixed(2) + "%)</span>";
      } else ch[q].textContent = "…";
    }
    paintStatus();
    paintCalc();
  }

  function paintStatus() {
    var dots = document.querySelectorAll("[data-live-dot]"), txt = document.querySelectorAll("[data-live-text]");
    var label = "";
    if (S.at) {
      var w = new Date(S.at);
      var hm = w.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" });
      var dd = w.toLocaleDateString(LOCALE, { day: "numeric", month: "short", timeZone: "Asia/Dubai" });
      label = (S.live ? K.t.live : K.t.stale) + " — " + K.t.updated + " " + dd + " " + hm + " " + K.t.dubai;
    } else if (S.usd == null) label = K.t.err;
    for (var i = 0; i < dots.length; i++) dots[i].className = "live__dot " + (S.live ? "is-live" : "is-stale");
    for (var j = 0; j < txt.length; j++) txt[j].textContent = label;
  }

  function paintCalc() {
    var boxes = document.querySelectorAll("[data-calc]");
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      var w = parseFloat(b.querySelector("[data-calc-weight]").value) || 0;
      var unit = b.querySelector("[data-calc-unit]").value, k = b.querySelector("[data-calc-karat]").value, cur = b.querySelector("[data-calc-cur]").value;
      var per = value(k, "g", cur);
      b.querySelector("[data-calc-out]").textContent = per == null ? "…" : fmt(per * w * grams(unit), cur);
      b.querySelector("[data-calc-cur-label]").textContent = cur;
    }
  }

  function getJSON(url, ms) {
    return new Promise(function (ok, fail) {
      var ctrl = window.AbortController ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); fail(new Error("timeout")); }, ms || 8000);
      fetch(url, { signal: ctrl ? ctrl.signal : undefined, cache: "no-store" })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (j) { clearTimeout(timer); ok(j); }, function (e) { clearTimeout(timer); fail(e); });
    });
  }

  function loadArchive() {
    return getJSON("/data/history.json", 6000).then(function (h) {
      S.days = (h && h.days) || [];
      if (h && h.fx) for (var c in h.fx) if (S.fx[c] == null) S.fx[c] = h.fx[c];
      if (S.days.length) {
        var last = S.days[S.days.length - 1];
        if (S.usd == null) { S.usd = last.usd_oz; S.at = last.date + "T14:30:00Z"; S.live = false; }
        var today = new Date().toISOString().slice(0, 10);
        for (var i = S.days.length - 1; i >= 0; i--) if (S.days[i].date < today) { S.prev = S.days[i].usd_oz; break; }
      }
    }).catch(function () {});
  }

  function loadLive() {
    var cached = null;
    try { cached = JSON.parse(sessionStorage.getItem("karat_spot") || "null"); } catch (e) {}
    if (cached && Date.now() - cached.saved < 90000) { S.usd = cached.usd; S.at = cached.at; S.live = true; return Promise.resolve(); }
    return getJSON(K.api, 8000).then(function (j) {
      if (j && j.price) {
        S.usd = +j.price; S.at = j.updatedAt || new Date().toISOString(); S.live = true;
        try { sessionStorage.setItem("karat_spot", JSON.stringify({ usd: S.usd, at: S.at, saved: Date.now() })); } catch (e) {}
      }
    }).catch(function () {});
  }

  function loadFx() {
    if (!document.querySelector("[data-calc],[data-fx],[data-gp$=':INR'],[data-gp$=':PKR'],[data-gp$=':NPR'],[data-gp$=':LKR'],[data-gp$=':BDT'],[data-gp$=':PHP'],[data-gp$=':EGP']")) return Promise.resolve();
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem("karat_fx") || "null"); } catch (e) {}
    if (cached && Date.now() - cached.saved < 6 * 3600 * 1000) { for (var c in cached.rates) S.fx[c] = cached.rates[c]; S.fx.AED = PEG; S.fx.USD = 1; return Promise.resolve(); }
    return getJSON(K.fx, 8000).then(function (j) {
      if (j && j.rates) {
        for (var c in j.rates) S.fx[c] = j.rates[c];
        S.fx.AED = PEG; S.fx.USD = 1;
        try { localStorage.setItem("karat_fx", JSON.stringify({ rates: j.rates, saved: Date.now() })); } catch (e) {}
      }
    }).catch(function () {});
  }

  /* ---- chart ------------------------------------------------------------- */
  function series() {
    var days = S.days.slice();
    if (S.usd && S.live) {
      var today = new Date().toISOString().slice(0, 10);
      if (!days.length || days[days.length - 1].date !== today) days.push({ date: today, usd_oz: S.usd });
      else days[days.length - 1] = { date: today, usd_oz: S.usd };
    }
    return days;
  }
  function drawChart(box) {
    var cv = box.querySelector("canvas"), empty = box.querySelector("[data-chart-empty]");
    var rangeBtn = box.querySelector("[data-range].is-on"), range = rangeBtn ? +rangeBtn.getAttribute("data-range") : 180;
    var kBtn = box.querySelector("[data-chart-karat].is-on"), kk = kBtn ? kBtn.getAttribute("data-chart-karat") : "24";
    var all = series();
    var data = range ? all.filter(function (d) { return (Date.now() - new Date(d.date)) / 864e5 <= range; }) : all;
    if (data.length < 2) { if (empty) empty.hidden = false; return; }
    if (empty) empty.hidden = true;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = cv.clientWidth || 960, H = Math.round(W * 0.42);
    cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + "px";
    var ctx = cv.getContext("2d"); ctx.scale(dpr, dpr);
    var P = { l: 58, r: 16, t: 18, b: 34 }, rtl = document.documentElement.dir === "rtl";
    var vals = data.map(function (d) { return d.usd_oz / OZ * PURITY[kk] * PEG; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), pad = (hi - lo) * 0.12 || 1;
    lo -= pad; hi += pad;
    var x = function (i) { return P.l + (W - P.l - P.r) * i / (data.length - 1); };
    var y = function (v) { return P.t + (H - P.t - P.b) * (1 - (v - lo) / (hi - lo)); };
    ctx.clearRect(0, 0, W, H);
    ctx.font = "12px " + (LANG === "ar" ? "'IBM Plex Sans Arabic'," : "Manrope,") + "system-ui,sans-serif";
    ctx.strokeStyle = "rgba(18,23,40,.08)"; ctx.fillStyle = "#4C5473"; ctx.textAlign = "right";
    for (var g = 0; g <= 4; g++) {
      var gy = P.t + (H - P.t - P.b) * g / 4, gv = hi - (hi - lo) * g / 4;
      ctx.beginPath(); ctx.moveTo(P.l, gy); ctx.lineTo(W - P.r, gy); ctx.stroke();
      ctx.fillText(gv.toFixed(0), P.l - 8, gy + 4);
    }
    ctx.textAlign = "center";
    var step = Math.max(1, Math.round(data.length / 6));
    for (var i = 0; i < data.length; i += step) {
      var d = new Date(data[i].date);
      ctx.fillText(d.toLocaleDateString(LOCALE, { day: "numeric", month: "short" }), x(i), H - 10);
    }
    var grad = ctx.createLinearGradient(0, P.t, 0, H - P.b);
    grad.addColorStop(0, "rgba(227,185,74,.45)"); grad.addColorStop(1, "rgba(227,185,74,0)");
    ctx.beginPath(); ctx.moveTo(x(0), y(vals[0]));
    for (var k = 1; k < vals.length; k++) ctx.lineTo(x(k), y(vals[k]));
    ctx.lineTo(x(vals.length - 1), H - P.b); ctx.lineTo(x(0), H - P.b); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x(0), y(vals[0]));
    for (var m = 1; m < vals.length; m++) ctx.lineTo(x(m), y(vals[m]));
    ctx.strokeStyle = "#B98A1E"; ctx.lineWidth = 2.5; ctx.lineJoin = "round"; ctx.stroke();
    var li = vals.length - 1;
    ctx.beginPath(); ctx.arc(x(li), y(vals[li]), 5, 0, Math.PI * 2); ctx.fillStyle = "#0E1326"; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = "#F6DF8E"; ctx.stroke();
    ctx.fillStyle = "#0E1326"; ctx.font = "bold 13px " + (LANG === "ar" ? "'IBM Plex Sans Arabic'," : "Manrope,") + "system-ui";
    ctx.textAlign = rtl ? "left" : "right";
    ctx.fillText(fmt(vals[li], "AED") + " AED/g", x(li) - (rtl ? -10 : 10), y(vals[li]) - 10);
  }
  function drawCharts() {
    var boxes = document.querySelectorAll("[data-chart]");
    for (var i = 0; i < boxes.length; i++) drawChart(boxes[i]);
  }

  /* ---- wiring --------------------------------------------------------------- */
  document.addEventListener("click", function (e) {
    var unit = e.target.closest("[data-unit]");
    if (unit) {
      var board = unit.closest("[data-board]");
      board.setAttribute("data-unit-sel", unit.getAttribute("data-unit"));
      var all = board.querySelectorAll("[data-unit]");
      for (var i = 0; i < all.length; i++) { all[i].classList.toggle("is-on", all[i] === unit); all[i].setAttribute("aria-selected", all[i] === unit ? "true" : "false"); }
      paint();
    }
    var seg = e.target.closest("[data-range],[data-chart-karat]");
    if (seg) {
      var group = seg.parentNode.querySelectorAll("button");
      for (var j = 0; j < group.length; j++) group[j].classList.toggle("is-on", group[j] === seg);
      drawChart(seg.closest("[data-chart]"));
    }
  });
  document.addEventListener("input", function (e) { if (e.target.closest("[data-calc]")) paintCalc(); });
  document.addEventListener("change", function (e) { if (e.target.closest("[data-calc]")) paintCalc(); });
  var resizeTimer;
  window.addEventListener("resize", function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(drawCharts, 150); });

  function boot() {
    Promise.all([loadLive(), loadArchive(), loadFx()]).then(function () { paint(); drawCharts(); });
  }
  boot();
  setInterval(function () { try { sessionStorage.removeItem("karat_spot"); } catch (e) {} loadLive().then(function () { paint(); drawCharts(); }); }, 120000);
})();
