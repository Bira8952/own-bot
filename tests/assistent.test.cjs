const { test } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../assistent.js');

const JETZT = 1_800_000_000_000;
const basis = (extra) => Object.assign({ verbunden: true, session: true, jetzt: JETZT, ziele: 0, daten: { karten: 0, reif: 0, fortschritt: 0 } }, extra);
const ids = (z) => A.lage(z).map((h) => h.id);
const erster = (z) => A.lage(z)[0];

test('ohne Verbindung gibt es genau einen Hinweis mit passender Hilfe', () => {
  const inSeite = A.lage({ verbunden: false });
  assert.equal(inSeite.length, 1);
  assert.equal(inSeite[0].aktionen[0].id, 'neuladen');
  const fenster = A.lage({ verbunden: false, imEigenenFenster: true });
  assert.equal(fenster[0].aktionen[0].id, 'webapp');
});

test('EA-Codes werden in Alltagssprache uebersetzt', () => {
  assert.equal(A.codeAus('Gestoppt: EA meldet zu viele Anfragen (HTTP 429).'), 429);
  assert.equal(A.codeAus('EA verlangt eine Verifizierung (Captcha).'), 458);
  assert.equal(A.codeAus('Ziel ist voll (DESTINATION_FULL).'), 473);
  assert.equal(A.codeAus('Preis 1.200 Coins'), 0, 'Coin-Betraege sind keine Fehlercodes');
  assert.match(A.klartext('HTTP 458').text, /Captcha/);
  assert.equal(A.klartext('HTTP 473').aktion, 'kaeufe');
});

test('unbekannte Meldung bleibt woertlich stehen statt geraten zu werden', () => {
  assert.equal(A.klartext('Alle Spieler gekauft.').text, 'Alle Spieler gekauft.');
  assert.equal(A.klartext('Alle Spieler gekauft.').code, 0);
});

test('Pause nach EA-Warnung steht ganz oben', () => {
  const h = erster(basis({ cooldownMin: 42.2, cooldownGrund: 'EA meldet zu viele Anfragen (HTTP 429).' }));
  assert.equal(h.id, 'pause');
  assert.equal(h.ton, 'stopp');
  assert.match(h.titel, /43 Min/);
  assert.match(h.text, /Pause/);
});

test('waehrend der Pause wird der Stopp-Grund nicht doppelt erklaert', () => {
  const z = basis({ cooldownMin: 10, cooldownGrund: 'HTTP 429', letzterStopp: { level: 'error', message: 'HTTP 429', t: JETZT - 1000 } });
  assert.ok(!ids(z).includes('stopp-grund'));
});

test('laufender Bot mit sehr vielen Suchen bekommt eine Risiko-Warnung vor dem Laufbericht', () => {
  const z = basis({ laeuft: true, ohneGrenzen: true, suchenStunde: 420, gekauft: 2, ausgegeben: 18000 });
  const liste = ids(z);
  assert.ok(liste.indexOf('risiko') < liste.indexOf('laeuft'));
  assert.equal(A.lage(z)[0].aktionen[0].id, 'stopp');
});

test('streng (mit Grenzen) gibt es keine Risiko-Warnung fuer Suchen', () => {
  assert.ok(!ids(basis({ laeuft: true, ohneGrenzen: false, suchenStunde: 420 })).includes('risiko'));
});

test('volle Transferliste stoppt, fast volle warnt', () => {
  assert.equal(erster(basis({ transfer: 100 })).id, 'transfer-voll');
  assert.equal(erster(basis({ transfer: 93 })).id, 'transfer-fast');
  assert.ok(!ids(basis({ transfer: 50 })).some((id) => id.startsWith('transfer')));
});

test('Stopp-Grund wird nur eine halbe Stunde gezeigt', () => {
  const frisch = basis({ letzterStopp: { level: 'error', message: 'HTTP 473', t: JETZT - 5 * 60000 } });
  const h = A.lage(frisch).find((x) => x.id === 'stopp-grund');
  assert.ok(h);
  assert.equal(h.aktionen[0].id, 'kaeufe');
  const alt = basis({ letzterStopp: { level: 'error', message: 'HTTP 473', t: JETZT - 31 * 60000 } });
  assert.ok(!ids(alt).includes('stopp-grund'));
});

