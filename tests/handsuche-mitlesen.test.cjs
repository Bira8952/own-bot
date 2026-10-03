const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// ===========================================================================
// Eigene Suchen des Nutzers mitlesen (02.10.2026).
// Sucht der Nutzer selbst in der Web App, liest sniffer.js EAs Antwort mit und
// gibt sie als "marktsuche" an content.js. Dort landet sie in
// gedaechtnisMerken - 0 zusaetzliche EA-Anfragen. Geprueft werden die
// Weitergabe, das Saeubern und vor allem: Die eigenen Suchen des Bots duerfen
// NICHT ein zweites Mal als Handsuche zaehlen.
// ===========================================================================

const root = path.join(__dirname, '..');
const SNIFFER = fs.readFileSync(path.join(root, 'sniffer.js'), 'utf8');
const CONTENT = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
const M = require('../markt.js');

const BASE = 'https://utas.mob.v4.prd.futc-ext.gcp.ea.com/ut/game/fc27';
const PFAD = '/transfermarket?num=21&start=0&type=player&maskedDefId=100&maxb=9000';
const NUTZER_URL = BASE + PFAD;
const BOT_URL = BASE + '/transfermarket?num=20&start=0&type=player&maskedDefId=100';

// Objekte aus vm haben fremde Prototypen - fuer Vergleiche einmal durch JSON.
const j = (x) => JSON.parse(JSON.stringify(x));
const warte = () => new Promise((r) => setImmediate(r));

// ---------------------------------------------------------------------------
// Teil A: sniffer.js in einer nachgestellten Seite
// ---------------------------------------------------------------------------

// So schickt EA ein Angebot - mit allerlei Feldern, die uns nichts angehen.
function rohAngebot(id, ueber) {
  return Object.assign({
    tradeId: id, buyNowPrice: 5000 + id, startingBid: 150, currentBid: 0, expires: 1800,
    tradeState: 'active', bidState: 'none', sellerName: 'Fremder', offers: 0, watched: false,
    itemData: { id: 9000 + id, assetId: 100, resourceId: 50331748, rating: 85, itemType: 'player', rareflag: 3, lastSalePrice: 4000, contract: 7 }
  }, ueber || {});
}

function snifferSeite(optionen) {
  const o = optionen || {};
  const gesendet = [];
  const hoerer = [];
  const zaehler = { suche: 0, kauf: 0, cache: 0, fetch: 0, xhrOffen: 0 };
  const uhr = { jetzt: 1000000 };
  const bot = { xhr: null, cb: null };

  function XMLHttpRequest() {
    this.lauscher = [];
    this.status = 0;
    this.responseType = '';
    this.responseText = '';
    this.response = null;
  }
  XMLHttpRequest.prototype = {
    open() { zaehler.xhrOffen += 1; },
    setRequestHeader() {},
    addEventListener(art, fn) { if (art === 'load') this.lauscher.push(fn); }
  };

  const window = {
    location: { href: 'https://www.ea.com/de/ea-sports-fc/ultimate-team/web-app/', origin: 'https://www.ea.com' },
    addEventListener(art, fn) { if (art === 'message') hoerer.push(fn); },
    postMessage(m, ziel) { gesendet.push({ m, ziel }); },
    fetch() {
      zaehler.fetch += 1;
      return o.fetchAntwort ? o.fetchAntwort() : Promise.resolve({ status: 404, ok: false });
    },
    UTSearchCriteriaDTO: function UTSearchCriteriaDTO() {},
    services: {
      Item: {
        clearTransferMarketCache() { zaehler.cache += 1; },
        // Wie EAs App: die Suche oeffnet einen XHR auf /transfermarket.
        searchTransferMarket() {
          zaehler.suche += 1;
          if (o.sucheWirft) throw new Error('intern kaputt');
          const xhr = new XMLHttpRequest();
          xhr.open('GET', BOT_URL);
          bot.xhr = xhr;
          if (o.ohneObserve) return {};
          return { observe(_, cb) { bot.cb = cb; } };
        },
        bid() { zaehler.kauf += 1; }
      }
    }
  };
  window.window = window;

  const context = vm.createContext({
    window, XMLHttpRequest, URL,
    Headers: function Headers() { this.get = () => null; },
    Request: function Request() {},
    // sniffer.js nutzt nur Date.now() - so laesst sich die Uhr stellen.
    Date: { now: () => uhr.jetzt },
    setTimeout: () => {},
    console: { log() {}, warn() {} }
  });
  vm.runInContext(SNIFFER, context);

  const xhr = (methode, url, responseType) => {
    const x = new XMLHttpRequest();
    x.open(methode, url);
    if (responseType) x.responseType = responseType;
    return x;
  };
  const laden = (x, status, inhalt) => {
    x.status = status;
    if (x.responseType === 'json') x.response = inhalt;
    else x.responseText = inhalt;
    for (const fn of x.lauscher) fn.call(x, { type: 'load' });
  };
  const senden = (data) => { for (const fn of hoerer) fn({ source: window, data }); };
  const meldungen = (art) => gesendet.filter((g) => g.m && g.m.__ownbot === art);
  const nutzerSucht = (liste) => laden(xhr('GET', NUTZER_URL), 200, JSON.stringify({ auctionInfo: liste || [rohAngebot(1)] }));
  const appSuche = () => senden({ __ownbot: 'appSuche?', requestId: 1, kriterien: { typ: 'player', maskedDefId: 100, start: 0, seite: 1, anzahl: 20 } });
  return { xhr, laden, senden, meldungen, nutzerSucht, appSuche, zaehler, uhr, bot, window };
}

