#!/usr/bin/env node
/**
 * TrendScan Hub - raccolta di articoli e video (nessuna chiave API, nessuna dipendenza)
 *
 *   node scripts/build-feeds.mjs              articoli + video
 *   node scripts/build-feeds.mjs --articles   solo articoli
 *   node scripts/build-feeds.mjs --videos     solo video
 *
 * ARTICOLI  legge i feed RSS/Atom dei giornali in config/sources.json (se un feed non e' noto lo cerca
 *           nella home del sito), tiene solo gli articoli di finanza personale (parole chiave), toglie i duplicati
 *           e scrive data/articles.json. Si salva SOLO titolo, breve estratto, immagine e link all'originale.
 * VIDEO     per ogni canale trova il channelId (verificando che il nome del canale corrisponda), legge il feed
 *           pubblico di YouTube e scrive data/videos.json.
 *
 * Variabili: DATA_DIR (default public/data), FEEDS_CONFIG (percorso config), YT_BASE (default https://www.youtube.com),
 *            YOUTUBE_API_KEY (facoltativa: usa l'API ufficiale di YouTube, molto più affidabile dei feed RSS)
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const CONFIG_URL = process.env.FEEDS_CONFIG ? new URL('file://' + process.env.FEEDS_CONFIG) : new URL('../config/sources.json', import.meta.url);
const CFG = JSON.parse(await readFile(CONFIG_URL, 'utf8'));
const YT = process.env.YT_BASE || 'https://www.youtube.com';
const DATA_DIR = process.env.DATA_DIR || 'public/data';
const ARGS = new Set(process.argv.slice(2));
const DO_ARTICLES = !ARGS.has('--videos');
const DO_VIDEOS = !ARGS.has('--articles');

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 TrendScanHub/1.0';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha = s => createHash('sha1').update(s).digest('hex').slice(0, 12);

async function fetchText(url, { headers = {}, timeout = 20000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': UA, 'Accept-Language': 'it-IT,it;q=0.9', ...headers } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } finally { clearTimeout(t); }
}

// ---------------------------------------------------------------------------
// Mini parser XML (RSS 2.0 e Atom), senza dipendenze
// ---------------------------------------------------------------------------
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', ndash: '–', mdash: '—', euro: '€', egrave: 'è', eacute: 'é', agrave: 'à', ograve: 'ò', ugrave: 'ù', igrave: 'ì' };
function decode(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m);
}
const esc = n => n.replace(/[.*+?^${}()|[\]\\:]/g, '\\$&');
const tagText = (block, name) => {
  const m = block.match(new RegExp(`<${esc(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc(name)}>`, 'i'));
  return m ? m[1] : '';
};
const attrOf = (tag, name) => { const m = tag.match(new RegExp(`\\b${esc(name)}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i')); return m ? decode(m[2] ?? m[3]) : ''; };
const tagsOf = (block, name) => block.match(new RegExp(`<${esc(name)}(?:\\s[^>]*)?/?>`, 'gi')) || [];
const stripHtml = h => decode(decode(h)).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const httpsUrl = u => { u = (u || '').trim(); if (u.startsWith('//')) u = 'https:' + u; return /^https?:\/\//i.test(u) ? u.replace(/^http:\/\//i, 'https://') : ''; };

function splitItems(xml) {
  return xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || [];
}

function pickImage(block) {
  for (const t of tagsOf(block, 'media:content')) {
    const u = httpsUrl(attrOf(t, 'url')); const type = attrOf(t, 'type') + attrOf(t, 'medium');
    if (u && (!type || /image/i.test(type))) return u;
  }
  for (const t of tagsOf(block, 'media:thumbnail')) { const u = httpsUrl(attrOf(t, 'url')); if (u) return u; }
  for (const t of tagsOf(block, 'enclosure')) { if (/image/i.test(attrOf(t, 'type'))) { const u = httpsUrl(attrOf(t, 'url')); if (u) return u; } }
  const html = decode(tagText(block, 'content:encoded') || tagText(block, 'description') || tagText(block, 'content') || tagText(block, 'summary'));
  const m = html.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i);
  return m ? httpsUrl(m[1]) : '';
}

function parseFeed(xml) {
  return splitItems(xml).map(b => {
    let link = stripHtml(tagText(b, 'link'));
    if (!link) {
      const links = tagsOf(b, 'link');
      const alt = links.find(l => /rel\s*=\s*["']alternate["']/i.test(l)) || links[0];
      link = alt ? attrOf(alt, 'href') : '';
    }
    if (!link) link = stripHtml(tagText(b, 'guid'));
    const dateRaw = stripHtml(tagText(b, 'pubDate') || tagText(b, 'published') || tagText(b, 'updated') || tagText(b, 'dc:date'));
    const d = new Date(dateRaw);
    const cats = (b.match(/<category(?:\s[^>]*)?>[\s\S]*?<\/category>/gi) || []).map(c => stripHtml(c)).join(' ');
    let summary = stripHtml(tagText(b, 'description') || tagText(b, 'summary') || tagText(b, 'content:encoded') || tagText(b, 'content'));
    summary = summary.replace(/(The post .* appeared first on .*|L'articolo .* proviene da .*|Leggi anche:.*)$/i, '').trim();
    return {
      title: stripHtml(tagText(b, 'title')),
      url: link,
      summary,
      image: pickImage(b),
      date: isNaN(d) ? null : d,
      cats
    };
  });
}

function clip(t, max) {
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return end > max * 0.5 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…';
}
function cleanUrl(u) {
  try { const x = new URL(u); [...x.searchParams.keys()].forEach(k => { if (/^(utm_|fbclid|gclid|xtor|cmpid|ref$)/i.test(k)) x.searchParams.delete(k); }); x.hash = ''; return x.toString(); } catch { return ''; }
}
const normTitle = t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// ---------------------------------------------------------------------------
// ARTICOLI
// ---------------------------------------------------------------------------
async function findFeedUrls(site) {
  try {
    const html = await fetchText(site);
    const out = [];
    for (const t of html.match(/<link\b[^>]*>/gi) || []) {
      if (/rel\s*=\s*["']alternate["']/i.test(t) && /(rss|atom)\+xml/i.test(t)) {
        const href = attrOf(t, 'href');
        if (href && !/comment/i.test(href)) { try { out.push(new URL(href, site).toString()); } catch { /* url non valido */ } }
      }
    }
    return out;
  } catch { return []; }
}

