// TrendScan Hub – articoli di finanza personale, playlist di video educativi, guide e calcolatore PAC.
// I dati arrivano da data/articles.json e data/videos.json (generati da scripts/build-feeds.mjs).
// Nessun contenuto e' scritto a mano: senza i file il sito mostra uno stato vuoto, mai articoli inventati.

const CATEGORIES = [
  { name: 'Risparmio e Budget', icon: '💶', cls: 'g-risparmio' },
  { name: 'ETF e Investimenti', icon: '📈', cls: 'g-investimenti' },
  { name: 'Pensione e TFR', icon: '👴', cls: 'g-pensione' },
  { name: 'Casa e Mutui', icon: '🏠', cls: 'g-casa' },
  { name: 'Tasse e Fisco', icon: '🧾', cls: 'g-tasse' },
  { name: 'Banche e Conti', icon: '🏦', cls: 'g-banche' }
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
  scroll: {},
  markets: null,
  radar: null, radarSort: 'interest', radarSectorDays: 7
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
  if (v) {
    // I dati remoti possono essere più vecchi della configurazione: ammetti solo il canale ufficiale.
    state.channels = (v.channels || []).filter(c => c.id === 'trendscan-ufficiale');
    state.videos = (v.videos || []).filter(x => validVid(x.id) && x.channelId === 'trendscan-ufficiale');
    state.videoMeta = v.meta || null;
  }
  state.videosLoaded = !!v;

  initTheme();
  renderCategoryBar();
  renderSourceFilter();
  renderAll();
  setupEvents();
  setupGlossaryTip();
  route();
}

function renderAll() {
  renderHero(); renderMarketStrip(); renderHomeLatest(); renderHomeVideos(); renderGlossary(); applyGlossary();
  renderArticles(); renderMarketsView(); renderVideoPage();
  setupSectionReveal();
}

let sectionRevealObserver;
function setupSectionReveal() {
  const blocks = document.querySelectorAll('#view-home .welcome, #view-home .guide-showcase, #view-home #strumenti, #view-home #heroGrid, #view-home #homeLatest, #view-home .home-video-panel, #view-articoli .section-title, #view-articoli [aria-labelledby], #view-articoli #categoryIntro, #view-articoli #articleGrid, #view-mercati .mk-head, #view-mercati .mk-card, #view-mercati .rd-section, #view-articolo .reader, #view-video > *, #academyRoot .academy-banner, #academyRoot section');
  if (!('IntersectionObserver' in window)) { blocks.forEach(el => el.classList.add('section-reveal', 'is-visible')); return; }
  if (!sectionRevealObserver) sectionRevealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      sectionRevealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -36px 0px' });
  blocks.forEach(el => {
    if (el.classList.contains('section-reveal') && el.classList.contains('is-visible')) return;
    el.classList.add('section-reveal');
    sectionRevealObserver.observe(el);
  });
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
      <a href="/guide/" class="hero-main lg:col-span-2 g-risparmio">
        ${imgTag(HERO_IMG, '')}<div class="shade"></div>
        <div class="relative z-10 h-full min-h-[380px] flex flex-col justify-end p-6 sm:p-9">
          <span class="self-start px-3 py-1 rounded-md brand-bg text-[11px] font-extrabold uppercase tracking-widest">Hub di finanza personale</span>
          <h2 class="text-3xl sm:text-5xl font-black leading-tight mt-3 max-w-2xl">Metti in ordine i tuoi soldi, una guida alla volta.</h2>
          <p class="mt-3 text-gray-200 max-w-xl text-sm sm:text-base">Articoli, video del canale ufficiale TrendScan e strumenti pratici per capire quanto può crescere il tuo risparmio.</p>
        </div>
      </a>
      <div class="flex flex-col gap-4">
        <a href="#video" class="hero-side"><div class="w-24 h-20 rounded-lg g-casa flex items-center justify-center text-3xl shrink-0">▶️</div><div><div class="text-[10px] font-extrabold uppercase brand-text">Video TrendScan</div><div class="side-title font-extrabold leading-snug">Gli approfondimenti del canale ufficiale</div></div></a>
        <a href="/guide/" class="hero-side"><div class="w-24 h-20 rounded-lg g-investimenti flex items-center justify-center text-3xl shrink-0">🧮</div><div><div class="text-[10px] font-extrabold uppercase brand-text">Strumenti</div><div class="side-title font-extrabold leading-snug">Simulatore PAC e interesse composto</div></div></a>
        <a href="#articoli" class="hero-side"><div class="w-24 h-20 rounded-lg g-pensione flex items-center justify-center text-3xl shrink-0">📰</div><div><div class="text-[10px] font-extrabold uppercase brand-text">Articoli</div><div class="side-title font-extrabold leading-snug">I consigli di finanza personale dei giornali</div></div></a>
      </div>`;
    return;
  }
  const withImg = arts.find(a => a.image) || arts[0];
  const main = withImg;
  const side = arts.filter(a => a !== main).slice(0, 2);
  const c = catOf(main.category);
  g.innerHTML = `
    <a href="${articleHref(main)}" class="hero-main lg:col-span-2 ${c.cls}">
      <span class="thumb-emoji" style="font-size:6rem">${c.icon}</span>
      ${imgTag(main.image, main.title)}<div class="shade"></div>
      <div class="relative z-10 h-full min-h-[380px] flex flex-col justify-end p-6 sm:p-8">
        <span class="self-start px-3 py-1 rounded-md brand-bg text-[11px] font-extrabold uppercase tracking-widest">${esc(c.name)}</span>
        <h2 class="text-2xl sm:text-4xl font-black leading-tight mt-3 max-w-3xl">${esc(main.title)}</h2>
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

function renderHomeLatest() {
  const el = $('homeLatest');
  if (!state.articles.length) { el.innerHTML = emptyBox('Gli articoli arrivano dai feed dei giornali', SETUP_HINT + failureHint(state.articleMeta)); return; }
  const skip = state.heroIds || new Set();
  const latest = state.articles.filter(a => !skip.has(a.id)).slice(0, 3);
  state.latestIds = new Set(latest.map(a => a.id));
  el.innerHTML = latest.map(articleCard).join('');
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
  const official = state.videos.filter(v => v.channelId === 'trendscan-ufficiale');
  if (official.length) {
    el.innerHTML = official.slice(0, 4).map(videoCardDark).join('');
    return;
  }
  el.innerHTML = `<a href="https://www.youtube.com/@Trendscan26" target="_blank" rel="noopener noreferrer" class="col-span-full rounded-xl bg-white/5 border border-white/10 p-5 hover:bg-white/10 transition">
    <div class="font-extrabold">Guarda i video sul canale ufficiale TrendScan</div><div class="text-sm text-gray-400 mt-1">Le nuove miniature appariranno qui appena il feed sarà aggiornato.</div></a>`;
}

// ------------------------------------------------------------------ glossario e tooltip
const GLOSSARY = [
  { k: 'ETF', t: 'ETF', d: 'Un fondo che si compra in Borsa e contiene tanti titoli (azioni, obbligazioni) in un solo prodotto. Di solito segue un indice.' },
  { k: 'PAC', t: 'PAC', d: 'Piano di accumulo del capitale: investi la stessa cifra ogni mese, in automatico, invece di una somma sola.' },
  { k: 'PIC', t: 'PIC', d: 'Piano di investimento del capitale: investi tutta la somma in una volta sola.' },
  { k: 'TER', t: 'TER', d: 'Il costo annuo di un fondo o ETF, in percentuale sul capitale investito. Più è basso, meno paghi.' },
  { k: 'Bollo', t: 'Bollo', d: 'Un’imposta su alcuni prodotti finanziari o conti. Quanto e come si paga dipende dal prodotto.' },
  { k: 'KID', t: 'KID', d: 'Documento breve e standard che ogni prodotto finanziario deve avere: riassume costi, rischi e scenari possibili.' },
  { k: 'BTP', t: 'BTP', d: 'Titolo di Stato italiano: presti soldi allo Stato, che ti paga interessi (le cedole) e a scadenza ti restituisce il capitale.' },
  { k: 'spread', t: 'Spread BTP-Bund', d: 'La differenza di rendimento tra i titoli di Stato italiani e quelli tedeschi a 10 anni. Più è alta, più il mercato considera rischioso prestare soldi all\'Italia.' },
  { k: null, t: 'Diversificazione', d: 'Non mettere tutte le uova nello stesso paniere: distribuire i soldi su tanti titoli per ridurre il rischio.' },
  { k: null, t: 'Interesse composto', d: 'Gli interessi che guadagni producono a loro volta altri interessi: per questo il tempo conta così tanto.' },
  { k: null, t: 'Volatilità', d: 'Quanto il prezzo di un investimento sale e scende nel breve periodo.' },
  { k: null, t: 'Fondo di emergenza', d: 'Una riserva di liquidità, di solito pari a qualche mese di spese, per gli imprevisti.' }
];
function renderGlossary() {
  const el = $('glList'); if (!el) return;
  el.innerHTML = GLOSSARY.map(g => `<div><dt>${esc(g.t)}</dt><dd>${esc(g.d)}</dd></div>`).join('');
}
// Sottolinea (una volta per blocco) le sigle nei testi scritti da noi, marcati con data-gl. Su tocco/tastiera il tooltip si apre col focus.
function applyGlossary(root = document) {
  const terms = GLOSSARY.filter(g => g.k);
  const re = new RegExp('\\b(' + terms.map(g => g.k).join('|') + ')\\b', 'gi');
  root.querySelectorAll('[data-gl]').forEach(el => {
    if (el.dataset.glDone) return; el.dataset.glDone = '1';
    const used = new Set();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const txt = node.nodeValue; if (!re.test(txt)) { re.lastIndex = 0; return; } re.lastIndex = 0;
      const frag = document.createDocumentFragment(); let last = 0, m;
      while ((m = re.exec(txt))) {
        const g = terms.find(x => x.k.toLowerCase() === m[1].toLowerCase());
        frag.append(txt.slice(last, m.index));
        if (used.has(g.k)) frag.append(m[1]);
        else { used.add(g.k); const a = document.createElement('abbr'); a.className = 'gl'; a.tabIndex = 0; a.dataset.def = g.d; a.textContent = m[1]; frag.append(a); }
        last = m.index + m[1].length;
      }
      frag.append(txt.slice(last)); node.replaceWith(frag);
    });
  });
}

