/**
 * VWorld 2D 데이터 API 프록시 — Cloudflare Worker
 *
 * 브라우저(대시보드)는 이 Worker 만 부르고, Worker 가 인증키를 붙여 VWorld 를 대신 호출한다.
 * - 인증키: Worker 비밀값 VWORLD_KEY (코드 · 저장소 · 브라우저에 노출되지 않음)
 * - domain : Worker 변수 VWORLD_DOMAIN — VWorld 인증키 발급 시 등록한 서비스 URL
 * - 허용 레이어 · 허용 출처(Origin) 밖의 요청은 거절해 키가 다른 용도로 쓰이지 않게 한다.
 *
 * GET /data?data=LT_C_UQ111&geomFilter=BOX(...)&attrFilter=...&page=1&size=1000&geometry=true
 * GET /overpass?data=[out:json]...
 * GET /diag   — VWorld · Overpass 연결 진단 (키 값은 내보내지 않음)
 */
const VWORLD = ['https://api.vworld.kr/req/data', 'http://api.vworld.kr/req/data'];
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const UA = 'Mozilla/5.0 (compatible; dongtan-allocation-dashboard/1.0; +https://sin030327.github.io/dongtan-allocation-dashboard/)';

const ALLOWED_LAYERS = new Set([
  'LT_C_ADSIDO_INFO', 'LT_C_ADSIGG_INFO', 'LT_C_ADEMD_INFO',      // 행정경계
  'LT_C_UQ111', 'LT_C_UQ112', 'LT_C_UQ113', 'LT_C_UQ114',          // 용도지역
  'LT_C_UD801',                                                     // 개발제한구역
  'LT_C_UPISUQ153', 'LT_C_UPISUQ158', 'LT_C_UPISUQ161',             // 공간시설 · 환경기초시설 · 지구단위계획구역
  'LT_L_MOCTLINK', 'LT_P_MOCTNODE',                                 // 표준노드링크(간선도로 · IC)
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

function json(body, status, origin, cache = true) {
  const h = { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache && status === 200 ? 'public, max-age=3600' : 'no-store' };
  if (origin) { h['access-control-allow-origin'] = origin; h['vary'] = 'Origin'; }
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: h });
}

// VWorld 호출 — https 가 끊기면 http 로 한 번 더. 응답이 JSON 이 아니면 실패로 본다.
async function callVworld(params, env) {
  const domain = env.VWORLD_DOMAIN || 'localhost';
  const q = new URLSearchParams({
    service: 'data', version: '2.0', request: 'GetFeature', format: 'json', crs: 'EPSG:4326',
    key: env.VWORLD_KEY, domain, ...params,
  });
  const attempts = [];
  for (const base of VWORLD) {
    try {
      const r = await fetch(`${base}?${q}`, {
        headers: { 'user-agent': UA, referer: domain.startsWith('http') ? domain : `http://${domain}/`, accept: 'application/json' },
        cf: { cacheTtl: 3600, cacheEverything: true },
      });
      const body = await r.text();
      if (r.ok && body.trimStart().startsWith('{')) return { ok: true, body, attempts };
      attempts.push(`${base.split(':')[0]} HTTP ${r.status} ${body.slice(0, 80).replace(/\s+/g, ' ')}`);
    } catch (e) {
      attempts.push(`${base.split(':')[0]} ${e.message}`);
    }
  }
  return { ok: false, attempts };
}

