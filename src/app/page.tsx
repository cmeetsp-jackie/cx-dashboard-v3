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
  firstResolutionRates: { date: string; assigned: number; rate: number }[];
  dailyResolutionStats: { date: string; resolutionRate: number; avgResolutionTimeMin: number; total: number; closed: number }[];
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

// 서비스 시작일 (Week 1 시작) - 유일한 기준점
const SERVICE_START_DATE = '2026-03-05';  // 수요일 (Week 1: 3/5~3/11, Week 2: 3/12~3/18)

// 주간 시작일 계산 (화요일 기준)
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  // 화요일(2)이 주 시작
  const diff = day >= 2 ? day - 2 : day + 5;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

// 완료된 주간 목록 생성 (동적 계산)
function getCompletedWeeks(): { id: string; label: string; start: string; end: string }[] {
  const kstNow = getKSTDate();
  const today = formatDate(kstNow);
  const weeks = [];
  
  // 서비스 시작일부터 7일씩 주간 생성
  const serviceStart = new Date(SERVICE_START_DATE);
  let weekNum = 1;
  let weekStart = new Date(serviceStart);
  
  while (true) {
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);  // 월요일까지 (7일간)
    
    const weekStartStr = formatDate(weekStart);
    const weekEndStr = formatDate(weekEnd);
    
    // 해당 주간이 완료되었는지 확인 (오늘이 다음 주 화요일 이후)
    const nextWeekStart = new Date(weekEnd);
    nextWeekStart.setUTCDate(nextWeekStart.getUTCDate() + 1);
    
    if (today >= formatDate(nextWeekStart)) {
      // 완료된 주간
      const startMonth = weekStart.getUTCMonth() + 1;
      const startDay = weekStart.getUTCDate();
      const endMonth = weekEnd.getUTCMonth() + 1;
      const endDay = weekEnd.getUTCDate();
      
      weeks.push({
        id: `week${weekNum}`,
        label: `Week ${weekNum} (${startMonth}/${startDay}~${endMonth}/${endDay})`,
        start: weekStartStr,
        end: weekEndStr
      });
      
      weekNum++;
      weekStart = new Date(nextWeekStart);
    } else {
      // 현재 진행 중인 주간이면 중단
      break;
    }
  }
  
  return weeks;
}

// 현재 주의 일별 탭 생성 (마지막 완료 주간 다음날 ~ 어제)
function getPastDailyTabs(): { date: string; label: string }[] {
  const kstNow = getKSTDate();
  const today = formatDate(kstNow);
  const tabs: { date: string; label: string }[] = [];
  
  // 완료된 주간들 가져와서 마지막 주간의 종료일 찾기
  const completedWeeks = getCompletedWeeks();
  if (completedWeeks.length === 0) return tabs;
  
  const lastWeek = completedWeeks[completedWeeks.length - 1];
  const startDate = new Date(lastWeek.end);
  startDate.setUTCDate(startDate.getUTCDate() + 1);  // 마지막 완료 주간 다음날
  
  const current = new Date(startDate);
  while (formatDate(current) < today) {
    const dateStr = formatDate(current);
    tabs.push({ date: dateStr, label: formatDateLabel(dateStr) });
    current.setUTCDate(current.getUTCDate() + 1);
  }
  
  return tabs;
}

// 로드맵리뷰 컴포넌트 - 지난주 vs 이번주 비교
interface WeekData {
  total: number;
  market: number;
  cared: number;
  contactRateData?: { orders: number; caredOrders: number; marketOrders: number; bagRequesters: number };
  caredSellerBuyerData?: { caredSeller: number; caredBuyer: number; caredUnclassified: number };
  marketSellerBuyerData?: { marketSeller: number; marketBuyer: number; marketUnclassified: number };
}

