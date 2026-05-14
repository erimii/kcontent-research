# K-Content Intelligence Dashboard

> 글로벌 K-콘텐츠 팬덤이 **오늘 무엇에 반응했는가**를 매일 아침 09:30 자동 수집·분석·요약해 팀원에게 10:00 이메일 발송하는 **로컬-운영형 인사이트 자동화 시스템**.

<table>
<tr>
<td><strong>📂 GitHub</strong></td>
<td><a href="https://github.com/cjkdcuk/kcontent-research">cjkdcuk/kcontent-research</a></td>
</tr>
<tr>
<td><strong>📅 기간</strong></td>
<td>2026-04 ~ 2026-05 (약 6주, 개인 프로젝트)</td>
</tr>
<tr>
<td><strong>👤 역할</strong></td>
<td>기획 · 설계 · 전 구현 · 운영 (1인)</td>
</tr>
<tr>
<td><strong>📏 규모</strong></td>
<td>TypeScript ~6,000줄 · 모듈 30+ · 66 commits</td>
</tr>
<tr>
<td><strong>📖 추가 문서</strong></td>
<td><a href="README.md">README.md</a> (기술 상세) · <a href="docs/RETROSPECTIVE.md">RETROSPECTIVE.md</a> (회고 블로그) · <a href="docs/dashboard-guide.md">dashboard-guide.md</a> (사용 가이드)</td>
</tr>
<tr>
<td><strong>🎬 데모</strong></td>
<td><a href="docs/screenshots/demo.webm">15초 영상 (WebM)</a> · <a href="docs/demo-recording-guide.md">GIF 변환 가이드</a></td>
</tr>
</table>

---

## 1. 프로젝트 한 줄 요약

다섯 곳(Reddit · MyDramaList · YouTube · Instagram · Google Trends US)의 K-드라마 화제 데이터를 자동 수집해 **반응 패턴 · 평가 분열 · 감정 분포 · 한국어 핵심 인사이트**로 가공하고, 평일 매일 아침 팀원 메일함에 **풀 사이즈 뉴스레터를 자동 발송**하는 시스템.

**측정 가능한 결과**
- 일일 데이터 처리: **Reddit 포스트 64건 · MDL 드라마 5건 + 리뷰 250건 · YouTube 영상 30개 + 댓글 ~3,000개 · Instagram Reel 10개 + 댓글 ~580개**
- 한국어 번역 캐시 적중률: **>90%** (영구 해시 캐시)
- 뉴스레터 HTML 크기: **60KB** (5소스 + Instagram 캡처 base64 인라인)
- 자동화 비율: 일일 수집 100% 무인, 사용자 수동 작업은 주 1회(금요일 SNS 크롤 버튼 클릭)

---

## 2. 왜 만들었는가

K-콘텐츠가 글로벌 영향력은 커졌지만, 정작 **국내 콘텐츠 기획·마케팅 실무자**는:
- 영어권 팬 반응을 **읽을 수 없거나** 읽는 데 시간이 너무 듬
- Reddit·MDL·YouTube를 개별로 봐서 **전체 맥락이 파편화**됨
- "지금 글로벌 팬이 어떤 작품에 빠져있는가"를 **하루 단위로 추적**할 도구가 없음
- 매일 수동으로 5개 사이트를 보는 건 30분 이상 소요 → 결국 안 봄

**해결**: 자동 수집 + AI 한국어 번역 + 인사이트 추출 + 매일 아침 메일 → 출근 후 5분만에 글로벌 K-팬덤 동향 파악.

---

## 3. 핵심 기능 (사용자 관점)

### 🎬 데모 영상 (15초)

> `docs/screenshots/demo.webm` (1.75MB · 1280×800). 영상은 [여기서 다운로드](docs/screenshots/demo.webm). GIF로 변환하려면 [demo-recording-guide.md](docs/demo-recording-guide.md) 참조.

### 📸 스크린샷

