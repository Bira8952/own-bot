const { test } = require('node:test');
const assert = require('node:assert/strict');
const { virtuelleUhr } = require('./sim/uhr.cjs');
const { simLabor, AUFTRAG } = require('./sim/labor.cjs');
const { kassensturz, limitsGeprueft, drosselungGeprueft } = require('./sim/kassensturz.cjs');

// ===========================================================================
// Die grosse Simulation.
// Der echte content.js laeuft stundenlang gegen ein falsches EA mit
// lebendigem Markt - dank der falschen Uhr in Sekunden. Nach jedem Lauf
// haelt der Kassensturz jede Zahl des Bots gegen die Wahrheit der Welt.
// ===========================================================================

const MIN = 60 * 1000;
const STUNDE = 60 * MIN;

// ---------------------------------------------------------------------------
// Erst die Uhr selbst: Wenn die falsch geht, ist jedes Ergebnis wertlos.
// ---------------------------------------------------------------------------

test('die falsche Uhr feuert Zeitgeber in der richtigen Reihenfolge', async () => {
  const uhr = virtuelleUhr(1000);
  const folge = [];
  uhr.setTimeout(() => folge.push('c'), 300);
  uhr.setTimeout(() => folge.push('a'), 100);
  uhr.setTimeout(() => folge.push('b'), 200);
  await uhr.vorspulen(250);
  assert.deepEqual(folge, ['a', 'b']);
  assert.equal(uhr.jetzt, 1250);
  await uhr.vorspulen(100);
  assert.deepEqual(folge, ['a', 'b', 'c']);
});

test('die falsche Uhr traegt Date.now und wartet Promise-Ketten ab', async () => {
  const uhr = virtuelleUhr(5000);
  assert.equal(uhr.Datum.now(), 5000);
  const schlaf = (ms) => new Promise((r) => uhr.setTimeout(r, ms));
  let stand = 0;
  (async () => {
    await schlaf(1000); // eine await-Kette, wie sie der Bot dauernd baut
    stand = uhr.Datum.now();
    await schlaf(2000);
    stand = uhr.Datum.now();
  })();
  await uhr.vorspulen(10000);
  assert.equal(stand, 8000, 'beide Schlafschritte sind nacheinander gelaufen');
  assert.equal(uhr.Datum.now(), 15000);
});

test('Intervalle feuern wiederholt und lassen sich stoppen', async () => {
  const uhr = virtuelleUhr(0);
  let mal = 0;
  const id = uhr.setInterval(() => { mal += 1; }, 700);
  await uhr.vorspulen(3000);
  assert.equal(mal, 4);
  uhr.clearInterval(id);
  await uhr.vorspulen(3000);
  assert.equal(mal, 4);
});

// ---------------------------------------------------------------------------
// Szenario 1: Der Marathon. Vier Stunden Betrieb im sicheren Tempo gegen
// einen lebendigen Markt mit Konkurrenz. Danach: Kassensturz und Limits.
// ---------------------------------------------------------------------------

