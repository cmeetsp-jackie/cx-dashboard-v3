import { NextResponse } from 'next/server'

const CHANNELTALK_API = 'https://api.channel.io/open/v5'
const ACCESS_KEY = process.env.CHANNELTALK_ACCESS_KEY || '69b120460b36917dd338'
const ACCESS_SECRET = process.env.CHANNELTALK_ACCESS_SECRET || 'c26560906ad5cbbc73901ad4ba99e16b'

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
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  return [start.getTime(), now.getTime()]
}

function getYesterdayRange(): [number, number] {
  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const start = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0)
  const end = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999)
  return [start.getTime(), end.getTime()]
}

async function fetchChats(state: string, nextCursor?: string): Promise<{ chats: Chat[]; next?: string }> {
  const url = new URL(`${CHANNELTALK_API}/user-chats`)
  url.searchParams.set('limit', '100')
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
  }

  let totalResponseTime = 0
  let responseCount = 0
  let totalFirstResponse = 0
  let firstResponseCount = 0

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

    // 시간대
    const hour = new Date(chat.createdAt).getHours()
    stats.byHour[hour] = (stats.byHour[hour] || 0) + 1

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

    // AI 처리: 종료됐는데 담당자가 없는 경우
    if (chat.state === 'closed' && !chat.assigneeId) {
      stats.aiCount++
    }
  }

  stats.avgResponseTimeMin = responseCount > 0 ? totalResponseTime / responseCount : 0
  stats.avgFirstResponseTimeMin = firstResponseCount > 0 ? totalFirstResponse / firstResponseCount : 0
  stats.aiRate = chats.length > 0 ? Math.round((stats.aiCount / chats.length) * 1000) / 10 : 0

  return stats
}

export async function GET() {
  try {
    const [todayStart, todayEnd] = getTodayRange()
    const [yesterdayStart, yesterdayEnd] = getYesterdayRange()

    const [todayChats, yesterdayChats] = await Promise.all([
      fetchAllChats(todayStart, todayEnd),
      fetchAllChats(yesterdayStart, yesterdayEnd),
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
