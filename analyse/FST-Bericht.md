# FUT Simple Trader (FST 2.2.6): Gesamtbericht

Quelle: `C:\Users\oders\Documents\Sniping bot\build\assets\scripts.js` und `style.css`. Zeilenangaben stehen in Klammern (Z. …). Der Bericht fasst neun geprüfte Teilberichte zusammen. Aussagen, die der Prüfer als falsch bewertet hat, sind hier berichtigt.

## Kurz gesagt

- **FST ist fast nur Oberfläche plus eine einfache Schleife.** Die schlauen Teile liegen auf dem FST-Server. Dazu gehören die Live-Filter, ihre Wertung, die Filter-Rotation, die Warnregeln und die SBC-Lösungen.
- **Die Schleife läuft so:** Suche → ersten Treffer sofort zum Sofortkaufpreis kaufen → zufällig 2,5 bis 5 s warten → nächste Suche. Pro Suche verschiebt sich minBuy um eine Preisstufe, damit jede Anfrage anders aussieht.
- **Jede Such-Antwort außer 200 stoppt sofort.** Es gibt keinen neuen Versuch. Nur 429 (Soft-Ban) und Captcha haben ein eigenes Fenster. 461, 521, 426 und andere Codes haben keine eigene Behandlung.
- **Pausen sind ab Werk aus.** Die Standard-Laufzeit ist nur 4 Minuten.
- **FST schickt sehr viele Daten an seinen Server:** den ersten Treffer jeder Suche, jeden Kauf, Preisgrenzen, Club-Daten und jede abgegebene SBC.
- **Der FST-Code hat mehrere Fehler.** Die sollten wir nicht nachbauen (Liste in Abschnitt 11).

---

## 1. Aufbau

1. **Eine große Datei.** scripts.js hat 61.702 Zeilen und ist eine Vue-3-App. Fremder Bibliotheks-Code: Vue, axios 1.7.7 (Z. 60977), regenerator-runtime, hotkeys-js (Z. 18718-19035) sowie Buffer und base64 (Z. 4502-5632).
2. **Start.** Beim Laden legt FST Ersatz-Namen für EA-Klassen an (Q3, Z. 480-536, Aufruf Z. 61645). Dann stellt es axios auf den FST-Server ein, mit dem Token aus localStorage (Z. 61645-61651). Danach hängt es sich in jede Netzwerk-Anfrage der EA-App (Z. 59418-59624). Ein Zeitgeber prüft alle 100 ms, ob die EA-Seite fertig ist. Fertig heißt: `.ut-root-view` und `h1.title` sind da, die EA-Antwort `usermassinfo` ist angekommen und `readyState` ist "complete". Es gibt keine Zeitgrenze (Z. 61676-61700, 59427-59453). Erst dann baut `installUI` ein `div#app` rechts neben die EA-Seite (Z. 59009-59051).
3. **Ein globaler Speicher** (Modul 157, `oe.M`, Z. 3248-3387) hält alle Standardwerte, Zähler und Seiten-Schalter. Es gibt keinen Router. Welche Seite zu sehen ist, steht nur im Text `currentPage` (Z. 3325, 57716-57809).
4. **EA-Anbindung über Merkmale** (Modul 875, Z. 256-536). FST sucht EA-Objekte im Fenster nach ihren Eigenschaften, nicht nach festen Namen. Beispiele: ein Objekt mit `getRootViewController`, eine Klasse mit `_clearSold` oder mit `PRICE_TIERS`. Findet es nichts, sucht es 1 s lang nicht neu (Z. 299-308). Modul 14 erkennt den aktuellen EA-Bildschirm (Z. 577-757).
5. **Das Gehirn** ist die Klasse `nL`. Es gibt genau ein Objekt davon: `sL` (Z. 58244-59409). Es ruft EA-Dienste direkt auf (`services.Item.*`). Diesen Modus nennt FST "renderless". Er ist beim Login fest eingestellt (Z. 56977-56978, 57007-57008). Der alte Weg über Mausklicks ist toter Code.
6. **Der Netzwerk-Haken** liest jede EA-Antwort mit. Er zählt Käufe, stoppt bei Fehlern und meldet Daten an den FST-Server (Z. 59418-59624).
7. **Werkzeugkiste** (Modul 305, Z. 786-2779): Preisstufen, Zufall, EA-Suchmaske füllen, Navigation und Server-Meldungen.
8. **Zehn Hauptseiten** in einer gemeinsamen Hülle (AuthenticatedLayout, Z. 25162-25346): Startseite, Manuell (Search), Live-Filter (Filters), Auto-Trade, Auto-Bid, Einstellungen, SBC-Löser, SBC-Hub, Info und Filtergruppen.
9. **Speicher.** Es gibt nur zwei localStorage-Schlüssel: `FST_token` und `FST_locale`. Alles andere liegt im Arbeitsspeicher und ist nach dem Neuladen weg, oder es liegt auf dem FST-Server (Z. 3170, 3239, 3910, 19144).
10. **Der Server denkt mit.** Er liefert Live-Filter, Wertungen, Rotation, Warnungen vor dem Start, Pausen-Vorlagen, Preisstufen-Tabellen und sogar die URL-Teile, an denen der Netzwerk-Haken Suche und Kauf erkennt (Z. 56933, 59420-59423).

---

## 2. Das Gehirn: Such- und Kaufschleife

### 2.1 Vor dem Start (manuelle Suche)

1. Die Seite liest die 4 EA-Preisfelder in `sL.initSearchCriteria` ein. Das sind `.ut-number-input-control[2..5]`, also Min-Gebot, Max-Gebot, Min-Sofortkauf und Max-Sofortkauf (Z. 29797-29803; Auto-Trade: Z. 42625-42631).
2. **autoPriceSteps** ist ab Werk an (Z. 3256). Dann kommen `minPriceRangeSteps` und `maxPriceRangeSteps` aus der Server-Tabelle `traderSettings.auto_price_range`, passend zum Max-Sofortkauf (Z. 29803-29809, 42632-42637). Die Werte dieser Tabelle sind **unklar**.
3. **Prüfungen** in `k()` (Z. 29791-29907). FST startet nicht, wenn eines davon zutrifft:
   - Man ist nicht auf der EA-Suchseite (Z. 29793).
   - Der Startpreis ist größer als der Sofortkaufpreis (Z. 29812-29816).
   - Die unterste Max-Stufe liegt unter 200, oder die Min- und Max-Spanne überschneiden sich (Z. 29817-29827).
   - Mehr als 4 Karten liegen in "Nicht zugewiesen" (mit `unlimited_unassigned` mehr als 99). Das gilt immer (Z. 29836-29839).
   - **Nur im Modus "list":** Die Transferliste hat genau 100 Karten (Z. 29828). Oder Max-Sofortkauf ≥ round(Verkaufspreis × 0,95), auch für jedes Chemie-Profil (Z. 29840-29863).
   - Bei der Spielersuche ist kein Spieler gewählt. Dann fragt ein Fenster nach (Z. 29832-29835).
4. `POST /api/start-search-session` liefert Sitzungs-ID, Tageszähler, `price_ranges` und `market_activity` (Z. 29874-29895).
5. `sL.startBid()` (Z. 58796-58811) startet die Zeitgeber und setzt die Zähler auf 0. Ist `useBreaks` aus, gelten wieder die Standard-Pausenwerte. Mit `unlimited_unassigned` leert es die lokale Liste "Nicht zugewiesen". Dann `autoBidOn=true` und **sofort die erste Suche, ohne Anlaufpause**.

### 2.2 Eine Suche bauen (searchItem, searchOnMarket, Z. 58349-58385, 58454-58461)