test('A1 eine eigene Marktsuche des Nutzers geht an content.js', () => {
  const s = snifferSeite();
  s.nutzerSucht([rohAngebot(1), rohAngebot(2)]);
  const m = s.meldungen('marktsuche');
  assert.equal(m.length, 1, 'genau eine Meldung');
  assert.equal(m[0].m.base, BASE);
  assert.equal(m[0].m.pfad, PFAD, 'der Suchpfad geht mit - ohne ihn keine Verkaufserkennung');
  assert.equal(m[0].ziel, 'https://www.ea.com', 'nie an "*" posten');
  assert.equal(m[0].m.auctionInfo.length, 2);
  assert.equal(m[0].m.auctionInfo[0].buyNowPrice, 5001);
});

test('A2 Fremdfelder fallen weg, rareflag 0 bleibt 0, fehlendes rareflag bleibt weg', () => {
  const s = snifferSeite();
  const liste = [
    rohAngebot(1, { rechne() { return 1; } }),
    rohAngebot(2, { itemData: { id: 9002, assetId: 100, rating: 85, itemType: 'player', rareflag: 0 } }),
    rohAngebot(3, { itemData: { id: 9003, assetId: 100, rating: 85, itemType: 'player' } }),
    rohAngebot(4, { itemData: undefined }),
    rohAngebot(5, { tradeId: 'abc' })
  ];
  // responseType "json": So kommt auch die Funktion bis zum Sniffer durch.
  const x = s.xhr('GET', NUTZER_URL, 'json');
  s.laden(x, 200, { auctionInfo: liste });
  const [m] = s.meldungen('marktsuche');
  const a = j(m.m.auctionInfo);
  assert.equal(a.length, 3, 'ohne itemData und mit tradeId "abc" faellt das Angebot raus');
  assert.deepEqual(Object.keys(a[0]).sort(), ['bidState', 'buyNowPrice', 'currentBid', 'expires', 'itemData', 'startingBid', 'tradeId', 'tradeState']);
  assert.deepEqual(Object.keys(a[0].itemData).sort(), ['assetId', 'id', 'itemType', 'rareflag', 'rating', 'resourceId']);
  assert.equal(a[0].tradeId, '1', 'tradeId kommt als Text an');
  assert.equal(a[0].itemData.id, '9001');
  assert.equal(a[1].itemData.rareflag, 0, '0 ist "Common" und bleibt');
  assert.equal('rareflag' in a[2].itemData, false, 'fehlt das Feld, darf daraus keine 0 werden');

  const s2 = snifferSeite();
  s2.nutzerSucht(Array.from({ length: 60 }, (_, i) => rohAngebot(i + 1)));
  assert.equal(s2.meldungen('marktsuche')[0].m.auctionInfo.length, 50, 'hoechstens 50 Angebote');
});

test('A3 bei responseType "json" bleibt das Objekt der App unveraendert', () => {
  const s = snifferSeite();
  const tiefFrieren = (o) => { for (const v of Object.values(o)) if (v && typeof v === 'object') tiefFrieren(v); return Object.freeze(o); };
  const antwort = tiefFrieren({ auctionInfo: [rohAngebot(1), rohAngebot(2)] });
  const vorher = JSON.stringify(antwort);
  const x = s.xhr('GET', NUTZER_URL, 'json');
  s.laden(x, 200, antwort);
  // sniffer.js laeuft "use strict": Jeder Schreibversuch auf das eingefrorene
  // Objekt wuerde werfen, und dann kaeme keine Meldung.
  const m = s.meldungen('marktsuche');
  assert.equal(m.length, 1);
  assert.equal(m[0].m.pfad, PFAD);
  assert.equal(m[0].m.auctionInfo.length, 2);
  assert.equal(JSON.stringify(antwort), vorher);
});

