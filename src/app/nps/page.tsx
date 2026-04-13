'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface MonthlyNPS { month: string; nps: number; promoters: number; passives: number; detractors: number; total: number; }
interface DetailComment { score: number; text: string; month: string; }
interface SheetData {
  label: string; type: string; category: string; id: string;
  overall: { nps: number; promoters: number; passives: number; detractors: number; total: number } | null;
  monthly: MonthlyNPS[];
  mom: number | null; momLabel: string | null; currLabel: string | null;
  detailComments: DetailComment[];
  error: string | null;
}

function NPSNum({ nps, size = 'md' }: { nps: number; size?: 'sm' | 'md' | 'lg' }) {
  const color = nps >= 50 ? 'text-green-600' : nps >= 20 ? 'text-yellow-600' : nps >= 0 ? 'text-orange-500' : 'text-red-600';
  const sz = size === 'lg' ? 'text-5xl' : size === 'md' ? 'text-3xl' : 'text-xl';
  return <span className={`font-black ${color} ${sz}`}>{nps > 0 ? '+' : ''}{nps}</span>;
}

function MoMBadge({ mom }: { mom: number }) {
  const up = mom > 0;
  const color = up ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
  return <span className={`${color} text-xs font-bold px-2 py-0.5 rounded-full`}>{up ? '▲' : '▼'} {up ? '+' : ''}{mom} MoM</span>;
}

function RatioBar({ p, pa, d, t }: { p: number; pa: number; d: number; t: number }) {
  return (
    <div className="flex h-2 rounded-full overflow-hidden w-full">
      <div className="bg-green-400" style={{ width: `${(p / t) * 100}%` }} />
      <div className="bg-yellow-300" style={{ width: `${(pa / t) * 100}%` }} />
      <div className="bg-red-400" style={{ width: `${(d / t) * 100}%` }} />
    </div>
  );
}

function MonthChart({ monthly }: { monthly: MonthlyNPS[] }) {
  const recent = monthly.slice(-6);
  if (!recent.length) return null;
  const maxT = Math.max(...recent.map(m => m.total), 1);
  return (
    <div className="flex items-end gap-1 h-16">
      {recent.map((m, i) => {
        const isLast = i === recent.length - 1;
        return (
          <div key={m.month} className="flex flex-col items-center flex-1 min-w-0">
            <span className={`text-[9px] mb-0.5 font-semibold ${isLast ? 'text-gray-700' : 'text-gray-400'}`}>
              {m.nps > 0 ? '+' : ''}{m.nps}
            </span>
            <div className="w-full flex flex-col gap-px">
              <div className={`${isLast ? 'bg-green-500' : 'bg-green-200'} rounded-t-sm`} style={{ height: `${(m.promoters / maxT) * 36}px` }} />
              <div className={`${isLast ? 'bg-yellow-400' : 'bg-yellow-100'}`} style={{ height: `${(m.passives / maxT) * 36}px` }} />
              <div className={`${isLast ? 'bg-red-500' : 'bg-red-200'} rounded-b-sm`} style={{ height: `${(m.detractors / maxT) * 36}px` }} />
            </div>
            <span className="text-[9px] text-gray-400 mt-0.5">{m.month.slice(5)}월</span>
          </div>
        );
      })}
    </div>
  );
}

