# Komplettpruefung FC27 Own Bot - 23.09.2026

20 Leser-Agenten je Baustelle, jede Baustelle mit eigener Gegenpruefung, dazu 5 Quer-Kritiker.
45 Agenten, 1.566 Werkzeug-Aufrufe, 45 Minuten. 94 Funde bestaetigt, 2 widerlegt.

ACHTUNG: Die Gegenpruefung hat fast alles durchgewinkt (nur 2 widerlegt). Diese Liste ist
eine Arbeitsliste, kein Urteil. Was ICH selbst nachgeprueft habe, steht im Abschnitt
"Selbst nachgeprueft" - nur das ist hart.

## Selbst nachgeprueft (hart)

### Not-Aus und Tab-Wechsel wirken bei der Rotation nicht
- Stelle: `content.js:717`
- beschaeftigt() kennt ROTATION.aktiv nicht. Zeile 700 (Strg+Umschalt+P) und Zeile 690 (Tab nicht sichtbar) steigen deshalb in einer Rotationspause wirkungslos aus. Code gelesen und bestaetigt.

### Preis-Check sucht ohne Rating
- Stelle: `content.js:1961`
- pageSearch ruft searchPath(playerId, maxPrice, start) mit nur 3 Argumenten - rating bleibt undefined. LIVE BEWIESEN: die echte Anfrage lautete num=21&start=0&type=player&maskedDefId=204935&maxb=16750, kein ovr-Parameter. Bei einer Sonderkarte mit vielen billigen Normalversionen fuellen die falschen Versionen die 21 Plaetze.

### Kaufpreis kann ueber dem gemessenen Marktpreis liegen
- Stelle: `popup.js:689`
- Preis nach Alter darf bis +15 % ueber den Markt gehen. Mit 10 % Abschlag ergibt das Markt x 1,035 als Kaufgrenze. Nachgerechnet: Markt 10.000 -> Kaufgrenze 10.250.

### Kontostand von EA kommt nie an
- Stelle: `sniffer.js:693`
- LIVE GEMESSEN: alle vier Wege scheitern. getUser().coins liefert {type:"COINS",amount:17554} - ein Objekt, die Pruefung typeof==="number" wirft es weg. getCoins() gibt es nicht. repositories.User existiert nicht.

### Echter Fehlergrund wird verschluckt
- Stelle: `sniffer.js:409`
- LIVE: Klick auf "Verkaufte abraeumen" meldete nur "Aufruf fehlgeschlagen". Mit einer Messsonde abgefangen: TypeError aus EAs clearSoldItems. In der Konsole stand nichts.

### EAs clearSoldItems ist in dieser Version tot
- Stelle: `sniffer.js:405`
- LIVE: wirft auch mit leerer Liste, ruehrt das Argument nicht einmal an. Ersatz vorhanden und geprueft: services.Item.transfersDao.removeSold (nimmt 1 Argument).

### Preis-Gedaechtnis zaehlt beim Blaettern doppelt
- Stelle: `content.js:1668`
- LIVE MITGESCHNITTEN: num=21&start=0, dann num=21&start=20. Das 21. Angebot kommt zweimal. gedaechtnisMerken laeuft vor dem Entdoppeln nach tradeId.

### Der "Schnitt" im Gedaechtnis ist keine Marktzahl
- Stelle: `content.js:1717`
- LIVE: Pickford steht auf Schnitt 21.290, obwohl gerade 30 Angebote um 14.750 gesehen wurden - der Schnitt stieg sogar. Das Gedaechtnis mischt Suchen mit und ohne Preisgrenze in einen Topf. Damit ist auch "26 % unter Schnitt" nur Rauschen.

### Kaeufe und Aktionen haben kein Stundenlimit
- Stelle: `content.js:499`
- Nur "search" wird pro Stunde begrenzt. buy (100/Tag) und aktion (120/Tag) duerfen alle in derselben Stunde passieren: 370 Anfragen in einer Stunde, 570 am Tag. EA hat bei diesem Konto schon bei rund 450 am Tag mit 521 gesperrt.

### Doppelter Zuhoerer - NICHT reproduzierbar
- Stelle: `sniffer.js:717`
- Der Agent meldete, zwei Sniffer-Fassungen koennten jede Anfrage verdoppeln. LIVE GETESTET: genau 1 Antwort auf 1 Frage, Fassung 11. Der Fehler ist heute nicht da. Er bleibt moeglich, weil die neue Fassung den alten Zuhoerer nie abmeldet - aber er ist kein aktuelles Problem.

## Alle Funde der Flotte (ungeprueft von mir)

### HOCH (10)

**1. Kaufvorschlag kann ueber Marktpreis und billigstem Angebot liegen** — `popup.js:687` (geld)
- Ausloeser: Markt 10.000, Preis nach Alter 11.500 (das erlaubte Maximum), Abschlag 10 %, Auto-Gewinn. Nachgerechnet mit den echten Funktionen: byDiscount 10.250, byProfit 10.250, Kaufpreis 10.250 bei einem billigsten Angebot von 10.000.
- Folge: Der Bot kauft sofort das billigste Angebot zu 10.250, also 250 Coins ueber dem Marktpreis. Gewinn gibt es nur, wenn die Karte spaeter wirklich 11.500 bringt. Verkauft sie sich nur zum Markt (10.000), bleiben nach 5 % Gebuehr 9.500 - 750 Coins Verlust pro Karte. Dazu kommt: Der Abstands-Hinweis schweigt (Stufen = 0, abstandWarnung gibt "" zurueck) und die Wertung bekommt den besten Chance-Wert 1,0 
- Fix: In popup.js:689 den Marktpreis als dritte Grenze aufnehmen: `let value = Math.max(0, Math.min(byDiscount, byProfit, roundDownToStep(entry.market)));`

**2. Verkauf "Geduldig" hebt den Kaufpreis, der Bot verkauft aber billiger** — `popup.js:1554` (geld)
- Ausloeser: Filterkarte mit Marktpreis 10.000, kein Preis nach Alter, Abschlag 10 %, Auto-Gewinn. Im Fenster "Verkauf" auf "Geduldig" stellen und laden.
- Folge: Normal: Kauf bis 8.750, echter Gewinn 750. Geduldig: Kauf bis 9.000, das Fenster verspricht +975. Der Bot verkauft aber trotzdem fuer 10.000 (netto 9.500), echter Gewinn also nur 500. Der Nutzer zahlt 250 Coins mehr pro Karte und bekommt fast den doppelt angezeigten Gewinn vorgerechnet. Bei 20 Karten sind das rund 5.000 Coins.
- Fix: In popup.js:1558 den Aufschlag auf hoechstens 0 begrenzen (`const shift = Math.min(0, saleNet - base.saleNet);`), damit ein hoeher gerechneter Verkaufspreis den Kaufpreis nicht anhebt, solange der Bot beim Einstellen nur die Preis-Methode aus den Optionen kennt.

**3. Auto-Scan läuft weiter, wenn der EA-Tab nicht zu sehen ist** — `content.js:5098` (konto)
- Ausloeser: In den Optionen ist 'Filter automatisch erneuern' an. Der Nutzer wechselt in einen anderen Browser-Tab oder minimiert das Fenster. Nichts läuft gerade, keine Sperre.
- Folge: Alle 7 Minuten gehen bis zu 16 Suchen an EA, aus einem Tab, den niemand sieht. Chrome bremst in versteckten Tabs alle Zeitgeber auf höchstens einmal pro Minute. Die menschlich gedachten Pausen zwischen den Suchen werden dadurch zu einem starren Takt von genau 60 Sekunden – genau das Muster, das auffällt. Der Nutzer merkt nichts davon.
- Fix: In autoScanBereit (Zeile 5098) zusätzlich verlangen: document.visibilityState !== "hidden", genau wie in Zeile 3799.

**4. Verkaufspreis +15 % macht den Kaufpreis groesser als der Marktpreis** — `content.js:1837` (geld)
- Ausloeser: Alltagsmarkt: drei frische billige Angebote (10.000 / 10.100 / 10.200) und darueber ein lange stehendes teures (13.000). Methode "Empfohlen" (Standard), Abschlag 10 % (Standard), Auto-Gewinn an.
- Folge: Marktpreis 10.100, billigstes Angebot 10.000 - der Bot bekommt als Kaufpreis 10.250. Er kauft also 150 Coins UEBER dem Marktpreis und 250 Coins ueber dem billigsten laufenden Angebot. Muss er zum Marktpreis wieder verkaufen, sind das nach EA-Gebuehr 655 Coins Verlust je Karte. Die Leiste zeigt dabei einen Gewinn an. Bei Karten unter 1.000 Coins passiert das nicht, ab rund 1.000 Coins schon.
- Fix: In popup.js:684 den Kaufpreis nicht aus dem angehobenen Verkaufspreis rechnen, sondern aus Math.min(verkaufspreis, entry.market), damit der Abschlag wieder unter dem gemessenen Marktpreis liegt.

**5. Preis-Check sucht ohne Rating: Preis kann weit zu hoch sein** — `content.js:1961` (geld)
- Ausloeser: Preis-Check auf eine Sonderkarte (Rating 89), von der es 100 billige Normalversionen (Rating 84, 500 Coins) mit kuerzerer Restlaufzeit gibt. Von der Sonderkarte stehen zwei Angebote im Markt: 20.000 (laeuft bald ab) und 9.000 (laeuft spaeter ab). Nachgestellt im Simulator mit einem EA-Nachbau, der num/start/maxb/ovr genau wie EA beachtet.
- Folge: Der Check speichert lowest=20.000 und market=20.000, obwohl das billigste echte Angebot 9.000 kostet - 122 % zu hoch. Schlimmer: Die Kontrollmessung sieht dieselbe Luecke, findet denselben Wert, und der Eintrag wird mit rounds=2 und verified=true als geprueft abgelegt. Der Verkaufsvorschlag lautet 18.000; zu dem Preis verkauft die Karte nie. Ein Filter daraus kauft bis 20.000, obwohl es die Karte 
- Fix: In Zeile 1961 das Rating mitgeben: searchPath(player.playerId, maxPrice, start, false, player.rating) - und in Zeile 2163 entsprechend candidate.rating.

**6. Gewonnene Auktion wird nie verschoben und nie eingestellt** — `content.js:3289` (geld)
- Ausloeser: Einstellung "Nach dem Kauf" = "Gleich verkaufen" (oder "Verein"/"Transferliste"), Gebots-Sniping an, und eine Auktion wird gewonnen.
- Folge: Die Karte bleibt bei den Transferzielen liegen. Sie wird nie zum Verkauf angeboten, das Geld steckt fest. Der Nutzer muss jede gewonnene Karte von Hand abraeumen. Weil im Kauflog die itemId fehlt, findet auch der Verkaufs-Helfer die Karte nicht. Beim Sofortkauf passiert all das automatisch - der Unterschied faellt erst auf, wenn die Transferziele voll sind.
- Fix: Die itemId aus der Beobachtungsliste in noteOpenBid/applyWatchlist mitfuehren, releaseBid im "won"-Zweig asynchron machen und dort denselben Nach-dem-Kauf-Block wie executeBuy (content.js:3563-3640) ausfuehren, damit gleichEinstellen bzw. sendToPile laufen und itemId/pile/listed im Kauflog stehen.

**7. Beendete Auktion ohne bidState gilt als verloren** — `content.js:3261` (geld)
- Ausloeser: Der Bot gewinnt eine Auktion. Die Beobachtungsliste (oder ein Suchtreffer) meldet tradeState "closed", aber kein bidState. Nachgestellt in der Probe: Gebot 900, danach {tradeId, tradeState: 'closed'} -> verloren, spent bleibt 0, kein Kauflog-Eintrag.
- Folge: Ein gewonnenes Gebot wird als Verlust gebucht. Die 900 Coins sind in Wirklichkeit weg, der Bot gibt sie aber im Budget wieder frei und kauft weiter - das eingestellte Budget wird ueberschritten. Die Karte taucht weder im Kauflog noch in den Ausgaben auf, der Nutzer weiss nicht, dass sie ihm gehoert.
- Fix: In content.js:3261 und content.js:3404 bei leerem bidState nichts entscheiden, sondern null bzw. "unknown" liefern (z. B. if (closed) return overtaken ? "lost" : (bidState === "highest" ? "won" : null)), damit das Gebot in die ungeklaerten wandert und die Coins gebunden bleiben.

**8. Not-Aus wirkt in der Rotationspause nicht** — `content.js:700` (konto)
- Ausloeser: Die Rotation laeuft. Ein Filter ist fertig, die Pause vor dem naechsten Filter laeuft (25 bis 750 Sekunden, popup.js Zeile 3573-3578). In dieser Zeit drueckt der Nutzer Strg+Umschalt+P.
- Folge: Nichts passiert. Die Taste wird nicht einmal abgefangen (Strg+Umschalt+P geht an die EA-Seite durch). Die Rotation bleibt aktiv, nach der Pause startet der naechste Filter und der Bot sucht und kauft weiter. Der Nutzer glaubt, er habe gestoppt. Genau in so einer Lage (EA meldet 461, Nutzer will sofort weg vom Markt) ist das Konto in Gefahr.
- Fix: In content.js:718 beschaeftigt() um "|| ROTATION.aktiv" erweitern.

**9. Rotation: In der Pause verschwindet der Stopp-Knopf** — `popup.js:4504` (konto)
- Ausloeser: Autopilot auf "Live-Filter der Reihe nach" stellen und starten. Schon waehrend der ersten Preis-Pruefung (bis zu 180 s) und danach in jeder Pause zwischen zwei Filtern (25 s bis 5 Min., bei jedem dritten Wechsel am laengsten).
- Folge: Bis zu mehrere Minuten am Stueck laesst sich die Rotation nicht ueber die Oberflaeche stoppen. Nur der versteckte Not-Aus (Strg+Umschalt+P) oder das Schliessen des Tabs helfen. Wer eine EA-Warnung bemerkt und sofort aufhoeren will, kann es nicht - genau das ist die Lage, in der ein Konto gesperrt wird.
- Fix: In popup.js:4503-4504 dieselbe Formel wie in Zeile 3915 benutzen, also den Stopp-Knopf schon dann freigeben und zeigen, wenn st.running ODER st.rotation.aktiv wahr ist.

**10. Zwei Sniffer-Fassungen: jede Anfrage geht doppelt an EA** — `sniffer.js:717` (konto)
- Ausloeser: sniffer.js wird in eine Seite nachgeladen, in der schon Fassung 7-10 laeuft - genau der Fall, fuer den der Versionszaehler gebaut wurde (Kommentar Zeile 9-13: "genau so ist die Schnittstellen-Diagnose ins Leere gelaufen").
- Folge: Eine einzige Nachricht "appSuche?" loest zwei echte EA-Suchen aus, eine Nachricht "appKauf?" zwei echte Gebote auf dieselbe Karte. content.js zaehlt nur eine Anfrage und nimmt nur die erste Antwort. Der Bot geht also mit doppelter Anfragenrate an EA, ohne dass ein Zaehler oder eine Abkuehlung das sieht. Das ist genau das Muster, das zu 426/461 und zur wachsenden Sperre fuehrt. In meiner Probe: 2x 
- Fix: Den Zuhoerer in einer Variablen auf window ablegen (z. B. window.__fc27OwnBotSnifferOff) und ihn beim Start der neuen Fassung zuerst mit removeEventListener abmelden, bevor der neue addEventListener laeuft.

### MITTEL (54)

**1. Klick aufs Symbol oeffnet einen ZWEITEN Web-App-Tab** — `background.js:52` (konto)
- Ausloeser: Der Bot laeuft in Tab A (EA Web App). Der Nutzer liest etwas in Tab B und klickt dort auf das Bot-Symbol, um die Leiste zu holen.
- Folge: Ein zweiter EA-Web-App-Tab laedt fuer dasselbe Konto komplett neu (Anmeldung, Verein, Transferliste, Markt). Das ist ein Schwall EA-Anfragen, den der eigene Zaehler des Bots (safetyUsage) nicht sieht und nicht bremsen kann - genau waehrend der Bot kauft. Die Tab-Sperre (botBesitzer) verhindert nur einen zweiten LAUF, nicht eine zweite Web App. Das widerspricht der eigenen Regel "nur 1 Tab".
- Fix: In background.js vor dem tabs.create mit chrome.tabs.query nach einem offenen Web-App-Tab suchen und ihn bei einem Treffer nur nach vorne holen (tabs.update active) statt einen neuen zu oeffnen.

**2. Jeder Klick kann einen weiteren Bedien-Tab oeffnen** — `background.js:64` (logik)
- Ausloeser: Die Web App laedt gerade, die Leiste steht noch nicht. Der Nutzer klickt drei- bis viermal aufs Symbol, weil scheinbar nichts passiert.
- Folge: Drei bis vier Bedien-Fenster nebeneinander, dazu die Leiste in der Seite. Aendert der Nutzer in einem Fenster den Hoechstpreis und klickt danach in einem alten Fenster irgendeinen Haken an, wird der alte Hoechstpreis zurueckgeschrieben. Startet er dort, kauft der Bot zum alten Preis. Genau dieses Nebeneinander sollte der Umbau abschaffen (Kommentar background.js Z. 39-41).
- Fix: Vor dem Oeffnen mit chrome.tabs.query({ url: chrome.runtime.getURL("popup.html") }) nachsehen und einen schon offenen Bedien-Tab nur aktivieren statt einen zweiten zu oeffnen.

**3. Karte am EA-Minimum: minus-Gewinn steht gruen da, Knopf bleibt aktiv** — `popup.js:692` (anzeige)
- Ausloeser: Marktpreis 650, billigstes Angebot 650, eaMin 650 (sehr haeufig bei billigen Karten, die auf dem Preisboden liegen). Nachgerechnet: byDiscount 550, byProfit 500, danach Anhebung auf 650. saleNet 617, erwarteter Gewinn -33.
- Folge: Die Preisbox sagt gruen "Erwarteter Gewinn: -33 Coins pro Karte" und der Knopf bietet "Zielpreis uebernehmen: 650" an. Wer das nimmt und starten will, wird erst beim Start von der Gewinn-Sperre gestoppt ("Kein Gewinn bei ..."). Der Nutzer wird also erst eingeladen und dann blockiert. Coins gehen dabei nicht verloren, aber die Zahl ist falsch eingefaerbt und der Weg ist eine Sackgasse.
- Fix: Das schon berechnete Warnzeichen benutzen: in popup.js:831 `const canApply = suggestion.value > 0 && !suggestion.ohneGewinn;` und in popup.js:784 bei `suggestion.ohneGewinn` die Klasse "warn" statt "ok" setzen.

**4. Verkaufs-Kacheln kippen: Geduldig zeigt weniger als Normal** — `popup.js:303` (anzeige)
- Ausloeser: Markt 10.000, Preis nach Alter 11.500 fuer alle drei Methoden. Nachgerechnet mit sellingPrices: Schnell 9.700, Normal 11.500, Geduldig 10.500.
- Folge: Die drei Kacheln stehen in falscher Reihenfolge da. Im Filter-Dialog ist es schlimmer: Wer "Geduldig" waehlt, bekommt das Schild "hoeheres Risiko", aber in Wahrheit den niedrigeren Verkaufspreis (10.500 statt 11.500) und damit auch den niedrigeren Kaufpreis (9.300 statt 10.250). Der Nutzer waehlt also das Gegenteil von dem, was draufsteht.
- Fix: In popup.js:303 den Geduldig-Preis nie unter Normal fallen lassen: `let lazy = Math.max(recommended, Math.min(roundUpToStep(recommended0 * (rising ? 1.05 : falling ? 1.02 : 1.03)), deckel("locker")));`

