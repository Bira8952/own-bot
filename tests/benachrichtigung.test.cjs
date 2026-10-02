const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const quelle = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

// ===========================================================================
// Chrome-Meldungen aus background.js (02.10.2026).
//
// Endet ein Lauf wegen einer EA-Warnung (content.js WARNUNG_CODES), schickt
// content.js die Meldung mit dringend: true. Die bleibt stehen, bis man sie
// wegklickt (requireInteraction), und ist nie stumm. Alle anderen Meldungen
// (jeder Kauf, ein normales Lauf-Ende) bleiben genau wie bisher.
// ===========================================================================

function setup(settings) {
  const erstellt = [];
  const hoerer = [];
  const context = vm.createContext({
    String, Promise, setTimeout,
    chrome: {
      runtime: { id: 'ext', onMessage: { addListener: (fn) => hoerer.push(fn) }, reload() {}, getURL: (p) => p },
      storage: { local: { get: async () => ({ settings }) } },
      notifications: { create: (o) => erstellt.push(o) },
      action: { onClicked: { addListener() {} } },
      tabs: {}
    }
  });
  vm.runInContext(quelle, context);
  const melden = async (m) => {
    for (const fn of hoerer) fn(Object.assign({ type: 'notify', title: 'T', message: 'x' }, m), { id: 'ext', tab: { id: 1 } }, () => {});
    await new Promise((r) => setImmediate(r));
  };
  return { erstellt, melden };
}

test('dringende Meldung bleibt stehen und klingelt, die normale wie bisher', async () => {
  const s = setup({ tonEnde: true });
  await s.melden({ ton: 'ende', dringend: true });
  await s.melden({ ton: 'ende' });
  assert.equal(s.erstellt.length, 2);
  assert.equal(s.erstellt[0].requireInteraction, true);
  // Nie stumm - auch wenn der Bot selbst einen Ton spielt (Rueckfall, falls
  // Chrome den Ton der Seite blockiert).
  assert.equal(s.erstellt[0].silent, false);
  assert.equal(s.erstellt[0].priority, 2);
  assert.equal('requireInteraction' in s.erstellt[1], false);
  assert.equal(s.erstellt[1].silent, true);
  assert.equal(s.erstellt[1].priority, 1);
});

test('Kaufmeldung ohne Ton-Haken: unveraendert, verschwindet von selbst', async () => {
  const s = setup({});
  await s.melden({ ton: 'kauf' });
  assert.equal(s.erstellt.length, 1);
  assert.deepEqual(Object.keys(s.erstellt[0]).sort(), ['iconUrl', 'message', 'priority', 'silent', 'title', 'type']);
  assert.equal(s.erstellt[0].silent, false);
  assert.equal(s.erstellt[0].priority, 1);
});

test('Benachrichtigungen aus: auch eine dringende Meldung kommt nicht', async () => {
  const s = setup({ notify: false });
  await s.melden({ ton: 'ende', dringend: true });
  assert.equal(s.erstellt.length, 0);
});

test('dringend nur bei echtem true - ein Text "true" zaehlt nicht', async () => {
  const s = setup({});
  await s.melden({ ton: 'ende', dringend: 'true' });
  assert.equal('requireInteraction' in s.erstellt[0], false);
  assert.equal(s.erstellt[0].priority, 1);
});
