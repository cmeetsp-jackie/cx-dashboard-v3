import { NextResponse } from 'next/server'

const CHANNELTALK_API = 'https://api.channel.io/open/v5'
const ACCESS_KEY = process.env.CHANNELTALK_ACCESS_KEY!
const ACCESS_SECRET = process.env.CHANNELTALK_ACCESS_SECRET!

// ClickHouse 연결 정보
const CLICKHOUSE_HOST = process.env.CLICKHOUSE_HOST || 'clickhouse.data.charan.app'
const CLICKHOUSE_PORT = process.env.CLICKHOUSE_PORT || '8123'
const CLICKHOUSE_USER = process.env.CLICKHOUSE_USER!
const CLICKHOUSE_PASSWORD = process.env.CLICKHOUSE_PASSWORD!

// 마켓 태그 (구매자/, 판매자/, 공통/, P2P 등)
const MARKET_PREFIXES = ['구매자/', '판매자/', '공통/', 'P2P', '마켓']

interface Chat {
  id: string
  state: string
  tags: string[]
  assigneeId?: string
  createdAt: number
  avgReplyTime?: number
  firstRepliedAt?: number
  firstOpenedAt?: number
  source?: { workflow?: any }
}

function classifyProduct(chat: Chat): 'market' | 'cared' {
  const tags = chat.tags || []
  for (const tag of tags) {
    for (const prefix of MARKET_PREFIXES) {
      if (tag.startsWith(prefix) || tag.includes(prefix)) {
        return 'market'
      }
    }
  }
  return 'cared'
}

function getTodayRange(): [number, number] {
  // KST (UTC+9) 기준으로 계산
  const now = new Date()
  const kstOffset = 9 * 60 * 60 * 1000  // 9시간
  const kstNow = new Date(now.getTime() + kstOffset)
  
  // KST 기준 오늘 00:00:00
  const kstMidnight = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate(), 0, 0, 0))
  const start = kstMidnight.getTime() - kstOffset  // UTC로 변환
  
  return [start, now.getTime()]
}

function getYesterdayRange(): [number, number] {
  // KST (UTC+9) 기준으로 계산
  const now = new Date()
  const kstOffset = 9 * 60 * 60 * 1000  // 9시간
  const kstNow = new Date(now.getTime() + kstOffset)
  
  // KST 기준 어제
  const kstYesterday = new Date(kstNow.getTime() - 24 * 60 * 60 * 1000)
  
  // KST 기준 어제 00:00:00과 23:59:59
  const start = Date.UTC(kstYesterday.getUTCFullYear(), kstYesterday.getUTCMonth(), kstYesterday.getUTCDate(), 0, 0, 0) - kstOffset
  const end = Date.UTC(kstYesterday.getUTCFullYear(), kstYesterday.getUTCMonth(), kstYesterday.getUTCDate(), 23, 59, 59, 999) - kstOffset
  
  return [start, end]
}

