# FST-Analyse: Gesamtbericht

## Kurz vorweg

Die Untersuchung des FST-Codes ist fertig. Es wurde nur gelesen. Keine Datei wurde geändert. Kein Code lief, und kein Server wurde angefragt. Grundlage sind `C:\Users\oders\Documents\Sniping bot\build\assets\scripts.js` und `style.css`. „Z.“ steht für Zeilennummer in `scripts.js`.

**Das Wichtigste in 8 Punkten:**

1. FST sucht und kauft ohne Klicks. Es ruft direkt die Funktionen der EA-Web-App auf (Z. 56977, 57007, 58375, 58391).
2. Zwischen zwei Suchen wartet es im Standard **3,3 bis 4,0 Sekunden**. Manchmal kommt ein kleiner Zuschlag dazu (Z. 58618-58625).
3. Vor jeder Suche leert es den Zwischenspeicher. Außerdem ändert es den Filter leicht. So bekommt EA selten zweimal dieselbe Anfrage (Z. 58353-58368).
4. Es kauft immer nur den **ersten Treffer** (Z. 58276).
5. Jede Suchantwort ohne „200 = OK“ stoppt den Bot sofort. Für 426, 461 oder 521 gibt es keine eigene Regel (Z. 59455-59473, 59553-59568).
6. Die „klugen“ Teile laufen auf dem FST-Server. Dazu gehören die Live-Filter, die Wertungen, die Filter-Rotation, die Warnungen vor dem Start und die SBC-Lösungen. Diese Logik steht nicht im Code.
7. FST schickt viele Daten an seinen Server. Dazu gehören EA-Konto-ID, Münzen, Vereinsdaten, Auktionen, Käufe und Fehler (Z. 56890-56907, 59479-59551).
8. Eine Sitzung läuft im Standard **4 Minuten** (Z. 3269). Die Pausen sind im Standard **aus** (Z. 3263).

---

## 1. Aufbau

1. **Einbau in die EA-Seite.** Eine Erweiterung lädt `scripts.js` direkt in die EA-Seite. Nur so sieht FST die echten EA-Objekte und alle EA-Antworten (Z. 59418-59624, 61645-61700).
2. **Start.** Ein Zeitgeber prüft alle 100 ms, ob die EA-Seite bereit ist. Dafür müssen `.ut-root-view`, `h1.title`, die EA-Antwort „usermassinfo“ und `readyState = complete` da sein. Eine Zeitgrenze gibt es nicht (Z. 61676-61700, 59427-59453). Dann baut `installUI` die Oberfläche ein (Z. 59009-59051).
3. **Oberfläche.** Die Oberfläche ist eine Vue-3-App in einer Seitenleiste rechts, 415 px breit. Die EA-Seite wird dafür schmaler gemacht (style.css Z. 13-24, 3163-3169; Z. 59015-59026).
4. **EA-Objekte finden.** FST sucht EA-Teile an ihren Merkmalen, nicht an ihren Namen. Beispiel: Ein Objekt mit `getRootViewController` gilt als Haupt-App. Fehlt ein Name, legt FST einen Ersatz an (Modul 875, Z. 256-346, 480-536). Ein echter EA-Name wird nie überschrieben (Z. 482).
5. **Such-Motor.** Die Klasse `nL` hat genau eine Instanz, `sL` (Z. 58242-59007, 59409). Der Suchmodus ist fest „renderless“, also ohne Klicks (Z. 3336, 56977, 57007). Der Klick-Weg („normal“) ist toter Code.
6. **Mithören.** FST überschreibt die Browser-Funktion für Netz-Anfragen. So liest es jede EA-Antwort mit: Suche, Kauf, Fehlercodes, Preisgrenzen und Angebotsnummern (Z. 59418-59624).
7. **Werkzeugkasten.** Modul 305 enthält Preisstufen, Runden, Zufallszahlen und „Filter in die EA-Maske schreiben“ (Z. 786-2779).
8. **Speicher.** Der zentrale Speicher (Modul 157) liegt nur im Arbeitsspeicher (Z. 3253-3386). Im Browser bleiben nur `FST_token` und `FST_locale` (Z. 3170, 3239, 3910).
9. **Navigation.** Ein einziger Text `currentPage` bestimmt die sichtbare Seite (Z. 3325, 57716-57809). Die Funktion `le()` wechselt den Reiter passend zur EA-Seite (Z. 19256-19273).
10. **Server.** Alle FST-Daten gehen an `https://api.dashboard.futsimpletrader.com` (Z. 61645-61651).

---

## 2. Das Gehirn: Such- und Kaufschleife

### 2.1 Vor dem Start (Knopf „Zur Übersicht“)

1. Das Vorab-Fenster öffnet sich (Sicherheitsassistent, siehe Abschnitt 7). Danach ruft der Bot `k()` auf (Z. 29932-29938, 30154-30158).
2. Die EA-Suchseite muss offen sein, sonst erscheint ein Hinweis (Z. 29793-29796).
3. Der Bot liest die 4 Preisfelder der EA-Seite: Min-/Max-Gebot und Min-/Max-Sofortkauf. Das sind die Startwerte (Z. 29797-29803).
4. Die Automatik für Preisschritte ist im Standard an. Dann holt der Bot die Schritt-Zahlen aus einer Server-Tabelle (`auto_price_range`). Die Standardwerte 10/0 gelten dann meist nicht (Z. 29803-29809).
5. Prüfungen vor dem Start (Z. 29810-29864):
   - Transferliste genau 100 und Modus „einstellen“: kein Start.
   - Mehr als 4 nicht zugewiesene Karten (mit Freischaltung mehr als 99): kein Start.
   - Modus „einstellen“ und Max-Sofortkauf ≥ round(Verkaufspreis × 0,95): kein Start (kein Gewinn nach 5 % Steuer). Das gilt auch für jedes Chemie-Stil-Profil.
   - Max-Bereich nach Schritten unter 200 oder Min-Bereich ≥ Max-Bereich: kein Start.
   - Keine Karte gewählt: Rückfrage „trotzdem?“ (Z. 29832-29835).
6. Der Bot meldet eine Sitzung an (`POST /api/start-search-session`). Erst bei Erfolg startet `sL.startBid()` (Z. 29878-29896).
7. `startBid` setzt die Zähler auf 0 und startet die Laufzeit-Uhr. Sind die Pausen aus, setzt es die Pausenwerte auf Standard. Dann gilt `autoBidOn = true`, und die erste Suche startet (Z. 58796-58811).

### 2.2 Eine Such-Runde

1. Die Zähler steigen: `currentRequestNumbers` und `numberOfSearch` (Z. 58454-58461).
2. **Suchfilter:** Der Bot nimmt das echte Filter-Objekt der EA-Suchseite, keine Kopie. Alle Änderungen landen direkt im EA-Filter (Z. 58265-58268, 1405-1408).
3. **Min-Sofortkauf wandert:** Jede Suche geht er eine Preisstufe hoch. Ist der Zähler größer als `minPriceRangeSteps` (Standard 10), springt er auf den Startwert zurück. Ein Durchlauf dauert also 11 Suchen (Z. 58353-58357).
4. **Max-Sofortkauf wandert:** Nur beim Rücksprung und nur mit `maxPriceRangeSteps` > 0 sinkt er eine Stufe. Nach M Schritten geht er wieder hoch (Z. 58357-58365). Achtung: An Stufengrenzen trifft das den Startwert nicht genau (Beispiel 1.000 → 900 → 950).
5. **Min-Gebot wechselt:** Sind beide Zähler 0, wechselt das Min-Gebot zwischen 0 und 150 (Z. 58366-58368).
6. **Zwischenspeicher leeren:** `services.Item.clearTransferMarketCache()` läuft vor jeder Suche (Z. 58368).
7. **Schutz 5007:** Liegt der Max-Sofortkauf über dem Startwert, stoppt der Bot (Z. 58370-58374).
8. **Suche:** `services.Item.searchTransferMarket(Filter, 1)`, also immer Seite 1 (Z. 58375).
9. **Zu viele Treffer:** Mehr als 10 Treffer (Schalter an): Stopp mit Code 5006 und Ton. Das prüft der Bot **vor** dem Kauf (Z. 58378, 58438-58452).
10. **Kauf:** Der Bot bietet nur auf den **ersten** Treffer, zu dessen eigenem Sofortkaufpreis: `services.Item.bid(t[0], t[0]._auction.buyNowPrice)` (Z. 58276, 58391-58397). Eine eigene Preisprüfung gibt es davor nicht. `buyNowPriceIsOK` wird nie aufgerufen (Z. 58852). Schutz bieten nur der Max-Preis im Filter und die 10-Treffer-Grenze.
11. Jedes Gebot zählt `numberOfBids` hoch (Z. 58396).
12. Kein Treffer oder Fehler: sofort weiter zur Prüfung vor der nächsten Suche (Z. 58328-58330).

