const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const von = source.indexOf('  function pruneUsage(');
const section = source.slice(von, source.indexOf('  function startCooldown(', von));

const DAY = 24 * 60 * 60 * 1000;

function setup(gespeichert) {
  const STATE = { usage: {}, cardCounts: {} };
  const abgelegt = {};
  let usageChain = Promise.resolve();
  class HardStop extends Error {}
  const context = vm.createContext({
    STATE, HardStop, DAY, Promise, Object, Array, Number, Date, Math, String,
    CONFIG: {
      SEARCH_LIMIT_HOUR: 300, SEARCH_LIMIT_DAY: 1500,
      BUY_LIMIT_HOUR: 100, BUY_LIMIT_DAY: 100,
      ACTION_LIMIT_HOUR: 100, ACTION_LIMIT_DAY: 100,
      GESAMT_LIMIT_HOUR: 500, GESAMT_LIMIT_DAY: 2000,
      GESAMT_PUFFER_STUNDE: 0, GESAMT_PUFFER_TAG: 0,
      GESAMT_MAX_STUNDE: 500, GESAMT_MAX_TAG: 2000,
      CARD_LIMIT_DAY: 20
    },
    cooldownBlock: () => '',
    suchLimitTag: () => 1500,
    suchLimitStunde: () => 300,
    gesamtLimitTag: () => 2000,
    gesamtLimitStunde: () => 500,
    ausnahmeAktiv: () => false,
    usageChain,
    chrome: { storage: { local: {
      get: async () => ({ safetyUsage: gespeichert }),
      set: async (o) => { Object.assign(abgelegt, o); gespeichert = o.safetyUsage; }
    } } }
  });
  vm.runInContext(section, context);
  return { context, STATE, abgelegt, holen: () => gespeichert };
}

const reservieren = (s, art, karte) => vm.runInContext(
  'reserveUsage(' + JSON.stringify(art) + ',' + JSON.stringify(karte) + ')', s.context);
const zaehler = (s, karte) => vm.runInContext('cardCount(' + JSON.stringify(karte) + ')', s.context);

test('ein Kauf wird der Karte zugeordnet', async () => {
  const s = setup();
  await reservieren(s, 'buy', '231747:84');
  assert.equal(zaehler(s, '231747:84'), 1);
  assert.equal(zaehler(s, '231747:85'), 0, 'andere Version zaehlt getrennt');
});

test('Suchen landen nicht bei den Karten', async () => {
  const s = setup();
  await reservieren(s, 'search', '231747:84');
  assert.equal(zaehler(s, '231747:84'), 0);
});

test('das Kartenlimit stoppt den Lauf NICHT', async () => {
  // Wichtig: Es soll nur diese Karte uebersprungen werden. Der harte Stopp
  // gehoert zu den Tageslimits, nicht hierher.
  const alt = Date.now();
  const s = setup({ searches: [], buys: [], cards: { '231747:84': Array.from({ length: 20 }, () => alt) } });
  await reservieren(s, 'buy', '231747:84'); // darf nicht werfen
  assert.ok(zaehler(s, '231747:84') >= 20);
});

test('alte Aktionen fallen nach 24 Stunden heraus', async () => {
  const gestern = Date.now() - DAY - 1000;
  const s = setup({ searches: [], buys: [], cards: { '231747:84': [gestern, gestern, gestern] } });
  await reservieren(s, 'buy', '231747:84');
  assert.equal(zaehler(s, '231747:84'), 1, 'nur die neue Aktion zaehlt');
});

test('kaputte Kartenschluessel werden verworfen', async () => {
  const jetzt = Date.now();
  const s = setup({ searches: [], buys: [], cards: {
    '231747:84': [jetzt],
    'boese': [jetzt],
    '<script>': [jetzt],
    'abc:def': [jetzt]
  } });
  await reservieren(s, 'search');
  const karten = Object.keys(s.holen().cards);
  assert.deepEqual(karten, ['231747:84']);
});

test('ohne Karte laeuft ein Kauf trotzdem durch', async () => {
  const s = setup();
  await reservieren(s, 'buy');
  assert.equal(s.holen().buys.length, 1);
  assert.deepEqual(Object.keys(s.holen().cards), []);
});

test('das Tageslimit fuer Kaeufe wirft weiterhin', async () => {
  // Innerhalb des Tages, aber ausserhalb des Stundenfensters: So prueft der
  // Test wirklich das Tageslimit und nicht den inzwischen eigenen Stundendeckel.
  const jetzt = Date.now() - 2 * 60 * 60 * 1000;
  const s = setup({ searches: [], buys: Array.from({ length: 100 }, () => jetzt), cards: {} });
  await assert.rejects(() => reservieren(s, 'buy', '1:84'), /Tageslimit/);
});

test('eine Liste statt einer Zuordnung bei cards stuerzt nicht ab', async () => {
  const s = setup({ searches: [], buys: [], cards: [1, 2, 3] });
  await reservieren(s, 'buy', '1:84');
  assert.equal(zaehler(s, '1:84'), 1);
});

test('je Karte wird auf das Limit gekappt, nicht unbegrenzt gesammelt', async () => {
  const jetzt = Date.now();
  const s = setup({ searches: [], buys: [], cards: { '1:84': Array.from({ length: 50 }, () => jetzt) } });
  await reservieren(s, 'search');
  assert.equal(s.holen().cards['1:84'].length, 20, 'gekappt auf das Tageslimit');
});
