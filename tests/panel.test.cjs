const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const designCss = fs.readFileSync(path.join(__dirname, '..', 'popup-design.css'), 'utf8');
const section = source.slice(source.indexOf('  const PANEL_CSS = `'), source.indexOf('  function mountPanel()'));

// Die Leiste baut popup.html heute selbst in ihr Shadow DOM ein, statt einen
// Erweiterungs-Rahmen zu laden. Grund, hart erarbeitet: Chrome laesst
// Erweiterungsseiten aus Bildschirmaufnahmen anderer Erweiterungen weg - der
// Rahmen war fuer jedes Werkzeug unsichtbar, obwohl er beim Nutzer stand.
// Von der Seite selbst gezeichnet ist die Oberflaeche sichtbar, und das
// geschlossene Shadow DOM haelt die EA-Seite trotzdem draussen.

// Kleinstes Ersatz-DOM, nur so viel wie das Panel benutzt.
function knoten(tag) {
  const node = {
    tag,
    className: '',
    textContent: '',
    title: '',
    kinder: [],
    attribute: {},
    stil: {},
    schatten: null,
    hoerer: {},
    append(...k) { node.kinder.push(...k); },
    setAttribute(name, wert) { node.attribute[name] = wert; },
    getAttribute(name) { return name in node.attribute ? node.attribute[name] : null; },
    // Im Browser schreibt "el.src = ..." auch das Attribut.
    set src(v) { node.attribute.src = v; },
    get src() { return node.attribute.src || ''; },
    addEventListener(name, fn) { node.hoerer[name] = fn; },
    // Wie im Browser: el.click() loest den eingetragenen Klick-Horcher aus.
    click() { if (node.hoerer.click) node.hoerer.click({}); },
    breite: 0,
    hoehe: 0,
    // Gewuenschte Breite aus dem CSS, solange keine eigene gesetzt ist.
    cssBreite: 0,
    nachrechnen() {
      const gewuenscht = parseInt(node.stil.widthInline, 10) || node.cssBreite || node.breite;
      const deckel = parseInt(node.stil.maxWidthInline, 10) || Infinity;
      node.breite = Math.min(gewuenscht, deckel);
    },
    getBoundingClientRect: () => ({ width: node.breite, height: node.hoehe, left: 0, top: 0 }),
    style: {
      setProperty: (name, wert, prio) => { node.stil[name] = { wert, prio }; },
      removeProperty: (name) => { delete node.stil[name]; },
      set width(v) { node.stil.widthInline = v; node.nachrechnen(); },
      get width() { return node.stil.widthInline || ''; },
      set maxWidth(v) { node.stil.maxWidthInline = v; node.nachrechnen(); },
      get maxWidth() { return node.stil.maxWidthInline || ''; }
    },
    classList: {
      toggle: (name, an) => {
        const set = new Set(node.className.split(' ').filter(Boolean));
        if (an) set.add(name); else set.delete(name);
        node.className = Array.from(set).join(' ');
      },
      add: (name) => node.classList.toggle(name, true),
      remove: (name) => node.classList.toggle(name, false)
    },
    attachShadow(optionen) {
      node.schatten = { mode: optionen.mode, kinder: [], append(...k) { node.schatten.kinder.push(...k); } };
      return node.schatten;
    }
  };
  return node;
}

// Nachgemachtes popup.html-Dokument, wie DOMParser es liefern wuerde.
function dokumentFake() {
  const script = knoten('script');
  const link = knoten('link');
  const bildRelativ = knoten('img');
  bildRelativ.attribute.src = 'icon128.png';
  const bildAbsolut = knoten('img');
  bildAbsolut.attribute.src = 'https://www.ea.com/bild.png';
  const inhalt = knoten('div');
  const entfernt = [];
  script.remove = () => entfernt.push('script');
  link.remove = () => entfernt.push('link');
  return {
    entfernt,
    bildRelativ,
    bildAbsolut,
    inhalt,
    querySelectorAll: (sel) => (sel === 'script, link' ? [script, link] : sel === 'img' ? [bildRelativ, bildAbsolut] : []),
    body: { children: [inhalt] }
  };
}