### 2.3 Nach einem Kauf

| Modus | Ablauf | Zeilen |
|---|---|---|
| `sendToTransfersList` (Standard) | 5.000-6.500 ms warten, dann Karte in die Transferliste schieben (`services.Item.move`) | Z. 58317-58323 |
| `list` | Karte einstellen, siehe Abschnitt 5 | Z. 58278-58316 |
| sonst (`leaveUnassigned`) | 5.000-6.500 ms warten. Die Karte bleibt bei „nicht zugewiesen“ | Z. 58324-58327 |

Gleichzeitig reagiert die Mithör-Funktion auf den Kauf: Zähler +1, Eintrag in die Kaufliste, Ton und Meldung an den FST-Server (Z. 59489-59552).

### 2.4 Vor der nächsten Suche (`searchAgain`, Z. 58469-58763)

Der Bot prüft der Reihe nach:

1. Laufzeit oder Limit erreicht: Stopp mit Ton. Das Limit wird **exakt** verglichen (`===`) (Z. 58765-58775).
2. Nicht zugewiesen > 4 (bzw. > 99): Stopp, Code 5005 (Z. 58493-58502).
3. Münzen unter dem Start-Max-Preis: Der Bot fragt die Münzen einmal neu bei EA ab. Reicht es dann immer noch nicht: Stopp, Code 5004 (Z. 58504-58525).
4. Transferliste genau 100 (Modus „einstellen“ oder „in Transferliste“): Ist „Verkaufte löschen“ an, wartet er 1.100-1.800 ms, räumt auf und wartet 2.500-3.500 ms. Sind es immer noch 100: Stopp, Code 5003 (Z. 58527-58557).
5. Tageslimit des Abos erreicht: Stopp, Code 5008 (Z. 58559-58571).
6. Alle 8 Suchen (nur Modus „einstellen“, offene Angebote): Er wartet 980-1.270 ms und prüft die Verkäufe. Danach kommen 1.300-1.855 ms auf die Wartezeit dazu (Z. 58573-58587).
7. Alle 10 Suchen: Zwischenstand an den FST-Server (Z. 58588-58589).
8. Pausen ausrechnen (siehe 2.6).
9. Wartezeit auswürfeln und die nächste Suche planen. Gesamt = Grundzeit + Verkaufs-Prüfung + Pause (Z. 58636, 58749-58755).

Die Uhr startet erst hier, also **nach** der EA-Antwort und nach der Kauf-Nachbearbeitung.

### 2.5 Wartezeit zwischen zwei Suchen

| Tempo | Grundzeit | Zuschlag | Zeilen |
|---|---|---|---|
| safe | 3.600-4.990 ms | mit Chance 21/101 (≈ 21 %): +900-1.800 ms | Z. 58618-58625 |
| **normal (Standard)** | **3.310-4.010 ms** | mit Chance 51/101 (≈ 50 %): +100-600 ms | Z. 58618-58625 |
| turbo | 2.520-3.111 ms | mit Chance 51/101: +120-420 ms | Z. 58618-58625 |

- Alle Zufallszahlen sind ganze Zahlen, beide Grenzen eingeschlossen (Z. 1375-1377). Die Chance ist (p+1)/101 (Z. 1619-1621).
- „turbo“ gibt es nur mit Abo-Recht `turbo_mode` (Z. 29974-29988). Ein Server-Filter kann es aber trotzdem setzen (Z. 1830-1831).
- Die Zeiten des Klick-Wegs (normal 2.000-2.575, safe 2.500-3.880, turbo 1.550-1.885 ms) sind toter Code (Z. 58625-58630).

**Grob gerechnet (eigene Schätzung):** Im Tempo „normal“ sind es etwa 3,8 s plus EA-Antwortzeit pro Suche. Das ergibt grob 12-15 Suchen pro Minute. In 4 Minuten Laufzeit sind es also etwa 50-60 Suchen.

### 2.6 Pausen (nur wenn `useBreaks` an ist; Standard: aus)

- **Nächste Pause:** bei Suchzahl + 45 ± 30 % (Formel Z. 1951-1954; Z. 58593-58595).
- **Dauer:** max(3.134 ms, 90 s ± 30 %) (Z. 58601-58606).
- **Lange Pause:** Sie kommt nach 4 ± 30 % kurzen Pausen. Achtung: Gezählt werden Pausen, nicht Suchen. Sie dauert max(3.134 ms, 240 s ± 30 %) und ersetzt die kurze Pause (Z. 58596-58617).
- Die Pause kommt zur normalen Wartezeit dazu. Der Countdown läuft im Sekundentakt (Z. 58631-58636).
- Beim Login ersetzt der Server die 5 Pausenwerte durch `presetBreaks[1]` (Z. 56936-56954).

### 2.7 Wie der Bot stoppt

| Auslöser | Code | Zeilen |
|---|---|---|
| Laufzeit (Standard 4 min) oder Kauf-/Such-/Minuten-Limit | – | Z. 58765-58793 |
| Tab wird unsichtbar | 5001 | Z. 57051-57057 |
| EA-Suchseite wird verlassen | 5002 | Z. 59112-59131 |
| Transferliste voll | 5003 | Z. 58541-58557 |
| Zu wenig Münzen | 5004 | Z. 58504-58525 |
| Nicht zugewiesen voll oder EA-Code 473 beim Kauf | 5005 | Z. 58493-58502, 59553-59568 |
| Mehr als 10 Treffer | 5006 | Z. 58438-58452 |
| Max-Preis über Startwert | 5007 | Z. 58370-58374 |
| Abo-Tageslimit | 5008 | Z. 58559-58571 |
| Einstellpreis gäbe Verlust | 5009 | Z. 58288-58304 |
| Jede Suchantwort ungleich 200 | HTTP-Code | Z. 59455-59473 |
| Server antwortet 422 („Futbin-Preis wiederhergestellt“) oder 403 („Sitzung abgelaufen“) | – | Z. 59373-59388 |
| Strg+Umschalt+P | – | Z. 59416-59418 |

Alle Codes 5001-5009 gehen an den FST-Server (`/api/search-error`) (Z. 1572-1583). Die Taste Strg+Umschalt+P stoppt nur die Suche, nicht das Auto Trading. In einem Eingabefeld wirkt sie nicht (Z. 18988-18994, 58813-58828).

### 2.8 Preisstufen (EA-Raster)

| Preis | Schritt |
|---|---|
| 0 | 150 (oder mitgegebener Wert) |
| unter 1.000 | 50 |
| unter 10.000 | 100 |
| unter 50.000 | 250 |
| unter 100.000 | 500 |
| ab 100.000 | 1.000 |

Quelle: Z. 1546-1549. Gerundet wird zusätzlich mit EAs eigener Tabelle `PRICE_TIERS`, höchstens 14.999.000 (Z. 1431-1443). Beim Abziehen einer Stufe nimmt FST den Schritt von „Preis − 1“. So wird 1.000 zu 950 (Z. 1558-1562).

**Für unseren Bot:** Die Wartezeit „normal“ (3,3-4,0 s) ist eine vernünftige Untergrenze. Der Filter-Wechsel gegen den Zwischenspeicher ist nützlich. Beim Max-Preis lieber den Startwert merken, statt Schritte zurückzurechnen.

---

## 3. Live-Filter-System

**Woher:** `GET /api/filters?coins=<echter Münzstand>` (Z. 4099-4114, 34892-34909). Die Antwort hat 3 Listen und einen Zusatz:

- `quick_flip` = Live-Filter
- `user_filters` = eigene Filter
- `preset_filters` = Vorlagen
- `market_activity` = Marktaktivität

