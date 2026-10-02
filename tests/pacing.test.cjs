const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const section = source.slice(source.indexOf('  function randomBetween('), source.indexOf('  async function loop('));

const CONFIG = {
  SCAN_DELAY_MIN_MS: 2000,
  SCAN_DELAY_MAX_MS: 3400,
  SCAN_EXTRA_CHANCE: 0.35,
  SCAN_EXTRA_MIN_MS: 400,
  SCAN_EXTRA_MAX_MS: 1400
};

function setup(zufall) {
  const context = vm.createContext({ CONFIG, Math: zufall ? Object.assign(Object.create(Math), { random: zufall }) : Math });
  vm.runInContext(section, context);
  return context;
}

const scan = (c) => vm.runInContext('scanDelay()', c);
const plan = (c, preset) => vm.runInContext('breakPlan({ pausePreset: ' + JSON.stringify(preset) + ' })', c);

test('die Scan-Pause liegt immer im erlaubten Bereich', () => {
  const c = setup();
  const min = CONFIG.SCAN_DELAY_MIN_MS;
  const max = CONFIG.SCAN_DELAY_MAX_MS + CONFIG.SCAN_EXTRA_MAX_MS;
  for (let i = 0; i < 300; i++) {
    const ms = scan(c);
    assert.ok(ms >= min, ms + ' unter dem Minimum');
    assert.ok(ms <= max, ms + ' ueber dem Maximum');
  }
});

test('die Scan-Pause ist nicht mehr jedes Mal gleich', () => {
  const c = setup();
  const werte = new Set();
  for (let i = 0; i < 200; i++) werte.add(scan(c));
  assert.ok(werte.size > 50, 'bei festem Takt waere hier genau ein Wert: ' + werte.size);
});

test('der Durchschnitt bleibt in der Naehe der bisherigen 3 Sekunden', () => {
  const c = setup();
  let summe = 0;
  const n = 4000;
  for (let i = 0; i < n; i++) summe += scan(c);
  const schnitt = summe / n;
  assert.ok(schnitt > 2600 && schnitt < 3400, 'Durchschnitt ' + Math.round(schnitt) + ' ms');
});

test('ohne Aufschlag bleibt es bei der Grundpause', () => {
  // Math.random immer 0.9 -> ueber der Wahrscheinlichkeit von 0,35
  const c = setup(() => 0.9);
  const ms = scan(c);
  assert.ok(ms >= CONFIG.SCAN_DELAY_MIN_MS && ms <= CONFIG.SCAN_DELAY_MAX_MS, ms + '');
});

test('mit Aufschlag wird es laenger als die Grundpause allein', () => {
  const c = setup(() => 0); // immer Aufschlag, immer kleinster Zufallswert
  const ms = scan(c);
  assert.ok(ms >= CONFIG.SCAN_DELAY_MIN_MS + CONFIG.SCAN_EXTRA_MIN_MS, ms + '');
});

test('jedes Pausenprofil bekommt eine zweite, laengere Stufe', () => {
  const c = setup();
  for (const preset of ['short', 'medium', 'long']) {
    const p = plan(c, preset);
    assert.ok(p.every > 0, preset + ': Abstand fehlt');
    assert.ok(p.ms > 0, preset + ': Dauer fehlt');
    assert.ok(p.longEvery >= 3 && p.longEvery <= 5, preset + ': longEvery ' + p.longEvery);
    assert.ok(p.longMs > p.ms, preset + ': die lange Pause muss laenger sein');
  }
});

test('die lange Pause bleibt trotz eigener Streuung deutlich laenger', () => {
  const c = setup();
  for (let i = 0; i < 100; i++) {
    const p = plan(c, 'medium');
    // Die lange Pause wird selbst noch einmal um 30 Prozent gestreut. Aus
    // dem Grundfaktor 2,7 wird damit ein erlaubter Bereich 1,89 bis 3,51.
    const faktor = p.longMs / p.ms;
    assert.ok(faktor >= 1.88 && faktor <= 3.52, 'Faktor ' + faktor.toFixed(3));
  }
});

test('die Pausenplaene wiederholen sich nicht stur', () => {
  const c = setup();
  const werte = new Set();
  for (let i = 0; i < 100; i++) {
    const p = plan(c, 'medium');
    werte.add(p.every + ':' + p.ms + ':' + p.longEvery);
  }
  assert.ok(werte.size > 50, 'zu wenig Streuung: ' + werte.size);
});
