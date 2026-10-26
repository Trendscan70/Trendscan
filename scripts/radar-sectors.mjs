const DAY = 86400e3;
const norm = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function buildSectorRows(articles, sectors, now = Date.now()) {
  const cutoff = now - 30 * DAY;
  const usable = articles.filter(article => {
    const publishedAt = Date.parse(article.publishedAt);
    return article.title && /^https?:\/\//i.test(article.url || '')
      && Number.isFinite(publishedAt) && publishedAt >= cutoff && publishedAt <= now + 3600e3;
  });

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
    return {
      id: sector.id,
      label: sector.label,
      icon: sector.icon,
      color: sector.color,
      finvizFilter: sector.finvizFilter,
      articles: rows
    };
  });
}
