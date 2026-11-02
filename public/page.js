// Interruttore tema chiaro/scuro per le pagine statiche (stessa chiave usata dal sito principale)
(function () {
  var b = document.getElementById('themeToggle');
  if (b) {
    function sync() { var d = document.documentElement.classList.contains('dark'); b.textContent = d ? '☀️' : '🌙'; b.setAttribute('aria-pressed', String(d)); b.setAttribute('aria-label', d ? 'Attiva modalità chiara' : 'Attiva modalità scura'); }
    sync();
    b.addEventListener('click', function () { var d = !document.documentElement.classList.contains('dark'); document.documentElement.classList.toggle('dark', d); try { localStorage.setItem('ts-theme', d ? 'dark' : 'light'); } catch (e) {} sync(); });
  }

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
