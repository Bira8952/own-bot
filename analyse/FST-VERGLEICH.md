# FST und unser Bot im Vergleich

**Kurz vorweg:** Ich habe nur gelesen und keine Datei geändert. FST ist in zwei Punkten klar vorn:

- **Suchweg:** FST sucht und kauft über die Funktionen der EA-App. Unser Bot schickt standardmäßig eigene Anfragen.
- **Live-Filter:** Die Filter kommen fertig vom FST-Server und kosten keine einzige EA-Suche.

Unser Bot ist beim Kontoschutz klar vorn. Er hat eine wachsende Sperre, feste Tageslimits, Pausen im Standard und prüft vor jedem Kauf selbst. Der größte Hebel für mehr Gewinn: den App-Suchweg testen. Erst wenn er sicher läuft, das Limit von 350 Suchen pro Tag vorsichtig anheben.

Unsere Dateien: `C:\Users\oders\Pictures\fc27-own-bot\content.js`, `popup.js`, `sniffer.js`.
FST-Datei: `C:\Users\oders\Documents\Sniping bot\build\assets\scripts.js`. „Z.“ ist dort die Zeilennummer.

---

## 1. Vergleichstabelle

| Bereich | FST | Unser Bot | Wer ist besser? |
|---|---|---|---|
| Weg zu EA | Über die EA-App (`services.Item.searchTransferMarket`, `.bid`). Nutzt die echte Suchmaske der EA-Suchseite. Stoppt, wenn die Suchseite verlassen wird. | Standard: eigene Anfragen mit `X-UT-SID`. Der App-Weg ist gebaut (`sniffer.js` `appSuche`/`appKauf`), aber **aus** und noch nicht live getestet. Er baut eine neue, leere Suchmaske. | FST |
| Tempo zwischen Suchen | normal 3,3–4,0 s (+0,1–0,6 s bei ca. 50 %), also etwa 12–15 Suchen pro Minute | normal 10–14 s, sicher 15–20 s, turbo 5–8 s, also etwa 4–5 Suchen pro Minute | FST schneller, unser Bot vorsichtiger |
| Pausen | Im Standard **aus**. Wenn an: alle 45 ± 30 % Suchen 90 s, lange Pause 240 s. Beim Auto Trading keine Pausen innerhalb eines Filters. | Im Standard **an**: alle 30–50 Suchen 30–60 s, nach 3–5 Pausen eine lange (etwa 2,5- bis 3,2-mal so lang) | Unser Bot |
| Laufzeit (Standard) | 4 Minuten, Auto Trading 60 Minuten | 300 Minuten. Das Stundenlimit stoppt aber nach etwa 33 Minuten. | FST (kurze Sitzungen) |
| Tages- und Stundenlimits | Nur das Tageslimit des Abos, vom Server | 150 pro Stunde, 350 pro Tag, 100 Kaufversuche pro Tag, 20 pro Karte und Tag | Unser Bot (sicherer), FST (mehr Umsatz) |
| Frische Antworten von EA | Zwischenspeicher leeren. Min-Sofortkauf wandert 11 Stufen, Min-Gebot wechselt 0/150. Etwa 22 Varianten. | Min-Sofortkauf im Wechsel 0/150/200/250, also 4 Varianten, `cache: no-store`. Der App-Weg leert den Zwischenspeicher. | FST |
| Kauf | Nur der **erste** Treffer. Keine eigene Preisprüfung (`buyNowPriceIsOK` wird nie aufgerufen). | Alle Treffer bis zum Zielpreis, 3–5 s Abstand, 180–350 ms Reaktionszeit, Budget und Limits vor jedem Kauf | Unser Bot (Prüfung), FST (weniger Kaufanfragen) |
| Zu viele Treffer | Mehr als 10 Treffer: Stopp **vor** dem Kauf | Erst nach 2 vollen Seiten wird der Spieler übersprungen. Vorher kauft der Bot schon. | FST |
| Nach dem Kauf | 5,0–6,5 s warten, dann auf die Transferliste oder gleich einstellen | 2–5 s warten, dann nach Wahl verschieben. Standard: liegen lassen. | FST |
| Fehler und Sperren | Jede Suchantwort ungleich 200: Stopp ohne Sperre. 461 beim Kauf: sucht weiter. Netzfehler: läuft weiter. | Harter Stopp und Sperre bei 426/429/458/461/512/521. Die Sperre wächst: 1 → 6 → 24 Std. Kauf ohne Antwort: Stopp. | Unser Bot |
| Tab-Schutz | Tab unsichtbar: Stopp. Suchseite verlassen: Stopp. Not-Aus mit Strg+Umschalt+P. | Nur ein Tab darf arbeiten. Warnt, wenn FST geladen ist. Warnt bei „Usage Sharing“. Kein Stopp bei unsichtbarem Tab. | Unentschieden |
| Vorab-Prüfungen | Transferliste 100, nicht zugewiesen > 4, Münzen < Max-Preis, kein Gewinn nach 5 % | Gewinn-Sperre, Limits und Warnungen. Münzen, Transferliste und „nicht zugewiesen“ werden nicht geprüft; erst EA meldet 470/473. | FST |
| Live-Filter | Vom Server: 0 EA-Suchen, Daten vieler Nutzer, Wertung, Abkühlung, „For You“ | Eigener Markt-Scan mit bis zu 16 Suchen, automatisch alle 7 Minuten, Wertung lokal und erklärt, 15 Minuten gültig | FST (Daten), unser Bot (nachvollziehbar) |
| Verkaufspreis prüfen | Halbiert den Bereich nach dem **Alter der Angebote**: Steht eines seit 2 Minuten unverkauft da, ist der Preis zu hoch. Eine volle Prüfung pro Chemie-Stil, keine feste Obergrenze an Suchen. | Preisgruppe der billigsten Angebote (unterer Median), Kontrollmessung, höchstens 15 Suchen | Idee: FST. Grenze: unser Bot. |
| Auto Trading | Der Server wählt die Filter der Reihe nach. 5 Käufe oder 10 Gebote pro Filter, 35 s zwischen den Filtern. | Autopilot mit **einem** Spieler: Preisprüfung, dann Lauf | FST |
| Auto-Bieten | Bietet sofort einmal den vollen Höchstwert. 2 pro Suche, 5 pro Runde. | Erst in den letzten 30 oder 60 s, bietet in Schritten nach (höchstens 4-mal), Abrechnung über die Beobachtungsliste | Unser Bot |
| Verkaufen | Stellt auf Wunsch gleich nach dem Kauf ein (1 Std.). Prüft alle 8 Suchen die Verkäufe. Räumt bei 100 Karten auf. | Verkaufs-Helfer nur auf Klick: einstellen, neu einstellen, abräumen. Verkäufe werden gespeichert. | FST (automatisch), unser Bot (Kontrolle) |
| Datenschutz | Schickt EA-Konto-ID, Münzen, Vereinsdaten, Käufe und EA-Fehlertexte an den FST-Server | Alles bleibt im Browser | Unser Bot |
| Drosselung erkennen | Gibt es nicht | Langsame Antworten und plötzlich leere Suchen werden erkannt | Unser Bot |
| Leiste | 415 px, EA-Seite wird schmaler | 415 px, EA-Seite wird schmaler | Gleich |

