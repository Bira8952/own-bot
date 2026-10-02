const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const section = source.slice(source.indexOf('  function acceptProbeNames('), source.indexOf('  function priceKey('));

// Dieselben Listen wie in content.js, aus der Quelle gelesen statt nachgebaut.
function constFromSource(name) {
  const prefix = 'const ' + name + ' = ';
  const at = source.indexOf(prefix + '[');
  assert.notEqual(at, -1, name + ' nicht in content.js gefunden');
  const open = at + prefix.length;
  const close = source.indexOf('];', open);
  return JSON.parse(JSON.stringify(vm.runInNewContext(source.slice(open, close + 1))));
}
const PROBE_SERVICES = constFromSource('PROBE_SERVICES');
const PROBE_GLOBALS = constFromSource('PROBE_GLOBALS');

function setup() {
  const STATE = { probe: null };
  const context = vm.createContext({
    STATE, PROBE_SERVICES, PROBE_GLOBALS,
    PROBE_NAME_RE: /^[A-Za-z_][A-Za-z0-9_]{0,40}$/,
    Array, Boolean, Math, Date, Number,
    toInt: (v) => { const n = Number(v); return Number.isFinite(n) ? Math.floor(n) : NaN; },
    log() {}
  });
  vm.runInContext(section, context);
  return { context, STATE };
}

// Objekte aus dem vm-Kontext haben eigene Prototypen, deshalb vor dem
// Vergleich in gewoehnliche Werte dieser Umgebung umwandeln.
function accept(s, payload) {
  s.context.payload = payload;
  vm.runInContext('acceptProbe(payload)', s.context);
  return s.STATE.probe === null ? null : JSON.parse(JSON.stringify(s.STATE.probe));
}

test('eine ehrliche Antwort wird uebernommen', () => {
  const s = setup();
  const probe = accept(s, {
    globals: { services: true, repositories: true, appMain: true, rootViewController: true, ItemPile: true, UTSearchCriteriaDTO: true },
    services: { 'Item.searchTransferMarket': { found: true, args: 2 }, 'Item.bid': { found: true, args: 2 } },
    criteria: ['maskedDefId', 'maxBuy', 'minBid'],
    itemPile: ['CLUB', 'TRANSFER']
  });
  assert.equal(probe.services['Item.searchTransferMarket'].found, true);
  assert.equal(probe.services['Item.searchTransferMarket'].args, 2);
  assert.deepEqual(probe.criteria, ['maskedDefId', 'maxBuy', 'minBid']);
  assert.deepEqual(probe.itemPile, ['CLUB', 'TRANSFER']);
  assert.equal(probe.globals.services, true);
});

test('jeder bekannte Dienst kommt vor, auch wenn die Seite ihn weglaesst', () => {
  const s = setup();
  const probe = accept(s, { services: { 'Item.bid': { found: true, args: 2 } } });
  assert.equal(Object.keys(probe.services).length, PROBE_SERVICES.length);
  assert.equal(probe.services['Item.list'].found, false);
  assert.equal(probe.services['Item.list'].args, 0);
});

test('unbekannte Dienstnamen der Seite werden verworfen', () => {
  const s = setup();
  const probe = accept(s, {
    services: { 'Boese.Funktion': { found: true, args: 3 }, '__proto__': { found: true }, 'Item.bid': { found: true, args: 2 } }
  });
  assert.equal(probe.services['Boese.Funktion'], undefined);
  assert.deepEqual(Object.keys(probe.services), PROBE_SERVICES);
});

test('nur bekannte globale Namen, immer als Wahrheitswert', () => {
  const s = setup();
  const probe = accept(s, { services: {}, globals: { services: 'ja bitte', heimlich: true, ItemPile: 0 } });
  assert.equal(probe.globals.services, true, 'Text wird zu true');
  assert.equal(probe.globals.ItemPile, false, '0 wird zu false');
  assert.equal(probe.globals.heimlich, undefined);
  assert.deepEqual(Object.keys(probe.globals), PROBE_GLOBALS);
});

test('Feldnamen mit Sonderzeichen oder Markup fliegen raus', () => {
  const s = setup();
  const probe = accept(s, {
    services: {},
    criteria: ['maskedDefId', '<img src=x onerror=alert(1)>', 'maxBuy', 'a b', '', 'ok_1', 'x'.repeat(60)]
  });
  assert.deepEqual(probe.criteria, ['maskedDefId', 'maxBuy', 'ok_1']);
});

test('Doppelte Feldnamen werden nur einmal uebernommen', () => {
  const s = setup();
  const probe = accept(s, { services: {}, criteria: ['maxBuy', 'maxBuy', 'minBuy'] });
  assert.deepEqual(probe.criteria, ['maxBuy', 'minBuy']);
});

test('uebermaessig lange Listen werden gekappt', () => {
  const s = setup();
  const viele = Array.from({ length: 200 }, (_, i) => 'feld' + i);
  const probe = accept(s, { services: {}, criteria: viele, itemPile: viele });
  assert.equal(probe.criteria.length, 60);
  assert.equal(probe.itemPile.length, 20);
});

test('unsinnige Parameterzahlen werden begrenzt', () => {
  const s = setup();
  const probe = accept(s, {
    services: {
      'Item.bid': { found: true, args: 999 },
      'Item.list': { found: true, args: -5 },
      'Item.move': { found: true, args: 'viele' }
    }
  });
  assert.equal(probe.services['Item.bid'].args, 20);
  assert.equal(probe.services['Item.list'].args, 0);
  assert.equal(probe.services['Item.move'].args, 0);
});

test('Muell statt Antwort ueberschreibt die letzte echte Diagnose nicht', () => {
  const s = setup();
  accept(s, { services: { 'Item.bid': { found: true, args: 2 } } });
  const vorher = s.STATE.probe;
  // Auch ein Array ist typeof "object" - ohne diese Huerde wuerde es die
  // Diagnose auf lauter "fehlt" zuruecksetzen und ein falsches Bild zeigen.
  for (const muell of [null, undefined, 'text', 42, [], {}, { services: [] }, { services: 'nein' }]) {
    s.context.payload = muell;
    vm.runInContext('acceptProbe(payload)', s.context);
  }
  assert.equal(s.STATE.probe, vorher);
  assert.equal(s.STATE.probe.services['Item.bid'].found, true);
});

test('Fehlercodes: nur brauchbare Namen mit plausiblen Zahlen', () => {
  const s = setup();
  const probe = accept(s, {
    services: {},
    errorCodes: {
      CAPTCHA_REQUIRED: 458,
      '<script>': 1,
      ZU_GROSS: 999999,
      NEGATIV: -3,
      TEXT: 'nein',
      LOCKED_TRANSFER_MARKET: 494
    }
  });
  assert.deepEqual(probe.errorCodes, { CAPTCHA_REQUIRED: 458, LOCKED_TRANSFER_MARKET: 494 });
});

test('Fehlercodes als Liste statt als Zuordnung werden verworfen', () => {
  const s = setup();
  const probe = accept(s, { services: {}, errorCodes: ['CAPTCHA_REQUIRED', 458] });
  assert.equal(probe.errorCodes, null);
});

test('eine leere Dienstliste ist eine gueltige Antwort: nichts gefunden', () => {
  const s = setup();
  const probe = accept(s, { services: {} });
  assert.equal(probe.criteria, null);
  assert.equal(probe.itemPile, null);
  assert.equal(probe.services['Item.bid'].found, false);
});
