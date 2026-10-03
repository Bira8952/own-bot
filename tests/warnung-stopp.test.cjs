const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const quelle = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

// ===========================================================================
// Haken "Bei EA-Warnung sofort stoppen" (02.10.2026, Optionen > Grenzen).
//
// Warum: Am 22.09. kamen beim Kaufen 426 und 461 direkt vor der Sperre. Im
// FST-Modus ("Ohne eigene Grenzen") laeuft der Bot bei einem Kauffehler
// weiter - so will es der Nutzer. Mit dem Haken (ab Werk AUS) hoert er bei
// einer EA-Warnung sofort auf. Unabhaengig vom Haken: Endet ein Lauf wegen
// einer solchen Warnung, kommt immer der Warnton, und die Chrome-Meldung ist
// "dringend" (bleibt stehen, bis man sie wegklickt).
//
// Erst die Tabelle, dann der ganze content.js im Labor wie in full-run.
// ===========================================================================

const von = quelle.indexOf('  const HARD_STOP = {');
const bis = quelle.indexOf('  // Die Session-ID geht nur an EA-Hosts');
const tabCtx = vm.createContext({ Set });
vm.runInContext(quelle.slice(von, bis), tabCtx);
const T = vm.runInContext('({ HARD_STOP, ITEM_GONE, WARNUNG_CODES })', tabCtx);

test('Warn-Codes: genau die Liste, alle mit Stoppmeldung, keiner als verpasst', () => {
  assert.deepEqual([...T.WARNUNG_CODES].sort((a, b) => a - b), [401, 426, 458, 461, 465, 468, 474, 494, 512, 521, 20000, 20004]);
  for (const c of T.WARNUNG_CODES) {
    assert.ok(T.HARD_STOP[c], 'kein HARD_STOP-Text fuer ' + c);
    assert.equal(T.ITEM_GONE.has(c), false, c + ' darf nicht als "zu spaet" zaehlen');
  }
  // 429 (zu viele Anfragen), 470 (keine Coins), 473 (Ziel voll) stehen
  // bewusst nicht drin - das Paket legt die Liste fest.
  for (const c of [429, 470, 473]) assert.equal(T.WARNUNG_CODES.has(c), false, String(c));
});

const ANGEBOT = {
  tradeId: 5001, buyNowPrice: 900, startingBid: 150, currentBid: 0, expires: 3600, tradeState: 'active', bidState: 'none',
  itemData: { id: 777, assetId: 231747, resourceId: 50231747, rating: 84, rareflag: 1 }
};

