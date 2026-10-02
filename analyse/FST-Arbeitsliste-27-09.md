# Alle Punkte, die fuer 1:1 verbessert werden muessen

Stand 27.09.2026. Aus der Bilanz ueber 101 gepruefte Punkte.

| | Anzahl |
|---|---|
| **Machbar - koennen wir bauen** | **54** |
| Nur um den Preis des Kontoschutzes | 10 |
| Nur mit FSTs Server (gesperrt) | 13 |
| **Zusammen** | **77** |

---

# Teil 1: Machbar (54 Punkte)

Das ist die eigentliche Arbeitsliste.

## Suchen (5)

### 1. Über welchen Weg gefragt wird: EAs eigene App-Funktion oder eine selbst gebaute Adresse

**FST:** FST ruft immer EAs eigene Funktion services.Item.searchTransferMarket auf (scripts.js Z. 58375, 2087, 46682). Es baut nie selbst eine EA-Adresse. Der Standard-Modus heisst "renderless" (Z. 3336).

**Wir:** Wir bauen die Adresse selbst zusammen (content.js Z. 2007-2035, searchPath). Der App-Weg ist gebaut (content.js Z. 1803 appWeg, sniffer.js Z. 912 appSuche), laeuft aber nur unter drei Bedingungen gleichzeitig: Schalter an (popup.js Z. 59 steht auf false), kein Rating gesetzt (content.js Z. 1839) und keine Kartenart/kein Scan-Filter (content.js Z. 1845-1847).

**Woran es liegt:** Der Schalter steht im Standard auf AUS. Und selbst wenn man ihn einschaltet: Sobald der Nutzer einen Spieler aus der Liste anklickt, wird das Rating automatisch ins Feld geschrieben (popup.js Z. 510). Mit Rating in der Suche schaltet sich der App-Weg selbst ab. Genauso bei gesetzter Kartenart oder einem Scan-Filter. Es bleibt fast nur der Fall "Spieler ohne Rating, ohne Kartenart, ohne Filter" - und der ist beim Snipen die Ausnahme, weil ohne Rating alle Versionen des Spielers die 21 Plaetze belegen.

**Was du merkst:** Merkt man beim Ergebnis der einzelnen Suche kaum - dieselben Angebote kommen auch ueber die selbstgebaute Adresse. Spuerbar wird es, wenn EA einen Pfad oder einen Feldnamen aendert: Dann steht unser Bot still, FST laeuft weiter. Und es gibt keinen Hinweis in der Oberflaeche, dass der App-Weg gerade uebersprungen wurde - der Nutzer glaubt, er sucht ueber die App.

**ZU TUN:** Zwei Dinge: erstens live messen, ob EAs App-Funktion Rating, Kartenart und die Scan-Filter wirklich durchreicht (dann duerfen sie aus APP_UNBEKANNTE_FILTER in content.js Z. 1802 heraus); zweitens den App-Weg als automatische Rueckfallebene einschalten, wenn die direkte Adresse dreimal hintereinander ins Leere laeuft. Bis dahin mindestens in der Oberflaeche anzeigen: "App-Weg gerade nicht benutzt, weil Rating gesetzt ist."

### 2. Wandernder Mindestpreis, damit zwei Suchen nie gleich aussehen

**FST:** FST hebt den Mindestpreis Schritt fuer Schritt an und faellt nach 10 Schritten zurueck (scripts.js Z. 3257 minPriceRangeSteps: 10, Z. 58353-58357).

**Wir:** Genauso, mit derselben Zahl: content.js Z. 186 (MINB_STUFEN: 10) und Z. 3625-3636 (wandernderMindestpreis). Deckel bei der Haelfte des Zielpreises.

**Was du merkst:** Rund ein Dutzend verschiedene Anfragen statt immer derselben. Damit kann EA die Antwort nicht aus einem Zwischenspeicher liefern - der gemessene Preis ist frisch.

**Hinweis der Gegenprobe:** Die Funktion gibt es wirklich, sie laeuft bei jeder Suche, und die Zahl 10 ist dieselbe. Aber 'genauso' ist zu viel gesagt - ich habe vier echte Unterschiede gefunden.

1) Unser Zaehler gilt fuer den ganzen Lauf, nicht je Spieler. In content.js Z. 3625-3636 liegen letzterMindestpreis und mindestpreisSchritte am Lauf (run), nicht am Spieler. FSTs Zaehler gehoert zu EINEM Filter: FST snipet immer nur einen Filter (scripts.js Z. 58249-58256, ein einziges searchCriteria). Wir wechseln in einem Lauf zwischen bis zu zehn Spielern. Folge: Der Deckel richtet sich nach dem Spieler, der gerade dran ist - und das ist der billigste. Beispiel: Spieler A Zielpreis 50.000, Spieler B Zielpreis 600. Bei B ist der Deckel 300. Sobald der wandernde Preis darueber liegt, springt er auf 0 zurueck - auch fuer A. Statt rund einem Dutzend Anfragen bleiben vier oder fuenf.

2) Der Deckel bei der Haelfte des Zielpreises ist unsere Erfindung, FST hat ihn nicht. FST prueft nur beim Speichern, ob der Mindestpreis nach 10 Stufen unter dem Hoechstpreis bleibt (Z. 29817-29825). Bei teuren Karten faellt das nicht auf, bei billigen schon: Zielpreis 600 heisst bei uns nur vier Stufen.

3) FST springt nicht auf 0 zurueck, sondern auf den eigenen Mindestpreis des Filters (Z. 58355: t.minBuy = initSearchCriteria.min_buy_now_price). Wir gehen immer auf 0. Kleiner Unterschied im Aussehen der Anfrage.

4) FST aendert noch zwei Dinge mehr, die wir nicht aendern: das Mindestgebot wechselt bei jedem Rueckspringen zwischen 0 und 150 (Z. 58366-58367), und FST leert vor jeder Suche EAs eigenen Zwischenspeicher (clearTransferMarketCache, Z. 58368). Den zweiten Punkt brauchen wir nicht - wir fragen EA direkt, ohne die App dazwischen. Den ersten haben wir nicht.

Einen Vorsprung haben wir auch: Wir verschieben zusaetzlich den Hoechstpreis (content.js Z. 3744-3749), und zwar nur nach oben. Bei FST ist das ab Werk AUS (Z. 3258: maxPriceRangeSteps: 0), und FST senkt ihn - dabei kann ein Angebot genau zum Zielpreis aus der Antwort fallen.

Unterm Strich: gebaut und wirksam, aber bei mehreren Spielern mit sehr verschiedenen Preisen schwaecher als FST. Entwarnung an einer Stelle: Weil wir zwischen Spielern wechseln, sind zwei Anfragen hintereinander ohnehin nie gleich - das Risiko, dass EA eine alte Liste liefert, ist bei uns von sich aus kleiner als bei FST.

### 3. Wandernder Hoechstpreis

**FST:** FST senkt den Hoechstpreis stufenweise und hebt ihn dann wieder (scripts.js Z. 58358-58367). Im Standard ist das AUS (Z. 3258 maxPriceRangeSteps: 0).

**Wir:** Wir heben ihn um eine Stufe und gehen bei der naechsten Suche sofort zurueck (content.js Z. 3730-3748). Bei uns laeuft das immer, nicht nur auf Wunsch.

**Woran es liegt:** Wir machen es bewusst anders: FST SENKT die Grenze, dann faellt ein Angebot genau zum Zielpreis aus EAs Antwort - und genau darauf wartet der Bot. Wir heben nur an. Gekauft wird trotzdem nur bis zum Zielpreis.

**Was du merkst:** Merkt man nicht am Ergebnis. Die Zahl der Suchen aendert sich nicht. Bei FST kann im Standard jede zweite Suche gleich aussehen, bei uns nie.

**ZU TUN:** Nichts. Der Unterschied ist Absicht und zu unseren Gunsten.

### 4. Mehrere Kartenarten in EINER Suche (z. B. TOTW und Flashback gleichzeitig)

**FST:** FST sammelt mehrere Kartenarten in einer Liste und schickt sie zusammen (scripts.js Z. 26628: rarities.push, Z. 1725, Z. 1819). Dafuer gibt es ein eigenes Fenster "Edit Rarities".

**Wir:** Nur EINE Kartenart je Suche (content.js Z. 2029: ein Wert in rarityIds; popup.html Z. 361-367 ein einzelnes Feld). Der Kommentar im Code sagt selbst, dass Komma moeglich waere (content.js Z. 41).

**Woran es liegt:** Es ist nie gebaut worden. Das Adressfeld heisst rarityIds und kann mehrere Werte mit Komma - genutzt wird immer nur einer.

**Was du merkst:** Wer zwei Sonderkarten desselben Spielers snipen will, braucht bei uns zwei Eintraege und damit doppelt so viele Suchen. Bei 350 Suchen am Tag heisst das: halb so viele Durchgaenge je Karte.

**ZU TUN:** Aus dem Zahlenfeld eine Mehrfachauswahl machen und die Werte mit Komma in rarityIds schreiben. Achtung: Der Nachcheck isMatch (content.js Z. 2110-2118) vergleicht heute genau einen Wert - er muesste dann gegen die ganze Liste pruefen.

### 5. Etwas anderes als Spieler suchen (Verbrauchsgueter, Trikots, Stadionteile)

**FST:** FST uebernimmt die komplette Suchmaske des Nutzers, samt Art des Gesuchten (scripts.js Z. 1405-1408, Z. 1715: _type kommt aus dem Filter). Steht die EA-Maske auf etwas anderem als Spielern, sucht FST das.

**Wir:** Wir schreiben immer type=player in die Adresse (content.js Z. 2010 und Z. 2055). Der Baustein dafuer liegt in sniffer.js Z. 933 bereit (SearchType.ANY), wird aber von content.js nie angefordert.

**Woran es liegt:** Nie gebaut. Die Oberflaeche hat kein Feld dafuer, und die Preis-Pruefung ist ganz auf Spieler ausgelegt (Rating, Kartenart, basePlayerId).

**Was du merkst:** Wer teure Verbrauchsgueter snipen will, kann das mit unserem Bot ueberhaupt nicht. Beim Snipen von Spielern merkt man nichts davon.

**ZU TUN:** Grosser Umbau: eigene Auswahl in der Oberflaeche, und der ganze Preis-Check muesste ohne Rating und Kartenart auskommen. Lohnt nur, wenn der Nutzer das wirklich will.

## Tempo und Pausen (3)

### 6. Wie lange der Bot ohne Unterbrechung arbeitet

**FST:** Laeuft weiter, bis der Nutzer stoppt oder ein eigenes Ziel erreicht ist.

**Wir:** 150 Suchen mal 3,8 Sekunden sind gut 9 Minuten, dazu drei Sicherheitspausen von je 90 Sekunden - also rund 14 Minuten. Dann ist das Stundenlimit voll. content.js Z. 3681-3707 (stundenPause) wartet danach hoechstens 15 Minuten und das nur einmal je Lauf (Z. 269). Gebraucht wuerden aber rund 46 Minuten. Also wird nicht gewartet, sondern Z. 3726 wirft den harten Stopp und der Lauf ist zu Ende.

**Woran es liegt:** Die Wartepause ist zu kurz fuer das schnelle Tempo. Sie war fuer die alten 12 Sekunden gedacht, wo das Limit erst nach einer halben Stunde voll war.

**Was du merkst:** Nach etwa 14 Minuten hoert der Bot auf. Der Nutzer muss selbst nachsehen und neu starten. Schlimmer noch: In Optionen unter Wartung steht wortwoertlich, der Bot "wartet den Rest der Stunde" (popup.html Z. 718). Das tut er nicht.

**ZU TUN:** Entweder die Wartezeit auf 60 Minuten anheben und mehrfach je Lauf erlauben, oder den Satz in der Oberflaeche richtigstellen. Im Moment verspricht der Text etwas, was der Code nicht tut.

### 7. Ob die Sicherheitspausen ueberhaupt gemacht werden

**FST:** scripts.js Z. 3263: useBreaks steht auf falsch. FST macht im Standard gar keine Pausen.

**Wir:** content.js Z. 5223-5241 (breakPlan): immer an. Die Auswahl in popup.html Z. 921 kennt nur kurz, ausgewogen, lang - kein "aus".

**Woran es liegt:** Wir haben keinen Ausschalter. FST hat ihn und er steht sogar im Standard auf aus.

**Was du merkst:** Auf 45 Suchen kommen im Schnitt 127 Sekunden Pause. Wer die Stundengrenze hochstellt, schafft damit hoechstens 540 Suchen in der Stunde statt 900. Beim Standard von 150 Suchen merkt man es kaum - die Pausen kosten keine Suche, sie verteilen sie nur auf 14 statt 9 Minuten.

**ZU TUN:** Eine vierte Auswahl "keine Pausen" wie bei FST. Nur sinnvoll, wenn der Nutzer auch die Stundengrenze anhebt.

### 8. Wie lang die Pausen sind und wie sie streuen

**FST:** scripts.js Z. 3264-3268: alle 45 Suchen 90 Sekunden, nach je 4 solchen Pausen eine von 240 Sekunden, alles mit 30 Prozent Streuung, nie kuerzer als 3134 Millisekunden (Z. 58604). Wichtig: FST streut auch die ANZAHL der Suchen vor der Pause. Die Funktion in Z. 1951-1954 rechnet 45 plus oder minus 30 Prozent, also zwischen 31 und 58 Suchen.

**Wir:** content.js Z. 5223-5241: 90 Sekunden, jede vierte 240, 30 Prozent Streuung, Untergrenze 3134 - alles gleich. Aber die Anzahl steht fest auf 45 (Z. 5234). Sie streut nicht.

**Woran es liegt:** Nur ein Punkt fehlt: Bei uns kommt die Pause immer nach genau 45 Suchen, bei FST nach 31 bis 58.

**Was du merkst:** Merkt man beim Verdienen nicht. Es geht nur um die Tarnung: Ein immer gleicher Takt sieht maschineller aus als ein schwankender.

**ZU TUN:** In breakPlan die 45 mit derselben 30-Prozent-Streuung versehen, die die Dauer schon hat. Zwei Zeilen.

## Kaufen (6)

### 9. Abstand zwischen zwei Kaeufen

