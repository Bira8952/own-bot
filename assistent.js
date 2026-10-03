// FC27 Own Bot – assistent.js
// Der gefuehrte Assistent: uebersetzt den Zustand des Bots in einfache Saetze
// mit hoechstens zwei Knoepfen zur Loesung.
//
// Reine Funktionen ohne chrome.* und ohne DOM, damit sie sich in Node testen
// lassen. popup.js sammelt den Zustand ein (assistentZustand), ruft lage() auf
// und zeichnet das Ergebnis. Was ein Knopf tut, entscheidet popup.js anhand der id.
//
// Grundsatz: Jeder Hinweis sagt in Alltagssprache, WAS los ist und WAS man
// tun kann. Fehlercodes stehen hoechstens in Klammern dahinter.
(function (root) {
  "use strict";

  // EA-Fehler in Alltagssprache. aktion: Knopf, der wirklich hilft (oder null).
  const CODES = {
    401: { text: "EA hat deine Anmeldung vergessen. Lade die Web App neu (F5).", aktion: "neuladen" },
    426: { text: "EA hat einen Kauf abgelehnt. Das kam schon einmal direkt vor einer Sperre – mach eine Pause.", aktion: null },
    429: { text: "EA meldet zu viele Anfragen. Das ist eine Warnung: Mach eine Pause, bevor du weitermachst.", aktion: null },
    458: { text: "EA will prüfen, ob du ein Mensch bist (Captcha). Löse es selbst in der Web App, dann geht es weiter.", aktion: null },
    461: { text: "EA hat eine Aktion verweigert. Lade die Web App neu und mach eine längere Pause.", aktion: "neuladen" },
    465: { text: "EA kennt deine Sitzung nicht mehr. Lade die Web App neu (F5).", aktion: "neuladen" },
    468: { text: "Du bist auf der Konsole angemeldet – dann beendet EA die Web-Sitzung. Melde dich dort ab und lade die Web App neu.", aktion: "neuladen" },
    470: { text: "Für diesen Kauf reichen deine Coins nicht.", aktion: "kaeufe" },
    473: { text: "Deine Transferliste oder dein Verein ist voll. Räume auf, dann kann der Bot weiterkaufen.", aktion: "kaeufe" },
    494: { text: "Der Transfermarkt ist für dein Konto gesperrt. Das kann der Bot nicht lösen – meist hilft nur Warten.", aktion: null },
    512: { text: "EA bremst gerade (zu viele Anfragen). Mach mindestens eine Stunde Pause.", aktion: null },
    521: { text: "EA bremst gerade (zu viele Anfragen). Mach mindestens eine Stunde Pause.", aktion: null },
    20000: { text: "EA meldet: Dein Konto ist gesperrt.", aktion: null },
    20001: { text: "EA verlangt eine neue Version der Web App. Lade die Seite neu.", aktion: "neuladen" }
  };
  CODES[474] = CODES[468];

  // Woertliche Kennungen, falls in der Meldung keine Zahl steht.
  const KENNUNGEN = [
    [/captcha|verifizierung/i, 458],
    [/PERMISSION_DENIED/, 461],
    [/NOT_ENOUGH_CREDIT|genug coins/i, 470],
    [/DESTINATION_FULL|transferliste (ist )?voll/i, 473],
    [/LOCKED_TRANSFER_MARKET/, 494],
    [/NO_USER|sitzung ungültig/i, 401],
    [/UPDATE_REQUIRED/, 20001],
    [/ACCOUNT_BANNED/, 20000],
    [/konsole/i, 468],
    [/zu viele anfragen/i, 429]
  ];

  const AKTION_TEXT = {
    neuladen: "Seite neu laden",
    kaeufe: "Zur Transferliste",
    webapp: "Web App öffnen",
    stopp: "Stoppen",
    chancen: "Chancen ansehen",
    bestseller: "Bestseller ansehen",
    snipen: "Spieler wählen",
    scan: "Markt scannen"
  };

  function zahl(n) {
    const wert = Math.round(Number(n) || 0);
    const text = String(Math.abs(wert)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (wert < 0 ? "-" : "") + text;
  }

  function aktion(id, label) {
    return { id, label: label || AKTION_TEXT[id] || id };
  }

  // Sucht in einer Meldung des Bots den EA-Code. 0 = keiner erkannt.
  function codeAus(text) {
    const s = String(text || "");
    const m = /(?:HTTP|Code|Fehler)\s*(\d{3,5})\b/i.exec(s);
    if (m && CODES[Number(m[1])]) return Number(m[1]);
    for (const [muster, code] of KENNUNGEN) if (muster.test(s)) return code;
    return 0;
  }

  // Eine Meldung in Klartext. Unbekanntes bleibt woertlich stehen - lieber
  // die echte Meldung als eine geratene Erklaerung.
  function klartext(text) {
    const code = codeAus(text);
    if (code) return { code, text: CODES[code].text, aktion: CODES[code].aktion };
    const roh = String(text || "").trim();
    return { code: 0, text: roh || "Der Bot hat ohne Angabe eines Grundes gestoppt.", aktion: null };
  }

  // Wie lange ein Stopp-Grund noch gezeigt wird.
  const STOPP_ZEIGEN_MS = 30 * 60 * 1000;
  // Ab so vielen Suchen pro Stunde warnt der Assistent (ohne eigene Grenzen).
  // Zum Vergleich: EA sperrte dieses Konto am 21.09. schon bei ~450 am Tag.
  const VIELE_SUCHEN_STUNDE = 300;

  // Die ganze Lage als Liste, wichtigstes zuerst. Jeder Eintrag:
  // { id, ton: "stopp" | "achtung" | "gut" | "info", titel, text, aktionen: [] }
  function lage(z) {
    const s = z || {};
    const jetzt = Number(s.jetzt) || Date.now();
    const liste = [];
    const add = (id, ton, titel, text, aktionen, extra) =>
      liste.push(Object.assign({ id, ton, titel, text, aktionen: (aktionen || []).filter(Boolean) }, extra || {}));

    if (!s.verbunden) {
      add("verbindung", "stopp", "Keine Verbindung zur Web App",
        s.imEigenenFenster
          ? "Öffne die EA Web App in einem Tab und melde dich an. Der Bot verbindet sich dann von selbst."
          : "Lade die Web App neu (F5) und warte, bis sie ganz geladen ist.",
        [aktion(s.imEigenenFenster ? "webapp" : "neuladen")]);
      return liste; // ohne Verbindung ist alles andere zweitrangig
    }

    if (!s.session) {
      add("session", "achtung", "Fast startklar",
        "Öffne in der Web App einmal den Transfermarkt. Dann kann der Bot suchen.");
    }

    if (s.cooldownMin > 0) {
      const k = klartext(s.cooldownGrund);
      add("pause", "stopp", "Pause nach EA-Warnung – noch " + Math.ceil(s.cooldownMin) + " Min.",
        k.text + " Sofort weiterzumachen ist der häufigste Grund für eine Sperre.");
    }

    if (s.fremderBot) {
      add("fremd", "achtung", "Ein anderer Bot ist aktiv",
        "Schalte andere Trading-Erweiterungen aus. Zwei Bots suchen doppelt so oft – das fällt EA schneller auf.");
    }

    if (s.andererTab) {
      add("tab", "info", "Der Bot läuft in einem anderen Tab", "Bediene ihn dort oder schließe den anderen Tab.");
    }

    if (s.laeuft && s.ohneGrenzen && s.suchenStunde >= VIELE_SUCHEN_STUNDE) {
      add("risiko", "achtung", "Sehr viele Suchen (" + zahl(s.suchenStunde) + " in dieser Stunde)",
        "Viele Suchen am Stück sind der häufigste Grund für EA-Sperren. 15 bis 30 Minuten Pause senken das Risiko.",
        [aktion("stopp", "Pause machen")]);
    }

    if (s.laeuft) {
      add("laeuft", "gut", "Der Bot arbeitet",
        zahl(s.gekauft) + " gekauft · " + zahl(s.ausgegeben) + " Coins ausgegeben. Du kannst zusehen – oder jederzeit stoppen.",
        [aktion("stopp")]);
    }

    if (s.transfer >= 100) {
      add("transfer-voll", "stopp", "Transferliste voll",
        "Der Bot kann nichts mehr kaufen, bis wieder Platz ist. Räume verkaufte Karten ab oder stelle Karten ein.",
        [aktion("kaeufe", "Transferliste öffnen")]);
    } else if (s.transfer >= 90) {
      add("transfer-fast", "achtung", "Transferliste fast voll (" + s.transfer + " von 100)",
        "Räume verkaufte Karten ab, bevor der Bot stoppen muss.", [aktion("kaeufe", "Transferliste öffnen")]);
    }

    if (s.nichtZugewiesen > 4 && !s.nzUnbegrenzt) {
      add("nicht-zugewiesen", "achtung", s.nichtZugewiesen + " Karten warten auf dich",
        "Sie liegen in der Web App unter „Nicht zugewiesen“. Verschiebe sie dort – sonst stoppt der Bot beim nächsten Kauf.");
    }

    const stopp = s.letzterStopp;
    if (!s.laeuft && stopp && Number(stopp.t) > jetzt - STOPP_ZEIGEN_MS && !(s.cooldownMin > 0)) {
      if (stopp.level === "error" || stopp.level === "warn") {
        const k = klartext(stopp.message);
        add("stopp-grund", stopp.level === "error" ? "stopp" : "achtung", "Warum der Bot aufgehört hat", k.text,
          [k.aktion ? aktion(k.aktion) : null]);
      } else if (stopp.level === "done") {
        add("fertig", "gut", "Lauf fertig", String(stopp.message || "Der Lauf ist zu Ende."), [aktion("kaeufe", "Käufe ansehen")]);
      }
    }

    if (s.coins != null && s.ziele > 0 && s.billigstesZiel > 0 && s.coins < s.billigstesZiel) {
      add("coins", "achtung", "Zu wenig Coins",
        "Du hast " + zahl(s.coins) + " Coins, dein günstigstes Ziel kostet " + zahl(s.billigstesZiel) +
        ". Verkaufe zuerst Karten oder senke den Zielpreis.", [aktion("kaeufe", "Zu den Verkäufen")]);
    }

    // Einen Markt-Scan nur anbieten, wenn er auch erlaubt und sinnvoll ist:
    // nie waehrend einer EA-Pause, nie ohne Sitzung, nie im laufenden Lauf.
    const scanOk = !s.laeuft && s.session && !(s.cooldownMin > 0);
    const chancen = Array.isArray(s.chancen) ? s.chancen : [];
    if (chancen.length) {
      const b = chancen[0];
      add("chancen", "gut", chancen.length === 1 ? "1 Chance gefunden" : chancen.length + " Chancen gefunden",
        "Beste: " + b.name + " – kaufen bis " + zahl(b.kaufBis) + ", Ziel " + zahl(b.ziel) +
        ", etwa +" + zahl(b.gewinn) + " Coins.", [aktion("chancen")]);
    }

    const bestseller = Array.isArray(s.bestseller) ? s.bestseller : [];
    if (!chancen.length && bestseller.length) {
      const b = bestseller[0];
      add("bestseller", "info", "Gerade gefragt: " + b.name,
        b.name + " wurde in den letzten 3 Stunden " + zahl(b.verkaeufe) + "-mal verkauft" +
        (b.verkaufsPreis > 0 ? ", meist für etwa " + zahl(b.verkaufsPreis) + " Coins" : "") + ".",
        [aktion("bestseller")]);
    }

    if (!s.laeuft && !(s.ziele > 0)) {
      add("start", "info", "Was möchtest du tun?",
        chancen.length
          ? "Nimm eine Chance auf deine Liste – oder wähle selbst einen Spieler."
          : "Wähle unter Snipen einen Spieler. Oder scanne den Markt: Dann sucht der Bot selbst nach günstigen Karten.",
        [aktion(chancen.length ? "chancen" : "snipen"), chancen.length ? aktion("snipen") : scanOk ? aktion("scan") : null]);
    }

    const daten = s.daten || {};
    if (!chancen.length && !(daten.reif > 0)) {
      add("lernen", "info", "Ich lerne gerade die Preise",
        (daten.karten === 1 ? "1 Karte beobachtet. " : daten.karten > 1 ? zahl(daten.karten) + " Karten beobachtet. " : "") +
        "Nach etwa einer Stunde mit Suchen erkenne ich Chancen. Ein Markt-Scan füllt den Verlauf schneller und kauft nichts.",
        [scanOk ? aktion("scan") : null], { fortschritt: Math.max(0, Math.min(1, Number(daten.fortschritt) || 0)) });
    }

    if (!s.laeuft && s.ziele > 0 && !liste.some((h) => h.ton === "stopp")) {
      add("bereit", "gut", "Bereit zum Start",
        (s.ziele === 1 ? "1 Spieler" : s.ziele + " Spieler") + " auf deiner Liste. Starte unter Snipen.",
        [aktion("snipen", "Zum Start")]);
    }

    return liste;
  }

  const api = { CODES, codeAus, klartext, lage, zahl, STOPP_ZEIGEN_MS, VIELE_SUCHEN_STUNDE };
  if (typeof module === "object" && module.exports) module.exports = api;
  root.FC27Assistent = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
