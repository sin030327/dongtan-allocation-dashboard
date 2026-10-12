"""02 DEM → 90m 격자 경사·향 계산

- DEM: AWS Terrain Tiles(terrarium, z=13) — SRTM 등 공개 DEM 합성 타일, 로그인 불필요
  (국토지리정보원 DEM 90m 를 대신하는 공개 자료 · 보고서에 대체 사유 기재)
- 타일 픽셀(약 15m)을 EPSG:5186 의 90m 셀 평균으로 재표본 → 셀 1개 = 0.81ha
- 경사(%) = 100 × sqrt(dz/dx² + dz/dy²), 향(°) = 북 0° 기준 시계방향 내리막 방향
"""
import datetime as dt
import io
import json
import math
from pathlib import Path

import numpy as np
import requests
from PIL import Image
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
Z = 13
CELL = 90.0


def lonlat_to_tile(lon, lat, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def tile_to_lonlat(x, y, z):
    n = 2 ** z
    lon = x / n * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lon, lat


def main():
    x0, y0, x1, y1 = json.loads((RAW / "bbox.json").read_text())
    pad = 0.01
    x0, y0, x1, y1 = x0 - pad, y0 - pad, x1 + pad, y1 + pad
    tx0, ty0 = lonlat_to_tile(x0, y1, Z)
    tx1, ty1 = lonlat_to_tile(x1, y0, Z)
    tx0, ty0, tx1, ty1 = int(tx0), int(ty0), int(tx1), int(ty1)
    mosaic = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256), dtype=np.float32)
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            r = requests.get(TILE_URL.format(z=Z, x=tx, y=ty), timeout=60)
            r.raise_for_status()
            a = np.asarray(Image.open(io.BytesIO(r.content)).convert("RGB"), dtype=np.float32)
            h = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
            mosaic[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = h
    print("tiles", (tx1 - tx0 + 1) * (ty1 - ty0 + 1))

    # 픽셀 중심 경위도 → EPSG:5186
    ny, nx = mosaic.shape
    px = tx0 + (np.arange(nx) + 0.5) / 256
    py = ty0 + (np.arange(ny) + 0.5) / 256
    lon = px / 2 ** Z * 360 - 180
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * py / 2 ** Z))))
    LON, LAT = np.meshgrid(lon, lat)
    tr = Transformer.from_crs(4326, 5186, always_xy=True)
    X, Y = tr.transform(LON, LAT)

    # 90m 격자로 평균 재표본
    gx0 = math.floor(X.min() / CELL) * CELL
    gy1 = math.ceil(Y.max() / CELL) * CELL
    gnx = int(math.ceil((X.max() - gx0) / CELL))
    gny = int(math.ceil((gy1 - Y.min()) / CELL))
    ci = ((X - gx0) // CELL).astype(int).ravel()
    ri = ((gy1 - Y) // CELL).astype(int).ravel()
    s = np.zeros((gny, gnx)); c = np.zeros((gny, gnx))
    np.add.at(s, (ri, ci), mosaic.ravel())
    np.add.at(c, (ri, ci), 1)
    dem = np.where(c > 0, s / np.maximum(c, 1), np.nan)

    # 경사·향 (Horn 3×3)
    p = np.pad(dem, 1, mode="edge")
    a, b, cc = p[:-2, :-2], p[:-2, 1:-1], p[:-2, 2:]
    d, f = p[1:-1, :-2], p[1:-1, 2:]
    g, h, i = p[2:, :-2], p[2:, 1:-1], p[2:, 2:]
    dzdx = ((cc + 2 * f + i) - (a + 2 * d + g)) / (8 * CELL)   # 동쪽 +
    dzdy = ((g + 2 * h + i) - (a + 2 * b + cc)) / (8 * CELL)   # 남쪽 + (행 증가 = 남)
    slope = 100 * np.hypot(dzdx, dzdy)
    # 향 = 내리막 방향, 북 0° 시계방향 — arctan2(동성분, 북성분): 내리막 동성분 = -dzdx, 내리막 북성분 = +dzdy(남쪽이 높으면 북으로 내려감)
    aspect = (np.degrees(np.arctan2(-dzdx, dzdy)) + 360) % 360

    np.savez_compressed(ROOT / "data" / "dem90.npz", dem=dem, slope=slope, aspect=aspect,
                        gx0=gx0, gy1=gy1, cell=CELL)
    meta = {"source": "AWS Terrain Tiles (terrarium) — Mapzen/Tilezen, SRTM·기타 공개 DEM 합성",
            "tile_url": TILE_URL, "zoom": Z, "resample": "EPSG:5186 90m 셀 평균",
            "queried_on": dt.date.today().isoformat(), "grid": [gny, gnx]}
    (ROOT / "data" / "dem_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print("grid", dem.shape, "elev", np.nanmin(dem), np.nanmax(dem), "slope p50/p90", np.nanpercentile(slope, [50, 90]))


if __name__ == "__main__":
    main()
