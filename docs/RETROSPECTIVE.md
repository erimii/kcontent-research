# 회고 — K-Content Intelligence Dashboard 6주 개발기

> *"매일 아침 글로벌 K-드라마 팬덤이 뭐에 빠져있는지 5분만에 알 수 있으면 좋겠다"* 라는 욕심에서 시작해, **6주 동안 5개 SNS 크롤 자동화 + 매일 자동 뉴스레터 시스템**을 혼자 만들어 운영까지 도달한 이야기.

📅 **기간**: 2026-04-12 ~ 2026-05-14
👤 **작성자**: erimii
🔗 **프로젝트**: [github.com/cjkdcuk/kcontent-research](https://github.com/cjkdcuk/kcontent-research)

---

## 시작 — 왜 만들었는가

K-드라마가 글로벌에서 화제라는 건 누구나 알지만, **정작 한국에서 일하는 마케터·기획자가 그 화제를 실시간으로 따라잡을 도구는 없었어요.**

내가 하루 동안 본 광경:
- 미국 친구 인스타에 K-드라마 reel이 떠 있음 → "이게 뭐지?"
- Reddit 들어가서 r/kdrama 봤더니 댓글이 영어로 200개 → "읽기 싫다"
- MyDramaList(MDL) 평점 확인하려고 사이트 갔더니 작품 30개 중 한국 원제 모르겠음
- YouTube에서 트레일러 보러 갔는데 어떤 영상이 화제인지 모름
- Google Trends 봤더니 미국 키워드 100개 중 K-콘텐츠 비중을 손으로 세야 함

이걸 5번 반복하면 **30분이 사라짐**. 그래서 결국 안 본다.

**"매일 아침 출근하면 메일함에 한국어로 정리된 글로벌 K-팬 동향이 와 있으면?"** — 이 한 문장에서 시작했어요.

---

## 첫 2주: "수집하는 게 이렇게 어려운 줄 몰랐다"

### 무지의 봉우리

크롤링 = `fetch()` 한 번이면 되는 줄 알았어요. 6시간만에 깨달음:

**Reddit**: RSS가 살아있어서 무난. 30분 컷.
**MyDramaList**: `curl` → 403. 봇 차단. → Playwright headless 도입. 일단 됨.
**Google Trends**: 공식 API 없음. RSS도 일부만. Playwright로 7개 카테고리 페이지 병합. 1시간.
**YouTube**: 공식 API 한도 1만/일 + 승인 절차. → `youtubei.js`(Innertube 비공식) 도입. 무인증 + 무제한. 30분.
**TikTok**: 라이브러리 5개 후보 → 가장 활발한 `@tobyg74/tiktok-api-dl` 선정. **(이게 지옥의 시작)**
**Instagram**: 로그인 wall 뚫고 데이터 가져오는 데 3일.

### TikTok 진단의 5단계

가장 길게 싸운 건 TikTok. 결과부터 말하면 **졌어요**. 하지만 그 과정에서 배운 게 가장 많습니다.

```
[1단계] 키워드 검색 결과 4개만 반환
        → 쿠키 만료 의심 → 재로그인 → 효과 X

[2단계] HTTP 401, 403 디버깅
        → X-Bogus signature 누락 발견
        → 라이브러리 GitHub Issue 검토
        → patch-package로 in-house 패치

[3단계] 잠시 작동, 다음 날 다시 0개
        → 동일 IP에서 호출 너무 많아서?
        → mobile hotspot으로 IP 변경
        → 효과 X

[4단계] device_id 변조, User-Agent 다양화
        → 효과 X

[5단계] Playwright + stealth 트랙 별도 구축
        → DataDome 차단 페이지 응답
        → "이건 안 되는구나" 확신
```

**결론**: TikTok 측에서 `/api/challenge/item_list/` 같은 anti-bot 정책을 강화. 라이브러리·IP·시그니처 다 의미 없음.

**선택**: 자동 크롤 disable + **수동 트리거 + 확인 다이얼로그 + "차단 중" UI 배지**. 사용자가 명시적으로 시도해서 실패하는 건 OK. 자동 cron으로 매일 실패 알림이 가는 건 노이즈.

### 배운 점 ✨

> **"동작하지 않는 자동화"보다 "정직한 수동 안내"가 신뢰를 만든다.**

내가 만든 시스템을 사용자가 신뢰하려면, 시스템이 **무엇을 못 하는지를 명확히 알려야** 한다. 무한정 재시도 + "차단됐어요" 같은 모호한 에러는 더 큰 짜증을 만든다.

---

## 중반 3-4주: "데이터가 있어도 못 쓰는 데이터"

수집은 됐는데, 이걸 한국 팀이 쓸 수 있게 만드는 게 더 어려웠어요.

### 영문 제목 지옥

```
Queen of Tears     → 눈물의 여왕 (정적 사전에 있음)
Moving             → 무빙 (있음)
Lovely Runner      → 선재 업고 튀어 (없음 — 외국 팬은 영문으로만 부름)
My Royal Nemesis   → 멋진 신세계 (있는 줄 알았는데 잘못 매핑됨 — 사용자 지적으로 수정)
WONDERfools        → 원더풀스 (미방영 신작 — 정적 사전엔 없음)
```

해결책 — 3단계 우선순위 머지:
1. 정적 사전 (`korean-titles.js` 300+ 작품, 수동 큐레이션)
2. **MDL Popular nativeTitle 자동 수집** (TOP 50 detail 페이지 방문, TTL 7일)
3. **MDL Upcoming 자동 수집** — `mydramalist.com/search?adv=titles&ty=68&co=3&st=2&so=date` URL 발견 후 적용. 미방영 신작 30개 자동 매핑.

이게 가장 뿌듯한 설계 중 하나예요. 사용자가 별도 작업 안 해도, 새 작품이 방영 1주일 전부터 MDL에 등록되면 자동으로 한국 원제가 사전에 들어옵니다.

### Groq 번역 함정 — 한자·일본어 가나

영어 댓글을 한국어로 번역할 때 LLM은 가끔 **한자 섞인 한국어**를 토해냅니다.
- `第二季` 대신 `두 번째 시즌`
- `字幕` 대신 `자막`
- `演技` 대신 `연기`

시스템 프롬프트에 명시했는데도 5% 정도 한자가 새어 나옴. 그래서:
1. 번역 결과에서 한자(`/[一-鿿]/`) 또는 일본어 가나 검출
2. 검출 시 **재번역 1회 자동 시도** (다른 프롬프트로)
3. 그래도 한자면 영문 원문 그대로 표시 (잘못된 한자 번역보다 영문이 낫다)

**배운 점**: LLM 출력은 절대 신뢰하면 안 된다. 결과 검증 + fallback이 항상 필요.

### 평가 분열 자동 탐지

MDL 드라마별 평점 분포를 보다가 발견한 패턴:
- 평균 평점 8.5인데 분포가 **9-10이 60%, 5 이하가 25%**
- → "호불호 갈리는 작품"

`stdev`만으로는 부족. 평점 분포의 **양극화 지수**(bimodality) 계산해서 `⚡ 평가 분열` 배지 자동 표시. 마케팅팀이 "이 작품 좀 디테일 봐야겠다" 판단의 신호로 활용 가능.

---

## 후반 5-6주: "이메일은 왜 이렇게 까다로운가"

뉴스레터를 만들기로 했을 때 가장 만만하게 봤어요. "HTML 만들어서 Resend로 보내면 끝이지 뭐."

### 이메일 클라이언트 호환의 늪

**첫 시도** — 그냥 div + flexbox + 외부 CSS
- Gmail 웹: 깨짐
- Outlook: 더 깨짐
- Apple Mail: 그나마 됨

**원인 학습 + 재작성** — `<table>` 레이아웃 + 인라인 CSS만
- 그래도 다크모드에서 색이 반전됨
- 외부 이미지는 자동 차단
- Gmail의 **102KB 클리핑 한도** 발견

**최종 설계**:
- 800px 고정 폭 단일 컬럼 `<table>`
- 모든 CSS 인라인 (외부 `<style>` 최소화)
- Instagram 캡처 이미지를 **base64 inline data URI**로 (외부 의존성 0)
- BCC로 수신자 명단 보호

테스트 환경: Gmail 웹/모바일 · Apple Mail · 이메일 첨부 .html 모드 — 3개 모두 통과. 60KB.

### 가장 멍청한 버그 — JSON 파싱 누락

자동 발송 첫 테스트:
```
htmlSizeKb: 8
```

8KB? Preview는 33KB였는데? 사용자가 메일 받고 "데이터 없음" 신고.

원인:
```typescript
// /api/newsletter 핸들러 (작동)
const report = { ...row, data: JSON.parse(row.data) }
buildNewsletterV2({ report: report.data })

// /api/email/send 핸들러 (망가짐)
const report = getLatestReport('daily')
buildNewsletterV2({ report: report.data })  // ← report.data가 JSON 문자열!
```

같은 패턴을 두 번 쓰면서 한 곳에 `JSON.parse`를 빠뜨림. **빌더는 JSON 문자열을 받아도 throw 안 하고 빈 객체처럼 처리** → 8KB 미니멀 HTML.

**배운 점**: DRY 위반은 항상 이렇게 복수합니다. 다음에 비슷한 작업하면 **`getParsedReport(type)` 같은 helper로 통합**할 것.

### Resend API "key is invalid"의 진실

키 등록 후 SDK 호출 → `"API key is invalid"` 에러. 절망.

직접 curl로 Resend API 호출 → `201 Created`. 키 유효함!

원인: `tsx watch`는 `.ts` 파일만 watch. `.env.local` 변경은 감지 못 함. 빈 키 상태로 부팅된 모듈이 **어딘가에 stale 상태**를 들고 있었음. `kill -TERM` + 재기동으로 해결.

**배운 점**: env 변경은 항상 프로세스 재시작과 한 쌍. PM2 reload 같은 절차를 운영 문서에 명시해야 한다.

---

## 가장 자랑스러운 결정들

### 1. TTL 차등화

크롤 비용 + 데이터 신선도 + 실패 격리를 한 번에 해결.

| 소스 | 크롤 주기 | TTL | 발송 시점 보장 |
|------|----------|-----|----------------|
| Reddit | 매일 09:40 | per-report | ✓ |
| MDL · GTrends | 매일 09:40 | 1일 | ✓ |
| YouTube · IG · TikTok | 주 1회 (금) | 7일 | ✓ 월~금 |

7일 TTL이라는 단순한 결정 하나가 "매일 발송에서 일부 섹션이 빠지는 문제"를 영구히 해결.

### 2. 발송 안전장치 3단계

`POST /api/email/send` 기본 동작:
- `{}` → **본인 메일(`RESEND_REPLY_TO`)에만** 발송 (실수로 팀에 잘못된 뉴스레터 송신 방지)
- `{useTeam: true}` → 명시적 동의 표현 시에만 팀 전체
- `{dryRun: true}` → 발송 없이 echo

전형적인 stripe API의 `idempotency_key` 패턴에서 영감. **destructive하지 않은 default 동작** 원칙.

### 3. 시크릿 위생 정책

세션 도중 `pgrep -fl codex` 한 번에 Supabase service role key가 컨텍스트에 노출되는 사고. 즉시 회전했지만, **이런 사고는 한 번이면 충분**. CLAUDE.md에 다음을 화이트리스트로 추가:

```
금지 명령:
  - ps aux, ps -ef, pgrep -fl
  - env, printenv
  - lsof -i, netstat -p
  - docker ps --format

상태 확인은 파일 존재·크기로만:
  - ls -la /tmp/kkuduk-team/<session>/
  - wc -l build-output.txt
```

이후 사고 0건. 운영을 시작하고 싶다면 **위생부터 먼저 정의해야 한다는 것**을 배웠어요.

---

## 안 한 것, 못 한 것

- **단위 테스트** — Jest 안 깔았다. 크롤은 통합 테스트(실제 endpoint 호출)로 검증. 다음 프로젝트엔 처음부터.
- **클라우드 배포** — Cloudflare Workers/Pages는 Playwright 150MB · better-sqlite3 native binding 충돌로 불가. Fly.io 검토했지만 SQLite volume 셋업 + Docker image 30분+ 소요로 보류. 운영은 노트북 + PM2 + launchctl로 일단 충분.
- **수신자 관리 UI** — env 한 줄로 충분. 팀 5명 이상으로 늘면 DB + 어드민 페이지 필요. 그때까지는 안 만든다.
- **TikTok 정책 변경 대응** — `tiktokWeb.ts`로 트랙은 보존했지만 정책이 풀려야 작동. 의지로는 못 풀어요.

---

## 6주 후의 나에게

가장 큰 변화는 **"안 되는 걸 인정하는 용기"**가 생긴 거예요.

TikTok 차단을 만났을 때 일주일 더 매달리고 싶었어요. 라이브러리 더 시도하고, IP 풀 만들고, 우회 기법 더 공부하고... 그런데 그건 **사용자에게 가치를 주는 일이 아니었습니다**. 진짜 가치는 다른 4개 소스를 더 좋게 만드는 데 있었어요.

엔지니어로서 가장 강력한 스킬은 *코드를 잘 쓰는 것*이 아니라 *어디서 멈출지 정하는 것*이라는 걸 배웠어요.

다음 프로젝트도 이 감각으로 시작할 거예요.

---

## 함께 한 분들

- 끄덕팀 (개인 에이전트 팀) — Phase 1 분석·Phase 2 실행·Phase 3 문서화 분리 아키텍처가 6주를 버틸 수 있게 해줌
- ChatGPT (Resend SDK 디버깅)
- Reddit r/kdrama 모든 분 (테스트 데이터)
- MyDramaList 운영팀 (Cloudflare 우회 의도 X — 정말 죄송합니다)

**문의·피드백 환영**: [github.com/cjkdcuk/kcontent-research/issues](https://github.com/cjkdcuk/kcontent-research/issues)
