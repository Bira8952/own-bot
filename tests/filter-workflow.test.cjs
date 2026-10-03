const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'popup.js'), 'utf8');
const section = source.slice(source.indexOf('let filterLoadToken ='), source.indexOf('// Zielliste: mehrere Spieler'));
// activateModalFilter nutzt seit 28.09.2026 rarityWert (mehrere Kartenarten).
const artVon = source.indexOf('function rarityListeWert(');
const art = source.slice(artVon, source.indexOf('function rarityValue(', artVon));

function setup({ autoStart = false, fresh = true, budget = 5000, cancel = false } = {}) {
  const nodes = {};
  const $ = id => nodes[id] ||= { checked: false, disabled: false, value: '', textContent: '' };
  $('fm-auto-pricing').checked = true;
  $('fm-auto-start').checked = autoStart;
  $('budget').value = budget;
  const calls = [];
  const notices = [];
  const context = vm.createContext({ $, Date, setTimeout: fn => { fn(); },
    modalFilterRow: { key: '1:89', player: { id: 1, name: 'Example' }, rating: 89, rarity: -1, entry: { t: Date.now(), market: 800, confidence: 'hoch' }, score: 80 },
    targets: [], MAX_TARGETS: 10, targetKey: t => `${t.playerId}:${t.rating}`, selected: null,
    liveMarket: { list: [] },
    modalProfitMode: 'auto',
    FUER_DICH_AB: 60, FUER_DICH_TEXT: '60', ABSTAND_WARNUNG_AB: 2,
    // popup.js sucht seit dem Umbau ueber WURZEL statt document - im Fenster
    // ist das dasselbe Dokument, in der Seite die Schattenwurzel.
    document: { querySelectorAll: () => [], querySelector: () => ({ click() {} }) },
    WURZEL: { querySelectorAll: () => [], querySelector: () => ({ click() {} }) },
    send: async cmd => {
      calls.push(cmd);
      if (cancel) vm.runInContext('filterLoadToken += 1', context);
      return { ok: true, status: { check: { running: false, searches: 3 } } };
    },
    chrome: { storage: { local: { get: async () => ({ priceHistory: { '1:89': [{ t: fresh ? Date.now() : 1, market: 800, confidence: 'hoch' }] } }) } } },
    modalFilterValues: () => ({ maxPrice: 650, salePrice: 800, expectedProfit: 110, wantedProfit: 100 }),
    fmt: n => String(n), stepFor: () => 50,
    stufenUnterAngebot: () => 0, nahAmAngebot: () => true,
    renderLoader() {}, renderSnipeNotiz() {}, checkLoaderOpts: () => ({}), aktuelleSperre: () => '',
    mitPreisCheck: (alt, neu) => Object.assign({}, alt, neu),
    suggestionFor: () => ({ value: 650 }), filterScore: () => 80, filterKarteAuffrischen() {},
    sofortStartSperre: () => null,
    // Die echte sofortStartSperre steht im Abschnitt und fragt das Budget-Feld.
    budgetOhneGrenze: () => String($('budget').value).trim() === '',
    choose() {}, zeigeSnipeNotiz(text) { notices.push(text); }, setSnipeMode() {}, goToStep() {}, cancelFilterPriceCheck() {},
    saveSettings: async () => {}, closeFilterModal() {}, renderTargets() {}, renderLiveFilters() {}, renderFilterModal() {},
    openStartModal: () => calls.push('configure'), startRun: async list => calls.push(['start', list])
  });
  vm.runInContext(art + section, context);
  return { context, calls, notices, $ };
}

test('fresh pricing loads a filter without buying by default', async () => {
  const s = setup();
  await vm.runInContext('activateModalFilter(false)', s.context);
  assert.equal(s.context.targets.length, 1);
  assert.deepEqual(s.calls, ['priceCheck', 'status']);
});
test('explicit auto start starts only the chosen filter', async () => {
  const s = setup({ autoStart: true });
  await vm.runInContext('activateModalFilter(false)', s.context);
  assert.equal(s.calls[2][0], 'start');
  assert.equal(s.calls[2][1].length, 1);
  assert.equal(s.calls[2][1][0].maxPrice, 650);
});
test('old stored results cannot trigger a purchase', async () => {
  const s = setup({ autoStart: true, fresh: false });
  await vm.runInContext('activateModalFilter(false)', s.context);
  assert.equal(s.context.targets.length, 0);
  assert.match(s.$('fm-progress').textContent, /frischer/);
});
test('insufficient budget is never silently increased', async () => {
  const s = setup({ autoStart: true, budget: 500 });
  await vm.runInContext('activateModalFilter(false)', s.context);
  assert.equal(s.$('budget').value, 500);
  assert.equal(s.calls.length, 2);
  const notiz = vm.runInContext('snipeNotiz && snipeNotiz.text', s.context);
  assert.match(notiz, /Budget/, 'der fehlende Betrag wird sichtbar gemeldet');
});
test('closing the workflow prevents subsequent start', async () => {
  const s = setup({ autoStart: true, cancel: true });
  await vm.runInContext('activateModalFilter(false)', s.context);
  assert.equal(s.context.targets.length, 0);
  assert.deepEqual(s.calls, ['priceCheck']);
});
