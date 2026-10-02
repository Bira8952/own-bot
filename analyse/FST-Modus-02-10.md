# FST-Modus: Bot ohne eigene Grenzen (Stand 02.10.2026)

Auftrag des Nutzers (dreimal ausdruecklich): "ohne Limit, ohne Stoppen, ohne eigene Sicherheit, die
Sicherheitsvorschriften und alles 1:1 wie FUT Simple Trader." Umgesetzt als **Haken "Ohne eigene
Grenzen"** (ganz oben in den Optionen, Gruppe "Grenzen"), **ab Werk AN**, auch fuer Bestandsnutzer
(einmalige Umstellung mit Merker `fstModusV1`, beim ersten Oeffnen). **Haken aus = der strenge Modus von
vorher, unveraendert** (bit-genau, mit 54 Sim-Laeufen gegen den alten Stand belegt).

## Was im Modus "Ohne eigene Grenzen" weg ist
Limits fuer Suchen/Kaufversuche/Aktionen pro Stunde und Tag, Deckel, Kartenlimit (20 je Karte), Warnschwellen,
Ausnahme vom Tageslimit, Startsperre und wachsende Sperre nach EA-Warnungen (426, 429, 458 Captcha, 461, 512,
521 ...), "nur ein Tab", 8-Sekunden-Mindestabstand zwischen Kaufanfragen, Pause nach unklarer Antwort,
Stopp nach 3 Fehlern in Folge, Wartepause am Stundenlimit, Live-Filter-Ablauf (nur gelbe Warnung),
Preis-Check-Deckel in der Rotation, Stopps der Verkaufs-Wache bei EA-Fehlern, Start-Sperren aus eigenen
Gruenden (nur Warnung; ausser Haken "Gewinn-Bremse"). Standardwerte wie FST: Budget und Max. Kaeufe leer,
Grenzen je Spieler leer, Laufzeit 60 Min, Pausen "Wie FST", "Nach dem Kauf" = Transferliste, Gewinn-Bremse aus.

## Was bleibt (auch bei FST oder sonst geht etwas kaputt)
Jeder EA-Statuscode ausser 2xx bei einer **Suche** beendet den Lauf (FST: auch); bei Kauf/Gebot stoppt nur 473.
10 Netzfehler/Zeitueberschreitungen in Folge ("Keine Verbindung zu EA"). Platz-Regeln (Transferliste 100,
"Nicht zugewiesen" ueber 4, mit Haken ueber 99). Zeitlimit hoechstens 300 Min. Restbudget/Kontostand reicht fuer
keinen Zielpreis; Budget kleiner als hoechster Zielpreis (Start abgelehnt; in der Rotation endet sie dabei, FST
ueberspringt den Filter - offen). Zielpreis/Kartenart/Chemie muessen zur Karte passen. Zu viele Treffer (10+).
Tab nicht sichtbar, Not-Aus Strg+Umschalt+P, Stopp-Knopf. Takt zwischen Suchen (FSTs Zahlen), ein Kaufversuch je
Suche, 5-6,5 s Ruhe nach einem Kauf. Mehr als 10 Spieler, keine Verbindung zur Web App. Verlustschutz beim
Einstellen (Geld, nicht Konto).

## Risiko (ehrlich)
Ohne Stundenlimit sind bei Normal-Tempo rund 850-900 Suchen pro Stunde moeglich (belegt in 2-Stunden-Sim).
EA sperrte dieses Konto am 21.09. bei ~450 Suchen am Tag (521), am 22.09. nach zwei Kaeufen in einer Sekunde
(426) und mit wachsender Sperre (461). Zwei Tabs koennen gleichzeitig suchen. FST sucht und kauft ueber EAs
eigene Web-App-Funktionen auf offener Suchseite, unser Bot ruft EAs Schnittstelle standardmaessig direkt per
fetch auf: das Konto-Risiko ist deshalb **nicht** dasselbe wie bei FST, auch wenn alle Zahlen gleich sind.
Weg zurueck: Haken aus (Zaehler und gespeicherte Werte bleiben, Pausen-Stufe geht auf "Ausgewogen").

## Offen / nicht umgesetzt
- Rotation endet im Modus, wenn ein Filter wegen Budget unbezahlbar ist (FST ueberspringt ihn).
- Eine Antwort, die nach "Stopp" noch ankommt, wird mit dem neuen Haken behandelt (enges Zeitfenster).
- Programmfehler im Kauf-Zweig heissen "Keine Verbindung zu EA".
- Pausen-Zahlen "Wie FST" stammen aus der Live-Ansicht v2.2.16; FSTs Code v2.2.6 hat Pausen ab Werk aus.
- Nicht live gelaufen (keine echten Laeufe, nur Sim-Labor und Tests); Leiste/Schalter live angesehen.

Tests: 1235 gruen (1040 alte laufen im strengen Modus unveraendert, ~195 neue unter `fc27-own-bot-tests\neu\fstmodus*`).
Commits: b1bdfee ... 18a0d75 (Runde 1), 45baeea, 218a5dc (Runde 2), 48a7f64 (Texte).
