const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { simLabor, AUFTRAG } = require('./sim/labor.cjs');
const sniffer = fs.readFileSync(path.join(__dirname, '..', 'sniffer.js'), 'utf8');

// ===========================================================================
// "Transferliste voll" nur mit geladener Stapelgroesse (02.10.2026).
// EAs isPileFull meldet "voll", solange die Groesse des Stapels noch nicht
// geladen ist (Fund aus MagicBuyer, core/market.js). Der Bot lehnte dann
// direkt nach dem Laden der Web App den Start ab oder stoppte den Lauf mit
// "Transferliste voll (3)". Jetzt gibt sniffer.js EAs Antwort nur weiter,
// wenn getPileSize > 0 ist - sonst null, und es gilt die eigene Zaehlung.
// ===========================================================================

// Minimale Seite mit EAs Ablage (repositories.Item), Muster wie in
// tests/regressions-2026-09-29.test.cjs.
function stapelMeldung(repoItem) {
  const ausgaben = [];
  const hoerer = [];
  const window = {
    location: { href: 'https://www.ea.com/x', origin: 'https://www.ea.com' },
    addEventListener(art, fn) { if (art === 'message') hoerer.push(fn); },
    postMessage(message) { ausgaben.push(message); },
    fetch() {},
    ItemPile: { TRANSFER: 5 },
    repositories: { Item: repoItem }
  };
  window.window = window;
  function XMLHttpRequest() {}
  XMLHttpRequest.prototype = { open() {}, setRequestHeader() {} };
  const context = vm.createContext({
    window, XMLHttpRequest,
    Headers: function Headers() { this.get = () => null; },
    Request: function Request() {},
    URL, Date, Number, Boolean, String, Object, Math,
    setTimeout: () => {},
    console: { log() {}, warn() {} }
  });
  vm.runInContext(sniffer, context);
  for (const fn of hoerer) fn({ source: window, data: { __ownbot: 'stapel?' } });
  return ausgaben.filter((m) => m.__ownbot === 'stapel').pop();
}

const drei = () => [{}, {}, {}];

test('"voll" ohne geladene Stapelgroesse wird nicht geglaubt', () => {
  const m = stapelMeldung({ getTransferItems: drei, isPileFull: () => true, getPileSize: () => 0 });
  assert.equal(m.vollTransfer, null, 'null heisst: eigene Zaehlung');
  assert.equal(m.transfer, 3, 'die eigene Zaehlung kommt weiter mit');
});

test('mit geladener Stapelgroesse gilt EAs Antwort', () => {
  // Groesse nur fuer den Transferstapel (ItemPile.TRANSFER = 5).
  const groesse = (stapel) => (stapel === 5 ? 100 : 0);
  assert.equal(stapelMeldung({ getTransferItems: drei, isPileFull: () => true, getPileSize: groesse }).vollTransfer, true);
  assert.equal(stapelMeldung({ getTransferItems: drei, isPileFull: () => false, getPileSize: groesse }).vollTransfer, false);
});

test('ohne getPileSize ist nicht feststellbar, ob die Groesse geladen ist', () => {
  assert.equal(stapelMeldung({ getTransferItems: drei, isPileFull: () => true }).vollTransfer, null);
});

test('wirft getPileSize, bleibt es bei null', () => {
  const m = stapelMeldung({ getTransferItems: drei, isPileFull: () => true, getPileSize: () => { throw new Error('noch nicht da'); } });
  assert.equal(m.vollTransfer, null);
  assert.equal(m.transfer, 3);
});

test('ohne isPileFull oder ohne echtes Ja/Nein bleibt es bei null', () => {
  assert.equal(stapelMeldung({ getTransferItems: drei, getPileSize: () => 100 }).vollTransfer, null);
  assert.equal(stapelMeldung({ getTransferItems: drei, isPileFull: () => 1, getPileSize: () => 100 }).vollTransfer, null);
  assert.equal(stapelMeldung({ getTransferItems: drei, isPileFull: () => 'ja', getPileSize: () => 100 }).vollTransfer, null);
});

// ---------------------------------------------------------------------------
// Die ganze Kette: Meldung aus sniffer.js -> content.js (unveraendert) ->
// Start mit "nach dem Kauf auf die Transferliste".
// ---------------------------------------------------------------------------

async function startNachMeldung(meldung) {
  const l = simLabor({ samen: 2 });
  // Das Fenster des Labors abgreifen: Die Sitzungs-Meldung kommt mit
  // source = window bei jedem Hoerer an.
  let fenster = null;
  l.hoerer.nachricht.push((e) => { if (!fenster && e && e.source) fenster = e.source; });
  await l.uhr.vorspulen(100);
  assert.ok(fenster, 'Fenster des Labors nicht gefunden');
  fenster.postMessage(meldung);
  await l.uhr.vorspulen(10);
  const res = await l.senden('start', { cfg: Object.assign({}, AUFTRAG, { afterBuy: 'transfer' }) });
  await l.senden('stop');
  await l.uhr.vorspulen(30000);
  return res;
}

test('Kette: "voll" vor dem Laden der Groesse laesst den Start zu', async () => {
  const meldung = stapelMeldung({ getTransferItems: drei, isPileFull: () => true, getPileSize: () => 0 });
  const res = await startNachMeldung(meldung);
  assert.equal(res.ok, true, 'Start abgelehnt: ' + (res.error || ''));
});

test('Kette: "voll" mit geladener Groesse lehnt den Start weiter ab', async () => {
  const meldung = stapelMeldung({ getTransferItems: drei, isPileFull: () => true, getPileSize: () => 100 });
  const res = await startNachMeldung(meldung);
  assert.equal(res.ok, false);
  assert.match(res.error, /Transferliste ist voll/);
});
