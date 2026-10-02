const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const section = source.slice(source.indexOf('  function openMarketPath('), source.indexOf('  function basePlayerId('));

const CONFIG = {
  PAGE_SIZE: 21,
  SCAN_MIN_PRICE_SHARE: 0.15,
  SCAN_MIN_PRICE_FROM: 10000
};
// Pfade und Parameternamen sind jetzt einstellbar, nicht mehr Teil von CONFIG.
const ENDPOINTS = {
  searchPath: '/transfermarket',
  maxBuyParam: 'maxb',
  minBuyParam: 'minb',
  maxBidParam: 'macr',
  idParam: 'maskedDefId',
  rarityParam: 'rarity', levelParam: 'lev', positionParam: 'pos',
  nationParam: 'nat', leagueParam: 'leag', playStyleParam: 'playStyle',
  clubParam: 'team'
};
const SCAN_FILTER_FELDER = [
  ['rarity', 'rarityParam'], ['level', 'levelParam'], ['position', 'positionParam'],
  ['nation', 'nationParam'], ['league', 'leagueParam'], ['playStyle', 'playStyleParam'],
  ['club', 'clubParam']
];

function setup(zufall) {
  const context = vm.createContext({
    CONFIG, ENDPOINTS, SCAN_FILTER_FELDER, Math, String, Number,
    URLSearchParams,
    STATE: { suchweg: 'direkt' },
    vereinHinweisGezeigt: false,
    warn() {},
    filterWert: (filter, name) => {
      const wert = filter && Number(filter[name]);
      return Number.isFinite(wert) && wert >= 0 ? Math.floor(wert) : null;
    },
    randomBetween: zufall || ((min, max) => max),
    roundDownToStep: (p) => {
      if (!Number.isFinite(p)) return 0;
      const step = p < 1000 ? 50 : p < 10000 ? 100 : p < 50000 ? 250 : p < 100000 ? 500 : 1000;
      return Math.floor(p / step) * step;
    }
  });
  vm.runInContext(section, context);
  return context;
}

const pfad = (c, ...args) => vm.runInContext('openMarketPath(' + args.map((a) => JSON.stringify(a)).join(',') + ')', c);
const minPreis = (c, maxPrice) => vm.runInContext('scanMinPrice(' + maxPrice + ')', c);

test('ohne Mindestpreis bleibt die Adresse wie bisher', () => {
  const c = setup();
  const p = pfad(c, 50000, 0, 0);
  assert.ok(p.includes('maxb=50000'));
  assert.equal(p.includes('minb'), false);
});

test('ein Mindestpreis landet als eigener Parameter in der Adresse', () => {
  const c = setup();
  const p = pfad(c, 50000, 0, 2500);
  assert.ok(p.includes('minb=2500'));
  assert.ok(p.includes('maxb=50000'));
});

test('guenstige Scans bekommen gar keinen Mindestpreis', () => {
  const c = setup();
  assert.equal(minPreis(c, 5000), 0, 'unter 10.000 wuerde er nur Treffer kosten');
  assert.equal(minPreis(c, 9999), 0);
});

test('der Mindestpreis bleibt ein kleiner Teil des Suchpreises', () => {
  const c = setup(); // liefert immer den Hoechstwert
  const min = minPreis(c, 50000);
  assert.ok(min > 0);
  assert.ok(min <= 50000 * CONFIG.SCAN_MIN_PRICE_SHARE, 'hoechstens 15 Prozent');
  assert.ok(min < 50000, 'niemals in der Naehe des Suchpreises');
});

test('der Mindestpreis liegt immer auf einer gueltigen Preisstufe', () => {
  for (const wert of [1234, 7777, 4321]) {
    const c = setup(() => wert);
    const min = minPreis(c, 50000);
    assert.equal(min % 100, 0, 'gerundet auf die Stufe, nicht krumm: ' + min);
  }
});

test('eine Null aus dem Zufall schaltet den Mindestpreis einfach ab', () => {
  const c = setup(() => 0);
  assert.equal(minPreis(c, 50000), 0);
  const p = pfad(c, 50000, 0, 0);
  assert.equal(p.includes('minb'), false);
});

test('Seitenangabe und Typ bleiben unberuehrt', () => {
  const c = setup();
  const p = pfad(c, 50000, 40, 1000);
  assert.ok(p.includes('start=40'));
  assert.ok(p.includes('type=player'));
  assert.ok(p.includes('num=21'));
});
