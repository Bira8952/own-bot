const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

// Auswahl der Spielerliste. Am 21.09.2026 in der laufenden Web App gemessen:
// Das Muster "player*.json" trifft DREI Dateien, und der Rueckfallweg nahm
// die letzte - players_icons.json, ohne einen einzigen Namen. Im Protokoll
// stand zweimal "Spielerliste uebersprungen (0 Eintraege)", die Namenssuche
// blieb auf einer alten gespeicherten Liste sitzen.
const BASIS = 'https://www.ea.com/ea-sports-fc/ultimate-team/web-app/content/27A3C9F1/2027/fut/items/web/';
const ECHTE_ADRESSEN = [
  BASIS + 'players.json?_=26091',
  BASIS + 'players_meta.json?_=26091',
  BASIS + 'players_icons.json?_=26091'
];

// Genau die Formen, die dort wirklich ausgeliefert werden.
const ECHT_PLAYERS = JSON.stringify({
  LegendsPlayers: [{ c: 'Iniesta', f: 'Andrés', id: 41, l: 'Iniesta Luján', r: 92 }],
  Players: Array.from({ length: 150 }, (_, i) => ({ c: '', f: 'Vor' + i, id: 1000 + i, l: 'Nach' + i, r: 80 }))
});
const ECHT_ICONS = JSON.stringify(Array.from({ length: 300 }, (_, i) => ({ iconId: 1, playerId: 190043 + i })));
const ECHT_META = JSON.stringify({ attrKeys: ['pac', 'sho'], players: { 1000: [90, 80] } });

const inhalte = {
  'players.json': ECHT_PLAYERS,
  'players_meta.json': ECHT_META,
  'players_icons.json': ECHT_ICONS
};

function setup(adressen, optionen) {
  const o = optionen || {};
  const warnungen = [];
  const geholt = [];
  const gespeichert = {};
  const PLAYERS = { merged: new Map(), seen: false, loading: false, fallbackAt: 0 };
  const context = vm.createContext({
    PLAYERS, Object, Array, String, Number, Map, Boolean, Promise, JSON, Date,
    toInt: (v) => { const n = Number(v); return Number.isFinite(n) ? Math.floor(n) : NaN; },
    str: (v, max) => String(v == null ? '' : v).slice(0, max),
    warn: (t) => warnungen.push(t),
    log: () => {},
    // Nicht resourceUrls() ersetzen: Der Ausschnitt bringt die Funktion selbst
    // mit und wuerde eine Attrappe verdecken. Eine Ebene tiefer ansetzen.
    performance: { getEntriesByType: () => adressen.map((name) => ({ name })) },
    imagePrefixFromUrl: () => null,
    saveImages: () => {},
    fetch: (url) => {
      geholt.push(url.split('/').pop().split('?')[0]);
      if (o.fetchKaputt) return Promise.reject(new Error('offline'));
      const datei = url.split('/').pop().split('?')[0];
      return Promise.resolve({ ok: true, text: () => Promise.resolve(inhalte[datei] || '') });
    },
    chrome: { storage: { local: { set: (obj) => { Object.assign(gespeichert, obj); return Promise.resolve(); } } } }
  });
  // Die drei Bausteine: Muster und Auswahl, der Leser, das Speichern samt
  // Rueckfallweg. Alle aus der echten Datei geschnitten.
  vm.runInContext(source.slice(source.indexOf('  const PLAYERS_RE ='), source.indexOf('  // Spielerbilder der Web App')), context);
  vm.runInContext(source.slice(source.indexOf('  function parsePlayers(raw)'), source.indexOf('  // Merkt sich, wo die Spielerbilder liegen')), context);
  vm.runInContext(source.slice(source.indexOf('  async function savePlayers('), source.indexOf('  // Zur Diagnose im Popup')), context);
  return { context, warnungen, geholt, gespeichert, PLAYERS };
}

const kandidaten = (s) => vm.runInContext('spielerlistenKandidaten()', s.context).map((u) => u.split('/').pop().split('?')[0]);
const nachladen = (s) => vm.runInContext('playerListFallback()', s.context);
const istListe = (s, url) => { s.context.pruefUrl = url; return vm.runInContext('istSpielerliste(pruefUrl)', s.context); };

// --- Auswahl ----------------------------------------------------------------

test('players_icons.json und players_meta.json gelten nicht als Spielerliste', () => {
  // Genau diese beiden erzeugten die Warnungen "0 Eintraege".
  const s = setup(ECHTE_ADRESSEN);
  assert.equal(istListe(s, ECHTE_ADRESSEN[0]), true, 'players.json muss gelten');
  assert.equal(istListe(s, ECHTE_ADRESSEN[1]), false, 'players_meta.json');
  assert.equal(istListe(s, ECHTE_ADRESSEN[2]), false, 'players_icons.json');
});

