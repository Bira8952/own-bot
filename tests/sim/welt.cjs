'use strict';

// ===========================================================================
// Die Nachbau-Welt: ein falsches EA, das sich echt benimmt.
//
// - Angebote tauchen auf und verschwinden wieder (Verkaeufer ziehen zurueck,
//   Konkurrenz-Sniper schnappen Schnaeppchen weg).
// - Jede Antwort braucht Zeit (Latenz ueber die falsche Uhr). Dadurch kann
//   ein Angebot zwischen Suche und Kauf verschwinden - wie im echten Markt.
// - Auktionen laufen ab; Rivalen ueberbieten; am Ende gewinnt oder verliert
//   der Bot. Coins werden wie bei EA hinterlegt und wieder freigegeben.
// - Fehlerstuerme: Zeitfenster, in denen EA mit 429/512/521 antwortet,
//   extrem langsam wird oder kaputtes JSON liefert.
// - Alles wird verbucht (anfragen, antworten, gekauft, Kassenstand), damit
//   der Kassensturz danach jede Zahl des Bots gegen die Wahrheit prueft.
// ===========================================================================

function baueWelt({ uhr, zufall, einstellungen }) {
  const E = Object.assign({
    startCoins: 100000,
    zielpreis: 1000, // um diesen Preis herum bewegt sich der Markt
    spielerListe: [{ playerId: 231747, assetId: 231747, resourceId: 50231747, rating: 84, rareflag: 1 }],
    spawnAlleMsMin: 8000, // so oft kommt ein neues Angebot in den Markt
    spawnAlleMsMax: 30000,
    anteilSchnaeppchen: 0.25, // Anteil der Angebote unter dem Zielpreis
    konkurrenzMittelMs: 15000, // mittlere Zeit, bis ein Rivale ein Schnaeppchen wegkauft
    angebotLebtMsMin: 60000, // so lange bleibt ein normales Angebot liegen
    angebotLebtMsMax: 300000,
    latenzMsMin: 250, // so lange braucht eine EA-Antwort
    latenzMsMax: 700,
    auktionAnteil: 0, // Anteil der Angebote, die als Auktion mit Ablauf starten
    auktionRestSMin: 20,
    auktionRestSMax: 180,
    ueberbietenChance: 0.5, // so oft kontert ein Rivale ein Bot-Gebot
    spawnEndeNachMs: Infinity, // danach kommen keine neuen Angebote mehr (laesst Szenarien sauber auslaufen)
    stuerme: [] // { nachMs, dauerMs, art: 'status'|'langsam'|'kaputt', status, ms, anteil }
  }, einstellungen || {});

  const geburt = uhr.jetzt;
  const stuerme = E.stuerme.map((s) => ({
    von: geburt + s.nachMs,
    bis: geburt + s.nachMs + s.dauerMs,
    art: s.art,
    status: s.status || 429,
    ms: s.ms || 9000,
    anteil: s.anteil == null ? 1 : s.anteil
  }));

  const buch = {
    startCoins: E.startCoins,
    coins: E.startCoins,
    tiefstand: E.startCoins, // niedrigster Kassenstand je - misst die echte Belastung
    gekauft: [], // { tradeId, preis, art: 'sofort'|'auktion', t }
    anfragen: [], // { t, methode, url }
    antworten: [], // { t, status, url }
    geboteJeTrade: new Map() // wie oft der Bot auf dieselbe Auktion geboten hat
  };

  const markt = {
    angebote: new Map(), // tradeId -> Angebot
    archiv: new Map(), // abgeschlossene Auktionen mit Bot-Beteiligung (fuer die Beobachtungsliste)
    naechsteTradeId: 5001,
    naechsterSpawn: geburt + zwischen(E.spawnAlleMsMin, E.spawnAlleMsMax),
    zuletzt: geburt
  };

  function zwischen(min, max) {
    return Math.floor(min + zufall() * (max - min + 1));
  }

  // Exponentialverteilte Wartezeit: kleine Abstaende oft, grosse selten.
  function expo(mittel) {
    return Math.max(1, Math.round(-mittel * Math.log(1 - zufall())));
  }

  function schritt(preis) {
    return preis < 1000 ? 50 : preis < 10000 ? 100 : 250;
  }

  function neuesAngebot(t) {
    const id = markt.naechsteTradeId++;
    const sp = E.spielerListe[Math.floor(zufall() * E.spielerListe.length)];
    const schnaeppchen = zufall() < E.anteilSchnaeppchen;
    const auktion = zufall() < E.auktionAnteil;
    const preis = schnaeppchen
      ? Math.round(E.zielpreis * (0.65 + zufall() * 0.35)) // 65-100 % vom Zielpreis
      : Math.round(E.zielpreis * (1.05 + zufall() * 0.6)); // 105-165 %
    const angebot = {
      tradeId: id,
      auktion,
      buyNowPrice: auktion ? E.zielpreis * 2 : preis, // Auktionen: Sofortkauf bewusst zu teuer
      startingBid: auktion ? Math.round(preis * 0.3) : 150,
      currentBid: 0,
      fuehrend: null, // 'bot' | 'rivale'
      botGebot: 0,
      konterUm: 0, // wann ein Rivale das Bot-Gebot ueberbietet
      konterBetrag: 0,
      ablauf: auktion ? t + zwischen(E.auktionRestSMin, E.auktionRestSMax) * 1000 : 0,
      wegUm: auktion ? 0 : (schnaeppchen ? t + expo(E.konkurrenzMittelMs) : t + zwischen(E.angebotLebtMsMin, E.angebotLebtMsMax)),
      itemData: {
        id: 100000 + id,
        assetId: sp.assetId,
        resourceId: sp.resourceId,
        rating: sp.rating,
        rareflag: sp.rareflag
      }
    };
    markt.angebote.set(id, angebot);
  }

  function archivieren(a, gewonnen) {
    if (a.botGebot > 0) {
      markt.archiv.set(a.tradeId, {
        tradeId: String(a.tradeId),
        tradeState: 'closed',
        bidState: gewonnen ? 'highest' : 'outbid',
        currentBid: a.currentBid,
        itemId: String(a.itemData.id)
      });
    }
    markt.angebote.delete(a.tradeId);
  }

  // Den Markt bis "jetzt" weiterleben lassen: neue Angebote, Rivalen,
  // Ueberbieten, ablaufende Auktionen.
  function fortschreiben(jetzt) {
    const spawnEnde = geburt + E.spawnEndeNachMs;
    while (markt.naechsterSpawn <= jetzt) {
      if (markt.naechsterSpawn > spawnEnde) { markt.naechsterSpawn = Infinity; break; }
      neuesAngebot(markt.naechsterSpawn);
      markt.naechsterSpawn += zwischen(E.spawnAlleMsMin, E.spawnAlleMsMax);
    }
    for (const a of Array.from(markt.angebote.values())) {
      if (a.konterUm && a.konterUm <= jetzt) {
        // Der Rivale ueberbietet: EA gibt die Coins des Bots sofort frei.
        if (a.fuehrend === 'bot') buch.coins += a.botGebot;
        a.currentBid = a.konterBetrag;
        a.fuehrend = 'rivale';
        a.konterUm = 0;
      }
      if (a.auktion && a.ablauf <= jetzt) {
        if (a.fuehrend === 'bot') {
          buch.gekauft.push({ tradeId: a.tradeId, preis: a.botGebot, art: 'auktion', assetId: a.itemData.assetId, t: a.ablauf });
          archivieren(a, true);
        } else {
          archivieren(a, false);
        }
        continue;
      }
      if (!a.auktion && a.wegUm && a.wegUm <= jetzt) {
        markt.angebote.delete(a.tradeId); // Rivale hat gekauft oder der Verkaeufer hat zurueckgezogen
      }
    }
    markt.zuletzt = jetzt;
  }

  function antwort(status, daten, url) {
    buch.antworten.push({ t: uhr.jetzt, status, url });
    return { ok: status >= 200 && status < 300, status, json: async () => daten };
  }

  function kaputteAntwort(url) {
    buch.antworten.push({ t: uhr.jetzt, status: 200, url, kaputt: true });
    return { ok: true, status: 200, json: async () => { throw new Error('Unexpected token < in JSON'); } };
  }

  function sturmUm(t) {
    for (const s of stuerme) {
      if (t >= s.von && t < s.bis && zufall() < s.anteil) return s;
    }
    return null;
  }

  function sicht(a, jetzt) {
    return {
      tradeId: a.tradeId,
      buyNowPrice: a.buyNowPrice,
      startingBid: a.startingBid,
      currentBid: a.currentBid,
      expires: a.auktion ? Math.max(1, Math.round((a.ablauf - jetzt) / 1000)) : 3600,
      tradeState: 'active',
      bidState: a.fuehrend === 'bot' ? 'highest' : (a.botGebot > 0 ? 'outbid' : 'none'),
      itemData: Object.assign({}, a.itemData)
    };
  }

  function suche(url) {
    const params = new URLSearchParams(url.split('?')[1] || '');
    const spielerId = Number(params.get('maskedDefId')) || 0;
    const maxb = Number(params.get('maxb')) || 0;
    const macr = Number(params.get('macr')) || 0;
    const ovrMin = Number(params.get('ovrMin')) || 0;
    const ovrMax = Number(params.get('ovrMax')) || 0;
    const num = Number(params.get('num')) || 21;
    const jetzt = uhr.jetzt;

    const treffer = [];
    for (const a of markt.angebote.values()) {
      if (spielerId && a.itemData.assetId % 1048576 !== spielerId) continue;
      if (ovrMin && a.itemData.rating < ovrMin) continue;
      if (ovrMax && a.itemData.rating > ovrMax) continue;
      if (maxb && a.buyNowPrice > maxb) continue;
      if (macr) {
        const stand = a.currentBid > 0 ? a.currentBid : a.startingBid;
        if (stand > macr) continue;
      }
      treffer.push(sicht(a, jetzt));
      if (treffer.length >= num) break;
    }
    return { auctionInfo: treffer, credits: buch.coins };
  }

  function bieten(tradeId, betrag) {
    const a = markt.angebote.get(tradeId);
    if (!a) return { status: 478, daten: {} }; // weg: gekauft, abgelaufen, zurueckgezogen

    // Sofortkauf: Der Bot schickt den Sofortkaufpreis als Gebot.
    if (betrag >= a.buyNowPrice) {
      if (a.fuehrend === 'bot') buch.coins += a.botGebot; // haengendes Gebot freigeben
      buch.coins -= a.buyNowPrice;
      buch.tiefstand = Math.min(buch.tiefstand, buch.coins);
      buch.gekauft.push({ tradeId: a.tradeId, preis: a.buyNowPrice, art: 'sofort', assetId: a.itemData.assetId, t: uhr.jetzt });
      markt.angebote.delete(a.tradeId);
      return { status: 200, daten: { credits: buch.coins, auctionInfo: [{ itemData: Object.assign({}, a.itemData) }] } };
    }

    // Gebot auf eine Auktion.
    if (!a.auktion) return { status: 478, daten: {} };
    const mindest = a.currentBid > 0 ? a.currentBid + schritt(a.currentBid) : a.startingBid;
    if (betrag < mindest) return { status: 478, daten: {} }; // zu niedrig - jemand war schneller
    if (a.fuehrend === 'bot') buch.coins += a.botGebot; // altes eigenes Gebot wird ersetzt
    buch.coins -= betrag;
    buch.tiefstand = Math.min(buch.tiefstand, buch.coins);
    a.currentBid = betrag;
    a.botGebot = betrag;
    a.fuehrend = 'bot';
    buch.geboteJeTrade.set(tradeId, (buch.geboteJeTrade.get(tradeId) || 0) + 1);

    // Entscheidet der Wuerfel auf Gegenwehr, kontert ein Rivale vor dem Ablauf.
    const rest = a.ablauf - uhr.jetzt;
    if (rest > 3000 && zufall() < E.ueberbietenChance) {
      a.konterUm = uhr.jetzt + Math.max(500, Math.round(rest * (0.2 + zufall() * 0.5)));
      a.konterBetrag = betrag + schritt(betrag);
    } else {
      a.konterUm = 0;
    }
    return { status: 200, daten: { credits: buch.coins, auctionInfo: [sicht(a, uhr.jetzt)] } };
  }

  async function fetchStellvertreter(url, init) {
    const u = String(url);
    const methode = (init && init.method) || 'GET';
    buch.anfragen.push({ t: uhr.jetzt, methode, url: u });
    fortschreiben(uhr.jetzt);

    const sturm = sturmUm(uhr.jetzt);
    const latenz = sturm && sturm.art === 'langsam' ? sturm.ms : zwischen(E.latenzMsMin, E.latenzMsMax);
    await uhr.warte(latenz);
    fortschreiben(uhr.jetzt);

    if (sturm && sturm.art === 'status') return antwort(sturm.status, {}, u);
    if (sturm && sturm.art === 'kaputt') return kaputteAntwort(u);

    if (u.includes('/transfermarket?')) return antwort(200, suche(u), u);

    const kauf = u.match(/\/trade\/(\d+)\/bid$/);
    if (kauf && methode === 'PUT') {
      const betrag = Number(JSON.parse(init.body).bid);
      const ergebnis = bieten(Number(kauf[1]), betrag);
      return antwort(ergebnis.status, ergebnis.daten, u);
    }

    if (u.endsWith('/item') && methode === 'PUT') {
      const daten = JSON.parse(init.body);
      return antwort(200, { itemData: [{ id: daten.itemData[0].id, success: true }] }, u);
    }

    return antwort(404, {}, u);
  }

  // Was die Beobachtungsliste der Web App melden wuerde: alle Auktionen,
  // an denen der Bot beteiligt ist - laufende und abgeschlossene.
  function beobachtungsliste() {
    fortschreiben(uhr.jetzt);
    const items = [];
    for (const a of markt.angebote.values()) {
      if (a.botGebot > 0) {
        items.push({
          tradeId: String(a.tradeId),
          tradeState: 'active',
          bidState: a.fuehrend === 'bot' ? 'highest' : 'outbid',
          currentBid: a.currentBid,
          itemId: String(a.itemData.id)
        });
      }
    }
    for (const eintrag of markt.archiv.values()) items.push(Object.assign({}, eintrag));
    return items;
  }

  // Coins, die gerade in laufenden Bot-Geboten hinterlegt sind (EA-Sicht).
  function offeneBotGebote() {
    let summe = 0;
    for (const a of markt.angebote.values()) {
      if (a.fuehrend === 'bot') summe += a.botGebot;
    }
    return summe;
  }

  return {
    einstellungen: E,
    buch,
    markt,
    fortschreiben,
    beobachtungsliste,
    offeneBotGebote,
    fetch: fetchStellvertreter
  };
}

module.exports = { baueWelt };
