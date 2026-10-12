/* VWorld 프록시(Cloudflare Worker) 주소 — 인증키가 아니라 공개 주소만 둔다.
 * 배포 후 예: window.PROXY_URL = 'https://vworld-proxy.<계정>.workers.dev';
 * 비워 두면 localhost 에서는 http://localhost:8787 (worker/dev_proxy.py) 을 쓴다. */
window.PROXY_URL = '';
