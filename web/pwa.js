// Shared install layer for every playground project.
// Registers the root service worker, precaches what the page loaded so it
// works offline, and nudges the visitor to install: a native prompt where the
// browser offers one (Android, desktop Chrome), a one-line "Add to Home
// Screen" hint on iPhone. Nothing shows once the app runs from the home screen.
(function () {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  const key = "pwa-hint:" + location.pathname;
  const name = document.querySelector('meta[name="apple-mobile-web-app-title"]')?.content || document.title;
  let deferred = null;
  let toast = null;

  const api = {
    standalone,
    ios: isIOS,
    canPrompt: false,
    shown: false,
    async install() {
      if (!deferred) return "unavailable";
      deferred.prompt();
      const choice = await deferred.userChoice;
      deferred = null;
      api.canPrompt = false;
      hide();
      return choice.outcome;
    },
    show,
    hide
  };
  window.__pwa = api;

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
        precache(reg);
        // Anything that loads later (textures, sprites) gets picked up too.
        setTimeout(() => precache(reg), 6000);
      } catch (err) {
        console.warn("sw register failed", err);
      }
    });
  }

  function precache(reg) {
    const sw = reg.active || navigator.serviceWorker.controller;
    if (!sw) return;
    const urls = new Set([location.pathname, "/", "/pwa.js"]);
    for (const e of performance.getEntriesByType("resource")) {
      if (e.name.startsWith(location.origin)) urls.add(e.name);
    }
    const m = document.querySelector('link[rel="manifest"]');
    if (m) urls.add(m.href);
    for (const l of document.querySelectorAll('link[rel="apple-touch-icon"]')) urls.add(l.href);
    sw.postMessage({ type: "precache", urls: [...urls] });
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    api.canPrompt = true;
    schedule();
  });
  window.addEventListener("appinstalled", () => { deferred = null; api.canPrompt = false; hide(); });

  if (!standalone && isSafari) schedule();

  function schedule() {
    if (standalone || api.shown) return;
    let last = 0;
    try { last = Number(localStorage.getItem(key) || 0); } catch (_) {}
    if (Date.now() - last < 7 * 24 * 3600 * 1000) return;
    setTimeout(show, 9000);
  }

  function show() {
    if (standalone || toast) return;
    api.shown = true;
    toast = document.createElement("div");
    toast.id = "pwa-toast";
    toast.setAttribute("role", "dialog");
    const icon = document.querySelector('link[rel="apple-touch-icon"]')?.href || "";
    const body = api.canPrompt
      ? `<button class="pwa-go" type="button">Install</button>`
      : `<span class="pwa-steps">Tap <b>Share</b> <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 2 8 6h3v9h2V6h3l-4-4Zm-7 8v12h14V10h-4v2h2v8H7v-8h2v-2H5Z"/></svg> then <b>Add to Home Screen</b></span>`;
    toast.innerHTML = `
      ${icon ? `<img class="pwa-icon" src="${icon}" alt="" />` : ""}
      <div class="pwa-text"><strong>Add ${esc(name)} to your phone</strong>${body}</div>
      <button class="pwa-x" type="button" aria-label="Dismiss">×</button>`;
    const style = document.createElement("style");
    style.textContent = `
      #pwa-toast{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:99999;display:flex;gap:12px;align-items:center;padding:12px 10px 12px 12px;border-radius:16px;background:rgba(18,16,32,.94);color:#eef0ff;border:1px solid rgba(255,255,255,.14);box-shadow:0 14px 40px rgba(0,0,0,.5);font:14px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);animation:pwa-in .35s ease-out;max-width:520px;margin:0 auto}
      @keyframes pwa-in{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}
      #pwa-toast .pwa-icon{width:44px;height:44px;border-radius:11px;flex:none}
      #pwa-toast .pwa-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
      #pwa-toast strong{font-weight:700}
      #pwa-toast .pwa-steps{color:rgba(238,240,255,.72)}
      #pwa-toast .pwa-steps svg{vertical-align:-3px;color:#4da3ff}
      #pwa-toast .pwa-go{all:unset;cursor:pointer;align-self:flex-start;min-height:40px;padding:0 18px;border-radius:10px;background:#00f0ff;color:#06040f;font-weight:800;font-size:14px;display:inline-grid;place-items:center}
      #pwa-toast .pwa-x{all:unset;cursor:pointer;flex:none;width:48px;height:48px;display:grid;place-items:center;color:rgba(238,240,255,.7);font-size:26px;line-height:1;border-radius:12px}
      #pwa-toast .pwa-x:active,#pwa-toast .pwa-go:active{opacity:.75}`;
    toast.appendChild(style);
    document.body.appendChild(toast);
    toast.querySelector(".pwa-x").addEventListener("click", hide);
    const go = toast.querySelector(".pwa-go");
    if (go) go.addEventListener("click", () => api.install());
  }

  function hide() {
    if (!toast) return;
    toast.remove();
    toast = null;
    try { localStorage.setItem(key, String(Date.now())); } catch (_) {}
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
})();
