/* 화면 문구 번역 — 한국어(기본) ↔ 이탈리아어
 *
 * STATIC : index.html 에서 data-i18n="키" 가 붙은 요소의 이탈리아어 내용(HTML).
 *          한국어는 index.html 에 적힌 원래 내용을 그대로 쓰므로 여기에 다시 적지 않는다.
 * DYN    : 스크립트가 그리는 문구. [한국어, 이탈리아어]. {0} {1} … 은 자리표시자.
 * FULL   : 데이터 값(4축 표 문장 · 지표 이름 · 대안 이름 …)을 '보여줄 때만' 통째로 옮기는 사전.
 * TERMS  : FULL 에 없는 값에 차례로 적용하는 치환 규칙 [정규식 또는 문자열, 바꿀 값].
 *          긴 것부터 적어야 '기존 주거지역' 이 '주거' 로 먼저 잘리지 않는다.
 * data.js 의 원본 값은 한국어 그대로 두고, 화면에 그릴 때만 바꾼다.
 */
window.I18N = {
  STATIC: {
    'hd.title': 'Dashboard di allocazione del suolo di Dongtan',
    'theme': '◐ Tema',
    'nav.summary': 'Sintesi', 'nav.map': 'Mappa', 'nav.four': '① Tabella a 4 assi', 'nav.i6': '② Indicatore ⑥',
    'nav.alts': '③ Alternative', 'nav.matrix': '④ Matrice', 'nav.rev': '⑤ Punto di inversione', 'nav.record': 'Registro',

    'map.h': 'Mappa',
    's.h': 'Cerca un’area di studio — tutta la Corea',
    's.lead': 'Cerca per nome di città/contea/distretto o di quartiere: scelto un risultato, sul suo perimetro il browser ricalcola tutto con le stesse regole di Dongtan, dalla scelta dei due siti candidati fino alla matrice e al punto di inversione. Richiede 1–3 minuti.',
    's.ph': 'es.: 세종, 판교동, 춘천시, 강릉', 's.btn': 'Cerca', 'nav.search': 'Cerca',
    'map.lead': 'Attiva e disattiva i livelli per confrontare le zone d’uso del suolo vigenti, le celle idonee all’indicatore ⑥ e l’allocazione di ciascuna alternativa. Clicca su una cella per vederne gli attributi.',
    'map.view': 'Vista', 'map.vZoning': 'Zone d’uso vigenti', 'map.vI6': 'Indicatore ⑥', 'map.vAlt': 'Alternative',
    'map.overlay': 'Sovrapposizioni', 'map.lyCand': 'Perimetro dei siti candidati', 'map.lyArt': 'Arterie principali (OSM)',
    'map.lyPts': 'Stazioni ferroviarie · svincoli',
    'map.note': 'La griglia è a celle DEM di 90 m (0,81 ha). Mappa di base © OpenStreetMap contributors.',

    'four.h': '① Tabella dei fattori localizzativi a 4 assi<small>2 siti candidati × 4 destinazioni d’uso × 4 assi</small>',
    'four.lead': 'Le frasi dei requisiti sono tratte dalle diapositive originali n. 13–21 (《토지이용계획론》, «Pianificazione dell’uso del suolo», 2015); a ogni casella è associato un criterio misurabile. ○ soddisfatto · △ soddisfatto in parte · × non soddisfatto',

    'i6.h': '② Indicatore ⑥ — quota di superficie idonea per pendenza ed esposizione<small>pendenza ≤ soglia AND esposizione 135–225° AND quota ≤ riferimento +50 m</small>',
    'i6.lead': 'Si salvano tutti e tre i valori di soglia (10, 15 e 25%). Il confronto con la barra «solo pendenza» mostra quale condizione ha ridotto la superficie idonea.',

    'alts.h': '③ Tre alternative di allocazione',
    'alts.order': '① verde → ② industria → ③ commercio e terziario → ④ residenza',
    'alts.lead': 'L’ordine di allocazione è lo stesso in tutte e tre le alternative: sopra il verde fissato in comune cambiano solo le regole di verde aggiuntivo e il programma delle destinazioni. Popolazione obiettivo: <span id="target"></span> abitanti.',

    'mx.h': '④ Matrice di confronto delle alternative<small>scala a 5 punti × pesi (somma 1,00)</small>',
    'mx.lead': 'Indicatori, pesi e fasce di punteggio sono stati approvati e fissati prima di calcolare le alternative. Spostando i cursori qui sotto, punteggi e classifica si ricalcolano subito. Quando si muove un peso, gli altri si riadattano in proporzione per mantenere la somma a 1,00.',
    'mx.w': 'Pesi', 'mx.reset': 'Ripristina i pesi approvati',

    'rev.h': '⑤ Punto di inversione dei pesi<small>valori a cui si scambiano il 1° e il 2° posto rispetto ai pesi approvati</small>',
    'rev.lead': 'È il valore t a cui cambia il primo classificato quando si modifica solo il peso di un indicatore e gli altri mantengono le proporzioni. Più piccolo è il margine, più la conclusione dipende da quel peso.',

    'rec.h': 'Dati e registro di riproducibilità',
    'rec.p': '<b>Diagnosi dell’errore di autenticazione</b> — chiamando la VWorld 2D Data API da uno script Python senza il parametro <code>domain</code>, la richiesta è stata rifiutata con <code>INCORRECT_KEY</code>; inviando come <code>domain</code> l’URL di servizio registrato, la risposta è stata <code>OK</code>. La chiave di autenticazione si legge solo dalla variabile d’ambiente <code>VWORLD_KEY</code> e non è salvata in nessun punto di questo repository.',
    'dl.repo': 'Repository GitHub · codice', 'dl.xlsx': 'Matrice originale (xlsx, esempio Dongtan)', 'dl.pdf': 'Relazione (PDF in coreano, esempio Dongtan)'
  },

  DYN: {
    'title': ['동탄 입지배분 대시보드', 'Dashboard di allocazione del suolo di Dongtan'],
    'lang.btn': ['Italiano', '한국어'],
    'lang.title': ['이탈리아어로 보기', 'Visualizza in coreano'],
    'sub': ['{0} · 팀 {1} · 자료 조회 {2}', '{0} · Squadra: {1} · Dati consultati il {2}'],
    'course': ['스마트도시계획(캡스톤디자인) · 상명대학교 그린스마트시티학과', 'Pianificazione della smart city (Capstone design) · Sangmyung University, Dipartimento di Green Smart City'],

    'k.site': ['대상지', 'Area di studio'], 'k.siteV': ['화성시 동탄구', 'Dongtan-gu, Hwaseong'],
    'k.siteN': ['{0}ha · 후보지 A {1}ha · B {2}ha', '{0} ha · sito A {1} ha · B {2} ha'],
    'k.i6': ['지표 ⑥ (기준안 15%)', 'Indicatore ⑥ (scenario base 15%)'],
    'k.i6N': ['경사 조건만 보면 A {0}%', 'Con la sola pendenza A {0}%'],
    'k.sensNone': ['0~1 전 구간에서 1위 유지', 'primo posto mantenuto su tutto l’intervallo'],
    'cands': ['후보지 A·B', 'siti candidati A e B'],
    'cell': ['경사 {0}% · 향 {1}° · 표고 {2}m', 'pendenza {0}% · esposizione {1}° · quota {2} m'],
    'k.top': ['매트릭스 1위', '1° posto nella matrice'],
    'k.topN': ['{0}점 · 2위 {1} {2}점', '{0} punti · 2° {1} {2} punti'],
    'k.sens': ['가장 민감한 가중치', 'Peso più sensibile'],
    'k.sensN': ['{0} → {1} 1위 · 여유 {2}%p', '{0} → 1° posto a {1} · margine {2} p.p.'],

    'zoneSuffix': ['지역', ''], 'zoneSrc': ['VWorld LT_C_UQ111~114 (현행 지정)', 'VWorld LT_C_UQ111–114 (zonizzazione vigente)'],
    'cand': ['후보지 {0}', 'Sito {0}'],
    'i6.btn': ['경사 {0}%', 'Pendenza {0}%'],
    'i6.leg': ['{0}% 이하 적합', 'Idoneo fino al {0}%'], 'i6.legNo': ['부적합', 'Non idoneo'],
    'i6.popOk': ['후보지 {0} · 적합 (경사 {1}% 이하 · 남향 · 표고 기준 이내)', 'Sito {0} · idoneo (pendenza ≤ {1}% · esposizione sud · quota entro il riferimento)'],
    'i6.popNo': ['후보지 {0} · 경사 {1}% 기준 부적합', 'Sito {0} · non idoneo con soglia di pendenza {1}%'],
    'alt.btn': ['{0}안', 'Alt. {0}'],
    'alt.pop': ['{0} · 수용 {1}명', '{0} · {1} abitanti accolti'],

    'four.all': ['전체', 'Tutti'],
    'four.th': [['용도', '축', '요건 문장 · 수치 기준', '근거', '후보지 A 값', 'A', '후보지 B 값', 'B'],
                ['Destinazione', 'Asse', 'Requisito · criterio numerico', 'Fonte', 'Valore sito A', 'A', 'Valore sito B', 'B']],
    'four.sumH': ['용도별 판정 (○2 · △1 · ×0, 8점 만점)', 'Giudizio per destinazione (○2 · △1 · ×0, su 8 punti)'],
    'four.sumT': ['합계', 'Totale'], 'four.site': ['후보지 {0}', 'Sito {0}'],
    'four.pick': ['→ 4축 합계가 높은 후보지 {0}를 배분 대상지로 선정(동률이면 A).', '→ Il sito {0}, con il totale più alto sui 4 assi, è scelto come area di allocazione (a parità, A).'],
    'four.indFail': ['두 곳 모두 공업 지형 요건(경사 5% 이하 연속 10ha)은 미충족 — 대안의 공업용지는 경사 8% 이하까지 완화해 배치.', 'Nessuno dei due soddisfa il requisito morfologico industriale (pendenza ≤ 5% su 10 ha contigui): nelle alternative il suolo industriale è collocato fino all’8% di pendenza.'],

    'i6.slope': ['경사만 {0}% · {1}ha', 'Solo pendenza {0}% · {1} ha'],
    'i6.byAspect': ['<b>향이 판정을 가릅니다.</b>', '<b>A decidere è l’esposizione.</b>'],
    'i6.bySlope': ['<b>경사가 판정을 가릅니다.</b>', '<b>A decidere è la pendenza.</b>'],
    'i6.byNone': ['', ''],
    'i6.note': ['후보지 A는 경사 15% 이하가 {0}%, 남향(135~225°) 셀이 {1}%입니다. {4} DEM: {2} (90m 셀 재표본, 조회 {3}). 경사 2% 미만 평탄 셀은 향과 무관하게 봤고, 기준표고는 후보지 1km 안 기존 시가지의 평균 표고입니다(가정).',
                'Nel sito A il {0}% delle celle ha pendenza ≤ 15% e il {1}% è esposto a sud (135–225°). {4} DEM: {2} (ricampionato a celle di 90 m, consultato il {3}). Le celle quasi piane (pendenza < 2%) sono considerate indipendenti dall’esposizione; la quota di riferimento è la quota media dell’area urbanizzata esistente entro 1 km dal sito (ipotesi).'],

    'alt.popLine': ['수용 {0}명 (목표의 {1}%)', '{0} abitanti accolti ({1}% dell’obiettivo)'],
    'alt.item': ['항목', 'Voce'],
    'alt.liveNote': ['목표인구는 부지 면적 × 60인/ha(동탄 예시 15,000명 ÷ 250ha), 공업·상업 면적은 동탄 프로그램을 부지 면적에 비례해 잡았습니다(가정).', 'La popolazione obiettivo è superficie del sito × 60 ab./ha (esempio Dongtan: 15.000 ab. ÷ 250 ha); le superfici industriali e commerciali seguono il programma di Dongtan in proporzione alla superficie (ipotesi).'],
    'alt.note': ['수용인구 = 주거 면적 × (1 − 도로·기반시설 {0}%) × 순밀도 {1}인/ha. 공원 확보기준 = max(인구 × 9㎡, 부지 × 12%) — 도시공원법 시행규칙 별표 2.',
                 'Popolazione accolta = superficie residenziale × (1 − strade e infrastrutture {0}%) × densità netta {1} ab./ha. Standard di parchi = max(popolazione × 9 m², sito × 12%) — Regolamento attuativo della Legge sui parchi urbani, Allegato 2.'],

    'mx.approved': ['승인안', 'Pesi approvati'], 'mx.scenario': ['가정 시나리오 (승인안 아님)', 'Scenario ipotetico (non approvato)'],
    'mx.approvedW': ['승인 {0}', 'approvato {0}'], 'mx.weightAria': ['{0} 가중치', 'Peso di {0}'],
    'mx.rank': ['{0}위', '{0}°'], 'mx.alt': ['대안', 'Alternativa'], 'mx.total': ['총점', 'Totale'], 'mx.wRow': ['가중치', 'Pesi'],
    'band.h': ['채점 구간 (사전 승인)', 'Fasce di punteggio (approvate in anticipo)'], 'band.unit': ['단위', 'Unità'],
    'band.pt': ['{0}점', '{0} pt'],
    'band.note': ['④ 공원·녹지 비율은 법정 확보기준 12%에 못 미치면 1점. 승인일 {0} — 대안 계산 전에 고정.',
                  '④ La quota di parchi e verde vale 1 punto se è sotto lo standard legale del 12%. Approvato il {0}, fissato prima del calcolo delle alternative.'],

    'rev.th': [['지표', '승인 가중치', '역전 가중치', '방향', '역전 후 1위', '여유폭 (%p)', ''],
               ['Indicatore', 'Peso approvato', 'Peso di inversione', 'Direzione', '1° dopo l’inversione', 'Margine (p.p.)', '']],
    'rev.btn': ['매트릭스에서 보기', 'Vedi nella matrice'],
    'rev.noneNote': ['어느 지표의 가중치를 0~1로 바꿔도 1위({0})가 바뀌지 않습니다.', 'Qualunque peso si modifichi tra 0 e 1, il primo posto ({0}) non cambia.'],
    'rev.note': ['가장 민감한 지표는 <b>{0}</b>입니다. 가중치가 {1}로 {2}%p만 움직여도 1위가 {3}로 바뀝니다. 따라서 {5} 채택은 <b>목표인구 {4}명이라는 가정</b>이 유지될 때 견고합니다. \'매트릭스에서 보기\'를 누르면 역전 직후의 가중치가 위 슬라이더에 적용됩니다.',
                 'L’indicatore più sensibile è <b>{0}</b>: basta che il peso passi {1}, cioè di soli {2} punti percentuali, perché il primo posto vada a {3}. La scelta di {5} è quindi solida <b>finché regge l’ipotesi di {4} abitanti</b>. Premendo «Vedi nella matrice» i pesi subito dopo l’inversione vengono applicati ai cursori qui sopra.'],

    's.sample': ['지금 보는 결과: <b>화성시 동탄구</b> (미리 계산한 예시)', 'Risultato visualizzato: <b>Dongtan-gu, Hwaseong</b> (esempio precalcolato)'],
    's.live': ['지금 보는 결과: <b>{0}</b> (실시간 계산)', 'Risultato visualizzato: <b>{0}</b> (calcolo in tempo reale)'],
    's.back': ['동탄 예시로', 'Torna a Dongtan'], 's.dl': ['결과 JSON', 'Risultati JSON'],
    's.searching': ['검색 중…', 'Ricerca in corso…'],
    'lvl.시군구': ['시군구', 'Città/contea'], 'lvl.읍면동': ['읍면동', 'Quartiere'],
    'st.boundary': ['경계', 'Perimetro'], 'st.dem': ['DEM', 'DEM'], 'st.zoning': ['용도지역', 'Zonizzazione'], 'st.osm': ['도로·역', 'Strade e stazioni'],
    'st.raster': ['격자', 'Griglia'], 'st.cands': ['후보지', 'Siti candidati'], 'st.factors': ['입지인자·⑥', 'Fattori e ⑥'],
    'st.four': ['4축 표', 'Tabella 4 assi'], 'st.alloc': ['대안 3안', 'Alternative'], 'st.matrix': ['매트릭스', 'Matrice'],
    'e.proxy': ['VWorld 프록시 주소가 설정되지 않았습니다. <code>docs/config.js</code>의 <code>PROXY_URL</code>에 Cloudflare Worker 주소를 넣어 주세요.', 'Indirizzo del proxy VWorld non configurato: inserire l’URL del Cloudflare Worker in <code>PROXY_URL</code> di <code>docs/config.js</code>.'],
    'e.area': ['대상지 면적이 약 {0}km²로 한도({1}km²)를 넘습니다. 읍면동 단위로 검색해 주세요.', 'L’area è di circa {0} km² e supera il limite di {1} km²: cercare a livello di quartiere.'],
    'e.nofree': ['대상지 안에 후보지로 쓸 미시가화지(주거·상업·공업 용도지역 밖의 땅)가 충분하지 않습니다. 더 넓은 시군구로 검색해 보세요.', 'Nell’area non c’è abbastanza suolo non urbanizzato (fuori dalle zone residenziali, commerciali e industriali) per due siti candidati: provare con una città o contea più ampia.'],
    'e.net': ['네트워크 오류 — 프록시나 외부 자료 서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.', 'Errore di rete: impossibile raggiungere il proxy o i server dei dati. Riprovare tra poco.'],
    'e.osm': ['OSM 도로·역 자료 서버(Overpass)가 지금 바쁩니다. 1~2분 뒤 같은 대상지를 다시 눌러 주세요.', 'Il server dei dati OSM su strade e stazioni (Overpass) è occupato: riprovare lo stesso luogo tra 1–2 minuti.'],
    'e.none': ['"{0}"에 해당하는 시군구·읍면동이 없습니다.', 'Nessuna città, contea o quartiere corrisponde a «{0}».'],
    'e.other': ['계산하지 못했습니다: {0}', 'Calcolo non riuscito: {0}'],
    'cat.th': [['레이어', 'status', '건수', '조회일', '요청 URL (인증키 제외)'], ['Livello', 'status', 'Record', 'Consultato il', 'URL della richiesta (senza chiave)']],
    'src': ['출처: VWorld 2D 데이터 API 2.0 (조회 {0}) · {1} · OpenStreetMap Overpass API (ODbL 1.0, 기준시각 {2}) · 《토지이용계획론》(2015) 원본 13~21·25~34번 · 「국토기본법」 제19조의2 · 「도시공원법 시행규칙」 별표 2·3.',
            'Fonti: VWorld 2D Data API 2.0 (consultata il {0}) · {1} · OpenStreetMap Overpass API (ODbL 1.0, dati al {2}) · 《토지이용계획론》 («Pianificazione dell’uso del suolo», 2015), diapositive originali n. 13–21 e 25–34 · Legge quadro sul territorio, art. 19-2 · Regolamento attuativo della Legge sui parchi urbani, Allegati 2 e 3.'],
    'foot': ['스마트도시계획(캡스톤디자인) 6주차 · 팀 {0} · 모든 값은 저장소의 <code>code/</code> 스크립트로 재현할 수 있습니다.',
             'Pianificazione della smart city (Capstone design), settimana 6 · Squadra: {0} · Tutti i valori sono riproducibili con gli script in <code>code/</code> del repository.']
  },

  /* 데이터 값 — 통째로 일치할 때 */
  FULL: {
    // DEM 출처
    'AWS Terrain Tiles (terrarium) — Mapzen/Tilezen, SRTM·기타 공개 DEM 합성': 'AWS Terrain Tiles (terrarium) — Mapzen/Tilezen, composizione di SRTM e altri DEM pubblici',
    // 4축 표 요건 문장
    '경사 25% 초과 산지와 재난위험지대 같은 시가화 부적당지는 녹지로 먼저 확정한다': 'I terreni non adatti all’urbanizzazione, come i rilievi con pendenza oltre il 25% e le aree a rischio di calamità, si destinano per primi a verde',
    '녹지는 근린주구 생활권 안의 일상 이용 거리에 둔다': 'Il verde si colloca a distanza di uso quotidiano all’interno dell’unità di vicinato',
    '풍치·산림 보전 대상과 위험시설 완충이 필요한 땅을 보전·완충녹지로 둔다': 'Le aree di pregio paesaggistico e forestale e quelle da separare da impianti pericolosi diventano verde di conservazione o di filtro',
    '녹지체계 위계(환상·방사·격자·분산)에 맞도록 기결정 공원·녹지와 잇는다': 'Si collega a parchi e verde già pianificati, coerentemente con la gerarchia del sistema del verde (anulare, radiale, a griglia, diffuso)',
    '유통·상업시설은 경사 5% 이하 평지에 둔다': 'Le strutture commerciali e distributive si collocano su terreni pianeggianti con pendenza fino al 5%',
    '근린상업은 주거지에 인접하고, 일반상업은 간선 교차점이나 교통결절에 둔다': 'Il commercio di vicinato è adiacente alla residenza; il commercio generale si colloca agli incroci delle arterie o ai nodi di trasporto',
    '근린상업은 녹지와 이어 쾌적성을 유지하고, 유통상업은 인접지 환경을 보전한다': 'Il commercio di vicinato si collega al verde per mantenere la qualità ambientale; il commercio distributivo tutela l’ambiente circostante',
    '근린상업은 3~5만 명 배후인구와 물류망을 확보한다': 'Il commercio di vicinato dispone di un bacino di 30.000–50.000 abitanti e di una rete logistica',
    '주거지는 경사 4~10%를 바람직한 범위로, 25%를 개발 한계로 두고 표고는 기반시설 +50m 이내로 한다': 'Per la residenza la pendenza ideale è 4–10% con limite di sviluppo al 25%, e la quota non supera di oltre 50 m quella delle infrastrutture',
    '주거지는 직장·편익시설에 가깝고 간선도로·휴식공간과 이어진다': 'La residenza è vicina a lavoro e servizi ed è collegata alle arterie e agli spazi di svago',
    '주거지는 오염원과 떨어진 남경사지에 두고 녹지·수변과 잇는다': 'La residenza si colloca su versanti esposti a sud, lontano dalle fonti inquinanti, e si collega a verde e corsi d’acqua',
    '주거지는 도로·가스·전기 공급망이 이미 갖춰진 곳에 이어 붙인다': 'La residenza si estende dove le reti stradali, del gas e dell’elettricità sono già presenti',
    '공업지는 경사 5% 이하이고 최소규모 이상인 평탄지에 둔다': 'L’industria si colloca su terreni pianeggianti con pendenza fino al 5% e di estensione almeno pari alla dimensione minima',
    '공업지는 화물 수송을 위해 간선교통(IC)에 바로 이어진다': 'L’industria è collegata direttamente alla viabilità principale (svincolo) per il trasporto merci',
    '공업지는 시가지와 떨어뜨리고 완충녹지와 확장 여지를 둔다': 'L’industria è distanziata dall’area urbana, con verde di filtro e margini di espansione',
    '공업지는 폐수·폐기물 처리가 쉽고 용수·동력을 확보할 수 있는 곳에 둔다': 'L’industria si colloca dove è facile trattare acque reflue e rifiuti e reperire acqua ed energia',
    // 수치 기준
    '경사 > 25% 셀 → 녹지 선확정': 'Celle con pendenza > 25% → verde fissato per primo',
    '생활권공원 유치거리 250·500·1,000m': 'Raggio di servizio dei parchi di quartiere 250·500·1.000 m',
    '농림지역·보전관리지역 면적': 'Superficie delle zone agricolo-forestali e di gestione conservativa',
    '기결정 공원·녹지시설 연접': 'Contiguità con parchi e verde già pianificati',
    '경사 ≤ 5% 셀 비율': 'Quota di celle con pendenza ≤ 5%',
    '간선도로 ≤ 500m · 철도역 ≤ 1km': 'Arteria ≤ 500 m · stazione ferroviaria ≤ 1 km',
    '녹지 연계 가능(기결정 공원·녹지 연접)': 'Collegamento al verde possibile (contiguità con parchi e verde già pianificati)',
    '기존 시가지 300m 이내 셀 비율': 'Quota di celle entro 300 m dall’area urbanizzata esistente',
    '경사 ≤ 10%(바람직) · ≤ 25%(한계) · 표고 ≤ 기준 +50m': 'Pendenza ≤ 10% (ideale) · ≤ 25% (limite) · quota ≤ riferimento +50 m',
    '간선도로 ≤ 500m · 기존 주거지 ≤ 500m': 'Arteria ≤ 500 m · residenza esistente ≤ 500 m',
    '향 135~225° 셀 비율 ≥ 30%': 'Quota di celle con esposizione 135–225° ≥ 30%',
    '경사 ≤ 5% 연속 ≥ 10ha': 'Pendenza ≤ 5% su almeno 10 ha contigui',
    'IC ≤ 2km': 'Svincolo ≤ 2 km',
    '기존 주거지 평균거리 ≥ 500m': 'Distanza media dalla residenza esistente ≥ 500 m',
    '공공하수처리시설 ≤ 5km(OSM 기재 시설 기준)': 'Depuratore pubblico ≤ 5 km (impianti registrati in OSM)',
    // 근거
    '원본 13·14번': 'Orig. n. 13·14',
    '원본 13·14번 · 국토계획법 제36조': 'Orig. n. 13·14 · Legge sulla pianificazione territoriale, art. 36',
    '원본 13·14번 · 도시공원법 시행규칙 별표 3': 'Orig. n. 13·14 · Reg. attuativo Legge sui parchi urbani, All. 3',
    '원본 13·14번 · 도시공원법 제35조': 'Orig. n. 13·14 · Legge sui parchi urbani, art. 35',
    '원본 15~17번': 'Orig. n. 15–17', '원본 16·17번': 'Orig. n. 16·17', '원본 17번': 'Orig. n. 17',
    '원본 19번': 'Orig. n. 19', '원본 21번': 'Orig. n. 21', '원본 21번 · 시행령 제30조': 'Orig. n. 21 · Decreto attuativo, art. 30',
    // 용도 · 축
    '녹지': 'Verde', '상업업무': 'Commerciale-terziario', '주거': 'Residenziale', '공업': 'Industriale',
    '지형': 'Morfologia', '접근성': 'Accessibilità', '주변환경': 'Contesto', '기반시설': 'Infrastrutture',
    '공원·녹지': 'Parchi e verde', '상업·업무': 'Commerciale e terziario',
    // 용도지역 대분류
    '상업': 'Commerciale', '관리': 'Gestione', '농림': 'Agricolo-forestale', '자연환경보전': 'Tutela ambientale',
    // 후보지 · 대안
    '후보지 A · 장지동 남측(저지대 농림·관리지역)': 'Sito A · sud di Jangji-dong (pianura, zone agricolo-forestali e di gestione)',
    '후보지 B · 중동 북동(산지 접경 농림·관리지역)': 'Sito B · nord-est di Jung-dong (margine collinare, zone agricolo-forestali e di gestione)',
    '화성시 동탄구 전체(참고)': 'Intero distretto di Dongtan (riferimento)',
    '대안 A · 보전 우선': 'Alternativa A · priorità alla conservazione',
    '대안 B · 개발 우선': 'Alternativa B · priorità allo sviluppo',
    '대안 C · 절충': 'Alternativa C · compromesso',
    'A · 보전 우선': 'A · conservazione', 'B · 개발 우선': 'B · sviluppo', 'C · 절충': 'C · compromesso',
    // 임계값
    '하한 10%': 'Soglia inferiore 10%', '기준안 15%': 'Scenario base 15%', '상한 25%': 'Soglia superiore 25%',
    // 국토계획평가 기준 · 지표
    '① 지역경쟁력': '① Competitività regionale',
    '② 지역 간 균형발전': '② Sviluppo equilibrato tra territori',
    '③ 기간시설 효율성': '③ Efficienza delle infrastrutture di base',
    '④ 자원 지속가능 관리': '④ Gestione sostenibile delle risorse',
    '⑤ 저탄소 친환경': '⑤ Basse emissioni e compatibilità ambientale',
    '⑥ 종합계획 정합성': '⑥ Coerenza con il piano generale',
    '일자리 용지(공업+상업업무) 비율': 'Quota di suolo per l’occupazione (industria + commercio e terziario)',
    '근린상업 500m 이내 주거 셀 비율': 'Quota di celle residenziali entro 500 m dal commercio di vicinato',
    '개발용지의 기존 간선도로 평균거리': 'Distanza media del suolo edificabile dalle arterie esistenti',
    '공원·녹지 비율': 'Quota di parchi e verde',
    '개발용지 중 지표⑥(경사15%·향·표고) 적합 셀 비율': 'Quota di celle edificabili idonee all’indicatore ⑥ (pendenza 15%, esposizione, quota)',
    '목표인구 수용률': 'Tasso di accoglienza della popolazione obiettivo',
    // 대안 표 항목
    '공원·녹지(ha)': 'Parchi e verde (ha)', '공업(ha)': 'Industria (ha)', '상업·업무(ha)': 'Commercio e terziario (ha)',
    '주거(ha)': 'Residenza (ha)', '개발용지(ha)': 'Suolo edificabile (ha)', '주거 순면적(ha)': 'Superficie residenziale netta (ha)',
    '수용인구(명)': 'Popolazione accolta (ab.)', '공원 법정 확보기준(ha)': 'Standard legale di parchi (ha)'
  },

  /* 위에 없는 값에 차례로 적용 — 긴 것부터 */
  TERMS: [
    // 역전점 지표 = 기준 + 지표 이름 (두 줄을 합친 값)
    [/^(① 지역경쟁력|② 지역 간 균형발전|③ 기간시설 효율성|④ 자원 지속가능 관리|⑤ 저탄소 친환경|⑥ 종합계획 정합성) (.+)$/, (m, a, b) => `${window.I18N.FULL[a] || a} — ${window.I18N.FULL[b] || b}`],
    [/^0~1 전 구간에서 1위 유지$/, 'Primo posto mantenuto su tutto l’intervallo 0–1'],
    [/^후보지 ([AB]) · (.+) 일대$/, 'Sito $1 · area di $2'], [/^(.+) 전체\(참고\)$/, 'Intero territorio di $1 (riferimento)'],
    ['IC 없음(조회 범위 내)', 'nessuno svincolo nell’area'], ['하수처리시설 없음(조회 범위 내)', 'nessun depuratore nell’area'], ['이름 없음', 'senza nome'],
    [/(\d+)% 이하/g, '≤ $1%'], [/(\d+)% 초과/g, '> $1%'],
    ['기존 주거지역까지 평균', 'distanza media dalla residenza esistente'],
    ['기결정 공원·녹지', 'parchi e verde già pianificati'], ['포함', 'inclusi'],
    ['최대 연속', 'massimo contiguo'], ['시가지 인접', 'adiacente all’urbanizzato'],
    ['기존 주거지', 'residenza esistente'], ['평균표고', 'quota media'], ['기준', 'rif.'],
    ['IC 최단', 'svincolo più vicino'], ['하수처리시설', 'depuratore'],
    ['간선', 'arteria'], ['남향', 'esposizione sud'], ['농림', 'agricolo-forestale'], ['관리', 'gestione'],
    ['(증가)', '(aumento)'], ['(감소)', '(diminuzione)'],
    [/^역 /, 'stazione '], [' · 역 ', ' · stazione '],
    // 지명 — 로마자 표기
    ['기흥 휴게소 (부산 방향)', 'Area di servizio Giheung (direzione Busan)'],
    ['분기점', ' JCT'], ['교차로', ' (incrocio)'],
    ['서동탄', 'Seo-Dongtan'], ['동탄', 'Dongtan'], ['기흥', 'Giheung'], ['북오산', 'Buk-Osan'], ['오산대', 'Osan-dae'], ['오산', 'Osan'],
    ['기산', 'Gisan'], ['고매', 'Gomae'], ['태안', 'Taean'], ['중리', 'Jungri'], ['신리', 'Sinri'], ['역동', 'Yeokdong'],
    ['궁촌', 'Gungchon'], ['서용인', 'Seo-Yongin'], ['진안', 'Jinan'], ['망포', 'Mangpo'], ['병점', 'Byeongjeom'],
    ['삼가', 'Samga'], ['세마', 'Sema'],
    [/([A-Za-z\-]+)역$/, 'Stazione di $1']
  ]
};