test('Marathon: 4 Stunden Betrieb, jede Zahl stimmt, kein Limit gerissen', async () => {
  // Drei Spieler-Filter: Ein einzelner Filter darf hoechstens 150 Suchen -
  // ein Stundenlauf braucht deshalb mehrere Ziele. Genau wie im echten Betrieb.
  const spielerListe = [
    { playerId: 231747, assetId: 231747, resourceId: 50231747, rating: 84, rareflag: 1 },
    { playerId: 190871, assetId: 190871, resourceId: 50190871, rating: 86, rareflag: 1 },
    { playerId: 158023, assetId: 158023, resourceId: 50158023, rating: 87, rareflag: 1 }
  ];
  // Schnaeppchen sind selten und die Konkurrenz ist schnell - sonst hat der
  // Bot seine Kaufliste nach einer halben Stunde voll und der Lauf endet.
  const l = simLabor({ samen: 7, welt: { spielerListe, anteilSchnaeppchen: 0.05, konkurrenzMittelMs: 8000 } });
  await l.uhr.vorspulen(100); // Sitzung ankommen lassen

  const cfg = Object.assign({}, AUFTRAG, {
    targets: [
      { playerId: 231747, playerName: 'Spieler A', rating: 84, maxPrice: 1000 },
      { playerId: 190871, playerName: 'Spieler B', rating: 86, maxPrice: 1000 },
      { playerId: 158023, playerName: 'Spieler C', rating: 87, maxPrice: 1000 }
    ],
    maxBuys: 10,
    budget: 12000,
    filterSearchLimit: 150,
    filterBuyLimit: 5
  });
  const start = await l.senden('start', { cfg });
  assert.equal(start.ok, true, 'Start abgelehnt: ' + (start && start.error));

  await l.uhr.vorspulen(4 * STUNDE);
  const status = (await l.senden('status')).status;
  await l.senden('stop');
  await l.uhr.vorspulen(5000);

  assert.ok(status.stats.scans > 200, 'in 4 Stunden muss viel gesucht worden sein, war: ' + status.stats.scans);
  assert.ok(status.stats.bought >= 1, 'in 4 Stunden Markt mit Schnaeppchen muss mindestens 1 Kauf gelingen');

  assert.deepEqual(kassensturz({ status, welt: l.welt, cfg, speicher: l.speicher }), []);

  const limits = limitsGeprueft(l.welt);
  assert.ok(limits.sucheStundeMax <= 300, 'Stundenlimit gerissen: ' + limits.sucheStundeMax + ' Suchen in einer Stunde');
  assert.ok(limits.sucheTagMax <= 1500, 'Tageslimit gerissen: ' + limits.sucheTagMax);
  assert.ok(limits.kaufTagMax <= 100, 'Kauflimit gerissen: ' + limits.kaufTagMax);

  assert.deepEqual(l.uhr.fehler, [], 'kein Zeitgeber-Rueckruf darf abstuerzen');
});

// ---------------------------------------------------------------------------
// Szenario 2: Der Fehlersturm. EA bremst mit einer 429-Welle, liefert
// kaputtes JSON und wird dann quaelend langsam. Der Bot muss das ueberleben,
// die Pausen einhalten und danach normal weitermachen.
// ---------------------------------------------------------------------------

test('vereinzelte Serverfehler werfen den Bot nicht um', async () => {
  const l = simLabor({
    samen: 21,
    welt: {
      anteilSchnaeppchen: 0, // nichts zu kaufen - hier geht es nur ums Ueberleben
      // 429 ist inzwischen absichtlich ein harter Stopp und wird im naechsten
      // Szenario geprueft. Hier geht es um vereinzelte normale Serverfehler.
      stuerme: [{ nachMs: 2 * MIN, dauerMs: 6 * MIN, art: 'status', status: 500, anteil: 0.1 }]
    }
  });
  await l.uhr.vorspulen(100);

  const cfg = Object.assign({}, AUFTRAG, { filterSearchLimit: 150 });
  const start = await l.senden('start', { cfg });
  assert.equal(start.ok, true, 'Start abgelehnt: ' + (start && start.error));

  await l.uhr.vorspulen(20 * MIN);
  const status = (await l.senden('status')).status;
  await l.senden('stop');
  await l.uhr.vorspulen(5000);

  assert.equal(status.running, true, 'der Bot muss den Sturm ueberleben, Meldung: ' + status.message);
  assert.ok(status.stats.errors >= 1, 'die Fehler muessen gezaehlt sein, waren: ' + status.stats.errors);
  const serverfehler = l.welt.buch.antworten.filter((a) => a.status === 500).length;
  assert.ok(serverfehler >= 1, 'die Welt muss wirklich einen Serverfehler geliefert haben');
  assert.deepEqual(kassensturz({ status, welt: l.welt, cfg, speicher: l.speicher }), []);
  assert.deepEqual(l.uhr.fehler, []);
});

// ---------------------------------------------------------------------------
// Szenario 2b: Drosselung mitten im Kaufrausch. Waehrend der Bot kauft,
// bremst EA jede zweite Anfrage mit 429. Der Befund der Architektur-
// Durchsicht vom 21.09.: Genau hier feuerte der Bot frueher weiter.
// Die Welt prueft von aussen: Nach JEDEM 429 mindestens 2 Sekunden Ruhe.
// ---------------------------------------------------------------------------

