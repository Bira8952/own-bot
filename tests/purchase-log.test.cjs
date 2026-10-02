const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const section = source.slice(source.indexOf('  async function executeBuy('), source.indexOf('  function isBidTarget('));

// Ein Kauf ist bezahlt, sobald EA mit ok antwortet. Alles danach darf den
// Eintrag im Kauflog nicht mehr verhindern.
function setup({ clubFehler = null, afterBuy = 'club' } = {}) {
  const geloggt = [];
  const target = { key: '1:84', playerId: 1, playerName: 'Example', rating: 84, maxPrice: 1000 };
  const run = {
    token: 1,
    cfg: { maxBuys: 5, budget: 10000, afterBuy },
    stats: { bought: 0, spent: 0, missed: 0, bids: 0, bidCommitted: 0 },
    perTarget: new Map([['1:84', { bought: 0, spent: 0, missed: 0 }]])
  };
  const STATE = { buyErrors: 0, rateLimitHits: 0, credits: null, creditsAt: 0, seen: new Set(), stats: run.stats };
  class HardStop extends Error {}
  const context = vm.createContext({
    STATE, run, target, HardStop,
    Date, Number, Math, String, Array, Object, JSON,
    CONFIG: {},
    ENDPOINTS: { bidMethod: 'PUT', clubPath: '/item', clubMethod: 'PUT' },
    bidPathFor: (id) => '/trade/' + id + '/bid',
    // Der Coin-Stand wird seit 4.24 mit Zeitstempel gesetzt, damit die
    // Oberflaeche einen veralteten Wert als solchen kennzeichnen kann.
    setCredits: (w) => { STATE.credits = w; STATE.creditsAt = Date.now(); },
    ITEM_GONE: new Set([475, 478, 479]),
    bin: () => 900,
    fmt: value => String(Number(value) || 0),
    randomBetween: (min) => min,
    sleep: async () => {},
    isCurrent: () => true,
    toInt: (v) => { const n = Number(v); return Number.isFinite(n) ? Math.floor(n) : NaN; },
    str: (v, max) => (typeof v === 'string' ? v.slice(0, max) : ''),
    remember() {}, setMessage() {}, pushEvent() {}, tonSpielen() {}, log() {}, warn() {}, notify() {}, countError() {},
    logPurchase: (p) => geloggt.push(p),
    AFTER_BUY_PILES: { club: 'club', transfer: 'trade' },
    sendToPile: async () => { if (clubFehler) throw clubFehler; return 'ok'; },
    api: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ credits: 5000, auctionInfo: [{ itemData: { id: 77, rating: 84 } }] })
    })
  });
  vm.runInContext(section, context);
  return { context, geloggt, run, STATE, HardStop };
}

async function kaufen(s) {
  s.context.auction = { tradeId: 5, itemData: { rating: 84 } };
  return vm.runInContext('executeBuy(auction, target, run)', s.context);
}

test('ein normaler Kauf landet im Kauflog', async () => {
  const s = setup();
  await kaufen(s);
  assert.equal(s.geloggt.length, 1);
  assert.equal(s.geloggt[0].price, 900);
  assert.equal(s.geloggt[0].club, 'ok');
  assert.equal(s.run.stats.bought, 1);
  assert.equal(s.run.stats.spent, 900);
});

test('ein harter Stopp beim Verschieben verliert den Kauf nicht', async () => {
  // Genau der Fall: 473 DESTINATION_FULL kommt erst beim Verschieben in den
  // Verein - da sind die Coins laengst weg. Ohne die Absicherung waere der
  // Kauf nirgends vermerkt gewesen.
  const s = setup({ clubFehler: null });
  s.context.sendToPile = async () => { throw new (s.HardStop)('Ziel ist voll (DESTINATION_FULL).'); };
  await assert.rejects(() => kaufen(s), /DESTINATION_FULL/);
  assert.equal(s.geloggt.length, 1, 'der Kauf muss trotzdem im Log stehen');
  assert.equal(s.geloggt[0].club, 'fehlgeschlagen');
  assert.equal(s.run.stats.bought, 1, 'und in der Statistik zaehlen');
});

test('ohne Vereins-Option wird gar nicht erst verschoben', async () => {
  const s = setup({ afterBuy: 'keep' });
  s.context.sendToPile = async () => { throw new Error('darf nicht aufgerufen werden'); };
  await kaufen(s);
  assert.equal(s.geloggt.length, 1);
  assert.equal(s.geloggt[0].club, '');
});

test('ein gewoehnlicher Fehler beim Verschieben wird weitergereicht', async () => {
  const s = setup();
  s.context.sendToPile = async () => { throw new TypeError('kaputt'); };
  await assert.rejects(() => kaufen(s), TypeError);
});
