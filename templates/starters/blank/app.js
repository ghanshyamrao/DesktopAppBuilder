// Renderer-side script. Talks to the main process via window.api (set up
// in preload.js). Plain DOM + vanilla JS — no build chain needed.

const counterEl = document.getElementById("counter");
const titleEl   = document.getElementById("title");
const infoEl    = document.getElementById("info");

document.getElementById("inc").addEventListener("click", async () => {
  counterEl.textContent = String(await window.api.counter.inc());
});
document.getElementById("reset").addEventListener("click", async () => {
  counterEl.textContent = String(await window.api.counter.reset());
});

// Hydrate initial state from the main process.
(async () => {
  const [count, info] = await Promise.all([
    window.api.counter.get(),
    window.api.appInfo(),
  ]);
  counterEl.textContent = String(count);
  titleEl.textContent = `Welcome to ${info.name}`;
  infoEl.innerHTML =
    `<b>Electron</b> ${info.electronVersion} &middot; ` +
    `<b>Chrome</b> ${info.chromeVersion} &middot; ` +
    `<b>Node</b> ${info.nodeVersion}`;
})().catch((err) => {
  infoEl.textContent = `Failed to load runtime info: ${err?.message ?? err}`;
});
