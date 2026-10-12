"""01 VWorld 2D 데이터 API 2.0 수집 — 화성시 동탄구

- 인증키는 환경변수 VWORLD_KEY 에서만 읽는다 (코드·문서에 키 값 미기재).
- 스크립트(비브라우저) 호출이므로 domain 파라미터를 함께 보낸다.
- size ≤ 1000, record.total > size 이면 page + 1 로 반복 수신.
- 카탈로그(data/catalog_requests.csv)에는 key 를 뺀 요청 URL · 조회일 · status 를 남긴다.
"""
import csv
import datetime as dt
import json
import os
import sys
import time
from pathlib import Path
from urllib.parse import urlencode

import requests

BASE = "https://api.vworld.kr/req/data"
DOMAIN = os.environ.get("VWORLD_DOMAIN", "localhost")  # 발급 시 등록한 서비스 URL
ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
RAW.mkdir(parents=True, exist_ok=True)
TODAY = dt.date.today().isoformat()
CATALOG = ROOT / "data" / "catalog_requests.csv"

# 동탄구 경계 BOX(경위도) — 경계 조회 후 갱신
BOX = None

LAYERS = {
    # data ID : (설명, attrFilter)
    "LT_C_ADSIGG_INFO": ("행정경계(시군구) — 화성시 동탄구", "sig_cd:=:41597"),
    "LT_C_ADEMD_INFO": ("행정경계(읍면동)", None),
    "LT_C_UQ111": ("용도지역 — 도시지역", None),
    "LT_C_UQ112": ("용도지역 — 관리지역", None),
    "LT_C_UQ113": ("용도지역 — 농림지역", None),
    "LT_C_UQ114": ("용도지역 — 자연환경보전지역", None),
    "LT_C_UD801": ("개발제한구역", None),
    "LT_C_UPISUQ153": ("도시계획시설 — 공간시설(공원·녹지 등)", None),
    "LT_C_UPISUQ161": ("지구단위계획구역", None),
    "LT_C_WKMSTRM": ("하천망", None),
}


def key():
    k = os.environ.get("VWORLD_KEY")
    if not k:
        sys.exit("VWORLD_KEY 없음 — 지표 ⑥ 조회 대기 (환경변수 설정 후 재실행)")
    return k


def log(layer, params, status, total, note=""):
    new = not CATALOG.exists()
    with CATALOG.open("a", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        if new:
            w.writerow(["layer", "request_url_without_key", "key_env", "queried_on", "status", "record_total", "note"])
        p = {k: v for k, v in params.items() if k != "key"}
        w.writerow([layer, f"{BASE}?{urlencode(p)}", "VWORLD_KEY", TODAY, status, total, note])


def get_layer(layer, geom_filter, attr=None, geometry=True):
    feats, page = [], 1
    while True:
        params = {
            "service": "data", "version": "2.0", "request": "GetFeature",
            "data": layer, "key": key(), "domain": DOMAIN,
            "geomFilter": geom_filter, "crs": "EPSG:4326", "format": "json",
            "geometry": str(geometry).lower(), "size": 1000, "page": page,
        }
        if attr:
            params["attrFilter"] = attr
        r = requests.get(BASE, params=params, timeout=60)
        r.encoding = "utf-8"
        resp = r.json()["response"]
        status = resp["status"]
        if status != "OK":
            err = resp.get("error", {})
            log(layer, params, status, 0, f"{err.get('code', '')} {err.get('text', '')}".strip())
            return feats
        total = int(resp["record"]["total"])
        feats += resp["result"]["featureCollection"]["features"]
        if page == 1:
            log(layer, params, status, total)
        if page >= int(resp["page"]["total"]):
            return feats
        page += 1
        time.sleep(0.2)


def save(layer, feats):
    fc = {"type": "FeatureCollection", "features": feats,
          "properties": {"source": f"VWorld 2D 데이터 API 2.0 · {layer}", "queried_on": TODAY}}
    (RAW / f"{layer}.geojson").write_text(json.dumps(fc, ensure_ascii=False), encoding="utf-8")
    print(f"{layer}: {len(feats)}")


def bbox_of(feats):
    xs, ys = [], []

    def walk(c):
        if isinstance(c[0], (int, float)):
            xs.append(c[0]); ys.append(c[1])
        else:
            for cc in c:
                walk(cc)
    for f in feats:
        walk(f["geometry"]["coordinates"])
    return min(xs), min(ys), max(xs), max(ys)


def main():
    if CATALOG.exists():
        CATALOG.unlink()
    # 1) 동탄구 경계 — 시군구 코드 41597
    sig = get_layer("LT_C_ADSIGG_INFO", "BOX(126.9,37.0,127.3,37.4)", "sig_cd:=:41597")
    save("LT_C_ADSIGG_INFO", sig)
    x0, y0, x1, y1 = bbox_of(sig)
    box = f"BOX({x0:.5f},{y0:.5f},{x1:.5f},{y1:.5f})"
    print("동탄구 BOX", box)
    (RAW / "bbox.json").write_text(json.dumps([x0, y0, x1, y1]), encoding="utf-8")
    # 2) 나머지 레이어 — 동탄구 BOX 범위
    for layer, (desc, attr) in LAYERS.items():
        if layer == "LT_C_ADSIGG_INFO":
            continue
        save(layer, get_layer(layer, box, attr))


if __name__ == "__main__":
    main()
