const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// ===========================================================================
// Gleichmaessiges Tempo und Profil "Konto-schonend" (02.10.2026).
// Im strengen Modus liegt zwischen zwei Lauf-Suchen mindestens
// 3600 s / Stundenlimit, damit das Limit nicht in 10 Minuten Dauerfeuer
// verbraucht ist. Der FST-Modus bleibt unveraendert. Dazu kommt die neue
// Stufe "schonend" (8-14 s, hoechstens 6 Suchen pro Minute, Pause alle
// 12-18 Suchen, hoechstens 90 Minuten Laufzeit).
// ===========================================================================

const content = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const pacing = content.slice(content.indexOf('  function randomBetween('), content.indexOf('  async function loop('));
const vonCfg = content.indexOf('  function validateConfig(');
const validierung = content.slice(vonCfg, content.indexOf('  function parsePlayers(', vonCfg));

const popup = fs.readFileSync(path.join(__dirname, '..', 'popup.js'), 'utf8');
const tempoTeil = popup.slice(popup.indexOf('function tempoSekunden('), popup.indexOf('function gewinnProStunde('));
const laufzeitTeil = popup.slice(popup.indexOf('function laufzeitRechnung('), popup.indexOf('function renderLaufzeit('));
const profilTeil = popup.slice(popup.indexOf('function applyStartProfile('), popup.indexOf('// Wen der Start sucht'));

// zufall: feste Zahl, Funktion oder nichts (echter Zufall).
function motor(zufall) {
  const random = typeof zufall === 'number' ? () => zufall : zufall;
  const context = vm.createContext({ CONFIG: {}, Math: random ? Object.assign(Object.create(Math), { random }) : Math });
  vm.runInContext(pacing, context);
  return context;
}

