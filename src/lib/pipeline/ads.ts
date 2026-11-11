/* CH-04 paid-acquisition worker: Meta (adyntel keyword), LinkedIn (scrapecreators company),
   Google (scrapecreators transparency, by domain) and TikTok (scrapecreators advertiser) via treg.
   days_active >= 60 flags PROVEN_CONTROL_WINNER; winners go to Jev for hook_angle + funnel_stage. */
import { hasTreg, tregCall, tregPost } from '@/lib/treg';

export type AdCreative = { platform: 'META' | 'LINKEDIN' | 'GOOGLE' | 'TIKTOK'; id: string; advertiser: string; libraryUrl: string; firstShown: string; lastShown: string; daysActive: number; format: string; headline: string; body: string; cta: string; landingUrl: string; hookAngle?: string; funnelStage?: string; jevConfidence?: number };
export type AdReport = { ads: AdCreative[]; provenWinners: number; byPlatform: Record<string, number>; cost: number };

const dayMs = 86400000;
const days = (from?: string | number, to?: string | number) => { const a = typeof from === 'number' ? from : Date.parse(from || ''); const b = typeof to === 'number' ? to : (to ? Date.parse(to) : Date.now()); return Number.isNaN(a) ? 0 : Math.max(0, Math.round((b - a) / dayMs)); };
const iso = (v?: string | number) => v ? (typeof v === 'number' ? new Date(v).toISOString() : v) : '';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const landing = (u?: string) => { if (!u) return ''; try { const x = new URL(u); return x.origin + x.pathname; } catch { return u; } };

type GoogleAd = { format?: string; adUrl?: string; advertiserName?: string; firstShown?: string; lastShown?: string; creativeId?: string };
type MetaAd = { id?: string; page_name?: string; title?: string; body?: string; cta_text?: string; link_url?: string; start_date?: string; total_active_time?: { days?: number } | null; snapshot?: { display_format?: string } };
type GraphAd = { id?: string; page_id?: string; page_name?: string; ad_creative_bodies?: string[]; ad_creative_link_titles?: string[]; ad_creative_link_captions?: string[]; ad_snapshot_url?: string; ad_delivery_start_time?: string; ad_delivery_stop_time?: string; publisher_platforms?: string[]; languages?: string[]; estimated_audience_size?: { lower_bound?: number; upper_bound?: number } };
type LinkedInAd = { id?: string; advertiser?: string; headline?: string; description?: string; cta?: string; url?: string; image?: unknown; video?: unknown };
type TikTokAd = { id?: string; name?: string; title?: string; subject?: string; first_shown_date?: number; last_shown_date?: number; videos?: unknown; image_urls?: unknown };

async function google(domain: string): Promise<AdCreative[]> {
  const { data } = await tregCall<{ ads?: GoogleAd[] }>('scrapecreators.x.v1-google-company-ads', { domain });
  return (data.ads || []).map(a => ({ platform: 'GOOGLE' as const, id: a.creativeId || '', advertiser: a.advertiserName || domain, libraryUrl: a.adUrl || '', firstShown: iso(a.firstShown), lastShown: iso(a.lastShown), daysActive: days(a.firstShown, a.lastShown), format: (a.format || 'unknown').toUpperCase(), headline: a.advertiserName || '', body: '', cta: '', landingUrl: domain }));
}
/* Official Meta Ad Library via treg's meta-ad-library connection (free once the
   team connects a Meta identity): full creative bodies, titles, snapshot links,
   delivery dates and platforms. search_terms matches the brand name. */
