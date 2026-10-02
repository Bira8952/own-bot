# Vergleich: FUT Simple Trader (FST 2.2.6) und FC27 Own Bot (4.25)

## Das Wichtigste zuerst

- **Beim Schutz des Kontos ist unser Bot klar besser.** Er hat feste Grenzen pro Stunde und Tag. Nach Warnungen von EA sperrt er sich lange selbst, und die Sperre wächst mit jeder Warnung. Die Pausen sind immer an. Keine Daten gehen an fremde Server.
- **Beim Geldverdienen ist FST weiter.** Es stellt gekaufte Karten selbst zum Verkauf ein. Vor jeder Suche prüft es, ob noch Platz und Münzen da sind. Im Auto-Trade arbeitet es viele Filter nacheinander ab.
- **Die wertvollsten Übernahmen sind meist klein:**
  - Platz und Münzen prüfen, ohne EA zu fragen
  - bei vielen Treffern früher aufhören
  - nur ein Kauf pro Suche
  - Stopp, wenn der Tab nicht sichtbar ist
  - mehr Abwechslung in den Suchen
- **Mehr Arbeit, aber sehr wertvoll:** gekaufte Karten automatisch einstellen.
- **Nicht übernehmen:** die Live-Filter vom FST-Server, Name und Logo, das Senden von Daten an FST, das hohe Tempo und die Fehler im FST-Code.
- **Das müssen wir live prüfen:** Laut FST landen gekaufte Karten in "Nicht zugewiesen" (Fehler 473 heißt: dort voll). Unsere Leiste sagt bei "Liegen lassen" aber "bleibt bei den Transferzielen" (popup.html Z. 322). Hat FST recht, ist unser Standard "Liegen lassen" gefährlich.

Ich habe unseren Code nur gelesen und nichts geändert: content.js, popup.js, popup.html, sniffer.js. Die FST-Zeilen beziehen sich auf `scripts.js` aus dem Bericht.

---

## 1. Tabelle

