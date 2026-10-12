# 동탄 입지배분 대시보드 — 6주차

스마트도시계획(캡스톤디자인) · 상명대학교 그린스마트시티학과
팀: 신재훈 · 이제준 · 전세진 · 김채우 · Elisa

**대시보드 →** https://sin030327.github.io/dongtan-allocation-dashboard/

화성시 동탄구에서 후보지 2곳을 골라 입지인자 4축 표로 비교하고, 경사·향 적합면적(지표 ⑥)을 DEM 격자로 계산한 뒤, 후보지 A에 녹지를 먼저 확정한 배분 대안 3안을 만들어 사전 승인한 지표·가중치로 평가했습니다. 대시보드에서 가중치 슬라이더를 움직이면 순위가 바로 다시 계산되고, 1·2위가 바뀌는 역전점을 확인할 수 있습니다.

### 전국 대상지 검색

대시보드 맨 위 **대상지 검색**에 시군구·읍면동 이름(예: `세종`, `판교동`, `오산`)을 넣고 고르면, 그 시군구의 결과 — 후보지 2곳, 4축 표, 지표 ⑥, 배분 대안 3안, 매트릭스, 역전점 — 가 바로 열립니다. 읍면동을 고르면 그 동이 속한 시군구 결과가 열립니다. 동탄은 기본 예시로 남아 있고 **동탄 예시로** 버튼으로 돌아옵니다.

전국 시군구 256곳을 **미리 계산**해 `docs/regions/{시군구코드}.json.gz`로 올려 두었습니다. VWorld가 클라우드(Cloudflare) 서버의 접속을 끊어 실시간 프록시가 불가능했기 때문에, VWorld에 접속되는 PC에서 같은 엔진(`docs/live.js`)으로 한 번에 계산했습니다. 결과는 계산한 날의 자료 기준입니다.

| 단계 | 자료 · 방법 |
|---|---|
| 경계 · 용도지역 · 공원녹지 · 하천 | VWorld `LT_C_ADSIGG_INFO` · `LT_C_UQ111~114` · `LT_C_UPISUQ153` · `LT_C_WKMSTRM` |
| 간선도로 | VWorld 국토부 표준노드링크 `LT_L_MOCTLINK` — 고속국도·도시고속국도·일반국도·특별·광역시도·국가지원지방도·지방도 (시·군도 제외) |
| IC · JC | VWorld 표준노드 `LT_P_MOCTNODE` 중 연결로접속부, 이름에 IC·JC·나들목·분기점 |
| 하수처리시설 | VWorld 도시계획시설 환경기초시설 `LT_C_UPISUQ158` 중 하수·폐수종말처리시설 |
| 철도역 | VWorld에 없음 — OSM 전국 역 목록(1,945곳)을 한 번 받아 둔 `docs/stations_kr.json` |
| DEM → 경사 · 향 | AWS Terrain Tiles z13(동탄 파이썬 분석과 같은 해상도) → 90m 셀 평균 · Horn 3×3 |
| 격자 | 웹 메르카토르 축에 맞춘 지상 90m 셀(0.81ha) — 지도 이미지와 셀이 정확히 겹침 |
| 후보지 2곳 | 미시가화 셀(주거·상업·공업 용도지역 밖)이 60% 이상인 1.6km 창 중 '경사 15% 이하 비율 + 0.5 × 시가지 300m 이내 비율' 상위 2곳(겹치지 않게) |
| 4축 표 · 지표 ⑥ · 대안 · 매트릭스 · 역전점 | `code/04~07`과 같은 판정·배분·채점 규칙, 같은 승인 가중치 |

- 목표인구는 부지 면적 × 60인/ha(동탄 예시 15,000명 ÷ 250ha), 공업·상업 면적은 동탄 프로그램을 부지 면적에 비례(가정). 공원 확보기준은 부지 규모에 맞는 「도시공원법 시행규칙」 별표 2 구간을 씁니다.
- 미시가화지가 거의 없는 도심(예: 서울 중구)은 후보지를 찾지 못해 결과가 없다고 표시합니다.
- 검산: 같은 엔진으로 동탄구를 다시 계산하면 구 전체 지표 ⑥이 25.7 / 29.8 / 31.9%로 파이썬 결과(25.6 / 29.8 / 32.0%)와 같습니다.
- 동탄 기본 예시(`docs/data.js`)는 파이썬 파이프라인 결과로, 접근성 자료에 OSM을 썼습니다. 전국 결과는 위 표의 VWorld 공식 자료를 씁니다.

#### 전국 결과 다시 만들기

```
set VWORLD_KEY=(발급 키)
python worker/dev_proxy.py                 # 로컬 프록시 + 결과 저장(개발 전용)
python -m http.server -d docs 8765         # tools/batch.html 을 docs 에 복사해 두고
#  → http://localhost:8765/batch.html 에서 [시작] — 저장된 곳은 건너뜀
```

