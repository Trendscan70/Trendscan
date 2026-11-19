import assert from 'node:assert/strict';
import { buildHicpIndicator, buildMortgageRates, parseConsobAlerts } from './markets-indicators.mjs';

const periods = [];
const values = {};
for (let index = 0; index < 13; index++) {
  const date = new Date(Date.UTC(2025, 9 + index, 1));
  const period = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  periods.push([period, index]);
  values[index] = index === 0 ? 100 : index === 12 ? 110 : index === 11 ? 108 : 100;
}
const hicp = buildHicpIndicator({
  updated: '2026-11-18T11:00:00+0100',
  dimension: { time: { category: { index: Object.fromEntries(periods) } } },
  value: values
}, { id: 'food', label: 'Alimentari' }, new Date('2026-11-19T12:00:00Z'));
assert.equal(hicp.period, '2026-10');
assert.equal(hicp.changeMonthPct, 1.9);
assert.equal(hicp.changeYearPct, 10);
assert.equal(hicp.stale, false);
const staleHicp = buildHicpIndicator({
  dimension: { time: { category: { index: { '2026-07': 0, '2026-08': 1 } } } },
  value: { 0: 100, 1: null }
}, { id: 'food', label: 'Alimentari' }, new Date('2026-11-19T12:00:00Z'));
assert.equal(staleHicp.period, '2026-07');
assert.equal(staleHicp.stale, true);

const csv = [
  'MATURITY_NOT_IRATE,TIME_PERIOD,OBS_VALUE',
  'F,2025-10,3.10',
  'F,2026-09,3.20',
  'F,2026-10,3.15',
  'K,2025-10,3.50',
  'K,2026-09,3.60',
  'K,2026-10,3.70',
  'F,2026-11,'
].join('\n');
const mortgage = buildMortgageRates(csv, new Date('2026-11-19T12:00:00Z'));
assert.equal(mortgage.length, 2);
assert.equal(mortgage[0].ratePct, '3.15');
assert.equal(mortgage[0].changeMonthPp, -0.05);
assert.equal(mortgage[0].changeYearPp, 0.05);
assert.equal(mortgage[1].changeMonthPp, 0.1);

const consob = parseConsobAlerts(`
  <div class="journal-content-article " data-analytics-asset-title="Comunicazione Consob del 2026-11-12 (abusivismo)">
    <div class="documentContent"><a href="/web/area-pubblica/-/delibera-n.-24203">Delibera</a></div>
  </div>
  <div class="journal-content-article " data-analytics-asset-title="IOSCO warnings">
    <div class="documentContent"><a href="/web/area-pubblica/-/delibera-n.-24204">Dettaglio</a></div>
  </div>
`, 'https://www.consob.it/web/area-pubblica/avvisi-ai-risparmiatori/ultime');
assert.equal(consob.length, 1);
assert.equal(consob[0].date, '2026-11-12');
assert.equal(consob[0].url, 'https://www.consob.it/web/area-pubblica/-/delibera-n.-24203');
const untrustedConsob = parseConsobAlerts(`
  <div class="journal-content-article " data-analytics-asset-title="Avviso Consob del 2026-11-10">
    <a href="https://attacker.example/falso-avviso">Dettaglio</a>
  </div>
`, 'https://www.consob.it/web/area-pubblica/avvisi-ai-risparmiatori/ultime');
assert.equal(untrustedConsob[0].url, 'https://www.consob.it/web/area-pubblica/avvisi-ai-risparmiatori/ultime');
assert.throws(() => parseConsobAlerts('<html>pagina cambiata</html>', 'https://www.consob.it/'));

console.log('✓ test indicatori Trend Radar: HICP mensile/annuale, tassi mutui BCE e avvisi Consob');
