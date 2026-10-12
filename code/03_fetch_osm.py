"""03 접근성 인자 수집 — OpenStreetMap Overpass API

VWorld 2D 데이터 API 에 없는 교통 결절점(철도역·IC)과 간선도로 위치를 받는다.
라이선스: ODbL 1.0 — © OpenStreetMap contributors
"""
import datetime as dt
import json
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
URLS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"]


def main():
    x0, y0, x1, y1 = json.loads((RAW / "bbox.json").read_text())
    b = f"{y0 - 0.02},{x0 - 0.02},{y1 + 0.02},{x1 + 0.02}"
    q = f"""[out:json][timeout:180];
(
  way["highway"~"^(motorway|trunk|primary|secondary)$"]({b});
  node["highway"="motorway_junction"]({b});
  node["railway"="station"]({b});
  nwr["man_made"="wastewater_plant"]({b});
);
out geom tags;"""
    for url in URLS:  # 504 등 응답 실패 시 미러로 재시도
        try:
            r = requests.post(url, data={"data": q}, timeout=300,
                              headers={"User-Agent": "smartcity-capstone-week6"})
            r.raise_for_status()
            break
        except requests.RequestException as e:
            print("fail", url, e)
    j = r.json()
    j["_meta"] = {"query": q, "queried_on": dt.date.today().isoformat(),
                  "osm_base": j.get("osm3s", {}).get("timestamp_osm_base"),
                  "endpoint": url, "license": "ODbL 1.0 — © OpenStreetMap contributors"}
    (RAW / "osm_access.json").write_text(json.dumps(j, ensure_ascii=False), encoding="utf-8")
    print("elements", len(j["elements"]))


if __name__ == "__main__":
    main()
