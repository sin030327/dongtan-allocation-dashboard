"""04 후보지 2곳 — 입지인자 값 산출 + 지표 ⑥ 경사·향 적합면적 비율

산출: outputs/site_factors.csv · outputs/indicator6_catalog.csv · outputs/fig_*.png · data/site_cells.npz
"""
import datetime as dt
import json

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import shapely
from shapely.ops import unary_union

from common import (ASPECT_RANGE, CELL_HA, ELEV_MARGIN, FLAT_SLOPE, OUT, ROOT, SLOPE_TH,
                    candidates, dist_grid, grid, gu_polygon, load, osm, tg, zones)
from shapely.geometry import shape

plt.rcParams["font.family"] = "Malgun Gothic"
plt.rcParams["axes.unicode_minus"] = False
TODAY = dt.date.today().isoformat()


def main():
    gu = gu_polygon()
    zs = zones()
    cands, urban = candidates(gu, zs)
    S, A, E, CX, CY = grid()
    roads, ic, st, wwtp, osm_meta = osm()
    dem_meta = json.loads((ROOT / "data" / "dem_meta.json").read_text(encoding="utf-8"))
    rivers = [tg(shape(f["geometry"])) for f in load("LT_C_WKMSTRM")]
    parks = [tg(shape(f["geometry"])).buffer(0) for f in load("LT_C_UPISUQ153")]

    arterial = [g for k, n, g in roads if k in ("motorway", "trunk", "primary")]
    d_art = dist_grid(arterial, CX, CY)
    d_ic = dist_grid([p for n, p in ic], CX, CY)
    d_st = dist_grid([p for n, p in st], CX, CY)
    d_riv = dist_grid(rivers, CX, CY)
    resid = unary_union([g for n, grp, g in zs if grp == "주거"])
    d_res = dist_grid([resid], CX, CY)
    d_urb = dist_grid([urban], CX, CY)
    d_ww = dist_grid([p for n, p in wwtp], CX, CY)
    in_urban = shapely.contains_xy(urban, CX, CY)
    flat = S < FLAT_SLOPE
    asp_ok = flat | ((A >= ASPECT_RANGE[0]) & (A <= ASPECT_RANGE[1]))
    asp_strict = (A >= ASPECT_RANGE[0]) & (A <= ASPECT_RANGE[1])

    rows, cat, masks = [], [], {}
    targets = dict(cands)
    targets["GU"] = ("화성시 동탄구 전체(참고)", gu)
    for k, (name, poly) in targets.items():
        m = shapely.contains_xy(poly, CX, CY) & ~np.isnan(E)
        masks[k] = m
        # 기반시설 표고 = 후보지 1km 안 기존 시가지 셀의 평균 표고 (가정)
        near = in_urban & (shapely.contains_xy(poly.buffer(1000), CX, CY))
        ref = float(np.nanmean(E[near])) if near.any() else float(np.nanmean(E[m]))
        elev_ok = E <= ref + ELEV_MARGIN
        n = int(m.sum())
        comp = {}
        for zn, grp, g in zs:
            a = g.intersection(poly).area / 1e4
            if a > 0.05:
                comp[grp] = comp.get(grp, 0) + a
        park_ha = unary_union([p.intersection(poly) for p in parks]).area / 1e4
        r = {
            "후보지": k, "이름": name,
            "면적(ha·폴리곤)": round(poly.area / 1e4, 1), "격자 셀 수": n, "격자 면적(ha)": round(n * CELL_HA, 1),
            "표고 최저(m)": round(float(np.nanmin(E[m])), 1), "표고 평균(m)": round(float(np.nanmean(E[m])), 1),
            "표고 최고(m)": round(float(np.nanmax(E[m])), 1), "기반시설 기준표고(m)": round(ref, 1),
            "경사 평균(%)": round(float(S[m].mean()), 1),
            "경사 ≤5% 비율(%)": round(float((S[m] <= 5).mean() * 100), 1),
            "경사 ≤10% 비율(%)": round(float((S[m] <= 10).mean() * 100), 1),
            "경사 ≤15% 비율(%)": round(float((S[m] <= 15).mean() * 100), 1),
            "경사 >25% 비율(%)": round(float((S[m] > 25).mean() * 100), 1),
            "남향(135~225°) 셀 비율(%)": round(float(asp_strict[m].mean() * 100), 1),
            "간선도로 평균거리(m)": round(float(d_art[m].mean())),
            "IC 최단거리(m)": round(float(d_ic[m].min())), "IC 평균거리(m)": round(float(d_ic[m].mean())),
            "IC 최근접": min(ic, key=lambda t: t[1].distance(poly))[0],
            "철도역 평균거리(m)": round(float(d_st[m].mean())),
            "철도역 최근접": min(st, key=lambda t: t[1].distance(poly))[0],
            "하천 평균거리(m)": round(float(d_riv[m].mean())),
            "하천 100m 이내 셀(%)": round(float((d_riv[m] <= 100).mean() * 100), 1),
            "기존 주거지역 평균거리(m)": round(float(d_res[m].mean())),
            "기존 시가지 인접 셀(≤300m, %)": round(float((d_urb[m] <= 300).mean() * 100), 1),
            "하수처리시설 평균거리(m)": round(float(d_ww[m].mean())),
            "기결정 공원·녹지시설(ha)": round(park_ha, 1),
        }
        for g in ("녹지", "관리", "농림", "자연환경보전", "주거", "상업", "공업"):
            r[f"용도지역 {g}(ha)"] = round(comp.get(g, 0), 1)
        rows.append(r)
        for lab, th in SLOPE_TH.items():
            ok = m & (S <= th) & asp_ok & elev_ok
            ok_s = m & (S <= th) & asp_strict & elev_ok
            slope_only = m & (S <= th)
            cat.append({
                "지표": "⑥ 경사·향 적합면적 비율", "대상": name, "임계값": lab,
                "값(%)": round(ok.sum() / n * 100, 1), "적합면적(ha)": round(ok.sum() * CELL_HA, 1),
                "경사 단독 충족(%)": round(slope_only.sum() / n * 100, 1),
                "향 엄격 적용 시(%)": round(ok_s.sum() / n * 100, 1),
                "판정 조건": f"경사 ≤ {th}% AND 향 {ASPECT_RANGE[0]}~{ASPECT_RANGE[1]}°(경사 {FLAT_SLOPE}% 미만 평탄 셀은 향 무관) AND 표고 ≤ {ref:.1f}+{ELEV_MARGIN}m",
                "DEM 출처": dem_meta["source"], "해상도": "90m 셀(0.81ha) — z13 타일 평균 재표본",
                "브이월드 레이어": "LT_C_ADSIGG_INFO(경계) · LT_C_UQ111~113(용도지역)",
                "조회일": dem_meta["queried_on"], "비고": "임계값 10·15·25%는 교재 범위(원본 19번) 안의 가정",
            })
        if k != "GU":
            np.save(OUT.parent / "data" / f"mask_{k}.npy", m)
    pd.DataFrame(rows).set_index("후보지").T.to_csv(OUT / "site_factors.csv", encoding="utf-8-sig")
    pd.DataFrame(cat).to_csv(OUT / "indicator6_catalog.csv", index=False, encoding="utf-8-sig")
    np.savez_compressed(ROOT / "data" / "site_grids.npz", d_art=d_art, d_ic=d_ic, d_st=d_st, d_riv=d_riv,
                        d_res=d_res, d_urb=d_urb, asp_ok=asp_ok)
    print(pd.DataFrame(rows).set_index("후보지").T.to_string())
    print(pd.DataFrame(cat)[["대상", "임계값", "값(%)", "적합면적(ha)", "경사 단독 충족(%)", "향 엄격 적용 시(%)"]].to_string())

    # ---- 그림 1: 후보지 위치 (용도지역 + 후보지 경계)
    col = {"주거": "#f2cf5b", "상업": "#e0603a", "공업": "#9b7aa0", "녹지": "#7cb366",
           "관리": "#c3dfa8", "농림": "#c9ad80", "자연환경보전": "#3f7d4e"}
    fig, ax = plt.subplots(figsize=(9, 9))
    for zn, grp, g in zs:
        g = g.intersection(gu)
        for p in getattr(g, "geoms", [g]):
            if p.geom_type == "Polygon":
                ax.fill(*p.exterior.xy, color=col.get(grp, "#ddd"), lw=0)
    for p in getattr(gu, "geoms", [gu]):
        ax.plot(*p.exterior.xy, color="k", lw=1.5)
    for rv in rivers:
        for p in getattr(rv, "geoms", [rv]):
            if p.geom_type == "Polygon":
                ax.fill(*p.exterior.xy, color="#5aa9e6", lw=0)
    for g in arterial:
        ax.plot(*g.xy, color="#555", lw=.6)
    for k, (name, poly) in cands.items():
        for p in getattr(poly, "geoms", [poly]):
            ax.plot(*p.exterior.xy, color="#c1121f", lw=2.2)
        c = poly.envelope.centroid
        ax.text(c.x, poly.bounds[3] + 150, f"후보지 {k}", color="#c1121f", fontsize=12, weight="bold", ha="center")
    for n, p in st:
        if gu.buffer(1500).contains(p):
            ax.plot(p.x, p.y, "s", color="#1d3557", ms=7); ax.text(p.x + 120, p.y, n + "역", fontsize=8, color="#1d3557")
    seen = set()
    for n, p in ic:
        if gu.buffer(1500).contains(p) and n and n not in seen:
            seen.add(n); ax.plot(p.x, p.y, "^", color="#2a9d8f", ms=7); ax.text(p.x + 120, p.y, n, fontsize=8, color="#2a9d8f")
    for grp, c in col.items():
        ax.plot([], [], "s", color=c, ms=10, label=grp + "지역")
    ax.plot([], [], color="#555", label="간선도로(OSM)"); ax.plot([], [], "s", color="#1d3557", label="철도역"); ax.plot([], [], "^", color="#2a9d8f", label="IC·분기점")
    ax.legend(loc="upper left", bbox_to_anchor=(1.01, 1), fontsize=8, frameon=False)
    x0, y0, x1, y1 = gu.bounds
    ax.set_xlim(x0 - 300, x1 + 300); ax.set_ylim(y0 - 300, y1 + 300); ax.set_aspect("equal")
    ax.set_xticks([]); ax.set_yticks([])
    ax.set_title("화성시 동탄구 현행 용도지역과 후보지 2곳", fontsize=13)
    ax.annotate("N", xy=(x1, y1 - 200), xytext=(x1, y1 - 900), ha="center", fontsize=12,
                arrowprops=dict(arrowstyle="-|>", color="k"))
    ax.text(x0, y0 - 250, f"자료: VWorld 2D 데이터 API 2.0 (조회 {TODAY}) · OSM © contributors · EPSG:5186", fontsize=7)
    plt.savefig(OUT / "fig1_candidates.png", dpi=200, bbox_inches="tight"); plt.close()

    # ---- 그림 2: 후보지별 적합 셀 지도 (기준안 15%)
    fig, axs = plt.subplots(1, 2, figsize=(12, 6))
    for ax, (k, (name, poly)) in zip(axs, cands.items()):
        m = masks[k]
        near = in_urban & shapely.contains_xy(poly.buffer(1000), CX, CY)
        ref = float(np.nanmean(E[near]))
        cls = np.full(S.shape, np.nan)
        cls[m] = 0
        cls[m & (S <= 25) & asp_ok & (E <= ref + 50)] = 1
        cls[m & (S <= 15) & asp_ok & (E <= ref + 50)] = 2
        cls[m & (S <= 10) & asp_ok & (E <= ref + 50)] = 3
        ext = [CX[0, 0] - 45, CX[0, -1] + 45, CY[-1, 0] - 45, CY[0, 0] + 45]
        cm = matplotlib.colors.ListedColormap(["#d9d9d9", "#fde68a", "#86c06c", "#2f7d4f"])
        ax.imshow(cls, extent=ext, cmap=cm, vmin=-.5, vmax=3.5, interpolation="nearest")
        for p in getattr(poly, "geoms", [poly]):
            ax.plot(*p.exterior.xy, color="#c1121f", lw=1.5)
        b = poly.bounds
        ax.set_xlim(b[0] - 200, b[2] + 200); ax.set_ylim(b[1] - 200, b[3] + 200)
        ax.set_xticks([]); ax.set_yticks([]); ax.set_title(name, fontsize=10)
    for lab, c in zip(["부적합(경사>25% 또는 북향·고표고)", "25% 이하 적합", "15% 이하 적합(기준안)", "10% 이하 적합"],
                      ["#d9d9d9", "#fde68a", "#86c06c", "#2f7d4f"]):
        axs[1].plot([], [], "s", color=c, ms=10, label=lab)
    fig.legend(*axs[1].get_legend_handles_labels(), loc="lower center", ncol=4, fontsize=8, frameon=False)
    fig.suptitle("지표 ⑥ 경사·향·표고 동시 충족 셀 — DEM 90m 격자", fontsize=13)
    plt.savefig(OUT / "fig2_indicator6_map.png", dpi=200, bbox_inches="tight"); plt.close()

    # ---- 그림 3: 지표 ⑥ 막대 (임계값 3개 × 후보지)
    df = pd.DataFrame(cat)
    df = df[df["대상"] != targets["GU"][0]]
    fig, ax = plt.subplots(figsize=(8, 4.5))
    labs = list(SLOPE_TH)
    w = .36
    for i, (k, (name, _)) in enumerate(cands.items()):
        v = [df[(df["대상"] == name) & (df["임계값"] == l)]["값(%)"].iloc[0] for l in labs]
        bars = ax.bar(np.arange(3) + (i - .5) * w, v, w, label=name, color=["#3a6ea5", "#c97b38"][i])
        ax.bar_label(bars, fmt="%.1f%%", fontsize=9)
    ax.set_xticks(range(3)); ax.set_xticklabels(labs); ax.set_ylabel("적합면적 비율 (%)")
    ax.set_ylim(0, 100); ax.spines[["top", "right"]].set_visible(False); ax.legend(fontsize=8, frameon=False)
    ax.set_title("지표 ⑥ — 경사 임계값별 적합면적 비율 (향 135~225° · 표고 +50m 동시 충족)", fontsize=10)
    plt.savefig(OUT / "fig3_indicator6_bar.png", dpi=200, bbox_inches="tight"); plt.close()


if __name__ == "__main__":
    main()