test('A4 keine Weitergabe bei Fehlern, anderen Methoden, anderen Pfaden und Unsinn', () => {
  const inhalt = JSON.stringify({ auctionInfo: [rohAngebot(1)] });
  const faelle = [
    ['GET', NUTZER_URL, 404, inhalt],
    ['GET', NUTZER_URL, 500, inhalt],
    ['POST', NUTZER_URL, 200, inhalt],
    ['PUT', NUTZER_URL, 200, inhalt],
    ['GET', BASE + '/tradepile', 200, inhalt],
    ['GET', BASE + '/watchlist', 200, inhalt],
    ['GET', BASE + '/usermassinfo', 200, inhalt],
    ['GET', NUTZER_URL, 200, JSON.stringify({ auctionInfo: [rohAngebot(1)], polster: 'x'.repeat(520 * 1024) })],
    ['GET', NUTZER_URL, 200, '{"auctionInfo": [kaputt'],
    ['GET', NUTZER_URL, 200, JSON.stringify({ auctionInfo: { 0: rohAngebot(1) } })],
    ['GET', 'https://boese.example/ut/game/fc27/transfermarket?num=21&type=player', 200, inhalt]
  ];
  for (const [methode, url, status, text] of faelle) {
    const s = snifferSeite();
    assert.doesNotThrow(() => s.laden(s.xhr(methode, url), status, text));
    assert.equal(s.meldungen('marktsuche').length, 0, methode + ' ' + url.slice(-30) + ' ' + status);
  }
  // Bei "arraybuffer" wird gar nicht erst gelesen.
  const s = snifferSeite();
  const x = s.xhr('GET', NUTZER_URL, 'arraybuffer');
  s.laden(x, 200, {});
  assert.equal(s.meldungen('marktsuche').length, 0);
});

test('A5 die App-Suche des Bots kommt nicht als Handsuche zurueck', () => {
  const s = snifferSeite();
  s.appSuche();
  assert.equal(s.zaehler.suche, 1, 'der Bot hat ueber die App gesucht');
  s.laden(s.bot.xhr, 200, JSON.stringify({ auctionInfo: [rohAngebot(1)] }));
  assert.equal(s.meldungen('marktsuche').length, 0, 'die eigene Suche zaehlt nicht doppelt');
  s.bot.cb(null, { success: true, data: { items: [] } });
  const antwort = s.meldungen('appAntwort');
  assert.equal(antwort.length, 1);
  assert.equal(antwort[0].m.requestId, 1);
  assert.equal(antwort[0].m.ok, true);
  // Danach ist die Sperre wieder frei.
  s.nutzerSucht();
  assert.equal(s.meldungen('marktsuche').length, 1);
});

test('A6 auch wenn EAs Rueckruf VOR unserem load-Hoerer kommt', () => {
  const s = snifferSeite();
  s.appSuche();
  s.bot.cb(null, { success: true, data: { items: [] } });
  // Erst jetzt laedt der Bot-XHR - markiert wurde er schon beim Oeffnen.
  s.laden(s.bot.xhr, 200, JSON.stringify({ auctionInfo: [rohAngebot(1)] }));
  assert.equal(s.meldungen('marktsuche').length, 0);
  s.nutzerSucht();
  assert.equal(s.meldungen('marktsuche').length, 1);
});

test('A7 die Fehlerwege geben die Sperre wieder frei', () => {
  for (const optionen of [{ sucheWirft: true }, { ohneObserve: true }]) {
    const s = snifferSeite(optionen);
    s.appSuche();
    const antwort = s.meldungen('appAntwort');
    assert.equal(antwort.length, 1);
    assert.equal(antwort[0].m.ok, false);
    s.nutzerSucht();
    assert.equal(s.meldungen('marktsuche').length, 1, JSON.stringify(optionen));
  }
});

test('A8 Notbremse: ohne Rueckruf haengt die Sperre hoechstens 30 s', () => {
  const s = snifferSeite();
  s.appSuche(); // observe ruft nie zurueck
  s.uhr.jetzt += 10000;
  s.nutzerSucht();
  assert.equal(s.meldungen('marktsuche').length, 0, 'nach 10 s gilt noch die Bot-Suche');
  s.uhr.jetzt += 21000;
  s.nutzerSucht();
  assert.equal(s.meldungen('marktsuche').length, 1, 'nach 31 s wieder frei');
});

test('A9 das Mitlesen stellt keine einzige EA-Anfrage', () => {
  const s = snifferSeite();
  s.nutzerSucht([rohAngebot(1), rohAngebot(2)]);
  s.laden(s.xhr('GET', NUTZER_URL, 'json'), 200, { auctionInfo: [rohAngebot(3)] });
  assert.equal(s.meldungen('marktsuche').length, 2);
  assert.deepEqual(s.zaehler, { suche: 0, kauf: 0, cache: 0, fetch: 0, xhrOffen: 2 }, 'nur die zwei XHRs des Nutzers selbst');
});

