const REPOSITORY = 'Trendscan70/trendscan';
const DATA_BRANCH = 'data';
const DATA_FILES = new Set([
  'articles.json',
  'videos.json',
  'markets.json',
  'radar.json'
]);
const OG_FILES = new Set([
  'og/termometro.png',
  'og/radar.png'
]);

const response = (statusCode, body, contentType = 'application/json') => {
  const headers = {
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff'
  };
  if (statusCode === 200) {
    headers['Cache-Control'] = 'public, max-age=300';
    headers['Netlify-CDN-Cache-Control'] = 'public, s-maxage=300, stale-while-revalidate=60';
  } else {
    headers['Cache-Control'] = 'no-store';
  }

  return { statusCode, headers, body };
};

export const handler = async event => {
  if (event.httpMethod !== 'GET') {
    return response(405, JSON.stringify({ error: 'Method not allowed' }));
  }

  const file = event.queryStringParameters?.file;
  if (typeof file !== 'string' || (!DATA_FILES.has(file) && !OG_FILES.has(file))) {
    return response(400, JSON.stringify({ error: 'Unsupported data file' }));
  }

  const token = process.env.GITHUB_DATA_TOKEN;
  if (!token) {
    console.error('GITHUB_DATA_TOKEN is not configured');
    return response(503, JSON.stringify({ error: 'Data source is not configured' }));
  }

  const path = file.split('/').map(encodeURIComponent).join('/');
  const url = `https://api.github.com/repos/${REPOSITORY}/contents/${path}?ref=${DATA_BRANCH}`;
  const upstream = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github.raw+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'TrendScan-Netlify-Data'
    }
  });

  if (!upstream.ok) {
    console.error(`GitHub data request failed (${upstream.status}) for ${file}`);
    return response(upstream.status === 404 ? 404 : 502, JSON.stringify({ error: 'Data source request failed' }));
  }

  const contentType = file.endsWith('.png') ? 'image/png' : 'application/json; charset=utf-8';
  const body = Buffer.from(await upstream.arrayBuffer()).toString('base64');
  return {
    ...response(200, body, contentType),
    isBase64Encoded: true
  };
};
