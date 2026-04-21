import { NextResponse } from 'next/server'

const CLICKHOUSE_HOST = process.env.CLICKHOUSE_HOST || 'clickhouse.data.charan.app'
const CLICKHOUSE_PORT = process.env.CLICKHOUSE_PORT || '8123'
const CLICKHOUSE_USER = process.env.CLICKHOUSE_USER!
const CLICKHOUSE_PASSWORD = process.env.CLICKHOUSE_PASSWORD!

export const dynamic = 'force-dynamic'
export const revalidate = 0

// 태그명에 (차란케어) / (케어)가 포함되면 케어드로 재분류
const MARKET_COND = `
  arrayExists(t -> (
    startsWith(t, '구매자/') OR startsWith(t, '판매자/') OR startsWith(t, '공통/') OR
    position(t, 'P2P') > 0 OR position(t, '마켓') > 0
  ), tags)
  AND NOT arrayExists(t -> position(t, '(차란케어)') > 0 OR position(t, '(케어)') > 0, tags)
`

async function queryClickHouse(sql: string) {
  const auth = Buffer.from(`${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}`).toString('base64')
  const res = await fetch(`http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'text/plain' },
    body: sql,
  })
  if (!res.ok) throw new Error(`ClickHouse error: ${await res.text()}`)
  return res.json()
}

// 특정 기간+제품의 태그 건수 조회
async function fetchTagCounts(startDate: string, endDate: string, product: 'market' | 'cared'): Promise<Record<string, number>> {
  const filter = product === 'market' ? `AND (${MARKET_COND})` : `AND NOT (${MARKET_COND})`
  const result = await queryClickHouse(`
    SELECT arrayJoin(tags) AS tag, count() AS cnt
    FROM rawdata_channel_talk.user_chats FINAL
    WHERE toDate(toTimeZone(created_at, 'Asia/Seoul')) >= '${startDate}'
      AND toDate(toTimeZone(created_at, 'Asia/Seoul')) <= '${endDate}'
      AND length(tags) > 0
      ${filter}
    GROUP BY tag
    ORDER BY cnt DESC
    LIMIT 30
    FORMAT JSON
  `)
  const counts: Record<string, number> = {}
  for (const row of result.data || []) counts[row.tag] = Number(row.cnt)
  return counts
}

// 특정 태그 목록의 건수만 조회 (트렌드용)
async function fetchTagCountsForTags(startDate: string, endDate: string, product: 'market' | 'cared', tags: string[]): Promise<Record<string, number>> {
  const filter = product === 'market' ? `AND (${MARKET_COND})` : `AND NOT (${MARKET_COND})`
  const tagList = tags.map(t => `'${t.replace(/'/g, "\\'")}'`).join(',')
  const result = await queryClickHouse(`
    SELECT arrayJoin(tags) AS tag, count() AS cnt
    FROM rawdata_channel_talk.user_chats FINAL
    WHERE toDate(toTimeZone(created_at, 'Asia/Seoul')) >= '${startDate}'
      AND toDate(toTimeZone(created_at, 'Asia/Seoul')) <= '${endDate}'
      AND length(tags) > 0
      AND arrayExists(t -> t IN (${tagList}), tags)
      ${filter}
    GROUP BY tag
    FORMAT JSON
  `)
  const counts: Record<string, number> = {}
  for (const row of result.data || []) counts[row.tag] = Number(row.cnt)
  return counts
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const week2Start = searchParams.get('week2Start')  // 가장 최근 주 시작
    const week2End = searchParams.get('week2End')      // 가장 최근 주 종료

    if (!week2Start || !week2End) {
      return NextResponse.json({ error: 'week2Start, week2End required' }, { status: 400 })
    }

    // 4주치 날짜 범위 계산 (week2가 가장 최근)
    const weeks: { start: string; end: string; label: string }[] = []
    const w2s = new Date(week2Start)
    const w2e = new Date(week2End)
    for (let i = 3; i >= 0; i--) {
      const s = new Date(w2s); s.setUTCDate(s.getUTCDate() - i * 7)
      const e = new Date(w2e); e.setUTCDate(e.getUTCDate() - i * 7)
      weeks.push({
        start: s.toISOString().split('T')[0],
        end: e.toISOString().split('T')[0],
        label: `${s.getUTCMonth()+1}/${s.getUTCDate()}~${e.getUTCMonth()+1}/${e.getUTCDate()}`,
      })
    }

    // 최근 주(week2) 기준 상위 10개 태그 조회
    const [marketLatest, caredLatest] = await Promise.all([
      fetchTagCounts(week2Start, week2End, 'market'),
      fetchTagCounts(week2Start, week2End, 'cared'),
    ])

    const top10Market = Object.entries(marketLatest).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tag]) => tag)
    const top10Cared = Object.entries(caredLatest).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tag]) => tag)

    // 4주치 트렌드 조회 (상위 10개 태그만)
    const [marketTrends, caredTrends] = await Promise.all([
      Promise.all(weeks.map(w => fetchTagCountsForTags(w.start, w.end, 'market', top10Market))),
      Promise.all(weeks.map(w => fetchTagCountsForTags(w.start, w.end, 'cared', top10Cared))),
    ])

    const buildResult = (tags: string[], trends: Record<string, number>[], latest: Record<string, number>) =>
      tags.map(tag => ({
        tag,
        total: latest[tag] || 0,
        trend: trends.map(wc => wc[tag] || 0),
      }))

    return NextResponse.json({
      weeks: weeks.map(w => w.label),
      market: buildResult(top10Market, marketTrends, marketLatest),
      cared: buildResult(top10Cared, caredTrends, caredLatest),
    })
  } catch (error) {
    console.error('Top tags error:', error)
    return NextResponse.json({ error: 'Failed to fetch top tags' }, { status: 500 })
  }
}