const regionCountries: Record<string, string> = { US: '["US"]', UK: '["GB"]', EU: '["DE","FR"]', Global: '["ALL"]' };
const META_FIELDS = 'id,page_id,page_name,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_captions,ad_snapshot_url,ad_delivery_start_time,ad_delivery_stop_time,publisher_platforms,languages,estimated_audience_size';
async function metaOfficial(brand: string, region: string): Promise<AdCreative[]> {
  const { data } = await tregCall<{ data?: GraphAd[] }>('meta-ad-library.meta-ads.library.search', { ad_reached_countries: regionCountries[region] || '["US"]', fields: META_FIELDS, search_terms: brand, ad_active_status: 'ALL', limit: 20 }, 45000);
  return (data.data || []).map(a => ({ platform: 'META' as const, id: a.id || '', advertiser: a.page_name || brand, libraryUrl: a.ad_snapshot_url || '', firstShown: iso(a.ad_delivery_start_time), lastShown: iso(a.ad_delivery_stop_time), daysActive: days(a.ad_delivery_start_time, a.ad_delivery_stop_time), format: (a.publisher_platforms || []).map(p => p.toLowerCase() === 'audience_network' ? 'audience network' : p.toLowerCase()).join(' + ') || 'META', headline: a.ad_creative_link_titles?.[0] || '', body: a.ad_creative_bodies?.[0] || '', cta: '', landingUrl: landing(a.ad_creative_link_captions?.[0]) }));
}
async function meta(brand: string, region: string): Promise<AdCreative[]> {
  try { const ads = await metaOfficial(brand, region); if (ads.length) return ads; } catch { /* adyntel remains when the Meta connection is absent. */ }
  const { data } = await tregPost<{ results?: MetaAd[] }>('adyntel.meta-ads.library.search', { keyword: brand }, 45000);
  return (data.results || []).filter(a => (a.page_name || '').toLowerCase().includes(brand)).map(a => ({ platform: 'META' as const, id: a.id || '', advertiser: a.page_name || brand, libraryUrl: '', firstShown: iso(a.start_date), lastShown: '', daysActive: a.total_active_time?.days ?? days(a.start_date), format: (a.snapshot?.display_format || 'unknown').toUpperCase(), headline: a.title || '', body: a.body || '', cta: a.cta_text || '', landingUrl: landing(a.link_url) }));
}
async function linkedin(brand: string, region: string): Promise<AdCreative[]> {
  const { data } = await tregCall<{ ads?: LinkedInAd[] }>('scrapecreators.x.v1-linkedin-ads-search', { company: brand, countries: region === 'US' || region === 'Global' ? 'US' : region });
  return (data.ads || []).map(a => ({ platform: 'LINKEDIN' as const, id: a.id || '', advertiser: a.advertiser || brand, libraryUrl: a.url || '', firstShown: '', lastShown: '', daysActive: 0, format: a.video ? 'VIDEO' : 'SINGLE_IMAGE', headline: a.headline || '', body: a.description || '', cta: a.cta || '', landingUrl: '' }));
}
async function tiktok(brand: string): Promise<AdCreative[]> {
  const { data } = await tregCall<{ ads?: TikTokAd[] }>('scrapecreators.x.v1-tiktok-ad-library-search', { query: brand });
  return (data.ads || []).map(a => ({ platform: 'TIKTOK' as const, id: a.id || '', advertiser: a.name || brand, libraryUrl: '', firstShown: iso(a.first_shown_date), lastShown: iso(a.last_shown_date), daysActive: days(a.first_shown_date, a.last_shown_date), format: a.videos ? 'VIDEO' : 'SINGLE_IMAGE', headline: a.title || '', body: a.subject || '', cta: '', landingUrl: '' }));
}

const hookAngles = { speed: 'Speed / Time-to-Value', cost: 'Cost / ROI Savings', fear: 'Fear / Compliance / Security', proof: 'Social Proof / Case Study', comparison: 'Direct Competitor Comparison' };
const funnelStages = { lead_magnet: 'Lead Magnet / Ungated Asset', free_trial: 'Free Trial / PLG Self-Serve', demo: 'High-Touch Demo Request' };

async function triageAd(a: AdCreative): Promise<AdCreative> {
  const text = `${a.headline}. ${a.body}. CTA: ${a.cta}`.slice(0, 1500);
  try {
    const { data } = await tregPost<{ answers?: Record<string, { choice?: string; confidence?: number }> }>('openrouter.ai-judge.decide', { model: 'typesafe/jev-1.13', state: `# Ad\n\n<ad platform="${a.platform}" advertiser="${esc(a.advertiser)}" days_active="${a.daysActive}">${esc(text)}</ad>`, questions: { hook_angle: { type: 'choice', instructions: 'What is the primary persuasion angle of <ad>?', criteria: hookAngles }, funnel_stage: { type: 'choice', instructions: 'What conversion motion does <ad> push the viewer toward?', criteria: funnelStages } } }, 30000);
    const hook = data.answers?.hook_angle?.choice, stage = data.answers?.funnel_stage?.choice;
    return { ...a, hookAngle: hookAngles[hook as keyof typeof hookAngles] || undefined, funnelStage: funnelStages[stage as keyof typeof funnelStages] || undefined, jevConfidence: data.answers?.hook_angle?.confidence };
  } catch { return a; }
}

export async function adIngest(domain: string, region: string): Promise<AdReport | null> {
  if (!hasTreg()) return null;
  const brand = domain.split('.')[0].toLowerCase();
  const calls = await Promise.allSettled([google(domain), meta(brand, region), linkedin(brand, region), tiktok(brand)]);
  const ads = calls.flatMap(c => c.status === 'fulfilled' ? c.value : []);
  if (!ads.length) return null;
  const winners = ads.filter(a => a.daysActive >= 60 || a.platform === 'LINKEDIN');
  const triaged = new Map(await Promise.all(winners.slice(0, 14).map(async a => [a.id + a.platform, await triageAd(a)] as const)));
  const out = ads.map(a => triaged.get(a.id + a.platform) || a);
  const byPlatform: Record<string, number> = {}; out.forEach(a => { byPlatform[a.platform] = (byPlatform[a.platform] || 0) + 1; });
  return { ads: out, provenWinners: out.filter(a => a.daysActive >= 60).length, byPlatform, cost: 0 };
}