test('A10 fetch-Weg zur Absicherung, nicht waehrend einer Bot-Suche, nicht bei POST', async () => {
  const inhalt = JSON.stringify({ auctionInfo: [rohAngebot(1)] });
  const fetchAntwort = () => Promise.resolve({ status: 200, ok: true, clone() { return { text: async () => inhalt }; } });

  const s = snifferSeite({ fetchAntwort });
  await s.window.fetch(NUTZER_URL);
  await warte();
  const m = s.meldungen('marktsuche');
  assert.equal(m.length, 1);
  assert.equal(m[0].m.pfad, PFAD);

  await s.window.fetch(NUTZER_URL, { method: 'POST', body: '{}' });
  await warte();
  assert.equal(s.meldungen('marktsuche').length, 1, 'POST zaehlt nicht');

  s.appSuche();
  await s.window.fetch(NUTZER_URL);
  await warte();
  assert.equal(s.meldungen('marktsuche').length, 1, 'waehrend der Bot-Suche nicht');
});

// ---------------------------------------------------------------------------
// Teil B: content.js nimmt die Meldung an - oder verwirft sie
// ---------------------------------------------------------------------------

const BLOCK = CONTENT.slice(CONTENT.indexOf('  // --- Eigene Suchen des Nutzers mitlesen'), CONTENT.indexOf('  // Verkaufserkennung (02.10.2026). Die Regel'));
const API_RE_ZEILE = (() => {
  const von = CONTENT.indexOf('  const API_RE =');
  return CONTENT.slice(von, CONTENT.indexOf('\n', von));
})();
const ENDPOINTS = {
  searchPath: '/transfermarket', idParam: 'maskedDefId', maxBuyParam: 'maxb', minBuyParam: 'minb', maxBidParam: 'macr',
  ovrMinParam: 'ovrMin', ovrMaxParam: 'ovrMax', rarityParam: 'rarityIds', levelParam: 'lev', positionParam: 'pos',
  nationParam: 'nat', leagueParam: 'leag', playStyleParam: 'playStyle', clubParam: 'club'
};
const toInt = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.floor(n) : NaN; };
const str = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

// So kommt ein Angebot von sniffer.js (schon gesaeubert).
const angebot = (id, preis, ueber) => Object.assign({
  tradeId: String(id), buyNowPrice: preis, startingBid: 150, currentBid: 0, expires: 1800, tradeState: 'active', bidState: 'none',
  itemData: { id: String(9000 + id), assetId: 100, resourceId: 50331748, rating: 85, itemType: 'player', rareflag: 3 }
}, ueber || {});
const meldung = (pfad, liste, base) => ({
  __ownbot: 'marktsuche', base: base || BASE, pfad: pfad || PFAD, auctionInfo: liste || [angebot(1, 5000), angebot(2, 5300)]
});

function inhaltSeite() {
  const uhr = { jetzt: 5000000 };
  const gemerkt = [];
  const zaehler = { sichern: 0, timer: [], logs: 0 };
  const context = vm.createContext({
    ENDPOINTS: Object.assign({}, ENDPOINTS), CONFIG: { PAGE_SIZE: 21 },
    SESSION: { sid: 'sitzung-1234', base: BASE }, EIGENE_ADRESSEN: [],
    toInt, str, extensionAlive: () => true, log: () => { zaehler.logs += 1; },
    gedaechtnisMerken: (a, p) => gemerkt.push({ a: j(a), p }),
    gedaechtnisVielleichtSichern: () => { zaehler.sichern += 1; },
    GEDAECHTNIS_SICHERN_MS: 60000,
    window: { location: { origin: 'https://www.ea.com' } },
    setTimeout: (fn, ms) => { zaehler.timer.push({ fn, ms }); return zaehler.timer.length; },
    clearTimeout: () => {},
    Date: { now: () => uhr.jetzt },
    URLSearchParams,
    // Wer hier eine Anfrage stellt, faellt sofort auf.
    fetch: () => { throw new Error('keine EA-Anfrage erlaubt'); }
  });
  vm.runInContext(API_RE_ZEILE, context);
  vm.runInContext(BLOCK, context);
  const uebernehmen = (m, herkunft) => {
    context.__m = m;
    context.__h = herkunft === undefined ? 'https://www.ea.com' : herkunft;
    vm.runInContext('handsucheUebernehmen(__m, __h)', context);
  };
  const hs = () => j(vm.runInContext('HANDSUCHE', context));
  return { context, uhr, gemerkt, zaehler, uebernehmen, hs };
}