function setup(optionen) {
  const o = optionen || {};
  const STATE = { running: false, level: 'idle' };
  const gespeichert = {};
  const warnungen = [];
  const fenster = { hoerer: [], groesse: [], breite: 1920 };
  const uhren = [];
  const koerper = knoten('body'); // das <body> der EA-Seite
  const wurzelEl = knoten('html'); // das <html> der EA-Seite, traegt die Zustandsmeldung
  const kopf = knoten('head');
  const dok = dokumentFake();
  const startAufrufe = [];
  const context = vm.createContext({
    STATE,
    Boolean, String, Number, Object, Array, Set, Promise, JSON, RegExp,
    extensionAlive: () => true,
    clearInterval: () => { PANEL.timer = null; },
    warn: (t) => warnungen.push(t),
    setTimeout: (fn, ms) => { uhren.push({ fn, ms }); },
    Math,
    toInt: (v) => { const n = Number(v); return Number.isFinite(n) ? Math.floor(n) : NaN; },
    str: (v, max) => String(v == null ? '' : v).slice(0, max),
    befehlAusfuehren: (cmd, extra) => ({ ok: true, cmd, extra }),
    DOMParser: class { parseFromString() { return dok; } },
    getComputedStyle: () => ({ visibility: 'visible', opacity: '1', display: 'block' }),
    document: {
      createElement: knoten,
      body: koerper,
      documentElement: wurzelEl,
      head: kopf,
      getElementById: () => null
    },
    window: {
      addEventListener: (name, fn) => {
        if (name === 'message') fenster.hoerer.push(fn);
        if (name === 'resize') fenster.groesse.push(fn);
      },
      removeEventListener: (name, fn) => {
        const liste = name === 'resize' ? fenster.groesse : fenster.hoerer;
        const i = liste.indexOf(fn);
        if (i >= 0) liste.splice(i, 1);
      },
      get innerWidth() { return fenster.breite; }
    },
    fetch: (url) => {
      if (o.fetchKaputt) return Promise.reject(new Error('Failed to fetch'));
      const text = String(url).includes('.css') ? (o.css != null ? o.css : designCss) : '<html><body><div></div></body></html>';
      return Promise.resolve({ ok: true, text: () => Promise.resolve(text) });
    },
    globalThis: {
      __fc27PopupStart: o.ohnePopupJs ? undefined : (wurzel, bot) => { startAufrufe.push({ wurzel, bot }); }
    },
    chrome: {
      runtime: { id: 'testid', getURL: (p) => 'chrome-extension://testid/' + p },
      storage: { local: { set: (obj) => { Object.assign(gespeichert, obj); return Promise.resolve(); } } }
    }
  });
  vm.runInContext(section, context);
  // Der Ausschnitt legt PANEL selbst an. Haetten wir ein eigenes hineingereicht,
  // wuerde es davon verdeckt - die Tests saehen dann ein Objekt, das der Code
  // gar nicht benutzt, und waeren wertlos.
  const PANEL = vm.runInContext('PANEL', context);
  PANEL.timer = 1; // so, als liefe der Takt schon
  const gezeichnet = [];
  const zeichne = () => {
    const vorher = PANEL.last;
    vm.runInContext('updatePanel()', context);
    if (PANEL.last !== vorher) gezeichnet.push(PANEL.last);
  };
  return { context, STATE, PANEL, gespeichert, zeichne, gezeichnet, warnungen, fenster, uhren, koerper, wurzelEl, kopf, dok, startAufrufe };
}

const bauen = (s) => vm.runInContext('buildPanel()', s.context);
const einbauen = (s) => vm.runInContext('oberflaecheEinbauen()', s.context);
// mountPanel() meldet den Fenster-Horcher an und liegt ausserhalb dieses
// Ausschnitts. Hier dasselbe von Hand, mit der echten Funktion.
const fensterHoererAnmelden = (s) => vm.runInContext('window.addEventListener("resize", seiteAnpassen)', s.context);

// --- Aufbau -----------------------------------------------------------------

