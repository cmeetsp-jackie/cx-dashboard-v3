import { NextResponse } from 'next/server'

const CHANNELTALK_API = 'https://api.channel.io/open/v5'
const ACCESS_KEY = process.env.CHANNELTALK_ACCESS_KEY!
const ACCESS_SECRET = process.env.CHANNELTALK_ACCESS_SECRET!

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

  // Channel Talk API 페이지네이션이 제대로 작동하지 않음
  // 각 state별로 첫 페이지(100개)만 가져오고 날짜 필터링
  for (const state of states) {
    const { chats } = await fetchChats(state)
    
    for (const chat of chats) {
      if (seenIds.has(chat.id)) continue
      const created = chat.createdAt || 0
      
      if (created >= sinceMs && created <= untilMs) {
        allChats.push(chat)
        seenIds.add(chat.id)
      }
    }
  }
  return allChats
}

const MANAGERS: Record<string, string> = {
  '435419': 'Joy',
  '524187': 'Sara',
  '570790': 'Sia',
}

function calculateStats(chats: Chat[]) {
  const stats = {
    total: chats.length,
    byState: { opened: 0, closed: 0 },
    byProduct: { market: 0, cared: 0 },
    byManager: {} as Record<string, number>,
    byHour: {} as Record<number, number>,
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

    let currentStart: number, currentEnd: number
    let prevStart: number, prevEnd: number

    if (period === 'weekly' && weekStart && weekEnd) {
      [currentStart, currentEnd] = getWeekRange(weekStart, weekEnd)
      ;[prevStart, prevEnd] = getPrevWeekRange(weekStart, weekEnd)
    } else {
      [currentStart, currentEnd] = getTodayRange()
      ;[prevStart, prevEnd] = getYesterdayRange()
    }

    const [todayChats, yesterdayChats] = await Promise.all([
      fetchAllChats(currentStart, currentEnd),
      fetchAllChats(prevStart, prevEnd),
    ])

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
