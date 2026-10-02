const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Preissprung-Schutz (02.10.2026). Weicht ein neuer Preis-Check um mehr als
// 35 % vom letzten derselben Karte ab, gilt beim Kaufen der kleinere und beim
// Verkaufen der groessere Preis - mit "bitte nachmessen", aber OHNE
// automatische Nachmessung (0 Anfragen).

const content = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const popup = fs.readFileSync(path.join(__dirname, '..', 'popup.js'), 'utf8');
const speichern = content.slice(content.indexOf('  function savePriceEntry('), content.indexOf('  function endCheck('));
const listPreis = content.slice(content.indexOf('  async function listPreisFuer('), content.indexOf('  // Stellt eine gekaufte Karte ein.'));
const preisCheck = content.slice(content.indexOf('  async function runPriceCheck('), content.indexOf('  function startPriceCheck('));
const popupPreise = popup.slice(popup.indexOf('let priceTiers = null;'), popup.indexOf('function sellingPrices('));
const popupVorschlag = popup.slice(popup.indexOf('function discountValue('), popup.indexOf('const LEERLAUF_SUCHEN'));
const popupVerkauf = popup.slice(popup.indexOf('function verkaufPreisEintrag('), popup.indexOf('function verkaufGewinnElement('));

const MIN = 60000;
const plain = (o) => JSON.parse(JSON.stringify(o));

// --- savePriceEntry --------------------------------------------------------

function speicher(vorher) {
  const store = { priceHistory: { k: vorher.map((e) => Object.assign({}, e)) } };
  const context = vm.createContext({
    Date, Math, Number, Object, Array, Boolean,
    DAY: 24 * 60 * MIN,
    CONFIG: { HISTORY_DAYS: 14, PREIS_SPRUNG_AB: 0.35, PREIS_SPRUNG_REF_MAX_MS: 6 * 60 * MIN },
    updateStorage: (key, fn) => { store[key] = fn(store[key]); return Promise.resolve(); }
  });
  vm.runInContext(speichern, context);
  context.store = store;
  return context;
}

async function neuerCheck(vorher, neu) {
  const c = speicher(vorher);
  const entry = Object.assign({ t: Date.now() }, neu);
  c.entry = entry;
  await vm.runInContext('savePriceEntry("k", entry)', c);
  const liste = c.store.priceHistory.k;
  assert.equal(liste[liste.length - 1], entry, 'dasselbe Objekt wird gespeichert');
  return entry;
}

const vor = (minuten, werte) => Object.assign({ t: Date.now() - minuten * MIN }, werte);

test('savePriceEntry: der erste Eintrag einer Karte hat keinen Vergleich', async () => {
  const e = await neuerCheck([], { market: 6000 });
  assert.equal(e.preisSprung, undefined);
});

test('savePriceEntry: ueber 35 % Abweichung markiert den Eintrag (das Objekt selbst, fuers Protokoll)', async () => {
  const e = await neuerCheck([vor(30, { market: 10000 })], { market: 6000 });
  assert.ok(e.preisSprung);
  assert.equal(e.preisSprung.vorher, 10000);
  assert.equal(e.preisSprung.abweichung, 0.4);
  assert.ok(e.preisSprung.vorherT > 0);
  assert.match(e.preisSprung.hinweis, /bitte nachmessen/);
});

test('savePriceEntry: genau 35 % ist noch kein Sprung', async () => {
  assert.equal((await neuerCheck([vor(30, { market: 10000 })], { market: 13500 })).preisSprung, undefined);
  assert.equal((await neuerCheck([vor(30, { market: 10000 })], { market: 6500 })).preisSprung, undefined);
  assert.ok((await neuerCheck([vor(30, { market: 10000 })], { market: 13600 })).preisSprung);
});

test('savePriceEntry: ein Vorgaenger aelter als 6 Stunden oder ohne Marktpreis zaehlt nicht', async () => {
  assert.equal((await neuerCheck([vor(6 * 60 + 1, { market: 10000 })], { market: 3000 })).preisSprung, undefined);
  assert.ok((await neuerCheck([vor(6 * 60 - 1, { market: 10000 })], { market: 3000 })).preisSprung);
  assert.equal((await neuerCheck([vor(30, {})], { market: 3000 })).preisSprung, undefined);
  assert.equal((await neuerCheck([vor(30, { market: 10000 })], { market: 0 })).preisSprung, undefined);
});