| Bereich | FST | Unser Bot | Wer ist besser? |
|---|---|---|---|
| Weg zu EA | Alles läuft über die EA-App selbst, wie Klicks (Z. 58244-59409) | Direkte Anfragen. Der Weg über die App ist neu, ausgeschaltet und nicht live getestet (content.js `appWeg` Z. 1153, sniffer.js `appSuche` Z. 453) | FST |
| Tempo "Normal" | 3,3-4,6 s zwischen zwei Suchen, etwa 15 pro Minute | 10-14 s, etwa 5 pro Minute (`searchDelay` Z. 2848) | FST bei der Menge, wir bei der Sicherheit |
| Grenzen pro Stunde und Tag | Keine im Browser, nur Abo-Grenzen vom Server | 150 Suchen/Std., 350/Tag, 100 Kaufversuche/Tag, 20 je Karte/Tag (Z. 84-120) | Wir |
| Pausen | Ab Werk aus. Ein Lauf dauert 4 Min. | Immer an: alle 30-50 Suchen 30-60 s, dazu längere Pausen (`breakPlan` Z. 2854) | Wir |
| Abwechslung in den Suchen | minBuy steigt in 11 Stufen, minBid wechselt 0/150. Bis zu 22 verschiedene Anfragen | minBuy wechselt 0/150/200/250. Nur 4 verschiedene (`search` Z. 2136) | FST |
| Wartezeit zwischen Suchen | Grundzeit, dazu in 50 % der Fälle ein Aufschlag | Gleichmäßig zufällig. Einen Aufschlag hat nur der Markt-Scan | FST (knapp) |
| Kaufen | Nimmt den ersten Treffer ohne eigene Preisprüfung. Höchstens 1 Kauf pro Suche | Prüft Preis, Karte und Rating. 180-350 ms Reaktionszeit. Mehrere Käufe pro Suche mit 3-5 s Abstand | Wir beim Preis, FST beim Kaufmuster |
| Zu viele Treffer | Mehr als 10: sofort Stopp | Erst nach 2 vollen Seiten (je 20-21 unter Zielpreis) wird der Spieler ausgesetzt | FST |
| Platz und Münzen | Prüft vor jeder Suche: Transferliste voll (100)? Mehr als 4 in "Nicht zugewiesen"? Zu wenig Münzen? EA wird dafür nicht gefragt | Merkt es erst an EA-Fehlern (473, 470) | FST |
| Fehler von EA | Stoppt bei jedem Suchfehler, merkt sich aber nichts. Für 426, 461 und 521 gibt es keine eigene Behandlung | Eigene Sperren von 15-240 Min. Jede weitere Warnung verlängert die Sperre um das Sechsfache, bis 24 Std. | Wir (deutlich) |
| Tab verdeckt oder Suchseite verlassen | Stopp. Not-Aus mit Strg+Umschalt+P | Läuft weiter. Kein Tastenkürzel | FST |
| Zweiter Tab oder zweiter Bot | Keine Prüfung | Nur ein Tab darf arbeiten. Die FST-Leiste wird erkannt | Wir |
| Nach dem Kauf | Auf die Transferliste oder gleich einstellen (1 Std.), mit Schutz vor Verlust | In den Verein, auf die Transferliste oder liegen lassen. Standard ist "Liegen lassen" | FST |
| Verkaufen | Automatisch. Abgelaufene werden nie neu eingestellt | Per Klick: einstellen, abgelaufene neu einstellen, verkaufte abräumen, echter Gewinn | FST beim Tempo, wir bei der Kontrolle |
| Preis-Check | Achtet auf das Alter der Angebote, hat 3 Verfahren, 1 s Abstand, keine feste Obergrenze | Sucht Preisgruppen und misst zur Kontrolle nach. Höchstens 15 Suchen, 3 s Abstand | Gleich: FST ist klüger, wir sparsamer |
| Live-Filter | Kommen vom FST-Server aus Daten vieler Nutzer. Kosten keine eigene Suche | Eigener Markt-Scan mit bis zu 16 Suchen, alle 7 Min., 15 Min. gültig | FST bei den Daten, wir bei der Unabhängigkeit |
| Wertung der Filter | Wertung vom Server, Abkühlung nach Benutzung, beste Zeit | Eigene Wertung 0-100 aus Chance, Sicherheit, Gewinn und Frische | Gleich |
| Automatischer Betrieb | Auto-Trade: 60 Min., ein Filter nach dem anderen, für jeden ein frischer Preis | Autopilot für nur einen Spieler | FST |
| Prüfung vor dem Start | Text vom Server. Warnungen halten den Start nicht auf | Lokal, mit echten Zählern. Rote Sperren halten den Start auf | Wir |
| Bieten | Bietet sofort den Höchstbetrag | Bietet erst in den letzten 30 oder 60 s, Schritt für Schritt, und prüft das Ergebnis | Wir |
| Datenschutz | Schickt Treffer, Käufe, Club-Daten und SBCs an den FST-Server | Nichts verlässt den Browser außer zu EA | Wir (deutlich) |
| SBC | Löser (nur Premium, rechnet auf dem Server) | Keiner | FST (ist nicht unser Ziel) |

---

## 2. Was FST besser macht

