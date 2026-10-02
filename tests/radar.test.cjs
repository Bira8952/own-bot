const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../markt.js');

const JETZT = 1_800_000_000_000;
const MIN = 60000;
const angebot = (tradeId, preis, restMin, extra) => Object.assign({ tradeId, key: '100:85:3', playerId: 100, rarity: 3, rating: 85, preis, endetAt: JETZT + restMin * MIN }, extra);
const anfrage = (extra) => Object.assign({ playerId: 100, rarities: [3], ovrMin: 85, ovrMax: 85, minb: 0, maxb: 10000, start: 0, vollstaendig: true }, extra);

test('ein vor dem Ablauf verschwundenes Angebot ist ein Verkauf', () => {
  const b = new Map();
  M.verkaeufeAbgleichen(b, anfrage(), [angebot(1, 5000, 40), angebot(2, 5200, 50)], JETZT);
  assert.equal(b.size, 2);
  const v = M.verkaeufeAbgleichen(b, anfrage(), [angebot(2, 5200, 49)], JETZT + MIN);
  assert.deepEqual(v, [{ key: '100:85:3', preis: 5000, t: JETZT + MIN }]);
  assert.ok(!b.has('1'));
});

test('abgelaufene Angebote sind kein Verkauf', () => {
  const b = new Map();
  M.verkaeufeAbgleichen(b, anfrage(), [angebot(1, 5000, 2)], JETZT);
  const v = M.verkaeufeAbgleichen(b, anfrage(), [], JETZT + 2 * MIN);
  assert.equal(v.length, 0);
  assert.equal(b.size, 0);
});

test('volle Seite, andere Seite oder ohne Spieler belegt nichts', () => {
  for (const a of [anfrage({ vollstaendig: false }), anfrage({ start: 21 }), anfrage({ playerId: 0 }), anfrage({ maxb: 0 })]) {
    const b = new Map();
    M.verkaeufeAbgleichen(b, anfrage(), [angebot(1, 5000, 40)], JETZT);
    assert.equal(M.verkaeufeAbgleichen(b, a, [], JETZT + MIN).length, 0, JSON.stringify(a));
    assert.ok(b.has('1'), 'bleibt beobachtet');
  }
});

test('ausserhalb des Preisfensters, andere Kartenart oder anderes Rating belegt nichts', () => {
  const faelle = [
    [angebot(1, 12000, 40), anfrage()], // teurer als maxb
    [angebot(1, 400, 40), anfrage({ minb: 500 })], // billiger als minb
    [angebot(1, 5000, 40, { rarity: 12 }), anfrage()], // andere Kartenart
    [angebot(1, 5000, 40, { rating: 86 }), anfrage()], // anderes Rating
    [angebot(1, 5000, 40, { playerId: 200 }), anfrage()] // anderer Spieler
  ];
  for (const [x, a] of faelle) {
    const b = new Map();
    M.verkaeufeAbgleichen(b, a, [x], JETZT);
    assert.equal(M.verkaeufeAbgleichen(b, a, [], JETZT + MIN).length, 0, JSON.stringify(x));
  }
});

test('ohne Kartenart- und Rating-Filter zaehlt jede Version', () => {
  const b = new Map();
  const a = anfrage({ rarities: null, ovrMin: 0, ovrMax: 0 });
  M.verkaeufeAbgleichen(b, a, [angebot(1, 5000, 40, { rarity: 12, rating: 90 })], JETZT);
  assert.equal(M.verkaeufeAbgleichen(b, a, [], JETZT + MIN).length, 1);
});

test('der Speicher der Beobachtungen bleibt begrenzt', () => {
  const b = new Map();
  const viele = Array.from({ length: M.BEOBACHTET_MAX + 50 }, (_, i) => angebot(i, 1000 + i, 30));
  M.verkaeufeAbgleichen(b, null, viele, JETZT);
  assert.equal(b.size, M.BEOBACHTET_MAX);
  assert.ok(!b.has('0'), 'die aeltesten fliegen zuerst');
});