**5. Sofort-Start prueft die alte Wertung, nicht die frisch gemessene** — `popup.js:2003` (logik)
- Ausloeser: Ein Filter, den die Rotation vorhin schon gefahren hat (Karte zeigt "Abkuehlung"). Rohe Wertung 4,8, Abzug 5 Filter x 10 % = 2,4, angezeigte Wertung 2,4. Im Fenster "Preise frisch pruefen" und "Sofort starten" anhaken, dann "Laden & starten". Der frische Check ergibt roh 3,5.
- Folge: Der Vergleich sieht 2,4 -> 3,5, also einen Anstieg, und stellt keine Rueckfrage. Die Sperre prueft die alte 4,8 und laesst den Sofort-Start durch, obwohl die frisch gemessene Wertung mit 3,5 unter der Grenze von 4,0 liegt. Der Bot kauft auf einem Filter los, der nach der eigenen Regel nicht von allein starten darf. Ausserdem steht in der Meldung oben im Reiter Snipen "Wertung 24 -> 35", also eine 
- Fix: In popup.js nach Zeile 2003 die Zeile `row.rohWertung = row.score;` ergaenzen (wie in der Rotation) und in popup.js:1996 fuer alt.score den Rohwert `row.rohWertung` statt der abgekuehlten Wertung nehmen.

**6. Filter aus dem Preis-Gedaechtnis lassen sich ab 15 Minuten nicht laden** — `popup.js:1643` (logik)
- Ausloeser: Karte, die der Bot vor 40 Minuten zuletzt gesehen hat und die unter ihrem ueblichen Preis liegt. Sie steht mit dem Abzeichen "Unter Schnitt" in der Liste. Auswaehlen und "Filter aktivieren" klicken.
- Folge: Beide Knoepfe im Fenster verweigern die Arbeit. Es bleibt nur der Rat "Unter Filter neu scannen" - ein Markt-Scan kostet aber viele EA-Anfragen, obwohl ein einziger Preis-Check gereicht haette. Die ganze Gedaechtnis-Liste ist damit nach 15 Minuten nur noch Deko.
- Fix: An beiden Stellen (popup.js:1643 und popup.js:1978) die Altersgrenze von row.entry.ausGedaechtnis abhaengig machen, also `row.entry.ausGedaechtnis ? TREND_MAX_ALTER_MS : 15 * 60000` statt der festen 15 Minuten.

**7. Verkaufs-Liste friert ein: Preis altert unbemerkt ueber 60 Minuten** — `popup.js:2803` (geld)
- Ausloeser: Reiter "Kaeufe" oeffnen, bei einer Karte auf "Preis pruefen" tippen, bis "Einstellen 1.500" gruen steht. Den Reiter offen lassen, Bot aus, keine Verkaufs-Aktion, keine Sperre. Nach zwei Stunden den gruenen Knopf anklicken.
- Folge: Die Karte wird mit einem zwei Stunden alten Preis bei EA eingestellt, obwohl die eingebaute Grenze 60 Minuten ist. Faellt der Markt in der Zeit, steht die Karte zu teuer und verkauft sich nicht; steigt er, wird sie zu billig verkauft. Echte Coins. Ausserdem bleibt die Zeile "Stand: vor 2 Min." fuer immer stehen und taeuscht Frische vor.
- Fix: In der Klick-Funktion des gruenen Knopfes den Vorschlag neu berechnen (const jetzt = verkaufVorschlag(item)) und nur einstellen, wenn jetzt.frisch stimmt, sonst neu zeichnen statt zu senden.

**8. Filter-Dialog bricht den laufenden Preis-Check des Verkaufs-Reiters ab** — `popup.js:2837` (logik)
- Ausloeser: Reiter "Kaeufe": bei einer Karte auf "Preis pruefen" tippen (Knopf zeigt "pruefe ... 3"). Waehrend die Pruefung laeuft auf den Reiter "Snipen" wechseln, dort eine Filterkarte antippen (Dialog geht auf) und den Dialog wieder schliessen (X, Klick daneben, oder Reiter zurueck auf "Kaeufe").
- Folge: Die laufende Preis-Pruefung wird mitten drin abgebrochen. Die bis dahin verbrauchten Suchen (bis zu 15) sind vom Tageslimit weg, ohne Ergebnis. Im Verkaufs-Reiter erscheint die irrefuehrende Meldung "Preis fuer <Name>: Kein frischer verlaesslicher Preis gefunden.", obwohl EA sehr wohl Angebote hatte. Der Nutzer tippt erneut auf "Preis pruefen" und verbraucht das Limit doppelt.
- Fix: awaitFreshPrice soll seinen Token an den Aufrufer zurueckgeben und in einer eigenen Variable je Aufrufer halten, damit closeFilterModal nur den Check abbricht, den der Filter-Dialog selbst gestartet hat.

**9. Nicht-Spieler auf der Transferliste: Abraeumen-Knopf bleibt grau** — `popup.js:2756` (logik)
- Ausloeser: Der Nutzer hat Nicht-Spieler-Karten auf dem Transfermarkt (Vertraege, Fitness, Trainer, Stadion-Zeug aus Packs). Eine davon wird verkauft. Dann Reiter "Kaeufe" -> "Aktualisieren".
- Folge: Oben steht "... 0 verkauft" und "Verkaufte abraeumen (0)" ist grau - der Nutzer kann die verkaufte Karte nicht abraeumen, obwohl der Befehl das koennte. Der Platz auf der Transferliste (max. 100) bleibt blockiert; ist sie voll, kann der Bot nichts mehr einstellen. Gleichzeitig steht direkt darunter "Echt verkauft: 1 Spieler, ... Coins nach Gebuehr", weil verkaeufe ungefiltert ist. Zwei widersprech
- Fix: Die Zaehler zahl.expired und zahl.closed ueber die ungefilterte transferliste.liste bilden und den Spieler-Filter nur fuer die gezeichneten Zeilen benutzen.

**10. Ausnahme laesst sich aus Tab 2 einschalten, waehrend der Bot laeuft** — `content.js:463` (konto)
- Ausloeser: Zwei EA-Web-App-Tabs sind offen. In Tab 1 laeuft der Bot. Der Nutzer geht in Tab 2 auf Optionen > Wartung und schaltet die Ausnahme ein.
- Folge: Das Tageslimit des LAUFENDEN Bots springt mitten im Lauf von 350 auf 500 Suchen, ohne den gewollten Zwischenschritt 'erst stoppen'. EA hat beim Nutzer schon bei rund 450 Suchen am Tag mit HTTP 521 gesperrt. Der Bot laeuft also ohne bewusste Entscheidung in genau diesen Bereich.
- Fix: In ausnahmeStarten (content.js:463) vor dem Setzen zusaetzlich 'const fremd = andererTabAktiv(); if (fremd) return { ok: false, error: fremd };' einbauen und in popup.js:2171 ebenso st.andererTab pruefen.

**11. Uhr vorgestellt: Zaehler und EA-Sperre fallen zusammen weg** — `content.js:409` (konto)
- Ausloeser: Die Uhr des Rechners springt vorwaerts: leere BIOS-Batterie, Aufwachen aus dem Ruhezustand mit falscher Zeit, Zeit-Abgleich nach einer laengeren Abweichung, virtuelle Maschine, oder der Nutzer stellt sie von Hand.
- Folge: Der Bot haelt sich fuer frei und faengt sofort wieder an, obwohl EAs eigene Sperre noch laeuft und EA die alten Anfragen noch zaehlt. Die naechste Antwort von EA ist dann die zweite Warnung in 24 Stunden - die Sperre wird nach ESKALATION_FAKTOR sechsmal so lang (bis 24 Stunden).
- Fix: Beim Laden und beim Schreiben den zuletzt gesehenen Zeitpunkt mitspeichern und, wenn Date.now() deutlich davor oder weit danach liegt, die Zaehler nicht abraeumen und die Sperre stehen lassen statt sie auslaufen zu lassen.

**12. Neustart direkt nach dem Stopp löscht den eigenen Tab-Anspruch** — `content.js:738` (konto)
- Ausloeser: Der Bot stoppt (fertig oder Stopp-Knopf). Im selben Augenblick, in dem der Herzschlag aufräumt, drückt der Nutzer Start. Das Zeitfenster ist eine Speicher-Abfrage lang (wenige Millisekunden, unter Last mehr).
- Folge: Der laufende Tab steht bis zu 5 Sekunden lang mit keinem Anspruch im Speicher. Ein zweiter EA-Tab darf in dieser Zeit starten. Dann suchen und kaufen zwei Tabs gleichzeitig – genau das Muster vom 22.09., das zur Sperre führte. Nachgespielt mit dem echten Code aus content.js: nach dem Neustart steht im Speicher 'undefined'.
- Fix: In der then-Antwort vor dem Löschen noch einmal prüfen, ob inzwischen wieder etwas läuft (if (beschaeftigt()) return;), dann erst entfernen.

**13. Not-Aus meldet nichts und stoppt den Verkaufs-Helfer nicht** — `content.js:675` (anzeige)
- Ausloeser: Der Nutzer tippt im Reiter Verkaufen auf 'Einstellen' oder 'Verkaufte abräumen' und drückt danach Strg+Umschalt+P (oder wechselt den Tab).
- Folge: Die Leiste zeigt weiter 'läuft', es erscheint keine Rückmeldung, und die Anfrage geht nach der Wartezeit trotzdem an EA. Der Nutzer glaubt, er habe alles angehalten.
- Fix: In allesAnhalten einen Abbruch-Merker für den Verkaufs-Helfer setzen, den verkaufAbstand und die laufende Aufgabe vor jeder EA-Anfrage prüfen, und die Meldung auch dann anzeigen, wenn nur VERKAUF.laeuft wahr ist.

**14. App-Weg: Seite 2 holt noch einmal Seite 1** — `content.js:1586` (logik)
- Ausloeser: Suchweg 'app' ist an, die EA-Suchseite ist offen (dann wird count von dort uebernommen, sniffer.js Z. 430 und 603-607), und ein Markt-Scan oder ein Preis-Check blaettert auf Seite 2.
- Folge: Eine von drei Scan-Anfragen bringt genau dieselben Angebote wie die vorige. Die Anfrage zaehlt auf das Tageslimit, liefert aber nichts Neues. Der Markt-Scan und der Preis-Check sehen weniger Karten als geplant, der gemessene Preis wird flacher und damit ungenauer.
- Fix: In sniffer.js das Feld "count" nicht von der offenen Suchseite uebernehmen (aus SEITEN_FELDER streichen) und vor Z.625 fest kriterien.count = 20 setzen, damit Seitennummer und offset immer zur Schrittweite von content.js passen.

**15. Schalter 'Nur mit offener Suchseite' AUS stoppt den Bot trotzdem** — `content.js:1490` (logik)
- Ausloeser: Optionen: 'Suche ueber die App' AN, 'Nur mit offener EA-Suchseite' AUS. Die Web App steht auf einer anderen Seite als der Transfermarkt-Suche. Dann Start druecken.
- Folge: Die Suche geht raus und zaehlt auf das Tageslimit, das Ergebnis wird aber weggeworfen und der Lauf bricht sofort mit 'Die EA-Suchseite ist nicht offen' ab. Der Schalter ist damit wirkungslos, und der Nutzer bekommt eine Meldung, die nicht zu seiner Einstellung passt.
- Fix: In content.js Z.1490 den Stopp an den Schalter binden: 'if (antwort.suchseite === false && suchseitePflicht()) throw new HardStop(SUCHSEITE_ZU);'

**16. 20-Sekunden-Frist deckt das Lesen der Antwort nicht ab** — `content.js:1550` (absturz)
- Ausloeser: EA (oder der Zwischenserver) schickt Status 200 und die Kopfzeilen, dann bleibt der Datenstrom stehen - typisch, wenn zwischendurch gedrosselt oder umgeleitet wird.
- Folge: Beim Kauf: executeBuy haengt in Zeile 3547. Das 'finally' in transact wird nie erreicht, transactionPending bleibt fuer immer true, und jeder neue Start wird mit 'Eine Kauf-/Gebotsantwort steht noch aus' abgelehnt (Z. 4240) - bis die Seite neu geladen wird. Beim Preis-Check: der Check haengt in Zeile 1963, die Leiste zeigt dauerhaft 'Läuft'. Genau der Zustand, den der Kommentar in Z. 1532-1534 eig
- Fix: In content.js den Inhalt noch innerhalb des try lesen (z. B. 'const text = await res.text();' vor dem finally) und den Aufrufern ein fertiges json() aus diesem Text geben, damit clearTimeout(frist) erst nach dem vollstaendigen Lesen laeuft.

**17. Restzeit ist beim Rechnen veraltet, Angebote wirken juenger** — `content.js:1818` (geld)
- Ausloeser: Preis-Check auf einen Spieler. Sechs Angebote, alle in Wahrheit 150 Sekunden alt. Gemessen wurden sie 45 Sekunden frueher, die Restzeit im Speicher passt also zu 105 Sekunden Alter.
- Folge: Mit richtiger Zeit sagt die Regel "zu alt" und setzt den Verkaufspreis auf 9.900, der Kaufpreis wird 8.800. Mit der veralteten Zeit greift die Regel gar nicht mehr, der Verkaufspreis bleibt bei 10.250 und der Kaufpreis steigt auf 9.100. Der Bot kauft 300 Coins teurer, als die Regel eigentlich wollte. Der Schutz gegen lange stehende, zu teure Angebote faellt genau an seiner Grenze aus.
- Fix: alterAuswerten einen Messzeitpunkt uebergeben und in Zeile 1818 angebotsAlterS(a.expires - (Date.now() - gesuchtUm) / 1000) rechnen, wie es restSekunden schon tut.

**18. Trend vergleicht Schnitt mit Minimum, "Unter Schnitt" fast immer** — `content.js:1718` (logik)
- Ausloeser: Bot macht einen Preis-Check auf einen Spieler. EA liefert 21 Angebote dieses Spielers, zum Beispiel 14.000 bis 20.000. Der Schnitt ist rund 17.000, das billigste 14.000.
- Folge: unter = (17.000 - 14.000) / 17.000 = 17,6 %, also ueber der Grenze von 12 %. Die Karte erscheint in der Filterliste mit dem Abzeichen "Unter Schnitt" und dem Text "X % darunter", obwohl der Markt voellig normal steht. Jeder Spieler, den der Bot einmal geprueft hat, landet so in der Trend-Liste. Der Nutzer aktiviert Filter, die kein Schnaeppchen sind; jede Aktivierung kostet einen neuen Preis-Check
- Fix: In content.js ein zweites Feld je Karte fuehren, das den Schnitt der BILLIGSTEN Angebote je Runde glaettet, und den Trend in popup.js:1217 gegen dieses Feld statt gegen den Schnitt aller Preise rechnen.

**19. Dasselbe Angebot wird mehrfach gezaehlt, Zahl "gesehen" ist zu hoch** — `content.js:1679` (anzeige)
- Ausloeser: Bot laeuft 10 Minuten auf einem Filter. Alle 4 Sekunden eine Suche, jede Antwort enthaelt dieselben 3 stehenden Angebote.
- Folge: Statt 3 stehen rund 450 im Gedaechtnis. Die Leiste sagt dann "450 verschiedene Angebote geprueft" (popup.js:793) und "450-mal gesehen" (popup.js:1105), obwohl es 3 Angebote waren. Schlimmer: der Mengen-Bonus in der Wertung nimmt genau diese Zahl (popup.js:932) und gibt ab 8 den besten Faktor 1,1. Ein Filter bekommt also einen Aufschlag auf seine Wertung, den er nicht verdient hat, und rutscht dadu
- Fix: In gedaechtnisMerken je Karte ein Set der schon gezaehlten tradeIds fuehren und ein Angebot nur beim ersten Mal in n, summe und alt aufnehmen.

**20. Abgebrochener Markt-Scan beendet den neu gestarteten Scan** — `content.js:2314` (absturz)
- Ausloeser: Markt-Scan starten, waehrend er laeuft den Tab wechseln (oder Not-Aus druecken), zurueckkommen und sofort wieder auf Scan klicken. Im Simulator nachgestellt: Scan A start, 1,5 s warten, Tab verstecken, Tab zeigen, Scan B start.
- Folge: Scan B startet sauber (running=true, Anfrage 1 von 16). 400 ms spaeter reisst Scan A ihn um: running=false, error="Live-Scan fehlgeschlagen: abgebrochen.". Die eine EA-Suche, die Scan B schon verbraucht hat, ist verloren, es wird nichts gespeichert, und der Nutzer sieht eine Fehlermeldung fuer einen Scan, der gar nicht fehlgeschlagen ist. Weil running danach false ist, darf sofort ein dritter Scan
- Fix: Im catch-Block (Zeile 2313) und im catch von startMarketScan (Zeile 2341) als erste Zeile 'if (scan.token !== token) return;' einsetzen.

**21. Leere EA-Antwort loescht die komplette Live-Filter-Liste** — `content.js:2306` (anzeige)
- Ausloeser: Erster Scan findet 20 Filter. Danach liefert EA leere Seiten (Drosselung, sehr duenner Markt in der gewuerfelten Preisklasse, oder Nachtstunden). Zweiter Scan laeuft durch. Im Simulator nachgestellt.
- Folge: Gemessen: 1. Scan = 20 Eintraege, 2. Scan (EA leer) = 0 Eintraege. Die alten 20 sind weg, die Filterseite ist leer, die Meldung lautet nur "Keine ausreichend sicheren Live Filter gefunden. Spaeter erneut versuchen." Bei eingeschalteter automatischer Erneuerung laeuft der Scan alle 7 Minuten unbeaufsichtigt - eine einzige leere Runde loescht die Arbeit der vorigen.
- Fix: Vor Zeile 2306 nur speichern, wenn etwas drin ist: 'if (results.length) await chrome.storage.local.set(...)' - bei leerer Liste nur die Meldung setzen.

**22. Verkaufs-Aktion und Markt-Scan duerfen gleichzeitig laufen** — `content.js:2327` (konto)
- Ausloeser: Bot steht (nicht running). Der Nutzer startet im Verkaufs-Reiter "Abgelaufene neu einstellen" ueber mehrere Karten. Waehrend das laeuft, klickt er auf EA-Live-Scan - oder der automatische Scan feuert von allein. Im Simulator nachgestellt: verkauf.laeuft=true UND marketScan.running=true zugleich, der Scan-Start meldet ok.
- Folge: Zwei unabhaengige Anfragestroeme aus demselben Tab. Weil keiner vom anderen weiss, koennen eine Verkaufs-Aktion und eine Markt-Suche in derselben Millisekunde bei EA ankommen und sich ueber die ganze Dauer immer wieder ueberlappen. Genau dieses Muster (mehrere Aktionen pro Sekunde) hat am 22.09. zur 426- und spaeter zur 461-Sperre gefuehrt. Beim naechsten Vorfall innerhalb von 24 Stunden waechst d
- Fix: In startMarketScan (Zeile 2327), startPriceCheck (Zeile 2075) und autoScanBereit (Zeile 5098) zusaetzlich '!VERKAUF.laeuft' pruefen.

**23. Start ist nicht gesperrt, waehrend eine Verkaufs-Aktion noch laeuft** — `content.js:4241` (konto)
- Ausloeser: Im Reiter Verkauf auf "Einstellen" tippen (oder "Verkaufte abraeumen" / "Abgelaufene neu einstellen" / "Aktualisieren") und innerhalb von rund 3 Sekunden auf Start tippen.
- Folge: Der Lauf startet, und die Einstell-Anfrage geht mitten hinein. Die erste Suche des Laufs und die Einstell-Anfrage koennen in derselben Sekunde bei EA landen - genau das Muster, das am 22.09. zu 426 und danach 461 gefuehrt hat. Zusaetzlich leert start() in Z. 4282 VERKAUF.neuVerkauft, waehrend die alte Aktion noch laeuft, und die Verkaufs-Wache ueberspringt ihren ersten Blick, weil VERKAUF.laeuft n
- Fix: In content.js bei Zeile 4241 eine Zeile ergaenzen: if (VERKAUF.laeuft) return { ok: false, error: "Eine Verkaufs-Aktion läuft noch. Gleich nochmal starten." }; und denselben Satz in popup.js startSperrGrund aufnehmen.