**Wie oft:** Es gibt kein Zeit-Intervall. Neu geladen wird:

- bei jedem Einblenden der Filter-Seite, auch auf den Seiten „Filters“, „PresetFilters“ und „CustomFilters“ (Z. 34949-34951, 57749-57771);
- per Neu-laden-Knopf. Den gibt es nur mit Abo-Recht `has_live_filter_refresh`. Danach ist er 5 s gesperrt, allerdings nur optisch (Z. 34889-34891, 35204-35228);
- nach dem Ende einer Suche: Die App springt zurück zur Live-Filter-Seite, und die lädt neu (Z. 57120-57121);
- beim Login, beim Speichern eines Filters und beim Öffnen von „Meine Vorlagen“ (Z. 56917, 19900, 19932, 25063).

Korrektur zu einem früheren Befund: Der Wächter auf die Sitzungs-ID feuert beim **Start** einer neuen Sitzung, nicht beim Ende (Z. 34941-34945, 29875, 42640).

**Felder eines Live-Filters** (Z. 4099-4114, 34892-34919): id, filter_name, lowest_bin, score, raw_score, personal_adjustment, cooldown_meta.until_clear, tags, tooltip, filter_stat, budget, is_featured, featured_reason, auto_price_min_profit, rating, rarity_name, filter_type, type, player_id, min/max_buy_now, highest_bin.

**Wertung (Score):** Sie kommt fertig vom Server. Die Hilfe zeigt eine Skala bis 9,9 (Z. 20581-20693). Wie der Server rechnet, ist unbekannt.

**Abkühlung (Cooldown):** Wurde ein Filter oft hintereinander genutzt, schickt der Server `personal_adjustment < 0`. Dann zeigt die Zeile:

- den alten Wert `raw_score` neben dem neuen;
- das Schild „Cooldown ↓|x|“;
- 5 Punkte. Ein Punkt ist gefüllt, wenn seine Nummer ≤ 5 − `until_clear` ist.

Der Hinweis sagt: „N andere Filter wählen“. Laut Text dient das dem Schutz des Kontos (Z. 35504-35656).

**Treffer-Quote:** `filter_stat` ist fertiger Text vom Server, zum Beispiel „4,9 % / 60 %“. Das heißt: Treffer pro 100 Suchen / Erfolgsquote (Z. 34540-34547, 35470-35492).

**Schilder:** Die Schilder sind eine Server-Liste `tags` mit Klasse, Symbol und Text (Z. 35400-35466). Die Hilfe kennt diese Schilder: Profit+, Undercut, Hot, Open, Chem, New (Z. 20631-20673). „Nischen Preis“ steht nicht im Code. Es kommt vom Server oder aus der Sprachdatei. Alle Schilder einer Zeile haben denselben Tooltip (Z. 35423-35424).

**„For You“:** `is_featured`. Mögliche Gründe: safety, low_competition, fresh_price, market_hot. Der erste solche Filter wird automatisch gewählt, aber nur im Reiter Live-Filter (Z. 34903-34905, 34921-34929).

**Budget-Stufen:** Die Reiter Alle/Niedrig/Mittel/Hoch filtern nur die Anzeige. Grundlage ist das Feld `budget` vom Server. Es wird nicht neu geladen, und es gilt nur für die Live-Liste (Z. 35698-35705, 34871-34882). Standard ist „alle“ (Z. 3363). Die Wahl wird nicht dauerhaft gespeichert.

**Marktaktivität (Tacho):**

- Stufen: schlecht = 13, mittel = 40, gut = 70, sehr gut = 92, oder eine Zahl von 0 bis 100 (Z. 20443-20453).
- Die Farbe geht von Rot #EA3943 bis Grün #16C784 (Z. 20422-20510).
- Quellen: `/api/filters`, der Start einer Sitzung und alle 10 Suchen (Z. 4113-4114, 29895, 59371).
- Das Detail-Fenster zeigt: Punktzahl von 100, Konkurrenz (Stufe von 5), Treffer- und Erfolgsquote und die nächste Spitzenzeit (Z. 37374-37542).

**Empfohlene Filter („Cheapest by rating“):** Sie gibt es für die Wertungen 82-90 über `/api/cheapest-by-rating-filters`. Das Ergebnis wird je Wertung gemerkt. Eine leere Liste zählt nicht als gemerkt (Z. 4381-4435). Die Filter-Seite hat zusätzlich „Fodder“ für die Wertungen 81-99 (Z. 36008).

**„Filter laden“** (Z. 34711-34762, 1732-1894):

1. Wenn nötig, springt der Bot zum Transfermarkt und wartet bis zu 25 × 150 ms.
2. Der Filter wird in die EA-Maske geschrieben:
   - Nur der Zurücksetzen-Knopf und der Typ-Reiter werden künstlich angeklickt (Z. 1759-1764).
   - Min/Max-Sofortkauf werden in die Felder geschrieben und mit einem Änderungs-Signal gemeldet (Z. 1764-1773).
   - Alles andere setzt der Bot direkt über EA-Objekte: Spieler, Stufe, Seltenheit, Position, Chemie, Liga und Nation (Z. 1778-1822). Vor dem Verein wartet er 380 ms (Z. 1813-1815).
3. `highest_bin` wird zum Verkaufspreis (Z. 1831-1833).
4. Die Filter-ID wird nur bei Live-Filtern mit ID gesetzt, sonst ist sie leer (Z. 1843-1849).
5. Der Mindestgewinn ist `auto_price_min_profit` oder 300 (Z. 34744-34754). Dann öffnet sich die Vorab-Prüfung.
6. Beim Start prüft der Bot: Passt der Spieler nicht mehr zum Filter, wird die Filter-ID gelöscht (Z. 29866-29873).

**Gratis-Grenze:** Ist `free_live_filters_limit` gesetzt, ist der Live-Bereich gesperrt (Z. 1491-1497). Jedes Laden senkt den Zähler lokal um 1. Die Antwort 403 bringt einen Premium-Hinweis (Z. 34908-34915).

**Eingebauter Tipp** (Z. 55888): Live-Filter gelten nur wenige Minuten. Der Kaufpreis soll 6-10 % unter dem Verkaufspreis liegen.

---

## 4. Auto Trading

### 4.1 Zwei Modi

- **live_preset** (Standard, Z. 3366): Der Server wählt die Live-Filter der Reihe nach.
- **custom:** Eigene Filter-Plätze und 8 Einstellungs-Zeilen (Z. 41268-41359).

Nutzer mit Live-Filter-Grenze sehen „custom“ zuerst. Bei ihnen ist „live“ gesperrt (Z. 39311-39390).

### 4.2 Start

1. „Zur Übersicht“ schickt `POST /api/auto-trades/pre-check`. Die Antwort enthält die Aktivität für 1 h, 3 h und 24 h und Warnungen (Z. 42375-42413).
2. Nach der Bestätigung im Vorab-Fenster schickt der Bot `POST /api/auto-trades` mit **allen** Einstellungen und dem Guthaben. Zurück kommt eine `auto_trade_id` (Z. 42170-42180, 42601-42602).
3. Start-Budget = min(max_coins_to_trade, Guthaben). Dann startet die Filter-Schleife (Z. 42601-42608).

### 4.3 Filter-Schleife (Z. 42197-42373, 42621-42675)

1. Pause mit Countdown.
2. Münzen neu bei EA abfragen. Budget neu rechnen: min(Budget − ausgegeben, Guthaben). Ist „ausgegeben“ negativ, zählt es als 0 (Z. 1919-1923).
3. `GET /api/auto-trades/filter` mit auto_trade_id, vorigem Filter, Budget und Plattform. **Welcher Filter kommt, entscheidet nur der Server.** Der Satz „volle und kürzlich gejagte Karten meiden“ steht nur als Werbetext im Code (Z. 39851).
4. Wartezeit bis zum nächsten Filter: Die Server-Angabe `waitseconds` oder **35 s** (Z. 42222-42223).
5. Kein Filter da: Im Live-Modus fragt der Bot nach 20 s neu. Im Custom-Modus stoppt er mit Fehler (Z. 42224-42241).
6. Filter in die EA-Maske schreiben und 380 ms warten (Z. 42060-42074).
7. **Innerhalb eines Filters gibt es keine Pausen.** Der Bot setzt `useBreaks = false` (Z. 42257). Das Tempo kommt aus der eigenen Einstellung (Z. 42245).
8. Chemie-Varianten bilden und den Preis prüfen, siehe Abschnitt 5 (Z. 42257-42320).
9. Mindestgewinn:
   - Auto: `auto_price_min_profit` vom Server, sonst 300.
   - Custom in %: floor(Verkaufspreis × 0,95 × p/100).
   - Custom in Münzen: der feste Wert.

   Quelle: Z. 42330-42340, 163-168.