test('Drosselung: das erste 429 stoppt sofort und sperrt den Neustart', async () => {
  const l = simLabor({
    samen: 17,
    welt: {
      anteilSchnaeppchen: 0.35,
      spawnAlleMsMin: 8000,
      spawnAlleMsMax: 16000,
      konkurrenzMittelMs: 60000, // Rivalen lassen dem Bot diesmal Zeit
      stuerme: [{ nachMs: 45 * 1000, dauerMs: 8 * MIN, art: 'status', status: 429, anteil: 0.5 }]
    }
  });
  await l.uhr.vorspulen(100);

  const cfg = Object.assign({}, AUFTRAG, { maxBuys: 15, budget: 20000, filterBuyLimit: 15, filterSearchLimit: 150 });
  assert.equal((await l.senden('start', { cfg })).ok, true);
  await l.uhr.vorspulen(15 * MIN);

  const status = (await l.senden('status')).status;
  await l.senden('stop');
  await l.uhr.vorspulen(5000);

  const gebremst = l.welt.buch.antworten.filter((a) => a.status === 429).length;
  assert.equal(gebremst, 1, 'nach dem ersten 429 darf keine weitere Anfrage in den Sturm laufen');
  assert.equal(status.running, false, '429 ist ein harter Sicherheitsstopp');
  assert.match(status.message, /429|zu viele Anfragen/);
  assert.ok(status.cooldown.leftMin >= 1, 'der Neustart bleibt gesperrt');
  assert.deepEqual(drosselungGeprueft(l.welt), [], 'nach dem 429 darf kein weiterer Kaufversuch folgen');
  assert.deepEqual(kassensturz({ status, welt: l.welt, cfg, speicher: l.speicher }), []);
});

// ---------------------------------------------------------------------------
// Szenario 3: Die harte Sperre. EA antwortet mit 521 - der Bot muss sofort
// stoppen, den Neustart sperren und ihn erst nach Ablauf der Sperre wieder
// zulassen. Das laesst sich nur mit der falschen Uhr pruefen: Die Sperre
// dauert zwei Stunden.
// ---------------------------------------------------------------------------

test('eine 521-Sperre stoppt hart - und erst nach 2 Stunden geht es wieder', async () => {
  const l = simLabor({
    samen: 3,
    welt: { anteilSchnaeppchen: 0, stuerme: [{ nachMs: 2 * MIN, dauerMs: 5 * MIN, art: 'status', status: 521 }] }
  });
  await l.uhr.vorspulen(100);

  const cfg = Object.assign({}, AUFTRAG);
  assert.equal((await l.senden('start', { cfg })).ok, true);
  await l.uhr.vorspulen(10 * MIN);

  const status = (await l.senden('status')).status;
  assert.equal(status.running, false, 'nach 521 muss Schluss sein');
  assert.match(status.message, /Sperre|Anfragen/);
  assert.ok(status.cooldown.leftMin >= 100, 'die Sperre muss noch lange laufen: ' + status.cooldown.leftMin + ' Min.');
  assert.ok(l.speicher.safetyCooldown && l.speicher.safetyCooldown.until > l.uhr.jetzt, 'die Sperre ueberlebt ein Neuladen');

  const zuFrueh = await l.senden('start', { cfg });
  assert.equal(zuFrueh.ok, false);
  assert.match(zuFrueh.error, /gesperrt/);

  // Zwei Stunden spaeter (und der Sturm ist vorbei): Start wieder erlaubt.
  await l.uhr.vorspulen(121 * MIN);
  const wieder = await l.senden('start', { cfg });
  assert.equal(wieder.ok, true, 'nach Ablauf der Sperre abgelehnt: ' + (wieder && wieder.error));
  await l.senden('stop');
  await l.uhr.vorspulen(5000);
});

