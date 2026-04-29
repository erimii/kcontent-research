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
  - Google Trends Daily RSS (인증 불필요)
- **프론트**: Vanilla JS SPA (`public/static/app.js`)

---

## 실행 방법

```bash
npm install                          # 의존성 설치 (better-sqlite3 빌드 포함)
npx playwright install chromium      # MDL 크롤링용 (최초 1회)
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

---

## 6단계 데이터 파이프라인

```
[1] 데이터 수집  →  [2] 필터링  →  [3] 트렌드 분석  →
[4] 인기 포스트  →  [5] 딥 분석  →  [6] 한국어 인사이트
```

### Stage 1 — 데이터 수집 ([src/crawlers/reddit.ts](src/crawlers/reddit.ts))

Reddit Atom RSS 기반(인증 불필요), 4개 서브레딧:
- `r/kdramas`, `r/kdrama`, `r/kdramarecommends`, `r/korean`

각 서브레딧당 `hot.rss` + `new.rss` 두 정렬 모두 수집해 병합. 1주 이내 포스트만 유지하고, 상위 12개 포스트는 댓글 RSS(최대 50개) 추가 수집.

### Stage 2 — 필터링 ([src/pipeline/filter.ts](src/pipeline/filter.ts))

- 제목+본문 길이 20자 미만 제거
- 광고/홍보 패턴(promo/discount/sponsored/affiliate) 정규식 제거
- 댓글 0개 옵션(기본 off)
- ID 기준 중복 제거
- 결과: `{ filtered, stats: { before, after, removed: { tooShort, promotional, noComments, duplicate } } }`

### Stage 3 — 트렌드 분석 ([src/pipeline/trends.ts](src/pipeline/trends.ts))

- **콘텐츠 트렌드**: 따옴표 제목 카운트(K-콘텐츠) + 알려진 배우 매칭 + stopword 제외 키워드 빈도
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
3. **대표 댓글 3개** — score 순(혼재 토픽이면 contrast 우선)
4. **인기 사유** — 자연어 한 단락 (시의성 + 참여도 + 감정 + 의견 dominance + 주요 쟁점)
5. **댓글 쟁점 클러스터 TOP 3** — Hybrid 접근:
   - 12개 K-드라마 쟁점 템플릿 매칭 (전개 속도/결말 만족도/캐릭터 개연성/케미·관계/연기력 등)
   - 부족분은 동적 n-gram 클러스터링으로 채움 (URL 노이즈 필터, 단복수 정규화, bigram 우선)
   - 각 쟁점은 **구체적 쟁점 형태** (예: `"캐릭터 행동의 개연성 논쟁"`)
   - 출력: 설명 / 의견 분포(긍정 vs 부정 혼재 60/40 등) / 대표 댓글 2-3개(긍·부·중 표시) / 맥락 / 해석

### Stage 6 — 한국어 핵심 인사이트 ([src/pipeline/insight.ts](src/pipeline/insight.ts) `generateKoreanInsights`)

5개 카테고리, 각각 한 단락 + evidence chip:
- 📈 **트렌드 요약** — 가장 많이 언급된 콘텐츠
- 💬 **팬 반응 특징** — 감정 분포 + 행동 dominance
- 🎬 **콘텐츠 소비 패턴** — TOP5 평균 댓글 + 긍정률
- 🌏 **확장 흐름** — 드라마 소비 → 한국 문화·언어 확장 양상
- 👥 **커뮤니티 특성** — 서브레딧별 주 행동

---

## Google Trends 통합 (북미 거시 + K-콘텐츠 비교)

**별도 파이프라인** ([src/crawlers/gtrends.ts](src/crawlers/gtrends.ts) + [src/pipeline/gtrendsAnalysis.ts](src/pipeline/gtrendsAnalysis.ts))

- **수집**: `https://trends.google.com/trending/rss?geo=US` 데일리 RSS — 검색어/트래픽/뉴스 아이템 추출 (~1.5초)
- **카테고리 자동 분류**: 스포츠 / 엔터테인먼트 / 기술 / 정치 / 금융 / K-콘텐츠 / 라이프스타일 / 시사 / 기타 (워드 바운더리 정규식 매칭)
- **K-콘텐츠 필터**: 60+ 키워드 (kdrama/kpop/BTS/Squid Game/배우 이름 등)
- **3단계 인사이트** (사용자 명세 그대로):
  - ① 북미 거시 트렌드 — TOP 10 + 카테고리 분포 + 한 줄 요약
  - ② K-콘텐츠 트렌드 — 매칭된 K 항목 + 매칭 키워드 + 자연어 해석
  - ③ 비교 인사이트 — K 비율(%)에 따라 4단계 자연어 분기 (주류/부분 진입/소수/부재)
- **캐시**: `mdl_cache` 테이블 (key `us_daily_v1`), TTL **1시간**

---

## MyDramaList 통합 (Top Airing K-드라마 분석)

**별도 파이프라인** ([src/crawlers/mdl.ts](src/crawlers/mdl.ts) + [src/pipeline/mdlAnalysis.ts](src/pipeline/mdlAnalysis.ts))

