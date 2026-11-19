#!/usr/bin/env node
/**
 * TrendScan Hub - mercati e Termometro TrendScan (nessuna chiave API, nessuna dipendenza)
 *
 *   node scripts/build-markets.mjs            aggiorna data/markets.json
 *   node scripts/build-markets.mjs --force    ignora gli intervalli di aggiornamento configurati
 *
 * CAMBI     tassi di riferimento della BCE, letti dai file XML ufficiali (fonte primaria, nessun intermediario).
 *           Condizioni di riutilizzo (ESCB): gratuito, anche commerciale, citando la fonte e SENZA modificare
 *           le statistiche. Per questo i tassi si salvano come stringhe, cifra per cifra come pubblicati:
 *           variazioni % e grafici sono elaborazioni a parte, etichettate come tali nel sito.
 * TERMOMETRO indicatore 0-100 sul tono delle notizie gia' raccolte (data/articles.json). Si usano solo conteggi
 *           di parole chiave su titolo e anteprima; nel risultato NON compare alcun testo degli articoli.
 *
 * Ogni fonte in config/markets.json gira solo se enabled=true E license.verified=true.
 *
 * Variabili: DATA_DIR (default public/data), MARKETS_CONFIG (percorso config)
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { computeSentiment } from './markets-sentiment.mjs';
import { buildHicpIndicator, buildMortgageRates, parseConsobAlerts } from './markets-indicators.mjs';

const CONFIG_URL = process.env.MARKETS_CONFIG ? new URL('file://' + process.env.MARKETS_CONFIG) : new URL('../config/markets.json', import.meta.url);
const CFG = JSON.parse(await readFile(CONFIG_URL, 'utf8'));
const DATA_DIR = process.env.DATA_DIR || 'public/data';
const FORCE = process.argv.includes('--force');
const NOW = Date.now();

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 TrendScanHub/1.0';

async function fetchText(url, timeout = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': UA, Accept: 'application/xml,text/xml,application/json,text/csv,*/*' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } finally { clearTimeout(t); }
}
const readJson = async p => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; } };

