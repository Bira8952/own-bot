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

  // 10000 -> "10.000" (fest deutsch, unabhaengig von der Browser-Sprache).
  function zahl(n) {
    return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
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
      grund = "Gerade " + Math.round(s.dip * 100) + " % unter dem üblichen Preis von " + zahl(s.median);
      // Faellt der Preis gerade noch weiter, ist der Boden vermutlich nicht erreicht.
      if (s.faellt) {
        art = null;
      } else if (s.trend > 0.02) {
        grund += ", erholt sich schon";
      }
    } else if (s.dip < o.minDip && s.trend > 0.04) {
      // Preis steigt, aber der Zielpreis (Median) liegt noch klar darueber.
      art = "nachfrage";
      grund = "Preis zieht an (+" + Math.round(s.trend * 100) + " %), üblich sind " + zahl(s.median);
    }
    if (!art) return null;

    // Score: erwarteter Gewinn, gewichtet mit Verlaesslichkeit der Daten.
    const datenGewicht = Math.min(1, s.punkte / 24) * (1 - Math.min(1, s.unruhe / o.maxUnruhe) * 0.5);
    const score = Math.round(g * datenGewicht);
    return { art, score, kauf: s.aktuell, ziel, gewinn: g, marge, grund, punkte: s.punkte, spanneMin: s.spanneMin };
  }

  // So alt darf der letzte Messpunkt hoechstens sein, damit eine Karte als
  // Chance gilt. Ein Dip von vor zwei Stunden ist laengst vorbei.
  const FRISCH_MS = 30 * 60 * 1000;

  // Rangliste ueber alle Karten. `alle` = { key: verlauf }.
  // opts.jetzt (ms) schaltet die Frische-Pruefung ein; ohne jetzt zaehlt alles.
  function rangliste(alle, opts) {
    const o = opts || {};
    const frischMs = o.frischMs > 0 ? o.frischMs : FRISCH_MS;
    const treffer = [];
    for (const key of Object.keys(alle || {})) {
      const verlauf = alle[key];
      const letzter = Array.isArray(verlauf) && verlauf.length ? verlauf[verlauf.length - 1][0] : 0;
      if (o.jetzt > 0 && o.jetzt - letzter > frischMs) continue;
      const b = bewerte(signale(verlauf), o);
      if (!b) continue;
      const alterMin = o.jetzt > 0 ? Math.max(0, Math.round((o.jetzt - letzter) / 60000)) : 0;
      // Eigene Vergangenheit der Karte (backtestAlle): Hat sie sich nach
      // frueheren Dips erholt, rueckt sie nach oben, sonst nach unten.
      // Ab 2 frueheren Signalen; (Treffer+1)/(Signale+2) ist ohne Daten 50 %.
      const q = o.quoten && o.quoten[key];
      if (q && q.signale >= 2) {
        b.quote = { signale: q.signale, treffer: q.treffer };
        b.score = Math.round(b.score * 2 * ((q.treffer + 1) / (q.signale + 2)));
      }
      treffer.push(Object.assign({ key, alterMin }, b));
    }
    treffer.sort((a, b) => b.score - a.score);
    return treffer;
  }

  // ---------------------------------------------------------------------------
  // Trefferquote (02.10.2026): Wie oft hat sich ein Dip-Signal ausgezahlt?
  //
  // Fuer jeden Punkt im gespeicherten Verlauf wird so getan, als waere er
  // "jetzt": Haette die Rangliste dort eine Dip-Chance gemeldet? Wenn ja,
  // zaehlt sie als Treffer, wenn der Preis danach innerhalb von 2 Stunden das
  // Ziel erreicht hat. Ein Signal, dessen 2 Stunden noch laufen, ist "offen"
  // und zaehlt nicht. Ein laufender Dip zaehlt nur einmal.
  // ---------------------------------------------------------------------------
  const ERHOL_MS = 2 * 60 * 60 * 1000;

  function backtest(verlauf, jetzt, opts) {
    const v = Array.isArray(verlauf) ? verlauf : [];
    const ergebnis = { signale: 0, treffer: 0, offen: 0, dauern: [] };
    let i = MIN_PUNKTE - 1;
    while (i < v.length) {
      const b = bewerte(signale(v.slice(0, i + 1)), opts);
      if (!b || b.art !== "dip") {
        i += 1;
        continue;
      }
      const start = v[i][0];
      let erholt = -1;
      for (let j = i + 1; j < v.length && v[j][0] - start <= ERHOL_MS; j++) {
        if (v[j][1] >= b.ziel) {
          erholt = j;
          break;
        }
      }
      if (erholt >= 0) {
        ergebnis.signale += 1;
        ergebnis.treffer += 1;
        ergebnis.dauern.push(Math.round((v[erholt][0] - start) / 60000));
        i = erholt + 1;
        continue;
      }
      const fensterEnde = start + ERHOL_MS;
      if (fensterEnde > (jetzt || 0)) {
        ergebnis.offen += 1;
        break; // alles danach liegt im selben, noch offenen Fenster
      }
      ergebnis.signale += 1;
      // Weiter erst nach dem Fenster - sonst zaehlt derselbe Dip mehrfach.
      while (i < v.length && v[i][0] <= fensterEnde) i += 1;
    }
    return ergebnis;
  }

  function backtestAlle(alle, jetzt, opts) {
    const jeKarte = {};
    const gesamt = { signale: 0, treffer: 0, offen: 0, quote: 0, dauerMin: 0 };
    const dauern = [];
    for (const key of Object.keys(alle || {})) {
      const r = backtest(alle[key], jetzt, opts);
      if (!r.signale && !r.offen) continue;
      jeKarte[key] = { signale: r.signale, treffer: r.treffer, offen: r.offen };
      gesamt.signale += r.signale;
      gesamt.treffer += r.treffer;
      gesamt.offen += r.offen;
      dauern.push(...r.dauern);
    }
    gesamt.quote = gesamt.signale ? gesamt.treffer / gesamt.signale : 0;
    gesamt.dauerMin = dauern.length ? Math.round(median(dauern)) : 0;
    return { gesamt, jeKarte };
  }

  // "204935:85:3" -> { playerId: 204935, rating: 85, rarity: "3" }. Muss zu
  // priceKey() in content.js passen. Die Kartenart kann fehlen ("") oder eine
  // Liste sein ("12,70").
  function keyTeilen(key) {
    const teile = String(key || "").split(":");
    const playerId = Math.floor(Number(teile[0]));
    if (!(playerId > 0)) return null;
    const rating = Math.floor(Number(teile[1])) || 0;
    const rarity = teile.length > 2 && /^\d+(,\d+)*$/.test(teile[2]) ? teile[2] : "";
    return { playerId, rating, rarity };
  }

  // Wie weit ist das Lernen? Fuer den leeren Zustand der Chancen-Ansicht:
  // karten = beobachtet, reif = genug Verlauf fuer eine Bewertung,
  // fortschritt = die am weitesten gelernte Karte (0..1).
  function datenStand(alle) {
    const keys = Object.keys(alle || {});
    let reif = 0;
    let fortschritt = 0;
    for (const key of keys) {
      const v = alle[key];
      if (!Array.isArray(v) || !v.length) continue;
      if (signale(v)) {
        reif += 1;
        fortschritt = 1;
        continue;
      }
      const spanne = v[v.length - 1][0] - v[0][0];
      const anteil = Math.min(v.length / MIN_PUNKTE, spanne / MIN_SPANNE_MS, 1);
      if (anteil > fortschritt) fortschritt = anteil;
    }
    return { karten: keys.length, reif, fortschritt };
  }

  // Punkte fuer eine kleine Verlaufslinie (SVG polyline), Breite x Hoehe.
  // Billig = unten, teuer = oben.
  function sparkPunkte(verlauf, breite, hoehe) {
    if (!Array.isArray(verlauf) || verlauf.length < 2) return "";
    const b = breite > 0 ? breite : 100;
    const h = hoehe > 0 ? hoehe : 30;
    const t0 = verlauf[0][0];
    const t1 = verlauf[verlauf.length - 1][0];
    const preise = verlauf.map((p) => p[1]);
    const lo = Math.min(...preise);
    const hi = Math.max(...preise);
    return verlauf
      .map((p) => {
        const x = t1 === t0 ? b / 2 : ((p[0] - t0) / (t1 - t0)) * b;
        const y = hi === lo ? h / 2 : h - 2 - ((p[1] - lo) / (hi - lo)) * (h - 4);
        return x.toFixed(1) + "," + y.toFixed(1);
      })
      .join(" ");
  }

  // ---------------------------------------------------------------------------
  // Verkaufserkennung (02.10.2026)
  //
  // Auf dem FUT-Markt laesst sich ein laufendes Angebot nicht zurueckziehen.
  // Fehlt ein Angebot vor seinem Ablauf in einer Antwort, die es zeigen
  // MUESSTE, wurde es gekauft. "Muesste" heisst: erste Seite, nicht voll (EA
  // hat also alles geliefert), gleicher Spieler, Preis im gesuchten Fenster,
  // Kartenart und Rating passen. Alles andere belegt nichts.
  // ---------------------------------------------------------------------------
  const ABLAUF_PUFFER_MS = 10000; // knapp vor dem Ablauf zaehlt das Fehlen nicht
  const BEOBACHTET_MAX = 4000;
  const VERKAUF_MAX_ALTER_MS = 24 * 60 * 60 * 1000;
  const VERKAUF_MAX_JE_KARTE = 200;
  const VERKAUF_MAX_KARTEN = 500;

  // beobachtet: Map tradeId -> { key, playerId, rarity, rating, preis, endetAt }
  // anfrage: { playerId, rarities: [..] | null, ovrMin, ovrMax, minb, maxb, start, vollstaendig }
  // angebote: dieselbe Form wie in beobachtet, plus tradeId.
  // Gibt die erkannten Verkaeufe zurueck: [{ key, preis, t }]. beobachtet wird angepasst.
  function verkaeufeAbgleichen(beobachtet, anfrage, angebote, jetzt) {
    const verkauft = [];
    const liste = Array.isArray(angebote) ? angebote : [];
    const a = anfrage || {};
    if (a.vollstaendig && !(a.start > 0) && a.playerId > 0 && a.maxb > 0) {
      const da = new Set(liste.map((x) => String(x.tradeId)));
      for (const [id, x] of beobachtet) {
        if (da.has(id) || x.playerId !== a.playerId) continue;
        if (x.preis > a.maxb || x.preis < (a.minb || 0)) continue;
        if (Array.isArray(a.rarities) && a.rarities.length && !a.rarities.includes(x.rarity)) continue;
        if (a.ovrMin > 0 && x.rating < a.ovrMin) continue;
        if (a.ovrMax > 0 && x.rating > a.ovrMax) continue;
        beobachtet.delete(id);
        if (x.endetAt > jetzt + ABLAUF_PUFFER_MS) verkauft.push({ key: x.key, preis: x.preis, t: jetzt });
      }
    }
    for (const x of liste) {
      if (x && x.tradeId != null && x.preis > 0 && x.endetAt > jetzt) {
        const id = String(x.tradeId);
        beobachtet.delete(id); // neu einsortieren: Map behaelt die Reihenfolge des Einfuegens
        beobachtet.set(id, { key: x.key, playerId: x.playerId, rarity: x.rarity, rating: x.rating, preis: x.preis, endetAt: x.endetAt });
      }
    }
    for (const [id, x] of beobachtet) if (x.endetAt <= jetzt) beobachtet.delete(id);
    while (beobachtet.size > BEOBACHTET_MAX) beobachtet.delete(beobachtet.keys().next().value);
    return verkauft;
  }

  // Verkaeufe in den Speicher { key: [[t, preis], ...] } einsortieren und begrenzen.
  function verkaeufeEintragen(alle, neue, jetzt) {
    const out = {};
    const grenze = jetzt - VERKAUF_MAX_ALTER_MS;
    for (const key of Object.keys(alle || {})) {
      const v = (Array.isArray(alle[key]) ? alle[key] : []).filter((p) => Array.isArray(p) && p[0] > grenze);
      if (v.length) out[key] = v;
    }
    for (const n of neue || []) {
      if (!n || !n.key || !(n.preis > 0)) continue;
      const v = out[n.key] || (out[n.key] = []);
      v.push([n.t, n.preis]);
      if (v.length > VERKAUF_MAX_JE_KARTE) v.splice(0, v.length - VERKAUF_MAX_JE_KARTE);
    }
    const keys = Object.keys(out);
    if (keys.length > VERKAUF_MAX_KARTEN) {
      const letzte = (k) => out[k][out[k].length - 1][0];
      keys.sort((x, y) => letzte(y) - letzte(x));
      for (const k of keys.slice(VERKAUF_MAX_KARTEN)) delete out[k];
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Markt-Radar (02.10.2026): Kennzahlen je Karte und die Ranglisten.
  // ---------------------------------------------------------------------------
  const RADAR_FRISCH_MS = 60 * 60 * 1000; // Preis-Ranglisten: letzte Messung hoechstens 1 Std. alt
  const RADAR_VERKAUF_FENSTER_MS = 3 * 60 * 60 * 1000; // Bestseller: Verkaeufe der letzten 3 Std.
  const RADAR_MIN_PUNKTE = 4;
  const RADAR_SCHWELLE = 0.03; // ab 3 % Abweichung zaehlt eine Karte als guenstig / steigend / fallend

  // Preis aus dem Verlauf, der zum Zeitpunkt t galt (letzter Punkt davor).
  function preisUm(verlauf, t) {
    let preis = 0;
    for (const p of verlauf) {
      if (p[0] > t) break;
      preis = p[1];
    }
    return preis;
  }

  function radarKarte(verlauf, verkaeufe, jetzt) {
    const v = Array.isArray(verlauf) ? verlauf : [];
    const s = (Array.isArray(verkaeufe) ? verkaeufe : []).filter((p) => p[0] > jetzt - RADAR_VERKAUF_FENSTER_MS);
    const letzter = v.length ? v[v.length - 1] : null;
    const aktuell = letzter ? letzter[1] : 0;
    const vorher = v.slice(0, -1).map((p) => p[1]);
    const ueblich = vorher.length >= RADAR_MIN_PUNKTE - 1 ? median(vorher) : 0;
    const vorStunde = v.length >= 2 ? preisUm(v, jetzt - 60 * 60 * 1000) || v[0][1] : 0;
    const stundeVerkauft = s.filter((p) => p[0] > jetzt - 60 * 60 * 1000).length;
    return {
      aktuell,
      ueblich,
      abweichung: ueblich > 0 && aktuell > 0 ? (aktuell - ueblich) / ueblich : 0,
      aenderung: vorStunde > 0 && aktuell > 0 ? (aktuell - vorStunde) / vorStunde : 0,
      verkaeufe: s.length,
      verkaeufeStunde: Math.max(stundeVerkauft, Math.round((s.length / 3) * 10) / 10),
      verkaufsPreis: s.length ? Math.round(median(s.map((p) => p[1]))) : 0,
      punkte: v.length,
      gesehenAt: letzter ? letzter[0] : s.length ? s[s.length - 1][0] : 0
    };
  }

  // Ziel und Kaufpreis fuer einen Snipe auf diese Karte: verkauft wird zum
  // ueblichen Preis (oder dem echten Verkaufspreis, wenn der niedriger ist)
  // minus 3 % Sicherheit; gekauft hoechstens so, dass nach 5 % Gebuehr noch
  // mindestens minMarge und minGewinn bleiben - und nie ueber dem Preis von jetzt.
  function snipePlan(k, opts) {
    const o = Object.assign({}, STANDARD, opts || {});
    const basis = [k.ueblich, k.verkaufsPreis].filter((x) => x > 0);
    if (!basis.length) return null;
    const ziel = Math.floor(Math.min(...basis) * o.sicherheit);
    const netto = Math.floor(ziel * (1 - EA_STEUER));
    let kaufBis = Math.floor(Math.min(netto - o.minGewinn, netto / (1 + o.minMarge)));
    if (k.aktuell > 0) kaufBis = Math.min(kaufBis, k.aktuell);
    if (!(kaufBis > 0)) return null;
    return { ziel, kaufBis, gewinn: gewinn(kaufBis, ziel) };
  }

  // alleVerlauf: { key: [[t,p,n]] }, alleVerkaeufe: { key: [[t,p]] }.
  // Gibt { bestseller, guenstig, steigend, fallend } zurueck, je hoechstens opts.max (20).
  function radar(alleVerlauf, alleVerkaeufe, jetzt, opts) {
    const max = (opts && opts.max) || 20;
    const keys = new Set([...Object.keys(alleVerlauf || {}), ...Object.keys(alleVerkaeufe || {})]);
    const karten = [];
    for (const key of keys) {
      const k = radarKarte((alleVerlauf || {})[key], (alleVerkaeufe || {})[key], jetzt);
      karten.push(Object.assign({ key }, k));
    }
    const frisch = (k) => k.aktuell > 0 && k.gesehenAt > jetzt - RADAR_FRISCH_MS;
    const nimm = (liste, sortierung) => liste.sort(sortierung).slice(0, max);
    return {
      bestseller: nimm(karten.filter((k) => k.verkaeufe > 0), (a, b) => b.verkaeufe - a.verkaeufe || b.verkaufsPreis - a.verkaufsPreis),
      guenstig: nimm(karten.filter((k) => frisch(k) && k.punkte >= RADAR_MIN_PUNKTE && k.abweichung <= -RADAR_SCHWELLE), (a, b) => a.abweichung - b.abweichung),
      steigend: nimm(karten.filter((k) => frisch(k) && k.punkte >= 2 && k.aenderung >= RADAR_SCHWELLE), (a, b) => b.aenderung - a.aenderung),
      fallend: nimm(karten.filter((k) => frisch(k) && k.punkte >= 2 && k.aenderung <= -RADAR_SCHWELLE), (a, b) => a.aenderung - b.aenderung)
    };
  }

  const api = {
    EA_STEUER, SLOT_MS, MAX_ALTER_MS, MAX_PUNKTE, MIN_PUNKTE, MIN_SPANNE_MS, MAX_KARTEN, STANDARD, FRISCH_MS,
    verlaufEintragen, verlaufBegrenzen, median, gewinn, signale, bewerte, rangliste, keyTeilen, datenStand, sparkPunkte,
    ABLAUF_PUFFER_MS, BEOBACHTET_MAX, RADAR_FRISCH_MS, verkaeufeAbgleichen, verkaeufeEintragen, radarKarte, snipePlan, radar,
    ERHOL_MS, backtest, backtestAlle
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  root.FC27Markt = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
