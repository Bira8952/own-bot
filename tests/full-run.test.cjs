const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const quelle = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

// ===========================================================================
// Durchlauf von vorne bis hinten.
// Die anderen Tests pruefen Ausschnitte. Hier laeuft der GANZE content.js in
// einer nachgestellten Umgebung, gegen eine nachgestellte EA-Schnittstelle.
// Genau so ist der Absturz aufgefallen, bei dem eine Variable vor ihrer
// Deklaration benutzt wurde - in einem Ausschnitt faellt das nie auf.
//
// Bewusst ohne jsdom: Das Projekt kommt ohne Abhaengigkeiten aus. Das Panel
// braucht ein DOM, deshalb bleibt document.body leer - dann mountet es nicht
// und wird von tests/panel.test.cjs eigens geprueft.
// ===========================================================================

const ANGEBOT = (ueber) => Object.assign({
  tradeId: 5001, buyNowPrice: 900, startingBid: 150, currentBid: 0, expires: 3600,
  tradeState: 'active', bidState: 'none',
  itemData: { id: 777, assetId: 231747, resourceId: 50231747, rating: 84, rareflag: 1 }
}, ueber || {});

function labor({ antwortHook } = {}) {
  const ea = { coins: 100000, angebote: [ANGEBOT()], gekauft: [], verschoben: [], anfragen: [] };
  const speicher = {};
  const hoerer = { nachricht: [], befehl: [] };

  const antwort = (status, daten) => ({ ok: status >= 200 && status < 300, status, json: async () => daten });

  const window = {
    location: { origin: 'https://www.ea.com', href: 'https://www.ea.com/x' },
    addEventListener(art, fn) { if (art === 'message') hoerer.nachricht.push(fn); },
    postMessage(data) { setTimeout(() => { for (const fn of hoerer.nachricht) fn({ source: window, data }); }, 0); }
  };
  window.window = window;

  const context = vm.createContext({
    window, globalThis: {},
    document: { addEventListener() {}, body: null },
    console: { log() {}, warn() {}, error() {} },
    // unref: Wartende Bot-Zeitgeber duerfen den Testlauf nicht offen halten.
    // Sie laufen weiter, solange der Prozess lebt - halten ihn aber nicht wach.
    setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); if (t.unref) t.unref(); return t; },
    setInterval: (fn, ms) => { const t = setInterval(fn, ms); if (t.unref) t.unref(); return t; },
    clearTimeout, clearInterval,
    URL, URLSearchParams, AbortController, Date, Math, JSON, Promise, Object, Array, Number, String, Boolean, Set, Map, RegExp, Error,
    chrome: {
      runtime: {
        id: 'labor',
        onMessage: { addListener: (fn) => hoerer.befehl.push(fn) },
        sendMessage: async () => ({})
      },
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
      if (antwortHook) {
        const eigen = antwortHook(u, methode, antwort);
        if (eigen) return eigen;
      }
      if (u.includes('/transfermarket?')) {
        const params = new URLSearchParams(u.split('?')[1]);
        const maxb = Number(params.get('maxb')) || Infinity;
        return antwort(200, { auctionInfo: ea.angebote.filter((a) => a.buyNowPrice <= maxb), credits: ea.coins });
      }
      const kauf = u.match(/\/trade\/(\d+)\/bid$/);
      if (kauf && methode === 'PUT') {
        const id = Number(kauf[1]);
        const idx = ea.angebote.findIndex((a) => a.tradeId === id);
        if (idx < 0) return antwort(478, {});
        const angebot = ea.angebote[idx];
        const preis = JSON.parse(init.body).bid;
        ea.angebote.splice(idx, 1);
        ea.coins -= preis;
        ea.gekauft.push({ tradeId: id, preis });
        return antwort(200, { credits: ea.coins, auctionInfo: [{ itemData: angebot.itemData }] });
      }
      if (u.endsWith('/item') && methode === 'PUT') {
        const daten = JSON.parse(init.body);
        ea.verschoben.push(daten.itemData[0]);
        return antwort(200, { itemData: [{ id: daten.itemData[0].id, success: true }] });
      }
      return antwort(404, {});
    }
  });

  // Die echte Logik behalten, nur die menschenartige Verschiebepause fuer den
  // Test von Sekunden auf Millisekunden kuerzen.
  const testQuelle = quelle
    .replace('MOVE_DELAY_MIN_MS: 5000', 'MOVE_DELAY_MIN_MS: 5')
    .replace('MOVE_DELAY_MAX_MS: 6500', 'MOVE_DELAY_MAX_MS: 8');
  vm.runInContext(testQuelle, context);

  const senden = (cmd, extra) => new Promise((resolve) => {
    const msg = Object.assign({ cmd: 'v11/' + cmd }, extra || {});
    let fertig = false;
    const notbremse = setTimeout(() => { if (!fertig) resolve(null); }, 800);
    if (notbremse.unref) notbremse.unref();
    const antworten = (a) => { if (!fertig) { fertig = true; clearTimeout(notbremse); resolve(a); } };
    for (const fn of hoerer.befehl) fn(msg, { id: 'labor' }, antworten);
  });

  // Sitzung bekanntgeben, wie sniffer.js es tut.
  window.postMessage({ __ownbot: 'session', sid: 'labor-sitzung-1234', base: 'https://utas.external.s2.fut.ea.com/ut/game/fc27' });

  return { senden, ea, speicher, window };
}

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