1. **Prüft Platz und Münzen, bevor etwas schiefgeht.** Vor jeder Suche prüft FST drei Dinge: ob die Transferliste voll ist (100), ob mehr als 4 Karten in "Nicht zugewiesen" liegen und ob die Münzen für den Höchstpreis reichen. Die Zahlen liest es aus dem Speicher der EA-App, ohne EA zu fragen (Z. 58493-58557). Unser Bot merkt es erst, wenn EA mit 473 oder 470 antwortet. Das ist dann schon ein gescheiterter Kauf.
2. **Mehr Abwechslung.** minBuy steigt mit jeder Suche um eine Preisstufe, 11 Suchen lang. minBid wechselt zwischen 0 und 150. Vor jeder Suche wird der Zwischenspeicher der App geleert (Z. 58349-58368). So entstehen bis zu 22 verschiedene Anfragen. Bei uns wiederholt sich jede Anfrage nach 4 Suchen.
3. **Hört früher auf.** Bei mehr als 10 Treffern stoppt FST sofort und kauft nichts (Z. 58438-58452). Unser Bot braucht dafür zwei volle Seiten hintereinander, also je 20-21 Angebote unter dem Zielpreis.
4. **Ruhigeres Kaufmuster.** FST kauft höchstens eine Karte pro Suche. Danach wartet es 5-6,5 s, verschiebt die Karte und wartet noch einmal 3,3-4,6 s bis zur nächsten Suche. Unser Bot kauft mehrere Karten aus einer Suche mit 3-5 s Abstand. Genau zwei Käufe aus einer Suche führten am 22.09. zu 426 und danach zu 461.
5. **Verkauft von selbst.** Mit dem Modus "list" stellt FST die Karte gleich nach dem Kauf ein. Der Sofortkaufpreis ist der Verkaufspreis, der Startpreis eine Stufe darunter, die Laufzeit 1 Stunde. Der Preis wird auf das EA-Maximum begrenzt. Wäre das ein Verlust, stoppt FST (Z. 58277-58327). Bei uns geht Verkaufen nur per Klick.
6. **Stoppt, wenn niemand hinsieht.** Ist der Tab nicht sichtbar, stoppt FST. Verlässt man die Suchseite, stoppt es auch. Dazu gibt es einen Not-Aus mit Strg+Umschalt+P (Z. 57051-57068, 59112-59131, 59416-59418).
7. **Auto-Trade.** Er läuft 60 Minuten. Die Filter kommen einer nach dem anderen. Für jeden Filter prüft FST zuerst den Preis und rechnet dann den Höchstpreis aus: Verkaufspreis × 0,95 minus Mindestgewinn. Ein Filter endet nach 5 Käufen oder 10 Versuchen. Danach gibt es 35 s Pause (Z. 42197-42373, 42734-42744). Unser Autopilot kann nur einen Spieler.
8. **Klügerer Preis-Check.** FST schätzt, wie lange ein Angebot schon steht. Ein Angebot, das 2 Minuten oder länger steht, verkauft sich zu dem Preis offenbar nicht. Dann senkt FST den Preis (Z. 28305-28408). Unser Check schaut nur auf Preisgruppen.
9. **Live-Filter ohne eigene Suchen.** Die Filter kommen aus den Daten vieler Nutzer. Sie haben eine Wertung, Treffer pro 100 Suchen, eine Abkühlung nach Benutzung und die nächste gute Zeit (Z. 34888-35656, 37374-37542). Unser Scan kostet bis zu 16 Suchen aus unserem eigenen Tageslimit.
10. **Alles läuft über die EA-App.** Jede Anfrage sieht aus wie ein Klick in der App. Bei uns gibt es diesen Weg erst seit gestern, er ist aus und nicht getestet.
11. **Schneller.** Im Modus Normal schafft FST etwa 15 Suchen pro Minute, wir etwa 5. Das bringt mehr Treffer pro Minute, aber auch viel mehr Risiko (siehe Abschnitt 5).

---

## 3. Was unser Bot besser macht

