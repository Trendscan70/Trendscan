// TrendScan – script delle pagine delle guide (/guide/ e /guide/<guida>/).
// Fa quattro cose: dimensione del testo (A−/A+), pulsante ☰, vecchi indirizzi /guide/#guide-xxx e simulatore PAC.
(function () {
  'use strict';

  // ---- 1. Dimensione del testo (stessa chiave usata finora dal sito: ts-guide-fs)
  var FS_STEPS = [85, 100, 115, 130, 150], fsIndex = 1;
  function applyFontSize() {
    var pct = FS_STEPS[fsIndex], root = document.getElementById('academyRoot'), cryptoRoot = document.getElementById('cryptoRoot');
    var zoomOk = window.CSS && CSS.supports && CSS.supports('zoom', '1.2');
    if (cryptoRoot) document.documentElement.style.fontSize = pct + '%';
    else if (zoomOk) { if (root) root.style.setProperty('--guide-zoom', String(pct / 100)); document.documentElement.style.fontSize = ''; }
    else document.documentElement.style.fontSize = pct + '%';
    document.querySelectorAll('[data-fs="-1"]').forEach(function (b) { b.disabled = fsIndex === 0; });
    document.querySelectorAll('[data-fs="1"]').forEach(function (b) { b.disabled = fsIndex === FS_STEPS.length - 1; });
  }
  try { var v = parseInt(localStorage.getItem('ts-guide-fs'), 10); if (v >= 0 && v < FS_STEPS.length) fsIndex = v; } catch (e) {}
  applyFontSize();

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-fs]');
    if (b && !b.disabled) {
      var d = parseInt(b.dataset.fs, 10);
      fsIndex = d === 0 ? 1 : Math.min(FS_STEPS.length - 1, Math.max(0, fsIndex + d));
      try { localStorage.setItem('ts-guide-fs', String(fsIndex)); } catch (err) {}
      applyFontSize(); return;
    }
    // ---- Condividi (pagine /radar/ e /termometro/): menu di condivisione del telefono, altrimenti copia il link
    var sh = e.target.closest('[data-share]');
    if (sh) {
      var d = sh.dataset, toast = sh.parentNode.querySelector('[data-toast]'), say = function (m) { if (toast) { toast.textContent = m; setTimeout(function () { toast.textContent = ''; }, 2600); } };
      if (navigator.share) { navigator.share({ title: d.shareTitle, text: d.shareText, url: d.shareUrl }).catch(function () {}); return; }
      (navigator.clipboard ? navigator.clipboard.writeText(d.shareUrl) : Promise.reject()).then(function () { say('Link copiato: incollalo dove vuoi'); }, function () { say('Copia l\'indirizzo dalla barra del browser'); });
      return;
    }
    // ---- 2. Pulsante ☰ → indice delle guide
    var go = e.target.closest('[data-go]'); if (go) location.href = go.dataset.go;
  });

  // ---- 3. Vecchi indirizzi: /guide/#guide-etf → /guide/etf/ (prima le guide erano sezioni di una sola pagina)
  var OLD = {
    '#guide-1': 'azioni', '#guide-2': 'risparmio-50-30-20', '#guide-etf': 'etf', '#guide-pac': 'pac', '#guide-pic': 'pic-vs-pac',
    '#guide-composto': 'interesse-composto', '#guide-4': 'simulatore-pac', '#guide-broker': 'broker-pac', '#guide-bilancio': 'bilancio-familiare-excel',
    '#guide-strumenti': 'simulatore-pac'
  };
  if (document.getElementById('academyRoot') && document.getElementById('academyRoot').dataset.hub && OLD[location.hash]) {
    location.replace('/guide/' + OLD[location.hash] + '/');
    return;
  }

  // ---- 4. Simulatore PAC (solo nella pagina del simulatore)
  var elInit = document.getElementById('calcInitial');
  if (!elInit) return;
  var elMonthly = document.getElementById('calcMonthly'), elYears = document.getElementById('calcYears'), elReturn = document.getElementById('calcReturn');
  var chart = null;
  var numberLocale = function () { return document.documentElement.lang || 'it-IT'; };
  var it = function (n) { return n.toLocaleString(numberLocale()); };

  function update() {
    var P = parseFloat(elInit.value), PMT = parseFloat(elMonthly.value), years = parseInt(elYears.value, 10), rate = parseFloat(elReturn.value) / 100;
    document.getElementById('calcInitialVal').textContent = it(P) + ' €';
    document.getElementById('calcMonthlyVal').textContent = it(PMT) + ' € / mese';
    document.getElementById('calcYearsVal').textContent = years + ' Anni';
    document.getElementById('calcReturnVal').textContent = parseFloat(elReturn.value).toFixed(1) + ' %';

    var labels = ['Anno 0'], invested = [P], balanceSeries = [P], bal = P, paid = P, mr = rate / 12;
    for (var y = 1; y <= years; y++) {
      for (var m = 1; m <= 12; m++) { bal = (bal + PMT) * (1 + mr); paid += PMT; }
      labels.push('Anno ' + y); invested.push(Math.round(paid)); balanceSeries.push(Math.round(bal));
    }
    var fin = Math.round(bal), inv = Math.round(paid);
    document.getElementById('resTotalInvested').textContent = it(inv) + ' €';
    document.getElementById('resInterestEarned').textContent = '+' + it(fin - inv) + ' €';
    document.getElementById('resFinalBalance').textContent = it(fin) + ' €';
    drawChart(labels, invested, balanceSeries);
  }

  function drawChart(labels, invested, balanceSeries) {
    var canvas = document.getElementById('compoundChart');
    if (!canvas || !window.Chart) return;   // senza Chart.js (offline/bloccato) restano i numeri
    if (chart) chart.destroy();
    chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: labels, datasets: [
        { label: 'Patrimonio Totale (con Interesse Composto)', data: balanceSeries, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.15)', fill: true, tension: 0.3, borderWidth: 3, pointRadius: 0, pointHoverRadius: 6 },
        { label: 'Capitale Versato (Tuo Risparmio Effettivo)', data: invested, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true, tension: 0.1, borderWidth: 2.5, borderDash: [5, 5], pointRadius: 0 }
      ] },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: '#9ca3af', font: { size: 11 } } },
          tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ' + c.raw.toLocaleString(numberLocale()) + ' €'; } } } },
        scales: {
          x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9ca3af', maxTicksLimit: 10 } },
          y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9ca3af', callback: function (v) { return v >= 1000 ? (v / 1000).toFixed(0) + 'k €' : v + ' €'; } } }
        }
      }
    });
  }

  [elInit, elMonthly, elYears, elReturn].forEach(function (el) { el.addEventListener('input', update); });
  update();
  window.addEventListener('load', update);   // Chart.js è "defer": al caricamento completo ridisegna il grafico
})();
