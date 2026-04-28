# K-Content Intelligence Dashboard

## 프로젝트 개요
- **목표**: K-콘텐츠 글로벌 팬 수요 캡처 및 주간/일간 뉴스레터 자동 생성
- **아키텍처**: Node.js + Express + SQLite (로컬 실행)
- **데이터 파이프라인**: 수집 → 정규화 → 중복제거 → 클러스터링 → 점수화 → 인사이트 생성

## 완성된 기능

### 데이터 수집 소스
| 소스 | 방식 | 수집 내용 |
|---|---|---|
| Reddit | Pullpush API + RSS | r/kdramas, r/kdrama, r/kdramarecommends, r/korean, r/koreatravel |
| FlixPatrol | Playwright (headless) | Netflix/Disney+/Apple TV+ 글로벌 TOP10 |
| MyDramaList | Playwright (headless) | 한국 드라마 인기순/평점순 |

### 데이터 파이프라인 엔진
1. **정규화** – 소문자 변환, 특수문자 제거, 토큰화
2. **중복 제거** – Jaccard 유사도 + Levenshtein 거리 + 부분 포함 검사
3. **클러스터링** – 동일 작품으로 보이는 항목을 하나의 클러스터로 묶음
4. **점수화** – 소스별 가중치 × 언급수 + 참여도 + 최신성 + 다양성
5. **인사이트 생성** – 템플릿 기반 자동 문장 생성 (dominant/rising/newcomer/actor/genre/regional)

### API 엔드포인트
| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/health` | 헬스체크 |
| POST | `/api/crawl/demo` | 데모 데이터로 파이프라인 실행 |
| POST | `/api/crawl` | 실제 크롤링 + 파이프라인 실행 |
| GET | `/api/reports` | 리포트 목록 (`?type=daily&limit=20`) |
| GET | `/api/reports/latest/:type` | 최신 리포트 조회 |
| GET | `/api/reports/:id` | 특정 리포트 조회 |
| GET | `/api/newsletter` | 최신 리포트 뉴스레터 HTML (`?type=daily`) |
| GET | `/api/newsletter/:id` | 특정 리포트 뉴스레터 HTML |
| GET | `/api/logs` | 크롤링 이력 조회 |
| GET | `/api/search` | 콘텐츠 검색 (`?q=제목&konly=true`) |

### 대시보드 UI 페이지
- **📊 대시보드**: 전체 TOP10 / K-콘텐츠 TOP10 / 자동 인사이트 / Reddit 요약
- **🏆 콘텐츠 랭킹**: 탭별 필터 (전체/K-콘텐츠/Reddit/FlixPatrol) + 상세 테이블
- **🤖 크롤링 제어**: 소스 선택 / 실시간 로그 / 크롤링 이력
- **📁 리포트 아카이브**: 리포트 목록 + 뉴스레터 HTML 내보내기
- **🔍 검색**: 수집된 콘텐츠 전문 검색

## 실행 방법

```bash
# 서비스 시작 (PM2)
pm2 start ecosystem.config.cjs

# 또는 직접 실행
node --import tsx/esm src/server.ts

# 헬스체크
curl http://localhost:3000/api/health

# 데모 파이프라인 실행
curl -X POST http://localhost:3000/api/crawl/demo -H "Content-Type: application/json" -d '{"type":"daily"}'

# Reddit만 실제 크롤링
curl -X POST http://localhost:3000/api/crawl -H "Content-Type: application/json" -d '{"type":"daily","sources":["reddit"]}'

# 뉴스레터 HTML 브라우저에서 열기
open http://localhost:3000/api/newsletter
```

## 데이터 구조

### 주요 모델
- **RedditPost**: id, subreddit, title, url, score, commentCount, comments[]
- **FlixPatrolEntry**: rank, title, platform, region, points, isKContent
- **MyDramaListEntry**: rank, title, rating, votes, genres, actors
- **ContentCluster**: representativeTitle, aliases, sources, platforms, regions, finalScore, isKContent, actors, genres
- **RankedReport**: topContents, topByPlatform, topByRegion, insights, redditSummary

### 저장소
- **SQLite DB**: `data/k-content.db`
  - `reports` – 생성된 전체 리포트 (JSON blob)
  - `content_snapshots` – 콘텐츠 스냅샷 (검색용)
  - `crawl_logs` – 크롤링 이력

## 기술 스택
- **Runtime**: Node.js 20 + tsx
- **Backend**: Express.js
- **DB**: better-sqlite3 (로컬 SQLite)
- **Crawler**: Playwright (headless Chromium) + Pullpush API + RSS
- **Frontend**: Vanilla JS + TailwindCSS CDN + Chart.js
- **Process Manager**: PM2

## 향후 개발 예정
- Google Trends / Letterboxd / Fundex 크롤러 추가
- Instagram, TikTok, X(Twitter), YouTube 소셜 모니터링
- 뉴스레터 이메일 발송 자동화 (SendGrid 연동)
- 크론 스케줄링 자동화 (daily/weekly 자동 실행)
- 배우 언급 추적 고도화
- 한국어 콘텐츠 제목 매핑 개선

## 상태
- **서비스**: ✅ 실행 중 (localhost:3000)
- **DB**: ✅ 정상 (data/k-content.db)
- **Reddit 크롤러**: ✅ 정상 (Pullpush API)
- **FlixPatrol 크롤러**: ✅ Playwright 준비
- **MyDramaList 크롤러**: ✅ Playwright 준비
