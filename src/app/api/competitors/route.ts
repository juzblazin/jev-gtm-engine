import { normalizeHost, suggestions, type CompetitorSuggestion } from '@/lib/competitors';

const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

type SimilarSite = { domain?: string; title?: string; description?: string; traffic?: { total_visits?: number }; images?: { favicon_url?: string }; rankings?: { global?: { rank?: number | null }; category?: { rank?: number | null } } };

function validHost(value: string) {
  try { const host = normalizeHost(value); return DOMAIN_RE.test(host) ? host : ''; } catch { return ''; }
}

export async function GET(req: Request) {
  let domain: string;
  try { domain = normalizeHost(new URL(req.url).searchParams.get('domain') || ''); } catch { return Response.json({ error: 'Enter a valid public domain.' }, { status: 400 }); }
  if (!DOMAIN_RE.test(domain)) return Response.json({ error: 'Enter a valid public domain.' }, { status: 400 });
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
  if (process.env.SIMILARWEB_API_KEY) {
    try { const r = await fetch(`https://api.similarweb.com/v1/website/${domain}/similar-sites/similarsites?api_key=${encodeURIComponent(process.env.SIMILARWEB_API_KEY)}`, { signal: AbortSignal.timeout(6000) }); if (!r.ok) throw new Error(); const data = await r.json(); const hosts = (data.similar_sites || data.similarSites || []).flatMap((s: { url?: string; site?: string }) => { const h = validHost(s.url || s.site || ''); return h ? [h] : []; }); const domains = [...new Set<string>(hosts)].filter(s => s !== domain).slice(0, 8); if (domains.length) return Response.json({ competitors: domains.map(d => ({ domain: d })), domains, source: 'live' }); } catch { /* Deterministic discovery remains available offline. */ }
  }
  const fallback = suggestions(domain).map(d => ({ domain: d }));
  return Response.json({ competitors: fallback, domains: fallback.map(c => c.domain), source: 'simulated' });
}