test('beide Schattenwurzeln sind geschlossen', () => {
  // Offen koennte jedes Skript der Seite hineingreifen - in die Leiste wie
  // in die eingebaute Oberflaeche.
  const s = setup();
  const host = bauen(s);
  assert.equal(host.schatten.mode, 'closed');
  const blattHalter = s.PANEL.el.halter.kinder[1];
  assert.equal(blattHalter.className, 'blatt-halter');
  assert.equal(blattHalter.schatten.mode, 'closed');
});

test('Tasten aus dem Menue steigen nicht zur Seite auf', () => {
  // Tastenereignisse kreuzen Schattengrenzen samt key-Wert. Ohne den Stopp
  // am Wirtselement koennte ein gewoehnlicher Horcher der Seite mitlesen,
  // WELCHE Tasten im Menue gedrueckt werden.
  const s = setup();
  const host = bauen(s);
  for (const art of ['keydown', 'keyup', 'keypress', 'input', 'change']) {
    assert.equal(typeof host.hoerer[art], 'function', art + ' wird nicht gestoppt');
    let gestoppt = false;
    host.hoerer[art]({ stopPropagation: () => { gestoppt = true; } });
    assert.equal(gestoppt, true, art + ' laeuft weiter zur Seite');
  }
});

test('das Wirtselement wehrt sich gegen das CSS der Seite', () => {
  // "all: initial" allein verliert gegen eine EA-Regel mit !important.
  const s = setup();
  const host = bauen(s);
  assert.deepEqual(host.stil.all, { wert: 'initial', prio: 'important' });
});

test('die Erklaerung haengt vor dem Blatt im Baum', () => {
  const s = setup();
  bauen(s);
  const halter = s.PANEL.el.halter;
  assert.equal(halter.kinder[0].className, 'notfall');
  assert.equal(halter.kinder[1].className, 'blatt-halter');
});

// --- Einbau der Oberflaeche --------------------------------------------------

test('der Einbau setzt Stil und Inhalt in die zweite Wurzel und startet popup.js', async () => {
  const s = setup();
  bauen(s);
  await einbauen(s);
  const wurzel = s.PANEL.el.blattWurzel;
  assert.equal(wurzel.kinder.length, 2, 'ein Stil, ein Blatt');
  assert.equal(wurzel.kinder[0].tag, 'style');
  assert.equal(wurzel.kinder[1].className, 'blatt');
  assert.deepEqual(wurzel.kinder[1].kinder, [s.dok.inhalt], 'der Inhalt von popup.html');
  assert.equal(s.startAufrufe.length, 1);
  assert.equal(s.startAufrufe[0].wurzel, wurzel, 'popup.js sucht seine Felder in dieser Wurzel');
  assert.equal(typeof s.startAufrufe[0].bot, 'function', 'und bekommt den Botdraht');
});

test('der Botdraht reicht Befehle an den Verteiler durch', async () => {
  const s = setup();
  bauen(s);
  await einbauen(s);
  const antwort = s.startAufrufe[0].bot('status', { a: 1 });
  assert.equal(antwort.ok, true);
  assert.equal(antwort.cmd, 'status');
});

test('Skripte und Stylesheet-Verweise aus popup.html laufen hier nicht mit', async () => {
  // Ein <script> wuerde in der Seite ohnehin in der falschen Welt laufen,
  // und <link> zeigte auf eine Adresse relativ zur EA-Seite.
  const s = setup();
  bauen(s);
  await einbauen(s);
  assert.deepEqual(s.dok.entfernt.sort(), ['link', 'script']);
});

test('relative Bildadressen zeigen auf die Erweiterung, absolute bleiben', async () => {
  // "icon128.png" wuerde sonst bei ea.com gesucht.
  const s = setup();
  bauen(s);
  await einbauen(s);
  assert.equal(s.dok.bildRelativ.src, 'chrome-extension://testid/icon128.png');
  assert.equal(s.dok.bildAbsolut.src, 'https://www.ea.com/bild.png');
});

test('nach gelungenem Einbau ist die Leiste bereit und die Erklaerung weg', async () => {
  const s = setup();
  bauen(s);
  await einbauen(s);
  assert.equal(s.PANEL.bereit, true);
  assert.equal(s.PANEL.el.notfall.hidden, true);
  assert.match(s.wurzelEl.attribute['data-fc27-bot'], /^oberflaeche-bereit /);
});