const STANDARD = {
  targets: [{ playerId: 231747, playerName: 'Testspieler', rating: 84, maxPrice: 1000 }],
  budget: 5000, maxBuys: 3, timeLimitMin: 5, afterBuy: 'keep'
};

async function laufen(l, cfg, ms) {
  const start = await l.senden('start', { cfg: Object.assign({}, STANDARD, cfg) });
  await warte(ms || 400);
  const st = await l.senden('status');
  await l.senden('stop');
  return { start, status: st && st.status };
}

test('ein vollstaendiger Kauf geht durch alle Schichten', async () => {
  const l = labor();
  await warte(50);
  const { start, status } = await laufen(l, { afterBuy: 'club' });

  assert.equal(start.ok, true, 'Start abgelehnt: ' + (start.error || ''));
  assert.equal(status.stats.bought, 1, 'Meldung: ' + status.message);
  assert.equal(status.stats.spent, 900);
  assert.equal(status.stats.errors, 0);
  assert.equal(l.ea.coins, 99100, 'EA hat die Coins abgezogen');
  assert.deepEqual(l.ea.gekauft, [{ tradeId: 5001, preis: 900 }]);
  assert.deepEqual(l.ea.verschoben, [{ id: '777', pile: 'club' }]);

  const log = l.speicher.purchases;
  assert.equal(log.length, 1, 'der Kauf muss im Kauflog stehen');
  assert.equal(log[0].price, 900);
  assert.equal(log[0].club, 'ok');
});

test('die Messzeile beschreibt die Antwort von EA', async () => {
  const l = labor();
  await warte(50);
  const { status } = await laufen(l);
  const ls = status.lastSearch;
  assert.equal(ls.count, 1);
  assert.equal(ls.under, 1, 'das Angebot liegt unter dem Zielpreis');
  assert.equal(ls.over, 0);
  assert.equal(ls.basis, 'Sofortkauf');
  assert.equal(ls.ratingOff, 0);
});

test('ein verschwundenes Angebot ist kein Fehler', async () => {
  const l = labor({ antwortHook: (u, m, antwort) => (u.match(/\/trade\/\d+\/bid$/) ? antwort(478, {}) : null) });
  await warte(50);
  const { status } = await laufen(l);
  assert.equal(status.stats.missed, 1);
  assert.equal(status.stats.errors, 0, 'zu spaet zu sein ist normal');
  assert.equal(status.running, true, 'der Lauf geht weiter');
});

