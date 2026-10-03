const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const section = source.slice(source.indexOf('  // Verkaufserkennung (02.10.2026). Die Regel'), source.indexOf('  function gedaechtnisVielleichtSichern('));
const M = require('../markt.js');

function setup() {
  const gespeichert = {};
  const context = vm.createContext({
    FC27Markt: M, Date, Number, Math, String, URLSearchParams, Map, Set, Array, Promise,
    ENDPOINTS: { idParam: 'maskedDefId', maxBuyParam: 'maxb', minBuyParam: 'minb', maxBidParam: 'macr', ovrMinParam: 'ovrMin', ovrMaxParam: 'ovrMax', rarityParam: 'rarityIds', levelParam: 'lev', positionParam: 'pos', nationParam: 'nat', leagueParam: 'leag', playStyleParam: 'playStyle', clubParam: 'team' },
    SCAN_FILTER_FELDER: [['rarity', 'rarityParam'], ['level', 'levelParam'], ['position', 'positionParam'], ['nation', 'nationParam'], ['league', 'leagueParam'], ['playStyle', 'playStyleParam'], ['club', 'clubParam']],
    toInt: (v) => { const n = Number(v); return Number.isFinite(n) ? Math.floor(n) : NaN; },
    priceKey: (id, rating, art) => id + ':' + rating + (art >= 0 ? ':' + art : ''),
    basePlayerId: (item) => Number(item.assetId) % 1048576,
    volleSeite: () => 21,
    updateStorage: (key, fn) => { gespeichert[key] = fn(gespeichert[key]); return Promise.resolve(); }
  });
  vm.runInContext(section, context);
  return { context, gespeichert };
}

const angebot = (tradeId, preis, restS) => ({ tradeId, buyNowPrice: preis, expires: restS, itemData: { assetId: 100, rating: 85, rareflag: 3 } });
const pfad = (maxb, extra) => '/ut/game/fc27/transfermarket?num=21&start=0&type=player&maskedDefId=100&maxb=' + maxb + '&rarityIds=3&ovrMin=85&ovrMax=85' + (extra || '');

test('Suchpfad wird richtig gelesen', () => {
  const { context } = setup();
  context.p = pfad(9000, '&minb=500');
  const a = vm.runInContext('anfrageAusPfad(p, 5)', context);
  assert.equal(a.playerId, 100);
  assert.equal(a.maxb, 9000);
  assert.equal(a.minb, 500);
  assert.deepEqual(Array.from(a.rarities), [3]);
  assert.equal(a.ovrMin, 85);
  assert.equal(a.vollstaendig, true);
  context.p = pfad(9000);
  assert.equal(vm.runInContext('anfrageAusPfad(p, 21).vollstaendig', context), false, 'volle Seite');
  context.p = pfad(9000, '&leag=13');
  assert.equal(vm.runInContext('anfrageAusPfad(p, 3)', context), null, 'mit Liga-Filter kein Abgleich');
  context.p = '/ut/game/fc27/transfermarket?num=21&start=0&type=player&maskedDefId=100&macr=5000';
  assert.equal(vm.runInContext('anfrageAusPfad(p, 3).vollstaendig', context), false, 'Gebotssuche');
});

test('verschwundenes Angebot wird als Verkauf gezaehlt und gespeichert', async () => {
  const { context, gespeichert } = setup();
  context.erste = [angebot(1, 5000, 1800), angebot(2, 5300, 2400)];
  context.zweite = [angebot(2, 5300, 2300)];
  context.p = pfad(9000);
  vm.runInContext('verkaeufeErkennen(erste, p)', context);
  vm.runInContext('verkaeufeErkennen(zweite, p)', context);
  assert.equal(vm.runInContext('VERKAUF_TRACKER.erkannt', context), 1);
  await vm.runInContext('verkaeufeSichern()', context);
  const karten = gespeichert.marktVerkaeufe.karten;
  assert.deepEqual(Object.keys(karten), ['100:85:3']);
  assert.equal(karten['100:85:3'][0][1], 5000);
});