// Tooltip unico, posizionato in JS e tenuto dentro lo schermo (hover, focus da tastiera, tocco)
function setupGlossaryTip() {
  let tip = null;
  const hide = () => { if (tip) tip.style.display = 'none'; };
  const show = el => {
    if (!tip) { tip = document.createElement('div'); tip.id = 'glTip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
    tip.textContent = el.dataset.def; tip.style.display = 'block';
    const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    const top = r.top - h - 8 >= 8 ? r.top - h - 8 : r.bottom + 8;
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
  };
  document.addEventListener('mouseover', e => { const a = e.target.closest && e.target.closest('abbr.gl'); if (a) show(a); });
  document.addEventListener('mouseout', e => { if (e.target.closest && e.target.closest('abbr.gl')) hide(); });
  document.addEventListener('focusin', e => { const a = e.target.closest && e.target.closest('abbr.gl'); if (a) show(a); });
  document.addEventListener('focusout', hide);
  document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('abbr.gl'); if (a) { a.focus(); show(a); e.stopPropagation(); } else hide(); }, true);
  window.addEventListener('scroll', hide, { passive: true });
  window.addEventListener('hashchange', hide);
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

// ------------------------------------------------------------------ mercati: cambi BCE e Termometro TrendScan
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

function gauge(sentiment) {
  const zones = sentiment.labels && sentiment.labels.length ? sentiment.labels : DEFAULT_ZONES;
  const colors = ['#ef4444', '#f59e0b', '#10b981'];
  const point = value => {
    const angle = Math.PI - Math.PI * Math.min(100, Math.max(0, value)) / 100;
    return { x: 100 + 80 * Math.cos(angle), y: 100 - 80 * Math.sin(angle) };
  };
  let previousMax = 0;
  const arcs = zones.map((zone, index) => {
    const start = point(previousMax), end = point(zone.max);
    previousMax = zone.max;
    return `<path d="M${start.x.toFixed(1)} ${start.y.toFixed(1)} A80 80 0 0 0 ${end.x.toFixed(1)} ${end.y.toFixed(1)}" fill="none" stroke="${colors[index] || '#64748b'}" stroke-width="14" stroke-linecap="round"/>`;
  }).join('');
  const needle = point(sentiment.score);
  return `<div class="mk-gauge" role="img" aria-label="Termometro TrendScan: ${sentiment.score} su 100, ${esc(sentiment.label)}">
    <svg class="mk-gauge-dial" viewBox="0 0 200 116" aria-hidden="true">
      ${arcs}
      <line x1="100" y1="100" x2="${needle.x.toFixed(1)}" y2="${needle.y.toFixed(1)}" class="mk-gauge-needle"/>
      <circle cx="100" cy="100" r="6" class="mk-gauge-pivot"/>
    </svg>
    <div class="mk-gauge-scale"><span>0 · negativo</span><span>50 · neutro</span><span>100 · positivo</span></div></div>`;
}
const toneCls = sentiment => {
  const zones = sentiment.labels && sentiment.labels.length ? sentiment.labels : DEFAULT_ZONES;
  const index = zones.findIndex(zone => sentiment.score <= zone.max);
  return 'mk-t' + (index < 0 ? zones.length : index + 1);
};

function fxCredit(fx) {
  const src = fx.source || {};
  const link = src.url ? `<a href="${esc(safeUrl(src.url))}" target="_blank" rel="noopener noreferrer" class="underline">${esc(src.attribution || 'Source: ECB statistics.')}</a>` : esc(src.attribution || 'Source: ECB statistics.');
  return `Cambi: ${link} Tassi di riferimento del ${esc(dateIt(fx.asOf))}, solo a scopo informativo.${fx.stale ? ' <b>Dati non aggiornati: la BCE non risponde al momento.</b>' : ''}`;
}

function renderMarketStrip() {
  const el = $('marketStrip'); if (!el) return;
  const m = state.markets, fx = m && m.fx, s = m && m.sentiment;
  const hasFx = !!(fx && fx.pairs && fx.pairs.length);
  const hasS = !!(s && s.ready);
  const hasRadar = rdReady();
  el.classList.toggle('hidden', !(hasFx || hasS || hasRadar));
  if (!(hasFx || hasS || hasRadar)) { el.innerHTML = ''; return; }
  const thermo = hasS ? `
    <a href="#mercati" class="mk-tile mk-thermo">
      <div class="mk-label">Termometro TrendScan</div>
      <div class="mk-thermo-row"><span class="mk-score ${toneCls(s)}">${s.score}</span><span class="mk-of">/100</span><span class="mk-tone ${toneCls(s)}">${esc(s.label)}</span></div>
      ${gauge(s)}
      <div class="mk-sub">Tono di ${s.n} notizie nelle ultime ${s.windowHours} ore · non misura i mercati</div>
    </a>` : '';
  const tiles = hasFx ? fx.pairs.map(p => `
    <a href="#mercati" class="mk-tile" title="1 euro = ${esc(fmtRate(p.rate))} ${esc(p.currency)}">
      <div class="mk-label">${esc(p.label)}</div>
      <div class="mk-rate">${esc(fmtRate(p.rate))}</div>
      <div class="mk-chg ${pctCls(p.changePct)}">${pctArrow(p.changePct)}${fmtPct(p.changePct)}</div>
      <div class="mk-sparkwrap ${pctCls(p.changePct)}">${spark((p.series || []).slice(-30).map(x => x.r))}</div>
    </a>`).join('') : '';
  el.innerHTML = `
    <div class="section-title"><h2>Per approfondire: i mercati</h2><span class="section-bar"></span>
      <a href="#mercati" class="text-sm font-bold brand-text whitespace-nowrap">Tutti i dati →</a></div>
    <p class="text-xs text-gray-500 -mt-2 mb-4 max-w-3xl">Consulta il tono delle notizie, i tassi di riferimento della BCE e i settori economici più citati. Se sei all'inizio, parti dal percorso qui sopra.</p>
    ${hasFx || hasS ? `<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">${thermo}${tiles}</div>
    <p class="mk-credit">${hasFx ? fxCredit(fx) + ' Variazioni e grafici: elaborazione TrendScan.' : ''}${hasS ? ' Il Termometro è un’analisi automatica del tono degli articoli, non un indice di mercato.' : ''}</p>` : ''}
    ${hasRadar ? radarStripHtml() : ''}`;
}