10. **Max-Kaufpreis = auf die Stufe abgerundet (Verkaufspreis × 0,95 − Mindestgewinn), mindestens 250** (350 bei Gold ohne Seltenheit, 650 bei Gold mit Seltenheit 1). Der Wert wird direkt in die EA-Maske geschrieben (Z. 42340-42342, 2553-2561).
11. Nach 200 ms: Sitzung anmelden, dann `sL.startBid()` (Z. 42621-42671).
12. Endet die Suche, kommt die Wartezeit und dann der nächste Filter (Z. 42672-42675).

**Wann eine Filter-Sitzung endet:**

- Käufe ≥ `max_purchase_per_filter` (Standard 5) oder Gebote ≥ `max_transaction_per_filter` (Standard 10). Auch Fehlversuche zählen als Gebot (Z. 42734-42743, 58396).
- Vermutlich auch nach der Laufzeit der Such-Sitzung. Die kommt aus dem Filter oder ist sonst der Standard von 4 min. Beim Schreiben des Filters setzt der Bot die Such-Einstellungen auf Standard und übernimmt `minutes` aus dem Filter (Z. 1756-1759, 1827-1828, 58767-58768). **Unsicher.**
- Harte Stopps: Suchfehler, 473, Suchseite verlassen. Sie beenden das ganze Auto Trading (Z. 59455-59458, 59553-59557, 59115-59126, 42581-42584).

**Fehler und Wiederholung:**

- 422 bei `/filter`: Stopp.
- Andere Fehler: neuer Versuch nach 60 s.
- Preisprüfung fehlgeschlagen: neuer Versuch nach 10 s (Z. 42362-42370, 42696-42700).
- FST-Fehler: Der Code liest `e.response.status` ohne Prüfung. Bei einem Netzfehler bleibt das Auto Trading deshalb hängen (Z. 42363, 42610).

**Laufzeit:** Die Laufzeit zählt nur in der Anzeige herunter (Z. 42606-42608). Einen eigenen Stopp bei 0 gibt es im Code nicht. Wer dann stoppt, ist **unklar**, vermutlich der Server.

### 4.4 Standardwerte und Modus-Regeln

- Standardwerte: siehe Tabelle in Abschnitt 6 (Z. 41926-41963). Beim Öffnen überschreibt der Server die Pausenwerte mit `presetBreaks[2]` (Z. 42753).
- **Live-Modus (korrigiert):** Die festen Werte werden beim Öffnen der Seite und beim Wechsel in den Live-Modus gesetzt, **nicht beim Start**. Das sind: Verkaufsmethode „recommended“, Tempo normal, Auto-Gewinn, Auto-Pausen, keine Zusatz-Limits und alle Schilder (Z. 41993-42015). Budget, Min-/Max-Preis und die Kauf-Grenzen bleiben so, wie sie im Custom-Modus eingestellt waren.
- **Custom-Zeilen:** Jede Zeile kann auf „Auto“ oder „Custom“ stehen. „Auto“ setzt:
  - Budget = Guthaben, Kartenpreis = abgerundetes Guthaben, Laufzeit 60 min;
  - Auto-Gewinn an, Kauf-Grenzen 5/10, Tempo normal;
  - Verkaufsmethode „recommended“ ohne Chemie-Preise;
  - Auto-Pausen mit Stufe 2.

  Quelle: Z. 40140-41044. „Guthaben“ ist dabei der Stand beim Öffnen der Seite, nicht der aktuelle.
- **Pausen-Stufe nach Laufzeit:** unter 30 min Stufe 0, 30-59 min Stufe 1, ab 60 min Stufe 2. Das greift nur, wenn sich die Laufzeit ändert (Z. 42556-42560).
- **Vorlagen (korrigiert):** Gespeichert werden nur die Einstellungen, ohne Zeilen-Modi (Z. 39003-39006). Beim Laden:
  - Budget und Kartenpreis werden auf das Guthaben begrenzt.
  - Alle Zeilen stehen zuerst auf „Auto“.
  - Nur 8 feste Regeln setzen einzelne Zeilen auf „Custom“ (Z. 42531-42543).
  - Unbekannte Filter fallen weg (Z. 42459-42530).
- **Zurücksetzen:** 2 Klicks innerhalb von 3,5 s (Z. 41968-41977).
- **Filter-Gruppen:** Man kann Gruppen anlegen, löschen und Filter hinzufügen oder entfernen. Eine Verbindung zum Auto Trading ist nicht zu sehen.

### 4.5 Auto-Bieten (Bieter)

Ablauf (Z. 46306-46815, 47326-47735):

1. **Start:** Kein Wert darf 0 sein. Die Münzen müssen reichen: Münzen ≥ Maximalgebot × Gebote pro Runde. Dann `POST /api/auto-bid` (Z. 47360-47414).
2. **Suche:** Seite 1 bis 4. Ist im Filter kein Max-Gebot gesetzt, nimmt der Bot das Maximalgebot. Danach wartet er 1.500 ms (Z. 46445-46447, 46676).
3. **Auswahl:**
   - Restzeit unter N Minuten (Standard 5). Gibt es keine solche Auktion, ist sofort Schluss (Z. 46449-46459).
   - Aktuelles Gebot unter dem Maximalgebot und Sofortkaufpreis darüber (Z. 46461-46465).
   - Keine passt: nächste Seite. Ab Seite 4 ist Schluss (Z. 46469-46481).
4. **Gebot:** Der Bot bietet **sofort und einmal den vollen Maximalwert**. Er erhöht nicht in Schritten, wartet nicht auf die letzte Sekunde und bietet nicht nach (Z. 46531-46533).
5. **Takt:**
   - Höchstens 2 Gebote pro Suche, dazwischen 3.800-5.500 ms (Z. 46599-46614).
   - Ist das Runden-Limit noch nicht erreicht: 2.500 ms bis zur nächsten Suche (Z. 46635).
6. **Runden-Ende:** Nach 5 Geboten (Standard) wird die Sitzung geschlossen. Dann kommt eine Pause (Standard zufällig 60-75 s). Danach räumt der Bot die Beobachtungsliste auf: 1.010 ms warten, abgelaufene und verlorene Auktionen entfernen, 1.210 ms warten. Dann meldet er Gewinne und Überbietungen. Nach 2 Runden (Standard) ist Schluss (Z. 46339-46407, 46730-46810).
7. Fehlgeschlagene Gebote zählen mit zum Limit (Z. 46531, 46596-46604).

---

## 5. Verkaufen und Transferliste

### 5.1 Einstellen nach dem Kauf (Modus `list`)

1. Das geht nur, wenn Start- und Verkaufspreis beide > 0 sind (Z. 58278-58281).
2. Fehlen die EA-Preisgrenzen der Karte, holt der Bot sie mit `requestMarketData` (Z. 1649-1685).
3. **Verkaufspreis n:** Der Bot sucht ein Profil mit passender `databaseId`. Hat das Profil eine Seltenheit, muss auch die passen. Der Chemie-Stil muss gleich sein. Gibt es kein passendes Profil, gilt der allgemeine Verkaufspreis (Z. 59392-59403).
4. Kaufpreis > n: Der Bot stoppt und warnt „Wrong list price!“. **FST-Fehler:** Es fehlt ein `return`. Die Karte wird trotzdem eingestellt (Z. 58284-58288).
5. n über dem EA-Maximum:
   - Ist Maximum × 0,95 < Kaufpreis: Stopp mit Code 5009.
   - Sonst: n = Maximum (Z. 58288-58305).
