// TrendScan – immagini da condividere sui social (Open Graph, 1200×630) per il Termometro e il Trend Radar.
//
//   node scripts/build-og.mjs            → scrive public/data/og/termometro.png e radar.png
//
// Legge public/data/markets.json (Termometro) e public/data/radar.json (Trend Radar): gli stessi dati mostrati nel sito.
// Gira ogni ora nel workflow "Aggiorna articoli e video" e le immagini vanno nel ramo "data";
// il sito le serve all'indirizzo /og/termometro.png e /og/radar.png (regola di proxy in netlify.toml).
// Usa il font Inter incluso in assets/fonts/ (licenza OFL), quindi il risultato non dipende dal server.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'public/data');
const OUT_DIR = process.env.OG_DIR || path.join(DATA_DIR, 'og');
const W = 1200, H = 630;
const FONTS = [400, 700, 800, 900].map(w => path.join(ROOT, `assets/fonts/Inter-${w}.ttf`));
const SITE_HOST = 'trendscan.it';

// ---------------------------------------------------------------- utilità
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const readJson = async f => { try { return JSON.parse(await readFile(path.join(DATA_DIR, f), 'utf8')); } catch { return null; } };
const fmtDate = iso => {
  if (!iso) return '';
  try {
    const d = new Date(iso), o = { timeZone: 'Europe/Rome' };
    return new Intl.DateTimeFormat('it-IT', { ...o, day: 'numeric', month: 'long', year: 'numeric' }).format(d) + ' · ' + new Intl.DateTimeFormat('it-IT', { ...o, hour: '2-digit', minute: '2-digit' }).format(d);
  } catch { return ''; }
};
const num = n => Math.round(n).toLocaleString('it-IT');
const sign = n => (n > 0 ? '+' : n < 0 ? '−' : '');