**24. Verkauf geht aus der Zaehlung verloren, wenn danach frisch gelesen wird** — `content.js:2505` (anzeige)
- Ausloeser: Waehrend des Laufs wird eine Karte verkauft. Der erste Blick der Wache, bei dem dieser Verkauf sichtbar wird, ist zugleich einer, bei dem ein frisches Lesen faellig ist (Transferliste ab 95 Eintraegen, oder "Gleich verkaufen" mit offenen Angeboten, und die letzten 5 Minuten kein frisches Lesen).
- Folge: Die Leiste zeigt "0 verkauft seit Start" statt 1, der Gewinn seit Start fehlt, und die Meldung "… verkauft für … Coins" erscheint weder im Protokoll noch in den Ereignissen. Im Speicher steht der Verkauf trotzdem - Reiter Verkauf und Bot-Leiste widersprechen sich also. Beim vollen Stapel ist es am schlimmsten: dort loest die volle Liste immer ein frisches Lesen aus, und genau dann werden die Karte
- Fix: Zeile 2505 anhaengen statt ueberschreiben: VERKAUF.neuVerkauft = (Array.isArray(VERKAUF.neuVerkauft) ? VERKAUF.neuVerkauft : []).concat(await verkaeufeMerken(liste));

**25. Karte zum EA-Mindestpreis laesst sich von Hand nie einstellen** — `content.js:2568` (logik)
- Ausloeser: Eine Karte, deren gemessener Marktpreis unter EAs Mindestpreis liegt (bei billigen Karten haeufig, eaMin ist dort 150 oder 200). Der Knopf zeigt dann "Einstellen 200".
- Folge: Der Nutzer tippt auf den gruenen Knopf, und der Bot antwortet "Für diesen Preis gibt es kein gültiges Startgebot.". Die Karte laesst sich mit diesem Vorschlag ueberhaupt nicht einstellen - es geht nichts an EA, und ein anderer Preis wird nicht angeboten.
- Fix: In content.js Zeile 2568 das >= durch > ersetzen, also start > sofort, genau wie im automatischen Weg in Zeile 3206.

**26. Gleich verkaufen: Verlustschutz prueft nur den Sofortkaufpreis** — `content.js:3208` (geld)
- Ausloeser: Der Bot kauft eine Karte fuer 949 Coins. Der frische Verkaufspreis ist 1000. sofort = 1000, netto = 950 > 949, also wird eingestellt. start = roundDownToStep(999) = 950. Niemand kauft sofort, aber jemand bietet einmal 950. Nach einer Stunde ist die Karte weg.
- Folge: Einnahme 950 minus 5 Prozent = 902 Coins bei 949 Coins Einkauf. 47 Coins Verlust, obwohl der Bot 'kein Verlust moeglich' verspricht. Bei teuren Karten ist die Stufe groesser: Sofort 100.000 / Start 99.500 / Kauf 94.999 ergibt 474 Coins Verlust. Nachgerechnet mit den Preisstufen aus content.js Z. 1062-1063.
- Fix: In Z. 3208/3209 statt sofort das Startgebot rechnen: netto = Math.floor(start * (1 - CONFIG.SALE_FEE)) und weiter auf netto > kaufPreis pruefen.

**27. Wandernder Mindestpreis versteckt genau die grossen Fehlpreise** — `content.js:2917` (logik)
- Ausloeser: Ein Filter mit Zielpreis 1000 Coins. Die Folge der Mindestpreise ist 150, 200, 250, 300, 350, 400, 450, 500, 0 und dann wieder von vorn (mit einer Probe nachgerechnet). Jemand stellt die Karte fuer 160 Coins ein.
- Folge: Das 160-Coins-Angebot steht nur in 2 von 9 Antworten drin. In den anderen 7 Suchen bekommt der Bot es von EA gar nicht erst geliefert und kann es nicht kaufen. Bei hohen Zielpreisen bleibt der Deckel bei 600 Coins, dort faellt es kaum auf; bei billigen Karten (Zielpreis 300 bis etwa 1300) trifft es die besten Angebote.
- Fix: In Z. 2917 den Deckel viel tiefer setzen, zum Beispiel const deckel = Math.max(Math.floor(target.maxPrice / 10), 150);, damit der Mindestpreis nie in den Bereich der grossen Fehlpreise klettert.

**28. Gewonnene Gebote zaehlen nicht als Kauf in der Statistik** — `content.js:3290` (anzeige)
- Ausloeser: Ein Lauf mit Gebots-Sniping, der 30 Minuten laeuft, zwei Auktionen gewinnt und nichts sofortkauft. In der Probe nachgestellt: spent 900, bought 0, zielBought 0.
- Folge: Die Filterkarte zeigt "0 gekauft, 0 verpasst" (popup.js Zeile 2309), "Letzter Lauf: ... 0 Kaeufe" (popup.js Zeile 826) und den Hinweis "Beim letzten Lauf gab es ... keinen Treffer" (popup.js Zeile 818) - obwohl Coins ausgegeben wurden und Karten im Konto liegen. Auch der Tacho (popup.js Zeile 4083) und die Erfolgsquote (popup.js Zeile 997-1000) zaehlen die Gewinne nicht mit. Der Nutzer wird dazu v
- Fix: Im "won"-Zweig (content.js:3289) auch run.stats.bought und progress.bought hochzaehlen und dafuer in popup.js:2525 das "+ (s.bidsWon || 0)" streichen, damit im Live-Panel nichts doppelt zaehlt.

**29. Start feuert zwei EA-Anfragen im selben Moment** — `content.js:4026` (konto)
- Ausloeser: Einstellung "Gleich verkaufen" (afterBuy="list"), im vorherigen Lauf stand mindestens eine Karte im Verkauf, letzte frische Abfrage laenger als 5 Minuten her. Dann auf Start tippen.
- Folge: Suche und Transferlisten-Abfrage gehen innerhalb von Millisekunden zusammen raus. Genau dieses Muster (zwei Anfragen in derselben Sekunde) hat laut Projekt-Gedaechtnis am 22.09. die 426-Sperre ausgeloest. Passiert bei jedem Start, nicht nur einmal.
- Fix: In verkaufsWacheAufgabe die frische EA-Abfrage beim Anlass "start" ueberspringen (Bedingung um anlass !== "start" ergaenzen) und in start() zusaetzlich offen: 0 zuruecksetzen.

**30. Stopp der Verkaufs-Wache beendet die Rotation nicht** — `content.js:4186` (logik)
- Ausloeser: Autopilot mit Rotation laeuft, Einstellung "Gleich verkaufen". Der Bot stellt Karten ein, bis die Transferliste 100 erreicht. Die Wache merkt das (im Takt alle 12 Suchen oder in der Sicherheitspause) und setzt halt mit Stufe "warn".
- Folge: Die Rotation laeuft weiter. Die Leiste holt den naechsten Filter, macht dafuer eine frische Preispruefung - das sind echte EA-Suchen - und erst danach lehnt start() den Lauf wegen der vollen Transferliste ab. Also mehrere verschenkte EA-Anfragen und eine Pause, obwohl schon feststand, dass nichts mehr geht.
- Fix: An beiden Stellen stop(haltT.text, haltT.level, false, "gesamt") bzw. stop(haltP.text, haltP.level, false, "gesamt") aufrufen.

**31. start() prueft nicht, ob eine Verkaufs-Aktion laeuft** — `content.js:4240` (konto)
- Ausloeser: Im Reiter "Verkaufen" auf "Aktualisieren" oder "Verkaufte abraeumen" tippen. Diese Aktion laeuft mehrere Sekunden (reserveUsage + 2,5-4,5 s Abstand + Anfrage). Sofort danach in den Auto-Reiter wechseln und auf Start tippen.
- Folge: Der Bot faengt an zu suchen und zu kaufen, waehrend die Verkaufs-Anfrage noch unterwegs ist. Zwei Anfrage-Stroeme gleichzeitig an EA - genau das, wovor der Tab-Waechter und verkaufSperre() sonst schuetzen.
- Fix: In start() und rotationStarten je eine Zeile "if (VERKAUF.laeuft) return { ok: false, error: \"Eine Verkaufs-Aktion läuft noch.\" };" ergaenzen und dieselbe Pruefung in startSperrGrund aufnehmen.

**32. Tab-Waechter gibt den Platz in jeder Rotationspause frei** — `content.js:729` (konto)
- Ausloeser: Tab A faehrt eine Rotation und ist gerade in der Pause zwischen zwei Filtern. Der Nutzer hat einen zweiten EA-Tab offen und drueckt dort Start.
- Folge: Tab B sieht keinen Besitzer und startet (in der Simulation geprueft: ok=true). Danach zwei Moeglichkeiten. Entweder Tab A wird beim naechsten Filter mit "Der Bot arbeitet gerade in einem anderen EA-Tab" abgewiesen - die Rotation endet still mitten im Lauf. Oder beide starten innerhalb desselben 5-Sekunden-Herzschlags, dann suchen kurz zwei Tabs gleichzeitig bei EA. Der Schutz "nur 1 Tab" hat also 
- Fix: Derselbe Fix wie bei Fund 1: ROTATION.aktiv in beschaeftigt() (content.js:718) aufnehmen, dann laeuft der Herzschlag auch in der Pause weiter.

**33. Neu-laden-Knopf ist bei Scan, Preispruefung und Verkauf frei** — `content.js:4843` (logik)
- Ausloeser: Ein Markt-Scan laeuft (bis zu 16 EA-Suchen, CONFIG.MARKET_SCAN_MAX_REQUESTS = 16). Der Nutzer klickt in der Leiste auf das Zeichen ↻.
- Folge: Die Erweiterung wird neu geladen und die Seite nach 1,2 Sekunden neu geladen. Der Scan bricht ab und speichert nichts - die bereits verbrauchten Suchen sind verschenkt und zaehlen trotzdem gegen das Tageslimit (so steht es auch im Kommentar bei Zeile 5102). Dasselbe gilt mitten in einer Preispruefung und mitten im Einstellen einer Karte (VERKAUF.laeuft) sowie in jeder Rotationspause: ein Klick bee
- Fix: In content.js:4843-4844 und 4646 statt STATE.running die vorhandene Abfrage beschaeftigt() benutzen.

**34. Punkt zeigt grau, obwohl Scan oder Rotation laeuft** — `content.js:4838` (anzeige)
- Ausloeser: Der Nutzer klappt die Leiste ein, waehrend ein Markt-Scan oder eine Rotation laeuft. Eingeklappt ist der Punkt laut Kommentar (Zeile 4802) das Einzige, was noch etwas sagt.
- Folge: Der Punkt ist grau und daneben steht nur "FC27 Own Bot" statt "FC27 Own Bot – laeuft". Der Nutzer haelt den Bot fuer gestoppt. Er schliesst den Tab, wechselt den Tab oder klickt neu laden - und wirft damit einen laufenden Scan oder eine laufende Rotation weg. Die vorhandenen Tests decken nur STATE.running ab (panel.test.cjs Zeile 365-398), Scan und Rotation kommen dort nicht vor.
- Fix: In content.js:4806, 4838 und 4840 beschaeftigt() statt STATE.running abfragen (Farbe weiter aus STATE.level).

**35. EA-Sperre ausserhalb eines Laufs meldet sich nicht** — `content.js:585` (anzeige)
- Ausloeser: Der Nutzer stellt Karten ein oder die Verkaufs-Wache arbeitet. EA antwortet mit 461 (oder 426/429/458). sperreFuerCode() -> startCooldown() setzt eine Sperre von 1 bis 24 Stunden.
- Folge: In der Standard-Einstellung kommt weder ein Fenster noch ein Ton. Der Nutzer erfaehrt von der wachsenden EA-Sperre nur, wenn er zufaellig in die Leiste schaut. Bei einem Lauf wuerde stop("error") eine Meldung schicken (content.js Z. 2877) - ausserhalb eines Laufs nicht.
- Fix: In startCooldown zusaetzlich notify("Start gesperrt fuer " + minuten + " Minuten: " + STATE.cooldownReason, "ende") aufrufen.

**36. Abkuehlung merkt sich nur Rotations-Starts, keine Hand-Starts** — `content.js:4278` (konto)
- Ausloeser: Im Filter-Reiter eine Karte waehlen, 'Filter aktivieren' und starten. Nach dem Ende dasselbe noch zwei-, dreimal mit genau demselben Spieler wiederholen - ohne die Rotation zu benutzen.
- Folge: Der Filter bekommt nie das Schild 'Abkuehlung' und nie den Punktabzug. Er bleibt ganz oben in der Liste und kann sogar 'Fuer dich' werden. Eine spaeter gestartete Rotation haelt ihn fuer unbenutzt und nimmt ihn als Ersten. Der Schutz, den das Schild verspricht ('Diesen Filter hat der Bot gerade erst benutzt. Zum Schutz deines Kontos steht er kurz hinten an.'), wirkt also nur in der Rotation. Genau
- Fix: In content.js direkt nach 'STATE.running = true' rotationMerken(result.cfg.targets[0] && result.cfg.targets[0].key) bei JEDEM Start aufrufen, nicht nur im Block 'if (rotKarte)'.

**37. Haken-Zeile in Optionen: die ganze Breite legt den Schalter um** — `popup-design.css:543` (konto)
- Ausloeser: Optionen oeffnen, Gruppe "Allgemein" aufklappen und rechts neben dem Text von "Suchen und Kaufen ueber die EA-App (neu, im Test)" in den leeren Bereich klicken - zum Beispiel beim Scrollen oder beim Zielen auf die Erklaerung darunter.
- Folge: appSuchweg springt auf AN. content.js uebernimmt das sofort ueber storage.onChanged (STATE.suchweg = "app"), auch mitten im Lauf. Der Bot wechselt auf den noch nicht live geprueften App-Suchweg; mit "Nur mit offener EA-Suchseite" haelt der Lauf an, sobald die EA-Suchseite nicht offen ist. Dieselbe Falle bei "Verkaufte automatisch abraeumen" (popup.html:561) - das schickt zusaetzliche Anfragen an E
- Fix: In popup-design.css bei .check "display: flex" durch "display: inline-flex" ersetzen (dann ist die Zeile nur so breit wie ihr Text, genau wie im Filter-Fenster).

**38. Gedaechtnis-Zeile zeigt nach einem Preis-Check falsche Prozente** — `popup.js:1104` (anzeige)
- Ausloeser: Eine Karte steht wegen des Preis-Gedaechtnisses in der Filter-Liste (Schild 'Unter Schnitt'). Fuer denselben Spieler laeuft in den letzten 15 Minuten ein Preis-Check, z. B. ueber Snipen > Manuell > Preis pruefen.
- Folge: Nachgerechnet mit echten Zahlen (Gedaechtnis Schnitt 21.226 / zuletzt 15.750 = 26 %, Messung billigstes 14.000, 6 Angebote): Die Karte schreibt 'Schnitt 21.226 - billigstes 14.000 (26 % darunter) - 6-mal gesehen'. Richtig waeren 34 %, und '6-mal gesehen' sind in Wahrheit die Angebote aus der Messung, nicht die 137 Sichtungen aus dem Gedaechtnis. Weil der Zweig frueh zurueckkehrt, fehlen ausserdem 
- Fix: In mitPreisCheck zusaetzlich 'delete neu.ausGedaechtnis; delete neu.trendUnter; delete neu.ueblich;' setzen, dann faellt die Karte in den normalen Zweig mit den gemessenen Angaben.

**39. Schild 'Nur gesehen' bleibt, obwohl der Preis frisch geprueft wurde** — `popup.js:1028` (anzeige)
- Ausloeser: EA-Markt scannen. Eine Karte mit dem Schild 'Nur gesehen' anklicken und im Dialog mit eingeschaltetem 'Preis frisch pruefen' laden.
- Folge: Die Karte behauptet weiter: 'Diese Karte stand in der Marktaufnahme, wurde aber nicht einzeln nachgeprueft. Der Preis ist nur das, was zufaellig sichtbar war.' Genau das stimmt nicht mehr. Schlimmer noch: Es gibt hoechstens zwei Schilder (Z. 1047). Das falsche Schild frisst einen der beiden Plaetze, deshalb fallen echte Hinweise wie 'Gewinn+', 'Unter Preis' oder 'Heiss' von der Karte.
- Fix: In mitPreisCheck neben preisGeprueft auch 'delete neu.nurAufnahme;' setzen.

**40. Ohne Haken "Preise pruefen" gibt es gar keinen Gewinn-Schutz** — `popup.js:5188` (geld)
- Ausloeser: Optionen: Haken "Beim Start Preise pruefen, wenn sie aelter als 15 Minuten sind" ausschalten. Dann Schritt 1 einen Spieler waehlen, Schritt 2 ueberspringen (kein Preis-Check), Schritt 3 einen Zielpreis eintippen (z. B. 500.000 statt 50.000), Budget setzen, Start-Fenster oeffnen.
- Folge: Das Start-Fenster meldet gruen "Keine Warnungen" und startet. Der Bot kauft bis zum eingetippten Preis, auch wenn die Karte nur einen Bruchteil davon wert ist. Echte Coins weg. Genauso trifft es einen alten Preis aus einer geladenen Sammlung: er wird nie nachgeprueft und nie erwaehnt.
- Fix: In der Schleife ab popup.js:5186 statt "if (!stand) continue;" eine Warnung setzen, zum Beispiel: wenn kein Stand da ist, warnings.push(wer + ": Fuer diesen Spieler gibt es noch keinen gemessenen Marktpreis - der Gewinn-Schutz kann nichts pruefen.").

**41. "Zur Liste hinzufuegen" loescht die Live-Filter-Daten eines Ziels** — `popup.js:2419` (geld)
- Ausloeser: Unter "Filter" einen Live-Filter laden (er steht dann als Live-Ziel in der Liste). In Schritt 3 den Zielpreis im Feld aendern und "Zur Liste hinzufuegen" druecken - oder im Start-Fenster den Knopf "Liste auf ... aendern" (Zeile 5462, ruft dasselbe addTarget).
- Folge: Drei Dinge auf einmal: (a) Der Gewinn-Schutz aus dem Live-Filter ist weg, ein Zielpreis ueber dem Verkaufserloes wird nicht mehr rot gesperrt. (b) Der mitgebrachte Verkaufspreis ist weg, deshalb stellt "Gleich verkaufen" nach dem Kauf nichts mehr ein (startRun Zeile 4970 faellt auf marktwertFuer zurueck, das ohne Preis-Check 0 liefert). (c) Das Ziel gilt nun als "alter Preis" und kostet vor dem na
- Fix: In popup.js:2419 zusammenfuehren statt ersetzen: targets[index] = { ...targets[index], ...target };

**42. Kontostand unbekannt: Rotation findet 0 Filter, nennt aber den Markt-Scan** — `popup.js:3557` (logik)
- Ausloeser: Kontostand ist unbekannt (Kachel "Coins" zeigt "–", z. B. direkt nach dem Laden der Seite oder wenn EA die Kopfzeile umbaut). Dann im Autopilot den Schalter "Rotation" einschalten.
- Folge: Der Knopf "Mehrere Filter nacheinander starten" bleibt grau und darunter steht "Gerade gibt es keinen passenden Live-Filter. Scanne den EA-Markt im Reiter Filter." Der Nutzer scannt daraufhin den Markt neu - das kostet bis zu 12 bis 15 EA-Anfragen und aendert nichts, weil die Ursache der fehlende Kontostand ist.
- Fix: popup.js:3540 nur echte Zahlen annehmen: const muenzen = letzterStatus && typeof letzterStatus.credits === "number" ? letzterStatus.credits : NaN;

**43. Such-Schaetzung zaehlt die Preis-Nachpruefungen vor dem Start nicht mit** — `popup.js:5153` (anzeige)
- Ausloeser: Zielliste mit 3 Spielern, deren Preise aelter als 15 Minuten sind. Haken "Beim Start Preise pruefen" an. "Suchen je Spieler" auf 100. Start-Fenster oeffnen.
- Folge: Die Kachel zeigt "~300 dieser Lauf", in Wahrheit sind es bis zu 345. Steht der Zaehler "letzte Stunde" z. B. bei 100 von 150, bleibt der Hinweis "Mit diesem Lauf erreichst du wahrscheinlich das Stundenlimit" aus, obwohl schon die Nachpruefungen allein ans Limit fuehren. Der Nutzer unterschaetzt seine Anfragenlast - genau die Zahl, an der die EA-Sperre haengt.
- Fix: Die Nachpruefungen mitzaehlen: den Haken (nachpruefen) vor Zeile 5153 lesen und plannedSearches = requested * Math.max(1, list.length) + (nachpruefen ? Math.min(altePreise(list).length, MAX_AUTO_CHECKS) * 15 : 0) rechnen.

