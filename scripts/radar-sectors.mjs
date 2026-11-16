const DAY = 86400e3;
const norm = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function buildSectorRows(articles, sectors, now = Date.now()) {
  const cutoff = now - 30 * DAY;
  const usable = articles.filter(article => {
    const publishedAt = Date.parse(article.publishedAt);
    return article.title && /^https?:\/\//i.test(article.url || '')
      && Number.isFinite(publishedAt) && publishedAt >= cutoff && publishedAt <= now + 3600e3;
  });
  const recentFrom = now - 7 * DAY, previousFrom = now - 14 * DAY;
  const recentArticles = usable.filter(article => Date.parse(article.publishedAt) >= recentFrom);
  const previousArticles = usable.filter(article => Date.parse(article.publishedAt) < recentFrom && Date.parse(article.publishedAt) >= previousFrom);
  const articleKey = article => article.id || article.url;
  const recentTotal = new Set(recentArticles.map(articleKey)).size;
  const previousTotal = new Set(previousArticles.map(articleKey)).size;
  const sharePct = (count, total) => total ? Math.round(count / total * 1000) / 10 : null;

  return sectors.map(sector => {
    const pattern = new RegExp(sector.pattern, 'i');
    const rows = usable.filter(article => pattern.test(norm(`${article.title} ${article.summary || ''}`)))
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
      .map(article => ({
        id: article.id,
        title: article.title,
        url: article.url,
        source: article.source,
        sourceId: article.sourceId,
        publishedAt: article.publishedAt
      }));
    const recentCount = rows.filter(article => Date.parse(article.publishedAt) >= recentFrom).length;
    const previousCount = rows.filter(article => Date.parse(article.publishedAt) < recentFrom && Date.parse(article.publishedAt) >= previousFrom).length;
    const recentSharePct = sharePct(recentCount, recentTotal);
    const previousSharePct = sharePct(previousCount, previousTotal);
    const ready = recentTotal >= 10 && previousTotal >= 10;
    return {
      id: sector.id,
      label: sector.label,
      icon: sector.icon,
      color: sector.color,
      finvizFilter: sector.finvizFilter,
      momentum7d: {
        ready,
        recentCount,
        previousCount,
        recentArticles: recentTotal,
        previousArticles: previousTotal,
        recentSharePct,
        previousSharePct,
        changePp: ready ? Math.round((recentSharePct - previousSharePct) * 10) / 10 : null
      },
      articles: rows
    };
  });
}
