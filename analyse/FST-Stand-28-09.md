# Was ist heute 1:1 wie FUT Simple Trader

Stand 28.09.2026. Nachgemessen wurden alle 101 Punkte der Bilanz vom 27.09.

**Wie gemessen wurde:** Neun Pruefer haben die Punkte einzeln am aktuellen
Code nachgeprueft. Jeder Punkt, den ein Pruefer besser bewertete als am
27.09., bekam danach einen zweiten Pruefer, dessen einzige Aufgabe war, die
Aufwertung zu Fall zu bringen.

**Das Ergebnis dieser Gegenprobe ist die wichtigste Zahl im ganzen Bericht:**
Von 34 Aufwertungen haben nur 5 standgehalten. 29 wurden gekippt.

## Die Zahlen

| Urteil | Punkte |
|---|---|
| Wir sind besser | 18 |
| Gleich (1:1) | 11 |
| Fast gleich | 24 |
| Nicht gleich - machbar | 28 |
| Nur gegen den Kontoschutz | 9 |
| Nur mit FSTs Server | 11 |
| **zusammen** | **101** |

- **29 Punkte** sind gleich oder besser als FST.
- **24 Punkte** sind fast gleich - im Kern dasselbe, eine Zahl weicht ab.
- **28 Punkte** sind wirklich anders und liessen sich aendern.
- **20 Punkte** sind gesperrt: 9 nur gegen den Kontoschutz, 11 nur mit FSTs Server.

## Was sich seit dem 27.09. bewegt hat

Seit der Bilanz sind 2.586 Zeilen Code dazugekommen, in zwoelf Commits.
Vorangekommen sind davon **sieben Punkte**:

- **Gewinn-Bremse (EA-Gebuehr wird eingerechnet)** (NICHT -> BESSER)
  Wir schützen besser als FST: Der Bot stoppt einen Spieler, wenn der Markt keinen Gewinn mehr hergibt. FST rechnet vor dem Kauf gar nichts nach. Wer es genau wie FST will, nimmt den Haken jetzt heraus.
- **Wie viele Abzeichen eine Zeile zeigen darf.** (NICHT -> GLEICH)
  Jetzt gleich wie FST: Eine Zeile zeigt alle zutreffenden Abzeichen. "Gewinn+", "Unter Preis", "Heiß" und "Neu" fallen nicht mehr hinten runter.
- **Pause zwischen zwei Filtern** (NICHT -> GLEICH)
  Die Pause zwischen zwei Filtern ist jetzt wie bei FST: 300 Sekunden normal, 400 bei jedem vierten Wechsel, dazu 20 Prozent Zufall. Vorher waren es 35 Sekunden.
  Nach der Messung repariert (Commit vom 28.09., 9 Tests): Die Rechnung war schon FSTs, nur der Standardwert kam beim Nutzer nie an.
- **Das neue Loch: die Stundengrenze hat keine harte Obergrenze** (NICHT -> BESSER)
  Wer die Stundengrenze hochdreht, kommt jetzt trotzdem nie ueber 200 Suchen in einer Stunde. Das Tagesbudget laesst sich nicht mehr in einer halben Stunde verschiessen. FST hat so einen Schutz gar nicht.
- **Während der Bot läuft sehen, welche Einstellungen gerade gelten** (NICHT -> FAST)
  Waehrend der Bot laeuft steht jetzt da, mit welchem Tempo, Budget und welchen Grenzen er gestartet ist. Nur der Mindestgewinn fehlt noch.
- **Die Transferliste als "veraltet" markieren, damit EA sie wirklich neu schickt** (NICHT -> GLEICH)
  Der Bot sagt der Web App jetzt zuerst "deine Liste ist alt" und holt sie dann. Genau wie FST. Damit bekommt die Verkaufs-Wache wirklich die frische Liste und sieht verkaufte Karten.
- **Vor dem Einstellen fragen, ob die Transferliste voll ist** (NICHT -> FAST)
  Der Bot fragt jetzt EA selbst, ob die Transferliste voll ist, statt seine eigene Zaehlung zu glauben. Gefragt wird direkt vor dem Einstellen - wie bei FST.

Das ist wenig fuer 2.586 Zeilen. Der Grund steht in den Gegenproben: Sehr
viel wurde gebaut, aber dann von einer anderen Grenze wieder eingeholt,
oder der Schalter steht ab Werk aus, oder der neue Wert kam beim Nutzer
nie an.

## Der Fund beim Nachmessen

Ein Pruefer hat einen echten Fehler gefunden, derselbe Typ wie der
Budget-Schalter am 27.09.:

Am 27.09. wurden zwei Werte auf FSTs Zahlen gestellt - die Pause zwischen
zwei Filtern von 35 auf 300 Sekunden und die Suchen je Filter von 40 auf
50. Im Code standen die neuen Zahlen auch. Ankommen konnten sie nie: Beim
Laden gewinnt der gespeicherte Wert gegen den Standard. Wer den Bot vorher
benutzt hatte, bekam seine alte 35 bei jedem Oeffnen zurueck.

Behoben am 28.09. mit 9 Tests und Gegenprobe.

## Die 28 offenen Punkte

### 1. Über welchen Weg gefragt wird: EAs eigene App-Funktion oder eine selbst gebaute Adresse

*Suchen auf dem Transfermarkt*

Unverändert: Der Bot fragt weiter über eine selbst gebaute Adresse, FST fragt über EAs eigene Funktion. Neu ist nur, dass du jetzt siehst, welchen Weg deine Suchen wirklich genommen haben.

### 2. Mehrere Kartenarten in EINER Suche (z. B. TOTW und Flashback gleichzeitig)

*Suchen auf dem Transfermarkt*

Unverändert. Du kannst weiter nur eine Kartenart pro Suche eintragen. Für zwei Sonderkarten desselben Spielers brauchst du zwei Einträge und damit doppelt so viele Suchen.

### 3. Etwas anderes als Spieler suchen (Verbrauchsgueter, Trikots, Stadionteile)

*Suchen auf dem Transfermarkt*

Unverändert. Der Bot sucht immer nur Spieler. Verbrauchsgüter, Trikots oder Stadionteile kann er nicht suchen.

### 4. Wie lange der Bot ohne Unterbrechung arbeitet

*Tempo, Pausen und wie viel der Bot schafft*

Besser als vorher: Der Bot wartet jetzt die Stunde wirklich ab und macht weiter - aber nur, wenn du das Feld Laufzeit leer lässt. Mit der Voreinstellung von 30 Minuten hört er weiter nach rund 15 Minuten auf. Immerhin sagt die Oberfläche das jetzt vorher.

**Warum das nicht reicht:**

> Ich habe versucht, die Aufwertung zu bestaetigen - sie faellt an zwei harten Sperren durch. Das lange Warten gibt es im Code, aber es wird im Alltag nie erreicht.
> 
> 1) Die Standard-Laufzeit schlaegt vorher zu. popup.js:55 setzt `timeLimitMin: "30"`. content.js:4182-4191 rechnet das Lauf-Ende aus und bricht ab, wenn die Wartezeit darueber hinausgeht: `if (laufEnde > 0 && bis >= laufEnde) { ... return false; }`. Der Ablauf beim Standard: Nach rund 15 Minuten ist die Stunde voll, die noetige Wartezeit sind rund 45 Minuten, das Ende waere also bei Minute 60 - das Lauf-Ende liegt bei Minute 30. Also `return false`, und der Lauf endet. Genau wie am 27.09. Fuer den Nutzer, der nichts umstellt, hat sich nichts geaendert. Die 62 Minuten aus content.js:324 werden dabei nie gebraucht.
> 
> 2) Auch wer das Feld leer laesst (dann 300 Minuten, content.js:1612), kommt beim normalen Arbeiten nicht weiter. content.js:4204-4218 beendet den Lauf, wenn alle Ziele Live-Filter sind und die Wartezeit laenger ist, als der letzte Filter lebt: `if (bis >= laengsterFilter) { ... return false; }`. Ein Live-Filter gilt 15 Minuten (popup.js:2447 `expiresAt: row.entry.t + 15 * 60 * 1000`) und laesst sich einmal um 10 verlaengern (content.js:307 `FILTER_VERLAENGERUNG_MS: 10 * 60 * 1000`). Mehr als 25 Minuten lebt keiner. 45 Minuten Warten passen da nie hinein. Wer also ueber den Filter-Reiter startet - der normale Weg - hoert weiter nach rund 15 Minuten auf, egal was in der Laufzeit steht.
> 
> Uebrig bleibt genau ein Sonderfall: Feld Laufzeit leer UND mindestens ein von Hand gewaehlter Spieler ohne Ablauf (popup.js:7405 `expiresAt: 0`). Nur dann wartet der Bot wirklich lange. Und danach bringt jede Wartepause Platz fuer genau EINE Suche, es geht also im Schneckentempo weiter.
> 
> 3) Der Code selbst sagt, dass es so ist. popup.js:2662-2668 (Kommentar ueber renderLaufzeit): "Also endet der Lauf nach 15 Minuten. ... Die Wartepause, die so etwas abfangen soll, kann hier nichts ausrichten." Und popup.html:804 steht wortwoertlich: "Bei der Standard-Laufzeit von 30 Minuten endet der Lauf vorher." Der neue Satz im Assistenten (popup.js:2677-2681, "der Lauf endet aber schon nach rund ... Min.") ist ein ehrliches Gestaendnis, kein besseres Ergebnis. Der Text luegt nicht mehr - das ist gut, aber es ist keine Annaeherung an FST.
> 
> Ergebnis: FST laeuft, bis der Nutzer stoppt. Bei uns endet der Lauf im Standard und beim normalen Filter-Betrieb weiter nach rund 15 Minuten. Es kommt also etwas anderes heraus. Urteil bleibt NICHT.

### 5. Ob die Sicherheitspausen ueberhaupt gemacht werden

*Tempo, Pausen und wie viel der Bot schafft*

Den Ausschalter gibt es jetzt, und er tut auch etwas. Der Unterschied zu FST ist nur noch die Voreinstellung: Bei uns sind die Pausen an, bei FST aus.

**Warum das nicht reicht:**

> Der Weg ist zwar heil, aber am Ergebnis ändert sich nichts. Drei Funde:
> 
> 1) Der Standard ist weiter "Pausen an". popup.js:55 `pausePreset: "medium"`, und content.js:1649 fällt bei allem Unbekannten auf "medium" zurück. Bei FST sind die Pausen im Standard AUS (Bilanz Z. 209). Wer nichts einstellt, bekommt bei uns Pausen, bei FST keine. Das ist genau der Fall aus Regel 2: die Einstellung, die FST gleichkommt, steht im Standard auf aus.
> 
> 2) Der neue Eintrag ist doppelt versteckt und springt von allein zurück. popup.html:1015 `<div class="tune-custom" hidden>` - die Auswahl in Z. 1021 sieht man erst nach einem Klick auf "Eigene". Und popup.js:6699-6700 ("Zurueck auf Auto heisst: Standardwerte wiederherstellen") setzt die Zeile beim Klick auf "Auto" wieder auf "medium". Ein Schnellprofil tut dasselbe: popup.js:7009 `$("pausePreset").value = value.pause` - keines der Profile enthält "off" (popup.js:6998-7001).
> 
> 3) Das Wichtigste: Der Nutzen, den die Beschriftung verspricht, kann nie eintreten. In popup.html:1021 steht "bringt nur etwas mit angehobener Stundengrenze". Aber content.js:720-728 deckelt die Suchen je Stunde hart auf 200 (`GESAMT_MAX_STUNDE 220` minus `GESAMT_LIMIT_HOUR 170` minus `SEARCH_LIMIT_HOUR 150`, content.js:122/144/164). Was der Nutzer eintippt, wird darauf geklemmt. 200 Suchen mal rund 3,9 Sekunden sind 13 Minuten; mit den Pausen rund 21 Minuten - beides passt locker in eine Stunde. Die Pausen kosten also keine einzige Suche. "Keine Pausen" bringt am Ende exakt 0 Suchen mehr, es endet nur früher. FST kommt ohne Pausen auf bis zu 900 Suchen in der Stunde.
> 
> Was stimmt an seiner Begründung: content.js:6069 gibt bei "off" wirklich `every: 0` zurück, content.js:6387 behandelt die 0 sauber als "keine Pause", popup.js:3453/3501 speichern und laden den Wert, popup.js:6615 schickt ihn mit, und auch die Anzeige kennt "aus" (popup.js:4025, 5148). Der Knopf ist also kein toter Knopf.
> 
> Trotzdem: Im Standard pausiert unser Bot und FST nicht, der Umschalter ist versteckt und fällt von allein zurück, und selbst umgelegt kommt dasselbe heraus wie vorher. Nach Regel 4 (im Zweifel bleibt das alte Urteil) bleibt es bei NICHT.