6. Nach 4.100-6.000 ms: Ist die Transferliste voll, passiert nichts. Sonst wartet der Bot 600-925 ms und ruft `services.Item.list(Karte, Start, n, 3600)` auf. Das Angebot läuft **1 Stunde**. Startpreis = n minus eine Stufe, gerundet (Z. 58306-58308, 58411-58436). Der eingestellte `listStartPrice` wird dabei **nicht** benutzt.
7. Danach wartet er 3.000-5.000 ms. Bei einem Fehler geht es sofort weiter (Z. 58309-58315).
8. Die Angebotsnummer (`tradeId`) liest er aus der EA-Antwort auf das Einstellen (Z. 59620-59622).

### 5.2 Verkäufe prüfen und aufräumen

- **Alle 8 Suchen** (nur im Modus „einstellen“ und nur bei offenen Einträgen): Der Bot fragt die Transferliste echt bei EA ab. Er markiert verkaufte Einträge über die Angebotsnummer. Bei einem Treffer lädt er die Münzen neu (Z. 58573-58587, 59252-59345).
- **Genau 100 Karten** und „Verkaufte löschen“ an: Der Bot ruft EAs eigene Funktion `_clearSold` auf. Danach lädt er die Münzen neu (Z. 59138-59250, 59212-59214).
- **Gewinn in der Kaufliste:** parseInt(Verkaufspreis × 0,95) − Kaufpreis. Das gilt nur im Modus „einstellen“, sonst ist er 0. Der Bot nimmt dafür den **ungekappten** Preis. Die Anzeige kann also zu hoch sein (Z. 59512-59515).
- **Verkaufspreis glätten:** Der Preis wird auf die Stufe gerundet, mindestens 200. Startpreis = Preis − Schritt(Preis − 1) (Z. 1593-1602).

### 5.3 Verkaufspreis ermitteln (Preisprüfer, Z. 28036-28663)

Der Preisprüfer arbeitet mit **echten Marktsuchen** über EA-Funktionen. Er sucht den Preis ähnlich wie beim Halbieren eines Bereichs.

**Ablauf:**

- **Start:** der Max-Preis des Filters, sonst 15.000.000. Ist er größer als 12.000, würfelt der Bot einen Min-Preis: 0-3.000 (unter 20.000) bzw. 0-8.000 (Z. 28079-28082).
- **Pro Messung:** Zwischenspeicher leeren, Seite 1 suchen und bis zu 46 × 50 ms (= 2,3 s) warten (Z. 28261-28273). Zwischen zwei Messungen kommt noch 1 s dazu (Z. 28111, 28158).
- **Alter eines Angebots:** Der Bot nimmt die kürzeste Laufzeit (1 h, 3 h, 6 h, 12 h, 1 Tag oder 3 Tage), die größer als die Restzeit ist. Er rechnet: (Laufzeit − Rest)/60, abgerundet (Z. 28305-28339).

**Entscheidungsregeln** (Z. 28341-28410):

| Methode | Preis runter, wenn … | sonst |
|---|---|---|
| recommended (Standard) | ein Angebot mindestens 2 Minuten alt ist oder mehr als 15 Treffer | hoch |
| safe | wie oben, aber schon ab mehr als 2 Treffern | hoch |
| lazy | Gilt „weniger als 3 Angebote ab 30 Minuten und weniger als 10 Treffer“, geht es hoch (mit Deckel). Sonst runter, wenn ein Angebot ab 30 Minuten da ist oder mehr als 20 Treffer | hoch |

- Keine Treffer: immer hoch.
- **Ende:** Der nächste Preis wurde schon gemessen. Ergebnis ist der letzte Preis mit dem Urteil „hoch“ (Z. 28254-28259, 28166-28169).
- **Sprünge:** Gibt es einen schon gemessenen Nachbarpreis, nimmt der Bot die Mitte. Sonst springt er um einen Prozentsatz:
  - runter: 20 % (bis 5.500), sonst 10 %; bei 3-4 Messungen 25 %; bei mehr als 4 leeren 50 %;
  - hoch: 20 % / 10 %; bei 3-4 Messungen 50 %; bei mehr als 4 leeren 100 %.

  Bei der ersten Suche springt er direkt auf das billigste Angebot, das mindestens 2 Minuten alt ist (Z. 28462-28534).
- **Grenzen:** 200 bis 15 Mio. Über 14 Mio. gilt die Prüfung als fehlgeschlagen (Z. 28121-28127, 28210-28222).
- **Deckel (nur lazy):** Anker = billigster Preis eines Angebots ab 6 Minuten. Der Anker wird mit einem Faktor malgenommen: 1,6 (unter 1.000), 1,45 (unter 10.000), 1,3 (unter 50.000), 1,2 (unter 200.000), sonst 1,15 (Z. 28022-28035, 28418-28460).
- **Zuschlag:** fest ±50 % oder ±30 Stufen. Danach mindestens 200 und innerhalb der Preisspanne (Z. 28646-28658).
- **Chemie-Stile:** Jede Variante bekommt eine eigene, volle Prüfung. Das vervielfacht die Zahl der Suchen (Z. 29356-29368).
- Am Ende schickt der Bot alle Messwerte an `/api/calculate-price`. Die Antwort liest er nicht (Z. 28594-28615).
- Eine ältere Klick-Version (`ss`) wird zwar erzeugt, aber nie benutzt. Sie ist toter Code (Z. 27074-27579).

**Für unseren Bot:** Die Alters-Schätzung und die Regel „nur Angebote zählen, die schon ein paar Minuten alt sind“ sind gute Ideen. Aber: Jede Messung ist eine echte Suche. Also braucht es eine feste Obergrenze an Messungen und dieselben Pausen wie beim Snipen.

---

## 6. Alle Optionen

### 6.1 Manuelle Suche

| Name | Standard | Werte | Wirkung |
|---|---|---|---|
| searchMode | renderless (fest nach Login) | renderless / normal | ohne Klicks; „normal“ ist toter Code (Z. 3336, 56977) |
| speedMode | normal | safe / normal / turbo | Wartezeit, siehe 2.5 (Z. 3276) |
| minutes | 4 | 1-300 min | Laufzeit, danach Stopp (Z. 3269, 58788-58793) |
| autoPriceSteps | an | an / aus | Schritt-Zahlen aus der Server-Tabelle (Z. 3256, 29803-29809) |
| minPriceRangeSteps | 10 | ≥ 0 | Min-Sofortkauf +1 Stufe pro Suche, nach N+1 Suchen zurück (Z. 3257) |
| maxPriceRangeSteps | 0 | ≥ 0 | Max-Sofortkauf −1 Stufe pro Durchlauf (Z. 3258) |
| afterSuccessBid | sendToTransfersList | sendToTransfersList / list / leaveUnassigned | was nach dem Kauf passiert (Z. 3259) |
| listBuyNowPrice / listStartPrice | 0 / 0 | Münzen, mind. 200 | Verkaufspreis; Einstellen nur, wenn beide > 0 (Z. 3261-3262) |
| listingProfiles | leer | Liste {Spieler, Seltenheit, Chemie, Preis} | eigener Preis je Variante (Z. 3283) |
| useBreaks | aus | an / aus | Pausen (Z. 3263) |
| breaksAfterSearches | 45 (Server ersetzt) | 2-200 | Abstand der Pausen (Z. 3264) |
| breaksTime | 90 s | 2-600 s | Pausenlänge (Z. 3265) |
| longerBreaksAfterSearches | 4 | 2-8 | lange Pause nach N **Pausen** (Z. 3266) |
| longerBreaksTime | 240 s | 2-900 s | Länge der langen Pause (Z. 3267) |
| randomizeBreaks | 30 % | 0-100 % | Streuung (Z. 3268) |
| buyLimit | aus | an / aus | Stopp-Grenze an (Z. 3270) |
| stopAfterEvent | buy | buy / searches / minutes | Art der Grenze (Z. 3271) |
| stopAfter | 1 | ≥ 1 | Wert der Grenze, exakter Vergleich (Z. 3260, 58769-58774) |
| manualRowModes | alle „auto“ | auto / custom | Bei Laufzeit und Tempo ändert es nur die Anzeige. Bei Preisschritten, Stopp und Pausen schaltet es die Funktion (Z. 29964-29973) |
| sleepAfter / sleepBeforeSearchAgain | 20 / 2 | – | Einheit unklar, vermutlich toter Code (Z. 3273, 3275) |

### 6.2 App-Einstellungen

