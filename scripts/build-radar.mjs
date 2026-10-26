#!/usr/bin/env node
/**
 * TrendScan Hub - Trend Radar (nessuna chiave API, nessuna dipendenza)
 *
 *   node scripts/build-radar.mjs            aggiorna data/radar.json (+ data/radar-state.json)
 *   node scripts/build-radar.mjs --force    ignora l'intervallo minimo tra due richieste a Wikipedia
 *
 * Il Radar classifica per settore gli articoli recenti delle testate raccolte,
 * conserva i riferimenti alle fonti originali e raggruppa le storie coperte da più testate.
 * I prezzi dei cambi BCE sono mostrati separatamente dai dati delle notizie.
 *
 * Il Radar descrive cosa sta crescendo ADESSO. Non e' una previsione e non e' un consiglio.
 * Ogni fonte gira solo se enabled=true E license.verified=true (config/radar.json).
 *
 * Variabili: DATA_DIR (default public/data), RADAR_CONFIG (percorso config)
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { buildSectorRows } from './radar-sectors.mjs';

const CONFIG_URL = process.env.RADAR_CONFIG ? new URL('file://' + process.env.RADAR_CONFIG) : new URL('../config/radar.json', import.meta.url);
const CFG = JSON.parse(await readFile(CONFIG_URL, 'utf8'));
const DATA_DIR = process.env.DATA_DIR || 'public/data';
const FORCE = process.argv.includes('--force');
const NOW = Date.now();
const DAY = 86400e3;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const readJson = async p => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; } };
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const isoDay = t => new Date(t).toISOString().slice(0, 10);
const addDays = (iso, n) => isoDay(Date.parse(iso + 'T00:00:00Z') + n * DAY);
const round1 = x => Math.round(x * 10) / 10;

// ---------------------------------------------------------------------------
// WIKIPEDIA: interesse
// ---------------------------------------------------------------------------
async function fetchJson(url, ua, timeout = 20000) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': ua, 'Api-User-Agent': ua, Accept: 'application/json' } });
      if (res.status === 404) return { notFound: true };
      if (res.status === 429 || res.status >= 500) { // rispetto le richieste di rallentare
        const wait = Math.min(30, Number(res.headers.get('retry-after')) || 5 * (attempt + 1));
        await sleep(wait * 1000); continue;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally { clearTimeout(t); }
  }
  throw new Error('troppi tentativi (429/5xx)');
}

// Titoli -> titolo canonico (segue i redirect, scarta pagine inesistenti e di disambiguazione).
// Le visualizzazioni di un redirect contano solo i clic sul redirect: serve il titolo vero.
async function resolveTitles(src, titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 40) {
    const chunk = titles.slice(i, i + 40);
    const url = `${src.actionApi}?action=query&format=json&formatversion=2&redirects=1&prop=pageprops&ppprop=disambiguation&titles=${encodeURIComponent(chunk.join('|'))}`;
    const j = await fetchJson(url, src.userAgent);
    const q = j.query || {};
    const hop = (arr, t) => { const f = (arr || []).find(x => x.from === t); return f ? f.to : t; };
    for (const req of chunk) {
      const cur = hop(q.redirects, hop(q.normalized, req));
      const page = (q.pages || []).find(p => p.title === cur);
      if (!page || page.missing) out.set(req, { status: 'mancante' });
      else if (page.pageprops && page.pageprops.disambiguation !== undefined) out.set(req, { status: 'disambigua', title: cur });
      else out.set(req, { status: 'ok', title: cur, redirected: cur !== req });
    }
    await sleep(src.requestDelayMs);
  }
  return out;
}

const ymd = iso => iso.replaceAll('-', '');
async function fetchViews(src, title, startIso, endIso) {
  const art = encodeURIComponent(title.replace(/ /g, '_'));
  const url = `${src.pageviewsApi}/${src.project}/all-access/user/${art}/daily/${ymd(startIso)}00/${ymd(endIso)}00`;
  const j = await fetchJson(url, src.userAgent);
  if (j.notFound) return {};
  const m = {};
  for (const it of j.items || []) { const d = `${it.timestamp.slice(0, 4)}-${it.timestamp.slice(4, 6)}-${it.timestamp.slice(6, 8)}`; m[d] = it.views; }
  return m;
}

function wikiStats(src, daily, asOf) {
  const W = src.windowDays, dates = [];
  for (let i = 4 * W - 1; i >= 0; i--) dates.push(addDays(asOf, -i)); // 4 settimane terminanti ad asOf
  const v = dates.map(d => daily[d] || 0);
  const recent = v.slice(-W).reduce((a, b) => a + b, 0);
  const prev = v.slice(-2 * W, -W).reduce((a, b) => a + b, 0);
  return {
    recent, prev,
    changePct: prev >= src.minPrevViews ? round1((recent / prev - 1) * 100) : null, // null = dati troppo scarsi per un confronto
    series: v
  };
}

async function buildWiki(prev) {
  const src = CFG.sources.wikipedia;
  if (!src?.enabled) return { note: 'Wikipedia: disattivata', data: prev?.wiki ?? null, byTopic: {} };
  if (src.license?.verified !== true) return { note: 'Wikipedia: SALTATA, licenza non verificata (license.verified deve essere true)', data: null, byTopic: {} };

  const topics = CFG.topics.filter(t => t.wiki);
  // stesso elenco di argomenti richiesto l'ultima volta? (non si confrontano i risultati: alcune pagine possono mancare)
  const wanted = topics.map(t => t.id + '=' + t.wiki).sort().join();
  const sameSet = prev?.wiki?.requested === wanted && prev?.wiki?.topics;
  const age = sameSet && prev.wiki.fetchedAt ? NOW - Date.parse(prev.wiki.fetchedAt) : Infinity;
  if (!FORCE && age < src.refreshHours * 3600e3) return { note: `Wikipedia: riuso dati di ${Math.round(age / 60000)} minuti fa (intervallo minimo ${src.refreshHours} h)`, data: prev.wiki, byTopic: prev.wiki.topics };

  const resolved = await resolveTitles(src, [...new Set(topics.map(t => t.wiki))]);
  const raw = {}, problems = []; let latest = '';
  // qualche giorno di margine: se l'ultimo giorno non e' ancora disponibile, le 4 settimane di analisi restano comunque coperte
  const end = addDays(isoDay(NOW), -1), start = addDays(end, -30);
  for (const t of topics) {
    const r = resolved.get(t.wiki);
    if (!r || r.status !== 'ok') { problems.push(`${t.id}: pagina "${t.wiki}" ${r ? r.status : 'non risolta'}`); continue; }
    try {
      const daily = await fetchViews(src, r.title, start, end);
      const dates = Object.keys(daily).sort();
      if (!dates.length) { problems.push(`${t.id}: nessuna visualizzazione per "${r.title}"`); continue; }
      raw[t.id] = { title: r.title, daily }; if (dates.at(-1) > latest) latest = dates.at(-1);
    } catch (e) { problems.push(`${t.id}: ${e.message}`); }
    await sleep(src.requestDelayMs);
  }
  const ids = Object.keys(raw);
  if (!ids.length) {
    if (prev?.wiki) return { note: `Wikipedia: ERRORE (${problems[0] || 'nessun dato'}), resto i dati precedenti`, data: { ...prev.wiki, stale: true }, byTopic: prev.wiki.topics, problems };
    throw new Error(problems[0] || 'nessun dato da Wikipedia');
  }
  const byTopic = {};
  for (const id of ids) byTopic[id] = { page: raw[id].title, ...wikiStats(src, raw[id].daily, latest) };
  // argomenti non riusciti stavolta ma presenti prima: restano, con i dati precedenti
  for (const t of topics) if (!byTopic[t.id] && prev?.wiki?.topics?.[t.id]) byTopic[t.id] = { ...prev.wiki.topics[t.id], stale: true };
  return {
    note: `Wikipedia: ${ids.length}/${topics.length} pagine, dati fino al ${latest}` + (problems.length ? ` (${problems.length} problemi)` : ''),
    problems,
    data: { asOf: latest, fetchedAt: new Date(NOW).toISOString(), stale: false, requested: wanted, windowDays: src.windowDays, topics: byTopic,
            source: { name: src.name, attribution: src.license.attribution, url: src.pageUrl } },
    byTopic
  };
}

// ---------------------------------------------------------------------------
// NOTIZIE: menzioni nel tempo e copertura
// ---------------------------------------------------------------------------
function updateNewsState(articles, state) {
  const N = CFG.news, today = isoDay(NOW), oldest = addDays(today, -N.retentionDays);
  const res = CFG.topics.map(t => ({ id: t.id, re: new RegExp(t.pattern, 'i') }));
  let added = 0;
  for (const a of articles) {
    const day = (a.publishedAt || '').slice(0, 10);
    if (!day || day < oldest || day > today) continue;
    const seen = state.seen[day] || (state.seen[day] = []);
    if (seen.includes(a.id)) continue;
    seen.push(a.id); added++;
    state.totals[day] = (state.totals[day] || 0) + 1;
    const text = norm(`${a.title} ${a.summary}`);
    const h = state.history[day] || (state.history[day] = {});
    for (const r of res) if (r.re.test(text)) h[r.id] = (h[r.id] || 0) + 1;
  }
  for (const k of ['seen', 'totals', 'history']) for (const d of Object.keys(state[k])) if (d < oldest) delete state[k][d];
  return added;
}

function newsGrowth(state) {
  const N = CFG.news, today = isoDay(NOW);
  const days = Object.keys(state.totals).sort();
  const span = days.length ? Math.round((Date.parse(today) - Date.parse(days[0])) / DAY) + 1 : 0;
  const w = Math.min(N.windowDays, Math.floor(span / 2));
  const win = { historyDays: span, days: w, partial: w < N.windowDays, ready: span >= N.minSpanDays && w >= 2 };
  const sum = (dates, f) => dates.reduce((a, d) => a + f(d), 0);
  const recentDays = [], prevDays = [];
  for (let i = 0; i < w; i++) { recentDays.push(addDays(today, -i)); prevDays.push(addDays(today, -(w + i))); }
  const tot = d => state.totals[d] || 0;
  win.articlesRecent = sum(recentDays, tot); win.articlesPrev = sum(prevDays, tot);

  const out = {};
  for (const t of CFG.topics) {
    const m = d => (state.history[d] || {})[t.id] || 0;
    const rM = sum(recentDays, m), pM = sum(prevDays, m);
    const row = { recent: rM, prev: pM };
    if (win.ready && win.articlesRecent && win.articlesPrev) {
      const rs = rM / win.articlesRecent, ps = pM / win.articlesPrev;
      row.recentSharePct = round1(rs * 100); row.prevSharePct = round1(ps * 100);
      if (pM === 0 && rM >= CFG.news.minMentions) row.isNew = true;
      else if (ps > 0 && rM + pM >= CFG.news.minMentions) row.changePct = Math.min(999, round1((rs / ps - 1) * 100));
    }
    out[t.id] = row;
  }
  return { win, topics: out };
}

function coverStories(articles) {
  const N = CFG.news, cutoff = NOW - N.coverageHours * 3600e3;
  const STOP = new Set('il lo la i gli le un uno una di a da in con su per tra fra e ed o che del dello della dei degli delle al allo alla ai agli alle nel nello nella nei negli nelle sul sulla sui come non si ma piu ha'.split(' '));
  const ROUTINE = new Set('borsa borse chiude chiudono chiusura apre apertura rialzo ribasso calo cala sale scende punti base milano oggi ieri domani euro miliardi milioni cosa come perche nuovo nuova nuovi nuove ecco quanto quando dove anche ancora dopo prima fino oltre contro verso italia italiano italiana italiani 2025 2026 anno anni mese mesi'.split(' '));
  const tok = t => new Set(norm(t).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(w => w.length > 2 && !STOP.has(w) && !ROUTINE.has(w)));
  const similar = (A, B) => { let n = 0; for (const w of A) if (B.has(w)) n++; return n >= N.coverageMinShared && n / (A.size + B.size - n) >= N.coverageSimilarity; };
  const cands = articles.filter(a => Array.isArray(a.covBy) && a.covBy.length >= 2 && Date.parse(a.publishedAt) >= cutoff)
    .sort((a, b) => b.covBy.length - a.covBy.length || b.publishedAt.localeCompare(a.publishedAt));
  const clusters = [];
  for (const a of cands) {
    const tk = tok(a.title), c = clusters.find(c => similar(tk, c.tk));
    if (c) { a.covBy.forEach(o => c.outlets.add(o)); c.articles++; } // stessa storia: non si elenca due volte
    else clusters.push({ tk, rep: a, outlets: new Set(a.covBy), articles: 1 });
  }
  return clusters.map(c => ({
    id: c.rep.id, title: c.rep.title, url: c.rep.url, source: c.rep.source, category: c.rep.category,
    publishedAt: c.rep.publishedAt, outlets: [...c.outlets].sort(), n: c.outlets.size
  })).sort((a, b) => b.n - a.n || b.publishedAt.localeCompare(a.publishedAt)).slice(0, N.coverageTop);
}

// ---------------------------------------------------------------------------
async function main() {
  const prev = await readJson(`${DATA_DIR}/radar.json`);
  const log = [];
  const out = { meta: { generatedAt: new Date(NOW).toISOString(), version: 1, top: CFG.top || 8 }, wiki: prev?.wiki ?? null, news: prev?.news ?? null, coverage: prev?.coverage ?? [], sectors: prev?.sectors ?? [], topics: [] };

  // 1) Wikipedia
  let wiki = { byTopic: prev?.wiki?.topics ?? {} };
  try {
    wiki = await buildWiki(prev); out.wiki = wiki.data; log.push(`${wiki.data && !wiki.note.includes('SALTATA') ? '✓' : '✗'} ${wiki.note}`);
    for (const p of (wiki.problems || []).slice(0, 12)) log.push(`    - ${p}`);
  } catch (e) { log.push(`✗ Wikipedia: ${e.message}${prev?.wiki ? ' (resto i dati precedenti, segnati come non aggiornati)' : ''}`); if (prev?.wiki) { out.wiki = { ...prev.wiki, stale: true }; wiki = { byTopic: prev.wiki.topics }; } }

  // 2) Notizie
  let news = { win: null, topics: {} };
  try {
    const art = await readJson(`${DATA_DIR}/articles.json`);
    if (!art?.articles) throw new Error('articles.json non trovato');
    out.sectors = buildSectorRows(art.articles, CFG.sectors || [], NOW);
    const state = (await readJson(`${DATA_DIR}/radar-state.json`)) || {};
    state.seen ||= {}; state.totals ||= {}; state.history ||= {};
    const added = updateNewsState(art.articles, state);
    news = newsGrowth(state);
    out.news = news.win;
    out.coverage = coverStories(art.articles);
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(`${DATA_DIR}/radar-state.json`, JSON.stringify(state));
    const w = news.win;
    const sectorCount = out.sectors.reduce((n, sector) => n + sector.articles.length, 0);
    log.push(`✓ notizie: ${added} nuove contate, storico ${w.historyDays} giorni (${w.ready ? `confronto ${w.days} giorni vs ${w.days} precedenti${w.partial ? ', parziale' : ''}` : 'confronto non ancora disponibile: servono almeno ' + CFG.news.minSpanDays + ' giorni'}); articoli associati ai settori: ${sectorCount}; storie coperte da piu' testate: ${out.coverage.length}`);
  } catch (e) { log.push(`✗ notizie: ${e.message}`); }

  // 3) Riepilogo per argomento (le due misure restano in campi separati)
  out.topics = CFG.topics.map(t => ({
    id: t.id, label: t.label, kind: t.kind, price: t.price || null,
    wiki: wiki.byTopic?.[t.id] ?? null,
    news: news.topics?.[t.id] ?? null
  }));

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(`${DATA_DIR}/radar.json`, JSON.stringify(out));
  console.log(`RADAR -> ${DATA_DIR}/radar.json\n  ` + log.join('\n  '));
}

main().catch(e => { console.error('Errore radar:', e.message); process.exit(1); });
