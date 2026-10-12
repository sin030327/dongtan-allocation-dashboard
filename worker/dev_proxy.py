"""로컬 개발용 프록시 — worker/src/index.js 와 같은 규칙 (Cloudflare 배포 전 시험용)

    set VWORLD_KEY=(발급 키)
    python worker/dev_proxy.py          # http://localhost:8787/data?...

인증키는 환경변수에서만 읽는다.
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VWORLD = "https://api.vworld.kr/req/data"
ALLOWED_LAYERS = {
    "LT_C_ADSIDO_INFO", "LT_C_ADSIGG_INFO", "LT_C_ADEMD_INFO",
    "LT_C_UQ111", "LT_C_UQ112", "LT_C_UQ113", "LT_C_UQ114", "LT_C_UD801",
    "LT_C_UPISUQ153", "LT_C_UPISUQ158", "LT_C_UPISUQ161", "LT_C_WKMSTRM",
    "LT_L_MOCTLINK", "LT_P_MOCTNODE",
}
PASS = ["data", "geomFilter", "attrFilter", "page", "size", "geometry", "columns"]
OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
REGIONS = __import__("pathlib").Path(__file__).resolve().parents[1] / "docs" / "regions"
KEY = os.environ.get("VWORLD_KEY")
DOMAIN = os.environ.get("VWORLD_DOMAIN", "localhost")


class H(BaseHTTPRequestHandler):
    def _send(self, code, body, origin):
        b = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("content-type", "application/json; charset=utf-8")
        if origin:
            self.send_header("access-control-allow-origin", origin)
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        origin = self.headers.get("origin")
        ok = origin if origin and (re.match(r"^http://(localhost|127\.0\.0\.1)(:\d+)?$", origin)
                                   or origin == "https://sin030327.github.io") else None
        qs = dict(urllib.parse.parse_qsl(u.query))
        if u.path == "/overpass":  # 미러를 차례로 시도
            q = qs.get("data", "")
            if not q.startswith("[out:json]") or len(q) > 4000:
                return self._send(400, json.dumps({"error": "bad query"}), ok)
            last = ""
            for ep in OVERPASS:
                try:
                    req = urllib.request.Request(f"{ep}?data={urllib.parse.quote(q)}", headers={"User-Agent": "dongtan-dashboard-dev"})
                    with urllib.request.urlopen(req, timeout=120) as r:
                        body = r.read().decode("utf-8")
                        if body.lstrip().startswith("{"):
                            return self._send(200, body.replace("{", "{" + f'"_endpoint":{json.dumps(ep)},', 1), ok)
                except Exception as e:  # noqa: BLE001
                    last = f"{ep} {e}"
            return self._send(502, json.dumps({"error": f"overpass unavailable ({last})"}), ok)
        if u.path == "/status":  # 개발 전용 — 일괄 계산 진행 기록
            f = REGIONS / "_status.json"
            return self._send(200, f.read_bytes() if f.exists() else b"{}", ok)
        if u.path == "/saved":  # 개발 전용 — 이미 저장한 시군구 목록
            names = sorted(f.name for f in REGIONS.glob("*.json*")) if REGIONS.exists() else []
            return self._send(200, json.dumps(names), ok)
        if u.path != "/data":
            return self._send(200, json.dumps({"ok": True, "service": "vworld-proxy (dev)"}), ok)
        if qs.get("data") not in ALLOWED_LAYERS:
            return self._send(400, json.dumps({"error": "layer not allowed"}), ok)
        p = {"service": "data", "version": "2.0", "request": "GetFeature", "format": "json",
             "crs": "EPSG:4326", "key": KEY, "domain": DOMAIN}
        p.update({k: qs[k] for k in PASS if k in qs})
        with urllib.request.urlopen(f"{VWORLD}?{urllib.parse.urlencode(p)}", timeout=60) as r:
            self._send(r.status, r.read(), ok)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("access-control-allow-origin", self.headers.get("origin") or "*")
        self.send_header("access-control-allow-methods", "GET, POST")
        self.send_header("access-control-allow-headers", "content-type")
        self.end_headers()

    def do_POST(self):
        """개발 전용 — 전국 시군구 미리 계산 결과를 docs/regions/ 에 저장 (localhost 출처만)"""
        u = urllib.parse.urlparse(self.path)
        origin = self.headers.get("origin") or ""
        if u.path != "/save" or not re.match(r"^http://(localhost|127\.0\.0\.1)(:\d+)?$", origin):
            return self._send(403, json.dumps({"error": "forbidden"}), None)
        name = dict(urllib.parse.parse_qsl(u.query)).get("name", "")
        if not re.match(r"^[0-9A-Za-z_]+\.json(\.gz)?$", name):
            return self._send(400, json.dumps({"error": "bad name"}), origin)
        body = self.rfile.read(int(self.headers.get("content-length", 0)))
        if not name.endswith(".gz"):
            json.loads(body)  # 형식 확인
        REGIONS.mkdir(parents=True, exist_ok=True)
        (REGIONS / name).write_bytes(body)
        self._send(200, json.dumps({"ok": True, "bytes": len(body)}), origin)

    def log_message(self, fmt, *args):
        sys.stderr.write("proxy " + (fmt % args) + "\n")


if __name__ == "__main__":
    if not KEY:
        sys.exit("VWORLD_KEY 환경변수가 없음")
    print("dev proxy on http://localhost:8787")
    ThreadingHTTPServer(("127.0.0.1", 8787), H).serve_forever()
