const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'sniffer.js'), 'utf8');

// Die Fassung, die vor dem Umbau ausgeliefert wurde: Merker war ein Boolean.
const ALTE_FASSUNG = `(function () {
  "use strict";
  if (window.__fc27OwnBotSnifferLoaded) return;
  window.addEventListener("message", function (event) {
    if (event.source !== window || !event.data) return;
    if (event.data.__ownbot === "session?") post({ __ownbot: "session", sid: "alt", base: null });
  });
  window.__fc27OwnBotSnifferLoaded = true;
})();`;

// Minimale Seite: genug, damit sniffer.js durchlaeuft.
function seite() {
  const gesendet = [];
  const hoerer = [];
  const window = {
    location: { href: 'https://www.ea.com/x', origin: 'https://www.ea.com' },
    addEventListener: (art, fn) => { if (art === 'message') hoerer.push(fn); },
    postMessage: (m) => gesendet.push(m),
    fetch: function () {},
    services: { Item: { bid: function (a, b) {} } }
  };
  window.window = window;
  const context = vm.createContext({
    window,
    XMLHttpRequest: function () {},
    Headers: function () { this.get = () => null; },
    Request: function () {},
    URL: URL,
    Date, Number, Boolean, String, Object, Math, setTimeout: () => {},
    console: { log() {}, warn() {} },
    post: (m) => gesendet.push(m)
  });
  context.XMLHttpRequest.prototype = { open() {}, setRequestHeader() {} };
  return { context, gesendet, hoerer, window };
}

function nachrichtSenden(s, data) {
  const vorher = s.gesendet.length;
  for (const fn of s.hoerer) fn({ source: s.window, data });
  return s.gesendet.slice(vorher);
}

test('die neue Fassung loest eine alte mit Boolean-Merker ab', () => {
  const s = seite();
  vm.runInContext(ALTE_FASSUNG, s.context);
  assert.equal(s.window.__fc27OwnBotSnifferLoaded, true, 'alte Fassung liegt in der Seite');

  vm.runInContext(source, s.context);

  // Genau hier ging die Diagnose vorher ins Leere: Die neue Fassung stieg
  // wegen des Booleans sofort wieder aus und niemand beantwortete "probe?".
  const antwort = nachrichtSenden(s, { __ownbot: 'probe?' });
  assert.equal(antwort.length, 1, 'die Sonde muss antworten');
  assert.equal(antwort[0].__ownbot, 'probe');
  assert.equal(antwort[0].services['Item.bid'].found, true);
});

test('der Merker ist danach die Versionsnummer, nicht true', () => {
  const s = seite();
  vm.runInContext(source, s.context);
  assert.equal(typeof s.window.__fc27OwnBotSnifferLoaded, 'number');
  assert.ok(s.window.__fc27OwnBotSnifferLoaded >= 2);
});

test('dieselbe Fassung zweimal geladen haengt sich nicht doppelt ein', () => {
  const s = seite();
  vm.runInContext(source, s.context);
  const hoererNachEinmal = s.hoerer.length;
  vm.runInContext(source, s.context);
  assert.equal(s.hoerer.length, hoererNachEinmal, 'zweiter Durchlauf steigt aus');

  const antwort = nachrichtSenden(s, { __ownbot: 'probe?' });
  assert.equal(antwort.length, 1, 'genau eine Antwort, nicht zwei');
});

test('eine aeltere Fassung biegt XHR und fetch nicht ein zweites Mal um', () => {
  const s = seite();
  const originalFetch = s.window.fetch;
  const originalOpen = s.context.XMLHttpRequest.prototype.open;

  vm.runInContext(ALTE_FASSUNG, s.context);
  vm.runInContext(source, s.context);

  assert.equal(s.window.fetch, originalFetch, 'fetch bleibt, wie die alte Fassung es hinterlassen hat');
  assert.equal(s.context.XMLHttpRequest.prototype.open, originalOpen);
});

test('in einer frischen Seite werden XHR und fetch umgebogen', () => {
  const s = seite();
  const originalFetch = s.window.fetch;
  vm.runInContext(source, s.context);
  assert.notEqual(s.window.fetch, originalFetch, 'ohne Vorgaenger muss mitgelesen werden');
});
