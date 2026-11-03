// Tooltip essenziali nei testi editoriali, apribili con mouse, tastiera o tocco.
(function () {
  'use strict';
  var definitions = {
    ETF: 'Un fondo quotato che raccoglie più titoli in un solo prodotto. Spesso segue un indice.',
    TER: 'Il costo annuo ricorrente di un fondo, espresso in percentuale. Riduce il rendimento del fondo.',
    Bollo: 'Un’imposta dovuta su alcuni prodotti finanziari o conti. Aliquota e modalità dipendono dal prodotto.',
    BTP: 'Un titolo di Stato italiano: chi lo acquista presta denaro allo Stato secondo le condizioni previste.',
    PAC: 'Piano di accumulo: investi una cifra a intervalli regolari, per esempio ogni mese.',
    KID: 'Documento standard che riassume caratteristiche, costi e rischi di un prodotto finanziario.'
  };
  var terms = Object.keys(definitions);
  var pattern = new RegExp('\\b(' + terms.join('|') + ')\\b', 'gi');
  var roots = document.querySelectorAll('[data-glossary], .editorial-prose, .tl-prose');

  roots.forEach(function (root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var parent = node.parentElement;
        if (!parent || /^(ABBR|A|BUTTON|CODE|PRE|SCRIPT|STYLE|SVG|TEXTAREA)$/.test(parent.tagName)) return NodeFilter.FILTER_REJECT;
        pattern.lastIndex = 0;
        var found = pattern.test(node.nodeValue);
        pattern.lastIndex = 0;
        return found ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      var text = node.nodeValue, fragment = document.createDocumentFragment(), last = 0, match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(text))) {
        var term = terms.find(function (item) { return item.toLowerCase() === match[1].toLowerCase(); });
        fragment.append(text.slice(last, match.index));
        var abbreviation = document.createElement('abbr');
        abbreviation.className = 'gl';
        abbreviation.tabIndex = 0;
        abbreviation.dataset.def = definitions[term];
        abbreviation.setAttribute('aria-label', term + ': ' + definitions[term]);
        abbreviation.textContent = match[1];
        fragment.append(abbreviation);
        last = match.index + match[1].length;
      }
      fragment.append(text.slice(last));
      node.replaceWith(fragment);
    });
  });

  var tip;
  function show(element) {
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'glTip';
      tip.setAttribute('role', 'tooltip');
      document.body.appendChild(tip);
    }
    tip.textContent = element.dataset.def;
    tip.style.display = 'block';
    var rect = element.getBoundingClientRect(), width = tip.offsetWidth, height = tip.offsetHeight;
    tip.style.left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8) + 'px';
    tip.style.top = (rect.top - height - 8 >= 8 ? rect.top - height - 8 : rect.bottom + 8) + 'px';
  }
  function hide() { if (tip) tip.style.display = 'none'; }

  document.addEventListener('mouseover', function (event) {
    var term = event.target.closest && event.target.closest('abbr.gl');
    if (term) show(term);
  });
  document.addEventListener('mouseout', function (event) {
    if (event.target.closest && event.target.closest('abbr.gl')) hide();
  });
  document.addEventListener('focusin', function (event) {
    var term = event.target.closest && event.target.closest('abbr.gl');
    if (term) show(term);
  });
  document.addEventListener('focusout', hide);
  document.addEventListener('click', function (event) {
    var term = event.target.closest && event.target.closest('abbr.gl');
    if (term) show(term); else hide();
  });
  window.addEventListener('scroll', hide, { passive: true });
})();
