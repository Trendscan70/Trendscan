/*! TrendScan – interfaccia degli strumenti (/strumenti/…). Usa il motore di calcolo in tools-core.js. */
(function () {
  'use strict';
  var C = window.TSCalc;
  var root = document.querySelector('.tl[data-tool]');
  if (!C || !root) return;
  var tool = root.dataset.tool;
  var noParams = root.hasAttribute('data-noparams');   // il budget contiene dati personali: mai nel link

  // ---------------------------------------------------------------- utilità
  var numberLocale = function () { return document.documentElement.lang || 'it-IT'; };
  var nf0 = new Intl.NumberFormat(numberLocale(), { maximumFractionDigits: 0 });
  var q = function (sel) { return root.querySelector(sel); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var eur = function (n) { return isFinite(n) ? nf0.format(Math.round(n)) + ' €' : '–'; };
  var pctF = function (x, d) { d = d == null ? 1 : d; return isFinite(x) ? (x * 100).toLocaleString(numberLocale(), { minimumFractionDigits: d, maximumFractionDigits: d }) + '%' : '–'; };
  var pctN = function (v, d) { return pctF(v / 100, d); };
  var clamp = function (v, lo, hi) { return Math.min(hi, Math.max(lo, v)); };
  var out = function (key, text) { root.querySelectorAll('[data-out="' + key + '"]').forEach(function (e) { e.textContent = text; }); };
  var outHtml = function (key, html) { root.querySelectorAll('[data-out-html="' + key + '"]').forEach(function (e) { e.innerHTML = html; }); };
  var months = function (n) {
    if (n == null) return 'non raggiungibile con questo risparmio';
    if (n === 0) return 'già raggiunto';
    if (n < 12) return n + (n === 1 ? ' mese' : ' mesi');
    var y = Math.floor(n / 12), m = n % 12;
    return y + (y === 1 ? ' anno' : ' anni') + (m ? ' e ' + m + (m === 1 ? ' mese' : ' mesi') : '');
  };

  // ---------------------------------------------------------------- campi (generati da <div class="tl-field" data-…>)
  var fields = {}, defaults = {};
  root.querySelectorAll('.tl-field').forEach(function (el) {
    var key = el.dataset.key, type = el.dataset.type || 'range', id = 'tl-' + key, label = el.dataset.label || '', hint = el.dataset.hint || '';
    el.classList.add('tl-f');
    var html = '';
    if (type === 'range') {
      var min = el.dataset.min || 0, max = el.dataset.max || 100, step = el.dataset.step || 1, val = el.dataset.value || min;
      html = '<div class="tl-f-top"><label for="' + id + '">' + esc(label) + '</label><span class="tl-f-val"><input id="' + id + '" class="tl-num" type="number" inputmode="decimal" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '"><span class="tl-unit">' + esc(el.dataset.unit || '') + '</span></span></div>' +
        '<input class="tl-range" type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '" aria-label="' + esc(label) + ' (cursore)">';
    } else if (type === 'select') {
      var opts = (el.dataset.options || '').split(';').map(function (o) { var p = o.split('|'); return '<option value="' + esc(p[0]) + '"' + (p[0] === el.dataset.value ? ' selected' : '') + '>' + esc(p[1] || p[0]) + '</option>'; }).join('');
      html = '<label for="' + id + '" class="tl-lab">' + esc(label) + '</label><select id="' + id + '" class="tl-select">' + opts + '</select>';
    } else if (type === 'check') {
      html = '<label class="tl-check"><input id="' + id + '" type="checkbox"' + (el.dataset.value === '1' ? ' checked' : '') + '><span>' + esc(label) + '</span></label>';
    }
    if (hint) html += '<p class="tl-hint">' + hint + '</p>';
    el.innerHTML = html;
    fields[key] = { el: el, type: type, min: parseFloat(el.dataset.min || 0), max: parseFloat(el.dataset.max || 100), input: el.querySelector('input[type=number], select, input[type=checkbox]'), range: el.querySelector('input[type=range]'), showKey: el.dataset.showKey, showVal: el.dataset.showVal };
    defaults[key] = type === 'check' ? el.dataset.value === '1' : type === 'select' ? el.dataset.value : parseFloat(el.dataset.value || el.dataset.min || 0);
  });

  function setField(key, v) {
    var f = fields[key]; if (!f) return;
    if (f.type === 'check') f.input.checked = !!v; else if (f.type === 'select') f.input.value = v; else { f.input.value = v; if (f.range) f.range.value = v; }
  }
  function getField(key) {
    var f = fields[key];
    if (f.type === 'check') return f.input.checked;
    if (f.type === 'select') return f.input.value;
    var v = parseFloat(f.input.value); if (!isFinite(v)) v = defaults[key];
    return clamp(v, f.min, f.max);
  }
  function readAll() { var S = {}; Object.keys(fields).forEach(function (k) { S[k] = getField(k); }); return S; }
  function applyVisibility(S) {
    Object.keys(fields).forEach(function (k) { var f = fields[k]; if (f.showKey) f.el.hidden = String(S[f.showKey]) !== f.showVal; });
  }

  // ---------------------------------------------------------------- valori nel link (per condividere lo scenario)
  function readParams() {
    if (noParams) return;
    var p = new URLSearchParams(location.search);
    Object.keys(fields).forEach(function (k) {
      if (!p.has(k)) return;
      var raw = p.get(k), f = fields[k];
      if (f.type === 'check') setField(k, raw === '1');
      else if (f.type === 'select') { var ok = Array.prototype.some.call(f.input.options, function (o) { return o.value === raw; }); if (ok) setField(k, raw); }
      else { var v = parseFloat(raw); if (isFinite(v)) setField(k, clamp(v, f.min, f.max)); }
    });
  }
  function paramsString(S) {
    if (noParams) return '';
    var p = new URLSearchParams();
    Object.keys(fields).forEach(function (k) {
      var v = S[k], d = defaults[k]; if (v === d) return;
      p.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
    });
    var s = p.toString(); return s ? '?' + s : '';
  }
  function syncUrl(S) { try { history.replaceState(null, '', location.pathname + paramsString(S) + location.hash); } catch (e) {} }

  // ---------------------------------------------------------------- grafici (Chart.js, solo dove serve)
  var chart = null;
  function drawChart(labels, sets) {
    var canvas = q('canvas'); if (!canvas || !window.Chart) return;
    if (chart) chart.destroy();
    chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: labels, datasets: sets.map(function (s) { return { label: s.label, data: s.data, borderColor: s.color, backgroundColor: s.fill || 'transparent', fill: !!s.fill, tension: 0.25, borderWidth: s.w || 2.5, borderDash: s.dash || [], pointRadius: 0, pointHoverRadius: 5 }; }) },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: '#9ca3af', font: { size: 11 }, boxWidth: 18 } }, tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ' + nf0.format(Math.round(c.raw)) + ' €'; } } } },
        scales: { x: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#9ca3af', maxTicksLimit: 8 } }, y: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#9ca3af', callback: function (v) { return v >= 1000 ? (v / 1000).toFixed(0) + 'k €' : v + ' €'; } } } }
      }
    });
  }

  // ---------------------------------------------------------------- componenti di visualizzazione
  // riga della "cascata": from/to in frazioni di base (0..1)
  function wfRow(label, valueText, from, to, cls, neg, sep) {
    var left = clamp(from, 0, 1) * 100, width = Math.max(0, clamp(to, 0, 1) - clamp(from, 0, 1)) * 100;
    return '<div class="tl-wf-row' + (sep ? ' sep' : '') + '"><span class="lab">' + label + '</span><span class="tl-wf-track"><i class="tl-wf-bar ' + cls + '" style="left:' + left.toFixed(2) + '%;width:' + width.toFixed(2) + '%"></i></span><span class="val' + (neg ? ' neg' : '') + '">' + valueText + '</span></div>';
  }
  var lastShare = '';

  // ================================================================ 1. PAC realistico
  var TOOLS = {};
  TOOLS['pac-realistico'] = function (S) {
    var r = C.pacRealistic({ initial: S.initial, monthly: S.monthly, years: S.years, gross: S.gross / 100, ter: S.ter / 100, bollo: S.bollo ? C.BOLLO : 0, taxRate: S.tax / 100, inflation: S.inflation / 100 });
    if (r.paid <= 0) { outHtml('message', 'Inserisci un capitale iniziale o un versamento mensile per vedere il risultato.'); return; }
    var grossGain = r.grossTheoretical - r.paid, lost = r.grossTheoretical - r.netNominal, share = grossGain > 0 ? lost / grossGain : 0;
    out('paid', eur(r.paid)); out('theory', eur(r.grossTheoretical)); out('net', eur(r.netNominal));
    out('netSub', '≈ ' + eur(r.netReal) + ' in euro di oggi');
    out('share', pctF(share, 0));
    out('rates', pctN(S.gross, 1) + ' → ' + (r.netIrr == null ? '–' : pctF(r.netIrr, 1)) + ' → ' + (r.realIrr == null ? '–' : pctF(r.realIrr, 1)));
    var msg = 'Versando <b>' + eur(S.monthly) + ' al mese</b> per <b>' + S.years + ' anni</b> metti da parte <b>' + eur(r.paid) + '</b>. Con un rendimento lordo teorico del ' + pctN(S.gross, 1) + ' arriveresti a ' + eur(r.grossTheoretical) + '; dopo TER, bollo e imposta ti restano <b>' + eur(r.netNominal) + '</b>, pari a circa <b>' + eur(r.netReal) + '</b> di potere d\'acquisto di oggi.' +
      (grossGain > 0 ? ' Costi e tasse si portano via il <b>' + pctF(share, 0) + '</b> del guadagno teorico.' : '');
    outHtml('message', msg);
    var base = Math.max(r.grossTheoretical, 1), rows = '';
    rows += wfRow('Quanto versi tu', eur(r.paid), 0, r.paid / base, 'c-paid');
    rows += wfRow('Valore lordo teorico', eur(r.grossTheoretical), 0, 1, 'c-total');
    rows += wfRow('− Costo del fondo (TER ' + pctN(S.ter, 2) + ')', '−' + eur(r.terCost), r.afterTer / base, 1, 'c-loss', true);
    rows += wfRow('− Bollo 0,2%', S.bollo ? '−' + eur(r.bolloCost) : '–', r.afterBollo / base, r.afterTer / base, 'c-loss', true);
    rows += wfRow('− Imposta ' + pctN(S.tax, 1).replace(',0%', '%') + ' sul guadagno', '−' + eur(r.taxPaid), r.netNominal / base, r.afterBollo / base, 'c-loss', true);
    rows += wfRow('Ti restano (euro futuri)', eur(r.netNominal), 0, r.netNominal / base, 'c-total', false, true);
    rows += wfRow('− Inflazione ' + pctN(S.inflation, 1), '−' + eur(r.inflationLoss), r.netReal / base, r.netNominal / base, 'c-amber', true);
    rows += wfRow('In euro di oggi', eur(r.netReal), 0, r.netReal / base, 'c-real');
    outHtml('waterfall', rows);
    drawChart(r.series.map(function (p) { return p.y === 0 ? 'Oggi' : 'Anno ' + p.y; }), [
      { label: 'Teorico lordo (senza costi)', data: r.series.map(function (p) { return p.gross; }), color: '#9ca3af', dash: [3, 4], w: 2 },
      { label: 'Netto dopo costi e tasse', data: r.series.map(function (p) { return p.net; }), color: '#10b981', fill: 'rgba(16,185,129,.12)', w: 3 },
      { label: 'Netto in euro di oggi', data: r.series.map(function (p) { return p.real; }), color: '#818cf8', w: 2.5 },
      { label: 'Versato', data: r.series.map(function (p) { return p.paid; }), color: '#3b82f6', dash: [6, 5], w: 2 }
    ]);
    lastShare = 'Con ' + eur(S.monthly) + ' al mese per ' + S.years + ' anni al ' + pctN(S.gross, 1) + ' lordo, dopo costi e tasse restano circa ' + eur(r.netNominal) + ' (' + eur(r.netReal) + ' di oggi). Costi e tasse erodono il ' + pctF(share, 0) + ' del guadagno teorico.';
  };

  // ================================================================ 2. Impatto del TER
  TOOLS['impatto-ter'] = function (S) {
    var r = C.terImpact({ initial: S.initial, monthly: S.monthly, years: S.years, gross: S.gross / 100, terA: S.terA / 100, terB: S.terB / 100 });
    if (r.paid <= 0) { outHtml('message', 'Inserisci un capitale iniziale o un versamento mensile per vedere il risultato.'); return; }
    out('a', eur(r.finalA)); out('b', eur(r.finalB)); out('diff', eur(r.diff)); out('diffPct', '−' + pctF(r.diffPct, 0) + ' rispetto al fondo economico');
    out('labA', 'Con TER ' + pctN(S.terA, 2)); out('labB', 'Con TER ' + pctN(S.terB, 2));
    out('lostA', 'Il costo si porta via il ' + pctF(r.gainLostPctA, 0) + ' del guadagno'); out('lostB', 'Il costo si porta via il ' + pctF(r.gainLostPctB, 0) + ' del guadagno');
    outHtml('message', 'Stessi versamenti, stesso rendimento lordo del ' + pctN(S.gross, 1) + ': dopo <b>' + S.years + ' anni</b> con un TER dello ' + pctN(S.terA, 2) + ' hai <b>' + eur(r.finalA) + '</b>, con un TER dell\'' + pctN(S.terB, 2) + ' hai <b>' + eur(r.finalB) + '</b>. Differenza: <b>' + eur(r.diff) + '</b> (' + pctF(r.diffPct, 0) + ') solo per il costo annuo del fondo.');
    var base = Math.max(r.finalA, 1), rows = '';
    rows += wfRow('Versato', eur(r.paid), 0, r.paid / base, 'c-paid');
    rows += wfRow('TER ' + pctN(S.terA, 2), eur(r.finalA), 0, r.finalA / base, 'c-a');
    rows += wfRow('TER ' + pctN(S.terB, 2), eur(r.finalB), 0, r.finalB / base, 'c-b');
    outHtml('waterfall', rows);
    drawChart(r.series.map(function (p) { return p.y === 0 ? 'Oggi' : 'Anno ' + p.y; }), [
      { label: 'TER ' + pctN(S.terA, 2), data: r.series.map(function (p) { return p.a; }), color: '#10b981', fill: 'rgba(16,185,129,.12)', w: 3 },
      { label: 'TER ' + pctN(S.terB, 2), data: r.series.map(function (p) { return p.b; }), color: '#fb7185', w: 3 },
      { label: 'Versato', data: r.series.map(function (p) { return p.paid; }), color: '#3b82f6', dash: [6, 5], w: 2 }
    ]);
    lastShare = 'Stesso investimento per ' + S.years + ' anni: con TER ' + pctN(S.terA, 2) + ' ottieni ' + eur(r.finalA) + ', con TER ' + pctN(S.terB, 2) + ' solo ' + eur(r.finalB) + '. Differenza: ' + eur(r.diff) + ' (' + pctF(r.diffPct, 0) + ').';
  };

  // ================================================================ 3. Obiettivo (calcolo inverso)
  TOOLS['obiettivo-risparmio'] = function (S) {
    var mk = function (g) { return { target: S.target, years: S.years, initial: S.initial, gross: g / 100, ter: S.ter / 100, bollo: S.bollo ? C.BOLLO : 0, taxRate: S.tax / 100, inflation: S.inflation / 100, targetIsReal: S.real }; };
    var s = C.solveMonthly(mk(S.gross));
    if (s.monthly == null) { outHtml('message', 'Con questi parametri l\'obiettivo non è raggiungibile: prova ad allungare il periodo o ad abbassare l\'importo.'); return; }
    var pmt = Math.ceil(s.monthly), r = C.pacRealistic(Object.assign({ monthly: pmt }, { initial: S.initial, years: S.years, gross: S.gross / 100, ter: S.ter / 100, bollo: S.bollo ? C.BOLLO : 0, taxRate: S.tax / 100, inflation: S.inflation / 100 }));
    var defl = Math.pow(1 + S.inflation / 100, S.years);
    out('pmt', eur(pmt) + ' al mese'); out('paid', eur(r.paid)); out('gain', eur(r.netGain)); out('net', eur(r.netNominal));
    out('goalNote', S.real ? 'Per avere ' + eur(S.target) + ' di oggi servono ' + eur(s.targetNominal) + ' tra ' + S.years + ' anni' : eur(S.target) + ' tra ' + S.years + ' anni varranno circa ' + eur(S.target / defl) + ' di oggi');
    outHtml('message', pmt === 0 ? 'Con il capitale che hai già e le ipotesi scelte l\'obiettivo è già raggiunto: non serve versare altro.' :
      'Per arrivare a <b>' + eur(s.targetNominal) + ' netti</b> tra <b>' + S.years + ' anni</b> servono circa <b>' + eur(pmt) + ' al mese</b>. Ne versi <b>' + eur(r.paid) + '</b> in tutto; il resto, circa <b>' + eur(Math.max(0, r.netGain)) + '</b>, sarebbe guadagno netto, se i rendimenti ipotizzati si verificassero.');
    var set = [0, 3, 5, 7]; if (set.indexOf(S.gross) < 0) { set.push(S.gross); set.sort(function (a, b) { return a - b; }); }
    var res = set.map(function (g) { var x = C.solveMonthly(mk(g)); return { g: g, m: x.monthly == null ? null : Math.ceil(x.monthly) }; });
    var max = Math.max.apply(null, res.map(function (x) { return x.m || 0; })) || 1, rows = '';
    res.forEach(function (x) { rows += wfRow('Rendimento lordo ' + pctN(x.g, 1).replace(',0%', '%') + (x.g === S.gross ? ' (il tuo)' : ''), x.m == null ? '–' : eur(x.m), 0, (x.m || 0) / max, x.g === S.gross ? 'c-total' : 'c-paid'); });
    outHtml('scenarios', rows);
    lastShare = 'Per arrivare a ' + eur(s.targetNominal) + ' netti tra ' + S.years + ' anni servono circa ' + eur(pmt) + ' al mese (rendimento lordo ipotizzato ' + pctN(S.gross, 1) + ', dopo costi e tasse).';
  };

  // ================================================================ 4. BTP, conto deposito, ETF obbligazionario
  TOOLS['rendimento-netto-btp'] = function (S) {
    var years, btp;
    if (S.preset === 'valore') { years = 5; btp = { label: 'BTP Valore (ott. 2026)', mode: 'periodic', freq: 4, ratesByYear: [0.037, 0.037, 0.041, 0.041, 0.047] }; }
    else if (S.preset === 'insieme') { years = 5; btp = { label: 'BTP Valore Insieme', mode: 'bullet', bulletPct: 22.25 }; }
    else { years = S.years; btp = { label: 'BTP a cedola fissa', mode: 'periodic', freq: S.freq, ratesByYear: new Array(years).fill(S.rate / 100) }; }
    var r = C.compareBonds({ amount: S.amount, years: years, inflation: S.inflation / 100, bollo: S.bollo, btp: btp, deposit: { rate: S.depRate / 100, credit: S.depCredit, bolloMode: S.depBollo }, etf: { gross: S.etfGross / 100, ter: S.etfTer / 100, whitePct: S.etfWhite } });
    var best = 0; r.items.forEach(function (it, i) { if ((it.irr || -1) > (r.items[best].irr || -1)) best = i; });
    var notes = ['Il rendimento è noto se tieni il titolo fino a scadenza (salvo il rischio che lo Stato non paghi). Se vendi prima, il prezzo può essere più alto o più basso.',
      'Garantito entro 100.000 € per persona e per banca dal Fondo interbancario di tutela dei depositi. I soldi restano vincolati fino a scadenza (con penali in caso di svincolo anticipato).',
      'Il rendimento che inserisci è un\'ipotesi, non una promessa: il valore dell\'ETF sale e scende con i tassi e non c\'è una data di rimborso garantita.'];
    var html = r.items.map(function (it, i) {
      var avg = it.kind === 'btp' ? '<li><span>Tasso lordo medio annuo</span><b>' + pctF(it.gross / (r.amount * r.years), 2) + '</b></li>' : '';
      return '<div class="tl-card' + (i === best ? ' best' : '') + '"><h3><span>' + esc(it.name) + '</span>' + (i === best ? '<span class="tl-badge">Più alto qui</span>' : '') + '</h3>' +
        '<div class="big">' + eur(it.netGain) + '</div><div class="yld">Netto in ' + r.years + ' anni · ' + (it.irr == null ? '–' : pctF(it.irr, 2)) + ' l\'anno</div>' +
        '<ul>' + avg + '<li><span>Interessi/guadagno lordi</span><b>' + eur(it.gross) + '</b></li>' + (it.ter > 0 ? '<li><span>Costo del fondo (TER)</span><b>−' + eur(it.ter) + '</b></li>' : '') +
        '<li><span>Imposte' + (it.kind === 'etf' ? ' (' + pctF(it.taxRate, 1) + ')' : it.kind === 'btp' ? ' (12,5%)' : ' (26%)') + '</span><b>−' + eur(it.tax) + '</b></li><li><span>Bollo</span><b>' + (it.bollo ? '−' + eur(it.bollo) : '–') + '</b></li>' +
        '<li><span>Rendimento reale (dopo inflazione)</span><b>' + (it.realIrr == null ? '–' : pctF(it.realIrr, 2)) + '</b></li></ul><p>' + notes[i] + '</p></div>';
    }).join('');
    outHtml('cards', html);
    var maxI = Math.max.apply(null, r.items.map(function (x) { return Math.max(0, x.irr || 0); })) || 1, rows = '';
    r.items.forEach(function (it, i) { rows += wfRow(esc(it.name), it.irr == null ? '–' : pctF(it.irr, 2), 0, Math.max(0, it.irr || 0) / maxI, i === best ? 'c-total' : 'c-paid'); });
    outHtml('bars', rows);
    var b = r.items[0], d = r.items[1], e = r.items[2];
    outHtml('message', 'Su <b>' + eur(r.amount) + '</b> in <b>' + r.years + ' anni</b>, dopo imposte' + (S.bollo ? ' e bollo' : '') + ', il guadagno netto stimato è di <b>' + eur(b.netGain) + '</b> con ' + esc(b.name) + ', <b>' + eur(d.netGain) + '</b> con il conto deposito e <b>' + eur(e.netGain) + '</b> con l\'ETF obbligazionario (ipotesi). Il confronto vale per i numeri inseriti: cambiali con quelli reali.');
    out('presetNote', S.preset === 'valore' ? 'Tassi minimi garantiti del BTP Valore di ottobre 2026 (comunicato MEF del 16 ottobre 2026): 3,70% anni 1-2, 4,10% anni 3-4, 4,70% anno 5, cedole trimestrali, nessun premio fedeltà. Alla chiusura del collocamento i tassi possono essere rivisti solo al rialzo.' :
      S.preset === 'insieme' ? 'BTP Valore Insieme di ottobre 2026: cedola unica minima del 22,25% sul capitale pagata a scadenza (5 anni), insieme al rimborso. Nessun pagamento intermedio e nessun premio fedeltà.' :
      'Acquisto alla pari (prezzo 100) di un BTP con cedola costante: inserisci tasso e durata.');
    lastShare = 'Su ' + eur(r.amount) + ' in ' + r.years + ' anni, netto di tasse: ' + b.name + ' ' + eur(b.netGain) + ' · conto deposito ' + eur(d.netGain) + ' · ETF obbligazionario ' + eur(e.netGain) + ' (ipotesi).';
  };

  // ================================================================ 5. Budget 50/30/20 e fondo di emergenza
  TOOLS['budget-fondo-emergenza'] = function (S) {
    var b = C.budgetPlan({ income: S.income, essentials: S.essentials, wants: S.wants, profile: S.profile, emergencySaved: S.saved });
    if (b.income <= 0) { outHtml('message', 'Inserisci il tuo reddito netto mensile.'); return; }
    var seg = function (cls, v, name) { var p = Math.max(0, v); return '<span class="' + cls + '" style="width:' + (p * 100).toFixed(1) + '%">' + (p >= 0.1 ? name + ' ' + pctF(v, 0) : '') + '</span>'; };
    var mine = b.deficit ? [b.pct.needs, b.pct.wants, 0] : [b.pct.needs, b.pct.wants, b.pct.save], tot = mine[0] + mine[1] + mine[2] || 1;
    outHtml('stackMine', '<div class="tl-stack" role="img" aria-label="I tuoi numeri: bisogni ' + pctF(b.pct.needs, 0) + ', desideri ' + pctF(b.pct.wants, 0) + ', risparmio ' + pctF(b.pct.save, 0) + '">' + seg('s-needs', mine[0] / tot, 'Bisogni') + seg('s-wants', mine[1] / tot, 'Desideri') + seg('s-save', mine[2] / tot, 'Risparmio') + '</div>');
    outHtml('stackRule', '<div class="tl-stack" role="img" aria-label="Regola 50/30/20">' + seg('s-needs', 0.5, 'Bisogni') + seg('s-wants', 0.3, 'Desideri') + seg('s-save', 0.2, 'Risparmio') + '</div>');
    var line = function (name, mineV, mineP, tgtV) { var diff = mineV - tgtV; return '<li><span>' + name + '</span><b>' + eur(mineV) + ' (' + pctF(mineP, 0) + ') · obiettivo ' + eur(tgtV) + (Math.abs(diff) >= 1 ? ' · ' + (diff > 0 ? '+' : '−') + eur(Math.abs(diff)) : '') + '</b></li>'; };
    outHtml('lines', '<ul class="tl-lines">' + line('Bisogni (50%)', b.essentials, b.pct.needs, b.target.needs) + line('Desideri (30%)', b.wants, b.pct.wants, b.target.wants) + line('Risparmio (20%)', b.saving, b.pct.save, b.target.save) + '</ul>');
    var msg, cls = '';
    if (b.deficit) { msg = 'Spendi <b>' + eur(-b.saving) + ' più</b> di quanto incassi ogni mese: prima di pensare a fondo di emergenza o investimenti, serve riportare le uscite sotto le entrate.'; cls = 'warn'; }
    else if (b.needsTooHigh) {
      msg = 'I bisogni pesano il <b>' + pctF(b.pct.needs, 0) + '</b> del reddito (la regola indica il 50%, cioè ' + eur(b.target.needs) + '): sono <b>' + eur(b.needsOver) + '</b> sopra. La regola è una guida, non un obbligo. ' +
        (b.cutWantsPossible >= b.gapToTwenty - 0.5 ? 'Per arrivare al 20% di risparmio basterebbe spostare <b>' + eur(b.gapToTwenty) + '</b> dai desideri al risparmio.' : 'Anche azzerando i desideri non basta ad arrivare al 20%: conviene guardare le spese essenziali (bollette, assicurazioni, abbonamenti, rate).'); cls = 'warn';
    } else if (b.saving >= b.target.save - 0.5) { msg = 'Sei in linea con la regola: metti da parte <b>' + eur(b.saving) + '</b> al mese (' + pctF(b.pct.save, 0) + ' del reddito).'; cls = 'good'; }
    else { msg = 'Metti da parte <b>' + eur(b.saving) + '</b> al mese (' + pctF(b.pct.save, 0) + '). Per arrivare al 20% (' + eur(b.target.save) + ') mancano <b>' + eur(b.gapToTwenty) + '</b>, spostabili dai desideri.'; }
    var el = q('[data-out-html="message"]'); if (el) { el.className = 'tl-msg ' + cls; }
    outHtml('message', msg);
    out('fundRange', eur(b.fundMin) + ' – ' + eur(b.fundMax));
    out('fundMonths', b.profile.min + '–' + b.profile.max + ' mesi di spese essenziali (' + eur(b.essentials) + ' al mese)');
    out('cover', b.coverMonths == null ? '–' : b.coverMonths.toLocaleString(numberLocale(), { maximumFractionDigits: 1 }) + ' mesi');
    out('coverSub', b.saved > 0 ? 'con ' + eur(b.saved) + ' già accantonati' : 'nessun fondo ancora accantonato');
    var prog = q('[data-out-html="progress"]'); if (prog) prog.innerHTML = '<div class="tl-prog" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(b.progressMin * 100) + '" aria-label="Avanzamento verso il fondo minimo"><i style="width:' + (b.progressMin * 100).toFixed(0) + '%"></i></div><p class="tl-hint">' + pctF(b.progressMin, 0) + ' del fondo minimo</p>';
    var t = function (o) { return months(o); };
    var rows = '';
    if (b.saving > 0) {
      rows = '<li><span>Destinando al fondo tutto il risparmio (' + eur(b.saving) + '/mese)</span><b>minimo in ' + t(b.monthsToMin.full) + ' · massimo in ' + t(b.monthsToMax.full) + '</b></li>' +
        '<li><span>Destinandone metà (' + eur(b.saving / 2) + '/mese)</span><b>minimo in ' + t(b.monthsToMin.half) + ' · massimo in ' + t(b.monthsToMax.half) + '</b></li>';
    } else rows = '<li><span>Con un risparmio mensile pari a zero</span><b>il fondo non cresce</b></li>';
    outHtml('timeline', '<ul class="tl-lines">' + rows + '</ul>');
    var next = q('[data-out-html="next"]');
    if (next) next.innerHTML = b.saved >= b.fundMin && b.fundMin > 0 ? '<div class="tl-msg good">Hai già il fondo minimo: puoi iniziare a pensare a un <a href="/guide/pac/">PAC</a>. Prova i numeri nel <a href="/strumenti/pac-realistico/">PAC realistico</a>.</div>' : '';
    lastShare = 'Ho calcolato il mio fondo di emergenza e il budget 50/30/20 con lo strumento gratuito di TrendScan.';
  };

  // ---------------------------------------------------------------- ciclo di calcolo
  var timer = null;
  function update() {
    var S = readAll(); applyVisibility(S);
    try { TOOLS[tool](S); } catch (e) { if (window.console) console.error(e); }
    clearTimeout(timer); timer = setTimeout(function () { syncUrl(S); }, 250);
  }
  readParams();
  root.addEventListener('input', function (e) {
    var t = e.target, wrap = t.closest('.tl-field'); if (!wrap) return;
    var key = wrap.dataset.key, f = fields[key];
    if (f.type === 'range') { if (t.type === 'range') f.input.value = t.value; else if (f.range) f.range.value = t.value; }
    update();
  });
  root.addEventListener('change', function (e) { if (e.target.closest('.tl-field')) update(); });

  // ---------------------------------------------------------------- pulsanti: condividi e ripristina
  var toastT = null;
  function toast(msg) { out('toast', msg); clearTimeout(toastT); toastT = setTimeout(function () { out('toast', ''); }, 2600); }
  function shareUrl() { return location.origin + location.pathname + paramsString(readAll()); }
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (res, rej) { var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy') ? res() : rej(); } catch (e) { rej(e); } document.body.removeChild(ta); });
  }
  root.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'reset') { Object.keys(defaults).forEach(function (k) { setField(k, defaults[k]); }); update(); toast('Valori ripristinati'); return; }
    if (b.dataset.act === 'share') {
      var url = shareUrl();
      if (navigator.share) { navigator.share({ title: document.title, text: lastShare, url: url }).catch(function () {}); return; }
      copy(lastShare + ' ' + url).then(function () { toast('Copiato negli appunti: incollalo dove vuoi'); }, function () { toast('Non riesco a copiare: copia l\'indirizzo dalla barra'); });
    }
  });

  update();
  window.addEventListener('load', update);   // Chart.js è "defer": a caricamento completo ridisegna il grafico
})();