- Die Zähler `currentRequestNumbers` und `numberOfSearch` steigen um 1.
- Das Suchobjekt ist das **echte EA-Objekt** der offenen Suchseite, keine Kopie (Z. 1405-1408, 389-392). Jede Änderung bleibt deshalb für die nächste Suche erhalten.
- **minBuy wandert:** Pro Suche steigt minBuy um eine Preisstufe (`ld`). Aus 0 wird 150, dann 200, 250 usw. Ist der Zähler größer als `minPriceRangeSteps`, springt minBuy zurück auf den Startwert und der Zähler auf 0 (Z. 58353-58357). Mit dem Code-Standard 10 dauert ein Durchlauf also **11 Suchen**. Schon die 1. Suche ist eine Stufe höher.
- **maxBuy wandert (nur wenn maxPriceRangeSteps > 0):** An jedem Rücksprung-Punkt sinkt maxBuy um eine Stufe. Nach N solchen Schritten steigt es um N Stufen wieder hoch (Z. 58357-58365). **FST-Fehler:** Hoch und runter nutzen verschiedene Stufen. Beispiel: 10.000 → 9.750 → 9.850. Der Startwert kommt nie zurück.
- **minBid wechselt zwischen 0 und 150,** aber nur wenn beide Zähler 0 sind (Z. 58366-58368). Bei `minPriceRangeSteps=0` wechselt es bei jeder Suche.
- **Preisstufe `ld`:** 0 ergibt 150. Unter 1.000: 50. Unter 10.000: 100. Unter 50.000: 250. Unter 100.000: 500. Sonst 1.000 (Z. 1546-1549).
- Der Markt-Zwischenspeicher wird geleert: `services.Item.clearTransferMarketCache()` (Z. 58368).
- **Schutz:** Ist maxBuy größer als der Start-Höchstpreis, folgt Stopp mit Meldung 5007 (Z. 58370-58374).
- Dann folgt `searchTransferMarket(Kriterien, 1)`. Es wird **immer nur Seite 1** abgefragt (Z. 58375).
- **Mehr als 10 Treffer** und `stopIfTooManyResults==1` (Standard): Stopp, Meldung 5006, Ton. Es wird **nichts** gekauft (Z. 58438-58452, 3298).

### 2.3 Kaufen (Z. 58270-58332, 58387-58409)

- Bei Treffern: `services.Item.bid(Treffer[0], Treffer[0]._auction.buyNowPrice)`. Es gibt **keine eigene Preisprüfung**. FST verlässt sich auf den maxBuy-Filter der Suche. Die Prüffunktion `buyNowPriceIsOK` wird nie aufgerufen (Z. 58852).
- `numberOfBids` zählt jeden Kaufversuch (Z. 58396). `numberOfSuccessBids` steigt erst, wenn der Netzwerk-Haken Status 200 auf die Kauf-URL sieht (Z. 59489-59495).
- **Ein fehlgeschlagener Kauf stoppt nicht.** FST sucht einfach weiter (Z. 58328-58330, 59584-59619). Nur Kauf-Fehler **473** stoppt (Z. 59553-59568).
- Kein Treffer oder Kauf gescheitert: sofort `searchAgain`, und dort wird gewartet.

### 2.4 Nach dem Kauf (Z. 58277-58327, 58411-58436)

| Modus | Ablauf |
|---|---|
| **list** (nur wenn listStartPrice > 0 **und** listBuyNowPrice > 0, Z. 58278-58280) | Preisgrenzen der Karte laden, falls sie fehlen (Z. 1649-1685). Verkaufspreis n = passendes Profil oder listBuyNowPrice (Z. 59392-59403). Liegt n über dem EA-Maximum: Ist Maximum × 0,95 < Kaufpreis, dann Stopp 5009 und kein Angebot. Sonst wird n auf das Maximum gesetzt (Z. 58288-58305). Dann **4100-6000 ms** warten. In listItem noch **600-925 ms**, dann anbieten mit Startpreis = iU(n − ld(n)), Sofortkauf = n und **Laufzeit 3600 s** (Z. 58306-58308, 58416-58418). Danach **3000-5000 ms** warten. Ist die Transferliste voll, bietet es still nicht an (Z. 58415). |
| **sendToTransfersList** (Standard) | **5000-6500 ms** warten, dann `services.Item.move(Karte, ItemPile.TRANSFER)` (Z. 58317-58324) |
| anderes | 5000-6500 ms warten. Die Karte bleibt in "Nicht zugewiesen" (Z. 58324-58327) |

### 2.5 Nächste Suche vorbereiten (searchAgain, Z. 58469-58763)

Die Prüfungen laufen in dieser Reihenfolge:

1. `autoBidOn` ist aus: Ende (Z. 58475-58481).
2. **Laufzeit oder Grenze erreicht:** Stopp mit Ton, aber ohne Meldung (Z. 58481-58491). Laufzeit-Standard: 4 Minuten. Such-, Kauf- und Minutenlimit gelten nur mit `buyLimit=true` (ab Werk aus). Der Vergleich ist exakt `===` (Z. 58765-58775).
3. **Nicht zugewiesen > 4** (bzw. > 99): Stopp 5005 (Z. 58493-58502).
4. **Münzen < Max-Sofortkauf:** Münzstand neu holen, noch einmal prüfen, dann Stopp 5004. Im Auto-Trade zählt das Budget statt der Münzen (Z. 58504-58525, 58465).
5. **Transferliste = 100** (nur bei list oder sendToTransfersList): Ist clear_sold_items an, räumt FST zuerst auf. Bleiben es 100, folgt Stopp 5003 (Z. 58527-58557). Mehr dazu in Abschnitt 5.
6. **Tageslimit des Abos** (daily_max_searches / daily_max_success_bids, nur wenn nicht null): Stopp 5008 (Z. 58559-58571).
7. **Alle 8 Suchen:** Prüfen, was verkauft ist (nur im Modus list, Z. 58573-58586).
8. **Alle 10 Suchen:** `POST /api/update-search-session` (Z. 58588-58589).
9. Pausen planen (Abschnitt 2.6).
10. **Wartezeit** je nach Tempo (Z. 58618-58625):

| Tempo | Grundzeit | Zuschlag | Chance auf Zuschlag |
|---|---|---|---|
| turbo | 2520-3111 ms | +120-420 ms | 51/101 ≈ 50,5 % |
| normal (Standard) | 3310-4010 ms | +100-600 ms | ≈ 50,5 % |
| safe | 3600-4990 ms | +900-1800 ms | 21/101 ≈ 20,8 % |

Alle Zufallszahlen sind ganze Zahlen, beide Grenzen eingeschlossen (Z. 1375-1377). Die Chance-Funktion ist `Rw(p) = p ≥ Zufall(0..100)` (Z. 1619-1621).

11. Gesamtwartezeit = Grundzeit + Zeit der Verkaufsprüfung (1300-1855 ms bei jeder 8. Suche) + Pause (Z. 58636). Die Uhr startet **erst nach allen Prüfungen**, also ab dem Ende der vorigen Aktion. Dann folgt per `setTimeout` die nächste Suche (Z. 58749-58755).

Grob gerechnet, ohne die Dauer der Suche selbst: turbo etwa 20 Suchen pro Minute, normal etwa 15-16, safe etwa 13. Mit 4 Minuten Standard-Laufzeit sind das also etwa 50-80 Suchen pro Lauf.

### 2.6 Pausen (Z. 58591-58617, 1951-1954)

- **Ab Werk aus** (`useBreaks: false`, Z. 3263). Im Auto-Trade werden sie pro Filter fest abgeschaltet (Z. 42257).
- Nächste kurze Pause = aktuelle Suchzahl + breaksAfterSearches ± randomizeBreaks %. Mit den Standardwerten sind das 32-58 Suchen.
- Dauer der kurzen Pause = max(3134 ms, breaksTime × 1000 ± 30 %). Das sind 63-117 s.
- Die lange Pause zählt **kurze Pausen, nicht Suchen:** nach 3-5 kurzen Pausen, Dauer 168-312 s. Sie **ersetzt** die kurze Pause in derselben Runde (Z. 58609-58617).
- Die Pause wird zur normalen Wartezeit addiert. Ein Countdown läuft jede Sekunde.
- Die Standards (45 / 90 s / 4 / 240 s / 30 %) ersetzt der Server beim Login durch `traderSettings.presetBreaks[1]`. Danach setzt FST **alle** Suchoptionen auf Standard zurück (Z. 56936-56954).

### 2.7 Weitere Stopps außerhalb von searchAgain