1. **Feste Grenzen aus echten Sperren.** 150 Suchen pro Stunde, 350 pro Tag, 100 Kaufversuche pro Tag, 20 pro Karte und Tag (content.js Z. 84-120). FST hat im Browser keine solchen Grenzen.
2. **Nach Warnungen von EA sperrt er sich selbst.** Das gilt für 426, 429, 458, 461, 494, 512 und 521. Die Sperre dauert 15-240 Minuten. Jede weitere Warnung innerhalb von 24 Std. macht sie sechsmal so lang, höchstens 24 Std. (Z. 140-186, 504-539). FST stoppt nur und kann sofort neu starten. Für 461, 521 und 426 hat es keine eigene Behandlung.
3. **Pausen sind immer an.** Bei "Ausgewogen" gibt es alle 30-50 Suchen 30-60 s Pause. Nach 3-5 Pausen folgt eine lange, zweieinhalb- bis dreimal so lang (Z. 2854-2864). Bei FST sind Pausen ab Werk aus, im Auto-Trade sogar fest abgeschaltet.
4. **Prüft vor jedem Kauf selbst.** Preis bis Zielpreis, richtige Karte, richtiges Rating, Budget, Grenzen (`canTransact` Z. 2579). FST kauft den ersten Treffer ohne eigene Prüfung. Seine Prüffunktion wird nie aufgerufen (Z. 58852).
5. **Kauft nicht sofort.** Vor jedem Kauf wartet er 180-350 ms wie ein Mensch (Z. 2625).
6. **Nur ein Tab und nur ein Bot.** Nur ein Tab darf mit EA reden (Z. 611-669). Die Leiste von FST erkennt er (Z. 625). Ist "Usage Sharing" an, warnt er (Z. 3877).
7. **Keine Daten an fremde Server.** FST schickt den ersten Treffer jeder Suche, jeden Kauf, Club-Daten, jede SBC, die EA-Konto-ID sowie E-Mail und Passwort an seinen Server.
8. **Prüfung vor dem Start im Browser.** Sie zeigt die echten Zähler für die letzte Stunde und den Tag. Es gibt rote Sperren und gelbe Hinweise (popup.js `startPruefung` Z. 3793-3912). FST zeigt nur Text vom Server an, und die Start-Knöpfe beachten die Warnungen nicht.
9. **Erkennt, wenn EA bremst.** Das zeigt sich an langsamen Antworten oder daran, dass ein Filter plötzlich nichts mehr liefert (Z. 1078-1136). FST hat so etwas nicht.
10. **Besseres Bieten.** Er bietet erst in den letzten 30 oder 60 s, jeweils eine Stufe höher, höchstens 4-mal pro Auktion. Das Ergebnis prüft er über die Beobachtungsliste. FST bietet sofort den Höchstbetrag.
11. **Verkaufs-Helfer.** Er stellt abgelaufene Karten neu ein, was FST gar nicht kann. Er zeigt den echten Gewinn aus Verkäufen, nicht nur eine Schätzung (Z. 1804-2035).
12. **Sparsamer Preis-Check.** Höchstens 15 Suchen, mit einer Kontrollmessung (Z. 1441-1555). FST sucht mit 1 s Abstand, bis ein Preis zum zweiten Mal vorkommt. Eine feste Grenze gibt es nicht.
13. **Genauere Gewinnrechnung.** Der Mindestgewinn richtet sich nach der Preisklasse. Bei unsicherem Preis kommt Sicherheit dazu: 2 % oder 5 % zusätzlich (popup.js `intelligentProfit` Z. 517, `suggestionFor` Z. 544).
14. **FST hat 12 bekannte Fehler.** Beispiele: Karten werden trotz Stopp mit Verlust eingestellt, der Höchstpreis sinkt mit der Zeit ab, "Nein" zählt als "Ja". Diese Fehler haben wir nicht.

---

## 4. Plan: Was wir übernehmen

Sortiert nach Nutzen für Gewinn **und** Kontosicherheit. Alle unsere Grenzen und Sperren bleiben, wie sie sind.

### 1. Platz und Münzen vor jeder Suche prüfen, ohne EA zu fragen
- **Was:** Vor jeder Suche aus dem Speicher der EA-App lesen:
  - Ist die Transferliste voll (100)?
  - Liegen mehr als 4 Karten in "Nicht zugewiesen"?
  - Sind die Münzen weniger als der höchste Zielpreis?

  Trifft eins davon zu, stoppt der Lauf sauber mit Hinweis. Wer will: Ist die Liste voll und es gibt verkaufte Karten, wartet der Bot 1-2 s und räumt sie ab. Das kostet eine Anfrage.
- **FST:** Z. 58493-58502 (Nicht zugewiesen), 58504-58525 (Münzen), 58527-58557 und 59138-59250 (Transferliste), 29836-29839 (Prüfung beim Start).
- **Bei uns:**
  - sniffer.js: neue Frage `stapel?` neben `transferItems()` (Z. 318).
  - content.js: neue Prüfung in `loop()` vor `search()` (Z. 2995) oder in `stopReason()` (Z. 2786).
  - Münzen aus `STATE.credits`. Jede Suchantwort bringt den Stand schon mit (Z. 2167).
