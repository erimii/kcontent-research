# K-Content Intelligence Dashboard

**Reddit + MyDramaList**에서 K-콘텐츠 글로벌 팬 반응을 수집·분석해 **트렌드·감정·쟁점 인사이트 리포트**를 자동 생성하는 로컬 Node.js 애플리케이션.

---

## 기술 스택

- **런타임**: Node.js 20+ (Node 25 검증) · TypeScript (tsx)
- **서버**: Express
- **DB**: SQLite (better-sqlite3 12.x)
- **수집**:
  - Reddit Atom RSS (인증 불필요)
  - MyDramaList — Playwright 헤드리스 (Cloudflare 우회)
  - Google Trends — Playwright trending 페이지 스크래핑 (7개 카테고리·시간·geo URL 병합)
  - YouTube — `youtubei.js` Innertube (무인증, 14개 해시태그 → 영상 30개 + 댓글 ~900개, 2단계 K-content 마커 필터)
- **프론트**: Vanilla JS SPA (`public/static/app.js`) — 더보기/접기 토글로 스크롤 길이 절반 단축

---

## 실행 방법

```bash
npm install                          # 의존성 설치 (better-sqlite3 + youtubei.js + playwright 등)
npx playwright install chromium      # MDL·GTrends 크롤링용 (최초 1회)
npm run dev                          # 개발 모드 (watch + tsx)
npm start                            # 프로덕션 모드
```

서버 실행 후 → **http://localhost:3366**

### 크롤링 호출

데모 파이프라인 (API 키 불필요):
```bash
curl -X POST http://localhost:3366/api/crawl/demo
```

Reddit 실제 크롤링:
```bash
curl -X POST http://localhost:3366/api/crawl \
  -H "Content-Type: application/json" -d '{"type":"daily","sources":["reddit"]}'
```

MDL Top Airing 크롤링 (캐시 유효 시 즉시 반환):
```bash
curl -X POST http://localhost:3366/api/mdl/refresh \
  -H "Content-Type: application/json" -d '{"force":false}'
```

Google Trends 북미 일간 (캐시 유효 시 즉시 반환):
```bash
curl -X POST http://localhost:3366/api/gtrends/refresh \
  -H "Content-Type: application/json" -d '{"force":false}'
```

YouTube SNS 버즈 (캐시 유효 시 즉시 반환):
```bash
curl -X POST http://localhost:3366/api/youtube/refresh \
  -H "Content-Type: application/json" -d '{"force":false}'
```

---

## 6단계 데이터 파이프라인

```
[1] 데이터 수집  →  [2] 필터링  →  [3] 트렌드 분석  →
[4] 인기 포스트  →  [5] 딥 분석  →  [6] 한국어 인사이트
```

### Stage 1 — 데이터 수집 ([src/crawlers/reddit.ts](src/crawlers/reddit.ts))

Reddit Atom RSS 기반(인증 불필요), 4개 서브레딧:
- `r/kdramas`, `r/kdrama`, `r/kdramarecommends`, `r/korean`

각 서브레딧당 **4가지 정렬** RSS 병행 수집 (서브레딧당 최대 100개 raw → dedup):
- `hot.rss` — 24h 안에서 업보트·댓글 속도가 빠른 글 (지금 달아오르는 화제)
- `new.rss` — 단순 최신순 (갓 올라온 토론·신작 정보)
- `top.rss?t=day` — 24h 누적 업보트 베스트 (검증된 인기)
- `controversial.rss?t=day` — 호불호 갈리는 논쟁 (의견 분열)

동적 cutoff: daily는 24h → 표본 부족 시 48h → 7d 단계 fallback. 최신성 기준 상위 12개 포스트는 댓글 RSS 추가 수집 후 `score = 댓글수 × 15 + 최신성 보너스` 자체 공식으로 재산정.

### Stage 2 — 필터링 ([src/pipeline/filter.ts](src/pipeline/filter.ts))

- 제목+본문 길이 20자 미만 제거
- 광고/홍보 패턴(promo/discount/sponsored/affiliate) 정규식 제거
- 댓글 0개 옵션(기본 off)
- ID 기준 중복 제거
- 결과: `{ filtered, stats: { before, after, removed: { tooShort, promotional, noComments, duplicate } } }`