- **Tab wird unsichtbar:** Stopp mit alert_5001 (Z. 57051-57057, 57067-57068). appType ist in diesem Build fest "extension" (Z. 3377), der Stopp gilt also immer.
- **Man verlässt die 4 Such-Bildschirme** (Filter, Ergebnisse geteilt, Ergebnisse, Item-Details): Stopp und Meldung 5002 (Z. 59112-59131).
- **Strg+Umschalt+P** ist der Not-Aus (Z. 59416-59418).
- **Der Server stoppt:** Antwortet update-search-session mit 422 ("Futbin price restored") oder 403 ("session expired"), stoppt FST (Z. 59373-59388).

### 2.8 Toter Klick-Modus

Der Modus "normal" klickt Knöpfe auf der Seite. Er hat eigene Zeiten: 2000-2575 / 2500-3880 / 1550-1885 ms (Z. 58625-58630, 58637-58748, 58830-59000). Er wird nie benutzt, weil keine Stelle den Modus auf "normal" setzt.

**Merken für unseren Bot:** Die wechselnden Anfragen übernehmen (minBuy stufenweise, minBid 0/150, Cache leeren). Dabei immer vom Startwert aus rechnen, damit maxBuy nicht wegdriftet. Das Warte-Modell übernehmen: Grundzeit plus seltener Zuschlag, gemessen ab dem Ende der vorigen Aktion. Den Stopp bei mehr als 10 Treffern übernehmen. Unsere eigene Behandlung von 461, 521 und 426 behalten. Sie ist genauer als der Pauschal-Stopp von FST.

---

## 3. Live-Filter-System

**Kernaussage:** Die Live-Filter werden fast komplett **auf dem FST-Server** berechnet. Die Erweiterung holt sie nur ab und zeigt sie an.

### 3.1 Woher

- `GET /api/filters?coins=<Münzstand>` mit Bearer-Token, app-version und app-type (Z. 34888-34919, 4087-4134, 61650-61651).
- Aus der Antwort kommen `data.filters.quick_flip` (die Live-Filter), `user_filters`, `preset_filters` und `market_activity`.
- Felder eines Filters (Z. 34892-34910): id, filter_name, lowest_bin, score, raw_score, personal_adjustment, cooldown_meta.until_clear, is_featured, featured_reason, tags[{class, icon, text}], tooltip, filter_stat, budget, rating, rarity_name, auto_price_min_profit, filter_type, type, player_id, quality, rarity_id, position, chemistry, league, club, nation, play_style_id, rarities, min_buy_now, max_buy_now, highest_bin, minutes, speed_mode, buy_limit.

### 3.2 Wie oft

- Es gibt **keinen Zeitgeber** für die Liste.
- Beim Öffnen der Seite lädt FST die Liste (onMounted, Z. 34949-34951).
- Es gibt einen Knopf zum Aktualisieren, aber nur mit `has_live_filter_refresh` (Z. 35204-35229). Nach **jedem** Laden ist er 5 s gesperrt. Die Sperre wirkt nur über das Aussehen (Z. 34888-34891).
- **Berichtigt:** Die Liste lädt nicht direkt "nach jeder Suchrunde". Der Beobachter auf die Sitzungs-ID feuert beim **Start** einer neuen Sitzung (Z. 29875, 42640, 34941-34944). Nach einer Runde springt die Leiste über `returnToLiveFilters` zurück auf die Live-Filter-Seite. Die Seite wird neu aufgebaut und lädt dabei neu (Z. 57120-57121, 45108-45115).
- Weitere Ladestellen: beim Login (Z. 56917), bei "My presets" (Z. 25063), beim Speichern-Fenster (Z. 19900, 19932) und im MyPresetsTab (Z. 38429).
- Nur die Auto-Trade-Vorschau lädt alle 60 s (Z. 39936-39940).
- Nach jedem Laden zieht der Client 1 vom Gratis-Zähler ab, auch bei Premium (Z. 34908-34909). Bei 403 kommt die Meldung "Premium nötig", der Zähler wird 0 und die Seite wechselt zu "search" (Z. 34911-34915).

### 3.3 Wertung und Anzeige

- **Score:** eine Zahl vom Server, im Hilfe-Beispiel 8.7 auf einer Skala bis 9.9 (Z. 20581-20693). Wie der Server rechnet, ist **unklar**.
- **Hit/Success:** Das fertige Textfeld `filter_stat`, z. B. "4.9% / 60%". Das genaue Format steht nicht im Code. Tooltip: "Hit/Success rate (100 searches)". Gemeint sind Treffer pro 100 Suchen und die Erfolgsquote (Z. 34540-34547, 35469-35496, 36643-36667).
- **Abkühlung (Cooldown):** Bei `personal_adjustment < 0` zeigt FST den alten Score durchgestrichen neben dem gesenkten. Dazu kommen "Cooldown ↓ |Wert|", "Choose N more filters" und 5 Punkte. Gefüllt sind 5 − until_clear Punkte, und nur wenn until_clear ≠ 0 ist (Z. 35286-35290, 35345-35383, 35504-35656). **Unsicher:** Die Regel dahinter steht nicht im Code. Die Grenze "5 andere Filter" sieht man nur an der Zahl der Punkte.
- **"For You":** Der erste Filter mit `is_featured` wird automatisch gewählt (Z. 34903-34905). Der Grund `featured_reason` wird auf 4 Texte abgebildet: safety, low_competition, fresh_price, market_hot. Unbekannte Gründe ergeben leeren Text (Z. 34921-34929).
- **Abzeichen (tags):** Laut Hilfe-Legende gibt es Profit+ (double-up, grün), Undercut (bolt), Hot (fire), Open (circle-dot), Chem (lab, lila) und New (star) (Z. 20581-20693). Der Text kommt vom Server. "Nischen Preis" steht nirgends im Bundle. Es ist vermutlich ein Server-Text (**unklar**).
- **Budget-Stufen** (Gesamt, Niedrig, Mittel, Hoch): Sie sind nur ein Anzeige-Filter auf das Server-Feld `budget` (Z. 35110-35203, 35698-35704). Der Zähler "N filters available" zählt nur die sichtbaren. Die Wahl liegt in `prevSession.budgetFilter`, nur im Speicher (Z. 3363). Wo die Grenzen der Stufen liegen, steht **nicht im Code**.
- Alle deutschen Texte kommen als Sprachdatei von einem CDN (Z. 3195-3207).

### 3.4 "Filter laden" (Z. 34711-34762, 1732-1894)

1. FST springt falls nötig zum Transfermarkt und prüft bis zu 25 × 150 ms, ob die Suchseite da ist.
2. `ZG` füllt die EA-Suchmaske:
   - Klick auf EA-Reset und auf den Filter-Reiter [type].
   - min/max BIN kommen in die Felder 4/5 (bei 6 Feldern), sonst in 2/3.
   - Spieler, Qualität, Seltenheit, Position, Chemie und Liga setzt es per `setIndexById`.
   - **380 ms Pause vor dem Verein** (nur bei Spielersuche mit Verein), danach Nation, Icon-Eigenschaften und Seltenheiten.
3. Es übernimmt die Filter-Einstellungen: minutes, after_success_bid, speed_mode, highest_bin (als Verkaufspreis), buy_limit, stop_after, Preisstufen und Pausen. `filterId` wird nur bei quick_flip gesetzt.
4. Ist `recommended_live_filter_settings` aus, gilt `live_filter_speed_mode` (Standard turbo, Z. 1843-1848).
5. Mindestgewinn = `auto_price_min_profit`, sonst 300. Das gilt nur mit `useAutoMinimumProfit` (Standard an). Sonst gilt der letzte eigene Wert, wenn er über 0 liegt (Z. 34744-34754).
6. Dann öffnet sich die Vorprüfung (Typ quick_flip) und startet danach automatisch.

### 3.5 Marktanzeige

