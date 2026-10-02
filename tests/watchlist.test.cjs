const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const section = source.slice(source.indexOf('  const WATCHLIST = {'), source.indexOf('  function expireBids('));
const releaseTeil = source.slice(source.indexOf('  function releaseBid('), source.indexOf('  // Aus den Suchtreffern'));

function setup() {
  const purchases = [];
  const warnungen = [];
  const gesendet = [];
  const run = {
    stats: { spent: 0, bids: 0, bidCommitted: 0, bidsWon: 0, bidsLost: 0, bidsOutbid: 0, bidsUnconfirmed: 0 },
    perTarget: new Map([['1:84', { spent: 0, bidCommitted: 0 }]]),
    openBids: new Map()
  };
  class HardStop extends Error {}
  const context = vm.createContext({
    run, HardStop,
    Date, Number, Math, String, Array, Boolean, Set, Promise, Object,
    CONFIG: { WATCHLIST_TIMEOUT_MS: 50, WATCHLIST_MIN_GAP_MS: 20000 },
    window: { postMessage: (m) => gesendet.push(m), location: { origin: 'https://www.ea.com' } },
    setTimeout,
    str: (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : ''),
    toInt: (v) => { const n = Number(v); return Number.isFinite(n) ? Math.floor(n) : NaN; },
    fmt: value => String(Number(value) || 0),
    pushEvent() {}, tonSpielen() {}, log() {}, notify() {}, warn: (m) => warnungen.push(m),
    logPurchase: (p) => purchases.push(p),
    reserveUsage: async () => {}
  });
  vm.runInContext(releaseTeil + section, context);
  return { context, run, purchases, warnungen, gesendet };
}

function gebotSetzen(s, tradeId, amount, abgelaufen) {
  s.run.stats.bids += 1;
  s.run.stats.bidCommitted += amount;
  s.run.perTarget.get('1:84').bidCommitted += amount;
  s.run.openBids.set(String(tradeId), {
    amount, key: '1:84', playerId: 1, playerName: 'Example', rating: 84,
    placedAt: Date.now() - 60000,
    expiresAt: abgelaufen ? Date.now() - 1000 : Date.now() + 120000
  });
}

function anwenden(s, items) {
  s.context.items = items;
  vm.runInContext('applyWatchlist(run, items)', s.context);
}

test('eine gewonnene Auktion wird zum Kauf - genau der Fall, der vorher verschwand', () => {
  const s = setup();
  gebotSetzen(s, 1, 900, true);
  anwenden(s, [{ tradeId: '1', tradeState: 'closed', bidState: 'highest', currentBid: 900, itemId: '77' }]);
  assert.equal(s.run.stats.bidsWon, 1);
  assert.equal(s.run.stats.spent, 900, 'die Coins sind wirklich weg');
  assert.equal(s.run.stats.bidCommitted, 0);
  assert.equal(s.purchases.length, 1, 'und der Spieler steht im Kauflog');
  assert.equal(s.purchases[0].playerName, 'Example');
  assert.equal(s.purchases[0].price, 900);
});

test('eine beendete Auktion ohne Zuschlag gilt als verloren', () => {
  const s = setup();
  gebotSetzen(s, 1, 900, true);
  anwenden(s, [{ tradeId: '1', tradeState: 'closed', bidState: 'outbid', currentBid: 1000 }]);
  assert.equal(s.run.stats.bidsLost, 1);
  assert.equal(s.run.stats.spent, 0);
  assert.equal(s.purchases.length, 0);
});

test('eine laufende Auktion mit hoeherem Gebot heisst ueberboten', () => {
  const s = setup();
  gebotSetzen(s, 1, 900, false);
  anwenden(s, [{ tradeId: '1', tradeState: 'active', bidState: 'outbid', currentBid: 950 }]);
  assert.equal(s.run.stats.bidsOutbid, 1);
  assert.equal(s.run.stats.bidCommitted, 0);
  assert.equal(s.run.openBids.size, 0, 'wieder frei fuer ein Nachgebot');
});

