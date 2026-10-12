"""08 제출 보고서 — outputs/*.csv · fig*.png → report.html → Edge headless 로 PDF 변환"""
import base64
import json
import subprocess
import sys
from pathlib import Path

import pandas as pd

from common import OUT, ROOT

# --public : 학번을 뺀 공개용 PDF(docs/files/) — 제출용은 인자 없이 실행
PUBLIC = "--public" in sys.argv
# 학번이 든 팀원 줄은 깃에 올리지 않는 team_private.txt 에서 읽는다
_PRIVATE = ROOT / "team_private.txt"
TEAM = ("신재훈 · 이제준 · 전세진 · 김채우 · Elisa" if PUBLIC or not _PRIVATE.exists()
        else _PRIVATE.read_text(encoding="utf-8").strip())

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
W = json.loads((ROOT / "data" / "approved_weights.json").read_text(encoding="utf-8"))
dem = json.loads((ROOT / "data" / "dem_meta.json").read_text(encoding="utf-8"))
osm_meta = json.loads((ROOT / "data" / "raw" / "osm_access.json").read_text(encoding="utf-8"))["_meta"]
f4 = pd.read_csv(OUT / "four_axis_table.csv", encoding="utf-8-sig")
f4s = pd.read_csv(OUT / "four_axis_summary.csv", encoding="utf-8-sig")
i6 = pd.read_csv(OUT / "indicator6_catalog.csv", encoding="utf-8-sig")
sf = pd.read_csv(OUT / "site_factors.csv", index_col=0, encoding="utf-8-sig")
alt = pd.read_csv(OUT / "alternatives_landuse.csv", index_col=0, encoding="utf-8-sig")
mat = pd.read_csv(OUT / "matrix.csv", index_col=0, encoding="utf-8-sig")
rv = pd.read_csv(OUT / "weight_reversal.csv", encoding="utf-8-sig")
cat = pd.read_csv(ROOT / "data" / "catalog_requests.csv", encoding="utf-8-sig")
INDS = W["indicators"]


def img(name):
    b = base64.b64encode((OUT / name).read_bytes()).decode()
    return f'<img src="data:image/png;base64,{b}">'


def table(df, cls="", index=False):
    return df.to_html(index=index, classes=cls, border=0, escape=True, na_rep="—")


def jcell(x):
    c = {"○": "ok", "△": "part", "×": "no"}.get(x, "")
    return f'<td class="j {c}">{x}</td>'


# 4축 표
rows4 = []
for use, d in f4.groupby("용도", sort=False):
    for n, (_, r) in enumerate(d.iterrows()):
        head = f'<td rowspan="{len(d)}" class="use">{use}</td>' if n == 0 else ""
        rows4.append(f"<tr>{head}<td>{r['축']}</td><td class='req'>{r['요건 문장']}<div class='crit'>{r['수치 기준']}</div></td>"
                     f"<td class='src'>{r['근거']}</td><td>{r['후보지 A 값']}</td>{jcell(r['A 판정'])}"
                     f"<td>{r['후보지 B 값']}</td>{jcell(r['B 판정'])}</tr>")
four = ("<table class='t4'><thead><tr><th>용도</th><th>축</th><th>요건 문장 · 수치 기준</th><th>근거</th>"
        "<th>후보지 A 값</th><th>A</th><th>후보지 B 값</th><th>B</th></tr></thead><tbody>" + "".join(rows4) + "</tbody></table>")

name_a, name_b = sf.loc["이름", "A"], sf.loc["이름", "B"]
i6v = i6[i6["대상"] != "화성시 동탄구 전체(참고)"]
i6t = i6v.pivot(index="임계값", columns="대상", values="값(%)").loc[["하한 10%", "기준안 15%", "상한 25%"]]
i6ha = i6v.pivot(index="임계값", columns="대상", values="적합면적(ha)").loc[["하한 10%", "기준안 15%", "상한 25%"]]
i6tab = pd.DataFrame({
    "임계값": i6t.index,
    "A 비율(%)": i6t[name_a].values, "A 면적(ha)": i6ha[name_a].values,
    "B 비율(%)": i6t[name_b].values, "B 면적(ha)": i6ha[name_b].values,
    "동탄구 전체(%)": i6[i6["대상"] == "화성시 동탄구 전체(참고)"].set_index("임계값").loc[i6t.index, "값(%)"].values,
})
i6ex = i6v[["대상", "임계값", "값(%)", "경사 단독 충족(%)", "향 엄격 적용 시(%)"]]