**FST:** Nach einem Kauf wartet FST 5,0 bis 6,5 Sekunden bis zum Verschieben (scripts.js Z. 58317-58326) und danach noch 3,3 bis 4,0 Sekunden bis zur naechsten Suche (Z. 58639-58647). Unter etwa 8,3 Sekunden geht bei FST nie eine zweite Kaufanfrage raus.

**Wir:** content.js Z. 172 (Untergrenze 8 Sekunden) und Z. 162-163 (zusaetzlich 3-5 Sekunden Zufallspause). Was Verschieben und Einstellen schon gebraucht haben, wird angerechnet (Z. 5312-5320).

**Was du merkst:** Merkt man nicht. Beide warten rund 8 bis 13 Sekunden zwischen zwei Kaeufen.

**Hinweis der Gegenprobe:** Haelt NICHT ganz stand. Der Satz "unter etwa 8,3 Sekunden geht bei FST nie eine zweite Kaufanfrage raus" gilt nur fuer FSTs mittlere Einstellung. FST hat drei Tempo-Stufen, und die Stufe "Turbo" verkuerzt genau diese Pause: statt 3,3-4,0 Sekunden nur 2,5-3,1 Sekunden (scripts.js Zeile 58630-58632). Im alten Suchmodus geht FST sogar auf 1,55-1,89 Sekunden runter (Zeile 58637). Zusammen mit den 5,0-6,5 Sekunden fuers Verschieben kommt FST damit auf etwa 6,5 bis 7,5 Sekunden - nicht 8,3. Bei uns liegt die Untergrenze fest auf 8 Sekunden (content.js Zeile 172). Unser Turbo verkuerzt nur die Suchpause (Zeile 5205), diese Untergrenze aber nicht. Unterschied in der Praxis: Wer bei FST Turbo einschaltet, kauft 1 bis 2 Sekunden schneller nach als wir. Bei FSTs Standard-Einstellung sind wir gleichauf.

### 10. Mehrere Kaeufe aus einer Suche

**FST:** FST kauft je Suche genau EIN Angebot und sucht danach komplett neu (scripts.js Z. 58271 und searchAgain Z. 58469).

**Wir:** content.js Z. 214 und Z. 5455-5460: unser Bot darf noch ein zweites Angebot aus derselben Trefferliste kaufen, solange die Liste unter 15 Sekunden alt ist. Ab dem dritten ist Schluss.

**Woran es liegt:** Das ist Absicht. FSTs frische Suche ist genauer, kostet aber je Kauf eine zusaetzliche Suche - und Suchen sind bei uns die knappste Ware.

**Was du merkst:** Der zweite Kauf aus einer 10 Sekunden alten Liste geht oft ins Leere: Die Karte ist meist schon weg, die Anfrage zaehlt aber aufs Tageslimit. Dafuer sparen wir je Kauf eine Suche.

**ZU TUN:** Nach jedem Kauf neu suchen statt aus der alten Liste weiterzukaufen. Kostet dann rund eine Suche mehr pro Kauf.

### 11. Gewinn-Bremse (EA-Gebuehr wird eingerechnet)

**FST:** FST rechnet vor dem Kauf GAR NICHTS nach (scripts.js Z. 58270-58273). Erst nach dem Kauf, beim Einstellen, faellt auf, wenn der Verkaufspreis unter dem Kaufpreis liegt ("Wrong list price!", Z. 58283-58286) - da ist das Geld schon weg.

**Wir:** content.js Z. 4035-4065: nach jeder Suche rechnet der Bot nach, was der Markt jetzt hergibt, zieht EAs 5 Prozent Gebuehr ab (Z. 185) und stoppt den Spieler, wenn kein Gewinn mehr drin ist. Auch mitten in einer Trefferliste (Z. 5270).

**Woran es liegt:** Wir sind strenger als FST. Das ist eine Bremse, die FST ueberhaupt nicht hat - und bei uns gibt es keinen Haken, um sie auszuschalten.

**Was du merkst:** Faellt der Markt waehrend des Laufs unter den Zielpreis, hoert unser Bot bei diesem Spieler auf. FST kauft weiter - und macht Verlust. Umgekehrt: Wenn sich der Markt nur kurz verzieht, steht unser Spieler still, FST nicht.

**ZU TUN:** Wenn es wirklich 1:1 sein soll, braeuchte die Gewinn-Bremse einen Haken in den Optionen. Empfehlung: lassen, wie es ist - hier ist "nicht 1:1" der Vorteil.

### 12. Max. Kaeufe, Laufzeit und Budget

**FST:** FSTs Kauf-Stopp ist standardmaessig AUS (scripts.js Z. 3270: buyLimit false) - FST kauft dann so lange, wie es laeuft. Ein Gesamt-Budget gibt es im Snipe-Modus nicht, nur die Frage "habe ich genug Coins fuer den Hoechstpreis" (Z. 58503-58520). Dafuer ist FSTs Standard-Laufzeit nur 4 Minuten (Z. 3269 zusammen mit Z. 58765-58775).

**Wir:** content.js Z. 1517: Max. Kaeufe muss zwischen 1 und 50 liegen, Budget ist Pflicht (Z. 1514). Voreingestellt sind 3 Kaeufe, 5.000 Coins Budget und 30 Minuten Laufzeit (popup.js Z. 52-53).

**Woran es liegt:** Bei den Kaeufen sind wir enger: 50 ist bei uns die harte Obergrenze, FST kann unbegrenzt kaufen. Bei der Laufzeit sind wir dagegen grosszuegiger: 30 Minuten statt FSTs 4 Minuten, bis zu 300 Minuten moeglich.

**Was du merkst:** So wie der Bot ausgeliefert wird, hoert er nach 3 Kaeufen oder 30 Minuten auf. Wer laenger snipen will, muss beide Felder selbst hochstellen - und kommt nie ueber 50 Kaeufe in einem Lauf.

**ZU TUN:** Ein leeres Feld "Max. Kaeufe" als "unbegrenzt" zulassen, so wie FST. Das Budget bleibt sinnvoll - es schuetzt die Coins, nicht das Konto.

### 13. Grenzen je Spieler

**FST:** Nichts davon. FST kennt keine Grenze pro Spieler und keine Grenze pro Karte.

**Wir:** content.js Z. 1503-1511 und Z. 4536-4538: hoechstens 3 Kaeufe je Spieler (Standard), hoechstens 6 Kaufversuche je Spieler, dazu ein eigenes Coin-Limit je Spieler. Und Z. 201: hoechstens 20 Aktionen auf dieselbe Karte pro Tag.

**Woran es liegt:** Wieder eine Bremse, die FST nicht hat. Sie soll verhindern, dass ein einziger Spieler das Tageslimit auffrisst.

**Was du merkst:** Sechs Kaufversuche, bei denen jemand anderes schneller war, und der Spieler ist fuer diesen Lauf erledigt - obwohl noch kein einziger Kauf geklappt hat. Das ist die Grenze, die im Alltag am ehesten stoert.

**ZU TUN:** Die Grenze fuer Kaufversuche je Spieler in den Optionen einstellbar machen, so wie es mit den Suchgrenzen am 27.09. schon gemacht wurde.

### 14. Platz-Pruefung vor dem Kauf

**FST:** FST stoppt, wenn "Nicht zugewiesen" mehr als 4 Karten hat (scripts.js Z. 58488-58496) und wenn die Transferliste mit 100 Karten voll ist - vorher wird versucht, verkaufte Karten abzuraeumen (Z. 58523-58552).

**Wir:** content.js Z. 4831-4860: genau dieselben Zahlen, 4 und 100. Verkaufte Karten raeumt der Bot auf Wunsch selbst ab.

**Was du merkst:** Merkt man nicht. Beide halten an, bevor ein Kauf ins Leere geht, weil kein Platz da ist.

**Hinweis der Gegenprobe:** Haelt NICHT ganz stand. Die Zahlen 4 und 100 stimmen, und die Platzzahlen sind bei uns frisch: Der Bot fragt sie alle 20 Sekunden aus dem Speicher der App ab (content.js Zeile 6475). Das habe ich geprueft, weil ich zuerst dachte, die Zahl sei veraltet - ist sie nicht. Aber: Bei FST gilt die Grenze von 4 Karten nur, wenn ein Haken AUS ist. FST hat in seinen Einstellungen einen Schalter "unbegrenzt Nicht zugewiesen" (scripts.js Zeile 33861). Ist er an, ignoriert FST die 4 komplett und kauft weiter, bis 99 Karten dort liegen - und raeumt den Stapel zwischendurch aus seiner eigenen Zaehlung heraus (Zeile 58590). Bei Nutzern mit dem passenden Zugang schaltet FST diesen Haken sogar von selbst an (Zeile 33531). Unser Bot hat diesen Schalter nicht, weder in der Oberflaeche noch im Code. Bei uns gilt die 4 immer. Spuerbar wird das bei "Gekaufte Spieler liegen lassen": Nach 5 Karten stoppt unser Bot, FST mit dem Haken laeuft weiter.

## Verkaufen (4)

### 15. Nach dem Kauf sofort zum Verkauf einstellen ("Gleich verkaufen")

**FST:** scripts.js 58278-58327: nach dem Kauf 4,1-6,0 Sekunden warten, dann listItem. In listItem (58411-58436) noch 0,6-0,925 Sekunden, dann services.Item.list(Karte, Start, Sofort, 3600). Startgebot = Sofortpreis minus eine Preisstufe.

**Wir:** content.js 4162-4200 gleichEinstellen, aufgerufen in content.js 4652-4666. Wartezeiten in content.js 179-182 sind genau 4100-6000 und 600-925 Millisekunden. Dauer 3600 Sekunden, Startgebot eine Stufe darunter (content.js 4178-4180).

**Was du merkst:** Nichts Sichtbares - die Karte steht nach dem Kauf in rund 5 bis 7 Sekunden im Verkauf, genau wie bei FST.

**Hinweis der Gegenprobe:** Die Uhr stimmt, das Ergebnis nicht immer. Die Wartezeiten sind wirklich gleich (content.js 179-182: 4100-6000 und 600-925 Millisekunden, wie FST in Zeile 58317 und 58414), die Dauer ist 1 Stunde, das Startgebot liegt eine Stufe darunter. Aber woher der Preis kommt, ist bei uns voellig anders. Bei FST tippt man den Verkaufspreis selbst in den Filter ein (listBuyNowPrice, scripts.js 59392-59403, Mindestpreis 200). Der Preis ist damit immer da, und FST stellt nach JEDEM Kauf ein. Bei uns rechnet der Bot den Preis selbst aus einem Preis-Check aus (content.js 4130-4157). Dieser Preis darf hoechstens 60 Minuten alt sein. Ist er aelter, oder gibt es ihn nicht, wird NICHTS eingestellt - die Karte geht nur auf die Transferliste (content.js 4671-4680). Die Oberflaeche warnt davor sogar selbst (popup.js 5814-5817: "Es wird dann nichts eingestellt"). Ein Feld, in das man wie bei FST einen festen Verkaufspreis eintippt, haben wir nicht. Zweite Grenze, die FST nicht hat: jedes Einstellen zaehlt als "Aktion" (content.js 3193 und 4190). Es sind nur 50 Aktionen pro Stunde und 120 pro Tag erlaubt (content.js 127 und 133). Ist das Kontingent leer, wird nicht eingestellt. Drittens steht "Gleich verkaufen" im Standard AUS - vorgewaehlt ist "Liegen lassen" (popup.html 472). Bei FST muss man es auch anschalten, das ist also kein Nachteil. Fazit: gebaut und richtig getaktet, aber nicht dasselbe Ergebnis. Es fehlt ein eigenes Feld fuer den Verkaufspreis, damit auch ohne frischen Preis-Check eingestellt wird.

### 16. Woher der Verkaufspreis kommt

**FST:** scripts.js 59392-59404 getListPrice: FST nimmt eine Zahl, die der Nutzer selbst eingetippt hat (listBuyNowPrice, scripts.js 1594-1601), oder eine feste Zahl je Spieler aus seinen "listingProfiles". Diese Zahl veraltet nie.

**Wir:** content.js 4130-4157 listPreisFuer: Der Preis kommt aus dem letzten Preis-Check und darf hoechstens 60 Minuten alt sein (content.js 183). Es gibt bei uns kein Feld, in das man einen Verkaufspreis eintippen kann - popup.html 833 zeigt "Verkauf ca." nur an.

**Woran es liegt:** Der Preis-Check ist waehrend eines Laufs gesperrt (content.js 2714: "Erst den Bot stoppen, dann den Preis pruefen"). Der Preis kann also im Lauf nicht frisch werden. Nach 60 Minuten Laufzeit liefert listPreisFuer nur noch einen Fehler.

**Was du merkst:** Sehr. Laeuft der Bot laenger als eine Stunde, stellt er ab dann keine Karte mehr ein. Jeder Kauf landet nur noch auf der Transferliste, und im Protokoll steht "Nicht eingestellt: Kein frischer Verkaufspreis". FST stellt auch nach acht Stunden noch jede Karte ein.

**ZU TUN:** Ein Feld fuer einen festen Verkaufspreis je Filter einbauen, wie FSTs listBuyNowPrice. Dieser Preis verfaellt dann nicht. Zweitbeste Loesung: den Preis waehrend des Laufs aus der Marktaufnahme nachfuehren, die der Bot ohnehin macht (content.js 2149 gedaechtnisMerken) - das kostet keine zusaetzliche Anfrage.

### 17. Verkaufte Karten abraeumen, wenn die Transferliste voll ist

**FST:** scripts.js 58523-58556: Genau bei 100 Karten und wenn der Haken clear_sold_items gesetzt ist, wartet FST 1,1-1,8 Sekunden, raeumt ab, wartet 2,5-3,5 Sekunden und macht weiter. Ist die Liste danach noch voll, stoppt es.

**Wir:** content.js 3356-3389 wacheAbraeumen, ausgeloest in content.js 3432-3444 - ebenfalls erst bei 100 Karten und nur mit dem Haken "Verkaufte automatisch abraeumen" (popup.html 635). Ohne Haken stoppt der Bot mit einer klaren Meldung.

