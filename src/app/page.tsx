'use client'

import { useEffect, useState } from 'react'

interface Stats {
  total: number
  byState: { opened: number; closed: number }
  byProduct: { market: number; cared: number }
  byManager: Record<string, number>
  byHour: Record<number, number>
  byTag: Record<string, number>
  avgResponseTimeMin: number
  avgFirstResponseTimeMin: number
  aiRate: number
}

interface TopTag {
  tag: string
  count: number
}

interface DashboardData {
  today: Stats
  yesterday: Stats
  change: { total: number; market: number; cared: number }
  cared: { stats: Stats; topTags: TopTag[] }
  market: { stats: Stats; topTags: TopTag[] }
  generatedAt: string
}

function StatCard({ title, value, subValue, change }: { title: string; value: string | number; subValue?: string; change?: number }) {
  return (
    <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
      <div className="text-gray-400 text-sm mb-1">{title}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {subValue && <div className="text-gray-500 text-xs mt-1">{subValue}</div>}
      {change !== undefined && (
        <div className={`text-sm mt-1 ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {change >= 0 ? '↑' : '↓'} {Math.abs(change)}%
        </div>
      )}
    </div>
  )
}

function TagList({ tags, title }: { tags: TopTag[]; title: string }) {
  return (
    <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
      <div className="text-gray-400 text-sm mb-3">{title}</div>
      <div className="space-y-2">
        {tags.slice(0, 10).map((t, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-gray-300 truncate mr-2">{t.tag}</span>
            <span className="text-white font-medium">{t.count}</span>
          </div>
        ))}
        {tags.length === 0 && <div className="text-gray-500 text-sm">데이터 없음</div>}
      </div>
    </div>
  )
}

function ManagerStats({ managers }: { managers: Record<string, number> }) {
  const sorted = Object.entries(managers).sort((a, b) => b[1] - a[1])
  return (
    <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
      <div className="text-gray-400 text-sm mb-3">팀원별 처리 현황</div>
      <div className="space-y-2">
        {sorted.map(([name, count]) => (
          <div key={name} className="flex justify-between items-center">
            <span className="text-gray-300">{name}</span>
            <div className="flex items-center gap-2">
              <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${Math.min(100, (count / Math.max(...Object.values(managers))) * 100)}%` }}
                />
              </div>
              <span className="text-white font-medium w-8 text-right">{count}</span>
            </div>
          </div>
        ))}
        {sorted.length === 0 && <div className="text-gray-500 text-sm">데이터 없음</div>}
      </div>
    </div>
  )
}

function HourlyChart({ byHour }: { byHour: Record<number, number> }) {
  const hours = Array.from({ length: 24 }, (_, i) => i)
  const maxCount = Math.max(...Object.values(byHour), 1)
  
  return (
    <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
      <div className="text-gray-400 text-sm mb-3">시간대별 대화량</div>
      <div className="flex items-end gap-1 h-20">
        {hours.map(h => {
          const count = byHour[h] || 0
          const height = (count / maxCount) * 100
          return (
            <div key={h} className="flex-1 flex flex-col items-center">
              <div 
                className="w-full bg-blue-500 rounded-t"
                style={{ height: `${height}%`, minHeight: count > 0 ? '4px' : '0' }}
                title={`${h}시: ${count}건`}
              />
            </div>
          )
        })}
      </div>
      <div className="flex justify-between text-xs text-gray-500 mt-1">
        <span>0시</span>
        <span>12시</span>
        <span>23시</span>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 60000) // 1분마다 갱신
    return () => clearInterval(interval)
  }, [])

  async function fetchData() {
    try {
      const res = await fetch('/api/stats')
      if (!res.ok) throw new Error('Failed to fetch')
      const json = await res.json()
      setData(json)
      setError(null)
    } catch (e) {
      setError('데이터를 불러오는데 실패했습니다')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">로딩 중...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-400">{error || '데이터 없음'}</div>
      </div>
    )
  }

  const formatTime = (min: number) => {
    if (min < 1) return `${Math.round(min * 60)}초`
    return `${Math.round(min)}분`
  }

  return (
    <main className="min-h-screen p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">📊 차란 CX 실시간 대시보드</h1>
        <div className="text-gray-500 text-sm">
          마지막 업데이트: {new Date(data.generatedAt).toLocaleTimeString('ko-KR')}
        </div>
      </div>

      {/* 케어드 섹션 */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-blue-400 mb-4">📦 케어드 태그 분석</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <StatCard 
            title="오늘 총 문의" 
            value={data.cared.stats.total} 
            change={data.change.cared}
          />
          <StatCard title="어제 총 문의" value={data.yesterday.byProduct.cared} />
          <StatCard 
            title="문의 응대중" 
            value={data.cared.stats.byState.opened}
            subValue={`종료: ${data.cared.stats.byState.closed}`}
          />
          <StatCard 
            title="평균 응답시간" 
            value={formatTime(data.cared.stats.avgFirstResponseTimeMin)}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <TagList tags={data.cared.topTags} title="상위 10개 태그 분석" />
          <ManagerStats managers={data.cared.stats.byManager} />
          <HourlyChart byHour={data.cared.stats.byHour} />
        </div>
      </section>

      {/* 마켓 섹션 */}
      <section>
        <h2 className="text-lg font-semibold text-green-400 mb-4">🛍️ 마켓 태그 분석</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <StatCard 
            title="오늘 총 문의" 
            value={data.market.stats.total}
            change={data.change.market}
          />
          <StatCard title="어제 총 문의" value={data.yesterday.byProduct.market} />
          <StatCard 
            title="문의 응대중" 
            value={data.market.stats.byState.opened}
            subValue={`종료: ${data.market.stats.byState.closed}`}
          />
          <StatCard 
            title="평균 응답시간" 
            value={formatTime(data.market.stats.avgFirstResponseTimeMin)}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <TagList tags={data.market.topTags} title="상위 10개 태그 분석" />
          <ManagerStats managers={data.market.stats.byManager} />
          <HourlyChart byHour={data.market.stats.byHour} />
        </div>
      </section>
    </main>
  )
}