### Stage 3 — 트렌드 분석 ([src/pipeline/trends.ts](src/pipeline/trends.ts))

- **콘텐츠 트렌드**: **사전 매칭 우선** 방식 — 정규식 노이즈(영어 축약형 `'s`/`'m` 오탐, 인용 댓글 잘못 추출) 제거
  - 작품: 정적 사전 ([src/data/known-dramas-static.ts](src/data/known-dramas-static.ts), 한국 드라마·영화 ~150개) + MDL Top Airing/Popular 자동 동기화 사전 합집합 → word-boundary 매칭
  - 따옴표 추출은 **한국어 따옴표(「」, 『』)만** — 영어 큰따옴표·싱글 쿼트 폐기 (인용 댓글·축약형 오탐 차단)
  - sanity check: 마침표 끝 인용 / 소문자 시작 / 일반 영문 문장 시작(He, It, This 등) 거름
  - 배우: 정적 사전 (~80명) + **word-boundary alternation regex** (substring 오탐 차단 — 예: `iu`가 `studious`에 부분 매칭되던 버그 수정)
  - 1포스트 1카운트 (같은 글에서 같은 작품·배우 100번 언급해도 1)
- **감정 트렌드**: 긍정/부정/중립 분포 + **감정별 주요 논의 주제 TOP 3** (워드 바운더리 정규식, 대표 인용 자동 추출)
- **행동 트렌드**: 추천(recommendation) / 리뷰(review) / 질문(question) / 의견(discussion) 분류
- **서브레딧별 특성**: r/kdramas → 감정/리뷰 중심, r/korean → 문화/확장 등

### Stage 4 — 인기 포스트 선정 ([src/pipeline/insight.ts](src/pipeline/insight.ts))

`score = commentCount × 15 + 최신성 보너스(24h:100 / 3d:50 / 7d:10)`

→ 상위 5개 (`hotPosts`)

### Stage 5 — 딥 분석 ([src/pipeline/deepAnalysis.ts](src/pipeline/deepAnalysis.ts))

TOP5 포스트마다:

1. **댓글 감정 분석** — 자연어 요약 ("댓글의 80%가 긍정적이며, 팬들의 강한 호응이 두드러집니다")
2. **의견 유형 분류** — praise / criticism / question / recommendation
3. **인기 사유** — 자연어 한 단락 (시의성 + 참여도 + 감정 + 의견 dominance + 주요 쟁점)
4. **댓글 쟁점 클러스터 TOP 3** — Hybrid 접근:
   - 12개 K-드라마 쟁점 템플릿 매칭 (전개 속도/결말 만족도/캐릭터 개연성/케미·관계/연기력 등)
   - 부족분은 동적 n-gram 클러스터링으로 채움 (URL 노이즈 필터, 단복수 정규화, bigram 우선)
   - 각 쟁점은 **구체적 쟁점 형태** (예: `"캐릭터 행동의 개연성 논쟁"`)
   - 출력: 설명 / 의견 분포(긍정 vs 부정 혼재 60/40 등) / 주요 의견 / 맥락 / 해석

### Stage 6 — 한국어 핵심 인사이트 ([src/pipeline/insight.ts](src/pipeline/insight.ts) `generateKoreanInsights`)

5개 카테고리, 각각 한 단락 + evidence chip:
- 📈 **트렌드 요약** — 가장 많이 언급된 콘텐츠
- 💬 **팬 반응 특징** — 감정 분포 + 행동 dominance
- 🎬 **콘텐츠 소비 패턴** — TOP5 평균 댓글 + 긍정률
- 🌏 **확장 흐름** — 드라마 소비 → 한국 문화·언어 확장 양상
- 👥 **커뮤니티 특성** — 서브레딧별 주 행동

---

## Google Trends 통합 (북미 거시 + K-콘텐츠 비교 + US 이벤트 컨텍스트)

**별도 파이프라인** ([src/crawlers/gtrends.ts](src/crawlers/gtrends.ts) + [src/pipeline/gtrendsAnalysis.ts](src/pipeline/gtrendsAnalysis.ts) + [src/data/usEvents.ts](src/data/usEvents.ts))