**Woran es liegt:** Der Knopf "Verkaufte abraeumen" von Hand (content.js 3255-3269) liest die Liste zuerst aus dem Speicher der Web App, nicht frisch von EA. FST fragt vor jedem Abraeumen echt bei EA nach (scripts.js 59158-59214).

**Was du merkst:** Wenig, solange der Haken gesetzt ist. Ohne Haken stoppt der Bot bei voller Liste - FST tut das auch. Der Knopf von Hand kann "Es gibt nichts abzuraeumen" sagen, obwohl Karten verkauft sind, weil der Speicher der Web App veraltet ist.

**ZU TUN:** Beim Knopf von Hand zuerst frisch bei EA nachsehen, wie FST es tut.

### 18. Welcher Weg die verkauften Karten wirklich entfernt

**FST:** scripts.js 59158-59214: FST ruft services.Item.requestTransferItems() und erst in der Antwort UTTransferListViewController.prototype._clearSold(). Genau dieser Weg ist bei FST der einzige und er laeuft dort.

**Wir:** sniffer.js 597-599: Wir versuchen zwei Wege - erst services.Item.transfersDao.removeSold, dann services.Item.clearSoldItems. Der zweite wirft in dieser EA-Fassung immer (nachgemessen, analyse/Komplettpruefung-23-09.md 34). FSTs Weg _clearSold steht bei uns gar nicht in der Liste, obwohl der Plan vom 25.09. ihn als zweiten Versuch vorgesehen hat (analyse/FST-Vergleich-25-09.md 276).

**Woran es liegt:** Wir haben nur einen Weg, der ueberhaupt gehen kann, und der ist nicht der, den FST benutzt. Ob transfersDao.removeSold die Karten auch bei EA loescht oder nur in der eigenen Anzeige verschwinden laesst, ist nie live geprueft worden.

**Was du merkst:** Moeglicherweise stark. Schlimmster Fall: Das Abraeumen meldet Erfolg, bei EA liegen aber weiter 100 Karten. Dann lehnt EA jeden weiteren Kauf ab. Der Bot merkt das erst am naechsten Blick in die Liste und stoppt mit "Abraeumen hat keinen Platz gebracht" (content.js 3384-3387).

**ZU TUN:** FSTs Weg als zweiten Versuch einbauen: nach einem frischen requestTransferItems window.UTTransferListViewController.prototype._clearSold() aufrufen. Danach einmal live mit einer verkauften Karte pruefen, ob die Liste bei EA wirklich kuerzer wird.

## Live-Filter (5)

### 19. Wie viele Abzeichen eine Zeile zeigen darf.

**FST:** Alle. scripts.js Z. 35443-35468 laeuft ueber e.tags und zeichnet jedes einzelne - keine Begrenzung.

**Wir:** popup.js Z. 1092: badges.slice(0, 2) - hoechstens ZWEI, mit Abkuehlung drei.

**Woran es liegt:** Wir schneiden ab, FST nicht.

**Was du merkst:** Deutlich, und es trifft die falschen. Die Reihenfolge in popup.js Z. 1072-1076 setzt 'Nur gesehen', 'Unter Schnitt' und 'Ungeprueft' nach vorne. Bei einer Zeile aus dem Markt-Scan sind damit beide Plaetze von Warnungen belegt, und 'Gewinn+', 'Unter Preis', 'Heiss' und 'Neu' fallen raus - obwohl sie zutreffen. Der Nutzer sieht die guten Gruende nicht mehr.

**ZU TUN:** Den Deckel rausnehmen oder auf vier setzen. Eine Zeile Arbeit.

### 20. Das Abzeichen 'Chem' - Karten mit aufgesetztem Chemie-Stil (PlayStyle+).

**FST:** Eigenes Abzeichen in der Hilfe-Legende (scripts.js Z. 20659-20666), dazu ein eigener Preis-Modus chem_style_pricing und eine eigene Abzeichen-Regel 'chemstyle' im Auto-Modus (Z. 41918-41921, 42030-42033).

**Wir:** Gibt es nicht. Chemie kommt nur als Warnsatz vor (popup.js Z. 833: 'Karten mit anderer Chemie sind ein eigener Markt').

**Woran es liegt:** Wir messen den Chemie-Markt nicht getrennt und markieren ihn deshalb auch nicht.

**Was du merkst:** Karten mit aufgesetztem Chemie-Stil sind ein eigener, oft teurerer Markt. FST markiert solche Filter und rechnet den Aufpreis in den Verkaufspreis ein. Bei uns sieht der Nutzer nicht, wann hier zusaetzlich Geld liegt - und der Verkaufspreis kann zu niedrig angesetzt sein.

**ZU TUN:** Beim Preis-Check den Chemie-Stil getrennt erfassen und als Abzeichen plus Aufpreis zeigen.

### 21. 'Fuer dich' - genau eine hervorgehobene Zeile mit kurzem Grund.

**FST:** Der Server setzt is_featured auf genau einer Zeile, dazu featured_reason mit vier moeglichen Gruenden: Sicherheit, wenig Konkurrenz, frischer Preis, Markt lebhaft (scripts.js Z. 34904, 34921-34929, 35656-35692). Ist eine Zeile markiert, ist sie vorgewaehlt.

**Wir:** popup.js Z. 1463-1469 markiert genau eine Zeile, popup.js Z. 904-911 liefert die gleichen vier Gruende, popup.js Z. 1479-1484 waehlt sie vor.

**Woran es liegt:** Bei uns gibt es eine Untergrenze: Unter Wertung 4,0 wird gar keine Zeile markiert (popup.js Z. 900). FST hat keine solche Grenze - dort ist immer eine Zeile markiert, wenn der Server eine schickt.

**Was du merkst:** Gering bis mittel. Bei einer schwachen Liste steht bei uns nirgends 'Fuer dich', und der Nutzer muss selbst aussuchen. Bei FST bekommt er trotzdem einen Vorschlag. Da frisch gescannte Filter bei uns oft unter 4,0 liegen, passiert das oefter als man denkt.

**ZU TUN:** Die Grenze streichen und statt 'Fuer dich' bei schwachen Listen 'Beste dieser Liste' schreiben.

### 22. Die vier Budget-Reiter (Gesamt, Niedrig, Mittel, Hoch).

**FST:** Vier Reiter, die nur ein- und ausblenden (scripts.js Z. 35100-35200, 35694-35700). Die Einteilung kommt vom Server, und die Coins des Nutzers werden dabei mitgeschickt (Z. 34892-34896).

**Wir:** popup.html Z. 493-496 hat die vier Knoepfe, popup.js Z. 1223-1225 teilt nach festen Preisen ein: bis 5.000 niedrig, bis 25.000 mittel, darueber hoch. popup.js Z. 1456-1461 blendet nur aus und wirft nichts weg - wie FST.

**Woran es liegt:** Unsere Grenzen sind fest verdrahtet. FST teilt nach dem Geld des Nutzers ein.

**Was du merkst:** Gering. Bei 2 Millionen Coins ist bei uns alles bis 5.000 'Niedrig' - fuer diesen Nutzer ist aber auch 50.000 noch niedrig. Bei kleinem Budget merkt man nichts.

**ZU TUN:** Die Grenzen an das eingetragene Budget koppeln, zum Beispiel 10 % und 50 % davon.

### 23. Im Auto-Modus nur bestimmte Filter fahren: Wertung von-bis und Abzeichen aussuchen.

**FST:** min_filter_score und max_filter_score mit Schieber 0 bis 10 (scripts.js Z. 41954-41955, 42716). Dazu je Abzeichen 'include' oder 'exclude' (Z. 41912-41960). Ohne ein einziges Abzeichen startet FST gar nicht (Z. 42596-42599).

**Wir:** Gibt es nicht. popup.js Z. 3752-3757 sagt ausdruecklich: KEINE Schwelle bei der Wertung. Es wird nur sortiert. In popup.html gibt es kein Feld dafuer.

**Woran es liegt:** Wurde nie gebaut. Der Grund im Kommentar: Mit einer Schwelle von 6,0 fand die Rotation nie einen Filter, weil unsere Wertungen niedriger ausfallen.

**Was du merkst:** Deutlich fuer jeden, der die Rotation laufen laesst. Bei FST kann man sagen: 'Fahre nur Filter ab 7,0 und nur solche mit Unter-Preis-Abzeichen.' Bei uns nimmt die Rotation die bestbewerteten der Reihe nach - aussuchen kann man nicht. Wer nur die sichersten Filter fahren will, kann das nicht einstellen und muss zusehen, wie der Bot auch schwache Filter abfaehrt.

**ZU TUN:** Zwei Felder in der Auto-Ansicht: Mindestwertung und Haken je Abzeichen. rotationKandidaten (popup.js Z. 3738) filtert danach. Die Mindestwertung muss dabei standardmaessig bei 0 stehen, sonst passiert wieder 'kein Filter gefunden'.

## Preise messen (5)

### 24. Aufschlag nach Preisklasse (bei billigen Karten darf der Preis weiter hoch)

**FST:** scripts.js 28022-28034: bis 1.000 das 1,6-fache, bis 10.000 das 1,45-fache, bis 50.000 das 1,3-fache, bis 200.000 das 1,2-fache, darueber 1,15. Angewendet in getPriceCeiling (28439-28453) auf den MARKTANKER - das billigste Angebot, das schon 5 Minuten stand. Und nur in der Methode 'lazy' (scripts.js 28022: vs = ['lazy']).

**Wir:** content.js 2304-2315: 0,4 / 0,3 / 0,22 / 0,18, sonst 0,15. Angewendet auf UNSEREN gemessenen Marktpreis, in allen drei Methoden. Zusaetzlich gekappt auf das teuerste Angebot, das wir wirklich gesehen haben (content.js 2383-2385).

**Woran es liegt:** Drei Unterschiede: die Zahlen sind etwa halbiert (0,4 statt 0,6), die Grundzahl ist eine andere (unser Marktpreis statt FSTs Anker), und wir haben zusaetzlich die Bremse 'nie ueber das teuerste gesehene Angebot', die FST nicht hat.

**Was du merkst:** Bei einer 400-Coin-Karte laesst FST bis zu 60 Prozent ueber dem Anker zu, wir hoechstens 40 Prozent ueber unserem Marktpreis - und praktisch nur so weit, wie wir ein Angebot wirklich gesehen haben. Unser Verkaufspreis liegt dadurch oft 1 bis 2 Preisstufen tiefer, das sind bei billigen Karten 50 bis 100 Coins pro Karte.

**ZU TUN:** Den Marktanker als Grundzahl nehmen (er wird schon gesammelt, content.js 2141-2180), FSTs Zahlen einsetzen und die Bremse gesehenMax lockern.

### 25. EA-Mindestpreis und EA-Hoechstpreis

**FST:** Benutzt EAs Felder NICHT - im ganzen Buendel kein einziger Treffer auf marketDataMinPrice oder _itemPriceLimits. FSTs Preisspanne kommt vom eigenen Server (scripts.js 45062, 42278: a.price_range). Und FST BRICHT AB, wenn der Preis zu nah an der Spanne liegt (28104-28110, 28131-28136, 28222-28227: 'The card price is to close to the price range').

**Wir:** content.js 2487-2489 liest EAs eigene Felder marketDataMinPrice und marketDataMaxPrice, klemmt damit den Vorschlag (2512-2521) und den Verkaufspreis beim Einstellen (4168-4174).

**Woran es liegt:** Unsere Quelle ist besser (kostenlos, von EA selbst, kein fremder Server). Aber FSTs Verhalten fehlt: Klebt der Preis am EA-Minimum, startet FST diesen Filter gar nicht. Wir schreiben nur eine Notiz und machen weiter - erst der Gewinn-Check danach faengt es ab.

**Was du merkst:** Bei Karten am EA-Minimum verbrauchen wir Suchen fuer einen Filter, der nie Gewinn bringen kann. FST spart die Suchen.

**ZU TUN:** Einen Abbruch einbauen: Liegt der Marktpreis auf oder direkt ueber dem EA-Minimum, den Filter gar nicht anbieten.

### 26. Ganz frische Angebote zaehlen beim Marktpreis nicht mit

**FST:** scripts.js 28345-28356 und 27447-27470: gezaehlt wird 'minutes > 1'. Da FST die Minuten abrundet, heisst das: alles unter 120 Sekunden gilt als frisch und zaehlt nicht als altes Angebot. Die Laufzeiten-Tabelle (28305-28338) ist dieselbe wie unsere.

**Wir:** content.js 2280: MARKT_FRISCH_AB_S = 60. Angewendet in 2448-2463, im Fenster sichtbar (popup.js 828-829).

**Woran es liegt:** Unsere Grenze ist 60 Sekunden, FSTs ist 120. Der Kommentar in content.js 2278-2279 behauptet, FST lasse alles unter einer Minute weg - das ist falsch abgelesen. Ausserdem: Bleiben nach dem Ausfiltern weniger als 5 gereifte Angebote uebrig, nehmen wir wieder ALLE, auch die ganz frischen (content.js 2462).

**Was du merkst:** Angebote, die zwischen 1 und 2 Minuten alt sind, rechnen bei uns mit und bei FST nicht. Das drueckt unseren gemessenen Marktpreis leicht nach unten - bei ruhigen Karten spuerbar, bei lebhaften kaum.

**ZU TUN:** 60 auf 120 setzen und den falschen Kommentar richtigstellen. Zwei Zeilen.

### 27. Chemie (aufgesetzter Spielstil) trennt die Maerkte

**FST:** scripts.js 29356-29368 (Nc) macht aus EINEM Filter mehrere - einen je Chemie. Jeder bekommt einen eigenen vollen Preis-Check. Beim Einstellen sucht FST den Verkaufspreis nach Spieler UND Kartenart UND Chemie (scripts.js 59392-59403).

**Wir:** content.js 2433-2443: eine Messung, und aus der Trefferliste bleiben nur die Angebote mit derselben Chemie wie das billigste Angebot. Mindestens die Haelfte muss ihre Chemie kennen und mindestens 4 muessen uebrig bleiben, sonst wird nicht getrennt.

