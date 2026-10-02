const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const quelle = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

// ===========================================================================
// Verkaufs-Wache und der Haken "Bei EA-Warnung sofort stoppen" (02.10.2026).
//
// Im FST-Modus meldet die Wache einen EA-Fehler nur ("Der Lauf geht
// weiter"). Mit dem Haken haelt sie bei einer EA-Warnung an wie im strengen
// Modus - und das halt-Objekt traegt den Code (eaWarnung) fuer den Alarm.
// Geprueft werden alle drei Stellen: Lesen, Abraeumen, Nachpruefen danach.
// ===========================================================================

function stueck(anfang, ende) {
  const a = quelle.indexOf(anfang);
  const b = quelle.indexOf(ende, a);
  assert.ok(a >= 0 && b > a, 'Abschnitt nicht gefunden: ' + anfang);
  return quelle.slice(a, b);
}
const tabellen = stueck('  const HARD_STOP = {', '  // Die Session-ID geht nur an EA-Hosts');
const lesen = stueck('  async function verkaufslisteLesen(', '  function frischErlaubt(');
const abraeumen = stueck('  async function wacheAbraeumen(', '  async function verkaufsWacheAufgabe(');

// stelle: "lesen" | "abraeumen" | "nachlesen" - dort kommt der EA-Fehler.
function setup({ fst = true, haken = false, code = 461, stelle = 'lesen' } = {}) {
  const ereignisse = [];
  const STATE = { fstModus: fst, warnungStopp: haken };
  class HardStop extends Error {}
  const fehler = () => Object.assign(new Error('EA hat abgelehnt (HTTP ' + code + ').'), { status: code });
  const context = vm.createContext({
    Set, Date, Math, STATE, HardStop,
    VERKAUFS_WACHE: { halt: null, stummBis: 0, frischAt: 0, frischImLauf: 0, freiAt: 0, abgeraeumt: 0 },
    VERKAUF: { letzteAktion: 0 }, SESSION: { sid: 'x' }, STAPEL: {},
    toInt: (v) => { const n = Number(v); return Number.isFinite(n) ? Math.floor(n) : NaN; },
    isCurrent: () => true, cooldownBlock: () => '', andererTabAktiv: () => '',
    reserveUsage: async () => {}, verkaufAbstand: async () => {}, muenzenAusApp: async () => {},
    transferlisteHolen: async () => { throw fehler(); },
    verkaufAusfuehren: async () => { if (stelle === 'abraeumen') throw fehler(); },
    abraeumenNachlesen: async () => { if (stelle === 'nachlesen') throw fehler(); return []; },
    pushEvent: (t, x) => ereignisse.push(x), warn() {}, log() {},
    TRANSFERLISTE_MAX: 100
  });
  vm.runInContext(tabellen + lesen + abraeumen, context);
  return { context, ereignisse };
}

const STELLEN = [
  ['Lesen', 'lesen', 'verkaufslisteLesen(true, 1)'],
  ['Abraeumen', 'abraeumen', 'wacheAbraeumen({}, 1, 100, [])'],
  ['Nachpruefen nach dem Abraeumen', 'nachlesen', 'wacheAbraeumen({}, 1, 100, [])']
];

for (const [art, stelle, aufruf] of STELLEN) {
  test('Verkaufs-Wache ' + art + ': Haken aus, FST-Modus meldet nur (wie bisher)', async () => {
    const s = setup({ stelle });
    await vm.runInContext(aufruf, s.context);
    assert.equal(s.context.VERKAUFS_WACHE.halt, null);
    assert.match(s.ereignisse.join(' '), /Der Lauf geht weiter/);
  });

  test('Verkaufs-Wache ' + art + ': Haken an, FST-Modus haelt bei 461 an', async () => {
    const s = setup({ haken: true, stelle });
    await vm.runInContext(aufruf, s.context);
    const h = s.context.VERKAUFS_WACHE.halt;
    assert.ok(h, 'kein Halt');
    assert.equal(h.level, 'error');
    assert.match(h.text, /PERMISSION_DENIED/);
    assert.equal(h.eaWarnung, 461);
    assert.doesNotMatch(s.ereignisse.join(' '), /Der Lauf geht weiter/);
  });

  test('Verkaufs-Wache ' + art + ': Haken an, 470 ist keine Warnung - FST meldet nur', async () => {
    const s = setup({ haken: true, code: 470, stelle });
    await vm.runInContext(aufruf, s.context);
    assert.equal(s.context.VERKAUFS_WACHE.halt, null);
  });

  test('Verkaufs-Wache ' + art + ': strenger Modus haelt wie bisher, jetzt mit eaWarnung', async () => {
    const s = setup({ fst: false, stelle });
    await vm.runInContext(aufruf, s.context);
    const h = s.context.VERKAUFS_WACHE.halt;
    assert.equal(h.level, 'error');
    assert.equal(h.text, 'Gestoppt: Aktion nicht erlaubt (PERMISSION_DENIED). Web App neu laden und Konto prüfen.');
    assert.equal(h.eaWarnung, 461);
  });
}

test('Verkaufs-Wache: strenger Modus, Nicht-Warn-Code 470 haelt ohne eaWarnung', async () => {
  const s = setup({ fst: false, code: 470 });
  await vm.runInContext('verkaufslisteLesen(true, 1)', s.context);
  const h = s.context.VERKAUFS_WACHE.halt;
  assert.equal(h.level, 'error');
  assert.equal(Boolean(h.eaWarnung), false);
});
