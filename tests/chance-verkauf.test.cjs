const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const section = source.slice(source.indexOf('  async function listPreisFuer('), source.indexOf('  // Stellt eine gekaufte Karte ein.'));

function setup(priceHistory) {
  const context = vm.createContext({
    Date, Number, Math,
    CONFIG: { LIST_MIN_PRICE: 200, LIST_PRICE_MAX_AGE_MS: 60 * 60000, LIST_PRICE_LANG_MAX_AGE_MS: 12 * 60 * 60000 },
    STATE: { listFestpreis: 0, preisMethode: 'empfohlen', preisLangeNutzen: false },
    toInt: (v) => { const n = Number(v); return Number.isFinite(n) ? Math.floor(n) : NaN; },
    plausiblePrice: (v) => (Number(v) > 0 ? Math.floor(Number(v)) : 0),
    verkaufsPreisAusEintrag: (e) => ({ preis: e.market, quelle: 'markt' }),
    gedaechtnisPreis: async () => null,
    chrome: { storage: { local: { get: async () => ({ priceHistory }) } } }
  });
  vm.runInContext(section, context);
  return context;
}

const frischerCheck = { '100:85:3': [{ t: Date.now() - 5 * 60000, market: 8900 }] };

test('Chance: das mitgebrachte Ziel geht vor einem frischen Preis-Check', async () => {
  const c = setup(frischerCheck);
  c.t = { key: '100:85:3', chance: true, salePrice: 9700, salePriceAt: Date.now() - 10 * 60000 };
  const p = await vm.runInContext('listPreisFuer(t)', c);
  assert.equal(p.preis, 9700);
  assert.equal(p.quelle, 'chance-ziel');
});

test('ohne Chance bleibt der frische Preis-Check vorne (unveraendert)', async () => {
  const c = setup(frischerCheck);
  c.t = { key: '100:85:3', salePrice: 9700, salePriceAt: Date.now() - 10 * 60000 };
  assert.equal((await vm.runInContext('listPreisFuer(t)', c)).preis, 8900);
});

test('ein altes Chance-Ziel zaehlt nicht mehr', async () => {
  const c = setup(frischerCheck);
  c.t = { key: '100:85:3', chance: true, salePrice: 9700, salePriceAt: Date.now() - 90 * 60000 };
  assert.equal((await vm.runInContext('listPreisFuer(t)', c)).preis, 8900);
});

test('ein fester Preis je Zeile geht weiter allem vor', async () => {
  const c = setup(frischerCheck);
  c.t = { key: '100:85:3', chance: true, listFestpreis: 12000, salePrice: 9700, salePriceAt: Date.now() };
  assert.equal((await vm.runInContext('listPreisFuer(t)', c)).preis, 12000);
});