### 6. Mehrere Kaeufe aus einer Suche

*Kaufen*

Jetzt gleich wie FST: Nach einem geglückten Kauf sucht der Bot frisch, statt ein zweites Angebot aus der alten Liste zu nehmen. Kleiner Unterschied: Ein fehlgeschlagener Versuch beendet die Liste nicht.

**Warum das nicht reicht:**

> Die Fundstellen des anderen Prüfers stimmen alle. Der Haken steht in popup.html:683, der Standard ist AN (popup.js:82), er wird geladen (popup.js:3452 setzt alle Haken aus CHECK_FIELDS), er geht beim Start mit (popup.js:6611), der Motor nimmt ihn an (content.js:1641) und liest ihn (content.js:6321, 6338, 6343). Der Weg reisst also nirgends. ABER: Der Abbruch greift nur nach einem GEGLUECKTEN Kauf. In content.js:6321 steht "run.stats.bought > kaeufeVorher" - gezaehlt wird nur der geglueckte Kauf. Der Kommentar direkt darueber (content.js:6318-6320) sagt es selbst: "ein fehlgeschlagener Versuch (jemand war schneller) laesst die restlichen Angebote der Liste weiter zu, wie bisher." Genau da liegt der Unterschied. FST macht es anders: In scripts.js:58275 kauft FST nur das erste Angebot (t[0]), und in scripts.js:58329-58332 steht "catch(function(){ e.searchAgain() })" - geht der Kauf SCHIEF, sucht FST sofort neu. FST verlaesst die alte Liste also IMMER nach einem Versuch, egal ob geklappt oder nicht. Bei uns laeuft nach einem Fehlversuch der Rest der alten Liste weiter: content.js:6329-6331 wartet nur die Kaufpause ab und fragt dann das naechste Angebot aus derselben Liste an. Die Pause ist mindestens 8 Sekunden (content.js:195 BUY_GAP_FLOOR_MS), die Liste darf 15 Sekunden alt sein (content.js:252 und 6118). 8 ist kleiner als 15 - also geht eine ZWEITE Kaufanfrage aus der alten Liste raus. Erst die dritte faellt ueber die 15 Sekunden. Das ist wortwoertlich das, was am 27.09. mit NICHT bewertet wurde ("darf noch ein zweites Angebot aus derselben Trefferliste kaufen, solange die Liste unter 15 Sekunden alt ist"). Und der Fehlversuch ist beim Sniping der Normalfall - meistens war jemand schneller. Es kommt also im Alltag weiter etwas anderes heraus als bei FST, und die zusaetzliche Anfrage zaehlt aufs Tageslimit. Dazu kommt: Auch die Gebote (content.js:6343) sind nur nach einem geglueckten Kauf gesperrt, nach einem Fehlversuch gehen sie aus der alten Liste weiter raus. Halb gebaut ist nicht gleich. Das alte Urteil bleibt.

### 7. Max. Kaeufe, Laufzeit und Budget

*Kaufen*

"Max. Käufe" darf jetzt leer bleiben, dann kauft der Bot ohne eigene Grenze - wie FST. Ein Budget musst du aber weiter eintragen, und ausgeliefert wird der Bot weiter mit 3 Käufen und 30 Minuten.

**Warum das nicht reicht:**

> Seine Fundstellen stimmen zwar, aber sie tragen das bessere Urteil nicht.
> 
> Was wirklich gebaut ist: Das leere Feld wird durchgereicht. popup.js:6605 `maxBuys: $("maxBuys").value` schickt den leeren Text mit. content.js:1603-1611 macht daraus `maxBuysUnbegrenzt: true` und setzt die Zahl auf 100. Der Motor liest das auch (content.js:5327, 5582, 5928, 6134). Der Weg reisst nirgends. So weit hat er recht.
> 
> Aber drei Sachen bringen die Aufwertung zu Fall:
> 
> 1. Eine andere Grenze schlaegt vorher zu. Es gibt eine zweite Grenze je Spieler. Voreingestellt sind 3 Kaeufe je Spieler (popup.js:60 `filterBuyLimit: "3"`) und 6 Kaufversuche je Spieler (popup.js:65 `filterAnfrageLimit: ""` = doppelt so viele, content.js:1663-1664). Der Motor stoppt daran: content.js:5332 `if (progress.bought + progress.bids >= run.cfg.filterBuyLimit) return false;` und content.js:6137. Wer einen Spieler snipt - das ist der Normalfall - hoert also weiter nach 3 Kaeufen auf, egal ob das Feld "Max. Kaeufe" leer ist. Das leere Feld aendert bei ihm gar nichts. Die Bedienung weiss das sogar selbst und warnt davor (popup.js:6900-6901). Auch wer die Grenze je Spieler hochdreht, kommt nur bis 20 (popup.html:1039 `max="20"`).
> 
> 2. Im Standard ist der neue Weg aus. popup.js:54 `maxBuys: "3"`. So wie der Bot ausgeliefert wird, hoert er nach 3 Kaeufen auf - genau der Satz, der am 27.09. zum Urteil NICHT gefuehrt hat. Wer nichts umstellt, merkt von der Neuerung nichts.
> 
> 3. Von drei Teilen des Punktes hat sich nur einer bewegt. Das Budget ist weiter Pflicht (content.js:1667 `if (!(cfg.budget >= highest))`), FST hat im Snipe-Modus gar kein Gesamtbudget. Die Voreinstellungen 5.000 Coins und 30 Minuten stehen unveraendert in popup.js:54-55. Zwei von drei Teilen sind also genau wie am 27.09.
> 
> "Im Kern gleich" ist das nicht. FST hoert ohne Zutun nie von selbst nach drei Karten auf, unser Bot schon. Das alte Urteil bleibt stehen.

### 8. Grenzen je Spieler

*Kaufen*

Weiter nicht gleich. Sechs vergebliche Kaufversuche beenden einen Spieler nach wie vor. Neu ist nur: Du kannst die Zahl jetzt selbst hochstellen, bis 60 - von allein ändert sich nichts.

### 9. Woher der Verkaufspreis kommt

*Verkaufen und Aufraeumen*

Es gibt jetzt ein Feld für einen festen Verkaufspreis, der nie veraltet - so macht es FST auch. Unterschied: Bei uns gilt die Zahl für alle Käufe, bei FST je Filter. Lässt du das Feld leer, kann der Bot nach einer Stunde weiter aufhören einzustellen.

**Warum das nicht reicht:**

> Ich habe den ganzen Weg nachgeprueft. Das Feld gibt es wirklich und es wirkt: popup.html:717-718 (Feld "Festpreis beim Gleich verkaufen"), popup.js:34 und 3451/3499 (wird gespeichert und wieder geladen), content.js:7473 STATE.listFestpreis = toInt(...), content.js:4858-4860 der Festpreis gilt und veraltet nie. So weit stimmt die Begruendung des anderen Pruefers.
> 
> Trotzdem faellt die Aufwertung durch, aus drei Gruenden:
> 
> 1. Im Standard ist das Feld LEER. popup.js:66 listFestpreis: "" und content.js:467 listFestpreis: 0. Leer heisst aus. Wer nichts eintippt - und das ist der Normalfall - bekommt gar nichts Neues.
> 
> 2. Der Ersatz-Weg fuer den Normalfall taugt nicht als Verkaufspreis. Ohne Festpreis landet der Bot bei content.js:4916 gedaechtnisPreis. Dieser Preis stammt aus den Suchen waehrend des Laufs. Diese Suchen fragen EA nur bis zum eigenen Zielpreis ab (content.js:4335: Obergrenze ist max(jitterMax, target.maxPrice)). Alles, was der Bot dort sieht, liegt also hoechstens auf Hoehe des Kaufpreises - nie darueber. Der Code sagt das an der gleichen Stelle selbst (content.js:4895: "wuerde seine Karten verschenken"). Danach schlaegt eine andere Grenze zu: content.js:4978 verlangt, dass nach 5 % EA-Gebuehr mehr uebrig bleibt als der Kaufpreis. Liegt der gemessene Anker nahe am Kaufpreis, kommt "Kein Gewinn" und es wird wieder NICHTS eingestellt - genau das Verhalten, das am 27.09. zum Urteil NICHT gefuehrt hat. Bleibt er knapp darueber, verkauft der Bot fast zum Einkaufspreis.
> 
> 3. Schlimmer noch: content.js:2472 (k.ankerMin = e.anker) ueberschreibt den gespeicherten Anker mit dem niedrigen Wert aus der Laufsuche. Ein guter alter Anker aus dem Preis-Check wird also waehrend des Laufs durch einen zu niedrigen ersetzt.
> 
> Dazu der Punkt, den der andere Pruefer selbst nennt: FSTs Zahl steht je Filter (listingProfiles), unsere gilt fuer ALLE Kaeufe. Im Rotations-Betrieb mit vielen Filtern ist eine einzige Zahl unbrauchbar - der Hinweistext in popup.html:719 sagt das selbst ("Sinnvoll ist sie, wenn du auf einen bestimmten Spieler jagst"). Das ist nicht "eine Zahl weicht ab, aendert im Alltag wenig", sondern im Alltag kommt weiter etwas anderes heraus als bei FST.
> 
> Fazit: Mit eingetippter Zahl bei genau einem Spieler ist es jetzt gleich. Im Standard und im normalen Mehrfilter-Betrieb bleibt es beim alten Ergebnis. Urteil bleibt NICHT.

### 10. Welcher Weg die verkauften Karten wirklich entfernt

*Verkaufen und Aufraeumen*

FSTs Weg ist jetzt eingebaut, und beim Knopf "Verkaufte abräumen" sieht der Bot danach bei EA nach, ob die Karten wirklich weg sind - das macht FST nicht einmal. Beim automatischen Abräumen im Lauf fehlt dieses Nachprüfen aber noch.

**Warum das nicht reicht:**

