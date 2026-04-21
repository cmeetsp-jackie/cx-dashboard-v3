import { NextResponse } from 'next/server'

const CLICKHOUSE_HOST = process.env.CLICKHOUSE_HOST || 'clickhouse.data.charan.app'
const CLICKHOUSE_PORT = process.env.CLICKHOUSE_PORT || '8123'
const CLICKHOUSE_USER = process.env.CLICKHOUSE_USER!
const CLICKHOUSE_PASSWORD = process.env.CLICKHOUSE_PASSWORD!

export const dynamic = 'force-dynamic'
export const revalidate = 0

// 마켓 태그 판별 조건 (stats/route.ts와 동일 기준)
// 단, 태그명에 (차란케어) / (케어)가 포함된 경우는 케어드 이슈이므로 마켓에서 제외
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

type ProductType = 'market' | 'cared' | 'all'

// 특정 기간 + 제품 유형별 태그 건수 조회
async function fetchTagCounts(startDate: string, endDate: string, product: ProductType): Promise<Record<string, number>> {
  const productFilter =
    product === 'market' ? `AND (${MARKET_COND})` :
    product === 'cared'  ? `AND NOT (${MARKET_COND})` :
    ''

  const result = await queryClickHouse(`
    SELECT
      arrayJoin(tags) AS tag,
      count() AS cnt
    FROM rawdata_channel_talk.user_chats FINAL
    WHERE toDate(toTimeZone(created_at, 'Asia/Seoul')) >= '${startDate}'
      AND toDate(toTimeZone(created_at, 'Asia/Seoul')) <= '${endDate}'
      AND length(tags) > 0
      ${productFilter}
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

function buildDelta(allTags: string[], w1: Record<string, number>, w2: Record<string, number>, minTotal = 3) {
  const deltas: { tag: string; delta: number; w1: number; w2: number }[] = []
  for (const tag of allTags) {
    const v1 = w1[tag] || 0
    const v2 = w2[tag] || 0
    if (v1 + v2 < minTotal) continue
    deltas.push({ tag, delta: v2 - v1, w1: v1, w2: v2 })
  }
  return deltas
}

function buildTrend(
  tags: { tag: string; delta: number; w1: number; w2: number }[],
  weekCounts: Record<string, number>[],
  weekLabels: string[]
) {
  return tags.map(({ tag, delta, w1, w2 }) => ({
    tag,
    delta,
    w1,
    w2,
    trend: weekCounts.map(wc => wc[tag] || 0),
    weekLabels,
  }))
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const week2Start = searchParams.get('week2Start')
    const week2End = searchParams.get('week2End')

    if (!week2Start || !week2End) {
      return NextResponse.json({ error: 'week2Start, week2End required' }, { status: 400 })
    }

    // 5주치 날짜 범위 계산
    const weeks: { start: string; end: string }[] = []
    const w2s = new Date(week2Start)
    const w2e = new Date(week2End)
    for (let i = 4; i >= 0; i--) {
      const s = new Date(w2s); s.setUTCDate(s.getUTCDate() - i * 7)
      const e = new Date(w2e); e.setUTCDate(e.getUTCDate() - i * 7)
      weeks.push({ start: s.toISOString().split('T')[0], end: e.toISOString().split('T')[0] })
    }

    const weekLabels = weeks.map(w => {
      const s = new Date(w.start); const e = new Date(w.end)
      return `${s.getUTCMonth()+1}/${s.getUTCDate()}~${e.getUTCMonth()+1}/${e.getUTCDate()}`
    })

    // 5주치 × 3가지 (전체/마켓/케어드) 병렬 조회
    const [allCounts, marketCounts, caredCounts] = await Promise.all([
      Promise.all(weeks.map(w => fetchTagCounts(w.start, w.end, 'all'))),
      Promise.all(weeks.map(w => fetchTagCounts(w.start, w.end, 'market'))),
      Promise.all(weeks.map(w => fetchTagCounts(w.start, w.end, 'cared'))),
    ])

    const w1All = allCounts[3]; const w2All = allCounts[4]
    const w1Market = marketCounts[3]; const w2Market = marketCounts[4]
    const w1Cared = caredCounts[3]; const w2Cared = caredCounts[4]

    const allTagsAll = Array.from(new Set([...Object.keys(w1All), ...Object.keys(w2All)]))
    const allTagsMarket = Array.from(new Set([...Object.keys(w1Market), ...Object.keys(w2Market)]))
    const allTagsCared = Array.from(new Set([...Object.keys(w1Cared), ...Object.keys(w2Cared)]))

    const sortFn = (a: { delta: number }, b: { delta: number }) => b.delta - a.delta

    // 전체
    const deltasAll = buildDelta(allTagsAll, w1All, w2All)
    deltasAll.sort(sortFn)
    const allTop5Inc = buildTrend(deltasAll.slice(0, 5), allCounts, weekLabels)
    const allTop5Dec = buildTrend([...deltasAll].sort((a, b) => a.delta - b.delta).slice(0, 5), allCounts, weekLabels)

    // 마켓
    const deltasMarket = buildDelta(allTagsMarket, w1Market, w2Market)
    deltasMarket.sort(sortFn)
    const marketTop5Inc = buildTrend(deltasMarket.slice(0, 5), marketCounts, weekLabels)
    const marketTop5Dec = buildTrend([...deltasMarket].sort((a, b) => a.delta - b.delta).slice(0, 5), marketCounts, weekLabels)

    // 케어드
    const deltasCared = buildDelta(allTagsCared, w1Cared, w2Cared)
    deltasCared.sort(sortFn)
    const caredTop5Inc = buildTrend(deltasCared.slice(0, 5), caredCounts, weekLabels)
    const caredTop5Dec = buildTrend([...deltasCared].sort((a, b) => a.delta - b.delta).slice(0, 5), caredCounts, weekLabels)

    return NextResponse.json({
      weeks: weekLabels,
      all:    { top5Increased: allTop5Inc,    top5Decreased: allTop5Dec },
      market: { top5Increased: marketTop5Inc, top5Decreased: marketTop5Dec },
      cared:  { top5Increased: caredTop5Inc,  top5Decreased: caredTop5Dec },
      // 하위호환
      top5Increased: allTop5Inc,
      top5Decreased: allTop5Dec,
    })
  } catch (error) {
    console.error('Tag trends error:', error)
    return NextResponse.json({ error: 'Failed to fetch tag trends' }, { status: 500 })
  }
}
