# Was geht, was nicht, was bewusst anders ist

Stand 30.09.2026. Auftrag des Nutzers: "mach es 1:1, kopiere auch von FUT Simple
Trader den Code oder mach es so, dass es 1:1 wird - alles was geht; was nicht
geht, aufschieben."

Grundlage: die Messung vom 28.09. (`FST-Stand-28-09.md`, 101 Punkte) und die
Bauplaene fuer die letzten 24 offenen Punkte. Jeder Bauplan wurde vor dem Bau
von einem Skeptiker angegriffen, jeder Einbau mit Tests und einer Gegenprobe
gegen den Vor-Stand abgesichert. **865 Tests gruen.**

## 1. Gebaut (18 Commits seit dem 28.09. abends)

| Bereich | Was jetzt anders ist |
|---|---|
| Rotation | **Der Start-Knopf war im Rotations-Modus unsichtbar** (seit 542e854) - behoben. Warten statt aufhoeren, wenn alle Filter abgelaufen sind. Die eigene Zielliste abfahren (FSTs Custom-Modus). "Hoechstens 12 Filter" zeigt jetzt die wirkliche Zahl. Zwei Standardwerte (Pause 300 s, 50 Suchen) kamen bei Bestandsnutzern nie an - behoben. |
| Kaufen | Nach **jedem** Kaufversuch neu suchen, auch nach einem gescheiterten (wie FST) - mit einer **8-Sekunden-Luecke ueber Rundengrenzen**, die die Gegenprobe gefunden hat. Das Budget darf leer bleiben (Kontostand bremst; eine 0 bleibt ein Fehler; Gebote pruefen den Kontostand). Weiterkaufen bei vollem "Nicht zugewiesen" (Schalter, ab Werk aus). |
| Suchen | **Mehrere Kartenarten in einer Suche** ("12,70"). Der geratene Vereins-Name wird messbar; dabei ein **Absturz** behoben (clubParam ohne Regel). |
| Preise | Haken "Preisdeckel wie FST" (der Kaufpreis haengt bewusst NICHT daran). Die Chemie der eigenen Karte beim Einstellen. |
| Verkaufen | Fester Verkaufspreis **je Filter**. Abraeumen im Lauf prueft bei EA nach; FSTs Weg (`_clearSold`) kommt wirklich an die Reihe (er wurde bisher stillschweigend ignoriert). |
| Abzeichen | Nur Filter mit angehaktem Abzeichen fahren (FSTs include). "Gewinn++". Chem-Zaehlung aus dem letzten Scan. |
| Marktlage | Die Konkurrenz-Kachel bekommt Messungen (Logbuch der Laufmessungen). "Naechstes Hoch" hat erstmals Tests. |
| Bedienung | Budget "Auto" mit echter Coin-Zahl - **die Schalter fehlten komplett in der Seite**. Start-Vorschau rechnet die langen Pausen mit. Laufzeit-Anzeige sagt die Wahrheit. Leere Prozentzahlen erklaeren sich. |
| Speicher | Keine 10-MB-Grenze mehr; Logs behalten 5.000 statt 500 Eintraege. |

## 2. Was nicht gebaut wurde - und warum

