"""05 입지인자 4축 표 — 후보지 2곳 × 4개 용도 × 4개 축(지형·접근성·주변환경·기반시설)

요건 문장·수치 기준·근거 번호는 6주차 원본 강의자료 13~21번(《토지이용계획론》 2015) 기준.
대상지 값은 04_site_analysis.py 산출(outputs/site_factors.csv)에서 읽는다.
판정: ○ 충족 · △ 부분 충족 · × 미충족
"""
import numpy as np
import pandas as pd

from common import OUT, ROOT, grid

f = pd.read_csv(OUT / "site_factors.csv", index_col=0, encoding="utf-8-sig")
v = lambda k, c: float(f.loc[c, k])  # noqa: E731
S, A, E, CX, CY = grid()


def largest_flat_patch(key, th=5):
    m = np.load(ROOT / "data" / f"mask_{key}.npy") & (S <= th)
    seen = np.zeros_like(m)
    best = 0
    for r, c in np.argwhere(m):
        if seen[r, c]:
            continue
        stack, n = [(r, c)], 0
        seen[r, c] = True
        while stack:
            y, x = stack.pop(); n += 1
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < m.shape[0] and 0 <= xx < m.shape[1] and m[yy, xx] and not seen[yy, xx]:
                    seen[yy, xx] = True; stack.append((yy, xx))
        best = max(best, n)
    return best * 0.81


def j(ok, part=None):
    return "○" if ok else ("△" if part else "×")


rows = []


def add(use, axis, req, crit, src, fa, fb):
    """fa/fb: (값 문자열, 판정)"""
    rows.append({"용도": use, "축": axis, "요건 문장": req, "수치 기준": crit, "근거": src,
                 "후보지 A 값": fa[0], "A 판정": fa[1], "후보지 B 값": fb[0], "B 판정": fb[1]})


def site(k):
    return dict(
        s10=v(k, "경사 ≤10% 비율(%)"), s15=v(k, "경사 ≤15% 비율(%)"), s5=v(k, "경사 ≤5% 비율(%)"),
        s25=v(k, "경사 >25% 비율(%)"), south=v(k, "남향(135~225°) 셀 비율(%)"),
        art=v(k, "간선도로 평균거리(m)"), ic=v(k, "IC 최단거리(m)"), icn=f.loc["IC 최근접", k],
        st=v(k, "철도역 평균거리(m)"), res=v(k, "기존 주거지역 평균거리(m)"),
        urb=v(k, "기존 시가지 인접 셀(≤300m, %)"), ww=v(k, "하수처리시설 평균거리(m)"),
        park=v(k, "기결정 공원·녹지시설(ha)"), farm=v(k, "용도지역 농림(ha)"), mgmt=v(k, "용도지역 관리(ha)"),
        area=v(k, "면적(ha·폴리곤)"), elev=v(k, "표고 평균(m)"), ref=v(k, "기반시설 기준표고(m)"),
        flat=largest_flat_patch(k),
    )


a, b = site("A"), site("B")
P = {"A": a, "B": b}

# ---------------- 녹지
add("녹지", "지형", "경사 25% 초과 산지와 재난위험지대 같은 시가화 부적당지는 녹지로 먼저 확정한다",
    "경사 > 25% 셀 → 녹지 선확정", "원본 13·14번",
    *[(f"25% 초과 {P[k]['s25']}% ({P[k]['s25'] * P[k]['area'] / 100:.0f}ha)", "○") for k in "AB"])
add("녹지", "접근성", "녹지는 근린주구 생활권 안의 일상 이용 거리에 둔다",
    "생활권공원 유치거리 250·500·1,000m", "원본 13·14번 · 도시공원법 시행규칙 별표 3",
    *[(f"기존 주거지역까지 평균 {P[k]['res']:,.0f}m", j(P[k]['res'] <= 500, P[k]['res'] <= 1000)) for k in "AB"])
add("녹지", "주변환경", "풍치·산림 보전 대상과 위험시설 완충이 필요한 땅을 보전·완충녹지로 둔다",
    "농림지역·보전관리지역 면적", "원본 13·14번 · 국토계획법 제36조",
    *[(f"농림 {P[k]['farm']:.0f}ha · 관리 {P[k]['mgmt']:.0f}ha", "○") for k in "AB"])
add("녹지", "기반시설", "녹지체계 위계(환상·방사·격자·분산)에 맞도록 기결정 공원·녹지와 잇는다",
    "기결정 공원·녹지시설 연접", "원본 13·14번 · 도시공원법 제35조",
    *[(f"기결정 공원·녹지 {P[k]['park']:.1f}ha 포함", j(P[k]['park'] >= 20, P[k]['park'] > 0)) for k in "AB"])

# ---------------- 상업업무
add("상업업무", "지형", "유통·상업시설은 경사 5% 이하 평지에 둔다",
    "경사 ≤ 5% 셀 비율", "원본 17번",
    *[(f"5% 이하 {P[k]['s5']}% (최대 연속 {P[k]['flat']:.1f}ha)", j(P[k]['s5'] >= 30, P[k]['flat'] >= 5)) for k in "AB"])
add("상업업무", "접근성", "근린상업은 주거지에 인접하고, 일반상업은 간선 교차점이나 교통결절에 둔다",
    "간선도로 ≤ 500m · 철도역 ≤ 1km", "원본 15~17번",
    *[(f"간선 {P[k]['art']:,.0f}m · 역 {P[k]['st']:,.0f}m", j(P[k]['art'] <= 500 and P[k]['st'] <= 1000, P[k]['art'] <= 800)) for k in "AB"])
