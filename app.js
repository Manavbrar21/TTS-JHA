(function () {
  "use strict";
  var CFG = self.JHA_CONFIG || {};

  /* ---------- Form content (from the TTS paper form, Rev. 2026-10-09) ---------- */
  var PRE_TASK = [
    "I understand the task and site instructions",
    "I am trained, fit, and authorized for this task",
    "Site operator contacted; unloading approval received",
    "I have the correct PPE for this product / site",
    "Equipment, hoses and connections are inspected",
    "Emergency route / muster point identified"
  ];
  var SITE_QS = [
    { q: "Fall / slip / trip risk or unsafe access?", na: true },
    { q: "Other personnel / mobile equipment nearby?", na: true },
    { q: "Site-specific permit, isolation, or LOTO required?", na: true },
    { q: "Stored energy / pressure / backpressure?", na: false },
    { q: "Any equipment defect or leak?", na: false },
    { q: "Silo fill level, capacity and vent confirmed?", na: false, note: "Here YES means confirmed with the operator — the opposite of the hazard questions above." }
  ];
  var HAZARDS = [
    { step: "SITE ACCESS", haz: "Unknown site, soft ground, debris, congestion", ctl: "Check route and site instructions; plan approach; use spotter when reversing." },
    { step: "SITE ACCESS", haz: "Pedestrians, vehicle movements, collisions", ctl: "Obey speed limits; make eye contact; separate work area; stay alert." },
    { step: "SITE ACCESS", haz: "Ice, snow, uneven ground, slips/trips", ctl: "Wear suitable footwear / traction aids; use 3 points of contact; clear walking path." },
    { step: "POSITIONING", haz: "Vehicle movement or unstable parking area", ctl: "Park on firm level surface; apply parking brake; use chocks if required." },
    { step: "BEFORE UNLOAD", haz: "Incorrect silo, high silo level, overfill", ctl: "Verify product / silo with operator; confirm available capacity and site high limit; monitor level." },
    { step: "BEFORE UNLOAD", haz: "Blocked/closed vent, silo overpressure", ctl: "Confirm proper venting / dust collector with operator before introducing product." },
    { step: "HOOKUP", haz: "Stored pressure, backflow, sudden release", ctl: "Confirm connection point and line conditions; depressurize before opening / disconnecting." },
    { step: "HOOKUP", haz: "Hose failure, failed gasket or camlock", ctl: "Inspect hose, fittings and gaskets; secure camlocks, straps and safety restraints." },
    { step: "UNLOADING", haz: "Dust exposure, product contact", ctl: "Use product/site PPE and respiratory protection as required; consult SDS." },
    { step: "UNLOADING", haz: "High pressure, plugging, line movement", ctl: "Monitor gauges, RPM, hoses and silo conditions; never exceed equipment/site limits." },
    { step: "UNLOADING", haz: "Uncontrolled activity / spills / pinch points", ctl: "Remain at controls; keep clear of pressurized lines; stop and notify operator/dispatch if unsafe." },
    { step: "FINISH", haz: "Residual pressure or trapped product", ctl: "Purge per site SOP; stop blower; verify pressure at zero before uncoupling." },
    { step: "FINISH", haz: "Hoses/tools left loose; falling objects", ctl: "Cap and secure all lines, hoses and tools; verify hatches/valves closed before travel." },
    { step: "DEPARTURE", haz: "Wrong paperwork or unsafe site exit", ctl: "Complete BOL, scale ticket and JHA; obtain signatures; remove debris; exit carefully." }
  ];
  var QUICK_ADD = [
    { haz: "Backup camera obstructed (mud / dust / snow on lens)", ctl: "Clean lens before reversing; do a walk-around; use a spotter while backing up." },
    { haz: "Poor lighting / low visibility on site", ctl: "Use high-vis and work lights; slow down; use a spotter for tight moves." },
    { haz: "High winds", ctl: "Secure hoses and loose items; watch for blowing dust and debris; stop if unsafe." },
    { haz: "Extreme cold / heat", ctl: "Dress for conditions; take warm-up / water breaks; watch for frostbite or heat stress signs." },
    { haz: "Wildlife on site or access road", ctl: "Stay in the cab if an animal is close; do not approach; notify the site operator." },
    { haz: "Other traffic not following site rules", ctl: "Keep separation; make eye contact before moving; report to site operator / dispatch." }
  ];
  var FIELDS = ["driver", "site", "date", "time", "task", "truck", "trailer", "bol", "extraControls", "signTime", "supervisor"];
  var REMEMBER = ["driver", "truck", "trailer"];   /* pre-filled on the next form */

  function blankState() {
    return {
      pre: PRE_TASK.map(function () { return ""; }),
      site: SITE_QS.map(function () { return ""; }),
      risks: HAZARDS.map(function () { return ""; }),
      extras: [], finalRisk: "", safeProceed: "", signed: false
    };
  }
  var state = blankState();

  /* ---------- Small helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function todayStr() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function nowStr() { var d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function load(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function uuid() {
    if (self.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }
  function yn(v) { return v === "yes" ? "YES" : v === "no" ? "NO" : v === "na" ? "N/A" : "—"; }
  function fmtWhen(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  var toastTimer;
  function toast(msg) {
    var t = $("toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 4500);
  }

  /* ---------- Segmented yes/no controls ---------- */
  function makeSeg(values, current, onPick) {
    var seg = el("div", "seg");
    seg.setAttribute("role", "group");
    values.forEach(function (v) {
      var b = el("button", null, v.label);
      b.type = "button";
      b.setAttribute("data-val", v.val);
      b.setAttribute("aria-pressed", current === v.val ? "true" : "false");
      b.addEventListener("click", function () {
        var now = b.getAttribute("aria-pressed") === "true" ? "" : v.val;
        seg.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
        if (now) b.setAttribute("aria-pressed", "true");
        onPick(now);
      });
      seg.appendChild(b);
    });
    return seg;
  }
  var YN = [{ val: "yes", label: "Yes" }, { val: "no", label: "No" }];
  var LMH = [{ val: "L", label: "L" }, { val: "M", label: "M" }, { val: "H", label: "H" }];

  /* ---------- Build the form ---------- */
  function checkRow(text, note, seg) {
    var row = el("div", "check-row"), q = el("div", "q", text);
    if (note) q.appendChild(el("small", null, note));
    row.appendChild(q); row.appendChild(seg);
    return row;
  }
  function buildForm() {
    var preList = $("preList"); preList.innerHTML = "";
    PRE_TASK.forEach(function (t, i) {
      preList.appendChild(checkRow(t, null, makeSeg(YN, state.pre[i], function (v) { state.pre[i] = v; refresh(); })));
    });

    var siteList = $("siteList"); siteList.innerHTML = "";
    SITE_QS.forEach(function (item, i) {
      var vals = YN.slice(); if (item.na) vals.push({ val: "na", label: "N/A" });
      siteList.appendChild(checkRow(item.q, item.note, makeSeg(vals, state.site[i], function (v) { state.site[i] = v; refresh(); })));
    });

    var hl = $("hazardList"); hl.innerHTML = "";
    HAZARDS.forEach(function (h, i) {
      var card = el("div", "hazard");
      card.setAttribute("data-step", h.step);
      card.appendChild(el("div", "step", h.step));
      card.appendChild(el("div", "haz", h.haz));
      card.appendChild(el("div", "ctl", h.ctl));
      var rr = el("div", "risk-row");
      rr.appendChild(el("span", "lbl", "Risk at this site:"));
      rr.appendChild(makeSeg(LMH, state.risks[i], function (v) { state.risks[i] = v; refresh(); }));
      card.appendChild(rr);
      hl.appendChild(card);
    });

    $("extraList").innerHTML = "";
    state.extras.forEach(function (x) { renderExtra(x, false); });

    var fl = $("finalList"); fl.innerHTML = "";
    fl.appendChild(checkRow("Final risk after controls",
      "LOW — controlled · MEDIUM — review with supervisor · HIGH — STOP WORK until controlled",
      makeSeg([{ val: "LOW", label: "LOW" }, { val: "MEDIUM", label: "MED" }, { val: "HIGH", label: "HIGH" }],
        state.finalRisk, function (v) { state.finalRisk = v; refresh(); })));
    fl.appendChild(checkRow("Are all hazards adequately controlled and is it safe to proceed?",
      "If NO — STOP and contact supervisor / dispatch.",
      makeSeg(YN, state.safeProceed, function (v) { state.safeProceed = v; refresh(); })));
  }

  function addExtra(haz, ctl) {
    var item = { haz: haz || "", ctl: ctl || "", risk: "" };
    state.extras.push(item);
    renderExtra(item, true);
    refresh();
  }
  function renderExtra(item, focus) {
    var card = el("div", "hazard");
    card.setAttribute("data-step", "EXTRA");
    card.appendChild(el("div", "step", "Additional hazard — this site"));
    var hazIn = el("input"); hazIn.type = "text"; hazIn.placeholder = "Hazard / potential harm"; hazIn.value = item.haz;
    hazIn.setAttribute("aria-label", "Additional hazard");
    hazIn.addEventListener("input", function () { item.haz = hazIn.value; refresh(); });
    var ctlIn = el("textarea"); ctlIn.placeholder = "Required control / safe work practice"; ctlIn.value = item.ctl;
    ctlIn.setAttribute("aria-label", "Control for additional hazard");
    ctlIn.addEventListener("input", function () { item.ctl = ctlIn.value; refresh(); });
    var rr = el("div", "risk-row");
    rr.appendChild(el("span", "lbl", "Risk:"));
    rr.appendChild(makeSeg(LMH, item.risk, function (v) { item.risk = v; refresh(); }));
    var rm = el("button", "remove", "Remove"); rm.type = "button";
    rm.addEventListener("click", function () {
      var i = state.extras.indexOf(item); if (i >= 0) state.extras.splice(i, 1);
      card.remove(); refresh();
    });
    rr.appendChild(rm);
    card.appendChild(hazIn); card.appendChild(ctlIn); card.appendChild(rr);
    $("extraList").appendChild(card);
    if (focus) hazIn.focus();
  }
  QUICK_ADD.forEach(function (q) {
    var c = el("button", "chip", "+ " + q.haz.split(" (")[0]); c.type = "button";
    c.addEventListener("click", function () { addExtra(q.haz, q.ctl); });
    $("chipRow").appendChild(c);
  });
  $("btnAddOwn").addEventListener("click", function () { addExtra("", ""); });
  $("btnToday").addEventListener("click", function () { $("f-date").value = todayStr(); refresh(); });
  $("btnNow").addEventListener("click", function () { $("f-time").value = nowStr(); refresh(); });
  $("btnSignNow").addEventListener("click", function () { $("f-signTime").value = nowStr(); refresh(); });

  /* ---------- Signature pad ---------- */
  var canvas = $("sig"), ctx = canvas.getContext("2d"), drawing = false, lastX = 0, lastY = 0;
  function penSetup() { ctx.lineWidth = 3.5; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#14202e"; }
  penSetup();
  function pos(e) {
    var r = canvas.getBoundingClientRect(), t = (e.touches && e.touches[0]) ? e.touches[0] : e;
    return { x: (t.clientX - r.left) * (canvas.width / r.width), y: (t.clientY - r.top) * (canvas.height / r.height) };
  }
  function start(e) { drawing = true; var p = pos(e); lastX = p.x; lastY = p.y; e.preventDefault(); }
  function move(e) {
    if (!drawing) return;
    var p = pos(e);
    ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y); ctx.stroke();
    lastX = p.x; lastY = p.y;
    if (!state.signed) {
      state.signed = true; $("sigStatus").textContent = "Signed ✓";
      if (!$("f-signTime").value) $("f-signTime").value = nowStr();
      refresh();
    }
    e.preventDefault();
  }
  function end() { drawing = false; }
  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end);
  function clearSig() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); penSetup();
    state.signed = false; $("sigStatus").textContent = "Not signed yet";
  }
  $("btnClearSig").addEventListener("click", function () { clearSig(); refresh(); });

  /* Signature as a small JPEG (white background) for the record + PDF. */
  function signatureJPEG() {
    var W = 480, H = 180, tmp = document.createElement("canvas");
    tmp.width = W; tmp.height = H;
    var t = tmp.getContext("2d");
    t.fillStyle = "#ffffff"; t.fillRect(0, 0, W, H);
    t.drawImage(canvas, 0, 0, W, H);
    return { b64: tmp.toDataURL("image/jpeg", 0.85).split(",")[1], w: W, h: H };
  }

  /* ---------- Rules ---------- */
  function stopReasons(s) {
    var r = [];
    if (s.pre.indexOf("no") >= 0) r.push("A pre-task confirmation was answered NO.");
    if (s.safeProceed === "no") r.push("“Safe to proceed” was answered NO.");
    if (s.finalRisk === "HIGH") r.push("Final risk is HIGH — STOP WORK until controlled.");
    if (s.risks.indexOf("H") >= 0 || s.extras.some(function (x) { return x.risk === "H"; })) r.push("A hazard is rated HIGH risk at this site.");
    return r;
  }
  function missingItems() {
    var m = [];
    if (!$("f-driver").value.trim()) m.push("driver name");
    if (!$("f-site").value.trim()) m.push("site / location");
    if (!$("f-date").value) m.push("date");
    if (state.pre.indexOf("") >= 0) m.push("all pre-task confirmations");
    if (state.site.indexOf("") >= 0) m.push("all site check questions");
    if (state.risks.indexOf("") >= 0) m.push("a risk rating on every hazard");
    if (!state.finalRisk) m.push("final risk");
    if (!state.safeProceed) m.push("“safe to proceed” answer");
    if (!state.signed) m.push("driver signature");
    return m;
  }

  function readFields() {
    var f = {};
    FIELDS.forEach(function (k) { f[k] = $("f-" + k).value.trim(); });
    return f;
  }

  var draftTimer;
  function refresh() {
    var reasons = stopReasons(state), banner = $("stopBanner");
    banner.classList.toggle("show", reasons.length > 0);
    $("stopReason").textContent = reasons.join(" ") + " Do not proceed — contact your supervisor / dispatch.";
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraft, 400);
  }
  FIELDS.forEach(function (k) {
    $("f-" + k).addEventListener("input", refresh);
    $("f-" + k).addEventListener("change", refresh);
  });

  /* Draft: if the app is closed half-way, the answers come back
     (the signature has to be done again). */
  function saveDraft() {
    store("jha-draft", { f: readFields(), pre: state.pre, site: state.site, risks: state.risks,
      extras: state.extras, finalRisk: state.finalRisk, safeProceed: state.safeProceed });
  }
  function restoreDraft() {
    var d = load("jha-draft"), prof = load("jha-profile") || {};
    FIELDS.forEach(function (k) { $("f-" + k).value = (d && d.f && d.f[k]) || prof[k] || ""; });
    if (d) {
      ["pre", "site", "risks"].forEach(function (k) {
        if (Array.isArray(d[k]) && d[k].length === state[k].length) state[k] = d[k];
      });
      state.extras = Array.isArray(d.extras) ? d.extras : [];
      state.finalRisk = d.finalRisk || ""; state.safeProceed = d.safeProceed || "";
    }
    if (!$("f-date").value) $("f-date").value = todayStr();
    if (!$("f-time").value) $("f-time").value = nowStr();
  }
  function resetForm() {
    store("jha-draft", null);
    state = blankState();
    clearSig();
    restoreDraft();
    buildForm();
    refresh();
    $("missingBox").classList.remove("show");
    window.scrollTo(0, 0);
  }
  $("btnReset").addEventListener("click", function () {
    if (confirm("Clear everything on this form and start over?")) resetForm();
  });

  /* ---------- Text version (used in the PDF and the office email) ---------- */
  function buildText(rec) {
    var f = rec.f, L = [];
    L.push((CFG.COMPANY || "TOTAL TRANSLOAD SERVICES (2015) INC.").toUpperCase());
    L.push("JOB HAZARD ANALYSIS (JHA) | DRY BULK / PNEUMATIC DELIVERY");
    L.push("--------------------------------------------------");
    L.push("Driver: " + (f.driver || "—"));
    L.push("Date: " + (f.date || "—") + "   Time arrived: " + (f.time || "—"));
    L.push("Site / Location: " + (f.site || "—"));
    L.push("Task / Product: " + (f.task || "—"));
    L.push("Truck #: " + (f.truck || "—") + "   Trailer #: " + (f.trailer || "—") + "   Load / BOL #: " + (f.bol || "—"));
    L.push("Form ID: " + rec.id + "   Saved on phone: " + rec.createdAt.replace("T", " ").slice(0, 16) + " UTC");
    if (rec.stop && rec.stop.length) { L.push(""); L.push("*** STOP WORK FLAGGED: " + rec.stop.join(" ") + " ***"); }
    L.push("");
    L.push("PRE-TASK SAFETY CONFIRMATION");
    PRE_TASK.forEach(function (t, i) { L.push("  [" + yn(rec.pre[i]) + "] " + t); });
    L.push("");
    L.push("SITE CHECK QUESTIONS");
    SITE_QS.forEach(function (it, i) { L.push("  [" + yn(rec.site[i]) + "] " + it.q); });
    L.push("");
    L.push("HAZARDS & CONTROLS (RISK RATED FOR THIS SITE)");
    HAZARDS.forEach(function (h, i) {
      L.push("  " + h.step + " - " + h.haz);
      L.push("    Control: " + h.ctl);
      L.push("    Risk: " + (rec.risks[i] || "not rated"));
    });
    if (rec.extras.length) {
      L.push("");
      L.push("ADDITIONAL HAZARD(S) AT THIS SITE");
      rec.extras.forEach(function (x) {
        L.push("  Hazard: " + (x.haz || "—"));
        L.push("    Control: " + (x.ctl || "—"));
        L.push("    Risk: " + (x.risk || "not rated"));
      });
    }
    L.push("");
    L.push("Extra control(s) / action(s): " + (f.extraControls || "—"));
    L.push("");
    L.push("FINAL RISK: " + (rec.finalRisk || "—") + "  (LOW = controlled - MEDIUM = review with supervisor - HIGH = STOP WORK until controlled)");
    L.push("All hazards adequately controlled and safe to proceed? " + yn(rec.safeProceed));
    L.push("");
    L.push("Driver signature: " + (rec.sig ? "Signed on device (image below)" : "NOT SIGNED"));
    L.push("Time signed: " + (f.signTime || "—"));
    L.push("Supervisor (if required): " + (f.supervisor || "—"));
    L.push("");
    L.push("STOP WORK if conditions change. Follow site-specific SOP, permit rules, equipment instructions and product SDS. Do not climb on trailers where prohibited.");
    L.push("TTS - Field JHA - " + (CFG.FORM_REV || ""));
    return L.join("\n");
  }

  /* ---------- PDF (built right here: no internet, no library) ---------- */
  function pdfClean(s) {
    return s.replace(/[—–·•]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/✓/g, "v").replace(/[^\x20-\x7E]/g, "?");
  }
  function pdfEsc(s) { return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"); }
  function pdfWrap(line, max) {
    if (line.length <= max) return [line];
    var indent = (line.match(/^\s*/) || [""])[0], out = [], rest = line;
    while (rest.length > max) {
      var cut = rest.lastIndexOf(" ", max);
      if (cut <= indent.length + 1) cut = max;
      out.push(rest.slice(0, cut));
      rest = indent + "  " + rest.slice(cut).replace(/^\s+/, "");
    }
    if (rest.trim()) out.push(rest);
    return out;
  }
  function b64ToBytes(b64) {
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function bytesToB64(bytes) {
    var s = "", CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  function buildPDF(rec) {
    var LH = 13.4, TOP = 744, BOTTOM = 54, pages = [], ops = [], y = TOP;
    function newPage() { pages.push(ops); ops = []; y = TOP; }
    function line(str, font, size, red) {
      if (y - LH < BOTTOM) newPage();
      if (str) {
        var txt = "BT /" + font + " " + size + " Tf 48 " + y.toFixed(1) + " Td (" + pdfEsc(pdfClean(str)) + ") Tj ET";
        ops.push(red ? "0.7 0.1 0.1 rg " + txt + " 0 0 0 rg" : txt);
      }
      y -= LH;
    }
    rec.text.split("\n").forEach(function (src, idx) {
      if (/^-{10,}$/.test(src)) {
        if (y - LH < BOTTOM) newPage();
        ops.push("0.08 0.73 0.85 RG 2 w 48 " + (y + 4).toFixed(1) + " m 564 " + (y + 4).toFixed(1) + " l S 0 0 0 RG");
        y -= LH; return;
      }
      var red = /^\*\*\*/.test(src) || /\[NO\]/.test(src) || /Risk: H$/.test(src);
      pdfWrap(src, 86).forEach(function (w) {
        if (idx === 0) line(w, "F2", 15);
        else if (idx === 1) line(w, "F2", 10.5);
        else if (/^[A-Z][A-Z0-9 &\/(),.\-'|]*$/.test(w) && w.length > 3) line(w, "F2", 10.5);
        else line(w, red ? "F2" : "F1", 9.5, red);
      });
    });
    var img = null;
    if (rec.sig) {
      img = b64ToBytes(rec.sig.b64);
      var imgH = 82, imgW = Math.round(imgH * rec.sig.w / rec.sig.h);
      if (y - (LH + imgH + 8) < BOTTOM) newPage();
      line("Driver signature:", "F2", 10.5);
      ops.push("q " + imgW + " 0 0 " + imgH + " 48 " + (y - imgH).toFixed(1) + " cm /Im1 Do Q");
      y -= imgH + 8;
    }
    pages.push(ops);
    var n = pages.length;
    pages.forEach(function (p, i) {
      p.push("BT /F1 8 Tf 48 30 Td (" + pdfEsc(pdfClean("Form " + rec.id + "  -  page " + (i + 1) + " of " + n)) + ") Tj ET");
    });

    var hasImg = !!img, imgNum = hasImg ? 5 : 0, firstPage = hasImg ? 6 : 5, bodies = {};
    bodies[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    bodies[2] = "<< /Type /Pages /Kids [" + pages.map(function (_, i) { return (firstPage + i * 2) + " 0 R"; }).join(" ") + "] /Count " + n + " >>";
    bodies[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>";
    bodies[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>";
    if (hasImg) {
      bodies[5] = { head: "<< /Type /XObject /Subtype /Image /Width " + rec.sig.w + " /Height " + rec.sig.h +
        " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + img.length + " >>\nstream\n", data: img, tail: "\nendstream" };
    }
    pages.forEach(function (p, i) {
      var pageNum = firstPage + i * 2, stream = p.join("\n");
      var res = "<< /Font << /F1 3 0 R /F2 4 0 R >>" + (hasImg ? " /XObject << /Im1 " + imgNum + " 0 R >>" : "") + " >>";
      bodies[pageNum] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources " + res + " /Contents " + (pageNum + 1) + " 0 R >>";
      bodies[pageNum + 1] = "<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream";
    });
    var total = firstPage + n * 2 - 1, chunks = [], len = 0, offsets = [0];
    function emitStr(s) { var b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; chunks.push(b); len += b.length; }
    function emitBytes(b) { chunks.push(b); len += b.length; }
    emitStr("%PDF-1.4\n");
    for (var k = 1; k <= total; k++) {
      offsets[k] = len;
      emitStr(k + " 0 obj\n");
      var b = bodies[k];
      if (typeof b === "string") emitStr(b); else { emitStr(b.head); emitBytes(b.data); emitStr(b.tail); }
      emitStr("\nendobj\n");
    }
    var xref = len, x = "xref\n0 " + (total + 1) + "\n0000000000 65535 f \n";
    for (var m = 1; m <= total; m++) x += ("000000000" + offsets[m]).slice(-10) + " 00000 n \n";
    emitStr(x + "trailer\n<< /Size " + (total + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF");
    var out = new Uint8Array(len), o = 0;
    chunks.forEach(function (c) { out.set(c, o); o += c.length; });
    return out;
  }
  function fileNameFor(rec) {
    var safe = function (s) { return (s || "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30); };
    return "JHA_" + (rec.f.date || "nodate") + "_" + (safe(rec.f.site) || "site") + "_" + (safe(rec.f.driver) || "driver") + ".pdf";
  }

  /* ---------- Save ---------- */
  $("btnSave").addEventListener("click", async function () {
    var m = missingItems(), box = $("missingBox");
    if (m.length) {
      box.textContent = "Still to complete: " + m.join(", ") + ".";
      box.classList.add("show");
      if (!confirm("This form is not finished:\n\n• " + m.join("\n• ") + "\n\nSave and send it anyway?")) return;
    } else box.classList.remove("show");

    var rec = {
      id: uuid(), createdAt: new Date().toISOString(), status: "pending", attempts: 0,
      f: readFields(),
      pre: state.pre.slice(), site: state.site.slice(), risks: state.risks.slice(),
      extras: state.extras.map(function (x) { return { haz: x.haz, ctl: x.ctl, risk: x.risk }; }),
      finalRisk: state.finalRisk, safeProceed: state.safeProceed,
      sig: state.signed ? signatureJPEG() : null
    };
    rec.stop = stopReasons(rec);
    rec.text = buildText(rec);
    rec.fileName = fileNameFor(rec);
    rec.pdfB64 = bytesToB64(buildPDF(rec));

    try {
      await JHADB.put(rec);
    } catch (e) {
      alert("Could not save on this phone: " + (e && e.message ? e.message : e) + "\nTry again. If it keeps failing, take a screenshot of the form.");
      return;
    }
    var prof = {}; REMEMBER.forEach(function (k) { prof[k] = rec.f[k]; }); store("jha-profile", prof);
    resetForm();
    await showDetail(rec.id);
    toast(navigator.onLine ? "Saved ✓ Sending to the office…" : "Saved on phone ✓ It will send when you have signal.");
    requestBackgroundSync();
    doSync();
  });

  /* ---------- Sending ---------- */
  function requestBackgroundSync() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready.then(function (reg) {
      if (reg.sync) reg.sync.register("jha-outbox").catch(function () {});
    }).catch(function () {});
  }
  var syncing = false;
  async function doSync(manual) {
    if (syncing) return;
    syncing = true; updatePill("sending");
    try {
      var r = await JHASync.run();
      if (manual) {
        if (r.noEndpoint) toast("Office connection is not set up yet — forms are kept on the phone.");
        else if (r.pending === 0) toast(r.sent ? "Sent " + r.sent + " form(s) to the office ✓" : "Everything is already sent ✓");
        else toast(navigator.onLine ? "Some forms could not send — will keep trying." : "No signal — will send when you're back in range.");
      } else if (r.sent) toast("Sent " + r.sent + " form(s) to the office ✓");
    } catch (e) { /* ignore: will retry */ }
    syncing = false;
    await renderAll();
  }

  /* ---------- Status pill + list ---------- */
  var lastList = [];
  function updatePill(mode) {
    var pill = $("syncPill"), pending = lastList.filter(function (r) { return r.status !== "sent"; }).length;
    pill.className = "pill";
    if (mode === "sending" && pending) { pill.textContent = "↻ Sending…"; return; }
    if (!self.JHA_CONFIG) { pill.className = "pill bad"; pill.textContent = "⚠ config.js has a typo"; }
    else if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(CFG.ENDPOINT || "")) { pill.className = "pill bad"; pill.textContent = CFG.ENDPOINT ? "⚠ Office link looks wrong" : (pending ? "⚠ " + pending + " not sent (setup)" : "⚠ Office not set up"); }
    else if (pending) { pill.className = "pill wait"; pill.textContent = "⏳ " + pending + " waiting to send"; }
    else { pill.className = "pill ok"; pill.textContent = "✓ All sent"; }
    $("countBadge").textContent = lastList.length ? "(" + lastList.length + ")" : "";
  }
  function updateNet() {
    $("netLine").textContent = navigator.onLine ? "Online" : "No signal — you can keep working, forms are saved on the phone";
  }
  function statusOf(r) {
    if (r.status === "sent") return { cls: "sent", label: "✓ Sent" };
    if (r.status === "error") return { cls: "error", label: "⚠ Not sent" };
    return { cls: "pending", label: "⏳ Waiting" };
  }
  async function renderAll() {
    try { lastList = await JHADB.all(); } catch (e) { lastList = []; }
    updatePill();
    var body = $("listBody"); body.innerHTML = "";
    if (!lastList.length) {
      body.appendChild(el("div", "empty", "No forms yet. Fill in a New JHA and tap Save — it will show up here."));
    }
    lastList.forEach(function (r) {
      var st = statusOf(r), b = el("button", "form-item " + st.cls); b.type = "button";
      var main = el("div", "main");
      main.appendChild(el("div", "site", r.f.site || "(no site)"));
      main.appendChild(el("div", "meta", (r.f.date || "") + " · " + (r.f.time || "") + " · " + (r.f.driver || "no name") + (r.f.task ? " · " + r.f.task : "")));
      b.appendChild(main);
      var right = el("div"); right.appendChild(el("span", "badge " + st.cls, st.label));
      if (r.stop && r.stop.length) right.appendChild(el("span", "badge stop", "STOP"));
      b.appendChild(right);
      b.addEventListener("click", function () { showDetail(r.id); });
      body.appendChild(b);
    });
    if (currentDetail) {
      var cur = lastList.filter(function (r) { return r.id === currentDetail; })[0];
      if (cur) renderDetail(cur);
    }
  }

  /* ---------- Viewer (what the driver shows on site) ---------- */
  var currentDetail = null;
  async function showDetail(id) {
    var rec = await JHADB.get(id);
    if (!rec) return;
    currentDetail = id;
    renderDetail(rec);
    show("detail");
  }
  function ansSpan(v) {
    var cls = v === "yes" ? "YES" : v === "no" ? "NO" : v === "na" ? "NA" : (v || "none");
    var text = (v === "yes" || v === "no" || v === "na") ? yn(v) : (v || "—");
    return el("span", "ans " + cls, text);
  }
  function vrow(answer, text, sub) {
    var r = el("div", "vrow"); r.appendChild(answer);
    var t = el("div", null, text); if (sub) t.appendChild(el("span", "ctl", sub));
    r.appendChild(t); return r;
  }
  function renderDetail(rec) {
    var f = rec.f, body = $("detailBody"); body.innerHTML = "";
    var st = statusOf(rec);
    var sbox = el("div", "status-box " + st.cls);
    if (rec.status === "sent") sbox.textContent = "✓ Sent to the office " + fmtWhen(rec.sentAt) + ".";
    else if (!CFG.ENDPOINT) sbox.textContent = "Saved on this phone. Office connection is not set up yet, so it has not been sent.";
    else if (rec.status === "error") sbox.textContent = "Saved on this phone, but the office did not accept it yet (" + (rec.lastError || "error") + "). It will keep trying.";
    else sbox.textContent = "⏳ Saved on this phone — will send to the office automatically when there's signal.";
    body.appendChild(sbox);

    var v = el("div", "viewer"), h = el("div", "vhead");
    h.appendChild(el("div", "co", CFG.COMPANY || "Total Transload Services"));
    h.appendChild(el("h2", null, "Job Hazard Analysis"));
    h.appendChild(el("div", null, "Dry Bulk / Pneumatic Delivery"));
    v.appendChild(h);
    var vb = el("div", "vbody");

    if (rec.stop && rec.stop.length) {
      var sb = el("div", "stop-banner show"); sb.appendChild(el("span", "big", "⛔ Stop Work flagged"));
      sb.appendChild(document.createTextNode(rec.stop.join(" "))); vb.appendChild(sb);
    }
    vb.appendChild(el("h3", null, "Job details"));
    var dl = el("dl", "kv");
    [["Driver", f.driver], ["Site", f.site], ["Date", f.date], ["Time arrived", f.time], ["Task / Product", f.task],
     ["Truck #", f.truck], ["Trailer #", f.trailer], ["Load / BOL #", f.bol]].forEach(function (p) {
      dl.appendChild(el("dt", null, p[0])); dl.appendChild(el("dd", null, p[1] || "—"));
    });
    vb.appendChild(dl);

    vb.appendChild(el("h3", null, "Pre-task safety confirmation"));
    PRE_TASK.forEach(function (t, i) { vb.appendChild(vrow(ansSpan(rec.pre[i]), t)); });
    vb.appendChild(el("h3", null, "Site check questions"));
    SITE_QS.forEach(function (it, i) { vb.appendChild(vrow(ansSpan(rec.site[i]), it.q)); });
    vb.appendChild(el("h3", null, "Hazards & controls — risk"));
    HAZARDS.forEach(function (hz, i) { vb.appendChild(vrow(ansSpan(rec.risks[i]), hz.step + ": " + hz.haz, hz.ctl)); });
    if (rec.extras.length) {
      vb.appendChild(el("h3", null, "Additional hazards at this site"));
      rec.extras.forEach(function (x) { vb.appendChild(vrow(ansSpan(x.risk), x.haz || "—", x.ctl)); });
    }
    if (f.extraControls) { vb.appendChild(el("h3", null, "Extra controls / actions")); vb.appendChild(el("div", null, f.extraControls)); }
    vb.appendChild(el("h3", null, "Final assessment"));
    vb.appendChild(vrow(ansSpan(rec.finalRisk), "Final risk after controls"));
    vb.appendChild(vrow(ansSpan(rec.safeProceed), "All hazards controlled and safe to proceed"));
    vb.appendChild(el("h3", null, "Sign-off"));
    if (rec.sig) { var im = el("img", "sig-img"); im.alt = "Driver signature"; im.src = "data:image/jpeg;base64," + rec.sig.b64; vb.appendChild(im); }
    else vb.appendChild(el("div", null, "NOT SIGNED"));
    var dl2 = el("dl", "kv"); dl2.style.marginTop = "8px";
    [["Time signed", f.signTime], ["Supervisor", f.supervisor], ["Form ID", rec.id]].forEach(function (p) {
      dl2.appendChild(el("dt", null, p[0])); dl2.appendChild(el("dd", null, p[1] || "—"));
    });
    vb.appendChild(dl2);
    v.appendChild(vb);
    body.appendChild(v);

    var row = el("div", "btn-row");
    var bOpen = el("button", "btn btn-primary", "📄 Open PDF"); bOpen.type = "button";
    bOpen.addEventListener("click", function () { openPDF(rec); });
    var bShare = el("button", "btn btn-secondary", "Share PDF…"); bShare.type = "button";
    bShare.addEventListener("click", function () { sharePDF(rec); });
    row.appendChild(bOpen); row.appendChild(bShare);
    body.appendChild(row);
    if (rec.status !== "sent") {
      var bSend = el("button", "btn btn-secondary", "↻ Try sending now"); bSend.type = "button"; bSend.style.marginTop = "10px";
      bSend.addEventListener("click", function () { doSync(true); });
      body.appendChild(bSend);
    }
    var bDel = el("button", "btn btn-ghost", "Delete from this phone"); bDel.type = "button"; bDel.style.marginTop = "10px";
    bDel.addEventListener("click", async function () {
      var warn = rec.status === "sent" ? "Delete this form from the phone? (The office keeps its copy.)"
        : "This form has NOT reached the office yet. Deleting it means the office never gets it. Delete anyway?";
      if (!confirm(warn)) return;
      await JHADB.del(rec.id); currentDetail = null; await renderAll(); show("list");
    });
    body.appendChild(bDel);
  }
  function pdfBlob(rec) { return new Blob([b64ToBytes(rec.pdfB64)], { type: "application/pdf" }); }
  function openPDF(rec) {
    var url = URL.createObjectURL(pdfBlob(rec));
    var w = window.open(url, "_blank");
    if (!w) { var a = document.createElement("a"); a.href = url; a.download = rec.fileName; document.body.appendChild(a); a.click(); a.remove(); }
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }
  function sharePDF(rec) {
    var file = null;
    try { file = new File([pdfBlob(rec)], rec.fileName, { type: "application/pdf" }); } catch (e) {}
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: rec.fileName }).catch(function () {});
    } else openPDF(rec);
  }

  /* ---------- Views ---------- */
  function show(view) {
    $("viewNew").hidden = view !== "new";
    $("viewList").hidden = view !== "list";
    $("viewDetail").hidden = view !== "detail";
    $("tabNew").setAttribute("aria-selected", view === "new" ? "true" : "false");
    $("tabList").setAttribute("aria-selected", view !== "new" ? "true" : "false");
    if (view !== "detail") currentDetail = null;
    window.scrollTo(0, 0);
  }
  $("tabNew").addEventListener("click", function () { show("new"); });
  $("tabList").addEventListener("click", function () { renderAll(); show("list"); });
  $("btnBack").addEventListener("click", function () { show("list"); });
  $("btnSyncNow").addEventListener("click", function () { doSync(true); });
  $("syncPill").addEventListener("click", function () { renderAll(); show("list"); doSync(true); });

  /* ---------- Install prompt (Android) ---------- */
  var deferredInstall = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferredInstall = e; $("btnInstall").hidden = false; });
  $("btnInstall").addEventListener("click", function () {
    if (!deferredInstall) return;
    deferredInstall.prompt(); deferredInstall = null; $("btnInstall").hidden = true;
  });
  var standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (standalone) $("installBox").hidden = true;

  /* ---------- Auto-send triggers ---------- */
  window.addEventListener("online", function () { updateNet(); doSync(); });
  window.addEventListener("offline", updateNet);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) doSync(); });
  setInterval(function () { if (navigator.onLine) doSync(); }, 60000);

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").then(function (reg) {
      /* Android Chrome (installed app): also check every ~12h in the background */
      if (reg.periodicSync) reg.periodicSync.register("jha-outbox", { minInterval: 12 * 3600 * 1000 }).catch(function () {});
    }).catch(function () {});
    navigator.serviceWorker.addEventListener("message", function (e) { if (e.data && e.data.type === "synced") renderAll(); });
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});

  /* ---------- Start ---------- */
  $("revLine").textContent = CFG.FORM_REV || "";
  restoreDraft();
  buildForm();
  refresh();
  updateNet();
  renderAll().then(function () { requestBackgroundSync(); doSync(); });
})();