// Wie labor() in full-run.test.cjs, mit drei Unterschieden:
// (a) Der Speicher hat die Einstellungen schon VOR dem Laden - content.js
//     liest sie beim Start, und onChanged tut im Labor nichts.
// (b) chrome.runtime.sendMessage sammelt die Nachrichten (Meldungen).
// (c) Ein nachgemachter AudioContext zaehlt die Toene (createOscillator).
function labor({ antwortHook, settings } = {}) {
  const ea = { anfragen: [], angebote: [Object.assign({}, ANGEBOT)] };
  const speicher = settings ? { settings } : {};
  const gesendet = [];
  const toene = [];
  const hoerer = { nachricht: [], befehl: [] };
  const antwort = (status, daten) => ({ ok: status >= 200 && status < 300, status, json: async () => daten });
  const window = {
    location: { origin: 'https://www.ea.com', href: 'https://www.ea.com/x' },
    addEventListener(art, fn) { if (art === 'message') hoerer.nachricht.push(fn); },
    postMessage(data) { setTimeout(() => { for (const fn of hoerer.nachricht) fn({ source: window, data }); }, 0); }
  };
  window.window = window;
  const knoten = () => ({
    gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
    frequency: { setValueAtTime() {} },
    connect() {}, disconnect() {}, start() {}, stop() {}
  });
  class AudioContext {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
    createGain() { return knoten(); }
    createOscillator() { toene.push(Date.now()); return knoten(); }
    resume() { return Promise.resolve(); }
  }
  const context = vm.createContext({
    window, globalThis: {}, AudioContext,
    document: { addEventListener() {}, body: null },
    console: { log() {}, warn() {}, error() {} },
    setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); if (t.unref) t.unref(); return t; },
    setInterval: (fn, ms) => { const t = setInterval(fn, ms); if (t.unref) t.unref(); return t; },
    clearTimeout, clearInterval,
    URL, URLSearchParams, AbortController, Date, Math, JSON, Promise, Object, Array, Number, String, Boolean, Set, Map, RegExp, Error,
    chrome: {
      runtime: { id: 'labor', onMessage: { addListener: (fn) => hoerer.befehl.push(fn) }, sendMessage: async (m) => { gesendet.push(m); return {}; } },
      storage: {
        local: {
          get: async (keys) => {
            const liste = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys || {});
            const out = {};
            for (const k of liste) if (k in speicher) out[k] = JSON.parse(JSON.stringify(speicher[k]));
            return out;
          },
          set: async (obj) => { Object.assign(speicher, JSON.parse(JSON.stringify(obj))); }
        },
        onChanged: { addListener() {} }
      }
    },
    fetch: async (url, init) => {
      const u = String(url);
      const methode = (init && init.method) || 'GET';
      ea.anfragen.push({ methode, url: u });
      if (antwortHook) { const eigen = antwortHook(u, methode, antwort); if (eigen) return eigen; }
      if (u.includes('/transfermarket?')) return antwort(200, { auctionInfo: ea.angebote, credits: 100000 });
      if (/\/trade\/\d+\/bid$/.test(u) && methode === 'PUT') {
        const angebot = ea.angebote.shift();
        if (!angebot) return antwort(478, {});
        return antwort(200, { credits: 99100, auctionInfo: [{ itemData: angebot.itemData }] });
      }
      return antwort(404, {});
    }
  });
  // Wie in full-run: nur die Ruhe nach dem Kauf von Sekunden auf Millisekunden.
  const testQuelle = quelle
    .replace('MOVE_DELAY_MIN_MS: 5000', 'MOVE_DELAY_MIN_MS: 5')
    .replace('MOVE_DELAY_MAX_MS: 6500', 'MOVE_DELAY_MAX_MS: 8');
  assert.notEqual(testQuelle, quelle, 'Ersetzung der Verschiebepause greift nicht mehr');
  vm.runInContext(testQuelle, context);
  const senden = (cmd, extra) => new Promise((resolve) => {
    const msg = Object.assign({ cmd: 'v11/' + cmd }, extra || {});
    let fertig = false;
    const nb = setTimeout(() => { if (!fertig) resolve(null); }, 800);
    if (nb.unref) nb.unref();
    for (const fn of hoerer.befehl) fn(msg, { id: 'labor' }, (a) => { if (!fertig) { fertig = true; clearTimeout(nb); resolve(a); } });
  });
  window.postMessage({ __ownbot: 'session', sid: 'labor-sitzung-1234', base: 'https://utas.external.s2.fut.ea.com/ut/game/fc27' });
  return { senden, ea, speicher, gesendet, toene };
}

const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const AUFTRAG = { targets: [{ playerId: 231747, playerName: 'Testspieler', rating: 84, maxPrice: 1000 }], budget: 5000, maxBuys: 3, timeLimitMin: 5, afterBuy: 'keep' };
const KAUF = (status) => (u, m, a) => (/\/trade\/\d+\/bid$/.test(u) ? a(status, {}) : null);
const SUCHE = (status) => (u, m, a) => (u.includes('/transfermarket?') ? a(status, {}) : null);
const FST = { fstModus: true, fstModusV1: true };
const dringende = (l) => l.gesendet.filter((m) => m.dringend === true);

