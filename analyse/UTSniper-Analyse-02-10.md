# UTSniper 2.0.1.1 angesehen: wie es Spieler findet und kauft

Stand 02.10.2026. Nur den Quelltext gelesen (Ordner `Desktop\utsniper-fc-27-sniping-bot-2.0.1.1`),
nichts gestartet, kein Netzwerkverkehr gemessen. Vier Leser, danach pro Bericht ein Prüfer, der am
Quelltext gegengeprüft hat. Die Korrekturen der Prüfer sind unten schon eingebaut.
Fremder, bezahlter Code: nichts davon wurde kopiert. Dies ist nur ein Bericht.

## 1. Kurz
- UTSniper schickt **keine eigenen Anfragen an EA**. Es ruft die Funktionen der EA-Web-App auf
  (`services.Item.searchTransferMarket(Kriterien, 1)` und `services.Item.bid(Karte, Sofortkauf)`).
  Das ist derselbe Weg wie FST und wie unser App-Suchweg (der bei uns noch Schalter, Standard AUS, ist).
- Gesucht wird **immer nur Seite 1**. Vor jeder Suche wird EAs Markt-Cache geleert.
- Gekauft wird der **erste Treffer sofort** (Warteschlange mit 1-ms-Takt, keine Denkpause).
- Es gibt **kein Tages- oder Stundenlimit** und kein Budget-Limit. Gestoppt wird nur bei Fehlern und nach der Laufzeit.
- Für den Nutzer ist es **kein reines Werkzeug**: Login und Lizenz bei utsniper.com, und jeder Kauf und
  Verkauf wird samt EA-Konto-ID an deren Server gemeldet (Abschnitt 6).

## 2. So findet es Spieler
- Die Suchmaske ist EAs eigene Maske. UTSniper hängt einen eigenen Reiter an (Unterklasse von
  `UTMarketSearchFiltersViewController`). Die EA-Klassen sind verschleiert. Es findet sie über
  **Methodennamen als Fingerabdruck** (Tabelle mit 38 Klassen, Zeilen 8-127). Das hält auch nach
  Umbenennungen durch EA.
- An EA gehen: Verein, Nation, Spielstil, Qualität, Liga, Spieler-ID, Seltenheit, Zone, Position, Preise.
- **Nicht an EA, sondern erst im Browser gefiltert:** Bewertungsspanne, Basis-Chemie ignorieren,
  Torhüter ignorieren, Namen erlaubt/gesperrt, Sortierung. Dazu eine Merkliste der letzten **300 Handels-IDs**
  gegen Doppelversuche.
- **Vor jeder Suche:**
  - Mindest-Sofortkaufpreis zufällig (Standard 1-300, bis 350 durch Preisstufe), immer anders als beim letzten Mal.
    Der Zufall wirkt nur im Rahmen des eigenen Kaufpreises. Bei den Standardwerten ist der Mindestpreis
    praktisch immer 150, also nicht zufällig.
  - Höchstgebot zufällig 1,5 bis 10 Mio (auf Tausender), wird direkt nach dem Absenden wieder auf leer gestellt.
    Das überschreibt auch ein vom Nutzer gesetztes Höchstgebot.
- **Takt:** Ein Zeitgeber läuft alle 25 ms und startet eine Suche nur, wenn nichts wartet.
  - Wartezeit zwischen Suchen: zufällig ganze Sekunden, Standard **7-15 s** (Regler 0-120, keine Untergrenze im Code).
  - Pause: nach **10-15 Suchen** (die Zahl wird nur einmal pro Lauf gewürfelt) für **5-10 s**
    (die Länge wird jedes Mal neu gewürfelt). Regler 1-50 Suchen, 1-360 s.
  - Laufzeit: Standard **15-30 min** (Regler 10-720). Danach Stopp.
  - Nach Kauf oder Fehlkauf mindestens 1-5 s Pause (Regler 0-20). Das zählt nicht zusätzlich, der spätere der beiden Zeitgeber gewinnt.
- **Preisquellen** (nur für den "Echtzeit"-Modus, nach den Treffern gefragt, **kein Vorfilter**):
  fut.gg, FutMind, FutNext. "Alternative/FUTBIN" ist in Wahrheit FutNext mit Rückfall auf die anderen.
  fut.gg: pro 30er-Paket ein Signier-Aufruf (gedrosselt 120 ms) plus ein Abruf, bis 4 Pakete gleichzeitig.
  FutNext: alle IDs in einer Anfrage. FutMind: 30er-Pakete nacheinander.
- **Premium:** Der Server schickt über WebSocket Listen (`invest`, `filters`, `popular`) je Plattform.
  Ein Klick auf einen Eintrag schreibt Kaufpreis, Verkaufspreis, Spieler-ID und Liga direkt in die Einstellungen.

## 3. So kauft es
Drei Arten:
1. **Festpreis** (Standard Kaufpreis 150): kaufen, wenn Sofortkauf <= Kaufpreis.
2. **Echtzeit** (Prozent vom Marktpreis, Standard 95 %): Der Treffer kommt mit 95 % in die Schlange, die
   Sperre kurz vor dem Kauf prüft aber gegen den **vollen** Marktpreis (100 %).