test('fehlt popup.js, sagt die Leiste das, statt leer zu bleiben', async () => {
  const s = setup({ ohnePopupJs: true });
  bauen(s);
  await einbauen(s);
  assert.equal(s.PANEL.bereit, false);
  assert.ok(s.PANEL.el.halter.className.includes('tot'), 'die Erklaerung muss nach vorn');
  assert.match(s.PANEL.el.details.textContent, /popup\.js/);
  assert.match(s.wurzelEl.attribute['data-fc27-bot'], /^oberflaeche-fehler /);
  assert.equal(s.warnungen.length, 1);
});

test('scheitert das Laden der Dateien, gibt es Erklaerung und Protokolleintrag', async () => {
  const s = setup({ fetchKaputt: true });
  bauen(s);
  await einbauen(s);
  assert.ok(s.PANEL.el.halter.className.includes('tot'));
  assert.match(s.PANEL.el.text.textContent, /Symbol der Erweiterung/, 'der Ausweg muss genannt werden');
  assert.match(s.PANEL.el.details.textContent, /Failed to fetch/);
});

// --- Stylesheet-Umschreibung -------------------------------------------------

test('das echte Stylesheet verliert alle Dokument-Selektoren', () => {
  // :root, html und body gibt es in einer Schattenwurzel nicht. Bliebe einer
  // stehen, faenden seine Regeln nichts - die Oberflaeche waere ungestylt.
  const s = setup();
  const neu = vm.runInContext('stylesheetUmschreiben(css)', Object.assign(s.context, { css: designCss }));
  assert.ok(!/^(:root|html|body)[^-\w]/m.test(neu), 'uebrig geblieben: ' + ((neu.match(/^(?::root|html|body)[^\n]*/mg) || []).join(' | ')));
  assert.ok(neu.includes(':host, :host .blatt {'), 'die Groessenregeln der Leiste');
  assert.ok(neu.includes('.blatt {'), 'die fruehere body-Regel');
});

test('die Schriftvariable --body ueberlebt die Umschreibung', () => {
  // Ein pauschales "body"-Ersetzen haette sie zerstoert - dann faellt die
  // ganze Oberflaeche auf die Ersatzschrift zurueck.
  const s = setup();
  const neu = vm.runInContext('stylesheetUmschreiben(css)', Object.assign(s.context, { css: designCss }));
  assert.ok(neu.includes('--body:'), 'Definition');
  assert.ok(neu.includes('var(--body)'), 'Verwendung');
});

test('die grossen Seitenwerte gewinnen im umgeschriebenen Stylesheet', () => {
  // Beide Token-Bloecke werden zu :host. Der Seitenblock steht spaeter in der
  // Datei und muss deshalb gewinnen - sonst waere die Schrift wieder winzig.
  const s = setup();
  const neu = vm.runInContext('stylesheetUmschreiben(css)', Object.assign(s.context, { css: designCss }));
  const erst = neu.indexOf('--fs-base: 12px');
  const dann = neu.indexOf('--fs-base: 15px');
  assert.ok(erst >= 0 && dann > erst, 'kleine Werte zuerst, grosse danach');
});

// --- Schriften ---------------------------------------------------------------

test('die Schriftregeln wandern mit absoluten Adressen ans Dokument', () => {
  // @font-face aus Schattenwurzeln wendet Chrome nicht zuverlaessig an, und
  // "fonts/..." wuerde bei ea.com gesucht.
  const s = setup();
  vm.runInContext('schriftenAnsDokument(css)', Object.assign(s.context, { css: designCss }));
  assert.equal(s.kopf.kinder.length, 1);
  const stil = s.kopf.kinder[0].textContent;
  assert.match(stil, /@font-face/);
  assert.ok(stil.includes('url("chrome-extension://testid/fonts/'), 'absolute Adresse');
  assert.ok(!stil.includes('url("fonts/'), 'keine relative Adresse mehr');
  assert.ok(!/\.blatt|button|input/.test(stil), 'nur Schriften, keine anderen Regeln');
});

