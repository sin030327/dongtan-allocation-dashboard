/**
 * VWorld 2D 데이터 API 프록시 — Cloudflare Worker
 *
 * 브라우저(대시보드)는 이 Worker 만 부르고, Worker 가 인증키를 붙여 VWorld 를 대신 호출한다.
 * - 인증키: Worker 비밀값 VWORLD_KEY (코드 · 저장소 · 브라우저에 노출되지 않음)
 * - domain : Worker 변수 VWORLD_DOMAIN — VWorld 인증키 발급 시 등록한 서비스 URL
 * - 허용 레이어 · 허용 출처(Origin) 밖의 요청은 거절해 키가 다른 용도로 쓰이지 않게 한다.
 *
 * GET /data?data=LT_C_UQ111&geomFilter=BOX(...)&attrFilter=...&page=1&size=1000&geometry=true
 */
const VWORLD = 'https://api.vworld.kr/req/data';

const ALLOWED_LAYERS = new Set([
  'LT_C_ADSIDO_INFO', 'LT_C_ADSIGG_INFO', 'LT_C_ADEMD_INFO',      // 행정경계
  'LT_C_UQ111', 'LT_C_UQ112', 'LT_C_UQ113', 'LT_C_UQ114',          // 용도지역
  'LT_C_UD801',                                                     // 개발제한구역
  'LT_C_UPISUQ153', 'LT_C_UPISUQ161',                               // 공간시설 · 지구단위계획구역
  'LT_C_WKMSTRM',                                                   // 하천망
]);
const PASS = ['data', 'geomFilter', 'attrFilter', 'page', 'size', 'geometry', 'columns'];

function allowedOrigin(origin, env) {
  if (!origin) return null;
  const list = (env.ALLOWED_ORIGINS || 'https://sin030327.github.io').split(',').map(s => s.trim());
  if (list.includes(origin)) return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;  // 로컬 개발
  return null;
}

function json(body, status, origin) {
  const h = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600' };
  if (origin) { h['access-control-allow-origin'] = origin; h['vary'] = 'Origin'; }
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: h });
}

/* OSM Overpass 중계 — 공개 서버가 자주 바빠(504) 미러를 차례로 시도하고 결과를 캐시한다.
 * 브라우저 호출(CORS)을 막는 미러도 서버에서는 부를 수 있다. 인증키와 무관.
 * GET /overpass?data=[out:json]... */
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
async function overpass(url, origin) {
  const q = url.searchParams.get('data') || '';
  if (!q.startsWith('[out:json]') || q.length > 4000) return json({ error: 'bad query' }, 400, origin);
  let last = '';
  for (const ep of OVERPASS) {
    try {
      const r = await fetch(`${ep}?data=${encodeURIComponent(q)}`, { cf: { cacheTtl: 86400, cacheEverything: true } });
      if (r.ok) {
        const body = await r.text();
        if (body.trimStart().startsWith('{')) return json(body.replace(/^\s*\{/, `{"_endpoint":${JSON.stringify(ep)},`), 200, origin);
      }
      last = `${ep} ${r.status}`;
    } catch (e) { last = `${ep} ${e.message}`; }
  }
  return json({ error: `overpass unavailable (${last})` }, 502, origin);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = allowedOrigin(req.headers.get('origin'), env);
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: origin ? {
        'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET', 'access-control-max-age': '86400', vary: 'Origin' } : {} });
    }
    if (url.pathname === '/' || url.pathname === '/health') return json({ ok: true, service: 'vworld-proxy' }, 200, origin);
    if (!origin) return json({ error: 'origin not allowed' }, 403, null);
    if (url.pathname === '/overpass') return overpass(url, origin);
    if (url.pathname !== '/data') return json({ error: 'not found' }, 404, origin);
    if (!env.VWORLD_KEY) return json({ error: 'VWORLD_KEY 비밀값이 설정되지 않음' }, 500, origin);

    const layer = url.searchParams.get('data');
    if (!ALLOWED_LAYERS.has(layer)) return json({ error: `layer not allowed: ${layer}` }, 400, origin);
    const q = new URLSearchParams({
      service: 'data', version: '2.0', request: 'GetFeature', format: 'json', crs: 'EPSG:4326',
      key: env.VWORLD_KEY, domain: env.VWORLD_DOMAIN || 'localhost',
    });
    for (const k of PASS) { const v = url.searchParams.get(k); if (v != null) q.set(k, v); }
    if (+q.get('size') > 1000) q.set('size', '1000');

    const r = await fetch(`${VWORLD}?${q}`, { cf: { cacheTtl: 3600, cacheEverything: true } });
    return json(await r.text(), r.status, origin);
  },
};
