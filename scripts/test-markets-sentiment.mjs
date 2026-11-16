import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { computeSentiment } from './markets-sentiment.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await readFile(path.join(ROOT, 'config/markets.json'), 'utf8')).sentiment;
const now = Date.parse('2026-11-16T12:00:00Z');
const settings = { ...config, minArticles: 1 };
const article = (title, ageHours = 0, summary = '') => ({
  title,
  summary,
  publishedAt: new Date(now - ageHours * 3600e3).toISOString()
});
const score = articles => computeSentiment(articles, settings, null, now);

assert.equal(score([article('Titolo senza segnali')]).score, 50, 'il tono neutro corrisponde a 50');
assert.equal(score([article('Borse in forte crescita')]).score, 100, 'un campione interamente positivo arriva a 100');
assert.equal(score([article('Borsa affonda in crisi')]).score, 0, 'un campione interamente negativo arriva a 0');
assert.equal(score([article('Borse in crescita'), article('Borsa in crisi')]).score, 50, 'toni opposti si bilanciano');
assert.equal(score([article('Inflazione in calo')]).score, 100, 'il calo dell’inflazione viene interpretato come segnale positivo');
assert.equal(score([article('Borse in crescita'), article('Borsa in crisi', 24)]).score, 67, 'le notizie recenti pesano di più secondo il decadimento configurato');

const insufficient = computeSentiment([article('Borsa in crescita')], { ...config, minArticles: 2 }, null, now);
assert.equal(insufficient.ready, false, 'non pubblica un punteggio sotto la soglia minima');
assert.equal(insufficient.score, null, 'non mostra un valore quando i dati sono insufficienti');
const recalibrated = computeSentiment([article('Titolo neutro')], settings, { version: 1, history: [{ d: '2026-11-15', s: 100, n: 20 }] }, now);
assert.equal(recalibrated.change, null, 'non confronta la nuova scala con lo storico della calibrazione precedente');
assert.equal(recalibrated.avg7, null, 'non calcola una media che mescola calibrazioni diverse');
console.log('✓ test Termometro: scala, polarità, pesi temporali e soglia minima');