> Die Aufwertung hält nicht. Ich habe die vier genannten Fundstellen nachgelesen.
> 
> 1) Der zweite Versuch ruft FSTs Weg NICHT auf. content.js:3708 schickt `verkaufAusfuehren("abraeumen", { weg: "clearSold" })`. Dieses "weg" kommt in sniffer.js nirgends an: Die Suche nach `daten.weg` in sniffer.js findet null Treffer. In sniffer.js:701-768 (verkaufAktion, Zweig "abraeumen") wird `daten` beim Abräumen gar nicht gelesen. Der Bot fragt also beim zweiten Mal exakt dasselbe wie beim ersten Mal. Er geht wieder von oben durch die Liste und landet wieder bei `removeSold` (sniffer.js:735). Der Satz im Protokoll (content.js:3707 "jetzt über FSTs Weg") ist damit unwahr.
> 
> 2) Deshalb wird `_clearSold` nur dann erreicht, wenn `removeSold` wirft oder nichts zurückgibt (sniffer.js:750-758: erster Weg mit Rückgabe gewinnt, `if (o !== undefined && o !== null) return antwort(true...)`). Genau der Fall, um den es hier geht - `removeSold` antwortet brav, löscht bei EA aber nichts - führt niemals zu `_clearSold`. Eine frühere Grenze schlägt immer zuerst zu.
> 
> 3) `clearSoldFST` (sniffer.js:668-677) wird von niemandem aufgerufen. Die Suche nach dem Namen in sniffer.js, content.js und popup.js findet nur die Zeile, in der die Funktion geschrieben steht. Toter Code. Damit ist auch die Klassensuche am Bauplan (sniffer.js:684-692) für das Abräumen wirkungslos: Der Weg, der wirklich läuft (sniffer.js:741), greift stur auf `window.UTTransferListViewController` zu und sucht gerade nicht am Bauplan. Fehlt der Name am window, wirft er - anders als FST.
> 
> 4) Auch die Rückmeldung "blind" kommt nie an. Nur `clearSoldFST` gibt "blind" zurück (sniffer.js:676), und die Antwort an content.js besteht aus `{ __ownbot, requestId, art, ok }` plus `weg`/`grund`/`nichts` (sniffer.js:696). Ein Feld `blind` wird nie gesetzt. Die Prüfung in content.js:3610 kann darum nie greifen.
> 
> Was bleibt: neu und echt ist nur das frische Nachlesen bei EA vorher und nachher (content.js:3696-3710) und die klare Fehlermeldung (content.js:3713-3717). Der Bot merkt jetzt also, wenn Karten liegen bleiben. Aber er kann nichts dagegen tun - FSTs Weg wird weiterhin nicht gegangen. Das Ergebnis am Konto ist dasselbe wie am 27.09.: Die verkauften Karten bleiben liegen. Dazu kommt die Lücke, die der Prüfer selbst nennt (content.js:3806-3812): Beim automatischen Abräumen während eines Laufs wird einmal abgeräumt, nicht nachgeprüft, und die Anzeige wird trotzdem leer gemacht (content.js:3820-3824 entfernt die verkauften Einträge aus dem Speicher). Urteil bleibt NICHT.

### 11. Das Abzeichen 'Chem' - Karten mit aufgesetztem Chemie-Stil (PlayStyle+).

*Live-Filter, Wertung und Abzeichen*

Das Abzeichen 'Chem' ist da und wird angezeigt, wenn auf der Karte ein Spielstil sitzt. Es erscheint aber nur, wenn EA die Chemie in den Suchtreffern mitschickt - und das ist noch nicht nachgemessen.

**Warum das nicht reicht:**

> Die Aufwertung haelt nicht. Der Knopf ist da, aber es kommt etwas anderes heraus als bei FST.
> 
> 1) Das Abzeichen haengt an einer Annahme, die nirgends gemessen ist. content.js:2548 schreibt als Kommentar "EA nennt das Feld playStyle, 0 heisst keine", und content.js:2554 liest "const v = item.playStyle". popup.js:1230 macht daraus "wenn chem groesser 0, dann Abzeichen". Das "0 heisst keine" ist geraten. Die einzige echte Live-Messung im ganzen Projekt steht in content.js:44: "gemessen: lev=2&pos=130&nat=14&leag=13&playStyle=251". Die Chemie-Nummern liegen also im Bereich um 250 herum. Eine 0 kommt dort gar nicht vor. Auch bei FST gibt es keine 0: scripts.js:1381 "-1 !== e.playStyle" (minus eins heisst "egal") und scripts.js:1908 "getId() > 0" (groesser null heisst "eine Chemie gewaehlt"). Steht bei einer ganz normalen Karte ohne aufgesetzten Stil also die Grundnummer (Basic) drin, ist die groesser als 0 - dann traegt JEDE Zeile das Abzeichen "Chem". Genau das Gegenteil von dem, was es sagen soll.
> 
> 2) Die andere Moeglichkeit ist genauso schlecht: Schickt EA das Feld in der Antwort gar nicht mit, erscheint das Abzeichen NIE. Das Projekt sagt das selbst, in der Bedienung: popup.html:543-545 "Das Abzeichen kann nur erscheinen, wenn EA den Chemie-Stil am Angebot mitschickt. Siehst du es nie, ... schickt EA das Feld nicht." popup.js:7982 hat dafuer bis heute nur die Feld-Probe ("playStyle: Chemie (PlayStyle+)"), die die Frage erst beantworten SOLL. Gemessen wurde sie nicht. Es gibt also keinen Fall, in dem bewiesen waere, dass dasselbe herauskommt wie bei FST - entweder immer oder nie.
> 
> 3) Das Abzeichen bedeutet bei uns etwas anderes. Bei uns ist es die Chemie des EINEN billigsten Angebots im letzten Preis-Check (content.js:2826 "const chemieZiel = chemieVon(listings.find(...bin(a) === lowest))"). Beim naechsten Check kann ein anderes Angebot das billigste sein - dann springt das Abzeichen an oder aus, ohne dass sich am Filter etwas geaendert hat. Bei FST ist "Chem" dagegen eine feste Eigenschaft des Filters, die vom FST-Server kommt: In FSTs Code wird "tags" nur gelesen (scripts.js:39439, 45277, 35401) und an keiner einzigen Stelle gesetzt - es gibt kein "tags:" im ganzen Quelltext.
> 
> 4) Der zweite Teil des Punktes fehlt ganz. In der Bilanz (Z. 293) steht: "Beim Preis-Check den Chemie-Stil getrennt erfassen und als Abzeichen PLUS AUFPREIS zeigen." FST hat dafuer einen eigenen Preis-Modus mit drei Stellungen: scripts.js:41962 "chem_style_pricing: 'no'" und scripts.js:40832-40836 "no" / "dynamic" / "only_chemistry_style". Bei uns gibt es dazu nichts: In popup.html kommt das Wort "chem" ausser in einem fremden Kommentar (Z. 174) nicht vor, und in den Standardwerten von popup.js (DEFAULTS, CHECK_FIELDS, NUMBER_FIELDS) steht kein einziges Chemie-Feld.
> 
> Was stimmt: Der Weg vom Motor bis zur Anzeige ist wirklich durchgaengig (content.js:2957 "chem: chemieZiel" im Eintrag, popup.js:1642/1671 uebergeben den Eintrag an filterBadges, popup-design.css:864 gibt die Farbe), und der alte Deckel "hoechstens zwei Abzeichen" ist wirklich weg. Das ist aber nur der Knopf. Das Ergebnis stimmt nicht ueberein. Es bleibt bei NICHT.

### 12. Im Auto-Modus nur bestimmte Filter fahren: Wertung von-bis und Abzeichen aussuchen.

*Live-Filter, Wertung und Abzeichen*

Du kannst jetzt eine Mindest- und Hoechstwertung eintragen und Abzeichen abwaehlen - der Bot ueberspringt diese Filter dann wirklich. Was noch fehlt: 'nur Filter, die dieses Abzeichen HABEN' kann man nicht sagen.

**Warum das nicht reicht:**

> Ich habe den ganzen Weg nachgeprueft. Vieles stimmt: Die zwei Felder stehen in popup.html:288-289, die neun Haken in popup.html:294-302. Sie stehen in popup.js:34 und popup.js:37 in den Listen, werden in popup.js:3451-3452 geladen, in popup.js:3499-3500 gespeichert, bei jeder Aenderung gesichert (popup.js:8061-8062), und der Standard in popup.js:74-76 laesst nichts heraus. Gefiltert wird wirklich (popup.js:4442-4445), und diese Liste wird im laufenden Autopilot benutzt (popup.js:4543). Der Knopf tut also etwas. Trotzdem faellt die Aufwertung durch, aus zwei Gruenden.
> 
> ERSTENS, und das ist neu: Die Wertungs-Grenze wird fallen gelassen, sobald der Bot den Preis frisch prueft. In popup.js:4633-4634 steht "row.rohWertung = filterScore(...); row.score = row.rohWertung;" - die Wertung wird also NEU berechnet. Danach wird nur noch geprueft, ob noch Gewinn drin ist (popup.js:4636). Deine Grenze "mindestens 6,0" wird NICHT noch einmal geprueft. Der Filter laeuft trotzdem. Und das ist der Normalfall, nicht die Ausnahme: popup.js:4343-4344 verlangt eine Preispruefung bei jedem Filter, der noch nicht geprueft ist - also bei fast jedem frisch gescannten. Genau dort faellt die Wertung nach der Pruefung meist stark ab (der Kommentar in popup.js:4435-4437 sagt selbst: frisch gescannte Filter liegen fast immer unter 1,5). Wer 6,0 eintraegt, sieht den Bot also trotzdem Filter mit 1,2 fahren. In der Bedienung sieht es aus wie bei FST, heraus kommt etwas anderes.
> 
> ZWEITENS: Bei den Abzeichen ist es nicht nur eine kleine Abweichung, sondern die umgekehrte Richtung. Ich habe FSTs Code selbst nachgelesen: In scripts.js:41956-41961 startet FST mit einer Liste aller Abzeichen, jedes mit "include_rule: include". Und in scripts.js:42596-42599 weigert sich FST zu starten, wenn diese Liste leer ist ("error_no_badges"). Waere die Liste - wie bei uns - nur eine Sperrliste, waere eine leere Liste voellig harmlos ("nichts gesperrt"). Dass FST dann gar nicht startet, beweist: Bei FST muss ein Filter mindestens eines der angehakten Abzeichen TRAGEN. Bei uns heisst ein Haken weg nur "diese ueberspringen" (popup.js:4372-4374). Folge: Ein Filter ganz OHNE Abzeichen laeuft bei uns immer, bei FST nie. Und FSTs Beispiel aus der Bilanz (Zeile 301) - "nur Filter mit Unter-Preis-Abzeichen" - geht bei uns nicht, auch nicht, wenn man alle anderen Haken wegnimmt, weil ein Filter mit "Unter Preis" UND "Heiss" dann herausfaellt.
> 
> Das erste Beispiel der Bilanz ("nur ab 7,0") ist also loechrig, das zweite ("nur Unter Preis") geht gar nicht. Nach der Regel "im Zweifel bleibt das alte Urteil" bleibt es bei NICHT. Es ist naeher dran als am 27.09., aber es kommt weiter etwas anderes heraus.

### 13. Aufschlag nach Preisklasse (bei billigen Karten darf der Preis weiter hoch)

*Preise messen*

Die Zahlen und die Grundzahl stimmen jetzt mit FST ueberein. Zwei eigene Bremsen bleiben: nie ueber das teuerste gesehene Angebot und nie zu weit ueber den gemessenen Marktpreis. Unser Verkaufspreis kann also immer noch etwas tiefer liegen.

**Warum das nicht reicht:**