![① 대시보드 상단](https://raw.githubusercontent.com/cjkdcuk/kcontent-research/main/docs/screenshots/01-dashboard.png)
**① 대시보드 상단** — 사이드바 6개 메뉴 + 헤더(날짜·표본 수)

![② K-콘텐츠 트렌드 분석 (Reddit)](https://raw.githubusercontent.com/cjkdcuk/kcontent-research/main/docs/screenshots/02-trends.png)
**② K-콘텐츠 트렌드 분석 (Reddit)** — 작품·배우·키워드 가로 막대 차트 + 한국어 인사이트 4개

![③ MDL Top Airing TOP 5](https://raw.githubusercontent.com/cjkdcuk/kcontent-research/main/docs/screenshots/03-mdl.png)
**③ MDL Top Airing TOP 5** — 포스터·평점·평점 분포·댓글 감정·평가 분열 자동 탐지

![④ YouTube 파헤치기](https://raw.githubusercontent.com/cjkdcuk/kcontent-research/main/docs/screenshots/04-youtube.png)
**④ YouTube 파헤치기** — 작품별 화제도 + 한국 원제 + 좋아요 TOP 댓글 한국어 번역

![⑤ Instagram Reels 분석](https://raw.githubusercontent.com/cjkdcuk/kcontent-research/main/docs/screenshots/05-instagram.png)
**⑤ Instagram Reels 분석** — Reel 캡처 + 작품별 화제도 + Groq 3-라벨 반응 요약

![⑥ 도움말 (비전공자 가이드)](https://raw.githubusercontent.com/cjkdcuk/kcontent-research/main/docs/screenshots/06-help.png)
**⑥ 도움말 (비전공자 가이드)** — 4-블록 구조: 무엇/어디서/어떻게/알아두면

![⑦ 스케줄 & 자동화](https://raw.githubusercontent.com/cjkdcuk/kcontent-research/main/docs/screenshots/07-schedule.png)
**⑦ 스케줄 & 자동화** — 평일 09:40 자동 크롤 + 10:00 발송 / 금요일 수동 주간 크롤

![⑧ 명작 랭킹](https://raw.githubusercontent.com/cjkdcuk/kcontent-research/main/docs/screenshots/08-ranking.png)
**⑧ 명작 랭킹** — MDL Popular K드라마 TOP 50 (Lazy 분석)

### 3-1. 통합 대시보드 (8개 카드)
- **K-콘텐츠 트렌드 분석 (Reddit)**: 작품·배우·키워드 빈도 가로 막대 차트 + 한국어 인사이트 4개 카테고리
- **Reddit TOP 5 딥 분석**: 인기 포스트 · 토론 주제 칩 · 감정 분포 · i.redd.it 이미지
- **MDL Top Airing TOP 5**: 평점·평점 분포·댓글 감정·**⚡ 평가 분열 자동 탐지**·대표 리뷰 한국어 번역
- **YouTube/Instagram/TikTok 파헤치기**: 작품별 화제도 + 한국 원제 + 좋아요 TOP 댓글 한국어 번역
- **Google Trends 북미**: 오늘 미국 검색어 + K-콘텐츠 매칭 비율

### 3-2. 자동 뉴스레터 (이메일)
- 평일 매일 **10:00 KST 자동 발송** (Resend API)
- 800px 고정 폭 이메일-safe HTML, 5소스 TOP 1 매트릭스 + 작품별 화제도 막대 차트
- Instagram 캡처 이미지 **base64 인라인** → 외부 의존성 0, 이메일 클라이언트 호환

### 3-3. 사내망 호스팅
- LAN IP 노출로 같은 Wi-Fi 팀원이 메일 안 `전체 대시보드` 버튼 클릭 시 실시간 접근

---

## 4. 기술 스택

| 영역 | 기술 | 선택 이유 |
|------|------|-----------|
| 런타임 | **Node.js 25 / TypeScript (tsx)** | Playwright + youtubei.js 활용도 ↑, 빠른 dev iteration |
| 서버 | **Express** | 1인 프로젝트에 비대한 프레임워크 불요 |
| DB | **SQLite (better-sqlite3 12.x)** | 영구 캐시 + 인덱스 없이도 충분, 백업 = 파일 1개 |
| 크롤링 | **Playwright + playwright-extra + stealth** | MDL/Instagram의 Cloudflare·anti-bot 우회 필수 |
| | **youtubei.js (Innertube)** | 무인증 YouTube 데이터 (공식 API 한도·승인 회피) |
| | **@tobyg74/tiktok-api-dl + patch-package** | X-Bogus signature 패치 적용 |
| AI | **Groq Chat API (llama-3.3-70b)** | 한국어 자연스러움 + ~50ms 빠른 응답 |
| 이메일 | **Resend** | SMTP 셋업 0, deliverability ↑, attachments 지원 |
| 스케줄 | **node-cron** | `Asia/Seoul` 타임존 + 평일만(`* * * * 1-5`) 지원 |
| 프로세스 | **PM2 + macOS launchd** | 부팅 시 자동 기동, 메모리 한도 자동 재시작 |
| 프론트 | **Vanilla JS SPA** (React 미사용) | 빌드 도구 의존성 0, 새로고침 = 즉시 변경 반영 |
| 마크다운 | **marked.js** | 도움말 페이지 (비전공자 친화 가이드) |

---

## 5. 시스템 아키텍처

```
            ┌─────────────────────────────────────────────┐
            │  ⏰ node-cron (Asia/Seoul, 월~금)            │
            │  • 09:40 일일 크롤  • 10:00 자동 발송         │
            └────────┬──────────────────┬─────────────────┘
                     │                  │
        ┌────────────▼────────────┐  ┌──▼──────────────────┐
        │  runDailyCrawl()        │  │ sendDailyNewsletter │
        │  (Reddit+MDL+GTrends)   │  │ (5분 후 1회 재시도)   │
        └────────────┬────────────┘  └──┬──────────────────┘
                     │                  │
       ┌─────────────┴────────────┐    │
       ▼             ▼            ▼    ▼
   ┌────────┐   ┌────────┐  ┌────────┐  ┌──────────────┐
   │ Reddit │   │  MDL   │  │GTrends │  │ buildNews-   │
   │  RSS   │   │ Pwt+   │  │ RSS    │  │ letterV2()   │
   │        │   │stealth │  │        │  └──┬───────────┘
   └────────┘   └────────┘  └────────┘     │
                                            ▼
   ┌────────┐   ┌────────┐   ┌────────┐  ┌──────────────┐
   │YouTube │   │TikTok  │   │Instag- │  │ inlineLocal- │
   │innert- │   │X-Bogus │   │ram     │  │ Images()     │
   │ube     │   │+cookie │   │pwt+st  │  │ (base64)     │
   └────────┘   └────────┘   └────────┘  └──┬───────────┘
   ↑ 주간 수동 (금요일 사이드바 버튼)            │
                                            ▼
                                       ┌──────────────┐
                                       │   Resend     │
                                       │   to: team   │
                                       └──────────────┘

                    ┌─────────────────────────────┐
                    │ SQLite (data/k-content.db)   │
                    │  • reports (일일 리포트)      │
                    │  • mdl_cache (TTL 캐시)      │
                    │     - Reddit per-report      │
                    │     - MDL/GTrends 1일         │
                    │     - YT/IG/TT 7일           │
                    │  • translation_cache         │
                    │     (영구, 텍스트 해시)       │
                    └─────────────────────────────┘

                    ┌─────────────────────────────┐
                    │ Frontend SPA (port 3306)     │
                    │  • LAN IP 노출 사내 공유      │
                    │  • 8개 카드 + 도움말 + 명작   │
                    │    랭킹 + 크롤링 + 스케줄     │
                    │    + 아카이브                │
                    └─────────────────────────────┘
```

---

## 6. 기술적 도전 & 해결 (면접 단골 사례)

### 도전 1 — TikTok 100% anti-bot 차단 진단
**상황**: TikTok 키워드 검색 결과가 4개만 반환되더니 점차 0개로.
**시도**:
1. 쿠키 갱신 → 효과 X
2. X-Bogus signature 검증 → 라이브러리에서 누락 발견 → `patch-package`로 in-house 패치
3. IP 로테이션 → 효과 X
4. device_id 변조 → 효과 X
5. Playwright + stealth 트랙 추가 → DataDome 차단

**해결**: 5단계 진단 후 **TikTok 측 정책 변경으로 `/api/challenge/item_list/`·`/api/search/item/full/` 엔드포인트 자체가 봇 트래픽에 닫혔다**고 결론. 자동 크롤 중단 + **명시적 수동 트리거 + 확인 다이얼로그 + "차단 중" UI 배지**로 사용자 기대 관리. 트랙은 `tiktokWeb.ts`로 보존(추후 정책 변경 대비).

**핵심 학습**: 무한정 시도 대신 **명확한 stop loss + 사용자 명시**가 운영 가능성을 살린다.

---

### 도전 2 — Instagram의 IP throttle + 로그인 wall
**문제**: 로그인 쿠키만으로도 5-10분 후 차단, 차단 후 30분 lockout.
**해결**:
- `playwright-extra` + `stealth` 플러그인 (자동화 감지 회피)
- 카테고리당 max 2 Reel + 인간 같은 sleep 패턴 (1-3초 랜덤)
- 차단 감지 시 자동 30분 lockout (다른 작업까지 깨지지 않도록 격리)
- GraphQL 응답 intercept로 댓글 ~50개 deep crawl (DOM 스크롤보다 안정)
- 결과 0건 시 503 + 이전 캐시 fallback (사용자에 stale 경고)

---

### 도전 3 — 매일 fresh 데이터 보장 (TTL 차등화)
**문제**: 매일 자동 발송 시점에 일부 캐시가 만료돼 섹션이 빠지는 케이스.
**해결**: 크롤 주기에 맞춰 TTL 차등화
| 소스 | 크롤 주기 | TTL |
|------|----------|-----|
| Reddit | 매일 자동 | per-report (만료 X) |
| MDL · GTrends | 매일 자동 09:40 | 1일 |
| YouTube · Instagram · TikTok | 주 1회 수동 (금) | **7일** |

**부가**: 발송 직전 캐시 만료 상태면 5분 후 1회 자동 재시도 → 그래도 실패하면 발신자에게 에러 메일.

---

### 도전 4 — 영문 K-드라마 제목의 한국 원제 자동 매핑
**문제**: 글로벌 팬은 `Queen of Tears`로 부르지만 한국 팀원에겐 `눈물의 여왕`이 자연스러움. 새로 시작되는 작품은 정적 사전에 없음.
**해결**: 3단계 우선순위 머지
1. **정적 사전** (`korean-titles.js` 300+ 작품, 수동 큐레이션)
2. **MDL Popular nativeTitle 자동 수집** (TOP 50 detail 페이지 방문, TTL 7일)
3. **MDL Upcoming 자동 수집** (`mydramalist.com/search?adv=titles&ty=68&co=3&st=2&so=date` 미방영 신작 대응, TTL 24h)

대시보드·뉴스레터 둘 다 `lookupKoreanTitle(영문제목)` 한 줄로 호출.

---

### 도전 5 — 이메일 클라이언트 호환 (Gmail · Outlook · Apple Mail)
**문제**:
- Gmail의 102KB 클리핑 한도
- Outlook의 `position:absolute` 미지원
- 외부 이미지 자동 차단

**해결**:
- **800px 고정 폭 `<table>` 레이아웃** (flexbox·grid 사용 X)
- **인라인 CSS만** (외부 stylesheet, `<style>` 블록 최소화)
- **base64 inline 이미지** (Instagram 캡처를 외부 URL 없이 단일 HTML로 자급)
- BCC로 수신자 명단 보호 + 단일 Resend API 호출

**검증**: Gmail 웹/모바일, Apple Mail, 이메일 첨부 모드 모두 정상 렌더 확인.

---

### 도전 6 — 도움말 페이지 비전공자용 재작성 + 시각 위계
**문제**: 초기 도움말은 기술 용어("engagement score", "API endpoint", "TTL")로 작성. 마케팅·기획 동료가 이해 못 함.
**해결**:
- 모든 카드를 4-블록 구조로 통일: 🏷 **무엇을 보여주나요?** · 📡 **어디서 가져왔나요?** · 👀 **어떻게 보면 되나요?** · 💡 **알아두면 좋은 점**
- 친근한 존댓말 + 비유 사용 ("자동으로 정보 수집하는 프로그램", "캐시 = 몇 시간마다 새로 가져오는지")
- 마크다운 → marked.js → HTML 렌더 시 **CSS 위계 강화**: h1 32px / h2 24px 골드 박스 / h3 21px 골드 그라데이션 → 비전공자가 카드 빨리 찾을 수 있도록

---

## 7. 운영 자동화 설계

### 환경 변수 (단일 출처: `~/Desktop/secret/001/.env.local`)
모든 시크릿은 600 권한 파일 한 곳에서 관리. 코드에서는 `loadEnvKey(key)` 한 줄로 접근.

```
RESEND_API_KEY=re_...
RESEND_FROM="K-Content <noreply@kduck.net>"
RESEND_REPLY_TO=ask.cjkduck@gmail.com
MAIL_RECIPIENTS=teammate1@example.com,teammate2@example.com
PUBLIC_NEWSLETTER_HOST=http://10.229.55.147:3306
GROQ_API_KEY=gsk_...
```

### 발송 안전장치 (3단계 보호)
- **기본값 = 본인 메일만** (`POST /api/email/send {}` → `RESEND_REPLY_TO`만 수신)
- 팀 전체 발송은 명시적 동의 표현 필수 (`{useTeam:true}`)
- 임의 수신자는 `{to:[...]}`로만 가능
- **dryRun 모드**: 발송 없이 수신자·HTML 크기만 echo

### 실패 격리
- `Promise.allSettled`로 5개 소스 격리 (Reddit 실패해도 MDL·GTrends는 진행)
- 발송 실패 시 5분 후 1회 자동 재시도 → 둘 다 실패하면 발신자에 에러 메일 (1차+2차 에러 본문 포함)

### 시크릿 위생 (CLAUDE.md에 강제)
- 진단·디버깅 중에도 시크릿 본문은 **prefix 4자리만** 컨텍스트에 노출
- `pgrep -fl`, `ps aux`, `env` 등 시크릿이 노출될 수 있는 명령 금지
- 작업 상태는 파일 존재·크기로만 확인

---

## 8. 모듈 구성 (관심사 분리)

```
src/
├── server.ts              ← Express + API 라우팅 (포트 3306)
├── db.ts                  ← SQLite 초기화 + CRUD + 캐시
├── crawlers/              ← 데이터 수집 (5개 소스)
│   ├── reddit.ts (RSS)
│   ├── mdl.ts (Playwright)
│   ├── gtrends.ts (Playwright)
│   ├── youtube.ts (Innertube)
│   ├── instagram.ts (Playwright + stealth)
│   └── tiktok.ts (X-Bogus patch)
├── pipeline/              ← 분석 6단계 + 한국어 번역
│   ├── index.ts (오케스트레이션)
│   ├── filter.ts (K-content 마커)
│   ├── trends.ts (작품·배우·키워드 빈도)
│   ├── clusterer.ts (Jaccard/Levenshtein 타이틀 클러스터링)
│   ├── deepAnalysis.ts (쟁점 클러스터링)
│   ├── insight.ts (한국어 인사이트 4종)
│   ├── newsletter.ts (이메일 HTML 빌더)
│   ├── translateYoutube.ts / translateMdl.ts / translateInstagram.ts
│   └── ...
├── lib/                   ← 인프라
│   ├── email.ts (Resend 래퍼 + base64 인라인)
│   ├── dailyCrawl.ts (Reddit+MDL+GTrends 일일 orchestrator)
│   ├── weeklyCrawl.ts (YT+IG+TT 주간 orchestrator)
│   ├── scheduler.ts (node-cron + 재시도)
│   ├── translate.ts (Groq + 영구 캐시)
│   └── langDetect.ts (franc 언어 감지)
└── types/index.ts         ← 모든 타입 정의
```

**설계 원칙**: `crawlers/`는 데이터 수집만, `pipeline/`은 비즈니스 로직만, `lib/`는 외부 시스템 어댑터 — 각 layer는 한 방향으로만 의존.

---

## 9. 학습 & 회고

### 잘한 점
- **운영 가능성 우선**: 100% 자동화에 매몰되지 않고 TikTok 차단 같은 외부 변수는 사용자 명시 + 수동 트리거로 안전하게 운영. "동작하지 않는 자동화"보다 "정직한 수동 안내"가 신뢰를 만든다.
- **TTL 차등화**: 크롤 비용·신선도·실패 격리를 한 번에 해결. 매일 발송 보장.
- **시크릿 위생 정책 문서화**: 사고 1회(Supabase key 노출) 후 CLAUDE.md에 화이트리스트로 명시. 이후 0건.

### 아쉬운 점 & 다음 단계
- 발송 이력 통계 대시보드 미구현 (Resend webhook 미연동)
- 단위 테스트 X — 크롤 안정성은 통합 테스트(실제 endpoint 호출)로만 검증. Jest 도입 검토
- 클라우드 호스팅 미적용 — 노트북 의존. Fly.io/VPS로 운영 안정성 ↑ 가능 (Cloudflare는 Workers 1MB script 한도 + Playwright 150MB 충돌로 불가)
- 수신자 명단 관리가 env 한 줄 — 5명 이상으로 늘면 DB + 어드민 UI 필요

> *상세 회고는 [docs/RETROSPECTIVE.md](docs/RETROSPECTIVE.md)에 별도 정리.*

---

## 10. 한 줄 요약 (이력서·링크드인용)

> **글로벌 K-콘텐츠 팬덤 데이터를 5개 SNS에서 자동 수집·분석해 매일 아침 한국어 인사이트 뉴스레터를 팀에 자동 발송하는 시스템을 1인으로 설계·구현·운영 (Node.js, TypeScript, Playwright, Groq AI, Resend, SQLite)**