// ---------------------------------------------------------------------------
// Szenario 4: Der Gebotskrieg. Nur Auktionen, Rivalen ueberbieten. Am Ende
// muss jedes Gebot einen Ausgang haben (gewonnen/verloren/ueberboten), keine
// Coins duerfen haengen bleiben, und die Kasse der Welt muss zur Abrechnung
// des Bots passen.
// ---------------------------------------------------------------------------

test('Gebotskrieg: jedes Gebot bekommt seinen Ausgang, keine Coin bleibt haengen', async () => {
  const spielerListe = [
    { playerId: 231747, assetId: 231747, resourceId: 50231747, rating: 84, rareflag: 1 },
    { playerId: 190871, assetId: 190871, resourceId: 50190871, rating: 86, rareflag: 1 },
    { playerId: 158023, assetId: 158023, resourceId: 50158023, rating: 87, rareflag: 1 }
  ];
  const l = simLabor({
    samen: 11,
    welt: {
      spielerListe,
      auktionAnteil: 1,
      ueberbietenChance: 0.6,
      anteilSchnaeppchen: 0.4,
      // Nicht zu viele Auktionen: Sonst sind die 50 erlaubten Kaufaktionen
      // voll, bevor die letzten Auktionen ausgelaufen sind - dann bleiben
      // (gewollt, mit Warnung) Gebote offen, und genau das soll dieser Test
      // ja NICHT treffen. Er prueft die vollstaendige Abrechnung.
      spawnAlleMsMin: 15000,
      spawnAlleMsMax: 30000,
      auktionRestSMin: 30,
      auktionRestSMax: 150,
      spawnEndeNachMs: 20 * MIN // danach laufen die Auktionen aus und alles wird abgerechnet
    }
  });
  await l.uhr.vorspulen(100);

  const cfg = Object.assign({}, AUFTRAG, {
    targets: [
      { playerId: 231747, playerName: 'Spieler A', rating: 84, maxPrice: 1000 },
      { playerId: 190871, playerName: 'Spieler B', rating: 86, maxPrice: 1000 },
      { playerId: 158023, playerName: 'Spieler C', rating: 87, maxPrice: 1000 }
    ],
    bidSniping: true,
    bidSeconds: 60,
    maxBuys: 50,
    budget: 30000,
    filterSearchLimit: 150,
    filterBuyLimit: 18
  });
  assert.equal((await l.senden('start', { cfg })).ok, true);

  // Bis alle Auktionen durch sind und kein Gebot mehr offen ist.
  let status = null;
  for (let minute = 0; minute < 40; minute += 2) {
    await l.uhr.vorspulen(2 * MIN);
    status = (await l.senden('status')).status;
    if (minute >= 24 && status.openBids.count === 0) break;
    if (!status.running) break;
  }
  await l.senden('stop');
  await l.uhr.vorspulen(2 * MIN);

  const s = status.stats;
  assert.ok(s.bids >= 3, 'es muss echte Gebotsgefechte gegeben haben, Gebote: ' + s.bids);
  assert.ok(s.bidsOutbid >= 1, 'mindestens einmal muss ein Rivale ueberboten haben');
  assert.equal(status.openBids.count, 0, 'am Ende darf kein Gebot mehr offen sein');
  assert.equal(s.bidCommitted, 0, 'keine reservierten Coins duerfen haengen bleiben');
  assert.equal(
    s.bidsWon + s.bidsLost + s.bidsOutbid + s.bidsUnconfirmed, s.bids,
    'jedes Gebot braucht genau einen Ausgang'
  );
  assert.equal(s.bidsUnconfirmed, 0, 'mit funktionierender Beobachtungsliste bleibt kein Ausgang unklar');

  assert.deepEqual(kassensturz({ status, welt: l.welt, cfg, speicher: l.speicher }), []);
  for (const [tradeId, anzahl] of l.welt.buch.geboteJeTrade) {
    assert.ok(anzahl <= 4, 'zu viele Nachgebote auf Auktion ' + tradeId + ': ' + anzahl);
  }
  assert.deepEqual(l.uhr.fehler, []);
});

// ---------------------------------------------------------------------------
// Szenario 5: Volle Geschwindigkeit gegen die Schutzlimits. Im Turbo-Tempo
// muss der Bot GENAU beim Stundenlimit (300 Suchen) von selbst anhalten -
// die Welt zaehlt von aussen nach, was wirklich bei EA ankam.
// ---------------------------------------------------------------------------