> Nur ein Teil stimmt. Die Zahlen sind wirklich neu: content.js:2618-2624 steht jetzt 0,6 / 0,45 / 0,3 / 0,2 und 0,15. Vorher stand dort 0,4 / 0,3 / 0,22 / 0,18 (im alten Stand nachgesehen, Commit 9175bb2). Das ist FSTs Staffel. Soweit hat der Pruefer recht.
> 
> Der Rest haelt nicht. Der Bot rechnet die Obergrenze nicht mit einer Zahl aus, sondern nimmt IMMER die KLEINERE von zwei Zahlen:
> 1. content.js:2741 'let obergrenze = preisDeckel(anker, markt);' - das ist der Weg ueber den Anker, also FSTs Weg.
> 2. content.js:2756-2757 'const marktDeckel = roundDownToStep(Math.floor(markt * (1 + maxAnhebung(markt)))); obergrenze = Math.min(obergrenze, Math.max(marktDeckel, markt + stepFor(markt)));' - das ist dieselbe Staffel noch einmal, aber auf UNSEREN gemessenen Marktpreis.
> 
> Damit ist die Grundzahl nur dann der Anker, wenn der Anker UNTER unserem Marktpreis liegt. Liegt er darueber, gilt wieder unser Marktpreis als Grundzahl - und genau das war der Punkt, den die Bilanz am 27.09. bemaengelt hat ("die Grundzahl ist eine andere, unser Marktpreis statt FSTs Anker", Bilanz Zeile 311). Der Fehler ist also nicht weg, er greift nur noch in einem Teil der Faelle.
> 
> Schlimmer: Es ist genau der Fall, um den es geht. Der Anker ist nur dann interessant, wenn er hoch liegt - dann laesst FST den Preis hoch. Der Code sagt selbst, dass er das verhindern will (content.js:2745-2752): "Ohne diese Bremse kam bei Markt 20.000 und Angeboten bei 40.000 ein Verkaufspreis von 39.750 heraus." FST haette dort 39.750 zugelassen, wir nicht. Also kommt bei uns weiter etwas anderes heraus als bei FST.
> 
> Dazu kommt ein Punkt, den der Pruefer gar nicht erwaehnt: FST nutzt diesen Deckel NUR in der Methode "lazy" (Bilanz Zeile 309, scripts.js 28022: vs = ['lazy']). Bei uns gilt er in allen drei Methoden - content.js:2762 'for (const name of Object.keys(PREIS_METHODEN))' rechnet sicher, empfohlen und locker mit derselben obergrenze aus Zeile 2761. Das stand schon am 27.09. als Abweichung drin und ist unveraendert.
> 
> Und die dritte alte Abweichung steht auch noch, content.js:2759 'if (gesehenMax > 0) obergrenze = Math.min(obergrenze, gesehenMax);'. Der Pruefer gibt das selbst zu.
> 
> Unterm Strich: eine Abweichung behoben (die Zahlen), eine halb behoben, zwei weiter da, und eine vierte neu dazugekommen. Es sind heute nicht weniger Abweichungen als am 27.09., sondern mehr. Das Urteil bleibt NICHT.

### 14. Chemie (aufgesetzter Spielstil) trennt die Maerkte

*Preise messen*

Der wichtigste Fehler ist weg: Der Bot kauft nicht mehr eine Karte mit anderer Chemie zum falschen Preis. Er misst aber weiter nur einen Preis statt einen je Chemie.

**Warum das nicht reicht:**

> Ich habe den Weg selbst nachgelesen. Der neue Kauf-Filter ist wirklich da und der Weg dahin reisst nirgends: content.js:2370 lehnt Angebote mit falscher Chemie ab, content.js:2958 legt "chemGefiltert" im Eintrag ab, popup.js:5948-5952 gibt die Chemie nur bei getrennter Messung weiter, popup.js:6603 schickt sie beim Start mit, content.js:1589-1590 nimmt sie an, content.js:6203 laedt sie vor der ersten Suche, und content.js:6303 kauft nur ueber isTarget. Trotzdem faellt die Aufwertung durch, aus drei Gruenden.
> 
> Erstens: Das Ganze haengt an einem Feld, das wir nie gemessen haben. Der Bot liest die Chemie in content.js:2551-2556 aus "itemData.playStyle". Popup.js:7980-7983 sagt in eigenen Worten: "Ob EA die Chemie in den Suchtreffern mitschickt, ist ungeprueft." Schickt EA das Feld nicht mit, gibt content.js:2826 null zurueck, content.js:2828 bleibt "chemGefiltert" auf false, popup.js:5951 gibt null, content.js:1590 setzt null - und die neue Zeile 2370 loest nie aus. Dann ist der ganze Bau tote Arbeit. Genau der Fehler "Code ist da, tut aber nichts", und er ist nicht ausgeschlossen, sondern ungemessen.
> 
> Zweitens, und das ist neu: Unsere Suche fragt EA weiterhin NICHT nach der Chemie. content.js:2221-2249 (searchPath) setzt nur Spieler, Preis, Kartenart und Rating in die Adresse - kein playStyle. Dabei ist der Adressname seit dem 24.09. live gemessen und steht als "playStyleParam: playStyle" in content.js:51. FST setzt die Chemie dagegen in die Suche (Bilanz Z. 319, scripts.js 1723/1808). Folge: EA schickt uns weiter alle Chemien gemischt in die 21 Plaetze, und der neue Filter wirft danach einen Teil davon weg. Bei festem Tagesbudget sehen wir also je Suche WENIGER brauchbare Angebote als vorher. Die Begruendung im Code (content.js:2252-2257: bei einem bestimmten Spieler stehen Liga, Nation und Position ohnehin fest) passt fuer diese Felder, aber nicht fuer die Chemie - die ist bei einem Spieler eben NICHT fest.
> 
> Drittens: Gemessen wird weiter nur EIN Preis, naemlich der der Chemie des billigsten Angebots (content.js:2826). Das billigste Angebot ist fast immer die nackte Karte. Damit misst und kauft der Bot praktisch immer nur den Grundmarkt, und der teurere PlayStyle+-Markt - genau der, in dem das Geld liegt - wird nie gehandelt. Man sieht es sogar an der Anzeige: das Abzeichen "Chem" in popup.js:1230 erscheint nur bei "entry.chem > 0", also so gut wie nie. FST macht aus einem Filter mehrere, einen je Chemie, mit eigenem Preis und eigenem Verkaufspreis (Bilanz Z. 319).
> 
> Von den drei Loechern der Bilanz (Z. 321) ist damit eines zu und zwei sind offen, und dazu kommt die offene Suchseite. "FAST" heisst laut Regel: eine Zahl oder ein Weg weicht ab, ohne dass es im Alltag viel aendert. Hier weichen Suche, Messung und Umfang ab, und der einzige gebaute Teil steht auf einer ungemessenen Annahme. Das Urteil vom 27.09. bleibt: NICHT.

### 15. Was passiert, wenn kein brauchbarer Filter mehr da ist

*Auto-Trading und Filterwechsel*

Der Bot hoert nicht mehr einfach auf, wenn die Filter alt sind - er scannt bis zu zweimal selbst nach. Unbegrenzt weiterlaufen wie FST geht nicht, dafuer reicht das Suchbudget nicht.

**Warum das nicht reicht:**

> Der Code ist wirklich da und ist auch angeschlossen (popup.js:4269 rotNachscannen, aufgerufen in popup.js:4551 und 4572). Aber er kommt im Alltag fast nie dran, und wenn er drankommt, bremst er sich selbst aus.
> 
> 1) Eine andere Grenze schlaegt vorher zu. Der Nachscan haengt nur an der Stelle "kein Filter mehr uebrig" (popup.js:4544 "if (!kandidaten.length)"). Filter fallen dort erst nach 15 Minuten raus (popup.js:1277 "const LIVE_FILTER_MS = 15 * 60 * 1000", geprueft in popup.js:4436). Vorher ist aber das Stundenlimit leer, und dafuer gibt es einen ganz anderen Ausgang: popup.js:4585 "if (suchen < ROT_MIN_SUCHEN)" und popup.js:4613 "Fertig: Das Stundenlimit fuer Suchen ist erreicht." Dort steht kein Nachscan.
> Nachgerechnet mit den Standardwerten (popup.js:55 timeLimitMin "30", popup.js:66 rotSuchenProFilter "50", content.js:122 SEARCH_LIMIT_HOUR 150): Markt-Scan 16 Suchen + Filter 1 mit 50 + Filter 2 mit 50 = 116. Rest 34. Filter 3 bekaeme nur noch 34-25 Puffer = 9 Suchen, das ist unter ROT_MIN_SUCHEN 10 (popup.js:4314) - also Ende ueber die Stundengrenze.
> Wie lange dauern zwei Filter? content.js:6040 "streuen(3310, 4010, 0.50, 100, 600)", also rund 4 Sekunden je Suche, dazu alle 45 Suchen 90 Sekunden Pause. Zwei Filter sind nach etwa 9 bis 10 Minuten durch. Der Code sagt das selbst: content.js:6026 "Das Stundenlimit ist statt nach rund 30 Minuten schon nach gut 10 erreicht." Die Filter sind da erst 10 Minuten alt und noch gueltig. Der neue Weg wird also gar nicht betreten.
> 
> 2) Selbst wenn er betreten wird, sagt er Nein. popup.js:4278-4279 "const braucht = kosten + ROT_PUFFER + ROT_MIN_SUCHEN; if (restStunde < braucht || restTag < braucht) return false;" - das sind 16 + 25 + 10 = 51 freie Suchen. Genau in dem Moment, in dem die Filter ablaufen, sind aber nur noch rund 34 uebrig (Rechnung oben). Also false, und es kommt popup.js:4552 "Fertig: Kein frischer Filter mehr uebrig." - dasselbe Ende wie am 27.09.
> 
> 3) Auch der Umweg ueber das Warten hilft nicht. popup.js:4607 wartet nur so lange, bis wieder ROT_MIN_SUCHEN frei sind (popup.js:4598 "const fehlt = ROT_MIN_SUCHEN - restStunde"), also bis etwa 35 freie Suchen. 35 ist weniger als die 51, die der Nachscan braucht. Und bei 30 Minuten Laufzeit greift die Warterei ohnehin selten, weil popup.js:4606 verlangt, dass die Wartezeit noch in die Rotation passt.
> 
> Ergebnis fuer den Nutzer: Die Rotation endet mit den Standardwerten weiter nach rund 10 Minuten, und er muss selbst in den Reiter Filter gehen und neu scannen. FST laeuft die ganze Stunde weiter. Besser geworden ist nur der Erklaertext (popup.js:4254 rotEndeGrund) - ein besserer Satz ist aber kein anderes Ergebnis. Der Nachscan wirkt nur in Sonderfaellen, zum Beispiel wenn jemand mit alten Filtern startet und das Stundenbudget noch voll ist. Nach Regel 4 (im Zweifel bleibt das alte Urteil) bleibt es bei NICHT.

### 16. Deckel von 12 Filtern je Runde

*Auto-Trading und Filterwechsel*

Nach 12 Filtern ist bei uns Schluss, bei FST nicht. Merken wuerde man das nur bei einem Lauf ueber mehrere Stunden - dafuer bremsen vorher die Suchgrenzen.

### 17. Rotation ueber eine selbst gewaehlte Filterliste (FSTs Custom-Modus)

*Auto-Trading und Filterwechsel*

Eine eigene Liste mit zehn Lieblingsspielern, die der Bot der Reihe nach abarbeitet, gibt es weiter nicht. Es bleibt bei einem Spieler oder den Scan-Treffern.

### 18. Konkurrenz "x von 5" - wie viele Schnäppchen andere wegkaufen

*Marktlage und Zeitfenster*

Die Konkurrenz wird jetzt wirklich gemessen - im laufenden Betrieb, wo zwischen zwei Suchen genug Zeit vergeht. Es braucht aber drei Messungen in zwei Stunden, bis eine Zahl dasteht. Bei FST steht sie sofort.

**Warum das nicht reicht:**

