# VWorld 프록시 — Cloudflare Worker

> **시도 기록 (2026-10-12)** — 배포까지 마쳤지만 VWorld가 Cloudflare 서버의 접속을 끊습니다. `/diag` 결과: 서울(ICN, `loc=KR`)에서 나가는 요청도 `https 520 · http 502`. 그래서 전국 검색은 이 프록시 대신 **전국 시군구 미리 계산**(`docs/regions/`)으로 제공합니다. 아래 `dev_proxy.py`는 그 계산을 이 PC에서 돌릴 때 씁니다.

대시보드의 **전국 대상지 검색**이 VWorld 용도지역·행정경계와 OSM 도로·역 자료를 받을 때 거치는 작은 서버입니다.

- 인증키는 Worker의 **비밀값**(`VWORLD_KEY`)으로만 들어가고, 코드·저장소·브라우저에는 나타나지 않습니다.
- 허용한 레이어(행정경계·용도지역·공간시설·하천)와 허용한 주소(`https://sin030327.github.io`, localhost)에서 온 요청만 중계합니다.
- `/overpass`는 OSM Overpass 미러 4곳을 서버에서 차례로 시도합니다. 공개 서버가 자주 바빠서(504) 브라우저에서 직접 부르면 실패하는 일이 많기 때문입니다.

| 경로 | 하는 일 |
|---|---|
| `GET /data?data=LT_C_UQ111&geomFilter=BOX(...)&page=1` | VWorld 2D 데이터 API GetFeature 중계 (key·domain은 Worker가 붙임) |
| `GET /overpass?data=[out:json]...` | OSM Overpass 미러 중계 |
| `GET /geocode?q=주소` | gimi9 지오코더 중계 — 주소 → 좌표 (토큰은 Worker 비밀값 `GIMI9_TOKEN`) |
| `GET /reverse?x=경도&y=위도` | gimi9 지오코더 중계 — 좌표 → 주소 |
| `GET /health` | 동작 확인 |

**지금 쓰는 곳**: 대시보드의 주소 검색(`/geocode`)과 좌표 위치의 주소 표시(`/reverse`). gimi9 토큰은 설명서가 공개 저장소에 넣지 말라고 하므로 Worker 비밀값으로만 둡니다 — `npx wrangler secret put GIMI9_TOKEN`.

## 배포 — 웹 화면만으로 (Node 설치 불필요)

1. https://dash.cloudflare.com 에 가입·로그인합니다 (무료 플랜으로 충분).
2. **Workers & Pages → Create → Create Worker**, 이름을 `vworld-proxy`로 두고 **Deploy**.
3. **Edit code**를 눌러 기본 코드를 지우고 `worker/src/index.js` 내용을 통째로 붙여 넣은 뒤 **Deploy**.
4. Worker의 **Settings → Variables and Secrets**에서 세 개를 추가합니다.

   | 이름 | 종류 | 값 |
   |---|---|---|
   | `VWORLD_KEY` | **Secret** | VWorld 인증키 |
   | `VWORLD_DOMAIN` | Text | 인증키 발급 시 등록한 서비스 URL (지금은 `localhost`) |
   | `ALLOWED_ORIGINS` | Text | `https://sin030327.github.io` |

5. 주소창의 Worker 주소(`https://vworld-proxy.<계정>.workers.dev`) 끝에 `/health`를 붙여 열어 `{"ok":true,...}`가 보이면 완료입니다.
6. 그 주소를 `docs/config.js`의 `window.PROXY_URL`에 넣고 push합니다.

## 배포 — 명령줄 (Node가 있을 때)

```
cd worker
npx wrangler login
npx wrangler deploy
npx wrangler secret put VWORLD_KEY
```

## 로컬 개발

Cloudflare 없이 같은 규칙의 파이썬 프록시로 시험할 수 있습니다. 대시보드를 `localhost`에서 열면 `config.js`가 비어 있어도 자동으로 `http://localhost:8787`을 씁니다.

```
set VWORLD_KEY=(발급 키)
python worker/dev_proxy.py
python -m http.server -d docs 8765
```

## 참고

- VWorld는 요청의 `domain`을 발급 시 등록한 서비스 URL과 맞춰 봅니다. 지금 키는 `localhost`로 등록돼 있어 Worker도 `domain=localhost`를 보냅니다. VWorld **인증키 관리**에서 서비스 URL에 Worker 주소를 추가 등록하고 `VWORLD_DOMAIN`을 그 주소로 바꾸면 더 정확합니다.
- Worker 무료 플랜은 하루 10만 요청입니다. 대상지 1곳 분석에 VWorld 요청 10~30건과 Overpass 1건이 쓰입니다.
