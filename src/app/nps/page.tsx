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

function NPSBadge({ nps }: { nps: number }) {
  const color = nps >= 50 ? 'bg-green-500' : nps >= 20 ? 'bg-yellow-500' : nps >= 0 ? 'bg-orange-500' : 'bg-red-500';
  return (
    <span className={`${color} text-white text-xs font-bold px-2 py-0.5 rounded-full`}>
      NPS {nps > 0 ? '+' : ''}{nps}
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 9 ? 'bg-green-100 text-green-700' : score >= 7 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
  return <span className={`${color} text-xs font-bold px-1.5 py-0.5 rounded`}>{score}</span>;
}

function MonthlyChart({ monthly }: { monthly: MonthlyNPS[] }) {
  if (monthly.length === 0) return <p className="text-gray-400 text-xs">데이터 없음</p>;
  const recent = monthly.slice(-6);
  const max = Math.max(...recent.map(m => m.total), 1);
  return (
    <div className="flex items-end gap-1 h-16 mt-2">
      {recent.map((m) => (
        <div key={m.month} className="flex flex-col items-center flex-1">
          <span className="text-[9px] text-gray-500 mb-0.5">{m.nps > 0 ? '+' : ''}{m.nps}</span>
          <div className="w-full flex flex-col-reverse gap-0.5">
            <div className="bg-red-300 rounded-sm" style={{ height: `${(m.detractors / max) * 40}px` }} />
            <div className="bg-yellow-200 rounded-sm" style={{ height: `${(m.passives / max) * 40}px` }} />
            <div className="bg-green-400 rounded-sm" style={{ height: `${(m.promoters / max) * 40}px` }} />
          </div>
          <span className="text-[9px] text-gray-400 mt-0.5">{m.month.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

function SheetCard({ data }: { data: SheetData }) {
  const [showComments, setShowComments] = useState(false);
  const o = data.overall;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-xs text-gray-500">{data.type === 'buyer' ? '🛍️ 구매자' : '📦 판매자'} · {data.category === 'market' ? '마켓' : '케어드'}</span>
          <h3 className="font-semibold text-gray-800 text-sm">{data.label}</h3>
        </div>
        {o && <NPSBadge nps={o.nps} />}
      </div>

      {data.error && <p className="text-red-400 text-xs">오류: {data.error}</p>}

      {o && (
        <>
          <div className="grid grid-cols-4 gap-2 mb-3">
            <div className="text-center">
              <div className="text-lg font-bold text-gray-800">{o.total}</div>
              <div className="text-[10px] text-gray-400">응답수</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-green-600">{o.promoters}</div>
              <div className="text-[10px] text-gray-400">추천(9-10)</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-yellow-500">{o.passives}</div>
              <div className="text-[10px] text-gray-400">중립(7-8)</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-red-500">{o.detractors}</div>
              <div className="text-[10px] text-gray-400">비추(0-6)</div>
            </div>
          </div>

          {/* 비율 바 */}
          <div className="flex h-2 rounded-full overflow-hidden mb-3">
            <div className="bg-green-400" style={{ width: `${(o.promoters / o.total) * 100}%` }} />
            <div className="bg-yellow-300" style={{ width: `${(o.passives / o.total) * 100}%` }} />
            <div className="bg-red-400" style={{ width: `${(o.detractors / o.total) * 100}%` }} />
          </div>

          <MonthlyChart monthly={data.monthly} />

          {data.recentComments.length > 0 && (
            <button
              onClick={() => setShowComments(!showComments)}
              className="mt-3 text-xs text-blue-500 hover:underline"
            >
              {showComments ? '코멘트 숨기기' : `최근 코멘트 보기 (${data.recentComments.length}개)`}
            </button>
          )}

          {showComments && (
            <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
              {data.recentComments.map((c, i) => (
                <div key={i} className="flex gap-2 text-xs text-gray-600 border-l-2 border-gray-100 pl-2">
                  <ScoreBadge score={c.score} />
                  <span>{c.text}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function NPSPage() {
  const router = useRouter();
  const [data, setData] = useState<SheetData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');
  const [filter, setFilter] = useState<'all' | 'buyer' | 'seller'>('all');

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

  const filtered = data.filter(d => filter === 'all' || d.type === filter);

  // 전체 평균 NPS
  const allNPS = data.filter(d => d.overall).map(d => d.overall!.nps);
  const avgNPS = allNPS.length ? Math.round(allNPS.reduce((a, b) => a + b, 0) / allNPS.length) : 0;
  const totalResponses = data.reduce((a, d) => a + (d.overall?.total || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {/* 헤더 */}
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push('/')}
            className="text-gray-400 hover:text-gray-600 text-sm"
          >
            ← CX 대시보드
          </button>
          <h1 className="text-xl font-bold text-gray-800">📊 NPS 대시보드</h1>
          {lastUpdated && <span className="text-xs text-gray-400 ml-auto">업데이트: {lastUpdated}</span>}
        </div>

        {/* 요약 카드 */}
        {!loading && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
              <div className="text-3xl font-bold text-gray-800">{avgNPS > 0 ? '+' : ''}{avgNPS}</div>
              <div className="text-xs text-gray-400 mt-1">전체 평균 NPS</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
              <div className="text-3xl font-bold text-gray-800">{totalResponses.toLocaleString()}</div>
              <div className="text-xs text-gray-400 mt-1">총 응답수</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
              <div className="text-3xl font-bold text-gray-800">{data.length}</div>
              <div className="text-xs text-gray-400 mt-1">설문 채널수</div>
            </div>
          </div>
        )}

        {/* 필터 */}
        <div className="flex gap-2 mb-4">
          {(['all', 'buyer', 'seller'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filter === f ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-400'
              }`}
            >
              {f === 'all' ? '전체' : f === 'buyer' ? '🛍️ 구매자' : '📦 판매자'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-2xl mb-2">⏳</div>
            <p>구글 시트에서 NPS 데이터 불러오는 중...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((d, i) => <SheetCard key={i} data={d} />)}
          </div>
        )}
      </div>
    </div>
  );
}
