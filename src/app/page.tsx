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
    aiRate: number;
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
      aiRate: number;
    };
    topTags: { tag: string; count: number }[];
  };
  market: {
    stats: {
      total: number;
      byState: { opened: number; closed: number };
      byTag: Record<string, number>;
      aiRate: number;
    };
    topTags: { tag: string; count: number }[];
  };
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/stats')
      .then(res => res.json())
      .then(data => {
        setStats(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).replace(/\. /g, '.').replace('.', '');

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
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <span className="text-3xl">■</span>
          차란 CX 실시간 대시보드 
          <span className="text-yellow-300">({today})</span>
        </h1>
        <p className="text-white/70 text-sm mt-1">채널톡 고객응대 현황 - Daily</p>
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
              <p className="text-gray-500 text-sm">문의건수</p>
              <p className="text-3xl font-bold text-blue-600">
                {loading ? '-' : stats?.today.total || 0}
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-lg">
              <p className="text-gray-500 text-sm">문의 응대중</p>
              <p className="text-3xl font-bold text-orange-500">
                {loading ? '-' : stats?.today.byState.opened || 0}
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-lg">
              <p className="text-gray-500 text-sm">문의종료</p>
              <p className="text-3xl font-bold text-green-600">
                {loading ? '-' : stats?.today.byState.closed || 0}
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-lg">
              <p className="text-gray-500 text-sm">AI 응답건수/응답률</p>
              <p className="text-3xl font-bold text-purple-600">
                {loading ? '-' : `${stats?.today.aiRate || 0}%`}
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-lg">
              <p className="text-gray-500 text-sm">평균 응답시간</p>
              <p className="text-3xl font-bold text-cyan-600">
                {loading ? '-' : `${(stats?.today.avgFirstResponseTimeMin || 0).toFixed(1)}분`}
              </p>
            </div>
          </div>

          {/* Middle Row - Charts */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl p-4 shadow-lg min-h-[200px]">
              <h3 className="text-gray-700 font-semibold mb-3">시간대별 대화량</h3>
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  <span className="ml-2 text-gray-500">데이터 로딩 중...</span>
                </div>
              ) : (
                <div className="flex items-end gap-1 h-32">
                  {Array.from({ length: 24 }, (_, i) => {
                    const count = stats?.today.byHour[i.toString()] || 0;
                    const max = Math.max(...Object.values(stats?.today.byHour || { '0': 1 }));
                    const height = max > 0 ? (count / max) * 100 : 0;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center">
                        <div
                          className="w-full bg-blue-400 rounded-t"
                          style={{ height: `${height}%`, minHeight: count > 0 ? '4px' : '0' }}
                          title={`${i}시: ${count}건`}
                        />
                        {i % 4 === 0 && (
                          <span className="text-[10px] text-gray-400 mt-1">{i}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            <div className="bg-white rounded-xl p-4 shadow-lg min-h-[200px]">
              <h3 className="text-gray-700 font-semibold mb-3">팀원별 처리 현황</h3>
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  <span className="ml-2 text-gray-500">데이터 로딩 중...</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(stats?.today.byManager || {}).map(([name, count]) => {
                    const total = Object.values(stats?.today.byManager || {}).reduce((a, b) => a + b, 0);
                    const pct = total > 0 ? (count / total) * 100 : 0;
                    return (
                      <div key={name}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium">{name}</span>
                          <span className="text-gray-500">{count}건 ({pct.toFixed(0)}%)</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-gradient-to-r from-blue-400 to-purple-500 h-2 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Bottom Row - 케어드/마켓 문의 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl p-4 shadow-lg">
              <h3 className="text-gray-700 font-semibold mb-3">케어드 문의</h3>
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
              <h3 className="text-gray-700 font-semibold mb-3">마켓 문의</h3>
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