| Name | Standard | Werte | Wirkung |
|---|---|---|---|
| stopIfTooManyResults | 1 (ja) | 1 / 2 | mehr als 10 Treffer → Stopp. Wird nicht gespeichert (Z. 3298) |
| stopIfListingPriceIsOutOfPR | 1 | 1 / 2 | wirkt nur im toten Klick-Weg (Z. 3299, 58967-58982) |
| unlimited_unassigned | 0; beim Öffnen = Freischaltung | 0 / 1 | Grenze 99 statt 4, der Stapel wird lokal geleert (Z. 3300, 33531) |
| clear_sold_items | 0 | 0 / 1 | bei 100 Karten Verkaufte löschen (Z. 56989-56993) |
| recommended_live_filter_settings | an | an / aus | aus → die zwei Werte darunter gelten (Z. 3333) |
| live_filter_minimum_profit | 300 | Münzen | Mindestgewinn Live-Filter (Z. 3334) |
| live_filter_speed_mode | turbo | safe / normal / turbo | Tempo Live-Filter (Z. 3335, 1843-1848) |
| notification_sound / finish_session_sound | 0 / 0 | 0 / 1 | Ton bei Kauf bzw. Ende (Z. 1937-1949) |
| show_precheck_popup | 1 | 0 / 1 | Vorab-Fenster (Z. 56956-57007) |
| budgetFilter | all | all / low / medium / high | nur Anzeige der Live-Liste (Z. 3363) |

### 6.3 Vorab-Prüfung und Preis

| Name | Standard | Werte | Wirkung |
|---|---|---|---|
| autoStartMethod | recommended | safe / recommended / lazy / dynamic | Regel des Preisprüfers. lazy ist auf dem PC ausgeblendet (Z. 29403, 45628) |
| autoPriceMinimumProfit | 300 | Münzen | Mindestgewinn (Z. 29404) |
| minProfitUnit | auto | auto / percent / coins | % = 8 % Standard (1-50), Münzen mind. 50 (Z. 45174-45209) |
| autoPriceCheck / autoStart | an / an | an / aus | Preis prüfen und direkt starten (Z. 29407-29408) |
| priceOffsetType / Value | none / 0 | fix ±50 %, steps ±30 | Zuschlag auf den Verkaufspreis (Z. 29409-29410) |
| chemistryStyleOption | dynamic | no / dynamic / only_chemistry_style | welche Varianten geprüft werden (Z. 45006-45007) |

### 6.4 Auto Trading

| Name | Standard | Werte | Wirkung |
|---|---|---|---|
| mode | live_preset | live_preset / custom | Server-Rotation oder eigene Filter (Z. 3366) |
| minutes | 60 | 5-300 | Laufzeit, legt die Pausen-Stufe fest (Z. 41930) |
| max_coins_to_trade | ganzes Guthaben | 0 bis Guthaben, Schritt 50 | Budget (Z. 41937) |
| max_price | Guthaben, abgerundet | 250/350/650 bis Guthaben | Kartenpreis-Grenze, geht an den Server (Z. 41935) |
| min_price | 1.200 | Zahl | geht an den Server (Z. 41936) |
| speed_mode | normal | safe / normal / turbo | Tempo in der Suche (Z. 41938) |
| auto_breaks | an | an / aus | Pausen-Stufe automatisch (Z. 41939) |
| max_searches_per_filter | 50 | 1-200 | geht an den Server; Wirkung im Client unklar (Z. 41940) |
| max_purchase_per_filter | 5 | 1-30 | Käufe pro Filter (Z. 41941) |
| max_transaction_per_filter | 10 | 1-30 | Gebote pro Filter (Z. 41942) |
| break_time_between_filters | 300 s | 60-600 s | geht an den Server (Z. 41943) |
| longer_breaks_after_sessions / longer_break_time | 4 / 400 s | 2-8 / 60-900 s | geht an den Server (Z. 41944-41945) |
| randomize_breaks | 20 % | 0-100 % | Streuung (Z. 41946) |
| auto_minimum_profit / minimum_profit / unit | an / 8 / percent | % 1-50 oder Münzen ab 50 | Mindestgewinn (Z. 41948-41950) |
| auto_price_method | safe (Zeile „Auto“ = recommended) | safe / recommended / lazy | Preisprüf-Regel (Z. 41927, 40810-40813) |
| auto_price_offset | an | fix / steps | Zuschlag nur, wenn aus (Z. 41951-41953) |
| min/max_filter_score | 0 / 10 | 0-10 | geht an den Server (Z. 41954-41955) |
| badges | alle „include“ | include / exclude | Schilder-Filter (Z. 41956-41961) |
| chem_style_pricing | no | no / dynamic / only | Chemie-Varianten (Z. 41962) |
| autoTradeBreakSec | 35 | Sekunden | Pause zwischen Filtern, der Server kann sie ändern (Z. 3305, 42222) |

### 6.5 Auto-Bieten

| Name | Standard | Werte | Wirkung |
|---|---|---|---|
| max_bid_value | 0 (Start nur, wenn > 0) | EA-Stufen | wird voll geboten (Z. 47339) |
| max_bid_per_session | 5 | 1-15 | Gebote pro Runde (Z. 47341) |
| number_of_sessions | 2 | 1-10 | Anzahl Runden (Z. 47342) |
| break_between_sessions | zufällig 60-75 s | 30-360 s | Pause zwischen Runden (Z. 47343) |
| max_auction_remaining_time | 5 min | 1-60 min | nur Auktionen, die bald enden (Z. 47344) |

---

## 7. Sicherheit

### 7.1 Sicherheitsassistent (Vorab-Prüfung)

- Er schickt die Einstellungen an `POST /api/pre-check` und zeigt nur an, was zurückkommt (Z. 44150-44165). Er zeigt:
  - Warnungen in 3 Stufen: danger = rot, med/normal = gelb;
  - die Schätzung „~N Suchen“;
  - Suchen und Gebote der letzten 1 h, 3 h und 24 h (Z. 45146-45490).
- **Im Browser gibt es keine eigenen Grenzwerte.** Alle Regeln liegen auf dem Server. Kontoalter und „Usage Sharing“ prüft der Browser-Code nicht. Die Felder für „Usage Sharing“ gibt es zwar, sie werden aber nie benutzt (Z. 3311, 3346, 3353).
- **Schwäche:** Schlägt die Prüfung fehl, zeigt das Fenster „keine Warnungen“ (Z. 44167-44168, 45343-45346).
- Beim Auto Trading überschreibt diese Prüfung die Auto-Trade-Warnungen. Sie schickt dabei die Einstellungen der **manuellen** Suche (Z. 44159-44160, 45246-45248).
- Die Risiko-Anzeige hängt nur von der Preis-Methode ab: safe = niedrig, recommended = mittel, lazy = hoch (Z. 45159-45164).
- Die Warnungstexte fügt der Code ungeprüft als HTML ein (Z. 45420).

### 7.2 Limits

- Mehr als 10 Treffer → Stopp (Z. 58438-58452).
- Nicht zugewiesen: mehr als 4 (bzw. 99) → Stopp (Z. 58493-58502).
- Transferliste: 100 → aufräumen oder Stopp (Z. 58527-58557).
- Münzen unter dem Max-Preis → Stopp (Z. 58504-58525).
- Abo-Tageslimit → Stopp (Z. 58559-58571).
- Laufzeit im Standard 4 min (Z. 3269).
- Auto Trading: 5 Käufe oder 10 Gebote pro Filter (Z. 42734-42743).
- Auto-Bieten: 2 Gebote pro Suche, 5 pro Runde, 2 Runden, höchstens 4 Seiten (Z. 46469-46647).

### 7.3 Pausen und Tempo

Siehe 2.5 und 2.6. Alle Zeiten sind zufällig, einen festen Takt gibt es nicht. Beim Auto Trading gibt es **innerhalb** eines Filters keine Pausen. Zwischen den Filtern wartet der Bot 35 s (Z. 42257, 42222).

### 7.4 Fehlercodes

