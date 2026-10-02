const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// ===========================================================================
// Haken "Bei EA-Warnung sofort stoppen" (02.10.2026) im ganzen Lauf: die
// Verkaufs-Wache in der Pause und beim ersten Blick zum Laufstart.
//
// Warum eigens: Beide Stellen haben das Ergebnis der Wache bisher erst am
// Ende der Pause (21-117 s) bzw. gar nicht ausgewertet. Mit dem Haken soll
// eine EA-Warnung dort den Lauf sofort beenden. Ohne Haken bleibt alles,
// wie es war: Der FST-Modus meldet nur.
//
// Die Wartezeiten werden fuer den Test gekuerzt (wie MOVE_DELAY in
// full-run.test.cjs). Jede Ersetzung wird geprueft - greift eine nicht mehr,
// wuerde der Test sonst still etwas anderes messen.
// ===========================================================================

const ERSETZUNGEN = [
  ['MOVE_DELAY_MIN_MS: 5000', 'MOVE_DELAY_MIN_MS: 5'],
  ['MOVE_DELAY_MAX_MS: 6500', 'MOVE_DELAY_MAX_MS: 8'],
  ['VERKAUF_ABSTAND_MIN_MS: 1100', 'VERKAUF_ABSTAND_MIN_MS: 5'],
  ['VERKAUF_ABSTAND_MAX_MS: 1800', 'VERKAUF_ABSTAND_MAX_MS: 8'],
  // Pausen-Stufe "Wie FST": nach 2 Suchen eine Pause von mindestens 21 s.
  ['every: streuenAnzahl(35, 5),', 'every: 2,'],
  // Suchabstand "Wie FST" von gut 3 s auf 60-80 ms.
  ['return streuen(3310, 4010, 0.50, 100, 600);', 'return streuen(60, 80, 0, 0, 0);']
];
let quelle = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
for (const [alt, neu] of ERSETZUNGEN) {
  assert.ok(quelle.includes(alt), 'Ersetzung greift nicht mehr: ' + alt);
  quelle = quelle.replace(alt, neu);
}

// abErsterFrisch: schon die erste frische Abfrage der Transferliste
// antwortet mit HTTP 461 (sonst erst die zweite). volleListe: Der Speicher
// der App liefert 95 Karten (TRANSFERLISTE_WARN) - dann fragt die Wache
// schon beim ersten Blick frisch nach.
function labor(settings, { abErsterFrisch = false, volleListe = false } = {}) {
  const speicher = { settings };
  const gesendet = [];
  const anfragen = [];
  const hoerer = { nachricht: [], befehl: [] };
  const antwort = (status, daten) => ({ ok: status >= 200 && status < 300, status, json: async () => daten });
  const window = {
    location: { origin: 'https://www.ea.com', href: 'https://www.ea.com/x' },
    addEventListener(art, fn) { if (art === 'message') hoerer.nachricht.push(fn); },
    postMessage(data) { setTimeout(() => { for (const fn of hoerer.nachricht) fn({ source: window, data }); }, 0); }
  };
  window.window = window;
  let frische = 0;
  // Nachgemachte Seite (sniffer.js): Muenzen und Transferliste. Ohne Antwort
  // bliebe VERKAUF.laeuft haengen, und die Wache in der Pause fiele aus.
  hoerer.nachricht.push((ev) => {
    const d = ev && ev.data;
    if (d && d.__ownbot === 'muenzen?') window.postMessage({ __ownbot: 'muenzen', requestId: d.requestId, coins: 99100 });
    if (d && d.__ownbot === 'tradepile?') {
      anfragen.push('tradepile ' + (d.frisch ? 'frisch' : 'speicher'));
      const fehler = d.frisch && ++frische >= (abErsterFrisch ? 1 : 2);
      const items = volleListe ? Array.from({ length: 95 }, (_, i) => ({ itemId: String(9000 + i), tradeState: 'expired' })) : [];
      window.postMessage(Object.assign({ __ownbot: 'tradepile', requestId: d.requestId }, fehler ? { error: 'HTTP 461' } : { items }));
    }
  });
  const ANG = { tradeId: 5001, buyNowPrice: 900, startingBid: 150, currentBid: 0, expires: 3600, tradeState: 'active', bidState: 'none', itemData: { id: 777, assetId: 231747, resourceId: 50231747, rating: 84, rareflag: 1 } };
  let angebote = [ANG];
  const context = vm.createContext({
    window, globalThis: {}, document: { addEventListener() {}, body: null }, console: { log() {}, warn() {}, error() {} },
    setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); if (t.unref) t.unref(); return t; },
    setInterval: (fn, ms) => { const t = setInterval(fn, ms); if (t.unref) t.unref(); return t; },
    clearTimeout, clearInterval, URL, URLSearchParams, AbortController, Date, Math, JSON, Promise, Object, Array, Number, String, Boolean, Set, Map, RegExp, Error,
    chrome: {
      runtime: { id: 'labor', onMessage: { addListener: (fn) => hoerer.befehl.push(fn) }, sendMessage: async (m) => { gesendet.push(m); return {}; } },
      storage: {
        local: {
          get: async (keys) => {
            const l = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys || {});
            const o = {};
            for (const k of l) if (k in speicher) o[k] = JSON.parse(JSON.stringify(speicher[k]));
            return o;
          },
          set: async (obj) => { Object.assign(speicher, JSON.parse(JSON.stringify(obj))); }
        },
        onChanged: { addListener() {} }
      }
    },
    fetch: async (url, init) => {
      const u = String(url);
      const m = (init && init.method) || 'GET';
      anfragen.push(m + ' ' + u.split('/fc27')[1]);
      if (u.includes('/transfermarket?')) return antwort(200, { auctionInfo: angebote, credits: 100000 });
      if (/\/trade\/\d+\/bid$/.test(u)) { angebote = []; return antwort(200, { credits: 99100, auctionInfo: [{ itemData: ANG.itemData }] }); }
      if (u.endsWith('/item')) return antwort(200, { itemData: [{ id: '777', success: true }] });
      return antwort(404, {});
    }
  });
  vm.runInContext(quelle, context);
  const senden = (cmd, extra) => new Promise((resolve) => {
    let fertig = false;
    const nb = setTimeout(() => { if (!fertig) resolve(null); }, 800);
    if (nb.unref) nb.unref();
    for (const fn of hoerer.befehl) fn(Object.assign({ cmd: 'v11/' + cmd }, extra || {}), { id: 'labor' }, (a) => { if (!fertig) { fertig = true; clearTimeout(nb); resolve(a); } });
  });
  window.postMessage({ __ownbot: 'session', sid: 'labor-sitzung-1234', base: 'https://utas.external.s2.fut.ea.com/ut/game/fc27' });
  return { senden, gesendet, anfragen };
}

