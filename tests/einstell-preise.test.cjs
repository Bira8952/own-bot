const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Startgebot und Sofortkauf beim Einstellen (02.10.2026, Fund 25/26).
// EA lehnt ein Startgebot ab, das nicht unter dem Sofortkauf liegt. Frueher
// klemmte gleichEinstellen den Sofortkauf auf genau eaMin und liess Start =
// Sofortkauf zu - eine Anfrage fuer nichts. Jetzt rechnen Motor und Popup mit
// derselben Hilfsfunktion einstellPreise.

const content = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const popup = fs.readFileSync(path.join(__dirname, '..', 'popup.js'), 'utf8');
const stufen = content.slice(content.indexOf('  let PRICE_TIERS = null;'), content.indexOf('  // Spieler + optionales Rating'));
const einstellen = content.slice(content.indexOf('  // Stellt eine gekaufte Karte ein.'), content.indexOf('  function noteOpenBid('));
const helfer = content.slice(content.indexOf('  function spielerEinstellen('), content.indexOf('  function abgelaufeneNeuEinstellen('));
const popupPreise = popup.slice(popup.indexOf('let priceTiers = null;'), popup.indexOf('function verkaufsPreisGrund('));
const popupVorschlag = popup.slice(popup.indexOf('function verkaufPreisEintrag('), popup.indexOf('function verkaufGewinnElement('));

// UTCurrencyInputControl.PRICE_TIERS wie in price-tiers.test.cjs.
const EA_TIERS = [
  { min: 100000, inc: 1000 },
  { min: 50000, inc: 500 },
  { min: 10000, inc: 250 },
  { min: 1000, inc: 100 },
  { min: 150, inc: 50 },
  { min: 0, inc: 150 }
];

const toInt = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.floor(n) : NaN; };
// Objekte aus einem vm-Kontext haben ein fremdes Object.prototype.
const plain = (o) => JSON.parse(JSON.stringify(o));

function motor(extra, mitEaLeiter) {
  const context = vm.createContext(Object.assign({ Array, Number, Object, Math, JSON, toInt }, extra || {}));
  vm.runInContext(stufen, context);
  if (mitEaLeiter) {
    context.roh = EA_TIERS;
    vm.runInContext('PRICE_TIERS = acceptPriceTiers(roh)', context);
  }
  return context;
}

function popupKontext(extra, mitEaLeiter) {
  const werte = Object.assign({ preisMethode: 'empfohlen', preisStufen: '0' }, (extra && extra.werte) || {});
  const context = vm.createContext(Object.assign({
    Array, Number, Object, Math, JSON, Date,
    fmt: (n) => String(n),
    $: (id) => (id in werte ? { value: werte[id], checked: false } : (id === 'deckelFst' ? { checked: false } : null))
  }, extra || {}));
  vm.runInContext(popupPreise, context);
  if (mitEaLeiter) {
    context.roh = EA_TIERS;
    vm.runInContext('priceTiers = roh', context);
  }
  return context;
}

const rechne = (c, w, min, max) => plain(vm.runInContext('einstellPreise(' + w + ', ' + min + ', ' + max + ')', c));