function RoadmapReview() {
  const [lastWeekData, setLastWeekData] = useState<WeekData | null>(null);
  const [thisWeekData, setThisWeekData] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(true);
  const [caredExpanded, setCaredExpanded] = useState(false);
  const [marketExpanded, setMarketExpanded] = useState(false);

  // 지난주 = Week 1 (3/4~3/10), 이번주 = Week 2 (3/11~3/17)
  // 주간 기준: 수요일~화요일
  const LAST_WEEK = { start: '2026-03-05', end: '2026-03-11', label: '3/5~3/11' };  // Week 1
  const THIS_WEEK = { start: '2026-03-12', end: '2026-03-18', label: '3/12~3/18' };  // Week 2

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [lastRes, thisRes] = await Promise.all([
          fetch(`/api/stats?period=weekly&weekStart=${LAST_WEEK.start}&weekEnd=${LAST_WEEK.end}`),
          fetch(`/api/stats?period=weekly&weekStart=${THIS_WEEK.start}&weekEnd=${THIS_WEEK.end}`),
        ]);
        const lastData = await lastRes.json();
        const thisData = await thisRes.json();
        setLastWeekData({ 
          total: lastData.today?.total || 0,
          market: lastData.today?.byProduct?.market || 0,
          cared: lastData.today?.byProduct?.cared || 0,
          contactRateData: lastData.contactRateData || { orders: 0, caredOrders: 0, marketOrders: 0, bagRequesters: 0 },
          caredSellerBuyerData: lastData.caredSellerBuyerData || { caredSeller: 0, caredBuyer: 0, caredUnclassified: 0 },
          marketSellerBuyerData: lastData.marketSellerBuyerData || { marketSeller: 0, marketBuyer: 0, marketUnclassified: 0 },
        });
        setThisWeekData({ 
          total: thisData.today?.total || 0,
          market: thisData.today?.byProduct?.market || 0,
          cared: thisData.today?.byProduct?.cared || 0,
          contactRateData: thisData.contactRateData || { orders: 0, caredOrders: 0, marketOrders: 0, bagRequesters: 0 },
          caredSellerBuyerData: thisData.caredSellerBuyerData || { caredSeller: 0, caredBuyer: 0, caredUnclassified: 0 },
          marketSellerBuyerData: thisData.marketSellerBuyerData || { marketSeller: 0, marketBuyer: 0, marketUnclassified: 0 },
        });
      } catch (e) {
        console.error('Failed to fetch roadmap data', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const lastTotal = lastWeekData?.total || 0;
  const thisTotal = thisWeekData?.total || 0;
  const diff = thisTotal - lastTotal;
  const diffPercent = lastTotal > 0 ? ((diff / lastTotal) * 100).toFixed(1) : '0';
  const isIncrease = diff >= 0;
  const maxValue = Math.max(lastTotal, thisTotal, 1);

  return (
    <div className="bg-white rounded-2xl p-8 shadow-xl min-h-[600px]">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-3">
        🗺️ 로드맵 리뷰
        <span className="text-sm font-normal text-gray-500">지난주 vs 이번주 비교</span>
      </h2>

      {/* 전체 문의량 + Contact Rate 양옆 배치 */}
      <div className="flex gap-6 mb-6">
        {/* 전체(케어드+마켓) 문의량 주간비교 */}
        <div className="bg-gray-50 rounded-xl p-6 flex-1 flex flex-col">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">전체(케어드+마켓) 문의량 주간비교</h3>
          
          {loading ? (
            <div className="flex items-center justify-center flex-1">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
              <span className="ml-2 text-gray-500">데이터 로딩 중...</span>
            </div>
          ) : (
            <div className="flex flex-col flex-1 justify-end">
              {/* 바 차트 */}
              <div className="flex items-end justify-center gap-20 mb-4">
                {/* 지난주 바 */}
                <div className="flex flex-col items-center">
                  <span className="text-3xl font-bold text-gray-600 mb-2">{lastTotal}건</span>
                  <div 
                    className="w-32 bg-gray-400 rounded-t-lg transition-all duration-500"
                    style={{ height: `${(lastTotal / maxValue) * 220}px` }}
                  />
                  <span className="mt-3 text-lg text-gray-600 font-medium">지난 주</span>
                  <span className="text-base text-gray-400">({LAST_WEEK.label})</span>
                </div>
                
                {/* 이번주 바 */}
                <div className="flex flex-col items-center">
                  <span className="text-3xl font-bold text-purple-600 mb-2">{thisTotal}건</span>
                  <div 
                    className="w-32 bg-purple-500 rounded-t-lg transition-all duration-500"
                    style={{ height: `${(thisTotal / maxValue) * 220}px` }}
                  />
                  <span className="mt-3 text-lg text-gray-600 font-medium">이번 주</span>
                  <span className="text-base text-gray-400">({THIS_WEEK.label})</span>
                </div>
              </div>

              {/* 증감 표시 */}
              <div className="flex justify-center mt-2">
                <div className={`px-8 py-3 rounded-full text-white font-bold text-lg ${
                  isIncrease ? 'bg-green-500' : 'bg-red-500'
                }`}>
                  {isIncrease ? '▲' : '▼'} {isIncrease ? '증가' : '감소'}: {Math.abs(diff)}건 ({isIncrease ? '+' : ''}{diffPercent}%)
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 전체 문의 Contact Rate (오른쪽 영역) */}
        {!loading && (
          <div className="flex-1 flex flex-col gap-4">
            {/* Why Contact Rate 설명 */}
            <div className="bg-amber-50 border-l-4 border-amber-400 p-3 text-sm rounded-r-xl">
              <p className="font-semibold text-amber-800 mb-1">Why Contact Rate(문의율)?</p>
              <p className="text-amber-700">
                "주문은 했는데 왜 문의를 했을까?"를 파악하면 상품 설명 부족, 배송 안내 미흡 등 구체적인 개선 포인트를 찾을 수 있고, 
                문의율이 높아지고 있다는 것은 고객이 서비스를 이용하는 과정에서 <span className="font-semibold">흐름이 끊기거나(friction) 궁금증이 해결되지 않는 지점</span>이 많다는 뜻입니다.
              </p>
            </div>
            
            {/* Contact Rate 박스 */}
            <div className="bg-gray-50 rounded-xl p-6 flex-1">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold text-gray-700">전체 문의 Contact Rate</h3>
            </div>
            
            {/* Contact Rate 정의 */}
            <div className="flex justify-end mb-4">
            <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
              Contact Rate = 문의건수 ÷ (주문수 + 백신청자수)
            </span>
          </div>
          
          {(() => {
            // Contact Rate 계산 (ClickHouse에서 가져온 실제 데이터)
            const lastOrders = lastWeekData?.contactRateData?.orders || 0;
            const lastBagRequesters = lastWeekData?.contactRateData?.bagRequesters || 0;
            const thisOrders = thisWeekData?.contactRateData?.orders || 0;
            const thisBagRequesters = thisWeekData?.contactRateData?.bagRequesters || 0;
            
            const lastDenominator = lastOrders + lastBagRequesters;
            const thisDenominator = thisOrders + thisBagRequesters;
            const lastContactRate = lastDenominator > 0 ? (lastTotal / lastDenominator) * 100 : 0;
            const thisContactRate = thisDenominator > 0 ? (thisTotal / thisDenominator) * 100 : 0;
            const contactRateDiff = thisContactRate - lastContactRate;
            const maxRate = Math.max(lastContactRate, thisContactRate, 15);

            return (
              <>
                {/* 라인 차트 */}
                <div className="relative h-48 mb-6">
                  {/* Y축 레이블 */}
                  <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-xs text-gray-400 w-8">
                    <span>{maxRate.toFixed(0)}%</span>
                    <span>{(maxRate / 2).toFixed(0)}%</span>
                    <span>0%</span>
                  </div>
                  
                  {/* 차트 영역 */}
                  <div className="ml-10 h-full border-l border-b border-gray-300 relative">
                    {/* 라인 */}
                    <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                      <line 
                        x1="20%" 
                        y1={`${100 - (lastContactRate / maxRate) * 100}%`}
                        x2="80%" 
                        y2={`${100 - (thisContactRate / maxRate) * 100}%`}
                        stroke="#6B7280" 
                        strokeWidth="2" 
                        strokeDasharray="5,5"
                      />
                    </svg>
                    
                    {/* 포인트 - 지난주 */}
                    <div 
                      className="absolute w-3 h-3 bg-gray-500 rounded-full transform -translate-x-1/2 -translate-y-1/2"
                      style={{ left: '20%', top: `${100 - (lastContactRate / maxRate) * 100}%` }}
                    />
                    <div 
                      className="absolute text-sm font-semibold text-gray-600 transform -translate-x-1/2 bg-gray-50 px-1 rounded"
                      style={{ left: '20%', top: `${Math.max(100 - (lastContactRate / maxRate) * 100 - 15, 0)}%` }}
                    >
                      {lastContactRate.toFixed(1)}%
                    </div>
                    
                    {/* 포인트 - 이번주 */}
                    <div 
                      className="absolute w-3 h-3 bg-red-500 rounded-full transform -translate-x-1/2 -translate-y-1/2"
                      style={{ left: '80%', top: `${100 - (thisContactRate / maxRate) * 100}%` }}
                    />
                    <div 
                      className="absolute text-sm font-semibold text-red-500 transform -translate-x-1/2 bg-gray-50 px-1 rounded"
                      style={{ left: '80%', top: `${Math.max(100 - (thisContactRate / maxRate) * 100 - 15, 0)}%` }}
                    >
                      {thisContactRate.toFixed(1)}%
                    </div>
                  </div>
                  
                  {/* X축 레이블 */}
                  <div className="ml-10 flex justify-between mt-2 text-xs text-gray-500">
                    <span className="ml-[15%]">지난 주 ({LAST_WEEK.label})</span>
                    <span className="mr-[15%]">이번 주 ({THIS_WEEK.label})</span>
                  </div>
                </div>

                {/* Contact Rate 정의 */}
                <div className="bg-white rounded-lg p-4 text-sm">
                  <div className="mb-4">
                    <p className="font-semibold text-gray-700 mb-2">• 지난 주 전체 Contact Rate : {lastContactRate.toFixed(1)}%</p>
                    <div className="ml-4 text-gray-600">
                      <p className="mb-1">◦ 구매 고객님 문의건수 : {lastWeekData?.market || 0}건 + 판매 고객님 문의건수 : {lastWeekData?.cared || 0}건 = <span className="font-semibold">{lastTotal}건</span></p>
                      <p className="mb-1">◦ <span className="underline">주문수 : {lastOrders.toLocaleString()}건</span> + <span className="underline">백 신청자 수 : {lastBagRequesters.toLocaleString()}건</span> = <span className="font-semibold">{lastDenominator.toLocaleString()}건</span></p>
                    </div>
                  </div>
                  
                  <div>
                    <p className="font-semibold text-gray-700 mb-2">
                      • 이번 주 전체 Contact Rate : {thisContactRate.toFixed(1)}% 
                      <span className={`ml-2 ${contactRateDiff >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                        ({contactRateDiff >= 0 ? '+' : ''}{contactRateDiff.toFixed(1)}%P WOW)
                      </span>
                    </p>
                    <div className="ml-4 text-gray-600">
                      <p className="mb-1">◦ 구매 고객님 문의건수 : {thisWeekData?.market || 0}건 + 판매 고객님 문의건수 : {thisWeekData?.cared || 0}건 = <span className="font-semibold">{thisTotal}건</span></p>
                      <p className="mb-1">◦ <span className="underline">주문수 : {thisOrders.toLocaleString()}건</span> + <span className="underline">백 신청자 수 : {thisBagRequesters.toLocaleString()}건</span> = <span className="font-semibold">{thisDenominator.toLocaleString()}건</span></p>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
          </div>
        </div>
        )}
      </div>

      {/* 케어드 문의량 + Contact Rate 양옆 배치 */}
      <div className="flex gap-6 mb-6">
        {/* 케어드 문의량 주간비교 */}
        <div className="bg-gray-50 rounded-xl p-6 flex-1 flex flex-col">
          <h3 
            className="text-lg font-semibold text-gray-700 mb-4 cursor-pointer hover:text-orange-600 flex items-center gap-2"
            onClick={() => setCaredExpanded(!caredExpanded)}
          >
            케어드 문의량 주간비교
            <span className="text-sm font-normal text-gray-400">{caredExpanded ? '▼' : '▶'} 클릭하여 상세보기</span>
          </h3>
          
          {loading ? (
            <div className="flex items-center justify-center flex-1">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
              <span className="ml-2 text-gray-500">데이터 로딩 중...</span>
            </div>
          ) : (
            (() => {
              const lastCared = lastWeekData?.cared || 0;
              const thisCared = thisWeekData?.cared || 0;
              const caredDiff = thisCared - lastCared;
              const caredDiffPercent = lastCared > 0 ? ((caredDiff / lastCared) * 100).toFixed(1) : '0';
              const isCaredIncrease = caredDiff >= 0;
              const maxCaredValue = Math.max(lastCared, thisCared, 1);

              return (
                <div className="flex flex-col flex-1 justify-end">
                  {/* 바 차트 */}
                  <div className="flex items-end justify-center gap-20 mb-4">
                    {/* 지난주 바 */}
                    <div className="flex flex-col items-center">
                      <span className="text-3xl font-bold text-gray-600 mb-2">{lastCared}건</span>
                      <div 
                        className="w-32 bg-gray-400 rounded-t-lg transition-all duration-500"
                        style={{ height: `${(lastCared / maxCaredValue) * 220}px` }}
                      />
                      <span className="mt-3 text-lg text-gray-600 font-medium">지난 주</span>
                      <span className="text-base text-gray-400">({LAST_WEEK.label})</span>
                    </div>
                    
                    {/* 이번주 바 */}
                    <div className="flex flex-col items-center">
                      <span className="text-3xl font-bold text-orange-600 mb-2">{thisCared}건</span>
                      <div 
                        className="w-32 bg-orange-500 rounded-t-lg transition-all duration-500"
                        style={{ height: `${(thisCared / maxCaredValue) * 220}px` }}
                      />
                      <span className="mt-3 text-lg text-gray-600 font-medium">이번 주</span>
                      <span className="text-base text-gray-400">({THIS_WEEK.label})</span>
                    </div>
                  </div>

                  {/* 증감 표시 */}
                  <div className="flex justify-center mt-2">
                    <div className={`px-8 py-3 rounded-full text-white font-bold text-lg ${
                      isCaredIncrease ? 'bg-green-500' : 'bg-red-500'
                    }`}>
                      {isCaredIncrease ? '▲' : '▼'} {isCaredIncrease ? '증가' : '감소'}: {Math.abs(caredDiff)}건 ({isCaredIncrease ? '+' : ''}{caredDiffPercent}%)
                    </div>
                  </div>
                </div>
              );
            })()
          )}
        </div>

        {/* 케어드 문의 Contact Rate */}
        {!loading && (
          <div className="bg-gray-50 rounded-xl p-6 flex-1">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-semibold text-gray-700">케어드 문의 Contact Rate</h3>
          </div>
          
          {/* Contact Rate 정의 */}
          <div className="flex justify-end mb-4">
            <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">
              케어드 Contact Rate = 케어드 문의건수 ÷ (케어드 주문건수 + 백신청자수)
            </span>
          </div>
          
          {(() => {
            // 케어드 Contact Rate 계산 (케어드 문의건수 ÷ (케어드 주문건수 + 백신청자수))
            const lastCared = lastWeekData?.cared || 0;
            const thisCared = thisWeekData?.cared || 0;
            const lastCaredOrders = lastWeekData?.contactRateData?.caredOrders || 0;
            const thisCaredOrders = thisWeekData?.contactRateData?.caredOrders || 0;
            const lastBagRequesters = lastWeekData?.contactRateData?.bagRequesters || 0;
            const thisBagRequesters = thisWeekData?.contactRateData?.bagRequesters || 0;
            
            const lastCaredDenominator = lastCaredOrders + lastBagRequesters;
            const thisCaredDenominator = thisCaredOrders + thisBagRequesters;
            const lastCaredContactRate = lastCaredDenominator > 0 ? (lastCared / lastCaredDenominator) * 100 : 0;
            const thisCaredContactRate = thisCaredDenominator > 0 ? (thisCared / thisCaredDenominator) * 100 : 0;
            const caredContactRateDiff = thisCaredContactRate - lastCaredContactRate;
            const maxCaredRate = Math.max(lastCaredContactRate, thisCaredContactRate, 15);

            return (
              <>
                {/* 라인 차트 */}
                <div className="relative h-48 mb-6">
                  {/* Y축 레이블 */}
                  <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-xs text-gray-400 w-8">
                    <span>{maxCaredRate.toFixed(0)}%</span>
                    <span>{(maxCaredRate / 2).toFixed(0)}%</span>
                    <span>0%</span>
                  </div>
                  
                  {/* 차트 영역 */}
                  <div className="ml-10 h-full border-l border-b border-gray-300 relative">
                    {/* 라인 */}
                    <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                      <line 
                        x1="20%" 
                        y1={`${100 - (lastCaredContactRate / maxCaredRate) * 100}%`}
                        x2="80%" 
                        y2={`${100 - (thisCaredContactRate / maxCaredRate) * 100}%`}
                        stroke="#F97316" 
                        strokeWidth="2" 
                        strokeDasharray="5,5"
                      />
                    </svg>
                    
                    {/* 포인트 - 지난주 */}
                    <div 
                      className="absolute w-3 h-3 bg-gray-500 rounded-full transform -translate-x-1/2 -translate-y-1/2"
                      style={{ left: '20%', top: `${100 - (lastCaredContactRate / maxCaredRate) * 100}%` }}
                    />
                    <div 
                      className="absolute text-sm font-semibold text-gray-600 transform -translate-x-1/2 bg-gray-50 px-1 rounded"
                      style={{ left: '20%', top: `${Math.max(100 - (lastCaredContactRate / maxCaredRate) * 100 - 15, 0)}%` }}
                    >
                      {lastCaredContactRate.toFixed(1)}%
                    </div>
                    
                    {/* 포인트 - 이번주 */}
                    <div 
                      className="absolute w-3 h-3 bg-orange-500 rounded-full transform -translate-x-1/2 -translate-y-1/2"
                      style={{ left: '80%', top: `${100 - (thisCaredContactRate / maxCaredRate) * 100}%` }}
                    />
                    <div 
                      className="absolute text-sm font-semibold text-orange-500 transform -translate-x-1/2 bg-gray-50 px-1 rounded"
                      style={{ left: '80%', top: `${Math.max(100 - (thisCaredContactRate / maxCaredRate) * 100 - 15, 0)}%` }}
                    >
                      {thisCaredContactRate.toFixed(1)}%
                    </div>
                  </div>
                  
                  {/* X축 레이블 */}
                  <div className="ml-10 flex justify-between mt-2 text-xs text-gray-500">
                    <span className="ml-[15%]">지난 주 ({LAST_WEEK.label})</span>
                    <span className="mr-[15%]">이번 주 ({THIS_WEEK.label})</span>
                  </div>
                </div>

                {/* Contact Rate 상세 */}
                <div className="bg-white rounded-lg p-4 text-sm">
                  <div className="mb-4">
                    <p className="font-semibold text-gray-700 mb-2">• 지난 주 케어드 Contact Rate : {lastCaredContactRate.toFixed(1)}%</p>
                    <div className="ml-4 text-gray-600">
                      <p className="mb-1">◦ 케어드 문의건수 : {lastCared}건</p>
                      <p className="mb-1">◦ <span className="underline">케어드 주문수 : {lastCaredOrders.toLocaleString()}건</span> + <span className="underline">백 신청자 수 : {lastBagRequesters.toLocaleString()}건</span> = <span className="font-semibold">{lastCaredDenominator.toLocaleString()}건</span></p>
                    </div>
                  </div>
                  
                  <div>
                    <p className="font-semibold text-gray-700 mb-2">
                      • 이번 주 케어드 Contact Rate : {thisCaredContactRate.toFixed(1)}% 
                      <span className={`ml-2 ${caredContactRateDiff >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                        ({caredContactRateDiff >= 0 ? '+' : ''}{caredContactRateDiff.toFixed(1)}%P WOW)
                      </span>
                    </p>
                    <div className="ml-4 text-gray-600">
                      <p className="mb-1">◦ 케어드 문의건수 : {thisCared}건</p>
                      <p className="mb-1">◦ <span className="underline">케어드 주문수 : {thisCaredOrders.toLocaleString()}건</span> + <span className="underline">백 신청자 수 : {thisBagRequesters.toLocaleString()}건</span> = <span className="font-semibold">{thisCaredDenominator.toLocaleString()}건</span></p>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
        )}
      </div>

      {/* 케어드 판매자/구매자 상세 (확장 시) */}
      {caredExpanded && !loading && (
        <div className="mb-6 border-l-4 border-orange-400 pl-4">
          <h4 className="text-md font-semibold text-orange-600 mb-4">📊 케어드 문의 상세 분류</h4>
          
          {/* 케어드 판매자 문의량 + Contact Rate */}
          <div className="flex gap-6 mb-4">
            {/* 케어드 판매자 문의량 */}
            <div className="bg-orange-50 rounded-xl p-4 flex-1">
              <h5 className="text-md font-semibold text-orange-700 mb-3">판매 고객님 문의량 주간비교</h5>
              {(() => {
                const lastSeller = lastWeekData?.caredSellerBuyerData?.caredSeller || 0;
                const thisSeller = thisWeekData?.caredSellerBuyerData?.caredSeller || 0;
                const sellerDiff = thisSeller - lastSeller;
                const sellerDiffPercent = lastSeller > 0 ? ((sellerDiff / lastSeller) * 100).toFixed(1) : '0';
                const isSellerIncrease = sellerDiff >= 0;
                const maxSeller = Math.max(lastSeller, thisSeller, 1);
                
                return (
                  <div className="flex flex-col">
                    <div className="flex items-end justify-center gap-12 mb-3">
                      <div className="flex flex-col items-center">
                        <span className="text-xl font-bold text-gray-600 mb-1">{lastSeller}건</span>
                        <div className="w-20 bg-gray-400 rounded-t-lg" style={{ height: `${(lastSeller / maxSeller) * 80}px` }} />
                        <span className="mt-2 text-sm text-gray-500">지난주 ({LAST_WEEK.label})</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-xl font-bold text-orange-600 mb-1">{thisSeller}건</span>
                        <div className="w-20 bg-orange-500 rounded-t-lg" style={{ height: `${(thisSeller / maxSeller) * 80}px` }} />
                        <span className="mt-2 text-sm text-gray-500">이번주 ({THIS_WEEK.label})</span>
                      </div>
                    </div>
                    <div className="flex justify-center">
                      <span className={`px-4 py-1 rounded-full text-white text-sm font-medium ${isSellerIncrease ? 'bg-green-500' : 'bg-red-500'}`}>
                        {isSellerIncrease ? '▲' : '▼'} {Math.abs(sellerDiff)}건 ({isSellerIncrease ? '+' : ''}{sellerDiffPercent}%)
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
            
            {/* 케어드 판매자 Contact Rate */}
            <div className="bg-orange-50 rounded-xl p-4 flex-1">
              <h5 className="text-md font-semibold text-orange-700 mb-3">판매자 Contact Rate</h5>
              <p className="text-xs text-orange-500 mb-2">= 판매자 문의건수 ÷ 백신청자수</p>
              {(() => {
                const lastSeller = lastWeekData?.caredSellerBuyerData?.caredSeller || 0;
                const thisSeller = thisWeekData?.caredSellerBuyerData?.caredSeller || 0;
                const lastBag = lastWeekData?.contactRateData?.bagRequesters || 1;
                const thisBag = thisWeekData?.contactRateData?.bagRequesters || 1;
                const lastRate = (lastSeller / lastBag) * 100;
                const thisRate = (thisSeller / thisBag) * 100;
                const rateDiff = thisRate - lastRate;
                
                return (
                  <div className="flex flex-col items-center">
                    <div className="flex gap-8 mb-3">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-gray-600">{lastRate.toFixed(2)}%</p>
                        <p className="text-xs text-gray-500">지난주</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-orange-600">{thisRate.toFixed(2)}%</p>
                        <p className="text-xs text-gray-500">이번주</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded text-xs font-medium ${rateDiff >= 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                      {rateDiff >= 0 ? '+' : ''}{rateDiff.toFixed(2)}%P WOW
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
          
          {/* 케어드 구매자 문의량 + Contact Rate */}
          <div className="flex gap-6">
            {/* 케어드 구매자 문의량 */}
            <div className="bg-blue-50 rounded-xl p-4 flex-1">
              <h5 className="text-md font-semibold text-blue-700 mb-3">구매 고객님 문의량 주간비교</h5>
              {(() => {
                const lastBuyer = lastWeekData?.caredSellerBuyerData?.caredBuyer || 0;
                const thisBuyer = thisWeekData?.caredSellerBuyerData?.caredBuyer || 0;
                const buyerDiff = thisBuyer - lastBuyer;
                const buyerDiffPercent = lastBuyer > 0 ? ((buyerDiff / lastBuyer) * 100).toFixed(1) : '0';
                const isBuyerIncrease = buyerDiff >= 0;
                const maxBuyer = Math.max(lastBuyer, thisBuyer, 1);
                
                return (
                  <div className="flex flex-col">
                    <div className="flex items-end justify-center gap-12 mb-3">
                      <div className="flex flex-col items-center">
                        <span className="text-xl font-bold text-gray-600 mb-1">{lastBuyer}건</span>
                        <div className="w-20 bg-gray-400 rounded-t-lg" style={{ height: `${(lastBuyer / maxBuyer) * 80}px` }} />
                        <span className="mt-2 text-sm text-gray-500">지난주 ({LAST_WEEK.label})</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-xl font-bold text-blue-600 mb-1">{thisBuyer}건</span>
                        <div className="w-20 bg-blue-500 rounded-t-lg" style={{ height: `${(thisBuyer / maxBuyer) * 80}px` }} />
                        <span className="mt-2 text-sm text-gray-500">이번주 ({THIS_WEEK.label})</span>
                      </div>
                    </div>
                    <div className="flex justify-center">
                      <span className={`px-4 py-1 rounded-full text-white text-sm font-medium ${isBuyerIncrease ? 'bg-green-500' : 'bg-red-500'}`}>
                        {isBuyerIncrease ? '▲' : '▼'} {Math.abs(buyerDiff)}건 ({isBuyerIncrease ? '+' : ''}{buyerDiffPercent}%)
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
            
            {/* 케어드 구매자 Contact Rate */}
            <div className="bg-blue-50 rounded-xl p-4 flex-1">
              <h5 className="text-md font-semibold text-blue-700 mb-3">구매자 Contact Rate</h5>
              <p className="text-xs text-blue-500 mb-2">= 구매자 문의건수 ÷ 케어드 주문건수</p>
              {(() => {
                const lastBuyer = lastWeekData?.caredSellerBuyerData?.caredBuyer || 0;
                const thisBuyer = thisWeekData?.caredSellerBuyerData?.caredBuyer || 0;
                const lastOrders = lastWeekData?.contactRateData?.caredOrders || 1;
                const thisOrders = thisWeekData?.contactRateData?.caredOrders || 1;
                const lastRate = (lastBuyer / lastOrders) * 100;
                const thisRate = (thisBuyer / thisOrders) * 100;
                const rateDiff = thisRate - lastRate;
                
                return (
                  <div className="flex flex-col items-center">
                    <div className="flex gap-8 mb-3">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-gray-600">{lastRate.toFixed(2)}%</p>
                        <p className="text-xs text-gray-500">지난주</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-blue-600">{thisRate.toFixed(2)}%</p>
                        <p className="text-xs text-gray-500">이번주</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded text-xs font-medium ${rateDiff >= 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                      {rateDiff >= 0 ? '+' : ''}{rateDiff.toFixed(2)}%P WOW
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
          
          {/* 미분류 문의량 */}
          <div className="flex gap-6 mt-4">
            <div className="bg-gray-100 rounded-xl p-4 flex-1">
              <h5 className="text-md font-semibold text-gray-600 mb-3">미분류 문의량 주간비교</h5>
              <p className="text-xs text-gray-400 mb-2">판매자/구매자 태그가 없는 문의</p>
              {(() => {
                const lastUnclassified = lastWeekData?.caredSellerBuyerData?.caredUnclassified || 0;
                const thisUnclassified = thisWeekData?.caredSellerBuyerData?.caredUnclassified || 0;
                const unclassifiedDiff = thisUnclassified - lastUnclassified;
                const unclassifiedDiffPercent = lastUnclassified > 0 ? ((unclassifiedDiff / lastUnclassified) * 100).toFixed(1) : '0';
                const isUnclassifiedIncrease = unclassifiedDiff >= 0;
                const maxUnclassified = Math.max(lastUnclassified, thisUnclassified, 1);
                
                return (
                  <div className="flex flex-col">
                    <div className="flex items-end justify-center gap-12 mb-3">
                      <div className="flex flex-col items-center">
                        <span className="text-xl font-bold text-gray-500 mb-1">{lastUnclassified}건</span>
                        <div className="w-20 bg-gray-400 rounded-t-lg" style={{ height: `${(lastUnclassified / maxUnclassified) * 80}px` }} />
                        <span className="mt-2 text-sm text-gray-500">지난주 ({LAST_WEEK.label})</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-xl font-bold text-gray-600 mb-1">{thisUnclassified}건</span>
                        <div className="w-20 bg-gray-500 rounded-t-lg" style={{ height: `${(thisUnclassified / maxUnclassified) * 80}px` }} />
                        <span className="mt-2 text-sm text-gray-500">이번주 ({THIS_WEEK.label})</span>
                      </div>
                    </div>
                    <div className="flex justify-center">
                      <span className={`px-4 py-1 rounded-full text-white text-sm font-medium ${isUnclassifiedIncrease ? 'bg-green-500' : 'bg-red-500'}`}>
                        {isUnclassifiedIncrease ? '▲' : '▼'} {Math.abs(unclassifiedDiff)}건 ({isUnclassifiedIncrease ? '+' : ''}{unclassifiedDiffPercent}%)
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="flex-1"></div>
          </div>
        </div>
      )}

      {/* 마켓 문의량 + Contact Rate 양옆 배치 */}
      <div className="flex gap-6 mb-6">
        {/* 마켓 문의량 주간비교 */}
        <div className="bg-gray-50 rounded-xl p-6 flex-1 flex flex-col">
          <h3 
            className="text-lg font-semibold text-gray-700 mb-4 cursor-pointer hover:text-green-600 flex items-center gap-2"
            onClick={() => setMarketExpanded(!marketExpanded)}
          >
            마켓 문의량 주간비교
            <span className="text-sm font-normal text-gray-400">{marketExpanded ? '▼' : '▶'} 클릭하여 상세보기</span>
          </h3>
          
          {loading ? (
            <div className="flex items-center justify-center flex-1">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
              <span className="ml-2 text-gray-500">데이터 로딩 중...</span>
            </div>
          ) : (
            (() => {
              const lastMarket = lastWeekData?.market || 0;
              const thisMarket = thisWeekData?.market || 0;
              const marketDiff = thisMarket - lastMarket;
              const marketDiffPercent = lastMarket > 0 ? ((marketDiff / lastMarket) * 100).toFixed(1) : '0';
              const isMarketIncrease = marketDiff >= 0;
              const maxMarketValue = Math.max(lastMarket, thisMarket, 1);

              return (
                <div className="flex flex-col flex-1 justify-end">
                  {/* 바 차트 */}
                  <div className="flex items-end justify-center gap-20 mb-4">
                    {/* 지난주 바 */}
                    <div className="flex flex-col items-center">
                      <span className="text-3xl font-bold text-gray-600 mb-2">{lastMarket}건</span>
                      <div 
                        className="w-32 bg-gray-400 rounded-t-lg transition-all duration-500"
                        style={{ height: `${(lastMarket / maxMarketValue) * 220}px` }}
                      />
                      <span className="mt-3 text-lg text-gray-600 font-medium">지난 주</span>
                      <span className="text-base text-gray-400">({LAST_WEEK.label})</span>
                    </div>
                    
                    {/* 이번주 바 */}
                    <div className="flex flex-col items-center">
                      <span className="text-3xl font-bold text-green-600 mb-2">{thisMarket}건</span>
                      <div 
                        className="w-32 bg-green-500 rounded-t-lg transition-all duration-500"
                        style={{ height: `${(thisMarket / maxMarketValue) * 220}px` }}
                      />
                      <span className="mt-3 text-lg text-gray-600 font-medium">이번 주</span>
                      <span className="text-base text-gray-400">({THIS_WEEK.label})</span>
                    </div>
                  </div>

                  {/* 증감 표시 */}
                  <div className="flex justify-center mt-2">
                    <div className={`px-8 py-3 rounded-full text-white font-bold text-lg ${
                      isMarketIncrease ? 'bg-green-500' : 'bg-red-500'
                    }`}>
                      {isMarketIncrease ? '▲' : '▼'} {isMarketIncrease ? '증가' : '감소'}: {Math.abs(marketDiff)}건 ({isMarketIncrease ? '+' : ''}{marketDiffPercent}%)
                    </div>
                  </div>
                </div>
              );
            })()
          )}
        </div>

        {/* 마켓 문의 Contact Rate */}
        {!loading && (
          <div className="bg-gray-50 rounded-xl p-6 flex-1">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-semibold text-gray-700">마켓 문의 Contact Rate</h3>
          </div>
          
          {/* Contact Rate 정의 */}
          <div className="flex justify-end mb-4">
            <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
              마켓 Contact Rate = 마켓 문의건수 ÷ 마켓 주문건수
            </span>
          </div>
          
          {(() => {
            // 마켓 Contact Rate 계산 (마켓 문의건수 ÷ 마켓 주문건수)
            const lastMarket = lastWeekData?.market || 0;
            const thisMarket = thisWeekData?.market || 0;
            const lastMarketOrders = lastWeekData?.contactRateData?.marketOrders || 0;
            const thisMarketOrders = thisWeekData?.contactRateData?.marketOrders || 0;
            
            const lastMarketContactRate = lastMarketOrders > 0 ? (lastMarket / lastMarketOrders) * 100 : 0;
            const thisMarketContactRate = thisMarketOrders > 0 ? (thisMarket / thisMarketOrders) * 100 : 0;
            const marketContactRateDiff = thisMarketContactRate - lastMarketContactRate;
            const maxMarketRate = Math.max(lastMarketContactRate, thisMarketContactRate, 15);

            return (
              <>
                {/* 라인 차트 */}
                <div className="relative h-48 mb-6">
                  {/* Y축 레이블 */}
                  <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-xs text-gray-400 w-8">
                    <span>{maxMarketRate.toFixed(0)}%</span>
                    <span>{(maxMarketRate / 2).toFixed(0)}%</span>
                    <span>0%</span>
                  </div>
                  
                  {/* 차트 영역 */}
                  <div className="ml-10 h-full border-l border-b border-gray-300 relative">
                    {/* 라인 */}
                    <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                      <line 
                        x1="20%" 
                        y1={`${100 - (lastMarketContactRate / maxMarketRate) * 100}%`}
                        x2="80%" 
                        y2={`${100 - (thisMarketContactRate / maxMarketRate) * 100}%`}
                        stroke="#22C55E" 
                        strokeWidth="2" 
                        strokeDasharray="5,5"
                      />
                    </svg>
                    
                    {/* 포인트 - 지난주 */}
                    <div 
                      className="absolute w-3 h-3 bg-gray-500 rounded-full transform -translate-x-1/2 -translate-y-1/2"
                      style={{ left: '20%', top: `${100 - (lastMarketContactRate / maxMarketRate) * 100}%` }}
                    />
                    <div 
                      className="absolute text-sm font-semibold text-gray-600 transform -translate-x-1/2 bg-gray-50 px-1 rounded"
                      style={{ left: '20%', top: `${Math.max(100 - (lastMarketContactRate / maxMarketRate) * 100 - 15, 0)}%` }}
                    >
                      {lastMarketContactRate.toFixed(1)}%
                    </div>
                    
                    {/* 포인트 - 이번주 */}
                    <div 
                      className="absolute w-3 h-3 bg-green-500 rounded-full transform -translate-x-1/2 -translate-y-1/2"
                      style={{ left: '80%', top: `${100 - (thisMarketContactRate / maxMarketRate) * 100}%` }}
                    />
                    <div 
                      className="absolute text-sm font-semibold text-green-500 transform -translate-x-1/2 bg-gray-50 px-1 rounded"
                      style={{ left: '80%', top: `${Math.max(100 - (thisMarketContactRate / maxMarketRate) * 100 - 15, 0)}%` }}
                    >
                      {thisMarketContactRate.toFixed(1)}%
                    </div>
                  </div>
                  
                  {/* X축 레이블 */}
                  <div className="ml-10 flex justify-between mt-2 text-xs text-gray-500">
                    <span className="ml-[15%]">지난 주 ({LAST_WEEK.label})</span>
                    <span className="mr-[15%]">이번 주 ({THIS_WEEK.label})</span>
                  </div>
                </div>

                {/* Contact Rate 상세 */}
                <div className="bg-white rounded-lg p-4 text-sm">
                  <div className="mb-4">
                    <p className="font-semibold text-gray-700 mb-2">• 지난 주 마켓 Contact Rate : {lastMarketContactRate.toFixed(1)}%</p>
                    <div className="ml-4 text-gray-600">
                      <p className="mb-1">◦ 마켓 문의건수 : {lastMarket}건 ÷ 마켓 주문수 : {lastMarketOrders.toLocaleString()}건</p>
                    </div>
                  </div>
                  
                  <div>
                    <p className="font-semibold text-gray-700 mb-2">
                      • 이번 주 마켓 Contact Rate : {thisMarketContactRate.toFixed(1)}% 
                      <span className={`ml-2 ${marketContactRateDiff >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                        ({marketContactRateDiff >= 0 ? '+' : ''}{marketContactRateDiff.toFixed(1)}%P WOW)
                      </span>
                    </p>
                    <div className="ml-4 text-gray-600">
                      <p className="mb-1">◦ 마켓 문의건수 : {thisMarket}건 ÷ 마켓 주문수 : {thisMarketOrders.toLocaleString()}건</p>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
        )}
      </div>

      {/* 마켓 판매자/구매자 상세 (확장 시) */}
      {marketExpanded && !loading && (
        <div className="mb-6 border-l-4 border-green-400 pl-4">
          <h4 className="text-md font-semibold text-green-600 mb-4">📊 마켓 문의 상세 분류</h4>
          
          {/* 마켓 판매자 문의량 + Contact Rate */}
          <div className="flex gap-6 mb-4">
            {/* 마켓 판매자 문의량 */}
            <div className="bg-green-50 rounded-xl p-4 flex-1">
              <h5 className="text-md font-semibold text-green-700 mb-3">판매 고객님 문의량 주간비교</h5>
              {(() => {
                const lastSeller = lastWeekData?.marketSellerBuyerData?.marketSeller || 0;
                const thisSeller = thisWeekData?.marketSellerBuyerData?.marketSeller || 0;
                const sellerDiff = thisSeller - lastSeller;
                const sellerDiffPercent = lastSeller > 0 ? ((sellerDiff / lastSeller) * 100).toFixed(1) : '0';
                const isSellerIncrease = sellerDiff >= 0;
                const maxSeller = Math.max(lastSeller, thisSeller, 1);
                
                return (
                  <div className="flex flex-col">
                    <div className="flex items-end justify-center gap-12 mb-3">
                      <div className="flex flex-col items-center">
                        <span className="text-xl font-bold text-gray-600 mb-1">{lastSeller}건</span>
                        <div className="w-20 bg-gray-400 rounded-t-lg" style={{ height: `${Math.max((lastSeller / maxSeller) * 80, 10)}px` }} />
                        <span className="mt-2 text-sm text-gray-500">지난주 ({LAST_WEEK.label})</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-xl font-bold text-green-600 mb-1">{thisSeller}건</span>
                        <div className="w-20 bg-green-500 rounded-t-lg" style={{ height: `${Math.max((thisSeller / maxSeller) * 80, 10)}px` }} />
                        <span className="mt-2 text-sm text-gray-500">이번주 ({THIS_WEEK.label})</span>
                      </div>
                    </div>
                    <div className="flex justify-center">
                      <span className={`px-4 py-1 rounded-full text-white text-sm font-medium ${isSellerIncrease ? 'bg-green-500' : 'bg-red-500'}`}>
                        {isSellerIncrease ? '▲' : '▼'} {Math.abs(sellerDiff)}건 ({isSellerIncrease ? '+' : ''}{sellerDiffPercent}%)
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
            
            {/* 마켓 판매자 Contact Rate */}
            <div className="bg-green-50 rounded-xl p-4 flex-1">
              <h5 className="text-md font-semibold text-green-700 mb-3">판매자 Contact Rate</h5>
              <p className="text-xs text-green-500 mb-2">= 판매자 문의건수 ÷ 마켓 주문수</p>
              {(() => {
                const lastSeller = lastWeekData?.marketSellerBuyerData?.marketSeller || 0;
                const thisSeller = thisWeekData?.marketSellerBuyerData?.marketSeller || 0;
                const lastOrders = lastWeekData?.contactRateData?.marketOrders || 1;
                const thisOrders = thisWeekData?.contactRateData?.marketOrders || 1;
                const lastRate = (lastSeller / lastOrders) * 100;
                const thisRate = (thisSeller / thisOrders) * 100;
                const rateDiff = thisRate - lastRate;
                
                return (
                  <div className="flex flex-col items-center">
                    <div className="flex gap-8 mb-3">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-gray-600">{lastRate.toFixed(2)}%</p>
                        <p className="text-xs text-gray-500">지난주</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-green-600">{thisRate.toFixed(2)}%</p>
                        <p className="text-xs text-gray-500">이번주</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded text-xs font-medium ${rateDiff >= 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                      {rateDiff >= 0 ? '+' : ''}{rateDiff.toFixed(2)}%P WOW
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
          
          {/* 마켓 구매자 문의량 + Contact Rate */}
          <div className="flex gap-6 mb-4">
            {/* 마켓 구매자 문의량 */}
            <div className="bg-teal-50 rounded-xl p-4 flex-1">
              <h5 className="text-md font-semibold text-teal-700 mb-3">구매 고객님 문의량 주간비교</h5>
              {(() => {
                const lastBuyer = lastWeekData?.marketSellerBuyerData?.marketBuyer || 0;
                const thisBuyer = thisWeekData?.marketSellerBuyerData?.marketBuyer || 0;
                const buyerDiff = thisBuyer - lastBuyer;
                const buyerDiffPercent = lastBuyer > 0 ? ((buyerDiff / lastBuyer) * 100).toFixed(1) : '0';
                const isBuyerIncrease = buyerDiff >= 0;
                const maxBuyer = Math.max(lastBuyer, thisBuyer, 1);
                
                return (
                  <div className="flex flex-col">
                    <div className="flex items-end justify-center gap-12 mb-3">
                      <div className="flex flex-col items-center">
                        <span className="text-xl font-bold text-gray-600 mb-1">{lastBuyer}건</span>
                        <div className="w-20 bg-gray-400 rounded-t-lg" style={{ height: `${Math.max((lastBuyer / maxBuyer) * 80, 10)}px` }} />
                        <span className="mt-2 text-sm text-gray-500">지난주 ({LAST_WEEK.label})</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-xl font-bold text-teal-600 mb-1">{thisBuyer}건</span>
                        <div className="w-20 bg-teal-500 rounded-t-lg" style={{ height: `${Math.max((thisBuyer / maxBuyer) * 80, 10)}px` }} />
                        <span className="mt-2 text-sm text-gray-500">이번주 ({THIS_WEEK.label})</span>
                      </div>
                    </div>
                    <div className="flex justify-center">
                      <span className={`px-4 py-1 rounded-full text-white text-sm font-medium ${isBuyerIncrease ? 'bg-green-500' : 'bg-red-500'}`}>
                        {isBuyerIncrease ? '▲' : '▼'} {Math.abs(buyerDiff)}건 ({isBuyerIncrease ? '+' : ''}{buyerDiffPercent}%)
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
            
            {/* 마켓 구매자 Contact Rate */}
            <div className="bg-teal-50 rounded-xl p-4 flex-1">
              <h5 className="text-md font-semibold text-teal-700 mb-3">구매자 Contact Rate</h5>
              <p className="text-xs text-teal-500 mb-2">= 구매자 문의건수 ÷ 마켓 주문수</p>
              {(() => {
                const lastBuyer = lastWeekData?.marketSellerBuyerData?.marketBuyer || 0;
                const thisBuyer = thisWeekData?.marketSellerBuyerData?.marketBuyer || 0;
                const lastOrders = lastWeekData?.contactRateData?.marketOrders || 1;
                const thisOrders = thisWeekData?.contactRateData?.marketOrders || 1;
                const lastRate = (lastBuyer / lastOrders) * 100;
                const thisRate = (thisBuyer / thisOrders) * 100;
                const rateDiff = thisRate - lastRate;
                
                return (
                  <div className="flex flex-col items-center">
                    <div className="flex gap-8 mb-3">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-gray-600">{lastRate.toFixed(2)}%</p>
                        <p className="text-xs text-gray-500">지난주</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-teal-600">{thisRate.toFixed(2)}%</p>
                        <p className="text-xs text-gray-500">이번주</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded text-xs font-medium ${rateDiff >= 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                      {rateDiff >= 0 ? '+' : ''}{rateDiff.toFixed(2)}%P WOW
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
          
          {/* 미분류 문의량 */}
          <div className="flex gap-6">
            <div className="bg-gray-100 rounded-xl p-4 flex-1">
              <h5 className="text-md font-semibold text-gray-600 mb-3">미분류 문의량 주간비교</h5>
              <p className="text-xs text-gray-400 mb-2">판매자/구매자 태그가 없는 문의</p>
              {(() => {
                const lastUnclassified = lastWeekData?.marketSellerBuyerData?.marketUnclassified || 0;
                const thisUnclassified = thisWeekData?.marketSellerBuyerData?.marketUnclassified || 0;
                const unclassifiedDiff = thisUnclassified - lastUnclassified;
                const unclassifiedDiffPercent = lastUnclassified > 0 ? ((unclassifiedDiff / lastUnclassified) * 100).toFixed(1) : '0';
                const isUnclassifiedIncrease = unclassifiedDiff >= 0;
                const maxUnclassified = Math.max(lastUnclassified, thisUnclassified, 1);
                
                return (
                  <div className="flex flex-col">
                    <div className="flex items-end justify-center gap-12 mb-3">
                      <div className="flex flex-col items-center">
                        <span className="text-xl font-bold text-gray-500 mb-1">{lastUnclassified}건</span>
                        <div className="w-20 bg-gray-400 rounded-t-lg" style={{ height: `${Math.max((lastUnclassified / maxUnclassified) * 80, 10)}px` }} />
                        <span className="mt-2 text-sm text-gray-500">지난주 ({LAST_WEEK.label})</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-xl font-bold text-gray-600 mb-1">{thisUnclassified}건</span>
                        <div className="w-20 bg-gray-500 rounded-t-lg" style={{ height: `${Math.max((thisUnclassified / maxUnclassified) * 80, 10)}px` }} />
                        <span className="mt-2 text-sm text-gray-500">이번주 ({THIS_WEEK.label})</span>
                      </div>
                    </div>
                    <div className="flex justify-center">
                      <span className={`px-4 py-1 rounded-full text-white text-sm font-medium ${isUnclassifiedIncrease ? 'bg-green-500' : 'bg-red-500'}`}>
                        {isUnclassifiedIncrease ? '▲' : '▼'} {Math.abs(unclassifiedDiff)}건 ({isUnclassifiedIncrease ? '+' : ''}{unclassifiedDiffPercent}%)
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="flex-1"></div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'daily' | 'pastDaily' | 'weekly' | 'roadmap'>('daily');
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
      
      const res = await fetch(url, { cache: 'no-store' });
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
  }, []);

  // 5분마다 자동 새로고침 (daily 탭일 때만)
  useEffect(() => {
    if (activeTab !== 'daily') return;
    
    const interval = setInterval(() => {
      fetchData();
    }, 5 * 60 * 1000);  // 5분마다
    
    return () => clearInterval(interval);
  }, [activeTab]);

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
              <span>마지막 업데이트: {lastUpdated} · 5분마다 자동 갱신</span>
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
          
          {/* 로드맵리뷰 탭 */}
          <div className="flex bg-white/10 rounded-lg p-1 ml-auto">
            <button
              onClick={() => setActiveTab('roadmap')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === 'roadmap'
                  ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white'
                  : 'text-white hover:bg-white/10'
              }`}
            >
              🗺️ 로드맵리뷰
            </button>
          </div>
          
          {/* 현재 기간 표시 */}
          {activeTab !== 'roadmap' && (
            <span className="text-yellow-300 font-semibold ml-2">
              {displayPeriod}
            </span>
          )}
        </div>
      </div>

      {/* 로드맵리뷰 탭 컨텐츠 */}
      {activeTab === 'roadmap' && (
        <RoadmapReview />
      )}

      {/* 기존 대시보드 컨텐츠 - 로드맵 탭이 아닐 때만 표시 */}
      {activeTab !== 'roadmap' && (
        <>
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
            <div className="bg-white rounded-xl p-4 shadow-lg min-w-0">
              <p className="text-gray-500 text-sm">{activeTab !== 'weekly' ? '오늘 문의건수 / 어제' : '주간 문의건수 / 전주'}</p>
              <p className="text-xl font-bold whitespace-nowrap">
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
                // Weekly: 일별 차트 - selectedWeek에 따라 날짜 동적 생성
                (() => {
                  // selectedWeek.start ~ selectedWeek.end 기간의 날짜들 생성
                  const startDate = new Date(selectedWeek.start);
                  const endDate = new Date(selectedWeek.end);
                  const dates: string[] = [];
                  const dateLabels: string[] = [];
                  const current = new Date(startDate);
                  while (current <= endDate) {
                    const dateStr = current.toISOString().split('T')[0];
                    dates.push(dateStr);
                    dateLabels.push(`${current.getMonth() + 1}/${current.getDate()}`);
                    current.setDate(current.getDate() + 1);
                  }
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

      {/* 주간 트래커 - 하단 동그라미 14개 (1차 해결률 7개 + 해결률&해결시간 7개) */}
      {activeTab !== 'weekly' && (
        <div className="-mt-2 py-2">
          <div className="flex justify-center items-start gap-8">
            {/* 1차 해결률 트래커 (7개) */}
            <div className="flex flex-col items-center">
              {(() => {
                // 오늘 포함 최근 7일 동적 계산
                const kstNow = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
                const todayDate = kstNow.getUTCDate();
                const todayMonth = kstNow.getUTCMonth() + 1;
                const todayStr = `${todayMonth}/${todayDate}`;
                
                const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
                const weekDays: { date: string; day: string; fullDate: string }[] = [];
                
                for (let i = 6; i >= 0; i--) {
                  const d = new Date(kstNow);
                  d.setUTCDate(d.getUTCDate() - i);
                  const month = d.getUTCMonth() + 1;
                  const day = d.getUTCDate();
                  const dayOfWeek = d.getUTCDay();
                  weekDays.push({
                    date: `${month}/${day}`,
                    day: dayNames[dayOfWeek],
                    fullDate: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  });
                }
                
                const firstDay = weekDays[0].date;
                const lastDay = weekDays[6].date;
                
                // 1차 해결률 데이터 (API에서 가져옴)
                const firstResolutionData: Record<string, { rate: number; assigned: number }> = {};
                if (stats?.firstResolutionRates) {
                  stats.firstResolutionRates.forEach(item => {
                    const [year, month, day] = item.date.split('-');
                    const key = `${parseInt(month)}/${parseInt(day)}`;
                    firstResolutionData[key] = { rate: item.rate, assigned: item.assigned };
                  });
                }
                
                return (
                  <>
                    <h3 className="text-white font-bold mb-3 text-center text-lg">🎯 1차 해결률 ({firstDay} ~ {lastDay})</h3>
                    <div className="flex items-end gap-4">
                      {weekDays.map((item, idx) => {
                        const isToday = item.date === todayStr;
                        const data = firstResolutionData[item.date];
                        const hasData = !!data;
                        const isPast = idx < 6;  // 마지막(오늘) 제외하고 모두 과거
                        
                        return (
                          <div key={idx} className="flex flex-col items-center">
                            {isToday && (
                              <span className="bg-emerald-500 text-white text-xs font-bold px-2 py-0.5 rounded-full mb-2 animate-pulse">
                                TODAY
                              </span>
                            )}
                            {!isToday && <div className="h-6 mb-2"></div>}
                            
                            <div className={`w-16 h-16 rounded-full flex flex-col items-center justify-center shadow-lg border-4 ${
                              isToday 
                                ? 'bg-gradient-to-br from-emerald-500 to-teal-600 border-emerald-300 text-white' 
                                : hasData
                                  ? 'bg-gradient-to-br from-cyan-500 to-blue-600 border-cyan-300 text-white'
                                  : isPast 
                                    ? 'bg-gradient-to-br from-gray-400 to-gray-500 border-gray-300 text-white'
                                    : 'bg-gradient-to-br from-gray-600 to-gray-700 border-gray-500 text-gray-300'
                            }`}>
                              <span className="text-sm font-bold">{hasData ? `${data.rate}%` : '-'}</span>
                              <span className="text-[10px]">{hasData ? `${data.assigned}건` : '-'}</span>
                            </div>
                            
                            <span className={`mt-1 text-xs font-medium ${isToday ? 'text-emerald-300' : 'text-white/80'}`}>
                              {item.date}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-center text-white/50 text-[10px] mt-2">* 1차 해결률(%) / 담당자 배정건</p>
                    <p className="text-center text-white/40 text-[9px] mt-1 max-w-xs">정의: 당일 문의 중 담당자 배정 건 기준, 당일 19시 전 해결 비율</p>
                  </>
                );
              })()}
            </div>

            {/* 구분선 */}
            <div className="h-32 w-px bg-white/30 self-center"></div>

            {/* 해결률 & 해결시간 트래커 (7개) */}
            <div className="flex flex-col items-center">
              {(() => {
                // 오늘 포함 최근 7일 동적 계산
                const kstNow = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
                const todayDate = kstNow.getUTCDate();
                const todayMonth = kstNow.getUTCMonth() + 1;
                const todayStr = `${todayMonth}/${todayDate}`;
                
                const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
                const weekDays: { date: string; day: string; fullDate: string }[] = [];
                
                for (let i = 6; i >= 0; i--) {
                  const d = new Date(kstNow);
                  d.setUTCDate(d.getUTCDate() - i);
                  const month = d.getUTCMonth() + 1;
                  const day = d.getUTCDate();
                  const dayOfWeek = d.getUTCDay();
                  weekDays.push({
                    date: `${month}/${day}`,
                    day: dayNames[dayOfWeek],
                    fullDate: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  });
                }
                
                const firstDay = weekDays[0].date;
                const lastDay = weekDays[6].date;
                const yesterdayStr = weekDays[5].date;  // 6번째가 어제
                
                return (
                  <>
                    <h3 className="text-white font-bold mb-3 text-center text-lg">📅 해결률 & 해결시간 ({firstDay} ~ {lastDay})</h3>
                    <div className="flex items-end gap-4">
                      {weekDays.map((item, idx) => {
                        const isToday = item.date === todayStr;
                        const isYesterday = item.date === yesterdayStr;
                        const isPast = idx < 6;  // 마지막(오늘) 제외하고 모두 과거
                        
                        let resolutionRate: string | number = '-';
                        let resolutionTime: string | number = '-';
                        
                        // dailyResolutionStats에서 해당 날짜 데이터 찾기
                        const dayData = stats?.dailyResolutionStats?.find(s => s.date === item.fullDate);
                        
                        if (dayData) {
                          resolutionRate = dayData.resolutionRate;
                          resolutionTime = dayData.avgResolutionTimeMin;
                        } else if (isToday) {
                          // fallback: 오늘 데이터가 아직 dailyResolutionStats에 없으면 today 사용
                          resolutionRate = stats?.today.resolutionRate || 0;
                          resolutionTime = (stats?.today.avgResolutionTimeMin || 0).toFixed(0);
                        }
                        
                        return (
                          <div key={idx} className="flex flex-col items-center">
                            {isToday && (
                              <span className="bg-rose-500 text-white text-xs font-bold px-2 py-0.5 rounded-full mb-2 animate-pulse">
                                TODAY
                              </span>
                            )}
                            {!isToday && <div className="h-6 mb-2"></div>}
                            
                            <div className={`w-16 h-16 rounded-full flex flex-col items-center justify-center shadow-lg border-4 ${
                              isToday 
                                ? 'bg-gradient-to-br from-rose-500 to-pink-600 border-rose-300 text-white' 
                                : isYesterday
                                  ? 'bg-gradient-to-br from-indigo-500 to-purple-600 border-indigo-300 text-white'
                                  : isPast 
                                    ? 'bg-gradient-to-br from-gray-400 to-gray-500 border-gray-300 text-white'
                                    : 'bg-gradient-to-br from-gray-600 to-gray-700 border-gray-500 text-gray-300'
                            }`}>
                              <span className="text-sm font-bold">{resolutionRate !== '-' ? `${resolutionRate}%` : '-'}</span>
                              <span className="text-[10px]">{resolutionTime !== '-' ? `${resolutionTime}분` : '-'}</span>
                            </div>
                            
                            <span className={`mt-1 text-xs font-medium ${isToday ? 'text-rose-300' : 'text-white/80'}`}>
                              {item.date}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-center text-white/50 text-[10px] mt-2">* 해결률(%) / 평균해결시간(분)</p>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
