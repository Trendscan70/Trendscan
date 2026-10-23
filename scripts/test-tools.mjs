// Test numerici del motore di calcolo (public/tools-core.js).  Uso:  node scripts/test-tools.mjs
// Ogni controllo confronta il motore con un calcolo indipendente (formula chiusa, valore ufficiale o calcolo a mano).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = {};
new Function('self', readFileSync(path.join(ROOT, 'public/tools-core.js'), 'utf8'))(ctx);
const T = ctx.TSCalc;
let n = 0;
const near = (a, b, tol, msg) => { n++; assert.ok(Math.abs(a - b) <= tol, `${msg}: ottenuto ${a}, atteso ${b} (±${tol})`); };

// ---- 1. PAC senza costi né tasse = formula chiusa della rendita anticipata
{
  const P = 1000, M = 200, Y = 20, g = 0.06, f = Math.pow(1 + g, 1 / 12), N = Y * 12;
  const closed = P * Math.pow(f, N) + M * f * (Math.pow(f, N) - 1) / (f - 1);
  const r = T.pacRealistic({ initial: P, monthly: M, years: Y, gross: g, ter: 0, bollo: 0, taxRate: 0, inflation: 0 });
  near(r.grossTheoretical, closed, 0.01, 'PAC lordo = formula chiusa');
  near(r.netNominal, closed, 0.01, 'PAC senza costi: netto = lordo');
  near(r.paid, P + M * N, 1e-9, 'totale versato');
  near(r.netIrr, g, 1e-6, 'IRR senza costi = rendimento lordo');
}
// ---- 2. Imposta del 26% solo sulla plusvalenza
{
  const r = T.pacRealistic({ initial: 0, monthly: 100, years: 10, gross: 0.05, ter: 0, bollo: 0, taxRate: 0.26, inflation: 0 });
  near(r.taxPaid, 0.26 * (r.grossTheoretical - r.paid), 0.01, 'imposta = 26% della plusvalenza');
  near(r.netNominal, r.grossTheoretical - r.taxPaid, 0.01, 'netto = lordo - imposta');
}
// ---- 3. Nessuna imposta se c'è perdita
{
  const r = T.pacRealistic({ initial: 1000, monthly: 0, years: 5, gross: -0.1, ter: 0, bollo: 0, taxRate: 0.26, inflation: 0 });
  near(r.taxPaid, 0, 1e-9, 'nessuna imposta sulle perdite');
}
// ---- 4. TER: crescita (1+g)(1-TER) su un solo versamento iniziale
{
  const r = T.pacRealistic({ initial: 10000, monthly: 0, years: 10, gross: 0.07, ter: 0.015, bollo: 0, taxRate: 0, inflation: 0 });
  near(r.afterTer, 10000 * Math.pow(1.07 * 0.985, 10), 0.01, 'TER composto');
  near(r.terCost, r.grossTheoretical - r.afterTer, 1e-6, 'costo del TER = differenza');
}
// ---- 5. Bollo: 0,2% sul valore a fine anno
{
  const r = T.pacRealistic({ initial: 10000, monthly: 0, years: 3, gross: 0, ter: 0, bollo: 0.002, taxRate: 0, inflation: 0 });
  near(r.afterBollo, 10000 * Math.pow(0.998, 3), 1e-6, 'bollo composto sul valore');
}
// ---- 6. Inflazione: valore reale = netto / (1+i)^anni
{
  const r = T.pacRealistic({ initial: 10000, monthly: 0, years: 10, gross: 0.05, ter: 0, bollo: 0, taxRate: 0, inflation: 0.02 });
  near(r.netReal, r.netNominal / Math.pow(1.02, 10), 1e-6, 'valore reale');
  near(r.realIrr, 1.05 / 1.02 - 1, 1e-6, 'rendimento reale');
}
// ---- 7. La somma dei pezzi quadra (lordo - TER - bollo - imposta - inflazione = reale)
{
  const r = T.pacRealistic({ initial: 1000, monthly: 200, years: 20, gross: 0.06, ter: 0.002, bollo: 0.002, taxRate: 0.26, inflation: 0.02 });
  near(r.grossTheoretical - r.terCost - r.bolloCost - r.taxPaid - r.inflationLoss, r.netReal, 0.01, 'scomposizione dei costi');
  assert.ok(r.netReal < r.netNominal && r.netNominal < r.grossTheoretical); n++;
  assert.ok(r.netIrr < 0.06 && r.netIrr > 0.04); n++;
}
// ---- 8. Obiettivo: il versamento trovato porta davvero all'obiettivo (nominale e reale)
{
  for (const real of [false, true]) {
    const o = { target: 100000, years: 15, initial: 0, gross: 0.06, ter: 0.002, bollo: 0.002, taxRate: 0.26, inflation: 0.02, targetIsReal: real };
    const s = T.solveMonthly(o);
    near(s.result.netNominal, s.targetNominal, 1, 'obiettivo raggiunto (' + (real ? 'reale' : 'nominale') + ')');
  }
  const r0 = T.solveMonthly({ target: 1000, years: 5, initial: 5000, gross: 0.05, ter: 0, bollo: 0, taxRate: 0, inflation: 0 });
  near(r0.monthly, 0, 1e-9, 'obiettivo già raggiunto -> 0 €/mese');
  const low = T.solveMonthly({ target: 100000, years: 15, initial: 0, gross: 0.03, ter: 0, bollo: 0, taxRate: 0, inflation: 0 }).monthly;
  const high = T.solveMonthly({ target: 100000, years: 15, initial: 0, gross: 0.07, ter: 0, bollo: 0, taxRate: 0, inflation: 0 }).monthly;
  assert.ok(low > high); n++;
}
// ---- 9. Impatto del TER: 0,07% contro 1,5% su 30 anni
{
  const r = T.terImpact({ initial: 0, monthly: 200, years: 30, gross: 0.06, terA: 0.0007, terB: 0.015 });
  near(r.finalA, T.pacPath({ initial: 0, monthly: 200, years: 30, gross: 0.06, ter: 0.0007, bollo: 0 }).bal, 1e-6, 'TER A');
  assert.ok(r.finalA > r.finalB && r.diff > 0 && r.diffPct > 0.15 && r.diffPct < 0.35, 'differenza TER plausibile'); n++;
  near(r.diff, r.finalA - r.finalB, 1e-9, 'differenza');
  near(r.gainLostPctB > r.gainLostPctA ? 1 : 0, 1, 0, 'TER alto perde più guadagno');
}
// ---- 10. BTP Valore ottobre 2026: valori ufficiali su 10.000 € (fonti: MEF, 16/10/2026)
{
  const btp = { label: 'BTP Valore', mode: 'periodic', freq: 4, ratesByYear: [0.037, 0.037, 0.041, 0.041, 0.047] };
  const r = T.compareBonds({ amount: 10000, years: 5, inflation: 0.02, bollo: false, btp, deposit: { rate: 0.03 }, etf: { gross: 0.035, ter: 0.002, whitePct: 100 } });
  const b = r.items[0];
  near(b.gross, 2030, 1e-6, 'cedole lorde BTP Valore su 10.000 €');
  near(b.netGain, 1776.25, 0.005, 'cedole nette BTP Valore su 10.000 € (valore ufficiale)');
  const ins = T.compareBonds({ amount: 10000, years: 5, inflation: 0.02, bollo: false, btp: { mode: 'bullet', bulletPct: 22.25 }, deposit: { rate: 0.03 }, etf: { gross: 0.035, ter: 0.002 } }).items[0];
  near(ins.netGain, 1946.875, 0.005, 'cedola unica netta BTP Valore Insieme (valore ufficiale)');
  const withBollo = T.compareBonds({ amount: 10000, years: 5, inflation: 0.02, bollo: true, btp, deposit: { rate: 0.03 }, etf: { gross: 0.035, ter: 0.002 } }).items[0];
  near(withBollo.bollo, 100, 1e-9, 'bollo 0,2% x 5 anni su 10.000 €');
  near(withBollo.netGain, 1776.25 - 100, 0.005, 'netto dopo bollo');
  assert.ok(withBollo.irr < b.irr && b.irr > 0.03 && b.irr < 0.045); n++;
}
// ---- 11. Conto deposito: 26% sugli interessi; bollo 0,2% oppure 34,20 € fissi oltre 5.000 €
{
  const base = { amount: 20000, years: 3, inflation: 0, bollo: true, btp: { mode: 'bullet', bulletPct: 0 }, etf: { gross: 0.03, ter: 0 } };
  const pct = T.compareBonds({ ...base, deposit: { rate: 0.03, credit: 'maturity', bolloMode: 'pct' } }).items[1];
  near(pct.gross, 20000 * 0.03 * 3, 1e-9, 'interessi lordi deposito');
  near(pct.tax, 1800 * 0.26, 1e-9, 'imposta 26% deposito');
  near(pct.bollo, 20000 * 0.002 * 3, 1e-9, 'bollo 0,2% deposito');
  const fixed = T.compareBonds({ ...base, deposit: { rate: 0.03, credit: 'yearly', bolloMode: 'fixed' } }).items[1];
  near(fixed.bollo, 34.2 * 3, 1e-9, 'bollo fisso 34,20 €');
  const small = T.compareBonds({ ...base, amount: 4000, deposit: { rate: 0.03, bolloMode: 'fixed' } }).items[1];
  near(small.bollo, 0, 1e-9, 'bollo fisso non dovuto sotto 5.000 €');
}
// ---- 12. ETF obbligazionario: imposta effettiva 12,5% (100% titoli di Stato) o 26% (0%)
{
  const mk = w => T.compareBonds({ amount: 10000, years: 4, inflation: 0, bollo: false, btp: { mode: 'bullet', bulletPct: 0 }, deposit: { rate: 0 }, etf: { gross: 0.04, ter: 0, whitePct: w } }).items[2];
  const gov = mk(100), corp = mk(0), mix = mk(50);
  const gain = 10000 * (Math.pow(1.04, 4) - 1);
  near(gov.tax, gain * 0.125, 0.01, 'ETF governativo 12,5%');
  near(corp.tax, gain * 0.26, 0.01, 'ETF corporate 26%');
  near(mix.tax, gain * (0.26 - 0.5 * 0.135), 0.01, 'ETF misto: aliquota intermedia');
  near(gov.irr, 0.04 - 0 - (0.04 * 0), 0.02, 'IRR ETF in intervallo');
}
// ---- 13. Budget 50/30/20 e fondo di emergenza
{
  const b = T.budgetPlan({ income: 2000, essentials: 1100, wants: 500, profile: 'stabile', emergencySaved: 1000 });
  near(b.saving, 400, 1e-9, 'risparmio = reddito - essenziali - desideri');
  near(b.target.needs, 1000, 1e-9, '50%'); near(b.target.wants, 600, 1e-9, '30%'); near(b.target.save, 400, 1e-9, '20%');
  near(b.needsOver, 100, 1e-9, 'eccesso sui bisogni');
  near(b.fundMin, 3300, 1e-9, 'fondo minimo 3 mesi di spese essenziali'); near(b.fundMax, 6600, 1e-9, 'fondo massimo 6 mesi');
  near(b.monthsToMin.full, Math.ceil((3300 - 1000) / 400), 0, 'mesi per il minimo');
  const d = T.budgetPlan({ income: 1500, essentials: 1000, wants: 700, profile: 'autonomo', emergencySaved: 0 });
  assert.ok(d.deficit && d.monthsToMin.full === null); n++;
  assert.equal(T.budgetPlan({ income: 0, essentials: 0, wants: 0 }).fundMin, 0); n++;
}
console.log(`✓ ${n} controlli numerici superati`);
