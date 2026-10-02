const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const von = source.indexOf('  function noteResponseTime(');
const section = source.slice(von, source.indexOf('  function extensionAlive(', von));

const CONFIG = { SLOW_RESPONSE_MS: 8000, SLOW_STREAK: 3, HEALTH_WINDOW: 20, EMPTY_STREAK_WARN: 6, EMPTY_STREAK_MIN_HITS: 3 };

function setup() {
  const warnungen = [];
  const STATE = { health: { times: [], slowStreak: 0, slow: false, throttle: '' }, run: null };
  const context = vm.createContext({
    STATE, CONFIG, Math, Array, Number, Boolean,
    warn: (m) => warnungen.push(m),
    playerLabel: (t) => t.playerName
  });
  vm.runInContext(section, context);
  return { context, STATE, warnungen };
}

const zeit = (s, ms) => vm.runInContext('noteResponseTime(' + ms + ')', s.context);
const median = (s) => vm.runInContext('medianResponseTime()', s.context);
const leer = (s, progress, istLeer) => {
  s.context.p = progress;
  return vm.runInContext('noteEmptyResult(p,' + istLeer + ')', s.context);
};
const hinweis = (s, run) => { s.context.r = run || null; return vm.runInContext('throttleHint(r)', s.context); };

test('normale Antwortzeiten loesen nichts aus', () => {
  const s = setup();
  for (const ms of [420, 380, 510, 640, 300]) zeit(s, ms);
  assert.equal(s.STATE.health.slow, false);
  assert.equal(s.warnungen.length, 0);
  assert.equal(median(s), 420);
});

test('erst mehrere langsame Antworten hintereinander warnen', () => {
  const s = setup();
  zeit(s, 9000);
  zeit(s, 9500);
  assert.equal(s.STATE.health.slow, false, 'zwei reichen noch nicht');
  zeit(s, 12000);
  assert.equal(s.STATE.health.slow, true);
  assert.equal(s.warnungen.length, 1);
  assert.match(s.warnungen[0], /langsam/);
});

test('eine schnelle Antwort dazwischen setzt den Zaehler zurueck', () => {
  const s = setup();
  zeit(s, 9000);
  zeit(s, 9000);
  zeit(s, 400);
  zeit(s, 9000);
  assert.equal(s.STATE.health.slow, false, 'nur ununterbrochen langsame zaehlen');
});

test('gewarnt wird einmal, nicht bei jeder weiteren Antwort', () => {
  const s = setup();
  for (let i = 0; i < 10; i++) zeit(s, 9000);
  assert.equal(s.warnungen.length, 1);
});

test('nur die letzten Antwortzeiten werden behalten', () => {
  const s = setup();
  for (let i = 0; i < 50; i++) zeit(s, 100 + i);
  assert.equal(s.STATE.health.times.length, CONFIG.HEALTH_WINDOW);
});

test('leere Treffer allein sind kein Verdacht', () => {
  // Beim Sniping unter Marktpreis ist genau das der Normalfall.
  const s = setup();
  const p = {};
  for (let i = 0; i < 30; i++) {
    assert.equal(leer(s, p, true), false, 'Durchlauf ' + i);
  }
});

test('erst nach Treffern wird ein Ausbleiben verdaechtig', () => {
  const s = setup();
  const p = {};
  // Ein einzelner Treffer reicht bewusst nicht mehr: Erst regelmaessige
  // Treffer machen eine anschliessende Leer-Serie verdaechtig.
  for (let i = 0; i < CONFIG.EMPTY_STREAK_MIN_HITS; i++) leer(s, p, false);
  for (let i = 1; i < CONFIG.EMPTY_STREAK_WARN; i++) {
    assert.equal(leer(s, p, true), false, 'noch nicht bei ' + i);
  }
  assert.equal(leer(s, p, true), true, 'jetzt schlaegt es an');
});

test('ein Treffer dazwischen setzt den Verdacht zurueck', () => {
  const s = setup();
  const p = {};
  leer(s, p, false);
  for (let i = 0; i < 5; i++) leer(s, p, true);
  leer(s, p, false);
  assert.equal(p.emptyStreak, 0);
  assert.equal(leer(s, p, true), false);
});

test('der Hinweistext nennt den Grund', () => {
  const s = setup();
  assert.equal(hinweis(s, null), '', 'ohne Verdacht kein Text');

  for (let i = 0; i < 3; i++) zeit(s, 11000);
  assert.match(hinweis(s, null), /langsam/);

  const frisch = setup();
  assert.match(hinweis(frisch, { throttleTarget: 'Beispiel (84)' }), /Beispiel \(84\)/);
  assert.match(hinweis(frisch, { throttleTarget: 'Beispiel (84)' }), /leeren Ergebnissen/);
});

test('ohne Fortschrittseintrag passiert nichts', () => {
  const s = setup();
  assert.equal(leer(s, null, true), false);
});