function renderMarketsView() {
  const el = $('marketsView'); if (!el) return;
  const m = state.markets, fx = m && m.fx, s = m && m.sentiment;
  const hasFx = !!(fx && fx.pairs && fx.pairs.length);
  const upd = m && m.meta && m.meta.generatedAt ? new Date(m.meta.generatedAt).toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' }) : '';
  const bar = readerBar(false);
  if (!hasFx && !s && !rdReady()) {
    el.innerHTML = bar + emptyBox('Dati di mercato non ancora disponibili', 'Si aggiornano automaticamente ogni ora: riprova tra poco. <a href="#home" class="brand-text font-bold underline">Torna alla home di TrendScan</a>.');
    return;
  }
  const thermometer = s && s.ready ? `
    <div class="mk-big">
      <div class="mk-thermo-row"><span class="mk-score mk-score-xl ${toneCls(s)}">${s.score}</span><span class="mk-of">/100</span><span class="mk-tone ${toneCls(s)}">${esc(s.label)}</span></div>
      ${gauge(s)}
      ${thermometerAdvice(s)}
      <ul class="mk-facts">
        <li>Notizie analizzate (ultime ${s.windowHours} ore): <b>${s.n}</b> — <span class="mk-up">${s.counts.pos} positive</span> · ${s.counts.neutral} neutre · <span class="mk-down">${s.counts.neg} negative</span></li>
        ${s.change == null ? '' : `<li>Variazione rispetto all’ultima rilevazione giornaliera: <b class="${pctCls(s.change)}">${s.change > 0 ? '+' : ''}${s.change} punti</b></li>`}
        ${s.avg7 == null ? '' : `<li>Media delle ultime rilevazioni: <b>${s.avg7}/100</b></li>`}
      </ul>
      ${s.history.length >= 2 ? `<div class="mk-histwrap"><div class="mk-label">Storico del Termometro</div>${spark(s.history.map(item => item.s), 300, 60, 'mk-hist')}<div class="mk-sub">${s.history.length} giorni</div></div>` : `<p class="mk-sub mt-2">Lo storico si costruisce giorno dopo giorno.</p>`}
    </div>` : `<p class="mk-note">Dati insufficienti: ${s && Number.isFinite(s.n) ? s.n : 0} notizie nelle ultime ${s && s.windowHours || 48} ore; per calcolare il punteggio ne servono almeno 15. Si aggiorna ogni ora.</p>`;
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
    <header class="mk-head"><div><h1>Mercati</h1><p>Il Trend Radar, il Termometro TrendScan e i cambi di riferimento della BCE. Dati a scopo informativo${upd ? `, aggiornati il ${esc(upd)}` : ''}.</p></div>
      <svg class="section-art market-art" viewBox="0 0 180 110" fill="none" aria-hidden="true"><rect x="15" y="12" width="150" height="86" rx="18" fill="#fff" stroke="#e5e7eb" stroke-width="2"/><path d="M34 78H145M34 58H145M34 38H145" stroke="#e5e7eb" stroke-dasharray="3 6"/><rect class="market-bar bar-a" x="44" y="60" width="16" height="22" rx="4" fill="#fdba74"/><rect class="market-bar bar-b" x="72" y="48" width="16" height="34" rx="4" fill="#fb8b72"/><rect class="market-bar bar-c" x="100" y="39" width="16" height="43" rx="4" fill="#f87171"/><path class="market-line" d="M37 66L68 54L91 59L119 34L145 39" stroke="#c23422" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle class="market-point" cx="145" cy="39" r="6" fill="#c23422" stroke="#fff" stroke-width="3"/></svg>
    </header>

    ${marketsSnapshotHtml()}
    ${trendOfDayHtml()}
    ${rdReady() ? radarSectionHtml() : ''}

    <section class="mk-card" aria-labelledby="mkThermoTitle">
      <h2 id="mkThermoTitle" class="mk-h2">Termometro TrendScan <span class="mk-badge">tono delle notizie</span></h2>
      <p class="mk-lead">Riassume il tono delle notizie di finanza raccolte nelle ultime 48 ore. <b>Non misura l’andamento dei mercati</b> e non è un’indicazione operativa.</p>
      ${shareRowHtml('termometro', 'termometro.png', 'trendscan-termometro.png', 'Termometro TrendScan', 'Il tono delle notizie di finanza, da 0 a 100.')}
      ${thermometer}
      <p class="mk-note">Come si calcola: parole chiave positive e negative in titoli e anteprime, titolo con peso doppio e dimezzamento del peso ogni 24 ore. Punteggio 0 = tono negativo, 50 = neutro, 100 = positivo. Servono almeno 15 articoli; <a href="/metodo/#termometro" class="underline font-bold brand-text">leggi il metodo e i limiti</a>.</p>
    </section>

    ${hasFx ? `
    <section class="mk-card" aria-labelledby="mkFxTitle">
      <h2 id="mkFxTitle" class="mk-h2">Cambi dell’euro <span class="mk-badge">dati BCE</span></h2>
      <p class="mk-lead">Quanto vale 1 euro in altre valute, secondo i tassi di riferimento della Banca centrale europea.</p>
      <div class="mk-tablewrap"><table class="mk-table">
        <thead><tr><th scope="col">Coppia</th><th scope="col" class="mk-num">Tasso BCE</th><th scope="col" class="mk-num" title="Variazione rispetto al giorno precedente">Var. 1g*</th><th scope="col" class="mk-num" title="Variazione rispetto a circa 30 giorni prima">Var. 30g*</th><th scope="col">Andamento*</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      ${fxUseCasesHtml(fx)}
      <p class="mk-note"><b>${fxCredit(fx)}</b> I tassi sono riportati come pubblicati dalla BCE (solo il separatore decimale è adattato all’italiano). Sono pubblicati intorno alle 16:00 CET nei giorni di apertura TARGET: nei weekend e nei festivi restano quelli dell’ultimo giorno disponibile. Non sono adatti a operazioni di cambio.<br>* Elaborazione TrendScan sui tassi BCE.</p>
    </section>` : ''}

    <p class="mk-disclaimer"><a href="/criptovalute/" class="underline font-bold brand-text">Nuovo a criptovalute? Leggi la guida per principianti →</a><br>Non farti distrarre dalle notizie quotidiane: il Radar aiuta a capire il contesto, ma una strategia di risparmio, budget e PAC dovrebbe restare noiosa e costante. Contenuti informativi, non consulenza finanziaria né raccomandazione di investimento. Altri mercati (indici, titoli di Stato, materie prime) saranno aggiunti quando avremo verificato le condizioni d’uso delle relative fonti.</p>
    <div class="reader-bottom"><a href="#home" class="reader-back reader-back-home">← Torna alla home di TrendScan</a></div>`;
}

// ------------------------------------------------------------------ Trend Radar (dentro Mercati)
// I settori sono classificati dalle notizie delle testate seguite; la copertura
// editoriale non misura né anticipa i prezzi di mercato.
const RD = {
  interest: { icon: '🔎', name: 'Interesse', cls: 'rd-m-interest' },
  news: { icon: '📰', name: 'Notizie', cls: 'rd-m-news' }
};
const mBadge = k => `<span class="rd-badge ${RD[k].cls}">${RD[k].icon} ${RD[k].name}</span>`;
const fmtInt = n => Number(n).toLocaleString('it-IT');
const fmtPct0 = n => n == null ? '–' : (n > 0 ? '+' : n < 0 ? '−' : '') + (Math.abs(n) >= 999 ? '999+' : Math.round(Math.abs(n))) + '%';
const rdReady = () => !!(state.radar && state.radar.meta && state.radar.meta.generatedAt && (Array.isArray(state.radar.sectors) || state.radar.topics && state.radar.topics.length));
const rdNewsOk = () => !!(state.radar && state.radar.news && state.radar.news.ready);
const rdArticle = id => state.articles.find(a => a.id === id);
const rdBy = k => state.radar.topics.filter(t => t.kind === k);

function thermometerAdvice(sentiment) {
  if (!sentiment || !sentiment.ready) return '';
  const zones = sentiment.labels && sentiment.labels.length ? sentiment.labels : DEFAULT_ZONES;
  const negativeMax = zones[0].max;
  const positiveMin = zones.length > 1 ? zones[zones.length - 2].max : 60;
  let reading = 'Il tono è neutro: non è un segnale per cambiare strategia. Le notizie non conoscono i tuoi obiettivi, tempi o capacità di rischio.';
  if (sentiment.score <= negativeMax) {
    reading = 'I titoli hanno un tono negativo: evita decisioni dettate dal panico e rileggi il piano che hai scelto.';
  } else if (sentiment.score > positiveMin) {
    reading = 'I titoli hanno un tono positivo: attenzione all’euforia. Non investire in strumenti che non capisci solo perché se ne parla.';
  }
  return `<aside class="rd-advice rd-investing-today">
    <b>Se hai 10.000 € da investire</b><p>${reading} Il Termometro non è una strategia personalizzata.</p>
    <div class="rd-investing-columns"><div><b>Cosa NON significa</b><ul><li>❌ Compra subito</li><li>❌ Vendi tutto</li></ul></div>
      <div><b>Cosa significa</b><ul><li>✅ Mantieni il piano di lungo termine</li><li>✅ Continua il PAC se è già parte del tuo piano</li><li>✅ Evita decisioni emotive</li></ul></div></div>
  </aside>`;
}

const RD_IMPACTS = {
  technology: ['Se possiedi ETF tecnologici, controlla quanto pesa già il settore nel portafoglio.', 'Più notizie non significa rendimento atteso più alto.', 'Il settore può essere volatile: evita concentrazioni non coerenti con il tuo piano.'],
  financial: ['Se hai un mutuo o un conto deposito, verifica le condizioni effettive del tuo contratto.', 'Le notizie sui tassi non anticipano automaticamente la rata o il rendimento che ricevi.', 'Non modificare l’asset allocation sulla base della sola copertura mediatica.'],
  'real-estate': ['Se hai un mutuo variabile, controlla indice e prossima revisione della rata.', 'Le notizie immobiliari non indicano il valore della tua casa.', 'Valuta le spese abitative nel budget, senza dedurre il prezzo futuro degli immobili.'],
  energy: ['Le notizie sull’energia non sono la tua bolletta: controlla consumi e tariffa.', 'Una variazione dell’indice non coincide necessariamente con quella del tuo contratto.', 'Non cambiare piano d’investimento solo perché il settore è molto citato.'],
  utilities: ['Il numero di articoli non misura il costo della tua fornitura.', 'Verifica consumi, tariffa e scadenza del contratto.', 'La copertura mediatica non è un segnale sui prezzi dei titoli.'],
  'consumer-cyclical': ['L’attenzione ai consumi non misura i tuoi rincari personali.', 'Confronta il budget familiare e i prezzi dei prodotti che acquisti.', 'Non confondere il volume delle notizie con le prospettive dei mercati.'],
  'consumer-defensive': ['Le notizie sulla spesa non misurano il prezzo del tuo carrello.', 'Tieni traccia delle spese ricorrenti e confronta i prezzi.', 'Il settore più citato non è necessariamente quello più adatto al tuo portafoglio.']
};

const RD_REASONS = {
  technology: 'AI, semiconduttori, software e grandi aziende tecnologiche.',
  financial: 'Banche, tassi d’interesse, credito e mercati finanziari.',
  'real-estate': 'Mutui, compravendite, affitti e costi delle abitazioni.',
  energy: 'Petrolio, gas, rinnovabili e transizione energetica.',
  'consumer-cyclical': 'Auto, viaggi, moda e consumi non essenziali.',
  'consumer-defensive': 'Alimentari, supermercati e beni di prima necessità.',
  healthcare: 'Sanità, farmaci, ricerca e servizi per la salute.',
  industrials: 'Manifattura, trasporti, infrastrutture e difesa.',
  'basic-materials': 'Materie prime, metalli, chimica e risorse naturali.',
  'communication-services': 'Telecomunicazioni, media, piattaforme e pubblicità.',
  utilities: 'Servizi pubblici, reti e forniture di energia e acqua.'
};

function rdImpactDetails(sectorId) {
  const points = RD_IMPACTS[sectorId] || ['Le notizie descrivono attenzione mediatica, non un’opportunità d’investimento.', 'Verifica se il tema ha un effetto concreto sul tuo budget o sui tuoi obiettivi.', 'Non cambiare il portafoglio sulla base di un singolo indicatore.'];
  return `<details class="rd-impact"><summary>💡 Cosa significa per il tuo portafoglio?</summary><ul>${points.map(point => `<li>✅ ${esc(point)}</li>`).join('')}</ul></details>`;
}

const RD_EVERYDAY = [
  { id: 'mutui', icon: '🏠', label: 'Mutui', practical: 'Fisso: la rata segue il contratto. Variabile: può cambiare alle revisioni in base all’indice previsto. Confronta TAEG, costi e durata prima di valutare una surroga.' },
  { id: 'bollette-energia', icon: '⚡', label: 'Luce e gas', practical: 'Il costo dipende da consumi, tariffa e contratto: il volume di notizie non sostituisce la lettura della bolletta.' },
  { id: 'inflazione', icon: '🛒', label: 'Spesa quotidiana', practical: 'L’inflazione generale non coincide con i tuoi acquisti: osserva le spese ricorrenti del tuo budget.' }
];

function rdFormatPeriod(period) {
  if (!/^\d{4}-\d{2}$/.test(period || '')) return 'periodo non disponibile';
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function rdSigned(value, digits = 1, suffix = '%') {
  if (value == null || !Number.isFinite(Number(value))) return 'non disponibile';
  const n = Number(value);
  return `${n > 0 ? '+' : ''}${new Intl.NumberFormat('it-IT', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)}${suffix}`;
}

function rdPublishedRate(value) {
  const text = String(value == null ? '' : value);
  return /^\d+(?:\.\d+)?$/.test(text) ? `${text.replace('.', ',')}%` : 'non disponibile';
}

function rdPriceDelta(value, suffix = '%', digits = 1, changeAsValue = false) {
  if (value == null || !Number.isFinite(Number(value))) return '<span class="rd-price-delta rd-price-na">Confronto mensile non disponibile</span>';
  const n = Number(value);
  const cls = n > 0 ? 'up' : n < 0 ? 'down' : 'same';
  const arrow = n > 0 ? '↑' : n < 0 ? '↓' : '↔';
  return `<span class="rd-price-delta rd-price-${cls}">${arrow} ${changeAsValue ? 'rispetto al mese precedente' : `${rdSigned(n, digits, suffix)} nel mese`}</span>`;
}

function rdPriceCard({ icon, label, value, valueLabel, change, changeSuffix = '%', digits = 1, yearChange, period, stale, explanation, changeAsValue = false }) {
  return `<article class="rd-price-card">
    <div class="rd-price-title"><span aria-hidden="true">${icon}</span><h4>${esc(label)}</h4></div>
    <div class="rd-price-reading"><strong>${esc(value)}</strong><span class="rd-price-value-label">${esc(valueLabel)}</span>${rdPriceDelta(change, changeSuffix, digits, changeAsValue)}</div>
    <p class="rd-price-year">Variazione annua: <b>${esc(rdSigned(yearChange, digits, changeSuffix))}</b></p>
    <p class="rd-price-explanation">${esc(explanation)}</p>
    <small class="rd-price-period">${esc(rdFormatPeriod(period))}${stale ? ' · dato da verificare' : ''}</small>
  </article>`;
}

function rdOfficialPriceCards() {
  const household = state.markets && state.markets.household;
  const hicp = household && household.eurostat;
  const indicators = new Map((hicp && hicp.indicators || []).map(item => [item.id, item]));
  const cards = [
    { id: 'food', icon: '🛒', label: 'Alimentari e bevande', explanation: 'Indice armonizzato dei prezzi al consumo; non rappresenta il costo del tuo carrello.' },
    { id: 'home-energy', icon: '⚡', label: 'Elettricità, gas e combustibili', explanation: 'Indice dei prezzi; le bollette effettive dipendono anche da consumi e contratto.' },
    { id: 'fuel', icon: '⛽', label: 'Carburanti per trasporto privato', explanation: 'Indice armonizzato dei prezzi; il prezzo alla pompa può variare per zona e distributore.' }
  ].flatMap(definition => {
    const item = indicators.get(definition.id);
    return item ? [{
      ...definition, value: rdSigned(item.changeMonthPct), valueLabel: 'variazione mensile',
      change: item.changeMonthPct, changeAsValue: true,
      yearChange: item.changeYearPct, period: item.period, stale: item.stale,
      changeSuffix: '%', digits: 1
    }] : [];
  });
  const rates = household && household.mortgage && household.mortgage.rates || [];
  const rateDefinitions = {
    variable: { icon: '🏠', label: 'Nuovi mutui: variabile o fisso fino a 1 anno', explanation: 'Tasso medio BCE sui nuovi prestiti; non è il tasso applicato alla rata del tuo mutuo.' },
    'fixed-over-one-year': { icon: '🏡', label: 'Nuovi mutui: fissazione iniziale oltre 1 anno', explanation: 'Tasso medio BCE sui nuovi prestiti con periodo iniziale di fissazione oltre un anno; non è un’offerta disponibile.' }
  };
  for (const rate of rates) {
    const definition = rateDefinitions[rate.id];
    if (definition) cards.push({
      ...definition, value: rdPublishedRate(rate.ratePct),
      valueLabel: 'tasso medio sui nuovi mutui',
      change: rate.changeMonthPp, yearChange: rate.changeYearPp, period: rate.period,
      stale: rate.stale || household.mortgage.stale, changeSuffix: ' p.p.', digits: 2
    });
  }
  if (!cards.length) return '<p class="rd-price-empty">Gli indicatori ufficiali non sono ancora disponibili. Riprova dopo il prossimo aggiornamento dei dati.</p>';
  return cards.map(rdPriceCard).join('');
}

function rdOfficialPriceHtml() {
  const household = state.markets && state.markets.household;
  const eurostatSource = household && household.eurostat && household.eurostat.source;
  const mortgageSource = household && household.mortgage && household.mortgage.source;
  const eurostatAccessDate = household && household.checkedAt ? new Date(household.checkedAt).toLocaleDateString('it-IT') : '';
  const sources = [
    eurostatSource && `<a href="${esc(safeUrl(eurostatSource.url))}" target="_blank" rel="noopener noreferrer">Eurostat, dataset prc_hicp_minr</a>${eurostatAccessDate ? ` (consultato il ${esc(eurostatAccessDate)})` : ''}`,
    mortgageSource && `<a href="${esc(safeUrl(mortgageSource.url))}" target="_blank" rel="noopener noreferrer">${esc(mortgageSource.attribution || mortgageSource.name)}</a>`
  ].filter(Boolean).join(' · ');
  return `<section class="rd-everyday" aria-labelledby="rdEverydayTitle">
    <span class="rd-sector-kicker">DATI ECONOMICI UFFICIALI</span>
    <h3 id="rdEverydayTitle" class="rd-h3">Prezzi quotidiani e tassi sui nuovi mutui</h3>
    <p class="rd-everyday-intro">Le variazioni mensili confrontano l’ultimo dato disponibile con il mese precedente; non sono prezzi in tempo reale né previsioni. L’inflazione armonizzata non coincide con le spese della singola famiglia. Per i mutui, la BCE pubblica tassi medi sui nuovi prestiti: la categoria descrive il periodo iniziale di fissazione, non il contratto o la rata di un singolo mutuatario.</p>
    <div class="rd-price-grid">${rdOfficialPriceCards()}</div>
    <p class="rd-everyday-note">${sources || 'Fonti ufficiali: Eurostat HICP ed ECB Data Portal (serie MIR).'} Le variazioni sono calcoli TrendScan sui dati mensili pubblicati; Eurostat non è responsabile delle elaborazioni.</p>
  </section>`;
}

function rdEverydayCard(item) {
  const topic = (state.radar.topics || []).find(entry => entry.id === item.id);
  const news = topic && topic.news;
  const period = state.radar.news && state.radar.news.days || 7;
  let movement = '<span class="rd-everyday-change rd-everyday-na">↔ confronto in costruzione</span>';
  if (news && news.isNew) movement = '<span class="rd-everyday-change rd-everyday-up">↑ nuovo nelle notizie</span>';
  else if (news && Number.isFinite(news.changePct)) {
    const cls = news.changePct > 0 ? 'up' : news.changePct < 0 ? 'down' : 'same';
    const arrow = news.changePct > 0 ? '↑' : news.changePct < 0 ? '↓' : '↔';
    movement = `<span class="rd-everyday-change rd-everyday-${cls}">${arrow} ${fmtPct0(news.changePct)} quota notizie</span>`;
  }
  const count = news && Number.isFinite(news.recent) ? `${fmtInt(news.recent)} ${news.recent === 1 ? 'articolo' : 'articoli'}` : 'dati non disponibili';
  return `<article class="rd-everyday-card">
    <div class="rd-everyday-title"><span aria-hidden="true">${item.icon}</span><h4>${item.label}</h4></div>
    <span class="rd-everyday-count">${count}<small>ultimi ${period} giorni</small></span>
    ${movement}
    <p>${item.practical}</p>
  </article>`;
}

function rdEverydayHtml() {
  return `${rdOfficialPriceHtml()}
    <details class="rd-attention-details">
      <summary>Quanto se ne parla nelle notizie? <span>Attenzione mediatica, non prezzi</span></summary>
      <p class="rd-everyday-intro">Questi conteggi riguardano la copertura delle testate seguite da TrendScan e non sostituiscono gli indicatori ufficiali qui sopra.</p>
      <div class="rd-everyday-grid">${RD_EVERYDAY.map(rdEverydayCard).join('')}</div>
    </details>`;
}

function rdScamAlertsHtml() {
  const data = state.markets && state.markets.scamAlerts;
  const sourceUrl = data && data.source && safeUrl(data.source.url);
  const publishedAt = data && data.fetchedAt ? new Date(data.fetchedAt).toLocaleDateString('it-IT') : '';
  const status = data && data.stale
    ? 'Feed non aggiornato: consulta la pagina ufficiale per gli avvisi più recenti.'
    : publishedAt ? `Feed controllato il ${publishedAt}.` : 'Feed ufficiale non disponibile al momento.';
  const items = data && Array.isArray(data.items) ? data.items : [];
  const list = items.length
    ? `<ul class="rd-official-alert-list">${items.map(item => {
        const href = safeUrl(item.url || sourceUrl);
        const date = item.date ? `<time datetime="${esc(item.date)}">${esc(item.date)}</time>` : '';
        return `<li>${date}<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a></li>`;
      }).join('')}</ul>`
    : '<p class="rd-official-alert-empty">Non è stato possibile caricare gli avvisi. Verifica direttamente la fonte ufficiale.</p>';
  return `<aside class="rd-scam-alert" aria-label="Avvisi ufficiali e sicurezza">
    <span class="rd-scam-label">⚠️ Verifica prima di agire</span>
    <h3>Avvisi ai risparmiatori e sicurezza</h3>
    <p>Non comunicare PIN, password o codici OTP, né installare app su richiesta di messaggi inattesi. Per controllare una comunicazione, apri autonomamente il sito o l’app ufficiale della tua banca.</p>
    <div class="rd-official-alerts">
      <b>Ultimi avvisi CONSOB</b>
      ${list}
      <small>${esc(status)} ${sourceUrl ? `· <a href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer">Apri la pagina ufficiale CONSOB</a>` : ''} Il feed copre gli avvisi pubblicati da CONSOB, non tutte le truffe o le pubblicità online.</small>
    </div>
  </aside>`;
}

function rdSectorRows(days = state.radarSectorDays) {
  const now = Date.now(), cutoff = now - days * 86400e3;
  const rows = (state.radar && state.radar.sectors || []).map(sector => {
    const articles = (sector.articles || []).filter(article => {
      const publishedAt = Date.parse(article.publishedAt);
      return Number.isFinite(publishedAt) && publishedAt >= cutoff && publishedAt <= now + 3600e3;
    });
    const sourceByOutlet = new Map();
    articles.forEach(article => {
      const outlet = String(article.source || '').split(' – ')[0].trim();
      if (outlet && (!sourceByOutlet.has(outlet) || Date.parse(article.publishedAt) > Date.parse(sourceByOutlet.get(outlet).publishedAt))) sourceByOutlet.set(outlet, article);
    });
    return { ...sector, articles, sources: [...sourceByOutlet.values()], count: articles.length, outlets: sourceByOutlet.size };
  }).filter(sector => sector.count > 0).sort((a, b) => b.count - a.count || b.outlets - a.outlets);
  const max = rows[0] ? rows[0].count : 0;
  return rows.map(sector => ({
    ...sector,
    trendScore: max ? Math.round(sector.count / max * 100) : null,
    attention: max && sector.count / max >= .65 ? 'high' : max && sector.count / max >= .3 ? 'medium' : 'low'
  }));
}

function marketsSnapshotHtml() {
  const m = state.markets, sentiment = m && m.sentiment;
  const fx = m && m.fx, household = m && m.household;
  const sectors = rdSectorRows(2), weeklySectors = rdSectorRows(7);
  const top = sectors[0] || weeklySectors[0];
  const energy = (household && household.eurostat && household.eurostat.indicators || []).find(item => item.id === 'home-energy');
  const fixedRate = (household && household.mortgage && household.mortgage.rates || []).find(rate => rate.id === 'fixed-over-one-year');
  const usd = (fx && fx.pairs || []).find(pair => pair.id === 'EURUSD');
  const items = [
    top ? `<div><dt>Settore più citato${sectors.length ? ' · 48 ore' : ' · 7 giorni'}</dt><dd>${esc(top.label)}</dd></div>` : '',
    sentiment && sentiment.ready ? `<div><dt>Tono delle notizie</dt><dd>${esc(sentiment.label)} <span>(${sentiment.score}/100)</span></dd></div>` : '',
    energy && energy.changeMonthPct != null ? `<div><dt>Energia domestica · ${esc(rdFormatPeriod(energy.period))}</dt><dd>${energy.changeMonthPct > 0 ? '+' : ''}${String(energy.changeMonthPct).replace('.', ',')}% <span>nel mese</span></dd></div>` : '',
    fixedRate ? `<div><dt>Tasso medio nuovi mutui a tasso fisso</dt><dd>${fmtRate(fixedRate.ratePct)}% <span>· ${esc(rdFormatPeriod(fixedRate.period))}</span></dd></div>` : '',
    usd ? `<div><dt>Euro / Dollaro · tasso BCE</dt><dd>${fmtRate(usd.rate)} <span>USD per 1 EUR</span></dd></div>` : ''
  ].filter(Boolean);
  if (!items.length) return '';
  return `<section class="mk-card mk-snapshot" aria-labelledby="mkSnapshotTitle">
    <h2 id="mkSnapshotTitle" class="mk-h2">📌 In 30 secondi</h2>
    <dl class="mk-snapshot-grid">${items.join('')}</dl>
    <p class="mk-note">Indicatori di contesto basati sulle fonti e sui periodi indicati; non descrivono il tuo caso personale.</p>
  </section>`;
}

function trendOfDayHtml() {
  const sectors = rdSectorRows(2);
  const top = sectors[0];
  if (!top) return '';
  return `<aside class="mk-trend-day" aria-labelledby="mkTrendDayTitle">
    <div><span class="mk-trend-day-kicker">AGGIORNATO CON LE NOTIZIE · ULTIME 48 ORE</span>
      <h2 id="mkTrendDayTitle">🔥 Trend del giorno</h2>
      <p>Il settore più citato è <b>${esc(top.label)}</b>, con ${top.count} ${top.count === 1 ? 'articolo' : 'articoli'} nel campione TrendScan.</p>
    </div>
    <a href="#trendRadar" data-goto-radar class="mk-trend-day-link">Scopri il settore <span aria-hidden="true">→</span></a>
  </aside>`;
}

function fxUseCasesHtml(fx) {
  const useCases = [
    { id: 'EURUSD', label: 'Se viaggi negli USA', name: 'dollari USA' },
    { id: 'EURGBP', label: 'Se acquisti online nel Regno Unito', name: 'sterline' },
    { id: 'EURCHF', label: 'Se viaggi o investi in Svizzera', name: 'franchi svizzeri' }
  ];
  const cards = useCases.map(item => {
    const pair = (fx.pairs || []).find(entry => entry.id === item.id);
    return pair ? `<div><b>${item.label}</b><span>1 EUR = ${fmtRate(pair.rate)} ${item.name}</span></div>` : '';
  }).filter(Boolean);
  return cards.length ? `<div class="mk-fx-context" aria-label="Cambi dell'euro nella vita quotidiana">${cards.join('')}</div>` : '';
}

function rdWatchlistHtml() {
  const rows = rdSectorRows(30).slice(0, 4);
  if (!rows.length) return '';
  const month = new Date().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  return `<section class="rd-watchlist" aria-labelledby="rdWatchlistTitle">
    <div><span class="rd-sector-kicker">AGGIORNATA CON IL RADAR</span><h3 id="rdWatchlistTitle">Watchlist del mese · ${esc(month)}</h3>
      <p>Settori con più articoli negli ultimi 30 giorni: è una lista di temi da seguire, non una previsione.</p></div>
    <ul>${rows.map(sector => `<li><span aria-hidden="true">${esc(sector.icon)}</span><b>${esc(sector.label)}</b><span>${sector.count} ${sector.count === 1 ? 'articolo' : 'articoli'}</span></li>`).join('')}</ul>
  </section>`;
}

function rdSectorDonut(rows) {
  const total = rows.reduce((n, sector) => n + sector.count, 0);
  if (!total) return '';
  const circumference = 2 * Math.PI * 46;
  let offset = 0;
  const arcs = rows.map(sector => {
    const length = circumference * sector.count / total;
    const color = /^#[0-9a-f]{6}$/i.test(sector.color || '') ? sector.color : '#64748b';
    const arc = `<circle cx="60" cy="60" r="46" fill="none" stroke="${color}" stroke-width="14" stroke-dasharray="${length.toFixed(2)} ${(circumference - length).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"/>`;
    offset += length;
    return arc;
  }).join('');
  return `<svg class="rd-sector-donut" viewBox="0 0 120 120" role="img" aria-label="Ripartizione delle menzioni per settore">${arcs}</svg>`;
}

function rdSectorMomentumHtml() {
  const comparable = (state.radar && state.radar.sectors || []).filter(sector => sector.momentum7d && sector.momentum7d.ready);
  if (!comparable.length) return `<div class="rd-sector-momentum rd-empty">Confronto settimanale in costruzione: servono almeno 10 notizie in entrambe le settimane.</div>`;
  const rising = comparable.filter(sector => sector.momentum7d.recentCount >= 3 && sector.momentum7d.changePp > 0)
    .sort((a, b) => b.momentum7d.changePp - a.momentum7d.changePp || b.momentum7d.recentCount - a.momentum7d.recentCount)
    .slice(0, 3);
  if (!rising.length) return `<div class="rd-sector-momentum rd-empty">Nessun settore supera al momento la soglia minima di menzioni e mostra una quota in aumento rispetto alla settimana precedente.</div>`;
  const cards = rising.map(sector => {
    const trend = sector.momentum7d, delta = trend.changePp.toFixed(1).replace('.', ',');
    return `<article class="rd-sector-momentum-card">
      <span class="rd-sector-icon" style="--sector-color:${esc(sector.color)}">${esc(sector.icon)}</span>
      <div><h5>${esc(sector.label)}</h5><p>${trend.recentCount} articoli su ${trend.recentArticles} nell’ultima settimana · ${trend.previousCount} su ${trend.previousArticles} nella precedente</p></div>
      <b>+${delta}<small> p.p.</small></b>
    </article>`;
  }).join('');
  return `<div class="rd-sector-momentum">
    <div class="rd-sector-momentum-intro"><span class="rd-sector-kicker">ATTENZIONE IN AUMENTO · 7 GIORNI</span><p>Variazione della quota di notizie per settore rispetto alla settimana precedente.</p></div>
    <div class="rd-sector-momentum-list">${cards}</div>
  </div>`;
}

function rdSectorsHtml() {
  const rows = rdSectorRows(), total = rows.reduce((n, sector) => n + sector.count, 0);
  const filters = [2, 7, 30].map(days => `<button type="button" data-rd-period="${days}" class="${state.radarSectorDays === days ? 'on' : ''}" aria-pressed="${state.radarSectorDays === days}">${days === 2 ? '48 ore' : `${days} giorni`}</button>`).join('');
  const momentum = rdSectorMomentumHtml();
  if (!total) return `<div class="rd-sector-dashboard">${momentum}<div class="rd-sector-controls" role="group" aria-label="Periodo delle notizie">${filters}</div><p class="rd-empty">Nessuna notizia disponibile per questo periodo. Riprova più tardi.</p></div>`;
  const max = rows[0].count;
  const heatmap = rows.map(sector => {
    const level = sector.attention;
    const levelLabel = level === 'high' ? 'Molta attenzione' : level === 'medium' ? 'Attenzione media' : 'Poca attenzione';
    return `<li class="rd-heat-${level}"><span aria-hidden="true">${level === 'high' ? '🟢' : level === 'medium' ? '🟡' : '🔴'}</span><b>${esc(sector.label)}</b><span>${levelLabel}</span><strong>${sector.trendScore}</strong></li>`;
  }).join('');
  const cards = rows.map((sector, index) => {
    const share = Math.round(sector.count / total * 100);
    const citations = sector.articles.slice(0, 2).map(article => `<li><a href="${esc(safeUrl(article.url))}" target="_blank" rel="noopener noreferrer">${esc(article.title)}</a><span>${esc(article.source || 'Testata')} · ${esc(timeAgo(article.publishedAt))}</span></li>`).join('');
    const sources = sector.sources.map(article => `<a href="${esc(safeUrl(article.url))}" target="_blank" rel="noopener noreferrer">${esc(String(article.source || 'Testata').split(' – ')[0])}</a>`).join('');
    return `<article class="rd-sector-row">
      <div class="rd-sector-rowhead"><span class="rd-sector-rank">${String(index + 1).padStart(2, '0')}</span><span class="rd-sector-icon" style="--sector-color:${esc(sector.color)}">${esc(sector.icon)}</span><div class="rd-sector-name"><h4>${esc(sector.label)}</h4><span>${sector.count} ${sector.count === 1 ? 'articolo' : 'articoli'} · ${sector.outlets} ${sector.outlets === 1 ? 'testata' : 'testate'}</span></div><span class="rd-trend-score" aria-label="TrendScore ${sector.trendScore} su 100">TrendScore <b>${sector.trendScore}</b></span><b class="rd-sector-share">${share}%</b></div>
      <div class="rd-sector-track" aria-label="${share}% delle menzioni classificate"><span style="--sector-color:${esc(sector.color)};width:${Math.max(2, Math.round(sector.count / max * 100))}%"></span></div>
      <p class="rd-sector-reason"><b>💡 Perché se ne parla:</b> ${esc(RD_REASONS[sector.id] || 'Notizie economiche associate a questo settore.')}</p>
      <ul class="rd-sector-citations">${citations}</ul>
      ${rdImpactDetails(sector.id)}
      <div class="rd-sector-source-list"><span>Fonti:</span>${sources}</div>
      <a class="rd-sector-companies" href="/aziende/#${encodeURIComponent(sector.id)}">Aziende da approfondire in questo settore <span aria-hidden="true">→</span></a>
    </article>`;
  }).join('');
  const legend = rows.slice(0, 6).map(sector => `<li><span style="--sector-color:${esc(sector.color)}"></span>${esc(sector.label)} <b>${sector.count}</b></li>`).join('');
  return `<div class="rd-sector-dashboard">
    ${momentum}
    <div class="rd-sector-toolbar"><div class="rd-sector-controls" role="group" aria-label="Periodo delle notizie">${filters}</div><span class="rd-sector-total"><b>${fmtInt(total)}</b> menzioni di settore</span></div>
    <section class="rd-heatmap" aria-labelledby="rdHeatmapTitle"><div><h4 id="rdHeatmapTitle">Heatmap dell’attenzione</h4><p>Intensità relativa tra i settori nel periodo selezionato.</p></div><ul>${heatmap}</ul></section>
    <div class="rd-sector-visuals">
      <div class="rd-sector-chart-card"><div><span class="rd-sector-kicker">PANORAMICA</span><h4>Voci più presenti nelle notizie</h4><p>Distribuzione degli articoli classificati nel periodo.</p></div><div class="rd-sector-donut-wrap">${rdSectorDonut(rows)}<span><b>${fmtInt(total)}</b><small>menzioni</small></span></div><ul class="rd-sector-legend">${legend}</ul></div>
      <div class="rd-sector-ranking"><div class="rd-sector-ranking-head"><span class="rd-sector-kicker">CLASSIFICA EDITORIALE</span><span>articoli e testate</span></div>${cards}</div>
    </div>
    <p class="rd-sector-footnote"><b>TrendScore (beta):</b> indice di attenzione editoriale da 0 a 100, calcolato rapportando le menzioni del settore al settore più citato nello stesso periodo; cambia se cambi periodo e non è confrontabile tra periodi diversi. La heatmap usa la stessa intensità relativa (≥65% alta, ≥30% media, altrimenti bassa). Non misura ricerche, interesse degli investitori o andamento dei prezzi. Classificazione automatica su titoli e anteprime: un articolo può comparire in più settori. Le fonti sono citate accanto a ogni titolo. Le aziende da approfondire sono selezionate separatamente con criteri di bilancio pubblici e non sono raccomandazioni d’acquisto.</p>
    <p class="rd-sector-source">Fonti e metodo: <a href="/metodo/#radar" class="underline">metodo TrendScan</a> · <a href="/aziende/">criteri per la selezione delle aziende</a></p>
  </div>`;
}

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
function rdRows(rows, key, top) {
  const ranked = rdGrowing(rows, key), shownIds = new Set(ranked.slice(0, top).map(t => t.id));
  const others = rows.filter(t => !shownIds.has(t.id)).sort((a, b) => (rdSortValue(b, key) ?? -9999) - (rdSortValue(a, key) ?? -9999));
  const head = `<thead><tr><th scope="col" class="rd-rank">#</th><th scope="col">Argomento</th><th scope="col">${mBadge('interest')}<span class="rd-th-sub">letture di Wikipedia</span></th><th scope="col">${mBadge('news')}<span class="rd-th-sub">menzioni nei titoli</span></th></tr></thead>`;
  const line = (t, i) => `<tr><td class="rd-rank" data-label="">${i == null ? '' : i + 1}</td><th scope="row">${esc(t.label)}</th>${interestCell(t)}${newsCell(t)}</tr>`;
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
  const sectors = rdSectorRows(7).slice(0, 3);
  const stories = (r.coverage || []).filter(c => rdArticle(c.id)).slice(0, 3);

  const c1 = sectors.length ? `<ul>${sectors.map(t => `<li><span>${esc(t.label)}<small class="rd-mini-sources">Fonti: ${t.sources.map(a => `<a href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener noreferrer">${esc(String(a.source || 'Testata').split(' – ')[0])}</a>`).join(', ')}</small></span><b>${t.count} ${t.count === 1 ? 'articolo' : 'articoli'}</b></li>`).join('')}</ul><p class="rd-sub">ultimi 7 giorni · apri i link per le fonti originali</p>`
    : `<p class="rd-mini-empty">Non ci sono ancora notizie sufficienti per classificare i settori.</p>`;
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
        ${card('Settori economici più citati', mBadge('news'), c1)}
        ${card('Notizie che ricevono più attenzione', mBadge('news'), c4)}
      </div>
      <p class="mk-credit">Le classifiche descrivono l’attenzione dei giornali; nel radar completo trovi anche cosa può significare per mutui, bollette e spesa. Non sono segnali sui prezzi né inviti a investire. <a href="#mercati" data-goto-radar class="underline">Apri contesto pratico, fonti e metodo</a>.</p>
    </div>`;
}

// ---- Pagina Mercati: classifiche complete
// Riga "Condividi / Scarica immagine" per il Trend Radar.
function shareRowHtml(slug, img, file, title, text) {
  return `<div class="share-row"><button type="button" class="share-btn" data-share data-share-url="${location.origin}/${slug}/" data-share-title="${esc(title)}" data-share-text="${esc(text)}">📤 Condividi</button><a class="share-btn" href="/og/${img}" download="${file}">🖼️ Scarica l’immagine</a><span class="share-toast" role="status" data-toast></span></div>`;
}

function radarSectionHtml() {
  const r = state.radar;
  const cov = (r.coverage || []).map(c => {
    const a = rdArticle(c.id);
    const sourceUrl = safeUrl(a && a.url || c.url);
    return `<li class="rd-story">
      <div class="rd-story-n"><b>${c.n}</b><span>testate</span></div>
      <div class="rd-story-body">${a ? `<a href="#a/${encodeURIComponent(c.id)}" class="rd-story-title">${esc(c.title)}</a>` : `<a href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer" class="rd-story-title">${esc(c.title)}</a>`}
        <div class="rd-sub">Fonte: <a href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(c.source || a && a.source || 'testata originale')}</a> · ${(c.outlets || []).map(o => `<span class="rd-chip">${esc(o)}</span>`).join('')} · ${esc(timeAgo(c.publishedAt))}</div></div></li>`;
  }).join('');
  return `
    <section id="trendRadar" class="mk-card rd-section" aria-labelledby="rdTitle">
      <h2 id="rdTitle" class="mk-h2">Trend Radar <span class="mk-badge">settori economici nelle notizie</span></h2>
      <p class="mk-lead">Quali settori compaiono più spesso nelle notizie economiche delle testate che seguiamo. È una misura della copertura editoriale, non dell’andamento dei mercati e non un consiglio d’investimento.</p>
      ${shareRowHtml('radar', 'radar.png', 'trendscan-trend-radar.png', 'Trend Radar: notizie e vita quotidiana', 'Attenzione mediatica, contesto per mutui, bollette e spesa; le frecce descrivono le notizie, non i prezzi.')}
      <div class="rd-board" aria-labelledby="rdB1">
        <h3 id="rdB1" class="rd-h3">Settori economici più citati</h3>
        <p class="mk-lead">I settori più citati sono ordinati per numero di articoli. In alto trovi anche quelli la cui quota sul totale delle notizie è cresciuta rispetto ai 7 giorni precedenti: è attenzione editoriale, non volume di ricerche o interesse degli investitori.</p>
        <div class="rd-sector-mount">${rdSectorsHtml()}</div>
      </div>

      ${rdWatchlistHtml()}
      ${rdEverydayHtml()}

      <div class="rd-board" aria-labelledby="rdB2">
        <h3 id="rdB2" class="rd-h3">Notizie che ricevono più attenzione</h3>
        <p class="mk-lead">Le storie raccontate da più testate diverse nelle ultime 48 ore. ${mBadge('news')} È attenzione dei giornali, non dei lettori: <b>molte testate non significano più importante</b>.</p>
        ${cov ? `<ol class="rd-stories">${cov}</ol>` : `<p class="rd-empty">Al momento nessuna storia risulta coperta da più testate. Compare qui appena ce ne sono.</p>`}
      </div>

      <details class="rd-method">
        <summary>Come si calcola e quali sono i limiti</summary>
        <ul>
          <li><b>Settori.</b> Gli articoli delle testate raccolte da TrendScan sono associati ai settori tramite parole chiave nei titoli e nelle anteprime. La stessa notizia può ricadere in più settori; i conteggi non sono quindi una quota del totale di articoli.</li>
          <li><b>Fonti.</b> Titoli e collegamenti portano alla pagina originale della testata, indicata accanto a ciascun articolo. Raccogliamo le fonti elencate nella <a href="/metodo/#radar" class="underline font-bold brand-text">pagina del metodo</a>.</li>
          <li><b>Aziende per settore.</b> La pagina dedicata applica criteri di solidità basati sui bilanci pubblici, con metriche specifiche per banche, assicurazioni, immobiliari e utility. L’ordine geografico dà precedenza alle aziende italiane, poi europee e statunitensi; non è una classifica di rendimento né una raccomandazione d’acquisto.</li>
          <li><b>Copertura.</b> Titoli molto simili in testate diverse entro 36 ore contano come la stessa storia. Il metodo può unire per errore storie vicine o non riconoscere la stessa storia scritta in modo molto diverso.</li>
          <li><b>Limiti.</b> La classificazione automatica può non cogliere il contesto o associare male un titolo. Il Radar riflette solo le notizie raccolte e non misura né prevede l’andamento dei settori o dei titoli.</li>
        </ul>
        <p class="rd-sub"><a href="/metodo/#radar" class="underline font-bold brand-text">Leggi il metodo completo</a></p>
      </details>

      ${rdScamAlertsHtml()}
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
  state.queue = state.videos.filter(v => v.channelId === 'trendscan-ufficiale' && (state.channelFilter === 'ALL' || v.channelId === state.channelFilter));
}

