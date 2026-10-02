const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

const defaults = source.slice(source.indexOf('  const ENDPOINT_DEFAULTS = {'), source.indexOf('  const CONFIG = {'));
const rules = source.slice(source.indexOf('  const ENDPOINT_RULES = {'), source.indexOf('  function priceKey('));
const pfade = source.slice(source.indexOf('  function searchPath('), source.indexOf('  function basePlayerId('));

function setup() {
  const warnungen = [];
  const context = vm.createContext({
    Object, Array, String, Number, Math, RegExp,
    URLSearchParams,
    CONFIG: { PAGE_SIZE: 21, SCAN_MIN_PRICE_SHARE: 0.15, SCAN_MIN_PRICE_FROM: 10000 },
    warn: (m) => warnungen.push(m),
    toInt: (v) => { const n = Number(v); return Number.isFinite(n) ? Math.floor(n) : NaN; },
    randomBetween: (a, b) => b,
    roundDownToStep: (p) => Math.floor(p / 100) * 100
  });
  vm.runInContext(defaults + rules + pfade, context);
  return { context, warnungen };
}

// Arrays aus dem vm haben eigene Prototypen - vor dem Vergleich umwandeln.
const uebernehmen = (s, werte) => {
  s.context.werte = werte;
  return Array.from(vm.runInContext('applyEndpoints(werte)', s.context));
};
const geaendert = (s) => Array.from(vm.runInContext('endpointsChanged()', s.context));
const aktiv = (s) => vm.runInContext('JSON.parse(JSON.stringify(ENDPOINTS))', Object.assign(s.context, { JSON }));
const suchpfad = (s, ...a) => vm.runInContext('searchPath(' + a.map((x) => JSON.stringify(x)).join(',') + ')', s.context);
const gebotspfad = (s, id) => vm.runInContext('bidPathFor(' + JSON.stringify(id) + ')', s.context);

test('ohne Einstellung gelten die Standardwerte', () => {
  const s = setup();
  uebernehmen(s, undefined);
  const e = aktiv(s);
  assert.equal(e.searchPath, '/transfermarket');
  assert.equal(e.idParam, 'maskedDefId');
  assert.equal(e.bidPath, '/trade/{id}/bid');
  assert.equal(geaendert(s).length, 0);
});

test('gueltige eigene Werte werden uebernommen', () => {
  const s = setup();
  const abgelehnt = uebernehmen(s, { searchPath: '/market', maxBuyParam: 'maxbin', bidPath: '/auction/{id}/offer' });
  assert.deepEqual(abgelehnt, []);
  const e = aktiv(s);
  assert.equal(e.searchPath, '/market');
  assert.equal(e.maxBuyParam, 'maxbin');
  assert.equal(suchpfad(s, 1, 500, 0, false).startsWith('/market?'), true);
  assert.equal(gebotspfad(s, 42), '/auction/42/offer');
});

test('ein Gebotspfad ohne {id} wird abgelehnt', () => {
  // Sonst zeigten alle Kaeufe auf dieselbe Auktion - der gefaehrlichste Fall.
  const s = setup();
  const abgelehnt = uebernehmen(s, { bidPath: '/trade/bid' });
  assert.equal(abgelehnt.length, 1);
  assert.equal(aktiv(s).bidPath, '/trade/{id}/bid');
});

test('Pfade ohne fuehrenden Schraegstrich werden abgelehnt', () => {
  const s = setup();
  uebernehmen(s, { searchPath: 'transfermarket', clubPath: 'item' });
  const e = aktiv(s);
  assert.equal(e.searchPath, '/transfermarket');
  assert.equal(e.clubPath, '/item');
});

test('eine fremde Adresse kommt nicht durch', () => {
  // Der wichtigste Fall: Die Session-ID darf nirgendwo anders hin.
  const s = setup();
  for (const boese of ['https://boese.example/klau', '//boese.example', '/../../x', '/pfad?x=1&y=2']) {
    uebernehmen(s, { searchPath: boese });
    assert.equal(aktiv(s).searchPath, '/transfermarket', 'durchgelassen: ' + boese);
  }
});