**Woran es liegt:** Drei Loecher. Erstens: ein Preis statt einer je Chemie. Zweitens - das ist der ernste Punkt: Der Kauf-Abgleich isMatch (content.js 2108-2119) prueft die Chemie ueberhaupt nicht. Wir messen also den Preis fuer die Chemie des billigsten Angebots und kaufen danach jede Chemie zu diesem Preis. Drittens: Ob EA das Feld playStyle in den Suchtreffern mitschickt, ist ungemessen - fehlt es, wird still gar nicht getrennt und niemand merkt es.

**Was du merkst:** Bei Karten mit aufgesetztem Spielstil kann der Verkaufspreis deutlich daneben liegen. Gemessen wird die nackte Karte, gekauft vielleicht die veredelte - oder umgekehrt, dann bleibt die Karte liegen.

**ZU TUN:** Die Chemie in isMatch aufnehmen, das ist der wichtigste Handgriff. Dann die Feldprobe laufen lassen. Je Chemie einzeln messen waere FSTs Weg, kostet aber die vierfache Zahl Suchen.

### 28. Den gefundenen Preis selbst verschieben

**FST:** scripts.js 28646-28658 (applyPriceOffset): der Nutzer kann in Prozent ODER in ganzen Preisstufen verschieben, nach oben UND nach unten, und das Ergebnis wird auf die Preisspanne geklemmt.

**Wir:** popup.html 591 und popup.js 680-712: nur 'Abschlag fuer den Vorschlag (%)', also nur nach unten und nur in Prozent.

**Woran es liegt:** Verschieben in ganzen Preisstufen fehlt, und nach oben geht es gar nicht.

**Was du merkst:** Bei billigen Karten ist Prozent grob: 10 Prozent von 400 Coins sind 40, das rundet auf eine ganze 50er-Stufe. Wer genau eine Stufe tiefer kaufen will, kann das bei uns nicht sagen.

**ZU TUN:** Ein zweites Feld 'Verschieben um ... Preisstufen' mit Plus und Minus.

## Rotation (6)

### 29. Wie lange ein Filter laeuft, bevor gewechselt wird

**FST:** scripts.js Z. 41940-41942: 50 Suchen je Filter, 5 Kaeufe je Filter, 10 Kaufversuche je Filter.

**Wir:** popup.js Z. 3946-3960: 40 Suchen (einstellbar 10-80), 5 Kaeufe, 10 Kaufversuche. content.js Z. 5156-5158 haelt alle drei Grenzen wirklich ein.

**Woran es liegt:** Wir geben einem Filter 40 Suchen, FST 50. Kaeufe und Kaufversuche sind gleich.

**Was du merkst:** Ein Filter laeuft bei uns etwa ein Fuenftel kuerzer. Man kann es in der Leiste selbst auf 50 stellen - dann ist es genau gleich.

**ZU TUN:** Standardwert von 40 auf 50 setzen, damit man nichts nachstellen muss.

### 30. Pause zwischen zwei Filtern

**FST:** scripts.js Z. 41943-41946: 300 Sekunden Pause zwischen Filtern, jede 4. Pause 400 Sekunden, Zufall 20 Prozent. Z. 42222 zeigt: die Pausenlaenge kommt vom Server.

**Wir:** popup.js Z. 3774-3781 (rotPauseMs): 35 Sekunden Grundpause, bis 40 Prozent Zufall drauf, jede 3. Pause mal 2,5.

**Woran es liegt:** Unsere Standardpause ist 35 Sekunden, FSTs Standard ist 300 Sekunden. Die 35 Sekunden stehen in FSTs Code nur als Notwert, wenn der Server nichts sagt - wir haben den Notwert abgeschrieben, nicht den echten Standard.

**Was du merkst:** Wir gehen achtmal schneller zum naechsten Filter als FST. Das ist kein Nachteil beim Verdienen, aber mehr Betrieb auf dem Konto in kurzer Zeit - genau das, was am 22.09. die 461-Sperre ausgeloest hat.

**ZU TUN:** Standard auf 300 Sekunden setzen (das Feld erlaubt schon bis 300) und die lange Pause auf jeden 4. Filter legen statt auf jeden 3.

### 31. Was passiert, wenn kein brauchbarer Filter mehr da ist

**FST:** scripts.js Z. 42230-42235: im Live-Filter-Modus setzt FST 'waitingForFilters' und fragt nach 20 Sekunden wieder nach - die Sitzung laeuft weiter. Nur im Custom-Modus hoert er auf.

**Wir:** popup.js Z. 3831-3834: 'Fertig: Kein frischer Filter mehr uebrig. Scanne den EA-Markt neu.' - die Rotation ist beendet. Ebenso Z. 3849-3852 nach drei Leerrunden.

**Woran es liegt:** Wir beenden die Rotation, FST wartet und fragt weiter. Der Grund ist, dass unsere Live-Filter nach 15 Minuten ablaufen (popup.js Z. 1127, 3759) und nur ein neuer Markt-Scan neue liefert. Der Scan wird aber nicht aus der Rotation heraus angestossen.

**Was du merkst:** Nach etwa 15 Minuten ist die Rotation zu Ende und der Nutzer muss selbst in den Reiter Filter gehen und scannen. Bei FST laeuft die Sitzung die ganze Stunde durch.

**ZU TUN:** Wenn alle Filter abgelaufen sind: nicht beenden, sondern selbst einen Markt-Scan starten (content.js startMarketScan, Z. 2971) und dann weitermachen - so wie FST nach 20 Sekunden neu fragt.

### 32. Deckel von 12 Filtern je Runde

**FST:** Kein Gegenstueck. FST begrenzt nur Zeit (minutes) und freiwillig Suchen/Gebote (scripts.js Z. 41929-41934). Die Zahl der Filter ist offen.

**Wir:** content.js Z. 232 (ROTATION_MAX_FILTER: 12) und Z. 5015: 'Fertig: Hoechstens 12 Filter je Rotation.'

**Woran es liegt:** Wir haben eine harte Obergrenze, FST nicht.

**Was du merkst:** Merkt man heute nicht - wegen des Stundenlimits kommen wir ohnehin nie auf 12. Spuerbar wuerde es nur, wenn jemand die Laufzeit auf mehrere Stunden stellt (bis 300 Minuten sind erlaubt, content.js Z. 246): dann endet die Rotation nach etwa vier Stunden, obwohl noch Zeit waere.

**ZU TUN:** Den Deckel an die Laufzeit koppeln statt fest auf 12, oder ganz weglassen - die Suchgrenzen bremsen schon genug.

### 33. Rotation ueber eine selbst gewaehlte Filterliste (FSTs Custom-Modus)

**FST:** scripts.js Z. 42013-42021 und Z. 42080-42160: filter_type 'custom_filters'. Der Nutzer legt eine eigene Liste an - eigene Filter, gesuchte Karten, gespeicherte Vorlagen - und der Bot arbeitet diese Liste ab. Dazu ein dritter Modus 'live_preset' fuer eine gespeicherte Vorlage.

**Wir:** popup.html Z. 245-253: genau zwei Karten, 'Ein Spieler' und 'Live-Filter'. popup.js Z. 3748 (rotationKandidaten) nimmt ausschliesslich liveFilterRows, also nur die Treffer des eigenen Markt-Scans.

**Woran es liegt:** Es gibt bei uns keine Liste mehrerer eigener Spieler, die der Bot der Reihe nach abarbeitet. Entweder ein einzelner Spieler oder die Scan-Treffer.

**Was du merkst:** Wer zehn Lieblingsspieler hat, kann sie bei FST in eine Liste legen und den Bot durchlaufen lassen. Bei uns muss er nach jedem Spieler von Hand neu starten.

**ZU TUN:** Eine Merkliste einbauen und rotationKandidaten erlauben, auch aus dieser Liste zu ziehen. Die Maschine dahinter (startRun mit Zielen) kann das schon - es fehlt nur die Liste und die Auswahl in der Leiste.

### 34. Welche Filter ausgewaehlt werden und in welcher Reihenfolge

**FST:** scripts.js Z. 41952-41953: der Nutzer stellt ein Wertungsband ein (min_filter_score 0 bis max_filter_score 10), Z. 41935-41936 dazu Mindest- und Hoechstpreis der Karte (Standard ab 1.200 Coins). Der Server waehlt danach aus und kennt aus allen Nutzern, welcher Filter gerade traegt.

**Wir:** popup.js Z. 3738-3772: wir sortieren nach eigener Wertung, ohne Schwelle (bewusst, siehe Kommentar: mit Schwelle 6,0 kam nie ein Filter). Ausgeschlossen wird nur, was ueber Budget oder Coins liegt, am Kauflimit ist oder abgelaufen. Der zuletzt gefahrene Filter rutscht nach hinten und kuehlt 2 Minuten ab (content.js Z. 236, Z. 5598).

**Woran es liegt:** Die Abkuehlung und das Nachhinten-Schieben sind 1:1 (FST schickt prev_filter_id). Was fehlt: ein einstellbares Wertungsband und ein Mindestpreis der Karte. Und unsere Wertung lernt nicht aus dem Ergebnis - ein Filter, der nichts gebracht hat, kann nach 2 Minuten wieder vorn stehen.

**Was du merkst:** Kaum spuerbar bei der Reihenfolge. Spuerbar bei den billigen Karten: ohne Mindestpreis kann die Rotation auf 300-Coin-Karten laufen, wo der Gewinn nach Gebuehr fast nichts ist.

**ZU TUN:** Ein Feld 'Mindestpreis der Karte' und ein Wertungsband in die Leiste. Das Lernen aus dem Ergebnis geht nur mit eigener Statistik ueber viele Laeufe.

## Kontoschutz (1)

### 35. Das neue Loch: die Stundengrenze hat keine harte Obergrenze

**FST:** Kein Vergleichspunkt - FST hat gar keine Stundengrenze.

**Wir:** content.js Z. 660-663: der Stundendeckel rechnet sich als "eingestellte Suchgrenze + 20". Einstellbar sind bis zu 900 Suchen pro Stunde (Z. 148, GRENZE_MAX_STUNDE). Eine feste Obergrenze wie beim Tag (Z. 141, GESAMT_MAX_TAG = 440) gibt es für die Stunde NICHT.

**Woran es liegt:** Hier geht es nicht um FST, sondern um unseren eigenen Schutz. Beim Tag ist alles abgesichert: Wer 2.000 Suchen einträgt, kommt trotzdem nie über 440 Anfragen am Tag - die Einstellung bringt oberhalb von etwa 380 gar nichts mehr. Bei der Stunde fehlt genau diese Absicherung.

**Was du merkst:** Wer die Stundengrenze auf 900 stellt, kann das ganze Tagesbudget von 440 Anfragen in gut einer halben Stunde verschießen. Genau diese Ballung - viele Anfragen in kurzer Zeit - hat am 21.09. die 521 ausgelöst, nicht die Tagessumme allein. Wer nichts einstellt, merkt davon nichts: dann gelten weiter 150 pro Stunde.

**ZU TUN:** Eine harte Obergrenze für die Stunde einbauen, so wie GESAMT_MAX_TAG es für den Tag tut. Zum Beispiel: nie mehr als ein Viertel des Tagesdeckels in eine Stunde, also rund 110 Anfragen. Dazu im Einstellfenster klar sagen, was eine hohe Stundengrenze bedeutet.

## Marktlage (5)

### 36. Konkurrenz "x von 5" - wie viele Schnäppchen andere wegkaufen

**FST:** Der Server schickt die Stufe fertig mit, sie steht immer da (scripts.js Z. 37419-37422, Daten kommen mit /api/filters, Z. 34907).

**Wir:** popup.js Z. 4573-4583 rechnet es selbst. Bedingung: mindestens 3 Messungen, bei denen zwischen erster und zweiter Marktaufnahme 60 Sekunden liegen (popup.js Z. 632, content.js Z. 114).

**Woran es liegt:** Der Preis-Check macht die zweite Aufnahme direkt nach der ersten. Zwischen zwei Suchen liegen 3 Sekunden (content.js Z. 78, Z. 2646-2665). Der Abstand ist also fast immer 3 bis 10 Sekunden - nie 60. Der Markt-Scan misst gar nichts (content.js Z. 2913-2915). Damit ist die Bedingung praktisch nie erfüllt.

**Was du merkst:** Das Kästchen "Konkurrenz" steht dauerhaft auf "noch unbekannt". Auch in der Filterliste steht immer "Aktivität noch nicht messbar" (popup.js Z. 1561), die Abzeichen "wenig Konkurrenz" und "Markt lebhaft" (Z. 907-909) erscheinen nie, und die Warnung bei "Geduldig verkaufen" (Z. 1725) greift nie. Auch die 10 Punkte Abzug bei hoher Konkurrenz (Z. 4699-4701) greifen nie.

**ZU TUN:** Entweder die Kontrollmessung des Preis-Checks 60 Sekunden später ansetzen (kostet eine Minute pro Check), oder die Konkurrenz aus zwei Suchen desselben Filters im laufenden Betrieb rechnen - die liegen ohnehin Minuten auseinander und kosten keine zusätzliche Anfrage.

### 37. "Nächstes Hoch" mit Wochentag und Uhrzeit

**FST:** Der Server nennt einen genauen Zeitpunkt, angezeigt als Wochentag plus Uhrzeit, zum Beispiel "Samstag 20:30" (scripts.js Z. 37403-37416).

**Wir:** popup.js Z. 4635-4648 nennt nur eine Uhrzeit, zum Beispiel "20 Uhr (in 3 Stunden)". Die Quelle sind die eigenen besten Stunden (Z. 4528-4545, mindestens 30 Suchen je Tagesstunde).

**Woran es liegt:** Zwei Unterschiede: Der Wochentag fehlt ganz. Und wir können nur Stunden nennen, in denen schon gebotet wurde - eine gute Zeit, die der Nutzer noch nie ausprobiert hat, kann bei uns nie erscheinen.

**Was du merkst:** Wer immer nur abends von 20 bis 22 Uhr botet, bekommt für immer "20 Uhr" oder "21 Uhr" angezeigt. Der Hinweis sagt also nur zurück, was man schon tut. Bis überhaupt etwas steht: 30 Suchen in derselben Tagesstunde; für eine sinnvolle Reihenfolge mehrere verschiedene Stunden, also in der Praxis mehrere Tage.