> Die Aufwertung haelt nicht. Der neue Code ist zwar da und wird auch aufgerufen (content.js:4342 ruft laufAktivitaet, die Funktion steht in content.js:4580-4640). Aber das Ergebnis kommt in der Kachel trotzdem fast nie an. Drei Bremsen greifen vorher:
> 
> 1) Die Lauf-Messung legt NIE einen neuen Eintrag an. content.js:4651-4658 (aktivitaetSpeichern): "const letzter = liste.length ? liste[liste.length - 1] : null; if (!letzter) return all;". Sie schreibt also nur in einen schon vorhandenen Preis-Eintrag hinein.
> 
> 2) Solche Preis-Eintraege entstehen nur beim Preis-Check von Hand. savePriceEntry steht in content.js:2966 und wird im ganzen Motor genau einmal aufgerufen: content.js:3110, mitten im Preis-Check. Der Markt-Scan, aus dem die Live-Filter kommen, speichert seine Ergebnisse woanders: content.js:3367 "chrome.storage.local.set({ liveMarketResults: ... })" - nicht in priceHistory. Auch popup.js legt keine Eintraege an (popup.js:1586 "sampleSize: t.gesehen" ist nur eine Anzeige-Zeile, sie wird nirgends gespeichert). Der normale Weg - Markt scannen, Live-Filter nehmen, Bot starten - erzeugt also null passende Eintraege, und die ganze Lauf-Messung verpufft still.
> 
> 3) Die Kachel liest nur frische PREIS-CHECKS. popup.js:5360-5362 in marktMessungen: "if (!e || !(Number(e.t) > 0) || jetzt - e.t > vonMs) continue;" - gemessen wird e.t, also der Zeitpunkt des Preis-Checks. Die Lauf-Messung setzt aber nur aktivT (content.js:4633-4639), nicht t. Fuer die Abzeichen hat der Autor genau das bedacht (Kommentar in popup.js:1211-1215 nennt aktivT), fuer die Kachel nicht. Dazu kommt: Pro Karte kann hoechstens EIN Eintrag zaehlen, weil immer derselbe letzte Eintrag ueberschrieben wird. popup.js:5373 verlangt aber 3 Stueck (MARKT_MIN_MESSUNGEN, popup.js:5353). Es braucht also DREI verschiedene Karten, die alle in den letzten zwei Stunden von Hand geprueft wurden UND im selben Lauf gemessen wurden.
> 
> 4) Dazu die Menge: content.js:4578 "const AKTIV_MIN_ANGEBOTE = 4;" und content.js:4611 "if (vorher.length < AKTIV_MIN_ANGEBOTE) return;". Gezaehlt werden nur Angebote im gemeinsamen Preisfenster (content.js:4604-4609), und das endet beim Zielpreis. Beim Schnaeppchen-Jagen liegt der Zielpreis absichtlich unter dem Markt - da stehen meist 0 bis 1 Angebote, nicht 4. Ueber 10 wirft content.js:4385 den Spieler ohnehin raus ("ZU_VIELE_TREFFER: 10", content.js:244).
> 
> Unterm Strich: Der Knopf ist da, der Weg ist gebaut - aber im Alltag steht in der Kachel weiter "noch unbekannt" (popup.js:5596-5598). Bei FST steht die Zahl immer, weil sie vom Server kommt. Das alte Urteil bleibt stehen.

### 19. "Nächstes Hoch" mit Wochentag und Uhrzeit

*Marktlage und Zeitfenster*

Es steht jetzt ein Wochentag dabei, zum Beispiel 'Samstag 20 Uhr'. Der Bot kennt aber weiter nur Zeiten, in denen du schon gesucht hast - das sagt er jetzt auch dazu.

**Warum das nicht reicht:**

> Der neue Wochentag-Teil ist wirklich da und wird auch angezeigt: popup.js:5325 "tachoBesteWochenzeiten" bildet Eimer aus Tag und Stunde (popup.js:5326 'zeit.getDay() + "-" + zeit.getHours()'), popup.js:5463 ruft ihn auf, popup.js:5439 "fensterText" schreibt den Tag im Klartext, popup.js:5634 setzt den Text ins Feld, popup.js:8094 oeffnet das Fenster. So weit stimmt seine Beschreibung.
> 
> ABER: Die Uhrzeit, die da rauskommt, ist die falsche. Die Laeufe werden erst GANZ AM ENDE gespeichert. content.js:6458 ruft "recordRun" genau einmal auf, naemlich nach "Beendet." - und content.js:3931 schreibt in jeden Eintrag 't: now', also die Uhr im Moment des Abschaltens. content.js:3941 ist die einzige Stelle, die "runStats" ueberhaupt fuellt; zwischendurch wird nichts weggeschrieben.
> 
> Folge im Alltag: Wer um 19:30 startet und um 22:10 aufhoert, bekommt alle 1500 Suchen und alle Treffer in den einen Eimer "Mittwoch 22 Uhr" gelegt. Der Bot nennt dann als "naechstes gutes Fenster" genau die Stunde, in der du sonst AUFHOERST - nicht die Stunde, in der die Treffer kamen. Durch den Wochentag wird das schlimmer, nicht besser: die Eimer sind jetzt siebenmal feiner (popup.js:5338 verlangt 30 Suchen JE Tag-Stunde), also fuellen sich nur die ein, zwei Abschalt-Stunden, und aus denen wird dann ein Termin bis zu sechs Tage in der Zukunft gebaut (popup.js:5465 laeuft 168 Stunden weit, popup.js:5453 schreibt "in X Tagen").
> 
> Dazu bleibt der zweite alte Mangel voll bestehen: gezeigt werden nur Zeiten, in denen du schon gesucht hast. FST nennt einen echten Markt-Zeitpunkt von seinem Server (Bilanz Z. 388). Und der "ehrliche Hinweis" steht nur als Maus-Text (popup.js:5639 ist ein 'title=', kein sichtbarer Satz) - sichtbar ist er also nur, wenn man mit der Maus draufbleibt.
> 
> Es kommt also weiter etwas anderes heraus als bei FST: ein Tag ist jetzt dabei, aber die Stunde dahinter misst den Abschaltzeitpunkt statt den guten Markt. Nach Regel 4 bleibt das alte Urteil stehen.

### 20. Unter "Auto" steht eine ECHTE Zahl aus deinem Konto - zum Beispiel "Nutzt dein ganzes Guthaben - 18K"

*Bedienung und Statistik*

Es gibt keinen Knopf 'Auto / Eigene' beim Budget - er wurde nie in die Oberflaeche eingebaut. Das Budget startet weiter bei festen 5.000 Coins, egal wie viel du wirklich hast.

### 21. Vor dem Start steht da, wie lange der Lauf dauert und wie viele Suchen er macht

*Bedienung und Statistik*

Das Start-Fenster sagt jetzt ungefaehr die Wahrheit statt der zwei- bis dreifachen Zeit. FST hat so eine Vorschau gar nicht. Die Pausen sind noch etwas zu knapp gerechnet, die Anzeige ist also eher zu kurz als zu lang.

**Warum das nicht reicht:**

> Stimmt nur der halbe Teil. Richtig ist: popup.js:6977 rechnet jetzt mit 3,0 / 4,6 / 3,9 Sekunden je Suche, und content.js:6032-6041 wuerfelt genau diese Werte (Mittel: sicher 4,57, turbo 2,95, normal 3,84 Sekunden). Die Sekunden sind also repariert.
> 
> Aber der Punkt am 27.09. war nicht nur "falsche Sekunden". Im Bericht (analyse/FST-Bilanz-27-09.md, Zeile 411) stand als Grund: "Zwei Stellen in derselben Oberflaeche widersprechen sich". Und genau das ist heute noch so - sogar im selben Fenster:
> 
> 1) Die Pausen sind in der Schaetzung weiter falsch. popup.js:6981-6982 nimmt 45 Sekunden je 40 Suchen. content.js:6091-6094 macht 90 Sekunden je 45 Suchen, und content.js:6101-6102 legt jede vierte Pause auf das 2,7-fache (rund 243 Sekunden). Die Bilanz hatte genau das als noetige Arbeit genannt ("die Pause auf 90 Sek. je 45 Suchen bringen") - das ist nicht gemacht.
> 
> 2) Dadurch ist die Schaetzung nicht "rund ein Viertel" zu kurz, sondern bei der Pausen-Stufe "lang" fast die Haelfte. Rechnung: Tempo Sicher + Pausen lang ergibt in Wahrheit 13,2 Sekunden je Suche, popup rechnet mit 7,9. Fuer 150 Suchen heisst das: Fenster sagt "ca. 20 Min.", der Bot braucht rund 33.
> 
> 3) Zwei Zahlen im selben Start-Fenster widersprechen sich. Die Laufzeit-Zeile (popup.js:2629-2631, Pausen 90 Sek. je 45) sagt beim Standard "rund 15 Minuten". Die Schaetzzeile darunter (popup.js:6993) sagt "ca. 13 Min.". Bei Pausen "lang" sind es 27 gegen 20 Minuten. Der Leser sieht zwei verschiedene Antworten auf dieselbe Frage.
> 
> 4) Der neue Warnsatz verschwindet genau dann, wenn man ihn braucht. renderLaufzeit schreibt in das Feld mit der Klasse "tune-auto" (popup.js:2665-2666). popup.js:6695 blendet dieses Feld aus, sobald die Zeile Laufzeit auf "Eigene" steht: row.querySelector(".tune-auto").hidden = custom. Man muss aber auf "Eigene" klicken, um ueberhaupt eine eigene Minutenzahl eintippen zu koennen (popup.html:1025-1032). Wer also 60 oder 120 Minuten einstellt - der Fall, in dem die Warnung am meisten wert waere - sieht sie nie.
> 
> 5) Bei leerem Laufzeit-Feld ist der neue Satz sogar falsch. popup.js:2634 setzt dann 300 Minuten, popup.js:2643 haelt "endet durch die Stunde" fuer wahr und schreibt "ohne Zeitlimit - der Lauf endet aber schon nach rund 15 Min.". Im Motor ist das nicht so: content.js:1612 setzt bei leerem Feld ebenfalls 300 Minuten, und content.js:4182-4186 bricht nur ab, wenn das Warten ueber das Laufende hinausginge. 43 Minuten Warten liegen weit vor 300 Minuten - bei von Hand gewaehlten Spielern (ohne Ablaufzeit) wartet der Bot also und macht weiter. Das Fenster sagt "Ende nach 15 Min.", der Bot laeuft trotzdem.
> 
> Fazit: Die Schaetzung luegt weiterhin, nur in die andere Richtung, und sie widerspricht der Zeile direkt darueber. Das alte Urteil bleibt: NICHT.

### 22. Speicherplatz - eine Grenze, die FST nicht hat

*Was wo gespeichert wird*

Es bleibt beim Alten: wir haben eine Speichergrenze, FST nicht. Der eine Einzeiler in manifest.json, der sie aufheben wuerde, ist nicht eingebaut.

### 23. EA nach der erlaubten Preisspanne einer Karte fragen, bevor der Bot sie einstellt

*EA-Funktionen, die FST nutzt und wir nicht*

Der Bot holt sich die erlaubte Preisspanne jetzt aus dem Speicher der Web App - das deckt die meisten Faelle. Weiss die App nichts, fragt FST noch bei EA nach, wir nicht. Dann stellt der Bot wie bisher ohne Grenze ein.

**Warum das nicht reicht:**

