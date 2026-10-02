const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const section = source.slice(source.indexOf('  // Zielpreis liegt ueber dem Markt'), source.indexOf('  function randomBetween('));

const PAGE_SIZE = 21;
const BROAD_HITS = 2;

function setup({ stopIfTooBroad = true, bidSniping = false } = {}) {
  const target = { key: '1:84', playerId: 1, rating: 84, maxPrice: 1000 };
  const run = {
    cfg: { stopIfTooBroad, bidSniping, filterSearchLimit: 100, filterBuyLimit: 3, filterSpendLimit: 0 },
    perTarget: new Map([['1:84', { scans: 0, bought: 0, bids: 0, spent: 0, bidCommitted: 0, fullPages: 0 }]])
  };
  const context = vm.createContext({
    run, target, Date, Boolean, Number,
    CONFIG: { BROAD_FILTER_HITS: BROAD_HITS, PAGE_SIZE, CARD_LIMIT_DAY: 20 },
    cardCount: () => 0 // Tageslimit je Karte wird eigens geprueft
  });
  vm.runInContext(section, context);
  return { context, run, target };
}

// Bildet nach, was search() macht: gezaehlt wird, wie viele Treffer wirklich
// beim Zielpreis oder darunter liegen - nicht die blosse Trefferzahl.
function suchen(s, unterZielpreis) {
  const p = s.run.perTarget.get('1:84');
  p.scans += 1;
  const bidMode = Boolean(s.run.cfg.bidSniping);
  if (!bidMode && unterZielpreis >= PAGE_SIZE) p.fullPages = (p.fullPages || 0) + 1;
  else p.fullPages = 0;
}

const zuWeit = (s) => vm.runInContext('filterTooBroad(target, run)', s.context);
const nutzbar = (s) => vm.runInContext('filterAvailable(target, run)', s.context);

test('eine einzelne volle Trefferseite reicht noch nicht', () => {
  const s = setup();
  suchen(s, PAGE_SIZE);
  assert.equal(zuWeit(s), false, 'ein Ausreisser darf keinen Filter abschalten');
  assert.equal(nutzbar(s), true);
});

test('zwei volle Seiten hintereinander schalten den Filter ab', () => {
  const s = setup();
  suchen(s, PAGE_SIZE);
  suchen(s, PAGE_SIZE);
  assert.equal(zuWeit(s), true);
  assert.equal(nutzbar(s), false);
});

test('eine normale Trefferzahl dazwischen setzt den Zaehler zurueck', () => {
  const s = setup();
  suchen(s, PAGE_SIZE);
  suchen(s, 3);
  suchen(s, PAGE_SIZE);
  assert.equal(zuWeit(s), false, 'nur ununterbrochen volle Seiten zaehlen');
  assert.equal(nutzbar(s), true);
});

test('mehr Treffer als eine Seite zaehlen ebenfalls', () => {
  const s = setup();
  suchen(s, PAGE_SIZE + 5);
  suchen(s, PAGE_SIZE + 5);
  assert.equal(zuWeit(s), true);
});

// Der gemeldete Fehlalarm: volle Seiten, aber die Angebote lagen ueber dem
// Zielpreis. Genau dann darf die Regel nicht anschlagen - sonst bestraft sie
// einen guten Zielpreis dafuer, dass EA den Preisfilter ignoriert.
test('volle Seiten mit teuren Angeboten sind kein zu weiter Filter', () => {
  const s = setup();
  // Zielpreis 700, Marktpreis 850: von 21 Treffern liegt einer darunter.
  suchen(s, 1);
  suchen(s, 1);
  suchen(s, 1);
  assert.equal(zuWeit(s), false);
  assert.equal(nutzbar(s), true, 'der Filter muss weiterlaufen duerfen');
});

test('abgeschaltet bleibt der Filter unbehelligt', () => {
  const s = setup({ stopIfTooBroad: false });
  suchen(s, PAGE_SIZE);
  suchen(s, PAGE_SIZE);
  suchen(s, PAGE_SIZE);
  assert.equal(zuWeit(s), false);
  assert.equal(nutzbar(s), true, 'wer das abschaltet, sucht weiter');
});

test('leere Trefferlisten schalten nichts ab', () => {
  const s = setup();
  suchen(s, 0);
  suchen(s, 0);
  suchen(s, 0);
  assert.equal(zuWeit(s), false, 'keine Angebote ist das Gegenteil von zu weit gefasst');
  assert.equal(nutzbar(s), true);
});

test('ohne Fortschrittseintrag gilt der Filter nicht als zu weit', () => {
  const s = setup();
  s.run.perTarget.delete('1:84');
  assert.equal(zuWeit(s), false);
  assert.equal(nutzbar(s), false, 'aber nutzbar ist er dann auch nicht');
});

// Gemeldeter Fehlalarm: Im Gebotsmodus hat die Regel jeden Filter abgeschaltet.
// Auktionen starten niedrig (600 Coins) und steigen erst - dass 21 davon unter
// dem Zielpreis liegen, ist der Normalfall und kein zu weiter Filter.
test('im Gebotsmodus greift die Regel gar nicht', () => {
  const s = setup({ bidSniping: true });
  suchen(s, PAGE_SIZE);
  suchen(s, PAGE_SIZE);
  suchen(s, PAGE_SIZE);
  assert.equal(zuWeit(s), false);
  assert.equal(nutzbar(s), true, 'Gebots-Sniping darf davon nie gestoppt werden');
});

test('die anderen Grenzen gelten weiterhin', () => {
  const s = setup();
  s.run.perTarget.get('1:84').scans = 100;
  assert.equal(nutzbar(s), false, 'Suchlimit greift unabhaengig davon');
  assert.equal(zuWeit(s), false);
});