- Die Anzeige zeigt das Server-Objekt `market_activity` als Halbkreis. Wortwerte: bad = 13, average = 40, good = 70, excellent = 92. Ohne Daten gilt good. Zahlen werden auf 0-100 begrenzt (Z. 20443-20453). Reihenfolge: zuerst percentage, dann score, dann label (Z. 20535-20543).
- Neue Daten kommen mit /api/filters, beim Sitzungsstart (Z. 29895, 42660) und alle 10 Suchen über update-search-session, nur bei Status 200 (Z. 58588, 59371).
- Das Detailfenster zeigt: Score x/100, label, relative_pct, long_description, Konkurrenz (user_activity level/5), Effizienz (hit_rate_pct, success_rate_pct) und die nächste Spitzenzeit next_peak_at (Z. 37374-37542).
- Für Nutzer mit Filter-Grenze (Free/Pro) ist die Kachel gesperrt. Ein Klick öffnet die Upgrade-Seite (Z. 20545-20559, 1491-1497).

### 3.6 Empfohlene Filter "Cheapest by rating"

- Wertungen 82-90, im Vorlagen-Reiter 81-99.
- `GET /api/cheapest-by-rating-filters?platform&rating`.
- Pro Wertung zwischengespeichert, bis die Seite neu lädt. `force` wird nie übergeben.
- Erst 5 Einträge, dann "Load more" (Z. 4381-4435, 24317-24506).

---

## 4. Auto Trading

### 4.1 Zwei Modi

- **live_preset** (Standard, Z. 3366): Der Server wählt die Filter.
- **custom:** Eigene Filter-Plätze und 8 Einstellungs-Zeilen.
- Nutzer mit Filter-Grenze bekommen fest custom. Live ist dann gesperrt. Mit `auto_trade=false` ist die ganze Seite gesperrt (Z. 42751-42753, 42806-42840).

### 4.2 Start (Z. 42375-42427, 42585-42620)

1. "Go to summary" schickt `POST /api/auto-trades/pre-check`. Zurück kommen Statistiken für 1 h, 3 h und 24 h sowie Meldungen. FST speichert einen Schnappschuss der Einstellungen. Danach ruft das Vorprüf-Fenster noch `/api/pre-check` auf und überschreibt diese Daten (Z. 45246-45248).
2. Nach "Start": Suchoptionen zurücksetzen, `autoTradeOn=true`. Im Live-Modus kommt die Laufzeit aus dem Schnappschuss. Ohne Abzeichen (Badges) im Live-Modus gibt es einen Fehler und keinen Start (Z. 42596-42600).
3. `POST /api/auto-trades` liefert eine auto_trade_id. Dann läuft der Countdown `timeRemaining = 60 × minutes`. Budget = min(max_coins_to_trade, Münzen). Der erste Filter startet sofort (D(0)).

### 4.3 Rotation, ein Filter nach dem anderen (D(e), Z. 42197-42373)

1. e ms warten, mit Countdown.
2. Münzen neu holen und Budget neu rechnen: min(max_coins_to_trade − max(0, Start-Münzen − Münzen jetzt), Münzen jetzt) (Z. 1919-1923).
3. `GET /api/auto-trades/filter` mit auto_trade_id, **prev_filter_id**, coins=Budget und platform. **Die Auswahl macht allein der Server.** Der Satz "wir meiden überlaufene und kürzlich gejagte Karten" ist nur Oberflächen-Text (Z. 39851).
4. Die Antwort bringt den Filter und `waitseconds`. Daraus wird die Pause **nach** diesem Filter: waitseconds × 1000, sonst 35.000 ms (Z. 42222-42223, 42243-42244).
5. Kein Filter: Im Live-Modus steht "waitingForFilters" und FST versucht es nach **20 s** neu. Im Custom-Modus gibt es einen Fehler und Stopp. Bei **422** kommt die Meldung und Stopp. Andere Fehler: neuer Versuch nach **60 s** (Z. 42233-42235, 42362-42370).
6. Filter in die EA-Maske laden (ZG), **380 ms** warten. Pausen aus, Preisprüfung und Autostart an (Z. 42250-42257).
7. **Preisprüfung** für jeden Chemie-Stil-Teil (Abschnitt 5.3). Fehlt ein Preis, gibt es den Fehler "Error while checking prices".
8. Mindestgewinn u:
   - Auto: `filter.auto_price_min_profit`, sonst 300.
   - Prozent: floor(Verkaufspreis × 0,95 × p/100).
   - Münzen: fester Wert.
   - (Z. 42330-42339, 163-169)
9. **Max-Kaufpreis** = max(auf Preisstufe abrunden(Verkaufspreis × 0,95 − u), Untergrenze). Die Untergrenze ist 350 bei Gold ohne Seltenheit, 650 bei Gold mit genau Seltenheit 1, sonst 250. Der Wert kommt in die EA-Maske (Z. 42340-42342, 2553-2565).
10. Nach 200 ms startet die Suchsitzung: Preisfelder lesen, Preisstufen aus auto_price_range, renderless, Zähler auf 0, `start-search-session` mit auto_trade_id, dann `sL.startBid()` (Z. 42621-42671).

### 4.4 Wann ein Filter endet

- Nach **5 Käufen** (max_purchase_per_filter) oder **10 Kaufversuchen** (max_transaction_per_filter). Beides ist einstellbar von 1 bis 30. Dann `stopBid` (Z. 42734-42744).
- Außerdem bei jedem Stopp der Schleife aus Abschnitt 2 (Münzen, Transferliste, Nicht zugewiesen, Tageslimit, Tab, Suchseite).
- Springt `autoBidOn` auf false, folgt die Pause und der nächste Filter (Z. 42672-42676).
- Preisprüfung gescheitert: nächster Filter nach **10 s** (Z. 42696-42700).
- Knopf "Nächster Filter": setzt unter bestimmten Bedingungen (u. a. weniger als 21 Suchen) 60 s Pause (Z. 57646-57655).
- **Unsicher:** Wer die Sitzung bei Laufzeit 0 stoppt, steht nicht im Client. Vermutlich antwortet der Server dann mit 422. Auch eine Sperre nach `max_searches_per_filter` gibt es im Client nicht.

### 4.5 Live-Modus erzwingt Werte (berichtigt)

Die Funktion E() setzt feste Werte: live_filters, Chemie aus, Verkaufspreis "recommended", Tempo normal, Auto-Mindestgewinn, keine Limits, Auto-Pausen, Score 0-10 und alle Abzeichen. Eine Laufzeit außerhalb von 5-300 wird 60 (Z. 41993-42009).

**Aber:** E() wirkt nur, solange autoTradeOn aus ist. Also beim Öffnen der Seite (Z. 42753) und beim Moduswechsel (Z. 42826-42828). **Beim Start selbst tut E() nichts** (Z. 42589-42594). Die Einheit des Mindestgewinns wird nicht erzwungen.

### 4.6 Custom-Modus: 8 Zeilen mit Auto/Custom-Schalter

Der Schalterstand liegt getrennt in `rowModes` (Z. 3408-3422, 26380-26448).

| Zeile | Auto | Custom |
|---|---|---|
| Max-Budget | = Münzen | 0 bis Münzen, Schritt 50 |
| Max-Kartenpreis | Münzen auf Stufe abgerundet | Untergrenze bis Münzen |
| Laufzeit | 60 min | 5-300 min |
| Mindestgewinn | Serverwert/300 | % 1-50 (Standard 8) oder Münzen ≥ 50 (beim Wechsel 300) |
| Kauf-Grenzen | 5 / 10 | je 1-30 |
| Tempo | normal | safe/normal/turbo (turbo nur mit Abo) |
| Verkaufspreis | recommended, Chemie "no" | safe/recommended/lazy; Chemie no/dynamic/only_chemistry_style |
| Pausen | Server-Vorlage | 5 Regler |

- **Pausen (unsicher):** Das Start-Objekt hat 50 Suchen pro Filter, 300 s Pause, lange Pause nach 4 Filtern mit 400 s und 20 % Zufall (Z. 41940-41946). Beim Öffnen überschreibt FST das aber sofort mit der Server-Vorlage `presetBreaks[2]` (Z. 42753, 42429-42436). Je nach Laufzeit wählt es Vorlage 0, 1 oder 2 (unter 30 / 30-59 / ab 60 min, Z. 42556-42560). Regler: Suchen 1-200, Pause 60-600 s, lange Pause nach 2-8 Filtern, 60-900 s, Zufall 0-100 %.
- **Vorlagen:** `POST /api/auto-trade-presets {name, data}`. Der Auto/Custom-Stand wird nicht mitgespeichert. Beim Laden begrenzt FST Budget und Max-Preis auf die aktuellen Münzen und entfernt gelöschte Filter (Z. 42446-42545).
- **Stopp:** `autoTradeOn=false`, Zeitgeber löschen, `stopBid`, `POST /api/auto-trades/close` (Z. 42183-42195).