async function loadSource(src) {
  const tried = [];
  const candidates = [...(src.feeds || [])];
  for (let pass = 0; pass < 2; pass++) {
    for (const url of candidates) {
      if (tried.includes(url)) continue;
      tried.push(url);
      try {
        const xml = await fetchText(url, { headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' } });
        const items = parseFeed(xml);
        if (items.length) return { ok: true, feed: url, items };
      } catch { /* prova il prossimo */ }
    }
    if (pass === 0) candidates.push(...await findFeedUrls(src.site)); // autodiscovery dalla home
  }
  return { ok: false, tried };
}

// Immagine di anteprima presa dalla pagina originale dell'articolo (og:image / twitter:image) quando il feed non la fornisce.
// Non scarica l'immagine: salva solo il suo indirizzo, che la pagina usa come miniatura.
const BAD_IMG = /(logo|favicon|sprite|placeholder|default[-_]?(og|share|image)|blank|spacer)/i;
function extractPageImage(html, pageUrl) {
  const head = html.slice(0, 250000);
  const found = {};
  for (const tag of head.match(/<meta\b[^>]*>/gi) || []) {
    const key = (attrOf(tag, 'property') || attrOf(tag, 'name')).toLowerCase();
    if (['og:image', 'og:image:secure_url', 'og:image:url', 'twitter:image', 'twitter:image:src'].includes(key) && !found[key]) found[key] = attrOf(tag, 'content');
  }
  const link = (head.match(/<link\b[^>]*rel\s*=\s*["']image_src["'][^>]*>/i) || [''])[0];
  const cands = [found['og:image:secure_url'], found['og:image'], found['og:image:url'], found['twitter:image'], found['twitter:image:src'], link && attrOf(link, 'href')];
  for (const c of cands) {
    if (!c) continue;
    try { const u = httpsUrl(new URL(c.trim(), pageUrl).toString()); if (u && !BAD_IMG.test(u)) return u; } catch { /* non valido */ }
  }
  return '';
}

// ---------------------------------------------------------------------------
// Articoli a pagamento: si guarda cio' che la pagina originale dichiara di se' (nessun aggiramento).
//  - JSON-LD schema.org: "isAccessibleForFree": false (lo usano i giornali per segnalare il paywall a Google)
//  - meta article:content_tier = locked | metered
// Se la pagina non e' raggiungibile o non dice nulla, l'articolo resta (meglio uno in piu' che uno scartato a torto).
// ---------------------------------------------------------------------------
function findFree(node) {
  if (!node || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) { for (const n of node) { const r = findFree(n); if (r !== undefined) return r; } return undefined; }
  if ('isAccessibleForFree' in node) {
    const v = String(node.isAccessibleForFree).toLowerCase();
    if (v === 'false') return false;
    if (v === 'true') return true;
  }
  for (const k of Object.keys(node)) { const r = findFree(node[k]); if (r !== undefined) return r; }
  return undefined;
}
function detectPaywall(html) {
  const head = html.slice(0, 400000);
  for (const m of head.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { if (findFree(JSON.parse(decode(m[1]).trim())) === false) return true; } catch { /* JSON non valido: provo il controllo testuale */ }
  }
  if (/["']isAccessibleForFree["']\s*:\s*["']?false["']?/i.test(head)) return true;
  for (const tag of head.match(/<meta\b[^>]*>/gi) || []) {
    const key = (attrOf(tag, 'property') || attrOf(tag, 'name')).toLowerCase();
    if (key === 'article:content_tier' && /^(locked|metered)$/i.test(attrOf(tag, 'content').trim())) return true;
  }
  return false;
}

// Una sola visita alla pagina originale per articolo: ricava l'immagine di anteprima e controlla il paywall.
// L'esito del controllo resta nel campo "pw" (0 = libero, 1 = a pagamento) cosi' non si rifa' ogni ora.
async function enrichPages(list, { limit = 120, concurrency = 6, maxTries = 3, checkPaywall = true } = {}) {
  const needImg = a => !a.image && (a.imgTry || 0) < maxTries;
  const needPw = a => checkPaywall && a.pw === undefined && (a.pwTry || 0) < maxTries;
  const todo = list.filter(a => needImg(a) || needPw(a)).slice(0, limit);
  let img = 0, paid = 0, i = 0;
  async function worker() {
    while (i < todo.length) {
      const a = todo[i++];
      const wantImg = needImg(a), wantPw = needPw(a);
      try {
        const html = await fetchText(a.url, { timeout: 12000, headers: { Accept: 'text/html,*/*' } });
        if (wantImg) {
          const u = extractPageImage(html, a.url);
          if (u) { a.image = u; delete a.imgTry; img++; } else a.imgTry = (a.imgTry || 0) + 1;
        }
        if (wantPw) { a.pw = detectPaywall(html) ? 1 : 0; delete a.pwTry; if (a.pw) paid++; }
      } catch {
        if (wantImg) a.imgTry = (a.imgTry || 0) + 1;
        if (wantPw) a.pwTry = (a.pwTry || 0) + 1;
      }
      await sleep(150);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log(`PAGINE ORIGINALI: ${todo.length} visitate, ${img} miniature recuperate, ${paid} segnalate a pagamento`);
}

// ---------------------------------------------------------------------------
// Qualita': scarta notizie troppo stringate, flash di borsa e doppioni sullo stesso fatto
// ---------------------------------------------------------------------------
const STOP = new Set('il lo la i gli le un uno una di a da in con su per tra fra e ed o che del dello della dei degli delle al allo alla ai agli alle nel nello nella nei negli nelle sul sulla sui come non si ma piu ha'.split(' '));
const titleTokens = t => new Set(normTitle(t).split(' ').filter(w => w.length > 2 && !STOP.has(w)));
function jaccard(A, B) {
  if (A.size < 3 || B.size < 3) return 0;
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n / (A.size + B.size - n);
}
// ---------------------------------------------------------------------------
// Copertura: quante testate DIVERSE raccontano la stessa storia (segnale del Trend Radar).
// Si conta prima di scartare i doppioni, perche' proprio i doppioni sono il segnale.
// Si ignorano le parole di routine delle cronache ("borsa", "chiude", "rialzo"...) e si chiedono almeno 3 parole in comune.
// ---------------------------------------------------------------------------
const COVER_ROUTINE = new Set('borsa borse chiude chiudono chiusura apre apertura rialzo ribasso calo cala sale scende punti base milano oggi ieri domani euro miliardi milioni cosa come perche nuovo nuova nuovi nuove ecco quanto quando dove anche ancora dopo prima fino oltre contro verso italia italiano italiana italiani 2025 2026 anno anni mese mesi'.split(' '));
const coverTokens = t => new Set([...titleTokens(t)].filter(w => !COVER_ROUTINE.has(w)));
const outletOf = name => String(name || '').replace(/\s[–-]\s.*/, '').trim(); // "ANSA – Economia" -> "ANSA"
function coverSimilar(A, B, th, minShared) {
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n >= minShared && n / (A.size + B.size - n) >= th;
}

// anteprima che ripete solo il titolo = nessuna anteprima
function realSummary(title, summary) {
  const s = (summary || '').trim();
  const nt = normTitle(title), ns = normTitle(s);
  return !s || ns === nt || (ns.startsWith(nt) && ns.length - nt.length < 20) ? '' : s;
}

async function buildArticles() {
  const A = CFG.articles;
  const exclude = new RegExp(A.exclude, 'i');
  const excludeTitle = A.excludeTitle ? new RegExp(A.excludeTitle, 'i') : null;
  const minSummary = A.minSummaryChars ?? 0;
  const similarTh = A.similarTitle ?? 0;
  const cats = A.categories.map(c => ({ ...c, re: new RegExp(c.pattern, 'i') }));
  const maxAge = A.maxAgeDays * 86400e3, now = Date.now();
  const skipped = { troppoBrevi: 0, flashBorsa: 0, doppioni: 0, fuoriTema: 0, aPagamento: 0 };

  const results = await Promise.all(A.sources.map(async s => ({ s, r: await loadSource(s) })));
  const report = [];
  let collected = [];
  const coverPool = []; // {tk, outlet, t} di tutti i titoli visti, anche quelli poi scartati per brevita'

  for (const { s, r } of results) {
    if (s.paywall === 'skip') { report.push({ id: s.id, name: s.name, status: 'ok', feed: '(saltata: paywall=skip)', letti: 0, tenuti: 0 }); continue; }
    if (!r.ok) { report.push({ id: s.id, name: s.name, status: 'errore', detail: 'nessun feed raggiungibile (' + r.tried.length + ' indirizzi provati)' }); continue; }
    let kept = 0;
    for (const it of r.items) {
      const url = cleanUrl(it.url);
      if (!it.title || !url || !it.date) continue;
      const age = now - it.date.getTime();
      if (age > maxAge || age < -3600e3) continue;
      if (exclude.test(it.title)) continue;
      if (excludeTitle && excludeTitle.test(it.title)) { skipped.flashBorsa++; continue; }
      coverPool.push({ tk: coverTokens(it.title), outlet: outletOf(s.name), t: it.date.getTime() });
      const summary = realSummary(it.title, it.summary);
      if (summary.length < minSummary) { skipped.troppoBrevi++; continue; }
      // categoria dal titolo e dall'anteprima; le categorie del feed solo come ripiego per le fonti fidate
      let cat = cats.find(c => c.re.test(`${it.title} ${summary}`));
      if (!cat && s.trusted) cat = cats.find(c => c.re.test(it.cats));
      if (!s.trusted && !cat) { skipped.fuoriTema++; continue; }
      collected.push({
        id: sha(url),
        title: it.title,
        summary: clip(summary, 230),
        url,
        image: it.image || null,
        source: s.name,
        sourceId: s.id,
        category: (cat || cats[cats.length - 1]).name,
        publishedAt: it.date.toISOString()
      });
      kept++;
    }
    report.push({ id: s.id, name: s.name, status: 'ok', feed: r.feed, letti: r.items.length, tenuti: kept });
  }

  if (!collected.length) {
    const msg = 'nessun articolo raccolto: i siti non rispondono dal server di raccolta o nessun articolo supera il filtro';
    report.forEach(r => console.log(`  ${r.status === 'ok' ? '✓' : '✗'} ${r.name} ${r.detail || ''}`));
    const kept = await writeFailure(`${DATA_DIR}/articles.json`, { meta: { count: 0 }, articles: [] }, msg, report);
    throw Object.assign(new Error(msg), { kept });
  }

  // unisce con il file precedente (cosi' gli articoli non spariscono quando escono dalla finestra del feed).
  // Anche quelli vecchi passano dal filtro di qualita': i flash gia' salvati escono alla prima raccolta.
  let blocked = {};
  try {
    const prev = JSON.parse(await readFile(`${DATA_DIR}/articles.json`, 'utf8'));
    blocked = prev.blocked || {};
    // chi e' gia' stato visitato non si rivisita: si ereditano immagine ed esito del controllo paywall
    const prevById = new Map((prev.articles || []).map(p => [p.id, p]));
    for (const a of collected) {
      const p = prevById.get(a.id); if (!p) continue;
      if (!a.image && p.image) a.image = p.image;
      for (const k of ['imgTry', 'pw', 'pwTry']) if (p[k] !== undefined) a[k] = p[k];
      if (p.covBy) a.covBy = p.covBy;
    }
    for (const p of prev.articles || []) {
      if (now - new Date(p.publishedAt).getTime() > maxAge) continue;
      if (excludeTitle && excludeTitle.test(p.title)) { skipped.flashBorsa++; continue; }
      if (realSummary(p.title, p.summary).length < minSummary) { skipped.troppoBrevi++; continue; }
      const src = A.sources.find(x => x.id === p.sourceId);
      if (src && !src.trusted && !cats.some(c => c.re.test(`${p.title} ${p.summary}`))) { skipped.fuoriTema++; continue; }
      coverPool.push({ tk: coverTokens(p.title), outlet: outletOf(p.source), t: Date.parse(p.publishedAt) });
      collected.push(p);
    }
  } catch { /* primo avvio */ }
  for (const id of Object.keys(blocked)) if (now - blocked[id] > maxAge) delete blocked[id];

  collected.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const seenUrl = new Set(), seenTitle = new Set(), perSource = {}, pool = [], poolTokens = [];
  const poolMax = A.maxTotal + 40; // un po' di margine: gli a pagamento verranno tolti dopo
  for (const a of collected) {
    if (blocked[a.id]) { skipped.aPagamento++; continue; }
    const nt = normTitle(a.title);
    if (seenUrl.has(a.url) || seenTitle.has(nt)) continue;
    const tk = titleTokens(a.title);
    if (similarTh && poolTokens.some(o => jaccard(tk, o) >= similarTh)) { skipped.doppioni++; continue; }
    perSource[a.sourceId] = (perSource[a.sourceId] || 0) + 1;
    if (perSource[a.sourceId] > A.maxPerSource) continue;
    seenUrl.add(a.url); seenTitle.add(nt); pool.push(a); poolTokens.push(tk);
    if (pool.length >= poolMax) break;
  }

  // copertura: testate diverse che hanno pubblicato la stessa storia entro la finestra (si tiene solo se sono almeno 2)
  const covTh = A.coverageSimilarity ?? 0.4, covMin = A.coverageMinShared ?? 3, covMs = (A.coverageHours ?? 36) * 3600e3;
  for (const a of pool) {
    const own = outletOf(a.source), tk = coverTokens(a.title), t = Date.parse(a.publishedAt);
    const outlets = new Set(a.covBy || []); outlets.add(own);
    if (tk.size >= covMin) for (const c of coverPool) {
      if (c.outlet !== own && Math.abs(c.t - t) <= covMs && coverSimilar(tk, c.tk, covTh, covMin)) outlets.add(c.outlet);
    }
    if (outlets.size >= 2) a.covBy = [...outlets].sort().slice(0, 8); else delete a.covBy;
  }

  await enrichPages(pool, { checkPaywall: A.checkPaywall !== false });

  const out = [];
  for (const a of pool) {
    if (a.pw === 1) { blocked[a.id] = now; skipped.aPagamento++; continue; }
    out.push(a);
    if (out.length >= A.maxTotal) break;
  }

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(`${DATA_DIR}/articles.json`, JSON.stringify({ meta: { generatedAt: new Date().toISOString(), count: out.length, sources: report, skipped }, articles: out, blocked }));
  console.log(`\nARTICOLI: ${out.length} scritti in ${DATA_DIR}/articles.json`);
  console.log(`  scartati: ${skipped.troppoBrevi} troppo brevi, ${skipped.flashBorsa} flash di borsa, ${skipped.doppioni} doppioni sullo stesso fatto, ${skipped.fuoriTema} fuori tema, ${skipped.aPagamento} a pagamento`);
  report.forEach(r => console.log(`  ${r.status === 'ok' ? '✓' : '✗'} ${r.name}${r.status === 'ok' ? `  (${r.tenuti}/${r.letti} tenuti)  ${r.feed}` : '  ' + r.detail}`));
}

// ---------------------------------------------------------------------------
// VIDEO
// ---------------------------------------------------------------------------
const YT_HEADERS = { Cookie: 'CONSENT=YES+cb.20210328-17-p0.it+FX+917; SOCS=CAI', 'Accept-Language': 'it-IT,it;q=0.9' };
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function titleMatches(title, ch) {
  const t = ' ' + norm(title) + ' ';
  const tokens = (ch.match && ch.match.length ? ch.match : norm(ch.name).split(' ')).map(norm);
  return tokens.every(k => t.includes(k));
}

function parseChannelPage(html) {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i);
  const id =
    (html.match(/<meta[^>]+itemprop=["']channelId["'][^>]+content=["'](UC[\w-]{22})["']/i) || [])[1] ||
    (html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']https?:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})["']/i) || [])[1] ||
    (html.match(/"externalId":"(UC[\w-]{22})"/) || [])[1] ||
    (html.match(/"channelId":"(UC[\w-]{22})"/) || [])[1];
  return id ? { channelId: id, title: og ? decode(og[1]) : '' } : null;
}

async function resolveChannel(ch, cache) {
  if (ch.channelId) return { channelId: ch.channelId, how: 'config' };
  if (cache[ch.id]) return { ...cache[ch.id], how: 'cache' };
  for (const h of ch.handles || []) {
    try {
      const html = await fetchText(`${YT}/@${h}`, { headers: YT_HEADERS });
      const p = parseChannelPage(html);
      if (p && titleMatches(p.title, ch)) return { channelId: p.channelId, handle: h, title: p.title, how: 'handle' };
    } catch { /* prossimo handle */ }
  }
  try { // ricerca di canali per nome
    const html = await fetchText(`${YT}/results?search_query=${encodeURIComponent(ch.name)}&sp=EgIQAg%253D%253D`, { headers: YT_HEADERS });
    const re = /"channelRenderer":\{"channelId":"(UC[\w-]{22})"[\s\S]{0,2500}?"title":\{"simpleText":"([^"]+)"/g;
    let m;
    while ((m = re.exec(html))) if (titleMatches(decode(m[2]), ch)) return { channelId: m[1], title: decode(m[2]), how: 'search' };
  } catch { /* non risolto */ }
  return null;
}

function parseVideoFeed(xml, max) {
  const out = [];
  for (const b of splitItems(xml)) {
    const id = stripHtml(tagText(b, 'yt:videoId'));
    const link = tagsOf(b, 'link').map(l => attrOf(l, 'href')).find(Boolean) || '';
    if (!id || /\/shorts\//.test(link)) continue; // niente Shorts
    const views = attrOf(tagsOf(b, 'media:statistics')[0] || '', 'views');
    out.push({
      id,
      title: stripHtml(tagText(b, 'title')),
      publishedAt: stripHtml(tagText(b, 'published')),
      views: views ? Number(views) : null,
      thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
    });
    if (out.length >= max) break;
  }
  return out;
}

const YT_API = process.env.YT_API_BASE || 'https://www.googleapis.com/youtube/v3';
const YT_KEY = process.env.YOUTUBE_API_KEY || '';   // facoltativa: chiave "YouTube Data API v3" (segreto di GitHub)

async function withRetry(fn, tries = 2) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      if (/HTTP 404/.test(e.message)) break;   // inutile riprovare se la pagina non esiste
      await sleep(800 * (i + 1));
    }
  }
  throw last;
}
const isoSeconds = d => { const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d || ''); return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : null; };

// Ultimi video di un canale tramite l'API ufficiale di YouTube (playlist "caricamenti" = UU + resto dell'ID canale)
async function videosViaApi(channelId, max) {
  const q = (path, o) => `${YT_API}/${path}?${new URLSearchParams({ ...o, key: YT_KEY })}`;
  const list = JSON.parse(await fetchText(q('playlistItems', { part: 'snippet,contentDetails', playlistId: 'UU' + channelId.slice(2), maxResults: String(Math.min(50, max * 2)) })));
  const items = (list.items || [])
    .map(i => ({ id: i.contentDetails?.videoId || i.snippet?.resourceId?.videoId, title: i.snippet?.title || '', publishedAt: i.contentDetails?.videoPublishedAt || i.snippet?.publishedAt || '' }))
    .filter(v => v.id && v.title && !/^(Private|Deleted) video$/.test(v.title));
  const det = {};
  if (items.length) {
    const d = JSON.parse(await fetchText(q('videos', { part: 'contentDetails,statistics', id: items.map(v => v.id).join(',') })));
    for (const v of d.items || []) det[v.id] = { sec: isoSeconds(v.contentDetails?.duration), views: v.statistics?.viewCount ? Number(v.statistics.viewCount) : null };
  }
  return items
    .filter(v => { const sec = det[v.id]?.sec; return sec == null || sec > 70; })   // niente Shorts
    .slice(0, max)
    .map(v => ({ ...v, views: det[v.id]?.views ?? null, thumb: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg` }));
}

// Prova più strade, nell'ordine: API ufficiale (se c'è la chiave), feed RSS del canale, feed RSS della playlist "caricamenti".
async function fetchChannelVideos(channelId, max) {
  const errors = [];
  const rss = async path => parseVideoFeed(await fetchText(`${YT}/feeds/videos.xml?${path}`), max);
  const tries = [
    ['rss-canale', () => rss(`channel_id=${channelId}`)],
    ['rss-playlist', () => rss(`playlist_id=UU${channelId.slice(2)}`)]
  ];
  if (YT_KEY) tries.unshift(['api', () => videosViaApi(channelId, max)]);
  for (const [how, fn] of tries) {
    try { const v = await withRetry(fn, 2); if (v.length) return { vids: v, how }; errors.push(how + ': nessun video'); }
    catch (e) { errors.push(how + ': ' + e.message); }
  }
  throw new Error(errors.join(' | '));
}

async function buildVideos() {
  const V = CFG.videos;
  let cache = {};
  try { cache = JSON.parse(await readFile(`${DATA_DIR}/channel-ids.json`, 'utf8')); } catch { /* nessuna cache */ }

  const channels = [], allVideos = [], report = [];
  for (const ch of V.channels) {
    const base = { id: ch.id, name: ch.name, blurb: ch.blurb, verifiedHandle: !!ch.verifiedHandle, handle: ch.handles?.[0] || null, channelId: null, url: null, resolved: false, videoCount: 0 };
    const info = await resolveChannel(ch, cache).catch(() => null);
    if (!info) {
      base.url = `https://www.youtube.com/results?search_query=${encodeURIComponent(ch.name)}`;
      channels.push(base); report.push({ name: ch.name, status: 'non trovato' });
      continue;
    }
    cache[ch.id] = { channelId: info.channelId, handle: info.handle || cache[ch.id]?.handle, title: info.title || cache[ch.id]?.title };
    base.channelId = info.channelId; base.resolved = true;
    base.url = `https://www.youtube.com/channel/${info.channelId}`;
    base.handle = info.handle || base.handle;
    try {
      const { vids, how } = await fetchChannelVideos(info.channelId, V.perChannel);
      vids.forEach(v => allVideos.push({ ...v, channelId: ch.id }));
      base.videoCount = vids.length;
      report.push({ name: ch.name, status: 'ok', via: info.how + ' + ' + how, video: vids.length });
    } catch (e) { report.push({ name: ch.name, status: 'feed video non letto: ' + e.message }); }
    channels.push(base);
    await sleep(300);
  }

  allVideos.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const videos = allVideos.slice(0, V.maxTotal);
  if (!videos.length) {
    const msg = 'nessun video raccolto: YouTube non risponde dal server di raccolta o i canali non sono stati risolti';
    report.forEach(r => console.log(`  ✗ ${r.name}  ${r.status}`));
    const kept = await writeFailure(`${DATA_DIR}/videos.json`, { meta: { channels: channels.length, resolved: 0, count: 0 }, channels, videos: [] }, msg, report);
    throw Object.assign(new Error(msg), { kept });
  }

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(`${DATA_DIR}/channel-ids.json`, JSON.stringify(cache, null, 1));
  await writeFile(`${DATA_DIR}/videos.json`, JSON.stringify({ meta: { generatedAt: new Date().toISOString(), channels: channels.length, resolved: channels.filter(c => c.resolved).length, count: videos.length }, channels, videos }));
  console.log(`\nVIDEO: ${videos.length} video da ${channels.filter(c => c.resolved).length}/${channels.length} canali in ${DATA_DIR}/videos.json`);
  report.forEach(r => console.log(`  ${r.status === 'ok' ? '✓' : '✗'} ${r.name}  ${r.status === 'ok' ? `(${r.video} video, via ${r.via})` : r.status}`));
  const missing = report.filter(r => r.status !== 'ok');
  if (missing.length) console.log('\n  Canali non trovati: aggiungi l\'handle corretto (o "channelId") in config/sources.json.');
}

/** Se la raccolta non produce nulla: NON cancella i dati buoni precedenti; se non ce ne sono, scrive un file con il motivo, cosi' il sito lo mostra. */
async function writeFailure(file, emptyShape, error, report) {
  let prevOk = false;
  try { const p = JSON.parse(await readFile(file, 'utf8')); prevOk = (p.articles || p.videos || []).length > 0; } catch { /* nessun file */ }
  if (prevOk) { console.log(`  (tengo i dati precedenti di ${file})`); return true; }
  await mkdir(DATA_DIR, { recursive: true });
  const base = JSON.parse(JSON.stringify(emptyShape));
  base.meta = { ...base.meta, generatedAt: new Date().toISOString(), error, report };
  await writeFile(file, JSON.stringify(base));
  return false;
}

let failed = false;
if (DO_ARTICLES) await buildArticles().catch(e => { if (e.kept) console.log('::warning::Articoli non aggiornati (' + e.message + '). Restano online quelli precedenti.'); else { console.error('\nERRORE ARTICOLI:', e.message); failed = true; } });
if (DO_VIDEOS) await buildVideos().catch(e => { if (e.kept) console.log('::warning::Video non aggiornati (' + e.message + '). Restano online quelli precedenti.'); else { console.error('\nERRORE VIDEO:', e.message); failed = true; } });
process.exit(failed ? 1 : 0);