**44. Falsche Warnung: "Gleich verkaufen" stellt Live-Filter sehr wohl ein** — `popup.js:5122` (anzeige)
- Ausloeser: Unter "Filter" einen Live-Filter mit ausgeschaltetem Haken "Preise frisch pruefen" laden (oder ueber "Trotzdem laden"), sodass kein Eintrag im Preisverlauf entsteht. Dann "Gleich verkaufen" waehlen und das Start-Fenster oeffnen.
- Folge: Im Start-Fenster steht gelb: "Gleich verkaufen ist gewaehlt, aber fuer keinen Spieler gibt es einen Preis, der hoechstens 60 Minuten alt ist. Es wird dann nichts eingestellt." Das stimmt nicht - der Bot stellt ein. Der Nutzer laesst deshalb entweder einen unnoetigen Preis-Check laufen (bis zu 15 EA-Suchen) oder schaltet "Gleich verkaufen" ab, obwohl es funktioniert hat.
- Fix: popup.js:5122 auf preisStandFuer umstellen: const ohne = list.filter((t) => Date.now() - preisStandFuer(t) > LIST_PREIS_FRISCH_MS);

**45. Rotation: Der Nutzer erfaehrt nie, warum sie endet** — `popup.js:3401` (anzeige)
- Ausloeser: Budget-Feld leeren, Autopilot auf "Live-Filter der Reihe nach" stellen und auf "Mehrere Filter nacheinander starten" klicken. Dasselbe passiert bei jedem anderen Abbruchgrund: "Fuer einen weiteren Filter reicht das Suchbudget nicht mehr", "Der Start hat nicht geklappt", Fehler der Preis-Pruefung, Blocker aus startPruefung.
- Folge: Der Knopf tut scheinbar nichts. Der Nutzer klickt erneut, wieder ohne Wirkung und ohne Erklaerung. Bei einem unbeaufsichtigten Lauf sieht er spaeter nur, dass die Rotation aus ist, aber nicht, ob sie fertig ist, ob das Suchbudget alle war oder ob EA gemeckert hat.
- Fix: Im finally-Block statt autoFehler = "" den Grund uebernehmen (autoFehler = rotationText) und ihn zusaetzlich in der Laufanzeige oder oben im Kopf ausgeben, damit er den Wechsel zurueck auf die Einstellungen ueberlebt.

**46. Rotation waehlt Filter nach vollem Budget, faehrt mit Restbudget** — `popup.js:3679` (logik)
- Ausloeser: Budget 20.000, Rotation laeuft. Filter 1 kauft dreimal fuer je 6.000 (18.000 ausgegeben). Der naechstbeste Filter hat Zielpreis 5.000. Er bleibt in der Auswahl (5.000 < 20.000), bekommt aber nur noch 2.000 Coins Budget mit.
- Folge: content.js lehnt den Start ab ("Budget muss mindestens so hoch sein wie der hoechste Zielpreis"), startRun gibt false zurueck und die Rotation bricht sofort ganz ab - obwohl noch zehn Filterplaetze und billigere Filter da waeren. Zusammen mit dem Fund "Der Nutzer erfaehrt nie, warum sie endet" sieht man davon nichts.
- Fix: In rotationKandidaten (popup.js:3539) dasselbe Restbudget benutzen wie in Zeile 3679, also Feldwert minus rot.ausgegeben, dann faellt ein zu teurer Filter schon bei der Auswahl heraus.

**47. Markt-Zahl haengt am Budget-Knopf des Nutzers** — `popup.js:4213` (anzeige)
- Ausloeser: Nach einem Markt-Scan stehen z. B. 8 Filter in der Liste. Der Nutzer klickt in der Filter-Leiste auf "Niedrig" (popup.html Z. 461, Knopf-Horcher popup.js Z. 4786).
- Folge: Die Kachel "Markt" faellt innerhalb von 1,5 Sekunden von 94 auf 75 (selbst nachgerechnet mit dem Tacho-Block: filter=8 -> 94 "sehr gut", filter=2 -> 75 "gut", filter=0 -> 69). Am Markt hat sich nichts geaendert - nur ein Ansichts-Knopf. Der Nutzer haelt den Markt fuer schlechter geworden und hoert auf.
- Fix: In Zeile 4213 liveFilterRows(true).length benutzen, so wie es die Rotation in Zeile 3548 schon tut.

**48. "Naechstes gutes Fenster" schickt weg, obwohl es JETZT ist** — `popup.js:4201` (anzeige)
- Ausloeser: Der Bot lief in der aktuellen Stunde gut (mindestens 30 Suchen in dieser Stunde gespeichert), und diese Stunde steht in tachoBesteStunden() ganz vorn. Nutzer oeffnet die Kachel "Markt".
- Folge: Selbst nachgerechnet, 10 Uhr, eine beste Stunde (10 Uhr, 10,0 Treffer je 100 Suchen): Das Feld "Naechstes gutes Fenster" zeigt "10 Uhr (in 24 Stunden)". Mit einer zweiten, schlechteren Stunde (4 Uhr, 1,0 Treffer je 100 Suchen) zeigt es "4 Uhr (in 18 Stunden)". Direkt darunter steht "Deine besten Stunden bisher: 10 Uhr". Der Nutzer stoppt in seiner besten Stunde oder plant nachts um 4 Uhr einen Lau
- Fix: Die Schleife bei i = 0 beginnen lassen und fuer i === 0 den Text "jetzt gerade" ausgeben.

**49. Ungeprueft gemerkte Filter zaehlen als "aus dem Markt-Scan"** — `popup.js:4248` (anzeige)
- Ausloeser: Kein Markt-Scan gelaufen (oder ein alter), aber das Preis-Gedaechtnis hat mehrere Karten unter ihrem ueblichen Preis. Nutzer oeffnet die Kachel "Markt".
- Folge: Im Detail-Fenster steht z. B. "Filter: 6 brauchbare Filter aus dem letzten Markt-Scan", obwohl kein einziger davon gemessen wurde. Diese 6 heben die Markt-Zahl um bis zu 19 Punkte. Der Nutzer haelt den Markt fuer ergiebig und startet, obwohl keine frische Messung vorliegt.
- Fix: Fuer den Tacho die Zeilen mit entry.preisGeprueft === false getrennt zaehlen und im Text als "davon N ungeprueft (aus dem Preis-Gedaechtnis)" ausweisen.

**50. Markt-Satz behauptet Stundenvergleich, rechnet aber 6 Stunden** — `popup.js:4187` (logik)
- Ausloeser: Vor 4 und 5 Stunden lief es sehr gut (je 8 Treffer je 100 Suchen), in der laufenden Stunde gar nichts (10 Suchen, 0 Treffer). An den Vortagen lag diese Stunde bei 1 Treffer je 100 Suchen.
- Folge: Selbst nachgerechnet: trefferQuote = 7,62, ueblich = 1,0, Faktor 7,6. Das Markt-Fenster meldet "Lebhafter Markt: mehr Treffer als sonst um 10 Uhr." - obwohl in dieser Stunde genau null Treffer da waren. Der Nutzer laesst den Bot weiterlaufen und verbraucht Suchen aus dem Tagesbudget ins Leere.
- Fix: marktZustand() mit der Trefferquote der laufenden Stunde aufrufen (tachoLaeufe(TACHO_STUNDE)) statt mit der 6-Stunden-Quote.

**51. Tacho setzt 50 Punkte fuer eine Erfolgsquote, die er selbst nicht hat** — `popup.js:4241` (logik)
- Ausloeser: Frischer Start: 20 Suchen in den letzten 6 Stunden, kein einziger Treffer, 8 Filter aus dem Gedaechtnis in der Liste.
- Folge: Selbst nachgerechnet: Die Kachel zeigt 38 und das Wort "mittel" - bei null Treffern. Davon kommen 12,5 Punkte aus der erfundenen 50 und 25 Punkte aus der Filter-Zahl. Mit einem einzigen Treffer aus 20 Suchen springt die Zahl auf 69 "gut". Der Nutzer liest "mittel/gut" und startet einen langen Lauf in einen toten Markt.
- Fix: Bei tag.treffer < 3 den Erfolgs-Anteil ganz weglassen und die Note nur aus Treffer und Filter bilden (Gewichte 2/3 und 1/3), statt 50 zu erfinden.

**52. Eigenes Fenster: ein Befehl kann in den falschen EA-Tab gehen** — `popup.js:2950` (geld)
- Ausloeser: Die Leiste laedt in Tab A nicht, deshalb oeffnet der Klick aufs Symbol die Bedienung als eigenen Tab (background.js:64). Der Bot laeuft in Tab A. Der Nutzer oeffnet oder aktiviert einen zweiten Web-App-Tab B und drueckt dann in der Bedienung auf Stopp.
- Folge: content.js in Tab B beantwortet "stop" mit { ok: true, status } und running:false. Die Bedienung zeigt "gestoppt" an. Der Bot in Tab A kauft unbeaufsichtigt weiter, mit echten Coins. Auch alle Zahlen im Kopf (gekauft, ausgegeben, Suchen heute) stammen dann von Tab B und sehen harmlos aus.
- Fix: Den beim ersten erfolgreichen probeBot gefundenen tab.id in einer Variablen merken und in send() wiederverwenden, solange dieser Tab noch antwortet.

**53. Verkaufs-Zeile: der Gewinn gilt nur fuer einen Teil der Verkaeufe** — `popup.js:6050` (anzeige)
- Ausloeser: Waehrend eines Laufs stehen eigene Karten aus Packs oder SBCs (EA meldet dort lastSalePrice 0, also kein Kaufpreis) zusammen mit Bot-Kaeufen auf der Transferliste. Es verkaufen sich 3 Pack-Karten und 1 Bot-Karte.
- Folge: In der Leiste steht "4 verkauft seit Start · +250 Gewinn". Die 250 gehoeren nur zu 1 der 4 Verkaeufe. Der Nutzer haelt den Lauf fuer viel schwaecher, als er ist, und entscheidet danach, ob er weiterlaufen laesst oder den Preis aendert.
- Fix: In popup.js:6050 den Gewinn-Text um die Anzahl ergänzen, also " · +X Gewinn (aus " + w.mitKauf + " von " + w.anzahl + ")", wenn w.mitKauf kleiner als w.anzahl ist.

**54. Seitenzahl aus fremdem count: Suche kann doppelt rausgehen** — `sniffer.js:625` (konto)
- Ausloeser: Die offene EA-Suchseite hat einen anderen count als 20 - z. B. 21, und genau 21 Treffer liefert EA laut dem eigenen Kommentar in content.js Zeile 1605 ("EA liefert nur 21 Treffer"). Dann ist bei start=20: Math.floor(20/21)+1 = Seite 1, waehrend offset auf 20 steht. Seitenzahl und offset widersprechen sich.
- Folge: Nimmt die App die Seitenzahl, holt der Bot beim Blaettern zweimal dieselbe erste Seite. Jede dieser Suchen zaehlt bei EA auf das Tageslimit und bei uns als Suche - bei ~450 Suchen am Tag kam schon eine Sperre. Nimmt die App den offset, stimmt die Seitenzahl nicht. In beiden Faellen werden Anfragen verschenkt oder Angebote uebersprungen.
- Fix: In appSuche den uebernommenen count auf die Schrittweite von content.js setzen (kriterien.count = 20) und die Seite daraus rechnen, damit Seite und offset immer zusammenpassen.

### NIEDRIG (30)

**1. Stumme Benachrichtigung, obwohl gar kein Ton kommt** — `background.js:19` (anzeige)
- Ausloeser: Der Nutzer bedient den Bot ueber den eigenen Bedien-Tab, den background.js Z. 64 oeffnet, und startet dort. In der EA-Seite selbst wurde nie geklickt, der AudioContext bleibt darum gesperrt.
- Folge: Beim Kauf spielt der Bot keinen Ton (tonSpielen faellt in den suspended-Zweig), und die Windows-Meldung kommt mit silent: true. Der Nutzer hoert gar nichts, obwohl er "Ton bei Kauf" eingeschaltet hat.
- Fix: content.js soll den Rueckgabewert von tonSpielen in der notify-Nachricht mitschicken und background.js soll silent nur daran festmachen.

**2. Kachel Schnell zeigt 0 bei sehr billigen Karten** — `popup.js:302` (anzeige)
- Ausloeser: Marktpreis 150 (stabil) oder Marktpreis 200 bei fallender Tendenz, und im Preis-Eintrag fehlt die EA-Preisspanne (eaMin = 0, dann greift die Klammer in Zeile 304 nicht). Nachgerechnet: sellingPrices gibt safe = 0 zurueck.
- Folge: In der Preisbox steht bei "Schnell" die Zahl 0 Coins. Im Filter-Dialog waere der Verkaufspreis im Modus Schnell dann 0 und der Gewinn negativ. Geladen wird so ein Filter nicht (die Ladepruefung faengt maxPrice = 0 ab), es bleibt also eine falsche Anzeige.
- Fix: In popup.js:306 den kleinsten gueltigen Marktpreis als Boden setzen: `return { safe: Math.max(150, safe), recommended, lazy };`

**3. Abgebrochene Preis-Pruefung laeuft bei EA weiter (nicht im Dialog)** — `popup.js:1956` (konto)
- Ausloeser: EA antwortet langsam (die Leiste zeigt "EA-Antwortzeit ... ungewoehnlich langsam"). Ein Start mit altem Preis oder die Rotation startet eine Preis-Pruefung. Nach 180 Sekunden gibt die Oberflaeche auf.
- Folge: Die Oberflaeche meldet "Preispruefung dauert zu lange" bzw. "Die Preispruefung wurde abgebrochen", in der Seite laufen aber weiter EA-Suchen bis zum Limit von 15 Anfragen. Der Nutzer denkt, es ist Ruhe, und startet moeglicherweise gleich den naechsten Versuch. Zusaetzliche Anfragen sind genau das, was zu 429/461 fuehrt.
- Fix: In popup.js awaitFreshPrice in ein try/finally legen, das bei jedem Ausstieg (Abbruch in der Schleife und 180-Sekunden-Grenze) cancelFilterPriceCheck() aufruft, solange filterPriceCheckToken noch gesetzt ist.

**4. Gruener Knopf mit 150 Coins, den EA nie annimmt** — `popup.js:2644` (logik)
- Ausloeser: Billige Karte mit Marktpreis 200, deren billigstes Angebot schon lange unverkauft steht, und fuer die die Web App keine Preisspanne mitliefert (_itemPriceLimits fehlt, eaMin = 0). Nachgerechnet in der Probe: roh = 150, Untergrenze = 150, Vorschlag = 150.
- Folge: Der Knopf steht gruen da und verspricht "Einstellen 150" mit "nach 5 % Gebuehr bleiben 142". Jeder Klick darauf wird von content.js mit "Der Sofortkaufpreis passt nicht." abgelehnt. Die Karte laesst sich ueber den Helfer gar nicht einstellen, und ein erneutes "Preis pruefen" liefert wieder 150. Der Nutzer sucht den Fehler bei sich.
- Fix: In verkaufVorschlag nach den eaMin/eaMax-Zeilen den Preis auf mindestens 200 anheben und den gruenen Knopf nur zeichnen, wenn der Preis danach nicht ueber eaMax liegt.

**5. Spielerliste wird ungezaehlt und trotz Sperre von ea.com geladen** — `content.js:1280` (konto)
- Ausloeser: EA hat gerade gesperrt (zum Beispiel HTTP 521, 2 Stunden Abkuehlung), der Nutzer laedt die Web-App neu, und die Erweiterung hat die Spielerliste noch nicht gesehen (PLAYERS.seen ist falsch).
- Folge: Waehrend einer laufenden EA-Sperre gehen weiter Anfragen an ea.com raus, ohne dass sie in irgendeinem Zaehler auftauchen. Die Anzeige 'Heute X von 350 Suchen' ist damit nicht vollstaendig.
- Fix: In playerListFallback gleich nach der Zeile mit PLAYERS.seen zusaetzlich 'if (cooldownBlock()) return;' einbauen.

**6. Bei Speicherfehler geht die Limit-Meldung (HardStop) verloren** — `content.js:537` (logik)
- Ausloeser: chrome.storage.local.set schlaegt fehl, zum Beispiel weil die Erweiterung gerade neu geladen wurde ('Extension context invalidated') - und gleichzeitig ist ein Limit erreicht.
- Folge: Statt 'Tageslimit erreicht' zeigt der Bot einen technischen Fehler. Stellen, die eigens auf HardStop pruefen und dann ruhig weitermachen (content.js:2637 und content.js:3429), erkennen ihn nicht mehr und werfen den Fehler stattdessen in die Lauf-Schleife, wo er als Suchfehler gezaehlt wird.
- Fix: In content.js:535 das Speichern absichern, also 'await chrome.storage.local.set({ safetyUsage: data }).catch((e) => warn("Zaehler nicht gespeichert: " + e.message));', damit die Kette bis zum HardStop in Zeile 538 durchlaeuft.

**7. updateStorage meldet Erfolg, obwohl nichts gespeichert wurde** — `content.js:388` (anzeige)
- Ausloeser: Das Schreiben in chrome.storage schlaegt fehl (Erweiterung neu geladen, Speicher voll) genau in dem Moment, in dem ein Kauf ins Kauflog soll.
- Folge: Der Kauf ist bezahlt, taucht aber in der Kaufliste nicht auf. Der Nutzer sieht weniger Kaeufe und weniger Ausgaben, als wirklich passiert sind, und rechnet seinen Gewinn falsch. Gemeldet wird nur eine Zeile in der Browser-Konsole.
- Fix: In updateStorage die beiden Versprechen trennen: das Ergebnis der Schreib-Kette an den Aufrufer zurueckgeben (mit Fehler) und nur die intern gemerkte storageChain per .catch beruhigen, damit spaetere Schreiber weiterlaufen.

**8. Beim Schliessen löscht ein Tab auch den Anspruch eines fremden Tabs** — `content.js:752` (konto)
- Ausloeser: Zwei Tabs starten im selben Augenblick (das ist erlaubt, siehe Test 'starten zwei Tabs gleichzeitig'). Tab A verliert und stoppt bei seiner nächsten Anfrage. Sein Herzschlag-Zeitgeber läuft aber noch bis zu 5 Sekunden weiter. Der Nutzer schliesst daraufhin Tab A.
- Folge: Der Eintrag des noch laufenden Tabs B wird gelöscht. Bis zu 5 Sekunden lang steht kein Anspruch im Speicher. Ein weiterer offener EA-Tab könnte in dieser Lücke starten, obwohl B arbeitet.
- Fix: Beim Schreiben des eigenen Eintrags einen Merker setzen (BESITZ.eigen = true) und ihn löschen, sobald besitzUebernehmen einen fremden Eintrag sieht; im pagehide dann diesen Merker statt BESITZ.timer prüfen.

**9. Haengendes Nachladen sperrt die Spielerliste bis zum Neuladen** — `content.js:1280` (logik)
- Ausloeser: Eine der aus der Resource-Liste gefundenen JSON-Adressen antwortet nicht mehr (Server haengt, Verbindung bricht halb weg). Der erste Versuch laeuft 5 Sekunden nach dem Laden.
- Folge: PLAYERS.loading bleibt fuer immer true. Die spaeteren Versuche nach 15 und 45 Sekunden und der Versuch aus der Bedienung steigen in Zeile 1271 sofort wieder aus. Die Namenssuche im Panel bleibt leer, bis der Nutzer die Seite neu laedt - ohne Hinweis, woran es liegt.
- Fix: In content.js Z.1280 dem fetch ein 'signal' eines AbortControllers mitgeben, der nach CONFIG.REQUEST_TIMEOUT_MS abbricht, damit die Schleife zur naechsten Adresse weitergeht.

