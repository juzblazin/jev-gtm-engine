import { get, put } from '@/lib/store';
import { fetchPublic } from '@/lib/net';
import { databeeOverview, hasDatabee } from '@/lib/databee';
import { seoIngest } from './seo';
import { reviewIngest } from './reviews';
import { adIngest } from './ads';
import { creatorIngest } from './creators';
import { pricingIngest } from './pricing';
import { persistCards, toEvidenceCards } from './cards';
import type { Snapshot, Snippet } from '@/lib/types';
import { seededMetrics } from '@/lib/metrics';
import { aisaUse, hasAisa } from '@/lib/aisa';
import { hasTreg, tregPost } from '@/lib/treg';
import { apifySimilarweb, hasApify, similarwebOverview } from '@/lib/apify';

export function isFresh(date: string, now = Date.now()) { const age = now - Date.parse(date); return age >= 0 && age < 7 * 86400000; }
export const domainOf = (url: string) => new URL(url).hostname.toLowerCase();
const locations: Record<string, number> = { US: 2840, UK: 2826, EU: 2276, Global: 2840 };
function pickNum(data: unknown, keys: string[]): number | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const d = data as Record<string, unknown>;
  for (const k of keys) { if (typeof d[k] === 'number') return d[k] as number; }
  for (const v of Object.values(d)) { if (v && typeof v === 'object' && !Array.isArray(v)) { const n = pickNum(v, keys); if (n !== undefined) return n; } }
  return undefined;
}
function pickNestedVisits(data: unknown): number | undefined {
  if (Array.isArray(data)) { for (const it of data) { const n = pickNum(it, ['visits']); if (n !== undefined) return n; } return undefined; }
  if (data && typeof data === 'object') { for (const v of Object.values(data as Record<string, unknown>)) { if (Array.isArray(v)) { const n = pickNestedVisits(v); if (n !== undefined) return n; } else if (v && typeof v === 'object') { const n = pickNestedVisits(v); if (n !== undefined) return n; } } }
  return undefined;
}
function pickTrend(data: unknown): number[] {
  const series: number[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(it => { const n = it && typeof it === 'object' ? pickNum(it, ['visits']) : typeof it === 'number' ? it : undefined; if (n !== undefined) series.push(n); }); return; }
    if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(walk);
  };
  walk(data);
  return series.slice(-12);
}
export const channels = ['reviews / G2', 'pricing', 'ad copy', 'traffic', 'social', 'changelog / news', 'seo / keywords'];
const samples = ['Pricing increases and hidden fees make ROI difficult to justify.', 'Onboarding is confusing and the workflow is slow for daily operators.', 'Save time with an all-in-one platform. Pricing requires a sales call.', 'Acquisition costs are expensive; budget predictability matters.', 'Setup is difficult, but the team likes the interface.', 'New onboarding workflow and transparent billing released this quarter.', 'Organic rankings hold steady across core terms.'];
export async function ingest(url: string, progress: (channel: string, percent: number) => void = () => {}, region = 'US'): Promise<{ snapshot: Snapshot; cached: boolean }> {
  const domain = domainOf(url), cached = await get<Snapshot>('snapshot:' + domain);
  if (cached?.metrics && isFresh(cached.fetchedAt)) { channels.forEach(c => progress(c, 100)); return { snapshot: cached, cached: true }; }
  const metrics = seededMetrics(domain);
  let visits = metrics.visits.value, router = 'deterministic traffic estimate', trafficSource: 'live' | 'simulated' = 'simulated';
  progress('traffic', 10);
  /* Primary: agentx/similarweb-pro-scraper via the Apify MCP gateway. One paid run
     (~$0.03) covers engagement, trend, channels, geography, keywords, referrals and
     backlinks — replacing the Similarweb API, DataBee and AIsa calls below. */
  if (hasApify()) {
    try {
      const row = await apifySimilarweb(domain, ['website_performance', 'keywords', 'referral'], 180000);
      const overview = row ? similarwebOverview(row) : null;
      if (!overview) throw new Error('Apify returned no coverage');
      Object.assign(metrics, overview.metrics); visits = overview.visits; router = 'Apify · Similarweb Pro'; trafficSource = 'live';
    } catch { router = 'Apify unavailable'; }
  }
  if (trafficSource !== 'live' && hasDatabee()) {
    try {
      const overview = await databeeOverview(domain);
      if (overview) { Object.assign(metrics, overview.metrics); visits = overview.visits; router = 'DataBee · Similarweb estimates'; trafficSource = 'live'; }
      else router = 'DataBee returned no coverage';
    } catch { router = 'DataBee unavailable'; }
  }
  if (process.env.SIMILARWEB_API_KEY) {
    try {
      const d = new Date(); d.setUTCMonth(d.getUTCMonth() - 2); const month = d.toISOString().slice(0, 7);
      const r = await fetch(`https://api.similarweb.com/v1/website/${domain}/total-traffic-and-engagement/visits?api_key=${encodeURIComponent(process.env.SIMILARWEB_API_KEY)}&start_date=${month}&end_date=${month}&main_domain_only=false&granularity=monthly`, { signal: AbortSignal.timeout(6000) });
      if (!r.ok) throw new Error('Similarweb unavailable'); const data = await r.json(); const n = data.visits?.[0]?.visits;
      if (typeof n !== 'number') throw new Error('No traffic result'); visits = n; router = 'Similarweb'; trafficSource = 'live';
      metrics.trend = { value: data.visits.map((v: { visits: number }) => v.visits), source: 'live' };
    } catch { router = 'Similarweb unavailable → simulated'; }
  }
  if (trafficSource !== 'live' && hasTreg()) {
    try {
      const { data } = await tregPost<{ tasks?: { result?: { items?: { metrics?: { organic?: { etv?: number }; paid?: { etv?: number } } }[] }[] }[] }>('dataforseo.x.dataforseo-labs-google-bulk-traffic-estimation-live', [{ targets: [domain], location_code: locations[region] || 2840, language_code: 'en' }], 30000);
      const m = data.tasks?.[0]?.result?.[0]?.items?.[0]?.metrics;
      const etv = (m?.organic?.etv || 0) + (m?.paid?.etv || 0);
      if (!etv) throw new Error('No traffic estimate');
      visits = Math.round(etv); router = 'DataForSEO via Treg'; trafficSource = 'live';
    } catch { router += ' → Treg traffic unavailable (simulated fallback)'; }
  }
  if (trafficSource !== 'live' && hasAisa()) {
    try {
      const d = new Date(); d.setUTCMonth(d.getUTCMonth() - 1); const month = d.toISOString().slice(0, 7);
      const { data } = await aisaUse<Record<string, unknown>>('get_similarweb_traffic_engagement', { domain, start_date: month, end_date: month, metrics: 'visits,bounce_rate,pages_per_visit,average_visit_duration', main_domain_only: true, granularity: 'monthly', web_source: 'total' }, { capUsd: 0.5 });
      const n = pickNum(data, ['visits', 'total_visits', 'value']) ?? pickNestedVisits(data);
      if (typeof n !== 'number') throw new Error('No traffic result');
      visits = n; router = 'AIsa · Similarweb engagement'; trafficSource = 'live';
      const live = <T>(value: T) => ({ value, source: 'live' as const });
      const bounce = pickNum(data, ['bounce_rate', 'bounceRate']);
      if (typeof bounce === 'number') metrics.bounce = live(Math.round((bounce > 1 ? bounce : bounce * 100) * 10) / 10);
      const pages = pickNum(data, ['pages_per_visit', 'pagesPerVisit']);
      if (typeof pages === 'number') metrics.pages = live(Math.round(pages * 10) / 10);
      const duration = pickNum(data, ['average_visit_duration', 'avg_visit_duration', 'averageVisitDuration']);
      if (typeof duration === 'number') metrics.duration = live(Math.round(duration));
      const trend = pickTrend(data);
      if (trend.length) metrics.trend = live(trend);
    } catch { router += ' → AIsa unavailable (simulated fallback)'; }
  }
  if (visits < 100000 && process.env.ONELOOKUP_API_URL && process.env.ONELOOKUP_API_KEY) {
    try { const r = await fetchPublic(process.env.ONELOOKUP_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.ONELOOKUP_API_KEY}` }, body: JSON.stringify({ domain }) }); const d = await r.json(); if (!r.ok || typeof d.visits !== 'number') throw new Error('Invalid traffic'); visits = d.visits; trafficSource = 'live'; router = '1Lookup adapter'; } catch { router += ' → 1Lookup unavailable'; }
  }
  const seoPromise = seoIngest(domain, region).catch(() => null);
  const reviewPromise = reviewIngest(domain).catch(() => null);
  const adPromise = adIngest(domain, region).catch(() => null);
  const creatorPromise = creatorIngest(domain).catch(() => null);
  const pricingPromise = pricingIngest(domain).catch(() => null);
  const snippets = await Promise.all(channels.map(async (channel, i): Promise<Snippet> => {
    progress(channel, 25);
    let text = samples[i], source: Snippet['source'] = 'simulated';
    if (channel === 'reviews / G2') {
      const report = await reviewPromise;
      if (report && report.reviews.length) {
        const solid = report.reviews.filter(r => (r.confidence || 0) >= 0.9), top = [...solid].sort((a, b) => (b.churn || 0) - (a.churn || 0))[0];
        const cats = new Map<string, number>(); solid.forEach(r => cats.set(r.category || '?', (cats.get(r.category || '?') || 0) + 1));
        const topCat = [...cats.entries()].sort((a, b) => b[1] - a[1])[0];
        text = `${report.reviews.length} reviews/threads mined from Trustpilot and Reddit (180-day window, ${report.totalScanned} scanned). ${solid.length} passed the 90% confidence gate. Top friction: ${topCat ? `${topCat[0]} (${topCat[1]})` : 'none'}.${top?.evidence ? ` Verbatim: "${top.evidence.slice(0, 220)}"` : ''}`;
        source = 'live';
        metrics.reviews = { value: report, source: 'live' };
      }
    }
    if (channel === 'pricing') {
      const report = await pricingPromise;
      if (report) {
        const gates = report.tiers.flatMap(t => t.gates).slice(0, 3).join('; ');
        text = `${report.tiers.length} pricing tiers at ${report.pricingUrl} (${report.valueMetric}, ${report.freeMotion}${report.annualDiscountPct ? `, ${report.annualDiscountPct}% annual discount` : ''}).${gates ? ` Gates: ${gates}.` : ''}${report.vulnerability ? ` Vulnerability: ${report.vulnerability}.` : ''}${report.changelog.length ? ` ${report.changelog.length} changelog entries in 90 days.` : ''} Snapshot ${report.snapshotHash.slice(0, 12)}.`;
        source = 'live';
        metrics.pricingIntel = { value: report, source: 'live' };
      } else for (const route of ['/pricing', '/']) {
        try { const r = await fetchPublic(new URL(route, url).toString()); if (!r.ok) continue; const html = (await r.text()).slice(0, 180000); const clean = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); if (clean.length > 40) { text = clean.slice(0, 2400); source = 'live'; break; } } catch { /* Offline-safe deterministic evidence. */ }
      }
    }
    if (channel === 'social') {
      const report = await creatorPromise;
      if (report && report.posts.length) {
        const sponsored = report.posts.filter(p => p.sponsored).length, poachable = report.posts.filter(p => (p.poachability || 0) >= 4);
        const tiers = report.posts.reduce((m, p) => ({ ...m, [p.tier]: (m[p.tier] || 0) + 1 }), {} as Record<string, number>);
        text = `${report.posts.length} creator posts found across YouTube, LinkedIn and X — ${Object.entries(tiers).map(([t, n]) => `${n} ${t}`).join(', ')}. ${sponsored} carrying sponsorship disclosures. ${poachable.length} high-poachability creators${poachable[0] ? ` (e.g. ${poachable[0].name} on ${poachable[0].platform})` : ''}.`;
        source = 'live';
        metrics.creators = { value: report, source: 'live' };
      }
    }
    if (channel === 'ad copy') {
      const report = await adPromise;
      if (report && report.ads.length) {
        const platforms = Object.entries(report.byPlatform).map(([p, n]) => `${n} ${p.toLowerCase()}`).join(', ');
        const hooks = [...new Set(report.ads.map(a => a.hookAngle).filter(Boolean))].slice(0, 3).join(', ');
        const longest = [...report.ads].sort((a, b) => b.daysActive - a.daysActive)[0];
        text = `${report.ads.length} paid creatives across ${platforms}. ${report.provenWinners} proven control winners running 60+ days${longest ? `; longest ${longest.daysActive} days` : ''}.${hooks ? ` Hook angles: ${hooks}.` : ''}`;
        source = 'live';
        metrics.ads = { value: report.ads.slice(0, 6).map(a => ({ platform: a.platform, headline: a.headline || a.advertiser, copy: `${a.format.toLowerCase()} · ${a.daysActive}d active${a.hookAngle ? ` · ${a.hookAngle}` : ''}${a.libraryUrl ? ` · ${a.libraryUrl}` : ''}`, firstSeen: a.firstShown.slice(0, 10) })), source: 'live' };
        metrics.adIntel = { value: report, source: 'live' };
      }
    }
    if (channel === 'seo / keywords') {
      const seo = await seoPromise;
      if (seo) {
        const dropped = seo.keywords.filter(k => (k.positionDiff || 0) <= -5).length, bof = Object.values(seo.funnel).filter(f => f === 'Bottom-of-Funnel Evaluation').length;
        text = `${seo.totalRanked.toLocaleString('en-US')} ranked keywords; ${seo.keywords.length} top by volume. ${dropped} losing 5+ positions, ${seo.decayingPages.length} decaying pages. ${bof} bottom-of-funnel switching terms. Intent radar: ${seo.radar.filter(r => r.velocity > 0).map(r => `${r.keyword} +${r.velocity}%`).join(', ') || (seo.radar.length ? 'flat' : 'no tracked volume for switching queries')}.`;
        source = 'live';
        if (seo.totalRanked) metrics.keywords = { value: seo.totalRanked, source: 'live' };
        if (seo.keywords.length) metrics.topKeywords = { value: seo.keywords.slice(0, 5).map(k => k.keyword), source: 'live' };
        metrics.seo = { value: seo, source: 'live' };
      }
    }
    if (channel === 'traffic') { text = `${visits.toLocaleString('en-US')} estimated monthly visits. ${router}. Acquisition costs and budget efficiency require validation.`; source = trafficSource; }
    progress(channel, 100);
    return { id: `${domain}:${i}`, domain, channel, text, source };
  }));
  metrics.visits = { value: visits, source: trafficSource };
  const snapshot: Snapshot = { domain, snippets, visits, router, metrics, fetchedAt: new Date().toISOString() };
  snapshot.cards = toEvidenceCards(domain, metrics);
  await persistCards(domain, snapshot.cards);
  await put('snapshot:' + domain, snapshot); return { snapshot, cached: false };
}