- **Aufwand:** klein bis mittel.
- **Risiko:** klein. Den Namen der Lesefunktion für "Nicht zugewiesen" erst über "Schnittstelle prüfen" bestätigen. Fehlt sie, wird die Prüfung ausgelassen und der Lauf läuft weiter.
- **Nutzen:** Jeder gescheiterte Kauf (473 oder 470) ist ein schlechtes Zeichen bei EA und zählt auf das Tageslimit. Dazu gehört die Frage von oben: Landen Käufe in "Nicht zugewiesen"? Wenn ja, sollte der Standard von "Liegen lassen" auf "Transferliste" wechseln (popup.js `DEFAULTS` Z. 48-54, content.js `validateConfig` Z. 906-908, popup.html Z. 320-322).

### 2. Nach dem Kauf automatisch einstellen
- **Was:** Neue Wahl "Verkaufen" bei "Nach dem Kauf". Ablauf:
  1. Karte auf die Transferliste schieben.
  2. 4-6 s warten.
  3. Einstellen: Sofortkauf = Verkaufspreis, Start eine Stufe darunter, 1 Stunde.

  Nur mit frischem Preis, höchstens 60 Minuten alt. Sonst bleibt die Karte auf der Liste und es kommt ein Hinweis. Schutz vor Verlust: Liegt der Preis über dem EA-Maximum und bringt Maximum × 0,95 weniger als der Kaufpreis, wird nicht eingestellt. FSTs Fehler hier nicht nachbauen: Dort fehlt ein Abbruch, und die Karte wird trotzdem mit Verlust eingestellt.
- **FST:** Z. 58277-58327 und 58411-58436 (Ablauf und Zeiten), 59392-59403 (Preis je Karte), 58288-58305 (Verlustschutz, Meldung 5009).
- **Bei uns:**
  - content.js `executeBuy()` (Z. 2618-2713), nach `sendToPile()`. Neuer Wert in `AFTER_BUY_PILES` (Z. 2309).
  - Einstellen über den vorhandenen Weg `verkaufAusfuehren("einstellen")` (Z. 1959) und sniffer.js `verkaufAktion` (Z. 382).
  - Den Preis gibt es schon: `target.salePrice` (Z. 893-894).
- **Aufwand:** mittel.
- **Risiko:** mittel. Ein alter Preis heißt Verlust. Jedes Einstellen ist eine Anfrage mehr bei EA.
- **Nutzen:** hoch. Am 22.09. lagen 45 Spieler unverkauft auf der Transferliste (content.js Z. 1806-1808). Gewinn gibt es erst beim Verkauf.

### 3. Bei vielen Treffern früher aufhören
- **Was:** Liegen mehr als 10 Angebote in **einer** Suche beim Zielpreis oder darunter, wird der Spieler sofort ausgesetzt. Aus dieser Suche wird nichts gekauft. Hinweis: "Zielpreis liegt am Marktpreis."
- **FST:** Z. 58438-58452 (Meldung 5006), Standard Z. 3298.
- **Bei uns:** content.js `search()` Z. 2203 (Zähler für volle Seiten), `filterTooBroad()` Z. 2814, `CONFIG.BROAD_FILTER_HITS` Z. 122. Die Prüfung gehört in `loop()` vor das Kaufen (Z. 3011).
- **Aufwand:** klein.
- **Risiko:** klein. Der Schalter "Stopp bei zu weitem Filter" bleibt.
- **Nutzen:** Kein Kauf zum Marktpreis ohne Gewinn. Keine Welle von Käufen.

### 4. Höchstens ein Kauf pro Suche, der billigste zuerst
- **Was:**
  - Neuer Schalter, Standard an: pro Suche nur einen Kauf versuchen.
  - Den billigsten Treffer nehmen, nicht den ersten. FST nimmt den ersten, und EA sortiert nach Restzeit, nicht nach Preis. Hier machen wir es besser als FST.
  - Nach dem Kauf 5-6,5 s warten, bevor die Karte verschoben wird. Heute sind es 2-5 s.
- **FST:** Z. 58270-58332, 58387-58409 (nur der erste Treffer), 58317-58324 (5000-6500 ms).
- **Bei uns:** content.js `loop()` Z. 3011-3035: Treffer nach Preis sortieren und nach dem ersten Kauf aufhören. Wartezeit in `CONFIG.MOVE_DELAY_MIN_MS/MAX_MS` Z. 104-105.
- **Aufwand:** klein.
- **Risiko:** klein. Selten ein Kauf weniger.
- **Nutzen:** Schutz. Die Sperre vom 22.09. kam nach zwei Käufen aus derselben Suche. Außerdem mehr Gewinn pro Kauf, weil der billigste zuerst drankommt.

