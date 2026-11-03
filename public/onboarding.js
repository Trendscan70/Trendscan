// Percorso di lettura iniziale, scelto in base all'obiettivo indicato in home.
(function () {
  'use strict';
  var form = document.getElementById('pathQuiz');
  var result = document.getElementById('pathResult');
  if (!form || !result) return;

  var paths = {
    budget: {
      title: 'Prima mettiamo in ordine le basi',
      steps: [
        ['Regola 50/30/20 e fondo di emergenza', '/guide/risparmio-50-30-20/'],
        ['Calcola budget e riserva', '/strumenti/budget-fondo-emergenza/'],
        ['Tieni traccia delle spese', '/guide/bilancio-familiare-excel/']
      ]
    },
    invest: {
      title: 'Impara le basi, poi prova i tuoi numeri',
      steps: [
        ['Cos’è un ETF: vantaggi, rischi e costi', '/guide/etf/'],
        ['Come funziona un PAC', '/guide/pac/'],
        ['Prova il PAC con costi e tasse', '/strumenti/pac-realistico/']
      ]
    },
    home: {
      title: 'Confronta le opzioni, non solo la rata',
      steps: [
        ['Metti a fuoco il budget familiare', '/guide/risparmio-50-30-20/'],
        ['Confronta affitto, mutuo e investimento', '/strumenti/affitto-vs-comprare/'],
        ['Ragiona sui costi nel lungo periodo', '/strumenti/pac-realistico/']
      ]
    },
    pension: {
      title: 'Parti dal divario e verifica le ipotesi',
      steps: [
        ['Capisci come cresce un capitale nel tempo', '/guide/interesse-composto/'],
        ['Stima il gap pensionistico', '/strumenti/gap-pensionistico/'],
        ['Prova scenari di risparmio', '/strumenti/obiettivo-risparmio/']
      ]
    }
  };

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var selected = form.querySelector('input[name="goal"]:checked');
    if (!selected || !paths[selected.value]) {
      form.reportValidity();
      return;
    }
    var path = paths[selected.value];
    result.innerHTML = '<h3>' + path.title + '</h3><ol>' + path.steps.map(function (step, index) {
      return '<li><span>' + (index + 1) + '</span><a href="' + step[1] + '">' + step[0] + ' →</a></li>';
    }).join('') + '</ol>';
    result.hidden = false;
    result.focus();
  });
})();
