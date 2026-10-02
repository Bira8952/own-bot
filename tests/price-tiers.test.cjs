const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const section = source.slice(source.indexOf('  let PRICE_TIERS = null;'), source.indexOf('  function roundDownToStep('));

function setup() {
  const context = vm.createContext({
    Array, Number, Object, Math,
    toInt: (v) => { const n = Number(v); return Number.isFinite(n) ? Math.floor(n) : NaN; }
  });
  vm.runInContext(section, context);
  return context;
}

const pruefe = (c, roh) => { c.roh = roh; return vm.runInContext('acceptPriceTiers(roh)', c); };
const setze = (c, roh) => vm.runInContext('PRICE_TIERS = acceptPriceTiers(roh)', Object.assign(c, { roh }));
const stufe = (c, preis) => vm.runInContext('stepFor(' + preis + ')', c);

// UTCurrencyInputControl.PRICE_TIERS, am 20.09.2026 direkt aus der geladenen
// FC Web App gelesen - nicht nachgebaut.
// Die unterste Stufe ist 150, nicht 50. Genau das hatte ich vorher falsch
// angenommen, und weil der Test meine Annahme gegen meine Annahme prueste,
// war er gruen und bewies nichts.
const EA_TIERS = [
  { min: 100000, inc: 1000 },
  { min: 50000, inc: 500 },
  { min: 10000, inc: 250 },
  { min: 1000, inc: 100 },
  { min: 150, inc: 50 },
  { min: 0, inc: 150 }
];

test('ohne Tabelle gilt die eingebaute Leiter', () => {
  const c = setup();
  assert.equal(stufe(c, 100), 150, 'unter 150 Coins gibt es keine Zwischenpreise');
  assert.equal(stufe(c, 500), 50);
  assert.equal(stufe(c, 5000), 100);
  assert.equal(stufe(c, 25000), 250);
  assert.equal(stufe(c, 75000), 500);
  assert.equal(stufe(c, 200000), 1000);
});

test('die Tabelle aus der Web App liefert dieselben Werte wie bisher', () => {
  // Beweist, dass der Umbau heute nichts veraendert - nur morgen schuetzt.
  const c = setup();
  setze(c, EA_TIERS);
  for (const preis of [0, 50, 149, 150, 999, 1000, 9999, 10000, 49999, 50000, 99999, 100000, 999999]) {
    const mitTabelle = stufe(c, preis);
    const ohne = setup();
    assert.equal(mitTabelle, stufe(ohne, preis), 'Abweichung bei ' + preis);
  }
});

test('eine geaenderte Tabelle wirkt sofort', () => {
  const c = setup();
  setze(c, [{ min: 0, inc: 25 }, { min: 5000, inc: 500 }]);
  assert.equal(stufe(c, 100), 25);
  assert.equal(stufe(c, 9000), 500);
});

test('die Reihenfolge wird selbst hergestellt', () => {
  // Auf die Sortierung der Seite ist kein Verlass.
  const c = setup();
  setze(c, [{ min: 10000, inc: 250 }, { min: 0, inc: 50 }, { min: 1000, inc: 100 }]);
  assert.equal(stufe(c, 500), 50);
  assert.equal(stufe(c, 5000), 100);
  assert.equal(stufe(c, 20000), 250);
});

test('ohne Stufe ab 0 wird die ganze Tabelle verworfen', () => {
  // Sonst gaebe es guenstige Preise ohne Zuordnung.
  const c = setup();
  assert.equal(pruefe(c, [{ min: 1000, inc: 100 }]), null);
});

test('unsinnige Werte werden verworfen, nicht einzeln geflickt', () => {
  const c = setup();
  for (const kaputt of [
    [{ min: 0, inc: 0 }],
    [{ min: 0, inc: -50 }],
    [{ min: -1, inc: 50 }],
    [{ min: 0, inc: 'viel' }],
    [{ min: 0, inc: 200000 }],
    [{ min: 99000000, inc: 50 }],
    [null],
    ['keine Tabelle'],
    [],
    'gar keine Liste',
    null
  ]) {
    assert.equal(pruefe(c, kaputt), null, 'durchgelassen: ' + JSON.stringify(kaputt));
  }
});

test('eine uebermaessig lange Tabelle wird verworfen', () => {
  const c = setup();
  const viele = Array.from({ length: 21 }, (_, i) => ({ min: i * 1000, inc: 50 }));
  assert.equal(pruefe(c, viele), null);
});

test('eine gepruefte Tabelle enthaelt nur Zahlen', () => {
  const c = setup();
  const t = pruefe(c, EA_TIERS);
  assert.equal(t.length, EA_TIERS.length);
  for (const tier of t) {
    assert.equal(typeof tier.min, 'number');
    assert.equal(typeof tier.inc, 'number');
    assert.deepEqual(Object.keys(tier).sort(), ['inc', 'min'], 'keine zusaetzlichen Felder aus der Seite');
  }
});

test('eingeschmuggelte Zusatzfelder landen nicht in den Stufen', () => {
  const c = setup();
  const t = pruefe(c, [{ min: 0, inc: 50, boese: 'x' }]);
  assert.deepEqual(Object.keys(t[0]).sort(), ['inc', 'min']);
});
