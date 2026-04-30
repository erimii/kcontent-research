// Reddit sort 종류·flair별 RSS 표본 측정
// hot/new/rising/top/controversial × time 필터별 → dedup 합산

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36'
const ONE_DAY_SEC = 86400

interface Entry { id: string; title: string; published: number; flair?: string }

async function fetchRSS(url: string): Promise<Entry[]> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'application/atom+xml, application/rss+xml, */*' },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      console.warn(`  [HTTP ${res.status}] ${url.slice(0, 80)}`)
      return []
    }
    const text = await res.text()
    const entries: Entry[] = []
    const re = /<entry>([\s\S]*?)<\/entry>/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const e = m[1]
      const title = e.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]?.trim() || ''
      const pub = e.match(/<published>(.*?)<\/published>/)?.[1] || ''
      const idMatch = e.match(/<id>tag:reddit\.com,2008:t3_([a-z0-9]+)/)
      const flair = e.match(/<category[^>]+label="([^"]+)"/)?.[1]
      if (!title || !pub || !idMatch || /\[pinned\]|\[mod post\]/i.test(title)) continue
      entries.push({
        id: idMatch[1],
        title,
        published: new Date(pub).getTime() / 1000,
        flair,
      })
    }
    return entries
  } catch (e) {
    console.warn(`  [error] ${url.slice(0, 80)}: ${(e as Error).message}`)
    return []
  }
}

async function measureSubreddit(sub: string) {
  const now = Date.now() / 1000
  const cutoff = now - ONE_DAY_SEC

  // 다양한 sort + time filter 조합
  const sources: { name: string; url: string }[] = [
    { name: 'hot',                 url: `https://www.reddit.com/r/${sub}/hot.rss?limit=25` },
    { name: 'new',                 url: `https://www.reddit.com/r/${sub}/new.rss?limit=25` },
    { name: 'rising',              url: `https://www.reddit.com/r/${sub}/rising.rss?limit=25` },
    { name: 'top?t=day',           url: `https://www.reddit.com/r/${sub}/top.rss?t=day&limit=25` },
    { name: 'top?t=week',          url: `https://www.reddit.com/r/${sub}/top.rss?t=week&limit=25` },
    { name: 'controversial?t=day', url: `https://www.reddit.com/r/${sub}/controversial.rss?t=day&limit=25` },
  ]

  console.log()
  console.log(`========== r/${sub} ==========`)
  const allEntries = new Map<string, Entry>()
  const sourceStats: { name: string; total: number; in24h: number; uniqueAdded: number }[] = []

  for (const s of sources) {
    const entries = await fetchRSS(s.url)
    const in24h = entries.filter(e => e.published >= cutoff).length
    let uniqueAdded = 0
    for (const e of entries) {
      if (e.published < cutoff) continue
      if (!allEntries.has(e.id)) {
        allEntries.set(e.id, e)
        uniqueAdded++
      }
    }
    sourceStats.push({ name: s.name, total: entries.length, in24h, uniqueAdded })
    await new Promise(r => setTimeout(r, 1500))  // rate limit 회피
  }

  // 결과 출력
  console.log('sort'.padEnd(28), 'RSS 응답', '24h 글', '신규(dedup)')
  console.log('-'.repeat(70))
  for (const s of sourceStats) {
    console.log(s.name.padEnd(28), `${s.total}개`.padEnd(8), `${s.in24h}개`.padEnd(8), `+${s.uniqueAdded}개`)
  }
  console.log('-'.repeat(70))
  console.log(`24h 누적 unique: ${allEntries.size}개`)

  // flair별 분포
  const flairMap = new Map<string, number>()
  for (const e of allEntries.values()) {
    const f = e.flair || '(no flair)'
    flairMap.set(f, (flairMap.get(f) ?? 0) + 1)
  }
  console.log()
  console.log('flair 분포 (24h unique 기준):')
  for (const [flair, n] of [...flairMap.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${flair.padEnd(28)} ${n}개`)
  }

  return allEntries.size
}

async function main() {
  const subs = ['kdramas', 'kdrama', 'kdramarecommends', 'korean']
  let grandTotal = 0
  for (const sub of subs) {
    grandTotal += await measureSubreddit(sub)
  }
  console.log()
  console.log('='.repeat(70))
  console.log(`전체 24h unique 합계: ${grandTotal}개`)
  console.log(`(현재 hot+new 2-sort 크롤러: 54개)`)
}

main().catch(e => { console.error(e); process.exit(1) })