# 매트릭스
ind_head = "".join(f"<th>{i['criterion']}<div class='crit'>{i['name']} ({i['unit']}, {'↑' if i['direction'] == '+' else '↓'})</div></th>" for i in INDS)
w_row = "".join(f"<td>{i['weight']:.2f}</td>" for i in INDS)
mrows = []
for a in mat.index:
    cells = "".join(f"<td><b>{int(mat.loc[a, i['id']])}</b><div class='crit'>{alt.loc[a, i['id']]}</div></td>" for i in INDS)
    top = " class='top'" if mat.loc[a, "순위"] == 1 else ""
    mrows.append(f"<tr{top}><td class='use' style='white-space:nowrap'>{a}</td>{cells}<td><b>{mat.loc[a, '가중 총점']:.2f}</b></td><td>{int(mat.loc[a, '순위'])}</td></tr>")
matrix = (f"<table class='mx'><thead><tr><th>대안</th>{ind_head}<th>가중 총점</th><th>순위</th></tr></thead><tbody>"
          f"<tr class='w'><td>가중치(승인)</td>{w_row}<td>1.00</td><td></td></tr>" + "".join(mrows) + "</tbody></table>")
band_rows = []
for i in INDS:
    b = i["bands"]
    bands = ([f"&lt; {b[0]}", f"{b[0]}~{b[1]}", f"{b[1]}~{b[2]}", f"{b[2]}~{b[3]}", f"≥ {b[3]}"] if i["direction"] == "+"
             else [f"&gt; {b[0]}", f"{b[1]}~{b[0]}", f"{b[2]}~{b[1]}", f"{b[3]}~{b[2]}", f"≤ {b[3]}"])
    band_rows.append(f"<tr><td>{i['criterion']}</td><td>{i['name']}</td><td>{i['unit']}</td>" + "".join(f"<td>{x}</td>" for x in bands) + "</tr>")
bands = ("<table class='bd'><thead><tr><th>기준</th><th>지표</th><th>단위</th><th>1점</th><th>2점</th><th>3점</th><th>4점</th><th>5점</th></tr></thead><tbody>"
         + "".join(band_rows) + "</tbody></table>")

order = mat.sort_values("가중 총점", ascending=False)
first, second = order.index[0], order.index[1]
tightest = rv.dropna(subset=["역전 가중치"]).sort_values("여유폭(%p)").iloc[0]

land = alt[["공원·녹지(ha)", "공원·녹지(%)", "공업(ha)", "공업(%)", "상업·업무(ha)", "상업·업무(%)", "주거(ha)", "주거(%)",
            "개발용지(ha)", "주거 순면적(ha)", "수용인구(명)", "공원 법정 확보기준(ha)"]].T
land.index.name = "항목"

cat_v = cat[["layer", "status", "record_total", "queried_on", "request_url_without_key"]].copy()
cat_v["request_url_without_key"] = cat_v["request_url_without_key"].str.replace("&", "&\u200b")

