const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../markt.js');

const MIN = 60000;
// Verlauf bauen: Preise im 10-Minuten-Takt.
function verlauf(preise, start = 1_000_000_000_000) {
  let v = [];
  preise.forEach((p, i) => { v = M.verlaufEintragen(v, start + i * 10 * MIN, p, 20); });
  return v;
}

test('Gewinn rechnet die 5 % EA-Steuer ein', () => {
  assert.equal(M.gewinn(1000, 1100), 45); // 1045 - 1000
  assert.equal(M.gewinn(1000, 1000), -50);
});

test('gleicher Zeitslot: niedrigerer Preis gewinnt, kein neuer Punkt', () => {
  let v = M.verlaufEintragen([], 1000000, 500, 5);
  v = M.verlaufEintragen(v, 1000000 + MIN, 450, 9);
  assert.equal(v.length, 1);
  assert.deepEqual(v[0], [1000000, 450, 9]);
});

test('alte Punkte und Ueberlaenge fliegen raus', () => {
  const preise = Array.from({ length: 100 }, () => 1000);
  const v = verlauf(preise);
  assert.ok(v.length <= M.MAX_PUNKTE);
  assert.ok(v[v.length - 1][0] - v[0][0] <= M.MAX_ALTER_MS);
});

test('zu wenig Daten: keine Bewertung', () => {
  assert.equal(M.signale(verlauf([1000, 1000, 1000])), null);
  // genug Punkte, aber unter 1 Stunde Spanne
  const v = []; let x = v;
  for (let i = 0; i < 8; i++) x = M.verlaufEintragen(x, 1e12 + i * 3 * MIN * 1, 1000, 5);
  // 3-Minuten-Abstand faellt in denselben Slot -> zu wenige Punkte
  assert.equal(M.signale(x), null);
});

test('Dip mit Erholung wird erkannt', () => {
  const preise = [10000, 10100, 9900, 10000, 10050, 9950, 10000, 8800, 8900];
  const b = M.bewerte(M.signale(verlauf(preise)));
  assert.ok(b, 'sollte ein Treffer sein');
  assert.equal(b.art, 'dip');
  assert.equal(b.kauf, 8900);
  assert.ok(b.gewinn > 0);
});

test('fallender Preis ist kein Dip (Boden unklar)', () => {
  const preise = [10000, 10000, 10000, 10000, 9800, 9400, 9000, 8600, 8200];
  assert.equal(M.bewerte(M.signale(verlauf(preise))), null);
});

test('zu grosse Abweichung (Fehlpreis) wird verworfen', () => {
  const preise = [10000, 10000, 10000, 10000, 10000, 10000, 10000, 4000];
  assert.equal(M.bewerte(M.signale(verlauf(preise))), null);
});

test('Marge unter der Schwelle wird verworfen', () => {
  const preise = [1000, 1000, 1000, 1000, 1000, 1000, 1000, 960];
  assert.equal(M.bewerte(M.signale(verlauf(preise))), null);
});

test('unruhiger Markt wird verworfen', () => {
  const preise = [5000, 9000, 4000, 10000, 5000, 9500, 4500, 3000];
  assert.equal(M.bewerte(M.signale(verlauf(preise))), null);
});

test('steigende Nachfrage: Preis zieht an, Normalpreis noch hoeher', () => {
  const preise = [10000, 10000, 10000, 10000, 9700, 9800, 9900, 10300];
  // aktuell ueber Median -> kein Dip, Ziel (Median*0.97) < aktuell -> kein Gewinn
  assert.equal(M.bewerte(M.signale(verlauf(preise))), null);
});

test('Rangliste sortiert nach Score', () => {
  const klein = verlauf([5000, 5050, 4950, 5000, 5025, 4975, 5000, 4400, 4450]);
  const gross = verlauf([20000, 20200, 19800, 20000, 20100, 19900, 20000, 17600, 17800]);
  const r = M.rangliste({ klein, gross });
  assert.equal(r.length, 2);
  assert.equal(r[0].key, 'gross');
  assert.ok(r[0].score > r[1].score);
});

test('verlaufBegrenzen behaelt die frischesten Karten', () => {
  const alle = { a: [[1, 1, 1]], b: [[5, 1, 1]], c: [[3, 1, 1]] };
  const k = M.verlaufBegrenzen(alle, 2);
  assert.deepEqual(Object.keys(k).sort(), ['b', 'c']);
});
