const HOUR = 3600e3;

const norm = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const lexRe = list => new RegExp('\\b(?:' + list.join('|') + ')\\b', 'g');

function inverseRules(inv) {
  if (!inv) return null;
  const subj = inv.subjects.join('|'), up = inv.up.join('|'), down = inv.down.join('|'), gap = '[^.;!?]{0,60}?';
  const pair = movement => new RegExp(`\\b(?:${movement})\\b${gap}\\b(?:${subj})\\b|\\b(?:${subj})\\b${gap}\\b(?:${movement})\\b`, 'g');
  return { good: pair(down), bad: pair(up) };
}

export function computeSentiment(articles, settings, previous, now = Date.now()) {
  const negative = lexRe(settings.lexicon.negative), positive = lexRe(settings.lexicon.positive);
  const inverse = inverseRules(settings.inverse);
  const count = (pattern, text) => (text.match(pattern) || []).length;
  const signals = input => {
    let positiveCount = 0, negativeCount = 0;
    let text = input;
    if (inverse) {
      text = text.replace(inverse.good, () => { positiveCount++; return ' '; });
      text = text.replace(inverse.bad, () => { negativeCount++; return ' '; });
    }
    return {
      positive: positiveCount + count(positive, text),
      negative: negativeCount + count(negative, text)
    };
  };

  let weightSum = 0, toneSum = 0, articleCount = 0;
  const counts = { pos: 0, neg: 0, neutral: 0 };
  for (const article of articles) {
    const ageHours = (now - Date.parse(article.publishedAt)) / HOUR;
    if (!(ageHours >= -1 && ageHours <= settings.windowHours)) continue;
    const title = signals(norm(article.title)), summary = signals(norm(article.summary));
    const positiveCount = title.positive * settings.titleWeight + summary.positive;
    const negativeCount = title.negative * settings.titleWeight + summary.negative;
    const tone = positiveCount > negativeCount ? 1 : negativeCount > positiveCount ? -1 : 0;
    const weight = Math.pow(0.5, Math.max(0, ageHours) / settings.halfLifeHours);
    weightSum += weight;
    toneSum += weight * tone;
    articleCount++;
    counts[tone > 0 ? 'pos' : tone < 0 ? 'neg' : 'neutral']++;
  }

  const history = previous?.version === settings.version && Array.isArray(previous.history)
    ? previous.history.filter(item => item && item.d && Number.isFinite(item.s))
    : [];
  const out = {
    version: settings.version,
    ready: false,
    score: null,
    label: null,
    n: articleCount,
    counts,
    windowHours: settings.windowHours,
    asOf: new Date(now).toISOString(),
    change: null,
    avg7: null,
    history
  };
  if (articleCount < settings.minArticles || !weightSum) return out;

  const net = toneSum / weightSum;
  const score = Math.round(Math.min(100, Math.max(0, 50 + 100 * net * settings.gain)));
  out.ready = true;
  out.score = score;
  out.labels = settings.labels;
  out.label = (settings.labels.find(label => score <= label.max) || settings.labels.at(-1)).name;

  const today = new Date(now).toISOString().slice(0, 10);
  const priorHistory = history.filter(item => item.d !== today);
  const yesterday = priorHistory.at(-1);
  out.change = yesterday ? score - yesterday.s : null;
  const last7 = priorHistory.slice(-7).map(item => item.s);
  out.avg7 = last7.length >= 3 ? Math.round(last7.reduce((sum, value) => sum + value, 0) / last7.length) : null;
  priorHistory.push({ d: today, s: score, n: articleCount });
  out.history = priorHistory.slice(-settings.historyDays);
  return out;
}
