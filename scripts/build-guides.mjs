// TrendScan – genera le pagine delle guide: una pagina con indirizzo proprio per ogni guida + l'indice /guide/.
//
//   npm run build:guides
//
// Fonti (si modificano qui, non nelle pagine generate):
//   content/guide/<slug>.html   testo di ogni guida (HTML senza intestazione)
//   content/guide/_header.html, _footer.html, _affiliate-note.html   parti comuni
//   config/brokers.json         dati della tabella broker
//   scripts/build-guides.mjs    titoli, descrizioni SEO, ordine, data di aggiornamento (GUIDES, UPDATED)
// Scrive:
//   public/guide/index.html e public/guide/<slug>/index.html, e aggiorna le voci /guide/ di public/sitemap.xml.
// Le pagine generate sono file normali: Netlify le pubblica così come sono (nessun build command).
// Dopo aver cambiato un testo o la data: lancia il comando e fai commit anche delle pagine generate.

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://trendscan26.netlify.app';
const UPDATED = '2026-10-21';            // data di ultima revisione dei testi (ISO): compare in pagina, nei dati strutturati e nella sitemap
const UPDATED_LABEL = 'ottobre 2026';
const CHART_JS = 'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.js';

// Ordine = ordine di lettura. n = numero del capitolo (null = strumento extra).
const GUIDES = [
  { slug: 'azioni', label: "Cosa sono le azioni?", n: 1, icon: '🏢', short: 'Azioni',
    h1: 'Cosa sono le azioni?',
    seoTitle: 'Cosa sono le azioni: guida per principianti',
    desc: "Cosa compri quando compri un'azione, come si guadagna (capital gain e dividendi) e perché serve un orizzonte di lungo periodo. Spiegato in modo semplice.",
    sub: "Diventa proprietario di una quota reale di un'azienda" },
  { slug: 'risparmio-50-30-20', label: "I consigli basilari sul risparmio", n: 2, icon: '🛡️', short: 'Regola 50/30/20 e fondo di emergenza',
    h1: 'Regola 50/30/20 e fondo di emergenza: i consigli base sul risparmio',
    seoTitle: 'Regola 50/30/20 e fondo di emergenza',
    desc: 'La regola 50/30/20 per organizzare il reddito mensile e il fondo di emergenza da 3-6 mesi di spese: le basi da mettere a posto prima di investire.',
    sub: 'Costruisci solide fondamenta prima di investire' },
  { slug: 'etf', label: "Cos'è un ETF", n: 3, icon: '📦', short: 'Cos\'è un ETF',
    h1: "Cos'è un ETF",
    seoTitle: "Cos'è un ETF: guida semplice per principianti",
    desc: "Cos'è un ETF, come funziona e quali sono vantaggi, rischi e costi: il «paniere» di titoli che si compra con un solo ordine, spiegato in modo semplice.",
    sub: 'Exchange Traded Fund: un «paniere» di titoli che si compra con un solo ordine' },
  { slug: 'pac', label: "Cos'è un PAC", n: 4, icon: '🔁', short: 'Cos\'è un PAC',
    h1: "Cos'è un PAC (Piano di Accumulo del Capitale)",
    seoTitle: "Cos'è un PAC (Piano di Accumulo del Capitale)",
    desc: 'Come funziona il PAC: investire una cifra fissa ogni mese in ETF, il Dollar Cost Averaging, cosa fa e cosa non fa. Guida per chi parte da zero.',
    sub: 'Investire una cifra fissa a scadenze regolari, in automatico' },
  { slug: 'pic-vs-pac', label: "PIC e PAC a confronto", n: 5, icon: '⚖️', short: 'PIC e PAC a confronto',
    h1: 'PIC e PAC a confronto',
    seoTitle: 'PIC o PAC: differenze e come scegliere',
    desc: "Investire tutto subito (PIC) o un po' alla volta (PAC)? Un esempio con i numeri, le differenze in breve e quattro domande per scegliere.",
    sub: "Investire tutto subito oppure un po' alla volta?" },
  { slug: 'interesse-composto', label: "La potenza dell'interesse composto", n: 6, icon: '❄️', short: 'Interesse composto',
    h1: "La potenza dell'interesse composto",
    seoTitle: "Interesse composto: come funziona",
    desc: "Come funziona l'interesse composto: la formula, la regola del 72 e l'effetto «palla di neve» dei rendimenti che generano altri rendimenti.",
    sub: "Rendimenti che generano altri rendimenti: l'effetto «palla di neve»" },
  { slug: 'simulatore-pac', label: "Simulatore: prova i tuoi numeri", n: 7, icon: '🧮', short: 'Simulatore PAC', kind: 'sim', scripts: true,
    h1: 'Simulatore PAC: prova i tuoi numeri',
    seoTitle: 'Simulatore PAC e interesse composto',
    desc: 'Simulatore gratuito: scegli capitale iniziale, versamento mensile, anni e rendimento e guarda come cresce un PAC. Esempio teorico, non una previsione.',
    sub: 'Scegli capitale iniziale, versamento mensile, anni e rendimento ipotetico e guarda come cresce un PAC nel tempo.' },
  { slug: 'broker-pac', label: "Broker con PAC a costi bassi", n: 8, icon: '🏦', short: 'Broker con PAC', kind: 'broker',
    h1: 'Broker con PAC a costi bassi: confronto informativo',
    seoTitle: 'Broker con PAC a costi bassi: confronto',
    desc: 'Confronto informativo dei broker con PAC a costi bassi (Trade Republic, Scalable, Directa, Fineco): costi, fisco e note. Non è una classifica.',
    sub: 'Confronto informativo, non una classifica né una raccomandazione personalizzata' },
  { slug: 'bilancio-familiare-excel', label: "Foglio Excel per il bilancio familiare", n: null, icon: '🎁', short: 'Foglio Excel gratuito', kind: 'tool',
    h1: 'Foglio Excel gratuito per il bilancio familiare',
    seoTitle: 'Foglio Excel gratuito per il bilancio familiare',
    desc: 'Scarica gratis il foglio Excel per il bilancio familiare: 12 fogli mensili, spese per categoria, risparmio e grafico. Per Excel, LibreOffice e Google Fogli.',
    sub: 'Il primo passo prima di iniziare un PAC: scopri dove vanno i tuoi soldi' }
];
const numbered = GUIDES.filter(g => g.n);
const url = g => `${SITE}/guide/${g.slug}/`;
const href = g => `/guide/${g.slug}/`;

