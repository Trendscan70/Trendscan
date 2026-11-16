import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { buildSectorRows } from './radar-sectors.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await readFile(path.join(ROOT, 'config/radar.json'), 'utf8'));
const now = Date.parse('2026-10-26T12:00:00Z');
const articles = [
  { id: 'ai', title: 'Nvidia annuncia nuovi chip per intelligenza artificiale', summary: 'Investimenti nei data center', url: 'https://ansa.it/economia/ai', source: 'ANSA – Economia', sourceId: 'ansa', publishedAt: '2026-10-26T09:00:00Z' },
  { id: 'rates', title: 'La BCE taglia i tassi di interesse', summary: 'Le banche centrali aggiornano il costo del credito', url: 'https://corriere.it/economia/tassi', source: 'Corriere – Economia', sourceId: 'corriere', publishedAt: '2026-10-25T09:00:00Z' },
  { id: 'homes', title: 'Prezzi delle case e nuovi mutui', summary: 'Il mercato immobiliare italiano', url: 'https://sole24ore.com/casa', source: 'Il Sole 24 Ore – Finanza Personale', sourceId: 'sole-fp', publishedAt: '2026-10-24T09:00:00Z' },
  { id: 'oil', title: 'Il prezzo del Brent torna a salire', summary: 'Nuovi movimenti sul mercato energetico', url: 'https://repubblica.it/energia', source: 'la Repubblica – Economia', sourceId: 'repubblica', publishedAt: '2026-10-23T09:00:00Z' },
  { id: 'old', title: 'Banche e prestiti', summary: 'Notizia fuori dal periodo analizzato', url: 'https://ansa.it/economia/old', source: 'ANSA – Economia', sourceId: 'ansa', publishedAt: '2026-09-20T09:00:00Z' },
  { id: 'invalid', title: 'Industria e produzione', summary: 'Indirizzo mancante', url: 'javascript:alert(1)', source: 'ANSA – Economia', sourceId: 'ansa', publishedAt: '2026-10-26T09:00:00Z' }
];
const rows = buildSectorRows(articles, config.sectors, now);
const byId = id => rows.find(sector => sector.id === id);

assert.equal(rows.length, 11, 'tutti i settori Finviz sono definiti');
assert.equal(new Set(rows.map(sector => sector.finvizFilter)).size, rows.length, 'i filtri Finviz sono univoci');
assert.ok(byId('technology').articles.some(article => article.id === 'ai'), 'classificazione tecnologica');
assert.ok(byId('financial').articles.some(article => article.id === 'rates'), 'classificazione finanziaria e tassi');
assert.ok(byId('financial').articles.some(article => article.id === 'homes'), 'un articolo può appartenere a più settori');
assert.ok(byId('real-estate').articles.some(article => article.id === 'homes'), 'classificazione immobiliare');
assert.ok(byId('energy').articles.some(article => article.id === 'oil'), 'classificazione energetica');
assert.ok(rows.every(sector => sector.articles.every(article => article.id !== 'old' && article.id !== 'invalid')), 'esclusione articoli vecchi o con URL non valido');
assert.ok(byId('technology').articles[0].source && byId('technology').articles[0].url, 'ogni risultato conserva testata e fonte originale');

const makeWindow = (prefix, publishedAt, technologyCount, financialCount) => Array.from({ length: 12 }, (_, index) => {
  const title = index < technologyCount ? 'Nvidia presenta nuovi chip'
    : index < technologyCount + financialCount ? 'Le banche aggiornano i prestiti'
      : `Notizia neutra ${prefix} ${index}`;
  return {
    id: `${prefix}-${index}`,
    title,
    summary: 'Aggiornamento economico',
    url: `https://example.com/${prefix}/${index}`,
    source: `Testata ${index}`,
    sourceId: `source-${index}`,
    publishedAt: new Date(Date.parse(publishedAt) + index * 60000).toISOString()
  };
});
const momentumArticles = [
  ...makeWindow('recent', '2026-10-25T10:00:00Z', 3, 1),
  ...makeWindow('previous', '2026-10-16T10:00:00Z', 1, 3)
];
const momentumRows = buildSectorRows(momentumArticles, config.sectors, now);
const technologyMomentum = momentumRows.find(sector => sector.id === 'technology').momentum7d;
assert.equal(technologyMomentum.ready, true, 'confronto settimanale disponibile con campione sufficiente');
assert.equal(technologyMomentum.recentCount, 3, 'conteggia le notizie del settore nella settimana recente');
assert.equal(technologyMomentum.previousCount, 1, 'conteggia le notizie del settore nella settimana precedente');
assert.equal(technologyMomentum.changePp, 16.7, 'misura la variazione della quota sul totale delle notizie');
assert.equal(buildSectorRows(momentumArticles.slice(0, 9), config.sectors, now)[0].momentum7d.ready, false, 'nasconde i confronti con campioni insufficienti');
console.log('✓ test settori Trend Radar: classificazione, filtri, citazioni e momentum settimanale');