### 5. Anhalten, wenn der Tab nicht sichtbar ist
- **Was:** Ist der EA-Tab nicht mehr sichtbar, werden Lauf, Markt-Scan und automatischer Scan angehalten. Ein Start geht erst, wenn der Tab wieder sichtbar ist. Neuer Schalter, Standard an.
- **FST:** Z. 57051-57057, 57067-57068 (Meldung 5001).
- **Bei uns:** content.js: neuer Horcher auf "visibilitychange" neben dem für "pagehide" (Z. 667). Prüfung in `start()` (Z. 3111) und `autoScanBereit()` (Z. 3898).
- **Aufwand:** klein.
- **Risiko:** klein. Man muss den Tab offen lassen.
- **Nutzen:** Schutz. Chrome bremst Zeitgeber in unsichtbaren Tabs. Nach etwa 5 Minuten laufen sie meist nur noch einmal pro Minute. Das gilt sehr wahrscheinlich auch für unser Warten (`wait()` Z. 2123). Die Suchen kämen dann genau im Minutentakt, und so ein gleichmäßiges Muster fällt auf.

### 6. Mehr Abwechslung in den Suchen
- **Was:**
  - minBuy steigt Stufe für Stufe, bis zu 10 Stufen, dann zurück auf 0. Höchstens bis 40 % des Zielpreises, sonst fallen sehr billige Angebote heraus.
  - minBid im Wechsel 0 und 150. Vorher live prüfen, ob dabei Angebote ohne Gebot wegfallen. Unser Kommentar Z. 2134-2135 vermutet das, FST nutzt es trotzdem.
  - Immer vom Startwert aus rechnen. FSTs Fehler 2 lässt den Höchstpreis mit der Zeit absinken.
- **FST:** Z. 58349-58368, Preisstufen Z. 1546-1549.
- **Bei uns:** content.js `search()` Z. 2130-2142, `searchPath()` Z. 1286.
- **Aufwand:** klein.
- **Risiko:** klein.
- **Nutzen:** Schutz, weil sich Anfragen seltener gleichen. Frische Ergebnisse statt alter aus dem Zwischenspeicher.

### 7. Beim Preis-Check auf das Alter der Angebote achten
- **Was:** Aus der Restzeit schätzen, wie lange ein Angebot schon steht: nächste übliche Laufzeit (1 h, 3 h, 6 h, 12 h, 1 Tag, 3 Tage) minus Restzeit. Alte Angebote, die niemand kauft, zählen beim Marktpreis weniger, neue mehr. Das braucht keine zusätzliche Suche, denn die Restzeit steht schon in den Antworten. FSTs Suchweise mit 1 s Abstand und ohne Obergrenze übernehmen wir **nicht**.
- **FST:** Z. 28305-28339 (Alter), 28352-28408 (Regeln), 28418-28460 (Aufschläge bei "lazy").
- **Bei uns:** content.js `buildPriceEntry()` Z. 1352-1414, `secondsLeft()` Z. 334. popup.js `sellingPrices()` Z. 201.
- **Aufwand:** mittel.
- **Risiko:** mittel, weil das Alter nur geschätzt ist. Erst nur anzeigen, dann einrechnen.
- **Nutzen:** Gewinn. Ein ehrlicherer Verkaufspreis ergibt den richtigen Zielpreis. Weniger Gewinne, die es gar nicht gibt.

### 8. Abkühlung für Filter
- **Was:** Nach einem Lauf auf eine Karte sinkt ihre Wertung für eine Weile. Zum Beispiel, bis 5 andere Filter gelaufen sind, oder für 60 Minuten. Die Karte zeigt dann "Abkühlung".
- **FST:** Z. 35286-35290, 35345-35383, 35504-35656. Dort ist das nur Anzeige, die Regel liegt auf dem Server. Wir bauen eine eigene.
- **Bei uns:** popup.js `wertungTeile()` Z. 745-796 (neuer Teil neben "erfahrung"), `localFilterStats()` Z. 812, `filterBadges()` Z. 844.
- **Aufwand:** klein.
- **Risiko:** klein.
- **Nutzen:** Weniger Käufe derselben Karte schützt das Konto. Heute gilt nur die Grenze von 20 pro Tag (Z. 120). Außerdem kann sich der Markt der Karte erholen.