test('Parameternamen mit Sonderzeichen werden abgelehnt', () => {
  const s = setup();
  uebernehmen(s, { idParam: 'id&evil=1', maxBuyParam: 'a b', minBuyParam: '' });
  const e = aktiv(s);
  assert.equal(e.idParam, 'maskedDefId');
  assert.equal(e.maxBuyParam, 'maxb');
  assert.equal(e.minBuyParam, 'minb', 'leer heisst Standard, nicht Fehler');
});

test('nur echte HTTP-Methoden sind erlaubt', () => {
  const s = setup();
  uebernehmen(s, { bidMethod: 'PATCH', clubMethod: 'put' });
  const e = aktiv(s);
  assert.equal(e.bidMethod, 'PUT');
  assert.equal(e.clubMethod, 'PUT', 'Kleinschreibung zaehlt nicht');
  uebernehmen(s, { bidMethod: 'POST' });
  assert.equal(aktiv(s).bidMethod, 'POST');
});

test('verworfene Werte werden gemeldet, nicht verschwiegen', () => {
  const s = setup();
  uebernehmen(s, { searchPath: 'kaputt', idParam: 'auch kaputt' });
  assert.equal(s.warnungen.length, 1);
  assert.match(s.warnungen[0], /verworfen/i);
  assert.match(s.warnungen[0], /searchPath/);
});

test('der Gebotsmodus benutzt seinen eigenen Parameter', () => {
  const s = setup();
  uebernehmen(s, { maxBidParam: 'maxcurr' });
  assert.match(suchpfad(s, 7, 900, 0, true), /maxcurr=900/);
  assert.match(suchpfad(s, 7, 900, 0, false), /maxb=900/);
});

test('ein Rating wird als Bereich an EA mitgegeben', () => {
  const s = setup();
  uebernehmen(s, {});
  const mit = suchpfad(s, 7, 900, 0, false, 84);
  assert.match(mit, /ovrMin=84/);
  assert.match(mit, /ovrMax=84/);
});

test('ohne Rating bleibt die Adresse unveraendert', () => {
  const s = setup();
  uebernehmen(s, {});
  for (const kein of [0, null, undefined, '', 'alle']) {
    const p = suchpfad(s, 7, 900, 0, false, kein);
    assert.equal(p.includes('ovrMin'), false, 'Rating ' + JSON.stringify(kein));
  }
});

test('unsinnige Ratings kommen nicht in die Adresse', () => {
  const s = setup();
  uebernehmen(s, {});
  for (const kaputt of [-5, 0, 100, 1000]) {
    assert.equal(suchpfad(s, 7, 900, 0, false, kaputt).includes('ovrMin'), false, 'Rating ' + kaputt);
  }
});

test('eigene Namen fuer den Rating-Bereich werden benutzt', () => {
  const s = setup();
  uebernehmen(s, { ovrMinParam: 'ratingFrom', ovrMaxParam: 'ratingTo' });
  const p = suchpfad(s, 7, 900, 0, false, 84);
  assert.match(p, /ratingFrom=84/);
  assert.match(p, /ratingTo=84/);
  assert.equal(p.includes('ovrMin='), false);
});

test('eine Auktionsnummer wird im Pfad richtig kodiert', () => {
  const s = setup();
  assert.equal(gebotspfad(s, '12/34'), '/trade/12%2F34/bid');
});

test('endpointsChanged nennt genau die abweichenden Felder', () => {
  const s = setup();
  uebernehmen(s, { searchPath: '/market', bidMethod: 'POST' });
  assert.deepEqual(geaendert(s).sort(), ['bidMethod', 'searchPath']);
});

test('ein zweiter Aufruf mit leeren Werten stellt den Standard wieder her', () => {
  const s = setup();
  uebernehmen(s, { searchPath: '/market' });
  assert.equal(aktiv(s).searchPath, '/market');
  uebernehmen(s, {});
  assert.equal(aktiv(s).searchPath, '/transfermarket', 'Zuruecksetzen muss wirken');
});
