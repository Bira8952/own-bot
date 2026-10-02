// FC27 Own Bot – sniffer.js
// Laeuft in der Seite (MAIN world), bevor die Web App laedt, und liest nur mit:
// 1. X-UT-SID-Header und API-Adresse der Requests an https://*.ea.com/ut/game/...
// 2. Die Spielerliste (player*.json), die die Web App fuer ihre Namenssuche laedt.
// Die Requests und Antworten der Web App selbst bleiben unveraendert.
(function () {
  "use strict";

  // Zahl statt Boolean, genau wie in content.js: Nach einem Update der
  // Erweiterung wird diese Datei in eine Seite nachgeladen, in der noch eine
  // aeltere Fassung laeuft. Mit einem Boolean waere die neue Fassung hier
  // sofort wieder ausgestiegen und die alte haette ohne die neuen Funktionen
  // weitergemacht - genau so ist die Schnittstellen-Diagnose ins Leere gelaufen.
  const SNIFFER_VERSION = 22; // 5: Verkaufen, 6: Usage Sharing, 7: Suchweg "app", 8: Stapel, 9: Einstellen nach dem Kauf, 10: Suchseite, 11: Muenzstand, 12: Kartenart aus der Suchmaske, 13: Auswahllisten der Suchmaske (24.09.2026), 14: Muenzstand aus {type, amount}, Abraeumen ueber removeSold, echte Fehlertexte (25.09.2026), 15: Seitenzaehler in einer Rechnung, Marktsuche am Namen erkannt, aus der Maske nur noch die Sortierung (25.09.2026), 16: Beobachtungsliste aufraeumen, Kontouebersicht mitlesen, "Nicht zugewiesen" ueber FSTs Weg (25.09.2026), 17: EA-Preisspanne aus dem Speicher, Transferliste als veraltet melden, Festpreis beim Einstellen (27.09.2026), 18: Chemie (playStyle) der eigenen Karten in der Transferliste (28.09.2026), 19: Abraeumen - gezielt FSTs Weg (_clearSold) auf Anforderung, Ergebnis "blind" (28.09.2026), 20: "Nicht zugewiesen" leeren und zuruecksetzen (28.09.2026), 21: mehrere Kartenarten aus EAs Suchmaske als Kommaliste (28.09.2026), 22: Transferliste voll nur mit geladener Stapelgroesse, tradeOwner im App-Weg (02.10.2026)
  const previous = Number(window.__fc27OwnBotSnifferLoaded);
  if (previous >= SNIFFER_VERSION) return;
  // Eine aeltere Fassung hat XMLHttpRequest und fetch bereits umgebogen. Ihre
  // Meldungen sind unveraendert gueltig, deshalb wird nicht doppelt umgebogen.
  const alreadyHooked = previous > 0;

  const API_RE = /^(https:\/\/[a-z0-9.-]+\.ea\.com\/ut\/game\/[a-z0-9]+)(?:[/?#]|$)/i;
  const PLAYERS_RE = /^https:\/\/[a-z0-9.-]+\.ea\.com\/[^?#]*player[^/?#]*\.json(?:[?#]|$)/i;
  // EAs eigene Kontouebersicht (25.09.2026). Die Web App holt sie beim
  // Anmelden von sich aus - wir hoeren nur mit und fragen NIE selbst nach.
  const MASSINFO_RE = /^https:\/\/[a-z0-9.-]+\.ea\.com\/ut\/game\/[a-z0-9]+\/usermassinfo(?:[/?#]|$)/i;
  let last = { sid: null, base: null };
  let players = null; // { url, raw } der zuletzt gesehenen Spielerliste

  function post(message) {
    window.postMessage(message, window.location.origin);
  }

  function absolute(url) {
    try {
      return new URL(String(url), window.location.href).href;
    } catch (e) {
      return "";
    }
  }

  function reportSession() {
    post({ __ownbot: "session", sid: last.sid, base: last.base });
  }

  function reportPlayers() {
    post({ __ownbot: "players", url: players.url, raw: players.raw });
  }

  // EA schreibt die jeweils aktuelle Inhalts-ID und das Spieljahr beim Laden
  // direkt in die Seite. Daraus entsteht die gueltige Portrait-Adresse.
  function reportImages() {
    try {
      const root = String(window.fut_resourceRoot || "");
      const base = String(window.fut_resourceBase || "");
      const guid = String(window.fut_guid || "");
      const year = String(window.fut_year || "");
      if (!/^https:\/\/[a-z0-9.-]+\.ea\.com$/i.test(root)) return;
      if (!/^\/[a-z0-9/_-]+\/content\/$/i.test(base)) return;
      if (!/^[a-z0-9-]{16,}$/i.test(guid) || !/^20\d{2}$/.test(year)) return;
      const prefix = new URL(base + guid + "/" + year + "/fut/items/images/mobile/portraits/", root).href;
      post({ __ownbot: "images", prefix, suffix: ".png" });
    } catch (e) {}
  }

  // Die Preisstufen des Transfermarkts stehen in der Web App. Sie selbst
  // hinzuschreiben hiesse raten - aendert EA sie, wuerde der Bot still auf
  // ungueltige Preise runden und jedes Gebot abgelehnt bekommen.
  function reportPriceTiers() {
    try {
      const control = window.UTCurrencyInputControl;
      const tiers = control && control.PRICE_TIERS;
      if (!Array.isArray(tiers) || !tiers.length) return;
      post({
        __ownbot: "priceTiers",
        tiers: tiers.slice(0, 20).map((t) => ({ min: Number(t && t.min), inc: Number(t && t.inc) }))
      });
    } catch (e) {}
  }

  function noteSession(url, sid) {
    if (!sid) return;
    const match = API_RE.exec(url);
    if (!match) return;
    const value = String(sid);
    if (value === last.sid && match[1] === last.base) return;
    last = { sid: value, base: match[1] };
    reportSession();
  }

  function notePlayers(url, raw) {
    if (raw == null || raw === "") return;
    players = { url, raw };
    reportPlayers();
  }

  // --- XMLHttpRequest und fetch ---
  const xhrOpen = XMLHttpRequest.prototype.open;
  const xhrSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  const pageFetch = window.fetch;

  // Aus EAs Kontouebersicht nur wenige, fest benannte Felder mitnehmen - alles
  // andere wird weggeworfen. Die Antwort selbst bleibt unveraendert; die Web
  // App bekommt genau das, was EA geschickt hat (25.09.2026).
  //
  // Wichtig ist unassignedPileSize: EAs eigene Zahl fuer "Nicht zugewiesen".
  // Sie fuellt die Luecke direkt nach dem Anmelden, bevor der Speicher der App
  // etwas hergibt. Vorbild FST (scripts.js Z. 59427-59452) - anders als FST
  // geht davon nichts an irgendeinen fremden Server.
  function noteKonto(raw) {
    try {
      const daten = typeof raw === "string" ? JSON.parse(raw) : raw;
      const info = daten && daten.userInfo;
      if (!info || typeof info !== "object") return;
      const kader = [];
      const spieler = daten.squad && Array.isArray(daten.squad.players) ? daten.squad.players : [];
      for (const s of spieler.slice(0, 30)) {
        const nr = Number(lies(() => s.itemData.resourceId)) || 0;
        if (nr > 0) kader.push(nr);
      }
      post({
        __ownbot: "konto",
        nichtZugewiesen: Number(info.unassignedPileSize),
        vereinsName: String(info.clubName || "").slice(0, 60),
        spielerName: String(info.personaName || "").slice(0, 60),
        kader
      });
    } catch (e) {}
  }

  function onXhrLoad() {
    try {
      if (this.status !== 200) return;
      const url = absolute(this.__ownbotUrl);
      // Mitlesen, nicht anfragen: beides sind Antworten auf Anfragen, die die
      // Web App von sich aus gestellt hat (25.09.2026).
      if (MASSINFO_RE.test(url)) {
        if (this.responseType === "json") noteKonto(this.response);
        else if (this.responseType === "" || this.responseType === "text") noteKonto(this.responseText);
        return;
      }
      if (!PLAYERS_RE.test(url)) return;
      if (this.responseType === "json") notePlayers(url, this.response);
      else if (this.responseType === "" || this.responseType === "text") notePlayers(url, this.responseText);
    } catch (e) {}
  }

  if (!alreadyHooked) {
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__ownbotUrl = url;
      if (!this.__ownbotHooked) {
        this.__ownbotHooked = true;
        this.addEventListener("load", onXhrLoad);
      }
      return xhrOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
      try {
        if (String(name).toLowerCase() === "x-ut-sid") noteSession(absolute(this.__ownbotUrl), value);
      } catch (e) {}
      return xhrSetRequestHeader.apply(this, arguments);
    };

    window.fetch = function (input, init) {
      let url = "";
      try {
        url = absolute(typeof input === "string" ? input : input && input.url ? input.url : input);
        const source = init && init.headers ? init.headers : input instanceof Request ? input.headers : undefined;
        noteSession(url, new Headers(source).get("X-UT-SID"));
      } catch (e) {}

      const result = pageFetch.apply(this, arguments);
      if (PLAYERS_RE.test(url) && result && typeof result.then === "function") {
        result.then(
          (res) => {
            try {
              if (res && res.ok) res.clone().text().then((text) => notePlayers(url, text), () => {});
            } catch (e) {}
          },
          () => {}
        );
      }
      return result;
    };
  }

  // --- Diagnose der Web-App-Schnittstelle ---------------------------------
  // Sieht nach, welche Dienste die Web App bereitstellt. Es wird ausschliesslich
  // GESCHAUT, niemals aufgerufen: jeder Aufruf waere eine echte EA-Anfrage und
  // wuerde gegen die Schutzlimits zaehlen.
  const PROBE_SERVICES = [
    "Item.searchTransferMarket",
    "Item.clearTransferMarketCache",
    "Item.bid",
    "Item.list",
    "Item.move",
    "Item.discard",
    "Item.untarget",
    "Item.requestWatchedItems",
    "Item.requestTransferItems",
    "Item.requestUnassignedItems",
    "Item.clearSoldItems",
    "Item.relistExpiredAuctions",
    "Item.refreshAuctions",
    "User.getUser",
    "User.requestCurrencies",
    "Club.search",
    "Notification.queue",
    "Localization.localize"
  ];

  function probeService(path) {
    try {
      if (!window.services) return { found: false };
      const parts = String(path).split(".");
      const group = window.services[parts[0]];
      if (!group) return { found: false };
      const fn = group[parts[1]];
      if (typeof fn !== "function") return { found: false };
      return { found: true, args: Number(fn.length) || 0 };
    } catch (e) {
      return { found: false };
    }
  }

  // Enums der Web App bilden Name auf Zahl ab. Genau diese Zahlen braucht der
  // Bot, um Antworten von EA zu deuten, statt sie zu raten.
  function safeCodes(value, limit) {
    const out = {};
    let n = 0;
    try {
      for (const key in value) {
        if (n >= limit) break;
        if (!/^[A-Za-z_][A-Za-z0-9_]{0,40}$/.test(key)) continue;
        // Bewusst kein Number(): null und "" wuerden sonst stillschweigend zu 0.
        const num = value[key];
        if (typeof num !== "number" || !Number.isFinite(num)) continue;
        out[key] = num;
        n += 1;
      }
    } catch (e) {}
    return out;
  }

  function safeKeys(value, limit) {
    const out = [];
    try {
      for (const key in value) {
        if (out.length >= limit) break;
        if (/^[A-Za-z_][A-Za-z0-9_]{0,40}$/.test(key)) out.push(key);
      }
    } catch (e) {}
    return out;
  }

  // Erzeugt nur ein leeres Kriterien-Objekt, um seine Felder zu lesen.
  // Das loest keine Anfrage aus.
  function probeCriteriaFields() {
    try {
      if (typeof window.UTSearchCriteriaDTO !== "function") return null;
      return safeKeys(new window.UTSearchCriteriaDTO(), 60);
    } catch (e) {
      return null;
    }
  }

  function reportProbe() {
    const services = {};
    for (const path of PROBE_SERVICES) services[path] = probeService(path);
    post({
      __ownbot: "probe",
      at: Date.now(),
      globals: {
        services: Boolean(window.services),
        repositories: Boolean(window.repositories),
        appMain: Boolean(window._appMain),
        rootViewController: Boolean(window._appMain && window._appMain._rootViewController),
        ItemPile: Boolean(window.ItemPile),
        UtasErrorCode: Boolean(window.UtasErrorCode),
        UTSearchCriteriaDTO: typeof window.UTSearchCriteriaDTO === "function",
        // FSTs Abraeum-Weg (27.09.2026). Nur nachgeschaut, nie aufgerufen -
        // das kostet keine EA-Anfrage. So weiss man VOR dem Live-Test, ob der
        // Weg in dieser EA-Fassung ueberhaupt da ist.
        UTTransferListViewController: Boolean(transferListViewClass())
      },
      itemPile: window.ItemPile ? safeKeys(window.ItemPile, 20) : null,
      // Benannte Fehlercodes der Web App samt Zahl - besser als geraten.
      errorCodes: window.UtasErrorCode ? safeCodes(window.UtasErrorCode, 60) : null,
      criteria: probeCriteriaFields(),
      services
    });
  }

  // --- Beobachtungsliste ---------------------------------------------------
  // Der einzige zuverlaessige Weg, den Ausgang eines Gebots zu erfahren:
  // Suchtreffer zeigen nur laufende Auktionen, eine gewonnene Auktion taucht
  // dort nie wieder auf. Hier wird - anders als bei der Diagnose - ein Dienst
  // der Web App wirklich aufgerufen. Das ist eine echte EA-Anfrage, deshalb
  // fragt content.js nur nach, wenn ein Gebot auf seinen Ausgang wartet.
  function auctionOf(item) {
    try {
      if (item && item._auction) return item._auction;
      if (item && typeof item.getAuctionData === "function") return item.getAuctionData() || {};
    } catch (e) {}
    return {};
  }

  // Die Karten selbst merken (25.09.2026). services.Item.untarget braucht die
  // echten Objekte aus EAs Antwort - eine Abschrift reicht dort nicht. Wie bei
  // APP_ANGEBOTE liegt die Liste nur im Arbeitsspeicher und wird bei jedem
  // Lesen neu gesetzt.
  const WATCH_KARTEN = new Map(); // tradeId -> Karte der Web App

  function summarizeWatched(item) {
    const a = auctionOf(item);
    // EAs eigene Ja/Nein-Antworten mitnehmen (25.09.2026). Aus tradeState und
    // bidState laesst sich nur raten, ob eine Auktion abgelaufen oder verloren
    // ist. EA weiss es selbst - und nur damit darf aufgeraeumt werden, sonst
    // nehmen wir versehentlich eine gewonnene Karte von der Liste.
    // Kein stiller Verlust: sagt EA nichts dazu, bleibt der Wert null.
    const daten = lies(() => (typeof item.getAuctionData === "function" ? item.getAuctionData() : null));
    const frage = (name) => {
      if (!daten || typeof daten[name] !== "function") return null;
      const wert = lies(() => daten[name]());
      return typeof wert === "boolean" ? wert : null;
    };
    return {
      tradeId: a.tradeId == null ? "" : String(a.tradeId),
      tradeState: String(a.tradeState || "").slice(0, 32),
      bidState: String(a.bidState || "").slice(0, 32),
      currentBid: Number(a.currentBid) || 0,
      itemId: a.itemData && a.itemData.id != null ? String(a.itemData.id).slice(0, 32) : "",
      abgelaufen: frage("isExpired"),
      beendet: frage("isClosedTrade"),
      gewonnen: frage("isWon")
    };
  }

  // Einmal lesen. Das ist die eine echte EA-Anfrage, die content.js vorher
  // auf das Limit gebucht hat.
  function watchlistLesen(fail, weiter) {
    const dienst = window.services && window.services.Item;
    if (!dienst || typeof dienst.requestWatchedItems !== "function") return fail("kein Dienst");
    // Zwischenspeicher leeren wie FST (scripts.js Z. 46734). Das ist selbst
    // keine Anfrage, verhindert aber, dass die App eine alte Antwort von
    // vorhin noch einmal ausliefert.
    if (typeof dienst.clearTransferMarketCache === "function") lies(() => dienst.clearTransferMarketCache());
    let observable;
    try {
      observable = dienst.requestWatchedItems();
    } catch (e) {
      return fail("Aufruf fehlgeschlagen: " + kurz(e));
    }
    if (!observable || typeof observable.observe !== "function") return fail("unerwartete Antwort");
    try {
      observable.observe({}, function (sender, response) {
        try {
          if (!response || response.success === false) return fail("EA hat abgelehnt (" + statusVon(response) + ")");
          const data = response.data || response.response || {};
          weiter(Array.isArray(data.items) ? data.items : []);
        } catch (e) {
          fail("Antwort unlesbar: " + kurz(e));
        }
      });
    } catch (e) {
      fail("Beobachten fehlgeschlagen: " + kurz(e));
    }
  }

  function watchlistSenden(requestId, items) {
    const liste = items.slice(0, 200);
    WATCH_KARTEN.clear();
    for (const karte of liste) {
      const id = String(auctionOf(karte).tradeId || "");
      if (id) WATCH_KARTEN.set(id, karte);
    }
    post({ __ownbot: "watchlist", requestId, items: liste.map(summarizeWatched) });
  }

  function reportWatchlist(requestId, auffrischen) {
    const fail = (reason) => post({ __ownbot: "watchlist", requestId, error: reason });
    watchlistLesen(fail, function (items) {
      // Ohne ausdruecklichen Auftrag bleibt es bei dieser einen Anfrage.
      if (!auffrischen) return watchlistSenden(requestId, items);
      // Auffrischen wie FST (scripts.js Z. 46741): nur die Auktionen, die EA
      // noch als laufend meldet. content.js fragt das nur, wenn ein Gebot laut
      // Uhr laengst vorbei ist, und hat dafuer zwei weitere Anfragen gebucht.
      const offen = items.filter((karte) => {
        const a = auctionOf(karte);
        return Boolean(a.tradeState) && String(a.tradeState) !== "closed";
      });
      const dienst = window.services && window.services.Item;
      // Kein stiller Verlust: geht das Auffrischen nicht, gilt der erste Stand.
      if (!offen.length || !dienst || typeof dienst.refreshAuctions !== "function") return watchlistSenden(requestId, items);
      let observable;
      try {
        observable = dienst.refreshAuctions(offen);
      } catch (e) {
        return watchlistSenden(requestId, items);
      }
      if (!observable || typeof observable.observe !== "function") return watchlistSenden(requestId, items);
      try {
        observable.observe({}, function () {
          watchlistLesen(
            () => watchlistSenden(requestId, items),
            (frisch) => watchlistSenden(requestId, frisch.length ? frisch : items)
          );
        });
      } catch (e) {
        watchlistSenden(requestId, items);
      }
    });
  }

  // Erledigte Karten wieder von der Beobachtungsliste nehmen (25.09.2026).
  // EAs Liste hat eine feste Obergrenze. Ist sie voll, lehnt EA jedes weitere
  // Gebot ab - und lauter abgelehnte Anfragen sind genau der Weg in eine
  // Sperre. Vorbild FST (scripts.js Z. 46777-46793).
  // content.js schickt nur tradeIds; die Karten dazu liegen noch aus dem
  // letzten Lesen im Speicher.
  function watchlistAufraeumen(requestId, tradeIds) {
    const fail = (grund) => post({ __ownbot: "appAntwort", requestId, ok: false, status: 0, grund });
    const dienst = window.services && window.services.Item;
    if (!dienst || typeof dienst.untarget !== "function") return fail("kein Dienst");
    const ids = Array.isArray(tradeIds) ? tradeIds.slice(0, 50) : [];
    const liste = [];
    for (const id of ids) {
      const karte = WATCH_KARTEN.get(String(id));
      if (karte) liste.push(karte);
    }
    if (!liste.length) return fail("Karten nicht mehr im Speicher der App");
    let observable;
    try {
      observable = dienst.untarget(liste);
    } catch (e) {
      return fail("Aufruf fehlgeschlagen: " + kurz(e));
    }
    // Raus aus dem Speicher, damit ein zweiter Versuch nicht dieselben Karten
    // noch einmal schickt.
    for (const id of ids) WATCH_KARTEN.delete(String(id));
    if (!observable || typeof observable.observe !== "function") {
      return post({ __ownbot: "appAntwort", requestId, ok: true, status: 200, anzahl: liste.length });
    }
    try {
      observable.observe({}, function (sender, response) {
        appAntwort(requestId, response, { anzahl: liste.length });
      });
    } catch (e) {
      fail("Beobachten fehlgeschlagen: " + kurz(e));
    }
  }

  // --- Transferliste: der Verkaufs-Helfer ---------------------------------
  // Lesen geht ohne Anfrage: Die Web App haelt die Transferliste im Speicher
  // (repositories.Item). Nur "frisch" laesst sie EA fragen - dieselbe eine
  // Anfrage wie beim Oeffnen der Transferliste in der App.
  // Einstellen, Neu-Einstellen und Abraeumen laufen ueber die Dienste der App
  // selbst (services.Item). EA sieht dasselbe wie bei einem Klick dort, und
  // die App kennt danach den neuen Stand.
  function lies(fn) {
    try {
      return fn();
    } catch (e) {
      return undefined;
    }
  }

  // Den echten Fehlertext mitnehmen statt ihn wegzuwerfen (25.09.2026).
  //
  // Vorher stand in der Leiste nur "Aufruf fehlgeschlagen". Damit liess sich
  // nicht unterscheiden, ob EA die Funktion gar nicht hat, ob sie intern
  // scheitert oder ob wir falsche Werte schicken. Genau daran haben wir beim
  // Abraeumen einen halben Tag verloren.
  //
  // Gekuerzt auf 160 Zeichen, weil der Text in der Leiste landet, und ohne
  // Zeilenumbrueche, damit er die Anzeige nicht zerreisst. Der Text kommt aus
  // EAs Code, nicht vom Nutzer - er wird nur angezeigt, nie ausgefuehrt.
  function kurz(e) {
    const text = e && e.message ? String(e.message) : String(e);
    return text.replace(/\s+/g, " ").trim().slice(0, 160);
  }

  function transferItems() {
    const repo = window.repositories && window.repositories.Item;
    if (!repo || typeof repo.getTransferItems !== "function") return null;
    const liste = lies(() => repo.getTransferItems());
    return Array.isArray(liste) ? liste : null;
  }

  // Aus einem Stapel der Web App eine echte Liste machen (25.09.2026).
  // repositories.Item.unassigned ist kein Array, sondern ein Stapel-Objekt.
  // Kein stiller Verlust: was keine brauchbare Liste ergibt, wird nicht
  // weitergereicht, sondern mit null als "unbekannt" gemeldet.
  function alsListe(wert) {
    if (Array.isArray(wert)) return wert;
    if (!wert || typeof wert !== "object") return null;
    if (Array.isArray(wert.items)) return wert.items;
    if (typeof wert.length === "number" && wert.length >= 0 && wert.length < 5000) {
      const out = [];
      for (let i = 0; i < wert.length; i++) if (wert[i]) out.push(wert[i]);
      return out.length ? out : null;
    }
    return null;
  }

  // "Nicht zugewiesen" als Liste. Erster Weg ist FSTs (repositories.Item.
  // unassigned, scripts.js Z. 29836, 58494) - den gibt es bei EA sicher, weil
  // FST ihn laufend benutzt. getUnassignedItems() bleibt als zweiter Weg;
  // im ganzen FST-Buendel kommt dieser Name kein einziges Mal vor, es ist also
  // offen, ob EA ihn ueberhaupt hat (25.09.2026).
  function unassignedItems() {
    const repo = window.repositories && window.repositories.Item;
    if (!repo) return null;
    const ausStapel = alsListe(lies(() => repo.unassigned));
    if (ausStapel) return ausStapel;
    const liste = lies(() => (typeof repo.getUnassignedItems === "function" ? repo.getUnassignedItems() : null));
    return Array.isArray(liste) ? liste : null;
  }

  function statusVon(response) {
    return Number(lies(() => response.status || (response.error && response.error.code))) || 0;
  }

  // --- EAs erlaubte Preisspanne einer Karte (27.09.2026) -------------------
  //
  // EA laesst je Karte nur Preise zwischen einem Mindest- und einem
  // Hoechstwert zu. Liegt der Verkaufspreis daneben, lehnt EA das Einstellen
  // ab - die Karte bleibt unverkauft liegen und belegt einen Platz.
  //
  // FST fragt an dieser Stelle zuerst die Karte selbst (hasPriceLimits,
  // scripts.js Z. 1660) und holt die Spanne nur dann mit einer echten
  // EA-Anfrage nach (requestMarketData), wenn die Karte nichts weiss. Wir
  // machen NUR den ersten, kostenlosen Schritt: Die Web App hat die Spanne
  // meist schon im Speicher. Es geht dafuer keine Anfrage an EA hinaus.
  //
  // Kein stiller Verlust: Findet sich nichts, gehen min und max als 0 zurueck
  // und "gefunden" ist false. content.js stellt dann wie bisher ohne Spanne
  // ein, statt sich eine Grenze auszudenken. "quelle" sagt, woran es lag -
  // sonst raetselt man spaeter, warum nichts kam.
  function reportPreisgrenzen(requestId, itemId) {
    const id = String(itemId || "");
    const antwort = (min, max, gefunden, quelle) =>
      post({ __ownbot: "preisgrenzen", requestId, min, max, gefunden, quelle });
    if (!id) return antwort(0, 0, false, "keine Kartennummer");
    // Erst die eigene letzte Suche, dann Transferliste und "Nicht zugewiesen" -
    // dieselbe Reihenfolge wie beim Einstellen ueber die App.
    let karte = null;
    for (const kandidat of APP_ANGEBOTE.values()) {
      if (kandidat && String(lies(() => kandidat.id)) === id) {
        karte = kandidat;
        break;
      }
    }
    if (!karte) {
      for (const liste of [transferItems(), unassignedItems()]) {
        if (!Array.isArray(liste)) continue;
        karte = liste.find((i) => i && String(lies(() => i.id)) === id) || null;
        if (karte) break;
      }
    }
    if (!karte) return antwort(0, 0, false, "Karte nicht im Speicher der App");
    // EAs eigene Ja/Nein-Frage zuerst - genau wie FST. Ein klares "nein"
    // heisst: gar nicht weiter suchen.
    const weiss = lies(() => (typeof karte.hasPriceLimits === "function" ? karte.hasPriceLimits() : null));
    if (weiss === false) return antwort(0, 0, false, "EA kennt die Spanne fuer diese Karte nicht");
    const grenzen =
      lies(() => (typeof karte.getPriceLimits === "function" ? karte.getPriceLimits() : null)) ||
      lies(() => karte._itemPriceLimits) ||
      {};
    const zahl = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);
    const min = zahl(grenzen.minimum);
    const max = zahl(grenzen.maximum);
    if (!min && !max) return antwort(0, 0, false, "keine Zahlen im Speicher");
    antwort(min, max, true, "Speicher der App");
  }

  function summarizeTransferItem(item) {
    const a = auctionOf(item);
    const statisch = lies(() => (typeof item.getStaticData === "function" ? item.getStaticData() : null));
    const name = lies(() => statisch.name || [statisch.firstName, statisch.lastName].filter(Boolean).join(" ")) || "";
    const handelbar = lies(() => (typeof item.isTradeable === "function" ? item.isTradeable() : item.tradable));
    const grenzen = lies(() => item._itemPriceLimits) || {};
    return {
      itemId: item.id == null ? "" : String(item.id).slice(0, 32),
      // Die Spieler-Nummer fuer Suche und Bild. _assetId ist bei Karten auf
      // der Transferliste 0 (live am 22.09.2026). databaseId ist die Grund-
      // nummer, auch bei Sonderkarten (definitionId 50569294 -> 237646); die
      // unteren 24 Bit der definitionId sind dieselbe Zahl.
      assetId: Number(lies(() => item.databaseId)) || (Number(item.definitionId) % 16777216) || 0,
      definitionId: Number(item.definitionId) || 0,
      rating: Number(item.rating) || 0,
      name: String(name).slice(0, 60),
      typ: String(item.type || "").slice(0, 16),
      handelbar: handelbar === true,
      gekauftFuer: Number(item.lastSalePrice) || 0,
      schnellverkauf: Number(item.discardValue) || 0,
      tradeId: a.tradeId == null ? "" : String(a.tradeId).slice(0, 32),
      tradeState: String(a.tradeState || "").slice(0, 32),
      sofortPreis: Number(a.buyNowPrice) || 0,
      startPreis: Number(a.startingBid) || 0,
      gebot: Number(a.currentBid) || 0,
      restSek: Number(a.expires) || 0,
      eaMin: Number(grenzen.minimum) || 0,
      eaMax: Number(grenzen.maximum) || 0,
      // Chemie (EAs playStyle) der eigenen Karte (28.09.2026). Der
      // Verkaufs-Helfer prueft damit, ob der gemessene Preis zu dieser Karte
      // passt - Vorbild FUT Simple Trader (getListPrice, scripts.js
      // Z. 59392-59403: chemistry === playStyle). 0 ist ein echter Wert
      // ("keine Chemie"); fehlt das Feld, schicken wir null. Number(null)
      // waere 0 und wuerde still "keine Chemie" behaupten - der bekannte
      // toInt(null)-Fehler.
      playStyle: typeof item.playStyle === "number" && Number.isFinite(item.playStyle) ? Math.floor(item.playStyle) : null
    };
  }

  function reportTradepile(requestId, frisch) {
    const fail = (reason) => post({ __ownbot: "tradepile", requestId, error: reason });
    const senden = (vonEA) => {
      const liste = Array.isArray(vonEA) && vonEA.length ? vonEA : transferItems();
      if (!liste) return fail("keine Daten");
      post({ __ownbot: "tradepile", requestId, items: liste.slice(0, 120).map(summarizeTransferItem) });
    };
    if (!frisch) return senden(null);
    const dienst = window.services && window.services.Item;
    if (!dienst || typeof dienst.requestTransferItems !== "function") return fail("kein Dienst");
    // Die Transferliste zuerst als "veraltet" melden (27.09.2026).
    //
    // Vorbild FST (scripts.js Z. 59157 und Z. 59271): an beiden Stellen steht
    // zuerst repositories.Item.setDirty(ItemPile.TRANSFER) und erst danach
    // services.Item.requestTransferItems(). Ohne diesen Schritt kann die Web
    // App ihre gemerkte Liste zurueckgeben statt einer frischen. Dann sieht
    // die Verkaufs-Wache verkaufte Karten nicht, raeumt nicht ab, und der Lauf
    // endet mit "Die Transferliste ist voll" - obwohl Platz zu schaffen waere.
    //
    // In try/catch und mit Pruefungen: Fehlt setDirty oder ItemPile, wird nur
    // dieser Schritt uebersprungen und wie bisher weitergelesen. Kein stiller
    // Verlust - die Liste kommt in jedem Fall, nur eben vielleicht gemerkt.
    try {
      const repo = window.repositories && window.repositories.Item;
      const stapel = lies(() => window.ItemPile.TRANSFER);
      if (repo && typeof repo.setDirty === "function" && stapel !== undefined && stapel !== null) {
        repo.setDirty(stapel);
      }
    } catch (e) {}
    const observable = lies(() => dienst.requestTransferItems());
    if (!observable || typeof observable.observe !== "function") return fail("unerwartete Antwort");
    try {
      observable.observe({}, function (sender, response) {
        if (!response || response.success === false) return fail("EA hat abgelehnt (" + statusVon(response) + ")");
        senden(lies(() => (response.data || response.response || {}).items));
      });
    } catch (e) {
      fail("Beobachten fehlgeschlagen: " + kurz(e));
    }
  }

  // FSTs Weg zum Abraeumen (27.09.2026).
  //
  // FUT Simple Trader benutzt genau EINEN Weg (scripts.js Z. 59158-59214): Es
  // markiert die Transferliste als veraltet, laedt sie frisch von EA und ruft
  // dann UTTransferListViewController.prototype._clearSold() auf. Bei uns
  // stand dieser Weg bisher nicht einmal in der Liste.
  //
  // Das frische Laden machen wir hier NICHT: Das ist eine echte EA-Anfrage,
  // und solche Anfragen gehen bei uns immer ueber content.js, damit sie auf
  // die Schutzgrenzen zaehlen. content.js liest die Liste ohnehin frisch,
  // bevor es abraeumt. Hier bleibt nur der Aufruf selbst.
  //
  // setDirty markiert die Ablage der App nur als veraltet. Das fragt EA nicht
  // und kostet keine Anfrage. Es sorgt dafuer, dass die naechste Abfrage von
  // content.js wirklich bei EA landet und nicht den alten Stand zeigt.
  //
  // Der Aufruf meldet nichts zurueck - deshalb gibt diese Funktion "blind"
  // zurueck. Kein stiller Verlust: content.js erfaehrt damit, dass es selbst
  // nachsehen muss, ob die Karten wirklich weg sind.
  function clearSoldFST() {
    const klasse = transferListViewClass();
    if (!klasse) throw new Error("UTTransferListViewController fehlt");
    klasse.prototype._clearSold();
    const repo = window.repositories && window.repositories.Item;
    if (repo && typeof repo.setDirty === "function" && window.ItemPile) {
      lies(() => repo.setDirty(window.ItemPile.TRANSFER));
    }
    return "blind";
  }

  // Die Klasse suchen, die _clearSold hat. Erst unter ihrem Namen, dann - wie
  // FST (scripts.js Z. 531-534) - an ihrem Bauplan, denn in manchen
  // EA-Fassungen steht sie nicht unter ihrem Namen am window. Jeder Zugriff
  // laeuft durch lies(), weil einzelne Eigenschaften am window beim Lesen
  // Fehler werfen koennen.
  function transferListViewClass() {
    const direkt = lies(() => window.UTTransferListViewController);
    if (direkt && direkt.prototype && typeof direkt.prototype._clearSold === "function") return direkt;
    for (const name of Object.keys(window)) {
      if (!/^UT[A-Za-z]{0,60}$/.test(name)) continue;
      const wert = lies(() => window[name]);
      if (wert && wert.prototype && typeof wert.prototype._clearSold === "function") return wert;
    }
    return null;
  }

  function verkaufAktion(requestId, art, daten) {
    const antwort = (ok, extra) => post(Object.assign({ __ownbot: "verkauf", requestId, art, ok }, extra || {}));
    const dienst = window.services && window.services.Item;
    if (!dienst) return antwort(false, { grund: "kein Dienst" });
    let observable;
    let weg = "";
    try {
      if (art === "einstellen") {
        const item = (transferItems() || []).find((i) => String(i.id) === String(daten && daten.itemId));
        if (!item) return antwort(false, { grund: "nicht auf der Transferliste" });
        observable = dienst.list(item, Number(daten.startPreis), Number(daten.sofortPreis), Number(daten.dauer));
      } else if (art === "neuEinstellen") {
        observable = dienst.relistExpiredAuctions();
      } else if (art === "abraeumen") {
        // Die App uebergibt die verkauften Eintraege - ohne sie wuerde sie
        // ihre eigene Liste nicht aufraeumen. Ein Aufruf ohne braucht sie nicht.
        const verkauft = (transferItems() || []).filter((i) => auctionOf(i).tradeState === "closed");
        if (!verkauft.length) return antwort(true, { nichts: true });
        // services.Item.clearSoldItems wirft in dieser EA-Fassung sofort einen
        // Fehler - am 23.09.2026 live gemessen, indem die Funktion umhuellt
        // wurde: sie scheitert intern, egal welche Argumente sie bekommt.
        // Darum der Reihe nach drei Wege, der gepruefte zuerst. Welcher
        // gegriffen hat, steht danach in der Antwort - sonst raetselt man
        // wieder, warum nichts passiert.
        const wege = [
          ["removeSold", () => dienst.transfersDao && dienst.transfersDao.removeSold(verkauft)],
          // FSTs eigener Weg als Mittelstufe (27.09.2026). scripts.js Z. 59214:
          // FST raeumt ausschliesslich mit
          // UTTransferListViewController.prototype._clearSold() ab - ohne
          // Argumente und ohne eigene Instanz, genau so steht es dort. Der
          // eigene Plan vom 25.09. sah diese Stufe schon vor; gebaut wurden
          // damals nur die erste und die dritte.
          //
          // Die Funktion gibt nichts Beobachtbares zurueck. Wirft sie nicht,
          // gilt die Arbeit als getan - darum gibt clearSoldFST am Ende
          // "blind" zurueck (bis 28.09.2026: true): die Schleife unten nimmt
          // jeden Rueckgabewert ausser null und undefined als Erfolg und
          // vermerkt "blind" in der Antwort, damit content.js nachprueft. Fehlt die Klasse, wird geworfen und der naechste Weg kommt
          // dran. Kein stiller Verlust: welcher Weg gegriffen hat, steht wie
          // bisher als "weg" in der Antwort.
          //
          // Gearbeitet wird auf der Liste, die die Web App gerade im Speicher
          // hat - bei FST ist das die Antwort von requestTransferItems selbst.
          // Bei uns liest die Verkaufs-Wache die Liste unmittelbar vorher
          // frisch, wenn sie voll ist (content.js, verkaufsWacheAufgabe). Die
          // Liste ist an dieser Stelle also genauso frisch wie bei FST.
          // 28.09.2026: clearSoldFST statt der Kurzfassung. Der Unterschied:
          // clearSoldFST sucht die Klasse notfalls am Bauplan (wie FST,
          // scripts.js Z. 531-534), ruft danach setDirty auf, damit das
          // naechste Lesen wirklich bei EA landet, und gibt "blind" zurueck -
          // content.js sagt dann ehrlich, dass erst die Nachpruefung zaehlt.
          // Die Funktion stand seit dem 27.09. ungenutzt im Code.
          ["_clearSold", () => clearSoldFST()],
          ["clearSoldItems", () => dienst.clearSoldItems(verkauft)]
        ];
        // Gezielter zweiter Versuch (28.09.2026). content.js schickt nach
        // einer gescheiterten Nachpruefung { weg: "clearSold" } mit - bisher
        // wurde das stillschweigend ignoriert, die Kette lief wieder von
        // vorne los, und removeSold meldete erneut wirkungslos "Erfolg".
        // FSTs Weg kam so NIE an die Reihe.
        const nurClearSold = Boolean(daten && daten.weg === "clearSold");
        const auswahl = nurClearSold ? wege.filter(([name]) => name === "_clearSold") : wege;
        let letzterFehler = "";
        for (const [name, versuch] of auswahl) {
          try {
            const o = versuch();
            if (o && typeof o.observe === "function") { observable = o; weg = name; break; }
            // Manche Wege geben nichts Beobachtbares zurueck, machen ihre
            // Arbeit aber trotzdem. Das gilt als erledigt.
            // "blind" heisst: der Weg meldet nichts zurueck (28.09.2026).
            // content.js schreibt das ins Protokoll und verlaesst sich auf
            // die Nachpruefung - nicht auf dieses "ok".
            if (o !== undefined && o !== null) return antwort(true, { weg: name, blind: o === "blind" });
          } catch (e) {
            letzterFehler = name + ": " + kurz(e);
          }
        }
        if (!observable) return antwort(false, { grund: "Abraeumen ging auf keinem Weg" + (letzterFehler ? " (" + letzterFehler + ")" : "") });
      } else {
        return antwort(false, { grund: "unbekannte Aktion" });
      }
    } catch (e) {
      return antwort(false, { grund: "Aufruf fehlgeschlagen: " + kurz(e) });
    }
    if (!observable || typeof observable.observe !== "function") return antwort(false, { grund: "unerwartete Antwort" });
    try {
      observable.observe({}, function (sender, response) {
        const ok = Boolean(response) && response.success !== false;
        antwort(ok, ok ? (weg ? { weg } : {}) : { grund: "EA hat abgelehnt", status: statusVon(response), weg });
      });
    } catch (e) {
      antwort(false, { grund: "Beobachten fehlgeschlagen: " + kurz(e) });
    }
  }

  // --- Die offene Suchseite der Web App (F5, 22.09.2026) -------------------
  //
  // FST nimmt nicht irgendein Suchobjekt, sondern das der gerade offenen
  // Suchseite (scripts.js Z. 1400-1428, 1405-1408). Verlaesst man die Seite,
  // stoppt es (Z. 59112-59131). Wir machen es genauso - aber wir SCHREIBEN
  // nie in das Objekt der Seite und klicken auch nichts an. Gelesen wird nur.
  // Tippfehler gefunden (25.09.2026): Hier stand "w*" statt "\w*" - ohne
  // Schraegstrich ist das der Buchstabe w. Die Pruefung traf damit so gut wie
  // nie zu, und der Name der offenen Seite kam immer aus dem Rueckfall
  // (constructor.name), der in EAs gepacktem Code meist unbrauchbar ist.
  // FST benutzt genau dieses Muster richtig (scripts.js Z. 645).
  const CONTROLLER_RE = /^[A-Z]\w*(ViewController|NavigationController)$/;
  // Aus der offenen Suchmaske nur noch das uebernehmen, was die Anfrage
  // NICHT eingrenzt: Sortierung und "keine Leihkarten" (25.09.2026).
  //
  // "zone" (Spielfeld-Bereich: Sturm, Mittelfeld, Abwehr) und "category"
  // sind echte Eingrenzungen. Standen sie in der Maske des Nutzers, ging
  // JEDE Suche ueber die App still nur noch ueber diesen Ausschnitt - auch
  // die Suche nach einem bestimmten Stuermer, die dann einfach nichts fand,
  // ohne dass irgendwo ein Grund stand. Bezahlt war sie trotzdem.
  // "count" faellt weg, weil die Seitengroesse jetzt vom Bot kommt (siehe
  // appSuche). Ein frisches Kriterien-Objekt bringt fuer alle drei EAs
  // neutrale Vorgabe mit.
  const SEITEN_FELDER = ["excludeLimitedUse", "sortBy", "sortDir"];
  let suchseiteMerker = null;
  let suchseiteBeobachter = null;

  function controllerWege() {
    const haupt = lies(() => window.getAppMain());
    const app = window._appMain;
    const wege = [];
    const dazu = (name, fn) => {
      const c = lies(fn);
      if (c) wege.push([name, c]);
    };
    dazu("presented", () => haupt.getRootViewController().getPresentedViewController().getCurrentViewController().getCurrentController());
    dazu("presented.kind", () => haupt.getRootViewController().getPresentedViewController().getCurrentViewController().getCurrentController().childViewControllers[0]);
    dazu("root", () => app._rootViewController.childViewControllers[0].currentController.currentController);
    dazu("root.eltern", () => app._rootViewController.childViewControllers[0].currentController);
    return wege;
  }

  function controllerName(c) {
    const direkt = lies(() => c.className);
    if (typeof direkt === "string" && CONTROLLER_RE.test(direkt)) return direkt;
    const ueber = lies(() => c.constructor.name);
    return typeof ueber === "string" ? String(ueber).slice(0, 60) : "";
  }

  // Welche Bildschirme sind wirklich die Marktsuche (25.09.2026, von FST
  // uebernommen: scripts.js Z. 576-645 und Z. 19258-19260).
  //
  // Bisher galt jeder Bildschirm als Suchseite, der irgendwo ein Objekt
  // "searchCriteria" hatte. Das haben auch die Vereinssuche und die
  // SBC-Suche. Dann hielt der Bot die Suchmaske fuer offen, obwohl der
  // Nutzer ganz woanders war - und suchte weiter. Genau das Muster, das
  // auffaellt.
  const MARKT_SEITEN = new Set([
    "UTMarketSearchFiltersViewController",
    "UTMarketSearchResultsSplitViewController",
    "UTMarketSearchResultsViewController"
  ]);

  // Manche Bildschirme nennen ihren Namen nicht. FST erkennt sie dann an der
  // Ansicht oder am Bauplan (welche Unter-Controller es gibt). Beides kostet
  // keine EA-Anfrage, es steht alles schon in der Seite.
  const ANSICHT_ZU_SEITE = {
    UTMarketSearchFiltersView: "UTMarketSearchFiltersViewController",
    UTMarketSearchResultsView: "UTMarketSearchResultsViewController"
  };

  // Was zuletzt statt der Marktsuche offen war. Nur zum Anzeigen: Sonst
  // stuende in der Leiste bloss "nicht offen", und niemand koennte sehen, ob
  // der Nutzer woanders ist oder ob EA seine Bildschirme umbenannt hat.
  let letzteFremdeSuchseite = "";

  // Der Name der Marktsuche, oder "" fuer "das ist sie nicht".
  function marktSeitenName(c) {
    const direkt = lies(() => c.className);
    if (typeof direkt === "string" && CONTROLLER_RE.test(direkt)) {
      return MARKT_SEITEN.has(direkt) ? direkt : "";
    }
    const ansicht = lies(() => c.getView().constructor.name);
    const ueberAnsicht = typeof ansicht === "string" ? ANSICHT_ZU_SEITE[ansicht] : "";
    if (ueberAnsicht && MARKT_SEITEN.has(ueberAnsicht)) return ueberAnsicht;
    // Bauplan der geteilten Ergebnisseite: links die Liste, rechts die Karte.
    if (lies(() => Boolean(c._listController && c._itemDetailController))) {
      return "UTMarketSearchResultsSplitViewController";
    }
    return "";
  }

  function suchController() {
    for (const paar of controllerWege()) {
      const c = paar[1];
      const k = lies(() => c.viewmodel.searchCriteria);
      if (!k || typeof k !== "object") continue;
      // Ein Suchobjekt allein reicht nicht mehr (25.09.2026) - der Bildschirm
      // muss auch wirklich die Marktsuche sein.
      const seite = marktSeitenName(c);
      if (!seite) {
        letzteFremdeSuchseite = controllerName(c) || "unbekannt";
        continue;
      }
      letzteFremdeSuchseite = "";
      return { controller: c, kriterien: k, weg: paar[0], seite };
    }
    return null;
  }

  function suchseiteStand() {
    const t = suchController();
    // Auch bei "zu" den zuletzt gesehenen Bildschirm mitschicken
    // (25.09.2026). Sonst stuende in der Leiste nur "nicht offen", und man
    // koennte nicht unterscheiden: Ist der Nutzer woanders, oder hat EA
    // seine Bildschirme umbenannt und unsere Liste ist veraltet?
    if (!t) return { offen: false, seite: letzteFremdeSuchseite, weg: "", count: 0 };
    return {
      offen: true, seite: t.seite, weg: t.weg,
      count: Number(lies(() => t.kriterien.count)) || 0,
      // Kartenart aus der offenen Suchmaske (24.09.2026). Die Namen stehen
      // in dieser EA-Fassung verschluesselt im Code - die Nummer nicht. Der
      // Nutzer waehlt also in EAs eigener Liste, und der Bot liest ab. So
      // braucht der Bot keine eigene Liste, die jede Woche veraltet.
      rarity: rarityAusSuchmaske(t),
      rarityName: rarityNameAusSeite()
    };
  }

  // EAs Kriterien halten mehrere Arten - seit 28.09.2026 kann der Bot das
  // auch: Alle gueltigen Nummern gehen als Kommaliste ("12,70") mit. FST
  // liest dieselbe Liste (scripts.js Z. 1818-1822: searchCriteria.rarities).
  // Leerer Text heisst "keine Angabe". Die 0 ist ein echter Wert ("Common").
  function rarityAusSuchmaske(t) {
    const liste = lies(() => t.kriterien.rarities);
    if (!Array.isArray(liste)) return "";
    const sauber = [];
    for (const roh of liste.slice(0, 5)) {
      const n = Math.floor(Number(roh));
      if (Number.isFinite(n) && n >= 0 && n < 1000 && !sauber.includes(n)) sauber.push(n);
    }
    return sauber.sort((a, b) => a - b).join(",");
  }

  // Der lesbare Name steht nur im gezeichneten Auswahlfeld, nicht im Code -
  // im Code sind die Namen verschluesselt (24.09.2026 nachgesehen).
  //
  // EAs Filterfelder zeigen ihren eigenen Namen ("Rarity", "Position"),
  // solange nichts gewaehlt ist, und den gewaehlten Wert ("Base Icon"),
  // sobald etwas gewaehlt ist. Welches Feld welches ist, steht nirgends.
  // Darum: Gibt es genau EIN Feld mit Auswahl, ist das die Kartenart. Gibt
  // es mehrere, bleibt der Name leer - lieber keine Angabe als eine falsche.
  // Die Nummer stimmt ohnehin immer, sie kommt aus den Suchkriterien.
  const FILTER_FELDNAMEN = /^(quality|rarity|position|chemistry|country|region|league|club|playstyle|evolution|any)/i;

  function rarityNameAusSeite() {
    return lies(() => {
      const mitAuswahl = [];
      for (const feld of document.querySelectorAll(".ut-search-filter-control.has-selection")) {
        const label = feld.querySelector(".ut-search-filter-control--row .label");
        const text = label ? String(label.textContent || "").trim() : "";
        if (!text || text.length > 40) continue;
        if (FILTER_FELDNAMEN.test(text)) continue;
        mitAuswahl.push(text);
      }
      return mitAuswahl.length === 1 ? mitAuswahl[0] : "";
    }) || "";
  }

  function reportSuchseite(immer) {
    const stand = suchseiteStand();
    const schluessel = stand.offen + "|" + stand.seite + "|" + stand.weg + "|" + stand.rarity;
    if (!immer && schluessel === suchseiteMerker) return;
    suchseiteMerker = schluessel;
    post(Object.assign({ __ownbot: "suchseite", at: Date.now() }, stand));
  }

  // Seitenwechsel sofort melden. Die Schonfrist verhindert Fehlalarm, waehrend
  // die App neu zeichnet.
  function suchseiteBeobachten() {
    if (suchseiteBeobachter) return;
    if (typeof MutationObserver !== "function") return;
    if (typeof document === "undefined" || !document.body) return;
    let geplant = false;
    suchseiteBeobachter = new MutationObserver(() => {
      if (geplant) return;
      geplant = true;
      setTimeout(() => {
        geplant = false;
        const vorher = suchseiteMerker;
        const stand = suchseiteStand();
        if (!stand.offen && vorher && vorher.indexOf("true|") === 0) {
          setTimeout(() => reportSuchseite(false), 600);
          return;
        }
        reportSuchseite(false);
      }, 600);
    });
    suchseiteBeobachter.observe(document.body, { childList: true, subtree: true });
  }

  // --- Suchen und Kaufen ueber die Web App (Suchweg "app", 22.09.2026) -----
  // Statt eigener Anfragen an EA nimmt der Bot hier die Suche und den Kauf der
  // Web App selbst: services.Item.searchTransferMarket(Kriterien, Seite) und
  // services.Item.bid(Karte, Betrag). Die Anfragen laufen dann durch die
  // Warteschlange der App, mit ihren Kopfzeilen - wie bei einem Klick dort.
  // Anlass: FUT Simple Trader schaltet die App fuer seine Laeufe sichtbar auf
  // die Transfermarkt-Suche (von aussen beobachtet), und unser Konto bekam
  // mit eigenen Anfragen schon bei ~450 Suchen am Tag Sperren.
  // Unbestaetigt bis zum ersten Live-Test: Rechnet die App die Seite selbst
  // in offset um? Darum werden offset UND Seite gesetzt, passend zueinander.
  const APP_ANGEBOTE = new Map(); // tradeId -> Karte der App, fuer den Kauf danach

  function appAuktion(item) {
    const a = auctionOf(item);
    return {
      tradeId: a.tradeId == null ? "" : String(a.tradeId),
      buyNowPrice: Number(a.buyNowPrice) || 0,
      startingBid: Number(a.startingBid) || 0,
      currentBid: Number(a.currentBid) || 0,
      expires: Number(a.expires) || 0,
      tradeState: String(a.tradeState || ""),
      bidState: String(a.bidState || ""),
      // Eigenes Angebot (02.10.2026): Feld wie in EAs Suchantwort und bei
      // MagicBuyer. content.js kauft und bietet darauf nie.
      tradeOwner: a.tradeOwner === true,
      itemData: {
        id: item.id == null ? "" : String(item.id),
        assetId: Number(lies(() => item.databaseId)) || (Number(item.definitionId) % 16777216) || 0,
        resourceId: Number(item.definitionId) || 0,
        rating: Number(item.rating) || 0,
        rareflag: Number(lies(() => item.rareflag)) || 0,
        // EA-Preisspanne aus dem Speicher der App - kostet keine Anfrage und
        // begrenzt spaeter das automatische Einstellen.
        marketDataMinPrice: Number(lies(() => item._itemPriceLimits.minimum)) || 0,
        marketDataMaxPrice: Number(lies(() => item._itemPriceLimits.maximum)) || 0
      }
    };
  }

  // Einstellen ueber die App ("Gleich verkaufen"). Die Karte muss die App
  // kennen: aus der eigenen letzten Suche, von der Transferliste oder aus
  // "Nicht zugewiesen".
  function appEinstellen(requestId, daten) {
    const fail = (grund) => post({ __ownbot: "appAntwort", requestId, ok: false, status: 0, grund });
    const dienst = window.services && window.services.Item;
    if (!dienst || typeof dienst.list !== "function") return fail("kein Dienst");
    const itemId = String(daten.itemId || "");
    const start = Math.floor(Number(daten.startPreis));
    const sofort = Math.floor(Number(daten.sofortPreis));
    const dauer = Math.floor(Number(daten.dauer));
    if (!itemId || !(start > 0) || !(sofort >= start) || !(dauer > 0)) return fail("Preise passen nicht");
    let item = null;
    for (const kandidat of APP_ANGEBOTE.values()) {
      if (kandidat && String(lies(() => kandidat.id)) === itemId) {
        item = kandidat;
        break;
      }
    }
    if (!item) {
      const listen = [transferItems(), unassignedItems()];
      for (const liste of listen) {
        if (!Array.isArray(liste)) continue;
        item = liste.find((i) => i && String(lies(() => i.id)) === itemId) || null;
        if (item) break;
      }
    }
    if (!item) return fail("Karte nicht im Speicher der App");
    let observable;
    try {
      observable = dienst.list(item, start, sofort, dauer);
    } catch (e) {
      return fail("Aufruf fehlgeschlagen: " + kurz(e));
    }
    if (!observable || typeof observable.observe !== "function") return fail("unerwartete Antwort");
    try {
      observable.observe({}, function (sender, response) {
        appAntwort(requestId, response, {});
      });
    } catch (e) {
      fail("Beobachten fehlgeschlagen: " + kurz(e));
    }
  }

  function appAntwort(requestId, response, daten) {
    const ok = Boolean(response) && response.success !== false;
    post(Object.assign({ __ownbot: "appAntwort", requestId, ok, status: ok ? 200 : statusVon(response) || 500 }, daten || {}));
  }

  function appSuche(requestId, k, nurSuchseite) {
    const fail = (grund) => post({ __ownbot: "appAntwort", requestId, ok: false, status: 0, grund });
    const treffer = suchController();
    if (nurSuchseite && !treffer) {
      return post({ __ownbot: "appAntwort", requestId, ok: false, status: 0, grund: "Suchseite nicht offen", suchseite: false });
    }
    const dienst = window.services && window.services.Item;
    // Die Klasse der offenen Seite nehmen, sonst die allgemeine.
    const Kriterien = (treffer && lies(() => treffer.kriterien.constructor)) || window.UTSearchCriteriaDTO;
    if (!dienst || typeof dienst.searchTransferMarket !== "function" || typeof Kriterien !== "function") return fail("kein Dienst");
    let observable;
    try {
      const kriterien = new Kriterien();
      // Felder der offenen Suchseite uebernehmen - nur lesen, nie schreiben.
      if (treffer) {
        for (const feld of SEITEN_FELDER) {
          const wert = lies(() => treffer.kriterien[feld]);
          const art = typeof wert;
          if (art === "number" || art === "string" || art === "boolean") lies(() => { kriterien[feld] = wert; });
        }
      }
      const typen = window.SearchType || {};
      kriterien.type = k.typ === "player" ? typen.PLAYER || "player" : typen.ANY || "any";
      const zahl = (v) => (Number(v) > 0 ? Math.floor(Number(v)) : 0);
      if (zahl(k.maskedDefId)) kriterien.maskedDefId = zahl(k.maskedDefId);
      if (zahl(k.maxBuy)) kriterien.maxBuy = zahl(k.maxBuy);
      if (zahl(k.minBuy)) kriterien.minBuy = zahl(k.minBuy);
      if (zahl(k.maxBid)) kriterien.maxBid = zahl(k.maxBid);
      if (zahl(k.minBid)) kriterien.minBid = zahl(k.minBid);
      if (zahl(k.ovrMin)) kriterien.ovrMin = zahl(k.ovrMin);
      if (zahl(k.ovrMax)) kriterien.ovrMax = zahl(k.ovrMax);
      // Verein (27.09.2026). FST setzt genau dieses Feld (scripts.js Z. 1724:
      // l.club = e.club). Der Verein ist damit hier gemessen richtig, waehrend
      // sein Name in unserer eigenen Suchadresse geraten ist.
      //
      // Kein stiller Verlust: Kennt das Suchobjekt dieser EA-Fassung das Feld
      // nicht, waere der Verein einfach weg - und die Suche liefe still ueber
      // ALLE Vereine, bezahlt aus dem Tagesbudget. Genau dieser Fehler ist im
      // Projekt schon mehrfach passiert. Darum vorher nachsehen und sonst mit
      // Grund abbrechen; content.js nimmt dann den direkten Weg.
      if (zahl(k.club)) {
        if (!("club" in kriterien)) return fail("Suchobjekt kennt kein Feld fuer den Verein");
        kriterien.club = zahl(k.club);
      }
      // Blaettern (25.09.2026): Frueher standen hier zwei Rechnungen
      // nebeneinander - ein eigener Startpunkt und eine Seitennummer aus EAs
      // Seitengroesse. Die Seitengroesse kam aus der offenen Suchmaske des
      // Nutzers und passte nicht zu der Schrittweite von 20, mit der
      // content.js blaettert. Ergebnis: bis zu drei Anfragen holten dieselbe
      // Seite. Jetzt kommen beide Zahlen fertig vom Bot, und es gilt nur noch
      // eine Rechnung.
      const anzahl = zahl(k.anzahl) || 20;
      const seite = zahl(k.seite) || 1;
      kriterien.count = anzahl;
      const start = zahl(k.start);
      // Kein stiller Verlust: Passen Startpunkt und Seitennummer nicht
      // zusammen, kaeme einfach die falsche Seite zurueck, ohne dass es
      // jemand merkt. Dann lieber abbrechen und den Grund nennen.
      if (start !== (seite - 1) * anzahl) return fail("Seitenzaehler passt nicht");
      kriterien.offset = start;
      // Die App merkt sich Suchergebnisse. Ohne Leeren kaeme bei gleicher
      // Suche die alte Liste zurueck - ohne dass EA gefragt wurde.
      if (typeof dienst.clearTransferMarketCache === "function") lies(() => dienst.clearTransferMarketCache());
      observable = dienst.searchTransferMarket(kriterien, seite);
    } catch (e) {
      return fail("Aufruf fehlgeschlagen: " + kurz(e));
    }
    if (!observable || typeof observable.observe !== "function") return fail("unerwartete Antwort");
    try {
      observable.observe({}, function (sender, response) {
        const items = lies(() => (response.data || response.response || {}).items) || [];
        APP_ANGEBOTE.clear();
        const auktionen = [];
        for (const item of Array.isArray(items) ? items.slice(0, 60) : []) {
          const auktion = appAuktion(item);
          if (!auktion.tradeId) continue;
          APP_ANGEBOTE.set(auktion.tradeId, item);
          auktionen.push(auktion);
        }
        appAntwort(requestId, response, { auctionInfo: auktionen, suchseite: Boolean(treffer), seite: treffer ? treffer.seite : "" });
      });
    } catch (e) {
      fail("Beobachten fehlgeschlagen: " + kurz(e));
    }
  }

  function appKauf(requestId, tradeId, betrag, nurSuchseite) {
    const fail = (grund) => post({ __ownbot: "appAntwort", requestId, ok: false, status: 0, grund });
    if (nurSuchseite && !suchController()) {
      return post({ __ownbot: "appAntwort", requestId, ok: false, status: 0, grund: "Suchseite nicht offen", suchseite: false });
    }
    const dienst = window.services && window.services.Item;
    if (!dienst || typeof dienst.bid !== "function") return fail("kein Dienst");
    const item = APP_ANGEBOTE.get(String(tradeId));
    // Nur Karten aus der letzten eigenen Suche - nie etwas, das der Bot nicht
    // selbst gerade gefunden hat.
    if (!item) return fail("Angebot nicht aus der letzten Suche");
    let observable;
    try {
      observable = dienst.bid(item, Math.floor(Number(betrag)));
    } catch (e) {
      return fail("Aufruf fehlgeschlagen: " + kurz(e));
    }
    if (!observable || typeof observable.observe !== "function") return fail("unerwartete Antwort");
    try {
      observable.observe({}, function (sender, response) {
        appAntwort(requestId, response, { auctionInfo: [appAuktion(item)] });
      });
    } catch (e) {
      fail("Beobachten fehlgeschlagen: " + kurz(e));
    }
  }

  // Wie voll sind Transferliste und "Nicht zugewiesen"? Aus dem Speicher der
  // App (repositories.Item), ohne Anfrage.
  //
  // Zwei Wege fuer "Nicht zugewiesen" (25.09.2026): zuerst FSTs Weg, also der
  // Zaehler repositories.Item.unassigned.length (scripts.js Z. 29836, 58494),
  // dann unser bisheriger getUnassignedItems(). Vorher gab es nur den zweiten;
  // fehlt er bei EA, kam still null heraus und die Platzpruefung im Bot lief
  // ins Leere. Welcher Weg gegriffen hat, geht als "weg" mit - damit ein
  // Fehlschlag im Status sichtbar wird, statt stumm zu verschwinden.
  // Die Transferliste bleibt wie sie ist: getTransferItems().length ist genau
  // das, was FST auch nimmt (scripts.js Z. 58527, 58541).
  function reportStapel() {
    const repo = window.repositories && window.repositories.Item;
    const anzahl = (name) => {
      const liste = lies(() => (repo && typeof repo[name] === "function" ? repo[name]() : null));
      return Array.isArray(liste) ? liste.length : null;
    };
    const roh = lies(() => repo.unassigned.length);
    const ausZaehler = typeof roh === "number" && Number.isFinite(roh) && roh >= 0 ? roh : null;
    const ausListe = ausZaehler === null ? anzahl("getUnassignedItems") : null;
    // EA selbst fragen, ob der Stapel voll ist (27.09.2026).
    //
    // Vorbild FST (scripts.js Z. 58415): direkt vor dem Einstellen
    // repositories.Item.isPileFull(ItemPile.TRANSFER). Die Antwort kommt aus
    // dem Speicher der App, kostet also keine EA-Anfrage - ist aber immer EAs
    // eigene Wahrheit, waehrend unsere gezaehlte Zahl bis zu zwei Minuten alt
    // sein darf.
    //
    // Kein stiller Verlust: Fehlt isPileFull oder ItemPile, bleibt der Wert
    // null. Im Bot gilt dann weiter die eigene Zaehlung, genau wie bisher.
    // Seit 02.10.2026 ebenso, solange die Stapelgroesse noch nicht geladen
    // ist (getPileSize 0 oder fehlt) - siehe unten.
    const vollFrage = (stapelName) => {
      if (!repo || typeof repo.isPileFull !== "function") return null;
      const stapel = lies(() => window.ItemPile[stapelName]);
      if (stapel === undefined || stapel === null) return null;
      // Stapelgroesse zuerst (02.10.2026): EAs isPileFull meldet "voll",
      // solange die Groesse des Stapels noch nicht geladen ist (Fund aus
      // MagicBuyer, core/market.js). Sonst lehnte der Bot direkt nach dem
      // Laden der Web App den Start ab oder stoppte den Lauf mit
      // "Transferliste voll (3)". null heisst: Es gilt die eigene Zaehlung.
      // Ohne getPileSize ist nicht feststellbar, ob die Groesse schon da ist -
      // dann ebenfalls null. Liest nur den Speicher der App, keine Anfrage.
      const groesse = Number(lies(() => (typeof repo.getPileSize === "function" ? repo.getPileSize(stapel) : 0)));
      if (!(groesse > 0)) return null;
      const wert = lies(() => repo.isPileFull(stapel));
      return typeof wert === "boolean" ? wert : null;
    };
    post({
      __ownbot: "stapel",
      transfer: anzahl("getTransferItems"),
      nichtZugewiesen: ausZaehler !== null ? ausZaehler : ausListe,
      vollTransfer: vollFrage("TRANSFER"),
      weg: ausZaehler !== null ? "zaehler" : ausListe !== null ? "liste" : "keiner"
    });
  }

  // Die Auswahllisten der EA-Suchmaske (24.09.2026).
  //
  // EAs Suchseite haelt ihre Filterfelder in view._searchFilters.filters.
  // Jedes Feld hat eine setId ("rarity", "level", "position", "league",
  // "nation", "club", "playStyle", "icontraits") und eine fertige Liste
  // options mit Nummer und lesbarem Namen. Genau die Liste, die im Code
  // selbst verschluesselt ist.
  //
  // WICHTIG: Hier wird nur GELESEN. FUT Simple Trader benutzt dieselben
  // Felder, schreibt aber hinein (setIndexById, setPlayerData) und bedient
  // damit EAs Maske fern. Das machen wir bewusst nicht - der Nutzer soll
  // seine Suchmaske behalten. Wir nehmen nur die Namen und schreiben die
  // Nummern spaeter selbst in unsere eigene Suchadresse.
  const LISTEN_FELDER = ["rarity", "level", "position", "league", "nation", "club", "playStyle", "icontraits"];
  const LISTEN_MAX = 200; // eine Liga-Liste kann lang sein
  // Der Verein ist die Ausnahme (25.09.2026): rund 950 Eintraege. Mit 200
  // kaeme nur ein Bruchteil an, ohne dass irgendwo stuende, dass etwas fehlt.
  const LISTEN_MAX_LANG = { club: 1000 };

  function reportFilterListen(requestId) {
    const t = suchController();
    const felder = t && lies(() => t.controller.getView()._searchFilters.filters);
    if (!Array.isArray(felder)) {
      post({ __ownbot: "filterlisten", requestId, offen: false, listen: {} });
      return;
    }
    const listen = {};
    for (const name of LISTEN_FELDER) {
      const feld = lies(() => felder.find((f) => f.setId === name));
      const roh = feld && lies(() => feld.options);
      if (!Array.isArray(roh)) continue;
      const eintraege = [];
      for (const o of roh.slice(0, LISTEN_MAX_LANG[name] || LISTEN_MAX)) {
        const id = Number(lies(() => o.id));
        const label = String(lies(() => o.label) || "").trim();
        // EA benutzt -1 fuer "egal". Die 0 ist KEIN "egal", sondern die
        // gewoehnliche Karte ("Common") - die darf nicht wegfallen.
        if (!Number.isFinite(id) || id < 0 || !label || label.length > 40) continue;
        eintraege.push({ id: Math.floor(id), label: label.slice(0, 40) });
      }
      if (eintraege.length) listen[name] = eintraege;
    }
    post({ __ownbot: "filterlisten", requestId, offen: true, listen });
  }

  // "Usage Sharing" (Nutzungsdaten fuer EA). Nur lesen - der Bot aendert
  // den Schalter nie. Er gehoert dem Nutzer und steht in FC auf der Konsole.
  // Muenzstand aus dem Speicher der Web App. Kostet keine EA-Anfrage - FST
  // ruft dafuer services.User.requestCurrencies() auf, also eine echte.
  function reportMuenzen(requestId) {
    // coins ist in dieser EA-Fassung ein Objekt {type, amount} und keine Zahl
    // (24.09.2026 im Browser nachgesehen). Der alte Code liess nur Zahlen
    // durch - damit lieferten ALLE Wege null, und der Muenzstand blieb leer.
    // Darum hier beides annehmen: die Zahl selbst oder das Feld amount darin.
    // Vorsicht bei der Umwandlung: Number(null), Number("") und Number(false)
    // sind alle 0. Ein fehlender Wert wuerde so zu "0 Muenzen" - und der Bot
    // haelt das Konto faelschlich fuer leer. Darum nur echte Zahlen annehmen.
    const zahl = (v) => {
      const roh = v && typeof v === "object" && !Array.isArray(v) ? v.amount : v;
      if (typeof roh !== "number" || !Number.isFinite(roh)) return null;
      return roh >= 0 && roh <= 999999999 ? Math.floor(roh) : null;
    };
    const wege = [
      () => window.services.User.getUser().coins,
      () => window.services.User.getUser().getCoins(),
      () => window.repositories.User.getUser().coins,
      () => window.repositories.User.user.coins
    ];
    let coins = null;
    for (const weg of wege) {
      const wert = zahl(lies(weg));
      if (wert !== null) {
        coins = wert;
        break;
      }
    }
    post({ __ownbot: "muenzen", requestId, coins });
  }

  function reportNutzung() {
    const dienst = window.services && window.services.UserSettings;
    const an = lies(() => dienst.getUsageSharingEnabled());
    post({ __ownbot: "nutzung", an: typeof an === "boolean" ? an : null });
  }

  // content.js fragt beim Laden nach, falls es etwas verpasst hat.
  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data) return;
    if (event.data.__ownbot === "probe?") {
      reportProbe();
      return;
    }
    if (event.data.__ownbot === "watchlist?") {
      reportWatchlist(event.data.requestId, event.data.auffrischen === true);
      return;
    }
    // Aufraeumen der Beobachtungsliste (25.09.2026). content.js hat die
    // Anfrage vorher auf das Limit gebucht und schickt nur erledigte Karten.
    if (event.data.__ownbot === "watchlistAufraeumen?") {
      watchlistAufraeumen(event.data.requestId, event.data.tradeIds);
      return;
    }
    if (event.data.__ownbot === "nutzung?") {
      reportNutzung();
      return;
    }
    if (event.data.__ownbot === "muenzen?") {
      reportMuenzen(event.data.requestId);
      return;
    }
    if (event.data.__ownbot === "stapel?") {
      reportStapel();
      return;
    }
    // "Nicht zugewiesen" leeren bzw. zuruecksetzen (28.09.2026). Nur die
    // Merkliste der Web App - FST: repositories.Item.unassigned.clear() /
    // .reset() (scripts.js Z. 53045, 58590, 58809, 58817). Keine EA-Anfrage.
    // Fehlt die Funktion in dieser EA-Fassung, passiert schlicht nichts -
    // reportStapel meldet danach in jedem Fall den echten Stand, damit
    // content.js nicht mit einer alten Zahl weiterrechnet.
    if (event.data.__ownbot === "unassignedLeeren?") {
      const repo = window.repositories && window.repositories.Item;
      if (repo && repo.unassigned && typeof repo.unassigned.clear === "function") {
        lies(() => repo.unassigned.clear());
      }
      reportStapel();
      return;
    }
    if (event.data.__ownbot === "unassignedZuruecksetzen?") {
      const repo = window.repositories && window.repositories.Item;
      if (repo && repo.unassigned && typeof repo.unassigned.reset === "function") {
        lies(() => repo.unassigned.reset());
      }
      return;
    }
    // EAs erlaubte Preisspanne einer Karte (27.09.2026). Reines Lesen aus dem
    // Speicher der Web App - keine EA-Anfrage, darum auch kein Kontingent.
    if (event.data.__ownbot === "preisgrenzen?") {
      reportPreisgrenzen(event.data.requestId, event.data.itemId);
      return;
    }

    if (event.data.__ownbot === "filterlisten?") {
      reportFilterListen(event.data.requestId);
      return;
    }
    if (event.data.__ownbot === "suchseite?") {
      suchseiteBeobachten();
      reportSuchseite(true);
      return;
    }
    if (event.data.__ownbot === "appSuche?") {
      appSuche(event.data.requestId, event.data.kriterien || {}, event.data.nurSuchseite === true);
      return;
    }
    if (event.data.__ownbot === "appKauf?") {
      appKauf(event.data.requestId, event.data.tradeId, event.data.betrag, event.data.nurSuchseite === true);
      return;
    }
    if (event.data.__ownbot === "appEinstellen?") {
      appEinstellen(event.data.requestId, event.data);
      return;
    }
    if (event.data.__ownbot === "tradepile?") {
      reportTradepile(event.data.requestId, event.data.frisch === true);
      return;
    }
    if (event.data.__ownbot === "verkauf?") {
      verkaufAktion(event.data.requestId, String(event.data.art || ""), event.data.daten || {});
      return;
    }
    if (event.data.__ownbot !== "session?") return;
    if (last.sid) reportSession();
    if (players) reportPlayers();
    reportImages();
    reportPriceTiers();
  });

  // Die Variablen werden erst nach document_start vom HTML der Web App gesetzt.
  // Beides wird erst vom HTML der Web App gesetzt, also mehrfach nachfassen.
  for (const verzoegerung of [1000, 5000, 15000]) {
    setTimeout(reportImages, verzoegerung);
    setTimeout(reportPriceTiers, verzoegerung);
  }
  window.__fc27OwnBotSnifferLoaded = SNIFFER_VERSION;
})();
