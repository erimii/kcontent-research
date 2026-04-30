# 프로젝트 지침 — K-Content Intelligence Dashboard

> **이 파일은 ~/.Codex/AGENTS.md(전역)의 끄덕팀 표준을 부분적으로 override합니다.**
> 프로젝트 작업 시 이 파일이 전역 지침보다 우선합니다.

---

## ⛔ 명시적 금지 사항 (Cloudflare 비활성화)

본 프로젝트는 **로컬에서만 작동하는 서버 애플리케이션**입니다. 다음 작업은 **절대 수행하지 마십시오**:

### Cloudflare 인프라 셋업 금지
- ❌ **Cloudflare Pages 프로젝트 생성** (`wrangler pages project create`, cf-api `pages/projects` POST)
- ❌ **Cloudflare Workers 배포** (`wrangler deploy`)
- ❌ **D1 데이터베이스 생성** (이 프로젝트는 로컬 SQLite `data/k-content.db` 사용)
- ❌ **R2 버킷 생성** (이 프로젝트는 정적 자산 호스팅 불요)
- ❌ **KV / Hyperdrive** 네임스페이스 생성
- ❌ **Cloudflare Access Application** 생성

### 도메인·서브도메인 금지
- ❌ **`kduck.net` 서브도메인 추가** (`<project>.kduck.net`, `dev.<project>.kduck.net`, `admin.<project>.kduck.net` 모두 해당 없음)
- ❌ **DNS 레코드 추가** — 본 프로젝트는 도메인 노출 안 함
- ❌ **Pages custom domain** 셋업 금지

### 끄덕팀 표준 자동 셋업 금지
- ❌ Phase 1 분석에서 "Cloudflare 인프라 미준비" 같은 verdict로 blocker 판정 금지
- ❌ "GitHub repo ↔ Cloudflare Pages OAuth 연결" 검토 금지
- ❌ `~/Desktop/secret/001/.env.local`의 `CLOUDFLARE_API_TOKEN` 사용 금지 (이 프로젝트 한정)

---

## ✅ 허용 사항

### 로컬 실행
- ✅ `npm run dev` (개발 watch 모드)
- ✅ `npm start` (프로덕션 모드, 단 로컬 머신에서)
- ✅ PM2 단일 프로세스 (`ecosystem.config.cjs`)
- ✅ 포트 `3366`에서 `http://localhost:3366` 노출

### 데이터·캐시
- ✅ 로컬 SQLite (`data/k-content.db`) — better-sqlite3 12.x
- ✅ Playwright 헤드리스 (Cloudflare 우회 목적, **로컬에서만**)
- ✅ youtubei.js Innertube 호출

### 배포 (필요시)
다음 옵션으로만 진행 (사용자 명시 동의 필요):
- ✅ Fly.io (Docker, 영구 volume)
- ✅ Render.com (Node.js 빌드팩 + persistent disk)
- ✅ Railway
- ✅ 자체 VPS (DigitalOcean / Hetzner / 기타)

### GitHub
- ✅ source code backup 목적 push 허용
- ✅ erimii 개인 계정 또는 cjkdcuk 조직 레포
- ✅ git credential helper 기반 인증
- ❌ GitHub Actions에서 Cloudflare Pages auto-build webhook 연결은 **금지**

---

## 이 프로젝트의 본질

| 항목 | 값 |
|------|-----|
| 종류 | **서버 애플리케이션** (Express + 영구 SQLite + Playwright + youtubei.js) |
| 배포 모델 | **로컬 호스팅** (또는 Node.js 지원 PaaS) |
| Cloudflare 적합성 | **불가** — Pages/Workers의 정적 + edge function 모델과 정반대 |

### 왜 Cloudflare가 안 되는가
- Playwright 헤드리스 chromium 바이너리 ~150MB → Workers 1MB script 한도 초과
- better-sqlite3 네이티브 C++ 바인딩 → V8 isolate에서 미작동
- 영구 SQLite cache → Workers stateless 모델과 충돌
- 17초+ Playwright 크롤 → Workers CPU time 30초 제한 근접
- Express 미들웨어 패턴 → Pages Functions에 매핑 불가

---

## 끄덕팀 분석 시 처리 방침

이 프로젝트에 대해 끄덕팀이 활성화된 경우:

1. **Phase 1 분석 단계**: Cloudflare 셋업 verdict는 자동으로 "N/A — local-only project per AGENTS.md" 처리
2. **Phase 2 실행 단계**: Cloudflare wrapper 호출 금지. 배포 관련 작업 요청 시 Fly.io/Render/VPS 옵션으로만 답변
3. **Phase 3 문서화**: Cloudflare 인프라 섹션 생성 금지
4. **decision-log.md**: 이 override 적용 시 항상 기록 ("Cloudflare 비활성화 — 본 프로젝트 로컬 전용 정책 적용")

---

## 변경 이력

- 2026-04-30: 초기 작성. 사용자 명시 요청에 따라 Cloudflare 자동 셋업 전면 금지.
