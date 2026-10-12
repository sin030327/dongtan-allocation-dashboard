"""10 전국 시군구 경계(단순화) — 좌표 검색용 docs/sig_bounds.json

좌표를 넣으면 브라우저가 이 경계로 어느 시군구인지 바로 판정한다(지오코더 없이도 동작).
- 자료: VWorld LT_C_ADSIGG_INFO (인증키는 환경변수 VWORLD_KEY)
- 단순화: 약 50m(0.0005°) 더글러스-포이커, 좌표 소수 5자리
"""
import datetime as dt
import json
import os
import sys
from pathlib import Path

import requests
from shapely.geometry import mapping, shape

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "sig_bounds.json"
BASE = "https://api.vworld.kr/req/data"


def main():
    key = os.environ.get("VWORLD_KEY") or sys.exit("VWORLD_KEY 없음")
    feats, page = [], 1
    while True:
        r = requests.get(BASE, params={
            "service": "data", "version": "2.0", "request": "GetFeature", "data": "LT_C_ADSIGG_INFO",
            "key": key, "domain": os.environ.get("VWORLD_DOMAIN", "localhost"), "geomFilter": "BOX(124,33,132,39)",
            "crs": "EPSG:4326", "format": "json", "geometry": "true", "size": 1000, "page": page}, timeout=120)
        resp = r.json()["response"]
        feats += resp["result"]["featureCollection"]["features"]
        if page >= int(resp["page"]["total"]):
            break
        page += 1
    out = []
    for f in feats:
        g = shape(f["geometry"]).simplify(0.0005, preserve_topology=True)
        gj = json.loads(json.dumps(mapping(g)), parse_float=lambda v: round(float(v), 5))
        out.append([f["properties"]["sig_cd"], f["properties"]["full_nm"], gj])
    out.sort(key=lambda x: x[0])
    OUT.write_text(json.dumps({"source": "VWorld LT_C_ADSIGG_INFO", "queried_on": dt.date.today().isoformat(),
                               "simplify_deg": 0.0005, "sig": out}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(len(out), "시군구 ·", OUT.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