test('die Schriftregeln werden nicht doppelt eingesetzt', () => {
  const s = setup();
  s.context.document.getElementById = () => ({}); // schon vorhanden
  vm.runInContext('schriftenAnsDokument(css)', Object.assign(s.context, { css: designCss }));
  assert.equal(s.kopf.kinder.length, 0);
});

// --- Klick auf das Symbol ---------------------------------------------------

const klappen = (s) => JSON.parse(JSON.stringify(vm.runInContext('panelKlappen()', s.context)));

test('ist die Oberflaeche eingebaut, klappt der Klick die Leiste', async () => {
  const s = setup();
  bauen(s);
  await einbauen(s);
  assert.deepEqual(klappen(s), { ok: true, collapsed: true });
  assert.ok(s.PANEL.el.box.className.includes('mini'));
  assert.deepEqual(klappen(s), { ok: true, collapsed: false }, 'und wieder auf');
});

test('ohne eingebaute Oberflaeche wird nicht geklappt', () => {
  // Eine leere Flaeche zu klappen waere keine Hilfe - der Service Worker
  // oeffnet dann stattdessen einen Tab mit derselben Oberflaeche.
  const s = setup();
  bauen(s);
  assert.deepEqual(klappen(s), { ok: false, reason: 'oberflaeche-fehlt' });
  assert.ok(!s.PANEL.el.box.className.includes('mini'), 'nichts angefasst');
});

// --- Anzeige ----------------------------------------------------------------

test('der Punkt traegt die Farbe des Botzustands', () => {
  const s = setup();
  bauen(s);
  s.STATE.running = true;
  s.STATE.level = 'warn';
  s.zeichne();
  assert.equal(s.PANEL.el.dot.className, 'dot warn');
});

test('steht der Bot, ist der Punkt grau - auch bei alter Fehlerstufe', () => {
  const s = setup();
  bauen(s);
  s.STATE.running = false;
  s.STATE.level = 'error';
  s.zeichne();
  assert.equal(s.PANEL.el.dot.className, 'dot ');
});

test('eingeklappt sieht man trotzdem, dass der Bot laeuft', () => {
  const s = setup();
  bauen(s);
  s.PANEL.collapsed = true;
  s.STATE.running = true;
  s.zeichne();
  assert.match(s.PANEL.el.name.textContent, /läuft/);
});

test('eingeklappt und gestoppt steht nur der Name da', () => {
  const s = setup();
  bauen(s);
  s.PANEL.collapsed = true;
  s.zeichne();
  assert.equal(s.PANEL.el.name.textContent, 'FC27 Own Bot');
});

test('jedes angezeigte Feld loest fuer sich ein Neuzeichnen aus', () => {
  const aenderungen = [
    (s) => { s.STATE.running = true; },
    (s) => { s.STATE.level = 'error'; },
    (s) => { s.PANEL.collapsed = true; }
  ];
  for (const aendern of aenderungen) {
    const s = setup();
    bauen(s);
    s.zeichne();
    const vorher = s.gezeichnet.length;
    aendern(s);
    s.zeichne();
    assert.equal(s.gezeichnet.length, vorher + 1, 'Feld wird im Fingerabdruck nicht beruecksichtigt');
  }
});

test('ohne Aenderung wird nicht neu gezeichnet', () => {
  const s = setup();
  bauen(s);
  s.zeichne();
  s.zeichne();
  s.zeichne();
  assert.equal(s.gezeichnet.length, 1, 'sonst arbeitet das Panel dreimal pro Sekunde umsonst');
});

// --- Einklappen -------------------------------------------------------------

test('Einklappen merkt sich den Zustand', () => {
  const s = setup();
  bauen(s);
  s.PANEL.el.toggle.hoerer.click();
  assert.equal(s.PANEL.collapsed, true);
  assert.equal(s.PANEL.el.toggle.textContent, '+');
  assert.ok(s.PANEL.el.box.className.includes('mini'));
  assert.equal(s.gespeichert.panelCollapsed, true);
});

