# 동탄 입지배분 대시보드 — 6주차

스마트도시계획(캡스톤디자인) · 상명대학교 그린스마트시티학과
팀: 신재훈 · 이제준 · 전세진 · 김채우 · Elisa

**대시보드 →** https://sin030327.github.io/dongtan-allocation-dashboard/

화성시 동탄구에서 후보지 2곳을 골라 입지인자 4축 표로 비교하고, 경사·향 적합면적(지표 ⑥)을 DEM 격자로 계산한 뒤, 후보지 A에 녹지를 먼저 확정한 배분 대안 3안을 만들어 사전 승인한 지표·가중치로 평가했습니다. 대시보드에서 가중치 슬라이더를 움직이면 순위가 바로 다시 계산되고, 1·2위가 바뀌는 역전점을 확인할 수 있습니다.

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
