import { normalizeHost, suggestions, type CompetitorSuggestion } from '@/lib/competitors';
import { aisaSimilarSites, hasAisa } from '@/lib/aisa';
import { hasTreg, tregCall, tregPost } from '@/lib/treg';
import { apifySimilarweb, hasApify, similarwebSites } from '@/lib/apify';

const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

/* Keyword-overlap rankings surface mega-domains that share terms with every site;
   they are never real competitors, so the last-resort ranking drops them. */
const HUB_DOMAINS = new Set(['youtube.com', 'facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'reddit.com', 'wikipedia.org', 'quora.com', 'linkedin.com', 'pinterest.com', 'tiktok.com', 'amazon.com', 'apple.com', 'google.com', 'microsoft.com', 'nytimes.com', 'bing.com', 'yahoo.com', 'medium.com', 'github.com', 'wordpress.com', 'blogspot.com', 'tumblr.com']);

type SimilarSite = { domain?: string; title?: string; description?: string; traffic?: { total_visits?: number }; images?: { favicon_url?: string }; rankings?: { global?: { rank?: number | null }; category?: { rank?: number | null } } };

function validHost(value: string) {
  try { const host = normalizeHost(value); return DOMAIN_RE.test(host) ? host : ''; } catch { return ''; }
}

export async function GET(req: Request) {
  let domain: string;
  try { domain = normalizeHost(new URL(req.url).searchParams.get('domain') || ''); } catch { return Response.json({ error: 'Enter a valid public domain.' }, { status: 400 }); }
  if (!DOMAIN_RE.test(domain)) return Response.json({ error: 'Enter a valid public domain.' }, { status: 400 });
  /* Primary: Similarweb similar-sites and search competitors via the Apify MCP
     gateway (~$0.03/run) — replaces the Similarweb API, DataBee and AIsa below. */
  if (hasApify()) {
    try {
      const row = await apifySimilarweb(domain, ['similar_sites', 'search_competitors'], 120000);
      const seen = new Set<string>();
      const competitors: CompetitorSuggestion[] = [];
      for (const s of similarwebSites(row || {})) {
        const host = validHost(s.domain);
        if (!host || host === domain || seen.has(host) || HUB_DOMAINS.has(host)) continue;
        seen.add(host);
        competitors.push({ domain: host, title: s.title, description: s.description, visits: s.visits, globalRank: s.globalRank ?? null });
        if (competitors.length >= 8) break;
      }
      if (competitors.length) return Response.json({ competitors, domains: competitors.map(c => c.domain), source: 'apify' });
      /* A confirmed not_found row means the source has no coverage for the domain;
         report that instead of inventing peers, matching the DataBee contract. */
      if (row?.status === 'not_found') return Response.json({ competitors: [], domains: [], source: 'apify', coverage: 'insufficient_data' });
    } catch { /* Other providers remain available when Apify is unreachable. */ }
  }
  if (process.env.DATABEE_API_KEY) {
    try {
      const r = await fetch(`https://api.databee.dev/siteatlas/site-similar?url=${encodeURIComponent(domain)}`, { headers: { Authorization: `Bearer ${process.env.DATABEE_API_KEY}` }, signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error();
      const data = await r.json();
      const seen = new Set<string>();
      const competitors: CompetitorSuggestion[] = [];
      for (const s of (data.similar_sites || []) as SimilarSite[]) {
        const host = validHost(s.domain || '');
        if (!host || host === domain || seen.has(host)) continue;
        seen.add(host);
        competitors.push({ domain: host, title: s.title, description: s.description, visits: typeof s.traffic?.total_visits === 'number' ? s.traffic.total_visits : undefined, favicon: s.images?.favicon_url, globalRank: s.rankings?.global?.rank ?? null, categoryRank: s.rankings?.category?.rank ?? null });
        if (competitors.length >= 8) break;
      }
      /* A successful DataBee answer is authoritative: no similar sites means the index has no
         coverage for this domain, so report that honestly instead of inventing peers. */
      if (competitors.length || data.meta?.data_coverage === 'insufficient_data' || data.status === 'insufficient_data') {
        return Response.json({ competitors, domains: competitors.map(c => c.domain), source: 'databee', coverage: data.meta?.data_coverage || data.status, self: { domain, title: data.website?.title, category: data.website?.category?.name, visits: typeof data.traffic?.total_visits === 'number' ? data.traffic.total_visits : undefined } });
      }
    } catch { /* Other providers remain available when DataBee is unreachable. */ }
  }
  /* AIsa REST: real Similarweb similar-sites (audience affinity + global rank).
     Primary when the key has balance; falls through to treg on 402/errors. */
  if (hasAisa()) {
    try {
      const sites = await aisaSimilarSites(domain, 8);
      const seen = new Set<string>();
      const competitors: CompetitorSuggestion[] = [];
      for (const site of sites) {
        const host = validHost(site.domain || '');
        if (!host || host === domain || seen.has(host)) continue;
        seen.add(host);
        competitors.push({ domain: host, description: site.category ? site.category.replace(/_/g, ' ').toLowerCase() : undefined, globalRank: site.rank ?? null });
        if (competitors.length >= 8) break;
      }
      if (competitors.length) return Response.json({ competitors, domains: competitors.map(c => c.domain), source: 'aisa' });
    } catch { /* treg discovery remains available when the key lacks balance. */ }
  }
  /* treg catalog: PredictLeads similar-companies returns JSONAPI data (score,
     position, reason) plus an included[] map of company id to domain/name; it is
     the closest catalog tool to Similarweb's similar-sites. DataForSEO
     competitors-domain (shared keywords) is the fallback when it misses. */
  if (hasTreg()) {
    try {
      const { data } = await tregCall<{ data?: { attributes?: { score?: number; position?: number; reason?: string }; relationships?: { similar_company?: { data?: { id?: string } } } }[]; included?: { id?: string; type?: string; attributes?: { domain?: string; company_name?: string } }[] }>('predictleads.companies.similar', { company_id_or_domain: domain, limit: 8 }, 45000);
      const byId = new Map((data.included || []).map(x => [x.id, x.attributes]));
      const seen = new Set<string>();
      const competitors: CompetitorSuggestion[] = [];
      for (const item of data.data || []) {
        const comp = byId.get(item.relationships?.similar_company?.data?.id);
        const host = validHost(comp?.domain || '');
        if (!host || host === domain || seen.has(host)) continue;
        seen.add(host);
        competitors.push({ domain: host, title: comp?.company_name || undefined, description: item.attributes?.reason || undefined, globalRank: item.attributes?.position ?? null });
        if (competitors.length >= 8) break;
      }
      if (competitors.length) return Response.json({ competitors, domains: competitors.map(c => c.domain), source: 'treg' });
    } catch { /* SpyFu keyword-overlap discovery remains available. */ }
    try {
      const { data } = await tregCall<{ results?: { domain?: string; commonTerms?: number }[] }>('spyfu.google.domain.competitors', { domain, sortBy: 'CommonTerms', sortOrder: 'Descending', pageSize: 12 }, 30000);
      const seen = new Set<string>();
      const competitors: CompetitorSuggestion[] = [];
      for (const item of data.results || []) {
        const host = validHost(item.domain || '');
        if (!host || host === domain || seen.has(host)) continue;
        seen.add(host);
        competitors.push({ domain: host });
        if (competitors.length >= 8) break;
      }
      if (competitors.length) return Response.json({ competitors, domains: competitors.map(c => c.domain), source: 'treg' });
    } catch { /* DataForSEO keyword overlap remains available. */ }
    try {
      const { data } = await tregPost<{ tasks?: { result?: { items?: { domain?: string; full_domain_metrics?: { organic?: { etv?: number } } }[] }[] }[] }>('dataforseo.x.dataforseo-labs-google-competitors-domain-live', [{ target: domain, location_code: 2840, language_code: 'en', limit: 15 }], 30000);
      const items = data.tasks?.[0]?.result?.[0]?.items || [];
      const seen = new Set<string>();
      const competitors: CompetitorSuggestion[] = [];
      for (const item of items) {
        const host = validHost(item.domain || '');
        if (!host || host === domain || seen.has(host) || HUB_DOMAINS.has(host)) continue;
        seen.add(host);
        const etv = item.full_domain_metrics?.organic?.etv;
        competitors.push({ domain: host, visits: typeof etv === 'number' ? Math.round(etv) : undefined });
        if (competitors.length >= 8) break;
      }
      if (competitors.length) return Response.json({ competitors, domains: competitors.map(c => c.domain), source: 'treg' });
    } catch { /* AIsa, Similarweb direct or simulated discovery remains available. */ }
  }
  if (process.env.SIMILARWEB_API_KEY) {
    try { const r = await fetch(`https://api.similarweb.com/v1/website/${domain}/similar-sites/similarsites?api_key=${encodeURIComponent(process.env.SIMILARWEB_API_KEY)}`, { signal: AbortSignal.timeout(6000) }); if (!r.ok) throw new Error(); const data = await r.json(); const hosts = (data.similar_sites || data.similarSites || []).flatMap((s: { url?: string; site?: string }) => { const h = validHost(s.url || s.site || ''); return h ? [h] : []; }); const domains = [...new Set<string>(hosts)].filter(s => s !== domain).slice(0, 8); if (domains.length) return Response.json({ competitors: domains.map(d => ({ domain: d })), domains, source: 'live' }); } catch { /* Deterministic discovery remains available offline. */ }
  }
  const fallback = suggestions(domain).map(d => ({ domain: d }));
  return Response.json({ competitors: fallback, domains: fallback.map(c => c.domain), source: 'simulated' });
}
