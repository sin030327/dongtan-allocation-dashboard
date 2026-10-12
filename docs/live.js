/* 전국 대상지 실시간 분석 엔진 — code/04~07 파이프라인을 브라우저로 옮김
 *
 * 자료: VWorld 2D 데이터 API(프록시 경유 — 인증키는 프록시 비밀값) · AWS Terrain Tiles(DEM) · OSM Overpass
 * 격자: 웹 메르카토르(EPSG:3857) 축에 맞춘 지상 90m 셀(0.81ha) — 지도 이미지와 셀이 정확히 겹친다.
 * 규칙: 임계값 · 판정 · 배분 · 채점은 파이썬 스크립트와 같은 값(approved_weights.json)을 쓴다.
 */
window.Live = (() => {
  const CELL = 90, CELL_HA = 0.81, R = 6378137;
  const SLOPE_TH = [['하한 10%', 10], ['기준안 15%', 15], ['상한 25%', 25]];
  const ASP = [135, 225], FLAT = 2.0, ELEV_MARGIN = 50;
  const MAX_KM2 = 1000;
  const KOREA_BOX = 'BOX(124,33,132,39)';
  const TILE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
  const ZONE = {주거: 1, 상업: 2, 공업: 3, 녹지: 4, 관리: 5, 농림: 6, 자연환경보전: 7};
  const ZONE_NAMES = Object.keys(ZONE);

  const proxy = () => (window.PROXY_URL || '').replace(/\/$/, '') ||
    (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:8787' : '');
  const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const r1 = v => Math.round(v * 10) / 10;
  const merc = (lon, lat) => [R * lon * Math.PI / 180, R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))];
  const unmerc = (x, y) => [x / R * 180 / Math.PI, (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI];
  const mean = (arr) => arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : NaN;

  // ---------------- VWorld (프록시)
  async function vworld(layer, params, log, maxPages = 30) {
    const base = proxy();
    if (!base) throw new Error('PROXY');
    let feats = [], page = 1, total = 0;
    while (true) {
      const q = new URLSearchParams({data: layer, size: 1000, page, geometry: 'true', ...params});
      const url = `${base}/data?${q}`;
      const res = await fetch(url, {signal: AbortSignal.timeout(90000)});   // 네트워크가 끊겨도 멈춰 있지 않게
      const j = await res.json();
      const r = j.response || {};
      if (page === 1 && log) log.push({layer, request_url_without_key: url, key_env: 'Worker 비밀값 VWORLD_KEY', queried_on: today(),
        status: r.status || `HTTP ${res.status}`, record_total: r.record ? +r.record.total : 0, note: r.error ? `${r.error.code} ${r.error.text}` : ''});
      if (r.status === 'NOT_FOUND') return feats;
      if (r.status !== 'OK') throw new Error(`VWorld ${layer}: ${r.error ? r.error.code + ' ' + r.error.text : (j.error || res.status)}`);
      total = +r.record.total;
      feats = feats.concat(r.result.featureCollection.features);
      if (page >= +r.page.total || page >= maxPages) return feats;
      page++;
    }
  }

  async function search(q) {
    q = q.trim();
    if (!q) return [];
    const [sig, emd] = await Promise.all([
      vworld('LT_C_ADSIGG_INFO', {attrFilter: `sig_kor_nm:like:${q}`, geomFilter: KOREA_BOX, geometry: 'false', size: 20}, null, 1),
      vworld('LT_C_ADEMD_INFO', {attrFilter: `emd_kor_nm:like:${q}`, geomFilter: KOREA_BOX, geometry: 'false', size: 20}, null, 1),
    ]);
    return [
      ...sig.map(f => ({level: '시군구', layer: 'LT_C_ADSIGG_INFO', attr: `sig_cd:=:${f.properties.sig_cd}`, code: f.properties.sig_cd, name: f.properties.full_nm})),
      ...emd.map(f => ({level: '읍면동', layer: 'LT_C_ADEMD_INFO', attr: `emd_cd:=:${f.properties.emd_cd}`, code: f.properties.emd_cd, name: f.properties.full_nm})),
    ];
  }

  // ---------------- 격자
  function eachCoord(geom, fn) {
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
    polys.forEach(p => p.forEach(ring => ring.forEach(c => fn(c))));
  }
  function bboxOf(geom) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    eachCoord(geom, ([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
    return [x0, y0, x1, y1];
  }
  function makeGrid(geom, padM = 1500) {
    const [lx0, ly0, lx1, ly1] = bboxOf(geom);
    const k = Math.cos((ly0 + ly1) / 2 * Math.PI / 180);
    const c = CELL / k, pad = padM / k;
    const [mx0, my0] = merc(lx0, ly0), [mx1, my1] = merc(lx1, ly1);
    const x0 = Math.floor((mx0 - pad) / c) * c, y1 = Math.ceil((my1 + pad) / c) * c;
    const nx = Math.ceil((mx1 + pad - x0) / c), ny = Math.ceil((y1 - (my0 - pad)) / c);
    const [w, s] = unmerc(x0, y1 - ny * c), [e, n] = unmerc(x0 + nx * c, y1);
    return {x0, y1, c, nx, ny, n: nx * ny, k, bbox: [w, s, e, n],
      xy: (i, j) => [x0 + (j + .5) * c, y1 - (i + .5) * c]};
  }
  function canvas(g) {
    const cv = document.createElement('canvas'); cv.width = g.nx; cv.height = g.ny;
    const ctx = cv.getContext('2d', {willReadFrequently: true});
    return [cv, ctx];
  }
  function toPx(g, lon, lat) { const [x, y] = merc(lon, lat); return [(x - g.x0) / g.c, (g.y1 - y) / g.c]; }
  function readMask(g, ctx) {
    const d = ctx.getImageData(0, 0, g.nx, g.ny).data, m = new Uint8Array(g.n);
    for (let p = 0; p < g.n; p++) m[p] = d[p * 4 + 3] >= 128 ? 1 : 0;
    return m;
  }
  function fillGeoms(g, geoms) {
    const [, ctx] = canvas(g);
    ctx.fillStyle = '#000';
    for (const geom of geoms) {
      const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
      for (const poly of polys) {
        ctx.beginPath();
        for (const ring of poly) ring.forEach(([lon, lat], i) => { const [px, py] = toPx(g, lon, lat); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
        ctx.fill('evenodd');
      }
    }
    return readMask(g, ctx);
  }
  function strokeLines(g, lines) {
    const [, ctx] = canvas(g);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    for (const ln of lines) {
      ctx.beginPath();
      ln.forEach(([lon, lat], i) => { const [px, py] = toPx(g, lon, lat); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.stroke();
    }
    return readMask(g, ctx);
  }

  // 유클리드 거리 변환(Felzenszwalb) — 특징 셀까지 거리(m)
  function edt(g, mask) {
    const INF = 1e20, f = new Float64Array(g.n);
    let any = false;
    for (let p = 0; p < g.n; p++) { f[p] = mask[p] ? 0 : INF; if (mask[p]) any = true; }
    if (!any) return new Float64Array(g.n).fill(Infinity);
    const dt1 = (src, n, out, v, z) => {
      let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
      for (let q = 1; q < n; q++) {
        let s;
        while (true) { s = ((src[q] + q * q) - (src[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); if (s <= z[k]) k--; else break; }
        k++; v[k] = q; z[k] = s; z[k + 1] = INF;
      }
      k = 0;
      for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; out[q] = (q - v[k]) * (q - v[k]) + src[v[k]]; }
    };
    const N = Math.max(g.nx, g.ny), src = new Float64Array(N), out = new Float64Array(N), v = new Int32Array(N), z = new Float64Array(N + 1);
    for (let j = 0; j < g.nx; j++) { for (let i = 0; i < g.ny; i++) src[i] = f[i * g.nx + j]; dt1(src, g.ny, out, v, z); for (let i = 0; i < g.ny; i++) f[i * g.nx + j] = out[i]; }
    for (let i = 0; i < g.ny; i++) { for (let j = 0; j < g.nx; j++) src[j] = f[i * g.nx + j]; dt1(src, g.nx, out, v, z); for (let j = 0; j < g.nx; j++) f[i * g.nx + j] = out[j]; }
    for (let p = 0; p < g.n; p++) f[p] = Math.sqrt(f[p]) * CELL;
    return f;
  }
  function distPoints(g, pts) {   // 점까지 거리는 격자 밖 점도 정확히
    const d = new Float64Array(g.n).fill(Infinity);
    const P = pts.map(p => merc(p.lon, p.lat));
    for (let i = 0; i < g.ny; i++) for (let j = 0; j < g.nx; j++) {
      const [x, y] = g.xy(i, j); let best = Infinity;
      for (const [px, py] of P) { const dd = Math.hypot(px - x, py - y) * g.k; if (dd < best) best = dd; }
      d[i * g.nx + j] = best;
    }
    return d;
  }

  // ---------------- DEM
  async function dem(g, note, maxTiles = 64) {
    const [w, s, e, n] = g.bbox;
    const tile = (lon, lat, z) => { const t = 2 ** z; return [(lon + 180) / 360 * t, (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * t]; };
    let z = 13;
    const count = z => { const [ax, ay] = tile(w, n, z), [bx, by] = tile(e, s, z); return (Math.floor(bx) - Math.floor(ax) + 1) * (Math.floor(by) - Math.floor(ay) + 1); };
    while (count(z) > maxTiles && z > 10) z--;
    const [ax, ay] = tile(w, n, z), [bx, by] = tile(e, s, z);
    const tx0 = Math.floor(ax), ty0 = Math.floor(ay), tx1 = Math.floor(bx), ty1 = Math.floor(by);
    const tiles = new Map(), jobs = [];
    for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) jobs.push([tx, ty]);
    let done = 0;
    const worker = async () => {
      while (jobs.length) {
        const [tx, ty] = jobs.shift();
        const res = await fetch(TILE.replace('{z}', z).replace('{x}', tx).replace('{y}', ty), {signal: AbortSignal.timeout(60000)});
        const bmp = await createImageBitmap(await res.blob());
        const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
        const ctx = cv.getContext('2d', {willReadFrequently: true}); ctx.drawImage(bmp, 0, 0);
        const d = ctx.getImageData(0, 0, 256, 256).data, h = new Float32Array(65536);
        for (let p = 0; p < 65536; p++) h[p] = d[p * 4] * 256 + d[p * 4 + 1] + d[p * 4 + 2] / 256 - 32768;
        tiles.set(`${tx},${ty}`, h);
        note(`DEM 타일 ${++done}/${(tx1 - tx0 + 1) * (ty1 - ty0 + 1)}`);
      }
    };
    await Promise.all(Array.from({length: 8}, worker));
    const sample = (lon, lat) => {
      const [fx, fy] = tile(lon, lat, z);
      const tx = Math.floor(fx), ty = Math.floor(fy), h = tiles.get(`${tx},${ty}`);
      if (!h) return NaN;
      const px = Math.min(255, Math.floor((fx - tx) * 256)), py = Math.min(255, Math.floor((fy - ty) * 256));
      return h[py * 256 + px];
    };
    // 셀 평균 — 셀 안 3×3 표본
    const E = new Float64Array(g.n);
    for (let i = 0; i < g.ny; i++) for (let j = 0; j < g.nx; j++) {
      const [x, y] = g.xy(i, j); let s = 0, c = 0;
      for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
        const [lon, lat] = unmerc(x + dx * g.c / 3, y + dy * g.c / 3); const v = sample(lon, lat);
        if (!isNaN(v)) { s += v; c++; }
      }
      E[i * g.nx + j] = c ? s / c : NaN;
    }
    // 경사·향 (Horn 3×3), 향 = 내리막 방향 · 북 0° 시계방향
    const S = new Float64Array(g.n), A = new Float64Array(g.n);
    const at = (i, j) => E[Math.min(g.ny - 1, Math.max(0, i)) * g.nx + Math.min(g.nx - 1, Math.max(0, j))];
    for (let i = 0; i < g.ny; i++) for (let j = 0; j < g.nx; j++) {
      const a = at(i - 1, j - 1), b = at(i - 1, j), c = at(i - 1, j + 1), d = at(i, j - 1), f = at(i, j + 1), gg = at(i + 1, j - 1), h = at(i + 1, j), ii = at(i + 1, j + 1);
      const dzdx = ((c + 2 * f + ii) - (a + 2 * d + gg)) / (8 * CELL);
      const dzdy = ((gg + 2 * h + ii) - (a + 2 * b + c)) / (8 * CELL);
      S[i * g.nx + j] = 100 * Math.hypot(dzdx, dzdy);
      A[i * g.nx + j] = ((Math.atan2(-dzdx, dzdy) * 180 / Math.PI) + 360) % 360;
    }
    return {E, S, A, z, tiles: (tx1 - tx0 + 1) * (ty1 - ty0 + 1)};
  }

  // ---------------- 접근성 자료 — 공식 자료(VWorld) 우선
  // 간선도로: 국토부 표준노드링크 LT_L_MOCTLINK (시·군도 제외 도로등급)
  // IC·JC  : 표준노드 LT_P_MOCTNODE 중 연결로접속부, 이름에 IC·JC·나들목·분기점
  // 하수처리: 도시계획시설 환경기초시설 LT_C_UPISUQ158 중 하수·폐수종말처리시설
  // 철도역  : VWorld 에 없음 — OSM 전국 역 목록을 한 번 받아 둔 정적 파일(stations_kr.json)
  const ARTERIAL_RANKS = ['고속국도', '도시고속국도', '일반국도', '특별·광역시도', '국가지원지방도', '지방도'];
  let STATIONS = null;
  async function access(g, boxStr, log) {
    const lines = [];
    for (const rank of ARTERIAL_RANKS) {
      const f = await vworld('LT_L_MOCTLINK', {geomFilter: boxStr, attrFilter: `rd_rank_h:=:${rank}`}, log);
      for (const x of f) {
        const gm = x.geometry; if (!gm) continue;
        if (gm.type === 'LineString') lines.push(gm.coordinates);
        else if (gm.type === 'MultiLineString') gm.coordinates.forEach(c => lines.push(c));
      }
    }
    const nodes = await vworld('LT_P_MOCTNODE', {geomFilter: boxStr, attrFilter: 'nd_type_h:=:연결로접속부'}, log);
    const icMap = new Map();
    for (const x of nodes) {
      const nm = String(x.properties.node_name || '').trim();
      if (!/(IC|JC|나들목|분기점)/.test(nm) || /(앞|입구|교차로)$/.test(nm)) continue;
      const base = nm.replace(/\s*\(.*\)\s*$/, '');
      const c = x.geometry && x.geometry.coordinates; if (!c) continue;
      const pt = Array.isArray(c[0]) ? c[0] : c;
      const e = icMap.get(base) || {name: base, lon: 0, lat: 0, n: 0};
      e.lon += pt[0]; e.lat += pt[1]; e.n++; icMap.set(base, e);
    }
    const ic = [...icMap.values()].map(e => ({name: e.name, lon: e.lon / e.n, lat: e.lat / e.n}));
    const env = await vworld('LT_C_UPISUQ158', {geomFilter: boxStr}, log);
    const ww = [];
    for (const x of env) {
      const m = x.properties.mls_nam || '';
      if (!/(하수종말처리|폐수종말처리)/.test(m)) continue;
      let sx = 0, sy = 0, n = 0; eachCoord(x.geometry, ([lon, lat]) => { sx += lon; sy += lat; n++; });
      if (n) ww.push({name: m, lon: sx / n, lat: sy / n});
    }
    if (!STATIONS) STATIONS = await (await fetch('stations_kr.json')).json();
    const [w, s, e, n] = g.bbox, pad = 0.2;
    const st = STATIONS.stations.filter(([, lon, lat]) => lon > w - pad && lon < e + pad && lat > s - pad && lat < n + pad)
      .map(([name, lon, lat]) => ({name: (name || '').replace(/역$/, '') + '역', lon, lat}));
    log.push({layer: '철도역 (OSM 전국 목록)', request_url_without_key: STATIONS.endpoint, key_env: '—', queried_on: STATIONS.queried_on, status: 'OK',
      record_total: st.length, note: `OSM 기준시각 ${STATIONS.osm_base || ''} · ODbL 1.0`});
    return {roads: lines, ic, st, ww, base: STATIONS.osm_base};
  }

  // ---------------- 보조
  function largestPatch(g, m) {
    const seen = new Uint8Array(g.n); let best = 0;
    for (let p = 0; p < g.n; p++) {
      if (!m[p] || seen[p]) continue;
      let n = 0; const st = [p]; seen[p] = 1;
      while (st.length) {
        const q = st.pop(); n++;
        const i = Math.floor(q / g.nx), j = q % g.nx;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= g.ny || jj >= g.nx) continue;
          const r = ii * g.nx + jj; if (m[r] && !seen[r]) { seen[r] = 1; st.push(r); }
        }
      }
      best = Math.max(best, n);
    }
    return best * CELL_HA;
  }
  function outline(g, m) {   // 셀 경계선 → MultiLineString (지도 표시용)
    const segs = [];
    const ll = (x, y) => unmerc(x, y);
    for (let i = 0; i < g.ny; i++) for (let j = 0; j < g.nx; j++) {
      if (!m[i * g.nx + j]) continue;
      const x = g.x0 + j * g.c, y = g.y1 - i * g.c;
      const nb = (ii, jj) => ii >= 0 && jj >= 0 && ii < g.ny && jj < g.nx && m[ii * g.nx + jj];
      if (!nb(i - 1, j)) segs.push([ll(x, y), ll(x + g.c, y)]);
      if (!nb(i + 1, j)) segs.push([ll(x, y - g.c), ll(x + g.c, y - g.c)]);
      if (!nb(i, j - 1)) segs.push([ll(x, y), ll(x, y - g.c)]);
      if (!nb(i, j + 1)) segs.push([ll(x + g.c, y), ll(x + g.c, y - g.c)]);
    }
    return {type: 'MultiLineString', coordinates: segs};
  }
  const idx = m => { const out = []; for (let p = 0; p < m.length; p++) if (m[p]) out.push(p); return out; };

  // ---------------- 4축 표 (code/05_four_axis_table.py 와 같은 판정)
  function fourAxis(P) {
    const j = (ok, part) => ok ? '○' : (part ? '△' : '×');
    const f0 = (v) => Math.round(v).toLocaleString('en-US');
    const rows = [];
    const add = (use, axis, req, crit, src, fn) => {
      const [a, ja] = fn(P.A), [b, jb] = fn(P.B);
      rows.push({'용도': use, '축': axis, '요건 문장': req, '수치 기준': crit, '근거': src, '후보지 A 값': a, 'A 판정': ja, '후보지 B 값': b, 'B 판정': jb});
    };
    add('녹지', '지형', '경사 25% 초과 산지와 재난위험지대 같은 시가화 부적당지는 녹지로 먼저 확정한다', '경사 > 25% 셀 → 녹지 선확정', '원본 13·14번',
      p => [`25% 초과 ${p.s25}% (${Math.round(p.s25 * p.area / 100)}ha)`, '○']);
    add('녹지', '접근성', '녹지는 근린주구 생활권 안의 일상 이용 거리에 둔다', '생활권공원 유치거리 250·500·1,000m', '원본 13·14번 · 도시공원법 시행규칙 별표 3',
      p => [`기존 주거지역까지 평균 ${f0(p.res)}m`, j(p.res <= 500, p.res <= 1000)]);
    add('녹지', '주변환경', '풍치·산림 보전 대상과 위험시설 완충이 필요한 땅을 보전·완충녹지로 둔다', '농림지역·보전관리지역 면적', '원본 13·14번 · 국토계획법 제36조',
      p => [`농림 ${Math.round(p.farm)}ha · 관리 ${Math.round(p.mgmt)}ha`, '○']);
    add('녹지', '기반시설', '녹지체계 위계(환상·방사·격자·분산)에 맞도록 기결정 공원·녹지와 잇는다', '기결정 공원·녹지시설 연접', '원본 13·14번 · 도시공원법 제35조',
      p => [`기결정 공원·녹지 ${p.park.toFixed(1)}ha 포함`, j(p.park >= 20, p.park > 0)]);
    add('상업업무', '지형', '유통·상업시설은 경사 5% 이하 평지에 둔다', '경사 ≤ 5% 셀 비율', '원본 17번',
      p => [`5% 이하 ${p.s5}% (최대 연속 ${p.flat.toFixed(1)}ha)`, j(p.s5 >= 30, p.flat >= 5)]);
    add('상업업무', '접근성', '근린상업은 주거지에 인접하고, 일반상업은 간선 교차점이나 교통결절에 둔다', '간선도로 ≤ 500m · 철도역 ≤ 1km', '원본 15~17번',
      p => [`간선 ${f0(p.art)}m · 역 ${f0(p.st)}m`, j(p.art <= 500 && p.st <= 1000, p.art <= 800)]);
    add('상업업무', '주변환경', '근린상업은 녹지와 이어 쾌적성을 유지하고, 유통상업은 인접지 환경을 보전한다', '녹지 연계 가능(기결정 공원·녹지 연접)', '원본 17번',
      p => [`기결정 공원·녹지 ${p.park.toFixed(1)}ha`, j(p.park >= 20, p.park > 0)]);
    add('상업업무', '기반시설', '근린상업은 3~5만 명 배후인구와 물류망을 확보한다', '기존 시가지 300m 이내 셀 비율', '원본 16·17번',
      p => [`시가지 인접 ${p.urb}%`, j(p.urb >= 50, p.urb >= 20)]);
    add('주거', '지형', '주거지는 경사 4~10%를 바람직한 범위로, 25%를 개발 한계로 두고 표고는 기반시설 +50m 이내로 한다', '경사 ≤ 10%(바람직) · ≤ 25%(한계) · 표고 ≤ 기준 +50m', '원본 19번',
      p => [`10% 이하 ${p.s10}% · 25% 초과 ${p.s25}% · 평균표고 ${Math.round(p.elev)}m(기준 ${Math.round(p.ref)}+50)`, j(p.s10 >= 50 && p.s25 < 10, p.s25 < 10)]);
    add('주거', '접근성', '주거지는 직장·편익시설에 가깝고 간선도로·휴식공간과 이어진다', '간선도로 ≤ 500m · 기존 주거지 ≤ 500m', '원본 19번',
      p => [`간선 ${f0(p.art)}m · 기존 주거지 ${f0(p.res)}m`, j(p.art <= 500 && p.res <= 500, p.art <= 600)]);
    add('주거', '주변환경', '주거지는 오염원과 떨어진 남경사지에 두고 녹지·수변과 잇는다', '향 135~225° 셀 비율 ≥ 30%', '원본 19번',
      p => [`남향 ${p.south}%`, j(p.south >= 30, p.south >= 15)]);
    add('주거', '기반시설', '주거지는 도로·가스·전기 공급망이 이미 갖춰진 곳에 이어 붙인다', '기존 시가지 300m 이내 셀 비율', '원본 19번',
      p => [`시가지 인접 ${p.urb}%`, j(p.urb >= 50, p.urb >= 20)]);
    add('공업', '지형', '공업지는 경사 5% 이하이고 최소규모 이상인 평탄지에 둔다', '경사 ≤ 5% 연속 ≥ 10ha', '원본 21번',
      p => [`5% 이하 최대 연속 ${p.flat.toFixed(1)}ha`, j(p.flat >= 10, p.flat >= 5)]);
    add('공업', '접근성', '공업지는 화물 수송을 위해 간선교통(IC)에 바로 이어진다', 'IC ≤ 2km', '원본 21번',
      p => [isFinite(p.icMin) ? `IC 최단 ${f0(p.icMin)}m(${p.icName})` : 'IC 없음(조회 범위 내)', j(p.icMin <= 2000)]);
    add('공업', '주변환경', '공업지는 시가지와 떨어뜨리고 완충녹지와 확장 여지를 둔다', '기존 주거지 평균거리 ≥ 500m', '원본 21번 · 시행령 제30조',
      p => [`기존 주거지 ${f0(p.res)}m`, j(p.res >= 500, p.res >= 300)]);
    add('공업', '기반시설', '공업지는 폐수·폐기물 처리가 쉽고 용수·동력을 확보할 수 있는 곳에 둔다', '하수·폐수종말처리시설 ≤ 5km(도시계획시설 기준)', '원본 21번',
      p => [isFinite(p.ww) ? `하수처리시설 ${(p.ww / 1000).toFixed(1)}km` : '하수처리시설 없음(조회 범위 내)', j(p.ww <= 5000)]);
    const pt = {'○': 2, '△': 1, '×': 0};
    const summ = ['녹지', '상업업무', '주거', '공업'].map(use => {
      const d = rows.filter(r => r['용도'] === use);
      const sa = d.reduce((s, r) => s + pt[r['A 판정']], 0), sb = d.reduce((s, r) => s + pt[r['B 판정']], 0);
      return {'용도': use, '후보지 A 점수(8점 만점)': sa, '후보지 B 점수(8점 만점)': sb, '우위': sa > sb ? 'A' : sb > sa ? 'B' : '동률'};
    });
    return {rows, summ};
  }

  // ---------------- 매트릭스 · 역전점 (code/07 과 같은 규칙)
  function score(val, ind) {
    const b = ind.bands;
    let s = 1 + (ind.direction === '+' ? b.filter(x => val >= x).length : b.filter(x => val <= x).length);
    if (ind.id === 'I4' && val < 12) s = 1;
    return s;
  }
  function reversal(INDS, alts) {
    const w0 = INDS.map(i => i.weight);
    const sc = alts.map(a => INDS.map(i => score(a[i.id], i)));
    const tot = sc.map(r => r.reduce((s, x, k) => s + x * w0[k], 0));
    const first = tot.indexOf(Math.max(...tot));
    return INDS.map((ind, k) => {
      const restSum = w0.reduce((s, x, j) => j === k ? s : s + x, 0);
      const T = (t, a) => sc[a].reduce((s, x, j) => s + x * (j === k ? t : w0[j] / restSum * (1 - t)), 0);
      let best = null;
      alts.forEach((_, o) => {
        if (o === first) return;
        const f0 = T(0, first) - T(0, o), f1 = T(1, first) - T(1, o);
        if (f0 === f1) return;
        const t = f0 / (f0 - f1);
        // 끝점(0·1)에서 동점만 되는 경우는 역전이 아님 — 교차 직후 실제로 앞서는지 확인
        const past = t + (t > w0[k] ? 0.001 : -0.001);
        if (t <= 0 || t >= 1 || past < 0 || past > 1 || T(past, o) <= T(past, first)) return;
        if (!best || Math.abs(t - w0[k]) < Math.abs(best[0] - w0[k])) best = [t, o];
      });
      const name = `${ind.criterion} ${ind.name}`;
      if (!best) return {'지표': name, '현재 가중치': w0[k], '역전 가중치': null, '방향': '0~1 전 구간에서 1위 유지', '역전 후 1위': alts[first]['대안'], '여유폭(%p)': null};
      const [t, o] = best, side = t > w0[k] ? '증가' : '감소';
      return {'지표': name, '현재 가중치': w0[k], '역전 가중치': Math.round(t * 1000) / 1000,
        '방향': `${w0[k].toFixed(2)} → ${t.toFixed(3)} (${side})`, '역전 후 1위': alts[o]['대안'],
        '여유폭(%p)': r1(Math.abs(t - w0[k]) * 100)};
    });
  }

  // ---------------- 전체 파이프라인
  async function analyze(item, base, onStep, opt = {}) {
    const maxKm2 = opt.maxKm2 || MAX_KM2, maxTiles = opt.maxTiles || 64;
    const log = [];
    const step = (k, msg) => onStep && onStep(k, msg);
    const W = JSON.parse(JSON.stringify(base.weights));

    step('boundary', `${item.name} 경계`);
    const bf = await vworld(item.layer, {attrFilter: item.attr, geomFilter: KOREA_BOX}, log, 1);
    if (!bf.length) throw new Error('경계를 찾지 못함');
    const geom = bf[0].geometry;
    const g = makeGrid(geom);
    const mask = fillGeoms(g, [geom]);
    const areaKm2 = idx(mask).length * CELL_HA / 100;
    if (areaKm2 > maxKm2) throw new Error(`AREA:${Math.round(areaKm2)}`);
    const boxStr = `BOX(${g.bbox.map(v => v.toFixed(5)).join(',')})`;

    step('dem', 'DEM 내려받기');
    const D = await dem(g, msg => step('dem', msg), maxTiles);
    const {E, S, A} = D;

    step('zoning', '용도지역 · 공원녹지 · 하천 (VWorld)');
    const zoneFeats = [];
    for (const layer of ['LT_C_UQ113', 'LT_C_UQ112', 'LT_C_UQ111', 'LT_C_UQ114']) {
      zoneFeats.push(...(await vworld(layer, {geomFilter: boxStr}, log)));
      step('zoning', `${layer} — 누적 ${zoneFeats.length}건`);
    }
    const parkFeats = await vworld('LT_C_UPISUQ153', {geomFilter: boxStr}, log, 10);
    const rivFeats = await vworld('LT_C_WKMSTRM', {geomFilter: boxStr}, log);

    step('raster', '90m 격자 래스터화 · 거리 계산');
    const zone = new Uint8Array(g.n);
    const zoneName = n => { for (const k of ['주거', '상업', '공업', '녹지', '관리', '농림']) if (n.includes(k)) return ZONE[k]; return n.includes('보전') ? ZONE['자연환경보전'] : 0; };
    const groups = {};
    let consGeoms = [];
    for (const f of zoneFeats) {
      const n = f.properties.uname || '';
      if (!n || n === '관리지역' || n === '도시지역미분류') continue;
      const code = zoneName(n); if (!code) continue;
      (groups[code] = groups[code] || []).push(f.geometry);
      if (n === '보전관리지역' || n === '보전녹지지역') consGeoms.push(f.geometry);
    }
    for (const code of [6, 5, 7, 4, 3, 2, 1]) if (groups[code]) { const m = fillGeoms(g, groups[code]); for (let p = 0; p < g.n; p++) if (m[p]) zone[p] = code; }
    const cons = consGeoms.length ? fillGeoms(g, consGeoms) : new Uint8Array(g.n);
    const park = parkFeats.length ? fillGeoms(g, parkFeats.map(f => f.geometry)) : new Uint8Array(g.n);
    const river = rivFeats.length ? fillGeoms(g, rivFeats.map(f => f.geometry)) : new Uint8Array(g.n);
    const urban = new Uint8Array(g.n), resid = new Uint8Array(g.n), farm = new Uint8Array(g.n);
    for (let p = 0; p < g.n; p++) { urban[p] = zone[p] >= 1 && zone[p] <= 3 ? 1 : 0; resid[p] = zone[p] === 1 ? 1 : 0; farm[p] = zone[p] === 6 ? 1 : 0; }
    const d_riv = edt(g, river), d_res = edt(g, resid), d_urb = edt(g, urban);
    const valid = p => mask[p] && !isNaN(E[p]);
    const asp_ok = new Uint8Array(g.n), asp_strict = new Uint8Array(g.n);
    for (let p = 0; p < g.n; p++) { const s = A[p] >= ASP[0] && A[p] <= ASP[1]; asp_strict[p] = s ? 1 : 0; asp_ok[p] = (S[p] < FLAT || s) ? 1 : 0; }

    // ---- 후보지 자동 선정: 미시가화 셀이 많은 1.6km 창 중 '완경사 + 시가지 인접' 점수 상위 2곳(겹치지 않게)
    step('cands', '후보지 2곳 자동 선정');
    const WIN = 18, STRIDE = 3, need = [0.6, 0.35];
    const free = new Uint8Array(g.n);
    for (let p = 0; p < g.n; p++) free[p] = valid(p) && !urban[p] ? 1 : 0;
    let wins = [];
    for (const th of need) {
      wins = [];
      for (let i = 0; i + WIN <= g.ny; i += STRIDE) for (let j = 0; j + WIN <= g.nx; j += STRIDE) {
        let n = 0, flat = 0, near = 0;
        for (let a = i; a < i + WIN; a++) for (let b = j; b < j + WIN; b++) {
          const p = a * g.nx + b; if (!free[p]) continue;
          n++; if (S[p] <= 15) flat++; if (d_urb[p] <= 300) near++;
        }
        if (n >= th * WIN * WIN) wins.push({i, j, n, sc: flat / n + 0.5 * near / n});
      }
      if (wins.length >= 2) break;
    }
    if (wins.length < 2) throw new Error('NOFREE');
    wins.sort((a, b) => b.sc - a.sc);
    const picked = [wins[0]];
    for (const w of wins.slice(1)) if (Math.abs(w.i - picked[0].i) >= WIN || Math.abs(w.j - picked[0].j) >= WIN) { picked.push(w); break; }
    if (picked.length < 2) throw new Error('NOFREE');
    const candMask = picked.map(w => { const m = new Uint8Array(g.n); for (let a = w.i; a < w.i + WIN; a++) for (let b = w.j; b < w.j + WIN; b++) { const p = a * g.nx + b; if (free[p]) m[p] = 1; } return m; });
    const emdAt = async m => {
      const cells = idx(m); let sx = 0, sy = 0;
      cells.forEach(p => { const [x, y] = g.xy(Math.floor(p / g.nx), p % g.nx); sx += x; sy += y; });
      const [lon, lat] = unmerc(sx / cells.length, sy / cells.length);
      try { const f = await vworld('LT_C_ADEMD_INFO', {geomFilter: `POINT(${lon.toFixed(6)} ${lat.toFixed(6)})`, geometry: 'false', size: 1}, null, 1);
        return f[0] ? f[0].properties.emd_kor_nm : ''; } catch (e) { return ''; }
    };
    const emd = await Promise.all(candMask.map(emdAt));
    const candName = ['A', 'B'].map((k, i) => `후보지 ${k} · ${emd[i] || '이름 없음'} 일대`);

    // 접근성 자료는 후보지가 정해진 뒤에 받는다 — 미시가화지가 없는 대상지는 여기까지 오지 않아 빨리 끝남
    step('osm', '간선도로 · IC · 하수처리시설 (VWorld) · 철도역');
    const O = await access(g, boxStr, log);
    log.push({layer: 'DEM (AWS Terrain Tiles)', request_url_without_key: TILE.replace('{z}', D.z), key_env: '—', queried_on: today(), status: 'OK', record_total: D.tiles, note: `z${D.z} 타일 → 90m 셀 평균`});

    const art = O.roads.length ? strokeLines(g, O.roads) : new Uint8Array(g.n);
    const d_art = edt(g, art);
    const d_ic = distPoints(g, O.ic), d_st = distPoints(g, O.st), d_ww = distPoints(g, O.ww);

    // ---- 후보지 인자값 (code/04 와 같은 정의)
    step('factors', '입지인자 · 지표 ⑥');
    const siteOf = (m, name) => {
      const cells = idx(m).filter(valid), n = cells.length;
      const dm = edt(g, m);
      const nearU = []; for (let p = 0; p < g.n; p++) if (urban[p] && dm[p] <= 1000 && !isNaN(E[p])) nearU.push(E[p]);
      const ref = nearU.length ? mean(nearU) : mean(cells.map(p => E[p]));
      const share = f => r1(cells.filter(f).length / n * 100);
      let icMin = Infinity, icName = '';
      O.ic.forEach(pt => { const [px, py] = merc(pt.lon, pt.lat); cells.forEach(p => { const [x, y] = g.xy(Math.floor(p / g.nx), p % g.nx); const d = Math.hypot(px - x, py - y) * g.k; if (d < icMin) { icMin = d; icName = pt.name; } }); });
      let stName = '', stMin = Infinity;
      O.st.forEach(pt => { const [px, py] = merc(pt.lon, pt.lat); cells.forEach(p => { const [x, y] = g.xy(Math.floor(p / g.nx), p % g.nx); const d = Math.hypot(px - x, py - y) * g.k; if (d < stMin) { stMin = d; stName = pt.name; } }); });
      const zha = c => r1(cells.filter(p => zone[p] === c).length * CELL_HA);
      const flatM = new Uint8Array(g.n); cells.forEach(p => { if (S[p] <= 5) flatM[p] = 1; });
      const P = {
        name, n, area: r1(n * CELL_HA), ref, elev: mean(cells.map(p => E[p])),
        s5: share(p => S[p] <= 5), s10: share(p => S[p] <= 10), s15: share(p => S[p] <= 15), s25: share(p => S[p] > 25),
        south: share(p => asp_strict[p]), art: mean(cells.map(p => d_art[p])), icMin, icName,
        st: mean(cells.map(p => d_st[p])), stName, riv: mean(cells.map(p => d_riv[p])), riv100: share(p => d_riv[p] <= 100),
        res: mean(cells.map(p => d_res[p])), urb: share(p => d_urb[p] <= 300), ww: mean(cells.map(p => d_ww[p])),
        park: cells.filter(p => park[p]).length * CELL_HA, farm: zha(6), mgmt: zha(5), flat: largestPatch(g, flatM), cells,
      };
      P.row = {
        '이름': name, '면적(ha·폴리곤)': P.area, '격자 셀 수': n, '격자 면적(ha)': P.area,
        '표고 최저(m)': r1(cells.reduce((m, p) => Math.min(m, E[p]), Infinity)), '표고 평균(m)': r1(P.elev), '표고 최고(m)': r1(cells.reduce((m, p) => Math.max(m, E[p]), -Infinity)),
        '기반시설 기준표고(m)': r1(ref), '경사 평균(%)': r1(mean(cells.map(p => S[p]))),
        '경사 ≤5% 비율(%)': P.s5, '경사 ≤10% 비율(%)': P.s10, '경사 ≤15% 비율(%)': P.s15, '경사 >25% 비율(%)': P.s25,
        '남향(135~225°) 셀 비율(%)': P.south, '간선도로 평균거리(m)': Math.round(P.art),
        'IC 최단거리(m)': isFinite(icMin) ? Math.round(icMin) : null, 'IC 최근접': icName, '철도역 평균거리(m)': isFinite(P.st) ? Math.round(P.st) : null, '철도역 최근접': stName,
        '하천 평균거리(m)': isFinite(P.riv) ? Math.round(P.riv) : null, '하천 100m 이내 셀(%)': P.riv100, '기존 주거지역 평균거리(m)': Math.round(P.res),
        '기존 시가지 인접 셀(≤300m, %)': P.urb, '하수처리시설 평균거리(m)': isFinite(P.ww) ? Math.round(P.ww) : null,
        '기결정 공원·녹지시설(ha)': r1(P.park),
      };
      ZONE_NAMES.forEach(z => { P.row[`용도지역 ${z}(ha)`] = zha(ZONE[z]); });
      P.elev_ok = new Uint8Array(g.n); for (let p = 0; p < g.n; p++) P.elev_ok[p] = E[p] <= ref + ELEV_MARGIN ? 1 : 0;
      return P;
    };
    const PA = siteOf(candMask[0], candName[0]), PB = siteOf(candMask[1], candName[1]);
    const PG = siteOf(mask, `${item.name} 전체(참고)`);
    const i6rows = [], i6cls = new Uint8Array(g.n);
    [[PA, 'A'], [PB, 'B'], [PG, 'GU']].forEach(([P, key]) => {
      SLOPE_TH.forEach(([lab, th]) => {
        const ok = P.cells.filter(p => S[p] <= th && asp_ok[p] && P.elev_ok[p]).length;
        i6rows.push({'지표': '⑥ 경사·향 적합면적 비율', '대상': P.name, '임계값': lab, '값(%)': r1(ok / P.n * 100), '적합면적(ha)': r1(ok * CELL_HA),
          '경사 단독 충족(%)': r1(P.cells.filter(p => S[p] <= th).length / P.n * 100),
          '향 엄격 적용 시(%)': r1(P.cells.filter(p => S[p] <= th && asp_strict[p] && P.elev_ok[p]).length / P.n * 100),
          '판정 조건': `경사 ≤ ${th}% AND 향 135~225°(경사 2% 미만 평탄 셀은 향 무관) AND 표고 ≤ ${P.ref.toFixed(1)}+50m`,
          'DEM 출처': 'AWS Terrain Tiles (terrarium) — Mapzen/Tilezen, SRTM·기타 공개 DEM 합성', '해상도': `90m 셀(0.81ha) — z${D.z} 타일 평균 재표본`,
          '브이월드 레이어': 'LT_C_ADSIGG_INFO / LT_C_ADEMD_INFO(경계) · LT_C_UQ111~114(용도지역)', '조회일': today(), '비고': '임계값 10·15·25%는 교재 범위(원본 19번) 안의 가정'});
      });
      if (key !== 'GU') P.cells.forEach(p => { i6cls[p] = 1; for (const th of [25, 15, 10]) if (S[p] <= th && asp_ok[p] && P.elev_ok[p]) i6cls[p] = th; });
    });

    // ---- 4축 표 · 배분 대상지
    step('four', '입지인자 4축 표');
    const F = fourAxis({A: PA, B: PB});
    const sumA = F.summ.reduce((s, r) => s + r['후보지 A 점수(8점 만점)'], 0), sumB = F.summ.reduce((s, r) => s + r['후보지 B 점수(8점 만점)'], 0);
    const pickKey = sumB > sumA ? 'B' : 'A', P = pickKey === 'A' ? PA : PB;
    const m = pickKey === 'A' ? candMask[0] : candMask[1];

    // ---- 배분 대안 3안 (code/06 과 같은 규칙, 면적 프로그램은 부지 면적에 비례)
    step('alloc', '배분 대안 3안');
    const siteHa = P.n * CELL_HA, scale = siteHa / 250;
    const TARGET = Math.max(500, Math.round(siteHa * 60 / 500) * 500);
    W.target_population = TARGET;
    const DENS = W.net_residential_density_per_ha, ROAD = W.road_share_of_developed;
    const parkStd = siteHa >= 100 ? Math.max(TARGET * 9 / 1e4, siteHa * 0.12) : siteHa >= 30 ? Math.max(TARGET * 6 / 1e4, siteHa * 0.09) : Math.max(TARGET * 3 / 1e4, siteHa * 0.05);
    const suit6 = p => S[p] <= 15 && asp_ok[p] && P.elev_ok[p];
    const core = new Uint8Array(g.n); P.cells.forEach(p => { if (S[p] > 25 || cons[p] || park[p] || d_riv[p] <= 50) core[p] = 1; });
    const ALTS = {
      '대안 A · 보전 우선': {xs: 15, high: true, rb: 150, farm: 'all', ind: 0, com: 6, dev: 15},
      '대안 B · 개발 우선': {xs: null, high: false, rb: 50, farm: null, ind: 25, com: 12, dev: 25},
      '대안 C · 절충': {xs: 20, high: true, rb: 100, farm: 15, ind: 12, com: 9, dev: 20, buf: true},
    };
    const nb4 = p => { const i = Math.floor(p / g.nx), j = p % g.nx, out = []; if (i > 0) out.push(p - g.nx); if (i < g.ny - 1) out.push(p + g.nx); if (j > 0) out.push(p - 1); if (j < g.nx - 1) out.push(p + 1); return out; };
    const grow = (order, allowed, need) => {
      const chosen = new Uint8Array(g.n); let cnt = 0;
      if (need <= 0) return chosen;
      const pri = new Map(order.map((p, i) => [p, i]));
      while (cnt < need) {
        const seed = order.find(p => allowed[p] && !chosen[p]);
        if (seed === undefined) break;
        let q = [seed];
        while (q.length && cnt < need) {
          q.sort((a, b) => (pri.get(a) ?? 1e9) - (pri.get(b) ?? 1e9));
          const cur = q.shift();
          if (chosen[cur] || !allowed[cur]) continue;
          chosen[cur] = 1; cnt++;
          q.push(...nb4(cur).filter(n => allowed[n] && !chosen[n]));
        }
      }
      return chosen;
    };
    const altRows = [], plans = [];
    for (const [name, p] of Object.entries(ALTS)) {
      const lu = new Uint8Array(g.n);   // 1 녹지 · 2 공업 · 3 상업업무 · 4 주거
      const green = new Uint8Array(g.n);
      P.cells.forEach(c => {
        if (core[c] || (p.xs != null && S[c] > p.xs) || (p.high && !P.elev_ok[c]) || d_riv[c] <= p.rb ||
            (p.farm === 'all' && farm[c]) || (typeof p.farm === 'number' && farm[c] && S[c] > p.farm)) green[c] = 1;
      });
      let gcount = P.cells.filter(c => green[c]).length;
      if (gcount * CELL_HA < parkStd) {
        const extra = P.cells.filter(c => !green[c]).sort((a, b) => S[b] - S[a]);
        extra.slice(0, Math.ceil(parkStd / CELL_HA - gcount)).forEach(c => { green[c] = 1; });
      }
      P.cells.forEach(c => { if (green[c]) lu[c] = 1; });
      const devOk = new Uint8Array(g.n); P.cells.forEach(c => { if (!green[c] && S[c] <= p.dev) devOk[c] = 1; });
      if (p.ind) {
        const allow = new Uint8Array(g.n); P.cells.forEach(c => { if (devOk[c] && S[c] <= 8) allow[c] = 1; });
        const order = P.cells.filter(c => allow[c]).sort((a, b) => ((S[a] > 5) - (S[b] > 5)) ||
          ((d_ic[a] + d_art[a] - 0.5 * d_res[a]) - (d_ic[b] + d_art[b] - 0.5 * d_res[b])));
        const ind = grow(order, allow, Math.round(p.ind * scale / CELL_HA));
        P.cells.forEach(c => { if (ind[c]) lu[c] = 2; });
        if (p.buf) P.cells.forEach(c => { if (ind[c]) nb4(c).forEach(nn => { if (m[nn] && valid(nn) && lu[nn] === 0) lu[nn] = 1; }); });
      }
      const allowC = new Uint8Array(g.n); P.cells.forEach(c => { if (devOk[c] && lu[c] === 0 && S[c] <= 10) allowC[c] = 1; });
      const orderC = P.cells.filter(c => allowC[c]).sort((a, b) => (d_art[a] + d_urb[a]) - (d_art[b] + d_urb[b]));
      const com = grow(orderC, allowC, Math.round(p.com * scale / CELL_HA));
      P.cells.forEach(c => { if (com[c]) lu[c] = 3; });
      P.cells.forEach(c => { if (devOk[c] && lu[c] === 0) lu[c] = 4; });
      P.cells.forEach(c => { if (lu[c] === 0) lu[c] = 1; });
      plans.push(lu);
      const cnt = k => P.cells.filter(c => lu[c] === k).length;
      const dev = P.cells.filter(c => lu[c] >= 2);
      const resHa = cnt(4) * CELL_HA * (1 - ROAD), pop = resHa * DENS;
      const comPts = P.cells.filter(c => lu[c] === 3).map(c => g.xy(Math.floor(c / g.nx), c % g.nx));
      const resCells = P.cells.filter(c => lu[c] === 4);
      const nearCom = resCells.length && comPts.length ? resCells.filter(c => { const [x, y] = g.xy(Math.floor(c / g.nx), c % g.nx); return comPts.some(([cx, cy]) => Math.hypot(cx - x, cy - y) * g.k <= 500); }).length / resCells.length * 100 : 0;
      const row = {'대안': name};
      [['공원·녹지', 1], ['공업', 2], ['상업·업무', 3], ['주거', 4]].forEach(([nm, k]) => { row[`${nm}(ha)`] = r1(cnt(k) * CELL_HA); row[`${nm}(%)`] = r1(cnt(k) / P.n * 100); });
      Object.assign(row, {'개발용지(ha)': r1(dev.length * CELL_HA), '그중 도로·기반시설 20%(ha)': r1(dev.length * CELL_HA * ROAD), '주거 순면적(ha)': r1(resHa),
        '수용인구(명)': Math.round(pop / 10) * 10, '공원 법정 확보기준(ha)': r1(parkStd),
        I1: r1((cnt(2) + cnt(3)) / P.n * 100), I2: r1(nearCom), I3: dev.length ? r1(mean(dev.map(c => d_art[c]))) : 0,
        I4: r1(cnt(1) / P.n * 100), I5: dev.length ? r1(dev.filter(suit6).length / dev.length * 100) : 0, I6: r1(pop / TARGET * 100)});
      altRows.push(row);
    }

    step('matrix', '매트릭스 · 역전점');
    const rev = reversal(W.indicators, altRows);

    // ---- 화면용 결과 (data.js 와 같은 모양 + 래스터)
    const team = base.meta.team;
    const geo = {
      gu: geom,
      candidates: {type: 'FeatureCollection', features: [['A', PA, candMask[0]], ['B', PB, candMask[1]]].map(([id, Pp, mm]) =>
        ({type: 'Feature', geometry: outline(g, mm), properties: {id, name: Pp.name, ha: Pp.area}}))},
      points: {type: 'FeatureCollection', features: [...O.st.map(p => ({...p, kind: '역'})), ...O.ic.filter(p => p.name).map(p => ({...p, kind: 'IC'}))]
        .map(p => ({type: 'Feature', geometry: {type: 'Point', coordinates: [p.lon, p.lat]}, properties: {kind: p.kind, name: p.name}}))},
      arterial: {type: 'MultiLineString', coordinates: O.roads},
    };
    return {
      meta: {title: base.meta.title, course: base.meta.course, team, queried_on: today(), live: true, siteName: item.name, siteLevel: item.level,
        dem: 'AWS Terrain Tiles (terrarium) — Mapzen/Tilezen, SRTM·기타 공개 DEM 합성', osm_base: O.base, allocSite: pickKey},
      geo, weights: W, alternatives: altRows, fourAxis: F.rows, fourAxisSummary: F.summ, indicator6: i6rows,
      siteFactors: {A: PA.row, B: PB.row, GU: PG.row}, reversal: rev, catalog: log,
      raster: {nx: g.nx, ny: g.ny, x0: g.x0, y1: g.y1, c: g.c, bounds: [[g.bbox[1], g.bbox[0]], [g.bbox[3], g.bbox[2]]], mask, zone, i6: i6cls, plans, allocMask: m,
        cell: cellFn(g.x0, g.y1, g.c, g.nx, g.ny), S, A, E},
    };
  }

  // ---------------- 저장 · 불러오기 (전국 시군구 미리 계산 결과)
  function cellFn(x0, y1, c, nx, ny) {
    return (lat, lon) => { const [x, y] = merc(lon, lat); const j = Math.floor((x - x0) / c), i = Math.floor((y1 - y) / c); return (i < 0 || j < 0 || i >= ny || j >= nx) ? -1 : i * nx + j; };
  }
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  // 더글러스-포이커 단순화 (경위도, tol 도 단위)
  function rdp(pts, tol) {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const st = [[0, pts.length - 1]];
    while (st.length) {
      const [a, b] = st.pop(); let md = 0, mi = -1;
      const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
      for (let i = a + 1; i < b; i++) {
        const [px, py] = pts[i];
        let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(px - ax - t * dx, py - ay - t * dy);
        if (d > md) { md = d; mi = i; }
      }
      if (md > tol && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
    }
    return pts.filter((_, i) => keep[i]).map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5]);
  }
  function simplifyGeom(geom, tol) {
    const ring = r => { const o = rdp(r, tol); return o.length >= 4 ? o : r; };
    if (geom.type === 'Polygon') return {type: 'Polygon', coordinates: geom.coordinates.map(ring)};
    if (geom.type === 'MultiPolygon') return {type: 'MultiPolygon', coordinates: geom.coordinates.map(p => p.map(ring))};
    if (geom.type === 'MultiLineString') return {type: 'MultiLineString', coordinates: geom.coordinates.map(l => rdp(l, tol)).filter(l => l.length >= 2)};
    return geom;
  }
  const VW_PUBLIC = 'https://api.vworld.kr/req/data';
  function serialize(D) {
    const R = D.raster, n = R.nx * R.ny;
    const S8 = new Uint8Array(n), A8 = new Uint8Array(n), E16 = new Uint8Array(n * 2);
    for (let p = 0; p < n; p++) {
      if (!R.mask[p]) continue;
      S8[p] = Math.min(255, Math.round(R.S[p]));
      A8[p] = Math.round(R.A[p] / 2) % 180;
      const e = Math.max(0, Math.min(65535, Math.round(isNaN(R.E[p]) ? 0 : R.E[p] + 100)));
      E16[p * 2] = e & 255; E16[p * 2 + 1] = e >> 8;
    }
    const geo = {...D.geo, gu: simplifyGeom(D.geo.gu, 0.00015), arterial: simplifyGeom(D.geo.arterial, 0.0003)};
    // 요청 기록은 프록시 주소 대신 VWorld 원 주소(인증키 제외)로 남김
    const catalog = D.catalog.map(r => ({...r, request_url_without_key: String(r.request_url_without_key).replace(/^https?:\/\/[^/]+\/data\?/, `${VW_PUBLIC}?service=data&version=2.0&request=GetFeature&format=json&crs=EPSG:4326&domain=localhost&`),
      key_env: r.key_env && r.key_env.includes('VWORLD') ? 'VWORLD_KEY' : r.key_env}));
    return {v: 1, ...D, geo, catalog, raster: {nx: R.nx, ny: R.ny, x0: R.x0, y1: R.y1, c: R.c, bounds: R.bounds,
      mask: b64(R.mask), zone: b64(R.zone), i6: b64(R.i6), plans: R.plans.map(b64), allocMask: b64(R.allocMask),
      S: b64(S8), A: b64(A8), E: b64(E16)}};
  }
  function deserialize(J) {
    const R = J.raster, n = R.nx * R.ny;
    const S8 = unb64(R.S), A8 = unb64(R.A), E16 = unb64(R.E);
    const S = new Float64Array(n), A = new Float64Array(n), E = new Float64Array(n);
    for (let p = 0; p < n; p++) { S[p] = S8[p]; A[p] = A8[p] * 2; E[p] = E16[p * 2] + (E16[p * 2 + 1] << 8) - 100; }
    return {...J, raster: {nx: R.nx, ny: R.ny, bounds: R.bounds, mask: unb64(R.mask), zone: unb64(R.zone), i6: unb64(R.i6),
      plans: R.plans.map(unb64), allocMask: unb64(R.allocMask), cell: cellFn(R.x0, R.y1, R.c, R.nx, R.ny), S, A, E}};
  }

  return {search, analyze, proxy, MAX_KM2, serialize, deserialize, vworld};
})();
