import { get, put } from '@/lib/store';
import { fetchPublic } from '@/lib/net';
import type { Snapshot, Snippet } from '@/lib/types';
export function isFresh(date: string, now = Date.now()) { const age = now - Date.parse(date); return age >= 0 && age < 7 * 86400000; }
export const domainOf = (url: string) => new URL(url).hostname.toLowerCase();
const channels = ['reviews / G2', 'pricing', 'ad copy', 'traffic', 'social', 'changelog / news'];
const samples = ['Pricing increases and hidden fees make ROI difficult to justify.', 'Onboarding is confusing and the workflow is slow for daily operators.', 'Save time with an all-in-one platform. Pricing requires a sales call.', 'Acquisition costs are expensive; budget predictability matters.', 'Setup is difficult, but the team likes the interface.', 'New onboarding workflow and transparent billing released this quarter.'];
export async function ingest(url: string): Promise<{ snapshot: Snapshot; cached: boolean }> {
  const domain = domainOf(url), cached = await get<Snapshot>('snapshot:' + domain);
  if (cached && isFresh(cached.fetchedAt)) return { snapshot: cached, cached: true };
  let visits = 65000, router = 'deterministic traffic estimate', trafficSource: 'live' | 'simulated' = 'simulated';
  if (process.env.SIMILARWEB_API_KEY) {
    try {
      const d = new Date(); d.setUTCMonth(d.getUTCMonth() - 2); const month = d.toISOString().slice(0, 7);
      const r = await fetch(`https://api.similarweb.com/v1/website/${domain}/total-traffic-and-engagement/visits?api_key=${encodeURIComponent(process.env.SIMILARWEB_API_KEY)}&start_date=${month}&end_date=${month}&main_domain_only=false&granularity=monthly`, { signal: AbortSignal.timeout(6000) });
      if (!r.ok) throw new Error('Similarweb unavailable'); const data = await r.json(); const n = data.visits?.[0]?.visits;
      if (typeof n !== 'number') throw new Error('No traffic result'); visits = n; router = 'Similarweb'; trafficSource = 'live';
    } catch { router = 'Similarweb unavailable → simulated'; }
  }
  if (visits < 100000 && process.env.APIFY_TOKEN && process.env.APIFY_ACTOR_ID) {
    try {
      const r = await fetch(`https://api.apify.com/v2/acts/${encodeURIComponent(process.env.APIFY_ACTOR_ID)}/run-sync-get-dataset-items?token=${encodeURIComponent(process.env.APIFY_TOKEN)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startUrls: [{ url }] }), signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error('Apify unavailable'); const data = await r.json(); const n = data[0]?.visits;
      if (typeof n !== 'number') throw new Error('Actor must return visits'); visits = n; router = 'Apify (<100k route)'; trafficSource = 'live';
    } catch { router += ' → Apify unavailable (simulated fallback)'; }
  } else if (visits < 100000 && process.env.ONELOOKUP_API_URL && process.env.ONELOOKUP_API_KEY) {
    try { const r = await fetchPublic(process.env.ONELOOKUP_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.ONELOOKUP_API_KEY}` }, body: JSON.stringify({ domain }) }); const d = await r.json(); if (!r.ok || typeof d.visits !== 'number') throw new Error('Invalid traffic'); visits = d.visits; trafficSource = 'live'; router = '1Lookup adapter'; } catch { router += ' → 1Lookup unavailable'; }
  }
  const snippets = await Promise.all(channels.map(async (channel, i): Promise<Snippet> => {
    let text = samples[i], source: Snippet['source'] = 'simulated';
    if (channel === 'pricing') {
      for (const route of ['/pricing', '/']) {
        try { const r = await fetchPublic(new URL(route, url).toString()); if (!r.ok) continue; const html = (await r.text()).slice(0, 180000); const clean = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); if (clean.length > 40) { text = clean.slice(0, 2400); source = 'live'; break; } } catch { /* Offline-safe deterministic evidence. */ }
      }
    }
    if (channel === 'traffic') { text = `${visits.toLocaleString('en-US')} estimated monthly visits. ${router}. Acquisition costs and budget efficiency require validation.`; source = trafficSource; }
    return { id: `${domain}:${i}`, domain, channel, text, source };
  }));
  const snapshot = { domain, snippets, visits, router, fetchedAt: new Date().toISOString() }; await put('snapshot:' + domain, snapshot); return { snapshot, cached: false };
}