for (const [name, mitEa] of [['Rueckfall-Leiter', false], ['EA-Leiter', true]]) {
  test('einstellPreise (' + name + '): Sofortkauf eine Stufe ueber eaMin, Start eine darunter', () => {
    const c = motor(null, mitEa);
    assert.deepEqual(rechne(c, 200, 200, 10000), { sofort: 250, start: 200, grenze: 'min', fehler: '' }, 'Fund 25: 200/200 lehnte EA ab');
    assert.deepEqual(rechne(c, 150, 150, 0), { sofort: 200, start: 150, grenze: 'min', fehler: '' });
    assert.deepEqual(rechne(c, 1000, 0, 0), { sofort: 1000, start: 950, grenze: '', fehler: '' });
    assert.deepEqual(rechne(c, 1000, 1000, 0), { sofort: 1100, start: 1000, grenze: 'min', fehler: '' });
    assert.deepEqual(rechne(c, 1000, 950, 0), { sofort: 1000, start: 950, grenze: '', fehler: '' });
    assert.deepEqual(rechne(c, 1000, 1000, 1100), { sofort: 1100, start: 1000, grenze: 'min', fehler: '' }, 'passt genau in die Spanne');
  });

  test('einstellPreise (' + name + '): eaMin neben der Leiter zaehlt ab der naechsten Stufe', () => {
    const c = motor(null, mitEa);
    assert.deepEqual(rechne(c, 1000, 1020, 0), { sofort: 1200, start: 1100, grenze: 'min', fehler: '' });
    assert.deepEqual(rechne(c, 100, 149, 0), { sofort: 200, start: 150, grenze: 'min', fehler: '' }, 'unter 150 ist 150 die naechste Stufe');
  });

  test('einstellPreise (' + name + '): eaMax deckelt, zu enge Spanne und zu kleiner Preis sind Fehler', () => {
    const c = motor(null, mitEa);
    assert.deepEqual(rechne(c, 20000, 0, 15000), { sofort: 15000, start: 14750, grenze: 'max', fehler: '' });
    assert.equal(rechne(c, 5000, 1000, 1000).fehler, 'spanne');
    assert.equal(rechne(c, 1000, 1000, 1099).fehler, 'spanne', 'eine Stufe ueber eaMin liegt schon ueber eaMax');
    assert.equal(rechne(c, 5000, 1000, 1000).sofort, 0);
    const klein = rechne(c, 150, 0, 0);
    assert.equal(klein.fehler, 'start', 'unter 150 gibt es keine Stufe');
    assert.equal(klein.start, 0);
    assert.equal(rechne(c, 0, 0, 0).fehler, 'start');
  });

  test('einstellPreise (' + name + '): an Bandgrenzen liegt das Startgebot in der unteren Stufe', () => {
    const c = motor(null, mitEa);
    assert.equal(rechne(c, 10000, 0, 0).start, 9900);
    assert.equal(rechne(c, 50000, 0, 0).start, 49750);
    assert.equal(rechne(c, 100000, 0, 0).start, 99500);
  });
}

const RASTER_WUNSCH = [0, 150, 199, 200, 240, 250, 950, 999, 1000, 1001, 1049, 9999, 10000, 10100, 49999, 50000, 99999, 100000, 250000, 1000000];
const RASTER_MIN = [0, 150, 200, 950, 1000, 1020, 10000];
const RASTER_MAX = [0, 1000, 1100, 10000, 15000, 1000000];

test('einstellPreise: Start immer unter dem Sofortkauf, nie unter eaMin, beides auf der Leiter', () => {
  const c = motor();
  for (const w of RASTER_WUNSCH) for (const min of RASTER_MIN) for (const max of RASTER_MAX) {
    const r = rechne(c, w, min, max);
    if (r.fehler) continue;
    const fall = w + '/' + min + '/' + max;
    assert.ok(r.start < r.sofort, fall);
    assert.ok(r.start >= min, fall);
    assert.ok(!max || r.sofort <= max, fall);
    assert.equal(vm.runInContext('roundDownToStep(' + r.sofort + ')', c), r.sofort, fall);
    assert.equal(vm.runInContext('roundDownToStep(' + r.start + ')', c), r.start, fall);
    if (min) assert.ok(r.sofort > min, fall + ': mindestens eine Stufe ueber eaMin');
  }
});

test('einstellPreise steht in content.js und popup.js im gleichen Wortlaut', () => {
  const c = content.replace(/\r\n/g, '\n');
  const p = popup.replace(/\r\n/g, '\n');
  const cVon = c.indexOf('  function einstellPreise(');
  const pVon = p.indexOf('function einstellPreise(');
  assert.ok(cVon > 0 && pVon > 0);
  const cText = c.slice(cVon, c.indexOf('\n  }\n', cVon) + 4).split('\n').map((z) => (z.startsWith('  ') ? z.slice(2) : z)).join('\n');
  const pText = p.slice(pVon, p.indexOf('\n}\n', pVon) + 2);
  assert.equal(cText, pText);
});

test('einstellPreise: Motor und Popup rechnen im ganzen Raster dasselbe (beide Leitern)', () => {
  for (const mitEa of [false, true]) {
    const m = motor(null, mitEa);
    const p = popupKontext(null, mitEa);
    for (const w of RASTER_WUNSCH) for (const min of RASTER_MIN) for (const max of RASTER_MAX) {
      assert.deepEqual(rechne(p, w, min, max), rechne(m, w, min, max), w + '/' + min + '/' + max + (mitEa ? ' EA' : ''));
    }
  }
});

// --- gleichEinstellen ------------------------------------------------------