---

## 2. Was FST besser macht

1. **Suchweg über die EA-App.** Suche und Kauf laufen durch die App selbst (Z. 56977, 57007, 58375, 58391). FST nimmt die echte Suchmaske der Suchseite, keine Kopie (Z. 58265–58268). Verlässt man die Suchseite, stoppt es (Z. 59112–59131). Unser Konto bekam mit eigenen Anfragen schon bei etwa 450 Suchen am Tag die 521.
2. **Etwa dreimal so schnell.** FST wartet 3,3–4,0 s, wir 10–14 s. In 4 Minuten schafft FST etwa 50–60 Suchen, wir etwa 18–22.
3. **Live-Filter ohne Kosten.** Die Filter kommen vom Server und kosten 0 EA-Suchen. Unser Scan braucht bis zu 16 Suchen. Automatisch läuft er alle 7 Minuten. Das frisst von unseren 350 Suchen pro Tag.
4. **Frischere Antworten.** Vor jeder Suche leert FST den Zwischenspeicher. Dazu wandert der Min-Sofortkauf 11 Stufen, und das Min-Gebot wechselt zwischen 0 und 150. Das sind etwa 22 verschiedene Anfragen, bei uns 4 (Z. 58353–58368).
5. **Stopp vor dem Kauf bei zu vielen Treffern.** Mehr als 10 Treffer heißt: Der Preis ist zu hoch. FST kauft dann nicht (Z. 58378, 58438–58452). Wir kaufen erst, bevor wir den Spieler überspringen.
6. **Prüfungen vor jeder Suche.** Münzen reichen nicht: einmal neu lesen, dann Stopp. Transferliste voll: aufräumen oder Stopp. Mehr als 4 nicht zugewiesen: Stopp (Z. 58493–58557). So gibt es weniger Ablehnungen von EA.
7. **Echter Verkaufspreis.** Die Preisprüfung zählt, wie lange ein Angebot schon steht. Steht es 2 Minuten unverkauft da, ist der Preis zu hoch (Z. 28305–28410). Heraus kommt der Preis, zu dem wirklich verkauft wird, nicht nur das billigste Angebot.
8. **Verkaufen läuft mit.** FST stellt auf Wunsch sofort nach dem Kauf ein. Es wartet 4,1–6,0 s, das Angebot läuft 1 Stunde, das Startgebot liegt eine Stufe tiefer (Z. 58278–58316, 58411–58436). Alle 8 Suchen prüft es die Verkäufe, bei 100 Karten räumt es auf.
9. **Filter wechseln.** Im Auto Trading ist nach 5 Käufen oder 10 Geboten der nächste Filter dran, nach 35 s Pause. Der Server senkt die Wertung, wenn ein Filter zu oft hintereinander läuft.
10. **Kleine Wächter.** Tab unsichtbar: Stopp (Z. 57051–57057). Not-Aus mit Strg+Umschalt+P. Vor dem Verschieben 5,0–6,5 s warten statt 2–5 s.