// Kleiner Zufallsgenerator mit Samen - zwei Kontexte bekommen dieselbe Folge.
function gesaet(samen) {
  let s = samen >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const abstand = (c, limit, fst) => c.gleichmaessigAbstandMs(limit, fst);
const warte = (c, cfg, seit, limit, fst) => c.suchWarteMs(cfg, seit, limit, fst);

// ---------------------------------------------------------------------------
// content.js: die Untergrenze
// ---------------------------------------------------------------------------

test('strenger Modus, 150 pro Stunde: Abstand immer zwischen 24 und 27,6 s', () => {
  assert.equal(abstand(motor(0), 150, false), 24000);
  assert.equal(abstand(motor(0.5), 150, false), 25800);
  const hoch = abstand(motor(0.999), 150, false);
  assert.ok(hoch >= 24000 && hoch <= 27600, String(hoch));
  const c = motor();
  for (let i = 0; i < 500; i++) {
    const ms = abstand(c, 150, false);
    assert.ok(ms >= 24000 && ms <= 27600, ms + ' ms ausserhalb von 24000-27600');
  }
});

test('FST-Modus und ungueltige Grenzen: keine Untergrenze', () => {
  const c = motor();
  assert.equal(abstand(c, 150, true), 0);
  for (const unsinn of [0, NaN, undefined, -5, Infinity, 'abc']) {
    assert.equal(abstand(c, unsinn, false), 0, 'Grenze ' + String(unsinn));
  }
  assert.ok(abstand(c, 60, false) >= 60000, 'bei 60 pro Stunde mindestens eine Minute');
  assert.ok(abstand(c, 200, false) >= 18000, 'bei 200 pro Stunde mindestens 18 s');
});

test('kurz nach Suchbeginn wird der Rest bis zur Untergrenze gewartet', () => {
  const cfg = { speedMode: 'normal' };
  const c = motor();
  for (let i = 0; i < 300; i++) {
    const ms = warte(c, cfg, 1000, 150, false);
    assert.ok(ms >= 23000 && ms <= 26600, ms + ' ms');
  }
  // Nie kuerzer als die Suchpause selbst - gleicher Zufall, gleicher Wert.
  for (const r of [0, 0.3, 0.7, 0.999]) {
    const a = motor(r);
    const b = motor(r);
    assert.ok(warte(a, cfg, 1000, 150, false) >= b.searchDelay(cfg), 'random ' + r);
  }
});

test('nach einer langen Pause wird nichts nachgeholt', () => {
  // 60 s seit Suchbeginn (z. B. Sicherheitspause): nur die normale Suchpause.
  const c = motor();
  for (let i = 0; i < 300; i++) {
    const ms = warte(c, { speedMode: 'normal' }, 60000, 150, false);
    assert.ok(ms >= 3310 && ms <= 4610, ms + ' ms - erwartet die Suchpause von Normal');
  }
});

test('erste Suche (Infinity) und zurueckgestellte Uhr (negativ)', () => {
  const c = motor();
  for (let i = 0; i < 100; i++) {
    const ms = warte(c, { speedMode: 'turbo' }, Infinity, 150, false);
    assert.ok(ms >= 2520 && ms <= 3531, ms + ' ms - erwartet die Suchpause von Turbo');
  }
  // Uhr zurueckgestellt: die volle Untergrenze, keine negative Wartezeit.
  assert.equal(warte(motor(0), { speedMode: 'turbo' }, -5000, 150, false), 24000);
});

test('FST-Modus: genau dieselben Wartezeiten und dieselbe Zufallsfolge wie vorher', () => {
  for (const speedMode of ['safe', 'normal', 'turbo']) {
    const cfg = { speedMode };
    for (const r of [0, 0.25, 0.5, 0.999]) {
      assert.equal(warte(motor(r), cfg, 1000, 1e9, true), motor(r).searchDelay(cfg), speedMode + ' bei random ' + r);
    }
    // Ueber eine ganze Folge: kein zusaetzlicher Zufallswert.
    const a = motor(gesaet(42));
    const b = motor(gesaet(42));
    const alt = [];
    const neu = [];
    for (let i = 0; i < 200; i++) {
      alt.push(a.searchDelay(cfg));
      neu.push(warte(b, cfg, 1000, 1e9, true));
    }
    assert.deepEqual(neu, alt, speedMode + ': die Folge hat sich verschoben');
  }
});

test('gerechnete Stunde im Turbo-Tempo: kein Dauerfeuer mehr', () => {
  const c = motor(gesaet(7));
  const cfg = { speedMode: 'turbo' };
  const beginne = [];
  let t = 0;
  while (t < 60 * 60000) {
    beginne.push(t);
    t += 500 + warte(c, cfg, 500, 150, false); // 500 ms Suchdauer
  }
  const ersteZehn = beginne.filter((x) => x < 10 * 60000).length;
  assert.ok(ersteZehn <= 26, ersteZehn + ' Suchen in den ersten 10 Minuten');
  assert.ok(beginne.length >= 120 && beginne.length <= 150, beginne.length + ' Suchen in einer Stunde');
});

// ---------------------------------------------------------------------------
// content.js: die Stufe "Konto-schonend"
// ---------------------------------------------------------------------------

test('Suchpause Konto-schonend: 8 bis 14 s, im Mittel rund 10,6 s', () => {
  const c = motor();
  const cfg = { speedMode: 'schonend' };
  for (let i = 0; i < 300; i++) {
    const ms = c.searchDelay(cfg);
    assert.ok(ms >= 8000 && ms <= 14000, ms + ' ms');
  }
  let summe = 0;
  const werte = new Set();
  for (let i = 0; i < 4000; i++) {
    const ms = c.searchDelay(cfg);
    summe += ms;
    werte.add(ms);
  }
  const schnitt = summe / 4000;
  assert.ok(schnitt >= 10000 && schnitt <= 11200, 'Mittel ' + Math.round(schnitt) + ' ms');
  assert.ok(werte.size > 50, 'zu wenig Streuung: ' + werte.size);
});

test('Konto-schonend: hoechstens 6 Suchen pro Minute', () => {
  // random 0: Suchpause 8000 + 600, Untergrenze 10000 - 500 = 9500.
  assert.equal(warte(motor(0), { speedMode: 'schonend' }, 500, 1e9, true), 9500);
  const c = motor(gesaet(3));
  const beginne = [];
  let t = 0;
  for (let i = 0; i < 1000; i++) {
    beginne.push(t);
    t += 500 + warte(c, { speedMode: 'schonend' }, 500, 1e9, true);
  }
  let von = 0;
  for (let bis = 0; bis < beginne.length; bis++) {
    while (beginne[bis] - beginne[von] >= 60000) von++;
    assert.ok(bis - von + 1 <= 6, (bis - von + 1) + ' Suchbeginne in einer Minute');
  }
  // Im strengen Modus gewinnt die Untergrenze aus dem Stundenlimit.
  assert.ok(warte(motor(), { speedMode: 'schonend' }, 500, 150, false) >= 23500);
});

test('Pausen Konto-schonend: alle 12 bis 18 Suchen 1 bis 2 Minuten', () => {
  const c = motor();
  for (let i = 0; i < 200; i++) {
    const p = c.breakPlan({ pausePreset: 'schonend' });
    assert.ok(p.every >= 12 && p.every <= 18, 'every ' + p.every);
    assert.ok(p.ms >= 60000 && p.ms <= 120000, 'ms ' + p.ms);
    assert.ok(p.longEvery >= 3 && p.longEvery <= 5, 'longEvery ' + p.longEvery);
    assert.ok(p.longMs > p.ms, 'die lange Pause muss laenger sein');
  }
});

test('validateConfig laesst "schonend" in beiden Modi durch', () => {
  for (const fst of [false, true]) {
    const context = vm.createContext({
      Object, Array, Number, Math, String, Date, Infinity,
      STATE: { fstModus: fst },
      CONFIG: { MAX_TARGETS: 10, MAX_BIDS_PER_AUCTION: 4, OHNE_GRENZE: 1e9 },
      toInt: (v) => { const n = Number(v); return Number.isFinite(n) ? Math.floor(n) : NaN; },
      parsePlayer: () => ({ player: { playerId: 1, playerName: 'Example', rating: 84 } }),
      priceKey: (id, r) => id + ':' + (r || 0),
      roundDownToStep: (p) => Math.floor(p / 50) * 50
    });
    vm.runInContext(validierung, context);
    context.eingabe = { targets: [{ playerId: 1, maxPrice: 1000 }], budget: 5000, maxBuys: 3, speedMode: 'schonend', pausePreset: 'schonend' };
    const { cfg } = vm.runInContext('validateConfig(eingabe)', context);
    assert.equal(cfg.speedMode, 'schonend', 'fst ' + fst);
    assert.equal(cfg.pausePreset, 'schonend', 'fst ' + fst);
    context.eingabe = Object.assign({}, context.eingabe, { speedMode: 'rasend', pausePreset: 'nie' });
    const unbekannt = vm.runInContext('validateConfig(eingabe)', context).cfg;
    assert.equal(unbekannt.speedMode, 'normal');
    assert.equal(unbekannt.pausePreset, 'medium');
  }
});

// ---------------------------------------------------------------------------
// popup.js: Anzeige und Laufzeit-Rechnung
// ---------------------------------------------------------------------------

function oberflaeche(felder) {
  const el = {};
  for (const [id, value] of Object.entries(felder)) el[id] = { value };
  const context = vm.createContext({ Math, Number, String, Infinity, $: (id) => el[id] || null });
  vm.runInContext(tempoTeil + '\n' + laufzeitTeil, context);
  return context;
}

test('Tempo-Tabelle kennt Konto-schonend, die alten Werte bleiben', () => {
  const c = oberflaeche({});
  assert.equal(c.tempoSekunden('schonend'), 10.7);
  assert.equal(c.tempoName('schonend'), 'Konto-schonend');
  assert.equal(c.tempoSekunden('safe'), 4.6);
  assert.equal(c.tempoSekunden('normal'), 3.9);
  assert.equal(c.tempoSekunden('turbo'), 3.0);
  assert.equal(c.tempoName('normal'), 'Normal');
});

test('Laufzeit-Rechnung streng: die Suchen verteilen sich ueber die Stunde', () => {
  const felder = { speedMode: 'normal', pausePreset: 'medium', timeLimitMin: '', grenzeSuchStunde: '', grenzeSuchTag: '' };
  const st = { fstModus: false, usage: { searchLimitHour: 150 } };
  const r = oberflaeche(felder).laufzeitRechnung(st);
  assert.equal(r.endetDurchStunde, false, 'die Stunde wird nicht mehr vor der Laufzeit voll');
  assert.ok(r.abstand >= 24, 'Abstand ' + r.abstand);
  assert.ok(r.sekundenBrutto >= 26 && r.sekundenBrutto <= 30, 'brutto ' + r.sekundenBrutto);
  // Pausen Konto-schonend: alle 15 Suchen im Mittel 90 s mal 1,425.
  const s = oberflaeche(Object.assign({}, felder, { pausePreset: 'schonend' })).laufzeitRechnung(st);
  const erwartet = s.abstand + Math.max(0, 90 * 1.425 - (s.abstand - s.sekunden)) / 15;
  assert.ok(Math.abs(s.sekundenBrutto - erwartet) < 1e-9, s.sekundenBrutto + ' statt ' + erwartet);
  // Eigene Grenze 200: Abstand kuerzer, aber nie unter 18 s.
  const g = oberflaeche(Object.assign({}, felder, { grenzeSuchStunde: '200' })).laufzeitRechnung(st);
  assert.ok(g.abstand >= 18 && g.abstand < r.abstand, 'Abstand bei 200: ' + g.abstand);
});

test('Laufzeit-Rechnung FST: unveraendert, die Verteilung greift dort nicht', () => {
  const st = { fstModus: true, usage: {} };
  const r = oberflaeche({ speedMode: 'normal', pausePreset: 'fst', timeLimitMin: '' }).laufzeitRechnung(st);
  assert.equal(r.proStunde, 675);
  assert.ok(Math.abs(r.sekundenBrutto - (3.9 + 50 / 35)) < 1e-9, String(r.sekundenBrutto));
  assert.equal(r.abstand, undefined);
  const s = oberflaeche({ speedMode: 'schonend', pausePreset: 'schonend', timeLimitMin: '' }).laufzeitRechnung(st);
  assert.ok(Math.abs(s.sekundenBrutto - (10.7 + 90 * 1.425 / 15)) < 1e-9, String(s.sekundenBrutto));
  assert.equal(s.proStunde, 187);
});

// ---------------------------------------------------------------------------
// popup.js: das Schnellprofil
// ---------------------------------------------------------------------------

function profil(timeLimitMin) {
  const el = {};
  for (const id of ['speedMode', 'pausePreset', 'filterSearchLimit', 'filterBuyLimit']) el[id] = { value: '' };
  el.timeLimitMin = { value: timeLimitMin };
  const modi = [];
  const gezeichnet = [];
  const context = vm.createContext({
    Number, String,
    $: (id) => el[id] || null,
    setTuneMode: (zeile, modus) => modi.push(zeile + ':' + modus),
    WURZEL: { querySelectorAll: () => [] },
    saveSettings: () => {},
    startSafetyInfo: () => {},
    renderLaufzeit: (st) => gezeichnet.push(st),
    letzterStatus: null
  });
  vm.runInContext(profilTeil, context);
  return { context, el, modi, gezeichnet };
}

test('Schnellprofil Konto-schonend setzt Tempo, Pausen, Grenzen und hoechstens 90 Minuten', () => {
  for (const vorher of ['', '200']) {
    const p = profil(vorher);
    p.context.applyStartProfile('schonend');
    assert.equal(p.el.speedMode.value, 'schonend');
    assert.equal(p.el.pausePreset.value, 'schonend');
    assert.equal(p.el.filterSearchLimit.value, '60');
    assert.equal(p.el.filterBuyLimit.value, '2');
    assert.equal(p.el.timeLimitMin.value, '90', 'vorher "' + vorher + '"');
    assert.ok(p.modi.includes('runtime:custom'), 'die Laufzeit-Zeile muss auf Eigene stehen');
    assert.equal(p.gezeichnet.length, 1, 'die Laufzeit-Zeile wird nachgezogen');
  }
});

test('eine kuerzere eigene Laufzeit bleibt, andere Profile lassen sie in Ruhe', () => {
  const kurz = profil('45');
  kurz.context.applyStartProfile('schonend');
  assert.equal(kurz.el.timeLimitMin.value, '45');
  assert.ok(!kurz.modi.includes('runtime:custom'));
  const sicher = profil('200');
  sicher.context.applyStartProfile('safe');
  assert.equal(sicher.el.timeLimitMin.value, '200');
  assert.equal(sicher.el.speedMode.value, 'safe');
  assert.ok(!sicher.modi.includes('runtime:custom'));
});
