const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const von = source.indexOf('  const ESKALATION_FAKTOR =');
// Nur den Cooldown-Block laden. Der fruehere Endmarker lag inzwischen hinter
// DOM-Horchern und zog damit unnoetig die halbe Laufzeitumgebung in den Test.
const section = source.slice(von, source.indexOf('  const BESITZ_KEY =', von));
// Die Codetabelle aus dem Quelltext holen, damit der Test sie nicht nachbaut.
const tabVon = source.indexOf('  const COOLDOWN_CODES = {');
const tabelle = source.slice(tabVon, source.indexOf('};', tabVon) + 2);

const DAY = 24 * 60 * 60 * 1000;

function setup(gespeichert) {
  const STATE = { cooldownUntil: 0, cooldownReason: '' };
  const abgelegt = {};
  const warnungen = [];
  const context = vm.createContext({
    STATE, DAY, Date, Math, Number, Object, Promise,
    warn: (m) => warnungen.push(m),
    tonSpielen() {}, rotationBeenden() {},
    str: (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : ''),
    toInt: (v) => { const n = Number(v); return Number.isFinite(n) ? Math.floor(n) : NaN; },
    chrome: { storage: { local: {
      get: async () => ({ safetyCooldown: gespeichert }),
      set: async (o) => { Object.assign(abgelegt, o); }
    } } }
  });
  vm.runInContext(tabelle + section, context);
  return { context, STATE, abgelegt, warnungen };
}

const sperren = (s, min, grund) => vm.runInContext('startCooldown(' + min + ',' + JSON.stringify(grund) + ')', s.context);
const rest = (s) => vm.runInContext('cooldownLeftMin()', s.context);
const codes = (s) => vm.runInContext('COOLDOWN_CODES', s.context);

test('ohne Vorfall ist nichts gesperrt', () => {
  const s = setup();
  assert.equal(rest(s), 0);
});

test('ein Captcha sperrt den Start fuer eine Stunde', () => {
  const s = setup();
  sperren(s, 60, 'EA verlangt eine Verifizierung (Captcha).');
  assert.equal(rest(s), 60);
  assert.match(s.STATE.cooldownReason, /Captcha/);
  assert.equal(s.abgelegt.safetyCooldown.until > Date.now(), true, 'ueberlebt ein Neuladen');
});

test('eine laengere Sperre wird nicht durch eine kuerzere verkuerzt', () => {
  // Sonst wuerde ein harmloser Folgefehler eine schwere Sperre aufheben.
  const s = setup();
  sperren(s, 240, 'Gerät gesperrt');
  sperren(s, 60, 'Captcha');
  assert.ok(rest(s) > 200, 'die vier Stunden bleiben stehen');
  assert.match(s.STATE.cooldownReason, /Gerät/);
});

test('eine laengere Sperre ersetzt eine kuerzere', () => {
  const s = setup();
  sperren(s, 60, 'Captcha');
  sperren(s, 240, 'Konto gesperrt');
  assert.ok(rest(s) > 200);
});

test('eine gespeicherte Sperre wird beim Laden uebernommen', async () => {
  const s = setup({ until: Date.now() + 30 * 60000, reason: 'Captcha' });
  await vm.runInContext('loadCooldown()', s.context);
  assert.equal(rest(s), 30);
});

test('eine abgelaufene Sperre wird nicht uebernommen', async () => {
  const s = setup({ until: Date.now() - 1000, reason: 'Captcha' });
  await vm.runInContext('loadCooldown()', s.context);
  assert.equal(rest(s), 0);
});

test('eine unsinnig weit entfernte Sperre wird verworfen', async () => {
  // Schutz vor kaputten Daten, die den Bot fuer Jahre lahmlegen wuerden.
  const s = setup({ until: Date.now() + 400 * DAY, reason: 'kaputt' });
  await vm.runInContext('loadCooldown()', s.context);
  assert.equal(rest(s), 0);
});

test('Muell im Speicher sperrt nichts', async () => {
  for (const muell of [null, undefined, 'text', 42, {}, { until: 'bald' }]) {
    const s = setup(muell);
    await vm.runInContext('loadCooldown()', s.context);
    assert.equal(rest(s), 0, JSON.stringify(muell));
  }
});

test('die richtigen EA-Codes loesen eine Sperre aus', () => {
  const s = setup();
  const tab = codes(s);
  assert.equal(tab[458], 60, 'Captcha: eine Stunde');
  assert.equal(tab[494], 120, 'gesperrter Transfermarkt: zwei Stunden');
  assert.equal(tab[20000], 240, 'gesperrtes Konto: vier Stunden');
  assert.equal(tab[478], undefined, 'ein verpasstes Angebot sperrt nichts');
  assert.equal(tab[461], 60, 'PERMISSION_DENIED sperrt den Neustart fuer eine Stunde');
});