---

## 3. Was unser Bot besser macht

1. **Wachsende Sperre.** 426, 429, 458, 461, 512 und 521 stoppen sofort. Danach ist der Start gesperrt: 1 → 6 → 24 Std. innerhalb eines Tages. Die Sperre gilt in allen Tabs. FST stoppt zwar, man kann aber sofort neu starten. Nach einer 461 beim Kauf sucht FST einfach weiter.
2. **Feste Limits im Browser.** 150 Suchen pro Stunde, 350 pro Tag, 100 Kaufversuche pro Tag, 20 pro Karte und Tag. FST kennt nur das Abo-Limit vom Server.
3. **Pausen im Standard an.** FST hat sie aus. Im Auto Trading macht FST innerhalb eines Filters gar keine Pausen.
4. **Prüfung vor jedem Kauf.** Zielpreis, Budget, Limits pro Spieler, Kartenlimit, 3–5 s Abstand zwischen zwei Käufen. FST kauft den ersten Treffer ohne eigene Preisprüfung.
5. **Keine Antwort beim Kauf = Stopp.** FST läuft bei Netzfehlern weiter.
6. **Ehrliche Vorab-Prüfung.** Sie zeigt echte Zähler, sperrt rot nur bei echten Gründen und warnt bei „Usage Sharing“ und bei geladenem FST. Das FST-Fenster zeigt „keine Warnungen“, wenn seine Prüfung fehlschlägt.
7. **Nur ein Tab darf arbeiten.** Über den Speicher-Schlüssel `botBesitzer`.
8. **Klügeres Bieten.** Erst kurz vor Schluss, in Schritten nach oben, höchstens 4-mal pro Auktion, Ausgang über die Beobachtungsliste. FST bietet sofort den vollen Höchstwert.
9. **Preisprüfung mit Obergrenze.** Höchstens 15 Suchen. FST hat keine feste Grenze und prüft jeden Chemie-Stil einzeln.
10. **Drosselung erkennen.** Langsame Antworten und leere Suchen nach vorherigen Treffern lösen eine Warnung aus.
11. **Richtige Gewinn-Rechnung.** FST rechnet mit dem ungekappten Preis. Bei „Wrong list price!“ stellt es trotzdem ein, weil ein `return` fehlt.
12. **Alles bleibt lokal.** Keine Konto-ID und keine Käufe gehen an einen fremden Server.
13. **Wertung erklärt.** Jede Filterkarte sagt, warum sie ihre Wertung hat. Bei FST ist das eine Blackbox vom Server.

---

## 4. Übernahme-Plan (sortiert nach Nutzen für Gewinn und Kontoschutz)

