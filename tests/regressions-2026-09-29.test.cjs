const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
const popup = fs.readFileSync(path.join(root, 'popup.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8').replace(/^\uFEFF/, ''));
const sniffer = fs.readFileSync(path.join(root, 'sniffer.js'), 'utf8');

test('autoAbraeumen kommt in der Oberflaeche genau einmal vor', () => {
  const treffer = html.match(/\bid=["']autoAbraeumen["']/g) || [];
  assert.equal(treffer.length, 1, 'doppelte IDs erzeugen zwei Schalter mit nur einem gespeicherten Zustand');
});

test('die Speicheranzeige verwendet mit unlimitedStorage keine 10-MB-Quote', () => {
  assert.ok(manifest.permissions.includes('unlimitedStorage'));
  assert.match(popup, /SPEICHER_UNGEWOEHNLICH\s*=\s*200\s*\*\s*1024\s*\*\s*1024/);
  assert.doesNotMatch(popup, /von 10 MB/);
});

function snifferSeite() {
  const ausgaben = [];
  const hoerer = [];
  let clearSold = 0;
  let removeSold = 0;
  let dirty = 0;

  function UTTransferListViewController() {}
  UTTransferListViewController.prototype._clearSold = () => { clearSold += 1; };

  const window = {
    location: { href: 'https://www.ea.com/x', origin: 'https://www.ea.com' },
    addEventListener(art, fn) { if (art === 'message') hoerer.push(fn); },
    postMessage(message) { ausgaben.push(message); },
    fetch() {},
    UTTransferListViewController,
    ItemPile: { TRANSFER: 'transfer' },
    services: {
      Item: {
        transfersDao: { removeSold() { removeSold += 1; return { observe() {} }; } }
      }
    },
    repositories: {
      Item: {
        getTransferItems: () => [{ _auction: { tradeState: 'closed' } }],
        setDirty: () => { dirty += 1; }
      }
    }
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

  return {
    senden(data) {
      for (const fn of hoerer) fn({ source: window, data });
    },
    ausgaben,
    zaehler: () => ({ clearSold, removeSold, dirty })
  };
}

test('der angeforderte clearSold-Fallback benutzt wirklich nur FSTs Weg', () => {
  const seite = snifferSeite();
  seite.senden({ __ownbot: 'verkauf?', requestId: 7, art: 'abraeumen', daten: { weg: 'clearSold' } });

  assert.deepEqual(seite.zaehler(), { clearSold: 1, removeSold: 0, dirty: 1 });
  const antwort = seite.ausgaben.find((m) => m.__ownbot === 'verkauf' && m.requestId === 7);
  assert.ok(antwort, 'der Seitenweg muss antworten');
  assert.equal(antwort.ok, true);
  assert.equal(antwort.weg, '_clearSold');
  assert.equal(antwort.blind, true, 'content.js muss wissen, dass es den Erfolg nachpruefen muss');
});
