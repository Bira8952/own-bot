# MagicBuyer-UT im Vergleich mit own-bot

> Quelle: https://github.com/AMINE1921/MagicBuyer-UT (Stand Release 5.1.1, 24.09.2026), vollständig gelesen und mit own-bot verglichen am 02.10.2026. Jede Lücke wurde gegen den own-bot-Code gegengeprüft.


**Vorweg:** Jede Automatisierung der Web App verstößt gegen die Regeln von EA. Das schreibt sogar die README von MagicBuyer selbst. Kein Umbau macht einen Bot sicher. Dein Konto war schon gesperrt, und es gilt: Je schneller der Bot, desto mehr Gewinn und desto größer das Risiko. Die Vorschläge unten senken das Risiko, aber sie beseitigen es nicht.

## 1. Was MagicBuyer ist

MagicBuyer ist ein französisches Tampermonkey-Skript für die Web App von FC 27, geschrieben von AMINE1921. Es sucht in einer Schleife und kauft sofort jede Karte unter einem Höchstpreis. Der Höchstpreis ist fest oder ein Prozentsatz vom FUTBIN-Preis. Gekaufte Karten stellt es zum FUTBIN-Preis wieder ein. Außerdem zeigt es FUTBIN-Preise auf jeder Karte an, lädt SBC-Lösungen von FUTBIN und kauft die fehlenden Spieler. Es hat drei Tempo-Stufen: prudent, normal und rapide. Alle Aktionen bei EA laufen über die Funktionen der Web App selbst. Für EA sehen sie deshalb aus wie normale Klicks. Die FUTBIN-Daten holt es über deine Browser-Cookies und über versteckte Fenster in der Seite.

## 2. Wo own-bot schon besser ist

- **Sperren:** own-bot sperrt nach einer Warnung von EA den Neustart. Die Sperre wird bei Wiederholung länger und bleibt nach dem Neuladen bestehen. Dazu kommen Grenzen pro Stunde und pro Tag. MagicBuyer hat beides nicht und sucht nach einer Drosselung (429) schon nach 4–8 Minuten von selbst weiter.
- **Warnsignale:** own-bot behandelt die Fehler 426 und 461 als Vorboten einer Sperre. So geschah es am 22.09. MagicBuyer hält sie für „Karte schon weg“ und kauft einfach weiter.
- **Preise:** own-bot misst sie selbst bei EA. Chemie, Kartenart und Plattform stimmen dadurch automatisch. FUTBIN ist ungenauer und oft veraltet.
- **Kaufen und Einstellen:** own-bot versucht jedes Angebot nur einmal und lässt mindestens 8 Sekunden zwischen zwei Käufen. Fürs Einstellen braucht es keine zusätzliche Anfrage.
- **Sichtbarkeit:** own-bot hält an, wenn der Tab im Hintergrund ist. Die eigene Leiste ist für die EA-Seite nicht einsehbar. own-bot verändert keine Programmteile von EA und speichert nichts im Speicher der EA-Seite.
- **Wartung:** own-bot hat rund 37 Testdateien und lädt keine automatischen Updates aus einem fremden GitHub.

## 3. Top-Empfehlungen (in dieser Reihenfolge umsetzen)

1. **Warnungen von EA stoppen den Bot immer.** Im FST-Modus, der ab Werk an ist (popup.js:109), stoppt der Bot heute nicht sofort, wenn beim Kaufen, Bieten oder in der Verkaufs-Wache ein Captcha (458), 401/465, 461/426, 494, 512/521 oder 20000/20004 kommt. Ändern in content.js `apiAntwortPruefen` (~2431–2452) und in der Verkaufs-Wache (~4186). Dazu soll bei diesen Fehlern immer ein Warnton kommen, auch wenn „Ton am Lauf-Ende“ aus ist. Und die Chrome-Meldung soll stehen bleiben, bis man sie wegklickt (`tonSpielen` ~1351, background.js:10). Aufwand klein. Danach gehen weniger Anfragen raus. Weil das vom Ziel „1:1 wie FST“ abweicht, als Schalter einbauen.
2. **Ungewollte Zusatz-Scans abstellen.** Heute plant jede gespeicherte Einstellung den Auto-Scan neu. Das gilt schon beim Tippen in den Grenzfeldern und wenn sich der Kontostand ändert. Jedes Mal kann das bis zu 16 Suchen kosten. Lösung: `applyAutomationSettings` (content.js ~8425) plant nur noch neu, wenn der Auto-Scan gerade eingeschaltet wird. In popup.js ~8583 wird erst beim Verlassen des Felds gespeichert statt bei jedem Tastendruck. `autoScanBereit` (~8329) läuft nur bei sichtbarem Tab. Bei ruhigem Markt wird der Abstand länger (7 → 21 Minuten). Aufwand klein, weniger Anfragen.
3. **Gleichmäßigeres Tempo und ein Schonprofil.** Im strengen Modus ist das Stundenlimit heute nach etwa 10 Minuten Dauerfeuer aufgebraucht. Besser ist, das Stundenbudget zu verteilen: Abstand = 3600 s geteilt durch das Limit, eingebaut in `searchDelay` (content.js ~6667). Dazu ein Profil „Konto-schonend“ nach dem Vorbild von MagicBuyers prudent: 8–14 s Abstand, höchstens 6 Suchen pro Minute, Pause alle 12–18 Suchen, höchstens 90 Minuten Laufzeit (`applyStartProfile`, popup.js ~8420). Aufwand klein. Gleich viele oder weniger Anfragen, aber weniger Treffer pro Stunde.
4. **Kleine Lücken schließen.**
   - Kein Start, solange noch eine Verkaufs-Aktion läuft (`start()` content.js ~7179, popup.js ~4333).
   - Die Meldung „Liste voll“ von EA nur glauben, wenn EA die Listengröße schon geladen hat (`getPileSize` > 0, sniffer.js ~1227).
   - Eigene Angebote und Auktionen, bei denen du schon Höchstbieter bist, überspringen (`isMatch` ~2589, `isBidTarget` ~6118).

   Aufwand klein, keine zusätzlichen Anfragen.