- **수집**: Playwright 헤드리스로 `https://trends.google.com/trending` 페이지 7개 병합:
  - US daily / US 7-day / US category 3·4·18·20 / CA daily
  - 페이지당 ~25개 노출 → dedup 후 **유니크 ~100~150개** 확보 (~17초, 1h 캐시)
  - 셀 단위 추출(td 1~4)로 title·traffic·growth·time·related queries 정확 파싱
- **카테고리 자동 분류**: 스포츠 / 엔터테인먼트 / 기술 / 정치 / 금융 / K-콘텐츠 / 라이프스타일 / 시사 / 기타
  - 250+ 키워드 (NBA/NFL/MLB/NHL 팀명, 미국 정치인, 음식 체인, 서구 연예인, 영화·시리즈 제목 등)
  - "X vs Y" 패턴 → 자동 sports
  - 워드 바운더리 정규식으로 substring 오매칭 차단
- **K-콘텐츠 필터**: 60+ 키워드 (kdrama/kpop/BTS/Squid Game/배우 이름 등)
- **🆕 미국 연간 이벤트 캘린더** ([src/data/usEvents.ts](src/data/usEvents.ts)) — 50개 이벤트 (공휴일·시상식·시즌·페스티벌)
  - 동적 날짜 계산 (N번째 weekday / last weekday / 부활절 hardcode)
  - lead-up 일수 + 2일 tail window로 검색 트리거 효과 시간 반영
  - 트렌드별 트리거 키워드 직접 매칭 시 `eventContext` 필드 부여 → "↳ 직후의 켄터키 더비와 직접 연결되는 키워드 'kentucky derby'가 트렌드에 포함됨 — 경마의 정점 + 패션·모자·전통 행사" 같은 자연어 부착
  - 카테고리 amplifier 매칭은 ② 비교 인사이트 본문에 흡수 ("이 흐름은 진행 중인 NBA 플레이오프 시즌과 맞물린 결과")
- **🆕 K-콘텐츠 / 한국어 학습 활용 시사점** — 17개 강한 연결 이벤트에 `kContentImpact` (`observation` + `application`) 작성
  - 예: 핼러윈 → "📊 호러·스릴러 검색 폭증 / 💡 K 스릴러·복수극·좀비물(스위트홈·지옥·킹덤) 노출 기회 + '무서워·소름' 한국어 표현 학습"
  - 예: 추수감사절 → "📊 가족·전통 음식·여행 검색 폭증 / 💡 K-푸드 콘텐츠 + 추석 비교 학습 콘텐츠 결합"
  - 약한 연결 이벤트(스포츠 시즌·정치 공휴일 등)는 빈 필드 → UI 자동 미노출
- **3단계 인사이트** (사용자 명세 그대로):
  - ① K-콘텐츠 트렌드 (북미 내) — 매칭된 K 항목 + 매칭 키워드 + 자연어 해석 + 이벤트 컨텍스트 칩
  - ② 비교 인사이트 — **오늘 활성 이벤트 칩 + K 활용 시사점 카드** + K 비율 4단계 자연어 분기 (주류/부분 진입/소수/부재)
  - ③ 북미 거시 트렌드 (접힘 default) — TOP 검색어 + 카테고리 분포 + 항목별 이벤트 칩·자연어 reason
- **캐시**: `mdl_cache` 테이블 (key `us_daily_v1`), TTL **1시간**

---

## YouTube SNS 버즈 통합

**별도 파이프라인** ([src/crawlers/youtube.ts](src/crawlers/youtube.ts) + [src/pipeline/youtubeAnalysis.ts](src/pipeline/youtubeAnalysis.ts) + [src/pipeline/translateYoutube.ts](src/pipeline/translateYoutube.ts))

- **수집**: `youtubei.js` Innertube로 **14개 해시태그** 검색 → 영상 30개 + 각 댓글 30개 (~10초)
  - K-드라마: `#kdrama` `#koreandrama` `#netflixkdrama` `#kdramareview` `#kdramarecap` `#kdramareaction` `#koreanactor` `#kdramaclip` `#kdramashorts`
  - K-버라이어티: `#kvariety` `#kvarietyshow` `#koreanvariety` `#runningman` `#knowingbros`