> Ich habe die Fundstellen selbst nachgelesen. Die Leitung ist zwar gebaut, aber sie liefert im Alltag nie eine Antwort. Deshalb kommt am Ende dasselbe heraus wie vorher.
> 
> 1) Die Frage wird nur gestellt, wenn beide Grenzen fehlen: content.js:4954 "if (!eaMin && !eaMax)". Das ist genau der Fall, in dem die Karte gerade erst gekauft wurde und der Bot sonst nichts über sie weiß.
> 
> 2) Die Antwort kommt nur aus dem Speicher der EA-Seite. sniffer.js:546-561 sucht die Karte an drei Stellen: in APP_ANGEBOTE, in transferItems() und in unassignedItems(). Findet er sie nicht, antwortet er sniffer.js:561: antwort(0, 0, false, "Karte nicht im Speicher der App"). Dann macht content.js weiter wie vorher, ohne Grenze.
> 
> 3) An allen drei Stellen kann die frisch gekaufte Karte normalerweise gar nicht liegen:
> - APP_ANGEBOTE wird nur gefüllt, wenn der Suchweg "app" an ist (sniffer.js:1137, gefüllt in searchTransferMarket). Dieser Schalter steht im Standard AUS: popup.js:82 "appSuchweg: false", und content.js:7451 "STATE.suchweg = settings && settings.appSuchweg === true ? 'app' : 'direkt'". Im Standard ist die Liste also leer.
> - transferItems() liest die Transferliste (sniffer.js:486 repo.getTransferItems()). Dort liegt die Karte in diesem Moment nicht. Sie wird erst DANACH dorthin geschoben, und nur wenn das Einstellen scheitert (content.js:5476 sendToPile(won.id, "trade", ...)).
> - unassignedItems() liest den Merkspeicher der EA-Seite (sniffer.js:514 repo.unassigned). Der Bot kauft im Standard aber mit einer eigenen Anfrage am Browser vorbei: content.js:2168 "res = await fetch(SESSION.base + path, ...)". Die EA-Seite erfährt von diesem Kauf nichts, also steht die Karte auch nicht in ihrem Merkspeicher.
> 
> 4) Der teure, aber entscheidende Schritt fehlt weiter. Das steht im Code selbst: sniffer.js:532-534 "Wir machen NUR den ersten, kostenlosen Schritt". requestMarketData wird im ganzen Ordner nirgends aufgerufen. Genau dieser Schritt ist bei FST der, der im Zweifelsfall die Spanne holt (Bilanz Z. 439).
> 
> Ergebnis für den Nutzer: unverändert. Fehlt die Spanne, stellt der Bot weiter ohne Grenze ein, EA lehnt ab, und die Karte bleibt unverkauft liegen - genau das, was am 27.09. als NICHT bewertet wurde (Bilanz Z. 442). Ein Weg, der im Standard immer "nicht gefunden" meldet, ist kein "FAST". Er wäre höchstens dann etwas wert, wenn der Nutzer den Suchweg "app" einschaltet - und ein Schalter, der im Standard aus steht, gilt als nicht gebaut.

### 24. Verkaufte Karten von der Transferliste abraeumen

*EA-Funktionen, die FST nutzt und wir nicht*

Wenn unser erster Weg scheitert, nimmt der Bot jetzt genau den Weg, den FST benutzt. Danach schaut er bei EA nach, ob die Karten wirklich weg sind. Der zweite Versuch danach waehlt den Weg allerdings nicht gezielt, er wiederholt nur dasselbe.

**Warum das nicht reicht:**

> Die Aufwertung haelt nicht. Ich habe den Code selbst nachgelesen.
> 
> 1) FSTs Weg steht zwar in der Liste (sniffer.js:740-747), kommt aber genau dann nicht dran, wenn er gebraucht wird. Die Schleife ab sniffer.js:751 nimmt den ersten Weg, der NICHT abstuerzt. Weg 1 ist removeSold (sniffer.js:720). Sobald removeSold irgendetwas zurueckgibt, bricht die Schleife ab (sniffer.js:754 "break" bzw. sniffer.js:757 "return antwort(true, { weg: name })"). _clearSold wird dann nie aufgerufen.
> 
> 2) Der Rueckfall in content.js greift genau im falschen Fall. content.js:3702 startet ihn nur, wenn der erste Versuch OHNE Fehler durchlief, die Karten aber trotzdem noch bei EA liegen. Das heisst: removeSold ist nicht abgestuerzt. Beim zweiten Aufruf laeuft im Sniffer aber wieder dieselbe Schleife, wieder mit removeSold an erster Stelle, wieder ohne Absturz. Es passiert also zum zweiten Mal dasselbe wie beim ersten Mal. FSTs Weg wird nie erreicht.
> 
> 3) content.js:3708 schickt { weg: "clearSold" } mit. Der Sniffer liest das im Abraeum-Teil nirgends aus: "daten" kommt dort ueberhaupt nicht vor (nur sniffer.js:703 beim Einstellen). Die Meldung in content.js:3707 "jetzt ueber FSTs Weg (_clearSold)" sagt dem Nutzer also etwas anderes, als der Bot tut. Dabei werden noch zwei weitere EA-Anfragen verbraucht (content.js:3675 reserveUsage und content.js:3604 reserveUsage) - fuer eine Wiederholung, die nichts Neues macht.
> 
> 4) Die saubere Fassung ist toter Code. sniffer.js:668-677 (clearSoldFST) sucht die Klasse mit transferListViewClass() (sniffer.js:684-693) und macht danach setDirty - also den Schritt, den FST wirklich macht. Diese Funktion wird nirgends aufgerufen. Die lebende Fassung sniffer.js:741 greift stur auf window.UTTransferListViewController zu und hat kein setDirty. In EA-Fassungen, in denen die Klasse nicht unter ihrem Namen am window steht - genau dafuer wurde die Suchfunktion gebaut - stuerzt sie sofort ab (sniffer.js:743).
> 
> 5) Der automatische Weg prueft gar nichts nach. Die Verkaufs-Wache ruft content.js:3811 nur einmal verkaufAusfuehren("abraeumen") auf und loescht danach die verkauften Karten einfach aus dem eigenen Speicher (content.js:3824-3827). Kein Nachlesen, kein zweiter Versuch, kein _clearSold. Und der Schalter dafuer steht im Standard auf AUS (popup.js:82 autoAbraeumen: false, content.js:463 autoAbraeumen: false).
> 
> Ergebnis: FST raeumt mit _clearSold ab und es funktioniert dort immer. Bei uns laeuft im Alltag weiter removeSold, und wenn das nur die Anzeige putzt, wiederholt der Bot genau das noch einmal. Es kommt also etwas anderes heraus als bei FST. Das alte Urteil NICHT bleibt stehen.

### 25. Weiter kaufen, obwohl "Nicht zugewiesen" voll ist

*EA-Funktionen, die FST nutzt und wir nicht*

Liegen bei dir fuenf oder mehr Karten in "Nicht zugewiesen", startet der Bot weiterhin gar nicht. FST kauft in der Lage weiter. Weder FSTs Weg noch ein Aufraeum-Knopf ist gebaut.

### 26. Verein, Liga und Nation aus EAs eigenen Tabellen

*EA-Funktionen, die FST nutzt und wir nicht*

Im Standard geht der Vereins-Filter weiter mit einem geratenen Namen an EA - er kann still wirkungslos sein. Neu ist nur eine Warnung und ein Umweg ueber die EA-App, den man erst selbst einschalten muss.

### 27. Die Abzeichen 'Trending' und 'Profit++' (doppeltes Gewinn-Abzeichen).

*Live-Filter, Wertung und Abzeichen*

Ein Filter mit 5 Prozent Marge und einer mit 20 Prozent sehen bei uns beide nur "Gewinn+" aus. "Trending" geht ohne fremde Daten nicht, aber "Gewinn++" waere eine Zeile Arbeit gewesen - gebaut wurde es nicht.

### 28. Suchen und Kaufen durch EAs eigenes Programm laufen lassen

*EA-Funktionen, die FST nutzt und wir nicht*

FST schickt jede Suche und jeden Kauf durch EAs eigenes Programm. Bei uns steht dieser Weg immer noch aus, und selbst eingeschaltet wuerde er jede Suche mit Rating oder Kartenart ablehnen - und ein Rating setzt fast jeder. Das ist absichtlich so, weil ungemessen ist, ob EAs Programm unsere Filter durchreicht.

## Die 9 Punkte, die nur gegen den Kontoschutz gingen

Diese bleiben bewusst anders. EA hat dieses Konto dreimal gesperrt: bei rund
450 Suchen am Tag, bei zwei Kaeufen in einer Sekunde, und zweimal mit
wachsender Sperre (1 -> 6 -> 24 Stunden).

- **Wie viele Suchen in einer Stunde herauskommen** - FST macht rund 850 bis 900 Suchen in der Stunde, wir 150. Das bleibt so, und zwar mit Absicht: EA hat dieses Konto schon dreimal gesperrt. Seit dem 27.09. kann man auch von Hand nicht mehr ueber 200 stellen.
- **Wie viele Anfragen an einem Tag insgesamt herausgehen** - Bei 440 Anfragen am Tag ist Schluss, egal was du eintraegst. Das ist Absicht - FST hat keine solche Grenze. Aber es steht immer noch nirgends: du darfst 2000 eintippen und bekommst 440.
- **Der Abstand zwischen zwei Kaeufen aus derselben Suche** - FST holt drei Schnaeppchen aus einer Suche in gut einer Sekunde, wir meist nur eines. Das bleibt bewusst so: genau zwei Kaeufe in einer Sekunde haben am 22.09. zur Sperre gefuehrt.
- **Kaufversuche pro Stunde und pro Tag** - Der Bot macht hoechstens 40 Kaufversuche in der Stunde und 100 am Tag, FUT Simple Trader hat da gar keine Bremse. Ist die Stunde voll, hoert unser Lauf sofort auf - beim Suchen wartet er inzwischen, beim Kaufen nicht.
- **Waehrend des Laufs merken, dass etwas verkauft wurde** - Der Bot fragt hoechstens sechsmal je Lauf und hoechstens alle 5 Minuten wirklich bei EA nach, ob etwas verkauft wurde. FST schaut etwa jede halbe Minute nach - bei uns hinken "verkauft seit Start", Gewinn und Muenzstand deshalb hinterher.
- **Das Abzeichen 'Heiss' (bei FST 'Hot').** - Das Abzeichen kann jetzt zusaetzlich auf dem Filter erscheinen, auf dem der Bot gerade laeuft - und das gratis. Auf einer frischen Liste mit 40 Zeilen bleibt es aber weiter auf fast allen Zeilen aus, weil der Scan nur 6 Karten wirklich nachmisst.
- **Woher die Preise auf den Filterzeilen kommen.** - Auf mindestens 34 von 40 Filterzeilen steht weiter "Nur gesehen" und "Ungeprueft", und ihre Wertung wird auf 42 Prozent gedrueckt. Bei FST hat jede Zeile einen geprueften Preis und man kann sofort starten.
- **Wie viele Suchen eine Messung kosten darf** - Eine Preismessung darf bei uns hoechstens 12 bis 15 Suchen kosten, FST tastet sich ohne Deckel weiter. Mit 350 Suchen am Tag kann man eine ganze Zielliste etwa einmal taeglich durchmessen, dann ist der Tag vorbei.
- **Wie viele Filter in einer Stunde wirklich durchlaufen** - Suchen je Filter und Pause sind jetzt genau FSTs Zahlen (50 Suchen, 5 Minuten), und bei vollem Stundenlimit wartet der Bot statt aufzuhoeren. Trotzdem schaffen wir zwei bis drei Filter in der Stunde, FST acht bis zehn - das liegt allein an unseren 150 Suchen pro Stunde.

## Die 11 Punkte, die FSTs Server braeuchten

FST sammelt die Zahlen aller Nutzer auf einem eigenen Server und rechnet
dort. Diesen Server duerfen wir nicht nutzen - die schriftliche Erlaubnis
des Anbieters deckt den Code, nicht den Server. Dafuer verlaesst bei uns
nichts den Rechner.

