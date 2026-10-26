(function () {
  'use strict';

  var LANGUAGES = {
    it: { label: 'Italiano', locale: 'it-IT' },
    en: { label: 'English', target: 'EN-GB', locale: 'en-GB' },
    fr: { label: 'Français', target: 'FR', locale: 'fr-FR' },
    es: { label: 'Español', target: 'ES', locale: 'es-ES' },
    de: { label: 'Deutsch', target: 'DE', locale: 'de-DE' },
    pt: { label: 'Português', target: 'PT-PT', locale: 'pt-PT' },
    zh: { label: '中文', target: 'ZH', locale: 'zh-CN' }
  };
  var MESSAGES = {
    it: { label: 'Lingua del sito', loading: 'Traduzione in corso…', ready: 'Contenuti in italiano', error: 'Traduzione non disponibile.', partial: 'Alcuni testi non sono stati tradotti.', retry: 'Riprova' },
    en: { label: 'Site language', loading: 'Translating…', ready: 'Translation active', error: 'Translation unavailable.', partial: 'Some text could not be translated.', retry: 'Retry' },
    fr: { label: 'Langue du site', loading: 'Traduction en cours…', ready: 'Traduction active', error: 'Traduction indisponible.', partial: 'Certains textes n’ont pas été traduits.', retry: 'Réessayer' },
    es: { label: 'Idioma del sitio', loading: 'Traduciendo…', ready: 'Traducción activa', error: 'Traducción no disponible.', partial: 'Algunos textos no se han traducido.', retry: 'Reintentar' },
    de: { label: 'Seitensprache', loading: 'Übersetzung läuft…', ready: 'Übersetzung aktiv', error: 'Übersetzung nicht verfügbar.', partial: 'Einige Texte konnten nicht übersetzt werden.', retry: 'Erneut versuchen' },
    pt: { label: 'Idioma do site', loading: 'A traduzir…', ready: 'Tradução ativa', error: 'Tradução indisponível.', partial: 'Alguns textos não foram traduzidos.', retry: 'Tentar novamente' },
    zh: { label: '网站语言', loading: '正在翻译…', ready: '翻译已启用', error: '翻译暂不可用。', partial: '部分内容未能翻译。', retry: '重试' }
  };
  var STORAGE_KEY = 'ts-language';
  var CACHE_PREFIX = 'ts-language-cache-v1:';
  var MAX_CACHE_ENTRIES = 1200;
  var LANGUAGE_CODES = Object.keys(LANGUAGES);
  var currentLanguage = readLanguage();
  var revision = 0;
  var busy = false;
  var skippedLongText = false;
  var scheduled = false;
  var textRecords = new Map();
  var attributeRecords = new Map();
  var pending = new Map();
  var caches = Object.create(null);
  var control, select, status, retry;
  var originalTitle = document.title;

  function readLanguage() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      return LANGUAGE_CODES && LANGUAGE_CODES.indexOf(saved) !== -1 ? saved : 'it';
    } catch (error) {
      return 'it';
    }
  }

  function cacheFor(language) {
    if (caches[language]) return caches[language];
    try {
      caches[language] = JSON.parse(localStorage.getItem(CACHE_PREFIX + language) || '{}');
      if (!caches[language] || typeof caches[language] !== 'object' || Array.isArray(caches[language])) {
        caches[language] = {};
      }
    } catch (error) {
      caches[language] = {};
    }
    return caches[language];
  }

  function saveCache(language) {
    var cache = cacheFor(language);
    var keys = Object.keys(cache);
    while (keys.length > MAX_CACHE_ENTRIES) delete cache[keys.shift()];
    try {
      localStorage.setItem(CACHE_PREFIX + language, JSON.stringify(cache));
    } catch (error) {
      caches[language] = {};
    }
  }

  async function requestTranslations(texts, language) {
    var response = await fetch('/.netlify/functions/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_lang: LANGUAGES[language].target, text: texts })
    });
    var body;
    try {
      body = await response.json();
    } catch (error) {
      throw new Error('invalid_translation_response');
    }
    if (!response.ok) throw new Error(body && body.error ? body.error : 'translation_failed');
    if (!body || !Array.isArray(body.translations) || body.translations.length !== texts.length ||
        body.translations.some(function (text) { return typeof text !== 'string'; })) {
      throw new Error('invalid_translation_response');
    }
    return body.translations;
  }

  async function translateValues(values, language) {
    if (language === 'it') return values.slice();
    var cache = cacheFor(language);
    var translated = values.slice();
    var missing = [];
    values.forEach(function (value, index) {
      if (Object.prototype.hasOwnProperty.call(cache, value)) translated[index] = cache[value];
      else missing.push({ index: index, value: value });
    });

    while (missing.length) {
      var batch = [], length = 0;
      while (missing.length && batch.length < 40) {
        var next = missing[0];
        if (batch.length && length + next.value.length > 60000) break;
        batch.push(missing.shift());
        length += next.value.length;
      }
      var results = await requestTranslations(batch.map(function (item) { return item.value; }), language);
      batch.forEach(function (item, index) {
        translated[item.index] = results[index];
        cache[item.value] = results[index];
      });
      saveCache(language);
    }
    return translated;
  }

  function message(key) {
    return MESSAGES[currentLanguage][key];
  }

  function setStatus(key) {
    if (!status) return;
    status.textContent = message(key);
    status.dataset.state = key;
    if (retry) {
      retry.hidden = key !== 'error';
      retry.textContent = message('retry');
    }
  }

  function createControl() {
    control = document.createElement('div');
    control.className = 'ts-language-control';
    control.setAttribute('data-ts-no-translate', '');

    var icon = document.createElement('span');
    icon.textContent = '🌐';
    icon.setAttribute('aria-hidden', 'true');
    control.appendChild(icon);

    select = document.createElement('select');
    select.id = 'ts-language-select';
    select.setAttribute('aria-label', MESSAGES[currentLanguage].label);
    LANGUAGE_CODES.forEach(function (code) {
      var option = document.createElement('option');
      option.value = code;
      option.textContent = LANGUAGES[code].label;
      select.appendChild(option);
    });
    select.value = currentLanguage;
    select.addEventListener('change', function () { setLanguage(select.value, true); });
    control.appendChild(select);

    status = document.createElement('span');
    status.className = 'ts-language-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    control.appendChild(status);

    retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'ts-language-retry';
    retry.addEventListener('click', function () {
      if (currentLanguage === 'it') return;
      setStatus('loading');
      window.dispatchEvent(new CustomEvent('trendscan:languagechange', {
        detail: { language: currentLanguage, locale: LANGUAGES[currentLanguage].locale }
      }));
      translateTitle(currentLanguage, revision);
      scheduleDrain();
    });
    control.appendChild(retry);
    setStatus(currentLanguage === 'it' ? 'ready' : 'loading');

    var mainNav = document.getElementById('mainNav');
    if (mainNav) {
      var actions = document.querySelector('header > div .ml-auto');
      var mobileNav = document.getElementById('mobileNav') || document.querySelector('header > nav > div');
      var desktop = window.matchMedia('(min-width: 1024px)');
      function placeControl() {
        var target = desktop.matches ? actions : mobileNav;
        if (target) target.appendChild(control);
      }
      placeControl();
      if (desktop.addEventListener) desktop.addEventListener('change', placeControl);
      else desktop.addListener(placeControl);
      return;
    }

    var headerContent = document.querySelector('header > div[class*="max-w-"]');
    if (headerContent) headerContent.appendChild(control);
    else document.body.insertBefore(control, document.body.firstChild);
  }

  function excluded(element) {
    return !!element.closest('script,style,noscript,code,pre,textarea,[data-ts-no-translate]');
  }

  function needsTranslation(value) {
    if (!value.trim() || !/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(value)) return false;
    if (value.length > 12000) {
      skippedLongText = true;
      return false;
    }
    return true;
  }

  function enqueueText(node) {
    var parent = node.parentElement;
    if (!parent || excluded(parent)) return;
    var value = node.data;
    var record = textRecords.get(node);

    if (record && (value === record.source || value === record.translated)) {
      if (currentLanguage === 'it' || record.language === currentLanguage && value === record.translated) return;
    } else {
      record = record || { node: node, source: value, translated: null, language: null };
      record.source = value;
      record.translated = null;
      record.language = null;
      textRecords.set(node, record);
    }
    if (currentLanguage !== 'it' && needsTranslation(record.source)) {
      pending.set(record, record);
      scheduleDrain();
    }
  }

  function enqueueAttribute(element, name) {
    if (excluded(element)) return;
    var value = element.getAttribute(name);
    if (value == null) return;
    var records = attributeRecords.get(element);
    if (!records) {
      records = Object.create(null);
      attributeRecords.set(element, records);
    }
    var record = records[name];
    if (record && (value === record.source || value === record.translated)) {
      if (currentLanguage === 'it' || record.language === currentLanguage && value === record.translated) return;
    } else {
      record = records[name] = { element: element, name: name, source: value, translated: null, language: null };
    }
    if (currentLanguage !== 'it' && needsTranslation(record.source)) {
      pending.set(record, record);
      scheduleDrain();
    }
  }

  function scanAttributes(root) {
    var attributes = ['aria-label', 'alt', 'title', 'placeholder'];
    function scan(element) {
      attributes.forEach(function (name) {
        if (element.hasAttribute(name)) enqueueAttribute(element, name);
      });
    }
    scan(root);
    if (root.querySelectorAll) {
      root.querySelectorAll('[aria-label],[alt],[title],[placeholder]').forEach(scan);
    }
  }

  function scanNode(root) {
    if (root.nodeType === Node.TEXT_NODE) {
      enqueueText(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE || excluded(root)) return;
    scanAttributes(root);
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) enqueueText(node);
  }

  function scheduleDrain() {
    if (scheduled || busy || currentLanguage === 'it') return;
    if (!pending.size) {
      setStatus(skippedLongText ? 'partial' : 'ready');
      return;
    }
    scheduled = true;
    window.setTimeout(function () {
      scheduled = false;
      drain();
    }, 80);
  }

  async function drain() {
    if (busy || currentLanguage === 'it' || !pending.size) return;
    busy = true;
    var activeBatch = [];
    var activeRevision = revision;
    setStatus('loading');
    try {
      while (pending.size && currentLanguage !== 'it') {
        activeRevision = revision;
        var language = currentLanguage;
        activeBatch = Array.from(pending.values()).slice(0, 40);
        activeBatch.forEach(function (record) { pending.delete(record); });
        var results = await translateValues(activeBatch.map(function (record) { return record.source; }), language);
        if (activeRevision !== revision || language !== currentLanguage) continue;
        activeBatch.forEach(function (record, index) {
          record.translated = results[index];
          record.language = language;
          if (record.node && record.node.isConnected && record.node.data === record.source) {
            record.node.data = results[index];
          } else if (record.element && record.element.isConnected &&
              record.element.getAttribute(record.name) === record.source) {
            record.element.setAttribute(record.name, results[index]);
          }
        });
      }
      if (currentLanguage !== 'it' && !pending.size) setStatus(skippedLongText ? 'partial' : 'ready');
    } catch (error) {
      if (activeRevision === revision) {
        activeBatch.forEach(function (record) { pending.set(record, record); });
        setStatus('error');
        console.error('Site translation failed', error.message);
      }
    } finally {
      busy = false;
      if (pending.size && currentLanguage !== 'it' && status.dataset.state !== 'error') scheduleDrain();
    }
  }

  function restoreText(record) {
    if (!record.node.isConnected) return;
    if (record.node.data === record.translated) record.node.data = record.source;
    else if (record.node.data !== record.source) record.source = record.node.data;
    record.translated = null;
    record.language = null;
  }

  function restoreAttribute(record) {
    if (!record.element.isConnected) return;
    var value = record.element.getAttribute(record.name);
    if (value === record.translated) record.element.setAttribute(record.name, record.source);
    else if (value !== record.source) record.source = value;
    record.translated = null;
    record.language = null;
  }

  async function translateTitle(language, languageRevision) {
    if (language === 'it') {
      document.title = originalTitle;
      return;
    }
    try {
      var translated = await translateValues([originalTitle], language);
      if (languageRevision === revision && language === currentLanguage) document.title = translated[0];
    } catch (error) {
      if (languageRevision === revision) {
        setStatus('error');
        console.error('Page title translation failed', error.message);
      }
    }
  }

  function setLanguage(language, persist) {
    if (!Object.prototype.hasOwnProperty.call(LANGUAGES, language)) return;
    currentLanguage = language;
    revision++;
    pending.clear();
    if (select) select.value = language;
    if (select) select.setAttribute('aria-label', MESSAGES[language].label);
    document.documentElement.lang = LANGUAGES[language].locale;
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, language); } catch (error) {}
    }

    textRecords.forEach(restoreText);
    attributeRecords.forEach(function (records) {
      Object.keys(records).forEach(function (name) { restoreAttribute(records[name]); });
    });
    window.dispatchEvent(new CustomEvent('trendscan:languagechange', {
      detail: { language: language, locale: LANGUAGES[language].locale }
    }));
    translateTitle(language, revision);

    if (language === 'it') {
      setStatus('ready');
      return;
    }
    skippedLongText = false;
    setStatus('loading');
    scanNode(document.body);
    scheduleDrain();
  }

  createControl();
  document.documentElement.lang = LANGUAGES[currentLanguage].locale;

  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      if (mutation.type === 'characterData') enqueueText(mutation.target);
      else if (mutation.type === 'attributes') enqueueAttribute(mutation.target, mutation.attributeName);
      else mutation.addedNodes.forEach(scanNode);
    });
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['aria-label', 'alt', 'title', 'placeholder']
  });

  window.TrendScanLanguage = {
    getLanguage: function () { return currentLanguage; },
    getLocale: function () { return LANGUAGES[currentLanguage].locale; },
    translateTexts: translateValues,
    reportError: function () { setStatus('error'); }
  };
  window.dispatchEvent(new CustomEvent('trendscan:languagechange', {
    detail: { language: currentLanguage, locale: LANGUAGES[currentLanguage].locale }
  }));
  scanNode(document.body);
  translateTitle(currentLanguage, revision);
  if (currentLanguage !== 'it') scheduleDrain();
})();
