// Interruttore tema chiaro/scuro per le pagine statiche (stessa chiave usata dal sito principale)
(function () {
  var languageScript = document.createElement('script');
  languageScript.src = '/language.js';
  languageScript.defer = true;
  document.head.appendChild(languageScript);

  var b = document.getElementById('themeToggle'); if (!b) return;
  function sync() { var d = document.documentElement.classList.contains('dark'); b.textContent = d ? '☀️' : '🌙'; b.setAttribute('aria-pressed', String(d)); b.setAttribute('aria-label', d ? 'Attiva modalità chiara' : 'Attiva modalità scura'); }
  sync();
  b.addEventListener('click', function () { var d = !document.documentElement.classList.contains('dark'); document.documentElement.classList.toggle('dark', d); try { localStorage.setItem('ts-theme', d ? 'dark' : 'light'); } catch (e) {} sync(); });
})();
