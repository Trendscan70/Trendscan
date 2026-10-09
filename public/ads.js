// TrendScan – predisposizione pubblicità (Google AdSense). DISATTIVATA di default: non carica nulla.
// Per attivarla servono: account AdSense approvato, dominio proprio, banner cookie con CMP certificata Google (TCF)
// e informativa privacy/cookie. Vedi README ("Pubblicità e guadagni").
window.TRENDSCAN_ADS = window.TRENDSCAN_ADS || {
  enabled: false,                 // metti true solo quando tutto sopra è pronto
  client: '',                     // es. 'ca-pub-1234567890123456'
  slots: { 'home-1': '', 'articoli-1': '' }   // ID degli annunci creati in AdSense
};
(function () {
  const cfg = window.TRENDSCAN_ADS;
  if (!cfg.enabled || !/^ca-pub-\d+$/.test(cfg.client || '')) return;
  let started = false;
  function start() {
    if (started) return; started = true;
    const s = document.createElement('script');
    s.async = true; s.crossOrigin = 'anonymous';
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(cfg.client);
    document.head.appendChild(s);
    document.querySelectorAll('.ad-slot[data-ad-slot]').forEach(el => {
      const id = cfg.slots[el.dataset.adSlot];
      if (!/^\d+$/.test(id || '')) return;
      el.innerHTML = '';
      const ins = document.createElement('ins');
      ins.className = 'adsbygoogle'; ins.style.display = 'block';
      ins.setAttribute('data-ad-client', cfg.client); ins.setAttribute('data-ad-slot', id);
      ins.setAttribute('data-ad-format', 'auto'); ins.setAttribute('data-full-width-responsive', 'true');
      el.appendChild(ins); el.classList.remove('hidden');
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
    });
  }
  // Gli annunci partono SOLO dopo il consenso dato nel banner cookie (la CMP deve emettere questo evento).
  if (window.TRENDSCAN_ADS_CONSENT === true) start();
  document.addEventListener('trendscan:ads-consent', start);
})();