async function laufen(l) {
  await warte(50);
  const start = await l.senden('start', { cfg: AUFTRAG });
  assert.equal(start.ok, true, start && start.error);
  await warte(500);
  const st = (await l.senden('status')).status;
  await l.senden('stop');
  return st;
}

test('Haken aus: Kauf-461 im FST-Modus laeuft weiter wie bisher', async () => {
  const l = labor({ antwortHook: KAUF(461), settings: FST });
  const st = await laufen(l);
  assert.equal(st.fstModus, true);
  assert.equal(st.running, true);
  assert.equal(st.stats.errors, 1);
  assert.match(st.message, /Kauf 5001: HTTP 461/);
  assert.equal(st.cooldown.leftMin, 0);
  assert.equal(l.speicher.safetyCooldown, undefined);
  // Kein Stopp, also auch keine Meldung und kein Ton - wie vor dem Haken.
  assert.equal(l.gesendet.length, 0);
  assert.equal(l.toene.length, 0);
});

test('Haken an: Kauf-461 im FST-Modus stoppt sofort, ohne Startsperre, mit Alarm', async () => {
  const l = labor({ antwortHook: KAUF(461), settings: Object.assign({ warnungStopp: true }, FST) });
  const st = await laufen(l);
  assert.equal(st.fstModus, true);
  assert.equal(st.running, false);
  assert.equal(st.level, 'error');
  assert.match(st.message, /PERMISSION_DENIED/);
  assert.equal(st.stats.errors, 0);
  // FST-Modus: keine Wartezeit vor dem Neustart, auch mit Haken nicht.
  assert.equal(st.cooldown.leftMin, 0);
  assert.equal(l.speicher.safetyCooldown, undefined);
  // Genau ein Kaufversuch - danach geht nichts mehr raus.
  assert.equal(l.ea.anfragen.filter((a) => /\/bid$/.test(a.url)).length, 1);
  assert.equal(dringende(l).length, 1);
  assert.ok(l.toene.length > 0, 'Warnton auch ohne "Ton am Lauf-Ende"');
});

test('Haken an: 470 ist keine EA-Warnung - der Lauf geht weiter', async () => {
  const l = labor({ antwortHook: KAUF(470), settings: Object.assign({ warnungStopp: true }, FST) });
  const st = await laufen(l);
  assert.equal(st.running, true);
  assert.match(st.message, /Kauf 5001: HTTP 470/);
  assert.equal(l.gesendet.length, 0);
  assert.equal(l.toene.length, 0);
});

test('strenger Modus: 461 stoppt mit Sperre und Text wie bisher, jetzt mit Alarm', async () => {
  const l = labor({ antwortHook: KAUF(461) });
  const st = await laufen(l);
  assert.notEqual(st.fstModus, true);
  assert.equal(st.running, false);
  assert.equal(st.level, 'error');
  assert.equal(st.message, 'Aktion nicht erlaubt (PERMISSION_DENIED). Web App neu laden und Konto prüfen. (HTTP 461)');
  assert.equal(st.cooldown.leftMin, 60);
  assert.equal(dringende(l).length, 1);
  assert.ok(l.toene.length > 0, 'Warnton auch ohne "Ton am Lauf-Ende"');
});

test('Haken aus: Suche-458 im FST-Modus stoppt wie bisher ohne Sperre - Alarm kommt trotzdem', async () => {
  const l = labor({ antwortHook: SUCHE(458), settings: FST });
  const st = await laufen(l);
  assert.equal(st.running, false);
  assert.match(st.message, /Captcha/);
  assert.equal(st.cooldown.leftMin, 0);
  assert.equal(dringende(l).length, 1);
  assert.equal(dringende(l)[0].ton, 'ende');
  assert.ok(l.toene.length > 0);
});

