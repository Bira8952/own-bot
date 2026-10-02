# FUT Simple Trader live angesehen: alle Seiten und Optionen

Stand 01.10.2026, FST Version 2.2.16, Konto mit FST Premium. Angesehen im Chrome des Nutzers
(Claude in Chrome), nur gelesen und fotografiert. Nichts gestartet, nichts gekauft, keine
Einstellung bleibend geaendert (die "Custom"-Zeilen wurden kurz geoeffnet und sofort wieder auf
"Auto" gestellt, die Betriebsart wieder auf "Live Filters"). Nicht angeklickt: "Abmelden", "Discord
beitreten", "Dashboard oeffnen", "Stat Zone oeffnen" (fuehren aus der Seite heraus) und
"Akzeptieren und weiter" im My-Club-Risikodialog ("Nicht jetzt" gewaehlt).

Bilder: `scratchpad\referenz\` und die Tool-Ergebnisse dieser Sitzung (siehe Chat).

## 1. Aufbau
- Seitenleiste 415 px rechts. Kopf: Marke + Nutzer-Menue; vier Kacheln: **Coins** (18K, Pfeil zum
  Aktualisieren), **Mein Hub** (Menue), **Market** (Tacho 0-100), vierte Kachel = **Hilfe zur aktuellen Seite**
  (zeigt den Namen der Seite: HOME / LIVE FILTERS / AUTO / MANUAL / SETTINGS / SBC HUB).
- Nutzer-Menue: Name + PREMIUM-Abzeichen, "Dashboard oeffnen", "Einstellungen", "Discord beitreten", "Abmelden".
- Mein-Hub-Menue: **Meine Presets**, **Mein Club** (My Club), **Gallery Solver**.
- Einklapp-Griff am linken Rand der Leiste.

## 2. Startseite ("Guten Abend, ...")
Datum + "Markt aktiv". "Service waehlen" (3 Tools): **Sniping Bot** (Live Filters, manuelle Gebote, volles
Auto Trading), **SBC Solver** (guenstigstes gueltiges Team aus Klub und Markt), **Gallery Solver**
(Galerie-Sets: was gesammelt, was fehlt). "Tagesstatistik" (Bot + Solver): Profit heute (Muenze),
Sessions, Suchen, Gebote, Erfolge; Knoepfe Dashboard, Discord. Leerzustand "Heute noch keine Statistik".

## 3. Markt-Kachel (Fenster "Marktaktivitaet")
Zahl 0-100 mit Stufe (z. B. 64/100 GOOD, "-5 % ggue. dem ueblichen Niveau fuer diesen Zeitraum"),
fuenfteiliger Farbstreifen mit Punkt, Satz zur Lage, **Konkurrenz** (z. B. Very high 5/5), **Effizienz**
(z. B. 2,21 % Treffer, 56,4 % gewonnen), **Naechstes Hoch** (z. B. Freitag 20:00), Link "Stat Zone oeffnen".

## 4. Sniping Bot - drei Reiter
### 4.1 Live Filters
- Kopf "7 verfuegbare Filter", Budget-Pillen **Gesamtes Budget / Niedrig / Mittel / Hoch**, Aktualisieren-Knopf.
- Spalten Spieler / Preis / Score. Zeile: Auswahlpunkt, Name (Rating), Abzeichen, Chips "Trefferquote % / Erfolg %",
  Preis mit Muenze, Score (cyan). Die beste freie Zeile traegt "**For You** - gerade wenig Konkurrenz".
- Abzeichen (laut Hilfefenster): **Profit+** (bringt deutlich mehr pro Snipe, selten), **Undercut** (Verkaeufer
  listen unter Marktpreis, kurzes Fenster), **Hot** (Gebote ploetzlich gestiegen: mehr Treffer, mehr Konkurrenz),
  **Open** (wenige Jaeger, ruhigere Session), **Chem** (Chemie-Stil-Pricing, max. 3-5 derselben Karte),
  **New** (frischer Fund, Community kaum aktiv; nach ein paar Minuten ohne Treffer wechseln).
  Satz: "Es gibt nicht das eine beste Badge - lies die Kombination." Link "Vollstaendiger Guide: Score & Badges".
- Score = erwarteter Profit aus einer Stunde Suche (sinkt, wenn man einen Filter zu lange nutzt).
  Hit/Success = Treffer pro 100 Suchen und wie viele davon wirklich gewonnen werden (Community, letzte 24 h).
- Knopf "Filter laden" (breit, unten).
- Hilfefenster "So funktionieren Live Filters": 1 Filter waehlen, 2 Auto Pricing setzt die Zahlen, 3 der Bot kauft
  und verkauft. "Immer frisch": aus Preischecks und Snipes der Community, alle paar Minuten neu gerankt.

### 4.2 Auto Trading
- Zwei Wege: **Live Filters** (empfohlen, "freihaendig, wir rotieren die besten Filter fuer dich", 3 Klicks,
  "Pricing uses Normal mode") und **Custom** ("volle Kontrolle ueber Filter, Budget, Tempo und Preise").
- Live: "In Rotation now - 8 Filter - LIVE": waagerechte Karten (Name, Rating, Score, Abzeichen, Preis);
  "vermeidet ueberlaufene Karten und solche, die du zuletzt gejagt hast". Knopf **Zur Uebersicht**.
- Custom: **Filter** (0 ausgewaehlt, Kachel "Add filter") und **Einstellungen** - jede Zeile "Auto | Custom":
  | Zeile | Auto | Custom-Optionen |
  |---|---|---|
  | Max. Budget | ganzes Guthaben | Zahl (Standard = Kontostand) |
  | Max. Kartenpreis | kein Limit, bis Kontostand | Zahl |
  | Laufzeit | 60 Min (Standard-Session) | Minuten |
  | Mindestprofit | "smartes Minimum pro Karte" | Auswahl % oder Coins + Zahl (8 %), "Nettoprofit nach 5 % EA-Steuer" |
  | Kauflimits | kein Limit pro Filter | Max. Kaeufe (5), Max. Transaktionen (10) |
  | Tempo | Normal, ausgewogenes Risiko | Langsam / Normal / Turbo (mit Risikoanzeige) |
  | Verkaufspreis | Normal, verkauft in ~10 Min, Chemstyle aus | Safe / Normal / Lazy; Chemstyle-Preislogik: Aus / Dynamisch / Nur Chem |
  | Auto-Pausen | smartes Tempo, laengere Ruhen | Short Run / Med Run / Long Run / Eigen: Suchen pro Filter 40-60, Pause zwischen Filtern 240-360 s, Lange Ruhe nach 3-5 Filtern, Dauer 320-480 s, Tempo randomisieren 20 %, Preset speichern/laden |
- Fuss: **Save / Load / Reset** und **Zur Uebersicht**.
- Filter-Auswahlfenster "Filter hinzufuegen": Reiter **Live Filters** (mit +), **Kartensuche** ("Spieler suchen, z. B.
  Mbappe"), **Meine Presets** (Kartensammlungen, z. B. "Saved Manual Filters"; Kurzwahl **Guenstigste nach Rating
  82 83 84 85 86 87 88 89 90**); unten "Ausgewaehlt n", Knopf "Fertig".
- "Zur Uebersicht" oeffnet die **Filter-Zusammenfassung**: Sicherheitsassistent (Pille "KEINE WARNUNGEN", aufklappbar),
  "Settings overview" mit Chips (Filter, Laufzeit, Min. Profit, Tempo, Auto-Pausen), grosser Knopf "Auto Trading starten".
- Hilfefenster "So funktioniert Auto Trading": "Starten und weggehen ... stundenlang, ohne Babysitting"; "Sicherheit
  zuerst: Kartenauswahl, Suchanzahl, Gebots-Tempo und Ruhepausen bleiben in sicheren Grenzen".

### 4.3 Manuelles Trading (drei Schritte)
1. **Item waehlen**: Spielersuche + Maximalpreis. Hinweis: Fuer Extra-Filter wie PlayStyle+ die EA-Web-App nutzen
   (FST liest die Suchmaske der Web App: Quality, Rarity, Position, Chemistry Style, Country/Region, League, PlayStyles,
   Bid Price min/max, Buy Now min/max).
2. **Nach dem Kauf**: Zur Transferliste senden / Zum Verkauf listen (zum Verkaufspreis) / In Unassigned lassen (max. 5).
3. **Feinabstimmung** (Auto | Custom je Zeile):
   | Zeile | Auto | Custom |
   |---|---|---|
   | Laufzeit | 4 Min | Minuten |
   | Preisschritte | Gebotsschritte automatisch optimiert | Spanne 0-650 + "Max. Buy-Now-Range hinzufuegen" |
   | Stopp-Limit | kein Limit, volle Laufzeit | "Stop nach" N Buys oder Searches |
   | Keine Coins mehr | stoppt die Suche | haelt die Suche aktiv und setzt sie fort, sobald gelistete Items verkauft sind (nur mit Items zum Verkauf) |
   | Pausen | smarte Pausen an | Short/Med/Long/Eigene: Pause nach 25-46 Suchen fuer 21-39 s; laengere Pause nach 2-4 Runden fuer 63-117 s; Werte randomisieren 30 % |
   | Tempo | Normal, mittleres Risiko | Langsam / Normal / Turbo ("Normale Geschwindigkeit ohne Pause") |
- Fuss: Save / Load / Reset, "Zur Uebersicht". Hilfefenster "So funktionieren Manual Filters": kreative Filter,
  Auto Pricing (optional, Live-Kauf- und Verkaufspreis), Speichern und Collections, Uebergabe ans Auto Trading.

## 5. SBC Solver
Seite "SBC Solver": "Waehle zuerst in der Web-App-Oberflaeche ein SBC aus, das du abschliessen moechtest."
(Platzhalter-Karten; der Solver arbeitet mit dem in EA gewaehlten SBC. Nicht gestartet.)

## 6. Gallery Solver (Fenster ueber der Seite)
"Empfehlungen: pro Set der guenstigste Schritt zu mehr Tokens, und die Kaeufe, die am meisten Score bringen."
Kacheln TOKENS (0 -> 874 erreichbar) und SCORE (0 -> 418.899 erreichbar); Liste von Sets mit Preis, "fuer dich: n von m
Karten", Gewinn an Tokens, Tokens je 1k Coins; "Alle 40 Sets"; "Kategorien" (Liga-Gruppen mit Anzahl Sets, Kosten, Karten).

## 7. Mein Club (My Club)
Vor der ersten Nutzung ein Risikodialog: liest Klub und Transfermarkt ueber die Web App aus und handelt darin,
"nicht die normale Nutzung ... zusaetzliches Risiko fuer deinen Account"; drei Regeln (Limits einhalten, menschlich
verhalten, auf Warnungen achten); Haken "Ich verstehe das Risiko ..."; Knoepfe "Nicht jetzt" / "Akzeptieren und weiter".
Nicht akzeptiert, nicht geoeffnet.

## 8. Einstellungen (Nutzer-Menue -> Einstellungen)
- **Preis-HUD**: Schalter "Preise auf Spielerkarten anzeigen" (aktueller Marktpreis auf Karten in Verein, Transferliste, Teams, SBC, Packs).
- **Sucheinstellungen**: "Bei zu vielen Ergebnissen stoppen (10+)" Ja/Nein (Standard Ja);
  "Stop bei Price Range" Ja/Nein (Ja); "Verkaufte Items automatisch loeschen" Ja/Nein (Nein);
  **Auto Pricing**: Schalter "Empfohlene Einstellungen" (an).
- **Benachrichtigungen**: Ton bei erfolgreichem Gebot (Nein); Ton, wenn die Such-Session beendet ist (Nein).
- **Sprache der Extension**: Deutsch (andere Sprachen waehlbar).
- **Gefahrenbereich** (Schalter): Unbegrenzte Unassigned-Items (aus); Mehrere Raritys (an); Auto Bidding (aus).
- Version v2.2.16.

## 9. Hilfe
Vierte Kachel: Hilfe zur aktuellen Seite. Willkommens-Fenster: "Jeder Tab hat eine eingebaute Anleitung ...";
"So funktioniert FST" in drei Schritten; Links Help Center, "So nutzt du einen Filter" (interaktive Tour), Discord & Community.