- **수집**: Playwright 헤드리스로 `https://mydramalist.com/shows/top_airing` → Korean Drama 필터링 → TOP 5 추출 → 각 드라마의 `/reviews`에서 상위 리뷰 10개씩
- **분석**: 리뷰를 RedditComment 형태로 변환 → 기존 `deepAnalysis` 재활용해 동일한 쟁점 클러스터링·자연어 요약 적용
- **추가 산출물**:
  - 평점 분포 (9-10 / 7-9 / 5-7 / <5 4구간)
  - 별 항목별 평균 (스토리/연기/음악/재시청)
  - 자연어 인기 사유 (예: `"5점 미만 리뷰 40%로 평가 분열, 연기력(6.3)이 스토리(5.2)보다 높게 평가됨"`)
  - 집계: 평균 평점, 가장 칭찬·비판받는 토픽
- **캐시**: `mdl_cache` 테이블, TTL **6시간**. 캐시 hit 시 ~0.5초, miss 시 ~7~15초 (Playwright + Cloudflare 통과)

---

## 대시보드 화면

좌측 사이드바 메뉴 — **대시보드 / 콘텐츠 랭킹 / Reddit 포스트 / 크롤링 / 스케줄 / 아카이브 / 검색**.

### 대시보드 카드 구성 (위에서 아래로)

1. **통계 stat grid** — 총 콘텐츠 / K-콘텐츠 비율 / 인사이트 수 / 수집 소스
2. **🧠 한국어 핵심 인사이트** — Stage 6 결과 5개 (헤더에 필터링 통계 표기)
3. **🔥 콘텐츠 트렌드 / 😊 감정 트렌드 / 💬 행동 트렌드** (3-칼럼)
4. **💭 감정별 주요 논의 주제** — 긍정/중립/부정 컬럼별 TOP3 토픽 + 대표 인용
5. **👥 서브레딧별 특성** — 카드 그리드, 클릭 시 해당 서브레딧 이동
6. **🌎 북미 트렌드 분석 (Google Trends · US)** — 3단계(거시/K-콘텐츠/비교) 통합 섹션. 자동 캐시 로드, "새로고침" 버튼
7. **📺 MDL Top Airing K-드라마 TOP 5** — 포스터/평점/평점 분포/댓글 감정/리뷰 쟁점 클러스터/대표 리뷰
8. **🔥 Reddit 토론 TOP 5** — 댓글 합계 기준 가장 활발한 콘텐츠 클러스터
9. **🔬 TOP5 딥 분석** — 인기 포스트별 인기 사유 / 감정 / 쟁점 클러스터 / 대표 댓글
10. **💡 자동 인사이트** — 영문 보조 인사이트 (legacy)

### Reddit 포스트 페이지

상단에 **TOP5 딥 분석** 풀 카드, 그 아래 서브레딧 필터 + 전체 포스트 리스트(클릭 시 원문 이동).

### 크롤링 페이지 (통합 인터페이스)

- 체크박스로 Reddit / MDL / Google Trends 개별 선택 (default 셋 다 ✅)
- MDL·GTrends 카드에 "캐시 무시 강제 새로고침" sub-옵션
- 단일 "크롤링 시작" 버튼 → `Promise.allSettled`로 **병렬 실행** (한쪽 실패 영향 격리)

### 뉴스레터 ([src/server.ts](src/server.ts) `/api/newsletter/:id`)

이메일 친화 `<table>` 레이아웃으로 대시보드 핵심을 압축한 정적 HTML — 헤드라인 / 한국어 인사이트 5개 / Reddit 토론 TOP 3 (쟁점 클러스터 1개씩) / **MDL TOP 3** + **GTrends 3단계** (캐시 자동 합성) / 서브레딧 mini.

---

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/health` | 헬스 체크 |
| POST | `/api/crawl/demo` | 데모 데이터로 6단계 파이프라인 실행 |
| POST | `/api/crawl` | 실제 Reddit 크롤링 + 파이프라인 |
| GET | `/api/mdl` | MDL 캐시 조회 (없으면 `summary: null`) |
| POST | `/api/mdl/refresh` | MDL Playwright 크롤링 + 분석 + 캐시 저장 (`{force:true}` 시 캐시 무시) |
| GET | `/api/gtrends` | Google Trends 캐시 조회 |
| POST | `/api/gtrends/refresh` | GTrends RSS 수집 + 카테고리 분류 + K-콘텐츠 비교 인사이트 (`{force:true}` 시 캐시 무시) |
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
│   └── gtrends.ts         ← Google Trends 데일리 RSS 수집
├── pipeline/
│   ├── index.ts           ← 6단계 오케스트레이션
│   ├── filter.ts          ← Stage 2 필터링
│   ├── trends.ts          ← Stage 3 트렌드 분석
│   ├── deepAnalysis.ts    ← Stage 5 딥 분석 (쟁점 클러스터링)
│   ├── insight.ts         ← Stage 6 한국어 인사이트 + legacy English
│   ├── mdlAnalysis.ts     ← MDL 드라마 단위 분석 (deepAnalysis 재활용)
│   ├── gtrendsAnalysis.ts ← GTrends 카테고리 분류 + K비교 인사이트
│   ├── normalizer.ts      ← 정규화·드라마 제목 추출
│   ├── clusterer.ts       ← Jaccard/Levenshtein 타이틀 클러스터링
│   ├── scorer.ts          ← 종합 점수 산출
│   └── korean-filter.ts   ← K-콘텐츠 판별
└── types/index.ts         ← 모든 타입 정의 (Reddit + MDL)

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
                      + GTrends 북미 (key='us_daily_v1', TTL 1h)
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
