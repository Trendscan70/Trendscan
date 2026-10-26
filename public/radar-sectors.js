(function () {
  if (!window.state) return;

  const FINVIZ_STYLE_SECTORS = {
    'Banche & Finanza': ['banca', 'banche', 'credito', 'mutuo', 'assicur', 'finanza', 'spread', 'tasso', 'tassi', 'mercato', 'borsa', 'obblig', 'bond', 'prestito'],
    'Tecnologia': ['ai', 'intelligenza artificiale', 'chip', 'semiconduttore', 'software', 'cloud', 'cyber', 'data center', 'software house', 'telefonia', 'nvidia', 'openai'],
    'Energia': ['energia', 'petrolio', 'gas', 'elettricita', 'oleodotto', 'ricarica', 'caro energia', 'rinnovabili', 'solare', 'eolico'],
    'Salute': ['farmaci', 'sanita', 'salute', 'medicina', 'farmaceut', 'ospedale', 'vaccino', 'salute mentale'],
    'Industria': ['industria', 'manifattura', 'automotive', 'trasporti', 'logistica', 'costruzioni', 'macchinari', 'produttori'],
    'Immobiliare': ['immobiliare', 'casa', 'mutuo', 'affitto', 'edilizia', 'proprieta', 'alloggi', 'locazioni'],
    'Consumi': ['consumi', 'retail', 'supermerc', 'e-commerce', 'brand', 'shopping', 'vendita', 'amazon', 'consumer'],
    'Materiali': ['oro', 'argento', 'rame', 'litio', 'terra rara', 'terres', 'metalli', 'materie prime', 'mineria', 'commodity'],
    'Utilities': ['acqua', 'servizi', 'utility', 'gpl', 'gas', 'rete', 'pagamenti digitali'],
    'Altro': []
  };

  const normalizeSectorText = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

  function inferSectorFromNews(text) {
    const norm = normalizeSectorText(text);
    let picked = 'Altro';
    let best = 0;

    Object.entries(FINVIZ_STYLE_SECTORS).forEach(([sector, keywords]) => {
      if (!keywords.length) return;
      let score = 0;
      keywords.forEach(keyword => {
        const clean = normalizeSectorText(keyword);
        if (norm.includes(clean)) score += clean.length > 5 ? 2 : 1;
      });
      if (score > best) {
        best = score;
        picked = sector;
      }
    });

    return picked;
  }

  function buildSectorRadarData() {
    const now = Date.now();
    const recentWindowMs = 7 * 24 * 60 * 60 * 1000;
    const map = new Map();

    (window.state.articles || []).forEach(article => {
      if (!article || !article.publishedAt) return;
      const sector = inferSectorFromNews(`${article.title} ${article.summary} ${article.category}`);
      const row = map.get(sector) || { sector, mentions: 0, recent: 0, previous: 0, sources: new Set(), titles: [] };
      row.mentions += 1;
      row.sources.add(article.source || 'Fonte sconosciuta');
      row.titles.push({ title: article.title, source: article.source || 'Fonte sconosciuta', publishedAt: article.publishedAt, url: article.url });

      const time = Date.parse(article.publishedAt);
      if (!Number.isNaN(time)) {
        if (now - time <= recentWindowMs) row.recent += 1;
        else row.previous += 1;
      }

      map.set(sector, row);
    });

    return [...map.values()].map(row => {
      const delta = row.previous ? ((row.recent - row.previous) / row.previous) * 100 : (row.recent > 0 ? 100 : 0);
      return {
        sector: row.sector,
        mentions: row.mentions,
        recent: row.recent,
        previous: row.previous,
        delta,
        sources: [...row.sources].slice(0, 3),
        titles: row.titles.slice(0, 3)
      };
    }).filter(row => row.mentions > 0).sort((a, b) => b.mentions - a.mentions || b.delta - a.delta);
  }

  function sectorRadarHtml() {
    const data = buildSectorRadarData();
    const selected = window.state.radarSectorFilter || 'Tutti';
    const filtered = selected === 'Tutti' ? data : data.filter(item => item.sector === selected);
    const items = filtered.slice(0, 5);
    const max = Math.max(...items.map(item => item.mentions), 1);
    const buttonLabels = ['Tutti', ...Object.keys(FINVIZ_STYLE_SECTORS).filter(sector => sector !== 'Altro')];

    return `
      <div class="rd-board" aria-labelledby="rdSectorTitle">
        <h3 id="rdSectorTitle" class="rd-h3">Settori economici più discussi</h3>
        <p class="mk-lead">Classificazione ispirata ai filtri di <a href="https://finviz.com/" target="_blank" rel="noopener noreferrer" class="underline font-bold brand-text">Finviz.com</a>, ma le notizie sono sempre quelle pubblicate dalle testate citate. I settori servono come filtro di lettura del contesto, non come consiglio di investimento.</p>
        <div class="rd-sector-controls" role="group" aria-label="Filtra settori">
          ${buttonLabels.map(label => `<button type="button" class="rd-sector-btn ${selected === label ? 'on' : ''}" data-rd-sector="${label}">${label}</button>`).join('')}
        </div>
        ${items.length ? `
          <div class="rd-sector-chart">
            ${items.map(item => {
              const width = Math.max(12, (item.mentions / max) * 100);
              const delta = Number(item.delta || 0);
              const deltaClass = delta >= 0 ? 'mk-up' : 'mk-down';
              const text = `${delta >= 0 ? '+' : ''}${Math.round(delta)}%`;
              return `
                <div class="rd-sector-row">
                  <div class="rd-sector-meta">
                    <div class="rd-sector-name">${item.sector}</div>
                    <div class="rd-sector-sources">${item.sources.join(', ')}</div>
                  </div>
                  <div class="rd-sector-bar-wrap"><div class="rd-sector-bar ${delta >= 0 ? 'up' : 'down'}" style="width:${width}%"></div></div>
                  <div class="rd-sector-value ${deltaClass}">${text}</div>
                </div>
              `;
            }).join('')}
          </div>
          <div class="rd-sector-footnote">Dati aggregati dalle notizie raccolte da TrendScan. Il grafico mostra quante volte un settore viene citato nei titoli e nelle anteprime delle testate che seguiamo, sempre attribuendo la fonte originale.</div>
        ` : `<p class="rd-empty">Nessun settore rilevabile al momento con i dati disponibili.</p>`}
      </div>
    `;
  }

  function injectSectorRadar() {
    if (!window.state || !document.getElementById('marketsView')) return;
    const root = document.getElementById('marketsView');
    if (!root) return;

    root.querySelectorAll('[data-sector-radar-root]').forEach(node => node.remove());
    const wrap = document.createElement('div');
    wrap.setAttribute('data-sector-radar-root', '1');
    wrap.innerHTML = sectorRadarHtml();
    root.appendChild(wrap);
  }

  const originalRenderMarketsView = window.renderMarketsView;
  if (typeof originalRenderMarketsView === 'function') {
    window.renderMarketsView = function () {
      const out = originalRenderMarketsView.apply(this, arguments);
      setTimeout(injectSectorRadar, 0);
      return out;
    };
  }

  document.addEventListener('click', function (event) {
    const btn = event.target.closest('[data-rd-sector]');
    if (!btn) return;
    window.state.radarSectorFilter = btn.dataset.rdSector || 'Tutti';
    if (typeof window.renderMarketsView === 'function') {
      window.renderMarketsView();
    }
  });

  window.state.radarSectorFilter = window.state.radarSectorFilter || 'Tutti';
  setTimeout(injectSectorRadar, 150);
})();