test('verkaeufeEintragen: alte raus, neue rein, je Karte begrenzt', () => {
  const alt = { a: [[JETZT - 25 * 60 * MIN, 100], [JETZT - MIN, 110]] };
  const neu = M.verkaeufeEintragen(alt, [{ key: 'a', preis: 120, t: JETZT }, { key: 'b', preis: 50, t: JETZT }], JETZT);
  assert.deepEqual(neu.a, [[JETZT - MIN, 110], [JETZT, 120]]);
  assert.deepEqual(neu.b, [[JETZT, 50]]);
  const voll = M.verkaeufeEintragen({}, Array.from({ length: 250 }, (_, i) => ({ key: 'c', preis: i + 1, t: JETZT })), JETZT);
  assert.equal(voll.c.length, 200);
});

const verlauf = (preise, abstandMin = 10) => preise.map((p, i) => [JETZT - (preise.length - 1 - i) * abstandMin * MIN, p, 20]);

test('radarKarte: ueblicher Preis, Abweichung, Aenderung zur letzten Stunde, Verkaeufe', () => {
  const k = M.radarKarte(verlauf([10000, 10000, 10000, 10000, 10000, 10000, 9000]), [[JETZT - 30 * MIN, 9500], [JETZT - 90 * MIN, 9800], [JETZT - 5 * 60 * MIN, 1]], JETZT);
  assert.equal(k.aktuell, 9000);
  assert.equal(k.ueblich, 10000);
  assert.ok(Math.abs(k.abweichung + 0.1) < 1e-9);
  assert.ok(Math.abs(k.aenderung + 0.1) < 1e-9);
  assert.equal(k.verkaeufe, 2, 'nur die letzten 3 Stunden zaehlen');
  assert.equal(k.verkaufsPreis, 9650);
});

test('radar sortiert die vier Ranglisten richtig', () => {
  const alle = {
    billig: verlauf([10000, 10000, 10000, 10000, 8500]),
    steigt: verlauf([5000, 5000, 5000, 5000, 5000, 5000, 5600]),
    faellt: verlauf([8000, 8000, 8000, 8000, 8000, 8000, 6000]),
    ruhig: verlauf([3000, 3000, 3000, 3000, 3000]),
    alt: verlauf([10000, 10000, 10000, 10000, 5000]).map(([t, p, n]) => [t - 3 * 60 * MIN, p, n])
  };
  const verk = { steigt: [[JETZT - 10 * MIN, 5500], [JETZT - 20 * MIN, 5400]], ruhig: [[JETZT - 10 * MIN, 3000]] };
  const r = M.radar(alle, verk, JETZT);
  assert.deepEqual(r.guenstig.map((k) => k.key), ['faellt', 'billig'], 'sortiert nach Abstand zum ueblichen Preis');
  assert.ok(!r.guenstig.some((k) => k.key === 'alt'), 'alte Messungen zaehlen nicht');
  assert.equal(r.steigend[0].key, 'steigt');
  assert.equal(r.fallend[0].key, 'faellt');
  assert.deepEqual(r.bestseller.map((k) => k.key), ['steigt', 'ruhig']);
  assert.ok(!r.steigend.some((k) => k.key === 'ruhig'));
});

test('snipePlan laesst nach 5 % Gebuehr mindestens 3 % und 150 Coins Gewinn', () => {
  for (const ueblich of [1000, 5000, 20000, 150000]) {
    const p = M.snipePlan({ ueblich, aktuell: ueblich, verkaufsPreis: 0 });
    assert.ok(p, String(ueblich));
    assert.equal(p.ziel, Math.floor(ueblich * 0.97));
    assert.ok(p.gewinn >= 150, ueblich + ': ' + p.gewinn);
    assert.ok(p.gewinn / p.kaufBis >= 0.0299, ueblich + ': Marge');
  }
  assert.equal(M.snipePlan({ ueblich: 0, verkaufsPreis: 0, aktuell: 100 }), null);
  const billiger = M.snipePlan({ ueblich: 10000, verkaufsPreis: 9000, aktuell: 9000 });
  assert.equal(billiger.ziel, Math.floor(9000 * 0.97), 'der niedrigere echte Verkaufspreis gilt');
  const nieTeurer = M.snipePlan({ ueblich: 20000, verkaufsPreis: 0, aktuell: 12000 });
  assert.equal(nieTeurer.kaufBis, 12000, 'nie ueber dem Preis von jetzt');
});
