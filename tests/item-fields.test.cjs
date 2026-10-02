const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const section = source.slice(source.indexOf('  const FIELD_RE ='), source.indexOf('  function isTarget('));

function setup() {
  const STATE = { itemFields: null };
  const context = vm.createContext({ STATE, Object, Date, log() {} });
  vm.runInContext(section, context);
  return { context, STATE };
}

const merken = (s, auctions) => {
  s.context.auctions = auctions;
  vm.runInContext('noteItemFields(auctions)', s.context);
  return s.STATE.itemFields ? JSON.parse(JSON.stringify(s.STATE.itemFields)) : null;
};

// So sieht ein Suchtreffer von EA aus.
const TREFFER = {
  tradeId: 5, buyNowPrice: 900, currentBid: 0, startingBid: 150,
  expires: 3600, tradeState: 'active', bidState: 'none', watched: false,
  itemData: { id: 77, assetId: 231747, rating: 84, rareflag: 1, marketDataMinPrice: 700, marketDataMaxPrice: 1200 }
};

test('die Felder eines Treffers werden festgehalten', () => {
  const s = setup();
  const f = merken(s, [TREFFER]);
  assert.ok(f.auction.includes('tradeState'), 'Auktionsstand muss auftauchen');
  assert.ok(f.auction.includes('bidState'), 'Gebotsstand muss auftauchen');
  assert.ok(f.item.includes('marketDataMinPrice'));
  assert.ok(f.item.includes('marketDataMaxPrice'));
  assert.equal(f.item.includes('marketAverage'), false, 'was nicht da ist, wird nicht erfunden');
});

test('nur der erste Treffer wird ausgewertet, danach ist Ruhe', () => {
  const s = setup();
  const erst = merken(s, [TREFFER]);
  merken(s, [{ tradeId: 9, voellig: 1, anders: 2, itemData: { neu: 3 } }]);
  assert.deepEqual(s.STATE.itemFields.auction, erst.auction, 'einmal je Sitzung reicht');
});

test('eine leere Trefferliste aendert nichts', () => {
  const s = setup();
  assert.equal(merken(s, []), null);
  assert.equal(s.STATE.itemFields, null);
});

test('ein Treffer ohne itemData ist kein Problem', () => {
  const s = setup();
  const f = merken(s, [{ tradeId: 1, buyNowPrice: 500 }]);
  assert.ok(f.auction.includes('buyNowPrice'));
  assert.deepEqual(f.item, []);
});

test('Unsinn statt Treffer wird uebergangen', () => {
  const s = setup();
  assert.equal(merken(s, [null]), null);
  assert.equal(merken(s, ['kein Objekt']), null);
});

test('krumme Feldnamen aus der Antwort kommen nicht durch', () => {
  const s = setup();
  const f = merken(s, [{ 'gut': 1, 'nicht gut': 2, '<script>': 3, 'auch_gut1': 4, itemData: {} }]);
  // itemData ist selbst ein gueltiger Feldname und gehoert dazu.
  assert.deepEqual(f.auction.sort(), ['auch_gut1', 'gut', 'itemData']);
});

test('uebermaessig viele Felder werden gekappt', () => {
  const s = setup();
  const viele = {};
  for (let i = 0; i < 100; i++) viele['feld' + i] = i;
  viele.itemData = {};
  const f = merken(s, [viele]);
  assert.equal(f.auction.length, 40);
});

test('es werden nur Namen gespeichert, keine Werte', () => {
  const s = setup();
  const f = merken(s, [{ geheim: 'meine-session-id', itemData: {} }]);
  assert.ok(f.auction.includes('geheim'));
  assert.equal(JSON.stringify(f).includes('meine-session-id'), false, 'Werte gehoeren nicht in die Diagnose');
});