| Punkt | Warum nicht |
|---|---|
| **Rating ueber EAs App-Funktion** | Geht grundsaetzlich nicht. FSTs eigenes Suchobjekt hat gar keine Rating-Felder (scripts.js Z. 1713-1727), und EA wirft das Rating beim Adressbau weg (24.09. gemessen). |
| **Suchen und Kaufen komplett durch EAs Programm** | Haengt an der Zeile darueber und an einer Live-Messung, ob EAs Funktion unsere Filter durchreicht. Ohne sie wuerde eine Suche still viel zu breit laufen. |
| **Automatischer Rueckfall auf den App-Weg** | Er greift nur bei Suchen ohne Rating, Kartenart und Filter - die der Bot praktisch nie macht. Nutzen klein, Risiko in `api()` (der empfindlichsten Funktion) gross. Die Gegenprobe fand fuenf Einwaende, darunter: Der Rueckfall schaltet still die Suchseiten-Pflicht ab, und er ist eine Einbahnstrasse. |
| **EA nach der Preisspanne fragen** | Der Aufruf (`requestMarketData` mit dem rohen Kaufobjekt) laesst sich offline nicht beweisen, der Fall ist selten ("Preis mitgebracht"), und es waere eine zusaetzliche EA-Anfrage je Einstellen. Braucht einen Live-Test. |
| **Trending** | Die Daten vieler Nutzer liegen auf FSTs Server. Den duerfen wir laut Erlaubnis nicht nutzen. |
| **Je Chemie ein eigener Filter mit eigener Messung** | FST bekommt die Variantenliste vom Server, und jede Variante kostet eigene Suchen aus dem knappen Tagesbudget. |
| **Die 11 Server-Punkte** | Zahlen aller Nutzer, Filter vom Anbieter, Stat Zone, Vorlagen auf dem Server. Bleibt so - dafuer verlaesst bei uns nichts den Rechner. |
| **Die 10 Kontoschutz-Punkte** | FST macht 850 Suchen je Stunde, wir 150. EA hat dieses Konto dreimal gesperrt. Bleibt so. |

## 3. Bewusst anders als FST

- **Standards.** Laufzeit 30 Minuten (FST: 60 im Auto-Handel, 4 beim Snipen - die Bilanz-Aussage "FST unbegrenzt" war falsch). Pausen ab Werk an (FST: aus). Budget 5.000 (FST: kein Budget beim Snipen). Grenzen je Spieler: 6 Versuche (FST: keine). Wer FST-nah will: Feld leeren, Pausen aus, 60/20 einstellen.
- **Schalter ab Werk aus, wo FST sie an hat.** "Weiterkaufen bei vollem Nicht zugewiesen": FST schaltet sie bei bezahltem Zugang **selbst ein** (scripts.js Z. 33531) - fuer dich steht FST also auf AN. Bei uns bewusst aus, bis du den Haken setzt. Dasselbe beim Preisdeckel.
- **Sicherer als FST.** Nachpruefen nach dem Abraeumen. Bei fremder Chemie blockieren wir und verlangen einen Preis-Check statt auf einen allgemeinen Preis auszuweichen. Die Markt-Bremse beim Verkaufspreis. Die 8-Sekunden-Untergrenze ueber Rundengrenzen. Gebote pruefen den Kontostand.
- **Anders bedient.** Mehrere Kartenarten als Kommaliste statt FSTs Fenster mit Haekchen. Verkaufspreis je Filter nur in der eigenen Zielliste, nicht in der Rotation.
- **Hoechstpreis** setzen wir nicht aufs ganze Guthaben (FST Z. 41935): Bei FST ist das eine Suchband-Grenze, bei uns der Preis, den der Bot wirklich zahlt.
- **Die 12-Filter-Grenze** bleibt: die einzige Bremse der Rotation ohne Uhr und Zaehler.

## 4. Was erst ein Live-Test beweist

Nichts davon laesst sich offline beweisen. Jeder Punkt hat einen Schalter, der
sicher steht, oder eine Anzeige, die es sichtbar macht.

1. **Zwei Kartenarten in einer Suche.** Akzeptiert EA `rarityIds=12,70`? Fuer eine Art ist es seit dem 24.09. gemessen, FST schickt Listen ueber dasselbe Feld.
2. **Schickt EA die Chemie (`playStyle`) mit?** Die Zeile "Chemie (PlayStyle+)" in den Optionen zaehlt es jetzt schon nach dem ersten Scan.
3. **Wirkt `_clearSold` wirklich?** Die Wache sagt es jetzt ehrlich ("Bei EA nachgeprueft").
4. **Gibt es `unassigned.clear()/reset()` in dieser EA-Fassung?** Fehlt die Funktion, passiert still nichts.
5. **Heisst der Vereins-Name wirklich `club`?** Knopf "EAs eigene Suchadresse ablesen".
6. **Die Konkurrenz-Kachel.** Braucht drei Messungen in zwei Stunden.

