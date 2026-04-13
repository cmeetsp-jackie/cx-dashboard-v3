'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface MonthlyNPS {
  month: string;
  nps: number;
  promoters: number;
  passives: number;
  detractors: number;
  total: number;
}

interface Comment {
  score: number;
  text: string;
  date: string;
}

interface SheetData {
  label: string;
  type: string;
  category: string;
  overall: { nps: number; promoters: number; passives: number; detractors: number; total: number } | null;
  monthly: MonthlyNPS[];
  recentComments: Comment[];
  error: string | null;
}

function NPSScore({ nps }: { nps: number }) {
  const color = nps >= 50 ? 'text-green-600' : nps >= 20 ? 'text-yellow-600' : nps >= 0 ? 'text-orange-500' : 'text-red-600';
  return (
    <div className={`text-4xl font-black ${color}`}>
      {nps > 0 ? '+' : ''}{nps}
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 9 ? 'bg-green-100 text-green-700' : score >= 7 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
  return <span className={`${color} text-xs font-bold px-1.5 py-0.5 rounded shrink-0`}>{score}</span>;
}

function RatioBar({ promoters, passives, detractors, total }: { promoters: number; passives: number; detractors: number; total: number }) {
  if (total === 0) return null;
  return (
    <div className="flex h-2 rounded-full overflow-hidden w-full">
      <div className="bg-green-400" style={{ width: `${(promoters / total) * 100}%` }} />
      <div className="bg-yellow-300" style={{ width: `${(passives / total) * 100}%` }} />
      <div className="bg-red-400" style={{ width: `${(detractors / total) * 100}%` }} />
    </div>
  );
}

function MonthlyChart({ monthly }: { monthly: MonthlyNPS[] }) {
  if (monthly.length === 0) return null;
  const recent = monthly.slice(-6);
  const maxTotal = Math.max(...recent.map(m => m.total), 1);
  return (
    <div>
      <p className="text-xs text-gray-400 mb-1">월별 NPS 트렌드</p>
      <div className="flex items-end gap-1 h-20">
        {recent.map((m) => (
          <div key={m.month} className="flex flex-col items-center flex-1 min-w-0">
            <span className="text-[9px] text-gray-500 mb-0.5 font-medium">{m.nps > 0 ? '+' : ''}{m.nps}</span>
            <div className="w-full flex flex-col gap-px">
              <div className="bg-green-400 rounded-t-sm" style={{ height: `${(m.promoters / maxTotal) * 48}px` }} />
              <div className="bg-yellow-300" style={{ height: `${(m.passives / maxTotal) * 48}px` }} />
              <div className="bg-red-400 rounded-b-sm" style={{ height: `${(m.detractors / maxTotal) * 48}px` }} />
            </div>
            <span className="text-[9px] text-gray-400 mt-0.5">{m.month.slice(5)}월</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SegmentCard({ data, accent }: { data: SheetData; accent: string }) {
  const [showComments, setShowComments] = useState(false);
  const o = data.overall;
  if (!o) return (
    <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-400">
      {data.label}: {data.error || '데이터 없음'}
    </div>
  );

  return (
    <div className={`bg-white rounded-xl border-l-4 ${accent} shadow-sm p-4`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs text-gray-400">{data.label}</p>
          <NPSScore nps={o.nps} />
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-gray-700">{o.total.toLocaleString()}</p>
          <p className="text-xs text-gray-400">응답수</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        <div>
          <div className="text-sm font-bold text-green-600">{o.promoters}</div>
          <div className="text-[10px] text-gray-400">추천 9-10</div>
          <div className="text-[10px] text-gray-500">{Math.round((o.promoters/o.total)*100)}%</div>
        </div>
        <div>
          <div className="text-sm font-bold text-yellow-500">{o.passives}</div>
          <div className="text-[10px] text-gray-400">중립 7-8</div>
          <div className="text-[10px] text-gray-500">{Math.round((o.passives/o.total)*100)}%</div>
        </div>
        <div>
          <div className="text-sm font-bold text-red-500">{o.detractors}</div>
          <div className="text-[10px] text-gray-400">비추 0-6</div>
          <div className="text-[10px] text-gray-500">{Math.round((o.detractors/o.total)*100)}%</div>
        </div>
      </div>

      <RatioBar {...o} />

      {data.monthly.length > 0 && (
        <div className="mt-4">
          <MonthlyChart monthly={data.monthly} />
        </div>
      )}

      {data.recentComments.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowComments(!showComments)}
            className="text-xs text-blue-500 hover:underline"
          >
            {showComments ? '▲ 코멘트 숨기기' : `▼ 최근 코멘트 (${data.recentComments.length}개)`}
          </button>
          {showComments && (
            <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
              {data.recentComments.map((c, i) => (
                <div key={i} className="flex gap-2 text-xs text-gray-600">
                  <ScoreBadge score={c.score} />
                  <span className="leading-relaxed">{c.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CategorySection({
  title, emoji, buyer, seller, bgColor
}: {
  title: string; emoji: string; buyer: SheetData[]; seller: SheetData[]; bgColor: string;
}) {
  // 카테고리 합산 NPS
  const allBuyerScores = buyer.flatMap(d => {
    if (!d.overall) return [];
    const { promoters, detractors, total } = d.overall;
    return [{ promoters, detractors, total }];
  });
  const allSellerScores = seller.flatMap(d => {
    if (!d.overall) return [];
    const { promoters, detractors, total } = d.overall;
    return [{ promoters, detractors, total }];
  });

  const combineNPS = (arr: { promoters: number; detractors: number; total: number }[]) => {
    const p = arr.reduce((a, b) => a + b.promoters, 0);
    const d = arr.reduce((a, b) => a + b.detractors, 0);
    const t = arr.reduce((a, b) => a + b.total, 0);
    return t > 0 ? Math.round(((p - d) / t) * 100) : 0;
  };

  const buyerNPS = combineNPS(allBuyerScores);
  const sellerNPS = combineNPS(allSellerScores);

  return (
    <div className={`${bgColor} rounded-2xl p-5 mb-6`}>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">{emoji}</span>
        <h2 className="text-xl font-bold text-gray-800">{title}</h2>
        <div className="flex gap-3 ml-auto">
          <div className="text-center bg-white/70 rounded-lg px-3 py-1">
            <div className={`text-lg font-black ${buyerNPS >= 0 ? 'text-green-600' : 'text-red-600'}`}>{buyerNPS > 0 ? '+' : ''}{buyerNPS}</div>
            <div className="text-[10px] text-gray-500">구매자 NPS</div>
          </div>
          <div className="text-center bg-white/70 rounded-lg px-3 py-1">
            <div className={`text-lg font-black ${sellerNPS >= 0 ? 'text-green-600' : 'text-red-600'}`}>{sellerNPS > 0 ? '+' : ''}{sellerNPS}</div>
            <div className="text-[10px] text-gray-500">판매자 NPS</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 구매자 */}
        <div>
          <h3 className="text-sm font-semibold text-gray-600 mb-2 flex items-center gap-1">
            🛍️ 구매자
          </h3>
          <div className="space-y-3">
            {buyer.map((d, i) => (
              <SegmentCard key={i} data={d} accent="border-blue-400" />
            ))}
          </div>
        </div>
        {/* 판매자 */}
        <div>
          <h3 className="text-sm font-semibold text-gray-600 mb-2 flex items-center gap-1">
            📦 판매자
          </h3>
          <div className="space-y-3">
            {seller.map((d, i) => (
              <SegmentCard key={i} data={d} accent="border-orange-400" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NPSPage() {
  const router = useRouter();
  const [data, setData] = useState<SheetData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');

  useEffect(() => {
    fetch('/api/nps')
      .then(r => r.json())
      .then(res => {
        setData(res.data || []);
        setLastUpdated(new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const caredBuyer = data.filter(d => d.category === 'cared' && d.type === 'buyer');
  const caredSeller = data.filter(d => d.category === 'cared' && d.type === 'seller');
  const marketBuyer = data.filter(d => d.category === 'market' && d.type === 'buyer');
  const marketSeller = data.filter(d => d.category === 'market' && d.type === 'seller');

  const totalResponses = data.reduce((a, d) => a + (d.overall?.total || 0), 0);
  const allP = data.reduce((a, d) => a + (d.overall?.promoters || 0), 0);
  const allD = data.reduce((a, d) => a + (d.overall?.detractors || 0), 0);
  const overallNPS = totalResponses > 0 ? Math.round(((allP - allD) / totalResponses) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-900 text-white px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <button onClick={() => router.push('/')} className="text-white/60 hover:text-white text-sm transition-colors">
            ← CX 대시보드
          </button>
          <h1 className="text-lg font-bold">📊 NPS 대시보드</h1>
          {lastUpdated && <span className="text-xs text-white/40 ml-auto">{lastUpdated} 기준</span>}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center py-24 text-gray-400">
            <div className="text-4xl mb-3 animate-pulse">📊</div>
            <p>구글 시트에서 NPS 데이터 불러오는 중...</p>
          </div>
        ) : (
          <>
            {/* 전체 요약 */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
                <div className={`text-4xl font-black ${overallNPS >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {overallNPS > 0 ? '+' : ''}{overallNPS}
                </div>
                <div className="text-xs text-gray-400 mt-1">전체 평균 NPS</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
                <div className="text-4xl font-black text-gray-800">{totalResponses.toLocaleString()}</div>
                <div className="text-xs text-gray-400 mt-1">총 응답수</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
                <div className="flex justify-center gap-4 mt-1">
                  <div>
                    <div className="text-xl font-bold text-green-600">{allP}</div>
                    <div className="text-[10px] text-gray-400">추천</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-red-500">{allD}</div>
                    <div className="text-[10px] text-gray-400">비추</div>
                  </div>
                </div>
                <RatioBar promoters={allP} passives={totalResponses - allP - allD} detractors={allD} total={totalResponses} />
                <div className="text-xs text-gray-400 mt-1">전체 분포</div>
              </div>
            </div>

            {/* 케어드 섹션 */}
            <CategorySection
              title="케어드"
              emoji="📦"
              buyer={caredBuyer}
              seller={caredSeller}
              bgColor="bg-blue-50"
            />

            {/* 마켓 섹션 */}
            <CategorySection
              title="마켓"
              emoji="🛒"
              buyer={marketBuyer}
              seller={marketSeller}
              bgColor="bg-orange-50"
            />
          </>
        )}
      </div>
    </div>
  );
}