test('savePriceEntry: zurueck auf dem alten Stand oder bestaetigt - keine neue Markierung', async () => {
  const markiert = vor(10, { market: 6000, preisSprung: { vorher: 10000 } });
  assert.equal((await neuerCheck([vor(40, { market: 10000 }), markiert], { market: 9800 })).preisSprung, undefined,
    'der Sprung war der Ausreisser');
  assert.equal((await neuerCheck([vor(40, { market: 10000 }), markiert], { market: 6200 })).preisSprung, undefined,
    'der zweite Check bestaetigt den Sprung');
  const kette = await neuerCheck([vor(40, { market: 10000 }), markiert], { market: 3000 });
  assert.equal(kette.preisSprung.vorher, 6000, 'eine Kette wird gegen den letzten Eintrag markiert');
});

test('savePriceEntry: andere gemessene Chemie ist ein anderer Markt, kein Sprung', async () => {
  const e = await neuerCheck([vor(30, { market: 10000, chemGefiltert: true, chem: 0 })], { market: 3000, chemGefiltert: true, chem: 4 });
  assert.equal(e.preisSprung, undefined);
  const gleich = await neuerCheck([vor(30, { market: 10000, chemGefiltert: true, chem: 4 })], { market: 3000, chemGefiltert: true, chem: 4 });
  assert.ok(gleich.preisSprung);
});

test('savePriceEntry: auch ein verifizierter Eintrag wird markiert', async () => {
  const e = await neuerCheck([vor(30, { market: 10000 })], { market: 6000, verified: true, rounds: 2 });
  assert.ok(e.preisSprung, 'beide Kontrollrunden koennen denselben leeren Markt sehen');
});

