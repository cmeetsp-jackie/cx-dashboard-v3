'use client';

import { useEffect, useState } from 'react';

interface Stats {
  today: {
    total: number;
    byState: { opened: number; closed: number };
    byProduct: { market: number; cared: number };
    byManager: Record<string, number>;
    byHour: Record<string, number>;
    byDate: Record<string, number>;
    byTag: Record<string, number>;
    avgResponseTimeMin: number;
    avgFirstResponseTimeMin: number;
    avgResolutionTimeMin: number;
    aiCount: number;
    aiRate: number;
    responseRate: number;
    resolutionRate: number;
    respondedCount: number;
  };
  yesterday: {
    total: number;
    byState: { opened: number; closed: number };
    byProduct: { market: number; cared: number };
    resolutionRate: number;
    avgResolutionTimeMin: number;
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

// 날짜 유틸리티
function getKSTDate(): Date {
  return new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatDateLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${year}.${month}.${day}`;
}

// 주간 시작일 계산 (화요일 기준)
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  // 화요일(2)이 주 시작
  const diff = day >= 2 ? day - 2 : day + 5;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

// 완료된 주간 목록 생성
function getCompletedWeeks(): { id: string; label: string; start: string; end: string }[] {
  const kstNow = getKSTDate();
  const currentWeekStart = getWeekStart(kstNow);
  const weeks = [];
  
  // Week 1: 3/4 ~ 3/10 (고정)
  weeks.push({ id: 'week1', label: 'Week 1 (3/4~3/10)', start: '2026-03-04', end: '2026-03-10' });
  
  // Week 2: 3/11 ~ 3/17 (현재 주가 3/18 이후면 추가)
  if (currentWeekStart >= new Date('2026-03-18')) {
    weeks.push({ id: 'week2', label: 'Week 2 (3/11~3/17)', start: '2026-03-11', end: '2026-03-17' });
  }
  
  return weeks;
}

// 현재 주의 일별 탭 생성 (마지막 완료 주간 다음날 ~ 어제)
function getPastDailyTabs(): { date: string; label: string }[] {
  const kstNow = getKSTDate();
  const today = formatDate(kstNow);
  const tabs = [];
  
  // 마지막 완료 주간 다음날부터 시작 (Week 1이 3/10까지이므로 3/11부터)
  const lastCompletedWeekEnd = '2026-03-10';
  const startDate = new Date(lastCompletedWeekEnd);
  startDate.setUTCDate(startDate.getUTCDate() + 1);  // 3/11
  
  const current = new Date(startDate);
  while (formatDate(current) < today) {
    const dateStr = formatDate(current);
    tabs.push({ date: dateStr, label: formatDateLabel(dateStr) });
    current.setUTCDate(current.getUTCDate() + 1);
  }
  
  return tabs;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'daily' | 'pastDaily' | 'weekly'>('daily');
  const [selectedDate, setSelectedDate] = useState<string>('');  // 과거 날짜 선택
  const [selectedWeek, setSelectedWeek] = useState(getCompletedWeeks()[0]);
  
  const pastDailyTabs = getPastDailyTabs();
  const completedWeeks = getCompletedWeeks();

  const fetchData = async (isManualRefresh = false, tab = activeTab, week = selectedWeek, date = selectedDate) => {
    if (isManualRefresh) {
      setRefreshing(true);
    }
    setLoading(true);
    try {
      let url = '/api/stats';
      if (tab === 'weekly') {
        url = `/api/stats?period=weekly&weekStart=${week.start}&weekEnd=${week.end}`;
      } else if (tab === 'pastDaily' && date) {
        url = `/api/stats?period=pastDaily&date=${date}`;
      }
      // tab === 'daily' → 기본 URL (오늘 데이터)
      
      const res = await fetch(url);
      const data = await res.json();
      setStats(data);
      setLoading(false);
      
      // 업데이트 시간 설정 (KST)
      if (data.generatedAt) {
        const dateObj = new Date(data.generatedAt);
        const kstTime = dateObj.toLocaleString('ko-KR', {
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
    } finally {
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    fetchData(true);
  };

  const handleTabChange = (tab: 'daily' | 'pastDaily' | 'weekly') => {
    setActiveTab(tab);
    if (tab === 'daily') {
      fetchData(false, tab, selectedWeek, '');
    } else if (tab === 'weekly') {
      fetchData(false, tab, selectedWeek, '');
    }
  };

  const handlePastDailyChange = (date: string) => {
    setSelectedDate(date);
    setActiveTab('pastDaily');
    fetchData(false, 'pastDaily', selectedWeek, date);
  };

  const handleWeekChange = (week: typeof completedWeeks[0]) => {
    setSelectedWeek(week);
    fetchData(false, 'weekly', week, '');
  };

  useEffect(() => {
    // 초기 로드
    fetchData();
    
    // 20분마다 자동 새로고침 (daily 탭일 때만)
    const interval = setInterval(() => {
      if (activeTab === 'daily') fetchData();
    }, 20 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // 오늘 날짜 (KST 기준, 2026.03.12 형식)
  const today = new Date().toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).replace(/\. /g, '.').replace(/\.$/, '');

  // 표시할 날짜/기간
  const displayPeriod = activeTab === 'daily' 
    ? `오늘 (${today})` 
    : activeTab === 'pastDaily' 
      ? formatDateLabel(selectedDate)
      : selectedWeek.label;

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
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <span className="text-3xl">■</span>
              차란 CX 실시간 대시보드 ({today})
            </h1>
            {/* CX 팀원 아바타 */}
            <div className="flex items-center gap-3 ml-4">
              <img src="/team/joy.png" alt="Joy" className="w-16 h-16 rounded-full object-cover border-2 border-white/50" title="Joy" />
              <img src="/team/sara.png" alt="Sara" className="w-16 h-16 rounded-full object-cover border-2 border-white/50" title="Sara" />
              <img src="/team/sia.png" alt="Sia" className="w-16 h-16 rounded-full object-cover border-2 border-white/50" title="Sia" />
              <img src="/team/jacky.png" alt="Jacky" className="w-16 h-16 rounded-full object-cover border-2 border-white/50" title="Jacky" />
            </div>
          </div>
          <div className="flex items-center gap-3 text-white/80 text-sm">
            {lastUpdated && (
              <span>마지막 업데이트: {lastUpdated} · 20분마다 자동 갱신</span>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 disabled:bg-white/10 rounded-lg transition-all"
              title="수동 새로고침"
            >
              <svg
                className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span>{refreshing ? '새로고침 중...' : '새로고침'}</span>
            </button>
          </div>
        </div>
        {/* 탭 UI */}
        <div className="flex items-center gap-4 mt-3 flex-wrap">
          {/* Daily 탭 (오늘) */}
          <div className="flex bg-white/10 rounded-lg p-1">
            <button
              onClick={() => handleTabChange('daily')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === 'daily'
                  ? 'bg-white text-purple-700'
                  : 'text-white hover:bg-white/10'
              }`}
            >
              📅 Daily (오늘)
            </button>
          </div>
          
          {/* 과거 날짜 탭 (현재 주의 지난 날들) */}
          {pastDailyTabs.length > 0 && (
            <div className="flex gap-1 bg-white/10 rounded-lg p-1">
              {pastDailyTabs.map((tab) => (
                <button
                  key={tab.date}
                  onClick={() => handlePastDailyChange(tab.date)}
                  className={`px-3 py-2 rounded-md text-sm transition-all ${
                    activeTab === 'pastDaily' && selectedDate === tab.date
                      ? 'bg-blue-400 text-white font-semibold'
                      : 'text-white hover:bg-white/10'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
          
          {/* Weekly 탭 */}
          <div className="flex bg-white/10 rounded-lg p-1">
            <button
              onClick={() => handleTabChange('weekly')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === 'weekly'
                  ? 'bg-white text-purple-700'
                  : 'text-white hover:bg-white/10'
              }`}
            >
              📊 Weekly
            </button>
          </div>
          
          {/* Weekly 탭일 때 주간 선택 */}
          {activeTab === 'weekly' && (
            <div className="flex gap-2">
              {completedWeeks.map((week) => (
                <button
                  key={week.id}
                  onClick={() => handleWeekChange(week)}
                  className={`px-3 py-1.5 rounded-md text-sm transition-all ${
                    selectedWeek.id === week.id
                      ? 'bg-yellow-400 text-gray-900 font-semibold'
                      : 'bg-white/20 text-white hover:bg-white/30'
                  }`}
                >
                  {week.label}
                </button>
              ))}
            </div>
          )}
          
          {/* 현재 기간 표시 */}
          <span className="text-yellow-300 font-semibold ml-2">
            {displayPeriod}
          </span>
        </div>
      </div>

      {/* 응답률 & 해결률 - 상단 대형 카드 */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <p className="text-white text-base font-medium">{activeTab !== 'weekly' ? '오늘 응답률' : '주간 응답률'}</p>
              </div>
              <p className="text-white text-4xl font-bold mt-2">
                {loading ? '-' : `${stats?.today.responseRate || 0}%`}
              </p>
              <p className="text-white/70 text-sm mt-2">
                {loading ? '' : `${stats?.today.respondedCount || 0}건 응답 / ${stats?.today.total || 0}건 접수`}
              </p>
            </div>
            <div className="text-5xl opacity-30">📞</div>
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-amber-500 to-yellow-600 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <p className="text-white text-base font-medium">{activeTab !== 'weekly' ? '어제 해결률' : '전주 해결률'}</p>
              </div>
              <p className="text-white text-4xl font-bold mt-2">
                {loading ? '-' : `${stats?.yesterday.resolutionRate || 0}%`}
              </p>
              <p className="text-white/70 text-sm mt-2">
                {loading ? '' : `${stats?.yesterday.byState.closed || 0}건 해결 / ${stats?.yesterday.total || 0}건 접수`}
              </p>
            </div>
            <div className="text-5xl opacity-30">📊</div>
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-violet-500 to-fuchsia-600 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <p className="text-white text-base font-medium">{activeTab !== 'weekly' ? '어제 평균해결시간' : '전주 평균해결시간'}</p>
              </div>
              <p className="text-white text-4xl font-bold mt-2">
                {loading ? '-' : `${(stats?.yesterday.avgResolutionTimeMin || 0).toFixed(0)}분`}
              </p>
              <p className="text-white/70 text-sm mt-2">
                {loading ? '' : `≈ ${((stats?.yesterday.avgResolutionTimeMin || 0) / 60).toFixed(1)}시간`}
              </p>
            </div>
            <div className="text-5xl opacity-30">⏱️</div>
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-orange-500 to-rose-600 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <p className="text-white text-base font-medium">{activeTab !== 'weekly' ? '오늘 해결률' : '주간 해결률'}</p>
              </div>
              <p className="text-white text-4xl font-bold mt-2">
                {loading ? '-' : `${stats?.today.resolutionRate || 0}%`}
              </p>
              <p className="text-white/70 text-sm mt-2">
                {loading ? '' : `${stats?.today.byState.closed || 0}건 해결 / ${stats?.today.total || 0}건 접수`}
              </p>
            </div>
            <div className="text-5xl opacity-30">✅</div>
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
                <p className="text-xs text-gray-400">{activeTab !== 'weekly' ? '오늘 총 문의' : '주간 총 문의'}</p>
                <p className="text-xl font-bold text-cyan-400">
                  {loading ? '-' : stats?.cared.stats.total || 0}
                </p>
              </div>
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-400">{activeTab !== 'weekly' ? '어제 총 문의' : '전주 총 문의'}</p>
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
          <div className="grid grid-cols-6 gap-4">
            <div className="bg-white rounded-xl p-4 shadow-lg">
              <p className="text-gray-500 text-sm">{activeTab !== 'weekly' ? '오늘 문의건수 / 어제' : '주간 문의건수 / 전주'}</p>
              <p className="text-3xl font-bold">
                <span className="text-blue-600">{loading ? '-' : stats?.today.total || 0}</span>
                <span className="text-gray-400 mx-1">/</span>
                <span className="text-gray-500">{loading ? '-' : stats?.yesterday.total || 0}</span>
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-lg">
              <p className="text-gray-500 text-sm">{activeTab !== 'weekly' ? '오늘 문의 응대중' : '문의 응대중'}</p>
              <p className="text-3xl font-bold text-orange-500">
                {loading ? '-' : stats?.today.byState.opened || 0}
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-lg">
              <p className="text-gray-500 text-sm">{activeTab !== 'weekly' ? '오늘 문의종료' : '주간 문의 종료'}</p>
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
              <p className="text-gray-500 text-sm">{activeTab !== 'weekly' ? '오늘 평균응답시간' : '주간 평균응답시간'}</p>
              <p className="text-3xl font-bold text-cyan-600">
                {loading ? '-' : `${(stats?.today.avgFirstResponseTimeMin || 0).toFixed(1)}분`}
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-lg">
              <p className="text-gray-500 text-sm">{activeTab !== 'weekly' ? '오늘 평균해결시간' : '주간 평균해결시간'}</p>
              <p className="text-3xl font-bold text-rose-600">
                {loading ? '-' : `${(stats?.today.avgResolutionTimeMin || 0).toFixed(0)}분`}
              </p>
            </div>
          </div>

          {/* Middle Row - Charts */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl p-4 shadow-lg min-h-[200px]">
              <h3 className="text-gray-700 font-semibold mb-3">{activeTab !== 'weekly' ? '오늘 시간대별 대화량' : '주간 daily 문의량'}</h3>
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  <span className="ml-2 text-gray-500">데이터 로딩 중...</span>
                </div>
              ) : activeTab !== 'weekly' ? (
                // Daily: 시간대별 차트
                (() => {
                  const values = Object.values(stats?.today.byHour || {});
                  const max = values.length > 0 ? Math.max(...values.map(v => Number(v))) : 1;
                  const mid = Math.round(max / 2);
                  return (
                    <div className="relative flex">
                      <div className="flex flex-col justify-between h-[120px] pr-2 text-[10px] text-gray-400 text-right w-8">
                        <span>{max}건</span>
                        <span>{mid}건</span>
                        <span>0건</span>
                      </div>
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
                })()
              ) : (
                // Weekly: 일별 차트
                (() => {
                  const dates = ['2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10'];
                  const dateLabels = ['3/4', '3/5', '3/6', '3/7', '3/8', '3/9', '3/10'];
                  const values = dates.map(d => stats?.today.byDate?.[d] || 0);
                  const max = values.length > 0 ? Math.max(...values) : 1;
                  const mid = Math.round(max / 2);
                  return (
                    <div className="relative flex">
                      <div className="flex flex-col justify-between h-[120px] pr-2 text-[10px] text-gray-400 text-right w-8">
                        <span>{max}건</span>
                        <span>{mid}건</span>
                        <span>0건</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-end gap-2 h-[120px] border-l border-b border-gray-200">
                          {dates.map((date, i) => {
                            const count = stats?.today.byDate?.[date] || 0;
                            const heightPx = max > 0 ? Math.round((count / max) * 120) : 0;
                            return (
                              <div key={date} className="flex-1 flex flex-col justify-end items-center h-full">
                                <div
                                  className="w-full bg-blue-500 rounded-t transition-all"
                                  style={{ height: `${heightPx}px` }}
                                  title={`${dateLabels[i]}: ${count}건`}
                                />
                                <span className="text-[9px] text-gray-500 mt-1">{count}</span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex justify-around mt-1 text-[10px] text-gray-500">
                          {dateLabels.map(label => <span key={label}>{label}</span>)}
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
            
            <div className="bg-white rounded-xl p-4 shadow-lg min-h-[200px]">
              <h3 className="text-gray-700 font-semibold mb-3">{activeTab !== 'weekly' ? '오늘 팀원별 처리 현황' : '주간 팀원별 처리 현황'}</h3>
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
              <h3 className="text-gray-700 font-semibold mb-3">{activeTab !== 'weekly' ? '오늘 케어드 문의' : '주간 케어드 문의'}</h3>
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
              <h3 className="text-gray-700 font-semibold mb-3">{activeTab !== 'weekly' ? '오늘 마켓 문의' : '주간 마켓 문의'}</h3>
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
                <p className="text-xs text-gray-400">{activeTab !== 'weekly' ? '오늘 총 문의' : '주간 총 문의'}</p>
                <p className="text-xl font-bold text-green-400">
                  {loading ? '-' : stats?.market.stats.total || 0}
                </p>
              </div>
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-400">{activeTab !== 'weekly' ? '어제 총 문의' : '전주 총 문의'}</p>
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

      {/* 주간 트래커 - 하단 동그라미 7개 */}
      {activeTab !== 'weekly' && (
        <div className="-mt-2 py-2">
          <h3 className="text-white font-bold mb-3 text-center text-lg">📅 이번 주 해결률 & 해결시간 트래커 (3/11 ~ 3/17)</h3>
          <div className="flex justify-center items-end gap-6">
            {(() => {
              const weekDays = [
                { date: '3/11', day: '화' },
                { date: '3/12', day: '수' },
                { date: '3/13', day: '목' },
                { date: '3/14', day: '금' },
                { date: '3/15', day: '토' },
                { date: '3/16', day: '일' },
                { date: '3/17', day: '월' },
              ];
              
              // 오늘 날짜 계산 (KST)
              const kstNow = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
              const todayDate = kstNow.getUTCDate();
              const todayMonth = kstNow.getUTCMonth() + 1;
              const todayStr = `${todayMonth}/${todayDate}`;
              
              // 어제 날짜 계산
              const yesterdayDate = todayDate - 1;
              const yesterdayStr = `${todayMonth}/${yesterdayDate}`;
              
              return weekDays.map((item, idx) => {
                const isToday = item.date === todayStr;
                const isYesterday = item.date === yesterdayStr;
                const isPast = (() => {
                  const [m, d] = item.date.split('/').map(Number);
                  if (todayMonth > m) return true;
                  if (todayMonth === m && todayDate > d) return true;
                  return false;
                })();
                
                // 데이터 결정
                let resolutionRate: string | number = '-';
                let resolutionTime: string | number = '-';
                
                if (isToday) {
                  resolutionRate = stats?.today.resolutionRate || 0;
                  resolutionTime = (stats?.today.avgResolutionTimeMin || 0).toFixed(0);
                } else if (isYesterday) {
                  resolutionRate = stats?.yesterday.resolutionRate || 0;
                  resolutionTime = (stats?.yesterday.avgResolutionTimeMin || 0).toFixed(0);
                }
                
                return (
                  <div key={idx} className="flex flex-col items-center">
                    {/* TODAY 뱃지 */}
                    {isToday && (
                      <span className="bg-rose-500 text-white text-xs font-bold px-2 py-0.5 rounded-full mb-2 animate-pulse">
                        TODAY
                      </span>
                    )}
                    {!isToday && <div className="h-6 mb-2"></div>}
                    
                    {/* 동그라미 */}
                    <div className={`w-20 h-20 rounded-full flex flex-col items-center justify-center shadow-lg border-4 ${
                      isToday 
                        ? 'bg-gradient-to-br from-rose-500 to-pink-600 border-rose-300 text-white' 
                        : isYesterday
                          ? 'bg-gradient-to-br from-indigo-500 to-purple-600 border-indigo-300 text-white'
                          : isPast 
                            ? 'bg-gradient-to-br from-gray-400 to-gray-500 border-gray-300 text-white'
                            : 'bg-gradient-to-br from-gray-600 to-gray-700 border-gray-500 text-gray-300'
                    }`}>
                      <span className="text-lg font-bold">{resolutionRate !== '-' ? `${resolutionRate}%` : '-'}</span>
                      <span className="text-xs">{resolutionTime !== '-' ? `${resolutionTime}분` : '-'}</span>
                    </div>
                    
                    {/* 날짜 */}
                    <span className={`mt-2 text-sm font-medium ${isToday ? 'text-rose-300' : 'text-white/80'}`}>
                      {item.date}
                    </span>
                    <span className={`text-xs ${isToday ? 'text-rose-200' : 'text-white/60'}`}>
                      ({item.day})
                    </span>
                  </div>
                );
              });
            })()}
          </div>
          <p className="text-center text-white/50 text-xs mt-3">* 해결률(%) / 평균해결시간(분)</p>
        </div>
      )}
    </div>
  );
}
