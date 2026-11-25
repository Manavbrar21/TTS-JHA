/* ==========================================================
   Shared by the page and the service worker:
   - JHADB:   the on-phone store of every form (IndexedDB)
   - JHASync: sends any unsent form to the office
   ========================================================== */
(function (g) {
  "use strict";

  var DB_NAME = "tts-jha", STORE = "forms", dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { dbPromise = null; reject(req.error); };
    });
    return dbPromise;
  }
  function tx(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode), store = t.objectStore(STORE), out;
        var r = fn(store);
        if (r) r.onsuccess = function () { out = r.result; };
        t.oncomplete = function () { resolve(out); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  var JHADB = {
    put: function (rec) { return tx("readwrite", function (s) { return s.put(rec); }); },
    get: function (id) { return tx("readonly", function (s) { return s.get(id); }); },
    del: function (id) { return tx("readwrite", function (s) { return s.delete(id); }); },
    all: function () {
      return tx("readonly", function (s) { return s.getAll(); }).then(function (list) {
        return (list || []).sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
      });
    }
  };

  function payload(rec, cfg) {
    var f = rec.f || {};
    return {
      token: cfg.TOKEN,
      id: rec.id,
      createdAt: rec.createdAt,
      driver: f.driver || "", site: f.site || "", date: f.date || "", time: f.time || "",
      task: f.task || "", truck: f.truck || "", trailer: f.trailer || "", bol: f.bol || "",
      supervisor: f.supervisor || "",
      finalRisk: rec.finalRisk || "", safeProceed: rec.safeProceed || "",
      stopReasons: rec.stop || [],
      text: rec.text || "",
      fileName: rec.fileName,
      pdfBase64: rec.pdfB64
    };
  }

  var running = null;

  /* Sends every unsent form. Resolves with {sent, pending, noEndpoint}.
     With opts.throwOnFail (used by Background Sync) it rejects when a
     form could not be sent, so the phone retries later on its own. */
  function run(opts) {
    opts = opts || {};
    if (running) return running;
    var cfg = g.JHA_CONFIG || {};
    running = (async function () {
      var list = await JHADB.all();
      var pending = list.filter(function (r) { return r.status !== "sent"; });
      var result = { sent: 0, pending: pending.length, noEndpoint: !cfg.ENDPOINT, failed: false };
      if (!cfg.ENDPOINT || !pending.length) return result;

      for (var i = 0; i < pending.length; i++) {
        var rec = pending[i];
        try {
          var res = await fetch(cfg.ENDPOINT, {
            method: "POST",
            /* text/plain keeps this a "simple" request, which Apps Script accepts */
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload(rec, cfg)),
            redirect: "follow"
          });
          var j = null;
          try { j = await res.json(); } catch (e) { j = null; }
          var fresh = (await JHADB.get(rec.id)) || rec;
          fresh.attempts = (fresh.attempts || 0) + 1;
          fresh.lastTry = new Date().toISOString();
          if (j && j.ok) {
            fresh.status = "sent";
            fresh.sentAt = new Date().toISOString();
            fresh.lastError = "";
            if (j.fileUrl) fresh.fileUrl = j.fileUrl;
            result.sent++; result.pending--;
          } else {
            fresh.status = "error";
            fresh.lastError = (j && j.error) ? String(j.error) : ("Office server answered " + res.status);
            result.failed = true;
          }
          await JHADB.put(fresh);
        } catch (e) {
          /* No signal / network dropped: stop for now, try again later. */
          result.failed = true;
          break;
        }
      }

      /* Tidy up old forms that the office already has. */
      var keep = (cfg.KEEP_SENT_DAYS || 60) * 864e5, now = Date.now();
      for (var k = 0; k < list.length; k++) {
        var r = list[k];
        if (r.status === "sent" && r.sentAt && now - Date.parse(r.sentAt) > keep) await JHADB.del(r.id);
      }
      return result;
    })().finally(function () { running = null; });

    return running.then(function (r) {
      if (opts.throwOnFail && r.failed) throw new Error("JHA: some forms not sent yet");
      return r;
    });
  }

  g.JHADB = JHADB;
  g.JHASync = { run: run };
})(self);
