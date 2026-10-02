// FC27 Own Bot – content.js
// Laeuft in der isolierten Welt des Content-Scripts: Skripte der Seite koennen
// den Bot nicht starten, nur das Popup ueber Chrome-Messaging.
// Sucht gezielt einen oder mehrere Spieler und kauft per Sofortkauf, sobald
// einer zum Zielpreis oder guenstiger auftaucht. Dazu: Preis-Check mit Verlauf,
// Lauf-Statistik, Kauflog, Zeitlimit, Verschieben in den Verein und
// Benachrichtigungen.
(function () {
  "use strict";

  // Eine alte, nach einem Extension-Update noch lebende Instanz darf die neue
  // Version nicht blockieren. Zahlen statt Boolean machen Updates erkennbar.
  const CONTENT_VERSION = 11;
  if (Number(globalThis.__fc27OwnBotContentLoaded) >= CONTENT_VERSION) return;

  // ---------------------------------------------------------------------------
  // Konfiguration. Nicht gegen FC 27 verifiziert.
  // Host und Spielpfad (z. B. /ut/game/fc27) erkennt sniffer.js automatisch.
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // EA-Anbindung: Pfade und Parameternamen.
  // Bewusst NICHT fest einprogrammiert. Keiner dieser Namen ist von EA
  // dokumentiert, und aendert EA etwas, muss man sie anpassen koennen, ohne
  // dass jemand den Quelltext bearbeitet. Deshalb ueberschreibbar aus den
  // Einstellungen (chrome.storage, Schluessel "endpoints").
  // Professionelle Bots halten diese Angaben aus demselben Grund variabel.
  // ---------------------------------------------------------------------------
  const ENDPOINT_DEFAULTS = {
    searchPath: "/transfermarket",
    idParam: "maskedDefId", // Spieler (Basis-ID, alle Versionen)
    maxBuyParam: "maxb", // hoechster Sofortkaufpreis
    minBuyParam: "minb", // niedrigster Sofortkaufpreis
    maxBidParam: "macr", // hoechstes aktuelles Gebot (Gebotsmodus)
    // Rating-Bereich. Unbestaetigt: Wenn EA diese Namen nicht kennt, ignoriert
    // er sie, und der Bot sortiert wie bisher selbst aus. Kaputt geht nichts.
    ovrMinParam: "ovrMin",
    ovrMaxParam: "ovrMax",
    // Kartenart (24.09.2026, live an EAs eigener Suche abgelesen). Eine
    // Sonderkarte ist derselbe Spieler mit anderer Kartenart - ohne diesen
    // Filter kann der Bot eine TOTW-Karte nicht von der Normalversion
    // unterscheiden. Mehrere Arten gehen mit Komma.
    rarityParam: "rarityIds",
    // Filter fuer den Markt-Scan (24.09.2026, mit EINER Suche live
    // gemessen: lev=2&pos=130&nat=14&leag=13&playStyle=251). EAs eigene
    // Suchmaske nennt die Felder level/position/nation/league/playStyle -
    // in der Adresse heissen sie anders, darum musste es gemessen werden.
    levelParam: "lev",
    positionParam: "pos",
    nationParam: "nat",
    leagueParam: "leag",
    playStyleParam: "playStyle",
    // Verein (25.09.2026). EAs Suchmaske hat das Feld ("club", rund 950
    // Eintraege). Wie es in der ADRESSE heisst, ist NICHT gemessen - anders
    // als lev/pos/nat/leag/playStyle darueber. "club" ist geraten.
    // Der Name steht nur hier: Zeigt eine Live-Messung etwas anderes, wird
    // genau diese eine Zeile geaendert und sonst nichts.
    clubParam: "club",
    bidPath: "/trade/{id}/bid", // {id} wird durch die tradeId ersetzt
    bidMethod: "PUT",
    clubPath: "/item", // Verschieben in den Verein
    clubMethod: "PUT",
    // Einstellen auf den Transfermarkt ("Gleich verkaufen")
    listPath: "/auctionhouse",
    listMethod: "POST"
  };
  const ENDPOINTS = Object.assign({}, ENDPOINT_DEFAULTS);

  const CONFIG = {
    SCAN_MIN_PRICE_SHARE: 0.15, // Zufalls-Mindestpreis bis zu diesem Anteil
    SCAN_MIN_PRICE_FROM: 10000, // erst ab diesem Suchpreis ueberhaupt anwenden
    PAGE_SIZE: 21, // wie die Web App: 20 Angebote + 1 als "es gibt mehr"
    MAX_TARGETS: 10,
    // "omit", NICHT "include": Die EA-Schnittstelle antwortet ohne
    // Access-Control-Allow-Credentials. Mit "include" lehnt Chrome JEDE Anfrage
    // ab (CORS, "Failed to fetch") - gesehen am 21.09.2026 in der Konsole des
    // Nutzers. Angemeldet wird ueber den X-UT-SID-Kopf, nicht ueber Cookies.
    CREDENTIALS: "omit",
    SEARCH_INTERVAL_MS: 3000, // Pause zwischen zwei Suchen (Preis-Check)
    // Markt-Scan: gleiche Durchschnittsdauer wie bisher, aber unregelmaessig.
    // Ein starrer Takt ist das auffaelligste Muster ueberhaupt.
    SCAN_DELAY_MIN_MS: 2000,
    SCAN_DELAY_MAX_MS: 3400,
    SCAN_EXTRA_CHANCE: 0.35, // so oft kommt ein Aufschlag obendrauf
    SCAN_EXTRA_MIN_MS: 400,
    SCAN_EXTRA_MAX_MS: 1400,
    // 25.09.2026: von 5 auf 3 gesenkt. FUT Simple Trader hoert schon beim
    // ERSTEN unklaren Fehler von EA auf (scripts.js Z. 59456-59464). Vier
    // weitere Anfragen nach einem Fehler sind genau das Muster, das am
    // 22.09. der Sperre voranging.
    MAX_ERRORS_IN_A_ROW: 3,
    // Wachsende Pause nach unklaren Antworten von EA: erst 30 Sekunden, dann
    // 2 Minuten, dann 10. Gilt NICHT fuer 400/404/405 - die entstehen bei uns
    // durch eigene falsche Filterwerte und haben mit EAs Drosselung nichts zu
    // tun. Dafuer darf niemand 10 Minuten ausgesperrt werden.
    FEHLER_PAUSEN_MS: [30000, 120000, 600000],
    MAX_BACKOFF_S: 120,
    CHECK_PRIMARY_SEARCHES: 12, // normale Preisermittlung
    CHECK_MAX_SEARCHES: 15, // drei weitere Anfragen fuer die Kontrollmessung
    CHECK_BAND: 0.15, // fuer die Preisgruppe bis 15 % ueber dem guenstigsten sammeln
    CHECK_CLUSTER_BAND: 0.08, // Preise innerhalb von 8 % gelten als eine Preisgruppe
    CHECK_MAX_LISTINGS: 30, // mehr bringt meist wenig, kostet aber weitere Anfragen
    MARKET_SCAN_PAGES: 3,
    MARKET_SCAN_CANDIDATES: 6, // so viele werden einzeln nachgeprueft
    MARKET_SCAN_LISTE_MAX: 40, // so viele stehen danach in der Filterliste
    // Harte Obergrenze fuer den ganzen Markt-Scan: Aufnahme-Seiten, Zielsuchen
    // und Tast-Schritte zusammen. Mehr Anfragen gibt es nie, egal wie der
    // Markt aussieht - fehlt Platz, bleibt ein Preis eben ungeprueft.
    MARKET_SCAN_MAX_REQUESTS: 16,
    MARKET_SCAN_PROBE_STEPS: 2, // so oft tastet der Scan je Kandidat hoechstens abwaerts
    MIN_PRICE: 150, // kleinster gueltiger Preis auf dem Transfermarkt
    // Marktaktivitaet nur aus zwei Messungen mit mindestens so viel Abstand.
    // Nach 3 Sekunden steht fast immer noch alles da - "ruhig" waere dann kein
    // Messwert, sondern ein Zufall der Taktung.
    ACTIVITY_MIN_GAP_MS: 60000,
    // ... und hoechstens so viel Abstand (27.09.2026). Liegen zwischen zwei
    // Aufnahmen viele Minuten, sind die verschwundenen Angebote einfach
    // abgelaufen - dann misst man Ablauf, nicht Konkurrenz. Ohne diese obere
    // Grenze waere nach einer langen Pause jede Quote hoch.
    ACTIVITY_MAX_GAP_MS: 10 * 60 * 1000,
    // Schutzlimits. EA sperrte am 21.09.2026 schon bei rund 450 Suchen am
    // Tag (HTTP 521) - darum bleibt der Bot deutlich darunter.
    SEARCH_LIMIT_HOUR: 150,
    SEARCH_LIMIT_DAY: 350,
    SEARCH_WARN_HOUR: 120, // ab hier warnt der Start-Dialog gelb
    SEARCH_WARN_DAY: 250,
    // Ausnahme vom Tageslimit - nur auf ausdruecklichen Wunsch (Optionen >
    // Wartung). Hebt NUR die Suchen pro Tag an und nur fuer 6 Stunden.
    // Stundenlimit, Kaufversuche, Kartenlimit und Sperre bleiben, wie sie sind.
    AUSNAHME_EXTRA: 150,
    AUSNAHME_DAUER_MS: 6 * 60 * 60 * 1000,
    BUY_LIMIT_DAY: 100, // Kaufversuche: Sofortkaeufe und Gebote, auch erfolglose
    ACTION_LIMIT_DAY: 120, // Verschieben und Einstellen nach dem Kauf
    // Stundenbremse auch fuer Kaeufe und Aktionen (23.09.2026). Vorher hatten
    // nur Suchen ein Stundenlimit. 100 Kaeufe und 120 Aktionen durften also
    // alle in dieselbe Stunde fallen - zusammen mit 150 Suchen waeren das 370
    // Anfragen in einer Stunde gewesen.
    BUY_LIMIT_HOUR: 40,
    ACTION_LIMIT_HOUR: 50,
    // Und der Deckel ueber allem: EA zaehlt jede Anfrage, nicht nur Suchen.
    // Die Einzellimits ergaben zusammen 570 am Tag. EA hat bei diesem Konto
    // schon bei rund 450 am Tag mit HTTP 521 gesperrt (21.09.2026).
    // Der Tagesdeckel waechst mit der Ausnahme mit, aber nie ueber
    // GESAMT_MAX_TAG hinaus - darum ist die Ausnahme keine Hintertuer.
    GESAMT_LIMIT_HOUR: 170,
    GESAMT_PUFFER_TAG: 60, // so viel mehr als das Suchlimit des Tages
    GESAMT_MAX_TAG: 440, // harte Obergrenze, bewusst unter den beobachteten 450
    // Und dieselbe harte Obergrenze fuer die STUNDE (27.09.2026). Bisher gab es
    // sie nur fuer den Tag - das war ein Loch im Schutz.
    //
    // Wer die Stundengrenze auf 900 stellte, konnte die 440 Anfragen des Tages
    // in gut einer halben Stunde verschiessen (bei rund 4 Sekunden je Suche).
    // Woran die 521-Sperre am 21.09.2026 genau lag, wissen wir NICHT.
    // Festgehalten ist nur: Sie kam bei rund 450 Suchen am Tag, und die 426
    // kam bei zwei Kaeufen pro Sekunde. Dass die Ballung in kurzer Zeit der
    // Ausloeser war, ist eine begruendete Annahme - mehr nicht. Der Riegel
    // ist also Vorsicht, keine Schlussfolgerung aus einer Messung.
    // Die Haelfte des Tagesdeckels heisst: Das Tagesbudget verteilt sich auf
    // mindestens zwei Stunden.
    //
    // Am Standard aendert das NICHTS: Der Deckel ueber allem liegt normal bei
    // 170 Anfragen in der Stunde, die Suchgrenze bei 150. Beides bleibt, weil
    // beides unter 220 liegt. Der Riegel greift erst, wenn jemand in den
    // Optionen selbst hoeher eintraegt.
    GESAMT_MAX_STUNDE: 220,
    // Obergrenzen fuer die selbst eingestellten Grenzen (25.09.2026). Auch
    // wer bewusst hochdreht, soll sich nicht mit einem Tippfehler das Konto
    // kosten: 5.000 Suchen am Tag waeren keine Einstellung mehr, sondern ein
    // Versehen. FSTs schnellste Stufe schafft rechnerisch rund 1.400 Suchen
    // in der Stunde - mehr als 900 einzustellen hat keinen Sinn.
    GRENZE_MAX_STUNDE: 900,
    GRENZE_MAX_TAG: 2000,
    // Verkaufs-Wache (F3): In Pausen in die Transferliste sehen. Aus dem
    // Speicher der App kostet das nichts; eine frische Abfrage bei EA ist
    // selten und wird gezaehlt. FST prueft alle 8 Suchen (Z. 58573-58587).
    VERKAUF_CHECK_MIN_GAP_MS: 5 * 60 * 1000,
    VERKAUF_CHECK_MAX_RUN: 6,
    VERKAUF_CHECK_EVERY_SEARCHES: 12,
    VERKAUF_MUENZEN_FRIST_MS: 5000,
    // Abstand zwischen zwei Kauf- oder Gebotsversuchen aus DERSELBEN Suche.
    // Live am 22.09.2026 (Gordon bis 1.900, 2 passende Angebote): Kauf,
    // Verschieben und der zweite Kauf gingen in derselben Sekunde raus. Der
    // zweite Kauf bekam HTTP 426, gut 4 Minuten spaeter kam 461
    // PERMISSION_DENIED. So schnell klickt kein Mensch. Der Nutzer hat
    // entschieden: weiter mehrere Angebote je Suche, aber mit Pause dazwischen.
    BUY_GAP_MIN_MS: 3000,
    BUY_GAP_MAX_MS: 5000,
    // Untergrenze zwischen zwei Kauf- oder Gebotsanfragen, egal was dazwischen
    // passiert (25.09.2026). Vergleich mit FST: Dort liegen nach jedem Kauf
    // 5,0-6,5 s (Z. 58317-58326) plus 2,5-4,0 s vor der naechsten Suche
    // (Z. 58639-58647) - nie unter 7,5 s. Bei uns galt das nur, wenn nach dem
    // Kauf verschoben oder eingestellt wurde. Bei "Gekaufte Spieler liegen
    // lassen" blieben von den 3-5 s netto 3,2 s - schneller als FST, und genau
    // in dieser Ecke kam am 22.09.2026 die 426. Was Verschieben und Einstellen
    // schon verbraucht haben, wird angerechnet: kuerzer wird dadurch nie etwas.
    BUY_GAP_FLOOR_MS: 8000,
    // Nach dem Kauf erst so lange warten, dann in den Verein schieben. Vorher
    // ging das Verschieben in derselben Sekunde raus wie der Kauf.
    MOVE_DELAY_MIN_MS: 5000,
    MOVE_DELAY_MAX_MS: 6500, // wie FST (Z. 58317-58323); vorher 2-5 s
    // "Gleich verkaufen": Zeiten wie FST (Z. 58317, 58414), Preisregeln
    // wie FST (Z. 1593-1602), Verlustschutz strenger als dort.
    LIST_DELAY_MIN_MS: 4100,
    LIST_DELAY_MAX_MS: 6000,
    LIST_STEP_MIN_MS: 600,
    LIST_STEP_MAX_MS: 925,
    LIST_PRICE_MAX_AGE_MS: 60 * 60 * 1000, // so frisch muss der Verkaufspreis sein
    // Mit dem Haken "Verkaufspreis auch nach einer Stunde weiter nutzen"
    // (Optionen > Verkaeufe) darf der gemessene Preis auch aelter sein -
    // hoechstens aber so alt (27.09.2026).
    //
    // Anlass: Der Preis-Check ist waehrend eines Laufs gesperrt ("Erst den Bot
    // stoppen, dann den Preis pruefen"). Der Preis kann im Lauf also gar nicht
    // frisch werden. Nach 60 Minuten Laufzeit stellte der Bot deshalb keine
    // Karte mehr ein, und jeder Kauf blieb auf der Transferliste liegen.
    //
    // FUT Simple Trader hat dieses Problem nicht: Dort tippt der Nutzer den
    // Verkaufspreis selbst ein, und der veraltet nie (scripts.js Z. 59392-59404).
    //
    // Zwoelf Stunden sind eine lange Sitzung. Alles darueber ist kein Preis
    // mehr, sondern eine Erinnerung - dann bleibt es beim alten Verhalten.
    LIST_PRICE_LANG_MAX_AGE_MS: 12 * 60 * 60 * 1000,
    LIST_MIN_PRICE: 200, // darunter stellt der Bot nichts ein
    SALE_FEE: 0.05, // EA-Gebuehr beim Verkauf
    MINB_STUFEN: 10, // so viele Stufen wandert der Mindestpreis, dann zurueck auf 0
    // Laenger wartet keine Anfrage auf EA (siehe api()).
    REQUEST_TIMEOUT_MS: 20000,
    // Ein Scan braucht bis zu 16 Anfragen. Alle 5 Minuten waeren das bis zu
    // 192 pro Stunde - mehr als das Stundenlimit. Mit 7 Minuten hoechstens
    // 137, und autoScanPlatz haelt ihn zusaetzlich unter der Warnschwelle.
    AUTO_SCAN_INTERVAL_MS: 7 * 60 * 1000,
    // Drosselung erkennen. Zwei Zeichen, die sich wirklich messen lassen:
    // ungewoehnlich langsame Antworten und ein Filter, der ploetzlich nichts
    // mehr liefert, obwohl er vorher lief.
    SLOW_RESPONSE_MS: 8000, // ab hier gilt eine Antwort als auffaellig langsam
    SLOW_STREAK: 3, // so viele langsame hintereinander = Warnung
    HEALTH_WINDOW: 20, // so viele Antwortzeiten werden behalten
    EMPTY_STREAK_WARN: 6, // leere Suchen in Folge nach vorherigen Treffern
    EMPTY_STREAK_MIN_HITS: 3, // so oft muss die Suche vorher geliefert haben
    CARD_LIMIT_DAY: 20, // hoechstens so viele Aktionen auf dieselbe Karte pro Tag
    CAPTCHA_COOLDOWN_MIN: 60, // nach einem Captcha so lange gar nicht starten
    BROAD_FILTER_HITS: 2, // so viele volle Trefferseiten nacheinander = Filter zu weit
    // Mehr Angebote bis zum Zielpreis in EINER Suche = Zielpreis ueber dem
    // Markt: nicht kaufen, Spieler sofort ueberspringen (wie FST, Z. 58438).
    ZU_VIELE_TREFFER: 10,
    // So alt darf die Trefferliste einer Suche hoechstens sein, wenn noch ein
    // weiteres Angebot daraus gekauft werden soll (25.09.2026). FST wirft die
    // Liste nach jedem Kauf weg und sucht neu (Z. 58274-58330). Das kostet
    // aber je Kauf eine zusaetzliche Suche. Darum der Mittelweg: Das zweite
    // Angebot derselben Suche geht noch durch - es ist nach Kauf, Verschieben
    // und Pause rund 8-13 s alt. Ab dem dritten (ueber 16 s) ist die Liste zu
    // alt; der Kaufversuch waere meist eine Anfrage fuer nichts.
    TREFFER_MAX_ALTER_MS: 15000,
    MAX_BIDS_PER_AUCTION: 4, // Obergrenze fuer Nachgebote auf dieselbe Auktion
    WATCHLIST_TIMEOUT_MS: 5000, // so lange auf die Beobachtungsliste warten
    WATCHLIST_MIN_GAP_MS: 20000, // fruehestens so oft erneut abfragen
    // Aufraeumen der Beobachtungsliste: hoechstens alle 10 Minuten je Lauf,
    // damit daraus nie ein laufender Anfragenstrom wird (25.09.2026).
    WATCHLIST_CLEAN_GAP_MS: 600000,
    BID_SETTLE_GRACE_S: 90, // nach Auktionsende so lange auf einen Ausgang warten
    BID_MAX_OPEN_MIN: 60, // Notbremse, wenn die Restzeit nie erkannt wurde
    SUGGEST_DISCOUNT: 0.1, // Vorschlag: 10 % unter dem Marktpreis
    HISTORY_DAYS: 14,
    DROUGHT_MIN: 20, // ab so vielen Minuten ohne Kauf gibt es einen Hinweis
    // Live-Filter gelten nur 15 Minuten - mit 20 kaeme der Hinweis nie.
    DROUGHT_LIVE_MIN: 8,
    // Filter-Wechsel im Autopilot (F4). Die 12 ist eine zweite feste Grenze
    // neben Laufzeit und Suchbudget: Auch wenn beides reicht, ist nach 12
    // Filtern Schluss. Die Pause zwischen zwei Filtern wird hart geklemmt,
    // wird hart geklemmt, damit die Leiste sie nicht auf 0 setzen kann. FSTs
    // echter Standard sind 300 Sekunden (Z. 41943); die 35 s in Z. 42224 sind
    // nur sein Notwert, wenn der Server nichts schickt.
    ROTATION_MAX_FILTER: 12,
    // Fruehestens nach dieser Zeit darf derselbe Filter wieder starten
    // (25.09.2026). Kuerzer waere wirkungslos, laenger wuerde die Rotation
    // blockieren, sobald nur noch ein Kandidat uebrig ist.
    ROTATION_GLEICHER_FILTER_MS: 2 * 60 * 1000,
    ROTATION_MIN_PAUSE_MS: 25000,
    // "Nächster Filter" (25.09.2026): Wer den laufenden Filter wegklickt,
    // bevor er wirklich gesucht hat, koennte sich sonst durch die Filter
    // klicken und dabei ein Anfragen-Gewitter ausloesen. Unter so vielen
    // Suchen gibt es darum die volle Zwangspause. FST macht dasselbe mit 21
    // Suchen und 60 Sekunden (scripts.js 57645-57658) - wir bremsen mit
    // ROTATION_MAX_PAUSE_MS fuenfmal staerker.
    SPRUNG_MIN_SUCHEN: 20,
    // 27.09.2026 von 300 auf 500 Sekunden angehoben: FSTs lange Pause ist 400
    // Sekunden und streut um 20 Prozent, also bis 480. Bei 300 waere sie hier
    // abgeschnitten worden. Eine LAENGERE Pause ist immer die sichere Richtung;
    // die Suchgrenzen bleiben unveraendert.
    ROTATION_MAX_PAUSE_MS: 500000,
    ROTATION_MAX_MIN: 300,
    // Filter-Wache (25.09.2026). Eine Laufsuche fragt EA nur BIS ZUM
    // Kaufpreis ab. Was teurer ist, sieht sie nie - der Verkaufspreis laesst
    // sich daraus also nicht neu messen. Messbar ist nur das untere Ende des
    // Marktes: Steht dort etwas fest, ist der Markt weggerutscht; ist dort
    // alles frisch, darf der Filter einmal weiterlaufen.
    //
    // So alt muss ein passendes Angebot UNTER unserem Kaufpreis sein, damit
    // es als "steht fest" zaehlt. 5 Minuten sind eindeutig: Unser eigener Bot
    // haette es in der Zeit laengst gekauft, wenn es etwas taugen wuerde.
    FILTER_WACHE_ALT_MIN: 5,
    // So kurz vor dem Ablauf wird verlaengert. Frueher waere die Messung beim
    // Ablauf schon wieder alt.
    FILTER_WACHE_FRIST_MS: 3 * 60 * 1000,
    // Und nur um so viel, hoechstens einmal je Filter. Kuerzer als die 15
    // Minuten des Live-Filters, weil die Messung nur das Stueck bis zum
    // Kaufpreis kennt.
    FILTER_VERLAENGERUNG_MS: 10 * 60 * 1000,
    // Am Stundenlimit nicht gleich aufhoeren, sondern warten, bis das
    // wandernde 60-Minuten-Fenster wieder Platz hat (25.09.2026). Laenger als
    // das wartet der Bot nie - dann ist Schluss wie bisher. Das Limit selbst
    // bleibt unveraendert; gewartet wird genau so lange, wie die Zaehler es
    // verlangen.
    //
    // 27.09.2026 von 15 auf 62 Minuten angehoben. Grund: Seit der Bot im
    // Tempo von FST sucht (3,9 Sekunden je Suche), ist die Stunde nach rund
    // 15 Minuten voll, und bis das wandernde Fenster wieder Platz hat,
    // dauert es rund 45 Minuten. Mit 15 Minuten Hoechstwartezeit kam der
    // Bot nie ueber diese Luecke - er hoerte auf. Das Fenster ist 60 Minuten
    // lang, laenger als das kann das Warten nie dauern; die 62 sind nur noch
    // ein Not-Riegel gegen einen Rechenfehler, keine echte Grenze mehr.
    //
    // Kein Limit wird dadurch angehoben. Gewartet wird immer genau so lange,
    // wie die Zaehler es verlangen.
    STUNDENLIMIT_WARTEN_MAX_MS: 62 * 60 * 1000,
    // "Keine Grenze" im FST-Modus (01.10.2026). Eine grosse Zahl statt 0 oder
    // Infinity: So fallen alle "Number(x) || 150"-Stellen im Popup nicht auf
    // die alten Standardwerte zurueck, und JSON kann die Zahl speichern.
    OHNE_GRENZE: 1e9,
    // FST-Modus (01.10.2026, Einstellung "Ohne eigene Grenzen"). Diese Zahlen
    // werden NUR gelesen, wenn STATE.fstModus === true ist. Quelle: FUT Simple
    // Trader scripts.js (Zeilen jeweils dabei). Der strenge Modus ignoriert sie.
    FST: {
      // Preis-Check: FST braucht je Schritt rund 3,2-3,6 s (Suche, Antwort alle
      // 400 ms pruefen, 1500 ms, zurueck, 1000 ms; Z. 27117-27160). Unser Abstand
      // kommt zur Antwortzeit dazu: 2900-3400 ms zufaellig, wie vorher streng
      // rund 3 s plus Antwortzeit. (Frueher stand hier faelschlich 1000 ms.)
      CHECK_INTERVAL_MIN_MS: 2900,
      CHECK_INTERVAL_MAX_MS: 3400,
      ROT_PAUSE_MIN_MS: 60000, // Rotation: Regler 60-600 s (Z. 41940-41946)
      ROT_PAUSE_MAX_MS: 1080000, // 900 s lange Ruhe plus 20 % Streuung
      SPRUNG_MIN_SUCHEN: 21, // "Naechster Filter": unter 21 Suchen ... (Z. 57641-57655)
      SPRUNG_PAUSE_MS: 60000, // ... gibt es 60 s Pause
      BID_GAP_MIN_MS: 3800, // Gebote: Abstand 3800-5500 ms
      BID_GAP_MAX_MS: 5500,
      VERKAUF_ABSTAND_MIN_MS: 1100, // vor dem Abraeumen (Z. 58527-58531)
      VERKAUF_ABSTAND_MAX_MS: 1800,
      VERKAUF_CHECK_EVERY_SEARCHES: 8, // Verkaufskontrolle alle 8 Suchen (Z. 58573-58587)
      // "Gleich verkaufen" (Punkt 9): Nach dem Einstellen 3000-5000 ms Ruhe, dann
      // erst die naechste Suche (Z. 58309-58312). Vor der Verkaufskontrolle
      // (jede 8. Suche) 980-1270 ms (Z. 58573-58587).
      GLEICH_NACH_MIN_MS: 3000,
      GLEICH_NACH_MAX_MS: 5000,
      KONTROLLE_VOR_MIN_MS: 980,
      KONTROLLE_VOR_MAX_MS: 1270,
      // Netzfehler, Zeitueberschreitungen und unlesbare Antworten in Folge, bei
      // denen der Lauf noch weitersucht. Danach: "Keine Verbindung zu EA".
      NETZ_FEHLER_MAX: 10,
      // Zaehler wird gekappt, damit Speicher und Statusnachricht nicht wachsen.
      // Bei der Kappung zeigt die Leiste "1500+" (Punkt 8; frueher 2000).
      ZAEHLER_MAX_SUCHEN: 1500,
      ZAEHLER_MAX_ANDERE: 1000
    }
  };
  const DAY = 24 * 60 * 60 * 1000;

  // Statuscodes, bei denen sofort Schluss ist – hier muss ein Mensch ran.
  // Die Zahlen ab 440 stammen aus UtasErrorCode der laufenden FC Web App
  // (Diagnose "Schnittstelle prüfen", 20.09.2026) und sind damit belegt.
  // 401, 403, 426, 429, 512 und 521 stehen nicht in diesem Enum: das ist HTTP-Ebene.
  const HARD_STOP = {
    401: "Sitzung ungültig. Web App neu laden.",
    403: "Zugriff verweigert.",
    // Live am 22.09.2026: der zweite Kauf aus derselben Suche kam mit 426
    // zurueck, gut 4 Min. spaeter folgte 461. Frueher zaehlte 426 nur als
    // gewoehnlicher Kauffehler - der Bot lief einfach weiter.
    426: "EA hat einen Kauf abgelehnt (HTTP 426). Kam am 22.09. direkt vor einer Sperre.",
    429: "EA meldet zu viele Anfragen (HTTP 429).",
    458: "EA verlangt eine Verifizierung (Captcha). Bitte selbst in der Web App lösen.",
    461: "Aktion nicht erlaubt (PERMISSION_DENIED). Web App neu laden und Konto prüfen.",
    465: "EA kennt die Sitzung nicht mehr (NO_USER). Web App neu laden.",
    468: "Auf der Konsole angemeldet – die Web-Sitzung ist damit beendet.",
    470: "Nicht genug Coins (NOT_ENOUGH_CREDIT).",
    473: "Ziel ist voll (DESTINATION_FULL). Transferliste oder Verein aufräumen.",
    474: "Auf der Konsole angemeldet – die Web-Sitzung ist damit beendet.",
    480: "Dieser Dienst ist bei EA gerade abgeschaltet (SERVICE_IS_DISABLED).",
    489: "Zu viele Anlegeversuche (DID_CREATE_EXCEEDED). Länger pausieren.",
    490: "Zu viele Anmeldungen (DID_LOGIN_EXCEEDED). Länger pausieren.",
    491: "Gerät gesperrt (DEVICE_SUSPENDED).",
    494: "Transfermarkt ist für dieses Konto gesperrt (LOCKED_TRANSFER_MARKET).",
    512: "Temporäre Sperre oder zu viele Anfragen.",
    521: "Temporäre Sperre oder zu viele Anfragen.",
    20000: "Konto gesperrt (ACCOUNT_BANNED).",
    20001: "EA verlangt eine neuere Web App (UPDATE_REQUIRED). Seite neu laden.",
    20003: "Zugriff aus dieser Region abgelehnt (GEOIP_DENIED).",
    20004: "Nicht behebbarer Fehler (UNRECOVERABLE). Web App neu laden."
  };

  // Nach diesen Antworten wird der Start fuer eine Weile gesperrt, in Minuten.
  // Ein Captcha heisst: EA hat nachgefragt, ob hier ein Mensch sitzt. Fuenf
  // Minuten spaeter weiterzumachen beantwortet die Frage auf die falsche Art.
  const COOLDOWN_CODES = {
    426: 60, // Vorbote von 461, siehe HARD_STOP
    // Frueher nur 2-4 s Pause (2^Treffer, nach jeder guten Suche wieder 0) -
    // kuerzer als der normale Suchabstand, also praktisch keine Bremse.
    429: 15,
    458: 60, // CAPTCHA_REQUIRED
    // PERMISSION_DENIED: live am 22.09.2026 gut 4 Min. nach zwei Kaeufen in
    // derselben Sekunde (der zweite mit HTTP 426). Sofort neu zu starten
    // haette EA nur weiter gereizt - also eine Stunde Ruhe wie beim Captcha.
    461: 60,
    494: 120, // LOCKED_TRANSFER_MARKET
    512: 120,
    521: 120,
    491: 240, // DEVICE_SUSPENDED
    20000: 240 // ACCOUNT_BANNED
  };

  // Kauf-Antworten, die bedeuten: Angebot war schon weg. Normal, kein Fehler.
  // 461 stand hier frueher falsch drin. Das ist PERMISSION_DENIED und gehoert
  // zu den harten Stopps: Sonst verbucht der Bot ein echtes Rechteproblem als
  // harmlosen Fehlschlag, setzt den Fehlerzaehler zurueck und macht weiter.
  const ITEM_GONE = new Set([
    475, // NO_CARD_EXISTS – die Karte gibt es nicht mehr
    478, // NO_TRADE_EXISTS – die Auktion ist weg
    479 // INVALID_OWNER – jemand anderes war schneller
  ]);

  // Die Session-ID geht nur an EA-Hosts mit /ut/game/<spiel>.
  const API_RE = /^(https:\/\/[a-z0-9.-]+\.ea\.com\/ut\/game\/[a-z0-9]+)(?:[/?#]|$)/i;
  // Die Namensliste heisst players.json. Daneben laedt die Web App noch
  // players_icons.json ({iconId, playerId}) und players_meta.json
  // (Attributwerte) - beide passen auf dasselbe grobe Muster, enthalten aber
  // keinen einzigen Namen.
  //
  // Am lebenden Objekt gemessen, nachdem im Protokoll zweimal "Spielerliste
  // uebersprungen (0 Eintraege)" stand: Der Rueckfallweg nahm die LETZTE
  // passende Adresse - und das war players_icons.json. Die Namenssuche blieb
  // deshalb auf einer alten gespeicherten Liste sitzen; neue Spieler fehlten.
  const PLAYERS_RE = /^https:\/\/[a-z0-9.-]+\.ea\.com\/[^?#]*player[^/?#]*\.json(?:[?#]|$)/i;
  const PLAYERS_NICHT_RE = /(?:_icons|_meta)\.json(?:[?#]|$)/i;

  function istSpielerliste(url) {
    return PLAYERS_RE.test(url) && !PLAYERS_NICHT_RE.test(url);
  }

  // Exakt "players.json" zuerst, alles andere nur als Versuch danach.
  function spielerlistenKandidaten() {
    const rang = (url) => (url.split(/[?#]/)[0].split("/").pop().toLowerCase() === "players.json" ? 0 : 1);
    return resourceUrls().filter(istSpielerliste).sort((a, b) => rang(a) - rang(b));
  }
  // Spielerbilder der Web App, z. B. .../items/images/mobile/portraits/231747.png
  const PORTRAIT_RE = /^(https:\/\/[a-z0-9.-]+\.ea\.com\/[^?#]*\/portraits\/(?:[^?#]*\/)?)(\d+)(\.(?:png|webp|jpe?g))(?:[?#]|$)/i;
  const IMAGE_PREFIX_RE = /^https:\/\/[a-z0-9.-]+\.ea\.com\/[^?#]*\/fut\/items\/images\/mobile\/portraits\/$/i;

  const SESSION = { sid: null, base: null };
  const PLAYERS = { merged: new Map(), seen: false, loading: false, fallbackAt: 0 };
  const IMAGES = { prefix: null, suffix: null, source: null };

  const STATE = {
    // FST-Modus (01.10.2026): true = "Ohne eigene Grenzen". Wird NUR in
    // applyAutomationSettings gesetzt. Der Startwert ist false (streng):
    // Bis die Einstellung gelesen ist, gilt immer die sichere Richtung.
    // Im ganzen Motor wird er inline als "STATE.fstModus === true" geprueft.
    fstModus: false,
    // Punkt 7 (Modus pro Lauf): fstModus oben ist der WIRKSAME Wert. Waehrend
    // eines Laufs gilt der Wert vom Start (run.fst), egal was inzwischen in den
    // Einstellungen steht. fstEinst ist der Haken aus den Einstellungen; er
    // wird erst beim naechsten Start (oder im Leerlauf) uebernommen.
    fstEinst: false,
    running: false,
    token: 0,
    cfg: null,
    run: null, // { token, cfg, stats, perTarget, startedAt, reason }
    stats: newStats(),
    credits: null,
    creditsAt: 0, // wann EA diesen Stand zuletzt gemeldet hat
    // Woher der Stand kommt: "ea" = aus EAs Antwort, "seite" = aus der
    // Kopfzeile der Web App abgelesen (nur, solange EA noch nichts gemeldet hat).
    creditsQuelle: null,
    message: "Bereit.",
    level: "idle",
    seen: new Set(),
    searchErrors: 0,
    buyErrors: 0,
    // Nur FST-Modus (Punkt 6): Netzfehler, Zeitueberschreitungen und
    // unlesbare Antworten in Folge. Ein Erfolg setzt auf 0.
    netzErrors: 0,
    rateLimitHits: 0,
    pauseUntil: 0,
    // Wachsende Pause nach unklaren Antworten von EA (25.09.2026).
    // bremsStufe zaehlt die Bremsungen in Folge, bremsBis ist der Zeitpunkt,
    // ab dem wieder angefragt werden darf.
    bremsStufe: 0,
    bremsBis: 0,
    lastMismatchLog: 0,
    check: { running: false, token: 0, searches: 0, error: null, message: "" },
    // phase: "aufnahme" (Marktaufnahme) oder "preise" (Zielsuchen und Tasten)
    marketScan: { running: false, token: 0, searches: 0, phase: "", error: null, message: "" },
    usage: { searchesHour: 0, searchesDay: 0, buysDay: 0 },
    cardCounts: {}, // Aktionen je Karte in den letzten 24 Stunden
    health: { times: [], slowStreak: 0, slow: false, throttle: "" },
    cooldownUntil: 0, // nach einem Captcha gesperrt bis
    ausnahme: null, // { extra, bis } - zeitlich begrenzte Ausnahme vom Tageslimit
    autoFilters: false,
    preisMethode: "empfohlen", // Preis-Methode aus den Einstellungen (F1)
    preisStufen: 0, // Verkaufspreis um ganze Preisstufen verschieben (27.09.2026)
    // Preisdeckel wie FST (28.09.2026): true heisst, die Markt-Bremse ist aus
    // und es zaehlt nur der Anker-Deckel. Standard false = alles wie bisher.
    deckelFst: false,
    nurSuchseite: true, // App-Suchweg: nur mit offener EA-Suchseite (F5)
    verkaufWache: true, // waehrend des Laufs in die Transferliste sehen (F3)
    letzterStopp: null, // { code, message, level, t } - fuer die Rotation (F4)
    // Letzte Verlaengerung eines Live-Filters durch die Filter-Wache
    // (27.09.2026): { key, bis, angebote, at }. Reine Meldung an die Leiste.
    // Der PREIS wird dabei nicht neu datiert - dazu unten bei filterWache.
    filterVerlaengert: null,
    autoAbraeumen: false, // verkaufte Karten selbst abraeumen, wenn die Liste voll ist
    // Festpreis fuer "Gleich verkaufen" (27.09.2026). 0 = aus, dann rechnet der
    // Bot den Preis selbst. Vorbild: FSTs listBuyNowPrice - eine getippte Zahl,
    // die nie veraltet.
    listFestpreis: 0,
    scanMaxPrice: 0, // zuletzt gewaehlter Hoechstpreis des Markt-Scans, 0 = Standard
    // Filter des letzten Markt-Scans (Kartenart, Qualitaet, Position,
    // Nation, Liga, Chemie). Leer = ueber den ganzen Markt suchen.
    scanFilter: {},
    itemFields: null, // was EA in den Suchtreffern mitliefert, siehe noteItemFields
    probe: null // Diagnose der Web-App-Schnittstelle, siehe acceptProbe()
  };

  // Genau die Dienste, nach denen sniffer.js schaut. Alles andere aus der
  // Antwort wird verworfen: die Seite koennte hier beliebigen Unsinn schicken.
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
  // UTTransferListViewController kam am 27.09.2026 dazu: An dieser Klasse
  // haengt FSTs Abraeum-Weg (_clearSold). Ohne sie geht er nicht.
  const PROBE_GLOBALS = ["services", "repositories", "appMain", "rootViewController", "ItemPile", "UtasErrorCode", "UTSearchCriteriaDTO", "UTTransferListViewController"];
  const PROBE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;

  let usageChain = Promise.resolve();
  let autoScanTimer = null;

  class HardStop extends Error {}

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const log = (...args) => console.log("%c[OwnBot]", "color:#2d8;font-weight:bold", ...args);
  const warn = (...args) => console.warn("%c[OwnBot]", "color:#fc6;font-weight:bold", ...args);
  // Coin-Betraege in Meldungen und Verlauf: deutsch mit Tausenderpunkt (12.500).
  const fmt = (n) => (Number(n) || 0).toLocaleString("de-DE");

  const LOG_MAX = 5000; // Eintraege je Log (Kaeufe, Verkaeufe, Gebote, Laeufe)

  function newStats() {
    return { scans: 0, bought: 0, spent: 0, bids: 0, bidCommitted: 0, bidsWon: 0, bidsLost: 0, bidsOutbid: 0, bidsUnconfirmed: 0, missed: 0, errors: 0 };
  }

  function setMessage(message, level) {
    STATE.message = message;
    STATE.level = level;
  }

  function pushEvent(type, text) {
    if (!STATE.run) return;
    if (!STATE.run.recentEvents) STATE.run.recentEvents = [];
    STATE.run.recentEvents.push({
      t: Date.now(),
      type,
      text: String(text || "")
    });
    if (STATE.run.recentEvents.length > 30) STATE.run.recentEvents.shift();
  }

  function str(value, max) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
  }

  function toInt(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.floor(n) : NaN;
  }

  const bin = (auction) => Number(auction.buyNowPrice);
  const currentBid = (auction) => Number(auction.currentBid) || 0;
  const nextBid = (auction) => {
    const current = currentBid(auction);
    const start = Number(auction.startingBid) || 0;
    return current > 0 ? current + stepFor(current) : start;
  };
  function secondsLeft(auction) {
    const raw = Number(auction.expires ?? auction.expiresAt);
    if (!(raw > 0)) return Infinity;
    if (raw < 86400 * 7) return raw;
    const millis = raw > 100000000000 ? raw : raw * 1000;
    return Math.max(0, Math.ceil((millis - Date.now()) / 1000));
  }

  // Lesen-Aendern-Schreiben nacheinander, damit sich Updates nicht ueberholen.
  let storageChain = Promise.resolve();
  function updateStorage(key, update) {
    storageChain = storageChain
      .then(async () => {
        const current = (await chrome.storage.local.get(key))[key];
        await chrome.storage.local.set({ [key]: update(current) });
      })
      .catch((e) => speicherFehler(key, e));
    return storageChain;
  }

  // ---------------------------------------------------------------------------
  // Speicherplatz im Blick behalten (25.09.2026).
  //
  // chrome.storage.local hat eine feste Grenze (rund 10 MB; die Erweiterung
  // hat kein unlimitedStorage). Preis-Verlauf, Kauf-Liste, Preis-Gedaechtnis,
  // Filterlisten und Spielerbilder wachsen mit jedem Tag. Ist die Grenze
  // erreicht, schlaegt jedes Speichern fehl - und alle unsere Schreibversuche
  // fangen den Fehler still ab. Der Bot liefe dann weiter, wuerde sich aber
  // nichts mehr merken: keine Sicherheitszaehler, kein Kauflog, keine Sperre
  // ueber ein Neuladen hinweg. Darum wird gemessen und gewarnt, BEVOR es
  // klemmt. FST prueft das nirgends.
  // ---------------------------------------------------------------------------
  const SPEICHER = {
    bytes: 0,
    grenze: 0,
    anteil: 0,
    warnAb: 0.8, // ab 80 % voll wird gewarnt
    letzteWarnung: 0
  };
  const SPEICHER_PRUEF_MS = 10 * 60 * 1000;
  const SPEICHER_WARN_ABSTAND_MS = 60 * 60 * 1000; // hoechstens stuendlich nerven

  async function speicherPruefen() {
    if (!extensionAlive()) return;
    try {
      // Seit "unlimitedStorage" im manifest.json (28.09.2026) gibt es die
      // 10-MB-Grenze nicht mehr. QUOTA_BYTES steht zwar weiter auf 10 MB,
      // aber die Zahl gilt dann nicht - eine Warnung "80 % von 10 MB voll"
      // waere gelogen und wuerde zum Aufraeumen raten, obwohl nichts drueckt.
      //
      // Gewarnt wird jetzt ab einer absoluten Menge, bei der wirklich etwas
      // faul waere (ein Leck, ein Endlos-Log): 200 MB. Zum Vergleich: Die
      // Spielerliste, das groesste Einzelstueck, hat rund 2 MB; die vier
      // Logs zusammen unter 3 MB.
      const grenze = 200 * 1024 * 1024;
      const belegt = Number(await chrome.storage.local.getBytesInUse(null)) || 0;
      SPEICHER.bytes = belegt;
      SPEICHER.grenze = grenze;
      SPEICHER.anteil = grenze > 0 ? belegt / grenze : 0;
      if (SPEICHER.anteil < SPEICHER.warnAb) return;
      if (Date.now() - SPEICHER.letzteWarnung < SPEICHER_WARN_ABSTAND_MS) return;
      SPEICHER.letzteWarnung = Date.now();
      const text = "Der Speicher der Erweiterung ist ungewöhnlich groß geworden (" +
        Math.round(belegt / 1024 / 1024) + " MB). Das ist mehr, als der Bot je braucht – " +
        "wahrscheinlich stimmt etwas nicht. Bitte unter Optionen aufräumen.";
      warn(text);
      pushEvent("warn", text);
      notify(text);
    } catch (e) {
      warn("Speicherstand nicht messbar: " + e.message);
    }
  }

  // Scheitert das Speichern trotzdem, ist der Punkt erreicht, an dem es
  // wirklich klemmt. Das darf nicht nur in der Konsole stehen.
  function speicherFehler(key, e) {
    warn("Speichern fehlgeschlagen (" + key + "): " + e.message);
    if (/quota/i.test(String(e && e.message))) {
      notify("Speicher voll: „" + key + "“ konnte nicht gespeichert werden. Bitte unter Optionen aufräumen.");
      speicherPruefen();
    }
  }

  function pruneUsage(raw, now) {
    const data = raw && typeof raw === "object" ? raw : {};
    // Aktionen je Karte, ueber Laeufe hinweg. Erfahrungswert aus der Praxis:
    // mehr als 20 Transaktionen auf derselben Karte an einem Tag faellt auf.
    const cards = {};
    const rohKarten = data.cards && typeof data.cards === "object" && !Array.isArray(data.cards) ? data.cards : {};
    for (const key of Object.keys(rohKarten)) {
      // Die Kartenart gehoert ins Muster (25.09.2026). priceKey haengt sie
      // seit dem 24.09. an den Schluessel ("204935:87:3") - dieses Muster
      // kannte sie nicht. Jeder Schluessel mit Kartenart flog beim naechsten
      // Aufraeumen raus, und damit stand der Zaehler fuer Sonderkarten bei
      // jeder Anfrage wieder bei 0: Das Tageslimit von 20 Aktionen auf
      // dieselbe Karte wirkte dort ueberhaupt nicht mehr. Selbst gerissen,
      // selbst gefunden - ein Loch im Kontoschutz, das genau eine Zeile weit war.
      if (!/^\d{1,12}:\d{1,3}(:\d{1,3})?$/.test(key)) continue;
      const zeiten = (Array.isArray(rohKarten[key]) ? rohKarten[key] : [])
        .filter((t) => Number(t) > now - DAY)
        .slice(-CONFIG.CARD_LIMIT_DAY);
      if (zeiten.length) cards[key] = zeiten;
    }
    return {
      // Gekappt wird auf das HOECHSTE moegliche Tageslimit, nicht auf 350.
      // Sonst bliebe der Zaehler mit Ausnahme bei 350 stehen und das
      // wirksame Limit wuerde nie erreicht - der Bot saehe kein Ende.
      searches: (Array.isArray(data.searches) ? data.searches : []).filter((t) => Number(t) > now - DAY).slice(-suchKappung()),
      buys: (Array.isArray(data.buys) ? data.buys : []).filter((t) => Number(t) > now - DAY).slice(-(STATE.fstModus === true ? CONFIG.FST.ZAEHLER_MAX_ANDERE : CONFIG.BUY_LIMIT_DAY)),
      // Verschieben und Einstellen. Bis 22.09.2026 lief das voellig ungezaehlt.
      aktionen: (Array.isArray(data.aktionen) ? data.aktionen : []).filter((t) => Number(t) > now - DAY).slice(-(STATE.fstModus === true ? CONFIG.FST.ZAEHLER_MAX_ANDERE : CONFIG.ACTION_LIMIT_DAY)),
      cards
    };
  }

  // ---------------------------------------------------------------------------
  // Ausnahme vom Tageslimit. Nach einer EA-Sperre kann der Nutzer sie im Popup
  // bewusst einschalten: dann gelten fuer 6 Stunden 150 Suchen mehr am Tag.
  // Nach Ablauf gilt wieder das normale Limit. Liegt der Zaehler dann darueber,
  // sucht der Bot nicht, bis genug alte Suchen aus den 24 Stunden fallen.
  // ---------------------------------------------------------------------------
  function suchKappung() {
    // FST-Modus: kein Tageslimit. Gekappt wird nur, damit der Speicher nicht waechst.
    if (STATE.fstModus === true) return CONFIG.FST.ZAEHLER_MAX_SUCHEN;
    return CONFIG.SEARCH_LIMIT_DAY + Math.max(0, Number(CONFIG.AUSNAHME_EXTRA) || 0);
  }

  // Nur plausible Werte gelten: hoechstens die eingebaute Zahl extra und
  // hoechstens die eingebaute Dauer ab jetzt. Alles andere ist keine Ausnahme.
  function pruefeAusnahme(roh, now) {
    if (!roh || typeof roh !== "object") return null;
    const extra = Math.floor(Number(roh.extra));
    const bis = Math.floor(Number(roh.bis));
    const maxExtra = Number(CONFIG.AUSNAHME_EXTRA) || 0;
    const maxDauer = Number(CONFIG.AUSNAHME_DAUER_MS) || 0;
    if (!(extra > 0) || extra > maxExtra) return null;
    if (!(bis > now) || bis > now + maxDauer) return null;
    return { extra, bis };
  }

  function ausnahmeAktiv(now) {
    const a = STATE.ausnahme;
    return Boolean(a && a.extra > 0 && a.bis > (now || Date.now()));
  }

  // Das Limit, das gerade wirklich gilt.
  // Die Grenzen sind seit 25.09.2026 einstellbar (Optionen > Grenzen).
  //
  // Anlass: Der Bot laeuft jetzt mit FSTs Tempo (3,3-4,6 Sekunden je Suche).
  // FST hat gar kein Stundenlimit, wir haben 150. Damit ist das Stundenlimit
  // nach gut zehn Minuten erreicht, und der Bot wartet den Rest der Stunde.
  // Wer das schnelle Tempo wirklich nutzen will, muss die Grenze anheben
  // koennen - das ist die Entscheidung des Nutzers, nicht des Bots.
  //
  // Die Standardwerte bleiben, wie sie waren. Wer nichts einstellt, faehrt
  // genau wie bisher. Angehoben wird nur, was ausdruecklich eingetragen wird,
  // und die Oberflaeche sagt dabei klar, was auf dem Spiel steht: Bei diesem
  // Konto kam HTTP 521 schon bei rund 450 Suchen am Tag.
  //
  // Nach unten ist immer erlaubt - vorsichtiger darf man immer sein.
  // Bewusst ohne toInt(): Diese Funktion liegt im Schutz-Teil und soll so
  // wenig wie moeglich voraussetzen. Number("") und Number(null) sind beide
  // 0 und fallen damit auf den Standardwert zurueck - genau richtig.
  function grenzeLesen(name, standard, hoechstens) {
    const wert = STATE.grenzen ? STATE.grenzen[name] : null;
    // Nur eine Zahl oder ein Zahlentext zaehlt. Number(true) waere 1 - und
    // eine Grenze von einer Suche pro Stunde ist keine Einstellung, sondern
    // ein Unfall. Solche Werte koennen aus einer alten oder fremden
    // Sicherungsdatei kommen.
    if (typeof wert !== "number" && typeof wert !== "string") return standard;
    const roh = Number(wert);
    if (!Number.isFinite(roh) || roh <= 0) return standard;
    return Math.min(Math.floor(roh), hoechstens);
  }

  // Wie viele SUCHEN in eine Stunde passen, wenn der harte Riegel greift
  // (27.09.2026). Der Riegel gilt fuer alle Anfragen zusammen; fuer die Suchen
  // bleibt davon der Deckel minus dem Abstand, den Kaeufe und Aktionen
  // brauchen. Gerechnet, nicht getippt - so bleibt es richtig, wenn jemand
  // spaeter eine der drei Zahlen aendert.
  function suchDeckelStunde() {
    if (STATE.fstModus === true) return CONFIG.OHNE_GRENZE;
    return CONFIG.GESAMT_MAX_STUNDE - (CONFIG.GESAMT_LIMIT_HOUR - CONFIG.SEARCH_LIMIT_HOUR);
  }

  function suchLimitStunde() {
    if (STATE.fstModus === true) return CONFIG.OHNE_GRENZE;
    // Zwei Bremsen hintereinander: grenzeLesen faengt den Tippfehler ab
    // (GRENZE_MAX_STUNDE), suchDeckelStunde den Sperr-Riegel. Der Standard von
    // 150 liegt unter beiden - fuer ihn aendert sich nichts.
    return Math.min(grenzeLesen("suchStunde", CONFIG.SEARCH_LIMIT_HOUR, CONFIG.GRENZE_MAX_STUNDE), suchDeckelStunde());
  }

  function suchLimitTag(now) {
    if (STATE.fstModus === true) return CONFIG.OHNE_GRENZE;
    const basis = grenzeLesen("suchTag", CONFIG.SEARCH_LIMIT_DAY, CONFIG.GRENZE_MAX_TAG);
    return basis + (ausnahmeAktiv(now) ? STATE.ausnahme.extra : 0);
  }

  // Der Deckel ueber allem waechst mit, sonst braechte eine hoehere
  // Suchgrenze gar nichts - die Gesamtbremse haette sie sofort wieder
  // eingefangen. Der Abstand zwischen beiden bleibt derselbe wie vorher.
  function gesamtLimitStunde() {
    if (STATE.fstModus === true) return CONFIG.OHNE_GRENZE;
    const suchen = suchLimitStunde();
    // Nie mehr als die harte Stundengrenze - genau so, wie gesamtLimitTag()
    // nie ueber GESAMT_MAX_TAG geht (27.09.2026). Das war der fehlende Riegel:
    // Beim Tag gab es ihn, bei der Stunde nicht.
    return Math.min(suchen + (CONFIG.GESAMT_LIMIT_HOUR - CONFIG.SEARCH_LIMIT_HOUR), CONFIG.GESAMT_MAX_STUNDE);
  }

  // Alles zusammen, was an einem Tag zu EA rausgehen darf: Suchen, Kaeufe und
  // Aktionen. Waechst mit der Ausnahme mit, aber nie ueber die harte Grenze.
  function gesamtLimitTag(now) {
    if (STATE.fstModus === true) return CONFIG.OHNE_GRENZE;
    return Math.min(suchLimitTag(now) + CONFIG.GESAMT_PUFFER_TAG, CONFIG.GESAMT_MAX_TAG);
  }

  function ausnahmeStand() {
    const aktiv = ausnahmeAktiv();
    return {
      aktiv,
      extra: aktiv ? STATE.ausnahme.extra : Number(CONFIG.AUSNAHME_EXTRA) || 0,
      bis: aktiv ? STATE.ausnahme.bis : 0,
      stunden: Math.round((Number(CONFIG.AUSNAHME_DAUER_MS) || 0) / 3600000)
    };
  }

  // Waehrend einer Sperre bringt die Ausnahme nichts - die Sperre gewinnt
  // immer. Darum wird sie dann gar nicht erst eingeschaltet.
  function ausnahmeStarten() {
    if (STATE.fstModus === true) return { ok: false, error: "Im FST-Modus gibt es kein Tageslimit." };
    if (STATE.running) return { ok: false, error: "Der Bot läuft gerade. Erst stoppen." };
    const gesperrt = cooldownBlock();
    if (gesperrt) return { ok: false, error: gesperrt + " Die Ausnahme hilft während einer Sperre nicht." };
    STATE.ausnahme = { extra: CONFIG.AUSNAHME_EXTRA, bis: Date.now() + CONFIG.AUSNAHME_DAUER_MS };
    Promise.resolve(chrome.storage.local.set({ limitAusnahme: STATE.ausnahme })).catch(() => {});
    warn("Ausnahme vom Tageslimit aktiv: +" + STATE.ausnahme.extra + " Suchen bis " + new Date(STATE.ausnahme.bis).toLocaleTimeString());
    return { ok: true };
  }

  function ausnahmeBeenden() {
    STATE.ausnahme = null;
    Promise.resolve(chrome.storage.local.set({ limitAusnahme: null })).catch(() => {});
    log("Ausnahme vom Tageslimit beendet.");
    return { ok: true };
  }

  async function loadAusnahme() {
    const { limitAusnahme } = await chrome.storage.local.get("limitAusnahme");
    STATE.ausnahme = pruefeAusnahme(limitAusnahme, Date.now());
  }

  function updateUsageState(data, now) {
    // Die Zeitstempel merken: status() rechnet damit nach, auch ohne neue Suche.
    STATE.usageDaten = data;
    STATE.usage.searchesDay = data.searches.length;
    STATE.usage.searchesHour = data.searches.filter((t) => t > now - 60 * 60 * 1000).length;
    STATE.usage.buysDay = data.buys.length;
    STATE.usage.aktionenDay = data.aktionen.length;
    STATE.cardCounts = {};
    for (const key of Object.keys(data.cards)) STATE.cardCounts[key] = data.cards[key].length;
  }

  // Wann faellt die 1., 2., 3. ... Suche aus dem gleitenden Stundenfenster?
  // (25.09.2026) Die Rotation brach bei knappem Budget bisher mit "Mach
  // lieber eine Pause" ab, ohne zu sagen wie lange. Mit dieser Liste kann die
  // Leiste eine ehrliche Wartezeit nennen. Gelesen wird nur die eigene
  // Zaehlung - keine EA-Anfrage, und kein Limit wird dadurch weicher.
  // 60 Eintraege reichen: mehr Suchen braucht ein einzelner Filter nie.
  const FREI_LISTE_MAX = 60;

  function stundenFensterFrei() {
    const jetzt = Date.now();
    const stunde = 60 * 60 * 1000;
    const liste = STATE.usageDaten && Array.isArray(STATE.usageDaten.searches) ? STATE.usageDaten.searches : [];
    return liste
      .filter((t) => Number(t) > jetzt - stunde)
      .sort((a, b) => a - b)
      .slice(0, FREI_LISTE_MAX)
      .map((t) => Math.max(0, Math.round(t + stunde - jetzt)));
  }

  function cardCount(key) {
    return (STATE.cardCounts && STATE.cardCounts[key]) || 0;
  }

  function reserveUsage(kind, cardKey) {
    let failure = null;
    usageChain = usageChain.catch(() => {}).then(async () => {
      // Zuerst die Abkuehlzeit. Erst hier in der Warteschlange geprueft, damit
      // eine Sperre, die eine andere Anfrage gerade ausgeloest hat, auch fuer
      // alle schon wartenden gilt. Gezaehlt wird dann nichts - es geht ja
      // nichts raus.
      const gesperrt = cooldownBlock();
      if (gesperrt) {
        failure = gesperrt;
        return;
      }
      const now = Date.now();
      const stored = await chrome.storage.local.get("safetyUsage");
      const data = pruneUsage(stored.safetyUsage, now);
      const hour = data.searches.filter((t) => t > now - 60 * 60 * 1000).length;
      const karte = typeof cardKey === "string" ? cardKey : "";
      // Das Kartenlimit steht bewusst NICHT hier: Es soll nur diese eine Karte
      // ueberspringen, nicht den Lauf beenden. Geprueft wird es in
      // canTransact und filterAvailable, gezaehlt wird es hier.
      // Tageslimit fuer Suchen: das wirksame, also mit gueltiger Ausnahme
      // hoeher. Das Stundenlimit davor gilt immer unveraendert.
      const limitTag = suchLimitTag(now);
      // Stunde und Tag fuer JEDE Art, dazu der Deckel ueber allem (23.09.2026).
      // EA zaehlt jede Anfrage, nicht nur Suchen - deshalb zaehlen wir sie hier
      // auch zusammen.
      const seitEinerStunde = (liste) => liste.filter((t) => t > now - 60 * 60 * 1000).length;
      const kaufStunde = seitEinerStunde(data.buys);
      const aktionStunde = seitEinerStunde(data.aktionen);
      const gesamtStunde = hour + kaufStunde + aktionStunde;
      const gesamtTag = data.searches.length + data.buys.length + data.aktionen.length;
      const gesamtTagLimit = gesamtLimitTag(now);
      const limitStunde = suchLimitStunde();
      // FST-Modus: FST kennt hier nichts. Es wird nur gezaehlt (Anzeige), nie
      // abgelehnt und keine Karte mitgefuehrt. Der strenge Zweig darunter ist
      // unveraendert.
      if (STATE.fstModus === true) {
        if (kind === "search") data.searches.push(now);
        else if (kind === "aktion") data.aktionen.push(now);
        else data.buys.push(now);
      } else
      if (kind === "search" && hour >= limitStunde) failure = "Sicherheitslimit erreicht: " + limitStunde + " Suchen pro Stunde.";
      else if (kind === "search" && data.searches.length >= limitTag) failure = "Tageslimit erreicht: " + limitTag + " Suchen" + (ausnahmeAktiv(now) ? " (mit Ausnahme)." : ".");
      else if (kind === "buy" && kaufStunde >= CONFIG.BUY_LIMIT_HOUR) failure = "Sicherheitslimit erreicht: " + CONFIG.BUY_LIMIT_HOUR + " Kaufversuche pro Stunde.";
      else if (kind === "buy" && data.buys.length >= CONFIG.BUY_LIMIT_DAY) failure = "Tageslimit erreicht: " + CONFIG.BUY_LIMIT_DAY + " Kaufversuche.";
      else if (kind === "aktion" && aktionStunde >= CONFIG.ACTION_LIMIT_HOUR) failure = "Sicherheitslimit erreicht: " + CONFIG.ACTION_LIMIT_HOUR + " Aktionen pro Stunde.";
      else if (kind === "aktion" && data.aktionen.length >= CONFIG.ACTION_LIMIT_DAY) failure = "Tageslimit erreicht: " + CONFIG.ACTION_LIMIT_DAY + " Aktionen (Verschieben und Einstellen).";
      else if (gesamtStunde >= gesamtLimitStunde()) failure = "Sicherheitslimit erreicht: " + gesamtLimitStunde() + " EA-Anfragen pro Stunde (alles zusammen).";
      else if (gesamtTag >= gesamtTagLimit) failure = "Tageslimit erreicht: " + gesamtTagLimit + " EA-Anfragen (alles zusammen).";
      else if (kind === "search") data.searches.push(now);
      else if (kind === "aktion") {
        data.aktionen.push(now);
        if (karte) data.cards[karte] = (data.cards[karte] || []).concat([now]);
      } else {
        data.buys.push(now);
        if (karte) data.cards[karte] = (data.cards[karte] || []).concat([now]);
      }
      updateUsageState(data, now);
      await chrome.storage.local.set({ safetyUsage: data });
    });
    return usageChain.then(() => {
      if (failure) throw new HardStop(failure);
    });
  }

  // ---------------------------------------------------------------------------
  // Wiederholte Warnungen von EA werden immer ernster genommen.
  // Live am 22.09.2026: 461 um 13:02 und wieder um 16:02 - jeweils nach einer
  // Stunde Pause. Eine Stunde war zu kurz. Jetzt dauert jede Sperre innerhalb
  // von 24 Stunden nach einer frueheren sechsmal so lang (hoechstens 24 Std.):
  // 461 zum Beispiel 1 Std. -> 6 Std. -> 24 Std.
  // ---------------------------------------------------------------------------
  const ESKALATION_FAKTOR = 6;
  const SPERRE_MAX_MIN = 24 * 60;
  const VORFAELLE = { liste: [] };

  function vorfaelleUebernehmen(roh) {
    const grenze = Date.now() - 7 * DAY;
    VORFAELLE.liste = (Array.isArray(roh) ? roh : [])
      .filter((v) => v && Number(v.t) > grenze && Number(v.t) <= Date.now() + 60000)
      .map((v) => ({ t: Number(v.t), code: toInt(v.code) || 0 }))
      .slice(-50);
  }

  function vorfallMerken(code) {
    VORFAELLE.liste = VORFAELLE.liste.concat([{ t: Date.now(), code: toInt(code) || 0 }]).slice(-50);
    chrome.storage.local.set({ sperrVorfaelle: VORFAELLE.liste }).catch(() => {});
  }

  function sperreFuerCode(code) {
    // FST-Modus: Keine Sperre, keine wachsende Sperre, kein Vorfall. FST kennt
    // das nicht (scripts.js Z. 59455-59473). Bereits gespeicherte Sperren und
    // Vorfaelle bleiben fuer den Rueckweg in den strengen Modus stehen.
    if (STATE.fstModus === true) return;
    const basis = COOLDOWN_CODES[code];
    if (!basis) return;
    const frueher = VORFAELLE.liste.filter((v) => v.t > Date.now() - DAY).length;
    const minuten = Math.min(SPERRE_MAX_MIN, basis * Math.pow(ESKALATION_FAKTOR, frueher));
    vorfallMerken(code);
    const grund = (HARD_STOP[code] || "HTTP " + code) +
      (frueher ? " Schon die " + (frueher + 1) + ". Warnung in 24 Std. – deshalb länger." : "");
    startCooldown(minuten, grund);
  }

  function startCooldown(minuten, grund) {
    const bis = Date.now() + minuten * 60000;
    if (bis <= STATE.cooldownUntil) return; // laengere Sperre nicht verkuerzen
    STATE.cooldownUntil = bis;
    STATE.cooldownReason = str(grund, 160);
    chrome.storage.local.set({ safetyCooldown: { until: bis, reason: STATE.cooldownReason } }).catch(() => {});
    warn("Start gesperrt für " + minuten + " Minuten: " + STATE.cooldownReason);
    // Eine Sperre soll man hoeren, auch ohne Lauf (Auto-Scan, Preis-Check).
    tonSpielen("warnung");
    rotationBeenden("EA hat gewarnt – die Rotation ist beendet.");
  }

  // Der Coin-Stand kommt aus EAs Antworten - er kann sich also nur bewegen,
  // solange der Bot Anfragen stellt. Steht der Bot, friert die Zahl ein.
  //
  // Am 21.09.2026 gesehen: Die Leiste zeigte 21.496, EAs eigene Kopfzeile
  // 27.434. Beides war "richtig" - unsere Zahl war nur alt. Ohne einen
  // Hinweis darauf haelt man sie fuer den aktuellen Stand und rechnet falsch.
  // Deshalb wird der Zeitpunkt mitgefuehrt.
  //
  // quelle "seite": abgelesen aus der Kopfzeile der Web App (siehe
  // kontostandVonSeite). Das ist nur ein Ersatz, bis EA selbst antwortet.
  // Hat EA einmal einen Stand gemeldet, gewinnt immer EA - der Seitenwert
  // ueberschreibt ihn nie.
  // quelle: "ea" (Antwort von EA), "app" (Speicher der Web App, direkt nach
  // einer frischen EA-Antwort) oder "seite" (von der Kopfzeile abgelesen).
  function setCredits(wert, quelle) {
    const vonSeite = quelle === "seite";
    if (vonSeite && (STATE.creditsQuelle === "ea" || STATE.creditsQuelle === "app")) return;
    STATE.credits = wert;
    STATE.creditsAt = Date.now();
    STATE.creditsQuelle = vonSeite ? "seite" : quelle === "app" ? "app" : "ea";
  }

  function cooldownLeftMin() {
    // FST-Modus: Eine gespeicherte Sperre wird ignoriert (nicht geloescht).
    if (STATE.fstModus === true) return 0;
    const rest = STATE.cooldownUntil - Date.now();
    return rest > 0 ? Math.ceil(rest / 60000) : 0;
  }

  // Waehrend der Abkuehlzeit geht KEINE Anfrage an EA raus - nicht nur kein
  // Bot-Start, auch kein Preis-Check, kein Markt-Scan, keine Suche, kein Kauf.
  // Sonst holt sich ein Klick mitten in der Sperre die naechste Sperr-Antwort,
  // und die Sperre beginnt von vorn. Leer heisst: frei.
  function cooldownBlock() {
    const rest = cooldownLeftMin();
    if (!(rest > 0)) return "";
    return "EA-Anfragen gesperrt für noch " + rest + " Min. Grund: " + (STATE.cooldownReason || "Sicherheitspause");
  }

  async function loadCooldown() {
    const { safetyCooldown, sperrVorfaelle } = await chrome.storage.local.get(["safetyCooldown", "sperrVorfaelle"]);
    vorfaelleUebernehmen(sperrVorfaelle);
    sperreUebernehmen(safetyCooldown);
    // Eine laufende Sperre ohne gemerkten Vorfall (aelterer Stand des Bots)
    // zaehlt als ein Vorfall - sonst waere die naechste Warnung wieder "die erste".
    if (STATE.fstModus !== true && STATE.cooldownUntil > Date.now() && !VORFAELLE.liste.some((v) => v.t > Date.now() - DAY)) vorfallMerken(0);
  }

  function sperreUebernehmen(safetyCooldown) {
    const bis = safetyCooldown && toInt(safetyCooldown.until);
    if (Number.isFinite(bis) && bis > Date.now() && bis > STATE.cooldownUntil && bis < Date.now() + 7 * DAY) {
      STATE.cooldownUntil = bis;
      STATE.cooldownReason = str(safetyCooldown.reason, 160);
      // Laeuft hier gerade etwas, hoert es beim naechsten api()-Aufruf auf
      // (cooldownBlock). Den Lauf sofort anhalten ist klarer.
      if (STATE.running && STATE.fstModus !== true) stop(cooldownBlock() || "Sicherheitspause aus einem anderen Tab.", "error");
    }
  }

  // ---------------------------------------------------------------------------
  // Nur EIN Tab darf EA fragen.
  //
  // Budget, Max. Kaeufe, "schon gesehen" und die 3-5 s zwischen zwei Kaeufen
  // gibt es je Tab. Zwei offene Web-App-Tabs konnten also gleichzeitig laufen:
  // doppeltes Budget, doppeltes Suchtempo und zwei Kaeufe desselben Angebots
  // in derselben Sekunde - genau das Muster vor der Sperre am 22.09.2026.
  //
  // Wer arbeitet (Lauf, Preis-Check, Markt-Scan), traegt sich alle 5 s mit
  // 15 s Gueltigkeit in den Speicher ein. Ein zweiter Tab sieht das und
  // startet nicht. Starten zwei Tabs im selben Augenblick, gewinnt der letzte
  // Eintrag - der andere Tab stoppt bei seiner naechsten Anfrage (api()).
  // Absichtlich nicht navigator.locks: Die Sperrnamen koennte die EA-Seite
  // selbst abfragen (gleicher Ursprung).
  // ---------------------------------------------------------------------------
  const BESITZ_KEY = "botBesitzer";
  const TAB_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const BESITZ = { fremd: null, timer: null };

  function besitzUebernehmen(wert) {
    const id = wert && typeof wert.id === "string" ? wert.id : "";
    const bis = wert ? toInt(wert.bis) : 0;
    BESITZ.fremd = id && id !== TAB_ID && bis > Date.now() ? { id, bis } : null;
  }

  // Alles anhalten: Lauf, Preis-Check, Markt-Scan. Gemeinsam fuer "Tab
  // unsichtbar" und den Not-Aus.
  function allesAnhalten(text, leise) {
    rotationBeenden(text);
    if (STATE.running) stop(text, "warn", leise, "gesamt");
    for (const teil of [STATE.check, STATE.marketScan]) {
      if (!teil.running) continue;
      teil.running = false;
      teil.token += 1;
      teil.error = text;
      teil.message = "";
    }
  }

  // Tab nicht sichtbar (anderer Tab, Fenster minimiert): anhalten. Ein Mensch
  // sucht nicht in einem Tab, den er nicht sieht - und Chrome bremst die
  // Zeitgeber versteckter Tabs, die Takte stimmten dann nicht mehr. FST
  // stoppt in diesem Fall auch (Z. 57051-57057).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden" || !beschaeftigt()) return;
    allesAnhalten("Gestoppt: Der EA-Tab war nicht mehr zu sehen (anderer Tab oder Fenster minimiert).");
  });

  // Not-Aus: Strg+Umschalt+P haelt alles an. Capture-Phase am window, damit
  // es auch greift, wenn der Fokus in unserer Leiste liegt (dort haelt der
  // Traeger Tastenereignisse im Aufsteigen an).
  window.addEventListener("keydown", (e) => {
    if (!e || !e.ctrlKey || !e.shiftKey || e.altKey || e.metaKey) return;
    if (e.code !== "KeyP" && e.key !== "P" && e.key !== "p") return;
    if (!beschaeftigt()) return;
    if (typeof e.preventDefault === "function") e.preventDefault();
    allesAnhalten("Not-Aus: Mit Strg+Umschalt+P angehalten.", true);
  }, true);

  // Ein zweiter Bot auf derselben Seite. Live am 22.09.2026: FUT Simple Trader
  // lag unter unserer Leiste, beide geladen. Zwei Bots zugleich heisst doppelt
  // so viele Suchen - FST raet in seiner Anleitung selbst, immer nur einen Bot
  // laufen zu lassen. Erkannt nur an seiner sichtbaren Leiste im Dokument.
  // ---------------------------------------------------------------------------
  // Auffangnetz fuer unerwartete Programmfehler (25.09.2026).
  //
  // Ein Fehler in unserem eigenen Code kann mitten im Lauf auftreten. Dann
  // laeuft eine Schleife weiter oder bleibt stehen, waehrend niemand mehr
  // weiss, was gekauft wurde und was nicht. FUT Simple Trader faengt solche
  // Fehler auch ab, schickt sie aber nur an seinen eigenen Server
  // (scripts.js Z. 61656-61672). Wir schicken nichts weg - wir halten an.
  // Im Zweifel ist Stillstand billiger als ein Kauf, den keiner mehr
  // nachvollziehen kann.
  //
  // Nur Fehler aus unseren EIGENEN Dateien zaehlen. Die EA-Seite wirft
  // staendig eigene Fehler; die gehen uns nichts an. Erkannt an der Herkunft
  // der Erweiterung, nicht an einer Vermutung ueber den Text.
  // ---------------------------------------------------------------------------
  const EIGENE_HERKUNFT = (() => {
    try {
      return chrome.runtime.getURL("");
    } catch (e) {
      return "";
    }
  })();

  function ausEigenemCode(text) {
    return Boolean(EIGENE_HERKUNFT) && String(text || "").indexOf(EIGENE_HERKUNFT) >= 0;
  }

  function programmfehler(quelle, text) {
    warn("Programmfehler (" + quelle + "): " + text);
    if (!beschaeftigt()) return;
    allesAnhalten("Gestoppt: Unerwarteter Programmfehler im Bot (" + str(text, 120) +
      "). Sicherheitshalber wurde alles angehalten. Bitte in der Transferliste nachsehen, " +
      "ob ein Kauf offen ist, und die Web App neu laden.");
    notify("Bot gestoppt: unerwarteter Programmfehler. Bitte Transferliste prüfen.");
  }

  window.addEventListener("error", (e) => {
    try {
      if (!e || !ausEigenemCode(e.filename)) return;
      programmfehler(String(e.filename || "").split("/").pop() + ":" + e.lineno, e.message);
    } catch (fehler) {}
  });

  // Ein nicht abgefangenes Versprechen ist genauso schlimm: Der await, der
  // darauf wartet, kommt nie zurueck. Zuordnen laesst es sich nur ueber den
  // Aufrufstapel - fehlt der, lassen wir die Finger davon. Lieber einen
  // fremden Fehler uebersehen als einen fremden Fehler falsch zuordnen.
  window.addEventListener("unhandledrejection", (e) => {
    try {
      const grund = e && e.reason;
      if (!ausEigenemCode(grund && grund.stack)) return;
      programmfehler("offenes Versprechen", (grund && grund.message) || String(grund));
    } catch (fehler) {}
  });

  function fremderBot() {
    try {
      return document.querySelector(".st-sidebar") ? "FUT Simple Trader" : "";
    } catch (e) {
      return "";
    }
  }

  // "Es laeuft etwas" - daran haengen der Not-Aus (Strg+Umschalt+P, Zeile 700)
  // und der Stopp beim Tab-Wechsel (Zeile 690).
  //
  // ROTATION.aktiv muss hier stehen (23.09.2026). Zwischen zwei Filtern macht
  // die Rotation bis zu 5 Minuten Pause. In dieser Pause laeuft nichts
  // anderes - beschaeftigt() war also falsch, der Not-Aus stieg wirkungslos
  // aus und das Wegschalten in einen anderen Tab stoppte nichts. Nach der
  // Pause ging es weiter, obwohl der Nutzer gestoppt hatte.
  //
  // ROTATION steht weiter unten (Zeile ~3790). Das ist in Ordnung: Diese
  // Funktion wird erst aus Ereignissen heraus gerufen, also lange nachdem
  // die Datei einmal durchgelaufen ist.
  function beschaeftigt() {
    return STATE.running || STATE.check.running || STATE.marketScan.running || VERKAUF.laeuft || ROTATION.aktiv;
  }

  function andererTabAktiv() {
    // FST-Modus: FST prueft im Client keinen zweiten Tab (scripts.js Z. 19134-19153).
    if (STATE.fstModus === true) return "";
    const fremd = BESITZ.fremd;
    if (!fremd || fremd.bis <= Date.now()) return "";
    return "Der Bot arbeitet gerade in einem anderen EA-Tab. Dort stoppen oder den Tab schließen.";
  }

  function besitzMelden() {
    if (!extensionAlive()) return;
    if (beschaeftigt()) {
      chrome.storage.local.set({ [BESITZ_KEY]: { id: TAB_ID, bis: Date.now() + 15000 } }).catch(() => {});
      return;
    }
    // Nichts mehr zu tun: nur den EIGENEN Eintrag freigeben.
    clearInterval(BESITZ.timer);
    BESITZ.timer = null;
    chrome.storage.local.get(BESITZ_KEY).then((gespeichert) => {
      const wert = gespeichert && gespeichert[BESITZ_KEY];
      if (wert && wert.id === TAB_ID) return chrome.storage.local.remove(BESITZ_KEY);
    }).catch(() => {});
  }

  // Direkt nach jedem Start aufrufen (beschaeftigt() ist dann schon wahr).
  function besitzAntreten() {
    besitzMelden();
    if (!BESITZ.timer) BESITZ.timer = setInterval(besitzMelden, 5000);
  }

  chrome.storage.local.get(BESITZ_KEY).then((g) => besitzUebernehmen(g && g[BESITZ_KEY])).catch(() => {});
  // Beim Schliessen oder Neuladen den Platz sofort freigeben, sonst muesste
  // der naechste Start bis zu 15 s warten.
  window.addEventListener("pagehide", () => {
    if (BESITZ.timer) chrome.storage.local.remove(BESITZ_KEY).catch(() => {});
  });

  async function loadUsage() {
    const now = Date.now();
    const stored = await chrome.storage.local.get("safetyUsage");
    const data = pruneUsage(stored.safetyUsage, now);
    updateUsageState(data, now);
    await chrome.storage.local.set({ safetyUsage: data });
  }

  // Chrome-Benachrichtigung ueber background.js (abschaltbar in den Einstellungen).
  function notify(message, ton) {
    try {
      const pending = chrome.runtime.sendMessage({ type: "notify", title: "FC27 Own Bot", message, ton: ton === "kauf" || ton === "ende" ? ton : "" });
      if (pending && typeof pending.catch === "function") pending.catch(() => {});
    } catch (e) {}
  }


  // ---------------------------------------------------------------------------
  // Toene (F7). Vorbild: FUT Simple Trader spielt einen Ton beim Kauf und am
  // Ende (scripts.js Z. 1937-1949). Dort sind es mp3-Dateien vom eigenen
  // Server. Wir laden nichts nach: Die Toene entstehen hier im Browser mit
  // WebAudio. Das braucht keine Datei, keine neue Berechtigung und kein Netz.
  //
  // Warum hier und nicht in sniffer.js: In dieser Welt kann die EA-Seite den
  // AudioContext weder sehen noch verbiegen.
  //
  // Ein Ton stoert den Bot nie: alles synchron, nichts wartet, nichts wirft.
  // Chrome laesst Ton erst zu, wenn die Seite einmal angeklickt wurde. Der
  // Start-Klick in unserer Leiste zaehlt dafuer.
  // ---------------------------------------------------------------------------
  const TON = { kauf: false, ende: false, lautstaerke: 0.6, ctx: null, zuletzt: {} };
  const TON_MUSTER = {
    kauf: { typ: "sine", pegel: 0.4, noten: [{ f: 880, ab: 0, ms: 110 }, { f: 1318.5, ab: 95, ms: 190 }] },
    ende: { typ: "triangle", pegel: 0.45, noten: [{ f: 784, ab: 0, ms: 170 }, { f: 659.3, ab: 190, ms: 170 }, { f: 523.3, ab: 380, ms: 320 }] },
    warnung: { typ: "square", pegel: 0.18, noten: [{ f: 880, ab: 0, ms: 160 }, { f: 660, ab: 200, ms: 160 }, { f: 880, ab: 400, ms: 160 }, { f: 660, ab: 600, ms: 260 }] }
  };
  const TON_ABSTAND_MS = { kauf: 800, ende: 3000, warnung: 5000 };
  const TON_PROBE_ABSTAND_MS = 300;
  const TON_FREIGABE_MS = 1500;

  function tonEinstellen(settings) {
    const s = settings && typeof settings === "object" ? settings : {};
    TON.kauf = s.tonKauf === true;
    TON.ende = s.tonEnde === true;
    const n = s.tonLautstaerke == null || s.tonLautstaerke === "" ? NaN : toInt(s.tonLautstaerke);
    TON.lautstaerke = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) / 100 : 0.6;
  }

  function tonKontext() {
    if (TON.ctx && TON.ctx.state !== "closed") return TON.ctx;
    TON.ctx = null;
    if (typeof AudioContext !== "function") return null;
    try {
      TON.ctx = new AudioContext();
    } catch (e) {
      TON.ctx = null;
    }
    return TON.ctx;
  }

  // Beim Start-Klick aufrufen: Dann gibt Chrome den Ton frei.
  function tonVorbereiten() {
    if (!TON.kauf && !TON.ende) return;
    try {
      const ctx = tonKontext();
      if (ctx && ctx.state === "suspended") {
        const p = ctx.resume();
        if (p && typeof p.catch === "function") p.catch(() => {});
      }
    } catch (e) {}
  }

  function tonMuster(ctx, art, lautstaerke) {
    const m = TON_MUSTER[art];
    const t0 = ctx.currentTime + 0.03;
    const haupt = ctx.createGain();
    haupt.gain.setValueAtTime(Math.max(0.0001, Math.min(1, lautstaerke) * m.pegel), t0);
    haupt.connect(ctx.destination);
    m.noten.forEach((n, i) => {
      const osc = ctx.createOscillator();
      const huelle = ctx.createGain();
      const von = t0 + n.ab / 1000;
      const bis = von + n.ms / 1000;
      osc.type = m.typ;
      osc.frequency.setValueAtTime(n.f, von);
      huelle.gain.setValueAtTime(0.0001, von);
      huelle.gain.exponentialRampToValueAtTime(1, von + 0.012);
      huelle.gain.exponentialRampToValueAtTime(0.0001, bis);
      osc.connect(huelle);
      huelle.connect(haupt);
      const letzte = i === m.noten.length - 1;
      osc.onended = () => {
        try {
          osc.disconnect();
          huelle.disconnect();
          if (letzte) haupt.disconnect();
        } catch (e) {}
      };
      osc.start(von);
      osc.stop(bis + 0.02);
    });
  }

  // art: "kauf" | "ende" | "warnung". probe = { lautstaerke } fuer die Hoerprobe.
  // "ende" und "warnung" haengen beide am Haken "Ton am Lauf-Ende".
  function tonSpielen(art, probe) {
    try {
      if (!TON_MUSTER[art]) return false;
      if (!probe && !(art === "kauf" ? TON.kauf : TON.ende)) return false;
      const jetzt = Date.now();
      const abstand = probe ? TON_PROBE_ABSTAND_MS : TON_ABSTAND_MS[art];
      if (jetzt - (TON.zuletzt[art] || 0) < abstand) return false;
      const ctx = tonKontext();
      if (!ctx) return false;
      TON.zuletzt[art] = jetzt;
      const lautstaerke = probe && Number.isFinite(probe.lautstaerke) ? probe.lautstaerke : TON.lautstaerke;
      if (ctx.state === "running") {
        tonMuster(ctx, art, lautstaerke);
        return true;
      }
      // Noch gesperrt: erst freigeben lassen. Nie auf Vorrat einplanen, sonst
      // kommen nach dem naechsten Klick alle alten Toene auf einmal.
      let p;
      try {
        p = ctx.resume();
      } catch (e) {
        return false;
      }
      Promise.resolve(p).then(() => {
        if (ctx.state === "running" && Date.now() - jetzt <= TON_FREIGABE_MS) tonMuster(ctx, art, lautstaerke);
      }).catch(() => {});
      return true;
    } catch (e) {
      return false;
    }
  }

  function tonTest(art, lautstaerkeRoh) {
    if (!TON_MUSTER[art]) return { ok: false, error: "Unbekannter Ton." };
    if (typeof AudioContext !== "function") return { ok: false, error: "Dieser Browser kann hier keinen Ton erzeugen." };
    const n = lautstaerkeRoh == null || lautstaerkeRoh === "" ? NaN : toInt(lautstaerkeRoh);
    const lautstaerke = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) / 100 : TON.lautstaerke;
    if (!tonSpielen(art, { lautstaerke })) {
      return { ok: false, error: TON.ctx ? "Kurz warten und noch einmal klicken." : "Chrome lässt hier gerade keinen Ton zu." };
    }
    return { ok: true, zustand: TON.ctx ? String(TON.ctx.state || "") : "" };
  }

  // ---------------------------------------------------------------------------
  // Diagnose der Web-App-Schnittstelle.
  // Die Antwort stammt aus der Seite und ist damit nicht vertrauenswuerdig:
  // Es werden nur bekannte Namen uebernommen und alle Werte hart umgewandelt.
  // ---------------------------------------------------------------------------

  function acceptProbeNames(value, limit) {
    if (!Array.isArray(value)) return null;
    const out = [];
    for (const item of value) {
      if (out.length >= limit) break;
      if (typeof item === "string" && PROBE_NAME_RE.test(item) && !out.includes(item)) out.push(item);
    }
    return out;
  }

  // Name -> Zahl. Beides wird geprueft: der Name gegen das Namensmuster, die
  // Zahl auf einen plausiblen Bereich fuer HTTP- und EA-Statuscodes.
  function acceptProbeCodes(value, limit) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const out = {};
    let n = 0;
    for (const key of Object.keys(value)) {
      if (n >= limit) break;
      if (!PROBE_NAME_RE.test(key)) continue;
      const num = value[key];
      if (typeof num !== "number" || !Number.isInteger(num) || num < 0 || num > 100000) continue;
      out[key] = num;
      n += 1;
    }
    return out;
  }

  function acceptProbe(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
    // Ohne Dienstliste ist es keine Antwort der Sonde, sondern Streumuell aus
    // der Seite. Dann bleibt die letzte echte Diagnose stehen.
    const incoming = raw.services;
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return;
    const services = {};
    for (const path of PROBE_SERVICES) {
      const entry = incoming[path];
      const found = Boolean(entry && entry.found);
      const args = found ? Math.min(20, Math.max(0, toInt(entry.args) || 0)) : 0;
      services[path] = { found, args };
    }
    const globals = {};
    const rawGlobals = raw.globals && typeof raw.globals === "object" ? raw.globals : {};
    for (const name of PROBE_GLOBALS) globals[name] = Boolean(rawGlobals[name]);

    STATE.probe = {
      at: Date.now(),
      globals,
      services,
      itemPile: acceptProbeNames(raw.itemPile, 20),
      errorCodes: acceptProbeCodes(raw.errorCodes, 60),
      criteria: acceptProbeNames(raw.criteria, 60)
    };
    log("Schnittstellen-Diagnose erhalten:", STATE.probe);
  }

  // ---------------------------------------------------------------------------
  // Endpunkte aus den Einstellungen uebernehmen.
  // Diese Werte landen in URLs. Deshalb wird jeder einzeln gegen ein festes
  // Muster geprueft; was nicht passt, bleibt beim Standard. Ein Tippfehler
  // darf hoechstens dazu fuehren, dass EA nichts findet - niemals dazu, dass
  // eine Anfrage woanders hingeht.
  // ---------------------------------------------------------------------------
  const ENDPOINT_RULES = {
    searchPath: (v) => /^\/[A-Za-z0-9/_-]{1,60}$/.test(v),
    idParam: (v) => /^[A-Za-z0-9_]{1,32}$/.test(v),
    maxBuyParam: (v) => /^[A-Za-z0-9_]{1,32}$/.test(v),
    minBuyParam: (v) => /^[A-Za-z0-9_]{1,32}$/.test(v),
    maxBidParam: (v) => /^[A-Za-z0-9_]{1,32}$/.test(v),
    ovrMinParam: (v) => /^[A-Za-z0-9_]{1,32}$/.test(v),
    ovrMaxParam: (v) => /^[A-Za-z0-9_]{1,32}$/.test(v),
    rarityParam: (v) => /^[A-Za-z0-9_]{1,32}$/.test(v),
    levelParam: (v) => /^[A-Za-z0-9_]{1,32}$/.test(v),
    positionParam: (v) => /^[A-Za-z0-9_]{1,32}$/.test(v),
    nationParam: (v) => /^[A-Za-z0-9_]{1,32}$/.test(v),
    leagueParam: (v) => /^[A-Za-z0-9_]{1,32}$/.test(v),
    playStyleParam: (v) => /^[A-Za-z0-9_]{1,32}$/.test(v),
    // Verein (28.09.2026): Der Standardname "club" ist als einziger GERATEN
    // (siehe ENDPOINT_DEFAULTS). Mit dieser Regel laesst sich der gemessene
    // Name in den Optionen eintragen, ohne auf ein Update zu warten. Ohne
    // die Regel stuerzte applyEndpoints bei einem gespeicherten Wert sogar
    // ab, weil ENDPOINT_RULES[key] undefined waere.
    clubParam: (v) => /^[A-Za-z0-9_]{1,32}$/.test(v),
    // Muss {id} enthalten, sonst zeigt jede Anfrage auf dieselbe Auktion.
    bidPath: (v) => /^\/[A-Za-z0-9/_{}-]{1,60}$/.test(v) && v.includes("{id}"),
    bidMethod: (v) => ["GET", "POST", "PUT", "DELETE"].includes(v),
    clubPath: (v) => /^\/[A-Za-z0-9/_-]{1,60}$/.test(v),
    clubMethod: (v) => ["GET", "POST", "PUT", "DELETE"].includes(v),
    listPath: (v) => /^\/[A-Za-z0-9/_-]{1,60}$/.test(v),
    listMethod: (v) => ["GET", "POST", "PUT", "DELETE"].includes(v)
  };

  function applyEndpoints(stored) {
    const eingang = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
    const abgelehnt = [];
    for (const key of Object.keys(ENDPOINT_DEFAULTS)) {
      const wert = typeof eingang[key] === "string" ? eingang[key].trim() : "";
      if (!wert) {
        ENDPOINTS[key] = ENDPOINT_DEFAULTS[key];
      } else if (ENDPOINT_RULES[key](wert)) {
        ENDPOINTS[key] = wert;
      } else {
        ENDPOINTS[key] = ENDPOINT_DEFAULTS[key];
        abgelehnt.push(key + "=" + wert.slice(0, 40));
      }
    }
    if (abgelehnt.length) warn("Endpunkt-Einstellung verworfen, Standard bleibt: " + abgelehnt.join(", "));
    return abgelehnt;
  }

  function bidPathFor(tradeId) {
    return ENDPOINTS.bidPath.replace("{id}", encodeURIComponent(tradeId));
  }

  // Weicht etwas vom Standard ab? Dann gehoert das in die Anzeige.
  function endpointsChanged() {
    return Object.keys(ENDPOINT_DEFAULTS).filter((k) => ENDPOINTS[k] !== ENDPOINT_DEFAULTS[k]);
  }

  // Der Schluessel einer Karte. Seit 24.09.2026 gehoert die Kartenart dazu:
  // Ein Spieler kann eine TOTW- und eine Flashback-Karte mit demselben
  // Rating haben - das sind zwei ganz verschiedene Maerkte.
  // Mehrere Kartenarten (28.09.2026, nach FST scripts.js Z. 26628 und
  // Z. 1719/1726: dort ist die Kartenart immer eine LISTE, "rarities").
  // Diese Funktion macht aus allem, was im Code als Kartenart unterwegs ist
  // (Zahl, Text "12,70", Liste), eine saubere, aufsteigend sortierte Liste
  // ohne Doppelte. Leer heisst "jede Art". Hoechstens 5 Arten.
  // Muss zu rarityListeWert() in popup.js passen - beide zusammen aendern.
  function rarityListeVon(rarity) {
    const roh = Array.isArray(rarity) ? rarity : String(rarity == null ? "" : rarity).split(",");
    const liste = [];
    for (const teil of roh) {
      const text = String(teil).trim();
      if (text === "" || text === "-1") continue;
      const n = toInt(text);
      if (n >= 0 && n < 1000 && !liste.includes(n)) liste.push(n);
    }
    return liste.sort((a, b) => a - b).slice(0, 5);
  }

  function priceKey(playerId, rating, rarity) {
    // Die Kartenart kommt nur dran, wenn es eine gibt. So bleiben alle
    // frueher gespeicherten Schluessel ("204935:85") unveraendert gueltig -
    // sonst waere mit einem Schlag der ganze Preisverlauf wertlos.
    // Mehrere Arten (28.09.2026): "12,70" haengt als Ganzes an - eine
    // Zwei-Arten-Suche ist ein eigener Markt mit eigenem Preisverlauf.
    const liste = rarityListeVon(rarity);
    return playerId + ":" + (rating || 0) + (liste.length ? ":" + liste.join(",") : "");
  }

  function playerLabel(p) {
    return p.playerName + (p.rating ? " (" + p.rating + ")" : "");
  }

  function runningMessage(cfg) {
    const t = cfg.targets;
    return t.length === 1 ? "Läuft: " + playerLabel(t[0]) + " bis " + fmt(t[0].maxPrice) + " Coins." : "Läuft: " + t.length + " Spieler.";
  }

  // Transfermarkt-Preise folgen festen Stufen. Immer abrunden, nie aufrunden.
  // Die Stufen kommen aus der Web App (UTCurrencyInputControl.PRICE_TIERS),
  // sobald sie da sind. Die eingebaute Leiter ist nur der Rueckfall: Sie
  // stimmt heute, aber wenn EA sie aendert, wuerde der Bot still auf
  // ungueltige Preise runden und bekaeme jedes Gebot abgelehnt.
  let PRICE_TIERS = null;

  function acceptPriceTiers(raw) {
    if (!Array.isArray(raw) || !raw.length || raw.length > 20) return null;
    const out = [];
    for (const tier of raw) {
      if (!tier || typeof tier !== "object") return null;
      const min = toInt(tier.min);
      const inc = toInt(tier.inc);
      if (!Number.isFinite(min) || min < 0 || min > 15000000) return null;
      if (!Number.isFinite(inc) || inc <= 0 || inc > 100000) return null;
      out.push({ min, inc });
    }
    out.sort((a, b) => b.min - a.min);
    // Ohne eine Stufe ab 0 gaebe es Preise ohne Zuordnung.
    if (out[out.length - 1].min !== 0) return null;
    return out;
  }

  function stepFor(price) {
    if (PRICE_TIERS) {
      for (const tier of PRICE_TIERS) {
        if (price >= tier.min) return tier.inc;
      }
    }
    // Rueckfall, abgeschrieben von UTCurrencyInputControl.PRICE_TIERS
    // (am 20.09.2026 direkt aus der geladenen Web App gelesen).
    // Die unterste Stufe ist 150, nicht 50: Unter 150 Coins gibt es keine
    // gueltigen Zwischenpreise.
    return price >= 100000 ? 1000 : price >= 50000 ? 500 : price >= 10000 ? 250
      : price >= 1000 ? 100 : price >= 150 ? 50 : 150;
  }

  // FST klemmt jeden gerundeten Preis in 0 bis 14.999.000 (Z. 1431-1443).
  // Ohne die Klemme kann ein Fantasiepreis aus einer Messung durchrutschen.
  const PREIS_KLEMME_MAX = 14999000;

  function roundDownToStep(price) {
    if (!Number.isFinite(price)) return 0;
    const wert = Math.max(0, Math.min(price, PREIS_KLEMME_MAX));
    const step = stepFor(wert);
    return Math.floor(wert / step) * step;
  }

  // Wie roundDownToStep, aber kaufmaennisch. FST braucht beide Varianten:
  // abgerundet fuer Kaufpreise (nie zu teuer), kaufmaennisch fuer das
  // Glaetten eines Verkaufspreises und fuer die Mitte zweier Preise.
  function roundToStep(price) {
    if (!Number.isFinite(price)) return 0;
    const wert = Math.max(0, Math.min(price, PREIS_KLEMME_MAX));
    const step = stepFor(wert);
    return Math.round(wert / step) * step;
  }

  // Verschieben um ganze Preisstufen (27.09.2026). Wortgleich mit popup.js -
  // beide Stellen muessen denselben Preis ausrechnen, sonst stellt der Motor
  // etwas anderes ein, als auf dem Bildschirm stand. Ein Test haelt sie gleich.
  //
  // Vorbild ist FSTs applyPriceOffset im Modus "steps" (scripts.js
  // Z. 28646-28658), Grenze 30 Stufen wie dort (Z. 42682-42687).
  const PREIS_STUFEN_MAX = 30;

  // Eine Preisstufe ist nicht ueberall gleich gross - bei EA 50 Coins unten und
  // 1.000 Coins oben. Darum Schritt fuer Schritt rechnen und die Stufe jedes
  // Mal neu bestimmen. Eine Rechnung "Preis + 5 x Stufe" waere an jeder
  // Bandgrenze falsch.
  function umStufenVerschieben(preis, stufen) {
    let wert = Math.max(0, Math.floor(Number(preis) || 0));
    const n = Math.max(-PREIS_STUFEN_MAX, Math.min(PREIS_STUFEN_MAX, Math.round(Number(stufen) || 0)));
    for (let i = 0; i < Math.abs(n); i++) {
      if (n > 0) {
        wert = roundDownToStep(wert + stepFor(wert));
      } else {
        const tiefer = roundDownToStep(wert - 1);
        if (!(tiefer > 0)) break;
        wert = tiefer;
      }
    }
    return wert;
  }

  // Spieler + optionales Rating (0 = jede Version) + optionale Kartenart
  // (0 = jede Art). Die Kartenart ist EAs "rarityIds"/"rareflag", z. B. 12
  // fuer Basis-Ikone. Sie kommt aus der offenen EA-Suchmaske, nicht aus
  // einer eigenen Liste - EA benennt die Arten jede Woche neu.
  function parsePlayer(raw) {
    const input = raw || {};
    const ratingText = input.rating == null ? "" : String(input.rating).trim();
    // -1 heisst "jede Kartenart". 0 waere "Common" und damit ein echter
    // Filter - deshalb darf 0 hier nicht fuer "egal" stehen.
    // Mehrere Kartenarten (28.09.2026): "12,70" ist erlaubt und heisst
    // "TOTW ODER Flashback in EINER Suche" - wie FSTs "Edit Rarities"
    // (scripts.js Z. 26628). Eine einzelne Zahl bleibt eine Zahl, damit alte
    // Ziellisten und Preis-Schluessel weitergelten. "-1" aus alten
    // gespeicherten Zielen heisst weiter "jede Art". Unlesbare Teile werden
    // NICHT still verworfen, sondern als Fehler gemeldet - still verworfen
    // hiesse: zu breit gesucht und die falsche Karte gekauft.
    const artRoh = input.rarity == null ? "" : String(input.rarity).trim();
    const artText = artRoh === "-1" ? "" : artRoh;
    const artListe = rarityListeVon(artText);
    const artTeile = artText === "" ? [] : artText.split(",").map((t) => t.trim()).filter((t) => t !== "");
    const player = {
      playerId: toInt(input.playerId),
      playerName: str(input.playerName, 80),
      rating: ratingText === "" ? 0 : toInt(ratingText),
      rarity: artListe.length === 0 ? -1 : artListe.length === 1 ? artListe[0] : artListe.join(",")
    };
    if (!(player.playerId > 0)) return { error: "Kein Spieler ausgewählt." };
    if (!player.playerName) player.playerName = "Spieler " + player.playerId;
    if (!(player.rating === 0 || (player.rating >= 1 && player.rating <= 99))) {
      return { error: "Rating leer lassen oder eine Zahl von 1 bis 99 eintragen." };
    }
    if (artTeile.length !== artListe.length) {
      return { error: "Kartenart leer lassen oder Zahlen von 0 bis 999 eintragen, mehrere mit Komma (z. B. 12,70), höchstens 5, ohne Doppelte." };
    }
    return { player };
  }

  // Akzeptiert { targets: [...] } oder einen einzelnen Spieler auf oberster Ebene.
  function validateConfig(raw) {
    // FST-Modus (01.10.2026). Hier mit Absicherung: Viele Tests lassen diese
    // Funktion in einem leeren Kontext ohne STATE laufen - dort gilt streng.
    const fst = typeof STATE !== "undefined" && STATE.fstModus === true;
    const input = raw || {};
    const list = Array.isArray(input.targets) ? input.targets : [input];
    if (!list.length) return { error: "Die Zielliste ist leer." };
    if (list.length > CONFIG.MAX_TARGETS) return { error: "Höchstens " + CONFIG.MAX_TARGETS + " Spieler gleichzeitig." };

    const targets = [];
    for (const item of list) {
      const parsed = parsePlayer(item);
      if (parsed.error) return parsed;
      const target = Object.assign(parsed.player, { maxPrice: roundDownToStep(toInt(item && item.maxPrice)) });
      if (!(target.maxPrice > 0)) {
        return { error: "Zielpreis fehlt oder ist zu niedrig" + (list.length > 1 ? " (" + target.playerName + ")." : ".") };
      }
      target.key = priceKey(target.playerId, target.rating, target.rarity);
      target.expiresAt = Number(item.expiresAt) || 0;
      if (fst) {
        // FST-Modus (Punkt 3): FST misst jeden Filter bei jedem Lauf neu und
        // kennt keinen Live-Filter-Ablauf. Kein Ablehnen, kein Stopp: Der Ablauf
        // wandert nach liveBis und gibt nur noch eine gelbe Warnung (loop).
        target.liveBis = target.expiresAt;
        target.expiresAt = 0;
      } else if (target.expiresAt && target.expiresAt <= Date.now()) return { error: "Live-Filter ist abgelaufen: " + target.playerName };
      // Erwarteter Verkaufspreis zum Startzeitpunkt. Er wird mit jedem Kauf
      // gespeichert, damit die Gewinnschaetzung in der Kaufliste nicht davon
      // abhaengt, ob der Preisverlauf den Spieler spaeter noch kennt (er haelt
      // nur 60 Spieler). Nur eine Anzeige-Hilfe - gekauft wird nach maxPrice.
      const verkauf = toInt(item && item.salePrice);
      target.salePrice = verkauf > 0 && verkauf < 1000000000 ? verkauf : 0;
      // Wann dieser Preis gemessen wurde. Ohne Zeitpunkt zaehlt er beim
      // automatischen Einstellen nicht - ein alter Preis waere ein Verlust.
      const seit = toInt(item && item.salePriceAt);
      target.salePriceAt = seit > 0 && seit <= Date.now() + 60000 ? seit : 0;
      // Fuer welche Chemie (EAs playStyle) der Preis gemessen wurde
      // (27.09.2026). Nur eine echte Zahl zaehlt: 0 heisst "keine Chemie" und
      // ist ein echter Wert, fehlt das Feld ganz, heisst es "nicht nach Chemie
      // getrennt" - dann wird beim Kauf nicht gefiltert. Siehe chemiePasst.
      const chem = item && item.chem;
      target.chem = typeof chem === "number" && Number.isFinite(chem) ? Math.floor(chem) : null;
      // Fester Verkaufspreis nur fuer diesen Filter (28.09.2026), wie FSTs
      // Preis je Profil (scripts.js Z. 59392-59404). 0 oder fehlend heisst:
      // kein eigener Preis - dann gilt der globale Festpreis oder die
      // Messung. Die toInt(null)=0-Falle ist hier gewollt: "fehlt" wird zu
      // "aus", nicht zu einem Preis.
      const festJeFilter = toInt(item && item.listFestpreis);
      // Unter CONFIG.LIST_MIN_PRICE (200) stellt der Bot nichts ein. Eine kleinere
      // Zahl wuerde nur tot im Speicher liegen und still nichts tun - darum
      // gilt sie gleich als "aus".
      target.listFestpreis = festJeFilter >= CONFIG.LIST_MIN_PRICE && festJeFilter <= 15000000 ? festJeFilter : 0;
      if (!targets.some((t) => t.key === target.key)) targets.push(target);
    }

    const limitText = input.timeLimitMin == null ? "" : String(input.timeLimitMin).trim();
    // "Max. Kaeufe" darf leer bleiben - dann laeuft der Lauf ohne eigene
    // Kaufgrenze (27.09.2026). So macht es FUT Simple Trader: Dort steht
    // buyLimit standardmaessig auf AUS (scripts.js Z. 3270), es gibt also
    // keine Kaufzahl, die den Lauf beendet. "Ohne Grenze" heisst bei uns
    // trotzdem nicht grenzenlos: Es gilt das Tageslimit des Kontoschutzes von
    // CONFIG.BUY_LIMIT_DAY Kaufversuchen. Mehr kann der Bot an einem Tag
    // ohnehin nicht machen - darum ist genau diese Zahl die ehrliche
    // Obergrenze, und kein Limit wird dafuer angehoben.
    const kaufText = input.maxBuys == null ? "" : String(input.maxBuys).trim();
    const kaufFrei = kaufText === "" || toInt(kaufText) === 0;
    // Leeres Budget-Feld = "ohne Grenze" (28.09.2026). So macht es FUT
    // Simple Trader: Im Snipe-Modus gibt es kein Gesamt-Budget, nur die
    // Live-Frage "reichen die Coins fuer den Hoechstpreis?" (scripts.js
    // Z. 58503-58525) - genau diese Pruefung steht bei uns schon in
    // stopReason und kaufPruefung und bleibt an. WICHTIG: Nur das LEERE
    // Feld heisst "ohne Grenze". Eine 0 bleibt ein Fehler - sonst wuerde
    // ein aufgebrauchtes Rotations-Rest-Budget (Budget minus Ausgegebenem
    // = 0) still zu "unbegrenzt". Als Zahl steht dann
    // Number.MAX_SAFE_INTEGER im Feld budget, damit alle Rechnungen
    // "ausgegeben + Preis > budget" ohne Sonderfall weiterlaufen.
    const budgetText = input.budget == null ? "" : String(input.budget).trim();
    const budgetFrei = budgetText === "";
    const cfg = {
      targets,
      budget: budgetFrei ? Number.MAX_SAFE_INTEGER : toInt(input.budget),
      // Merker fuer Anzeige und Pruefungen: Die Zahl kommt nicht vom Nutzer.
      budgetUnbegrenzt: budgetFrei,
      // FST-Modus: Leeres Feld = wirklich ohne Grenze (FST: buyLimit aus).
      maxBuys: kaufFrei ? (fst ? Number.MAX_SAFE_INTEGER : CONFIG.BUY_LIMIT_DAY) : toInt(kaufText),
      // Merken, dass die Zahl nicht vom Nutzer kommt: Nur so koennen die
      // Meldungen ehrlich sagen, welche Grenze den Lauf beendet hat.
      maxBuysUnbegrenzt: kaufFrei,
      timeLimitMin: limitText === "" || toInt(limitText) === 0 ? 300 : toInt(limitText),
      // Was mit einem gekauften Spieler passiert. Der alte Haken "toClub"
      // wird weiter verstanden, damit gespeicherte Einstellungen gueltig bleiben.
      afterBuy: ["club", "transfer", "keep", "list"].includes(input.afterBuy)
        ? input.afterBuy
        : input.toClub === true ? "club" : "keep",
      stopIfTooBroad: input.stopIfTooBroad !== false, // standardmaessig an
      // Gewinn-Bremse abschaltbar (27.09.2026). Sie stoppt einen Spieler,
      // sobald der Markt unter den Kaufpreis gefallen ist. FUT Simple Trader
      // hat diese Bremse nicht: Es rechnet vor dem Kauf gar nichts nach
      // (scripts.js Z. 58270-58273) und merkt den Verlust erst beim
      // Einstellen ("Wrong list price!", Z. 58283-58286) - da ist das Geld
      // schon weg. Standard bleibt AN, weil die Bremse vor Verlust schuetzt.
      // Wer es 1:1 wie FST will, nimmt den Haken in den Optionen heraus.
      gewinnBremse: input.gewinnBremse !== false,
      // Sofort kaufen, ohne die 180-350 ms Reaktionszeit - wie FUT Simple
      // Trader (25.09.2026). Standardmaessig AN, weil der Nutzer es so
      // wollte. Wer wieder vorsichtiger werden will, nimmt den Haken in den
      // Optionen heraus. Siehe executeBuy.
      sofortKaufen: input.sofortKaufen !== false,
      // Nach jedem KAUFVERSUCH neu suchen, statt ein zweites Angebot aus
      // derselben Trefferliste zu kaufen (28.09.2026, vorher galt es nur
      // nach geglueckten Kaeufen). Genau so macht es FUT Simple Trader: Es
      // kauft je Suche nur das erste Angebot (scripts.js Z. 58276) und ruft
      // danach searchAgain (Z. 58469) - nach dem Erfolg wie im Fehlerfall
      // (Z. 58306-58332). Der Grund: Das zweite Angebot aus einer 10
      // Sekunden alten Liste ist meist schon weg - die Kaufanfrage zaehlt
      // aber trotzdem aufs Tageslimit. Standard AN, weil der Nutzer es 1:1
      // wie FST will. Haken aus heisst: der bisherige Weg, der je Kauf eine
      // Suche spart. Die zusaetzliche Suche laeuft wie jede andere durch
      // reserveUsage() und zaehlt auf die Grenzen.
      nachKaufNeuSuchen: input.nachKaufNeuSuchen !== false,
      bidSniping: input.bidSniping === true,
      bidSeconds: [30, 60].includes(toInt(input.bidSeconds)) ? toInt(input.bidSeconds) : 60,
      maxBidsPerAuction: Math.min(10, Math.max(1, toInt(input.maxBidsPerAuction) || CONFIG.MAX_BIDS_PER_AUCTION)),
      speedMode: ["safe", "normal", "turbo"].includes(input.speedMode) ? input.speedMode : "normal",
      // "off" = keine Sicherheitspausen (27.09.2026, wie FSTs useBreaks in
      // scripts.js Z. 3263). Unbekannte Werte fallen weiter auf "medium"
      // zurueck - der Standard bleibt also "ausgewogen", nicht wie bei FST aus.
      // "fst" (01.10.2026): FSTs sichtbare Pausen-Zahlen. Nur im FST-Modus
      // gueltig, sonst faellt es wie jeder unbekannte Wert auf "medium".
      pausePreset: ["off", "short", "medium", "long"].concat(fst ? ["fst"] : []).includes(input.pausePreset) ? input.pausePreset : "medium",
      // FST-Modus: Beim Snipen hat FST keine Grenze je Filter. Leeres Feld =
      // keine Grenze; eine eingetragene Zahl gilt (mindestens 1, nach oben offen).
      filterSearchLimit: fst ? (toInt(input.filterSearchLimit) > 0 ? toInt(input.filterSearchLimit) : Number.MAX_SAFE_INTEGER)
        : Math.min(150, Math.max(10, toInt(input.filterSearchLimit) || 100)),
      filterBuyLimit: fst ? (toInt(input.filterBuyLimit) > 0 ? toInt(input.filterBuyLimit) : Number.MAX_SAFE_INTEGER)
        : Math.min(20, Math.max(1, toInt(input.filterBuyLimit) || 3)),
      filterSpendLimit: Math.max(0, toInt(input.filterSpendLimit) || 0),
      // Zweite Grenze je Filter (25.09.2026): Kaufversuche, auch die
      // gescheiterten. filterBuyLimit zaehlt nur, was geklappt hat - eine
      // Karte, die dreimal vor uns weg war, tauchte dort nie auf. Die
      // Rechnung fuer filterBuyLimit steht hier noch einmal, weil im selben
      // Objektliteral noch kein Zugriff auf den fertigen Wert moeglich ist.
      // "> 0" statt nur "||" (28.09.2026): toInt(-5) ist -5 und damit truthy.
      // Eine negative Zahl landete deshalb bei Math.max(1, -5) = 1 - also bei
      // genau EINEM Kaufversuch je Spieler. Das ist keine Einstellung, das ist
      // ein Vertipper, und er hat den Bot fast lahmgelegt. Jetzt faellt er auf
      // den Standard zurueck, genau wie die 0 und wie Buchstaben.
      filterAnfrageLimit: fst ? (toInt(input.filterAnfrageLimit) > 0 ? toInt(input.filterAnfrageLimit) : Number.MAX_SAFE_INTEGER)
        : Math.min(60, Math.max(1, (toInt(input.filterAnfrageLimit) > 0 ? toInt(input.filterAnfrageLimit) : 0) ||
        Math.min(20, Math.max(1, toInt(input.filterBuyLimit) || 3)) * 2))
    };
    // FST-Modus: genau EIN Kaufversuch je Suche, der Haken gilt dort nicht.
    // FST kauft je Suche nur das erste Angebot und sucht dann neu (scripts.js
    // Z. 58275-58277, 58387-58409).
    if (fst) cfg.nachKaufNeuSuchen = true;
    const highest = Math.max(...targets.map((t) => t.maxPrice));
    // Ohne Budget ist der Kontostand die einzige Geld-Bremse (28.09.2026).
    // Er muss deshalb bekannt sein - sonst gingen Kaufanfragen raus, die EA
    // mit 470 ablehnt: verlorene Anfragen, die aufs Tageslimit zaehlen.
    if (cfg.budgetUnbegrenzt) {
      const coins = muenzenBekannt();
      if (coins === null) {
        return { error: "Budget ist leer („ohne Grenze“), aber dein Kontostand ist noch unbekannt. Lade die Web App einmal ganz – oder trag ein Budget ein." };
      }
      if (coins < Math.min(...targets.map((t) => t.maxPrice))) {
        return { error: "Nur " + coins + " Coins auf dem Konto – das reicht für keinen Zielpreis. Trag ein Budget ein oder senke die Zielpreise." };
      }
    } else if (!(cfg.budget >= highest)) {
      return { error: "Budget muss mindestens so hoch sein wie der höchste Zielpreis (" + highest + ")." };
    }
    // Leeres Feld ist seit 27.09.2026 erlaubt (= ohne eigene Grenze). Eine
    // eingetragene Zahl muss weiter zwischen 1 und 50 liegen.
    if (!cfg.maxBuysUnbegrenzt && !(cfg.maxBuys >= 1 && (cfg.maxBuys <= 50 || fst))) {
      return { error: "Max. Käufe muss zwischen 1 und 50 liegen – oder leer bleiben für „ohne Grenze“." };
    }
    if (!(cfg.timeLimitMin >= 0 && cfg.timeLimitMin <= 300)) return { error: "Zeitlimit leer lassen oder 1 bis 300 Minuten." };
    return { cfg };
  }

  // ---------------------------------------------------------------------------
  // Spielerliste der Web App -> kompakte Liste [Basis-ID, Name, Rating, voller Name]
  // fuer die Namenssuche im Popup (gespeichert in chrome.storage.local).
  // ---------------------------------------------------------------------------
  function parsePlayers(raw) {
    let data = raw;
    if (typeof raw === "string") {
      try {
        data = JSON.parse(raw);
      } catch (e) {
        return [];
      }
    }
    const lists = Array.isArray(data) ? [data] : data && typeof data === "object" ? Object.values(data).filter(Array.isArray) : [];
    const out = [];
    for (const list of lists) {
      for (const p of list) {
        if (!p || typeof p !== "object") continue;
        const id = toInt(p.id ?? p.assetId);
        if (!(id > 0)) continue;
        const first = str(p.f ?? p.firstName, 60);
        const last = str(p.l ?? p.lastName, 60);
        const common = str(p.c ?? p.commonName, 60);
        const full = [first, last].filter(Boolean).join(" ");
        const name = common || full;
        if (!name) continue;
        const rating = toInt(p.r ?? p.rating);
        out.push([id, name, rating >= 1 && rating <= 99 ? rating : 0, common && full && full !== common ? full : ""]);
      }
    }
    return out;
  }

  // Merkt sich, wo die Spielerbilder liegen. Eine in der Web App gesehene
  // Adresse schlaegt immer eine Vermutung.
  function saveImages(prefix, suffix, source) {
    if (IMAGES.source === "web-app" && source !== "web-app") return;
    if (IMAGES.prefix === prefix && IMAGES.suffix === suffix && IMAGES.source === source) return;
    Object.assign(IMAGES, { prefix, suffix, source });
    Promise.resolve(chrome.storage.local.set({ playerImages: { prefix, suffix, source, at: Date.now() } })).catch(() => {});
  }

  // Die Inhalts-ID und das Spieljahr in der EA-Adresse aendern sich. Deshalb
  // nichts fest eintragen, sondern den gemeinsamen .../fut/items/-Ordner aus
  // einer beliebigen geladenen Web-App-Datei nehmen.
  function imagePrefixFromUrl(url) {
    if (typeof url !== "string") return null;
    const match = /^(https:\/\/[a-z0-9.-]+\.ea\.com\/[^?#]*\/fut\/items\/)/i.exec(url);
    return match ? match[1] + "images/mobile/portraits/" : null;
  }

  function scanImageContentRoot() {
    for (const url of resourceUrls()) {
      const prefix = imagePrefixFromUrl(url);
      if (prefix) {
        saveImages(prefix, ".png", "content-root");
        return true;
      }
    }
    return false;
  }

  function scanPortraits() {
    for (const url of resourceUrls()) {
      const match = PORTRAIT_RE.exec(url);
      if (match) return saveImages(match[1], match[3], "web-app");
    }
  }

  async function savePlayers(raw, source, url, leise) {
    const parsed = parsePlayers(raw);
    if (parsed.length < 100) {
      // "leise" beim Durchprobieren mehrerer Adressen: Dass ein Versuch
      // nichts liefert, ist dort der Normalfall und kein Befund. Gemeldet
      // wird erst, wenn KEINE Adresse eine Liste hergab.
      if (!leise) warn("Spielerliste aus " + source + " übersprungen (" + parsed.length + " Einträge).");
      return false;
    }
    for (const entry of parsed) {
      if (PLAYERS.merged.size >= 60000 && !PLAYERS.merged.has(entry[0])) break;
      PLAYERS.merged.set(entry[0], entry);
    }
    PLAYERS.seen = true;
    const imagePrefix = imagePrefixFromUrl(url);
    if (imagePrefix) saveImages(imagePrefix, ".png", "player-list");
    try {
      await chrome.storage.local.set({ playerList: { at: Date.now(), list: Array.from(PLAYERS.merged.values()) } });
      log("Spielerliste gespeichert: " + PLAYERS.merged.size + " Spieler.");
      return true;
    } catch (e) {
      warn("Spielerliste konnte nicht gespeichert werden: " + e.message);
      return false;
    }
  }

  function resourceUrls() {
    try {
      return performance.getEntriesByType("resource").map((entry) => entry.name);
    } catch (e) {
      return [];
    }
  }

  // Falls die Web App die Liste auf einem Weg geladen hat, den sniffer.js nicht
  // sieht: Adresse aus der Resource-Timing-Liste nehmen und selbst laden.
  async function playerListFallback() {
    if (PLAYERS.seen || PLAYERS.loading) return;
    const kandidaten = spielerlistenKandidaten();
    if (!kandidaten.length) return;
    PLAYERS.loading = true;
    try {
      // Alle Kandidaten durchgehen, nicht nur einen. Genau daran ist es
      // vorher gescheitert: Ein einziger Versuch, und zwar der falsche.
      for (const url of kandidaten) {
        try {
          const res = await fetch(url, { credentials: "same-origin" });
          if (res.ok && await savePlayers(await res.text(), "Nachladen", url, true)) return;
        } catch (e) {
          // Naechste Adresse versuchen; gemeldet wird erst ganz unten.
        }
      }
      warn("Spielerliste nachladen ohne Erfolg (" + kandidaten.length + " Adresse(n) versucht).");
    } finally {
      PLAYERS.loading = false;
    }
  }

  // Zur Diagnose im Popup, falls keine Spielerliste gefunden wird.
  function jsonFileNames() {
    const names = resourceUrls()
      .filter((name) => /\.json(?:[?#]|$)/i.test(name))
      .map((name) => name.split(/[?#]/)[0].split("/").pop());
    return Array.from(new Set(names)).slice(0, 12);
  }

  // EAs EIGENE Suchadresse ablesen (28.09.2026). Sucht der Nutzer in EAs
  // Suchmaske, steht die fertige Adresse samt allen Feldnamen in der
  // Ladeliste der Seite (Resource Timing) - dieselbe Quelle wie beim
  // Nachladen der Spielerliste oben. So laesst sich OHNE eine einzige eigene
  // Anfrage messen, wie EAs App die Felder wirklich nennt - besonders den
  // Verein, dessen Name bei uns geraten ist (ENDPOINT_DEFAULTS.clubParam).
  // Die eigenen Bot-Adressen werden vorher ausgefiltert, sonst wuerde der
  // geratene Name sich selbst bestaetigen.
  const EIGENE_ADRESSEN = [];

  function eigeneAdresseMerken(url) {
    EIGENE_ADRESSEN.push(url);
    if (EIGENE_ADRESSEN.length > 40) EIGENE_ADRESSEN.shift();
  }

  function eigeneSuchadresse() {
    const suche = resourceUrls()
      .filter((name) => name.includes(ENDPOINTS.searchPath + "?"))
      .filter((name) => !EIGENE_ADRESSEN.includes(name))
      .pop();
    if (!suche) {
      return { ok: false, error: "Keine EA-eigene Suche in der Ladeliste gefunden. Erst in EAs eigener Suchmaske suchen (mit gewähltem Verein), dann sofort hier ablesen." };
    }
    let felder = [];
    try {
      felder = Array.from(new URLSearchParams(suche.split("?")[1] || "").entries())
        .slice(0, 30)
        .map(([name, wert]) => str(name, 32) + "=" + str(wert, 40));
    } catch (e) {}
    return { ok: true, felder, clubName: ENDPOINTS.clubParam };
  }

  // ---------------------------------------------------------------------------
  // Gemeinsame Bausteine fuer Bot und Preis-Check
  // ---------------------------------------------------------------------------

  // Nach einem Reload der Extension ist dieses Script verwaist und soll aufhoeren.
  // ---------------------------------------------------------------------------
  // Drosselung erkennen.
  // EA sperrt ein auffaelliges Konto selten sofort - es bremst erst. Zwei
  // Zeichen lassen sich messen, ohne eine einzige zusaetzliche Anfrage:
  //   1. Antworten dauern ploetzlich viel laenger als sonst
  //   2. Ein Filter liefert nichts mehr, obwohl er vorher Treffer hatte
  // Beides warnt nur. Ein automatischer Stopp waere bei einem ruhigen Markt
  // staendig falsch - leere Treffer sind beim Sniping der Normalfall.
  // ---------------------------------------------------------------------------

  function noteResponseTime(dauer) {
    const h = STATE.health;
    h.times.push(dauer);
    if (h.times.length > CONFIG.HEALTH_WINDOW) h.times.shift();

    if (dauer >= CONFIG.SLOW_RESPONSE_MS) h.slowStreak += 1;
    else h.slowStreak = 0;

    const warVorher = h.slow;
    h.slow = h.slowStreak >= CONFIG.SLOW_STREAK;
    if (h.slow && !warVorher) {
      warn("EA antwortet ungewöhnlich langsam (" + CONFIG.SLOW_STREAK + "× über " +
        Math.round(CONFIG.SLOW_RESPONSE_MS / 1000) + " Sekunden). Das kann Drosselung sein.");
    }
  }

  function medianResponseTime() {
    const times = STATE.health.times;
    if (!times.length) return 0;
    const sortiert = times.slice().sort((a, b) => a - b);
    return sortiert[Math.floor(sortiert.length / 2)];
  }

  // Leere Treffer sind normal. Verdaechtig wird es erst, wenn ein Filter
  // vorher geliefert hat und dann dauerhaft nichts mehr bringt.
  function noteEmptyResult(progress, leer) {
    if (!progress) return false;
    progress.suchenGezaehlt = (progress.suchenGezaehlt || 0) + 1;
    if (!leer) {
      progress.hadResults = true;
      progress.trefferSuchen = (progress.trefferSuchen || 0) + 1;
      progress.emptyStreak = 0;
      return false;
    }
    if (!progress.hadResults) return false;
    progress.emptyStreak = (progress.emptyStreak || 0) + 1;
    // Beim Sniping unter Marktpreis kommen Treffer selten und in Schueben -
    // und was gekauft ist, ist danach weg. Verdaechtig ist das Ausbleiben
    // erst, wenn die Suche vorher REGELMAESSIG geliefert hat: mindestens
    // EMPTY_STREAK_MIN_HITS-mal und in mindestens der Haelfte der Suchen.
    // Live am 22.09.2026 (Gordon): 1 Treffer in 6 Suchen, dann 6 leere -
    // die Drosselungs-Warnung war ein Fehlalarm.
    const vorher = Math.max(1, progress.suchenGezaehlt - progress.emptyStreak);
    const regelmaessig = progress.trefferSuchen >= CONFIG.EMPTY_STREAK_MIN_HITS &&
      progress.trefferSuchen / vorher >= 0.5;
    return regelmaessig && progress.emptyStreak >= CONFIG.EMPTY_STREAK_WARN;
  }

  function throttleHint(run) {
    if (STATE.health.slow) {
      return "EA antwortet ungewöhnlich langsam (" + Math.round(medianResponseTime() / 1000) +
        " Sek. im Mittel). Das ist ein Zeichen für Drosselung – lieber eine Pause machen.";
    }
    if (run && run.throttleTarget) {
      return "Die Suche nach " + run.throttleTarget + " lieferte erst Treffer und jetzt nichts mehr. " +
        "EA drosselt markierte Konten manchmal mit leeren Ergebnissen – lieber pausieren.";
    }
    return "";
  }

  function extensionAlive() {
    try {
      return Boolean(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Suchweg "app" (22.09.2026): Suche und Kauf ueber die Web App selbst.
  // Welche Anfragen gehen diesen Weg? Nur die Suche (GET searchPath) und der
  // Kauf/das Gebot (bidPath). Alles andere bleibt direkt. Die Antwort wird in
  // dieselbe Form gebracht wie eine fetch-Antwort - der Rest des Bots merkt
  // keinen Unterschied.
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Die offene EA-Suchseite (F5).
  //
  // FST sucht nur, solange die Suchmaske der App offen ist, und stoppt sonst
  // (scripts.js Z. 59112-59131). Das machen wir nach: Ist der App-Suchweg an,
  // geht ohne offene Suchseite gar keine Anfrage raus. Ein stilles Ausweichen
  // auf den direkten Weg gibt es nicht - das waere genau das Muster, das
  // auffaellt. Nachsehen kostet keine EA-Anfrage.
  // ---------------------------------------------------------------------------
  const SUCHSEITE = { offen: false, seite: "", weg: "", at: 0, rarity: -1, rarityName: "" };
  const SUCHSEITE_FRISCH_MS = 20000;
  const SUCHSEITE_ZU = "Die EA-Suchseite ist nicht offen. Öffne in der Web App „Transfermarkt“ und dort „Spieler suchen“. Dann geht es weiter.";
  const SUCHSEITE_WEG = "Gestoppt: Die EA-Suchseite wurde verlassen. Der Bot sucht nur, solange die Suchmaske offen ist.";

  function suchseitePflicht() {
    return STATE.suchweg === "app" && STATE.nurSuchseite;
  }

  function suchseiteOffen() {
    return SUCHSEITE.offen === true && Date.now() - SUCHSEITE.at < SUCHSEITE_FRISCH_MS;
  }

  function suchseiteProblem() {
    if (!suchseitePflicht()) return "";
    return suchseiteOffen() ? "" : SUCHSEITE_ZU;
  }

  function suchseiteFragen() {
    window.postMessage({ __ownbot: "suchseite?" }, window.location.origin);
  }

  function suchseiteUebernehmen(raw) {
    const warOffen = suchseiteOffen();
    SUCHSEITE.offen = Boolean(raw && raw.offen === true);
    SUCHSEITE.seite = str(raw && raw.seite, 60);
    SUCHSEITE.weg = str(raw && raw.weg, 20);
    // Kartenart aus EAs eigener Suchmaske. Der Bot uebernimmt sie NICHT von
    // allein - sie steht nur in der Leiste, und der Nutzer klickt sie an.
    // Mehrere Kartenarten (28.09.2026): Die Maske kann eine Liste tragen -
    // sie kommt als Kommaliste ("12,70") an und bleibt eine. Vorher meldete
    // sniffer.js bei mehreren Arten -1 ("jede Art").
    const artListe = rarityListeVon(raw && raw.rarity);
    SUCHSEITE.rarity = artListe.length === 0 ? -1 : artListe.length === 1 ? artListe[0] : artListe.join(",");
    SUCHSEITE.rarityName = str(raw && raw.rarityName, 40);
    SUCHSEITE.at = Date.now();
    if (!suchseitePflicht() || SUCHSEITE.offen || !warOffen) return;
    if (!STATE.running && !STATE.check.running && !STATE.marketScan.running) return;
    allesAnhalten(SUCHSEITE_WEG);
  }

  // Eingrenzungen, die der App-Weg (noch) nicht mitnehmen kann. Steht eine
  // davon in der Adresse, geht die Suche den direkten Weg. Lieber eine Suche,
  // die aussieht wie unsere, als eine Suche, die heimlich zu viel findet.
  // Wird eine davon nachweislich durchgereicht, gehoert sie hier heraus UND
  // unten in die Kriterien - beides zusammen, nie nur eines von beiden.
  // "clubParam" kam am 25.09.2026 dazu: Der Verein ist neu, und schon sein
  // Adressname ist geraten. Ueber die App waere doppelt ungeprueft, ob er
  // ankommt. Also direkter Weg - lieber langsamer als still zu weit gesucht.
  // "clubParam" ist am 27.09.2026 wieder herausgefallen - und zwar in die
  // gute Richtung. Im Suchobjekt der Web App heisst das Feld nachweislich
  // "club" (FST scripts.js Z. 1724: l.club = e.club, und Z. 1815:
  // setIndexById("club")). Ueber die App geht der Verein also GEMESSEN mit,
  // waehrend sein Name in unserer eigenen Adresse geraten ist. Hier gilt die
  // Regel darum umgekehrt als bei den anderen: fuer den Verein ist der
  // App-Weg der sichere und der direkte Weg der ungepruefte.
  // Wichtig: Diese Zeile und das Feld "club" im Kriterien-Objekt unten
  // gehoeren zusammen - nie nur eines von beiden aendern.
  const APP_UNBEKANNTE_FILTER = ["rarityParam", "levelParam", "positionParam", "nationParam", "leagueParam", "playStyleParam"];

  // Warum der App-Weg uebersprungen wurde - in Worten, die so in der Leiste
  // stehen koennen (27.09.2026). Bisher gab appWeg nur null zurueck. In der
  // Oberflaeche stand trotzdem weiter "Suchen ueber die EA-App", und der
  // Nutzer konnte nicht sehen, dass in Wahrheit die direkte Adresse lief.
  const APP_GRUND_NAME = {
    rarityParam: "Kartenart gesetzt",
    levelParam: "Qualität gesetzt",
    positionParam: "Position gesetzt",
    nationParam: "Nation gesetzt",
    leagueParam: "Liga gesetzt",
    playStyleParam: "Chemie gesetzt",
    clubParam: "Verein gesetzt"
  };

  // Welchen Weg die Suchen wirklich genommen haben. Gezaehlt wird in api(),
  // also genau dort, wo die Anfrage rausgeht und ein Suchplatz gebucht wird.
  // Die Zaehler beginnen neu, sobald die Einstellungen uebernommen werden.
  // Reine Buchfuehrung: keine Anfrage mehr, keine Anfrage weniger.
  const SUCHWEG_STAT = { app: 0, direkt: 0, grund: "" };

  // null heisst weiter "kann die App nicht" - api() nimmt dann die direkte
  // Adresse. Neu ist allein, dass der Grund aufgeschrieben wird.
  function appNein(grund) {
    SUCHWEG_STAT.grund = grund;
    return null;
  }

  function appWeg(path, opts) {
    const [pfad, query] = String(path).split("?");
    const methode = (opts && opts.method) || "GET";
    if (methode === "GET" && pfad === ENDPOINTS.searchPath) {
      const p = new URLSearchParams(query || "");
      const zahl = (name) => {
        const n = toInt(p.get(name));
        return Number.isFinite(n) && n > 0 ? n : 0;
      };
      // Mit Rating NICHT ueber die App (24.09.2026, live gemessen).
      //
      // Wir setzen kriterien.ovrMin/ovrMax sauber (im Browser nachgesehen:
      // 12 von 12 Suchen trugen ovrMin=85, ovrMax=85). Die EA-App baut daraus
      // aber eine Adresse OHNE jeden Rating-Wert:
      //   num=21&start=0&type=player&maskedDefId=204935&maxb=8500
      // EA sucht dann ueber ALLE Versionen des Spielers und liefert trotzdem
      // nur 21 Treffer. Bei einem Spieler mit vielen billigen Normalversionen
      // belegen die falschen Versionen alle Plaetze, und der Preis-Check misst
      // am echten Markt vorbei. (Nachtrag: Der Preissturz bei Pickford von
      // 14.750 auf 7.200 am 24.09. kam NICHT hiervon - mit Rating in der
      // Adresse misst der Bot denselben Preis. Der Markt ist wirklich
      // gefallen. Der Fund hier bleibt trotzdem gueltig: EA laesst das Rating
      // nachweislich weg.)
      //
      // null heisst "kann die App nicht" - api() nimmt dann den direkten Weg,
      // und der schreibt das Rating nachweislich in die Adresse. Ohne Rating
      // bleibt alles beim Alten und laeuft weiter ueber die App.
      if (zahl(ENDPOINTS.ovrMinParam) > 0 || zahl(ENDPOINTS.ovrMaxParam) > 0) return appNein("Rating gesetzt");
      // Dasselbe fuer die Kartenart: Ob die EA-App sie durchreicht, ist
      // ungeprueft - und ein stilles Wegwerfen waere hier besonders teuer
      // (eine Sonderkarte zum Preis der Normalversion kaufen).
      //
      // Und dasselbe fuer die uebrigen Eingrenzungen des Markt-Scans
      // (25.09.2026, beim Vergleich mit FST gefunden): Qualitaet, Position,
      // Nation, Liga und Chemie stehen zwar in der Adresse, wurden hier aber
      // nie in die Kriterien uebernommen - das Objekt unten kennt sie gar
      // nicht. Eine Scan-Suche "nur Bundesliga bis 5.000" waere ueber die App
      // also als "ALLES bis 5.000" gelaufen, ohne einen Hinweis darauf.
      // Genau der Fehler, der bei der Kartenart schon einmal durchgerutscht
      // ist. Bis gemessen ist, ob die EA-App diese Felder durchreicht, gilt
      // hier dieselbe Regel: lieber den direkten Weg als ein stiller Verlust.
      for (const name of APP_UNBEKANNTE_FILTER) {
        // Der Grund wandert mit in die Leiste (27.09.2026). Die Sperre selbst
        // bleibt unveraendert: Ob die EA-App diese Felder durchreicht, ist
        // ungemessen, und ein stilles Wegwerfen waere hier besonders teuer.
        if (ENDPOINTS[name] && p.get(ENDPOINTS[name]) !== null) return appNein(APP_GRUND_NAME[name] || "Filter gesetzt");
      }
      return {
        typ: "appSuche?",
        daten: {
          kriterien: {
            typ: p.get("type") || "player",
            maskedDefId: zahl(ENDPOINTS.idParam),
            maxBuy: zahl(ENDPOINTS.maxBuyParam),
            minBuy: zahl(ENDPOINTS.minBuyParam),
            maxBid: zahl(ENDPOINTS.maxBidParam),
            minBid: zahl(ENDPOINTS.minBidParam || "micr"),
            ovrMin: zahl(ENDPOINTS.ovrMinParam),
            ovrMax: zahl(ENDPOINTS.ovrMaxParam),
            // Verein (27.09.2026). Im Suchobjekt der Web App heisst das Feld
            // gemessen "club" (FST scripts.js Z. 1724). EA baut daraus selbst
            // die Adresse - damit kommt der Verein hier sicher an, waehrend
            // sein Name in unserer eigenen Adresse geraten ist.
            club: zahl(ENDPOINTS.clubParam),
            start: zahl("start"),
            // Blaettern (25.09.2026): Die EA-App rechnet die Seite selbst aus
            // Seitennummer und Seitengroesse. Nur den Startpunkt
            // durchzureichen reichte nicht - sniffer.js nahm die Seitengroesse
            // aus der offenen Maske des Nutzers, und die passte nicht zu
            // unserer Schrittweite von 20. Dann holten zwei bis drei Anfragen
            // dieselbe Seite, jede davon eine bezahlte Suche aus dem
            // Tagesbudget. Darum gehen Seitennummer und Schrittweite jetzt
            // fertig mit. FST macht es genauso: nur eine Seitennummer, nie ein
            // eigener Startpunkt (scripts.js Z. 46682).
            seite: Math.floor(zahl("start") / (CONFIG.PAGE_SIZE - 1)) + 1,
            anzahl: CONFIG.PAGE_SIZE - 1
          }
        }
      };
    }
    // Kauf: bidPath ist z. B. "/trade/{id}/bid" - vorne und hinten vergleichen,
    // dazwischen muss eine reine Zahl stehen (die tradeId).
    const [vorne, hinten] = ENDPOINTS.bidPath.split("{id}");
    const mitte = pfad.startsWith(vorne) && pfad.endsWith(hinten) ? decodeURIComponent(pfad.slice(vorne.length, pfad.length - hinten.length)) : "";
    if (/^\d{1,20}$/.test(mitte) && methode === ENDPOINTS.bidMethod) {
      let betrag = 0;
      try {
        betrag = toInt(JSON.parse(opts.body).bid);
      } catch (e) {}
      if (betrag > 0) return { typ: "appKauf?", daten: { tradeId: mitte, betrag } };
    }
    // Einstellen ("Gleich verkaufen") ueber die App.
    if (methode === ENDPOINTS.listMethod && pfad === ENDPOINTS.listPath) {
      let d = null;
      try {
        d = JSON.parse(opts.body);
      } catch (e) {}
      const itemId = d && d.itemData ? String(d.itemData.id || "") : "";
      const start = toInt(d && d.startingBid);
      const sofort = toInt(d && d.buyNowPrice);
      const dauer = toInt(d && d.duration);
      if (/^\d{1,20}$/.test(itemId) && start > 0 && sofort >= start && dauer > 0) {
        return { typ: "appEinstellen?", daten: { itemId, startPreis: start, sofortPreis: sofort, dauer } };
      }
    }
    return null;
  }

  async function appAnfrage(weg) {
    const antwort = await seitenFrage(weg.typ, Object.assign({ nurSuchseite: suchseitePflicht() }, weg.daten), CONFIG.REQUEST_TIMEOUT_MS);
    if (!antwort) throw new Error("Keine Antwort von EA nach " + Math.round(CONFIG.REQUEST_TIMEOUT_MS / 1000) + " s.");
    // Die Suchseite war zu. Das ist kein Netzfehler, sondern ein klarer Stopp.
    if (antwort.suchseite === false) throw new HardStop(SUCHSEITE_ZU);
    const status = toInt(antwort.status) || 0;
    // Status 0: Die App konnte gar nicht erst fragen (Dienst fehlt o. ae.).
    // Das ist kein Fehler von EA - wie ein Netzwerkfehler behandeln.
    if (!status) throw new Error("Web App: " + (str(antwort.grund, 60) || "keine Antwort") + ".");
    const daten = { auctionInfo: Array.isArray(antwort.auctionInfo) ? antwort.auctionInfo.slice(0, 60) : [] };
    return { ok: antwort.ok === true && status >= 200 && status < 300, status, json: async () => daten };
  }

  async function api(path, options) {
    const opts = options || {};
    // Letzte Schranke vor dem Netz: In der Abkuehlzeit bleibt jede Anfrage
    // aus, auch eine ohne Zaehler (z. B. das Verschieben nach einem Kauf).
    const gesperrt = cooldownBlock();
    if (gesperrt) throw new HardStop(gesperrt);
    // Starten zwei Tabs im selben Augenblick, stoppt hier der, der verloren hat.
    const fremd = andererTabAktiv();
    if (fremd) throw new HardStop(fremd);
    if (!SESSION.sid || !SESSION.base) throw new HardStop("Keine Verbindung zur Web App (Anmeldung fehlt). Web App neu laden.");
    // Suchweg "app": Suche, Kauf und Einstellen laufen durch die Web App
    // selbst (siehe appWeg). Vorher pruefen, ob die EA-Suchseite offen ist -
    // sonst wuerde ein Suchplatz gezaehlt, obwohl gar nichts rausgeht.
    const ueberApp = STATE.suchweg === "app" ? appWeg(path, opts) : null;
    // Das Einstellen nach einem Kauf ist ausgenommen: Sonst waere die Karte
    // bezahlt, aber weder eingestellt noch verschoben, nur weil der Nutzer in
    // der App gerade die Seite gewechselt hat.
    if (ueberApp && ueberApp.typ !== "appEinstellen?") {
      const fehlt = suchseiteProblem();
      if (fehlt) throw new HardStop(fehlt);
    }
    const istSuche = (opts.method || "GET") === "GET" && String(path).startsWith(ENDPOINTS.searchPath + "?");
    if (istSuche) await reserveUsage("search");
    // Ehrliche Buchfuehrung (27.09.2026): Erst hier steht fest, welchen Weg
    // die Suche wirklich nimmt. Gezaehlt wird NACH reserveUsage - wird die
    // Suche von einem Limit abgewiesen, geht keine Anfrage raus, und dann
    // darf auch nichts gezaehlt werden. Kostet keine einzige EA-Anfrage.
    if (istSuche) {
      if (ueberApp) {
        SUCHWEG_STAT.app += 1;
        SUCHWEG_STAT.grund = "";
      } else {
        SUCHWEG_STAT.direkt += 1;
      }
    }

    const headers = { "X-UT-SID": SESSION.sid, Accept: "application/json" };
    if (opts.body) headers["Content-Type"] = "application/json";

    let res;
    const begonnen = Date.now();
    // Ablese-Hilfe (28.09.2026): Eigene direkte Suchadressen merken, damit
    // eigeneSuchadresse() sie von EAs EIGENEN Suchen unterscheiden kann.
    // Reine Buchfuehrung im Speicher - keine Anfrage mehr oder weniger.
    if (!ueberApp && istSuche) eigeneAdresseMerken(SESSION.base + path);
    if (ueberApp) {
      res = await appAnfrage(ueberApp);
      if (res.ok) noteResponseTime(Date.now() - begonnen);
      return apiAntwortPruefen(res, (opts.method || "GET") === "GET");
    }
    // Ohne Frist blieb eine haengende Anfrage fuer immer offen: Die Leiste
    // zeigte "Läuft", und nach einem haengenden Kauf verweigerte der Start
    // bis zum Neuladen ("Kauf-/Gebotsantwort steht noch aus").
    const abbruch = new AbortController();
    const frist = setTimeout(() => abbruch.abort(), CONFIG.REQUEST_TIMEOUT_MS);
    try {
      res = await fetch(SESSION.base + path, {
        method: opts.method || "GET",
        headers,
        body: opts.body,
        credentials: CONFIG.CREDENTIALS,
        cache: "no-store",
        signal: abbruch.signal
      });
    } catch (e) {
      if (abbruch.signal.aborted) throw new Error("Keine Antwort von EA nach " + Math.round(CONFIG.REQUEST_TIMEOUT_MS / 1000) + " s.");
      throw new Error("Netzwerk/CORS: " + e.message);
    } finally {
      clearTimeout(frist);
    }
    // NUR geglueckte Antworten in die Zeitmessung. Eine Sperr- oder
    // Fehlermeldung kommt fast sofort zurueck und wuerde den Schnitt nach
    // unten ziehen - die Gesundheitsanzeige saehe dann am besten aus, wenn es
    // am schlechtesten steht.
    //
    // Am 21.09.2026 im laufenden Betrieb genau so beobachtet: "EA-Antwortzeit
    // 0.1 Sek. im Mittel", waehrend EA mit HTTP 521 bremste. Die
    // Drosselungserkennung haette so nie angeschlagen.
    if (res.ok) noteResponseTime(Date.now() - begonnen);
    return apiAntwortPruefen(res, (opts.method || "GET") === "GET");
  }

  // Gemeinsame Pruefung fuer beide Suchwege: harte Stopps und Sperren.
  //
  // lesen = Suche oder Abfrage (GET). Kauf, Gebot, Verschieben und Einstellen
  // sind keine Abfragen.
  function apiAntwortPruefen(res, lesen) {
    // FST-Modus (01.10.2026): FSTs Regel statt unserer Tabelle (scripts.js
    // Z. 59455-59473 und 59553-59619). Jede Suchantwort ungleich 200 stoppt -
    // ohne Startsperre. Bei Kauf, Gebot, Verschieben und Einstellen stoppt nur
    // 473 (Ziel voll); sonst laeuft es weiter, und die naechste Suche stoppt,
    // falls EA wirklich ein Problem hat.
    if (STATE.fstModus === true) {
      const code = Number(res.status);
      if (code >= 200 && code < 300) return res;
      // Manche Texte in HARD_STOP nennen den Code schon ("... (HTTP 429)."):
      // dann nicht noch einmal anhaengen (Punkt 12b).
      const mitCode = (c) => (/HTTP \d+/.test(HARD_STOP[c]) ? HARD_STOP[c] : HARD_STOP[c] + " (HTTP " + c + ")");
      // Der EA-Statuscode haengt am Fehler (Punkt 4b): Die Leiste erkennt daran,
      // dass ein Markt-Scan an EA gescheitert ist und beendet die Rotation.
      const mitStatus = (text) => Object.assign(new HardStop(text), { code });
      if (lesen) {
        throw mitStatus(HARD_STOP[code] ? mitCode(code) : "Suche fehlgeschlagen, Code " + code + ".");
      }
      if (code === 473) throw mitStatus(mitCode(473));
      return res;
    }
    if (HARD_STOP[res.status]) {
      // Nach einem Captcha oder einer Sperre sofort wieder zu starten ist der
      // haeufigste Fehler ueberhaupt. Deshalb wird der Start eine Weile
      // blockiert - nicht nur der laufende Betrieb gestoppt.
      sperreFuerCode(res.status);
      throw new HardStop(HARD_STOP[res.status] + " (HTTP " + res.status + ")");
    }

    // 429 steht seit 22.09.2026 in HARD_STOP (15 Min. Pause). Die kurze
    // Pause ueber STATE.pauseUntil gibt es nicht mehr; die Abfragen darauf
    // in kaufPruefung und den Warteschleifen sind nur noch Absicherung.
    return res;
  }

  // Ab wie vielen Angeboten eine Seite "voll" ist (= es gibt vermutlich mehr).
  // Direkt fragt der Bot 21 an, wie die Web App: 20 zeigen, 1 als Zeichen fuer
  // "weiter". Ueber die App kommen wohl nur 20 zurueck - mit 21 hielte der Bot
  // jede Seite fuer die letzte (Preis-Check zu flach, "zu viele Treffer" nie
  // erkannt). Unbestaetigt bis zum ersten Live-Test.
  function volleSeite() {
    return STATE.suchweg === "app" ? CONFIG.PAGE_SIZE - 1 : CONFIG.PAGE_SIZE;
  }

  function searchPath(playerId, maxPrice, start, bidMode, rating, minPrice, rarity) {
    const params = {
      num: String(CONFIG.PAGE_SIZE),
      start: String(start || 0),
      type: "player",
      [ENDPOINTS.idParam]: String(playerId)
    };
    if (minPrice && minPrice > 0) {
      if (bidMode) params[ENDPOINTS.minBidParam || "micr"] = String(minPrice);
      else params[ENDPOINTS.minBuyParam] = String(minPrice);
    }
    if (maxPrice) {
      if (bidMode) params[ENDPOINTS.maxBidParam] = String(maxPrice);
      else params[ENDPOINTS.maxBuyParam] = String(maxPrice);
    }
    // Rating gleich bei EA einschraenken. maskedDefId trifft alle Versionen
    // eines Spielers, und EA liefert nur 21 Treffer - bei beliebten Spielern
    // kann die gesuchte Version sonst gar nicht in der Antwort stehen.
    // Kartenart (24.09.2026): Eine Sonderkarte ist derselbe Spieler mit
    // anderer Kartenart. Ohne diesen Filter liefert EA die Normalversion
    // gleich mit, und der Preis-Check mischt zwei Maerkte.
    // Mehrere Kartenarten (28.09.2026): Das Adressfeld rarityIds nimmt eine
    // Kommaliste (fuer EINE Art am 24.09. live gemessen; FST schickt Listen
    // ueber dasselbe Feld "rarities" der App, scripts.js Z. 1719/1726).
    // "12,70" fragt beide Arten in EINER Suche ab.
    const artListe = rarityListeVon(rarity);
    if (artListe.length) params[ENDPOINTS.rarityParam] = artListe.join(",");
    const ovr = toInt(rating);
    if (ovr > 0 && ovr < 100) {
      params[ENDPOINTS.ovrMinParam] = String(ovr);
      params[ENDPOINTS.ovrMaxParam] = String(ovr);
    }
    return ENDPOINTS.searchPath + "?" + new URLSearchParams(params).toString();
  }

  // Die offene Marktsuche des Scans. Anders als searchPath sucht sie ohne
  // Spieler - deshalb helfen hier Filter wie Liga oder Position wirklich:
  // Sie raeumen die 21 Plaetze frei, genau wie der Mindestpreis.
  //
  // Bei einer Suche MIT Spieler waeren sie sinnlos - Liga, Nation und
  // Position stehen bei einem bestimmten Spieler ja ohnehin fest.
  const SCAN_FILTER_FELDER = [
    ["rarity", "rarityParam"],
    ["level", "levelParam"],
    ["position", "positionParam"],
    ["nation", "nationParam"],
    ["league", "leagueParam"],
    ["playStyle", "playStyleParam"],
    ["club", "clubParam"]
  ];

  // Ein Hinweis, der nur einmal je Sitzung kommt (27.09.2026).
  //
  // Der Adressname fuer den Verein ist geraten (siehe ENDPOINTS.clubParam).
  // Auf dem direkten Weg kann EA ihn still ignorieren - dann sucht der Bot in
  // ALLEN Vereinen, und niemand merkt es. Genau dieses stille Zuweitsuchen
  // soll nicht mehr unbemerkt passieren. Ueber den App-Weg ist der Verein
  // gemessen richtig, darum der Rat im Text.
  let vereinHinweisGezeigt = false;

  function openMarketPath(maxPrice, start, minPrice, filter) {
    const params = { num: String(CONFIG.PAGE_SIZE), start: String(start || 0), type: "player" };
    if (maxPrice) params[ENDPOINTS.maxBuyParam] = String(maxPrice);
    if (minPrice > 0) params[ENDPOINTS.minBuyParam] = String(minPrice);
    for (const [name, endpunkt] of SCAN_FILTER_FELDER) {
      const wert = filterWert(filter, name);
      if (wert !== null) params[ENDPOINTS[endpunkt]] = String(wert);
    }
    if (params[ENDPOINTS.clubParam] !== undefined && STATE.suchweg !== "app" && !vereinHinweisGezeigt) {
      vereinHinweisGezeigt = true;
      const text = "Hinweis: Der Vereins-Filter geht auf dem direkten Weg mit einem ungeprüften Adressnamen hinaus. Ob EA ihn beachtet, ist nicht gemessen – unter Optionen den Suchweg „App“ wählen, dort ist der Verein gemessen richtig.";
      pushEvent("warn", text);
      log(text);
    }
    return ENDPOINTS.searchPath + "?" + new URLSearchParams(params).toString();
  }

  // Ein einzelner Filterwert, oder null fuer "nicht gesetzt".
  //
  // -1 heisst bei EA "egal". Die 0 ist dagegen ein echter Wert: bei der
  // Kartenart "Common", bei der Qualitaet "Bronze". Und null, undefined
  // oder ein leerer Text heissen "nicht gesetzt" - toInt wuerde daraus
  // sonst eine 0 machen und still nach Bronze filtern.
  function filterWert(filter, name) {
    const roh = filter ? filter[name] : null;
    if (roh === null || roh === undefined || roh === "") return null;
    const wert = toInt(roh);
    return Number.isFinite(wert) && wert >= 0 && wert < 100000 ? wert : null;
  }

  // Aus dem, was die Leiste schickt, einen sauberen Filter machen.
  function scanFilterLesen(raw) {
    const out = {};
    for (const [name] of SCAN_FILTER_FELDER) {
      const wert = filterWert(raw, name);
      if (wert !== null) out[name] = wert;
    }
    return out;
  }

  // Ein Mindestpreis raeumt den Billigkram aus den 21 Plaetzen und macht den
  // Scan ergiebiger. Er wird EINMAL je Scan gewuerfelt und gilt fuer alle
  // Seiten der Marktaufnahme - sonst passten die Seiten nicht zusammen.
  function scanMinPrice(maxPrice) {
    if (!(maxPrice >= CONFIG.SCAN_MIN_PRICE_FROM)) return 0;
    return roundDownToStep(randomBetween(0, Math.floor(maxPrice * CONFIG.SCAN_MIN_PRICE_SHARE)));
  }

  function basePlayerId(item) {
    const raw = toInt(item && (item.assetId ?? item.resourceId));
    return raw > 0 ? raw % 1048576 : 0;
  }

  // Dieser Spieler (jede Version oder nur das gewaehlte Rating und die
  // gewaehlte Kartenart), aktiv, mit Sofortkauf.
  //
  // Die Kartenart steht am Angebot im Feld "rareflag" (24.09.2026 live
  // abgelesen: rarityIds=12 gesucht -> rareflag 12 geliefert). EA filtert
  // zwar selbst, aber hier wird nachgesehen - verlaesst sich der Bot allein
  // auf EA, kauft er bei einem stillen Fehler die falsche Karte.
  function isMatch(auction, playerId, rating, rarity, chem) {
    const item = auction.itemData;
    if (!item) return false;
    const id = String(playerId);
    if (String(item.assetId) !== id && String(item.resourceId) !== id) return false;
    if (rating && Number(item.rating) !== rating) return false;
    // rareflag fehlt in manchen Antworten - dann nicht raten, sondern gelten
    // lassen. EA hat ohnehin schon gefiltert.
    // Mehrere Kartenarten (28.09.2026): gegen die GANZE Liste pruefen.
    // Vorher verglich diese Zeile mit Number(rarity) - fuer "12,70" ist das
    // NaN, und jede Karte waere abgeprallt. Genau die Falle aus der Bilanz.
    const artListe = rarityListeVon(rarity);
    if (artListe.length && item.rareflag !== undefined && !artListe.includes(Number(item.rareflag))) return false;
    // Chemie (aufgesetzter Spielstil, PlayStyle+) - 27.09.2026.
    //
    // Der Preis wird getrennt nach Chemie gemessen (buildPriceEntry), gekauft
    // wurde bisher aber jede Chemie. Wir haben also die nackte Karte gemessen
    // und vielleicht die veredelte gekauft - oder umgekehrt. Bei der einen
    // bleibt die Karte liegen, bei der anderen verschenkt man Coins.
    //
    // Verlangt wird die Chemie nur, wenn sie wirklich gemessen wurde:
    // zieleChemieLaden setzt target.chem nur, wenn der Eintrag chemGefiltert
    // trug. Dafuer muss EA das Feld playStyle mitgeschickt haben. Schickt EA es
    // nicht mit, wird nie getrennt gemessen und hier nie etwas verlangt.
    //
    // Ist eine Chemie verlangt, EA schickt sie an DIESEM Angebot aber nicht mit
    // (chemieVon gibt null), wird das Angebot ABGELEHNT - nicht durchgelassen.
    // Ein Angebot nicht zu kaufen kostet nichts, die falsche Karte zu kaufen
    // kostet Coins.
    //
    // Vorsicht bei 0: Das ist bei EA ein echter Wert ("keine Chemie"), kein
    // "unbekannt". Darum typeof statt einer Wahrheitspruefung - Number(null)
    // waere 0 und wuerde still nach "keine Chemie" filtern.
    //
    // FST braucht diese Pruefung nicht: Es laesst EA nach der Chemie filtern
    // (scripts.js Z. 1723 setzt playStyle in die Suche). Wir schreiben nicht in
    // EAs Suchmaske und sehen deshalb selbst nach.
    if (typeof chem === "number" && Number.isFinite(chem) && chem >= 0 && chemieVon(auction) !== chem) return false;
    if (auction.tradeState && auction.tradeState !== "active") return false;
    return auction.tradeId != null && bin(auction) > 0;
  }

  // ---------------------------------------------------------------------------
  // Preis-Check: guenstigstes Angebot, Marktpreis, EA-Spanne, Vorschlag
  // ---------------------------------------------------------------------------

  // --- Preis-Gedaechtnis -----------------------------------------------------
  //
  // FST baut seine Preis-Datenbank aus den Suchen tausender Nutzer. Wir haben
  // nur ein Konto - dafuer werfen wir bisher weg, was EA uns ohnehin schickt:
  // Jede Suche bringt bis zu 21 Angebote, bei einer breiten Suche sind das 21
  // VERSCHIEDENE Karten. Bei 350 Suchen am Tag sind das bis zu 7.000
  // Preis-Punkte - geschenkt, denn die Anfragen laufen sowieso.
  //
  // Gespeichert wird klein: je Karte das billigste je gesehene Angebot, ein
  // gleitender Mittelwert, wie oft sie gesehen wurde und wie oft ein Angebot
  // dabei schon laenger stand. Kostet 0 zusaetzliche EA-Anfragen.
  const GEDAECHTNIS = { puffer: new Map(), letzteSicherung: 0, karten: 0 };
  const GEDAECHTNIS_MAX_KARTEN = 1500;
  const GEDAECHTNIS_MAX_ALTER_MS = 7 * DAY;
  const GEDAECHTNIS_SICHERN_MS = 60000; // hoechstens einmal pro Minute schreiben
  const GEDAECHTNIS_PUFFER_MAX = 200;
  // Marktanker (25.09.2026): Das billigste Angebot, das beim Sehen schon
  // mindestens 5 Minuten stand. Ein Lockangebot, das nach zehn Sekunden wieder
  // weg ist, kommt hier nicht hinein. FUT Simple Trader sammelt denselben Wert
  // (scripts.js Z. 28418-28438) und ueberspringt dort ebenfalls alles, was
  // 5 Minuten oder juenger ist. Der frueher hier stehende Zaehler "alt"
  // (120 Sekunden) wurde nur gefuellt und nirgends gelesen.
  const GEDAECHTNIS_ANKER_AB_S = 300;

  function gedaechtnisMerken(auctions) {
    if (!Array.isArray(auctions)) return;
    for (const a of auctions) {
      const preis = Number(a && a.buyNowPrice) || 0;
      const item = a && a.itemData;
      if (!(preis > 0) || !item) continue;
      const assetId = toInt(item.assetId) || 0;
      if (!assetId) continue;
      // Die Kartenart gehoert in den Schluessel (25.09.2026). Ohne sie landen
      // die Normalkarte und eine Sonderkarte desselben Spielers mit demselben
      // Rating im selben Topf - und der Bot rechnet mit einem Mischpreis aus
      // zwei Maerkten, die nichts miteinander zu tun haben.
      //
      // Genau dieselbe Regel wie in priceKey(): die Kartenart kommt nur dran,
      // wenn es eine gibt. Alte Eintraege ohne bleiben damit gueltig und
      // laufen von selbst aus.
      //
      // Vorsicht bei rareflag: toInt(null) ist 0, und 0 ist bei EA ein echter
      // Wert ("Common"). Fehlt das Feld, darf deshalb KEINE Kartenart in den
      // Schluessel - sonst wuerde jede Karte ohne Angabe als Normalkarte
      // verbucht. Nur eine echte Zahl zaehlt.
      const art = typeof item.rareflag === "number" && Number.isFinite(item.rareflag) ? Math.floor(item.rareflag) : -1;
      const key = priceKey(assetId, toInt(item.rating) || 0, art);
      const alterS = angebotsAlterS(a.expires);
      const e = GEDAECHTNIS.puffer.get(key) || { n: 0, min: 0, summe: 0, anker: 0 };
      e.n += 1;
      e.summe += preis;
      if (!e.min || preis < e.min) e.min = preis;
      // k.min kann ein Lockangebot sein - der Anker nicht (25.09.2026). Nur
      // Angebote, die beim Sehen schon standen, zaehlen hier. Kennen wir das
      // Alter nicht, zaehlt das Angebot nicht mit: geraten wird nicht.
      if (alterS !== null && alterS >= GEDAECHTNIS_ANKER_AB_S && (!e.anker || preis < e.anker)) e.anker = preis;
      GEDAECHTNIS.puffer.set(key, e);
    }
    gedaechtnisVielleichtSichern();
  }

  function gedaechtnisVielleichtSichern() {
    if (!GEDAECHTNIS.puffer.size) return;
    const eilig = GEDAECHTNIS.puffer.size >= GEDAECHTNIS_PUFFER_MAX;
    if (!eilig && Date.now() - GEDAECHTNIS.letzteSicherung < GEDAECHTNIS_SICHERN_MS) return;
    gedaechtnisSichern().catch(() => {});
  }

  function gedaechtnisSichern() {
    const puffer = GEDAECHTNIS.puffer;
    GEDAECHTNIS.puffer = new Map();
    GEDAECHTNIS.letzteSicherung = Date.now();
    if (!puffer.size) return Promise.resolve();
    marktVerlaufSichern(puffer);
    return updateStorage("preisGedaechtnis", (current) => {
      const jetzt = Date.now();
      const alt = current && typeof current === "object" && current.karten && typeof current.karten === "object" ? current.karten : {};
      const neu = {};
      for (const key of Object.keys(alt)) {
        const k = alt[key];
        if (!k || !(Number(k.t) > jetzt - GEDAECHTNIS_MAX_ALTER_MS)) continue;
        neu[key] = k;
      }
      for (const [key, e] of puffer) {
        const k = neu[key] || { n: 0, min: 0, mittel: 0, letzt: 0, t: 0, erst: jetzt };
        k.n += e.n;
        // Der Anker bekommt einen eigenen Zeitstempel (25.09.2026). Sonst
        // waere spaeter nicht zu erkennen, ob er von heute frueh oder von
        // vorletzter Woche stammt - und ein alter Anker ist schlimmer als
        // gar keiner. Wie bei k.letzt zaehlt immer die letzte Runde, nicht
        // das billigste aus sieben Tagen. Der Zaehler k.alt faellt weg: Er
        // wurde nie gelesen. Alte Eintraege tragen ihn stumm weiter, bis sie
        // nach sieben Tagen von selbst auslaufen.
        if (e.anker > 0) {
          k.ankerMin = e.anker;
          k.ankerT = jetzt;
        }
        k.min = k.min ? Math.min(k.min, e.min) : e.min;
        const mittelNeu = Math.round(e.summe / e.n);
        // Gleitender Mittelwert: Neues zaehlt 30 %, damit alte Preise langsam
        // verblassen, ohne dass ein Ausreisser alles umwirft.
        k.mittel = k.mittel ? Math.round(k.mittel * 0.7 + mittelNeu * 0.3) : mittelNeu;
        k.letzt = e.min;
        k.t = jetzt;
        neu[key] = k;
      }
      const keys = Object.keys(neu);
      if (keys.length > GEDAECHTNIS_MAX_KARTEN) {
        // Zu viele: Die am laengsten nicht gesehenen fliegen raus.
        keys.sort((a, b) => (neu[b].t || 0) - (neu[a].t || 0));
        for (const key of keys.slice(GEDAECHTNIS_MAX_KARTEN)) delete neu[key];
      }
      GEDAECHTNIS.karten = Math.min(keys.length, GEDAECHTNIS_MAX_KARTEN);
      return { v: 1, at: jetzt, karten: neu };
    });
  }

  // Preisverlauf fuer die Markt-Analyse (markt.js, 02.10.2026).
  //
  // Je Karte ein Messpunkt pro Sicherung, daraus erkennt markt.js Dips und
  // steigende Nachfrage. Gespeichert wird NUR der Marktanker (Angebot stand
  // beim Sehen schon >= 5 Minuten): Ein Lockangebot, das nach Sekunden wieder
  // weg ist, wuerde sonst einen Dip vortaeuschen, der nie kaufbar war.
  // Kostet keine EA-Anfrage - die Preise stammen aus den normalen Suchen.
  function marktVerlaufSichern(puffer) {
    const M = typeof FC27Markt === "object" ? FC27Markt : null;
    if (!M) return;
    const jetzt = Date.now();
    const punkte = [];
    for (const [key, e] of puffer) {
      if (e && e.anker > 0) punkte.push([key, e.anker, e.n]);
    }
    if (!punkte.length) return;
    updateStorage("marktVerlauf", (current) => {
      const alle = current && typeof current === "object" && current.karten && typeof current.karten === "object" ? current.karten : {};
      for (const [key, preis, n] of punkte) {
        alle[key] = M.verlaufEintragen(alle[key], jetzt, preis, n);
      }
      return { v: 1, at: jetzt, karten: M.verlaufBegrenzen(alle) };
    });
  }

  // Verkaufspreis aus dem Preis-Gedaechtnis (27.09.2026).
  //
  // Warum es das braucht: Der Preis-Check ist waehrend eines Laufs gesperrt
  // ("Erst den Bot stoppen, dann den Preis pruefen"). Nach 60 Minuten Laufzeit
  // gab es deshalb keinen gueltigen Verkaufspreis mehr, und der Bot stellte ab
  // da KEINE Karte mehr ein. FUT Simple Trader stellt auch nach acht Stunden
  // noch jede Karte ein, weil dort eine getippte Zahl im Filter steht
  // (listBuyNowPrice, scripts.js Z. 59392-59404).
  //
  // Unser Weg kostet keine einzige zusaetzliche EA-Anfrage: Das Gedaechtnis
  // fuellt sich aus den Suchen, die der Bot sowieso macht (gedaechtnisMerken).
  //
  // Genommen wird NUR der Marktanker: das billigste Angebot, das beim Sehen
  // schon mindestens 5 Minuten stand. Ein Lockangebot, das nach zehn Sekunden
  // wieder weg ist, kommt hier nicht hinein.
  //
  // Kein Raten und kein stiller Verlust: Fehlt der Anker oder ist er aelter,
  // als ein Preis-Check sein darf, kommt null zurueck - dann sagt der Bot
  // ehrlich, dass er keinen Preis hat. Der billigste Preis der letzten Runde
  // (k.letzt) wird ausdruecklich NICHT genommen: Der kann ein Lockangebot
  // sein, und darunter zu verkaufen kostet Coins.
  async function gedaechtnisPreis(key) {
    if (!key) return null;
    // Das Frischeste zuerst: Was noch im Puffer liegt, ist aus dieser Minute.
    const offen = GEDAECHTNIS.puffer.get(key);
    const jetztAnker = plausiblePrice(offen && offen.anker);
    if (jetztAnker) return { preis: jetztAnker, quelle: "gedaechtnis", alterMs: 0, eaMin: 0, eaMax: 0 };
    let k = null;
    try {
      const { preisGedaechtnis } = await chrome.storage.local.get("preisGedaechtnis");
      const karten = preisGedaechtnis && preisGedaechtnis.karten;
      k = karten && typeof karten === "object" ? karten[key] : null;
    } catch (e) {
      k = null;
    }
    const anker = plausiblePrice(k && k.ankerMin);
    const ankerT = toInt(k && k.ankerT);
    if (!anker || !ankerT) return null;
    const alterMs = Date.now() - ankerT;
    if (alterMs > CONFIG.LIST_PRICE_MAX_AGE_MS) return null;
    return { preis: anker, quelle: "gedaechtnis", alterMs, eaMin: 0, eaMax: 0 };
  }

  function plausiblePrice(value) {
    const n = toInt(value);
    return n > 0 ? n : 0;
  }

  // So viele Angebote mit gleicher Chemie muessen es mindestens sein, sonst
  // wird nicht getrennt (25.09.2026). Eine zu duenne Stichprobe ist
  // schlimmer als eine gemischte.
  const CHEM_MIN_ANGEBOTE = 4;

  // Die Chemie eines Angebots. EA nennt das Feld playStyle, 0 heisst "keine".
  // Fehlt es, kommt null zurueck - dann wird nicht gefiltert statt geraten.
  // Vorsicht wie bei rareflag: 0 ist ein echter Wert, kein "unbekannt".
  function chemieVon(auction) {
    const item = auction && auction.itemData;
    if (!item) return null;
    const v = item.playStyle;
    return typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : null;
  }

  // --- Preis nach Alter (F1) ---
  //
  // Idee von FUT Simple Trader (scripts.js Z. 28305-28410): Steht ein Angebot
  // schon ein paar Minuten unverkauft da, ist sein Preis zu hoch. Wer zu dem
  // Preis verkaufen will, wartet also lange. FST macht daraus viele echte
  // Suchen. Wir nicht: Wir rechnen nur mit den Angeboten, die der Preis-Check
  // und der Markt-Scan ohnehin schon geholt haben. Das kostet 0 Anfragen.
  //
  // Das Alter schaetzen wir aus der Restzeit: Die kuerzeste uebliche Laufzeit,
  // die groesser ist als die Restzeit, minus Restzeit. Die Schaetzung ist immer
  // eine Untergrenze - ein Angebot ist nie juenger als geschaetzt.
  const ANGEBOT_LAUFZEITEN_S = [3600, 10800, 21600, 43200, 86400, 259200];
  const ALTER_TOLERANZ_S = 30; // kleine Verzoegerung zwischen EA und uns
  const ALTER_MIN_ANGEBOTE = 3; // so viele Angebote brauchen eine Restzeit
  // Ganz frische Angebote zaehlen beim Marktpreis nicht mit (25.09.2026):
  // Ein Angebot, das vor zehn Sekunden eingestellt wurde, sagt noch nichts
  // darueber, was man dafuer bekommt - niemand hatte Zeit, es zu kaufen.
  // FUT Simple Trader laesst aus demselben Grund alles unter ZWEI Minuten weg
  // (scripts.js Z. 27447-27470 und 28345-28356).
  //
  // Richtiggestellt am 27.09.2026: Hier stand "unter einer Minute" und 60
  // Sekunden. Das war falsch abgelesen. FST rechnet die Standzeit in GANZEN
  // Minuten (Math.floor in calculateTimeOnMarket, scripts.js Z. 28305-28338)
  // und zaehlt dann nur "minutes > 1". Abgerundet heisst das: alles unter 120
  // Sekunden gilt als frisch und zaehlt nicht mit.
  const MARKT_FRISCH_AB_S = 120; // juenger als zwei Minuten = noch kein Marktpreis
  const MARKT_GEREIFT_MIN = 5; // so viele muessen danach uebrig bleiben, sonst alle
  const ALTER_MIN_ANTEIL = 0.5; // und mindestens die Haelfte aller Angebote
  // Ab diesem Abstand zu EAs eigenem Marktschnitt wird gewarnt (25.09.2026).
  // Bewusst grob: Der Schnitt ist nur eine zweite Meinung, keine Rechnung.
  // Eine engere Grenze wuerde bei jeder zweiten Karte anschlagen.
  const EA_SCHNITT_WARN_AB = 0.4;
  const ALTER_MAX_SENKUNG = 0.1; // hoechstens 10 % unter den Marktpreis
  // ... und nach oben deckelt ein Aufschlag auf den MARKTANKER. Das ist der
  // Kern von FSTs Preisfindung: Gesucht wird nicht der Marktpreis, sondern der
  // HOECHSTE Preis, bei dem der Markt darunter noch leer oder frisch ist.
  //
  // Am 27.09.2026 an zwei Stellen richtiggestellt, nachdem FSTs Code noch
  // einmal gelesen wurde:
  //
  // 1. Die Grundzahl war falsch. FST rechnet den Aufschlag auf den MARKTANKER
  //    - auf das billigste Angebot, das schon 5 Minuten stand (getPriceCeiling,
  //    scripts.js Z. 28439-28453; der Anker wird in Z. 28418-28438 gesammelt).
  //    Wir haben auf unseren gemessenen Marktpreis gerechnet, und das ist eine
  //    andere, meist kleinere Zahl.
  // 2. Die Zahlen waren etwa halbiert. FSTs Staffel steht in scripts.js
  //    Z. 28023-28034: bis 1.000 das 1,6-fache, bis 10.000 das 1,45-fache,
  //    bis 50.000 das 1,3-fache, bis 200.000 das 1,2-fache, darueber das
  //    1,15-fache. Bei uns stand 0,4 statt 0,6 und so weiter. Jetzt stehen
  //    FSTs Zahlen.
  //
  // Warum das gefahrlos ist: Der Deckel ist nur eine OBERGRENZE. Der Preis
  // selbst kommt immer aus preisNachAlter und liegt dort eine Preisstufe unter
  // einem Angebot, das wir wirklich gesehen haben. Ein hoeherer Deckel kann
  // also keinen Preis erfinden - er hoert nur auf, echte Funde abzuschneiden.
  //
  // Und der KAUFPREIS steigt dadurch nicht: Die Notbremse vom 23.09.2026 in
  // popup.js (suggestionFor, marktDeckel) laesst ihn nie ueber den gemessenen
  // Marktpreis. Diese Bremse bleibt.
  const ALTER_ANHEBUNG_STAFFEL = [
    { bis: 1000, anhebung: 0.6 },
    { bis: 10000, anhebung: 0.45 },
    { bis: 50000, anhebung: 0.3 },
    { bis: 200000, anhebung: 0.2 }
  ];
  const ALTER_MAX_ANHEBUNG = 0.15; // alles ab 200.000

  // Die Preisklasse waehlt FST nach der GRUNDZAHL, nicht nach dem Marktpreis
  // (scripts.js Z. 28444-28447: n < e.price, mit n = Anker).
  function maxAnhebung(grundzahl) {
    const stufe = ALTER_ANHEBUNG_STAFFEL.find((s) => Number(grundzahl) < s.bis);
    return stufe ? stufe.anhebung : ALTER_MAX_ANHEBUNG;
  }

  // Der Marktanker aus EINER Messung (27.09.2026): das billigste Angebot, das
  // beim Sehen schon mindestens 5 Minuten stand. Genau FSTs
  // trackMarketAnchors (scripts.js Z. 28418-28438; dort ueberspringt
  // "minutes <= 5" alles Juengere). Ein Lockangebot, das nach zehn Sekunden
  // wieder weg ist, kommt hier nicht hinein.
  //
  // 0 heisst: kein Anker. Kennen wir das Alter eines Angebots nicht, zaehlt es
  // nicht mit - geraten wird nicht.
  function marktAnker(angebote) {
    let anker = 0;
    for (const a of angebote) {
      if (a.alterS === null || a.alterS < GEDAECHTNIS_ANKER_AB_S) continue;
      if (!anker || a.preis < anker) anker = a.preis;
    }
    return anker;
  }

  // Obergrenze fuer den Preis nach Alter. FST rechnet Anker x Faktor und
  // laesst mindestens eine Preisstufe ueber dem Anker zu (scripts.js
  // Z. 28448-28450: Math.max aus beidem).
  //
  // Fehlt der Anker, bleibt es beim alten Weg ueber den Marktpreis. Der Wert
  // wird also nicht weggeworfen, nur die Grundzahl ist eine schlechtere -
  // welche es war, steht als ankerQuelle im Eintrag.
  function preisDeckel(anker, markt) {
    const grund = Number(anker) > 0 ? Number(anker) : Number(markt) || 0;
    if (!(grund > 0)) return 0;
    const gestaffelt = roundDownToStep(Math.floor(grund * (1 + maxAnhebung(grund))));
    return Math.max(gestaffelt, grund + stepFor(grund));
  }
  const PREIS_METHODEN = {
    sicher: { altAbS: 120, alteNoetig: 1, vieleAb: 0, trefferMax: 2 },
    empfohlen: { altAbS: 120, alteNoetig: 1, vieleAb: 0, trefferMax: 15 },
    locker: { altAbS: 1800, alteNoetig: 3, vieleAb: 10, trefferMax: 20 }
  };

  function preisMethodeGueltig(name) {
    // Object.keys statt PREIS_METHODEN[name]: Sonst waere "constructor" gueltig.
    return Object.keys(PREIS_METHODEN).includes(name) ? name : "empfohlen";
  }

  function angebotsAlterS(restS) {
    const rest = Number(restS);
    if (!Number.isFinite(rest) || rest <= 0) return null;
    const laufzeit = ANGEBOT_LAUFZEITEN_S.find((l) => rest <= l + ALTER_TOLERANZ_S);
    if (!laufzeit) return null;
    return Math.max(0, laufzeit - rest);
  }

  // Ab welchem Preis lohnt sich das Warten nicht mehr? Wir gehen die Angebote
  // vom billigsten zum teuersten durch, so als wuerde man mit immer hoeherem
  // Maximalpreis suchen. Beim ersten Preis, der nach der Regel "zu hoch" ist,
  // hoeren wir auf und gehen eine Preisstufe darunter.
  function preisNachAlter(angebote, methode) {
    const regel = PREIS_METHODEN[preisMethodeGueltig(methode)];
    const sortiert = angebote.slice().sort((a, b) => a.preis - b.preis);
    let treffer = 0;
    let alte = 0;
    let aeltesteS = 0;
    for (let i = 0; i < sortiert.length; i++) {
      const a = sortiert[i];
      treffer++;
      if (a.alterS !== null && a.alterS >= regel.altAbS) {
        alte++;
        if (a.alterS > aeltesteS) aeltesteS = a.alterS;
      }
      // Gleiche Preise gehoeren zusammen: erst nach dem letzten urteilen.
      if (i + 1 < sortiert.length && sortiert[i + 1].preis === a.preis) continue;
      const zuAlt = alte >= regel.alteNoetig || (regel.vieleAb > 0 && treffer >= regel.vieleAb && alte >= 1);
      const zuViele = treffer > regel.trefferMax;
      if (zuAlt || zuViele) {
        return {
          roh: Math.max(CONFIG.MIN_PRICE, roundDownToStep(a.preis - 1)),
          regel: zuAlt ? "alt" : "viele",
          beweis: a.preis,
          beweisMin: zuAlt ? Math.floor(aeltesteS / 60) : 0,
          treffer
        };
      }
    }
    return { roh: 0, regel: "", beweis: 0, beweisMin: 0, treffer };
  }

  // Alle drei Methoden auf einmal ausrechnen und klein im Eintrag ablegen.
  // Dann kostet das Umschalten der Methode spaeter keine neue Messung.
  function alterAuswerten(listings, market, eaMin, eaMax) {
    const angebote = (listings || [])
      .filter((a) => Number(a && a.buyNowPrice) > 0)
      .map((a) => ({ preis: Number(a.buyNowPrice), alterS: angebotsAlterS(a.expires) }));
    const mitAlter = angebote.filter((a) => a.alterS !== null).length;
    const markt = Number(market) || 0;
    const genug = mitAlter >= ALTER_MIN_ANGEBOTE && mitAlter >= angebote.length * ALTER_MIN_ANTEIL;
    // Untergrenze: Ein einzelnes seltsames Angebot darf den Preis nicht stuerzen.
    const untergrenze = Math.max(Number(eaMin) || 0, roundDownToStep(Math.floor(markt * (1 - ALTER_MAX_SENKUNG))));
    // Obergrenze (27.09.2026 auf FSTs Weg umgestellt): Grundzahl ist jetzt der
    // MARKTANKER - das billigste Angebot, das beim Sehen schon 5 Minuten stand
    // -, nicht mehr unser gemessener Marktpreis. Fehlt der Anker, bleibt der
    // Marktpreis die Grundzahl; welche es war, steht als ankerQuelle im
    // Eintrag. Nichts verschwindet stillschweigend.
    //
    // Nie ueber das EA-Maximum und nie ueber das teuerste Angebot, das wir
    // wirklich gesehen haben. Die zweite Bremse bleibt genau so stehen, obwohl
    // FST sie nicht hat - und zwar aus einem einfachen Grund: Sie kann gar
    // nicht zu streng sein. Der Preis kommt immer aus preisNachAlter und liegt
    // dort schon eine Preisstufe UNTER einem gesehenen Angebot. Hoeher als
    // gesehenMax kann er also nie werden. Sie bleibt als letzte Notbremse
    // gegen einen Rechenfehler.
    const anker = marktAnker(angebote);
    const gesehenMax = angebote.length ? Math.max(...angebote.map((a) => a.preis)) : 0;
    let obergrenze = preisDeckel(anker, markt);
    // Der Markt bleibt die zweite Stimme (27.09.2026) - SOLANGE der Haken
    // "Preisdeckel wie FST" nicht gesetzt ist (28.09.2026). Mit Haken gilt
    // der zweite Deckel weiter unten, der diese Bremse weglaesst; beide
    // werden bei jeder Messung ausgerechnet, der Haken entscheidet erst beim
    // Lesen. Der sichere Weg (dieser hier) bleibt der Standard.
    //
    // Der Anker ist das billigste Angebot, das schon eine Weile steht - er
    // sagt, wo die Decke ist. Liegt er weit ueber dem gemessenen Marktpreis,
    // widersprechen sich die beiden Messungen, und dann ist Vorsicht richtig.
    //
    // Ohne diese Bremse kam bei Markt 20.000 und Angeboten bei 40.000 ein
    // Verkaufspreis von 39.750 heraus. Die Karte haette dort gestanden wie
    // die anderen auch - unverkauft. Genau das sagt ein hoher Anker ja aus:
    // Bei diesem Preis geht nichts weg.
    //
    // Die Staffel gilt darum auch fuer den Markt. Bei billigen Karten ist sie
    // weit (60 %), bei teuren eng (15 %) - dieselben Zahlen wie beim Anker.
    // Zweiter Deckel ohne Markt-Bremse (28.09.2026): genau FSTs Weg. FUT
    // Simple Trader kennt nur den Anker-Deckel (getPriceCeiling, scripts.js
    // Z. 28439-28453) - die Markt-Bremse ist unsere eigene Zutat. Hier werden
    // BEIDE Werte ausgerechnet und im Eintrag abgelegt. Welcher gilt,
    // entscheidet erst der Leser am Haken "deckelFst". So kostet das
    // Umschalten keine neue Messung.
    //
    // gesehenMax und EAs Maximum gelten in beiden Wegen. gesehenMax kann nie
    // etwas abschneiden (der Preis liegt immer eine Stufe unter einem wirklich
    // gesehenen Angebot) und bleibt reines Fangnetz gegen Rechenfehler. Und
    // ueber EAs Maximum nimmt EA den Preis gar nicht an.
    let obergrenzeFst = obergrenze;
    if (markt > 0) {
      const marktDeckel = roundDownToStep(Math.floor(markt * (1 + maxAnhebung(markt))));
      obergrenze = Math.min(obergrenze, Math.max(marktDeckel, markt + stepFor(markt)));
    }
    if (gesehenMax > 0) {
      obergrenze = Math.min(obergrenze, gesehenMax);
      obergrenzeFst = Math.min(obergrenzeFst, gesehenMax);
    }
    if (Number(eaMax) > 0) {
      obergrenze = Math.min(obergrenze, Number(eaMax));
      obergrenzeFst = Math.min(obergrenzeFst, Number(eaMax));
    }
    obergrenze = Math.max(obergrenze, markt);
    obergrenzeFst = Math.max(obergrenzeFst, markt);
    const methoden = {};
    for (const name of Object.keys(PREIS_METHODEN)) {
      const r = preisNachAlter(angebote, name);
      const brauchbar = genug && r.roh > 0;
      methoden[name] = {
        preis: brauchbar ? Math.min(obergrenze, Math.max(r.roh, untergrenze)) : markt,
        // Derselbe Preis, nur ohne die Markt-Bremse (28.09.2026). Er gilt
        // erst, wenn der Nutzer den Haken "Preisdeckel wie FST" setzt.
        preisFst: brauchbar ? Math.min(obergrenzeFst, Math.max(r.roh, untergrenze)) : markt,
        roh: r.roh,
        regel: r.regel,
        beweis: r.beweis,
        beweisMin: r.beweisMin,
        treffer: r.treffer
      };
    }
    // Woran der Deckel haengt, muss ablesbar sein (27.09.2026). "anker" ist
    // das billigste Angebot, das beim Sehen schon 5 Minuten stand, "deckel"
    // die daraus errechnete Obergrenze. ankerQuelle "markt" heisst: kein Anker
    // gefunden, gerechnet wurde mit dem Marktpreis. Ohne diese drei Zahlen
    // koennte niemand nachpruefen, warum ein Preis so hoch oder so tief liegt.
    // deckelFst steht mit im Eintrag (28.09.2026): So kann jeder nachlesen,
    // was der Haken "Preisdeckel wie FST" bei dieser Messung bedeutet haette.
    return { v: 1, markt, n: angebote.length, mitAlter, genug, methoden, anker, deckel: obergrenze, deckelFst: obergrenzeFst, ankerQuelle: anker > 0 ? "anker" : "markt" };
  }

  // Reiner Leser fuer den Motor (z. B. automatisches Einstellen nach dem Kauf).
  // Gleiche Leseregel wie verkaufsPreis() in popup.js; ein Test haelt beide gleich.
  function verkaufsPreisAusEintrag(entry, methode) {
    const markt = Number(entry && entry.market) || 0;
    const name = preisMethodeGueltig(methode);
    const alter = entry && entry.alter;
    const m = alter && alter.v === 1 && alter.markt === markt && alter.methoden ? alter.methoden[name] : null;
    // Haken "Preisdeckel wie FST" (28.09.2026): Dann gilt der Preis ohne die
    // Markt-Bremse. Alte Eintraege kennen preisFst noch nicht - dann bleibt
    // es beim vorsichtigen Preis, nichts faellt still aus. Muss genauso in
    // popup.js verkaufsPreis stehen - ein Test haelt beide gleich.
    const gewaehlt = m && STATE.deckelFst && Number(m.preisFst) > 0 ? Number(m.preisFst) : (m ? Number(m.preis) : 0);
    const basis = gewaehlt > 0 ? gewaehlt : markt;
    // Dasselbe eigene Verschieben wie in popup.js (27.09.2026): zuletzt, nach
    // Methode und Deckel, und danach zurueck in EAs erlaubte Spanne. Beide
    // Stellen muessen denselben Preis ausrechnen - ein Test haelt sie gleich.
    let preis = basis;
    if (STATE.preisStufen && preis > 0) {
      preis = umStufenVerschieben(preis, STATE.preisStufen);
      const eaMin = plausiblePrice(entry && entry.eaMin);
      const eaMax = plausiblePrice(entry && entry.eaMax);
      if (eaMin && preis < eaMin) preis = eaMin;
      if (eaMax && preis > eaMax) preis = eaMax;
    }
    // "quelle" beschreibt weiter, WOHER der Preis stammt - das eigene
    // Verschieben aendert daran nichts, es steht getrennt in "stufen".
    return { preis, markt, methode: name, quelle: basis === markt ? "markt" : "alter", stufen: STATE.preisStufen || 0 };
  }

  function buildPriceEntry(listings, lowest, bandMax, searches) {
    // Chemie trennt Maerkte (25.09.2026): Auf eine Karte kann ein Spielstil
    // (PlayStyle+) aufgesetzt sein. Die Karte mit und die ohne sind zwei
    // verschiedene Maerkte - in einem Topf liegt unser Preis zwischen beiden:
    // zu hoch fuer die nackte Karte, zu niedrig fuer die veredelte. FUT
    // Simple Trader behandelt jede Chemie als eigenen Markt (scripts.js
    // Z. 59392-59403 vergleicht t.chemistry === e.playStyle).
    //
    // FSTs Weg - je Chemie eine eigene Preisermittlung - gehen wir NICHT.
    // Das waeren vier komplette Preis-Checks statt einem und wuerde das
    // Tageslimit sprengen. Wir sortieren nur oertlich: gemessen wird die
    // Chemie des billigsten Angebots, denn genau die Karte wollen wir kaufen.
    //
    // Zwei Notbremsen, weil ungeprueft ist, ob EA das Feld mitschickt (die
    // Feld-Probe in den Optionen beantwortet das): Kennt die Haelfte der
    // Angebote ihre Chemie nicht, wird nicht getrennt. Und bleiben weniger
    // als CHEM_MIN_ANGEBOTE uebrig, wird auch nicht getrennt. Was dabei
    // herauskam, steht als chem/chemGefiltert im Eintrag - es verschwindet
    // nichts stillschweigend.
    const chemieZiel = chemieVon(listings.find((a) => bin(a) === lowest));
    const chemieBekannt = listings.filter((a) => chemieVon(a) !== null).length;
    let chemGefiltert = false;
    if (chemieZiel !== null && chemieBekannt >= listings.length * 0.5) {
      const gleich = listings.filter((a) => chemieVon(a) === chemieZiel);
      if (gleich.length >= CHEM_MIN_ANGEBOTE) {
        listings = gleich;
        chemGefiltert = true;
      }
    }
    // Nicht einfach den Durchschnitt nehmen: Ein einzelnes Lockangebot oder ein
    // Fantasiepreis darf den Marktpreis nicht verschieben. Stattdessen suchen wir
    // unter den guenstigsten Angeboten die erste ausreichend grosse Preisgruppe.
    const prices = listings.map(bin).filter((p) => p > 0).sort((a, b) => a - b).slice(0, CONFIG.CHECK_MAX_LISTINGS);
    // Nur fuer die PREISGRUPPE die ganz frischen Angebote weglassen
    // (25.09.2026). Das billigste Angebot (lowest) bleibt unangetastet -
    // dort wollen wir kaufen, egal wie frisch es ist. Kennen wir die
    // Restzeit nicht, gilt das Angebot als gereift: geraten wird nicht, und
    // weggeworfen erst recht nicht.
    const gereift = listings
      .filter((a) => {
        if (!(bin(a) > 0)) return false;
        const alterS = angebotsAlterS(a.expires);
        return alterS === null || alterS >= MARKT_FRISCH_AB_S;
      })
      .map(bin).sort((a, b) => a - b).slice(0, CONFIG.CHECK_MAX_LISTINGS);
    // Bleiben zu wenige uebrig, ist die duenne Stichprobe schlimmer als der
    // Fehler, den wir beheben wollen - dann wieder alle nehmen.
    const gruppenPreise = gereift.length >= MARKT_GEREIFT_MIN ? gereift : prices;
    const frischRaus = prices.length - gruppenPreise.length;
    const needed = gruppenPreise.length >= 8 ? 3 : 2;
    let cluster = [];
    for (let i = 0; i < gruppenPreise.length; i++) {
      const end = gruppenPreise[i] * (1 + CONFIG.CHECK_CLUSTER_BAND);
      const group = gruppenPreise.slice(i).filter((p) => p <= end);
      if (group.length >= needed) {
        cluster = group;
        break;
      }
    }
    if (!cluster.length) cluster = gruppenPreise.slice(0, Math.min(5, gruppenPreise.length));

    // Unterer Median: vorsichtiger als Mittelwert und robust gegen teure Ausreisser.
    const market = cluster[Math.floor((cluster.length - 1) / 2)];
    const spread = cluster.length > 1 ? cluster[cluster.length - 1] / cluster[0] - 1 : 1;
    // Gezaehlt wird der Topf, aus dem die Gruppe stammt (25.09.2026). Mit der
    // vollen Liste waere die Sicherheit hoeher, als die Messung hergibt -
    // die frischen Angebote haben ja nicht mitgerechnet.
    let confidence = "niedrig";
    if (gruppenPreise.length >= 12 && cluster.length >= 8 && spread <= 0.05) confidence = "hoch";
    else if (gruppenPreise.length >= 6 && cluster.length >= 4 && spread <= 0.1) confidence = "mittel";

    const item = (listings.find((a) => bin(a) === lowest) || {}).itemData || {};
    let eaMin = plausiblePrice(item.marketDataMinPrice);
    let eaMax = plausiblePrice(item.marketDataMaxPrice);
    if (eaMin && eaMax && eaMin > eaMax) eaMin = eaMax = 0;

    // EAs eigener Marktschnitt (25.09.2026): EA legt ihn bei den Angeboten
    // bei. Das kostet uns keine einzige Anfrage, er steht schon in derselben
    // Antwort.
    //
    // Als RECHENGRUNDLAGE taugt er nicht, und wir machen ihn auch nicht dazu.
    // FUT Simple Trader rechnet nirgends selbst damit: scripts.js Z. 27389
    // und 28415 legen ihn nur ab, Z. 28596-28612 schicken ihn an deren
    // Server. Unser Preis bleibt der selbst gemessene.
    //
    // Als zweite Meinung taugt er: Liegt unsere Messung weit daneben, haben
    // wir wahrscheinlich in einen leeren oder verzerrten Markt geschaut.
    // Dann soll der Nutzer es sehen und nachmessen.
    //
    // Nicht uebernommen: lastSalePrice und discardValue. Bei einem FREMDEN
    // Angebot ist lastSalePrice der Preis, den der heutige Verkaeufer einst
    // bezahlt hat - kein Marktwert. discardValue ist EAs fester
    // Schnellverkaufs-Wert aus dem Rating und bewegt sich mit dem Markt gar
    // nicht. Beide bleiben dort, wo sie stimmen: bei den eigenen Karten.
    const eaSchnitt = plausiblePrice(item.marketAverage ?? item._marketAverage);
    const schnittWarnung = eaSchnitt > 0 && market > 0 && Math.abs(market - eaSchnitt) / eaSchnitt > EA_SCHNITT_WARN_AB;

    // Klebt der Marktpreis an EAs Mindestpreis, ist Gewinn unmoeglich
    // (27.09.2026). Unter eaMin darf niemand verkaufen, also kann dort auch
    // niemand guenstiger einkaufen. FUT Simple Trader bricht in diesem Fall den
    // ganzen Preis-Check ab ("The card price is to close to the minimum price
    // range", scripts.js Z. 28104-28110 und 28222-28227). Wir haben bisher nur
    // eine Notiz geschrieben und weitergesucht.
    //
    // "Direkt darueber" heisst: hoechstens eine Preisstufe. Eine Stufe ist der
    // kleinste Schritt, den EA ueberhaupt zulaesst.
    const amEaMinimum = eaMin > 0 && market > 0 && market <= eaMin + stepFor(eaMin);
    let suggestion = roundDownToStep(Math.floor(market * (1 - CONFIG.SUGGEST_DISCOUNT)));
    let note = "";
    if (eaMin && suggestion < eaMin) {
      suggestion = eaMin;
      note = lowest <= eaMin ? "Preis liegt schon am EA-Minimum, günstiger geht es nicht." : "Vorschlag auf das EA-Minimum angehoben.";
    }
    if (eaMax && suggestion > eaMax) {
      suggestion = eaMax;
      note = "Vorschlag auf das EA-Maximum begrenzt.";
    }

    return {
      t: Date.now(),
      lowest,
      countAtLowest: prices.filter((p) => p === lowest).length,
      market,
      sampleSize: prices.length,
      clusterSize: cluster.length,
      spread,
      confidence,
      band: prices.filter((p) => p <= bandMax).length,
      // Wie viele ganz frische Angebote aus der Preisgruppe geflogen sind
      // (25.09.2026). 0 heisst: keine - oder es waren so wenige gereifte da,
      // dass wieder alle genommen wurden.
      frischRaus,
      eaMin,
      eaMax,
      // Der Marktpreis klebt an EAs Mindestpreis, Gewinn ist unmoeglich
      // (27.09.2026). Die Leiste startet mit so einem Spieler nicht, und der
      // Preis-Check spart sich die Kontrollmessung.
      amEaMinimum,
      // EAs eigener Marktschnitt - nur als zweite Meinung, nie als Grundlage
      // einer Rechnung (25.09.2026).
      eaSchnitt,
      schnittWarnung,
      position: str(item.preferredPosition ?? item.position, 12),
      rare: toInt(item.rareflag ?? item.rareFlag) || 0,
      leagueId: toInt(item.leagueId ?? item.leagueid) || 0,
      clubId: toInt(item.teamid ?? item.teamId) || 0,
      nationId: toInt(item.nation ?? item.nationId) || 0,
      cardType: toInt(item.resourceId) > 0 && toInt(item.assetId) > 0 && toInt(item.resourceId) !== toInt(item.assetId) ? "Spezial" : "Standard",
      // Welche Chemie gemessen wurde und ob wirklich danach getrennt werden
      // konnte (25.09.2026). null heisst: EA hat das Feld nicht mitgeschickt.
      chem: chemieZiel,
      chemGefiltert,
      suggestion,
      note,
      alter: alterAuswerten(listings, market, eaMin, eaMax),
      searches
    };
  }

  function savePriceEntry(key, entry) {
    return updateStorage("priceHistory", (current) => {
      const all = current && typeof current === "object" ? current : {};
      const cutoff = Date.now() - CONFIG.HISTORY_DAYS * DAY;
      const list = (Array.isArray(all[key]) ? all[key] : []).filter((e) => e && e.t >= cutoff);
      list.push(entry);
      all[key] = list.slice(-100);
      const keys = Object.keys(all).filter((k) => Array.isArray(all[k]) && all[k].length);
      if (keys.length > 60) {
        const lastT = (k) => all[k][all[k].length - 1].t;
        keys.sort((a, b) => lastT(b) - lastT(a));
        for (const k of keys.slice(60)) delete all[k];
      }
      return all;
    });
  }

  function endCheck(token, text, isError) {
    const check = STATE.check;
    if (check.token !== token) return;
    check.running = false;
    check.error = isError ? text : null;
    check.message = isError ? "" : text;
  }

  async function runPriceCheck(player, token) {
    const check = STATE.check;
    const alive = () => check.running && check.token === token && extensionAlive();
    const seen = new Map(); // tradeId -> Angebot

    // Das Rating MUSS mit (23.09.2026). Ohne es sucht EA ueber alle Versionen
    // eines Spielers und liefert trotzdem nur 21 Treffer. Bei einer Sonderkarte
    // mit vielen billigen Normalversionen belegen die falschen Versionen alle
    // 21 Plaetze - isMatch wirft sie danach weg, und der Check haelt den teuren
    // Rest fuer den Marktpreis. Live am 23.09. nachgemessen: die Anfrage ging
    // ohne ovr-Parameter raus.
    async function pageSearch(maxPrice, start) {
      if (check.searches > 0) {
        // FST-Modus: je Schritt ca. 3,2-3,6 s wie FST (scripts.js Z. 27117-27160),
        // also 2900-3400 ms Abstand plus Antwortzeit. Die Antwort wird weiter
        // abgewartet - es laeuft nie etwas parallel.
        const abstand = STATE.fstModus === true
          ? randomBetween(CONFIG.FST.CHECK_INTERVAL_MIN_MS, CONFIG.FST.CHECK_INTERVAL_MAX_MS)
          : CONFIG.SEARCH_INTERVAL_MS;
        const until = Date.now() + Math.max(abstand, STATE.pauseUntil - Date.now());
        while (alive() && Date.now() < until) await sleep(Math.min(250, until - Date.now()));
      }
      if (!alive()) throw new Error("abgebrochen.");
      check.searches += 1;
      const res = await api(searchPath(player.playerId, maxPrice, start, false, player.rating, 0, player.rarity));
      if (!res.ok) throw new Error("Suche: HTTP " + res.status);
      const data = await res.json();
      STATE.rateLimitHits = 0;
      const liste = data && Array.isArray(data.auctionInfo) ? data.auctionInfo.filter(Boolean) : [];
      gedaechtnisMerken(liste);
      return liste;
    }

    // Blaettert bis zu 3 Seiten weiter, wenn eine volle Seite nur andere
    // Versionen enthaelt (z. B. billigere Normalversion bei einer Sonderkarte).
    async function matches(maxPrice, collectMore, destination, searchLimit) {
      const store = destination || seen;
      const limit = searchLimit || CONFIG.CHECK_MAX_SEARCHES;
      const allHits = [];
      for (let page = 0; page < 3 && check.searches < limit; page++) {
        const auctions = await pageSearch(maxPrice, page * (CONFIG.PAGE_SIZE - 1));
        const hits = auctions.filter((a) => isMatch(a, player.playerId, player.rating, player.rarity));
        for (const a of hits) store.set(String(a.tradeId), a);
        allHits.push(...hits);
        if (auctions.length < volleSeite() || (hits.length && !collectMore) || store.size >= CONFIG.CHECK_MAX_LISTINGS) break;
      }
      return allHits;
    }

    try {
      let hits = await matches(0, false, seen, CONFIG.CHECK_PRIMARY_SEARCHES);
      if (!hits.length) return endCheck(token, "Keine passenden Angebote gefunden.", false);
      let lowest = Math.min(...hits.map(bin));

      // Abwaerts tasten, bis nichts Guenstigeres mehr kommt.
      while (check.searches < CONFIG.CHECK_PRIMARY_SEARCHES - 1) {
        const below = roundDownToStep(lowest - 1);
        if (!(below > 0)) break;
        hits = await matches(below, false, seen, CONFIG.CHECK_PRIMARY_SEARCHES);
        if (!hits.length) break;
        lowest = Math.min(lowest, ...hits.map(bin));
      }

      // Tiefe: wie viele Angebote liegen knapp ueber dem guenstigsten?
      const bandMax = Math.max(roundDownToStep(Math.floor(lowest * (1 + CONFIG.CHECK_BAND))), lowest + stepFor(lowest));
      const marketSnapshot = new Map();
      // Zeitpunkt der ersten Messung - ohne Tiefen-Suche ist es das Tasten.
      let ersteMessungAt = Date.now();
      if (check.searches < CONFIG.CHECK_PRIMARY_SEARCHES) {
        await matches(bandMax, true, marketSnapshot, CONFIG.CHECK_PRIMARY_SEARCHES);
        ersteMessungAt = Date.now();
        for (const [id, auction] of marketSnapshot) seen.set(id, auction);
      }

      let entry = buildPriceEntry(Array.from(seen.values()), lowest, bandMax, check.searches);

      // Eine getrennte zweite Marktaufnahme bestaetigt den Preis und zeigt,
      // wie viele guenstige Angebote in der Zwischenzeit verschwinden oder neu
      // erscheinen. Als Marktaktivitaet zaehlt das nur bei genug Abstand
      // zwischen beiden Messungen (CONFIG.ACTIVITY_MIN_GAP_MS), sonst "unbekannt".
      // Klebt der Preis an EAs Mindestpreis, ist die Kontrollmessung
      // verschenkt (27.09.2026): Gewinn ist dort unmoeglich, egal wie genau
      // wir messen. FST bricht an dieser Stelle sogar den ganzen Preis-Check
      // ab. Wir behalten die erste Messung - sie ist die Begruendung, die der
      // Nutzer sehen soll - und sparen nur die drei zusaetzlichen Suchen.
      if (!entry.amEaMinimum && check.searches < CONFIG.CHECK_MAX_SEARCHES) {
        const verifySeen = new Map();
        const verifyMax = Math.max(bandMax, roundDownToStep(Math.floor(entry.market * 1.1)));
        const firstSnapshot = marketSnapshot.size ? Array.from(marketSnapshot.values()) : Array.from(seen.values());
        const comparableFirst = firstSnapshot.filter((a) => bin(a) <= verifyMax);
        await matches(verifyMax, true, verifySeen);
        const messAbstandMs = Date.now() - ersteMessungAt;
        if (verifySeen.size) {
          const secondLowest = Math.min(...Array.from(verifySeen.values()).map(bin));
          const second = buildPriceEntry(Array.from(verifySeen.values()), secondLowest, verifyMax, check.searches);
          const difference = Math.abs(second.market / entry.market - 1);
          const combined = new Map(seen);
          for (const [id, auction] of verifySeen) combined.set(id, auction);
          entry = buildPriceEntry(Array.from(combined.values()), Math.min(lowest, secondLowest), verifyMax, check.searches);
          entry.rounds = 2;
          entry.verified = difference <= 0.05;
          entry.verificationDiff = difference;
          if (!entry.verified) entry.confidence = "niedrig";
          const secondIds = new Set(verifySeen.keys());
          const firstIds = new Set(comparableFirst.map((a) => String(a.tradeId)));
          const disappeared = comparableFirst.filter((a) => !secondIds.has(String(a.tradeId))).length;
          const appeared = Array.from(verifySeen.keys()).filter((id) => !firstIds.has(id)).length;
          const turnoverRate = comparableFirst.length ? disappeared / comparableFirst.length : 0;
          entry.activity = messAbstandMs >= CONFIG.ACTIVITY_MIN_GAP_MS
            ? (turnoverRate >= 0.25 ? "hoch" : turnoverRate >= 0.1 ? "normal" : "ruhig")
            : "unbekannt";
          entry.messAbstandMs = messAbstandMs;
          entry.turnoverRate = turnoverRate;
          entry.disappeared = disappeared;
          entry.appeared = appeared;
        }
      }
      if (!entry.rounds) {
        entry.rounds = 1;
        entry.verified = entry.confidence === "hoch";
        entry.verificationDiff = 0;
        entry.activity = "unbekannt";
        entry.turnoverRate = 0;
      }
      if (!alive()) return;
      await savePriceEntry(priceKey(player.playerId, player.rating, player.rarity), entry);
      log("Preis-Check " + playerLabel(player) + ":", entry);
      endCheck(token, "", false);
    } catch (e) {
      const text = e instanceof HardStop ? e.message : "Preis-Check fehlgeschlagen: " + e.message;
      warn(text);
      endCheck(token, text, true);
    }
  }

  function startPriceCheck(raw) {
    // Dieselbe Sperre wie beim Bot-Start: Auch ein Preis-Check fragt EA.
    const gesperrt = cooldownBlock();
    if (gesperrt) return { ok: false, error: gesperrt };
    const fremd = andererTabAktiv();
    if (fremd) return { ok: false, error: fremd };
    if (STATE.running) return { ok: false, error: "Erst den Bot stoppen, dann den Preis prüfen." };
    if (STATE.marketScan.running) return { ok: false, error: "Der EA-Live-Scan läuft noch." };
    if (STATE.check.running) return { ok: false, error: "Preis-Check läuft schon." };
    if (!SESSION.sid) return { ok: false, error: "Noch nicht mit der Web App verbunden. Öffne dort einmal den Transfermarkt." };
    const suchseite = suchseiteProblem();
    if (suchseite) return { ok: false, error: suchseite };
    const parsed = parsePlayer(raw);
    if (parsed.error) return { ok: false, error: parsed.error };

    const check = STATE.check;
    check.token += 1;
    Object.assign(check, { running: true, searches: 0, error: null, message: "" });
    const token = check.token;
    runPriceCheck(parsed.player, token).catch((e) => endCheck(token, "Preis-Check fehlgeschlagen: " + e.message, true));
    besitzAntreten();
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Live-Markt-Scanner: kleine Stichprobe des offenen EA-Transfermarkts
  // ---------------------------------------------------------------------------

  // Ablauf: EINE Marktaufnahme (bis zu 3 Seiten), daraus die haeufigsten
  // Spieler, fuer jeden eine Zielsuche und danach Abwaertstasten wie im
  // Preis-Check. Das Tasten ist noetig, weil EA nach Restlaufzeit sortiert und
  // nicht nach Preis: Die ersten 21 Treffer sind oft Ladenhueter, das
  // billigste Angebot steht weiter hinten. Live gesehen am 22.09.2026: Scan
  // 850 Coins, Preis-Check zwei Minuten spaeter 650 - ein Phantom-Gewinn.
  // Alles zusammen bleibt unter CONFIG.MARKET_SCAN_MAX_REQUESTS Anfragen.
  async function runMarketScan(maxPrice, token, filter) {
    const scan = STATE.marketScan;
    const alive = () => scan.running && scan.token === token && extensionAlive();
    const obergrenze = CONFIG.MARKET_SCAN_MAX_REQUESTS;
    const frei = () => scan.searches < obergrenze;
    // Dieselbe Anfrage stellt der Scan nur einmal. Das kommt vor, wenn ein
    // Spieler mit zwei Ratings unter den Kandidaten steht: Die Zielsuche
    // fragt ohne Rating, der Pfad ist gleich - und die Antwort Sekunden
    // spaeter auch. Die zweite Anfrage kostete nur eine Suche aus dem Limit.
    const antworten = new Map(); // Pfad -> Angebote
    const bekannt = (path) => antworten.has(path);

    async function request(path) {
      if (bekannt(path)) return antworten.get(path);
      // Letzte Schranke. Die Aufrufer pruefen frei() schon vorher; faellt das
      // einmal weg, bricht der Scan lieber ab, als eine Anfrage zu viel zu stellen.
      if (!frei()) throw new Error("Anfragen-Obergrenze erreicht.");
      if (scan.searches > 0) {
        const until = Date.now() + Math.max(scanDelay(), STATE.pauseUntil - Date.now());
        while (alive() && Date.now() < until) await sleep(Math.min(250, until - Date.now()));
      }
      if (!alive()) throw new Error("abgebrochen.");
      scan.searches += 1;
      scan.message = "EA-Markt wird geprüft: Anfrage " + scan.searches + " von höchstens " + obergrenze + ".";
      const res = await api(path);
      if (!res.ok) throw new Error("Marktsuche: HTTP " + res.status);
      const data = await res.json();
      STATE.rateLimitHits = 0;
      const liste = data && Array.isArray(data.auctionInfo) ? data.auctionInfo.filter(Boolean) : [];
      gedaechtnisMerken(liste);
      antworten.set(path, liste);
      return liste;
    }

    // Zielsuche und Abwaertstasten fuer einen Kandidaten. Die passenden
    // Angebote landen in candidate.auctions. Ergebnis: true, wenn belegt ist,
    // dass das billigste Angebot noch steht und es darunter nichts Passendes gibt.
    async function kandidatPruefen(candidate) {
      const passt = (a) => isMatch(a, candidate.playerId, candidate.rating, candidate.rarity);
      // tradeIds aus einer eigenen Suche dieses Kandidaten. Was nur in der
      // Marktaufnahme stand, kann laengst verkauft sein.
      const frisch = new Set();
      // maxb: der Hoechstpreis der Suche, aus der "auctions" stammt.
      const aufnehmen = (auctions, maxb) => {
        const treffer = auctions.filter(passt);
        const ids = new Set(treffer.map((a) => String(a.tradeId)));
        for (const a of treffer) {
          candidate.auctions.set(String(a.tradeId), a);
          frisch.add(String(a.tradeId));
        }
        // Keine volle Seite: EA hat alles bis maxb geliefert. Was wir bis maxb
        // gesammelt haben und hier fehlt, ist verkauft oder abgelaufen - sonst
        // blieb ein weggekauftes Angebot aus der Marktaufnahme das billigste.
        // Bei voller Seite belegt das Fehlen nichts: Es kann dahinter stehen.
        if (auctions.length < volleSeite()) {
          for (const [id, a] of candidate.auctions) {
            if (bin(a) <= maxb && !ids.has(id)) candidate.auctions.delete(id);
          }
        }
        return treffer;
      };
      const ziel = await request(searchPath(candidate.playerId, maxPrice, 0, false, candidate.rating, 0, candidate.rarity));
      aufnehmen(ziel, maxPrice);
      // Keine volle Seite: EA hat ALLE Angebote bis zum Hoechstpreis
      // geliefert, das billigste steht sicher dabei. Tasten waere verschenkt.
      if (ziel.length < volleSeite()) return true;

      for (let schritt = 0; schritt < CONFIG.MARKET_SCAN_PROBE_STEPS; schritt++) {
        const listings = Array.from(candidate.auctions.values()).filter(passt);
        if (!listings.length) return false;
        const lowest = Math.min(...listings.map(bin));
        // Steht das billigste nur in der Marktaufnahme (die volle Zielsuche
        // zeigte es nicht), fragt der Schritt bis EINSCHLIESSLICH lowest: Ist
        // es weg, raeumt aufnehmen() es aus. Frueher tastete er nur darunter,
        // fand nichts und meldete ein weggekauftes Angebot als geprueft
        // (Gegenpruefung 22.09.: 600 statt 800 - Wertung 100, Sofort-Start frei).
        const belegt = listings.some((a) => bin(a) === lowest && frisch.has(String(a.tradeId)));
        let maxb = lowest;
        if (belegt) {
          // Unter das EA-Minimum der Karte und unter den kleinsten gueltigen
          // Preis kann niemand einstellen - dort nachzusehen kostet nur eine Suche.
          const item = (listings.find((a) => bin(a) === lowest) || {}).itemData || {};
          const untergrenze = Math.max(CONFIG.MIN_PRICE, plausiblePrice(item.marketDataMinPrice));
          maxb = roundDownToStep(lowest - 1);
          if (maxb < untergrenze) return true;
        }
        const pfad = searchPath(candidate.playerId, maxb, 0, false, candidate.rating, 0, candidate.rarity);
        if (!alive() || (!frei() && !bekannt(pfad))) return false;
        const tiefer = await request(pfad);
        const treffer = aufnehmen(tiefer, maxb);
        // Keine volle Seite: alles bis maxb ist gesehen. Steht dort etwas,
        // ist es frisch und das billigste. Bei "belegt" ist auch "leer" ein
        // Beleg. Sonst war das alte billigste weggekauft - der naechste
        // Schritt prueft das naechste. Liegt es nur eine Stufe hoeher, ist
        // seine Suche dieselbe und kommt aus "antworten". Eine volle Seite nur
        // mit anderen Versionen belegt nichts: Das billigste koennte dahinter stehen.
        if (tiefer.length < volleSeite()) {
          if (belegt || treffer.length) return true;
          continue;
        }
        if (!treffer.length) return false;
      }
      return false; // Tast-Schritte aufgebraucht, es koennte noch billiger gehen
    }

    const minPrice = scanMinPrice(maxPrice);
    if (minPrice > 0) log("Markt-Scan mit Mindestpreis " + minPrice + " Coins.");

    try {
      // Nur noch EINE Marktaufnahme. Frueher waren es zwei identische kurz
      // nacheinander, fuer eine "Aktivitaet" aus verschwundenen Angeboten -
      // nach wenigen Sekunden war fast nie etwas verschwunden, also stand bei
      // allen "ruhig". Die Anfragen gehen jetzt ins Abwaertstasten.
      scan.phase = "aufnahme";
      const aufnahme = new Map();
      for (let page = 0; page < CONFIG.MARKET_SCAN_PAGES && alive() && frei(); page++) {
        const auctions = await request(openMarketPath(maxPrice, page * (CONFIG.PAGE_SIZE - 1), minPrice, filter));
        for (const auction of auctions) {
          if (auction && auction.tradeId != null && bin(auction) > 0 && auction.itemData) {
            aufnahme.set(String(auction.tradeId), auction);
          }
        }
        if (auctions.length < volleSeite()) break;
      }

      const candidateStats = new Map();
      for (const auction of aufnahme.values()) {
        const id = basePlayerId(auction.itemData);
        if (!(id > 0)) continue;
        const rating = toInt(auction.itemData.rating) || 0;
        // Kartenart mitnehmen (24.09.2026): Sonst kann der Scan eine TOTW-
        // Karte nicht von einer Flashback-Karte mit demselben Rating
        // unterscheiden - zwei ganz verschiedene Maerkte in einem Topf.
        const art = Number.isFinite(toInt(auction.itemData.rareflag)) ? toInt(auction.itemData.rareflag) : -1;
        const key = priceKey(id, rating, art);
        const current = candidateStats.get(key) || { key, playerId: id, rating, rarity: art, seen: 0, auctions: new Map() };
        current.seen += 1;
        current.auctions.set(String(auction.tradeId), auction);
        candidateStats.set(key, current);
      }

      // Die haeufigsten zuerst, und jeder wird fertig geprueft, bevor der
      // naechste drankommt. Reicht die Obergrenze nicht, fehlt lieber ein
      // Kandidat ganz, als dass alle nur halb geprueft sind.
      const candidates = Array.from(candidateStats.values())
        .sort((a, b) => b.seen - a.seen)
        .slice(0, CONFIG.MARKET_SCAN_CANDIDATES);
      const results = [];
      scan.phase = "preise";

      for (const candidate of candidates) {
        if (!alive()) break;
        // Ohne eigene Zielsuche kein Eintrag: Die Marktaufnahme allein zeigt
        // nur, was zufaellig vorne stand. Eine schon geladene Zielsuche
        // (gleicher Spieler, anderes Rating) kostet nichts und gilt auch hier.
        if (!frei() && !bekannt(searchPath(candidate.playerId, maxPrice, 0, false, candidate.rating, 0, candidate.rarity))) continue;
        const preisGeprueft = await kandidatPruefen(candidate);
        const listings = Array.from(candidate.auctions.values()).filter((a) => isMatch(a, candidate.playerId, candidate.rating, candidate.rarity));
        if (listings.length < 2) continue;
        const lowest = Math.min(...listings.map(bin));
        const bandMax = Math.max(roundDownToStep(Math.floor(lowest * (1 + CONFIG.CHECK_BAND))), lowest + stepFor(lowest));
        const entry = buildPriceEntry(listings, lowest, bandMax, scan.searches);
        entry.key = candidate.key;
        entry.playerId = candidate.playerId;
        entry.rating = candidate.rating;
        // Die Kartenart gehoert zur Karte, nicht nur zum Schluessel
        // (24.09.2026). Ohne sie geht sie auf dem Weg Filter -> Ziel ->
        // Bot verloren, und der Bot kauft jede Version dieses Spielers.
        entry.rarity = Number.isFinite(candidate.rarity) ? candidate.rarity : -1;
        // Der Scan misst keine Aktivitaet - dafuer reichen Sekunden nicht.
        entry.activity = "unbekannt";
        entry.disappeared = 0;
        entry.preisGeprueft = preisGeprueft;
        entry.marktAngebote = candidate.seen; // so oft stand er in der Marktaufnahme
        entry.source = "ea-live-market";
        results.push(entry);
      }

      // Alles andere aus der Marktaufnahme kommt auch in die Liste - nur
      // eben ungeprueft. Bisher war es weg: Von rund 40 gesehenen Karten
      // blieben 6 uebrig, weil nur die geprueften zaehlten. FSTs Liste hat
      // 15 und mehr; die Zahlen dort sind auch nicht selbst gemessen.
      // Diese Eintraege kosten KEINE einzige zusaetzliche Anfrage.
      const geprueft = new Set(results.map((e) => e.key));
      for (const candidate of candidateStats.values()) {
        if (results.length >= CONFIG.MARKET_SCAN_LISTE_MAX) break;
        if (geprueft.has(candidate.key)) continue;
        const listings = Array.from(candidate.auctions.values()).filter((a) => isMatch(a, candidate.playerId, candidate.rating, candidate.rarity));
        if (!listings.length) continue;
        const lowest = Math.min(...listings.map(bin));
        const bandMax = Math.max(roundDownToStep(Math.floor(lowest * (1 + CONFIG.CHECK_BAND))), lowest + stepFor(lowest));
        const entry = buildPriceEntry(listings, lowest, bandMax, 0);
        entry.key = candidate.key;
        entry.playerId = candidate.playerId;
        entry.rating = candidate.rating;
        entry.rarity = Number.isFinite(candidate.rarity) ? candidate.rarity : -1;
        entry.activity = "unbekannt";
        entry.disappeared = 0;
        // Nur gesehen, nicht nachgeprueft: Der Bot darf damit nie sofort
        // starten. Die Sicherheit steht deshalb auf "niedrig".
        entry.preisGeprueft = false;
        entry.confidence = "niedrig";
        entry.marktAngebote = candidate.seen;
        entry.nurAufnahme = true;
        entry.source = "ea-live-market";
        results.push(entry);
      }

      // Abgebrochen (z. B. Extension neu geladen): nichts Halbes speichern.
      if (!alive()) return;
      results.sort((a, b) => Number(b.preisGeprueft) - Number(a.preisGeprueft) ||
        Number(Boolean(a.nurAufnahme)) - Number(Boolean(b.nurAufnahme)) ||
        b.marktAngebote - a.marktAngebote || b.sampleSize - a.sampleSize);
      await chrome.storage.local.set({ liveMarketResults: { at: Date.now(), maxPrice, list: results } });
      scan.running = false;
      const ungeprueft = results.filter((e) => !e.preisGeprueft).length;
      scan.message = results.length
        ? results.length + " Live Filter aus dem EA-Markt gefunden." +
          (ungeprueft ? " Bei " + ungeprueft + " ist der billigste Preis nicht sicher geprüft." : "")
        : "Keine ausreichend sicheren Live Filter gefunden. Später erneut versuchen.";
    } catch (e) {
      scan.running = false;
      scan.error = e instanceof HardStop ? e.message : "Live-Scan fehlgeschlagen: " + e.message;
      // Nur im FST-Modus gesetzt (apiAntwortPruefen): der EA-Statuscode des Fehlers.
      scan.code = e instanceof HardStop && Number(e.code) > 0 ? Number(e.code) : 0;
      scan.message = "";
    }
  }

  function startMarketScan(raw) {
    // Dieselbe Sperre wie beim Bot-Start: Auch der Markt-Scan fragt EA.
    const gesperrt = cooldownBlock();
    if (gesperrt) return { ok: false, error: gesperrt };
    const fremd = andererTabAktiv();
    if (fremd) return { ok: false, error: fremd };
    if (STATE.running) return { ok: false, error: "Erst den Bot stoppen, dann den Markt scannen." };
    if (STATE.check.running || STATE.marketScan.running) return { ok: false, error: "Es läuft bereits eine Prüfung." };
    if (!SESSION.sid) return { ok: false, error: "Noch nicht mit der Web App verbunden. Öffne zuerst den Transfermarkt." };
    const suchseiteFehlt = suchseiteProblem();
    if (suchseiteFehlt) return { ok: false, error: suchseiteFehlt };
    const maxPrice = Math.min(1000000, Math.max(1000, roundDownToStep(toInt(raw && raw.maxPrice) || 50000)));
    // Den gewaehlten Hoechstpreis merken: Die automatische Erneuerung scannt
    // dann dieselbe Preisklasse statt fest bis 50.000.
    if (STATE.scanMaxPrice !== maxPrice) {
      STATE.scanMaxPrice = maxPrice;
      Promise.resolve(chrome.storage.local.set({ scanMaxPrice: maxPrice })).catch(() => {});
    }
    // Die Filter des Scans (Kartenart, Qualitaet, Position, Nation, Liga,
    // Chemie). Sie kommen aus der Leiste, die sie aus EAs eigenen
    // Auswahllisten anbietet.
    STATE.scanFilter = scanFilterLesen(raw && raw.filter);
    const scan = STATE.marketScan;
    scan.token += 1;
    Object.assign(scan, { running: true, searches: 0, maxSearches: CONFIG.MARKET_SCAN_MAX_REQUESTS, phase: "aufnahme", error: null, code: 0, message: "EA-Live-Scan wird gestartet …" });
    runMarketScan(maxPrice, scan.token, STATE.scanFilter).catch((e) => {
      scan.running = false;
      scan.error = "Live-Scan fehlgeschlagen: " + e.message;
    });
    besitzAntreten();
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Verkaufs-Helfer (22.09.2026).
  // Am 22.09. lagen 45 handelbare Spieler auf der Transferliste, keiner davon
  // im Verkauf. Der Bot konnte nur kaufen - verdient wird aber erst beim
  // Verkauf, und der echte Gewinn war nirgends zu sehen.
  //
  // Alles geht ueber die Web App selbst (sniffer.js, services.Item): EA sieht
  // dieselben Anfragen wie bei einem Klick in der App. Lesen aus ihrem
  // Speicher kostet keine Anfrage. Nie automatisch - jede Aktion kommt von
  // einem Klick im Menue. Waehrend eines Laufs, einer Sperre oder wenn ein
  // anderer Tab arbeitet, wird nichts eingestellt.
  // ---------------------------------------------------------------------------
  const VERKAUF = { laeuft: false, art: "", meldung: "", fehler: "", stand: 0, letzteAktion: 0, nextId: 1, warten: new Map(), neuVerkauft: [], warteKette: Promise.resolve() };
  const VERKAUF_DAUER_S = 3600; // eine Stunde, wie beim Weiterverkauf ueblich
  // Verkaufs-Wache (F3): was der Bot waehrend des Laufs ueber die
  // Transferliste weiss. seitStart zaehlt nur Verkaeufe DIESES Laufs.
  const VERKAUFS_WACHE = {
    freiAt: 0, frischAt: 0, frischImLauf: 0, abgeraeumt: 0,
    // Wie viele verkaufte Karten beim letzten Blick in der Liste lagen.
    // platzProblem liest das: Solange da etwas zum Abraeumen ist und der
    // Haken gesetzt ist, wird der Lauf wegen einer vollen Liste nicht
    // gestoppt - die Wache macht gleich Platz.
    verkaufteDa: 0,
    offen: 0, anzahl: -1, halt: null, stummBis: 0,
    seitStart: { anzahl: 0, erloes: 0, gewinn: 0, mitKauf: 0 }
  };

  function seitenFrage(typ, extra, fristMs) {
    const requestId = VERKAUF.nextId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        VERKAUF.warten.delete(requestId);
        resolve(null);
      }, fristMs);
      VERKAUF.warten.set(requestId, (antwort) => {
        clearTimeout(timer);
        VERKAUF.warten.delete(requestId);
        resolve(antwort);
      });
      window.postMessage(Object.assign({ __ownbot: typ, requestId }, extra), window.location.origin);
    });
  }

  function seitenAntwort(raw) {
    const fertig = VERKAUF.warten.get(toInt(raw && raw.requestId));
    if (fertig) fertig(raw);
  }

  // Kommt aus der Seite - also hart pruefen, wie bei der Beobachtungsliste.
  function transferlisteSaeubern(items) {
    const zahl = (v, max) => {
      const n = toInt(v);
      return Number.isFinite(n) && n >= 0 && n <= max ? n : 0;
    };
    const id = (v) => (/^\d{1,20}$/.test(str(v, 32)) ? str(v, 32) : "");
    const out = [];
    for (const e of Array.isArray(items) ? items.slice(0, 120) : []) {
      if (!e || typeof e !== "object" || !id(e.itemId)) continue;
      out.push({
        itemId: id(e.itemId),
        assetId: zahl(e.assetId, 1e9),
        definitionId: zahl(e.definitionId, 1e10),
        rating: zahl(e.rating, 99),
        name: str(e.name, 60),
        typ: str(e.typ, 16).toLowerCase(),
        handelbar: e.handelbar === true,
        gekauftFuer: zahl(e.gekauftFuer, 1e8),
        schnellverkauf: zahl(e.schnellverkauf, 1e7),
        tradeId: id(e.tradeId),
        tradeState: str(e.tradeState, 32).toLowerCase(),
        sofortPreis: zahl(e.sofortPreis, 2e7),
        startPreis: zahl(e.startPreis, 2e7),
        gebot: zahl(e.gebot, 2e7),
        restSek: zahl(e.restSek, 1e7),
        eaMin: zahl(e.eaMin, 2e7),
        eaMax: zahl(e.eaMax, 2e7),
        // Chemie der Karte (28.09.2026). zahl() taugt hier nicht: Sie macht
        // aus "fehlt" eine 0, und 0 ist bei EA ein echter Wert ("keine
        // Chemie"). Also selbst pruefen und "fehlt" als null behalten.
        playStyle: typeof e.playStyle === "number" && Number.isFinite(e.playStyle) && e.playStyle >= 0 && e.playStyle <= 1e6 ? Math.floor(e.playStyle) : null
      });
    }
    return out;
  }

  // Verkaufte Spieler merken, BEVOR sie abgeraeumt werden: Danach weiss
  // niemand mehr, fuer wie viel sie weggingen. gekauftFuer ist EAs eigener
  // letzter Kaufpreis - fuer Bot-Kaeufe genau das, was der Bot bezahlt hat.
  // Gibt die NEU gemerkten Verkaeufe zurueck - daraus rechnet die
  // Verkaufs-Wache den Gewinn seit dem Start.
  function verkaeufeMerken(liste) {
    const neu = liste.filter((i) => i.tradeState === "closed" && i.gebot > 0 && i.tradeId);
    if (!neu.length) return Promise.resolve([]);
    let gemerkt = [];
    return updateStorage("verkaeufe", (current) => {
      const alt = Array.isArray(current) ? current : [];
      const bekannt = new Set(alt.map((v) => v && v.tradeId));
      const dazu = neu.filter((i) => !bekannt.has(i.tradeId)).map((i) => ({
        t: Date.now(), tradeId: i.tradeId, itemId: i.itemId, playerId: i.assetId, rating: i.rating,
        name: i.name, preis: i.gebot, gekauftFuer: i.gekauftFuer
      }));
      gemerkt = dazu;
      return alt.concat(dazu).slice(-LOG_MAX);
    }).then(() => gemerkt);
  }

  function verkaufSperre() {
    if (VERKAUF.laeuft) return "Eine Verkaufs-Aktion läuft noch.";
    const gesperrt = cooldownBlock();
    if (gesperrt) return gesperrt;
    const fremd = andererTabAktiv();
    if (fremd) return fremd;
    if (STATE.running) return "Erst den Bot stoppen. Während eines Laufs wird nichts eingestellt.";
    if (STATE.check.running || STATE.marketScan.running) return "Es läuft gerade eine Prüfung. Gleich nochmal.";
    return "";
  }

  // Sperr-Antworten beim Verkaufen zaehlen genauso wie beim Kaufen.
  function verkaufStatusPruefen(status) {
    const code = toInt(status);
    sperreFuerCode(code);
  }

  // Wie ein Mensch: zwischen zwei Aktionen ein paar Sekunden.
  async function verkaufAbstand() {
    // FST-Modus: 1100-1800 ms vor dem Abraeumen (scripts.js Z. 58527-58531).
    const warten = VERKAUF.letzteAktion + (STATE.fstModus === true
      ? randomBetween(CONFIG.FST.VERKAUF_ABSTAND_MIN_MS, CONFIG.FST.VERKAUF_ABSTAND_MAX_MS)
      : randomBetween(2500, 4500)) - Date.now();
    if (warten > 0) await sleep(warten);
  }

  function verkaufStarten(art, aufgabe) {
    verkaufLauf(art, aufgabe);
    return { ok: true };
  }

  // Derselbe Ablauf, aber mit Promise - die Verkaufs-Wache wartet darauf.
  function verkaufLauf(art, aufgabe) {
    VERKAUF.laeuft = true;
    VERKAUF.art = art;
    VERKAUF.fehler = "";
    VERKAUF.meldung = "";
    besitzAntreten();
    VERKAUF.warteKette = aufgabe()
      .then((text) => { VERKAUF.meldung = text || ""; })
      .catch((e) => { VERKAUF.fehler = e && e.message ? e.message : String(e); })
      .finally(() => {
        VERKAUF.laeuft = false;
        VERKAUF.art = "";
        VERKAUF.stand += 1;
      });
    return VERKAUF.warteKette;
  }

  async function transferlisteHolen(frisch, fristMs) {
    const frist = toInt(fristMs) > 0 ? toInt(fristMs) : frisch ? CONFIG.REQUEST_TIMEOUT_MS : 5000;
    const antwort = await seitenFrage("tradepile?", { frisch: Boolean(frisch) }, frist);
    if (!antwort) throw new Error("Die Web App hat nicht geantwortet. Seite einmal neu laden.");
    if (antwort.error) {
      const code = toInt(String(antwort.error).replace(/\D+/g, ""));
      verkaufStatusPruefen(code);
      const fehler = new Error("Transferliste nicht lesbar: " + str(antwort.error, 80));
      fehler.status = code;
      throw fehler;
    }
    const liste = transferlisteSaeubern(antwort.items);
    await chrome.storage.local.set({ transferliste: { at: Date.now(), liste } });
    VERKAUF.neuVerkauft = await verkaeufeMerken(liste);
    return liste;
  }

  function transferlisteLesen(raw) {
    const frisch = Boolean(raw && raw.frisch);
    // Aus dem Speicher der App lesen fragt EA nicht - das geht immer, auch
    // waehrend eines Laufs. Nur "frisch" ist eine echte Anfrage.
    // Sieht gerade die Verkaufs-Wache nach (F3), liest sie ohnehin dasselbe.
    // Dann ist der Klick schon erledigt, statt einen Fehler zu zeigen.
    if (!frisch && VERKAUF.laeuft && VERKAUF.art === "pruefen") return { ok: true };
    const sperre = frisch ? verkaufSperre() : VERKAUF.laeuft ? "Eine Verkaufs-Aktion läuft noch." : "";
    if (sperre) return { ok: false, error: sperre };
    if (frisch && !SESSION.sid) return { ok: false, error: "Noch nicht mit der Web App verbunden." };
    return verkaufStarten(frisch ? "aktualisieren" : "lesen", async () => {
      // Neu von EA laden ist eine echte Anfrage - sie wird gezaehlt wie jede
      // andere Aktion. Bis 22.09.2026 lief dieser Knopf ungezaehlt.
      if (frisch) await reserveUsage("aktion");
      if (frisch) await verkaufAbstand();
      const liste = await transferlisteHolen(frisch);
      if (frisch) VERKAUF.letzteAktion = Date.now();
      return frisch ? "Transferliste neu geladen: " + liste.length + " Einträge." : "";
    });
  }

  async function verkaufAusfuehren(art, daten) {
    // Einstellen, neu einstellen und Abraeumen sind echte EA-Anfragen.
    // Sie zaehlen auf dasselbe Tageslimit wie das Verschieben nach dem Kauf.
    await reserveUsage("aktion");
    await verkaufAbstand();
    // FSTs Abraeum-Weg meldet nichts zurueck (27.09.2026). Wenn die Seite das
    // sagt, steht es im Protokoll - damit niemand den Erfolg fuer gemessen
    // haelt. Entschieden wird es von der Nachpruefung danach.
    const nachTraglich = (antwort) => {
      if (antwort && antwort.blind) log("Abgeräumt über FSTs Weg – EA meldet dazu nichts zurück. Es wird gleich nachgeprüft.");
    };
    // Nach der Pause nochmal: In der Zwischenzeit kann eine Sperre gekommen sein.
    const gesperrt = cooldownBlock() || andererTabAktiv();
    if (gesperrt) throw new Error(gesperrt);
    const antwort = await seitenFrage("verkauf?", { art, daten: daten || {} }, CONFIG.REQUEST_TIMEOUT_MS);
    VERKAUF.letzteAktion = Date.now();
    if (!antwort) throw new Error("Keine Antwort von EA. Bitte in der Web App unter Transferliste nachsehen.");
    if (!antwort.ok) {
      verkaufStatusPruefen(antwort.status);
      const fehler = new Error("EA hat abgelehnt: " + str(antwort.grund, 60) + (toInt(antwort.status) > 0 ? " (HTTP " + toInt(antwort.status) + ")" : "") + ".");
      fehler.status = toInt(antwort.status);
      throw fehler;
    }
    nachTraglich(antwort);
  }

  function spielerEinstellen(raw) {
    const sperre = verkaufSperre();
    if (sperre) return { ok: false, error: sperre };
    const itemId = /^\d{1,20}$/.test(str(raw && raw.itemId, 32)) ? str(raw.itemId, 32) : "";
    if (!itemId) return { ok: false, error: "Unbekannter Spieler." };
    let sofort = roundDownToStep(toInt(raw.sofortPreis));
    if (!(sofort >= 200) || sofort > 15000000) return { ok: false, error: "Der Sofortkaufpreis passt nicht." };
    return verkaufStarten("einstellen", async () => {
      const { transferliste } = await chrome.storage.local.get("transferliste");
      const eintrag = transferliste && Array.isArray(transferliste.liste) ? transferliste.liste.find((i) => i.itemId === itemId) : null;
      if (!eintrag) throw new Error("Spieler steht nicht mehr auf der Transferliste. Bitte aktualisieren.");
      if (!eintrag.handelbar) throw new Error("Dieser Spieler ist nicht handelbar.");
      if (eintrag.tradeState === "active") throw new Error("Steht schon im Verkauf.");
      if (eintrag.eaMin && sofort < eintrag.eaMin) throw new Error("EA erlaubt für diese Karte mindestens " + fmt(eintrag.eaMin) + ".");
      if (eintrag.eaMax && sofort > eintrag.eaMax) throw new Error("EA erlaubt für diese Karte höchstens " + fmt(eintrag.eaMax) + ".");
      // Startgebot eine Stufe unter dem Sofortkauf: EA verlangt, dass es
      // darunter liegt, und so kauft eher jemand sofort, als lange zu bieten.
      let start = roundDownToStep(sofort - 1);
      if (eintrag.eaMin && start < eintrag.eaMin) start = eintrag.eaMin;
      if (!(start > 0) || start >= sofort) throw new Error("Für diesen Preis gibt es kein gültiges Startgebot.");
      await verkaufAusfuehren("einstellen", { itemId, startPreis: start, sofortPreis: sofort, dauer: VERKAUF_DAUER_S });
      const name = eintrag.name || "Spieler";
      await updateStorage("transferliste", (current) => {
        if (!current || !Array.isArray(current.liste)) return current;
        return Object.assign({}, current, {
          liste: current.liste.map((i) => (i.itemId === itemId
            ? Object.assign({}, i, { tradeState: "active", sofortPreis: sofort, startPreis: start, restSek: VERKAUF_DAUER_S })
            : i))
        });
      });
      pushEvent("verkauf", name + " steht für " + fmt(sofort) + " im Verkauf.");
      log("Eingestellt: " + name + " für " + fmt(sofort) + " (Start " + fmt(start) + ").");
      return name + " steht jetzt für " + fmt(sofort) + " Coins im Verkauf (1 Stunde).";
    });
  }

  function abgelaufeneNeuEinstellen() {
    const sperre = verkaufSperre();
    if (sperre) return { ok: false, error: sperre };
    return verkaufStarten("neuEinstellen", async () => {
      await verkaufAusfuehren("neuEinstellen");
      const liste = await transferlisteHolen(false);
      return "Abgelaufene sind wieder im Verkauf. " + liste.filter((i) => i.tradeState === "expired").length + " noch als abgelaufen gemeldet.";
    });
  }

  // Die Transferliste frisch bei EA nachlesen. Das ist eine echte Anfrage,
  // darum laeuft sie ueber reserveUsage und zaehlt auf die Schutzgrenzen
  // (27.09.2026).
  async function abraeumenNachlesen() {
    await reserveUsage("aktion");
    await verkaufAbstand();
    const liste = await transferlisteHolen(true);
    VERKAUF.letzteAktion = Date.now();
    return liste;
  }

  function verkaufteAbraeumen() {
    const sperre = verkaufSperre();
    if (sperre) return { ok: false, error: sperre };
    return verkaufStarten("abraeumen", async () => {
      // Erst frisch bei EA nachsehen (27.09.2026).
      //
      // Vorher las dieser Knopf nur den Speicher der Web App. Der ist
      // veraltet, sobald die Transferliste in der App nicht offen war: Der
      // Knopf sagte dann "Es gibt nichts abzuraeumen", obwohl Karten verkauft
      // waren. FUT Simple Trader fragt vor jedem Abraeumen echt bei EA nach
      // (scripts.js Z. 59158-59214). Genauso machen wir es jetzt.
      const vorher = await abraeumenNachlesen();
      const verkauft = vorher.filter((i) => i.tradeState === "closed");
      if (!verkauft.length) return "Es gibt nichts abzuräumen – frisch bei EA nachgesehen.";
      await verkaufAusfuehren("abraeumen");
      // Nachpruefen statt glauben (27.09.2026). Ob unser Weg
      // (transfersDao.removeSold) die Karten wirklich bei EA loescht oder sie
      // nur aus der Anzeige nimmt, war nie gemessen. Ein falsches "erledigt"
      // ist teurer als diese Anfrage: EA lehnt dann jeden weiteren Kauf ab.
      let nachher = await abraeumenNachlesen();
      if (nachher.filter((i) => i.tradeState === "closed").length) {
        // Noch da? Dann hat unser Weg nur die Anzeige aufgeraeumt. Jetzt FSTs
        // Weg: _clearSold (scripts.js Z. 59214) - der einzige, den FST nutzt.
        log("Abräumen hat die verkauften Karten nicht entfernt – jetzt über FSTs Weg (_clearSold).");
        await verkaufAusfuehren("abraeumen", { weg: "clearSold" });
        nachher = await abraeumenNachlesen();
      }
      const nochDa = nachher.filter((i) => i.tradeState === "closed");
      const erloes = verkauft.reduce((s, i) => s + i.gebot, 0);
      if (nochDa.length) {
        // Kein stiller Verlust: Es wird genau gesagt, was liegen geblieben ist.
        throw new Error("Abgeräumt wurden nur " + (verkauft.length - nochDa.length) + " von " + verkauft.length +
          " Karten. " + nochDa.length + " verkaufte Karten liegen bei EA weiter auf der Transferliste. Bitte in der Web App unter Transferliste abräumen.");
      }
      return (verkauft.length === 1 ? "1 verkaufter Spieler" : verkauft.length + " verkaufte Spieler") +
        " abgeräumt (Erlös " + fmt(erloes) + " Coins vor Gebühr). Bei EA nachgeprüft: wirklich weg.";
    });
  }

  // ---------------------------------------------------------------------------
  // Verkaufs-Wache (F3): waehrend des Laufs in die Transferliste sehen.
  //
  // FST fragt dafuer alle 8 Suchen echt bei EA nach (scripts.js Z. 58573-58587)
  // und holt danach noch den Muenzstand - zwei Anfragen. Wir lesen zuerst
  // gratis aus dem Speicher der App und fragen EA nur, wenn es einen Grund
  // gibt: hoechstens alle 5 Minuten und hoechstens 6-mal je Lauf. Den
  // Muenzstand nehmen wir danach ebenfalls aus dem Speicher - 0 Anfragen.
  // ---------------------------------------------------------------------------

  async function muenzenAusApp() {
    const antwort = await seitenFrage("muenzen?", {}, CONFIG.VERKAUF_MUENZEN_FRIST_MS);
    const wert = toInt(antwort && antwort.coins);
    if (Number.isFinite(wert) && wert >= 0 && wert <= 999999999) setCredits(wert, "app");
  }

  // Liest die Transferliste. frisch = echte EA-Anfrage (gezaehlt), sonst
  // Speicher der App (kostenlos). Gibt null zurueck, wenn es nicht geht.
  async function verkaufslisteLesen(frisch, token) {
    if (frisch) {
      if (!SESSION.sid) return null;
      try {
        await reserveUsage("search");
      } catch (e) {
        if (e instanceof HardStop) return null;
        throw e;
      }
      if (!isCurrent(token)) return null;
      await verkaufAbstand();
      // Nach der Pause nochmal: In der Zwischenzeit kann eine Sperre kommen.
      if (!isCurrent(token)) return null;
      if (cooldownBlock() || andererTabAktiv()) return null;
    }
    try {
      // Aus dem Speicher antwortet die Seite in Millisekunden. Laenger zu
      // warten wuerde nur Suchzeit kosten.
      const liste = await transferlisteHolen(frisch, frisch ? 0 : 2000);
      if (frisch) {
        VERKAUF.letzteAktion = Date.now();
        VERKAUFS_WACHE.frischAt = Date.now();
        VERKAUFS_WACHE.frischImLauf += 1;
        await muenzenAusApp();
      } else {
        VERKAUFS_WACHE.freiAt = Date.now();
      }
      return liste;
    } catch (e) {
      const code = toInt(e && e.status) || 0;
      // FST-Modus (Punkt 5): FST liest die Transferliste ohne solchen Stopp
      // (scripts.js Z. 59455-59473: nur Such- und Gebots-Anfragen stoppen).
      // Hier nur melden; die naechste Suche stoppt selbst, wenn EA wirklich
      // ein Problem hat. Dann geht es unten wie bei jedem anderen Fehler weiter.
      if (HARD_STOP[code] && STATE.fstModus === true) {
        const meldung = "Verkaufs-Wache: " + HARD_STOP[code] + " Der Lauf geht weiter.";
        pushEvent("warn", meldung);
      } else if (HARD_STOP[code]) {
        VERKAUFS_WACHE.halt = { text: "Gestoppt: " + HARD_STOP[code], level: "error" };
        return null;
      }
      // Antwortet die Seite gar nicht, hoert der Bot eine Weile auf zu fragen.
      // Sonst wartet er in jeder Pause erneut in den Zeitablauf und verliert
      // Suchzeit, obwohl nichts zu holen ist.
      if (!frisch) VERKAUFS_WACHE.stummBis = Date.now() + 10 * 60000;
      warn("Verkaufs-Wache: " + e.message);
      return null;
    }
  }

  function frischErlaubt(dringend) {
    if (!SESSION.sid) return false;
    if (Date.now() < STATE.pauseUntil) return false;
    // FST-Modus: Keine Warnschwellen, kein Mindestabstand, keine Obergrenze je
    // Lauf (FST: alle 8 Suchen frisch, ohne Zaehler, scripts.js Z. 58573-58587).
    if (STATE.fstModus === true) return true;
    if (STATE.usage.searchesHour >= CONFIG.SEARCH_WARN_HOUR) return false;
    if (STATE.usage.searchesDay >= CONFIG.SEARCH_WARN_DAY) return false;
    if (dringend) return true;
    if (Date.now() - VERKAUFS_WACHE.frischAt < CONFIG.VERKAUF_CHECK_MIN_GAP_MS) return false;
    if (VERKAUFS_WACHE.frischImLauf >= CONFIG.VERKAUF_CHECK_MAX_RUN) return false;
    return true;
  }

  function frischGrund(run, frei) {
    // Hat schon das kostenlose Lesen keine Antwort gebracht, geht auch die
    // frische Abfrage denselben Weg durch die Seite - sie wuerde nur eine
    // Suche verbrauchen, die nie bei EA ankommt.
    if (frei === null) return "";
    if (frei.length >= TRANSFERLISTE_WARN) return "Die Transferliste ist fast voll";
    if (run.cfg.afterBuy === "list" && VERKAUFS_WACHE.offen > 0) return "Eigene Karten stehen im Verkauf";
    if (run.cfg.afterBuy === "transfer" && run.stats.bought + run.stats.bidsWon > 0) return "Gekaufte Karten liegen auf der Transferliste";
    return "";
  }

  async function wacheAbraeumen(run, token, anzahl, verkauft) {
    if (!isCurrent(token)) return;
    try {
      // Gezaehlt wird in verkaufAusfuehren selbst (Art "aktion") - hier
      // nicht noch einmal, sonst zaehlte ein Abraeumen doppelt.
      await verkaufAusfuehren("abraeumen");
    } catch (e) {
      if (e instanceof HardStop) {
        VERKAUFS_WACHE.halt = { text: "Gestoppt: Die Transferliste ist voll und für das Abräumen ist kein Anfrage-Kontingent mehr frei.", level: "warn" };
        return;
      }
      const code = toInt(e && e.status) || 0;
      // FST-Modus (Punkt 5): nur melden, der Lauf geht weiter. Ist die Liste
      // wirklich voll, stoppt die Platz-Regel (platzProblem).
      if (STATE.fstModus === true) {
        const meldung = "Verkaufs-Wache: Abräumen hat nicht geklappt – " + (HARD_STOP[code] || e.message) + " Der Lauf geht weiter.";
        warn(meldung);
        pushEvent("warn", meldung);
        return;
      }
      VERKAUFS_WACHE.halt = HARD_STOP[code]
        ? { text: "Gestoppt: " + HARD_STOP[code], level: "error" }
        : { text: "Gestoppt: Abräumen hat nicht geklappt – " + e.message, level: "warn" };
      return;
    }
    VERKAUFS_WACHE.abgeraeumt += 1;
    // Nachpruefen statt glauben (28.09.2026) - genau wie beim Knopf
    // "Verkaufte abräumen". Bisher zog diese Funktion die Zahlen nur im
    // Kopf ab: Ob removeSold die Karten bei EA loescht oder nur die Anzeige
    // leert, hat im Lauf nie jemand nachgesehen. FST liest vor dem Abraeumen
    // immer frisch (scripts.js Z. 59158-59214). Das Nachlesen ist eine
    // echte, gezaehlte Anfrage (abraeumenNachlesen -> reserveUsage).
    let liste;
    try {
      liste = await abraeumenNachlesen();
      // Nach JEDEM Warten pruefen, ob der Lauf noch derselbe ist (28.09.2026).
      // Ohne das feuerte die Wache nach einem Stopp (Stopp-Knopf, Not-Aus) noch
      // bis zu drei gezaehlte EA-Anfragen ab: erstes Nachlesen, gezieltes
      // Abraeumen, zweites Nachlesen. Kein Regelbruch - alles wird gezaehlt -,
      // aber Anfragen NACH dem Stopp sind genau das, was ein Stopp verhindern soll.
      if (!isCurrent(token)) return;
      if (liste.filter((i) => i.tradeState === "closed").length) {
        // Noch da? Dann hat der erste Weg nur die Anzeige geleert. Jetzt
        // GEZIELT FSTs Weg (_clearSold, scripts.js Z. 59214) - nicht noch
        // einmal dieselbe Kette, die gerade wirkungslos "Erfolg" gemeldet hat.
        //
        // Das Nachlesen davor fuellt den Speicher der Web App - ohne es wuerde
        // der gezielte Weg an der leeren Liste abprallen (sniffer.js
        // verkaufAktion bricht bei leerer closed-Liste vor der Wege-Schleife ab).
        log("Abräumen im Lauf hat die verkauften Karten nicht entfernt – jetzt über FSTs Weg (_clearSold).");
        await verkaufAusfuehren("abraeumen", { weg: "clearSold" });
        if (!isCurrent(token)) return;
        liste = await abraeumenNachlesen();
      }
    } catch (e) {
      if (e instanceof HardStop) {
        VERKAUFS_WACHE.halt = { text: "Gestoppt: Die Transferliste ist voll und für das Nachprüfen des Abräumens ist kein Anfrage-Kontingent mehr frei.", level: "warn" };
        return;
      }
      const code = toInt(e && e.status) || 0;
      // FST-Modus (Punkt 5): wie oben nur melden.
      if (STATE.fstModus === true) {
        const meldung = "Verkaufs-Wache: Nachprüfen nach dem Abräumen hat nicht geklappt – " + (HARD_STOP[code] || e.message) + " Der Lauf geht weiter.";
        warn(meldung);
        pushEvent("warn", meldung);
        return;
      }
      VERKAUFS_WACHE.halt = HARD_STOP[code]
        ? { text: "Gestoppt: " + HARD_STOP[code], level: "error" }
        : { text: "Gestoppt: Nachprüfen nach dem Abräumen hat nicht geklappt – " + e.message, level: "warn" };
      return;
    }
    // Ab hier zaehlt nur der frisch gelesene Stand - keine Schaetzung mehr.
    // abraeumenNachlesen hat die Liste schon in den Speicher geschrieben
    // (transferlisteHolen), das alte Weg-Rechnen im Speicher entfaellt.
    const nochDa = liste.filter((i) => i.tradeState === "closed").length;
    const rest = liste.length;
    const wegGeraeumt = Math.max(0, verkauft.length - nochDa);
    VERKAUFS_WACHE.anzahl = rest;
    STAPEL.transfer = rest;
    STAPEL.vollTransfer = rest >= TRANSFERLISTE_MAX;
    STAPEL.at = Date.now();
    const text = wegGeraeumt + " verkaufte Karten abgeräumt – " + (TRANSFERLISTE_MAX - rest) + " Plätze wieder frei. Bei EA nachgeprüft.";
    pushEvent("verkauf", text);
    log(text);
    if (rest >= TRANSFERLISTE_MAX) {
      VERKAUFS_WACHE.halt = { text: "Gestoppt: Abräumen hat keinen Platz gebracht – die Transferliste ist bei EA weiter voll (" + rest + (nochDa ? ", davon " + nochDa + " verkaufte" : "") + ").", level: "warn" };
    }
  }

  async function verkaufsWacheAufgabe(run, token, anlass) {
    const frei = await verkaufslisteLesen(false, token);
    if (VERKAUFS_WACHE.halt || !isCurrent(token)) return "";
    let liste = frei;
    const dringend = Boolean(frei) && frei.length >= TRANSFERLISTE_MAX;
    const grund = frischGrund(run, frei);
    if ((grund || dringend) && frischErlaubt(dringend)) {
      const neu = await verkaufslisteLesen(true, token);
      if (neu) liste = neu;
    }
    if (VERKAUFS_WACHE.halt || !isCurrent(token) || !liste) return "";
    VERKAUFS_WACHE.anzahl = liste.length;
    VERKAUFS_WACHE.offen = liste.filter((i) => i.tradeState === "active" && i.tradeId).length;
    STAPEL.transfer = liste.length;
    // Die Liste wurde gerade gelesen - also auch EAs "voll"-Antwort danach
    // ausrichten (27.09.2026). Sonst haengt ein altes true nach und der Lauf
    // bliebe grundlos gebremst.
    STAPEL.vollTransfer = liste.length >= TRANSFERLISTE_MAX;
    STAPEL.at = Date.now();

    // Was seit dem Start verkauft wurde. Beim ersten Blick (anlass "start")
    // zaehlen alte Verkaeufe nicht mit - die gehoeren nicht zu diesem Lauf.
    const neuVerkauft = Array.isArray(VERKAUF.neuVerkauft) ? VERKAUF.neuVerkauft : [];
    VERKAUF.neuVerkauft = [];
    if (anlass !== "start") {
      for (const e of neuVerkauft) {
        const netto = Math.floor((Number(e.preis) || 0) * (1 - CONFIG.SALE_FEE));
        VERKAUFS_WACHE.seitStart.anzahl += 1;
        VERKAUFS_WACHE.seitStart.erloes += netto;
        if (Number(e.gekauftFuer) > 0) {
          VERKAUFS_WACHE.seitStart.gewinn += netto - Number(e.gekauftFuer);
          VERKAUFS_WACHE.seitStart.mitKauf += 1;
        }
        const text = e.name + " verkauft für " + fmt(e.preis) + " Coins.";
        pushEvent("verkauf", text);
        log(text);
      }
    }

    const verkauft = liste.filter((i) => i.tradeState === "closed");
    // Fuer die Platzpruefung merken, ob ueberhaupt etwas abzuraeumen ist
    // (25.09.2026). Ohne diese Zahl wuesste platzProblem nicht, ob sich die
    // volle Liste gleich von selbst erledigt.
    VERKAUFS_WACHE.verkaufteDa = verkauft.length;
    const brauchtPlatz = run.cfg.afterBuy === "transfer" || run.cfg.afterBuy === "list";
    if (liste.length >= TRANSFERLISTE_MAX && brauchtPlatz) {
      if (!STATE.autoAbraeumen) {
        VERKAUFS_WACHE.halt = {
          text: "Gestoppt: Die Transferliste ist voll (" + liste.length + "). " + (verkauft.length
            ? verkauft.length + " verkaufte Karten liegen noch darin – im Reiter Käufe auf „Verkaufte abräumen“ tippen."
            : "Bitte in der Web App Platz schaffen."),
          level: "warn"
        };
      } else if (!verkauft.length) {
        VERKAUFS_WACHE.halt = { text: "Gestoppt: Die Transferliste ist voll (100) und es gibt nichts abzuräumen. Bitte in der Web App Platz schaffen.", level: "warn" };
      } else {
        await wacheAbraeumen(run, token, liste.length, verkauft);
      }
    }
    const s = VERKAUFS_WACHE.seitStart;
    return s.anzahl
      ? s.anzahl + " verkauft seit Start · " + (s.mitKauf ? (s.gewinn >= 0 ? "+" : "") + fmt(s.gewinn) + " Gewinn" : fmt(s.erloes) + " Coins nach Gebühr")
      : "";
  }

  const WACHE_MELDUNG = "Sehe kurz in die Transferliste …";

  // Gibt { text, level } zurueck, wenn der Lauf aufhoeren soll. Sonst null.
  async function verkaeufePruefen(run, token, anlass) {
    if (!STATE.verkaufWache) return null;
    if (Date.now() < VERKAUFS_WACHE.stummBis) return null;
    if (!isCurrent(token)) return null;
    if (VERKAUF.laeuft) return null;
    if (cooldownBlock() || andererTabAktiv()) return null;
    VERKAUFS_WACHE.halt = null;
    if (anlass !== "start" && STATE.level === "run") setMessage(WACHE_MELDUNG, "run");
    await verkaufLauf("pruefen", () => verkaufsWacheAufgabe(run, token, anlass));
    if (isCurrent(token) && STATE.message === WACHE_MELDUNG) setMessage(runningMessage(run.cfg), "run");
    return VERKAUFS_WACHE.halt;
  }

  // ---------------------------------------------------------------------------
  // Treffer-Statistik: jeder Lauf wird mit Zielpreis, Dauer und Ergebnis gespeichert.
  // ---------------------------------------------------------------------------

  function recordRun(run) {
    if (!run) return Promise.resolve();
    const now = Date.now();
    const entries = run.cfg.targets
      .map((t) => ({ t: now, key: t.key, target: t.maxPrice, durationMs: now - run.startedAt, reason: run.reason || "Beendet.", ...run.perTarget.get(t.key) }))
      .filter((e) => e.scans > 0);
    if (!entries.length) return Promise.resolve();
    // 500 statt 50 (25.09.2026). Diese Eintraege sind die einzige Grundlage
    // fuer die Trefferquote je Filter ueber 7 Tage. Bei 50 Stueck und einem
    // Eintrag je Ziel und Lauf war das Fenster nach ein paar Rotationen voll,
    // und die Quote rechnete nur noch mit den letzten Minuten. Ein Eintrag ist
    // winzig; 500 davon fallen im Speicher nicht ins Gewicht.
    return updateStorage("runStats", (current) => (Array.isArray(current) ? current : []).concat(entries).slice(-LOG_MAX));
  }

  // Kauflog fuer den Tab "Käufe" und den CSV-Export.
  function logPurchase(purchase) {
    return updateStorage("purchases", (current) => (Array.isArray(current) ? current : []).concat([purchase]).slice(-LOG_MAX));
  }

  function runHint() {
    const run = STATE.run;
    if (!STATE.running || !run) return "";
    // Ganz oben: ein Drosselungsverdacht. Alles andere kann warten.
    const gedrosselt = throttleHint(run);
    if (gedrosselt) return gedrosselt;
    // Danach: Wenn EA den Preisfilter ignoriert, durchsucht der Bot nur die
    // ersten 21 Angebote und uebersieht guenstige.
    if (run.priceFilterWarned) {
      return "EA filtert nicht nach deinem Zielpreis – der Bot sieht nur die ersten 21 Angebote und sortiert selbst aus. Günstige Karten können dadurch untergehen.";
    }
    const s = run.stats;
    if (s.bought > 0) return "";
    const single = run.cfg.targets.length === 1;
    if (s.missed >= 3) return s.missed + "× knapp verpasst: " + (single ? "Der Zielpreis ist realistisch." : "Die Zielpreise sind realistisch.");
    const minutes = Math.floor((Date.now() - run.startedAt) / 60000);
    // Live-Filter gelten nur 15 Minuten, der normale Hinweis nach 20 kaeme nie.
    // Und er muss sagen, woran es liegt: Der Live-Zielpreis liegt unter dem
    // Marktpreis, gekauft wird nur, wenn jemand zu billig einstellt. Nur wenn
    // wirklich kein einziges Angebot bis zum Zielpreis zu sehen war.
    const nurLive = run.cfg.targets.every((t) => Number(t.expiresAt) > 0 || Number(t.liveBis) > 0);
    const nichtsGesehen = !(run.trefferGesehen > 0) && !(s.missed > 0) && !(s.bids > 0);
    if (nurLive && nichtsGesehen && minutes >= CONFIG.DROUGHT_LIVE_MIN) {
      return "Seit " + minutes + " Min. kein Angebot bis " +
        (single ? fmt(run.cfg.targets[0].maxPrice) + ". Der Zielpreis liegt wohl unter dem billigsten Angebot"
          : "zu den Zielpreisen. Die Zielpreise liegen wohl unter den billigsten Angeboten") +
        " – ein Treffer braucht einen Fehlpreis.";
    }
    if (minutes >= CONFIG.DROUGHT_MIN) {
      return "Seit " + minutes + " Min. kein Treffer" +
        (single ? " bei " + fmt(run.cfg.targets[0].maxPrice) + ". Zielpreis" : ". Zielpreise") + " vielleicht etwas anheben.";
    }
    return "";
  }

  // ---------------------------------------------------------------------------
  // Bot
  // ---------------------------------------------------------------------------

  function isCurrent(token) {
    return STATE.running && token === STATE.token && extensionAlive();
  }

  // Modus pro Lauf (Punkt 7): Ohne laufenden Filter gilt der Haken aus den
  // Einstellungen. Waehrend eines Laufs bleibt der Wert vom Start.
  function fstAbgleichen() {
    if (STATE.running) {
      // Im Lauf zaehlt NUR der Wert vom Start (run.fst).
      if (STATE.run && typeof STATE.run.fst === "boolean") STATE.fstModus = STATE.run.fst;
      return;
    }
    STATE.fstModus = STATE.fstEinst === true;
  }

  // code: "filter" = nur dieser Filter ist fertig, die Rotation darf weiter.
  // "gesamt" = alles beenden. Ohne Angabe entscheidet der Level.
  function stop(message, level, leise, code) {
    if (STATE.running) log("Stopp:", message);
    if (STATE.run && STATE.run.token === STATE.token && !STATE.run.reason) STATE.run.reason = message;
    const wasRunning = STATE.running;
    STATE.running = false;
    fstAbgleichen();
    STATE.token += 1;
    setMessage(message, level);
    // Wie FSTs stopBid (28.09.2026, scripts.js Z. 58817): beim Stopp die
    // geleerte Merkliste "Nicht zugewiesen" zuruecksetzen, damit die Web App
    // dem Nutzer wieder den echten Stand zeigt. Keine EA-Anfrage.
    if (wasRunning && STATE.nichtZugewiesenUnbegrenzt) unassignedZuruecksetzen();
    STATE.letzterStopp = { code: code || (level === "error" ? "gesamt" : "filter"), message, level, t: Date.now() };
    gedaechtnisSichern().catch(() => {}); // gesammelte Preise sichern
    if (STATE.letzterStopp.code === "gesamt") rotationBeenden(message);
    if (wasRunning && (level === "done" || level === "error")) notify(message, "ende");
    // Ton nur, wenn der Bot von selbst aufhoert. Stopp-Knopf ("idle") und
    // Not-Aus (leise) bleiben still - da weiss der Nutzer ja Bescheid.
    if (wasRunning && !leise) {
      if (level === "error") tonSpielen("warnung");
      else if (level === "done" || level === "warn") tonSpielen("ende");
    }
  }

  // Wann ist eine Antwort von EA ein Grund, vom Gas zu gehen? (25.09.2026)
  // Nur bei 5xx und bei unbekannten 4xx. 400, 404 und 405 entstehen bei uns
  // durch eigene falsche Filterwerte - eine Bremse wuerde den Nutzer dafuer
  // bestrafen, dass ein Feld nicht passt, und haette mit EA nichts zu tun.
  // Die harten Codes (429, 461, 521 ...) kommen hier gar nicht erst an: Die
  // faengt apiAntwortPruefen vorher ab und sperrt den Start.
  function bremsGrund(status) {
    // FST-Modus: keine Bremse nach unklaren Antworten. FST stoppt bei einer
    // Suche sofort, bei einem Kauf macht es weiter (scripts.js Z. 59455-59473).
    if (STATE.fstModus === true) return false;
    const code = toInt(status);
    if (!(code >= 400)) return false;
    if (code === 400 || code === 404 || code === 405) return false;
    return true;
  }

  // Bremse stellen. Jede weitere Bremsung in Folge dauert laenger:
  // 30 Sekunden, 2 Minuten, 10 Minuten. Eine geglueckte Suche setzt zurueck.
  function bremseSetzen() {
    const stufen = CONFIG.FEHLER_PAUSEN_MS;
    const dauer = stufen[Math.min(STATE.bremsStufe, stufen.length - 1)];
    STATE.bremsStufe += 1;
    STATE.bremsBis = Math.max(STATE.bremsBis, Date.now() + dauer);
  }

  // Die gestellte Bremse abwarten. In kleinen Schritten, damit STOP und der
  // Not-Aus sofort greifen, und mit Restzeit in der Leiste.
  async function fehlerBremse(token) {
    if (!(STATE.bremsBis > Date.now())) return;
    // Ist ohnehin gleich Schluss (Fehlergrenze erreicht), wird nicht erst
    // gewartet - der Nutzer soll die Meldung sofort sehen.
    if (STATE.fstModus === true) return;
    if (STATE.searchErrors >= CONFIG.MAX_ERRORS_IN_A_ROW || STATE.buyErrors >= CONFIG.MAX_ERRORS_IN_A_ROW) return;
    pushEvent("pause", "Pause nach einer unklaren Antwort von EA: " +
      Math.ceil((STATE.bremsBis - Date.now()) / 1000) + " s.");
    while (isCurrent(token) && STATE.bremsBis > Date.now()) {
      const restS = Math.ceil((STATE.bremsBis - Date.now()) / 1000);
      setMessage("Pause nach einer unklaren Antwort von EA: noch " +
        (restS >= 60 ? Math.ceil(restS / 60) + " Min." : restS + " s") + " …", "warn");
      await wait(Math.min(10000, STATE.bremsBis - Date.now()), token);
    }
  }

  function countError(kind, message, status) {
    // Unklare Antwort von EA: erst bremsen, dann erst wieder anfragen.
    if (bremsGrund(status)) bremseSetzen();
    STATE.stats.errors += 1;
    // "netz" (nur FST-Modus): Netzfehler, Zeitueberschreitung, unlesbare
    // Antwort oder ein Programmfehler im Kauf-Zweig. FST stoppt dabei nicht
    // (catch -> searchAgain, scripts.js Z. 58328-58330); wir stoppen erst
    // nach 10 in Folge, damit ein Totalausfall keine Endlosschleife wird.
    // Punkt 6: Netzfehler zaehlen jetzt in Folge (netzErrors). Erst nach
    // CONFIG.FST.NETZ_FEHLER_MAX stoppt der Lauf (stopReason).
    if (kind === "buy") STATE.buyErrors += 1;
    else if (kind === "netz") {
      STATE.netzErrors = (STATE.netzErrors || 0) + 1;
      STATE.netzRundeFehler = true; // die Runde war nicht fehlerfrei: kein Zuruecksetzen
    }
    else STATE.searchErrors += 1;
    setMessage(message, "warn");
    warn(message);
  }

  function remember(tradeId) {
    STATE.seen.add(tradeId);
    if (STATE.seen.size > 5000) STATE.seen = new Set(Array.from(STATE.seen).slice(-2500));
  }

  // Wartet in kleinen Schritten, damit STOP sofort greift.
  async function wait(ms, token) {
    const end = Date.now() + ms;
    while (isCurrent(token) && Date.now() < end) {
      await sleep(Math.min(250, end - Date.now()));
    }
  }

  // Wandernder Mindestpreis: jede Suche eine Preisstufe hoeher (150, 200,
  // 250 ...), nach CONFIG.MINB_STUFEN Stufen zurueck auf 0. So sieht EA rund
  // ein Dutzend verschiedene Anfragen statt vier - eine gleiche Anfrage kann
  // aus einem Zwischenspeicher beantwortet werden (FST macht es aehnlich,
  // Z. 58353-58357). Nie ueber die Haelfte des Zielpreises: Darunter liegen
  // die grossen Fehlpreise. Bei billigen Karten (bis 300) wechselt er wie
  // frueher nur zwischen 0 und 150. Nur beim Sofortkauf - im Gebotsmodus
  // filtert der Wert das aktuelle Gebot, Auktionen ohne Gebot fielen raus.
  function wandernderMindestpreis(run, target) {
    if (run.cfg.bidSniping || !(target.maxPrice > 150)) return 0;
    const deckel = Math.max(Math.floor(target.maxPrice / 2), 150);
    // Die Treppe gehoert zum SPIELER, nicht zum ganzen Lauf (27.09.2026).
    //
    // Vorher lagen Zaehler und letzter Wert am Lauf. In einem Lauf mit zehn
    // Spielern richtete sich der Deckel dann nach dem, der gerade dran war -
    // also nach dem billigsten. Beispiel: Spieler A Zielpreis 50.000,
    // Spieler B Zielpreis 600. Bei B liegt der Deckel bei 300; sobald die
    // Treppe darueber stand, sprang sie auf 0 zurueck - auch fuer A. Statt
    // rund einem Dutzend verschiedener Anfragen blieben vier oder fuenf, und
    // EA konnte oefter aus dem Zwischenspeicher antworten.
    //
    // FSTs Zaehler gehoert ebenfalls zu genau einem Filter (scripts.js
    // Z. 58353-58357). Kostet keine zusaetzliche Anfrage: dieselbe Suche,
    // nur mit einer anderen Zahl in der Adresse.
    //
    // Eigene Ablage statt run.perTarget: Was in perTarget steht, wandert beim
    // Ende des Laufs unveraendert in die Verlaufsliste (siehe Z. 3475) - dort
    // hat eine technische Zwischenzahl nichts zu suchen.
    if (!run.minbJeZiel) run.minbJeZiel = new Map();
    const stand = run.minbJeZiel.get(target.key) || { letzter: 0, schritte: 0 };
    const naechster = stand.letzter === 0 ? 150 : stand.letzter + stepFor(stand.letzter);
    stand.schritte += 1;
    const zurueck = stand.schritte > CONFIG.MINB_STUFEN || naechster > deckel;
    if (zurueck) stand.schritte = 0;
    stand.letzter = zurueck ? 0 : naechster;
    run.minbJeZiel.set(target.key, stand);
    return stand.letzter;
  }

  // ---------------------------------------------------------------------------
  // Warten statt aufhoeren, wenn ein Stundenlimit voll ist (25.09.2026).
  //
  // Die Stundenlimits sind ein wanderndes Fenster von 60 Minuten. Ist es voll,
  // dauert es oft nur ein paar Minuten, bis die aelteste Anfrage hinausfaellt.
  // Bisher endete der Lauf an dieser Stelle, und der Nutzer musste selbst
  // nachsehen und neu starten. FST hoert an seinem Limit ebenfalls einfach auf
  // (scripts.js Z. 58558-58569) - hier sind wir also nicht im Rueckstand,
  // sondern besser.
  //
  // Kein Limit wird angehoben, keine Anfrage vorgezogen. Gewartet wird
  // hoechstens CONFIG.STUNDENLIMIT_WARTEN_MAX_MS am Stueck.
  //
  // 27.09.2026: Bis heute war ausserdem nach der ERSTEN Wartepause je Lauf
  // Schluss, und laenger als 15 Minuten wurde nie gewartet. Beides passte
  // nicht mehr zum Tempo von FST. Eine Wartepause schafft Platz fuer genau
  // EINE neue Anfrage - aus dem 60-Minuten-Fenster faellt immer nur die
  // aelteste heraus. Also hoerte der Bot nach rund 15 Minuten auf, obwohl
  // die Oberflaeche "wartet den Rest der Stunde" versprach.
  //
  // Jetzt wird gewartet, so oft es noetig ist. Zwei Grenzen bleiben: die
  // Hoechstwartezeit oben, und das Zeitlimit des Laufs - ueber sein eigenes
  // Ende hinaus wartet der Bot nicht, das waere Warten umsonst.
  // ---------------------------------------------------------------------------

  // Nur Stundenlimits duerfen warten. Ein Tageslimit dauert Stunden - da ist
  // Aufhoeren richtig. Erkannt am Wortlaut, den reserveUsage erzeugt.
  function istStundenlimit(text) {
    return typeof text === "string" && text.indexOf("Sicherheitslimit erreicht:") === 0 && text.indexOf("pro Stunde") > 0;
  }

  // Wie lange dauert es, bis in JEDES Stundenfenster wieder eine Anfrage
  // passt? Gerechnet wird ueber Suchen, Kaeufe, Aktionen und den Deckel ueber
  // allem - sonst liefe der Bot nach der Pause gleich ins naechste Limit.
  function stundenlimitRestMs(now) {
    const daten = STATE.usageDaten;
    if (!daten) return 0;
    const fenster = 60 * 60 * 1000;
    const rest = (liste, limit) => {
      const drin = (Array.isArray(liste) ? liste : []).filter((t) => Number(t) > now - fenster).sort((a, b) => a - b);
      if (drin.length < limit) return 0;
      // So viele der aeltesten muessen aus dem Fenster fallen, damit wieder
      // eine einzige Anfrage hineinpasst.
      const zuViel = drin.length - limit + 1;
      return drin[zuViel - 1] + fenster - now + 1000; // eine Sekunde Luft
    };
    const alle = [].concat(daten.searches || [], daten.buys || [], daten.aktionen || []);
    return Math.max(
      rest(daten.searches, suchLimitStunde()),
      rest(daten.buys, CONFIG.BUY_LIMIT_HOUR),
      rest(daten.aktionen, CONFIG.ACTION_LIMIT_HOUR),
      rest(alle, gesamtLimitStunde()),
      0
    );
  }

  // true = es wurde wirklich gewartet, ein neuer Versuch ist sinnvoll.
  // false = der Lauf endet wie bisher.
  async function stundenPause(run, grund) {
    if (!istStundenlimit(grund)) return false;
    const dauer = stundenlimitRestMs(Date.now());
    if (!(dauer > 0) || dauer > CONFIG.STUNDENLIMIT_WARTEN_MAX_MS) return false;
    const bis = Date.now() + dauer;
    // Das Zeitlimit des Laufs geht vor (27.09.2026). Waere der Lauf nach der
    // Wartezeit ohnehin zu Ende, wird nicht erst 45 Minuten gewartet und dann
    // gestoppt - das waere Warten umsonst. Der Standard sind 30 Minuten
    // Laufzeit; wer durchgehend suchen will, laesst das Feld leer (dann
    // gelten 300 Minuten).
    const laufEnde = Number(run.cfg && run.cfg.timeLimitMin) > 0
      ? run.startedAt + Number(run.cfg.timeLimitMin) * 60000 : 0;
    if (laufEnde > 0 && bis >= laufEnde) {
      // Mit Erklaerung, nicht mit einer nackten Limit-Meldung: Sonst sieht es
      // aus wie ein Fehler, obwohl es die eigene Einstellung ist.
      pushEvent("pause", "Stundenlimit voll. Warten würde " + Math.ceil(dauer / 60000) +
        " Min. dauern – länger, als die eingestellte Laufzeit noch läuft. Der Lauf endet hier. " +
        "Für durchgehendes Suchen das Feld Laufzeit leer lassen.");
      return false;
    }
    // Und dasselbe fuer die Live-Filter (28.09.2026).
    //
    // Ein Live-Filter gilt 15 Minuten, die Filter-Wache kann ihn einmal um 10
    // verlaengern - laenger als 25 Minuten lebt keiner. Eine Wartezeit von 50
    // Minuten heisst also: Danach ist jeder Filter tot, und der Lauf endet
    // sofort mit "Alle Live-Filter sind abgelaufen".
    //
    // Genau das wurde am 28.09. gemessen: 50 Minuten warten, eine einzige
    // zusaetzliche Suche, dann Ende. Vorher hoerte der Bot nach 15 Minuten
    // ehrlich auf. Mit der Wartepause sass der Nutzer 50 Minuten vor einem
    // Bot, der nur so AUSSAH, als arbeite er. Das war schlechter als vorher.
    //
    // Gibt es mindestens ein Ziel ohne Ablauf (ein von Hand gewaehlter
    // Spieler), lohnt das Warten weiter - dann wird nicht abgebrochen.
    const ziele = (run.cfg && run.cfg.targets) || [];
    const mitAblauf = ziele.filter((t) => Number(t.expiresAt) > 0);
    if (mitAblauf.length === ziele.length && ziele.length > 0) {
      const laengsterFilter = Math.max(...mitAblauf.map((t) => Number(t.expiresAt)));
      if (bis >= laengsterFilter) {
        const restMin = Math.max(0, Math.round((laengsterFilter - Date.now()) / 60000));
        pushEvent("pause", "Stundenlimit voll. Warten würde " + Math.ceil(dauer / 60000) +
          " Min. dauern – der letzte Live-Filter läuft aber schon in " + restMin +
          " Min. ab. Danach wäre nichts mehr zu suchen. Der Lauf endet hier. " +
          "Im Reiter Filter neu scannen, dann geht es weiter.");
        return false;
      }
    }
    // 27.09.2026: Hier stand vorher "hoechstens einmal je Lauf". Genau das
    // war der Grund, warum der Bot nach rund 15 Minuten aufhoerte: Eine
    // einzige Wartepause schafft Platz fuer genau EINE neue Anfrage, denn aus
    // dem 60-Minuten-Fenster faellt immer nur die aelteste heraus. Jetzt wird
    // gewartet, so oft es noetig ist; mitgezaehlt wird nur noch, wie oft.
    run.stundenPauseGenutzt = (run.stundenPauseGenutzt || 0) + 1;
    // 27.09.2026: Bei Wartezeiten unter einer Minute stand hier immer "1 Min.".
    // Nach der ersten langen Pause sind fast alle Wartezeiten so kurz.
    const text = "Stundenlimit voll – der Bot wartet " +
      (dauer >= 60000 ? Math.ceil(dauer / 60000) + " Min." : Math.ceil(dauer / 1000) + " Sek.") +
      " und macht dann weiter.";
    // Kurze Wartezeiten nicht ins Protokoll (27.09.2026). Nach der ersten
    // langen Pause folgt eine ganze Reihe von Wartezeiten unter einer Minute -
    // je eine, wenn wieder eine Anfrage frei wird. Als Meldung waere das nur
    // Rauschen und wuerde die wichtigen Ereignisse aus der Liste schieben.
    // Im Log stehen sie weiter, fuer die Fehlersuche.
    if (dauer >= 30000) {
      warn(text);
      pushEvent("pause", text);
    } else {
      log(text);
    }
    // Ende der Pause fuer die Leiste, damit der Balken laeuft - wie bei der
    // normalen Sicherheitspause.
    run.pauseBis = bis;
    run.pauseDauer = dauer;
    while (isCurrent(run.token) && Date.now() < bis) {
      const restS = Math.ceil((bis - Date.now()) / 1000);
      setMessage("Stundenlimit voll: noch " + (restS >= 60 ? Math.ceil(restS / 60) + " Min." : restS + " s") +
        ", dann geht es weiter. Stopp beendet den Lauf sofort.", "warn");
      await wait(Math.min(10000, bis - Date.now()), run.token);
    }
    run.pauseBis = 0;
    if (!isCurrent(run.token)) return false; // Stopp, Not-Aus oder Tab-Wechsel
    setMessage(runningMessage(run.cfg), "run");
    return true;
  }

  // Sucht bei EA. Laeuft die Suche gegen ein Stundenlimit, wird einmal je Lauf
  // abgewartet und danach genau einmal neu versucht. Jede andere harte
  // Meldung (Sperre, Captcha, fehlende Sitzung) geht unveraendert durch.
  // jitterMax kommt von aussen (25.09.2026): Der Hoechstpreis wandert
  // eine Stufe nach oben und wieder zurueck, damit EA nicht immer
  // dieselbe Anfrage sieht. Er wird NUR angehoben, nie gesenkt - beim
  // Senken fiele ein Angebot genau am Zielpreis aus der Antwort, und das
  // sind die Treffer, auf die es ankommt.
  async function sucheMitStundenPause(target, run, jitterMin, jitterMax) {
    const obergrenze = Number(jitterMax) >= Number(target.maxPrice) ? Number(jitterMax) : Number(target.maxPrice);
    const pfad = searchPath(target.playerId, obergrenze, 0, run.cfg.bidSniping, target.rating, jitterMin, target.rarity);
    try {
      return await api(pfad);
    } catch (e) {
      if (!(e instanceof HardStop)) throw e;
      if (!(await stundenPause(run, e.message))) throw e;
      return await api(pfad);
    }
  }

  // Wandernder Hoechstpreis (25.09.2026, bei FST abgeschaut: scripts.js
  // Z. 58353-58367). FST verschiebt auch die obere Grenze, damit zwei Suchen
  // nacheinander nie gleich aussehen - eine gleiche Anfrage kann aus einem
  // Zwischenspeicher kommen und misst dann den Markt von vorhin.
  //
  // FST SENKT die Grenze dabei. Das machen wir bewusst nicht: Ein Angebot
  // genau zum Zielpreis faellt dann aus EAs Antwort - und genau auf dieses
  // Angebot wartet der Bot. Bei uns geht die Grenze nur EINE Preisstufe nach
  // OBEN und bei der naechsten Suche sofort wieder zurueck. Nach oben kostet
  // nichts: Gekauft wird ohnehin nur bis zum Zielpreis (siehe isTarget).
  // An der Zahl der Suchen aendert sich nichts.
  //
  // Nur beim Sofortkauf. Im Gebotsmodus filtert die Grenze das aktuelle
  // Gebot - da waere eine Verschiebung eine ganz andere Suche.
  function wandernderHoechstpreis(run, target) {
    if (run.cfg.bidSniping || !(target.maxPrice > 0)) return target.maxPrice;
    run.hoechstpreisHoch = !run.hoechstpreisHoch;
    if (!run.hoechstpreisHoch) return target.maxPrice;
    return target.maxPrice + stepFor(target.maxPrice);
  }

  async function search(target, run) {
    let res;
    const jitterMin = wandernderMindestpreis(run, target);
    const jitterMax = wandernderHoechstpreis(run, target);

    try {
      res = await sucheMitStundenPause(target, run, jitterMin, jitterMax);
    } catch (e) {
      if (e instanceof HardStop) throw e;
      countError(STATE.fstModus === true ? "netz" : "search", "Suche: " + e.message);
      return [];
    }

    run.stats.scans += 1;
    run.perTarget.get(target.key).scans += 1;
    if (!res.ok) {
      countError("search", "Suche: HTTP " + res.status, res.status);
      return [];
    }

    let data;
    try {
      data = await res.json();
    } catch (e) {
      // FST-Modus: eine nicht lesbare Antwort ist wie ein Netzfehler (Punkt 6).
      countError(STATE.fstModus === true ? "netz" : "search", "Suche: Antwort ist kein JSON.");
      return [];
    }

    STATE.searchErrors = 0;
    STATE.rateLimitHits = 0;
    // 25.09.2026: Eine geglueckte Suche loescht die Bremse - EA antwortet
    // wieder normal, also faengt die Stufenzaehlung von vorne an.
    STATE.bremsStufe = 0;
    STATE.bremsBis = 0;
    if (STATE.level === "warn") setMessage(runningMessage(run.cfg), "run");
    if (data && typeof data.credits === "number") setCredits(data.credits);
    const auctions = data && Array.isArray(data.auctionInfo) ? data.auctionInfo.filter(Boolean) : [];
    noteItemFields(auctions);
    gedaechtnisMerken(auctions); // kostet nichts: die Angebote sind schon da
    // Marktaktivitaet aus zwei Laufsuchen desselben Spielers (27.09.2026).
    // Kostet ebenfalls keine Anfrage: Die Angebote liegen schon vor.
    // Uebergeben wird genau das Preisfenster, mit dem wirklich gesucht wurde -
    // sonst passten die beiden Aufnahmen nicht zueinander (sucheMitStundenPause
    // nimmt als Obergrenze den groesseren von jitterMax und Zielpreis).
    laufAktivitaet(run, target, auctions, jitterMin, Math.max(jitterMax, target.maxPrice));
    // Beide wandernden Grenzen ins Protokoll (25.09.2026). Sonst waere im
    // Nachhinein nicht mehr zu sehen, mit welcher Adresse gesucht wurde.
    pushEvent("search", playerLabel(target) + (jitterMin > 0 ? " (ab " + fmt(jitterMin) + ")" : "") +
      (jitterMax > target.maxPrice ? " (bis " + fmt(jitterMax) + ")" : "") + ": " + auctions.length + " Treffer");

    const progress = run.perTarget.get(target.key);
    if (noteEmptyResult(progress, auctions.length === 0) && !run.throttleTarget) {
      run.throttleTarget = playerLabel(target);
      warn("Möglicher Drosselungs-Hinweis: " + run.throttleTarget + " lieferte erst Treffer, jetzt " +
        progress.emptyStreak + "× nichts mehr.");
    }

    // Wie viele der Treffer liegen wirklich beim Zielpreis oder darunter?
    // Nur danach darf beurteilt werden, ob der Filter zu weit gefasst ist.
    // Auf die blosse Trefferzahl ist kein Verlass: Wenn EA den Preisparameter
    // ignoriert, ist jede Seite voll, ganz gleich wie guenstig gesucht wurde.
    // Verglichen wird das Feld, nach dem EA auch filtert: im Gebotsmodus das
    // aktuelle Gebot, sonst der Sofortkaufpreis. Sonst misst man das Falsche.
    const bidMode = Boolean(run.cfg.bidSniping);
    const vergleichspreis = (auction) => {
      if (!bidMode) return bin(auction);
      const aktuell = currentBid(auction);
      return aktuell > 0 ? aktuell : Number(auction.startingBid) || 0;
    };

    let unterZielpreis = 0;
    let ueberZielpreis = 0;
    for (const auction of auctions) {
      const preis = vergleichspreis(auction);
      if (!(preis > 0)) continue;
      if (preis <= target.maxPrice) unterZielpreis += 1;
      else ueberZielpreis += 1;
    }
    // Nur bei Sofortkauf aussagekraeftig. Auktionen starten niedrig und
    // steigen erst: Eine volle Seite mit kleinen Geboten ist der Normalfall
    // und sagt ueberhaupt nichts ueber den Marktpreis aus.
    if (!bidMode && unterZielpreis >= volleSeite()) progress.fullPages = (progress.fullPages || 0) + 1;
    else progress.fullPages = 0;
    // Schon EINE Suche mit mehr als 10 Angeboten bis zum Zielpreis reicht:
    // So viele guenstige Angebote gibt es nur, wenn der Zielpreis ueber dem
    // Markt liegt. Frueher kaufte der Bot aus solchen Suchen noch, bis zwei
    // volle Seiten beisammen waren - genau die Kaeufe ohne Gewinn.
    if (!bidMode && run.cfg.stopIfTooBroad && unterZielpreis > CONFIG.ZU_VIELE_TREFFER) {
      progress.fullPages = Math.max(progress.fullPages || 0, CONFIG.BROAD_FILTER_HITS);
      progress.zuVieleTreffer = unterZielpreis;
    }
    // Gewinn-Bremse (25.09.2026): Der Zielpreis wurde vor dem Lauf gesetzt.
    // Was der Markt JETZT verlangt, steht in dieser Antwort - also gleich hier
    // nachrechnen. Nur bei Sofortkauf: Laufende Auktionen stehen noch auf
    // kleinen Geboten und sagen nichts ueber den Marktpreis aus.
    if (!bidMode) gewinnPruefen(auctions, target, run, progress);

    // Fuer den Hinweis "kein Angebot bis ...": Gesehen ist jedes passende
    // Angebot, das bis zum Zielpreis zu haben waere - per Sofortkauf oder im
    // Gebotsmodus per Gebot. Frueher zaehlten dort nur Auktionen in der
    // letzten Minute. Laufende Auktionen mit kleinem Gebot fehlten, und der
    // Hinweis behauptete "kein Angebot", obwohl EA welche geliefert hatte.
    const gesehen = auctions.filter((auction) => isTarget(auction, target) || (bidMode &&
      isMatch(auction, target.playerId, target.rating, target.rarity) &&
      vergleichspreis(auction) > 0 && vergleichspreis(auction) <= target.maxPrice)).length;
    run.trefferGesehen = (run.trefferGesehen || 0) + gesehen;

    // Dasselbe Beweisprinzip fuer den Rating-Bereich: Haette EA ovrMin/ovrMax
    // angewandt, duerfte keine andere Version in der Antwort stehen.
    // Muss VOR lastSearch stehen - dort wird der Wert mit abgelegt.
    let falschesRating = 0;
    if (target.rating > 0) {
      for (const auction of auctions) {
        const r = toInt(auction.itemData && auction.itemData.rating);
        if (r > 0 && r !== target.rating) falschesRating += 1;
      }
      // Erst eine Antwort MIT Angeboten ist ein Beleg. Eine leere Seite sagt
      // nichts darueber, ob EA den Bereich beachtet - frueher stand dann
      // trotzdem "EA beachtet den Rating-Bereich" im Protokoll.
      if (run.ratingFilterOk === undefined && auctions.length > 0) {
        run.ratingFilterOk = falschesRating === 0;
        log(run.ratingFilterOk
          ? "EA beachtet den Rating-Bereich (" + ENDPOINTS.ovrMinParam + "/" + ENDPOINTS.ovrMaxParam + ")."
          : "EA ignoriert den Rating-Bereich: " + falschesRating + " von " + auctions.length + " Treffern haben ein anderes Rating.");
      }
    }

    // Was EA auf die letzte Suche wirklich geantwortet hat. Damit laesst sich
    // im Popup nachlesen, ob der Preisfilter greift - statt es zu vermuten.
    const preise = auctions.map(vergleichspreis).filter((p) => p > 0);
    run.lastSearch = {
      at: Date.now(),
      player: playerLabel(target),
      maxPrice: target.maxPrice,
      basis: bidMode ? "Gebot" : "Sofortkauf",
      count: auctions.length,
      under: unterZielpreis,
      over: ueberZielpreis,
      rating: target.rating || 0,
      ratingOff: falschesRating,
      min: preise.length ? Math.min(...preise) : 0,
      max: preise.length ? Math.max(...preise) : 0
    };

    // Beweisstueck: Haette EA den Preisfilter angewandt, koennte kein Angebot
    // ueber dem Zielpreis zurueckkommen - egal in welchem Modus, seit oben das
    // passende Feld verglichen wird.
    if (ueberZielpreis > 0 && !run.priceFilterWarned) {
      run.priceFilterWarned = true;
      warn(
        "EA liefert " + ueberZielpreis + " von " + auctions.length + " Angeboten über dem Zielpreis (" +
        target.maxPrice + "). Der Preisfilter in der Such-URL (" + ENDPOINTS.maxBuyParam +
        ") wirkt offenbar nicht – es wird clientseitig gefiltert."
      );
    }

    // Kostet nichts: Die Angebote sind schon da, es geht keine Anfrage raus.
    filterWache(target, run, auctions, jitterMin);

    return auctions;
  }

  // ---------------------------------------------------------------------------
  // Filter-Wache (25.09.2026): den laufenden Live-Filter aus den eigenen
  // Suchen nachziehen - ohne eine einzige zusaetzliche Anfrage.
  //
  // Wichtig, weil es leicht falsch verstanden wird: Eine Laufsuche fragt EA
  // nur BIS ZUM KAUFPREIS (searchPath bekommt target.maxPrice als
  // Hoechstpreis). Was teurer ist, steht nie in der Antwort. Der
  // VERKAUFSPREIS laesst sich daraus deshalb nicht neu messen - dafuer bleibt
  // der Preis-Check zustaendig. Messbar ist nur das untere Ende des Marktes.
  // Daraus werden genau zwei Entscheidungen:
  //
  // 1. Steht ein passendes Angebot UNTER unserem Kaufpreis mehrere Minuten
  //    unverkauft da, will der Markt diesen Preis nicht mehr. Dann wird der
  //    Filter beendet (Code "filter") - die Rotation nimmt den naechsten.
  // 2. Ist dort alles frisch, darf der Filter EINMAL weiterlaufen, statt nach
  //    15 Minuten zu sterben. Ein neuer Markt-Scan kostet sonst bis zu 16
  //    Suchen aus dem Tagesbudget.
  //
  // Gemessen wird nur auf Suchen OHNE wandernden Mindestpreis: Mit ihm faengt
  // die Antwort erst weiter oben an, die billigsten Angebote fehlen, und die
  // Messung waere schief.
  // ---------------------------------------------------------------------------
  function filterWache(target, run, auctions, jitterMin) {
    if (!target || !run || run.cfg.bidSniping) return;
    // FST-Modus: Der Ablauf liegt in liveBis (expiresAt ist dort 0). Die
    // Marktwache bleibt also fuer Live-Filter an - nur das Verlaengern entfaellt.
    if (!(Number(target.expiresAt) > 0) && !(STATE.fstModus === true && Number(target.liveBis) > 0)) return; // kein Live-Filter, nichts zu datieren
    if (jitterMin > 0) return;
    const progress = run.perTarget.get(target.key);
    if (!progress) return;
    const angebote = (auctions || [])
      .filter((a) => isTarget(a, target))
      .map((a) => ({ preis: bin(a), alterS: angebotsAlterS(a.expires) }))
      .filter((a) => a.preis > 0);
    const mitAlter = angebote.filter((a) => a.alterS !== null).length;
    // Gleiche Mindestmenge wie beim Preis-Check: ein paar Angebote ohne
    // Restzeit sind keine Messung.
    if (mitAlter < ALTER_MIN_ANGEBOTE || mitAlter < angebote.length * ALTER_MIN_ANTEIL) return;
    const r = preisNachAlter(angebote, STATE.preisMethode);
    // Nur die Regel "alt" zaehlt hier. "viele" bedeutet etwas anderes und hat
    // mit CONFIG.ZU_VIELE_TREFFER laengst seine eigene Bremse.
    const steht = r.roh > 0 && r.regel === "alt" && r.beweisMin >= CONFIG.FILTER_WACHE_ALT_MIN;
    progress.altStreak = steht ? (progress.altStreak || 0) + 1 : 0;
    // FST-Modus: FST hat diese Marktwache nicht. Sie stoppt dort nur, wenn der
    // Haken "Gewinn-Bremse" an ist (Geldschutz, kein Kontoschutz).
    if (progress.altStreak >= 2 && !(STATE.fstModus === true && !run.cfg.gewinnBremse)) {
      // Zwei Messungen hintereinander, damit ein einzelnes seltsames Angebot
      // den Filter nicht abwuergt.
      stop("Gestoppt: " + playerLabel(target) + " – ein Angebot für " + fmt(r.beweis) + " Coins steht seit " +
        r.beweisMin + " Minuten unverkauft unter unserem Kaufpreis (" + fmt(target.maxPrice) +
        "). Der Markt ist unter dem Filter weggerutscht.", "warn", false, "filter");
      return;
    }
    if (steht || progress.verlaengert) return;
    // Nur kurz vor Ablauf verlaengern: Dann ist die Messung frisch, wenn die
    // Uhr des Filters abläuft.
    const restMs = Number(target.expiresAt) - Date.now();
    if (restMs <= 0 || restMs > CONFIG.FILTER_WACHE_FRIST_MS) return;
    progress.verlaengert = true;
    target.expiresAt = Date.now() + CONFIG.FILTER_VERLAENGERUNG_MS;
    const text = playerLabel(target) + ": Unter dem Kaufpreis ist alles frisch – der Live-Filter läuft " +
      Math.round(CONFIG.FILTER_VERLAENGERUNG_MS / 60000) + " Minuten weiter. Einmalig, und es kostet keine Suche.";
    log(text);
    pushEvent("filter", text);
    // 27.09.2026: Die Verlaengerung muss auch in die Leiste. Dort haengt die
    // Rotation an der eigenen Filterkarte (Messzeit + 15 Minuten) und nicht an
    // target.expiresAt. Bisher suchte der Motor weiter, die Leiste hielt den
    // Filter fuer abgelaufen und beendete die Rotation mit "Kein frischer
    // Filter mehr uebrig" - mitten im laufenden Filter.
    //
    // Gemeldet wird NUR die neue Laufzeit, kein neuer Preis. Eine Laufsuche
    // fragt EA nur bis zum Kaufpreis ab (siehe den Kopf dieser Funktion) - aus
    // ihr laesst sich der Verkaufspreis nicht neu messen. Wuerden wir ihn
    // trotzdem neu berechnen, waere er zu niedrig und wuerde einen guten,
    // echt gemessenen Preis stillschweigend ersetzen.
    STATE.filterVerlaengert = { key: target.key, bis: target.expiresAt, angebote: mitAlter, at: Date.now() };
  }

  // Welche Felder liefert EA in den Suchtreffern wirklich mit?
  // Einmal je Sitzung festhalten. Kostet keine Anfrage - die Treffer sind
  // ohnehin da. Beantwortet zwei offene Fragen: Gibt es einen Marktdurchschnitt
  // (wie ihn FUT Simple Trader benutzt), und gibt es bidState/tradeState,
  // auf die sich die Gebotsabrechnung stuetzt?
  const FIELD_RE = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;

  function noteItemFields(auctions) {
    if (STATE.itemFields || !auctions.length) return;
    const auction = auctions[0];
    if (!auction || typeof auction !== "object") return;
    const namen = (obj, limit) => Object.keys(obj && typeof obj === "object" ? obj : {})
      .filter((k) => FIELD_RE.test(k))
      .slice(0, limit);
    STATE.itemFields = {
      at: Date.now(),
      auction: namen(auction, 40),
      item: namen(auction.itemData, 60)
    };
    log("Felder der EA-Suchtreffer:", STATE.itemFields);
  }

  // ---------------------------------------------------------------------------
  // Marktaktivitaet aus den LAUFSUCHEN (27.09.2026)
  //
  // Bisher wurde die Aktivitaet nur im Preis-Check gemessen: zwei
  // Marktaufnahmen hintereinander. Zwischen ihnen lagen 20 bis 45 Sekunden,
  // verlangt sind 60 (CONFIG.ACTIVITY_MIN_GAP_MS). Die Bedingung war damit
  // praktisch nie erfuellt. Folge: In der Kachel stand dauerhaft "noch
  // unbekannt", und die Abzeichen "Heiss" und "Ruhig" erschienen nie.
  //
  // Die Schwelle zu senken waere der falsche Weg: Nach drei Sekunden steht
  // fast immer noch alles da - "ruhig" waere dann kein Messwert, sondern ein
  // Zufall der Taktung. Gemessen wird deshalb dort, wo wirklich Zeit vergeht:
  // im laufenden Betrieb. Der Bot sucht denselben Spieler im Lauf immer
  // wieder. Die erste Aufnahme bleibt stehen, und verglichen wird sie mit der
  // ersten Suche, die mindestens eine Minute spaeter kommt. Das kostet KEINE
  // einzige zusaetzliche EA-Anfrage.
  //
  // Zwei Trefferlisten sind nur vergleichbar, wenn beide Suchen dasselbe
  // Preisfenster hatten. Der wandernde Mindest- und Hoechstpreis verschiebt es
  // aber bei jeder Suche. Verglichen wird darum nur der Bereich, den BEIDE
  // Suchen abgedeckt haben - sonst zaehlten Angebote als "weggekauft", die nur
  // aus dem Fenster gerutscht sind.
  const AKTIV_MIN_ANGEBOTE = 4; // darunter ist jede Quote Zufall

  function laufAktivitaet(run, target, auctions, vonPreis, bisPreis) {
    if (!run || !target || !Array.isArray(auctions)) return;
    if (!run.aktivBasis) run.aktivBasis = new Map();
    const jetzt = Date.now();
    const von = Number(vonPreis) > 0 ? Number(vonPreis) : 0;
    const bis = Number(bisPreis) > 0 ? Number(bisPreis) : 0;
    // tradeId -> Preis, nur die Angebote, die zu diesem Ziel passen.
    const ids = new Map();
    for (const a of auctions) {
      if (!isMatch(a, target.playerId, target.rating, target.rarity, target.chem)) continue;
      const preis = bin(a);
      if (preis > 0 && a.tradeId != null) ids.set(String(a.tradeId), preis);
    }
    const basis = run.aktivBasis.get(target.key);
    const abstand = basis ? jetzt - basis.at : 0;
    // Noch keine Grundaufnahme - oder die alte ist zu alt, um noch etwas zu
    // belegen. Dann faengt die Messung hier neu an.
    if (!basis || abstand > CONFIG.ACTIVITY_MAX_GAP_MS) {
      run.aktivBasis.set(target.key, { at: jetzt, von, bis, ids });
      return;
    }
    // Zu frueh: Die Grundaufnahme bleibt stehen, bis eine Minute vergangen ist.
    if (abstand < CONFIG.ACTIVITY_MIN_GAP_MS) return;
    // Nur der Preisbereich, den BEIDE Suchen abgedeckt haben.
    const unten = Math.max(von, basis.von);
    const deckel = [bis, basis.bis].filter((p) => p > 0);
    const oben = deckel.length ? Math.min(...deckel) : 0;
    const drin = (preis) => preis >= unten && (!(oben > 0) || preis <= oben);
    const vorher = Array.from(basis.ids.entries()).filter(([, preis]) => drin(preis)).map(([id]) => id);
    const nachher = new Set(Array.from(ids.entries()).filter(([, preis]) => drin(preis)).map(([id]) => id));
    run.aktivBasis.set(target.key, { at: jetzt, von, bis, ids });
    // Zu duenn: nichts behaupten. Die naechste Runde versucht es erneut.
    if (vorher.length < AKTIV_MIN_ANGEBOTE) return;
    const vorherIds = new Set(vorher);
    const weg = vorher.filter((id) => !nachher.has(id)).length;
    const neu = Array.from(nachher).filter((id) => !vorherIds.has(id)).length;
    const quote = weg / vorher.length;
    // Dieselben Stufen wie bisher im Preis-Check - damit die Leiste beide
    // Messungen gleich behandelt.
    const stufe = quote >= 0.25 ? "hoch" : quote >= 0.1 ? "normal" : "ruhig";
    pushEvent("search", "Markt " + playerLabel(target) + ": " + weg + " von " + vorher.length +
      " Angeboten weg in " + Math.round(abstand / 60000) + " Min. (" + stufe + ")");
    // Die Rohzahlen des Preis-Checks bleiben unberuehrt (27.09.2026).
    //
    // disappeared und appeared gehoeren zum Preis-Check: popup.js rechnet
    // daraus die geschaetzte Trefferquote, und zwar als disappeared geteilt
    // durch entry.sampleSize. Beide Zahlen stammen aus derselben Messung.
    //
    // Wuerde die Laufmessung disappeared ueberschreiben, kaeme der Zaehler
    // plotzlich aus dem Lauf und der Nenner weiter aus dem Preis-Check -
    // eine Zahl aus zwei verschiedenen Messungen, und niemand saehe es.
    // Darum eigene Namen fuer die Laufzahlen.
    aktivitaetSpeichern(target.key, {
      activity: stufe,
      messAbstandMs: abstand,
      turnoverRate: quote,
      laufWeg: weg,
      laufVon: vorher.length,
      laufNeu: neu
    });
  }

  // Das Ergebnis gehoert zur Karte, nicht zum Lauf: Die Leiste liest die
  // Aktivitaet aus dem letzten Preis-Eintrag (gemesseneAktivitaet in popup.js).
  // Darum wird genau dieser Eintrag ergaenzt - der gemessene Preis selbst
  // bleibt unangetastet.
  //
  // Gibt es zu dieser Karte noch keinen Preis-Check, wird weiter KEIN
  // Preis-Eintrag erfunden: ein Eintrag ohne Preis waere schlimmer als keiner.
  //
  // 28.09.2026: Aber die Messung selbst darf nicht mehr verloren gehen.
  // Frueher verschwand sie dann stillschweigend, und die Kachel "Konkurrenz"
  // blieb fuer immer auf "noch unbekannt" (Bilanz 27.09., Bruch 1 und 3).
  // Jede Laufmessung landet darum zusaetzlich in einem eigenen Logbuch
  // (aktivLog). Es traegt dieselben Feldnamen wie der Preis-Check
  // (sampleSize, appeared), damit popup.js beide Quellen gleich behandelt.
  // Hoechstens 200 Eintraege, damit der Speicher nicht waechst.
  const AKTIV_LOG_MAX = 200;
  function aktivitaetSpeichern(key, werte) {
    updateStorage("aktivLog", (current) => (Array.isArray(current) ? current : []).concat([{
      key,
      t: Date.now(),
      messAbstandMs: werte.messAbstandMs,
      turnoverRate: werte.turnoverRate,
      sampleSize: werte.laufVon,
      appeared: werte.laufNeu,
      activity: werte.activity
    }]).slice(-AKTIV_LOG_MAX));
    return updateStorage("priceHistory", (current) => {
      const all = current && typeof current === "object" ? current : {};
      const liste = Array.isArray(all[key]) ? all[key] : [];
      const letzter = liste.length ? liste[liste.length - 1] : null;
      if (!letzter) return all;
      Object.assign(letzter, werte, { aktivT: Date.now(), aktivQuelle: "lauf" });
      return all;
    });
  }

  // Welche Chemie beim Kauf verlangt wird (27.09.2026).
  //
  // Der Preis-Check trennt die Maerkte nach Chemie, sobald er sie erkennen
  // konnte (buildPriceEntry setzt chem und chemGefiltert). Genau diese Chemie
  // muss der Kauf dann auch treffen - sonst messen wir den einen Markt und
  // kaufen im anderen.
  //
  // Gelesen wird der gespeicherte Preis-Eintrag, EINMAL beim Start des Laufs.
  // Das kostet keine EA-Anfrage. Wurde nicht nach Chemie getrennt - weil EA das
  // Feld playStyle nicht mitgeschickt hat oder zu wenige Angebote dieselbe
  // Chemie hatten -, bleibt target.chem leer. Dann wird wie bisher jede Chemie
  // gekauft. Geraten wird nichts.
  async function zieleChemieLaden(run) {
    if (!run || !run.cfg || !Array.isArray(run.cfg.targets)) return;
    let verlauf = null;
    try {
      const { priceHistory } = await chrome.storage.local.get("priceHistory");
      verlauf = priceHistory && typeof priceHistory === "object" ? priceHistory : null;
    } catch (e) {
      verlauf = null;
    }
    if (!verlauf) return;
    for (const target of run.cfg.targets) {
      const liste = Array.isArray(verlauf[target.key]) ? verlauf[target.key] : [];
      const entry = liste.length ? liste[liste.length - 1] : null;
      // Nur ein Eintrag, der wirklich nach Chemie getrennt hat, darf etwas
      // verlangen. chemGefiltert !== true heisst: Es wurde gemischt gemessen.
      if (!entry || entry.chemGefiltert !== true) continue;
      const chem = Number(entry.chem);
      if (!Number.isFinite(chem) || chem < 0) continue;
      target.chem = Math.floor(chem);
      const text = playerLabel(target) + ": Es wird nur die gemessene Chemie gekauft (Stil " + target.chem + ").";
      log(text);
      pushEvent("filter", text);
    }
  }

  function isTarget(auction, target) {
    // target.chem kommt aus zieleChemieLaden und ist meist leer - dann prueft
    // isMatch die Chemie nicht (27.09.2026).
    return isMatch(auction, target.playerId, target.rating, target.rarity, target.chem) && bin(auction) <= target.maxPrice;
  }

  // --- Gewinn-Bremse (25.09.2026) ---------------------------------------
  //
  // FST stoppt, wenn der Gewinn weg ist (Z. 58282-58300, 58438-58450), holt
  // die Preisgrenzen dafuer aber von seinem Server. Das duerfen wir nicht,
  // also rechnen wir selbst - und zwar nur mit den Angeboten, die die
  // laufende Suche ohnehin geliefert hat. Das kostet 0 Anfragen.
  //
  // Der Zielpreis wurde VOR dem Lauf gesetzt. Faellt der Markt waehrend des
  // Laufs darunter, kaufte der Bot bisher weiter in den Verlust.
  const LEBEND_MIN_GRUPPE = 3; // so viele Angebote machen eine Preisgruppe
  const LEBEND_MIN_ANGEBOTE = 4; // bei weniger Angeboten wird nichts behauptet

  // Marktpreis aus einer einzelnen Suche. Nicht das billigste Angebot nehmen -
  // das ist genau der Fund, den wir jagen. Stattdessen die erste Preisgruppe,
  // in der mehrere Angebote dicht beieinander liegen. Gleiche Regel wie im
  // Preis-Check (siehe buildPriceEntry). 0 heisst: nicht messbar.
  function lebendMarkt(auctions, target) {
    const preise = auctions
      .filter((auction) => isMatch(auction, target.playerId, target.rating, target.rarity))
      .map((auction) => bin(auction))
      .filter((preis) => preis > 0)
      .sort((a, b) => a - b);
    if (preise.length < LEBEND_MIN_ANGEBOTE) return 0;
    for (let i = 0; i < preise.length; i++) {
      const ende = preise[i] * (1 + CONFIG.CHECK_CLUSTER_BAND);
      const gruppe = preise.slice(i).filter((preis) => preis <= ende);
      if (gruppe.length >= LEBEND_MIN_GRUPPE) return gruppe[Math.floor((gruppe.length - 1) / 2)];
    }
    return 0;
  }

  // Ist der Gewinn weg, steht hier der Grund im Klartext - sonst "".
  function gewinnWeg(target, run) {
    const progress = run.perTarget.get(target.key);
    return (progress && progress.gewinnWeg) || "";
  }

  // Nach jeder Suche pruefen, ob der Zielpreis noch Gewinn hergibt. Bleibt
  // vom gemessenen Marktpreis nach EAs Gebuehr nicht mehr uebrig als der
  // Zielpreis, waere jeder weitere Kauf ein Verlust.
  function gewinnPruefen(auctions, target, run, progress) {
    if (!progress || progress.gewinnWeg) return;
    const jetzt = lebendMarkt(auctions, target);
    if (!(jetzt > 0)) return; // zu wenige Angebote: lieber nichts behaupten
    progress.marktJetzt = jetzt;
    const erloes = Math.floor(jetzt * (1 - CONFIG.SALE_FEE));
    // Verglichen wird mit dem Preis, der wirklich zu zahlen waere - nicht mit
    // dem Zielpreis (25.09.2026).
    //
    // Der Zielpreis ist die OBERGRENZE des Nutzers, nicht der Kaufpreis. Wer
    // gegen ihn prueft, legt den Bot lahm: Bei Markt 900 und Obergrenze 1.000
    // waere sofort Schluss - obwohl ein Schnaeppchen fuer 500 noch 355 Coins
    // Gewinn braechte. Genau dafuer laeuft der Bot ja.
    //
    // Darum: Der billigste Treffer, den EA gerade zeigt, ist der Preis, den
    // der Bot zahlen wuerde. Bringt DER keinen Gewinn mehr, ist wirklich
    // Schluss. Zeigt EA nichts unter der Obergrenze, gilt die Obergrenze -
    // dann haette der Bot ohnehin nichts zu kaufen.
    const treffer = auctions
      .filter((auction) => isTarget(auction, target))
      .map((auction) => bin(auction))
      .filter((preis) => preis > 0);
    const zahlpreis = treffer.length ? Math.min(...treffer) : target.maxPrice;
    if (erloes > zahlpreis) return;
    // Haken "Gewinn-Bremse" aus (27.09.2026): Gemessen und angezeigt wird der
    // Marktpreis weiter (progress.marktJetzt steht schon oben) - nur gestoppt
    // wird nicht mehr. So haelt es FST: kaufen, ohne vorher nachzurechnen.
    if (run.cfg.gewinnBremse === false) return;
    progress.gewinnWeg = "Der Markt liegt jetzt bei " + fmt(jetzt) + " Coins. Nach EAs Gebühr bleiben davon " +
      fmt(erloes) + " Coins – das billigste passende Angebot kostet " + fmt(zahlpreis) + " Coins. Damit ist kein Gewinn mehr drin.";
    const text = "Spieler gestoppt: " + playerLabel(target) + " – " + progress.gewinnWeg;
    warn(text);
    setMessage(text, "warn");
    pushEvent("warn", text);
  }

  // Hilft beim Debuggen, wenn die Suche Angebote liefert, aber keins passt.
  function logMismatch(auctions, target) {
    if (Date.now() - STATE.lastMismatchLog < 30000) return;
    STATE.lastMismatchLog = Date.now();
    const sample = auctions.slice(0, 3).map((a) => ({
      assetId: a.itemData ? a.itemData.assetId : undefined,
      rating: a.itemData ? a.itemData.rating : undefined,
      buyNowPrice: a.buyNowPrice,
      tradeState: a.tradeState
    }));
    warn(auctions.length + " Angebote, aber keins passt (" + playerLabel(target) + ", max. " + target.maxPrice + "). Beispiele:", sample);
  }

  // Wohin ein gekaufter Spieler wandert. "keep" heisst: liegen lassen, dann
  // wird gar nichts verschoben.
  const AFTER_BUY_PILES = { club: "club", transfer: "trade" };

  // Verschiebt einen gekauften Spieler. Ergebnis: ok | doppelt | fehlgeschlagen
  async function sendToPile(itemId, pile, cardKey) {
    try {
      // Auch das Verschieben ist eine EA-Anfrage. Bis 22.09.2026 lief sie
      // ungezaehlt; jetzt hat sie ein eigenes Tageslimit.
      await reserveUsage("aktion", cardKey);
      const res = await api(ENDPOINTS.clubPath, {
        method: ENDPOINTS.clubMethod,
        body: JSON.stringify({ itemData: [{ id: String(itemId), pile: String(pile) }] })
      });
      if (!res.ok) {
        warn("Verschieben nach " + pile + ": HTTP " + res.status);
        return "fehlgeschlagen";
      }
      let data = null;
      try {
        data = await res.json();
      } catch (e) {}
      const item = data && Array.isArray(data.itemData) ? data.itemData[0] : null;
      if (item && item.success === false) {
        warn("Verschieben nach " + pile + " abgelehnt: " + (item.reason || "ohne Grund"));
        return /duplicate/i.test(String(item.reason || "")) ? "doppelt" : "fehlgeschlagen";
      }
      return "ok";
    } catch (e) {
      if (e instanceof HardStop) throw e;
      warn("Verschieben nach " + pile + ": " + e.message);
      return "fehlgeschlagen";
    }
  }

  // ---------------------------------------------------------------------------
  // "Gleich verkaufen": nach dem Kauf sofort einstellen (F2).
  //
  // Vorbild FST (Z. 58278-58327, 58411-58436): warten, dann
  // services.Item.list(Karte, Start, Sofort, 3600). Zwei Dinge machen wir
  // anders und besser:
  //  - FST vergisst beim Verlustschutz ein return und stellt trotzdem ein
  //    (Z. 58288-58292). Bei uns gibt es genau ein return, und ohne Gewinn
  //    geht die Karte nur auf die Transferliste.
  //  - FST holt die EA-Preisspanne mit einer eigenen Anfrage. Wir nehmen sie
  //    aus der Kaufantwort oder aus dem Preis-Check - das spart eine Anfrage.
  // ---------------------------------------------------------------------------

  // Verkaufspreis fuer eine gekaufte Karte. Kostet keine EA-Anfrage.
  //
  // Vier Quellen, in dieser Reihenfolge (27.09.2026):
  //  1. Der Festpreis aus den Optionen. Er veraltet nie - genau wie FSTs
  //     listBuyNowPrice (scripts.js Z. 59392-59404, 1594-1601), das der Nutzer
  //     dort selbst eintippt. Steht eine Zahl drin, gilt sie, wie bei FST.
  //  2. Der letzte Preis-Check, hoechstens 60 Minuten alt.
  //  3. Der Preis, den die Leiste beim Start mitgegeben hat.
  //  4. Das Preis-Gedaechtnis - der im Lauf gemessene Marktanker.
  //
  // Warum 1 und 4 neu sind: Vorher gab es nur 2 und 3. Beide veralten nach 60
  // Minuten, und der Preis-Check ist waehrend eines Laufs gesperrt. Ab der
  // zweiten Laufstunde stellte der Bot deshalb nichts mehr ein - jeder Kauf
  // landete nur auf der Transferliste.
  async function listPreisFuer(target) {
    // Festpreis je Filter zuerst (28.09.2026). Vorbild FST: getListPrice
    // (scripts.js Z. 59392-59404) nimmt erst den Preis des einzelnen
    // Profils, dann den globalen listBuyNowPrice. Beide veralten nie.
    // toInt(fehlt) ist 0, und 0 heisst hier ausdruecklich "kein eigener
    // Preis" - dann geht es eine Stufe tiefer weiter.
    const festFilter = toInt(target && target.listFestpreis);
    if (festFilter >= CONFIG.LIST_MIN_PRICE) {
      return { preis: festFilter, quelle: "festpreis-filter", alterMs: 0, eaMin: 0, eaMax: 0 };
    }
    // Der globale Festpreis steht danach und veraltet auch nie - wie bei FST.
    const fest = toInt(STATE.listFestpreis);
    if (fest >= CONFIG.LIST_MIN_PRICE) {
      return { preis: fest, quelle: "festpreis", alterMs: 0, eaMin: 0, eaMax: 0 };
    }
    let entry = null;
    try {
      const { priceHistory } = await chrome.storage.local.get("priceHistory");
      const liste = priceHistory && Array.isArray(priceHistory[target.key]) ? priceHistory[target.key] : [];
      entry = liste.length ? liste[liste.length - 1] : null;
    } catch (e) {
      entry = null;
    }
    const jetzt = Date.now();
    if (entry && Number(entry.market) > 0 && jetzt - Number(entry.t) <= CONFIG.LIST_PRICE_MAX_AGE_MS) {
      const vp = verkaufsPreisAusEintrag(entry, STATE.preisMethode);
      return {
        preis: vp.preis,
        quelle: vp.quelle,
        alterMs: jetzt - Number(entry.t),
        eaMin: plausiblePrice(entry.eaMin),
        eaMax: plausiblePrice(entry.eaMax)
      };
    }
    // Ruecklage: der Preis, den die Leiste beim Start mitgegeben hat - aber
    // nur, wenn bekannt ist, wann er gemessen wurde.
    const mitAlter = toInt(target.salePriceAt);
    if (toInt(target.salePrice) > 0 && mitAlter > 0 && jetzt - mitAlter <= CONFIG.LIST_PRICE_MAX_AGE_MS) {
      return { preis: toInt(target.salePrice), quelle: "mitgebracht", alterMs: jetzt - mitAlter, eaMin: 0, eaMax: 0 };
    }
    // Zweite Chance - aber nur, wenn der Nutzer sie ausdruecklich erlaubt hat
    // (27.09.2026, Optionen > Verkaeufe).
    //
    // Warum hier nichts gerechnet wird: Aus den Laufsuchen laesst sich der
    // Verkaufspreis NICHT neu bestimmen. Eine Laufsuche fragt EA nur bis zum
    // Zielpreis (siehe sucheMitStundenPause). Alles, was sie zeigt, liegt also
    // unter unserem Kaufpreis - und damit weit unter dem Verkaufspreis. Ein
    // daraus gerechneter "Marktpreis" waere immer zu niedrig, und der Bot
    // wuerde seine Karten verschenken. Ueber das Preisniveau OBERHALB des
    // Zielpreises liefert eine Laufsuche keine einzige Zahl.
    //
    // Darum wird der gemessene Preis einfach weiter benutzt - wie FSTs eingetippter
    // Preis, der nie veraltet (scripts.js Z. 59392-59404). Der Verlustschutz in
    // gleichEinstellen bleibt: Bringt der Preis nach EAs Gebuehr nicht mehr als
    // der Kaufpreis, wird nicht eingestellt. Und das Alter steht im Protokoll.
    if (STATE.preisLangeNutzen && entry && Number(entry.market) > 0 &&
        jetzt - Number(entry.t) <= CONFIG.LIST_PRICE_LANG_MAX_AGE_MS) {
      const vpAlt = verkaufsPreisAusEintrag(entry, STATE.preisMethode);
      return {
        preis: vpAlt.preis,
        quelle: vpAlt.quelle,
        alterMs: jetzt - Number(entry.t),
        eaMin: plausiblePrice(entry.eaMin),
        eaMax: plausiblePrice(entry.eaMax)
      };
    }
    const alt = entry ? " Der letzte Preis-Check ist " + Math.round((jetzt - Number(entry.t)) / 60000) + " Minuten alt." : " Es gibt noch keinen Preis-Check.";
    // Letzte Quelle: der im Lauf gemessene Marktanker (27.09.2026). Kostet
    // keine Anfrage und ist auch nach acht Stunden Laufzeit noch frisch.
    const gemessen = await gedaechtnisPreis(target.key);
    if (gemessen) return gemessen;
    // Die Grenze im Text muss die sein, die wirklich gilt (27.09.2026).
    // Sonst liest jemand mit gesetztem Haken "höchstens 60 Minuten alt",
    // obwohl bei ihm 12 Stunden gelten - und sucht den Fehler dort, wo
    // keiner ist.
    const grenzeText = STATE.preisLangeNutzen ? "höchstens 12 Stunden alt" : "höchstens 60 Minuten alt";
    return { fehler: "Kein frischer Verkaufspreis (" + grenzeText + ")." + alt +
      (STATE.preisLangeNutzen ? "" : " In den Optionen unter „Verkäufe“ kannst du erlauben, einen älteren Preis weiter zu nutzen.") };
  }

  // Stellt eine gekaufte Karte ein. Gibt { ok, ... } zurueck und wirft nur
  // HardStop - ein abgelehntes Einstellen beendet den Lauf also nicht.
  async function gleichEinstellen(itemId, target, kaufPreis, grenzenAusKauf) {
    if (VERKAUF.laeuft) return { ok: false, grund: "Der Verkaufs-Helfer arbeitet gerade." };
    const platz = platzProblem({ afterBuy: "list" });
    if (platz) return { ok: false, grund: platz };
    const p = await listPreisFuer(target);
    if (p.fehler) return { ok: false, grund: p.fehler };
    // Die EA-Preisspanne kommt aus der Kaufantwort, sonst aus dem Preis-Check.
    let eaMin = plausiblePrice(grenzenAusKauf && grenzenAusKauf.marketDataMinPrice) || p.eaMin || 0;
    let eaMax = plausiblePrice(grenzenAusKauf && grenzenAusKauf.marketDataMaxPrice) || p.eaMax || 0;
    // Fehlt beides, noch die Web App fragen (27.09.2026).
    //
    // Der Fall tritt auf, wenn der Verkaufspreis "mitgebracht" ist (oben in
    // listPreisFuer stehen eaMin und eaMax dann fest auf 0). Bisher stellte
    // der Bot dann ohne jede Grenze ein. Lag der Preis ausserhalb von EAs
    // Spanne, lehnte EA ab: die Karte blieb unverkauft auf der Transferliste
    // liegen, und im Protokoll stand nur "EA hat das Einstellen abgelehnt".
    //
    // Vorbild FST (scripts.js Z. 1660): dort wird zuerst die Karte selbst
    // gefragt (hasPriceLimits) und nur im Notfall eine echte EA-Anfrage
    // nachgeschoben (requestMarketData). Wir machen NUR den kostenlosen
    // ersten Schritt - die Spanne liegt meist schon im Speicher der Web App.
    // Darum steht hier kein reserveUsage: es geht nichts an EA hinaus.
    //
    // Kein stiller Verlust: Kommt keine Antwort oder eine unplausible, bleibt
    // alles wie bisher. Erfunden wird nichts.
    if (!eaMin && !eaMax) {
      const spanne = await seitenFrage("preisgrenzen?", { itemId: String(itemId) }, 2500);
      if (spanne && spanne.gefunden === true) {
        const min = plausiblePrice(spanne.min);
        const max = plausiblePrice(spanne.max);
        // Widersprueche wegwerfen statt damit rechnen - wie bei der Suche.
        if (!(min && max && min > max)) {
          eaMin = min;
          eaMax = max;
          if (min || max) log("EA-Preisspanne aus dem Speicher der Web App: " + fmt(min) + " bis " + fmt(max) + " Coins.");
        }
      }
    }
    let sofort = roundDownToStep(p.preis);
    if (eaMax && sofort > eaMax) sofort = roundDownToStep(eaMax);
    if (eaMin && sofort < eaMin) sofort = eaMin;
    if (!(sofort >= CONFIG.LIST_MIN_PRICE)) return { ok: false, grund: "Verkaufspreis zu niedrig (" + fmt(sofort) + " Coins)." };
    let start = roundDownToStep(sofort - 1);
    if (eaMin && start < eaMin) start = eaMin;
    // Liegt der Preis genau auf dem EA-Minimum, darf das Startgebot gleich
    // hoch sein - tiefer geht es dort nicht.
    if (!(start > 0) || start > sofort) return { ok: false, grund: "Für " + fmt(sofort) + " Coins gibt es kein gültiges Startgebot." };
    // Verlustschutz. Hier steht ein echtes return - anders als bei FST.
    const netto = Math.floor(sofort * (1 - CONFIG.SALE_FEE));
    if (!(netto > kaufPreis)) {
      return { ok: false, grund: "Kein Gewinn: " + fmt(sofort) + " Coins bringen nach 5 % Gebühr nur " + fmt(netto) + ", gekauft für " + fmt(kaufPreis) + "." };
    }
    await sleep(randomBetween(CONFIG.LIST_STEP_MIN_MS, CONFIG.LIST_STEP_MAX_MS));
    await reserveUsage("aktion", target.key);
    let res;
    try {
      res = await api(ENDPOINTS.listPath, {
        method: ENDPOINTS.listMethod,
        body: JSON.stringify({ itemData: { id: String(itemId) }, startingBid: start, buyNowPrice: sofort, duration: VERKAUF_DAUER_S })
      });
    } catch (e) {
      if (e instanceof HardStop) throw e;
      return { ok: false, grund: "Einstellen ohne klare Antwort: " + e.message };
    }
    if (!res.ok) return { ok: false, grund: "EA hat das Einstellen abgelehnt (HTTP " + res.status + ")." };
    return { ok: true, sofort, start, quelle: p.quelle, alterMin: Math.round(p.alterMs / 60000) };
  }

  // ---------------------------------------------------------------------------
  // Offene Gebote abrechnen.
  // EA haelt die gebotenen Coins fest, solange die Auktion laeuft. Der Betrag
  // bleibt deshalb reserviert, bis ein Suchtreffer den Ausgang verraet. Ohne
  // diese Abrechnung wuechse bidCommitted immer weiter und der Lauf endete mit
  // "Restbudget reicht nicht", obwohl gar nichts ausgegeben wurde.
  // Die Felder tradeState und bidState sind wie der Rest der EA-Anbindung nicht
  // verifiziert: fehlen sie, greift der zeitbasierte Fallback in expireBids.
  // ---------------------------------------------------------------------------

  function noteOpenBid(run, auction, target, amount) {
    const left = secondsLeft(auction);
    run.openBids.set(String(auction.tradeId), {
      amount,
      key: target.key,
      playerId: target.playerId,
      playerName: target.playerName,
      rating: toInt(auction.itemData && auction.itemData.rating) || target.rating || 0,
      salePrice: target.salePrice || 0,
      placedAt: Date.now(),
      expiresAt: Number.isFinite(left) ? Date.now() + left * 1000 : 0
    });
  }

  // "won" | "lost" | "outbid" | null (noch offen, wir fuehren)
  // "outbid" heisst: ueberboten, aber die Auktion laeuft noch. EA gibt die
  // Coins sofort wieder frei, und der Bot darf erneut bieten, solange der
  // naechste Gebotsschritt noch unter dem Zielpreis liegt.
  function bidOutcome(auction, open) {
    const state = String(auction.tradeState || "").toLowerCase();
    const bidState = String(auction.bidState || "").toLowerCase();
    const closed = Boolean(state) && state !== "active";
    const overtaken = bidState === "outbid" || currentBid(auction) > open.amount;
    if (closed) return overtaken || bidState !== "highest" ? "lost" : "won";
    return overtaken ? "outbid" : null;
  }

  function releaseBid(run, tradeId, open, outcome) {
    if (outcome !== "won" && outcome !== "lost" && outcome !== "outbid") {
      // Kein Ausgang erkennbar. Die Coins bleiben gebunden und zaehlen in jeder
      // Budgetpruefung weiter mit - bei einem doch gewonnenen Gebot waere das
      // Budget sonst ueberschritten. Frei wird der Betrag erst, wenn ein
      // Suchtreffer oder die Beobachtungsliste verloren/ueberboten bestaetigt.
      run.openBids.delete(tradeId);
      if (!run.unclearBids) run.unclearBids = new Map();
      if (run.unclearBids.has(tradeId)) return;
      run.unclearBids.set(tradeId, open);
      run.stats.bidsUnconfirmed += 1;
      warn("Gebot ohne erkennbaren Ausgang: " + open.playerName + " (" + open.amount + " Coins). Die Coins zählen weiter als ausgegeben. Bitte in der Web App prüfen.");
      return;
    }

    run.openBids.delete(tradeId);
    // Ein vorher unklares Gebot ist jetzt geklaert.
    if (run.unclearBids && run.unclearBids.delete(tradeId)) {
      run.stats.bidsUnconfirmed = Math.max(0, run.stats.bidsUnconfirmed - 1);
    }
    const progress = run.perTarget.get(open.key);
    run.stats.bidCommitted = Math.max(0, run.stats.bidCommitted - open.amount);
    if (progress) progress.bidCommitted = Math.max(0, (progress.bidCommitted || 0) - open.amount);

    if (outcome === "won") {
      run.stats.bidsWon += 1;
      run.stats.spent += open.amount;
      if (progress) progress.spent = (progress.spent || 0) + open.amount;
      const text = "Auktion gewonnen: " + open.playerName + " für " + fmt(open.amount) + " Coins.";
      pushEvent("won", text);
      log(text);
      notify(text, "kauf");
      tonSpielen("kauf");
      // Der Kauf gehoert in den Verlauf, auch wenn er ueber ein Gebot lief.
      logPurchase({ t: Date.now(), playerId: open.playerId, playerName: open.playerName, rating: open.rating, price: open.amount, tradeId, club: "", salePrice: open.salePrice || 0 });
      return;
    }

    if (outcome === "outbid") {
      // Kein Verlust: Die Auktion laeuft weiter, die Coins sind wieder frei,
      // und der Bot kann im Endfenster erneut bieten.
      run.stats.bidsOutbid += 1;
      pushEvent("outbid", "Überboten bei " + open.playerName + " (" + fmt(open.amount) + " Coins).");
      log("Überboten: " + open.playerName + ", " + fmt(open.amount) + " Coins wieder frei.");
      return;
    }

    run.stats.bidsLost += 1;
    pushEvent("lost", "Auktion verloren: " + open.playerName + ".");
    log("Auktion verloren: " + open.playerName + ", " + fmt(open.amount) + " Coins wieder frei.");
  }

  // Offenes oder noch ungeklaertes Gebot zu einer Auktion.
  function findBid(run, tradeId) {
    return run.openBids.get(tradeId) || (run.unclearBids ? run.unclearBids.get(tradeId) : undefined);
  }

  function unclearBidTotal(run) {
    let total = 0;
    if (run.unclearBids) for (const open of run.unclearBids.values()) total += open.amount;
    return total;
  }

  // Aus den Suchtreffern, die der Bot ohnehin abruft – keine zusaetzliche Anfrage.
  function settleBids(run, auctions) {
    if (!run.openBids.size && !(run.unclearBids && run.unclearBids.size)) return;
    for (const auction of auctions) {
      if (!auction || auction.tradeId == null) continue;
      const tradeId = String(auction.tradeId);
      const open = findBid(run, tradeId);
      if (!open) continue;
      const outcome = bidOutcome(auction, open);
      if (outcome) releaseBid(run, tradeId, open, outcome);
    }
  }

  // ---------------------------------------------------------------------------
  // Beobachtungsliste: klaert, was aus einem Gebot geworden ist.
  // Suchtreffer koennen das nicht - eine gewonnene Auktion steht nicht mehr im
  // Transfermarkt. Ohne diese Abfrage landet jeder Zuschlag im Zeitfallback und
  // taucht weder im Kauflog noch in den Ausgaben auf.
  // ---------------------------------------------------------------------------

  const WATCHLIST = { pending: null, nextId: 1, resolve: null, lastAt: 0 };

  // auffrischen = true: die Seite frischt die Auktionen vorher auf und liest
  // noch einmal. Das sind zwei weitere EA-Anfragen - der Aufrufer muss sie
  // vorher gebucht haben (25.09.2026).
  function requestWatchlist(auffrischen) {
    if (WATCHLIST.pending) return WATCHLIST.pending;
    const requestId = WATCHLIST.nextId++;
    WATCHLIST.pending = new Promise((resolve) => {
      let done = false;
      const finish = (items) => {
        if (done) return;
        done = true;
        WATCHLIST.pending = null;
        WATCHLIST.resolve = null;
        WATCHLIST.lastAt = Date.now();
        resolve(items);
      };
      WATCHLIST.resolve = (id, items) => {
        if (id === requestId) finish(items);
      };
      setTimeout(() => finish(null), CONFIG.WATCHLIST_TIMEOUT_MS);
      window.postMessage({ __ownbot: "watchlist?", requestId, auffrischen: auffrischen === true }, window.location.origin);
    });
    return WATCHLIST.pending;
  }

  // Die Liste kommt aus der Seite und wird deshalb hart geprueft.
  function acceptWatchlist(raw) {
    if (!raw || typeof raw !== "object") return;
    const id = toInt(raw.requestId);
    if (!Number.isFinite(id) || !WATCHLIST.resolve) return;
    if (!Array.isArray(raw.items)) {
      WATCHLIST.resolve(id, null);
      return;
    }
    const items = [];
    for (const entry of raw.items) {
      if (items.length >= 200) break;
      if (!entry || typeof entry !== "object") continue;
      const tradeId = str(entry.tradeId, 32);
      if (!tradeId) continue;
      // EAs eigene Ja/Nein-Antworten durchreichen (25.09.2026). null heisst
      // "EA sagt nichts dazu" - dann wird spaeter NICHT aufgeraeumt, statt zu
      // raten. Kein stiller Verlust: der Wert geht nicht verloren, er bleibt
      // nur unbeantwortet.
      const jaNein = (v) => (v === true ? true : v === false ? false : null);
      items.push({
        tradeId,
        tradeState: str(entry.tradeState, 32).toLowerCase(),
        bidState: str(entry.bidState, 32).toLowerCase(),
        currentBid: Math.max(0, toInt(entry.currentBid) || 0),
        itemId: str(entry.itemId, 32),
        abgelaufen: jaNein(entry.abgelaufen),
        beendet: jaNein(entry.beendet),
        gewonnen: jaNein(entry.gewonnen)
      });
    }
    WATCHLIST.resolve(id, items);
  }

  function applyWatchlist(run, items) {
    for (const entry of items) {
      const open = findBid(run, entry.tradeId);
      if (!open) continue;
      const closed = Boolean(entry.tradeState) && entry.tradeState !== "active";
      const overtaken = entry.bidState === "outbid" || entry.currentBid > open.amount;
      if (closed) releaseBid(run, entry.tradeId, open, overtaken || entry.bidState !== "highest" ? "lost" : "won");
      else if (overtaken) releaseBid(run, entry.tradeId, open, "outbid");
    }
  }

  // Widerspruch erkennen: unsere Uhr sagt "vorbei", EAs Antwort sagt "laeuft".
  // Genau dafuer frischt FST die Auktionen auf (scripts.js Z. 46741). Nur in
  // diesem Fall lohnt eine zweite Runde - sonst waeren es dreimal so viele
  // Anfragen wie heute (25.09.2026).
  function watchlistZweifel(run, items, now) {
    for (const entry of items) {
      if (entry.tradeState && entry.tradeState !== "active") continue;
      const open = findBid(run, entry.tradeId);
      if (open && open.expiresAt && now >= open.expiresAt + CONFIG.BID_SETTLE_GRACE_S * 1000) return true;
    }
    return false;
  }

  // Erledigte Karten von EAs Beobachtungsliste nehmen (25.09.2026).
  // Die Liste hat eine feste Obergrenze. Ist sie voll, lehnt EA jedes weitere
  // Gebot ab, und lauter abgelehnte Anfragen fuehren geradewegs in eine
  // Sperre. Gewonnene Karten bleiben liegen - die gehoeren uns.
  async function watchlistRaeumen(run, items) {
    const jetzt = Date.now();
    if (run.watchlistRaeumAt && jetzt - run.watchlistRaeumAt < CONFIG.WATCHLIST_CLEAN_GAP_MS) return;
    const ids = [];
    for (const entry of items) {
      // Nur was EA selbst so nennt. Sagt EA nichts (null), bleibt die Karte
      // liegen: lieber eine erledigte Karte zu viel auf der Liste als eine
      // gewonnene versehentlich weg.
      const erledigt = entry.abgelaufen === true || (entry.beendet === true && entry.gewonnen === false);
      if (!erledigt || !entry.tradeId) continue;
      ids.push(entry.tradeId);
      if (ids.length >= 50) break;
    }
    if (!ids.length) return;
    // Das Abraeumen ist eine echte EA-Anfrage und wird deshalb gebucht.
    try {
      await reserveUsage("aktion");
    } catch (e) {
      if (e instanceof HardStop) return;
      throw e;
    }
    run.watchlistRaeumAt = jetzt;
    // Pause wie bei FST (Z. 46785-46793), damit zwei EA-Anfragen nicht
    // unmittelbar hintereinander rausgehen.
    await sleep(1010);
    const antwort = await seitenFrage("watchlistAufraeumen?", { tradeIds: ids }, 8000);
    if (!antwort || antwort.ok !== true) {
      warn("Beobachtungsliste aufräumen hat nicht geklappt" + (antwort && antwort.grund ? " (" + antwort.grund + ")" : "") + ".");
      return;
    }
    log("Beobachtungsliste aufgeräumt: " + ids.length + " erledigte Auktionen entfernt.");
  }

  // schluss = true: letzte Pruefung nach dem Lauf, dann auch fuer ungeklaerte Gebote.
  async function settleViaWatchlist(run, schluss) {
    const unklar = schluss && run.unclearBids ? run.unclearBids.size : 0;
    if (!run.openBids.size && !unklar) return;
    const now = Date.now();
    if (now - WATCHLIST.lastAt < CONFIG.WATCHLIST_MIN_GAP_MS) return;
    // Nur fragen, wenn wirklich ein Gebot auf seinen Ausgang wartet.
    let faellig = unklar > 0;
    for (const open of run.openBids.values()) {
      if (open.expiresAt && now >= open.expiresAt) {
        faellig = true;
        break;
      }
    }
    if (!faellig) return;
    // Die Abfrage ist eine echte EA-Anfrage. Ist das Limit erschoepft, wird
    // nicht gefragt - dann greift spaeter der Zeitfallback.
    try {
      await reserveUsage("search");
    } catch (e) {
      if (e instanceof HardStop) return;
      throw e;
    }
    let items = await requestWatchlist(false);
    if (!items) {
      warn("Beobachtungsliste nicht erreichbar. Gebote werden nach Ablauf geschätzt.");
      return;
    }
    // Nur im Zweifelsfall noch einmal, dafuer mit aufgefrischten Auktionen.
    // Das kostet zwei weitere EA-Anfragen (Auffrischen und zweites Lesen);
    // beide werden vorher gebucht, und das hoechstens einmal je Lauf.
    if (!run.watchlistFrischAt && watchlistZweifel(run, items, now)) {
      let bezahlt = true;
      for (let i = 0; i < 2 && bezahlt; i++) {
        try {
          await reserveUsage("aktion");
        } catch (e) {
          if (!(e instanceof HardStop)) throw e;
          bezahlt = false;
        }
      }
      if (bezahlt) {
        run.watchlistFrischAt = Date.now();
        const frisch = await requestWatchlist(true);
        // Kein stiller Verlust: kommt nichts, gilt der erste Stand weiter.
        if (frisch) items = frisch;
      }
    }
    applyWatchlist(run, items);
    await watchlistRaeumen(run, items);
  }

  function expireBids(run) {
    if (!run.openBids.size) return;
    const now = Date.now();
    for (const [tradeId, open] of Array.from(run.openBids)) {
      const deadline = open.expiresAt
        ? open.expiresAt + CONFIG.BID_SETTLE_GRACE_S * 1000
        : open.placedAt + CONFIG.BID_MAX_OPEN_MIN * 60000;
      if (now >= deadline) releaseBid(run, tradeId, open, "unknown");
    }
  }

  function openBidTotal(run) {
    let total = 0;
    for (const open of run.openBids.values()) total += open.amount;
    return total;
  }

  let transactionPending = false;

  // Wie oft haben wir auf diese eine Auktion schon geboten? Begrenzt den
  // Schlagabtausch, damit ein Bietgefecht nicht das Tageslimit auffrisst.
  function bidAttempts(run, tradeId) {
    return run.bidAttempts ? run.bidAttempts.get(tradeId) || 0 : 0;
  }

  function bidCap(run) {
    return Number(run.cfg.maxBidsPerAuction) || 4;
  }

  function canTransact(target, run, amount) {
    if (!isCurrent(run.token) || STATE.run !== run) return false;
    if (!Number.isFinite(amount) || amount <= 0 || amount > target.maxPrice) return false;
    if (target.expiresAt && target.expiresAt <= Date.now()) return false;
    if (Date.now() - run.startedAt >= (run.cfg.timeLimitMin || 300) * 60000) return false;
    const stats = run.stats;
    const progress = run.perTarget.get(target.key);
    if (!progress || stats.bought + stats.bids >= run.cfg.maxBuys) return false;
    if (cardCount(target.key) >= CONFIG.CARD_LIMIT_DAY && STATE.fstModus !== true) return false;
    if (stats.spent + stats.bidCommitted + amount > run.cfg.budget) return false;
    // Zweite Grenze je Filter (25.09.2026): Kaufversuche, auch gescheiterte.
    if ((progress.anfragen || 0) >= run.cfg.filterAnfrageLimit) return false;
    if (progress.bought + progress.bids >= run.cfg.filterBuyLimit) return false;
    if (run.cfg.filterSpendLimit > 0 && progress.spent + progress.bidCommitted + amount > run.cfg.filterSpendLimit) return false;
    return true;
  }

  async function transact(auction, target, run, bidding) {
    const tradeId = String(auction.tradeId);
    const amount = bidding ? nextBid(auction) : bin(auction);
    if (transactionPending || STATE.seen.has(tradeId)) return;
    // Auf eine Auktion, auf die wir bieten, wird nicht zusaetzlich sofortgekauft.
    // Umgekehrt sperrt ein frueheres Gebot das Nachbieten aber nicht mehr:
    // ueberboten zu werden heisst nur, dass wir noch einmal dran sind.
    if (!bidding && STATE.seen.has("bid:" + tradeId)) return;
    if (bidding && bidAttempts(run, tradeId) >= bidCap(run)) return;
    if (!canTransact(target, run, amount)) return;
    transactionPending = true;
    try {
      // Count attempted requests before sending, including bids and failures.
      await reserveUsage("buy", target.key);
      // Gleiche Stelle, gleicher Zeitpunkt wie der Kontoschutz (25.09.2026):
      // Hier zaehlt der Filter seinen Versuch mit, ob er gleich klappt oder
      // nicht. Sofortkauf und Gebot laufen beide hier durch.
      const versuchProgress = run.perTarget.get(target.key);
      if (versuchProgress) versuchProgress.anfragen = (versuchProgress.anfragen || 0) + 1;
      if (!canTransact(target, run, amount)) return;
      return await (bidding ? executeBid(auction, target, run) : executeBuy(auction, target, run));
    } finally {
      transactionPending = false;
    }
  }

  const buy = (auction, target, run) => transact(auction, target, run, false);
  const placeBid = (auction, target, run) => transact(auction, target, run, true);

  async function executeBuy(auction, target, run) {
    const tradeId = String(auction.tradeId);
    const price = bin(auction);
    if (STATE.seen.has(tradeId)) return;
    remember(tradeId);

    // Reaktionszeit vor dem Kauf (25.09.2026 auf Wunsch des Nutzers
    // umgestellt).
    //
    // Bisher wartete der Bot hier 180 bis 350 Millisekunden, damit der Kauf
    // aussieht wie ein Klick und nicht wie eine Maschine. FUT Simple Trader
    // wartet an dieser Stelle gar nicht (scripts.js Z. 58390-58408) und ist
    // damit schneller am Schnaeppchen. Der Nutzer hat ausdruecklich
    // entschieden, es genauso zu machen - auch mit dem Risiko einer Sperre.
    //
    // Was auf dem Spiel steht, in Zahlen: Genau bei zwei Kaeufen pro Sekunde
    // kam am 22.09. ein HTTP 426, danach zweimal 461 mit wachsender Sperre
    // (1 Stunde, dann 6, dann 24). Gewonnen wird hoechstens eine Drittel-
    // sekunde - eine EA-Anfrage selbst dauert laenger.
    //
    // Darum als Schalter, nicht als geloeschte Zeile: Kommt wieder eine
    // Sperre, ist ein Haken in den Optionen der Weg zurueck, und niemand
    // muss dafuer im Code suchen. Die Untergrenze von 8 Sekunden zwischen
    // zwei Kaufanfragen (BUY_GAP_FLOOR_MS) bleibt in beiden Faellen
    // bestehen - sie ist der eigentliche Schutz.
    if (!run.cfg.sofortKaufen) {
      const reactionDelay = randomBetween(180, 350);
      await sleep(reactionDelay);
    }
    // Stopp waehrend der Reaktionszeit: Dann geht der Kauf nicht mehr raus.
    // Die Pruefung bleibt auch ohne Wartezeit stehen: Zwischen dem Fund und
    // hier liegt die Suche, und in der Zeit kann der Lauf gestoppt worden sein.
    if (!isCurrent(run.token)) return;

    // Zaehlt, was wirklich rausgeht. Danach richtet sich die Pause vor dem
    // naechsten Versuch aus derselben Suche (siehe kaufAbstand).
    run.kaufAnfragen = (run.kaufAnfragen || 0) + 1;
    // Zeitpunkt der letzten Anfrage. Daraus rechnet kaufAbstand die
    // Untergrenze von 8 Sekunden aus (25.09.2026, siehe BUY_GAP_FLOOR_MS).
    run.letzteKaufAnfrageAt = Date.now();
    let res;
    try {
      res = await api(bidPathFor(tradeId), {
        method: ENDPOINTS.bidMethod,
        body: JSON.stringify({ bid: price })
      });
    } catch (e) {
      if (e instanceof HardStop) throw e;
      // FST-Modus (Punkt 2): FST stoppt hier nicht (catch -> searchAgain,
      // scripts.js Z. 58328-58330). Melden, die Karte bleibt in "seen"
      // (remember oben), weitermachen. Die Meldung sagt ehrlich, dass der Kauf
      // vielleicht doch angekommen ist.
      if (STATE.fstModus === true) {
        const hinweis = "Kauf ohne klare Antwort (" + target.playerName + ", " + fmt(price) +
          " Coins): " + e.message + " Der Lauf geht weiter. Bitte in der Web App unter Transferziele nachsehen.";
        pushEvent("warn", hinweis);
        countError("netz", hinweis);
        return;
      }
      // Keine Antwort heisst nicht "nicht gekauft": Die Anfrage kann bei EA
      // angekommen sein. Weiterzukaufen koennte Budget und Max. Kaeufe
      // ueberschreiten, ohne dass es hier jemand merkt. Also anhalten.
      throw new HardStop("Kauf ohne klare Antwort (" + target.playerName + ", " + fmt(price) +
        " Coins): " + e.message + " Bitte in der Web App unter Transferziele nachsehen.");
    }

    if (res.ok) {
      STATE.buyErrors = 0;
      STATE.rateLimitHits = 0;
      run.stats.bought += 1;
      run.stats.spent += price;
      run.perTarget.get(target.key).bought += 1;
      run.perTarget.get(target.key).spent += price;
      let data = null;
      try {
        data = await res.json();
      } catch (e) {}
      if (data && typeof data.credits === "number") setCredits(data.credits);
      // Bei leerem Feld "Max. Kaeufe" gibt es keine Zahl, gegen die gezaehlt
      // werden koennte - dann nur die laufende Nummer (27.09.2026).
      const zaehler = run.cfg.maxBuysUnbegrenzt
        ? "Kauf Nr. " + run.stats.bought
        : run.stats.bought + " von " + run.cfg.maxBuys;
      const text = "Gekauft: " + target.playerName + " für " + fmt(price) + " Coins (" + zaehler + ").";
      setMessage(text, "run");
      pushEvent("buy", "Gekauft: " + target.playerName + " für " + fmt(price) + " Coins.");
      log(text + " Antwort:", data);
      notify(text, "kauf");
      tonSpielen("kauf");

      const won = data && Array.isArray(data.auctionInfo) && data.auctionInfo[0] && data.auctionInfo[0].itemData;
      let club = "";
      // Der Kauf ist an dieser Stelle bereits bezahlt. Ein harter Stopp beim
      // Verschieben (z. B. 473, Ziel voll) darf deshalb nicht dazu fuehren,
      // dass der Kauf ungeloggt bleibt: erst eintragen, dann stoppen.
      let clubStop = null;
      const pile = AFTER_BUY_PILES[run.cfg.afterBuy];
      let angebot = null; // Ergebnis von "Gleich verkaufen"
      let einstellGrund = "";
      if (run.cfg.afterBuy === "list" && won && won.id != null) {
        stapelFragen(); // kostet keine EA-Anfrage, sagt uns den Platz
        await sleep(randomBetween(CONFIG.LIST_DELAY_MIN_MS, CONFIG.LIST_DELAY_MAX_MS));
        if (!isCurrent(run.token)) {
          einstellGrund = "Der Lauf wurde gestoppt, darum wurde nichts eingestellt.";
        } else {
          try {
            const e = await gleichEinstellen(won.id, target, price, won);
            if (e.ok) {
              angebot = e;
              club = "ok";
            } else {
              einstellGrund = e.grund;
            }
          } catch (e) {
            if (!(e instanceof HardStop)) throw e;
            einstellGrund = e.message;
            clubStop = e;
          }
          // Nicht eingestellt? Dann wenigstens auf die Transferliste, damit
          // die Karte nicht still bei den Transferzielen liegen bleibt.
          if (!angebot && !clubStop) {
            try {
              club = await sendToPile(won.id, "trade", target.key);
            } catch (e) {
              if (!(e instanceof HardStop)) throw e;
              club = "fehlgeschlagen";
              clubStop = e;
            }
          }
        }
      } else if (pile && won && won.id != null) {
        try {
          // Wie ein Mensch: erst nach ein paar Sekunden verschieben.
          await sleep(randomBetween(CONFIG.MOVE_DELAY_MIN_MS, CONFIG.MOVE_DELAY_MAX_MS));
          club = await sendToPile(won.id, pile, target.key);
        } catch (e) {
          if (!(e instanceof HardStop)) throw e;
          club = "fehlgeschlagen";
          clubStop = e;
        }
      } else if (STATE.fstModus === true && !pile && run.cfg.afterBuy !== "list") {
        // FST: Auch bei "In Unassigned lassen" 5000-6500 ms Ruhe, dann erst die
        // naechste Suche (scripts.js Z. 58324-58327). Es geht nichts raus.
        await sleep(randomBetween(CONFIG.MOVE_DELAY_MIN_MS, CONFIG.MOVE_DELAY_MAX_MS));
      }
      if (angebot) {
        // Wie alt der Verkaufspreis war, steht seit 27.09.2026 dabei, sobald er
        // aelter als eine Stunde ist. Sonst wuesste niemand, dass hier ein
        // aelterer Preis benutzt wurde (Optionen > Verkaeufe).
        const preisAlt = Number(angebot.alterMin) >= 60
          ? " Der Verkaufspreis ist " + Math.round(Number(angebot.alterMin) / 60) + " Std. alt."
          : "";
        const t = target.playerName + " steht für " + fmt(angebot.sofort) + " Coins im Verkauf (1 Stunde, Start " + fmt(angebot.start) + ")." + preisAlt;
        setMessage(t, "run");
        pushEvent("verkauf", t);
        log(t);
      } else if (einstellGrund) {
        const t = "Nicht eingestellt: " + einstellGrund + " " + target.playerName + " liegt auf der Transferliste.";
        warn(t);
        pushEvent("verkauf", t);
        setMessage(t, "warn");
      }
      logPurchase({
        t: Date.now(),
        playerId: target.playerId,
        playerName: target.playerName,
        rating: toInt(auction.itemData && auction.itemData.rating) || 0,
        price,
        tradeId,
        // Die Karten-ID: So findet der Verkaufs-Helfer den Kauf wieder.
        itemId: won && won.id != null ? String(won.id).slice(0, 32) : "",
        club,
        salePrice: target.salePrice || 0,
        // Wohin verschoben wurde ("club" | "trade" | ""). Ohne das zeigte das
        // Popup bei jedem erfolgreichen Verschieben "im Verein" an - auch wenn
        // der Spieler auf die Transferliste ging (gesehen am 21.09.2026).
        pile: angebot ? "trade" : (pile || (run.cfg.afterBuy === "list" ? "trade" : "")),
        // "Gleich verkaufen": Steht die Karte im Verkauf, und zu welchem Preis?
        listed: Boolean(angebot),
        listPrice: angebot ? angebot.sofort : 0,
        listStart: angebot ? angebot.start : 0,
        listedAt: angebot ? Date.now() : 0,
        listNote: str(einstellGrund, 120)
      });
      // FST-Modus (Punkt 9): Nach dem Einstellen noch 3-5 s warten, bevor die
      // naechste Suche kommt (scripts.js Z. 58309-58312).
      if (STATE.fstModus === true && angebot) {
        await wait(randomBetween(CONFIG.FST.GLEICH_NACH_MIN_MS, CONFIG.FST.GLEICH_NACH_MAX_MS), run.token);
      }
      if (clubStop) throw clubStop;
      return;
    }

    if (ITEM_GONE.has(res.status)) {
      STATE.buyErrors = 0;
      run.stats.missed += 1;
      run.perTarget.get(target.key).missed += 1;
      log("Zu spät: Trade " + tradeId + " (HTTP " + res.status + ")");
      return;
    }

    countError("buy", "Kauf " + tradeId + ": HTTP " + res.status, res.status);
  }

  // Erst kurz vor Schluss bieten, und nur, wenn wir nicht ohnehin fuehren.
  // Frueh zu bieten treibt nur den Preis und laedt zum Ueberbieten ein; im
  // Endfenster bleibt der Gegenseite kaum Zeit zu reagieren.
  function isBidTarget(auction, target, run) {
    const cfg = run.cfg;
    // Die Chemie gilt beim Gebot genauso (27.09.2026). Ein gewonnenes Gebot
    // ist ein Kauf wie jeder andere - ohne diese Angabe haette der Bot hier
    // weiter auf jede Chemie geboten, obwohl der Preis fuer eine bestimmte
    // gemessen wurde. Genau das Loch, das isMatch beim Sofortkauf schliesst.
    if (!cfg.bidSniping || !isMatch(auction, target.playerId, target.rating, target.rarity, target.chem)) return false;
    const left = secondsLeft(auction);
    if (!(left > 0) || left > cfg.bidSeconds) return false;

    const tradeId = String(auction.tradeId);
    // Auch ein ungeklaertes Gebot zaehlt: es koennte noch unser Hoechstgebot sein.
    const open = run.openBids.get(tradeId) || (run.unclearBids && run.unclearBids.get(tradeId));
    // Wir sind noch Hoechstbietender: auf keinen Fall gegen uns selbst bieten.
    if (open && currentBid(auction) <= open.amount) return false;
    if (bidAttempts(run, tradeId) >= bidCap(run)) return false;

    // Der Zielpreis ist die Gewinngrenze. Bis dorthin darf nachgeboten werden,
    // darueber nicht - egal wie oft wir ueberboten werden.
    const amount = nextBid(auction);
    return amount > 0 && amount <= target.maxPrice;
  }

  async function executeBid(auction, target, run) {
    if (target.expiresAt && target.expiresAt <= Date.now()) return;
    const tradeId = String(auction.tradeId);
    const amount = nextBid(auction);
    if (!(amount > 0)) return;
    if (bidAttempts(run, tradeId) >= bidCap(run)) return;
    if (run.stats.bought + run.stats.bids >= run.cfg.maxBuys) return;
    if (run.stats.spent + run.stats.bidCommitted + amount > run.cfg.budget) return;
    const targetProgress = run.perTarget.get(target.key);
    if (targetProgress.bought + targetProgress.bids >= run.cfg.filterBuyLimit) return;
    if (run.cfg.filterSpendLimit > 0 && targetProgress && targetProgress.spent + targetProgress.bidCommitted + amount > run.cfg.filterSpendLimit) return;
    // Sperrt weiterhin den Sofortkauf auf diese Auktion, aber nicht mehr das
    // Nachbieten - dafuer zaehlt bidAttempts.
    STATE.seen.add("bid:" + tradeId);
    if (run.bidAttempts) run.bidAttempts.set(tradeId, bidAttempts(run, tradeId) + 1);
    run.kaufAnfragen = (run.kaufAnfragen || 0) + 1; // wie beim Sofortkauf
    run.letzteKaufAnfrageAt = Date.now(); // wie beim Sofortkauf: Basis fuer die Untergrenze
    let res;
    try {
      res = await api(bidPathFor(tradeId), { method: ENDPOINTS.bidMethod, body: JSON.stringify({ bid: amount }) });
    } catch (e) {
      if (e instanceof HardStop) throw e;
      // FST-Modus (Punkt 2): wie beim Sofortkauf melden und weitermachen. Die
      // Auktion bleibt als "bid:" in seen, ein Nachbieten zaehlt ueber bidAttempts.
      if (STATE.fstModus === true) {
        const hinweis = "Gebot ohne klare Antwort (" + target.playerName + ", " + fmt(amount) +
          " Coins): " + e.message + " Der Lauf geht weiter. Bitte in der Web App unter Transferziele nachsehen.";
        pushEvent("warn", hinweis);
        countError("netz", hinweis);
        return;
      }
      // Wie beim Sofortkauf: Ohne Antwort weiss niemand, ob das Gebot steht.
      // Weiterzubieten koennte das Budget sprengen, und ein gewonnenes
      // Gebot fehlte im Kauflog. Also anhalten.
      throw new HardStop("Gebot ohne klare Antwort (" + target.playerName + ", " + fmt(amount) +
        " Coins): " + e.message + " Bitte in der Web App unter Transferziele nachsehen.");
    }
    if (!res.ok) {
      if (ITEM_GONE.has(res.status)) run.stats.missed += 1;
      else countError("buy", "Gebot " + tradeId + ": HTTP " + res.status, res.status);
      return;
    }
    run.stats.bids += 1;
    run.stats.bidCommitted += amount;
    const progress = run.perTarget.get(target.key);
    if (progress) {
      progress.bids = (progress.bids || 0) + 1;
      progress.bidCommitted = (progress.bidCommitted || 0) + amount;
    }
    noteOpenBid(run, auction, target, amount);
    const text = "Gebot gesetzt: " + target.playerName + " für " + fmt(amount) + " Coins · noch ca. " + Math.ceil(secondsLeft(auction)) + " Sekunden.";
    setMessage(text, "run");
    log(text);
    updateStorage("bidLog", (current) => (Array.isArray(current) ? current : []).concat([{
      t: Date.now(), playerId: target.playerId, playerName: target.playerName, rating: target.rating,
      amount, tradeId, secondsLeft: secondsLeft(auction)
    }]).slice(-LOG_MAX));
  }

  // Kontostand, wenn bekannt - sonst null (dann prueft EA selbst).
  function muenzenBekannt() {
    const stand = STATE.credits; // nur lesen - gesetzt wird allein in setCredits
    return typeof stand === "number" && stand >= 0 ? stand : null;
  }

  // Platz auf den Stapeln der Web App (Transferliste, "Nicht zugewiesen").
  // Gelesen aus dem Speicher der App (sniffer.js "stapel?"), ohne Anfrage.
  // Wie FST (Z. 58493-58557): Transferliste 100 = voll; mehr als 4 Karten in
  // "Nicht zugewiesen" = kein Platz mehr. Sonst lehnt EA den Kauf oder das
  // Verschieben mit 473 (DESTINATION_FULL) ab.
  // "weg" sagt, woher die Zahl fuer "Nicht zugewiesen" kommt: "zaehler"
  // (FSTs Weg), "liste" (unser alter Weg), "usermassinfo" (EAs Kontouebersicht)
  // oder "keiner". So wird ein Fehlschlag sichtbar (25.09.2026).
  // "vollTransfer" kam am 27.09.2026 dazu: EAs eigene Ja/Nein-Antwort auf
  // "ist die Transferliste voll?" (isPileFull, FST scripts.js Z. 58415).
  // null heisst "EA hat nichts gesagt" - dann gilt die eigene Zaehlung.
  const STAPEL = { transfer: null, nichtZugewiesen: null, weg: "", at: 0, vollTransfer: null };
  const TRANSFERLISTE_MAX = 100;
  const TRANSFERLISTE_WARN = 95;
  const NICHT_ZUGEWIESEN_MAX = 4;
  // FSTs Obergrenze mit "unlimited unassigned" (28.09.2026): erst bei mehr
  // als 99 Karten ist auch dort Schluss (scripts.js Z. 58493-58495).
  const NICHT_ZUGEWIESEN_MAX_UNBEGRENZT = 99;

  function platzProblem(cfg) {
    // Aelter als 2 Minuten: lieber nichts behaupten.
    if (!STAPEL.at || Date.now() - STAPEL.at > 2 * 60000) return "";
    // Zuerst EAs eigene Antwort, dann die eigene Zaehlung (27.09.2026).
    //
    // Vorbild FST (scripts.js Z. 58415): EA weiss selbst, ob der Stapel voll
    // ist, und sagt es sofort. Unsere Zahl darf bis zu zwei Minuten alt sein -
    // bei rund 4 Sekunden je Runde sind das etwa 30 Runden. Sagt EA nichts
    // (vollTransfer ist null), aendert sich gegenueber vorher gar nichts.
    const transferVoll = STAPEL.vollTransfer === true || (STAPEL.transfer !== null && STAPEL.transfer >= TRANSFERLISTE_MAX);
    if ((cfg.afterBuy === "transfer" || cfg.afterBuy === "list") && transferVoll) {
      // Der Verkaufs-Wache eine Chance lassen (25.09.2026).
      //
      // Ist "verkaufte Karten selbst abräumen" eingeschaltet und liegen
      // wirklich welche da, dann raeumt die Wache gleich auf und es ist
      // wieder Platz. Hier sofort zu stoppen hiesse, den Lauf wegen eines
      // Problems zu beenden, das sich in der naechsten Sekunde von selbst
      // erledigt.
      //
      // Aufgefallen ist das erst mit FSTs schnellerem Tempo: Der Bot kam
      // frueher an diese Pruefung als die Wache ans Abraeumen. Vorher hat
      // die Reihenfolge zufaellig gepasst - solche Faelle sind die
      // unangenehmen, weil sie jahrelang schlafen.
      //
      // Bringt das Abraeumen keinen Platz, stoppt wacheAbraeumen selbst und
      // sagt auch, warum ("Abräumen hat keinen Platz gebracht").
      const raeumtGleichAuf = STATE.autoAbraeumen && STATE.verkaufWache && VERKAUFS_WACHE.verkaufteDa > 0;
      if (!raeumtGleichAuf) {
        return "Die Transferliste ist voll (" + STAPEL.transfer + "). Erst verkaufte oder alte Karten abräumen.";
      }
    }
    // Grenze wie FST (28.09.2026, scripts.js Z. 58493-58495): ohne den
    // Schalter Stopp ab mehr als 4 - das ist auch FSTs eigener Standard.
    // Mit dem Schalter gilt FSTs bezahlte Obergrenze 99. Der Kontoschutz
    // haengt nicht an dieser Zahl: jede Kaufanfrage laeuft weiter durch
    // reserveUsage und alle Tages- und Stundengrenzen.
    const nzMax = STATE.nichtZugewiesenUnbegrenzt ? NICHT_ZUGEWIESEN_MAX_UNBEGRENZT : NICHT_ZUGEWIESEN_MAX;
    if (STAPEL.nichtZugewiesen !== null && STAPEL.nichtZugewiesen > nzMax) {
      // Mit dem Schalter kommt der Stand nach dem Leeren erst einen Augenblick
      // spaeter an (28.09.2026): unassignedLeeren() schickt nur eine Nachricht,
      // die Antwort von reportStapel ist bei dieser Pruefung noch nicht da. Darum
      // sagt der Text, was los ist - sonst wirkt der erste Start kaputt.
      return "„Nicht zugewiesen“ ist voll (" + STAPEL.nichtZugewiesen + ")." +
        (STATE.nichtZugewiesenUnbegrenzt
          ? " Die Merkliste wurde gerade geleert – drücke in ein paar Sekunden noch einmal Start."
          : " Erst dort Platz schaffen.");
    }
    return "";
  }

  function stapelFragen() {
    window.postMessage({ __ownbot: "stapel?" }, window.location.origin);
  }

  // "Nicht zugewiesen" in der Web App leeren bzw. zuruecksetzen (28.09.2026).
  // FSTs "unlimited unassigned": clear() beim Start und nach jeder Suchrunde
  // (scripts.js Z. 58590, 58809), reset() beim Stopp (Z. 58817). Beides sind
  // Speicher-Operationen der App - es geht keine Anfrage an EA hinaus.
  function unassignedLeeren() {
    window.postMessage({ __ownbot: "unassignedLeeren?" }, window.location.origin);
  }

  function unassignedZuruecksetzen() {
    window.postMessage({ __ownbot: "unassignedZuruecksetzen?" }, window.location.origin);
  }

  // --- Auswahllisten der EA-Suchmaske (24.09.2026) ----------------------
  //
  // EAs Suchmaske haelt fertige Listen mit Nummer UND lesbarem Namen
  // (Kartenart, Qualitaet, Position, Liga, Nation, Verein, Chemie,
  // Ikonen-Eigenschaften). Im EA-Code selbst sind die Namen verschluesselt.
  // Der Bot liest sie nur - geschrieben wird in EAs Maske nichts.
  //
  // Kostet keine EA-Anfrage: Die Listen liegen schon in der Seite.
  const FILTERLISTEN = { listen: {}, at: 0, offen: false };
  const FILTERLISTEN_FRISCH_MS = 5 * 60 * 1000;

  function filterListenFragen() {
    // Nur, solange die Suchmaske offen ist - sonst gibt es nichts zu holen.
    if (Date.now() - FILTERLISTEN.at < FILTERLISTEN_FRISCH_MS && FILTERLISTEN.offen) return;
    window.postMessage({ __ownbot: "filterlisten?" }, window.location.origin);
  }

  function filterListenUebernehmen(raw) {
    const roh = raw && raw.listen;
    FILTERLISTEN.offen = Boolean(raw && raw.offen);
    FILTERLISTEN.at = Date.now();
    if (!roh || typeof roh !== "object") return;
    const sauber = {};
    for (const name of Object.keys(roh).slice(0, 12)) {
      if (!/^[a-zA-Z]{3,20}$/.test(name) || !Array.isArray(roh[name])) continue;
      const liste = [];
      // Der Verein ist die einzige wirklich lange Liste (25.09.2026: rund
      // 950 Eintraege). Mit der Grenze 200 fehlten fast vier Fuenftel, und
      // der Nutzer haette nicht gesehen, dass sein Verein gar nicht
      // angeboten wird - er haette ihn einfach nicht gefunden.
      for (const e of roh[name].slice(0, name === "club" ? 1000 : 200)) {
        const id = toInt(e && e.id);
        const label = str(e && e.label, 40);
        // 0 ist "Common", nicht "egal" - EA nimmt dafuer -1.
        if (!(id >= 0) || !label) continue;
        liste.push({ id, label });
      }
      if (liste.length) sauber[name] = liste;
    }
    // Eine leere Antwort (Maske gerade zu) darf die gute Liste nicht loeschen.
    if (!Object.keys(sauber).length) return;
    FILTERLISTEN.listen = sauber;
    // Gemerkt, damit die Auswahlfelder auch dann gefuellt sind, wenn die
    // EA-Suchmaske gerade nicht offen ist. Sonst muesste der Nutzer vor
    // jeder Einstellung erst in den Transfermarkt wechseln.
    Promise.resolve(chrome.storage.local.set({ filterListen: { v: 1, at: Date.now(), listen: sauber } })).catch(() => {});
  }

  // Beim Start die zuletzt gesehenen Listen holen. Sie altern langsam -
  // EA aendert die Kartenarten hoechstens woechentlich - und werden
  // ueberschrieben, sobald die Suchmaske wieder offen ist.
  const FILTERLISTEN_MAX_ALTER_MS = 30 * 24 * 60 * 60 * 1000;

  async function loadFilterListen() {
    const gespeichert = await chrome.storage.local.get("filterListen");
    const roh = gespeichert && gespeichert.filterListen;
    if (!roh || typeof roh !== "object") return;
    if (!(Number(roh.at) > Date.now() - FILTERLISTEN_MAX_ALTER_MS)) return;
    if (Object.keys(FILTERLISTEN.listen).length) return; // schon frisch gelesen
    filterListenUebernehmen({ offen: false, listen: roh.listen });
  }

  // EAs eigene Kontouebersicht (usermassinfo), nur mitgelesen (25.09.2026).
  // Die Web App holt sie beim Anmelden selbst - uns kostet sie keine Anfrage.
  // Sie liefert unassignedPileSize: EAs eigene Zahl fuer "Nicht zugewiesen".
  // Das ist ein Startwert, kein laufender Stand. Deshalb gilt er nur, solange
  // der Speicher der App nichts hergibt. Die Daten kommen aus der Seite und
  // werden deshalb genauso hart geprueft wie die Beobachtungsliste.
  const KONTO = { nichtZugewiesen: null, vereinsName: "", spielerName: "", kader: [], at: 0 };

  function kontoUebernehmen(raw) {
    if (!raw || typeof raw !== "object") return;
    const n = toInt(raw.nichtZugewiesen);
    KONTO.nichtZugewiesen = Number.isFinite(n) && n >= 0 && n <= 10000 ? n : null;
    KONTO.vereinsName = str(raw.vereinsName, 60);
    KONTO.spielerName = str(raw.spielerName, 60);
    KONTO.kader = (Array.isArray(raw.kader) ? raw.kader : [])
      .map((v) => toInt(v))
      .filter((v) => Number.isFinite(v) && v > 0)
      .slice(0, 30);
    KONTO.at = Date.now();
    // Noch keine Zahl aus dem Speicher der App? Dann gilt jetzt EAs eigene.
    if (STAPEL.nichtZugewiesen === null && KONTO.nichtZugewiesen !== null) {
      STAPEL.nichtZugewiesen = KONTO.nichtZugewiesen;
      STAPEL.weg = "usermassinfo";
      STAPEL.at = Date.now();
    }
  }

  function stapelUebernehmen(raw) {
    const zahl = (v) => {
      const n = toInt(v);
      return Number.isFinite(n) && n >= 0 && n <= 10000 ? n : null;
    };
    STAPEL.transfer = zahl(raw && raw.transfer);
    STAPEL.nichtZugewiesen = zahl(raw && raw.nichtZugewiesen);
    STAPEL.weg = str(raw && raw.weg, 16);
    // EAs eigene Antwort auf "ist die Transferliste voll?" (27.09.2026).
    // Nur echtes true oder false uebernehmen - alles andere heisst "EA hat
    // nichts gesagt", und dann gilt weiter die eigene Zaehlung.
    STAPEL.vollTransfer = raw && typeof raw.vollTransfer === "boolean" ? raw.vollTransfer : null;
    // Kein stiller Verlust: gibt der Speicher der App nichts her, gilt EAs
    // eigene Zahl aus usermassinfo weiter - und "weg" sagt, woher sie kommt.
    if (STAPEL.nichtZugewiesen === null && KONTO.nichtZugewiesen !== null) {
      STAPEL.nichtZugewiesen = KONTO.nichtZugewiesen;
      STAPEL.weg = "usermassinfo";
    }
    STAPEL.at = Date.now();
  }

  // ---------------------------------------------------------------------------
  // Filter-Wechsel im Autopilot (F4): die Rotations-Karte.
  //
  // Die Regie fuehrt die Leiste (popup.js) - sie kennt Wertung und Preise.
  // Hier liegt die harte Bremse: Ohne gueltige Karte startet kein weiterer
  // Filter. Jeder echte Stopp (Sperre, Limit, HARD_STOP, Tab unsichtbar,
  // Not-Aus, Stopp-Knopf) macht die Karte sofort ungueltig und beendet damit
  // die ganze Rotation. Vorbild: FST-Auto-Trading (scripts.js Z. 42197-42373),
  // dort entscheidet aber der FST-Server, wann der naechste Filter kommt.
  // ---------------------------------------------------------------------------
  // zwangsPauseMs: Untergrenze fuer die naechste Pause, gesetzt von
  // "Nächster Filter" (25.09.2026). Sie wird beim naechsten
  // rotationPauseSetzen verbraucht. Bleibt sie einmal ueber das Ende einer
  // Rotation hinaus stehen, wird die erste Pause der naechsten Rotation
  // laenger - das ist die sichere Richtung.
  const ROTATION = { aktiv: false, karte: 0, startedAt: 0, endetUm: 0, filterNr: 0, pauseBis: 0, ausgegeben: 0, suchen: 0, kaeufe: 0, letzte: [], grund: "", zwangsPauseMs: 0, zwangsExakt: false };

  function rotationStand() {
    return {
      aktiv: ROTATION.aktiv, karte: ROTATION.karte, filterNr: ROTATION.filterNr, max: CONFIG.ROTATION_MAX_FILTER,
      endetUm: ROTATION.endetUm, pauseBis: ROTATION.pauseBis, ausgegeben: ROTATION.ausgegeben,
      suchen: ROTATION.suchen, kaeufe: ROTATION.kaeufe,
      letzte: ROTATION.letzte.map((e) => ({ key: e.key, t: e.t })), grund: ROTATION.grund,
      // Sperrfrist fuer denselben Filter (25.09.2026): Die Leiste soll sie
      // nicht selbst erfinden, sondern die des Motors benutzen.
      gleicherFilterMs: CONFIG.ROTATION_GLEICHER_FILTER_MS
    };
  }

  // "" = der naechste Filter darf starten. Sonst der Grund im Klartext.
  function rotationGueltig(karte) {
    if (!ROTATION.aktiv) return "Die Rotation ist beendet.";
    if (karte !== ROTATION.karte) return "Diese Rotation ist nicht mehr aktuell.";
    if (Date.now() >= ROTATION.endetUm) return "Fertig: Die Laufzeit der Rotation ist um.";
    const gesperrt = cooldownBlock();
    if (gesperrt) return gesperrt;
    const fremd = andererTabAktiv();
    if (fremd) return fremd;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return "Gestoppt: Der EA-Tab ist nicht zu sehen.";
    if (Date.now() < ROTATION.pauseBis) return "Die Pause zwischen zwei Filtern läuft noch.";
    // FST-Modus: FST kennt keine Zahl fuer Filter je Rotation.
    if (STATE.fstModus !== true) {
      if (ROTATION.filterNr >= CONFIG.ROTATION_MAX_FILTER) return "Fertig: Höchstens " + CONFIG.ROTATION_MAX_FILTER + " Filter je Rotation.";
    }
    return "";
  }

  function rotationStarten(roh) {
    const gesperrt = cooldownBlock();
    if (gesperrt) return { ok: false, error: gesperrt };
    const fremd = andererTabAktiv();
    if (fremd) return { ok: false, error: fremd };
    if (!SESSION.sid) return { ok: false, error: "Noch nicht mit der Web App verbunden." };
    if (STATE.running || STATE.check.running || STATE.marketScan.running) return { ok: false, error: "Es läuft schon etwas. Erst stoppen." };
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return { ok: false, error: "Der EA-Tab muss sichtbar sein." };
    if (ROTATION.aktiv) return { ok: false, error: "Es läuft schon eine Rotation." };
    const minuten = Math.min(CONFIG.ROTATION_MAX_MIN, Math.max(1, toInt(roh && roh.laufzeitMin) || 30));
    ROTATION.karte += 1;
    ROTATION.aktiv = true;
    ROTATION.startedAt = Date.now();
    ROTATION.endetUm = Date.now() + minuten * 60000;
    ROTATION.filterNr = 0;
    ROTATION.pauseBis = 0;
    ROTATION.ausgegeben = 0;
    ROTATION.suchen = 0;
    ROTATION.kaeufe = 0;
    ROTATION.grund = "";
    return { ok: true, rotation: rotationStand() };
  }

  // Karte hochzaehlen: Damit ist jede noch unterwegs befindliche Karte
  // sofort ungueltig - auch eine, die die Leiste schon in der Hand hat.
  function rotationBeenden(grund) {
    if (!ROTATION.aktiv) return;
    ROTATION.aktiv = false;
    ROTATION.karte += 1;
    ROTATION.pauseBis = 0;
    ROTATION.grund = str(grund, 200);
  }

  function rotationMerken(key) {
    if (!key) return;
    ROTATION.letzte = [{ key, t: Date.now() }].concat(ROTATION.letzte.filter((e) => e.key !== key)).slice(0, 10);
    chrome.storage.local.set({ filterAbkuehlung: ROTATION.letzte }).catch(() => {});
  }

  // "Nächster Filter" (25.09.2026): nur den laufenden Filter beenden, die
  // Rotation weiterlaufen lassen. Bisher gab es dafuer nur den Stopp-Knopf,
  // der ueber rotationBeenden die ganze Rotation beendete - wer einen toten
  // Filter loswerden wollte, verlor den ganzen Lauf und den Markt-Scan dazu.
  // Vorbild: FSTs Knopf "go to next filter" (scripts.js 57645-57658).
  function naechsterFilter() {
    if (!ROTATION.aktiv) return { ok: false, error: "Es läuft keine Rotation." };
    if (!STATE.running) return { ok: false, error: "Gerade läuft kein Filter." };
    const suchen = STATE.run && STATE.run.stats ? toInt(STATE.run.stats.scans) : 0;
    let text = "Übersprungen nach " + suchen + " Suchen. Der nächste Filter kommt nach der Pause.";
    // FST-Modus: FSTs Regel - unter 21 Suchen 60 Sekunden Pause (scripts.js
    // Z. 57641-57655). Streng: unter 20 Suchen die volle Zwangspause.
    const fst = STATE.fstModus === true;
    const schwelle = fst ? CONFIG.FST.SPRUNG_MIN_SUCHEN : CONFIG.SPRUNG_MIN_SUCHEN;
    const zwang = fst ? CONFIG.FST.SPRUNG_PAUSE_MS : CONFIG.ROTATION_MAX_PAUSE_MS;
    if (suchen < schwelle) {
      // Kaum gesucht: volle Zwangspause, damit aus dem Knopf kein
      // Schnellvorlauf durch die Filter wird.
      ROTATION.zwangsPauseMs = zwang;
      // FST-Modus (Punkt 4d): Die Pause ist GENAU 60 s. FST setzt sie fest
      // (autoTradeBreakSec, scripts.js Z. 57641-57655); die normale Pause der
      // Leiste darf sie nicht verlaengern. Streng bleibt: max(Zwangspause, normale Pause).
      ROTATION.zwangsExakt = fst;
      ROTATION.pauseBis = Date.now() + zwang;
      text = "Übersprungen nach nur " + suchen + " Suchen. Deshalb " +
        (Math.round(zwang / 60000) === 1 ? "1 Minute" : Math.round(zwang / 60000) + " Minuten") + " Pause vor dem nächsten Filter.";
    }
    // Code "filter": Die Rotations-Karte bleibt gueltig, stop() ruft hier
    // bewusst kein rotationBeenden auf.
    stop(text, "done", false, "filter");
    return { ok: true };
  }

  function rotationPauseSetzen(ms) {
    if (!ROTATION.aktiv) return false;
    // Zwangspause aus "Nächster Filter" (25.09.2026): Sie wurde eben gesetzt,
    // weil der uebersprungene Filter fast nichts gesucht hat. Die Leiste
    // schickt danach ihre normale Pause - die darf die Zwangspause nicht
    // wieder verkuerzen. Also gilt sie als Untergrenze und wird dabei
    // verbraucht.
    const boden = ROTATION.zwangsPauseMs || 0;
    const exakt = ROTATION.zwangsExakt === true && boden > 0;
    ROTATION.zwangsPauseMs = 0;
    ROTATION.zwangsExakt = false;
    if (exakt) {
      ROTATION.pauseBis = Date.now() + boden;
      return true;
    }
    // FST-Modus: FSTs Regler 60-600 s (Z. 41940-41946); lange Ruhe bis 900 s
    // plus Streuung bleibt moeglich (Obergrenze 1080 s).
    const pMin = STATE.fstModus === true ? CONFIG.FST.ROT_PAUSE_MIN_MS : CONFIG.ROTATION_MIN_PAUSE_MS;
    const pMax = STATE.fstModus === true ? CONFIG.FST.ROT_PAUSE_MAX_MS : CONFIG.ROTATION_MAX_PAUSE_MS;
    ROTATION.pauseBis = Date.now() + Math.min(pMax, Math.max(pMin, boden, toInt(ms) || 0));
    return true;
  }

  function abkuehlungUebernehmen(roh) {
    ROTATION.letzte = (Array.isArray(roh) ? roh : [])
      .filter((e) => e && typeof e.key === "string" && Number(e.t) > 0 && Number(e.t) <= Date.now() + 60000)
      .map((e) => ({ key: str(e.key, 40), t: Number(e.t) }))
      .slice(0, 10);
  }

  function stopReason(run) {
    const cfg = run.cfg;
    if (run.stats.bought + run.stats.bids >= cfg.maxBuys) {
      // Gleiches Wort wie das Feld "Max. Kaeufe"; Gebote zaehlen dort mit.
      // Leeres Feld "Max. Kaeufe" (27.09.2026): Dann ist nicht die eigene
      // Grenze erreicht, sondern das Tageslimit des Kontoschutzes. Der Text
      // muss das sagen, sonst sucht der Nutzer eine Einstellung, die er nie
      // gesetzt hat.
      if (cfg.maxBuysUnbegrenzt) {
        return ["Fertig: Das Tageslimit von " + cfg.maxBuys + " Kaufversuchen ist erreicht (" +
          (run.stats.bought + run.stats.bids) + " in diesem Lauf" +
          (run.stats.bids ? ", Gebote zählen mit" : "") + ").", "done"];
      }
      return ["Fertig: Max. Käufe erreicht (" + (run.stats.bought + run.stats.bids) + " von " + cfg.maxBuys +
        (run.stats.bids ? ", Gebote zählen mit" : "") + ").", "done"];
    }
    const left = cfg.budget - run.stats.spent - run.stats.bidCommitted;
    if (left < Math.min(...cfg.targets.map((t) => t.maxPrice))) {
      const bound = openBidTotal(run);
      const unklar = unclearBidTotal(run);
      // Gebundene Coins klar benennen: sie sind nicht ausgegeben, nur reserviert.
      // Ungeklaerte Gebote zaehlen vorsichtshalber wie ausgegeben.
      let note = bound > 0 ? " Davon " + fmt(bound) + " Coins in " + run.openBids.size + " offenen Geboten gebunden." : "";
      if (unklar > 0) note += " " + fmt(unklar) + " Coins aus " + run.unclearBids.size + " Geboten ohne erkennbaren Ausgang zählen vorsichtshalber als ausgegeben.";
      return ["Fertig: Restbudget (" + fmt(left) + ") reicht nicht für einen weiteren Kauf zum Zielpreis." + note, "done", "gesamt"];
    }
    if (cfg.timeLimitMin && Date.now() - run.startedAt >= cfg.timeLimitMin * 60000) {
      return ["Fertig: Zeitlimit von " + cfg.timeLimitMin + " Min. erreicht.", "done"];
    }
    // Zu wenig Coins fuer JEDEN Zielpreis: Jeder Kaufversuch bekaeme 470
    // (NOT_ENOUGH_CREDIT) - eine sinnlose Anfrage, die auf das Tageslimit
    // zaehlt. Der Stand kommt aus EAs Antworten oder der Kopfzeile der App.
    const coins = muenzenBekannt();
    if (coins !== null && coins < Math.min(...cfg.targets.map((t) => t.maxPrice))) {
      return ["Fertig: Nur noch " + fmt(coins) + " Coins – das reicht für keinen Zielpreis.", "done", "gesamt"];
    }
    const platz = platzProblem(cfg);
    if (platz) return ["Gestoppt: " + platz, "warn", "gesamt"];
    // FST-Modus: Der erste Suchfehler stoppt (FST: jede Suchantwort ungleich
    // 200, scripts.js Z. 59455-59473). Kauffehler stoppen nie.
    if (STATE.fstModus === true) {
      if (STATE.searchErrors >= 1) {
        return ["Gestoppt: Suche fehlgeschlagen. " + STATE.message, "error", "gesamt"];
      }
      if ((STATE.netzErrors || 0) >= CONFIG.FST.NETZ_FEHLER_MAX) {
        return ["Gestoppt: Keine Verbindung zu EA (" + CONFIG.FST.NETZ_FEHLER_MAX + " Fehler in Folge). Letzter: " + STATE.message, "error", "gesamt"];
      }
      return null;
    }
    if (STATE.searchErrors >= CONFIG.MAX_ERRORS_IN_A_ROW || STATE.buyErrors >= CONFIG.MAX_ERRORS_IN_A_ROW) {
      return ["Gestoppt nach " + CONFIG.MAX_ERRORS_IN_A_ROW + " Fehlern in Folge. Letzter: " + STATE.message, "error", "gesamt"];
    }
    return null;
  }

  // Zielpreis liegt ueber dem Markt: Der Filter wuerde reihenweise ohne Gewinn
  // kaufen. Betrifft immer nur diesen einen Filter, die anderen laufen weiter.
  function filterTooBroad(target, run) {
    if (!run.cfg.stopIfTooBroad) return false;
    const progress = run.perTarget.get(target.key);
    return Boolean(progress) && (progress.fullPages || 0) >= CONFIG.BROAD_FILTER_HITS;
  }

  function filterAvailable(target, run) {
    if (target.expiresAt && target.expiresAt <= Date.now()) return false;
    const progress = run.perTarget.get(target.key);
    if (!progress) return false;
    // Gewinn-Bremse (25.09.2026): Der Markt ist unter den Zielpreis gefallen.
    // Dieser Spieler ist damit durch, die anderen Filter laufen weiter.
    if (progress.gewinnWeg) return false;
    // Diese Karte hat ihr Tagespensum voll - andere Filter laufen weiter.
    if (cardCount(target.key) >= CONFIG.CARD_LIMIT_DAY && STATE.fstModus !== true) return false;
    if (filterTooBroad(target, run)) return false;
    // Zweite Grenze je Filter (25.09.2026): Kaufversuche, auch gescheiterte.
    if ((progress.anfragen || 0) >= run.cfg.filterAnfrageLimit) return false;
    if (progress.scans >= run.cfg.filterSearchLimit) return false;
    if (progress.bought + progress.bids >= run.cfg.filterBuyLimit) return false;
    if (run.cfg.filterSpendLimit > 0 && progress.spent + progress.bidCommitted + target.maxPrice > run.cfg.filterSpendLimit) return false;
    return true;
  }

  function randomBetween(min, max) {
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  // Zwei Zufallsquellen statt einer: Grundpause plus gelegentlicher Aufschlag.
  // Das ergibt eine ungleichmaessige Verteilung statt eines gleichmaessigen
  // Takts - bei gleichem Durchschnitt wie die bisherigen festen 3 Sekunden.
  function scanDelay() {
    let ms = randomBetween(CONFIG.SCAN_DELAY_MIN_MS, CONFIG.SCAN_DELAY_MAX_MS);
    if (Math.random() < CONFIG.SCAN_EXTRA_CHANCE) {
      ms += randomBetween(CONFIG.SCAN_EXTRA_MIN_MS, CONFIG.SCAN_EXTRA_MAX_MS);
    }
    return ms;
  }

  // Die Pause zwischen zwei Suchen - seit 25.09.2026 mit FUT Simple Traders
  // eigenen Zahlen, auf ausdruecklichen Wunsch des Nutzers.
  //
  // Abgelesen in scripts.js Z. 58619-58628 (der Zweig "renderless", also der
  // Weg ohne EAs Oberflaeche - derselbe, den wir gehen). FST wuerfelt eine
  // Grundzeit und legt mit einer bestimmten Wahrscheinlichkeit noch etwas
  // drauf, damit der Abstand nicht gleichmaessig wirkt.
  //
  // Vorher waren wir zwei- bis viermal langsamer als FST - unser "Turbo"
  // (5-8 Sek.) war langsamer als FSTs "Langsam" (3,6-6,8 Sek.).
  //
  // Was das WIRKLICH aendert: Die Zahl der Suchen pro Tag bleibt gleich, die
  // deckelt das Stundenlimit (150) und das Tageslimit (350). Der Bot ist nur
  // schneller am Schnaeppchen - und beim Sniping entscheidet genau das. Die
  // Kehrseite: Das Stundenlimit ist statt nach rund 30 Minuten schon nach gut
  // 10 erreicht. Danach wartet der Bot bis zur naechsten Stunde, statt
  // aufzuhoeren (siehe die Wartepause am Stundenlimit).
  //
  // FSTs eigene Einstufung des Risikos, aus seinem Hilfetext (Z. 55874):
  // Langsam = geringes, Normal = mittleres, Turbo = hohes Risiko fuer eine
  // stille Sperre oder ein Captcha.
  function searchDelay(cfg) {
    const streuen = (min, max, chance, extraMin, extraMax) =>
      randomBetween(min, max) + (Math.random() < chance ? randomBetween(extraMin, extraMax) : 0);
    // FST: hw(3600,4990) + 20 % Chance auf hw(900,1800)
    if (cfg.speedMode === "safe") return streuen(3600, 4990, 0.20, 900, 1800);
    // FST: hw(2520,3111) + 50 % Chance auf hw(120,420)
    if (cfg.speedMode === "turbo") return streuen(2520, 3111, 0.50, 120, 420);
    // FST: hw(3310,4010) + 50 % Chance auf hw(100,600)
    return streuen(3310, 4010, 0.50, 100, 600);
  }

  // Die laengeren Ruhepausen - seit 25.09.2026 nach FSTs Standardwerten
  // (scripts.js Z. 3264-3268): alle 45 Suchen 90 Sekunden, nach je 4 solchen
  // Pausen eine von 240 Sekunden, alles mit 30 Prozent Streuung.
  //
  // FST hat diese Pausen uebrigens standardmaessig AUS (useBreaks: false).
  // Bei uns bleiben sie an: Sie kosten keine einzige Suche, sondern verteilen
  // dieselbe Zahl nur ueber mehr Zeit. Das ist der billigste Schutz, den es
  // gibt. Wer sie kuerzer will, nimmt "kurz".
  //
  // Die Streuung von 30 Prozent ist FSTs randomizeBreaks. Ohne sie waere
  // jede Pause exakt gleich lang - und nichts sieht maschineller aus als das.
  const PAUSE_STREUUNG = 0.30;

  function breakPlan(cfg) {
    // Vierte Stufe "aus" (27.09.2026, bei FST abgeschaut: scripts.js Z. 3263,
    // useBreaks steht dort im Standard auf falsch). Bei uns bleibt der
    // Standard "ausgewogen" - aus ist eine ausdrueckliche Wahl des Nutzers.
    //
    // Ohne Pausen wird KEINE Suche mehr erlaubt. Die Grenzen je Stunde und
    // Tag gelten unveraendert, die Suchen sind nur schneller aufgebraucht -
    // und danach wartet der Bot (siehe Wartepause am Stundenlimit). Gespart
    // wird allein die Ruhezeit zwischen den Suchen.
    //
    // every = 0 ist das Zeichen "keine Pausen". Jede Stelle, die every
    // benutzt, fragt das ab - sonst waere "1 >= 0" wahr und der Bot machte
    // nach jeder Suche eine Pause von 0 Sekunden.
    if (cfg.pausePreset === "off") return { every: 0, ms: 0, longEvery: 4, longMs: 0 };
    const streuen = (ms) => {
      const spanne = Math.round(ms * PAUSE_STREUUNG);
      // FSTs Untergrenze von 3.134 ms gilt auch hier: Eine "Pause", die
      // kuerzer ist als der Abstand zweier Suchen, waere keine.
      return Math.max(3134, ms + randomBetween(-spanne, spanne));
    };
    // Streuung fuer ANZAHLEN (27.09.2026). FST streut nicht nur die Dauer
    // einer Pause, sondern auch die Zahl der Suchen davor: scripts.js
    // Z. 1951-1954 rechnet 45 plus/minus 30 Prozent, benutzt in Z. 58592-58596.
    // Das sind 32 bis 58 Suchen. Bei uns kam die Pause bisher immer nach genau
    // 45. Am Verdienst aendert das nichts - es geht um die Tarnung: Ein immer
    // gleicher Takt sieht maschineller aus als ein schwankender.
    //
    // Dieselben 30 Prozent wie bei der Dauer, damit nur eine Zahl gepflegt
    // werden muss. Die Untergrenze verhindert, dass eine Pause fast direkt
    // auf die vorige folgt.
    const streuenAnzahl = (n, minimum) => {
      const spanne = Math.round(n * PAUSE_STREUUNG);
      return Math.max(minimum, n + randomBetween(-spanne, spanne));
    };
    // "Wie FST" (01.10.2026, nur im FST-Modus): Die Zahlen der FST-Oberflaeche
    // (FST-live-optionen-01-10): Pause nach 25-46 Suchen fuer 21-39 s, lange
    // Pause nach 2-4 Pausen fuer 63-117 s. Der Code v2.2.6 hat Pausen ab Werk
    // aus - die Quellen widersprechen sich, hier gilt die sichtbare Version.
    if (cfg.pausePreset === "fst" && STATE.fstModus === true) {
      return {
        every: streuenAnzahl(35, 5),
        ms: Math.max(3134, randomBetween(21000, 39000)),
        longEvery: randomBetween(2, 4),
        longMs: Math.max(3134, randomBetween(63000, 117000))
      };
    }
    const plan =
      cfg.pausePreset === "short" ? { every: streuenAnzahl(45, 5), ms: streuen(45000) } :
      cfg.pausePreset === "long" ? { every: streuenAnzahl(30, 5), ms: streuen(180000) } :
      // FSTs Standard: alle 45 Suchen 90 Sekunden.
      { every: streuenAnzahl(45, 5), ms: streuen(90000) };
    // Zweite Stufe: Nach einigen kurzen Pausen eine deutlich laengere. Ein
    // Mensch macht auch nicht nur immer gleich lange Unterbrechungen.
    // FST: alle 4 Pausen, 240 statt 90 Sekunden - also rund das 2,7-fache.
    // 27.09.2026: Auch diese Zahl streut jetzt. FST wuerfelt sie genauso
    // (scripts.js Z. 58597-58600), 4 plus/minus 30 Prozent sind 3 bis 5.
    // Mindestens 2, damit nicht jede zweite Pause eine lange ist.
    plan.longEvery = streuenAnzahl(4, 2);
    plan.longMs = streuen(Math.round(plan.ms * 2.7));
    return plan;
  }

  // Pruefungen vor jedem Sofortkauf aus der Trefferliste einer Suche.
  // "ende" = fuer diese Suche ist Schluss, "weiter" = dieses Angebot nicht,
  // "los" = kaufen. Alles an einer Stelle, weil es vor UND nach der Pause
  // zwischen zwei Kaeufen gleich laufen muss (siehe kaufAbstand).
  function kaufPruefung(auction, target, run, token, gesuchtUm) {
    const cfg = run.cfg;
    if (!isCurrent(token)) return "ende";
    // Alte Trefferliste (25.09.2026): Nach Kauf, Verschieben und Pause ist das
    // dritte Angebot dieser Suche ueber eine Viertelminute alt. Was so lange
    // offen stand, ist meistens schon weg - die Anfrage zaehlt aber trotzdem
    // aufs Tageslimit. Dann lieber Schluss machen; die naechste Runde sucht
    // ohnehin frisch, das kostet keine zusaetzliche Anfrage.
    if (gesuchtUm > 0 && Date.now() - gesuchtUm > CONFIG.TREFFER_MAX_ALTER_MS) return "ende";
    // Reicht der Kontostand nicht fuer DIESES Angebot, gar nicht erst fragen.
    const coins = muenzenBekannt();
    if (coins !== null && coins < bin(auction)) return "weiter";
    // Hat EA gerade gebremst (429 setzt STATE.pauseUntil), wird NICHT
    // weitergekauft. Vorher galt die Pause nur fuer die Suchpfade: Der
    // erste Kauf bekam die Drosselung, und fuer die restlichen Treffer
    // der Seite gingen trotzdem sofort weitere Anfragen raus - jede
    // davon zaehlte aufs Tageslimit, mitten in der Drosselung. Genau
    // das Verhalten macht ein gebremstes Konto auffaellig. Die
    // Warteschleife am Ende der Runde sitzt die Pause dann aus.
    if (Date.now() < STATE.pauseUntil) return "ende";
    // Gewinn-Bremse (25.09.2026): Ist der Markt waehrend des Laufs unter den
    // Zielpreis gefallen, wird auch aus DIESER Suche nichts mehr gekauft.
    // Sonst kaeme der Stopp erst in der naechsten Runde - einen Verlust zu spaet.
    if (gewinnWeg(target, run)) return "ende";
    if (run.stats.bought + run.stats.bids >= cfg.maxBuys) return "ende";
    if (cfg.budget - run.stats.spent - run.stats.bidCommitted < bin(auction)) return "weiter";
    const progress = run.perTarget.get(target.key);
    if (progress.bought + progress.bids >= cfg.filterBuyLimit) return "ende";
    if (target.expiresAt && target.expiresAt <= Date.now()) return "ende";
    if (cfg.filterSpendLimit > 0 && progress.spent + progress.bidCommitted + bin(auction) > cfg.filterSpendLimit) return "weiter";
    // Was transact() ohnehin still ablehnt (schon gekauft, Gebot laeuft,
    // Zeitlimit, Kartenlimit), bekommt auch keine Pause davor.
    const tradeId = String(auction.tradeId);
    if (STATE.seen.has(tradeId) || STATE.seen.has("bid:" + tradeId)) return "weiter";
    if (!canTransact(target, run, bin(auction))) return "weiter";
    return "los";
  }

  // Restlaufzeit einer Auktion JETZT. EA nennt sie in Sekunden ab der
  // Antwort - nach einer Pause zwischen zwei Geboten ist die Zahl aus der
  // Suche um diese Pause zu hoch.
  function restSekunden(auction, gesuchtUm) {
    const raw = Number(auction.expires ?? auction.expiresAt);
    if (raw > 0 && raw < 86400 * 7) return raw - (Date.now() - gesuchtUm) / 1000;
    return secondsLeft(auction);
  }

  // Dasselbe fuer Gebote. Dazu die Restlaufzeit: Ist die Auktion waehrend
  // der Pause abgelaufen, waere ein Gebot nur eine verschenkte Anfrage, die
  // trotzdem aufs Tages- und Kartenlimit zaehlt.
  function gebotPruefung(auction, target, run, token, gesuchtUm) {
    if (!isCurrent(token)) return "ende";
    if (Date.now() < STATE.pauseUntil) return "ende"; // Drosselung gilt auch fuer Gebote
    if (run.stats.bought + run.stats.bids >= run.cfg.maxBuys) return "ende";
    // Reicht der Kontostand nicht fuer DIESES Gebot, gar nicht erst bieten
    // (28.09.2026). Seit das Budget leer bleiben darf, ist der Kontostand die
    // einzige Geld-Bremse - und die gab es auf dem Gebots-Weg bisher nicht:
    // Jedes Gebot ueber dem Kontostand kaeme mit HTTP 470 zurueck und zaehlte
    // trotzdem aufs Tageslimit der Kaufversuche. Dieselbe Bauart wie der
    // Coins-Check in kaufPruefung; kostet keine EA-Anfrage.
    {
      const coins = muenzenBekannt();
      if (coins !== null && coins < nextBid(auction)) return "weiter";
    }
    const tradeId = String(auction.tradeId);
    if (STATE.seen.has(tradeId) || bidAttempts(run, tradeId) >= bidCap(run)) return "weiter";
    if (!(restSekunden(auction, gesuchtUm) > 0)) return "weiter";
    if (!canTransact(target, run, nextBid(auction))) return "weiter";
    return "los";
  }

  // Pause vor jedem weiteren Kauf- oder Gebotsversuch aus derselben Suche
  // (Befund vom 22.09., siehe CONFIG.BUY_GAP_MIN_MS). Sie zaehlt nicht als
  // Suche und laesst Suchpause und Sicherheitspausen in Ruhe. wait() laesst
  // STOP sofort durch.
  async function kaufAbstand(run, token, gebot) {
    // Seit 25.09.2026 gilt zusaetzlich eine Untergrenze (BUY_GAP_FLOOR_MS).
    // Angerechnet wird, was seit der letzten Anfrage schon vergangen ist -
    // also Verschieben und Einstellen. Gewartet wird nur die fehlende Zeit,
    // und nie weniger als bisher.
    const seitLetzter = run.letzteKaufAnfrageAt ? Date.now() - run.letzteKaufAnfrageAt : 0;
    // FST-Modus: keine Untergrenze; Gebote 3800-5500 ms Abstand (FST Auto Bidding).
    const fst = STATE.fstModus === true;
    const rest = run.letzteKaufAnfrageAt && !fst ? CONFIG.BUY_GAP_FLOOR_MS - seitLetzter : 0;
    const ms = fst && gebot
      ? randomBetween(CONFIG.FST.BID_GAP_MIN_MS, CONFIG.FST.BID_GAP_MAX_MS)
      : Math.max(randomBetween(CONFIG.BUY_GAP_MIN_MS, CONFIG.BUY_GAP_MAX_MS), rest);
    const text = "Nächstes Angebot in " + Math.round(ms / 1000) + " s …";
    // Eine Warnung (z. B. ein fehlgeschlagener Kauf) bleibt stehen - sie
    // ist wichtiger als der Hinweis auf die Pause.
    if (STATE.level === "run") setMessage(text, "run");
    await wait(ms, token);
    if (isCurrent(token) && STATE.message === text) setMessage(runningMessage(run.cfg), "run");
  }

  async function loop(token) {
    const run = STATE.run;
    const cfg = run.cfg;
    let turn = 0;
    let sinceBreak = 0;
    let breaksTaken = 0;
    let nextBreak = breakPlan(cfg);
    log("Gestartet:", cfg);
    // Welche Chemie beim Kauf verlangt wird - einmal je Lauf aus dem
    // gespeicherten Preis-Check (27.09.2026). Kostet keine EA-Anfrage.
    // Bewusst MIT await: Vor der ersten Suche muss klar sein, was gekauft
    // werden darf. Sonst koennte die erste Suche noch die falsche Chemie kaufen.
    await zieleChemieLaden(run);
    if (!isCurrent(token)) return;
    // Erster Blick in die Transferliste - kostenlos aus dem Speicher der App.
    // Alte Verkaeufe werden dabei gemerkt, zaehlen aber nicht zu diesem Lauf.
    // Bewusst OHNE await: Der Lauf soll darauf nicht warten.
    verkaeufePruefen(run, token, "start").catch(() => {});

    while (isCurrent(token)) {
      // 25.09.2026: Steht nach einer unklaren Antwort von EA eine Bremse, wird
      // sie hier abgewartet - vor jeder weiteren Anfrage, auch vor dem Blick
      // in die Beobachtungsliste.
      await fehlerBremse(token);
      if (!isCurrent(token)) break;
      // Erst bei EA nachsehen, was aus den Geboten wurde, dann erst schaetzen.
      try {
        await settleViaWatchlist(run);
      } catch (e) {
        if (e instanceof HardStop) {
          stop(e.message, "error");
          break;
        }
        warn("Beobachtungsliste: " + e.message);
      }
      if (!isCurrent(token)) break;
      expireBids(run);
      const reason = stopReason(run);
      if (reason) {
        stop(reason[0], reason[1], false, reason[2]);
        break;
      }

      const available = cfg.targets.filter((target) => filterAvailable(target, run));
      if (!available.length) {
        // 25.09.2026: Die Gewinn-Bremse zaehlt hier mit. Sonst stuende am Ende
        // "Alle Spieler haben ihre Grenze erreicht", obwohl in Wahrheit der
        // Markt gefallen ist - der Grund ginge auf dem Weg zum Nutzer verloren.
        const bremse = cfg.targets.map((target) => gewinnWeg(target, run)).find(Boolean);
        const zuWeit = cfg.targets.filter((target) => filterTooBroad(target, run) || gewinnWeg(target, run));
        if (zuWeit.length === cfg.targets.length) {
          stop(bremse
            ? "Gestoppt: " + bremse + " Bitte den Zielpreis prüfen und senken."
            : "Gestoppt: Der Zielpreis liegt über dem Marktpreis – so entsteht kein Gewinn. Bitte Preis prüfen und senken.", "warn", false, "filter");
        } else if (cfg.targets.every((target) => target.expiresAt && target.expiresAt <= Date.now())) {
          // Live-Filter gelten 15 Minuten. Sonst stuende hier "Grenze erreicht",
          // obwohl weder Kaeufe noch Suchen voll waren (live so gesehen).
          stop("Fertig: " + (cfg.targets.length === 1 ? "Der Live-Filter ist abgelaufen – er gilt" : "Alle Live-Filter sind abgelaufen – sie gelten") +
            " nur 15 Minuten. Unter „Filter“ neu scannen.", "done", false, "filter");
        } else {
          // Die Grenzen je Spieler nennen - sonst wundert man sich, warum der
          // Lauf vor Max. Kaeufe endet (frueher standardmaessig nach 3 Kaeufen).
          const abgelaufen = cfg.targets.filter((target) => target.expiresAt && target.expiresAt <= Date.now()).length;
          // FST-Modus: Eine Zahl ohne Grenze (MAX_SAFE_INTEGER) heisst "ohne Grenze".
          const gz = (v) => (v >= Number.MAX_SAFE_INTEGER ? "unbegrenzt" : v);
          stop("Fertig: Alle Spieler haben ihre Grenze erreicht (je Spieler " +
            gz(cfg.filterBuyLimit) + " Käufe, " + gz(cfg.filterAnfrageLimit) + " Kaufversuche, " + gz(cfg.filterSearchLimit) + " Suchen" +
            (cfg.filterSpendLimit > 0 ? ", " + fmt(cfg.filterSpendLimit) + " Coins" : "") + ")" +
            (abgelaufen ? " oder ihr Live-Filter ist abgelaufen." : "."), "done", false, "filter");
        }
        break;
      }
      const target = available[turn % available.length];
      turn += 1;
      STATE.netzRundeFehler = false;
      // FST-Modus (Punkt 3): Ein Live-Filter laeuft nicht mehr ab, aber der
      // Preis darunter wird alt. Einmal je Spieler eine gelbe Meldung.
      if (STATE.fstModus === true && Number(target.liveBis) > 0 && Date.now() > Number(target.liveBis)) {
        if (!run.altGewarnt) run.altGewarnt = new Set();
        if (!run.altGewarnt.has(target.key)) {
          run.altGewarnt.add(target.key);
          const altText = "Der Preis ist älter als 15 Minuten: " + playerLabel(target) + ". Der Lauf geht weiter.";
          warn(altText);
          pushEvent("warn", altText);
        }
      }
      // Der Abstand wechselt nach jeder Pause - das Menue braucht ihn fuer den Balken.
      run.pauseEvery = nextBreak.every;
      run.nextPauseIn = Math.max(0, nextBreak.every - sinceBreak);
      run.currentTarget = {
        key: target.key,
        playerId: target.playerId,
        playerName: target.playerName,
        rating: target.rating,
        maxPrice: target.maxPrice,
        expiresAt: Number(target.expiresAt) || 0,
        // Seit 25.09.2026 faehrt der erwartete Verkaufspreis mit. Im
        // Live-Fenster stand bisher nur der Zielpreis - ob die Spanne
        // ueberhaupt noch lohnt, war waehrend des Laufs nicht zu sehen.
        // Gekauft wird weiter nach maxPrice; das hier ist reine Anzeige.
        salePrice: Number(target.salePrice) || 0
      };
      try {
        const auctions = await search(target, run);
        // Wie FST nach jeder Suchrunde (28.09.2026, scripts.js Z. 58590):
        // mit dem Schalter die Merkliste "Nicht zugewiesen" leeren. Nur eine
        // Fenster-Nachricht an die Web App - keine EA-Anfrage.
        // Nur wenn dort etwas liegt (oder der Stand unbekannt ist). Bei laengst
        // leerer Merkliste waere es jede Runde eine Nachricht plus ein ganzes
        // reportStapel - Rauschen im Vier-Sekunden-Takt.
        if (STATE.nichtZugewiesenUnbegrenzt && (STAPEL.nichtZugewiesen === null || STAPEL.nichtZugewiesen > 0)) unassignedLeeren();
        const gesuchtUm = Date.now();
        if (!isCurrent(token)) break;
        settleBids(run, auctions);

        // Einmal pro Filter sagen, warum er ab jetzt uebersprungen wird.
        const progress = run.perTarget.get(target.key);
        if (filterTooBroad(target, run) && !progress.broadNoted) {
          progress.broadNoted = true;
          const grund = progress.zuVieleTreffer
            ? progress.zuVieleTreffer + " Angebote bis " + fmt(target.maxPrice) + " Coins in einer einzigen Suche"
            : "durchgehend volle Trefferseiten bis " + fmt(target.maxPrice) + " Coins";
          const text = "Spieler übersprungen: " + playerLabel(target) + " – " + grund +
            ". Der Zielpreis liegt damit über dem Marktpreis. Aus dieser Suche wurde nichts gekauft.";
          warn(text);
          setMessage(text, "warn");
          pushEvent("warn", text);
        }

        // Zu weit gefasst: aus dieser Suche nichts kaufen (auch nicht bieten).
        const zuWeitJetzt = filterTooBroad(target, run);
        // Billigster zuerst: EA liefert nach Restzeit sortiert, nicht nach Preis.
        // Kommt nach dem ersten Kauf die Pause, soll das beste Angebot schon weg sein.
        const hits = zuWeitJetzt ? [] : auctions.filter((a) => isTarget(a, target)).sort((a, b) => bin(a) - bin(b));
        if (auctions.length > 0 && hits.length === 0) logMismatch(auctions, target);
        // Gesehene Angebote fuer den Hinweis "kein Angebot bis ..." zaehlt
        // search() - dort ist bekannt, wonach EA gefiltert hat.

        // Ist seit hier schon eine Kauf- oder Gebotsanfrage rausgegangen,
        // steht vor jeder weiteren aus dieser Suche eine Pause - egal ob die
        // erste gekauft, verpasst oder fehlgeschlagen ist. Reihenfolge:
        // pruefen, warten, noch einmal pruefen. Waere ohnehin Schluss (z. B.
        // Max. Kaeufe erreicht), wird gar nicht erst gewartet. Und was
        // waehrend der Pause unzulaessig wurde (STOP, Drosselung, Zeitlimit,
        // Budget ...), wird danach nicht mehr gekauft.
        const anfragenVorher = run.kaufAnfragen || 0;
        const schonAngefragt = () => (run.kaufAnfragen || 0) > anfragenVorher;
        // Die Untergrenze zwischen zwei Kaufanfragen gilt auch ueber
        // Rundengrenzen hinweg (28.09.2026). Bis dahin setzte nur
        // schonAngefragt() die Pause durch - und das gilt nur INNERHALB
        // dieser Trefferliste. Seit ein Kaufversuch die Liste beendet, kommt
        // der naechste Versuch aus einer neuen Runde, nach einer einzigen
        // Suche von 3-4 Sekunden. Zwei Kaufanfragen in unter 8 Sekunden sind
        // genau das Muster, das am 22.09. zu HTTP 426 und zur Sperre fuehrte.
        // kaufAbstand rechnet selbst nur die FEHLENDE Zeit aus.
        // FST-Modus: FST hat keine Untergrenze (nur 5-6,5 s nach einem Kauf).
        const zuFruehNachLetzterAnfrage = () => STATE.fstModus !== true && Boolean(run.letzteKaufAnfrageAt) &&
          Date.now() - run.letzteKaufAnfrageAt < CONFIG.BUY_GAP_FLOOR_MS;
        // Wie FST: Nach dem ERSTEN Kaufversuch ist diese Trefferliste
        // hinfaellig - auch wenn der Versuch danebenging (28.09.2026).
        // FST kauft je Suche nur das erste Angebot (scripts.js Z. 58276:
        // buyItem(t[0])) und ruft danach searchAgain - nach dem Erfolg wie
        // im Fehlerfall (Z. 58306-58332, auch der catch ruft searchAgain).
        // Grund: War jemand schneller, ist die Liste alt - die restlichen
        // Angebote sind meist auch weg, jede weitere Kaufanfrage zaehlt
        // aber aufs Tageslimit. Die naechste Runde sucht ohnehin frisch,
        // das kostet keine zusaetzliche Suche.
        // Gezaehlt wird nur, was wirklich rausging: Lehnt eine Pruefung den
        // Versuch vorher ab, laeuft die Liste weiter.
        // Haken aus: alter Weg, weitere Angebote aus derselben Liste,
        // solange sie juenger als 15 Sekunden ist.
        // FST-Modus: genau EIN Kaufversuch je Suche, immer. Das steht schon in
        // der Einstellung (validateConfig setzt nachKaufNeuSuchen dort fest auf true).
        const neuSuchenJetzt = () => cfg.nachKaufNeuSuchen !== false && schonAngefragt();

        for (const auction of hits) {
          // Seit 25.09.2026 wird auch das Alter der Trefferliste geprueft -
          // darum geht der Zeitpunkt der Suche mit. Wichtig ist die zweite
          // Pruefung nach der Pause: Erst dort ist die Liste alt geworden.
          let pruefung = kaufPruefung(auction, target, run, token, gesuchtUm);
          if (pruefung === "los" && (schonAngefragt() || zuFruehNachLetzterAnfrage())) {
            await kaufAbstand(run, token);
            pruefung = kaufPruefung(auction, target, run, token, gesuchtUm);
          }
          if (pruefung === "ende") break;
          if (pruefung === "weiter") continue;
          await buy(auction, target, run);
          // Kaufversuch rausgegangen - geklappt oder nicht - und der Haken
          // ist an: raus aus der alten Liste (28.09.2026). Die naechste
          // Runde sucht frisch, wie FSTs searchAgain.
          if (neuSuchenJetzt()) break;
        }
        // Nach einem KAUFVERSUCH gilt die Liste auch fuer Gebote als
        // hinfaellig (28.09.2026) - sonst ginge aus derselben alten Liste
        // doch noch eine Anfrage raus, und der Punkt waere nur halb
        // umgesetzt. FST bietet nach einem Fehlversuch auch nicht, es
        // sucht neu.
        if (cfg.bidSniping && !zuWeitJetzt && !neuSuchenJetzt()) {
          // Gleiche Regel fuer Gebote: auch zwischen einem Kauf und einem
          // Gebot aus derselben Suche liegt die Pause.
          const bids = auctions.filter((auction) => isBidTarget(auction, target, run));
          for (const auction of bids) {
            let pruefung = gebotPruefung(auction, target, run, token, gesuchtUm);
            if (pruefung === "los" && (schonAngefragt() || zuFruehNachLetzterAnfrage())) {
              await kaufAbstand(run, token, true);
              pruefung = gebotPruefung(auction, target, run, token, gesuchtUm);
            }
            if (pruefung === "ende") break;
            if (pruefung === "weiter") continue;
            await placeBid(auction, target, run);
          }
        }
      } catch (e) {
        if (e instanceof HardStop) {
          stop(e.message, "error");
          break;
        }
        // FST-Modus (Punkt 6): wie ein Netzfehler zaehlen, nicht als Suchfehler.
        countError(STATE.fstModus === true ? "netz" : "search", "Unerwarteter Fehler: " + e.message);
      }

      // Punkt 6: Eine Runde ohne Netzfehler setzt den Zaehler "in Folge" zurueck.
      if (!STATE.netzRundeFehler) STATE.netzErrors = 0;
      sinceBreak += 1;
      // Stellt der Bot selbst ein ("Gleich verkaufen"), sieht er zwischendurch
      // nach, ob etwas verkauft wurde - sonst laeuft die Liste voll.
      // every === 0 heisst "keine Pausen" (27.09.2026). Ohne diesen Zusatz
      // waere "sinceBreak < 0" immer falsch und dieser Blick in die
      // Transferliste fiele bei "aus" ganz weg. Und weil es ohne Pausen auch
      // keinen Blick WAEHREND der Pause gibt, waere die Verkaufs-Wache dann
      // voellig blind - die Liste liefe unbemerkt voll.
      if (cfg.afterBuy === "list" && VERKAUFS_WACHE.offen > 0 && (nextBreak.every === 0 || sinceBreak < nextBreak.every) &&
          run.stats.scans - (run.wacheScan || 0) >= (STATE.fstModus === true ? CONFIG.FST.VERKAUF_CHECK_EVERY_SEARCHES : CONFIG.VERKAUF_CHECK_EVERY_SEARCHES) && isCurrent(token)) {
        run.wacheScan = run.stats.scans;
        // FST-Modus (Punkt 9): vor der Verkaufskontrolle 980-1270 ms Ruhe
        // (scripts.js Z. 58573-58587).
        if (STATE.fstModus === true) {
          await wait(randomBetween(CONFIG.FST.KONTROLLE_VOR_MIN_MS, CONFIG.FST.KONTROLLE_VOR_MAX_MS), token);
          if (!isCurrent(token)) break;
        }
        const haltT = await verkaeufePruefen(run, token, "takt");
        if (haltT) {
          stop(haltT.text, haltT.level);
          break;
        }
      }
      run.nextPauseIn = Math.max(0, nextBreak.every - sinceBreak);
      // every groesser 0 (27.09.2026): Bei der Einstellung "keine Pausen" ist
      // every gleich 0. Ohne diese Abfrage waere "1 >= 0" wahr und der Bot
      // machte nach JEDER Suche eine Pause von 0 Sekunden, mit Meldung.
      if (nextBreak.every > 0 && sinceBreak >= nextBreak.every && isCurrent(token)) {
        breaksTaken += 1;
        // 27.09.2026: Hier stand "Rest bei Teilung durch longEvery". Das ging
        // nur, solange longEvery fest 4 war. Jetzt streut die Zahl, und ein
        // Teiler, der sich aendert, wuerde die lange Pause mal doppelt
        // ausloesen und mal ganz verschlucken. Also zaehlen wir schlicht die
        // kurzen Pausen seit der letzten langen und setzen unten zurueck.
        const lange = breaksTaken >= nextBreak.longEvery;
        const dauer = lange ? nextBreak.longMs : nextBreak.ms;
        const msg = (lange ? "Längere Sicherheitspause für " : "Sicherheitspause für ") +
          Math.ceil(dauer / 1000) + " Sekunden.";
        setMessage(msg, "warn");
        pushEvent("pause", msg);
        // Ende der Pause fuers Menue: Es zeigt dann "noch 42 s" statt nur
        // "Pause laeuft …" mit leerem Balken.
        run.pauseBis = Date.now() + dauer;
        run.pauseDauer = dauer;
        // Waehrend der Pause in die Transferliste sehen. Das laeuft neben der
        // Pause her und kostet keine Suchzeit; gelesen wird aus dem Speicher
        // der App, also ohne Anfrage an EA.
        const wache = verkaeufePruefen(run, token, "pause").catch(() => null);
        await wait(dauer, token);
        run.pauseBis = 0;
        const haltP = await wache;
        if (haltP) {
          stop(haltP.text, haltP.level);
          break;
        }
        if (!isCurrent(token)) break;
        sinceBreak = 0;
        // Nach einer langen Pause faengt das Zaehlen der kurzen neu an
        // (27.09.2026, gehoert zur gestreuten Zahl der langen Pausen).
        if (lange) breaksTaken = 0;
        nextBreak = breakPlan(cfg);
        run.pauseEvery = nextBreak.every;
        run.nextPauseIn = nextBreak.every;
        if (isCurrent(token)) setMessage(runningMessage(cfg), "run");
      }
      await wait(Math.max(searchDelay(cfg), STATE.pauseUntil - Date.now()), token);
    }

    // Nur der aktuelle Loop darf "running" zuruecksetzen (sonst killt ein alter
    // Loop nach STOP und schnellem START den neuen).
    if (token === STATE.token) {
      STATE.running = false;
      fstAbgleichen();
    }
    // Was dieser Filter verbraucht hat, kommt auf das Konto der Rotation.
    if (ROTATION.aktiv && run.rotationKarte === ROTATION.karte) {
      ROTATION.ausgegeben += run.stats.spent;
      ROTATION.suchen += run.stats.scans;
      ROTATION.kaeufe += run.stats.bought;
    }

    // Noch offene Gebote zum Schluss klaeren: Ein Zuschlag, der erst nach dem
    // Stoppen sichtbar wird, soll trotzdem im Kauflog landen.
    const ungeklaert = () => (run.unclearBids ? run.unclearBids.size : 0);
    if ((run.openBids.size || ungeklaert()) && extensionAlive()) {
      WATCHLIST.lastAt = 0;
      try {
        await settleViaWatchlist(run, true);
      } catch (e) {
        warn("Abschliessende Gebotsprüfung: " + e.message);
      }
    }
    if (run.openBids.size) {
      warn(run.openBids.size + " Gebot(e) noch offen. Ausgang bitte in der Web App prüfen.");
    }
    if (ungeklaert()) {
      warn(ungeklaert() + " Gebot(e) ohne erkennbaren Ausgang (" + unclearBidTotal(run) + " Coins). Ausgang bitte in der Web App prüfen.");
    }

    if (!extensionAlive()) warn("Extension wurde neu geladen, Bot gestoppt. Tab neu laden.");
    log("Beendet.", run.stats);
    await recordRun(run);
  }

  function start(rawCfg) {
    const rest = cooldownLeftMin();
    if (rest > 0) {
      return { ok: false, error: "Start gesperrt für noch " + rest + " Min. Grund: " + (STATE.cooldownReason || "Sicherheitspause") +
        " Kurz danach weiterzumachen ist der häufigste Fehler." };
    }
    const fremd = andererTabAktiv();
    if (fremd) return { ok: false, error: fremd };
    if (transactionPending) return { ok: false, error: "Eine Kauf-/Gebotsantwort steht noch aus. Bitte kurz warten." };
    if (STATE.running) return { ok: false, error: "Läuft bereits. Erst stoppen." };
    if (STATE.check.running) return { ok: false, error: "Preis-Check läuft noch. Gleich nochmal starten." };
    if (STATE.marketScan.running) return { ok: false, error: "EA-Live-Scan läuft noch. Gleich nochmal starten." };
    if (!SESSION.sid) {
      return { ok: false, error: "Noch nicht mit der Web App verbunden. Öffne dort einmal den Transfermarkt und starte dann erneut." };
    }
    const suchseiteZu = suchseiteProblem();
    if (suchseiteZu) {
      return { ok: false, error: suchseiteZu };
    }
    // Rotation: Ohne gueltige Karte startet kein weiterer Filter (F4).
    const rotKarte = toInt(rawCfg && rawCfg.rotationKarte) || 0;
    if (rotKarte) {
      const nein = rotationGueltig(rotKarte);
      if (nein) return { ok: false, error: nein, rotation: rotationStand() };
    }
    const result = validateConfig(rawCfg);
    if (result.error) return { ok: false, error: result.error };
    // Harte Bremse gegen denselben Filter zweimal hintereinander
    // (25.09.2026). Die Leiste sortiert ihn zwar ans Ende, aber bei nur einem
    // Kandidaten stand er wieder vorn. Diese Entscheidung darf die Leiste
    // nicht allein treffen - hier ist der Riegel.
    if (rotKarte) {
      const letzter = ROTATION.letzte[0];
      const neuerKey = result.cfg.targets[0] && result.cfg.targets[0].key;
      // FST-Modus: Der Filter-Cooldown ist bei FST nur ein weiches Abzeichen
      // (scripts.js Z. 35505-35620), kein Verbot.
      if (STATE.fstModus !== true && letzter && letzter.key === neuerKey && Date.now() - letzter.t < CONFIG.ROTATION_GLEICHER_FILTER_MS) {
        return { ok: false, error: "Dieser Filter lief gerade eben. Erst muss ein anderer dazwischen oder " +
          Math.round(CONFIG.ROTATION_GLEICHER_FILTER_MS / 60000) + " Minuten vergehen.", rotation: rotationStand() };
      }
    }
    const coins = muenzenBekannt();
    const billigster = Math.min(...result.cfg.targets.map((t) => t.maxPrice));
    if (coins !== null && coins < billigster) {
      return { ok: false, error: "Zu wenig Coins: " + fmt(coins) + " – der niedrigste Zielpreis ist " + fmt(billigster) + "." };
    }
    // Wie FST beim Start (28.09.2026, scripts.js Z. 58809): mit dem Schalter
    // die Merkliste "Nicht zugewiesen" der Web App leeren, bevor der Platz
    // geprueft wird. Kostet keine EA-Anfrage. Der sniffer meldet direkt
    // danach den neuen Stand (reportStapel).
    if (STATE.nichtZugewiesenUnbegrenzt) unassignedLeeren();
    const platz = platzProblem(result.cfg);
    if (platz) return { ok: false, error: platz };

    STATE.cfg = result.cfg;
    STATE.stats = newStats();
    STATE.searchErrors = 0;
    STATE.buyErrors = 0;
    // Neuer Lauf, neue Lage: Die Bremse aus dem letzten Lauf gilt nicht mehr
    // (25.09.2026).
    STATE.bremsStufe = 0;
    STATE.bremsBis = 0;
    // Modus pro Lauf (Punkt 7): Der Haken wird JETZT gelesen und gilt bis zum
    // Ende dieses Laufs. Eine Umstellung waehrend des Laufs wirkt erst beim
    // naechsten Start.
    STATE.fstModus = STATE.fstEinst === true;
    STATE.netzErrors = 0;
    STATE.running = true;
    STATE.token += 1;
    // anfragen: Kaufversuche je Spieler, auch die gescheiterten (25.09.2026).
    const perTarget = new Map(result.cfg.targets.map((t) => [t.key, { bought: 0, bids: 0, spent: 0, bidCommitted: 0, missed: 0, scans: 0, anfragen: 0 }]));
    STATE.run = { token: STATE.token, cfg: result.cfg, stats: STATE.stats, perTarget, openBids: new Map(), unclearBids: new Map(), bidAttempts: new Map(), startedAt: Date.now(), reason: null, currentTarget: null, recentEvents: [], nextPauseIn: 0, pauseEvery: 0, trefferGesehen: 0, kaufAnfragen: 0, wacheScan: 0, rotationKarte: rotKarte, fst: STATE.fstModus === true };
    if (rotKarte) {
      ROTATION.filterNr += 1;
      ROTATION.pauseBis = 0;
      rotationMerken(result.cfg.targets[0] && result.cfg.targets[0].key);
    }
    // Verkaufs-Wache fuer diesen Lauf zuruecksetzen (F3).
    Object.assign(VERKAUFS_WACHE, { frischImLauf: 0, abgeraeumt: 0, halt: null, stummBis: 0, seitStart: { anzahl: 0, erloes: 0, gewinn: 0, mitKauf: 0 } });
    VERKAUF.neuVerkauft = [];
    setMessage(runningMessage(result.cfg), "run");
    loop(STATE.token).catch((e) => stop("Interner Fehler: " + e.message, "error"));
    besitzAntreten();
    tonVorbereiten(); // Start-Klick zaehlt fuer Chrome als Freigabe fuer Ton
    return { ok: true, cfg: result.cfg };
  }

  function status() {
    // Zaehler nachrechnen. Frueher wurden sie nur bei einer neuen Suche neu
    // gezaehlt: Nach 2 Stunden Stillstand stand oben noch "diese Stunde:
    // 150/150", und der Start-Dialog warnte vor einem Limit, das laengst frei war.
    if (STATE.usageDaten) {
      const jetzt = Date.now();
      updateUsageState(pruneUsage(STATE.usageDaten, jetzt), jetzt);
    }
    // Nach einem Extension-Neuladen kann das neue Content-Script die bereits
    // bekannte Sitzung verpasst haben. Der Sniffer gibt sie auf Anfrage erneut aus.
    if (!SESSION.sid) window.postMessage({ __ownbot: "session?" }, window.location.origin);
    const check = STATE.check;
    return {
      protocolVersion: 11,
      running: STATE.running,
      message: STATE.message,
      level: STATE.level,
      hint: runHint(),
      currentTarget: STATE.run && STATE.run.currentTarget ? STATE.run.currentTarget : null,
      recentEvents: STATE.run && STATE.run.recentEvents ? STATE.run.recentEvents.slice(-20) : [],
      nextPauseIn: STATE.run ? STATE.run.nextPauseIn : 0,
      pauseEvery: STATE.run ? STATE.run.pauseEvery || 0 : 0,
      pauseBis: STATE.run ? STATE.run.pauseBis || 0 : 0,
      pauseDauer: STATE.run ? STATE.run.pauseDauer || 0 : 0,
      runStartedAt: STATE.run ? STATE.run.startedAt : 0,
      // Die Grenzen dieses Laufs (25.09.2026). Bisher kamen sie nie in der
      // Leiste an: Dort stand "Laufzeit: 7 Min." und "gekauft: 2", ohne dass
      // jemand sah, wie weit der Lauf ist. Mit maxBuys, timeLimitMin und
      // budget rechnet die Leiste "2 / 10" und "noch 23 Min." aus - reine
      // Anzeige, es wird dadurch nichts frueher und nichts oefter gesucht.
      // Seit 27.09.2026 gehen auch Tempo, Pausen, die Grenzen je Spieler und
      // "Nach dem Kauf" mit. Grund: Sobald der Lauf beginnt, blendet die Leiste
      // alle Einstellfelder aus. Nach einer Stunde Zuschauen weiss niemand mehr,
      // mit welchen Werten der Lauf gestartet ist. FUT Simple Trader hat dafuer
      // einen Streifen "Settings overview" (scripts.js Z. 43700-43758).
      // Wichtig: Es sind die Werte DIESES Laufs, nicht die Felder in der Maske -
      // die kann der Nutzer inzwischen umgestellt haben.
      // Reine Anzeige: Es wird dadurch nichts gesucht und nichts gekauft.
      grenzen: STATE.run && STATE.run.cfg
        ? {
            // FST-Modus: "ohne Grenze" (MAX_SAFE_INTEGER) wird als 0 gemeldet - die
            // Leiste zeigt dann keine Riesenzahl.
            maxBuys: STATE.run.cfg.maxBuys >= Number.MAX_SAFE_INTEGER ? 0 : STATE.run.cfg.maxBuys || 0, timeLimitMin: STATE.run.cfg.timeLimitMin || 0,
            // Ohne Grenze keine Riesenzahl anzeigen (28.09.2026): 0 plus
            // Merker - die Leiste schreibt dann "Budget ohne Grenze".
            budget: STATE.run.cfg.budgetUnbegrenzt ? 0 : STATE.run.cfg.budget || 0,
            budgetUnbegrenzt: Boolean(STATE.run.cfg.budgetUnbegrenzt),
            speedMode: STATE.run.cfg.speedMode || "", pausePreset: STATE.run.cfg.pausePreset || "",
            filterSearchLimit: STATE.run.cfg.filterSearchLimit >= Number.MAX_SAFE_INTEGER ? 0 : STATE.run.cfg.filterSearchLimit || 0,
            filterBuyLimit: STATE.run.cfg.filterBuyLimit >= Number.MAX_SAFE_INTEGER ? 0 : STATE.run.cfg.filterBuyLimit || 0,
            filterSpendLimit: STATE.run.cfg.filterSpendLimit || 0, afterBuy: STATE.run.cfg.afterBuy || "",
            bidSniping: Boolean(STATE.run.cfg.bidSniping)
          }
        : null,
      activeBids: STATE.run && STATE.run.openBids ? Array.from(STATE.run.openBids.entries()).map(([tradeId, b]) => ({
        tradeId,
        amount: b.amount,
        playerName: b.playerName,
        rating: b.rating,
        secondsLeft: b.expiresAt ? Math.max(0, Math.round((b.expiresAt - Date.now()) / 1000)) : null
      })) : [],
      targets: STATE.run
        ? STATE.run.cfg.targets.map((t) => Object.assign({ key: t.key, playerName: t.playerName, rating: t.rating, maxPrice: t.maxPrice }, STATE.run.perTarget.get(t.key)))
        : [],
      stats: Object.assign({}, STATE.stats),
      openBids: STATE.run && STATE.run.openBids ? { count: STATE.run.openBids.size, coins: openBidTotal(STATE.run) } : { count: 0, coins: 0 },
      unclearBids: STATE.run && STATE.run.unclearBids ? { count: STATE.run.unclearBids.size, coins: unclearBidTotal(STATE.run) } : { count: 0, coins: 0 },
      credits: STATE.credits,
      creditsAt: STATE.creditsAt,
      creditsQuelle: STATE.creditsQuelle,
      session: Boolean(SESSION.sid),
      ton: { kauf: TON.kauf, ende: TON.ende, zustand: TON.ctx ? String(TON.ctx.state || "") : "" },
      apiHost: SESSION.base ? new URL(SESSION.base).host : null,
      check: { running: check.running, token: check.token, searches: check.searches, error: check.error, message: check.message },
      marketScan: {
        running: STATE.marketScan.running,
        searches: STATE.marketScan.searches,
        // Obergrenze der Scan-Anfragen - das Menue zeigt "Anfrage X von Y".
        maxSearches: CONFIG.MARKET_SCAN_MAX_REQUESTS,
        filter: STATE.scanFilter,
        // Was gerade laeuft - fuer die Schritte im Ladebalken.
        phase: STATE.marketScan.phase || "",
        error: STATE.marketScan.error,
        code: STATE.marketScan.code || 0,
        message: STATE.marketScan.message
      },
      // FST-Modus (01.10.2026): Die Leiste zeigt, was der Motor WIRKLICH benutzt.
      fstModus: STATE.fstModus === true,
      // Der Haken aus den Einstellungen. Waehrend eines Laufs kann er vom
      // wirksamen Wert abweichen (Punkt 7): Dann gilt er erst ab dem naechsten Lauf.
      fstEinstellung: STATE.fstEinst === true,
      // Abstand zwischen zwei Markt-Scans der Rotation im FST-Modus (Punkt 4a).
      autoScanMs: CONFIG.AUTO_SCAN_INTERVAL_MS,
      usage: Object.assign({
        keineGrenzen: STATE.fstModus === true,
        searchLimitHour: suchLimitStunde(),
        // Das WIRKSAME Tageslimit (mit Ausnahme hoeher) - danach richten
        // sich Start-Dialog, Filter-Seite und Autopilot.
        searchLimitDay: suchLimitTag(),
        searchLimitDayNormal: STATE.fstModus === true ? CONFIG.OHNE_GRENZE : CONFIG.SEARCH_LIMIT_DAY,
        // Sind die Grenzen selbst hochgesetzt? Die Leiste sagt es dazu -
        // sonst wundert man sich spaeter, warum der Bot mehr sucht als
        // frueher, und sucht den Fehler an der falschen Stelle.
        grenzenEigen: STATE.fstModus !== true && (suchLimitStunde() !== CONFIG.SEARCH_LIMIT_HOUR ||
          grenzeLesen("suchTag", CONFIG.SEARCH_LIMIT_DAY, CONFIG.GRENZE_MAX_TAG) !== CONFIG.SEARCH_LIMIT_DAY),
        searchWarnHour: STATE.fstModus === true ? CONFIG.OHNE_GRENZE : CONFIG.SEARCH_WARN_HOUR,
        searchWarnDay: STATE.fstModus === true ? CONFIG.OHNE_GRENZE : CONFIG.SEARCH_WARN_DAY,
        buyLimitDay: STATE.fstModus === true ? CONFIG.OHNE_GRENZE : CONFIG.BUY_LIMIT_DAY,
        actionLimitDay: STATE.fstModus === true ? CONFIG.OHNE_GRENZE : CONFIG.ACTION_LIMIT_DAY,
        // Seit 23.09.2026: Stundenbremse auch fuer Kaeufe und Aktionen, dazu
        // der Deckel ueber allem. Die Leiste soll dieselben Zahlen nennen.
        buyLimitHour: STATE.fstModus === true ? CONFIG.OHNE_GRENZE : CONFIG.BUY_LIMIT_HOUR,
        actionLimitHour: STATE.fstModus === true ? CONFIG.OHNE_GRENZE : CONFIG.ACTION_LIMIT_HOUR,
        gesamtLimitHour: STATE.fstModus === true ? CONFIG.OHNE_GRENZE : CONFIG.GESAMT_LIMIT_HOUR,
        gesamtLimitDay: gesamtLimitTag(),
        // Punkt 8: Der Zaehler "Heute" bleibt bei der Kappung stehen. Die Leiste
        // zeigt dann "1500+" statt einer Zahl, die nicht mehr stimmt.
        searchesDayGekappt: STATE.fstModus === true && Number(STATE.usage.searchesDay) >= CONFIG.FST.ZAEHLER_MAX_SUCHEN,
        cardLimitDay: STATE.fstModus === true ? CONFIG.OHNE_GRENZE : CONFIG.CARD_LIMIT_DAY,
        // Wann wieder Suchen frei werden (25.09.2026). Damit sagt die
        // Rotation eine echte Wartezeit statt nur "Budget reicht nicht".
        stundeFreiIn: stundenFensterFrei()
      }, STATE.usage),
      cooldown: { leftMin: cooldownLeftMin(), reason: STATE.cooldownReason || "" },
      rotation: rotationStand(),
      // 27.09.2026: Hat die Filter-Wache einen laufenden Live-Filter
      // verlaengert, muss die Leiste das erfahren - sonst haelt sie ihn fuer
      // abgelaufen und beendet die Rotation.
      filterVerlaengert: STATE.filterVerlaengert || null,
      letzterStopp: STATE.letzterStopp || null,
      verkauf: { laeuft: VERKAUF.laeuft, art: VERKAUF.art, meldung: VERKAUF.meldung, fehler: VERKAUF.fehler, stand: VERKAUF.stand },
      nutzungsdaten: typeof STATE.nutzungsdaten === "boolean" ? STATE.nutzungsdaten : null,
      fremderBot: fremderBot(),
      suchweg: STATE.suchweg === "app" ? "app" : "direkt",
      // Der wirklich genommene Weg, nicht nur der eingestellte (27.09.2026).
      // "suchweg" oben sagt, was EINGESTELLT ist - das ist nicht dasselbe.
      suchwegStat: { app: SUCHWEG_STAT.app, direkt: SUCHWEG_STAT.direkt, grund: SUCHWEG_STAT.grund },
      gedaechtnis: { karten: GEDAECHTNIS.karten, offen: GEDAECHTNIS.puffer.size },
      suchseite: {
        pflicht: suchseitePflicht(), offen: suchseiteOffen(), seite: SUCHSEITE.seite, at: SUCHSEITE.at,
        rarity: SUCHSEITE.rarity, rarityName: SUCHSEITE.rarityName
      },
      // Die Auswahllisten aus EAs Suchmaske - daraus baut die Leiste ihre
      // eigenen Auswahlfelder mit lesbaren Namen.
      filterListen: FILTERLISTEN.listen,
      verkaufsWache: {
        an: STATE.verkaufWache,
        autoAbraeumen: STATE.autoAbraeumen,
        anzahl: VERKAUFS_WACHE.seitStart.anzahl,
        erloes: VERKAUFS_WACHE.seitStart.erloes,
        gewinn: VERKAUFS_WACHE.seitStart.gewinn,
        mitKauf: VERKAUFS_WACHE.seitStart.mitKauf,
        offen: VERKAUFS_WACHE.offen,
        liste: VERKAUFS_WACHE.anzahl,
        frischAt: VERKAUFS_WACHE.frischAt,
        frischImLauf: VERKAUFS_WACHE.frischImLauf,
        abgeraeumt: VERKAUFS_WACHE.abgeraeumt
      },
      stapel: { transfer: STAPEL.transfer, nichtZugewiesen: STAPEL.nichtZugewiesen, weg: STAPEL.weg, at: STAPEL.at },
      konto: { verein: KONTO.vereinsName, spieler: KONTO.spielerName, kader: KONTO.kader.length, at: KONTO.at },
      andererTab: andererTabAktiv(),
      ausnahme: ausnahmeStand(),
      health: {
        medianMs: medianResponseTime(),
        samples: STATE.health.times.length,
        slow: STATE.health.slow,
        throttle: throttleHint(STATE.run)
      },
      // Karten, die heute schon am Limit sind - damit das Popup es erklaeren kann.
      cardsAtLimit: STATE.fstModus === true ? [] : Object.keys(STATE.cardCounts || {}).filter((k) => STATE.cardCounts[k] >= CONFIG.CARD_LIMIT_DAY),
      // Speicherstand, damit die Leiste ihn zeigen kann (25.09.2026).
      speicher: { bytes: SPEICHER.bytes, grenze: SPEICHER.grenze, anteil: SPEICHER.anteil },
      autoFilters: STATE.autoFilters,
      priceTiers: PRICE_TIERS ? PRICE_TIERS.length : 0,
      itemFields: STATE.itemFields || null,
      endpoints: Object.assign({}, ENDPOINTS),
      endpointsChanged: endpointsChanged(),
      lastSearch: STATE.run ? STATE.run.lastSearch || null : null,
      probe: STATE.probe,
      playerListSeen: PLAYERS.seen,
      jsonFiles: PLAYERS.seen ? [] : jsonFileNames()
    };
  }

  // ---------------------------------------------------------------------------
  // Die Bedienung in der Web App.
  //
  // Frueher stand die Bedienung im Chrome-Popup und hier nur eine Anzeige.
  // Jetzt laeuft dieselbe popup.html als Rahmen mitten in der EA-Seite.
  // Eine Oberflaeche, ein Quelltext - kein Nachbau, der mit der Zeit
  // auseinanderlaeuft und an dem man jede Aenderung zweimal machen muss.
  //
  // Warum ein Rahmen und kein nachgebautes Menue:
  //  - Der Rahmen hat die Herkunft der Erweiterung. Die EA-Seite kann nicht
  //    hineinsehen, nichts anklicken und nichts auslesen. Das trennt der
  //    Browser selbst ueber die Herkunft, nicht wir ueber eine Verabredung.
  //  - Im Rahmen gibt es chrome.*, deshalb laeuft popup.js dort unveraendert.
  //  - popup.js hoert auf keine Fensternachrichten. Die Seite hat also auch
  //    keinen Weg hinein, den wir selbst gebaut haetten.
  //
  // Drumherum bleibt nur das Noetigste: ein schmaler Kopfstreifen mit Marke und
  // einem Punkt in der Farbe des Botzustands, ein Griff am linken Rand zum
  // Einklappen (wie bei FUT Simple Trader) und - nur im Lauf - ein kleiner
  // Stopp-Knopf. So sieht man eingeklappt, ob etwas laeuft, und kann es
  // anhalten.
  // ---------------------------------------------------------------------------

  const PANEL_CSS = `
    :host, * { box-sizing: border-box; }
    /* Ein Element mit hidden darf nie sichtbar bleiben, nur weil eine Regel
       unten display setzt (Stopp-Knopf und Einklapp-Griff sind Flex-Kaesten). */
    [hidden] { display: none !important; }

    /* Angedockte Leiste ueber die volle Hoehe am rechten Rand - so wie es die
       Web App gewohnt ist. Sie legt sich ueber die Seite und schiebt deren
       Inhalt nicht zur Seite; EAs eigenes Layout bleibt damit unberuehrt.
       Die Schale ist FUT Simple Traders Seitenleiste nachgebaut. Die Werte
       stehen wortgleich in deren style.css:
         .st-sidebar        Z. 14  : Breite 415px, max-width 90%
         .st-sidebar        Z. 52  : Schrift .875rem / 1.5 / Roboto, Arial
         .st-sidebar__wrapper Z. 114: Rand links #0C0F14, Flaeche #141B24,
                                     Textfarbe rgba(255,255,255,.87)
       Die Schale steht in einem eigenen Shadow Root und sieht die Variablen
       des Inhalts (popup-design.css) nicht. Darum stehen die Farben hier noch
       einmal, von dort abgeschrieben (Stand 30.09.2026) - aendert sich dort
       die Palette, hier mitziehen:
         --bg = Seite, --karte = Karte, --karte2 = #1f2834 (FST Z. 202ff),
         --griff = Einklapp-Griff #273545 (FST Z. 158ff),
         --linie = Haarlinie, --cyan = Akzent, --gruen/--gelb/--rot = Zustaende,
         --text/--muted/--faint = Textstufen. */
    .box {
      position: fixed; top: 0; right: 0; bottom: 0; z-index: 2147483000;
      /* 415px - dieselbe Breite, die FUT Simple Trader benutzt (in deren
         style.css nachgemessen: .st-sidebar { width: 415px; max-width: 90% }).
         Gemessen: Unsere grosse Schriftstufe passt dort ohne Ueberlauf. */
      width: 415px; max-width: 90%;
      display: flex; flex-direction: column;
      --bg: #141B24;
      --karte: #161d27;
      --karte2: #1F2834;
      --griff: #273545;
      --rand: #0C0F14;
      --linie: rgba(255,255,255,.07);
      --cyan: #00CAF6;
      --gruen: #16C784;
      --gelb: #FFC466;
      --rot: #FF6B6B;
      --text: rgba(255,255,255,.87);
      --muted: #949DB0;
      --faint: #6B7383;
      border-left: 1px solid var(--rand);
      background: var(--bg); color: var(--text);
      font-size: .875rem; line-height: 1.5; font-family: Roboto, Arial, sans-serif;
      color-scheme: dark;
      box-shadow: -.5rem 0 2rem rgba(15, 0, 0, .2);
      /* Bewusst ohne Uebergang (FST: transition width .3s): Die Seite daneben
         wird auf die gemessene Breite der Leiste geschmaelert. Waehrend einer
         Animation misst man einen Zwischenwert, und die Seite bliebe auf der
         falschen Breite stehen. Sofort umschalten ist hier richtiger als huebsch. */
    }
    /* Keine Stufen nach unten. FST geht bei schmalen Fenstern auf 320 und
       dann 280px herunter - bei uns laufen dort die Reiterbeschriftungen
       ueber ("Einstellungen" ist laenger als alles, was dort steht), und die
       Leiste waere ploetzlich schmal, ohne dass jemand etwas geaendert hat.
       Es bleibt bei 415px; nur "max-width: 90%" greift auf sehr schmalen
       Fenstern. Bleibt fuer EA dann zu wenig uebrig, klemmt dessen eigene
       Mindestbreite von 800px - ohne Querbalken, weil html overflow-x
       verbirgt. Genau so haelt FST es auch. */

    /* Eingeklappt: FST Z. 568 - 3rem breit, Flaeche #141B24, das Zeichen
       (Logo) gross darin. Bei uns bleiben Punkt, Stopp-Knopf und der Name
       (senkrecht) zusaetzlich stehen: Eingeklappt sieht man so, ob etwas
       laeuft, und kann es anhalten. */
    .box.mini { width: 3rem; }
    .box.mini .halter { display: none; }
    .box.mini .griff { flex-direction: column; height: 100%; padding: 1rem 0; gap: .75rem; border-bottom: 0; }
    .box.mini .dot { margin: 0; }
    .box.mini .name { writing-mode: vertical-rl; text-orientation: mixed; flex: none; letter-spacing: .04em; }
    .box.mini .neu-laden { display: none; }
    /* Reihenfolge eingeklappt: Zeichen, Punkt, Stopp, Name. */
    .box.mini .dot { order: 1; }
    .box.mini .stopp { order: 2; }
    .box.mini .name { order: 3; }

    /* Kopfstreifen. Gleiche Aufteilung wie FSTs Kopfzeile (.brand-row, Z. 4747):
       Marke links, Knoepfe rechts, gap, vertikal mittig. Flaeche = Seite
       (FST zeichnet die Kopfzeile ohne eigene Flaeche), darunter die
       Haarlinie der Palette. Seitenrand 2rem wie FSTs body-Polster: Marke
       und Knoepfe sitzen auf derselben Linie wie Kacheln, Reiter und Inhalt. */
    .griff { display: flex; align-items: center; gap: .6rem; height: 3rem; padding: 0 2rem; flex: none;
      background: var(--bg); border-bottom: 1px solid var(--linie); }
    /* Das Logo ist das Fadenkreuz des Reiters "Snipen" - ein Zeichen fuer den
       ganzen Bot. Hoehe 1.5rem wie FSTs .st-sidebar__logo (Z. 212). */
    .logo { flex: none; width: 1.5rem; height: 1.5rem; background: var(--cyan);
      -webkit-mask: url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%2024%2024'%20fill%3D'none'%20stroke%3D'black'%20stroke-width%3D'2.2'%20stroke-linecap%3D'round'%20stroke-linejoin%3D'round'%3E%3Ccircle%20cx%3D'12'%20cy%3D'12'%20r%3D'8'%2F%3E%3Ccircle%20cx%3D'12'%20cy%3D'12'%20r%3D'3'%2F%3E%3Cpath%20d%3D'M12%201v4M12%2019v4M1%2012h4M19%2012h4'%2F%3E%3C%2Fsvg%3E") center / contain no-repeat;
      mask: url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%2024%2024'%20fill%3D'none'%20stroke%3D'black'%20stroke-width%3D'2.2'%20stroke-linecap%3D'round'%20stroke-linejoin%3D'round'%3E%3Ccircle%20cx%3D'12'%20cy%3D'12'%20r%3D'8'%2F%3E%3Ccircle%20cx%3D'12'%20cy%3D'12'%20r%3D'3'%2F%3E%3Cpath%20d%3D'M12%201v4M12%2019v4M1%2012h4M19%2012h4'%2F%3E%3C%2Fsvg%3E") center / contain no-repeat; }
    /* Schrift wie die Werte der Kacheln bei FST (.dash-tile__val, Z. 4797:
       fett, weiss), etwas groesser, damit der Name als Marke liest. */
    .name { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font-size: 1rem; font-weight: 700; line-height: 1.5; letter-spacing: .01em; color: #fff; }

    /* Der Punkt zeigt den Zustand des Bots: grau = steht, gruen = laeuft,
       gelb = Warnung, rot = Fehler. Gezeichnet wie FSTs Marktpunkt
       (.mkt-dot, Z. 6543: Punkt mit 3px-Ring), im Lauf mit FSTs Puls
       (Keyframes "mkt-pulse" Z. 4156, benutzt Z. 4322). margin-right: auto schiebt die Knoepfe nach rechts. */
    .dot { width: 8px; height: 8px; border-radius: 999px; background: var(--faint); flex: none; margin-right: auto;
      box-shadow: 0 0 0 3px rgba(107,115,131,.16);
      --puls: rgba(22,199,132,.55); --puls0: rgba(22,199,132,0);
      transition: background-color .3s, box-shadow .3s; }
    .dot.run { background: var(--gruen); box-shadow: 0 0 0 3px rgba(22,199,132,.16); }
    .dot.warn { background: var(--gelb); box-shadow: 0 0 0 3px rgba(255,196,102,.16);
      --puls: rgba(255,196,102,.55); --puls0: rgba(255,196,102,0); }
    .dot.error { background: var(--rot); box-shadow: 0 0 0 3px rgba(255,107,107,.16);
      --puls: rgba(255,107,107,.55); --puls0: rgba(255,107,107,0); }
    @keyframes schale-puls {
      0%   { box-shadow: 0 0 0 0 var(--puls); }
      70%  { box-shadow: 0 0 0 8px var(--puls0); }
      100% { box-shadow: 0 0 0 0 var(--puls0); }
    }
    /* Der Puls laeuft nur, wenn das System Bewegung erlaubt. */
    @media (prefers-reduced-motion: no-preference) {
      .dot.run, .dot.warn, .dot.error { animation: schale-puls 1.9s ease-out infinite; }
    }

    /* Knoepfe im Kopf. Wie FSTs Knopf in der Kopfzeile
       (.brand-row .st-sidebar__header__user-trigger, Z. 4760): Flaeche
       weiss 5 Prozent, Hover weiss 9 Prozent, Radius .45rem; Uebergang wie
       .st-sidebar button (Z. 72). Mindestens 32 x 32 Pixel. */
    button {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 32px; height: 32px; padding: 0; flex: none;
      border: 0; border-radius: .45rem; background: rgba(255,255,255,.05);
      color: var(--muted); font-size: 0; line-height: 1; cursor: pointer;
      transition: color .3s, background-color .3s, border-color .3s, opacity .3s;
    }
    button:hover { background: rgba(255,255,255,.09); color: #fff; }
    /* FST blendet den Fokusring ganz aus (outline: none !important). Wir
       nicht: Wer mit der Tastatur arbeitet, muss sehen, wo er steht. */
    button:focus-visible { outline: 2px solid var(--cyan); outline-offset: 2px; }
    /* Der Text im Knopf ("↻", "–", "Stopp") bleibt im Dokument - Screenreader
       und Tests lesen ihn -, sichtbar ist das gezeichnete Zeichen davor. */
    .neu-laden::before { content: ""; width: 16px; height: 16px; background: currentColor;
      -webkit-mask: url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%2024%2024'%20fill%3D'none'%20stroke%3D'black'%20stroke-width%3D'2.4'%20stroke-linecap%3D'round'%20stroke-linejoin%3D'round'%3E%3Cpath%20d%3D'M20%2011a8%208%200%201%200-2.3%205.7'%2F%3E%3Cpath%20d%3D'M20%204v7h-7'%2F%3E%3C%2Fsvg%3E") center / contain no-repeat;
      mask: url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%2024%2024'%20fill%3D'none'%20stroke%3D'black'%20stroke-width%3D'2.4'%20stroke-linecap%3D'round'%20stroke-linejoin%3D'round'%3E%3Cpath%20d%3D'M20%2011a8%208%200%201%200-2.3%205.7'%2F%3E%3Cpath%20d%3D'M20%204v7h-7'%2F%3E%3C%2Fsvg%3E") center / contain no-repeat; }
    /* Im Lauf gesperrt: blass und ohne Hover, damit er nicht klickbar wirkt
       (FST .auto-start__disabled, Z. 193: opacity .5). */
    .neu-laden:disabled, .neu-laden:disabled:hover { opacity: .5; cursor: default; background: rgba(255,255,255,.05); color: var(--muted); }

    /* Kleiner Stopp-Knopf, nur im Lauf sichtbar. Er klickt den Stopp-Knopf
       der Bedienung selbst - kein eigener Weg (siehe buildPanel). Rot wie FSTs
       Gefahr-Knopf (.ph-cbtn--danger, Z. 5627): Flaeche und Rand #EA3943,
       Text weiss, Hover dunkler. Eingeklappt bleibt nur das Quadrat. */
    .stopp { gap: .4rem; padding: 0 .75rem; font-size: .75rem; font-weight: 600; letter-spacing: .01em;
      background: #E0303A; border: 1px solid #E0303A; color: #fff; border-radius: .45rem; }
    .stopp::before { content: ""; width: 9px; height: 9px; border-radius: 2px; background: currentColor; flex: none; }
    .stopp:hover { background: #E0303A; color: #fff; filter: brightness(.92); }
    .box.mini .stopp { padding: 0; width: 32px; gap: 0; font-size: 0; }

    /* Einklapp-Griff am linken Rand der Leiste. FST Z. 158 bis 181
       (.st-sidebar__toggle), wortgleich: 1.25rem breit, 3.5rem hoch, mittig
       am Rand, links abgerundet, Flaeche #273545, Hover #141B24, Pfeil .75rem
       in #949DB0. Der Pfeil zeigt nach rechts (Leiste schliessen) und dreht
       sich eingeklappt um (FST Z. 578). Die Klickflaeche reicht 12px weiter
       nach links, damit der schmale Griff gut zu treffen ist. */
    .klapp { position: absolute; top: 50%; right: 100%; width: 1.25rem; min-width: 0; height: 3.5rem;
      transform: translate(0, -50%); border-radius: .25rem 0 0 .25rem; background: var(--griff); color: var(--muted); }
    .klapp:hover { background: var(--bg); color: var(--muted); }
    .klapp::before { content: ""; width: .75rem; height: .75rem; background: var(--muted);
      -webkit-mask: url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%2024%2024'%20fill%3D'none'%20stroke%3D'black'%20stroke-width%3D'3'%20stroke-linecap%3D'round'%20stroke-linejoin%3D'round'%3E%3Cpath%20d%3D'M9%205l7%207-7%207'%2F%3E%3C%2Fsvg%3E") center / contain no-repeat;
      mask: url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%2024%2024'%20fill%3D'none'%20stroke%3D'black'%20stroke-width%3D'3'%20stroke-linecap%3D'round'%20stroke-linejoin%3D'round'%3E%3Cpath%20d%3D'M9%205l7%207-7%207'%2F%3E%3C%2Fsvg%3E") center / contain no-repeat; }
    .klapp::after { content: ""; position: absolute; top: -4px; bottom: -4px; left: -12px; right: 0; }
    .klapp:focus-visible { outline-offset: -2px; }
    .box.mini .klapp::before { transform: rotate(-180deg); }

    /* Nimmt den ganzen Rest der Hoehe ein. min-height haelt ihn davon ab, auf
       null zusammenzufallen - dann saehe man nur noch den Kopfstreifen und
       haette keine Bedienung mehr.
       contain: layout macht .halter zum Bezugsrahmen fuer position: fixed.
       Sonst legten sich die Dialoge (Sniping vorbereiten, Filter-
       Zusammenfassung) mit ihrem Abdunkeln ueber die ganze EA-Seite - so
       bleiben sie im Menue. Bewusst hier und nicht am scrollenden
       .blatt-halter: dort liefen die Dialoge beim Scrollen mit weg.
       overflow: hidden, weil die Leiste selbst nichts mehr abschneidet (der
       Griff ragt links heraus). */
    .halter { position: relative; flex: 1 1 auto; min-height: 200px; contain: layout; overflow: hidden; }

    /* Traegt die eingebaute Oberflaeche (popup.html in einer eigenen, zweiten
       Schattenwurzel - deren Stile und unsere kommen sich so nicht in die
       Quere). Frueher stand hier ein Erweiterungs-Rahmen; der war fuer jedes
       Bildschirmfoto unsichtbar, weil Chrome Erweiterungsseiten aus Aufnahmen
       anderer Erweiterungen weglaesst. Von der Seite selbst gezeichnet ist die
       Oberflaeche sichtbar - und das geschlossene Shadow DOM haelt die
       EA-Seite trotzdem draussen. */
    .blatt-halter { position: absolute; inset: 0; z-index: 1; overflow: auto; overscroll-behavior: contain;
      scrollbar-width: thin; scrollbar-color: #949db0 #0C0F14; }
    /* Bildlaufleiste wortgleich wie FST (Z. 134 bis 152, .st-sidebar .scrollbar). */
    .blatt-halter::-webkit-scrollbar { width: 10px; height: 10px; }
    .blatt-halter::-webkit-scrollbar-track { background: #0C0F14; }
    .blatt-halter::-webkit-scrollbar-thumb { border: 2px solid #0C0F14; background-color: #949db0; border-radius: 10px; }

    /* Liegt hinter der Oberflaeche. Scheitert ihr Einbau, kommt die Erklaerung
       nach vorn und deckt zu, was dort steht. */
    .notfall { position: absolute; inset: 0; z-index: 0; padding: 1rem; color: var(--muted); font-size: .875rem; overflow: auto; }
    .notfall b { display: block; margin-bottom: .4rem; color: #fff; font-size: 1rem; font-weight: 700; }
    .notfall code { display: block; margin-top: .75rem; padding: .5rem .6rem; border-radius: .45rem;
      background: #10151c; color: var(--muted); font: 10px/1.4 Consolas, monospace; overflow-wrap: anywhere; }
    .halter.tot .notfall { z-index: 2; background: var(--bg); }
  `;

  const PANEL = { host: null, el: null, timer: null, last: null, collapsed: false, platz: -1, bereit: false, kontoGelesenAt: 0 };

  // ---------------------------------------------------------------------------
  // Kontostand ohne Anfrage.
  //
  // Den Stand erfahren wir sonst nur aus EAs Antworten - vor der ersten Suche
  // stand oben deshalb "–", obwohl die Web App ihn in ihrer Kopfzeile zeigt.
  // Hier wird er dort abgelesen: kein fetch, nur ein Blick in die Seite,
  // hoechstens alle 5 Sekunden, und nur solange EA selbst noch keinen Stand
  // gemeldet hat. Danach gilt allein EAs Wert (siehe setCredits).
  //
  // Mehrere Kandidaten, genaueste zuerst - EA benennt seine Klassen gern um.
  // Immer im Kopfbereich: "currency-coins" tragen auch die Preise der
  // Angebote auf dem Transfermarkt, die duerfen nie als Kontostand gelten.
  // ---------------------------------------------------------------------------
  const KONTO_SELEKTOREN = [
    ".fc-header-view .view-navbar-currency-coins",
    ".view-navbar-currency-coins",
    ".fc-header-view [class*='currency-coins']",
    ".ut-navigation-bar-view [class*='currency-coins']",
    ".view-navbar-currency [class*='coins']",
    ".fc-header-view [class*='coins']",
    "header [class*='coins']"
  ];
  const KONTO_TAKT_MS = 5000;

  // "27,434" / "27.434" / "27 434" / "500" -> Zahl. Alles andere (leer,
  // "1,2 Mio.", "12.5", Beschriftungen) -> null. Nur 0 bis 999.999.999.
  function kontoZahl(text) {
    const roh = String(text == null ? "" : text).trim();
    if (!/^\d{1,3}(?:[.,\s  ']\d{3})*$/.test(roh) && !/^\d{1,9}$/.test(roh)) return null;
    const zahl = Number(roh.replace(/\D/g, ""));
    return Number.isSafeInteger(zahl) && zahl >= 0 && zahl <= 999999999 ? zahl : null;
  }

  function kontostandVonSeite() {
    if (STATE.creditsQuelle === "ea") return;
    const jetzt = Date.now();
    if (jetzt - PANEL.kontoGelesenAt < KONTO_TAKT_MS) return;
    PANEL.kontoGelesenAt = jetzt;
    try {
      for (const selektor of KONTO_SELEKTOREN) {
        for (const el of document.querySelectorAll(selektor)) {
          const wert = kontoZahl(el.textContent);
          if (wert == null) continue;
          setCredits(wert, "seite");
          return;
        }
      }
    } catch (e) {
      // Ein fehlender Kopf ist kein Fehler - dann bleibt es beim alten Stand.
    }
  }

  // ---------------------------------------------------------------------------
  // Platz schaffen, statt die Seite zuzudecken.
  //
  // FUT Simple Trader legt seine Leiste einfach ueber die Web App. Dann liegt
  // sie aber auch ueber dem Coin-Stand oben rechts - genau die Zahl, die man
  // beim Sniping dauernd sehen will.
  //
  // Am lebenden Objekt gemessen: <html> hat eine feste Breite, Innenabstand
  // dort erzeugt nur einen Querbalken. Kopfzeile (.fc-header-view) und App
  // (main.ut-root-view) sind dagegen gewoehnliche Bloecke direkt im <body>.
  // Schmaelert man den body, wandern beide mit.
  //
  // EA setzt body { min-width: 800px }. Bleibt weniger uebrig, bleibt die
  // Seite bei 800px stehen und die Leiste ueberdeckt wieder etwas - aber
  // html { overflow-x: hidden } verhindert dabei einen Querbalken. Das ist
  // ein sanftes Nachgeben, kein Bruch, deshalb rechnen wir das nicht selbst
  // nach: EA kennt seine Mindestbreite besser als wir.
  // ---------------------------------------------------------------------------
  function seiteAnpassen() {
    if (!PANEL.el || !document.body) return;
    // Die gemessene Breite, nicht die gewuenschte: So bleiben die Stufen der
    // Medienabfrage oben die einzige Quelle - hier wird nichts nachgerechnet.
    const breite = Math.round(PANEL.el.box.getBoundingClientRect().width);
    if (!(breite > 0) || breite === PANEL.platz) return;
    PANEL.platz = breite;
    document.body.style.setProperty("width", "calc(100% - " + breite + "px)", "important");
  }


  // Der Stopp-Knopf der Bedienung (popup.html, id "stop") - oder null, solange
  // die Bedienung nicht gebaut ist. Nur ein Nachschlagen, kein Klick.
  function bedienungStopp() {
    try {
      const wurzel = PANEL.el && PANEL.el.blattWurzel;
      return wurzel && typeof wurzel.getElementById === "function" ? wurzel.getElementById("stop") : null;
    } catch (e) {
      return null;
    }
  }

  // Der Stopp im Kopf geht GENAU den Weg des Stopp-Knopfs der Bedienung: Er
  // klickt ihn. Dessen Horcher in popup.js macht alles Weitere (Rotation
  // abbrechen, Befehl "stop" senden, Anzeige nachziehen) - hier ist davon
  // nichts nachgebaut. Nur wenn dieser Knopf noch gesperrt ist (popup.js hat
  // den Start noch nicht gesehen) oder die Bedienung gar nicht gebaut ist,
  // geht derselbe Befehl "stop" direkt an den Bot - den Befehl, den der Knopf
  // dort ohnehin absendet. Ein laufender Bot laesst sich so nie unhaltbar an.
  function stoppKlick() {
    if (!STATE.running) return;
    const knopf = bedienungStopp();
    if (knopf && !knopf.disabled) {
      knopf.click();
      return;
    }
    botBefehl("stop");
  }

  function buildPanel() {
    const host = document.createElement("div");
    host.id = "fc27-own-bot-panel";
    // Das Shadow DOM schuetzt nur den Inhalt. Das Host-Element selbst steht in
    // der Seite und wuerde von deren Regeln getroffen - eine EA-Regel wie
    // "div { border: ... !important }" wuerde einen Rahmen darum zeichnen.
    // Inline mit !important ist die einzige Stufe, die darueber liegt.
    host.style.setProperty("all", "initial", "important");
    // Was im Menue getippt wird, geht die Seite nichts an. Tastenereignisse
    // steigen sonst samt key-Wert ueber die Schattengrenze bis zur Seite auf.
    // Hier ist die Grenze - dahinter kommt nichts mehr an. Ehrlicherweise:
    // Das haelt gewoehnliche Horcher ab; ein capture-Horcher der Seite auf
    // window laeuft vor uns und ist prinzipbedingt nicht abzufangen.
    for (const art of ["keydown", "keyup", "keypress", "input", "change"]) {
      host.addEventListener(art, (e) => e.stopPropagation());
    }
    const root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = PANEL_CSS;

    const box = document.createElement("div");
    box.className = "box";

    const griff = document.createElement("div");
    griff.className = "griff";
    const logo = document.createElement("span");
    logo.className = "logo";
    const dot = document.createElement("span");
    dot.className = "dot";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = "FC27 Own Bot";
    // Der Griff sitzt wie bei FUT Simple Trader am linken Rand der Leiste
    // (.klapp), nicht mehr im Kopfstreifen. Der Text "–" / "+" bleibt im
    // Knopf (nur unsichtbar), der Pfeil davor ist gezeichnet.
    const toggle = document.createElement("button");
    toggle.className = "klapp";
    toggle.textContent = "–";
    toggle.title = "Leiste einklappen";
    toggle.setAttribute("aria-label", "Leiste einklappen");
    toggle.setAttribute("aria-expanded", "true");
    // Neu laden direkt im Kopf: nach einem Update ohne Umweg ueber
    // chrome://extensions. background.js ("devReload") laedt die Erweiterung,
    // danach diese Seite. Waehrend eines Laufs gesperrt - sonst bricht er ab.
    const neuLaden = document.createElement("button");
    neuLaden.className = "neu-laden";
    neuLaden.textContent = "↻";
    neuLaden.title = "Erweiterung neu laden";
    neuLaden.addEventListener("click", () => {
      // Der Knopf ist im Lauf ohnehin gesperrt (renderPanel). Die Pruefung
      // bleibt als Rueckhalt fuer die Zeit bis zum naechsten Takt.
      if (STATE.running) return;
      neuLaden.disabled = true;
      try {
        const antwort = chrome.runtime.sendMessage({ type: "devReload" });
        if (antwort && typeof antwort.catch === "function") antwort.catch(() => {});
      } catch (e) {}
      setTimeout(() => location.reload(), 1200);
    });
    // Kleiner Stopp-Knopf, nur sichtbar, solange der Bot laeuft (renderPanel).
    const stopp = document.createElement("button");
    stopp.className = "stopp";
    stopp.textContent = "Stopp";
    stopp.title = "Bot stoppen";
    stopp.setAttribute("aria-label", "Bot stoppen");
    stopp.hidden = true;
    stopp.addEventListener("click", stoppKlick);
    griff.append(logo, name, dot, stopp, neuLaden);

    const halter = document.createElement("div");
    halter.className = "halter";

    const notfall = document.createElement("div");
    notfall.className = "notfall";
    const titel = document.createElement("b");
    titel.textContent = "Bedienung wird geladen …";
    const text = document.createElement("div");
    text.textContent = "Einen Augenblick.";
    const details = document.createElement("code");
    notfall.append(titel, text, details);

    // Traeger der eingebauten Oberflaeche - mit einer EIGENEN geschlossenen
    // Schattenwurzel. Zwei Gruende: Die Stile von popup-design.css und die der
    // Leiste treffen sich so nie (beide haben button-, input- und
    // label-Regeln), und getElementById gibt es nur auf einer Schattenwurzel,
    // nicht auf einem div - genau darueber sucht popup.js seine Felder.
    const blattHalter = document.createElement("div");
    blattHalter.className = "blatt-halter";
    const blattWurzel = blattHalter.attachShadow({ mode: "closed" });
    halter.append(notfall, blattHalter);

    // Tab-Reihenfolge: Kopfstreifen (Stopp, Neu laden), DANN der Griff, dann
    // die Bedienung. Der Griff ist absolut am Rand positioniert - seine
    // Stelle im Baum aendert nur die Reihenfolge fuer die Tastatur, nicht das
    // Bild. Vorher stand er zuletzt: Wer mit Tab durch die Bedienung ging,
    // kam erst nach dem letzten Knopf der ganzen Leiste an ihm vorbei.
    box.append(griff, toggle, halter);
    root.append(style, box);

    toggle.addEventListener("click", () => {
      PANEL.collapsed = !PANEL.collapsed;
      toggle.textContent = PANEL.collapsed ? "+" : "–";
      toggle.title = PANEL.collapsed ? "Leiste ausklappen" : "Leiste einklappen";
      toggle.setAttribute("aria-label", toggle.title);
      toggle.setAttribute("aria-expanded", PANEL.collapsed ? "false" : "true");
      box.classList.toggle("mini", PANEL.collapsed);
      // Eingeklappt gibt die Leiste den Platz sofort wieder frei.
      seiteAnpassen();
      chrome.storage.local.set({ panelCollapsed: PANEL.collapsed }).catch(() => {});
    });

    PANEL.host = host;
    PANEL.el = { box, dot, name, toggle, stopp, neuLaden, halter, blattWurzel, notfall, titel, text, details };
    return host;
  }

  // ---------------------------------------------------------------------------
  // Die Oberflaeche einbauen: popup.html und popup-design.css von der eigenen
  // Erweiterung holen und in die zweite Schattenwurzel setzen, dann popup.js
  // darauf starten (das laeuft als eigenes Content-Script schon in dieser
  // Welt und wartet unter globalThis.__fc27PopupStart).
  //
  // Eine Quelle, drei Orte: Dieselben Dateien tragen die Leiste hier, das
  // eigene Fenster ueber das Symbol und die Vorschau. Nichts ist nachgebaut.
  // ---------------------------------------------------------------------------

  // Der Zustand der Oberflaeche als Attribut am <html> der Seite.
  //
  // Warum ausgerechnet dort: Die Leiste steckt in einem GESCHLOSSENEN Shadow
  // DOM. Das ist gewollt - aber es heisst auch, dass man von aussen nicht
  // nachsehen kann, was drin los ist, nicht einmal selbst beim Suchen eines
  // Fehlers. Genau daran haben wir uns einmal festgebissen. Preisgegeben wird
  // nur ein Zustandswort; dass es die Erweiterung gibt, sieht die Seite
  // ohnehin am Wirtselement mit seiner festen ID.
  function zustandMelden(wert) {
    try {
      document.documentElement.setAttribute("data-fc27-bot", wert);
    } catch (e) {}
  }

  // Direkter Draht fuer die eingebaute Oberflaeche: gleicher Prozess, gleiche
  // Welt, gleicher Verteiler wie bei den Nachrichten vom eigenen Fenster.
  // Die Seite kommt an diese Funktion nicht heran - sie lebt in der isolierten
  // Welt und wird nur der eigenen Oberflaeche in die Hand gedrueckt.
  function botBefehl(cmd, extra) {
    return befehlAusfuehren(String(cmd || ""), extra || {});
  }

  // popup-design.css ist fuer ein eigenes Dokument geschrieben (:root, html,
  // body). In der Schattenwurzel gibt es diese Elemente nicht - die Rollen
  // uebernehmen :host (der Traeger) und .blatt (der Inhaltskasten). Die
  // Ersetzungen sind bewusst punktgenau: Ein pauschales "body"-Ersetzen wuerde
  // auch die Schriftvariable --body treffen.
  function stylesheetUmschreiben(css) {
    return css
      .replace("html.in-page, html.in-page body {", ":host, :host .blatt {")
      .replaceAll("html.in-page {", ":host {")
      .replace(":root {", ":host {")
      .replace("\nhtml { ", "\n:host { ")
      .replace("\nbody {", "\n.blatt {");
  }

  // Schriften muessen ans Dokument: @font-face-Regeln aus Schattenwurzeln
  // wendet Chrome nicht zuverlaessig an. Die Schriftfamilien gelten dann
  // dokumentweit und damit auch drinnen. Die Adressen werden absolut gemacht,
  // sonst suchte die Seite die Dateien bei ea.com.
  function schriftenAnsDokument(css) {
    const regeln = css.match(/@font-face\s*\{[^}]*\}/g) || [];
    if (!regeln.length || document.getElementById("fc27-own-bot-schriften")) return;
    const style = document.createElement("style");
    style.id = "fc27-own-bot-schriften";
    style.textContent = regeln.join("\n").replaceAll('url("fonts/', 'url("' + chrome.runtime.getURL("fonts/"));
    (document.head || document.documentElement).append(style);
  }

  async function oberflaecheEinbauen() {
    const el = PANEL.el;
    try {
      const start = globalThis.__fc27PopupStart;
      if (typeof start !== "function") throw new Error("popup.js ist nicht geladen (Manifest pruefen).");

      const [htmlText, cssText] = await Promise.all([
        fetch(chrome.runtime.getURL("popup.html")).then((r) => r.text()),
        fetch(chrome.runtime.getURL("popup-design.css")).then((r) => r.text())
      ]);

      const doc = new DOMParser().parseFromString(htmlText, "text/html");
      // Skripte laufen hier nicht (popup.js kommt als Content-Script) und
      // <link> zeigte auf eine Adresse relativ zur EA-Seite - beides raus.
      for (const knoten of doc.querySelectorAll("script, link")) knoten.remove();
      // Relative Bildadressen wuerden bei ea.com suchen statt bei uns.
      for (const bild of doc.querySelectorAll("img")) {
        const src = bild.getAttribute("src") || "";
        if (src && !/^(https?:|data:|chrome-extension:)/i.test(src)) bild.src = chrome.runtime.getURL(src);
      }

      schriftenAnsDokument(cssText);
      const style = document.createElement("style");
      style.textContent = stylesheetUmschreiben(cssText);
      const blatt = document.createElement("div");
      blatt.className = "blatt";
      blatt.append(...doc.body.children);
      el.blattWurzel.append(style, blatt);

      start(el.blattWurzel, botBefehl);

      PANEL.bereit = true;
      el.halter.classList.remove("tot");
      el.notfall.hidden = true;
      zustandMelden("oberflaeche-bereit inhalt=" + Math.round(blatt.getBoundingClientRect().height));
    } catch (e) {
      // Scheitert der Einbau, bleibt der Bot bedienbar: Das Symbol oben
      // oeffnet dieselbe Oberflaeche als eigenen Tab (siehe background.js).
      el.halter.classList.add("tot");
      el.titel.textContent = "Die Bedienung lässt sich hier nicht anzeigen.";
      el.text.textContent = "Klick auf das Symbol der Erweiterung oben rechts – dann öffnet sich die Bedienung " +
        "in einem eigenen Tab. Hilft auch das nicht: Erweiterung unter chrome://extensions neu laden und diese Seite neu laden.";
      el.details.textContent = "Grund: " + (e && e.message ? e.message : String(e));
      zustandMelden("oberflaeche-fehler " + str(e && e.message ? e.message : String(e), 120));
      warn("Oberflaeche liess sich nicht einbauen: " + (e && e.message ? e.message : e));
    }
  }

  // Eingeklappt ist der Punkt das Einzige, was noch etwas sagt. Ausgeklappt
  // steht alles im Rahmen, den popup.js selbst aktuell haelt - hier waere
  // jede weitere Anzeige nur eine zweite Wahrheit.
  function panelText() {
    return [STATE.running, STATE.level, PANEL.collapsed].join("|");
  }

  function updatePanel() {
    if (!extensionAlive()) {
      clearInterval(PANEL.timer);
      PANEL.timer = null;
      // Die Erweiterung wurde neu geladen. Der Bot ist damit tot, und die
      // eingebaute Oberflaeche haengt in der Luft: Ihr Speicher und ihr
      // Botdraht gehen ins Leere. Eine halbe Bildschirmseite davon waere nur
      // im Weg - also auf den schmalen Streifen zusammenziehen, den Platz
      // zurueckgeben und in drei Worten sagen, was hilft.
      if (PANEL.el) {
        PANEL.el.box.classList.add("mini");
        PANEL.el.name.textContent = "Tab neu laden";
        PANEL.el.toggle.hidden = true;
        PANEL.el.stopp.hidden = true;
        seiteAnpassen();
      }
      window.removeEventListener("resize", seiteAnpassen);
      return;
    }
    // Eigener Zeitstempel darin: liest hoechstens alle 5 Sekunden.
    kontostandVonSeite();
    const fingerprint = panelText();
    if (fingerprint === PANEL.last) return; // nichts geaendert, DOM in Ruhe lassen
    PANEL.last = fingerprint;
    renderPanel();
  }

  function renderPanel() {
    if (!PANEL.el) return;
    PANEL.last = panelText();
    PANEL.el.dot.className = "dot " + (STATE.running ? STATE.level || "run" : "");
    // Der Stopp im Kopf ist nur da, solange etwas laeuft.
    PANEL.el.stopp.hidden = !STATE.running;
    // Eingeklappt soll man ohne Aufklappen sehen, ob gerade gekauft wird.
    PANEL.el.name.textContent = PANEL.collapsed && STATE.running ? "FC27 Own Bot – läuft" : "FC27 Own Bot";
    // Neu laden wuerde den Lauf abbrechen. Deshalb im Lauf sichtbar gesperrt,
    // statt klickbar auszusehen und dann nichts zu tun.
    PANEL.el.neuLaden.disabled = Boolean(STATE.running);
    PANEL.el.neuLaden.title = STATE.running ? "Neu laden geht erst, wenn der Lauf gestoppt ist." : "Erweiterung neu laden";
  }

  // Klick auf das Symbol der Erweiterung. Es gibt kein Chrome-Popup mehr -
  // das waere dieselbe Oberflaeche ein zweites Mal gewesen, und man haette in
  // beiden verschiedene Sachen eintragen koennen.
  //
  // Nur klappen, wenn die Leiste auch etwas zu zeigen hat. Laedt der Rahmen
  // nicht, klappte man sonst eine leere Flaeche auf und zu; dann oeffnet der
  // Service Worker die Bedienung lieber in einem eigenen Tab.
  function panelKlappen() {
    if (!PANEL.el) return { ok: false, reason: "keine-leiste" };
    if (!PANEL.bereit) return { ok: false, reason: "oberflaeche-fehlt" };
    PANEL.el.toggle.click();
    return { ok: true, collapsed: PANEL.collapsed };
  }

  function mountPanel() {
    if (PANEL.host || !document.body) return;
    document.body.append(buildPanel());
    chrome.storage.local.get("panelCollapsed").then(({ panelCollapsed }) => {
      if (panelCollapsed) PANEL.el.toggle.click();
    }).catch(() => {});
    renderPanel();
    oberflaecheEinbauen();
    seiteAnpassen();
    // Auf sehr schmalen Fenstern greift "max-width: 90%" - dann aendert sich
    // die Breite der Leiste, und der Platz daneben muss mitgehen.
    window.addEventListener("resize", seiteAnpassen);
    PANEL.timer = setInterval(updatePanel, 700);
  }

  // Die Leiste deckt die rechte Seite ab. Erschiene sie schon ueber dem
  // Ladebildschirm, stuende sie im Weg, bevor es ueberhaupt etwas zu bedienen
  // gibt. Deshalb warten wir auf die Wurzel der Web App.
  //
  // Aber nicht unbegrenzt: Benennt EA diesen Namen um, soll die Bedienung
  // trotzdem erscheinen - dann eben etwas spaeter. Ein Warten ohne Ende waere
  // der schlechtere Tausch: Der Bot funktionierte, aber niemand kaeme an ihn
  // heran, und es gaebe keinen Hinweis, warum.
  const WEB_APP_ROOT = ".ut-root-view";
  const WEB_APP_WAIT_MS = 20000;
  const WEB_APP_POLL_MS = 400;

  function webAppBereit() {
    return Boolean(document.querySelector(WEB_APP_ROOT));
  }

  function panelStarten(jetzt) {
    if (PANEL.host) return;
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", () => panelStarten(jetzt), { once: true });
      return;
    }
    const start = jetzt == null ? Date.now() : jetzt;
    if (webAppBereit() || Date.now() - start >= WEB_APP_WAIT_MS) {
      mountPanel();
      return;
    }
    setTimeout(() => panelStarten(start), WEB_APP_POLL_MS);
  }

  panelStarten();

  // Fuehrt einen Befehl aus und gibt die Antwort zurueck. Zwei Wege fuehren
  // hierher: Nachrichten vom eigenen Fenster (unten) und der direkte Aufruf
  // aus der Oberflaeche in der Seite - die laeuft in derselben Welt und
  // braucht keinen Nachrichtenweg.
  function befehlAusfuehren(command, message) {
    try {
      let response;
      if (command === "start") {
        response = Object.assign(start(message.cfg), { status: status() });
      } else if (command === "rotationStart") {
        response = Object.assign(rotationStarten(message.cfg), { status: status() });
      } else if (command === "rotationPause") {
        const ok = rotationPauseSetzen(message.ms);
        response = { ok, error: ok ? "" : "Es läuft keine Rotation.", status: status() };
      } else if (command === "naechsterFilter") {
        response = Object.assign(naechsterFilter(), { status: status() });
      } else if (command === "rotationStop") {
        rotationBeenden("Gestoppt.");
        response = { ok: true, status: status() };
      } else if (command === "stop") {
        rotationBeenden("Gestoppt.");
        if (STATE.running) stop("Gestoppt.", "idle", false, "gesamt");
        response = { ok: true, status: status() };
      } else if (command === "priceCheck") {
        response = Object.assign(startPriceCheck(message.player), { status: status() });
      } else if (command === "cancelPriceCheck") {
        if (STATE.check.running && message.token === STATE.check.token) {
          STATE.check.running = false;
          STATE.check.token += 1;
          STATE.check.message = "Preisprüfung abgebrochen.";
          STATE.check.error = null;
        }
        response = { ok: true, status: status() };
      } else if (command === "suchadresse") {
        // Ablese-Hilfe (28.09.2026): EAs eigene Suchadresse aus der
        // Ladeliste der Seite lesen. Keine EA-Anfrage.
        response = Object.assign(eigeneSuchadresse(), { status: status() });
      } else if (command === "suchseite") {
        // Nur nachsehen, ob die EA-Suchseite offen ist. Keine EA-Anfrage.
        suchseiteFragen();
        response = { ok: true, status: status() };
      } else if (command === "probe") {
        // Fragt die Seite; die Antwort trifft wenige Millisekunden spaeter
        // als eigene Nachricht ein. Das Popup holt sie per Status ab.
        window.postMessage({ __ownbot: "probe?" }, window.location.origin);
        response = { ok: true, status: status() };
      } else if (command === "marketScan") {
        response = Object.assign(startMarketScan(message.cfg), { status: status() });
      } else if (command === "transferliste") {
        response = Object.assign(transferlisteLesen(message), { status: status() });
      } else if (command === "einstellen") {
        response = Object.assign(spielerEinstellen(message), { status: status() });
      } else if (command === "neuEinstellen") {
        response = Object.assign(abgelaufeneNeuEinstellen(), { status: status() });
      } else if (command === "abraeumen") {
        response = Object.assign(verkaufteAbraeumen(), { status: status() });
      } else if (command === "tonTest") {
        // Hoerprobe: fragt EA nie, deshalb ohne Sperre- und Tab-Pruefung.
        response = Object.assign(tonTest(message.art, message.lautstaerke), { status: status() });
      } else if (command === "togglePanel") {
        response = panelKlappen();
      } else if (command === "ausnahmeStarten") {
        response = Object.assign(ausnahmeStarten(), { status: status() });
      } else if (command === "ausnahmeBeenden") {
        response = Object.assign(ausnahmeBeenden(), { status: status() });
      } else if (command === "status") {
        if (Date.now() - PLAYERS.fallbackAt > 10000) {
          PLAYERS.fallbackAt = Date.now();
          filterListenFragen();
          if (!PLAYERS.seen) playerListFallback();
          if (IMAGES.source !== "web-app") {
            scanPortraits();
            scanImageContentRoot();
          }
        }
        response = { ok: true, status: status() };
      } else {
        response = { ok: false, error: "Unbekannter Befehl: " + command, status: status() };
      }
      return response;
    } catch (e) {
      return { ok: false, error: "Befehl fehlgeschlagen: " + e.message, status: status() };
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Versionspraefix: alte, noch lebende Listener ignorieren diese Befehle.
    // Damit kann nie wieder eine alte Instanz zuerst mit einem alten Status antworten.
    if (!message || typeof message.cmd !== "string" || !message.cmd.startsWith("v11/")) return false;
    sendResponse(befehlAusfuehren(message.cmd.slice(4), message));
    // Antwortkanal offen halten. Das verhindert verlorene Rueckmeldungen in
    // einigen Chrome-Versionen, auch wenn die Antwort meist synchron ist.
    return true;
  });

  // Meldungen von sniffer.js. Die Seite koennte hier auch Unsinn schicken,
  // deshalb wird alles geprueft (Adressen gegen die Muster, Liste per parsePlayers).
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data) return;

    if (data.__ownbot === "players") {
      // istSpielerliste statt PLAYERS_RE: Der Sniffer meldet auch
      // players_icons.json und players_meta.json - die passen aufs Muster,
      // haben aber keine Namen und erzeugten nur Warnungen.
      if (typeof data.url === "string" && istSpielerliste(data.url)) savePlayers(data.raw, "Web App", data.url);
      return;
    }

    if (data.__ownbot === "probe") {
      acceptProbe(data);
      return;
    }

    if (data.__ownbot === "watchlist") {
      acceptWatchlist(data);
      return;
    }

    // "preisgrenzen" kam am 27.09.2026 dazu: EAs erlaubte Preisspanne fuer
    // eine Karte, gelesen aus dem Speicher der Web App.
    if (data.__ownbot === "tradepile" || data.__ownbot === "verkauf" || data.__ownbot === "appAntwort" || data.__ownbot === "muenzen" || data.__ownbot === "preisgrenzen") {
      seitenAntwort(data);
      return;
    }

    if (data.__ownbot === "stapel") {
      stapelUebernehmen(data);
      return;
    }

    // EAs Kontouebersicht, nur mitgelesen - keine eigene Anfrage (25.09.2026).
    if (data.__ownbot === "konto") {
      kontoUebernehmen(data);
      return;
    }

    if (data.__ownbot === "filterlisten") {
      filterListenUebernehmen(data);
      return;
    }

    if (data.__ownbot === "suchseite") {
      suchseiteUebernehmen(data);
      return;
    }

    if (data.__ownbot === "nutzung") {
      STATE.nutzungsdaten = typeof data.an === "boolean" ? data.an : null;
      return;
    }

    if (data.__ownbot === "priceTiers") {
      const tiers = acceptPriceTiers(data.tiers);
      if (!tiers) return;
      const neu = JSON.stringify(tiers);
      if (JSON.stringify(PRICE_TIERS) === neu) return;
      PRICE_TIERS = tiers;
      log("Preisstufen aus der Web App uebernommen:", tiers);
      // Auch das Popup rechnet Preise - damit beide dieselbe Leiter benutzen.
      chrome.storage.local.set({ priceTiers: tiers }).catch(() => {});
      return;
    }

    if (data.__ownbot === "images") {
      if (typeof data.prefix === "string" && IMAGE_PREFIX_RE.test(data.prefix) && data.suffix === ".png") {
        saveImages(data.prefix, data.suffix, "web-app");
      }
      return;
    }

    if (data.__ownbot !== "session") return;
    const match = API_RE.exec(String(data.base || ""));
    if (!match || typeof data.sid !== "string" || data.sid.length < 8) return;
    if (SESSION.sid !== data.sid) log("Session erkannt (" + new URL(match[1]).host + ").");
    SESSION.sid = data.sid;
    SESSION.base = match[1];
  });

  window.postMessage({ __ownbot: "session?" }, window.location.origin);

  // "Usage Sharing" in FC: EA sammelt dann Nutzungsdaten ueber die App. Die
  // oeffentliche Anleitung von FUT Simple Trader raet, es auszuschalten; live
  // am 22.09.2026 war es beim Nutzer an. Nur lesen (kostet keine Anfrage) -
  // die Web App kennt den Wert erst nach dem Laden, darum spaeter und
  // danach jede Minute nachfragen.
  const nutzungFragen = () => window.postMessage({ __ownbot: "nutzung?" }, window.location.origin);
  setTimeout(nutzungFragen, 5000);
  setInterval(nutzungFragen, 60000);
  // Stapel alle 20 s nachsehen (nur Speicher der App, keine EA-Anfrage).
  setTimeout(stapelFragen, 3000);
  setInterval(stapelFragen, 20000);
  // Suchseite: nur im Speicher der App nachsehen, keine EA-Anfrage.
  setTimeout(() => { if (STATE.suchweg === "app") suchseiteFragen(); }, 4000);
  setInterval(() => { if (STATE.suchweg === "app") suchseiteFragen(); }, 5000);

  function scheduleAutoScan(delay) {
    clearTimeout(autoScanTimer);
    autoScanTimer = null;
    if (!STATE.autoFilters || !extensionAlive()) return;
    autoScanTimer = setTimeout(() => {
      autoScanVersuch().catch((e) => warn("Automatischer Markt-Scan: " + e.message));
      scheduleAutoScan(CONFIG.AUTO_SCAN_INTERVAL_MS);
    }, delay);
  }

  // In der Abkuehlzeit gar nicht erst anfangen - der Zeitgeber laeuft ohne
  // Klick weiter und wuerde die Sperre sonst immer neu ausloesen.
  function autoScanBereit() {
    return Boolean(SESSION.sid) && !STATE.running && !STATE.check.running && !STATE.marketScan.running && cooldownLeftMin() === 0 && !andererTabAktiv();
  }

  // Der Auto-Scan laeuft ohne Klick. Er darf dem Bot die Suchen nicht
  // wegnehmen und soll nie mitten im Scan an ein Limit stossen: Ein
  // abgebrochener Scan speichert nichts, seine Suchen waeren verschenkt.
  // Darum startet er nur, wenn auch nach einem vollen Scan Stunden- und
  // Tageszaehler unter der gelben Warnschwelle bleiben - der Rest bis zum
  // Limit gehoert dem Bot. Gelesen wird der gespeicherte Zaehler: STATE.usage
  // wird ohne neue Suche nie kleiner und wuerde den Scan fuer immer sperren.
  async function autoScanPlatz() {
    // FST-Modus: Die Warnschwellen haengen an den Suchlimits, die es hier nicht
    // gibt. Das 7-Minuten-Intervall (AUTO_SCAN_INTERVAL_MS) bleibt.
    if (STATE.fstModus === true) return true;
    const now = Date.now();
    const stored = await chrome.storage.local.get("safetyUsage");
    const data = pruneUsage(stored.safetyUsage, now);
    const stunde = data.searches.filter((t) => t > now - 60 * 60 * 1000).length;
    const bedarf = CONFIG.MARKET_SCAN_MAX_REQUESTS;
    // Mit Ausnahme liegt das Tageslimit hoeher, der Abstand zur Schwelle bleibt.
    const schwelleTag = suchLimitTag(now) - (CONFIG.SEARCH_LIMIT_DAY - CONFIG.SEARCH_WARN_DAY);
    return stunde + bedarf <= CONFIG.SEARCH_WARN_HOUR && data.searches.length + bedarf <= schwelleTag;
  }

  async function autoScanVersuch() {
    if (!autoScanBereit()) return;
    if (!(await autoScanPlatz())) {
      if (!STATE.marketScan.running) {
        STATE.marketScan.error = null;
        STATE.marketScan.message = "Automatische Erneuerung pausiert: Ein Scan braucht bis zu " +
          CONFIG.MARKET_SCAN_MAX_REQUESTS + " Suchen. Die bleiben gerade für den Bot frei. Es geht von selbst weiter.";
      }
      return;
    }
    // Waehrend des Nachsehens kann ein Klick etwas gestartet haben.
    if (!autoScanBereit()) return;
    startMarketScan({ maxPrice: STATE.scanMaxPrice || 50000 });
  }

  function applyAutomationSettings(settings) {
    // FST-Modus (01.10.2026, Optionen > Grenzen). NUR ein ausdrueckliches true
    // schaltet ihn ein. Fehlt der Wert (neue Installation, alte Einstellungen,
    // Panel noch nicht geoeffnet), gilt der strenge Modus. Das Panel schreibt
    // den Wert beim ersten Oeffnen (Umstellung mit dem Merker fstModusV1).
    STATE.fstEinst = Boolean(settings && settings.fstModus === true);
    // Waehrend eines Laufs gilt weiter der Modus vom Start (Punkt 7); die
    // Umstellung wirkt dann erst beim naechsten Start.
    fstAbgleichen();
    // Suchweg: "app" = ueber die Web App (neu), sonst direkt wie bisher.
    STATE.suchweg = settings && settings.appSuchweg === true ? "app" : "direkt";
    // Zaehler fuer den wirklich genommenen Weg neu beginnen (27.09.2026),
    // sonst mischt die Anzeige Suchen von vor der Umstellung mit denen danach.
    SUCHWEG_STAT.app = 0;
    SUCHWEG_STAT.direkt = 0;
    SUCHWEG_STAT.grund = "";
    // Preis-Methode: wie streng wird das Alter der Angebote gewertet (F1).
    STATE.preisMethode = preisMethodeGueltig(settings && settings.preisMethode);
    // Eigenes Verschieben des Verkaufspreises um ganze Preisstufen
    // (27.09.2026). Auf hoechstens 30 Stufen geklemmt - genau wie bei FUT
    // Simple Trader (scripts.js Z. 42682-42687). Ein Tippfehler darf den Preis
    // nicht ins Nichts schieben.
    const eigeneStufen = Math.round(Number(settings && settings.preisStufen) || 0);
    STATE.preisStufen = Number.isFinite(eigeneStufen) ? Math.max(-PREIS_STUFEN_MAX, Math.min(PREIS_STUFEN_MAX, eigeneStufen)) : 0;
    // Preisdeckel wie FST (28.09.2026): Standard AUS. Deshalb === true - in
    // alten Einstellungen fehlt der Wert, und dann bleibt die Markt-Bremse
    // an, genau wie bisher.
    STATE.deckelFst = Boolean(settings && settings.deckelFst === true);
    // Standard an. Deshalb !== false: In alten Einstellungen fehlt der Wert.
    STATE.nurSuchseite = !(settings && settings.appNurSuchseite === false);
    // Verkaufs-Wache: Standard an. Abraeumen nur, wenn ausdruecklich gewuenscht.
    STATE.verkaufWache = !(settings && settings.verkaufWache === false);
    STATE.autoAbraeumen = Boolean(settings && settings.autoAbraeumen === true);
    // Weiterkaufen bei vollem "Nicht zugewiesen" (28.09.2026). Standard AUS -
    // das ist auch FSTs eigener Standard (scripts.js Z. 58493: die Grenze 4
    // gilt dort, solange unlimited_unassigned aus ist).
    STATE.nichtZugewiesenUnbegrenzt = Boolean(settings && settings.nichtZugewiesenUnbegrenzt === true);
    // Festpreis fuer "Gleich verkaufen" (27.09.2026). Leer oder 0 heisst aus.
    // Nach oben deckelt EAs eigene Obergrenze in gleichEinstellen, nach unten
    // greift CONFIG.LIST_MIN_PRICE - unter 200 Coins stellt EA nichts ein.
    STATE.listFestpreis = toInt(settings && settings.listFestpreis) || 0;
    // Verkaufspreis auch nach einer Stunde weiter nutzen (27.09.2026).
    // Standard AUS (=== true): Einen aelteren Preis zu benutzen ist eine
    // Entscheidung des Nutzers, nicht des Bots. Ohne Haken bleibt alles genau
    // wie bisher.
    STATE.preisLangeNutzen = Boolean(settings && settings.verkaufPreisLangeNutzen === true);
    // Selbst eingestellte Grenzen (25.09.2026). Leer oder 0 heisst: der
    // Standardwert gilt. Nach oben deckelt grenzeLesen() gegen einen
    // Tippfehler, nach unten ist alles erlaubt - vorsichtiger darf man immer.
    STATE.grenzen = {
      suchStunde: toInt(settings && settings.grenzeSuchStunde) || 0,
      suchTag: toInt(settings && settings.grenzeSuchTag) || 0
    };
    if (STATE.suchweg === "app") suchseiteFragen();
    // Toene (Optionen > Toene) - wirken sofort, auch ohne Neuladen.
    tonEinstellen(settings);
    STATE.autoFilters = Boolean(settings && settings.autoFilters);
    scheduleAutoScan(STATE.autoFilters ? 3000 : CONFIG.AUTO_SCAN_INTERVAL_MS);
  }

  loadCooldown().catch(() => {});
  loadAusnahme().catch(() => {});
  loadFilterListen().catch(() => {});
  // Wie viele Karten stehen schon im Preis-Gedaechtnis? Nur zum Anzeigen.
  chrome.storage.local.get("preisGedaechtnis").then(({ preisGedaechtnis }) => {
    const karten = preisGedaechtnis && preisGedaechtnis.karten;
    GEDAECHTNIS.karten = karten && typeof karten === "object" ? Object.keys(karten).length : 0;
  }).catch(() => {});
  // Abkuehlung der Filter ueberlebt ein Neuladen der Seite (F4).
  chrome.storage.local.get("filterAbkuehlung").then(({ filterAbkuehlung }) => abkuehlungUebernehmen(filterAbkuehlung)).catch(() => {});
  chrome.storage.local.get(["settings", "endpoints", "scanMaxPrice"]).then(({ settings, endpoints, scanMaxPrice }) => {
    const gemerkt = toInt(scanMaxPrice);
    if (!STATE.scanMaxPrice && gemerkt >= 1000 && gemerkt <= 1000000) STATE.scanMaxPrice = gemerkt;
    applyEndpoints(endpoints);
    const abweichend = endpointsChanged();
    if (abweichend.length) log("Eigene EA-Endpunkte aktiv: " + abweichend.join(", "));
    applyAutomationSettings(settings);
  }).catch(() => {});

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.settings) applyAutomationSettings(changes.settings.newValue);
    // Sofort uebernehmen: Wer die Pfade anpasst, soll nicht neu laden muessen.
    if (changes.endpoints) applyEndpoints(changes.endpoints.newValue);
    // Ausnahme aus einem zweiten Web-App-Tab: hier sofort gleich halten.
    if (changes.limitAusnahme) STATE.ausnahme = pruefeAusnahme(changes.limitAusnahme.newValue, Date.now());
    // Sperre aus einem anderen Tab: Frueher las jeder Tab sie nur beim Laden.
    // Ein schon offener zweiter Tab konnte mitten in der Sperre weiter suchen
    // und die naechste Sperr-Antwort holen. Nur verlaengern, nie verkuerzen.
    if (changes.safetyCooldown) sperreUebernehmen(changes.safetyCooldown.newValue);
    if (changes.sperrVorfaelle) vorfaelleUebernehmen(changes.sperrVorfaelle.newValue);
    if (changes.safetyUsage && changes.safetyUsage.newValue) {
      const jetzt = Date.now();
      updateUsageState(pruneUsage(changes.safetyUsage.newValue, jetzt), jetzt);
    }
    if (changes[BESITZ_KEY]) besitzUebernehmen(changes[BESITZ_KEY].newValue);
  });
  loadUsage().catch((e) => warn("Sicherheitszaehler konnten nicht geladen werden:", e.message));
  // Speicherstand (25.09.2026): einmal kurz nach dem Laden, damit die Warnung
  // nicht erst nach 10 Minuten kommt, und danach regelmaessig.
  setTimeout(() => speicherPruefen(), 20000);
  setInterval(() => speicherPruefen(), SPEICHER_PRUEF_MS);
  // Bekannte Bild-Adresse aus einer frueheren Sitzung nicht durch eine Vermutung ersetzen.
  Promise.resolve(chrome.storage.local.get("playerImages"))
    .then((stored) => {
      const known = stored && stored.playerImages;
      if (known && known.source && !IMAGES.source) Object.assign(IMAGES, { prefix: known.prefix, suffix: known.suffix, source: known.source });
    })
    .catch(() => {});
  setTimeout(() => { playerListFallback(); scanPortraits(); scanImageContentRoot(); }, 5000);
  setTimeout(() => { playerListFallback(); scanPortraits(); scanImageContentRoot(); }, 15000);
  setTimeout(() => { playerListFallback(); scanPortraits(); scanImageContentRoot(); }, 45000);
  // Erst nach erfolgreicher kompletter Initialisierung markieren. Sollte oben
  // doch ein Fehler passieren, darf die automatische Reparatur erneut laden.
  globalThis.__fc27OwnBotContentLoaded = CONTENT_VERSION;
  log("Geladen. Warte auf die Session der Web App.");
})();