test('B1 eine gueltige Meldung landet genau einmal in gedaechtnisMerken - mit Pfad', () => {
  const c = inhaltSeite();
  c.uebernehmen(meldung());
  assert.equal(c.gemerkt.length, 1);
  assert.equal(c.gemerkt[0].p, PFAD, 'mit Pfad kann die Verkaufserkennung arbeiten');
  assert.deepEqual(c.gemerkt[0].a, [angebot(1, 5000), angebot(2, 5300)]);
  const hs = c.hs();
  assert.equal(hs.suchen, 1);
  assert.equal(hs.angebote, 2);
  assert.equal(hs.verworfen, 0);
  assert.equal(hs.ohneErkennung, 0);
  assert.equal(c.zaehler.logs, 1, 'einmal ins Protokoll');
  // Ohne Bot-Lauf schreibt sonst niemand den Puffer.
  assert.equal(c.zaehler.timer.length, 1);
  assert.equal(c.zaehler.timer[0].ms, 61000);
  c.zaehler.timer[0].fn();
  assert.equal(c.zaehler.sichern, 1);
});

test('B2 unbekannte Felder, falsche Seitengroesse, doppelte Felder: Preise ja, Verkaeufe nein', () => {
  const faelle = [
    [PFAD + '&pos=3', /Feld pos/],
    [PFAD + '&zone=x', /Feld zone/],
    [PFAD + '&micr=500', /Feld micr/],
    [PFAD + '&macr=5000', /Feld macr/],
    [PFAD.replace('num=21', 'num=20'), /num/],
    [PFAD + '&maxb=8000', /doppelt/]
  ];
  for (const [pfad, grund] of faelle) {
    const c = inhaltSeite();
    c.uebernehmen(meldung(pfad));
    assert.equal(c.gemerkt.length, 1, 'die Preise zaehlen trotzdem: ' + pfad);
    assert.equal(c.gemerkt[0].p, null, 'aber ohne Verkaufserkennung: ' + pfad);
    assert.equal(c.hs().ohneErkennung, 1);
    assert.match(c.hs().grund, grund);
  }
  // Erlaubte Felder ergeben den Pfad.
  const c = inhaltSeite();
  const voll = PFAD + '&minb=500&rarityIds=3&ovrMin=85&ovrMax=85';
  c.uebernehmen(meldung(voll));
  assert.equal(c.gemerkt[0].p, voll);
});

test('B2 dieselbe Adresse innerhalb von 60 s gibt keine Verkaufserkennung', () => {
  const c = inhaltSeite();
  c.uebernehmen(meldung());
  c.uhr.jetzt += 10000;
  c.uebernehmen(meldung());
  c.uhr.jetzt += 61000;
  c.uebernehmen(meldung());
  assert.deepEqual(c.gemerkt.map((g) => g.p), [PFAD, null, PFAD]);
  assert.equal(c.hs().ohneErkennung, 1);
  assert.match(c.hs().grund, /dieselbe Suche/);
});

test('B3 verworfen: Herkunft, Adresse, Sitzung, Pfad, Suchart, Liste', () => {
  const faelle = [
    ['falsche Herkunft', meldung(), 'https://boese.example'],
    ['ohne Herkunft', meldung(), ''],
    ['base kein EA-Host', meldung(null, null, 'https://boese.example.com/ut/game/fc27')],
    ['base mit Zusatz', meldung(null, null, BASE + '/mehr')],
    ['andere Sitzung', meldung(null, null, 'https://utas.anders.ea.com/ut/game/fc27')],
    ['anderer Pfad', meldung('/tradepile?x=1')],
    ['keine Spielersuche', meldung(PFAD.replace('type=player', 'type=training'))],
    ['Liste kein Array', Object.assign(meldung(), { auctionInfo: { 0: angebot(1, 5000) } })],
    ['nur ungueltige Angebote', meldung(null, [angebot(1, 0)])],
    ['keine Daten', null]
  ];
  for (const [name, m, herkunft] of faelle) {
    const c = inhaltSeite();
    c.uebernehmen(m, herkunft);
    assert.equal(c.gemerkt.length, 0, name);
    assert.equal(c.hs().verworfen, 1, name);
    assert.ok(c.hs().grund, 'mit Grund: ' + name);
  }
});

test('B3 hoechstens 30 Meldungen pro Minute, leere Antworten zaehlen extra', () => {
  const c = inhaltSeite();
  for (let i = 0; i < 31; i += 1) c.uebernehmen(meldung(PFAD.replace('maxb=9000', 'maxb=' + (9000 + i * 100))));
  assert.equal(c.gemerkt.length, 30);
  assert.equal(c.hs().verworfen, 1, 'die 31. wird verworfen');
  c.uhr.jetzt += 61000;
  c.uebernehmen(meldung());
  assert.equal(c.gemerkt.length, 31, 'nach einer Minute wieder frei');

  // Eine leere Antwort kann EAs Drossel sein - daraus darf kein Verkauf werden.
  const leer = inhaltSeite();
  leer.uebernehmen(meldung(null, []));
  assert.equal(leer.gemerkt.length, 0);
  assert.equal(leer.hs().leer, 1);
  assert.equal(leer.hs().verworfen, 0);
});

