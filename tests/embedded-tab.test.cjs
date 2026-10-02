const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const wurzel = path.join(__dirname, '..');
const popup = fs.readFileSync(path.join(wurzel, 'popup.js'), 'utf8');
const background = fs.readFileSync(path.join(wurzel, 'background.js'), 'utf8');

// Genau der Teil, der entscheidet, welcher Tab die Kauf- und Stoppbefehle
// bekommt. Ein falscher Tab hiesse: Der Knopf tut nichts, oder Schlimmeres.
// Seit dem Umbau gibt es diesen Teil nur noch im eigenen Fenster - in der
// Seite geht send() direkt an content.js, ohne Tabs.
const section = popup.slice(popup.indexOf('async function webAppTab()'), popup.indexOf('let connectionRepair = null;'));

function setup(gefunden) {
  const geschickt = [];
  const context = vm.createContext({
    WEB_APP_RE: /^https:\/\/www\.ea\.com\/(?:.*\/)?ultimate-team\/web-app(?:[/?#]|$)/i,
    Object, Array, String, Boolean, Promise,
    chrome: {
      tabs: {
        query: () => {
          geschickt.push('tabs.query');
          return gefunden instanceof Error ? Promise.reject(gefunden) : Promise.resolve(gefunden);
        }
      }
    }
  });
  vm.runInContext(section, context);
  return { context, geschickt };
}

const hole = (s) => vm.runInContext('webAppTab()', s.context);
const EA1 = 'https://www.ea.com/de-de/ea-sports-fc/ultimate-team/web-app/';
const EA2 = 'https://www.ea.com/ea-sports-fc/ultimate-team/web-app/';

test('der aktive Web-App-Tab hat Vorrang', async () => {
  const s = setup([{ id: 7, url: EA1, active: false }, { id: 9, url: EA2, active: true }]);
  assert.equal((await hole(s)).id, 9);
});

test('ohne aktiven nimmt sie den ersten passenden', async () => {
  const s = setup([{ id: 7, url: EA1, active: false }, { id: 9, url: EA2, active: false }]);
  assert.equal((await hole(s)).id, 7);
});

test('eine aehnlich aussehende Adresse aus der Abfrage wird trotzdem abgelehnt', async () => {
  // Das Muster der Tab-Abfrage ist grober als unseres. Ein Kaufbefehl darf
  // nur an eine Adresse gehen, die wir selbst geprueft haben.
  const s = setup([{ id: 7, url: 'https://www.ea.com.boese.de/ultimate-team/web-app/', active: true }]);
  assert.equal(await hole(s), null);
});

test('keine Web App offen heisst null, nicht irgendein Tab', async () => {
  const s = setup([]);
  assert.equal(await hole(s), null);
});

test('eine scheiternde Tab-Abfrage fuehrt nicht zum Absturz', async () => {
  const s = setup(new Error('kaputt'));
  assert.equal(await hole(s), null);
});

// --- Direkter Draht in der Seite --------------------------------------------

// In der Seite ruft send() den Bot direkt auf. Tabs, Sonden und Reparatur
// duerfen dort gar nicht erst anlaufen - sie gehoeren dem eigenen Fenster.
const sendeAbschnitt = popup.slice(popup.indexOf('async function send(cmd, extra)'), popup.indexOf('function renderCheck('));

function sendeSetup(botAntwort) {
  const beruehrt = [];
  const context = vm.createContext({
    Object, String, Boolean, Promise, JSON,
    BOT: (cmd, extra) => {
      beruehrt.push({ cmd, extra });
      if (botAntwort instanceof Error) throw botAntwort;
      return botAntwort;
    },
    wireCommand: (cmd) => 'v11/' + cmd,
    webAppTab: () => { beruehrt.push('webAppTab'); return Promise.resolve(null); },
    probeBot: () => { beruehrt.push('probeBot'); return Promise.resolve(null); },
    upgradePageConnection: () => { beruehrt.push('upgrade'); return Promise.resolve(null); },
    connectionRepair: null,
    setTimeout: (fn) => fn(),
    chrome: { tabs: { sendMessage: () => { beruehrt.push('tabs.sendMessage'); return Promise.resolve(null); } } }
  });
  vm.runInContext(sendeAbschnitt, context);
  return { context, beruehrt };
}

test('in der Seite geht ein Befehl direkt an den Bot, ohne Tabs', async () => {
  const s = sendeSetup({ ok: true, status: { running: false } });
  const res = await vm.runInContext('send("status", { a: 1 })', s.context);
  assert.equal(res.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(s.beruehrt)), [{ cmd: 'status', extra: { a: 1 } }],
    'weder webAppTab noch probeBot noch tabs duerfen angefasst werden');
});

test('wirft der Bot, kommt ein lesbarer Fehler statt eines Absturzes', async () => {
  const s = sendeSetup(new Error('kaputt'));
  const res = await vm.runInContext('send("start", {})', s.context);
  assert.equal(res.ok, false);
  assert.match(res.error, /kaputt/);
});

test('eine leere Botantwort wird zu einem Fehler, nicht zu undefined', async () => {
  const s = sendeSetup(undefined);
  const res = await vm.runInContext('send("status", {})', s.context);
  assert.equal(res.ok, false);
});

// --- Gegenstueck im Service Worker -----------------------------------------

function workerSetup(klickAntwort) {
  let hoerer = null;
  let klickHoerer = null;
  const spur = { geschickt: [], geoeffnet: [] };
  const context = vm.createContext({
    Object, String, Boolean, Promise, JSON, RegExp,
    chrome: {
      runtime: {
        id: 'testid',
        onMessage: { addListener: (fn) => { hoerer = fn; } },
        getURL: (p) => 'chrome-extension://testid/' + p
      },
      action: { onClicked: { addListener: (fn) => { klickHoerer = fn; } } },
      tabs: {
        create: (o) => { spur.geoeffnet.push(o.url); return Promise.resolve({}); },
        sendMessage: (id, m) => {
          spur.geschickt.push({ id, cmd: m.cmd });
          return klickAntwort instanceof Error ? Promise.reject(klickAntwort) : Promise.resolve(klickAntwort);
        }
      },
      storage: { local: { get: () => Promise.resolve({}) } },
      notifications: { create: () => {} }
    }
  });
  vm.runInContext(background, context);
  return {
    frage: (nachricht, absender) => {
      let antwort;
      hoerer(nachricht, absender, (a) => { antwort = a; });
      return antwort;
    },
    klick: (tab) => klickHoerer(tab),
    spur
  };
}

test('whichTab gibt es nicht mehr - keine Auskunft an niemanden', () => {
  // Der Handler wurde mit dem Rahmen entfernt. Bliebe er versehentlich
  // stehen, koennte jede eigene Seite weiter Tab-Nummern erfragen.
  const { frage } = workerSetup();
  assert.equal(frage({ type: 'whichTab' }, { id: 'testid', tab: { id: 42, url: 'https://www.ea.com/x' } }), undefined);
});

// --- Klick auf das Symbol ---------------------------------------------------

// Frueher oeffnete der Klick ein Chrome-Popup mit derselben Oberflaeche, die
// auch in der Seite steht - dieselbe Bedienung zweimal nebeneinander.
const EA_URL = 'https://www.ea.com/de-de/ea-sports-fc/ultimate-team/web-app/';

test('auf der Web App klappt der Klick die Leiste, ohne einen Tab zu oeffnen', async () => {
  const w = workerSetup({ ok: true, collapsed: true });
  await w.klick({ id: 7, url: EA_URL });
  assert.deepEqual(JSON.parse(JSON.stringify(w.spur.geschickt)), [{ id: 7, cmd: 'v11/togglePanel' }]);
  assert.deepEqual(w.spur.geoeffnet, [], 'kein zweites Fenster mit derselben Oberflaeche');
});

test('meldet die Leiste einen stummen Rahmen, kommt die Bedienung als Tab', async () => {
  // Eine leere Flaeche auf- und zuzuklappen waere keine Hilfe.
  const w = workerSetup({ ok: false, reason: 'rahmen-stumm' });
  await w.klick({ id: 7, url: EA_URL });
  assert.deepEqual(w.spur.geoeffnet, ['chrome-extension://testid/popup.html']);
});

test('antwortet gar niemand, kommt die Bedienung ebenfalls als Tab', async () => {
  // Kein Content-Script im Tab: Dann laeuft der Bot dort ohnehin nicht.
  const w = workerSetup(new Error('Could not establish connection'));
  await w.klick({ id: 7, url: EA_URL });
  assert.deepEqual(w.spur.geoeffnet, ['chrome-extension://testid/popup.html']);
});

test('ausserhalb der Web App oeffnet der Klick die Web App', async () => {
  const w = workerSetup();
  await w.klick({ id: 7, url: 'https://www.google.com/' });
  assert.deepEqual(w.spur.geoeffnet, ['https://www.ea.com/ea-sports-fc/ultimate-team/web-app/']);
  assert.deepEqual(w.spur.geschickt, [], 'einer fremden Seite schicken wir keine Botbefehle');
});

test('eine aehnlich aussehende Adresse gilt nicht als Web App', async () => {
  const w = workerSetup();
  await w.klick({ id: 7, url: 'https://www.ea.com.boese.de/ultimate-team/web-app/' });
  assert.deepEqual(w.spur.geschickt, []);
  assert.deepEqual(w.spur.geoeffnet, ['https://www.ea.com/ea-sports-fc/ultimate-team/web-app/']);
});