- **Die zwei Prozentzahlen auf jeder Filterzeile: Treffer je 100 Suchen und wie viele davon zum Kauf wurden.** - Die Zahlen sind unveraendert nur aus deinen eigenen Laeufen, bei einem neuen Nutzer stehen sie auf keiner Zeile. Immerhin steht jetzt dabei, warum die Stelle leer ist, statt dass es nach einem kaputten Programm aussieht.
- **Die Wertung selbst (Score) und die Zahl, die darunter steht.** - Unsere Wertung 7,1 und FSTs 7,1 bedeuten weiter nicht dasselbe - unsere ist gerechnet, FSTs gemessen. Neu ist, dass jetzt direkt an der Zahl steht: "Eine Einschaetzung, keine gemessene Trefferchance."
- **EAs eigener Marktschnitt als zweite Meinung** - FSTs Server rechnet aus EAs Marktschnitt einen fertigen Preis, wir warnen nur ab 40 Prozent Abweichung. Und es ist bis heute nicht gemessen, ob EA das Feld ueberhaupt mitschickt - die Warnung hat vermutlich noch nie jemand gesehen.
- **Woher die Filter kommen und was sie kosten** - Jeder frische Filter muss bei EA erarbeitet werden und kostet bis zu 16 Suchen - FST holt ihn fertig bewertet vom eigenen Server, fuer null EA-Anfragen. An einem Tag mit 350 Suchen gehen so schnell 64 Suchen nur ins Nachladen.
- **Die Zahl schon sehen, BEVOR man den Bot startet** - Genau die Frage "lohnt es sich jetzt?" bleibt vor dem Start offen - die Kachel zeigt einen Strich, bis rund 20 Suchen gelaufen sind. Wer 6 Stunden nicht gebotet hat, sieht wieder einen Strich.
- **Stat Zone - die große Auswertungsseite** - FSTs grosse Auswertungsseite liegt auf deren eigener Webseite. Bei uns gibt es weiter nur das Blatt "Heute und letzte 7 Tage" - laenger zurueck schaut der Bot nicht, obwohl er 500 Laeufe gespeichert hat.
- **Preis-Gedaechtnis: woher der Bot weiss, was eine Karte wert ist** - Der Bot kennt weiter nur die Preise, die er selbst gemessen hat - hoechstens 1500 Karten, und nach 7 Tagen ist jede Messung weg. FST bekommt die Preise aller Nutzer vom eigenen Server geliefert. Das geht ohne Server nicht.
- **Markt-Anzeige: laeuft der Markt gerade gut?** - Der Tacho ist ehrlicher geworden: Er zeigt jetzt getrennt, wie der Markt laeuft und wie gut du ausgeruestet bist. Die Zahlen kommen aber weiter nur aus deinen eigenen Laeufen, und unter 20 Suchen in 6 Stunden steht immer noch ein Strich. FSTs Zahl steht sofort, weil sie von tausenden Nutzern kommt.
- **Einstellungen, Filter und Pausen-Vorlagen sichern** - Sichern geht weiter nur von Hand ueber eine Datei. Eine Erinnerung, dass du lange nicht gesichert hast, gibt es nicht. Bei FST liegt alles auf deren Server und ist nach dem Anmelden auf jedem Rechner da.
- **Fertige Filter, die der Anbieter liefert** - Es gibt weiter keine fertigen, schon geprueften Filter zum Anklicken. Du musst erst selbst einen Markt-Scan laufen lassen, und der kostet Suchen aus deinem Tagesbudget.
- **Sicherheitszaehler ueber Neustarts hinweg** - Die Sicherheitszaehler stehen weiter nur in diesem Chrome-Profil. Neu installieren oder ein zweites Profil setzt sie auf Null zurueck - EA rechnet aber dein Konto zusammen. Faelschungssicher geht das nur ueber einen Server.

## Die 24 fast gleichen Punkte

- **Während der Bot läuft sehen, welche Einstellungen gerade gelten** (Bedienung und Statistik) - Waehrend der Bot laeuft steht jetzt da, mit welchem Tempo, Budget und welchen Grenzen er gestartet ist. Nur der Mindestgewinn fehlt noch.
- **Vor dem Einstellen fragen, ob die Transferliste voll ist** (EA-Funktionen, die FST nutzt und wir nicht) - Der Bot fragt jetzt EA selbst, ob die Transferliste voll ist, statt seine eigene Zaehlung zu glauben. Gefragt wird direkt vor dem Einstellen - wie bei FST.
- **Wandernder Mindestpreis, damit zwei Suchen nie gleich aussehen** (Suchen) - Ein Fehler ist weg: Die Treppe gehoert jetzt zu jedem Spieler einzeln, nicht mehr zum ganzen Lauf - so sieht EA wieder rund ein Dutzend verschiedene Anfragen. Bei billigen Karten bricht sie wegen unserer Halbe-Preis-Grenze aber frueher ab als bei FST.
- **Wandernder Hoechstpreis** (Suchen) - Hier ist nichts passiert, und das ist in Ordnung. FST senkt die Preisgrenze und hat die Sache im Standard sogar ganz aus. Wir heben sie an - gekauft wird trotzdem nur bis zu deinem Zielpreis, und am Ergebnis aendert sich nichts.
- **Wie lang die Pausen sind und wie sie streuen** (Kontoschutz) - Jetzt kommt die Pause nach 32 bis 58 Suchen statt immer nach genau 45 - mit denselben Zahlen wie FST. Auch die lange Pause faellt jetzt mal nach 3, mal nach 5 Pausen. Dein Verdienst aendert sich dadurch nicht, aber der Bot sieht fuer EA weniger nach Maschine aus.
- **Abstand zwischen zwei Kaeufen** (Kaufen) - Unveraendert und unauffaellig: Wir warten mindestens 8 Sekunden zwischen zwei Kaeufen, FST rund 7,5 bis 10. Der Weg dorthin ist anders gebaut, das Ergebnis merkt man nicht.
- **Platz-Pruefung vor dem Kauf** (Kaufen) - Die Grenzen sind dieselben wie bei FST, und der Bot fragt EA jetzt sogar direkt, ob die Transferliste voll ist. Ein Rest bleibt: Ist die Zahl aelter als 2 Minuten, prueft der Bot gar nicht mehr - dann kann ein Kauf doch ins Leere gehen. Bei FST steht die Pruefung immer.
- **Nach dem Kauf sofort zum Verkauf einstellen ("Gleich verkaufen")** (Verkaufen) - Die Karte steht nach dem Kauf in rund 5 bis 7 Sekunden im Verkauf, genau wie bei FST: gleiche Wartezeiten, gleiche Stunde Laufzeit, Startgebot eine Stufe darunter. Ein Punkt ist besser: Bringt der Preis nach EAs Gebuehr keinen Gewinn, stellt unser Bot gar nicht erst ein - FST stellt in diesem Fall trotzdem ein.
- **Verkaufte Karten abraeumen, wenn die Transferliste voll ist** (Verkaufen) - Der Knopf 'Verkaufte abraeumen' sagt nicht mehr faelschlich 'Es gibt nichts abzuraeumen'. Er sieht frisch bei EA nach und prueft danach sogar, ob die Karten wirklich weg sind. In den Optionen steht derselbe Haken aber zweimal untereinander - der untere ist tot.
- **'Fuer dich' - genau eine hervorgehobene Zeile mit kurzem Grund.** (Bedienung) - Es steht jetzt immer ein Vorschlag da, auch bei einer schwachen Liste. Ist die Wertung niedrig, heisst die Zeile ehrlich 'Beste dieser Liste' statt 'Fuer dich'. Der Vorschlag ist vorausgewaehlt, wie bei FST.
- **Die vier Budget-Reiter (Gesamt, Niedrig, Mittel, Hoch).** (Bedienung) - Die Reiter richten sich jetzt nach deinem Geld. Bei 2 Millionen Budget ist nicht mehr alles ueber 5.000 'Mittel'. Nur bei ganz kleinem Budget bleiben die alten festen Grenzen, sonst waeren die Reiter wertlos.
- **Preis nach dem Alter der Angebote (das Herzstueck beider Bots)** (Preise) - Die Regeln und Zahlen sind FSTs. Bei den meisten Karten kommt derselbe Preis heraus. FST tastet sich aber mit vielen echten Suchen nach oben, wir nur um 10 Prozent. Liegt der wahre Verkaufspreis weit ueber allem, was wir gesehen haben, bleiben wir darunter. Mehr tasten wuerde 10 bis 30 Suchen je Karte kosten - dafuer sind die Schutzgrenzen zu eng.
- **EA-Mindestpreis und EA-Hoechstpreis** (Preise) - Karten, bei denen der Marktpreis schon auf EAs Mindestpreis klebt, startet der Bot gar nicht mehr - genau wie FST. Die Preisspanne holen wir weiter kostenlos von EA selbst, FST braucht dafuer seinen eigenen Server.
- **Ganz frische Angebote zaehlen beim Marktpreis nicht mit** (Preise) - Angebote zwischen einer und zwei Minuten zaehlen jetzt auch bei uns nicht mehr mit, genau wie bei FST. Nur wenn nach dem Aussortieren weniger als fuenf Angebote uebrig bleiben, nimmt der Bot wieder alle - sonst waere die Messung zu duenn.
- **Den gefundenen Preis selbst verschieben** (Preise) - Du kannst den Verkaufspreis jetzt um ganze Preisstufen verschieben, nach oben und nach unten, hoechstens 30 Stufen - wie bei FST. Bei billigen Karten ist das genauer als Prozent. Auf den Kaufpreis wirkt ein Plus bewusst nicht.
- **Wie lange ein Filter laeuft, bevor gewechselt wird** (Rotation) - Ein Filter laeuft jetzt 50 Suchen lang wie bei FST, dazu 5 Kaeufe und 10 Kaufversuche. Du musst nichts mehr von Hand nachstellen.
- **Welche Filter ausgewaehlt werden und in welcher Reihenfolge** (Rotation) - Der Bot faehrt keine 300-Coin-Karten mehr: Erst ab 1.200 Coins kommt ein Filter in die Rotation, genau wie bei FST. Dazu kannst du eine Wertungsspanne setzen. Was uns fehlt und fehlen bleibt: FSTs Server weiss, welcher Filter gerade bei allen Nutzern traegt.
- **Vergleich zum üblichen Niveau ("+12 % gegenüber sonst")** (Marktlage) - Die Prozentzahl steht jetzt neben dem Wort, so wie bei FST. Am Anfang bleibt die Zeile aber leer, weil die Zahl aus deinen eigenen Laeufen kommt - FST holt sie vom Server und zeigt sie sofort.
- **Effizienz: Treffer / Erfolg** (Marktlage) - Dieselben zwei Zahlen wie bei FST. FSTs Zahlen kommen aber vom Markt aller Nutzer, unsere nur aus deinem Konto. Fuer die Frage 'laeuft es bei mir gut' ist unsere Zahl sogar die passendere - fuer die Frage 'wie laeuft der Markt' nicht.
- **Die Zahl 0 bis 100 mit Wort und Farbbalken** (Bedienung) - Der Wunsch aus der Bilanz ist erfuellt: Markt und eigene Ausruestung stehen jetzt getrennt daneben. Die grosse Zahl oben mischt aber weiter beides und kommt nur aus deinen eigenen Laeufen - zwei Nutzer sehen zur selben Minute noch immer verschiedene Zahlen, bei FST dieselbe.
- **Jede Einstellung auf "Auto" oder "Eigene", und unter Auto steht im Klartext, was gerade gilt** (Bedienung) - Es sind weiter fuenf von FSTs acht Zeilen. Budget, Hoechstpreis je Karte und Mindestgewinn haben immer noch keinen Auto-Knopf an dieser Stelle. Der Budget-Schalter wurde sogar programmiert, aber der Knopf dazu fehlt in der Seite - du kannst ihn nicht sehen und nicht bedienen.
- **Einstellungen als Vorlage speichern und wieder laden** (Bedienung) - Du kannst jetzt auch nur deinen Einstellungs-Satz sichern, ganz ohne Spieler - genau wie FSTs "Save preset". Deine Zielliste bleibt beim Laden unberuehrt. Einziger Rest: unsere Vorlagen liegen nur auf diesem Rechner, weil das Ablegen im Netz FSTs Server braucht.
- **Hilfe, die zur gerade offenen Seite passt** (Bedienung) - Funktioniert und fuehrt in einem Klick zum richtigen Absatz. Ein Weg bleibt anders: bei uns springt der ganze Bildschirm in den Hilfe-Reiter, bei FST geht ein Fenster ueber der Seite auf und du bleibst, wo du warst. Seit dem 27.09. wurde hier nichts geaendert.
- **Sammlungen und Schnellprofile** (Bedienung) - Sammlungen und die drei Schnellprofile arbeiten wie beschrieben. Die zwei Unterschiede aus der Bilanz sind unveraendert: hoechstens 20 Sammlungen, und sie liegen nur auf diesem Rechner. Beim Rechnerwechsel sind sie ohne Sicherungsdatei weg.

