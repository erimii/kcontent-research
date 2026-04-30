import type {
  ContentCluster, InsightSentence, RedditPost, RedditCategorySummary,
  ContentTrend, SentimentTrend, BehaviorTrend, SubredditInsight,
  DeepAnalysis, KoreanInsight, BehaviorType,
} from '../types/index.js'

export function generateInsights(ranked: ContentCluster[]): InsightSentence[] {
  const insights: InsightSentence[] = []
  if (!ranked.length) return insights

  const top = ranked[0]
  const topK = ranked.filter(c => c.isKContent)

  // 1위 콘텐츠
  if (top) {
    insights.push({
      category: 'dominant',
      text: `"${top.representativeTitle}" is dominating this period — highest engagement across ${top.sources.join(', ')}.`,
      evidence: [`Score: ${top.finalScore}`, `Sources: ${top.sources.join(', ')}`, `Regions: ${top.regions.join(', ') || 'Global'}`],
      score: top.finalScore,
    })
  }

  // K콘텐츠 최상위
  if (topK.length > 0) {
    const kTop = topK[0]
    const kRank = ranked.indexOf(kTop) + 1
    insights.push({
      category: 'dominant',
      text: `K-Content leads with "${kTop.representativeTitle}" at #${kRank} overall — strong global fan demand.`,
      evidence: [`Mention score: ${kTop.mentionScore}`, `Platforms: ${kTop.platforms.join(', ') || 'Multiple'}`],
      score: kTop.finalScore,
    })
  }

  // 멀티소스 버즈
  const multiSource = ranked.filter(c => c.sources.length >= 2).slice(0, 3)
  for (const ms of multiSource) {
    insights.push({
      category: 'rising',
      text: `"${ms.representativeTitle}" trending across ${ms.sources.length} sources (${ms.sources.join(', ')}) — broad cross-platform buzz.`,
      evidence: [`Source diversity: ${ms.sources.length}`],
      score: ms.finalScore,
    })
  }

  // 신규 진입
  const newcomers = ranked.filter(c => c.aliases.length === 0 && c.sources.length === 1).slice(0, 2)
  for (const nc of newcomers) {
    const rank = ranked.indexOf(nc) + 1
    if (rank <= 15) {
      insights.push({
        category: 'newcomer',
        text: `"${nc.representativeTitle}" appears as new entry at #${rank} — early signal worth watching.`,
        evidence: [`Source: ${nc.sources[0]}`, `Score: ${nc.finalScore}`],
        score: nc.finalScore,
      })
    }
  }

  // 장르 트렌드
  const genreMap = new Map<string, number>()
  for (const c of ranked.slice(0, 15)) {
    for (const g of c.genres) genreMap.set(g, (genreMap.get(g) ?? 0) + 1)
  }
  const topGenres = [...genreMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  if (topGenres.length > 0) {
    insights.push({
      category: 'genre',
      text: `Dominant genres: ${topGenres.map(([g, c]) => `${g}(${c})`).join(', ')} — align content strategy accordingly.`,
      evidence: topGenres.map(([g, c]) => `${g}: ${c} titles`),
      score: 40,
    })
  }

  // 배우 언급
  const actorMap = new Map<string, number>()
  for (const c of ranked.slice(0, 10)) {
    for (const a of c.actors) actorMap.set(a, (actorMap.get(a) ?? 0) + c.finalScore)
  }
  const topActors = [...actorMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  if (topActors.length > 0) {
    insights.push({
      category: 'actor',
      text: `Most featured actors: ${topActors.map(([n]) => n).join(', ')} — strong fan engagement signals.`,
      evidence: topActors.map(([n, s]) => `${n}: ${s}pts`),
      score: topActors[0][1],
    })
  }

  // 권역별 K콘텐츠
  const regionMap = new Map<string, number>()
  for (const c of topK) {
    for (const r of c.regions) regionMap.set(r, (regionMap.get(r) ?? 0) + c.finalScore)
  }
  const topRegions = [...regionMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  if (topRegions.length > 0) {
    insights.push({
      category: 'regional',
      text: `K-Content strongest in: ${topRegions.map(([r]) => r).join(', ')} — prioritize these markets.`,
      evidence: topRegions.map(([r, s]) => `${r}: ${s}pts`),
      score: 35,
    })
  }

  return insights.sort((a, b) => b.score - a.score).slice(0, 8)
}

export function categorizeRedditPosts(posts: RedditPost[]): RedditCategorySummary {
  const recKW = ['recommend','suggestion','similar to','looking for','what should','any good']
  const posKW = ['love','amazing','great','excellent','best','favorite','worth','masterpiece']
  const negKW = ['hate','bad','boring','disappointing','worst','skip','drop']
  const cultKW = ['korean culture','learn korean','travel','food','customs','tradition','language']
  const titlePat = /["'「」『』]([^"'「」『』]{2,40})["'「」『』]/g

  const recs = new Map<string, number>()
  const reviews = new Map<string, { count: number; pos: number; neg: number }>()
  const cultural = new Map<string, number>()

  for (const p of posts) {
    const full = (p.title + ' ' + p.comments.map(c => c.body).join(' ')).toLowerCase()
    const fullOrig = p.title + ' ' + p.comments.map(c => c.body).join(' ')

    if (recKW.some(k => full.includes(k))) {
      for (const m of fullOrig.matchAll(titlePat)) {
        recs.set(m[1].trim(), (recs.get(m[1].trim()) ?? 0) + 1)
      }
    }
    for (const m of p.title.matchAll(titlePat)) {
      const t = m[1].trim()
      const ex = reviews.get(t) ?? { count: 0, pos: 0, neg: 0 }
      reviews.set(t, {
        count: ex.count + 1,
        pos: ex.pos + posKW.filter(k => full.includes(k)).length,
        neg: ex.neg + negKW.filter(k => full.includes(k)).length,
      })
    }
    for (const kw of cultKW) {
      if (full.includes(kw)) cultural.set(kw, (cultural.get(kw) ?? 0) + 1)
    }
  }

  return {
    recommendations: [...recs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([title, count]) => ({ title, count })),
    reviews: [...reviews.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 10).map(([title, d]) => ({
      title, count: d.count,
      sentiment: (d.pos > d.neg ? 'positive' : d.neg > d.pos ? 'negative' : 'mixed') as 'positive' | 'mixed' | 'negative',
    })),
    actorMentions: [],
    culturalQuestions: [...cultural.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([topic, count]) => ({ topic, count })),
    hotPosts: [...posts].sort((a, b) => b.score - a.score).slice(0, 5),
  }
}

// ============================================================
// Stage 6: 한국어 해석 인사이트
// ============================================================

const BEHAVIOR_LABEL: Record<BehaviorType, string> = {
  recommendation: '추천 요청',
  review: '리뷰/후기',
  question: '질문',
  discussion: '의견/토론',
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`
}

// ─────────────────────────────────────────────────────────────────
// K-드라마 기반 한국어 학습 앱 관점 인사이트 생성기
// 모든 인사이트: { observation, interpretation, action } 3-section 구조
// ─────────────────────────────────────────────────────────────────
type InsightTriple = { observation: string; interpretation: string; action: string }

function makeInsight(
  category: KoreanInsight['category'],
  triple: InsightTriple,
  evidence?: string[],
): KoreanInsight {
  return {
    category,
    text: `${triple.observation}\n${triple.interpretation}\n💡 ${triple.action}`,
    observation: triple.observation,
    interpretation: triple.interpretation,
    action: triple.action,
    evidence,
  }
}

export function generateKoreanInsights(args: {
  content: ContentTrend
  sentiment: SentimentTrend
  behavior: BehaviorTrend
  subredditInsights: SubredditInsight[]
  deepAnalysis: DeepAnalysis[]
}): KoreanInsight[] {
  const { content, sentiment, behavior, deepAnalysis } = args
  const out: KoreanInsight[] = []

  // ─────────────────────────────────────────────────────────────────
  // 1. 트렌드 요약 — 작품 화제 패턴 → 학습 콘텐츠 큐레이션
  // ─────────────────────────────────────────────────────────────────
  if (content.topContents.length >= 2) {
    const top1 = content.topContents[0]
    const top2 = content.topContents[1]
    const top3 = content.topContents[2]
    const ratio = top1.count / Math.max(1, top2.count)

    if (ratio >= 1.5) {
      out.push(makeInsight('trend_summary', {
        observation: `TOP1 "${top1.title}"(${top1.count}회)이 2위 "${top2.title}"(${top2.count}회)의 ${ratio.toFixed(1)}배로 화제 단독 견인.`,
        interpretation: `학습자 절대 다수가 이 한 작품을 시청·토론 중이라는 신호. 시청 직후 어휘 휘발 전이라 학습 동기가 정점인 시점입니다.`,
        action: `"${top1.title}" 회차별 명장면 30~60초 클립 + 핵심 대사 5개 받아쓰기 + 등장 어휘 SRS 카드를 묶은 "이번 주 메인 코스"를 앱 첫 화면에 24h 내 배치. OTT 시청 기록 연동(또는 사용자 셀프 체크) 시 자동으로 해당 회차 복습 카드 푸시.`,
      }, content.topContents.slice(0, 5).map((c) => `${c.title}: ${c.count}회`)))
    } else {
      out.push(makeInsight('trend_summary', {
        observation: `TOP1 "${top1.title}"(${top1.count}회) vs TOP2 "${top2.title}"(${top2.count}회) 격차 ${ratio.toFixed(1)}배의 다극 분산.`,
        interpretation: `학습자가 한 작품에 몰입하기보다 여러 작품을 병행 시청하며 비교하는 단계입니다.`,
        action: `"${top1.title}·${top2.title}${top3 ? `·${top3.title}` : ''}" 횡단 학습 팩을 출시 — 작품마다 같은 상황(첫 만남·고백·이별)에서 쓰이는 표현을 비교 카드로 묶고, 한 학습 세션 안에서 3작품 동일 의미 대사를 동시 노출해 어휘 변형 패턴(존댓말 vs 반말, 직접/간접 표현)을 자연 학습.`,
      }, content.topContents.slice(0, 5).map((c) => `${c.title}: ${c.count}회`)))
    }
  } else if (content.topKeywords.length > 0 && content.topContents.length === 0) {
    const top3Kws = content.topKeywords.slice(0, 3).map((k) => `"${k.keyword}"(${k.count})`).join(', ')
    out.push(makeInsight('trend_summary', {
      observation: `구체적 작품 언급 0회, 키워드(${top3Kws}) 중심 대화만 관측.`,
      interpretation: `학습자가 특정 작품 시청보다 K-드라마 메타 어휘에 관심이 결집한 화제 공백기.`,
      action: `작품 단위 코스는 후순위로 미루고 "K-드라마에서 자주 등장하는 핵심 어휘 30선" 같은 메타 어휘 사전 모듈을 우선 배포. 각 어휘는 실제 드라마 장면 클립 3개와 묶어 컨텍스트 예시로 제공해 화제 공백기 사용자 retention 유지.`,
    }, content.topKeywords.slice(0, 5).map((k) => `${k.keyword}: ${k.count}회`)))
  }

  // ─────────────────────────────────────────────────────────────────
  // 2. 팬 반응 특징 — 행동 분포 → 학습 모드 우선순위
  // ─────────────────────────────────────────────────────────────────
  const posR = sentiment.positiveRatio
  const negR = sentiment.negativeRatio
  const neuR = sentiment.neutralRatio
  const sentRatio = posR / Math.max(0.01, negR)
  const behSorted = (Object.entries(behavior.ratios) as [BehaviorType, number][])
    .sort((a, b) => b[1] - a[1])
  const behTop = behSorted[0]
  const behSecond = behSorted[1]
  const behGap = behTop && behSecond ? behTop[1] / Math.max(0.01, behSecond[1]) : 1

  let fanTriple: InsightTriple
  if (behTop[0] === 'discussion' && behGap >= 1.3) {
    fanTriple = {
      observation: `의견/토론 ${pct(behTop[1])}가 ${BEHAVIOR_LABEL[behSecond[0]]}(${pct(behSecond[1])})의 ${behGap.toFixed(1)}배로 우세.`,
      interpretation: `학습자가 단순 시청을 넘어 대사·장면·캐릭터 행동의 의미를 해석하는 단계로 진입했습니다.`,
      action: `단어장형 학습 대신 "명장면 대사 다중 해석" 모드를 핵심으로 전환 — 한 대사를 ① 직역 ② 의역 ③ 한국 문화 맥락(존댓말 위계·관계 거리감·반어법) 3단으로 보여주고, 사용자가 숨은 뉘앙스를 추측·코멘트 남기는 인터랙티브 카드 + 다른 학습자 코멘트 비교 UX로 토론형 학습 제공.`,
    }
  } else if (behTop[0] === 'recommendation' && behGap >= 1.3) {
    fanTriple = {
      observation: `추천 요청 ${pct(behTop[1])}가 ${BEHAVIOR_LABEL[behSecond[0]]}(${pct(behSecond[1])})의 ${behGap.toFixed(1)}배.`,
      interpretation: `K-드라마 신규 진입자가 대거 유입되는 단계로, 한국어 학습 진입 장벽이 가장 낮은 시점입니다.`,
      action: `앱 첫 화면 entry를 "한국어 학습"이 아닌 "K-드라마 + 한국어 동시 입문"으로 톤 전환. 사용자가 좋아하는 장르 선택 → 자동 학습 코스 매핑(사극→존댓말 코스, 로맨스→감정·고백 표현, 학원물→일상 회화) UX로 작품 추천과 학습 코스를 한 흐름에 묶어 진입 전환율 끌어올릴 것.`,
    }
  } else if (behTop[0] === 'review' && behGap >= 1.3) {
    fanTriple = {
      observation: `리뷰/후기 ${pct(behTop[1])}가 ${BEHAVIOR_LABEL[behSecond[0]]}(${pct(behSecond[1])})의 ${behGap.toFixed(1)}배.`,
      interpretation: `학습자가 회차/시즌 시청 직후 단계로, 어휘·표현이 휘발되기 전 골든타임입니다.`,
      action: `OTT 연동 또는 사용자 셀프 체크로 시청 완료 감지 시 즉시 "오늘 본 회차 핵심 표현 10" 마무리 카드를 푸시 알림으로 발송. 시청 직후 24h 내 복습은 SRS 가중치를 평소 1.5배로 부여해 휘발 방지. 시청 → 학습 → 복습 사이클을 시청 행동 자체에 자동 결합.`,
    }
  } else if (behTop[0] === 'question' && behGap >= 1.3) {
    fanTriple = {
      observation: `질문 ${pct(behTop[1])}가 ${BEHAVIOR_LABEL[behSecond[0]]}(${pct(behSecond[1])})의 ${behGap.toFixed(1)}배.`,
      interpretation: `학습자가 "어디서 보는지·자막 유무·시즌 순서" 같은 진입 장벽에 막혀 학습 진입 자체가 차단된 상태.`,
      action: `앱 첫 화면에 "드라마 → OTT 매핑 위젯"을 노출해 정보 탐색 욕구를 학습 entry로 전환. 자막 모드를 ① 한국어 ② 한영 병기 ③ 학습 모드(빈칸 + 어휘 카드 hover) 3단으로 분리해 학습 단계별 자막 난이도 자동 조정. 정보 검색 → 시청 → 학습이 한 화면에서 끊김 없이 연결.`,
    }
  } else if (sentRatio >= 5) {
    fanTriple = {
      observation: `긍정 ${pct(posR)} vs 부정 ${pct(negR)}로 ${sentRatio.toFixed(1)}배 격차 — K-평균 1.5~3배 대비 비정상 쏠림.`,
      interpretation: `학습자가 부정 감상보다 명장면·감동 포인트에 강하게 반응하는 감정 몰입 단계입니다.`,
      action: `"감동·로맨스·감정" 어휘 팩 비중 즉시 확대 — 키스 신·고백 신·재회 신 같은 호응 정점 장면을 30초 클립으로 묶고, 그 안의 감정 표현(좋아해 / 사랑해 / 보고 싶어)을 SRS 카드로 학습. 학습 동기가 감정 몰입에서 나오는 시점이므로 문법보다 표현 우선 노출.`,
    }
  } else if (sentRatio < 1.5 && negR >= 0.15) {
    fanTriple = {
      observation: `긍정/부정 ${sentRatio.toFixed(1)}배(부정 ${pct(negR)})로 호불호 분열.`,
      interpretation: `학습자가 캐릭터 행동·전개에 의문을 제기하는 단계로, 한국 문화 vs 글로벌 시청자 기대 차이가 학습 욕구로 전환되는 황금 시점.`,
      action: `"왜 한국 드라마에서 캐릭터가 이렇게 행동하는가" 문화 컨텍스트 모듈 출시 — 존댓말 위계·관계 거리감·정서 표현(눈치·체면·정) 같은 한국 사회 개념을 짧은 영상 + 드라마 장면 매칭으로 학습 콘텐츠화해 콘텐츠 분쟁 자체를 학습 후크로 변환.`,
    }
  } else if (neuR >= 0.5) {
    fanTriple = {
      observation: `중립 ${pct(neuR)}이 긍정·부정을 모두 상회.`,
      interpretation: `학습자가 작품 정보 탐색 단계로, 어떤 작품이 자기 한국어 수준에 맞는지 판단 못 하는 상태.`,
      action: `"K-드라마 한국어 난이도 분류기" 출시 — 사극·법정·의학(어휘 난이도 高)→ 중상급, 학원물·로맨스 → 중급, 일상극 → 입문 식으로 작품마다 학습 난이도 라벨 부착. 사용자 한국어 수준 진단 후 맞춤 작품 + 코스 자동 추천으로 정보 탐색을 학습 진입으로 전환.`,
    }
  } else {
    fanTriple = {
      observation: `긍정/부정 ${sentRatio.toFixed(1)}배 + 행동 1·2위 격차 ${behGap.toFixed(1)}배로 평탄한 차별 신호 부재.`,
      interpretation: `학습자가 강한 화제 자극 없이 일상 학습을 이어가는 단계로, 새 화제 진입 전 공백기.`,
      action: `신규 코스 출시는 다음 화제 사이클로 미루고, 이번 주는 retention 자산 정비(연속 학습 streak 보상·복습 알림 빈도 최적화·어휘 게이미피케이션 신규 모드)에 자원 투입해 다음 화제 사이클 진입 시 즉시 가속할 학습 인프라 마련.`,
    }
  }

  out.push(makeInsight('fan_reaction', fanTriple, [
    `긍정 ${sentiment.positive}건 / 부정 ${sentiment.negative}건 / 중립 ${sentiment.neutral}건`,
    `행동: ${behSorted.map(([k, v]) => `${BEHAVIOR_LABEL[k]} ${pct(v)}`).join(' · ')}`,
  ]))

  // ─────────────────────────────────────────────────────────────────
  // 3. 콘텐츠 소비 패턴 — 댓글 토론 / 감정 outlier → 학습 형태
  // ─────────────────────────────────────────────────────────────────
  if (deepAnalysis.length >= 2) {
    const comments = deepAnalysis.map((d) => d.commentCount)
    const avgComments = comments.reduce((s, c) => s + c, 0) / comments.length
    const maxComments = Math.max(...comments)
    const commentSpread = maxComments / Math.max(1, avgComments)

    const posRates = deepAnalysis.map((d) => d.sentiment.positiveRatio)
    const avgPos = posRates.reduce((s, p) => s + p, 0) / posRates.length
    const posMax = Math.max(...posRates)
    const posMin = Math.min(...posRates)
    const posSpreadPp = Math.round((posMax - posMin) * 100)

    const outlierNeg = deepAnalysis.find((d) => avgPos - d.sentiment.positiveRatio >= 0.2)

    let consumTriple: InsightTriple
    if (commentSpread >= 2 && deepAnalysis[0].title) {
      consumTriple = {
        observation: `TOP 포스트 "${deepAnalysis[0].title.slice(0, 40)}" 댓글 ${maxComments}개가 평균 ${avgComments.toFixed(0)}개의 ${commentSpread.toFixed(1)}배.`,
        interpretation: `학습자들이 단일 작품의 특정 장면·대사·인물에 집중적으로 반응하는 비대칭 집중 단계.`,
        action: `그 포스트의 댓글 쟁점(누가 무엇에 대해 가장 많이 토론했는가)을 추출해 "팬들이 가장 많이 토론한 장면 TOP 3"를 30초 클립 + 핵심 대사 받아쓰기 + 어휘 카드로 패키징한 마이크로 학습 모듈로 제공. 댓글 토론 자체를 학습 진입 후크로 사용해 "왜 이 장면이 화제인가" 호기심을 한국어 학습 동기로 전환.`,
      }
    } else if (outlierNeg && posSpreadPp >= 25) {
      consumTriple = {
        observation: `"${outlierNeg.title.slice(0, 40)}" 단독 긍정률 ${pct(outlierNeg.sentiment.positiveRatio)}로 평균(${pct(avgPos)}) 대비 ${posSpreadPp}%p 미달.`,
        interpretation: `학습자가 이 작품의 캐릭터 행동·전개에 강한 의문을 제기하는 단계 — 문화 차이가 학습 욕구로 전환되는 시점.`,
        action: `이 작품의 주요 부정 댓글 쟁점을 한국 문화 학습 콘텐츠로 직접 전환 — "왜 한국 드라마는 이 상황에서 X처럼 행동하는가"를 존댓말 위계·관계 거리감·체면 문화 같은 학습 모듈로 만들고, 해당 작품 시청 중 등장 시점에 푸시 알림으로 즉시 노출해 분쟁이 일어난 그 장면을 학습 콘텐츠로 변환.`,
      }
    } else if (posSpreadPp >= 30) {
      consumTriple = {
        observation: `TOP${deepAnalysis.length}개 포스트 긍정률 ${pct(posMin)}~${pct(posMax)}로 ${posSpreadPp}%p 폭 산포.`,
        interpretation: `학습자가 작품마다 호응 패턴이 명확히 갈리는 상태 — 개인화 추천이 retention에 직결되는 시점.`,
        action: `작품 추천 알고리즘에 사용자별 반응 프로필 도입 — 사용자가 좋아한 작품의 긍정률·장르·감정 키워드 패턴을 학습 후 "당신이 좋아할 다음 K-드라마 + 그에 맞는 어휘 코스"를 자동 추천. 시청 → 학습 → 다음 시청 사이클이 사용자별로 개인화된 retention loop으로 작동.`,
      }
    } else {
      consumTriple = {
        observation: `TOP${deepAnalysis.length}개 포스트 긍정률 ${pct(posMin)}~${pct(posMax)}(${posSpreadPp}%p)로 작품 간 호응 패턴 유사.`,
        interpretation: `학습자가 K-드라마 전반에 비슷한 강도로 호응 — 작품별 차별화보다 장르 단위 묶음이 효율적인 단계.`,
        action: `작품별 차별화 코스 대신 "장르별 한국어 어휘 팩"(로맨스 표현·사극 존댓말·일상 회화·법정 어휘) 단위로 통합. 한 학습자가 여러 작품을 횡단하며 같은 어휘를 다른 컨텍스트로 반복 노출, 어휘 정착 사이클을 작품 단위가 아닌 장르 단위로 재설계.`,
      }
    }

    out.push(makeInsight(
      'consumption_pattern',
      consumTriple,
      deepAnalysis.slice(0, 3).map((d) => `${d.title.slice(0, 40)}: 댓글 ${d.commentCount}개, 긍정률 ${pct(d.sentiment.positiveRatio)}`),
    ))
  }

  // ─────────────────────────────────────────────────────────────────
  // 4. 확장 흐름 — 작품 vs 키워드 vs 배우 → 학습 콘텐츠 카테고리
  // ─────────────────────────────────────────────────────────────────
  const contentSum = content.topContents.slice(0, 5).reduce((s, c) => s + c.count, 0)
  const keywordSum = content.topKeywords.slice(0, 8).reduce((s, k) => s + k.count, 0)
  const actorSum = content.topActors.slice(0, 5).reduce((s, a) => s + a.count, 0)

  if (contentSum > 0 || keywordSum > 0) {
    const contentVsKw = contentSum / Math.max(1, keywordSum)
    let expTriple: InsightTriple
    if (contentVsKw >= 0.8) {
      expTriple = {
        observation: `작품 언급 ${contentSum}회 vs 메타 키워드 ${keywordSum}회로 ${contentVsKw.toFixed(2)}배.`,
        interpretation: `학습자가 산업 분석이 아닌 작품 그 자체에 결집한 시점 — "실제 드라마 장면" 단위 학습이 가장 흡수율 높은 황금 구간.`,
        action: `학습 콘텐츠 제작을 "5분 클립 + 핵심 대사 10개 + 문화 노트 1개" 마이크로 코스 양산 체계로 즉시 전환. 메타 어휘 코스(K-pop 산업·한류 분석)는 후순위로 강등하고, 한 작품당 회차별 마이크로 코스 풀 라인업을 retention KPI에 직결.`,
      }
    } else {
      expTriple = {
        observation: `메타 키워드(${keywordSum}회)가 작품 언급(${contentSum}회)의 ${(1/contentVsKw).toFixed(1)}배.`,
        interpretation: `학습자가 특정 작품보다 K-드라마 장르·문화 자체에 관심이 결집한 시점.`,
        action: `단일 작품 학습 코스가 아닌 "K-드라마 메타 어휘 사전"(장르 용어·시청자 반응 표현·한국 사회 컨셉) 출시. "K-드라마에 자주 등장하는 한국 사회 개념 30선"(눈치·체면·정·우정·연공서열) 같은 컨셉 학습 코스를 entry point로 사용해 메타 관심을 학습 진입으로 전환.`,
      }
    }

    if (actorSum > 0 && actorSum >= contentSum * 0.5 && content.topActors[0]) {
      const top1Actor = content.topActors[0]
      expTriple.action += ` 또한 배우 "${top1Actor.name}"(${top1Actor.count}회) 단독 결집 — "${top1Actor.name}" 출연 모든 작품의 대사·캐릭터 표현을 집계한 "배우별 학습 코스"를 신설하고, 그 배우의 인터뷰 영상까지 실생활 한국어 학습 자료로 활용.`
    }

    out.push(makeInsight('expansion', expTriple, [
      `작품 TOP 5 합산: ${contentSum}회`,
      `키워드 TOP 8 합산: ${keywordSum}회`,
      `배우 TOP 5 합산: ${actorSum}회`,
    ]))
  }

  return out.slice(0, 4)
}