test('ein gewoehnlicher Fehlerstopp (Suche 404) bleibt still und ohne stehende Meldung', async () => {
  const l = labor({ antwortHook: SUCHE(404), settings: FST });
  const st = await laufen(l);
  assert.equal(st.running, false);
  assert.match(st.message, /Code 404/);
  assert.equal(l.gesendet.length, 1);
  assert.equal('dringend' in l.gesendet[0], false);
  assert.equal(l.toene.length, 0);
});

test('die normale Kaufmeldung bleibt Feld fuer Feld gleich', async () => {
  const l = labor({ settings: Object.assign({ warnungStopp: true }, FST) });
  const st = await laufen(l);
  assert.equal(st.stats.bought, 1);
  const kauf = l.gesendet.filter((m) => m.ton === 'kauf');
  assert.equal(kauf.length, 1);
  assert.deepEqual(Object.keys(kauf[0]), ['type', 'title', 'message', 'ton']);
  assert.equal(dringende(l).length, 0);
});

// ---------------------------------------------------------------------------
// Optionen: Haken in popup.html (Gruppe Grenzen), in den Feldlisten von
// popup.js, ab Werk AUS, in der Sicherung - aber nicht in Sammlungen
// (globaler Sicherheitsschalter wie fstModus). content.js liest ihn in
// applyAutomationSettings.
// ---------------------------------------------------------------------------
const popup = fs.readFileSync(path.join(__dirname, '..', 'popup.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'popup.html'), 'utf8');
function abschnitt(text, anfang, ende) {
  const a = text.indexOf(anfang);
  const b = text.indexOf(ende, a);
  assert.ok(a >= 0 && b > a, 'Abschnitt nicht gefunden: ' + anfang);
  return text.slice(a, b + ende.length);
}

test('Optionen: Haken "Bei EA-Warnung sofort stoppen" - Felder, Standard, Sicherung, Sammlungen', () => {
  const ctx = vm.createContext({});
  vm.runInContext([
    abschnitt(popup, 'const NUMBER_FIELDS = [', '];'),
    abschnitt(popup, 'const CHECK_FIELDS = [', '];'),
    abschnitt(popup, 'const SELECT_FIELDS = [', '];'),
    abschnitt(popup, 'const AFTER_BUY_VALUES = [', '];'),
    abschnitt(popup, 'const PROFIL_AUS = [', '];'),
    abschnitt(popup, 'const istObjekt = ', ';'),
    abschnitt(popup, 'function pruefeSicherungSettings(', '\n}'),
    'this.L = { CHECK_FIELDS, PROFIL_AUS, pruefeSicherungSettings };'
  ].join('\n'), ctx);
  const L = ctx.L;
  assert.ok(L.CHECK_FIELDS.includes('warnungStopp'));
  assert.ok(L.PROFIL_AUS.includes('warnungStopp'), 'darf nicht mit Sammlungen wandern');
  assert.match(abschnitt(popup, 'const DEFAULTS = {', '\n};'), /^\s*warnungStopp: false,/m);
  assert.equal(L.pruefeSicherungSettings({ warnungStopp: true }).warnungStopp, true);
  assert.equal(L.pruefeSicherungSettings({ warnungStopp: 'ja' }).warnungStopp, false);
  // Genau ein Haken, und zwar in der Gruppe "Grenzen" (#fst-modus).
  assert.equal((html.match(/\bid="warnungStopp"/g) || []).length, 1);
  const gruppe = abschnitt(html, 'id="fst-modus"', '</div></details>');
  assert.match(gruppe, /<input id="warnungStopp" type="checkbox">Bei EA-Warnung sofort stoppen<\/label>/);
  // content.js: ab Werk aus, nur ein echtes true schaltet ihn an.
  assert.match(quelle, /STATE\.warnungStopp = Boolean\(settings && settings\.warnungStopp === true\);/);
  assert.match(abschnitt(quelle, '  const STATE = {', '\n  };'), /^\s*warnungStopp: false,/m);
});
