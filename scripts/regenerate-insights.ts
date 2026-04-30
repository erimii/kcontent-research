import { initDb, getReportById } from '../src/db.js'
import { generateKoreanInsights } from '../src/pipeline/insight.js'
import Database from 'better-sqlite3'
import path from 'node:path'

initDb()
const db = new Database(path.resolve('data/k-content.db'))

const row = db.prepare(`SELECT id, data FROM reports ORDER BY generated_at DESC LIMIT 1`).get() as { id: string; data: string } | undefined
if (!row) {
  console.error('리포트가 없습니다')
  process.exit(1)
}

const data = JSON.parse(row.data)
console.log(`리포트 ${row.id} 인사이트 재생성 중...`)
console.log(`  기존 koreanInsights ${data.koreanInsights?.length || 0}개`)

const newInsights = generateKoreanInsights({
  content: data.trends.content,
  sentiment: data.trends.sentiment,
  behavior: data.trends.behavior,
  subredditInsights: data.subredditInsights || [],
  deepAnalysis: data.deepAnalysis || [],
})

data.koreanInsights = newInsights

db.prepare(`UPDATE reports SET data = @data WHERE id = @id`).run({
  id: row.id,
  data: JSON.stringify(data),
})

console.log(`  새 koreanInsights ${newInsights.length}개 저장 완료`)
console.log()
newInsights.forEach((ins, i) => {
  console.log(`[${i + 1}] ${ins.category}`)
  console.log(`    ${ins.text}`)
  console.log()
})
