const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

// Am 21.09.2026 im laufenden Betrieb beobachtet: Die Leiste zeigte
// "EA-Antwortzeit: 0.1 Sek. im Mittel", WAEHREND EA mit HTTP 521 bremste.
//
// Grund: noteResponseTime() stand vor der Fehlerpruefung und zaehlte jede
// Antwort mit. Eine Sperrmeldung kommt fast sofort zurueck - der Schnitt fiel
// also genau dann, wenn es am schlechtesten stand. Die Drosselungserkennung
// (SLOW_RESPONSE_MS) haette so nie anschlagen koennen.
//
// Das laesst sich nicht sinnvoll mit einer nachgebauten fetch-Antwort pruefen:
// Entscheidend ist die REIHENFOLGE im Quelltext. Also wird sie gelesen.

const apiTeil = source.slice(source.indexOf('  async function api(path, options)'), source.indexOf('  function bin('));

test('die Zeitmessung laeuft nur bei geglueckten Antworten', () => {
  const zeile = apiTeil.match(/^.*noteResponseTime\(.*$/m);
  assert.ok(zeile, 'noteResponseTime wird in api() gar nicht mehr gerufen');
  assert.match(zeile[0], /if \(res\.ok\)/,
    'ohne res.ok zaehlen auch Sperrmeldungen mit und ziehen den Schnitt nach unten');
});

test('gemessen wird vor der Fehlerbehandlung, damit nichts verlorengeht', () => {
  // Die Messung muss vor dem HardStop stehen - der wirft und wuerde eine
  // langsame, aber geglueckte Antwort sonst nie zu sehen bekommen.
  const mess = apiTeil.indexOf('noteResponseTime(');
  const stop = apiTeil.indexOf('HARD_STOP[res.status]');
  assert.ok(mess > 0 && stop > 0, 'beide Stellen muessen in api() liegen');
  assert.ok(mess < stop, 'die Messung gehoert vor die Fehlerbehandlung');
});

test('der Coin-Stand wird nur ueber setCredits gesetzt', () => {
  // Sonst fehlt irgendwo der Zeitstempel, und die Oberflaeche haelt einen
  // alten Stand fuer aktuell - genau der Fall, der uns aufgefallen ist
  // (Leiste 21.496 gegen EAs eigene Kopfzeile mit 27.434).
  const direkt = source.match(/STATE\.credits\s*=/g) || [];
  assert.equal(direkt.length, 1, 'erlaubt ist nur die Zuweisung in setCredits selbst');
  const inSetCredits = source.slice(source.indexOf('function setCredits('), source.indexOf('function cooldownLeftMin('));
  assert.match(inSetCredits, /STATE\.credits\s*=/);
  assert.match(inSetCredits, /STATE\.creditsAt\s*=/, 'ohne Zeitstempel weiss niemand, wie alt der Stand ist');
});

test('der Zeitstempel geht mit dem Status an die Oberflaeche', () => {
  // Der Stand allein nuetzt nichts, wenn sein Alter unterwegs verlorengeht.
  const statusTeil = source.slice(source.indexOf('  function status()'));
  assert.match(statusTeil.slice(0, 4000), /credits: STATE\.credits,\s*\n\s*creditsAt: STATE\.creditsAt/);
});

test('die Oberflaeche kennzeichnet einen alten Stand', () => {
  const popup = fs.readFileSync(path.join(__dirname, '..', 'popup.js'), 'utf8');
  const stelle = popup.slice(popup.indexOf('$("s-credits").textContent'), popup.indexOf('$("s-scans")'));
  assert.match(stelle, /creditsAt/, 'ohne das Alter kann sie es nicht wissen');
  assert.match(stelle, /s-credits-label/, 'die Beschriftung muss es sagen, nicht nur der Tooltip');
});