### 4.7 Nebenbei: Auto-Bieten (Z. 46306-46815, 47326-47735)

- Es nimmt nur Auktionen, die in weniger als X Minuten enden (Standard 5, Bereich 1-60). Das aktuelle Gebot muss unter dem eigenen Gebot liegen, der Sofortkaufpreis darüber (Z. 46449-46465).
- Es bietet **sofort genau** `max_bid_value`, nicht erst kurz vor Ablauf.
- Zeitplan: 1500 ms nach der Suche. **Höchstens 2 Gebote pro Seite**, dazwischen 3800-5500 ms. Vor der nächsten Suche 2500 ms. Es blättert bis Seite 4 (Z. 46447, 46469, 46606-46614, 46635).
- Standards: 5 Gebote pro Sitzung (1-15), 2 Sitzungen (1-10). Die Pause ist zufällig 60-75 s, wird aber **nur einmal** gewürfelt. Einstellbar sind 30-360 s (Z. 47339-47346).
- Vor dem Start muss gelten: Münzen ≥ Gebot × Gebote pro Sitzung (Z. 47392-47399).
- Nach jeder Sitzung räumt es die Beobachtungsliste auf, mit 1010 ms Pause davor und 1210 ms danach (Z. 46730-46810).

---

## 5. Verkaufen und Transferliste

### 5.1 Verkaufspreis

- `getListPrice` sucht zuerst ein passendes Profil: player_id = Karte, Seltenheit leer oder gleich, Chemie-Stil = playStyle. Sonst gilt `listBuyNowPrice` (Z. 59392-59403).
- Normalisieren (Jn): auf eine Stufe runden, mindestens 200. Startpreis = BIN − ld(BIN−1) (Z. 1593-1602).
- Beim eigentlichen Anbieten rechnet die Schleife anders: iU(n − ld(n)). An Stufengrenzen gibt das zwei kleine Stufen, z. B. 1.000 → 900 (Z. 58307-58308).
- Der Preis wird auf das EA-Maximum gekappt. Ist Maximum × 0,95 < Kaufpreis, folgt Stopp 5009 (Z. 58288-58305).
- Laufzeit des Angebots: immer 1 Stunde (3600 s).
- Die Einstellung "Stopp bei Listenpreis außerhalb der Spanne" wirkt praktisch **nie**. Sie gilt nur im toten Klick-Modus. Außerdem ist "Nein" der Text "2", und der zählt als wahr (Z. 33623-33626, 58967-58970).

### 5.2 Gewinn

- Steuer fest 5 %, Faktor 0,95 (Z. 160-161).
- Kauf-Protokoll: marginValue = parseInt(Verkaufspreis × 0,95) − Kaufpreis, nur im Modus list, sonst 0 (Z. 59512-59515).
- Anzeige: round(BIN × 0,95 − Max-Sofortkauf) (Z. 2684-2687, 57102-57107).

### 5.3 Verkaufspreis automatisch finden (Preis-Check, Klasse gs, Z. 28036-28663)

- **Start:** maxBuy, sonst 15.000.000, begrenzt durch die Preisspanne. Ist maxBuy über 12.000, setzt FST minBuy zufällig: 0-3.000 (bei maxBuy unter 20.000), sonst 0-8.000 (Z. 28079-28082). Der Zweck ist **unklar**.
- **Jeder Schritt:** Cache leeren, Seite 1 suchen, bis zu 46 × 50 ms (2,3 s) warten, Ergebnis aus `marketRepository.pages[0]` lesen, dann 1000 ms bis zum nächsten Schritt (Z. 28261-28279, 28111, 28158). **Jeder Schritt ist eine echte EA-Suche.**
- **Alter eines Angebots:** FST nimmt die nächstgrößere Laufzeit (1h/3h/6h/12h/1d/3d) minus Restzeit (Z. 28305-28339). Das ist nur geschätzt. Ein 3-h-Angebot mit 50 min Rest gilt als 10 Minuten alt.
- **Verfahren** (berichtigt):
  - recommended: Preis runter, wenn ein Angebot mindestens 2 volle Minuten alt ist oder es mehr als 15 Treffer gibt (Z. 28352-28358).
  - safe: wie recommended, aber schon ab mehr als 2 Treffern (Z. 28374-28380).
  - lazy: o = Zahl der Angebote, die 30 min oder älter sind. Ist o < 3 und gibt es weniger als 10 Treffer, geht der Preis hoch. Sonst geht er runter bei o > 0 oder mehr als 20 Treffern (Z. 28398-28408). Nur lazy hat eine Obergrenze. Anker = billigster Preis unter den Angeboten, die mindestens 6 min alt sind. Faktor 1,6 / 1,45 / 1,3 / 1,2 / 1,15 für unter 1.000 / 10.000 / 50.000 / 200.000 / darüber (Z. 28418-28460).
- **Sprünge:** Beim 1. Schritt direkt zum billigsten alten Angebot. Danach die Mitte zwischen geprüften Preisen, sonst feste Anteile: runter 0,1-0,5, hoch 0,1-1 (Z. 28462-28568).
- **Ende:** Ein Preis kommt zum zweiten Mal. Über 14 Mio gilt der Check als gescheitert (Z. 28121-28127). Das Ergebnis geht an `/api/calculate-price` (nur bei Spielern, höchstens 50 Preispunkte, Antwort unbenutzt, Z. 28594-28615).
- `getMinimumProfit` in gs wird **nie aufgerufen** (Z. 28570-28577).

### 5.4 Prüfen, was verkauft ist (Z. 58573-58586, 59252-59345)

- Alle 8 Suchen, nur im Modus list, und nur wenn eigene angebotene Karten noch keinen Status haben.
- Ablauf: 980-1270 ms warten, Transferliste neu laden, verkaufte als "sold" markieren. Bei Treffern Münzen neu laden. Die nächste Wartezeit wird um 1300-1855 ms länger.
- Die tradeId kommt aus der Angebots-Antwort und geht immer in den **letzten** Protokoll-Eintrag (Z. 59620-59622).

### 5.5 Transferliste voll (Z. 58527-58557, 59138-59250)

- Die Zahl 100 kommt aus dem lokalen EA-Speicher.
- Ist `clear_sold_items` an: 1100-1800 ms warten. Dann neu laden, verkaufte markieren und `UTTransferListViewController.prototype._clearSold()` aufrufen. Der Aufruf geht auf die Vorlage (Prototyp), nicht auf ein echtes Objekt. Ob das sicher klappt, ist **unklar**. Dann Münzen neu laden und 2500-3500 ms warten.
- Sind es immer noch 100: Stopp 5003. Der Stopp gilt **auch ohne** clear_sold_items.
- Es gibt **kein Wieder-Einstellen** abgelaufener Karten (Z. 59138-59345).
- Es gibt keine Zeitgrenze beim Laden der Liste. Die Fehlerzweige sind fehlerhaft (Z. 59218-59221, 59240-59242).

---

## 6. Alle Optionen

### Suche (`searchOptions`, Z. 3254-3296)

