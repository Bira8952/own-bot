'use strict';

// ===========================================================================
// Der Kassensturz: Nach jedem Simulationslauf wird jede Zahl des Bots gegen
// die Wahrheit der Nachbau-Welt gehalten. Jede Abweichung kommt als klarer
// Satz zurueck - ein leeres Ergebnis heisst: alles stimmt.
// ===========================================================================

// Wie viele Zeitpunkte passen hoechstens in ein gleitendes Fenster?
function fensterMax(zeiten, fensterMs) {
  const sortiert = zeiten.slice().sort((a, b) => a - b);
  let max = 0;
  let von = 0;
  for (let bis = 0; bis < sortiert.length; bis++) {
    while (sortiert[bis] - sortiert[von] >= fensterMs) von++;
    max = Math.max(max, bis - von + 1);
  }
  return max;
}

function kassensturz({ status, welt, cfg, speicher }) {
  const maengel = [];
  const stats = status && status.stats;
  if (!stats) return ['Kein Status vom Bot bekommen.'];
  const buch = welt.buch;

  const sofort = buch.gekauft.filter((k) => k.art === 'sofort');
  const auktionen = buch.gekauft.filter((k) => k.art === 'auktion');
  const ausgegeben = buch.gekauft.reduce((summe, k) => summe + k.preis, 0);

  // 1. Geld: Was der Bot glaubt, muss dem entsprechen, was EA abgebucht hat.
  if (stats.bidsUnconfirmed === 0 && stats.spent !== ausgegeben) {
    maengel.push('Ausgaben stimmen nicht: Bot sagt ' + stats.spent + ', die Welt hat ' + ausgegeben + ' abgebucht.');
  }
  if (stats.bought !== sofort.length) {
    maengel.push('Sofortkaeufe stimmen nicht: Bot sagt ' + stats.bought + ', die Welt hat ' + sofort.length + '.');
  }
  if (stats.bidsUnconfirmed === 0 && stats.bidsWon !== auktionen.length) {
    maengel.push('Auktionsgewinne stimmen nicht: Bot sagt ' + stats.bidsWon + ', die Welt hat ' + auktionen.length + '.');
  }

  // 2. Budget: Nie mehr binden als erlaubt - auch nicht kurzzeitig.
  // Der Tiefstand der Kasse misst die groesste gleichzeitige Belastung
  // (Kaeufe plus hinterlegte Gebote).
  const belastung = buch.startCoins - buch.tiefstand;
  if (belastung > cfg.budget) {
    maengel.push('Budget ueberschritten: zeitweise ' + belastung + ' Coins gebunden, erlaubt waren ' + cfg.budget + '.');
  }
  if (stats.spent > cfg.budget) {
    maengel.push('Ausgaben ueber Budget: ' + stats.spent + ' von ' + cfg.budget + '.');
  }
  if (stats.bought + stats.bids > cfg.maxBuys) {
    maengel.push('Mehr Kaufaktionen als erlaubt: ' + (stats.bought + stats.bids) + ' von ' + cfg.maxBuys + '.');
  }

  // 3. Kauflog: Jeder Kauf und jeder Auktionsgewinn muss dort stehen.
  const log = Array.isArray(speicher.purchases) ? speicher.purchases : [];
  const erwartet = stats.bought + stats.bidsWon;
  if (log.length !== erwartet) {
    maengel.push('Kauflog unvollstaendig: ' + log.length + ' Eintraege, erwartet ' + erwartet + '.');
  }
  for (const eintrag of log) {
    if (!(eintrag.price > 0)) maengel.push('Kauflog-Eintrag ohne Preis: ' + JSON.stringify(eintrag));
  }

  // 4. Die Kasse der Welt: Startguthaben minus Ausgaben minus dem, was in
  // noch laufenden Bot-Geboten hinterlegt ist. Alles andere waere ein Leck.
  const erwarteteKasse = buch.startCoins - ausgegeben - welt.offeneBotGebote();
  if (buch.coins !== erwarteteKasse) {
    maengel.push('Kassenstand falsch: Welt hat ' + buch.coins + ' Coins, rechnerisch muessten es ' + erwarteteKasse + ' sein.');
  }

  // 5. Kein Kauf ueber dem Zielpreis SEINES Filters.
  const zielpreise = new Map(cfg.targets.map((t) => [t.playerId, t.maxPrice]));
  for (const kauf of buch.gekauft) {
    const grenze = zielpreise.get(kauf.assetId % 1048576);
    if (grenze != null && kauf.preis > grenze) {
      maengel.push('Kauf ueber dem Zielpreis: ' + kauf.preis + ' Coins fuer Spieler ' + kauf.assetId + ' (erlaubt ' + grenze + ', Trade ' + kauf.tradeId + ').');
    }
  }

  return maengel;
}

// Die Schutzlimits, von aussen gemessen: Was ist wirklich bei EA angekommen?
function limitsGeprueft(welt) {
  const suchen = welt.buch.anfragen.filter((a) => a.url.includes('/transfermarket?')).map((a) => a.t);
  const kaufversuche = welt.buch.anfragen.filter((a) => /\/trade\/\d+\/bid$/.test(a.url)).map((a) => a.t);
  return {
    suchenGesamt: suchen.length,
    kaufversucheGesamt: kaufversuche.length,
    sucheStundeMax: fensterMax(suchen, 60 * 60 * 1000),
    sucheTagMax: fensterMax(suchen, 24 * 60 * 60 * 1000),
    kaufTagMax: fensterMax(kaufversuche, 24 * 60 * 60 * 1000)
  };
}

// Nach jedem 429 muss Ruhe sein: fruehestens 2 Sekunden spaeter darf der
// naechste Kauf- oder Gebotsversuch rausgehen (kleinste Backoff-Stufe).
function drosselungGeprueft(welt) {
  const verstoesse = [];
  const gebremst = welt.buch.antworten.filter((a) => a.status === 429).map((a) => a.t);
  const kaufversuche = welt.buch.anfragen.filter((a) => /\/trade\/\d+\/bid$/.test(a.url)).map((a) => a.t);
  for (const t of gebremst) {
    for (const k of kaufversuche) {
      if (k > t && k < t + 2000) {
        verstoesse.push('Kaufversuch ' + (k - t) + ' ms nach einem 429 - die Pause wurde nicht eingehalten.');
      }
    }
  }
  return verstoesse;
}

module.exports = { kassensturz, limitsGeprueft, drosselungGeprueft, fensterMax };