3. **Gebotsmodus:** Beobachtungsliste alle 5,5 s mit **drei** EA-Aufrufen pro Takt
   (Beobachtete lesen, Auktionen aktualisieren, nochmal lesen), ein überbotenes Gebot wird neu geboten.
   Vor dem Gebot gibt es im Echtzeit-Gebot keine Obergrenze.

Vor dem Kauf geprüft: Preisgrenze, Kartenlimit (Standard AUS), Doppelkauf-Liste, Lauf aktiv.
**Nicht geprüft:** Coins, freier Platz, Frische der Karte. Das lehnt EA selbst ab.
Erster Treffer: sofort. Weitere Treffer derselben Suche: 1-5 s Verzögerung, Standard 1 Kauf pro Suche.

**AFK-Modus:** Er senkt die Preisgrenze Schritt für Schritt unter den billigsten Treffer, bis unter 6 Treffer
bleiben (bis 12 Durchläufe, bei 0 Treffern eine Stufe hoch). Danach Verkauf = Boden, Kauf = Boden minus Steuer minus 200.

## 4. Nach dem Kauf
- Wahl: behalten, Transferliste, Verein oder zum Verkauf einstellen.
- Einstellen: **eine Karte alle 1,5 s**, zuletzt-zuerst. Startgebot eine Stufe unter Sofortkauf, Dauer 1 h.
  Verkaufspreis fest (Standard 0) oder Prozent vom Marktpreis.
  Nach einem Stopp bleiben Karten in der Schlange ungelistet.
- **Transferliste lesen:** alle **6 s**, solange 0 Verkäufe/0 Münzen, sonst alle 20 s. Jeder Takt ist ein EA-Aufruf.
  Das ist deutlich mehr Anfragevolumen, als man erwartet, und es scheint auch ohne laufenden Lauf zu laufen.
- Neu einstellen und Verkaufte räumen: höchstens alle 5 Minuten (nur bei offenem Autobuyer-Bildschirm).
  Bei mehr als 15 unverkauften Karten pausiert die Suche 45 s (laut Meldung wegen Seiten-Last, nicht wegen EA).
- Stoppt bei 100 Karten in der Transferliste. Der angezeigte Gewinn ist eine Schätzung.

## 5. Fehler und Sperren
| EA-Code | Verhalten |
|---|---|
| 521, 512, 429, 494, 458 | Stopp (bei Suche und Kauf). Bei 458 (Captcha) wird die EA-Seite verlassen und utsniper.com geöffnet. |
| jede **fehlgeschlagene Suche** | Stopp |
| 3 x 401 in 20 s auf `/ut/game/` (nur, wenn die Sitzung vorher ok war) | Stopp ohne Neuladen |
| 426, 461, 478 beim Kauf | "Lost Bid", Lauf geht weiter. **Das ist für uns kein Vorbild:** unser Wissen über wachsende 461-Sperren bleibt gültig. |
| 470, 473 | nur Meldung |
| Fehler beim **Bieten** (Gebotsmodus) | nie Stopp, auch nicht bei 521/429 |
Keine Sperrzeit nach einer Warnung. "Safe Mode" ist nur ein Bestätigungsfenster und an mehreren Stellen abgeschaltet.
`forceStart` ("Trotzdem starten") umgeht die Start-Sperren.

## 6. Lizenz, Server, Daten
- Login mit E-Mail/Passwort oder Discord bei `api.utsniper.com`. Token-Erneuerung alle 570 s.
  Mit Lizenz lädt `content.js` das Hauptprogramm `js/main.js` (2,4 MB, nicht verschleiert, 36.000 Zeilen),
  ohne Lizenz `main2.js`. Die Lizenz wird lokal kaum erzwungen: ein Ablauf mitten in der Sitzung beendet den
  Bot nach diesem Code nicht von selbst.
- **Server, mit denen die Seite spricht:** api.utsniper.com, ws.utsniper.com (WebSocket, **immer an, ab Seitenstart**),
  fut.gg, futmind.com, enhancer-api.futnext.com, futbin.org (Spielerlisten), dazu Ton-Dateien von
  dl.sndup.net, myinstants.com, envatousercontent.com. Jeder dieser Server sieht IP und Nutzung.
- **Was an UTSniper geht (ohne Ausschalter):**
  - Jeder **Kauf, jedes Gebot, jeder Verkauf** (Preis, Zeit, Handels-ID, Spieler, Gewinn) über `/api/snipes/report`,
    Pakete bis 100.
  - Die **EA-Konto-ID** (`pidId`). Das, was der Bericht als "HWID" nennt, ist **keine Geräte-Kennung**, sondern
    diese ID (ersatzweise APP_GUID, im Klartext, nur bei unpassendem Format als SHA-256). Über `/api/hwid/link`
    verknüpft UTSniper sein Konto mit dem EA-Konto.
  - Bei Gewinn ab 5000 zusätzlich `notify-snipe` mit Spielername, Gewinn und Benutzername.