// 상세 모달
function DetailModal({ data, onClose }: { data: SheetData; onClose: () => void }) {
  const o = data.overall;
  const [filter, setFilter] = useState<'all' | 'promoter' | 'passive' | 'detractor'>('all');

  const filtered = data.detailComments.filter(c => {
    if (filter === 'promoter') return c.score >= 9;
    if (filter === 'passive') return c.score >= 7 && c.score <= 8;
    if (filter === 'detractor') return c.score <= 6;
    return true;
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">{data.type === 'buyer' ? '🛍️ 구매자' : '📦 판매자'} · {data.category === 'market' ? '마켓' : '케어드'}</p>
            <h2 className="text-lg font-bold text-gray-800">{data.label}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
        </div>

        <div className="p-6">
          {/* 전체 NPS */}
          {o && (
            <div className="mb-6">
              <div className="flex items-end gap-4 mb-3">
                <div>
                  <p className="text-xs text-gray-400 mb-1">전체 NPS</p>
                  <NPSNum nps={o.nps} size="lg" />
                </div>
                {data.mom !== null && <MoMBadge mom={data.mom} />}
                <div className="ml-auto text-right">
                  <p className="text-2xl font-bold text-gray-700">{o.total.toLocaleString()}</p>
                  <p className="text-xs text-gray-400">총 응답수</p>
                </div>
              </div>
              <RatioBar p={o.promoters} pa={o.passives} d={o.detractors} t={o.total} />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>추천 {o.promoters}명 ({Math.round(o.promoters/o.total*100)}%)</span>
                <span>중립 {o.passives}명 ({Math.round(o.passives/o.total*100)}%)</span>
                <span>비추 {o.detractors}명 ({Math.round(o.detractors/o.total*100)}%)</span>
              </div>
            </div>
          )}

          {/* 월별 상세 테이블 */}
          <div className="mb-6">
            <p className="text-sm font-semibold text-gray-700 mb-3">월별 NPS 추이</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 border-b border-gray-100">
                    <th className="text-left py-2 pr-4">월</th>
                    <th className="text-right pr-3">NPS</th>
                    <th className="text-right pr-3">응답</th>
                    <th className="text-right pr-3">추천</th>
                    <th className="text-right pr-3">중립</th>
                    <th className="text-right pr-3">비추</th>
                    <th className="text-right">MoM</th>
                  </tr>
                </thead>
                <tbody>
                  {data.monthly.slice(-6).map((m, i, arr) => {
                    const prev = arr[i - 1];
                    const mom = prev ? m.nps - prev.nps : null;
                    const isLatest = i === arr.length - 1;
                    return (
                      <tr key={m.month} className={`border-b border-gray-50 ${isLatest ? 'bg-gray-50 font-semibold' : ''}`}>
                        <td className="py-2 pr-4 text-gray-700">{m.month}</td>
                        <td className={`text-right pr-3 font-bold ${m.nps >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {m.nps > 0 ? '+' : ''}{m.nps}
                        </td>
                        <td className="text-right pr-3 text-gray-600">{m.total}</td>
                        <td className="text-right pr-3 text-green-600">{m.promoters}</td>
                        <td className="text-right pr-3 text-yellow-600">{m.passives}</td>
                        <td className="text-right pr-3 text-red-600">{m.detractors}</td>
                        <td className={`text-right text-xs font-medium ${mom === null ? 'text-gray-300' : mom > 0 ? 'text-green-600' : mom < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                          {mom === null ? '-' : mom > 0 ? `+${mom}` : mom}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 코멘트 */}
          {data.detailComments.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-700">최근 응답 코멘트 (최근 3개월)</p>
                <a href={`https://docs.google.com/spreadsheets/d/${data.id}`} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                  📊 구글 시트 전체 보기 →
                </a>
              </div>
              <div className="flex gap-2 mb-3">
                {([['all', '전체'], ['promoter', '추천 9-10'], ['passive', '중립 7-8'], ['detractor', '비추 0-6']] as const).map(([f, label]) => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`text-xs px-2 py-1 rounded-full transition-colors ${filter === f ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {filtered.map((c, i) => {
                  const scoreColor = c.score >= 9 ? 'bg-green-100 text-green-700' : c.score >= 7 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
                  return (
                    <div key={i} className="flex gap-2 text-sm text-gray-600 border-l-2 border-gray-100 pl-3 py-1">
                      <span className={`${scoreColor} text-xs font-bold px-1.5 py-0.5 rounded h-fit shrink-0`}>{c.score}</span>
                      <div>
                        <span className="text-xs text-gray-400 mr-1">{c.month}</span>
                        {c.text}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SegmentCard({ data, accent }: { data: SheetData; accent: string }) {
  const [open, setOpen] = useState(false);
  const o = data.overall;
  if (!o) return null;

  return (
    <>
      <div
        className={`bg-white rounded-xl border-l-4 ${accent} shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow`}
        onClick={() => setOpen(true)}
      >
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-xs text-gray-400">{data.label}</p>
            <NPSNum nps={o.nps} size="md" />
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs text-gray-400">{o.total}건</span>
            {data.mom !== null && <MoMBadge mom={data.mom} />}
            <span className="text-xs text-blue-400 mt-1">자세히 →</span>
          </div>
        </div>

        <RatioBar p={o.promoters} pa={o.passives} d={o.detractors} t={o.total} />
        <div className="flex justify-between text-[10px] text-gray-400 mt-1 mb-3">
          <span>추천 {Math.round(o.promoters/o.total*100)}%</span>
          <span>중립 {Math.round(o.passives/o.total*100)}%</span>
          <span>비추 {Math.round(o.detractors/o.total*100)}%</span>
        </div>

        <MonthChart monthly={data.monthly} />
      </div>

      {open && <DetailModal data={data} onClose={() => setOpen(false)} />}
    </>
  );
}

function CategorySection({ title, emoji, buyer, seller, bg }: { title: string; emoji: string; buyer: SheetData[]; seller: SheetData[]; bg: string }) {
  const combine = (arr: SheetData[]) => {
    const p = arr.reduce((a, d) => a + (d.overall?.promoters || 0), 0);
    const d = arr.reduce((a, d) => a + (d.overall?.detractors || 0), 0);
    const t = arr.reduce((a, d) => a + (d.overall?.total || 0), 0);
    return t > 0 ? Math.round(((p - d) / t) * 100) : 0;
  };

  return (
    <div className={`${bg} rounded-2xl p-5 mb-6`}>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">{emoji}</span>
        <h2 className="text-xl font-bold text-gray-800">{title}</h2>
        <div className="flex gap-3 ml-auto">
          <div className="text-center bg-white/70 rounded-lg px-3 py-1">
            <NPSNum nps={combine(buyer)} size="sm" />
            <div className="text-[10px] text-gray-500">구매자</div>
          </div>
          <div className="text-center bg-white/70 rounded-lg px-3 py-1">
            <NPSNum nps={combine(seller)} size="sm" />
            <div className="text-[10px] text-gray-500">판매자</div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2">🛍️ 구매자</p>
          <div className="space-y-3">{buyer.map((d, i) => <SegmentCard key={i} data={d} accent="border-blue-400" />)}</div>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2">📦 판매자</p>
          <div className="space-y-3">{seller.map((d, i) => <SegmentCard key={i} data={d} accent="border-orange-400" />)}</div>
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
    fetch('/api/nps').then(r => r.json()).then(res => {
      setData(res.data || []);
      setLastUpdated(new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const caredBuyer = data.filter(d => d.category === 'cared' && d.type === 'buyer');
  const caredSeller = data.filter(d => d.category === 'cared' && d.type === 'seller');
  const marketBuyer = data.filter(d => d.category === 'market' && d.type === 'buyer');
  const marketSeller = data.filter(d => d.category === 'market' && d.type === 'seller');

  const allP = data.reduce((a, d) => a + (d.overall?.promoters || 0), 0);
  const allD = data.reduce((a, d) => a + (d.overall?.detractors || 0), 0);
  const allT = data.reduce((a, d) => a + (d.overall?.total || 0), 0);
  const overallNPS = allT > 0 ? Math.round(((allP - allD) / allT) * 100) : 0;
  const allPa = allT - allP - allD;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-gray-800 to-gray-900 text-white px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <button onClick={() => router.push('/')} className="text-white/60 hover:text-white text-sm">← CX 대시보드</button>
          <h1 className="text-lg font-bold">📊 NPS 대시보드</h1>
          <span className="text-xs text-white/40 ml-auto">{lastUpdated} 기준</span>
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
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
                <NPSNum nps={overallNPS} size="lg" />
                <div className="text-xs text-gray-400 mt-1">전체 평균 NPS</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
                <div className="text-4xl font-black text-gray-800">{allT.toLocaleString()}</div>
                <div className="text-xs text-gray-400 mt-1">총 응답수</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <RatioBar p={allP} pa={allPa} d={allD} t={allT} />
                <div className="flex justify-between text-[10px] text-gray-500 mt-2">
                  <span className="text-green-600">추천 {Math.round(allP/allT*100)}%</span>
                  <span className="text-yellow-600">중립 {Math.round(allPa/allT*100)}%</span>
                  <span className="text-red-600">비추 {Math.round(allD/allT*100)}%</span>
                </div>
                <div className="text-xs text-gray-400 mt-1 text-center">전체 분포</div>
              </div>
            </div>

            <p className="text-xs text-gray-400 mb-4">💡 각 세그먼트 카드를 클릭하면 월별 상세 데이터와 코멘트를 볼 수 있어요</p>

            <CategorySection title="케어드" emoji="📦" buyer={caredBuyer} seller={caredSeller} bg="bg-blue-50" />
            <CategorySection title="마켓" emoji="🛒" buyer={marketBuyer} seller={marketSeller} bg="bg-orange-50" />
          </>
        )}
      </div>
    </div>
  );
}