**10. Erste Sichtung setzt den Schnitt ohne Glaettung, Ausreisser wirkt lange nach** — `content.js:1717` (logik)
- Ausloeser: Ein Markt-Scan sieht eine Karte zum ersten Mal, und zwar genau das eine ueberteuerte Angebot: 12.000 Coins, obwohl die Karte sonst 3.000 kostet. Danach wird sie dreimal normal bei 3.000 gesehen.
- Folge: Nach der 4. Sichtung steht im Gedaechtnis ein "ueblicher Preis" von 6.087 statt 3.000. Der Trend rechnet daraus 50,7 % unter dem Schnitt und stellt die Karte ganz oben in die Filterliste. Der Verkaufspreis selbst bleibt richtig (der ist seit dem 23.09. auf das billigste Angebot gedeckelt), aber die Reihenfolge der Filter und der Text "X % billiger als sonst" sind falsch. Erst nach rund 8 Sichtunge
- Fix: In content.js:1717 die ersten Runden nach Anzahl gewichten (k.mittel = (k.mittel * alteRunden + mittelNeu) / (alteRunden + 1)) statt die erste Sichtung eins zu eins zu uebernehmen.

**11. Markt-Aktivitaet im Preis-Check ist immer "unbekannt"** — `content.js:2040` (anzeige)
- Ausloeser: Jeder normale Preis-Check. Im Simulator gemessen: messAbstandMs = 9000 bei einer Schwelle von 60000.
- Folge: entry.activity steht praktisch immer auf "unbekannt". Die drei zusaetzlichen EA-Suchen der Kontrollmessung liefern die versprochene Marktaktivitaet nie - sie bestaetigen nur den Preis. Das Menue zeigt dem Nutzer bei jeder Karte "unbekannt", obwohl der Code drei Stufen kennt. Die Zahlen turnoverRate und disappeared werden dagegen weiter benutzt, die sind nicht betroffen.
- Fix: Entweder ACTIVITY_MIN_GAP_MS auf einen erreichbaren Wert senken (etwa 8000) oder die Aktivitaets-Auswertung ganz herausnehmen, weil der Abstand konstruktionsbedingt nur Sekunden betraegt.

**12. Volle Transferliste: Bot schickt die Karte trotzdem dorthin** — `content.js:3589` (konto)
- Ausloeser: Einstellung 'Gleich verkaufen' (afterBuy = list), Transferliste steht auf 100. Der Bot kauft eine Karte. platzProblem meldet 'voll', gleichEinstellen bricht ab, gleich darauf laeuft sendToPile(won.id, 'trade').
- Folge: Eine EA-Anfrage, von der man vorher weiss, dass sie scheitert. Sie verbraucht einen Platz im Tageslimit 'Aktionen' und wird von EA mit 473 (DESTINATION_FULL) beantwortet. Der Lauf endet dann mit 'Ziel ist voll' statt mit dem klaren Grund 'Transferliste voll'.
- Fix: In Z. 3587 die Bedingung erweitern: if (!angebot && !clubStop && !platzProblem({ afterBuy: "transfer" })) { ... }, damit bei voller Transferliste gar nicht erst verschoben wird.

**13. Nach dem Kauf: Verschieben prueft nicht, ob gestoppt wurde** — `content.js:3600` (konto)
- Ausloeser: Einstellung 'nach dem Kauf in den Verein'. Der Bot kauft, wartet 5 bis 6,5 Sekunden. In dieser Zeit drueckt der Nutzer Stopp oder Not-Aus.
- Folge: Die Verschiebe-Anfrage geht trotzdem noch an EA. Nach einem Not-Aus soll gerade nichts mehr rausgehen. Sie zaehlt zusaetzlich aufs Tageslimit 'Aktionen'.
- Fix: In Z. 3601 vor das Verschieben die gleiche Bremse setzen: if (!isCurrent(run.token)) club = "gestoppt"; else club = await sendToPile(won.id, pile, target.key);

**14. Restzeit im offenen Gebot ist die veraltete Zahl aus der Suche** — `content.js:3239` (anzeige)
- Ausloeser: Mehrere Gebotsziele in einer Suche: das zweite und dritte Gebot gehen erst nach 3-5 Sekunden Pause raus, bekommen aber die alte Restzeit.
- Folge: expiresAt liegt zu spaet. Die Anzeige "noch X Sekunden" beim offenen Gebot (Zeile 4320) ist zu hoch, die Faelligkeitspruefung in settleViaWatchlist (Zeile 3418) und expireBids (Zeile 3444) greifen spaeter als noetig - die Coins bleiben laenger gebunden als sie muessten.
- Fix: gesuchtUm von content.js:3499 bis in executeBid und noteOpenBid durchreichen und dort restSekunden(auction, gesuchtUm) statt secondsLeft(auction) verwenden (auch fuer den Text in content.js:3718 und das bidLog in content.js:3723).

**15. Endmeldung verschweigt das Tageslimit je Karte** — `content.js:4061` (anzeige)
- Ausloeser: Auf dieselbe Karte wurden heute schon 20 Kauf- oder Verkaufs-Aktionen gezaehlt (ueber mehrere Laeufe hinweg leicht erreicht). Danach einen neuen Lauf mit genau dieser Karte starten.
- Folge: Der Lauf endet fast sofort mit "Fertig: Alle Spieler haben ihre Grenze erreicht (je Spieler 5 Kaeufe, 40 Suchen)", obwohl in diesem Lauf 0 Kaeufe und 0 Suchen gemacht wurden. Der Nutzer sucht den Fehler bei den falschen Einstellungen und schraubt die Grenzen hoch, was nichts bringt.
- Fix: Vor dem stop() zaehlen, wie viele Ziele cardCount(key) >= CONFIG.CARD_LIMIT_DAY haben, und den Satz um "oder ihr Tageslimit von 20 Aktionen je Karte ist erreicht" ergaenzen.

**16. Letzter Filter fehlt in der Rotations-Summe** — `content.js:4203` (anzeige)
- Ausloeser: Rotation laeuft, der letzte Filter endet mit einem Gesamt-Stopp - zum Beispiel "Restbudget reicht nicht" oder eine EA-Sperre.
- Folge: Die Rotations-Zeile in der Leiste zeigt zu wenig ausgegebene Coins, zu wenig Suchen und zu wenig Kaeufe. Der Nutzer denkt, er habe noch Luft, obwohl das Geld schon weg ist.
- Fix: Die Bedingung auf "if (run.rotationKarte && (run.rotationKarte === ROTATION.karte || run.rotationKarte === ROTATION.karte - 1))" aendern, damit auch der beendete letzte Filter noch gebucht wird.

**17. Stopp nach dem Stopp-Knopf ueberschreibt die Meldung** — `content.js:4185` (logik)
- Ausloeser: Der Bot ist in einer Sicherheitspause. Die Wache hat waehrenddessen festgestellt, dass die Transferliste voll ist (halt gesetzt). Der Nutzer tippt in derselben Sekunde auf Stopp oder loest den Not-Aus aus.
- Folge: stop() laeuft trotzdem noch einmal. Die Meldung des Nutzer-Stopps wird durch "Gestoppt: Die Transferliste ist voll ..." ersetzt, STATE.letzterStopp wird ueberschrieben und STATE.token ein zweites Mal hochgezaehlt. Wird in diesem kurzen Fenster (bis 250 ms) schon wieder gestartet, beendet der alte Lauf den neuen sofort wieder.
- Fix: Die Zeile "if (!isCurrent(token)) break;" direkt hinter "const haltP = await wache;" und damit vor den stop()-Aufruf ziehen.

**18. Rechte fuer ganz www.ea.com, gebraucht wird nur die Web App** — `manifest.json:8` (logik)
- Ausloeser: Dauerzustand. Chrome zeigt dem Nutzer "Daten auf www.ea.com lesen und aendern" fuer die gesamte Domain; jede EA-Seite (auch die Kontoseite) darf die Bot-Dateien abrufen.
- Folge: Mehr Rechte als noetig und eine zusaetzliche, sichere Erkennungsmoeglichkeit fuer EA von JEDER ea.com-Seite aus, nicht nur von der Web App. Mit dem engeren Muster waere die Web App weiter voll bedienbar.
- Fix: In manifest.json bei host_permissions und bei web_accessible_resources.matches das Muster auf https://www.ea.com/*ultimate-team/web-app* verengen.

**19. Schriftstufe misst das Browserfenster statt der Leiste** — `popup-design.css:170` (anzeige)
- Ausloeser: Das Browserfenster ist zwischen 400 und 443 Pixel breit. Dann greift bei der Leiste "max-width: 90%", sie wird 360 bis 399 Pixel schmal. Die Medienabfrage feuert aber erst ab 399 Pixel Fensterbreite und bleibt aus.
- Folge: Die Leiste behaelt die grosse Schriftstufe, obwohl sie schmaler als 400 Pixel ist. Nach der eigenen Messung im Kommentar (Zeile 166: "390px Reiter laeuft ueber") laufen dort die Reiterbeschriftungen ueber. Der Bereich ist schmal und an einem normalen Bildschirm schwer zu erreichen - deshalb nur niedrig. Der Mechanismus selbst ist sicher falsch, nicht nur moeglich.
- Fix: Auf :host "container-type: inline-size" setzen und die Regel von @media auf "@container (max-width: 399px)" umstellen, damit die Leiste sich selbst misst.