test('Ausklappen nimmt es zurueck', () => {
  const s = setup();
  bauen(s);
  s.PANEL.el.toggle.hoerer.click();
  s.PANEL.el.toggle.hoerer.click();
  assert.equal(s.PANEL.collapsed, false);
  assert.equal(s.PANEL.el.toggle.textContent, '–');
  assert.ok(!s.PANEL.el.box.className.includes('mini'));
  assert.equal(s.gespeichert.panelCollapsed, false);
});

// --- Platz fuer die Seite ---------------------------------------------------

const anpassen = (s) => vm.runInContext('seiteAnpassen()', s.context);

test('die Seite wird um genau die Breite der Leiste geschmaelert', () => {
  const s = setup();
  bauen(s);
  s.PANEL.el.box.breite = 520;
  anpassen(s);
  assert.deepEqual(s.koerper.stil.width, { wert: 'calc(100% - 520px)', prio: 'important' });
});

test('die Breite wird gemessen, nicht nachgerechnet', () => {
  const s = setup();
  bauen(s);
  for (const breite of [520, 440, 370, 52]) {
    s.PANEL.el.box.breite = breite;
    anpassen(s);
    assert.equal(s.koerper.stil.width.wert, 'calc(100% - ' + breite + 'px)');
  }
});

test('eingeklappt gibt die Leiste den Platz sofort zurueck', () => {
  const s = setup();
  bauen(s);
  s.PANEL.el.box.breite = 520;
  anpassen(s);
  s.PANEL.el.box.breite = 52; // so schmal ist der eingeklappte Streifen
  s.PANEL.el.toggle.hoerer.click();
  assert.equal(s.koerper.stil.width.wert, 'calc(100% - 52px)');
});

test('ohne Aenderung wird der Seitenstil nicht angefasst', () => {
  // Jedes Schreiben zwingt die Web App zu einem neuen Umbruch.
  const s = setup();
  bauen(s);
  s.PANEL.el.box.breite = 520;
  anpassen(s);
  s.koerper.stil.width = 'MARKE';
  anpassen(s);
  anpassen(s);
  assert.equal(s.koerper.stil.width, 'MARKE', 'es wurde erneut geschrieben');
});

test('eine Breite von 0 wird ignoriert', () => {
  const s = setup();
  bauen(s);
  s.PANEL.el.box.breite = 0;
  anpassen(s);
  assert.equal(s.koerper.stil.width, undefined);
  s.PANEL.el.box.breite = 440;
  anpassen(s);
  assert.equal(s.koerper.stil.width.wert, 'calc(100% - 440px)');
});

test('nach einem Neuladen der Erweiterung wird der Platz zurueckgegeben', () => {
  // Dann haengt auch die eingebaute Oberflaeche in der Luft. Eine halbe
  // Bildschirmbreite davon waere nur im Weg.
  const s = setup();
  bauen(s);
  fensterHoererAnmelden(s);
  s.PANEL.el.box.breite = 520;
  anpassen(s);
  assert.equal(s.fenster.groesse.length, 1, 'Vorbedingung: der Horcher ist angemeldet');
  s.context.extensionAlive = () => false;
  s.PANEL.el.box.breite = 52; // die Leiste zieht sich auf den Streifen zusammen
  vm.runInContext('updatePanel()', s.context);
  assert.ok(s.PANEL.el.box.className.includes('mini'));
  assert.equal(s.koerper.stil.width.wert, 'calc(100% - 52px)');
  assert.match(s.PANEL.el.name.textContent, /Tab neu laden/);
  assert.equal(s.PANEL.el.toggle.hidden, true, 'der Knopf tut nichts mehr');
  assert.equal(s.fenster.groesse.length, 0, 'der Fensterhoerer muss weg sein');
});

// --- Breite --------------------------------------------------------------

test('die Leiste ist 415 Pixel breit, wie FUT Simple Trader', () => {
  const css = vm.runInContext('PANEL_CSS', setup().context);
  const box = css.match(/\n\s*\.box\s*\{([^}]*)\}/);
  assert.ok(box, 'keine .box-Regel gefunden');
  assert.match(box[1], /width:\s*415px/);
  assert.match(box[1], /max-width:\s*90%/);
});