- **시간 필터**: `upload_date: 'month'` — 최근 1개월 내 업로드 영상만 (트렌드성 유지)
- **채널 타입 자동 분류** (3단계):
  - **official** (✓ 공식): Netflix Korea·K-Content, The Swoon, Viki, KOCOWA, Disney+, tvN, JTBC, KBS, SBS, MBC, ENA, OCN, Studio Dragon, HYBE, SM, JYP, YG 등
  - **influencer** (🎤 K-드라마 리뷰어): The Daebak Show, DKDKTV, Soompi, Marli Ray, Avenue X, Cinema Jenny 등 + `kdrama review|recap|reaction` 정규식
  - **community** (일반 사용자): 영상 제목이 `reaction|review|recap|breakdown|...` 패턴이면 통과 (외국 개인 유튜버 커버), 아니면 제외
- **2단계 K-content 마커 필터** (북미 채널 우선 정책):
  - **1차 (pre-detail, cheap)**: title + 채널명 + 해시태그만 검사. 공식 채널은 면제 (description 없는 단계라 부정확)
  - **2차 (post-detail, thorough)**: description까지 포함하여 모든 영상 재검사 (공식 포함). 비-K 셀럽이 K-쇼 게스트로 출연한 영상(Billie Eilish on Knowing Bros) / Netflix 본채널이 업로드한 비-K 다큐(Kylie Minogue) 차단
  - **즉시 탈락**: `cdrama|chinese drama|jdrama|japanese drama|thai drama` 명시 / Devanagari·Cyrillic·Arabic·Thai 스크립트 / 로마자 힌디어(`bhai`/`yaar`) / 필리핀어 마커
  - **공식 채널이라도 비-NA 지역 분점 제외**: 채널명에 `philippines/india/indonesia/latino/brasil/türkiye` 등 명시 시 탈락 (Disney+ Philippines, KBS WORLD Latino 등 차단)
  - 오버샘플 50% (topN 30 → 45개 fetch) 후 2차 필터로 안전마진 확보
- **commentCount 캡처**: YouTube 측 총 댓글 수 (크롤한 30개가 아닌 전체)를 영상별 메타에 저장 → engagement score 계산용
- **인기 콘텐츠 TOP 정렬 — Engagement score (log scale 1·2·5 가중)**:
  ```
  score = log10(views+1)·1 + log10(likes+1)·2 + log10(commentCount+1)·5
  ```
  댓글 비중이 가장 큼 — "사람들이 적극 반응한 영상" 의도
- **🏆 작품별 화제도 (contentGroups)**: 영상을 작품 단위로 묶어 상위 6개 노출
  - 작품 식별 3단계: ① `KNOWN_DRAMAS_STATIC` 사전 매칭 (긴 작품명 우선) → ② 트레일러 제목 패턴 (`X | Official Trailer/Teaser/Episode/Recap/Review/Reaction`) → ③ K-쇼 화이트리스트 (`Running Man`/`Knowing Bros` 등)
  - 작품 단위 합산: `videoCount` / `totalViews` / `totalLikes` / `totalComments` / 대표 영상 + 좋아요 TOP 2 댓글
  - 동일 engagement score (합산값 기준)으로 정렬
- **댓글 한국어 번역** ([src/pipeline/translateYoutube.ts](src/pipeline/translateYoutube.ts)): 작품별 카드의 댓글을 Groq AI로 번역 → `textKo` 필드. 화면에선 한글 우선, hover 시 영문 원본
- **콘텐츠 유형 분류**: scene (MV/명장면/트레일러 흡수) / meme / edit / reaction / review / actor / other
- **캐시**: `mdl_cache` 테이블 (key `youtube_buzz_v3`), TTL **3시간**. v3 = contentGroups + commentCount + 한국어 번역 포함

---

## MyDramaList 통합 (Top Airing K-드라마 분석)

**별도 파이프라인** ([src/crawlers/mdl.ts](src/crawlers/mdl.ts) + [src/pipeline/mdlAnalysis.ts](src/pipeline/mdlAnalysis.ts))