### 9. Wartezeit: Grundzeit plus gelegentlicher Aufschlag
- **Was:** Zwischen zwei Suchen eine Grundzeit, dazu in etwa der Hälfte der Fälle ein Aufschlag. Unsere Durchschnittszeiten bleiben gleich. Der Bot wird nicht schneller.
- **FST:** Z. 58618-58636, Zufall Z. 1375-1377 und 1619-1621.
- **Bei uns:** content.js `searchDelay()` Z. 2848-2852, so wie `scanDelay()` (Z. 2840) es schon macht.
- **Aufwand:** klein.
- **Risiko:** keins.
- **Nutzen:** Schutz, weil die Abstände weniger gleichmäßig sind.

### 10. Beste Uhrzeit aus eigenen Daten
- **Was:** Aus unseren eigenen Läufen ausrechnen, wie viele Treffer pro 100 Suchen es zu jeder Stunde des Tages gab. Anzeige: "Deine besten Stunden". Dort lohnt es sich, die 350 Suchen des Tages auszugeben.
- **FST:** nächste gute Zeit im Markt-Fenster (Z. 37374-37542). Die kommt vom Server, wir rechnen selbst.
- **Bei uns:** popup.js, neu neben `localFilterStats()` (Z. 812). Die Daten kommen aus den gespeicherten Läufen (content.js `recordRun()` Z. 2041, mit Zeit und Dauer).
- **Aufwand:** klein bis mittel.
- **Risiko:** klein. Am Anfang gibt es wenig Daten.
- **Nutzen:** mehr Gewinn pro Suche. Unser Tageslimit ist knapp.

### 11. Filter nacheinander abarbeiten (Autopilot mit Wechsel)
- **Was:** Der Autopilot arbeitet mehrere Live-Filter ab:
  1. besten Filter wählen
  2. frischen Preis prüfen
  3. Lauf bis 5 Käufe, 10 Versuche oder N Suchen
  4. 35 s Pause plus Zufall
  5. nächster Filter, nicht noch einmal derselbe (siehe Punkt 8)

  Alle unsere Grenzen gelten weiter, weil `api()` sie vor jeder Anfrage prüft.
- **FST:** Z. 42197-42373 (Wechsel), 42734-42744 (Filter-Ende), 42340-42342 (Höchstpreis).
- **Bei uns:** popup.js `startAutoRun()` Z. 2912-2977, `liveFilterRows()` Z. 952, `awaitFreshPrice()` Z. 1473. content.js Ende von `loop()` Z. 3083-3108.
- **Aufwand:** groß.
- **Risiko:** mittel bis hoch. Die Läufe sind länger, keiner schaut zu, es gibt mehr Suchen. Erst nach den Punkten 1-9 bauen.
- **Nutzen:** Viel Gewinn, auch wenn niemand daneben sitzt.

### 12. Suche über die App an die Suchseite der App koppeln
- **Was:** Ist "Suchen über die EA-App" an, läuft der Bot nur, solange in der App die Suche auf dem Transfermarkt offen ist. Verlässt man sie, stoppt er. Vorher muss dieser Weg überhaupt einmal live getestet werden. content.js Z. 1277-1281 und sniffer.js Z. 424-425 sagen selbst: noch nicht bestätigt.
- **FST:** Z. 59112-59131 (Meldung 5002), 1405-1408 (nimmt das echte Suchobjekt der offenen Seite).
- **Bei uns:** sniffer.js `appSuche()` Z. 453-498 (baut heute ein neues Suchobjekt), content.js `api()` Z. 1223.
- **Aufwand:** mittel.
- **Risiko:** unklar. Wir wissen nicht, ob EA überhaupt sieht, welcher Bildschirm offen ist.
- **Nutzen:** Schutz, falls EA Bildschirm und Anfragen vergleicht.

