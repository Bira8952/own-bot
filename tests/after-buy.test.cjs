const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const von = source.indexOf('  function validateConfig(');
const section = source.slice(von, source.indexOf('  function parsePlayers(', von));

function pruefe(eingabe) {
  const context = vm.createContext({
    Object, Array, Number, Math, String, Date, Infinity,
    CONFIG: { MAX_TARGETS: 10, MAX_BIDS_PER_AUCTION: 4 },
    toInt: (v) => { const n = Number(v); return Number.isFinite(n) ? Math.floor(n) : NaN; },
    parsePlayer: () => ({ player: { playerId: 1, playerName: 'Example', rating: 84 } }),
    priceKey: (id, r) => id + ':' + (r || 0),
    roundDownToStep: (p) => Math.floor(p / 50) * 50
  });
  vm.runInContext(section, context);
  context.eingabe = eingabe;
  return vm.runInContext('validateConfig(eingabe)', context);
}

const basis = { targets: [{ playerId: 1, maxPrice: 1000 }], budget: 5000, maxBuys: 3 };

test('ohne Angabe wird nichts verschoben', () => {
  const { cfg } = pruefe({ ...basis });
  assert.equal(cfg.afterBuy, 'keep');
});

test('die drei Wege werden uebernommen', () => {
  for (const weg of ['club', 'transfer', 'keep']) {
    const { cfg } = pruefe({ ...basis, afterBuy: weg });
    assert.equal(cfg.afterBuy, weg);
  }
});

test('ein unbekannter Weg faellt auf liegen lassen zurueck', () => {
  // Lieber nichts verschieben als an eine geratene Stelle.
  for (const unsinn of ['verkaufen', '', null, 42, 'CLUB']) {
    const { cfg } = pruefe({ ...basis, afterBuy: unsinn });
    assert.equal(cfg.afterBuy, 'keep', 'durchgelassen: ' + JSON.stringify(unsinn));
  }
});

test('die alte Einstellung toClub wird weiter verstanden', () => {
  // Wer den Haken frueher gesetzt hatte, soll ihn nicht neu setzen muessen.
  assert.equal(pruefe({ ...basis, toClub: true }).cfg.afterBuy, 'club');
  assert.equal(pruefe({ ...basis, toClub: false }).cfg.afterBuy, 'keep');
});

test('eine ausdrueckliche Angabe schlaegt die alte Einstellung', () => {
  const { cfg } = pruefe({ ...basis, toClub: true, afterBuy: 'transfer' });
  assert.equal(cfg.afterBuy, 'transfer');
});