html = f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>6주차 과제 — 동탄 입지배분과 대안</title>
<style>
@page {{ size: A4; margin: 14mm 13mm 16mm; }}
* {{ box-sizing: border-box; }}
body {{ font-family: 'Malgun Gothic', sans-serif; font-size: 9.3pt; color: #1b1f24; line-height: 1.55; }}
h1 {{ font-size: 21pt; margin: 0 0 6px; color: #12355b; }}
h2 {{ font-size: 13pt; color: #12355b; border-bottom: 2px solid #12355b; padding-bottom: 3px; margin: 20px 0 8px; break-after: avoid; }}
h3 {{ font-size: 10.5pt; margin: 12px 0 5px; color: #234; break-after: avoid; }}
p {{ margin: 4px 0 6px; }}
.cover {{ height: 255mm; display: flex; flex-direction: column; justify-content: center; page-break-after: always; }}
.cover .sub {{ font-size: 12pt; color: #456; margin-bottom: 26px; }}
.cover table {{ font-size: 10.5pt; width: 70%; }}
.cover td {{ padding: 5px 8px; border-bottom: 1px solid #ccd; }}
table {{ border-collapse: collapse; width: 100%; margin: 6px 0 10px; font-size: 8.2pt; break-inside: auto; }}
th {{ background: #12355b; color: #fff; padding: 4px 5px; font-weight: 600; vertical-align: middle; }}
td {{ border-bottom: 1px solid #d5dbe3; padding: 3px 5px; vertical-align: top; }}
tr {{ break-inside: avoid; }}
.crit {{ font-size: 7.4pt; color: #5b6673; font-weight: normal; }}
.t4 td:nth-child(2), .t4 th:nth-child(2) {{ white-space: nowrap; }} th .crit {{ color: #c9d6e6; }}
.t4 td.use {{ font-weight: 700; background: #eef3f8; vertical-align: middle; text-align: center; }}
.t4 td.req {{ width: 32%; }} .t4 td.src {{ width: 11%; font-size: 7.6pt; color: #444; }}
td.j {{ text-align: center; font-weight: 700; font-size: 10pt; }}
td.ok {{ color: #1d7a3a; }} td.part {{ color: #b7791f; }} td.no {{ color: #c1121f; }}
.mx td, .mx th, .bd td {{ text-align: center; }} .mx td.use {{ text-align: left; font-weight: 700; }}
.mx tr.w td {{ background: #f1f4f8; font-weight: 700; }} .mx tr.top td {{ background: #e6f2e8; }}
img {{ width: 100%; margin: 4px 0; }}
.fig {{ break-inside: avoid; }}
.cap {{ font-size: 7.8pt; color: #555; margin-top: -2px; }}
.box {{ background: #f3f6fa; border-left: 4px solid #12355b; padding: 7px 10px; margin: 8px 0; break-inside: avoid; }}
.warn {{ background: #fff6e8; border-left-color: #c97b38; }}
.small {{ font-size: 7.6pt; }}
.cat td {{ word-break: break-all; font-size: 7pt; }}
.pb {{ page-break-before: always; }}
ul {{ margin: 3px 0 6px; padding-left: 18px; }}
</style></head><body>

<section class="cover">
<div class="sub">스마트도시계획(캡스톤디자인) · 6주차 과제</div>
<h1>입지조건과 배분 대안<br>— 화성시 동탄구</h1>
<div class="sub">입지인자 4축 표 · 지표 ⑥ · 배분 대안 3안 · 대안 비교 매트릭스 · 가중치 역전점</div>
<table>
<tr><td>소속</td><td>상명대학교 그린스마트시티학과</td></tr>
<tr><td>팀원</td><td>{TEAM}</td></tr>
<tr><td>교수자</td><td>김태한 교수</td></tr>
<tr><td>대상지</td><td>경기도 화성시 동탄구 (시군구 코드 41597, {float(sf.loc['면적(ha·폴리곤)', 'GU']):,.0f}ha)</td></tr>
<tr><td>작성일</td><td>2026-10-12 · 자료 조회일 {dem['queried_on']}</td></tr>
<tr><td>제출</td><td>LMS 6주차 과제 · PDF + 매트릭스 원본(xlsx·csv) · 기한 2026.10.18. 23:59</td></tr>
</table>
</section>

<h2>0. 요약</h2>
<div class="box">
<ul>
<li><b>후보지</b> — 동탄구 안의 미시가화지(현행 주거·상업·공업 용도지역 제외) 2곳을 비교했다. A는 장지동 남측의 저지대 농림·관리지역({float(sf.loc['면적(ha·폴리곤)', 'A']):.0f}ha), B는 중동 북동의 산지 접경부({float(sf.loc['면적(ha·폴리곤)', 'B']):.0f}ha)다.</li>
<li><b>4축 판정</b> — 16칸을 ○2·△1·×0점으로 합산했다. A는 녹지·상업업무·공업에서 앞서고 주거는 동률이어서 <b>후보지 A를 배분 대상지로 선정</b>했다. 단, 두 곳 모두 공업 지형 요건(경사 5% 이하 연속 10ha)은 충족하지 못한다.</li>
<li><b>지표 ⑥</b> — 기준안 15%에서 A {i6t.loc['기준안 15%', name_a]}%, B {i6t.loc['기준안 15%', name_b]}%다. A는 경사만 보면 {i6ex[(i6ex['대상'] == name_a) & (i6ex['임계값'] == '기준안 15%')]['경사 단독 충족(%)'].iloc[0]}%가 충족하지만, 남향 셀이 {sf.loc['남향(135~225°) 셀 비율(%)', 'A']}%에 그쳐 <b>향 조건이 판정을 가른다</b>.</li>
<li><b>대안 매트릭스</b> — 1위 {first}({order.loc[first, '가중 총점']:.2f}), 2위 {second}({order.loc[second, '가중 총점']:.2f}), 3위 {order.index[2]}({order.loc[order.index[2], '가중 총점']:.2f}).</li>
<li><b>역전점</b> — 가장 민감한 지표는 {tightest['지표']}이다. 가중치가 {tightest['방향']}로 바뀌면 1위가 {tightest['역전 후 1위']}로 바뀐다(여유폭 {tightest['여유폭(%p)']}%p).</li>
</ul></div>

<h2>1. 대상지 · 자료 · 방법</h2>
<table><thead><tr><th>자료</th><th>출처 · 서비스</th><th>조회 방식</th><th>조회일</th></tr></thead><tbody>
<tr><td>행정경계(동탄구·읍면동)</td><td>VWorld 2D 데이터 API 2.0 · LT_C_ADSIGG_INFO / LT_C_ADEMD_INFO</td><td>GetFeature · attrFilter sig_cd:=:41597 · EPSG:4326</td><td>{cat['queried_on'].iloc[0]}</td></tr>
<tr><td>용도지역</td><td>VWorld · LT_C_UQ111(도시)·UQ112(관리)·UQ113(농림)·UQ114(자연환경보전)</td><td>GetFeature · geomFilter BOX(동탄구 범위) · size 1000 · page</td><td>{cat['queried_on'].iloc[0]}</td></tr>
<tr><td>공원·녹지 등 공간시설 · 지구단위계획구역 · 하천</td><td>VWorld · LT_C_UPISUQ153 · LT_C_UPISUQ161 · LT_C_WKMSTRM</td><td>GetFeature · BOX</td><td>{cat['queried_on'].iloc[0]}</td></tr>
<tr><td>DEM(경사·향·표고)</td><td>{dem['source']}</td><td>z{dem['zoom']} 타일 → {dem['resample']}</td><td>{dem['queried_on']}</td></tr>
<tr><td>간선도로 · IC · 철도역 · 하수처리시설</td><td>OpenStreetMap · Overpass API (ODbL 1.0)</td><td>OSM 기준시각 {osm_meta.get('osm_base', '')}</td><td>{osm_meta['queried_on']}</td></tr>
</tbody></table>
<p>좌표는 모두 EPSG:5186(중부원점, m)으로 바꿔 계산했다. 격자는 DEM 90m 셀(1셀 = 0.81ha)이며, 셀 중심이 후보지 경계 안에 있는 셀만 집계했다(경계 셀 처리 규칙).</p>
<div class="box warn"><b>DEM 대체 사유</b> — 슬라이드 기준 자료는 국토지리정보원 DEM 90m다. 이 자료는 국토정보플랫폼 로그인 후 내려받아야 해서, 같은 계열의 공개 DEM(SRTM 기반 AWS Terrain Tiles)을 같은 90m 셀로 재표본해 썼다. 국토지리정보원 DEM 5m·1m를 쓰면 국지 급경사가 더 드러나 적합 비율이 달라질 수 있다.</div>
<div class="fig">{img('fig1_candidates.png')}<div class="cap">그림 1. 동탄구 현행 용도지역과 후보지 A·B (후보지 = 상자 범위 ∩ 동탄구 − 현행 주거·상업·공업 용도지역)</div></div>

<h2 class="pb">2. 과제 ① 입지인자 4축 표 — 후보지 2곳</h2>
<p>요건 문장은 원본 13~21번(《토지이용계획론》 2015)의 용도별 입지인자를 지형·접근성·주변환경·기반시설 4개 축으로 옮겨 적었다. 각 칸에는 2차시 방식대로 측정 가능한 수치 기준을 붙였다. 판정 표기는 ○ 충족 · △ 부분 충족 · × 미충족이다.</p>
{four}
<h3>용도별 판정 요약 (○=2, △=1, ×=0 · 용도별 8점 만점)</h3>
{table(f4s)}
<div class="box">
<b>판정</b> — 후보지 A는 기존 동탄2 시가지와 붙어 있어(300m 이내 셀 {sf.loc['기존 시가지 인접 셀(≤300m, %)', 'A']}%) 주거·상업의 기반시설 축에서 B보다 낫다. 경사 25% 초과 셀도 {sf.loc['경사 >25% 비율(%)', 'A']}%뿐이라 시가화 여지가 크다. 후보지 B는 동탄IC와 맞닿아 공업 접근성이 좋지만, 경사 25% 초과가 {sf.loc['경사 >25% 비율(%)', 'B']}%이고 평균 표고가 기반시설 기준표고 +50m를 넘는다({sf.loc['표고 평균(m)', 'B']}m). 그래서 주거·상업 요건 문장을 충족하지 못한다.<br>
<b>공통 미충족</b> — 두 곳 모두 '경사 5% 이하 연속 10ha 이상' 공업 지형 요건을 충족하지 못한다(최대 연속 평탄지 A 4.9ha · B 4.1ha). 그래서 배분 대안 B·C의 공업용지는 경사 8% 이하까지 완화해 배치했다. 이에 따른 정지(整地) 비용은 대안의 약점으로 기록한다.
</div>

<h2 class="pb">3. 과제 ② 지표 ⑥ 경사·향 적합면적 비율</h2>
<p><b>판정 조건</b> — 세 조건을 모두 충족하는 셀만 적합으로 본다(AND).</p>
<ul>
<li>경사 ≤ 임계값(10·15·25%)</li>
<li>향 135~225°(남향 ±45°, 북 0° 시계방향). 경사 2% 미만 평탄 셀은 방향성이 없으므로 향 조건을 충족한 것으로 본다(가정).</li>
<li>표고 ≤ 기반시설 기준표고 + 50m. 기준표고는 후보지 1km 안 기존 시가지 셀의 평균 표고로 잡았다(가정).</li>
</ul>
<p>경사·향은 Horn(3×3) 방식으로 계산했다. 임계값 10·15·25%는 원본 19번의 교재 범위(4% 이상적·10% 바람직·25% 한계) 안의 가정이다.</p>
{table(i6tab)}
<div class="fig">{img('fig3_indicator6_bar.png')}</div>
<div class="fig">{img('fig2_indicator6_map.png')}<div class="cap">그림 2·3. 지표 ⑥ 적합 셀 분포와 임계값별 비율</div></div>
<h3>조건별 분해 — 무엇이 적합면적을 줄였나</h3>
{table(i6ex)}
<p>후보지 A는 경사 15% 이하가 71.5%인데 지표 ⑥은 10.7%로 떨어진다. 대부분이 오산천 쪽(북쪽)으로 기운 사면이기 때문이다. 슬라이드 37쪽의 '같은 산의 남사면·북사면'처럼 <b>향 조건이 판정을 가른다</b>. 그래서 대안 배분에서는 북향 완경사지를 주거에서 빼지는 않았다. 대신 대안 비교 지표 ⑤(개발용지 중 지표 ⑥ 적합 셀 비율)로 그 차이를 평가에 반영했다.</p>
<h3>지표 ⑥ 카탈로그 행 (다섯 칸 동시 저장)</h3>
{table(i6[i6['임계값'] == '기준안 15%'][['대상', '값(%)', '판정 조건', 'DEM 출처', '해상도', '브이월드 레이어', '조회일']], 'small')}
<p class="small">세 임계값 전체 행은 xlsx 「6_지표6_카탈로그」 시트와 outputs/indicator6_catalog.csv에 있다.</p>

<h2 class="pb">4. 과제 ③ 배분 대안 3안 — 후보지 A</h2>
<p><b>배분 순서는 세 대안 모두 같다</b>: ① 녹지 → ② 공업 → ③ 상업·업무 → ④ 주거(잔여지)(샤핀·카이저, 원본 25~34번). 녹지는 먼저 공통으로 확정한다. 대상은 경사 25% 초과, 보전관리지역, 기결정 공원·녹지시설, 하천 50m 이내로 {round(float(alt.loc[alt.index[1], '공원·녹지(ha)']), 1)}ha다. 그다음 대안마다 추가 녹지 규칙과 배분 프로그램만 바꿨다.</p>
<table><thead><tr><th>대안</th><th>① 추가 녹지 규칙</th><th>개발 허용 경사</th><th>② 공업</th><th>③ 상업·업무</th></tr></thead><tbody>
<tr><td><b>A · 보전 우선</b></td><td>농림지역 전부 보전 + 경사 15% 초과 + 표고 기준 +50m 초과 + 하천 150m</td><td>≤ 15%</td><td>없음</td><td>6ha</td></tr>
<tr><td><b>B · 개발 우선</b></td><td>공통 선확정만(법정 확보기준 미달 시 경사 큰 셀부터 보충)</td><td>≤ 25%</td><td>25ha</td><td>12ha</td></tr>
<tr><td><b>C · 절충</b></td><td>농림지역 중 경사 15% 초과 + 경사 20% 초과 + 표고 초과 + 하천 100m + 공업 둘레 1셀 완충녹지</td><td>≤ 20%</td><td>12ha</td><td>9ha</td></tr>
</tbody></table>
<p>공업은 경사 5% 이하를 먼저 쓰고(부족하면 8% 이하까지), IC·간선도로에 가깝고 기존 주거지에서 먼 순서로 덩어리 배분했다. 상업·업무는 간선도로·기존 시가지에 가까운 경사 10% 이하 셀에 배분했다. 수용인구는 다음 식으로 계산했다(가정은 대안 작성 전에 고정).</p>
<p>수용인구 = 주거 셀 면적 × (1 − 도로·기반시설 {int(W['road_share_of_developed'] * 100)}%) × 순밀도 {W['net_residential_density_per_ha']}인/ha · 목표인구 {W['target_population']:,}명</p>
<div class="fig">{img('fig4_alternatives.png')}<div class="cap">그림 4. 후보지 A 배분 대안 3안 (빗금 = 3안 공통 선확정 녹지)</div></div>
{table(land, index=True)}
<p class="small">공원·녹지에는 개발 허용 경사를 넘어 남은 유보지(자연녹지 유지)가 포함된다. 공원 법정 확보기준은 도시개발사업 100만㎡ 이상 기준으로 계산했다: max(인구 × 9㎡, 부지 × 12%) = {float(alt.iloc[0]['공원 법정 확보기준(ha)']):.1f}ha (「도시공원법 시행규칙」 별표 2).</p>
<div class="box"><b>득실</b><ul>
<li>A는 녹지 {alt.loc[alt.index[0], '공원·녹지(%)']}%로 녹지축을 지키지만, 수용인구가 {int(alt.loc[alt.index[0], '수용인구(명)']):,}명(목표의 {alt.loc[alt.index[0], 'I6']}%)에 그친다. 목표인구를 수용하지 못할 수 있다.</li>
<li>B는 {int(alt.loc[alt.index[1], '수용인구(명)']):,}명으로 목표를 크게 넘는다. 대신 녹지가 법정 확보 수준({alt.loc[alt.index[1], '공원·녹지(%)']}%)으로 줄고, 개발용지 중 지표 ⑥ 적합 셀이 {alt.loc[alt.index[1], 'I5']}%뿐이라 북향·급사면 개발이 늘어난다.</li>
<li>C는 녹지 {alt.loc[alt.index[2], '공원·녹지(%)']}%와 수용인구 {int(alt.loc[alt.index[2], '수용인구(명)']):,}명(목표의 {alt.loc[alt.index[2], 'I6']}%)을 함께 확보한다.</li>
</ul></div>

<h2 class="pb">5. 과제 ④ 대안 비교 매트릭스</h2>
<p>작성 순서는 ① 지표 확정 → ② 가중치 확정 → ③ 승인(2026-10-12, 팀 확인) → ④ 채점 → ⑤ 역전점 검증이다. 대안 배분 계산 전에 지표·가중치·5점 척도 구간을 data/approved_weights.json에 고정했다. 그 뒤 수정하지 않았다(가중치 사후 조정 방지). 지표는 국토계획평가 6개 기준(「국토기본법」 제19조의2)에 하나씩 대응시켰다. 기법은 목표-성취 분석(힐, 1968)의 가중치 × 득점 합산이다.</p>
<h3>채점 구간 (사전 승인)</h3>
{bands}
<p class="small">④ 공원·녹지 비율은 법정 확보기준(12%)에 못 미치면 1점이다.</p>
<h3>매트릭스 (굵은 숫자 = 점수, 아래 = 원값)</h3>
{matrix}
<p>동일 가중치(1/6)로 검산해도 순위는 C > A > B로 같다. 따라서 승인 가중치가 순위를 만들어 낸 것은 아니다. 다만 C와 A의 차이는 {order.loc[first, '가중 총점'] - order.loc[second, '가중 총점']:.2f}점으로 작다.</p>

<h2>6. 과제 ⑤ 가중치 역전점</h2>
<p>지표 하나의 가중치만 t로 바꾸고, 나머지 다섯 지표는 원래 비율을 유지한 채 합 1.00이 되도록 다시 나눴다. 이때 1위와 다른 대안의 총점이 같아지는 t를 역전점으로 기록했다. 총점이 t의 1차식이라 해석적으로 구했다.</p>
{table(rv)}
<div class="fig">{img('fig5_reversal.png')}<div class="cap">그림 5. 지표별 가중치 민감도</div></div>
<div class="box"><b>판단</b><ul>
<li>가장 민감한 지표는 {tightest['지표']}이다. 가중치가 {tightest['방향']}로 {tightest['여유폭(%p)']}%p만 움직여도 1위가 {tightest['역전 후 1위']}로 바뀐다. 즉 C가 1위인 근거는 대부분 '목표인구를 수용한다'는 점에 기대고 있다.</li>
<li>④ 공원·녹지 가중치를 0.059 아래로 낮추면 B가 1위가 된다.</li>
<li>①·②·③·⑤는 각각 0.414·0.277·0.370·0.370까지 올려야 역전된다.</li>
</ul>
따라서 매트릭스 결론(C 절충안 채택)은 <b>목표인구 15,000명이라는 상위계획 가정이 유지되는 한</b> 견고하다. 계획인구가 낮아지면 A 보전 우선안이 대안이 된다.</div>

<h2 class="pb">7. 인증 · 재현 기록</h2>
<div class="box"><b>인증 실패 원인 판별 (슬라이드 35·39)</b> — 같은 키로 파이썬 스크립트 요청을 보내 비교했다.
<ul>
<li>domain 파라미터 없이 보내면 <code>status: ERROR · INCORRECT_KEY</code>("인증키 정보가 올바르지 않습니다.")가 돌아왔다.</li>
<li>domain=localhost(발급 시 등록한 서비스 URL)를 넣으면 <code>status: OK</code>였다.</li>
</ul>
키를 다시 발급하지 않고 응답 본문을 먼저 읽어, 원인을 ② domain 누락으로 판별했다. 인증키는 환경변수 <code>VWORLD_KEY</code>로만 읽었다. 코드·문서·카탈로그에는 키 값을 남기지 않았다.</div>
<h3>요청 카탈로그 (인증키 제외 요청 URL)</h3>
{table(cat_v, 'cat')}
<h3>재현 명령</h3>
<pre class="small">set VWORLD_KEY=(발급 키)        # 값은 기록하지 않음
python code/01_fetch_vworld.py     # VWorld 레이어
python code/02_dem_slope_aspect.py # DEM → 90m 경사·향
python code/03_fetch_osm.py        # 간선도로·IC·역
python code/04_site_analysis.py    # 후보지 인자 · 지표 ⑥
python code/05_four_axis_table.py  # 4축 표
python code/06_allocation.py       # 대안 3안 (approved_weights.json 사용)
python code/07_matrix_reversal.py  # 매트릭스 · 역전점 · xlsx
python code/08_build_report.py     # 이 보고서</pre>

<h2>8. 한계</h2>
<ul>
<li>DEM은 국토지리정보원 DEM이 아닌 SRTM 계열 공개 DEM이다. 90m 셀에서는 국지 급경사와 절·성토된 기존 지형이 평균화된다.</li>
<li>임계값(경사 15%·향 ±45°·표고 +50m), 평탄 셀의 향 처리, 기준표고 산정, 순밀도 200인/ha, 도로율 20%는 모두 가정이다. 값과 근거를 카탈로그에 함께 남겼다.</li>
<li>OSM의 하수처리시설·철도역 기재는 불완전할 수 있다(동탄 인근 신설역·처리시설 누락 가능). 기반시설 축 판정은 공식 자료로 교차검증해야 한다.</li>
<li>용도지역 레이어는 현행 지정만 담고 있어, 진행 중인 개발계획은 반영되지 않는다.</li>
</ul>

<h2>참고문헌</h2>
<p class="small">
대한국토·도시계획학회. (2015). 《토지이용계획론》. 보성각. · Chapin, F. S., & Kaiser, E. J. (1979). <i>Urban Land Use Planning</i> (3rd ed.). University of Illinois Press. · Hill, M. (1968). A goals-achievement matrix for evaluating alternative plans. <i>Journal of the American Institute of Planners</i>, 34(1), 19–29.<br>
「국토의 계획 및 이용에 관한 법률」 제36조·제48조 · 같은 법 시행령 제30조 · 「도시공원 및 녹지 등에 관한 법률」 제15조·제35조 · 같은 법 시행규칙 제4조·별표 2·별표 3 · 「국토기본법」 제19조의2.<br>
공간정보 오픈플랫폼 브이월드. 2D 데이터 API 2.0 레퍼런스. https://www.vworld.kr (조회 2026-10-12). · OpenStreetMap contributors. Overpass API (ODbL 1.0, 조회 2026-10-12). · Tilezen. Terrain Tiles on AWS. https://registry.opendata.aws/terrain-tiles/ (조회 2026-10-12).<br>
김태한. (2026). 스마트도시계획(캡스톤디자인) 6주차 주간 슬라이드. 상명대학교 그린스마트시티학과.
</p>
</body></html>"""

out_html = OUT / "report.html"
out_html.write_text(html, encoding="utf-8")
if PUBLIC:
    (ROOT / "docs" / "files").mkdir(parents=True, exist_ok=True)
    pdf = ROOT / "docs" / "files" / "6주차_보고서_동탄_입지배분과대안.pdf"
else:
    pdf = ROOT / "6주차_과제_동탄_입지배분과대안.pdf"
subprocess.run([EDGE, "--headless", "--disable-gpu", "--no-pdf-header-footer",
                f"--print-to-pdf={pdf}", out_html.as_uri()], check=True, timeout=180)
print("saved", pdf, pdf.stat().st_size)
