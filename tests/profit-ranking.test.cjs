const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'popup.js'), 'utf8');
const statsSection = source.slice(
  source.indexOf('function localFilterStats('),
  source.indexOf('function filterBadges(')
);
const profitSection = source.slice(
  source.indexOf('function tempoSekunden('),
  source.indexOf('function wertungText(')
);

function setup(runs = [], purchases = [], verkaeufe = [], mode = 'auto') {
  const sandbox = {
    runs,
    purchases,
    verkaeufe,
    mode,
    DAY: 24 * 60 * 60 * 1000,
    SALE_FEE: 0.05,
    gemesseneAktivitaet: () => 'unbekannt',
    $: (id) => ({ value: id === 'profitSortMode' ? sandbox.mode : 'normal' })
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(statsSection + profitSection, context);
  return context;
}

test('Treffer, Kaeufe und verpasste Angebote bleiben getrennte Zahlen', () => {
  const jetzt = Date.now();
  const context = setup([
    { t: jetzt, key: '1:90', scans: 60, bought: 1, missed: 5 },
    { t: jetzt, key: '1:90', scans: 40, bought: 1, missed: 3 }
  ]);
  const stats = vm.runInContext('localFilterStats("1:90", {})', context);

  assert.equal(stats.scans, 100);
  assert.equal(stats.hits, 10);
  assert.equal(stats.bought, 2);
  assert.equal(stats.missed, 8);
  assert.equal(stats.hitRate, 10);
  assert.equal(stats.buyRate, 2);
  assert.equal(stats.successRate, 20);
});

test('Profit pro Stunde zaehlt nur wirkliche Kaeufe', () => {
  const context = setup();
  const stats = { scans: 100, bought: 2, missed: 8, hitRate: 10, buyRate: 2, successRate: 20, estimated: false };
  context.stats = stats;

  const proStunde = vm.runInContext(
    'gewinnProStunde(stats, { expectedProfit: 800 }, { searchLimitHour: 150 })',
    context
  );

  // 150 Suchen x 2 % Kaufquote x 800 Coins, nicht 10 % Trefferquote.
  assert.equal(proStunde, 2400);
});

test('Rotation bevorzugt gemessenen Profit je Suche statt einer hohen Schaetzwertung', () => {
  const context = setup();
  context.effizient = {
    score: 10,
    stats: { scans: 100, bought: 4, estimated: false },
    suggestion: { expectedProfit: 500 }
  };
  context.umkaempft = {
    score: 99,
    stats: { scans: 100, bought: 1, estimated: false },
    suggestion: { expectedProfit: 1000 }
  };

  assert.ok(vm.runInContext('profitZeilenVergleich(effizient, umkaempft)', context) < 0,
    '20 Coins je Suche muessen vor 10 Coins je Suche stehen');
});

test('ein ungetesteter Filter steht vor einem gemessenen Filter ohne Kauf', () => {
  const context = setup();
  context.unbekannt = {
    score: 20,
    stats: { scans: 0, bought: 0, estimated: true },
    suggestion: { expectedProfit: 500 }
  };
  context.ohneKauf = {
    score: 90,
    stats: { scans: 100, bought: 0, estimated: false },
    suggestion: { expectedProfit: 1000 }
  };

  assert.ok(vm.runInContext('profitZeilenVergleich(unbekannt, ohneKauf)', context) < 0);
});

test('echter Filtergewinn verbindet Kauf und Verkauf ueber die Karten-ID', () => {
  const jetzt = Date.now();
  const context = setup([], [
    { t: jetzt - 5000, key: '1:90:7', itemId: 'karte-1', playerId: 1, rating: 90, price: 1000 },
    { t: jetzt - 4000, key: '1:90:3', itemId: 'karte-2', playerId: 1, rating: 90, price: 500 }
  ], [
    { t: jetzt, tradeId: 'verkauf-1', itemId: 'karte-1', preis: 2000, gekauftFuer: 1000 },
    { t: jetzt, tradeId: 'verkauf-2', itemId: 'karte-2', preis: 400, gekauftFuer: 500 },
    // Kein Bot-Kauf dazu: Darf den Filter nicht kuenstlich verbessern.
    { t: jetzt, tradeId: 'manuell', itemId: 'fremd', preis: 9999, gekauftFuer: 100 }
  ]);

  const stats = vm.runInContext('realProfitStats("1:90:7")', context);
  assert.equal(stats.sold, 1);
  assert.equal(stats.avgProfit, 900);
  assert.equal(stats.wins, 1);
  assert.equal(stats.losses, 0);
});

test('Auto nimmt ab zwei Verkaeufen den echten Durchschnittsgewinn', () => {
  const context = setup();
  context.echtGut = {
    score: 10,
    stats: { scans: 100, bought: 4, estimated: false },
    suggestion: { expectedProfit: 100 },
    real: { sold: 2, avgProfit: 800 }
  };
  context.nurSchaetzung = {
    score: 99,
    stats: { scans: 100, bought: 4, estimated: false },
    suggestion: { expectedProfit: 500 },
    real: { sold: 0, avgProfit: 0 }
  };

  assert.ok(vm.runInContext('profitZeilenVergleich(echtGut, nurSchaetzung)', context) < 0,
    'echte 32 Coins je Suche muessen vor geschaetzten 20 Coins stehen');
});

test('Manuell schaltet die Lernsortierung aus', () => {
  const context = setup([], [], [], 'manual');
  context.echtGut = {
    score: 10,
    stats: { scans: 100, bought: 4, estimated: false },
    suggestion: { expectedProfit: 100 },
    real: { sold: 2, avgProfit: 800 }
  };
  context.hoheWertung = {
    score: 90,
    stats: { scans: 100, bought: 1, estimated: false },
    suggestion: { expectedProfit: 100 },
    real: { sold: 2, avgProfit: 50 }
  };

  assert.ok(vm.runInContext('filterZeilenVergleich(hoheWertung, echtGut)', context) < 0,
    'im manuellen Modus bleibt die normale Wertung vorne');
});
