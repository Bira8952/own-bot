// FC27 Own Bot – background.js (Service Worker)
// Zeigt Chrome-Benachrichtigungen fuer Meldungen aus content.js, z. B. bei
// einem Kauf oder wenn der Bot wegen eines Captchas stoppt.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || sender.id !== chrome.runtime.id) return;
  if (message.type !== "notify") return;
  if (!sender.tab) return; // nur eigenes Content-Script
  chrome.storage.local.get("settings").then(({ settings }) => {
    const s = settings || {};
    if (s.notify === false) return;
    // Spielt der Bot selbst einen Ton (Optionen > Toene), kommt die
    // Benachrichtigung ohne Windows-Ton - sonst klingelt es doppelt.
    const eigenerTon = (message.ton === "kauf" && s.tonKauf === true) || (message.ton === "ende" && s.tonEnde === true);
    chrome.notifications.create({
      type: "basic",
      iconUrl: "img/icon128.png",
      title: String(message.title || "FC27 Own Bot").slice(0, 80),
      message: String(message.message || "").slice(0, 250),
      silent: eigenerTon,
      priority: 1
    });
  });
});

// Erweiterung neu laden - Knopf "Erweiterung neu laden" unter Optionen.
// chrome.runtime.reload() darf nur eine Erweiterungsseite oder dieser Service
// Worker aufrufen, nicht das Content-Script in der EA-Seite. Ohne diesen Weg
// musste man nach jedem Update chrome://extensions oeffnen.
// Nur vom eigenen Content-Script (sender.id + sender.tab), nichts von aussen.
chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || sender.id !== chrome.runtime.id || message.type !== "devReload") return;
  if (!sender.tab) return;
  setTimeout(() => chrome.runtime.reload(), 100);
});

// ---------------------------------------------------------------------------
// Klick auf das Symbol der Erweiterung.
//
// Frueher oeffnete sich hier ein Chrome-Popup mit derselben Oberflaeche, die
// auch in der Seite steht. Das war dieselbe Bedienung zweimal nebeneinander -
// verwirrend, und man konnte in beiden verschiedene Sachen eintragen.
// Jetzt klappt der Klick die Leiste in der Seite ein und aus.
//
// Die Reihenfolge der Rueckfallwege ist Absicht: Erst die Leiste, dann ein
// eigener Tab mit derselben Oberflaeche, zuletzt die Web App selbst. So
// bleibt der Bot auch dann bedienbar, wenn die Leiste nicht laedt.
// ---------------------------------------------------------------------------
const WEB_APP_RE = /^https:\/\/www\.ea\.com\/(?:.*\/)?ultimate-team\/web-app(?:[/?#]|$)/i;

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !WEB_APP_RE.test(tab.url || "")) {
    await chrome.tabs.create({ url: "https://www.ea.com/ea-sports-fc/ultimate-team/web-app/" });
    return;
  }
  let antwort = null;
  try {
    antwort = await chrome.tabs.sendMessage(tab.id, { cmd: "v11/togglePanel" }, { frameId: 0 });
  } catch (e) {
    antwort = null;
  }
  if (antwort && antwort.ok) return;
  // Keine Leiste oder keine eingebaute Oberflaeche: Dann die Bedienung als
  // eigener Tab - dort startet popup.js sich selbst mit dem Dokument.
  await chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
});
