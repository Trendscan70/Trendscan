// TrendScan Hub – articoli di finanza personale, playlist di video educativi, guide e calcolatore PAC.
// I dati arrivano da data/articles.json e data/videos.json (generati da scripts/build-feeds.mjs).
// Nessun contenuto e' scritto a mano: senza i file il sito mostra uno stato vuoto, mai articoli inventati.

const CATEGORIES = [
  { name: 'Risparmio e Budget',  icon: '💶', cls: 'g-risparmio',   img: 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?q=80&w=900&auto=format&fit=crop' },
  { name: 'ETF e Investimenti',  icon: '📈', cls: 'g-investimenti', img: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?q=80&w=900&auto=format&fit=crop' },
  { name: 'Pensione e TFR',      icon: '👴', cls: 'g-pensione',    img: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?q=80&w=900&auto=format&fit=crop' },
  { name: 'Casa e Mutui',        icon: '🏠', cls: 'g-casa',        img: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=900&auto=format&fit=crop' },
  { name: 'Tasse e Fisco',       icon: '🧾', cls: 'g-tasse',       img: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=900&auto=format&fit=crop' },
  { name: 'Banche e Conti',      icon: '🏦', cls: 'g-banche',      img: 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?q=80&w=900&auto=format&fit=crop' }
];
const HERO_IMG = 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?q=80&w=1400&auto=format&fit=crop';

const state = {
  view: 'home',
  articles: [], articleMeta: null, articlesLoaded: false,
  channels: [], videos: [], videoMeta: null, videosLoaded: false,
  filter: { cat: 'ALL', source: 'ALL', q: '' },
  shown: 12,
  queue: [], qIndex: -1, channelFilter: 'ALL',
  player: null, playerReady: false,
  compoundChartInstance: null,
  scroll: {},
  markets: null,
  radar: null, radarSort: 'interest'
};

// ------------------------------------------------------------------ utilita'
const $ = id => document.getElementById(id);
const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const safeUrl = u => (/^https?:\/\//i.test(u || '') ? u : '#');
const catOf = name => CATEGORIES.find(c => c.name === name) || { name: name || 'Finanza', icon: '💡', cls: 'g-default' };
function timeAgo(iso) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 2) return 'adesso';
  if (m < 60) return `${m} min fa`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? '1 ora fa' : `${h} ore fa`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ieri' : d < 30 ? `${d} giorni fa` : new Date(iso).toLocaleDateString('it-IT');
}
const fmtViews = n => n == null ? '' : n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' mln visualizzazioni' : n >= 1e3 ? Math.round(n / 1e3) + ' mila visualizzazioni' : n + ' visualizzazioni';
const validVid = id => /^[\w-]{11}$/.test(id || '');

/** Immagine con riserva: se non carica viene rimossa e resta il gradiente + emoji della categoria. */
function imgTag(src, alt = '') {
  if (!/^https?:\/\//i.test(src || '')) return '';
  return `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`;
}

// ------------------------------------------------------------------ qualita' degli articoli
// Rete di sicurezza: il filtro principale (brevi, flash di borsa, a pagamento, doppioni) e' in scripts/build-feeds.mjs.
// Qui si evita solo di mostrare notizie senza anteprima o doppie finche' i dati online non sono stati rigenerati.
const MIN_SUMMARY = 90, SIMILAR_TITLE = 0.6;
const STOP_W = new Set('il lo la i gli le un uno una di a da in con su per tra fra e ed o che del dello della dei degli delle al allo alla ai agli alle nel nello nella nei negli nelle sul sulla sui come non si ma piu ha'.split(' '));
const titleTokens = t => new Set(String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(w => w.length > 2 && !STOP_W.has(w)));
function similarTitles(A, B) {
  if (A.size < 3 || B.size < 3) return false;
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n / (A.size + B.size - n) >= SIMILAR_TITLE;
}
function cleanArticles(list) {
  const valid = list.filter(x => x && x.id && x.title && /^https?:\/\//i.test(x.url));
  let kept = valid.filter(x => String(x.summary || '').trim().length >= MIN_SUMMARY);
  if (kept.length < 6) kept = valid; // mai un sito vuoto: se il filtro svuota troppo, mostra comunque tutto
  const out = [], toks = [];
  for (const a of kept) {
    const t = titleTokens(a.title);
    if (toks.some(o => similarTitles(t, o))) continue;
    out.push(a); toks.push(t);
  }
  return out;
}

// ------------------------------------------------------------------ caricamento dati
async function loadJson(url) {
  try { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  catch (e) { return null; }
}
// I dati aggiornati ogni ora stanno nel ramo "data" di GitHub (DATA_BASE), cosi' non fanno ripubblicare il sito.
// Se non raggiungibili si usano i file inclusi nel sito (public/data).
const DATA_BASE = (window.TRENDSCAN_CONFIG && window.TRENDSCAN_CONFIG.DATA_BASE) || '';
let DATA_DIAG = '';
// Mirror di riserva (jsDelivr) ricavato dall'indirizzo raw.githubusercontent.com/UTENTE/REPO/RAMO/
function mirrorBase() {
  const m = DATA_BASE.match(/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\//);
  return m ? `https://cdn.jsdelivr.net/gh/${m[1]}/${m[2]}@${m[3]}/` : '';
}
const okData = d => d && d.meta && d.meta.generatedAt;
async function loadData(name, optional = false) {
  if (DATA_BASE) {
    const remote = await loadJson(DATA_BASE + name);
    if (okData(remote)) return remote;
    const mb = mirrorBase();
    const mirror = mb ? await loadJson(mb + name) : null;
    if (okData(mirror)) return mirror;
    if (!optional) DATA_DIAG = `Impossibile leggere i dati online da <code class="bg-gray-100 px-1 rounded">${esc(DATA_BASE)}</code>. Controlla che il repository sia pubblico, che il ramo <b>data</b> esista e che nessun blocco (adblock, rete aziendale, estensioni) impedisca l'accesso a raw.githubusercontent.com.`;
  }
  return loadJson('data/' + name);
}

async function bootstrap() {
  $('todayLabel').textContent = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const [a, v, mk, rd] = await Promise.all([loadData('articles.json'), loadData('videos.json'), loadData('markets.json', true), loadData('radar.json', true)]);
  if (rd && okData(rd)) state.radar = rd; // facoltativo
  if (mk && okData(mk)) state.markets = mk; // facoltativo: senza dati la fascia Mercati resta nascosta
  if (a && Array.isArray(a.articles)) { state.articles = cleanArticles(a.articles); state.articleMeta = a.meta || null; }
  state.articlesLoaded = !!a;
  if (v) { state.channels = v.channels || []; state.videos = (v.videos || []).filter(x => validVid(x.id)); state.videoMeta = v.meta || null; }
  state.videosLoaded = !!v;

  initTheme();
  initFontSize();
  renderBudgetDownload();
  renderBrokers();
  renderCategoryBar();
  renderSourceFilter();
  renderAll();
  setupEvents();
  setupCalculatorListeners();
  route();
}

function renderAll() {
  renderHero(); renderMarketStrip(); renderTopicTiles(); renderHomeLatest(); renderHomeTopics(); renderHomeVideos(); renderGuideTeasers();
  renderArticles(); renderMarketsView(); renderVideoPage();
}

// ------------------------------------------------------------------ componenti
// Le notizie si aprono dentro TrendScan (#a/ID); l'articolo originale e' raggiungibile solo dal pulsante nella pagina interna.
const articleHref = a => '#a/' + encodeURIComponent(a.id);
function articleCard(a) {
  const c = catOf(a.category);
  return `
    <a href="${articleHref(a)}" class="card group">
      <div class="thumb aspect-[16/10] ${c.cls}">
        <span class="cat-badge">${esc(c.name)}</span>
        <span class="thumb-emoji">${c.icon}</span>
        ${imgTag(a.image, a.title)}
      </div>
      <div class="p-4 flex-1 flex flex-col">
        <h3 class="card-title font-extrabold leading-snug text-[17px] line-clamp-3 transition-colors">${esc(a.title)}</h3>
        ${a.summary ? `<p class="text-sm text-gray-600 mt-2 line-clamp-3 leading-relaxed">${esc(a.summary)}</p>` : ''}
        <div class="mt-auto pt-3 flex items-center justify-between text-[11px] text-gray-500">
          <span class="font-bold text-gray-700 truncate pr-2" title="Fonte: ${esc(a.source)}">Fonte: ${esc(a.source)}</span><span class="whitespace-nowrap">${timeAgo(a.publishedAt)}</span>
        </div>
      </div>
    </a>`;
}

function emptyBox(title, html) {
  return `<div class="col-span-full rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">
    <div class="text-4xl mb-2">📰</div><div class="font-extrabold text-lg">${title}</div><div class="text-sm text-gray-600 mt-2 max-w-xl mx-auto leading-relaxed">${html}</div></div>`;
}
const SETUP_HINT = 'Gli articoli si raccolgono dai feed RSS dei giornali. Lancia <code class="bg-gray-100 px-1 rounded">npm run build:feeds</code> oppure, su GitHub, apri <b>Actions → Aggiorna articoli e video → Run workflow</b> (vedi README).';
function failureHint(meta) {
  const diag = DATA_DIAG ? `<div class="mt-3 text-xs text-red-700 max-w-xl mx-auto">${DATA_DIAG}</div>` : '';
  if (!meta || !meta.error) return diag;
  const rows = (meta.report || []).map(r => `<li>${esc(r.name)}: ${esc(r.status === 'ok' ? 'ok' : (r.detail || r.status))}</li>`).join('');
  return diag + `<div class="mt-3 text-left max-w-xl mx-auto"><div class="font-bold text-red-700">Ultimo tentativo di raccolta (${new Date(meta.generatedAt).toLocaleString('it-IT')}): ${esc(meta.error)}.</div>
    <ul class="list-disc pl-5 mt-1 text-xs text-gray-600">${rows}</ul>
    <div class="mt-2 text-xs">Se i siti rifiutano il server di GitHub, lancia <code class="bg-gray-100 px-1 rounded">npm run build:feeds</code> sul tuo computer e carica i file in <code class="bg-gray-100 px-1 rounded">data/</code>.</div></div>`;
}

function renderHero() {
  const g = $('heroGrid');
  const arts = state.articles;
  if (!arts.length) {
    g.innerHTML = `
      <a href="#guide" class="hero-main lg:col-span-2 g-risparmio">
        ${imgTag(HERO_IMG, '')}<div class="shade"></div>
        <div class="relative z-10 h-full min-h-[380px] flex flex-col justify-end p-6 sm:p-9">
          <span class="self-start px-3 py-1 rounded-md brand-bg text-[11px] font-extrabold uppercase tracking-widest">Hub di finanza personale</span>
          <h1 class="text-3xl sm:text-5xl font-black leading-tight mt-3 max-w-2xl">Metti in ordine i tuoi soldi, una guida alla volta.</h1>
          <p class="mt-3 text-gray-200 max-w-xl text-sm sm:text-base">Articoli dei giornali, video dei migliori youtuber italiani e un simulatore PAC per capire quanto può crescere il tuo risparmio.</p>
        </div>
      </a>
      <div class="flex flex-col gap-4">
        <a href="#video" class="hero-side"><div class="w-24 h-20 rounded-lg g-casa flex items-center justify-center text-3xl shrink-0">▶️</div><div><div class="text-[10px] font-extrabold uppercase brand-text">Video Educativi</div><div class="side-title font-extrabold leading-snug">La playlist dei migliori canali italiani di finanza</div></div></a>
        <a href="#guide" class="hero-side"><div class="w-24 h-20 rounded-lg g-investimenti flex items-center justify-center text-3xl shrink-0">🧮</div><div><div class="text-[10px] font-extrabold uppercase brand-text">Strumenti</div><div class="side-title font-extrabold leading-snug">Simulatore PAC e interesse composto</div></div></a>
        <a href="#articoli" class="hero-side"><div class="w-24 h-20 rounded-lg g-pensione flex items-center justify-center text-3xl shrink-0">📰</div><div><div class="text-[10px] font-extrabold uppercase brand-text">Articoli</div><div class="side-title font-extrabold leading-snug">I consigli di finanza personale dei giornali</div></div></a>
      </div>`;
    return;
  }
  const withImg = arts.find(a => a.image) || arts[0];
  const main = withImg;
  const side = arts.filter(a => a !== main).slice(0, 3);
  const c = catOf(main.category);
  g.innerHTML = `
    <a href="${articleHref(main)}" class="hero-main lg:col-span-2 ${c.cls}">
      <span class="thumb-emoji" style="font-size:6rem">${c.icon}</span>
      ${imgTag(main.image, main.title)}<div class="shade"></div>
      <div class="relative z-10 h-full min-h-[380px] flex flex-col justify-end p-6 sm:p-8">
        <span class="self-start px-3 py-1 rounded-md brand-bg text-[11px] font-extrabold uppercase tracking-widest">${esc(c.name)}</span>
        <h1 class="text-2xl sm:text-4xl font-black leading-tight mt-3 max-w-3xl">${esc(main.title)}</h1>
        ${main.summary ? `<p class="mt-2 text-gray-200 max-w-2xl text-sm line-clamp-2">${esc(main.summary)}</p>` : ''}
        <div class="mt-3 text-xs text-gray-300 font-semibold">Fonte: ${esc(main.source)} · ${timeAgo(main.publishedAt)}</div>
      </div>
    </a>
    <div class="flex flex-col gap-4">
      ${side.map(a => { const k = catOf(a.category); return `
        <a href="${articleHref(a)}" class="hero-side">
          <div class="thumb w-28 h-24 rounded-lg shrink-0 ${k.cls}"><span class="thumb-emoji" style="font-size:2rem">${k.icon}</span>${imgTag(a.image, a.title)}</div>
          <div class="min-w-0 flex flex-col"><div class="text-[10px] font-extrabold uppercase brand-text">${esc(k.name)}</div>
            <div class="side-title font-extrabold leading-snug line-clamp-3 text-[15px] transition-colors">${esc(a.title)}</div>
            <div class="mt-auto text-[11px] text-gray-500">Fonte: ${esc(a.source)} · ${timeAgo(a.publishedAt)}</div></div>
        </a>`; }).join('')}
    </div>`;
  state.heroIds = new Set([main.id, ...side.map(s => s.id)]);
}

function renderTopicTiles() {
  $('topicTiles').innerHTML = CATEGORIES.map(c => `
    <button class="tile ${c.cls} text-left" data-cat="${esc(c.name)}">
      <span class="thumb-emoji" style="font-size:3rem">${c.icon}</span>${imgTag(c.img, c.name)}<div class="shade"></div>
      <div class="absolute left-3 bottom-3 right-3 z-10"><div class="text-[11px] opacity-80">${state.articles.filter(a => a.category === c.name).length || ''} ${state.articles.length ? 'articoli' : ''}</div>
      <div class="font-extrabold leading-tight">${esc(c.name)}</div></div>
    </button>`).join('');
}

function renderHomeLatest() {
  const el = $('homeLatest');
  if (!state.articles.length) { el.innerHTML = emptyBox('Gli articoli arrivano dai feed dei giornali', SETUP_HINT + failureHint(state.articleMeta)); return; }
  const skip = state.heroIds || new Set();
  const latest = state.articles.filter(a => !skip.has(a.id)).slice(0, 6);
  state.latestIds = new Set(latest.map(a => a.id));
  el.innerHTML = latest.map(articleCard).join('');
}

// Titoli per argomento: solo notizie non gia' viste in alto, cosi' la home non si ripete.
function renderHomeTopics() {
  const wrap = $('homeTopicsWrap'), el = $('homeByTopic');
  if (!wrap || !el) return;
  const seen = new Set([...(state.heroIds || []), ...(state.latestIds || [])]);
  const boxes = CATEGORIES.map(c => ({ c, list: state.articles.filter(a => a.category === c.name && !seen.has(a.id)).slice(0, 4) }))
    .filter(b => b.list.length >= 2).slice(0, 6);
  wrap.classList.toggle('hidden', !boxes.length);
  el.innerHTML = boxes.map(({ c, list }) => `
    <div class="topic-box">
      <div class="topic-head ${c.cls}"><span>${c.icon} ${esc(c.name)}</span><button type="button" data-cat="${esc(c.name)}" class="topic-all">Tutti →</button></div>
      <div class="topic-list">${list.map(a => `
        <a href="${articleHref(a)}" class="topic-link">
          <span class="topic-title">${esc(a.title)}</span>
          <span class="topic-meta">Fonte: ${esc(a.source)} · ${timeAgo(a.publishedAt)}</span>
        </a>`).join('')}</div>
    </div>`).join('');
}

function videoCardDark(v) {
  const ch = state.channels.find(c => c.id === v.channelId);
  return `<button class="vcard group" data-video="${esc(v.id)}">
      <div class="relative aspect-video rounded-xl overflow-hidden bg-gray-800"><img src="https://i.ytimg.com/vi/${esc(v.id)}/hqdefault.jpg" alt="" loading="lazy" referrerpolicy="no-referrer" class="w-full h-full object-cover group-hover:scale-105 transition duration-500" onerror="this.remove()">
        <span class="play"><svg class="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span></div>
      <div class="mt-2 text-sm font-bold leading-snug line-clamp-2 group-hover:text-[#ff7b66]">${esc(v.title)}</div>
      <div class="text-[11px] text-gray-400 mt-0.5">${esc(ch ? ch.name : '')}</div>
    </button>`;
}

function renderHomeVideos() {
  const el = $('homeVideos');
  if (state.videos.length) { el.innerHTML = state.videos.slice(0, 4).map(videoCardDark).join(''); return; }
  el.innerHTML = state.channels.slice(0, 4).map(c => `
    <a href="#video" class="rounded-xl bg-white/5 border border-white/10 p-4 hover:bg-white/10 transition">
      ${avatar(c, 'w-12 h-12 text-lg')}<div class="mt-3 font-extrabold">${esc(c.name)}</div><div class="text-xs text-gray-400 mt-1 line-clamp-2">${esc(c.blurb || '')}</div></a>`).join('') ||
    '<p class="col-span-full text-sm text-gray-400">Nessun canale disponibile.</p>';
}

function renderGuideTeasers() {
  const items = [
    { id: 'guide-etf', t: 'Cos\'è un ETF', d: 'Il paniere di titoli che si compra con un solo ordine: vantaggi, rischi e costi.', cls: 'g-investimenti', icon: '📦', img: CATEGORIES[1].img },
    { id: 'guide-composto', t: 'PAC e potenza dell\'interesse composto', d: 'Perché cominciare presto conta più di versare tanto.', cls: 'g-risparmio', icon: '❄️', img: CATEGORIES[2].img },
    { id: 'guide-broker', t: 'Broker con PAC a costi bassi', d: 'Confronto di Trade Republic, Scalable, Directa e Fineco.', cls: 'g-casa', icon: '🏦', img: CATEGORIES[5].img }
  ];
  const _old = [
    { id: 'guide-1', t: 'Cosa sono le azioni', d: 'Quote di un\'azienda, dividendi e orizzonte di lungo periodo.', cls: 'g-investimenti', icon: '🏢', img: CATEGORIES[1].img },
    { id: 'guide-2', t: 'Regola 50/30/20 e fondo di emergenza', d: 'Come dividere lo stipendio prima di investire.', cls: 'g-risparmio', icon: '🛡️', img: CATEGORIES[0].img },
    { id: 'guide-4', t: 'Simulatore PAC e interesse composto', d: 'Prova quanto può crescere un risparmio mensile nel tempo.', cls: 'g-casa', icon: '🧮', img: CATEGORIES[4].img }
  ];
  void _old;
  $('guideTeasers').innerHTML = items.map(i => `
    <button class="card text-left" data-scroll="${i.id}">
      <div class="thumb aspect-[16/9] ${i.cls}"><span class="thumb-emoji">${i.icon}</span>${imgTag(i.img, i.t)}</div>
      <div class="p-4"><h3 class="font-extrabold text-lg leading-snug card-title">${esc(i.t)}</h3><p class="text-sm text-gray-600 mt-1">${esc(i.d)}</p></div>
    </button>`).join('');
}

// ------------------------------------------------------------------ categorie, filtri, articoli
function renderCategoryBar() {
  const cur = state.filter.cat;
  $('categoryBar').innerHTML = `<button class="chip ${cur === 'ALL' ? 'active' : ''}" data-cat="ALL">Tutti</button>` +
    CATEGORIES.map(c => `<button class="chip ${cur === c.name ? 'active' : ''}" data-cat="${esc(c.name)}">${c.icon} ${esc(c.name)}</button>`).join('');
}
function renderSourceFilter() {
  const sources = [...new Set(state.articles.map(a => a.source))].sort((a, b) => a.localeCompare(b));
  $('sourceFilter').innerHTML = `<option value="ALL">Tutte le testate (${sources.length})</option>` + sources.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  $('sourceFilter').value = state.filter.source;
}
function filteredArticles() {
  const { cat, source, q } = state.filter, k = q.trim().toLowerCase();
  return state.articles.filter(a =>
    (cat === 'ALL' || a.category === cat) && (source === 'ALL' || a.source === source) &&
    (!k || `${a.title} ${a.summary} ${a.source}`.toLowerCase().includes(k)));
}
function renderArticles() {
  renderCategoryIntro();
  const list = filteredArticles();
  const f = state.filter, active = f.cat !== 'ALL' || f.source !== 'ALL' || f.q;
  $('clearFilters').classList.toggle('hidden', !active);
  $('articleCount').textContent = state.articles.length ? `${list.length} articoli` : '';
  const meta = state.articleMeta, st = $('articleStatus');
  if (!state.articles.length) { st.innerHTML = ''; $('articleGrid').innerHTML = emptyBox(state.articlesLoaded ? 'Nessun articolo disponibile' : 'Articoli non ancora raccolti', SETUP_HINT + failureHint(state.articleMeta)); $('moreArticles').classList.add('hidden'); return; }
  if (meta && meta.generatedAt) {
    const bad = (meta.sources || []).filter(s => s.status !== 'ok');
    st.innerHTML = `<div class="text-[11px] text-gray-500">Aggiornato il ${new Date(meta.generatedAt).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' })} · ${(meta.sources || []).filter(s => s.status === 'ok').length} testate attive${bad.length ? ` · non raggiungibili: ${esc(bad.map(b => b.name).join(', '))}` : ''}</div>`;
  } else st.innerHTML = '';
  $('articleGrid').innerHTML = list.length ? list.slice(0, state.shown).map(articleCard).join('') : emptyBox('Nessun risultato', 'Prova a cambiare categoria, testata o parola cercata.');
  $('moreArticles').classList.toggle('hidden', list.length <= state.shown);
}

// ------------------------------------------------------------------ mercati: cambi BCE + Termometro TrendScan
// I tassi sono mostrati cifra per cifra come li pubblica la BCE (cambia solo il separatore decimale, all'italiana):
// la politica di riutilizzo BCE chiede fonte citata e statistiche non modificate. Variazioni e grafici sono
// elaborazioni TrendScan e sono dichiarati tali.
const fmtRate = r => String(r).replace('.', ',');
const fmtPct = n => n == null ? '–' : (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(2).replace('.', ',') + '%';
const pctCls = n => n == null || n === 0 ? '' : n > 0 ? 'mk-up' : 'mk-down';
const pctArrow = n => n == null || n === 0 ? '' : n > 0 ? '▲ ' : '▼ ';
const dateIt = d => { const x = new Date(d + 'T12:00:00'); return isNaN(x) ? d : x.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }); };
const DEFAULT_ZONES = [{ max: 40, name: 'Tono negativo' }, { max: 60, name: 'Tono neutro' }, { max: 100, name: 'Tono positivo' }];

function spark(values, w = 96, h = 28, cls = 'mk-spark') {
  const v = (values || []).map(Number).filter(Number.isFinite);
  if (v.length < 2) return '';
  const min = Math.min(...v), max = Math.max(...v), rng = max - min || 1;
  const pts = v.map((x, i) => `${(i / (v.length - 1) * w).toFixed(1)},${(h - 2 - (x - min) / rng * (h - 4)).toFixed(1)}`).join(' ');
  return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}

function gauge(s) {
  const zones = s.labels && s.labels.length ? s.labels : DEFAULT_ZONES;
  let prevMax = 0;
  const bars = zones.map((z, i) => { const w = Math.max(0, z.max - prevMax); prevMax = z.max; return `<span class="mk-z${i + 1}" style="width:${w}%"></span>`; }).join('');
  return `<div class="mk-gauge" role="img" aria-label="Termometro TrendScan: ${s.score} su 100, ${esc(s.label)}">
    <div class="mk-gauge-bar">${bars}<i class="mk-marker" style="left:${Math.min(100, Math.max(0, s.score))}%"></i></div>
    <div class="mk-gauge-scale"><span>0</span><span>50</span><span>100</span></div></div>`;
}
const toneCls = s => { const z = s.labels && s.labels.length ? s.labels : DEFAULT_ZONES; const i = z.findIndex(l => s.score <= l.max); return 'mk-t' + (i < 0 ? z.length : i + 1); };

function fxCredit(fx) {
  const src = fx.source || {};
  const link = src.url ? `<a href="${esc(safeUrl(src.url))}" target="_blank" rel="noopener noreferrer" class="underline">${esc(src.attribution || 'Source: ECB statistics.')}</a>` : esc(src.attribution || 'Source: ECB statistics.');
  return `Cambi: ${link} Tassi di riferimento del ${esc(dateIt(fx.asOf))}, solo a scopo informativo.${fx.stale ? ' <b>Dati non aggiornati: la BCE non risponde al momento.</b>' : ''}`;
}

function renderMarketStrip() {
  const el = $('marketStrip'); if (!el) return;
  const m = state.markets, fx = m && m.fx, s = m && m.sentiment;
  const hasFx = !!(fx && fx.pairs && fx.pairs.length), hasS = !!(s && s.ready);
  const hasRadar = rdReady();
  el.classList.toggle('hidden', !(hasFx || hasS || hasRadar));
  if (!(hasFx || hasS || hasRadar)) { el.innerHTML = ''; return; }
  const thermo = hasS ? `
    <a href="#mercati" class="mk-tile mk-thermo">
      <div class="mk-label">Termometro TrendScan</div>
      <div class="mk-thermo-row"><span class="mk-score ${toneCls(s)}">${s.score}</span><span class="mk-of">/100</span><span class="mk-tone ${toneCls(s)}">${esc(s.label)}</span></div>
      ${gauge(s)}
      <div class="mk-sub">Tono di ${s.n} notizie delle ultime ${s.windowHours} ore</div>
    </a>` : '';
  const tiles = hasFx ? fx.pairs.map(p => `
    <a href="#mercati" class="mk-tile" title="1 euro = ${esc(fmtRate(p.rate))} ${esc(p.currency)}">
      <div class="mk-label">${esc(p.label)}</div>
      <div class="mk-rate">${esc(fmtRate(p.rate))}</div>
      <div class="mk-chg ${pctCls(p.changePct)}">${pctArrow(p.changePct)}${fmtPct(p.changePct)}</div>
      <div class="mk-sparkwrap ${pctCls(p.changePct)}">${spark((p.series || []).slice(-30).map(x => x.r))}</div>
    </a>`).join('') : '';
  el.innerHTML = `
    <div class="section-title"><h2>Mercati</h2><span class="section-bar"></span>
      <a href="#mercati" class="text-sm font-bold brand-text whitespace-nowrap">Tutti i dati →</a></div>
    ${hasFx || hasS ? `<div class="grid grid-cols-2 lg:grid-cols-6 gap-3">${thermo}${tiles}</div>
    <p class="mk-credit">${hasFx ? fxCredit(fx) : ''}${hasS ? ' Termometro: elaborazione TrendScan sul tono dei titoli, non è un indice di mercato.' : ''} Variazioni e grafici: elaborazione TrendScan.</p>` : ''}
    ${hasRadar ? radarStripHtml() : ''}`;
}

function renderMarketsView() {
  const el = $('marketsView'); if (!el) return;
  const m = state.markets, fx = m && m.fx, s = m && m.sentiment;
  const hasFx = !!(fx && fx.pairs && fx.pairs.length);
  const hasMk = !!(m && (hasFx || (s && s.ready))); // dati di mercato (cambi o termometro) presenti?
  const upd = m && m.meta && m.meta.generatedAt ? new Date(m.meta.generatedAt).toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' }) : '';
  const bar = readerBar(false);
  if (!(m && (hasFx || (s && s.ready))) && !rdReady()) {
    el.innerHTML = bar + emptyBox('Dati di mercato non ancora disponibili', 'Si aggiornano automaticamente ogni ora: riprova tra poco. <a href="#home" class="brand-text font-bold underline">Torna alla home di TrendScan</a>.');
    return;
  }
  let thermo;
  if (s && s.ready) {
    const hist = (s.history || []).map(h => h.s);
    const chg = s.change == null ? '' : `<li>Rispetto a ieri: <b class="${pctCls(s.change)}">${s.change > 0 ? '+' : s.change < 0 ? '−' : ''}${Math.abs(s.change)} punti</b></li>`;
    const avg = s.avg7 == null ? '' : `<li>Media degli ultimi giorni: <b>${s.avg7}</b></li>`;
    thermo = `
      <div class="mk-big">
        <div class="mk-thermo-row"><span class="mk-score mk-score-xl ${toneCls(s)}">${s.score}</span><span class="mk-of">/100</span><span class="mk-tone ${toneCls(s)}">${esc(s.label)}</span></div>
        ${gauge(s)}
        <ul class="mk-facts">
          <li>Notizie analizzate (ultime ${s.windowHours} ore): <b>${s.n}</b> — <span class="mk-up">${s.counts.pos} positive</span> · ${s.counts.neutral} neutre · <span class="mk-down">${s.counts.neg} negative</span></li>
          ${chg}${avg}
        </ul>
        ${hist.length >= 2 ? `<div class="mk-histwrap"><div class="mk-label">Andamento del Termometro</div>${spark(hist, 300, 60, 'mk-hist')}<div class="mk-sub">${hist.length} giorni di storico</div></div>` : `<p class="mk-sub mt-2">Lo storico si costruisce giorno dopo giorno: il grafico comparirà con almeno due giorni di dati.</p>`}
      </div>`;
  } else {
    thermo = `<p class="text-sm text-gray-600">Dati insufficienti per calcolare il Termometro: servono almeno alcune notizie recenti. Si aggiorna ogni ora.</p>`;
  }
  const rows = hasFx ? fx.pairs.map(p => `
    <tr>
      <th scope="row"><span class="font-black">${esc(p.label)}</span><span class="mk-sub block">${esc(p.name || p.currency)}</span></th>
      <td class="mk-num"><b>${esc(fmtRate(p.rate))}</b></td>
      <td class="mk-num ${pctCls(p.changePct)}">${pctArrow(p.changePct)}${fmtPct(p.changePct)}</td>
      <td class="mk-num ${pctCls(p.change30dPct)}">${pctArrow(p.change30dPct)}${fmtPct(p.change30dPct)}</td>
      <td class="mk-trend ${pctCls(p.change30dPct)}">${spark((p.series || []).map(x => x.r), 120, 32)}</td>
    </tr>`).join('') : '';
  el.innerHTML = `
    ${bar}
    <header class="mk-head"><h1>Mercati</h1><p>Il Trend Radar, i cambi di riferimento della BCE e il Termometro TrendScan. Dati a scopo informativo${upd ? `, aggiornati il ${esc(upd)}` : ''}.</p></header>

    ${rdReady() ? radarSectionHtml() : ''}

    ${hasMk ? `<section class="mk-card" aria-labelledby="mkThermoTitle">
      <h2 id="mkThermoTitle" class="mk-h2">Termometro TrendScan <span class="mk-badge">elaborazione TrendScan</span></h2>
      <p class="mk-lead">Misura il <b>tono delle notizie</b> di finanza che raccogliamo dai giornali, su una scala da 0 (molto negative) a 100 (molto positive). Non misura i mercati e non è un consiglio: è un termometro dell’umore dei titoli.</p>
      ${thermo}
      <p class="mk-note">Come si calcola: conteggio di parole chiave su titoli e anteprime, con più peso alle notizie recenti. È un metodo semplice e ha limiti (ironia, contesto, titoli ambigui). <a href="/metodo/#termometro" class="underline font-bold brand-text">Leggi il metodo</a>.</p>
    </section>` : ''}

    ${hasFx ? `
    <section class="mk-card" aria-labelledby="mkFxTitle">
      <h2 id="mkFxTitle" class="mk-h2">Cambi dell’euro <span class="mk-badge">dati BCE</span></h2>
      <p class="mk-lead">Quanto vale 1 euro in altre valute, secondo i tassi di riferimento della Banca centrale europea.</p>
      <div class="mk-tablewrap"><table class="mk-table">
        <thead><tr><th scope="col">Coppia</th><th scope="col" class="mk-num">Tasso BCE</th><th scope="col" class="mk-num" title="Variazione rispetto al giorno precedente">Var. 1g*</th><th scope="col" class="mk-num" title="Variazione rispetto a circa 30 giorni prima">Var. 30g*</th><th scope="col">Andamento*</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p class="mk-note"><b>${fxCredit(fx)}</b> I tassi sono riportati come pubblicati dalla BCE (solo il separatore decimale è adattato all’italiano). Sono pubblicati intorno alle 16:00 CET nei giorni di apertura TARGET: nei weekend e nei festivi restano quelli dell’ultimo giorno disponibile. Non sono adatti a operazioni di cambio.<br>* Elaborazione TrendScan sui tassi BCE.</p>
    </section>` : ''}

    <p class="mk-disclaimer"><a href="/criptovalute/" class="underline font-bold brand-text">Nuovo a criptovalute? Leggi la guida per principianti →</a><br>Contenuti informativi, non consulenza finanziaria né raccomandazione di investimento. Altri mercati (indici, titoli di Stato, materie prime) saranno aggiunti quando avremo verificato le condizioni d’uso delle relative fonti.</p>
    <div class="reader-bottom"><a href="#home" class="reader-back reader-back-home">← Torna alla home di TrendScan</a></div>`;
}

// ------------------------------------------------------------------ Trend Radar (dentro Mercati)
// Tre misure DIVERSE, mai sommate in un punteggio unico:
//   Interesse = letture di pagine Wikipedia (non sono ricerche: Google Trends non ha un'API pubblica)
//   Notizie   = menzioni nei titoli e testate diverse che coprono la stessa storia (non sono letture ne' importanza)
//   Prezzi    = variazione di un prezzo (per ora solo i cambi BCE, mostrati nella stessa sezione)
// Il Radar descrive cosa sta crescendo adesso: non e' una previsione e non e' un consiglio.
const RD = {
  interest: { icon: '🔎', name: 'Interesse', cls: 'rd-m-interest' },
  news: { icon: '📰', name: 'Notizie', cls: 'rd-m-news' },
  price: { icon: '💹', name: 'Prezzi', cls: 'rd-m-price' }
};
const mBadge = k => `<span class="rd-badge ${RD[k].cls}">${RD[k].icon} ${RD[k].name}</span>`;
const fmtInt = n => Number(n).toLocaleString('it-IT');
const fmtPct0 = n => n == null ? '–' : (n > 0 ? '+' : n < 0 ? '−' : '') + (Math.abs(n) >= 999 ? '999+' : Math.round(Math.abs(n))) + '%';
const rdReady = () => !!(state.radar && state.radar.meta && state.radar.meta.generatedAt && state.radar.topics && state.radar.topics.length);
const rdNewsOk = () => !!(state.radar && state.radar.news && state.radar.news.ready);
const rdArticle = id => state.articles.find(a => a.id === id);
const rdBy = k => state.radar.topics.filter(t => t.kind === k);

// valore con cui si ordina una classifica; null = nessun confronto disponibile
function rdSortValue(t, key) {
  if (key === 'interest') return t.wiki && t.wiki.changePct != null ? t.wiki.changePct : null;
  if (!rdNewsOk() || !t.news) return null;
  return t.news.isNew ? 1000 : t.news.changePct != null ? t.news.changePct : null;
}
// una classifica di CRESCITA contiene solo chi cresce davvero
const rdGrowing = (rows, key) => rows.filter(t => (rdSortValue(t, key) ?? 0) > 0).sort((a, b) => rdSortValue(b, key) - rdSortValue(a, key));

function interestCell(t) {
  const w = t.wiki;
  if (!w) return `<td class="rd-cell rd-na" data-label="Interesse"><span class="rd-dash">—</span><span class="rd-sub">non misurato</span></td>`;
  const chg = w.changePct == null ? `<span class="rd-sub rd-block">dati troppo scarsi per un confronto</span>` : `<b class="rd-chg ${pctCls(w.changePct)}">${pctArrow(w.changePct)}${fmtPct0(w.changePct)}</b>`;
  return `<td class="rd-cell" data-label="Interesse"><span class="rd-num">${fmtInt(w.recent)}</span> <span class="rd-sub">letture in 7 giorni</span>${chg}
    <span class="rd-spark ${pctCls(w.changePct)}">${spark(w.series, 90, 22)}</span></td>`;
}
function newsCell(t) {
  const n = t.news, win = state.radar.news;
  if (!n) return `<td class="rd-cell rd-na" data-label="Notizie"><span class="rd-dash">—</span></td>`;
  if (!win || !win.ready) return `<td class="rd-cell rd-na" data-label="Notizie"><span class="rd-dash">—</span><span class="rd-sub">storico in costruzione</span></td>`;
  const chg = n.isNew ? `<b class="rd-chg mk-up">▲ nuovo</b>` : n.changePct != null ? `<b class="rd-chg ${pctCls(n.changePct)}">${pctArrow(n.changePct)}${fmtPct0(n.changePct)}</b>` : `<span class="rd-sub rd-block">dati troppo scarsi</span>`;
  return `<td class="rd-cell" data-label="Notizie"><span class="rd-num">${fmtInt(n.recent)}</span> <span class="rd-sub">menzioni (${String(n.recentSharePct ?? 0).replace('.', ',')}% delle notizie)</span>${chg}</td>`;
}
function priceCell(t) {
  const fx = state.markets && state.markets.fx, p = t.price && fx && fx.pairs ? fx.pairs.find(x => x.id === t.price) : null;
  if (!p || p.change30dPct == null) return `<td class="rd-cell rd-na" data-label="Prezzo"><span class="rd-dash">—</span><span class="rd-sub">${t.price ? 'dato non disponibile' : 'nessun prezzo collegato'}</span></td>`;
  return `<td class="rd-cell" data-label="Prezzo"><b class="rd-chg ${pctCls(p.change30dPct)}">${pctArrow(p.change30dPct)}${fmtPct(p.change30dPct)}</b> <span class="rd-sub">${esc(p.label)} in 30 giorni (BCE)</span></td>`;
}

function rdRows(rows, key, top, withPrice) {
  const ranked = rdGrowing(rows, key), shownIds = new Set(ranked.slice(0, top).map(t => t.id));
  const others = rows.filter(t => !shownIds.has(t.id)).sort((a, b) => (rdSortValue(b, key) ?? -9999) - (rdSortValue(a, key) ?? -9999));
  const head = `<thead><tr><th scope="col" class="rd-rank">#</th><th scope="col">Argomento</th><th scope="col">${mBadge('interest')}<span class="rd-th-sub">letture di Wikipedia</span></th><th scope="col">${mBadge('news')}<span class="rd-th-sub">menzioni nei titoli</span></th>${withPrice ? `<th scope="col">${mBadge('price')}<span class="rd-th-sub">variazione 30 giorni</span></th>` : ''}</tr></thead>`;
  const line = (t, i) => `<tr><td class="rd-rank" data-label="">${i == null ? '' : i + 1}</td><th scope="row">${esc(t.label)}</th>${interestCell(t)}${newsCell(t)}${withPrice ? priceCell(t) : ''}</tr>`;
  const table = list => `<div class="rd-tablewrap"><table class="rd-table">${head}<tbody>${list}</tbody></table></div>`;
  return (ranked.length ? table(ranked.slice(0, top).map((t, i) => line(t, i)).join('')) : `<p class="rd-empty">Nessun argomento risulta in crescita in questo momento secondo questa misura.</p>`)
    + (others.length ? `<details class="rd-more"><summary>Altri ${others.length} argomenti (stabili, in calo o senza confronto disponibile)</summary>${table(others.map(t => line(t, null)).join(''))}</details>` : '');
}
const sortBar = () => `<div class="rd-sort" role="group" aria-label="Ordina la classifica per">
  <span>Ordina per:</span>
  <button type="button" data-rd-sort="interest" class="${state.radarSort === 'interest' ? 'on' : ''}" aria-pressed="${state.radarSort === 'interest'}">${RD.interest.icon} Interesse</button>
  <button type="button" data-rd-sort="news" class="${state.radarSort === 'news' ? 'on' : ''}" aria-pressed="${state.radarSort === 'news'}">${RD.news.icon} Notizie</button></div>`;

function rdNotes() {
  const r = state.radar, w = r.wiki, n = r.news, out = [];
  if (w && w.stale) out.push('I dati di Wikipedia non sono aggiornati: la fonte non risponde al momento, mostriamo gli ultimi disponibili.');
  if (!w) out.push('La misura dell’interesse non è disponibile al momento.');
  if (n && !n.ready) out.push(`Il confronto delle notizie è in costruzione: abbiamo ${n.historyDays} giorni di storico, ne servono almeno 4 per un primo confronto e 14 per quello completo.`);
  else if (n && n.partial) out.push(`Confronto delle notizie ancora parziale: ultimi ${n.days} giorni contro i ${n.days} precedenti (diventerà di 7 contro 7 con 14 giorni di storico).`);
  return out.length ? `<div class="rd-note" role="note">${out.map(x => `<p>${x}</p>`).join('')}</div>` : '';
}

// ---- Home: blocco compatto dentro la sezione Mercati
function radarStripHtml() {
  const r = state.radar;
  const li = (label, val, cls) => `<li><span>${esc(label)}</span><b class="${cls || ''}">${val}</b></li>`;
  const grow = rdGrowing(rdBy('established'), 'interest').slice(0, 3);
  const emerg = rdNewsOk() ? rdGrowing(rdBy('emerging'), 'news').slice(0, 3) : [];
  const stories = (r.coverage || []).filter(c => rdArticle(c.id)).slice(0, 3);

  const c1 = grow.length ? `<ul>${grow.map(t => li(t.label, pctArrow(t.wiki.changePct) + fmtPct0(t.wiki.changePct), 'mk-up')).join('')}</ul><p class="rd-sub">letture su Wikipedia, 7 giorni contro i 7 precedenti</p>`
    : `<p class="rd-mini-empty">Nessun argomento in crescita in questo momento.</p>`;
  const c2 = `<p class="rd-mini-empty"><b>Dato non disponibile.</b> Non esiste una fonte affidabile e riutilizzabile di ricerche per singolo ETF: non inventiamo una classifica.</p>
    <p class="rd-sub"><a href="#mercati" data-goto-radar class="underline">Cosa misuriamo al suo posto</a></p>`;
  const c3 = !rdNewsOk() ? `<p class="rd-mini-empty">Confronto in costruzione: servono almeno 4 giorni di storico (ora ${state.radar.news ? state.radar.news.historyDays : 0}).</p>`
    : emerg.length ? `<ul>${emerg.map(t => li(t.label, t.news.isNew ? '▲ nuovo' : pctArrow(t.news.changePct) + fmtPct0(t.news.changePct), 'mk-up')).join('')}</ul><p class="rd-sub">menzioni nei titoli delle testate che seguiamo</p>`
    : `<p class="rd-mini-empty">Nessun tema emergente in questo momento.</p>`;
  const c4 = stories.length ? `<ul class="rd-mini-stories">${stories.map(c => `<li><a href="#a/${encodeURIComponent(c.id)}">${esc(c.title)}</a><b>${c.n} testate</b></li>`).join('')}</ul><p class="rd-sub">attenzione dei giornali, non dei lettori</p>`
    : `<p class="rd-mini-empty">Al momento nessuna storia è coperta da più testate.</p>`;

  const card = (title, badge, body, extra) => `<div class="rd-mini ${extra || ''}"><div class="rd-mini-head"><h4>${title}</h4>${badge}</div>${body}</div>`;
  return `
    <div class="rd-strip">
      <div class="rd-strip-head">
        <h3>Trend Radar</h3>
        <span class="rd-sub">Cosa sta crescendo ora, non cosa succederà</span>
        <a href="#mercati" data-goto-radar class="rd-strip-link">Classifiche complete →</a>
      </div>
      <div class="rd-mini-grid">
        ${card('Argomenti finanziari in più forte crescita', mBadge('interest'), c1)}
        ${card('ETF più cercati', '<span class="rd-badge rd-m-na">Non disponibile</span>', c2, 'rd-mini-na')}
        ${card('Temi economici emergenti', mBadge('news'), c3)}
        ${card('Notizie che ricevono più attenzione', mBadge('news'), c4)}
      </div>
      <p class="mk-credit">Tre misure diverse, mai sommate: ${mBadge('interest')} letture su Wikipedia (non sono ricerche) · ${mBadge('news')} attenzione dei giornali (non importanza né letture) · ${mBadge('price')} le variazioni dei cambi qui sopra. <a href="#mercati" data-goto-radar class="underline">Come leggerle</a>.</p>
    </div>`;
}

// ---- Pagina Mercati: classifiche complete
function radarSectionHtml() {
  const r = state.radar, top = (r.meta && r.meta.top) || 8, w = r.wiki;
  const cov = (r.coverage || []).map(c => {
    const a = rdArticle(c.id);
    return `<li class="rd-story">
      <div class="rd-story-n"><b>${c.n}</b><span>testate</span></div>
      <div class="rd-story-body">${a ? `<a href="#a/${encodeURIComponent(c.id)}" class="rd-story-title">${esc(c.title)}</a>` : `<span class="rd-story-title">${esc(c.title)}</span>`}
        <div class="rd-sub">${(c.outlets || []).map(o => `<span class="rd-chip">${esc(o)}</span>`).join('')} · ${esc(timeAgo(c.publishedAt))}</div></div></li>`;
  }).join('');
  const fx = state.markets && state.markets.fx;
  const prices = fx && fx.pairs && fx.pairs.length ? [...fx.pairs].filter(p => p.change30dPct != null).sort((a, b) => Math.abs(b.change30dPct) - Math.abs(a.change30dPct)).map(p => `
      <li class="rd-price"><span><b>${esc(p.label)}</b> <span class="rd-sub">${esc(p.name || '')}</span></span>
        <b class="rd-chg ${pctCls(p.change30dPct)}">${pctArrow(p.change30dPct)}${fmtPct(p.change30dPct)}</b></li>`).join('') : '';

  return `
    <section id="trendRadar" class="mk-card rd-section" aria-labelledby="rdTitle">
      <h2 id="rdTitle" class="mk-h2">Trend Radar <span class="mk-badge">cosa cresce ora</span></h2>
      <p class="mk-lead">Le classifiche di ciò che sta crescendo nei temi di finanza personale. Descrivono il presente: <b>non prevedono il futuro e non sono un consiglio</b>.</p>
      ${rdNotes()}

      <div class="rd-legend">
        <h3 class="rd-h3">Tre misure diverse, mai mescolate</h3>
        <p class="mk-lead">Un argomento può essere molto letto senza che il suo prezzo si muova, o far parlare molto i giornali senza interessare i lettori. Per questo non c’è un punteggio unico: ogni numero ha la sua etichetta.</p>
        <div class="rd-legend-grid">
          <div class="rd-legend-card ${RD.interest.cls}">${mBadge('interest')}<h4>Quanto interessa</h4>
            <p>Quante volte viene letta ogni settimana la pagina di Wikipedia in italiano su un argomento, rispetto alla settimana prima.</p>
            <p class="rd-sub"><b>Non sono ricerche:</b> i dati di ricerca di Google non sono disponibili pubblicamente. Fonte: Wikimedia (CC0), aggiornata ogni 12 ore.</p></div>
          <div class="rd-legend-card ${RD.news.cls}">${mBadge('news')}<h4>Quanto se ne parla</h4>
            <p>Quanti titoli delle testate che seguiamo citano un tema, e quante testate diverse raccontano la stessa storia.</p>
            <p class="rd-sub"><b>Non misura quanto le notizie siano lette né quanto siano importanti:</b> una storia può essere molto coperta e contare poco. Aggiornata ogni ora.</p></div>
          <div class="rd-legend-card ${RD.price.cls}">${mBadge('price')}<h4>Quanto si è mosso il prezzo</h4>
            <p>Di quanto è cambiato un prezzo negli ultimi 30 giorni. Per ora solo i cambi dell’euro (BCE), qui sotto e nella tabella dei cambi.</p>
            <p class="rd-sub">Gli altri prezzi (azioni, ETF, materie prime) non ci sono finché non verifichiamo le licenze delle fonti.</p></div>
        </div>
      </div>

      <div class="rd-board" aria-labelledby="rdB1">
        <h3 id="rdB1" class="rd-h3">Argomenti finanziari in più forte crescita</h3>
        <p class="mk-lead">I temi classici della finanza personale che stanno crescendo, in ordine. Scegli quale misura usare per ordinare: le colonne restano separate.</p>
        ${sortBar()}
        ${rdRows(rdBy('established'), state.radarSort, top, true)}
      </div>

      <div class="rd-board" aria-labelledby="rdB2">
        <h3 id="rdB2" class="rd-h3">ETF più cercati</h3>
        <div class="rd-unavail" role="note"><strong>Dato non disponibile</strong>
          Una classifica degli ETF per ricerche richiede dati per singolo ETF, affidabili e riutilizzabili. Non li abbiamo trovati: Google Trends non ha un’API pubblica e i siti di confronto non consentono di riusare i loro dati. Preferiamo non inventare una classifica.</div>
        <p class="mk-lead">Cosa possiamo misurare davvero: quanto si legge e quanto si parla degli ETF in generale e degli indici su cui si basano molti ETF. <b>Non è una classifica di ETF</b> e non dice quali comprare.</p>
        ${rdRows([...r.topics.filter(t => t.id === 'etf'), ...rdBy('index')], state.radarSort, 20, false)}
      </div>

      <div class="rd-board" aria-labelledby="rdB3">
        <h3 id="rdB3" class="rd-h3">Temi economici emergenti</h3>
        <p class="mk-lead">Temi nuovi o in rapida ascesa, scelti dalla redazione e misurati in automatico. Un tema «nuovo» nelle notizie è comparso solo di recente: bastano pochi articoli a farlo salire, quindi guarda anche il numero di menzioni.</p>
        ${sortBar()}
        ${rdRows(rdBy('emerging'), state.radarSort, top, false)}
      </div>

      <div class="rd-board" aria-labelledby="rdB4">
        <h3 id="rdB4" class="rd-h3">Notizie che stanno ricevendo maggiore attenzione</h3>
        <p class="mk-lead">Le storie raccontate da più testate diverse nelle ultime 48 ore. ${mBadge('news')} È attenzione dei giornali, non dei lettori: <b>molte testate non significano più importante</b>.</p>
        ${cov ? `<ol class="rd-stories">${cov}</ol>` : `<p class="rd-empty">Al momento nessuna storia risulta coperta da più testate. Compare qui appena ce ne sono.</p>`}
      </div>

      ${prices ? `<div class="rd-board" aria-labelledby="rdB5">
        <h3 id="rdB5" class="rd-h3">Prezzi: cosa si è mosso ${mBadge('price')}</h3>
        <p class="mk-lead">Variazione a 30 giorni dei cambi dell’euro. È l’unica misura di prezzo del Radar, per ora.</p>
        <ul class="rd-prices">${prices}</ul>
        <p class="mk-credit">${fxCredit(fx)} Variazioni: elaborazione TrendScan.</p>
      </div>` : ''}

      <details class="rd-method">
        <summary>Come si calcola e quali sono i limiti</summary>
        <ul>
          <li><b>Interesse.</b> Letture degli ultimi 7 giorni contro i 7 precedenti, sulle pagine di Wikipedia in italiano (solo utenti, non robot). Se la settimana precedente ha meno di 150 letture non calcoliamo la percentuale: sarebbe poco affidabile.</li>
          <li><b>Notizie.</b> Quota di articoli che citano l’argomento nei titoli e nelle anteprime, ultimi giorni contro i precedenti: usando la quota, il risultato non dipende da quanti articoli raccogliamo. «Nuovo» significa zero menzioni prima e almeno 3 ora.</li>
          <li><b>Copertura.</b> Titoli molto simili in testate diverse entro 36 ore contano come la stessa storia. Il metodo può unire per errore storie vicine o non riconoscere la stessa storia scritta in modo molto diverso.</li>
          <li><b>Limiti.</b> I temi sono scelti dalla redazione: il Radar non scopre temi che non abbiamo in elenco. Le notizie sono solo quelle delle testate che seguiamo. Wikipedia misura la lettura di un’enciclopedia, non l’interesse di tutti. Una crescita non è un segnale di acquisto e non anticipa quello che succederà.</li>
          ${w ? `<li><b>Fonte dell’interesse.</b> ${esc(w.source && w.source.attribution || '')}. Dati fino al ${esc(dateIt(w.asOf))}.</li>` : ''}
        </ul>
        <p class="rd-sub"><a href="/metodo/#radar" class="underline font-bold brand-text">Leggi il metodo completo</a></p>
      </details>
    </section>`;
}

// ------------------------------------------------------------------ lettura dentro TrendScan
// Mostra titolo, fonte, data, immagine e la breve anteprima pubblicata dalla testata. Il testo completo e' dei giornali:
// non lo riproduciamo (diritto d'autore, e i giornali non consentono l'incorporamento), rimandiamo alla fonte con un pulsante.
const domainOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
function readerBar(withArticles = true) {
  return `<nav class="reader-bar" aria-label="Navigazione">
    <a href="#home" class="reader-back reader-back-home">← Torna alla home di TrendScan</a>
    ${withArticles ? '<a href="#articoli" class="reader-back">Tutti gli articoli</a>' : ''}
  </nav>`;
}
function showArticle(id) {
  const a = state.articles.find(x => x.id === id);
  showView('articolo');
  const el = $('articleView');
  if (!a) {
    document.title = 'Articolo non disponibile | TrendScan';
    el.innerHTML = readerBar() + emptyBox('Questa notizia non è più disponibile',
      'È uscita dall\'elenco oppure il link è vecchio. <a href="#home" class="brand-text font-bold underline">Torna alla home di TrendScan</a> per vedere le notizie aggiornate.');
    return;
  }
  const c = catOf(a.category), dom = domainOf(a.url);
  const when = new Date(a.publishedAt).toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' });
  const others = state.articles.filter(x => x.id !== a.id);
  const related = [...others.filter(x => x.category === a.category), ...others.filter(x => x.category !== a.category)].slice(0, 3);
  el.innerHTML = `
    ${readerBar()}
    <article class="reader-article">
      <button type="button" data-cat="${esc(a.category)}" class="reader-cat ${c.cls}">${c.icon} ${esc(c.name)}</button>
      <h1 class="reader-title">${esc(a.title)}</h1>
      <p class="reader-meta"><span>Fonte: <b>${esc(a.source)}</b>${dom ? ` (${esc(dom)})` : ''}</span><span>${esc(when)} · ${timeAgo(a.publishedAt)}</span></p>
      ${a.image ? `<figure class="reader-figure"><div class="thumb ${c.cls}"><span class="thumb-emoji">${c.icon}</span>${imgTag(a.image, a.title)}</div><figcaption>Immagine: ${esc(a.source)}</figcaption></figure>` : ''}
      <section class="reader-summary" aria-label="Anteprima dalla fonte">
        <div class="reader-label">Anteprima dalla fonte</div>
        <p>${esc(a.summary || 'La testata non ha pubblicato un’anteprima per questa notizia.')}</p>
      </section>
      <a class="reader-cta" href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener noreferrer">Leggi l'articolo completo su ${esc(a.source)} <span aria-hidden="true">↗</span></a>
      <p class="reader-note">TrendScan riporta solo titolo e breve anteprima. L'articolo è di proprietà di <b>${esc(a.source)}</b> e ogni diritto resta della testata: il testo completo si legge sul suo sito${dom ? ` (${esc(dom)})` : ''}. Contenuto informativo, non consulenza finanziaria.</p>
    </article>
    ${related.length ? `<section class="reader-related"><div class="section-title"><h2>Altre notizie</h2><span class="section-bar"></span></div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">${related.map(articleCard).join('')}</div></section>` : ''}
    <div class="reader-bottom"><a href="#home" class="reader-back reader-back-home">← Torna alla home di TrendScan</a></div>`;
  document.title = `${a.title} | TrendScan`;
  const d = document.querySelector('meta[name="description"]'); if (d) d.setAttribute('content', `${a.summary || a.title} — Fonte: ${a.source}`);
  const fig = el.querySelector('.reader-figure'), im = fig && fig.querySelector('img');
  if (fig && !im) fig.remove(); else if (im) im.addEventListener('error', () => fig.remove());
  const h1 = el.querySelector('h1'); if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
}

// ------------------------------------------------------------------ video / playlist
const PALETTE = ['#e8412c', '#6366f1', '#10b981', '#f59e0b', '#0ea5e9', '#8b5cf6', '#ec4899', '#14b8a6'];
function avatar(c, size = 'w-12 h-12 text-lg') {
  let h = 0; for (const ch of c.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const ini = c.name.replace(/[^A-Za-zÀ-ÿ ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  return `<span class="${size} rounded-full flex items-center justify-center font-black text-white shrink-0" style="background:${PALETTE[h % PALETTE.length]}">${esc(ini)}</span>`;
}
function channelLink(c) {
  if (c.resolved && c.url) return c.url;
  if (c.verifiedHandle && c.handle) return `https://www.youtube.com/@${encodeURIComponent(c.handle)}`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(c.name)}`;
}

function buildQueue() {
  state.queue = state.videos.filter(v => state.channelFilter === 'ALL' || v.channelId === state.channelFilter);
}

function renderVideoPage() {
  const withVideos = new Set(state.videos.map(v => v.channelId));
  $('channelChips').innerHTML = `<button class="chip text-xs font-bold ${state.channelFilter === 'ALL' ? 'active' : ''}" data-channel="ALL">Tutti i canali</button>` +
    state.channels.filter(c => withVideos.has(c.id)).map(c => `<button class="chip text-xs font-bold ${state.channelFilter === c.id ? 'active' : ''}" data-channel="${esc(c.id)}">${esc(c.name)}</button>`).join('');

  buildQueue();
  const st = $('videoStatus');
  if (!state.videos.length) {
    st.innerHTML = `<div class="rounded-2xl border border-dashed border-gray-300 bg-white p-5 text-sm text-gray-600 text-center">I video si caricano dai feed pubblici di YouTube. ${SETUP_HINT.replace('Gli articoli si raccolgono dai feed RSS dei giornali. ', '')} Nel frattempo trovi qui sotto i canali.${failureHint(state.videoMeta)}</div>`;
  } else {
    const m = state.videoMeta, miss = state.channels.filter(c => !c.resolved);
    st.innerHTML = m ? `<div class="text-[11px] text-gray-500">Aggiornato il ${new Date(m.generatedAt).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' })} · ${m.resolved}/${m.channels} canali trovati${miss.length ? ` (da verificare: ${esc(miss.map(c => c.name).join(', '))})` : ''}</div>` : '';
  }

  const cnt = {}; state.videos.forEach(v => cnt[v.channelId] = (cnt[v.channelId] || 0) + 1);
  $('channelGrid').innerHTML = state.channels.map(c => `
    <div class="bg-white border border-gray-200 rounded-2xl p-4 flex gap-3 hover:shadow-md transition">
      ${avatar(c)}
      <div class="min-w-0 flex-1">
        <div class="font-extrabold leading-tight">${esc(c.name)}</div>
        <div class="text-xs text-gray-600 mt-1 leading-relaxed">${esc(c.blurb || '')}</div>
        <div class="mt-2 flex items-center gap-3 text-xs font-bold">
          ${cnt[c.id] ? `<button class="brand-text" data-channel="${esc(c.id)}" data-play-channel="1">▶ ${cnt[c.id]} video</button>` : ''}
          <a href="${esc(channelLink(c))}" target="_blank" rel="noopener noreferrer" class="text-gray-500 hover:text-[#e8412c]">${c.resolved || c.verifiedHandle ? 'Vai al canale ↗' : 'Cerca su YouTube ↗'}</a>
        </div>
      </div>
    </div>`).join('') || '<p class="text-sm text-gray-500">Nessun canale configurato.</p>';

  renderQueue();
  if (state.queue.length) selectVideo(Math.max(0, state.qIndex), false); else resetPlayerUi();
}

function resetPlayerUi() {
  $('nowTitle').textContent = 'Nessun video disponibile'; $('nowMeta').textContent = '';
  $('posterImg').removeAttribute('src'); $('queueList').innerHTML = ''; $('queueCount').textContent = '';
  $('ytPlaylistLink').classList.add('hidden');
}

function renderQueue() {
  $('queueCount').textContent = state.queue.length ? `${state.queue.length} video` : '';
  $('queueList').innerHTML = state.queue.map((v, i) => {
    const ch = state.channels.find(c => c.id === v.channelId);
    return `<button class="queue-item ${i === state.qIndex ? 'playing' : ''}" data-q="${i}">
      <img src="https://i.ytimg.com/vi/${esc(v.id)}/mqdefault.jpg" alt="" loading="lazy" referrerpolicy="no-referrer" class="w-28 aspect-video object-cover rounded-md bg-gray-200 shrink-0" onerror="this.style.visibility='hidden'">
      <span class="min-w-0"><span class="block text-[13px] font-bold leading-snug line-clamp-2">${esc(v.title)}</span><span class="block text-[11px] text-gray-500 mt-1">${esc(ch ? ch.name : '')} · ${timeAgo(v.publishedAt)}</span></span></button>`;
  }).join('');
}

function selectVideo(i, play) {
  if (!state.queue.length) return;
  i = (i + state.queue.length) % state.queue.length;
  state.qIndex = i;
  const v = state.queue[i], ch = state.channels.find(c => c.id === v.channelId);
  $('nowTitle').textContent = v.title;
  $('nowMeta').textContent = [ch && ch.name, timeAgo(v.publishedAt), fmtViews(v.views)].filter(Boolean).join(' · ');
  $('posterImg').src = `https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg`;
  $('posterImg').onerror = function () { this.onerror = null; this.src = `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`; };
  const link = $('ytPlaylistLink');
  link.href = 'https://www.youtube.com/watch_videos?video_ids=' + state.queue.slice(0, 50).map(x => x.id).join(',');
  link.classList.remove('hidden');
  renderQueue();
  if (play) playCurrent();
}

function iframePlay(v) {
  state.mode = 'iframe';
  const box = $('playerBox');
  let f = box.querySelector('iframe.fb');
  if (!f) { box.insertAdjacentHTML('beforeend', '<iframe class="fb absolute inset-0 w-full h-full" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title="Video"></iframe>'); f = box.querySelector('iframe.fb'); }
  f.src = `https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0`;
}

function playCurrent() {
  const v = state.queue[state.qIndex]; if (!v) return;
  $('posterBtn').classList.add('hidden');
  if (state.mode === 'iframe') return iframePlay(v);
  if (state.player) { if (state.playerReady) state.player.loadVideoById(v.id); else state.pendingId = v.id; return; }
  if (window.YT && YT.Player) return createPlayer(v.id);
  const timer = setTimeout(() => iframePlay(state.queue[state.qIndex]), 4000); // API bloccata (ad-blocker, rete): player semplice
  window.onYouTubeIframeAPIReady = () => { clearTimeout(timer); if (state.mode !== 'iframe') createPlayer(state.queue[state.qIndex].id); };
  if (!document.getElementById('yt-api')) {
    const s = document.createElement('script'); s.id = 'yt-api'; s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { clearTimeout(timer); iframePlay(state.queue[state.qIndex]); };
    document.head.appendChild(s);
  }
}
function createPlayer(id) {
  try {
    state.player = new YT.Player('ytPlayer', {
      host: 'https://www.youtube-nocookie.com', width: '100%', height: '100%', videoId: id,
      playerVars: { autoplay: 1, rel: 0, playsinline: 1 },
      events: {
        onReady: () => { state.playerReady = true; if (state.pendingId) { state.player.loadVideoById(state.pendingId); state.pendingId = null; } },
        onStateChange: e => { if (e.data === YT.PlayerState.ENDED) selectVideo(state.qIndex + 1, true); },
        onError: () => selectVideo(state.qIndex + 1, true) // video non incorporabile: passa al successivo
      }
    });
  } catch (e) { iframePlay(state.queue[state.qIndex]); }
}

function playById(id) {
  state.channelFilter = 'ALL'; buildQueue();
  const i = state.queue.findIndex(v => v.id === id);
  location.hash = '#video';
  renderVideoPage();
  selectVideo(i < 0 ? 0 : i, true);
}

// ------------------------------------------------------------------ navigazione ed eventi
function showView(name, restoreY) {
  state.view = name;
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  $('view-' + name).classList.remove('hidden');
  const navKey = name === 'articolo' ? 'articoli' : name;
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === navKey));
  window.scrollTo(restoreY != null ? { top: restoreY, behavior: 'instant' } : { top: 0 });
  setPageMeta(name);
  if (name === 'guide') setTimeout(updateCalculator, 60);
}
const PAGE_META = {
  mercati: ['Mercati: Trend Radar, cambi BCE e Termometro | TrendScan', 'Il Trend Radar (interesse, notizie e prezzi, tre misure separate), i tassi di cambio di riferimento della BCE e il Termometro TrendScan sul tono delle notizie di finanza.'],
  home: ['TrendScan – Hub di Finanza Personale: articoli, video e guide', 'Gli articoli di finanza personale più utili dai principali giornali italiani, video educativi e guide pratiche su risparmio, ETF e PAC.'],
  articoli: ['Articoli di finanza personale: risparmio, ETF, pensione, mutui | TrendScan', 'Le notizie di finanza personale dai principali giornali italiani, divise per argomento: risparmio, ETF, pensione, casa, tasse e conti.'],
  video: ['Video educativi di finanza personale e investimenti | TrendScan', 'La playlist dei migliori canali YouTube italiani di finanza: risparmio, ETF, PAC e gestione del denaro, da guardare uno dopo l\'altro.'],
  guide: ['Guide: cos\'è un ETF, PAC e PIC, interesse composto, broker | TrendScan', 'Guide semplici per principianti: cos\'è un ETF, differenza tra PAC e PIC, interesse composto, broker con PAC a costi bassi e foglio Excel gratuito per il bilancio familiare.']
};
function setPageMeta(name) {
  const m = PAGE_META[name] || PAGE_META.home;
  document.title = m[0];
  const d = document.querySelector('meta[name="description"]'); if (d) d.setAttribute('content', m[1]);
}
function route() {
  // ricorda dove era l'utente in home/articoli: tornando dalla lettura riparte dallo stesso punto
  if (state.view === 'home' || state.view === 'articoli') state.scroll[state.view] = window.scrollY;
  const h = (location.hash || '#home').slice(1);
  const m = h.match(/^a\/([\w-]+)$/);
  if (m) { showArticle(decodeURIComponent(m[1])); return; }
  const name = ['home', 'articoli', 'mercati', 'video', 'guide'].includes(h) ? h : 'home';
  const back = state.view === 'articolo' ? state.scroll[name] : undefined;
  showView(name, back);
}
function goArticles(cat) {
  state.filter.cat = cat; state.shown = 12;
  renderCategoryBar(); renderArticles();
  if (location.hash !== '#articoli') location.hash = '#articoli'; else showView('articoli');
}

function setupEvents() {
  window.addEventListener('hashchange', route);
  document.body.addEventListener('click', e => {
    const rs = e.target.closest('[data-rd-sort]'); if (rs) { state.radarSort = rs.dataset.rdSort; renderMarketsView(); return; }
    const rg = e.target.closest('[data-goto-radar]');
    if (rg) { e.preventDefault(); location.hash = '#mercati'; setTimeout(() => { const t = $('trendRadar'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 150); return; }
    const cat = e.target.closest('[data-cat]'); if (cat) { goArticles(cat.dataset.cat); return; }
    const vid = e.target.closest('[data-video]'); if (vid) { playById(vid.dataset.video); return; }
    const q = e.target.closest('[data-q]'); if (q) { selectVideo(+q.dataset.q, true); return; }
    const sc = e.target.closest('[data-scroll]');
    if (sc) { location.hash = '#guide'; setTimeout(() => { const el = $(sc.dataset.scroll); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 120); return; }
    const ch = e.target.closest('[data-channel]');
    if (ch) {
      state.channelFilter = ch.dataset.channel; state.qIndex = 0; renderVideoPage();
      if (ch.dataset.playChannel) { selectVideo(0, true); $('playerBox').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }
  });
  $('posterBtn').addEventListener('click', playCurrent);
  $('prevBtn').addEventListener('click', () => selectVideo(state.qIndex - 1, true));
  $('nextBtn').addEventListener('click', () => selectVideo(state.qIndex + 1, true));
  $('sourceFilter').addEventListener('change', e => { state.filter.source = e.target.value; state.shown = 12; renderArticles(); });
  $('moreArticles').addEventListener('click', () => { state.shown += 12; renderArticles(); });
  $('clearFilters').addEventListener('click', () => { state.filter = { cat: 'ALL', source: 'ALL', q: '' }; state.shown = 12; $('searchInput').value = ''; $('sourceFilter').value = 'ALL'; renderCategoryBar(); renderArticles(); });
  $('searchInput').addEventListener('input', e => {
    state.filter.q = e.target.value; state.shown = 12; renderArticles();
    if (state.view !== 'articoli' && e.target.value.trim()) location.hash = '#articoli';
  });
}

// Compound Interest & PAC Calculator Event Listeners
function setupCalculatorListeners() {
  const calcInitial = document.getElementById("calcInitial");
  const calcMonthly = document.getElementById("calcMonthly");
  const calcYears = document.getElementById("calcYears");
  const calcReturn = document.getElementById("calcReturn");

  [calcInitial, calcMonthly, calcYears, calcReturn].forEach(input => {
    if (input) {
      input.addEventListener("input", updateCalculator);
    }
  });
}

function updateCalculator() {
  const calcInitial = document.getElementById("calcInitial");
  const calcMonthly = document.getElementById("calcMonthly");
  const calcYears = document.getElementById("calcYears");
  const calcReturn = document.getElementById("calcReturn");

  if (!calcInitial || !calcMonthly || !calcYears || !calcReturn) return;

  const P = parseFloat(calcInitial.value);
  const PMT = parseFloat(calcMonthly.value);
  const years = parseInt(calcYears.value);
  const annualRate = parseFloat(calcReturn.value) / 100;

  document.getElementById("calcInitialVal").textContent = P.toLocaleString('it-IT') + " €";
  document.getElementById("calcMonthlyVal").textContent = PMT.toLocaleString('it-IT') + " € / mese";
  document.getElementById("calcYearsVal").textContent = years + " Anni";
  document.getElementById("calcReturnVal").textContent = annualRate * 100 + " %";

  const labels = [];
  const investedData = [];
  const totalBalanceData = [];

  let currentBalance = P;
  let totalInvested = P;

  const monthlyRate = annualRate / 12;

  labels.push("Anno 0");
  investedData.push(P);
  totalBalanceData.push(P);

  for (let y = 1; y <= years; y++) {
    for (let m = 1; m <= 12; m++) {
      currentBalance = (currentBalance + PMT) * (1 + monthlyRate);
      totalInvested += PMT;
    }
    labels.push(`Anno ${y}`);
    investedData.push(Math.round(totalInvested));
    totalBalanceData.push(Math.round(currentBalance));
  }

  const finalBalance = Math.round(currentBalance);
  const finalInvested = Math.round(totalInvested);
  const finalInterest = finalBalance - finalInvested;

  document.getElementById("resTotalInvested").textContent = finalInvested.toLocaleString('it-IT') + " €";
  document.getElementById("resInterestEarned").textContent = "+" + finalInterest.toLocaleString('it-IT') + " €";
  document.getElementById("resFinalBalance").textContent = finalBalance.toLocaleString('it-IT') + " €";

  renderCompoundChart(labels, investedData, totalBalanceData);
}

function renderCompoundChart(labels, investedData, totalBalanceData) {
  const canvas = document.getElementById("compoundChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  if (state.compoundChartInstance) {
    state.compoundChartInstance.destroy();
  }

  state.compoundChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Patrimonio Totale (con Interesse Composto)",
          data: totalBalanceData,
          borderColor: "#10b981",
          backgroundColor: "rgba(16, 185, 129, 0.15)",
          fill: true,
          tension: 0.3,
          borderWidth: 3,
          pointRadius: 0,
          pointHoverRadius: 6
        },
        {
          label: "Capitale Versato (Tuo Risparmio Effettivo)",
          data: investedData,
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          fill: true,
          tension: 0.1,
          borderWidth: 2.5,
          borderDash: [5, 5],
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          labels: { color: "#9ca3af", font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: ${context.raw.toLocaleString('it-IT')} €`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: { color: "#9ca3af", maxTicksLimit: 10 }
        },
        y: {
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: {
            color: "#9ca3af",
            callback: function(value) {
              return value >= 1000 ? (value / 1000).toFixed(0) + 'k €' : value + ' €';
            }
          }
        }
      }
    }
  });
}



document.addEventListener('DOMContentLoaded', bootstrap);


// ------------------------------------------------------------------ tema chiaro/scuro
function applyTheme(t) {
  document.documentElement.classList.toggle('dark', t === 'dark');
  const b = document.getElementById('themeToggle');
  if (b) { b.textContent = t === 'dark' ? '☀️' : '🌙'; b.setAttribute('aria-pressed', String(t === 'dark')); b.setAttribute('aria-label', t === 'dark' ? 'Attiva modalità chiara' : 'Attiva modalità scura'); }
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', t === 'dark' ? '#0a0d14' : '#f4f5f7');
}
function initTheme() {
  applyTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  const b = document.getElementById('themeToggle');
  if (b) b.addEventListener('click', () => {
    const t = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
    applyTheme(t); try { localStorage.setItem('ts-theme', t); } catch (e) {}
  });
}

// ------------------------------------------------------------------ intro categoria ETF
function renderCategoryIntro() {
  const el = $('categoryIntro'); if (!el) return;
  if (state.filter.cat !== 'ETF e Investimenti') { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 text-sm leading-relaxed" style="background:rgba(99,102,241,.1);border-color:rgba(99,102,241,.35)">
    <div class="font-extrabold text-lg mb-1">📦 Cos'è un ETF?</div>
    <p>Un <b>ETF</b> (Exchange Traded Fund) è un fondo <b>quotato in borsa</b> che replica un indice: con una sola quota acquisti in un colpo molti titoli, quindi ti diversifichi con costi in genere bassi. Con un <b>PAC</b> lo compri a rate fisse (es. 200 € al mese) e con l'<b>interesse composto</b> i rendimenti reinvestiti lavorano per te nel tempo. Nessun rendimento è garantito.</p>
    <div class="mt-3 flex flex-wrap gap-2 text-xs font-bold">
      <button data-scroll="guide-etf" class="btn-ghost">Leggi la guida sugli ETF</button>
      <button data-scroll="guide-composto" class="btn-ghost">PAC e interesse composto</button>
      <button data-scroll="guide-broker" class="btn-ghost">Broker con PAC a costi bassi</button>
    </div></div>`;
}

// ------------------------------------------------------------------ tabella broker
// "aff": se imposti un link di affiliazione compare l'etichetta "Pubblicità" e rel="sponsored".
const BROKERS = [
  { name: 'Trade Republic', url: 'https://traderepublic.com/it-it', aff: '', pac: '0 € (da 1 €)', ordine: '1 € a ordine', fisco: 'Amministrato (dal 30/01/2025)', note: 'Circa 2.000+ ETF per PAC; app semplice. Catalogo ETF concentrato su alcuni emittenti.' },
  { name: 'Scalable Capital', url: 'https://it.scalable.capital', aff: '', pac: '0 € (piano FREE)', ordine: '0,99 € a ordine (FREE)', fisco: 'Amministrato su scelta (da 09/2026): verifica', note: '2.500+ ETF per PAC; nessun canone nel piano FREE; PRIME+ a pagamento.' },
  { name: 'Directa', url: 'https://www.directa.it', aff: '', pac: '0 € su ETF convenzionati (600+)', ordine: 'da circa 1,50 € (verifica tariffe)', fisco: 'Solo amministrato', note: 'Broker italiano storico; PAC solo su ETF in lista (iShares, Amundi, Xtrackers, Vanguard).' },
  { name: 'Fineco', url: 'https://www.finecobank.com', aff: '', pac: 'Gratis su selezione ETF e per under 30; altrimenti da 2,95 €/mese per ETF', ordine: 'secondo conto/tariffa', fisco: 'Amministrato o dichiarativo', note: 'Banca completa con ampia gamma di mercati; costi più alti se non rientri nelle promo.' }
];
function renderBrokers() {
  const el = $('brokerTable'); if (!el) return;
  const hasAff = BROKERS.some(b => b.aff);
  const rows = BROKERS.map(b => {
    const href = b.aff || b.url;
    const rel = b.aff ? 'sponsored noopener noreferrer' : 'noopener noreferrer';
    return `<tr class="border-b border-gray-800/60 align-top">
      <td class="px-4 py-3 font-bold text-white whitespace-nowrap">${esc(b.name)}${b.aff ? ' <span class="ml-1 px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-200 text-[9px] uppercase">Pubblicità</span>' : ''}</td>
      <td class="px-4 py-3 text-emerald-300">${esc(b.pac)}</td><td class="px-4 py-3">${esc(b.ordine)}</td><td class="px-4 py-3">${esc(b.fisco)}</td>
      <td class="px-4 py-3 text-gray-300">${esc(b.note)}</td>
      <td class="px-4 py-3"><a href="${esc(safeUrl(href))}" target="_blank" rel="${rel}" class="text-indigo-300 underline whitespace-nowrap">Sito ufficiale ↗</a></td></tr>`;
  }).join('');
  el.innerHTML = `<div class="overflow-x-auto rounded-2xl border border-gray-800"><table class="w-full text-xs text-left min-w-[820px] text-gray-200">
    <thead class="text-gray-400 uppercase text-[10px] border-b border-gray-800"><tr><th class="px-4 py-2">Broker</th><th class="px-4 py-2">Costo PAC</th><th class="px-4 py-2">Ordine manuale</th><th class="px-4 py-2">Regime fiscale</th><th class="px-4 py-2">Note</th><th class="px-4 py-2"></th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
  const n = $('affiliateNote'); if (n) n.classList.toggle('hidden', !hasAff);
}


// ------------------------------------------------------------------ download foglio Excel (bilancio familiare)
// Opzione A (consigliata): metti il file in public/downloads/bilancio-familiare.xlsx e lascia driveId vuoto.
// Opzione B: condividi il file su Google Drive ("Chiunque abbia il link") e incolla l'ID qui sotto
//            (l'ID è la parte tra /d/ e /view nel link di condivisione).
const BUDGET_SHEET = { file: 'downloads/bilancio-familiare.xlsx', driveId: '', label: 'Bilancio-familiare-TrendScan.xlsx' };
// Dimensione indicata sotto il pulsante (letta dal server se disponibile)
async function renderBudgetDownload() {
  const el = $('budgetDownload'); if (!el) return;
  const btn = 'inline-flex items-center gap-2 px-5 py-3 rounded-xl font-extrabold text-sm shadow-lg';
  if (/^[\w-]{10,}$/.test(BUDGET_SHEET.driveId || '')) {
    const id = BUDGET_SHEET.driveId;
    el.innerHTML = `<a href="https://drive.google.com/uc?export=download&id=${id}" target="_blank" rel="noopener noreferrer" class="${btn} bg-emerald-600 hover:bg-emerald-500 text-white">⬇️ Scarica il foglio Excel</a>
      <div class="mt-1.5 text-[11px] text-gray-400 text-center"><a class="underline" href="https://docs.google.com/spreadsheets/d/${id}/copy" target="_blank" rel="noopener noreferrer">oppure crea la tua copia in Google Fogli</a></div>`;
    return;
  }
  let ok = false;
  try {
    const r = await fetch(BUDGET_SHEET.file, { method: 'HEAD', cache: 'no-cache' });
    ok = r.ok && !/text\/html/i.test(r.headers.get('content-type') || '');
    const len = parseInt(r.headers.get('content-length') || '0', 10);
    const meta = $('budgetMeta');
    if (ok && meta && len > 0) meta.textContent = 'File Excel (.xlsx) · ' + Math.max(1, Math.round(len / 1024)) + ' KB';
  } catch (e) {}
  el.innerHTML = ok
    ? `<a href="${esc(BUDGET_SHEET.file)}" download="${esc(BUDGET_SHEET.label)}" class="${btn} bg-emerald-600 hover:bg-emerald-500 text-white w-full justify-center">⬇️ Scarica gratis</a>`
    : `<span class="${btn} bg-gray-300 text-gray-600 cursor-not-allowed w-full justify-center">⏳ Disponibile a breve</span>`;
}


// ------------------------------------------------------------------ dimensione del testo (Guide)
const FS_STEPS = [85, 100, 115, 130, 150];
let fsIndex = 1;
function applyFontSize() {
  const pct = FS_STEPS[fsIndex];
  const root = document.getElementById('academyRoot');
  const zoomOk = window.CSS && CSS.supports && CSS.supports('zoom', '1.2');
  if (zoomOk) { if (root) root.style.setProperty('--guide-zoom', String(pct / 100)); document.documentElement.style.fontSize = ''; }
  else document.documentElement.style.fontSize = pct + '%';   // browser molto vecchi: ingrandisce tutto il sito
  document.querySelectorAll('.fs-label').forEach(el => { el.textContent = pct + '%'; });
  document.querySelectorAll('[data-fs="-1"]').forEach(b => { b.disabled = fsIndex === 0; });
  document.querySelectorAll('[data-fs="1"]').forEach(b => { b.disabled = fsIndex === FS_STEPS.length - 1; });
}
function initFontSize() {
  try { const v = parseInt(localStorage.getItem('ts-guide-fs'), 10); if (v >= 0 && v < FS_STEPS.length) fsIndex = v; } catch (e) {}
  applyFontSize();
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-fs]'); if (!b || b.disabled) return;
    const d = parseInt(b.dataset.fs, 10);
    fsIndex = d === 0 ? 1 : Math.min(FS_STEPS.length - 1, Math.max(0, fsIndex + d));
    try { localStorage.setItem('ts-guide-fs', String(fsIndex)); } catch (err) {}
    applyFontSize();
  });
}
