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

function getScoreColumn(rows: string[][]): number {
  // 헤더에서 점수 컬럼 찾기 (숫자가 있는 컬럼)
  if (rows.length < 2) return 1;
  for (let col = 0; col < (rows[0] || []).length; col++) {
    const val = (rows[1] || [])[col];
    if (val && !isNaN(Number(val)) && Number(val) >= 0 && Number(val) <= 10) return col;
  }
  return 1;
}

function getDateColumn(rows: string[][]): number {
  if (rows.length === 0) return 0;
  const header = rows[0] || [];
  for (let i = 0; i < header.length; i++) {
    if (header[i].toLowerCase().includes('submitted') || header[i].includes('날짜')) return i;
  }
  return 0;
}

function getCommentColumn(rows: string[][]): number {
  if (rows.length === 0) return 2;
  const header = rows[0] || [];
  for (let i = 0; i < header.length; i++) {
    if (header[i].includes('이유') || header[i].includes('comment')) return i;
  }
  return 2;
}

function parseDate(str: string): string {
  // "2026. 2. 10 오후 7:21:16" → "2026-02"
  const match = str.match(/(\d{4})\.\s*(\d{1,2})\./);
  if (match) return `${match[1]}-${String(match[2]).padStart(2, '0')}`;
  // "11/29/2024" → "2024-11"
  const match2 = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match2) return `${match2[3]}-${String(match2[1]).padStart(2, '0')}`;
  return '';
}

function calcNPS(scores: number[]) {
  if (scores.length === 0) return { nps: 0, promoters: 0, passives: 0, detractors: 0, total: 0 };
  const promoters = scores.filter(s => s >= 9).length;
  const passives = scores.filter(s => s >= 7 && s <= 8).length;
  const detractors = scores.filter(s => s <= 6).length;
  const total = scores.length;
  const nps = Math.round(((promoters - detractors) / total) * 100);
  return { nps, promoters, passives, detractors, total };
}

export async function GET() {
  try {
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const results = await Promise.all(
      SHEETS.map(async (s) => {
        try {
          const res = await sheets.spreadsheets.values.get({
            spreadsheetId: s.id,
            range: `${s.sheet}!A1:E500`,
          });
          const rows = (res.data.values || []) as string[][];
          const dataRows = rows.slice(1); // 헤더 제외

          const scoreCol = getScoreColumn(rows);
          const dateCol = getDateColumn(rows);
          const commentCol = getCommentColumn(rows);

          // 월별 집계
          const byMonth: Record<string, number[]> = {};
          const comments: { score: number; text: string; date: string }[] = [];

          for (const row of dataRows) {
            const scoreStr = row[scoreCol];
            const score = Number(scoreStr);
            if (!scoreStr || isNaN(score) || score < 0 || score > 10) continue;

            const dateStr = row[dateCol] || '';
            const month = parseDate(dateStr);
            if (month) {
              if (!byMonth[month]) byMonth[month] = [];
              byMonth[month].push(score);
            }

            const comment = (row[commentCol] || '').trim();
            if (comment && comment.length > 3) {
              comments.push({ score, text: comment.slice(0, 200), date: month });
            }
          }

          // 전체 NPS
          const allScores = dataRows
            .map(r => Number(r[scoreCol]))
            .filter(n => !isNaN(n) && n >= 0 && n <= 10);
          const overall = calcNPS(allScores);

          // 월별 NPS
          const monthly = Object.entries(byMonth)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, scores]) => ({ month, ...calcNPS(scores) }));

          // 최근 코멘트 20개
          const recentComments = comments.slice(-20).reverse();

          return { ...s, overall, monthly, recentComments, error: null };
        } catch (e) {
          return { ...s, overall: null, monthly: [], recentComments: [], error: String(e) };
        }
      })
    );

    return NextResponse.json({ data: results });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