// ---------------------------------------------------------------------------
// BCE: file XML dei tassi di riferimento
//   <Cube><Cube time='2026-10-16'><Cube currency='USD' rate='1.1253'/> ... </Cube></Cube>
// ---------------------------------------------------------------------------
function parseEcbXml(xml) {
  const days = [];
  for (const m of xml.matchAll(/<Cube\s+time\s*=\s*["'](\d{4}-\d{2}-\d{2})["']\s*>([\s\S]*?)<\/Cube>/g)) {
    const rates = {};
    for (const r of m[2].matchAll(/<Cube\s+currency\s*=\s*["']([A-Z]{3})["']\s+rate\s*=\s*["']([0-9]+(?:\.[0-9]+)?)["']\s*\/?>/g)) rates[r[1]] = r[2];
    if (Object.keys(rates).length) days.push({ date: m[1], rates });
  }
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

const pct = (a, b) => { const x = parseFloat(a), y = parseFloat(b); return y ? Math.round((x / y - 1) * 10000) / 100 : null; };

function buildFx(src, days) {
  const pairs = [];
  for (const p of src.pairs) {
    const series = days.filter(d => d.rates[p.currency]).map(d => ({ d: d.date, r: d.rates[p.currency] })); // r: stringa, come pubblicata
    if (!series.length) continue;
    const last = series.at(-1), prev = series.at(-2);
    const cut = new Date(Date.parse(last.d) - 30 * 86400e3).toISOString().slice(0, 10);
    const ref30 = [...series].reverse().find(x => x.d <= cut);
    pairs.push({
      id: p.id, label: p.label, name: p.name, currency: p.currency,
      rate: last.r, date: last.d,
      prev: prev ? prev.r : null,
      changePct: prev ? pct(last.r, prev.r) : null,          // elaborazione TrendScan
      change30dPct: ref30 ? pct(last.r, ref30.r) : null,      // elaborazione TrendScan
      series
    });
  }
  if (!pairs.length) throw new Error('nessuna delle valute configurate e\' presente nel file della BCE');
  return {
    source: { id: src.id, name: src.name, attribution: src.license.attribution, url: src.pageUrl },
    asOf: pairs.map(p => p.date).sort().at(-1),
    fetchedAt: new Date(NOW).toISOString(),
    stale: false,
    pairs
  };
}

async function providerEcbXml(src, prevFx) {
  const wanted = src.pairs.map(p => p.id).sort().join(',');
  const prevOk = prevFx && prevFx.pairs?.length && prevFx.pairs.map(p => p.id).sort().join(',') === wanted;
  const age = prevOk && prevFx.fetchedAt ? NOW - Date.parse(prevFx.fetchedAt) : Infinity;
  if (!FORCE && age < (src.refreshHours ?? 3) * 3600e3) return { fx: prevFx, note: `riuso dati di ${Math.round(age / 60000)} minuti fa (intervallo minimo ${src.refreshHours ?? 3} h)` };

  let days = [], used = src.url, lastErr;
  for (const url of [src.url, src.fallbackUrl].filter(Boolean)) {
    try { days = parseEcbXml(await fetchText(url)); used = url; if (days.length) break; lastErr = new Error('file senza tassi leggibili'); }
    catch (e) { lastErr = e; }
  }
  if (!days.length) throw lastErr || new Error('nessun dato');
  return { fx: buildFx(src, days), note: `${days.length} giorni letti da ${used}` };
}

const PROVIDERS = { 'ecb-xml': providerEcbXml };

// ---------------------------------------------------------------------------
async function buildHouseholdData(previous) {
  const src = CFG.household, now = new Date(NOW);
  if (!src) return { data: previous ? { ...previous, stale: true } : null, note: 'indicatori quotidiani non configurati' };
  const age = previous?.checkedAt ? NOW - Date.parse(previous.checkedAt) : Infinity;
  if (!FORCE && age < (src.refreshHours ?? 24) * 3600e3) {
    return { data: previous, note: `riuso indicatori di ${Math.round(age / 60000)} minuti fa` };
  }

  const priorById = new Map((previous?.eurostat?.indicators || []).map(item => [item.id, item]));
  const hicp = src.eurostat;
  const eurostatEnabled = hicp?.enabled && hicp.license?.verified === true;
  const indicators = [];
  const errors = [];
  if (eurostatEnabled) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 14, 1)).toISOString().slice(0, 7);
    for (const category of hicp.categories) {
      try {
        const url = new URL(hicp.url);
        url.search = new URLSearchParams({
          freq: 'M', geo: hicp.geo, [hicp.coicopDimension]: category.code,
          unit: hicp.unit, sinceTimePeriod: start, lang: 'en'
        }).toString();
        const payload = JSON.parse(await fetchText(url));
        indicators.push(buildHicpIndicator(payload, category, now));
      } catch (e) {
        errors.push(`${category.id}: ${e.message}`);
        const old = priorById.get(category.id);
        if (old) indicators.push({ ...old, stale: true });
      }
    }
  } else errors.push('Eurostat: fonte disattivata o licenza non verificata');

  const priorMortgage = previous?.mortgage;
  let mortgage = priorMortgage ? { ...priorMortgage, stale: true } : null;
  const m = src.mortgage;
  if (!m?.enabled || m.license?.verified !== true) errors.push('mutui BCE: fonte disattivata o licenza non verificata');
  else {
    try {
      const ageMortgage = priorMortgage?.fetchedAt ? NOW - Date.parse(priorMortgage.fetchedAt) : Infinity;
      if (!FORCE && !priorMortgage?.stale && ageMortgage < (m.refreshHours ?? 24) * 3600e3) mortgage = priorMortgage;
      else {
        const csv = await fetchText(m.url);
        mortgage = {
          fetchedAt: now.toISOString(),
          source: { name: 'ECB Data Portal · MFI interest rate statistics (MIR)', attribution: m.license.attribution, url: m.pageUrl },
          rates: buildMortgageRates(csv, now)
        };
        mortgage.stale = mortgage.rates.every(rate => rate.stale);
      }
    } catch (e) {
      errors.push(`mutui BCE: ${e.message}`);
      if (priorMortgage) mortgage = { ...priorMortgage, stale: true };
    }
  }

  const data = {
    fetchedAt: now.toISOString(),
    checkedAt: now.toISOString(),
    eurostat: {
      source: eurostatEnabled ? { name: 'Eurostat · HICP ECOICOP ver. 2', attribution: hicp.license.attribution, url: hicp.pageUrl } : null,
      indicators,
      stale: indicators.length < (hicp?.categories?.length || 0) || indicators.some(item => item.stale)
    },
    mortgage,
    errors
  };
  data.stale = errors.length > 0 || data.eurostat.stale || !!mortgage?.stale;
  const note = errors.length
    ? `indicatori quotidiani parziali: ${errors.join('; ')}`
    : data.stale
      ? 'serie oltre la soglia di aggiornamento prevista'
      : `Eurostat ${indicators.length} serie; mutui BCE ${mortgage?.rates?.length || 0} serie`;
  return { data, note };
}

async function buildConsobData(previous) {
  const src = CFG.consobAlerts, now = new Date(NOW);
  if (!src?.enabled) {
    const data = previous ? { ...previous, stale: true } : null;
    return { data, note: 'avvisi Consob disattivati' };
  }
  const age = previous?.checkedAt ? NOW - Date.parse(previous.checkedAt) : Infinity;
  if (!FORCE && age < (src.refreshHours ?? 6) * 3600e3) {
    return { data: previous, note: `riuso avvisi Consob di ${Math.round(age / 60000)} minuti fa` };
  }
  try {
    const html = await fetchText(src.url);
    const data = {
      fetchedAt: now.toISOString(),
      checkedAt: now.toISOString(),
      stale: false,
      source: { name: 'CONSOB · Avvisi ai risparmiatori', url: src.url },
      items: parseConsobAlerts(html, src.url, src.maxItems || 5)
    };
    return { data, note: `${data.items.length} avvisi ufficiali Consob` };
  } catch (e) {
    const data = previous
      ? { ...previous, checkedAt: now.toISOString(), stale: true, error: e.message }
      : { checkedAt: now.toISOString(), stale: true, source: { name: 'CONSOB · Avvisi ai risparmiatori', url: src.url }, items: [], error: e.message };
    return { data, note: `errore avvisi Consob: ${e.message}` };
  }
}

// ---------------------------------------------------------------------------
async function main() {
  const prev = await readJson(`${DATA_DIR}/markets.json`);
  const out = { meta: { generatedAt: new Date(NOW).toISOString(), version: 2 }, fx: prev?.fx ?? null, sentiment: prev?.sentiment ?? null, household: prev?.household ?? null, scamAlerts: prev?.scamAlerts ?? null };
  const log = [];

  // 1) Cambi
  for (const src of CFG.sources) {
    if (!src.enabled) { log.push(`- ${src.id}: disattivata`); continue; }
    if (src.license?.verified !== true) { log.push(`✗ ${src.id}: SALTATA, licenza non verificata (license.verified deve essere true)`); continue; }
    const provider = PROVIDERS[src.type];
    if (!provider) { log.push(`✗ ${src.id}: tipo "${src.type}" non implementato`); continue; }
    try {
      const { fx, note } = await provider(src, prev?.fx);
      out.fx = fx; log.push(`✓ ${src.id}: ${note}`);
    } catch (e) {
      log.push(`✗ ${src.id}: ${e.message}${prev?.fx ? ' (resto i dati precedenti, segnati come non aggiornati)' : ''}`);
      if (prev?.fx) out.fx = { ...prev.fx, stale: true };
    }
  }

  // 2) Termometro (legge gli articoli appena raccolti)
  try {
    const art = await readJson(`${DATA_DIR}/articles.json`);
    if (!art?.articles) throw new Error('articles.json non trovato');
    out.sentiment = computeSentiment(art.articles, CFG.sentiment, prev?.sentiment, NOW);
    const s = out.sentiment;
    log.push(s.ready ? `✓ termometro: ${s.score}/100 (${s.label}) su ${s.n} notizie [+${s.counts.pos} / -${s.counts.neg} / =${s.counts.neutral}]` : `- termometro: dati insufficienti (${s.n} notizie nelle ultime ${s.windowHours} h, minimo ${CFG.sentiment.minArticles})`);
  } catch (e) {
    log.push(`✗ termometro: ${e.message}`);
  }

  // 3) Indicatori mensili sui costi quotidiani
  try {
    const { data, note } = await buildHouseholdData(prev?.household);
    out.household = data;
    log.push(`${data && !data.stale ? '✓' : '✗'} costo quotidiano: ${note}`);
  } catch (e) {
    log.push(`✗ costo quotidiano: ${e.message}`);
    if (prev?.household) out.household = { ...prev.household, stale: true };
  }

  // 4) Avvisi ufficiali ai risparmiatori
  const { data: scamAlerts, note: scamNote } = await buildConsobData(prev?.scamAlerts);
  out.scamAlerts = scamAlerts;
  log.push(`${scamAlerts && !scamAlerts.stale ? '✓' : '✗'} avvisi Consob: ${scamNote}`);

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(`${DATA_DIR}/markets.json`, JSON.stringify(out));
  console.log('MERCATI -> ' + `${DATA_DIR}/markets.json\n  ` + log.join('\n  '));
}

main().catch(e => { console.error('Errore mercati:', e.message); process.exit(1); });