| # | Was genau | Wo in FST | Wo bei uns | Aufwand | Risiko |
|---|---|---|---|---|---|
| 1 | **App-Suchweg fertig machen und live testen.** Die echte Suchmaske der EA-Suchseite nehmen statt einer neuen. Die EA-Suchseite muss offen sein, sonst Stopp. Vor jeder Suche den Zwischenspeicher leeren. Erst wenn 3–5 Tage ohne 461/521 vergehen: das Tageslimit in kleinen Schritten anheben (350 → 450 → 600). | Z. 56977, 57007, 58265–58268, 58368, 58375, 58391, 59112–59131 | `sniffer.js` `appSuche` (Z. 453), `appKauf` (Z. 500). `content.js` `api`/`appWeg` (Z. 1153–1260), `CONFIG.SEARCH_LIMIT_DAY` (Z. 85) | mittel | mittel: Seitengröße 20/21 und Umrechnung der Seite sind unbestätigt. Die echte Maske ändert, was man in EA sieht. |
| 2 | **Nicht kaufen, wenn es zu viele Treffer sind.** Ab 10 Treffern unter dem Zielpreis: nicht kaufen, Spieler sofort überspringen. | Z. 58378, 58438–58452 | `content.js` `loop` vor der Kauf-Schleife (Z. 3011), `search` (Z. 2203), `filterTooBroad` (Z. 2814) | klein | klein |
| 3 | **Prüfen vor dem Start und vor jeder Suche, ohne Anfrage.** Münzen < Zielpreis, Transferliste 100, nicht zugewiesen > 4. Gelesen wird aus dem Speicher der App (`repositories.Item`), wie beim Verkaufs-Helfer. | Z. 29810–29864, 58493–58557 | `sniffer.js` neue Lese-Funktion neben `transferItems` (Z. 318). `content.js` `start` (Z. 3111) und `loop` (Z. 2932) | klein bis mittel | klein |
| 4 | **Verkaufspreis nach dem Alter der Angebote.** Angebote, die 2 Minuten und länger unverkauft stehen, gelten als „zu teuer“. Das Alter lässt sich aus `expires` und der kürzesten passenden Laufzeit rechnen. Keine zusätzliche Suche, die Grenze von 15 bleibt. | Z. 28305–28410, 28462–28534 | `content.js` `buildPriceEntry` (Z. 1352), `runPriceCheck` (Z. 1441). `popup.js` `sellingPrices` (Z. 201), `verkaufVorschlag` (Z. 2177) | mittel | klein |
| 5 | **Nach dem Kauf automatisch einstellen (neue Wahl „einstellen“).** 4–6 s warten, 1 Std., Startgebot eine Stufe tiefer. Nur mit frischem Preis (höchstens 15 Min.) und nur, wenn Preis × 0,95 über dem Kaufpreis liegt, dann mit `return`. Sonst auf die Transferliste. **Der Nutzer muss zustimmen:** Am 22.09. entschied er „einstellen nur auf Klick“. | Z. 58278–58316, 58411–58436 | `content.js` `executeBuy` (Z. 2618), `AFTER_BUY_PILES` (Z. 2309). `sniffer.js` `verkaufAktion` (Z. 382) | mittel | mittel: eine EA-Aktion mehr pro Kauf. Sie muss mitgezählt werden und über die App laufen. |
| 6 | **Frischere Antworten.** Den Min-Sofortkauf 10 Stufen hochwandern lassen statt 4 Werte zu wiederholen. Dabei höchstens bis etwa 50 % vom Zielpreis, damit keine billigen Treffer verloren gehen. Das Min-Gebot bei jedem Rücksprung zwischen 0 und 150 wechseln. | Z. 58353–58368 | `content.js` `search` (Z. 2133–2140) | klein | klein |
| 7 | **Stopp, wenn der Tab unsichtbar wird.** Das gilt auch für Preisprüfung und Markt-Scan. Chrome bremst Zeitgeber in versteckten Tabs, und niemand schaut zu. | Z. 57051–57057 | `content.js` neuer `visibilitychange`-Wächter, der `stop(...)` aufruft | klein | klein |
| 8 | **Verkäufe nebenbei prüfen.** In jeder Sicherheitspause die Transferliste aus dem App-Speicher lesen (0 Anfragen) und Verkäufe merken. Liste voll: Stopp mit Hinweis, oder aufräumen, wenn der Nutzer das erlaubt. | Z. 58573–58587, 59138–59250, 59252–59345 | `content.js` `loop` (Pausen-Block), `transferlisteHolen` (Z. 1930), `verkaufteAbraeumen` (Z. 2019) | klein bis mittel | klein. Nur ein frisches Lesen kostet 1 Anfrage, die dann über `reserveUsage` gezählt wird. |
| 9 | **Filter-Wechsel im Autopilot mit lokaler Abkühlung.** Nach 5 Käufen oder X Suchen zum nächstbesten Live-Filter wechseln. 35 s Pause dazwischen. Ein benutzter Filter wird erst nach 3 anderen wieder gewählt. | Z. 42197–42373, 42222, 42734–42743, Idee Abkühlung Z. 35504–35656 | `popup.js` `startAutoRun` (Z. 2912), `liveFilterRows` (Z. 952). `content.js` `loop` | groß | mittel: Neue Filter brauchen neue Scans, und die kosten Suchen. |
| 10 | **Kürzere Läufe als Standard.** 20–30 Min. statt 300. So endet der Lauf geplant und nicht erst am Stundenlimit. | Z. 3269 (4 Min.), Z. 41930 (60 Min.) | `content.js` `validateConfig` (Z. 903). `popup.js` `DEFAULTS.timeLimitMin` (Z. 48) | klein | klein |
| 11 | **Länger warten vor dem Verschieben:** 5,0–6,5 s statt 2–5 s | Z. 58317–58327 | `content.js` `CONFIG.MOVE_DELAY_MIN_MS`/`MAX_MS` (Z. 104–105) | klein | klein |
| 12 | **Not-Aus per Taste** (z. B. Strg+Umschalt+P), nicht in Eingabefeldern | Z. 59416–59418, 18988–18994 | `content.js` `keydown`-Wächter, der `stop("Not-Aus")` aufruft | klein | klein |

