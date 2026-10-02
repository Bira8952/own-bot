const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../markt.js');

const MIN = 60000;
const T0 = 1_000_000_000_000;
const verlauf = (preise) => preise.map((p, i) => [T0 + i * 10 * MIN, p, 20]);
const ruhig = [10000, 10100, 9900, 10000, 10050, 9950, 10000];
const JETZT_SPAET = T0 + 24 * 60 * MIN;

test('ein Dip, der sich zum Ziel erholt, ist ein Treffer mit Dauer', () => {
  const r = M.backtest(verlauf([...ruhig, 8800, 8900, 9500, 9800, 10000]), JETZT_SPAET);
  assert.equal(r.signale, 1);
  assert.equal(r.treffer, 1);
  assert.equal(r.offen, 0);
  assert.equal(r.dauern.length, 1);
  assert.ok(r.dauern[0] > 0 && r.dauern[0] <= 120);
});

test('ein Dip ohne Erholung in 2 Stunden ist ein Fehlschlag und zaehlt nur einmal', () => {
  const lang = Array.from({ length: 14 }, () => 8800);
  const r = M.backtest(verlauf([...ruhig, ...lang]), JETZT_SPAET);
  assert.equal(r.signale, 1);
  assert.equal(r.treffer, 0);
});

test('ein Signal, dessen Fenster noch laeuft, ist offen und zaehlt nicht', () => {
  const v = verlauf([...ruhig, 8800, 8900]);
  const r = M.backtest(v, v[v.length - 1][0] + 5 * MIN);
  assert.equal(r.signale, 0);
  assert.equal(r.offen, 1);
});

test('backtestAlle rechnet Quote und mittlere Dauer', () => {
  const alle = {
    gut: verlauf([...ruhig, 8800, 8900, 9500, 9800, 10000]),
    schlecht: verlauf([...ruhig, ...Array.from({ length: 14 }, () => 8800)]),
    flach: verlauf(ruhig)
  };
  const r = M.backtestAlle(alle, JETZT_SPAET);
  assert.equal(r.gesamt.signale, 2);
  assert.equal(r.gesamt.treffer, 1);
  assert.equal(r.gesamt.quote, 0.5);
  assert.ok(r.gesamt.dauerMin > 0);
  assert.deepEqual(Object.keys(r.jeKarte).sort(), ['gut', 'schlecht']);
});

test('die eigene Quote einer Karte verschiebt ihren Platz in der Rangliste', () => {
  const v = verlauf([...ruhig, 10000, 8800, 8900]);
  const jetzt = v[v.length - 1][0];
  const ohne = M.rangliste({ a: v }, { jetzt })[0];
  const gut = M.rangliste({ a: v }, { jetzt, quoten: { a: { signale: 4, treffer: 4 } } })[0];
  const schlecht = M.rangliste({ a: v }, { jetzt, quoten: { a: { signale: 4, treffer: 0 } } })[0];
  assert.ok(gut.score > ohne.score);
  assert.ok(schlecht.score < ohne.score);
  assert.deepEqual(gut.quote, { signale: 4, treffer: 4 });
  const wenig = M.rangliste({ a: v }, { jetzt, quoten: { a: { signale: 1, treffer: 0 } } })[0];
  assert.equal(wenig.score, ohne.score, 'ein einzelnes frueheres Signal sagt noch nichts');
});
