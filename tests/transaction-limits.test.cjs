const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'content.js'), 'utf8');
const section = source.slice(source.indexOf('  let transactionPending ='), source.indexOf('  async function executeBuy'));

function setup(reserve) {
  const target = { key: '1', maxPrice: 1000 };
  const run = { token: 1, startedAt: Date.now(), cfg: { maxBuys: 3, budget: 2000, filterBuyLimit: 2, filterSpendLimit: 1500, timeLimitMin: 30 }, stats: { bought: 0, bids: 0, spent: 0, bidCommitted: 0 }, perTarget: new Map([['1', { bought: 0, bids: 0, spent: 0, bidCommitted: 0 }]]) };
  const calls = [];
  const STATE = { run, running: true, seen: new Set() };
  const context = vm.createContext({ STATE, run, target, Date, Number,
    CONFIG: { CARD_LIMIT_DAY: 20 },
    cardCount: () => 0, // Tageslimit je Karte hier nicht im Weg
    isCurrent: token => STATE.running && token === 1,
    nextBid: () => 900, bin: () => 900,
    reserveUsage: async kind => { calls.push(kind); if (reserve) await reserve(STATE); },
    executeBuy: async () => calls.push('buy'), executeBid: async () => calls.push('bid')
  });
  vm.runInContext(section, context);
  return { context, run, target, calls, STATE };
}

test('bids reserve a daily action before sending', async () => {
  const s = setup();
  await vm.runInContext('placeBid({tradeId: 1}, target, run)', s.context);
  assert.deepEqual(s.calls, ['buy', 'bid']);
});
test('stop during reservation prevents request', async () => {
  const s = setup(state => { state.running = false; });
  await vm.runInContext('buy({tradeId: 1}, target, run)', s.context);
  assert.deepEqual(s.calls, ['buy']);
});
test('committed bids consume the session budget', async () => {
  const s = setup(); s.run.stats.bidCommitted = 1200;
  await vm.runInContext('buy({tradeId: 1}, target, run)', s.context);
  assert.deepEqual(s.calls, []);
});
test('filter action limit is enforced for both types', async () => {
  const s = setup(); s.run.perTarget.get('1').bids = 2;
  await vm.runInContext('buy({tradeId: 1}, target, run); placeBid({tradeId: 2}, target, run)', s.context);
  assert.deepEqual(s.calls, []);
});
test('same auction is not bought after bidding', async () => {
  const s = setup(); s.STATE.seen.add('bid:1');
  await vm.runInContext('buy({tradeId: 1}, target, run)', s.context);
  assert.deepEqual(s.calls, []);
});
test('expired targets cannot transact', async () => {
  const s = setup(); s.target.expiresAt = 1;
  await vm.runInContext('placeBid({tradeId: 1}, target, run)', s.context);
  assert.deepEqual(s.calls, []);
});
test('concurrent calls submit at most one request', async () => {
  const s = setup();
  await vm.runInContext('Promise.all([buy({tradeId: 1}, target, run), placeBid({tradeId: 2}, target, run)])', s.context);
  assert.deepEqual(s.calls, ['buy', 'buy']);
});
