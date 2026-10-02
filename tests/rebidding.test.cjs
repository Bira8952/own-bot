const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const section = source.slice(source.indexOf('  // Erst kurz vor Schluss bieten'), source.indexOf('  async function executeBid('));
const helfer = source.slice(source.indexOf('  function bidAttempts('), source.indexOf('  function canTransact('));

// Zielpreis 1000 = Gewinngrenze. Bis dorthin darf nachgeboten werden.
function setup({ bidSeconds = 60, maxBidsPerAuction = 4 } = {}) {
  const target = { key: '1:84', playerId: 1, rating: 84, maxPrice: 1000 };
  const run = {
    cfg: { bidSniping: true, bidSeconds, maxBidsPerAuction },
    openBids: new Map(),
    bidAttempts: new Map()
  };
  const context = vm.createContext({
    run, target, Number, String, Math, Date, Boolean,
    isMatch: () => true,
    secondsLeft: (a) => (a.left === undefined ? 20 : a.left),
    currentBid: (a) => Number(a.currentBid) || 0,
    // Gebotsstufen wie im Spiel: unter 1000 in 50er-Schritten.
    nextBid: (a) => { const c = Number(a.currentBid) || 0; return c > 0 ? c + 50 : Number(a.startingBid) || 150; }
  });
  vm.runInContext(helfer + section, context);
  return { context, run, target };
}

function darfBieten(s, auction) {
  s.context.auction = auction;
  return vm.runInContext('isBidTarget(auction, target, run)', s.context);
}

test('bietet im Endfenster auf eine passende Auktion', () => {
  const s = setup();
  assert.equal(darfBieten(s, { tradeId: 1, currentBid: 750, left: 20 }), true);
});

test('bietet nicht, solange noch viel Zeit ist', () => {
  const s = setup({ bidSeconds: 60 });
  assert.equal(darfBieten(s, { tradeId: 1, currentBid: 750, left: 600 }), false);
});

test('ueberboten und noch im Plus: es wird nachgeboten', () => {
  // Genau der Fall aus der Ansage: Spieler lohnt bis 1000, wir stehen bei 750
  // und werden ueberboten. 800 waere das naechste Gebot - das ist noch drin.
  const s = setup();
  s.run.openBids.set('1', { amount: 750, key: '1:84' });
  assert.equal(darfBieten(s, { tradeId: 1, currentBid: 800, left: 15 }), true);
});

test('ueber der Gewinngrenze wird nicht mehr mitgeboten', () => {
  const s = setup();
  s.run.openBids.set('1', { amount: 950, key: '1:84' });
  // Naechstes Gebot waere 1050 und damit ueber dem Zielpreis von 1000.
  assert.equal(darfBieten(s, { tradeId: 1, currentBid: 1000, left: 15 }), false);
});

test('genau auf der Gewinngrenze ist noch erlaubt', () => {
  const s = setup();
  assert.equal(darfBieten(s, { tradeId: 1, currentBid: 950, left: 15 }), true, '950 + 50 = 1000');
});

test('wir bieten nicht gegen uns selbst, wenn wir fuehren', () => {
  const s = setup();
  s.run.openBids.set('1', { amount: 800, key: '1:84' });
  assert.equal(darfBieten(s, { tradeId: 1, currentBid: 800, left: 15 }), false, 'unser eigenes Gebot steht');
  assert.equal(darfBieten(s, { tradeId: 1, currentBid: 700, left: 15 }), false, 'wir liegen sogar darueber');
});

test('nach der Obergrenze an Nachgeboten ist Schluss', () => {
  const s = setup({ maxBidsPerAuction: 2 });
  const auction = { tradeId: 1, currentBid: 700, left: 15 };
  assert.equal(darfBieten(s, auction), true);
  s.run.bidAttempts.set('1', 2);
  assert.equal(darfBieten(s, auction), false, 'Bietgefecht wird begrenzt');
});

test('die Obergrenze gilt je Auktion, nicht fuer alle zusammen', () => {
  const s = setup({ maxBidsPerAuction: 2 });
  s.run.bidAttempts.set('1', 2);
  assert.equal(darfBieten(s, { tradeId: 1, currentBid: 700, left: 15 }), false);
  assert.equal(darfBieten(s, { tradeId: 2, currentBid: 700, left: 15 }), true, 'andere Auktion ist unberuehrt');
});

test('ohne Gebots-Sniping passiert gar nichts', () => {
  const s = setup();
  s.run.cfg.bidSniping = false;
  assert.equal(darfBieten(s, { tradeId: 1, currentBid: 750, left: 15 }), false);
});

test('abgelaufene Auktionen werden nicht beboten', () => {
  const s = setup();
  assert.equal(darfBieten(s, { tradeId: 1, currentBid: 750, left: 0 }), false);
  assert.equal(darfBieten(s, { tradeId: 1, currentBid: 750, left: -5 }), false);
});

test('fehlt die Obergrenze in der Konfiguration, gilt ein Standardwert', () => {
  const s = setup();
  delete s.run.cfg.maxBidsPerAuction;
  s.run.bidAttempts.set('1', 4);
  assert.equal(darfBieten(s, { tradeId: 1, currentBid: 700, left: 15 }), false, 'Standard ist 4');
});