const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const read = f => readFile(path.join(ROOT, f), 'utf8');
const jsonLd = obj => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

// ---------------------------------------------------------------- parti comuni
async function loadParts() {
  const [header, footer, affiliate, brokers] = await Promise.all([
    read('content/guide/_header.html'), read('content/guide/_footer.html'),
    read('content/guide/_affiliate-note.html'), read('config/brokers.json').then(JSON.parse)
  ]);
  return { header: header.trimEnd(), footer: footer.trimEnd(), affiliate: affiliate.trim(), brokers };
}

function head({ title, desc, canonical, ogType = 'article', ld, scripts }) {
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)} | TrendScan</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="canonical" href="${canonical}">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
  <meta name="application-name" content="TrendScan">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/favicon.ico" sizes="48x48">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.webmanifest">
  <meta property="og:type" content="${ogType}">
  <meta property="og:site_name" content="TrendScan">
  <meta property="og:locale" content="it_IT">
  <meta property="og:title" content="${esc(title)} | TrendScan">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${SITE}/og-image.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)} | TrendScan">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image" content="${SITE}/og-image.png">
  ${jsonLd(ld)}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <script>(function(){try{var t=localStorage.getItem('ts-theme');if(!t)t=window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();</script>
  <meta name="theme-color" content="#f4f5f7">
  <link rel="stylesheet" href="/tailwind.css">
  <link rel="stylesheet" href="/styles.css">
${scripts ? `  <script defer src="${CHART_JS}"></script>\n` : ''}</head>`;
}

const tools = `
  <div id="guideTools" class="guide-tools" role="group" aria-label="Strumenti di lettura">
    <button type="button" data-fs="-1" class="fs-btn" aria-label="Riduci il testo">A−</button>
    <button type="button" data-fs="1" class="fs-btn" aria-label="Aumenta il testo">A+</button>
    <button type="button" data-go="/guide/" aria-label="Tutte le guide">☰</button>
  </div>`;
const tail = `
  <script src="/page.js" defer></script>
  <script src="/guide.js" defer></script>
</body>
</html>
`;

const crumbs = items => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item }))
});

const updatedLine = `<p class="text-xs text-gray-300 mt-3">Aggiornato a ${UPDATED_LABEL} · A cura della redazione di TrendScan · <a href="/metodo/" class="underline font-semibold text-white">Come lavoriamo</a> · <a href="/avvertenze/" class="underline font-semibold text-white">Avvertenze</a></p>`;

// ---------------------------------------------------------------- blocchi
function guideCard(g, current) {
  const cur = current && current.slug === g.slug;
  return `<a href="${href(g)}"${cur ? ' aria-current="page"' : ''} class="flex items-start gap-3 p-3 rounded-xl border transition ${cur ? 'bg-indigo-900/40 border-indigo-500' : 'bg-gray-900/70 border-gray-800 hover:border-indigo-400'}">
          <span class="shrink-0 w-8 h-8 rounded-lg bg-indigo-600/30 border border-indigo-500/40 text-indigo-200 font-black flex items-center justify-center">${g.n ?? g.icon}</span>
          <span><span class="block font-bold text-white text-sm">${esc(g.label)}</span><span class="block text-xs text-gray-400">${esc(g.slug === 'simulatore-pac' ? 'Prova tu i numeri del tuo PAC' : g.sub)}</span></span></span>
        </a>`;
}

function prevNext(g) {
  const i = numbered.findIndex(x => x.slug === g.slug); if (i < 0) return '';
  const box = (x, label, rel) => `<a href="${href(x)}" rel="${rel}" class="p-4 rounded-2xl bg-gray-900/80 border border-gray-800 hover:border-indigo-400 transition ${rel === 'next' ? 'sm:text-right' : ''}">
        <span class="block text-[11px] uppercase tracking-wide text-gray-400">${label}</span>
        <span class="block font-bold text-white">${esc(x.label)}</span></a>`;
  const prev = numbered[i - 1], next = numbered[i + 1];
  if (!prev && !next) return '';
  return `<nav aria-label="Capitoli vicini" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      ${prev ? box(prev, '← Capitolo precedente', 'prev') : '<span></span>'}
      ${next ? box(next, 'Capitolo successivo →', 'next') : '<span></span>'}
    </nav>`;
}

function brokerTable(P) {
  const rows = P.brokers.brokers.map(b => {
    const link = b.aff || b.url, rel = b.aff ? 'sponsored noopener noreferrer' : 'noopener noreferrer';
    return `<tr class="border-b border-gray-800/60 align-top">
      <td class="px-4 py-3 font-bold text-white whitespace-nowrap">${esc(b.name)}${b.aff ? ' <span class="ml-1 px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-200 text-[9px] uppercase">Pubblicità</span>' : ''}</td>
      <td class="px-4 py-3 text-emerald-300">${esc(b.pac)}</td><td class="px-4 py-3">${esc(b.ordine)}</td><td class="px-4 py-3">${esc(b.fisco)}</td>
      <td class="px-4 py-3 text-gray-300">${esc(b.note)}</td>
      <td class="px-4 py-3"><a href="${esc(link)}" target="_blank" rel="${rel}" class="text-indigo-300 underline whitespace-nowrap">Sito ufficiale ↗</a></td></tr>`;
  }).join('\n      ');
  return `<div class="overflow-x-auto rounded-2xl border border-gray-800"><table class="w-full text-xs text-left min-w-[820px] text-gray-200">
    <thead class="text-gray-400 uppercase text-[10px] border-b border-gray-800"><tr><th class="px-4 py-2">Broker</th><th class="px-4 py-2">Costo PAC</th><th class="px-4 py-2">Ordine manuale</th><th class="px-4 py-2">Regime fiscale</th><th class="px-4 py-2">Note</th><th class="px-4 py-2"></th></tr></thead>
    <tbody>
      ${rows}</tbody></table></div>`;
}

async function budgetBits() {
  let kb = '';
  try { const s = await stat(path.join(ROOT, 'public/downloads/bilancio-familiare.xlsx')); kb = ` · ${Math.max(1, Math.round(s.size / 1024))} KB`; } catch { /* file assente */ }
  return {
    meta: `File Excel (.xlsx)${kb}`,
    button: '<a href="/downloads/bilancio-familiare.xlsx" download="Bilancio-familiare-TrendScan.xlsx" class="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-extrabold text-sm shadow-lg bg-emerald-600 hover:bg-emerald-500 text-white w-full justify-center">⬇️ Scarica gratis</a>'
  };
}

// ---------------------------------------------------------------- pagina di una guida
async function renderGuide(g, P) {
  let body = (await read(`content/guide/${g.slug}.html`)).trim();
  if (g.kind === 'broker') {
    body = body.replace('<!--BROKER_TABLE-->', brokerTable(P))
      .replace('<!--AFFILIATE_NOTE-->', P.brokers.brokers.some(b => b.aff) ? `<p class="text-[11px] text-gray-400 leading-relaxed">${P.affiliate}</p>` : '');
  }
  if (g.kind === 'tool') {
    const b = await budgetBits();
    body = body.replace('<!--BUDGET_META-->', b.meta).replace('<!--BUDGET_DOWNLOAD-->', b.button);
  }
  const wrapped = g.kind === 'tool' ? body : `<section class="glass-panel p-6 sm:p-8 rounded-3xl border border-gray-800 space-y-5">
        ${body}
      </section>`;
  const kicker = g.n ? `🎓 Guida ${g.n} di ${numbered.length}` : '🎁 Strumento gratuito';
  const ld = [
    { '@context': 'https://schema.org', '@type': 'Article', headline: g.h1, description: g.desc, inLanguage: 'it-IT',
      dateModified: UPDATED, mainEntityOfPage: url(g), author: { '@id': `${SITE}/#org` }, publisher: { '@id': `${SITE}/#org` },
      image: `${SITE}/og-image.png`, isPartOf: { '@type': 'CollectionPage', '@id': `${SITE}/guide/`, name: 'Guida al risparmio, azioni, ETF e PAC' } },
    crumbs([['Home', `${SITE}/`], ['Guide', `${SITE}/guide/`], [g.short, url(g)]])
  ];
  const note = g.kind === 'sim'
    ? `<p class="text-[11px] text-gray-400 leading-relaxed">Esempio teorico a rendimento costante, senza costi, tasse e inflazione: i mercati reali oscillano e nessun rendimento è garantito. Non è una previsione né una consulenza. «L'interesse composto è l'ottava meraviglia del mondo» è una frase molto citata e spesso attribuita a Einstein, ma senza prove che l'abbia detta. Per capire come si fa il calcolo, leggi <a class="underline text-indigo-300 hover:text-white" href="/guide/interesse-composto/">la guida all'interesse composto</a>.</p>` : '';
  return `${head({ title: g.seoTitle, desc: g.desc, canonical: url(g), ld, scripts: g.scripts })}
<body class="bg-[#f4f5f7] text-gray-900 antialiased">

${P.header}

  <main class="max-w-7xl mx-auto px-4 py-6">
    <nav aria-label="Percorso" class="text-xs text-gray-500 mb-3"><a href="/" class="hover:underline">Home</a> › <a href="/guide/" class="hover:underline">Guide</a> › <span>${esc(g.short)}</span></nav>
    <div class="rounded-3xl bg-[#0b0f19] text-gray-100 p-3 sm:p-6 space-y-8" id="academyRoot">
      <div class="academy-banner rounded-3xl p-6 sm:p-8 relative overflow-hidden">
        <div class="max-w-3xl">
          <span class="px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-xs font-extrabold border border-purple-500/40 uppercase tracking-widest">${kicker}</span>
          <h1 class="text-2xl sm:text-3xl font-black text-white mt-3 tracking-tight">${esc(g.h1)}</h1>
          <p class="text-sm text-gray-200 mt-2 leading-relaxed">${esc(g.sub)}</p>
          ${updatedLine}
        </div>
      </div>

      ${wrapped}
      ${note ? `\n      ${note}\n` : ''}
      ${prevNext(g)}

      <section aria-labelledby="altreGuide" class="glass-panel p-5 sm:p-6 rounded-3xl border border-gray-800 space-y-4">
        <h2 id="altreGuide" class="text-xl font-extrabold text-white">📑 Tutte le guide</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
        ${GUIDES.map(x => guideCard(x, g)).join('\n        ')}
        </div>
        <p class="text-xs text-gray-400"><a class="underline hover:text-white" href="/guide/">Torna all'indice delle guide</a> · <a class="underline hover:text-white" href="/">Torna alla home di TrendScan</a></p>
      </section>
    </div>
  </main>

${P.footer}
${tools}${tail}`;
}

