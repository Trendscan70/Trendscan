#!/usr/bin/env node
/**
 * TrendScan Hub - mercati e Termometro TrendScan (nessuna chiave API, nessuna dipendenza)
 *
 *   node scripts/build-markets.mjs            aggiorna data/markets.json
 *   node scripts/build-markets.mjs --force    ignora l'intervallo minimo tra due richieste alla BCE
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
    const res = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': UA, Accept: 'application/xml,text/xml,*/*' } });
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
async function main() {
  const prev = await readJson(`${DATA_DIR}/markets.json`);
  const out = { meta: { generatedAt: new Date(NOW).toISOString(), version: 1 }, fx: prev?.fx ?? null, sentiment: prev?.sentiment ?? null };
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

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(`${DATA_DIR}/markets.json`, JSON.stringify(out));
  console.log('MERCATI -> ' + `${DATA_DIR}/markets.json\n  ` + log.join('\n  '));
}

main().catch(e => { console.error('Errore mercati:', e.message); process.exit(1); });