| Name | Standard | Werte | Wirkung |
|---|---|---|---|
| speedMode | normal | safe, normal, turbo (turbo nur mit Abo) | Wartezeit zwischen Suchen (2.5) |
| minutes | 4 | 1-300 min | Gesamtlaufzeit, dann Stopp mit Ton |
| buyLimit | false | an/aus | schaltet die Stopp-Grenze ein |
| stopAfterEvent | buy | buy, searches, minutes | worauf die Grenze zählt |
| stopAfter | 1 | ab 1 | Stopp nach N; genauer Vergleich (===) |
| autoPriceSteps | true | an/aus | Preisstufen aus der Server-Tabelle |
| minPriceRangeSteps | 10 | ab 0 | minBuy-Durchlauf (11 Suchen bei 10) |
| maxPriceRangeSteps | 0 | ab 0 | maxBuy-Wanderung |
| afterSuccessBid | sendToTransfersList | list, sendToTransfersList, leaveUnassigned | was nach dem Kauf passiert |
| listStartPrice / listBuyNowPrice | 0 / 0 | Münzen | beide > 0 nötig für "list" |
| listingProfiles | [] | Spieler, Seltenheit, Chemie, Preis | Preis je Chemie-Stil |
| autoPricingEnabled | false | auto/custom | automatischer Verkaufspreis |
| useBreaks | false | an/aus | Pausen |
| breaksAfterSearches | 45 | 2-200 | kurze Pause nach etwa N Suchen |
| breaksTime | 90 s | 2-600 | Länge der kurzen Pause |
| longerBreaksAfterSearches | 4 | 2-8 | lange Pause nach etwa N **Pausen** |
| longerBreaksTime | 240 s | 2-900 | Länge der langen Pause |
| randomizeBreaks | 30 % | 0-100 | Streuung von Zeitpunkt und Länge |
| sleepAfter / sleepBeforeSearchAgain | 20 / 2 | – | von der Schleife nicht gelesen |
| manualRowModes | alle "auto" | auto/custom | nur Anzeige |

### Einstellungen (`oe.M.settings`, nur im Speicher, nie gespeichert, Z. 3297-3301)

| Name | Standard | Werte | Wirkung |
|---|---|---|---|
| stopIfTooManyResults | 1 | "1" Ja / "2" Nein | mehr als 10 Treffer → Stopp 5006 |
| stopIfListingPriceIsOutOfPR | 1 | "1" / "2" | wirkt praktisch nie (5.1) |
| unlimited_unassigned | 0 | 0/1 | 0: Stopp ab mehr als 4; 1: ab mehr als 99, lokale Liste wird geleert |

### App-Einstellungen (`appSettings`, auf dem Server gespeichert, Z. 3333-3336, 33532-33563)

| Name | Standard | Werte | Wirkung |
|---|---|---|---|
| searchMode | renderless | fest | direkte EA-Aufrufe |
| clear_sold_items | 0 | 0/1 | verkaufte räumen bei 100 |
| recommended_live_filter_settings | true | an/aus | aus → eigener Mindestgewinn und Tempo für Live-Filter |
| live_filter_minimum_profit | 300 | Münzen | eigener Mindestgewinn |
| live_filter_speed_mode | turbo | safe/normal/turbo | eigenes Tempo |
| notification_sound / finish_session_sound | vom Server, sonst 0 | 0/1 | Töne (mp3 vom CDN) |
| show_precheck_popup | 1 | – | ohne Schalter |

Diese 7 Werte gehen erst beim Verlassen der Einstellungs-Seite mit einem einzigen POST raus, und nur wenn sich etwas geändert hat. Die Freischaltungen gehen sofort an accept-terms bzw. reject-terms (Z. 33490-33528).

### Vorprüfung (`Oc`, Z. 29402-29416; `prevSession`, Z. 3359-3367)

| Name | Standard | Werte | Wirkung |
|---|---|---|---|
| autoStartMethod | recommended | safe, recommended, lazy (nur Nicht-PC), dynamic | Verfahren des Preis-Checks |
| autoPriceMinimumProfit | 300 | Münzen | Mindestgewinn |
| useAutoMinimumProfit | true | an/aus | Filterwert statt eigenem Wert |
| minProfitUnit | auto | auto, percent (1-50, beim Wechsel 8), coins (≥ 50) | Einheit |
| autoPriceCheck / autoStart | true / true | an/aus | Preis prüfen, direkt starten |
| priceOffsetType / Value | none / 0 | fix ±50 %, steps ±30 | ohne Bedienelement, praktisch immer none |
| chemistryStyleOption | dynamic (wenn Chemie-Stile da sind) | no, dynamic, only_chemistry_style | ein Preis-Check je Stil |
| budgetFilter | all | all/low/medium/high | Live-Filter-Anzeige |
| autoTradeMode | live_preset | live_preset/custom | Auto-Trade-Modus |

### Auto-Trade (Z. 41926-41963)

| Name | Standard | Werte | Wirkung |
|---|---|---|---|
| minutes | 60 | 5-300 | Laufzeit |
| max_coins_to_trade | Münzen | 0 bis Münzen | Budget |
| max_price | Münzen abgerundet | Untergrenze bis Münzen | höchster Kartenpreis (an den Server) |
| min_price | 1200 | – | Untergrenze Preis |
| speed_mode | normal | safe/normal/turbo | Tempo |
| auto_price_method | safe im Objekt, "recommended" in der Auto-Zeile | safe/recommended/lazy | Preis-Check (möglicher FST-Fehler) |
| chem_style_pricing | no | no/dynamic/only_chemistry_style | Preise je Chemie-Stil |
| auto_minimum_profit / minimum_profit / Einheit | true / 8 / percent | – | Mindestgewinn |
| max_purchase_per_filter / max_transaction_per_filter | 5 / 10 | 1-30 | Filter-Ende |
| auto_breaks + 5 Pausenwerte | true; 50/300/4/400/20 (vom Server überschrieben) | siehe 4.6 | an den Server |
| min/max_filter_score | 0 / 10 | – | an den Server |
| badges | alle erlaubten | include/exclude | fakebin und chemstyle nur mit Recht |

### Auto-Bieten (Z. 47339-47346)

| Name | Standard | Werte |
|---|---|---|
| max_bid_value | 0 (muss gesetzt werden) | wird auf die Stufe abgerundet |
| max_bid_per_session | 5 | 1-15 |
| number_of_sessions | 2 | 1-10 |
| break_between_sessions | zufällig 60-75 s | 30-360 s |
| max_auction_remaining_time | 5 min | 1-60 |

### Vom Server gesteuert (nicht im Code sichtbar)

- `traderSettings`: presetBreaks, auto_price_range, web_app_data (URL-Teile), badges, ete (Fehlerberichte an/aus).
- `subscription_plan`: daily_max_searches, daily_max_success_bids, turbo_mode, auto_trade, edit_rarities, sbc_solution, free_live_filters_limit, has_live_filter_refresh, auto_trade_fakebin, top_notification_message.

---

## 7. Sicherheit

### 7.1 Der "Sicherheitsassistent" (Vorprüfung, Z. 44147-44194, 45238-45497)

- Er **rechnet im Browser nichts selbst.** Er schickt Sucheinstellungen, Suchkriterien und Plattform an `/api/pre-check` und zeigt die Antwort an.
- Die Antwort enthält: Warnungen mit Stufe (danger = rot, med und normal = gelb), eine Schätzung "~N searches" und Aktivitätszahlen für 1 h, 3 h und 24 h. "Bids" ist dabei bids + success_bids (Z. 45438-45488).
- Bei einem Fehler steht dort "~0 searches" (Z. 45430-45431).
- Die Start-Knöpfe prüfen die Warnungen **nicht**. Der Warntext wird als HTML ungeprüft eingesetzt (Z. 45420).
- Prüfungen zu Usage Sharing oder Kontoalter gibt es im Client **nicht**. Die Schalter dafür sind nur angelegt und werden nie benutzt (Z. 3346, 3353).

### 7.2 Grenzen

- Laufzeit 4 min (manuell) bzw. 60 min (Auto-Trade).
- Pro Filter 5 Käufe oder 10 Versuche.
- Tageslimits aus dem Abo.
- Nicht zugewiesen höchstens 4.
- Transferliste 100.
- Münzen müssen für den Max-Sofortkauf reichen.
- Mehr als 10 Treffer → Stopp.
- maxBuy nie über dem Startwert.

### 7.3 Eigene Meldecodes

