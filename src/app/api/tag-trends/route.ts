import { NextResponse } from 'next/server'

const CLICKHOUSE_HOST = process.env.CLICKHOUSE_HOST || 'clickhouse.data.charan.app'
const CLICKHOUSE_PORT = process.env.CLICKHOUSE_PORT || '8123'
const CLICKHOUSE_USER = process.env.CLICKHOUSE_USER!
const CLICKHOUSE_PASSWORD = process.env.CLICKHOUSE_PASSWORD!

export const dynamic = 'force-dynamic'
export const revalidate = 0

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

// 특정 기간의 태그별 건수 조회
async function fetchTagCounts(startDate: string, endDate: string): Promise<Record<string, number>> {
  const result = await queryClickHouse(`
    SELECT
      arrayJoin(tags) AS tag,
      count() AS cnt
    FROM rawdata_channel_talk.user_chats FINAL
    WHERE toDate(toTimeZone(created_at, 'Asia/Seoul')) >= '${startDate}'
      AND toDate(toTimeZone(created_at, 'Asia/Seoul')) <= '${endDate}'
      AND length(tags) > 0
    GROUP BY tag
    ORDER BY cnt DESC
    FORMAT JSON
  `)
  const counts: Record<string, number> = {}
  for (const row of result.data || []) {
    counts[row.tag] = Number(row.cnt)
  }
  return counts
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const week2Start = searchParams.get('week2Start')
    const week2End = searchParams.get('week2End')

    if (!week2Start || !week2End) {
      return NextResponse.json({ error: 'week2Start, week2End required' }, { status: 400 })
    }

    // 5주치 날짜 계산 (week2가 가장 최근)
    const weeks: { start: string; end: string }[] = []
    const w2s = new Date(week2Start)
    const w2e = new Date(week2End)
    for (let i = 4; i >= 0; i--) {
      const s = new Date(w2s)
      const e = new Date(w2e)
      s.setUTCDate(s.getUTCDate() - i * 7)
      e.setUTCDate(e.getUTCDate() - i * 7)
      weeks.push({
        start: s.toISOString().split('T')[0],
        end: e.toISOString().split('T')[0],
      })
    }

    // 5주치 태그 카운트 병렬 조회
    const weekCounts = await Promise.all(weeks.map(w => fetchTagCounts(w.start, w.end)))

    // week1(4번째) vs week2(5번째) 비교
    const week1Counts = weekCounts[3]
    const week2Counts = weekCounts[4]

    // 전체 태그 목록
    const allTags = new Set([...Object.keys(week1Counts), ...Object.keys(week2Counts)])

    // delta 계산 (절대값 기준, 최소 5건 이상인 태그만)
    const deltas: { tag: string; delta: number; w1: number; w2: number }[] = []
    for (const tag of allTags) {
      const w1 = week1Counts[tag] || 0
      const w2 = week2Counts[tag] || 0
      if (w1 + w2 < 5) continue  // 너무 적은 건 제외
      deltas.push({ tag, delta: w2 - w1, w1, w2 })
    }

    // 상위 5 증가 / 상위 5 감소
    deltas.sort((a, b) => b.delta - a.delta)
    const top5Increased = deltas.slice(0, 5)
    const top5Decreased = [...deltas].sort((a, b) => a.delta - b.delta).slice(0, 5)

    // 해당 태그들의 5주 트렌드
    const buildTrend = (tags: typeof top5Increased) => tags.map(({ tag, delta, w1, w2 }) => ({
      tag,
      delta,
      w1,
      w2,
      trend: weekCounts.map(wc => wc[tag] || 0),
      weekLabels: weeks.map(w => {
        const s = new Date(w.start)
        const e = new Date(w.end)
        return `${s.getUTCMonth()+1}/${s.getUTCDate()}~${e.getUTCMonth()+1}/${e.getUTCDate()}`
      })
    }))

    return NextResponse.json({
      top5Increased: buildTrend(top5Increased),
      top5Decreased: buildTrend(top5Decreased),
      weeks: weeks.map(w => {
        const s = new Date(w.start)
        const e = new Date(w.end)
        return `${s.getUTCMonth()+1}/${s.getUTCDate()}~${e.getUTCMonth()+1}/${e.getUTCDate()}`
      }),
    })
  } catch (error) {
    console.error('Tag trends error:', error)
    return NextResponse.json({ error: 'Failed to fetch tag trends' }, { status: 500 })
  }
}
