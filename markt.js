// FC27 Own Bot – markt.js
// Markt-Analyse: Preisverlauf je Karte und Signale fuer profitable Spieler.
//
// Reine Funktionen ohne Seiteneffekte (kein chrome.*, kein DOM), damit sie sich
// in Node testen lassen. content.js fuettert den Verlauf aus den Suchen, die
// der Bot sowieso macht - das kostet keine zusaetzliche EA-Anfrage.
//
// Wichtig: Das sind Wahrscheinlichkeiten, keine Garantien. "Der Preis steigt
// gleich wieder" ist eine Annahme (Rueckkehr zum Normalpreis), die der Verlauf
// stuetzt, aber nicht beweist. Darum gibt es Mindest-Datenmenge, Sicherheits-
// abschlag auf den Zielpreis und eine ehrliche Begruendung je Treffer.
(function (root) {
  "use strict";

  const EA_STEUER = 0.05; // EA behaelt 5 % vom Verkaufspreis
  const SLOT_MS = 10 * 60 * 1000; // ein Messpunkt je 10 Minuten
  const MAX_ALTER_MS = 12 * 60 * 60 * 1000; // 12 Stunden Verlauf
  const MAX_PUNKTE = 72; // 12 h bei 10 min
  const MIN_PUNKTE = 6; // darunter wird nichts bewertet
  const MIN_SPANNE_MS = 60 * 60 * 1000; // und die Daten muessen >= 1 h abdecken
  const MAX_KARTEN = 300;

  // Standardwerte der Bewertung. Alles ueberschreibbar ueber opts.
  const STANDARD = {
    minDip: 0.08, // Preis mind. 8 % unter dem Median
    maxDip: 0.4, // ueber 40 % ist meist ein Fehlpreis/Datenfehler, kein Dip
    minMarge: 0.03, // mind. 3 % Gewinn nach Steuer
    minGewinn: 150, // und mind. 150 Coins absolut
    sicherheit: 0.97, // Zielpreis = Median * 0.97 (nicht auf den Punkt rechnen)
    maxUnruhe: 0.25 // Preis springt zu wild -> Median wenig wert
  };

  // Verlauf: Array von [zeit, preis, treffer]. Zeit in ms, aelteste zuerst.
  function verlaufEintragen(verlauf, zeit, preis, treffer) {
    const liste = Array.isArray(verlauf) ? verlauf.slice() : [];
    if (!(preis > 0) || !(zeit > 0)) return liste;
    const letzter = liste[liste.length - 1];
    if (letzter && zeit - letzter[0] < SLOT_MS && zeit >= letzter[0]) {
      // Gleicher Zeitslot: der niedrigere Preis gewinnt, die Zeit bleibt.
      liste[liste.length - 1] = [letzter[0], Math.min(letzter[1], preis), Math.max(letzter[2] || 0, treffer || 0)];
    } else if (!letzter || zeit > letzter[0]) {
      liste.push([zeit, preis, treffer || 0]);
    }
    const grenze = zeit - MAX_ALTER_MS;
    while (liste.length && liste[0][0] < grenze) liste.shift();
    while (liste.length > MAX_PUNKTE) liste.shift();
    return liste;
  }

  // Ganzes Verlaufs-Objekt { key: [[t,p,n],...] } begrenzen: die am laengsten
  // nicht aktualisierten Karten fliegen raus.
  function verlaufBegrenzen(alle, maxKarten) {
    const grenze = maxKarten || MAX_KARTEN;
    const keys = Object.keys(alle || {});
    if (keys.length <= grenze) return alle;
    const letzte = (k) => {
      const v = alle[k];
      return v && v.length ? v[v.length - 1][0] : 0;
    };
    keys.sort((a, b) => letzte(b) - letzte(a));
    const neu = {};
    for (const k of keys.slice(0, grenze)) neu[k] = alle[k];
    return neu;
  }

  function median(zahlen) {
    const s = zahlen.filter((z) => Number.isFinite(z)).sort((a, b) => a - b);
    if (!s.length) return 0;
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  // Gewinn nach EA-Steuer bei Kauf zu `kauf` und Verkauf zu `verkauf`.
  function gewinn(kauf, verkauf) {
    return Math.floor(verkauf * (1 - EA_STEUER)) - kauf;
  }

  // Kennzahlen aus dem Verlauf. null, wenn zu wenig Daten da sind.
  function signale(verlauf) {
    if (!Array.isArray(verlauf) || verlauf.length < MIN_PUNKTE) return null;
    const erster = verlauf[0][0];
    const letzter = verlauf[verlauf.length - 1];
    if (letzter[0] - erster < MIN_SPANNE_MS) return null;
    const preise = verlauf.map((p) => p[1]);
    const aktuell = letzter[1];
    // Der Median schliesst den aktuellen Punkt aus, sonst zieht ein Dip seinen
    // eigenen Vergleichswert nach unten.
    const vorher = preise.slice(0, -1);
    const med = median(vorher);
    if (!(med > 0)) return null;
    const abw = median(vorher.map((p) => Math.abs(p - med)));
    // Trend = letzter Schritt (positiv: steigt gerade). Ein einzelner Absturz
    // zaehlt NICHT als "faellt weiter": gerade der frische Dip ist der Einstieg.
    // Erst zwei Schritte in Folge nach unten heissen "faellt".
    const p1 = preise[preise.length - 1];
    const p2 = preise[preise.length - 2];
    const p3 = preise[preise.length - 3];
    const trend = p2 > 0 ? (p1 - p2) / p2 : 0;
    const faellt = p2 > 0 && p3 > 0 && (p1 - p2) / p2 < -0.01 && (p2 - p3) / p3 < -0.01;
    return {
      aktuell,
      median: med,
      dip: (med - aktuell) / med, // > 0: aktuell guenstiger als normal
      unruhe: abw / med, // Streuung um den Median
      trend,
      faellt,
      punkte: verlauf.length,
      spanneMin: Math.round((letzter[0] - erster) / 60000)
    };
  }

  // Bewertet ein Signal. Gibt null zurueck, wenn die Karte nicht taugt.
  function bewerte(s, opts) {
    if (!s) return null;
    const o = Object.assign({}, STANDARD, opts || {});
    if (s.unruhe > o.maxUnruhe) return null;
    const ziel = Math.floor(s.median * o.sicherheit);
    const g = gewinn(s.aktuell, ziel);
    const marge = s.aktuell > 0 ? g / s.aktuell : 0;
    if (g < o.minGewinn || marge < o.minMarge) return null;

    let art = null;
    let grund = "";
    if (s.dip >= o.minDip && s.dip <= o.maxDip) {
      art = "dip";
      grund = "Preis " + Math.round(s.dip * 100) + " % unter dem Normalpreis (Median " + s.median + ")";
      // Faellt der Preis gerade noch weiter, ist der Boden vermutlich nicht erreicht.
      if (s.faellt) {
        art = null;
      } else if (s.trend > 0.02) {
        grund += ", erholt sich schon";
      }
    } else if (s.dip < o.minDip && s.trend > 0.04) {
      // Preis steigt, aber der Zielpreis (Median) liegt noch klar darueber.
      art = "nachfrage";
      grund = "Preis steigt (+" + Math.round(s.trend * 100) + " %), Normalpreis " + s.median;
    }
    if (!art) return null;

    // Score: erwarteter Gewinn, gewichtet mit Verlaesslichkeit der Daten.
    const datenGewicht = Math.min(1, s.punkte / 24) * (1 - Math.min(1, s.unruhe / o.maxUnruhe) * 0.5);
    const score = Math.round(g * datenGewicht);
    return { art, score, kauf: s.aktuell, ziel, gewinn: g, marge, grund, punkte: s.punkte, spanneMin: s.spanneMin };
  }

  // Rangliste ueber alle Karten. `alle` = { key: verlauf }.
  function rangliste(alle, opts) {
    const treffer = [];
    for (const key of Object.keys(alle || {})) {
      const b = bewerte(signale(alle[key]), opts);
      if (b) treffer.push(Object.assign({ key }, b));
    }
    treffer.sort((a, b) => b.score - a.score);
    return treffer;
  }

  const api = {
    EA_STEUER, SLOT_MS, MAX_ALTER_MS, MAX_PUNKTE, MIN_PUNKTE, MIN_SPANNE_MS, MAX_KARTEN, STANDARD,
    verlaufEintragen, verlaufBegrenzen, median, gewinn, signale, bewerte, rangliste
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  root.FC27Markt = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