| Fall | Reaktion | Zeilen |
|---|---|---|
| Suchantwort ≠ 200 | sofort Stopp, kein neuer Versuch, Ton, Meldung an FST mit dem ganzen EA-Antworttext | Z. 59455-59473 |
| 429 bei der Suche | zusätzlich das Soft-Ban-Fenster (der Knopf schließt nur) | Z. 59467, 57205-57218 |
| Captcha bei der Suche | Captcha-Fenster; der Knopf lädt die Seite neu, kein automatisches Lösen | Z. 59467-59468, 57292-57312 |
| Kein Netz, keine Antwort | **kein** Stopp, die Schleife läuft weiter | Z. 58382, 58330 |
| Kauf ≠ 200 (z. B. 461) | zählt als Fehlkauf; die Suche läuft weiter | Z. 59584-59619 |
| 473 beim Kauf | Stopp, Code 5005 („nicht zugewiesen voll“) | Z. 59553-59568 |
| 426, 458, 461, 471, 512, 521 | **keine eigene Regel** | Grep: nur 473 und 429 |
| Fehler im Preisprüfer | Codes 101-104 an FST | Z. 28150-28193 |

- Der Zahlenwert von `UtasErrorCode.CAPTCHA_REQUIRED` steht nicht im Code. Es ist eine EA-Konstante.
- **FST-Fehler:** Die Hilfsfunktion für Suchfehler liest `this.status` statt `e.status`. Bei jedem Fehler außer 429 stürzt sie ab (Z. 1972-1978, 46687). Das trifft vor allem das Auto-Bieten.
- Beim Auto-Bieten stoppen gescheiterte Gebote nichts, auch nicht bei 429 (Z. 46596-46597).

### 7.5 Weitere Wächter

- Tab unsichtbar → Stopp 5001 (Z. 57051-57057).
- EA-Suchseite verlassen → Stopp 5002 (Z. 59112-59131).
- Not-Aus mit Strg+Umschalt+P (Z. 59416-59418).
- Der Server kann den Bot aus der Ferne stoppen: 422 oder 403 bei den Zwischenständen (Z. 59373-59388) und 422 bei der Filter-Anfrage im Auto Trading (Z. 42362-42366).
- Der Server senkt die Wertung, wenn ein Filter zu oft hintereinander genutzt wird (Abkühlung, Z. 35504-35656).

**Für unseren Bot:** Unsere wachsende Sperre (1 → 6 → 24 Std.) bei 426/429/461 ist strenger als FST. Das sollten wir so behalten. FST sucht nach einem 461 beim Kauf einfach weiter.

---

## 8. Server-Anbindung

**Grundlage:**

- Adresse: `https://api.dashboard.futsimpletrader.com` (Z. 61645-61651).
- Die meisten Aufrufe schicken `Authorization: Bearer <FST_token>`, `app-version: 2.2.6` und `app-type: extension` (Z. 3908-3913, 3377-3378).
- **Korrektur:** `/api/bids` und `/api/auctions` laufen über einen anderen Weg (`fetch`). Sie schicken Token und Sprache mit, aber keine Version (Z. 1367-1373, 1980-2000).
- Auch die URL-Muster, an denen FST die EA-Anfragen erkennt, kommen vom Server (`web_app_data`) (Z. 59420-59424).

| Endpunkt | Wann | Was hingeht | Was zurückkommt | Zeilen |
|---|---|---|---|---|
| POST /api/login | Anmeldung | E-Mail, Passwort, **EA-Konto-ID** | Token | Z. 19134-19146 |
| POST /api/check-token | beim Start | EA-Konto-ID, Handelsrecht, Plattform, Münzen, Version, **Vereinsdaten** (Name, Club, Siege/Niederlagen, Kader-IDs), EA-Version | Nutzer, Abo, Server-Einstellungen, App-Einstellungen, Sprachen | Z. 56890-57032, 59427-59453 |
| GET /api/filters | Filter-Seite | Münzstand | Live-, eigene und Vorlagen-Filter, Marktaktivität | Z. 4099-4114 |
| POST /api/start-search-session | vor jeder Suche | Einstellungen, Suchfilter, Plattform | Sitzungs-ID, Tageswerte, Preisspannen, Marktaktivität | Z. 29878-29896 |
| POST /api/update-search-session | alle 10 Suchen | Zähler, Filter-ID, mitgelesene EA-Preisgrenzen | Marktaktivität; 422/403 = Stopp | Z. 59347-59390 |
| POST /api/close-search-session | am Ende | Zähler, Ø Netzzeit, Preisspannen | – | Z. 57117-57146 |
| POST /api/search-error | jeder Stopp und jeder Suchfehler | Code, Sitzungs-ID, **ganzer EA-Antworttext** | – | Z. 1572-1583 |
| POST /api/auctions | Suche mit Treffern (erste Auktion); Auto-Bieten vor jedem Gebot; SBC vor jedem Kauf | Kartendaten, tradeId, Sofortkaufpreis | – | Z. 59479-59487, 46505-46530, 53076-53100 |
| POST /api/bids | Suche: jeder Kauf, auch gescheitert; Auto-Bieten: nur angenommene Gebote | URL, Erfolg, Auktion, **Endguthaben**, Zähler, Dauer | – | Z. 59526-59551, 59600-59618, 46554-46586 |
| POST /api/calculate-price | Ende der Preisprüfung | alle Messwerte, Suchfilter | nicht gelesen | Z. 28594-28615 |
| /api/auto-trades (pre-check, Start, filter, close, rotation-preview) | Auto Trading | alle Einstellungen, Budget, voriger Filter | Filter, Wartezeit, Vorschau | Z. 42170-42215, 39898-39909 |
| POST /api/pre-check | Vorab-Fenster | Einstellungen, Suchfilter, Plattform | Warnungen, Aktivität | Z. 44157-44165 |
| POST /api/auto-bid, /api/update-success-bids | Auto-Bieten | Einstellungen, gewonnen/überboten | auto_bid_id | Z. 47401-47407, 46382-46407 |
| POST /api/extension-errors | JS-Fehler, nur wenn der Server es einschaltet | Fehlertext, Stack | – | Z. 61656-61675 |
| /api/update-app-settings, accept-terms, reject-terms | Einstellungen | 7 App-Werte bzw. Freischaltung | – | Z. 2534-2551, 33286-33295 |
| /api/filter-groups, /auto-trade-presets, /user-break-settings, /filters/delete | Verwaltung | Namen, Filter, Werte | Listen | Z. 3927-4375, 29010-29263 |
| /api/players/search, /api/rarities, /api/cheapest-by-rating-filters | Suche, Seltenheiten, Empfehlungen | Suchtext / Wertung | Listen | Z. 26262, 26607, 4403 |
| /api/sbc-* | SBC-Löser | Bedingungen, Zählungen, Preise, jede SBC-Abgabe | Lösungen | Z. 48776-49121, 2712-2743 |
| GET /api/user/metrics | Startseite | – | Tagesstatistik | Z. 55576-55582 |
| CDN d2d8blejdtap6f.cloudfront.net | Sprache, Töne | ohne Kopfzeilen | Texte, mp3 | Z. 3195-3205, 3373-3376 |

**Für unseren Bot:** Nichts davon übernehmen. Alles bleibt lokal. Die FST-Server dürfen laut Erlaubnis nicht genutzt werden.

---

## 9. Design

**Farben:**

- Grundfläche `#141B24` (style.css Z. 119).
- **Korrektur:** Der Kopfbereich hat keine eigene Farbe. Er liegt auf `#141B24`. Die Regel mit `#1F2834` greift dort nicht. `#1F2834` kommt bei Rahmen, Eingabefeldern und im Login-Feld vor (style.css Z. 1489-1493, 4022-4025, 4745).
- Akzent Cyan `#00CAF6` mit `--accent`, `--accent-soft rgba(0,202,246,.14)` und `--accent-line rgba(0,202,246,.5)`. Das sind die einzigen Farb-Variablen. Oft steht die Farbe zusätzlich fest im Code (style.css Z. 3988-3997, 81, 1483).
- Kacheln: Verlauf `#1a222e → #18202c`, Rand `rgba(255,255,255,.06)` (style.css Z. 4777-4790).
- Sperrschicht: `rgba(20,27,36,.87)`. Abdunklung der EA-Seite: `rgba(12,15,20,.7)` (style.css Z. 587-626, 632-754).
- Tacho: Rot `#EA3943` → Orange `#EA8C00` → Gelb `#F3D42F` → Hellgrün `#93D900` → Grün `#16C784`, Grundspur `#222c38` (Z. 20422-20510).
- Münze: Gold `#FADB75 → #CCAE55` (Z. 20309-20334).
- Logo-Farben: Grün `rgb(7,244,104)` und Orange `rgb(255,93,11)`. Das ist die FST-Marke, **nicht übernehmen** (Z. 20224-20308).