// ---------------------------------------------------------------- indice /guide/
function renderHub(P) {
  const title = 'Guida al risparmio, azioni, ETF e PAC';
  const desc = 'Azioni, ETF, PAC e PIC, interesse composto, regola 50/30/20: le guide pratiche di TrendScan in italiano, una pagina per ogni argomento.';
  const ld = [
    { '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, description: desc, inLanguage: 'it-IT', url: `${SITE}/guide/`,
      dateModified: UPDATED, author: { '@id': `${SITE}/#org` }, publisher: { '@id': `${SITE}/#org` }, image: `${SITE}/og-image.png`,
      mainEntity: { '@type': 'ItemList', itemListElement: GUIDES.map((g, i) => ({ '@type': 'ListItem', position: i + 1, url: url(g), name: g.h1 })) } },
    crumbs([['Home', `${SITE}/`], ['Guide', `${SITE}/guide/`]])
  ];
  const cards = GUIDES.map(g => `<a href="${href(g)}" class="flex flex-col gap-2 p-5 rounded-2xl bg-gray-900/80 border border-gray-800 hover:border-indigo-400 transition">
          <span class="flex items-center justify-between"><span class="text-[11px] font-extrabold uppercase tracking-widest text-indigo-300">${g.n ? 'Capitolo ' + g.n : 'Strumento gratuito'}</span><span class="text-2xl" aria-hidden="true">${g.icon}</span></span>
          <h2 class="text-lg font-extrabold text-white leading-snug">${esc(g.h1)}</h2>
          <p class="text-sm text-gray-300 leading-relaxed">${esc(g.slug === 'simulatore-pac' ? 'Prova tu i numeri del tuo PAC: capitale iniziale, versamento mensile, anni e rendimento ipotetico.' : g.sub)}</p>
          <span class="mt-auto text-xs font-bold text-indigo-300">Leggi la guida →</span>
        </a>`).join('\n        ');
  return `${head({ title, desc, canonical: `${SITE}/guide/`, ld })}
<body class="bg-[#f4f5f7] text-gray-900 antialiased">

${P.header}

  <main class="max-w-7xl mx-auto px-4 py-6">
    <nav aria-label="Percorso" class="text-xs text-gray-500 mb-3"><a href="/" class="hover:underline">Home</a> › <span>Guide</span></nav>
    <div class="rounded-3xl bg-[#0b0f19] text-gray-100 p-3 sm:p-6 space-y-8" id="academyRoot" data-hub="1">
      <div class="academy-banner rounded-3xl p-6 sm:p-8 relative overflow-hidden">
        <div class="max-w-3xl">
          <span class="px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-xs font-extrabold border border-purple-500/40 uppercase tracking-widest">🎓 TrendScan Financial Academy</span>
          <h1 class="text-2xl sm:text-3xl font-black text-white mt-3 tracking-tight">${title}</h1>
          <p class="text-sm text-gray-200 mt-2 leading-relaxed">
            Scopri come gestire il tuo denaro in modo intelligente, comprendere il funzionamento delle azioni societarie ed utilizzare l'interesse composto tramite un PAC (Piano di Accumulo del Capitale) per costruire la tua indipendenza finanziaria nel tempo.
          </p>
          <p class="text-sm text-gray-300 mt-2 leading-relaxed"><strong class="text-white">Da dove comincio?</strong> Se parti da zero, segui i capitoli nell'ordine: dal budget (2) agli ETF (3) e al PAC (4), poi prova i numeri nel simulatore (7). Ogni guida è una pagina a sé e si legge in pochi minuti.</p>
          ${updatedLine}
        </div>
      </div>

      <section aria-label="Elenco delle guide" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        ${cards}
      </section>

      <p class="text-xs text-gray-400 leading-relaxed">I contenuti hanno scopo informativo ed educativo e non costituiscono consulenza finanziaria, fiscale o legale né sollecitazione all'investimento. Ogni investimento comporta rischi, compresa la perdita del capitale. <a class="underline hover:text-white" href="/avvertenze/">Avvertenze</a>.</p>
    </div>
  </main>

${P.footer}
${tail}`;
}