function einstellMotor(p) {
  const aufrufe = [];
  class HardStop extends Error {}
  const c = motor({
    VERKAUF: { laeuft: false },
    platzProblem: () => '',
    listPreisFuer: async () => Object.assign({ quelle: 'markt', alterMs: 0, eaMin: 0, eaMax: 0 }, p),
    plausiblePrice: (v) => (Number(v) > 0 ? Math.floor(Number(v)) : 0),
    seitenFrage: async () => null,
    log() {},
    fmt: (n) => String(n),
    CONFIG: { LIST_MIN_PRICE: 200, SALE_FEE: 0.05, LIST_STEP_MIN_MS: 0, LIST_STEP_MAX_MS: 0 },
    sleep: async () => {},
    randomBetween: () => 0,
    reserveUsage: async () => {},
    api: async (pfad, opt) => { aufrufe.push(JSON.parse(opt.body)); return { ok: true, status: 200 }; },
    ENDPOINTS: { listPath: '/ut/game/fc27/auctionhouse', listMethod: 'POST' },
    VERKAUF_DAUER_S: 3600,
    HardStop
  });
  vm.runInContext(einstellen, c);
  c.aufrufe = aufrufe;
  return c;
}

async function stelleEin(c, kaufPreis, grenzen) {
  c.kauf = kaufPreis;
  c.grenzen = grenzen || null;
  return plain(await vm.runInContext('gleichEinstellen("77", { key: "1:85" }, kauf, grenzen)', c));
}

test('gleichEinstellen: Fund 26 - ein Startgebot mit Verlust wird nicht eingestellt', async () => {
  const c = einstellMotor({ preis: 1000 });
  const r = await stelleEin(c, 949);
  assert.equal(r.ok, false);
  assert.match(r.grund, /Startgebot 950/);
  assert.match(r.grund, /902/);
  assert.equal(c.aufrufe.length, 0, 'keine Anfrage an EA');
});

test('gleichEinstellen: mit Gewinn auch zum Startgebot wird 950/1000 eingestellt', async () => {
  const c = einstellMotor({ preis: 1000 });
  const r = await stelleEin(c, 900);
  assert.equal(r.ok, true);
  assert.equal(c.aufrufe.length, 1);
  assert.equal(c.aufrufe[0].startingBid, 950);
  assert.equal(c.aufrufe[0].buyNowPrice, 1000);
});

test('gleichEinstellen: ein Startgebot zum Selbstkostenpreis ist erlaubt', async () => {
  const c = einstellMotor({ preis: 1000 });
  assert.equal((await stelleEin(c, 902)).ok, true, '950 x 0,95 = 902 - kein Verlust');
});

test('gleichEinstellen: 100k-Beispiel an der Bandgrenze', async () => {
  const c = einstellMotor({ preis: 100000 });
  const r = await stelleEin(c, 94999);
  assert.equal(r.ok, false, 'Start 99.500 bringt nur 94.525');
  assert.equal(c.aufrufe.length, 0);
  assert.equal((await stelleEin(c, 94525)).ok, true);
  assert.equal(c.aufrufe[0].startingBid, 99500);
});

test('gleichEinstellen: Preis auf EAs Minimum wird eine Stufe hoeher eingestellt statt abgelehnt', async () => {
  const c = einstellMotor({ preis: 200 });
  const r = await stelleEin(c, 150, { marketDataMinPrice: 200 });
  assert.equal(r.ok, true);
  assert.equal(r.sofort, 250);
  assert.equal(r.start, 200);
  assert.equal(c.aufrufe[0].startingBid, 200);
  assert.equal(c.aufrufe[0].buyNowPrice, 250, 'frueher 200/200 - das lehnte EA ab');
});

test('gleichEinstellen: zu enge EA-Spanne schickt gar nichts los', async () => {
  const c = einstellMotor({ preis: 1000 });
  const r = await stelleEin(c, 500, { marketDataMinPrice: 1000, marketDataMaxPrice: 1000 });
  assert.equal(r.ok, false);
  assert.match(r.grund, /Preisspanne/);
  assert.equal(c.aufrufe.length, 0);
});

test('gleichEinstellen: die bisherigen Meldungen bleiben', async () => {
  const klein = einstellMotor({ preis: 150 });
  assert.match((await stelleEin(klein, 50)).grund, /Verkaufspreis zu niedrig/);
  const ohneGewinn = einstellMotor({ preis: 1000 });
  assert.match((await stelleEin(ohneGewinn, 950)).grund, /^Kein Gewinn/);
  assert.equal(klein.aufrufe.length + ohneGewinn.aufrufe.length, 0);
});

test('gleichEinstellen: ein Preissprung aus listPreisFuer wird durchgereicht', async () => {
  const sprung = { vorher: 10000, markt: 6000, genommen: 'vorher' };
  const c = einstellMotor({ preis: 10000, sprung });
  const r = await stelleEin(c, 5000);
  assert.equal(r.ok, true);
  assert.deepEqual(r.sprung, sprung);
  const ohne = await stelleEin(einstellMotor({ preis: 10000 }), 5000);
  assert.equal(ohne.sprung, null);
});