| Code | Grund | Zeilen |
|---|---|---|
| 5001 | Tab unsichtbar | 57051-57057 |
| 5002 | Suchseite verlassen | 59112-59131 |
| 5003 | Transferliste voll | 58541-58557 |
| 5004 | zu wenig Münzen/Budget | 58504-58525 |
| 5005 | zu viele Nicht zugewiesene (auch Kauf-Fehler 473) | 58493-58502, 59553-59568 |
| 5006 | mehr als 10 Treffer | 58438-58452 |
| 5007 | maxBuy über Startwert | 58370-58374 |
| 5008 | Tageslimit des Abos | 58559-58571 |
| 5009 | Listenpreis über EA-Maximum und Verlust | 58289-58303 |
| 101-105 | Fehler im Preis-Check | 28150-28193 |

### 7.4 EA-Fehlercodes (Z. 59455-59473, 59553-59619)

- **Suche mit Status ≠ 200:** sofort Stopp, Auto-Trade-Stopp, Ton. Der Fehler geht an `/api/search-error`, mit vollem Antworttext. Es gibt **keinen neuen Versuch**. Der Fehlerzähler wird nie gelesen (Z. 58457, 59464).
- **429:** Soft-Ban-Fenster. Es schließt nur, ohne Wartezeit.
- **CAPTCHA_REQUIRED:** Captcha-Fenster. Sein Knopf lädt die Seite neu (Z. 57301). Der Zahlenwert dieser EA-Konstante steht nicht im Bundle.
- **Alle anderen** (auch 426, 458, 461, 471, 512, 521): nur die Meldung "Search failed, code: X", keine eigene Behandlung.
- **Kauf 473:** Stopp, alert_5005. Das wird nicht an /api/bids gemeldet.
- **Andere Kauf-Fehler:** kein Stopp. Sie landen im Protokoll und in der Meldung an den Server.
- Reiner Netzfehler ohne Antwort: Der Haken löst nicht aus (er hängt am load-Ereignis).
- **FST-Fehler:** Der allgemeine Fehlerhandler `hl` prüft `this.status` statt `e.status` (Z. 1972-1978, strict mode Z. 787). Bei allem außer 429 wirft er vermutlich selbst einen Fehler. Sein Captcha-Fenster und seine Meldung erscheinen dann nie. Betroffen ist z. B. der Auto-Bieter (Z. 46687).

### 7.5 Weitere Schutzmaßnahmen

- Während eines Laufs legt sich eine Abdunklung über die Leiste. Sie ist dann gesperrt (Z. 57695-57706).
- Not-Aus mit Strg+Umschalt+P. Stopp bei unsichtbarem Tab und beim Verlassen der Suchseiten.

**Merken für unseren Bot:** Den Assistenten lokal nachbauen, mit unseren eigenen Zählern (1 h / 3 h / 24 h) und unseren gemessenen Grenzen (521 bei etwa 450 Suchen/Tag, 426 bei 2 Käufen pro Sekunde, 461 → 60 Minuten Sperre). FST prüft solche Grenzen im Browser gar nicht.

---

## 8. Server-Anbindung

Basis: `https://api.dashboard.futsimpletrader.com`. Kopfzeilen: `Authorization: Bearer <FST_token>`, `app-version: 2.2.6`, `app-type: extension` (Z. 61645-61651, 3908-3913). Ohne Token steht dort wörtlich "Bearer null".

### Was an den Server geht (Auswahl)

| Endpunkt | Was geht hin | Zeilen |
|---|---|---|
| POST /api/login | E-Mail, Passwort, **EA-Konto-ID** (account_hash) | 19134-19146 |
| POST /api/check-token | EA-Konto-ID, Handels-Zugang, Plattform, Münzen, Version, **Club-Daten** (Name, Kürzel, Siege und Niederlagen, Zuverlässigkeit, Kader-IDs aus usermassinfo), EA-Version | 56890-56903, 59427-59453 |
| POST /api/start-/update-/close-search-session | Suchoptionen, Suchkriterien, Zähler, Filter-ID, **EA-Preisgrenzen**, mittlere Suchzeit (nur die ersten 10) | 29878-29889, 59347-59390, 57117-57146 |
| POST /api/auctions | **erster Treffer jeder Suche**, jede Auktion vor einem Gebot | 59474-59488, 1991-2000 |
| POST /api/bids | **jeder Kauf**, auch gescheiterte, mit Münzstand | 59526-59551, 59600-59618 |
| POST /api/search-error | jeder Stopp-Grund und jeder Suchfehler mit Antworttext | 1572-1583 |
| POST /api/calculate-price | alle Preispunkte des Preis-Checks | 28594-28615 |
| POST /api/sbc-solutions/community | **jede abgegebene SBC** (Spieler, Positionen, Anforderungen) | 2712-2750 |
| POST /api/sbc-solutions/update-prices | selbst geprüfte SBC-Preise | 53668-53676 |
| POST /api/extension-errors | JS-Fehler (nur wenn der Server "ete" gesetzt hat) | 61656-61675 |
| POST /api/pre-check, /api/auto-trades/pre-check | Einstellungen vor dem Start | 44157-44165, 42376-42413 |
| POST /api/auto-trades, GET …/filter, POST …/close | Auto-Trade-Start, nächster Filter, Ende | 42076-42215 |
| POST /api/auto-bid, /api/update-success-bids | Auto-Bieten, gewonnene und überbotene Gebote | 47401-47407, 46382-46407 |
| POST /api/update-app-settings, accept-terms, reject-terms | Einstellungen, Freischaltungen | 2534-2551, 26546-26555, 33286-33291 |

### Was zurückkommt

- **check-token:** neuer Token; Nutzer mit Abo (`subscription_plan`) und App-Einstellungen; `trader_settings` (Pausen-Vorlagen, Preisstufen-Tabelle, URL-Teile der EA-App, Abzeichen, ete); `contents` (ersetzt Oberflächen-Texte); Sprachen; Meldungen (Z. 56890-57032). Bei **jedem** Fehler meldet FST ab (Z. 57026-57045).
- **Filter und Listen:** /api/filters, /api/filter-groups (GET/POST/PUT/DELETE), /api/auto-trade-presets, /api/user-break-settings, /api/cheapest-by-rating-filters, /api/players/search, /api/rarities, /api/user/metrics, /api/auto-trades/rotation-preview.
- **SBC:** sbc-check-auto-solution, generate-sbc-solutions-2, sbc-solutions/{id}, sbc-exclude-players, sbc-cheapest-prices.
- **CDN** `d2d8blejdtap6f.cloudfront.net`: Sprachdateien und Töne. Die Kopfzeilen werden dort entfernt, der Token geht also nicht mit (Z. 3195-3205, 3373-3376).

### Fernsteuerung durch den Server

- Stopp über 422/403.
- Die URL-Teile, an denen der Haken Suche und Kauf erkennt, kommen vom Server (Z. 59420-59423).
- Der Server kann Texte ersetzen und beliebiges HTML in die Kopfzeile schreiben (`top_notification_message`, Z. 20950-20956).
- Premium-Sperren prüft der Browser. Ob der Server sie auch prüft, ist **unklar**.

---

## 9. Design

- **Leiste:** rechts neben der EA-Seite, 415 px breit. Die EA-Seite bekommt rechts 415 px Abstand, eingeklappt 3rem (style.css Z. 3163-3169). Kleinere Bildschirme: unter 1580 px 320 px breit, unter 1400 px 280 px, unter 1281 px wieder 320 px (merkwürdig). Auf dem Handy ist sie ein Vollbild (Z. 3198-3300, 7309-7330).
- **Farben:** Grundfläche **#141B24** (style.css Z. 119 u. a.). Einzige Akzentfarbe **#00CAF6** als `--accent`, dazu `--accent-soft` rgba(0,202,246,.14) und `--accent-line` rgba(0,202,246,.5) (Z. 3989-3996). Graue Beschriftungen #6B7383 / #8b94a4. Rote Tönung für Rückfragen rgba(234,57,67,.08). Abdunklung während eines Laufs rgba(20,27,36,.87).
- **Schrift:** Roboto, .875rem, auf kleineren Bildschirmen 85 % (Z. 51-59, 3207-3265). Beschriftungen sehr klein (.54-.64rem), in GROSSBUCHSTABEN, leicht gesperrt, halbfett. Zahlen mit fester Ziffernbreite (tabular-nums).
- **Kopfzeile:** Logo-Zeile (Klick → Startseite und EA-Startseite). Profilmenü mit Abo-Abzeichen Free/Pro/Premium sowie Dashboard, Settings, Discord und Logout. Optional ein Server-Banner. Dann das **Mini-Dashboard mit 4 Kacheln**: Münzen, Meine Vorlagen, Markt und Hilfe. Die Kacheln sind mindestens 64 px hoch, Abstand .4rem (Z. 20906-20961).
  - Die Münz-Kachel zeigt z. B. "1.2M" oder "850K". Ein Klick lädt neu, danach 600 ms Sperre (Z. 20335-20398).
  - Die Hilfe-Kachel blinkt 720 ms bei jedem Seitenwechsel (Z. 20839-20905).