**ZU TUN:** Wochentag und Stunde zusammen als Eimer zählen, nicht nur die Stunde. Und ehrlich dazuschreiben, dass nur Stunden verglichen werden, in denen schon gesucht wurde.

### 38. Vergleich zum üblichen Niveau ("+12 % gegenüber sonst")

**FST:** Der Server liefert eine Prozentzahl, angezeigt als "+12 %" oder "wie üblich" (scripts.js Z. 37394-37400).

**Wir:** popup.js Z. 4610-4633 vergleicht die eigene Trefferquote mit der eigenen Quote zur selben Uhrzeit an anderen Tagen - und gibt nur einen Satz zurück, keine Zahl.

**Woran es liegt:** Keine Prozentzahl, nur drei Sätze. Und der Vergleich braucht 30 Suchen in derselben Tagesstunde aus Läufen, die älter als 2 Stunden sind (Z. 4618).

**Was du merkst:** Am ersten Tag steht die Zeile leer. Danach steht dort "Lebhafter Markt", "Ruhiger Markt" oder "Normaler Markt" - alles zwischen 25 % schlechter und 25 % besser heißt bei uns "normal", wo FST "+18 %" anzeigen würde.

**ZU TUN:** Die Prozentzahl mit anzeigen statt nur das Wort.

### 39. Effizienz: Treffer / Erfolg

**FST:** Zwei Prozentzahlen vom Server: Trefferquote und Erfolgsquote (scripts.js Z. 37425-37432, angezeigt Z. 37505-37518).

**Wir:** popup.js Z. 4739-4742: "Treffer je 100 Suchen (letzte 6 Std.)" und "wie oft daraus ein Kauf wurde (heute)".

**Woran es liegt:** Dieselben zwei Zahlen, aber FSTs Zahlen kommen aus dem Markt, unsere nur aus dem eigenen Konto. Für die Frage "läuft es bei mir gut?" ist unsere Zahl sogar die passendere.

**Was du merkst:** Der linke Teil braucht 20 eigene Suchen, der rechte Teil mindestens 3 Treffer am selben Tag - sonst steht dort "–".

### 40. Die Zahl 0 bis 100 mit Wort und Farbbalken

**FST:** Punktezahl, Wort (Excellent/Good/Average/Bad), Zeiger auf einem Farbbalken, dazu ein erklärender Satz vom Server (scripts.js Z. 37455-37490). Die Kachel selbst ist nur für Premium-Kunden (Z. 20529-20546).

**Wir:** popup.js Z. 4723-4727 und popup.html Z. 89-104: gleiche Zahl, vier Wörter (schlecht/mittel/gut/sehr gut), gleicher Zeiger auf dem Balken, dazu eine Liste, wie sich die Zahl zusammensetzt (Z. 4761-4767). Kein Aufpreis.

**Woran es liegt:** Das Aussehen stimmt, aber die Zahl bedeutet etwas anderes. Bei uns steckt zu einem Viertel die Anzahl der eigenen Filter darin, dazu 25 Punkte Abzug wenn EA langsam antwortet und ein Deckel von 10 bei laufender Sperre (Z. 4679-4696). Das ist unser eigener Zustand, nicht der Markt.

**Was du merkst:** Die Zahl kann sinken, weil der letzte Markt-Scan wenige Filter gebracht hat - obwohl am Markt alles unverändert ist. Zwei Nutzer zur gleichen Minute bekommen bei uns verschiedene Zahlen, bei FST dieselbe. Dafür sagt unsere Aufschlüsselung, WARUM die Zahl so ist; FSTs Satz kommt fertig vom Server.

**ZU TUN:** Markt und eigener Zustand getrennt anzeigen: eine Zahl für den Markt, eine für die eigene Ausrüstung.

## Bedienung (6)

### 41. Jede Einstellung auf "Auto" oder "Eigene", und unter Auto steht im Klartext, was gerade gilt

**FST:** Ein Baustein "SetRow" mit den zwei Knöpfen Auto/Custom und einem Klartext-Satz darunter (scripts.js Z. 26379-26447). FST benutzt ihn achtmal: Budget (Z. 40150), Höchstpreis je Karte (Z. 40229), Laufzeit (Z. 40287), Mindestgewinn (Z. 40512), Grenzen je Filter (Z. 40570), Tempo (Z. 40687), Verkaufspreis (Z. 40848), Pausen (Z. 41077).

**Wir:** Fünf solche Zeilen im Start-Fenster: Tempo, Pausen, Laufzeit, Grenzen je Spieler, Gebote (popup.html Z. 907-955, Schaltlogik popup.js Z. 5721-5768). Jede hat Auto/Eigene und einen Klartext-Satz.

**Woran es liegt:** Drei von FSTs acht Zeilen gibt es bei uns nicht als Auto/Eigene-Zeile: Budget, Höchstpreis je Karte und Mindestgewinn. Budget und Max. Käufe sind bei uns ein nackter Zahlenkasten in Schritt 4 (popup.html Z. 458), der Mindestgewinn steckt im Filter-Fenster.

**Was du merkst:** Wenig. Die drei Sachen kann man auch bei uns einstellen, nur an einer anderen Stelle und ohne den Auto-Knopf. Man klickt zwei Mal mehr.

**ZU TUN:** Budget, Höchstpreis und Mindestgewinn als drei weitere Zeilen in die Feinabstimmung holen, mit demselben Auto/Eigene-Schalter.

### 42. Unter "Auto" steht eine ECHTE Zahl aus deinem Konto - zum Beispiel "Nutzt dein ganzes Guthaben - 18K"

**FST:** FST liest den Kontostand und setzt Budget = ganzes Guthaben, Höchstpreis = daraus abgeleitet (scripts.js Z. 41939-41941). Der Auto-Satz nennt diese Zahl mit (Z. 40155 und 40229: "balance" wird in den Text eingesetzt).

**Wir:** Unsere Auto-Sätze stehen als fester Text in der Datei (popup.html Z. 911, 919, 927, 936, 946) und werden nie neu gerechnet. Das Budget startet bei jedem mit festen 5.000 Coins (popup.js Z. 52). Der Kontostand wird zwar angezeigt (popup.js Z. 4969), aber nirgends in eine Einstellung eingesetzt.

**Woran es liegt:** Wir haben für Budget und Höchstpreis gar keine Auto-Zeile, und keine unserer Auto-Zeilen holt eine lebende Zahl. Der Text ist geraten, nicht gemessen.

**Was du merkst:** Deutlich. Wer 200.000 Coins hat, startet bei uns trotzdem mit 5.000 Budget - der Bot hört nach einer einzigen mittleren Karte auf. Bei FST läuft er mit allen 200.000 weiter. Das muss man von Hand ändern und jedes Mal selbst wissen.

**ZU TUN:** Eine Zeile "Budget: Auto / Eigene" bauen. Auto heißt: ganzes Guthaben, und der Satz darunter nennt es ("Nutzt dein ganzes Guthaben - 187K"). Dasselbe für den Höchstpreis je Karte.

### 43. Vor dem Start steht da, wie lange der Lauf dauert und wie viele Suchen er macht

**FST:** Hat FST nicht. FST zeigt nur die Laufzeit-Einstellung selbst (Z. 40287-40320).

**Wir:** Das Start-Fenster schätzt: "bis zu X Suchen · ca. Y Min." (popup.js Z. 5979). Gerechnet wird mit 12 Sekunden je Suche bei Normal, 17,5 bei Sicher, 6,5 bei Turbo (popup.js Z. 5969).

**Woran es liegt:** Die Zahlen sind veraltet. Der Bot sucht seit dem 25.09. im Tempo von FST: rund 3,3 bis 4,6 Sekunden bei Normal (content.js Z. 5203-5208). Die Schätzung im Start-Fenster weiß davon nichts und nennt die zwei- bis dreifache Zeit. An anderer Stelle rechnen wir schon richtig - die Filterkarte mit "rund X Coins in der Stunde" nimmt 3,9 Sekunden (popup.js Z. 1194-1196). Zwei Stellen in derselben Oberfläche widersprechen sich also.

**Was du merkst:** Ja, und es ärgert. Das Fenster sagt "ca. 22 Min.", der Bot ist nach 8 Minuten am Stundenlimit und wartet. Man glaubt an einen Fehler, obwohl nur die Schätzung falsch ist.

**ZU TUN:** In popup.js Z. 5969 dieselben Sekunden eintragen, die content.js wirklich benutzt (Sicher ~4,6 / Normal ~3,9 / Turbo ~3,0) und die Pause auf 90 Sek. je 45 Suchen bringen. Eine Zeile Arbeit.

### 44. Während der Bot läuft sehen, welche Einstellungen gerade gelten

**FST:** Ein Streifen "Settings overview" mit kleinen Schildchen: Filter, Budget, Laufzeit, Mindestgewinn, Tempo, Pausen (scripts.js Z. 43700-43758). Er steht während des Laufs da.

**Wir:** Sobald der Lauf beginnt, blenden wir ALLE Einstellungen aus (popup.js Z. 4334). Sichtbar bleiben Laufzeit mit Restzeit, Pausenbalken, der aktuelle Spieler und der Verlauf. Was Budget, Grenzen und Tempo gerade sind, steht nirgends. Nur im Auto-Modus VOR dem Start gibt es einen solchen Satz (popup.js Z. 3536-3553: "Es gilt: Tempo Normal · Pausen ausgewogen · …").

**Woran es liegt:** Den Klartext-Satz haben wir gebaut, aber nur für die Zeit vor dem Start. Im Lauf ist er versteckt.

**Was du merkst:** Merkt man selten. Wer gerade gestartet hat, weiß noch, was er eingestellt hat. Nach einer Stunde Zuschauen weiß man es nicht mehr.

**ZU TUN:** Den Satz aus renderAutoEinstellungen (popup.js Z. 3536) auch im Lauf-Fenster anzeigen, unter der Laufzeit.

### 45. Einstellungen als Vorlage speichern und wieder laden

**FST:** "Save preset" und "Load preset" unten im Custom-Bereich (scripts.js Z. 41212-41222), die gespeicherten Vorlagen stehen als Liste auf der Startseite (Z. 24204-24230). Gespeichert wird nur der Einstellungs-Satz - auf FSTs Server, also auch an einem anderen Rechner da.

**Wir:** "Sammlungen": speichert die Spielerliste UND den ganzen Einstellungs-Satz (popup.js Z. 6324-6358). "Laden" holt nur die Spieler, "Laden mit Einstellungen" holt beides, und jede Zahl wird dabei in den erlaubten Bereich zurückgeholt und das offen gesagt (Z. 6386-6396). Höchstens 20 Sammlungen (Z. 6194).

**Woran es liegt:** Man kann bei uns KEINE Vorlage ohne Spielerliste speichern - der Knopf weigert sich, wenn die Zielliste leer ist (popup.js Z. 6328). Wer nur "mein vorsichtiger Satz" sichern will, muss erst irgendeinen Spieler dazulegen. Und unsere Vorlagen liegen nur auf diesem Rechner.

**Was du merkst:** Wenig. Der übliche Fall - eine Handelsart mit ihren Spielern - geht bei uns sogar in einem Klick, weil Spieler und Einstellungen zusammen wandern. Nur der Sonderfall "nur Einstellungen" fehlt.

**ZU TUN:** Die Sperre bei leerer Zielliste in popup.js Z. 6328 lockern und Sammlungen ohne Spieler erlauben. Das Ablegen auf einem Server geht nicht, dafür bräuchte man FSTs Server.

### 46. Hilfe, die zur gerade offenen Seite passt

**FST:** Eine Hilfe-Kachel, die weiß, auf welcher Seite man ist, und ein Fenster mit Absätzen dazu öffnet (scripts.js Z. 20839-20880). Dazu ein langer Text, der die drei Tempo-Stufen und ihr Sperr-Risiko erklärt (Z. 55874).

**Wir:** Ein "?" oben springt in den Hilfe-Reiter, und zwar genau zum Absatz des offenen Reiters, und lässt ihn kurz aufblinken (popup.js Z. 5549-5562). Der Hilfe-Reiter deckt alle fünf Reiter ab (popup.html Z. 753-820), dazu hat fast jeder Block sein eigenes kleines "?" (z. B. popup.html Z. 454-456).

**Was du merkst:** Merkt man nicht als Unterschied. Beide Wege führen in einem Klick zur richtigen Erklärung. Unsere Erklärung zum Tempo und zum Sperr-Risiko steht in der Box "Eigene Grenzen" (popup.html Z. 717) und nennt sogar das Datum und den Fehlercode der echten Sperre - das hat FST nicht.

**Hinweis der Gegenprobe:** Der Sprung funktioniert wirklich. Das "?" oben (popup.html Z. 33) springt in den Hilfe-Reiter und genau zum Absatz des offenen Reiters (popup.js Z. 5541-5564), und das Aufblinken ist auch gebaut (popup-design.css Z. 526). Die vier Absätze hilfe-snipe, hilfe-filters, hilfe-buys und hilfe-settings gibt es alle (popup.html Z. 755, 771, 803, 812). Die sechs kleinen "?" sind verdrahtet (popup.js Z. 5319).

Aber "merkt man nicht als Unterschied" ist zu freundlich - aus zwei Gründen.

1. Unsere Hilfe ist beim Tempo und bei den Grenzen VERALTET. Im Hilfe-Reiter steht weiter "Schutzlimit erreicht: 150 Suchen pro Stunde, 350 Suchen ... am Tag" und "Wie schnell gesucht wird, hängt vom Tempo ab". Vom neuen Tempo (rund 4 Sekunden je Suche seit dem 25.09.) steht dort kein Wort, und von der neuen Box "Eigene Grenzen", mit der man die 150 selbst anheben kann, auch nicht. Ich habe den ganzen Hilfe-Reiter (popup.html Z. 745-900) danach durchsucht: kein Treffer für "Eigene Grenzen", keiner für "Sekunde". Wer also auf dem Reiter Optionen das "?" drückt, landet bei einem Text, der den heutigen Zustand nicht mehr beschreibt. Die gute Erklärung steht nur in der Box in Optionen selbst (popup.html Z. 717) - dorthin führt das "?" aber nie.

