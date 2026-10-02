const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

// HARD_STOP und ITEM_GONE aus dem Quelltext holen, damit der Test die echten
// Tabellen prueft und nicht eine Kopie davon.
const von = source.indexOf('  const HARD_STOP = {');
const bis = source.indexOf('  // Die Session-ID geht nur an EA-Hosts');
const context = vm.createContext({ Set });
vm.runInContext(source.slice(von, bis) + '\n;({ HARD_STOP, ITEM_GONE })', context);
const { HARD_STOP, ITEM_GONE } = vm.runInContext('({ HARD_STOP: HARD_STOP, ITEM_GONE: ITEM_GONE })', context);

// Am 20.09.2026 aus UtasErrorCode der laufenden FC Web App ausgelesen.
const EA = {
  CAPTCHA_REQUIRED: 458,
  UT_BAD_REQUEST: 460,
  PERMISSION_DENIED: 461,
  NO_USER: 465,
  LOGGED_IN_ON_CONSOLE_LEGACY: 468,
  NOT_ENOUGH_CREDIT: 470,
  DESTINATION_FULL: 473,
  LOGGED_IN_ON_CONSOLE: 474,
  NO_CARD_EXISTS: 475,
  NO_TRADE_EXISTS: 478,
  INVALID_OWNER: 479,
  SERVICE_IS_DISABLED: 480,
  DID_CREATE_EXCEEDED: 489,
  DID_LOGIN_EXCEEDED: 490,
  DEVICE_SUSPENDED: 491,
  LOCKED_TRANSFER_MARKET: 494,
  ACCOUNT_BANNED: 20000,
  UPDATE_REQUIRED: 20001,
  GEOIP_DENIED: 20003,
  UNRECOVERABLE: 20004
};

test('PERMISSION_DENIED gilt als harter Stopp, nicht als verpasstes Angebot', () => {
  // Der eigentliche Fund: 461 stand frueher in ITEM_GONE. Damit hat der Bot
  // ein Rechteproblem als harmlos verbucht, den Fehlerzaehler zurueckgesetzt
  // und weitergemacht, statt anzuhalten.
  assert.equal(ITEM_GONE.has(EA.PERMISSION_DENIED), false);
  assert.ok(HARD_STOP[EA.PERMISSION_DENIED], 'muss eine Stoppmeldung haben');
});

test('nur wirklich verschwundene Angebote zaehlen als verpasst', () => {
  assert.ok(ITEM_GONE.has(EA.NO_TRADE_EXISTS));
  assert.ok(ITEM_GONE.has(EA.NO_CARD_EXISTS));
  assert.ok(ITEM_GONE.has(EA.INVALID_OWNER));
  assert.equal(ITEM_GONE.size, 3, 'keine weiteren Codes stillschweigend schlucken');
});

test('kein Code ist gleichzeitig Stopp und verpasstes Angebot', () => {
  for (const code of ITEM_GONE) {
    assert.equal(HARD_STOP[code], undefined, 'Code ' + code + ' darf nicht in beiden Tabellen stehen');
  }
});

test('die schweren Kontofaelle fuehren zum Stopp', () => {
  for (const name of ['ACCOUNT_BANNED', 'DEVICE_SUSPENDED', 'GEOIP_DENIED', 'UNRECOVERABLE', 'LOCKED_TRANSFER_MARKET', 'CAPTCHA_REQUIRED']) {
    assert.ok(HARD_STOP[EA[name]], name + ' (' + EA[name] + ') muss stoppen');
  }
});

test('eine beendete Sitzung fuehrt zum Stopp, egal welcher der beiden Codes kommt', () => {
  assert.ok(HARD_STOP[EA.LOGGED_IN_ON_CONSOLE]);
  assert.ok(HARD_STOP[EA.LOGGED_IN_ON_CONSOLE_LEGACY]);
  assert.ok(HARD_STOP[EA.NO_USER]);
});

test('volle Ablage und fehlende Coins stoppen statt endlos zu scheitern', () => {
  assert.ok(HARD_STOP[EA.DESTINATION_FULL]);
  assert.ok(HARD_STOP[EA.NOT_ENOUGH_CREDIT]);
});

test('die Meldungen nennen den EA-Namen, damit man sie nachschlagen kann', () => {
  assert.match(HARD_STOP[EA.ACCOUNT_BANNED], /ACCOUNT_BANNED/);
  assert.match(HARD_STOP[EA.PERMISSION_DENIED], /PERMISSION_DENIED/);
  assert.match(HARD_STOP[EA.DESTINATION_FULL], /DESTINATION_FULL/);
});

test('jede Stoppmeldung ist ein brauchbarer Satz', () => {
  for (const [code, text] of Object.entries(HARD_STOP)) {
    assert.equal(typeof text, 'string', code);
    assert.ok(text.length > 12, 'Meldung fuer ' + code + ' ist zu duerftig: ' + text);
  }
});

test('die HTTP-Codes ohne Enum-Entsprechung bleiben erhalten', () => {
  for (const code of [401, 403, 512, 521]) assert.ok(HARD_STOP[code], 'HTTP ' + code + ' fehlt');
});