// Stima della larghezza del testo (Inter, qualche punto percentuale di margine) e a capo automatico.
const textW = (s, size, weight = 700) => [...String(s)].reduce((w, ch) => w + size * (/[A-Z0-9]/.test(ch) ? 0.63 : /[ilI.,;:'’|!]/.test(ch) ? 0.28 : /[mwMW]/.test(ch) ? 0.8 : 0.5) * (weight >= 800 ? 1.04 : 1), 0);
function wrap(text, size, maxW, maxLines, weight = 700) {
  const words = String(text).split(/\s+/).filter(Boolean), lines = []; let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (textW(t, size, weight) <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines); let last = kept[maxLines - 1];
    while (last.length > 1 && textW(last + '…', size, weight) > maxW) last = last.includes(' ') ? last.slice(0, last.lastIndexOf(' ')) : last.slice(0, -1);
    kept[maxLines - 1] = last.replace(/[\s,.;:–-]+$/, '') + '…'; return kept;
  }
  return lines;
}

// ---------------------------------------------------------------- elementi comuni
const defs = `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b0f19"/><stop offset="0.6" stop-color="#151a2e"/><stop offset="1" stop-color="#3a1a1e"/></linearGradient>
  <radialGradient id="glow" cx="0.9" cy="0.05" r="0.6"><stop offset="0" stop-color="#e8412c" stop-opacity="0.35"/><stop offset="1" stop-color="#e8412c" stop-opacity="0"/></radialGradient>
</defs>`;
const frame = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter">${defs}
  <rect width="${W}" height="${H}" fill="url(#bg)"/><rect width="${W}" height="${H}" fill="url(#glow)"/>
  ${inner}</svg>`;
const logo = (kicker) => `
  <rect x="60" y="48" width="58" height="58" rx="15" fill="#e8412c"/>
  <polyline points="76,88 88,76 97,84 108,68" fill="none" stroke="#fff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
  <polyline points="99,68 108,68 108,77" fill="none" stroke="#fff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="134" y="92" font-size="38" font-weight="900" fill="#fff" letter-spacing="-1">Trend<tspan fill="#e8412c">Scan</tspan></text>
  <text x="1140" y="88" font-size="19" font-weight="800" fill="#ff9b8a" letter-spacing="3.5" text-anchor="end">${esc(kicker)}</text>`;
const footer = (right) => `
  <line x1="60" y1="576" x2="1140" y2="576" stroke="#fff" stroke-opacity="0.12"/>
  <text x="60" y="608" font-size="22" font-weight="800" fill="#fff">${SITE_HOST}</text>
  <text x="1140" y="608" font-size="17" font-weight="400" fill="#9ca3af" text-anchor="end">${esc(right)}</text>`;
const card = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="#fff" fill-opacity="0.06" stroke="#fff" stroke-opacity="0.12"/>`;

// ---------------------------------------------------------------- 1. Termometro
function termometroSvg(m) {
  const s = m && m.sentiment, ok = !!(s && s.ready && Number.isFinite(s.score));
  const score = ok ? Math.max(0, Math.min(100, s.score)) : 0;
  const label = ok ? s.label : 'Dati in aggiornamento';
  const color = !ok ? '#9ca3af' : score <= 40 ? '#f87171' : score <= 60 ? '#fbbf24' : '#34d399';
  const cx = 880, cy = 430, r = 215, sw = 40;
  const pt = (v, rad = r) => { const a = Math.PI * (1 - v / 100); return [cx + rad * Math.cos(a), cy - rad * Math.sin(a)]; };
  const arc = (v1, v2, col) => { const [x1, y1] = pt(v1), [x2, y2] = pt(v2); return `<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="${col}" stroke-width="${sw}"/>`; };
  const [nx, ny] = pt(score, r - 70), [mx, my] = pt(score, r);
  const pillW = Math.round(textW(label, 26, 800) + 56);
  const lines = [];
  if (ok && s.change != null) lines.push(`Rispetto a ieri: ${sign(s.change)}${Math.abs(s.change)} punti`);
  if (ok && s.avg7 != null) lines.push(`Media degli ultimi giorni: ${s.avg7}`);
  const sub = ok ? `Tono di ${s.n} notizie delle ultime ${s.windowHours} ore` : 'Servono almeno alcune notizie recenti: si aggiorna ogni ora.';
  const title = wrap('Il tono delle notizie di finanza', 50, 520, 2, 900);
  return frame(`${logo('TERMOMETRO')}
  <text font-size="50" font-weight="900" fill="#fff" letter-spacing="-1">${title.map((t, i) => `<tspan x="60" y="${190 + i * 58}">${esc(t)}</tspan>`).join('')}</text>
  <text x="56" y="468" font-size="${ok ? 190 : 150}" font-weight="900" fill="${color}" letter-spacing="-6">${ok ? score : '–'}<tspan font-size="50" font-weight="700" fill="#9ca3af" dx="12" letter-spacing="0">${ok ? '/100' : ''}</tspan></text>
  <rect x="60" y="494" width="${pillW}" height="52" rx="26" fill="${color}"/>
  <text x="${60 + pillW / 2}" y="529" font-size="26" font-weight="800" fill="#0b0f19" text-anchor="middle">${esc(label)}</text>
  ${arc(0, 40, '#f87171')}${arc(40, 60, '#fbbf24')}${arc(60, 100, '#34d399')}
  ${ok ? `<line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="#fff" stroke-width="9" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="17" fill="#fff"/><circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="14" fill="#fff" stroke="#0b0f19" stroke-width="5"/>` : ''}
  <text x="${cx - r}" y="${cy + 44}" font-size="22" font-weight="700" fill="#9ca3af" text-anchor="middle">0</text>
  <text x="${cx + r}" y="${cy + 44}" font-size="22" font-weight="700" fill="#9ca3af" text-anchor="middle">100</text>
  ${lines.map((t, i) => `<text x="${cx}" y="${492 + i * 30}" font-size="23" font-weight="${i ? 400 : 700}" fill="${i ? '#cbd5e1' : '#fff'}" text-anchor="middle">${esc(t)}</text>`).join('')}
  <text x="${cx}" y="${492 + Math.max(1, lines.length) * 30 + 6}" font-size="19" font-weight="400" fill="#9ca3af" text-anchor="middle">${esc(sub)}</text>
  ${footer('Elaborazione TrendScan sul tono dei titoli, non è un indice di mercato' + (m && m.meta ? ' · ' + fmtDate(m.meta.generatedAt) : ''))}`);
}

// ---------------------------------------------------------------- 2. Trend Radar
const rdSort = (t, key, newsOk) => key === 'interest' ? (t.wiki && t.wiki.changePct != null ? t.wiki.changePct : null)
  : (!newsOk || !t.news) ? null : (t.news.isNew ? 1000 : t.news.changePct != null ? t.news.changePct : null);
function radarSvg(r) {
  const topics = (r && r.topics) || [], newsOk = !!(r && r.news && r.news.ready);
  const growing = topics.filter(t => t.kind === 'established' && (rdSort(t, 'interest', newsOk) ?? 0) > 0).sort((a, b) => rdSort(b, 'interest', newsOk) - rdSort(a, 'interest', newsOk)).slice(0, 3);
  const cover = ((r && r.coverage) || []).slice(0, 3);
  const maxPct = Math.max(1, ...growing.map(t => t.wiki.changePct));
  const rowsL = growing.length ? growing.map((t, i) => {
    const y = 336 + i * 70, pct = t.wiki.changePct, bw = Math.max(18, 440 * pct / maxPct), txt = `${sign(pct)}${num(Math.abs(pct))}%`;
    const tx = 530 - textW(txt, 30, 900) - 14;   // triangolo a sinistra della percentuale
    return `<text x="90" y="${y}" font-size="28" font-weight="800" fill="#fff">${esc(wrap(t.label, 28, 300, 1, 800)[0])}</text>
      <polygon points="${(tx - 26).toFixed(0)},${y - 4} ${(tx - 15).toFixed(0)},${y - 24} ${(tx - 4).toFixed(0)},${y - 4}" fill="#34d399"/>
      <text x="530" y="${y}" font-size="30" font-weight="900" fill="#34d399" text-anchor="end">${txt}</text>
      <rect x="90" y="${y + 14}" width="440" height="9" rx="4.5" fill="#fff" fill-opacity="0.1"/><rect x="90" y="${y + 14}" width="${bw.toFixed(0)}" height="9" rx="4.5" fill="#34d399"/>`;
  }).join('') : `<text x="90" y="340" font-size="24" fill="#9ca3af">Dati in aggiornamento</text>`;
  const rowsR = cover.length ? cover.map((a, i) => {
    const y = 318 + i * 86, ls = wrap(a.title, 21, 455, 2, 700);
    return `<text font-size="21" font-weight="700" fill="#fff">${ls.map((t, j) => `<tspan x="650" y="${y + j * 25}">${esc(t)}</tspan>`).join('')}</text>
      <text x="650" y="${y + ls.length * 25 + 3}" font-size="16" font-weight="800" fill="#fbbf24">${a.n} ${a.n === 1 ? 'testata' : 'testate'}</text>`;
  }).join('') : `<text x="650" y="340" font-size="24" fill="#9ca3af">Dati in aggiornamento</text>`;
  const src = (r && r.wiki && r.wiki.source && r.wiki.source.attribution) || 'Dati: Wikimedia Foundation (CC0)';
  return frame(`${logo('TREND RADAR')}
  <text font-size="44" font-weight="900" fill="#fff" letter-spacing="-1">${wrap('Cosa sta crescendo ora, non cosa succederà', 44, 1080, 2, 900).map((t, i) => `<tspan x="60" y="${166 + i * 52}">${esc(t)}</tspan>`).join('')}</text>
  ${card(60, 196, 520, 364)}${card(620, 196, 520, 364)}
  <text x="90" y="244" font-size="19" font-weight="800" fill="#ff9b8a" letter-spacing="1">ARGOMENTI IN PIÙ FORTE CRESCITA</text>
  ${rowsL}
  <text x="90" y="534" font-size="16" fill="#9ca3af">letture su Wikipedia, 7 giorni contro i 7 precedenti</text>
  <text x="650" y="244" font-size="19" font-weight="800" fill="#ff9b8a" letter-spacing="1">NOTIZIE CHE RICEVONO PIÙ ATTENZIONE</text>
  ${rowsR}
  ${footer(`${src.replace(/, visualizzazioni di pagina/, '')} · elaborazione TrendScan${r && r.meta ? ' · ' + fmtDate(r.meta.generatedAt) : ''}`)}`);
}

// ---------------------------------------------------------------- rendering
function toPng(svg) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: W }, font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Inter' } });
  return resvg.render().asPng();
}
await mkdir(OUT_DIR, { recursive: true });
const [markets, radar] = await Promise.all([readJson('markets.json'), readJson('radar.json')]);
const jobs = [['termometro', termometroSvg(markets)], ['radar', radarSvg(radar)]];
for (const [name, svg] of jobs) {
  const png = toPng(svg);
  await writeFile(path.join(OUT_DIR, `${name}.png`), png);
  if (process.env.OG_SVG) await writeFile(path.join(OUT_DIR, `${name}.svg`), svg);
  console.log(`✓ ${name}.png (${Math.round(png.length / 1024)} KB)`);
}