test('B4 content.js saeubert selbst noch einmal', () => {
  const c = inhaltSeite();
  const liste = [
    angebot(1, 5000, { itemData: { id: '9001', assetId: 100, rating: 85, itemType: 'player', rareflag: '3' } }),
    angebot(2, 0),
    angebot(3, 20000000),
    angebot(4, 5000.5),
    angebot(5, 5000, { itemData: { id: '9005', assetId: 100, rating: 85, itemType: 'training' } }),
    angebot(6, 5000, { tradeState: 'x'.repeat(40), sellerName: 'Fremder' }),
    angebot(7, 5000, { tradeId: 7 })
  ];
  c.uebernehmen(meldung(null, liste));
  const a = c.gemerkt[0].a;
  assert.deepEqual(a.map((x) => x.tradeId), ['1', '6']);
  assert.equal('rareflag' in a[0].itemData, false, 'rareflag als Text faellt weg');
  assert.equal(a[1].tradeState.length, 16, 'Texte werden gekuerzt');
  assert.equal('sellerName' in a[1], false);

  const viele = inhaltSeite();
  viele.uebernehmen(meldung(null, Array.from({ length: 60 }, (_, i) => angebot(i + 1, 5000))));
  assert.equal(viele.gemerkt[0].a.length, 50);
});

test('B5 zweite Sicherung: die App-Suche des Bots wird vorgemerkt', () => {
  const c = inhaltSeite();
  const fertig = vm.runInContext('handsucheBotVormerken({ typ: "appSuche?", daten: { kriterien: { maskedDefId: 100 } } })', c.context);
  c.uebernehmen(meldung());
  assert.equal(c.gemerkt.length, 0, 'derselbe Spieler waehrend der Bot-Suche');
  assert.match(c.hs().grund, /App-Suche des Bots/);
  c.uebernehmen(meldung(PFAD.replace('maskedDefId=100', 'maskedDefId=200')));
  assert.equal(c.gemerkt.length, 1, 'ein anderer Spieler zaehlt');
  fertig();
  c.uhr.jetzt += 2000;
  c.uebernehmen(meldung());
  assert.equal(c.gemerkt.length, 1, '2 s nach dem Ende noch gesperrt');
  c.uhr.jetzt += 2000;
  c.uebernehmen(meldung());
  assert.equal(c.gemerkt.length, 2, 'nach 4 s wieder frei');

  // Kauf und Einstellen fragen nicht den Markt ab - nichts vormerken.
  const k = inhaltSeite();
  vm.runInContext('handsucheBotVormerken({ typ: "appKauf?", daten: { tradeId: "1", betrag: 500 } })', k.context);
  assert.equal(k.hs().bot.length, 0);
  k.uebernehmen(meldung());
  assert.equal(k.gemerkt.length, 1);

  // Notbremse: Kommt das Ende nie, sperrt die Vormerkung hoechstens 30 s.
  const n = inhaltSeite();
  vm.runInContext('handsucheBotVormerken({ typ: "appSuche?", daten: { kriterien: { maskedDefId: 100 } } })', n.context);
  n.uhr.jetzt += 31000;
  n.uebernehmen(meldung());
  assert.equal(n.gemerkt.length, 1);
});

test('B6 direkter Weg: eigene Suchadressen des Bots werden verworfen', () => {
  const c = inhaltSeite();
  vm.runInContext('EIGENE_ADRESSEN.push(' + JSON.stringify(BASE + PFAD) + ')', c.context);
  c.uebernehmen(meldung());
  assert.equal(c.gemerkt.length, 0);
  assert.equal(c.hs().grund, 'eigene Suche des Bots');
});

