"""공통 — 레이어 읽기 · 좌표 변환(EPSG:4326 → 5186) · 90m 격자 · 후보지 정의"""
import json
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import box, shape, LineString, Point
from shapely.ops import unary_union
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "outputs"
OUT.mkdir(exist_ok=True)
_T = Transformer.from_crs(4326, 5186, always_xy=True)
CELL = 90.0
CELL_HA = CELL * CELL / 1e4  # 0.81ha

# 임계값 (2차시 기준 — 교재 범위 안의 가정)
SLOPE_TH = {"하한 10%": 10, "기준안 15%": 15, "상한 25%": 25}
ASPECT_RANGE = (135, 225)   # 남향 ±45°, 북 0° 시계방향
FLAT_SLOPE = 2.0            # 경사 2% 미만 평탄 셀은 향 무관(방향성 없음) — 가정
ELEV_MARGIN = 50            # 기반시설 표고 +50m

# 후보지 — 동탄구 안 미시가화지(현행 주거·상업·공업 용도지역 제외)
CANDIDATE_BOX = {
    "A": ("후보지 A · 장지동 남측(저지대 농림·관리지역)", box(208600, 504900, 210800, 506400)),
    "B": ("후보지 B · 중동 북동(산지 접경 농림·관리지역)", box(211800, 511200, 213800, 513200)),
}


def tg(g):
    return shapely.transform(g, lambda c: np.column_stack(_T.transform(c[:, 0], c[:, 1])))


def tp(lon, lat):
    return Point(*_T.transform(lon, lat))


def load(layer):
    return json.loads((RAW / f"{layer}.geojson").read_text(encoding="utf-8"))["features"]


def gu_polygon():
    return tg(shape(load("LT_C_ADSIGG_INFO")[0]["geometry"]))


def zones():
    """[(용도지역명, 대분류, geometry)] — 상위 '도시지역'·'관리지역' 통합 폴리곤은 제외"""
    out = []
    for layer in ["LT_C_UQ111", "LT_C_UQ112", "LT_C_UQ113", "LT_C_UQ114"]:
        p = RAW / f"{layer}.geojson"
        if not p.exists():
            continue
        for f in load(layer):
            n = f["properties"]["uname"]
            if n in ("", "관리지역", "도시지역미분류"):
                continue
            out.append((n, zone_group(n), tg(shape(f["geometry"])).buffer(0)))
    return out


def zone_group(n):
    for k in ("주거", "상업", "공업", "녹지", "관리", "농림", "보전"):
        if k in n:
            return {"보전": "자연환경보전"}.get(k, k)
    return "기타"


def candidates(gu, zs):
    urban = unary_union([g for n, grp, g in zs if grp in ("주거", "상업", "공업")])
    out = {}
    for k, (name, b) in CANDIDATE_BOX.items():
        out[k] = (name, b.intersection(gu).difference(urban).buffer(0))
    return out, urban


def grid():
    d = np.load(ROOT / "data" / "dem90.npz")
    S, A, E = d["slope"], d["aspect"], d["dem"]
    gx0, gy1 = float(d["gx0"]), float(d["gy1"])
    ny, nx = S.shape
    cx = gx0 + CELL * (np.arange(nx) + .5)
    cy = gy1 - CELL * (np.arange(ny) + .5)
    CX, CY = np.meshgrid(cx, cy)
    return S, A, E, CX, CY


def osm():
    j = json.loads((RAW / "osm_access.json").read_text(encoding="utf-8"))
    roads, ic, st, wwtp = [], [], [], []
    for e in j["elements"]:
        t = e.get("tags", {})
        if e["type"] == "way" and "highway" in t and "geometry" in e:
            ls = LineString([_T.transform(p["lon"], p["lat"]) for p in e["geometry"]])
            roads.append((t["highway"], t.get("name") or t.get("ref") or "", ls))
        elif t.get("highway") == "motorway_junction":
            ic.append((t.get("name", ""), tp(e["lon"], e["lat"])))
        elif t.get("railway") == "station":
            st.append((t.get("name", ""), tp(e["lon"], e["lat"])))
        elif t.get("man_made") == "wastewater_plant":
            b = e.get("bounds") or {}
            if b:
                wwtp.append(("공공하수처리시설", tp((b["minlon"] + b["maxlon"]) / 2, (b["minlat"] + b["maxlat"]) / 2)))
    return roads, ic, st, wwtp, j["_meta"]


def dist_grid(geoms, CX, CY):
    """셀 중심에서 geometry 모음까지 최단거리(m)"""
    u = unary_union(geoms)
    pts = shapely.points(CX.ravel(), CY.ravel())
    return shapely.distance(pts, u).reshape(CX.shape)