async function fetchChats(state: string, nextCursor?: string): Promise<{ chats: Chat[]; next?: string }> {
  const url = new URL(`${CHANNELTALK_API}/user-chats`)
  url.searchParams.set('limit', '500')  // 더 많은 데이터 가져오기
  url.searchParams.set('state', state)
  url.searchParams.set('sortOrder', 'desc')
  if (nextCursor) url.searchParams.set('next', nextCursor)
  
  const response = await fetch(url.toString(), {
    headers: {
      'X-Access-Key': ACCESS_KEY,
      'X-Access-Secret': ACCESS_SECRET,
      'Content-Type': 'application/json',
    },
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
  const data = await response.json()
  return { chats: data.userChats || [], next: data.next }
}

async function fetchAllChats(sinceMs: number, untilMs: number): Promise<Chat[]> {
  const states = ['opened', 'closed', 'snoozed']
  const allChats: Chat[] = []
  const seenIds = new Set<string>()

  // 페이지네이션으로 모든 데이터 가져오기
  for (const state of states) {
    let nextCursor: string | undefined = undefined
    let pageCount = 0
    const maxPages = 50 // 안전장치: 최대 50페이지 (25,000건)
    
    while (pageCount < maxPages) {
      const { chats, next } = await fetchChats(state, nextCursor)
      pageCount++
      
      if (chats.length === 0) break
      
      let hasOlderData = false
      for (const chat of chats) {
        if (seenIds.has(chat.id)) continue
        const created = chat.createdAt || 0
        
        // 날짜 범위 체크
        if (created >= sinceMs && created <= untilMs) {
          allChats.push(chat)
          seenIds.add(chat.id)
        }
        
        // 날짜 범위보다 이전 데이터가 나오면 더 이상 가져올 필요 없음
        if (created < sinceMs) {
          hasOlderData = true
        }
      }
      
      // 날짜 범위보다 오래된 데이터가 나왔거나, 다음 페이지가 없으면 중단
      if (hasOlderData || !next) break
      
      nextCursor = next
    }
  }
  return allChats
}

const MANAGERS: Record<string, string> = {
  '435419': 'Joy',
  '524187': 'Sara',
  '570790': 'Sia',
}

// ClickHouse에서 데이터 조회 (주간 데이터용)
async function fetchChatsFromClickHouse(startDate: string, endDate: string): Promise<Chat[]> {
  const query = `
    SELECT 
      id,
      state,
      tags,
      assignee_id as assigneeId,
      toUnixTimestamp64Milli(created_at) as createdAt,
      avg_reply_time as avgReplyTime,
      toUnixTimestamp64Milli(first_replied_at) as firstRepliedAt,
      toUnixTimestamp64Milli(first_opened_at) as firstOpenedAt
    FROM rawdata_channel_talk.user_chats 
    WHERE created_at >= '${startDate} 00:00:00' 
      AND created_at < '${endDate} 23:59:59'
    FORMAT JSON
  `
  
  const auth = Buffer.from(`${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}`).toString('base64')
  
  const response = await fetch(`http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'text/plain',
    },
    body: query,
  })
  
  if (!response.ok) {
    console.error('ClickHouse error:', await response.text())
    return []
  }
  
  const result = await response.json()
  
  // tags 파싱 (ClickHouse에서 Array(String)으로 저장됨)
  return (result.data || []).map((row: any) => ({
    ...row,
    tags: Array.isArray(row.tags) ? row.tags : (row.tags ? JSON.parse(row.tags) : []),
    createdAt: Number(row.createdAt),
    avgReplyTime: row.avgReplyTime ? Number(row.avgReplyTime) : undefined,
    firstRepliedAt: row.firstRepliedAt ? Number(row.firstRepliedAt) : undefined,
    firstOpenedAt: row.firstOpenedAt ? Number(row.firstOpenedAt) : undefined,
  }))
}

function calculateStats(chats: Chat[]) {
  const stats = {
    total: chats.length,
    byState: { opened: 0, closed: 0 },
    byProduct: { market: 0, cared: 0 },
    byManager: {} as Record<string, number>,
    byHour: {} as Record<number, number>,
    byDate: {} as Record<string, number>,  // 일별 문의량 (주간용)
    byTag: {} as Record<string, number>,
    avgResponseTimeMin: 0,
    avgFirstResponseTimeMin: 0,
    aiCount: 0,
    aiRate: 0,
    responseRate: 0,      // 응답률: 응답한 건수 / 전체
    resolutionRate: 0,    // 해결률: 종결된 건수 / 전체
    respondedCount: 0,    // 응답한 건수
  }

  let totalResponseTime = 0
  let responseCount = 0
  let totalFirstResponse = 0
  let firstResponseCount = 0
  let respondedCount = 0  // 응답을 보낸 건수

  for (const chat of chats) {
    // 상태
    if (chat.state === 'opened') stats.byState.opened++
    else if (chat.state === 'closed') stats.byState.closed++

    // 제품
    const product = classifyProduct(chat)
    stats.byProduct[product]++

    // 담당자
    if (chat.assigneeId) {
      const name = MANAGERS[chat.assigneeId] || `Unknown-${chat.assigneeId}`
      stats.byManager[name] = (stats.byManager[name] || 0) + 1
    }

    // 시간대 (KST 기준)
    const chatDate = new Date(chat.createdAt)
    const kstHour = (chatDate.getUTCHours() + 9) % 24  // UTC+9
    stats.byHour[kstHour] = (stats.byHour[kstHour] || 0) + 1
    
    // 일별 (KST 기준) - 주간 차트용
    const kstDate = new Date(chat.createdAt + 9 * 60 * 60 * 1000)
    const dateKey = kstDate.toISOString().split('T')[0]  // YYYY-MM-DD
    stats.byDate[dateKey] = (stats.byDate[dateKey] || 0) + 1

    // 태그
    for (const tag of chat.tags || []) {
      stats.byTag[tag] = (stats.byTag[tag] || 0) + 1
    }

    // 응답 시간
    if (chat.avgReplyTime) {
      totalResponseTime += chat.avgReplyTime / 60000
      responseCount++
    }

    // 첫 응답 시간
    if (chat.firstRepliedAt && chat.firstOpenedAt) {
      totalFirstResponse += (chat.firstRepliedAt - chat.firstOpenedAt) / 60000
      firstResponseCount++
    }

    // 응답 여부: firstRepliedAt이 있으면 응답한 것
    if (chat.firstRepliedAt) {
      respondedCount++
    }

    // AI 처리: 종료됐는데 담당자가 없는 경우
    if (chat.state === 'closed' && !chat.assigneeId) {
      stats.aiCount++
    }
  }

  stats.avgResponseTimeMin = responseCount > 0 ? totalResponseTime / responseCount : 0
  stats.avgFirstResponseTimeMin = firstResponseCount > 0 ? totalFirstResponse / firstResponseCount : 0
  stats.aiRate = chats.length > 0 ? Math.round((stats.aiCount / chats.length) * 1000) / 10 : 0
  
  // 응답률: 응답한 건수 / 전체 건수
  stats.respondedCount = respondedCount
  stats.responseRate = chats.length > 0 ? Math.round((respondedCount / chats.length) * 1000) / 10 : 0
  
  // 해결률: 종결된 건수 / 전체 건수
  stats.resolutionRate = chats.length > 0 ? Math.round((stats.byState.closed / chats.length) * 1000) / 10 : 0

  return stats
}

function getWeekRange(weekStart: string, weekEnd: string): [number, number] {
  // weekStart, weekEnd는 'YYYY-MM-DD' 형식
  const kstOffset = 9 * 60 * 60 * 1000
  
  const [sy, sm, sd] = weekStart.split('-').map(Number)
  const [ey, em, ed] = weekEnd.split('-').map(Number)
  
  const start = Date.UTC(sy, sm - 1, sd, 0, 0, 0) - kstOffset
  const end = Date.UTC(ey, em - 1, ed, 23, 59, 59, 999) - kstOffset
  
  return [start, end]
}

function getPrevWeekRange(weekStart: string, weekEnd: string): [number, number] {
  const kstOffset = 9 * 60 * 60 * 1000
  
  const [sy, sm, sd] = weekStart.split('-').map(Number)
  const [ey, em, ed] = weekEnd.split('-').map(Number)
  
  // 7일 전
  const startDate = new Date(Date.UTC(sy, sm - 1, sd))
  startDate.setUTCDate(startDate.getUTCDate() - 7)
  
  const endDate = new Date(Date.UTC(ey, em - 1, ed))
  endDate.setUTCDate(endDate.getUTCDate() - 7)
  
  const start = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate(), 0, 0, 0) - kstOffset
  const end = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate(), 23, 59, 59, 999) - kstOffset
  
  return [start, end]
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || 'daily'
    const weekStart = searchParams.get('weekStart')
    const weekEnd = searchParams.get('weekEnd')

    let todayChats: Chat[]
    let yesterdayChats: Chat[]

    if (period === 'weekly' && weekStart && weekEnd) {
      // 주간 데이터: ClickHouse에서 직접 조회 (정확한 데이터)
      const prevWeekStart = new Date(weekStart)
      prevWeekStart.setDate(prevWeekStart.getDate() - 7)
      const prevWeekEnd = new Date(weekEnd)
      prevWeekEnd.setDate(prevWeekEnd.getDate() - 7)
      
      const formatDate = (d: Date) => d.toISOString().split('T')[0]
      
      ;[todayChats, yesterdayChats] = await Promise.all([
        fetchChatsFromClickHouse(weekStart, weekEnd),
        fetchChatsFromClickHouse(formatDate(prevWeekStart), formatDate(prevWeekEnd)),
      ])
    } else {
      // 일간 데이터: ClickHouse에서 조회 (Channel Talk API 대신)
      const now = new Date()
      const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000)
      
      const formatDateKST = (d: Date) => d.toISOString().split('T')[0]
      
      const todayDate = formatDateKST(kstNow)
      
      const yesterdayKST = new Date(kstNow)
      yesterdayKST.setDate(yesterdayKST.getDate() - 1)
      const yesterdayDate = formatDateKST(yesterdayKST)
      
      ;[todayChats, yesterdayChats] = await Promise.all([
        fetchChatsFromClickHouse(todayDate, todayDate),
        fetchChatsFromClickHouse(yesterdayDate, yesterdayDate),
      ])
    }

    const todayStats = calculateStats(todayChats)
    const yesterdayStats = calculateStats(yesterdayChats)

    // 마켓/케어드 분리
    const todayMarket = todayChats.filter(c => classifyProduct(c) === 'market')
    const todayCared = todayChats.filter(c => classifyProduct(c) === 'cared')

    // 증감율 계산
    const calcChange = (today: number, yesterday: number) => {
      if (yesterday === 0) return today > 0 ? 100 : 0
      return Math.round(((today - yesterday) / yesterday) * 1000) / 10
    }

    // 상위 태그
    const getTopTags = (chats: Chat[], limit = 10) => {
      const tagCounts: Record<string, number> = {}
      for (const chat of chats) {
        for (const tag of chat.tags || []) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1
        }
      }
      return Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([tag, count]) => ({ tag, count }))
    }

    return NextResponse.json({
      today: todayStats,
      yesterday: yesterdayStats,
      change: {
        total: calcChange(todayStats.total, yesterdayStats.total),
        market: calcChange(todayStats.byProduct.market, yesterdayStats.byProduct.market),
        cared: calcChange(todayStats.byProduct.cared, yesterdayStats.byProduct.cared),
      },
      cared: {
        stats: calculateStats(todayCared),
        topTags: getTopTags(todayCared),
      },
      market: {
        stats: calculateStats(todayMarket),
        topTags: getTopTags(todayMarket),
      },
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
  }
}