test('players.json steht vorn, auch wenn es zuerst geladen wurde', () => {
  // Vorher entschied die Reihenfolge des Ladens (.pop() nahm die letzte).
  const s = setup(ECHTE_ADRESSEN);
  assert.deepEqual(kandidaten(s), ['players.json']);
});

test('eine fremde json-Datei wird nicht fuer die Liste gehalten', () => {
  const s = setup([BASIS + 'squadData.json', BASIS + 'remoteConfig.json']);
  assert.deepEqual(kandidaten(s), []);
});

test('eine Adresse ausserhalb von ea.com zaehlt nicht', () => {
  const s = setup([]);
  assert.equal(istListe(s, 'https://boese.de/players.json'), false);
  assert.equal(istListe(s, 'https://www.ea.com.boese.de/players.json'), false);
});

// --- Nachladen ---------------------------------------------------------------

test('der Rueckfallweg holt players.json und speichert die Namen', async () => {
  const s = setup(ECHTE_ADRESSEN);
  await nachladen(s);
  assert.deepEqual(s.geholt, ['players.json'], 'nur die richtige Datei wird geholt');
  assert.equal(s.PLAYERS.seen, true);
  assert.equal(s.gespeichert.playerList.list.length, 151, 'Legenden und Spieler zusammen');
  // Array.from: Das Array entsteht im vm und hat dort einen anderen Prototyp.
  assert.deepEqual(Array.from(s.gespeichert.playerList.list[0]), [41, 'Iniesta', 92, 'Andrés Iniesta Luján']);
  assert.deepEqual(s.warnungen, [], 'kein Grund zu warnen');
});

test('ohne jede passende Adresse passiert gar nichts', () => {
  // Frueher wie heute: Solange die Web App die Datei nicht geladen hat,
  // gibt es nichts zu holen - und keinen Grund fuer eine Warnung.
  const s = setup([BASIS + 'squadData.json']);
  return nachladen(s).then(() => {
    assert.deepEqual(s.geholt, []);
    assert.deepEqual(s.warnungen, []);
  });
});

test('scheitert das Laden, gibt es genau eine Meldung', async () => {
  const s = setup(ECHTE_ADRESSEN, { fetchKaputt: true });
  await nachladen(s);
  assert.equal(s.warnungen.length, 1, 'eine Meldung, nicht eine pro Versuch');
  assert.match(s.warnungen[0], /ohne Erfolg/);
});

test('ein zweiter Anlauf laedt nicht noch einmal', async () => {
  const s = setup(ECHTE_ADRESSEN);
  await nachladen(s);
  await nachladen(s);
  assert.deepEqual(s.geholt, ['players.json']);
});

// --- Der Leser selbst --------------------------------------------------------

test('der Leser kommt mit der echten Form von players.json zurecht', () => {
  const s = setup([]);
  s.context.roh = ECHT_PLAYERS;
  const liste = vm.runInContext('parsePlayers(roh)', s.context);
  assert.equal(liste.length, 151);
  // [id, Anzeigename, Rating, voller Name]
  assert.deepEqual(Array.from(liste[0]), [41, 'Iniesta', 92, 'Andrés Iniesta Luján']);
  assert.deepEqual(Array.from(liste[1]), [1000, 'Vor0 Nach0', 80, '']);
});

test('aus den Icons liest er nichts heraus - sie haben keine Namen', () => {
  // Der Grund, warum die alte Auswahl still auf 0 Eintraegen landete.
  const s = setup([]);
  s.context.roh = ECHT_ICONS;
  assert.equal(vm.runInContext('parsePlayers(roh)', s.context).length, 0);
});

test('eine zu kurze Liste wird nicht gespeichert', async () => {
  // Schutz gegen halb geladene Dateien: lieber die alte Liste behalten.
  const s = setup([]);
  s.context.kurz = JSON.stringify({ Players: [{ c: 'Einer', id: 1, r: 80 }] });
  const ok = await vm.runInContext('savePlayers(kurz, "Test", "https://www.ea.com/x/players.json")', s.context);
  assert.equal(ok, false);
  assert.equal(s.gespeichert.playerList, undefined);
  assert.match(s.warnungen[0], /übersprungen \(1 Einträge\)/);
});

test('leise gesetzt schweigt savePlayers - fuer das Durchprobieren', async () => {
  const s = setup([]);
  s.context.kurz = JSON.stringify({ Players: [{ c: 'Einer', id: 1, r: 80 }] });
  await vm.runInContext('savePlayers(kurz, "Test", "https://www.ea.com/x/players.json", true)', s.context);
  assert.deepEqual(s.warnungen, []);
});
