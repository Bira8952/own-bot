const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

// Der Teil von applyAutomationSettings, der den Auto-Scan plant.
const von = source.indexOf('    const autoVorher = STATE.autoFilters;');
const bis = source.indexOf('  }', von);
const teil = source.slice(von, bis);

function lauf(vorher, timer, settings) {
  const geplant = [];
  const STATE = { autoFilters: vorher };
  const fn = new Function('STATE', 'settings', 'autoScanTimer', 'scheduleAutoScan', 'CONFIG', teil);
  fn(STATE, settings, timer, (ms) => geplant.push(ms), { AUTO_SCAN_INTERVAL_MS: 420000 });
  return geplant;
}

test('Einschalten plant den ersten Scan in 3 Sekunden', () => {
  assert.deepEqual(lauf(false, null, { autoFilters: true }), [3000]);
});

test('Speichern bei schon laufendem Auto-Scan plant NICHT neu', () => {
  assert.deepEqual(lauf(true, 123, { autoFilters: true }), []);
});

test('an, aber ohne Zeitgeber (z. B. nach Neuladen): wird geplant', () => {
  assert.deepEqual(lauf(true, null, { autoFilters: true }), [3000]);
});

test('Ausschalten raeumt den Zeitgeber ab', () => {
  assert.deepEqual(lauf(true, 123, { autoFilters: false }), [420000]);
});
