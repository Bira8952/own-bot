const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'content.js'), 'utf8');
const section = source.slice(source.indexOf('  function noteOpenBid('), source.indexOf('  let transactionPending ='));

const GRACE_S = 90;
const MAX_OPEN_MIN = 60;

function setup() {
  const target = { key: '1:89', playerId: 1, playerName: 'Example', rating: 89, maxPrice: 1000 };
  const run = {
    stats: { spent: 0, bids: 0, bidCommitted: 0, bidsWon: 0, bidsLost: 0, bidsOutbid: 0, bidsUnconfirmed: 0 },
    perTarget: new Map([['1:89', { spent: 0, bids: 0, bidCommitted: 0 }]]),
    openBids: new Map(),
    cfg: { targets: [target] }
  };
  const purchases = [];
  const context = vm.createContext({
    run, target, Date, Number, Array, String, Math,
    CONFIG: { BID_SETTLE_GRACE_S: GRACE_S, BID_MAX_OPEN_MIN: MAX_OPEN_MIN },
    secondsLeft: auction => (auction.left === undefined ? 45 : auction.left),
    currentBid: auction => Number(auction.currentBid) || 0,
    toInt: value => { const n = Number(value); return Number.isFinite(n) ? Math.floor(n) : NaN; },
    fmt: value => String(Number(value) || 0),
    pushEvent() {}, tonSpielen() {}, log() {}, warn() {}, notify() {},
    logPurchase: p => purchases.push(p)
  });
  vm.runInContext(section, context);

  // Ein Gebot von 900 Coins setzen, so wie executeBid es nach einer OK-Antwort tut.
  const place = (tradeId, left) => {
    run.stats.bids += 1;
    run.stats.bidCommitted += 900;
    run.perTarget.get('1:89').bidCommitted += 900;
    context.auction = { tradeId, left, itemData: { rating: 89 } };
    vm.runInContext('noteOpenBid(run, auction, target, 900)', context);
  };
  return { context, run, target, purchases, place };
}

function settle(s, auctions) {
  s.context.auctions = auctions;
  vm.runInContext('settleBids(run, auctions)', s.context);
}

test('ueberboten bei laufender Auktion gibt die Coins frei, gilt aber nicht als verloren', () => {
  const s = setup();
  s.place(1);
  settle(s, [{ tradeId: 1, bidState: 'outbid', tradeState: 'active' }]);
  assert.equal(s.run.stats.bidCommitted, 0);
  assert.equal(s.run.perTarget.get('1:89').bidCommitted, 0);
  assert.equal(s.run.stats.bidsOutbid, 1);
  assert.equal(s.run.stats.bidsLost, 0, 'die Auktion laeuft noch - noch ist nichts verloren');
  assert.equal(s.run.stats.spent, 0);
});

test('ein hoeheres Gebot eines anderen zaehlt ebenfalls als ueberboten', () => {
  const s = setup();
  s.place(1);
  settle(s, [{ tradeId: 1, currentBid: 1000, tradeState: 'active' }]);
  assert.equal(s.run.stats.bidCommitted, 0);
  assert.equal(s.run.stats.bidsOutbid, 1);
  assert.equal(s.run.stats.bidsLost, 0);
});

test('erst die beendete Auktion ohne Zuschlag ist wirklich verloren', () => {
  const s = setup();
  s.place(1);
  settle(s, [{ tradeId: 1, tradeState: 'closed', bidState: 'outbid' }]);
  assert.equal(s.run.stats.bidsLost, 1);
  assert.equal(s.run.stats.bidsOutbid, 0);
  assert.equal(s.run.stats.bidCommitted, 0);
});

test('gewonnene Auktion wird zu echten Ausgaben und landet im Kauflog', () => {
  const s = setup();
  s.place(1);
  settle(s, [{ tradeId: 1, tradeState: 'closed', bidState: 'highest' }]);
  assert.equal(s.run.stats.bidCommitted, 0);
  assert.equal(s.run.stats.spent, 900);
  assert.equal(s.run.perTarget.get('1:89').spent, 900);
  assert.equal(s.run.stats.bidsWon, 1);
  assert.equal(s.purchases.length, 1);
  assert.equal(s.purchases[0].price, 900);
  assert.equal(s.purchases[0].playerName, 'Example');
});

test('laufende Auktion mit Hoechstgebot bleibt reserviert', () => {
  const s = setup();
  s.place(1);
  settle(s, [{ tradeId: 1, tradeState: 'active', bidState: 'highest', currentBid: 900 }]);
  assert.equal(s.run.stats.bidCommitted, 900);
  assert.equal(s.run.openBids.size, 1);
});

test('fremde Auktionen in den Treffern aendern nichts', () => {
  const s = setup();
  s.place(1);
  settle(s, [{ tradeId: 77, bidState: 'outbid' }, null, { bidState: 'outbid' }]);
  assert.equal(s.run.stats.bidCommitted, 900);
});

test('ohne EA-Felder greift erst nach Ablauf plus Karenz der Fallback', () => {
  const s = setup();
  s.place(1, 10); // laeuft in 10 Sekunden ab
  vm.runInContext('expireBids(run)', s.context);
  assert.equal(s.run.stats.bidCommitted, 900, 'innerhalb der Karenz bleibt reserviert');

  const open = s.run.openBids.get('1');
  open.expiresAt = Date.now() - (GRACE_S + 1) * 1000;
  vm.runInContext('expireBids(run)', s.context);
  assert.equal(s.run.stats.bidCommitted, 900, 'ohne EA-Ausgang bleiben die Coins sicherheitshalber gebunden');
  assert.equal(s.run.stats.bidsUnconfirmed, 1, 'als unbestaetigt sichtbar, nicht als Kauf');
  assert.equal(s.run.stats.spent, 0);
  assert.equal(s.purchases.length, 0);
});

test('unbekannte Restzeit faellt auf die Notbremse zurueck', () => {
  const s = setup();
  s.place(1, Infinity);
  assert.equal(s.run.openBids.get('1').expiresAt, 0);
  vm.runInContext('expireBids(run)', s.context);
  assert.equal(s.run.stats.bidCommitted, 900);

  s.run.openBids.get('1').placedAt = Date.now() - (MAX_OPEN_MIN * 60000 + 1);
  vm.runInContext('expireBids(run)', s.context);
  assert.equal(s.run.stats.bidCommitted, 900, 'ohne EA-Ausgang bleiben die Coins sicherheitshalber gebunden');
  assert.equal(s.run.stats.bidsUnconfirmed, 1);
});

test('mehrere Gebote werden einzeln abgerechnet', () => {
  const s = setup();
  s.place(1);
  s.place(2);
  assert.equal(s.run.stats.bidCommitted, 1800);
  settle(s, [{ tradeId: 1, bidState: 'outbid' }]);
  assert.equal(s.run.stats.bidCommitted, 900);
  assert.equal(s.run.openBids.size, 1);
  assert.equal(vm.runInContext('openBidTotal(run)', s.context), 900);
});

test('bidCommitted laeuft bei doppelter Abrechnung nicht ins Minus', () => {
  const s = setup();
  s.place(1);
  settle(s, [{ tradeId: 1, bidState: 'outbid' }]);
  settle(s, [{ tradeId: 1, bidState: 'outbid' }]);
  assert.equal(s.run.stats.bidCommitted, 0);
  assert.equal(s.run.stats.bidsOutbid, 1, 'nur einmal zaehlen, nicht bei jeder Suche erneut');
});