2. FSTs Hilfe ist deutlich feiner. Die Hilfe-Kachel kennt 13 Seiten (scripts.js Z. 20839-20852) und öffnet dazu einen aufgebauten Text mit Abschnitten, Unterpunkten, Erklärungen zu jedem Abzeichen und einem Link auf eine ausführliche Anleitung (scripts.js Z. 20584-20690, insgesamt 89 Hilfe-Texte). Wir haben vier Absätze für fünf Reiter. Das reicht zum Verstehen, ist aber nicht dasselbe.

Fairerweise: FSTs Hilfe-Texte kommen vom Server. Ohne Login sieht man sie nicht. Unsere sind fest eingebaut.

## Daten (2)

### 47. Sammlungen und Schnellprofile

**FST:** Filtergruppen und Handels-Vorlagen liegen auf dem Server (api/filter-groups 43021-43470, api/auto-trade-presets 38998-39205). Anzahl begrenzt der Server, nicht das Programm.

**Wir:** popup.js 6274-6360. Eine Sammlung merkt sich Spieler MIT Kartenart, Zielpreis, Verkaufspreis, Position - und seit 25.09. auch den ganzen Einstellungs-Satz (Zeile 6349). Zwei Knoepfe: "Nur Spieler" und "Spieler + Einstellungen" (popup.html 434-435). Grenze: 20 Sammlungen (Zeile 6194), Name hoechstens 40 Zeichen.

**Woran es liegt:** Funktion und Bedienung stimmen, und die Kartenart wird richtig mitgesichert. Zwei Unterschiede bleiben: Unsere Sammlungen liegen nur hier, und 20 ist eine harte Grenze.

**Was du merkst:** Kaum. 20 Sammlungen reichen im Alltag. Spuerbar wird es nur beim Rechnerwechsel - dann sind sie ohne Sicherungsdatei nicht da.

**ZU TUN:** Nichts Dringendes.

### 48. Speicherplatz - eine Grenze, die FST nicht hat

**FST:** Kennt das Problem nicht. Alles Grosse liegt auf dem Server, lokal liegen zwei kleine Werte. Kein Aufraeumen, kein Limit, keine Warnung.

**Wir:** Wir stossen an rund 10 MB (content.js 504-545). Deshalb: Warnung ab 80 % voll, hoechstens einmal pro Stunde. Ein Aufraeum-Knopf unter Optionen loescht die letzte Marktaufnahme, kuerzt den Preisverlauf auf 20 Messungen je Karte und die Spielerliste auf 25.000 (popup.js 7229-7250). Harte Deckel ueberall: 500 Kaeufe, 500 Verkaeufe, 500 Lauf-Eintraege, 60 Karten im Preisverlauf.

**Woran es liegt:** Wir haben eine Grenze, die FST nicht hat. Dass wir sie ordentlich verwalten und offen warnen, ist gut - aber sie bleibt eine Grenze.

**Was du merkst:** Merkbar bei laengerer Nutzung. Nach 500 Kaeufen faellt der erste hinten raus. Eine Auswertung ueber mehr als 14 Tage geht nicht. Wer Monatszahlen will, muss vorher als CSV exportieren (popup.html 581-582).

**ZU TUN:** Die Berechtigung "unlimitedStorage" in manifest.json wuerde die 10-MB-Grenze aufheben. Das ist ein Einzeiler und wuerde die Deckel deutlich entspannen.

## EA-Funktionen (6)

### 49. EA nach der erlaubten Preisspanne einer Karte fragen, bevor der Bot sie einstellt

**FST:** scripts.js Z. 1660: Hat die Karte keine Preisgrenzen, ruft FST services.Item.requestMarketData(Karte) auf und holt sie. Danach Z. 58282: getPriceLimits() lesen und den Verkaufspreis daran messen.

**Wir:** content.js Z. 4170-4171: eaMin/eaMax kommen nur aus Daten, die zufaellig schon da sind (Kaufantwort oder letzter Preis-Check). Fehlt beides, steht im Code ausdruecklich "begrenzt nur der Marktpreis selbst - das ist Absicht". requestMarketData kommt in unserem ganzen Ordner nicht ein einziges Mal vor, nicht einmal in der Diagnose-Liste (sniffer.js Z. 192-209).

**Woran es liegt:** Diese EA-Funktion wurde nie eingebaut. Wir sammeln die Preisspanne nur ein, wenn sie uns geschenkt wird - nachfragen kann der Bot nicht.

**Was du merkst:** Trifft den Fall "Preis von der Leiste mitgebracht" (content.js Z. 4154, dort stehen eaMin und eaMax fest auf 0). Dann stellt der Bot ohne Grenze ein. Liegt der Preis ausserhalb von EAs Spanne, lehnt EA ab: die Karte bleibt unverkauft auf der Transferliste liegen, und der Nutzer sieht nur "EA hat das Einstellen abgelehnt". Selten, aber jedes Mal eine verlorene Karte.

**ZU TUN:** services.Item.requestMarketData in sniffer.js aufnehmen und in gleichEinstellen fragen, wenn eaMin und eaMax 0 sind. Kostet eine EA-Anfrage, muss also ins Kontingent.

### 50. Die Transferliste als "veraltet" markieren, damit EA sie wirklich neu schickt

**FST:** scripts.js Z. 59157 und 59271: erst repositories.Item.setDirty(ItemPile.TRANSFER), dann services.Item.requestTransferItems(). Immer in dieser Reihenfolge, an beiden Stellen.

**Wir:** sniffer.js Z. 555-560: wir rufen nur dienst.requestTransferItems() auf. setDirty kommt in content.js, popup.js und sniffer.js nirgends vor.

**Woran es liegt:** Wir kennen den Schritt nicht. FST macht ihn zweimal und an beiden Stellen zuerst - das ist kein Zufall, sondern sein Weg, eine wirklich frische Liste zu bekommen.

**Was du merkst:** Wenn die Web App uns ihre gemerkte Liste zurueckgibt statt einer frischen, sieht die Verkaufs-Wache verkaufte Karten nicht. Dann raeumt sie nicht ab, und der Lauf endet mit "Die Transferliste ist voll (100)" - obwohl Platz da waere. Wie oft das passiert, ist nicht gemessen; bewiesen ist nur, dass FST sich darauf nicht verlaesst.

**ZU TUN:** In sniffer.js vor dem frischen Lesen repositories.Item.setDirty(window.ItemPile.TRANSFER) aufrufen, in try/catch. Kostet keine zusaetzliche Anfrage.

### 51. Verkaufte Karten von der Transferliste abraeumen

**FST:** scripts.js Z. 59157-59214: setDirty, dann requestTransferItems, und INNERHALB dieser Antwort UTTransferListViewController.prototype._clearSold(). Das ist FSTs einziger und laufend benutzter Weg.

**Wir:** sniffer.js Z. 596-604: zwei Wege - transfersDao.removeSold, danach clearSoldItems. Der zweite wirft nachweislich (am 23.09. live gemessen, steht im Kommentar Z. 591). _clearSold gibt es bei uns nicht.

**Woran es liegt:** Der eigene Plan vom 25.09. (analyse/FST-Vergleich-25-09.md Z. 276) sah DREI Stufen vor: removeSold, dann _clearSold, dann der alte Aufruf. Gebaut wurden nur zwei. Die Mittelstufe - genau der Weg, der bei FST arbeitet - fehlt.

**Was du merkst:** Wir haengen alles an removeSold. Scheitert der, gibt es nur noch den Aufruf, von dem wir WISSEN, dass er wirft. Der Bot meldet dann "Abraeumen ging auf keinem Weg" und stoppt bei 100 Karten. FST hat in diesem Fall noch einen funktionierenden Weg, wir keinen.

**ZU TUN:** window.UTTransferListViewController.prototype._clearSold() als zweiten Weg einbauen - und wie FST nur direkt nach einer frischen Antwort von requestTransferItems, nicht auf der gemerkten Liste.

### 52. Vor dem Einstellen fragen, ob die Transferliste voll ist

**FST:** scripts.js Z. 58415: repositories.Item.isPileFull(ItemPile.TRANSFER) - direkt vor services.Item.list, jedes Mal. Antwort sofort, kostet keine Anfrage.

**Wir:** content.js Z. 4835-4861 (platzProblem): wir rechnen mit selbst gezaehlten Zahlen und geben auf, wenn sie aelter als zwei Minuten sind (Z. 4837). isPileFull kommt bei uns nicht vor.

**Woran es liegt:** Wir zaehlen selbst, statt EA zu fragen. EAs eigene Antwort ist immer richtig und immer sofort da - unsere Zahl kann zwei Minuten alt sein oder ganz fehlen.

**Was du merkst:** Zwei Richtungen, beide unangenehm. Ist die Zahl aelter als zwei Minuten, laesst platzProblem alles durch: der Bot versucht einzustellen und EA lehnt ab. Oder die Zahl ist zu hoch geblieben und der Bot bremst, obwohl Platz ist. Bei FSTs schnellem Tempo (4 Sekunden je Runde) sind zwei Minuten rund 30 Runden.

**ZU TUN:** isPileFull in sniffer.js aufnehmen und in platzProblem zuerst fragen; die eigene Zaehlung bleibt als Rueckfall.

### 53. Weiter kaufen, obwohl "Nicht zugewiesen" voll ist

**FST:** scripts.js Z. 53045, 58590, 58809, 58817: repositories.Item.unassigned.clear() bzw. .reset(). FST leert die Merkliste der Web App und darf danach bis 99 weiterkaufen (Grenze in Z. 58493-58495).

**Wir:** content.js Z. 4833: NICHT_ZUGEWIESEN_MAX = 4. Ueberschritten heisst Stop (Z. 4859). Unsere Zahl kommt von EAs Kontouebersicht (sniffer.js Z. 122, unassignedPileSize) - ein Leeren im Speicher der App wuerde uns gar nicht taeuschen.

**Woran es liegt:** FST hebelt EAs Anzeige-Grenze von 5 aus, wir halten sie ein. Das ist bei FST eine bezahlte Funktion ("unlimited unassigned") und im Code klar zu sehen.

**Was du merkst:** Liegen beim Nutzer fuenf oder mehr nicht handelbare Karten in "Nicht zugewiesen" - nach Paecken oder Belohnungen normal -, startet unser Bot ueberhaupt nicht und meldet "Nicht zugewiesen ist voll". FST kauft in derselben Lage weiter. Der Unterschied ist also nicht ein paar Prozent, sondern 0 gegen volles Tempo.

**ZU TUN:** Entweder unassigned.clear() nachbauen und die Grenze auf 99 heben, oder dem Nutzer wenigstens einen Knopf geben, der "Nicht zugewiesen" leert, statt nur zu stoppen. Die erste Variante ist FSTs Weg - sie umgeht bewusst eine Grenze der EA-Oberflaeche.

### 54. Verein, Liga und Nation aus EAs eigenen Tabellen

**FST:** scripts.js Z. 2669-2674: repositories.TeamConfig.getNation, getLeague und getTeam. FST bekommt Name und Nummer jederzeit, ohne dass eine Suchmaske offen sein muss, und uebergibt die Nummer als Feld an EA.

**Wir:** sniffer.js Z. 1053 liest die Auswahllisten aus der offenen EA-Suchmaske. TeamConfig kommt bei uns nicht vor. Und content.js Z. 55 ist ehrlich: clubParam "club" ist in der Adresse GERATEN, im Gegensatz zu lev/pos/nat/leag/playStyle, die am 24.09. gemessen wurden.

**Woran es liegt:** Weil wir die Adresse selbst bauen, brauchen wir den richtigen Feldnamen. FST braucht ihn nicht - es uebergibt EA ein Objekt, und EA baut die Adresse. Ein geratener Name kann EA still ignorieren.

**Was du merkst:** Der Vereins-Filter im Markt-Scan kann wirkungslos sein, ohne dass es auffaellt: der Bot sucht dann in ALLEN Vereinen statt in einem. Der Hinweistext in popup.html Z. 528 sagt das selbst. Bei Liga, Nation, Position und Chemie ist es gemessen und stimmt - nur der Verein ist offen.

**ZU TUN:** Einmal live in EAs Suchmaske einen Verein waehlen und in der Adresse nachsehen, wie das Feld heisst. Eine Zeile aendern (content.js Z. 55). Oder TeamConfig lesen und den Verein ueber den App-Weg schicken.

---

# Teil 2: Nur ohne Kontoschutz (10 Punkte)

Diese Punkte gehen nur, wenn Grenzen fallen, die das Konto schuetzen.
EA hat dieses Konto am 21.09. bei rund 450 Suchen am Tag gesperrt (521),
am 22.09. bei zwei Kaeufen pro Sekunde (426), danach zweimal 461 mit
wachsender Sperre: erst 1 Stunde, dann 6, dann 24.

### 55. Wie viele Suchen in einer Stunde herauskommen

**FST:** Kein Stundenlimit. Nirgends in scripts.js. Nur ein Tageslimit vom FST-Server je nach Abo (Z. 58558-58569), und das ist bei den grossen Abos gar nicht gesetzt. Rechnerisch also rund 850 bis 900 Suchen in der Stunde.

**Wir:** content.js Z. 117: 150 Suchen pro Stunde. Z. 139: 170 Anfragen pro Stunde insgesamt. Durchgesetzt in Z. 773 und Z. 779.

**Woran es liegt:** Wir haben eine Bremse, die FST nicht hat. Das schnelle Tempo ist damit nach zehn Minuten aufgebraucht.

**Was du merkst:** FST etwa 850 bis 900 Suchen in der Stunde, wir 150. Das ist knapp ein Sechstel. Das gebaute Tempo bringt nur in den ersten Minuten etwas.

**ZU TUN:** Der Nutzer muss die Grenze in Optionen unter Wartung selbst hochstellen (popup.html Z. 719, bis 900 erlaubt). Im Standard bleibt sie auf 150.

### 56. Wie viele Anfragen an einem Tag insgesamt herausgehen

**FST:** Kein Deckel im Programm. Nur das Tageslimit des Abos vom FST-Server, bei den grossen Abos nicht gesetzt.

**Wir:** content.js Z. 141: GESAMT_MAX_TAG ist 440 und ist eine harte Obergrenze. Z. 669 rechnet: Tageslimit plus 60, aber niemals mehr als 440. Durchgesetzt in Z. 780.

