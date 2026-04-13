import { NextResponse } from 'next/server';
import { google } from 'googleapis';

const SHEETS = [
  { id: '1W7qvh1GDF3gOBeitkijpK1iQtigCPAOYaZ6C3rwjbBo', sheet: 'Smore-Xx0Ln5WIxW-CRp', label: '케어드 구매 (신규)', type: 'buyer', category: 'cared' },
  { id: '1XmVmOry9kWNxmlhNykqabQ_xUJPUsJ9xDB7kI2bVf1k', sheet: 'Smore-tRjycfoD5Q-jfK', label: '케어드 구매 (기존)', type: 'buyer', category: 'cared' },
  { id: '1rdf20AVSQcvd0TYAa3iqk8wPfi1goxtUuotncDQrZj8', sheet: 'Smore-Vc4znMGJ4X-Xs4', label: '마켓 구매', type: 'buyer', category: 'market' },
  { id: '1Agk6GvrU9oKswdvy4nStftlyJEiA-RriUd4RP7VHF8w', sheet: 'Smore-q7Z1m6bSkl-bN2', label: '케어드 판매 (신규)', type: 'seller', category: 'cared' },
  { id: '1fUWR36DUpEemnZBMrQllVP5gVIkY0G_2uK2oI0md6lY', sheet: '판매자nps응답', label: '케어드 판매 (기존)', type: 'seller', category: 'cared' },
  { id: '1SMEMqrpoSyQstvRR4oo3gxDyfF6INc3zYMHc19y-Ct0', sheet: 'Smore-ngATD9yGEN-mVT', label: '마켓 판매', type: 'seller', category: 'market' },
];

function findScoreCol(rows: string[][]): number {
  if (rows.length < 2) return 1;
  for (let c = 0; c < (rows[0] || []).length; c++) {
    const v = Number((rows[1] || [])[c]);
    if (!isNaN(v) && v >= 0 && v <= 10) return c;
  }
  return 1;
}

function parseMonth(s: string): string {
  const m1 = s.match(/(\d{4})\.\s*(\d{1,2})\./);
  if (m1) return `${m1[1]}-${m1[2].padStart(2, '0')}`;
  const m2 = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m2) return `${m2[3]}-${m2[1].padStart(2, '0')}`;
  return '';
}

function calcNPS(scores: number[]) {
  if (!scores.length) return null;
  const p = scores.filter(s => s >= 9).length;
  const pa = scores.filter(s => s >= 7 && s <= 8).length;
  const d = scores.filter(s => s <= 6).length;
  const t = scores.length;
  return { nps: Math.round(((p - d) / t) * 100), promoters: p, passives: pa, detractors: d, total: t };
}

export async function GET() {
  try {
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');
    const auth = new google.auth.GoogleAuth({ credentials: serviceAccount, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
    const sheets = google.sheets({ version: 'v4', auth });

    const results = await Promise.all(SHEETS.map(async (s) => {
      try {
        const res = await sheets.spreadsheets.values.get({ spreadsheetId: s.id, range: `${s.sheet}!A1:F2000` });
        const rows = (res.data.values || []) as string[][];
        const dataRows = rows.slice(1);
        const scoreCol = findScoreCol(rows);
        const commentCol = rows[0]?.findIndex(h => h.includes('이유') || h.includes('comment')) ?? 2;

        const byMonth: Record<string, number[]> = {};
        const commentsByMonth: Record<string, { score: number; text: string }[]> = {};

        for (const row of dataRows) {
          const scoreStr = row[scoreCol];
          const score = Number(scoreStr);
          if (!scoreStr || isNaN(score) || score < 0 || score > 10) continue;
          const month = parseMonth(row[0] || '');
          if (!month) continue;
          if (!byMonth[month]) byMonth[month] = [];
          byMonth[month].push(Math.round(score));
          const text = (row[commentCol] || '').trim();
          if (text.length > 3) {
            if (!commentsByMonth[month]) commentsByMonth[month] = [];
            commentsByMonth[month].push({ score: Math.round(score), text: text.slice(0, 200) });
          }
        }

        const allScores = Object.values(byMonth).flat();
        const overall = calcNPS(allScores);

        const monthly = Object.entries(byMonth)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, scores]) => ({ month, ...calcNPS(scores)! }));

        // MoM: 최근 2개월 비교
        const recentMonths = monthly.slice(-2);
        const prevMonth = recentMonths[0] || null;
        const currMonth = recentMonths[1] || null;
        const mom = (prevMonth && currMonth) ? currMonth.nps - prevMonth.nps : null;
        const momLabel = prevMonth?.month || null;
        const currLabel = currMonth?.month || null;

        // 월별 코멘트 (최근 3개월)
        const recentCommentMonths = Object.keys(commentsByMonth).sort().slice(-3);
        const detailComments = recentCommentMonths.flatMap(m =>
          (commentsByMonth[m] || []).map(c => ({ ...c, month: m }))
        ).slice(-30).reverse();

        return { ...s, overall, monthly, mom, momLabel, currLabel, detailComments, error: null };
      } catch (e) {
        return { ...s, overall: null, monthly: [], mom: null, momLabel: null, currLabel: null, detailComments: [], error: String(e) };
      }
    }));

    return NextResponse.json({ data: results });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