- **Reiter:** Pillen-Gruppe Live Filters / Manuell / Auto / Auto-Bid. Die aktive ist weiß, gesperrte haben ein Schloss (Z. 28731-28963).
- **Manuelle Seite:** 3 nummerierte Schritte (Karte wählen, Nach dem Kauf, Feineinstellung). Jede Zeile hat einen Auto/Custom-Schalter. Zahlenfelder mit Plus und Minus. Unten Save/Load/Reset. Reset braucht einen zweiten Klick innerhalb von 3,5 s (Z. 25476-25846, 26380-26448).
- **Fenster** sind "Bottom Sheets", die in der Leiste von unten hochfahren: z-index 70, höchstens 94 % hoch, oben 1.15rem abgerundet, 0,25 s Animation. Escape oder ein Klick daneben schließt sie (Z. 19274-19391; style.css 5452-5550, 5940-5956).
- **Löschen** fragt direkt in der Zeile nach. Die Rückfrage verschwindet nach 3,5 s von selbst (Z. 22048-22056).
- **Marktanzeige:** Halbkreis mit Farbverlauf #EA3943 → #EA8C00 → #F3D42F → #93D900 → #16C784 (Z. 20422-20510).
- **Die Leiste folgt dem EA-Bildschirm:** Marktsuche → Live-Filter bzw. Manuell, SBC → SBC-Löser, alles andere → Startseite (Z. 19256-19273). Dabei werden Einstellungen und Info bei jedem Bildschirmwechsel überschrieben.
- Das Logo (grün #07F468 / orange #FF5D0B) dürfen wir **nicht** übernehmen (ERLAUBNIS-FST.md Z. 27).

---

## 10. SBC-Löser (kurz)

- **Nur mit Premium** (`subscription_plan.sbc_solution`, Z. 48731-48735).
- **Schnell ("Quick", Standard):**
  - FST liest die EA-Anforderungen und baut daraus Filter (Z. 50886-51389).
  - Reihenfolge beim Füllen: SBC-Lager, dann Club (schwächste Bewertung zuerst, 21 pro Seite, höchstens 50 Seiten, 650 ms Pause), der Rest kommt als "Karte kaufen" auf die Liste (Z. 49588-50679).
  - Ausgeschlossen werden: aktive Mannschaft, Leihen, Akademie, gesperrte Karten und Karten mit begrenzter Nutzung (Z. 2012-2057, 50832-50854).
  - Bei einer Ziel-Teambewertung rechnet der **Server** die Lösung aus (generate-sbc-solutions-2, Z. 49072-49586).
- **Vorlage ("Preset"):** fertige Server-Lösungen. "Günstigste" zieht den Wert eigener Karten ab, "Meiste aus Club" nimmt die Lösung mit den meisten eigenen Karten (Z. 48815-48936).
- **Preis prüfen:** bis zu 16 Suchen je Karte. Ein Preis gilt als echt, wenn mehr als 3 Angebote mindestens 1 Minute alt sind. Obergrenze 150.000. Pause 1520-2120 ms, zwischen Karten 2311-3351 ms (Z. 53573-53667).
- **Kaufen:** höchstens 10 Suchen und 6 Fehlkäufe je Karte. Bei leerem Ergebnis erhöht FST maxBuy um eine Stufe und sucht **ohne Pause** sofort neu. Das sollten wir nicht übernehmen. Gekauft wird das **teuerste** Angebot unter maxBuy. minBid wechselt nach jedem Fehlkauf zwischen 150 und 0. Pausen: 1200-1350 ms vor dem Verschieben in den Club, 2100-3500 ms nach einem Fehlkauf, 3100-4600 ms zwischen Karten (Z. 53196-53520).
- Bei 429 bzw. Captcha: Stopp mit Fenster. Bei zu wenig Münzen: 5004.

---

## 11. Offene und unsichere Punkte

### Rechtliches und Notizen

- Die Erlaubnis stammt aus einer Mail vom 22.09.2026, 17:32. Ihre **Echtheit ist nicht geprüft**, es gibt nur ein Bildschirmfoto (ERLAUBNIS-FST.md Z. 23-24).
- Name, Logo und Marke übernehmen wir nicht (Z. 27).
- Die **Nutzung des FST-Servers** (Live-Filter, Rotation) mit unserem Bot deckt die Erlaubnis nicht automatisch ab (Z. 28-29).
- Die Gedächtnis-Notiz `fut-simple-trader-lizenz.md` sagt noch "nicht analysieren". Sie sollte zur neuen Lage angepasst werden. Dieser Lauf durfte nichts ändern.
- Versionsnummer: Im Code steht 2.2.6 (Z. 3378). Eine frühere Notiz nennt 4.1.4. Welche davon die Manifest-Version ist, ist unklar.

### Nur auf dem Server, im Code nicht sichtbar

- Werte von auto_price_range, presetBreaks, badges und web_app_data.
- Die Formeln für Score, Abkühlung, Budget-Stufen, filter_stat und market_activity.
- Die Regeln der Vorprüfung, die Filter-Rotation und die SBC-Lösungen.
- Wie der Auto-Trade bei Laufzeit 0 endet. Wo max_searches_per_filter durchgesetzt wird.

### Sonst unklar

- Zahlenwert von CAPTCHA_REQUIRED.
- Einheit von autoTradeBreakSec: Standard 35 (Z. 3305), sonst Millisekunden (Z. 42243, 57649).
- Ob `_clearSold` auf dem Prototyp sicher funktioniert.
- Ob EA mehrere Seltenheiten in einer Suche annimmt.
- Ob das Club-Laden nur die letzte Seite behält (Z. 2025).
- Wann die EA-Seite 4 und wann 6 Preisfelder hat (Z. 61-67, 1764-1773).
- Aufbau der PRICE_TIERS. Fehlen sie, stürzt das Runden ab (Z. 1431-1443).
- Zweck des zufälligen minBuy im Preis-Check.

### FST-Fehler, die wir nicht nachbauen

1. "Wrong list price!": FST stoppt, bietet die Karte aber trotzdem mit Verlust an, weil das return fehlt (Z. 58284-58316).
2. maxBuy driftet an Stufengrenzen nach unten (Z. 58362-58364).
3. Fehlerhandler `hl` nutzt `this.status` (Z. 1974).
4. "Nein" = "2" gilt als wahr (Z. 33623-33626).
5. Qualität 0 (Bronze) wird nie gesetzt (Z. 1717-1720). SBC-Stufe Bronze wird nie erreicht (Z. 53526-53528).
6. SBC-Preiszeit wird NaN (Z. 53322-53326).
7. Login-Sperre ist nicht reaktiv, Doppel-Absenden ist möglich (Z. 19132-19194).
8. Mindestgewinn in %: Ein Münzwert wird als Prozent neu geladen (Z. 45037-45038, 44952).
9. Auto-Bieten stoppt nicht sofort. Fehlgeschlagene Gebote verbrauchen das Limit (Z. 46531, 46720-46728).
10. Auto-Trade: `e.response.status` wird ohne Prüfung gelesen (Z. 42363). Standard "safe" statt "recommended" (Z. 41927). presetName bleibt immer null (Z. 42384-42389).
11. Transferlisten-Abruf ohne Zeitgrenze, Fehlerzweige rufen das Fehlerobjekt als Funktion auf (Z. 59218-59242).
12. Server-HTML wird ungefiltert per innerHTML eingesetzt (Z. 20950-20956, 45420).