test('B7 der Hoerer prueft die Herkunft, appAnfrage merkt vor und gibt danach frei', () => {
  const hoerer = CONTENT.slice(CONTENT.indexOf('  // Meldungen von sniffer.js.'), CONTENT.indexOf('  window.postMessage({ __ownbot: "session?" }'));
  assert.match(hoerer, /data\.__ownbot === "marktsuche"\) \{\s*handsucheUebernehmen\(data, event\.origin\);/);
  const von = CONTENT.indexOf('  async function appAnfrage(weg)');
  const anfrage = CONTENT.slice(von, CONTENT.indexOf('  async function api(path, options)', von));
  assert.match(anfrage, /const vormerkung = handsucheBotVormerken\(weg\);/);
  assert.ok(anfrage.indexOf('vormerkung();') > anfrage.indexOf('await seitenFrage('), 'erst nach der Antwort freigeben');
  // Kein stiller Verlust: Der Status sagt, was mit den Handsuchen passiert.
  assert.match(CONTENT, /handsuche: \{\s*suchen: HANDSUCHE\.suchen/);
});

// ---------------------------------------------------------------------------
// Teil C: echtes Gedaechtnis und echte Verkaufserkennung
// ---------------------------------------------------------------------------

const GEDAECHTNIS_TEIL = CONTENT.slice(CONTENT.indexOf('  // --- Preis-Gedaechtnis'), CONTENT.indexOf('  function gedaechtnisVielleichtSichern('));

function integration() {
  const uhr = { jetzt: 1700000000000 };
  const context = vm.createContext({
    FC27Markt: M, URLSearchParams, DAY: 86400000,
    ENDPOINTS: Object.assign({}, ENDPOINTS), CONFIG: { PAGE_SIZE: 21 },
    SCAN_FILTER_FELDER: [['rarity', 'rarityParam'], ['level', 'levelParam'], ['position', 'positionParam'], ['nation', 'nationParam'], ['league', 'leagueParam'], ['playStyle', 'playStyleParam'], ['club', 'clubParam']],
    SESSION: { sid: 'sitzung-1234', base: BASE }, EIGENE_ADRESSEN: [],
    toInt, str, extensionAlive: () => true, log: () => {},
    priceKey: (id, rating, art) => id + ':' + rating + (art >= 0 ? ':' + art : ''),
    basePlayerId: (item) => Number(item.assetId) % 1048576,
    volleSeite: () => 21,
    angebotsAlterS: () => null,
    gedaechtnisVielleichtSichern: () => {},
    updateStorage: () => Promise.resolve(),
    window: { location: { origin: 'https://www.ea.com' } },
    setTimeout: () => 0, clearTimeout: () => {},
    Date: { now: () => uhr.jetzt },
    fetch: () => { throw new Error('keine EA-Anfrage erlaubt'); }
  });
  vm.runInContext(API_RE_ZEILE, context);
  vm.runInContext(GEDAECHTNIS_TEIL, context);
  const uebernehmen = (m) => {
    context.__m = m;
    vm.runInContext('handsucheUebernehmen(__m, "https://www.ea.com")', context);
  };
  const lies = (code) => j(vm.runInContext(code, context));
  return { context, uhr, uebernehmen, lies };
}

test('C0 der Block liegt zwischen gedaechtnisMerken und der Verkaufserkennung', () => {
  assert.ok(GEDAECHTNIS_TEIL.includes('function gedaechtnisMerken('));
  assert.ok(GEDAECHTNIS_TEIL.includes('function handsucheUebernehmen('));
  assert.ok(GEDAECHTNIS_TEIL.includes('function verkaeufeErkennen('));
  const verkauf = CONTENT.slice(CONTENT.indexOf('  // Verkaufserkennung (02.10.2026). Die Regel'), CONTENT.indexOf('  function gedaechtnisVielleichtSichern('));
  assert.equal(verkauf.includes('HANDSUCHE'), false, 'der Ausschnitt von verkauf-erkennung.test.cjs bleibt unberuehrt');
});

test('C1 eine Handsuche fuellt Preis-Gedaechtnis und Verkaufs-Beobachtung', () => {
  const t = integration();
  t.uebernehmen(meldung());
  const e = t.lies('GEDAECHTNIS.puffer.get("100:85:3")');
  assert.equal(e.n, 2, 'zwei Angebote derselben Karte');
  assert.equal(e.min, 5000);
  assert.equal(t.lies('VERKAUF_TRACKER.beobachtet.size'), 2);
});

test('C2 die Bot-Suche und ihre Antwort zaehlen nur einmal', () => {
  const t = integration();
  const liste = [angebot(1, 5000)];
  const botPfad = '/transfermarket?num=21&start=0&type=player&maskedDefId=100&maxb=9100';
  t.context.__liste = liste;
  t.context.__botPfad = botPfad;
  // So wie api() nach appAnfrage: Vormerkung laeuft, der Bot merkt sich die Liste.
  vm.runInContext('__fertig = handsucheBotVormerken({ typ: "appSuche?", daten: { kriterien: { maskedDefId: 100 } } }); gedaechtnisMerken(__liste, __botPfad);', t.context);
  t.uebernehmen(meldung(null, liste));
  vm.runInContext('__fertig()', t.context);
  t.uebernehmen(meldung(null, liste));
  assert.equal(t.lies('GEDAECHTNIS.puffer.get("100:85:3")').n, 1, 'dieselbe Antwort darf nicht doppelt zaehlen');
  // Spaeter, ausserhalb des Fensters: eine echte zweite Beobachtung.
  t.uhr.jetzt += 4000;
  t.uebernehmen(meldung(null, liste));
  assert.equal(t.lies('GEDAECHTNIS.puffer.get("100:85:3")').n, 2);
});

test('C3 Verkaufserkennung aus zwei vollstaendigen Handsuchen', () => {
  const t = integration();
  t.uebernehmen(meldung(PFAD + '&minb=200', [angebot(1, 5000), angebot(2, 5300)]));
  t.uhr.jetzt += 5000;
  t.uebernehmen(meldung(PFAD + '&minb=250', [angebot(2, 5300)]));
  assert.equal(t.lies('VERKAUF_TRACKER.erkannt'), 1, 'Angebot 1 fehlt vor seinem Ablauf: verkauft');

  // Mit einem Feld, das man dem Angebot nicht ansieht, wird nichts abgeleitet.
  const u = integration();
  u.uebernehmen(meldung(PFAD + '&minb=200', [angebot(1, 5000), angebot(2, 5300)]));
  u.uhr.jetzt += 5000;
  u.uebernehmen(meldung(PFAD + '&minb=250&pos=3', [angebot(2, 5300)]));
  assert.equal(u.lies('VERKAUF_TRACKER.erkannt'), 0);
});

// ---------------------------------------------------------------------------
// Teil D: der ganze content.js - Hoerer, Status und keine Anfrage
// ---------------------------------------------------------------------------

function ganzerContent() {
  const hoerer = { nachricht: [], befehl: [] };
  const anfragen = [];
  const speicher = {};
  const window = {
    location: { origin: 'https://www.ea.com', href: 'https://www.ea.com/x' },
    addEventListener(art, fn) { if (art === 'message') hoerer.nachricht.push(fn); },
    postMessage() {}
  };
  window.window = window;
  const context = vm.createContext({
    window, globalThis: {},
    // markt.js laeuft in der Erweiterung als eigenes Skript davor.
    FC27Markt: M,
    document: { addEventListener() {}, body: null },
    console: { log() {}, warn() {}, error() {} },
    setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); if (t.unref) t.unref(); return t; },
    setInterval: (fn, ms) => { const t = setInterval(fn, ms); if (t.unref) t.unref(); return t; },
    clearTimeout, clearInterval,
    URL, URLSearchParams, AbortController,
    chrome: {
      runtime: { id: 'labor', onMessage: { addListener: (fn) => hoerer.befehl.push(fn) }, sendMessage: async () => ({}) },
      storage: {
        local: {
          get: async (keys) => {
            const liste = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys || {});
            const out = {};
            for (const k of liste) if (k in speicher) out[k] = j(speicher[k]);
            return out;
          },
          set: async (obj) => { Object.assign(speicher, j(obj)); }
        },
        onChanged: { addListener() {} }
      }
    },
    fetch: async (url) => { anfragen.push(String(url)); return { ok: false, status: 404, json: async () => ({}) }; }
  });
  vm.runInContext(CONTENT, context);
  const nachricht = (data, origin) => { for (const fn of hoerer.nachricht) fn({ source: window, origin, data }); };
  const status = () => new Promise((resolve) => {
    for (const fn of hoerer.befehl) fn({ cmd: 'v11/status' }, { id: 'labor' }, (a) => resolve(a && a.status));
  });
  return { nachricht, status, anfragen, speicher };
}

test('D1 der ganze content.js nimmt die Meldung an und fragt EA dabei nichts', async () => {
  const c = ganzerContent();
  c.nachricht({ __ownbot: 'session', sid: 'labor-sitzung-1234', base: BASE }, 'https://www.ea.com');
  c.nachricht(meldung(), 'https://www.ea.com');
  c.nachricht(meldung(), undefined); // ohne Herkunft: verworfen
  const st = await c.status();
  assert.equal(st.handsuche.suchen, 1);
  assert.equal(st.handsuche.angebote, 2);
  assert.equal(st.handsuche.verworfen, 1);
  assert.equal(st.handsuche.grund, 'fremde Herkunft');
  assert.equal(st.verkaeufe.beobachtet, 2);
  // Die erste Sicherung geht sofort raus (die letzte liegt laenger als eine
  // Minute zurueck) - beide Angebote derselben Karte stehen im Speicher.
  for (let i = 0; i < 20 && !c.speicher.preisGedaechtnis; i += 1) await warte();
  assert.equal(c.speicher.preisGedaechtnis.karten['100:85:3'].n, 2);
  assert.deepEqual(c.anfragen, [], 'keine einzige Anfrage');
});
