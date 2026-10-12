"""06 배분 대안 3안 — 후보지 A(장지동 남측), DEM 90m 격자

작업순서(샤핀·카이저): ➀ 녹지 → ➁ 공업 → ➂ 상업·업무 → ➃ 주거(잔여지)
- 녹지 공통 선확정(3안 동일): 경사 25% 초과 · 보전관리지역 · 기결정 공원·녹지시설 · 하천 50m
- 대안별로 바꾸는 것은 '추가 녹지 규칙'과 '개발 허용 경사·용도 프로그램' 뿐 (녹지 확정 후 배분만 변경)
- 지표·가중치·채점 구간은 data/approved_weights.json (대안 작성 전 승인본) 에서만 읽는다
"""
import json
from collections import deque

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import shapely
from shapely.geometry import shape
from shapely.ops import unary_union

from common import CELL, CELL_HA, OUT, ROOT, candidates, grid, gu_polygon, load, tg, zones

plt.rcParams["font.family"] = "Malgun Gothic"
plt.rcParams["axes.unicode_minus"] = False

W = json.loads((ROOT / "data" / "approved_weights.json").read_text(encoding="utf-8"))
TARGET = W["target_population"]
DENS = W["net_residential_density_per_ha"]
ROAD = W["road_share_of_developed"]

G, IND, COM, RES = 1, 2, 3, 4          # 녹지 · 공업 · 상업업무 · 주거
NAMES = {G: "공원·녹지", IND: "공업", COM: "상업·업무", RES: "주거"}
COLORS = {0: "#ffffff", G: "#5f9e57", IND: "#9b7aa0", COM: "#e0603a", RES: "#f2cf5b"}

# 대안 정의 — 배분 순서는 동일, 규칙만 다름 (대안 작성 시 정한 값)
ALTS = {
    # farm: 농림지역 보전 규칙 — "all" 전부 보전 · 숫자 = 그 경사(%) 초과 농림 셀 보전 · None 보전 안 함
    "대안 A · 보전 우선": dict(extra_green_slope=15, green_high=True, river_buf=150, farm="all",
                          ind_ha=0, com_ha=6, dev_max_slope=15),
    "대안 B · 개발 우선": dict(extra_green_slope=None, green_high=False, river_buf=50, farm=None,
                          ind_ha=25, com_ha=12, dev_max_slope=25),
    "대안 C · 절충": dict(extra_green_slope=20, green_high=True, river_buf=100, farm=15,
                       ind_ha=12, com_ha=9, dev_max_slope=20, buffer_green=True),
}


def score(val, ind):
    b = ind["bands"]
    if ind["direction"] == "+":
        s = 1 + sum(val >= x for x in b)
    else:
        s = 1 + sum(val <= x for x in b)
    if ind["id"] == "I4" and val < 12:
        s = 1
    return int(s)


def neighbors(r, c, shp):
    for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        rr, cc = r + dr, c + dc
        if 0 <= rr < shp[0] and 0 <= cc < shp[1]:
            yield rr, cc


def grow(seed_order, allowed, need):
    """allowed 셀 중 seed_order(우선순위) 첫 셀에서 시작해 인접 확장 — 덩어리 배분"""
    chosen = np.zeros_like(allowed)
    if need <= 0:
        return chosen
    pri = {tuple(x): i for i, x in enumerate(seed_order)}
    while chosen.sum() < need:
        seeds = [x for x in seed_order if allowed[tuple(x)] and not chosen[tuple(x)]]
        if not seeds:
            break
        q = [tuple(seeds[0])]
        while q and chosen.sum() < need:
            q.sort(key=lambda x: pri.get(x, 1e9))
            cur = q.pop(0)
            if chosen[cur] or not allowed[cur]:
                continue
            chosen[cur] = True
            q += [n for n in neighbors(*cur, allowed.shape) if allowed[n] and not chosen[n]]
    return chosen


