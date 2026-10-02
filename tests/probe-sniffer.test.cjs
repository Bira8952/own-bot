const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'sniffer.js'), 'utf8');
const section = source.slice(source.indexOf('  const PROBE_SERVICES = ['), source.indexOf('  // content.js fragt beim Laden nach'));

// Baut eine Seite nach, wie die FC Web App sie bereitstellen wuerde.
function setup(fensterInhalt) {
  const gesendet = [];
  const aufgerufen = [];
  const window = Object.assign({ location: { href: 'https://www.ea.com/x', origin: 'https://www.ea.com' } }, fensterInhalt);
  const context = vm.createContext({
    window, Date, Number, Boolean, String, Object,
    post: (m) => gesendet.push(m),
    aufgerufen
  });
  vm.runInContext(section, context);
  vm.runInContext('reportProbe()', context);
  return { gesendet, aufgerufen, bericht: gesendet[0] };
}

// Ein Dienst, der protokolliert, falls ihn jemand doch aufruft.
function dienst(anzahlParameter, name, aufgerufen) {
  const args = Array.from({ length: anzahlParameter }, (_, i) => 'a' + i).join(',');
  // eslint-disable-next-line no-new-func
  return new Function('melde', 'name', `return function (${args}) { melde(name); }`)((n) => aufgerufen.push(n), name);
}

test('meldet vorhandene Dienste samt Parameterzahl', () => {
  const aufgerufen = [];
  const s = setup({
    services: {
      Item: {
        searchTransferMarket: dienst(2, 'searchTransferMarket', aufgerufen),
        bid: dienst(2, 'bid', aufgerufen),
        clearTransferMarketCache: dienst(0, 'clear', aufgerufen)
      }
    }
  });
  assert.equal(s.bericht.__ownbot, 'probe');
  assert.equal(s.bericht.services['Item.searchTransferMarket'].found, true);
  assert.equal(s.bericht.services['Item.searchTransferMarket'].args, 2);
  assert.equal(s.bericht.services['Item.clearTransferMarketCache'].args, 0);
  assert.equal(s.bericht.globals.services, true);
});

test('ruft keinen einzigen Dienst auf - das waere eine echte EA-Anfrage', () => {
  const aufgerufen = [];
  setup({
    services: {
      Item: {
        searchTransferMarket: dienst(2, 'searchTransferMarket', aufgerufen),
        bid: dienst(2, 'bid', aufgerufen),
        list: dienst(4, 'list', aufgerufen),
        move: dienst(3, 'move', aufgerufen),
        discard: dienst(1, 'discard', aufgerufen)
      },
      User: { getUser: dienst(0, 'getUser', aufgerufen) }
    }
  });
  assert.deepEqual(aufgerufen, [], 'die Sonde darf ausschliesslich nachsehen');
});

test('fehlende Dienste werden als fehlend gemeldet, nicht als Fehler', () => {
  const s = setup({ services: { Item: {} } });
  assert.equal(s.bericht.services['Item.bid'].found, false);
  assert.equal(s.bericht.services['User.getUser'].found, false);
  assert.equal(s.bericht.globals.services, true);
});

test('ganz ohne Web App kommt ein vollstaendiger Fehlbericht', () => {
  const s = setup({});
  assert.equal(s.bericht.globals.services, false);
  assert.equal(s.bericht.globals.UTSearchCriteriaDTO, false);
  assert.equal(s.bericht.criteria, null);
  assert.equal(s.bericht.itemPile, null);
  assert.equal(Object.values(s.bericht.services).every((x) => x.found === false), true);
});

test('liest die Felder der Suchkriterien aus', () => {
  function UTSearchCriteriaDTO() {
    this.maskedDefId = null;
    this.maxBuy = 0;
    this.minBid = 0;
    this['kaputt-name'] = 1; // darf nicht durchkommen
  }
  const s = setup({ UTSearchCriteriaDTO });
  assert.deepEqual(Array.from(s.bericht.criteria), ['maskedDefId', 'maxBuy', 'minBid']);
  assert.equal(s.bericht.globals.UTSearchCriteriaDTO, true);
});

test('ein Kriterien-Objekt, das beim Erzeugen wirft, legt die Sonde nicht lahm', () => {
  function UTSearchCriteriaDTO() { throw new Error('nope'); }
  const s = setup({ UTSearchCriteriaDTO, services: { Item: {} } });
  assert.equal(s.bericht.criteria, null);
  assert.equal(s.bericht.__ownbot, 'probe', 'der Bericht kommt trotzdem');
});

test('meldet die Ablagen aus ItemPile', () => {
  const s = setup({ ItemPile: { CLUB: 'club', TRANSFER: 'transfer', 3: 'zahl' } });
  const pile = Array.from(s.bericht.itemPile);
  assert.ok(pile.includes('CLUB'));
  assert.ok(pile.includes('TRANSFER'));
  assert.equal(pile.includes('3'), false, 'Zahlen sind keine gueltigen Namen');
});

test('liest Fehlercodes mit ihren Zahlen aus', () => {
  const s = setup({ UtasErrorCode: { CAPTCHA_REQUIRED: 458, PERMISSION_DENIED: 461, LOCKED_TRANSFER_MARKET: 494 } });
  assert.equal(s.bericht.errorCodes.CAPTCHA_REQUIRED, 458);
  assert.equal(s.bericht.errorCodes.LOCKED_TRANSFER_MARKET, 494);
  assert.equal(s.bericht.globals.UtasErrorCode, true);
});

test('Eintraege ohne brauchbare Zahl werden uebersprungen', () => {
  const s = setup({ UtasErrorCode: { GUT: 458, TEXT: 'nein', LEER: null, 'kaputt-name': 1, AUCH_GUT: 461 } });
  assert.deepEqual(Object.keys(s.bericht.errorCodes).sort(), ['AUCH_GUT', 'GUT']);
});

test('ohne Fehlercode-Enum bleibt das Feld leer', () => {
  const s = setup({});
  assert.equal(s.bericht.errorCodes, null);
  assert.equal(s.bericht.globals.UtasErrorCode, false);
});

test('erkennt die Hauptanwendung und ihre Ansicht', () => {
  const s = setup({ _appMain: { _rootViewController: {} } });
  assert.equal(s.bericht.globals.appMain, true);
  assert.equal(s.bericht.globals.rootViewController, true);
});