## 5. Nach dem Einspielen

**Die Erweiterung UND die Seite neu laden.** Der Sniffer steht jetzt auf
Version 21; ohne Neuladen der Seite bleibt in einem offenen Tab die alte
Fassung aktiv (sie laedt nur bei kleinerer Version), und die neuen Felder
(Chemie, Kartenart-Liste, Abraeumen, Nicht zugewiesen) kommen nicht an.

## 6. Eine Sache, die du wissen solltest

In der Nacht zum 30.09. haben halbfertige Aenderungen in diesem Ordner gelegen,
die weder der Nutzer noch diese Sitzung angeordnet hat (eine "Profit-Reihenfolge
Auto/Manuell" und ein Abraeumweg; 12 rote Tests). Sie sind als `git stash`
geparkt (nichts geloescht), der Patch liegt zusaetzlich im Arbeitsordner. Dazu
liegen 31 alte Test-Kopien und eine `package.json` ungetrackt in
`fc27-own-bot\tests\` - die Tests wohnen seit dem 22.09. in
`fc27-own-bot-tests`. Bitte klaeren, ob das von dir war, bevor man den Stash
loescht oder anwendet.

## 7. Aussehen des Panels (30.09., auf Wunsch "wie FUT Simple Trader")

Nur `popup-design.css` wurde geaendert; `popup.html` und alle Skripte blieben
unberuehrt. Die Werte stammen aus FSTs Stylesheet (laut ERLAUBNIS-FST.md
erlaubt) - ohne FSTs Marke, Logo und Name.

- **Farben wie FST:** Seite `#141b24`, Karten `#161d27` mit leichtem Verlauf,
  Felder `#1f2834`, Cyan `#00caf6`, Gruen `#16c784`, Gelb `#ffc466`, Rot `#ff6b6b`.
- **Form wie FST:** Breite 415 px, Karten 12 px rund, Felder und Knoepfe 8 px,
  Linien in Weiss mit 7 % Staerke, Schrift Roboto (sonst Segoe UI).
- **Bewegung wie FST:** Karten und Kacheln heben sich beim Darueberfahren um
  2 px, Hauptknoepfe leuchten in Cyan, der Verbindungs-Punkt pulsiert, der
  gewaehlte Reiter bekommt einen Strich. Wer "Bewegung reduzieren" im System
  gewaehlt hat, sieht das alles ruhig.
- **Bewusst anders als FST:** Die Schrift auf Cyan-Knoepfen ist dunkel (FST:
  weiss, nur etwa 2:1 Kontrast). Der Fokusrahmen der Felder ist Cyan (FST: grau).
  Roboto ist nicht mitgeliefert (kein Download ohne Erlaubnis) - ohne die
  Schrift auf dem Rechner greift Segoe UI. Die Hoehe der Schrift ist dadurch
  fast gleich, die Buchstaben sehen nur etwas anders aus.
- **Geprueft:** alle fuenf Ansichten bei 415 px und bei 372 px ohne
  Ueberlauf; 865 Tests gruen (ein Test hatte den alten Schriftwert fest
  eingetragen und liest ihn jetzt aus der Datei).

## 8. Panel als Nachbau von FSTs CSS (30.09./01.10.2026)

Auf Wunsch "mach das CSS mehr nach, mach alles neu". Grundlage: FSTs Quelltext
(`build/assets/style.css`, `scripts.js`; Erlaubnis siehe `ERLAUBNIS-FST.md`) und Live-Bilder
von FSTs Seiten im Chrome des Nutzers (Start, Sniping Bot, Auto Trading, Manuell, Einstellungen,
Zusammenfassungs-Dialog). Die Werte wurden **woertlich** uebernommen (mit Zeilenangabe im CSS),
ohne FSTs Name, Logo und Marke.

Gemessen: Die Root-Schrift der EA-Seite ist 16 px (rem-Werte gelten wie bei FST). **Roboto ist auf
dem Rechner nicht installiert** - FST rendert dort in Arial; wir benutzen denselben Schrift-Stapel.

Zwei Fehler, die erst der Live-Test im echten Panel gezeigt hat: (1) Ein CSS-Kommentar mit `*/`
hatte `--bg` verschluckt, die klebende Kopfzeile war durchsichtig (seit dem ersten Stand war dasselbe
am Dateianfang). (2) Die Anzeigetafel stand ueber jeder Ansicht und schob den Inhalt nach unten.

| Bereich | Stand |
|---|---|
| Kopf | nur Kacheln, Reiter und eine schmale Status-Zeile kleben (~190 px statt 385 px); Kacheln, Reiter-Schalter (weisser aktiver Punkt), Markt-Tacho wie FST; Stopp bleibt beim Scrollen erreichbar; Warn-Zeichen in der Status-Zeile |
| Snipen | Schalter, Modus-Karten, "In der Reihe"-Karten, Auto/Eigene-Zeilen, Manuell-Schritte mit Kreis und Linie, Felder mit Plus/Minus, Aktionsleiste unten |
| Filter | Zeilen mit Auswahlpunkt, Chips, Preis, Wertung; Budget-Pillen; breiter Cyan-Knopf unten; Erklaerung eingeklappt |
| Kaeufe/Optionen/Hilfe | Karten, Mini-Kacheln mit Symbol, Schalter statt Haken, Warnkarten, Hilfe als Karten; 17 "Mehr erfahren"-Felder |
| Dialoge | Start- und Filter-Dialog mit Ring-Kopf, Sicherheitskasten, Chips; Sheets von unten; Lade- und Lauf-Anzeige |
| Schale | Einklapp-Griff am Rand, kompakter Kopfstreifen, Stopp-Knopf im Streifen (nur im Lauf) |
| Lesbarkeit | 403 Kontrast-Verstoesse auf 0 (WCAG AA), Klickflaechen >= 32 px, Fokusringe fuer alles, reduzierte Bewegung, erzwungene Farben |
| Abgleich | gemeinsamer Seitenrand 2 rem wie FST |

**Bewusst anders als FST (mit Grund):** Textfarbe #8B94A4 statt #6B7383 (Kontrast), Kachel-Beschriftung
10 px statt 8,6 px, dunkle Schrift auf Cyan-Knoepfen, Fokusringe (FST hat keine), ungehakte Haken mit
sichtbarer Kante, Reiter mit Symbol, Anzeigetafel "Gerade jetzt" und Status-Zeile (FST hat nichts
Vergleichbares), Dialoge stehen in der Leiste statt mittig ueber der Seite, die Lauf-Anzeige ist eine
eigene Karten-Ansicht.

**Noch ungleich / offen:** Keine Save/Load/Reset-Leiste (Funktion gibt es bei uns nicht); Manuell zeigt
einen Schritt nach dem anderen; Kacheln Sammlungen/Heute ohne Symbol; Optionen mit allen Gruppen offen
ca. 7.500 px lang; Filterzeilen tragen zwei bis drei Zusatzzeilen. In Texten steht der Name "FUT Simple
Trader" noch als Vergleich (z. B. Preisdeckel) - Entscheidung des Nutzers, ob das bleiben soll.

**Live im Chrome gesehen:** Kopf, Kacheln, Reiter, Status-Zeile, alle fuenf Ansichten, Markt-Sheet,
Einklappen/Ausklappen, Kopf beim Scrollen. **Nur im Nachbau gesehen (nicht live):** Start-Dialog,
Filter-Dialog, Lauf-Anzeige, Stopp im Kopfstreifen (erscheint nur im Lauf), Sammlungen-/Heute-Sheet mit Daten.

Tests: 1040 gruen (871 aus dem Bestand, der Rest neu unter `fc27-own-bot-tests\neu\`).
