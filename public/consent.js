/*! TrendScan – consenso ai cookie di statistica e caricamento di Google Analytics (GA4).
 *
 *  Regole (Linee guida cookie del Garante, 10 giugno 2021):
 *   - Google Analytics NON viene caricato finché l'utente non accetta: prima del consenso non parte nessuna richiesta a Google
 *     e non viene creato nessun cookie di statistica.
 *   - «Rifiuta» e «Accetta» sono sullo stesso livello e hanno lo stesso aspetto. Lo scorrimento della pagina non vale come consenso.
 *   - La scelta si cambia in qualsiasi momento da «Preferenze cookie» (qualunque elemento con l'attributo data-consent-open).
 *   - La scelta resta valida 182 giorni (circa 6 mesi), poi il banner si ripropone.
 *   - Se l'utente revoca dopo aver accettato, Analytics viene disattivato e i cookie _ga vengono cancellati.
 *
 *  L'ID di misurazione è una costante qui sotto: è l'unico punto da cambiare.
 *  Il tag Google è caricato qui e solo qui: non incollarlo anche nelle pagine (un tag per pagina).
 */
(function () {
  'use strict';
  var GA_ID = 'G-K072WZXW0N';
  var KEY = 'ts-consent', VERSION = 1, DAYS = 182;

  // ------------------------------------------------------------ scelta salvata
  function read() {
    try {
      var r = JSON.parse(localStorage.getItem(KEY));
      if (!r || r.v !== VERSION || typeof r.analytics !== 'boolean') return null;
      if (Date.now() - r.t > DAYS * 864e5) return null;
      return r;
    } catch (e) { return null; }
  }
  function write(analytics) { try { localStorage.setItem(KEY, JSON.stringify({ v: VERSION, analytics: !!analytics, t: Date.now() })); } catch (e) {} }

  // ------------------------------------------------------------ Google Analytics
  function loadGA() {
    if (window.__tsGA) { window['ga-disable-' + GA_ID] = false; if (window.gtag) window.gtag('consent', 'update', { analytics_storage: 'granted' }); return; }
    window.__tsGA = true;
    window['ga-disable-' + GA_ID] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    // Niente pubblicità né personalizzazione: solo statistiche di utilizzo.
    window.gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' });
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, { allow_google_signals: false, allow_ad_personalization_signals: false });
    var s = document.createElement('script');
    s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
    document.head.appendChild(s);
  }
  function deleteGaCookies() {
    var host = location.hostname.split('.'), domains = [location.hostname, '.' + location.hostname];
    for (var i = 1; i < host.length - 1; i++) domains.push('.' + host.slice(i).join('.'));
    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (name !== '_ga' && name.indexOf('_ga_') !== 0 && name !== '_gid' && name.indexOf('_gat') !== 0) return;
      domains.concat(['']).forEach(function (d) { document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + (d ? '; domain=' + d : ''); });
    });
  }
  function revokeGA() {
    window['ga-disable-' + GA_ID] = true;
    if (window.gtag) window.gtag('consent', 'update', { analytics_storage: 'denied' });
    deleteGaCookies();
  }

  // ------------------------------------------------------------ banner
  var CSS = '#ts-cc{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;padding:.75rem;display:flex;justify-content:center;pointer-events:none;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}' +
    '#ts-cc .cc-box{pointer-events:auto;max-width:58rem;width:100%;background:#fff;color:#111827;border:1px solid #d1d5db;border-radius:1rem;box-shadow:0 20px 60px -15px rgba(0,0,0,.45);padding:1rem 1.1rem;display:flex;flex-direction:column;gap:.85rem;animation:ts-cc-in .25s ease-out}' +
    '@media(min-width:720px){#ts-cc .cc-box{flex-direction:row;align-items:center;gap:1.4rem}}' +
    '#ts-cc h2{font-size:.95rem;font-weight:800;margin:0 0 .3rem;line-height:1.25;color:inherit}' +
    '#ts-cc p{font-size:.8rem;line-height:1.5;margin:0;color:inherit}#ts-cc .cc-text{flex:1}' +
    '#ts-cc a{color:#c2321f;text-decoration:underline;font-weight:600}' +
    '#ts-cc .cc-state{margin-top:.4rem;font-weight:700}' +
    '#ts-cc .cc-btns{display:flex;gap:.6rem;flex-shrink:0}' +
    '#ts-cc button{flex:1;min-width:7.5rem;padding:.75rem 1.3rem;border-radius:.75rem;font-family:inherit;font-weight:800;font-size:.9rem;line-height:1.1;border:2px solid #111827;background:#111827;color:#fff;cursor:pointer}' +
    '#ts-cc button:hover{background:#374151;border-color:#374151}#ts-cc button:focus-visible{outline:3px solid #e8412c;outline-offset:2px}' +
    'html.dark #ts-cc .cc-box{background:#121826;color:#f3f4f6;border-color:#2b3347}html.dark #ts-cc a{color:#ff9b8a}' +
    'html.dark #ts-cc button{background:#f3f4f6;color:#111827;border-color:#f3f4f6}html.dark #ts-cc button:hover{background:#d1d5db;border-color:#d1d5db}' +
    '@keyframes ts-cc-in{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}@media(prefers-reduced-motion:reduce){#ts-cc .cc-box{animation:none}}';

  var box = null, openedByUser = false, lastFocus = null;

  function close() { if (box) { box.remove(); box = null; } if (openedByUser && lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} } openedByUser = false; }
  function choose(accept) {
    write(accept);
    if (accept) loadGA(); else if (window.__tsGA) revokeGA(); else deleteGaCookies();
    close();
  }
  function open(byUser) {
    if (box) return;
    openedByUser = !!byUser; lastFocus = byUser ? document.activeElement : null;
    if (!document.getElementById('ts-cc-style')) { var st = document.createElement('style'); st.id = 'ts-cc-style'; st.textContent = CSS; document.head.appendChild(st); }
    var cur = read();
    box = document.createElement('div'); box.id = 'ts-cc'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-labelledby', 'ts-cc-t'); box.setAttribute('aria-describedby', 'ts-cc-d');
    box.innerHTML = '<div class="cc-box"><div class="cc-text"><h2 id="ts-cc-t">Statistiche di utilizzo: ci aiuti?</h2>' +
      '<p id="ts-cc-d">Con il tuo consenso usiamo <strong>Google Analytics</strong> per capire, in forma aggregata, quali pagine servono di più. Imposta cookie di terze parti (Google) e invia dati a Google, anche negli Stati Uniti. Se rifiuti il sito funziona uguale e Analytics non viene caricato. Puoi cambiare idea quando vuoi da «Preferenze cookie» in fondo alla pagina. ' +
      '<a href="/cookie/">Cookie policy</a> · <a href="/privacy/">Privacy</a></p>' +
      (cur ? '<p class="cc-state">Scelta attuale: ' + (cur.analytics ? 'statistiche accettate' : 'statistiche rifiutate') + '.</p>' : '') + '</div>' +
      '<div class="cc-btns"><button type="button" data-cc="reject">Rifiuta</button><button type="button" data-cc="accept">Accetta</button></div></div>';
    (document.body || document.documentElement).insertBefore(box, (document.body || document.documentElement).firstChild);
    box.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-cc]'); if (b) choose(b.dataset.cc === 'accept'); });
    if (byUser) { var first = box.querySelector('button'); if (first) first.focus(); }
  }

  document.addEventListener('click', function (e) { var t = e.target.closest && e.target.closest('[data-consent-open]'); if (t) { e.preventDefault(); open(true); } });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && box && read()) close(); });   // si può chiudere solo se esiste già una scelta

  window.TrendScanConsent = { open: function () { open(true); }, analytics: function () { var r = read(); return !!(r && r.analytics); } };

  function start() {
    var r = read();
    if (!r) open(false);
    else if (r.analytics) loadGA();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