const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const AUFTRAG = { targets: [{ playerId: 231747, playerName: 'Testspieler', rating: 84, maxPrice: 1000 }], budget: 5000, maxBuys: 3, timeLimitMin: 5, afterBuy: 'transfer', pausePreset: 'fst' };
const FST = { fstModus: true, fstModusV1: true };

for (const haken of [false, true]) {
  test('Wache in der Pause meldet 461, Haken ' + (haken ? 'an: Lauf endet sofort' : 'aus: Lauf geht weiter'), async () => {
    const l = labor(Object.assign({ warnungStopp: haken }, FST));
    await warte(50);
    const start = await l.senden('start', { cfg: AUFTRAG });
    assert.equal(start.ok, true, start && start.error);
    // Die Pause dauert mindestens 21 s - nach 900 ms ist sie sicher nicht um.
    await warte(900);
    const st = (await l.senden('status')).status;
    assert.equal(l.anfragen.filter((a) => a === 'tradepile frisch').length >= 2, true, 'die Wache hat nicht zweimal frisch gelesen: ' + l.anfragen.join(', '));
    if (haken) {
      assert.equal(st.running, false);
      assert.match(st.message, /PERMISSION_DENIED/);
      // Genau ein Stopp: eine dringende Meldung, nicht zwei.
      assert.equal(l.gesendet.filter((m) => m.dringend === true).length, 1);
    } else {
      assert.equal(st.running, true);
      assert.equal(l.gesendet.filter((m) => m.dringend === true).length, 0);
    }
    await l.senden('stop');
  });
}

for (const haken of [false, true]) {
  test('Wache beim ersten Blick meldet 461, Haken ' + (haken ? 'an: Lauf endet' : 'aus: Lauf geht weiter'), async () => {
    const l = labor(Object.assign({ warnungStopp: haken }, FST), { abErsterFrisch: true, volleListe: true });
    await warte(50);
    const start = await l.senden('start', { cfg: Object.assign({}, AUFTRAG, { afterBuy: 'keep', pausePreset: 'off' }) });
    assert.equal(start.ok, true, start && start.error);
    await warte(400);
    const st = (await l.senden('status')).status;
    assert.ok(l.anfragen.includes('tradepile frisch'), 'kein frischer Blick: ' + l.anfragen.join(', '));
    if (haken) {
      assert.equal(st.running, false);
      assert.match(st.message, /PERMISSION_DENIED/);
      assert.equal(l.gesendet.filter((m) => m.dringend === true).length, 1);
    } else {
      assert.equal(st.running, true);
    }
    await l.senden('stop');
  });
}