test('Turbo-Tempo: am Stundenlimit wartet der Bot und setzt danach fort', async () => {
  const spielerListe = [
    { playerId: 231747, assetId: 231747, resourceId: 50231747, rating: 84, rareflag: 1 },
    { playerId: 190871, assetId: 190871, resourceId: 50190871, rating: 86, rareflag: 1 },
    { playerId: 158023, assetId: 158023, resourceId: 50158023, rating: 87, rareflag: 1 }
  ];
  const l = simLabor({ samen: 5, welt: { spielerListe, anteilSchnaeppchen: 0 } });
  await l.uhr.vorspulen(100);

  const cfg = Object.assign({}, AUFTRAG, {
    targets: [
      { playerId: 231747, playerName: 'Spieler A', rating: 84, maxPrice: 1000 },
      { playerId: 190871, playerName: 'Spieler B', rating: 86, maxPrice: 1000 },
      { playerId: 158023, playerName: 'Spieler C', rating: 87, maxPrice: 1000 }
    ],
    speedMode: 'turbo',
    pausePreset: 'short',
    filterSearchLimit: 150
  });
  assert.equal((await l.senden('start', { cfg })).ok, true);
  await l.uhr.vorspulen(90 * MIN);

  const status = (await l.senden('status')).status;
  assert.equal(status.running, true, 'am Stundenlimit soll der Lauf warten statt enden: ' + status.message);
  assert.match(status.message, /Stundenlimit voll/);
  assert.equal(status.stats.scans, 300, 'in 90 Minuten passen zwei Fenster mit je 150 Suchen');

  const limits = limitsGeprueft(l.welt);
  assert.ok(limits.sucheStundeMax <= 150, 'bei EA kamen ' + limits.sucheStundeMax + ' Suchen in einer Stunde an - erlaubt sind 150');
  assert.ok(limits.sucheStundeMax >= 145, 'das Limit soll ausgereizt, aber nicht gerissen werden: ' + limits.sucheStundeMax);
  assert.deepEqual(l.uhr.fehler, []);
});

// ---------------------------------------------------------------------------
// Szenario 6: Rasende Konkurrenz. Jedes Schnaeppchen wird binnen Sekunden
// von Rivalen weggekauft - der Bot kommt oft zu spaet. Zu spaet sein ist
// KEIN Fehler, und das Tageslimit je Karte (20 Aktionen) haelt trotzdem.
// ---------------------------------------------------------------------------

test('rasende Konkurrenz: zu spaet ist kein Fehler, das Kartenlimit haelt', async () => {
  const l = simLabor({
    samen: 13,
    welt: {
      anteilSchnaeppchen: 1,
      spawnAlleMsMin: 4000,
      spawnAlleMsMax: 8000,
      konkurrenzMittelMs: 5000,
      latenzMsMin: 400,
      latenzMsMax: 800
    }
  });
  await l.uhr.vorspulen(100);

  const cfg = Object.assign({}, AUFTRAG, { maxBuys: 50, budget: 50000, filterBuyLimit: 20, filterSearchLimit: 150 });
  assert.equal((await l.senden('start', { cfg })).ok, true);
  await l.uhr.vorspulen(45 * MIN);

  const status = (await l.senden('status')).status;
  await l.senden('stop');
  await l.uhr.vorspulen(5000);

  assert.ok(status.stats.missed >= 1, 'bei dieser Konkurrenz muss der Bot auch mal zu spaet kommen');
  assert.equal(status.stats.errors, 0, 'zu spaet zu sein ist kein Fehler');

  const limits = limitsGeprueft(l.welt);
  assert.ok(limits.kaufversucheGesamt <= 20, 'hoechstens 20 Aktionen je Karte und Tag, waren: ' + limits.kaufversucheGesamt);
  assert.deepEqual(kassensturz({ status, welt: l.welt, cfg, speicher: l.speicher }), []);
  assert.deepEqual(l.uhr.fehler, []);
});