// --- spielerEinstellen (Verkaufs-Helfer) -------------------------------------

function helferMotor(eintrag) {
  const aufrufe = [];
  const c = motor({
    verkaufSperre: () => '',
    str: (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : ''),
    verkaufStarten: (art, f) => { c.lauf = f(); return { ok: true }; },
    chrome: { storage: { local: { get: async () => ({ transferliste: { liste: [eintrag] } }) } } },
    verkaufAusfuehren: async (art, daten) => { aufrufe.push(daten); },
    updateStorage: async () => {},
    pushEvent() {},
    log() {},
    fmt: (n) => String(n),
    VERKAUF_DAUER_S: 3600
  });
  vm.runInContext(helfer, c);
  c.aufrufe = aufrufe;
  return c;
}

async function helferEinstellen(eintrag, sofortPreis) {
  const c = helferMotor(Object.assign({ itemId: '55', handelbar: true, tradeState: '', name: 'Test' }, eintrag));
  c.raw = { itemId: '55', sofortPreis };
  const antwort = vm.runInContext('spielerEinstellen(raw)', c);
  assert.equal(antwort.ok, true);
  let fehler = '';
  try {
    await c.lauf;
  } catch (e) {
    fehler = e.message;
  }
  return { fehler, aufrufe: c.aufrufe };
}

test('spielerEinstellen: Sofortkauf genau auf eaMin wird mit klarer Antwort abgelehnt (Fund 25)', async () => {
  const r = await helferEinstellen({ eaMin: 200, eaMax: 10000 }, 200);
  assert.match(r.fehler, /frühestens 250/);
  assert.equal(r.aufrufe.length, 0, 'keine Anfrage an EA');
});

test('spielerEinstellen: eine Stufe ueber eaMin geht mit Startgebot auf eaMin raus', async () => {
  const r = await helferEinstellen({ eaMin: 200, eaMax: 10000 }, 250);
  assert.equal(r.fehler, '');
  assert.equal(r.aufrufe.length, 1);
  assert.equal(r.aufrufe[0].startPreis, 200);
  assert.equal(r.aufrufe[0].sofortPreis, 250);
});

test('spielerEinstellen: ohne bekannte Spanne Start eine Stufe darunter', async () => {
  const r = await helferEinstellen({ eaMin: 0, eaMax: 0 }, 1000);
  assert.equal(r.aufrufe[0].startPreis, 950);
});

test('spielerEinstellen: ueber eaMax und zu enge Spanne kosten keine Anfrage', async () => {
  const hoch = await helferEinstellen({ eaMin: 200, eaMax: 15000 }, 20000);
  assert.match(hoch.fehler, /höchstens 15000/);
  assert.equal(hoch.aufrufe.length, 0);
  const eng = await helferEinstellen({ eaMin: 1000, eaMax: 1000 }, 1000);
  assert.match(eng.fehler, /Preisspanne/);
  assert.equal(eng.aufrufe.length, 0);
});

// --- Popup: Vorschlag im Verkaufs-Helfer ------------------------------------

function vorschlag(entry, item) {
  const c = popupKontext({
    history: { '100:85': [Object.assign({ t: Date.now() - 60000 }, entry)] },
    VERKAUF_PREIS_FRISCH_MS: 60 * 60 * 1000,
    SALE_FEE: 0.05
  });
  vm.runInContext(popupVorschlag, c);
  c.item = Object.assign({ assetId: 100, rating: 85, eaMin: 0, eaMax: 0, gekauftFuer: 0 }, item);
  return plain(vm.runInContext('verkaufVorschlag(item)', c));
}

test('verkaufVorschlag: der Knopf zeigt denselben Preis, den der Motor einstellt', () => {
  const amMinimum = vorschlag({ market: 200 }, { eaMin: 200 });
  assert.equal(amMinimum.preis, 250, 'frueher 200 - und EA lehnte ab');
  assert.equal(amMinimum.start, 200);
  assert.equal(amMinimum.einstellFehler, '');
  const ohne = vorschlag({ market: 1000 }, {});
  assert.equal(ohne.preis, 1000);
  assert.equal(ohne.start, 950);
});

test('verkaufVorschlag: zu enge EA-Spanne meldet einen Fehler statt eines Preises', () => {
  const eng = vorschlag({ market: 1000 }, { eaMin: 1000, eaMax: 1000 });
  assert.match(eng.einstellFehler, /Preisspanne/);
});