**20. Sofort-Start urteilt nach der Wertung von VOR dem Preis-Check** — `popup.js:1894` (logik)
- Ausloeser: Eine Karte mit einer Wertung knapp unter 4,0 im Dialog oeffnen, 'Preis frisch pruefen' und 'Sofort starten' angehakt, und die Messung faellt besser aus als der Scan (Wertung steigt ueber 4,0).
- Folge: Der Bot startet nicht und meldet 'Nicht gestartet: Die Wertung liegt unter 4,0', obwohl die Karte daneben schon die hoehere Wertung zeigt. Das ist die harmlose Richtung. Die unsichere Richtung gibt es auch: Steht auf dem Filter gerade eine Abkuehlung, ist row.score (mit Abzug) kleiner als row.rohWertung. Dann kann die Rueckfrage 'Wertung unter 4,0 gefallen' ausbleiben (sie vergleicht row.score, Z.
- Fix: In popup.js bei Zeile 2002 zuerst 'row.rohWertung = filterScore(row.entry, row.suggestion);' setzen und row.score daraus ableiten, genau wie in der Rotation.

**21. Gedaechtnis-Filter bekommen den Mengen-Bonus aus der falschen Zahl** — `popup.js:1286` (logik)
- Ausloeser: Jeder Filter aus dem Preis-Gedaechtnis (Schild 'Unter Schnitt'). Nach ein paar Suchen steht n fast immer ueber 8.
- Folge: Praktisch jeder Gedaechtnis-Filter bekommt dauerhaft den Hoechstwert 1,1 beim Teil 'Menge' und damit rund 3 % mehr Wertung als ihm zusteht - ausgerechnet bei den Filtern, bei denen nichts gemessen ist. Dieselbe Verwechslung steckt in der Huerde TREND_MIN_GESEHEN = 4 ('so oft muss die Karte gesehen worden sein'): Gemeint sind in Wahrheit 4 gesehene Angebote insgesamt, das erreicht eine einzige Such
- Fix: In trendZuEintrag 'marktAngebote: t.gesehen' weglassen (oder auf 0 setzen), damit die Wertung fuer Gedaechtnis-Filter keinen Mengen-Bonus aus einer alten Summe zieht.

**22. Start-Pruefung liest Budget und Max. Kaeufe immer aus den Feldern** — `popup.js:5147` (anzeige)
- Ausloeser: Rotation laufen lassen, bis das Restbudget unter den Zielpreis des naechsten Filters faellt (z. B. Budget 20.000, schon 18.000 ausgegeben, naechster Filter Zielpreis 9.000).
- Folge: startPruefung sieht das volle Feld-Budget (20.000) und sperrt nicht. Der Start geht an content.js, dort greift validateConfig und meldet "Budget muss mindestens so hoch sein wie der hoechste Zielpreis (9000)." Die Rotation bricht mit diesem technischen Satz ab, statt klar zu sagen: "Budget aufgebraucht." Zusaetzlich rechnen die Hinweise zu "Max. Kaeufe" und zum Tageslimit der Kaufversuche mit der 
- Fix: In popup.js:5147-5148 dieselbe Hilfsfunktion benutzen: const budget = Number(feld("budget")) || 0; const maxBuys = Number(feld("maxBuys")) || 0;

**23. Rotation startet Filter, die im selben Moment ablaufen** — `popup.js:3671` (logik)
- Ausloeser: Ein Filter wurde vor 14 Minuten frisch geprueft (preisGeprueft, Sicherheit mittel oder hoch) und steht mit der besten Wertung oben. Die Rotation waehlt ihn, macht keine neue Pruefung und startet ihn mit expiresAt = jetzt + 1 Minute.
- Folge: Der Bot stellt sofort fest, dass der Filter abgelaufen ist ("Fertig: Der Live-Filter ist abgelaufen"), ohne eine einzige Suche. Der Filterplatz ist trotzdem verbraucht (von hoechstens 12) und danach laeuft die volle Pause von 25 s bis 5 Min. Mehrere solcher Filter hintereinander verbrauchen eine Stunde und alle 12 Plaetze, ohne dass ein einziges Mal gesucht oder gekauft wird.
- Fix: In preisReichtAus (popup.js:3533) PRICE_FRESH_MS deutlich kleiner setzen als LIVE_FILTER_MS, zum Beispiel 10 Minuten, damit ein fast abgelaufener Filter vor dem Start neu geprueft wird und mit frischem expiresAt losfaehrt.

**24. Angesagte lange Pause wird still auf 5 Minuten gekuerzt** — `popup.js:3578` (anzeige)
- Ausloeser: Feld "Pause (Sekunden)" auf 120 stellen (erlaubt sind 25 bis 300) und die Rotation laufen lassen, bis der dritte Filter fertig ist.
- Folge: Die Leiste schreibt "Pause vor dem naechsten Filter: 420 Sekunden", tatsaechlich startet der naechste Filter nach 300 Sekunden. Bei 300 Sekunden Einstellung steht dort 1050 Sekunden statt 300. Der Schutz, den der Nutzer eingestellt hat (lange Pause nach jedem dritten Filter), findet nicht statt, und die Anzeige stimmt nicht.
- Fix: In popup.js:3707 nicht die gerechnete Zahl ansagen, sondern die vom Bot bestaetigte (aus gesetzt beziehungsweise rot.pauseBis), damit Ansage und Wartezeit dieselbe Zahl sind.

**25. Rotations-Streifen zeigt Wertung ohne den Abkuehl-Abzug** — `popup.js:3777` (anzeige)
- Ausloeser: Ein Filter lief gerade und kuehlt ab (rohWertung 90, Abzug 27, also score 63). Ein zweiter Filter hat rohWertung 70 und keinen Abzug.
- Folge: Der Streifen stellt den zweiten Filter nach vorn (score 70 vor 63), zeigt bei ihm aber "7,0" und beim hinteren "9,0". Der Nutzer sieht eine kleinere Zahl vor einer groesseren und keinen Hinweis auf die Abkuehlung - und kann die Reihenfolge, in der die Rotation arbeitet, nicht nachvollziehen.
- Fix: In popup.js:3777 row.score anzeigen statt row.rohWertung, damit die Zahl zur Reihenfolge passt.

**26. Blatt "Heute" mischt Mitternacht und rollende 24 Stunden** — `popup.js:3844` (anzeige)
- Ausloeser: Der Bot lief gestern Abend von 20 bis 23 Uhr mit 300 Suchen. Der Nutzer oeffnet die Kachel "Heute" am naechsten Morgen um 8 Uhr.
- Folge: Das Blatt zeigt "Gekauft: 0 Spieler" und "Ausgegeben: 0 Coins" (seit Mitternacht), gleichzeitig aber "Suchen heute: 300 / 350". Der Nutzer denkt, das Tagesbudget habe um Mitternacht neu begonnen und der Zaehler sei kaputt - oder er plant einen Start kurz nach Mitternacht mit vollem Budget und wird dann vom Limit gestoppt. Die Grenze ist genau der Konto-Schutz.
- Fix: Die vier usage-Zeilen umbenennen in "Suchen (letzte 24 Std.)", "Kaufversuche (letzte 24 Std.)" usw., damit klar ist, dass sie nicht um Mitternacht auf null gehen.

**27. Zweiter EA-Tab: Knoepfe bleiben gruen, erst der Bot lehnt ab** — `popup.js:3117` (anzeige)
- Ausloeser: Zwei EA-Web-App-Tabs offen. In Tab A laeuft ein Preis-Check oder ein Lauf, dieser Tab haelt damit den Besitz fuer 15 Sekunden. In Tab B auf "Preis pruefen", "EA-Markt live scannen", "Autopilot starten" oder "Sniping vorbereiten" klicken.
- Folge: Die Knoepfe sehen frei aus, die Hinweiszeile darunter bleibt leer. Erst NACH dem Klick kommt die Absage "Der Bot arbeitet gerade in einem anderen EA-Tab. Dort stoppen oder den Tab schliessen." Der Nutzer klickt in der Annahme, es haenge, mehrfach nach.
- Fix: In startSperrGrund vor "if (st.running)" die Zeile "if (st.andererTab) return st.andererTab;" einfügen.

**28. "Suchseite pruefen" verschluckt den Fehler der Bruecke** — `popup.js:6034` (anzeige)
- Ausloeser: Der EA-Tab wurde gerade neu geladen oder die Erweiterung neu gestartet, die Verbindung steht noch nicht. Dann Optionen, Gruppe "Allgemein", Knopf "Suchseite pruefen".
- Folge: "Wird geprueft ..." verschwindet nach spaetestens 1,5 Sekunden (naechster Poll) ersatzlos. Kein Ergebnis, kein Fehler, kein Hinweis auf die fehlende Verbindung. Der Nutzer klickt erneut und weiss nicht, warum nichts passiert.
- Fix: In popup.js:6034 die Antwort auffangen und bei res.ok === false den Fehlertext in das Feld schreiben (feld.className = "hint err"), statt sie wegzuwerfen.

**29. Bruecke nimmt Befehle von jedem Skript der EA-Seite an** — `sniffer.js:718` (konto)
- Ausloeser: Ein zweites Skript in der EA-Seite sendet window.postMessage({__ownbot:"appSuche?",...}) und danach {__ownbot:"appKauf?", tradeId, betrag}. In meiner Probe hat genau das ein echtes Gebot ueber 999999 ausgeloest.
- Folge: Echte EA-Suchen und echte Gebote in beliebiger Hoehe, komplett an den Schutzlimits, der Abkuehlung und der Tab-Sperre von content.js vorbei (die stecken alle in content.js, nicht hier). verkaufAktion("einstellen") prueft im Sniffer gar keine Preise - anders als appEinstellen, das start>0 und sofort>=start prueft (Zeile 550). Umgekehrt gilt dasselbe: content.js glaubt jeder Antwort aus der Seite, u
- Fix: Ein Zufalls-Geheimnis beim Laden erzeugen, es content.js einmal zuschicken und danach jede Nachricht in beide Richtungen verwerfen, die dieses Geheimnis nicht mitbringt; ausserdem in verkaufAktion("einstellen") dieselbe Preispruefung wie in Zeile 550 einbauen.

**30. Tippfehler im Muster: der Seitenname wird nie erkannt** — `sniffer.js:429` (anzeige)
- Ausloeser: Der Nutzer klickt in den Optionen auf "Suchseite pruefen", waehrend die EA-Suchseite offen ist.
- Folge: In der Leiste steht "Die EA-Suchseite ist offen (t). Der Bot darf suchen." statt eines verstaendlichen Seitennamens. Kein Geld- und kein Kontorisiko, aber die Anzeige hilft bei der Fehlersuche nicht mehr - und der Name wird auch sonst nirgends geprueft.
- Fix: In Zeile 429 "w*" zu "\\w*" korrigieren.

## Quer-Kritiker

### konto (8)
- **[hoch]** Kein Gesamt-Deckel: 570 EA-Anfragen am Tag sind erlaubt — `content.js:98`
  - Alle Zaehler stehen im gruenen Bereich, die Leiste meldet kein Problem - und EA sperrt trotzdem. Nach der zweiten Sperre am selben Tag wird die Pause sechsmal so lang, nach der dritten 24 Stunden.
- **[hoch]** Kaeufe und Aktionen haben kein Stundenlimit: 370 in einer Stunde — `content.js:522`
  - Der Bot feuert eine Stunde lang mit voller Kraft, die einzige Bremse (Suchen pro Stunde) merkt davon nichts. Sehr hohe Gefahr fuer 426/429 und danach 461.
- **[mittel]** Derselbe Knopf-Aufruf zaehlt mal als Suche, mal als Aktion — `content.js:2522`
  - 120 echte EA-Anfragen in rund 7 Minuten, ohne dass irgendeine Stundenbremse anspricht. Das ist rund 17 Anfragen pro Minute - genau das maschinenhafte Muster, das am 22.09. zu 426 gefuehrt hat.
- **[hoch]** Zwei EA-Tabs: die Zaehlung verliert Anfragen — `content.js:325`
  - Die Tageszahl in der Leiste ist zu niedrig. Der Bot glaubt, er haette noch Luft, und sucht weiter, obwohl das echte Limit laengst ueberschritten ist. Der Schutz, der das Konto retten soll, meldet Entwarnung.
- **[mittel]** Jede gespeicherte Einstellung startet 3 Sekunden spaeter einen Markt-Scan — `content.js:5148`
  - Bis zu 5 mal 16 = 80 EA-Suchen, ohne dass der Nutzer irgendwo "Scannen" gedrueckt haette. Bei zwei offenen Tabs das Doppelte, und die Anfragen der beiden Tabs gehen paarweise im selben Sekundenbruchteil raus - genau das Muster, auf das EA mit 426 reagiert hat.
- **[mittel]** Auto-Scan darf allein 250 von 350 Tagessuchen aufbrauchen — `content.js:5116`
  - 250 echte EA-Anfragen ohne einen einzigen Klick. Das ist mehr als die Haelfte der rund 450, bei denen EA schon einmal mit 521 gebremst hat. Fuer den eigentlichen Bot bleiben danach nur noch 100 Suchen am Tag uebrig.
- **[mittel]** Nach abgelehntem Einstellen geht das Verschieben ohne Pause raus — `content.js:3589`
  - Zwei schreibende EA-Aktionen im selben Sekundenbruchteil, kurz nach der Kauf-Anfrage. Das ist genau das Tempo, das am 22.09. zu 426 gefuehrt hat (zwei Kaeufe pro Sekunde).
- **[mittel]** Volle Transferliste hebelt beide Bremsen der Verkaufs-Wache aus — `content.js:2679`
  - In jeder Sicherheitspause geht eine zusaetzliche echte EA-Anfrage raus, dauerhaft, statt hoechstens 6 im ganzen Lauf. Es bleiben nur noch die Warnschwellen (120 pro Stunde, 250 am Tag) als Bremse.

### geld (4)
- **[hoch]** Rating leer: Sonderkarte wird zum Preis der Billig-Version verkauft — `content.js:3167`
  - Die Karte wird sofort fuer rund 600 Coins eingestellt statt fuer rund 18.000. Netto 570 ist groesser als der Kaufpreis 400, also greift der Verlustschutz nicht. Rund 17.000 Coins Verlust bei EINEM Kauf - und der Bot meldet ihn als Gewinn.
- **[mittel]** Verkaufs-Reiter: gruener Einstellen-Knopf mit dem Preis einer fremden Version — `popup.js:2630`
  - Der Knopf zeigt "Einstellen 600", obwohl die Karte 18.000 wert ist. Ein Klick verkauft die Karte weit unter Wert. Die kleine Gewinn-Zahl daneben sieht dabei sogar positiv aus, weil sie nur gegen den Kaufpreis rechnet.
- **[mittel]** Verkaeufe fallen aus der Gewinn-Zaehlung, wenn zweimal gelesen wird — `content.js:2505`
  - Der Verkauf zaehlt nicht in "N verkauft seit Start", der Erloes und der Gewinn in der Laufleiste sind zu niedrig, und die Meldung "X verkauft fuer Y Coins" samt Ton und Benachrichtigung bleibt aus. Der Verkauf selbst geht nicht verloren (er steht in der Ablage), nur die Anzeige und der Gewinn des La
- **[mittel]** Eigener Wunschpreis zaehlt als Marktwert - Gewinn fuer nie verkaufte Karten — `popup.js:2462`
  - Die Kopfzeile "Geschätzter Gewinn" und das Blatt "Heute" rechnen dauerhaft mit floor(13.000 x 0,95) - 10.000 = +2.350, obwohl gemessen nur floor(11.500 x 0,95) - 10.000 = +925 gewesen waeren und in Wirklichkeit gar nichts verkauft wurde. Der Gewinn springt im Moment des Einstellens nach oben und ble

### absturz (5)
- **[hoch]** Nach dem Kauf: ein Fehler beim Einstellen loescht den Kauf-Eintrag — `content.js:3581`
  - Die Karte ist gekauft und bezahlt, wird aber weder eingestellt noch auf die Transferliste verschoben - sie bleibt still bei den Transferzielen liegen. Im Kauflog fehlt sie ganz. Oben steht trotzdem "1 Kauf", der Reiter Kaeufe zeigt nichts, und der "Geschaetzte Gewinn" rechnet ohne sie. Der Lauf stop
- **[mittel]** Startkette der Leiste ohne catch: Einstellungen bleiben still auf Standard — `popup.js:6164`
  - Die Leiste sieht voellig normal aus und meldet "Verbunden", weil setInterval(poll, 1500) unabhaengig weiterlaeuft. Aber loadSettings hat die gespeicherten Werte nie in die Felder geschrieben: Budget, Max. Kaeufe, Laufzeit, Suchen je Filter, alle Haken (auch "Gleich verkaufen" und "Verkaufs-Wache") u
- **[mittel]** poll() ohne catch: eine Ausnahme friert die ganze Anzeige ein — `popup.js:4563`
  - Der Teil der Anzeige nach der Bruchstelle friert ein: Status-Text, Stopp-Knopf ($("stop").hidden = !st.running), Kontostand, Zaehler und die Limit-Zeile bleiben auf dem letzten Stand stehen. Der Bot in content.js laeuft dabei unbeaufsichtigt weiter und kauft weiter. Der Nutzer sieht eine tote, aber 
- **[niedrig]** Leiste laedt bei jedem Start ungezaehlt eine Seite von ea.com — `popup.js:358`
  - Waehrend einer Sperre geht trotzdem eine Anfrage an ea.com. Sie trifft nicht die Handels-Schnittstelle (/ut/game/...), sondern nur die HTML-Seite, ist also kein direkter Kontoschaden - aber es ist Verkehr, den der Bot in dieser Zeit gar nicht erzeugen soll, und er taucht in keiner Zaehlung auf.
- **[niedrig]** Preis-Gedaechtnis: bei einem Speicherfehler sind bis zu 200 Karten weg — `content.js:1697`
  - Bis zu 200 Karten verlieren ihre frisch gesammelten Preis-Punkte. Der Nutzer sieht nur eine Warnung in der Konsole; die Anzeige "offen" faellt auf 0, als waere alles gesichert. Die Live-Filter aus dem Gedaechtnis rechnen danach mit aelteren Zahlen.

### testluecken (12)
- **[hoch]** Rotation: die ganze Rotations-Schleife rotationLauf() hat keinen Test — `popup.js:3598`
  - Jeder Fehler beim Weiterreichen von Budget, Laufzeit und Kaeufen zwischen zwei Filtern faellt erst im echten Lauf auf - mit echten Coins. Auch dass das Ergebnis von rotWarten weggeworfen wird (Zeile 3697), kann kein Test bemerken.
- **[mittel]** Rotation: das Suchbudget je Filter wird von keinem Test nachgerechnet — `popup.js:3529`
  - Die Rotation plant einen weiteren Filter mit bis zu 40 Suchen, obwohl das Stundenlimit fast erreicht ist. Gestoppt wird sie dann erst von reserveUsage in content.js - also mit einem Lauf, der sofort wieder abbricht.
- **[hoch]** Verkauf: "Gleich verkaufen" ist in keinem Lauf durchgespielt — `content.js:3566`
  - Die Karte ist bezahlt. Ob sie danach wirklich auf die Transferliste wandert oder still bei den Transferzielen liegen bleibt, sichert kein Test ab. Auch die Felder listed/listPrice im Kauflog - die Grundlage der Gewinnanzeige - sind ungeprueft.
- **[hoch]** Verkaufs-Wache: die Bremse fuer echte EA-Abfragen wird nie geprueft — `content.js:2680`
  - Rutschen die beiden Bremsen einmal durch, stellt die Wache bei jedem Blick eine echte EA-Anfrage. Genau solche Anfragen-Schwaelle haben am 22.09. zur Sperre gefuehrt. Kein Test wuerde das merken.
- **[hoch]** Verkauf: die Bruecke zu den EA-Diensten in sniffer.js ist ungetestet — `sniffer.js:398`
  - Waeren Start- und Sofortpreis vertauscht, stellte der Bot die Karte zum Startgebot ein - ein echter Coin-Verlust bei jeder Karte. Der Test-Satz wuerde trotzdem komplett gruen bleiben.
- **[mittel]** Verkauf: "Abgelaufene neu einstellen" hat keinen einzigen Test — `content.js:2589`
  - Ein Sammel-Auftrag an EA, dessen Sperre, Zaehlung und Preisfolge niemand absichert. Karten koennen zu einem Preis wieder im Markt stehen, der inzwischen zu hoch ist, und die Anfrage zaehlt moeglicherweise anders als gedacht.
- **[hoch]** App-Suchweg: die Felder der offenen Suchseite werden nie mitgetestet — `sniffer.js:603`
  - Die Seitenzahl wird falsch gerechnet: Der Bot holt dieselbe Seite zweimal (eine verschenkte Anfrage und ein maschinenhaftes Muster) oder ueberspringt eine. Zusaetzlich sucht er still enger, als der Filter sagt. Kein Test schlaegt dabei an.
- **[mittel]** App-Suchweg: das Tor "Suchseite offen?" ist selbst ungetestet — `sniffer.js:456`
  - Entweder haelt der Bot die Suchseite faelschlich fuer offen und uebernimmt fremde Filter, oder er haelt sie fuer geschlossen und stoppt jeden Lauf. Beides faellt erst live auf.
- **[mittel]** App-Suchweg: Einstellen ueber die App ist nirgends getestet — `content.js:1470`
  - Findet die App die Karte nicht im Speicher, kommt "Karte nicht im Speicher der App" zurueck. Ob der Bot die Karte dann wenigstens auf die Transferliste schiebt, sichert kein Test ab - die Karte koennte unverkauft liegen bleiben.
- **[mittel]** Gebote: die Schlussabrechnung am Ende des Laufs laeuft in keinem Test — `content.js:4212`
  - Ein Zuschlag, der erst nach dem Stoppen sichtbar wird, koennte im Kauflog und in den Ausgaben fehlen. Ausserdem wird WATCHLIST.lastAt hier auf 0 gesetzt - dass diese zusaetzliche EA-Anfrage wirklich nur einmal kommt, prueft niemand.
- **[niedrig]** Gebote: ein von EA abgelehntes Gebot wird von keinem Test abgedeckt — `content.js:3707`
  - Die Auktion ist fuer den Rest des Laufs blockiert, obwohl kein Gebot steht. Ein guenstiges Angebot wird dadurch nicht mehr gekauft.
- **[hoch]** Markt-Scan: ein geprueftes Scan-Ergebnis entsteht in keinem Test — `content.js:2266`
  - Die Entscheidung "dieser Filter darf sofort starten" haengt an ungetestetem Code. Ein Fehler dort setzt preisGeprueft faelschlich auf true - dann kauft der Bot nach einem Preis, den er gar nicht sicher gemessen hat. Das kostet Coins.

### zusammenspiel (4)
- **[hoch]** Zweiter Tab: Klick auf "Käufe" stoppt den laufenden Bot im ersten Tab — `content.js:730`
  - Die naechste Suche in Tab 1 laeuft in api() (content.js:1505/1506) in "andererTabAktiv" und wirft HardStop. Die Schleife faengt ihn und ruft stop(..., "error") - Stufe "error" heisst Code "gesamt", also endet auch die ganze Rotation. Der unbeaufsichtigte Lauf ist weg, Meldung: "Der Bot arbeitet gera
- **[mittel]** Einstellungen aus einem zweiten Tab werden still zurueckgesetzt — `popup.js:2926`
  - Der alte Stand von Tab 1 ueberschreibt die Aenderung. applyAutomationSettings schaltet autoFilters wieder ein und ruft scheduleAutoScan - der automatische Markt-Scan macht dann wieder ohne Klick bis zu 16 echte EA-Suchen je Durchgang, obwohl der Nutzer ihn gerade abgeschaltet hat. Genauso kippen "Ve
- **[mittel]** Zweiter Blick in "Käufe" loescht die gemerkten Verkaeufe des Laufs — `content.js:2505`
  - Die zwischendurch verkauften Spieler fallen aus "N verkauft seit Start" und aus dem Gewinn dieses Laufs heraus, und die Meldung "X verkauft für Y Coins" erscheint nie im Verlauf. Die Zahlen in der Leiste sind zu niedrig. Der Verkauf selbst und der Eintrag im Speicher "verkaeufe" bleiben richtig.
- **[mittel]** Filter-Fenster schliessen bricht den Preis-Check der Rotation ab — `popup.js:1934`
  - content.js beendet die laufende Preis-Pruefung (content.js:4932-4936). awaitFreshPrice findet danach keinen frischen Eintrag und wirft "Kein frischer verlässlicher Preis gefunden.". Dieser Fehler wird in rotationLauf vom aeusseren catch gefangen - damit endet nicht nur dieser eine Filter, sondern di

## Widerlegt

- **Spielerliste wird im Takt komplett neu durch die Seite geschickt**: Widerlegt in der beschriebenen Form. Der Mechanismus stimmt zwar (Zeile 766 schickt bei jedem "session?" die Liste erneut, und content.js:4300 fragt nur solange, wie es keine Sitzung kennt). Aber es sind keine Megabyte und es wird nichts neu zerlegt. Der Sniffer merkt sich nur die ZULETZT gesehene D
- **upgradePageConnection laedt den EA-Tab neu, auch mitten im Lauf**: Der Code stimmt, aber der beschriebene Auslöser kann nicht eintreten. legacy wird nur true, wenn probeBot mit dem alten Befehlsnamen "status" antwortet. Das heutige content.js nimmt aber ausschliesslich Befehle mit Vorsilbe "v11/" an und antwortet auf ein blankes "status" gar nicht (content.js:4989)

## Was geprueft und fuer gut befunden wurde

### Limits und Nutzungszaehler
GEPRUEFT UND IN ORDNUNG (Bereich content.js 336-560 plus alle Aufrufstellen): 1) Ist reserveUsage wirklich unteilbar? JA. Ich habe den echten Abschnitt aus content.js herausgeschnitten und in einer Sandbox laufen lassen (Hilfsdatei limits-probe2.cjs im Kratzpapier-Ordner). 10 gleichzeitige Suchen bei Stand 345 von 350: genau 5 gingen durch, 5 wurden gestoppt, gespeichert waren danach 350. 10 gleichzeitige Kaeufe bei 99 von 100: genau 1 ging durch. Die Warteschlange usageChain haelt Lesen-Aendern-Schreiben sauber hintereinander. Kein doppelt vergebenes Kontingent. 2) Kann ein Zaehler ueberlaufen? NEIN. Alle Listen werden in pruneUsage hart gekappt: Suchen auf 500 (350 + Ausnahme 150), Kaeufe auf 100, Aktionen auf 120, je Karte auf 20. Ich habe 130 gespeicherte Kaeufe und 25 Karteneintraege eingespeist - beides wurde korrekt gekappt und die Grenze hielt. 3) Ausnahme vom Tageslimit: sauber. Mit Ausnahme sind 500 Suchen erlaubt, die 500. wird abgelehnt. Laeuft die Ausnahme ab, waehrend der Stand bei 500 steht, sperrt der Bot mit "Tageslimit erreicht: 350 Suchen" - genau wie im Kommentar beschrieben. Die Kappung auf 500 statt 350 ist dafuer noetig und richtig. pruefeAusnahme nimmt keine zu grossen und keine zu langen Werte an. 4) Tageswechsel, Sommerzeit, Zeitzone: kein Problem. Gerechnet wird in einem gleitenden 24-Stunden-Fenster auf Millisekunden seit 1970. Mitternacht, Sommerzeit-Umstellung und Zeitzonen-Wechsel aendern daran nichts. Nur ein echter Sprung der Rechner-Uhr wirkt (siehe Fund 2). 5) Zeitstempel aus der Zukunft (Uhr war vor, wurde korrigiert): bleiben laenger als 24 Stunden stehen und zaehlen weiter mit. Das ist die vorsichtige Richtung - der Bot sucht dann eher zu wenig als zu viel. Kein Fund, nur erwaehnt. 6) Zaehlt jede EA-Anfrage? Ich bin alle Wege durchg

### Sperren, Abkuehlung, Tab-Besitz
GEPRUEFT UND IN ORDNUNG: - Wachsende Sperre: Der Faktor 6 greift richtig. "frueher" wird VOR vorfallMerken gezaehlt, die erste Warnung bekommt also die Grundzeit (60 Min.), die zweite 6 Std., die dritte wird bei 24 Std. gedeckelt. Abgesichert durch konto-schutz.test.cjs ("zweite Warnung ... sechsmal so lang", "dritte Warnung hoechstens 24 Stunden", "Warnung von vor mehr als 24 Stunden zaehlt nicht mehr"). - Neuladen der Seite loescht eine laufende Sperre NICHT: startCooldown schreibt sofort in chrome.storage, loadCooldown holt sie beim Laden zurueck, und eine laufende Sperre ohne Vorfall zaehlt als ein Vorfall (Zeile 632). Getestet in cooldown.test.cjs und konto-schutz.test.cjs. - sperreUebernehmen verlaengert nur, verkuerzt nie, und stoppt einen laufenden Lauf sofort. Muell im Speicher (null, Text, {}, "bald") sperrt nichts; eine Sperre weiter als 7 Tage in der Zukunft wird verworfen. Alles getestet. - cooldownBlock wird auf jedem Weg zu EA geprueft: api() (Z. 1503), reserveUsage (Z. 506), Bot-Start (Z. 4231), Preis-Check (Z. 2069), Markt-Scan (Z. 2322), Verkauf (Z. 2448 und 2536), Verkaufs-Wache (Z. 2644 und 2795). Keine Luecke gefunden. - Der Verkaufs-Weg meldet Sperr-Codes ebenfalls (verkaufStatusPruefen -> sperreFuerCode). Das kostenlose Lesen aus dem Speicher der App kann KEINE falsche Sperre ausloesen: Fehlertexte ohne Ziffern ("keine Daten", "kein Dienst") ergeben Code 0, und 0 steht nicht in COOLDOWN_CODES. - Alle vier Aufrufe von besitzAntreten (Z. 2087, 2345, 2480, 4285) setzen ihr Laufen-Kennzeichen VORHER. besitzMelden schreibt dort also wirklich den Anspruch und raeumt ihn nicht versehentlich weg. - Ein toter Tab blockiert hoechstens 15 Sekunden, ein geschlossener gibt sofort frei - beides getestet. - Mehrere Antworten mit Sperr-Code kurz hintereinander ko

