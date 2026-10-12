"""09 대시보드 데이터 내보내기 — outputs·data → docs/data.js (EPSG:4326 GeoJSON + 표)

대시보드는 이 파일만 읽는다. 인증키·API 호출 없음.
"""
import json

import numpy as np
import pandas as pd
import shapely
from pyproj import Transformer
from shapely.geometry import box, mapping
from shapely.ops import unary_union

from common import CELL, OUT, ROOT, candidates, grid, gu_polygon, osm, zones

DOCS = ROOT / "docs"
DOCS.mkdir(exist_ok=True)
_B = Transformer.from_crs(5186, 4326, always_xy=True)


def to4326(g, tol=0):
    if tol:
        g = g.simplify(tol, preserve_topology=True)
    g = shapely.transform(g, lambda c: np.column_stack(_B.transform(c[:, 0], c[:, 1])))
    return json.loads(json.dumps(mapping(shapely.set_precision(g, 1e-6))))


def cells_union(mask, CX, CY):
    h = CELL / 2
    return unary_union([box(x - h, y - h, x + h, y + h) for x, y in zip(CX[mask], CY[mask])])


def feat(geom, **props):
    return {"type": "Feature", "geometry": geom, "properties": props}


def main():
    gu = gu_polygon()
    zs = zones()
    cands, urban = candidates(gu, zs)
    S, A, E, CX, CY = grid()
    roads, ic, st, wwtp, osm_meta = osm()
    W = json.loads((ROOT / "data" / "approved_weights.json").read_text(encoding="utf-8"))
    g = np.load(ROOT / "data" / "site_grids.npz")
    asp_ok = g["asp_ok"]

    # 용도지역 — 대분류별 합침
    zg = {}
    for n, grp, geom in zs:
        zg.setdefault(grp, []).append(geom.intersection(gu))
    zoning = [feat(to4326(unary_union(v).buffer(0), 8), group=k) for k, v in zg.items()]

    # 후보지 + 지표 ⑥ 셀 등급
    cand_f, i6_f = [], []
    for k, (name, poly) in cands.items():
        cand_f.append(feat(to4326(poly, 3), id=k, name=name, ha=round(poly.area / 1e4, 1)))
        m = np.load(ROOT / "data" / f"mask_{k}.npy")
        near = shapely.contains_xy(urban, CX, CY) & shapely.contains_xy(poly.buffer(1000), CX, CY)
        ref = float(np.nanmean(E[near]))
        ok = asp_ok & (E <= ref + 50)
        prev = np.zeros_like(m)
        for th in (10, 15, 25):
            cls = m & ok & (S <= th) & ~prev
            if cls.any():
                i6_f.append(feat(to4326(cells_union(cls, CX, CY)), site=k, th=th))
            prev |= cls
        rest = m & ~prev
        i6_f.append(feat(to4326(cells_union(rest, CX, CY)), site=k, th=0))

    # 대안 3안 — 셀 → 용도별 폴리곤
    alt = pd.read_csv(OUT / "alternatives_landuse.csv", index_col=0, encoding="utf-8-sig")
    plans = np.load(ROOT / "data" / "alt_plans.npz")
    mA = np.load(ROOT / "data" / "mask_A.npy")
    names = {1: "공원·녹지", 2: "공업", 3: "상업·업무", 4: "주거"}
    alt_f = []
    for i, a in enumerate(alt.index):
        lu = plans[f"p{i}"]
        for code, nm in names.items():
            mk = mA & (lu == code)
            if mk.any():
                alt_f.append(feat(to4326(cells_union(mk, CX, CY)), alt=i, lu=nm))

    pts = [feat(to4326(p), kind="역", name=n + "역") for n, p in st if gu.buffer(3000).contains(p)]
    seen = set()
    for n, p in ic:
        if n and n not in seen and gu.buffer(3000).contains(p):
            seen.add(n)
            pts.append(feat(to4326(p), kind="IC", name=n))
    art = unary_union([geom for k, n, geom in roads if k in ("motorway", "trunk", "primary")]).intersection(gu.buffer(2000))

    def rec(df):
        return json.loads(df.to_json(orient="records", force_ascii=False))

    sf = pd.read_csv(OUT / "site_factors.csv", index_col=0, encoding="utf-8-sig")
    data = {
        "meta": {
            "title": "동탄 입지배분과 대안 — 6주차",
            "course": "스마트도시계획(캡스톤디자인) · 상명대학교 그린스마트시티학과",
            "team": ["신재훈", "이제준", "전세진", "김채우", "Elisa"],
            "queried_on": json.loads((ROOT / "data" / "dem_meta.json").read_text(encoding="utf-8"))["queried_on"],
            "dem": json.loads((ROOT / "data" / "dem_meta.json").read_text(encoding="utf-8"))["source"],
            "osm_base": osm_meta.get("osm_base"),
        },
        "geo": {
            "gu": to4326(gu, 5),
            "zoning": {"type": "FeatureCollection", "features": zoning},
            "candidates": {"type": "FeatureCollection", "features": cand_f},
            "i6": {"type": "FeatureCollection", "features": i6_f},
            "alts": {"type": "FeatureCollection", "features": alt_f},
            "points": {"type": "FeatureCollection", "features": pts},
            "arterial": to4326(art, 10),
        },
        "weights": W,
        "alternatives": json.loads(alt.reset_index().to_json(orient="records", force_ascii=False)),
        "fourAxis": rec(pd.read_csv(OUT / "four_axis_table.csv", encoding="utf-8-sig")),
        "fourAxisSummary": rec(pd.read_csv(OUT / "four_axis_summary.csv", encoding="utf-8-sig")),
        "indicator6": rec(pd.read_csv(OUT / "indicator6_catalog.csv", encoding="utf-8-sig")),
        "siteFactors": {k: {r: (None if pd.isna(v) else v) for r, v in sf[k].items()} for k in sf.columns},
        "reversal": rec(pd.read_csv(OUT / "weight_reversal.csv", encoding="utf-8-sig")),
        "catalog": rec(pd.read_csv(ROOT / "data" / "catalog_requests.csv", encoding="utf-8-sig")),
    }
    js = "window.DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (DOCS / "data.js").write_text(js, encoding="utf-8")
    print("data.js", len(js) // 1024, "KB")


if __name__ == "__main__":
    main()
