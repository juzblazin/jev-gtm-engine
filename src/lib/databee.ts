/* DataBee SiteAtlas: Similarweb-derived site estimates. One overview call per domain covers
   visits, trend, engagement, channel mix, geography and top keywords. */
import type { SiteMetrics } from './metrics';

export function hasDatabee() { return !!process.env.DATABEE_API_KEY; }

type Overview = {
  traffic?: {
    history?: { month: string; visits: number }[];
    engagement?: { pages_per_visit?: number; bounce_rate?: number; average_visit_duration_seconds?: number };
    sources_share?: Record<string, number>;
    geography_share?: { country_code: string; share: number }[];
  };
  seo?: { top_keywords?: { keyword: string }[] };
};

const sourceNames: Record<string, string> = { direct: 'Direct', organic_search: 'Search', paid_search: 'Paid', organic_social: 'Social', paid_social: 'Paid social', email: 'Email', referrals: 'Referral', generative_ai: 'AI referrals', affiliate: 'Affiliate', display_ads: 'Display' };
export const countries: Record<string, [string, string]> = { US: ['United States', 'North America'], CA: ['Canada', 'North America'], MX: ['Mexico', 'North America'], BR: ['Brazil', 'South America'], AR: ['Argentina', 'South America'], CL: ['Chile', 'South America'], CO: ['Colombia', 'South America'], PE: ['Peru', 'South America'], GB: ['United Kingdom', 'Europe'], DE: ['Germany', 'Europe'], FR: ['France', 'Europe'], ES: ['Spain', 'Europe'], IT: ['Italy', 'Europe'], NL: ['Netherlands', 'Europe'], SE: ['Sweden', 'Europe'], NO: ['Norway', 'Europe'], DK: ['Denmark', 'Europe'], FI: ['Finland', 'Europe'], PL: ['Poland', 'Europe'], RU: ['Russia', 'Europe'], UA: ['Ukraine', 'Europe'], TR: ['Turkey', 'Europe'], CH: ['Switzerland', 'Europe'], BE: ['Belgium', 'Europe'], AT: ['Austria', 'Europe'], IE: ['Ireland', 'Europe'], PT: ['Portugal', 'Europe'], GR: ['Greece', 'Europe'], CZ: ['Czechia', 'Europe'], RO: ['Romania', 'Europe'], HU: ['Hungary', 'Europe'], IN: ['India', 'Asia'], JP: ['Japan', 'Asia'], CN: ['China', 'Asia'], KR: ['South Korea', 'Asia'], ID: ['Indonesia', 'Asia'], SG: ['Singapore', 'Asia'], VN: ['Vietnam', 'Asia'], TH: ['Thailand', 'Asia'], PH: ['Philippines', 'Asia'], PK: ['Pakistan', 'Asia'], MY: ['Malaysia', 'Asia'], BD: ['Bangladesh', 'Asia'], IL: ['Israel', 'Asia'], SA: ['Saudi Arabia', 'Asia'], AE: ['UAE', 'Asia'], HK: ['Hong Kong', 'Asia'], TW: ['Taiwan', 'Asia'], AU: ['Australia', 'Oceania'], NZ: ['New Zealand', 'Oceania'], ZA: ['South Africa', 'Africa'], EG: ['Egypt', 'Africa'], NG: ['Nigeria', 'Africa'], KE: ['Kenya', 'Africa'], MA: ['Morocco', 'Africa'] };

let queue: Promise<void> = Promise.resolve();
function throttled() { const run = queue.then(() => new Promise<void>(r => setTimeout(r, 2100))); queue = run.then(() => {}, () => {}); return run; }

export async function databeeOverview(domain: string): Promise<{ metrics: Partial<SiteMetrics>; visits: number } | null> {
  await throttled(); // SiteAtlas limit: 0.5 RPS — parallel ingest would otherwise drop calls.
  const r = await fetch(`https://api.databee.dev/siteatlas/site-overview?url=${encodeURIComponent(domain)}`, { headers: { Authorization: `Bearer ${process.env.DATABEE_API_KEY}` }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) return null;
  const d = (await r.json()) as { status?: string } & Overview;
  if (d.status !== 'success' || !d.traffic?.history?.length) return null;
  const live = <T>(value: T) => ({ value, source: 'live' as const });
  const history = d.traffic.history, engagement = d.traffic.engagement || {}, mix = Object.entries(d.traffic.sources_share || {}).map(([key, share]) => ({ name: sourceNames[key] || key, share: Math.round(share * 1000) / 10 })).filter(c => c.share > 0).sort((a, b) => b.share - a.share);
  const geo = new Map<string, number>(), topCountries: { name: string; share: number }[] = [];
  for (const g of d.traffic.geography_share || []) {
    const [name, continent] = countries[g.country_code] || [g.country_code, 'Other'];
    geo.set(continent, (geo.get(continent) || 0) + g.share); topCountries.push({ name, share: Math.round(g.share * 1000) / 10 });
  }
  const metrics: Partial<SiteMetrics> = {
    visits: live(history[history.length - 1].visits), trend: live(history.map(h => h.visits)),
    duration: live(Math.round(engagement.average_visit_duration_seconds || 0)), bounce: live(Math.round((engagement.bounce_rate || 0) * 1000) / 10), pages: live(Math.round((engagement.pages_per_visit || 0) * 10) / 10),
    mix: live(mix), topKeywords: live((d.seo?.top_keywords || []).map(k => k.keyword)), regions: live([...geo.entries()].map(([name, share]) => ({ name, share: Math.round(share * 1000) / 10 })).sort((a, b) => b.share - a.share)), countries: live(topCountries.sort((a, b) => b.share - a.share)),
  };
  return { metrics, visits: history[history.length - 1].visits };
}
