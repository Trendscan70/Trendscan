(() => {
  const directory = document.getElementById('companyDirectory');
  const regionSelect = document.getElementById('companyRegion');
  const count = document.getElementById('companyCount');
  if (!directory || !regionSelect || !count) return;

  const escapeHtml = value => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const regionOrder = { italia: 0, europa: 1, usa: 2 };
  const regionNames = { italia: 'Italia', europa: 'Europa', usa: 'Stati Uniti' };
  let data;

  function render() {
    const selectedRegion = regionSelect.value;
    let total = 0;
    directory.innerHTML = data.sectors.map(sector => {
      const companies = sector.companies
        .filter(company => selectedRegion === 'all' || company.region === selectedRegion)
        .sort((a, b) => regionOrder[a.region] - regionOrder[b.region] || a.name.localeCompare(b.name, 'it'))
        .slice(0, Math.min(20, data.maxPerSector || 20));
      if (!companies.length) return '';
      total += companies.length;
      const cards = companies.map(company => {
        let reportUrl = '';
        try {
          const parsed = new URL(company.annualReportUrl);
          if (parsed.protocol === 'https:') reportUrl = parsed.href;
        } catch { /* Il link non viene mostrato se il dato editoriale non è un URL valido. */ }
        return `<article class="company-card">
          <div class="company-card-top"><span class="company-region company-region-${escapeHtml(company.region)}">${escapeHtml(regionNames[company.region] || company.country)}</span><span class="company-country">${escapeHtml(company.country)}</span></div>
          <h3>${escapeHtml(company.name)}</h3>
          <p class="company-ticker">${escapeHtml(company.ticker)}</p>
          <p>${escapeHtml(company.focus)}</p>
          ${reportUrl ? `<a href="${escapeHtml(reportUrl)}" target="_blank" rel="noopener noreferrer">Sito ufficiale: bilanci e documenti ↗</a>` : '<span class="company-source-missing">Fonte ufficiale da aggiornare</span>'}
        </article>`;
      }).join('');
      return `<section id="${escapeHtml(sector.id)}" class="company-sector" aria-labelledby="company-sector-${escapeHtml(sector.id)}">
        <div class="company-sector-heading"><div><span class="company-kicker">SETTORE</span><h2 id="company-sector-${escapeHtml(sector.id)}">${escapeHtml(sector.label)}</h2></div><span class="company-sector-count">${companies.length} ${companies.length === 1 ? 'azienda' : 'aziende'}</span></div>
        <p class="company-criteria"><b>Criteri osservati:</b> ${escapeHtml(sector.criteria)}</p>
        <div class="company-grid">${cards}</div>
      </section>`;
    }).join('');
    count.textContent = `${total} ${total === 1 ? 'azienda' : 'aziende'} · anno di riferimento ${data.fiscalYear} · elenco aggiornato il ${new Date(data.updatedAt + 'T12:00:00Z').toLocaleDateString('it-IT')}`;
    if (!total) directory.innerHTML = '<p class="company-empty">Non ci sono aziende pubblicate per questo filtro geografico.</p>';
    const anchorId = location.hash.slice(1);
    const anchor = anchorId && document.getElementById(anchorId);
    if (anchor) requestAnimationFrame(() => anchor.scrollIntoView());
  }

  fetch('/aziende/companies.json', { cache: 'no-cache' })
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(result => {
      if (!result || !Array.isArray(result.sectors)) throw new Error('formato dei dati non riconosciuto');
      data = result;
      regionSelect.addEventListener('change', render);
      render();
    })
    .catch(error => {
      directory.innerHTML = `<p class="company-error">Non è stato possibile caricare la selezione delle aziende (${escapeHtml(error.message)}). Riprova più tardi.</p>`;
      count.textContent = 'Dati non disponibili';
    });
})();