test('Preis-Check: der Hinweis steht im Protokoll und unter dem Knopf, nachgemessen wird nicht', () => {
  assert.match(preisCheck, /if \(entry\.preisSprung\) \{\s*warn\(/);
  assert.match(preisCheck, /endCheck\(token, entry\.preisSprung \? entry\.preisSprung\.hinweis : "", false\)/);
  // Kein neuer Check aus dem Sprung heraus: savePriceEntry fragt EA nie.
  assert.doesNotMatch(speichern, /api\(|seitenFrage\(|startPriceCheck\(|runPriceCheck\(/);
});

// --- listPreisFuer (Verkaufen: der groessere Preis) ---------------------------

function verkaufMotor(priceHistory, state) {
  const context = vm.createContext({
    Date, Number, Math,
    CONFIG: { LIST_MIN_PRICE: 200, LIST_PRICE_MAX_AGE_MS: 60 * MIN, LIST_PRICE_LANG_MAX_AGE_MS: 12 * 60 * MIN },
    STATE: Object.assign({ listFestpreis: 0, preisMethode: 'empfohlen', preisLangeNutzen: false }, state || {}),
    toInt: (v) => { const n = Number(v); return Number.isFinite(n) ? Math.floor(n) : NaN; },
    plausiblePrice: (v) => (Number(v) > 0 ? Math.floor(Number(v)) : 0),
    verkaufsPreisAusEintrag: (e) => ({ preis: e.market, quelle: 'markt' }),
    gedaechtnisPreis: async () => null,
    chrome: { storage: { local: { get: async () => ({ priceHistory }) } } }
  });
  vm.runInContext(listPreis, context);
  return context;
}

async function verkaufsPreis(liste, target, state) {
  const c = verkaufMotor({ '100:85:3': liste }, state);
  c.t = Object.assign({ key: '100:85:3' }, target || {});
  return plain(await vm.runInContext('listPreisFuer(t)', c));
}

const absturz = [vor(40, { market: 10000 }), vor(5, { market: 6000, preisSprung: { vorher: 10000 } })];

test('listPreisFuer: nach einem unbestaetigten Absturz wird zum vorigen, hoeheren Preis eingestellt', async () => {
  const p = await verkaufsPreis(absturz);
  assert.equal(p.preis, 10000);
  assert.equal(p.sprung.genommen, 'vorher');
  assert.equal(p.sprung.vorher, 10000);
  assert.equal(p.sprung.markt, 6000);
});

test('listPreisFuer: nach einem Sprung nach oben bleibt der neue, hoehere Preis', async () => {
  const p = await verkaufsPreis([vor(40, { market: 10000 }), vor(5, { market: 14000, preisSprung: { vorher: 10000 } })]);
  assert.equal(p.preis, 14000);
  assert.equal(p.sprung.genommen, 'neu');
});

test('listPreisFuer: ohne Markierung bleibt alles wie bisher', async () => {
  const p = await verkaufsPreis([vor(40, { market: 10000 }), vor(5, { market: 6000 })]);
  assert.equal(p.preis, 6000);
  assert.equal(p.sprung, null);
});

test('listPreisFuer: auch mit "Verkaufspreis laenger nutzen" gilt der groessere Preis', async () => {
  const alt = [vor(4 * 60, { market: 10000 }), vor(3 * 60, { market: 6000, preisSprung: { vorher: 10000 } })];
  const p = await verkaufsPreis(alt, {}, { preisLangeNutzen: true });
  assert.equal(p.preis, 10000);
  assert.equal(p.sprung.genommen, 'vorher');
});

test('listPreisFuer: Festpreis und Chance-Ziel gehen weiter vor, ein Sprung wirkt dort nicht', async () => {
  const fest = await verkaufsPreis(absturz, { listFestpreis: 12000 });
  assert.equal(fest.preis, 12000);
  assert.equal(fest.sprung, undefined);
  const chance = await verkaufsPreis(absturz, { chance: true, salePrice: 9700, salePriceAt: Date.now() - 10 * MIN });
  assert.equal(chance.preis, 9700);
  assert.equal(chance.quelle, 'chance-ziel');
});

// --- Popup: Zielpreis (Kaufen: der kleinere Preis) ----------------------------

function popupKontext(extra) {
  const werte = { discount: '10', minProfit: '200', preisMethode: 'empfohlen', preisStufen: '0' };
  const context = vm.createContext(Object.assign({
    Array, Number, Object, Math, JSON, Date,
    SALE_FEE: 0.05,
    fmt: (n) => String(n),
    $: (id) => (id in werte ? { value: werte[id] } : id === 'smartProfit' ? { checked: true } : id === 'deckelFst' ? { checked: false } : null)
  }, extra || {}));
  vm.runInContext(popupPreise, context);
  vm.runInContext(popupVorschlag, context);
  return context;
}

const vorschlag = (c, entry) => { c.entry = entry; return plain(vm.runInContext('suggestionFor(entry)', c)); };

test('suggestionFor: nach einem unbestaetigten Sprung nach oben kauft der Bot zum kleineren Preis', () => {
  const c = popupKontext();
  const s = vorschlag(c, { market: 13500, lowest: 13000, preisSprung: { vorher: 10000 } });
  const alt = vorschlag(c, { market: 10000, lowest: 13000 });
  const neu = vorschlag(c, { market: 13500, lowest: 13000 });
  assert.equal(s.value, alt.value);
  assert.ok(s.value < neu.value);
  assert.match(s.note, /nachmessen/);
  assert.equal(s.verkauf.grund, 'sprung');
  assert.match(vm.runInContext('verkaufsPreisText({ grund: "sprung" })', c), /nachmessen/);
});

test('suggestionFor: nach einem Sprung nach unten ist der neue Preis schon der kleinere', () => {
  const c = popupKontext();
  assert.deepEqual(vorschlag(c, { market: 6000, preisSprung: { vorher: 10000 } }), vorschlag(c, { market: 6000 }));
});

test('suggestionFor: ohne Markierung ist das Ergebnis unveraendert', () => {
  const c = popupKontext();
  assert.deepEqual(vorschlag(c, { market: 13500, lowest: 13000, preisSprung: null }), vorschlag(c, { market: 13500, lowest: 13000 }));
});

// --- Popup: Verkaufs-Helfer (Verkaufen: der groessere Preis) -------------------

function verkaufVorschlag(entry) {
  const c = popupKontext({
    history: { '100:85': [Object.assign({ t: Date.now() - MIN }, entry)] },
    VERKAUF_PREIS_FRISCH_MS: 60 * MIN
  });
  vm.runInContext(popupVerkauf, c);
  c.item = { assetId: 100, rating: 85, eaMin: 0, eaMax: 0, gekauftFuer: 0 };
  return plain(vm.runInContext('verkaufVorschlag(item)', c));
}

test('verkaufVorschlag: rechnet beim Sprung denselben Preis wie listPreisFuer', () => {
  const ab = verkaufVorschlag({ market: 6000, preisSprung: { vorher: 10000, hinweis: 'Preissprung – bitte nachmessen.' } });
  assert.equal(ab.preis, 10000);
  assert.equal(ab.start, 9900);
  assert.match(ab.preisSprung, /nachmessen/);
  const auf = verkaufVorschlag({ market: 13000, preisSprung: { vorher: 10000 } });
  assert.equal(auf.preis, 13000);
  const ohne = verkaufVorschlag({ market: 6000 });
  assert.equal(ohne.preis, 6000);
  assert.equal(ohne.preisSprung, '');
});
