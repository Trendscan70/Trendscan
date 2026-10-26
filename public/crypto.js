(function () {
  'use strict';

  var button = document.getElementById('loadCryptoMarket');
  var widgets = document.getElementById('cryptoMarketWidgets');
  var status = document.getElementById('cryptoMarketStatus');
  var error = document.getElementById('cryptoMarketError');
  var loading = false;
  var loaded = false;
  if (!button || !widgets || !status || !error) return;

  function rankOf(card) {
    var match = card.innerText.replace(/\s+/g, ' ').match(/\bRANK\s+(\d+)\b/i);
    return match ? Number(match[1]) : null;
  }

  function sortByRank() {
    var cards = Array.prototype.slice.call(widgets.children);
    var ranked = cards.filter(function (card) { return rankOf(card) !== null; });
    ranked.sort(function (a, b) { return rankOf(a) - rankOf(b); });
    ranked.concat(cards.filter(function (card) { return rankOf(card) === null; }))
      .forEach(function (card) { widgets.appendChild(card); });
    return ranked.length;
  }

  button.addEventListener('click', function () {
    if (loading || loaded) return;
    loading = true;
    button.disabled = true;
    widgets.hidden = false;
    error.hidden = true;
    status.textContent = 'Caricamento dei dati da CoinMarketCap…';

    var script = document.createElement('script');
    script.src = 'https://files.coinmarketcap.com/static/widget/currency.js';
    script.async = true;
    script.onload = function () {
      var attempts = 0;
      function updateWhenReady() {
        var ranked = sortByRank();
        if (ranked === widgets.children.length) {
          loading = false;
          loaded = true;
          button.textContent = 'Classifica caricata';
          error.hidden = true;
          status.textContent = 'Rank aggiornati da CoinMarketCap per tutte le 10 criptovalute selezionate.';
        } else if (++attempts < 40) {
          window.setTimeout(updateWhenReady, 250);
        } else {
          loading = false;
          loaded = true;
          button.disabled = true;
          button.textContent = ranked ? 'Classifica parziale' : 'Dati non disponibili';
          error.hidden = false;
          widgets.hidden = !ranked;
          status.textContent = ranked
            ? 'CoinMarketCap ha restituito il rank di ' + ranked + ' delle 10 criptovalute selezionate.'
            : 'CoinMarketCap non ha restituito i dati della classifica.';
        }
      }
      updateWhenReady();
    };
    script.onerror = function () {
      loading = false;
      script.remove();
      widgets.hidden = true;
      error.hidden = false;
      status.textContent = '';
      button.disabled = false;
    };
    document.head.appendChild(script);
  });
})();