test('PERMISSION_DENIED stoppt den Lauf hart', async () => {
  // Genau der Fehler, der frueher als "Angebot weg" durchging.
  const l = labor({ antwortHook: (u, m, antwort) => (u.match(/\/trade\/\d+\/bid$/) ? antwort(461, {}) : null) });
  await warte(50);
  const { status } = await laufen(l);
  assert.equal(status.running, false);
  assert.match(status.message, /PERMISSION_DENIED/);
});

test('ein Captcha sperrt den Neustart', async () => {
  const l = labor({ antwortHook: (u, m, antwort) => (u.includes('/transfermarket?') ? antwort(458, {}) : null) });
  await warte(50);
  const { status } = await laufen(l);
  assert.equal(status.running, false);
  assert.match(status.message, /Captcha/);
  assert.equal(status.cooldown.leftMin, 60);

  const nochmal = await l.senden('start', { cfg: STANDARD });
  assert.equal(nochmal.ok, false);
  assert.match(nochmal.error, /gesperrt/);
  assert.ok(l.speicher.safetyCooldown.until > Date.now(), 'ueberlebt ein Neuladen');
});

test('eine Karte am Tageslimit wird uebersprungen, ohne Coins auszugeben', async () => {
  const l = labor();
  await warte(50);
  const jetzt = Date.now();
  l.speicher.safetyUsage = { searches: [], buys: [], cards: { '231747:84': Array.from({ length: 20 }, () => jetzt) } };
  const vorher = l.ea.coins;
  const { status } = await laufen(l, {}, 600);
  assert.equal(status.stats.bought, 0);
  assert.equal(l.ea.coins, vorher, 'kein Coin ausgegeben');
  assert.equal(l.ea.angebote.length, 1, 'das Angebot liegt noch da');
  assert.deepEqual(status.cardsAtLimit, ['231747:84']);
});

test('ohne Sitzung wird gar nicht erst gestartet', async () => {
  const l = labor();
  // Absichtlich keine Sitzung melden: sofort starten, bevor die Nachricht da ist.
  const res = await l.senden('start', { cfg: STANDARD });
  assert.equal(res.ok, false);
  assert.match(res.error, /Session|verbunden/i);
});

test('ein 429 beim Kauf stoppt sofort und sperrt den Neustart', async () => {
  // Befund der Architektur-Durchsicht vom 21.09.2026 (der einzige, der die
  // Gegenpruefung ueberlebt hat): api() setzte bei 429 zwar die Pause, aber
  // nur die SUCHpfade beachteten sie. Die Treffer-Schleife kaufte Treffer
  // fuer Treffer weiter - mitten in der Drosselung, jede Anfrage zaehlte
  // aufs Tageslimit. Genau das Verhalten macht ein gebremstes Konto
  // auffaellig. Drei Treffer, jeder Kauf antwortet 429: erlaubt ist EIN
  // Versuch, dann ist Pause.
  const l = labor({ antwortHook: (u, m, antwort) => (u.match(/\/trade\/\d+\/bid$/) ? antwort(429, {}) : null) });
  await warte(50);
  l.ea.angebote = [ANGEBOT(), ANGEBOT({ tradeId: 5002 }), ANGEBOT({ tradeId: 5003 })];
  const { status } = await laufen(l, {}, 500);

  const kaufversuche = l.ea.anfragen.filter((a) => /\/trade\/\d+\/bid$/.test(a.url));
  assert.equal(kaufversuche.length, 1, 'nach dem ersten 429 darf kein weiterer Kauf rausgehen');
  assert.deepEqual(l.ea.gekauft, [], 'gekauft wurde nichts');
  assert.equal(status.running, false, '429 ist inzwischen ein harter Sicherheitsstopp');
  assert.match(status.message, /429|zu viele Anfragen/);
  assert.equal(status.cooldown.leftMin, 15);
});

test('der Verbrauch wird mitgezaehlt', async () => {
  const l = labor();
  await warte(50);
  const { status } = await laufen(l);
  assert.ok(status.usage.searchesDay >= 1, 'Suchen gezaehlt');
  assert.ok(status.usage.buysDay >= 1, 'Kaufaktionen gezaehlt');
  assert.equal(status.usage.cardLimitDay, 20);
});
