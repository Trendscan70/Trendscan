/*! TrendScan – motore di calcolo degli strumenti (PAC realistico, TER, obiettivo, titoli di Stato, budget).
 *  Nessuna dipendenza e nessun accesso alla pagina: gira nel browser (window.TSCalc) e in Node (test: scripts/test-tools.mjs).
 *  Convenzioni (le stesse in tutti gli strumenti):
 *   - i tassi sono frazioni (0,06 = 6%); gli anni sono interi;
 *   - il rendimento annuo è EFFETTIVO (composto una volta l'anno) e viene portato a mese con la radice dodicesima;
 *   - i versamenti mensili avvengono all'inizio del mese;
 *   - il TER riduce la crescita annua: (1 + rendimento) × (1 − TER);
 *   - il bollo si applica a fine anno sul valore del portafoglio; le imposte sulle plusvalenze si pagano alla vendita finale;
 *   - sono modelli semplificati a scopo educativo: niente commissioni, niente compensazione di minusvalenze, rendimento costante.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TSCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BOLLO = 0.002;       // imposta di bollo annua su prodotti finanziari e titoli in dossier
  var TAX_STD = 0.26;      // imposta sostitutiva su plusvalenze/interessi (ETF, azioni, conti deposito)
  var TAX_GOV = 0.125;     // titoli di Stato italiani (e white list)
  var BOLLO_FIXED = 34.2;  // bollo fisso su conti/libretti, dovuto se la giacenza media supera 5.000 €
  var BOLLO_FIXED_THRESHOLD = 5000;

  function num(v, d) { v = Number(v); return isFinite(v) ? v : (d || 0); }

  // ---------------------------------------------------------------- PAC (con costi e tasse)
  // Percorso del portafoglio mese per mese. Restituisce anche i valori a fine di ogni anno.
  function pacPath(o) {
    var years = Math.max(0, Math.round(num(o.years))), N = years * 12;
    var G = (1 + num(o.gross)) * (1 - num(o.ter));
    var f = Math.pow(G, 1 / 12), bollo = num(o.bollo);
    var bal = num(o.initial), paid = bal, ys = [{ y: 0, paid: paid, bal: bal }];
    for (var m = 1; m <= N; m++) {
      bal = (bal + num(o.monthly)) * f; paid += num(o.monthly);
      if (m % 12 === 0) { if (bollo) bal *= (1 - bollo); ys.push({ y: m / 12, paid: paid, bal: bal }); }
    }
    return { paid: paid, bal: bal, years: ys };
  }

  // Valore finale di un piano senza costi a rendimento r (serve a ricavare il rendimento netto equivalente).
  function fvPlain(initial, monthly, years, r) {
    var N = years * 12, f = Math.pow(1 + r, 1 / 12), bal = initial;
    for (var m = 1; m <= N; m++) bal = (bal + monthly) * f;
    return bal;
  }

  function solveRate(target, initial, monthly, years) {
    var lo = -0.95, hi = 1.5, i;
    if (fvPlain(initial, monthly, years, lo) > target) return null;
    if (fvPlain(initial, monthly, years, hi) < target) return null;
    for (i = 0; i < 80; i++) {
      var mid = (lo + hi) / 2;
      if (fvPlain(initial, monthly, years, mid) < target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function netOf(bal, paid, taxRate) { return bal - Math.max(0, bal - paid) * taxRate; }

  // PAC "realistico": quanto restano in tasca rendimento lordo, TER, bollo, imposta e inflazione.
  function pacRealistic(o) {
    var years = Math.max(0, Math.round(num(o.years))), infl = num(o.inflation), tax = num(o.taxRate);
    var base = { initial: o.initial, monthly: o.monthly, years: years, gross: o.gross };
    var s0 = pacPath({ initial: base.initial, monthly: base.monthly, years: years, gross: base.gross, ter: 0, bollo: 0 });
    var s1 = pacPath({ initial: base.initial, monthly: base.monthly, years: years, gross: base.gross, ter: o.ter, bollo: 0 });
    var s2 = pacPath({ initial: base.initial, monthly: base.monthly, years: years, gross: base.gross, ter: o.ter, bollo: o.bollo });
    var paid = s2.paid, taxPaid = Math.max(0, s2.bal - paid) * tax, netNominal = s2.bal - taxPaid;
    var deflator = Math.pow(1 + infl, years), netReal = netNominal / deflator;
    var irr = paid > 0 ? solveRate(netNominal, num(o.initial), num(o.monthly), years) : null;
    var series = s2.years.map(function (p, i) {
      var net = netOf(p.bal, p.paid, tax);
      return { y: p.y, paid: p.paid, gross: s0.years[i].bal, net: net, real: net / Math.pow(1 + infl, p.y) };
    });
    return {
      years: years, paid: paid,
      grossTheoretical: s0.bal,
      terCost: s0.bal - s1.bal, afterTer: s1.bal,
      bolloCost: s1.bal - s2.bal, afterBollo: s2.bal,
      taxPaid: taxPaid, netNominal: netNominal,
      inflationLoss: netNominal - netReal, netReal: netReal,
      grossGain: s0.bal - paid, netGain: netNominal - paid, realGain: netReal - paid,
      netIrr: irr, realIrr: irr == null ? null : (1 + irr) / (1 + infl) - 1,
      series: series
    };
  }

  // "Quanto devo versare al mese per arrivare a X?": inverso di pacRealistic (ricerca per bisezione).
  function solveMonthly(o) {
    var years = Math.max(1, Math.round(num(o.years))), infl = num(o.inflation);
    var target = num(o.target) * (o.targetIsReal ? Math.pow(1 + infl, years) : 1);
    var base = { initial: num(o.initial), years: years, gross: o.gross, ter: o.ter, bollo: o.bollo, taxRate: o.taxRate, inflation: infl };
    var net = function (pmt) { var r = pacRealistic(Object.assign({ monthly: pmt }, base)); return r.netNominal; };
    var out = { targetNominal: target, monthly: 0, result: null };
    if (!(target > 0)) return out;
    if (net(0) >= target) { out.result = pacRealistic(Object.assign({ monthly: 0 }, base)); return out; }
    var lo = 0, hi = 100, guard = 0;
    while (net(hi) < target && guard++ < 40) hi *= 2;
    if (net(hi) < target) { out.monthly = null; return out; }
    for (var i = 0; i < 70; i++) { var mid = (lo + hi) / 2; if (net(mid) < target) lo = mid; else hi = mid; }
    out.monthly = hi;
    out.result = pacRealistic(Object.assign({ monthly: hi }, base));
    return out;
  }

  // ---------------------------------------------------------------- impatto del TER
  function terImpact(o) {
    var years = Math.max(1, Math.round(num(o.years)));
    var mk = function (ter) { return pacPath({ initial: o.initial, monthly: o.monthly, years: years, gross: o.gross, ter: ter, bollo: 0 }); };
    var z = mk(0), a = mk(o.terA), b = mk(o.terB);
    var gainA = a.bal - a.paid, gainB = b.bal - b.paid, gainZ = z.bal - z.paid;
    return {
      years: years, paid: a.paid, noCost: z.bal, finalA: a.bal, finalB: b.bal,
      diff: a.bal - b.bal, diffPct: a.bal > 0 ? (a.bal - b.bal) / a.bal : 0,
      costA: z.bal - a.bal, costB: z.bal - b.bal,
      gainLostPctA: gainZ > 0 ? (z.bal - a.bal) / gainZ : 0,
      gainLostPctB: gainZ > 0 ? (z.bal - b.bal) / gainZ : 0,
      series: a.years.map(function (p, i) { return { y: p.y, paid: p.paid, a: p.bal, b: b.years[i].bal }; })
    };
  }

  // ---------------------------------------------------------------- flussi di cassa e rendimento (IRR)
  function npv(flows, r) { var s = 0; for (var i = 0; i < flows.length; i++) s += flows[i].cf / Math.pow(1 + r, flows[i].t); return s; }
  function irr(flows) {
    var lo = -0.9, hi = 1, flo = npv(flows, lo), fhi = npv(flows, hi);
    if (!(flo * fhi < 0)) return null;
    for (var i = 0; i < 100; i++) { var mid = (lo + hi) / 2, f = npv(flows, mid); if (f * flo > 0) { lo = mid; flo = f; } else hi = mid; }
    return (lo + hi) / 2;
  }

  // ---------------------------------------------------------------- BTP, conto deposito, ETF obbligazionario
  // Confronto netto su uno stesso importo e uno stesso orizzonte (anni interi).
  function compareBonds(o) {
    var C = num(o.amount), Y = Math.max(1, Math.round(num(o.years))), infl = num(o.inflation), useBollo = !!o.bollo;
    var res = [];

    function finish(name, kind, flows, parts) {
      var net = flows.reduce(function (s, f) { return s + f.cf; }, 0);
      var r = C > 0 ? irr(flows) : null;
      res.push(Object.assign({ name: name, kind: kind, netGain: net, netGainPct: C > 0 ? net / C : 0,
        irr: r, realIrr: r == null ? null : (1 + r) / (1 + infl) - 1 }, parts));
    }

    // BTP: cedole periodiche (anche a tassi crescenti) oppure cedola unica a scadenza. Acquisto alla pari (100).
    var b = o.btp || {}, flows = [{ t: 0, cf: -C }], gross = 0, bolloTot = 0, k, t;
    if (b.mode === 'bullet') {
      gross = C * num(b.bulletPct) / 100;
      flows.push({ t: Y, cf: gross * (1 - TAX_GOV) });
    } else {
      var freq = Math.max(1, Math.round(num(b.freq, 4))), rates = b.ratesByYear || [];
      for (k = 1; k <= Y * freq; k++) {
        var yi = Math.min(rates.length - 1, Math.floor((k - 1) / freq)), c = C * num(rates[yi]) / freq;
        gross += c; flows.push({ t: k / freq, cf: c * (1 - TAX_GOV) });
      }
    }
    flows.push({ t: Y, cf: C });
    if (useBollo) for (t = 1; t <= Y; t++) { var bb = C * BOLLO; bolloTot += bb; flows.push({ t: t, cf: -bb }); }
    finish(b.label || 'BTP', 'btp', flows, { gross: gross, ter: 0, tax: gross * TAX_GOV, bollo: bolloTot });

    // Conto deposito vincolato: interessi semplici (non reinvestiti), accreditati a scadenza o ogni anno; imposta 26%.
    var d = o.deposit || {}, dr = num(d.rate), df = [{ t: 0, cf: -C }], dgross = 0, dbollo = 0;
    if (d.credit === 'yearly') for (t = 1; t <= Y; t++) { dgross += C * dr; df.push({ t: t, cf: C * dr * (1 - TAX_STD) }); }
    else { dgross = C * dr * Y; df.push({ t: Y, cf: dgross * (1 - TAX_STD) }); }
    df.push({ t: Y, cf: C });
    if (useBollo) for (t = 1; t <= Y; t++) {
      var bd = d.bolloMode === 'fixed' ? (C > BOLLO_FIXED_THRESHOLD ? BOLLO_FIXED : 0) : d.bolloMode === 'none' ? 0 : C * BOLLO;
      if (bd) { dbollo += bd; df.push({ t: t, cf: -bd }); }
    }
    finish('Conto deposito', 'deposit', df, { gross: dgross, ter: 0, tax: dgross * TAX_STD, bollo: dbollo });

    // ETF obbligazionario ad accumulazione: crescita netta del TER, imposta alla vendita, bollo sul valore a ogni fine anno.
    var e = o.etf || {}, G = (1 + num(e.gross)) * (1 - num(e.ter)), q = Math.min(1, Math.max(0, num(e.whitePct, 100) / 100));
    var etfTax = TAX_STD - q * (TAX_STD - TAX_GOV);              // aliquota effettiva con quota di titoli di Stato (white list)
    var V = C * Math.pow(G, Y), egain = Math.max(0, V - C), etax = egain * etfTax;
    var ef = [{ t: 0, cf: -C }], ebollo = 0;
    if (useBollo) for (t = 1; t <= Y; t++) { var be = C * Math.pow(G, t) * BOLLO; ebollo += be; ef.push({ t: t, cf: -be }); }
    ef.push({ t: Y, cf: V - etax });
    finish('ETF obbligazionario', 'etf', ef, { gross: C * Math.pow(1 + num(e.gross), Y) - C, ter: C * Math.pow(1 + num(e.gross), Y) - V, tax: etax, bollo: ebollo, taxRate: etfTax });
    return { years: Y, amount: C, items: res };
  }

  // ---------------------------------------------------------------- budget 50/30/20 e fondo di emergenza
  var PROFILES = {
    stabile:   { label: 'Lavoro dipendente stabile, nessuno a carico', min: 3, max: 6 },
    incerto:   { label: 'Contratto a termine o un solo reddito in famiglia', min: 6, max: 9 },
    autonomo:  { label: 'Lavoro autonomo / partita IVA', min: 6, max: 12 }
  };
  function budgetPlan(o) {
    var income = Math.max(0, num(o.income)), ess = Math.max(0, num(o.essentials)), wants = Math.max(0, num(o.wants));
    var saving = income - ess - wants, prof = PROFILES[o.profile] || PROFILES.stabile;
    var target = { needs: income * 0.5, wants: income * 0.3, save: income * 0.2 };
    var pct = function (x) { return income > 0 ? x / income : 0; };
    var fundMin = ess * prof.min, fundMax = ess * prof.max, saved = Math.max(0, num(o.emergencySaved));
    var months = function (goal, monthly) { return goal <= saved ? 0 : monthly > 0 ? Math.ceil((goal - saved) / monthly) : null; };
    var full = Math.max(0, saving), half = full / 2;
    var gap = Math.max(0, target.save - saving);
    return {
      income: income, essentials: ess, wants: wants, saving: saving, deficit: saving < 0,
      pct: { needs: pct(ess), wants: pct(wants), save: pct(saving) }, target: target,
      needsOver: Math.max(0, ess - target.needs),
      gapToTwenty: gap, cutWantsPossible: Math.min(gap, wants), needsTooHigh: ess > target.needs && saving < target.save,
      profile: prof, fundMin: fundMin, fundMax: fundMax, saved: saved,
      coverMonths: ess > 0 ? saved / ess : null,
      progressMin: fundMin > 0 ? Math.min(1, saved / fundMin) : 0,
      monthsToMin: { full: months(fundMin, full), half: months(fundMin, half) },
      monthsToMax: { full: months(fundMax, full), half: months(fundMax, half) }
    };
  }

  return {
    BOLLO: BOLLO, TAX_STD: TAX_STD, TAX_GOV: TAX_GOV, BOLLO_FIXED: BOLLO_FIXED, PROFILES: PROFILES,
    pacPath: pacPath, fvPlain: fvPlain, pacRealistic: pacRealistic, solveMonthly: solveMonthly,
    terImpact: terImpact, irr: irr, compareBonds: compareBonds, budgetPlan: budgetPlan
  };
});