def main():
    gu = gu_polygon()
    zs = zones()
    cands, urban = candidates(gu, zs)
    name, poly = cands["A"]
    S, Asp, E, CX, CY = grid()
    g = np.load(ROOT / "data" / "site_grids.npz")
    d_art, d_urb, d_riv, d_res, asp_ok = g["d_art"], g["d_urb"], g["d_riv"], g["d_res"], g["asp_ok"]
    d_ic = g["d_ic"]
    m = np.load(ROOT / "data" / "mask_A.npy")
    in_urban = shapely.contains_xy(urban, CX, CY)
    near = in_urban & shapely.contains_xy(poly.buffer(1000), CX, CY)
    ref = float(np.nanmean(E[near]))
    elev_ok = E <= ref + 50
    suit6 = (S <= 15) & asp_ok & elev_ok

    cons = unary_union([gg for zn, grp, gg in zs if zn in ("보전관리지역", "보전녹지지역")])
    park = unary_union([tg(shape(f["geometry"])).buffer(0) for f in load("LT_C_UPISUQ153")])
    in_cons = shapely.contains_xy(cons, CX, CY)
    farm = unary_union([gg for zn, grp, gg in zs if grp == "농림"])
    in_farm = shapely.contains_xy(farm, CX, CY)
    in_park = shapely.contains_xy(park, CX, CY)
    core = m & ((S > 25) | in_cons | in_park | (d_riv <= 50))
    n_total = int(m.sum())
    site_ha = n_total * CELL_HA
    park_std = max(TARGET * 9 / 1e4, site_ha * 0.12)  # 도시공원법 시행규칙 별표 2 — 100만㎡ 이상

    rows, plans = [], {}
    for alt, p in ALTS.items():
        lu = np.zeros(S.shape, dtype=int)
        # ➀ 녹지 — 공통 선확정 + 대안별 추가
        green = core.copy()
        if p["extra_green_slope"] is not None:
            green |= m & (S > p["extra_green_slope"])
        if p["green_high"]:
            green |= m & ~elev_ok
        green |= m & (d_riv <= p["river_buf"])
        if p["farm"] == "all":
            green |= m & in_farm
        elif p["farm"] is not None:
            green |= m & in_farm & (S > p["farm"])
        # 법정 확보기준 미달 시 경사 큰 셀부터 추가
        if green.sum() * CELL_HA < park_std:
            idx = np.argwhere(m & ~green)
            idx = sorted(idx, key=lambda x: -S[tuple(x)])
            for x in idx[: int(np.ceil(park_std / CELL_HA - green.sum()))]:
                green[tuple(x)] = True
        lu[green] = G
        dev_ok = m & ~green & (S <= p["dev_max_slope"])
        # ➁ 공업 — 경사 5% 이하 우선(부족 시 8% 이하), IC·간선 가까운 순, 기존 주거지에서 먼 쪽
        if p["ind_ha"]:
            allow = dev_ok & (S <= 8)
            order = sorted(np.argwhere(allow), key=lambda x: (S[tuple(x)] > 5, d_ic[tuple(x)] + d_art[tuple(x)] - 0.5 * d_res[tuple(x)]))
            ind = grow(order, allow, int(round(p["ind_ha"] / CELL_HA)))
            lu[ind] = IND
            if p.get("buffer_green"):  # 대안 C: 공업 둘레 1셀 완충녹지
                buf = np.zeros_like(ind)
                for r, c in np.argwhere(ind):
                    for n in neighbors(r, c, ind.shape):
                        buf[n] = True
                buf &= m & (lu == 0)
                lu[buf] = G
        # ➂ 상업·업무 — 간선도로·기존 시가지 가까운 완경사 셀
        allow = dev_ok & (lu == 0) & (S <= 10)
        order = sorted(np.argwhere(allow), key=lambda x: d_art[tuple(x)] + d_urb[tuple(x)])
        com = grow(order, allow, int(round(p["com_ha"] / CELL_HA)))
        lu[com] = COM
        # ➃ 주거 — 잔여 개발가능지 전부
        lu[dev_ok & (lu == 0)] = RES
        # 개발 불가 잔여지 → 녹지(자연녹지 유보)
        lu[m & (lu == 0)] = G
        plans[alt] = lu

        cnt = {k: int(((lu == k) & m).sum()) for k in NAMES}
        dev_cells = m & np.isin(lu, [IND, COM, RES])
        res_ha = cnt[RES] * CELL_HA * (1 - ROAD)
        pop = res_ha * DENS
        com_pts = np.argwhere(lu == COM)
        if len(com_pts):
            cp = shapely.points(CX[lu == COM], CY[lu == COM])
            rp = shapely.points(CX[lu == RES], CY[lu == RES])
            dist = shapely.distance(rp, shapely.multipoints(cp)) if len(rp) else np.array([])
            near_com = float((dist <= 500).mean() * 100) if len(dist) else 0.0
        else:
            near_com = 0.0
        dev_ha = dev_cells.sum() * CELL_HA
        val = {
            "I1": (cnt[IND] + cnt[COM]) / n_total * 100,
            "I2": near_com,
            "I3": float(d_art[dev_cells].mean()) if dev_cells.any() else 0,
            "I4": cnt[G] / n_total * 100,
            "I5": float(suit6[dev_cells].mean() * 100) if dev_cells.any() else 0,
            "I6": pop / TARGET * 100,
        }
        row = {"대안": alt}
        for k in (G, IND, COM, RES):
            row[f"{NAMES[k]}(ha)"] = round(cnt[k] * CELL_HA, 1)
            row[f"{NAMES[k]}(%)"] = round(cnt[k] / n_total * 100, 1)
        row.update({"개발용지(ha)": round(dev_ha, 1), "그중 도로·기반시설 20%(ha)": round(dev_ha * ROAD, 1),
                    "주거 순면적(ha)": round(res_ha, 1), "수용인구(명)": int(round(pop, -1)),
                    "공원 법정 확보기준(ha)": round(park_std, 1)})
        for ind in W["indicators"]:
            row[ind["id"]] = round(val[ind["id"]], 1)
        rows.append(row)
    df = pd.DataFrame(rows).set_index("대안")
    df.to_csv(OUT / "alternatives_landuse.csv", encoding="utf-8-sig")
    np.savez_compressed(ROOT / "data" / "alt_plans.npz", **{f"p{i}": v for i, v in enumerate(plans.values())})
    print(df.T.to_string())
    print("site_ha", site_ha, "ref elev", ref, "core green ha", core.sum() * CELL_HA)

    # ---- 그림 4: 대안 3안 토지이용 배분도
    fig, axs = plt.subplots(1, 3, figsize=(15, 5.6))
    cmap = matplotlib.colors.ListedColormap([COLORS[k] for k in range(5)])
    ext = [CX[0, 0] - 45, CX[0, -1] + 45, CY[-1, 0] - 45, CY[0, 0] + 45]
    b = poly.bounds
    for ax, (alt, lu) in zip(axs, plans.items()):
        img = np.where(m, lu, np.nan)
        ax.imshow(img, extent=ext, cmap=cmap, vmin=-.5, vmax=4.5, interpolation="nearest")
        ax.contourf(CX, CY, np.where(m & core, 1, 0), levels=[.5, 1.5], colors="none", hatches=["///"])
        for pp in getattr(poly, "geoms", [poly]):
            ax.plot(*pp.exterior.xy, color="#c1121f", lw=1.2)
        ax.set_xlim(b[0] - 150, b[2] + 150); ax.set_ylim(b[1] - 150, b[3] + 150)
        ax.set_aspect("equal"); ax.set_xticks([]); ax.set_yticks([])
        r = df.loc[alt]
        ax.set_title(f"{alt}\n녹지 {r['공원·녹지(%)']}% · 주거 {r['주거(%)']}% · 수용 {int(r['수용인구(명)']):,}명", fontsize=10)
    for k in (G, IND, COM, RES):
        axs[2].plot([], [], "s", color=COLORS[k], ms=10, label=NAMES[k])
    axs[2].fill([], [], fill=False, hatch="///", label="공통 선확정 녹지")
    fig.legend(*axs[2].get_legend_handles_labels(), loc="lower center", ncol=5, fontsize=9, frameon=False)
    fig.suptitle("후보지 A 배분 대안 3안 — ① 녹지 → ② 공업 → ③ 상업·업무 → ④ 주거 (DEM 90m 격자, 셀 0.81ha)", fontsize=12)
    plt.savefig(OUT / "fig4_alternatives.png", dpi=200, bbox_inches="tight"); plt.close()


if __name__ == "__main__":
    main()
