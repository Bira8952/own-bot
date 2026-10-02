const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const sniffer = fs.readFileSync(path.join(__dirname, '..', 'sniffer.js'), 'utf8');

// ===========================================================================
// Eigene Angebote und eigene Hoechstgebote ueberspringen (02.10.2026).
// Vorbild MagicBuyer (engine.js analyzeResults: auction.tradeOwner).
// - Kaufen: nie das eigene Angebot zurueckkaufen (kaufPruefung).
// - Bieten: nie auf eigene Auktionen und nie gegen sich selbst, wenn EA uns
//   schon als Hoechstbietenden fuehrt (isBidTarget, bidState "highest").
// Kostet keine Anfrage - es geht nur eine weniger raus.
// ===========================================================================

// --- isBidTarget: dieselbe Technik wie tests/rebidding.test.cjs -----------
const bidAbschnitt = source.slice(source.indexOf('  // Erst kurz vor Schluss bieten'), source.indexOf('  async function executeBid('));
const bidHelfer = source.slice(source.indexOf('  function bidAttempts('), source.indexOf('  function canTransact('));

function darfBieten(auction) {
  const target = { key: '1:84', playerId: 1, rating: 84, maxPrice: 1000 };
  const run = { cfg: { bidSniping: true, bidSeconds: 60, maxBidsPerAuction: 4 }, openBids: new Map(), bidAttempts: new Map() };
  const context = vm.createContext({
    run, target, Number, String, Math, Date, Boolean,
    isMatch: () => true,
    secondsLeft: (a) => (a.left === undefined ? 20 : a.left),
    currentBid: (a) => Number(a.currentBid) || 0,
    nextBid: (a) => { const c = Number(a.currentBid) || 0; return c > 0 ? c + 50 : 150; }
  });
  vm.runInContext(bidHelfer + bidAbschnitt, context);
  context.auction = auction;
  return vm.runInContext('isBidTarget(auction, target, run)', context);
}

test('bieten: fremde Auktionen wie bisher', () => {
  assert.equal(darfBieten({ tradeId: 1, currentBid: 700, bidState: 'none' }), true);
  assert.equal(darfBieten({ tradeId: 1, currentBid: 700, bidState: 'outbid' }), true);
  assert.equal(darfBieten({ tradeId: 1, currentBid: 700, tradeOwner: false }), true);
  assert.equal(darfBieten({ tradeId: 1, currentBid: 700 }), true, 'fehlende Felder aendern nichts');
});

test('bieten: nie gegen das eigene Hoechstgebot, auch ohne Gebot aus diesem Lauf', () => {
  // openBids ist leer: Das Gebot stammt von Hand oder aus einem frueheren Lauf.
  assert.equal(darfBieten({ tradeId: 1, currentBid: 700, bidState: 'highest' }), false);
  assert.equal(darfBieten({ tradeId: 1, currentBid: 700, bidState: 'HIGHEST' }), false);
});

test('bieten: nie auf die eigene Auktion', () => {
  assert.equal(darfBieten({ tradeId: 1, currentBid: 700, tradeOwner: true }), false);
  assert.equal(darfBieten({ tradeId: 1, currentBid: 0, startingBid: 150, tradeOwner: true }), false);
});

// --- kaufPruefung: Abschnitt wie in tests/pacing.test.cjs ------------------
const pacingAbschnitt = source.slice(source.indexOf('  function randomBetween('), source.indexOf('  async function loop('));

function kaufPruefung(auction, { aktuell = true } = {}) {
  const context = vm.createContext({
    CONFIG: { TREFFER_MAX_ALTER_MS: 15000 }, Math, Date, String, Number,
    isCurrent: () => aktuell,
    muenzenBekannt: () => null,
    bin: (a) => Number(a.buyNowPrice) || 0,
    STATE: { pauseUntil: 0, seen: new Set() },
    gewinnWeg: () => '',
    canTransact: () => true
  });
  vm.runInContext(pacingAbschnitt, context);
  context.auction = auction;
  context.run = {
    cfg: { maxBuys: 5, budget: 1e6, filterBuyLimit: 5, filterSpendLimit: 0 },
    stats: { bought: 0, bids: 0, spent: 0, bidCommitted: 0 },
    perTarget: new Map([['k', { bought: 0, bids: 0, spent: 0, bidCommitted: 0 }]])
  };
  context.target = { key: 'k' };
  return vm.runInContext('kaufPruefung(auction, target, run, 1, Date.now())', context);
}

test('kaufen: fremdes Angebot geht durch, das eigene nie', () => {
  assert.equal(kaufPruefung({ tradeId: 1, buyNowPrice: 900 }), 'los');
  assert.equal(kaufPruefung({ tradeId: 1, buyNowPrice: 900, tradeOwner: false }), 'los');
  // "weiter", nicht "ende": Das naechste Angebot der Liste wird geprueft.
  assert.equal(kaufPruefung({ tradeId: 1, buyNowPrice: 900, tradeOwner: true }), 'weiter');
});

test('kaufen: ein beendeter Lauf bleibt "ende", auch beim eigenen Angebot', () => {
  assert.equal(kaufPruefung({ tradeId: 1, buyNowPrice: 900, tradeOwner: true }, { aktuell: false }), 'ende');
});

// --- App-Weg: sniffer.js gibt tradeOwner mit -------------------------------
function appTreffer(auktion) {
  const ausgaben = [];
  const hoerer = [];
  const item = { id: 77, definitionId: 50231747, rating: 84, _auction: auktion };
  const window = {
    location: { href: 'https://www.ea.com/x', origin: 'https://www.ea.com' },
    addEventListener(art, fn) { if (art === 'message') hoerer.push(fn); },
    postMessage(message) { ausgaben.push(message); },
    fetch() {},
    UTSearchCriteriaDTO: function UTSearchCriteriaDTO() {},
    services: {
      Item: {
        searchTransferMarket: () => ({ observe(_, rueckruf) { rueckruf(null, { success: true, status: 200, data: { items: [item] } }); } })
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
    URL, Date, Number, Boolean, String, Object, Math, Array,
    setTimeout: () => {},
    console: { log() {}, warn() {} }
  });
  vm.runInContext(sniffer, context);
  const kriterien = { typ: 'player', maskedDefId: 231747, anzahl: 20, seite: 1, start: 0 };
  for (const fn of hoerer) fn({ source: window, data: { __ownbot: 'appSuche?', requestId: 3, kriterien, nurSuchseite: false } });
  const antwort = ausgaben.filter((m) => m.__ownbot === 'appAntwort').pop();
  assert.ok(antwort && Array.isArray(antwort.auctionInfo), 'keine Antwort der App-Suche');
  return antwort.auctionInfo[0];
}

test('App-Weg: das eigene Angebot ist als solches erkennbar', () => {
  const eigen = appTreffer({ tradeId: 5, buyNowPrice: 900, tradeState: 'active', bidState: 'none', tradeOwner: true });
  assert.equal(eigen.tradeOwner, true);
  const fremd = appTreffer({ tradeId: 5, buyNowPrice: 900, tradeState: 'active', bidState: 'highest' });
  assert.equal(fremd.tradeOwner, false, 'fehlt das Feld, ist es kein eigenes Angebot');
  assert.equal(fremd.bidState, 'highest', 'bidState kommt unveraendert mit');
});
