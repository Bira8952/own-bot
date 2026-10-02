const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'popup.js'), 'utf8');
const von = source.indexOf('const MAX_COLLECTIONS =');
const section = source.slice(von, source.indexOf('$("collection-pick").addEventListener', von));
const reinigungVon = source.indexOf('function sanitizeTargets(');
const reinigung = source.slice(reinigungVon, source.indexOf('function setTargetsHint(', reinigungVon));

function setup(gespeichert) {
  const nodes = {};
  const $ = (id) => (nodes[id] ||= {
    value: '', textContent: '', className: '', disabled: false,
    replaceChildren(...kinder) { this.kinder = kinder; }
  });
  const context = vm.createContext({
    $, Object, Array, Number, String, Boolean, RegExp, document: {
      createElement: () => ({ value: '', textContent: '' })
    },
    MAX_TARGETS: 10,
    targets: [],
    chrome: { storage: { local: { get: async () => ({ collections: gespeichert }), set: async () => {} } } }
  });
  vm.runInContext(reinigung + section, context);
  return { context, $ };
}

const namePruefen = (s, roh) => vm.runInContext('collectionName(' + JSON.stringify(roh) + ')', s.context);

const ZIEL = { playerId: 1, playerName: 'Example', rating: 84, maxPrice: 700 };

test('brauchbare Namen kommen durch', () => {
  const s = setup();
  for (const name of ['Bundesliga-Gold', 'Icons 2024', 'Mein Team (neu)', 'A']) {
    assert.equal(namePruefen(s, name), name, name);
  }
});

test('Leerraum wird zusammengefasst und abgeschnitten', () => {
  const s = setup();
  assert.equal(namePruefen(s, '  viel    Luft  '), 'viel Luft');
  assert.equal(namePruefen(s, 'x'.repeat(60)).length, 40);
});

test('unbrauchbare Namen werden abgelehnt', () => {
  const s = setup();
  for (const name of ['', '   ', '<script>', 'a/b', 'a"b', null, 42, undefined]) {
    assert.equal(namePruefen(s, name), '', JSON.stringify(name));
  }
});

test('gespeicherte Sammlungen werden beim Laden geprueft', async () => {
  const s = setup({
    'Gute Liste': [ZIEL],
    '<kaputt>': [ZIEL],
    'Leere Liste': [],
    'Muell drin': [{ playerId: 0, playerName: '', maxPrice: 0 }]
  });
  await vm.runInContext('loadCollections()', s.context);
  const namen = Object.keys(vm.runInContext('collections', s.context));
  assert.deepEqual(namen, ['Gute Liste'], 'nur die brauchbare Sammlung bleibt');
});

test('eine Liste statt einer Zuordnung wird verworfen', async () => {
  const s = setup([ZIEL]);
  await vm.runInContext('loadCollections()', s.context);
  assert.deepEqual(Object.keys(vm.runInContext('collections', s.context)), []);
});

test('Ziele aus einer Sammlung werden bereinigt', async () => {
  const s = setup({
    'Mit Muell': [
      { ...ZIEL, maxPrice: '700', rating: '84', boese: 'x' },
      { playerId: 2, playerName: 'Zweiter', maxPrice: 900 }
    ]
  });
  await vm.runInContext('loadCollections()', s.context);
  const liste = vm.runInContext('collections["Mit Muell"].ziele', s.context);
  assert.equal(liste.length, 2);
  assert.equal(liste[0].maxPrice, 700, 'Text wird zu Zahl');
  assert.equal(liste[0].boese, undefined, 'fremde Felder fliegen raus');
});

test('mehr als zehn Spieler passen nicht in eine Sammlung', async () => {
  const viele = Array.from({ length: 15 }, (_, i) => ({ ...ZIEL, playerId: i + 1 }));
  const s = setup({ 'Zu viele': viele });
  await vm.runInContext('loadCollections()', s.context);
  assert.equal(vm.runInContext('collections["Zu viele"].ziele.length', s.context), 10);
});

test('ohne gespeicherte Sammlungen bleibt es leer, ohne Fehler', async () => {
  for (const nichts of [undefined, null, 'text', 42]) {
    const s = setup(nichts);
    await vm.runInContext('loadCollections()', s.context);
    assert.deepEqual(Object.keys(vm.runInContext('collections', s.context)), []);
  }
});