**Woran es liegt:** Diese 440 lassen sich nirgends einstellen. Sie stehen fest im Code.

**Was du merkst:** In Optionen darf man bis zu 2000 Suchen pro Tag eintragen (popup.html Z. 720). Alles ueber etwa 380 ist aber wirkungslos, weil der Deckel von 440 vorher greift - Suchen, Kaeufe und Verschieben zaehlen alle mit. Der Nutzer stellt 2000 ein und bekommt 440. Das ist irrefuehrend.

**ZU TUN:** Entweder das Eingabefeld auf das begrenzen, was wirklich moeglich ist, oder klar hinschreiben, dass bei 440 Anfragen am Tag Schluss ist, egal was hier steht.

### 57. Der Abstand zwischen zwei Kaeufen aus derselben Suche

**FST:** scripts.js Z. 58390-58408: FST kauft ohne jede eingebaute Pause weiter. Nur vor dem Einstellen wartet es 600 bis 925 Millisekunden (Z. 58411-58432).

**Wir:** content.js Z. 5312-5325 (kaufAbstand): 3 bis 5 Sekunden, und mindestens 8 Sekunden seit der letzten Kaufanfrage (Z. 162, 163, 172). Dazu bricht Z. 5323 die Trefferliste ab, wenn sie aelter als die eingestellte Frist ist.

**Woran es liegt:** Wir bremsen hier absichtlich. Grund: EA hat bei diesem Konto am 22.09. auf zwei Kaeufe in einer Sekunde mit Fehler 426 geantwortet.

**Was du merkst:** Wenn eine Suche drei Schnaeppchen zeigt, holt FST alle drei in gut einer Sekunde. Wir holen meist eines, selten zwei - beim dritten ist die Liste zu alt und der Bot sucht neu. Bei einem einzelnen Treffer je Suche, dem Normalfall, merkt man nichts.

**ZU TUN:** Die 8 Sekunden abschaffen waere 1:1, holt aber genau den Fehler zurueck, der schon einmal zur Sperre gefuehrt hat. Ich wuerde es lassen.

### 58. Kaufversuche pro Stunde und pro Tag

**FST:** FST kennt nur die Grenze des bezahlten Abos, die der FST-Server vorgibt (scripts.js Z. 58555-58565). Eine eigene Stundenbremse fuer Kaeufe gibt es nicht.

**Wir:** content.js Z. 126 und Z. 132: hoechstens 40 Kaufversuche pro Stunde und 100 pro Tag. Dazu ein Deckel von 170 EA-Anfragen pro Stunde und rund 410 pro Tag ueber alles (Z. 139-141). Diese Zahlen stehen fest im Code; einstellbar sind nur die Suchen (Z. 650-654).

**Woran es liegt:** Diese Bremsen kommen aus den echten EA-Sperren vom 21. und 22.09. Sie sind absichtlich haerter als bei FST.

**Was du merkst:** Ist die Stundengrenze voll, wartet der Bot hoechstens EINMAL pro Lauf und hoechstens 15 Minuten (content.js Z. 3683-3690). Danach endet der Lauf mit einer Meldung. FST laeuft in derselben Lage einfach weiter.

**ZU TUN:** 1:1 waere nur ohne Kontoschutz moeglich. Machbar waere ein Mittelweg: bei voller Stundengrenze immer warten statt abzubrechen, statt nur einmal je Lauf.

### 59. Waehrend des Laufs merken, dass etwas verkauft wurde

**FST:** scripts.js 58573-58587: Alle 8 Suchen fragt FST echt bei EA nach (checkIfItemsAreSold, scripts.js 59252-59310) und holt danach den Muenzstand. Bei FSTs Tempo von rund 4 Sekunden je Suche ist das etwa jede halbe Minute.

**Wir:** content.js 3390-3449 verkaufsWacheAufgabe, ausgeloest alle 12 Suchen (content.js 154). Gelesen wird aber zuerst gratis aus dem Speicher der Web App. Echt bei EA nachgefragt wird nur mit Grund, hoechstens alle 5 Minuten und hoechstens 6-mal je Lauf (content.js 152-153, 3334-3343).

**Woran es liegt:** Der gratis Blick in den Speicher zeigt nur, was EA dort zuletzt hingelegt hat. Neue Verkaeufe stehen da nicht drin. Verlaesslich sieht unser Bot sie also hoechstens 6-mal je Lauf.

**Was du merkst:** Die Zeile "X verkauft seit Start" und der Gewinn hinken nach - unter Umstaenden um Stunden. FST zeigt einen Verkauf nach rund einer halben Minute. Der Muenzstand ist bei uns aus demselben Grund ebenfalls oft alt.

**ZU TUN:** Die beiden Zahlen anheben, zum Beispiel alle 2 Minuten und 20-mal je Lauf. Das kostet aber echte Anfragen und geht vom Suchbudget ab - deshalb eine Entscheidung fuer den Nutzer, kein Fehler im Code.

### 60. Das Abzeichen 'Heiss' (bei FST 'Hot').

**FST:** Der Tag kommt fertig vom Server. Die Regel dahinter steht nicht im Programm - auch der Hilfetext (Z. 20645-20652) wird erst vom Server geladen. Wir wissen also nicht, wann FST 'Hot' vergibt.

**Wir:** popup.js Z. 1084: Eintrag hoechstens 5 Minuten alt UND (gemessene Aktivitaet 'hoch' ODER eigene Trefferquote ab 8 je 100 Suchen).

**Woran es liegt:** Gleicher Name, unbekannte Regel auf der anderen Seite - und unsere Regel kann fast nie zutreffen.

**Was du merkst:** Stark, und rechenbar. 'Gemessene Aktivitaet' gibt es nur, wenn derselbe Spieler zweimal mit mindestens einer Minute Abstand gemessen wurde (popup.js Z. 633-637). Das macht der Markt-Scan nur fuer 6 Kandidaten (content.js Z. 103), die Liste ist aber bis zu 40 Zeilen lang (content.js Z. 104). Auf mindestens 34 von 40 Zeilen kann 'Heiss' also nie erscheinen. Bei FST steht es auf jeder Zeile, auf die es passt.

**ZU TUN:** Mehr Kandidaten zweimal messen. Das kostet EA-Anfragen und stoesst an unsere eigene Obergrenze von 16 Anfragen je Scan (content.js Z. 108).

### 61. Woher die Preise auf den Filterzeilen kommen.

**FST:** Jede Zeile kommt mit einem Preis vom Server (lowest_bin, scripts.js Z. 35330-35345). Es gibt keine Zeile mit ungepruefter Grundlage.

**Wir:** content.js Z. 103: nur 6 Kandidaten werden einzeln nachgeprueft. content.js Z. 104: bis zu 40 Zeilen stehen danach in der Liste. Die uebrigen bekommen preisGeprueft = false und confidence 'niedrig' (content.js Z. 2940-2948).

**Woran es liegt:** Wir fuellen die Liste mit Zeilen auf, deren Preis nur das ist, was zufaellig vorne stand. Das kostet keine Anfrage, ist aber auch keine Messung.

**Was du merkst:** Stark. Auf mindestens 34 von 40 Zeilen steht 'Nur gesehen' und 'Ungeprueft'. Die niedrige Sicherheit drueckt die Wertung auf 42 % des Werts (popup.js Z. 980-982: 0,6 mal 0,7). Diese Zeilen sehen also schlechter aus als sie sein koennten, und der Bot darf mit ihnen nicht sofort starten - er prueft erst nach, was wieder Suchen kostet. Bei FST kann man jede Zeile sofort starten.

**ZU TUN:** Mehr Kandidaten nachpruefen. Das stoesst an unsere eigene Grenze von 16 Anfragen je Scan (content.js Z. 108) und an das Stundenlimit.

### 62. Preis nach dem Alter der Angebote (das Herzstueck beider Bots)

**FST:** scripts.js 28340-28388: drei Methoden. 'safe' geht runter, sobald EIN Angebot 2 Minuten alt ist oder mehr als 2 Angebote da sind. 'recommended': 2 Minuten oder mehr als 15 Angebote. 'lazy': 30 Minuten, 3 alte oder 10 Angebote. Gemessen wird mit echten Suchen, eine pro Sekunde, beliebig viele (scripts.js 28085-28170).

**Wir:** content.js 2318-2322 (PREIS_METHODEN) und 2338-2365 (preisNachAlter). Die Zahlen sind genau FSTs Zahlen: 120 Sekunden, 2 / 15 / 20 Angebote, 1800 Sekunden, 3 alte, ab 10. Wir gehen aber nur die Angebote durch, die EINE Messung schon geholt hat.

**Woran es liegt:** FST tastet mit echten Suchen auch nach OBEN, ueber den Startpreis hinaus. Wir rechnen nur mit dem, was eine Messung gebracht hat, und klemmen das Ergebnis danach zwischen 10 Prozent unter unserem Marktpreis und der Staffel darueber (content.js 2378-2387).

**Was du merkst:** Bei den meisten Karten kommt derselbe Preis heraus - aber unsere Messung kostet 1 bis 3 Suchen statt 10 bis 30. Liegt der wahre Verkaufspreis ueber allem, was wir gesehen haben, bleiben wir darunter.

**ZU TUN:** Nach oben tasten wie FST, also weitere Suchen bei hoeherem Hoechstpreis. Oder bewusst dabei bleiben und es so aufschreiben.

### 63. Wie viele Suchen eine Messung kosten darf

**FST:** Kein Deckel. Jeder Tast-Schritt ist eine echte Suche, eine Sekunde Abstand, und es geht weiter bis der Preis gefunden ist (scripts.js 28085-28170). Gebremst wird erst bei 50 verschiedenen Preisen (27525) oder ueber 14 Millionen Coins (28123).

**Wir:** content.js 97-98: hoechstens 12 Suchen fuer die Messung, 15 mit der Kontrollmessung. Hoechstens 30 Angebote (Zeile 101). Darueber das Stundenlimit 150 und Tageslimit 350 Suchen (Zeile 117-118).

**Woran es liegt:** FST hat weder einen Deckel je Messung noch ein Stunden- oder Tagesbudget. Unser Kontoschutz hat beides.

**Was du merkst:** Das ist die harte Grenze in diesem Bereich: 20 Spieler neu messen kostet bis zu 300 Suchen. Das Tagesbudget ist 350. Wir koennen also einmal am Tag eine ganze Zielliste durchmessen - dann ist der Tag vorbei. FST messt so oft er will. Praktisch arbeiten wir deshalb mit aelteren Preisen als FST.

**ZU TUN:** Die Grenzen sind in den Optionen selbst einstellbar (bis 900 pro Stunde, 2000 pro Tag). Hochstellen heisst aber, den Schutz aufgeben, der nach der 521-Sperre am 21.09. eingebaut wurde.

### 64. Wie viele Filter in einer Stunde wirklich durchlaufen

**FST:** scripts.js Z. 41929 (60 Minuten Sitzung), Z. 41940 (50 Suchen je Filter), Z. 41943 (300 s Pause), Z. 41932-41934: Gesamtgrenzen sind leer, also aus. Rechnung: 50 Suchen plus 5 Minuten Pause, das sind etwa 8 bis 10 Filter je Stunde und 400 bis 500 Suchen.

**Wir:** popup.js Z. 3724-3731 (rotSuchenBudget): je Filter hoechstens 40 Suchen, und es bleiben immer 25 Suchen als Puffer liegen, plus 15 fuer eine Preispruefung. content.js Z. 117: 150 Suchen die Stunde, Z. 118: 350 am Tag.

**Woran es liegt:** Unser Stunden- und Tageslimit. Nachgerechnet: 150 minus 25 Puffer sind 125 nutzbare Suchen. Bei 40 je Filter sind das drei Filter - und muss vorher noch ein Preis geprueft werden (15 Suchen), sind es nur zwei. Kommt ein Scan mit 16 Suchen dazu, wird der dritte Filter auf 29 Suchen gekuerzt.

**Was du merkst:** Zwei bis drei Filter je Stunde bei uns gegen acht bis zehn bei FST. Am Tag etwa sieben Filter gegen praktisch unbegrenzt. Nach rund 20 Minuten Rotation sagt der Bot: 'Das Stundenlimit fuer Suchen ist erreicht' (popup.js Z. 3893).

**ZU TUN:** Nur durch Hochsetzen der eigenen Grenzen. Das Feld dafuer gibt es schon (content.js Z. 650-655, grenzeSuchStunde/grenzeSuchTag). Es ist bewusst niedrig - die 461-Sperre am 22.09. kam von zu viel Betrieb.

---

# Teil 3: Nur mit FSTs Server (13 Punkte)

Diese Punkte brauchen Daten von FSTs Server - also die Zahlen aller Nutzer.
Die schriftliche Erlaubnis deckt den Quellcode ab, NICHT den Server
(siehe ERLAUBNIS-FST.md). Diese Punkte sind damit gesperrt.

Fuer manche gibt es einen eigenen Ersatz aus eigenen Daten - er braucht
nur laenger, bis er etwas zeigt.

### 65. Die zwei Prozentzahlen auf jeder Filterzeile: Treffer je 100 Suchen und wie viele davon zum Kauf wurden.

**FST:** Kommen fertig vom FST-Server mit. Jede Zeile bringt das Feld filter_stat mit (scripts.js Z. 35470-35492), geholt in einem Zug mit allen Filtern ueber GET /api/filters (Z. 34892-34910). FST rechnet nichts davon im Browser.

**Wir:** popup.js Z. 1038-1067 (localFilterStats) rechnet die Zahlen aus den EIGENEN Laeufen der letzten 7 Tage. Angezeigt in popup.js Z. 1519-1528.

**Was du merkst:** Sehr stark. Wer heute anfaengt, sieht bei FST auf allen Zeilen zwei Zahlen. Bei uns steht auf JEDER Zeile nur 'Treffer: noch keine Daten' (popup.js Z. 1200). Und das bleibt so: Ein Live-Filter gilt 15 Minuten und gilt fuer genau einen Spieler mit genau einem Rating. Derselbe Spieler kommt selten wieder - fuer die meisten Zeilen sammelt sich also nie eine eigene Zahl an. Auch nach 50 Laeufen sind es nur 50 von zigtausend moeglichen Karten.