// ---------------------------------------------------------------- sitemap
async function updateSitemap() {
  const file = path.join(ROOT, 'public/sitemap.xml');
  let xml = await readFile(file, 'utf8');
  xml = xml.replace(/\s*<url>\s*<loc>https:\/\/[^<]*\/guide\/[^<]*<\/loc>[\s\S]*?<\/url>/g, '');
  const entry = (loc, prio, freq) => `\n  <url>\n    <loc>${loc}</loc>\n    <lastmod>${UPDATED}</lastmod>\n    <changefreq>${freq}</changefreq>\n    <priority>${prio}</priority>\n  </url>`;
  const block = entry(`${SITE}/guide/`, '0.9', 'monthly') + GUIDES.map(g => entry(url(g), '0.8', 'monthly')).join('');
  const m = xml.match(new RegExp('<url>\\s*<loc>' + SITE.replace(/[.]/g, '\\.') + '/</loc>[\\s\\S]*?</url>')); // la home
  if (!m) throw new Error('sitemap: voce della home non trovata');
  xml = xml.replace(m[0], m[0].replace(/<lastmod>[^<]*<\/lastmod>/, `<lastmod>${UPDATED}</lastmod>`) + block);   // la home cambia con le guide (percorso, link)
  await writeFile(file, xml);
}

// ---------------------------------------------------------------- main
const P = await loadParts();
for (const g of GUIDES) {
  const dir = path.join(ROOT, 'public/guide', g.slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'index.html'), await renderGuide(g, P));
}
await writeFile(path.join(ROOT, 'public/guide/index.html'), renderHub(P));
await updateSitemap();
console.log(`✓ ${GUIDES.length} guide + indice scritti in public/guide/ · sitemap aggiornata (${UPDATED})`);