### API-Schicht, App-Weg, Endpunkte
GEPRUEFT UND IN ORDNUNG: 1) Geht jede Antwort durch apiAntwortPruefen? Ja, innerhalb von api(): der App-Weg in Z. 1530 ('return apiAntwortPruefen(res);') und der direkte Weg in Z. 1561. Es gibt keinen zweiten Weg zur EA-Schnittstelle in content.js: die einzigen weiteren fetch-Aufrufe sind das Nachladen der Spielerliste (Z. 1280, eine statische Datei) und popup.html/popup-design.css aus der Erweiterung selbst (Z. 4761/4762). Verkauf und Transferliste laufen nicht ueber api(), pruefen die Codes aber selbst: verkaufStatusPruefen -> sperreFuerCode (Z. 2458-2461, 2498, 2542). Die Abkuehlung greift dort also auch. Die Fehlermeldung der Seite ist dabei so gebaut, dass genau eine Zahl drinsteht ('EA hat abgelehnt (461)', sniffer.js Z. 381), das Herausziehen der Ziffern in Z. 2497 liefert deshalb den richtigen Code. 2) Kann appWeg etwas durchlassen, das weder Suche noch Gebot ist? Nein. Nur drei Faelle kommen durch: GET auf genau ENDPOINTS.searchPath (Z. 1435), bidMethod auf bidPath mit einer reinen Zahl dazwischen (Z. 1460-1462, Muster /^\d{1,20}$/), und listMethod auf listPath mit plausiblem Inhalt (Z. 1470-1481). Alles andere gibt null. Der Vereinspfad ('/item', PUT) kollidiert nicht mit dem Gebotspfad ('/trade/{id}/bid', PUT), weil startsWith/endsWith nicht passen. Dass alles Uebrige (z. B. das Verschieben in den Verein) direkt rausgeht, steht als Absicht im Kommentar Z. 1384-1388 - kein Fund. 3) applyEndpoints: zu jedem Schluessel in ENDPOINT_DEFAULTS gibt es eine Regel in ENDPOINT_RULES, es kann also keinen Absturz durch eine fehlende Regel geben. Ungueltige Werte fallen auf den Standard zurueck und werden gemeldet. Gut abgedeckt durch fc27-own-bot-tests/tests/endpoints.test.cjs (16 Tests, u. a. Gebotspfad ohne {id}, fremde Adresse, Sonderzeichen). Eine Adresse wie '//evil

### Preis-Gedaechtnis und Preis nach Alter
GEPRUEFT UND IN ORDNUNG: - basePlayerId (Z. 1630-1633): Der Rest bei 1048576 holt aus einer resourceId die Grund-Spieler-Nummer zurueck. Bei assetId aendert sich nichts, weil die schon klein ist. Passt zu priceKey (Z. 1015). - Frage \"Transferliste, dort ist assetId 0\": kein Fehler gefunden. gedaechtnisMerken bekommt NUR Suchantworten (Z. 1966, 2131, 2960), nie Karten aus der Transferliste. Und ist die assetId 0, wird der Eintrag uebersprungen (Z. 1675 \"if (!assetId) continue;\"). Es entsteht also kein falscher Schluessel, hoechstens gar keiner. Gleiches beim Markt-Scan: Z. 2230 \"if (!(id > 0)) continue;\". - Aufraeumen bei MAX_KARTEN (Z. 1722-1728): richtig herum sortiert. Die Sortierung ist absteigend nach t, geloescht wird ab Platz 1500 - also die am laengsten nicht gesehenen. Es geht nichts Wichtiges verloren. Die Zahl in GEDAECHTNIS.karten ist mit Math.min richtig gedeckelt. - Verfall nach 7 Tagen (Z. 1704-1708): sauber, nur Eintraege mit gueltigem t bleiben. - Puffer-Tausch in gedaechtnisSichern (Z. 1696-1698): richtig. Der Puffer wird vor dem Schreiben getauscht, neue Preise gehen nicht verloren. updateStorage (Z. 382) arbeitet nacheinander, zwei Sicherungen koennen sich nicht ueberholen. - Schreib-Bremse (Z. 1688-1693): 1-mal pro Minute, ausser bei 200 offenen Eintraegen. Kein Dauerschreiben, kein Speicherleck. - angebotsAlterS (Z. 1771-1777): Ist die Restzeit groesser als 3 Tage plus Toleranz (zum Beispiel wenn EA einmal einen Zeitstempel statt Sekunden schickt), kommt null heraus, nicht ein falsches Alter. Dann faellt alterAuswerten auf den Marktpreis zurueck. Das ist die sichere Richtung. - Untergrenze in alterAuswerten (Z. 1823): schuetzt wie gewollt vor einem einzelnen Lockangebot, durch Test A7 abgesichert. - verkaufsPreisAusEintrag (Z. 1850-1857): lies

