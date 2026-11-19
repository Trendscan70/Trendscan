const round1 = value => Math.round(value * 10) / 10;
const round2 = value => Math.round(value * 100) / 100;

function monthOffset(period, offset) {
  const [year, month] = period.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthAge(period, now) {
  const [year, month] = period.split('-').map(Number);
  return (now.getUTCFullYear() - year) * 12 + now.getUTCMonth() + 1 - month;
}

export function buildHicpIndicator(payload, category, now = new Date()) {
  const timeIndex = payload?.dimension?.time?.category?.index;
  const values = payload?.value;
  if (!timeIndex || !values || typeof values !== 'object') throw new Error('struttura HICP inattesa');

  const series = Object.entries(timeIndex)
    .map(([period, index]) => ({ period, value: values[index] == null ? NaN : Number(values[index]) }))
    .filter(row => /^\d{4}-\d{2}$/.test(row.period) && Number.isFinite(row.value))
    .sort((a, b) => a.period.localeCompare(b.period));
  const latest = series.at(-1);
  if (!latest) throw new Error(`nessun dato HICP per ${category.id}`);

  const previous = series.find(row => row.period === monthOffset(latest.period, -1));
  const yearAgo = series.find(row => row.period === monthOffset(latest.period, -12));
  const change = (current, base) => base ? round1((current / base - 1) * 100) : null;

  return {
    id: category.id,
    label: category.label,
    period: latest.period,
    index: latest.value,
    changeMonthPct: previous ? change(latest.value, previous.value) : null,
    changeYearPct: yearAgo ? change(latest.value, yearAgo.value) : null,
    series: series.slice(-13),
    stale: monthAge(latest.period, now) > 2,
    sourceUpdated: payload.updated || null
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function buildMortgageRates(csv, now = new Date()) {
  const rows = parseCsv(csv);
  const headers = rows.shift();
  if (!headers) throw new Error('CSV BCE senza intestazione');
  const columns = Object.fromEntries(headers.map((name, index) => [name, index]));
  for (const name of ['MATURITY_NOT_IRATE', 'TIME_PERIOD', 'OBS_VALUE']) {
    if (!(name in columns)) throw new Error(`colonna BCE mancante: ${name}`);
  }

  const byFixation = new Map([['F', []], ['K', []]]);
  for (const row of rows) {
    const values = byFixation.get(row[columns.MATURITY_NOT_IRATE]);
    const period = row[columns.TIME_PERIOD];
    const rate = row[columns.OBS_VALUE];
    if (values && /^\d{4}-\d{2}$/.test(period || '') && rate?.trim() && Number.isFinite(Number(rate))) values.push({ period, rate });
  }

  const output = [];
  for (const [fixation, label] of [['F', 'Variabile o fissazione fino a 1 anno'], ['K', 'Fissazione iniziale oltre 1 anno']]) {
    const series = byFixation.get(fixation).sort((a, b) => a.period.localeCompare(b.period));
    const latest = series.at(-1);
    if (!latest) continue;
    const previous = series.find(row => row.period === monthOffset(latest.period, -1));
    const yearAgo = series.find(row => row.period === monthOffset(latest.period, -12));
    output.push({
      id: fixation === 'F' ? 'variable' : 'fixed-over-one-year',
      label,
      period: latest.period,
      ratePct: latest.rate,
      changeMonthPp: previous ? round2(Number(latest.rate) - Number(previous.rate)) : null,
      changeYearPp: yearAgo ? round2(Number(latest.rate) - Number(yearAgo.rate)) : null,
      series: series.slice(-13).map(item => ({ period: item.period, value: Number(item.rate) })),
      stale: monthAge(latest.period, now) > 2
    });
  }
  if (!output.length) throw new Error('nessun tasso mutui BCE disponibile');
  return output;
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/gi, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
}

function officialConsobUrl(href, fallback) {
  try {
    const url = new URL(decodeHtml(href), fallback);
    return url.protocol === 'https:' && url.hostname === 'www.consob.it' ? url.href : fallback;
  } catch {
    return fallback;
  }
}

export function parseConsobAlerts(html, sourceUrl, maxItems = 5) {
  const startPattern = /<div class="journal-content-article\b[^"]*"[^>]*data-analytics-asset-title="([^"]*)"[^>]*>/g;
  const starts = [...html.matchAll(startPattern)];
  const alerts = starts.map((match, index) => {
    const end = starts[index + 1]?.index ?? html.length;
    const block = html.slice(match.index, end);
    const title = decodeHtml(match[1]).trim();
    const date = title.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1] || null;
    const detailHref = [...block.matchAll(/<a\b[^>]*href="([^"]+)"/g)]
      .map(anchor => decodeHtml(anchor[1]))
      .find(href => /(?:^|\/)web\/area-pubblica\/-\/delibera-/i.test(href));
    return {
      id: `${date || 'undated'}-${index}`,
      title,
      date,
      url: detailHref ? officialConsobUrl(detailHref, sourceUrl) : sourceUrl,
      issuer: 'CONSOB'
    };
  }).filter(alert => alert.title && alert.date).slice(0, maxItems);

  if (!alerts.length) throw new Error('nessun avviso CONSOB riconosciuto nella pagina');
  return alerts;
}
