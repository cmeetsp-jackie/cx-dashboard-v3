'use client';

import { useEffect, useState } from 'react';

interface Stats {
  today: {
    total: number;
    byState: { opened: number; closed: number };
    byProduct: { market: number; cared: number };
    byManager: Record<string, number>;
    byHour: Record<string, number>;
    byTag: Record<string, number>;
    avgResponseTimeMin: number;
    avgFirstResponseTimeMin: number;
    aiCount: number;
    aiRate: number;
    responseRate: number;
    resolutionRate: number;
    respondedCount: number;
  };
  yesterday: {
    total: number;
    byProduct: { market: number; cared: number };
  };
  change: { total: number; market: number; cared: number };
  cared: {
    stats: {
      total: number;
      byState: { opened: number; closed: number };
      byTag: Record<string, number>;
      aiCount: number;
      aiRate: number;
    };
    topTags: { tag: string; count: number }[];
  };
  market: {
    stats: {
      total: number;
      byState: { opened: number; closed: number };
      byTag: Record<string, number>;
      aiCount: number;
      aiRate: number;
    };
    topTags: { tag: string; count: number }[];
  };
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const fetchData = async () => {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      setStats(data);
      setLoading(false);
      
      // 업데이트 시간 설정 (KST)
      if (data.generatedAt) {
        const date = new Date(data.generatedAt);
        const kstTime = date.toLocaleString('ko-KR', {
          timeZone: 'Asia/Seoul',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });
        setLastUpdated(kstTime);
      }
    } catch {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 초기 로드
    fetchData();
    
    // 20분마다 자동 새로고침
    const interval = setInterval(fetchData, 20 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // 오늘 날짜 (KST 기준, 2026.03.12 형식)
  const today = new Date().toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).replace(/\. /g, '.').replace(/\.$/, '');

  const formatChange = (value: number) => {
    if (value > 0) return `+${value.toFixed(1)}%`;
    return `${value.toFixed(1)}%`;
  };

  const getChangeColor = (value: number) => {
    if (value > 0) return 'text-red-400';
    if (value < 0) return 'text-green-400';
    return 'text-gray-400';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-500 to-purple-700 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <span className="text-3xl">■</span>
              차란 CX 실시간 대시보드 
              <span className="text-yellow-300">({today})</span>
            </h1>
            {/* CX 팀원 아바타 */}
            <div className="flex items-center gap-2 ml-4">
              <img src="/team/joy.png" alt="Joy" className="w-16 h-16 rounded-full object-cover border-2 border-white/50" title="Joy" />
              <img src="/team/sara.png" alt="Sara" className="w-16 h-16 rounded-full object-cover border-2 border-white/50" title="Sara" />
              <img src="/team/sia.png" alt="Sia" className="w-16 h-16 rounded-full object-cover border-2 border-white/50" title="Sia" />
              <img src="/team/jacky.png" alt="Jacky" className="w-16 h-16 rounded-full object-cover border-2 border-white/50" title="Jacky" />
            </div>
          </div>
          <div className="text-white/80 text-sm">
            {lastUpdated && (
              <span>마지막 업데이트: {lastUpdated} · 20분마다 자동 갱신</span>
            )}
          </div>
        </div>
        <p className="text-white/70 text-sm mt-1">채널톡 고객응대 현황 - Daily</p>
      </div>

      {/* 응답률 & 해결률 - 상단 대형 카드 */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <p className="text-white text-lg font-medium">오늘 응답률</p>
              </div>
              <p className="text-white text-5xl font-bold mt-2">
                {loading ? '-' : `${stats?.today.responseRate || 0}%`}
              </p>
              <p className="text-white/70 text-sm mt-2">
                {loading ? '' : `${stats?.today.respondedCount || 0}건 응답 / ${stats?.today.total || 0}건 접수`}
              </p>
              <p className="text-white/50 text-xs mt-3 border-t border-white/20 pt-2">
                = (응답을 보낸 문의 건수 ÷ 전체 접수된 문의) × 100
              </p>
            </div>
            <div className="text-6xl opacity-30">📞</div>
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-orange-500 to-rose-600 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <p className="text-white text-lg font-medium">오늘 해결률</p>
              </div>
              <p className="text-white text-5xl font-bold mt-2">
                {loading ? '-' : `${stats?.today.resolutionRate || 0}%`}
              </p>
              <p className="text-white/70 text-sm mt-2">
                {loading ? '' : `${stats?.today.byState.closed || 0}건 해결 / ${stats?.today.total || 0}건 접수`}
              </p>
              <p className="text-white/50 text-xs mt-3 border-t border-white/20 pt-2">
                = (최종 종결된 문의 건수 ÷ 전체 접수된 문의) × 100
              </p>
            </div>
            <div className="text-6xl opacity-30">✅</div>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-12 gap-4">
        {/* Left Sidebar - 케어드 태그 분석 */}
        <div className="col-span-2">
          <div className="bg-gray-900/90 rounded-xl p-4 text-white">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              📦 케어드 태그 분석
            </h2>
            
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-400">오늘 총 문의</p>
                <p className="text-xl font-bold text-cyan-400">
                  {loading ? '-' : stats?.cared.stats.total || 0}
                </p>
              </div>
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-400">어제 총 문의</p>
                <p className="text-xl font-bold">
                  {loading ? '-' : stats?.yesterday.byProduct.cared || 0}
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-400">증감율</p>
                <p className={`text-xl font-bold ${stats ? getChangeColor(stats.change.cared) : ''}`}>
                  {loading ? '-' : formatChange(stats?.change.cared || 0)}
                </p>
              </div>
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-400">AI 처리율</p>
                <p className="text-xl font-bold text-cyan-400">
                  {loading ? '-' : `${stats?.cared.stats.aiRate || 0}%`}
                </p>
              </div>
            </div>

            <h3 className="text-sm font-semibold mb-2">상위 10개 태그 분석</h3>
            <div className="space-y-1 text-xs">
              {loading ? (
                <p className="text-gray-500">로딩 중...</p>
              ) : (
                stats?.cared.topTags.slice(0, 10).map((tag, i) => (
                  <div key={i} className="flex justify-between bg-gray-800/50 px-2 py-1 rounded">
                    <span className="truncate flex-1">{tag.tag}</span>
                    <span className="text-cyan-400 ml-2">{tag.count}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Center Content */}
        <div className="col-span-8 space-y-4">
          {/* Top Stats Row */}
          <div className="grid grid-cols-5 gap-4">
            <div className="bg-white rounded-xl p-4 shadow-lg">
              <p className="text-gray-500 text-sm">오늘 문의건수</p>
              <p className="text-3xl font-bold text-blue-600">
                {loading ? '-' : stats?.today.total || 0}
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-lg">
              <p className="text-gray-500 text-sm">오늘 문의 응대중</p>
              <p className="text-3xl font-bold text-orange-500">
                {loading ? '-' : stats?.today.byState.opened || 0}
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-lg">
              <p className="text-gray-500 text-sm">오늘 문의종료</p>
              <p className="text-3xl font-bold text-green-600">
                {loading ? '-' : stats?.today.byState.closed || 0}
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-lg">
              <p className="text-gray-500 text-sm">AI 응답건수/응답률</p>
              <p className="text-3xl font-bold text-purple-600">
                {loading ? '-' : `${stats?.today.aiCount || 0}건`}
              </p>
              <p className="text-sm text-purple-400 mt-1">
                {loading ? '' : `(${stats?.today.aiRate || 0}%)`}
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-lg">
              <p className="text-gray-500 text-sm">오늘 평균응답시간</p>
              <p className="text-3xl font-bold text-cyan-600">
                {loading ? '-' : `${(stats?.today.avgFirstResponseTimeMin || 0).toFixed(1)}분`}
              </p>
            </div>
          </div>

          {/* Middle Row - Charts */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl p-4 shadow-lg min-h-[200px]">
              <h3 className="text-gray-700 font-semibold mb-3">오늘 시간대별 대화량</h3>
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  <span className="ml-2 text-gray-500">데이터 로딩 중...</span>
                </div>
              ) : (() => {
                const values = Object.values(stats?.today.byHour || {});
                const max = values.length > 0 ? Math.max(...values.map(v => Number(v))) : 1;
                const mid = Math.round(max / 2);
                return (
                  <div className="relative flex">
                    {/* Y축 라벨 */}
                    <div className="flex flex-col justify-between h-[120px] pr-2 text-[10px] text-gray-400 text-right w-8">
                      <span>{max}건</span>
                      <span>{mid}건</span>
                      <span>0건</span>
                    </div>
                    {/* 차트 영역 */}
                    <div className="flex-1">
                      <div className="flex items-end gap-[2px] h-[120px] border-l border-b border-gray-200">
                        {Array.from({ length: 24 }, (_, i) => {
                          const count = stats?.today.byHour[i.toString()] || 0;
                          const heightPx = max > 0 ? Math.round((count / max) * 120) : 0;
                          return (
                            <div key={i} className="flex-1 flex flex-col justify-end items-center h-full">
                              <div
                                className="w-full bg-blue-400 rounded-t transition-all"
                                style={{ height: `${heightPx}px` }}
                                title={`${i}시: ${count}건`}
                              />
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex justify-between mt-1 text-[10px] text-gray-400 pl-1">
                        <span>0</span>
                        <span>4</span>
                        <span>8</span>
                        <span>12</span>
                        <span>16</span>
                        <span>20</span>
                        <span>24</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
            
            <div className="bg-white rounded-xl p-4 shadow-lg min-h-[200px]">
              <h3 className="text-gray-700 font-semibold mb-3">오늘 팀원별 처리 현황</h3>
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  <span className="ml-2 text-gray-500">데이터 로딩 중...</span>
                </div>
              ) : (() => {
                const managers = Object.entries(stats?.today.byManager || {});
                const total = managers.reduce((sum, [, count]) => sum + count, 0);
                const colors = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981'];
                
                // 파이차트 계산
                let cumulative = 0;
                const slices = managers.map(([name, count], i) => {
                  const pct = total > 0 ? (count / total) * 100 : 0;
                  const startAngle = cumulative * 3.6; // 360 / 100
                  cumulative += pct;
                  const endAngle = cumulative * 3.6;
                  return { name, count, pct, startAngle, endAngle, color: colors[i % colors.length] };
                });

                // SVG 파이차트 경로 생성
                const createArc = (startAngle: number, endAngle: number, radius: number) => {
                  const start = {
                    x: 60 + radius * Math.cos((startAngle - 90) * Math.PI / 180),
                    y: 60 + radius * Math.sin((startAngle - 90) * Math.PI / 180)
                  };
                  const end = {
                    x: 60 + radius * Math.cos((endAngle - 90) * Math.PI / 180),
                    y: 60 + radius * Math.sin((endAngle - 90) * Math.PI / 180)
                  };
                  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
                  return `M 60 60 L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
                };

                return (
                  <div className="flex items-center gap-4">
                    {/* 파이차트 */}
                    <svg width="120" height="120" viewBox="0 0 120 120">
                      {slices.map((slice, i) => (
                        <path
                          key={i}
                          d={createArc(slice.startAngle, slice.endAngle, 50)}
                          fill={slice.color}
                          stroke="white"
                          strokeWidth="2"
                        />
                      ))}
                      {/* 중앙 흰색 원 (도넛 효과) */}
                      <circle cx="60" cy="60" r="25" fill="white" />
                      <text x="60" y="65" textAnchor="middle" className="text-sm font-bold fill-gray-700">
                        {total}건
                      </text>
                    </svg>
                    
                    {/* 범례 */}
                    <div className="flex-1 space-y-2">
                      {slices.map((slice, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full flex-shrink-0" 
                            style={{ backgroundColor: slice.color }}
                          />
                          <span className="text-gray-800 font-medium text-sm">{slice.name}</span>
                          <span className="text-gray-500 text-sm ml-auto">
                            {slice.count}건 ({slice.pct.toFixed(0)}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Bottom Row - 케어드/마켓 문의 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl p-4 shadow-lg">
              <h3 className="text-gray-700 font-semibold mb-3">오늘 케어드 문의</h3>
              <p className="text-4xl font-bold text-blue-600">
                {loading ? '-' : stats?.cared.stats.total || 0}
              </p>
              <div className="mt-2 text-sm text-gray-500">
                <span className="text-green-500">완료: {stats?.cared.stats.byState.closed || 0}</span>
                <span className="mx-2">|</span>
                <span className="text-orange-500">진행중: {stats?.cared.stats.byState.opened || 0}</span>
              </div>
            </div>
            
            <div className="bg-white rounded-xl p-4 shadow-lg">
              <h3 className="text-gray-700 font-semibold mb-3">오늘 마켓 문의</h3>
              <p className="text-4xl font-bold text-purple-600">
                {loading ? '-' : stats?.market.stats.total || 0}
              </p>
              <div className="mt-2 text-sm text-gray-500">
                <span className="text-green-500">완료: {stats?.market.stats.byState.closed || 0}</span>
                <span className="mx-2">|</span>
                <span className="text-orange-500">진행중: {stats?.market.stats.byState.opened || 0}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar - 마켓 태그 분석 */}
        <div className="col-span-2">
          <div className="bg-gray-900/90 rounded-xl p-4 text-white">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              🛍️ 마켓 태그 분석
            </h2>
            
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-400">오늘 총 문의</p>
                <p className="text-xl font-bold text-green-400">
                  {loading ? '-' : stats?.market.stats.total || 0}
                </p>
              </div>
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-400">어제 총 문의</p>
                <p className="text-xl font-bold">
                  {loading ? '-' : stats?.yesterday.byProduct.market || 0}
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-400">증감율</p>
                <p className={`text-xl font-bold ${stats ? getChangeColor(stats.change.market) : ''}`}>
                  {loading ? '-' : formatChange(stats?.change.market || 0)}
                </p>
              </div>
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-400">AI 처리율</p>
                <p className="text-xl font-bold text-green-400">
                  {loading ? '-' : `${stats?.market.stats.aiRate || 0}%`}
                </p>
              </div>
            </div>

            <h3 className="text-sm font-semibold mb-2">상위 10개 태그 분석</h3>
            <div className="space-y-1 text-xs">
              {loading ? (
                <p className="text-gray-500">로딩 중...</p>
              ) : (
                stats?.market.topTags.slice(0, 10).map((tag, i) => (
                  <div key={i} className="flex justify-between bg-gray-800/50 px-2 py-1 rounded">
                    <span className="truncate flex-1">{tag.tag}</span>
                    <span className="text-green-400 ml-2">{tag.count}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
