# K-Content Intelligence Dashboard

## 프로젝트 개요
- **목표**: 글로벌 K-콘텐츠 팬 수요를 자동 수집·분석해 주간/일간 뉴스레터 리포트 생성
- **실행 환경**: 로컬 Node.js (Playwright 크롤링 지원)
- **기술 스택**: Node.js + Express + better-sqlite3 + Playwright + TypeScript (tsx)

---

## 실행 방법

```bash
# 의존성 설치
npm install
npx playwright install chromium

# 서버 시작 (PM2)
pm2 start ecosystem.config.cjs

# 개발 모드 (직접 실행)
npm run dev
```

서버 실행 후 → http://localhost:3000

---

## 주요 기능

### ✅ 완성된 기능
- **데모 파이프라인**: 샘플 데이터로 전체 수집→분석→랭킹→인사이트 실행
- **Reddit 실제 크롤링**: Playwright로 r/kdramas, r/kdrama, r/kdramarecommends, r/korean, r/koreatravel 수집 (API 키 불필요)
- **FlixPatrol 크롤러**: Netflix·Disney+·Apple TV+ 글로벌/지역별 순위 수집
- **MyDramaList 크롤러**: 한국 드라마 인기 순위 및 배우 정보 수집
- **데이터 파이프라인**: 정규화 → 중복 제거 → 타이틀 클러스터링 → 점수화 → 랭킹 → 인사이트 자동 생성
- **뉴스레터 HTML 내보내기**: 리포트를 이메일용 HTML로 렌더링
- **스케줄 관리**: 일간/주간 크롤링 스케줄 확인 및 수동 트리거
- **리포트 아카이브**: 생성된 모든 리포트 저장·조회·삭제
- **콘텐츠 검색**: 수집된 스냅샷 타이틀 검색 (K-콘텐츠 필터)
- **시스템 통계**: 총 리포트 수, 스냅샷 수, K-콘텐츠 비율, 크롤링 성공률

### 🔄 향후 추가 예정
- Google Trends 크롤러 (SerpAPI 또는 직접 스크래핑)
- Letterboxd 리뷰 수집 및 감성 분석
- Fundex 국내 인기 지표 연동
- Instagram / TikTok / X 해시태그 모니터링
- 크론 자동 실행 (node-cron 연동)

---

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /api/health | 헬스 체크 |
| POST | /api/crawl/demo | 데모 데이터로 파이프라인 실행 |
| POST | /api/crawl | 실제 크롤링 실행 |
| GET | /api/reports | 리포트 목록 (?type=daily\|weekly) |
| GET | /api/reports/latest/:type | 최신 리포트 조회 |
| GET | /api/reports/:id | 특정 리포트 조회 |
| DELETE | /api/reports/:id | 리포트 삭제 |
| GET | /api/newsletter | 최신 뉴스레터 HTML |
| GET | /api/newsletter/:id | 특정 뉴스레터 HTML |
| GET | /api/logs | 크롤링 이력 |
| GET | /api/search | 콘텐츠 검색 (?q=&konly=) |
| GET | /api/schedule | 스케줄 정보 |
| POST | /api/schedule/trigger | 스케줄 수동 트리거 |
| GET | /api/stats | 시스템 통계 |

---

## 데이터 파이프라인 구조

```
수집 소스                 파이프라인                    출력
─────────────            ──────────────────────         ────────────
Reddit (Playwright)  ──▶  1. 정규화 (소문자·특수문자)
FlixPatrol           ──▶  2. 토크나이징
MyDramaList          ──▶  3. 중복 제거 (Jaccard + Levenshtein)   ──▶ 랭킹 리포트
                          4. 타이틀 클러스터링                        뉴스레터 HTML
                          5. 점수화 (언급×소스가중치 + 참여도 + 최신성)  인사이트 문장
                          6. 인사이트 자동 생성 (템플릿 기반)
```

### 점수 산출 방식
- **언급 점수** (40%): 언급 횟수 × 소스 가중치(FlixPatrol 3.0, MDL 2.5, Reddit 1.2) × 플랫폼 가중치
- **참여도 점수** (20%): log10(댓글 수) × 20
- **최신성 점수** (20%): 수집 시점 기준 경과 시간
- **다양성 점수** (15%): 소스 수 × 15 + 지역 수 × 10
- **K-콘텐츠 보너스** (5%): K-콘텐츠 여부

---

## 데이터 저장 구조 (SQLite)

```
data/k-content.db
├── reports          - 리포트 전체 JSON 저장
├── content_snapshots - 콘텐츠별 점수·메타데이터 스냅샷
└── crawl_logs       - 크롤링 실행 이력
```

---

## 수집 소스 현황

| 소스 | 방식 | 상태 | 비고 |
|------|------|------|------|
| Reddit | Playwright (공개 JSON API) | ✅ 완성 | API 키 불필요 |
| FlixPatrol | Playwright | ✅ 완성 | OTT 순위 |
| MyDramaList | Playwright | ✅ 완성 | 드라마 순위·배우 |
| Google Trends | - | 🔜 예정 | |
| Letterboxd | - | 🔜 예정 | |
| Fundex | - | 🔜 예정 | |
| Instagram/TikTok/X | - | 🔜 예정 | API 키 필요 |

---

## 대시보드 화면 구성

- **대시보드**: 통계 요약, 전체 TOP10, K-콘텐츠 TOP10, 인사이트, Reddit 요약
- **콘텐츠 랭킹**: 전체/K-콘텐츠/멀티소스/소스별 탭 테이블
- **크롤링**: 소스 선택, 실행, 실시간 로그, 이력 확인
- **스케줄**: 일간/주간 다음 실행 시각, 수동 트리거, 시스템 통계
- **아카이브**: 모든 리포트 목록, 뉴스레터 HTML 내보내기, 삭제
- **검색**: 타이틀 검색, K-콘텐츠 필터

---

## 마지막 업데이트
- 2026-04-28
- PM2 단일 프로세스 로컬 실행 구조 완성
- Reddit 실제 크롤링 검증 완료 (125포스트 / 11초)
- 뉴스레터 HTML 내보내기 API 완성
- 스케줄·통계·삭제 API 추가
- 프론트엔드 스케줄 페이지, 뉴스레터 버튼, 아카이브 삭제 UI 추가
