# 15초 데모 GIF 녹화 가이드

포폴용 짧은 데모 영상을 만들기 위한 두 가지 경로 — 자동 / 수동.

---

## 옵션 A — Playwright 자동 녹화 (Recommended)

스크립트 실행 한 번으로 정해진 시퀀스를 그대로 녹화. 1080p WebM 파일 생성. 매번 동일 결과.

### 사전 준비

```bash
# 1. 서버 실행 중인지 확인
curl -s http://localhost:3306/api/health
# → {"ok":true,...}

# 2. ffmpeg 설치 (WebM → GIF 변환에 필요. 5분)
brew install ffmpeg
# 또는 GIF 품질이 더 좋은 변환기:
brew install gifski
```

### 녹화 실행

```bash
node --import tsx/esm scripts/record-demo.mjs
```

녹화 시퀀스 (자동):
1. (0-2초) 대시보드 메인 진입 — Reddit 트렌드 막대 차트 표시
2. (2-4초) 사이드바 `명작 랭킹` 클릭 → MDL TOP 50 표 표시
3. (4-7초) 명작 랭킹 행 하나 클릭 → 리뷰 분석 펼침 애니메이션
4. (7-10초) 사이드바 `도움말` 클릭 → 비전공자 가이드 표시
5. (10-13초) 사이드바 `스케줄` 클릭 → 자동 일정 카드 표시
6. (13-15초) 헤더 `🌐 뉴스레터` 버튼 클릭 → 뉴스레터 미리보기 표시

출력: `docs/screenshots/demo.webm` (~3MB, 1280×800)

### WebM → GIF 변환

**옵션 1: ffmpeg (간단)**
```bash
ffmpeg -i docs/screenshots/demo.webm \
  -vf "fps=15,scale=900:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" \
  -loop 0 docs/screenshots/demo.gif
```

**옵션 2: gifski (품질 더 좋음, 추천)**
```bash
ffmpeg -i docs/screenshots/demo.webm -vf fps=15 -f image2pipe -vcodec ppm - | gifski -o docs/screenshots/demo.gif --width 900 --fps 15 -
```

결과: `docs/screenshots/demo.gif` (~2-4MB, GitHub README · Notion 직접 임베드 가능)

---

## 옵션 B — macOS 화면 녹화 (수동)

직접 마우스 움직임 캡처. 자연스러운 느낌 ↑.

### 녹화

1. `Cmd + Shift + 5` → 녹화 영역 선택 (사이드바 + 메인 콘텐츠 영역, ~1280×720)
2. 옵션: 마우스 클릭 표시 활성화
3. 녹화 시작 → 15초 시나리오 실행 (아래 *권장 시나리오*)
4. 정지 → `~/Desktop/screen-recording-*.mov` 자동 저장

### GIF 변환

`brew install ffmpeg` 후:
```bash
ffmpeg -i ~/Desktop/screen-recording-*.mov \
  -vf "fps=12,scale=900:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" \
  -loop 0 docs/screenshots/demo.gif
```

또는 온라인 변환기 (ffmpeg 설치 싫으면): https://cloudconvert.com/mov-to-gif

### 권장 시나리오 (15초)

| 시간 | 동작 | 의도 |
|------|------|------|
| 0-2초 | 대시보드 메인 진입, Reddit 트렌드 차트 |  데이터 풍부함 강조 |
| 2-4초 | MDL Top Airing TOP 5 스크롤 → ⚡ 평가 분열 배지 노출 | 자동 인사이트 어필 |
| 4-7초 | YouTube/Instagram 작품별 화제도 + 한국 원제 + 번역 댓글 | AI·다국어 처리 어필 |
| 7-10초 | 사이드바 `도움말` 클릭 → 골드 위계 박스 표시 | UX 디테일 어필 |
| 10-13초 | 사이드바 `스케줄` 클릭 → 자동 일정 카드 | 자동화 시스템 어필 |
| 13-15초 | 헤더 우측 `🌐 뉴스레터` 클릭 → 800px 뉴스레터 표시 | 최종 결과물 어필 |

---

## 포폴 임베드

GIF 생성 후 PORTFOLIO.md 상단 GitHub 박스 아래에:

```markdown
![데모 영상](docs/screenshots/demo.gif)
```

GitHub README에서는 자동 재생. Notion에서는 임베드 후 자동 재생 토글.

---

## 트러블슈팅

| 문제 | 해결 |
|------|------|
| Playwright 녹화가 빈 화면 | 서버 가동 + 캐시 데이터 있는지 확인 (`curl /api/reports/latest/daily`) |
| GIF 파일이 10MB 초과 | `scale=600:-1` 또는 `fps=10`으로 축소 |
| GIF 색이 칙칙함 | gifski 사용 (ffmpeg native 변환보다 색 보존 좋음) |
| 자막·캡션 추가 필요 | Kap (https://getkap.co) 또는 ScreenStudio 사용 |