**Kleine Zugabe:** ein Not-Aus per Tastenkürzel (FST Z. 59416-59418). Einbauen in content.js auf `window`. Dabei beachten: Unsere Leiste hält Tastendrücke an ihrem Rand auf (Z. 3449).

---

## 5. Was wir nicht übernehmen können oder sollten

1. **Live-Filter, Wertung, Filterwechsel, Marktanzeige, Pausen-Vorlagen und die Tabelle für Preisspannen vom FST-Server.** Das steht nicht im Code, sondern nur auf dem Server. Die Erlaubnis gilt für den Code, nicht für den Server (ERLAUBNIS-FST.md Z. 28-29). Wir bräuchten ein FST-Konto. Unser Bot würde dann Münzen, Suchen und Käufe an FST schicken. Und er hinge von einem fremden Dienst ab, der ihn jederzeit stoppen kann (422 oder 403, Z. 59373-59388).
2. **Name, Logo und Marke** von FST, auch die Logo-Farben #07F468 und #FF5D0B (ERLAUBNIS-FST.md Z. 27). Die Breite der Leiste (415 px) haben wir schon. Das ist kein Problem.
3. **Daten an fremde Server schicken.** Also Treffer, Käufe, Club-Daten, SBCs, Konto-ID oder Anmeldedaten. Das verletzt den Datenschutz, und jede zusätzliche Verbindung ist ein Risiko.
4. **Das Tempo.** Normal etwa 15 Suchen pro Minute, Turbo 2,5-3,1 s Abstand. Mit unserer Grenze von 150 pro Stunde wäre die Stunde nach etwa 10 Minuten voll. EA hat uns schon bei etwa 450 Suchen am Tag gesperrt (521).
5. **Pausen ab Werk aus** und Läufe von 4 Minuten ohne Pause dazwischen.
6. **FSTs Umgang mit EA-Fehlern.** Stopp ohne Gedächtnis, keine eigene Behandlung für 426, 461 und 521. Unserer ist besser.
7. **Kaufen ohne eigene Preisprüfung** (Z. 58852).
8. **FSTs Preis-Check als Ganzes.** Er sucht mit 1 s Abstand, bis ein Preis zum zweiten Mal kommt, ohne feste Obergrenze (Z. 28261-28279). Das sind zu viele Suchen. Nur die Idee mit dem Alter der Angebote übernehmen (Punkt 7).
9. **Die Transferliste alle 8 Suchen neu laden** (Z. 58573-58586). Das kostet Anfragen. Wir lesen aus dem Speicher der App.
10. **Den SBC-Löser.** Er braucht den FST-Server. Beim Kaufen sucht er ohne Pause sofort neu (Z. 53196-53520). Er ist auch nicht unser Ziel.
11. **FSTs Bieten** (sofort das Höchstgebot). Unseres ist besser.
12. **Die 12 FST-Fehler** aus Abschnitt 11 des Berichts. Vor allem diese:
    - fehlender Abbruch bei falschem Listenpreis: Die Karte wird mit Verlust eingestellt
    - der Höchstpreis sinkt mit der Zeit ab
    - "Nein" zählt als "Ja"
    - Text vom Server kommt ungeprüft in die Seite. Das ist eine Sicherheitslücke.
13. **Rechtliches:**
    - Nur Ideen nachbauen, keinen Code abschreiben. Die Echtheit der Erlaubnis-Mail ist nicht geprüft, es gibt nur ein Bildschirmfoto (ERLAUBNIS-FST.md Z. 23-24). Mit eigenem Code bleibt unser Bot sauber, auch wenn die Erlaubnis nicht hält.
    - Die Gedächtnis-Notiz `fut-simple-trader-lizenz.md` sagt noch "nicht analysieren". Sie sollte an die neue Lage angepasst werden. Ich habe sie nicht geändert.

**Dateien:**
- C:\Users\oders\Pictures\fc27-own-bot\content.js
- C:\Users\oders\Pictures\fc27-own-bot\popup.js
- C:\Users\oders\Pictures\fc27-own-bot\popup.html
- C:\Users\oders\Pictures\fc27-own-bot\sniffer.js
- C:\Users\oders\Pictures\fc27-own-bot\ERLAUBNIS-FST.md