5. **Einstellen ohne Ablehnung durch EA.** Liegt der Preis am Mindestpreis von EA, kommt der Sofortkauf-Preis eine Preisstufe darüber und das Startgebot immer darunter. Dafür eine gemeinsame Funktion für `gleichEinstellen` (~5509), `spielerEinstellen` (~4051) und `verkaufVorschlag` (popup.js ~3782). Der Verlustschutz prüft dann auch das Startgebot (~5519). Aufwand klein, weniger Fehler-Antworten.
6. **Schutz vor Preissprüngen.** Weicht ein neuer Preis um mehr als 35 % vom letzten ab, gilt beim Kaufen der kleinere und beim Verkaufen der größere der beiden Preise. Dazu der Hinweis „bitte nachmessen“, aber ohne automatische Nachmessung (`savePriceEntry` ~3361, `listPreisFuer` ~5381). Aufwand klein, 0 Anfragen.
7. **Über die EA-App suchen statt mit eigenen Anfragen.** Ab Werk schickt own-bot beim Suchen, Kaufen und Verschieben eigene Anfragen (popup.js:101 `appSuchweg:false`). MagicBuyer zeigt, wie man genau eine Kartenversion über die App sucht (`criteria.defId`). Umbau in sniffer.js `appSuche` (~1084) und content.js `appWeg` (~2189–2264). Das Verschieben läuft dann über `services.Item.move`. Aufwand mittel. Gleich viele Anfragen, aber in derselben Form wie bei der echten App. Noch ungetestet: zuerst mit einer einzigen Suche prüfen, ob alle Treffer die richtige Version sind.
8. **Preisdaten aus deinen eigenen Suchen.** Wenn du selbst in der Web App suchst, liest own-bot die Ergebnisse mit und speichert sie als Preisdaten. Der nötige Haken existiert schon (sniffer.js ~148). Aufwand mittel, 0 Anfragen.

**Optional, kostet aber mehr EA-Anfragen** (nur als Schalter, ab Werk aus):

- Abgelaufene Karten im Lauf automatisch neu einstellen: ein einziger Sammelaufruf, höchstens alle 15 Minuten.
- Käufe, für die kein Preis da war, später automatisch einstellen: eine Anfrage pro Karte.

**FUTBIN als Zweitmeinung** (großer Aufwand, nur mit deiner Zustimmung): Das spart EA-Suchen, denn ein Preis-Check kostet bis zu 15. Dagegen spricht:

- Die Nutzungsbedingungen von FUTBIN verbieten automatisches Auslesen.
- FUTBIN kann die Abrufe über Cloudflare sperren.
- Deine IP und deine Spielerliste gehen an FUTBIN.
- Die Erweiterung braucht eine neue Berechtigung.

Wenn überhaupt, dann so: Abruf aus dem Hintergrundteil der Erweiterung, ohne deine Cookies, und der FUTBIN-Preis dient nur als Vorfilter oder Anzeige, nie als Kaufpreis.

## 4. Bewusst NICHT übernehmen

- **426/461 als harmlos werten**, nach 429 automatisch weitersuchen, einen Kauf wiederholen oder zwei Käufe pro Suche machen.
- **Unhörbarer 20-Hz-Ton**, damit der Bot im Hintergrund-Tab weiterläuft. Das heißt Betrieb rund um die Uhr und ein Muster, das kein Mensch erzeugt.
- **Maximales Gebot schrittweise über dem Sofortkauf-Preis hochzählen**, um EAs Zwischenspeicher zu umgehen. So sucht kein Mensch.
- **Eingriffe in die EA-Oberfläche:** Änderungen an EAs Programmcode und eigene Knöpfe, Leisten oder Meldungen darin (Quick-List, „Sniper cette recherche“, Tab-Leiste). Das hinterlässt erkennbare Spuren.
- **Versteckte FUTBIN-Fenster**, das Mitsenden deiner FUTBIN-Cookies, eine gefälschte Herkunftsangabe beim Abruf (Referer) und Abkürzungen an Sperren vorbei („forceDirect“).
- **Mengen-Funktionen:** das SBC-Modul (bis zu 66 Suchen am Stück), Sammel-Verkauf ohne Obergrenze, ein Testsuche-Knopf, mehrere Ergebnisseiten pro Suche, das Tempo „rapide“ und frei eintippbare Wartezeiten.

## 5. Lizenz

In der package.json steht die Lizenz ISC und der Autor AMINE1921. Eine eigene LICENSE-Datei gibt es im Repository nicht. ISC erlaubt Nutzung und Änderung. Wer Code übernimmt, muss aber den Copyright- und Lizenzhinweis mitkopieren, zum Beispiel „Teile nach MagicBuyer-UT, © AMINE1921, ISC“ samt Lizenztext. Ideen, Feldnamen und Abläufe darf man frei nutzen. Am saubersten ist es, alles selbst neu zu schreiben. Fast alle Empfehlungen oben sind ohnehin eigene Umsetzungen.