**Reihenfolge:** Nummer 2, 3, 6, 7, 10, 11 und 12 sind klein und sicher. Die gehen zuerst. Nummer 1 ist der wichtigste Schritt, braucht aber einen Live-Test mit wenigen Suchen. Nummer 4 und 5 bringen den meisten Gewinn.

---

## 5. Was wir nicht übernehmen können oder sollten

1. **Serverdaten der Live-Filter:** Wertung, Budget-Stufe, Schilder, „For You“, Abkühlung, Marktaktivität, Filter-Wahl im Auto Trading, `auto_price_range`, `presetBreaks`. Diese Logik steht nicht im Code, sie liegt auf dem FST-Server. Die Erlaubnis deckt nur den Code, nicht den Server. Außerdem müssten wir dafür Kontodaten an den Server schicken.
2. **Jede Verbindung zum FST-Server.** FST sendet Anmeldung, EA-Konto-ID, Münzen, Vereinsdaten, Käufe und EA-Fehlertexte. Bei uns bleibt alles lokal. Das ist ein echter Vorteil.
3. **Name, Logo und Markenfarben** (Grün `rgb(7,244,104)`, Orange `rgb(255,93,11)`). Die Erlaubnis nimmt die Marke ausdrücklich aus.
4. **Das Tempo von FST (3,3–4,0 s) und Pausen „aus“, jedenfalls nicht jetzt.** Unser Konto bekam 521 bei etwa 450 Suchen pro Tag und am 22.09. zweimal 461. Erst muss der App-Weg sicher laufen.
5. **„Jeder Fehler = Stopp ohne Sperre“ und „nach 461 beim Kauf weitersuchen“.** Unsere wachsende Sperre ist strenger und bleibt.
6. **Auto-Bieten von FST** (sofort den vollen Höchstwert). Das treibt den Preis. Unser Bieten kurz vor Schluss ist besser.
7. **Keine Pausen innerhalb eines Filters im Auto Trading.** Das widerspricht unserem Kontoschutz.
8. **Fernstopp durch den Server** (422/403). Den brauchen wir nicht, wir haben keinen Server.
9. **SBC-Löser.** Die Lösungen und die Ziel-Teamwertung kommen vom FST-Server. Für den Handelsgewinn bringt er nichts.
10. **Klick-Weg und künstliche Klicks.** Der Klick-Weg ist toter Code, und die Klicks sind nicht „echt“ (`isTrusted = false`).
11. **Die FST-Fehler aus Abschnitt 11.3.** Dazu gehören: fehlendes `return`, `this.status` statt `e.status`, ungeprüftes `e.response.status`, ungekappter Gewinn, Server-Texte ungeprüft als HTML, `.catch(function(e){ e() })`.
12. **Die Preisprüfung ohne Obergrenze und pro Chemie-Stil.** Nur die Idee mit dem Alter übernehmen. Unsere Grenze von 15 Suchen bleibt.