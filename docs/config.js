/* 공개 주소만 둔다 — 인증키 · 토큰은 Worker 비밀값에만 있다.
 * GEOCODER_URL: gimi9 지오코더 중계(Cloudflare Worker) — 주소 → 좌표, 좌표 → 주소
 * PROXY_URL   : VWorld 실시간 프록시. VWorld 가 Cloudflare 를 막아 공개 사이트에서는 쓰지 않음
 *               (비워 두면 localhost 에서 worker/dev_proxy.py 를 씀) */
window.GEOCODER_URL = 'https://vworld-proxy.sin53118153.workers.dev';
window.PROXY_URL = '';