**Schrift:** Roboto, Arial, sans-serif. Größe 0,875 rem, Zeilenhöhe 1,5 (style.css Z. 51-59). Kleine Beschriftungen stehen in Großbuchstaben, grau.

**Aufbau der Leiste:**

- Rechts, 415 px breit. Die EA-Seite bekommt rechts 415 px Abstand, eingeklappt 3 rem. Bei ≤ 1.580 px ist die Leiste 320 px breit, bei ≤ 1.400 px 280 px (style.css Z. 13-24, 3163-3169, 3198-3308).
- Auf dem Handy: ganze Breite, fährt von unten hoch, Öffnen über einen runden Knopf (style.css Z. 7298-7355).
- **Kopf** (Z. 20919-20961):
  - Logo (ein Klick führt zur Startseite);
  - Profil-Menü mit Dashboard, Einstellungen, Discord und Abmelden;
  - optional ein Server-Hinweis (als HTML);
  - Mini-Dashboard mit 4 Kacheln: Münzen, Meine Vorlagen, Markt, Hilfe (Z. 20906-20918).
- **Reiter:** Live-Filter, Manuell, Auto, Bieter (Z. 28730-28963).
- **Manueller Assistent** in 3 Schritten: Karte → nach dem Kauf → Feintuning. Jede Zeile hat „Auto/Custom“ (Z. 25486-25846, 26359-26448).
- **Popups:** alle als Blatt von unten. Esc oder ein Klick daneben schließt (Z. 19274-19391).
- **Löschen:** Die Rückfrage steht in der Zeile und verschwindet nach 3,5 s von selbst (Z. 22048-22056).
- **Während der Bot läuft:** Die Leiste ist gesperrt. Über der EA-Seite liegt eine Fortschrittskarte (Z. 57695-57706, 57334-57694).

---

## 10. SBC-Löser (kurz)

- Nur mit dem Premium-Recht `sbc_solution`. Die Sperre gibt es nur im Browser (Z. 48731-48735, 51607-51613).
- **Weg „Schnell“:** Der Bot baut Filter aus den Aufgaben-Bedingungen (Z. 50886-51387). Er nimmt zuerst Spieler aus dem SBC-Lager, dann aus dem Verein. Die niedrigste Wertung kommt zuerst. Er sucht bis 50 Seiten, mit 650 ms Pause pro Seite (Z. 49588-50103). Ausgenommen sind Akademie, Sperrliste und Stammelf (Standard an). Was fehlt, wird ein Platzhalter oder ein Kauf-Filter.
- **Ziel-Teamwertung:** Die rechnet der FST-Server (`generate-sbc-solutions-2`). Der Bot schickt Zählungen „Wertung → Anzahl“ und die Einstellungen (Z. 49094-49121).
- **Weg „Fertige Lösung“:** Die Lösungen kommen vom Server. Der Bot wählt die billigste (Preis minus eigene Spieler) oder die mit den meisten eigenen Spielern (Z. 48815-48936).
- **Preisprüfung:**
  - Ein Preis gilt, wenn mehr als 3 Angebote schon mindestens 1 Minute alt sind.
  - Höchstens 16 Suchen, Obergrenze 150.000 (Z. 53573-53668).
  - Pause 1.520-2.120 ms pro Suche, 2.311-3.351 ms zwischen den Karten.
  - Startpreis: Spezialkarte 1.000, Gold 350, Silber/Bronze 200 (Z. 53523-53540).
- **Kaufen** (nur per Klick, nur mit frischen Preisen: grün unter 6 min, gelb unter 16 min):
  - Bis 10 Suchen pro Karte. Leeres Ergebnis: Max-Preis +1 Stufe, **ohne Pause** weiter.
  - Nach einem Fehlversuch 2.100-3.500 ms warten. Ab 6 Fehlversuchen Abbruch.
  - Nach dem Kauf 1.200-1.350 ms warten, dann in den Verein verschieben.
  - Zwischen den Karten 3.100-4.600 ms (Z. 53200-53521).
- 429 oder Captcha **beim Kauf** stoppen sofort. Bei der **Suche** erscheint kein Warnfenster (Z. 53134-53167, 2084-2090).
- Jede SBC-Abgabe wird an FST gemeldet (Z. 2712-2743).

---

## 11. Offene und unsichere Punkte

### 11.1 Steht nicht im Code (liegt auf dem FST-Server)

- Wie Score, Budget-Stufe, Schilder, „For You“ und Abkühlung berechnet werden.
- Die Rotation im Auto Trading und die Server-Wartezeit `waitseconds`.
- Die Regeln der Warnungen vor dem Start (Grenzwerte, Kontoalter).
- Die Werte der Tabellen `presetBreaks`, `auto_price_range` und `web_app_data` (EA-URL-Muster).
- Die SBC-Lösungen und die Listen der billigsten Spieler.
- Der genaue Wortlaut der Oberfläche. Er kommt aus Sprachdateien vom CDN.

### 11.2 Unsicher

- Der Zahlenwert von `CAPTCHA_REQUIRED` (EA-Konstante).
- In welcher Reihenfolge EA die Treffer liefert. FST kauft immer den ersten.
- Wer das Auto Trading stoppt, wenn die Laufzeit abläuft (Z. 42606-42608).
- Ob jede Filter-Sitzung im Auto Trading nach der Filter-Laufzeit (Standard 4 min) endet.
- Wofür `max_searches_per_filter` genutzt wird. Im Client wird es nur beim Knopf „nächster Filter“ benutzt (Z. 57643-57657).
- Die Einheiten von `autoTradeBreakSec`: Standard 35, der Knopf setzt aber 60.000 (Z. 3305, 57647-57653).
- Ob EA Preise außerhalb des Rasters annimmt (z. B. 9.750).
- Ob EA künstliche Klicks erkennt. Die Klicks von FST sind nicht „echt“ (`isTrusted = false`) (Z. 1384-1387, 1589-1591).
- Ob EA mehrere Seltenheiten im Suchfilter wirklich auswertet (Z. 26624-26635).
- Ob `_clearSold` ohne echte Transferlisten-Ansicht sicher läuft (Z. 59212-59214).
- Ob die Oberfläche nie startet, wenn die EA-Antwort „usermassinfo“ vor dem Laden kommt (Z. 59453).
- Die Einheit von `sleepAfter`/`sleepBeforeSearchAgain` (vermutlich toter Code).
- Ob Filter-Gruppen im Auto Trading genutzt werden.
- Wie die Pausenwerte im Auto Trading am Ende gelten. Zwei Stellen setzen verschiedene Werte (Z. 41043, 42726-42733).

### 11.3 Fehler in FST (nicht nachbauen)

- „Wrong list price!“ stoppt, aber die Karte wird trotzdem eingestellt, weil ein `return` fehlt (Z. 58284-58288).
- Die Suchfehler-Hilfe liest `this.status` statt `e.status` und stürzt ab (Z. 1972-1978).
- `e.response.status` wird ohne Prüfung gelesen. Bei Netzfehlern bleibt der Bot hängen (Z. 42363, 42610, 59374).
- Die Gewinn-Anzeige nutzt den ungekappten Preis (Z. 59512-59515).
- Der Mindestgewinn wird als Münzen gespeichert, aber als Prozent geladen (Z. 45036-45038, 44950-44953).
- `useOnlyUntradeable` wirkt im SBC-Löser umgekehrt (Z. 48999-49001, 50977).
- Die Vereinsliste beim SBC überschreibt sich bei jeder Seite (Z. 2025).
- Bronze wird bei der Einstufung nie genutzt (Z. 53527).
- Der Doppelklick-Schutz beim Login wirkt nicht (Z. 19134, 19146).
- Server-Texte werden ungeprüft als HTML eingefügt (Z. 20950-20955, 24407-24417, 45420).
- `.catch(function(e){ e() })` ruft den Fehler wie eine Funktion auf (Z. 59218-59221).