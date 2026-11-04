// Interruttore tema chiaro/scuro per le pagine statiche (stessa chiave usata dal sito principale)
(function () {
  var b = document.getElementById('themeToggle');
  if (b && !document.getElementById('view-home')) {
    function sync() { var d = document.documentElement.classList.contains('dark'); b.textContent = d ? '☀️' : '🌙'; b.setAttribute('aria-pressed', String(d)); b.setAttribute('aria-label', d ? 'Attiva modalità chiara' : 'Attiva modalità scura'); }
    sync();
    b.addEventListener('click', function () { var d = !document.documentElement.classList.contains('dark'); document.documentElement.classList.toggle('dark', d); try { localStorage.setItem('ts-theme', d ? 'dark' : 'light'); } catch (e) {} sync(); });
  }

  var root = document.documentElement;
  var minScale = 0.9, maxScale = 1.3, step = 0.05, scale = 1;
  try {
    var savedScale = localStorage.getItem('ts-font-scale');
    if (savedScale !== null) {
      scale = Number(savedScale);
    } else {
      var legacyValue = localStorage.getItem('ts-guide-fs');
      var legacyIndex = legacyValue === null ? -1 : Number(legacyValue);
      var legacyScales = [0.85, 1, 1.15, 1.3, 1.5];
      if (Number.isInteger(legacyIndex) && legacyIndex >= 0 && legacyIndex < legacyScales.length) {
        scale = Math.max(minScale, Math.min(maxScale, legacyScales[legacyIndex]));
        localStorage.setItem('ts-font-scale', String(scale));
      }
    }
  } catch (e) {}
  if (!Number.isFinite(scale) || scale < minScale || scale > maxScale) scale = 1;

  var controls = document.createElement('div');
  controls.className = 'ts-font-controls';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Dimensione dei caratteri');
  controls.innerHTML = '<span class="ts-font-controls-label">Testo</span>' +
    '<button type="button" data-font-step="-1" aria-label="Riduci dimensione caratteri">A−</button>' +
    '<button type="button" data-font-reset aria-label="Ripristina dimensione predefinita dei caratteri">100%</button>' +
    '<button type="button" data-font-step="1" aria-label="Aumenta dimensione caratteri">A+</button>';
  var decrease = controls.querySelector('[data-font-step="-1"]');
  var reset = controls.querySelector('[data-font-reset]');
  var increase = controls.querySelector('[data-font-step="1"]');

  function applyScale(value, persist) {
    scale = Math.round(Math.max(minScale, Math.min(maxScale, value)) * 100) / 100;
    var baseScale = root.classList.contains('ts-homepage') ? 1.05 : 1;
    root.style.fontSize = (baseScale * scale * 100) + '%';
    reset.textContent = Math.round(scale * 100) + '%';
    decrease.disabled = scale <= minScale;
    increase.disabled = scale >= maxScale;
    if (persist) {
      try { localStorage.setItem('ts-font-scale', String(scale)); } catch (e) {}
    }
  }

  decrease.addEventListener('click', function () { applyScale(scale - step, true); });
  reset.addEventListener('click', function () { applyScale(1, true); });
  increase.addEventListener('click', function () { applyScale(scale + step, true); });
  applyScale(scale, false);
  document.body.appendChild(controls);

  document.addEventListener('click', function (e) {
    var button = e.target.closest('[data-copy-link]');
    if (!button) return;
    var status = button.parentNode.querySelector('[data-copy-status]');
    var link = button.getAttribute('data-copy-link');
    function report(message) { if (status) status.textContent = message; }
    function fallbackCopy() {
      var field = document.createElement('textarea');
      field.value = link;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      var copied = false;
      try { copied = document.execCommand('copy'); } catch (error) { copied = false; } finally { document.body.removeChild(field); }
      report(copied ? 'Link copiato negli appunti.' : 'Copia non riuscita: seleziona e copia il link mostrato sopra.');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(function () {
        report('Link copiato negli appunti.');
      }, fallbackCopy);
    } else {
      fallbackCopy();
    }
  });
})();