- **수집**: Playwright 헤드리스로 `https://mydramalist.com/shows/top_airing` → Korean Drama 필터링 → TOP 5 추출 → 각 드라마당 `/reviews` 상위 리뷰 50개 + 메인 페이지 코멘트 30개
- **🆕 Popular 사전 자동 동기화** ([src/crawlers/mdl.ts](src/crawlers/mdl.ts) `crawlMdlPopularTitles`): `/shows/popular` + `/shows/top_korea` 두 페이지 → 한국 드라마 제목 ~70~100개 → `mdl_popular_titles_v1` 캐시 (TTL 24h) → Stage 3 사전 매칭에 자동 합쳐짐
- **분석**: 리뷰와 코멘트를 **별도 풀로 분리**해 각각 `deepAnalysis` 실행
  - **리뷰 풀** (긴 평론, 분석적 톤) → 쟁점 클러스터, 평점 분포, 대표 리뷰 3개
  - **🆕 코멘트 풀** (시청자 즉각 반응) → 별도 감정 요약·쟁점·👍 좋아요 TOP 5 코멘트 (Groq로 한국어 번역)
- **추가 산출물**:
  - 평점 분포 (9-10 / 7-9 / 5-7 / <5 4구간)
  - 별 항목별 평균 (스토리/연기/음악/재시청)
  - 자연어 인기 사유 (예: `"5점 미만 리뷰 40%로 평가 분열, 연기력(6.3)이 스토리(5.2)보다 높게 평가됨"`)
  - **⚠ 평가 분열 자동 감지**: 평점 ≥ 8 + 5점 미만 리뷰 ≥ 30% OR 댓글 긍·부 비율 양분(±25%p 이내) 조건 시 카드에 노란 배지 + 사유 표기
  - **🆕 시청자 즉각 반응 섹션**: 코멘트 30개에서 좋아요 내림차순 TOP 5 + 답글 표시 + 감정/쟁점 별도 분석
  - 집계: 평균 평점, 가장 칭찬·비판받는 토픽
- **캐시**: `mdl_cache` 테이블, TTL **6시간**. 캐시 hit 시 ~0.5초, miss 시 ~50초 (Playwright × 5 + 리뷰 250개·코멘트 150개·번역 88개)

---

## 대시보드 화면

좌측 사이드바 메뉴 — **대시보드 / 콘텐츠 랭킹 / 🏅 명작 랭킹 / Reddit 포스트 / 크롤링 / 스케줄 / 아카이브 / 검색 / 📖 도움말**.

> 처음 사용하시는 분은 사이드바의 **📖 도움말** 메뉴 또는 [docs/dashboard-guide.md](docs/dashboard-guide.md) 를 먼저 보시면 각 섹션이 어떤 데이터를 어떤 기준으로 보여주는지 파악할 수 있습니다.

### 대시보드 카드 구성 (위에서 아래로)

목적 정합성 평가를 거쳐 **7개 카드**로 압축. 헤더는 핵심 메타데이터(K-콘텐츠 비율·소스 한 줄) inline 표시:

1. **▶️ SNS 버즈 분석 (YouTube)** — 영상 30개 + 댓글 ~900개. **🏆 작품별 화제도 6개** (작품 단위 집계 + 좋아요 TOP 2 한국어 번역 댓글) → **인기 콘텐츠 TOP 30** (engagement score 1·2·5 정렬, 썸네일·views·likes·comments) → 채널 타입·콘텐츠 유형 분포
2. **🧠 한국어 핵심 인사이트** — 4개 카테고리 자연어 (트렌드 요약 / 팬 반응 / 소비 패턴 / 확장 흐름)
3. **🔥 콘텐츠 트렌드** — 작품·배우·키워드 빈도 (3-칼럼)
4. **📺 MDL Top Airing K-드라마 TOP 5** — 포스터/평점/평점 분포/댓글 감정/리뷰 쟁점 클러스터/대표 리뷰 + **🆕 시청자 즉각 반응** (코멘트 별도 분석 + 좋아요 TOP 5 한국어 번역). **⚠ 평가 분열** 배지 자동
5. **🔥 Reddit 토론 TOP 5** — 댓글 합계 기준 가장 활발한 콘텐츠 클러스터
6. **🔬 TOP5 딥 분석** — 인기 포스트별 인기 사유 / 감정 / 의견 유형 / 쟁점 클러스터
7. **🌎 북미 트렌드 분석 (Google Trends · US)** — K-콘텐츠 우선 / 비교 인사이트(**오늘 활성 이벤트 칩 + K 활용 시사점 카드 포함**) / 거시(접힘 default, 항목별 이벤트 칩) 순. 보조 컨텍스트로 하단 배치

