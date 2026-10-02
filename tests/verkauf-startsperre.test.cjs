const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { simLabor, AUFTRAG } = require('./sim/labor.cjs');
const popup = fs.readFileSync(path.join(__dirname, '..', 'popup.js'), 'utf8');

// ===========================================================================
// Kein Start waehrend einer Verkaufs-Aktion (02.10.2026).
// verkaufSperre sperrte bisher nur die Gegenrichtung: kein Verkauf waehrend
// eines Laufs. Umgekehrt konnte ein Lauf starten, waehrend Einstellen,
// Abraeumen oder ein frisches Lesen der Transferliste noch lief - zwei
// Anfrage-Stroeme gleichzeitig (Komplettpruefung-23-09 Fund 23).
// Ausnahme "lesen": nur der Speicher der App, keine EA-Anfrage.
// Der GANZE content.js laeuft im Sim-Labor mit der falschen Uhr.
// ===========================================================================

const verkaufStand = async (l) => (await l.senden('status')).status.verkauf;

test('frisches Lesen der Transferliste sperrt den Start, bis es fertig ist', async () => {
  const l = simLabor({ samen: 3 });
  await l.uhr.vorspulen(100); // Sitzung angekommen

  const lesen = await l.senden('transferliste', { frisch: true });
  assert.equal(lesen.ok, true, 'Lesen abgelehnt: ' + (lesen.error || ''));
  const v = await verkaufStand(l);
  assert.equal(v.laeuft, true);
  assert.equal(v.art, 'aktualisieren');

  const res = await l.senden('start', { cfg: AUFTRAG });
  assert.equal(res.ok, false, 'waehrend der Verkaufs-Aktion darf kein Lauf starten');
  assert.match(res.error, /Verkaufs-Aktion läuft noch/);
  assert.equal(res.status.running, false);

  // Das Labor beantwortet "tradepile?" nicht: Nach der Frist (20 s) ist
  // die Aktion vorbei, und der Start geht durch.
  await l.uhr.vorspulen(30000);
  assert.equal((await verkaufStand(l)).laeuft, false);
  const wieder = await l.senden('start', { cfg: AUFTRAG });
  assert.equal(wieder.ok, true, 'danach muss der Start gehen: ' + (wieder.error || ''));
  await l.senden('stop');
  await l.uhr.vorspulen(30000);
});

test('Lesen aus dem Speicher der App sperrt nicht', async () => {
  const l = simLabor({ samen: 4 });
  await l.uhr.vorspulen(100);

  const lesen = await l.senden('transferliste', { frisch: false });
  assert.equal(lesen.ok, true);
  const v = await verkaufStand(l);
  assert.equal(v.laeuft, true);
  assert.equal(v.art, 'lesen');

  // "lesen" fragt EA nie - ein Rotationsstart in diesem Moment darf nicht
  // die ganze Rotation beenden.
  const res = await l.senden('start', { cfg: AUFTRAG });
  assert.equal(res.ok, true, 'Start abgelehnt: ' + (res.error || ''));
  await l.senden('stop');
  await l.uhr.vorspulen(30000);
});

test('ein Rest der Verkaufs-Wache nach dem Stopp sperrt den sofortigen Neustart', async () => {
  const l = simLabor({ samen: 5 });
  await l.uhr.vorspulen(100);

  assert.equal((await l.senden('start', { cfg: AUFTRAG })).ok, true);
  // Die Start-Wache laeuft ohne await an und liest die Transferliste.
  await l.uhr.vorspulen(50);
  assert.equal((await verkaufStand(l)).art, 'pruefen');
  await l.senden('stop');

  const sofort = await l.senden('start', { cfg: AUFTRAG });
  assert.equal(sofort.ok, false, 'die Wache kann noch Anfragen offen haben');
  assert.match(sofort.error, /Verkaufs-Aktion/);

  // Das Lesen aus dem Speicher laeuft nach 5 s in die Frist, dann ist frei.
  await l.uhr.vorspulen(6000);
  assert.equal((await verkaufStand(l)).laeuft, false);
  const spaeter = await l.senden('start', { cfg: AUFTRAG });
  assert.equal(spaeter.ok, true, 'Start abgelehnt: ' + (spaeter.error || ''));
  await l.senden('stop');
  await l.uhr.vorspulen(30000);
});

test('eine Sperre bleibt die erste Meldung', async () => {
  // Vorrang wie bisher: Wer gesperrt ist, soll den Sperrgrund lesen, nicht
  // die Verkaufs-Aktion. EA antwortet von Anfang an mit 521 - der Lauf
  // stoppt mit Sperre, waehrend die Start-Wache noch liest.
  const l = simLabor({ samen: 6, welt: { stuerme: [{ nachMs: 0, dauerMs: 10 * 60000, art: 'status', status: 521 }] } });
  await l.uhr.vorspulen(100);
  assert.equal((await l.senden('start', { cfg: AUFTRAG })).ok, true);
  await l.uhr.vorspulen(1500);

  const st = (await l.senden('status')).status;
  assert.equal(st.running, false, 'nach 521 muss Schluss sein');
  assert.ok(st.cooldown.leftMin > 0, 'die Sperre muss stehen');
  assert.equal(st.verkauf.laeuft, true, 'die Start-Wache liest noch - sonst prueft der Test nichts');

  const res = await l.senden('start', { cfg: AUFTRAG });
  assert.equal(res.ok, false);
  assert.match(res.error, /gesperrt/);
  await l.uhr.vorspulen(30000);
});

// ---------------------------------------------------------------------------
// popup.js: derselbe Grund am Start-Knopf (startSperrGrund).
// ---------------------------------------------------------------------------

const sperrAbschnitt = popup.slice(popup.indexOf('function startSperrGrund('), popup.indexOf('function aktuelleSperre('));

function sperrGrund(st) {
  const context = vm.createContext({});
  vm.runInContext(sperrAbschnitt, context);
  context.st = st;
  return vm.runInContext('startSperrGrund(st)', context);
}

const FREI = { session: true, cooldown: { leftMin: 0 }, running: false, check: { running: false }, marketScan: { running: false } };
const mit = (extra) => Object.assign({}, FREI, extra);

test('popup: frei ohne Verkaufs-Aktion', () => {
  assert.equal(sperrGrund(FREI), '');
  assert.equal(sperrGrund(mit({ verkauf: { laeuft: false, art: '' } })), '');
});

test('popup: jede Verkaufs-Aktion ausser "lesen" sperrt den Start', () => {
  for (const art of ['einstellen', 'neuEinstellen', 'abraeumen', 'aktualisieren', 'pruefen']) {
    assert.match(sperrGrund(mit({ verkauf: { laeuft: true, art } })), /Verkaufs-Aktion/, art);
  }
  assert.equal(sperrGrund(mit({ verkauf: { laeuft: true, art: 'lesen' } })), '');
});

test('popup: die bisherigen Gruende behalten den Vorrang', () => {
  const verkauf = { laeuft: true, art: 'pruefen' };
  // Waehrend eines Laufs ist die Wache normal - dort zaehlt "laeuft gerade".
  assert.match(sperrGrund(mit({ running: true, verkauf })), /läuft gerade/);
  assert.match(sperrGrund(mit({ session: false, verkauf })), /Nicht verbunden/);
  assert.match(sperrGrund(mit({ cooldown: { leftMin: 12, reason: 'Captcha' }, verkauf })), /Sperre noch 12 Min/);
  assert.match(sperrGrund(mit({ check: { running: true }, verkauf })), /Preis-Check/);
});
