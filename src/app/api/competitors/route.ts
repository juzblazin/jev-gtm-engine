import { normalizeHost, suggestions } from '@/lib/competitors';
export async function GET(req: Request) {
  let domain: string;
  try { domain = normalizeHost(new URL(req.url).searchParams.get('domain') || ''); } catch { return Response.json({ error: 'Enter a valid public domain.' }, { status: 400 }); }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return Response.json({ error: 'Enter a valid public domain.' }, { status: 400 });
  if (process.env.SIMILARWEB_API_KEY) {
    try { const r = await fetch(`https://api.similarweb.com/v1/website/${domain}/similar-sites/similarsites?api_key=${encodeURIComponent(process.env.SIMILARWEB_API_KEY)}`, { signal: AbortSignal.timeout(6000) }); if (!r.ok) throw new Error(); const data = await r.json(); const hosts = (data.similar_sites || data.similarSites || []).flatMap((s: { url?: string; site?: string }) => { try { return [normalizeHost(s.url || s.site || '')]; } catch { return []; } }); const domains = [...new Set<string>(hosts)].filter(s => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s) && s !== domain).slice(0, 8); if (domains.length) return Response.json({ domains, source: 'live' }); } catch { /* Deterministic discovery remains available offline. */ }
  }
  return Response.json({ domains: suggestions(domain), source: 'simulated' });
}