## Die 29 Punkte, die gleich oder besser sind

- `BESSER` **Welches Angebot gekauft wird** (Kaufen) - Der Bot kauft in einer Suche immer das billigste passende Angebot zuerst und prueft Spieler, Rating und Kartenart noch einmal selbst nach. FST nimmt einfach das erste, was EA schickt. Unveraendert seit dem 27.09.
- `BESSER` **Coins-Pruefung vor dem Kauf** (Kaufen) - Reicht das Geld fuer ein Angebot nicht, ueberspringt der Bot nur dieses eine und sucht weiter. Erst wenn es fuer gar keinen Zielpreis mehr reicht, hoert er auf. FST hoert schon beim ersten Mal ganz auf.
- `BESSER` **Verlustschutz beim Einstellen** (Verkaufen und Aufraeumen) - Bringt der Verkaufspreis nach den 5 Prozent EA-Gebuehr nicht mehr als der Kaufpreis, wird die Karte gar nicht erst eingestellt, sondern nur auf die Transferliste gelegt. Bei FST wird sie trotzdem mit Verlust eingestellt.
- `BESSER` **Abgelaufene Karten wieder einstellen** (Verkaufen und Aufraeumen) - Ein Klick stellt alle abgelaufenen Karten wieder ein, und der Knopf zeigt sogar, wie viele es sind. Bei FST gibt es das gar nicht, da muss man das in der EA-Seite von Hand machen.
- `BESSER` **Wie alt darf eine Messung sein** (Preise messen) - Ein gemessener Preis gilt 15 Minuten, ein Verkaufspreis 60 Minuten, und zu alte Preise misst der Start von selbst nach. FST misst jeden Filter jedes Mal neu – das Ergebnis ist gleich, aber wir sparen Suchen. Der neue Haken fuer 12 Stunden ist ab Werk aus.
- `BESSER` **EA meldet "zu viele Anfragen" (HTTP 429)** (Kontoschutz) - Meldet EA "zu viele Anfragen", hoert der Lauf auf und der Start bleibt 15 Minuten zu. Bei der zweiten Warnung am selben Tag werden daraus 90 Minuten, bei der dritten 9 Stunden. FST-Nutzer koennen sofort wieder starten.
- `BESSER` **EA lehnt einen Kauf mit HTTP 426 ab** (Kontoschutz) - Ein einziges abgelehntes Kaufsignal (426) beendet den Lauf und sperrt den Start eine Stunde. FST zaehlt das nur als normalen Fehlschlag und kauft bis zum sechsten Fehler weiter.
- `BESSER` **Echte Sperre: 461 (Aktion nicht erlaubt) und 521 (stille Sperre)** (Kontoschutz) - Kommt eine echte Sperre von EA, hoert der Bot ueberall auf – egal ob beim Suchen, Kaufen oder Verkaufen – und der Start bleibt 1 bzw. 2 Stunden zu, beim naechsten Mal sechsmal so lang. FST macht nach einem 461 beim Kauf einfach weiter.
- `BESSER` **Captcha: EA fragt, ob hier ein Mensch sitzt** (Kontoschutz) - Fragt EA nach einem Captcha, stoppt der Bot und der Start bleibt eine Stunde zu – auch dann, wenn die Frage ueber die EA-App kam. FST zeigt nur ein Fenster mit "Schliessen" und laesst sofort weitermachen.
- `BESSER` **Grenzen pro Stunde und pro Tag** (Kontoschutz) - Der Bot bremst sich selbst bei 150 Suchen die Stunde und 440 Anfragen am Tag – bewusst unter den rund 450, bei denen EA gesperrt hat. Neu: Auch wer in den Optionen hochdreht, kommt jetzt nie ueber 220 Anfragen in der Stunde. FST hat gar keine Schutzgrenzen.
- `BESSER` **Kommt eine EA-Anfrage an den Zählern vorbei?** (Kontoschutz) - Ich habe jede Stelle nachgezaehlt, an der der Bot zu EA geht – alle sind gebucht. Waehrend einer Sperre geht gar keine Anfrage raus, und laeuft ein zweiter Tab, stoppt der Verlierer. FST zaehlt zwar mit, bremst damit aber nichts.
- `BESSER` **Ständig sichtbar, während der Bot läuft** (Bedienung und Statistik) - Die ganze Bedienung steckt fest in der EA-Seite, die Zahlen werden alle 1,5 Sekunden neu gerechnet und der Status-Punkt sogar alle 0,7 Sekunden. FST frischt seine Anzeige nur auf, wenn der Bot bei seinem Server abliefert.
- `BESSER` **Zahlen über mehrere Tage** (Bedienung) - Du siehst für jeden der letzten sieben Tage einen Balken, die Summe der Woche und den Vergleich zur Vorwoche. An Tagen ohne Verkauf steht das da statt einer geschönten Null. FST holt seine Zahlen dafür von seinem Server, bei uns bleibt alles auf deinem Rechner.
- `BESSER` **Zusammenfassung, nachdem der Lauf zu Ende ist** (Bedienung) - Nach dem Stopp bleibt das Fenster stehen und nennt Grund, Laufzeit, Suchen, Käufe, Ausgaben und den geschätzten Gewinn. Es verschwindet erst, wenn du auf "Weiter einstellen" drückst. Bei FST ist die Anzeige in derselben Sekunde weg.
- `BESSER` **Was den Rechner verlaesst** (Datenschutz) - Von deinem Rechner geht nichts an einen fremden Server. Der Bot darf laut seiner eigenen Erlaubnisliste nur zu ea.com. FST schickt bei jedem Start Konto-ID, Coins und alle Suchkriterien an seinen eigenen Server.
- `BESSER` **Sicherung in eine Datei und zurueck** (Bedienung) - Ein Klick schreibt deine Einstellungen, Listen und Preise in eine Datei, ein Klick holt sie zurück. Die Datei wird vorher komplett geprüft; passt etwas nicht, wird gar nichts überschrieben. Deine erreichten Tagesgrenzen kommen absichtlich nicht mit, damit du sie dir nicht wegspielen kannst. Kleine Abweichung zum Bericht: es sind 16 Bereiche, nicht 17.
- `GLEICH` **Wie viele Angebote eine Suche zurueckbringt** (Suchen) - Jede Suche holt 20 Angebote plus eines als Zeichen "es gibt noch mehr" - genau wie FST und genau wie EAs eigene Web-App.
- `GLEICH` **Blaettern: holt der Bot bei einer Snipe-Suche auch Seite 2 und 3?** (Suchen) - Beim Schnappen holt der Bot immer nur die erste Seite, genau wie FST. Das ist auch richtig so: Jede weitere Seite wäre eine zusätzliche bezahlte Suche, und die günstigen Angebote stehen ohnehin ganz vorn.
- `GLEICH` **Stopp, wenn eine Suche viel zu viele Treffer liefert (Zielpreis liegt ueber dem Markt)** (Suchen) - Kommen in einer einzigen Suche mehr als zehn Angebote unter deinem Zielpreis, überspringt der Bot diesen Spieler - der Zielpreis liegt dann über dem Markt. Der Haken ist ab Werk gesetzt. Wir zählen dabei nur die Angebote, die wirklich bis zum Zielpreis zu haben sind; FST zählt alle.
- `GLEICH` **Wie lange der Bot zwischen zwei Suchen wartet** (Tempo) - Zwischen zwei Suchen liegen rund 3,3 bis 4,6 Sekunden - dieselben Zahlen wie bei FST. Ehrlich dazu: Nach gut zehn Minuten ist deine Stundengrenze von 150 Suchen voll, dann wartet der Bot. Das ist unser Kontoschutz, nicht das Tempo.
- `GLEICH` **Die drei Tempo-Stufen zum Umschalten** (Tempo) - Du kannst zwischen Sicher, Normal und Turbo wählen, genau wie in FST, und bekommst dieselben Abstände zwischen den Suchen.
- `GLEICH` **Wartezeit vor dem Kauf** (Kaufen) - Der Kauf geht ohne Verzögerung raus, genauso schnell wie bei FST. Wer wieder vorsichtiger werden will, nimmt den Haken in den Optionen heraus.
- `GLEICH` **Der Bot wechselt den Filter von allein, ohne dass man klickt** (Rotation) - Ein Klick auf "Live-Filter", danach nimmt der Bot die besten Filter allein der Reihe nach. Der Streifen "Jetzt in der Reihe" zeigt die nächsten acht - wie bei FST.
- `GLEICH` **Kurze Denkpause vor dem Kauf** (Kaufen) - Die Denkpause von einer drittel Sekunde ist weg - das merkt man nicht. Wichtig ist, was bleibt: Zwischen zwei Kaufanfragen liegen immer mindestens 8 Sekunden, und nach einem Kauf vergehen 5 bis 6,5 Sekunden bis zum Verschieben. Genau diese Abstände fehlten am 22.09., als EA gesperrt hat.
- `BESSER` **Gewinn-Bremse (EA-Gebuehr wird eingerechnet)** (Kaufen) - Wir schützen besser als FST: Der Bot stoppt einen Spieler, wenn der Markt keinen Gewinn mehr hergibt. FST rechnet vor dem Kauf gar nichts nach. Wer es genau wie FST will, nimmt den Haken jetzt heraus.
- `GLEICH` **Wie viele Abzeichen eine Zeile zeigen darf.** (Live-Filter, Wertung und Abzeichen) - Jetzt gleich wie FST: Eine Zeile zeigt alle zutreffenden Abzeichen. "Gewinn+", "Unter Preis", "Heiß" und "Neu" fallen nicht mehr hinten runter.
- `GLEICH` **Pause zwischen zwei Filtern** (Auto-Trading und Filterwechsel) - Die Pause zwischen zwei Filtern ist jetzt wie bei FST: 300 Sekunden normal, 400 bei jedem vierten Wechsel, dazu 20 Prozent Zufall. Vorher waren es 35 Sekunden.
- `BESSER` **Das neue Loch: die Stundengrenze hat keine harte Obergrenze** (Kontoschutz) - Wer die Stundengrenze hochdreht, kommt jetzt trotzdem nie ueber 200 Suchen in einer Stunde. Das Tagesbudget laesst sich nicht mehr in einer halben Stunde verschiessen. FST hat so einen Schutz gar nicht.
- `GLEICH` **Die Transferliste als "veraltet" markieren, damit EA sie wirklich neu schickt** (EA-Funktionen, die FST nutzt und wir nicht) - Der Bot sagt der Web App jetzt zuerst "deine Liste ist alt" und holt sie dann. Genau wie FST. Damit bekommt die Verkaufs-Wache wirklich die frische Liste und sieht verkaufte Karten.
