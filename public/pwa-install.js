/*! TrendScan – registrazione PWA + banner "Installa l'app" nella home */
(function () {
  'use strict';

  // 1) Service worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }

  // 2) Se l'app è già installata o l'utente ha chiuso il banner da poco, non mostrare nulla
  var isStandalone =
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var KEY = 'trendscanInstallDismissedAt';
  var DAYS = 14; // dopo la chiusura, riproponi dopo 14 giorni

  function recentlyDismissed() {
    try {
      var t = parseInt(localStorage.getItem(KEY) || '0', 10);
      return !!t && Date.now() - t < DAYS * 86400000;
    } catch (e) { return false; }
  }
  if (isStandalone || recentlyDismissed()) return;

  // 3) Stile (colori del brand TrendScan, modificabili dalle due variabili)
  var css = '' +
    ':root{--ts-install-a:#e8412c;--ts-install-b:#b8301f;}' +
    '#ts-install{display:flex;align-items:center;gap:12px;flex-wrap:wrap;width:100%;box-sizing:border-box;' +
    'padding:14px 18px;background:linear-gradient(135deg,var(--ts-install-a),var(--ts-install-b));color:#fff;' +
    'border-radius:14px;box-shadow:0 6px 20px rgba(232,65,44,.35);font-family:inherit;' +
    'animation:ts-pulse 2.6s ease-in-out infinite}' +
    '#ts-install[hidden]{display:none}' +
    '#ts-install .ts-icon{flex:none;width:44px;height:44px;border-radius:12px;background:#fff;color:var(--ts-install-a);' +
    'display:flex;align-items:center;justify-content:center}' +
    '#ts-install .ts-txt{flex:1;min-width:200px;display:flex;flex-direction:column;gap:2px;line-height:1.3}' +
    '#ts-install .ts-txt strong{font-size:1.05rem;font-weight:800}' +
    '#ts-install .ts-txt span{font-size:.9rem;opacity:.95}' +
    '#ts-install-btn{background:#fff;color:var(--ts-install-a);border:0;border-radius:999px;' +
    'padding:10px 22px;font-weight:800;font-size:1rem;cursor:pointer;transition:transform .15s}' +
    '#ts-install-btn:hover{transform:scale(1.05)}' +
    '#ts-install-btn:focus-visible,#ts-install-x:focus-visible{outline:3px solid #fff;outline-offset:2px}' +
    '#ts-install-x{background:transparent;border:0;color:#fff;font-size:1.2rem;cursor:pointer;padding:4px 8px}' +
    '@keyframes ts-pulse{0%,100%{box-shadow:0 6px 20px rgba(232,65,44,.35)}50%{box-shadow:0 6px 30px rgba(232,65,44,.75)}}' +
    '@media (prefers-reduced-motion:reduce){#ts-install{animation:none}}';

  var deferredPrompt = null;
  var banner = null;

  function build() {
    if (banner) return banner;

    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    banner = document.createElement('div');
    banner.id = 'ts-install';
    banner.hidden = true;
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Installa TrendScan');
    banner.innerHTML =
      '<span class="ts-icon" aria-hidden="true"><svg width="26" height="26" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
      '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.6" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg></span>' +
      '<div class="ts-txt"><strong>Installa TrendScan sul tuo dispositivo</strong>' +
      '<span id="ts-install-sub">Un tocco e la trovi nella schermata Home: si apre pi\u00F9 veloce, a schermo intero, come una vera app.</span></div>' +
      '<button id="ts-install-btn" type="button">Installa l\u2019app</button>' +
      '<button id="ts-install-x" type="button" aria-label="Chiudi">\u2715</button>';

    // Posizione: nella home, al posto dello slot previsto in index.html (in alto, sotto il titolo nascosto)
    var slot = document.getElementById('pwa-install-slot');
    if (slot && slot.parentNode) {
      slot.parentNode.insertBefore(banner, slot);
    } else {
      // ripiego: subito dopo l'header
      var header = document.querySelector('header');
      banner.style.margin = '12px auto';
      banner.style.maxWidth = '1280px';
      if (header && header.parentNode) header.parentNode.insertBefore(banner, header.nextSibling);
      else document.body.insertBefore(banner, document.body.firstChild);
    }

    document.getElementById('ts-install-x').addEventListener('click', function () {
      banner.hidden = true;
      try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {}
    });

    document.getElementById('ts-install-btn').addEventListener('click', function () {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function () {
          deferredPrompt = null;
          banner.hidden = true;
        });
      } else if (isIOS) {
        alert('Su iPhone/iPad: in Safari tocca il pulsante Condividi (\u2B06\uFE0F) e poi \u201CAggiungi alla schermata Home\u201D.');
      }
    });
    return banner;
  }

  function init() {
    // Android, Chrome, Edge, desktop: il browser avvisa quando il sito è installabile
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      build().hidden = false;
    });

    // iOS / Safari: niente prompt automatico, si mostrano le istruzioni
    if (isIOS) {
      var b = build();
      document.getElementById('ts-install-sub').textContent =
        'In Safari tocca Condividi \u2B06\uFE0F e scegli \u201CAggiungi alla schermata Home\u201D.';
      document.getElementById('ts-install-btn').textContent = 'Come si fa?';
      b.hidden = false;
    }

    window.addEventListener('appinstalled', function () {
      if (banner) banner.hidden = true;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
