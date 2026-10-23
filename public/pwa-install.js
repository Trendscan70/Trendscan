/*! TrendScan – PWA: registrazione del service worker e pulsante "Installa l'app".
 *  Il pulsante è nell'HTML (attributo data-install): qui gli diamo il comportamento giusto.
 *   - Chrome/Edge/Android: se il browser offre l'installazione nativa, un tocco apre la finestra di sistema.
 *   - iPhone/iPad (Safari e altri), Safari su Mac, Firefox e altri browser: una finestra spiega i passi da fare sul proprio dispositivo.
 *   - Se l'app è già installata (o aperta come app) il pulsante sparisce.
 */
(function () {
  'use strict';

  // 1) Service worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }

  // 2) Stato e piattaforma
  var ua = navigator.userAgent || '';
  var isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  var isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isAndroid = /android/i.test(ua);
  var isFirefox = /firefox|fxios/i.test(ua);
  var isEdge = /edg\//i.test(ua);
  var isChromium = /chrome|crios|chromium/i.test(ua) && !isEdge;
  var isSafariDesktop = !isIOS && /safari/i.test(ua) && !/chrome|crios|chromium|edg\//i.test(ua) && /macintosh/i.test(ua);
  var deferred = null;

  function buttons() { return document.querySelectorAll('[data-install]'); }
  function hideButtons() { buttons().forEach(function (b) { b.hidden = true; }); }
  if (isStandalone) { document.documentElement.classList.add('is-standalone'); hideButtons(); window.addEventListener('DOMContentLoaded', hideButtons); }

  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; });
  window.addEventListener('appinstalled', function () { deferred = null; hideButtons(); closeDialog(); });

  // 3) Istruzioni per piattaforma
  function steps() {
    if (isIOS) return { title: 'Aggiungi TrendScan alla schermata Home', list: [
      'Tocca il pulsante <strong>Condividi</strong> (il quadrato con la freccia verso l\'alto) nella barra di Safari.',
      'Scorri il menu e scegli <strong>«Aggiungi alla schermata Home»</strong>.',
      'Tocca <strong>Aggiungi</strong>: l\'icona di TrendScan comparirà tra le tue app.'
    ], note: 'Se non vedi l\'opzione, apri questa pagina in Safari e riprova.' };
    if (isSafariDesktop) return { title: 'Aggiungi TrendScan al Dock', list: [
      'Nel menu di Safari scegli <strong>File → Aggiungi al Dock</strong>.',
      'Conferma con <strong>Aggiungi</strong>: TrendScan si apre in una finestra tutta sua, come un\'app.'
    ], note: 'Serve Safari 17 o successivo.' };
    if (isAndroid) return { title: 'Installa TrendScan sul telefono', list: [
      'Apri il menu del browser (i tre puntini in alto a destra).',
      'Scegli <strong>«Installa app»</strong> oppure <strong>«Aggiungi a schermata Home»</strong>.',
      'Conferma: l\'icona di TrendScan comparirà tra le tue app.'
    ], note: 'Se non vedi l\'opzione, prova con Chrome.' };
    if (isChromium || isEdge) return { title: 'Installa TrendScan sul computer', list: [
      'Cerca l\'icona di installazione nella barra degli indirizzi (un monitor con una freccia), oppure apri il menu <strong>⋮</strong>.',
      'Scegli <strong>«Installa TrendScan»</strong> e conferma.'
    ], note: 'Se non vedi l\'opzione, l\'app potrebbe essere già installata.' };
    return { title: 'Installa TrendScan', list: [
      'Apri il menu del browser e cerca <strong>«Installa app»</strong> o <strong>«Aggiungi a schermata Home»</strong>.',
      isFirefox ? 'Firefox per computer non supporta ancora l\'installazione delle app web: con Chrome, Edge o Safari puoi installare TrendScan.' : 'Se il tuo browser non offre l\'installazione, prova con Chrome, Edge o Safari.'
    ], note: 'Puoi sempre aggiungere TrendScan ai preferiti per ritrovarlo in un tocco.' };
  }

  var dlg = null;
  function openDialog() {
    var s = steps();
    if (!dlg) {
      dlg = document.createElement('dialog'); dlg.id = 'ts-install-dlg'; dlg.setAttribute('aria-labelledby', 'ts-install-title'); document.body.appendChild(dlg);
      dlg.addEventListener('click', function (e) { if (e.target === dlg || (e.target.closest && e.target.closest('[data-close]'))) closeDialog(); });
    }
    dlg.innerHTML = '<div class="in"><h2 id="ts-install-title">📲 ' + s.title + '</h2><ol>' + s.list.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ol><p>' + s.note + '</p><button type="button" data-close>Ho capito</button></div>';
    if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', '');
  }
  function closeDialog() { if (dlg && dlg.open) { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); } }

  // 4) Clic sul pulsante
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-install]'); if (!b) return;
    if (deferred) {
      var d = deferred; deferred = null;
      d.prompt();
      (d.userChoice || Promise.resolve({})).then(function (c) { if (c && c.outcome === 'accepted') hideButtons(); });
    } else openDialog();
  });
})();
