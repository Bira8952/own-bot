// FC27 Own Bot – Popup
//
// Diese Datei laeuft an zwei Stellen:
//
//  1. Direkt in der EA-Seite. content.js baut popup.html in sein geschlossenes
//     Shadow DOM und ruft dann fc27PopupStart(schattenWurzel, botBefehl) auf.
//     So wird das Menue von der Seite selbst gezeichnet - sichtbar fuer
//     Bildschirmfotos und Werkzeuge, waehrend das geschlossene Shadow DOM die
//     EA-Seite weiter draussen haelt. Der fruehere Erweiterungs-Rahmen war
//     fuer jede Aufnahme unsichtbar: Chrome laesst Erweiterungsseiten aus
//     Bildern anderer Erweiterungen weg, und daran laesst sich nichts drehen.
//  2. Als eigenes Fenster (popup.html direkt geoeffnet, der Rueckfallweg
//     ueber das Symbol). Dann startet die Datei sich selbst mit document.
//
// WURZEL ist ueberall der Suchraum statt document: im Fenster das Dokument,
// in der Seite die Schattenwurzel. BOT ist der direkte Draht zu content.js -
// gleiche Welt, gleicher Prozess, kein Nachrichtenweg noetig.
"use strict";
function fc27PopupStart(wurzelArg, botArg) {
const WURZEL = wurzelArg || document;
const BOT = typeof botArg === "function" ? botArg : null;
const $ = (id) => WURZEL.getElementById(id);

// Bilder aus img/ fuer das Stylesheet: In der EA-Seite loest eine relative
// url() gegen ea.com auf, nicht gegen die Erweiterung. Deshalb stehen die
// vollen Adressen als CSS-Variablen am Wurzelelement; die Regeln in
// popup-design.css benutzen nur var(--coin-img) usw.
(function bilderAlsVariablen() {
  const ziel = WURZEL === document ? document.documentElement : WURZEL.querySelector(".blatt");
  if (!ziel) return;
  ziel.style.setProperty("--coin-img", "url(\"" + chrome.runtime.getURL("img/coin.png") + "\")");
})();

const NUMBER_FIELDS = ["rating", "rarity", "maxPrice", "budget", "maxBuys", "discount", "minProfit", "timeLimitMin", "bidSeconds", "filterSearchLimit", "filterAnfrageLimit", "filterBuyLimit", "filterSpendLimit", "tonLautstaerke", "rotKaeufeProFilter", "rotSuchenProFilter", "rotPauseS", "grenzeSuchStunde", "grenzeSuchTag", "listFestpreis", "rotWertungMin", "rotWertungMax", "rotMinPreis", "preisStufen", "rotAnfrageProFilter"];
// 27.09.2026: verkaufPreisLangeNutzen kommt dazu - damit der Bot nach 60
// Minuten Laufzeit weiter einstellt (siehe Optionen > Verkaeufe).
const CHECK_FIELDS = ["notify", "autoFilters", "smartProfit", "bidSniping", "stopIfTooBroad", "sofortKaufen", "nachKaufNeuSuchen", "gewinnBremse", "rotAbzUngeprueft", "rotAbzNurGesehen", "rotAbzUnterSchnitt", "rotAbzGewinn", "rotAbzUnterPreis", "rotAbzHeiss", "rotAbzRuhig", "rotAbzNeu", "rotAbzChem", "autoCheckOnStart", "appSuchweg", "appNurSuchseite", "tonKauf", "tonEnde", "verkaufWache", "autoAbraeumen", "verkaufPreisLangeNutzen", "nichtZugewiesenUnbegrenzt", "rotationModus", "deckelFst", "fstModus"];
const AFTER_BUY_VALUES = ["transfer", "club", "keep", "list"];

function afterBuyValue() {
  const gewaehlt = WURZEL.querySelector('input[name="afterBuy"]:checked');
  return gewaehlt && AFTER_BUY_VALUES.includes(gewaehlt.value) ? gewaehlt.value : "keep";
}

function setAfterBuy(wert) {
  const gueltig = AFTER_BUY_VALUES.includes(wert) ? wert : "keep";
  for (const el of WURZEL.querySelectorAll('input[name="afterBuy"]')) el.checked = el.value === gueltig;
}
// Die Eingrenzungen des Markt-Scans werden mitgespeichert - sonst waeren
// sie nach jedem Neuladen der Seite wieder weg.
const SELECT_FIELDS = ["speedMode", "pausePreset", "preisMethode", "rarity-wahl", "rotQuelle",
  // rotAbzModus (28.09.2026): sperren = wie bisher, nur = FSTs include.
  "rotAbzModus",
  "scanf-rarity", "scanf-level", "scanf-position", "scanf-league", "scanf-nation", "scanf-playStyle", "scanf-club"];
const DEFAULTS = {
  playerName: "", playerId: "", playerRating: "", rating: "", maxPrice: "", budget: "5000", maxBuys: "3",
  discount: "10", minProfit: "200", timeLimitMin: "30", bidSeconds: "60", speedMode: "normal", pausePreset: "medium", preisMethode: "empfohlen",
  // 0 heisst: Verkaufspreis nicht verschieben (27.09.2026). Siehe Optionen >
  // Preis & Gewinn.
  preisStufen: "0",
  // Preisdeckel wie FST (28.09.2026): Standard AUS. Die Markt-Bremse bleibt
  // an, bis der Nutzer den Haken selbst setzt - sie war eine bewusste
  // Entscheidung (Markt 20.000, Angebote 40.000: FST haette fuer 39.750
  // eingestellt, die Karte waere liegen geblieben).
  deckelFst: false,
  "rarity-wahl": "", "scanf-rarity": "", "scanf-level": "", "scanf-position": "", "scanf-league": "", "scanf-nation": "", "scanf-playStyle": "", "scanf-club": "",
  filterSearchLimit: "100", filterBuyLimit: "3", filterSpendLimit: "0", notify: true, toClub: false,
  // Kaufversuche je Spieler (27.09.2026). Leer heisst: Der Bot nimmt das
  // Doppelte der Kaeufe je Spieler, also bisher 6. Genau diese Grenze schlaegt
  // im Alltag am haeufigsten zu - sechs vergebliche Versuche beenden den
  // Spieler, auch wenn kein einziger Kauf geklappt hat. FST hat sie nicht.
  filterAnfrageLimit: "",
  rotationModus: false, rotKaeufeProFilter: "5", rotSuchenProFilter: "50", rotPauseS: "300", listFestpreis: "",
  // Woher die Rotation ihre Filter nimmt (28.09.2026). "live" ist der
  // bisherige Weg - der Standard aendert also fuer niemanden etwas.
  rotQuelle: "live",
  // 27.09.2026: Die Auswahl fuer die Rotation. 0 bis 10 und ALLE Haken
  // gesetzt heisst: Es wird nichts aussortiert. Die Mindestwertung darf auf
  // keinen Fall hoeher starten - am 23.09. fand die Rotation mit einer
  // Schwelle von 6,0 live "0 Filter".
  rotWertungMin: "0", rotWertungMax: "10",
  // 28.09.2026: Was die Abzeichen-Haken bewirken. "sperren" ist das alte
  // Verhalten und bleibt Standard - darum aendert sich fuer Bestandsnutzer
  // nichts und es braucht keinen Umstellungs-Merker. FSTs Standard waere
  // "nur" mit allen Abzeichen (scripts.js Z. 41956-41960) - dann fielen
  // Filter ohne jedes Abzeichen still heraus: bewusst anders.
  rotAbzModus: "sperren",
  rotAbzUngeprueft: true, rotAbzNurGesehen: true, rotAbzUnterSchnitt: true,
  rotAbzGewinn: true, rotAbzUnterPreis: true, rotAbzHeiss: true,
  rotAbzRuhig: true, rotAbzNeu: true, rotAbzChem: true,
  // Mindestpreis der Karte in der Rotation (27.09.2026). FSTs Standard sind
  // 1.200 Coins (scripts.js Z. 41936: min_price). 0 heisst: keine Untergrenze.
  rotMinPreis: "1200",
  // Leer heisst Standard (150 pro Stunde, 350 pro Tag). Siehe Optionen > Wartung.
  grenzeSuchStunde: "", grenzeSuchTag: "",
  // verkaufPreisLangeNutzen: Standard AUS (27.09.2026). Ohne Haken bleibt es
  // dabei, dass der Verkaufspreis hoechstens 60 Minuten alt sein darf.
  autoFilters: false, smartProfit: true, bidSniping: false, stopIfTooBroad: true, sofortKaufen: true, nachKaufNeuSuchen: true, gewinnBremse: true, autoCheckOnStart: true, appSuchweg: false, appNurSuchseite: true, verkaufWache: true, autoAbraeumen: false, verkaufPreisLangeNutzen: false,
  // nichtZugewiesenUnbegrenzt: Standard AUS (28.09.2026) - wie FSTs eigener
  // Standard fuer "unlimited unassigned".
  nichtZugewiesenUnbegrenzt: false, tonKauf: false, tonEnde: false, tonLautstaerke: "60",
  afterBuy: "keep", targets: [],
  // FST-Modus (01.10.2026): "Ohne eigene Grenzen". Ab Werk AN. Bestandsnutzer
  // bekommen ihn ueber den Merker fstModusV1 (siehe loadSettings) - ein neuer
  // Standardwert erreicht sie sonst nie. Aus = der strenge Modus von frueher.
  fstModus: true,
  // Versuche je Filter in der Rotation (FST: Transaktionen je Filter, 10).
  rotAnfrageProFilter: "10"
};
const MAX_TARGETS = 10;
// Ein Satz fuer alle Stellen, an denen die Spielerliste fehlt. Ein Neuladen
// der Web App baut auch die Leiste neu auf - die Liste kommt dann von selbst.
const SPIELERLISTE_FEHLT = "Spielerliste fehlt. Lade die Web App neu (F5) und warte, bis sie ganz geladen ist. Die Spielerliste kommt dann von selbst.";
const SALE_FEE = 0.05;
const WEB_APP_RE = /^https:\/\/www\.ea\.com\/(?:.*\/)?ultimate-team\/web-app(?:[/?#]|$)/i;
const DAY = 24 * 60 * 60 * 1000;
const wireCommand = (cmd) => "v11/" + cmd;

// Der fruehere Rahmen-Meldeblock (postMessage mit Groesse und Farben) ist
// weg: Es gibt keinen Rahmen mehr, den man von aussen nicht unterscheiden
// koennte. content.js baut die Oberflaeche jetzt selbst und weiss deshalb
// aus erster Hand, ob sie steht.

const APPLY_FLASH_MS = 2500; // so lange bleibt "Übernommen" auf dem Knopf stehen
let applyFlash = 0;

let notice = null; // Fehler aus START/STOP, bleibt bis zur naechsten Aktion stehen
// Fortschritt der Preispruefung vor dem Start. Frueher stand der Text in
// notice: rot wie ein Fehler, und nach dem Start blieb er den ganzen Lauf
// stehen - er verdeckte die Meldungen des Bots, auch ein Captcha.
let startPruefText = null;
let checkNotice = null; // Fehler beim Starten des Preis-Checks
let lastRes = null; // letzte Antwort mit Status vom Bot
let letzterStatus = null; // Status aus dem letzten render(), null = gerade keine Verbindung

// ---------------------------------------------------------------------------
// FST-Modus (01.10.2026): "Ohne eigene Grenzen".
//
// Wahrheit ist, was der MOTOR benutzt (status().fstModus), nicht der Haken in
// den Optionen. Ohne Status (keine Verbindung) oder bei einem aelteren Motor
// ohne dieses Feld gilt streng - das ist die sichere Richtung, und alle
// Anzeigen des strengen Modus bleiben so wie sie waren.
// ---------------------------------------------------------------------------
function fstAn() {
  const st = letzterStatus || (lastRes && lastRes.status) || null;
  return Boolean(st && st.fstModus === true);
}

// Wann wurden die Einstellungen zuletzt gespeichert (Punkt 12c)? Kurz danach
// kann der Status des Motors noch den alten Modus zeigen: Der Motor liest die
// Einstellung erst mit der Speicher-Meldung. Ein solcher Status darf die
// Pausen-Stufe nicht zurueckschreiben.
let speicherungAt = 0;
const STATUS_NACHLAUF_MS = 2500;

// Felder, deren Bereich sich mit dem Modus aendert: [id, streng min, streng
// max, FST min, FST max]. null = das Attribut gibt es dann nicht.
const FST_FELDER = [
  ["maxBuys", "1", "50", "1", null],
  ["filterSearchLimit", "10", "150", "1", null],
  ["filterBuyLimit", "1", "20", "1", null],
  ["filterAnfrageLimit", "1", "60", "1", null],
  ["rotKaeufeProFilter", "1", "10", "1", "30"],
  ["rotSuchenProFilter", "10", "80", "1", "200"],
  ["rotPauseS", "25", "300", "60", "600"],
  ["rotAnfrageProFilter", "1", "30", "1", "30"]
];

function fstFelderAnpassen() {
  const fst = fstAn();
  const attr = (el, name, wert) => {
    if (wert == null) {
      if (el.hasAttribute(name)) el.removeAttribute(name);
    } else if (el.getAttribute(name) !== wert) {
      el.setAttribute(name, wert);
    }
  };
  for (const [id, sMin, sMax, fMin, fMax] of FST_FELDER) {
    const el = $(id);
    if (!el) continue;
    attr(el, "min", fst ? fMin : sMin);
    attr(el, "max", fst ? fMax : sMax);
  }
  const versuche = $("filterAnfrageLimit");
  if (versuche) versuche.placeholder = fst ? "ohne Grenze" : "2 × Käufe";
  // Punkt 11c: Ein leeres Laufzeit-Feld heisst im Motor 300 Minuten (Hoechstwert).
  const zeitlimit = $("timeLimitMin");
  if (zeitlimit) zeitlimit.placeholder = fst ? "leer = 300 Minuten (Höchstwert)" : "leer = ohne Zeitlimit";
  // Bloecke, die nur in einem der beiden Modi gelten.
  for (const el of WURZEL.querySelectorAll("[data-modus]")) {
    const verstecken = el.getAttribute("data-modus") === (fst ? "streng" : "fst");
    if (el.hidden !== verstecken) el.hidden = verstecken;
  }
  const option = WURZEL.querySelector('#pausePreset option[value="fst"]');
  if (option) {
    option.hidden = !fst;
    option.disabled = !fst;
  }
  // Feste Zeile im Statuskasten: Ohne Verbindung zeigt sie den Haken.
  const st = letzterStatus || (lastRes && lastRes.status) || null;
  // Die Stufe "Wie FST" gibt es nur im FST-Modus. Bestaetigt der Motor den
  // strengen Modus, steht dort wieder "Ausgewogen" - so zeigt die Maske, was
  // der Motor wirklich benutzt (er faellt bei "fst" ohnehin auf "medium" zurueck).
  const pause = $("pausePreset");
  if (pause && st && !fst && st.fstEinstellung !== true && pause.value === "fst" && Date.now() - speicherungAt > STATUS_NACHLAUF_MS) {
    pause.value = "medium";
    saveSettings();
  }
  const zeigeFst = st ? fst : Boolean($("fstModus") && $("fstModus").checked);
  // Punkt 7: Waehrend eines Laufs gilt der Modus vom Start. Weicht der Haken
  // ab, sagt die Zeile, dass die Umstellung erst beim naechsten Lauf wirkt.
  const abweichung = Boolean(st && st.running && typeof st.fstEinstellung === "boolean" && st.fstEinstellung !== (st.fstModus === true));
  const laufHinweis = $("fst-lauf-hinweis");
  if (laufHinweis && laufHinweis.hidden === abweichung) laufHinweis.hidden = !abweichung;
  const zeile = $("modus-hint");
  if (zeile) {
    const text = (zeigeFst ? "Modus: ohne eigene Grenzen (so arbeiten auch andere Snipe-Programme)" : "Modus: streng (mit eigenen Grenzen)") +
      (abweichung ? " – gilt für diesen Lauf. Die Umstellung kommt mit dem nächsten Lauf." : "");
    if (zeile.textContent !== text) zeile.textContent = text;
    zeile.className = zeigeFst ? "hint warn" : "hint";
  }
}


let players = []; // Spielerliste der Web App (von content.js gespeichert)
let selected = null; // { id, name, rating }
let history = {}; // Preisverlauf pro Spieler/Rating
let runs = []; // Lauf-Statistik
let purchases = []; // Kauflog
let targets = []; // Zielliste: { playerId, playerName, rating, maxPrice }
// Zielpreis oben, der noch vom vorher gewaehlten Spieler stammt: { key, preis }.
// Bleibt nur so lange, wie Karte und Preis unveraendert sind.
let feldPreisAlt = null;
let letzteWahlKey = null; // Karte vor dem Loeschen der Auswahl beim Tippen
let images = null; // Bild-Adresse der Web App: { prefix, suffix }
let liveMarket = { at: 0, list: [] };
let gedaechtnis = { at: 0, karten: {} }; // Preis-Gedaechtnis (content.js)
// 28.09.2026: Konkurrenz-Messungen aus dem laufenden Betrieb (content.js,
// aktivitaetSpeichern). Eigenes Logbuch, weil es zur Karte oft noch keinen
// Preis-Check-Eintrag gibt - dort haette die Messung keinen Platz.
let aktivLog = [];
let filterBudget = "all";
let selectedFilterKey = null;
let modalFilterRow = null;
let modalSaleMode = "normal";
let modalProfitMode = "auto";
// 02.10.2026: Chancen, Assistent, Einfach/Profi, Einfuehrung (siehe unten,
// Abschnitt "Chancen, Assistent ..."). Hier oben, damit render() sie auch
// beim allerersten Aufruf schon kennt.
const MARKT = typeof FC27Markt === "object" && FC27Markt ? FC27Markt : null;
const ASSISTENT = typeof FC27Assistent === "object" && FC27Assistent ? FC27Assistent : null;
const CHANCEN_MAX = 10;
const CHANCEN_NEU_MS = 60000; // die Rangliste haengt an der Uhr (Frische) - einmal pro Minute reicht
const SVG_NS = "http://www.w3.org/2000/svg";
let marktVerlauf = {};
let marktVerkaeufe = {}; // erkannte Verkaeufe aus content.js: { key: [[t, preis], ...] }
let radarListe = "chancen"; // offene Rangliste im Radar
let radarDaten = { bestseller: [], guenstig: [], steigend: [], fallend: [] };
// Trefferquote der Dip-Signale im gespeicherten Verlauf (markt.js backtestAlle).
let trefferStand = { gesamt: { signale: 0, treffer: 0, offen: 0, quote: 0, dauerMin: 0 }, jeKarte: {} };
// Ein Satz je Rangliste (Radar).
const RADAR_ERKLAERUNG = {
  chancen: "Unter ihrem üblichen Preis und vermutlich bald wieder teurer – mit Gewinn nach 5 % Gebühr.",
  bestseller: "Am meisten verkauft in den letzten 3 Stunden – erkannt an Angeboten, die vor ihrem Ablauf verschwunden sind.",
  guenstig: "Gerade am weitesten unter ihrem üblichen Preis.",
  steigend: "In der letzten Stunde am stärksten gestiegen.",
  fallend: "In der letzten Stunde am stärksten gefallen – kaufen erst, wenn der Fall aufhört."
};
let chancen = [];
let chancenAt = 0;
let chancenStand = { karten: 0, reif: 0, fortschritt: 0 };
let chancenKey = "";
let assistentKey = "";
let spielerIndex = null;
let spielerIndexQuelle = null;
let ansicht = "profi";
// Knoepfe des Assistenten, die nur einen Reiter oeffnen.
const ASSISTENT_REITER = { chancen: "tab-chancen", snipen: "tab-snipe", kaeufe: "tab-buys" };
let tourSeite = 1;
const TOUR_SEITEN = 3;

// ---------------------------------------------------------------------------
// Formatierung
// ---------------------------------------------------------------------------

function fmt(n) {
  return Number(n || 0).toLocaleString();
}

function pct(x) {
  return Math.round(x * 100) + " %";
}

function duration(ms) {
  const min = Math.round(ms / 60000);
  if (min < 1) return "unter 1 Min.";
  if (min < 60) return min + " Min.";
  return Math.floor(min / 60) + " Std. " + (min % 60) + " Min.";
}

// Die Preisstufen liest content.js aus der Web App aus und legt sie ab. Hier
// wird dieselbe Leiter benutzt, damit Vorschlag und Kauf nicht auseinander
// laufen. Die eingebaute Leiter ist nur der Rueckfall.
let priceTiers = null;

function stepFor(price) {
  if (priceTiers) {
    for (const tier of priceTiers) {
      if (price >= tier.min) return tier.inc;
    }
  }
  // Dieselbe Leiter wie in content.js, aus EA's PRICE_TIERS abgeschrieben.
  return price >= 100000 ? 1000 : price >= 50000 ? 500 : price >= 10000 ? 250
    : price >= 1000 ? 100 : price >= 150 ? 50 : 150;
}

function roundDownToStep(price) {
  const step = stepFor(price);
  return Math.floor(price / step) * step;
}

function roundUpToStep(price) {
  const step = stepFor(price);
  return Math.ceil(price / step) * step;
}

// Abstand zwischen Kaufpreis und billigstem Angebot, in Preisstufen auf
// derselben Leiter wie beim Kauf. 0 = das billigste Angebot liegt schon zum
// Kaufpreis oder darunter, null = kein billigstes Angebot bekannt. Gekauft
// wird nur, wenn jemand unter das billigste Angebot geht - und jede Stufe
// tiefer ist seltener. Live am 22.09.: Ziel 550, billigstes Angebot 650
// (2 Stufen), 30 Suchen, kein Treffer. Ab 2 Stufen zaehlt fuer die Wertung
// der Abstand in Prozent (prozentUnterAngebot, chanceNachAbstand).
function stufenUnterAngebot(kaufpreis, lowest) {
  const preis = Number(kaufpreis) || 0;
  const angebot = Number(lowest) || 0;
  if (!(preis > 0) || !(angebot > 0)) return null;
  let stufen = 0;
  // Die 99 schuetzt nur vor einer kaputten Leiter (Stufe 0).
  for (let p = preis; p < angebot && stufen < 99; p += Math.max(1, stepFor(p))) stufen += 1;
  return stufen;
}

// Derselbe Abstand in Prozent des billigsten Angebots (0.1 = 10 %). 0 = zum
// Kaufpreis oder darunter, null = kein billigstes Angebot bekannt. Stufen
// allein taeuschen: Bei teuren Karten sind sie klein (10.000 Coins: 250 =
// 2,5 %), bei billigen gross (650 Coins: 50 = 7,7 %).
function prozentUnterAngebot(kaufpreis, lowest) {
  const preis = Number(kaufpreis) || 0;
  const angebot = Number(lowest) || 0;
  if (!(preis > 0) || !(angebot > 0)) return null;
  return preis >= angebot ? 0 : (angebot - preis) / angebot;
}

// "Nah" am billigsten Angebot: hoechstens eine Stufe ODER hoechstens 3 %
// darunter. Die Wertung zaehlt beides gleich (Chance 0,6), also warnen
// Dialog und Preisbox auch erst darueber, und "Gewinn+" gibt es nur hier.
const NAH_PROZENT = 0.03;
const ABSTAND_WARNUNG_AB = 2; // Stufen
function nahAmAngebot(kaufpreis, lowest) {
  const stufen = stufenUnterAngebot(kaufpreis, lowest);
  if (stufen === null) return false;
  return stufen < ABSTAND_WARNUNG_AB || prozentUnterAngebot(kaufpreis, lowest) <= NAH_PROZENT;
}

// Filter-Dialog und Preisbox warnen mit denselben Worten.
function abstandWarnung(kaufpreis, lowest) {
  const stufen = stufenUnterAngebot(kaufpreis, lowest);
  if (stufen === null || nahAmAngebot(kaufpreis, lowest)) return "";
  return "Kaufpreis " + fmt(kaufpreis) + " liegt " + stufen + " Stufen unter dem billigsten Angebot (" +
    fmt(lowest) + ") – Treffer sind selten.";
}

// Einzelstueck: Das billigste Angebot steht nur einmal da und liegt mehr als
// eine Stufe unter dem Marktpreis. buildPriceEntry (content.js) nimmt als
// Marktpreis die erste Preisgruppe - so ein Angebot gehoert nicht dazu. Meist
// ist es ein Fehlpreis, der nach Sekunden weggekauft ist, und sagt wenig ueber
// die naechsten Angebote. Ohne countAtLowest gilt es vorsichtshalber auch so.
function einzelstueck(entry) {
  if (!entry || (Number(entry.countAtLowest) || 0) > 1) return false;
  const stufen = stufenUnterAngebot(entry.lowest, entry.market);
  return stufen !== null && stufen > 1;
}

// --- Verkaufspreis nach Alter (F1)
//
// content.js legt in jedem Preis-Eintrag ab, wie lange die Angebote schon
// standen (entry.alter). Steht ein Angebot lange unverkauft da, verkauft sich
// sein Preis offenbar nicht - dann rechnen wir mit etwas weniger. Der Preis
// kann dadurch nur sinken, nie steigen. Es kostet keine einzige Anfrage.
const PREIS_METHODE_NAMEN = ["sicher", "empfohlen", "locker"];
const PREIS_METHODE_TEXT = { sicher: "Sicher", empfohlen: "Empfohlen", locker: "Locker" };

function preisMethodeValue() {
  const el = $("preisMethode");
  return el && PREIS_METHODE_NAMEN.includes(el.value) ? el.value : "empfohlen";
}

// Verschieben um ganze Preisstufen (27.09.2026).
//
// FUT Simple Trader kann den gefundenen Preis in Prozent ODER in ganzen
// Preisstufen verschieben, nach oben und nach unten (applyPriceOffset,
// scripts.js Z. 28646-28658; erlaubt sind dort bis zu 30 Stufen, Z. 42682-42687).
// Wir hatten nur Prozent und nur nach unten. Bei billigen Karten ist Prozent zu
// grob: 10 Prozent von 400 Coins sind 40 - das rundet auf genau eine 50er-Stufe.
const PREIS_STUFEN_MAX = 30;

function preisStufenValue() {
  const el = $("preisStufen");
  const n = el ? Math.round(Number(el.value)) : 0;
  return Number.isFinite(n) ? Math.max(-PREIS_STUFEN_MAX, Math.min(PREIS_STUFEN_MAX, n)) : 0;
}

// Haken "Preisdeckel wie FST" (28.09.2026): Markt-Bremse aus, es zaehlt nur
// der Anker-Deckel - wie bei FUT Simple Trader (getPriceCeiling, scripts.js
// Z. 28439-28453). Ohne Haken (Standard) bleibt alles wie bisher.
function deckelFstValue() {
  const el = $("deckelFst");
  return Boolean(el && el.checked);
}

// Eine Preisstufe ist nicht ueberall gleich gross - bei EA 50 Coins unten und
// 1.000 Coins oben. Darum Schritt fuer Schritt rechnen und die Stufe jedes Mal
// neu bestimmen, genau wie FST es tut. Eine Rechnung "Preis + 5 x Stufe" waere
// an jeder Bandgrenze falsch.
function umStufenVerschieben(preis, stufen) {
  let wert = Math.max(0, Math.floor(Number(preis) || 0));
  const n = Math.max(-PREIS_STUFEN_MAX, Math.min(PREIS_STUFEN_MAX, Math.round(Number(stufen) || 0)));
  for (let i = 0; i < Math.abs(n); i++) {
    if (n > 0) {
      wert = roundDownToStep(wert + stepFor(wert));
    } else {
      const tiefer = roundDownToStep(wert - 1);
      if (!(tiefer > 0)) break;
      wert = tiefer;
    }
  }
  return wert;
}

// ohneFstDeckel (28.09.2026): true heisst "den Haken Preisdeckel wie FST
// ignorieren". Gebraucht vom KAUFPREIS (suggestionFor): Der Haken soll nur
// beeinflussen, zu welchem Preis eine gekaufte Karte eingestellt wird - nie,
// was der Bot zahlt. Sonst kauft er mit dem Haken teurer (Gegenprobe
// nachgerechnet: Markt 10.000, Verkaufspreis 12.000 statt 16.000 mit Haken,
// Mindestgewinn 2.000 - der Zielpreis sprang von 9.400 auf 10.000).
function verkaufsPreis(entry, methode, ohneFstDeckel) {
  const markt = Number(entry && entry.market) || 0;
  const name = PREIS_METHODE_NAMEN.includes(methode) ? methode : "empfohlen";
  const alter = entry && entry.alter;
  // Das Alter gehoert zu genau dieser Messung: alter.markt muss passen.
  const m = alter && alter.v === 1 && alter.markt === markt && alter.methoden ? alter.methoden[name] : null;
  if (!m) {
    // Auch ohne Alter-Daten wird verschoben (28.09.2026).
    //
    // Hier stand vorher ein nackter Ausstieg mit dem Marktpreis. Der Motor
    // (content.js verkaufsPreisAusEintrag) verschiebt in demselben Fall
    // trotzdem, weil er den Marktpreis als Grundlage nimmt. Ergebnis bei drei
    // Stufen: Die Leiste zeigte 900, der Bot stellte fuer 1.100 ein - rund
    // 22 Prozent Unterschied, und der Kommentar "ein Test haelt sie gleich"
    // stimmte nicht, weil der Test ohne Stufen lief.
    //
    // Das Verschieben ist die Hand des Nutzers am Preis. Sie gilt auch dann,
    // wenn keine Alters-Messung vorliegt - sonst faellt seine Einstellung
    // lautlos aus, und zwar genau in dem Fall, den er am Bildschirm sieht.
    const ohneStufen = { basis: markt, methode: name, preis: markt, quelle: "markt", grund: "keineDaten", stufen: 0 };
    const s = preisStufenValue();
    if (!s || !(markt > 0)) return ohneStufen;
    let p = umStufenVerschieben(markt, s);
    if (Number(entry.eaMin) > 0 && p < Number(entry.eaMin)) p = Number(entry.eaMin);
    if (Number(entry.eaMax) > 0 && p > Number(entry.eaMax)) p = Number(entry.eaMax);
    return Object.assign(ohneStufen, { preis: p, stufen: s });
  }
  // Der Preis nach Alter darf ueber dem Marktpreis liegen. Genau das ist FSTs
  // Kern: gesucht wird der hoechste Preis, unter dem der Markt noch frisch ist.
  const roh = Number(m.roh) || 0;
  // Haken "Preisdeckel wie FST" (28.09.2026): Dann zaehlt der Preis ohne die
  // Markt-Bremse. Alte Eintraege kennen preisFst nicht - dann gilt weiter der
  // vorsichtige Preis. Muss genauso in content.js verkaufsPreisAusEintrag
  // stehen - ein Test haelt beide gleich.
  const mPreis = !ohneFstDeckel && deckelFstValue() && Number(m.preisFst) > 0 ? Number(m.preisFst) : Number(m.preis);
  const alterPreis = mPreis > 0 && mPreis !== markt ? mPreis : 0;
  const hoeher = alterPreis > markt;
  const grund = !alter.genug
    ? "wenig"
    : alterPreis
      ? (hoeher ? (roh > alterPreis ? "gedeckeltHoch" : "hoeher") : (roh < alterPreis ? "gedeckelt" : "alter"))
      : (roh > 0 ? "passt" : "keinBeweis");
  // Dein eigenes Verschieben um ganze Preisstufen (27.09.2026). Es kommt
  // ZULETZT, nach Methode und Deckel: Es ist deine Hand am Preis, keine
  // Messung. Danach wieder in EAs erlaubte Spanne klemmen - ausserhalb nimmt
  // EA den Preis gar nicht an.
  //
  // Auf den KAUFPREIS wirkt ein Plus nicht: Die Notbremse marktDeckel in
  // suggestionFor laesst ihn nie ueber den gemessenen Marktpreis. FST macht das
  // anders (dort zieht das Verschieben den Kaufpreis mit, scripts.js Z. 45072) -
  // das uebernehmen wir bewusst nicht.
  const stufen = preisStufenValue();
  let preis = alterPreis || markt;
  if (stufen && preis > 0) {
    preis = umStufenVerschieben(preis, stufen);
    if (Number(entry.eaMin) > 0 && preis < Number(entry.eaMin)) preis = Number(entry.eaMin);
    if (Number(entry.eaMax) > 0 && preis > Number(entry.eaMax)) preis = Number(entry.eaMax);
  }
  return {
    basis: markt,
    methode: name,
    preis,
    quelle: alterPreis ? "alter" : "markt",
    stufen,
    hoeher,
    grund,
    roh,
    regel: m.regel || "",
    beweis: Number(m.beweis) || 0,
    beweisMin: Number(m.beweisMin) || 0,
    treffer: Number(m.treffer) || 0,
    mitAlter: Number(alter.mitAlter) || 0,
    n: Number(alter.n) || 0
  };
}

function verkaufsPreisGrund(vp) {
  if (!vp || vp.quelle !== "alter") return "";
  if (vp.hoeher) {
    return vp.regel === "viele"
      ? "Erst ab " + fmt(vp.beweis) + " stehen " + vp.treffer + " Angebote – vorher ist Platz."
      : "Erst ab " + fmt(vp.beweis) + " steht ein Angebot schon " + vp.beweisMin + " Min. unverkauft.";
  }
  return vp.regel === "viele"
    ? "Bis " + fmt(vp.beweis) + " gibt es schon " + vp.treffer + " Angebote – zu viele."
    : "Bis " + fmt(vp.beweis) + " steht ein Angebot schon " + vp.beweisMin + " Min. unverkauft.";
}

function verkaufsPreisText(vp) {
  if (!vp) return "";
  const kopf = "Preis nach Alter (" + (PREIS_METHODE_TEXT[vp.methode] || "Empfohlen") + "): ";
  if (vp.grund === "keineDaten") {
    return "Preis nach Alter: Diese Messung kennt das Alter der Angebote noch nicht. Nach dem nächsten Preis-Check rechnet der Bot damit.";
  }
  if (vp.grund === "wenig") {
    return "Preis nach Alter: Nur " + vp.mitAlter + " von " + vp.n + " Angeboten haben eine bekannte Restzeit – zu wenig. Der Bot rechnet mit dem Marktpreis.";
  }
  if (vp.quelle !== "alter") {
    return kopf + "Bis zum Marktpreis steht nichts lange unverkauft. Der Marktpreis passt.";
  }
  if (vp.hoeher) {
    let hoch = kopf + fmt(vp.preis) + ". Unter diesem Preis ist alles frisch – niemand steht dort lange fest. " +
      verkaufsPreisGrund(vp) + " Darum traut sich der Bot " + fmt(vp.preis) + " statt nur " + fmt(vp.basis) + ".";
    if (vp.grund === "gedeckeltHoch") {
      // 27.09.2026: Der Deckel haengt jetzt am Marktanker und ist nach
      // Preisklasse gestaffelt (unter 1.000 Coins bis zu 60 Prozent darueber,
      // ab 200.000 nur noch 15). Die alte feste Zahl 15 % gibt es nicht mehr,
      // der Satz hat also gelogen.
      hoch += " Nach Alter wären sogar " + fmt(vp.roh) + " drin. Der Bot deckelt aber: Grundlage ist das billigste Angebot, das schon 5 Minuten steht – darüber darf er bei billigen Karten rund 60 %, bei sehr teuren nur 15 % gehen.";
    }
    return hoch;
  }
  let text = kopf + fmt(vp.preis) + ". " + verkaufsPreisGrund(vp) + " Darum rechnet der Bot mit " + fmt(vp.preis) + " statt " + fmt(vp.basis) + ".";
  if (vp.grund === "gedeckelt") {
    text += " Nach Alter wären es sogar nur " + fmt(vp.roh) + ". Der Bot geht aber höchstens rund 10 % unter den Marktpreis.";
  }
  return text;
}

function sellingPrices(entry, analysis) {
  const recommended0 = roundDownToStep(entry.market);
  const falling = analysis && analysis.trend === "fallend";
  const rising = analysis && analysis.trend === "steigend";
  // Schnell = Sicher, Normal = Empfohlen, Geduldig = Locker: Jede Kachel wird
  // hoechstens auf ihren Preis nach Alter gedeckelt.
  const deckel = (m) => {
    const v = verkaufsPreis(entry, m);
    return v.quelle === "alter" ? v.preis : Infinity;
  };
  const empf = deckel("empfohlen");
  const recommended = Number.isFinite(empf) ? roundDownToStep(empf) : recommended0;
  let safe = Math.min(roundDownToStep(recommended0 - stepFor(recommended0) * (falling ? 2 : 1)), deckel("sicher"));
  let lazy = Math.min(roundUpToStep(recommended0 * (rising ? 1.05 : falling ? 1.02 : 1.03)), deckel("locker"));
  if (entry.eaMin) safe = Math.max(safe, entry.eaMin);
  if (entry.eaMax) lazy = Math.min(lazy, entry.eaMax);
  return { safe: Math.max(0, safe), recommended, lazy };
}

function stamp(t) {
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

// Nur Uhrzeit mit Sekunden - fuer den Live-Verlauf, dort ist es immer heute.
function clockTime(t) {
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, "0");
  return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}

// Nur Stunde und Minute, z. B. "18:40" - fuer "aktiv bis".
function hhmm(t) {
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, "0");
  return p(d.getHours()) + ":" + p(d.getMinutes());
}

function shortTime(t) {
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, "0");
  return p(d.getDate()) + "." + p(d.getMonth() + 1) + ". " + p(d.getHours()) + ":" + p(d.getMinutes());
}

function age(t) {
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return "vor " + min + " Min.";
  const h = Math.round(min / 60);
  if (h < 24) return "vor " + h + " Std.";
  const d = Math.round(h / 24);
  return d === 1 ? "vor 1 Tag" : "vor " + d + " Tagen";
}

// ---------------------------------------------------------------------------
// Spielerbilder: Portraet aus der Web App, sonst neutrales Schattenbild
// ---------------------------------------------------------------------------

async function loadImages() {
  const { playerImages } = await chrome.storage.local.get("playerImages");
  const ok = playerImages && typeof playerImages.prefix === "string" && /^https:\/\/[a-z0-9.-]+\.ea\.com\//i.test(playerImages.prefix);
  images = ok ? { prefix: playerImages.prefix, suffix: /^\.(png|webp|jpe?g)$/i.test(playerImages.suffix) ? playerImages.suffix : ".png" } : null;

  // Auch ohne zuvor geladenes Portrait kann das Popup die aktuelle Inhalts-ID
  // aus dem kleinen Startdokument der offiziellen Web App lesen. So wird eine
  // alte gespeicherte Adresse nach einem EA-Update automatisch ersetzt.
  try {
    const res = await fetch("https://www.ea.com/ea-sports-fc/ultimate-team/web-app/", { cache: "no-store", credentials: "omit" });
    if (!res.ok) return;
    const html = await res.text();
    const value = (name) => {
      const match = new RegExp("window\\." + name + "\\s*=\\s*[\\\"']([^\\\"']+)", "i").exec(html);
      return match ? match[1] : "";
    };
    const root = value("fut_resourceRoot");
    const base = value("fut_resourceBase");
    const guid = value("fut_guid");
    const year = value("fut_year");
    if (/^https:\/\/[a-z0-9.-]+\.ea\.com$/i.test(root) && /^\/[a-z0-9/_-]+\/content\/$/i.test(base) &&
        /^[a-z0-9-]{16,}$/i.test(guid) && /^20\d{2}$/.test(year)) {
      const prefix = new URL(base + guid + "/" + year + "/fut/items/images/mobile/portraits/", root).href;
      images = { prefix, suffix: ".png" };
      // Nur bei einer wirklich neuen EA-Adresse speichern. Ein Speichern bei
      // jedem Laden loest sonst storage.onChanged aus und zeichnet die ganze
      // Liste in einer Endlosschleife neu (sichtbares Flackern/Ruckeln).
      if (!playerImages || playerImages.prefix !== prefix || playerImages.suffix !== ".png") {
        await chrome.storage.local.set({ playerImages: { prefix, suffix: ".png", source: "web-app-config", at: Date.now() } });
      }
    }
  } catch (e) {}
}

function portrait(id, name, big) {
  const fallback = document.createElement("img");
  fallback.className = "portrait" + (big ? " big" : "");
  fallback.alt = "Kein Spielerbild für " + String(name || "diesen Spieler") + " verfügbar";
  fallback.src = chrome.runtime.getURL("player-placeholder.svg");
  if (!images || !(Number(id) > 0)) return fallback;
  const img = document.createElement("img");
  img.className = fallback.className;
  img.alt = "";
  img.loading = "lazy";
  img.src = images.prefix + Number(id) + images.suffix;
  img.addEventListener("error", () => img.replaceWith(fallback), { once: true });
  return img;
}

function renderPlayerCard(force) {
  syncAutoFromSelected();
  const card = $("player-card");
  if (!selected) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  const holder = $("pc-portrait");
  if (force || holder.dataset.id !== String(selected.id)) {
    holder.dataset.id = String(selected.id);
    holder.replaceChildren(portrait(selected.id, selected.name, true));
  }
  $("pc-name").textContent = selected.name;
  const rating = ratingValue();
  $("pc-version").textContent = rating ? "Nur die Version mit Rating " + rating : "Alle Versionen dieses Spielers";
  $("pc-rating").textContent = rating ? String(rating) : "";
}

// ---------------------------------------------------------------------------
// Spielerliste und Namenssuche
// ---------------------------------------------------------------------------

// "Ødegaard" -> "odegaard", "N'Golo Kanté" -> "ngolo kante"
function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/ø/g, "o").replace(/æ/g, "ae").replace(/œ/g, "oe").replace(/ß/g, "ss")
    .replace(/ł/g, "l").replace(/đ/g, "d").replace(/ı/g, "i")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`´.\-]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function loadPlayers() {
  const { playerList } = await chrome.storage.local.get("playerList");
  const list = playerList && Array.isArray(playerList.list) ? playerList.list : [];
  players = list
    .filter((entry) => Array.isArray(entry) && entry[0] > 0 && typeof entry[1] === "string")
    .map(([id, name, rating, full]) => ({
      id,
      name,
      rating: rating || 0,
      key: normalize(name),
      search: normalize(name + " " + (full || ""))
    }));
  $("playerName").placeholder = players.length ? "Name eintippen (" + fmt(players.length) + " Spieler)" : "Name eintippen";
  renderPlayerHint();
}

function findPlayers(query) {
  const q = normalize(query);
  if (q.length < 2) return [];
  const tokens = q.split(" ");
  const rank = (p) => (p.key === q ? 0 : p.key.startsWith(q) ? 1 : p.key.split(" ").some((w) => w.startsWith(tokens[0])) ? 2 : 3);
  return players
    .filter((p) => tokens.every((t) => p.search.includes(t)))
    .map((p) => [rank(p), p])
    .sort((a, b) => a[0] - b[0] || b[1].rating - a[1].rating || a[1].name.localeCompare(b[1].name))
    .slice(0, 6)
    .map(([, p]) => p);
}

function renderSuggestions() {
  const text = $("playerName").value;
  const hits = selected && text === selected.name ? [] : findPlayers(text);
  $("suggestions").replaceChildren(
    ...hits.map((p) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "suggestion";
      const name = document.createElement("span");
      name.className = "label";
      name.textContent = p.name;
      const rating = document.createElement("span");
      rating.className = "rating";
      rating.textContent = p.rating || "";
      button.append(portrait(p.id, p.name), name, rating);
      button.addEventListener("click", () => choose(p));
      return button;
    })
  );
}

function renderPlayerHint() {
  renderPlayerCard();
  const hint = $("player-hint");
  if (selected) {
    hint.className = "hint";
    hint.textContent = "";
  } else if (!players.length) {
    const files = lastRes && lastRes.status && lastRes.status.jsonFiles;
    hint.className = "hint warn";
    hint.textContent = SPIELERLISTE_FEHLT +
      (files && files.length ? " Geladene Listen: " + files.join(", ") + "." : "");
  } else {
    hint.className = "hint";
    hint.textContent = "";
  }
}

function choose(player, keepRating) {
  const vorher = currentKey() || letzteWahlKey;
  selected = { id: player.id, name: player.name, rating: player.rating };
  $("playerName").value = player.name;
  if (!keepRating || !$("rating").value) $("rating").value = player.rating || "";
  // Steht die Karte schon in der Liste, gilt ihr Listenpreis auch oben -
  // sonst stuende oben ein anderer Preis als der, zu dem der Start kauft.
  // Sonst bleibt der Preis oben stehen (nie still loeschen), aber mit
  // Hinweis in der Liste: Er gehoert noch zum Spieler davor.
  const key = currentKey();
  const eintrag = targets.find((t) => targetKey(t) === key);
  const feldPreis = Math.floor(Number($("maxPrice").value)) || 0;
  if (eintrag) {
    $("maxPrice").value = eintrag.maxPrice;
    feldPreisAlt = null;
  } else if (feldPreis > 0 && vorher !== key) {
    feldPreisAlt = { key, preis: feldPreis };
  }
  renderSuggestions();
  renderPlayerHint();
  renderPricePanel();
  renderAddButton();
  renderStep();
  renderTargets();
  saveSettings();
}

// ---------------------------------------------------------------------------
// Preis-Check: Verlauf, Marktpreis, Vorschlag, Lauf-Statistik
// ---------------------------------------------------------------------------

async function loadData() {
  const { priceHistory, runStats, purchases: bought, liveMarketResults, priceTiers: tiers, preisGedaechtnis, aktivLog: aktivRoh } =
    await chrome.storage.local.get(["priceHistory", "runStats", "purchases", "liveMarketResults", "priceTiers", "preisGedaechtnis", "aktivLog"]);
  // 28.09.2026: Konkurrenz-Messungen aus dem Lauf - siehe marktKonkurrenz.
  aktivLog = Array.isArray(aktivRoh) ? aktivRoh : [];
  gedaechtnis = preisGedaechtnis && typeof preisGedaechtnis === "object" && preisGedaechtnis.karten ? preisGedaechtnis : { at: 0, karten: {} };
  // content.js hat sie schon geprueft; hier reicht die Form.
  priceTiers = Array.isArray(tiers) && tiers.length && tiers.every((t) => t && t.inc > 0) ? tiers : null;
  history = priceHistory && typeof priceHistory === "object" ? priceHistory : {};
  runs = Array.isArray(runStats) ? runStats : [];
  purchases = Array.isArray(bought) ? bought.filter((b) => b && b.price > 0) : [];
  const liveVorher = liveMarket && liveMarket.at;
  liveMarket = liveMarketResults && Array.isArray(liveMarketResults.list) ? liveMarketResults : { at: 0, list: [] };
  // Neue Marktaufnahme: Die Vorauswahl darf wieder greifen.
  if (liveMarket.at !== liveVorher) filterVorauswahlGemacht = false;
  renderPricePanel();
  renderBuys();
  // Neuer Kauf oder neuer Marktpreis: Gewinn oben gleich mitziehen, nicht
  // erst beim naechsten Status. Ohne Verbindung bleibt stehen, was da ist.
  if (letzterStatus) renderGewinn(letzterStatus);
  renderLiveFilters();
  updateAutoCalculation();
}

function ratingValue() {
  const text = $("rating").value.trim();
  const n = Math.floor(Number(text));
  return text !== "" && n >= 1 && n <= 99 ? n : 0;
}

// Muss Zeichen fuer Zeichen zu priceKey() in content.js passen. Die
// Kartenart haengt nur dran, wenn eine gewaehlt ist - so bleiben alte
// Schluessel und damit der gespeicherte Preisverlauf gueltig.
// Mehrere Kartenarten (28.09.2026): "12,70" haengt als Ganzes an.
// "art >= 0" waere fuer den Listentext falsch (NaN-Vergleich), und der
// Schluessel verloere die Kartenarten still.
function currentKey() {
  if (!selected) return null;
  const liste = rarityListeWert($("rarity") ? $("rarity").value : "");
  return selected.id + ":" + ratingValue() + (liste.length ? ":" + liste.join(",") : "");
}

// Aus Zahl, Text oder Liste eine saubere, aufsteigend sortierte Liste von
// Kartenarten machen (28.09.2026). Leer = "jede Art". Hoechstens 5.
// Muss zu rarityListeVon() in content.js passen - beide zusammen aendern.
function rarityListeWert(roh) {
  const teile = Array.isArray(roh) ? roh : String(roh == null ? "" : roh).split(",");
  const liste = [];
  for (const teil of teile) {
    const text = String(teil).trim();
    if (text === "" || text === "-1") continue;
    const n = Math.floor(Number(text));
    if (Number.isFinite(n) && n >= 0 && n < 1000 && !liste.includes(n)) liste.push(n);
  }
  return liste.sort((a, b) => a - b).slice(0, 5);
}

// Dieselbe Liste in der Form, die gespeichert und verschickt wird:
// -1 (jede Art), eine Zahl (eine Art) oder der Listentext "12,70".
// Number("12,70") waere NaN - darum darf hier NIRGENDS mehr Number stehen.
function rarityWert(roh) {
  const liste = rarityListeWert(roh);
  return liste.length === 0 ? -1 : liste.length === 1 ? liste[0] : liste.join(",");
}

// Die gewaehlte Kartenart (EAs "rarityIds").
// Mehrere Kartenarten (28.09.2026): Das Feld darf eine Kommaliste tragen
// ("12,70"), wie FSTs "Edit Rarities" (scripts.js Z. 26628).
function rarityValue() {
  return rarityWert($("rarity") ? $("rarity").value : "");
}

// Vergleicht den neuesten Marktpreis mit dem ueblichen Preis (Median) der
// Checks davor, alles innerhalb der letzten 7 Tage.
function analyzeHistory(entries) {
  const recent = entries.filter((e) => e && e.market > 0 && e.confidence !== "niedrig" && Date.now() - e.t <= 7 * DAY);
  if (recent.length < 2) return null;
  const markets = recent.map((e) => e.market);
  const latest = markets[markets.length - 1];
  const previous = markets.slice(0, -1).sort((a, b) => a - b);
  const usual = previous[Math.floor((previous.length - 1) / 2)];
  const diff = latest / usual - 1;
  const trend = diff > 0.03 ? "steigend" : diff < -0.03 ? "fallend" : "stabil";
  let hint = "";
  if (diff >= 0.08) hint = "Aktuell " + pct(diff) + " über dem üblichen Preis der letzten 7 Tage. Warten könnte sich lohnen.";
  else if (diff <= -0.05) hint = "Aktuell " + pct(-diff) + " unter dem üblichen Preis der letzten 7 Tage.";
  return { recent, min: Math.min(...markets), max: Math.max(...markets), trend, hint };
}

function drawSpark(points) {
  const wrap = $("p-spark-wrap");
  if (points.length < 2) {
    wrap.hidden = true;
    return;
  }
  const ts = points.map((p) => p.t);
  const vs = points.map((p) => p.market);
  const t0 = Math.min(...ts), t1 = Math.max(...ts);
  const v0 = Math.min(...vs), v1 = Math.max(...vs);
  const x = (t) => (t1 === t0 ? 50 : ((t - t0) / (t1 - t0)) * 100);
  const y = (v) => (v1 === v0 ? 15 : 27 - ((v - v0) / (v1 - v0)) * 24);
  $("p-line").setAttribute("points", points.map((p) => x(p.t).toFixed(1) + "," + y(p.market).toFixed(1)).join(" "));
  wrap.hidden = false;
}

function discountValue() {
  const n = Number($("discount").value);
  return n >= 1 && n <= 50 ? n : 10;
}

function minProfitValue() {
  const n = Math.floor(Number($("minProfit").value));
  return n >= 0 && n <= 10000000 ? n : 200;
}

// Marktaktivitaet gilt nur als Messwert, wenn zwischen den zwei Messungen
// mindestens eine Minute lag (messAbstandMs, der Bot setzt es seit 22.09.).
// Aeltere Preis-Checks (bis 14 Tage im Verlauf) massen ueber 3 Sekunden -
// dort stand fast immer "ruhig", ohne dass etwas gemessen war. Alles andere
// ist "unbekannt" und zaehlt nirgends: kein Aufschlag, kein Abzeichen.
const AKTIVITAET_MIN_ABSTAND_MS = 60000;
function gemesseneAktivitaet(entry) {
  const activity = entry && entry.activity;
  if (activity !== "hoch" && activity !== "normal" && activity !== "ruhig") return "unbekannt";
  return Number(entry.messAbstandMs) >= AKTIVITAET_MIN_ABSTAND_MS ? activity : "unbekannt";
}

function intelligentProfit(entry) {
  const market = Number(entry && entry.market) || 0;
  if (!(market > 0)) return 0;
  let profit;
  if (market < 1000) profit = 100;
  else if (market < 3000) profit = Math.max(150, market * 0.09);
  else if (market < 10000) profit = Math.max(250, market * 0.075);
  else if (market < 50000) profit = Math.max(500, market * 0.06);
  else profit = Math.max(1200, market * 0.045);

  // Ruhige Maerkte brauchen etwas mehr Puffer. Bei vielen schnell
  // verschwindenden Angeboten bleibt der Preis realistischer und naeher am Markt.
  const activity = gemesseneAktivitaet(entry);
  if (activity === "ruhig") profit *= 1.1;
  else if (activity === "hoch") profit *= 0.9;
  const cap = Math.floor(market * (market < 1000 ? 0.18 : 0.22));
  const betrag = Math.min(profit, cap);
  // Abgerundet wird mit der feineren Stufe aus Gewinn und Marktpreis.
  // Frueher nur mit der Stufe des Gewinns: Unter 150 ist die 150, aus 100
  // wurde 0 und dann 50 - unter 1.000 Coins kam immer 50 statt 100 heraus.
  // Nur die Stufe des Marktpreises waere darueber zu grob: 150 bei 1.200
  // Coins wuerde zu 100, unter den Mindestgewinn der Preisklasse.
  const stufe = Math.min(stepFor(market), stepFor(betrag));
  return Math.max(stepFor(market), Math.floor(betrag / stufe) * stufe);
}

// FSTs Boden fuer den Kaufpreis (Z. 2553-2561): Gold ohne Seltenheits-Auswahl
// 350, Gold mit genau der Seltenheit 1 (Sonderkarte) 650, sonst 250. FST hebt
// den Kaufpreis darauf an. Wir tun das NICHT - ein angehobener Kaufpreis frisst
// den Gewinn, den er schuetzen soll. Bei uns ist es eine Warnung: Darunter
// lohnt sich Handeln kaum.
function mindestKaufpreis(entry) {
  const quality = entry && entry.quality;
  const rarities = entry && Array.isArray(entry.rarities) ? entry.rarities : [];
  // Array.isArray statt t.rarities.length: FST stuerzt hier ab (Z. 1819).
  const istGold = quality === "gold" || quality === 3;
  if (!istGold) return 250;
  if (rarities.length === 1 && Number(rarities[0]) === 1) return 650;
  return rarities.length === 0 ? 350 : 250;
}

// Vorschlag: eigener Abschlag unter dem Marktpreis, gueltige Preisstufe, EA-Spanne.
function suggestionFor(entry) {
  // Verkaufspreis = Marktpreis, oder etwas weniger, wenn Angebote lange
  // unverkauft stehen (F1). Zielpreis, Gewinn und Wertung folgen von selbst.
  // Der Kaufpreis haengt NICHT am Haken "Preisdeckel wie FST" (28.09.2026) -
  // darum der dritte Parameter. Wer den Haken setzt, stellt hoeher ein, zahlt
  // aber nicht mehr.
  const verkauf = verkaufsPreis(entry, preisMethodeValue(), true);
  // 27.09.2026: Nicht mehr nur bei quelle "alter". Auch dein eigenes
  // Verschieben um Preisstufen muss ankommen, und das kann auch auf einem
  // reinen Marktpreis sitzen. Genommen wird der Preis, den verkaufsPreis
  // wirklich ausrechnet; entry.market ist nur die Ruecklage, wenn dort nichts
  // steht. Ohne Verschieben ist das genau dasselbe Ergebnis wie vorher.
  const verkaufspreis = Number(verkauf.preis) > 0 ? verkauf.preis : entry.market;
  const gemessen = verkaufspreis;
  const saleNet = Math.floor(verkaufspreis * (1 - SALE_FEE));
  const smart = $("smartProfit") ? $("smartProfit").checked : true;
  const targetProfit = smart ? intelligentProfit(entry) : minProfitValue();
  // DER AUTOMATISCHE SICHERHEITSAUFSCHLAG IST WEG (frueher mittel +2, niedrig
  // +5 Prozentpunkte auf den Abschlag). Er war der wahre Grund fuer unsere
  // Wertungen von 1 von 10: Frisch gescannte Filter haben IMMER die Sicherheit
  // "niedrig", also traf der Aufschlag ausgerechnet jeden neuen Filter. Aus
  // 10 % Abschlag wurden 15 %, der Kaufpreis rutschte 2 bis 4 Preisstufen
  // unter das billigste Angebot - und genau daraus rechnet wertungTeile die
  // Chance. Der Schutz hat also die Wertung zerstoert, die er schuetzen
  // sollte, und den Preis gleich zweimal bestraft: einmal hier und einmal im
  // Faktor "sicherheit" der Wertung. Eine unsichere Messung gehoert nicht
  // billiger gekauft, sondern vor dem Start frisch nachgemessen - das
  // erledigt der Preis-Check ohnehin.
  const extraSafety = 0;
  // Weg 1: der Abschlag, den DU in den Optionen einstellst. Eine Obergrenze,
  // kein Automatismus - bei den ueblichen 10 % greift meist Weg 2.
  const effectiveDiscount = Math.max(0, Math.min(50, discountValue()));
  const byDiscount = roundDownToStep(Math.floor(verkaufspreis * (1 - effectiveDiscount / 100)));
  // Weg 2 ist FSTs einziger Weg (Z. 45103-45106): Verkauf minus EA-Gebuehr
  // minus Mindestgewinn, auf die Preisstufe abgerundet.
  const byProfit = roundDownToStep(saleNet - targetProfit);
  const mindest = mindestKaufpreis(entry);
  // Weg 3, die Notbremse (23.09.2026): NIE mehr zahlen als der gemessene
  // Marktpreis. "Preis nach Alter" darf ueber den Markt gehen - seit dem
  // 27.09.2026 sogar deutlich, weil der Deckel jetzt am Marktanker haengt und
  // bei billigen Karten bis zu 60 % zulaesst (siehe content.js
  // ALTER_ANHEBUNG_STAFFEL). Damit ist diese Bremse wichtiger als vorher, nicht
  // unwichtiger: Sie ist die einzige Stelle, die verhindert, dass ein hoeherer
  // Verkaufspreis den Kaufpreis mitzieht. Mit 10 % Abschlag wird
  // daraus aber eine Kaufgrenze von Markt x 1,035 - bei Markt 10.000 also
  // 10.250. Der Bot kauft dann jedes Angebot bis 10.250 und verliert nach der
  // 5-%-Gebuehr 750 Coins je Karte, sobald die Karte doch nur zum Marktpreis
  // weggeht. Der angehobene Preis darf den VERKAUF hochziehen, nie den KAUF.
  // entry.market ist 0, wenn nichts gemessen wurde - dann greift die Bremse
  // nicht, und es bleibt wie vorher.
  const marktDeckel = Number(entry.market) > 0 ? roundDownToStep(entry.market) : Infinity;
  let value = Math.max(0, Math.min(byDiscount, byProfit, marktDeckel));
  let note = "";
  let eaGrenze = ""; // "min"/"max", wenn die EA-Preisspanne den Preis verschoben hat
  if (entry.eaMin && value < entry.eaMin) {
    value = entry.eaMin;
    eaGrenze = "min";
    note = entry.lowest <= entry.eaMin ? "Preis liegt schon am EA-Minimum, günstiger geht es nicht." : "Vorschlag auf das EA-Minimum angehoben.";
  }
  if (entry.eaMax && value > entry.eaMax) {
    value = entry.eaMax;
    eaGrenze = "max";
    note = "Vorschlag auf das EA-Maximum begrenzt.";
  }
  const expectedProfit = value > 0 ? saleNet - value : 0;
  if (value > 0 && expectedProfit < targetProfit) {
    note = [note, "Der gewünschte Mindestgewinn ist wegen der EA-Preisspanne nicht erreichbar."].filter(Boolean).join(" ");
  }
  if (smart && minProfitValue() > targetProfit) {
    note = [note, "Auto-Gewinn wurde passend zu dieser Preisklasse auf " + fmt(targetProfit) + " Coins gesetzt; dein eigener Wert von " + fmt(minProfitValue()) + " wäre unrealistisch."].filter(Boolean).join(" ");
  }
  // byDiscount/byProfit/eaGrenze braucht die Rechenbox im Auto-Modus: Sie
  // zeigt beide Wege, und der niedrigere bestimmt den Preis.
  // FSTs Start-Sperre (Z. 29839-29844): Ab Kaufpreis >= gerundet(Verkauf x 0,95)
  // bleibt nach der Gebuehr nichts uebrig.
  const ohneGewinn = value > 0 && value >= Math.round(verkaufspreis * (1 - SALE_FEE));
  return { value, note, saleNet, expectedProfit, targetProfit, smartProfit: smart, effectiveDiscount, extraSafety,
    byDiscount, byProfit, eaGrenze, verkaufspreis, gemessen, verkauf, mindest, unterMindest: value > 0 && value < mindest, ohneGewinn };
}

// Ab so vielen eigenen Suchen ohne jeden Treffer gilt ein Filter als leer
// gelaufen: Die Wertung halbiert sich, und die Preisbox sagt es. Live-Filter
// laufen nur 15 Minuten - eine Grenze nur nach Minuten traefe sie nie.
const LEERLAUF_SUCHEN = 30;

function lastRunFor(key) {
  for (let i = runs.length - 1; i >= 0; i--) if (runs[i] && runs[i].key === key) return runs[i];
  return null;
}

// Betrag mit kleinem Zusatz dahinter, z. B. 12.250 und "(niedrig)". Der Zusatz
// steht in einem eigenen small, damit die Zahl gross bleibt und nicht umbricht.
// Die Muenze vor der Zahl setzt das Stylesheet.
function betragMitZusatz(id, betrag, zusatz) {
  const teile = [fmt(betrag)];
  if (zusatz) {
    const klein = document.createElement("small");
    klein.textContent = zusatz;
    teile.push(klein);
  }
  $(id).replaceChildren(...teile);
}

function renderPricePanel() {
  const key = currentKey();
  const entries = key && Array.isArray(history[key]) ? history[key] : [];
  const latest = entries[entries.length - 1];
  if (!latest) {
    $("price").hidden = true;
    return;
  }
  $("price").hidden = false;

  betragMitZusatz("p-lowest", latest.lowest, latest.countAtLowest ? "(" + latest.countAtLowest + "×)" : "");
  betragMitZusatz("p-market", latest.market, latest.confidence ? "(" + latest.confidence + ")" : "");

  const analysis = analyzeHistory(entries);
  drawSpark(analysis ? analysis.recent : []);
  $("p-trend").textContent = analysis
    ? "7 Tage: " + fmt(analysis.min) + " bis " + fmt(analysis.max) + ", Tendenz " + analysis.trend + "."
    : "Der Verlauf erscheint ab dem zweiten Check.";

  const sell = sellingPrices(latest, analysis);
  $("sell-safe").textContent = fmt(sell.safe);
  $("sell-recommended").textContent = fmt(sell.recommended);
  $("sell-lazy").textContent = fmt(sell.lazy);
  const gemessen = gemesseneAktivitaet(latest);
  const activityLabel = gemessen === "hoch" ? "Hoch – viele günstige Angebote bewegen sich"
    : gemessen === "normal" ? "Normal – der Markt bewegt sich"
      : gemessen === "ruhig" ? "Ruhig – Angebote bleiben länger stehen"
        : "Noch nicht sicher messbar";
  $("p-activity").textContent = "Marktaktivität: " + activityLabel +
    (analysis ? ". Preisrichtung: " + analysis.trend : "") + ".";

  const ea = latest.eaMin || latest.eaMax
    ? "EA-Preisspanne: " + (latest.eaMin ? fmt(latest.eaMin) : "?") + " bis " + (latest.eaMax ? fmt(latest.eaMax) : "?") + "."
    : "";
  const suggestion = suggestionFor(latest);
  // Preis nach Alter: erklaeren, warum der Bot vielleicht tiefer rechnet (F1).
  if ($("p-alter")) {
    $("p-alter").textContent = verkaufsPreisText(suggestion.verkauf);
    $("p-alter").className = "hint" + (suggestion.verkauf.grund === "gedeckelt" || suggestion.verkauf.grund === "wenig"
      ? " warn"
      : suggestion.verkauf.quelle === "alter" ? " ok" : "");
  }
  $("p-ea").textContent = [ea, suggestion.note].filter(Boolean).join(" ");
  $("p-profit").className = "hint " + (latest.confidence === "niedrig" ? "warn" : "ok");
  $("p-profit").textContent = suggestion.value > 0
    ? "Nach 5 % EA-Gebühr bleiben beim Verkauf etwa " + fmt(suggestion.saleNet) + " Coins. " +
      (suggestion.smartProfit ? "Auto-Gewinn: " + fmt(suggestion.targetProfit) + " Coins. " : "Mindestgewinn: " + fmt(suggestion.targetProfit) + " Coins. ") +
      "Erwarteter Gewinn: " + fmt(suggestion.expectedProfit) + " Coins pro Karte."
    : "Mit diesem Marktpreis ist der gewünschte Mindestgewinn nicht möglich.";

  const hints = [];
  // Dein eigenes Verschieben muss sichtbar sein (27.09.2026). Eine Zahl, die
  // nicht aus der Messung kommt, darf nicht unbeschriftet auf dem Bildschirm
  // stehen.
  const eigeneStufen = preisStufenValue();
  if (eigeneStufen) {
    hints.push("Du verschiebst den erwarteten Verkaufspreis um " + (eigeneStufen > 0 ? "+" : "") + eigeneStufen + " Preisstufen. Der Kaufpreis steigt dadurch nie über den gemessenen Marktpreis.");
  }
  if (latest.sampleSize) {
    hints.push(latest.sampleSize + " verschiedene Angebote geprüft, " + latest.clusterSize + " davon bilden die passende Preisgruppe.");
  }
  // Woran der Preis-Deckel haengt, muss sichtbar sein (27.09.2026). Seit dem
  // Umbau auf FSTs Weg ist die Grundzahl der Marktanker: das billigste
  // Angebot, das beim Messen schon 5 Minuten stand. Fehlt er, rechnet der Bot
  // mit dem Marktpreis - das darf nicht stillschweigend passieren.
  const deckelInfo = latest.alter && latest.alter.v === 1 && Number(latest.alter.deckel) > 0 ? latest.alter : null;
  if (deckelInfo) {
    // Mit dem Haken "Preisdeckel wie FST" zaehlt der Deckel ohne Markt-Bremse
    // (28.09.2026). Die Anzeige muss dieselbe Zahl nennen wie der Preis daneben -
    // sonst widerspricht sich der Bildschirm selbst.
    const fstDeckel = deckelFstValue() && Number(deckelInfo.deckelFst) > 0;
    hints.push("Preis-Deckel: höchstens " + fmt(fstDeckel ? deckelInfo.deckelFst : deckelInfo.deckel) + " Coins" + (fstDeckel ? " (ohne Markt-Bremse)" : "") + ". " + (deckelInfo.ankerQuelle === "anker"
      ? "Grundlage ist das billigste Angebot, das schon 5 Minuten steht (" + fmt(deckelInfo.anker) + " Coins)."
      : "Kein Angebot stand beim Messen schon 5 Minuten – als Grundlage dient darum der Marktpreis."));
  }
  // Nichts darf still verschwinden (25.09.2026): Wenn Angebote aus der
  // Preisgruppe geflogen sind, muss der Nutzer das sehen können.
  if (latest.frischRaus > 0) {
    hints.push(latest.frischRaus + " ganz frische Angebote (unter zwei Minuten) zählen beim Marktpreis nicht mit – sie sagen noch nichts darüber, was man wirklich bekommt.");
  }
  // Welcher Markt gemessen wurde, muss sichtbar sein (25.09.2026).
  if (latest.chemGefiltert) {
    hints.push("Gemessen wurde nur der Markt mit derselben Chemie (PlayStyle+) wie das billigste Angebot. Karten mit anderer Chemie sind ein eigener Markt – der Bot kauft sie darum nicht mit. Angebote, bei denen EA die Chemie nicht mitschickt, lässt er ebenfalls stehen.");
  }
  if (latest.rounds === 2) {
    // verified heisst nur: Der Marktpreis der zweiten Messung weicht hoechstens
    // 5 % ab (content.js). "niedrig" kommt von wenigen oder stark streuenden
    // Angeboten - dann bestaetigt die passende Kontrolle noch keinen Preis.
    hints.push(!latest.verified ? "Die Kontrollmessung weicht ab."
      : latest.confidence === "niedrig" ? "Die Kontrollmessung passt, aber der Preis beruht auf wenigen oder stark streuenden Angeboten – das ist noch kein sicherer Preis."
        : "Die Kontrollmessung bestätigt den Preis.");
  }
  // Zweite Meinung von EA (25.09.2026): Der Marktschnitt geht in keine
  // Rechnung ein - er darf nur warnen, wenn unsere Messung weit danebenliegt.
  if (latest.schnittWarnung && latest.eaSchnitt > 0) {
    hints.push("EA nennt selbst einen Marktschnitt von " + fmt(latest.eaSchnitt) + " Coins – das liegt weit neben unserer Messung. Bitte noch einmal messen, bevor du danach kaufst.");
  }
  const abstand = abstandWarnung(suggestion.value, latest.lowest);
  if (abstand) hints.push(abstand);
  if (suggestion.extraSafety > 0) {
    hints.push("Der Zielpreis bekommt wegen der Marktlage automatisch " + suggestion.extraSafety + " % zusätzlichen Sicherheitsabstand.");
  }
  if (suggestion.unterMindest) {
    hints.push("Unter " + fmt(suggestion.mindest) + " Coins lohnt sich Handeln kaum – Gebühr und Zeit fressen den Gewinn.");
  }
  if (analysis && analysis.hint) hints.push(analysis.hint);
  const last = lastRunFor(key);
  // Leerer Lauf: ab 20 Minuten oder ab LEERLAUF_SUCHEN Suchen. Nur nach
  // Minuten kam der Hinweis bei Live-Filtern (15 Minuten) nie. Ein knapp
  // verpasster Kauf ist auch ein Treffer - dann stimmt "keinen Treffer" nicht.
  const suchen = Number(last && last.scans) || 0;
  const leerGelaufen = last && last.bought === 0 && !(Number(last.missed) > 0) &&
    (last.durationMs >= 20 * 60000 || suchen >= LEERLAUF_SUCHEN);
  if (leerGelaufen && last.target >= suggestion.value) {
    hints.push("Beim letzten Lauf gab es bei " + fmt(last.target) + " in " + duration(last.durationMs) +
      (suchen > 0 ? " (" + fmt(suchen) + " Suchen)" : "") + " keinen Treffer.");
  }
  $("p-hint").textContent = hints.join(" ");

  $("p-run").textContent = last
    ? "Letzter Lauf: Zielpreis " + fmt(last.target) + ", " + duration(last.durationMs) + ", " +
      last.bought + (last.bought === 1 ? " Kauf, " : " Käufe, ") + last.missed + " verpasst."
    : "";
  const when = age(latest.t);
  $("p-age").textContent = "Stand: " + when + (when.endsWith(".") ? "" : ".");
  const canApply = suggestion.value > 0;
  $("p-apply").disabled = !canApply;
  // Nach einem Klick kurz die Bestaetigung stehen lassen. Ohne das schreibt
  // das naechste Neuzeichnen sie sofort wieder weg, und der Knopf saehe aus,
  // als waere nichts passiert - beim Durchklicken genau so erlebt.
  if (Date.now() - applyFlash >= APPLY_FLASH_MS) {
    $("p-apply").textContent = canApply
      ? (latest.confidence === "niedrig" ? "Vorsichtigen Zielpreis übernehmen: " : "Zielpreis übernehmen: ") + fmt(suggestion.value)
      : "Kein sinnvoller Zielpreis";
  }
  $("p-apply").dataset.value = canApply ? String(suggestion.value) : "";
}

// ---------------------------------------------------------------------------
// Live Filter: gespeicherte Preis-Checks nach Chance und Budget sortieren
// ---------------------------------------------------------------------------

// Ab dieser Wertung steht "Für dich" auf der Karte. Darunter startet der
// Filter-Dialog nicht sofort - laden geht. Eine Rueckfrage loest die Wertung
// nur aus, wenn sie beim frischen Preis-Check deutlich faellt oder erst dabei
// unter diese Grenze rutscht (frischeGruende).
// Auf der gestreckten Skala: 4,0 von 10. FST hat keine Schwelle, sondern
// genau EINE markierte Zeile (Z. 34903-34905). Wir machen es genauso - die
// Schwelle ist nur noch der Boden, unter dem gar keine Zeile markiert wird.
const FUER_DICH_AB = 40;

// Der Grund dahinter, wie FSTs featured_reason (Z. 34921-34929) - nur aus
// UNSEREN eigenen Messungen abgeleitet statt vom Server.
function fuerDichGrund(row) {
  const e = row.entry || {};
  if (e.confidence === "hoch" && e.preisGeprueft !== false) return "sicher";
  if (gemesseneAktivitaet(e) === "ruhig") return "wenig Konkurrenz";
  if (Date.now() - e.t <= 5 * 60000) return "frischer Preis";
  if (gemesseneAktivitaet(e) === "hoch") return "Markt lebhaft";
  return "";
}
// Angezeigt wird die Wertung wie bei FST als Zahl mit einer Stelle hinter dem
// Komma (8,4). Gerechnet wird weiter mit 0 bis 100.
function wertungZahl(score) {
  return ((Number(score) || 0) / 10).toFixed(1).replace(".", ",");
}
const FUER_DICH_TEXT = wertungZahl(FUER_DICH_AB);

// Chance aus dem Abstand Kaufpreis -> billigstes Angebot. Nur nach Stufen
// schnitten billige Karten mit winzigem Gewinn besser ab als teure mit
// normalem Abstand (siehe prozentUnterAngebot). Deshalb zaehlen die Stufen
// nur noch fuer 0 und 1 Stufe - weniger Abstand geht nicht. Ab 2 Stufen
// entscheiden die Prozent. Frueher galt das Bessere aus beiden: Dann
// behielten billige Karten ihren Vorteil (650er 2 Stufen = 17 %: 0,3, eine
// 9.800er 6,5 % darunter nur 0,2), und Berardi (2 Stufen, rund 15 %,
// 30 Suchen, kein Treffer) stand wieder vor den teuren.
// Stufen: 0 -> 1, 1 -> 0,6. Ab CHANCE_PROZENT_AB Stufen die Prozent.
const CHANCE_NACH_STUFEN = [1, 0.6];
const CHANCE_PROZENT_AB = CHANCE_NACH_STUFEN.length;
// Prozent: [bis zu diesem Abstand, Chance]. Darueber CHANCE_PROZENT_REST.
// Bis 3 % wie eine Stufe (NAH_PROZENT), dann in Schritten bis 15 %.
const CHANCE_NACH_PROZENT = [[NAH_PROZENT, 0.6], [0.06, 0.35], [0.1, 0.2], [0.15, 0.12]];
const CHANCE_PROZENT_REST = 0.08;
// Ohne Kaufpreis oder billigstes Angebot vorsichtig wie frueher 2 Stufen.
const CHANCE_OHNE_ABSTAND = 0.3;

// Ohne Abstand (null) 0.
function chanceNachProzent(abstand) {
  if (abstand === null) return 0;
  if (abstand <= 0) return 1;
  const zeile = CHANCE_NACH_PROZENT.find(([bis]) => abstand <= bis);
  return zeile ? zeile[1] : CHANCE_PROZENT_REST;
}

function chanceNachAbstand(kaufpreis, lowest) {
  const stufen = stufenUnterAngebot(kaufpreis, lowest);
  if (stufen === null) return CHANCE_OHNE_ABSTAND;
  return stufen < CHANCE_PROZENT_AB ? CHANCE_NACH_STUFEN[stufen] : chanceNachProzent(prozentUnterAngebot(kaufpreis, lowest));
}

// Die Wertung ist ein Produkt (Chance mal Sicherheit mal Gewinn mal ...),
// 0 bis 100 - keine Summe mehr. Frueher wurden Punkte addiert: Berardi
// (22.09.) kam mit "Sicherheit + frisch + Marge" auf 75, obwohl der Kaufpreis
// 3 Stufen unter dem billigsten Angebot lag - 30 Suchen, 0 Treffer. Jetzt
// zieht ein schwacher Teil das Ganze runter.
// Gibt die Teile einzeln zurueck, damit die Karte sie erklaeren kann.
const EINZELSTUECK_CHANCE_MAX = 0.4;

function wertungTeile(entry, suggestion) {
  // Chance: Wie weit muss jemand unter das billigste Angebot gehen, damit
  // der Bot kauft? Je weiter, desto seltener ein Treffer (chanceNachAbstand).
  const stufen = stufenUnterAngebot(suggestion.value, entry.lowest);
  const prozent = prozentUnterAngebot(suggestion.value, entry.lowest);
  let nachAbstand = chanceNachAbstand(suggestion.value, entry.lowest);
  // Haengt die Chance an einem Einzelstueck, zaehlt es nur zu 40 % - aber nie
  // weniger als der Abstand zum Marktpreis. Sonst kam "Für dich" (ab 60) fast
  // nur ueber so ein Einzelstueck zustande: Innerhalb der Preisgruppe liegt
  // der Kaufpreis bei 10 % Abschlag immer 2 und mehr Stufen tiefer.
  // Hoechstens 0,4: Mit allen Plus-Teilen (Menge, Aktivitaet, eigene Laeufe)
  // bleibt ein Einzelstueck so unter 60 - "Für dich" verspricht "nicht als
  // Einzelstück". Ohne Deckel kam es bei Auto-Gewinn aus und kleinem
  // Mindestgewinn ueber den Abstand zum Marktpreis doch auf 66.
  const allein = einzelstueck(entry);
  if (allein) nachAbstand = Math.min(EINZELSTUECK_CHANCE_MAX, Math.max(chanceNachAbstand(suggestion.value, entry.market), 0.4 * nachAbstand));
  // Mehr Angebote dieses Spielers = mehr Gelegenheiten fuer einen Fehlpreis.
  // Nur leicht - der Abstand bleibt entscheidend.
  const menge = Math.max(Number(entry.marktAngebote) || 0, Number(entry.clusterSize) || 0);
  const nachMenge = menge >= 8 ? 1.1 : menge >= 4 ? 1.05 : menge >= 2 ? 1 : 0.95;
  // Preis-Sicherheit. preisGeprueft === false: Der Scan kam mit dem
  // Abwaertstasten nicht zu Ende, es kann noch billigere Angebote geben.
  const sicherheit = (entry.confidence === "hoch" ? 1 : entry.confidence === "mittel" ? 0.85 : 0.6) *
    (entry.preisGeprueft === false ? 0.7 : 1);
  // Gewinn: Marge beim Kaufpreis OHNE Sicherheitsabschlag. Der Abschlag ist
  // ein Puffer gegen einen falschen Marktpreis, kein Extra-Gewinn - sonst
  // braechte mehr Unsicherheit mehr Punkte. Voll ab 12 %, darunter ueber die
  // Wurzel: Ein normaler Filter (10 % Abschlag, rund 5 % Marge) soll nicht
  // schon an der Marge scheitern.
  const basis = entry.confidence === "hoch" ? suggestion : suggestionFor({ ...entry, confidence: "hoch" });
  const marge = basis.value > 0 ? basis.expectedProfit / basis.value : 0;
  const gewinn = marge > 0 ? Math.min(1, Math.sqrt(marge / 0.12)) : 0;
  const alterMin = Math.max(0, (Date.now() - entry.t) / 60000);
  const frische = alterMin <= 5 ? 1 : alterMin <= 10 ? 0.85 : alterMin <= 15 ? 0.7 : 0;
  // Aktivitaet nur, wenn sie wirklich gemessen ist. "unbekannt" ist neutral.
  const gemessen = gemesseneAktivitaet(entry);
  const aktivitaet = gemessen === "hoch" ? 1.1 : gemessen === "ruhig" ? 0.8 : 1;
  // Eigene Erfahrung nur aus echten Laeufen, nie aus einer Schaetzung.
  const local = localFilterStats(entry.key || (entry.playerId + ":" + (entry.rating || 0)), entry);
  let erfahrung = 1;
  if (!local.estimated && local.scans >= LEERLAUF_SUCHEN && local.hits === 0) erfahrung = 0.5;
  else if (!local.estimated && local.scans >= 20 && local.hits > 0) erfahrung = 1 + 0.2 * Math.min(1, local.hitRate / 20);
  // einzelstueck/ungeprueft/preisSicherheit/prozentZaehlt nur fuer den
  // Erklaertext der Karte. prozentZaehlt: Ab 2 Stufen entscheiden die
  // Prozent - dann nennt der Text sie mit.
  return {
    stufen, prozent, prozentZaehlt: stufen !== null && stufen >= CHANCE_PROZENT_AB,
    chance: nachAbstand * nachMenge, sicherheit, gewinn, frische, aktivitaet, erfahrung,
    einzelstueck: allein, ungeprueft: entry.preisGeprueft === false,
    preisSicherheit: entry.confidence === "hoch" || entry.confidence === "mittel" ? entry.confidence : "niedrig"
  };
}

// Das Produkt bleibt, die ANZEIGE wird gestreckt. Warum die dritte Wurzel:
// Sechs Faktoren multipliziert ergeben selbst bei lauter ordentlichen Teilen
// eine winzige Zahl (0,5 hoch 6 = 0,016). Auf der alten Skala stand dann 0,2
// von 10 - unbrauchbar, obwohl der Filter in Ordnung war. Die Wurzel ist
// streng steigend: Die REIHENFOLGE aendert sich bei keinem einzigen Paar.
// Der Berardi-Fall vom 22.09. (siehe Kommentar ueber wertungTeile) faellt
// also genauso durch wie vorher. Ehrlich bleibt es, weil wertungText jeden
// Teil weiter einzeln benennt.
const WERTUNG_WURZEL = 3;

function wertungAus(teile) {
  const produkt = Math.max(0, Math.min(1, teile.chance * teile.sicherheit * teile.gewinn *
    teile.frische * teile.aktivitaet * teile.erfahrung));
  return Math.min(100, 100 * Math.pow(produkt, 1 / WERTUNG_WURZEL));
}

function filterScore(entry, suggestion) {
  return wertungAus(wertungTeile(entry, suggestion));
}

// Echte Statistik aus den eigenen Bot-Laeufen. Ist ein Filter noch nie
// gelaufen, gibt es nur dann eine Schaetzung, wenn der Preis-Check die
// Aktivitaet wirklich gemessen hat (zwei Messungen mit mindestens einer
// Minute Abstand). Sonst "keineDaten": Der Markt-Scan misst gar nichts, und
// 0 verschwundene Angebote nach 3 Sekunden sind keine Trefferquote.
// laeufe zaehlt alle gespeicherten eigenen Laeufe, auch aeltere als 7 Tage.
function localFilterStats(key, entry) {
  const alle = runs.filter((r) => r && r.key === key);
  const recent = alle.filter((r) => Date.now() - r.t <= 7 * DAY);
  const scans = recent.reduce((sum, r) => sum + (Number(r.scans) || 0), 0);
  const bought = recent.reduce((sum, r) => sum + (Number(r.bought) || 0), 0);
  const missed = recent.reduce((sum, r) => sum + (Number(r.missed) || 0), 0);
  const hits = bought + missed;
  const laeufe = alle.length;
  if (scans > 0) {
    return {
      scans, hits, bought,
      hitRate: Math.min(100, hits / scans * 100),
      successRate: hits > 0 ? Math.min(100, bought / hits * 100) : 0,
      estimated: false,
      laeufe
    };
  }
  if (gemesseneAktivitaet(entry) === "unbekannt") {
    return { scans: 0, hits: 0, bought: 0, hitRate: 0, successRate: 0, estimated: true, keineDaten: true, laeufe };
  }
  const sample = Math.max(1, Number(entry.sampleSize) || 1);
  const disappeared = Math.max(0, Number(entry.disappeared) || 0);
  return {
    scans: 0, hits: disappeared, bought: 0,
    hitRate: Math.min(100, disappeared / sample * 100),
    successRate: 0,
    estimated: true,
    keineDaten: false,
    laeufe
  };
}

function filterBadges(entry, suggestion, stats, kuehl) {
  const badges = [];
  if (kuehl && kuehl.aktiv) badges.push(["Abkühlung", "cool"]);
  if (entry.nurAufnahme) badges.push(["Nur gesehen", "open"]);
  if (entry.ausGedaechtnis) badges.push(["Unter Schnitt", "profit"]);
  // Die Warnungen stehen vorn, damit sie zuerst gelesen werden. Seit
  // 27.09.2026 ist das nur noch Reihenfolge und keine Auswahl mehr: Am Ende
  // der Funktion wird nichts mehr abgeschnitten.
  if (entry.preisGeprueft === false) badges.push(["Ungeprüft", "open"]);
  const margin = suggestion.value > 0 ? suggestion.expectedProfit / suggestion.value : 0;
  const undercut = entry.market > 0 ? (entry.market - entry.lowest) / entry.market : 0;
  // "Gewinn+" nur mit echter Chance: Liegt der Kaufpreis weiter unter dem
  // billigsten Angebot (2 und mehr Stufen und ueber 3 %), verspricht ein
  // hoher Gewinn zu viel.
  // "Gewinn++" (28.09.2026): FSTs zweite Gewinn-Stufe (profit_double_badge,
  // scripts.js Z. 57242-57260). Ab 20 Prozent Marge wechselt nur die
  // Beschriftung - die Bedingung bleibt dieselbe. FSTs eigene Schwelle
  // rechnet deren Server und steht nicht im Code; die 20 Prozent sind
  // unsere Setzung aus der Bilanz vom 27.09.
  if (nahAmAngebot(suggestion.value, entry.lowest) && (margin >= 0.12 || suggestion.expectedProfit >= 1000)) badges.push([margin >= 0.2 ? "Gewinn++" : "Gewinn+", "profit"]);
  if (undercut >= 0.04) badges.push(["Unter Preis", "under"]);
  const activity = gemesseneAktivitaet(entry);
  // Treffer zaehlen nur aus echten eigenen Laeufen, nicht aus einer Schaetzung.
  // Seit 27.09.2026 wird die Aktivitaet auch im laufenden Betrieb gemessen und
  // mit eigenem Zeitstempel im Eintrag abgelegt (aktivT). Dann ist SIE frisch,
  // auch wenn der Preis-Check schon aelter ist. Ohne diese Unterscheidung
  // erschiene "Heiss" weiterhin nie: Der Preis-Check kann waehrend eines Laufs
  // gar nicht laufen und ist nach fuenf Minuten nicht mehr "frisch".
  const aktivT = Number(entry.aktivT) > 0 ? Number(entry.aktivT) : Number(entry.t);
  const aktivFrisch = Date.now() - aktivT <= 5 * 60000;
  const eintragFrisch = Date.now() - entry.t <= 5 * 60000;
  if ((aktivFrisch && activity === "hoch") || (eintragFrisch && !stats.estimated && stats.hitRate >= 8)) badges.push(["Heiß", "hot"]);
  if (activity === "ruhig" && entry.sampleSize >= 4) badges.push(["Ruhig", "open"]);
  // "Chem" (27.09.2026), wie FSTs eigenes Abzeichen (scripts.js
  // Z. 20659-20666): Auf der Karte, die der Bot kaufen wuerde, sitzt ein
  // aufgesetzter Spielstil (PlayStyle+). Das ist ein eigener, meist teurerer
  // Markt - content.js rechnet den Preis deshalb schon getrennt aus
  // (buildPriceEntry, chem/chemGefiltert). Hier wird er nur SICHTBAR.
  // entry.chem: null heisst "EA hat das Feld nicht mitgeschickt", 0 heisst
  // "kein Spielstil". Nur eine echte Zahl ueber 0 zaehlt - bei null wird
  // NICHTS behauptet und nichts geraten.
  if (Number(entry.chem) > 0) badges.push(["Chem", "chem"]);
  // "Neu" nur, wenn es fuer diesen Filter noch gar keinen eigenen Lauf gibt.
  if (Date.now() - entry.t <= 10 * 60000 && stats.laeufe === 0) badges.push(["Neu", "new"]);
  // 27.09.2026: Kein Deckel mehr. FUT Simple Trader zeichnet JEDES Abzeichen
  // (scripts.js Z. 35443-35468 laeuft ohne Grenze ueber e.tags). Bei uns
  // waren hoechstens zwei erlaubt, mit Abkuehlung drei - und weil die
  // Warnungen vorn stehen, belegten "Nur gesehen", "Unter Schnitt" und
  // "Ungeprueft" alle Plaetze. "Gewinn+", "Unter Preis", "Heiss" und "Neu"
  // fielen heraus, obwohl sie zutrafen: Der Nutzer sah die guten Gruende
  // nicht mehr. Die Zeile bricht um (.filter-badges hat flex-wrap).
  return badges;
}

const FILTER_BADGE_HELP = {
  "Ungeprüft": "Der Scan konnte nicht zu Ende prüfen, ob es noch billigere Angebote gibt. Der Preis kann zu hoch sein.",
  "Gewinn+": "Hoher möglicher Gewinn, und das billigste Angebot liegt höchstens eine Preisstufe oder rund 3 % über deinem Kaufpreis.",
  // 28.09.2026: Die zweite Gewinn-Stufe. Ohne diesen Eintrag waere der
  // Titel beim Daraufzeigen leer (FILTER_BADGE_HELP[label] || "").
  "Gewinn++": "Besonders hoher möglicher Gewinn: mindestens 20 % Marge (nach EAs Verkaufsgebühr von 5 %) – und das billigste Angebot liegt höchstens eine Preisstufe oder rund 3 % über deinem Kaufpreis.",
  "Unter Preis": "Das günstigste Angebot liegt klar unter dem erkannten Marktpreis.",
  // 27.09.2026: Erklärung für das neue Abzeichen "Chem".
  "Chem": "Auf der Karte, die der Bot kaufen würde, sitzt ein aufgesetzter Spielstil (PlayStyle+). Solche Karten sind ein eigener, oft teurerer Markt. Waren genug Angebote mit demselben Spielstil da, hat der Bot nur mit denen gerechnet. Waren es zu wenige, ist der Marktpreis gemischt und eher zu niedrig.",
  "Heiß": "Angebote verschwinden schnell oder es gab viele eigene Treffer.",
  Ruhig: "Mehrere Angebote bei eher ruhigem Markt.",
  Neu: "Frisch im EA-Markt-Scan entdeckt. Mit diesem Filter lief der Bot noch nie.",
  "Abkühlung": "Diesen Filter hat der Bot gerade erst benutzt. Zum Schutz deines Kontos steht er kurz hinten an.",
  "Nur gesehen": "Diese Karte stand in der Marktaufnahme, wurde aber nicht einzeln nachgeprüft. Der Preis ist nur das, was zufällig sichtbar war – der Bot prüft ihn vor dem Start selbst nach.",
  "Unter Schnitt": "Der Bot hat diese Karte schon oft gesehen. Zuletzt lag ihr Preis deutlich unter dem üblichen – ohne dass dafür eine Suche nötig war. Vor dem Start prüft er nach."
};

// Liegt nach dem Scan ein Preis-Check fuer denselben Spieler vor, gelten
// dessen Zahlen. Frueher blieb auf der Karte der Scan stehen (Berardi:
// Kauf 700, +107), obwohl der Check laengst 650 statt 850 gemessen hatte.
function mitPreisCheck(scan, check) {
  const neu = { ...scan, ...check };
  // Der Preis-Check tastet selbst abwaerts - die Aussage des Scans ueber
  // sein eigenes Tasten gilt dann nicht mehr.
  delete neu.preisGeprueft;
  // filterKarteAuffrischen legt diesen Eintrag in die Scan-Liste. Ohne die
  // Marke hielte liveFilterRows ihn fuer einen alten Scan ohne preisGeprueft.
  neu.ausPreisCheck = true;
  // Das Alter der Angebote gehoert zu genau einer Messung. Ohne diese Zeile
  // traefe das Alter des Scans auf den Marktpreis des Checks (F1).
  if (!check || !check.alter) delete neu.alter;
  return neu;
}

// Nur ein Preis-Check, der kam, solange die Scan-Karte noch galt (15 Min.),
// gehoert zu ihr. Sonst holte ein spaeter Check im Tab Manuell eine laengst
// abgelaufene Karte zurueck - mit "Neu" und der Angebotsmenge des alten Scans.
const LIVE_FILTER_MS = 15 * 60 * 1000;

// Verlaengerte Live-Filter (27.09.2026).
//
// Der Motor kann einen laufenden Filter aus seinen eigenen Suchen heraus
// einmal verlaengern (content.js, filterWache) - das kostet keine Anfrage.
// Diese Leiste rechnet die Gueltigkeit aber aus ihrer eigenen Filterkarte
// (Messzeit + 15 Minuten) und wusste nichts davon: Der Motor suchte weiter,
// die Rotation hielt den Filter fuer abgelaufen und hoerte auf.
//
// Verlaengert wird NUR die Laufzeit, nicht der Preis. Der Verkaufspreis bleibt
// der zuletzt gemessene mit seinem alten Zeitpunkt - eine Laufsuche sieht den
// Markt nur bis zum Kaufpreis und kann darueber nichts messen.
const filterVerlaengerung = new Map(); // Filter-Schluessel -> gilt bis
// Hoechstens EINE Verlaengerung je Messung. Sonst liefe ein Filter mit einem
// immer aelteren Verkaufspreis weiter. Eine Karte lebt damit hoechstens 25
// Minuten statt 15.
const FILTER_VERLAENGERUNG_MAX_MS = 10 * 60 * 1000;

function verlaengerungMerken(st) {
  const v = st && st.filterVerlaengert;
  if (!v || typeof v.key !== "string" || !(Number(v.bis) > 0)) return;
  const bis = Number(v.bis);
  if (bis > (filterVerlaengerung.get(v.key) || 0)) filterVerlaengerung.set(v.key, bis);
  // Nicht endlos wachsen lassen: laengst abgelaufene Eintraege raus.
  for (const [k, t] of filterVerlaengerung) {
    if (t < Date.now() - LIVE_FILTER_MS) filterVerlaengerung.delete(k);
  }
}

// Bis wann gilt diese Filterkarte? Normal 15 Minuten nach der Messung. Hat der
// Motor verlaengert, hoechstens 10 Minuten laenger. Ein neuer Scan setzt eine
// neue Messzeit - dann ist die alte Verlaengerung von selbst wertlos, weil
// "normal" dann hoeher liegt.
function filterGiltBis(entry, key) {
  const normal = (Number(entry && entry.t) || 0) + LIVE_FILTER_MS;
  const verlaengert = filterVerlaengerung.get(key) || 0;
  return Math.min(Math.max(normal, verlaengert), normal + FILTER_VERLAENGERUNG_MAX_MS);
}
function frischsterEintrag(scan, key) {
  const liste = Array.isArray(history[key]) ? history[key] : [];
  const check = liste[liste.length - 1];
  const passt = check && check.market > 0 && check.t > scan.t && check.t - scan.t <= LIVE_FILTER_MS;
  return passt ? mitPreisCheck(scan, check) : scan;
}

// Zweite Zeile der Filterkarte: Abstand zum billigsten Angebot, Treffer und
// Alter. Treffer nur aus echten eigenen Laeufen - verschwundene Angebote
// sind keine Trefferquote.
function filterKartenZeile(row) {
  // Aus dem Preis-Gedaechtnis: Hier zaehlt der Vergleich mit dem ueblichen
  // Preis, nicht der Abstand zum billigsten Angebot.
  //
  // Wortwahl (23.09.2026): Frueher stand hier "sonst 21.226 - zuletzt
  // 15.750". Das las sich so, als wuerde die Karte normalerweise fuer 21.226
  // verkauft. In Wahrheit ist die erste Zahl nur der Schnitt ALLER gesehenen
  // Angebote - die zweite ist das billigste, also der Preis, zu dem man
  // wirklich loswird. Jetzt heissen sie auch so.
  if (row.entry.ausGedaechtnis) {
    const unter = Math.round((Number(row.entry.trendUnter) || 0) * 100);
    return "Schnitt " + fmt(row.entry.ueblich || row.entry.market) + " · billigstes " + fmt(row.entry.lowest) +
      " (" + unter + " % darunter) · " + (Number(row.entry.sampleSize) || 0) + "-mal gesehen · " + age(row.entry.t);
  }
  const kauf = row.suggestion.value;
  const lowest = row.entry.lowest;
  const stufen = stufenUnterAngebot(kauf, lowest);
  // Stufe 0 heisst "zum Kaufpreis oder darunter" - die Zeile sagt, welches.
  const lage = stufen === 0 ? (lowest < kauf ? "schon unter dem Kaufpreis" : "schon zum Kaufpreis")
    : "Ziel " + stufen + (stufen === 1 ? " Stufe" : " Stufen") + " darunter";
  const abstand = stufen === null ? ""
    : "billigstes Angebot " + fmt(lowest) + (einzelstueck(row.entry) ? " (Einzelstück)" : "") + " · " + lage;
  // Mit Komma wie im Deutschen: "12.5" liest sich hier wie 125.
  const treffer = row.stats.estimated ? "Treffer: noch keine Daten"
    : row.stats.hitRate.toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " Treffer/100";
  return [abstand, treffer, age(row.entry.t)].filter(Boolean).join(" · ");
}

// Kurze Erklaerung der Wertung fuer den Tooltip der Karte. In Worten statt
// Prozent: Die Teile sind Faktoren, keine Messwerte - "Chance 110 %" las
// sich wie eine gemessene Trefferwahrscheinlichkeit.
// Aufrunden auf eine Nachkommastelle: 3,03 % als "3 %" saehe aus wie
// "nah" (bis 3 %), obwohl die Chance schon gering ist.
function prozentAufgerundet(anteil) {
  return (Math.ceil(anteil * 1000 - 1e-9) / 10).toLocaleString("de-DE", { maximumFractionDigits: 1 });
}

// Was ein Filter in einer Stunde Suchen ungefaehr einbringt (27.09.2026).
//
// Bei FST steht unter der Wertung "Erwarteter Profit aus einer Stunde Suche"
// - am 27.09. in FSTs eigener Hilfe nachgelesen. Ihre Zahl ist trotzdem nur
// eine Skala von 0 bis 9,9. Eine echte Coin-Zahl ist verstaendlicher:
// "Wertung 7,1" sagt niemandem etwas, "rund 2.400 Coins in der Stunde" schon.
//
// Die Rechnung: Suchen je Stunde x Trefferquote x Gewinn je Karte.
// Die Suchen sind das KLEINERE aus Tempo und Stundenlimit - sonst kaeme eine
// Zahl heraus, die der Bot gar nicht erreichen darf.
//
// Gibt null zurueck, wenn die Trefferquote nur geschaetzt ist. Eine erfundene
// Coin-Zahl waere schlimmer als gar keine: Man wuerde sich darauf verlassen.
// Wie viele Sekunden zwischen zwei Suchen vergehen - im Mittel, so wie
// content.js (searchDelay) es wirklich wuerfelt.
//
// Steht hier genau einmal (28.09.2026). Vorher stand dieselbe Tabelle an zwei
// Stellen: in gewinnProStunde und in der Laufzeit-Rechnung. Wer FSTs Tempo
// nachzieht, aendert dann leicht nur eine davon - und zwei Anzeigen, die
// dasselbe meinen, zeigen verschiedene Zahlen. Genau so lief beim
// Verkaufspreis der Bildschirm gegen den Bot.
function tempoSekunden(tempo) {
  return tempo === "safe" ? 4.6 : tempo === "turbo" ? 3.0 : 3.9;
}

function tempoName(tempo) {
  return tempo === "safe" ? "Langsam" : tempo === "turbo" ? "Turbo" : "Normal";
}

function gewinnProStunde(stats, suggestion, usage) {
  if (!stats || stats.estimated) return null;
  const gewinn = Number(suggestion && suggestion.expectedProfit) || 0;
  const rate = Number(stats.hitRate) || 0;
  if (!(gewinn > 0) || !(rate > 0)) return null;
  const tempo = $("speedMode") ? $("speedMode").value : "normal";
  const sek = tempoSekunden(tempo);
  const ausTempo = Math.floor(3600 / sek);
  const limit = Number(usage && usage.searchLimitHour) || 150;
  return Math.round(Math.min(ausTempo, limit) * (rate / 100) * gewinn);
}

function wertungText(score, teile) {
  const chance = teile.chance >= 0.9 ? "gut" : teile.chance >= 0.5 ? "mittel" : teile.chance >= 0.25 ? "gering" : "sehr gering";
  // Ab 2 Stufen entscheiden die Prozent - dann stehen sie dabei. Sonst
  // stuenden bei "3 Stufen" einmal "sehr gering" und einmal "mittel" ohne Grund da.
  const prozent = teile.prozentZaehlt && teile.prozent > 0
    ? " oder " + prozentAufgerundet(teile.prozent) + " %" : "";
  const warum = [
    teile.stufen ? "Ziel " + teile.stufen + (teile.stufen === 1 ? " Stufe" : " Stufen") + prozent + " unter dem billigsten Angebot" : "",
    teile.einzelstueck ? "billigstes Angebot ist ein Einzelstück" : ""
  ].filter(Boolean).join(", ");
  const gewinn = teile.gewinn >= 0.999 ? "gut" : teile.gewinn >= 0.7 ? "mittel" : "klein";
  const frische = teile.frische >= 1 ? "frisch" : teile.frische >= 0.85 ? "etwas älter" : teile.frische > 0 ? "läuft bald ab" : "abgelaufen";
  return "Wertung " + wertungZahl(score) + " von 10. Alle Teile zählen zusammen: Ist einer schwach, sinkt die ganze Wertung. " +
    "Eine Einschätzung, keine gemessene Trefferchance. " + [
    "Chance " + chance + (warum ? " (" + warum + ")" : ""),
    "Preis-Sicherheit " + (teile.preisSicherheit || "niedrig") + (teile.ungeprueft ? " (ungeprüft)" : ""),
    "Gewinn " + gewinn,
    "Preis " + frische,
    teile.aktivitaet > 1 ? "Markt lebhaft (Plus)" : teile.aktivitaet < 1 ? "Markt ruhig (Abzug)" : "",
    teile.erfahrung > 1 ? "eigene Läufe mit Treffern (Plus)" : teile.erfahrung < 1 ? "eigene Läufe ohne Treffer (Abzug)" : ""
  ].filter(Boolean).join(" · ") + ".";
}

// Die Grenzen der vier Budget-Reiter. Frueher fest verdrahtet: bis 5.000
// "Niedrig", bis 25.000 "Mittel". FST teilt nach dem Geld des Nutzers ein und
// schickt die Coins beim Abruf der Filter mit (scripts.js Z. 34892-34896).
// Bei 2 Millionen Budget war bei uns alles ueber 5.000 schon "Mittel" - fuer
// diesen Nutzer ist aber auch 50.000 noch niedrig (27.09.2026).
// Grundlage ist das eingetragene Budget: 10 % davon ist die Grenze zu
// "Niedrig", 50 % die Grenze zu "Mittel".
// Unter 10.000 Budget bleiben die alten festen Grenzen. Sonst waere bei 500
// Coins Budget schon eine 300er Karte "Hoch" - die Reiter waeren wertlos.
// "fest" sagt der Oberflaeche, ob sie Prozente nennen darf.
function budgetGrenzen() {
  const feld = $("budget");
  const basis = Number(feld && feld.value) || 0;
  if (!(basis >= 10000)) return { low: 5000, mid: 25000, fest: true };
  return { low: Math.round(basis * 0.1), mid: Math.round(basis * 0.5), fest: false };
}

function budgetGroup(price) {
  const g = budgetGrenzen();
  return price <= g.low ? "low" : price <= g.mid ? "mid" : "high";
}

// --- Abkuehlung der Filter (F4) --------------------------------------------
// Ein Filter, der gerade dran war, steht kurz hinten an. FST laesst das den
// Server entscheiden (scripts.js Z. 35504-35656); wir rechnen es selbst aus
// den letzten benutzten Filtern aus, die content.js mitschickt.
// FST zaehlt FILTERWECHSEL, keine Minuten: fuenf andere Filter, dann ist die
// Abkuehlung weg (Z. 35624, funf Punkte). Die Zeit ist bei uns nur noch die
// Notbremse - unsere Liste ueberlebt das Neuladen der Erweiterung, sonst
// startet man nach zwei Tagen Pause mit der Abkuehlung von vorgestern.
let filterVorauswahlGemacht = false;
const ABKUEHL_FILTER = 5;
const ABKUEHL_MAX_MS = 12 * 60 * 60000;
// Abzug statt Halbieren: FSTs score = raw_score + personal_adjustment
// (Z. 35345-35384, der Abzug steht als Zahl im Schild). Je naeher die
// Abkuehlung dem Ende, desto kleiner der Abzug. Halbieren wuerde einen guten
// Filter hinter jeden schlechten werfen - auch hinter die, die gerade nichts
// finden.
const ABKUEHL_ABZUG_JE_FILTER = 0.1;

function abkuehlAbzug(roh, kuehl) {
  if (!kuehl || !kuehl.aktiv) return 0;
  return Math.round(roh * ABKUEHL_ABZUG_JE_FILTER * kuehl.nochFilter);
}

function letzteFilter() {
  return (letzterStatus && letzterStatus.rotation && letzterStatus.rotation.letzte) || [];
}

function abkuehlungAktiv(key, letzte) {
  const frisch = (letzte || []).filter((e) => e && Date.now() - e.t <= ABKUEHL_MAX_MS).slice(0, ABKUEHL_FILTER);
  const i = frisch.findIndex((e) => e.key === key);
  return i < 0 ? { aktiv: false, nochFilter: 0 } : { aktiv: true, nochFilter: ABKUEHL_FILTER - i };
}

// --- Filter aus dem Preis-Gedächtnis (Trend) -------------------------------
//
// Ein Marktpreis allein sagt nur "diese Karte kostet 450". Erst der Vergleich
// mit dem üblichen Preis sagt, ob das ein Schnäppchen ist. Genau das rechnet
// FSTs Server aus den Daten tausender Nutzer - wir rechnen es aus dem, was
// der Bot bei seinen eigenen Suchen ohnehin gesehen hat.
//
// Kostet KEINE einzige EA-Anfrage: Alles steht schon im Preis-Gedächtnis.
const TREND_UNTER = 0.12; // so weit muss der letzte Preis unter dem Schnitt liegen
const TREND_MIN_GESEHEN = 4; // so oft muss die Karte gesehen worden sein
const TREND_MAX_ALTER_MS = 6 * 60 * 60 * 1000; // älter als 6 Std. zählt nicht
const TREND_MAX = 12; // so viele Trend-Filter höchstens

function trendEintraege() {
  const karten = (gedaechtnis && gedaechtnis.karten) || {};
  const jetzt = Date.now();
  const namen = new Map(players.map((p) => [String(p.id), p]));
  const raus = [];
  for (const key of Object.keys(karten)) {
    const k = karten[key];
    if (!k) continue;
    const letzt = Number(k.letzt) || 0;
    const mittel = Number(k.mittel) || 0;
    const gesehen = Number(k.n) || 0;
    if (!(letzt > 0) || !(mittel > 0)) continue;
    if (gesehen < TREND_MIN_GESEHEN) continue;
    if (jetzt - (Number(k.t) || 0) > TREND_MAX_ALTER_MS) continue;
    // Ausgelöst wird jetzt über den Marktanker (25.09.2026): "letzt" ist das
    // billigste Angebot der letzten Runde und kann ein Lockangebot sein, das
    // nach zehn Sekunden wieder weg war. So eine Karte stand dann als
    // Schnäppchen in der Liste, obwohl es den Preis nie zu kaufen gab. Der
    // Anker ist das billigste Angebot, das beim Sehen schon fünf Minuten
    // stand - nur so ein Preis zählt als "heute billiger als sonst".
    // Ein zu alter Anker zählt nicht, und Karten ohne Anker laufen weiter
    // über "letzt" wie bisher. Der angezeigte Verkaufspreis bleibt
    // unverändert an "letzt" hängen (siehe trendZuEintrag): Über den zuletzt
    // wirklich gesehenen Preis gehen wir nicht hinaus.
    const ankerFrisch = jetzt - (Number(k.ankerT) || 0) <= TREND_MAX_ALTER_MS;
    const anker = ankerFrisch ? Number(k.ankerMin) || 0 : 0;
    const vergleich = anker > 0 ? anker : letzt;
    const unter = (mittel - vergleich) / mittel;
    if (unter < TREND_UNTER) continue;
    // Der Schluessel ist "id:rating" oder "id:rating:kartenart" (25.09.2026).
    // Der dritte Teil MUSS mitgenommen werden: Ohne ihn baut die Trendliste
    // einen Filter ueber alle Versionen des Spielers - und der Bot kauft die
    // billigste Version zu einem Preis, der fuer eine andere gerechnet wurde.
    // Genau dieser Fehler ist am 24.09. schon einmal durchgerutscht.
    const [idRoh, ratingRoh, artRoh] = String(key).split(":");
    const player = namen.get(String(idRoh));
    if (!player) continue;
    // Der dritte Teil bleibt ein TEXT und geht durch rarityWert (28.09.2026):
    // Bei mehreren Kartenarten heisst er "12,70". Number("12,70") waere NaN,
    // und die Gedaechtnis-Zeile verlore die Liste.
    raus.push({
      key,
      player,
      playerId: Number(idRoh),
      rating: Number(ratingRoh) || 0,
      rarity: rarityWert(artRoh === undefined ? "" : artRoh),
      letzt,
      mittel,
      unter,
      gesehen,
      t: Number(k.t) || 0
    });
  }
  return raus.sort((a, b) => b.unter - a.unter).slice(0, TREND_MAX);
}

// Aus einem Gedächtnis-Eintrag einen Filter bauen - in derselben Form wie
// ein Scan-Ergebnis, damit die Liste ihn genauso anzeigt und bewertet.
// Eine Messung schlägt das Gedächtnis - egal, was jünger ist. Der Eintrag im
// Gedächtnis wird bei JEDER EA-Antwort neu datiert und wäre damit fast immer
// der jüngere; der gemessene Preis hätte nie eine Chance. Am 23.09. stand
// Pickford deshalb mit "Verkauf 21.226" in der Liste, obwohl unser Preis-Check
// neun Minuten vorher 14.750 gemessen hatte.
function messungStattGedaechtnis(eintrag, key) {
  const liste = Array.isArray(history[key]) ? history[key] : [];
  const check = liste[liste.length - 1];
  if (!check || !(check.market > 0) || Date.now() - check.t > LIVE_FILTER_MS) return eintrag;
  return mitPreisCheck(eintrag, check);
}

function trendZuEintrag(t) {
  // Der "übliche Preis" (mittel) ist der Schnitt ALLER Angebotspreise, die der
  // Bot je gesehen hat - nicht der Preis, zu dem wirklich verkauft wird. Als
  // Verkaufspreis darf er deshalb nie über dem zuletzt gesehenen billigsten
  // Angebot liegen. Sonst rechnet die Karte einen Gewinn vor, den es am Markt
  // nicht gibt (23.09.: "sonst 21.226" gegen gemessene 14.750).
  const ueblich = Number(t.mittel) || 0;
  const letzt = Number(t.letzt) || 0;
  const markt = letzt > 0 ? Math.min(ueblich || letzt, letzt) : ueblich;
  return {
    t: t.t,
    key: t.key,
    playerId: t.playerId,
    rating: t.rating,
    // Die Kartenart muss bis in den Eintrag durch - liveFilterRows und das
    // Filter-Fenster lesen sie von hier.
    // Seit 28.09.2026 kann sie eine Liste sein ("12,70") - darum rarityWert.
    rarity: rarityWert(t.rarity),
    // Verkaufen zum zuletzt gesehenen Preis, kaufen darunter. Der übliche
    // Preis bleibt als "ueblich" erhalten - er ist das Signal ("heute
    // billiger als sonst"), aber nicht die Grundlage der Rechnung.
    market: markt,
    ueblich,
    lowest: letzt,
    countAtLowest: 1,
    sampleSize: t.gesehen,
    clusterSize: 1,
    spread: 1,
    // Nichts davon ist frisch gemessen - der Bot prüft vor dem Start nach.
    confidence: "niedrig",
    band: 0,
    eaMin: 0,
    eaMax: 0,
    suggestion: 0,
    note: "",
    searches: 0,
    activity: "unbekannt",
    disappeared: 0,
    preisGeprueft: false,
    marktAngebote: t.gesehen,
    ausGedaechtnis: true,
    trendUnter: t.unter,
    source: "gedaechtnis"
  };
}

function liveFilterRows(alleGruppen) {
  const names = new Map(players.map((p) => [String(p.id), p]));
  const rows = [];
  for (const scan of liveMarket.list || []) {
    if (!scan || !(scan.market > 0)) continue;
    const key = scan.key || (scan.playerId + ":" + (scan.rating || 0));
    // Scan von vor dem Abwaertstasten (kein preisGeprueft): Sein billigstes
    // Angebot war nur, was zufaellig vorne stand - also ungeprueft. Sonst
    // gaebe es weder "Ungeprüft" noch die Sperre fuer den Sofort-Start.
    // Ein frischer Preis-Check (mitPreisCheck) nimmt das wieder weg.
    const geprueftBekannt = typeof scan.preisGeprueft === "boolean" || scan.ausPreisCheck;
    // Ein spaeterer Preis-Check fuer denselben Spieler ersetzt die Scan-Zahlen.
    const latest = frischsterEintrag(geprueftBekannt ? scan : { ...scan, preisGeprueft: false }, key);
    // 27.09.2026: Eine einzige Stelle entscheidet, bis wann eine Karte gilt -
    // so rechnen Liste, Rotation und Start mit derselben Zahl.
    if (Date.now() > filterGiltBis(latest, key)) continue;
    const player = names.get(String(latest.playerId));
    if (!player) continue;
    const suggestion = suggestionFor(latest);
    if (!(suggestion.value > 0)) continue;
    const stats = localFilterStats(key, latest);
    const teile = wertungTeile(latest, suggestion);
    const kuehl = abkuehlungAktiv(key, letzteFilter());
    const roh = wertungAus(teile);
    rows.push({
      key,
      player,
      rating: Number(latest.rating) || 0,
      // -1 heisst "jede Kartenart". Faellt sie hier weg, kauft der Bot
      // spaeter jede Version dieses Spielers (24.09.2026).
      rarity: rarityWert(latest.rarity),
      entry: latest,
      suggestion,
      stats,
      badges: filterBadges(latest, suggestion, stats, kuehl),
      teile,
      abkuehlung: kuehl,
      rohWertung: roh,
      abzug: abkuehlAbzug(roh, kuehl),
      score: Math.max(0, roh - abkuehlAbzug(roh, kuehl)),
      budget: budgetGroup(suggestion.value)
    });
  }
  // Dazu die Karten, die laut Preis-Gedaechtnis gerade unter ihrem
  // ueblichen Preis liegen. Sie kosten keine Anfrage und stehen nur da,
  // wenn der Scan sie nicht ohnehin schon frisch hat.
  const bekannt = new Set(rows.map((r) => r.key));
  for (const trend of trendEintraege()) {
    if (bekannt.has(trend.key)) continue;
    const eintrag = messungStattGedaechtnis(trendZuEintrag(trend), trend.key);
    const suggestion = suggestionFor(eintrag);
    if (!(suggestion.value > 0)) continue;
    const stats = localFilterStats(trend.key, eintrag);
    const teile = wertungTeile(eintrag, suggestion);
    const kuehl = abkuehlungAktiv(trend.key, letzteFilter());
    const roh = wertungAus(teile);
    rows.push({
      key: trend.key,
      player: trend.player,
      rating: trend.rating,
      entry: eintrag,
      suggestion,
      stats,
      badges: filterBadges(eintrag, suggestion, stats, kuehl),
      teile,
      abkuehlung: kuehl,
      rohWertung: roh,
      abzug: abkuehlAbzug(roh, kuehl),
      score: Math.max(0, roh - abkuehlAbzug(roh, kuehl)),
      budget: budgetGroup(suggestion.value)
    });
  }
  // FST wirft nie eine Zeile weg - die Budget-Gruppe blendet nur aus
  // (v-show, Z. 35698-35705). Und es wird NICHT abgeschnitten.
  rows.sort((a, b) => b.score - a.score || b.suggestion.expectedProfit - a.suggestion.expectedProfit);
  for (const row of rows) {
    row.sichtbar = filterBudget === "all" || row.budget === filterBudget;
    row.fuerDich = false;
  }
  // Genau EINE Zeile wird markiert: die beste sichtbare ohne Abkuehlung.
  // 27.09.2026: Die Untergrenze ist hier weg. FST markiert immer eine Zeile,
  // wenn der Server eine schickt (scripts.js Z. 34903-34905). Bei uns lagen
  // frisch gescannte Filter oft unter 4,0 - dann stand nirgends ein Vorschlag,
  // und der Nutzer musste selbst suchen.
  // Damit kein falsches Versprechen entsteht, heisst die Zeile unter der
  // Grenze nur "Beste dieser Liste" statt "Fuer dich" (fuerDichStark).
  // FUER_DICH_AB bleibt sonst unveraendert: Der Sofort-Start ist weiter
  // gesperrt, solange die Wertung darunter liegt.
  const beste = rows.find((row) => row.sichtbar && !(row.abkuehlung && row.abkuehlung.aktiv));
  if (beste) {
    beste.fuerDich = true;
    beste.fuerDichStark = beste.score >= FUER_DICH_AB;
    beste.fuerDichGrund = fuerDichGrund(beste);
  }
  // alleGruppen ist die Rotation: Sie braucht ALLE Zeilen. Frueher sah sie
  // hoechstens 21 - bei 40 Filtern aus dem Scan fehlte ihr die Haelfte.
  if (alleGruppen) return rows;
  return rows.filter((row) => row.sichtbar);
}

// Schickt EA die Chemie (playStyle) in den Suchtreffern mit? (28.09.2026)
// Das war nie live gemessen - und ohne die Antwort weiss niemand, ob das
// Abzeichen "Chem" je erscheinen KANN. Statt einer eigenen Messung zaehlen
// wir, was schon da ist: Jeder Preis-Check legt "chem" in den Verlauf
// (content.js buildPriceEntry). Eine Zahl heisst: EA hat die Chemie beim
// billigsten Angebot mitgeschickt. null heisst: das Feld fehlte. Alte
// Eintraege OHNE das Feld zaehlen gar nicht - sonst wuerde alte Beute
// faelschlich als "fehlt" gewertet. Kostet keine EA-Anfrage.
function chemSichtbarkeit() {
  let mit = 0;
  let ohne = 0;
  // Dieselbe Zaehlung fuer jeden Eintrag, woher er auch kommt.
  const zaehlen = (e) => {
    if (!e || !("chem" in e)) return;
    if (typeof e.chem === "number" && Number.isFinite(e.chem)) mit += 1;
    else ohne += 1;
  };
  for (const key of Object.keys(history)) {
    const liste = Array.isArray(history[key]) ? history[key] : [];
    for (const e of liste) zaehlen(e);
  }
  // Auch die Eintraege des letzten Markt-Scans (28.09.2026). Der Scan
  // schreibt nichts in den Preisverlauf, sondern in liveMarket.list - und ein
  // Scan liefert auf einen Schlag Dutzende Messpunkte, jeder mit demselben
  // chem-Feld aus buildPriceEntry. Ohne das blieb die Zeile leer, bis jemand
  // einen Preis-Check von Hand machte; mit dem Scan steht die Antwort schon
  // nach dem ersten Mal da. Doppelt gezaehlt (Scan und spaeterer Check) ist
  // unschaedlich: beide sind echte Messungen derselben Frage.
  const scan = liveMarket && Array.isArray(liveMarket.list) ? liveMarket.list : [];
  for (const e of scan) zaehlen(e);
  return { mit, ohne };
}

function renderLiveFilters() {
  const rows = liveFilterRows();
  if (selectedFilterKey && !rows.some((row) => row.key === selectedFilterKey)) selectedFilterKey = null;
  // Wie FST (Z. 34903-34905): Ist nichts gewählt, ist die "Für dich"-Zeile
  // vorgewählt. Nur einmal je Liste - sonst überschreibt sie die Wahl des Nutzers.
  if (!selectedFilterKey && !filterVorauswahlGemacht) {
    const beste = rows.find((row) => row.fuerDich);
    if (beste) selectedFilterKey = beste.key;
    filterVorauswahlGemacht = true;
  }
  // 27.09.2026: Auf den vier Reitern steht jetzt, welche Preise sie meinen.
  // Die Grenzen haengen am eingetragenen Budget - ohne diesen Hinweis waere
  // "Niedrig" eine Zahl, die der Nutzer nirgends nachlesen kann.
  const grenzen = budgetGrenzen();
  const woher = grenzen.fest ? " (feste Grenze, Budget unter 10.000)" : " von deinem Budget";
  const reiterText = {
    all: "Alle Preise",
    low: "Bis " + fmt(grenzen.low) + " Coins" + (grenzen.fest ? woher : " – 10 %" + woher),
    mid: "Bis " + fmt(grenzen.mid) + " Coins" + (grenzen.fest ? woher : " – 50 %" + woher),
    high: "Über " + fmt(grenzen.mid) + " Coins"
  };
  for (const knopf of WURZEL.querySelectorAll("#filter-budget button")) {
    knopf.title = reiterText[knopf.dataset.budget] || "";
  }
  // Wie FSTs Listenkopf: die Zahl fett, der Rest gedaempft (lf-list-head__count).
  const zaehler = document.createElement("b");
  zaehler.textContent = String(rows.length);
  $("filter-count").replaceChildren(zaehler, " verfügbar");
  // 28.09.2026: Die Antwort auf die offene Frage "schickt EA die Chemie
  // mit?". Ohne Messung bleibt die Zeile leer und behauptet nichts. Erst ab
  // 5 Messungen ohne Chemie sagen wir "offenbar nie" - vorher waere das
  // eine Behauptung aus zu wenig Daten.
  if ($("chem-sicht")) {
    const cs = chemSichtbarkeit();
    const gesamt = cs.mit + cs.ohne;
    $("chem-sicht").textContent = gesamt === 0 ? ""
      : cs.mit === 0 && gesamt >= 5
        ? "Chemie (PlayStyle+): In " + gesamt + " gespeicherten Preis-Messungen hat EA die Chemie nie mitgeschickt. Das Abzeichen „Chem“ kann so nicht erscheinen."
        : "Chemie (PlayStyle+): EA hat sie in " + cs.mit + " von " + gesamt + " gespeicherten Preis-Messungen mitgeschickt.";
  }
  $("filter-empty").textContent = rows.length ? "" : "Tippe oben auf „EA-Markt live scannen“. Der Bot sucht dann günstige Angebote und macht daraus Filter – gekauft wird dabei nichts.";
  $("filter-empty-box").hidden = rows.length > 0;
  const selectedRow = rows.find((row) => row.key === selectedFilterKey);
  const vorhanden = selectedRow ? targets.find((target) => targetKey(target) === selectedRow.key) : null;
  // Ein abgelaufener Live-Filter in der Liste zaehlt nicht als aktiv - er
  // muss sich erneuern lassen, sonst blockiert er den Start fuer immer.
  const erneuern = Boolean(vorhanden) && liveAlt(vorhanden);
  const alreadyActive = Boolean(vorhanden) && !erneuern;
  const voll = !vorhanden && targets.length >= MAX_TARGETS;
  $("load-filter").disabled = !selectedRow || alreadyActive || voll;
  $("load-filter").textContent = alreadyActive ? "Filter bereits aktiv" : erneuern ? "Filter erneuern" : voll ? "Zielliste ist voll" : "Filter aktivieren";
  $("filter-list").replaceChildren(...rows.map((row) => {
    const card = document.createElement("label");
    const inListe = targets.find((target) => targetKey(target) === row.key);
    const abgelaufen = Boolean(inListe) && liveAlt(inListe);
    const active = Boolean(inListe) && !abgelaufen;
    // "check-group" und die lf-*-Namen sind FSTs Klassen (style.css Z. 2812ff und 3496ff);
    // die alten Namen bleiben daneben stehen.
    card.className = "filter-card check-group" + (row.key === selectedFilterKey ? " selected" : "") + (active ? " active" : "");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "live-filter";
    radio.checked = row.key === selectedFilterKey;
    radio.addEventListener("change", () => {
      selectedFilterKey = row.key;
      renderLiveFilters();
    });
    const info = document.createElement("div");
    info.className = "check-group__content";
    const name = document.createElement("div");
    name.className = "filter-name lf-row__player";
    name.textContent = row.player.name + (row.rating ? " (" + row.rating + ")" : "");
    const meta = document.createElement("small");
    const activity = gemesseneAktivitaet(row.entry);
    meta.textContent = filterKartenZeile(row);
    // Ein Chip in der Abzeichen-Zeile (FST: Ziel-Symbol + "1.5% / 65%").
    const quote = document.createElement("span");
    quote.className = "filter-quote";
    // Wie bei FST: Treffer je 100 Suchen / wie oft daraus ein Kauf wurde.
    // Bei uns steht dabei, wenn die Zahlen nur geschaetzt sind.
    if (row.stats && !row.stats.keineDaten) {
      quote.textContent = row.stats.hitRate.toFixed(1).replace(".", ",") + " % / " +
        row.stats.successRate.toFixed(0) + " %" + (row.stats.estimated ? " (geschätzt)" : "");
      quote.title = row.stats.estimated
        ? "Geschätzt aus dem letzten Scan: So viele Angebote verschwanden, bevor der Bot sie kaufen konnte. Mit eigenen Läufen wird die Zahl echt."
        : "Aus deinen eigenen Läufen der letzten 7 Tage: Treffer je 100 Suchen und wie oft daraus ein Kauf wurde (" + row.stats.scans + " Suchen).";
    } else {
      // Sagen, warum hier nichts steht (28.09.2026).
      //
      // Vorher blieb die Stelle einfach leer - auf jeder einzelnen Zeile, bei
      // einem neuen Nutzer auf allen vierzig. Man sieht ein Loch und weiss
      // nicht, ob etwas kaputt ist oder ob es so gehoert.
      //
      // Es gehoert so: Diese Zahlen kommen bei uns aus den EIGENEN Laeufen.
      // FUT Simple Trader holt sie vom eigenen Server, wo die Zahlen aller
      // Nutzer der letzten 24 Stunden zusammenlaufen - darum stehen sie dort
      // sofort da. Diesen Server haben wir nicht und duerfen ihn auch nicht
      // nutzen. Dafuer verlaesst bei uns nichts den Rechner.
      quote.textContent = "noch keine eigenen Zahlen";
      quote.classList.add("filter-quote-leer");
      quote.title = "Treffer je 100 Suchen und wie viele davon ein Kauf wurden – beides aus deinen eigenen Läufen. " +
        "Die Zahl erscheint, sobald der Bot einmal auf genau diesen Filter gelaufen ist. " +
        "FUT Simple Trader zeigt sie sofort, weil sie dort vom Server kommen: gesammelt über alle Nutzer. " +
        "Bei uns bleibt alles auf deinem Rechner – dafür dauert es länger, bis genug zusammen ist.";
    }
    const trade = document.createElement("small");
    trade.className = "filter-trade";
    trade.textContent = "Kauf " + fmt(row.suggestion.value) + "  ·  Verkauf " + fmt(row.suggestion.verkaufspreis) + "  ·  +" + fmt(row.suggestion.expectedProfit);
    const badges = document.createElement("div");
    badges.className = "filter-badges check-group__bottom badge-section";
    for (const [label, kind] of row.badges) {
      const badge = document.createElement("span");
      badge.className = "filter-badge " + kind;
      badge.textContent = label;
      badge.title = FILTER_BADGE_HELP[label] || "";
      badges.append(badge);
    }
    if (active) {
      const badge = document.createElement("span");
      badge.className = "filter-badge active";
      badge.textContent = "Aktiv";
      badge.title = "Dieser Filter ist bereits in deiner Zielliste.";
      badges.prepend(badge);
    } else if (abgelaufen) {
      const badge = document.createElement("span");
      badge.className = "filter-badge open";
      badge.textContent = "Abgelaufen";
      badge.title = "Dieser Filter steht abgelaufen in deiner Zielliste. Mit „Filter erneuern“ lädst du ihn frisch.";
      badges.prepend(badge);
    }
    info.title = [
      row.rating ? "Rating " + row.rating : "",
      row.entry.position || "",
      row.entry.cardType || "",
      row.entry.rare ? "Selten" : "",
      "Verkauf ca. " + fmt(row.suggestion.verkaufspreis) + (row.suggestion.verkauf.quelle === "alter" ? " (nach Alter)" : ""),
      "Aktivität " + (activity === "unbekannt" ? "noch nicht messbar" : activity)
    ].filter(Boolean).join(" · ");
    // Die Trefferzahlen sind wie bei FST ein Chip hinter den Abzeichen. Kauf-,
    // Verkaufs- und Gewinnzeile (unsere Zusatzinfo) stehen gedaempft darunter.
    badges.append(quote);
    const detail = document.createElement("div");
    detail.className = "lf-detail";
    detail.append(trade, meta);
    info.append(badges);
    const price = document.createElement("div");
    price.className = "filter-price lf-row__price";
    price.textContent = fmt(row.suggestion.value);
    // Bei Abkuehlung zeigt FST beide Zahlen: die alte durchgestrichen daneben,
    // die neue in Warnfarbe (Z. 35345-35384).
    const kuehlAktiv = Boolean(row.abkuehlung && row.abkuehlung.aktiv);
    const scoreBox = document.createElement("span");
    scoreBox.className = "filter-score-box lf-row__score";
    if (kuehlAktiv && row.abzug > 0) {
      const alt = document.createElement("span");
      alt.className = "filter-score-alt lf-row__score-original";
      alt.textContent = wertungZahl(row.rohWertung);
      scoreBox.append(alt);
    }
    const score = document.createElement("span");
    score.className = "filter-score lf-row__score-current" + (kuehlAktiv ? " is-cooldown" : "");
    // Wertung wie bei FST als Zahl mit einer Nachkommastelle (8,4 statt 84).
    score.textContent = wertungZahl(row.score);
    score.title = wertungText(row.score, row.teile);
    scoreBox.append(score);

    // Was der Filter in einer Stunde ungefaehr einbringt (27.09.2026).
    //
    // In FSTs Hilfe steht unter der Wertung "Erwarteter Profit aus einer
    // Stunde Suche" - aber angezeigt wird trotzdem nur eine Skala von 0 bis
    // 9,9. Eine Coin-Zahl sagt mehr: "Wertung 7,1" ist abstrakt, "rund
    // 2.400 Coins in der Stunde" nicht.
    //
    // Steht nur da, wenn es eigene Laeufe gibt. Ohne gemessene Trefferquote
    // waere die Zahl geraten, und geratene Coin-Zahlen glaubt man.
    const proStunde = gewinnProStunde(row.stats, row.suggestion, (letzterStatus && letzterStatus.usage) || null);
    if (proStunde > 0) {
      const std = document.createElement("span");
      std.className = "filter-pro-stunde";
      std.textContent = "≈ " + fmt(proStunde) + " / Std.";
      std.title = "Grobe Schätzung aus deinen eigenen Läufen: " +
        row.stats.hitRate.toFixed(1).replace(".", ",") + " Treffer je 100 Suchen, " +
        fmt(row.suggestion.expectedProfit) + " Coins Gewinn je Karte, gerechnet mit den Suchen, " +
        "die in einer Stunde wirklich möglich sind. Der Markt ändert sich – die Zahl ist ein Anhaltspunkt, keine Zusage.";
      // Die Spalte "Wertung" ist nur 60 px breit (FST: 1fr 90px 60px) - die
      // Coin-Schaetzung steht deshalb in der gedaempften Zeile unten.
      detail.append(std);
    }

    // Fusszeile: nur wenn es etwas zu zeigen gibt (FST Z. 35498-35500).
    if (kuehlAktiv || row.fuerDich) {
      const fuss = document.createElement("div");
      fuss.className = "filter-row-footer lf-row-footer";
      if (kuehlAktiv) {
        const kuehl = document.createElement("span");
        kuehl.className = "filter-badge cool cooldown-badge";
        kuehl.title = "Dieser Filter lief gerade erst. Zu deiner Sicherheit steht er vorübergehend weiter hinten. Wähle " +
          row.abkuehlung.nochFilter + " andere Filter, dann ist die Abkühlung weg.";
        const text = document.createElement("span");
        // ACHTUNG: als ZAHL rechnen. wertungZahl gibt Text mit Komma zurück -
        // Text minus Text wäre NaN.
        text.textContent = "Abkühlung ↓ " + wertungZahl(row.abzug);
        kuehl.append(text);
        if (row.abkuehlung.nochFilter > 0) {
          const rest = document.createElement("span");
          rest.className = "cooldown-rest";
          rest.textContent = " · noch " + row.abkuehlung.nochFilter +
            (row.abkuehlung.nochFilter === 1 ? " Filter" : " Filter");
          kuehl.append(rest);
          const dots = document.createElement("span");
          dots.className = "cooldown-dots";
          for (let i = 1; i <= ABKUEHL_FILTER; i++) {
            const dot = document.createElement("i");
            if (i <= ABKUEHL_FILTER - row.abkuehlung.nochFilter) dot.className = "is-filled";
            dots.append(dot);
          }
          kuehl.append(dots);
        }
        fuss.append(kuehl);
      }
      if (row.fuerDich) {
        const fresh = document.createElement("span");
        fresh.className = "filter-badge under featured-badge";
        // 27.09.2026: Unter der Grenze ist es nur die beste von schwachen
        // Zeilen. "Für dich" waere dort zu viel versprochen, deshalb steht
        // dann "Beste dieser Liste" - und der Grund bleibt weg.
        const titel = row.fuerDichStark ? "Für dich" : "Beste dieser Liste";
        // Zwei Teile wie FST (featured-badge__label / __reason): Titel fett, Grund duenner.
        const titelText = document.createElement("span");
        titelText.className = "featured-badge__label";
        titelText.textContent = titel;
        fresh.append(titelText);
        if (row.fuerDichStark && row.fuerDichGrund) {
          const grund = document.createElement("span");
          grund.className = "featured-badge__reason";
          grund.textContent = " · " + row.fuerDichGrund;
          fresh.append(grund);
        }
        fresh.title = row.fuerDichStark
          ? "Die beste Zeile dieser Liste – Wertung " + wertungZahl(row.score) + " von 10. " +
            "Eine Einschätzung aus deinen eigenen Messungen, keine gemessene Trefferchance."
          : "Die beste Zeile dieser Liste – aber nur Wertung " + wertungZahl(row.score) + " von 10, " +
            "also unter " + FUER_DICH_TEXT + ". Ein Vorschlag, keine Empfehlung: Prüfe den Preis frisch, " +
            "bevor du startest.";
        fuss.append(fresh);
      }
      info.append(fuss);
    }
    if (row.fuerDich) card.classList.add("featured");
    if (kuehlAktiv) card.classList.add("has-cooldown");
    // Aufbau wie FSTs Zeile: Name | Preis | Wertung, darunter die Abzeichen.
    // Das Spielerbild gibt es hier nicht mehr (FST zeigt keins; spart 40 Bildabrufe).
    const zeile = document.createElement("div");
    zeile.className = "lf-row";
    zeile.append(name, price, scoreBox);
    info.prepend(zeile);
    info.append(detail);
    card.append(radio, info);
    return card;
  }));
}

// Kaufpreis im Filter-Dialog. Grundlage ist derselbe Vorschlag wie auf der
// Filterkarte (suggestionFor: Abschlag, Sicherheitsaufschlag, EA-Spanne).
// Vorher rechnete der Dialog nur Verkaufspreis minus Gewinn und lud dadurch
// einen hoeheren Kaufpreis, als die Karte zeigte.
// - Normal + Gewinn wie in den Optionen: genau der Kartenpreis.
// - Schnell/Geduldig: verschiebt den Preis um den Unterschied im Erloes.
// - Mehr Gewinn senkt den Preis; weniger Gewinn hebt ihn nie ueber die Karte.
// - EA-Minimum/-Maximum wie in suggestionFor.
function modalFilterValues() {
  if (!modalFilterRow) return null;
  const row = modalFilterRow;
  const entry = row.entry;
  const base = suggestionFor(entry);
  const prices = sellingPrices(entry, null);
  // Normal ist der Verkaufspreis aus suggestionFor, den auch die Karte zeigt -
  // also Marktpreis oder der Preis nach Alter (F1). Mit entry.market waere der
  // Abschlag nach Alter im Modus Normal wieder weg.
  const salePrice = modalSaleMode === "safe" ? prices.safe : modalSaleMode === "lazy" ? prices.lazy : base.verkaufspreis;
  const saleNet = Math.floor(salePrice * (1 - SALE_FEE));
  const input = Math.max(0, Number($("fm-profit-value").value) || 0);
  const wantedProfit = modalProfitMode === "percent" ? Math.floor(salePrice * input / 100) : modalProfitMode === "coins" ? Math.floor(input) : intelligentProfit(entry);
  const shift = saleNet - base.saleNet; // Zu- oder Abschlag durch den Verkaufsmodus
  const verschoben = shift ? roundDownToStep(base.value + shift) : base.value;
  let maxPrice = Math.max(0, Math.min(verschoben, roundDownToStep(saleNet - wantedProfit)));
  // Dieselbe Bremse wie in suggestionFor (24.09.2026): nie ueber dem
  // gemessenen Marktpreis. suggestionFor deckelt zwar base.value, aber der
  // Verkaufsmodus "Geduldig" rechnet oben einen Aufschlag drauf (shift) -
  // und der hob den Kaufpreis wieder ueber den Markt. Genau dieser Weg wird
  // benutzt, wenn man einen Live-Filter aktiviert.
  //
  // Vor den EA-Grenzen: EAs Mindestpreis ist ein harter Boden und darf
  // weiterhin anheben.
  if (Number(entry.market) > 0) maxPrice = Math.min(maxPrice, roundDownToStep(entry.market));
  if (entry.eaMin && maxPrice < entry.eaMin) maxPrice = entry.eaMin;
  if (entry.eaMax && maxPrice > entry.eaMax) maxPrice = entry.eaMax;
  return { salePrice, saleNet, wantedProfit, maxPrice, expectedProfit: maxPrice > 0 ? saleNet - maxPrice : 0 };
}

function renderFilterModal() {
  const row = modalFilterRow;
  if (!row) return;
  for (const button of WURZEL.querySelectorAll("#fm-sale-mode button")) button.classList.toggle("active", button.dataset.mode === modalSaleMode);
  for (const button of WURZEL.querySelectorAll("#fm-profit-mode button")) button.classList.toggle("active", button.dataset.mode === modalProfitMode);
  $("fm-profit-value").disabled = modalProfitMode === "auto";
  // Bei Auto zaehlt das Feld nicht - ein graues "300" neben "Auto waehlt 2.000"
  // verwirrt nur. Der Wert steht dann im Satz darunter.
  $("fm-profit-value").closest(".modal-number").hidden = modalProfitMode === "auto";
  const values = modalFilterValues();
  const risk = modalSaleMode === "safe" ? "low" : modalSaleMode === "lazy" ? "high" : "mid";
  $("fm-risk").className = "modal-risk " + risk;
  $("fm-risk").textContent = risk === "low" ? "niedriges Risiko" : risk === "high" ? "höheres Risiko" : "mittleres Risiko";
  $("fm-buy").textContent = fmt(values.maxPrice);
  $("fm-sell").textContent = fmt(values.salePrice);
  $("fm-gain").textContent = (values.expectedProfit > 0 ? "+" : "") + fmt(values.expectedProfit);
  // Lange Zahlen (teure Karten) bekommen eine kleinere Schrift, sonst ragt die
  // Kachel aus dem Dialog. Nur Darstellung - die Zahl selbst bleibt gleich.
  for (const id of ["fm-buy", "fm-sell", "fm-gain"]) {
    const laenge = $(id).textContent.length;
    $(id).dataset.laenge = laenge > 10 ? "lang" : laenge > 8 ? "mittel" : "";
  }
  // Die Kachel ist nur bei einem echten Gewinn gruen: bei 0 grau, im Minus rot.
  $("fm-gain").parentElement.dataset.vorzeichen = values.expectedProfit > 0 ? "plus" : values.expectedProfit < 0 ? "minus" : "null";
  $("fm-sale-help").textContent = "Nach 5 % EA-Gebühr bleiben " + fmt(values.saleNet) + ".";
  $("fm-profit-help").textContent = modalProfitMode === "auto"
    ? "Auto-Gewinn: " + fmt(values.wantedProfit) + "."
    : "Mindestgewinn: " + fmt(values.wantedProfit) + ".";
  const warnings = [];
  if (row.entry.confidence === "niedrig") warnings.push("Preis ist noch unsicher.");
  if (row.entry.preisGeprueft === false) warnings.push("Der Scan hat nicht zu Ende geprüft, ob es billigere Angebote gibt.");
  // Der Abstand zaehlt fuer den Preis, der wirklich geladen wird - der haengt
  // hier auch von Verkauf und Gewinn im Dialog ab.
  const abstand = abstandWarnung(values.maxPrice, row.entry.lowest);
  if (abstand) warnings.push(abstand);
  // Ab 15 Min. ist der Filter weg, nicht "bald" weg - frueher stand auch dann
  // noch "läuft bald ab", und "Prüfen & laden" war ohne Grund grau.
  const filterAlter = Date.now() - row.entry.t;
  if (filterAlter >= 15 * 60000) warnings.push(fstAn() ? "Der Preis ist älter als 15 Minuten." : "Filter abgelaufen – bitte neu scannen.");
  else if (filterAlter > 10 * 60000) warnings.push("Filter läuft bald ab.");
  if (values.expectedProfit < 200) warnings.push("Gewinn ist sehr klein.");
  if (modalSaleMode === "lazy" && gemesseneAktivitaet(row.entry) === "ruhig") warnings.push("Geduldig kann in diesem ruhigen Markt lange brauchen.");
  const ausnahme = ausnahmeWarnung(lastRes && lastRes.status);
  if (ausnahme) warnings.push(ausnahme);
  $("fm-safety-box").className = "fm-safety " + (warnings.length ? "warn" : "ok");
  // Gleiche Worte und gleiche Pille wie im Start-Dialog (startSafetyInfo).
  $("fm-safety").textContent = warnings.length ? (warnings.length === 1 ? "1 Warnung" : warnings.length + " Warnungen") : "Keine Warnungen";
  $("fm-safety").className = warnings.length ? "safety-warn" : "safety-ok";
  // Jede Warnung eine eigene Karte (FST .safety-warning): so liest man sie einzeln.
  $("fm-warnings").replaceChildren(...(warnings.length ? warnings : ["Zu diesem Filter gibt es keine Warnungen."]).map((text) => {
    const karte = document.createElement("p");
    karte.className = "fm-warnung" + (warnings.length ? " warn" : "");
    karte.textContent = text;
    return karte;
  }));
  // Eine Warnung darf nicht hinter einem zugeklappten Kasten stehen. Zuklappen
  // bleibt Sache des Nutzers (sicherheitsKastenWunsch).
  const fmKasten = $("fm-safety-wrap");
  if (fmKasten && warnings.length) fmKasten.open = true;
  sicherheitsKastenWunsch(fmKasten, warnings);
  // Frischer Preis-Check mit echten Aenderungen: alt -> neu und die Gruende.
  const rueckfrage = offeneRueckfrage();
  $("fm-frisch").hidden = !rueckfrage;
  if (rueckfrage) {
    const kopf = document.createElement("b");
    kopf.textContent = "Nicht geladen – die frischen Zahlen:";
    const vergleich = document.createElement("span");
    vergleich.textContent = frischVergleichText(rueckfrage.alt, rueckfrage.neu);
    const gruende = document.createElement("span");
    // Steht der Abstand oben schon als Warnung, nicht ein zweites Mal - der
    // Dialog ist auf dem Handy so schon lang genug.
    const doppelt = abstand ? abstandGrund(rueckfrage.neu) : "";
    gruende.textContent = rueckfrage.gruende.filter((grund) => grund !== doppelt).join(" ");
    $("fm-frisch").replaceChildren(kopf, " ", vergleich, " ", gruende);
  }
  renderFmStart();
}

// "Laden & starten" ist ein Start wie jeder andere - also gilt dieselbe
// Sperre. Nur laden (ohne Sofort-Start) bleibt erlaubt. Der Grund steht in
// der Fortschrittszeile; die gehoert aber auch Fehlern und dem Fortschritt,
// deshalb wird nur ueberschrieben, was vorher selbst dort stand.
// fmSperreText ist genau dieser eigene Text: die Sperre oder der Satz zur
// Rueckfrage (rueckfrageZeile).
let fmSperreText = "";

function renderFmStart() {
  const row = modalFilterRow;
  if (!row) return;
  // Nach der Rueckfrage laedt der Haupt-Knopf die frischen Zahlen - ohne
  // neuen Preis-Check und nie mit Sofort-Start. Beide Haken sind dann aus.
  const rueckfrage = Boolean(offeneRueckfrage());
  if (rueckfrage) $("fm-auto-start").checked = false;
  $("fm-auto-start").disabled = filterLoadBusy || rueckfrage;
  $("fm-auto-pricing").disabled = filterLoadBusy || rueckfrage;
  const sofort = $("fm-auto-start").checked;
  const sperre = sofort ? aktuelleSperre() : "";
  $("fm-start").textContent = rueckfrage ? "Trotzdem laden" : sofort ? "Laden & starten" : "Prüfen & laden";
  // FST-Modus (Punkt 3): Ein alter Scan sperrt das Laden nicht - FST misst bei jedem Lauf neu.
  $("fm-start").disabled = filterLoadBusy || (!fstAn() && Date.now() >= row.entry.t + 15 * 60000) || Boolean(sperre);
  const zeile = $("fm-progress");
  // Waehrend der Rueckfrage sagt die Zeile, was "Trotzdem laden" tut - bei
  // jedem Neuzeichnen neu aus den Werten im Dialog. Frueher wurde der Satz
  // einmal gesetzt: "nicht erreichbar" blieb stehen, obwohl ein anderer
  // Gewinn wieder reichte und "Trotzdem laden" doch lud.
  const abgelaufen = !fstAn() && Date.now() >= row.entry.t + 15 * 60000;
  const eigen = (abgelaufen ? "Dieser Filter ist abgelaufen. Unter „Filter“ neu scannen." : "") || sperre || (rueckfrage ? rueckfrageZeile() : "");
  if (!filterLoadBusy && (!zeile.textContent || zeile.textContent === fmSperreText)) zeile.textContent = eigen;
  fmSperreText = eigen;
}

// Der Satz unter "Trotzdem laden". Dieselbe Bedingung wie beim Laden in
// activateModalFilter - sonst verspricht die Zeile, was der Knopf nicht tut.
function rueckfrageZeile() {
  const values = modalFilterValues();
  if (values && values.maxPrice > 0 && values.expectedProfit >= values.wantedProfit) {
    return "„Trotzdem laden“ lädt den Filter mit den frischen Zahlen – ohne Sofort-Start.";
  }
  // Im Dialog heisst der Wert bei Auto "Auto-Gewinn" - so auch hier.
  return "Mit den frischen Zahlen ist " + (modalProfitMode === "auto" ? "der Auto-Gewinn" : "der Mindestgewinn") +
    " nicht erreichbar. Ändere Verkauf oder Gewinn – oder schließe den Dialog.";
}

function openFilterModal(row) {
  focusBeforeModal = WURZEL.activeElement;
  modalFilterRow = row;
  modalSaleMode = "normal";
  // Gewinn wie in den Optionen - dann zeigt der Dialog denselben Kaufpreis
  // wie die Filterkarte.
  modalProfitMode = $("smartProfit").checked ? "auto" : "coins";
  $("fm-profit-value").value = String(minProfitValue());
  $("fm-player").textContent = row.player.name + (row.rating ? " · Rating " + row.rating : "");
  $("fm-portrait").replaceChildren(portrait(row.player.id, row.player.name, true));
  $("filter-modal-wrap").hidden = false;
  nachObenScrollen();
  $("fm-progress").textContent = "";
  $("fm-auto-start").checked = false;
  $("fm-auto-pricing").checked = true;
  filterRueckfrage = null; // eine Rueckfrage gilt nur im Dialog, in dem sie kam
  sicherheitsKastenNeu($("fm-safety-wrap"));
  renderFilterModal(); // setzt auch Text und Sperre von "Prüfen & laden"
}

// Merkt sich, von wo ein Dialog geoeffnet wurde, damit der Fokus danach wieder
// dort landet statt am Anfang des Popups.
let focusBeforeModal = null;

function restoreFocus() {
  const target = focusBeforeModal;
  focusBeforeModal = null;
  if (target && target.isConnected && !target.disabled) target.focus();
}

function closeFilterModal() {
  filterLoadToken += 1;
  cancelFilterPriceCheck();
  $("filter-modal-wrap").hidden = true;
  modalFilterRow = null;
  filterRueckfrage = null;
  restoreFocus();
}

let filterLoadToken = 0;
let filterLoadBusy = false;
let filterPriceCheckToken = null;

// Frischer Preis-Check mit echten Aenderungen: { key, alt, neu, gruende }.
// Solange sie steht, laedt der Dialog nur auf ausdruecklichen Wunsch.
let filterRueckfrage = null;

function offeneRueckfrage() {
  return filterRueckfrage && modalFilterRow && filterRueckfrage.key === modalFilterRow.key ? filterRueckfrage : null;
}

// Warum der Dialog nach dem frischen Preis-Check nachfragt, statt zu laden.
// Leer = alles in Ordnung. alt ist, was Karte und Dialog vor dem Klick
// zeigten, neu dasselbe mit den frischen Zahlen:
// { market, kauf, gewinn, mindest, score, lowest, confidence, gewinnArt }.
// gewinnArt ist der Gewinn-Modus im Dialog ("auto", "percent", "coins").
// Live gesehen (Berardi, 22.09.): Scan 850, frisch 650 - geladen wurde
// trotzdem still, mit der alten Wertung.
// Nur ECHTE Aenderungen zaehlen. Bis 22.09. fragte der Dialog auch bei
// "Wertung unter 60" und bei 2 Stufen Abstand zum billigsten Angebot - das
// ist fast jeder Live-Filter (Gordon: alle Zahlen gleich, Wertung 12 -> 12,
// trotzdem "Nicht geladen"). Beides sah man schon vor dem Klick auf Karte
// und im Dialog. Eine Warnung, die immer kommt, klickt man blind weg.
function frischeGruende(alt, neu) {
  const gruende = [];
  // a) Marktpreis um mehr als 10 % gefallen.
  if (alt.market > 0 && neu.market < alt.market * 0.9) {
    // Ausgeloest wird erst bei mehr als 10 %. Gerundet stuende bei 10,4 %
    // "um 10 %" da - das passt nicht zur Regel.
    const prozent = Math.round((1 - neu.market / alt.market) * 100);
    gruende.push("Der Marktpreis ist um " + (prozent > 10 ? prozent + " %" : "mehr als 10 %") + " gefallen.");
  }
  // b) Kaufpreis um mindestens eine Stufe anders. Hoch wie runter: hoeher
  // heisst mehr bezahlen, tiefer heisst seltener ein Treffer.
  if (alt.kauf > 0 && neu.kauf > 0 && neu.kauf !== alt.kauf) {
    const stufen = stufenZwischen(alt.kauf, neu.kauf);
    if (stufen >= 1) {
      gruende.push("Der Kaufpreis ist um " + stufen + (stufen === 1 ? " Stufe " : " Stufen ") +
        (neu.kauf > alt.kauf ? "gestiegen." : "gesunken."));
    }
  }
  // c) Gewinn unter den Mindestgewinn gerutscht oder um mehr als 25 %
  // kleiner. Lag er schon vorher darunter, ist das keine Aenderung.
  if (neu.gewinn < neu.mindest && !(alt.gewinn < alt.mindest)) {
    // Bei Auto ist mindest der Auto-Gewinn, nicht der Mindestgewinn aus den
    // Optionen - "deinem Mindestgewinn (150)" passte nicht zu eingestellten 200.
    const wunsch = neu.gewinnArt === "auto" ? "dem Auto-Gewinn" : "deinem Mindestgewinn";
    gruende.push("Der Gewinn liegt jetzt unter " + wunsch + " (" + fmt(neu.mindest) + ").");
  } else if (alt.gewinn > 0 && neu.gewinn < alt.gewinn * 0.75) {
    // Wie beim Marktpreis: gerundet nie "um 25 %", wenn es mehr war.
    const prozent = Math.round((1 - neu.gewinn / alt.gewinn) * 100);
    gruende.push("Der Gewinn ist um " + (prozent > 25 ? prozent + " %" : "mehr als 25 %") + " gesunken.");
  }
  // d) Preis-Sicherheit schlechter. Unbekannt (alte Eintraege) zaehlt nicht:
  // Dann weiss man nicht, ob es schlechter wurde.
  const sicherheitVorher = SICHERHEIT_RANG.indexOf(alt.confidence);
  const sicherheitJetzt = SICHERHEIT_RANG.indexOf(neu.confidence);
  if (sicherheitVorher >= 0 && sicherheitJetzt >= 0 && sicherheitJetzt < sicherheitVorher) {
    gruende.push("Die Preis-Sicherheit ist gesunken: " + alt.confidence + " → " + neu.confidence + ".");
  }
  // e) Abstand Kaufpreis -> billigstes Angebot um mindestens eine Stufe
  // groesser. Ein Abstand, der schon vorher so war, stand als Warnung im
  // Dialog. War vorher kein billigstes Angebot bekannt, stand dort auch keine
  // Warnung - dann zaehlt ein weiter Abstand wie eine neue Warnung.
  const abstandVorher = stufenUnterAngebot(alt.kauf, alt.lowest);
  const abstandJetzt = stufenUnterAngebot(neu.kauf, neu.lowest);
  if (abstandVorher === null) {
    const abstand = abstandGrund(neu);
    if (abstand) gruende.push(abstand);
  } else if (abstandJetzt !== null && abstandJetzt > abstandVorher) {
    gruende.push("Der Abstand zum billigsten Angebot ist größer geworden: jetzt " + abstandJetzt +
      (abstandJetzt === 1 ? " Stufe" : " Stufen") + ", vorher " + abstandVorher + ".");
  }
  // f) Wertung um mehr als 10 Punkte gefallen. Eine niedrige Wertung allein
  // ist kein Grund - sie stand schon vor dem Klick auf der Karte.
  // Rutscht sie aber erst jetzt unter 60, ist das neu: Vorher durfte der
  // Filter sofort starten (und die Karte zeigte "Für dich"), jetzt nicht mehr.
  // Das zaehlt auch bei weniger als 10 Punkten (z. B. 60 -> 58).
  const jetztUnter = Number(alt.score) >= FUER_DICH_AB && !(Number(neu.score) >= FUER_DICH_AB);
  if (Number(alt.score) - Number(neu.score) > 10) {
    const punkte = Math.round(alt.score) - Math.round(neu.score);
    gruende.push("Die Wertung ist um " + (punkte > 10 ? punkte : "mehr als 10") + " Punkte gefallen" +
      (jetztUnter ? " – jetzt unter " + FUER_DICH_TEXT + "." : "."));
  } else if (jetztUnter) {
    // Ohne Zahlen: gerundet stuende bei 60,2 -> 59,6 "60 -> 60" da. Die
    // Zahlen stehen ohnehin im Vergleich darueber.
    gruende.push("Die Wertung ist unter " + FUER_DICH_TEXT + " gefallen.");
  }
  return gruende;
}

// Preis-Sicherheit von schlecht nach gut - nur fuer den Vergleich in d).
const SICHERHEIT_RANG = ["niedrig", "mittel", "hoch"];

// Ganze Preisstufen zwischen zwei Preisen, auf derselben Leiter wie beim
// Kauf. Kaufpreise liegen auf der Leiter - jede Aenderung ist also
// mindestens eine Stufe. Ein Rest unter einer Stufe (z. B. am EA-Minimum)
// zaehlt nicht. Die 99 schuetzt nur vor einer kaputten Leiter (Stufe 0).
function stufenZwischen(a, b) {
  const oben = Math.max(a, b);
  let preis = Math.min(a, b);
  let stufen = 0;
  while (stufen < 99 && preis + Math.max(1, stepFor(preis)) <= oben) {
    preis += Math.max(1, stepFor(preis));
    stufen += 1;
  }
  return stufen;
}

// Weiter Abstand zum billigsten Angebot als Grund der Rueckfrage - nur noch,
// wenn vorher kein billigstes Angebot bekannt war (siehe e). Eigene Funktion,
// damit der Dialog ihn weglassen kann, wenn dieselbe Warnung schon oben
// steht. Dieselbe Grenze wie abstandWarnung: 2 Stufen bei hoechstens 3 %
// gelten als nah.
function abstandGrund(neu) {
  const stufen = stufenUnterAngebot(neu.kauf, neu.lowest);
  return stufen !== null && stufen >= ABSTAND_WARNUNG_AB && !nahAmAngebot(neu.kauf, neu.lowest)
    ? "Der Kaufpreis liegt " + stufen + " Stufen unter dem billigsten Angebot." : "";
}

function frischVergleichText(alt, neu) {
  const gewinn = (n) => (n > 0 ? "+" : "") + fmt(n);
  return "Marktpreis " + fmt(alt.market) + " → " + fmt(neu.market) +
    " · Kaufpreis " + fmt(alt.kauf) + " → " + fmt(neu.kauf) +
    " · Gewinn " + gewinn(alt.gewinn) + " → " + gewinn(neu.gewinn) +
    " · Wertung " + Math.round(alt.score) + " → " + Math.round(neu.score) + ".";
}

// Meldung nach dem Laden ohne Rueckfrage: Die frische Pruefung hat die Zahlen
// bestaetigt. Ohne sie wirkte das Laden still - man wuesste nicht, ob
// ueberhaupt geprueft wurde. Kleine Aenderungen (unter den Grenzen der
// Rueckfrage) stehen dabei, damit "bestaetigt" nicht mehr verspricht.
function frischBestaetigtText(alt, neu) {
  const gewinn = (n) => (n > 0 ? "+" : "") + fmt(n);
  const aenderungen = [
    ["Marktpreis", alt.market, neu.market, fmt],
    ["Kaufpreis", alt.kauf, neu.kauf, fmt],
    ["Gewinn", alt.gewinn, neu.gewinn, gewinn],
    ["Wertung", Math.round(alt.score), Math.round(neu.score), String]
  ].filter(([, vorher, jetzt]) => vorher !== jetzt)
    .map(([name, vorher, jetzt, zeigen]) => name + " " + zeigen(vorher) + " → " + zeigen(jetzt));
  return aenderungen.length
    ? "Frisch geprüft: " + aenderungen.join(", ") + " – geladen."
    : "Frisch geprüft: Zahlen unverändert – geladen.";
}

// Meldung nach dem Laden aus dem Filter-Dialog: eine Zeile ganz oben im
// Reiter Snipen - dorthin springt das Menue nach dem Laden, und sie steht
// ueber Auto, Manuell und dem Laufbildschirm. Vorher stand sie im Hinweis
// unter der Zielliste: nur in Manuell > Schritt 3 zu sehen, und der naechste
// Poll zeichnete den Hinweis neu und loeschte sie. Hier bleibt sie
// SNIPE_NOTIZ_MS stehen; render() (Poll alle 1,5 s) blendet sie danach aus.
const SNIPE_NOTIZ_MS = 20000;
let snipeNotiz = null; // { text, level, bis }

function zeigeSnipeNotiz(text, level) {
  snipeNotiz = text ? { text, level: level || "ok", bis: Date.now() + SNIPE_NOTIZ_MS } : null;
  renderSnipeNotiz();
}

function renderSnipeNotiz() {
  const zeile = $("snipe-notiz");
  if (!zeile) return;
  if (snipeNotiz && Date.now() >= snipeNotiz.bis) snipeNotiz = null;
  zeile.hidden = !snipeNotiz;
  zeile.className = "hint snipe-notiz" + (snipeNotiz ? " " + snipeNotiz.level : "");
  zeile.textContent = snipeNotiz ? snipeNotiz.text : "";
}

// Warum "Sofort starten" nicht ausgefuehrt wird - getrennt von der
// Rueckfrage. null = Start erlaubt. fehler: ohne frischen Preis-Check, dann
// wird wie bei jeder Start-Sperre gar nicht geladen (der Rat "frisch
// pruefen" kostet nichts extra). notiz: nach dem frischen Check, dann wird
// ohne Start geladen - sonst liefe bei jedem weiteren Klick ein neuer
// Preis-Check mit neuen EA-Suchen (siehe activateModalFilter).
//
// FST-Modus (Punkt 10): FSTs Startknopf wird nie gesperrt. Dort sind "unsicher",
// "ungeprueft" und "Wertung unter 60" nur eine gelbe Warnung
// (sofortStartWarnung) - ausser der Haken "Gewinn-Bremse" ist gesetzt, dann
// gilt es wie im strengen Modus. Das Budget unter dem Zielpreis bleibt eine
// Sperre: Der Motor lehnt den Start dann selbst ab.
// Wie fstAn(), faellt aber nicht um, wo es fehlt (Tests laden nur diesen Abschnitt).
function fstImDialog() {
  return typeof fstAn === "function" && fstAn();
}

function sofortStartWeich() {
  return fstImDialog() && !($("gewinnBremse") && $("gewinnBremse").checked);
}

function sofortStartWarnung(row) {
  if (!sofortStartWeich()) return "";
  const teile = [];
  if (row.entry.confidence === "niedrig") teile.push("Der Preis ist noch unsicher.");
  if (row.entry.preisGeprueft === false) teile.push("Der Preis ist ungeprüft.");
  if (!(Number(row.rohWertung != null ? row.rohWertung : row.score) >= FUER_DICH_AB)) teile.push("Die Wertung liegt unter " + FUER_DICH_TEXT + ".");
  return teile.join(" ");
}

function sofortStartSperre(row, values) {
  const weich = sofortStartWeich();
  if (!weich && row.entry.confidence === "niedrig") {
    return { fehler: "Preis noch unsicher. Sofort starten wurde nicht ausgeführt.", notiz: "Der Preis ist noch unsicher." };
  }
  // "Ungeprüft" greift nur ohne frischen Check: Der nimmt preisGeprueft weg.
  if (!weich && row.entry.preisGeprueft === false) {
    return {
      fehler: "Preis ist ungeprüft. Sofort starten wurde nicht ausgeführt. Prüfe den Preis frisch oder lade ohne Sofort-Start.",
      notiz: "Der Preis ist ungeprüft."
    };
  }
  // Seit 22.09. fragt der Dialog bei "Wertung unter 60" nicht mehr nach, wenn
  // sie schon vor dem Klick so war. Sofort starten darf so ein Filter trotzdem nicht.
  if (!weich && !(Number(row.rohWertung != null ? row.rohWertung : row.score) >= FUER_DICH_AB)) {
    return {
      fehler: "Wertung unter " + FUER_DICH_TEXT + ". Sofort starten wurde nicht ausgeführt. Prüfe den Preis frisch oder lade ohne Sofort-Start.",
      notiz: "Die Wertung liegt unter " + FUER_DICH_TEXT + "."
    };
  }
  // Leeres Budget-Feld = ohne Grenze (28.09.2026): dann blockt hier nichts,
  // der Motor prueft beim Start gegen den echten Kontostand.
  if (!budgetOhneGrenze() && Number($("budget").value) < values.maxPrice) {
    return {
      fehler: "Dein Budget reicht für diesen Filter nicht. Passe es unter Snipen › Manuell › Schritt 4 (Budget) an.",
      notiz: "Dein Budget reicht nicht – passe es unter Snipen › Manuell › Schritt 4 (Budget) an."
    };
  }
  return null;
}

// Karte in der Liste mit den frischen Zahlen zeichnen. Nur im Speicher:
// Nach dem naechsten Laden aus dem Speicher holt liveFilterRows sie ohnehin
// aus dem Preisverlauf (frischsterEintrag).
function filterKarteAuffrischen(key, entry) {
  const liste = liveMarket && Array.isArray(liveMarket.list) ? liveMarket.list : [];
  const i = liste.findIndex((e) => e && (e.key || (e.playerId + ":" + (e.rating || 0))) === key);
  if (i >= 0) liste[i] = entry;
  renderLiveFilters();
}

function cancelFilterPriceCheck() {
  const token = filterPriceCheckToken;
  filterPriceCheckToken = null;
  if (token != null) send("cancelPriceCheck", { token }).catch(() => {});
}

// Startet eine Preispruefung und wartet, bis ein frischer Eintrag vorliegt.
// Benutzt vom Filter-Dialog und vor einem manuellen Start - damit beide Wege
// dieselbe Vorstellung davon haben, was "frisch" und "verlaesslich" heisst.
// Gibt null zurueck, wenn der Vorgang unterwegs abgebrochen wurde.
// rarity MUSS mitgegeben werden (24.09.2026). Der Bot legt das Ergebnis
// unter priceKey(playerId, rating, rarity) ab. Ohne die Kartenart landet es
// unter "204935:87", gesucht wird es aber unter "204935:87:3" - der Check
// laeuft dann komplett durch, verbraucht bis zu 15 EA-Suchen, und der
// Filter wird trotzdem nicht geladen.
async function awaitFreshPrice(player, rating, key, onProgress, isCancelled, rarity) {
  const startedAt = Date.now();
  const abgebrochen = () => Boolean(isCancelled && isCancelled());
  // rarityWert statt Number (28.09.2026): Number("12,70") waere NaN und wuerde
  // zu -1 ("jede Art"). Gemessen wuerde dann ueber alle Versionen des Spielers,
  // und der Eintrag laege unter "id:rating" statt "id:rating:12,70" - genau das
  // Auseinanderlaufen der Schluessel, vor dem der Kommentar oben warnt.
  const art = rarityWert(rarity);
  const response = await send("priceCheck", { player: { playerId: player.id, playerName: player.name, rating, rarity: art } });
  if (!response.ok) throw new Error(response.error || "Preisprüfung konnte nicht starten.");
  filterPriceCheckToken = response.status?.check?.token ?? null;
  if (abgebrochen()) {
    cancelFilterPriceCheck();
    return null;
  }
  while (Date.now() - startedAt < 180000) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (abgebrochen()) return null;
    const result = await send("status");
    if (!result.ok || !result.status) throw new Error(result.error || "Verbindung verloren.");
    const check = result.status.check || {};
    if (onProgress) onProgress(check.searches || 0);
    if (check.running) continue;
    filterPriceCheckToken = null;
    if (check.error) throw new Error(check.error);
    const stored = await chrome.storage.local.get("priceHistory");
    const entries = stored.priceHistory && stored.priceHistory[key];
    const entry = Array.isArray(entries) ? entries[entries.length - 1] : null;
    // Ein Eintrag von vor dem Start waere ein alter Wert, kein Ergebnis.
    if (!entry || entry.t < startedAt || !(entry.market > 0)) throw new Error("Kein frischer verlässlicher Preis gefunden.");
    return entry;
  }
  throw new Error("Preisprüfung dauert zu lange. Bitte erneut prüfen.");
}

async function activateModalFilter(configure) {
  if (!modalFilterRow || filterLoadBusy) return;
  const row = modalFilterRow;
  // Zweiter Klick nach der Rueckfrage ("Trotzdem laden"): mit den frischen
  // Zahlen laden - ohne neuen Preis-Check und nie mit Sofort-Start.
  const bestaetigt = Boolean(offeneRueckfrage());
  const autoStart = !configure && !bestaetigt && $("fm-auto-start").checked;
  // Sofort-Start trotz Sperre: gar nicht erst Preis pruefen und laden. Der
  // Knopf ist dann ohnehin grau, den Grund zeigt renderFmStart.
  if (autoStart && aktuelleSperre()) return;
  const token = ++filterLoadToken;
  filterLoadBusy = true;
  const controls = [...WURZEL.querySelectorAll("#filter-modal-wrap input, #filter-modal-wrap button")].filter(el => el.id !== "fm-close");
  const wasDisabled = controls.map(el => el.disabled);
  const autoPricing = !bestaetigt && $("fm-auto-pricing").checked;
  controls.forEach(el => { el.disabled = true; });
  // Meldung fuer die Zielliste, wenn der frische Check die Zahlen bestaetigt.
  let frischNotiz = "";
  try {
    if (!fstImDialog() && Date.now() >= row.entry.t + 15 * 60000) throw new Error("Dieser Filter ist abgelaufen. Bitte einen frischen Filter auswählen.");
    if (!targets.some(item => targetKey(item) === row.key) && targets.length >= MAX_TARGETS) throw new Error("Die Zielliste ist voll. Entferne zuerst einen Spieler.");
    if (autoPricing) {
      $("fm-progress").textContent = "";
      renderLoader("fm-loader", checkLoaderOpts(0, "Kauf- und Verkaufspreis werden geprüft"));
      const entry = await awaitFreshPrice(
        row.player,
        row.rating,
        row.key,
        (searches) => { renderLoader("fm-loader", checkLoaderOpts(searches, "Kauf- und Verkaufspreis werden geprüft")); },
        () => token !== filterLoadToken,
        row.rarity
      );
      if (entry === null) return; // abgebrochen
      // Was Karte und Dialog vor dem Klick zeigten - daran misst sich, ob die
      // frischen Zahlen eine Rueckfrage wert sind (frischeGruende).
      const vorher = modalFilterValues();
      const alt = {
        market: row.entry.market, kauf: vorher ? vorher.maxPrice : 0, gewinn: vorher ? vorher.expectedProfit : 0,
        mindest: vorher ? vorher.wantedProfit : 0, score: Number(row.score) || 0,
        lowest: row.entry.lowest, confidence: row.entry.confidence
      };
      row.entry = mitPreisCheck(row.entry, entry);
      // Wertung mit den frischen Zahlen neu rechnen. Frueher bekam das Ziel
      // die alte Scan-Wertung, und die Karte zeigte weiter die Scan-Zahlen.
      row.suggestion = suggestionFor(row.entry);
      row.score = filterScore(row.entry, row.suggestion);
      filterKarteAuffrischen(row.key, row.entry);
      if (token !== filterLoadToken) return;
      const nachher = modalFilterValues();
      const neu = {
        market: row.entry.market, kauf: nachher ? nachher.maxPrice : 0, gewinn: nachher ? nachher.expectedProfit : 0,
        mindest: nachher ? nachher.wantedProfit : 0, score: row.score,
        lowest: row.entry.lowest, confidence: row.entry.confidence, gewinnArt: modalProfitMode
      };
      const gruende = frischeGruende(alt, neu);
      if (gruende.length) {
        // Nicht laden, nicht starten: im Dialog bleiben und zeigen, was sich
        // geaendert hat. Den Rest macht der finally-Block. Den Satz unter
        // dem Knopf ("Trotzdem laden" laedt ... / nicht erreichbar) schreibt
        // renderFmStart - die Zeile ist hier leer, er landet also dort.
        filterRueckfrage = { key: row.key, alt, neu, gruende };
        return;
      }
      frischNotiz = frischBestaetigtText(alt, neu);
    }
  if (token !== filterLoadToken) return;
  const values = modalFilterValues();
  if (!values || !(values.maxPrice > 0) || values.expectedProfit < values.wantedProfit) throw new Error("Bei diesen Preisen ist der Mindestgewinn nicht erreichbar.");
  // Sperren fuer den Sofort-Start - getrennt von der Rueckfrage. Ohne
  // frischen Check: nicht laden, der Fehler sagt warum. Nach dem frischen
  // Check: laden, aber nicht starten - bis 22.09. blieb der Dialog dann offen
  // mit "Laden & starten", und jeder weitere Klick startete einen neuen
  // Preis-Check. Die Meldung oben im Reiter Snipen sagt, warum nicht gestartet.
  const startSperre = autoStart ? sofortStartSperre(row, values) : null;
  if (startSperre && !autoPricing) throw new Error(startSperre.fehler);
  const starten = autoStart && !startSperre;
  // FST-Modus (Punkt 10): Warnung statt Sperre, der Start laeuft trotzdem.
  const startWarnung = starten ? sofortStartWarnung(row) : "";
  const target = {
    playerId: row.player.id, playerName: row.player.name, rating: row.rating,
    // MUSS mit: ohne sie sucht der Bot ueber alle Kartenarten und kauft
    // die billigste - zum Preis, der fuer die Sonderkarte gerechnet wurde.
    // rarityWert statt Number (28.09.2026): Bei mehreren Kartenarten ("12,70")
    // wuerde Number hier NaN und die Liste fiele auf -1.
    rarity: rarityWert(row.rarity),
    maxPrice: values.maxPrice,
    source: "live", filterId: row.key, salePrice: values.salePrice, position: row.entry.position || "",
    rare: Number(row.entry.rare) || 0, cardType: row.entry.cardType || "", score: Math.round(row.score),
    expiresAt: row.entry.t + 15 * 60 * 1000
  };
  const existing = targets.findIndex((item) => targetKey(item) === row.key);
  if (existing >= 0) targets[existing] = target;
  else if (targets.length < MAX_TARGETS) targets.push(target);
  // Ueber choose(), nicht nur "selected" setzen: Sonst bleibt im Schritt
  // "Preis" die Preisbox des Spielers davor stehen - samt Knopf "Zielpreis
  // uebernehmen" mit dessen Preis (live gesehen: Berardi, aber Kimmich-Preis).
  choose({ id: row.player.id, name: row.player.name, rating: row.rating });
  // Mehrere Kartenarten (28.09.2026): rarityWert statt Number, damit auch
  // eine Kommaliste im Feld landet statt still zu "" zu zerfallen.
  const artFeld = rarityWert(row.rarity);
  $("rarity").value = artFeld === -1 ? "" : String(artFeld);
  $("maxPrice").value = values.maxPrice;
  await saveSettings();
  if (token !== filterLoadToken) return;
  closeFilterModal();
  renderTargets(true);
  renderLiveFilters();
  WURZEL.querySelector('.tab[data-view="view-snipe"]').click();
  // Nach dem frischen Check sagen, dass geprueft und geladen wurde - und,
  // wenn Sofort-Start gewuenscht war, warum er nicht lief. Ohne frischen
  // Check (auch nach "Trotzdem laden") gibt es nichts zu bestaetigen; eine
  // alte Meldung von davor verschwindet.
  const snipeText = frischNotiz && frischNotiz + (startSperre ? " Nicht gestartet: " + startSperre.notiz : "");
  if (startWarnung) zeigeSnipeNotiz((snipeText ? snipeText + " " : "") + "Achtung, gestartet trotz: " + startWarnung, "warn");
  else zeigeSnipeNotiz(snipeText, startSperre ? "warn" : "ok");
  if (configure) {
    // "Selbst einstellen" gehoert zum Manuellen Modus: Liste, Budget und
    // Limits stehen dort. Sonst bliebe hinter dem Start-Dialog der Autopilot.
    setSnipeMode("manual");
    openStartModal();
  } else if (starten) await startRun([target]);
  else {
    // Nur geladen: Die Liste steht im Manuellen Modus, Schritt 3. Frueher
    // blieb der Auto-Modus offen - dort ist der geladene Filter unsichtbar,
    // und "Autopilot starten" haette ihn samt Preis ignoriert.
    setSnipeMode("manual");
    goToStep(3);
  }
  } catch (error) {
    cancelFilterPriceCheck();
    if (token === filterLoadToken) $("fm-progress").textContent = error.message;
  } finally {
    renderLoader("fm-loader", null);
    filterLoadBusy = false;
    controls.forEach((el, index) => { el.disabled = wasDisabled[index]; });
    if (modalFilterRow) renderFilterModal();
  }
}

// ---------------------------------------------------------------------------
// Zielliste: mehrere Spieler, abwechselnd gesucht
// ---------------------------------------------------------------------------

// Muss zu priceKey() in content.js passen: Die Kartenart haengt nur dran,
// wenn es eine gibt - sonst waeren alte Listen und Preise entwertet.
// Mehrere Kartenarten (28.09.2026): "12,70" haengt als Ganzes an - gleiche
// Form wie priceKey() in content.js, sonst laufen die Schluessel auseinander
// und die Zielliste findet ihre Preise nicht mehr.
const targetKey = (t) => {
  const liste = rarityListeWert(t.rarity);
  return t.playerId + ":" + (t.rating || 0) + (liste.length ? ":" + liste.join(",") : "");
};
let lastTargetsKey = "";

// Live-Filter gelten 15 Minuten. Danach ueberspringt der Start sie, und unter
// "Filter" laesst sich derselbe Filter erneuern.
// Chancen (02.10.2026) laufen ab wie Live-Filter: Ein Dip von vor einer
// Stunde ist vorbei. Sie gelten FC27Markt.FRISCH_MS ab ihrer letzten Messung.
function liveAlt(t) {
  return Boolean(t) && (t.source === "live" || t.source === "chance") && t.expiresAt > 0 && t.expiresAt <= Date.now();
}

// Im FST-Modus gibt es keinen Ablauf (Punkt 3): FST misst jeden Filter bei jedem
// Lauf neu. Der Start ueberspringt dann nichts und sperrt nichts - der alte
// Preis ist nur eine gelbe Warnung (liveAlt).
function liveAbgelaufen(t) {
  return !fstAn() && liveAlt(t);
}

function currentTarget() {
  if (!selected) return null;
  return { playerId: selected.id, playerName: selected.name, rating: ratingValue(), rarity: rarityValue(), maxPrice: Math.floor(Number($("maxPrice").value)) || 0 };
}

// Mindestpreis fuer einen Verkauf (28.09.2026): unter 200 Coins stellt EA
// nichts ein. Derselbe Wert wie CONFIG.LIST_MIN_PRICE in content.js - ein
// Test haelt beide gleich.
const VERKAUF_MIN_PREIS = 200;

function sanitizeTargets(list) {
  return (Array.isArray(list) ? list : [])
    .filter((t) => t && Number(t.playerId) > 0 && typeof t.playerName === "string" && Number(t.maxPrice) > 0)
    .map((t) => ({
      // Mehrere Kartenarten (28.09.2026): Eine Kommaliste ("12,70") muss das
      // Laden ueberleben - Number("12,70") waere NaN und machte daraus still
      // "jede Art". Das ist dieselbe Falle wie in der Sicherung vom 25.09.
      playerId: Number(t.playerId), playerName: t.playerName, rating: Number(t.rating) || 0, rarity: rarityWert(t.rarity), maxPrice: Number(t.maxPrice),
      // "chance" (02.10.2026): aus der Chancen-Ansicht. Bringt wie ein
      // Live-Filter ihren Verkaufspreis mit (salePrice = Ziel, preisAt =
      // Zeitpunkt der Messung) - der Verkauf rechnet mit der Erholung des
      // Preises, nicht mit dem gefallenen Preis von jetzt.
      source: t.source === "live" ? "live" : t.source === "chance" ? "chance" : "manual",
      preisAt: t.source === "chance" && Number(t.preisAt) > 0 ? Number(t.preisAt) : 0,
      filterId: typeof t.filterId === "string" ? t.filterId : "",
      salePrice: Number(t.salePrice) || 0,
      // Fester Verkaufspreis je Zeile (28.09.2026, wie FSTs listBuyNowPrice
      // je Filter). Nur echte Zahlen groesser 0 - alles andere heisst "aus".
      listFestpreis: Number(t.listFestpreis) >= VERKAUF_MIN_PREIS ? Math.floor(Number(t.listFestpreis)) : 0,
      position: typeof t.position === "string" ? t.position : "",
      rare: Number(t.rare) || 0,
      cardType: typeof t.cardType === "string" ? t.cardType : "",
      score: Number(t.score) || 0,
      expiresAt: Number(t.expiresAt) || 0
    }))
    .slice(0, MAX_TARGETS);
}

function setTargetsHint(text, level) {
  $("targets-hint").className = "hint" + (level ? " " + level : "");
  $("targets-hint").textContent = text;
}

function isRunning() {
  return Boolean(lastRes && lastRes.status && lastRes.status.running);
}

function renderAddButton() {
  $("add-target").disabled = !selected || isRunning();
  if ($("reload-extension")) $("reload-extension").disabled = isRunning();
}

// Erweiterung neu laden (background.js "devReload"), danach die Seite. In der
// EA-Seite ist das Content-Script nach dem Neuladen der Erweiterung abgehaengt
// und bekaeme keine Antworten mehr - erst das Neuladen der Seite holt den
// neuen Stand herein.
if ($("reload-extension")) $("reload-extension").addEventListener("click", () => {
  if (isRunning()) return;
  $("reload-extension").disabled = true;
  $("reload-extension").textContent = "Wird neu geladen …";
  try {
    chrome.runtime.sendMessage({ type: "devReload" }).catch(() => {});
  } catch (e) {}
  setTimeout(() => location.reload(), 1200);
});

// ---------------------------------------------------------------------------
// Ausnahme vom Tageslimit (Optionen > Wartung). Nur auf ausdruecklichen
// Wunsch und mit Rueckfrage. Der Bot (content.js) rechnet das Limit selbst
// und meldet es im Status - hier wird nur angezeigt und geschaltet.
// ---------------------------------------------------------------------------
let ausnahmeLaeuft = false; // Befehl unterwegs: Knoepfe kurz sperren
let ausnahmeFehler = ""; // letzte Ablehnung, bis zur naechsten Aktion

// Aktive Ausnahme laut Bot, sonst null. Die Uhrzeit wird hier noch einmal
// geprueft, damit der Hinweis nicht bis zum naechsten Status stehen bleibt.
function aktiveAusnahme(st) {
  const a = st && st.ausnahme;
  return a && a.aktiv && Number(a.bis) > Date.now() ? a : null;
}

// Wann der Knopf gesperrt ist. Waehrend einer Sperre bringt die Ausnahme
// nichts - die Sperre gewinnt immer. Leer heisst: frei.
function ausnahmeSperre(st) {
  if (!st) return "Keine Verbindung zur EA-Web-App.";
  const cooldown = st.cooldown && st.cooldown.leftMin > 0 ? st.cooldown : null;
  if (cooldown) {
    return "Gesperrt: EA-Sperre noch " + cooldown.leftMin + " Min." + (cooldown.reason ? " Grund: " + cooldown.reason : "") +
      " Die Ausnahme hilft während einer Sperre nicht.";
  }
  if (st.running) return "Der Bot läuft gerade. Erst stoppen.";
  return "";
}

// Ein Satz fuer Start-Dialog und Filter-Dialog: gelb, nie gruen.
function ausnahmeWarnung(st) {
  const a = aktiveAusnahme(st);
  return a ? "Ausnahme vom Tageslimit aktiv bis " + hhmm(a.bis) + " (+" + a.extra + " Suchen). EA hat heute schon gesperrt – das Sperrrisiko ist höher." : "";
}

// Zeigt in den Optionen, was die eingestellten Grenzen praktisch bedeuten
// (25.09.2026). Eine Zahl allein sagt wenig - "nach 10 Minuten ist Schluss"
// sagt alles. Gerechnet mit dem Tempo, das gerade eingestellt ist.
// Die gemeinsame Rechnung fuer "wie lange laeuft der Bot wirklich"
// (28.09.2026).
//
// Sie stand vorher nur in renderGrenzen und damit nur auf der Grenzen-Seite.
// Wer den Start-Assistenten durchklickt, las dort "Laufzeit: 30 Minuten" und
// bekam in Wahrheit rund 15 - dann ist das Stundenlimit voll, und der Lauf
// endet, statt 45 Minuten zu warten.
//
// Eine Rechnung, zwei Anzeigen. Beim Verkaufspreis stand dieselbe Rechnung
// zweimal im Code, und die beiden liefen auseinander: Der Bildschirm zeigte
// 900, der Bot stellte fuer 1.100 ein. Das soll sich hier nicht wiederholen.
function laufzeitRechnung(st) {
  const usage = (st && st.usage) || {};
  // FST-Modus: keine Stundengrenze. Die Zahl der Suchen pro Stunde ergibt sich
  // allein aus dem Tempo samt Pausen; der Lauf endet nie durch eine Stunde.
  if (st && st.fstModus === true) {
    const tempoF = $("speedMode") ? $("speedMode").value : "normal";
    const sekundenF = tempoSekunden(tempoF);
    const pvF = $("pausePreset") ? $("pausePreset").value : "fst";
    // FST: alle 25-46 Suchen 21-39 s, jede 2.-4. Pause 63-117 s: im Mittel
    // rund 50 s je Pause bei 35 Suchen. Die anderen Stufen wie in content.js.
    const pAlleF = pvF === "off" ? 0 : pvF === "fst" ? 35 : pvF === "long" ? 30 : 45;
    const pSekF = pvF === "fst" ? 50 : (pvF === "long" ? 180 : pvF === "short" ? 45 : 90) * 1.425;
    const pauseJeSucheF = pAlleF > 0 ? pSekF / pAlleF : 0;
    const proStundeF = Math.max(1, Math.floor(3600 / (sekundenF + pauseJeSucheF)));
    const laufzeitF = Number($("timeLimitMin") && $("timeLimitMin").value) || 300;
    return {
      STUNDE_HART: Infinity, getippt: 0, proStunde: proStundeF, proTag: Infinity, tempo: tempoF,
      sekunden: sekundenF, name: tempoName(tempoF), minuten: 60, pausenMin: 0, bruttoMin: 60,
      laufzeit: laufzeitF, endetDurchStunde: false, echtMin: laufzeitF,
      sekundenBrutto: sekundenF + pauseJeSucheF
    };
  }
  // Harte Obergrenze fuer die Stunde (27.09.2026): Der Motor laesst nie mehr
  // als 200 Suchen und nie mehr als 220 Anfragen in eine Stunde
  // (CONFIG.GESAMT_MAX_STUNDE in content.js). Ohne diese Klemme stuende hier
  // eine Zahl, die der Bot nie fahren wuerde - und niemand wuesste, warum er
  // frueher wartet als angekuendigt.
  const STUNDE_HART = 200;
  const getippt = Number($("grenzeSuchStunde") && $("grenzeSuchStunde").value) || 0;
  const proStunde = Math.min(getippt || Number(usage.searchLimitHour) || 150, STUNDE_HART);
  const proTag = Number($("grenzeSuchTag") && $("grenzeSuchTag").value) || Number(usage.searchLimitDayNormal) || 350;
  // Mittlere Pause je Tempo-Stufe, wie sie content.js wirklich wuerfelt.
  const tempo = $("speedMode") ? $("speedMode").value : "normal";
  const sekunden = tempoSekunden(tempo);
  const name = tempoName(tempo);
  const minuten = Math.round((proStunde * sekunden) / 60);
  // Die Sicherheitspausen gehoeren in die Rechnung (27.09.2026). Sie kosten
  // keine einzige Suche, aber sie verteilen dieselben Suchen ueber mehr Zeit.
  // Ohne sie stand hier eine Zahl, die der Bot nie erreicht. Dieselben Werte
  // wie in content.js breakPlan.
  const pv = $("pausePreset") ? $("pausePreset").value : "medium";
  const pAlle = pv === "off" ? 0 : pv === "long" ? 30 : 45;
  const pSek = pv === "long" ? 180 : pv === "short" ? 45 : 90;
  // Jede vierte Pause ist die lange: das 2,7-fache der normalen. So macht es
  // content.js (breakPlan), abgeschaut bei FUT Simple Trader (scripts.js
  // Z. 3264-3268: alle 45 Suchen 90 Sek., jede 4. Pause 240 Sek.). Im Mittel
  // kostet eine Pause also das 1,425-fache ((3 + 2,7) / 4). Ohne diesen
  // Faktor war die Anzeige zu knapp: Sie nannte 5 Min. Pause, der Bot machte
  // rund 7 (28.09.2026).
  const PAUSEN_FAKTOR = 1.425;
  const pauseJeSucheSek = pAlle > 0 ? (pSek * PAUSEN_FAKTOR) / pAlle : 0;
  const pausenMin = Math.round((proStunde * pauseJeSucheSek) / 60);
  const bruttoMin = minuten + pausenMin;
  // Ein leeres Feld heisst "kein Zeitlimit" - content.js setzt dann 300 Min.
  const laufzeit = Number($("timeLimitMin") && $("timeLimitMin").value) || 300;
  // Was den Lauf zuerst beendet.
  //
  // Ist die Stunde frueher voll, als die Laufzeit zu Ende geht, muesste der
  // Bot 60 minus bruttoMin Minuten warten - und landet damit hinter dem
  // Laufzeitende. content.js (stundenPause) bricht in genau diesem Fall ab,
  // statt umsonst zu warten. Ab etwa 55 Minuten brutto ist die Wartezeit so
  // kurz, dass sie nicht mehr ins Gewicht faellt.
  const endetDurchStunde = bruttoMin < laufzeit && bruttoMin < 55;
  return {
    STUNDE_HART, getippt, proStunde, proTag, tempo, sekunden, name,
    minuten, pausenMin, bruttoMin, laufzeit, endetDurchStunde,
    echtMin: endetDurchStunde ? bruttoMin : laufzeit,
    // Eine Suche samt ihrem Anteil an den Pausen, in Sekunden. Fuer die
    // Start-Schaetzung - damit dort nicht noch einmal gerechnet wird
    // (28.09.2026).
    sekundenBrutto: sekunden + pauseJeSucheSek
  };
}

// Die Laufzeit-Zeile im Start-Assistenten sagt jetzt die Wahrheit
// (28.09.2026).
//
// Vorher stand dort fest "30 Minuten - kurze Laeufe fallen weniger auf". Das
// war die Einstellung, nicht das Ergebnis. Nachgerechnet: Bei Tempo Normal
// sind die 150 Suchen der Stunde nach rund 15 Minuten aufgebraucht. Warten
// muesste der Bot dann 45 Minuten - laenger, als die Laufzeit noch laeuft.
// Also endet der Lauf nach 15 Minuten.
//
// Der Nutzer stand damit vor einem Bot, der nach einer Viertelstunde
// aufhoerte, und las dabei "30 Minuten". Die Wartepause, die so etwas
// abfangen soll, kann hier nichts ausrichten: Nach 45 Minuten Warten waere
// auch jeder Live-Filter tot (die gelten 15 Minuten, hoechstens 25).
// Deshalb wird hier nicht getrickst, sondern vorher gesagt, was passiert.
function renderLaufzeit(st) {
  const row = typeof tuneRowEl === "function" ? tuneRowEl("runtime") : null;
  const el = row && row.querySelector(".tune-auto");
  if (!el) return;
  const r = laufzeitRechnung(st);
  let text;
  if (r.endetDurchStunde) {
    text = "Eingestellt: " + (r.laufzeit >= 300 ? "ohne Zeitlimit" : r.laufzeit + " Min.") +
      " \u2013 der Lauf endet aber schon nach rund " + r.echtMin + " Min. Dann sind die " +
      r.proStunde + " Suchen dieser Stunde aufgebraucht.";
    el.title = "Warten m\u00fcsste der Bot dann rund " + (60 - r.bruttoMin) +
      " Minuten \u2013 l\u00e4nger, als die Laufzeit noch l\u00e4uft, und l\u00e4nger als jeder Live-Filter lebt. " +
      "Deshalb h\u00f6rt er auf, statt so zu tun, als arbeite er. " +
      "Danach im Reiter Filter neu scannen und wieder starten. " +
      "Mehr Zeit am St\u00fcck gibt es \u00fcber Tempo \u201eLangsam\u201c oder mehr Suchen pro Stunde im Kontoschutz.";
  } else {
    text = r.laufzeit >= 300
      ? "Ohne Zeitlimit \u00b7 der Bot l\u00e4uft, bis das Tagesbudget oder die Filter zu Ende sind"
      : r.laufzeit + " Minuten \u00b7 kurze L\u00e4ufe fallen weniger auf";
    el.title = "Die " + r.proStunde + " Suchen dieser Stunde reichen bei Tempo \u201e" + r.name +
      "\u201c f\u00fcr rund " + r.bruttoMin + " Minuten \u2013 das deckt die eingestellte Laufzeit ab.";
  }
  if (el.textContent !== text) el.textContent = text;
  el.classList.toggle("tune-auto-warn", r.endetDurchStunde);
}

function renderGrenzen(st) {
  const feld = $("grenzen-hinweis");
  if (!feld) return;
  const r = laufzeitRechnung(st);
  if (st && st.fstModus === true) {
    feld.textContent = "Ohne eigene Grenzen. Bei Tempo „" + r.name + "“ sind das rund " +
      r.proStunde + " Suchen pro Stunde. Nur EA selbst kann bremsen – oder sperren.";
    feld.className = "hint";
    return;
  }
  const STUNDE_HART = r.STUNDE_HART;
  const getippt = r.getippt;
  const proStunde = r.proStunde;
  const proTag = r.proTag;
  const sekunden = r.sekunden;
  const name = r.name;
  const teile = [];
  if (getippt > STUNDE_HART) {
    teile.push("Eingetragen sind " + getippt + " Suchen pro Stunde – der Bot fährt trotzdem höchstens " +
      STUNDE_HART + ". Das ist ein fester Riegel: In einer Stunde gehen nie mehr als 220 Anfragen an EA raus. " +
      "So verteilt sich das Tagesbudget auf mindestens zwei Stunden. Warum EA am 21.09. gesperrt hat, wissen wir nicht genau – viele Anfragen in kurzer Zeit sind der wahrscheinlichste Grund.");
  }
  const pausenMin = r.pausenMin;
  const bruttoMin = r.bruttoMin;
  const laufzeit = r.laufzeit;
  teile.push("Bei Tempo „" + name + "“ (rund " + sekunden.toLocaleString("de-DE") + " Sek. je Suche) sind " +
    proStunde + " Suchen nach etwa " + bruttoMin + " Minuten aufgebraucht" +
    (pausenMin > 0 ? " (davon " + pausenMin + " Min. Sicherheitspausen)" : "") + ".");
  if (bruttoMin >= 55) {
    teile.push("Damit kann der Bot fast durchgehend arbeiten.");
  } else {
    teile.push("Danach wartet er bis zu " + (60 - bruttoMin) + " Minuten, bis die Stunde wieder Platz hat.");
    // Die häufigste Enttäuschung: Der Bot "hört einfach auf". In Wahrheit war
    // die Laufzeit kürzer als die Wartezeit.
    if (laufzeit < 60) {
      teile.push("Achtung: Deine Laufzeit von " + laufzeit + " Min. ist kürzer als eine Stunde. Der Lauf endet dann nach etwa " +
        Math.min(laufzeit, bruttoMin) + " Minuten, statt zu warten. Wer durchgehend suchen will, lässt das Feld Laufzeit leer.");
    }
  }
  teile.push("Das Tagesbudget von " + proTag + " Suchen reicht für rund " +
    Math.max(1, Math.round(proTag / Math.max(1, proStunde))) + " solcher Stunden.");
  feld.textContent = teile.join(" ");
  feld.className = proStunde > 150 || proTag > 350 || getippt > STUNDE_HART ? "hint warn" : "hint";
}

function renderAusnahme(st) {
  renderGrenzen(st);
  // FST-Modus: Es gibt kein Tageslimit, also auch keine Ausnahme davon. Die
  // Box ist ausgeblendet (data-modus="streng"); die gelbe Zeile bleibt leer.
  if (st && st.fstModus === true) {
    const leer = $("ausnahme-hint");
    if (leer) leer.textContent = "";
    return;
  }
  const a = aktiveAusnahme(st);
  const stand = (st && st.ausnahme) || {};
  const extra = Number(stand.extra) || 150;
  const stunden = Number(stand.stunden) || 6;
  const cooldown = st && st.cooldown && st.cooldown.leftMin > 0 ? st.cooldown : null;
  // Gelbe Zeile im Statuskasten oben - sichtbar auf jeder Seite.
  const hinweis = $("ausnahme-hint");
  if (hinweis) hinweis.textContent = a ? "Ausnahme aktiv bis " + hhmm(a.bis) + " (+" + a.extra + " Suchen)" : "";
  const knopf = $("ausnahme-start");
  const ende = $("ausnahme-ende");
  const msg = $("ausnahme-msg");
  if (!knopf || !ende || !msg) return;
  const sperre = ausnahmeSperre(st);
  // Waehrend die Rueckfrage offen ist, steht dort statt des Knopfs Ja/Abbrechen.
  const frageOffen = Boolean($("ausnahme-frage")) && !$("ausnahme-frage").hidden;
  knopf.hidden = Boolean(a) || frageOffen;
  knopf.textContent = "Ausnahme: " + extra + " Suchen extra (" + stunden + " Std.)";
  knopf.disabled = ausnahmeLaeuft || Boolean(sperre);
  ende.hidden = !a;
  ende.disabled = ausnahmeLaeuft;
  const usage = (st && st.usage) || {};
  if (ausnahmeFehler) {
    msg.className = "hint err";
    msg.textContent = ausnahmeFehler;
  } else if (a) {
    const rest = Math.max(0, (Number(usage.searchLimitDay) || 0) - (Number(usage.searchesDay) || 0));
    msg.className = "hint warn";
    msg.textContent = "Aktiv bis " + hhmm(a.bis) + " – noch " + rest + " Suchen heute möglich." +
      (cooldown ? " Hilft gerade nicht: EA-Sperre noch " + cooldown.leftMin + " Min." : "");
  } else if (sperre) {
    msg.className = "hint warn";
    msg.textContent = sperre;
  } else {
    msg.className = "hint";
    msg.textContent = "Heute schon " + (Number(usage.searchesDay) || 0) + " von " + (Number(usage.searchLimitDay) || 350) + " Suchen.";
  }
}

// Nach dem Befehl nur den Status uebernehmen. Eine Ablehnung steht in der
// Wartung, nicht als roter Fehler oben in der Statuszeile.
async function ausnahmeSchalten(cmd, fehlerText) {
  ausnahmeLaeuft = true;
  ausnahmeFehler = "";
  renderAusnahme(letzterStatus);
  try {
    const res = await send(cmd);
    if (!res || !res.ok) ausnahmeFehler = (res && res.error) || fehlerText;
    if (res && res.status) render({ ok: true, status: res.status });
  } catch (e) {
    ausnahmeFehler = fehlerText;
  } finally {
    ausnahmeLaeuft = false;
    renderAusnahme(letzterStatus);
  }
}

if ($("ausnahme-start")) $("ausnahme-start").addEventListener("click", () => {
  const st = letzterStatus;
  if (ausnahmeLaeuft || ausnahmeSperre(st)) return;
  const stand = st.ausnahme || {};
  const usage = st.usage || {};
  const extra = Number(stand.extra) || 150;
  const stunden = Number(stand.stunden) || 6;
  const normal = Number(usage.searchLimitDayNormal) || Number(usage.searchLimitDay) || 350;
  // Rueckfrage im Menue statt window.confirm: Ein Systemfenster haelt die
  // ganze EA-Seite an, bis jemand klickt.
  $("ausnahme-frage-text").textContent = "Wirklich einschalten? EA hat heute schon gesperrt – weitermachen kann eine längere Sperre auslösen. " +
    "Dann darf der Bot " + stunden + " Stunden lang bis zu " + (normal + extra) + " statt " + normal + " Suchen am Tag machen. " +
    "Das Stundenlimit bleibt. Danach gilt wieder " + normal + ".";
  $("ausnahme-frage").hidden = false;
  renderAusnahme(letzterStatus);
});

if ($("ausnahme-nein")) $("ausnahme-nein").addEventListener("click", () => {
  $("ausnahme-frage").hidden = true;
  renderAusnahme(letzterStatus);
});

if ($("ausnahme-ja")) $("ausnahme-ja").addEventListener("click", () => {
  $("ausnahme-frage").hidden = true;
  if (ausnahmeLaeuft || ausnahmeSperre(letzterStatus)) {
    renderAusnahme(letzterStatus);
    return;
  }
  ausnahmeSchalten("ausnahmeStarten", "Ausnahme konnte nicht eingeschaltet werden.");
});

if ($("ausnahme-ende")) $("ausnahme-ende").addEventListener("click", () => {
  if (ausnahmeLaeuft) return;
  ausnahmeSchalten("ausnahmeBeenden", "Ausnahme konnte nicht beendet werden.");
});

// notiz: kurzer Satz, der vor die uebrigen Hinweise kommt (z. B. nach "Zur Liste").
function renderTargets(force, notiz) {
  const progress = new Map(((lastRes && lastRes.status && lastRes.status.targets) || []).map((t) => [t.key, t]));
  const running = isRunning();
  const auswahl = currentTarget();
  // Gewinn-Schutz je Zeile, mit den gespeicherten Preisen (keine EA-Anfrage).
  const gewinn = targets.map(gewinnStand);
  const auswahlGewinn = !targets.length && auswahl ? gewinnStand(auswahl) : null;
  // Abgelaufene Live-Filter und alte Preise aendern sich mit der Zeit, nicht
  // nur durch Klicks - deshalb stehen sie mit im Vergleichsschluessel.
  const abgelaufen = targets.map(liveAbgelaufen);
  // FST-Modus (Punkt 3): kein Ablauf, aber der alte Preis wird gelb gezeigt.
  const preisAelter = fstAn() ? targets.map(liveAlt) : targets.map(() => false);
  const preisAlt = targets.map((t) => t.source !== "live" && t.source !== "chance" && priceAgeFor(t) > PRICE_FRESH_MS);
  const nachpruefen = $("autoCheckOnStart").checked;
  const sperre = aktuelleSperre();
  const key = JSON.stringify([targets, [...progress.values()].map((p) => [p.key, p.bought, p.missed]), running,
    auswahl && [targetKey(auswahl), auswahl.maxPrice], gewinn, auswahlGewinn, feldPreisAlt, abgelaufen, preisAelter, preisAlt, nachpruefen, sperre]);
  if (!force && key === lastTargetsKey) return; // nicht bei jedem Poll neu zeichnen
  lastTargetsKey = key;
  // Die Zielliste entscheidet mit, ob Schritt 3 erledigt ist.
  if (typeof renderStep === "function") renderStep();
  // Die Filter-Karten zeigen "Aktiv"/"Abgelaufen" - gleicher Stand wie die Liste.
  renderLiveFilters();

  $("targets").replaceChildren(
    ...targets.map((t, index) => {
      const row = document.createElement("div");
      row.className = "target";
      const name = document.createElement("div");
      name.className = "name";
      const label = document.createElement("span");
      label.textContent = t.playerName + (t.rating ? " (" + t.rating + ")" : "");
      name.append(label);
      const p = progress.get(targetKey(t));
      if (p && (p.bought || p.missed || p.scans)) {
        const small = document.createElement("small");
        small.textContent = p.bought + " gekauft, " + p.missed + " verpasst";
        name.append(small);
      }
      // Rot: kein Gewinn nach 5 % Gebuehr. Gelb: teurer als der Vorschlag.
      const stand = gewinn[index];
      if (abgelaufen[index]) {
        row.classList.add("abgelaufen");
        const flag = document.createElement("small");
        flag.className = "target-flag";
        flag.textContent = "abgelaufen";
        row.title = t.source === "chance"
          ? "Die Chance ist älter als 30 Minuten. Der Lauf überspringt sie. Unter „Radar“ siehst du, ob sie noch gilt."
          : "Der Live-Filter ist älter als 15 Minuten. Der Lauf überspringt ihn. Unter „Filter“ kannst du ihn erneuern.";
        name.append(flag);
      } else if (preisAelter[index]) {
        const flag = document.createElement("small");
        flag.className = "target-flag";
        flag.textContent = "Preis alt";
        row.title = "Der Preis ist älter als 15 Minuten. Der Lauf geht trotzdem los – prüfe den Preis, wenn du sicher sein willst.";
        name.append(flag);
      } else if (stand && (stand.keinGewinn || stand.ueberVorschlag)) {
        row.classList.add(stand.keinGewinn ? "kein-gewinn" : "ueber-vorschlag");
        const flag = document.createElement("small");
        flag.className = "target-flag";
        flag.textContent = stand.keinGewinn ? "kein Gewinn" : "über Vorschlag";
        row.title = stand.keinGewinn
          ? "Nach 5 % EA-Gebühr bringt der Verkauf nur " + fmt(stand.saleNet) + " Coins. So startet der Bot nicht."
          : "Vorschlag: " + (stand.vorschlag > 0 ? fmt(stand.vorschlag) : "kein sinnvoller Zielpreis") + ". Der Gewinn wird kleiner.";
        name.append(flag);
      } else if (t.source === "chance" && t.salePrice > 0) {
        // Woher die Zeile kommt und womit der Verkauf rechnet (02.10.2026).
        const flag = document.createElement("small");
        flag.className = "target-flag chance-flag";
        flag.textContent = "Chance · Ziel " + fmt(t.salePrice);
        row.title = "Aus dem Radar: kaufen bis " + fmt(t.maxPrice) + ", verkaufen um " + fmt(t.salePrice) +
          ", wenn sich der Preis erholt. Gilt bis " + hhmm(t.expiresAt) + ".";
        name.append(flag);
      }
      const price = document.createElement("span");
      price.className = "price";
      price.textContent = fmt(t.maxPrice);
      // Fester Verkaufspreis nur fuer diese Zeile (28.09.2026) - wie FSTs
      // listBuyNowPrice je Filter (scripts.js Z. 1594-1601, 59392-59404).
      // Leer heisst: Festpreis aus den Optionen, sonst der gemessene Preis.
      const fest = document.createElement("input");
      fest.type = "number";
      fest.className = "fest";
      fest.min = "0";
      fest.step = "50";
      fest.placeholder = "Verkauf fest";
      fest.value = Number(t.listFestpreis) > 0 ? t.listFestpreis : "";
      fest.title = "Fester Verkaufspreis nur für diesen Spieler beim „Gleich verkaufen“. Diese Zahl veraltet nie. Leer heißt: Festpreis aus den Optionen, sonst der gemessene Preis. Zu billig verkauft der Bot nie – ohne Gewinn nach 5 % Gebühr stellt er nicht ein.";
      fest.setAttribute("aria-label", "Fester Verkaufspreis für " + t.playerName);
      fest.disabled = running;
      fest.addEventListener("change", () => {
        let wert = Math.floor(Number(fest.value)) || 0;
        // Unter 200 Coins stellt EA nichts ein (28.09.2026). Die Zahl gleich
        // verwerfen und sagen warum, statt sie stumm zu speichern.
        if (wert > 0 && wert < VERKAUF_MIN_PREIS) {
          wert = 0;
          fest.value = "";
          fest.placeholder = "min. " + VERKAUF_MIN_PREIS;
          setTimeout(() => { fest.placeholder = "Verkauf fest"; }, 3000);
        }
        targets[index] = { ...targets[index], listFestpreis: wert > 0 ? wert : 0 };
        // Die Liste wird hier NICHT neu gebaut: Sonst springt der Fokus aus dem
        // Feld, und wer mehrere Zeilen nacheinander fuellt, verliert nach jeder
        // Eingabe die Stelle. Gespeichert wird trotzdem.
        saveSettings();
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove";
      remove.textContent = "×";
      remove.title = "Aus der Liste entfernen";
      remove.setAttribute("aria-label", t.playerName + " aus der Liste entfernen");
      remove.disabled = running;
      remove.addEventListener("click", () => {
        targets.splice(index, 1);
        saveSettings();
        renderTargets(true);
      });
      // 28.09.2026: das Festpreis-Feld sitzt rechts neben dem Zielpreis.
      row.append(portrait(t.playerId, t.playerName), name, price, fest);
      // Alter Preis: hier einzeln nachpruefen statt alles beim Start.
      if (preisAlt[index]) {
        const pruefen = document.createElement("button");
        pruefen.type = "button";
        pruefen.className = "secondary target-check";
        pruefen.textContent = "Preis prüfen";
        pruefen.title = "Der Preis ist älter als 15 Minuten. Prüft den Marktpreis für diesen Spieler neu (Schritt 2).";
        pruefen.disabled = running || Boolean(sperre);
        pruefen.addEventListener("click", () => listenPreisPruefen(t));
        row.append(pruefen);
      }
      row.append(remove);
      return row;
    })
  );

  const warnungen = [];
  const fehlt = auswahlFehltInListe();
  if (fehlt) {
    const wer = fehlt.playerName + (fehlt.rating ? " (" + fehlt.rating + ")" : "");
    warnungen.push(fehlt.listenPreis
      ? "Achtung: " + wer + " steht mit " + fmt(fehlt.listenPreis) + " in der Liste, im Feld Zielpreis steht " + fmt(fehlt.maxPrice) +
        ". Der Lauf kauft bis " + fmt(fehlt.listenPreis) + " – mit „Zur Liste“ gilt " + fmt(fehlt.maxPrice) + "."
      : "Achtung: " + wer + " (in Schritt 1 gewählt) steht nicht in der Liste. Der Lauf sucht nur die Liste – nimm ihn mit „Zur Liste“ auf.");
  }
  if (feldPreisAlt && auswahl && feldPreisAlt.key === targetKey(auswahl) && feldPreisAlt.preis === auswahl.maxPrice) {
    warnungen.push("Der Zielpreis " + fmt(auswahl.maxPrice) + " stammt noch vom Spieler davor. Bitte prüfen.");
  }
  const weg = targets.filter((t, i) => abgelaufen[i]);
  if (weg.length) {
    const nurChancen = weg.every((t) => t.source === "chance");
    warnungen.push("Abgelaufen: " + weg.map((t) => t.playerName).join(", ") +
      (nurChancen
        ? ". Der Lauf überspringt " + (weg.length === 1 ? "diese Chance" : "diese Chancen") + " – unter „Radar“ siehst du, was noch gilt."
        : ". Der Lauf überspringt " + (weg.length === 1 ? "diesen Live-Filter" : "diese Live-Filter") + " – unter „Filter“ kannst du erneuern."));
  }
  if (preisAelter.some(Boolean)) {
    warnungen.push("Der Preis ist älter als 15 Minuten: " + targets.filter((t, i) => preisAelter[i]).map((t) => t.playerName).join(", ") + ". Der Lauf geht trotzdem los.");
  }
  const altAnzahl = preisAlt.filter(Boolean).length;
  if (nachpruefen && altAnzahl > maxAutoChecks()) {
    warnungen.push(altAnzahl + " Preise sind älter als 15 Minuten. Der Start prüft höchstens " + maxAutoChecks() +
      " selbst nach – prüfe die übrigen vorher mit „Preis prüfen“.");
  }
  if (gewinn.some((s, i) => s && s.keinGewinn && !abgelaufen[i])) warnungen.push("Rot: kein Gewinn nach 5 % EA-Gebühr – senke dort den Zielpreis.");
  else if (gewinn.some((s, i) => s && s.ueberVorschlag && !abgelaufen[i])) warnungen.push("Gelb: Zielpreis über dem Vorschlag – weniger Gewinn.");
  if (auswahlGewinn && auswahlGewinn.keinGewinn) {
    warnungen.push("Mit " + fmt(auswahl.maxPrice) + " bleibt kein Gewinn: Nach 5 % EA-Gebühr bringt der Verkauf nur " + fmt(auswahlGewinn.saleNet) + ".");
  } else if (auswahlGewinn && auswahlGewinn.ueberVorschlag) {
    warnungen.push("Der Zielpreis " + fmt(auswahl.maxPrice) + " liegt über dem Vorschlag" +
      (auswahlGewinn.vorschlag > 0 ? " " + fmt(auswahlGewinn.vorschlag) : "") + " – weniger Gewinn.");
  }
  const vorne = notiz ? notiz + " " : "";
  if (warnungen.length) setTargetsHint(vorne + warnungen.join(" "), "warn");
  else if (!targets.length) setTargetsHint(vorne + "Liste leer: Der Lauf nimmt den Spieler aus Schritt 1 mit diesem Zielpreis.", notiz ? "ok" : "");
  else if (targets.length === 1) setTargetsHint(notiz || "", notiz ? "ok" : "");
  else setTargetsHint(vorne + "Der Lauf sucht die " + targets.length + " Spieler abwechselnd.", notiz ? "ok" : "");
}

// "Preis pruefen" in einer Listenzeile: Spieler oben waehlen und in Schritt 2
// den normalen Preis-Check starten. Dort steht dann der neue Vorschlag, und
// "Zielpreis uebernehmen" aendert auch den Listenpreis.
function listenPreisPruefen(t) {
  if (isRunning() || aktuelleSperre()) return;
  choose({ id: t.playerId, name: t.playerName, rating: t.rating || 0 });
  $("rarity").value = t.rarity || "";
  goToStep(2);
  preisCheckStarten();
}

function addTarget() {
  const target = currentTarget();
  if (!target) return;
  if (!(target.maxPrice > 0)) {
    setTargetsHint("Erst einen Zielpreis eintragen.", "warn");
    return;
  }
  const index = targets.findIndex((t) => targetKey(t) === targetKey(target));
  const vorher = index >= 0 ? targets[index].maxPrice : 0;
  if (index >= 0) targets[index] = target;
  else if (targets.length >= MAX_TARGETS) {
    setTargetsHint("Höchstens " + MAX_TARGETS + " Spieler gleichzeitig.", "warn");
    return;
  } else targets.push(target);
  feldPreisAlt = null; // bewusst uebernommen
  saveSettings();
  // Ueberschreiben ist gewollt, aber nie still: alter und neuer Preis stehen da.
  const wer = target.playerName + (target.rating ? " (" + target.rating + ")" : "");
  renderTargets(true, index >= 0 && vorher !== target.maxPrice
    ? "Preis für " + wer + " in der Liste geändert: " + fmt(vorher) + " → " + fmt(target.maxPrice) + "."
    : "");
}

// ---------------------------------------------------------------------------
// Käufe und CSV-Export
// ---------------------------------------------------------------------------

const CLUB_TEXT = { ok: "im Verein", doppelt: "schon im Verein, liegt bei den Transferzielen", fehlgeschlagen: "liegt bei den Transferzielen" };

// "ok" heisst nur: das Verschieben hat geklappt - wohin, steht in b.pile.
// Aeltere Eintraege haben kein pile; dort ist das Ziel unbekannt.
function clubText(b) {
  if (b.listed && Number(b.listPrice) > 0) return "im Verkauf für " + fmt(b.listPrice) + " Coins";
  if (b.listNote) return "nicht eingestellt: " + b.listNote;
  if (b.club !== "ok") return CLUB_TEXT[b.club] || "";
  if (b.pile === "trade") return "auf der Transferliste";
  if (b.pile === "club") return "im Verein";
  return "verschoben";
}

// ---------------------------------------------------------------------------
// Erwarteter Gewinn - ohne EA-Anfrage, nur aus gespeicherten Daten.
// Je Kauf: Marktwert minus 5 % EA-Gebuehr minus Kaufpreis. Marktwert ist der
// Verkaufspreis, den der Kauf mitbringt (salePrice), sonst der neueste
// gespeicherte Marktpreis der Karte. Ohne Marktwert zaehlt der Kauf als
// unbekannt - nicht als 0, sonst saehe er wie ein Verlust in voller Hoehe aus.
// ---------------------------------------------------------------------------

function marktwertFuer(kauf, verlauf) {
  if (!kauf) return 0;
  // Steht die Karte schon im Verkauf, ist das der wirklich verlangte Preis.
  const eingestellt = Number(kauf.listPrice) || 0;
  if (eingestellt > 0) return eingestellt;
  const vorgabe = Number(kauf.salePrice) || 0;
  if (vorgabe > 0) return vorgabe;
  if (!verlauf || typeof verlauf !== "object") return 0;
  // Vom Genauen zum Groben (25.09.2026 um die Kartenart erweitert):
  //   1. genau diese Karte - Spieler, Rating UND Kartenart
  //   2. derselbe Spieler mit demselben Rating, Kartenart egal
  //   3. der Preis-Check fuer "alle Ratings" - damit hat der Bot bei
  //      Rating 0 auch gerechnet
  // Ohne Stufe 1 wurde der Preis einer Sonderkarte nie gefunden, seit die
  // Schluessel die Kartenart tragen. Doppelte Eintraege schaden nicht: Der
  // erste Treffer gewinnt.
  const schluessel = [
    targetKey({ playerId: kauf.playerId, rating: kauf.rating, rarity: kauf.rarity }),
    targetKey({ playerId: kauf.playerId, rating: kauf.rating }),
    targetKey({ playerId: kauf.playerId, rating: 0 })
  ];
  for (const key of schluessel) {
    const eintraege = verlauf[key];
    if (!Array.isArray(eintraege)) continue;
    // Der letzte Eintrag ist der neueste.
    for (let i = eintraege.length - 1; i >= 0; i--) {
      const markt = Number(eintraege[i] && eintraege[i].market) || 0;
      // Verkaufspreis nach Alter (F1): etwas weniger, wenn Angebote stehen.
      if (markt > 0) return verkaufsPreis(eintraege[i], preisMethodeValue()).preis;
    }
  }
  return 0;
}

// Gewinn eines Kaufs in Coins, null = Marktwert unbekannt.
function kaufGewinn(kauf, verlauf) {
  const markt = marktwertFuer(kauf, verlauf);
  const preis = Number(kauf && kauf.price) || 0;
  if (!(markt > 0) || !(preis > 0)) return null;
  return Math.floor(markt * (1 - SALE_FEE)) - preis;
}

function erwarteterGewinn(kaeufe, verlauf) {
  const ergebnis = { summe: 0, bekannt: 0, unbekannt: 0 };
  for (const kauf of Array.isArray(kaeufe) ? kaeufe : []) {
    const gewinn = kaufGewinn(kauf, verlauf);
    if (gewinn == null) {
      ergebnis.unbekannt += 1;
    } else {
      ergebnis.summe += gewinn;
      ergebnis.bekannt += 1;
    }
  }
  return ergebnis;
}

// Die Kaeufe des aktuellen oder letzten Laufs: die letzten "anzahl" Eintraege
// des Kauflogs, nach Zeit sortiert. Eintraege von vor dem Laufstart zaehlen
// nie mit - das Kauflog wird einen Augenblick nach dem Zaehler geschrieben,
// sonst rutschte kurz ein Kauf des vorigen Laufs hinein.
function laufKaeufe(alle, anzahl, seit) {
  if (!(anzahl > 0) || !Array.isArray(alle)) return [];
  const liste = alle.filter((b) => b && !(seit > 0 && (Number(b.t) || 0) < seit));
  liste.sort((a, b) => (Number(a.t) || 0) - (Number(b.t) || 0));
  return liste.slice(-anzahl);
}

// "+1.234" / "−56" / "0" - echtes Minuszeichen, kein Bindestrich.
function gewinnText(n) {
  return (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n));
}

const GEWINN_TITEL = "Geschätzter Gewinn der Käufe dieses Laufs: Verkaufspreis minus 5 % EA-Gebühr minus Kaufpreis. Der Verkaufspreis ist der Marktpreis – oder etwas weniger, wenn Angebote lange unverkauft stehen. Echt wird er erst beim Verkauf.";

function renderGewinn(st) {
  const s = (st && st.stats) || {};
  // Gewonnene Auktionen stehen auch im Kauflog und in "ausgegeben".
  const anzahl = (s.bought || 0) + (s.bidsWon || 0);
  const g = erwarteterGewinn(laufKaeufe(purchases, anzahl, st && st.runStartedAt), history);
  const el = $("s-profit");
  if (g.bekannt) {
    el.textContent = (g.unbekannt ? "≈ " : "") + gewinnText(g.summe);
    el.className = g.summe > 0 ? "plus" : g.summe < 0 ? "minus" : "";
  } else {
    el.textContent = "–";
    el.className = "";
  }
  $("s-profit-box").title = GEWINN_TITEL + (g.unbekannt
    ? " Für " + g.unbekannt + (g.unbekannt === 1 ? " Karte" : " Karten") + " fehlt ein Marktpreis."
    : "");
}

function renderBuys() {
  const total = purchases.reduce((sum, b) => sum + b.price, 0);
  $("buys-summary").textContent = purchases.length
    ? purchases.length + (purchases.length === 1 ? " Kauf, " : " Käufe, ") + fmt(total) + " Coins insgesamt."
    : "Noch keine Käufe. Was der Bot kauft, erscheint hier.";
  $("buys-list").replaceChildren(
    ...purchases.slice(-30).reverse().map((b) => {
      const row = document.createElement("div");
      row.className = "buy";
      const left = document.createElement("div");
      left.className = "name";
      const name = document.createElement("span");
      name.textContent = b.playerName + (b.rating ? " (" + b.rating + ")" : "");
      const meta = document.createElement("small");
      meta.textContent = [shortTime(b.t), clubText(b)].filter(Boolean).join(", ");
      left.append(name, meta);
      const price = document.createElement("span");
      price.className = "price";
      price.textContent = fmt(b.price);
      const werte = document.createElement("div");
      werte.className = "werte";
      werte.append(price);
      // Ohne Marktwert steht hier nichts - eine 0 waere geraten.
      const gewinn = kaufGewinn(b, history);
      if (gewinn != null) {
        const zeile = document.createElement("small");
        zeile.className = "gewinn" + (gewinn > 0 ? " plus" : gewinn < 0 ? " minus" : "");
        zeile.textContent = "≈ " + gewinnText(gewinn);
        zeile.title = "Geschätzter Gewinn: aktueller Marktpreis minus 5 % EA-Gebühr minus Kaufpreis. Echt wird er erst beim Verkauf.";
        werte.append(zeile);
      }
      row.append(portrait(b.playerId, b.playerName), left, werte);
      return row;
    })
  );
  $("export-buys").disabled = !purchases.length;
  $("export-prices").disabled = !Object.keys(history).some((k) => Array.isArray(history[k]) && history[k].length);
}

// Semikolon + BOM, damit Excel (deutsch) die Datei direkt richtig oeffnet.
function csvCell(value) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = "'" + text; // keine Formeln in Excel
  return /[;"\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

// Eine Datei anbieten, gleich welcher Art. Seit 25.09.2026 geht auch die
// JSON-Sicherung diesen Weg - es gibt nur eine Stelle, die einen Download
// ausloest, und damit nur eine Stelle, die ihn unauffaellig halten muss.
function downloadDatei(name, text, typ) {
  const url = URL.createObjectURL(new Blob([text], { type: typ }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  // Nicht in den Seitenkoerper haengen: In der EA-Seite wuerde selbst dieser
  // unsichtbare Wimpernschlag von einem Beobachter der Seite gesehen.
  (WURZEL === document ? document.body : WURZEL).append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadCsv(name, rows) {
  downloadDatei(name, "\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n"), "text/csv;charset=utf-8");
}

// ---------------------------------------------------------------------------
// Verkaufs-Helfer (Reiter Käufe), 22.09.2026.
// Zeigt die Transferliste aus der Web App und stellt Spieler auf Klick ein.
// Die Arbeit macht content.js (Sperren, Abstand, nur ein Tab); hier wird nur
// angezeigt und geklickt. Preise kommen aus demselben Preisverlauf wie beim
// Kaufen - "Einstellen" nimmt den Verkaufspreis aus verkaufsPreis(): den
// Marktpreis, bei lange stehenden Angeboten etwas darunter (F1).
// ---------------------------------------------------------------------------
let transferliste = { at: 0, liste: [] };
let verkaeufe = [];
let verkaufStandGesehen = -1;
let verkaufPreisLaeuft = null; // itemId, dessen Preis gerade geprueft wird
let verkaufPreisSuchen = 0;
let verkaufHinweis = null; // { text, level } - eigene Meldung aus dem Menue
const VERKAUF_PREIS_FRISCH_MS = 60 * 60 * 1000;
const VERKAUF_ZUSTAND = { active: "im Verkauf", expired: "abgelaufen", closed: "verkauft" };

async function loadVerkauf() {
  const { transferliste: tl, verkaeufe: vk } = await chrome.storage.local.get(["transferliste", "verkaeufe"]);
  transferliste = tl && Array.isArray(tl.liste) ? tl : { at: 0, liste: [] };
  verkaeufe = Array.isArray(vk) ? vk : [];
  renderVerkauf();
}

function verkaufZustand(item) {
  return VERKAUF_ZUSTAND[item.tradeState] ? item.tradeState : "frei";
}

// Neuester Preis-Check fuer genau diese Karte, sonst fuer "alle Ratings".
function verkaufPreisEintrag(item) {
  for (const key of [item.assetId + ":" + item.rating, item.assetId + ":0"]) {
    const eintraege = history[key];
    if (!Array.isArray(eintraege)) continue;
    for (let i = eintraege.length - 1; i >= 0; i--) {
      if (eintraege[i] && eintraege[i].market > 0) return { key, entry: eintraege[i], eintraege };
    }
  }
  return null;
}

function verkaufVorschlag(item) {
  const gefunden = verkaufPreisEintrag(item);
  if (!gefunden) return null;
  // Chemie muss zur Messung passen (28.09.2026). FUT Simple Trader sucht den
  // Einstell-Preis nach Spieler UND Kartenart UND Chemie (getListPrice,
  // scripts.js Z. 59392-59403: chemistry === playStyle). Wurde unser Preis
  // fuer eine andere Chemie gemessen, ist er fuer diese Karte falsch -
  // gemessen die nackte Karte, eingestellt die veredelte. Dann gilt der
  // Vorschlag als nicht frisch: Der Knopf zeigt "Preis pruefen" statt einer
  // falschen Zahl.
  //
  // 0 ist bei EA ein echter Wert ("keine Chemie"). Verglichen wird nur, wenn
  // BEIDE Seiten ihre Chemie wirklich kennen: die Messung (chemGefiltert)
  // und die Karte (playStyle nicht null). Fehlt eine Seite, bleibt alles wie
  // bisher - sonst stuende der Helfer nach einem EA-Umbau still.
  const chemieFalsch = gefunden.entry.chemGefiltert === true &&
    typeof gefunden.entry.chem === "number" && Number.isFinite(gefunden.entry.chem) &&
    typeof item.playStyle === "number" && Number.isFinite(item.playStyle) &&
    item.playStyle !== gefunden.entry.chem;
  const verkauf = verkaufsPreis(gefunden.entry, preisMethodeValue());
  let preis = roundDownToStep(verkauf.preis);
  if (item.eaMin) preis = Math.max(preis, item.eaMin);
  if (item.eaMax) preis = Math.min(preis, item.eaMax);
  const alter = Date.now() - gefunden.entry.t;
  const netto = Math.floor(preis * (1 - SALE_FEE));
  return { preis, alter, frisch: !chemieFalsch && alter <= VERKAUF_PREIS_FRISCH_MS, chemieFalsch, netto, verkauf, gewinn: item.gekauftFuer > 0 ? netto - item.gekauftFuer : null };
}

// Eigener Name: gewinnText gibt es schon (Text fuer Kopfzeile und Kaufliste).
// Am 22.09. hiess diese Funktion auch so und ueberschrieb die alte - dort
// stand dann "[object HTMLElement]" statt des Gewinns.
function verkaufGewinnElement(gewinn) {
  const span = document.createElement("small");
  span.className = gewinn >= 0 ? "plus" : "minus";
  span.textContent = (gewinn >= 0 ? "≈ +" : "≈ ") + fmt(gewinn);
  return span;
}

function verkaufZeile(item, st) {
  const zeile = document.createElement("div");
  const zustand = verkaufZustand(item);
  zeile.className = "buy verkauf" + (zustand === "closed" || zustand === "active" ? " fertig" : "");
  const name = document.createElement("div");
  name.className = "name";
  const titel = document.createElement("span");
  titel.textContent = (item.name || "Spieler") + (item.rating ? " (" + item.rating + ")" : "");
  const unter = document.createElement("small");
  const herkunft = item.gekauftFuer > 0 ? "gekauft für " + fmt(item.gekauftFuer) : "aus Pack";
  unter.textContent = (zustand === "frei" ? (item.handelbar ? "nicht eingestellt" : "nicht handelbar") : VERKAUF_ZUSTAND[zustand]) + " · " + herkunft;
  name.append(titel, unter);

  const werte = document.createElement("div");
  werte.className = "werte";
  const beschaeftigt = Boolean(st && st.verkauf && st.verkauf.laeuft) || Boolean(verkaufPreisLaeuft);
  // Sperre, laufender Lauf, keine Verbindung: dieselben Gruende wie beim Start.
  // Der Bot lehnt dann ohnehin ab - der Knopf soll es vorher zeigen.
  const sperre = aktuelleSperre();

  if (zustand === "closed") {
    const preis = document.createElement("span");
    preis.className = "price";
    preis.textContent = fmt(item.gebot);
    werte.append(preis);
    if (item.gekauftFuer > 0) werte.append(verkaufGewinnElement(Math.floor(item.gebot * (1 - SALE_FEE)) - item.gekauftFuer));
  } else if (zustand === "active") {
    const preis = document.createElement("span");
    preis.className = "price";
    preis.textContent = fmt(item.sofortPreis);
    const klein = document.createElement("small");
    klein.textContent = "Start " + fmt(item.startPreis);
    werte.append(preis, klein);
  } else if (item.handelbar && item.assetId > 0) {
    // Ohne Spieler-Nummer kein Preis-Check: Er suchte sonst einen falschen Spieler.
    const vorschlag = verkaufVorschlag(item);
    const knopf = document.createElement("button");
    knopf.type = "button";
    knopf.className = "secondary verkauf-aktion";
    if (verkaufPreisLaeuft === item.itemId) {
      knopf.textContent = "prüfe … " + verkaufPreisSuchen;
      knopf.disabled = true;
    } else if (vorschlag && vorschlag.frisch) {
      knopf.classList.add("go");
      knopf.textContent = "Einstellen " + fmt(vorschlag.preis);
      knopf.title = "Für " + fmt(vorschlag.preis) + " Coins (Startgebot eine Stufe darunter) eine Stunde einstellen. Nach 5 % Gebühr bleiben " + fmt(vorschlag.netto) + "." +
        (vorschlag.verkauf && vorschlag.verkauf.quelle === "alter" ? " Preis nach Alter: " + verkaufsPreisGrund(vorschlag.verkauf) : "");
      knopf.disabled = beschaeftigt || Boolean(sperre);
      if (sperre) knopf.title = sperre;
      knopf.addEventListener("click", () => verkaufEinstellen(item, vorschlag.preis));
    } else {
      knopf.textContent = "Preis prüfen";
      // Passt die Chemie nicht zur Messung, muss dastehen WARUM keine Zahl
      // auf dem Knopf steht (28.09.2026) - sonst wirkt der Helfer kaputt.
      knopf.title = vorschlag && vorschlag.chemieFalsch
        ? "Der letzte Preis wurde für eine andere Chemie (Spielstil) gemessen und gilt für diese Karte nicht. Ein neuer Preis-Check kostet bis zu 15 Suchen" + (typeof fstAn === "function" && fstAn() ? "." : " vom Tageslimit.")
        : "Prüft den Marktpreis – kostet bis zu 15 Suchen" + (typeof fstAn === "function" && fstAn() ? "." : " vom Tageslimit.");
      knopf.disabled = beschaeftigt || Boolean(sperre);
      if (sperre) knopf.title = sperre;
      knopf.addEventListener("click", () => verkaufPreisPruefen(item));
    }
    werte.append(knopf);
    if (vorschlag && vorschlag.frisch && vorschlag.gewinn !== null) werte.append(verkaufGewinnElement(vorschlag.gewinn));
    else if (vorschlag && !vorschlag.frisch) {
      const alt = document.createElement("small");
      // Bei falscher Chemie wird die Zahl GAR NICHT gezeigt (28.09.2026). Sie
      // galt fuer eine andere Karte - und wer "zuletzt ≈ 12.000" liest, tippt
      // sie womoeglich von Hand ein. Der Knopf daneben sagt schon "Preis
      // pruefen"; hier darf keine falsche Zahl dazu stehen.
      alt.textContent = vorschlag.chemieFalsch
        ? "letzter Preis galt für eine andere Chemie (vor " + duration(vorschlag.alter) + ")"
        : "zuletzt ≈ " + fmt(vorschlag.preis) + " (vor " + duration(vorschlag.alter) + ")";
      werte.append(alt);
    } else if (item.schnellverkauf > 0) {
      const schnell = document.createElement("small");
      schnell.textContent = "Schnellverkauf " + fmt(item.schnellverkauf);
      werte.append(schnell);
    }
  }
  zeile.append(portrait(item.assetId, item.name), name, werte);
  return zeile;
}

const VERKAUF_REIHENFOLGE = { closed: 0, expired: 1, frei: 2, active: 3 };

function renderVerkauf() {
  if (!$("verkauf-block")) return;
  const st = letzterStatus;
  // Nur Spieler: Vertraege, Fitness usw. haben keinen Spielerpreis.
  const liste = transferliste.liste.filter((i) => !i.typ || i.typ === "player");
  const zahl = { frei: 0, active: 0, expired: 0, closed: 0 };
  for (const i of liste) zahl[verkaufZustand(i)] += 1;
  const laeuft = Boolean(st && st.verkauf && st.verkauf.laeuft);

  if (!transferliste.at) {
    $("verkauf-summe").textContent = "Noch nicht gelesen. Öffne diesen Reiter oder tippe auf „Aktualisieren“.";
  } else {
    $("verkauf-summe").textContent = liste.length + " Spieler auf der Transferliste: " + zahl.frei + " frei · " +
      zahl.active + " im Verkauf · " + zahl.expired + " abgelaufen · " + zahl.closed + " verkauft. Stand: vor " + duration(Date.now() - transferliste.at);
  }
  $("verkauf-neu").textContent = "Abgelaufene neu einstellen" + (zahl.expired ? " (" + zahl.expired + ")" : "");
  $("verkauf-abraeumen").textContent = "Verkaufte abräumen" + (zahl.closed ? " (" + zahl.closed + ")" : "");
  const sperre = aktuelleSperre();
  $("verkauf-neu").disabled = laeuft || !zahl.expired || Boolean(sperre);
  $("verkauf-abraeumen").disabled = laeuft || !zahl.closed || Boolean(sperre);
  $("verkauf-lesen").disabled = laeuft || Boolean(verkaufPreisLaeuft) || Boolean(sperre);

  const sortiert = liste.slice().sort((a, b) =>
    VERKAUF_REIHENFOLGE[verkaufZustand(a)] - VERKAUF_REIHENFOLGE[verkaufZustand(b)] || b.schnellverkauf - a.schnellverkauf);
  $("verkauf-liste").replaceChildren(...sortiert.map((i) => verkaufZeile(i, st)));

  // Meldung: eigene zuerst, sonst die des Bots.
  const v = st && st.verkauf ? st.verkauf : null;
  const meldung = verkaufHinweis || (v && v.laeuft ? { text: "Läuft …", level: "" }
    : v && v.fehler ? { text: v.fehler, level: "warn" } : v && v.meldung ? { text: v.meldung, level: "ok" } : null);
  $("verkauf-meldung").textContent = meldung ? meldung.text : "";
  $("verkauf-meldung").className = "hint" + (meldung && meldung.level === "warn" ? " warn" : "");

  // Echter Gewinn: nur verkaufte Spieler mit bekanntem Kaufpreis.
  if (verkaeufe.length) {
    let erloes = 0;
    let gewinn = 0;
    let mitKauf = 0;
    for (const verkauf of verkaeufe) {
      const netto = Math.floor((Number(verkauf.preis) || 0) * (1 - SALE_FEE));
      erloes += netto;
      if (Number(verkauf.gekauftFuer) > 0) {
        gewinn += netto - Number(verkauf.gekauftFuer);
        mitKauf += 1;
      }
    }
    $("verkauf-echt").textContent = "Echt verkauft: " + verkaeufe.length + " Spieler, " + fmt(erloes) + " Coins nach Gebühr" +
      (mitKauf ? " · echter Gewinn bei " + mitKauf + " gekauften: " + (gewinn >= 0 ? "+" : "") + fmt(gewinn) : "") + ".";
  } else {
    $("verkauf-echt").textContent = "";
  }
}

// Status alle 1,5 s: Ist eine Aktion fertig, die Liste neu laden. Sonst nur
// neu zeichnen, wenn sich etwas geaendert hat - jedes Neuzeichnen baut alle
// Zeilen samt Bildern neu, und ein Klick mitten hinein ginge verloren.
let verkaufSignatur = "";
function renderVerkaufStatus(st) {
  const v = st && st.verkauf;
  if (!v) return;
  if (v.stand !== verkaufStandGesehen) {
    verkaufStandGesehen = v.stand;
    if (verkaufHinweis && !v.laeuft) verkaufHinweis = null;
    loadVerkauf();
    return;
  }
  const signatur = [v.laeuft, v.art, v.meldung, v.fehler, aktuelleSperre()].join("|");
  if (signatur === verkaufSignatur) return;
  verkaufSignatur = signatur;
  renderVerkauf();
}

async function verkaufBefehl(cmd, extra, text) {
  verkaufHinweis = null;
  const res = await send(cmd, extra);
  if (!res || !res.ok) {
    verkaufHinweis = { text: (res && res.error) || "Hat nicht geklappt.", level: "warn" };
  } else if (text) {
    verkaufHinweis = { text, level: "" };
  }
  if (res && res.status) letzterStatus = res.status;
  renderVerkauf();
}

function verkaufLesen(frisch) {
  return verkaufBefehl("transferliste", { frisch }, frisch ? "Transferliste wird neu geladen …" : "");
}

function verkaufEinstellen(item, preis) {
  return verkaufBefehl("einstellen", { itemId: item.itemId, sofortPreis: preis },
    (item.name || "Spieler") + " wird für " + fmt(preis) + " eingestellt …");
}

async function verkaufPreisPruefen(item) {
  if (verkaufPreisLaeuft) return;
  verkaufPreisLaeuft = item.itemId;
  verkaufPreisSuchen = 0;
  verkaufHinweis = null;
  renderVerkauf();
  try {
    await awaitFreshPrice({ id: item.assetId, name: item.name }, item.rating, item.assetId + ":" + item.rating, (n) => {
      verkaufPreisSuchen = n;
      renderVerkauf();
    });
    await loadData();
  } catch (error) {
    verkaufHinweis = { text: "Preis für " + (item.name || "Spieler") + ": " + error.message, level: "warn" };
  } finally {
    verkaufPreisLaeuft = null;
    renderVerkauf();
  }
}

$("verkauf-lesen").addEventListener("click", () => verkaufLesen(true));
$("verkauf-neu").addEventListener("click", () => verkaufBefehl("neuEinstellen", {}, "Abgelaufene werden neu eingestellt …"));
$("verkauf-abraeumen").addEventListener("click", () => verkaufBefehl("abraeumen", {}, "Verkaufte werden abgeräumt …"));

function exportBuys() {
  const rows = [["Zeit", "Spieler", "Rating", "Preis", "Auktions-Nr.", "Ablage"]];
  for (const b of purchases) rows.push([stamp(b.t), b.playerName, b.rating || "", b.price, b.tradeId, clubText(b)]);
  downloadCsv("fc27-kaeufe-" + stamp(Date.now()).slice(0, 10) + ".csv", rows);
}

function exportPrices() {
  const names = new Map(players.map((p) => [String(p.id), p.name]));
  const rows = [["Zeit", "Spieler", "Rating", "Günstigstes", "Anzahl günstigste", "Marktpreis", "Geprüfte Angebote", "Preisgruppe", "Sicherheit", "EA-Min", "EA-Max"]];
  for (const key of Object.keys(history).sort()) {
    const [id, rating] = key.split(":");
    for (const e of history[key] || []) {
      rows.push([stamp(e.t), names.get(id) || "ID " + id, Number(rating) || "alle", e.lowest, e.countAtLowest, e.market,
        e.sampleSize || "", e.clusterSize || e.band || "", e.confidence || "alte Messung", e.eaMin || "", e.eaMax || ""]);
    }
  }
  downloadCsv("fc27-preisverlauf-" + stamp(Date.now()).slice(0, 10) + ".csv", rows);
}

// ---------------------------------------------------------------------------
// Einstellungen
// ---------------------------------------------------------------------------

// FST-Modus (01.10.2026): einmalige Umstellung fuer ALLE, die den Merker
// fstModusV1 noch nicht haben (Bestandsnutzer, neue Installation, alte
// Sicherung). Gibt true zurueck, wenn umgestellt wurde.
//
// Warum ein Merker: { ...DEFAULTS, ...settings } laesst gespeicherte Werte
// gewinnen. Ein neuer Standardwert erreicht Bestandsnutzer sonst nie - derselbe
// Fehler wie bei rotationV2. Ersetzt wird NUR der alte Standardwert; wer
// selbst etwas eingetragen hat, behaelt es. Danach nie wieder: Schaltet der
// Nutzer den Haken aus, bleibt er aus. Schaltet er ihn wieder an, aendert sich
// keine Zahl.
function fstUmstellung(s, settings) {
  if (settings && settings.fstModusV1) return false;
  s.fstModus = true;
  if (String(s.budget) === "5000") s.budget = "";
  if (String(s.maxBuys) === "3") s.maxBuys = "";
  if (String(s.timeLimitMin) === "30") s.timeLimitMin = "60";
  if (s.pausePreset === "medium") s.pausePreset = "fst";
  if (String(s.filterSearchLimit) === "100") s.filterSearchLimit = "";
  if (String(s.filterBuyLimit) === "3") s.filterBuyLimit = "";
  if ((s.afterBuy || (s.toClub ? "club" : "keep")) === "keep") s.afterBuy = "transfer";
  if (s.gewinnBremse === true) s.gewinnBremse = false;
  if (!s.verkaufPreisLangeNutzen) s.verkaufPreisLangeNutzen = true;
  return true;
}

async function loadSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  const s = { ...DEFAULTS, ...(settings || {}) };
  // Standard-Laufzeit ist seit 22.09.2026 30 statt 300 Minuten: kurze Laeufe
  // fallen weniger auf (FST: 4 bzw. 60 Min.). Wer noch den alten Standard
  // hatte, bekommt einmalig den neuen; ein eigener Wert bleibt, wie er ist.
  if (!(settings && settings.laufzeitV2) && String(s.timeLimitMin) === "300") s.timeLimitMin = DEFAULTS.timeLimitMin;
  // Dasselbe fuer die Rotation (28.09.2026). Gefunden beim Nachmessen gegen
  // FUT Simple Trader.
  //
  // Am 27.09. wurden zwei Standardwerte auf FSTs Zahlen gestellt: die Pause
  // zwischen zwei Filtern von 35 auf 300 Sekunden und die Suchen je Filter
  // von 40 auf 50. Im Code stehen die neuen Zahlen auch - ankommen konnten
  // sie aber nie. Die Zeile darueber macht { ...DEFAULTS, ...settings }, und
  // der gespeicherte Wert gewinnt gegen den Standard. Wer den Bot vorher
  // benutzt hatte, hatte die 35 im Browser liegen und bekam sie jedes Mal
  // zurueck - acht Mal schneller zum naechsten Filter als FST.
  //
  // Das ist derselbe Fehler wie beim Budget-Schalter am 27.09.: Der neue
  // Wert stand im Code, kam beim Nutzer aber nie an.
  //
  // Ersetzt wird NUR der alte Standardwert, und nur einmal. Wer selbst etwas
  // eingetragen hat, behaelt es.
  if (!(settings && settings.rotationV2)) {
    if (String(s.rotPauseS) === "35") s.rotPauseS = DEFAULTS.rotPauseS;
    if (String(s.rotSuchenProFilter) === "40") s.rotSuchenProFilter = DEFAULTS.rotSuchenProFilter;
  }
  $("playerName").value = s.playerName;
  // FST-Modus (01.10.2026): einmalige Umstellung, siehe fstUmstellung.
  const fstUmstellen = fstUmstellung(s, settings);
  for (const field of NUMBER_FIELDS) $(field).value = s[field];
  for (const field of CHECK_FIELDS) $(field).checked = Boolean(s[field]);
  for (const field of SELECT_FIELDS) {
    const el = $(field);
    if (!el) continue;
    el.value = s[field];
    // Ein gespeicherter Wert, den es nicht mehr gibt, wuerde das Feld leer
    // lassen - dann zeigt der Browser stumm den ersten Eintrag.
    if (el.value !== s[field]) el.value = DEFAULTS[field];
  }
  tonLautstaerkeZeigen();
  // Der Budget-Schalter MUSS mit geladen werden (28.09.2026).
  //
  // Er wurde gespeichert, aber beim Laden nie zurueckgeholt - und stand darum
  // bei jedem Start wieder auf "Auto". budgetAutoAnwenden() hat dann das
  // eingetragene Budget stillschweigend durch den ganzen Kontostand ersetzt.
  // Wer 5.000 eingetragen hatte und 187.000 Coins besass, dessen Lauf durfte
  // plotzlich 187.000 ausgeben. Ohne Hinweis, ohne Zutun.
  //
  // Der Standard ist jetzt AUS: Wer den Schalter noch nie gesehen hat, behaelt
  // sein Budget. Eine Einstellung, die Geld betrifft, darf sich niemals von
  // selbst einschalten.
  budgetAuto = s.budgetAuto === true;
  renderBudgetMode();
  // Alte Einstellung "toClub" weiter verstehen, damit niemand sie neu setzen muss.
  setAfterBuy(s.afterBuy || (s.toClub ? "club" : "keep"));
  renderAutoModus();
  syncAutoBudget(); // Auto-Bereich zeigt dieselben Werte wie Schritt 4
  renderAutoEinstellungen();
  renderProfitSetting();
  selected = Number(s.playerId) > 0 ? { id: Number(s.playerId), name: s.playerName, rating: Number(s.playerRating) || 0 } : null;
  targets = sanitizeTargets(s.targets);
  renderTargets(true);
  renderAddButton();
  // Erst jetzt speichern: saveSettings liest die Felder, und die stehen nun
  // alle richtig. Der Motor liest fstModus erst aus dem Speicher (Aenderung
  // am Speicher) - bis dahin gilt dort streng.
  if (fstUmstellen) await saveSettings();
  fstFelderAnpassen();
}

function renderProfitSetting() {
  const smart = $("smartProfit").checked;
  $("minProfit").disabled = smart;
  $("minProfit").title = smart ? "Auto-Gewinn berechnet ihn passend zum Kartenpreis." : "Dieser feste Coin-Betrag wird verwendet.";
}

function saveSettings() {
  const settings = {
    playerName: $("playerName").value,
    playerId: selected ? String(selected.id) : "",
    playerRating: selected ? String(selected.rating || "") : ""
  };
  for (const field of NUMBER_FIELDS) settings[field] = $(field).value;
  for (const field of CHECK_FIELDS) settings[field] = $(field).checked;
  for (const field of SELECT_FIELDS) settings[field] = $(field).value;
  settings.afterBuy = afterBuyValue();
  settings.targets = targets;
  settings.laufzeitV2 = true; // Umstellung 300 -> 30 Min. ist erledigt
  settings.rotationV2 = true; // Umstellung 35 -> 300 Sek. und 40 -> 50 Suchen ist erledigt
  settings.fstModusV1 = true; // Umstellung auf den FST-Modus ist erledigt (01.10.2026)
  settings.budgetAuto = budgetAuto; // Budget: Auto oder Eigene (27.09.2026)
  speicherungAt = Date.now();
  return chrome.storage.local.set({ settings });
}

// ---------------------------------------------------------------------------
// Verbindung zum Bot im Web-App-Tab
// ---------------------------------------------------------------------------

async function webAppTab() {
  // In der Seite wird diese Funktion nie gebraucht: send() geht dort direkt
  // an content.js, ohne Tabs und ohne Nachrichten.
  //
  // Hier laeuft also das eigene Fenster - der Rueckfallweg ueber das Symbol,
  // wenn die Leiste in der Seite nicht steht. Der aktive Tab ist dann WIR
  // selbst, nicht die Web App - deshalb wird sie unter allen Tabs gesucht.
  // Der Filter laeuft trotzdem noch einmal ueber WEB_APP_RE: Das Muster in
  // der Abfrage ist grober als unseres, und ein Kaufbefehl darf nur an eine
  // Adresse gehen, die wir selbst geprueft haben.
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: "https://www.ea.com/*ultimate-team/web-app*" });
  } catch (e) {
    tabs = [];
  }
  const passend = tabs.filter((t) => WEB_APP_RE.test(t.url || ""));
  return passend.find((t) => t.active) || passend[0] || null;
}

let connectionRepair = null;

async function probeBot(tabId, legacy) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { cmd: legacy ? "status" : wireCommand("status") }, { frameId: 0 });
    return res && res.status ? res : null;
  } catch (e) {
    return null;
  }
}

async function upgradePageConnection(tabId) {
  if (!chrome.tabs || typeof chrome.tabs.reload !== "function") return null;
  await chrome.tabs.reload(tabId, { bypassCache: true });
  // Beim Reload wird das aktuelle declarative Content-Script geladen. Die Web
  // App braucht einige Sekunden, bis sie wieder ihre EA-Session meldet.
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const ready = await probeBot(tabId, false);
    if (ready && ready.status && ready.status.session) return ready;
  }
  return null;
}

async function send(cmd, extra) {
  // In der Seite: derselbe Prozess wie der Bot. Der Befehl geht als direkter
  // Funktionsaufruf an content.js - kein Tab-Suchen, kein Nachrichtenweg,
  // keine verlorenen Antworten. Alles unterhalb dieser Zeilen ist nur noch
  // fuer das eigene Fenster da.
  if (BOT) {
    try {
      return BOT(cmd, extra) || { ok: false, error: "Keine Antwort vom Bot." };
    } catch (e) {
      return { ok: false, error: "Befehl fehlgeschlagen: " + e.message };
    }
  }
  const tab = await webAppTab();
  if (!tab) return { ok: false, error: "Öffne den Tab mit der FC Web App und klick dann erneut aufs Icon." };
  try {
    let ready = await probeBot(tab.id);
    let legacy = false;
    if (!ready) {
      const canInject = Boolean(chrome.scripting && typeof chrome.scripting.executeScript === "function");
      if (canInject) {
        if (!connectionRepair) {
          connectionRepair = (async () => {
            await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, files: ["sniffer.js"], world: "MAIN", injectImmediately: true });
            await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, files: ["content.js"], world: "ISOLATED", injectImmediately: true });
          })().finally(() => { connectionRepair = null; });
        }
        await connectionRepair;
        ready = await probeBot(tab.id);
      }
      // Rueckfallweg fuer einen Browserzustand, in dem die scripting-API nach
      // einem Erweiterungsupdate noch nicht freigeschaltet wurde.
      if (!ready) {
        ready = await probeBot(tab.id, true);
        legacy = Boolean(ready);
      }
      if (!ready) return { ok: false, error: canInject
        ? "Verbindungstest fehlgeschlagen. Bitte die EA-Seite einmal vollständig neu laden."
        : "Die automatische Reparatur ist in diesem Browser noch nicht freigeschaltet. Bitte die Erweiterung unter chrome://extensions einmal neu laden.", status: null };
    }
    if (cmd === "status") return ready;
    if (legacy) {
      const upgraded = await upgradePageConnection(tab.id);
      if (!upgraded) {
        return {
          ok: false,
          error: "Die EA-Seite wurde automatisch aktualisiert. Öffne dort einmal den Transfermarkt und versuche es danach erneut.",
          status: ready.status
        };
      }
      ready = upgraded;
      legacy = false;
    }
    // Aktionen niemals automatisch wiederholen: Ein Kaufstart koennte trotz
    // verlorener Antwort bereits angekommen sein.
    const res = await chrome.tabs.sendMessage(tab.id, { ...extra, cmd: legacy ? cmd : wireCommand(cmd) }, { frameId: 0 });
    if (res) return res;

    // Eine Chrome-Nachricht kann ihre Antwort verlieren, obwohl der Befehl im
    // Tab angekommen ist. Nie blind wiederholen; stattdessen den Zustand lesen.
    await new Promise((resolve) => setTimeout(resolve, 150));
    const after = await probeBot(tab.id, legacy);
    if (after && after.status) {
      const st = after.status;
      const marketState = st.marketScan || {};
      const checkState = st.check || {};
      const confirmed =
        (cmd === "marketScan" && (marketState.running || marketState.error || marketState.message)) ||
        (cmd === "priceCheck" && (checkState.running || checkState.error || checkState.message)) ||
        (cmd === "start" && st.running) ||
        (cmd === "stop" && !st.running) ||
        (cmd === "ausnahmeStarten" && st.ausnahme && st.ausnahme.aktiv) ||
        (cmd === "ausnahmeBeenden" && st.ausnahme && !st.ausnahme.aktiv);
      if (confirmed) return after;
      return { ok: false, error: "Der Befehl „" + cmd + "“ wurde nicht gestartet.", status: st };
    }
    return { ok: false, error: "Keine Bestätigung für „" + cmd + "“. Die Verbindung zur Web App ist abgebrochen." };
  } catch (e) {
    return { ok: false, error: "Verbindungsfehler: " + e.message };
  }
}

// ---------------------------------------------------------------------------
// Ladeanzeige: Kreis, Titel, Fortschritt und die Schritte des Vorgangs.
// Vorher stand waehrend Preis-Check und Markt-Scan nur ein grauer Satz da -
// man sah nicht, ob und wie weit etwas lief.
// opts: { title, detail, done, total, steps: [..], step }
// ---------------------------------------------------------------------------
function renderLoader(id, opts) {
  const box = $(id);
  if (!box) return;
  if (!opts) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  if (!box.firstChild) {
    box.innerHTML = `<img class="loader-gif" alt="" src="${chrome.runtime.getURL("img/loader.gif")}">
      <div class="loader-body">
        <div class="loader-head"><b class="loader-title"></b><span class="loader-count"></span></div>
        <div class="loader-track"><div class="loader-fill"></div></div>
        <small class="loader-detail"></small>
        <ol class="loader-steps"></ol>
      </div>`;
  }
  box.querySelector(".loader-title").textContent = opts.title || "";
  box.querySelector(".loader-detail").textContent = opts.detail || "";
  const total = Math.max(1, Number(opts.total) || 1);
  const done = Math.max(0, Math.min(total, Number(opts.done) || 0));
  box.querySelector(".loader-count").textContent = opts.total ? done + " / " + total : "";
  box.querySelector(".loader-fill").style.width = Math.round((done / total) * 100) + "%";
  const steps = opts.steps || [];
  const liste = box.querySelector(".loader-steps");
  liste.replaceChildren(...steps.map((text, index) => {
    const li = document.createElement("li");
    li.textContent = text;
    li.className = index < opts.step ? "done" : index === opts.step ? "now" : "";
    return li;
  }));
}

const CHECK_STEPS = ["Angebote sammeln", "Preisgruppe erkennen", "Kontrollmessung"];
function checkLoaderOpts(searches, title) {
  const n = Math.max(1, searches || 0);
  return {
    title: title || "Preis wird geprüft",
    detail: "Suche " + n + " · dauert meist 15 bis 45 Sekunden",
    done: Math.min(n, 12),
    total: 12,
    steps: CHECK_STEPS,
    step: n < 12 ? 0 : n === 12 ? 1 : 2
  };
}

// ---------------------------------------------------------------------------
// Start-Sperre: EIN Satz fuer alle Knoepfe, die etwas bei EA anstossen
// (Autopilot, Preis pruefen, Markt scannen, Sniping vorbereiten, Jetzt
// starten, Laden & starten). Frueher pruefte nur der versteckte Start-Knopf -
// die sichtbaren waren gruen, und erst der Bot lehnte ab. Leer heisst: frei.
// Die Reihenfolge ist die, in der man es beheben muss.
// ---------------------------------------------------------------------------
function startSperrGrund(st) {
  if (!st) return "Keine Verbindung zur EA-Web-App.";
  if (!st.session) return "Nicht verbunden: Öffne in der Web App einmal den Transfermarkt.";
  const cooldown = st.cooldown && st.cooldown.leftMin > 0 ? st.cooldown : null;
  if (cooldown) return "Sperre noch " + cooldown.leftMin + " Min." + (cooldown.reason ? " Grund: " + cooldown.reason : "");
  if (st.running) return "Der Bot läuft gerade. Erst stoppen.";
  if (st.check && st.check.running) return "Ein Preis-Check läuft gerade.";
  if (st.marketScan && st.marketScan.running) return "Der Markt-Scan läuft gerade.";
  return "";
}

function aktuelleSperre() {
  return startSperrGrund(letzterStatus);
}

// Vor einem Start den Stand frisch holen: letzterStatus stammt vom letzten
// Poll. Direkt nach einer Preispruefung meldet er sonst noch "Preis-Check
// laeuft" - oder umgekehrt noch "frei", obwohl die Sperre schon greift.
async function frischeSperre() {
  const res = await send("status");
  render(res);
  return startSperrGrund(res && res.status);
}

function renderCheck(st) {
  const check = (st && st.check) || {};
  const button = $("check");
  const sperre = startSperrGrund(st);
  button.disabled = !selected || Boolean(sperre);
  button.textContent = check.running ? "Prüfe Preis … Suche " + Math.max(1, check.searches || 0) : "Preis prüfen";

  const msg = $("check-msg");
  renderLoader("check-loader", check.running && !checkNotice ? checkLoaderOpts(check.searches) : null);
  if (checkNotice) {
    msg.className = "hint err";
    msg.textContent = checkNotice;
  } else if (check.running) {
    msg.className = "hint";
    msg.textContent = "";
  } else if (sperre) {
    // Warum der Knopf grau ist - sonst sieht man nur einen toten Knopf.
    msg.className = "hint warn";
    msg.textContent = sperre;
  } else if (check.error) {
    msg.className = "hint err";
    msg.textContent = check.error;
  } else {
    msg.className = "hint";
    msg.textContent = check.message || "";
  }
}

// ---------------------------------------------------------------------------
// Auto-Modus & Live-HUD (Laufbildschirm während des Snipings)
// ---------------------------------------------------------------------------

let currentSnipeMode = "auto";
let autoSelectedPlayer = null;
let autoCalculatedTarget = 0;
let autoStartBereit = false; // Spieler und Preis erlauben einen Autopilot-Start
let autoStartLaeuft = false; // startAutoRun ist unterwegs und fuehrt Knopf und Zeile selbst
let autoFehler = ""; // letzter Fehler des Autopiloten, bleibt bis zum naechsten geglueckten Start

function setSnipeMode(mode) {
  currentSnipeMode = mode;
  const btns = WURZEL.querySelectorAll("#snipe-mode-selector button");
  for (const b of btns) {
    b.classList.toggle("active", b.dataset.mode === mode);
  }
  const autoPanel = $("snipe-auto-panel");
  const manualPanel = $("snipe-manual-panel");
  if (autoPanel) autoPanel.hidden = mode !== "auto";
  if (manualPanel) manualPanel.hidden = mode !== "manual";
}

function renderAutoSuggestions() {
  const input = $("autoPlayerName");
  if (!input) return;
  const text = input.value;
  const hits = autoSelectedPlayer && text === autoSelectedPlayer.name ? [] : findPlayers(text);
  const container = $("auto-suggestions");
  if (!container) return;
  container.replaceChildren(
    ...hits.map((p) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "suggestion";
      const name = document.createElement("span");
      name.className = "label";
      name.textContent = p.name;
      const rating = document.createElement("span");
      rating.className = "rating";
      rating.textContent = p.rating || "";
      button.append(portrait(p.id, p.name), name, rating);
      button.addEventListener("click", () => chooseAutoPlayer(p));
      return button;
    })
  );
}

// Es gibt nur EINEN gewaehlten Spieler: "selected" mit Name- und Rating-Feld
// im Manuellen Modus. Der Auto-Modus zeigt dieselbe Auswahl und schreibt in
// dieselben Felder. Vorher hatte jeder Modus seinen eigenen Spieler - im Auto-
// Modus stand z. B. Xhaka, im Manuellen Malen, und man wusste nicht mehr, wen
// der Bot kauft.
function chooseAutoPlayer(player) {
  choose(player); // setzt selected + Felder oben, speichert, ruft syncAutoFromSelected
}

let autoSyncKey = "";

function syncAutoFromSelected() {
  if (!$("autoPlayerName")) return;
  const rating = ratingValue();
  const key = JSON.stringify([selected && selected.id, $("playerName").value, $("rating").value, $("rarity").value]);
  if (key === autoSyncKey) return; // bei jedem Poll aufgerufen - nur bei Aenderung neu zeichnen
  autoSyncKey = key;
  autoSelectedPlayer = selected ? { id: selected.id, name: selected.name, rating } : null;
  if ($("autoPlayerName").value !== $("playerName").value) $("autoPlayerName").value = $("playerName").value;
  if ($("autoRating").value !== $("rating").value) $("autoRating").value = $("rating").value;
  renderAutoSuggestions();
  const card = $("auto-player-card");
  if (card) {
    card.hidden = !selected;
    if (selected) {
      $("auto-pc-portrait").replaceChildren(portrait(selected.id, selected.name, true));
      $("auto-pc-name").textContent = selected.name;
      $("auto-pc-rating").textContent = rating ? String(rating) : "";
      $("auto-pc-version").textContent = rating ? "Nur die Version mit Rating " + rating : "Alle Versionen dieses Spielers";
    }
  }
  updateAutoCalculation();
}

// Neuester gespeicherter Preis fuer den gewaehlten Spieler (history haelt je
// Schluessel eine LISTE von Messungen, der letzte Eintrag ist der aktuelle).
function autoLatestEntry() {
  if (!autoSelectedPlayer) return null;
  const entries = history[targetKey({ playerId: autoSelectedPlayer.id, rating: autoSelectedPlayer.rating })];
  return Array.isArray(entries) && entries.length ? entries[entries.length - 1] : null;
}

// Rechnet mit derselben Formel wie der Manuelle Modus (suggestionFor):
// Abschlag, 5 % EA-Gebuehr, Mindestgewinn, EA-Preisspanne. Eine zweite,
// eigene Formel wuerde frueher oder spaeter andere Zielpreise liefern.
// Die Box zeigt beide Wege einzeln, der niedrigere gilt. Frueher fehlte der
// Abschlag, und Marktpreis minus Gebuehr minus Gewinn ergab nicht den Zielpreis.
// Betraege nur als Zahl: Die Muenze davor setzt das Stylesheet; no-coin nimmt
// sie weg, wo keine Zahl steht ("–", "kein Gewinn möglich").
function updateAutoCalculation() {
  const box = $("auto-calc-box");
  const startBtn = $("auto-start-btn");
  if (!autoSelectedPlayer) {
    if (box) box.hidden = true;
    autoStartBereit = false;
    renderAutoStartKnopf();
    return;
  }
  const entry = autoLatestEntry();
  if (box) box.hidden = false;
  const betrag = (id, text, mitMuenze) => {
    $(id).textContent = text;
    $(id).classList.toggle("no-coin", !mitMuenze);
  };
  $("auto-weg-abschlag").classList.remove("gilt");
  $("auto-weg-gewinn").classList.remove("gilt");
  if (!entry || !(entry.market > 0)) {
    if ($("auto-market-label")) $("auto-market-label").textContent = "Marktpreis";
    betrag("auto-market-price", "Wird beim Start geprüft …", false);
    $("auto-discount-label").textContent = "Weg 1: − Abschlag";
    $("auto-discount").textContent = "–";
    $("auto-profit-label").textContent = "Weg 2: − 5 % EA-Gebühr − Mindestgewinn";
    $("auto-profit-path").textContent = "–";
    betrag("auto-target-price", "–", false);
    $("auto-calc-note").textContent = "";
    autoStartBereit = true;
    if (startBtn) startBtn.textContent = "Preis prüfen & Autopilot starten";
    renderAutoStartKnopf();
    return;
  }
  const s = suggestionFor(entry);
  autoCalculatedTarget = s.value;
  // Verkaufspreis statt Marktpreis: bei lange stehenden Angeboten etwas weniger (F1).
  const verkauf = s.verkaufspreis;
  const abschlag = verkauf - Math.floor(verkauf * (1 - s.effectiveDiscount / 100));
  if ($("auto-market-label")) $("auto-market-label").textContent = s.verkauf.quelle === "alter" ? "Verkaufspreis nach Alter" : "Marktpreis";
  betrag("auto-market-price", fmt(verkauf), true);
  $("auto-discount-label").textContent = "Weg 1: − " + s.effectiveDiscount + " % dein Abschlag (" + fmt(abschlag) + ")";
  $("auto-discount").textContent = fmt(Math.max(0, s.byDiscount));
  $("auto-profit-label").textContent = "Schritt 2: − 5 % EA-Gebühr (" + fmt(verkauf - s.saleNet) + ") − Mindestgewinn (" + fmt(s.targetProfit) + ")";
  $("auto-profit-path").textContent = fmt(Math.max(0, s.byProfit));
  const mitGewinn = s.value > 0 && s.value < s.saleNet;
  betrag("auto-target-price", mitGewinn ? fmt(s.value) : "kein Gewinn möglich", mitGewinn);
  // Welcher Weg den Preis bestimmt. Hebt oder deckelt die EA-Preisspanne ihn,
  // gilt keiner der beiden - das steht dann in der Zeile darunter.
  const weg = s.byDiscount <= s.byProfit ? 1 : 2;
  if (!s.eaGrenze) {
    $("auto-weg-abschlag").classList.toggle("gilt", s.byDiscount <= s.byProfit);
    $("auto-weg-gewinn").classList.toggle("gilt", s.byProfit <= s.byDiscount);
  }
  $("auto-calc-note").textContent = [
    s.verkauf.quelle === "alter" ? "Marktpreis " + fmt(entry.market) + ". " + verkaufsPreisGrund(s.verkauf) : "",
    s.eaGrenze === "min" ? "Auf das EA-Minimum angehoben." : s.eaGrenze === "max" ? "Auf das EA-Maximum begrenzt."
      : s.byDiscount === s.byProfit ? "Beide Wege gleich." : "Weg " + weg + " ist niedriger und gilt.",
    "Auf gültige Preisstufen abgerundet.",
    s.unterMindest ? "Unter " + fmt(s.mindest) + " Coins lohnt sich Handeln kaum." : "",
    mitGewinn ? "" : "Nach 5 % EA-Gebühr bliebe kein Gewinn."
  ].filter(Boolean).join(" ");
  autoStartBereit = mitGewinn;
  if (startBtn) {
    startBtn.textContent = Date.now() - entry.t > PRICE_FRESH_MS
      ? "Preis neu prüfen & Autopilot starten"
      : "Autopilot starten (bis " + fmt(s.value) + " Coins)";
  }
  renderAutoStartKnopf();
}

// Budget und Max. Kaeufe gibt es nur EINMAL, wie den Spieler: die Felder aus
// Schritt 4. Die Felder im Auto-Bereich zeigen dieselben Werte; Eingaben dort
// landen in den gemeinsamen Feldern (Horcher unten).
const AUTO_SPIEGEL = [["autoBudget", "budget"], ["autoMaxBuys", "maxBuys"]];

function syncAutoBudget() {
  for (const [auto, gemeinsam] of AUTO_SPIEGEL) {
    if ($(auto) && $(auto).value !== $(gemeinsam).value) $(auto).value = $(gemeinsam).value;
  }
}

// ---------------------------------------------------------------------------
// Budget: Auto oder Eigene (27.09.2026)
// Auto heisst: das ganze Guthaben - so macht es FUT Simple Trader
// (scripts.js Z. 41939: max_coins_to_trade = currentCoins), und der Satz
// darunter nennt die Zahl ("Nutzt dein ganzes Guthaben - 187K").
// Warum das noetig war: Im Feld stand bei jedem 5.000 Coins. Wer 200.000 hatte,
// war nach einer mittleren Karte fertig und hat den Bot fuer kaputt gehalten.
// Kein stiller Verlust: Ist der Kontostand nicht bekannt, wird NICHTS gesetzt.
// Dann bleibt die eingetragene Zahl stehen, das Feld bleibt sichtbar, und der
// Satz sagt offen, dass die echte Zahl noch fehlt.
// Es wird dafuer nichts bei EA angefragt - der Kontostand liegt schon vor.
// ---------------------------------------------------------------------------

// AUS als Startwert (28.09.2026). Vorher stand hier true - zusammen damit,
// dass loadSettings den Wert nie zurueckholte, wurde bei jedem Start das
// eingetragene Budget durch den Kontostand ersetzt. Eine Einstellung, die
// ueber Geld entscheidet, faengt bei "der Nutzer hat nichts gesagt" an.
let budgetAuto = false;

// Leeres Budget-Feld heisst "ohne Grenze - nur der Kontostand bremst"
// (28.09.2026, wie FUT Simple Trader: im Snipe-Modus gibt es dort gar kein
// Gesamt-Budget, nur die Live-Frage "reichen die Coins?", scripts.js
// Z. 58503-58525). Eine 0 heisst NICHT "ohne Grenze" - sonst wuerde ein
// aufgebrauchtes Rotations-Rest-Budget still zu "unbegrenzt".
function budgetOhneGrenze() {
  return String($("budget").value).trim() === "";
}

// Kurzform wie bei FST (scripts.js Z. 40146-40148): 187K statt 187.000.
function kurzCoins(zahl) {
  if (zahl >= 1e6) return (zahl / 1e6).toFixed(zahl >= 1e7 ? 0 : 1).replace(".", ",") + "M";
  if (zahl >= 1000) return Math.round(zahl / 1000) + "K";
  return fmt(zahl);
}

// Der Kontostand, den der Bot zuletzt von EA gemeldet hat - oder null.
function guthabenJetzt() {
  const st = lastRes && lastRes.status ? lastRes.status : null;
  const coins = st && st.credits != null ? Number(st.credits) : NaN;
  return Number.isFinite(coins) && coins >= 0 ? coins : null;
}

function budgetAutoText() {
  const coins = guthabenJetzt();
  if (coins === null) {
    return "Auto: Nimmt dein ganzes Guthaben. Der Kontostand ist noch nicht bekannt – bis dahin gilt die Zahl im Feld (" +
      fmt(Number($("budget").value) || 0) + " Coins). Lade die Web App einmal, dann steht hier deine echte Zahl.";
  }
  return "Auto: Nimmt dein ganzes Guthaben – " + kurzCoins(coins) + " (" + fmt(coins) + " Coins). „Max. Käufe“ bremst weiter: höchstens " +
    (Number($("maxBuys").value) || 0) + " Karten je Lauf.";
}

// Traegt das Guthaben ins Budget-Feld ein. Gibt true zurueck, wenn sich dabei
// wirklich etwas geaendert hat - nur dann muss gespeichert werden.
function budgetAutoAnwenden() {
  if (!budgetAuto) return false;
  const coins = guthabenJetzt();
  if (coins === null) return false;
  const neu = String(coins);
  if ($("budget").value === neu) return false;
  $("budget").value = neu;
  syncAutoBudget();
  return true;
}

function renderBudgetMode() {
  const box = $("budget-mode");
  if (!box) return;
  for (const knopf of box.querySelectorAll("button")) {
    knopf.classList.toggle("active", (knopf.dataset.mode === "auto") === budgetAuto);
  }
  // Das Feld nur wegnehmen, wenn Auto wirklich eine Zahl hat. Sonst stuende in
  // Schritt 4 "Trag ein Budget ein" ueber einem Feld, das nicht da ist.
  const versteckt = budgetAuto && guthabenJetzt() !== null;
  if ($("budget-feld")) $("budget-feld").hidden = versteckt;
  const satz = $("budget-auto-text");
  if (satz) {
    satz.hidden = !budgetAuto;
    if (budgetAuto) satz.textContent = budgetAutoText();
  }
}

function setBudgetAuto(an) {
  budgetAuto = Boolean(an);
  budgetAutoAnwenden();
  renderBudgetMode();
  renderStep();
  renderAutoEinstellungen();
  saveSettings();
}

if ($("budget-mode")) {
  for (const knopf of $("budget-mode").querySelectorAll("button")) {
    knopf.addEventListener("click", () => setBudgetAuto(knopf.dataset.mode === "auto"));
  }
}
// Wer die Zahl selbst antippt, will sie selbst bestimmen - dann springt der
// Schalter von allein auf "Eigene". Sonst wuerde die naechste Antwort des Bots
// die Eingabe wieder ueberschreiben, und das saehe wie ein Fehler aus.
for (const feld of ["budget", "autoBudget"]) {
  if ($(feld)) $(feld).addEventListener("input", () => { if (budgetAuto) setBudgetAuto(false); });
}

// Welche Einstellungen der Autopilot sonst noch mitnimmt. Sie stehen im
// Manuellen Modus (Schritt 5 und Start-Fenster) - ohne diese Zeile galten sie
// im Auto-Modus unsichtbar.
const TEMPO_TEXT = { safe: "Sicher", normal: "Normal", turbo: "Turbo (mehr Risiko)" };
// "aus" seit 27.09.2026. Ohne den Eintrag stuende in der Uebersicht
// faelschlich "Pausen ausgewogen", obwohl keine gemacht werden.
const PAUSEN_TEXT = { off: "aus", short: "kurz", medium: "ausgewogen", long: "lang", fst: "wie FST" };
const DANACH_TEXT = { transfer: "auf die Transferliste", club: "in den Verein", keep: "liegen lassen", list: "gleich verkaufen" };

function renderAutoEinstellungen() {
  // Vor dem Rest, und bewusst nicht hinter dem "if (!el) return" unten:
  // Die Laufzeit-Zeile hat ihr eigenes Feld und soll auch dann stimmen, wenn
  // die Zusammenfassung gerade nicht auf dem Bildschirm ist.
  renderLaufzeit(letzterStatus);
  const el = $("auto-settings");
  if (!el) return;
  const teile = [
    "Tempo " + (TEMPO_TEXT[$("speedMode").value] || TEMPO_TEXT.normal),
    "Pausen " + (PAUSEN_TEXT[$("pausePreset").value] || PAUSEN_TEXT.medium),
    "nach dem Kauf " + DANACH_TEXT[afterBuyValue()],
    "nur Sofortkauf",
    fstAn() && !(Number($("filterSearchLimit").value) > 0) ? "ohne Grenze für Suchen je Spieler" : "bis " + (Number($("filterSearchLimit").value) || 100) + " Suchen"
  ];
  const minuten = Number($("timeLimitMin").value) || 0;
  if (minuten > 0 && minuten < 300) teile.push("höchstens " + minuten + " Min.");
  const coins = Number($("filterSpendLimit").value) || 0;
  if (coins > 0) teile.push("höchstens " + fmt(coins) + " Coins je Spieler");
  const text = "Es gilt: " + teile.join(" · ") + "." +
    ((Number($("maxBuys").value) || 0) > 20 && !fstAn() ? " Je Spieler kauft der Bot höchstens 20 am Tag." : "") +
    " Ändern unter Manuell.";
  if (el.textContent !== text) el.textContent = text;
  // Plan der Rotation: wie viele Filter und wie viele Suchen das ungefaehr wird.
  const plan = $("rot-plan");
  if (plan) {
    if (!$("rotationModus") || !$("rotationModus").checked) {
      plan.textContent = "";
    } else {
      const u = (letzterStatus && letzterStatus.usage) || {};
      const restTag = Math.max(0, (Number(u.searchLimitDay) || 350) - (Number(u.searchesDay) || 0));
      const restStunde = Math.max(0, (Number(u.searchLimitHour) || 150) - (Number(u.searchesHour) || 0));
      // 28.09.2026: Nicht mehr "hoechstens 12". Die 12 ist eine Sicherung aus
      // content.js, keine Vorhersage - und sie wird bei 50 Suchen je Filter
      // nie erreicht. Hier steht jetzt, was das Budget wirklich hergibt.
      const moeglich = rotFilterMoeglich(true);
      const da = rotationKandidaten().length;
      const n = Math.min(moeglich.tag, da);
      plan.className = "hint";
      if (fstAn()) {
        // FST-Modus: Keine Grenze fuer Suchen oder Filter. Der Bot faehrt Filter
        // um Filter, bis die Laufzeit um ist.
        plan.textContent = da ? "Ohne eigene Grenzen: Der Bot fährt Filter für Filter, bis die Laufzeit um ist. Es gibt keine Grenze für Suchen." : "";
      } else if (!da) {
        // Ohne Filter steht der Hinweis schon in der Reihe darueber.
        plan.textContent = "";
      } else if (!n) {
        // Frueher stand hier gar nichts, wenn das Budget leer war. Dann sah
        // es aus, als sei die Anzeige kaputt.
        plan.textContent = "Das Suchbudget reicht gerade für keinen weiteren Filter. Heute sind noch " +
          restTag + " Suchen frei, diese Stunde " + restStunde + " – davon bleiben " + ROT_PUFFER + " als Reserve stehen.";
      } else {
        plan.textContent = "Plan: diese Stunde etwa " + Math.min(moeglich.stunde, da) + ", heute noch etwa " + n +
          " Filter – zusammen rund " + fmt(n * moeglich.proFilter) + " Suchen. Frei sind heute " + restTag +
          ", diese Stunde " + restStunde + ".";
      }
    }
  }
}

// Autopilot-Knopf und die Zeile darunter: gesperrt mit Grund, sonst frei.
// Waehrend startAutoRun laeuft, fuehrt es selbst Regie - sonst wuerde jeder
// Poll den Knopf mitten im Start wieder freigeben.
function renderAutoStartKnopf() {
  const startBtn = $("auto-start-btn");
  const msg = $("auto-start-msg");
  if (!startBtn || !msg || autoStartLaeuft) return;
  if (rotationLaeuft) {
    startBtn.disabled = true;
    startBtn.textContent = "Rotation läuft …";
    msg.className = "hint";
    msg.textContent = rotationText;
    return;
  }
  if ($("rotationModus") && $("rotationModus").checked) {
    const kandidaten = rotationKandidaten();
    startBtn.disabled = !kandidaten.length || Boolean(aktuelleSperre());
    // 25.09.2026: Auch hier den letzten Autopilot-Hinweis zeigen. Sonst bliebe
    // die Meldung "Rotation vom Neuladen beendet" unsichtbar - der Haken
    // "Rotation" ist nach einer Rotation ja noch gesetzt. Eine laufende Sperre
    // ist wichtiger und behaelt den Vortritt.
    if (autoFehler && !aktuelleSperre()) {
      startBtn.textContent = "Mehrere Filter nacheinander starten";
      msg.className = "hint err";
      msg.textContent = autoFehler;
      return;
    }
    startBtn.textContent = "Mehrere Filter nacheinander starten";
    msg.className = kandidaten.length ? "hint" : "hint warn";
    // 27.09.2026: Auch hier den Grund nennen, wenn die eigene Auswahl
    // (Wertung, Abzeichen) alle Filter aussortiert.
    msg.textContent = kandidaten.length
      ? ""
      : rotationKandidaten(true).length && rotAuswahlAktiv()
        ? "Es gibt passende Live-Filter, aber deine Auswahl unter „Welche Filter der Bot fahren darf“ lässt keinen davon zu. Setze „Wertung mindestens“ herunter oder setze mehr Haken bei den Abzeichen."
        : "Gerade gibt es keinen passenden Live-Filter. Scanne den EA-Markt im Reiter Filter.";
    const sperre = aktuelleSperre();
    if (sperre) {
      msg.className = "hint warn";
      msg.textContent = sperre;
    }
    return;
  }
  const sperre = aktuelleSperre();
  startBtn.disabled = !autoStartBereit || Boolean(sperre);
  msg.className = autoFehler ? "hint err" : sperre ? "hint warn" : "hint";
  msg.textContent = [autoFehler, sperre === autoFehler ? "" : sperre].filter(Boolean).join(" ");
}

// Was beim Autopilot anders ist als gespeichert - gilt nur fuer diesen Lauf.
// Er sucht EINEN Spieler, also darf der bis Max. Kaeufe kaufen; mit den
// gespeicherten 3 Aktionen je Filter stoppte er sonst still nach 3 Kaeufen.
// Mehr als 20 je Spieler laesst der Bot ohnehin nicht zu (Tageslimit je Karte).
// Gebote aus: Der Autopilot kauft nur sofort.
function autoLauf() {
  const maxBuys = Math.floor(Number($("maxBuys").value)) || 0;
  // Leeres Feld "Max. Kaeufe" heisst "ohne eigene Grenze" (27.09.2026). Dann
  // gilt fuer den einen Autopilot-Spieler das Hoechste, was der Bot je Spieler
  // ueberhaupt zulaesst (20 am Tag) - nicht 1, wie die alte Rechnung ergab.
  // FST-Modus: leeres Feld = keine Grenze je Spieler (der Motor versteht "").
  if (fstAn()) return { filterBuyLimit: maxBuys > 0 ? maxBuys : "", bidSniping: false };
  return { filterBuyLimit: Math.min(20, Math.max(1, maxBuys || 20)), bidSniping: false };
}

async function startAutoRun() {
  if (!autoSelectedPlayer || autoStartLaeuft) return;
  const startBtn = $("auto-start-btn");
  const msg = $("auto-start-msg");
  const spieler = { ...autoSelectedPlayer };
  const key = targetKey({ playerId: spieler.id, rating: spieler.rating });
  autoStartLaeuft = true;
  if (startBtn) startBtn.disabled = true;
  try {
    // Zuerst die Sperre, mit frischem Stand. Sonst laeuft erst ein Preis-Check
    // an, bevor der Bot den Start ablehnt. Den Grund zeigt renderAutoStartKnopf.
    if (await frischeSperre()) return;
    // Budget und Max. Kaeufe sind die gemeinsamen Felder aus Schritt 4 - der
    // Autopilot liest sie nur. Frueher schrieb er seine eigenen Werte still
    // hinein, und die galten danach auch fuer jeden manuellen Lauf.
    const lauf = autoLauf();
    const ziel = { playerId: spieler.id, playerName: spieler.name, rating: spieler.rating || 0, rarity: rarityValue(), maxPrice: 0 };
    // Dieselben Grenzen wie im Start-Fenster, schon vor dem Preis-Check: Was
    // ohnehin scheitert, soll keine EA-Anfragen kosten.
    const vorab = startPruefung([ziel], lauf).blockers;
    if (vorab.length) throw new Error(vorab[0]);
    // Leeres Budget-Feld heisst seit 28.09.2026 "ohne Grenze" (wie FST)
    // und darf starten. Nur die echte 0 wird VOR dem Preis-Check gemeldet -
    // frueher kostete es bis zu 15 Suchen, bis "Budget reicht nicht" kam.
    if (!budgetOhneGrenze() && !(Number($("budget").value) > 0)) throw new Error("Trag zuerst ein Budget ein – oder lass das Feld leer für „ohne Grenze“.");
    let entry = autoLatestEntry();
    if (!entry || !(entry.market > 0) || Date.now() - entry.t > PRICE_FRESH_MS) {
      msg.className = "hint";
      msg.textContent = "";
      renderLoader("auto-loader", checkLoaderOpts(0, "Marktpreis wird geprüft"));
      // Dieselbe Preispruefung wie Filter und manueller Start. Scheitert sie,
      // wird NICHT gestartet - frueher wurde dann mit erfundenen 10.000 Coins
      // als Marktpreis gerechnet.
      entry = await awaitFreshPrice(
        { id: spieler.id, name: spieler.name }, spieler.rating, key,
        (n) => { renderLoader("auto-loader", checkLoaderOpts(n, "Marktpreis wird geprüft")); },
        null,
        rarityValue()
      );
      await loadData();
      if (!entry) throw new Error("Preisprüfung abgebrochen.");
    }
    const s = suggestionFor(entry);
    // Auch ein Vorschlag, den die EA-Preisspanne ueber den Erloes hebt, heisst:
    // kein Gewinn. Hier pruefen, nicht erst in startRun.
    // FST-Modus (Punkt 10): FSTs Startknopf wird nie gesperrt. Ohne den Haken
    // "Gewinn-Bremse" nur eine gelbe Warnung; mit Haken wie bisher.
    let ohneGewinn = false;
    if (!(s.value > 0) || s.value >= s.saleNet) {
      if (fstAn() && s.value > 0 && !($("gewinnBremse") && $("gewinnBremse").checked)) ohneGewinn = true;
      else throw new Error("Bei diesem Marktpreis ist kein Gewinn möglich – Autopilot startet nicht.");
    }

    const budget = Number($("budget").value) || 0;
    // Leeres Feld: ohne Grenze (28.09.2026). Ob die Coins reichen, prueft
    // der Motor beim Start gegen den echten Kontostand.
    if (!budgetOhneGrenze() && !(budget >= s.value)) throw new Error("Das Budget (" + fmt(budget) + ") reicht nicht für den Zielpreis " + fmt(s.value) + ".");
    const liste = [{ ...ziel, maxPrice: s.value }];
    const sperren = startPruefung(liste, lauf).blockers;
    if (sperren.length) throw new Error(sperren[0]);

    msg.className = ohneGewinn ? "hint warn" : "hint";
    msg.textContent = "Starte " + spieler.name + " mit Zielpreis " + fmt(s.value) + " Coins …" +
      (ohneGewinn ? " Achtung: Bei diesem Marktpreis bleibt kein Gewinn. Die Gewinn-Bremse ist aus." : "");
    const gestartet = await startRun(liste, lauf);
    // Nur ein geglueckter Start raeumt die Meldung weg. Frueher wurde sie
    // auch nach einer Ablehnung geleert - der Bereich stand dann stumm da.
    if (!gestartet) throw new Error(notice || "Der Start hat nicht geklappt.");
    autoFehler = "";
  } catch (error) {
    autoFehler = error && error.message ? error.message : String(error);
  } finally {
    autoStartLaeuft = false;
    renderLoader("auto-loader", null);
    updateAutoCalculation();
  }
}

// ---------------------------------------------------------------------------
// Filter-Wechsel im Autopilot (F4).
//
// FST laesst seinen Server entscheiden, welcher Filter als Naechstes kommt
// (scripts.js Z. 42197-42373). Wir entscheiden das hier selbst: bester
// Live-Filter aus unserem eigenen Scan, danach 300 s Pause (FSTs Wert, seit
// naechstbeste - und ein gerade benutzter Filter kuehlt erst ab.
//
// Die harte Bremse sitzt in content.js (Rotations-Karte): Ohne gueltige
// Karte startet kein weiterer Filter. Jede Sperre, jedes Limit, der
// Stopp-Knopf und der Not-Aus beenden die Rotation sofort.
// ---------------------------------------------------------------------------
let rotationLaeuft = false;
let rotationKarte = 0;
let rotationAbbruch = false;
let rotationFilterNr = 0;
// Wie oft hintereinander war nur der zuletzt gefahrene Filter uebrig
// (25.09.2026). Nach drei leeren Runden wird ehrlich aufgehoert, statt die
// Rotation still ins Leere drehen zu lassen.
let rotationLeerRunden = 0;
let rotationText = "";
// Wie oft diese Rotation schon selbst nachgescannt hat (27.09.2026).
let rotationScans = 0;
const ROT_SCAN_MAX = 2; // hoechstens zwei Nachscans je Rotation
let rotationWarteRunden = 0;
const ROT_WARTE_RUNDEN_MAX = 3; // hoechstens dreimal je Rotation auf freie Suchen warten
let rotationLeerChecks = 0;
// Hoechstens drei Preismessungen je Rotation, die zu keinem Filter fuehren
// (28.09.2026). Eine Gegenprobe hat vorgerechnet, was sonst passieren kann:
// Zehn Spieler in der Zielliste, bei keinem bleibt Gewinn uebrig - das waeren
// zehn Messungen zu je 15 Suchen, also 150. Genau das Stundenlimit, und kein
// einziger Kauf. Dieselbe Falle wie bei der entfernten Nachscan-Ruecklage:
// viel Aufwand, kein Ertrag.
const ROT_LEER_CHECK_MAX = 3;

// Kein frischer Filter mehr da? Dann selbst nachscannen statt aufzuhoeren
// (27.09.2026). FST setzt hier "waitingForFilters" und fragt seinen Server
// nach 20 Sekunden erneut (scripts.js Z. 42230-42235). Wir haben keinen
// Server: Neue Filter kommen bei uns nur aus einem eigenen Markt-Scan.
//
// Der Scan kostet echte Suchen - bis zu 16, und JEDE laeuft durch
// reserveUsage und zaehlt auf Stunden- und Tagesgrenze. Darum vier Bremsen:
// hoechstens zwei Nachscans je Rotation, nur wenn danach noch der Puffer UND
// ein ganzer kleiner Filter uebrig bleiben, nur wenn die Laufzeit noch reicht,
// und nur wenn hinterher wirklich ein Filter dasteht.
//
// Gibt true zurueck, wenn die Rotation weitermachen darf.
// Warum ist Schluss? (28.09.2026)
//
// Bisher stand da nur "Kein frischer Filter mehr uebrig. Scanne den EA-Markt
// neu." Das stimmt, sagt aber nicht, warum es so frueh so weit war. Die
// Nachmessung am 28.09. ergab: Mit den Standardwerten faehrt die Rotation
// zwei Filter, dann ist das Stundenlimit fast leer und die Filterkarten sind
// abgelaufen.
//
// Das ist Mathematik, kein Fehler: 150 Suchen in der Stunde, 50 je Filter,
// dazu 25 Puffer - das sind zwei bis drei Filter. FST hat gar keine
// Stundengrenze und schafft darum rund sieben.
//
// Der Nutzer kann beides selbst aendern. Also sagt der Bot ihm, was.
function rotEndeGrund() {
  const u = (letzterStatus && letzterStatus.usage) || {};
  const restStunde = Math.max(0, (Number(u.searchLimitHour) || 150) - (Number(u.searchesHour) || 0));
  const restTag = Math.max(0, (Number(u.searchLimitDay) || 350) - (Number(u.searchesDay) || 0));
  const jeFilter = rotJeFilter();
  if (restTag < ROT_MIN_SUCHEN) {
    return " Das Tagesbudget ist aufgebraucht. Morgen gibt es wieder " + (Number(u.searchLimitDay) || 350) + " Suchen.";
  }
  if (restStunde < ROT_PUFFER + ROT_MIN_SUCHEN) {
    return " Das Stundenlimit ist fast leer (noch " + restStunde + " Suchen). In den Optionen unter Wartung lässt es sich anheben; " +
      "oder du senkst „Suchen je Filter“ (jetzt " + jeFilter + ") – dann reicht eine Stunde für mehr Filter.";
  }
  // 28.09.2026: Im Listen-Modus laufen keine Filter ab - dort liegt es an
  // den Zielpreisen oder am Budget.
  if ($("rotQuelle") && $("rotQuelle").value === "liste") {
    return " Bei keinem Spieler deiner Liste bleibt gerade Gewinn übrig, oder dein Budget reicht nicht für die Zielpreise.";
  }
  return " Die gescannten Filter sind älter als 15 Minuten geworden. Ein neuer Scan im Reiter Filter bringt frische.";
}

// Auf freie Suchen warten, statt die Rotation zu beenden (28.09.2026).
//
// Der Fund: rotNachscannen wird nur gefragt, wenn die Filterliste leer ist -
// und leer wird sie genau dann, wenn die Suchen der Stunde schon weg sind.
// Nachgerechnet mit Standardwerten: Der Nutzer scannt vor dem Start selbst
// (16 Suchen), Filter 1 und 2 nehmen je 50. Macht 116 von 150. Die Filter
// laufen 15 Minuten nach der Messung ab, Filter 1 und 2 dauern mit Pausen
// rund 17 Minuten. Es sind also 34 Suchen uebrig, wenn die Liste leer wird.
// rotNachscannen verlangt 16 + 25 Puffer + 10 = 51. Es lehnt ab - und liegt
// damit richtig: Nach einem Scan blieben 18 Suchen, davon 25 Puffer. Fuer
// einen Filter bliebe nichts.
//
// Der Nachscan bremst sich also nicht aus Vorsicht. Er wird nur zu dem einen
// Zeitpunkt gefragt, an dem er nie bezahlbar ist.
//
// Die Loesung aendert KEINE Grenze. Das Stundenfenster rollt: Jede Suche
// faellt 60 Minuten nach ihrem Zeitpunkt wieder heraus. Wer wartet, bekommt
// die Suchen geschenkt, ohne dass ein Zaehler angefasst wird. Genau das
// macht FST auch - es setzt 'waitingForFilters' und fragt spaeter wieder.
//
// content.js schickt in jedem Status mit, wann die naechsten Suchen frei
// werden (usage.stundeFreiIn, content.js stundenFensterFrei). Das kostet
// keine EA-Anfrage - gelesen wird nur die eigene Zaehlung.
async function rotScanWarten(rot) {
  if (rotationWarteRunden >= ROT_WARTE_RUNDEN_MAX) return false;
  // Gewartet wird auf Suchen FUER EINEN SCAN. Im Listen-Modus gibt es
  // nichts zu scannen (28.09.2026).
  if ($("rotQuelle") && $("rotQuelle").value === "liste") return false;
  const u = (letzterStatus && letzterStatus.usage) || {};
  const kosten = Number(letzterStatus && letzterStatus.marketScan && letzterStatus.marketScan.maxSearches) || 16;
  const restStunde = Math.max(0, (Number(u.searchLimitHour) || 150) - (Number(u.searchesHour) || 0));
  const restTag = Math.max(0, (Number(u.searchLimitDay) || 350) - (Number(u.searchesDay) || 0));
  const braucht = kosten + ROT_PUFFER + ROT_MIN_SUCHEN;
  // Am Tagesbudget hilft Warten nicht - das faellt erst um Mitternacht zurueck.
  if (restTag < braucht) return false;
  // Schon genug da? Dann ist Warten unnoetig; der Aufrufer hat rotNachscannen
  // bereits gefragt, und das hat aus einem anderen Grund abgelehnt.
  if (restStunde >= braucht) return false;

  const fehlt = braucht - restStunde;
  const freiIn = Array.isArray(u.stundeFreiIn) ? u.stundeFreiIn : [];
  if (!freiIn.length) return false;
  // Die Liste ist bei 60 Eintraegen gekappt (content.js FREI_LISTE_MAX).
  // Fehlen mehr, heisst das NICHT "geht nicht", sondern "warte erst einmal
  // so lange, wie der letzte bekannte Eintrag braucht, und rechne dann neu".
  // Ohne das hoerte der Bot ausgerechnet bei ganz leerer Stunde still auf.
  const teil = fehlt > freiIn.length;
  const wartenMs = Number(teil ? freiIn[freiIn.length - 1] : freiIn[fehlt - 1]) || 0;
  if (!(wartenMs > 0)) return false;

  // Nie ueber das Ende der Rotation hinaus warten, und danach muss noch Zeit
  // fuer einen Scan und einen Filter sein. Sonst waere es Warten umsonst -
  // derselbe Fehler, der bei der Wartepause im Motor schon einmal drin war.
  const ende = Number(rot && rot.endetUm) || 0;
  if (ende > 0 && Date.now() + wartenMs + 5 * 60000 >= ende) return false;

  rotationWarteRunden += 1;
  const min = Math.max(1, Math.round(wartenMs / 60000));
  rotationText = "Alle Filter sind abgelaufen und die Stunde ist voll. Ich warte " + min +
    " Min., bis wieder Suchen frei sind – dann scanne ich neu. (Warten " +
    rotationWarteRunden + " von " + ROT_WARTE_RUNDEN_MAX + ")";
  renderAutoStartKnopf();
  // Der Merker fuers Neuladen muss auch waehrend des Wartens frisch bleiben.
  // Eine Wartezeit liegt komplett INNERHALB einer Schleifenrunde; ohne das
  // hier waere er nach 10 Minuten alt, und der Nutzer erfuehre nach einem
  // Neuladen nicht mehr, dass seine Rotation abgerissen ist.
  rotationMerkerSetzen();
  const ziel = Date.now() + wartenMs;
  const ok = await rotWarten(() => {
    rotationMerkerSetzen();
    return Date.now() >= ziel;
  }, wartenMs + 60000);
  // Das Ergebnis von rotWarten durchreichen: false heisst Stopp, EA-Sperre
  // oder die Rotation gehoert nicht mehr uns. Wer hier true zurueckgibt,
  // behauptet "gewartet und alles in Ordnung" - das waere gelogen.
  return ok;
}

// FST-Modus: kein frischer Filter. FST wartet und fragt alle 20 Sekunden seinen
// Server neu, ohne Zaehler und ohne Ende (scripts.js Z. 42228-42241). Unser
// Gegenstueck ist ein eigener Markt-Scan (bis 16 Anfragen) nach jeweils 20
// Sekunden Warten. Nicht 1:1: FSTs Abfrage kostet keine EA-Anfrage, unser Scan
// schon. Gibt true zurueck, wenn die Rotation weitermachen soll.
async function rotFstNachsuchen(rot) {
  rotationText = $("rotQuelle") && $("rotQuelle").value === "liste"
    ? "Kein Spieler deiner Zielliste ist gerade fahrbar. Ich warte 20 Sekunden und prüfe neu …"
    : "Kein frischer Filter. Ich warte 20 Sekunden und scanne dann den EA-Markt neu …";
  renderAutoStartKnopf();
  const bis = Date.now() + 20000;
  if (!(await rotWarten(() => Date.now() >= bis, 50000))) return false;
  const ende = Number(rot && rot.endetUm) || 0;
  if (ende > 0 && Date.now() + 3 * 60000 >= ende) {
    rotationText = "Fertig: Die Laufzeit der Rotation ist fast um.";
    return false;
  }
  await rotNachscannen(rot);
  return true;
}

// FST-Modus, eine Runde bei leerem Markt (Punkte 4a und 4b).
//
// 4a: Zwischen zwei Markt-Scans liegen mindestens autoScanMs (7 Minuten,
// CONFIG.AUTO_SCAN_INTERVAL_MS). Vorher kam nach jedem 20-Sekunden-Warten
// gleich der naechste Scan: bei leerem Markt rund 800 EA-Anfragen in der
// Stunde, weil FSTs Abfrage nichts kostet, unsere aber schon. Dazwischen wird
// nur gewartet und nachgesehen, ob ein Filter da ist. Beim Start der Rotation
// gilt der Scan, aus dem die Filter stammen, als der letzte.
//
// 4b: Scheitert ein Markt-Scan an einem EA-Statuscode, endet die Rotation mit
// einer Meldung (FST: jeder Such-Status ausser 2xx stoppt).
//
// Gibt true zurueck, wenn die Rotation weitermachen soll.
let rotationFstScanAt = 0;
let rotationScanStopp = "";
async function rotFstRunde(rot) {
  const liste = Boolean($("rotQuelle") && $("rotQuelle").value === "liste");
  const abstand = Number(letzterStatus && letzterStatus.autoScanMs) || 7 * 60000;
  const naechster = rotationFstScanAt + abstand;
  if (!liste && rotationFstScanAt > 0 && Date.now() < naechster) {
    rotationText = "Warte auf neue Filter. Der nächste Markt-Scan kommt in etwa " +
      Math.max(1, Math.ceil((naechster - Date.now()) / 60000)) + " Min. …";
    renderAutoStartKnopf();
    const bis = Date.now() + 20000;
    if (!(await rotWarten(() => Date.now() >= bis, 50000))) return false;
    const ende = Number(rot && rot.endetUm) || 0;
    if (ende > 0 && Date.now() + 3 * 60000 >= ende) {
      rotationText = "Fertig: Die Laufzeit der Rotation ist fast um.";
      return false;
    }
    await loadData(); // nur lesen: ist inzwischen ein Filter da?
    return true;
  }
  if (!liste) rotationFstScanAt = Date.now();
  rotationScanStopp = "";
  const weiter = await rotFstNachsuchen(rot);
  if (rotationScanStopp) {
    rotationText = rotationScanStopp;
    return false;
  }
  return weiter;
}

async function rotNachscannen(rot) {
  if (!fstAn() && rotationScans >= ROT_SCAN_MAX) return false;
  // 28.09.2026: Im Listen-Modus bringt ein Markt-Scan nichts. Er liefert
  // Live-Filter; die eigene Zielliste aendert er nicht. Die 16 Suchen waeren
  // verschenkt. Dasselbe gilt fuers Warten darauf.
  if ($("rotQuelle") && $("rotQuelle").value === "liste") return false;
  const u = (letzterStatus && letzterStatus.usage) || {};
  const kosten = Number(letzterStatus && letzterStatus.marketScan && letzterStatus.marketScan.maxSearches) || 16;
  const restStunde = Math.max(0, (Number(u.searchLimitHour) || 150) - (Number(u.searchesHour) || 0));
  const restTag = Math.max(0, (Number(u.searchLimitDay) || 350) - (Number(u.searchesDay) || 0));
  // Ein Scan ohne anschliessenden Filter waere verschenkt: Es muss danach noch
  // fuer den Puffer UND einen kleinen Filter reichen.
  const braucht = kosten + ROT_PUFFER + ROT_MIN_SUCHEN;
  if (restStunde < braucht || restTag < braucht) return false;
  // Und nur, wenn hinterher ueberhaupt noch Zeit fuer einen Filter ist.
  if (Date.now() + 3 * 60000 >= Number(rot && rot.endetUm)) return false;
  rotationScans += 1;
  rotationText = "Kein frischer Filter mehr übrig. Ich scanne den EA-Markt selbst nach (Scan " +
    rotationScans + (fstAn() ? "" : " von " + ROT_SCAN_MAX) + ", bis zu " + kosten + " Suchen) …";
  renderAutoStartKnopf();
  // Dieselbe Preisklasse und dieselben Filter wie beim Knopf "EA-Markt live
  // scannen" - der Nutzer soll nichts anderes bekommen, als er dort waehlt.
  const maxPrice = filterBudget === "low" ? 5000 : filterBudget === "mid" ? 25000 : filterBudget === "high" ? 100000 : 50000;
  const res = await send("marketScan", { cfg: { maxPrice, filter: scanFilterWerte() } });
  if (!res || !res.ok) {
    rotationText = "Der Nachscan ging nicht: " + ((res && res.error) || "keine Antwort von der Web App.");
    return false;
  }
  // Warten, bis der Scan durch ist. Benutzt wird nur der Status, den poll()
  // ohnehin alle 1,5 Sekunden holt - kein zweiter Datenstrom.
  //
  // "Noch nicht angelaufen" und "schon fertig" sehen im Status gleich aus.
  // Darum wird gemerkt, ob der Scan ueberhaupt einmal als laufend zu sehen
  // war; ist er nach 15 Sekunden nie aufgetaucht, wird trotzdem nachgesehen.
  const start = Date.now();
  let lief = false;
  while (Date.now() - start < 4 * 60000) {
    // Prueft nur, ob die Rotation ueberhaupt noch lebt (Stopp, Sperre, Not-Aus).
    if (!(await rotWarten(() => true, 5000))) return false;
    const scan = (letzterStatus && letzterStatus.marketScan) || {};
    if (scan.running) lief = true;
    else if (lief || Date.now() - start > 15000) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  // FST-Modus (Punkt 4b): Ein Markt-Scan, den EA mit einem Statuscode
  // abgewiesen hat, beendet die Rotation - ohne neuen Versuch.
  const fertig = (letzterStatus && letzterStatus.marketScan) || {};
  if (fstAn() && fertig.error && Number(fertig.code) > 0) {
    rotationScanStopp = "Gestoppt: Der Markt-Scan wurde von EA abgewiesen (Code " + Number(fertig.code) + "). " + fertig.error;
    return false;
  }
  await loadData();
  return rotationKandidaten().length > 0;
}

// Wie viele Filter das Such-Budget wirklich hergibt (28.09.2026).
//
// Der Anlass: An zwei Stellen stand dem Nutzer "hoechstens 12 Filter" vor
// der Nase, obwohl zwei bis drei kommen. Die 12 ist ROTATION_MAX_FILTER aus
// content.js - eine Sicherung, keine Vorhersage.
//
// Nachgerechnet, warum die 12 bei Standardwerten nie erreicht wird:
//   In einer Stunde: (150 - 25 Puffer) / 50 Suchen je Filter = 2,5
//   An einem Tag:    (350 - 25 Puffer) / 50                   = 6,5
// Mit Preis-Check je Filter (15 Suchen) werden daraus 1 und 5.
//
// Die 12 bleibt trotzdem stehen. Sie greift, sobald jemand "Suchen je
// Filter" klein stellt: Bei 10 passen zwoelf Filter in eine Stunde. Und sie
// ist die einzige Bremse in der Rotation, die weder an einer Uhr noch an
// einem Zaehler haengt - faellt einer von beiden aus, zaehlt sie trotzdem.
//
// Kostet keine EA-Anfrage: Gelesen wird nur der Status, der ohnehin da ist.
function rotJeFilter() {
  // Eine Stelle fuer die Ersatzzahl. Sie stand schon an drei Stellen
  // getrennt - laufen sie auseinander, verspricht der Plan etwas anderes,
  // als der Lauf tut. 50 ist FSTs max_searches_per_filter.
  return Number($("rotSuchenProFilter") && $("rotSuchenProFilter").value) || 50;
}

function rotFilterMoeglich(mitCheck) {
  const u = (letzterStatus && letzterStatus.usage) || {};
  const restStunde = Math.max(0, (Number(u.searchLimitHour) || 150) - (Number(u.searchesHour) || 0));
  const restTag = Math.max(0, (Number(u.searchLimitDay) || 350) - (Number(u.searchesDay) || 0));
  const proFilter = Math.max(1, rotJeFilter() + (mitCheck ? ROT_CHECK_KOSTEN : 0));
  const passen = (rest) => Math.max(0, Math.floor((rest - ROT_PUFFER) / proFilter));
  // Beide Zahlen getrennt: In einer Stunde passen weniger als an einem Tag.
  // Nur die Tageszahl zu nennen, verspricht wieder zu viel - genau der
  // Fehler, den wir hier reparieren.
  return { stunde: passen(restStunde), tag: passen(restTag), proFilter };
}

const ROT_PUFFER = 25; // so viele Suchen bleiben immer uebrig
const ROT_MIN_SUCHEN = 10; // darunter lohnt kein weiterer Filter
const ROT_CHECK_KOSTEN = 15; // ein Preis-Check kostet bis zu 15 Suchen

function rotSuchenBudget(brauchtCheck) {
  const u = (letzterStatus && letzterStatus.usage) || {};
  const restStunde = Math.max(0, (Number(u.searchLimitHour) || 150) - (Number(u.searchesHour) || 0));
  const restTag = Math.max(0, (Number(u.searchLimitDay) || 350) - (Number(u.searchesDay) || 0));
  const reserve = (brauchtCheck ? ROT_CHECK_KOSTEN : 0) + ROT_PUFFER;
  // 27.09.2026: 50 statt 40 - FSTs max_searches_per_filter (scripts.js Z. 41940).
  // Die Stunden- und Tagesgrenze stehen weiter davor: Was frei ist, entscheidet
  // immer noch der Zaehler, nicht dieser Wunschwert.
  let budget = Math.min(rotJeFilter(), restStunde - reserve, restTag - reserve);

  // Hier stand kurz eine Ruecklage fuer den Nachscan. Sie ist wieder raus.
  //
  // Der Gedanke war: Wuerde dieser Filter den Nachscan unmoeglich machen,
  // nimmt er weniger Suchen. Nachgerechnet kam dabei heraus: statt zwei
  // Filtern mit 50 Suchen vier Filter mit 50, 49, 10 und 10. Ein Filter mit
  // zehn Suchen laeuft vierzig Sekunden und findet so gut wie nie etwas -
  // vier magere Filter sind schlechter als zwei ordentliche.
  //
  // Die Wahrheit dahinter ist Mathematik, kein Fehler: Bei 150 Suchen in der
  // Stunde und 50 je Filter sind zwei bis drei Filter drin. Wer mehr will,
  // senkt "Suchen je Filter" oder hebt die Stundengrenze an - beides steht
  // in den Einstellungen. Der Bot sagt das jetzt auch dazu, statt nur
  // "Kein frischer Filter mehr uebrig" zu melden.
  return budget;
}

function preisReichtAus(row) {
  return row.entry.preisGeprueft !== false && row.entry.confidence !== "niedrig" && Date.now() - row.entry.t <= PRICE_FRESH_MS;
}

// Die Auswahl des Nutzers fuer die Rotation (27.09.2026). Nachbau von FSTs
// min_filter_score / max_filter_score und den Haken je Abzeichen (scripts.js
// Z. 41954-41960, 42716). Bei FST entscheidet damit der Server, bei uns
// rechnen wir es selbst - es kostet keine einzige EA-Anfrage.
//
// "Abkuehlung" steht absichtlich NICHT in der Liste: Ein abgekuehlter Filter
// wird nie ausgeworfen, er rutscht nur nach hinten. Waere er abwaehlbar, waere
// die Liste nach drei Laeufen leer - genau der alte Fehler "Kein frischer
// Filter mehr uebrig".
const ROT_ABZEICHEN = [
  ["rotAbzUngeprueft", "Ungeprüft"],
  ["rotAbzNurGesehen", "Nur gesehen"],
  ["rotAbzUnterSchnitt", "Unter Schnitt"],
  ["rotAbzGewinn", "Gewinn+"],
  // 28.09.2026: "Gewinn++" haengt am SELBEN Haken. Bekannte Falle: Wer eine
  // zweite Beschriftung erlaubt, muss jeden Abgleich mitziehen - sonst
  // liesse ein ausgesperrtes "Gewinn+" die Gewinn++-Zeilen durch, und der
  // nur-Modus faende sie nicht. FST fuehrt beide im selben Hilfe-Absatz
  // (scripts.js Z. 57242-57260, profit_desc).
  ["rotAbzGewinn", "Gewinn++"],
  ["rotAbzUnterPreis", "Unter Preis"],
  ["rotAbzHeiss", "Heiß"],
  ["rotAbzRuhig", "Ruhig"],
  ["rotAbzNeu", "Neu"],
  ["rotAbzChem", "Chem"]
];

// Die Felder stehen auf FSTs Skala 0 bis 10, gerechnet wird mit 0 bis 100.
// Ein leeres Feld heisst Standard, NICHT 0 - sonst waere ein leeres
// Hoechstfeld eine Sperre fuer alles.
function rotWertungFeld(id, standard) {
  const el = $(id);
  const roh = el ? String(el.value).trim() : "";
  const zahl = Number(roh);
  if (!roh || !Number.isFinite(zahl)) return standard * 10;
  return Math.max(0, Math.min(100, Math.round(zahl * 10)));
}

// Von-bis. Wer die Felder verdreht eintraegt (mindestens 8, hoechstens 2),
// meint eine Spanne und keine Sperre - deshalb wird getauscht, statt alles
// abzulehnen.
function rotWertungSpanne() {
  const a = rotWertungFeld("rotWertungMin", 0);
  const b = rotWertungFeld("rotWertungMax", 10);
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

// Abzeichen ohne Haken: Filter mit diesem Abzeichen ueberspringt der Bot.
function rotGesperrteAbzeichen() {
  return ROT_ABZEICHEN.filter((paar) => $(paar[0]) && !$(paar[0]).checked).map((paar) => paar[1]);
}

// Abzeichen MIT Haken (28.09.2026). Gebraucht im Modus "nur": Das ist FSTs
// include_rule "include" je Abzeichen (scripts.js Z. 41956-41960) - der
// Filter muss mindestens eines dieser Abzeichen wirklich tragen.
function rotGewaehlteAbzeichen() {
  return ROT_ABZEICHEN.filter((paar) => $(paar[0]) && $(paar[0]).checked).map((paar) => paar[1]);
}

// Steht die Auswahl auf "nur Filter mit angehaktem Abzeichen"? (28.09.2026)
// Standard ist "sperren" - dann arbeitet alles wie vor dem Umbau.
function rotNurModus() {
  return Boolean($("rotAbzModus")) && $("rotAbzModus").value === "nur";
}

// Schraenkt der Nutzer die Auswahl gerade ein? Nur fuer die Erklaerung, warum
// kein Filter uebrig ist - ohne sie sucht er den Fehler beim Markt-Scan.
function rotAuswahlAktiv() {
  const w = rotWertungSpanne();
  // 28.09.2026: Auch der Modus "nur" ist eine Einschraenkung - nur so kann
  // die Anzeige "deine Auswahl laesst keinen zu" ihn als Grund nennen.
  return w.min > 0 || w.max < 100 || rotGesperrteAbzeichen().length > 0 || rotNurModus();
}

// Welche Filter kommen ueberhaupt infrage? Alles, was ohnehin scheitern
// wuerde, faellt hier raus - bevor es eine einzige Anfrage kostet.
// ohneAuswahl = true laesst die eigene Auswahl des Nutzers weg. Damit kann
// die Oberflaeche sagen, ob SEINE Auswahl der Grund fuer eine leere Liste ist.
// Die Rotation ueber die eigene Zielliste (28.09.2026) - FSTs Custom-Modus.
//
// Bisher konnte die Rotation NUR Live-Filter fahren, also die Treffer des
// eigenen Markt-Scans. Wer zehn Lieblingsspieler hat, musste nach jedem von
// Hand neu starten.
//
// Die Liste selbst gibt es laengst: targets, bis zu zehn Spieler, wird in
// Sammlungen gespeichert. Was fehlte, war die Weiche hierher.
//
// Aus jedem Spieler der Liste wird eine Zeile im selben Format wie bei den
// Live-Filtern gebaut. Dahinter bleibt alles gleich: Regie, Pausen,
// Such-Budget je Filter, Rotations-Karte, Kontoschutz. Es wird kein zweiter
// Motor gebaut.
//
// WICHTIG - der Zielpreis. Eine Gegenprobe hat vorgerechnet, was sonst
// passiert waere: Hat ein Spieler einen frischen Preis, aber keinen Gewinn
// mehr, ist suggestion.value gleich 0. Daraus wuerde maxPrice 0, und
// validateConfig im Motor lehnt den Start ab ("Zielpreis fehlt"). Die GANZE
// Rotation waere zu Ende, nicht nur dieser eine Filter - und der Nutzer
// laese nur "Der Start hat nicht geklappt."
//
// Darum werden solche Zeilen hier gar nicht erst zurueckgegeben. Das loest
// zugleich die Endlosschleife: Nach einem Preis-Check ohne Gewinn ist der
// Preis frisch und die Zeile faellt beim naechsten Durchlauf von selbst
// heraus. Es braucht keinen zusaetzlichen Merker.
//
// Kostet keine EA-Anfrage: Gelesen werden nur die Zielliste und das
// Preis-Gedaechtnis, beides liegt schon da.
function rotListeKandidaten() {
  const budget = Number($("budget").value) || 0;
  const muenzen = Number(letzterStatus && letzterStatus.credits);
  const amLimit = (letzterStatus && letzterStatus.cardsAtLimit) || [];
  const zuletzt = letzteFilter();
  const letzterKey = zuletzt.length ? zuletzt[0].key : "";
  const raus = [];
  for (const t of targets) {
    const key = targetKey(t);
    const wunsch = Number(t.maxPrice) || 0;
    // sanitizeTargets laesst nur Spieler mit maxPrice groesser 0 herein -
    // aber verlassen wollen wir uns nicht darauf.
    if (!(wunsch > 0)) continue;
    if (amLimit.includes(key)) continue;
    if (budget > 0 && budget < wunsch) continue;
    if (Number.isFinite(muenzen) && muenzen >= 0 && muenzen < wunsch) continue;
    const liste = Array.isArray(history[key]) ? history[key] : [];
    const letzter = liste.length ? liste[liste.length - 1] : null;
    // Ohne Messung gibt es keinen Preis. Dann ist preisReichtAus falsch, und
    // rotationLauf misst vor dem Start - genau wie bei einem Live-Filter,
    // dessen Preis zu alt geworden ist.
    const entry = letzter || { t: 0, market: 0, preisGeprueft: false };
    const suggestion = suggestionFor(entry);
    const row = {
      key,
      player: { id: t.playerId, name: t.playerName || ("Spieler " + t.playerId) },
      rating: Number(t.rating) || 0,
      // Mehrere Kartenarten (28.09.2026): sonst zerfaellt "12,70" zu "jede
      // Art" und die Zeile findet ihren Preisverlauf nicht mehr.
      rarity: rarityWert(t.rarity),
      entry,
      suggestion,
      rohWertung: 0,
      score: 0,
      // Daran erkennt der Rest, dass die Zeile aus der eigenen Liste kommt.
      eigen: true,
      // Der Wunschpreis des Nutzers. Gekauft wird nie darueber - auch dann
      // nicht, wenn die Messung mehr hergeben wuerde.
      nutzerPreis: wunsch
    };
    const frisch = entry.t > 0 && preisReichtAus(row);
    // Der Fall aus der Gegenprobe: frisch gemessen, aber kein Gewinn mehr.
    // Diese Zeile darf nicht in die Rotation - sonst stirbt sie am Zielpreis 0.
    if (frisch && !(suggestion.value > 0 && suggestion.value < suggestion.saleNet)) continue;
    if (frisch) {
      row.rohWertung = filterScore(entry, suggestion);
      row.score = row.rohWertung;
    }
    raus.push(row);
  }
  // Derselbe Filter nie zweimal direkt hintereinander - wie bei den
  // Live-Filtern. Gemessene zuerst, damit der Bot nicht erst misst, wenn er
  // sofort kaufen koennte.
  raus.sort((a, b) => {
    if (a.key === letzterKey) return 1;
    if (b.key === letzterKey) return -1;
    return (b.score || 0) - (a.score || 0);
  });
  return raus;
}

function rotationKandidaten(ohneAuswahl) {
  // 28.09.2026: Die Weiche. Steht die Quelle auf "Meine Zielliste", kommen
  // die Zeilen von dort statt aus dem Markt-Scan. Alles dahinter ist gleich.
  if ($("rotQuelle") && $("rotQuelle").value === "liste") return rotListeKandidaten();
  const wertung = rotWertungSpanne();
  const gesperrt = rotGesperrteAbzeichen();
  // 28.09.2026: Den Modus "nur" einmal VOR der Schleife lesen, nicht fuer
  // jede Zeile neu aus der Oberflaeche.
  const nurModus = rotNurModus();
  const noetig = nurModus ? rotGewaehlteAbzeichen() : [];
  const budget = Number($("budget").value) || 0;
  const muenzen = Number(letzterStatus && letzterStatus.credits);
  const amLimit = (letzterStatus && letzterStatus.cardsAtLimit) || [];
  // Mindestpreis der Karte (27.09.2026, FSTs min_price). 0 oder leer heisst:
  // keine Untergrenze - dann bleibt es genau wie bisher.
  const minPreis = Math.max(0, Number($("rotMinPreis") && $("rotMinPreis").value) || 0);
  // FST wirft einen abgekuehlten Filter NIE aus der Auswahl - er rutscht nur
  // nach hinten (Z. 35690-35705 blendet nur nach Budget aus). Das Rauswerfen
  // war bei uns die Ursache fuer "Kein frischer Filter mehr uebrig": Nach drei
  // Laeufen war die Liste leer, obwohl 20 Filter dastanden.
  const zuletzt = letzteFilter();
  const letzterKey = zuletzt.length ? zuletzt[0].key : "";
  return liveFilterRows(true).filter((row) => {
    // KEINE Schwelle bei der Wertung: Sie ist ein Produkt aus Chance,
    // Sicherheit und Gewinn und liegt bei frisch gescannten Filtern fast
    // immer unter 1,5 - mit einer Schwelle von 6,0 haette die Rotation nie
    // einen Filter gefunden (live gesehen am 23.09.2026: "0 Filter").
    // Stattdessen wird nach Wertung SORTIERT, und der Preis wird vor jedem
    // Filter ohnehin frisch geprueft (siehe rotationLauf).
    if (!(row.suggestion.value > 0) || row.suggestion.value >= row.suggestion.saleNet) return false;
    // Leeres Budget-Feld: nichts nach Budget aussortieren (28.09.2026).
    // Ohne diese Zeile waere budget 0 und JEDER Filter flöge raus - die
    // Rotation faende "0 Filter", obwohl "ohne Grenze" gemeint war.
    if (!budgetOhneGrenze() && budget < row.suggestion.value) return false;
    // Zu billige Karten gar nicht erst fahren (27.09.2026). Verglichen wird der
    // gemessene Marktpreis der Karte - das ist "was die Karte kostet", genau
    // wie FSTs min_price. Bei 300 Coins bleiben nach EAs 5 Prozent Gebuehr ein
    // paar Coins uebrig, der Filter verbraucht aber dieselben 50 Suchen wie
    // ein teurer. Geprueft wird hier, VOR jeder Anfrage.
    if (minPreis > 0 && !(Number(row.entry.market) >= minPreis)) return false;
    if (Number.isFinite(muenzen) && muenzen >= 0 && muenzen < row.suggestion.value) return false;
    if (amLimit.includes(row.key)) return false;
    if (Date.now() >= filterGiltBis(row.entry, row.key)) return false;
    // 27.09.2026: Erst hier greift die Auswahl des Nutzers - Wertung von-bis
    // und die Haken je Abzeichen. Standard ist 0 bis 10 mit allen Haken,
    // dann faellt hier nichts heraus. Es wird nur AUSGEWAEHLT: Kein Wert wird
    // umgerechnet oder weggeworfen, und wenn nichts uebrig bleibt, nennt die
    // Oberflaeche die Auswahl als Grund (renderRotationStreifen).
    if (!ohneAuswahl) {
      if (row.score < wertung.min || row.score > wertung.max) return false;
      if (gesperrt.length && row.badges.some((b) => gesperrt.includes(b[0]))) return false;
      // 28.09.2026: FSTs "include" (scripts.js Z. 41956-41960): Im Modus
      // "nur" muss der Filter mindestens ein angehaktes Abzeichen TRAGEN.
      // Ohne einen einzigen Haken bleibt nichts uebrig - FST verweigert dann
      // den Start (Z. 42596-42601, error_no_badges); bei uns erklaert die
      // Anzeige das ueber rotAuswahlAktiv, der Start bricht nicht hart ab.
      if (nurModus && !row.badges.some((b) => noetig.includes(b[0]))) return false;
    }
    return true;
  }).sort((a, b) => {
    // Denselben Filter zweimal hintereinander zu fahren ist der Hauptgrund
    // fuer eine Sperre. FST schickt darum prev_filter_id mit (Z. 42204-42214).
    // Wir schieben ihn ans Ende, statt ihn zu loeschen.
    if (letzterKey) {
      if (a.key === letzterKey && b.key !== letzterKey) return 1;
      if (b.key === letzterKey && a.key !== letzterKey) return -1;
    }
    return b.score - a.score || b.suggestion.expectedProfit - a.suggestion.expectedProfit;
  });
}

// Pause zwischen zwei Filtern. FUT Simple Trader nimmt dafuer drei Werte
// (scripts.js Z. 41943-41946): 300 Sekunden Grundpause, jeder 4. Wechsel
// bekommt 400 Sekunden, und beides streut um 20 Prozent.
//
// 27.09.2026: Bis heute stand hier eine Grundpause von 35 Sekunden. Die 35
// Sekunden stehen in FSTs Code aber nur als NOTWERT, wenn sein Server keine
// Zahl schickt (scripts.js Z. 42224: r = 35e3). Wir hatten den Notwert
// abgeschrieben, nicht den echten Standard. Am 27.09.2026 nachgesehen.
//
// Es kostet keinen Treffer: Bei 50 Suchen je Filter und 150 Suchen in der
// Stunde passen ohnehin nur zwei Filter in eine Stunde - die Pause ist nie
// das, was bremst. Gewonnen wird Ruhe auf dem Konto: achtmal schneller zum
// naechsten Filter heisst achtmal mehr Betrieb in derselben Zeit, und genau
// das hat am 22.09. die 461-Sperre ausgeloest.
const ROT_LANGE_PAUSE_S = 400; // FSTs longer_break_time
const ROT_LANGE_PAUSE_JEDER = 4; // FSTs longer_breaks_after_sessions
const ROT_PAUSE_STREUUNG = 0.2; // FSTs randomize_breaks: 20 Prozent

function rotPauseMs() {
  // Die lange Pause haengt nicht am Schieber - FST hat dafuer einen eigenen
  // Wert (400 Sekunden). Der Schieber gilt nur fuer die normale Pause.
  const lang = rotationFilterNr > 0 && rotationFilterNr % ROT_LANGE_PAUSE_JEDER === 0;
  // FST-Modus: FSTs Regler geht von 60 bis 600 Sekunden.
  const pMin = fstAn() ? 60 : 25;
  const pMax = fstAn() ? 600 : 300;
  const basis = (lang ? ROT_LANGE_PAUSE_S : Math.max(pMin, Math.min(pMax, Number($("rotPauseS").value) || 300))) * 1000;
  // Streuung nach oben UND unten, wie bei FST. Vorher ging es nur nach oben:
  // aus 35 eingestellten Sekunden wurden im Mittel 42, der eingestellte Wert
  // kam nie heraus.
  const faktor = 1 + (Math.random() * 2 - 1) * ROT_PAUSE_STREUUNG;
  // Die lange Pause steckt schon in basis - hier wird nur noch gestreut. Sie
  // liegt seit 27.09.2026 auf jedem 4. Wechsel statt auf jedem 3. - so steht
  // es bei FST (longer_breaks_after_sessions: 4).
  return Math.round(basis * faktor);
}

// Wartet, bis pruef(status) wahr ist. Es wird NUR der Status benutzt, den
// poll() ohnehin alle 1,5 s holt - kein zweiter Statusstrom.
async function rotWarten(pruef, maxMs) {
  const bis = Date.now() + (maxMs || 60 * 60000);
  while (Date.now() < bis) {
    if (rotationAbbruch) return false;
    const rot = letzterStatus && letzterStatus.rotation;
    if (!rot || !rot.aktiv || rot.karte !== rotationKarte) {
      rotationText = (rot && rot.grund) || "Die Rotation ist beendet.";
      return false;
    }
    if (pruef(letzterStatus)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function rotationLauf() {
  if (rotationLaeuft) return;
  if (!BOT) {
    autoFehler = "Die Rotation läuft nur in der Leiste auf der EA-Seite. Öffne die Leiste im EA-Tab.";
    renderAutoStartKnopf();
    return;
  }
  rotationLaeuft = true;
  rotationAbbruch = false;
  rotationFilterNr = 0;
  rotationLeerRunden = 0;
  // 27.09.2026: Jede Rotation hat ihre eigenen zwei Nachscans.
  rotationScans = 0;
  // FST-Modus (Punkt 4a/4b): Der Scan, aus dem die Filter stammen, gilt als
  // letzter Scan. Fehlermeldung eines abgewiesenen Scans zuruecksetzen.
  rotationFstScanAt = Date.now();
  rotationScanStopp = "";
  // Und ihre eigenen drei Warterunden (28.09.2026). Ohne das Zuruecksetzen
  // haette die zweite Rotation des Tages gar keine mehr - der Zaehler lebt
  // so lange wie die Seite.
  rotationWarteRunden = 0;
  rotationLeerChecks = 0;
  rotationText = "Rotation wird vorbereitet …";
  // 25.09.2026: Merken, dass eine Rotation laeuft. Sie lebt nur im
  // Arbeitsspeicher dieser Seite - ein Neuladen beendet sie ohne ein Wort.
  rotationMerkerSetzen();
  autoFehler = "";
  renderAutoStartKnopf();
  try {
    if (await frischeSperre()) return;
    // Leer = ohne Grenze (28.09.2026, wie FST). Nur die echte 0 blockt.
    if (!budgetOhneGrenze() && !(Number($("budget").value) > 0)) throw new Error("Trag zuerst ein Budget ein – oder lass das Feld leer für „ohne Grenze“.");
    const start = await send("rotationStart", { cfg: { laufzeitMin: $("timeLimitMin").value } });
    if (!start || !start.ok) throw new Error((start && start.error) || "Die Rotation konnte nicht starten.");
    rotationKarte = start.status && start.status.rotation ? start.status.rotation.karte : 0;

    while (!rotationAbbruch) {
      rotationMerkerSetzen(); // Zeitstempel frisch halten, siehe rotationMerkerPruefen
      await loadData();
      const rot = (letzterStatus && letzterStatus.rotation) || null;
      if (!rot || !rot.aktiv || rot.karte !== rotationKarte) {
        rotationText = (rot && rot.grund) || "Die Rotation ist beendet.";
        break;
      }
      const kandidaten = rotationKandidaten();
      if (!kandidaten.length) {
        // 27.09.2026: Bis heute war die Rotation hier zu Ende. Alle Filter
        // eines Scans laufen fast gleichzeitig ab - nach etwa 15 Minuten stand
        // der Nutzer vor einer leeren Liste und musste selbst in den Reiter
        // Filter gehen. Jetzt wird erst selbst nachgescannt, wenn die Suchen
        // dafuer wirklich da sind. Bringt das nichts, bleibt es beim
        // ehrlichen Ende.
        if (fstAn()) {
          if (await rotFstRunde(rot)) continue;
          break;
        }
        if (await rotNachscannen(rot)) continue;
        // 28.09.2026: Und wenn der Nachscan nur am Stundenbudget scheitert,
        // wird gewartet statt aufgehoert. Das Stundenfenster rollt - nach ein
        // paar Minuten sind wieder Suchen frei, ohne dass eine Grenze
        // angefasst wird. Erst wenn auch das nichts bringt, ist Schluss.
        if (await rotScanWarten(rot)) continue;
        // 28.09.2026: Im Listen-Modus liegt es nicht an abgelaufenen Filtern.
        // "Scanne den EA-Markt neu" waere dort ein falscher Rat.
        rotationText = $("rotQuelle") && $("rotQuelle").value === "liste"
          ? "Fertig: Kein Spieler deiner Zielliste ist gerade fahrbar." + rotEndeGrund()
          : "Fertig: Kein frischer Filter mehr übrig." + rotEndeGrund();
        break;
      }
      // Derselbe Filter zweimal direkt hintereinander (25.09.2026): Bisher
      // wurde der zuletzt gefahrene Filter nur ans Ende sortiert. Bleibt aber
      // nur EIN Kandidat uebrig - und genau dahin laeuft jede Rotation am
      // Ende -, stand er wieder vorn und lief sofort noch einmal.
      const zuletztGefahren = letzteFilter();
      const letzterKey = zuletztGefahren.length ? zuletztGefahren[0].key : "";
      // FST-Modus: Der Cooldown ist bei FST nur ein Abzeichen, kein Verbot.
      const sperrfrist = fstAn() ? 0 : Number(rot.gleicherFilterMs) || 120000;
      const nochGesperrt = Boolean(zuletztGefahren.length && Date.now() - zuletztGefahren[0].t < sperrfrist);
      const row = kandidaten.find((k) => k.key !== letzterKey) || (nochGesperrt ? null : kandidaten[0]);
      if (!row) {
        // Nur der eben gefahrene Filter ist noch da. Nicht sofort wiederholen,
        // sondern warten - in dieser Zeit darf der Auto-Scan (content.js, alle
        // 7 Minuten) neue Filter nachliefern.
        rotationLeerRunden += 1;
        if (fstAn() && rotationLeerRunden > 3) {
          rotationLeerRunden = 0;
          if (await rotFstRunde(rot)) continue;
          break;
        }
        if (rotationLeerRunden > 3) {
          // 27.09.2026: Auch hier erst nachscannen - frische Filter loesen
          // genau dieses Problem. Bringt der Scan nichts, bleibt es beim Ende.
          if (await rotNachscannen(rot)) { rotationLeerRunden = 0; continue; }
          rotationText = "Fertig: Es ist nur noch der zuletzt gefahrene Filter übrig. Scanne den EA-Markt neu.";
          break;
        }
        const warten = Math.max(15000, sperrfrist - (Date.now() - zuletztGefahren[0].t) + 5000);
        rotationText = "Nur der zuletzt gefahrene Filter ist übrig. Warte " + Math.ceil(warten / 1000) +
          " Sekunden, statt ihn sofort zu wiederholen.";
        renderAutoStartKnopf();
        const bis = Date.now() + warten;
        if (!(await rotWarten(() => Date.now() >= bis, warten + 30000))) break;
        continue;
      }
      rotationLeerRunden = 0;
      const brauchtCheck = !preisReichtAus(row);
      const suchen = rotSuchenBudget(brauchtCheck);
      if (suchen < (fstAn() ? 1 : ROT_MIN_SUCHEN)) {
        // Bis 25.09.2026 endete die Rotation hier ohne zu sagen, woran es
        // liegt und wie lange es dauert. Jetzt wird nachgerechnet. Es geht
        // dabei keine einzige Anfrage raus - die Zeiten stehen in unserer
        // eigenen Zaehlung. Die Limits bleiben unveraendert.
        // Gleiche Reserve-Rechnung wie in rotSuchenBudget.
        const u = (letzterStatus && letzterStatus.usage) || {};
        const reserve = (brauchtCheck ? ROT_CHECK_KOSTEN : 0) + ROT_PUFFER;
        const restTag = Math.max(0, (Number(u.searchLimitDay) || 350) - (Number(u.searchesDay) || 0)) - reserve;
        const restStunde = Math.max(0, (Number(u.searchLimitHour) || 150) - (Number(u.searchesHour) || 0)) - reserve;
        const freiIn = Array.isArray(u.stundeFreiIn) ? u.stundeFreiIn : [];
        const fehlt = ROT_MIN_SUCHEN - restStunde;
        // Am Tageslimit bringt Warten nichts - da wird nur noch aufgehoert.
        const wartenMs = restTag >= ROT_MIN_SUCHEN && fehlt > 0 && fehlt <= freiIn.length ? Number(freiIn[fehlt - 1]) || 0 : 0;
        // Warten lohnt nur, wenn danach ueberhaupt noch Zeit fuer einen Filter bleibt.
        if (wartenMs > 0 && Date.now() + wartenMs + 60000 < rot.endetUm) {
          rotationText = "Warte " + Math.ceil(wartenMs / 60000) + " Minuten: Dann sind wieder genug Suchen frei.";
          renderAutoStartKnopf();
          const bis = Date.now() + Math.max(wartenMs, 30000);
          if (!(await rotWarten(() => Date.now() >= bis, wartenMs + 90000))) break;
          continue;
        }
        rotationText = restTag < ROT_MIN_SUCHEN
          ? "Fertig: Das Tagesbudget für Suchen ist fast aufgebraucht. Für heute ist Schluss – das schützt das Konto."
          : "Fertig: Das Stundenlimit für Suchen ist erreicht." +
            (wartenMs > 0 ? " In etwa " + Math.ceil(wartenMs / 60000) + " Minuten wären wieder genug frei – das ist nach dem Ende dieser Rotation." : "") +
            " Es geht keine einzige Suche mehr raus.";
        break;
      }
      if (brauchtCheck) {
        rotationText = "Preis wird geprüft: " + row.player.name + " …";
        renderAutoStartKnopf();
        const entry = await awaitFreshPrice(
          { id: row.player.id, name: row.player.name }, row.rating, row.key,
          (n) => { renderLoader("auto-loader", checkLoaderOpts(n, "Preis wird geprüft: " + row.player.name)); },
          () => rotationAbbruch,
          row.rarity
        );
        renderLoader("auto-loader", null);
        if (!entry) {
          rotationText = "Die Preisprüfung wurde abgebrochen.";
          break;
        }
        await loadData();
        row.entry = mitPreisCheck(row.entry, entry);
        row.suggestion = suggestionFor(row.entry);
        row.rohWertung = filterScore(row.entry, row.suggestion);
        row.score = row.rohWertung;
        filterKarteAuffrischen(row.key, row.entry);
        if (!(row.suggestion.value > 0) || row.suggestion.value >= row.suggestion.saleNet) {
          // 28.09.2026: Mitzaehlen. Eine Messung, die zu keinem Filter
          // fuehrt, kostet bis zu 15 Suchen und bringt nichts ein. Drei
          // davon sind zu verschmerzen, zehn waeren das halbe Stundenbudget.
          rotationLeerChecks += 1;
          if (!fstAn() && rotationLeerChecks >= ROT_LEER_CHECK_MAX) {
            rotationText = "Fertig: Bei " + rotationLeerChecks + " Spielern hintereinander blieb kein Gewinn übrig. " +
              "Weiter zu messen würde nur Suchen kosten. " +
              ($("rotQuelle") && $("rotQuelle").value === "liste"
                ? "Prüfe die Zielpreise in deiner Liste – vielleicht sind sie zu niedrig für den heutigen Markt."
                : "Ein neuer Scan im Reiter Filter bringt frische Karten.");
            break;
          }
          rotationText = row.player.name + " bringt keinen Gewinn mehr – nächster Filter.";
          if (fstAn()) {
            // FST: Scheitert der Preis-Check, nach 10 Sekunden ein neuer Versuch
            // (scripts.js Z. 42696-42701), ohne Zaehler.
            renderAutoStartKnopf();
            const bis10 = Date.now() + 10000;
            if (!(await rotWarten(() => Date.now() >= bis10, 40000))) break;
          }
          continue;
        }
      }
      const proFilter = Math.max(1, Math.min(fstAn() ? 30 : 10, Number($("rotKaeufeProFilter").value) || 5));
      const restMin = Math.max(1, Math.ceil((rot.endetUm - Date.now()) / 60000));
      const ziel = {
        playerId: row.player.id,
        playerName: row.player.name,
        rating: row.rating,
        // 28.09.2026: Bei einer Zeile aus der eigenen Liste gilt der
        // kleinere von zwei Preisen - der Wunschpreis des Nutzers und das,
        // was die Messung hergibt. Ueber seinen Wunsch kauft der Bot nie.
        //
        // Der Fall "value ist 0" kann hier nicht mehr ankommen:
        // rotListeKandidaten gibt solche Zeilen gar nicht erst zurueck, und
        // der Preis-Check darueber bricht mit "bringt keinen Gewinn mehr"
        // ab. Waere es anders, lehnte validateConfig den Start ab und die
        // GANZE Rotation waere zu Ende - nicht nur dieser Filter.
        maxPrice: row.eigen
          ? Math.min(row.nutzerPreis, row.suggestion.value)
          : row.suggestion.value,
        source: row.eigen ? "manual" : "live",
        filterId: row.eigen ? "" : row.key,
        salePrice: row.suggestion.verkaufspreis,
        // Die Kartenart MUSS mit (25.09.2026). Dasselbe Loch wie am 24.09. im
        // Filter-Fenster, nur eine Stelle weiter: Ohne sie sucht der Bot ueber
        // ALLE Versionen des Spielers und kauft die billigste - zu einem
        // Preis, der fuer die Sonderkarte gerechnet wurde. startRun liest
        // t.rarity; fehlt das Feld, wird daraus stillschweigend -1.
        //
        // 28.09.2026: Diese Zeile stand hier zweimal, mit fast gleichem
        // Kommentar. Der zweite Eintrag gewann - es hat funktioniert, sah
        // aber aus wie ein halb fertiger Umbau.
        //
        // rarityWert statt Number (28.09.2026): Ueber "Meine Zielliste" kann die
        // Kartenart eine Liste sein ("12,70"). Number waere NaN, startRun suchte
        // ueber alle Versionen und kaufte die billigste.
        rarity: rarityWert(row.rarity),
        // 27.09.2026: dieselbe Rechnung wie in der Liste. Ohne das lehnt der
        // Motor den verlaengerten Filter mit "Live-Filter ist abgelaufen" ab.
        //
        // 28.09.2026: Eine Zeile aus der eigenen Zielliste laeuft NICHT ab -
        // der Nutzer hat sie selbst ausgesucht, sie ist kein Scan-Treffer.
        // content.js wirft Ziele mit abgelaufenem expiresAt raus und beendet
        // den Lauf, wenn ALLE Ziele eines haben. Mit 0 passiert beides nicht.
        expiresAt: row.eigen ? 0 : filterGiltBis(row.entry, row.key),
        score: Math.round(row.rohWertung != null ? row.rohWertung : row.score)
      };
      const lauf = {
        filterBuyLimit: proFilter,
        maxBuys: proFilter,
        filterSearchLimit: suchen,
        // Zweite Grenze je Filter (25.09.2026): Kaufversuche, auch die
        // gescheiterten. Doppelt so viele wie erlaubte Kaeufe - wer mehr als
        // die Haelfte seiner Versuche verliert, ist zu langsam fuer diesen
        // Filter und soll weiterziehen.
        // FST-Modus: eigenes Feld (FST: Transaktionen je Filter, Standard 10).
        filterAnfrageLimit: fstAn() ? Math.max(1, Math.min(30, Number($("rotAnfrageProFilter") && $("rotAnfrageProFilter").value) || 10)) : proFilter * 2,
        bidSniping: false,
        // Leeres Feld unveraendert weitergeben (28.09.2026): "" heisst im
        // Motor "ohne Grenze". Sonst wuerde hier 0 daraus - und 0 ist mit
        // Absicht ein Fehler, kein Freibrief.
        budget: budgetOhneGrenze() ? "" : Math.max(0, (Number($("budget").value) || 0) - (Number(rot.ausgegeben) || 0)),
        timeLimitMin: restMin,
        rotationKarte
      };
      // FST-Modus (Punkt 4c): Im Auto-Handel hat FST keine Sicherheitspausen
      // (useBreaks=false, scripts.js Z. 42257). Die Pause zwischen zwei Filtern
      // bleibt; innerhalb eines Filters wird ohne Pausen gesucht.
      if (fstAn()) lauf.pausePreset = "off";
      const sperren = startPruefung([ziel], lauf).blockers;
      if (sperren.length) {
        rotationText = "Fertig: " + sperren[0];
        break;
      }
      rotationText = "Filter " + (rotationFilterNr + 1) + ": " + row.player.name + " bis " + fmt(row.suggestion.value) + " Coins …";
      renderAutoStartKnopf();
      const gestartet = await startRun([ziel], lauf);
      if (!gestartet) {
        rotationText = notice || "Der Start hat nicht geklappt.";
        break;
      }
      rotationFilterNr += 1;
      // Warten, bis dieser Filter fertig ist.
      await rotWarten((st) => st && !st.running);
      if (rotationAbbruch) break;
      const stopp = letzterStatus && letzterStatus.letzterStopp;
      if (stopp && stopp.code === "gesamt") {
        rotationText = stopp.message;
        break;
      }
      const pause = rotPauseMs();
      const gesetzt = await send("rotationPause", { ms: pause });
      if (!gesetzt || !gesetzt.ok) break;
      // Die wirkliche Pause kommt vom Motor (Punkt 4d: nach "Naechster Filter"
      // sind es im FST-Modus genau 60 s, nicht die normale Pause).
      const echteBis = Number(gesetzt.status && gesetzt.status.rotation && gesetzt.status.rotation.pauseBis) || 0;
      const echtePause = fstAn() && echteBis > Date.now() ? echteBis - Date.now() : pause;
      rotationText = "Pause vor dem nächsten Filter: " + Math.round(echtePause / 1000) + " Sekunden …";
      renderAutoStartKnopf();
      const weiter = await rotWarten((st) => {
        const r = st && st.rotation;
        return Boolean(r && Date.now() >= r.pauseBis);
      }, pause + 30000);
      if (!weiter) break;
    }
  } catch (error) {
    rotationText = error && error.message ? error.message : String(error);
  } finally {
    await send("rotationStop");
    rotationMerkerLoeschen(); // sauber beendet - hier gibt es nichts zu melden
    rotationLaeuft = false;
    autoFehler = "";
    renderLoader("auto-loader", null);
    renderAutoStartKnopf();
    renderLiveFilters();
  }
}

// Die zwei Karten oben im Autopilot (FST-Aufbau): "Ein Spieler" oder
// "Live-Filter der Reihe nach". Sie schalten denselben Wert wie der alte
// Haken - der bleibt im Dokument, damit Speichern und Tests gleich bleiben.
function setAutoModus(rotation) {
  const el = $("rotationModus");
  if (!el) return;
  el.checked = Boolean(rotation);
  el.dispatchEvent(new Event("change"));
}

function renderAutoModus() {
  const rotation = Boolean($("rotationModus") && $("rotationModus").checked);
  const einzel = $("auto-modus-einzel");
  const rot = $("auto-modus-rotation");
  if (einzel) {
    einzel.classList.toggle("aktiv", !rotation);
    einzel.setAttribute("aria-checked", String(!rotation));
  }
  if (rot) {
    rot.classList.toggle("aktiv", rotation);
    rot.setAttribute("aria-checked", String(rotation));
  }
  if ($("auto-spieler-block")) $("auto-spieler-block").hidden = rotation;
  if ($("rot-block")) $("rot-block").hidden = !rotation;
  if ($("rot-optionen")) $("rot-optionen").hidden = !rotation;
}

// Die naechsten Filter als kleine Karten, wie die Reihe bei FST.
function renderRotationStreifen() {
  const box = $("rot-streifen");
  if (!box || !$("rotationModus") || !$("rotationModus").checked) return;
  const kandidaten = rotationKandidaten().slice(0, 8);
  if ($("rot-anzahl")) {
    // 28.09.2026: Dazuschreiben, woher sie kommen. Sonst sieht der Nutzer
    // eine andere Zahl als sonst und weiss nicht, warum.
    const ausListe = $("rotQuelle") && $("rotQuelle").value === "liste";
    $("rot-anzahl").textContent = (kandidaten.length === 1 ? "1 Filter" : kandidaten.length + " Filter") +
      (ausListe ? " aus deiner Liste" : "");
  }
  box.textContent = "";
  if (!kandidaten.length) {
    const leer = document.createElement("p");
    leer.className = "hint";
    // 27.09.2026: Liegt es an der eigenen Auswahl, muss sie im Text stehen.
    // Sonst scannt der Nutzer immer wieder neu, obwohl die Filter da sind und
    // nur seine Wertungsgrenze sie aussortiert.
    // 28.09.2026: Im Listen-Modus waere "Scanne den EA-Markt" ein falscher
    // Rat - die Zielliste aendert ein Scan nicht.
    if ($("rotQuelle") && $("rotQuelle").value === "liste") {
      leer.textContent = targets.length
        ? "Deine Zielliste hat " + targets.length + (targets.length === 1 ? " Spieler" : " Spieler") +
          ", aber gerade ist keiner fahrbar: Entweder bringt der Zielpreis keinen Gewinn mehr, oder dein Budget reicht nicht."
        : "Deine Zielliste ist leer. Such oben einen Spieler und leg ihn mit dem Plus dazu – bis zu zehn.";
      box.append(leer);
      return;
    }
    const ohneAuswahl = rotationKandidaten(true).length;
    leer.textContent = ohneAuswahl && rotAuswahlAktiv()
      ? "Es gibt " + ohneAuswahl + " passende Live-Filter, aber deine Auswahl lässt keinen davon zu. Setze „Wertung mindestens“ herunter oder setze mehr Haken bei den Abzeichen."
      : "Noch keine passenden Live-Filter. Scanne den EA-Markt im Reiter Filter.";
    box.append(leer);
    return;
  }
  for (const row of kandidaten) {
    const karte = document.createElement("div");
    karte.className = "rot-karte";
    const kopf = document.createElement("div");
    kopf.className = "rot-karte-kopf";
    const name = document.createElement("b");
    name.textContent = row.player.name + (row.rating ? " (" + row.rating + ")" : "");
    const score = document.createElement("span");
    score.className = "rot-score";
    // 28.09.2026: Eine Zeile aus der eigenen Liste hat vor der Messung keine
    // Wertung. Eine 0 dort saehe aus wie "sehr schlecht" - dabei ist sie nur
    // noch nicht gemessen.
    const ungemessen = row.eigen && !(row.entry && row.entry.t > 0);
    score.textContent = ungemessen ? "–" : wertungZahl(row.rohWertung != null ? row.rohWertung : row.score);
    if (ungemessen) score.title = "Der Preis wird direkt vor dem Start geprüft.";
    kopf.append(name, score);
    const preis = document.createElement("span");
    preis.className = "coin rot-preis";
    // Bei einer eigenen Zeile gilt der kleinere von zwei Preisen - genau der,
    // mit dem der Bot dann auch startet. Ohne Messung ist es der Wunschpreis.
    preis.textContent = row.eigen
      ? fmt(row.suggestion.value > 0 ? Math.min(row.nutzerPreis, row.suggestion.value) : row.nutzerPreis)
      : fmt(row.suggestion.value);
    const gewinn = document.createElement("small");
    gewinn.textContent = ungemessen
      ? "dein Preis · wird vor dem Start geprüft"
      : "+" + fmt(row.suggestion.expectedProfit) + " erwartet";
    karte.append(kopf, preis, gewinn);
    box.append(karte);
  }
}

// --- Blatt-Fenster der Kacheln: "Heute" und "Sammlungen" -------------------
// Aufbau wie das Mini-Dashboard von FST: Jede Kachel oben oeffnet ein Blatt
// von unten. Die Zahlen kommen aus dem, was der Bot ohnehin weiss - es wird
// dafuer nichts bei EA nachgefragt.

function blattZeile(box, name, wert, art) {
  const zeile = document.createElement("div");
  zeile.className = "blatt-zeile";
  const links = document.createElement("span");
  links.textContent = name;
  const rechts = document.createElement("b");
  rechts.textContent = wert;
  if (art) rechts.className = art;
  zeile.append(links, rechts);
  box.append(zeile);
  return zeile;
}

// Mitternacht vor so vielen Tagen. 0 = heute, 1 = gestern.
function tagStart(minusTage) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (Number(minusTage) || 0));
  return d.getTime();
}

// Alles, was in einem Zeitraum passiert ist. Bis 25.09.2026 rechnete diese
// Stelle fest "seit Mitternacht". Das Blatt braucht dieselbe Rechnung jetzt
// auch fuer gestern und vorgestern, darum steht der Zeitraum aussen. Der
// echte Gewinn kommt dazu: Verkaufspreis minus 5 % Gebuehr minus Kaufpreis.
// Alles aus schon gespeicherten Daten - kein Server, keine EA-Anfrage.
function tagZahlen(seit, bis) {
  const ende = Number(bis) > 0 ? Number(bis) : Infinity;
  const imFenster = (wann) => {
    const zahl = Number(wann) || 0;
    return zahl >= seit && zahl < ende;
  };
  const kaeufe = purchases.filter((b) => imFenster(b.t));
  const ausgegeben = kaeufe.reduce((s, b) => s + (Number(b.price) || 0), 0);
  let gewinn = 0;
  let mitWert = 0;
  for (const kauf of kaeufe) {
    const g = kaufGewinn(kauf, history);
    if (g === null) continue;
    gewinn += g;
    mitWert += 1;
  }
  const verkauft = verkaeufe.filter((v) => imFenster(v.t));
  const erloes = verkauft.reduce((s, v) => s + Math.floor((Number(v.preis) || 0) * (1 - SALE_FEE)), 0);
  // Nur Verkaeufe MIT bekanntem Kaufpreis ergeben einen echten Gewinn.
  // gekauftFuer ist bei Pack-Karten leer. Solche Zeilen als Gewinn 0 zu
  // zaehlen wuerde jeden Tag schlechter rechnen, als er wirklich war.
  let echt = 0;
  let mitKauf = 0;
  for (const v of verkauft) {
    const kaufpreis = Number(v.gekauftFuer) || 0;
    if (!(kaufpreis > 0)) continue;
    echt += Math.floor((Number(v.preis) || 0) * (1 - SALE_FEE)) - kaufpreis;
    mitKauf += 1;
  }
  return { kaeufe, ausgegeben, gewinn, mitWert, verkauft, erloes, echt, mitKauf };
}

// Alles, was heute passiert ist. Tag = seit Mitternacht.
function heuteZahlen() {
  return tagZahlen(tagStart(0), 0);
}

function renderHeuteBlatt() {
  const box = $("heute-zeilen");
  if (!box) return;
  box.textContent = "";
  const st = letzterStatus;
  const u = (st && st.usage) || {};
  const z = heuteZahlen();
  const suchen = Number(u.searchesDay) || 0;
  const grenzeTag = Number(u.searchLimitDay) || 350;
  const stunde = Number(u.searchesHour) || 0;
  const grenzeStunde = Number(u.searchLimitHour) || 150;
  const stufe = (wert, grenze) => (wert >= grenze ? "err" : wert >= grenze * 0.8 ? "warn" : "");

  blattZeile(box, "Gekauft", z.kaeufe.length + (z.kaeufe.length === 1 ? " Spieler" : " Spieler"));
  blattZeile(box, "Ausgegeben", fmt(z.ausgegeben) + " Coins");
  blattZeile(box, "Geschätzter Gewinn", z.mitWert ? (z.gewinn >= 0 ? "+" : "") + fmt(z.gewinn) + " Coins" : "–");
  blattZeile(box, "Verkauft", z.verkauft.length + " · " + fmt(z.erloes) + " Coins nach Gebühr");
  if (u.keineGrenzen) {
    // FST-Modus: Es gibt keine eigene Grenze - nur die Zahlen, nie "x / 1000000000".
    const suchen = String(Number(u.searchesDay) || 0) + (u.searchesDayGekappt ? "+" : "");
    blattZeile(box, "Suchen heute", suchen + " · ohne Grenze");
    blattZeile(box, "Suchen diese Stunde", stunde + " · ohne Grenze");
    blattZeile(box, "Kaufversuche", String(Number(u.buysDay) || 0));
    blattZeile(box, "Aktionen (verschieben, einstellen)", String(Number(u.aktionenDay) || 0));
  } else {
  blattZeile(box, "Suchen heute", suchen + " / " + grenzeTag, stufe(suchen, grenzeTag));
  blattZeile(box, "Suchen diese Stunde", stunde + " / " + grenzeStunde, stufe(stunde, grenzeStunde));
  blattZeile(box, "Kaufversuche", (Number(u.buysDay) || 0) + " / " + (Number(u.buyLimitDay) || 100), stufe(Number(u.buysDay) || 0, Number(u.buyLimitDay) || 100));
  blattZeile(box, "Aktionen (verschieben, einstellen)", (Number(u.aktionenDay) || 0) + " / " + (Number(u.actionLimitDay) || 120));
  }
  const sperre = st && st.cooldown && Number(st.cooldown.leftMin) > 0 ? "noch " + st.cooldown.leftMin + " Min." : "keine";
  blattZeile(box, "Sperre", sperre, sperre === "keine" ? "" : "err");
  // Seit 25.09.2026 haengt der Wochenblock im selben Blatt. An einem
  // einzelnen Tag sieht man nicht, ob sich das Snipen lohnt.
  renderWocheBlock(box);
}

const WOCHENTAG = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

// Der zweite Abschnitt im Blatt "Heute": dieselben Zahlen je Tag fuer die
// letzten 7 Tage, dazu Summe und Vergleich zur Vorwoche (25.09.2026).
// Gerechnet wird nur aus dem Kauflog und dem Verkaufslog, die ohnehin schon
// im Speicher liegen. Es geht keine einzige Anfrage an EA und nichts an
// irgendeinen Server - der Kontoschutz merkt von diesem Block nichts.
function renderWocheBlock(box) {
  const titel = document.createElement("h5");
  titel.className = "blatt-titel";
  titel.textContent = "Letzte 7 Tage";
  box.append(titel);

  const tage = [];
  for (let vor = 6; vor >= 0; vor--) tage.push({ vor, von: tagStart(vor), zahlen: tagZahlen(tagStart(vor), tagStart(vor - 1)) });

  // Der Balken zeigt den ECHTEN Gewinn, sobald irgendein Tag einen Verkauf
  // mit bekanntem Kaufpreis hat. Vorher waere er ueberall leer - dann zeigt
  // er die Ausgaben, damit man wenigstens sieht, wann der Bot gelaufen ist.
  const hatGewinn = tage.some((t) => t.zahlen.mitKauf > 0);
  const groesste = Math.max(1, ...tage.map((t) => (hatGewinn ? Math.abs(t.zahlen.echt) : t.zahlen.ausgegeben)));

  for (const tag of tage) {
    const z = tag.zahlen;
    const datum = new Date(tag.von);
    const name = tag.vor === 0 ? "Heute" : tag.vor === 1 ? "Gestern"
      : WOCHENTAG[datum.getDay()] + ". " + datum.getDate() + "." + (datum.getMonth() + 1) + ".";
    const zeile = document.createElement("div");
    zeile.className = "blatt-zeile woche-zeile";
    const links = document.createElement("span");
    links.textContent = name;
    const balken = document.createElement("span");
    balken.className = "woche-balken";
    const fuellung = document.createElement("i");
    const wert = hatGewinn ? z.echt : z.ausgegeben;
    fuellung.style.width = Math.round((Math.min(Math.abs(wert), groesste) / groesste) * 100) + "%";
    if (hatGewinn && wert < 0) fuellung.className = "minus";
    balken.append(fuellung);
    const rechts = document.createElement("b");
    // Kaeufe und Ausgaben stehen immer da. Der echte Gewinn nur an Tagen mit
    // Verkauf - sonst stuende dort eine 0, die wie ein schlechter Tag aussieht.
    rechts.textContent = z.kaeufe.length + " × · " + fmt(z.ausgegeben) +
      (z.mitKauf ? " · " + (z.echt >= 0 ? "+" : "") + fmt(z.echt) : "");
    zeile.append(links, balken, rechts);
    box.append(zeile);
  }

  const woche = tagZahlen(tagStart(6), 0);
  const vorwoche = tagZahlen(tagStart(13), tagStart(6));
  blattZeile(box, "Summe 7 Tage", woche.kaeufe.length + " Käufe · " + fmt(woche.ausgegeben) + " Coins");
  blattZeile(box, "Echter Gewinn 7 Tage", woche.mitKauf
    ? (woche.echt >= 0 ? "+" : "") + fmt(woche.echt) + " Coins aus " + woche.mitKauf + (woche.mitKauf === 1 ? " Verkauf" : " Verkäufen")
    : "noch kein Verkauf mit bekanntem Kaufpreis", woche.mitKauf && woche.echt < 0 ? "err" : "");
  // Vergleich nur, wenn in BEIDEN Wochen verkauft wurde. Sonst hiesse ein
  // dickes Minus nur, dass der Bot letzte Woche noch gar nicht lief.
  if (woche.mitKauf && vorwoche.mitKauf) {
    const diff = woche.echt - vorwoche.echt;
    blattZeile(box, "Gegenüber der Vorwoche", (diff >= 0 ? "+" : "") + fmt(diff) + " Coins", diff >= 0 ? "" : "warn");
  } else {
    blattZeile(box, "Gegenüber der Vorwoche", "noch keine Vergleichswoche");
  }

  // Ehrlich bleiben: Kauflog und Verkaufslog halten je 500 Eintraege.
  const hinweis = document.createElement("p");
  hinweis.className = "hint";
  hinweis.textContent = "Gerechnet aus deinen letzten 500 Käufen und 500 Verkäufen. Liegt mehr dahinter, fehlen die ältesten Tage.";
  box.append(hinweis);
}

function renderSammlungenBlatt() {
  const box = $("sammlungen-liste");
  if (!box) return;
  box.textContent = "";
  const namen = Object.keys(collections).sort((a, b) => a.localeCompare(b, "de"));
  if (!namen.length) {
    const leer = document.createElement("p");
    leer.className = "hint";
    leer.textContent = "Noch keine Sammlung gespeichert.";
    box.append(leer);
    return;
  }
  for (const name of namen) {
    const zeile = document.createElement("div");
    zeile.className = "blatt-zeile";
    const links = document.createElement("span");
    links.textContent = name + " (" + collections[name].length + ")";
    const knopf = document.createElement("button");
    knopf.className = "secondary";
    knopf.type = "button";
    knopf.textContent = "Laden";
    knopf.addEventListener("click", () => {
      $("collection-pick").value = name;
      renderCollections();
      $("collection-load").click();
      blattSchliessen("sammlungen-blatt");
    });
    zeile.append(links, knopf);
    box.append(zeile);
  }
}

function blattOeffnen(id) {
  const blatt = $(id);
  if (!blatt) return;
  if (id === "heute-blatt") renderHeuteBlatt();
  if (id === "sammlungen-blatt") renderSammlungenBlatt();
  blatt.hidden = false;
}

function blattSchliessen(id) {
  const blatt = $(id);
  if (blatt) blatt.hidden = true;
}

// Ein Klick auf den dunklen Rand schliesst, ein Klick ins Blatt nicht.
function blattVerdrahten(id, knopfId) {
  const blatt = $(id);
  if (!blatt) return;
  blatt.addEventListener("click", (e) => {
    if (e.target === blatt) blattSchliessen(id);
  });
  if ($(knopfId)) $(knopfId).addEventListener("click", () => blattSchliessen(id));
}

// Solange das hier wahr ist, bleibt nach dem Stopp die Zusammenfassung
// stehen. Erst der Knopf "Weiter einstellen" setzt es zurueck.
let laufEndeOffen = false;

// Die Zusammenfassung nach dem Lauf (25.09.2026). Sie rechnet nur mit dem,
// was ohnehin schon da ist: Grund und Zeit aus letzterStopp, die Zahlen aus
// stats, die Kaeufe aus dem Kauflog. Der Bot raeumt STATE.run nie weg, also
// muss dafuer nichts zusaetzlich gespeichert und nichts bei EA geholt werden.
function renderLaufEnde(st) {
  const stopp = st.letzterStopp || null;
  const startT = Number(st.runStartedAt) || 0;
  // Die Uhr darf nach dem Ende nicht weiterlaufen - sonst waechst die
  // "Laufzeit" eines Laufs, der seit einer Stunde steht.
  const endeT = stopp && Number(stopp.t) > startT ? Number(stopp.t) : Date.now();
  const s = st.stats || {};
  if ($("hud-banner")) $("hud-banner").dataset.level = stopp && stopp.level === "error" ? "error" : "ende";
  if ($("hud-timer")) $("hud-timer").textContent = "Lauf beendet · " + duration(endeT - startT);
  if ($("hud-rotation")) $("hud-rotation").hidden = true;
  // Pausenbalken und Auktionsliste gehoeren zum laufenden Betrieb. Stehen zu
  // bleiben hiesse hier: eine Pause anzeigen, die nie zu Ende geht.
  const pause = WURZEL.querySelector(".hud-pause-bar");
  if (pause) pause.hidden = true;
  if ($("hud-bids-wrap")) $("hud-bids-wrap").hidden = true;

  const grund = $("hud-ende-grund");
  if (grund) {
    const kaeufe = laufKaeufe(purchases, s.bought || 0, startT);
    const g = erwarteterGewinn(kaeufe, history);
    grund.textContent = (stopp && stopp.message ? stopp.message : st.message || "Der Lauf ist beendet.") + " " +
      (s.scans || 0) + " Suchen · " + (s.bought || 0) + " gekauft · " + fmt(s.spent || 0) + " Coins ausgegeben" +
      (g.bekannt ? " · geschätzter Gewinn " + (g.summe >= 0 ? "+" : "") + fmt(g.summe) + " Coins" : "") + ".";
  }
}

// Welche Einstellungen der LAUFENDE Lauf benutzt (27.09.2026). Sobald der Lauf
// beginnt, sind alle Felder ausgeblendet - danach stand nirgends mehr, mit
// welchem Tempo, welchem Budget und welchen Grenzen er gestartet ist. FUT Simple
// Trader zeigt dafuer einen Streifen "Settings overview"
// (scripts.js Z. 43700-43758).
// Die Werte kommen aus st.grenzen, also aus dem Lauf selbst. Die Felder in der
// Maske zu lesen waere falsch: Wer waehrend des Laufs am Tempo dreht, wuerde
// hier eine Zahl sehen, mit der der Bot gar nicht arbeitet.
// Meldet ein aelterer Bot nur die drei alten Werte, stehen eben nur die da -
// weglassen ist besser als raten.
function laufEinstellungenText(st) {
  const g = (st && st.grenzen) || null;
  if (!g) return "";
  const teile = [];
  if (g.speedMode) teile.push("Tempo " + (TEMPO_TEXT[g.speedMode] || g.speedMode));
  if (g.pausePreset) teile.push("Pausen " + (PAUSEN_TEXT[g.pausePreset] || g.pausePreset));
  // Ohne Grenze ehrlich benennen (28.09.2026) statt die Zeile wegzulassen.
  if (g.budgetUnbegrenzt) teile.push("Budget ohne Grenze (Kontostand bremst)");
  else if (Number(g.budget) > 0) teile.push("Budget " + fmt(Number(g.budget)) + " Coins");
  if (Number(g.maxBuys) > 0) teile.push("höchstens " + Number(g.maxBuys) + " Käufe");
  if (Number(g.timeLimitMin) > 0) teile.push("Laufzeit " + Number(g.timeLimitMin) + " Min.");
  // Punkt 12a: Nur die Grenzen nennen, die wirklich gesetzt sind - nicht
  // "0 Suchen / 3 Käufe", wenn nur eine der beiden Zahlen im Feld steht.
  if (Number(g.filterSearchLimit) > 0 && Number(g.filterBuyLimit) > 0) {
    teile.push("je Spieler " + (Number(g.filterSearchLimit) || 0) + " Suchen / " + (Number(g.filterBuyLimit) || 0) + " Käufe");
  }
  else if (Number(g.filterSearchLimit) > 0) teile.push("je Spieler " + Number(g.filterSearchLimit) + " Suchen");
  else if (Number(g.filterBuyLimit) > 0) teile.push("je Spieler " + Number(g.filterBuyLimit) + " Käufe");
  else if (st.fstModus === true) teile.push("je Spieler ohne Grenze");
  if (Number(g.filterSpendLimit) > 0) teile.push("je Spieler höchstens " + fmt(Number(g.filterSpendLimit)) + " Coins");
  if (g.afterBuy) teile.push("nach dem Kauf " + (DANACH_TEXT[g.afterBuy] || g.afterBuy));
  if (g.speedMode) teile.push(g.bidSniping ? "auch Gebote" : "nur Sofortkauf");
  return teile.length ? "Dieser Lauf: " + teile.join(" · ") + ". Ändern erst nach dem Stopp." : "";
}

function renderLiveHud(st) {
  const hud = $("running-hud");
  const config = $("snipe-config-container");
  if (!hud || !config) return;

  // Waehrend der Pause zwischen zwei Filtern laeuft kein Lauf - die Anzeige
  // darf trotzdem nicht auf die Einstellungen zurueckspringen.
  const rot = (st && st.rotation) || null;
  const running = Boolean(st && (st.running || (rot && rot.aktiv)));
  // Nach dem Stopp stehen bleiben (25.09.2026). Frueher verschwand mit dem
  // Lauf-Ende das ganze Fenster: Ticker, "Letzte Suche" und der Stopp-Grund
  // waren in derselben Sekunde weg, in der man sie lesen wollte.
  if (running) laufEndeOffen = true;
  const ende = !running && laufEndeOffen && Boolean(st && st.runStartedAt);
  hud.hidden = !running && !ende;
  config.hidden = running || ende;
  if ($("hud-ende")) $("hud-ende").hidden = !ende;
  if (ende) {
    renderLaufEnde(st);
    return;
  }
  // Zurueck im Lauf: was die Zusammenfassung versteckt hat, kommt wieder.
  const pauseLeiste = WURZEL.querySelector(".hud-pause-bar");
  if (pauseLeiste) pauseLeiste.hidden = false;

  if (!running) return;

  // 1. Status Text & Timer
  if ($("hud-status-text")) $("hud-status-text").textContent = st.message || "Sniping aktiv …";
  if ($("hud-timer") && st.runStartedAt) {
    // Seit 25.09.2026 steht auch die RESTZEIT da. Nur die verstrichene Zeit
    // zu zeigen hiess: Man weiss nie, ob der Lauf gleich von selbst aufhoert
    // oder noch eine Stunde weiterlaeuft. Das Zeitlimit kommt aus st.grenzen.
    const limitMin = st.grenzen && Number(st.grenzen.timeLimitMin) > 0 ? Number(st.grenzen.timeLimitMin) : 0;
    const restMs = limitMin ? st.runStartedAt + limitMin * 60000 - Date.now() : 0;
    $("hud-timer").textContent = "Laufzeit: " + duration(Date.now() - st.runStartedAt) +
      (limitMin ? (restMs > 0 ? " · noch " + Math.max(1, Math.ceil(restMs / 60000)) + " Min." : " · Zeitlimit erreicht") : "");
  }
  // Was gerade gilt - im Lauf sonst nirgends zu sehen (27.09.2026).
  if ($("hud-settings")) {
    const satz = laufEinstellungenText(st);
    $("hud-settings").textContent = satz;
    $("hud-settings").hidden = !satz;
  }
  // Zeile zur Rotation: der wievielte Filter, Pause, was als Naechstes kommt.
  if ($("hud-rotation")) {
    const zeile = $("hud-rotation");
    if (rot && rot.aktiv) {
      const naechster = rotationLaeuft ? (rotationKandidaten()[0] || null) : null;
      zeile.hidden = false;
      // 28.09.2026: Hier stand "von hoechstens 12" - das ist die Sicherung aus
      // content.js, nicht die Zahl, die kommt. Jetzt steht die Gesamtzahl da,
      // die das Budget hergibt: die schon gefahrenen plus die noch moeglichen.
      // Nur die noch moeglichen zu zeigen hiesse, die Zahl faellt mit jedem
      // Filter - dann staende dort fast immer "X von X".
      const nochDrin = rotFilterMoeglich(true);
      const gesamt = Math.min(rot.max, rot.filterNr + Math.max(nochDrin.tag, nochDrin.stunde));
      zeile.textContent = "Filter " + rot.filterNr + (fstAn() ? "" : " von etwa " + Math.max(rot.filterNr, gesamt)) +
        (rot.pauseBis > Date.now() ? " · Pause: noch " + Math.ceil((rot.pauseBis - Date.now()) / 1000) + " s" : "") +
        (naechster ? " · als Nächstes: " + naechster.player.name : "");
    } else {
      zeile.hidden = true;
      zeile.textContent = "";
    }
  }
  // Pause/Warnung: Banner orange statt gruen - gruen heisst "sucht gerade".
  if ($("hud-banner")) $("hud-banner").dataset.level = st.level === "warn" ? "warn" : st.level === "error" ? "error" : "run";

  // 2. Pause Fortschritt
  const nextPause = st.nextPauseIn || 0;
  // Waehrend der Pause: Restzeit statt leerem Balken. Der Balken laeuft dann
  // von voll nach leer, bis wieder gesucht wird.
  const pauseRest = Number(st.pauseBis) > Date.now() ? Number(st.pauseBis) - Date.now() : 0;
  if ($("hud-pause-text")) {
    // "aus" (27.09.2026): Ohne Sicherheitspausen gibt es nichts zu zaehlen.
    // Vorher stuende hier dauerhaft "Pause laeuft …", obwohl keine kommt -
    // das sieht aus wie ein haengender Bot.
    const pausenAus = $("pausePreset") && $("pausePreset").value === "off";
    $("hud-pause-text").textContent = pauseRest > 0 ? "Pause: noch " + Math.ceil(pauseRest / 1000) + " s"
      : pausenAus ? "keine Pausen"
      : nextPause > 0 ? "in " + nextPause + " Suchen" : "Pause läuft …";
  }
  if ($("hud-pause-fill") && pauseRest > 0) {
    const dauer = Math.max(pauseRest, Number(st.pauseDauer) || 0);
    $("hud-pause-fill").style.width = Math.round((pauseRest / dauer) * 100) + "%";
  } else if ($("hud-pause-fill")) {
    // Der Abstand kommt vom Bot (je nach Pausen-Einstellung 20 bis 65 Suchen).
    // 40 gilt nur, solange ein aelterer Bot ihn noch nicht mitschickt.
    const pauseEvery = Number(st.pauseEvery) > 0 ? Number(st.pauseEvery) : 40;
    const pausePct = Math.min(100, Math.max(0, Math.round((nextPause / pauseEvery) * 100)));
    $("hud-pause-fill").style.width = pausePct + "%";
  }

  // 3. Aktiver Spieler Fokuskarte
  const cur = st.currentTarget;
  if (cur) {
    if ($("hud-player-name")) $("hud-player-name").textContent = cur.playerName || "–";
    if ($("hud-player-rating")) $("hud-player-rating").textContent = cur.rating ? String(cur.rating) : "alle";
    // Live-Filter gelten 15 Minuten - die Restzeit gleich dazu, sonst wirkt
    // das Ende des Laufs danach wie ein Fehler.
    const filterRest = Number(cur.expiresAt) > 0 ? Number(cur.expiresAt) - Date.now() : 0;
    // Kauf, Verkauf und Gewinn in EINER Zeile (25.09.2026). Gerade wenn der
    // Bot lange nichts findet, will man wissen, ob der Zielpreis ueberhaupt
    // noch lohnt. Der Verkaufspreis kommt aus dem Lauf selbst (salePrice),
    // sonst aus dem gespeicherten Preisverlauf - dieselbe Rechnung wie in
    // der Kaufliste. Keine neue Preis-Pruefung, also keine EA-Anfrage.
    const verkaufNow = marktwertFuer({ playerId: cur.playerId, rating: cur.rating, salePrice: cur.salePrice }, history);
    const spanne = verkaufNow > 0 ? Math.floor(verkaufNow * (1 - SALE_FEE)) - (Number(cur.maxPrice) || 0) : null;
    if ($("hud-player-target-price")) $("hud-player-target-price").textContent = "Kauf bis " + fmt(cur.maxPrice) + " Coins" +
      (spanne === null ? "" : " · Verkauf ca. " + fmt(verkaufNow) + " · Gewinn ca. " + (spanne >= 0 ? "+" : "") + fmt(spanne)) +
      (Number(cur.expiresAt) > 0 ? (filterRest > 0 ? " · Filter gilt noch " + Math.max(1, Math.ceil(filterRest / 60000)) + " Min." : " · Filter abgelaufen") : "");
    if ($("hud-player-portrait")) $("hud-player-portrait").replaceChildren(portrait(cur.playerId, cur.playerName));
  } else if (st.lastSearch) {
    if ($("hud-player-name")) $("hud-player-name").textContent = st.lastSearch.player || "–";
    if ($("hud-player-rating")) $("hud-player-rating").textContent = st.lastSearch.rating ? String(st.lastSearch.rating) : "alle";
    if ($("hud-player-target-price")) $("hud-player-target-price").textContent = "Zielpreis: ≤ " + fmt(st.lastSearch.maxPrice) + " Coins";
  }
  const scans = (st.stats && st.stats.scans) || 0;
  if ($("hud-scan-count")) $("hud-scan-count").textContent = "Suche " + scans;

  const ls = st.lastSearch;
  if (ls && $("hud-last-search-text")) {
    $("hud-last-search-text").textContent =
      "Letzte Suche: " + ls.count + " Angebote (" + ls.under + " unter Zielpreis" +
      (ls.min ? ", günstigstes " + fmt(ls.min) : "") + ")";
  }

  // 4. Live Gebote
  const bids = st.activeBids || [];
  const bidsWrap = $("hud-bids-wrap");
  const bidsList = $("hud-bids-list");
  if (bidsWrap && bidsList) {
    if (bids.length > 0) {
      bidsWrap.hidden = false;
      if ($("hud-bids-badge")) $("hud-bids-badge").textContent = bids.length + " aktiv";
      bidsList.replaceChildren(
        ...bids.map((b) => {
          const item = document.createElement("div");
          item.className = "hud-bid-item hud-bid-leading";
          const info = document.createElement("span");
          info.textContent = b.playerName + (b.rating ? " (" + b.rating + ")" : "") + " · " + fmt(b.amount) + " Coins";
          const time = document.createElement("b");
          time.textContent = b.secondsLeft != null ? b.secondsLeft + "s" : "aktiv";
          item.append(info, time);
          return item;
        })
      );
    } else {
      bidsWrap.hidden = true;
    }
  }

  // 5. Live Ticker Feed
  const feedList = $("hud-feed-list");
  if (feedList) {
    const events = st.recentEvents || [];
    if (events.length > 0) {
      feedList.replaceChildren(
        ...events.slice(-15).reverse().map((ev) => {
          const row = document.createElement("div");
          row.className = "hud-feed-item";
          const t = document.createElement("span");
          t.className = "hud-feed-time";
          t.textContent = clockTime(ev.t);
          const txt = document.createElement("span");
          txt.className = "hud-feed-text";
          txt.textContent = ev.text;
          row.append(t, txt);
          return row;
        })
      );
    } else {
      feedList.replaceChildren();
      const empty = document.createElement("div");
      empty.className = "hud-feed-empty";
      empty.textContent = "Warte auf erste Aktionen …";
      feedList.append(empty);
    }
  }
}


// ---------------------------------------------------------------------------
// Markt-Tacho und die vier Kacheln im Kopf (Punkte 6 und 8).
//
// FST zeigt eine Marktaktivitaet von 0 bis 100. Die Zahl kommt dort vom
// eigenen Server aus den Daten vieler Nutzer (scripts.js Z. 20422-20510,
// 37374-37542). So etwas haben wir nicht - und wollen es auch nicht, denn
// dafuer muessten Konto- und Kaufdaten das Haus verlassen.
//
// Unsere Zahl kommt nur aus eigenen Laeufen: Wie viele Treffer gab es pro
// 100 Suchen? Wie oft wurde aus einem Treffer ein Kauf? Wie viele brauchbare
// Filter liegen gerade vor? Bremst EA gerade? Das kostet keine Anfrage.
// ---------------------------------------------------------------------------
const TACHO_STUNDE = 60 * 60 * 1000;
const TACHO_FENSTER_MS = 6 * TACHO_STUNDE; // so weit zurueck zaehlen wir Treffer
const TACHO_MIN_SUCHEN = 20; // darunter sagen wir ehrlich: zu wenig Daten
const TACHO_GUTE_TREFFER = 8; // 8 Treffer pro 100 Suchen gelten als sehr gut

function tachoWort(wert) {
  if (wert == null) return "keine Daten";
  if (wert < 25) return "schlecht";
  if (wert < 55) return "mittel";
  if (wert < 80) return "gut";
  return "sehr gut";
}

function tachoStufe(wert) {
  if (wert == null) return "unbekannt";
  return wert < 34 ? "niedrig" : wert < 67 ? "mittel" : "hoch";
}

// Treffer und Kaeufe aus den gespeicherten Laeufen zusammenzaehlen.
function tachoLaeufe(vonMs) {
  const jetzt = Date.now();
  let scans = 0;
  let treffer = 0;
  let kaeufe = 0;
  for (const r of runs) {
    if (!r || jetzt - r.t > vonMs) continue;
    scans += Number(r.scans) || 0;
    kaeufe += Number(r.bought) || 0;
    treffer += (Number(r.bought) || 0) + (Number(r.missed) || 0);
  }
  return { scans, treffer, kaeufe };
}

// Die besten Stunden aus allen gespeicherten Laeufen: Treffer pro 100 Suchen
// je Tagesstunde. Nur Stunden mit genug Suchen zaehlen.
function tachoBesteStunden() {
  const eimer = new Map();
  for (const r of runs) {
    if (!r || !(Number(r.scans) > 0)) continue;
    const stunde = new Date(r.t).getHours();
    const e = eimer.get(stunde) || { scans: 0, treffer: 0 };
    e.scans += Number(r.scans) || 0;
    e.treffer += (Number(r.bought) || 0) + (Number(r.missed) || 0);
    eimer.set(stunde, e);
  }
  return Array.from(eimer.entries())
    .filter(([, e]) => e.scans >= 30)
    .map(([stunde, e]) => ({ stunde, quote: e.treffer / e.scans * 100 }))
    .sort((a, b) => b.quote - a.quote)
    .slice(0, 3);
}

// Die Wochentage im Klartext - fuer die Anzeige "Samstag 20 Uhr".
const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

// Wie tachoBesteStunden(), aber Wochentag UND Stunde bilden zusammen einen
// Eimer (27.09.2026). Grund: Samstag 20 Uhr ist ein anderer Markt als
// Dienstag 20 Uhr - FST nennt deshalb immer Tag und Uhrzeit. Dafuer braucht es
// siebenmal so viele Laeufe wie bei den reinen Stunden. Findet sich hier
// nichts, bleibt es bei den Stunden - weggeworfen wird keine Angabe.
function tachoBesteWochenzeiten() {
  const eimer = new Map();
  for (const r of runs) {
    if (!r || !(Number(r.scans) > 0)) continue;
    const zeit = new Date(r.t);
    const schluessel = zeit.getDay() + "-" + zeit.getHours();
    const e = eimer.get(schluessel) || { tag: zeit.getDay(), stunde: zeit.getHours(), scans: 0, treffer: 0 };
    e.scans += Number(r.scans) || 0;
    e.treffer += (Number(r.bought) || 0) + (Number(r.missed) || 0);
    eimer.set(schluessel, e);
  }
  return Array.from(eimer.values())
    // Ohne einen einzigen Treffer ist eine Zeit kein gutes Fenster - solche
    // Eimer fliegen raus, sonst wird eine Null-Stunde empfohlen.
    .filter((e) => e.scans >= 30 && e.treffer > 0)
    .map((e) => ({ tag: e.tag, stunde: e.stunde, quote: e.treffer / e.scans * 100 }))
    .sort((a, b) => b.quote - a.quote)
    .slice(0, 3);
}

// --- Was ist gerade los am Markt? (Marktaktivität im Detail) ---------------
//
// Vorbild ist das Markt-Fenster von FST: eine Zahl von 100, dazu Konkurrenz,
// Trefferquote, Preisrichtung und das naechste gute Zeitfenster. FST rechnet
// das auf seinem Server aus den Daten tausender Nutzer. Wir rechnen es hier
// aus DEINEN Messungen - das kostet keine einzige EA-Anfrage, denn jede
// Zahl steckt schon in dem, was Preis-Check und Markt-Scan gespeichert haben.
const MARKT_FENSTER_MS = 2 * TACHO_STUNDE; // so frisch muessen Messungen sein
const MARKT_MIN_MESSUNGEN = 3;

// Alle Messungen der letzten Stunden, egal ob aus Preis-Check oder Scan.
function marktMessungen(vonMs) {
  const jetzt = Date.now();
  const liste = [];
  for (const key of Object.keys(history)) {
    const eintraege = Array.isArray(history[key]) ? history[key] : [];
    for (const e of eintraege) {
      if (!e || !(Number(e.t) > 0) || jetzt - e.t > vonMs) continue;
      liste.push(e);
    }
  }
  return liste.sort((a, b) => a.t - b.t);
}

// Konkurrenz: Wie viele Angebote verschwinden zwischen zwei Messungen?
// Der Preis-Check misst das (turnoverRate, disappeared, appeared) - und seit
// dem 28.09.2026 zaehlen auch die Messungen aus dem laufenden Betrieb mit.
// Sie stehen im eigenen Logbuch (aktivLog): Ohne Preis-Check-Eintrag hatte
// die Laufmessung frueher keinen Platz und verschwand stillschweigend.
// FST bekommt seine Stufe fertig vom Server (scripts.js Z. 34901-34909,
// user_activity.level Z. 37418-37423) - den duerfen wir nicht nutzen, darum
// bleibt unsere Stufe eine eigene Messung mit derselben Anzeige "x von 5".
function marktKonkurrenz() {
  const jetzt = Date.now();
  const passt = (e) => e && Number(e.messAbstandMs) >= AKTIVITAET_MIN_ABSTAND_MS && Number(e.sampleSize) > 0;
  // Preis-Eintraege, die eine Laufmessung ueberschrieben hat (aktivQuelle
  // "lauf"), stehen schon im Logbuch - sie hier noch einmal zu zaehlen
  // waere doppelt.
  const preisCheck = marktMessungen(MARKT_FENSTER_MS).filter((e) => passt(e) && e.aktivQuelle !== "lauf");
  // typeof-Pruefung: In den Tests laeuft dieser Block ohne die Kopfzeilen
  // der Datei - dort gibt es die Variable aktivLog sonst nicht.
  const logbuch = typeof aktivLog === "undefined" || !Array.isArray(aktivLog) ? [] : aktivLog;
  const lauf = logbuch.filter((e) => passt(e) && Number(e.t) > 0 && jetzt - e.t <= MARKT_FENSTER_MS);
  const mit = preisCheck.concat(lauf);
  if (mit.length < MARKT_MIN_MESSUNGEN) return { stufe: 0, quote: 0, messungen: mit.length, neu: 0 };
  const quote = mit.reduce((s, e) => s + (Number(e.turnoverRate) || 0), 0) / mit.length;
  const neu = mit.reduce((s, e) => s + (Number(e.appeared) || 0), 0) / mit.length;
  // 0 bis 5 wie bei FST: ab 40 % weg in wenigen Sekunden ist das Höchste.
  const stufe = Math.max(1, Math.min(5, Math.round(quote / 0.08)));
  return { stufe, quote: quote * 100, messungen: mit.length, neu };
}

// Preisrichtung: Wie viele Karten sind seit der vorigen Messung teurer oder
// billiger geworden? Gezaehlt wird je Karte nur der letzte Vergleich.
function marktPreisRichtung() {
  const jetzt = Date.now();
  let rauf = 0;
  let runter = 0;
  let gleich = 0;
  for (const key of Object.keys(history)) {
    const eintraege = (Array.isArray(history[key]) ? history[key] : []).filter((e) => e && Number(e.market) > 0);
    if (eintraege.length < 2) continue;
    const neu = eintraege[eintraege.length - 1];
    const alt = eintraege[eintraege.length - 2];
    if (jetzt - neu.t > 24 * TACHO_STUNDE) continue;
    const unterschied = (neu.market - alt.market) / alt.market;
    if (unterschied > 0.02) rauf += 1;
    else if (unterschied < -0.02) runter += 1;
    else gleich += 1;
  }
  const gesamt = rauf + runter + gleich;
  return {
    karten: gesamt,
    rauf: gesamt ? Math.round(rauf / gesamt * 100) : 0,
    runter: gesamt ? Math.round(runter / gesamt * 100) : 0
  };
}

// Ist gerade mehr oder weniger los als sonst um diese Uhrzeit? Verglichen
// wird mit deiner eigenen Trefferquote in dieser Stunde an anderen Tagen.
function marktZustand(trefferQuote) {
  const stunde = new Date().getHours();
  let scans = 0;
  let treffer = 0;
  const jetzt = Date.now();
  for (const r of runs) {
    if (!r || !(Number(r.scans) > 0)) continue;
    if (jetzt - r.t < 2 * TACHO_STUNDE) continue; // der laufende Abend zaehlt nicht mit
    if (new Date(r.t).getHours() !== stunde) continue;
    scans += Number(r.scans) || 0;
    treffer += (Number(r.bought) || 0) + (Number(r.missed) || 0);
  }
  if (scans < 30) return { text: "", ueblich: null, prozent: null };
  const ueblich = treffer / scans * 100;
  if (!(ueblich > 0)) return { text: "", ueblich, prozent: null };
  const faktor = trefferQuote / ueblich;
  // 27.09.2026: Die Prozentzahl gehoert dazu. FST schreibt "+12 % gegenüber
  // sonst". Bei uns hiess alles zwischen 25 % schlechter und 25 % besser nur
  // "Normaler Markt" - ob es 3 % oder 24 % waren, blieb verborgen.
  const prozent = Math.round((faktor - 1) * 100);
  const vergleich = prozent === 0
    ? "genau wie sonst"
    : (prozent > 0 ? "+" + prozent : String(prozent)) + " % gegenüber sonst";
  const wort = faktor >= 1.25 ? "Lebhafter Markt" : faktor <= 0.75 ? "Ruhiger Markt" : "Normaler Markt";
  const text = wort + ": " + vergleich + " um " + stunde + " Uhr.";
  return { text, ueblich, prozent };
}

// Ein Zeitpunkt im Klartext: "Samstag 20 Uhr (in 3 Stunden)". Heute und morgen
// werden beim Namen genannt, alles weiter weg mit dem Wochentag.
function fensterText(wann, stundenVoraus) {
  const jetzt = new Date();
  const morgen = new Date(jetzt.getTime() + 24 * TACHO_STUNDE);
  const tag = wann.toDateString() === jetzt.toDateString()
    ? "Heute"
    : wann.toDateString() === morgen.toDateString()
      ? "Morgen"
      : WOCHENTAGE[wann.getDay()];
  // "in 141 Stunden" kann niemand lesen - ab eineinhalb Tagen Tage nennen.
  const abstand = stundenVoraus <= 1
    ? "in der nächsten Stunde"
    : stundenVoraus <= 36
      ? "in " + stundenVoraus + " Stunden"
      : "in " + Math.round(stundenVoraus / 24) + " Tagen";
  return tag + " " + wann.getHours() + " Uhr (" + abstand + ")";
}

// Wann lohnt es sich als Nächstes? Aus deinen besten Zeiten.
// 27.09.2026: FST nennt Wochentag UND Uhrzeit ("Samstag 20:30"), wir nannten
// nur die Stunde. Jetzt wird zuerst nach Wochentag und Stunde zusammen gesucht.
// Gibt es dafuer noch zu wenige Laeufe, zaehlen wieder die reinen Stunden - so
// geht keine Angabe verloren, es kommt nur der Tag dazu.
function marktNaechstesFenster(stunden) {
  const jetzt = new Date();
  const wochenzeiten = tachoBesteWochenzeiten();
  // Eine Woche vorausschauen, denn so weit reicht ein Wochentag-Eimer.
  for (let i = 1; i <= 168; i++) {
    const kommt = new Date(jetzt.getTime() + i * TACHO_STUNDE);
    if (!wochenzeiten.some((w) => w.tag === kommt.getDay() && w.stunde === kommt.getHours())) continue;
    return fensterText(kommt, i);
  }
  // Nur Stunden, in denen es wirklich Treffer gab. Eine Stunde mit 0 Treffern
  // waere kein gutes Fenster, auch wenn sie in der Liste der besten steht.
  const beste = stunden.filter((s) => s.quote > 0).map((s) => s.stunde);
  if (!beste.length) return "";
  for (let i = 1; i <= 24; i++) {
    const kommt = new Date(jetzt.getTime() + i * TACHO_STUNDE);
    if (!beste.includes(kommt.getHours())) continue;
    return fensterText(kommt, i);
  }
  return "";
}

// Markt und eigener Zustand getrennt (27.09.2026). Die grosse Zahl mischt
// beides: sie kann fallen, weil der letzte Markt-Scan wenige Filter gebracht
// hat oder EA langsam antwortet - obwohl am Markt alles unverändert ist. Zwei
// Nutzer zur selben Minute bekamen dadurch verschiedene Zahlen. Deshalb gibt
// es jetzt zwei einzelne Zahlen dazu. Die grosse Zahl bleibt, wie sie war -
// die Sperren-Bremse darin darf nicht verloren gehen.

// Nur der Markt: Was gibt der Markt her? Treffer je Suche und wie viel die
// anderen wegkaufen. Ist die Konkurrenz noch nicht messbar, zaehlen nur die
// Treffer - geraten wird nichts.
function marktNurMarkt(punkteTreffer, konkurrenz) {
  const messungen = Number(konkurrenz && konkurrenz.messungen) || 0;
  if (messungen < MARKT_MIN_MESSUNGEN) return Math.round(punkteTreffer);
  // Stufe 1 (kaum Konkurrenz) sind 100 Punkte, Stufe 5 (sehr viel) sind 0.
  const punkteKonkurrenz = Math.max(0, Math.min(100, (5 - konkurrenz.stufe) / 4 * 100));
  return Math.round(punkteTreffer * 0.7 + punkteKonkurrenz * 0.3);
}

// Nur die eigene Ausruestung: Hast DU genug Filter, wird aus einem Treffer ein
// Kauf, antwortet EA schnell, laeuft keine Sperre?
function marktNurAusruestung(punkteErfolg, punkteFilter, gebremst, gesperrt) {
  let wert = Math.round(punkteFilter * 0.5 + punkteErfolg * 0.5);
  if (gebremst) wert = Math.max(0, wert - 25);
  if (gesperrt) wert = Math.min(wert, 10);
  return wert;
}

function marktTachoStand(st) {
  const fenster = tachoLaeufe(TACHO_FENSTER_MS);
  const tag = tachoLaeufe(24 * TACHO_STUNDE);
  const filter = liveFilterRows().length;
  // Bremst EA? Das steht in health.slow (langsame Antworten) und in
  // health.throttle (Hinweistext, wenn ein Filter ploetzlich nichts liefert).
  const health = (st && st.health) || {};
  const gebremst = Boolean(health.slow) || Boolean(health.throttle);
  // Laeuft gerade eine Sperre, ist der Markt fuer uns egal - dann darf hier
  // nie "sehr gut" stehen und jemanden zum Starten verleiten.
  const gesperrt = Number(st && st.cooldown && st.cooldown.leftMin) > 0;
  const teile = [];
  if (fenster.scans < TACHO_MIN_SUCHEN) {
    return {
      wert: null,
      wort: tachoWort(null),
      stufe: "unbekannt",
      grund: "Noch zu wenig Daten: " + fenster.scans + " Suchen in den letzten 6 Stunden. Ab " + TACHO_MIN_SUCHEN + " Suchen zeigt der Bot eine Zahl.",
      teile,
      filter,
      stunden: tachoBesteStunden(),
      trefferQuote: null,
      erfolgQuote: null,
      konkurrenz: marktKonkurrenz(),
      preise: marktPreisRichtung(),
      zustand: "",
      zustandProzent: null,
      // Auch die zwei getrennten Zahlen bleiben leer, solange zu wenig
      // gemessen wurde (27.09.2026). Lieber ein Strich als eine geratene Zahl.
      marktWert: null,
      eigenWert: null,
      naechstes: marktNaechstesFenster(tachoBesteStunden())
    };
  }
  const trefferQuote = fenster.treffer / fenster.scans * 100;
  const punkteTreffer = Math.max(0, Math.min(100, trefferQuote / TACHO_GUTE_TREFFER * 100));
  const punkteErfolg = tag.treffer >= 3 ? Math.max(0, Math.min(100, tag.kaeufe / tag.treffer * 100)) : 50;
  const punkteFilter = Math.max(0, Math.min(100, filter / 8 * 100));
  let wert = Math.round(punkteTreffer * 0.5 + punkteErfolg * 0.25 + punkteFilter * 0.25);
  if (gesperrt) wert = Math.min(wert, 10);
  const komma = (n) => n.toFixed(1).replace(".", ",");
  teile.push({ name: "Treffer", text: komma(trefferQuote) + " Treffer je 100 Suchen (letzte 6 Std., " + fenster.scans + " Suchen)" });
  teile.push({ name: "Erfolg", text: tag.treffer >= 3 ? Math.round(tag.kaeufe / tag.treffer * 100) + " % der Treffer wurden ein Kauf (heute)" : "Noch zu wenige Treffer heute für eine Erfolgsquote" });
  teile.push({ name: "Filter", text: filter + " brauchbare Filter aus dem letzten Markt-Scan" });
  if (gebremst) {
    wert = Math.max(0, wert - 25);
    teile.push({ name: "Bremse", text: "EA antwortet gerade langsam – 25 Punkte Abzug" });
  }
  if (gesperrt) teile.push({ name: "Sperre", text: "Eine Sperre läuft – der Markt zählt gerade nicht" });
  const stunden = tachoBesteStunden();
  const konkurrenz = marktKonkurrenz();
  const preise = marktPreisRichtung();
  const zustand = marktZustand(trefferQuote);
  // Viel Konkurrenz heisst: Schnaeppchen sind weg, bevor der Bot sie sieht.
  if (konkurrenz.stufe >= 4) {
    wert = Math.max(0, wert - 10);
    teile.push({ name: "Konkurrenz", text: "Hoch (" + konkurrenz.stufe + " von 5) – 10 Punkte Abzug" });
  }
  return {
    wert,
    wort: tachoWort(wert),
    stufe: tachoStufe(wert),
    grund: "",
    teile,
    filter,
    stunden,
    trefferQuote,
    erfolgQuote: tag.treffer >= 3 ? tag.kaeufe / tag.treffer * 100 : null,
    konkurrenz,
    preise,
    zustand: zustand.text,
    zustandProzent: zustand.prozent == null ? null : zustand.prozent,
    // Getrennt gerechnet (27.09.2026): siehe marktNurMarkt/marktNurAusruestung.
    marktWert: marktNurMarkt(punkteTreffer, konkurrenz),
    eigenWert: marktNurAusruestung(punkteErfolg, punkteFilter, gebremst, gesperrt),
    naechstes: marktNaechstesFenster(stunden)
  };
}

function marktDetailOeffnen() {
  const stand = marktTachoStand(letzterStatus);
  const komma = (n) => n.toFixed(1).replace(".", ",");
  // Grosse Zahl, Wort und Zeiger auf dem Farbbalken.
  $("markt-gross").textContent = stand.wert == null ? "–" : String(stand.wert);
  $("markt-wort").textContent = stand.wort;
  // Die Farbe folgt dem WORT, nicht der groben Stufe: tachoWort kennt vier
  // Stufen (wie FST), tachoStufe nur drei. Mit der Stufe stand "mittel" (Zahl
  // 25 bis 33) in Rot und "gut" (55 bis 66) in Gelb.
  const WORT_FARBE = { "sehr gut": "sehr-gut", gut: "gut", mittel: "mittel", schlecht: "schlecht" };
  $("markt-wort").className = "markt-wort " + (WORT_FARBE[stand.wort] || "");
  $("markt-zeiger").style.left = (stand.wert == null ? 0 : Math.max(0, Math.min(100, stand.wert))) + "%";
  $("markt-zustand").textContent = stand.zustand || "";

  // Konkurrenz: Wie schnell verschwinden Angebote zwischen zwei Messungen?
  const k = stand.konkurrenz || { stufe: 0, messungen: 0 };
  $("markt-konkurrenz").textContent = k.messungen < 3
    ? "noch unbekannt"
    : (k.stufe >= 4 ? "hoch" : k.stufe >= 2 ? "mittel" : "niedrig") + " · " + k.stufe + " von 5";
  // 28.09.2026: Messungen kommen aus Preis-Checks UND aus dem laufenden
  // Betrieb. Der zweite Satz sagt ehrlich, warum es bei engen Filtern dauert.
  $("markt-konkurrenz").title = k.messungen < 3
    ? "Dafür braucht der Bot mindestens 3 Messungen: aus Preis-Checks oder aus dem laufenden Betrieb. " +
      "Im Lauf zählt eine Messung nur, wenn mindestens 4 Angebote im Preisfenster standen – " +
      "bei sehr engen Schnäppchen-Filtern (0–1 Angebote) kann das dauern."
    : "Im Schnitt verschwinden " + Math.round(k.quote) + " % der Angebote zwischen zwei Messungen, " +
      komma(k.neu) + " neue kommen dazu (" + k.messungen + " Messungen).";

  $("markt-effizienz").textContent = stand.trefferQuote == null
    ? "noch unbekannt"
    : komma(stand.trefferQuote) + " % / " + (stand.erfolgQuote == null ? "–" : Math.round(stand.erfolgQuote) + " %");
  $("markt-effizienz").title = "Links: Treffer je 100 Suchen (letzte 6 Std.). Rechts: wie oft daraus ein Kauf wurde (heute).";

  // Markt und eigene Ausruestung getrennt anzeigen (27.09.2026).
  if ($("markt-nurmarkt")) {
    $("markt-nurmarkt").textContent = stand.marktWert == null ? "–" : stand.marktWert + " von 100";
    $("markt-nurmarkt").title = "Nur der Markt: Treffer je Suche und wie viel die anderen wegkaufen. Deine Filter, EAs Tempo und Sperren zählen hier NICHT mit.";
  }
  if ($("markt-ausruestung")) {
    $("markt-ausruestung").textContent = stand.eigenWert == null ? "–" : stand.eigenWert + " von 100";
    $("markt-ausruestung").title = "Nur deine Seite: genug Filter, wie oft aus einem Treffer ein Kauf wird, ob EA gerade langsam antwortet und ob eine Sperre läuft.";
  }

  const pr = stand.preise || { karten: 0 };
  $("markt-preise").textContent = pr.karten < 3
    ? "noch zu wenige Karten gemessen"
    : pr.rauf + " % steigen · " + pr.runter + " % fallen";
  $("markt-preise").title = pr.karten + " Karten mit mindestens zwei Messungen. Gezählt wird ab 2 % Unterschied.";

  const g = (letzterStatus && letzterStatus.gedaechtnis) || null;
  if ($("markt-gedaechtnis")) {
    $("markt-gedaechtnis").textContent = g ? fmt(g.karten) + " Karten" : "–";
    $("markt-gedaechtnis").title = "Jede Suche bringt bis zu 21 Angebote mit. Der Bot hebt sie auf: billigster je gesehener Preis, Mittelwert und wie oft eine Karte auftaucht. Das kostet keine einzige zusätzliche Anfrage.";
  }
  $("markt-naechstes").textContent = stand.naechstes || "noch unbekannt";
  // Ehrlicher Hinweis (27.09.2026): Wir kennen nur Zeiten, in denen schon
  // gesucht wurde. Eine gute Zeit, die der Nutzer noch nie ausprobiert hat,
  // kann hier nie auftauchen. Wer immer nur abends botet, bekommt fuer immer
  // den Abend genannt. FST darf mehr sagen, weil sein Server viele Nutzer sieht.
  $("markt-naechstes").title = "Aus deinen eigenen Läufen: Wochentag und Stunde mit den meisten Treffern. Achtung: Verglichen werden nur Zeiten, in denen du schon gesucht hast - eine Zeit, die du noch nie ausprobiert hast, kann hier nie stehen.";

  $("markt-detail-kopf").textContent = stand.wert == null
    ? stand.grund
    : "So setzt sich die Zahl zusammen:";
  const liste = $("markt-teile");
  liste.textContent = "";
  for (const teil of stand.teile) {
    const li = document.createElement("li");
    li.textContent = teil.name + ": " + teil.text;
    liste.append(li);
  }
  // 27.09.2026: Dazu gehoert der ehrliche Satz, woher die Liste kommt.
  $("markt-stunden").textContent = (stand.stunden.length
    ? "Deine besten Stunden bisher: " + stand.stunden.map((s) => s.stunde + " Uhr (" + s.quote.toFixed(1).replace(".", ",") + " Treffer je 100 Suchen)").join(", ") + "."
    : "Deine besten Stunden zeigt der Bot, sobald genug Läufe gespeichert sind.")
    + " Verglichen werden nur Stunden, in denen du schon gesucht hast.";
  $("markt-detail").hidden = false;
  $("kachel-markt").setAttribute("aria-expanded", "true");
}

function marktDetailSchliessen() {
  // Auch mit Esc oder Klick daneben - siehe Horcher unten.
  $("markt-detail").hidden = true;
  $("kachel-markt").setAttribute("aria-expanded", "false");
}

// Kurze Zahl fuer die Kachel: ab einer Million abgekuerzt.
function kachelZahl(n) {
  const zahl = Number(n) || 0;
  if (zahl < 1000000) return fmt(zahl);
  const mio = zahl / 1000000;
  return (mio < 10 ? mio.toFixed(1).replace(".", ",") : String(Math.round(mio))) + " Mio.";
}

// Keine Kachel darf render() abbrechen - deshalb jede fuer sich in try/catch.
function renderKopfKacheln(st) {
  try {
    $("kachel-sammlungen-zahl").textContent = String(Object.keys(collections).length);
    $("kachel-sammlungen").disabled = Boolean(st && st.running);
    $("kachel-sammlungen").title = st && st.running ? "Während eines Laufs nicht möglich." : "Gespeicherte Ziellisten öffnen";
  } catch (e) {}
  try {
    // Suchbudget des Tages - die wichtigste Zahl fuer den Kontoschutz.
    const usage = (st && st.usage) || {};
    const heute = Number(usage.searchesDay) || 0;
    const grenze = Number(usage.searchLimitDay) || 350;
    const stunde = Number(usage.searchesHour) || 0;
    const stundeGrenze = Number(usage.searchLimitHour) || 150;
    if (st && usage.keineGrenzen) {
      // FST-Modus: keine Grenze, also auch keine Warnfarbe und kein "x/y".
      $("kachel-heute-zahl").textContent = String(heute) + (usage.searchesDayGekappt ? "+" : "");
      $("kachel-heute-zahl").style.color = "";
      $("kachel-heute").title = "Heute " + heute + (usage.searchesDayGekappt ? "+" : "") + " Suchen, in dieser Stunde " + stunde + ". Ohne eigene Grenzen.";
    } else {
    $("kachel-heute-zahl").textContent = st ? heute + "/" + grenze : "–";
    $("kachel-heute-zahl").style.color = heute >= grenze ? "var(--red)" : heute >= grenze * 0.8 ? "var(--amber)" : "";
    $("kachel-heute").title = st
      ? "Heute " + heute + " von " + grenze + " Suchen, in dieser Stunde " + stunde + " von " + stundeGrenze + ". Die Grenzen schützen dein Konto."
      : "Suchen heute und in dieser Stunde. Die Grenzen schützen dein Konto.";
    }
  } catch (e) {}
  try {
    const stand = marktTachoStand(st);
    const bogen = $("tacho-bogen");
    const anteil = stand.wert == null ? 0 : Math.max(0, Math.min(100, stand.wert));
    bogen.setAttribute("stroke-dasharray", anteil + " " + (100 - anteil));
    // Der Bogen traegt FSTs Verlauf Rot-Gelb-Gruen (popup.html) und ist bis
    // zum Wert gefuellt; der weisse Punkt sitzt am Ende. Ohne Zahl bleibt er
    // leer. Die Lage des Punktes rechnet wie FSTs Gauge (Mittelpunkt 35/36,
    // Radius 28, Winkel von links nach rechts).
    bogen.style.stroke = "";
    // Bei null zeichnet die runde Linienkappe sonst einen roten Punkt.
    bogen.style.strokeOpacity = anteil > 0 ? "1" : "0";
    const knopf = $("tacho-knopf");
    if (knopf) {
      const winkel = Math.PI * (1 - anteil / 100);
      knopf.setAttribute("cx", String(Math.round((35 + 28 * Math.cos(winkel)) * 100) / 100));
      knopf.setAttribute("cy", String(Math.round((36 - 28 * Math.sin(winkel)) * 100) / 100));
      knopf.setAttribute("visibility", stand.wert == null ? "hidden" : "visible");
    }
    $("kachel-markt-zahl").textContent = stand.wert == null ? "–" : String(stand.wert);
    $("kachel-markt").title = stand.wert == null ? stand.grund : "Markt: " + stand.wert + " von 100 (" + stand.wort + "). Klick zeigt die Einzelheiten.";
    if (!$("markt-detail").hidden) marktDetailOeffnen();
  } catch (e) {}
}

function render(res) {
  res = res || { ok: false, error: "Keine Antwort von der Web App." };
  if (res && res.status) lastRes = res;
  const st = res.status;
  letzterStatus = st || null;
  // 27.09.2026: Verlaengerungen des Motors mitschreiben, bevor gezeichnet
  // wird - sonst haelt die Filterliste den Filter fuer abgelaufen.
  verlaengerungMerken(st);
  fstFelderAnpassen();
  const sperre = startSperrGrund(st);
  renderLiveHud(st);
  const status = $("status");
  const session = $("session");
  renderPlayerHint();
  renderCheck(st);
  renderAddButton();
  renderTargets();
  renderSnipeNotiz(); // Meldung nach dem Laden eines Filters laeuft hier ab
  renderVerkaufStatus(st);
  renderKopfKacheln(st);
  renderSuchseite(st);
  renderVerkaufsWache(st);
  // Budget auf Auto heisst: das ganze Guthaben. Der Kontostand kommt mit jeder
  // Antwort des Bots frisch herein und wird hier ins Feld nachgezogen
  // (27.09.2026). Das kostet keine EA-Anfrage, die Zahl liegt schon vor.
  if (budgetAutoAnwenden()) saveSettings();
  renderBudgetMode();
  // Alle Start-Knoepfe mit demselben Stand - auch in offenen Dialogen, sonst
  // bleibt dort "KEINE WARNUNGEN" stehen, waehrend die Sperre schon greift.
  renderAutoStartKnopf();
  renderAutoEinstellungen();
  renderRotationStreifen();
  renderStepNext();
  if (!$("start-modal-wrap").hidden) startSafetyInfo();
  if (modalFilterRow) renderFmStart();

  const marketScan = (st && st.marketScan) || {};
  $("scan-market").disabled = Boolean(sperre);
  $("scan-market").textContent = marketScan.running ? "EA-Markt wird gescannt …" : "EA-Markt live scannen";
  // Platzhalter-Zeilen, solange der Scan laeuft; sie verschwinden, sobald echte Zeilen da sind (CSS).
  const platzhalter = $("filter-skeleton");
  if (platzhalter) platzhalter.hidden = !marketScan.running;
  const scanSperre = marketScan.running ? "" : sperre; // der eigene Scan zeigt seinen Fortschritt
  $("market-scan-msg").className = "hint" + (scanSperre ? " warn" : marketScan.error ? " err" : "");
  $("market-scan-msg").textContent = marketScan.running ? "" : (scanSperre || marketScan.error || marketScan.message || "");
  // Die Obergrenze der Scan-Anfragen meldet der Bot (scan.maxSearches), sie
  // steht nicht mehr fest hier drin. 12 nur als Rueckfall fuer alte Bots.
  const scanN = marketScan.searches || 0;
  const scanMax = Number(marketScan.maxSearches) > 0 ? Number(marketScan.maxSearches) : 12;
  renderLoader("scan-loader", marketScan.running ? {
    title: "EA-Markt wird gescannt",
    detail: "Anfrage " + Math.max(1, scanN) + " von höchstens " + scanMax + " · der Scan kauft nichts",
    done: scanN,
    total: scanMax,
    // Eine zweite Marktaufnahme gibt es nicht mehr. Nach der Aufnahme folgen
    // Zielsuchen und Abwaertstasten. Die Phase meldet der Bot; nur alte Bots
    // ohne phase bekommen die Schaetzung ueber die Anfragen-Nummer.
    steps: ["Markt aufnehmen", "Preise abwärts prüfen"],
    step: marketScan.phase === "preise" ? 1 : marketScan.phase === "aufnahme" ? 0 : scanN <= 3 ? 0 : 1
  } : null);
  const usage = (st && st.usage) || {};
  // searchLimitDay ist das WIRKSAME Limit vom Bot - mit Ausnahme hoeher.
  // Dann steht die Zeile gelb da, damit niemand sie fuer normal haelt.
  const ausnahme = aktiveAusnahme(st);
  $("usage-hint").textContent = st && usage.keineGrenzen
    ? "Heute: " + (usage.searchesDay || 0) + (usage.searchesDayGekappt ? "+" : "") + " Suchen · diese Stunde: " + (usage.searchesHour || 0) + " · " +
      (usage.buysDay || 0) + " Kaufversuche · ohne Grenze"
    : st
    ? "Heute: " + (usage.searchesDay || 0) + "/" + (usage.searchLimitDay || 350) + " Suchen · diese Stunde: " +
      (usage.searchesHour || 0) + "/" + (usage.searchLimitHour || 150) + " · " +
      (usage.buysDay || 0) + "/" + (usage.buyLimitDay || 100) + " Kaufversuche" +
      (ausnahme ? " · Ausnahme aktiv bis " + hhmm(ausnahme.bis) + " (+" + ausnahme.extra + " Suchen)" : "")
    : "";
  $("usage-hint").className = ausnahme ? "hint warn" : "hint";
  renderAusnahme(st);

  if (!st) {
    status.textContent = res.error;
    status.dataset.level = "error";
    session.className = "pill";
    session.textContent = "Nicht verbunden";
    session.title = "";
    $("session-hint").textContent = "";
    $("run-hint").textContent = "";
    $("start").disabled = true;
    $("stop").disabled = true;
    // Ohne Verbindung gibt es keinen Fortschritt mehr zu zeigen. Sonst
    // bliebe "Stopp (2/10)" von einem Lauf stehen, der laengst vorbei ist.
    $("stop").textContent = "Stopp";
    $("scan-market").disabled = true;
    $("scan-market").textContent = "Erst EA-Web-App verbinden";
    $("market-scan-msg").className = "hint err";
    $("market-scan-msg").textContent = "Öffne die EA-Web-App, lade sie mit F5 neu und öffne einmal den Transfermarkt.";
    $("usage-hint").textContent = "";
    $("filter-empty").textContent = "Noch keine Live-Marktdaten, weil der Bot nicht mit der EA-Web-App verbunden ist.";
    renderAssistentUndChancen();
    return;
  }

  const responseError = res && res.ok === false && res.error ? res.error : "";
  status.textContent = notice || responseError || startPruefText || st.message;
  status.dataset.level = notice || responseError ? "error" : startPruefText ? "run" : st.level;
  $("run-hint").textContent = st.running && st.hint ? st.hint : "";

  // Zeigt schwarz auf weiss, was EA auf die letzte Suche geantwortet hat.
  // "über Zielpreis" muss 0 sein - sonst filtert EA nicht nach deinem Preis.
  // Gesundheit der Verbindung: Antwortzeit und Drosselungsverdacht.
  const h = st.health;
  if (h && h.samples >= 3) {
    const sek = (h.medianMs / 1000).toFixed(1);
    $("health").textContent = "EA-Antwortzeit: " + sek + " Sek. im Mittel" + (h.slow ? " – ungewöhnlich langsam" : "");
    $("health").className = h.slow ? "hint err" : "hint";
  } else {
    $("health").textContent = "";
  }

  const ls = st.lastSearch;
  $("last-search").textContent = ls
    ? "Letzte Suche (" + (ls.basis || "Sofortkauf") + "): " + ls.count + " Angebote, davon " +
      ls.under + " bis " + fmt(ls.maxPrice) + " Coins und " + ls.over + " darüber" +
      (ls.count ? " · günstigstes " + fmt(ls.min) + ", teuerstes " + fmt(ls.max) : "") +
      (ls.rating ? " · Rating " + ls.rating + ": " + ls.ratingOff + " Treffer mit anderem Rating" : "")
    : "";

  session.className = st.session ? "pill ok" : "pill warn";
  session.textContent = st.session ? "Verbunden" : "Nicht verbunden";
  session.title = st.session ? "Mit EA verbunden: " + (st.apiHost || "EA") : "";
  $("session-hint").textContent = st.session ? "" : "Noch nicht verbunden. Öffne in der Web App einmal den Transfermarkt.";
  $("nutzung-hint").textContent = st.nutzungsdaten === true ? NUTZUNG_WARNUNG : "";
  $("fremd-hint").textContent = st.fremderBot ? fremdWarnung(st.fremderBot) : "";

  // Abkuehlzeit nach Captcha oder Sperre: Start bleibt zu, mit Begruendung.
  const cooldown = st.cooldown && st.cooldown.leftMin > 0 ? st.cooldown : null;
  $("start").disabled = Boolean(sperre);
  if (cooldown) {
    $("session-hint").textContent = "Start gesperrt für noch " + cooldown.leftMin + " Min. " + (cooldown.reason || "") +
      " Sofort weiterzumachen ist der häufigste Fehler nach einer Warnung.";
  }
  $("stop").disabled = !st.running;
  $("stop").hidden = !st.running;
  // "Nächster Filter" nur, solange eine Rotation laeuft UND gerade ein Filter
  // sucht (25.09.2026). Ohne laufenden Filter gaebe es nichts zu
  // ueberspringen, der Knopf wuerde nur Fehlermeldungen erzeugen.
  const sprungMoeglich = Boolean(st.running && st.rotation && st.rotation.aktiv);
  if ($("naechsterFilter")) {
    $("naechsterFilter").hidden = !sprungMoeglich;
    $("naechsterFilter").disabled = !sprungMoeglich;
  }

  const s = st.stats || {};
  // Wie weit ist der Lauf? (25.09.2026) Der Knopf hiess immer nur "Stopp",
  // und die Kachel zeigte "gekauft: 2" ohne das Ziel dahinter. Wer nicht mehr
  // weiss, was er eingestellt hat, stoppt zu frueh oder laesst laufen, obwohl
  // der Lauf gleich von selbst endet. Am Knopf zaehlen laufende Gebote mit,
  // denn genau so rechnet der Bot seine Grenze (bought + bids >= maxBuys).
  const zielKaeufe = st.grenzen && Number(st.grenzen.maxBuys) > 0 ? Number(st.grenzen.maxBuys) : 0;
  const angefasst = (s.bought || 0) + (s.bids || 0);
  $("stop").textContent = st.running && zielKaeufe ? "Stopp (" + angefasst + "/" + zielKaeufe + ")" : "Stopp";
  $("stop").title = zielKaeufe ? "Der Lauf endet bei " + zielKaeufe + " Käufen. Laufende Gebote zählen mit." : "";
  $("s-bought").textContent = s.bought || 0;
  $("s-spent").textContent = fmt(s.spent);
  renderGewinn(st);
  $("s-credits").textContent = st.credits == null ? "–" : kachelZahl(st.credits);
  // Der Stand kommt aus EAs Antworten und friert ein, sobald der Bot steht.
  // Ohne Hinweis haelt man die alte Zahl fuer den aktuellen Kontostand.
  // Vor der ersten EA-Antwort liest content.js ihn aus der Kopfzeile der
  // Web App ab (creditsQuelle "seite") - das sagt der Tooltip dazu.
  const credAlter = st.creditsAt ? Date.now() - st.creditsAt : 0;
  const credAlt = st.credits != null && credAlter > 2 * 60000;
  const credSeite = st.creditsQuelle === "seite";
  // In der Kachel ist kein Platz fuer "Coins · vor 3 Min." - dann steht dort
  // nur das Alter, und der Tooltip erklaert es.
  $("s-credits-label").textContent = credAlt ? "vor " + age(st.creditsAt).replace(/^vor /, "") : "Coins";
  $("s-credits").classList.toggle("alt", credAlt);
  $("s-credits-box").title = credSeite
    ? "Dein Kontostand, von der EA-Seite abgelesen" + (credAlt ? " (Stand von " + age(st.creditsAt) + ")" : "") +
      ". Sobald der Bot sucht oder kauft, kommt er direkt von EA."
    : credAlt
      ? "Stand von " + age(st.creditsAt) + ". Er wird erst wieder aktualisiert, wenn der Bot sucht oder kauft."
      : "Dein Kontostand laut EA, aktualisiert nach jedem Kauf";
  $("s-scans").textContent = s.scans || 0;
  $("s-bids").textContent = s.bids || 0;
  $("s-missed").textContent = s.missed || 0;
  $("s-errors").textContent = s.errors || 0;

  // Offene Gebote: gebundene Coins sind reserviert, nicht ausgegeben. Ohne diese
  // Anzeige wirkt ein Lauf, der auf Gebote wartet, wie ein zu kleines Budget.
  const open = st.openBids || { count: 0, coins: 0 };
  // Gebote ohne erkennbaren Ausgang bleiben gebunden, bis EA sie klaert.
  const unklar = st.unclearBids || { count: 0, coins: 0 };
  $("s-bound").textContent = fmt((open.coins || 0) + (unklar.coins || 0));
  const boundTitle = [];
  if (open.count) {
    boundTitle.push(open.count + (open.count === 1 ? " offenes Gebot" : " offene Gebote") + " · " + fmt(open.coins) +
      " Coins reserviert. Sie werden wieder frei, sobald das Gebot verloren geht.");
  }
  if (unklar.count) {
    boundTitle.push(unklar.count + " Gebot(e) ohne erkennbaren Ausgang · " + fmt(unklar.coins) +
      " Coins zählen vorsichtshalber als ausgegeben. Bitte in der Web App prüfen.");
  }
  $("s-bound-box").title = boundTitle.length
    ? boundTitle.join(" ")
    : "Keine offenen Gebote. Hier stehen Coins, die ein laufendes Gebot bindet.";

  const outcome = [];
  if (s.bidsWon) outcome.push(s.bidsWon + "× gewonnen");
  if (s.bidsOutbid) outcome.push(s.bidsOutbid + "× überboten und nachgeboten");
  if (s.bidsLost) outcome.push(s.bidsLost + "× verloren");
  if (s.bidsUnconfirmed) outcome.push(s.bidsUnconfirmed + "× ohne erkennbaren Ausgang");
  $("s-bids-box").title = outcome.length
    ? "Abgegebene Gebote: " + outcome.join(", ") + "."
    : "Abgegebene Gebote; ein Gebot ist noch kein gewonnener Spieler.";
  renderAssistentUndChancen();
}

// 02.10.2026: Assistent und Chancen haengen am Status (laeuft, Stapel,
// Sperre). Beide zeichnen nur neu, wenn sich etwas geaendert hat.
function renderAssistentUndChancen() {
  renderAssistent();
  renderChancen();
  if ($("chancen-scan")) {
    const scan = (letzterStatus && letzterStatus.marketScan) || {};
    $("chancen-scan").disabled = !letzterStatus || Boolean(scan.running) || $("scan-market").disabled;
    $("chancen-scan").textContent = scan.running ? "Markt wird gescannt …" : "Markt scannen";
  }
}

async function poll() {
  render(await send("status"));
}

// ---------------------------------------------------------------------------
// Preisprüfung vor dem Start
// Ein gespeicherter Zielpreis altert. Faellt der Markt, kauft der Bot sonst
// stur zu einem Preis, der laengst keinen Gewinn mehr laesst. Deshalb wird vor
// dem Start nachgeprueft - aber nur, wo der Preis wirklich alt ist.
// ---------------------------------------------------------------------------

const PRICE_FRESH_MS = 15 * 60 * 1000;
// So frisch muss der Preis sein, damit "Gleich verkaufen" wirklich einstellt.
const LIST_PREIS_FRISCH_MS = 60 * 60 * 1000;
const MAX_AUTO_CHECKS = 3; // mehr wuerde zu viele EA-Anfragen kosten
// Wie viele alte Preise der Start selbst nachmisst. Streng: 3. Im FST-Modus
// gibt es keine Grenze ausser den 10 Spielern der Liste.
function maxAutoChecks() {
  return fstAn() ? MAX_TARGETS : MAX_AUTO_CHECKS;
}

// Wann wurde der Preis dieses Ziels gemessen? 0 = unbekannt. Ohne Zeitpunkt
// stellt der Bot nach dem Kauf nichts ein (ein alter Preis waere ein Verlust).
function preisStandFuer(target) {
  if (target && target.source === "live" && Number(target.salePrice) > 0) {
    const ende = Number(target.expiresAt) || 0;
    return ende > 0 ? ende - 15 * 60000 : Date.now();
  }
  // Chance (02.10.2026): Zeitpunkt der letzten Messung im Preisverlauf.
  if (target && target.source === "chance" && Number(target.salePrice) > 0) return Number(target.preisAt) || 0;
  const entries = history[targetKey(target)];
  const entry = Array.isArray(entries) ? entries[entries.length - 1] : null;
  return entry && entry.t ? Number(entry.t) : 0;
}

// Fuer welche Chemie der gespeicherte Preis gemessen wurde (27.09.2026).
//
// Nur wenn die Messung wirklich nach Chemie getrennt hat (chemGefiltert), darf
// der Motor beim Kauf darauf bestehen. War die Messung gemischt, ist der Preis
// ein Mischpreis, und eine Chemie-Sperre waere falsch: Sie wuerde Kaeufe
// verhindern, fuer die der Preis stimmt. null heisst darum: keine Sperre.
function chemieStandFuer(target) {
  const entries = history[targetKey(target)];
  const entry = Array.isArray(entries) ? entries[entries.length - 1] : null;
  if (!entry || entry.chemGefiltert !== true) return null;
  return typeof entry.chem === "number" && Number.isFinite(entry.chem) ? Math.floor(entry.chem) : null;
}

function priceAgeFor(target) {
  const entries = history[targetKey(target)];
  const entry = Array.isArray(entries) ? entries[entries.length - 1] : null;
  return entry && entry.t ? Date.now() - entry.t : Infinity;
}

// Gewinn-Schutz ohne EA-Anfrage: rechnet mit dem letzten gespeicherten Preis.
// keinGewinn = der Zielpreis frisst den ganzen Verkaufserloes nach 5 % Gebuehr.
// ueberVorschlag = teurer als der eigene Vorschlag, also weniger Gewinn.
// Live-Filter bringen ihren Verkaufspreis aus dem Filter-Dialog mit; ihr
// Zielpreis ist dort schon daraus gerechnet, deshalb kein Vorschlags-Vergleich.
// Ohne Zielpreis oder ohne Preis-Eintrag: null (nichts zu pruefen).
function gewinnStand(target) {
  const maxPrice = Number(target && target.maxPrice) || 0;
  if (!(maxPrice > 0)) return null;
  // Chancen (02.10.2026) wie Live-Filter: Ihr Verkaufspreis ist das Ziel aus
  // dem eigenen Preisverlauf, nicht der gefallene Marktpreis von jetzt.
  if ((target.source === "live" || target.source === "chance") && target.salePrice > 0) {
    const saleNet = Math.floor(target.salePrice * (1 - SALE_FEE));
    return { alt: false, saleNet, vorschlag: 0, keinGewinn: maxPrice >= saleNet, ueberVorschlag: false };
  }
  const entries = history[targetKey(target)];
  const entry = Array.isArray(entries) ? entries[entries.length - 1] : null;
  if (!entry || !(entry.market > 0)) return null;
  const vorschlag = suggestionFor(entry);
  if (!(vorschlag.saleNet > 0)) return null;
  return {
    alt: !(Date.now() - entry.t <= PRICE_FRESH_MS),
    saleNet: vorschlag.saleNet,
    vorschlag: vorschlag.value,
    keinGewinn: maxPrice >= vorschlag.saleNet,
    ueberVorschlag: maxPrice > vorschlag.value
  };
}

// Satz fuer die Start-Sperre, wenn ein Ziel keinen Gewinn laesst. Sonst null.
function gewinnSperre(list) {
  // FST-Modus: FST prueft vor dem Kauf nichts. Der Gewinn-Schutz sperrt den
  // Start nur noch, wenn der Haken "Spieler stoppen, wenn der Markt keinen
  // Gewinn mehr hergibt" an ist; sonst steht die Warnung im Start-Dialog.
  if (fstAn() && !($("gewinnBremse") && $("gewinnBremse").checked)) return null;
  for (const target of list) {
    // Karten am EA-Mindestpreis gar nicht erst starten (27.09.2026). EA
    // verbietet, unter eaMin zu verkaufen. Liegt der Marktpreis schon dort,
    // kann niemand guenstiger kaufen und teurer verkaufen - jede Suche dafuer
    // ist verschenkt. FUT Simple Trader bricht in diesem Fall den Preis-Check
    // ab (scripts.js Z. 28104-28110); bisher hat bei uns erst der Gewinn-Check
    // weiter unten gebremst, und der greift nur, wenn schon ein Zielpreis
    // steht.
    const eaMinEintraege = history[targetKey(target)];
    const eaMinLetzter = Array.isArray(eaMinEintraege) && eaMinEintraege.length ? eaMinEintraege[eaMinEintraege.length - 1] : null;
    if (eaMinLetzter && eaMinLetzter.amEaMinimum) {
      const wer = target.playerName + (target.rating ? " (" + target.rating + ")" : "");
      return "Bei " + wer + " liegt der Marktpreis schon auf EAs Mindestpreis (" + fmt(eaMinLetzter.eaMin) +
        "). Günstiger darf dort niemand verkaufen, also ist kein Gewinn möglich. Nimm diesen Spieler aus der Liste.";
    }
    const stand = gewinnStand(target);
    if (!stand || !stand.keinGewinn) continue;
    const label = target.playerName + (target.rating ? " (" + target.rating + ")" : "");
    return "Kein Gewinn bei " + label + ": Zielpreis " + fmt(target.maxPrice) + ", nach 5 % EA-Gebühr bringt der Verkauf nur " +
      fmt(stand.saleNet) + ". Senke den Zielpreis" + (stand.alt ? " oder prüfe den Preis neu." : ".");
  }
  return null;
}

// Gibt eine Meldung zurueck, wenn NICHT gestartet werden soll. Sonst null.
// Frische Preise kosten keine EA-Anfrage, werden aber trotzdem auf Gewinn
// geprueft (gewinnSperre ganz am Ende).
// Ziele mit altem Preis. Live-Filter wurden beim Laden bereits frisch geprueft.
// Chancen (02.10.2026) auch nicht: Der normale Preis-Check rechnet mit dem
// Verkauf zum Marktpreis von jetzt und wuerde jeden Dip-Kauf als "zu teuer"
// ablehnen. Eine Chance laeuft stattdessen nach 30 Minuten ab (liveAlt).
function altePreise(list) {
  return list.filter((t) => t.source !== "live" && t.source !== "chance" && priceAgeFor(t) > PRICE_FRESH_MS);
}

// Satz, wenn der Start zu viele alte Preise nachpruefen muesste. Sonst "".
function zuVieleAltePreise(list) {
  const anzahl = altePreise(list).length;
  if (anzahl <= maxAutoChecks()) return "";
  return "Für " + anzahl + " Spieler ist der Preis älter als 15 Minuten. Der Start prüft höchstens " + maxAutoChecks() +
    " selbst nach – mehr würde zu viele EA-Anfragen kosten. Bitte einzeln prüfen: Knopf „Preis prüfen“ in der Zielliste.";
}

async function checkPricesBeforeStart(list) {
  const veraltet = altePreise(list);
  if (!veraltet.length) return gewinnSperre(list);
  const zuViele = zuVieleAltePreise(list);
  if (zuViele) return zuViele;
  try {
    return await altePreisePruefen(veraltet, list);
  } finally {
    startPruefText = null;
  }
}

async function altePreisePruefen(veraltet, list) {
  for (const target of veraltet) {
    const label = target.playerName + (target.rating ? " (" + target.rating + ")" : "");
    startPruefText = "Preis wird geprüft: " + label + " …";
    render(lastRes || { ok: true });
    let entry;
    try {
      entry = await awaitFreshPrice(
        { id: target.playerId, name: target.playerName },
        target.rating,
        targetKey(target),
        (searches) => {
          startPruefText = "Preis wird geprüft: " + label + " · " + searches + " Marktsuchen";
          render(lastRes || { ok: true });
        },
        // Der Schluessel oben kommt aus targetKey und traegt die Kartenart -
        // dann muss die Pruefung sie auch messen, sonst wird das Ergebnis
        // unter einem anderen Schluessel abgelegt und nie gefunden.
        null,
        target.rarity,
        null
      );
    } catch (error) {
      return "Preisprüfung für " + label + " fehlgeschlagen: " + error.message;
    }
    if (!entry) return "Preisprüfung für " + label + " wurde abgebrochen.";

    await loadData(); // frischen Verlauf uebernehmen
    const vorschlag = suggestionFor(entry);
    if (!(vorschlag.value > 0)) {
      return "Für " + label + " ergibt sich gerade kein sinnvoller Zielpreis. Bitte Preis prüfen.";
    }
    // Bewusst nichts stillschweigend aendern: Der Zielpreis gehoert dem Nutzer.
    if (target.maxPrice > vorschlag.value) {
      // Liegt es am Alter der Angebote, sagen wir das statt "Markt gefallen" (F1).
      if (vorschlag.verkauf && vorschlag.verkauf.quelle === "alter") {
        return "Für " + label + " sind jetzt höchstens " + fmt(vorschlag.value) + " Coins sinnvoll. " +
          verkaufsPreisGrund(vorschlag.verkauf) + " Dein Zielpreis steht auf " + fmt(target.maxPrice) + ". Bitte anpassen.";
      }
      return "Der Markt ist gefallen: Für " + label + " sind jetzt höchstens " + fmt(vorschlag.value) +
        " Coins sinnvoll, dein Zielpreis steht auf " + fmt(target.maxPrice) + ". Bitte anpassen.";
    }
  }
  return gewinnSperre(list);
}

// ---------------------------------------------------------------------------
// Bedienung
// ---------------------------------------------------------------------------

$("playerName").addEventListener("input", () => {
  if (selected && $("playerName").value !== selected.name) {
    letzteWahlKey = currentKey(); // fuer den Hinweis in choose(): wem gehoert der Preis oben?
    selected = null;
    saveSettings();
  }
  renderSuggestions();
  renderPlayerHint();
  renderPricePanel();
  renderAddButton();
  renderTargets();
  if (lastRes) renderCheck(lastRes.status);
});

$("playerName").addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  const first = $("suggestions").querySelector(".suggestion");
  if (first) {
    event.preventDefault();
    first.click();
  }
});

$("rating").addEventListener("input", () => {
  renderPricePanel();
  renderPlayerCard();
  renderTargets(); // anderes Rating = andere Karte, Listen-Warnung neu pruefen
});

// --- Kartenart (24.09.2026) --------------------------------------------
//
// Eine Sonderkarte (TOTW, Ikone, Hero, POTM ...) ist derselbe Spieler mit
// einer anderen Kartenart. EA nennt sie "rarityIds" und gibt ihr nur eine
// Nummer; die lesbaren Namen stehen in dieser EA-Fassung verschluesselt im
// Code. Darum baut der Bot KEINE eigene Liste - die waere ohnehin jede
// Woche veraltet. Stattdessen stellst du die Art in EAs eigener Suchmaske
// ein, und der Bot liest sie dort ab.
$("rarity").addEventListener("input", () => {
  renderPricePanel();
  renderPlayerCard();
  renderRarity(letzterStatus);
  renderTargets(); // andere Kartenart = andere Karte
});

$("rarity-wahl").addEventListener("change", () => {
  $("rarity").value = $("rarity-wahl").value;
  $("rarity").dispatchEvent(new Event("input"));
  saveSettings();
});

$("rarity-uebernehmen").addEventListener("click", () => {
  const s = letzterStatus && letzterStatus.suchseite;
  // Mehrere Kartenarten (28.09.2026): Auch eine Liste ("12,70") aus EAs
  // Maske laesst sich uebernehmen. Number("12,70") waere NaN, darum
  // rarityListeWert statt Number.
  const liste = rarityListeWert(s ? s.rarity : "");
  if (!liste.length) return;
  $("rarity").value = liste.join(",");
  $("rarity").dispatchEvent(new Event("input"));
  saveSettings();
});

// Zeigt, was gerade in EAs Suchmaske steht, und was der Bot benutzt.
// Die Auswahlliste der Kartenarten kommt aus EAs eigener Suchmaske - dort
// stehen Nummer UND lesbarer Name. Im EA-Code selbst sind die Namen
// verschluesselt, eine eigene Liste waere ausserdem jede Woche veraltet.
// Abgeschaut bei FUT Simple Trader (scripts.js Z. 47-53, 1687-1695), aber
// nur lesend: FST schreibt in EAs Maske zurueck, wir nicht.
let rarityListeGezeichnet = "";

function rarityListe(st) {
  const l = st && st.filterListen && st.filterListen.rarity;
  return Array.isArray(l) ? l : [];
}

function renderRarityWahl(st) {
  const feld = $("rarity-wahl");
  const zeile = $("rarity-wahl-zeile");
  if (!feld || !zeile) return;
  const liste = rarityListe(st);
  zeile.hidden = !liste.length;
  if (!liste.length) return;
  // Nur neu aufbauen, wenn sich die Liste wirklich geaendert hat - sonst
  // springt die Auswahl bei jedem Takt zurueck.
  const signatur = liste.map((e) => e.id + ":" + e.label).join("|");
  if (signatur !== rarityListeGezeichnet) {
    rarityListeGezeichnet = signatur;
    const alle = document.createElement("option");
    alle.value = "";
    alle.textContent = "Alle Kartenarten";
    feld.replaceChildren(alle, ...liste.map((e) => {
      const o = document.createElement("option");
      o.value = String(e.id);
      o.textContent = e.label + " (" + e.id + ")";
      return o;
    }));
  }
  const wert = rarityValue();
  const gewaehlt = wert >= 0 ? String(wert) : "";
  // Eine Nummer, die EA gerade nicht anbietet, darf nicht still verschwinden.
  if (gewaehlt !== "" && !liste.some((e) => String(e.id) === gewaehlt)) {
    const fremd = document.createElement("option");
    fremd.value = gewaehlt;
    fremd.textContent = "Kartenart " + gewaehlt;
    feld.append(fremd);
    rarityListeGezeichnet = "";
  }
  if (feld.value !== gewaehlt) feld.value = gewaehlt;
}

// Der lesbare Name zu einer Nummer, wenn EA ihn gerade anbietet.
function rarityName(st, nummer) {
  const treffer = rarityListe(st).find((e) => Number(e.id) === Number(nummer));
  return treffer ? treffer.label : "";
}

function renderRarity(st) {
  const zeile = $("rarity-zeile");
  const knopf = $("rarity-uebernehmen");
  if (!zeile || !knopf) return;
  const s = st && st.suchseite;
  // Mehrere Kartenarten (28.09.2026): Maske und Feld sind jetzt LISTEN.
  // Number("12,70") waere NaN - darum ueberall rarityListeWert. Der Knopf
  // erscheint, sobald die Maske etwas anderes traegt als das Feld.
  const ausMaske = rarityListeWert(s ? s.rarity : "");
  const gewaehlt = rarityListeWert($("rarity") ? $("rarity").value : "");
  renderRarityWahl(st);
  // Zuerst der Name aus EAs Auswahlliste, sonst der aus dem gezeichneten
  // Feld. Findet sich keiner, steht nur die Nummer da - die stimmt immer.
  const nameVon = (liste) => liste
    .map((n) => rarityName(st, n) || (liste.length === 1 && s && s.rarityName) || "Kartenart " + n)
    .join(" + ");
  knopf.hidden = !ausMaske.length || ausMaske.join(",") === gewaehlt.join(",");
  if (gewaehlt.length) {
    zeile.className = "hint ok";
    zeile.textContent = "Nur " + nameVon(gewaehlt) +
      (gewaehlt.length > 1 ? " – eine Suche für alle " + gewaehlt.length + " Arten, ein Zielpreis für alle" : "") +
      ". Alle anderen Versionen dieses Spielers werden übersprungen.";
    return;
  }
  if (ausMaske.length) {
    zeile.className = "hint";
    zeile.textContent = "In deiner EA-Suchmaske steht " + nameVon(ausMaske) +
      ". Tipp unten drauf, wenn der Bot nur diese Karten kaufen soll.";
    return;
  }
  zeile.className = "hint";
  zeile.textContent = "Alle Kartenarten. Für eine Sonderkarte: In der EA-Suchmaske unter „Rarity“ die Art wählen, dann erscheint hier ein Knopf.";
}

$("maxPrice").addEventListener("input", () => {
  feldPreisAlt = null; // selbst eingetippt: der Preis gehoert jetzt zu diesem Spieler
  renderTargets(); // Feld und Liste neu vergleichen
});

// "?" klappt die Erklaerung zu einem Schritt auf und zu.
for (const button of WURZEL.querySelectorAll(".help-toggle")) {
  button.addEventListener("click", () => {
    const text = $(button.getAttribute("aria-controls"));
    const open = text.hidden;
    text.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
  });
}
// Auch der Auto-Kasten rechnet mit Abschlag und Mindestgewinn. Frueher blieb
// er stehen: Er zeigte "bis 8.000", der Lauf rechnete beim Start neu und
// kaufte bis 9.500 - mehr, als auf dem Bildschirm stand.
$("discount").addEventListener("input", () => {
  renderPricePanel();
  renderLiveFilters();
  updateAutoCalculation();
});
// Verschieben um Preisstufen rechnet nur neu - keine Anfrage an EA
// (27.09.2026). Gespeichert wird das Feld ueber die NUMBER_FIELDS-Schleife
// ganz unten.
$("preisStufen").addEventListener("input", () => {
  renderPricePanel();
  renderLiveFilters();
  updateAutoCalculation();
  renderVerkauf();
  if (letzterStatus) renderGewinn(letzterStatus);
  if (modalFilterRow) renderFilterModal();
});
// Der FST-Deckel rechnet nur neu - keine Anfrage an EA (28.09.2026).
// Gespeichert wird der Haken ueber die CHECK_FIELDS-Schleife ganz unten.
$("deckelFst").addEventListener("change", () => {
  renderPricePanel();
  renderLiveFilters();
  updateAutoCalculation();
  renderVerkauf();
  if (letzterStatus) renderGewinn(letzterStatus);
  if (modalFilterRow) renderFilterModal();
});
$("minProfit").addEventListener("input", () => {
  renderPricePanel();
  renderLiveFilters();
  updateAutoCalculation();
});
$("smartProfit").addEventListener("change", () => {
  renderProfitSetting();
  renderPricePanel();
  renderLiveFilters();
  updateAutoCalculation();
});
// Preis-Methode umstellen rechnet nur neu - keine Anfrage an EA. Gespeichert
// wird sie ueber die SELECT_FIELDS-Schleife ganz unten.
$("preisMethode").addEventListener("change", () => {
  renderPricePanel();
  renderLiveFilters();
  updateAutoCalculation();
  renderVerkauf();
  if (letzterStatus) renderGewinn(letzterStatus);
  if (modalFilterRow) renderFilterModal();
});
$("add-target").addEventListener("click", addTarget);
$("export-buys").addEventListener("click", exportBuys);
$("export-prices").addEventListener("click", exportPrices);

for (const button of WURZEL.querySelectorAll("#filter-budget button")) {
  button.addEventListener("click", () => {
    filterBudget = button.dataset.budget;
    for (const other of WURZEL.querySelectorAll("#filter-budget button")) other.classList.toggle("active", other === button);
    renderLiveFilters();
  });
}

$("load-filter").addEventListener("click", async () => {
  const row = liveFilterRows().find((item) => item.key === selectedFilterKey);
  if (!row) return;
  openFilterModal(row);
});

$("fm-close").addEventListener("click", closeFilterModal);
$("filter-modal-wrap").addEventListener("click", (event) => {
  if (event.target === $("filter-modal-wrap")) closeFilterModal();
});
for (const button of WURZEL.querySelectorAll("#fm-sale-mode button")) {
  button.addEventListener("click", () => { modalSaleMode = button.dataset.mode; renderFilterModal(); });
}
for (const button of WURZEL.querySelectorAll("#fm-profit-mode button")) {
  button.addEventListener("click", () => {
    modalProfitMode = button.dataset.mode;
    $("fm-profit-value").value = modalProfitMode === "percent" ? "8" : String(minProfitValue());
    renderFilterModal();
  });
}
$("fm-profit-value").addEventListener("input", renderFilterModal);
$("fm-minus").addEventListener("click", () => {
  const step = modalProfitMode === "percent" ? 1 : 50;
  $("fm-profit-value").value = String(Math.max(0, (Number($("fm-profit-value").value) || 0) - step));
  renderFilterModal();
});
$("fm-plus").addEventListener("click", () => {
  const step = modalProfitMode === "percent" ? 1 : 50;
  $("fm-profit-value").value = String((Number($("fm-profit-value").value) || 0) + step);
  renderFilterModal();
});
$("fm-manual").addEventListener("click", () => activateModalFilter(true));
$("fm-start").addEventListener("click", () => activateModalFilter(false));
$("fm-auto-start").addEventListener("change", renderFmStart);

// --- Den Markt-Scan eingrenzen (24.09.2026) ----------------------------
//
// EA liefert pro Suche nur 21 Angebote. Beim offenen Markt-Scan (ohne
// bestimmten Spieler) helfen Filter deshalb wirklich: Sie raeumen die 21
// Plaetze frei - genau wie der Mindestpreis. Bei einer Suche MIT Spieler
// waeren sie sinnlos, Liga und Nation stehen dort ja ohnehin fest.
//
// Die Auswahllisten kommen aus EAs eigener Suchmaske. Am 24.09. wurde mit
// EINER Suche gemessen, wie die Werte in der Adresse heissen:
//   lev=2 & pos=130 & nat=14 & leag=13 & playStyle=251 & rarityIds=12
// "icontraits" (PlayStyle+) wurde dabei von EA weggelassen - das Feld gibt
// es in der Maske, in der Adresse aber nicht. Darum fehlt es hier.
const SCAN_FILTER = [
  ["rarity", "scanf-rarity"],
  ["level", "scanf-level"],
  ["position", "scanf-position"],
  ["league", "scanf-league"],
  ["nation", "scanf-nation"],
  ["playStyle", "scanf-playStyle"],
  // Verein (25.09.2026). Schaerfste Eingrenzung von allen: eine Liga hat
  // rund 20 Vereine. Die Liste kommt wie die anderen aus EAs Suchmaske.
  ["club", "scanf-club"]
];
const scanFilterGezeichnet = {};

// Was gerade eingestellt ist. Leer = ueber den ganzen Markt suchen.
function scanFilterWerte() {
  const out = {};
  for (const [name, id] of SCAN_FILTER) {
    const feld = $(id);
    if (!feld || feld.value === "") continue;
    const n = Math.floor(Number(feld.value));
    if (Number.isFinite(n) && n >= 0 && n < 100000) out[name] = n;
  }
  return out;
}

function renderScanFilter(st) {
  const block = $("scan-filter-block");
  if (!block) return;
  const listen = (st && st.filterListen) || {};
  let gibtListen = false;
  for (const [name, id] of SCAN_FILTER) {
    const feld = $(id);
    const liste = Array.isArray(listen[name]) ? listen[name] : [];
    if (!feld) continue;
    const zeile = feld.closest(".row");
    if (zeile) zeile.hidden = !liste.length;
    if (!liste.length) continue;
    gibtListen = true;
    // Nur neu aufbauen, wenn sich die Liste geaendert hat - sonst springt
    // die Auswahl bei jedem Takt zurueck.
    const signatur = liste.map((e) => e.id + ":" + e.label).join("|");
    if (scanFilterGezeichnet[name] !== signatur) {
      scanFilterGezeichnet[name] = signatur;
      const gemerkt = feld.value;
      const alle = document.createElement("option");
      alle.value = "";
      alle.textContent = "Alle";
      feld.replaceChildren(alle, ...liste.map((e) => {
        const o = document.createElement("option");
        o.value = String(e.id);
        o.textContent = e.label;
        return o;
      }));
      if (gemerkt && liste.some((e) => String(e.id) === gemerkt)) feld.value = gemerkt;
    }
  }
  block.hidden = !gibtListen;
  const anzahl = Object.keys(scanFilterWerte()).length;
  const marke = $("scan-filter-anzahl");
  if (marke) marke.textContent = anzahl ? "· " + anzahl + " aktiv" : "";
}

for (const [, id] of SCAN_FILTER) {
  const feld = $(id);
  if (feld) feld.addEventListener("change", () => { renderScanFilter(letzterStatus); saveSettings(); });
}

$("scan-filter-leeren").addEventListener("click", () => {
  for (const [, id] of SCAN_FILTER) { const f = $(id); if (f) f.value = ""; }
  renderScanFilter(letzterStatus);
  saveSettings();
});

$("scan-market").addEventListener("click", async () => {
  if (aktuelleSperre()) return; // Knopf ist grau, der Grund steht darunter
  // Der Scan sucht bis zur Obergrenze des gewaehlten Reiters. Die Grenzen
  // haengen seit 27.09.2026 am eingetragenen Budget (budgetGrenzen) - sonst
  // wuerde "Niedrig" in der Liste etwas anderes bedeuten als in der Suche.
  // "Hoch" und "Gesamt" haben von den Reitern keine Obergrenze: dort gilt das
  // Vierfache bzw. das Doppelte der Mittel-Grenze. Bei den alten festen
  // Grenzen kommen genau die alten Werte heraus (100.000 und 50.000).
  const g = budgetGrenzen();
  const maxPrice = filterBudget === "low" ? g.low : filterBudget === "mid" ? g.mid : filterBudget === "high" ? g.mid * 4 : g.mid * 2;
  const res = await send("marketScan", { cfg: { maxPrice, filter: scanFilterWerte() } });
  if (!res || !res.ok) {
    $("market-scan-msg").className = "hint err";
    $("market-scan-msg").textContent = res && res.error ? res.error : "Keine Antwort von der Web App.";
  }
  render(res);
});

// Tabs: role="tablist" verspricht Pfeiltasten-Bedienung, deshalb wandert der
// Fokus mit (roving tabindex) statt alle fuenf Tabs in die Tabulator-Reihenfolge
// zu legen.
const tabList = Array.from(WURZEL.querySelectorAll(".tab"));

function selectTab(tab, moveFocus) {
  // In der Leiste bleiben die Reiter ueber einem offenen Dialog sichtbar.
  // Ein Klick darauf heisst: weg vom Dialog, hin zum Reiter.
  if (!$("start-modal-wrap").hidden) closeStartModal();
  if (!$("filter-modal-wrap").hidden) closeFilterModal();
  if ($("tour-wrap") && !$("tour-wrap").hidden) tourSchliessen();
  const gewechselt = tab.getAttribute("aria-selected") !== "true";
  for (const other of tabList) {
    const active = other === tab;
    other.setAttribute("aria-selected", String(active));
    other.tabIndex = active ? 0 : -1;
    $(other.dataset.view).hidden = !active;
  }
  if (moveFocus) tab.focus();
  // Der neue Reiter beginnt oben. Sonst blieb die alte Scrollhoehe stehen,
  // und z. B. unter "Snipen" war der Auto/Manuell-Schalter nicht zu sehen.
  if (gewechselt) nachObenScrollen();
  // Kaeufe: Transferliste aus dem Speicher der Web App lesen - kostet nichts.
  if (gewechselt && tab.id === "tab-buys") verkaufLesen(false);
  if (gewechselt) renderAssistent(); // seine Knoepfe haengen am offenen Reiter
}

for (const tab of tabList) {
  tab.addEventListener("click", () => selectTab(tab, false));
  tab.addEventListener("keydown", (event) => {
    // Einfach (02.10.2026): versteckte Reiter gibt es fuer die Tastatur nicht.
    const sichtbar = tabList.filter((t) => !(ansicht === "einfach" && t.hasAttribute("data-profi")));
    const index = Math.max(0, sichtbar.indexOf(tab));
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    let next = null;
    if (step) next = sichtbar[(index + step + sichtbar.length) % sichtbar.length];
    else if (event.key === "Home") next = sichtbar[0];
    else if (event.key === "End") next = sichtbar[sichtbar.length - 1];
    if (!next) return;
    event.preventDefault();
    selectTab(next, true);
  });
}

// Hilfe zum gerade offenen Reiter (25.09.2026). Der Hilfe-Reiter zeigte immer
// denselben Text von ganz oben. Wer unter Filter oder Optionen nicht
// weiterwusste, musste den passenden Absatz selbst suchen.
const HILFE_ANKER = {
  "tab-snipe": "hilfe-snipe",
  "tab-chancen": "hilfe-chancen",
  "tab-filters": "hilfe-filters",
  "tab-buys": "hilfe-buys",
  "tab-settings": "hilfe-settings",
  "tab-help": "hilfe-snipe"
};

function hilfeZumReiter() {
  const offen = tabList.find((tab) => tab.getAttribute("aria-selected") === "true");
  const ankerId = HILFE_ANKER[offen ? offen.id : "tab-snipe"] || "hilfe-snipe";
  selectTab($("tab-help"), false);
  const anker = $(ankerId);
  if (!anker) return;
  // selectTab scrollt den neuen Reiter nach oben. Erst danach darf der
  // Absatz in den Blick geholt werden, sonst gewinnt das Hochscrollen.
  requestAnimationFrame(() => {
    // Die Kopfzeile klebt oben und deckt den Rand des Fensters zu. Ohne
    // Abstand landete die Ueberschrift HINTER ihr. Die Hoehe wird hier echt
    // gemessen (sie wechselt mit Status-Text und Lauf-Knoepfen).
    const kopf = WURZEL.querySelector(".top");
    if (kopf && anker.style) anker.style.scrollMarginTop = (kopf.offsetHeight + 8) + "px";
    anker.scrollIntoView({ block: "start" });
    anker.classList.add("hilfe-blitz");
    setTimeout(() => anker.classList.remove("hilfe-blitz"), 1200);
  });
}

if ($("hilfe-knopf")) $("hilfe-knopf").addEventListener("click", hilfeZumReiter);

async function preisCheckStarten() {
  if (!selected || aktuelleSperre()) return; // gesperrt: Grund steht unter dem Knopf
  checkNotice = null;
  await saveSettings();
  const res = await send("priceCheck", { player: { playerId: selected.id, playerName: selected.name, rating: $("rating").value, rarity: $("rarity").value } });
  if (!res || !res.ok) checkNotice = res && res.error ? res.error : "Keine Antwort von der Web App.";
  render(res);
}

$("check").addEventListener("click", preisCheckStarten);

$("p-apply").addEventListener("click", async () => {
  const value = $("p-apply").dataset.value;
  if (!value) return;
  $("maxPrice").value = value;
  feldPreisAlt = null;
  // Feld und Liste gehoeren zusammen: Steht die Karte schon in der Liste,
  // bekommt sie denselben Preis. Sonst kaufte der Start still zum alten
  // Listenpreis, obwohl oben der neue steht.
  const key = currentKey();
  const index = key ? targets.findIndex((t) => targetKey(t) === key) : -1;
  if (index >= 0) targets[index] = { ...targets[index], maxPrice: Number(value) };
  // Der Zielpreis steht erst im naechsten Schritt des Assistenten. Ohne ein
  // Wort hier weiss man nicht, ob der Klick angekommen ist.
  applyFlash = Date.now();
  $("p-apply").textContent = "Übernommen" + (index >= 0 ? ", auch in der Liste" : "") + ": " + fmt(Number(value)) + " ✓";
  renderTargets(true);
  await saveSettings();
});

// Gibt true zurueck, wenn der Bot den Lauf angenommen hat, sonst false
// (der Grund steht dann in notice).
// lauf: Werte nur fuer diesen einen Lauf (Autopilot). Sie gehen an den Bot,
// aber nicht in die gespeicherten Einstellungen - saveSettings liest die Felder.
async function startRun(onlyTargets, lauf) {
  notice = null;
  // Ganz vorn und mit frischem Stand: Sonst laufen bis zu drei Preis-Checks,
  // bevor der Bot wegen Sperre, fehlender Session oder laufendem Lauf ablehnt.
  const sperre = await frischeSperre();
  if (sperre) {
    notice = sperre;
    // Ohne Verbindung nicht den alten lastRes zeigen - der taete so, als sei alles da.
    render(letzterStatus ? lastRes : { ok: false, error: notice });
    return false;
  }
  if (!selected && !targets.length) {
    const hits = findPlayers($("playerName").value);
    if (hits.length === 1) choose(hits[0], true); // eindeutiger Name: direkt nehmen
  }

  let list = Array.isArray(onlyTargets) ? onlyTargets.slice() : targets.slice();
  if (!list.length) {
    const single = currentTarget();
    if (!single) {
      notice = players.length
        ? "Wähle den Spieler aus der Vorschlagsliste."
        : SPIELERLISTE_FEHLT;
      render(lastRes || { ok: false, error: notice });
      return false;
    }
    list = [single];
  }

  // Abgelaufene Live-Filter ueberspringen statt den ganzen Start zu sperren.
  // Die Liste und der Start-Dialog nennen sie; erneuern geht unter "Filter".
  const expired = list.filter(liveAbgelaufen);
  if (expired.length) {
    list = list.filter((target) => !liveAbgelaufen(target));
    if (!list.length) {
      notice = expired.every((t) => t.source === "chance")
        ? (expired.length === 1 ? "Die Chance für " + expired[0].playerName + " ist" : "Alle Chancen sind") +
          " abgelaufen. Unter „Radar“ siehst du, was noch gilt."
        : (expired.length === 1 ? "Der Live-Filter für " + expired[0].playerName + " ist" : "Alle Live-Filter sind") +
          " abgelaufen. Erneuere " + (expired.length === 1 ? "ihn" : "sie") + " unter „Filter“.";
      render(lastRes || { ok: false, error: notice });
      return false;
    }
  }

  // Nie ohne Gewinn kaufen: Der Gewinn-Schutz laeuft bei JEDEM Start, auch
  // ohne den Haken und fuer Autopilot und Filter-Sofortstart. Ohne Haken nur
  // mit den gespeicherten Preisen - dafuer gibt es keine EA-Anfrage.
  const blockiert = $("autoCheckOnStart").checked ? await checkPricesBeforeStart(list) : gewinnSperre(list);
  if (blockiert) {
    notice = blockiert;
    render(lastRes || { ok: false, error: notice });
    return false;
  }

  await saveSettings();
  const cfg = {
    // salePrice: erwarteter Verkaufspreis, landet bei jedem Kauf im Kauflog
      // (fuer die Gewinnschaetzung, die sonst am Preisverlauf haengt). Den
      // mitgebrachten Wert nur bei frischen Live-Filtern nehmen - eine alte
      // Sammlung braechte sonst einen Tage alten Verkaufspreis mit, genau wie
      // der Gewinn-Schutz (gewinnStand) es auch nur bei "live" tut.
      targets: list.map((t) => ({ playerId: t.playerId, playerName: t.playerName, rating: t.rating,
        // Mehrere Kartenarten (28.09.2026): Liste als Text durchreichen.
        // Number("12,70") waere NaN und wuerde daraus still "jede Art"
        // machen - der Bot suchte dann zu breit und kaufte die billigste
        // Version zum Preis der Sonderkarte.
        rarity: rarityWert(t.rarity),
        // Fester Verkaufspreis je Zeile faehrt zum Motor mit (28.09.2026).
        // Ohne diese Zeile waere das Feld ein toter Punkt: gespeichert,
        // aber nie beim Start dabei.
        listFestpreis: Number(t.listFestpreis) >= VERKAUF_MIN_PREIS ? Math.floor(Number(t.listFestpreis)) : 0,
        chance: t.source === "chance",
        maxPrice: t.maxPrice, expiresAt: t.expiresAt || 0, salePrice: (t.source === "live" || t.source === "chance") && Number(t.salePrice) > 0 ? Number(t.salePrice) : marktwertFuer({ playerId: t.playerId, rating: t.rating, rarity: t.rarity }, history), salePriceAt: preisStandFuer(t),
        // Die gemessene Chemie mitgeben (27.09.2026). Ohne sie kauft der Motor
        // jede Chemie zu einem Preis, der nur fuer eine gilt. null heisst:
        // Messung war gemischt, keine Sperre.
        chem: chemieStandFuer(t) })),
    budget: $("budget").value,
    maxBuys: $("maxBuys").value,
    timeLimitMin: $("timeLimitMin").value,
    afterBuy: afterBuyValue(),
    stopIfTooBroad: $("stopIfTooBroad").checked,
    gewinnBremse: $("gewinnBremse").checked,
    sofortKaufen: $("sofortKaufen").checked,
    nachKaufNeuSuchen: $("nachKaufNeuSuchen").checked,
    bidSniping: $("bidSniping").checked,
    bidSeconds: $("bidSeconds").value,
    speedMode: $("speedMode").value,
    pausePreset: $("pausePreset").value,
    filterSearchLimit: $("filterSearchLimit").value,
    filterBuyLimit: $("filterBuyLimit").value,
    filterAnfrageLimit: $("filterAnfrageLimit").value,
    filterSpendLimit: $("filterSpendLimit").value
  };
  if (lauf) Object.assign(cfg, lauf);
  const res = await send("start", { cfg });
  if (res.ok && res.cfg && Array.isArray(res.cfg.targets)) {
    // Preise auf gueltige Stufen abgerundet zurueckschreiben - aber nur, wenn
    // wirklich die Liste (oder bei leerer Liste das Feld) gestartet wurde.
    // Autopilot, Filter-Sofortstart und "Nur den gewaehlten" bringen eigene
    // Preise mit; die haben in der Liste nichts verloren. Und nur die Rundung:
    // Ein Preis, der nicht mehr dem gesendeten entspricht, bleibt, wie er ist.
    if (!Array.isArray(onlyTargets)) {
      const gesendet = new Map(list.map((t) => [targetKey(t), Math.floor(Number(t.maxPrice)) || 0]));
      const rounded = new Map(res.cfg.targets.map((t) => [t.key, t.maxPrice]));
      const nurRundung = (key, preis) => {
        const neu = rounded.get(key);
        return neu > 0 && gesendet.get(key) === preis ? neu : preis;
      };
      if (targets.length) targets = targets.map((t) => ({ ...t, maxPrice: nurRundung(targetKey(t), t.maxPrice) }));
      else if (list[0]) {
        const feld = Math.floor(Number($("maxPrice").value)) || 0;
        const neu = nurRundung(targetKey(list[0]), feld);
        if (neu !== feld) $("maxPrice").value = neu;
      }
      await saveSettings();
      renderTargets(true);
    }
  } else if (!res.ok) {
    notice = res.error;
  }
  render(res);
  return Boolean(res && res.ok);
}

// Aufklappbare Sicherheitskaesten (Start- und Filter-Dialog). Der Kasten klappt
// bei Warnungen von selbst auf - aber nie gegen den Willen des Nutzers: Klappt
// er ihn zu, bleibt er bei GENAU diesen Meldungen zu. Kommt eine andere
// Meldung, geht er wieder auf. (Die Anzeige wird alle 1,5 Sekunden neu
// gezeichnet; ohne diese Merkliste sprang er jedes Mal wieder auf.)
const kastenGezeigt = new Map(); // Kasten -> Meldungen, die er zuletzt zeigte
const kastenZuBei = new Map();   // Kasten -> Meldungen, bei denen der Nutzer ihn zuklappte

function sicherheitsKastenWunsch(kasten, meldungen) {
  if (!kasten) return;
  const text = meldungen.join("\n");
  kastenGezeigt.set(kasten, text);
  if (kastenZuBei.get(kasten) === text) kasten.open = false;
}

function sicherheitsKastenNeu(kasten) {
  if (kasten) kastenZuBei.delete(kasten);
}

for (const id of ["sm-safety-box", "fm-safety-wrap"]) {
  const kasten = $(id);
  const kopf = kasten && kasten.querySelector("summary");
  if (!kopf) continue;
  // Der Klick schaltet erst NACH dem Horcher um: open ist hier noch der alte Stand.
  kopf.addEventListener("click", () => {
    if (kasten.open) kastenZuBei.set(kasten, kastenGezeigt.get(kasten) || "");
    else kastenZuBei.delete(kasten);
  });
}

function closeStartModal() {
  $("start-modal-wrap").hidden = true;
  startNurAuswahl = false;
  restoreFocus();
}

// ---------------------------------------------------------------------------
// Feinabstimmung: Auto oder Custom je Zeile
// Auto heisst schlicht "nimm den Standardwert". Es gibt also weiterhin nur
// EINEN Satz Eingabefelder - der Schalter entscheidet nur, ob du ihn selbst
// setzt oder ob der Standard eingetragen wird. Damit bleibt alles dahinter
// unveraendert, und es kann nichts auseinanderlaufen.
// ---------------------------------------------------------------------------

const TUNE_ROWS = {
  speed: ["speedMode"],
  pause: ["pausePreset"],
  runtime: ["timeLimitMin"],
  limits: ["filterSearchLimit", "filterBuyLimit", "filterAnfrageLimit", "filterSpendLimit"],
  bids: ["bidSniping", "bidSeconds"]
};

let tuneModes = {};

function tuneRowEl(zeile) {
  return WURZEL.querySelector('.tune[data-row="' + zeile + '"]');
}

// Steht die Zeile auf Standard, gilt sie als Auto.
function rowIsDefault(zeile) {
  return TUNE_ROWS[zeile].every((id) => {
    const el = $(id);
    if (!el) return true;
    return el.type === "checkbox" ? el.checked === Boolean(DEFAULTS[id]) : String(el.value) === String(DEFAULTS[id]);
  });
}

function setTuneMode(zeile, modus) {
  tuneModes[zeile] = modus;
  const row = tuneRowEl(zeile);
  if (!row) return;
  const custom = modus === "custom";
  row.querySelector(".tune-custom").hidden = !custom;
  const autoZeile = row.querySelector(".tune-auto");
  // Die Auto-Zeile gibt es je Modus einmal (data-modus): die des anderen Modus bleibt versteckt.
  autoZeile.hidden = custom || (autoZeile.getAttribute("data-modus") === "streng" && fstAn());
  for (const button of row.querySelectorAll(".tune-mode button")) {
    button.classList.toggle("active", button.dataset.mode === modus);
  }
  // Zurueck auf Auto heisst: Standardwerte wiederherstellen.
  if (!custom) {
    for (const id of TUNE_ROWS[zeile]) {
      const el = $(id);
      if (!el) continue;
      if (el.type === "checkbox") el.checked = Boolean(DEFAULTS[id]);
      else el.value = String(DEFAULTS[id]);
    }
  }
}

function renderTuneRows() {
  for (const zeile of Object.keys(TUNE_ROWS)) {
    setTuneMode(zeile, rowIsDefault(zeile) ? "auto" : "custom");
  }
}

for (const row of WURZEL.querySelectorAll(".tune")) {
  for (const button of row.querySelectorAll(".tune-mode button")) {
    button.addEventListener("click", () => {
      setTuneMode(row.dataset.row, button.dataset.mode);
      for (const profile of WURZEL.querySelectorAll("#sm-profile button")) profile.classList.remove("active");
      saveSettings();
      startSafetyInfo();
    });
  }
}

// ---------------------------------------------------------------------------
// Zahlfelder mit Minus und Plus (FSTs .form-control--number, style.css
// Z. 1908-1940). Nur das Aussehen und ein Klick-Weg: Das Feld selbst bleibt
// dasselbe <input> mit derselben ID, Grenzen (min/max) und denselben Ereignissen.
// Ein Klick ruft "input" und "change" auf - genau wie ein Tastendruck.
// Ohne Knoepfe bleiben Bewertungsfelder ("Rating"): In der schmalen Spalte
// laege kein Platz mehr fuer die Zahl.
// ---------------------------------------------------------------------------
const ZAHLFELD_OHNE = ["rating", "autoRating"];
// Bei Coin-Feldern waere +1 nutzlos; diese Felder springen in groesseren Schritten.
const ZAHLFELD_SPRUNG = { budget: 1000, autoBudget: 1000 };

function zahlfeldSchritt(feld, richtung) {
  if (feld.disabled || feld.readOnly) return;
  const schritt = Number(feld.dataset.schritt) || Number(feld.step) || 1;
  const min = feld.min !== "" && Number.isFinite(Number(feld.min)) ? Number(feld.min) : null;
  const max = feld.max !== "" && Number.isFinite(Number(feld.max)) ? Number(feld.max) : null;
  const jetzt = feld.value === "" ? NaN : Number(feld.value);
  // Leeres Feld heisst bei Budget und Co. "ohne Grenze". Ein Klick auf Minus
  // darf daraus nicht 0 machen (0 = "gar nichts ausgeben"): Bei leerem Feld und
  // Untergrenze 0 gibt es nichts zu verringern, also bleibt alles stehen.
  // Plus beginnt weiter beim kleinsten Schritt.
  if (richtung < 0 && feld.value === "" && min === 0) return;
  let neu;
  if (Number.isFinite(jetzt)) neu = jetzt + richtung * schritt;
  else neu = richtung > 0 ? (min !== null && min > 0 ? min : schritt) : (min !== null ? min : 0);
  if (min !== null) neu = Math.max(min, neu);
  if (max !== null) neu = Math.min(max, neu);
  neu = Math.round(neu * 10000) / 10000;
  feld.value = String(neu);
  feld.dispatchEvent(new Event("input", { bubbles: true }));
  feld.dispatchEvent(new Event("change", { bubbles: true }));
}

function zahlfelderMitKnoepfen() {
  const SVG_MINUS = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10"/></svg>';
  const SVG_PLUS = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M8 3v10"/></svg>';
  for (const feld of WURZEL.querySelectorAll('#view-snipe input[type="number"]')) {
    if (ZAHLFELD_OHNE.includes(feld.id) || !feld.parentNode) continue;
    if (feld.parentNode.classList && feld.parentNode.classList.contains("zahlfeld")) continue;
    if (ZAHLFELD_SPRUNG[feld.id]) feld.dataset.schritt = String(ZAHLFELD_SPRUNG[feld.id]);
    const kasten = document.createElement("span");
    kasten.className = "zahlfeld";
    const knopf = (richtung, svg, name) => {
      const b = document.createElement("button");
      b.type = "button";
      b.tabIndex = -1; // Mit der Tastatur gehen Pfeil hoch/runter im Feld selbst.
      b.setAttribute("aria-label", name);
      b.title = name;
      b.innerHTML = svg;
      b.addEventListener("click", () => zahlfeldSchritt(feld, richtung));
      return b;
    };
    feld.parentNode.insertBefore(kasten, feld);
    kasten.append(knopf(-1, SVG_MINUS, "Wert verringern"), feld, knopf(1, SVG_PLUS, "Wert erhöhen"));
  }
}
try {
  zahlfelderMitKnoepfen();
} catch (e) {
  // Nur Aussehen: Ein Fehler hier darf den Rest der Seite nie stoppen.
}

// Was gegen einen Start spricht - nur gerechnet, ohne Anzeige und ohne die
// Start-Sperre (die holt jeder Weg frisch fuer sich). Das Start-Fenster zeigt
// alles davon, der Autopilot prueft damit dieselben Grenzen. Frueher kannte
// nur das Start-Fenster sie, und der Autopilot startete an ihnen vorbei.
// lauf: Werte, die nur fuer diesen einen Lauf gelten (Autopilot), sonst
// zaehlen die Felder.
// "Usage Sharing" ist in FC eingeschaltet: EA sammelt Nutzungsdaten ueber die
// App. Die oeffentliche Anleitung von FUT Simple Trader raet, es auszuschalten.
const NUTZUNG_WARNUNG = "„Usage Sharing“ ist an – EA sammelt Nutzungsdaten. Bitte in FC auf der Konsole ausschalten: " +
  "Football Club → Anpassen → Online-Einstellungen → Datenschutz.";

// Zweiter Bot auf der Seite (z. B. FUT Simple Trader): nie beide zugleich.
function fremdWarnung(name) {
  return "Auch " + name + " ist auf dieser Seite geladen. Nie beide gleichzeitig laufen lassen – sonst doppelt so viele Suchen.";
}

const FELD_NAMEN = {
  budget: "Budget",
  maxBuys: "Max. Käufe",
  filterSearchLimit: "Suchen je Spieler",
  filterBuyLimit: "Käufe je Spieler",
  filterAnfrageLimit: "Kaufversuche je Spieler",
  filterSpendLimit: "Coins je Spieler",
  timeLimitMin: "Laufzeit in Minuten"
};

// Prueft vor dem Start, ob "Gleich verkaufen" ueberhaupt einstellen kann.
// Bis zum 27.09.2026 hiess das: jeder Spieler braucht einen Preis, der
// hoechstens 60 Minuten alt ist. Seitdem gibt es zwei weitere Quellen - den
// Festpreis aus den Optionen und den im Lauf gemessenen Marktpreis. Steht ein
// Festpreis, waere die alte Warnung schlicht falsch: Der Bot stellt dann jede
// Karte ein.
function einstellenPruefung(list, afterBuy, stapel) {
  const warnungen = [];
  const hinweise = [];
  if (afterBuy !== "list") return { warnungen, hinweise };
  const festFeld = $("listFestpreis");
  const fest = Number(festFeld && festFeld.value) || 0;
  if (fest >= 200) {
    hinweise.push("„Gleich verkaufen“ ist an, und in den Optionen steht ein Festpreis von " + fmt(fest) + " Coins. Jede gekaufte Karte wird für diesen Preis eingestellt – ein Preis-Check ist dafür nicht nötig. Bleibt nach 5 % EA-Gebühr kein Gewinn, stellt der Bot nicht ein.");
  } else {
    hinweise.push("„Gleich verkaufen“ ist an: Nach jedem Kauf stellt der Bot den Spieler selbst für eine Stunde ein. Der Preis kommt aus dem letzten Preis-Check, sonst aus dem Marktpreis, den der Bot im Lauf selbst misst.");
    const ohne = list.filter((t) => priceAgeFor(t) > LIST_PREIS_FRISCH_MS);
    if (list.length && ohne.length === list.length) {
      warnungen.push("„Gleich verkaufen“ ist gewählt, aber für keinen Spieler gibt es einen Preis, der höchstens 60 Minuten alt ist. Der Bot versucht es dann mit dem Marktpreis, den er im Lauf selbst misst. Sicherer ist: erst „Preis prüfen“, oder in den Optionen einen Festpreis eintragen.");
    } else if (ohne.length) {
      warnungen.push("„Gleich verkaufen“: Für " + ohne.map((t) => t.playerName).join(", ") + " ist der Preis älter als 60 Minuten. Bei diesen Käufen nimmt der Bot den im Lauf gemessenen Marktpreis – gibt es auch den nicht, landen sie nur auf der Transferliste.");
    }
  }
  if (stapel && stapel.transfer !== null && Number(stapel.transfer) >= 95) {
    warnungen.push("Die Transferliste ist fast voll (" + stapel.transfer + " von 100). Dann wird nach dem Kauf nichts mehr eingestellt.");
  }
  return { warnungen, hinweise };
}

function startPruefung(alleZiele, lauf) {
  const extra = lauf || {};
  // Abgelaufene Live-Filter ueberspringt der Start - sie zaehlen hier nicht mit.
  const weg = alleZiele.filter(liveAbgelaufen);
  const list = alleZiele.filter((t) => !liveAbgelaufen(t));
  const feld = (id) => (id in extra ? extra[id] : $(id).value);
  const usage = lastRes && lastRes.status ? lastRes.status.usage || {} : {};
  // FST-Modus: Der Start-Dialog bleibt startbar. Hier bleiben nur die Dinge
  // rot, die technisch nicht gehen (kein Spieler, kaputte Zahl, Kontostand
  // unbekannt, Budget unter dem Zielpreis, Zeitlimit ueber 300). Der Rest ist
  // eine gelbe Warnung.
  const fst = fstAn();
  const hour = Number(usage.searchesHour) || 0;
  const day = Number(usage.searchesDay) || 0;
  const buys = Number(usage.buysDay) || 0;
  const requested = Number(feld("filterSearchLimit"));
  const turbo = $("speedMode").value === "turbo";
  // Budget und Max. Kaeufe kommen aus Schritt 4 des Ablaufs - hier nur gelesen.
  // Die Rotation bringt ihr Rest-Budget selbst mit (extra.budget) - dann
  // zaehlt das, nicht das Feld (28.09.2026). Leer heisst "ohne Grenze".
  const budgetRoh = "budget" in extra ? extra.budget : $("budget").value;
  const budgetLeer = String(budgetRoh == null ? "" : budgetRoh).trim() === "";
  const budget = Number(budgetRoh) || 0;
  const maxBuys = Number($("maxBuys").value) || 0;
  const filterBuys = Number(feld("filterBuyLimit")) || 0;
  const spendLimit = Number(feld("filterSpendLimit")) || 0;
  const timeLimit = Number(feld("timeLimitMin")) || 0;
  const highestTarget = list.length ? Math.max(...list.map((target) => Number(target.maxPrice) || 0)) : 0;
  const plannedSearches = requested * Math.max(1, list.length);
  const warnings = [];
  const blockers = [];
  if (lastRes && lastRes.status && lastRes.status.nutzungsdaten === true) warnings.push(NUTZUNG_WARNUNG);
  if (lastRes && lastRes.status && lastRes.status.fremderBot) warnings.push(fremdWarnung(lastRes.status.fremderBot) + " Läuft er gerade, dort zuerst stoppen.");
  // Frueher stand hier fuer jedes falsche Feld derselbe Satz ("Bitte gueltige
  // Zahlen ...") - ohne Feldnamen. Mit einem Budget wie 23.929 (Budget musste
  // durch 100 teilbar sein) startete nichts, und niemand sah, warum.
  for (const id of ["budget", "maxBuys", "filterSearchLimit", "filterBuyLimit", "filterSpendLimit", "timeLimitMin"]) {
    if (id in extra) continue;
    const el = $(id);
    if (el.checkValidity()) continue;
    const grenzen = [el.min !== "" ? "mindestens " + fmt(Number(el.min)) : "", el.max !== "" ? "höchstens " + fmt(Number(el.max)) : ""]
      .filter(Boolean).join(", ");
    blockers.push((FELD_NAMEN[id] || id) + ": bitte eine ganze Zahl eintragen" + (grenzen ? " (" + grenzen + ")" : "") + ".");
  }
  if (!list.length) {
    blockers.push(weg.length
      ? (weg.every((t) => t.source === "chance")
        ? "Alle Chancen in der Liste sind abgelaufen. Unter „Radar“ siehst du, was noch gilt."
        : "Alle Live-Filter in der Liste sind abgelaufen. Erneuere sie unter „Filter“.")
      : "Kein Spieler gewählt.");
  } else if (weg.length) {
    warnings.push("Abgelaufen, wird übersprungen: " + weg.map((t) => t.playerName).join(", ") +
      (weg.every((t) => t.source === "chance") ? ". Unter „Radar“ siehst du, was noch gilt." : ". Unter „Filter“ kannst du erneuern."));
  }
  // FST-Modus (Punkt 3): Kein Ablauf, keine Sperre - nur eine gelbe Warnung.
  // (Die Pruefung steht hier ausgeschrieben: dieser Block laeuft in Tests ohne
  // die Hilfsfunktion liveAlt.)
  const preisAelter = fst ? alleZiele.filter((t) => t && (t.source === "live" || t.source === "chance") && t.expiresAt > 0 && t.expiresAt <= Date.now()) : [];
  if (preisAelter.length) {
    warnings.push("Der Preis ist älter als 15 Minuten: " + preisAelter.map((t) => t.playerName).join(", ") + ". Der Lauf geht trotzdem los.");
  }
  if (budgetLeer) {
    // Ohne Budget ist der Kontostand die einzige Geld-Bremse (28.09.2026).
    // Ist er unbekannt, lehnt auch der Motor ab - die Meldung hier erspart
    // nur den vergeblichen Klick.
    if (guthabenJetzt() === null) blockers.push("Budget ist leer („ohne Grenze“), aber dein Kontostand ist noch unbekannt. Lade die Web App einmal ganz – oder trag ein Budget ein.");
  } else if (budget < highestTarget) {
    blockers.push("Das Gesamtbudget ist kleiner als der höchste Zielpreis (" + highestTarget.toLocaleString("de-DE") + ").");
  }
  // Leeres Feld heisst seit 27.09.2026 "ohne eigene Grenze" - dann darf hier
  // nichts blockieren. Eine eingetragene Zahl muss weiter 1 bis 50 sein.
  const maxBuysText = String($("maxBuys").value).trim();
  if (fst) {
    // FST-Modus: Leere Felder heissen "ohne Grenze"; eine Zahl muss mindestens 1 sein.
    if (maxBuysText !== "" && maxBuys < 1) blockers.push("Max. Käufe muss mindestens 1 sein – oder leer bleiben für „ohne Grenze“.");
    if (String(feld("filterSearchLimit")).trim() !== "" && requested < 1) blockers.push("Suchen je Spieler muss mindestens 1 sein – oder leer bleiben.");
    if (String(feld("filterBuyLimit")).trim() !== "" && filterBuys < 1) blockers.push("Käufe je Spieler muss mindestens 1 sein – oder leer bleiben.");
  } else {
  if (maxBuysText !== "" && (maxBuys < 1 || maxBuys > 50)) {
    blockers.push("Max. Käufe muss zwischen 1 und 50 liegen – oder leer bleiben für „ohne Grenze“.");
  }
  if (requested < 10 || requested > 150) blockers.push("Suchen je Spieler muss zwischen 10 und 150 liegen.");
  if (filterBuys < 1 || filterBuys > 20) blockers.push("Käufe je Spieler muss zwischen 1 und 20 liegen.");
  }
  // Kaufversuche je Spieler (27.09.2026): Leer heisst automatisch, also das
  // Doppelte der Kaeufe. Eine eingetragene Zahl muss 1 bis 60 sein - mehr
  // laesst der Bot ohnehin nicht zu (content.js, filterAnfrageLimit).
  const versucheText = String(feld("filterAnfrageLimit")).trim();
  const versuche = Number(versucheText) || 0;
  if (versucheText !== "" && (versuche < 1 || (!fst && versuche > 60))) {
    blockers.push("Kaufversuche je Spieler muss zwischen 1 und 60 liegen – oder leer bleiben.");
  }
  if (timeLimit < 0 || timeLimit > 300) blockers.push("Das Zeitlimit darf höchstens 300 Minuten betragen.");
  if (spendLimit > 0 && spendLimit < highestTarget) (fst ? warnings : blockers).push("Das Coin-Limit je Spieler reicht nicht für den Zielpreis.");
  // Gewinn-Schutz mit den gespeicherten Preisen, ohne EA-Anfrage. Ist der
  // Preis alt und prueft der Start ihn ohnehin nach, hier nur warnen - sonst
  // kaeme man an die Nachpruefung gar nicht heran. Die Sperre danach macht startRun.
  const nachpruefen = $("autoCheckOnStart").checked;
  for (const target of list) {
    const stand = gewinnStand(target);
    if (!stand) continue;
    const wer = target.playerName + (target.rating ? " (" + target.rating + ")" : "");
    if (stand.keinGewinn && !(stand.alt && nachpruefen)) {
      // FST-Modus: nur mit dem Haken "Gewinn-Bremse" rot, sonst gelb.
      (fst && !($("gewinnBremse") && $("gewinnBremse").checked) ? warnings : blockers).push("Kein Gewinn bei " + wer + ": Zielpreis " + fmt(target.maxPrice) + ", nach 5 % EA-Gebühr bringt der Verkauf nur " + fmt(stand.saleNet) + ".");
    } else if (stand.keinGewinn) {
      warnings.push(wer + ": Mit dem alten Preis bliebe kein Gewinn. Der Start prüft ihn neu.");
    } else if (stand.ueberVorschlag) {
      warnings.push(wer + ": Zielpreis " + fmt(target.maxPrice) + " liegt über dem Vorschlag" +
        (stand.vorschlag > 0 ? " " + fmt(stand.vorschlag) : "") + " – weniger Gewinn.");
    }
  }
  const eins = einstellenPruefung(list, "afterBuy" in extra ? extra.afterBuy : afterBuyValue(), lastRes && lastRes.status ? lastRes.status.stapel : null);
  warnings.push(...eins.warnungen);
  // Schutzlimits kommen vom Bot (content.js CONFIG), nicht fest verdrahtet.
  // Die Ersatzwerte gelten nur, solange noch kein Stand da ist.
  const limitStunde = Number(usage.searchLimitHour) || 150;
  const limitTag = Number(usage.searchLimitDay) || 350;
  const warnStunde = Number(usage.searchWarnHour) || 120;
  const warnTag = Number(usage.searchWarnDay) || 250;
  const limitKauf = Number(usage.buyLimitDay) || 100;
  // Hinweise: Am Limit stoppt der Bot sauber von selbst, man soll es aber
  // vorher wissen. Warnungen und Hinweise sind gelb, rot sind nur Sperren.
  const hinweise = [];
  hinweise.push(...eins.hinweise);
  if (day >= limitTag) warnings.push("Tageslimit von " + limitTag + " Suchen erreicht. Der Lauf stoppt gleich bei der ersten Suche.");
  else if (day + plannedSearches > limitTag) hinweise.push("Mit diesem Lauf erreichst du wahrscheinlich das Tageslimit von " + limitTag + " Suchen.");
  else if (day >= warnTag) hinweise.push("Heute schon " + day + " Suchen. EA sperrte bei rund 450 am Tag – mach lieber bald Schluss.");
  if (hour >= limitStunde) warnings.push("Stundenlimit von " + limitStunde + " Suchen erreicht. Warte etwas, sonst stoppt der Lauf sofort.");
  else if (hour + plannedSearches > limitStunde) hinweise.push("Mit diesem Lauf erreichst du wahrscheinlich das Stundenlimit von " + limitStunde + " Suchen.");
  else if (hour >= warnStunde) hinweise.push("In der letzten Stunde schon " + hour + " Suchen. Eine Pause senkt das Risiko.");
  // Ausnahme vom Tageslimit: startbar, aber nie gruen. Im FST-Modus gibt es
  // kein Tageslimit, also auch keine Ausnahme davon.
  const ausnahme = fst ? "" : ausnahmeWarnung(lastRes && lastRes.status);
  if (ausnahme) warnings.push(ausnahme);
  if (buys >= limitKauf) warnings.push("Tageslimit von " + limitKauf + " Kaufversuchen erreicht.");
  else if (maxBuysText === "") hinweise.push(fst
    ? "Max. Käufe ist leer: Der Lauf kauft ohne Grenze weiter, bis Budget, Laufzeit oder die Grenzen je Spieler erreicht sind."
    : "Max. Käufe ist leer: Der Lauf kauft ohne eigene Grenze weiter, bis Budget, Laufzeit, die Grenzen je Spieler oder das Tageslimit von " + limitKauf + " Kaufversuchen erreicht ist.");
  else if (buys + maxBuys > limitKauf) hinweise.push("Mit diesem Lauf erreichst du wahrscheinlich das Tageslimit von " + limitKauf + " Kaufversuchen.");
  const amLimit = (lastRes && lastRes.status && lastRes.status.cardsAtLimit) || [];
  const betroffen = list.filter((t) => amLimit.includes(t.playerId + ":" + (t.rating || 0)));
  if (betroffen.length === list.length && list.length) {
    blockers.push("Alle gewählten Karten haben ihr Tageslimit von " + (usage.cardLimitDay || 20) + " Kaufversuchen erreicht.");
  } else if (betroffen.length) {
    warnings.push(betroffen.length + " Karte(n) haben ihr Tageslimit erreicht und werden übersprungen.");
  }
  // Max. Kaeufe gilt fuer den ganzen Lauf, die Kaeufe je Spieler fuer jeden
  // Spieler einzeln. Frueher stoppte ein Lauf mit Max. Kaeufe 10 still nach 3.
  // Weniger Versuche als Kaeufe waere ein stiller Widerspruch: Der Spieler
  // waere durch, bevor er seine erlaubten Kaeufe machen konnte (27.09.2026).
  if (versucheText !== "" && filterBuys >= 1 && versuche < filterBuys) {
    hinweise.push("Kaufversuche je Spieler steht auf " + versuche + ", erlaubt sind aber " + filterBuys +
      " Käufe je Spieler. Der Spieler ist dann schon vor dem letzten erlaubten Kauf durch.");
  }
  if (filterBuys >= 1 && list.length && maxBuys > filterBuys * list.length) {
    hinweise.push("Max. Käufe steht auf " + maxBuys + ", je Spieler sind aber nur " + filterBuys +
      " Käufe erlaubt (Grenzen je Spieler). Der Lauf endet also nach höchstens " + filterBuys * list.length + " Käufen.");
  }
  // Nur Live-Filter in der Liste: Der Lauf endet, wenn der letzte abläuft.
  // Live gesehen: Laufzeit 30 Min., der Filter galt aber nur noch 11.
  const liveEnden = list.map((t) => (t.source === "live" || t.source === "chance" ? Number(t.expiresAt) || 0 : 0));
  if (!fst && list.length && liveEnden.every((ende) => ende > 0)) {
    const restMin = Math.max(1, Math.ceil((Math.max(...liveEnden) - Date.now()) / 60000));
    if (restMin < (timeLimit || 300)) {
      const nurChancen = list.every((t) => t.source === "chance");
      hinweise.push((list.length === 1 ? (nurChancen ? "Die Chance gilt" : "Der Live-Filter gilt") : (nurChancen ? "Die Chancen gelten" : "Die Live-Filter gelten")) + " nur noch " + restMin +
        " Min. – dann endet der Lauf, auch wenn die Laufzeit länger ist.");
    }
  }
  // Alte Preise: Der Start prueft hoechstens MAX_AUTO_CHECKS selbst nach.
  // Mehr lehnt startRun ab - das soll man hier schon sehen, nicht erst danach.
  if (nachpruefen) {
    const zuViele = zuVieleAltePreise(list);
    const alt = altePreise(list).length;
    if (zuViele) blockers.push(zuViele);
    else if (alt) hinweise.push("Vor dem Start " + (alt === 1 ? "wird 1 alter Preis" : "werden " + alt + " alte Preise") + " neu geprüft.");
  }
  if (turbo) warnings.push("Turbo ist schneller und hat ein höheres Sperrrisiko.");
  // Ein Satz zum Modus: ehrlich, kurz, mit dem Risiko.
  if (fst) hinweise.push("Modus: ohne eigene Grenzen. Der Bot bremst dich nicht – EA kann dein Konto trotzdem sperren.");
  return { blockers, warnings, hinweise, hour, day, limitStunde, limitTag, plannedSearches, turbo, timeLimit };
}

// Wie lange eine Suche samt Pausenanteil dauert, weiss laufzeitRechnung()
// weiter oben - EINE Rechnung fuer alle Anzeigen. Hier standen bis zum
// 28.09.2026 zwei weitere, nie aufgerufene Kopien derselben Zahlen
// (sekundenJeSuche und pausenPlan - letztere hatte den Pausen-Faktor sogar
// schon richtig, war aber nirgends angeschlossen). Kopien laufen
// auseinander, deshalb sind sie weg.

// "Einstellungen im Ueberblick" im Start-Dialog (30.09.2026): kleine Chips wie
// FSTs "Settings overview" (Name grau, Wert weiss und fett). Nur Anzeige - sie
// lesen die Felder, die im Dialog darunter stehen, und aendern nichts.
const PAUSEN_NAMEN = { short: "Kurz", medium: "Ausgewogen", long: "Lang", off: "Aus", fst: "Wie FST" };

function startChips(anzahl) {
  const r = laufzeitRechnung(letzterStatus);
  const feld = (id) => ($(id) ? $(id).value : "");
  const chips = [["Spieler", String(anzahl)]];
  if (r.endetDurchStunde) chips.push(["Laufzeit", "ca. " + r.echtMin + " Min"]);
  else chips.push(["Laufzeit", r.laufzeit >= 300 ? "ohne Limit" : r.laufzeit + " Min"]);
  chips.push(["Tempo", r.name]);
  chips.push(["Pausen", PAUSEN_NAMEN[feld("pausePreset")] || "Ausgewogen"]);
  if (feld("filterSearchLimit")) chips.push(["Suchen je Spieler", feld("filterSearchLimit")]);
  if (feld("filterBuyLimit")) chips.push(["Käufe je Spieler", feld("filterBuyLimit")]);
  chips.push(["Gebote", $("bidSniping") && $("bidSniping").checked ? "An" : "Aus"]);
  return chips;
}

function renderStartChips(anzahl) {
  const box = $("sm-chips");
  if (!box) return;
  // Abgelaufene Live-Filter ueberspringt der Start (startPruefung, und
  // renderStartTargets zaehlt sie auch nicht): Der Chip "Spieler" darf sie
  // nicht mitzaehlen, sonst steht dort 3, wo nur 2 gesucht werden. "anzahl"
  // gilt nur, wenn die Liste hier nicht erreichbar ist (Test ohne Dialog).
  const aktiv = typeof startListe === "function" ? startListe().filter((t) => !liveAbgelaufen(t)).length : anzahl;
  box.replaceChildren(...startChips(aktiv).map(([name, wert]) => {
    const chip = document.createElement("span");
    chip.className = "setting-chip";
    const links = document.createElement("span");
    links.className = "setting-chip__label";
    links.textContent = name;
    const rechts = document.createElement("span");
    rechts.className = "setting-chip__value";
    rechts.textContent = wert;
    chip.append(links, rechts);
    return chip;
  }));
}

function startSafetyInfo() {
  const p = startPruefung(startListe());
  renderStartChips(startListe().length);
  const { hour, day, limitStunde, limitTag, plannedSearches, turbo, timeLimit, warnings, hinweise } = p;
  // Zuerst das, was der Bot selbst ablehnen wuerde: keine Session, Sperre,
  // laufender Lauf oder Check. Sonst stand hier gruen "KEINE WARNUNGEN".
  const sperre = aktuelleSperre();
  const blockers = (sperre ? [sperre] : []).concat(p.blockers);
  $("sm-activity").innerHTML = fstAn()
    ? `<div><b>${hour}</b><small>letzte Stunde · ohne Grenze</small></div><div><b>${day}</b><small>heute · ohne Grenze</small></div><div><b>${plannedSearches > 0 ? "~" + plannedSearches : "–"}</b><small>dieser Lauf</small></div>`
    : `<div><b>${hour}</b><small>von ${limitStunde} · letzte Stunde</small></div><div><b>${day}</b><small>von ${limitTag} · heute</small></div><div><b>~${plannedSearches}</b><small>dieser Lauf</small></div>`;
  const messages = blockers.concat(warnings, hinweise);
  // Rot nur, wenn der Start wirklich gesperrt ist. Warnungen sind gelb -
  // sonst sieht ein startbarer Lauf aus wie ein gesperrter.
  const gesperrt = blockers.length > 0;
  const anzahl = warnings.length + hinweise.length;
  $("sm-warning").textContent = messages.length ? messages.join(" ") : (fstAn() ? "Keine Warnungen. Es gelten nur die Stopp-Regeln aus Optionen > Grenzen." : "Die gewählten Einstellungen liegen innerhalb deiner eingebauten Schutzlimits.");
  $("sm-warning").className = gesperrt ? "hint err" : messages.length ? "hint warn" : "hint";
  // Gleiche Worte wie im Filter-Dialog.
  $("sm-safety").textContent = gesperrt ? "Start gesperrt" : anzahl ? (anzahl === 1 ? "1 Warnung" : anzahl + " Warnungen") : "Keine Warnungen";
  $("sm-safety").className = gesperrt ? "safety-err" : anzahl ? "safety-warn" : "safety-ok";
  // Der Kasten ist aufklappbar (wie bei FST). Gibt es etwas zu lesen, klappt er
  // von selbst auf - eine Warnung oder Sperre darf nicht hinter einem
  // zugeklappten Kasten stehen. Zuklappen bleibt Sache des Nutzers.
  const sicherheitsKasten = $("sm-safety-box");
  if (sicherheitsKasten && messages.length) sicherheitsKasten.open = true;
  // Die Anzeige wird alle 1,5 Sekunden neu gezeichnet (render). Ohne diese Zeile
  // klappte der Kasten jedes Mal wieder auf, auch wenn du ihn zugeklappt hast.
  sicherheitsKastenWunsch(sicherheitsKasten, messages);
  $("sm-start").disabled = blockers.length > 0;
  // Eine Rechnung fuer alle Anzeigen (28.09.2026): laufzeitRechnung() weiss,
  // wie lange eine Suche samt ihrem Anteil an den Sicherheitspausen dauert.
  // Hier standen eigene Zahlen (Pause 45 Sek. je 40 Suchen statt in Wahrheit
  // rund 128 je 45) - die Schaetzung nannte darum zu wenige Minuten. Zwei
  // Rechnungen fuer dieselbe Frage laufen auseinander, wie damals beim
  // Verkaufspreis (Bildschirm 900, Bot 1.100). Deshalb steht hier keine
  // zweite mehr.
  const secondsPerSearch = laufzeitRechnung(letzterStatus).sekundenBrutto;
  // Ist das Tempo schneller als das Stundenlimit (bei allen Profilen so), ist
  // die Stunde vor Ablauf der Laufzeit voll. Die Schaetzung nennt deshalb nur
  // die Suchen, die in DIESER Stunde noch hineinpassen.
  // 27.09.2026: Der Bot stoppt dort nicht mehr, er wartet auf die naechste
  // freie Anfrage. Die Wanduhr-Zeit kann darum laenger werden als die
  // geschaetzten Minuten - die Zahl der Suchen bleibt richtig.
  const stundenRest = 3600 / secondsPerSearch > limitStunde ? limitStunde - hour : Infinity;
  // FST-Modus: Ohne Suchgrenze je Spieler gibt es keine geplante Zahl - dann
  // bestimmt allein die Laufzeit.
  const geplant = fstAn() && !(plannedSearches > 0) ? Infinity : plannedSearches;
  const cappedSearches = Math.max(0, Math.min(geplant, limitTag - day, stundenRest, Math.floor((timeLimit || 300) * 60 / secondsPerSearch)));
  const estimatedMinutes = Math.ceil(cappedSearches * secondsPerSearch / 60);
  $("sm-estimate").textContent = "Schätzung inkl. Pausen: bis zu " + cappedSearches + " Suchen · ca. " + estimatedMinutes + " Min. Netzwerkzeiten kommen hinzu; Käufe, Grenzen je Spieler und ablaufende Live-Filter können früher stoppen.";
  return blockers.length === 0;
}

function applyStartProfile(profile) {
  const profiles = {
    safe: { speed: "safe", pause: "long", searches: 60, buys: 2 },
    balanced: { speed: "normal", pause: "medium", searches: 100, buys: 3 },
    intense: { speed: "turbo", pause: "short", searches: 150, buys: 5 }
  };
  const value = profiles[profile] || profiles.balanced;
  // Ein Schnellprofil ist eine bewusste Abweichung vom Standard - also Custom.
  setTuneMode("speed", "custom");
  setTuneMode("pause", "custom");
  setTuneMode("limits", "custom");
  $("speedMode").value = value.speed;
  $("pausePreset").value = value.pause;
  $("filterSearchLimit").value = String(value.searches);
  $("filterBuyLimit").value = String(value.buys);
  for (const button of WURZEL.querySelectorAll("#sm-profile button")) button.classList.toggle("active", button.dataset.value === profile);
  saveSettings();
  startSafetyInfo();
}

// Wen der Start sucht - an EINER Stelle, damit Anzeige und Start nie
// auseinanderlaufen. Normal: die Zielliste; ist sie leer, der Spieler oben.
// "Nur den gewaehlten suchen" (Knopf im Start-Dialog) nimmt ausschliesslich
// den Spieler oben, ohne die Liste anzufassen.
let startNurAuswahl = false;

function startListe() {
  const aktuell = currentTarget();
  if (startNurAuswahl && aktuell && aktuell.maxPrice > 0) return [aktuell];
  return targets.length ? targets : (aktuell ? [aktuell] : []);
}

// Oben gewaehlter Spieler, der NICHT in der (nicht leeren) Liste steht - der
// wuerde beim Start stillschweigend uebergangen. Genau so kaufte der Bot
// frueher den "falschen" Spieler: den aus der Liste statt den von oben.
// Steht er drin, aber oben mit anderem Preis, kommt er mit listenPreis
// zurueck: Der Start kauft dann zum Listenpreis, nicht zum Preis oben.
function auswahlFehltInListe() {
  const aktuell = currentTarget();
  if (!aktuell || !targets.length) return null;
  const eintrag = targets.find((t) => targetKey(t) === targetKey(aktuell));
  if (!eintrag) return aktuell;
  if (aktuell.maxPrice > 0 && eintrag.maxPrice !== aktuell.maxPrice) return { ...aktuell, listenPreis: eintrag.maxPrice };
  return null;
}

function renderStartTargets() {
  const list = startListe();
  const weg = list.filter(liveAbgelaufen).length; // der Start ueberspringt sie
  $("sm-summary").textContent = (list.length - weg) + " Spieler" + (weg ? " · " + weg + " abgelaufen, übersprungen" : "") +
    " · erst nach Bestätigung wird gesucht";
  $("sm-targets").replaceChildren(...list.map((t) => {
    const zeile = document.createElement("div");
    zeile.className = "sm-target";
    const name = document.createElement("b");
    name.textContent = t.playerName + (t.rating ? " (" + t.rating + ")" : " (alle Versionen)");
    // "bis" als Text davor, die Zahl in eigenem Span - nur daran setzt das
    // Stylesheet die Muenze. Sonst stand sie vor "bis" statt vor der Zahl.
    const preis = document.createElement("span");
    preis.className = "sm-price";
    const zahl = document.createElement("span");
    zahl.textContent = fmt(t.maxPrice);
    preis.append("bis ", zahl);
    zeile.append(portrait(t.playerId, t.playerName), name, preis);
    return zeile;
  }));
  const fehlt = auswahlFehltInListe();
  $("sm-mismatch").hidden = !fehlt;
  if (!fehlt) return;
  const wer = fehlt.playerName + (fehlt.rating ? " (" + fehlt.rating + ")" : "");
  if (startNurAuswahl) {
    $("sm-mismatch-text").textContent = "Es wird nur " + wer + " gesucht. Deine Liste bleibt gespeichert, wird aber diesmal nicht benutzt.";
    $("sm-only-selected").textContent = "Doch die Liste nehmen";
    $("sm-only-selected").disabled = false;
    $("sm-add-selected").hidden = true;
    return;
  }
  $("sm-mismatch-text").textContent = fehlt.listenPreis
    ? "Achtung: Für " + wer + " steht in Schritt 3 " + fmt(fehlt.maxPrice) + ", in der Liste " + fmt(fehlt.listenPreis) +
      ". Gekauft wird bis " + fmt(fehlt.listenPreis) + "."
    : "Achtung: In Schritt 1 ist " + wer + " gewählt. Er steht NICHT in der Liste und wird NICHT gekauft.";
  $("sm-only-selected").textContent = fehlt.maxPrice > 0 ? "Nur " + fehlt.playerName + " suchen" : "Erst Zielpreis in Schritt 3";
  $("sm-only-selected").disabled = !(fehlt.maxPrice > 0);
  $("sm-add-selected").hidden = false;
  // Gleicher Spieler, anderer Preis: Der Knopf ersetzt den Listenpreis.
  $("sm-add-selected").textContent = fehlt.listenPreis ? "Liste auf " + fmt(fehlt.maxPrice) + " ändern" : "Zur Liste hinzufügen";
  $("sm-add-selected").disabled = !(fehlt.maxPrice > 0) || (!fehlt.listenPreis && targets.length >= MAX_TARGETS);
}

function openStartModal() {
  startNurAuswahl = false;
  const list = startListe();
  if (!list.length) {
    notice = "Wähle zuerst einen Spieler und einen Zielpreis.";
    render(lastRes || { ok: false, error: notice });
    return;
  }
  renderStartTargets();
  // Budget und Max. Kaeufe stehen in Schritt 4 - hier nur zur Kontrolle.
  //
  // Seit 27.09.2026 sollte dabei auch der Mindestgewinn stehen. Er wurde
  // berechnet und dann weggeworfen: Die Zeile stand nie im Text. Am 28.09.
  // beim Nachmessen aufgefallen - genau die Art Fehler, die eine
  // Commit-Meldung behauptet und niemand nachprueft.
  //
  // Der Mindestgewinn ist die Zahl, die entscheidet, ob ein Filter ueberhaupt
  // kauft. Sie gehoert in das Fenster, in dem man auf "Start" drueckt.
  const mindest = $("smartProfit").checked
    ? "Auto-Gewinn (passt sich der Preisklasse an)"
    : "Mindestgewinn " + fmt(Number($("minProfit").value) || 0) + " Coins";
  // Leeres Feld: keine erfundene 0 anzeigen (28.09.2026).
  $("sm-budget-info").textContent = (budgetOhneGrenze()
      ? "Budget ohne Grenze (dein Kontostand bremst)"
      : "Budget " + fmt(Number($("budget").value) || 0) +
        (budgetAuto ? " Coins (Auto: dein ganzes Guthaben)" : " Coins")) +
    " · " + (String($("maxBuys").value).trim() === ""
      ? "Käufe ohne eigene Grenze"
      : "höchstens " + (Number($("maxBuys").value) || 0) + " Käufe") +
    " · " + mindest + " · aus Schritt 4";
  for (const button of WURZEL.querySelectorAll("#sm-profile button")) button.classList.remove("active");
  renderTuneRows();
  sicherheitsKastenNeu($("sm-safety-box")); // ein neuer Dialog fragt neu, was der Nutzer will
  focusBeforeModal = WURZEL.activeElement;
  $("start-modal-wrap").hidden = false;
  $("sm-start").focus();
  // In der Leiste steht der Dialog im Menue statt darueber - sein Anfang
  // liegt oben, nicht dort, wo gerade hingescrollt war.
  nachObenScrollen();
  startSafetyInfo();
}

$("start").addEventListener("click", openStartModal);
$("sm-close").addEventListener("click", closeStartModal);
$("sm-cancel").addEventListener("click", closeStartModal);
$("start-modal-wrap").addEventListener("click", (event) => { if (event.target === $("start-modal-wrap")) closeStartModal(); });

// Escape schliesst den obersten Dialog. Ohne das bleibt nur der Klick auf das
// Schliessen-Kreuz oder den Hintergrund - bei Tastaturbedienung sitzt man fest.
// An WURZEL statt document: In der Seite faengt die Schattenwurzel die Taste
// dort, wo sie hingehoert - und Escape im Rest der EA-Seite geht uns nichts an.
WURZEL.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if ($("heute-blatt") && !$("heute-blatt").hidden) {
    event.preventDefault();
    blattSchliessen("heute-blatt");
  } else if ($("sammlungen-blatt") && !$("sammlungen-blatt").hidden) {
    event.preventDefault();
    blattSchliessen("sammlungen-blatt");
  } else if ($("markt-detail") && !$("markt-detail").hidden) {
    event.preventDefault();
    marktDetailSchliessen();
  } else if (!$("start-modal-wrap").hidden) {
    event.preventDefault();
    closeStartModal();
  } else if (!$("filter-modal-wrap").hidden) {
    event.preventDefault();
    closeFilterModal();
  }
});
for (const button of WURZEL.querySelectorAll("#sm-profile button")) button.addEventListener("click", () => applyStartProfile(button.dataset.value));

// Die Felder gehoeren jetzt nur noch hierher - nichts wird mehr hin- und
// herkopiert. Aenderungen wirken sofort auf Sicherheitsampel und Schaetzung.
for (const id of ["filterSearchLimit", "filterBuyLimit", "filterAnfrageLimit", "filterSpendLimit", "timeLimitMin"]) {
  $(id).addEventListener("input", () => { saveSettings(); startSafetyInfo(); });
}
for (const id of ["speedMode", "pausePreset", "bidSeconds"]) {
  $(id).addEventListener("change", () => {
    for (const profile of WURZEL.querySelectorAll("#sm-profile button")) profile.classList.remove("active");
    saveSettings();
    startSafetyInfo();
  });
}
$("bidSniping").addEventListener("change", () => { saveSettings(); startSafetyInfo(); });

$("sm-start").addEventListener("click", async () => {
  if (!startSafetyInfo()) return;
  await saveSettings();
  // Liste VOR dem Schliessen festhalten: closeStartModal setzt "nur den
  // gewaehlten suchen" zurueck, danach waere es wieder die Zielliste.
  const liste = startNurAuswahl ? startListe() : undefined;
  closeStartModal();
  await startRun(liste);
});

$("sm-only-selected").addEventListener("click", () => {
  startNurAuswahl = !startNurAuswahl;
  renderStartTargets();
  startSafetyInfo();
});
$("sm-add-selected").addEventListener("click", () => {
  addTarget();
  startNurAuswahl = false;
  renderStartTargets();
  startSafetyInfo();
});

// Nur den laufenden Filter beenden (25.09.2026). rotationAbbruch bleibt
// bewusst FALSCH - sonst stiege die Rotationsschleife aus und der Knopf waere
// ein zweiter Stopp-Knopf. Die Schleife wartet ohnehin auf "kein Lauf mehr",
// sieht dann den Code "filter" und macht mit dem naechsten Filter weiter.
if ($("naechsterFilter")) {
  $("naechsterFilter").addEventListener("click", async () => {
    notice = null;
    render(await send("naechsterFilter"));
  });
}

$("stop").addEventListener("click", async () => {
  rotationAbbruch = true; // die Rotation soll sofort aussteigen
  notice = null;
  render(await send("stop"));
});

// "Weiter einstellen": erst dieser Klick raeumt die Zusammenfassung weg und
// holt die Einstellungen zurueck (25.09.2026).
if ($("hud-ende-zu")) {
  $("hud-ende-zu").addEventListener("click", () => {
    laufEndeOffen = false;
    renderLiveHud(letzterStatus);
  });
}

// ---------------------------------------------------------------------------
// Sammlungen: Ziellisten speichern und wiederverwenden
// Beim Sichern werden Live-Filter-Merkmale abgestreift. Ein Live-Filter
// verfaellt nach 15 Minuten - eine gespeicherte Sammlung waere sonst schon
// beim naechsten Laden abgelaufen und wuerde den Start blockieren.
// ---------------------------------------------------------------------------

const MAX_COLLECTIONS = 20;
let collections = {};

// ---------------------------------------------------------------------------
// Profil = der Einstellungs-Satz, den eine Sammlung seit dem 25.09.2026
// zusaetzlich zur Spielerliste mitfuehrt.
// Warum: Ein Wechsel der Handelsart hiess bisher, jedes Feld einzeln
// umzustellen. Ein uebersehenes Feld faellt dabei nicht auf.
// Was NICHT ins Profil gehoert: Rating, Kartenart und Zielpreis des gerade
// gewaehlten Spielers. Die stecken schon in der Zielliste; im Profil wuerden
// sie beim Laden die Liste ueberschreiben.
// ---------------------------------------------------------------------------
// fstModus (01.10.2026): globaler Schalter - er darf nicht in Sammlungen wandern.
const PROFIL_AUS = ["rating", "rarity", "maxPrice", "rarity-wahl", "fstModus"];

function profilLesen() {
  const profil = {};
  for (const feld of NUMBER_FIELDS) if (!PROFIL_AUS.includes(feld) && $(feld)) profil[feld] = $(feld).value;
  for (const feld of CHECK_FIELDS) if (!PROFIL_AUS.includes(feld) && $(feld)) profil[feld] = $(feld).checked;
  for (const feld of SELECT_FIELDS) if (!PROFIL_AUS.includes(feld) && $(feld)) profil[feld] = $(feld).value;
  profil.afterBuy = afterBuyValue();
  // Der Budget-Schalter gehoert mit ins Profil (27.09.2026). Ohne ihn kaeme eine
  // Sammlung mit festem Budget zurueck, und der Auto-Modus wuerde es in der
  // naechsten Sekunde wieder ueberschreiben - der gespeicherte Wert waere still
  // verloren.
  profil.budgetAuto = budgetAuto;
  return profil;
}

// Beim Lesen aus dem Speicher: nur bekannte Felder, jedes in seiner Art.
// Eine von Hand veraenderte Sicherungsdatei kann so nichts Fremdes
// hereinbringen.
function profilPruefen(roh) {
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) return null;
  const profil = {};
  for (const feld of NUMBER_FIELDS) if (!PROFIL_AUS.includes(feld) && roh[feld] != null) profil[feld] = String(roh[feld]).slice(0, 12);
  for (const feld of CHECK_FIELDS) if (!PROFIL_AUS.includes(feld) && roh[feld] != null) profil[feld] = roh[feld] === true;
  for (const feld of SELECT_FIELDS) if (!PROFIL_AUS.includes(feld) && typeof roh[feld] === "string") profil[feld] = roh[feld].slice(0, 40);
  if (AFTER_BUY_VALUES.includes(roh.afterBuy)) profil.afterBuy = roh.afterBuy;
  if (roh.budgetAuto != null) profil.budgetAuto = roh.budgetAuto === true;
  return Object.keys(profil).length ? profil : null;
}

// Profil in die Maske schreiben. Jede Zahl wird auf min und max des Feldes
// geklemmt und das Klemmen wird GEMELDET. Stillschweigend eine Pause
// verkuerzen waere genau der Fehler, der eine Sperre kostet.
function profilAnwenden(profil) {
  const geklemmt = [];
  for (const feld of NUMBER_FIELDS) {
    const el = $(feld);
    if (!el || PROFIL_AUS.includes(feld) || profil[feld] == null) continue;
    let wert = String(profil[feld]);
    const zahl = Number(wert);
    if (wert.trim() !== "" && Number.isFinite(zahl)) {
      let neu = zahl;
      const min = Number(el.min), max = Number(el.max);
      if (el.min !== "" && Number.isFinite(min) && neu < min) neu = min;
      if (el.max !== "" && Number.isFinite(max) && neu > max) neu = max;
      if (neu !== zahl) geklemmt.push(feld);
      wert = String(neu);
    }
    el.value = wert;
  }
  for (const feld of CHECK_FIELDS) {
    const el = $(feld);
    if (el && !PROFIL_AUS.includes(feld) && profil[feld] != null) el.checked = profil[feld] === true;
  }
  for (const feld of SELECT_FIELDS) {
    const el = $(feld);
    if (!el || PROFIL_AUS.includes(feld) || profil[feld] == null) continue;
    el.value = profil[feld];
    // Ein gespeicherter Wert, den es nicht mehr gibt, liesse das Feld leer -
    // dann zeigt der Browser stumm den ersten Eintrag.
    if (el.value !== profil[feld]) el.value = DEFAULTS[feld];
  }
  if (profil.afterBuy) setAfterBuy(profil.afterBuy);
  // Aeltere Sammlungen kennen den Budget-Schalter nicht. Sie haben ein festes
  // Budget gespeichert - fuer sie gilt also "Eigene", damit genau diese Zahl
  // stehen bleibt (27.09.2026).
  budgetAuto = profil.budgetAuto === true;
  renderBudgetMode();
  return geklemmt;
}

function collectionName(roh) {
  const name = typeof roh === "string" ? roh.trim().replace(/\s+/g, " ").slice(0, 40) : "";
  return /^[\wÄÖÜäöüß0-9 .,:+&()-]{1,40}$/.test(name) ? name : "";
}

// Eine Sammlung ist seit dem 25.09.2026 { ziele, einstellungen }. Aeltere
// Sammlungen sind eine blosse Liste - die muessen weiter gelesen werden,
// sonst waeren sie beim ersten Start still verschwunden.
async function loadCollections() {
  const { collections: gespeichert } = await chrome.storage.local.get("collections");
  collections = {};
  if (gespeichert && typeof gespeichert === "object" && !Array.isArray(gespeichert)) {
    for (const [name, wert] of Object.entries(gespeichert)) {
      const sauber = collectionName(name);
      const objekt = Boolean(wert) && typeof wert === "object" && !Array.isArray(wert);
      const ziele = sanitizeTargets(Array.isArray(wert) ? wert : objekt ? wert.ziele : null);
      const einstellungen = objekt ? profilPruefen(wert.einstellungen) : null;
      // Seit 27.09.2026 zaehlt eine Sammlung auch ohne Spieler, wenn sie
      // Einstellungen hat. Vorher fiel sie beim naechsten Laden still heraus -
      // der Nutzer haette sie gesichert und nie wiedergesehen.
      if (sauber && (ziele.length || einstellungen)) collections[sauber] = { ziele, einstellungen };
    }
  }
  renderCollections();
}

function renderCollections() {
  const namen = Object.keys(collections).sort((a, b) => a.localeCompare(b, "de"));
  const gewaehlt = $("collection-pick").value;
  const leer = document.createElement("option");
  leer.value = "";
  leer.textContent = namen.length ? "— auswählen —" : "— noch keine —";
  const optionen = namen.map((name) => {
    const o = document.createElement("option");
    o.value = name;
    o.textContent = name + " (" + collections[name].ziele.length +
      (collections[name].einstellungen ? ", mit Einstellungen" : "") + ")";
    return o;
  });
  $("collection-pick").replaceChildren(leer, ...optionen);
  if (namen.includes(gewaehlt)) $("collection-pick").value = gewaehlt;
  const etwasGewaehlt = Boolean($("collection-pick").value);
  // Eine Sammlung ohne Spieler (seit 27.09.2026 erlaubt) kann "Nur Spieler"
  // nicht bedienen: Der Knopf wuerde die Zielliste leeren und nichts hinlegen.
  // Lieber gesperrt und gesagt, warum.
  const mitSpielern = etwasGewaehlt && collections[$("collection-pick").value].ziele.length > 0;
  $("collection-load").disabled = !mitSpielern;
  $("collection-load").title = !etwasGewaehlt ? "" : mitSpielern
    ? "Lädt nur die Spielerliste. Die Einstellungen bleiben, wie sie sind."
    : "Diese Sammlung wurde ohne Spieler gesichert – hier gibt es keine Liste zu laden.";
  $("collection-delete").disabled = !etwasGewaehlt;
  // Den zweiten Knopf nur anbieten, wenn wirklich Einstellungen dabei sind -
  // sonst wuerde er stillschweigend nichts tun.
  const eintrag = etwasGewaehlt ? collections[$("collection-pick").value] : null;
  const mitProfil = Boolean(eintrag && eintrag.einstellungen);
  $("collection-load-all").disabled = !mitProfil;
  $("collection-load-all").title = mitProfil
    ? "Lädt die Spieler und den gespeicherten Einstellungs-Satz."
    : "Diese Sammlung wurde ohne Einstellungen gesichert.";
}

function collectionMessage(text, art) {
  $("collection-msg").textContent = text;
  $("collection-msg").className = "hint" + (art ? " " + art : "");
}

$("collection-pick").addEventListener("change", renderCollections);

$("collection-save").addEventListener("click", async () => {
  const name = collectionName($("collection-name").value);
  if (!name) return collectionMessage("Bitte einen Namen eintragen (Buchstaben, Zahlen, Leerzeichen).", "err");
  // Seit 27.09.2026 geht auch eine Sammlung OHNE Spieler - nur der
  // Einstellungs-Satz. FST kann das als "Save preset" (scripts.js Z. 41212).
  // Vorher musste man erst irgendeinen Spieler dazulegen, nur um "mein
  // vorsichtiger Satz" zu sichern.
  // Damit nichts still verschwindet, wird beim Laden unterschieden: Eine
  // Sammlung ohne Spieler laesst die Zielliste stehen, und "Nur Spieler" ist
  // bei ihr gesperrt (siehe renderCollections und collection-load-all).
  // Eine Sperre braucht es hier nicht mehr: Der Einstellungs-Satz ist immer da,
  // es wird also immer etwas gesichert.
  if (!collections[name] && Object.keys(collections).length >= MAX_COLLECTIONS) {
    return collectionMessage("Mehr als " + MAX_COLLECTIONS + " Sammlungen gehen nicht. Lösch erst eine.", "err");
  }
  const vorhanden = Boolean(collections[name]);
  // Ohne Live-Merkmale sichern: sonst ist die Sammlung beim Laden abgelaufen.
  // Seit 25.09.2026 wandert auch der Einstellungs-Satz mit (Profil), damit ein
  // Wechsel der Handelsart ein Klick ist und kein Feld vergessen wird.
  collections[name] = {
    ziele: targets.map((t) => ({
      // Die Kartenart gehoert mitgesichert (25.09.2026, fuenftes Exemplar
      // desselben Fehlers). Ohne sie kommt eine gespeicherte Sammlung als
      // "jede Version" zurueck - der Bot sucht dann ueber alle Kartenarten und
      // kauft die billigste zum Preis der Sonderkarte. Eine Sammlung liegt
      // wochenlang; der Fehler faellt erst beim Laden auf, und dann sieht es
      // aus wie ein Fehler beim Laden.
      playerId: t.playerId, playerName: t.playerName, rating: t.rating,
      // Mehrere Kartenarten (28.09.2026): auch in der Sammlung als Liste
      // erhalten - sonst kaeme sie als "jede Art" zurueck (die Falle vom
      // 25.09., sechstes Exemplar).
      rarity: rarityWert(t.rarity),
      maxPrice: t.maxPrice,
      salePrice: t.salePrice || 0, position: t.position || "", rare: t.rare || 0, cardType: t.cardType || "",
      // Der feste Verkaufspreis der Zeile gehoert mitgesichert (28.09.2026) -
      // sonst kommt die Sammlung ohne ihn zurueck (dasselbe Loch wie damals
      // bei der Kartenart).
      listFestpreis: Number(t.listFestpreis) >= VERKAUF_MIN_PREIS ? Math.floor(Number(t.listFestpreis)) : 0,
      source: "manual", filterId: "", score: 0, expiresAt: 0
    })),
    einstellungen: profilLesen()
  };
  await chrome.storage.local.set({ collections });
  $("collection-name").value = "";
  renderCollections();
  $("collection-pick").value = name;
  renderCollections();
  const anzahl = collections[name].ziele.length;
  collectionMessage((vorhanden ? "Überschrieben" : "Gesichert") + ": " + name + " – " +
    (anzahl
      ? "mit " + anzahl + " Spielern und deinen jetzigen Einstellungen."
      : "nur deine Einstellungen, ohne Spieler. Beim Laden bleibt deine Zielliste unberührt."), "ok");
});

// Nur die Spielerliste. Die Einstellungen bleiben absichtlich stehen - wer
// bloss eine andere Liste will, soll nicht ungefragt anders handeln.
$("collection-load").addEventListener("click", async () => {
  const name = $("collection-pick").value;
  const eintrag = collections[name];
  if (!eintrag) return;
  targets = sanitizeTargets(eintrag.ziele);
  await saveSettings();
  renderTargets(true);
  renderStep();
  // Ehrlich sagen, was der Start nachprueft - hoechstens MAX_AUTO_CHECKS.
  const alt = altePreise(targets).length;
  const geladen = "Geladen: " + name + " mit " + targets.length + " Spielern.";
  if (!alt) collectionMessage(geladen, "ok");
  else if (!$("autoCheckOnStart").checked) {
    collectionMessage(geladen + " " + (alt === 1 ? "1 Preis ist" : alt + " Preise sind") + " älter als 15 Minuten. Prüfe mit „Preis prüfen“ in der Liste.", "warn");
  } else if (alt > maxAutoChecks()) {
    collectionMessage(geladen + " " + alt + " Preise sind älter als 15 Minuten. Der Start prüft höchstens " + maxAutoChecks() +
      " selbst nach – prüfe die übrigen vorher mit „Preis prüfen“ in der Liste.", "warn");
  } else collectionMessage(geladen + " " + (alt === 1 ? "Den alten Preis" : "Die " + alt + " alten Preise") + " prüft der Bot vor dem Start nach.", "ok");
});

// Spieler UND Einstellungen. Jede Zahl geht dabei durch profilAnwenden und
// wird auf min/max des Feldes geklemmt; was angehoben oder gekappt wurde,
// steht danach im Hinweis. Ein stilles Anheben waere hier das Gefaehrliche.
$("collection-load-all").addEventListener("click", async () => {
  const name = $("collection-pick").value;
  const eintrag = collections[name];
  if (!eintrag || !eintrag.einstellungen) return;
  // Eine Sammlung ohne Spieler (seit 27.09.2026 moeglich) laesst die Zielliste in
  // Ruhe. Sie mit einer leeren Liste zu ueberschreiben waere ein stiller Verlust:
  // Der Nutzer wollte nur seinen Einstellungs-Satz zurueckholen.
  const mitSpielern = eintrag.ziele.length > 0;
  if (mitSpielern) targets = sanitizeTargets(eintrag.ziele);
  const geklemmt = profilAnwenden(eintrag.einstellungen);
  await saveSettings();
  renderProfitSetting();
  tonLautstaerkeZeigen();
  renderAutoModus();
  syncAutoBudget();
  renderAutoEinstellungen();
  renderTargets(true);
  renderStep();
  collectionMessage("Geladen: " + name + " – " +
    (mitSpielern
      ? targets.length + " Spieler und die gespeicherten Einstellungen."
      : "nur die Einstellungen. Diese Sammlung hat keine Spieler; deine Zielliste (" + targets.length + ") bleibt unverändert.") +
    (geklemmt.length ? " In den erlaubten Bereich zurückgeholt: " + geklemmt.join(", ") + "." : ""),
    geklemmt.length ? "warn" : "ok");
});

$("collection-delete").addEventListener("click", async () => {
  const name = $("collection-pick").value;
  if (!collections[name]) return;
  delete collections[name];
  await chrome.storage.local.set({ collections });
  $("collection-pick").value = "";
  renderCollections();
  collectionMessage("Gelöscht: " + name, "");
});

// ---------------------------------------------------------------------------
// Geführter Ablauf im Snipen-Tab
// Statt vier Bloecke gleichzeitig immer nur einen. Weiter ist gesperrt,
// solange der Schritt nicht erledigt ist - so kann kein Lauf ohne Spieler
// oder ohne Zielpreis entstehen.
// ---------------------------------------------------------------------------

const STEP_COUNT = 5;
let step = 1;

// Pro Schritt: Ist er erledigt? Wenn nein, warum nicht?
function stepBlocker(nummer) {
  if (nummer === 1) {
    if (!selected) return players.length
      ? "Wähle zuerst einen Spieler aus der Vorschlagsliste."
      : SPIELERLISTE_FEHLT;
    return null;
  }
  if (nummer === 2) {
    // Der Preis-Check ist freiwillig - ohne ihn fehlt aber die Grundlage
    // fuer einen sinnvollen Zielpreis, deshalb der Hinweis statt einer Sperre.
    return null;
  }
  if (nummer === 3) {
    const ziel = Number($("maxPrice").value) || 0;
    if (!targets.length && !(ziel > 0)) return "Trag einen Zielpreis ein oder nimm den Spieler in die Liste.";
    return null;
  }
  if (nummer === 4) {
    const budget = Number($("budget").value) || 0;
    const kaeufe = Number($("maxBuys").value) || 0;
    // Leer ist seit 28.09.2026 erlaubt: "ohne Grenze - dein Kontostand
    // bremst" (wie FST). Nur eine ECHTE 0 bleibt ein Fehler.
    if (!budgetOhneGrenze() && !(budget > 0)) return "Trag ein Budget ein – oder lass das Feld leer für „ohne Grenze“.";
    // Leer ist seit 27.09.2026 erlaubt und heisst "ohne eigene Grenze".
    if (String($("maxBuys").value).trim() !== "" && !(kaeufe >= 1)) {
      return "Trag bei Max. Käufe eine Zahl ab 1 ein – oder lass das Feld leer für „ohne Grenze“.";
    }
    return null;
  }
  return null;
}

const STEP_INTRO = {
  1: "Wen soll der Bot suchen?",
  2: "Was ist der Spieler gerade wert?",
  3: "Bis zu welchem Preis darf gekauft werden?",
  4: "Wie viel darf der ganze Lauf kosten?",
  5: "Was soll mit jedem gekauften Spieler passieren?"
};

function renderStep() {
  for (const block of WURZEL.querySelectorAll("#view-snipe .block[data-step]")) {
    block.hidden = Number(block.dataset.step) !== step;
  }
  for (const punkt of WURZEL.querySelectorAll("#step-bar li")) {
    const nummer = Number(punkt.dataset.step);
    punkt.classList.toggle("now", nummer === step);
    punkt.classList.toggle("done", nummer < step);
    // Erledigte Schritte anklickbar machen. Die Leiste sieht aus wie die
    // Reiterreihe darueber, also muss sie sich auch so verhalten - beim
    // Durchklicken bin ich selbst daran haengengeblieben. Nur zurueck:
    // vorwaerts wuerde die Pruefung je Schritt ueberspringen.
    const erreichbar = nummer < step;
    punkt.classList.toggle("klickbar", erreichbar);
    punkt.tabIndex = erreichbar ? 0 : -1;
    if (erreichbar) {
      punkt.setAttribute("role", "button");
      punkt.title = "Zurück zu Schritt " + nummer;
    } else {
      punkt.removeAttribute("role");
      punkt.removeAttribute("title");
    }
  }
  $("step-intro").textContent = STEP_INTRO[step] || "";
  $("step-back").disabled = step === 1;
  renderStepNext();
}

// Weiter-Knopf und die Zeile darueber. Im letzten Schritt oeffnet er den
// Start - dort zaehlt auch die Start-Sperre, nicht nur der Schritt selbst.
// Eigene Funktion, weil render() sie bei jedem Poll aufruft.
function renderStepNext() {
  const grund = stepBlocker(step) || (step === STEP_COUNT ? aktuelleSperre() : "");
  $("step-block").textContent = grund || "";
  $("step-block").className = grund ? "hint warn" : "hint";
  $("step-next").disabled = Boolean(grund);
  $("step-next").textContent = step === STEP_COUNT ? "Sniping vorbereiten" : "Weiter";
}

function goToStep(nummer) {
  step = Math.min(STEP_COUNT, Math.max(1, nummer));
  renderStep();
  // NICHT scrollIntoView: Die Kopfzeile klebt oben (position: sticky). Das
  // Ziel landet dann HINTER ihr - beim Durchklicken waren nach "Weiter"
  // sowohl die Fortschrittsleiste als auch die Frage zum Schritt weg.
  // Ganz nach oben ist hier richtig: Dort beginnt der Ablauf ohnehin.
  nachObenScrollen();
}

function nachObenScrollen() {
  const behaelter = WURZEL === document ? document.scrollingElement || document.body : WURZEL.host;
  if (behaelter && typeof behaelter.scrollTo === "function") behaelter.scrollTo({ top: 0 });
}

// Ein Horcher fuer die ganze Leiste statt fuenf einzelne: renderStep zeichnet
// die Punkte staendig neu, einzelne Horcher muesste man jedes Mal neu setzen.
$("step-bar").addEventListener("click", (event) => {
  const punkt = event.target.closest("li.klickbar");
  if (punkt) goToStep(Number(punkt.dataset.step));
});
$("step-bar").addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const punkt = event.target.closest("li.klickbar");
  if (!punkt) return;
  event.preventDefault(); // sonst scrollt die Leertaste die Seite
  goToStep(Number(punkt.dataset.step));
});

$("step-back").addEventListener("click", () => goToStep(step - 1));
$("step-next").addEventListener("click", () => {
  if (stepBlocker(step)) return;
  if (step < STEP_COUNT) goToStep(step + 1);
  else if (!aktuelleSperre()) openStartModal(); // letzter Schritt: ab in die Zusammenfassung
  else renderStepNext(); // gesperrt: Grund zeigen statt Dialog
});

// Eingaben koennen einen Schritt erledigen - dann muss Weiter aufgehen.
for (const id of ["maxPrice", "budget", "maxBuys", "playerName", "rating", "rarity"]) {
  const el = $(id);
  if (el) el.addEventListener("input", renderStep);
}

for (const el of WURZEL.querySelectorAll('input[name="afterBuy"]')) {
  el.addEventListener("change", saveSettings);
}

// ---------------------------------------------------------------------------
// EA-Endpunkte
// Gespeichert unter "endpoints". Das Content-Script prueft jeden Wert selbst
// und faellt bei Unsinn auf den Standard zurueck - hier wird nur gesammelt.
// ---------------------------------------------------------------------------

// clubParam kam am 28.09.2026 dazu: Der Adressname des Vereins-Filters ist
// als einziger geraten (content.js ENDPOINT_DEFAULTS). Sobald die
// Ablese-Hilfe unten den echten Namen zeigt, laesst er sich hier eintragen -
// ohne Code-Aenderung und ohne Update.
const ENDPOINT_FIELDS = ["searchPath", "idParam", "maxBuyParam", "minBuyParam", "maxBidParam",
  "ovrMinParam", "ovrMaxParam", "clubParam", "bidPath", "bidMethod", "clubPath", "clubMethod"];

async function loadEndpoints() {
  const { endpoints } = await chrome.storage.local.get("endpoints");
  for (const key of ENDPOINT_FIELDS) {
    const el = $("ep-" + key);
    if (el) el.value = endpoints && typeof endpoints[key] === "string" ? endpoints[key] : "";
  }
}

async function saveEndpoints() {
  const werte = {};
  for (const key of ENDPOINT_FIELDS) {
    const el = $("ep-" + key);
    const v = el ? el.value.trim() : "";
    if (v) werte[key] = v;
  }
  await chrome.storage.local.set({ endpoints: werte });
  // Was der Bot davon wirklich uebernommen hat, kommt aus dem Status zurueck.
  const res = await send("status");
  const st = res && res.status;
  if (!st || !st.endpoints) {
    $("ep-msg").className = "hint";
    $("ep-msg").textContent = "Gespeichert. Der Bot übernimmt es beim nächsten Verbinden.";
    return;
  }
  const verworfen = ENDPOINT_FIELDS.filter((k) => werte[k] && st.endpoints[k] !== werte[k]);
  if (verworfen.length) {
    $("ep-msg").className = "hint err";
    $("ep-msg").textContent = "Verworfen, Standard bleibt aktiv: " + verworfen.join(", ") +
      ". Pfade beginnen mit /, der Gebotspfad braucht {id}, Methoden sind GET, POST, PUT oder DELETE.";
    return;
  }
  const abweichend = Array.isArray(st.endpointsChanged) ? st.endpointsChanged : [];
  $("ep-msg").className = "hint ok";
  $("ep-msg").textContent = abweichend.length
    ? "Aktiv, abweichend vom Standard: " + abweichend.join(", ")
    : "Aktiv – alle Werte entsprechen dem Standard.";
}

for (const key of ENDPOINT_FIELDS) {
  const el = $("ep-" + key);
  if (el) el.addEventListener("change", saveEndpoints);
}

$("ep-reset").addEventListener("click", async () => {
  for (const key of ENDPOINT_FIELDS) {
    const el = $("ep-" + key);
    if (el) el.value = "";
  }
  await saveEndpoints();
});

// Ablese-Hilfe (28.09.2026): zeigt die Feldnamen aus EAs EIGENER letzter
// Suche. Damit laesst sich der geratene Vereins-Name endlich messen: In EAs
// Maske einen Verein waehlen, suchen, dann hier ablesen. Kostet keine
// EA-Anfrage - content.js liest nur die Ladeliste der Seite.
$("ep-ablesen").addEventListener("click", async () => {
  const zeile = $("ep-ablesen-zeile");
  zeile.className = "hint";
  zeile.textContent = "Lese …";
  const res = await send("suchadresse");
  if (!res || !res.ok) {
    zeile.className = "hint warn";
    zeile.textContent = (res && res.error) || "Keine Antwort aus dem EA-Tab. Ist die Web App offen?";
    return;
  }
  const felder = Array.isArray(res.felder) ? res.felder : [];
  // Liess sich die Adresse nicht zerlegen, ist die Feldliste leer - und dann
  // waere "kein Feld club dabei, trag einen anderen Namen ein" ein falscher Rat
  // (28.09.2026). Also ehrlich sagen, dass die Messung misslang.
  if (!felder.length) {
    zeile.className = "hint warn";
    zeile.textContent = "Die Adresse ließ sich nicht zerlegen – Web App neu laden, die Suche wiederholen, dann noch einmal ablesen.";
    return;
  }
  const club = felder.find((f) => String(f).startsWith(res.clubName + "="));
  zeile.className = club ? "hint ok" : "hint warn";
  zeile.textContent = "EAs letzte eigene Suche: " + felder.join(" · ") +
    (club
      ? " — Feld „" + res.clubName + "“ ist dabei: unser Name stimmt."
      : " — kein Feld „" + res.clubName + "“ dabei. War ein Verein gewählt? Dann steht seine Nummer hinter einem anderen Feldnamen – genau den oben bei „Vereins-Filter“ eintragen.");
});

loadEndpoints();

// ---------------------------------------------------------------------------
// Sicherung: alles in eine Datei, alles zurueck (25.09.2026)
//
// Warum ueberhaupt: Geht das Browser-Profil verloren, sind Ziellisten,
// Sammlungen, Preis-Gedaechtnis und Einstellungen weg. FST hat dafuer seinen
// Server; wir kommen mit einer Datei aus und bleiben ohne fremden Rechner.
//
// Warum die Tabu-Liste: Sperre, Abkuehlzeit und Verbrauchszaehler duerfen
// NICHT in die Datei. Sonst koennte man eine alte Sicherung zurueckspielen
// und damit eine laufende EA-Sperre, die wachsende Wartezeit, die Filter-
// Abkuehlung, den Tageszaehler und eine Ausnahme vom Tageslimit loeschen.
// Die Liste wirkt doppelt: diese Schluessel wandern nicht hinaus UND werden
// beim Einlesen nicht angenommen - auch nicht aus einer von Hand gebauten
// Datei, denn angenommen wird nur, was in SICHERUNG_PRUEFER steht.
// ---------------------------------------------------------------------------

const SICHERUNG_TABU = ["botBesitzer", "safetyUsage", "safetyCooldown", "sperrVorfaelle", "limitAusnahme", "filterAbkuehlung"];

const istObjekt = (w) => Boolean(w) && typeof w === "object" && !Array.isArray(w);
const nurObjekt = (w) => (istObjekt(w) ? w : null);
const nurListe = (w) => (Array.isArray(w) ? w : null);

// Nur bekannte Felder, und jedes in seiner Art. Die echten Grenzen prueft
// content.js beim Start ohnehin ein zweites Mal - hier geht es darum, dass
// gar nichts Fremdes in den Speicher kommt.
function pruefeSicherungSettings(roh, mitSpieler) {
  if (!istObjekt(roh)) return null;
  const sauber = {};
  for (const feld of NUMBER_FIELDS) if (roh[feld] != null) sauber[feld] = String(roh[feld]).slice(0, 12);
  for (const feld of CHECK_FIELDS) if (roh[feld] != null) sauber[feld] = roh[feld] === true;
  for (const feld of SELECT_FIELDS) if (typeof roh[feld] === "string") sauber[feld] = roh[feld].slice(0, 40);
  if (AFTER_BUY_VALUES.includes(roh.afterBuy)) sauber.afterBuy = roh.afterBuy;
  if (roh.budgetAuto != null) sauber.budgetAuto = roh.budgetAuto === true;
  if (!mitSpieler) return Object.keys(sauber).length ? sauber : null;
  sauber.playerName = typeof roh.playerName === "string" ? roh.playerName.slice(0, 60) : "";
  sauber.playerId = /^\d{0,12}$/.test(String(roh.playerId == null ? "" : roh.playerId)) ? String(roh.playerId == null ? "" : roh.playerId) : "";
  sauber.playerRating = /^\d{0,3}$/.test(String(roh.playerRating == null ? "" : roh.playerRating)) ? String(roh.playerRating == null ? "" : roh.playerRating) : "";
  sauber.targets = sanitizeTargets(roh.targets);
  sauber.laufzeitV2 = true; // Umstellung 300 -> 30 Min. bleibt erledigt
  // Der Rotations-Merker wird uebernommen, nicht gesetzt: Eine alte Sicherung
  // kennt ihn nicht und wird deshalb beim Laden umgestellt. Eine neue bringt
  // ihn mit, und dann bleiben ihre Zahlen, wie sie sind.
  if (roh.rotationV2 != null) sauber.rotationV2 = roh.rotationV2 === true;
  // Dasselbe fuer den FST-Modus (01.10.2026): Eine alte Sicherung ohne Merker
  // wird beim Laden umgestellt, eine neue behaelt ihre Zahlen.
  if (roh.fstModusV1 != null) sauber.fstModusV1 = roh.fstModusV1 === true;
  return sauber;
}

// Sammlungen gibt es in zwei Formen: frueher nur die Spielerliste, seit den
// Profilen ein Objekt mit Zielen und Einstellungen. Beide werden angenommen,
// und beide behalten ihre Form - sonst ginge beim Zurueckspielen still etwas
// verloren.
function pruefeSicherungCollections(roh) {
  if (!istObjekt(roh)) return null;
  const sauber = {};
  let anzahl = 0;
  for (const [name, wert] of Object.entries(roh)) {
    if (anzahl >= MAX_COLLECTIONS) break;
    const schluessel = collectionName(name);
    const ziele = sanitizeTargets(Array.isArray(wert) ? wert : istObjekt(wert) ? wert.ziele : null);
    // Auch beim Zurueckspielen einer Sicherung darf eine Sammlung ohne Spieler
    // nicht verschwinden, wenn Einstellungen darin stehen (27.09.2026).
    const gesichert = istObjekt(wert) ? pruefeSicherungSettings(wert.einstellungen, false) : null;
    if (!schluessel || (!ziele.length && !gesichert)) continue;
    sauber[schluessel] = Array.isArray(wert) ? ziele : { ziele, einstellungen: gesichert };
    anzahl++;
  }
  return sauber;
}

function pruefeSicherungEndpoints(roh) {
  if (!istObjekt(roh)) return null;
  const sauber = {};
  for (const key of ENDPOINT_FIELDS) {
    if (typeof roh[key] === "string" && roh[key].trim()) sauber[key] = roh[key].trim().slice(0, 200);
  }
  return sauber;
}

// Was gesichert und was angenommen wird. Alles, was hier nicht steht, bleibt
// draussen - in beide Richtungen.
const SICHERUNG_PRUEFER = {
  settings: (w) => pruefeSicherungSettings(w, true),
  collections: pruefeSicherungCollections,
  endpoints: pruefeSicherungEndpoints,
  priceHistory: nurObjekt,
  preisGedaechtnis: nurObjekt,
  playerList: nurObjekt,
  playerImages: nurObjekt,
  filterListen: nurObjekt,
  transferliste: nurObjekt,
  liveMarketResults: nurObjekt,
  aktivLog: nurListe, // 28.09.2026: Konkurrenz-Messungen aus dem Lauf
  priceTiers: nurListe,
  purchases: nurListe,
  runStats: nurListe,
  verkaeufe: nurListe,
  panelCollapsed: (w) => (typeof w === "boolean" ? w : null),
  scanMaxPrice: (w) => (Number.isFinite(Number(w)) && Number(w) >= 0 ? Number(w) : null)
};

function sicherungMeldung(text, art) {
  $("sicherung-msg").textContent = text;
  $("sicherung-msg").className = "hint" + (art ? " " + art : "");
}

$("sicherung-export").addEventListener("click", async () => {
  try {
    const alles = await chrome.storage.local.get(null);
    const daten = {};
    for (const [key, wert] of Object.entries(alles)) {
      if (SICHERUNG_TABU.includes(key) || !SICHERUNG_PRUEFER[key]) continue;
      daten[key] = wert;
    }
    const text = JSON.stringify({ app: "fc27-own-bot", v: 1, at: Date.now(), daten });
    downloadDatei("fc27-sicherung-" + stamp(Date.now()).slice(0, 10) + ".json", text, "application/json;charset=utf-8");
    sicherungMeldung("Gesichert: " + Object.keys(daten).length + " Bereiche, rund " +
      Math.max(1, Math.round(text.length / 1024)).toLocaleString() + " KB. Sperren und Zähler sind bewusst nicht dabei.", "ok");
  } catch (e) {
    sicherungMeldung("Sichern fehlgeschlagen: " + e.message, "err");
  }
});

$("sicherung-import").addEventListener("click", () => {
  if (isRunning()) return sicherungMeldung("Erst den Lauf stoppen. Während der Bot läuft, wird nichts überschrieben.", "err");
  sicherungMeldung("", "");
  $("sicherung-datei").value = ""; // dieselbe Datei soll erneut waehlbar sein
  $("sicherung-datei").click();
});

$("sicherung-datei").addEventListener("change", async (event) => {
  const datei = event.target.files && event.target.files[0];
  if (!datei) return;
  if (isRunning()) return sicherungMeldung("Erst den Lauf stoppen. Während der Bot läuft, wird nichts überschrieben.", "err");
  if (datei.size > 30 * 1024 * 1024) return sicherungMeldung("Die Datei ist größer als 30 MB. Das kann keine Sicherung von uns sein.", "err");
  let roh = null;
  try {
    roh = JSON.parse(await datei.text());
  } catch (e) {
    return sicherungMeldung("Die Datei ist keine gültige Sicherung (kein lesbares JSON). Es wurde nichts geändert.", "err");
  }
  if (!istObjekt(roh) || roh.app !== "fc27-own-bot" || !istObjekt(roh.daten)) {
    return sicherungMeldung("Diese Datei stammt nicht von diesem Bot. Es wurde nichts geändert.", "err");
  }
  // Erst ALLES pruefen, dann erst schreiben. Eine halb eingelesene Datei
  // wuerde den Bot in einen wirren Zustand bringen.
  const schreiben = {};
  const verworfen = [];
  for (const [key, wert] of Object.entries(roh.daten)) {
    if (SICHERUNG_TABU.includes(key) || !SICHERUNG_PRUEFER[key]) { verworfen.push(key); continue; }
    const geprueft = SICHERUNG_PRUEFER[key](wert);
    if (geprueft == null) { verworfen.push(key); continue; }
    schreiben[key] = geprueft;
  }
  const uebernommen = Object.keys(schreiben);
  if (!uebernommen.length) {
    return sicherungMeldung("Nichts Brauchbares in der Datei gefunden. Es wurde nichts geändert.", "err");
  }
  try {
    await chrome.storage.local.set(schreiben);
  } catch (e) {
    return sicherungMeldung("Wiederherstellen fehlgeschlagen: " + e.message + " Der alte Stand ist unverändert.", "err");
  }
  await loadSettings();
  await loadPlayers();
  await loadData();
  await loadVerkauf();
  await loadCollections();
  await loadEndpoints();
  renderSuggestions();
  renderStep();
  sicherungMeldung(uebernommen.length + " Bereiche übernommen" +
    (verworfen.length ? ", " + verworfen.length + " verworfen (" + verworfen.slice(0, 6).join(", ") + ")" : "") +
    ". Sperren und Zähler sind unangetastet geblieben.", verworfen.length ? "warn" : "ok");
});

// ---------------------------------------------------------------------------
// Diagnose: Welche Funktionen stellt die Web App bereit?
// Beantwortet die Frage, ob sich ein Umbau von eigenen HTTP-Anfragen auf die
// eingebauten Dienste lohnt. content.js prueft die Antwort der Seite vorab.
// ---------------------------------------------------------------------------

// Was die einzelnen Funktionen im Bot ersetzen wuerden.
const PROBE_LABELS = {
  "Item.searchTransferMarket": "Transfermarkt durchsuchen",
  "Item.clearTransferMarketCache": "Suchzwischenspeicher leeren (nötig vor jeder Suche)",
  "Item.bid": "Kaufen und bieten",
  "Item.list": "Zum Verkauf anbieten",
  "Item.move": "In den Verein oder auf die Transferliste",
  "Item.discard": "Verkaufen an den Verein",
  "Item.untarget": "Von der Beobachtungsliste nehmen",
  "Item.requestWatchedItems": "Beobachtungsliste lesen (klärt Gebotsausgänge)",
  "Item.requestTransferItems": "Transferliste lesen",
  "Item.requestUnassignedItems": "Nicht zugeordnete Spieler lesen",
  "Item.clearSoldItems": "Verkaufte entfernen",
  "Item.relistExpiredAuctions": "Abgelaufene neu einstellen",
  "Item.refreshAuctions": "Auktionen aktualisieren",
  "User.getUser": "Kontodaten",
  "User.requestCurrencies": "Kontostand abrufen",
  "Club.search": "Vereinssuche",
  "Notification.queue": "Meldungen der Web App",
  "Localization.localize": "Übersetzungen"
};
// Ohne diese drei bringt ein Umbau nichts.
const PROBE_KEY_SERVICES = ["Item.searchTransferMarket", "Item.bid", "Item.clearTransferMarketCache"];

function probeRow(label, value, good) {
  const row = document.createElement("div");
  row.className = "probe-row";
  const name = document.createElement("span");
  name.textContent = label;
  const state = document.createElement("b");
  state.textContent = value;
  state.className = good === null ? "" : good ? "probe-ok" : "probe-miss";
  row.append(name, state);
  return row;
}

function renderProbe(probe) {
  const box = $("probe-result");
  if (!probe) {
    box.replaceChildren();
    return;
  }

  const found = PROBE_KEY_SERVICES.filter((key) => probe.services[key] && probe.services[key].found);
  const verdict = document.createElement("p");
  verdict.className = found.length === PROBE_KEY_SERVICES.length ? "hint ok" : found.length ? "hint warn" : "hint err";
  verdict.textContent = found.length === PROBE_KEY_SERVICES.length
    ? "Alle drei Kernfunktionen vorhanden. Ein Umbau auf die eingebauten Dienste ist machbar."
    : found.length
      ? "Nur " + found.length + " von " + PROBE_KEY_SERVICES.length + " Kernfunktionen gefunden. Ein Umbau würde nur teilweise tragen."
      : "Keine der Kernfunktionen gefunden. Entweder ist die Web App noch nicht fertig geladen, oder EA hat die Struktur geändert.";

  const blocks = [verdict];

  const globalNames = {
    services: "services (Dienste der Web App)",
    repositories: "repositories (Datenablage)",
    appMain: "_appMain (Hauptanwendung)",
    rootViewController: "_appMain._rootViewController (Ansicht)",
    ItemPile: "ItemPile (Ablagen: Verein, Transferliste)",
    UtasErrorCode: "UtasErrorCode (benannte Fehlercodes statt geratener Zahlen)",
    UTSearchCriteriaDTO: "UTSearchCriteriaDTO (Suchkriterien)",
    UTTransferListViewController: "UTTransferListViewController (zweiter Weg zum Abräumen verkaufter Karten)"
  };
  const globalHead = document.createElement("h4");
  globalHead.textContent = "Globale Objekte";
  blocks.push(globalHead);
  for (const key of Object.keys(globalNames)) {
    blocks.push(probeRow(globalNames[key], probe.globals[key] ? "vorhanden" : "fehlt", Boolean(probe.globals[key])));
  }

  const serviceHead = document.createElement("h4");
  const gefunden = Object.values(probe.services).filter((s) => s.found).length;
  serviceHead.textContent = "Funktionen (" + gefunden + " von " + Object.keys(probe.services).length + ")";
  blocks.push(serviceHead);
  for (const key of Object.keys(probe.services)) {
    const entry = probe.services[key];
    const label = (PROBE_LABELS[key] || key) + " · " + key;
    blocks.push(probeRow(label, entry.found ? entry.args + " Parameter" : "fehlt", entry.found));
  }

  if (probe.criteria && probe.criteria.length) {
    const head = document.createElement("h4");
    head.textContent = "Felder der Suchkriterien (" + probe.criteria.length + ")";
    blocks.push(head);
    const list = document.createElement("p");
    list.className = "hint";
    list.textContent = probe.criteria.join(", ");
    blocks.push(list);
  }

  if (probe.itemPile && probe.itemPile.length) {
    const head = document.createElement("h4");
    head.textContent = "Ablagen (ItemPile)";
    blocks.push(head);
    const list = document.createElement("p");
    list.className = "hint";
    list.textContent = probe.itemPile.join(", ");
    blocks.push(list);
  }

  const codeNames = probe.errorCodes ? Object.keys(probe.errorCodes) : [];
  if (codeNames.length) {
    const head = document.createElement("h4");
    head.textContent = "Fehlercodes (" + codeNames.length + ")";
    blocks.push(head);
    // Nach Zahl sortiert: so steht die Liste gleich so da, wie der Bot sie braucht.
    codeNames.sort((a, b) => probe.errorCodes[a] - probe.errorCodes[b]);
    for (const name of codeNames) blocks.push(probeRow(name, String(probe.errorCodes[name]), null));
  }

  box.replaceChildren(...blocks);
}

// Felder, auf die es ankommt: Marktdaten fuer den Preis-Check und die beiden
// Zustaende, auf die sich die Gebotsabrechnung stuetzt.
const WICHTIGE_FELDER = {
  marketDataMinPrice: "EA-Mindestpreis",
  marketDataMaxPrice: "EA-Höchstpreis",
  marketAverage: "Marktdurchschnitt",
  // Am 25.09.2026 dazugenommen: Wir zeigen den Schnellverkaufs-Wert bei
  // eigenen Karten an - ob EA ihn auch bei fremden Angeboten mitschickt,
  // haben wir nie gemessen.
  discardValue: "Schnellverkaufs-Wert",
  _marketAverage: "Marktdurchschnitt (intern)",
  lastSalePrice: "letzter Verkaufspreis",
  // Neu am 25.09.2026: Ob EA die Chemie in den Suchtreffern mitschickt, ist
  // ungeprüft. FST liest sie vom Karten-Objekt der EA-App, nicht aus dem
  // JSON. Erst diese Zeile beantwortet die Frage live.
  playStyle: "Chemie (PlayStyle+)",
  bidState: "Gebotsstand",
  tradeState: "Auktionsstand",
  currentBid: "aktuelles Gebot",
  expires: "Restzeit"
};

function renderItemFields(felder) {
  const box = $("fields-result");
  if (!felder) {
    box.replaceChildren();
    return;
  }
  const alle = new Set([...(felder.auction || []), ...(felder.item || [])]);
  const blocks = [];

  const kopf = document.createElement("h4");
  kopf.textContent = "Felder in den EA-Suchtreffern";
  blocks.push(kopf);

  for (const name of Object.keys(WICHTIGE_FELDER)) {
    const da = alle.has(name);
    blocks.push(probeRow(WICHTIGE_FELDER[name] + " · " + name, da ? "vorhanden" : "fehlt", da));
  }

  const rest = document.createElement("p");
  rest.className = "hint";
  rest.textContent = "Alle Felder (" + alle.size + "): " + [...alle].sort().join(", ");
  blocks.push(rest);

  box.replaceChildren(...blocks);
}

$("probe").addEventListener("click", async () => {
  $("probe").disabled = true;
  $("probe-msg").className = "hint";
  $("probe-msg").textContent = "Wird geprüft …";
  $("probe-result").replaceChildren();
  try {
    const res = await send("probe");
    if (!res || !res.ok) {
      $("probe-msg").className = "hint err";
      $("probe-msg").textContent = (res && res.error) || "Keine Antwort von der Web App.";
      return;
    }
    // Die Seite antwortet dem Content-Script asynchron. Mehrfach nachfassen,
    // damit eine langsam ladende Web App nicht faelschlich als Fehler gilt.
    let probe = null;
    let after = null;
    for (let versuch = 0; versuch < 6 && !probe; versuch++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      after = await send("status");
      probe = after && after.status ? after.status.probe : null;
    }
    render(after);
    if (!probe) {
      $("probe-msg").className = "hint err";
      $("probe-msg").textContent = "Keine Antwort aus der Web App. Das passiert, wenn der Tab noch von vor dem letzten Update der Erweiterung offen ist: Lade den EA-Tab einmal neu (F5) und klick dann erneut.";
      return;
    }
    $("probe-msg").className = "hint";
    $("probe-msg").textContent = "Geprüft um " + new Date(probe.at).toLocaleTimeString() + ". Es wurde nur nachgesehen, keine Anfrage an EA gesendet.";
    renderProbe(probe);

    // Die Feldliste entsteht nebenbei beim Suchen, nicht bei der Prüfung.
    const felder = after.status.itemFields;
    renderItemFields(felder);
    if (!felder) {
      const hinweis = document.createElement("p");
      hinweis.className = "hint";
      hinweis.textContent = "Die Feldliste der Suchtreffer erscheint, sobald der Bot einmal gesucht hat. Starte dafür kurz einen Lauf.";
      $("fields-result").replaceChildren(hinweis);
    }
  } finally {
    $("probe").disabled = false;
  }
});

for (const field of NUMBER_FIELDS) $(field).addEventListener("change", saveSettings);
for (const field of CHECK_FIELDS) $(field).addEventListener("change", saveSettings);
for (const field of SELECT_FIELDS) $(field).addEventListener("change", saveSettings);
// FST-Modus (01.10.2026): Nach dem Umschalten den Stand des Motors neu holen -
// erst der Motor sagt, was wirklich gilt. Bis dahin steht die Anzeige noch im
// alten Modus (das sind nur Sekundenbruchteile).
$("fstModus").addEventListener("change", () => {
  // Punkt 11f: Beim Ausschalten sagen, was bleibt und was zurueckgeht.
  if ($("fst-aus-hinweis")) $("fst-aus-hinweis").hidden = $("fstModus").checked;
  setTimeout(() => {
    try {
      Promise.resolve(poll()).catch(() => {});
    } catch (e) {}
  }, 300);
});

// Die fuenf Felder, die in die Laufzeit-Rechnung eingehen, zeichnen die
// Anzeige sofort neu (28.09.2026).
//
// Ohne das aendert sich der Satz erst beim naechsten Status vom Motor - das
// sind ein paar Sekunden. Wer auf "Turbo" klickt und den Text unveraendert
// stehen sieht, denkt, die Einstellung sei nicht angekommen.
//
// "input" statt "change", damit die Zahl schon beim Tippen mitlaeuft; die
// Auswahlfelder kennen nur "change" und bekommen darum beides.
// Die Quelle der Rotations-Filter wirkt sofort auf den Streifen und den
// Plan-Text (28.09.2026). Ohne das sieht der Nutzer nach dem Umschalten
// noch die alte Liste und glaubt, es habe nicht geklappt.
if ($("rotQuelle")) {
  $("rotQuelle").addEventListener("change", () => {
    renderRotationStreifen();
    renderAutoEinstellungen();
    renderAutoStartKnopf();
  });
}

// Der Modus der Abzeichen-Haken wirkt sofort auf Streifen und Start-Knopf
// (28.09.2026) - wie bei rotQuelle. Ohne das aendern sich Streifen, Anzahl
// und Knopf-Text erst mit dem naechsten Status-Takt, und der Nutzer glaubt,
// das Umschalten habe nicht geklappt. Die SELECT_FIELDS-Schleife haengt nur
// saveSettings an das Feld.
if ($("rotAbzModus")) {
  $("rotAbzModus").addEventListener("change", () => {
    renderRotationStreifen();
    renderAutoStartKnopf();
  });
}

for (const id of ["speedMode", "pausePreset", "timeLimitMin", "grenzeSuchStunde", "grenzeSuchTag"]) {
  const el = $(id);
  if (!el) continue;
  const neu = () => { renderLaufzeit(letzterStatus); renderGrenzen(letzterStatus); };
  el.addEventListener("change", neu);
  el.addEventListener("input", neu);
}

// Status-Zeile im Kopf (30.09.2026): Sie zeigt nur zwei Zeilen, damit der
// klebende Kopf klein bleibt. Ein Klick (oder Enter) zeigt den ganzen Text,
// ein zweiter klappt ihn wieder zu.
(function statusAufklappen() {
  const zeile = $("status");
  if (!zeile || typeof zeile.addEventListener !== "function") return;
  // aria-expanded sagt Screenreadern, ob der ganze Text offen ist (die Zeile
  // ist im Markup ein Knopf: role="button", erreichbar per Tab).
  const umschalten = () => {
    const offen = zeile.classList.toggle("offen");
    if (typeof zeile.setAttribute === "function") zeile.setAttribute("aria-expanded", offen ? "true" : "false");
  };
  zeile.addEventListener("click", umschalten);
  zeile.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      umschalten();
    }
  });
})();

// Die Kacheln im Kopf. Keine davon fragt EA.
$("kachel-sammlungen").addEventListener("click", () => blattOeffnen("sammlungen-blatt"));
if ($("markt-detail-zu")) $("markt-detail-zu").addEventListener("click", marktDetailSchliessen);
blattVerdrahten("heute-blatt", "heute-blatt-zu");
blattVerdrahten("sammlungen-blatt", "sammlungen-blatt-zu");
if ($("kachel-heute")) $("kachel-heute").addEventListener("click", () => blattOeffnen("heute-blatt"));
if ($("markt-detail")) {
  // Klick auf den dunklen Rand schliesst, ein Klick INS Blatt nicht.
  $("markt-detail").addEventListener("click", (e) => {
    if (e.target === $("markt-detail")) marktDetailSchliessen();
  });
}
$("kachel-markt").addEventListener("click", () => {
  if ($("markt-detail").hidden) marktDetailOeffnen();
  else marktDetailSchliessen();
});

// Hoerprobe. Der Ton entsteht in content.js in der EA-Seite - auch dann, wenn
// die Bedienung in einem eigenen Tab laeuft.
function tonLautstaerkeZeigen() {
  if ($("tonLautstaerke") && $("tonLautstaerke-wert")) $("tonLautstaerke-wert").textContent = $("tonLautstaerke").value + " %";
  // Cyan-Fuellung links vom Griff (FST: .vue-slider-process). Nur Aussehen.
  const regler = $("tonLautstaerke");
  if (regler) {
    const von = Number(regler.min) || 0;
    const bis = Number(regler.max) || 100;
    const anteil = bis > von ? Math.min(100, Math.max(0, ((Number(regler.value) - von) / (bis - von)) * 100)) : 0;
    regler.style.setProperty("--fuellung", anteil + "%");
  }
}

async function tonProbe(art) {
  const meldung = $("ton-msg");
  const res = await send("tonTest", { art, lautstaerke: Number($("tonLautstaerke").value) });
  if (!res || !res.ok) {
    meldung.className = "hint err";
    meldung.textContent = (res && res.error) || "Kein Ton möglich.";
    return;
  }
  meldung.className = "hint";
  meldung.textContent = "Ton abgespielt. Nichts gehört? Prüf die Lautstärke am PC und ob der EA-Tab stummgeschaltet ist.";
  setTimeout(async () => {
    const st = await send("status");
    const ton = st && st.status && st.status.ton;
    if (ton && ton.zustand === "suspended") {
      meldung.className = "hint warn";
      meldung.textContent = "Chrome hält den Ton noch zurück. Klick einmal in die EA-Seite und teste noch einmal.";
    }
  }, 500);
}

for (const [id, art] of [["ton-test-kauf", "kauf"], ["ton-test-ende", "ende"], ["ton-test-warnung", "warnung"]]) {
  $(id).addEventListener("click", () => tonProbe(art));
}
// Suchseite nachsehen. Das fragt nur den Speicher der App, nie EA.
async function suchseitePruefen() {
  const feld = $("suchseite-stand");
  feld.className = "hint";
  feld.textContent = "Wird geprüft …";
  await send("suchseite");
  setTimeout(async () => {
    const st = await send("status");
    renderSuchseite(st && st.status);
  }, 700);
}

// Was der Bot waehrend des Laufs an Verkaeufen gesehen hat (F3).
function renderVerkaufsWache(st) {
  const zeile = $("s-verkauft-zeile");
  if (!zeile) return;
  const w = st && st.verkaufsWache;
  if (!w || !w.anzahl) {
    zeile.textContent = "";
    return;
  }
  const gewinn = w.mitKauf
    ? " · " + (w.gewinn >= 0 ? "+" : "") + fmt(w.gewinn) + " Gewinn"
    : " · " + fmt(w.erloes) + " Coins nach Gebühr";
  zeile.className = "hint " + (w.mitKauf && w.gewinn < 0 ? "warn" : "ok");
  zeile.textContent = w.anzahl + (w.anzahl === 1 ? " verkauft" : " verkauft") + " seit Start" + gewinn +
    (w.abgeraeumt ? " · " + w.abgeraeumt + "× abgeräumt" : "");
}

function renderSuchseite(st) {
  renderRarity(st);
  renderScanFilter(st);
  renderSuchwegStand(st);
  const feld = $("suchseite-stand");
  if (!feld) return;
  const s = st && st.suchseite;
  if (!s) {
    feld.textContent = "";
    return;
  }
  if (!$("appSuchweg").checked) {
    feld.className = "hint";
    feld.textContent = "Gilt nur mit dem EA-App-Suchweg.";
    return;
  }
  feld.className = "hint " + (s.offen ? "ok" : "warn");
  feld.textContent = s.offen
    ? "Die EA-Suchseite ist offen" + (s.seite ? " (" + s.seite + ")" : "") + ". Der Bot darf suchen."
    : "Die EA-Suchseite ist nicht offen. Öffne in der Web App „Transfermarkt“ und dort „Spieler suchen“.";
}

if ($("auto-modus-einzel")) $("auto-modus-einzel").addEventListener("click", () => setAutoModus(false));

// Welchen Weg die Suchen wirklich genommen haben (27.09.2026).
//
// Bisher stand hier nur, welcher Weg EINGESTELLT ist. Der App-Weg schaltet
// sich aber selbst ab, sobald Rating, Kartenart oder ein Scan-Filter in der
// Suche steht - und davon war nichts zu sehen. Wer den Haken setzte, glaubte,
// er sucht ueber die EA-App, waehrend die direkte Adresse lief. Das Zaehlen
// passiert in content.js und kostet keine einzige EA-Anfrage.
function renderSuchwegStand(st) {
  const feld = $("suchweg-stand");
  if (!feld) return;
  const stat = st && st.suchwegStat;
  const app = stat ? Number(stat.app) || 0 : 0;
  const direkt = stat ? Number(stat.direkt) || 0 : 0;
  const summe = app + direkt;
  if (!$("appSuchweg").checked) {
    feld.className = "hint";
    feld.textContent = summe > 0
      ? "Weg: alle " + summe + " Suchen liefen über die direkte EA-Adresse (der App-Weg ist aus)."
      : "Weg: der App-Weg ist aus – es läuft die direkte EA-Adresse.";
    return;
  }
  if (summe === 0) {
    feld.className = "hint";
    feld.textContent = "Weg: noch keine Suche gezählt.";
    return;
  }
  const grund = stat && stat.grund ? String(stat.grund) : "";
  feld.className = "hint " + (direkt === 0 ? "ok" : "warn");
  feld.textContent = "Weg: " + app + " von " + summe + " Suchen liefen wirklich über die EA-App" +
    (direkt > 0
      ? " · " + direkt + " gingen den direkten Weg" + (grund ? ", zuletzt weil: " + grund : "") + "."
      : ".");
}
if ($("auto-modus-rotation")) $("auto-modus-rotation").addEventListener("click", () => setAutoModus(true));
$("suchseite-pruefen").addEventListener("click", suchseitePruefen);
$("tonLautstaerke").addEventListener("input", tonLautstaerkeZeigen);
$("tonLautstaerke").addEventListener("change", () => tonProbe("kauf"));

// Modus-Umschalter
for (const btn of WURZEL.querySelectorAll("#snipe-mode-selector button")) {
  btn.addEventListener("click", (e) => setSnipeMode(e.currentTarget.dataset.mode));
}

// Auto-Modus Events
// Eingaben im Auto-Modus landen in den gemeinsamen Feldern oben und laufen
// durch dieselben Horcher - so kann keine zweite Auswahl entstehen.
if ($("autoPlayerName")) $("autoPlayerName").addEventListener("input", () => {
  $("playerName").value = $("autoPlayerName").value;
  $("playerName").dispatchEvent(new Event("input"));
});
// input UND change weitergeben, wie beim Budget unten: Gespeichert wird bei
// change. Nur mit input kam ein geloeschtes Rating nach dem Neuladen zurueck.
if ($("autoRating")) {
  for (const art of ["input", "change"]) {
    $("autoRating").addEventListener(art, () => {
      $("rating").value = $("autoRating").value;
      $("rating").dispatchEvent(new Event(art));
    });
  }
}
// Budget und Max. Kaeufe genauso: Das Auto-Feld schreibt ins gemeinsame Feld
// und loest dort dieselben Horcher aus (input: Schritt-Pruefung, change:
// speichern). Umgekehrt holt syncAutoBudget die Werte zurueck.
for (const [auto, gemeinsam] of AUTO_SPIEGEL) {
  if (!$(auto)) continue;
  for (const art of ["input", "change"]) {
    $(auto).addEventListener(art, () => {
      $(gemeinsam).value = $(auto).value;
      $(gemeinsam).dispatchEvent(new Event(art));
    });
  }
  $(gemeinsam).addEventListener("input", syncAutoBudget);
}
if ($("auto-start-btn")) {
  $("auto-start-btn").addEventListener("click", () => ($("rotationModus").checked ? rotationLauf() : startAutoRun()));
}
$("rotationModus").addEventListener("change", () => {
  renderAutoModus();
  renderRotationStreifen();
  saveSettings();
  renderAutoEinstellungen();
  // updateAutoCalculation setzt auch die Beschriftung des Start-Knopfs
  // zurueck - sonst stuende dort weiter "Mehrere Filter nacheinander".
  updateAutoCalculation();
  renderAutoStartKnopf();
});

// ---------------------------------------------------------------------------
// Merker fuer die Rotation (25.09.2026).
//
// Die Rotation laeuft in dieser Datei, also im Arbeitsspeicher der Seite.
// Wird die Web App neu geladen, ist sie weg - bisher ohne jeden Hinweis. Der
// Nutzer sah nur einen freien Start-Knopf und dachte, sie laeuft noch.
// Darum ein Merker im Speicher der Erweiterung: gesetzt, solange sie laeuft,
// geloescht, wenn sie sauber endet. Liegt er beim naechsten Laden noch da und
// ist frisch, wurde sie mitten im Betrieb abgerissen.
// ---------------------------------------------------------------------------
const ROT_MERKER_FRISCH_MS = 10 * 60 * 1000;

function rotationMerkerSetzen() {
  chrome.storage.local.set({ rotationLief: { t: Date.now(), filterNr: rotationFilterNr } }).catch(() => {});
}

function rotationMerkerLoeschen() {
  chrome.storage.local.remove("rotationLief").catch(() => {});
}

// Beim Laden einmal nachsehen. Der Merker wird in jedem Fall geloescht -
// sonst meldete jedes weitere Neuladen denselben Abriss noch einmal.
async function rotationMerkerPruefen() {
  try {
    const { rotationLief } = await chrome.storage.local.get("rotationLief");
    const t = rotationLief ? Number(rotationLief.t) : 0;
    if (!(t > 0)) return;
    await chrome.storage.local.remove("rotationLief");
    // Aelter als 10 Minuten: ein Rest von frueher, kein frischer Abriss.
    if (Date.now() - t > ROT_MERKER_FRISCH_MS) return;
    const nr = Number(rotationLief.filterNr) || 0;
    autoFehler = "Die Rotation wurde vom Neuladen der Seite beendet" +
      (nr > 0 ? " (nach Filter " + nr + ")" : "") +
      ". Sie läuft nicht weiter – bitte neu starten, wenn du sie brauchst.";
    renderAutoStartKnopf();
  } catch (e) {}
}

rotationMerkerPruefen();

// ---------------------------------------------------------------------------
// Speicherplatz (Optionen > Wartung), 25.09.2026
// Warum: chrome.storage.local hat ohne die Berechtigung "unlimitedStorage"
// 10 MB. Ist der Platz weg, schlaegt jedes Speichern fehl. content.js:419
// fing das bisher nur mit einer Zeile im Protokoll ab - der Nutzer sah nichts,
// und das Preis-Gedaechtnis hoerte still auf zu wachsen. Hier wird der Stand
// sichtbar und laesst sich mit einem Klick verkleinern. Kostet keine einzige
// EA-Anfrage.
// ---------------------------------------------------------------------------

const SPEICHER_GRENZE = 10 * 1024 * 1024; // Chrome-Grenze ohne unlimitedStorage
const SPEICHER_ENG = 0.8; // ab hier wird aufgeraeumt empfohlen
const PLAYERLIST_KURZ = 25000; // so viele Spieler bleiben beim Aufraeumen
const HISTORY_KURZ = 20; // so viele Messungen bleiben je Karte

function mbText(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2).replace(".", ",") + " MB";
}

async function speicherStand() {
  const feld = $("speicher-stand");
  if (!feld) return;
  if (typeof chrome.storage.local.getBytesInUse !== "function") {
    feld.className = "hint";
    feld.textContent = "Dieser Browser sagt nicht, wie viel Platz belegt ist.";
    return;
  }
  try {
    const belegt = await chrome.storage.local.getBytesInUse(null);
    const anteil = belegt / SPEICHER_GRENZE;
    feld.className = "hint" + (anteil >= SPEICHER_ENG ? " err" : anteil >= 0.6 ? " warn" : "");
    feld.textContent = "Belegt: " + mbText(belegt) + " von 10 MB (" + Math.round(anteil * 100) + " %)." +
      (anteil >= SPEICHER_ENG
        ? " Es wird eng. Räum auf – sonst hört das Preis-Gedächtnis still auf zu wachsen, und der Bot rechnet mit alten Preisen weiter."
        : "");
  } catch (e) {
    feld.className = "hint";
    feld.textContent = "Belegter Platz nicht lesbar: " + e.message;
  }
}

// Reihenfolge nach Schmerz: zuerst die letzte Marktaufnahme (nach 15 Minuten
// ohnehin wertlos), dann die aeltesten Preismessungen, zuletzt die
// Spielerliste kuerzen. Einstellungen, Ziele, Sammlungen, Kaeufe und das
// Preis-Gedaechtnis werden nie angefasst.
$("speicher-aufraeumen").addEventListener("click", async () => {
  const knopf = $("speicher-aufraeumen");
  const lesbar = typeof chrome.storage.local.getBytesInUse === "function";
  knopf.disabled = true;
  $("speicher-msg").className = "hint";
  $("speicher-msg").textContent = "Wird aufgeräumt …";
  try {
    const vorher = lesbar ? await chrome.storage.local.getBytesInUse(null) : 0;
    await chrome.storage.local.remove("liveMarketResults");
    const { priceHistory, playerList } = await chrome.storage.local.get(["priceHistory", "playerList"]);
    const schreiben = {};
    if (priceHistory && typeof priceHistory === "object") {
      const gekuerzt = {};
      for (const [key, liste] of Object.entries(priceHistory)) {
        if (Array.isArray(liste) && liste.length) gekuerzt[key] = liste.slice(-HISTORY_KURZ);
      }
      schreiben.priceHistory = gekuerzt;
    }
    if (playerList && Array.isArray(playerList.list) && playerList.list.length > PLAYERLIST_KURZ) {
      schreiben.playerList = { at: playerList.at || Date.now(), list: playerList.list.slice(0, PLAYERLIST_KURZ) };
    }
    if (Object.keys(schreiben).length) await chrome.storage.local.set(schreiben);
    const nachher = lesbar ? await chrome.storage.local.getBytesInUse(null) : 0;
    await loadPlayers();
    await loadData();
    renderSuggestions();
    $("speicher-msg").className = "hint ok";
    $("speicher-msg").textContent = "Fertig." + (lesbar ? " Frei geworden: " + mbText(Math.max(0, vorher - nachher)) + "." : "") +
      " Einstellungen, Ziellisten, Sammlungen, Käufe und das Preis-Gedächtnis sind unverändert.";
  } catch (e) {
    $("speicher-msg").className = "hint err";
    $("speicher-msg").textContent = "Aufräumen fehlgeschlagen: " + e.message;
  } finally {
    knopf.disabled = false;
    speicherStand();
  }
});

speicherStand();

// ---------------------------------------------------------------------------
// Chancen, Assistent, Einfach/Profi und Einfuehrung (02.10.2026)
//
// Chancen: Rangliste aus dem eigenen Preisverlauf (markt.js). Die Ansicht
// fragt EA nie - der Verlauf fuellt sich aus den Suchen, die der Bot sowieso
// macht (content.js marktVerlaufSichern).
// Assistent: assistent.js uebersetzt den Zustand in einen Satz und hoechstens
// zwei Knoepfe. Hier wird nur eingesammelt, gezeichnet und geklickt.
// Einfach: blendet alles mit data-profi aus (CSS), sonst aendert sich nichts.
// ---------------------------------------------------------------------------
// Die Zustaende dazu stehen oben bei den anderen (MARKT, chancen, ansicht ...).

function spielerFuer(id) {
  if (spielerIndexQuelle !== players) {
    spielerIndex = new Map(players.map((p) => [p.id, p]));
    spielerIndexQuelle = players;
  }
  return spielerIndex.get(id) || null;
}

async function loadMarkt() {
  let roh = {};
  try {
    roh = await chrome.storage.local.get(["marktVerlauf", "marktVerkaeufe"]);
  } catch (e) {
    roh = {};
  }
  const karten = (x) => (x && typeof x === "object" && x.karten && typeof x.karten === "object" ? x.karten : {});
  marktVerlauf = karten(roh.marktVerlauf);
  marktVerkaeufe = karten(roh.marktVerkaeufe);
  chancenRechnen();
  renderChancen();
  renderAssistent();
}

// Spielername, Bestandteile des Schluessels und Verlauf an eine Karte haengen.
function karteAnreichern(key, extra) {
  const teile = MARKT.keyTeilen(key) || { playerId: 0, rating: 0, rarity: "" };
  const spieler = spielerFuer(teile.playerId);
  const verlauf = Array.isArray(marktVerlauf[key]) ? marktVerlauf[key] : [];
  return Object.assign({ key }, extra, teile, { name: spieler ? spieler.name : "Spieler " + teile.playerId, verlauf });
}

function chancenRechnen() {
  chancenAt = Date.now();
  if (!MARKT) {
    chancen = [];
    radarDaten = { bestseller: [], guenstig: [], steigend: [], fallend: [] };
    return;
  }
  chancenStand = MARKT.datenStand(marktVerlauf);
  trefferStand = MARKT.backtestAlle(marktVerlauf, chancenAt);
  chancen = MARKT.rangliste(marktVerlauf, { jetzt: chancenAt, quoten: trefferStand.jeKarte }).slice(0, CHANCEN_MAX).map((c) => {
    const k = karteAnreichern(c.key, c);
    const preisAt = k.verlauf.length ? k.verlauf[k.verlauf.length - 1][0] : chancenAt;
    // Auf die Preisleiter von EA abrunden - so kauft der Bot auch wirklich.
    const kaufBis = roundDownToStep(c.kauf);
    const gewinn = MARKT.gewinn(kaufBis, c.ziel);
    return Object.assign(k, { kaufBis, gewinn, marge: kaufBis > 0 ? gewinn / kaufBis : 0, preisAt, bis: preisAt + MARKT.FRISCH_MS });
  });
  // Die vier Preis- und Verkaufslisten. Jede Karte bekommt gleich einen
  // Snipe-Plan (Snipen bis / Ziel), damit der Knopf in der Zeile weiss, was er tut.
  const r = MARKT.radar(marktVerlauf, marktVerkaeufe, chancenAt, { max: CHANCEN_MAX });
  const anreichern = (k) => {
    const plan = MARKT.snipePlan(k);
    const kaufBis = plan ? roundDownToStep(plan.kaufBis) : 0;
    const gewinn = plan ? MARKT.gewinn(kaufBis, plan.ziel) : 0;
    const preisAt = k.gesehenAt || chancenAt;
    return karteAnreichern(k.key, Object.assign({}, k, {
      ziel: plan ? plan.ziel : 0,
      kaufBis: plan && gewinn > 0 && kaufBis >= VERKAUF_MIN_PREIS ? kaufBis : 0,
      gewinn,
      marge: kaufBis > 0 ? gewinn / kaufBis : 0,
      preisAt,
      bis: Math.max(preisAt, chancenAt) + MARKT.FRISCH_MS
    }));
  };
  radarDaten = {
    bestseller: r.bestseller.map(anreichern),
    guenstig: r.guenstig.map(anreichern),
    steigend: r.steigend.map(anreichern),
    fallend: r.fallend.map(anreichern)
  };
}

function chancenFrisch() {
  if (Date.now() - chancenAt > CHANCEN_NEU_MS) chancenRechnen();
  return chancen;
}

function chanceSpark(c) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "chance-spark");
  svg.setAttribute("viewBox", "0 0 100 28");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  const linie = document.createElementNS(SVG_NS, "polyline");
  linie.setAttribute("points", MARKT ? MARKT.sparkPunkte(c.verlauf, 100, 28) : "");
  svg.append(linie);
  return svg;
}

function vorzeichenProzent(x) {
  const p = Math.round(x * 100);
  return (p > 0 ? "+" : p < 0 ? "−" : "") + Math.abs(p) + " %";
}

function vorMin(t) {
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  return min < 1 ? "gerade eben" : min < 60 ? "vor " + min + " Min." : "vor " + Math.round(min / 60) + " Std.";
}

// Was eine Zeile je Rangliste zeigt: grosse Zahl rechts, drei Felder, ein Satz.
function radarAnsicht(c, liste) {
  if (liste === "chancen") {
    return {
      gross: "+" + fmt(c.gewinn), grossTitel: "Gewinn nach 5 % EA-Gebühr, wenn der Preis zum Ziel zurückkehrt", ton: "plus",
      unter: [c.art === "dip" ? "Dip" : "steigt", c.alterMin > 0 ? "gesehen vor " + c.alterMin + " Min." : "gerade gesehen",
        c.quote ? "erholte sich " + c.quote.treffer + " von " + c.quote.signale + "×" : ""],
      felder: [["Kaufen bis", fmt(c.kaufBis)], ["Ziel", fmt(c.ziel)], ["Gewinn", Math.round(c.marge * 100) + " %"]],
      satz: c.grund + "."
    };
  }
  const felder = [["Jetzt", c.aktuell ? fmt(c.aktuell) : "–"], ["Üblich", c.ueblich ? fmt(c.ueblich) : "–"], ["Verkauft für", c.verkaufsPreis ? fmt(c.verkaufsPreis) : "–"]];
  const satz = c.kaufBis > 0
    ? "Snipen bis " + fmt(c.kaufBis) + ", verkaufen um " + fmt(c.ziel) + " – etwa +" + fmt(c.gewinn) + " Coins nach Gebühr."
    : "Mit 5 % Gebühr bleibt hier gerade kein sicherer Gewinn.";
  const gesehen = c.gesehenAt ? "gesehen " + vorMin(c.gesehenAt) : "";
  if (liste === "bestseller") {
    return {
      gross: fmt(c.verkaeufe) + "×", grossTitel: "Erkannte Verkäufe in den letzten 3 Stunden", ton: "info",
      unter: [String(c.verkaeufeStunde).replace(".", ",") + " pro Std.", gesehen], felder, satz
    };
  }
  const wert = liste === "guenstig" ? c.abweichung : c.aenderung;
  return {
    gross: vorzeichenProzent(wert),
    grossTitel: liste === "guenstig" ? "Abstand zum üblichen Preis" : "Änderung seit einer Stunde",
    ton: wert < 0 ? (liste === "guenstig" ? "plus" : "minus") : "plus",
    unter: [c.verkaeufe ? c.verkaeufe + " verkauft (3 Std.)" : "", gesehen], felder, satz
  };
}

function chanceZeile(c, liste, schonDrauf, laeuft) {
  const a = radarAnsicht(c, liste);
  const row = document.createElement("article");
  row.className = "chance";
  row.dataset.art = liste === "chancen" ? c.art : liste;

  const kopf = document.createElement("div");
  kopf.className = "chance-kopf";
  const name = document.createElement("div");
  name.className = "chance-name";
  const titel = document.createElement("b");
  titel.textContent = c.name;
  const unter = document.createElement("small");
  unter.textContent = [c.rating ? "Rating " + c.rating : ""].concat(a.unter).filter(Boolean).join(" · ");
  name.append(titel, unter);
  const gross = document.createElement("span");
  gross.className = "chance-gewinn " + a.ton;
  gross.textContent = a.gross;
  gross.title = a.grossTitel;
  kopf.append(portrait(c.playerId, c.name), name, gross);
  row.append(kopf);
  if (c.verlauf && c.verlauf.length >= 2) row.append(chanceSpark(c));

  const zahlen = document.createElement("div");
  zahlen.className = "chance-zahlen";
  for (const [label, wert] of a.felder) {
    const feld = document.createElement("div");
    const l = document.createElement("span");
    l.textContent = label;
    const w = document.createElement("b");
    w.textContent = wert;
    feld.append(l, w);
    zahlen.append(feld);
  }
  const satz = document.createElement("p");
  satz.className = "chance-grund";
  satz.textContent = a.satz;

  const knopf = document.createElement("button");
  knopf.type = "button";
  const moeglich = c.kaufBis > 0;
  knopf.className = schonDrauf ? "secondary chance-knopf drauf" : moeglich ? "go chance-knopf" : "secondary chance-knopf";
  knopf.textContent = schonDrauf ? "Auf deiner Liste ✓"
    : liste === "chancen" ? "Auf meine Liste"
      : moeglich ? "Snipen bis " + fmt(c.kaufBis) : "Kein Gewinn möglich";
  knopf.disabled = schonDrauf || laeuft || !moeglich;
  if (laeuft && !schonDrauf) knopf.title = "Während der Bot läuft, bleibt die Liste, wie sie ist.";
  knopf.addEventListener("click", () => chanceAufListe(c));

  row.append(zahlen, satz, knopf);
  return row;
}


function radarLeerText(liste) {
  if (!MARKT) return "Die Markt-Analyse ist nicht geladen. Lade die Web App neu (F5).";
  if (liste === "bestseller") {
    return "Noch keine Verkäufe erkannt. Der Bot sieht einen Verkauf, wenn ein Angebot zwischen zwei Suchen vor seinem Ablauf verschwindet. Mehrere Markt-Scans im Abstand von ein paar Minuten bringen die ersten Zahlen.";
  }
  if (!(chancenStand.reif > 0)) {
    return "Der Bot lernt noch die Preise. Jede Suche füllt den Verlauf, nach etwa einer Stunde erkennt er die ersten Bewegungen. Ein Markt-Scan beschleunigt das.";
  }
  return liste === "chancen"
    ? "Gerade ist keine Karte günstig genug. Der Bot schaut bei jeder Suche weiter – fällt ein Preis, steht die Karte hier."
    : "Gerade bewegt sich hier nichts Nennenswertes (unter 3 %). Der Bot schaut bei jeder Suche weiter.";
}

function radarEintraege(liste) {
  return liste === "chancen" ? chancen : radarDaten[liste] || [];
}

function verkaeufeLetzteStunde() {
  const grenze = Date.now() - 60 * 60 * 1000;
  let n = 0;
  for (const v of Object.values(marktVerkaeufe)) if (Array.isArray(v)) for (const p of v) if (p[0] > grenze) n += 1;
  return n;
}

function renderChancen() {
  const liste = $("chancen-liste");
  if (!liste) return;
  const eintraege = radarEintraege(radarListe);
  const aufListe = new Set(targets.map(targetKey));
  const laeuft = isRunning();
  const verkauft = verkaeufeLetzteStunde();
  const key = JSON.stringify([radarListe, trefferStand.gesamt, eintraege.map((c) => [c.key, c.kaufBis, c.ziel, c.alterMin, c.name, c.aktuell, c.verkaeufe, c.gesehenAt, c.quote]),
    [...aufListe], laeuft, chancenStand, verkauft, Boolean(images)]);
  if (key === chancenKey) return;
  chancenKey = key;
  for (const b of WURZEL.querySelectorAll("#radar-wahl button")) {
    const an = b.dataset.liste === radarListe;
    b.classList.toggle("active", an);
    b.setAttribute("aria-checked", String(an));
    // Kleine Zahl am Umschalter: wie viele Karten in der Liste stehen.
    // Eigenes Element statt ::after - die Umschalter haben dort schon Stile.
    if (!b.dataset.label) b.dataset.label = b.textContent;
    const anzahl = radarEintraege(b.dataset.liste).length;
    const zahl = document.createElement("small");
    zahl.className = "radar-zahl";
    zahl.textContent = anzahl ? String(anzahl) : "";
    zahl.hidden = !anzahl;
    b.replaceChildren(b.dataset.label, zahl);
  }
  const g = trefferStand.gesamt;
  $("radar-erklaerung").textContent = (RADAR_ERKLAERUNG[radarListe] || "") + (radarListe === "chancen" && g.signale >= 3
    ? " Trefferquote bisher: " + Math.round(g.quote * 100) + " % (" + g.treffer + " von " + g.signale + " Dips erholt" +
      (g.dauerMin ? ", meist nach " + g.dauerMin + " Min." : "") + ")."
    : "");
  liste.replaceChildren(...eintraege.map((c) => chanceZeile(c, radarListe, aufListe.has(c.key), laeuft)));
  $("chancen-stand").textContent = chancenStand.karten
    ? (chancenStand.karten === 1 ? "1 Karte" : fmt(chancenStand.karten) + " Karten") + " · " + fmt(chancenStand.reif) + " mit Verlauf · " +
      fmt(verkauft) + (verkauft === 1 ? " Verkauf" : " Verkäufe") + " in der letzten Std."
    : "Noch keine Preise gemerkt";
  $("chancen-leer").hidden = eintraege.length > 0;
  if (!eintraege.length) {
    $("chancen-leer").querySelector("b").textContent = radarListe === "chancen" ? "Noch keine Chancen" : radarListe === "bestseller" ? "Noch keine Bestseller" : "Gerade nichts";
    $("chancen-leer-text").textContent = radarLeerText(radarListe);
    const lernt = !(chancenStand.reif > 0) && radarListe !== "bestseller";
    $("chancen-fortschritt").hidden = !lernt;
    $("chancen-balken").style.width = Math.round(chancenStand.fortschritt * 100) + "%";
  }
}

function radarZeigen(liste) {
  radarListe = RADAR_ERKLAERUNG[liste] ? liste : "chancen";
  chancenKey = "";
  renderChancen();
  try {
    chrome.storage.local.set({ radarListe }).catch(() => {});
  } catch (e) {}
}

for (const b of WURZEL.querySelectorAll("#radar-wahl button")) b.addEventListener("click", () => radarZeigen(b.dataset.liste));

// Der Radar-Haken ist derselbe Schalter wie "Live-Filter automatisch alle 7
// Minuten erneuern" (autoFilters) - gespeichert und gelesen wird nur dort.
function radarAutoAbgleichen() {
  if ($("radarAuto") && $("autoFilters")) $("radarAuto").checked = $("autoFilters").checked;
}
if ($("radarAuto")) {
  $("radarAuto").addEventListener("change", () => {
    $("autoFilters").checked = $("radarAuto").checked;
    $("autoFilters").dispatchEvent(new Event("change"));
  });
  $("autoFilters").addEventListener("change", radarAutoAbgleichen);
}

function chancenMeldung(text, level, mitStart) {
  const el = $("chancen-msg");
  el.className = "hint" + (level ? " " + level : "");
  el.textContent = text;
  if (mitStart) {
    const start = document.createElement("button");
    start.type = "button";
    start.className = "go chancen-start";
    start.textContent = "Jetzt starten";
    start.addEventListener("click", chanceStarten);
    el.append(" ", start);
  }
}

async function chanceAufListe(c) {
  if (isRunning()) {
    chancenMeldung("Während der Bot läuft, bleibt die Liste, wie sie ist. Stoppe ihn zuerst.", "warn");
    return;
  }
  if (!(c.kaufBis > 0) || !(c.ziel > 0)) return;
  // Wie ein Live-Filter: Der Verkaufspreis faehrt mit (salePrice = Ziel), die
  // Zeile laeuft ab (expiresAt), und preisAt sagt, wann gemessen wurde.
  const neu = {
    playerId: c.playerId, playerName: c.name, rating: c.rating, rarity: c.rarity, maxPrice: c.kaufBis,
    source: "chance", salePrice: c.ziel, preisAt: c.preisAt, expiresAt: c.bis, score: Math.round(c.score || c.gewinn || 0)
  };
  const key = targetKey(neu);
  const index = targets.findIndex((t) => targetKey(t) === key);
  if (index < 0 && targets.length >= MAX_TARGETS) {
    chancenMeldung("Deine Liste ist voll (höchstens " + MAX_TARGETS + " Spieler). Entferne zuerst einen unter Snipen.", "warn");
    return;
  }
  if (index >= 0) targets[index] = Object.assign({}, targets[index], neu);
  else targets.push(neu);
  targets = sanitizeTargets(targets);
  await saveSettings();
  renderTargets(true);
  chancenKey = "";
  renderChancen();
  renderAssistent();
  chancenMeldung(c.name + " ist auf deiner Liste: kaufen bis " + fmt(c.kaufBis) + ", Ziel " + fmt(c.ziel) + ".", "ok", true);
}

// "Jetzt starten": zur Liste unter Snipen und gleich die Zusammenfassung vor
// dem Start zeigen. Gestartet wird erst dort - mit allen Pruefungen wie sonst.
function chanceStarten() {
  setSnipeMode("manual");
  goToStep(3);
  selectTab($("tab-snipe"), false);
  openStartModal();
}

function marktScannen() {
  const knopf = $("scan-market");
  if (!knopf || knopf.disabled) {
    chancenMeldung($("market-scan-msg").textContent || "Der Markt-Scan geht gerade nicht.", "warn");
    return;
  }
  knopf.click();
  chancenMeldung("Markt wird gescannt … Der Scan kauft nichts, er füllt nur den Preisverlauf.", "");
}

// --- Assistent -------------------------------------------------------------

function assistentZustand() {
  const st = letzterStatus;
  const usage = (st && st.usage) || {};
  const stapel = (st && st.stapel) || {};
  const s = (st && st.stats) || {};
  const zahlOderNull = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const auswahl = currentTarget();
  const ziele = targets.length ? targets.filter((t) => !liveAbgelaufen(t)) : auswahl ? [auswahl] : [];
  const preise = ziele.map((t) => Number(t.maxPrice) || 0).filter((p) => p > 0);
  return {
    verbunden: Boolean(st),
    imEigenenFenster: !BOT,
    session: Boolean(st && st.session),
    laeuft: Boolean(st && st.running),
    cooldownMin: st && st.cooldown ? Number(st.cooldown.leftMin) || 0 : 0,
    cooldownGrund: st && st.cooldown ? st.cooldown.reason || "" : "",
    fremderBot: Boolean(st && st.fremderBot),
    andererTab: Boolean(st && st.andererTab),
    ohneGrenzen: Boolean(st && st.fstModus),
    suchenStunde: Number(usage.searchesHour) || 0,
    gekauft: s.bought || 0,
    ausgegeben: s.spent || 0,
    transfer: stapel.at ? zahlOderNull(stapel.transfer) : null,
    nichtZugewiesen: stapel.at ? zahlOderNull(stapel.nichtZugewiesen) : null,
    nzUnbegrenzt: Boolean($("nichtZugewiesenUnbegrenzt") && $("nichtZugewiesenUnbegrenzt").checked),
    coins: st ? zahlOderNull(st.credits) : null,
    letzterStopp: (st && st.letzterStopp) || null,
    jetzt: Date.now(),
    ziele: ziele.length,
    billigstesZiel: preise.length ? Math.min(...preise) : 0,
    chancen: chancenFrisch(),
    bestseller: radarDaten.bestseller,
    daten: chancenStand
  };
}

function assistentKnopf(a, haupt) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = haupt ? "go" : "secondary";
  b.textContent = a.label;
  b.dataset.aktion = a.id;
  if (a.id === "stopp" && !(letzterStatus && letzterStatus.running)) b.disabled = true;
  b.addEventListener("click", () => assistentAktion(a.id));
  return b;
}

function renderAssistent() {
  const box = $("assistent");
  if (!box) return;
  if (!ASSISTENT) {
    box.hidden = true;
    return;
  }
  // Ein Knopf, der nur zum Reiter fuehrt, auf dem man schon ist, faellt weg.
  const offen = WURZEL.querySelector('.tab[aria-selected="true"]');
  const offenId = offen ? offen.id : "";
  const hinweise = ASSISTENT.lage(assistentZustand()).map((h) =>
    Object.assign({}, h, { aktionen: h.aktionen.filter((a) => ASSISTENT_REITER[a.id] !== offenId) }));
  const key = JSON.stringify([hinweise, Boolean(letzterStatus && letzterStatus.running)]);
  if (key === assistentKey) return;
  assistentKey = key;
  const haupt = hinweise[0] || { ton: "gut", titel: "Alles bereit", text: "Gerade gibt es nichts zu tun.", aktionen: [] };
  box.dataset.ton = haupt.ton;
  $("assistent-titel").textContent = haupt.titel;
  $("assistent-text").textContent = haupt.text;
  const mitBalken = typeof haupt.fortschritt === "number";
  $("assistent-fortschritt").hidden = !mitBalken;
  if (mitBalken) $("assistent-balken").style.width = Math.round(haupt.fortschritt * 100) + "%";
  $("assistent-knoepfe").replaceChildren(...haupt.aktionen.map((a, i) => assistentKnopf(a, i === 0)));
  $("assistent-knoepfe").hidden = !haupt.aktionen.length;
  const rest = hinweise.slice(1, 5);
  $("assistent-mehr").hidden = !rest.length;
  $("assistent-mehr-titel").textContent = rest.length === 1 ? "1 weiterer Hinweis" : rest.length + " weitere Hinweise";
  $("assistent-mehr-liste").replaceChildren(...rest.map((h) => {
    const li = document.createElement("li");
    li.dataset.ton = h.ton;
    const t = document.createElement("b");
    t.textContent = h.titel;
    const text = document.createElement("span");
    text.textContent = h.text;
    li.append(t, text);
    if (h.aktionen.length) li.append(assistentKnopf(h.aktionen[0], false));
    return li;
  }));
}

function assistentAktion(id) {
  if (id === "chancen" || id === "bestseller") {
    selectTab($("tab-chancen"), false);
    radarZeigen(id);
  }
  else if (id === "kaeufe") selectTab($("tab-buys"), false);
  else if (id === "snipen") selectTab($("tab-snipe"), false);
  else if (id === "stopp") $("stop").click();
  else if (id === "scan") {
    selectTab($("tab-chancen"), false);
    marktScannen();
  } else if (id === "neuladen") seiteNeuLaden();
  else if (id === "webapp") chrome.tabs.create({ url: "https://www.ea.com/ea-sports-fc/ultimate-team/web-app/" }).catch(() => {});
}

// In der Seite: die Web App selbst neu laden. Im eigenen Fenster: den
// Web-App-Tab neu laden (oder einen oeffnen, wenn keiner da ist).
async function seiteNeuLaden() {
  if (BOT) {
    location.reload();
    return;
  }
  const tab = await webAppTab();
  if (tab) chrome.tabs.reload(tab.id).catch(() => {});
  else chrome.tabs.create({ url: "https://www.ea.com/ea-sports-fc/ultimate-team/web-app/" }).catch(() => {});
}

// --- Einfach / Profi ---------------------------------------------------------

function ansichtSetzen(wert, speichern) {
  ansicht = wert === "einfach" ? "einfach" : "profi";
  const ziel = WURZEL === document ? document.documentElement : WURZEL.querySelector(".blatt");
  if (ziel) ziel.classList.toggle("einfach", ansicht === "einfach");
  for (const b of WURZEL.querySelectorAll("#ansicht-wahl button")) {
    const an = b.dataset.ansicht === ansicht;
    b.classList.toggle("active", an);
    b.setAttribute("aria-checked", String(an));
  }
  // Ein offener Reiter, den es in Einfach nicht gibt: zurueck zu Snipen.
  const offen = tabList.find((t) => t.getAttribute("aria-selected") === "true");
  if (ansicht === "einfach" && offen && offen.hasAttribute("data-profi")) selectTab($("tab-snipe"), false);
  if (speichern) chrome.storage.local.set({ uiAnsicht: ansicht }).catch(() => {});
}

for (const b of WURZEL.querySelectorAll("#ansicht-wahl button")) {
  b.addEventListener("click", () => ansichtSetzen(b.dataset.ansicht, true));
}

// --- Einfuehrung -------------------------------------------------------------

function tourZeichnen() {
  for (const seite of WURZEL.querySelectorAll("#tour-wrap .tour-seite")) seite.hidden = Number(seite.dataset.seite) !== tourSeite;
  WURZEL.querySelectorAll("#tour-wrap .tour-punkte i").forEach((punkt, i) => punkt.classList.toggle("an", i + 1 === tourSeite));
  $("tour-zurueck").textContent = tourSeite === 1 ? "Überspringen" : "Zurück";
  $("tour-weiter").textContent = tourSeite === TOUR_SEITEN ? "Los geht's" : "Weiter";
  // Seite 3: die Wahl zeigt, was gerade eingestellt ist.
  const fst = Boolean($("fstModus") && $("fstModus").checked);
  for (const option of WURZEL.querySelectorAll("#tour-wrap .tour-option")) {
    const an = (option.dataset.fst === "true") === fst;
    option.classList.toggle("an", an);
    option.setAttribute("aria-checked", String(an));
  }
}

function tourOeffnen() {
  tourSeite = 1;
  tourZeichnen();
  $("tour-wrap").hidden = false;
  nachObenScrollen();
  $("tour-weiter").focus();
}

function tourSchliessen() {
  $("tour-wrap").hidden = true;
  chrome.storage.local.set({ tourV1: Date.now() }).catch(() => {});
}

$("tour-weiter").addEventListener("click", () => {
  if (tourSeite >= TOUR_SEITEN) tourSchliessen();
  else {
    tourSeite += 1;
    tourZeichnen();
  }
});
$("tour-zurueck").addEventListener("click", () => {
  if (tourSeite <= 1) tourSchliessen();
  else {
    tourSeite -= 1;
    tourZeichnen();
  }
});
for (const option of WURZEL.querySelectorAll("#tour-wrap .tour-option")) {
  option.addEventListener("click", () => {
    const fst = option.dataset.fst === "true";
    if ($("fstModus").checked !== fst) {
      $("fstModus").checked = fst;
      // Derselbe Weg wie ein Klick in den Optionen: speichern, Hinweis, Status.
      $("fstModus").dispatchEvent(new Event("change"));
    }
    tourZeichnen();
  });
}
WURZEL.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("tour-wrap").hidden) {
    event.preventDefault();
    tourSchliessen();
  }
});
if ($("tour-nochmal")) $("tour-nochmal").addEventListener("click", tourOeffnen);
$("chancen-scan").addEventListener("click", marktScannen);

// Was beim ersten Oeffnen gilt. Der Speicher wird VOR loadSettings gelesen:
// loadSettings speichert bei neuen Nutzern sofort, danach waere nicht mehr zu
// erkennen, ob es vorher schon Einstellungen gab.
const ersterStartStand = chrome.storage.local.get(["settings", "uiAnsicht", "tourV1", "radarListe"]).catch(() => ({}));

async function ersterStartAnwenden() {
  const roh = (await ersterStartStand) || {};
  const neu = !roh.settings;
  // Neue Nutzer starten einfach, Bestandsnutzer behalten alles, wie es war.
  ansichtSetzen(roh.uiAnsicht === "einfach" || roh.uiAnsicht === "profi" ? roh.uiAnsicht : neu ? "einfach" : "profi", false);
  if (typeof roh.radarListe === "string" && RADAR_ERKLAERUNG[roh.radarListe]) {
    radarListe = roh.radarListe;
    chancenKey = "";
    renderChancen();
  }
  radarAutoAbgleichen();
  if (neu && !roh.tourV1) tourOeffnen();
}

// Neue Daten, waehrend das Popup offen ist? Direkt uebernehmen.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  // 02.10.2026: Chancen neu rechnen - sie tragen die Spielernamen aus der Liste.
  if (changes.playerList) loadPlayers().then(() => { renderSuggestions(); renderLiveFilters(); chancenRechnen(); renderChancen(); });
  // 28.09.2026: aktivLog gehoert dazu - sonst zeigt die Konkurrenz-Kachel
  // neue Laufmessungen erst nach dem naechsten Oeffnen des Popups.
  if (changes.priceHistory || changes.runStats || changes.purchases || changes.liveMarketResults || changes.aktivLog) loadData().then(renderVerkauf);
  if (changes.transferliste || changes.verkaeufe) loadVerkauf();
  // 02.10.2026: neuer Preisverlauf aus content.js -> Chancen und Assistent.
  if (changes.marktVerlauf || changes.marktVerkaeufe) loadMarkt();
  if (changes.playerImages) {
    loadImages().then(() => {
      renderSuggestions();
      renderPlayerCard(true);
      renderTargets(true);
      renderBuys();
    });
  }
});

// Bei entpackten Erweiterungen aktualisiert Chrome geaenderte Popup-Dateien
// sofort, behaelt aber das alte Manifest samt Berechtigungen bis zum Reload.
// Genau dieser Mischzustand fuehrte dazu, dass die neue UI sichtbar war, aber
// chrome.scripting fehlte. Ein einmaliger Selbst-Reload behebt ihn dauerhaft.
// Nur im eigenen Fenster: In der Seite gibt es chrome.scripting nie (Content-
// Scripts haben die API nicht), dort waere das eine endlose Neulade-Schleife.
if (!BOT && (!chrome.scripting || typeof chrome.scripting.executeScript !== "function")) {
  $("status").textContent = "Einmalige Bot-Aktualisierung … Das Fenster schließt gleich. Danach bitte erneut öffnen.";
  $("status").dataset.level = "warn";
  $("session").textContent = "Aktualisiere …";
  $("start").disabled = true;
  $("stop").disabled = true;
  $("check").disabled = true;
  $("scan-market").disabled = true;
  setTimeout(() => chrome.runtime.reload(), 800);
} else {
  loadImages().then(loadSettings).then(loadPlayers).then(loadData).then(loadVerkauf).then(loadCollections).then(renderStep)
    .then(loadMarkt).then(ersterStartAnwenden).then(poll);
  setInterval(poll, 1500);
}
}

// Eigenes Fenster (oder die Vorschau von popup.html): sofort mit dem Dokument
// starten. In der EA-Seite dagegen warten, bis content.js die Oberflaeche in
// sein Shadow DOM gebaut hat und mit Wurzel und Botdraht anruft.
if (location.pathname.endsWith("popup.html")) {
  fc27PopupStart(document, null);
} else {
  globalThis.__fc27PopupStart = fc27PopupStart;
}
