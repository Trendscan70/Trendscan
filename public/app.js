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
  compoundChartInstance: null
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

// ------------------------------------------------------------------ caricamento dati
async function loadJson(url) {
  try { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  catch (e) { return null; }
}
// I dati aggiornati ogni ora stanno nel ramo "data" di GitHub (DATA_BASE), cosi' non fanno ripubblicare il sito.
// Se non raggiungibili si usano i file inclusi nel sito (public/data).
const DATA_BASE = (window.TRENDSCAN_CONFIG && window.TRENDSCAN_CONFIG.DATA_BASE) || '';
async function loadData(name) {
  if (DATA_BASE) {
    const remote = await loadJson(DATA_BASE + name);
    if (remote && remote.meta && remote.meta.generatedAt) return remote;
  }
  return loadJson('data/' + name);
}

async function bootstrap() {
  $('todayLabel').textContent = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const [a, v] = await Promise.all([loadData('articles.json'), loadData('videos.json')]);
  if (a && Array.isArray(a.articles)) { state.articles = a.articles.filter(x => x && x.title && /^https?:\/\//i.test(x.url)); state.articleMeta = a.meta || null; }
  state.articlesLoaded = !!a;
  if (v) { state.channels = v.channels || []; state.videos = (v.videos || []).filter(x => validVid(x.id)); state.videoMeta = v.meta || null; }
  state.videosLoaded = !!v;

  renderCategoryBar();
  renderSourceFilter();
  renderAll();
  setupEvents();
  setupCalculatorListeners();
  route();
}

function renderAll() {
  renderHero(); renderTopicTiles(); renderHomeLatest(); renderHomeVideos(); renderGuideTeasers();
  renderArticles(); renderVideoPage();
}

// ------------------------------------------------------------------ componenti
function articleCard(a) {
  const c = catOf(a.category);
  return `
    <a href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener noreferrer" class="card group">
      <div class="thumb aspect-[16/10] ${c.cls}">
        <span class="cat-badge">${esc(c.name)}</span>
        <span class="thumb-emoji">${c.icon}</span>
        ${imgTag(a.image, a.title)}
      </div>
      <div class="p-4 flex-1 flex flex-col">
        <h3 class="card-title font-extrabold leading-snug text-[17px] line-clamp-3 transition-colors">${esc(a.title)}</h3>
        ${a.summary ? `<p class="text-sm text-gray-600 mt-2 line-clamp-3 leading-relaxed">${esc(a.summary)}</p>` : ''}
        <div class="mt-auto pt-3 flex items-center justify-between text-[11px] text-gray-500">
          <span class="font-bold text-gray-700 truncate pr-2">${esc(a.source)}</span><span class="whitespace-nowrap">${timeAgo(a.publishedAt)}</span>
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
  if (!meta || !meta.error) return '';
  const rows = (meta.report || []).map(r => `<li>${esc(r.name)}: ${esc(r.status === 'ok' ? 'ok' : (r.detail || r.status))}</li>`).join('');
  return `<div class="mt-3 text-left max-w-xl mx-auto"><div class="font-bold text-red-700">Ultimo tentativo di raccolta (${new Date(meta.generatedAt).toLocaleString('it-IT')}): ${esc(meta.error)}.</div>
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
    <a href="${esc(safeUrl(main.url))}" target="_blank" rel="noopener noreferrer" class="hero-main lg:col-span-2 ${c.cls}">
      <span class="thumb-emoji" style="font-size:6rem">${c.icon}</span>
      ${imgTag(main.image, main.title)}<div class="shade"></div>
      <div class="relative z-10 h-full min-h-[380px] flex flex-col justify-end p-6 sm:p-8">
        <span class="self-start px-3 py-1 rounded-md brand-bg text-[11px] font-extrabold uppercase tracking-widest">${esc(c.name)}</span>
        <h1 class="text-2xl sm:text-4xl font-black leading-tight mt-3 max-w-3xl">${esc(main.title)}</h1>
        ${main.summary ? `<p class="mt-2 text-gray-200 max-w-2xl text-sm line-clamp-2">${esc(main.summary)}</p>` : ''}
        <div class="mt-3 text-xs text-gray-300 font-semibold">${esc(main.source)} · ${timeAgo(main.publishedAt)}</div>
      </div>
    </a>
    <div class="flex flex-col gap-4">
      ${side.map(a => { const k = catOf(a.category); return `
        <a href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener noreferrer" class="hero-side">
          <div class="thumb w-28 h-24 rounded-lg shrink-0 ${k.cls}"><span class="thumb-emoji" style="font-size:2rem">${k.icon}</span>${imgTag(a.image, a.title)}</div>
          <div class="min-w-0 flex flex-col"><div class="text-[10px] font-extrabold uppercase brand-text">${esc(k.name)}</div>
            <div class="side-title font-extrabold leading-snug line-clamp-3 text-[15px] transition-colors">${esc(a.title)}</div>
            <div class="mt-auto text-[11px] text-gray-500">${esc(a.source)} · ${timeAgo(a.publishedAt)}</div></div>
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
  el.innerHTML = state.articles.filter(a => !skip.has(a.id)).slice(0, 9).map(articleCard).join('');
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
    { id: 'guide-1', t: 'Cosa sono le azioni', d: 'Quote di un\'azienda, dividendi e orizzonte di lungo periodo.', cls: 'g-investimenti', icon: '🏢', img: CATEGORIES[1].img },
    { id: 'guide-2', t: 'Regola 50/30/20 e fondo di emergenza', d: 'Come dividere lo stipendio prima di investire.', cls: 'g-risparmio', icon: '🛡️', img: CATEGORIES[0].img },
    { id: 'guide-4', t: 'Simulatore PAC e interesse composto', d: 'Prova quanto può crescere un risparmio mensile nel tempo.', cls: 'g-casa', icon: '🧮', img: CATEGORIES[4].img }
  ];
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
function showView(name) {
  state.view = name;
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  $('view-' + name).classList.remove('hidden');
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === name));
  window.scrollTo({ top: 0 });
  if (name === 'guide') setTimeout(updateCalculator, 60);
}
function route() {
  const h = (location.hash || '#home').slice(1);
  showView(['home', 'articoli', 'video', 'guide'].includes(h) ? h : 'home');
}
function goArticles(cat) {
  state.filter.cat = cat; state.shown = 12;
  renderCategoryBar(); renderArticles();
  if (location.hash !== '#articoli') location.hash = '#articoli'; else showView('articoli');
}

function setupEvents() {
  window.addEventListener('hashchange', route);
  document.body.addEventListener('click', e => {
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
