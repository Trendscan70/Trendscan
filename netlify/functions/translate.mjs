const TARGETS = new Set(['EN-GB', 'FR', 'ES', 'DE', 'PT-PT', 'ZH']);
const MAX_TEXTS = 40;
const MAX_TEXT_LENGTH = 12000;
const MAX_TOTAL_LENGTH = 60000;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

export default async function handler(request) {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const origin = request.headers.get('origin');
  let originMatches = false;
  try {
    originMatches = !!origin && new URL(origin).origin === new URL(request.url).origin;
  } catch {
    originMatches = false;
  }
  if (!originMatches) {
    return json(403, { error: 'origin_not_allowed' });
  }

  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) return json(503, { error: 'translation_service_not_configured' });

  const apiUrl = process.env.DEEPL_API_URL ||
    (apiKey.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com');
  if (!['https://api-free.deepl.com', 'https://api.deepl.com'].includes(apiUrl)) {
    return json(503, { error: 'translation_service_configuration_invalid' });
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 100000) return json(413, { error: 'request_too_large' });

  let rawBody;
  let payload;
  try {
    rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).length > 100000) return json(413, { error: 'request_too_large' });
    payload = JSON.parse(rawBody);
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  if (!payload || !TARGETS.has(payload.target_lang) || !Array.isArray(payload.text) ||
      payload.text.length < 1 || payload.text.length > MAX_TEXTS ||
      payload.text.some(value => typeof value !== 'string' || value.length > MAX_TEXT_LENGTH) ||
      payload.text.reduce((total, value) => total + value.length, 0) > MAX_TOTAL_LENGTH) {
    return json(400, { error: 'invalid_translation_request' });
  }

  let upstream;
  try {
    upstream = await fetch(apiUrl + '/v2/translate', {
      method: 'POST',
      headers: {
        'Authorization': 'DeepL-Auth-Key ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: payload.text, target_lang: payload.target_lang }),
      signal: AbortSignal.timeout(20000)
    });
  } catch (error) {
    console.error('DeepL request failed', error.name);
    return json(502, { error: 'translation_service_unavailable' });
  }

  if (!upstream.ok) {
    console.error('DeepL returned an error', {
      status: upstream.status,
      traceId: upstream.headers.get('X-Trace-ID')
    });
    return json(upstream.status === 429 || upstream.status === 456 ? 503 : 502, {
      error: upstream.status === 456 ? 'translation_quota_exceeded' : 'translation_failed'
    });
  }

  let result;
  try {
    result = await upstream.json();
  } catch {
    return json(502, { error: 'invalid_translation_response' });
  }

  if (!Array.isArray(result.translations) ||
      result.translations.length !== payload.text.length ||
      result.translations.some(item => typeof item.text !== 'string')) {
    return json(502, { error: 'invalid_translation_response' });
  }

  return json(200, { translations: result.translations.map(item => item.text) });
}