- **Nicht gefunden:** Versand von EA-Sitzungs-Token, Cookies, Passwörtern, Münzstand, Club-Inhalt; kein `eval`,
  kein Nachladen von Fremdcode, keine Fernsteuerung. (Nur aus dem Code gelesen. Zwei harmlose Bibliotheks-Tricks
  mit `Function('return this')`, Zeilen 9476 und 9939.)
- **Prüfenswert:**
  - Der Server kann HTML in die Premium-Tabelle schieben (Name, Promo, Bewertung, Level unescaped; Preise sind
    sicher). Die Popup-Fehlermeldungen vom Server werden auch als HTML gesetzt.
  - Das Anbieter-Token liegt im localStorage der EA-Seite (`token_ut`), Einstellungen unter `settings-ab`: für
    Skripte der EA-Seite lesbar. `externally_connectable` ist weit (ea.com, futbin.com, discord.com), wird aber nicht genutzt.
  - Der Server kann per Klick die Kaufschwellen des Bots setzen (Premium-Filter).
  - Der Server schickt in den Antworten eine Bild-Adresse, die der Hintergrunddienst abruft (jede http(s)-Adresse).
  - Preisroute von fut.gg ist fest auf FC 26 gestellt, andere Wege auf 27: Echtzeit-Preise können leer oder falsch sein.
    Fallen alle drei Preisquellen aus, **hängt** der Echtzeit-Modus still (keine Zeitgrenze).

## 7. Vergleich mit unserem Bot
| Punkt | UTSniper | Unser Bot |
|---|---|---|
| Suchweg | EA-App-Funktionen (immer) | direkter Weg ist Standard, App-Weg Schalter (Standard AUS, im Test) |
| Suchabstand | 7-15 s Standard, 0 möglich | FST-Takt (ca. 3,3-4 s), viel schneller |
| Kauf | sofort, 1-ms-Schlange | sofort, im FST-Modus ohne Denkpause |
| Limits | keine | im FST-Modus keine, im strengen Modus Tages- und Sperr-Grenzen |
| 426/461 | "harmlos" | strenger Modus: harter Stopp bzw. Vorbote einer Sperre |
| Rotation, Listen, Preis-Check, eigene Marktmessung | nein | ja |
| Daten nach außen | Käufe, Verkäufe, EA-Konto-ID an Anbieter | nichts nach außen |
| Quellenprüfung der Brücke | schwach (Nachricht-Quelle nicht geprüft) | schon da (`sniffer.js:1330`, `content.js:8093`) |
| Zeitlimit-Standard | 15-30 min | 60 min im FST-Modus (leer = 300), 30 im strengen |
Fazit: **Bei den Zahlen ist unser Bot im FST-Modus gleich offen oder schneller. Beim Weg ist UTSniper vorsichtiger,
weil es immer über die EA-Web-App geht.**

## 8. Ideen (nichts davon gebaut, keine Bestätigung vom Nutzer)
1. **Fingerabdruck-Suche der EA-Klassen** für unseren App-Suchweg (Methodennamen statt Klassennamen).
   Hält nach EA-Umbenennungen. Kein Risiko für das Konto. **Sinnvoll.**
2. **Stiller 401-Zähler** (3 in 20 s: Stopp). Billig, senkt das Risiko. **Sinnvoll**, bei uns prüfen, ob es das schon gibt.
3. **Fremde Preisquelle als Kaufschwelle nach der Suche** (nicht als Vorfilter, das ist ein Missverständnis des
   ersten Berichts). Berührt EA nicht. Sendet aber IP und Spieler-Listen an Dritte. Nur mit Einwilligung des Nutzers.
4. **Zufälliges Mindestgebot und Höchstgebot pro Suche:** Wirkung unbewiesen, kein sicherer Nutzen. Eher nicht.
5. **Nicht übernehmen:** Konto-Verknüpfung, Telemetrie, Serverbefehle, "426/461 sind harmlos", Abbruch nur bei
   Suchfehler, Beobachtungsliste im 5,5-s-Takt mit drei Aufrufen (das ist mehr Last, nicht weniger).

## 9. Korrekturen der Prüfer (damit niemand die Rohberichte falsch liest)
Falsch im ersten Bericht: "Höchstpreis-Sperre = Prozentpreis" (ist voller Marktpreis); "bei Preisfehler wird nicht
gekauft" (Echtzeit hängt still); "Pause nach 10-15 Suchen jedes Mal neu" (einmal pro Lauf); "Transferliste alle 20 s"
(6 s bei 0 Verkäufen); "HWID = Gerätekennung" (EA-Konto-ID); "WebSocket nur im Premium-Reiter" (immer an);
"Preis-Quelle FUTBIN" (FutNext); "Suchergebnis-Schwelle 21 filtert" (nur Anzeige im Protokoll);
"maxBid nach der Antwort geleert" (sofort nach dem Absenden); "unser Standard ist die App" (ist der direkte Weg);
"Quellenprüfung bei uns sicherstellen" (ist schon da); "Fremde Preisquelle als Vorfilter" (ist nachher);
"22 Sprachordner" (20); Zeilenangaben in background.js teils verschoben. Alles ohne Live-Test.