**제거된 섹션** (사용자 목적 정합성 낮아 정리): 통계 stat grid · 감정/행동 트렌드 (3-칼럼) · 서브레딧별 특성 · 자동 인사이트(영문 legacy) · 감정별 주요 논의 주제 (키워드 기반 한계로 의미 약함)

### 더보기/접기 토글

각 섹션은 **상단 일부만** 초기 노출(2~5개)하고 "더보기 (+N) ▼" 버튼으로 나머지 확장. 다시 누르면 "접기 ▲". 스크롤 길이 약 50% 단축. 적용 섹션: 한국어 핵심 인사이트 / Reddit 토론 TOP / MDL 드라마 / TOP5 딥 분석 / SNS 버즈 TOP 영상 / GTrends 거시 트렌드.

### 콘텐츠 랭킹 페이지

3개 탭으로 데이터 소스별 랭킹 표 제공:
- **🔥 Reddit** — `topContents` 콘텐츠 클러스터 (제목·타입·소스·플랫폼·배우·점수)
- **📺 MDL** — Top Airing K-드라마 5개 (포스터·연도·리뷰 수·댓글 감정·평점, MDL 자체 Top Airing 순서 유지)
- **▶️ YouTube** — 영상 30개 (썸네일·제목·채널·유형·업로드·조회수, 채널 타입 ✓공식 / 🎤인플루언서 배지)

페이지 진입 시 MDL/YouTube 캐시 prefetch 자동 발동, 비동기 완료 후 즉시 재렌더.

### 명작 랭킹 페이지 (MDL 글로벌 인기 K드라마)

별도 메뉴로 분리된 정적 데이터 참조 페이지. `https://mydramalist.com/shows/popular`의 글로벌 인기 K드라마 TOP 50을 표 형태로 제공.

- **데이터 소스**: Playwright로 `/shows/popular` 1~5페이지 순회 → Korean Drama 필터링 → TOP 50 ([src/crawlers/mdl.ts](src/crawlers/mdl.ts) `crawlMdlPopularRanking`)
- **순위 기준**: MyDramaList 공식 FAQ — *"리스트 추가 수 · 시청자 평점 · 댓글 수 · 추천 수 · 리뷰를 종합한 인기 알고리즘"*. 페이지 헤더 hover 시 영문 원문 툴팁 표시
- **표 컬럼**: 순위 / 포스터 / 제목(원문 MDL 링크) / 연도 / 에피소드 / 평점 / 펼침 화살표
- **🆕 행 클릭 → Lazy 분석 펼침**: 각 작품 행 클릭 시 백엔드가 해당 작품의 리뷰 10개 + 댓글 30개를 크롤(~17초) → `analyzeMdlDramas` 단일 호출로 분석 → 결과 패널 표시:
  - 인기 사유 자연어
  - 평점 분포 막대 (9-10 / 7-9 / 5-7 / <5 색상별)
  - 댓글 감정 막대 + 평가 분열 ⚡ 배지
  - 토픽 클러스터 뱃지 (👍/👎/💬)
  - 대표 리뷰 helpful 순 2개 — **한국어 번역 우선 표시 + [원문 보기] 토글**
  - 분석 완료된 작품은 제목 옆에 📊 마크
- **캐시**:
  - 랭킹 50개: `mdl_popular_ranking_v1` (TTL **30일** — 사용자 요청에 따라 한 달마다 자동 갱신)
  - 단일 작품 분석: `mdl_drama_<slug>_v1` (TTL 30일, 영구 누적 — slug별 키)
  - 리뷰 번역: `translation_cache` 테이블 (영구, 텍스트 해시 기반)

### Reddit 포스트 페이지

상단에 **TOP5 딥 분석** 풀 카드, 그 아래 서브레딧 필터 + 전체 포스트 리스트(클릭 시 원문 이동).

### 크롤링 페이지 (통합 인터페이스)

- 체크박스로 Reddit / MDL / Google Trends / YouTube 개별 선택 (default 4개 모두 ✅)
- MDL · GTrends · YouTube 카드에 "캐시 무시 강제 새로고침" sub-옵션
- 단일 "크롤링 시작" 버튼 → `Promise.allSettled`로 **병렬 실행** (한쪽 실패 영향 격리)

