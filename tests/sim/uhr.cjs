'use strict';

// ===========================================================================
// Die falsche Uhr.
// Der Bot glaubt, es vergehen Stunden - in Wahrheit vergehen Millisekunden.
// Alles, was im Bot auf Zeit beruht (setTimeout, setInterval, Date.now),
// laeuft ueber diese Uhr. "vorspulen" dreht sie vor und feuert dabei jeden
// faelligen Zeitgeber in der richtigen Reihenfolge.
//
// Der eine heikle Punkt: Nach jedem gefeuerten Zeitgeber muessen erst alle
// wartenden Promises fertig laufen (await-Ketten im Bot), BEVOR die Uhr
// weiterdreht. Sonst wuerde die Uhr an einer await-Kette vorbeispulen, die
// gerade erst ihren naechsten Zeitgeber stellen wollte. Dafuer sorgt die
// setImmediate-Runde zwischen den Schritten.
// ===========================================================================

function virtuelleUhr(startZeit) {
  let jetzt = Number(startZeit) || Date.parse('2026-09-22T08:00:00Z');
  let folge = 0; // Einfuegereihenfolge als Gleichstand-Entscheider
  let naechsteId = 1;
  const zeitgeber = new Map();
  const fehler = []; // Ausnahmen aus Zeitgeber-Rueckrufen, wie im Browser: sammeln, nicht abstuerzen

  const eintragen = (fn, ms, intervall, args) => {
    if (typeof fn !== 'function') return 0;
    const id = naechsteId++;
    const abstand = Math.max(0, Number(ms) || 0);
    zeitgeber.set(id, { id, fn, faellig: jetzt + abstand, intervall: intervall ? Math.max(1, abstand) : 0, folge: folge++, args: args || [] });
    return id;
  };

  // Eine Runde: alle bereits angestossenen Promise-Ketten zu Ende laufen lassen.
  const runde = () => new Promise((fertig) => setImmediate(fertig));

  async function laufeBis(ziel) {
    let schritte = 0;
    for (;;) {
      await runde();
      let naechster = null;
      for (const t of zeitgeber.values()) {
        if (!naechster || t.faellig < naechster.faellig || (t.faellig === naechster.faellig && t.folge < naechster.folge)) naechster = t;
      }
      if (!naechster || naechster.faellig > ziel) {
        if (jetzt < ziel) jetzt = ziel;
        await runde();
        return;
      }
      if (++schritte > 2000000) throw new Error('Die falsche Uhr dreht sich im Kreis: ueber 2 Mio. Zeitgeber in einem Vorspulen.');
      if (naechster.faellig > jetzt) jetzt = naechster.faellig;
      if (naechster.intervall) {
        naechster.faellig = jetzt + naechster.intervall;
        naechster.folge = folge++;
      } else {
        zeitgeber.delete(naechster.id);
      }
      try {
        naechster.fn(...naechster.args);
      } catch (e) {
        fehler.push({ t: jetzt, meldung: e && e.message ? e.message : String(e) });
      }
    }
  }

  class FalschesDatum extends Date {
    constructor(...argumente) {
      if (argumente.length) super(...argumente);
      else super(jetzt);
    }
    static now() {
      return jetzt;
    }
  }

  return {
    get jetzt() { return jetzt; },
    fehler,
    Datum: FalschesDatum,
    setTimeout: (fn, ms, ...args) => eintragen(fn, ms, false, args),
    setInterval: (fn, ms, ...args) => eintragen(fn, ms, true, args),
    clearTimeout: (id) => { zeitgeber.delete(id); },
    clearInterval: (id) => { zeitgeber.delete(id); },
    anzahlOffen: () => zeitgeber.size,
    warte: (ms) => new Promise((fertig) => eintragen(fertig, ms, false, [])),
    laufeBis,
    vorspulen: (ms) => laufeBis(jetzt + Math.max(0, Number(ms) || 0))
  };
}

// Wuerfel mit Samen: gleiche Zahl rein, gleiche Zufallsfolge raus.
// Damit ist jeder Simulationslauf wiederholbar - ein gefundener Fehler
// laesst sich mit demselben Samen beliebig oft nachstellen.
function wuerfelMitSamen(samen) {
  let a = samen | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Ein Math-Ersatz, dessen random() aus dem Samen-Wuerfel kommt. Alles andere
// (floor, min, pow, ...) bleibt das echte Math.
function matheMitSamen(zufall) {
  const m = {};
  for (const name of Object.getOwnPropertyNames(Math)) m[name] = Math[name];
  m.random = zufall;
  return m;
}

module.exports = { virtuelleUhr, wuerfelMitSamen, matheMitSamen };