`worker/`의 Cloudflare Worker는 시도 기록으로 남겨 두었습니다(VWorld가 접속을 끊어 VWorld 중계에는 쓰지 않음).

### 이탈리아어 보기

헤더의 **Italiano** 버튼을 누르면 화면 전체가 이탈리아어로 바뀌고, 다시 누르면(**한국어**) 돌아옵니다. 고른 언어는 그 브라우저에 기억됩니다.

- 화면 문구는 `docs/i18n.js`에 모아 두었습니다 — `STATIC`(정적 문구) · `DYN`(스크립트가 그리는 문구) · `FULL`(4축 표 문장 · 지표 · 대안 이름 등 데이터 값) · `TERMS`(나머지 값에 차례로 적용하는 치환 규칙).
- 데이터(`docs/data.js`)는 한국어 원본 그대로 두고 **보여줄 때만** 옮깁니다. 숫자는 이탈리아식(1.333 · 0,3)으로 표기하고, 역·IC 이름은 로마자로 적습니다.
- 팀원 이름과 교재 서명(《토지이용계획론》)은 원문을 그대로 둡니다. 보고서 PDF는 한국어판만 있습니다.

## 결과 요약

| 과제 | 결과 |
|---|---|
| ① 입지인자 4축 표 | 후보지 A(장지동 남측 250ha)가 녹지·상업업무·공업에서 우위, 주거 동률 → A를 배분 대상지로 선정 |
| ② 지표 ⑥ | 기준안 15% — A 10.7% · B 5.4%. A는 경사만으로 71.5%지만 대부분 북향이라 향 조건이 판정을 가름 |
| ③ 배분 대안 3안 | A 보전 우선 · B 개발 우선 · C 절충 (순서는 모두 녹지 → 공업 → 상업·업무 → 주거) |
| ④ 대안 비교 매트릭스 | C 3.35 > A 3.00 > B 2.90 (동일 가중치로도 같은 순위) |
| ⑤ 가중치 역전점 | ⑥ 목표인구 수용률 가중치 0.20 → 0.123이면 A가 1위 (여유폭 7.7%p) |

## 구성

```
docs/                 대시보드 (GitHub Pages 배포 폴더)
  index.html          단일 페이지 — Leaflet 지도 · 표 · 가중치 슬라이더
  data.js             09_export_dashboard.py 가 만든 데이터 (GeoJSON + 표)
  files/              보고서 PDF(공개용) · 매트릭스 원본 xlsx
code/                 분석 스크립트 01~09
data/                 수집 원자료 · 격자 · 사전 승인 가중치(approved_weights.json)
outputs/              csv · 그림 · xlsx
```

## 재현

인증키는 환경변수 `VWORLD_KEY`로만 읽으며, 이 저장소 어디에도 키 값이 없습니다. 스크립트(비브라우저) 호출이라 `domain` 파라미터(발급 시 등록한 서비스 URL)를 함께 보냅니다. 빠지면 `INCORRECT_KEY`로 거절됩니다.

```
pip install requests numpy pandas matplotlib shapely pyproj openpyxl pillow
set VWORLD_KEY=(발급 키)
cd code
python 01_fetch_vworld.py        # VWorld 레이어
python 02_dem_slope_aspect.py    # DEM → 90m 경사·향
python 03_fetch_osm.py           # 간선도로·IC·역 (OSM)
python 04_site_analysis.py       # 후보지 인자 · 지표 ⑥
python 05_four_axis_table.py     # 4축 표
python 06_allocation.py          # 대안 3안 (approved_weights.json 사용)
python 07_matrix_reversal.py     # 매트릭스 · 역전점 · xlsx
python 08_build_report.py --public   # 공개용 보고서 PDF → docs/files/
python 09_export_dashboard.py    # 대시보드 데이터 → docs/data.js
```

대시보드를 로컬에서 보려면 `python -m http.server -d docs 8000` 후 http://localhost:8000 을 엽니다.

## 주요 가정

- DEM: 국토지리정보원 DEM 대신 공개 SRTM 계열 AWS Terrain Tiles(z13)를 EPSG:5186 90m 셀로 재표본
- 지표 ⑥: 경사 10·15·25% · 향 135~225°(경사 2% 미만은 향 무관) · 표고 ≤ 기준 +50m (기준 = 후보지 1km 안 기존 시가지 평균 표고)
- 목표인구 15,000명 · 주거 순밀도 200인/ha · 도로·기반시설 20% — 대안 계산 전에 `data/approved_weights.json`에 고정

## 출처 · 라이선스

- VWorld 2D 데이터 API 2.0 (국토교통부 공간정보 오픈플랫폼), 조회 2026-10-12
- OpenStreetMap contributors, Overpass API — ODbL 1.0
- Tilezen Terrain Tiles on AWS (SRTM 등 공개 DEM)
- 대한국토·도시계획학회 (2015) 《토지이용계획론》 · Chapin & Kaiser (1979) · Hill (1968)