test('wer noch fuehrt, bleibt unangetastet', () => {
  const s = setup();
  gebotSetzen(s, 1, 900, false);
  anwenden(s, [{ tradeId: '1', tradeState: 'active', bidState: 'highest', currentBid: 900 }]);
  assert.equal(s.run.openBids.size, 1);
  assert.equal(s.run.stats.bidCommitted, 900);
});

test('fremde Eintraege auf der Liste aendern nichts', () => {
  const s = setup();
  gebotSetzen(s, 1, 900, true);
  anwenden(s, [{ tradeId: '999', tradeState: 'closed', bidState: 'highest' }]);
  assert.equal(s.run.openBids.size, 1);
  assert.equal(s.purchases.length, 0);
});

test('die Antwort der Seite wird geprueft, bevor sie zaehlt', () => {
  const s = setup();
  const p = vm.runInContext('requestWatchlist()', s.context);
  const id = s.gesendet[0].requestId;
  s.context.antwort = {
    requestId: id,
    items: [
      { tradeId: '1', tradeState: 'CLOSED', bidState: 'HIGHEST', currentBid: 900 },
      { tradeId: '', tradeState: 'closed' },
      { tradeId: '2', currentBid: -50 },
      'kein Objekt',
      null
    ]
  };
  vm.runInContext('acceptWatchlist(antwort)', s.context);
  return p.then((items) => {
    assert.equal(items.length, 2, 'Eintraege ohne tradeId fliegen raus');
    assert.equal(items[0].tradeState, 'closed', 'Grossschreibung wird vereinheitlicht');
    assert.equal(items[0].bidState, 'highest');
    assert.equal(items[1].currentBid, 0, 'negative Betraege werden auf 0 gesetzt');
  });
});

test('eine Antwort mit falscher Nummer wird ignoriert', () => {
  const s = setup();
  const p = vm.runInContext('requestWatchlist()', s.context);
  s.context.antwort = { requestId: 9999, items: [{ tradeId: '1' }] };
  vm.runInContext('acceptWatchlist(antwort)', s.context);
  // Es bleibt beim Zeitablauf: null statt der untergeschobenen Liste.
  return p.then((items) => assert.equal(items, null));
});

test('bleibt die Antwort aus, laeuft die Abfrage in den Zeitablauf', () => {
  const s = setup();
  return vm.runInContext('requestWatchlist()', s.context).then((items) => {
    assert.equal(items, null);
    assert.equal(s.gesendet.length, 1);
    assert.equal(s.gesendet[0].__ownbot, 'watchlist?');
  });
});

test('ohne faellige Gebote wird gar nicht erst gefragt', async () => {
  const s = setup();
  gebotSetzen(s, 1, 900, false); // laeuft noch
  await vm.runInContext('settleViaWatchlist(run)', s.context);
  assert.equal(s.gesendet.length, 0, 'keine unnoetige EA-Anfrage');
});

test('ein abgelaufenes Gebot loest die Abfrage aus', async () => {
  const s = setup();
  gebotSetzen(s, 1, 900, true);
  await vm.runInContext('settleViaWatchlist(run)', s.context);
  assert.equal(s.gesendet.length, 1);
  assert.equal(s.gesendet[0].__ownbot, 'watchlist?');
});

test('ist das Limit erschoepft, wird nicht gefragt statt zu stoppen', async () => {
  const s = setup();
  gebotSetzen(s, 1, 900, true);
  s.context.reserveUsage = async () => { throw new (s.context.HardStop)('Tageslimit erreicht'); };
  await vm.runInContext('settleViaWatchlist(run)', s.context);
  assert.equal(s.gesendet.length, 0);
  assert.equal(s.run.openBids.size, 1, 'bleibt offen, der Zeitfallback uebernimmt spaeter');
});