function renderVideoPage() {
  const officialVideos = state.videos.filter(v => v.channelId === 'trendscan-ufficiale').slice(0, 3);
  $('officialChannelVideos').innerHTML = officialVideos.length
    ? officialVideos.map(v => `
      <button class="group text-left" data-video="${esc(v.id)}">
        <div class="relative aspect-video rounded-xl overflow-hidden bg-gray-100">
          <img src="https://i.ytimg.com/vi/${esc(v.id)}/hqdefault.jpg" alt="" loading="lazy" referrerpolicy="no-referrer" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" onerror="this.remove()">
          <span class="absolute bottom-2 right-2 w-10 h-10 rounded-full brand-bg flex items-center justify-center shadow-lg" aria-hidden="true">
            <svg class="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </span>
        </div>
        <span class="block mt-2 text-sm font-bold leading-snug line-clamp-2 group-hover:text-[#e8412c]">${esc(v.title)}</span>
      </button>`).join('')
    : '<p class="text-sm text-gray-500 sm:col-span-3">Le anteprime dei video sono in aggiornamento. Intanto puoi visitare il <a href="https://www.youtube.com/@Trendscan26" target="_blank" rel="noopener noreferrer" class="font-bold underline brand-text">canale ufficiale TrendScan su YouTube ↗</a>.</p>';

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
  $('channelGrid').innerHTML = state.channels.filter(c => c.id === 'trendscan-ufficiale').map(c => `
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
  setupSectionReveal();
  const navKey = name === 'articolo' ? 'articoli' : name;
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === navKey));
  requestAnimationFrame(() => window.scrollTo(restoreY != null ? { top: restoreY, behavior: 'instant' } : { top: 0 }));
  setPageMeta(name);
}
const PAGE_META = {
  mercati: ['Mercati: Trend Radar, Termometro e cambi BCE | TrendScan', 'Trend Radar dei settori più citati, Termometro sul tono delle notizie e tassi di cambio BCE. Dati informativi.'],
  home: ['TrendScan – Finanza personale spiegata semplice: guide, video e notizie', 'Impara a gestire i tuoi soldi senza paroloni: guide semplici su risparmio, ETF e PAC, simulatore gratuito, video educativi e notizie dai giornali italiani.'],
  articoli: ['Articoli di finanza personale: risparmio, ETF, pensione, mutui | TrendScan', 'Le notizie di finanza personale dai principali giornali italiani, divise per argomento: risparmio, ETF, pensione, casa, tasse e conti.'],
  video: ['Video di finanza personale dal canale ufficiale | TrendScan', 'Video e approfondimenti di finanza personale dal canale YouTube ufficiale TrendScan.'],
};
function setPageMeta(name) {
  const m = PAGE_META[name] || PAGE_META.home;
  document.title = m[0];
  const d = document.querySelector('meta[name="description"]'); if (d) d.setAttribute('content', m[1]);
}
function route() {
  // ricorda dove era l'utente in home/articoli: tornando dalla lettura riparte dallo stesso punto
  if (state.view === 'home' || state.view === 'articoli') state.scroll[state.view] = window.scrollY;
  // le guide ora hanno pagine proprie (/guide/…): i vecchi link /#guide portano all'indice
  if (/^#guide/.test(location.hash)) { location.replace('/guide/'); return; }
  const h = (location.hash || '#home').slice(1);
  const m = h.match(/^a\/([\w-]+)$/);
  if (m) { showArticle(decodeURIComponent(m[1])); return; }
  const name = ['home', 'articoli', 'mercati', 'video'].includes(h) ? h : 'home';
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
    const rp = e.target.closest('[data-rd-period]');
    if (rp) {
      const days = Number(rp.dataset.rdPeriod);
      if ([2, 7, 30].includes(days)) {
        state.radarSectorDays = days;
        const mount = document.querySelector('.rd-sector-mount');
        if (mount) mount.innerHTML = rdSectorsHtml();
      }
      return;
    }
    const rg = e.target.closest('[data-goto-radar]');
    if (rg) { e.preventDefault(); location.hash = '#mercati'; setTimeout(() => { const t = $('trendRadar'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 150); return; }
    const cat = e.target.closest('[data-cat]'); if (cat) { goArticles(cat.dataset.cat); return; }
    const vid = e.target.closest('[data-video]'); if (vid) { playById(vid.dataset.video); return; }
    const q = e.target.closest('[data-q]'); if (q) { selectVideo(+q.dataset.q, true); return; }
    const sh = e.target.closest('[data-share]');
    if (sh) {
      const d = sh.dataset, toast = sh.parentNode.querySelector('[data-toast]');
      const say = m => { if (toast) { toast.textContent = m; setTimeout(() => { toast.textContent = ''; }, 2600); } };
      if (navigator.share) { navigator.share({ title: d.shareTitle, text: d.shareText, url: d.shareUrl }).catch(() => {}); return; }
      (navigator.clipboard ? navigator.clipboard.writeText(d.shareUrl) : Promise.reject()).then(() => say('Link copiato: incollalo dove vuoi'), () => say('Copia l’indirizzo dalla barra del browser'));
      return;
    }
    const jp = e.target.closest('[data-jump]'); if (jp) { const t = $(jp.dataset.jump); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
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
      <a href="/guide/etf/" class="btn-ghost">Leggi la guida sugli ETF</a>
      <a href="/guide/interesse-composto/" class="btn-ghost">PAC e interesse composto</a>
      <a href="/guide/broker-pac/" class="btn-ghost">Broker con PAC a costi bassi</a>
    </div></div>`;
}