### 뉴스레터 ([src/server.ts](src/server.ts) `/api/newsletter/:id`)

이메일 친화 `<table>` 레이아웃으로 대시보드 핵심을 압축한 정적 HTML — 헤드라인 / 한국어 인사이트 5개 / Reddit 토론 TOP 3 (쟁점 클러스터 1개씩) / **YouTube SNS 버즈** + **MDL TOP 3** + **GTrends 3단계** (캐시 자동 합성).

---

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/health` | 헬스 체크 |
| POST | `/api/crawl/demo` | 데모 데이터로 6단계 파이프라인 실행 |
| POST | `/api/crawl` | 실제 Reddit 크롤링 + 파이프라인 |
| GET | `/api/mdl` | MDL 캐시 조회 (없으면 `summary: null`) |
| POST | `/api/mdl/refresh` | MDL Playwright 크롤링 + 분석 + 캐시 저장 (`{force:true}` 시 캐시 무시) |
| GET | `/api/mdl/popular` | MDL Popular/TopKorea 제목 사전 캐시 조회 (사전 매칭 자동 갱신용) |
| POST | `/api/mdl/popular/refresh` | Popular + TopKorea 페이지 크롤 → 제목 합집합 ~100개 (TTL 24h) |
| GET | `/api/mdl/top-ranking` | 명작 랭킹 (MDL Popular TOP 50 K드라마) 캐시 조회 |
| POST | `/api/mdl/top-ranking/refresh` | `/shows/popular` 5페이지 크롤 → TOP 50 (TTL 30일, `{force:true}` 시 캐시 무시) |
| GET | `/api/mdl/drama/:slug` | 단일 작품 lazy 분석 캐시 조회 |
| POST | `/api/mdl/drama/:slug/analyze` | 단일 작품 리뷰 10 + 댓글 30 크롤 → `analyzeMdlDramas` + 한국어 번역 → 캐시 (TTL 30일) |
| GET | `/api/gtrends` | Google Trends 캐시 조회 |
| POST | `/api/gtrends/refresh` | GTrends RSS 수집 + 카테고리 분류 + K-콘텐츠 비교 인사이트 (`{force:true}` 시 캐시 무시) |
| GET | `/api/youtube` | YouTube 캐시 조회 |
| POST | `/api/youtube/refresh` | YouTube `youtubei.js` 수집 + 콘텐츠 유형·반응 패턴 분석 (TTL 3h) |
| GET | `/api/reports` | 리포트 목록 (`?type=daily\|weekly`) |
| GET | `/api/reports/latest/:type` | 최신 리포트 |
| GET | `/api/reports/:id` | 특정 리포트 |
| DELETE | `/api/reports/:id` | 리포트 삭제 |
| GET | `/api/newsletter` / `/api/newsletter/:id` | 뉴스레터 HTML |
| GET | `/api/logs` | 크롤링 이력 |
| GET | `/api/search?q=&konly=` | 콘텐츠 검색 |
| GET | `/api/schedule` | 스케줄 정보 |
| POST | `/api/schedule/trigger` | 스케줄 수동 트리거 |
| GET | `/api/stats` | 시스템 통계 |

---

## 프로젝트 구조

```
src/
├── server.ts              ← Express 서버 + API 라우팅 (포트 3366)
├── db.ts                  ← SQLite 초기화·CRUD + MDL 캐시
├── demo-data.ts           ← 샘플 Reddit 포스트 (API 키 없이 테스트용)
├── crawlers/
│   ├── reddit.ts          ← RSS 기반 Reddit 수집 (4개 서브레딧)
│   ├── mdl.ts             ← Playwright 기반 MyDramaList 크롤러
│   ├── gtrends.ts         ← Google Trends Playwright 7페이지 병합
│   └── youtube.ts         ← youtubei.js 14개 해시태그 검색 + 2단계 K-content 마커 필터 + 댓글
├── data/
│   ├── usEvents.ts             ← 미국 연간 이벤트 캘린더 50개 + K-콘텐츠 시사점 17개
│   ├── known-dramas-static.ts  ← 한국 드라마·영화 ~150개 + 한국 배우/연기자 ~80명 (정적 사전, commit됨)
│   └── known-dramas.ts         ← 정적 + 동적(MDL airing/popular) 사전 합집합 패턴 빌더
├── pipeline/
│   ├── index.ts           ← 6단계 오케스트레이션
│   ├── filter.ts          ← Stage 2 필터링
│   ├── trends.ts          ← Stage 3 트렌드 분석
│   ├── deepAnalysis.ts    ← Stage 5 딥 분석 (쟁점 클러스터링)
│   ├── insight.ts         ← Stage 6 한국어 인사이트 + legacy English
│   ├── mdlAnalysis.ts     ← MDL 드라마 단위 분석 + 평가 분열 감지
│   ├── gtrendsAnalysis.ts ← GTrends 카테고리 분류 + K비교 인사이트
│   ├── youtubeAnalysis.ts ← YouTube engagement score 정렬 + 작품별 화제도 + 댓글 분석
│   ├── translateYoutube.ts← YouTube 댓글 Groq AI 한국어 번역 (작품별 카드 표시용)
│   ├── normalizer.ts      ← 정규화·드라마 제목 추출
│   ├── clusterer.ts       ← Jaccard/Levenshtein 타이틀 클러스터링
│   ├── scorer.ts          ← 종합 점수 산출
│   └── korean-filter.ts   ← K-콘텐츠 판별
└── types/index.ts         ← 모든 타입 정의 (Reddit + MDL + GTrends + YouTube)

