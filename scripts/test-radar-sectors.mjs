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
console.log('✓ test settori Trend Radar: classificazione, filtri Finviz, periodo e citazioni');
