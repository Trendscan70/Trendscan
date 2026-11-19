import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [data, radar] = await Promise.all([
  readFile(path.join(ROOT, 'public/aziende/companies.json'), 'utf8').then(JSON.parse),
  readFile(path.join(ROOT, 'config/radar.json'), 'utf8').then(JSON.parse)
]);
const priority = { italia: 0, europa: 1, usa: 2 };
const companySectorIds = data.sectors.map(sector => sector.id).sort();
assert.deepEqual(companySectorIds, radar.sectors.map(sector => sector.id).sort(), 'la pagina copre tutti i settori del Radar');
assert.ok(data.maxPerSector <= 20, 'il tetto configurato non supera 20 aziende per settore');
assert.match(data.updatedAt, /^\d{4}-\d{2}-\d{2}$/, 'la selezione riporta la data di aggiornamento');

for (const sector of data.sectors) {
  assert.ok(sector.criteria, `${sector.id}: criteri finanziari specifici`);
  assert.ok(sector.companies.length <= 20, `${sector.id}: massimo 20 aziende`);
  assert.equal(new Set(sector.companies.map(company => company.name)).size, sector.companies.length, `${sector.id}: nomi aziendali univoci`);
  for (let index = 0; index < sector.companies.length; index++) {
    const company = sector.companies[index];
    const reportUrl = new URL(company.annualReportUrl);
    assert.ok(company.name && company.country && company.ticker && company.focus, `${sector.id}: scheda azienda completa`);
    assert.ok(priority[company.region] !== undefined, `${sector.id}/${company.name}: area geografica valida`);
    assert.ok(/^https:\/\//.test(company.annualReportUrl), `${sector.id}/${company.name}: fonte ufficiale HTTPS`);
    assert.ok(reportUrl.pathname !== '/' || reportUrl.hostname.startsWith('ir.'), `${sector.id}/${company.name}: collegamento a documenti o area investitori`);
    if (index) assert.ok(priority[company.region] >= priority[sector.companies[index - 1].region], `${sector.id}: Italia, Europa e USA in ordine`);
  }
}

console.log(`✓ test aziende per settore: ${data.sectors.length} settori, massimo 20 per settore, ordine geografico e fonti HTTPS`);