public/static/
├── app.js                 ← Vanilla JS SPA (대시보드 + 크롤링 통합)
└── style.css

data/k-content.db          ← SQLite (자동 생성)
```

---

## SQLite 스키마

```
data/k-content.db
├── reports           - Reddit 리포트 전체 JSON 저장
├── content_snapshots - 콘텐츠별 점수·메타데이터 스냅샷
├── crawl_logs        - 크롤링 실행 이력 (Reddit + MDL)
└── mdl_cache         - MDL Top Airing (key='top_airing_v1', TTL 6h)
                      + MDL Popular/TopKorea 제목 사전 (key='mdl_popular_titles_v1', TTL 24h)
                      + 🏅 명작 랭킹 50개 (key='mdl_popular_ranking_v1', TTL 30일)
                      + 🏅 단일 작품 lazy 분석 (key='mdl_drama_<slug>_v1', TTL 30일, 영구 누적)
                      + GTrends 북미 (key='us_daily_v1', TTL 1h)
                      + YouTube SNS 버즈 (key='youtube_buzz_v3', TTL 3h, contentGroups + 한국어 번역 포함)
└── translation_cache - 영문 → 한국어 번역 (Groq, 텍스트 해시 키, 영구)
```

---

## 미완 / 향후 작업

- **트렌드 변화 (T-1 vs 7일 비교)** — 과거 baseline 누적 필요. `content_snapshots` / `mdl_cache` 시계열 활용해 이전 기간 대비 급상승 키워드 탐지.
- **OAuth API 전환** — 현재 RSS는 `score`(upvotes) 미제공. Reddit OAuth로 전환 시 정확한 추천수 반영 가능.
- **MDL 동적 토픽 라벨 정제** — 가끔 의미 약한 단어가 토픽으로 잡힘. LLM 또는 더 정교한 키워드 가중치 적용 검토.
- **추가 소스** — Letterboxd 리뷰, Google Trends, Instagram/TikTok/X 해시태그 모니터링.
- **node-cron 자동 실행** — 일간/주간 스케줄 자동화.

---

## 기술 노트

- 포트 `3366`은 [src/server.ts:19](src/server.ts:19)에서 `process.env.PORT` 우선
- `better-sqlite3` 12.x로 업그레이드 (Node 25 native build 호환)
- Reddit RSS `<link>` 파싱은 `rel="alternate"` 없이 `href` 속성 매칭 ([src/crawlers/reddit.ts](src/crawlers/reddit.ts))
- `/api/reports/latest/:type` 응답은 `{ ...row, data: <RankedReport> }`로 래핑됨 — frontend `loadLatestReport()`에서 `res.report.data || res.report`로 unwrap ([public/static/app.js](public/static/app.js))
- MDL Playwright `page.evaluate` 안에서는 tsx의 `__name` 헬퍼 주입을 피하기 위해 inner arrow function·type 어노테이션을 사용하지 않음 ([src/crawlers/mdl.ts](src/crawlers/mdl.ts))