add("상업업무", "주변환경", "근린상업은 녹지와 이어 쾌적성을 유지하고, 유통상업은 인접지 환경을 보전한다",
    "녹지 연계 가능(기결정 공원·녹지 연접)", "원본 17번",
    *[(f"기결정 공원·녹지 {P[k]['park']:.1f}ha", j(P[k]['park'] >= 20, P[k]['park'] > 0)) for k in "AB"])
add("상업업무", "기반시설", "근린상업은 3~5만 명 배후인구와 물류망을 확보한다",
    "기존 시가지 300m 이내 셀 비율", "원본 16·17번",
    *[(f"시가지 인접 {P[k]['urb']}%", j(P[k]['urb'] >= 50, P[k]['urb'] >= 20)) for k in "AB"])

# ---------------- 주거
add("주거", "지형", "주거지는 경사 4~10%를 바람직한 범위로, 25%를 개발 한계로 두고 표고는 기반시설 +50m 이내로 한다",
    "경사 ≤ 10%(바람직) · ≤ 25%(한계) · 표고 ≤ 기준 +50m", "원본 19번",
    *[(f"10% 이하 {P[k]['s10']}% · 25% 초과 {P[k]['s25']}% · 평균표고 {P[k]['elev']:.0f}m(기준 {P[k]['ref']:.0f}+50)",
       j(P[k]['s10'] >= 50 and P[k]['s25'] < 10, P[k]['s25'] < 10)) for k in "AB"])
add("주거", "접근성", "주거지는 직장·편익시설에 가깝고 간선도로·휴식공간과 이어진다",
    "간선도로 ≤ 500m · 기존 주거지 ≤ 500m", "원본 19번",
    *[(f"간선 {P[k]['art']:,.0f}m · 기존 주거지 {P[k]['res']:,.0f}m", j(P[k]['art'] <= 500 and P[k]['res'] <= 500, P[k]['art'] <= 600)) for k in "AB"])
add("주거", "주변환경", "주거지는 오염원과 떨어진 남경사지에 두고 녹지·수변과 잇는다",
    "향 135~225° 셀 비율 ≥ 30%", "원본 19번",
    *[(f"남향 {P[k]['south']}%", j(P[k]['south'] >= 30, P[k]['south'] >= 15)) for k in "AB"])
add("주거", "기반시설", "주거지는 도로·가스·전기 공급망이 이미 갖춰진 곳에 이어 붙인다",
    "기존 시가지 300m 이내 셀 비율", "원본 19번",
    *[(f"시가지 인접 {P[k]['urb']}%", j(P[k]['urb'] >= 50, P[k]['urb'] >= 20)) for k in "AB"])

# ---------------- 공업
add("공업", "지형", "공업지는 경사 5% 이하이고 최소규모 이상인 평탄지에 둔다",
    "경사 ≤ 5% 연속 ≥ 10ha", "원본 21번",
    *[(f"5% 이하 최대 연속 {P[k]['flat']:.1f}ha", j(P[k]['flat'] >= 10, P[k]['flat'] >= 5)) for k in "AB"])
add("공업", "접근성", "공업지는 화물 수송을 위해 간선교통(IC)에 바로 이어진다",
    "IC ≤ 2km", "원본 21번",
    *[(f"IC 최단 {P[k]['ic']:,.0f}m({P[k]['icn']})", j(P[k]['ic'] <= 2000)) for k in "AB"])
add("공업", "주변환경", "공업지는 시가지와 떨어뜨리고 완충녹지와 확장 여지를 둔다",
    "기존 주거지 평균거리 ≥ 500m", "원본 21번 · 시행령 제30조",
    *[(f"기존 주거지 {P[k]['res']:,.0f}m", j(P[k]['res'] >= 500, P[k]['res'] >= 300)) for k in "AB"])
add("공업", "기반시설", "공업지는 폐수·폐기물 처리가 쉽고 용수·동력을 확보할 수 있는 곳에 둔다",
    "공공하수처리시설 ≤ 5km(OSM 기재 시설 기준)", "원본 21번",
    *[(f"하수처리시설 {P[k]['ww'] / 1000:.1f}km", j(P[k]['ww'] <= 5000)) for k in "AB"])

df = pd.DataFrame(rows)
df.to_csv(OUT / "four_axis_table.csv", index=False, encoding="utf-8-sig")

# 용도별 판정 요약 (○=2, △=1, ×=0)
pt = {"○": 2, "△": 1, "×": 0}
summ = []
for use in ["녹지", "상업업무", "주거", "공업"]:
    d = df[df["용도"] == use]
    sa, sb = d["A 판정"].map(pt).sum(), d["B 판정"].map(pt).sum()
    summ.append({"용도": use, "후보지 A 점수(8점 만점)": sa, "후보지 B 점수(8점 만점)": sb,
                 "우위": "A" if sa > sb else ("B" if sb > sa else "동률")})
s = pd.DataFrame(summ)
s.to_csv(OUT / "four_axis_summary.csv", index=False, encoding="utf-8-sig")
print(df[["용도", "축", "후보지 A 값", "A 판정", "후보지 B 값", "B 판정"]].to_string())
print(s.to_string())
