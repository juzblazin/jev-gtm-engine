/* CH-02 SEO worker: DataForSEO via treg.
   ranked_keywords -> organic keywords, positions and intent
   relevant_pages  -> per-page position buckets and decay (is_down/is_lost)
   historical_keyword_data -> 12-month volume for switching-intent seeds
   Jev -> funnel-stage classification of filtered keywords */
import { hasTreg, tregPost } from '@/lib/treg';

export type SeoKeyword = { keyword: string; volume: number; cpc: number; position: number | null; prevPosition: number | null; positionDiff: number | null; url: string; intent: string; difficulty: number | null; funnelStage?: string; jevConfidence?: number };
export type DecayingPage = { url: string; etv: number; isDown: number; isLost: number; topPositions: number };
export type RadarEntry = { keyword: string; volume: number; history: number[]; velocity: number };
export type SeoReport = { keywords: SeoKeyword[]; decayingPages: DecayingPage[]; radar: RadarEntry[]; funnel: Record<string, string>; totalRanked: number; cost: number };

const locations: Record<string, number> = { US: 2840, UK: 2826, EU: 2276, Global: 2840 };
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

type RankedItem = { keyword_data?: { keyword?: string; keyword_info?: { search_volume?: number; cpc?: number; keyword_difficulty?: number }; search_intent_info?: { main_intent?: string } }; ranked_serp_element?: { serp_item?: { rank_absolute?: number; url?: string; rank_changes?: { previous_rank_absolute?: number | null; is_down?: boolean } } } };
type Dfs = { cost?: number; tasks?: { result?: { total_count?: number; items?: unknown[] }[] }[] };

export async function seoIngest(domain: string, region: string): Promise<SeoReport | null> {
  if (!hasTreg()) return null;
  const location_code = locations[region] || 2840, brand = domain.split('.')[0].toLowerCase();
  const [ranked, pages, radar] = await Promise.allSettled([
    tregPost<Dfs>('dataforseo.google.domain.ranked_keywords', [{ target: domain, location_code, language_code: 'en', limit: 100, order_by: ['keyword_data.keyword_info.search_volume,desc'] }], 45000),
    tregPost<Dfs>('dataforseo.x.dataforseo-labs-google-relevant-pages-live', [{ target: domain, location_code, language_code: 'en', limit: 50 }], 45000),
    tregPost<Dfs>('dataforseo.x.dataforseo-labs-google-historical-keyword-data-live', [{ language_code: 'en', location_code, keywords: [`${brand} alternative`, `${brand} vs`, `${brand} pricing`, `cancel ${brand}`] }], 45000),
  ]);
  if (ranked.status !== 'fulfilled' && pages.status !== 'fulfilled' && radar.status !== 'fulfilled') return null;
  let cost = 0;
  const keywords: SeoKeyword[] = [], decayingPages: DecayingPage[] = [], radarOut: RadarEntry[] = [];
  let totalRanked = 0;
  if (ranked.status === 'fulfilled') {
    const res = ranked.value.data.tasks?.[0]?.result?.[0]; cost += ranked.value.data.cost || 0; totalRanked = res?.total_count || 0;
    for (const it of (res?.items || []) as RankedItem[]) {
      const info = it.keyword_data?.keyword_info, serp = it.ranked_serp_element?.serp_item, pos = serp?.rank_absolute ?? null, prev = serp?.rank_changes?.previous_rank_absolute ?? null;
      keywords.push({ keyword: it.keyword_data?.keyword || '', volume: info?.search_volume || 0, cpc: info?.cpc || 0, position: pos, prevPosition: prev, positionDiff: prev != null && pos != null ? prev - pos : null, url: serp?.url || '', intent: it.keyword_data?.search_intent_info?.main_intent || 'other', difficulty: info?.keyword_difficulty ?? null });
    }
    keywords.sort((a, b) => b.volume - a.volume);
  }
  if (pages.status === 'fulfilled') {
    cost += pages.value.data.cost || 0;
    for (const it of (pages.value.data.tasks?.[0]?.result?.[0]?.items || []) as { page_address?: string; metrics?: { organic?: { pos_1?: number; pos_2_3?: number; etv?: number; is_down?: number; is_lost?: number; is_new?: number; is_up?: number } } }[]) {
      const o = it.metrics?.organic; if (!o || !it.page_address) continue;
      const moving = (o.is_down || 0) + (o.is_lost || 0), up = (o.is_up || 0) + (o.is_new || 0);
      if (moving > 0 && moving >= up * 0.5 && (o.etv || 0) > 1) decayingPages.push({ url: it.page_address, etv: Math.round(o.etv || 0), isDown: o.is_down || 0, isLost: o.is_lost || 0, topPositions: (o.pos_1 || 0) + (o.pos_2_3 || 0) });
    }
    decayingPages.sort((a, b) => (b.isDown + b.isLost) - (a.isDown + a.isLost));
  }
  if (radar.status === 'fulfilled') {
    cost += radar.value.data.cost || 0;
    for (const it of (radar.value.data.tasks?.[0]?.result?.[0]?.items || []) as { keyword?: string; keyword_info?: { search_volume?: number; monthly_searches?: { search_volume?: number }[] } }[]) {
      if (!it.keyword || !(it.keyword_info?.monthly_searches?.length || it.keyword_info?.search_volume)) continue;
      const history = (it.keyword_info?.monthly_searches || []).map(m => m.search_volume || 0), recent = history.slice(0, 3), prior = history.slice(3, 6);
      const avg = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
      radarOut.push({ keyword: it.keyword, volume: it.keyword_info?.search_volume || 0, history: history.slice(0, 12), velocity: avg(prior) > 0 ? Math.round(((avg(recent) - avg(prior)) / avg(prior)) * 100) : 0 });
    }
  }
  /* Jev funnel triage: code-filter informational+free and branded terms first, then classify up to 30. */
  const pool = keywords.filter(k => !(k.intent === 'informational' && k.cpc === 0) && !k.keyword.toLowerCase().includes(brand)).slice(0, 30);
  const funnel: Record<string, string> = {};
  if (pool.length) {
    try {
      const stages = { bof_evaluation: 'Bottom-of-Funnel Evaluation', problem_search: 'Active Problem/Pain Search', tofu_education: 'Top-of-Funnel Education' };
      const questions: Record<string, unknown> = {};
      pool.forEach((k, i) => { questions[`kw_${i}`] = { type: 'choice', instructions: `A competing software vendor's site ranks for the query in <kw_${i}>. What switching-funnel stage is the searcher in?`, criteria: stages }; });
      const { data } = await tregPost<{ answers?: Record<string, { choice?: string; confidence?: number }>; usage?: { cost?: number } }>('openrouter.ai-judge.decide', { model: 'typesafe/jev-1.13', state: `# Keywords\n${pool.map((k, i) => `<kw_${i}>${esc(k.keyword)}</kw_${i}>`).join('\n')}`, questions });
      cost += data.usage?.cost || 0;
      pool.forEach((k, i) => { const ans = data.answers?.[`kw_${i}`], c = ans?.choice; if (c && stages[c as keyof typeof stages]) { funnel[k.keyword] = stages[c as keyof typeof stages]; k.funnelStage = stages[c as keyof typeof stages]; k.jevConfidence = ans.confidence; } });
    } catch { /* funnel classification optional */ }
  }
  return { keywords, decayingPages, radar: radarOut, funnel, totalRanked, cost };
}