**Moeglicher Ersatz:** Entweder ein eigener Server, der die Zahlen vieler Nutzer sammelt. Oder klar dazuschreiben, dass diese Zahl bei uns nur fuer Karten kommt, die man schon selbst gefahren hat.

### 66. Die Wertung selbst (Score) und die Zahl, die darunter steht.

**FST:** score, raw_score und personal_adjustment kommen vom Server (scripts.js Z. 35344-35392). Skala 0 bis 9,9. Laut FSTs eigener Hilfe (Z. 20612-20619) ist die Zahl der erwartete Gewinn aus einer Stunde Suchen - also gemessen, nicht geschaetzt.

**Wir:** popup.js Z. 1028-1036 (wertungAus) rechnet selbst: Chance mal Sicherheit mal Gewinn mal Frische mal Aktivitaet mal eigene Erfahrung. Anzeige 0 bis 10 (popup.js Z. 1578-1582). Zusaetzlich zeigen wir eine Coin-Zahl 'rund 2.400 / Std.' (popup.js Z. 1180-1190).

**Was du merkst:** Eine 7,1 bei FST und eine 7,1 bei uns sind nicht dasselbe. Unsere Coin-Zahl ist verstaendlicher als FSTs abstrakte Skala - aber sie erscheint nur, wenn es eigene Laeufe fuer genau diese Karte gibt (popup.js Z. 1181: bei geschaetzten Zahlen gibt sie null zurueck). Bei einem neuen Nutzer steht sie also auf keiner einzigen Zeile.

**Moeglicher Ersatz:** Die Rechenart lassen, aber auf der Karte klar sagen: 'Einschaetzung, nicht gemessen.' Das steht schon im Hinweistext (popup.html Z. 491), nicht aber an der Zahl selbst.

### 67. Die Abzeichen 'Trending' und 'Profit++' (doppeltes Gewinn-Abzeichen).

**FST:** Das Abzeichen-Fenster in der App nennt beide (scripts.js Z. 57242-57260: trending_badge, profit_plus_badge, profit_double_badge).

**Wir:** Beide fehlen. Wir haben nur ein 'Gewinn+' (popup.js Z. 1082) und kein 'Trending'.

**Was du merkst:** Mittel. Bei FST erkennt man auf einen Blick den Filter mit dem besonders hohen Gewinn und den, der gerade in Mode ist. Bei uns sehen ein Filter mit 5 % Marge und einer mit 20 % beide nur 'Gewinn+'.

**Moeglicher Ersatz:** 'Gewinn++' ab etwa 20 % Marge einbauen - eine Zeile. 'Trending' geht ohne fremde Daten nicht.

### 68. EAs eigener Marktschnitt als zweite Meinung

**FST:** scripts.js 28411-28416 liest _marketAverage vom ersten Angebot. 28594-28612 schickt ihn an den eigenen Server (/api/calculate-price). DER Server rechnet daraus den Preis und schickt eine fertige Zahl zurueck.

**Wir:** content.js 2509-2510 liest item.marketAverage, daraus wird nur eine Warnung ab 40 Prozent Abweichung (popup.js 845-846).

**Was du merkst:** Vermutlich gar nichts. Die Warnung ist eingebaut, aber wahrscheinlich hat sie noch nie jemand gesehen.

**Moeglicher Ersatz:** Einmal die Feldprobe in den Optionen druecken und das Ergebnis festhalten. Steht der Marktschnitt nicht in den Treffern, die Zeile ehrlich als toten Code markieren.

### 69. Woher die Filter kommen und was sie kosten

**FST:** scripts.js Z. 42201-42214: ein Aufruf beim FST-Server, Kosten bei EA: null. Der Server kennt den Markt und schickt einen fertig bewerteten Filter.

**Wir:** content.js Z. 108: ein Markt-Scan kostet bis zu 16 EA-Suchen. content.js Z. 6480-6528: er erneuert sich allein alle 7 Minuten, aber nur wenn danach noch Luft bis zur Warnschwelle bleibt.

**Was du merkst:** Ein Scan kostet 16 Suchen - das ist so viel wie 40 Prozent eines ganzen Filterlaufs. In einer Stunde haben wir 150 Suchen; ein Scan frisst davon jede neunte. An einem Tag mit 350 Suchen und vier Scans gehen 64 Suchen nur ins Nachladen - etwa eineinhalb Filterlaeufe. FST zahlt dafuer nichts.

**Moeglicher Ersatz:** Nicht loesbar ohne eigenen Server, der den Markt dauerhaft beobachtet. Kleiner Hebel: die 15 Minuten Haltbarkeit hochsetzen, wenn der Preis vor jedem Filter ohnehin frisch geprueft wird (das passiert schon, popup.js Z. 3897-3917).

### 70. Die Zahl schon sehen, BEVOR man den Bot startet

**FST:** Die Zahl kommt vom Server und ist sofort nach dem Laden da (scripts.js Z. 34907, Z. 4113). Die Kachel ist gefüllt, ohne dass ein Lauf stattgefunden hat.

**Wir:** popup.js Z. 4661: Unter 20 Suchen in den letzten 6 Stunden zeigt die Kachel "–" und den Satz "Noch zu wenig Daten". Grenze in Z. 4497.

**Was du merkst:** Genau die Frage "lohnt es sich jetzt?" bleibt offen. Nach dem Start dauert es rund 20 Suchen, also etwa 1,5 Minuten, bis überhaupt eine Zahl erscheint. Wer 6 Stunden nicht gebotet hat, sieht wieder "–".

**Moeglicher Ersatz:** Die Zahl aus den gespeicherten Läufen derselben Tagesstunde an früheren Tagen vorbelegen, statt "–" zu zeigen. Echte Markt-Daten aller Nutzer gibt es ohne Server nicht.

### 71. Stat Zone - die große Auswertungsseite

**FST:** Knopf "Stat Zone öffnen" führt auf dashboard.futsimpletrader.com/stats-zone (scripts.js Z. 37440), dazu ein Hinweistext in der Kachel (Z. 37528).

**Wir:** Kein Gegenstück. Am nächsten kommt das Blatt "Heute & letzte 7 Tage" (popup.html Z. 111-125).

**Was du merkst:** Wir zeigen 7 Tage. Die Rohdaten für mehr sind da - bis zu 500 gespeicherte Läufe (content.js Z. 3483) - aber es gibt keine Seite, die sie über Wochen auswertet.

**Moeglicher Ersatz:** Eine Auswertung über alle gespeicherten Läufe einbauen (Monat, beste Tage, beste Filter). Eine Webseite wie FST können wir nicht bauen, ohne Daten aus dem Haus zu geben.

### 72. Preis-Gedaechtnis: woher der Bot weiss, was eine Karte wert ist

**FST:** FST liest EAs eigene Preisspanne aus der Antwort der Web App mit (58262-58270) und schickt sie an seinen Server. Dort liegen die Spannen ALLER FST-Nutzer zusammen. Beim Start kommen sie als price_ranges zurueck (29894). Der Server kennt die Preise damit sofort - auch fuer Karten, die du selbst nie gesehen hast. Er merkt sogar, wenn EA einen Preis zurueckdreht, und stoppt die Suche von aussen mit dem Hinweis, der Futbin-Preis sei wiederhergestellt (59374-59382).

**Wir:** content.js 2193-2239: Wir merken uns nur, was DIESER Rechner selbst gemessen hat. Grenze: 1500 Karten (Zeile 2137), nach 7 Tagen verfaellt jeder Eintrag (Zeile 2138). Der Preisverlauf ist noch enger: 60 Karten, je 100 Messungen, 14 Tage (content.js 2561-2573, 224).

**Was du merkst:** Sehr deutlich. Bei FST ist eine Karte ab der ersten Sekunde bewertet. Bei uns muss der Bot sie erst selbst mehrfach gesehen haben - bei unserem Tagesbudget von 350 Suchen dauert das bei einer unbekannten Karte Stunden bis Tage. Und was du vor acht Tagen gemessen hast, ist weg.

**Moeglicher Ersatz:** Ein eigener Server, auf dem die Preise vieler Nutzer zusammenlaufen. Ohne den bleibt es dabei.

### 73. Markt-Anzeige: laeuft der Markt gerade gut?

**FST:** Der Server rechnet aus allen Nutzern eine Note (Excellent / Good / Average / Bad), einen Vergleich zum Ueblichen in Prozent, einen Wert fuer Wettbewerb, einen fuer Effizienz und sogar den Zeitpunkt der naechsten Hochphase (37378-37410, 29895). Das steht da, sobald du einloggst.

**Wir:** popup.js 4649-4694: Wir rechnen eine Zahl von 0 bis 100 aus unseren EIGENEN Laeufen - Treffer je 100 Suchen, wie viele Treffer ein Kauf wurden, wie viele Filter brauchbar sind. Zeile 4661: unter 20 Suchen in den letzten 6 Stunden sagt der Tacho ehrlich "zu wenig Daten".

**Was du merkst:** Merkbar: Nach einer Pause oder einem Neustart zeigt unser Tacho erst mal einen Strich, bis 20 Suchen zusammen sind. FSTs Anzeige steht sofort.

**Moeglicher Ersatz:** Ohne Server nicht zu schliessen. Ehrlicher waere, im Tacho dazuzuschreiben, dass es deine eigene Bilanz ist und keine Marktlage.

### 74. Einstellungen, Filter und Pausen-Vorlagen sichern

**FST:** Alles liegt auf dem Server: Filter (api/filters), Filtergruppen (api/filter-groups), Handels-Vorlagen (api/auto-trade-presets), Pausen-Einstellungen (api/user-break-settings, 29012), allgemeine Einstellungen (api/update-app-settings, 2546). Lokal liegt bei FST nur zwei Dinge: das Anmelde-Merkmal und die Sprache (19144, 3239).

**Wir:** Alles in chrome.storage.local. 29 Speicherstellen in popup.js, 41 in content.js. Die Schluessel: settings, collections, endpoints, filterListen, priceHistory, preisGedaechtnis, purchases, verkaeufe, runStats, playerList.

**Was du merkst:** Sehr deutlich beim Wechsel. FST: einloggen, fertig. Wir: Sicherungsdatei von Hand exportieren, mitnehmen, wieder einlesen. Vergisst du die Datei, sind alle Sammlungen, Filterlisten und das ganze Preis-Gedaechtnis weg.

**Moeglicher Ersatz:** Ohne Server nicht 1:1. Moeglich waere eine Erinnerung, die nach vielen Aenderungen ans Sichern denkt.

### 75. Fertige Filter, die der Anbieter liefert

**FST:** Der Server liefert drei Sorten mit: quick_flip, user_filters und preset_filters (34901-34909). Einer davon ist als "empfohlen" markiert, mit Begruendung - wenig Wettbewerb, frischer Preis, Markt heiss (34920-34926). FST vergibt dafuer Freikontingente (free_live_filters_count).

**Wir:** Nichts Vergleichbares. Unsere filterListen (content.js 4914-4930) sind ausschliesslich das, was unser eigener Markt-Scan gefunden hat.

**Was du merkst:** Deutlich am Anfang. Ein FST-Nutzer kann einen fremden, geprueften Filter anklicken und sofort starten. Bei uns musst du erst einen Markt-Scan laufen lassen, und der kostet Suchen aus deinem Tagesbudget.

**Moeglicher Ersatz:** Nur mit Server. Ohne ihn bleibt der eigene Markt-Scan der einzige Weg.

### 76. Sicherheitszaehler ueber Neustarts hinweg

**FST:** Die Tageszahlen kommen vom Server zurueck (dailyStats.searches und dailyStats.success_bids, 29892-29893). Der Zaehler haengt am Konto, nicht am Browser. Neu installieren hilft nicht.

**Wir:** content.js 745-792: safetyUsage liegt in chrome.storage.local. Gezaehlt werden Suchen, Kaeufe und Aktionen je Stunde und je Tag, dazu eine Gesamtgrenze ueber alles. Ueberlebt ein Neuladen und einen Browserstart.

**Was du merkst:** Nur wenn du es ausnutzt - dann aber hart. EA rechnet dein Konto zusammen, nicht deinen Browser. 350 Suchen im alten Profil plus 350 im neuen sind fuer EA 700 an einem Tag, und wir haben live gemessen, dass EA da mit Sperren antwortet.

**Moeglicher Ersatz:** Der Zaehler laesst sich ohne Server nicht faelschungssicher machen. Was hilft: eine Warnung, wenn der Bot merkt, dass er praktisch "neu" ist, obwohl gekaufte Karten im Verein liegen.

### 77. Suchen und Kaufen durch EAs eigenes Programm laufen lassen

**FST:** scripts.js Z. 46682, 58375 (services.Item.searchTransferMarket) und Z. 46696, 52981, 58391 (services.Item.bid). FST hat keinen anderen Weg: JEDE Suche und JEDER Kauf geht durch die Web App. Die Kriterien baut EA selbst, aus einer Kopie der offenen Suchmaske (Z. 1405-1408).

**Wir:** content.js Z. 1806-1874: den App-Weg gibt es, aber er lehnt jede Suche mit Rating oder Kartenart oder Scan-Filter ab (Z. 1802, 1833, 1846). Dazu steht der Schalter aus (popup.js Z. 59: appSuchweg: false). Im Normalfall baut content.js Z. 2007-2035 die Adresse selbst und schickt sie als eigene Anfrage.

**Was du merkst:** Das ist der teuerste Punkt. Eigene Anfragen brachten dem Konto schon bei rund 450 Suchen am Tag eine Sperre (521), und danach 461 mit wachsender Sperrzeit bis 24 Stunden. FSTs Anfragen sehen fuer EA wie Klicks in der App aus. Genau deshalb wurde der App-Weg ueberhaupt gebaut - und genau deshalb liegt er ungenutzt da.

**Moeglicher Ersatz:** Live messen, ob die EA-App ovrMin/ovrMax, rarityIds und die Scan-Filter durchreicht. Reicht sie sie durch, die Abweisungen in Z. 1802/1833 entfernen, die Felder in sniffer.js Z. 930-946 setzen und den Schalter einschalten. Ohne diese Messung bleibt es so - und das ist richtig, aber es ist nicht 1:1.