test('zu wenig Coins fuer das guenstigste Ziel', () => {
  const h = A.lage(basis({ coins: 3000, ziele: 2, billigstesZiel: 4500 })).find((x) => x.id === 'coins');
  assert.ok(h);
  assert.match(h.text, /3\.000/);
  assert.match(h.text, /4\.500/);
});

test('Chancen werden mit der besten Karte angekuendigt', () => {
  const z = basis({ chancen: [{ name: 'Musiala', kaufBis: 8900, ziel: 9700, gewinn: 315 }], daten: { karten: 40, reif: 12 } });
  const h = A.lage(z).find((x) => x.id === 'chancen');
  assert.match(h.text, /Musiala/);
  assert.match(h.text, /8\.900/);
  assert.equal(h.aktionen[0].id, 'chancen');
  assert.ok(!ids(z).includes('lernen'), 'mit Chancen ist das Lernen kein Thema mehr');
});

test('ohne Daten erklaert der Assistent das Lernen und bietet einen Scan an', () => {
  const h = A.lage(basis({ daten: { karten: 7, reif: 0, fortschritt: 0.5 } })).find((x) => x.id === 'lernen');
  assert.ok(h);
  assert.equal(h.fortschritt, 0.5);
  assert.equal(h.aktionen[0].id, 'scan');
});

test('mit Zielen und ohne Hindernis: bereit zum Start', () => {
  assert.ok(ids(basis({ ziele: 3, daten: { reif: 5 } })).includes('bereit'));
  assert.ok(!ids(basis({ ziele: 3, transfer: 100 })).includes('bereit'), 'bei einem Stopp-Grund nicht "bereit" sagen');
});

test('jeder Hinweis hat Titel, Text und einen gueltigen Ton', () => {
  const z = basis({ laeuft: true, ohneGrenzen: true, suchenStunde: 500, transfer: 95, nichtZugewiesen: 6, fremderBot: true, andererTab: true, coins: 10, ziele: 1, billigstesZiel: 100 });
  for (const h of A.lage(z)) {
    assert.ok(h.titel && h.text, h.id);
    assert.ok(['stopp', 'achtung', 'gut', 'info'].includes(h.ton), h.id);
    for (const a of h.aktionen) assert.ok(a.id && a.label, h.id);
  }
});

test('zahl formatiert deutsch', () => {
  assert.equal(A.zahl(1234567), '1.234.567');
  assert.equal(A.zahl(-1500), '-1.500');
  assert.equal(A.zahl(999), '999');
});

test('waehrend einer EA-Pause oder ohne Sitzung wird kein Markt-Scan angeboten', () => {
  const knoepfe = (z) => A.lage(z).flatMap((h) => h.aktionen.map((a) => a.id));
  assert.ok(knoepfe(basis({})).includes('scan'), 'normal darf gescannt werden');
  assert.ok(!knoepfe(basis({ cooldownMin: 30, cooldownGrund: 'HTTP 458' })).includes('scan'));
  assert.ok(!knoepfe(basis({ session: false })).includes('scan'));
  assert.ok(!knoepfe(basis({ laeuft: true })).includes('scan'));
});

test('ohne Chancen, aber mit Bestsellern nennt der Assistent die gefragteste Karte', () => {
  const z = basis({ bestseller: [{ name: 'Salah', verkaeufe: 12, verkaufsPreis: 31000 }], daten: { reif: 3 } });
  const h = A.lage(z).find((x) => x.id === 'bestseller');
  assert.ok(h);
  assert.match(h.text, /12-mal/);
  assert.match(h.text, /31\.000/);
  assert.equal(h.aktionen[0].id, 'bestseller');
  const mitChance = basis({ bestseller: [{ name: 'Salah', verkaeufe: 12 }], chancen: [{ name: 'X', kaufBis: 1, ziel: 2, gewinn: 3 }] });
  assert.ok(!A.lage(mitChance).some((x) => x.id === 'bestseller'), 'Chancen gehen vor');
});