async function overpass(q) {
  const attempts = [];
  for (const ep of OVERPASS) {
    try {
      const r = await fetch(`${ep}?data=${encodeURIComponent(q)}`, { headers: { 'user-agent': UA }, cf: { cacheTtl: 86400, cacheEverything: true } });
      const body = await r.text();
      if (r.ok && body.trimStart().startsWith('{')) return { ok: true, body: body.replace(/^\s*\{/, `{"_endpoint":${JSON.stringify(ep)},`), attempts };
      attempts.push(`${new URL(ep).host} HTTP ${r.status}`);
    } catch (e) { attempts.push(`${new URL(ep).host} ${e.message}`); }
  }
  return { ok: false, attempts };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = allowedOrigin(req.headers.get('origin'), env);
    const colo = req.cf && req.cf.colo;
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: origin ? {
        'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET', 'access-control-max-age': '86400', vary: 'Origin' } : {} });
    }
    if (url.pathname === '/' || url.pathname === '/health') return json({ ok: true, service: 'vworld-proxy', colo, keySet: !!env.VWORLD_KEY }, 200, origin, false);

    if (url.pathname === '/diag') {   // 연결 진단 — 결과 요약만, 키 값 없음
      const v = env.VWORLD_KEY ? await callVworld({ data: 'LT_C_ADSIGG_INFO', attrFilter: 'sig_cd:=:41370', geomFilter: 'BOX(124,33,132,39)', geometry: 'false', size: '1' }, env) : { ok: false, attempts: ['VWORLD_KEY 없음'] };
      let vstatus = null;
      if (v.ok) { try { vstatus = JSON.parse(v.body).response.status; } catch (e) { vstatus = 'parse error'; } }
      const o = await overpass('[out:json][timeout:25];node["railway"="station"](37.15,127.03,37.17,127.06);out;');
      let egress = '';
      try { egress = (await (await fetch('https://www.cloudflare.com/cdn-cgi/trace')).text()).split(/\r?\n/).filter(l => /^(colo|loc)=/.test(l)).join(' '); } catch (e) { egress = e.message; }
      return json({ colo, egress, domain: env.VWORLD_DOMAIN || 'localhost', vworld: { ok: v.ok, status: vstatus, attempts: v.attempts },
        overpass: { ok: o.ok, attempts: o.attempts } }, 200, origin, false);
    }

    if (!origin) return json({ error: 'origin not allowed' }, 403, null);

    // gimi9 지오코더 중계 — 토큰은 Worker 비밀값 GIMI9_TOKEN (저장소 · 브라우저에 노출하지 않음)
    //   /geocode?q=주소        → 주소 → 좌표
    //   /reverse?x=경도&y=위도  → 좌표 → 주소 · 행정구역
    if (url.pathname === '/geocode' || url.pathname === '/reverse') {
      if (!env.GIMI9_TOKEN) return json({ error: 'GIMI9_TOKEN 비밀값이 설정되지 않음' }, 500, origin);
      const q = new URLSearchParams({ token: env.GIMI9_TOKEN });
      if (url.pathname === '/geocode') {
        const addr = (url.searchParams.get('q') || '').trim();
        if (!addr || addr.length > 200) return json({ error: 'bad q' }, 400, origin);
        q.set('q', addr);
      } else {
        const x = +url.searchParams.get('x'), y = +url.searchParams.get('y');
        if (!(x > 124 && x < 132 && y > 33 && y < 39)) return json({ error: 'x, y 는 대한민국 경위도(WGS84)' }, 400, origin);
        q.set('x', String(x)); q.set('y', String(y));
      }
      const ep = url.pathname === '/geocode' ? 'geocode' : 'reverse_geocode';
      try {
        const r = await fetch(`https://geocode-api.gimi9.com/${ep}?${q}`, { headers: { 'user-agent': UA, accept: 'application/json' } });
        return json(await r.text(), r.status, origin, false);
      } catch (e) {
        return json({ error: `geocoder unavailable: ${e.message}`, colo }, 502, origin);
      }
    }

    if (url.pathname === '/overpass') {
      const q = url.searchParams.get('data') || '';
      if (!q.startsWith('[out:json]') || q.length > 4000) return json({ error: 'bad query' }, 400, origin);
      const o = await overpass(q);
      return o.ok ? json(o.body, 200, origin) : json({ error: 'overpass unavailable', attempts: o.attempts, colo }, 502, origin);
    }

    if (url.pathname !== '/data') return json({ error: 'not found' }, 404, origin);
    if (!env.VWORLD_KEY) return json({ error: 'VWORLD_KEY 비밀값이 설정되지 않음' }, 500, origin);
    const layer = url.searchParams.get('data');
    if (!ALLOWED_LAYERS.has(layer)) return json({ error: `layer not allowed: ${layer}` }, 400, origin);
    const params = {};
    for (const k of PASS) { const v = url.searchParams.get(k); if (v != null) params[k] = v; }
    if (+params.size > 1000) params.size = '1000';
    const v = await callVworld(params, env);
    return v.ok ? json(v.body, 200, origin) : json({ error: 'vworld unavailable', attempts: v.attempts, colo }, 502, origin);
  },
};
