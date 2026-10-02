'use strict';

// ===========================================================================
// Das Sim-Labor: der GANZE, unveraenderte content.js laeuft gegen die
// Nachbau-Welt (welt.cjs) - und die Zeit kommt aus der falschen Uhr
// (uhr.cjs). Damit lassen sich Stunden Botbetrieb in Sekunden abspielen.
//
// Aufbau wie tests/full-run.test.cjs, mit drei Unterschieden:
// 1. setTimeout/setInterval/Date kommen aus der falschen Uhr.
// 2. fetch kommt aus der Nachbau-Welt (Latenz, Marktleben, Fehlerstuerme).
// 3. Math.random ist gewuerfelt mit Samen: jeder Lauf ist wiederholbar.
// ===========================================================================

const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { virtuelleUhr, wuerfelMitSamen, matheMitSamen } = require('./uhr.cjs');
const { baueWelt } = require('./welt.cjs');

const quelle = fs.readFileSync(path.join(__dirname, '..', '..', 'content.js'), 'utf8');

function simLabor({ samen = 1, welt: weltEinstellungen, startZeit } = {}) {
  const uhr = virtuelleUhr(startZeit);
  const zufall = wuerfelMitSamen(samen);
  const welt = baueWelt({ uhr, zufall, einstellungen: weltEinstellungen });
  const speicher = {};
  const hoerer = { nachricht: [], befehl: [] };

  const window = {
    location: { origin: 'https://www.ea.com', href: 'https://www.ea.com/x' },
    addEventListener(art, fn) { if (art === 'message') hoerer.nachricht.push(fn); },
    postMessage(data) {
      uhr.setTimeout(() => {
        for (const fn of Array.from(hoerer.nachricht)) fn({ source: window, origin: window.location.origin, data });
      }, 0);
    }
  };
  window.window = window;

  // Die Welt beantwortet die Beobachtungslisten-Frage, wie sniffer.js es taete.
  hoerer.nachricht.push((ereignis) => {
    const d = ereignis && ereignis.data;
    if (d && d.__ownbot === 'watchlist?') {
      window.postMessage({ __ownbot: 'watchlist', requestId: d.requestId, items: welt.beobachtungsliste() });
    }
  });

  const context = vm.createContext({
    window,
    globalThis: {},
    document: { addEventListener() {}, body: null },
    console: { log() {}, warn() {}, error() {} },
    performance: { getEntriesByType: () => [] },
    setTimeout: uhr.setTimeout,
    setInterval: uhr.setInterval,
    clearTimeout: uhr.clearTimeout,
    clearInterval: uhr.clearInterval,
    Date: uhr.Datum,
    Math: matheMitSamen(wuerfelMitSamen(samen ^ 0x9e3779b9)),
    URL, URLSearchParams, AbortController, JSON, Promise, Object, Array, Number, String, Boolean, Set, Map, RegExp, Error,
    chrome: {
      runtime: {
        id: 'sim',
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
    fetch: welt.fetch
  });

  vm.runInContext(quelle, context);

  // Ein Befehl ans Popup-Protokoll. Die Antwort kommt ueber Promise-Ketten
  // (Speicherzugriffe), nicht ueber Zeitgeber - ein paar setImmediate-Runden
  // reichen. Falls doch ein Zeitgeber gebraucht wird, dreht die Notrunde
  // die Uhr in kleinen Schritten weiter.
  const senden = async (cmd, extra) => {
    const msg = Object.assign({ cmd: 'v11/' + cmd }, extra || {});
    let fertig = false;
    let ergebnis = null;
    const antworten = (a) => { if (!fertig) { fertig = true; ergebnis = a; } };
    for (const fn of hoerer.befehl) fn(msg, { id: 'sim' }, antworten);
    for (let i = 0; i < 300 && !fertig; i++) await new Promise((r) => setImmediate(r));
    for (let i = 0; i < 40 && !fertig; i++) await uhr.vorspulen(25);
    return ergebnis;
  };

  // Sitzung bekanntgeben, wie sniffer.js es tut.
  window.postMessage({ __ownbot: 'session', sid: 'sim-sitzung-1234', base: 'https://utas.external.s2.fut.ea.com/ut/game/fc27' });

  return { senden, uhr, welt, speicher, hoerer };
}

// Standardauftrag: ein Spieler, klare Grenzen. Einzelne Werte pro Szenario
// ueberschreiben.
const AUFTRAG = {
  targets: [{ playerId: 231747, playerName: 'Testspieler', rating: 84, maxPrice: 1000 }],
  budget: 20000,
  maxBuys: 10,
  timeLimitMin: 300, // Hoechstwert, den der Bot zulaesst (5 Stunden)
  afterBuy: 'keep',
  speedMode: 'safe',
  pausePreset: 'long'
};

module.exports = { simLabor, AUFTRAG };
