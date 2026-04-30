// 단일 서브레딧 6-sort 표본 측정 (간단 + 충분한 딜레이)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36'
const ONE_DAY = 86400
const now = Date.now() / 1000

interface Entry { id: string; published: number; title: string; flair?: string }

async function fetchRSS(url: string, label: string): Promise<Entry[]> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'application/atom+xml, application/rss+xml, */*' },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    console.log(`  [${label}] HTTP ${res.status}`)
    return []
  }
  const text = await res.text()
  if (text.length < 500) {
    console.log(`  [${label}] short response (${text.length} bytes)`)
    return []
  }
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
}

async function main() {
  const sub = 'kdramas'
  const sources = [
    { label: 'hot',                 url: `https://www.reddit.com/r/${sub}/hot.rss?limit=25` },
    { label: 'new',                 url: `https://www.reddit.com/r/${sub}/new.rss?limit=25` },
    { label: 'rising',              url: `https://www.reddit.com/r/${sub}/rising.rss?limit=25` },
    { label: 'top?t=day',           url: `https://www.reddit.com/r/${sub}/top.rss?t=day&limit=25` },
    { label: 'top?t=week',          url: `https://www.reddit.com/r/${sub}/top.rss?t=week&limit=25` },
    { label: 'controversial?t=day', url: `https://www.reddit.com/r/${sub}/controversial.rss?t=day&limit=25` },
  ]

  const cutoff24 = now - ONE_DAY
  const all24h = new Map<string, Entry>()
  const flairCounts = new Map<string, number>()
  const stats: { label: string; total: number; in24h: number; uniqueAdded: number }[] = []

  console.log(`\n===== r/${sub} 6-sort 측정 =====`)
  for (const s of sources) {
    const entries = await fetchRSS(s.url, s.label)
    const in24h = entries.filter(e => e.published >= cutoff24)
    let uniqueAdded = 0
    for (const e of in24h) {
      if (!all24h.has(e.id)) {
        all24h.set(e.id, e)
        const f = e.flair || '(no flair)'
        flairCounts.set(f, (flairCounts.get(f) ?? 0) + 1)
        uniqueAdded++
      }
    }
    stats.push({ label: s.label, total: entries.length, in24h: in24h.length, uniqueAdded })
    await new Promise(r => setTimeout(r, 3000))  // 3s delay = 안전
  }

  console.log()
  console.log('sort'.padEnd(28), 'RSS'.padEnd(6), '24h'.padEnd(6), '+unique')
  console.log('-'.repeat(60))
  for (const s of stats) {
    console.log(s.label.padEnd(28), `${s.total}`.padEnd(6), `${s.in24h}`.padEnd(6), `+${s.uniqueAdded}`)
  }
  console.log('-'.repeat(60))
  console.log(`24h unique 합계: ${all24h.size}개`)
  console.log()
  console.log('flair 분포:')
  for (const [f, n] of [...flairCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${f.padEnd(28)} ${n}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
