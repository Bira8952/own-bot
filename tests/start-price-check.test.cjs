const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'popup.js'), 'utf8');
const von = source.indexOf('const PRICE_FRESH_MS =');
const section = source.slice(von, source.indexOf('// Bedienung', von));

const MINUTE = 60 * 1000;

function setup({ alter = 60 * MINUTE, vorschlag = 700, entryFehlt = false, pruefungFehlt = null } = {}) {
  const meldungen = [];
  const geprueft = [];
  const history = {};
  const key = (t) => t.playerId + ':' + (t.rating || 0);
  const context = vm.createContext({
    Date, Math, Number, Array, Boolean, Infinity, Promise,
    SALE_FEE: 0.05,
    // Seit dem FST-Modus (01.10.2026) fragt maxAutoChecks den Modus ab.
    // Diese Tests pruefen den strengen Modus.
    fstAn: () => false,
    MAX_TARGETS: 10,
    history,
    targetKey: key,
    fmt: (n) => String(n),
    notice: null,
    lastRes: { ok: true },
    render: () => { meldungen.push(context.startPruefText); },
    loadData: async () => {},
    suggestionFor: () => ({ value: vorschlag }),
    awaitFreshPrice: async (player, rating, k) => {
      geprueft.push(k);
      if (pruefungFehlt) throw new Error(pruefungFehlt);
      if (entryFehlt) return null;
      const eintrag = { t: Date.now(), market: 850 };
      history[k] = [eintrag];
      return eintrag;
    }
  });
  vm.runInContext(section, context);

  // Ein vorhandener, aber alter Preiseintrag.
  const ziel = { playerId: 1, playerName: 'Example', rating: 84, maxPrice: 700 };
  if (alter !== null) history[key(ziel)] = [{ t: Date.now() - alter, market: 850 }];
  return { context, meldungen, geprueft, ziel, history };
}

const pruefen = (s, liste) => {
  s.context.liste = liste || [s.ziel];
  return vm.runInContext('checkPricesBeforeStart(liste)', s.context);
};

test('ein frischer Preis loest gar keine Pruefung aus', async () => {
  const s = setup({ alter: 5 * MINUTE });
  assert.equal(await pruefen(s), null);
  assert.deepEqual(s.geprueft, [], 'keine unnoetige EA-Anfrage');
});

test('ein alter Preis wird vor dem Start neu geprueft', async () => {
  const s = setup({ alter: 30 * MINUTE });
  assert.equal(await pruefen(s), null, 'Preis passt, also darf gestartet werden');
  assert.deepEqual(s.geprueft, ['1:84']);
});

test('ohne jeden Preiseintrag wird ebenfalls geprueft', async () => {
  const s = setup({ alter: null });
  assert.equal(await pruefen(s), null);
  assert.deepEqual(s.geprueft, ['1:84']);
});

test('gefallener Markt blockiert den Start mit klarer Ansage', async () => {
  // Zielpreis 700, neuer Vorschlag nur noch 600.
  const s = setup({ alter: 30 * MINUTE, vorschlag: 600 });
  const meldung = await pruefen(s);
  assert.match(meldung, /Markt ist gefallen/);
  assert.match(meldung, /600/);
  assert.match(meldung, /700/);
});

test('der Zielpreis wird dabei nicht stillschweigend geaendert', async () => {
  const s = setup({ alter: 30 * MINUTE, vorschlag: 600 });
  await pruefen(s);
  assert.equal(s.ziel.maxPrice, 700, 'der eingestellte Preis gehoert dem Nutzer');
});

test('passt der Zielpreis genau zum Vorschlag, wird gestartet', async () => {
  const s = setup({ alter: 30 * MINUTE, vorschlag: 700 });
  assert.equal(await pruefen(s), null);
});

test('Live-Filter werden uebersprungen - die wurden beim Laden geprueft', async () => {
  const s = setup({ alter: 60 * MINUTE });
  s.ziel.source = 'live';
  assert.equal(await pruefen(s), null);
  assert.deepEqual(s.geprueft, []);
});

test('zu viele alte Preise auf einmal blockieren statt das Limit zu sprengen', async () => {
  const s = setup({ alter: 60 * MINUTE });
  const viele = [1, 2, 3, 4].map((id) => ({ playerId: id, playerName: 'P' + id, rating: 84, maxPrice: 700 }));
  const meldung = await pruefen(s, viele);
  assert.match(meldung, /einzeln prüfen/);
  assert.deepEqual(s.geprueft, [], 'lieber gar nicht als 60 Anfragen');
});

test('genau drei alte Preise werden noch geprueft', async () => {
  const s = setup({ alter: 60 * MINUTE });
  const drei = [1, 2, 3].map((id) => ({ playerId: id, playerName: 'P' + id, rating: 84, maxPrice: 700 }));
  assert.equal(await pruefen(s, drei), null);
  assert.equal(s.geprueft.length, 3);
});

test('eine fehlgeschlagene Pruefung startet keinen Lauf', async () => {
  const s = setup({ alter: 30 * MINUTE, pruefungFehlt: 'Keine Session' });
  const meldung = await pruefen(s);
  assert.match(meldung, /fehlgeschlagen/);
  assert.match(meldung, /Keine Session/);
});

test('eine abgebrochene Pruefung startet keinen Lauf', async () => {
  const s = setup({ alter: 30 * MINUTE, entryFehlt: true });
  assert.match(await pruefen(s), /abgebrochen/);
});

test('ohne brauchbaren Vorschlag wird nicht gestartet', async () => {
  const s = setup({ alter: 30 * MINUTE, vorschlag: 0 });
  assert.match(await pruefen(s), /kein sinnvoller Zielpreis/);
});

test('der Fortschritt wird unterwegs angezeigt', async () => {
  const s = setup({ alter: 30 * MINUTE });
  await pruefen(s);
  assert.ok(s.meldungen.some((m) => typeof m === 'string' && m.includes('Preis wird geprüft')));
});