test('es gibt keine Stufe, die die Leiste schmaler macht', () => {
  // Gemessen: Unter 400px laeuft die Reiterbeschriftung ueber.
  const css = vm.runInContext('PANEL_CSS', setup().context);
  const stufen = css.match(/@media[^{]*\{[^{}]*\.box[^{}]*\{[^}]*width[^}]*\}/g) || [];
  assert.deepEqual(stufen, [], 'unerwartete Breitenstufe: ' + stufen.join(' | '));
});

// --- Warten auf die Web App -------------------------------------------------

const warteAbschnitt = source.slice(source.indexOf('  const WEB_APP_ROOT ='), source.indexOf('  panelStarten();'));

function warteSetup(wurzelNach) {
  const zustand = { gebaut: 0, jetzt: 0, wartend: [], hoerer: {} };
  const context = vm.createContext({
    Boolean, Number, Date: { now: () => zustand.jetzt },
    PANEL: { host: null },
    mountPanel: () => { zustand.gebaut += 1; },
    setTimeout: (fn, ms) => { zustand.wartend.push({ fn, ms }); },
    document: {
      body: {},
      querySelector: () => (zustand.jetzt >= wurzelNach ? {} : null),
      addEventListener: (name, fn) => { zustand.hoerer[name] = fn; }
    }
  });
  vm.runInContext(warteAbschnitt, context);
  zustand.context = context;
  zustand.anstossen = () => vm.runInContext('panelStarten()', context);
  zustand.lauf = (bis) => {
    zustand.anstossen();
    while (zustand.wartend.length && zustand.jetzt < bis) {
      const naechster = zustand.wartend.shift();
      zustand.jetzt += naechster.ms;
      naechster.fn();
    }
  };
  return zustand;
}

test('solange die Web App fehlt, erscheint nichts', () => {
  const s = warteSetup(Infinity);
  s.anstossen();
  assert.equal(s.gebaut, 0);
  assert.equal(s.wartend.length, 1, 'es muss aber ein naechster Versuch geplant sein');
});

test('sobald die Web App da ist, erscheint die Leiste', () => {
  const s = warteSetup(1200);
  s.lauf(5000);
  assert.equal(s.gebaut, 1);
  assert.ok(s.jetzt >= 1200 && s.jetzt < 2000, 'sie sollte kurz nach der Wurzel kommen, nicht viel spaeter');
});

test('ist die Web App schon da, wird nicht erst gewartet', () => {
  const s = warteSetup(0);
  s.lauf(5000);
  assert.equal(s.gebaut, 1);
  assert.equal(s.jetzt, 0);
});

test('bleibt die Wurzel aus, erscheint die Leiste trotzdem', () => {
  // Benennt EA ".ut-root-view" um, darf die Bedienung nicht fuer immer
  // verschwinden - sonst liefe der Bot, ohne dass jemand ihn stoppen koennte.
  const s = warteSetup(Infinity);
  s.lauf(60000);
  assert.equal(s.gebaut, 1);
  assert.ok(s.jetzt >= 20000, 'erst nach der Wartezeit');
  assert.ok(s.jetzt < 21000, 'aber nicht viel spaeter');
});

test('steht die Leiste schon, wird keine zweite gebaut', () => {
  const s = warteSetup(0);
  s.lauf(1000);
  assert.equal(s.gebaut, 1);
  vm.runInContext('PANEL.host = {}', s.context);
  s.anstossen();
  assert.equal(s.gebaut, 1, 'der zweite Anlauf muss sofort aufhoeren');
  assert.equal(s.wartend.length, 0, 'und auch keinen neuen Versuch planen');
});

test('ohne body wird auf das Dokument gewartet, nicht abgebrochen', () => {
  const s = warteSetup(0);
  s.context.document.body = null;
  s.anstossen();
  assert.equal(s.gebaut, 0);
  assert.ok(s.hoerer.DOMContentLoaded, 'es muss auf DOMContentLoaded gewartet werden');
  s.context.document.body = {};
  s.hoerer.DOMContentLoaded();
  assert.equal(s.gebaut, 1);
});