### Preis-Pruefung und Markt-Scan
ARBEITSWEISE: Bereich 1941-2370 vollstaendig gelesen, dazu api(), reserveUsage(), cooldownBlock(), searchPath(), openMarketPath(), volleSeite(), isMatch(), buildPriceEntry(), alterAuswerten(), scanDelay(), allesAnhalten(), besitzAntreten(), autoScanBereit/Platz/Versuch und die Leseseite in popup.js. Keine Datei geaendert, keine git-Befehle. Alle Proben liegen im Scratchpad (scanpruef-probe*.cjs) und benutzen den vorhandenen Simulator tests/sim/tabs.cjs. Die 478 vorhandenen Tests laufen alle gruen (node --test tests/*.test.cjs, 478 pass, 0 fail) - keiner deckt die gemeldeten Faelle ab. ANTWORTEN AUF DIE GESTELLTEN FRAGEN: 1. Anfragen im schlechtesten Fall. Preis-Check: hoechstens 15 (CONFIG.CHECK_MAX_SEARCHES). Aufteilung: bis 3 fuer die erste Suche, das Abwaertstasten laeuft bis searches=11, die Tiefensuche bis 12, die Kontrollmessung bis 15. Nachgerechnet und im Simulator bestaetigt (ein voller Durchlauf brauchte 10). Markt-Scan: hoechstens 16 (CONFIG.MARKET_SCAN_MAX_REQUESTS), gedeckelt durch frei(). Beide Grenzen halten - ich habe keinen Weg gefunden, sie zu ueberschreiten. 2. Wird jede Anfrage vorher reserviert? Ja. In api() steht "if ((opts.method || \"GET\") === \"GET\" && String(path).startsWith(ENDPOINTS.searchPath + \"?\")) await reserveUsage(\"search\");" (Zeile ~1516). Sowohl searchPath als auch openMarketPath fangen mit ENDPOINTS.searchPath an, also werden beide gezaehlt. Die Reservierung laeuft in einer Warteschlange (usageChain) und prueft dort nochmal die Abkuehlzeit - richtig so. Die eigenen Zaehler (check.searches += 1, scan.searches += 1) stehen VOR dem api()-Aufruf, also lieber einmal zu viel gezaehlt als zu wenig. Gut. 3. Kann ein Abbruch Anfragen hinterlassen, die weiterlaufen? Eine schon rausgegangene fetch-Anfrage laeuft natuerlich zu Ende, das is

### Verkauf, Transferliste, Verkaufs-Wache
ANTWORTEN AUF DIE VIER FRAGEN 1) Kann ein Spieler unter dem Kaufpreis eingestellt werden? Ja - aber nur von Hand. spielerEinstellen (Z. 2549-2583) vergleicht den Preis nie mit eintrag.gekauftFuer. Probe: Karte fuer 5.000 gekauft, Befehl mit 1.000 -> ging glatt durch ("Testspieler steht jetzt für 1.000 Coins im Verkauf"). Der automatische Weg hat den Schutz: content.js Z. 3209 "if (!(netto > kaufPreis)) return { ok: false, grund: \"Kein Gewinn: …\" }". Die Oberflaeche zeigt den Verlust als kleine rote Zahl neben dem Knopf (popup.js Z. 2720, verkaufGewinnElement), der Knopf bleibt aber gruen und aktiv. Ich melde das nicht als Fund, weil es eine bewusste Hand-Aktion des Nutzers ist und der Verlust angezeigt wird - aber der Unterschied zum automatischen Weg ist da. 2) Kann "verkaufteAbraeumen" etwas abraeumen, das noch nicht verkauft ist? Ich habe keinen Weg gefunden. content.js filtert auf tradeState === "closed" (Z. 2601, Z. 2716, Z. 2765); die eigentliche Auswahl macht noch einmal die Seite selbst: sniffer.js Z. 404 "const verkauft = (transferItems() || []).filter((i) => auctionOf(i).tradeState === \"closed\");" und uebergibt nur diese an dienst.clearSoldItems. "active" und "expired" sind nie dabei. Eine Ungereimtheit ist mir aufgefallen: verkaeufeMerken verlangt zusaetzlich gebot > 0 (Z. 2431 "i.tradeState === \"closed\" && i.gebot > 0 && i.tradeId"), das Abraeumen nicht. Gaebe es je einen "closed"-Eintrag ohne Gebot, meldete der Bot ihn als "1 verkaufter Spieler … (Erlös 0 Coins)". Ich kann nicht belegen, dass EA so etwas liefert - deshalb kein Fund. 3) databaseId statt assetId? Ja, richtig gemacht: sniffer.js Z. 348 "assetId: Number(lies(() => item.databaseId)) || (Number(item.definitionId) % 16777216) || 0" mit dem Kommentar darueber, dass _assetId auf der Transferli

### Suche und Kauf
GEPRUEFT UND IN ORDNUNG 461 beim Kauf (Frage 3): Der Bot hoert sofort auf. Weg: api -> apiAntwortPruefen (Z. 1566-1571) findet 461 in HARD_STOP, setzt ueber sperreFuerCode eine Sperre (60 Min., bei Wiederholung mal 6, hoechstens 24 Std.) und wirft HardStop. executeBuy reicht HardStop durch (Z. 3530), die Schleife faengt ihn (Z. 4146) und ruft stop(..., "error"). Level "error" heisst Code "gesamt", also endet auch die Rotation. Dasselbe gilt fuer 461 beim Suchen, beim Verschieben und beim Einstellen. 426 und 429 stehen ebenfalls in HARD_STOP. Ich habe keinen Weg gefunden, auf dem der Bot nach 461 weiterlaeuft. Falsche Karte als Treffer (Frage 1): isMatch (Z. 1636-1644) vergleicht assetId ODER resourceId mit der Spieler-Nummer, dazu Rating, tradeState "active" und Sofortkaufpreis groesser 0. definitionId = databaseId + k*2^24 kann dabei keine fremde Karte treffen: Ist k groesser 0, ist die Zahl immer groesser als jede Grundnummer; ist k gleich 0, ist es dieselbe Karte. Auch basePlayerId (Z. 1630-1633) rechnet mit "modulo 2^20" statt "modulo 2^24" richtig, weil 2^24 ein Vielfaches von 2^20 ist - solange die Grundnummer unter 1.048.576 bleibt, und das tut sie bei EA. Teurer kaufen als erlaubt (Frage 2): Nein. Der wandernde Mindestpreis setzt nur "minb", der Zielpreis bleibt als "maxb" stehen, und isTarget (Z. 3089-3091) prueft den Sofortkaufpreis noch einmal selbst gegen target.maxPrice. Er kann auch nie ueber den Zielpreis steigen (Deckel ist der halbe Zielpreis). Bei Zielpreis bis 300 wechselt er wie im Kommentar beschrieben nur zwischen 0 und 150 - mit einer Probe nachgerechnet. Gleich verkaufen sonst: Der Verlustschutz hat wirklich ein return (Z. 3209-3211), anders als bei FST. Alter Preis, fehlender Preis-Check, volle Liste, laufender Verkaufs-Helfer und zu niedriger P

### Gebote und Abrechnung
GEPRUEFT UND IN ORDNUNG: Budget: Das Budget kann durch offene Gebote NICHT ueberschritten werden. canTransact (Z. 3478) und executeBid (Z. 3685) rechnen beide spent + bidCommitted + Betrag gegen das Budget. Bei einem Zuschlag wandert der Betrag von bidCommitted nach spent - unterm Strich gleich. Auch die Grenze je Filter (Z. 3480, 3688) und filterAvailable (Z. 3909) rechnen bidCommitted mit. Verlorenes Gebot: Wird freigegeben - ueber settleBids aus den Suchtreffern (Z. 3329), ueber die Beobachtungsliste (Z. 3398) und, wenn beides schweigt, ueber expireBids (Z. 3440). Bei "kein Ausgang erkennbar" bleiben die Coins bewusst gebunden und der Nutzer wird gewarnt (Z. 3266-3277) - richtig herum entschieden. Doppelt gezaehlt/freigegeben: Nein. releaseBid loescht den Eintrag aus openBids und unclearBids, bevor es zaehlt; findBid liefert danach nichts mehr. Der Test "bidCommitted laeuft bei doppelter Abrechnung nicht ins Minus" deckt das ab. bidsUnconfirmed wird durch die has-Pruefung (Z. 3273) nur einmal hochgezaehlt. Gebot auf eine fremde Karte: Nein. isBidTarget prueft isMatch (Spieler-ID und Rating, Z. 3661) und den Zielpreis (Z. 3675), canTransact prueft es noch einmal (Z. 3471). Nachgeboten wird nie gegen uns selbst (Z. 3669). Die Obergrenze je Auktion (bidCap, Standard 4) wird an drei Stellen geprueft. Reihenfolge in der Schleife: settleBids laeuft direkt nach der Suche (Z. 4085) und VOR der Gebotsauswahl (Z. 4133), beides auf derselben Trefferliste. Deshalb kann ein ueberbotenes Gebot nicht doppelt in bidCommitted stehen bleiben. In der Probe durchgespielt: bieten 900 -> ueberboten -> nachbieten 1000 -> gewonnen = bidCommitted 0, spent 1000, ein Kauflog-Eintrag. Stimmt. Konto-Schutz in diesem Bereich: sauber. Die Beobachtungsliste kostet eine echte Anfrage und wird erst n

### Hauptschleife, Start, Stopp, Pausen
GEPRUEFT UND IN ORDNUNG (Bereich content.js 3728-4290): Abstuerze / Ausnahmen in loop(): Ich habe jede Stelle ausserhalb des try-Blocks einzeln verfolgt. settleViaWatchlist steht in einem eigenen try. Die Suche, die Kaeufe und die Gebote stehen im grossen try. verkaeufePruefen kann nicht werfen, weil verkaufLauf() alles mit .catch() abfaengt (2481-2488). stop() kann nicht werfen: notify() hat ein try (764-769), tonSpielen() hat ein try (861-889), gedaechtnisSichern() gibt immer ein Promise zurueck (1699-1700). recordRun() geht ueber updateStorage(), das Fehler selbst schluckt (388). expireBids, stopReason, filterAvailable, setMessage und pushEvent rechnen nur. Ich habe keinen Weg gefunden, auf dem loop() eine Ausnahme nach draussen wirft. Der Auffang in Zeile 4284 ("loop(STATE.token).catch(...)") hat zwar keine Token-Pruefung und koennte einen NEUEN Lauf stoppen - ich habe aber keinen konkreten Weg gefunden, auf dem er ueberhaupt anspringt, deshalb kein Fund. Endlosschleife: nicht moeglich. Jede Runde endet mit "await wait(...)" (4196), und searchDelay gibt mindestens 5000 ms zurueck. wait() schlaeft in 250-ms-Haeppchen. Es gibt kein "continue" in der Schleife, die Pause wird also nie uebersprungen. Kann start() zweimal laufen: nein. start() ist bis zum Aufruf von loop() komplett synchron und setzt STATE.running sofort auf true (4271). Zwei Befehle koennen sich nicht ueberholen. Ein alter loop() kann STATE.running auch nicht mehr faelschlich auf false setzen, das ist mit "if (token === STATE.token)" abgesichert (4201). Startet man waehrend des Nachspanns eines alten Laufs neu, benutzt der alte weiter sein eigenes run-Objekt - sauber getrennt. Stopp-Gruende: stopReason() deckt Max. Kaeufe, Restbudget, Zeitlimit, zu wenig Coins, Platzproblem und 5 Fehler in Folge ab und w

### Panel-Geruest in content.js
GEPRUEFT UND FUER GUT BEFUNDEN 1) Kann botBefehl von der EA-Seite aus missbraucht werden? NEIN, kein Fund. botBefehl wird nur einmal weitergegeben: content.js:4783 "start(el.blattWurzel, botBefehl)". start ist globalThis.__fc27PopupStart aus popup.js. popup.js laeuft laut manifest.json in derselben ISOLIERTEN Welt wie content.js. Die EA-Seite (MAIN world) hat kein globalThis davon und kommt nicht heran. Der Fenster-Horcher ab content.js:4998 kennt nur Datenarten (players, probe, watchlist, tradepile, verkauf, appAntwort, muenzen, stapel, suchseite, nutzung, priceTiers, images, session) und ruft befehlAusfuehren an KEINER Stelle auf. Der Weg ueber chrome.runtime.onMessage (4986) prueft zusaetzlich das Praefix "v11/" und erreicht nur Erweiterungsseiten. Eine Herkunftspruefung fehlt also nicht. Nebenbemerkung ohne Fund-Status: Der Fenster-Horcher prueft nur event.source !== window, nicht event.origin. Bei gleicher Herkunft ist das dasselbe - aber jedes fremde Skript in der EA-Seite (z. B. FUT Simple Trader) koennte "__ownbot"-Daten schicken. Das ist der Sniffer-Bereich, nicht meiner, und die Daten werden dort einzeln geprueft (API_RE, istSpielerliste, PROBE_SERVICES, IMAGE_PREFIX_RE, acceptPriceTiers, zahl-Deckel in stapelUebernehmen). Sah sauber aus. 2) Kann das Panel die EA-Seite kaputtmachen? Kein Fund. - Das Wirtselement bekommt "all: initial !important" (4610) und eine geschlossene Schattenwurzel (4619). Die zweite geschlossene Wurzel fuer die Oberflaeche (4675) trennt popup-design.css sauber von PANEL_CSS. - seiteAnpassen (4592-4600) setzt nur body width. Die Leiste ist position: fixed, ihr max-width: 90% bezieht sich auf das Sichtfeld, nicht auf body. Es gibt also keine Rueckkopplung "body schmaler -> Leiste schmaler -> body schmaler". Geprueft. - Der Wert wird geme

### sniffer.js: die Bruecke zur EA-App
GEPRUEFT UND IN ORDNUNG: - appKauf kauft wirklich nur Karten aus der letzten eigenen Suche: APP_ANGEBOTE.get(tradeId), sonst Absage (Zeile 655-658). Die Karte wird als Original-Objekt der App an bid() gegeben, keine Kopie. Tests decken das ab: fc27-own-bot-tests/tests/app-sniffer.test.cjs ("gekauft wird genau die Karte aus der letzten Suche", "ein Angebot, das nicht aus der letzten Suche stammt, wird nicht gekauft", "eine neue Suche vergisst die Angebote der alten"). - Kein Speicherleck in APP_ANGEBOTE: die Karte wird bei jeder neuen Suche geleert (Zeile 633) und haelt hoechstens 60 Eintraege (Zeile 635). Nach dem Ende eines Laufs bleiben bis zu 60 Karten liegen, das ist harmlos. - Schlaegt eine Suche fehl, wird die Karte NICHT geleert (clear steht nur im Erfolgs-Rueckruf). Ohne Treffer kauft der Bot aber nichts, deshalb kein Fund. - Im Hauptlauf kommen Kauf und Gebot immer aus der Suche derselben Runde (content.js 4082-4142), die Karte liegt also sicher im Speicher. Zwischen Suche und Kauf laeuft nichts, was APP_ANGEBOTE leeren wuerde. - reportProbe ruft wirklich nichts auf, es schaut nur nach (probeService prueft nur typeof === "function"). - reportStapel, reportMuenzen, reportNutzung, reportSuchseite lesen nur den Speicher der App und kosten keine EA-Anfrage - so beschrieben und so umgesetzt. - reportWatchlist und reportTradepile(frisch) sind echte EA-Anfragen, aber nur auf Nachfrage von content.js. - verkaufAktion prueft selbst keine Preise; content.js prueft vorher hart (content.js 2552-2568: Sofortpreis >= 200, eaMin/eaMax, Startgebot unter Sofortkauf). Gefaehrlich ist das nur ueber gefaelschte Nachrichten, siehe Fund 2. - Der MutationObserver wird nie abgeschaltet, feuert aber hoechstens alle 600 ms und macht nur Lesearbeit. Kein Fund. - safeCodes/safeKeys sind s

### background.js, manifest.json, Rechte
LIVE GEPRUEFT (nur gelesen, kein Klick, keine EA-Anfrage): Die Web App war offen (1 Tab). Die Leiste stand und meldete "oberflaeche-bereit inhalt=901", das Wirtselement #fc27-own-bot-panel und das Stil-Element #fc27-own-bot-schriften waren da. Mehr habe ich live bewusst NICHT gemacht: Das Antesten von Fund 1 und 3 verlangt einen Klick auf das Symbol, und der oeffnet einen zweiten Web-App-Tab - das wollte ich dem Konto des Nutzers nicht antun, solange der Bot laufen koennte. Die Schritte dafuer stehen bei den Funden. GEPRUEFT UND IN ORDNUNG: - Absenderpruefung: Beide Hoerer pruefen sender.id === chrome.runtime.id und sender.tab. Es gibt kein externally_connectable im Manifest, also kann keine Webseite Nachrichten schicken. Fremde Erweiterungen landen bei onMessageExternal - den Hoerer gibt es hier nicht. devReload kann also NICHT von aussen ausgeloest werden. - devReload aus dem Lauf heraus: Beide Knoepfe sind waehrend eines Laufs gesperrt (content.js Z. 4646 "if (STATE.running) return;", popup.js Z. 2138 "if (isRunning()) return;"). Der Service Worker selbst prueft das nicht, aber ein Neuladen mitten im Lauf ist trotzdem ungefaehrlich: In content.js steht vor JEDER EA-Anfrage ein "await reserveUsage(...)" (content.js Z. 1520), und das faellt in einem abgehaengten Script sofort mit "Extension context invalidated" um. Es geht also nichts mehr an EA raus. Sauber geloest. - Schlafender Service Worker: background.js hat keine Timer, keine Alarme, keinen Zustand im Speicher. Beide Ereignisse (onMessage, action.onClicked) wecken den Worker von selbst. Der Herzschlag der Tab-Sperre laeuft in content.js, nicht hier. Der Worker kann also nichts Wichtiges verschlafen. Das setTimeout(..., 100) vor chrome.runtime.reload() ist kurz genug. - Doppeltes Einspielen der Scripts: content.j

### Wertung und Live-Filter im Popup
NICHT live im Chrome geprueft - Auftrag war nur Lesen. Die Spalte livePruefbar sagt, was sich in der offenen EA-Web-App nachstellen laesst. GEPRUEFT UND IN ORDNUNG: - Division durch Null / NaN / Infinity im ganzen Bereich: alle Divisionen sind abgesichert. localFilterStats teilt nur bei scans > 0 (Z. 1001) bzw. durch sample = Math.max(1, ...) (Z. 1013). wertungTeile teilt nur bei basis.value > 0 (Z. 944). filterBadges prueft suggestion.value > 0 und entry.market > 0 (Z. 1032-1033). trendEintraege prueft mittel > 0 (Z. 1214). wertungAus klemmt das Produkt mit Math.max(0, Math.min(1, ...)) auf 0 bis 1 (Z. 978). wertungZahl faengt NaN mit "Number(score) || 0" ab. Ein Eintrag ohne Zeitstempel ergibt frische = 0 und damit Wertung 0 - kein NaN, keine Endlosschleife. - prozentAufgerundet(0) liefert in meiner Probe den Text "-0". Aufgerufen wird die Funktion aber nur mit "teile.prozent > 0" (Z. 1134), also nicht erreichbar. Kein Fund. - Kann ein "Ungeprueft"-Filter von allein starten? Nein, drei Sperren halten: sofortStartSperre blockt confidence "niedrig" und preisGeprueft === false (Z. 1882-1891); die Rotation prueft vorher frisch (preisReichtAus Z. 3533 fuehrt zu awaitFreshPrice Z. 3640). Zusaetzlich rechnerisch: Ein Gedaechtnis- oder "Nur gesehen"-Filter hat die Sicherheit 0,6 x 0,7 = 0,42; damit kommt er in realistischen Preislagen nicht ueber 4,0 und bekommt weder "Fuer dich" noch die Vorauswahl. Ich habe das mit 15.000er- und 800er-Karten durchgerechnet (Ergebnis 3,5 und darunter). - Abkuehlung: Rechnung, Abzug, 12-Stunden-Notbremse und "fuenf andere Filter loeschen sie" stimmen mit wertung-skala.test.cjs ueberein. Der einzige Weg daran vorbei ist Fund 1 (Start von Hand). Kein Test deckt das ab - rotation.test.cjs prueft nur den Start MIT rotationKarte. - Reihenfolge des

### Preis-Vorschlag und Gewinnrechnung im Popup
GEPRUEFT UND IN ORDNUNG (Bereich popup.js 104-860): - Die 5-Prozent-Gebuehr: In meinem Bereich steht sie nur an zwei Stellen, beide mit derselben Konstante SALE_FEE (Zeile 60). Zeile 666 rechnet `Math.floor(verkaufspreis * (1 - SALE_FEE))` - das ist die uebliche, vorsichtige Richtung und passt zu content.js:2752 und content.js:3208. Kleine Unsauberkeit ohne Folge: Zeile 713 rechnet dieselbe Gebuehr mit `Math.round` statt `Math.floor`, das sind hoechstens 1 Coin Unterschied - und die Zeile wird ohnehin nirgends gelesen. - Preisstufen: stepFor (124-133) benutzt dieselbe Leiter wie content.js, die Tabelle aus der Web App wird von content.js sortiert und geprueft (acceptPriceTiers, content.js:1035-1050), bevor sie im Speicher landet. Die Pruefung in popup.js:536 reicht deshalb. Die Grenzen 1.000 / 10.000 / 50.000 / 100.000 sind selbst Vielfache der groesseren Stufe, deshalb rutscht roundDownToStep nie in eine falsche Stufe. Test price-tiers.test.cjs deckt das ab. - Rundungsrichtung: Kaufpreise werden ueberall abgerundet (byDiscount, byProfit), Verkaufserloese abgerundet. Ein Gewinn wird dadurch nie schoengerechnet. Der erwartete Gewinn (Zeile 702) ist ehrlich: saleNet minus Kaufpreis, beides ganze Zahlen. - stufenUnterAngebot (152-160): keine Endlosschleife moeglich, die Zaehlung bricht bei 99 ab, die Schrittweite ist immer mindestens 1. - verkaufsPreis (217-249): liest genau dasselbe wie content.js (verkaufsPreisAusEintrag). Bei "wenig" Daten liefert content.js selbst den Marktpreis, der Text stimmt also mit der Rechnung ueberein. Test preis-nach-alter.test.cjs B1/B4 haelt beide gleich. - intelligentProfit (618-642): Der Auto-Gewinn kann bei sehr billigen Karten seinen eigenen Deckel ueberschreiten (Markt 150: Gewinn 50, Deckel 27). Das ist aber der Kommentar in Zeile 635-

### Filter-Fenster, Sofort-Start, Rueckfragen
GEPRUEFT UND IN ORDNUNG 1) Fenster waehrend der Preis-Pruefung schliessen: sauber geloest. closeFilterModal (Z. 1697-1698) zaehlt filterLoadToken hoch UND schickt cancelPriceCheck. Schliesst man in der kurzen Luecke vor der Antwort, holt awaitFreshPrice die Absage nach (Z. 1935-1937). content.js beendet die Pruefung dann wirklich (Z. 4931-4937: check.running = false, token + 1). Alle vier Wege zum Schliessen gehen ueber closeFilterModal: X-Knopf (Z. 4798), Klick neben das Fenster (Z. 4799-4801), Escape (Z. 4847), Reiterwechsel (selectTab). Getroffen wird auch ein halb fertiger Ladevorgang: token-Pruefungen in Z. 1988, 2005, 2023, 2049. 2) Werte aus einem alten Fenster auf einen neuen Filter: nicht gefunden. openFilterModal (Z. 1667-1684) setzt Verkaufsmodus, Gewinn-Modus, Gewinn-Feld, beide Haken, die Fortschrittszeile und filterRueckfrage zurueck. offeneRueckfrage (Z. 1714) vergleicht zusaetzlich den Schluessel. Kurz nach dem Schliessen kann der alte Lauf noch Knoepfe grau lassen (finally in Z. 2079 setzt wasDisabled zurueck), aber das renderFilterModal in Z. 2080 raeumt es sofort wieder auf. 3) sofortStartSperre umgehen: bis auf Fund 2 nicht moeglich. Ohne frischen Check wird gar nicht geladen (Z. 2032), mit frischem Check wird geladen, aber nicht gestartet, und der Grund steht oben im Reiter (Z. 2058). Die EA-Sperre wird zweimal geprueft: vor der Anfrage (Z. 1968) und noch einmal frisch in startRun (frischeSperre). Doppelklicks fangen filterLoadBusy (Z. 1960) und der Token (Z. 1969) ab. 4) "Pruefen & laden" waehrend einer EA-Sperre: der Knopf ist ohne "Sofort starten" nicht grau, aber content.js lehnt die Preis-Pruefung ab (startPriceCheck, cooldownBlock/andererTabAktiv/STATE.running). Es geht also keine EA-Anfahrt raus, nur eine Fehlermeldung. Passt. 5) Kein Absturz

### Start-Pruefung und Sicherheitsnetze
GEPRUEFT UND IN ORDNUNG: Preis-Nachpruefung vor dem Start (4573-4702): Die Kette checkPricesBeforeStart > altePreise > zuVieleAltePreise > altePreisePruefen > gewinnSperre ist sauber. Hoechstens 3 Nachpruefungen (MAX_AUTO_CHECKS), bei mehr wird gesperrt statt 60 Anfragen zu feuern. Ein Abbruch oder Fehler der Pruefung startet nichts. Der Zielpreis des Nutzers wird nie still geaendert. Die Fortschrittszeile (startPruefText) wird im finally immer geloescht. Das alles ist in tests/start-price-check.test.cjs mit 14 Tests abgesichert. Kann ein Lauf mit veralteten Preisen starten? Ja - aber nur ueber den Haken "Beim Start Preise pruefen" (Fund 1). Mit dem Haken (Standard: an) wird jeder Preis, der aelter als 15 Minuten ist, entweder nachgeprueft oder der Start gesperrt. Live-Filter werden bewusst uebersprungen, weil sie beim Laden geprueft wurden und nach 15 Minuten ohnehin als "abgelaufen" aus der Liste fallen (liveAbgelaufen, Zeile 2093). Wird das Budget gegen den echten Kontostand geprueft? Nicht in popup.js, aber content.js macht es beim Start: Zeile 4259-4263 lehnt ab, wenn der bekannte Kontostand unter dem niedrigsten Zielpreis liegt, und Zeile 3880-3883 stoppt den laufenden Lauf aus demselben Grund. Ist der Stand unbekannt (null), wird bewusst nichts behauptet und EA entscheidet selbst - das ist in content.js richtig geloest (muenzenBekannt, Zeile 3728-3731). Nur popup.js/rotationKandidaten verwechselt "unbekannt" mit "0" (Fund 3). Start-Sperre: aktuelleSperre/frischeSperre/startSperrGrund sind konsequent. startRun holt den Stand ganz vorn frisch (Zeile 4915), bevor irgendein Preis-Check Anfragen kostet. content.js prueft beim Start noch einmal alles selbst (Abkuehlung, fremder Tab, laufender Lauf, Session, Suchseite, Platz auf den Stapeln) - ein veralteter Stand im Po

### Auto-Lauf und Rotation im Popup
GEPRUEFT UND FUER GUT BEFUNDEN Tests: In den 478 Tests deckt nur rotation.test.cjs diesen Bereich ab, und dort nur die Rotations-Karte in content.js plus die Funktion rotationKandidaten (der Test liest sie mit vm aus popup.js aus, Zeilen 180-260). Fuer rotPauseMs, rotSuchenBudget, preisReichtAus, rotWarten, rotationLauf, startAutoRun, updateAutoCalculation und renderAutoStartKnopf gibt es KEINEN einzigen Test - ich habe die Testordner danach durchsucht. Wie viele EA-Anfragen kostet eine Runde? Hoechstens 15 fuer die Preis-Pruefung plus so viele Suchen, wie rotSuchenBudget erlaubt (hoechstens 40, Feld-Obergrenze 80). rotSuchenBudget rechnet vorher aus, was Stunde und Tag noch hergeben, zieht 15 fuer die Pruefung und 25 als Puffer ab und bricht unter 10 ab. Das ist sauber und passt zu den Grenzen im Bot (150 pro Stunde, 350 pro Tag). Zusaetzliche Preis-Pruefungen durch startRun kann es nicht geben, weil die Rotationsziele source "live" tragen und altePreise solche Ziele ausdruecklich ausnimmt (popup.js:4640). Kaeufe sind durch BUY_LIMIT_DAY 100 und CARD_LIMIT_DAY 20 im Bot gedeckelt. Kann die Rotation endlos weiterlaufen, wenn der Nutzer stoppt? Nein. Der Stopp-Knopf setzt rotationAbbruch (popup.js:5470), rotWarten steigt innerhalb von 500 ms aus, und content.js beendet beim Befehl "stop" zusaetzlich die Rotations-Karte (content.js:4926). Ohne gueltige Karte startet kein weiterer Filter. Auch Not-Aus, unsichtbarer Tab, EA-Sperre und Laufzeit-Ende machen die Karte ungueltig. Der Ausstiegsweg ist in Ordnung - das Problem ist nur, dass der Knopf zeitweise nicht da ist (Fund 1). Kann sie einen Filter mit veraltetem Preis waehlen? Im Kern nein: preisReichtAus verlangt eine echte Messung (preisGeprueft nicht false), Sicherheit nicht "niedrig" und hoechstens 15 Minuten Alter, so

### Verkaufs-Reiter im Popup
GEPRUEFT UND IN ORDNUNG 1) Einstellen ohne Klick: Nein. In popup.js fuehrt kein Weg zu "einstellen" ausser drei echten Klick-Zuhoerern: die Zeile (popup.js:2711), "Abgelaufene neu einstellen" (2851) und "Verkaufte abraeumen" (2852). Kein Zeitgeber, kein Zeichnen ruft verkaufEinstellen. Die Knoepfe sind normale type="button" in einem div, also loest auch die Eingabetaste in keinem Formular etwas aus. Ein disabled gewordener Knopf verliert den Tastatur-Fokus, es kann also nicht "blind" nachgeklickt werden. Das automatische Einstellen gibt es nur in content.js ("Gleich verkaufen" nach dem Kauf, Verkaufs-Wache) und haengt dort an Einstellungen - das ist eine andere Baustelle. 2) Gewinnrechnung nach Gebuehr: stimmt ueberall und ist einheitlich Math.floor(Preis * 0,95) minus Kaufpreis. Geprueft: kaufGewinn (2487), verkaufVorschlag.netto (2648), die verkaufte Karte in verkaufZeile (2687), die Summe "Echt verkauft" (2776). Nirgends wird die Gebuehr doppelt abgezogen und nirgends auf den Kaufpreis angewandt. marktwertFuer nimmt den wirklich verlangten Preis, wenn die Karte schon im Verkauf steht (listPrice), sonst den mitgebrachten salePrice, sonst den Preisverlauf - und content.js schreibt listPrice nur, wenn das Einstellen wirklich geklappt hat (content.js:3635-3636). Ohne Marktwert zaehlt der Kauf als "unbekannt", nicht als 0. Richtig. 3) CSV-Einschleusung: csvCell (2582) setzt vor = + - @ ein Hochkomma und packt Zellen mit ; " CR LF in Anfuehrungszeichen. Die Namen kommen aus content.js str(), das .trim() macht - ein fuehrendes Tabulator- oder Wagenruecklauf-Zeichen kann also gar nicht erst in den Namen gelangen. Anmerkung ohne Fund: Tabulator und Wagenruecklauf stehen nicht in der Zeichenliste von csvCell; das ist die uebliche zweite Haelfte des Schutzes, hier aber wegen tr

### Tacho, Markt-Zustand, Kopf-Kacheln, Blaetter
GEPRUEFT UND IN ORDNUNG: - blattZeile, blattOeffnen/Schliessen/Verdrahten: sauber. Der Klick auf den dunklen Rand prueft e.target === blatt, das schliesst nicht bei Klicks ins Fenster. - renderSammlungenBlatt: Der Weg "value setzen -> renderCollections() -> collection-load klicken" funktioniert. renderCollections liest den alten Wert VOR dem Austausch der Optionen (Z. 5505) und setzt ihn danach wieder (Z. 5516). Der Laden-Knopf ist dann auch nicht mehr gesperrt. - heuteZahlen: erloes rechnet mit v.preis; content.js schreibt genau dieses Feld (Z. 2439 "preis: i.gebot") und nur fuer tradeState === "closed", also echte Verkaeufe. Die 5 % Gebuehr stimmen mit SALE_FEE ueberein. - kachelZahl: 999.999 wie fmt, 1.200.000 -> "1,2 Mio.", 12.400.000 -> "12 Mio.", 0 -> "0". Nachgerechnet, passt. - renderKopfKacheln: jede Kachel in eigenem try/catch, eine fehlende Stelle kann render() nicht abbrechen. - marktTachoStand bei Sperre: deckelt auf 10 und schreibt den Grund dazu. Gut so. - marktKonkurrenz: verlangt messAbstandMs >= 60000 und sampleSize > 0. Beide Felder setzt content.js nur beim zweirundigen Preis-Check (Z. 2043/1904), Scan-Eintraege fallen also korrekt raus. Bei 0 % Umschlag steht "niedrig · 1 von 5" und der Tooltip nennt die 0 % - ehrlich genug, kein Fund. - renderLiveHud: Die Anzeige bleibt in der Pause zwischen zwei Filtern stehen (rot.aktiv), st.pauseDauer wird von content.js wirklich mitgeschickt (Z. 4313), der Rueckfall 40 bei pauseEvery ist kommentiert. - Die Kosten sind harmlos: renderKopfKacheln laeuft alle 1,5 s und geht dabei ueber hoechstens 40 Scan-Zeilen und 1500 Gedaechtnis-Karten. Das ist kein Leistungsproblem. UNSICHER, DARUM KEIN FUND: - popup.js Z. 3842 "Geschaetzter Gewinn": heuteZahlen zaehlt mitWert mit (wie viele Kaeufe ueberhaupt einen Marktpreis 

### Verbindung Popup zu content.js und Oberflaeche
GEPRUEFT UND FUER GUT BEFUNDEN Aufbau und Verdrahtung - Ich habe mit einem kleinen Skript alle $("id")-Aufrufe aus popup.js gegen alle id-Attribute in popup.html geprueft: KEIN einziger Treffer ins Leere. Ausserdem keine doppelten IDs und kein <label for="..."> ohne Ziel. Die Oberflaeche kann also nicht daran sterben, dass ein Element fehlt. - [hidden] { display: none !important; } (popup-design.css:105) steht VOR den .check-Regeln und gewinnt gegen .check { display:flex }. Die versteckte Zeile #rotationModus-zeile (popup.html:303) ist damit wirklich unsichtbar und nicht anklickbar. Das war mein erster Verdacht fuer den Klick-Unfall - er stimmt nicht. - Die zwei Autopilot-Karten schalten den versteckten Haken ueber setAutoModus (popup.js:3730) mit new Event("change"). Das Ereignis steigt nicht auf, aber alle Horcher haengen direkt am Element - sie laufen. Auch das Weiterreichen von autoBudget/autoMaxBuys/autoRating (popup.js:6091-6117) mit new Event("input"/"change") funktioniert aus demselben Grund. - content.js stoppt "input" und "change" am Traeger der Leiste (content.js:4616). Das verschluckt NICHTS aus popup.js: die eigenen Horcher sitzen an den Feldern selbst und sind vorher dran. Nur die EA-Seite draussen bekommt nichts mit - so gewollt. send() und Brücke - In der Seite ist send() ein direkter Funktionsaufruf mit try/catch (popup.js:2982-2988). Er wirft nie und gibt immer ein Objekt zurueck. Ein Tab-Wechsel im Browser aendert daran gar nichts, weil die Leiste in der Seite selbst steckt. - Im eigenen Fenster wird eine Aktion nach einer verlorenen Antwort NIE blind wiederholt; stattdessen wird der Zustand gelesen und bestaetigt (popup.js:3029-3052). Sehr sauber geloest. - { ...extra, cmd: ... } (popup.js:3031): extra kann den Befehl nicht ueberschreiben. Gut. - web
