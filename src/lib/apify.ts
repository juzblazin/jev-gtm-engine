/* Apify MCP gateway: Similarweb Pro data through https://mcp.apify.com instead of the
   Similarweb API, DataBee or AIsa — the agentx/similarweb-pro-scraper actor is
   pay-per-event (~$0.03/website result), far cheaper than the keyed provider APIs.
   Implements the streamable-HTTP MCP flow directly: initialize once, reuse the
   session id, call the actor as a tool, then hydrate file-backed report sections.
   Run polling uses the plain datasets API because a finished MCP call carries only
   storage ids for long runs. */
import type { SiteMetrics } from './metrics';
import { countries } from './databee';

export function hasApify() { return !!process.env.APIFY_TOKEN; }

const APIFY_MCP = process.env.APIFY_MCP_URL || 'https://mcp.apify.com/?tools=actors,docs,agentx/similarweb-pro-scraper';
const ACTOR = 'agentx/similarweb-pro-scraper';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let nextId = 0;
let sessionId: string | null = null;
let ready: Promise<void> | null = null;
let actorTool: string | null | undefined;

type JsonRpc = { result?: { isError?: boolean; structuredContent?: unknown; content?: { text?: unknown }[]; error?: unknown }; error?: { message?: string } };

async function rpc(method: string, params?: unknown, timeoutMs = 30000): Promise<unknown> {
  const r = await fetch(APIFY_MCP, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${process.env.APIFY_TOKEN}`, ...(sessionId ? { 'mcp-session-id': sessionId } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', ...(method.startsWith('notifications/') ? {} : { id: ++nextId }), method, ...(params ? { params } : {}) }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const sid = r.headers.get('mcp-session-id');
  if (sid) sessionId = sid;
  if (!r.ok) throw new Error(`Apify MCP ${method} HTTP ${r.status}`);
  if (r.status === 202) return null;
  const text = await r.text();
  if (!text.trim()) return null;
  let payload: JsonRpc | null = null;
  if (text.includes('data:')) {
    for (const line of text.split('\n')) { if (line.startsWith('data:')) { try { payload = JSON.parse(line.slice(5)) as JsonRpc; } catch { /* keep last parseable frame */ } } }
  } else payload = JSON.parse(text) as JsonRpc;
  if (!payload) return null;
  if (payload.error) throw new Error(`Apify MCP ${method}: ${payload.error.message || 'rpc error'}`);
  const result = payload.result as { isError?: boolean; structuredContent?: unknown; content?: { text?: string }[] } | undefined;
  if (result?.isError) throw new Error((result.structuredContent as { error?: { message?: string } })?.error?.message || 'Apify MCP tool error');
  if (result?.structuredContent) return result.structuredContent as unknown;
  const inner = result?.content?.[0]?.text;
  if (typeof inner === 'string') { try { return JSON.parse(inner); } catch { return inner; } }
  return result;
}

/* The streamable-HTTP server expects the initialize handshake before tools/call and
   tracks the session through the mcp-session-id response header. */
async function ensureReady() {
  if (!ready) {
    const p = (async () => {
      await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'boo-gtm-engine', version: '1.0.0' } });
      await rpc('notifications/initialized');
    })();
    ready = p;
    p.catch(() => { if (ready === p) { ready = null; sessionId = null; } });
  }
  return ready;
}

async function callTool(name: string, args: Record<string, unknown>, timeoutMs: number) { await ensureReady(); return rpc('tools/call', { name, arguments: args }, timeoutMs); }

/* The server URL exposes the actor as a dedicated tool; its name varies by server
   version, so resolve it from tools/list once instead of guessing. */
async function similarwebTool(): Promise<string | null> {
  if (actorTool === undefined) {
    actorTool = null;
    try {
      await ensureReady();
      const list = await rpc('tools/list') as { tools?: { name?: string }[] } | null;
      const tools = list?.tools || [];
      actorTool = tools.map(t => t.name || '').find(n => n.toLowerCase().includes('similarweb')) || null;
    } catch { actorTool = null; }
  }
  return actorTool;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/* Result shape varies: a finished actor tool returns dataset items directly, while
   a still-running call returns the run descriptor carrying the dataset id. */
function extractItems(out: unknown): Record<string, unknown>[] {
  if (Array.isArray(out)) return out.filter(isObj);
  if (isObj(out)) {
    for (const k of ['items', 'dataset_items', 'datasetItems', 'results', 'rows', 'data']) {
      const v = out[k];
      if (Array.isArray(v)) { const f = v.filter(isObj); if (f.length) return f; }
    }
    for (const v of Object.values(out)) {
      if (isObj(v)) { const f = extractItems(v); if (f.length) return f; }
    }
  }
  return [];
}

function datasetIdOf(out: unknown): string | null {
  if (isObj(out)) {
    for (const k of ['defaultDatasetId', 'datasetId', 'dataset_id']) { const v = out[k]; if (typeof v === 'string' && v) return v; }
    /* MCP run descriptor: storages.datasets.<name>.id carries the dataset id. */
    const datasets = (out.storages as Record<string, unknown> | undefined)?.datasets;
    if (isObj(datasets)) for (const ds of Object.values(datasets)) { const id = isObj(ds) ? ds.id : undefined; if (typeof id === 'string' && id) return id; }
    for (const v of Object.values(out)) { const found = isObj(v) ? datasetIdOf(v) : null; if (found) return found; }
  }
  return null;
}

/* Long runs outlive the MCP wait window; poll the default dataset until the website
   row lands or the deadline passes. A failed run simply never produces a row. */
async function pollDataset(datasetId: string, deadline: number): Promise<Record<string, unknown>[]> {
  for (;;) {
    const r = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?format=json&clean=true`, { headers: { Authorization: `Bearer ${process.env.APIFY_TOKEN}` }, signal: AbortSignal.timeout(20000) });
    if (r.ok) { const items = await r.json() as unknown; if (Array.isArray(items) && items.length) return items.filter(isObj); }
    if (Date.now() > deadline) throw new Error('Apify actor run timed out');
    await sleep(4000);
  }
}

export type SwSection = { status?: string; item_count?: number };
export type SwRow = Record<string, unknown> & {
  website?: string;
  status?: string;
  report_context?: Record<string, { storage?: string; file_url?: string | null; item_count?: number; sections?: Record<string, SwSection[] | SwSection> }>;
};

/* Large reports arrive file-backed: the report key is null and report_context links
   to a JSON file with the same section shape. Hydrate so parsers see one shape. */
async function hydrateFiles(row: SwRow) {
  await Promise.all(Object.entries(row.report_context || {}).map(async ([key, meta]) => {
    if (row[key] != null || meta?.storage !== 'file' || !meta.file_url) return;
    try {
      const r = await fetch(meta.file_url, { signal: AbortSignal.timeout(30000) });
      if (r.ok) { row[key] = await r.json(); return; }
      const retry = await fetch(meta.file_url, { headers: { Authorization: `Bearer ${process.env.APIFY_TOKEN}` }, signal: AbortSignal.timeout(30000) });
      if (retry.ok) row[key] = await retry.json();
    } catch { /* section stays unavailable */ }
  }));
}

/* One actor run, one dataset row. reports selects from the actor's 27 report pages;
   cost scales with delivered source items (~$0.004 per 1,000). */
export async function apifySimilarweb(domain: string, reports: string[], timeoutMs = 150000): Promise<SwRow | null> {
  const deadline = Date.now() + timeoutMs;
  const input = { website: domain, reports };
  const tool = await similarwebTool();
  const out = tool
    ? await callTool(tool, input, timeoutMs)
    : await callTool('call-actor', { actor: ACTOR, input }, timeoutMs);
  let items = extractItems(out);
  if (!items.length) {
    const datasetId = datasetIdOf(out);
    if (!datasetId) return null;
    items = await pollDataset(datasetId, deadline);
  }
  const row = (items.find(i => typeof i.website === 'string' || i.report_context) || items[0]) as SwRow;
  await hydrateFiles(row);
  return row;
}

/* Every report maps section names to record arrays; section names vary by report, so
   the readers below match on the business fields inside each record instead. */
function* allRecords(row: SwRow): Generator<{ report: string; section: string; rec: Record<string, unknown> }> {
  for (const [report, value] of Object.entries(row)) {
    if (['report_context', 'item_count', 'status', 'processor', 'processed_at', 'website'].includes(report) || !isObj(value)) continue;
    for (const [section, records] of Object.entries(value)) {
      if (!Array.isArray(records)) continue;
      for (const rec of records) if (isObj(rec)) yield { report, section: section.toLowerCase(), rec };
    }
  }
}

const num = (r: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) { const v = r[k]; if (typeof v === 'number' && Number.isFinite(v)) return v; if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v); }
  return undefined;
};
const str = (r: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) { const v = r[k]; if (typeof v === 'string' && v.trim()) return v; }
  return undefined;
};
/* Shares keep their source scale: treat <=1 as a fraction, larger as a percent. */
const pct = (v?: number) => v == null ? undefined : Math.round((v <= 1 ? v * 100 : v) * 10) / 10;

/* Geography records carry numeric ISO-3166 country ids (840 = US). */
const numericCountries: Record<number, string> = { 840: 'US', 826: 'GB', 392: 'JP', 76: 'BR', 356: 'IN', 124: 'CA', 276: 'DE', 484: 'MX', 724: 'ES', 616: 'PL', 250: 'FR', 380: 'IT', 528: 'NL', 752: 'SE', 578: 'NO', 208: 'DK', 246: 'FI', 36: 'AU', 554: 'NZ', 710: 'ZA', 643: 'RU', 804: 'UA', 156: 'CN', 410: 'KR', 360: 'ID', 702: 'SG', 704: 'VN', 764: 'TH', 608: 'PH', 586: 'PK', 458: 'MY', 50: 'BD', 792: 'TR', 756: 'CH', 40: 'AT', 56: 'BE', 372: 'IE', 620: 'PT', 300: 'GR', 203: 'CZ', 642: 'RO', 348: 'HU', 376: 'IL', 682: 'SA', 784: 'AE', 344: 'HK', 158: 'TW', 32: 'AR', 152: 'CL', 170: 'CO', 604: 'PE', 818: 'EG', 566: 'NG', 404: 'KE', 504: 'MA' };

/* Channel metric suffixes (data.total.<suffix>) to the display names the UI uses. */
const channelNames: Record<string, string> = { direct: 'Direct', search_organic: 'Search', search_paid: 'Paid', social_organic: 'Social', social_paid: 'Social', email: 'Email', referrals: 'Referral', display_ads: 'Display', affiliates: 'Affiliate', gen_ai: 'AI referrals', partners: 'Affiliate' };

/* A date-like entry anywhere in a record's dimensions wins over the shared period. */
const dimDate = (rec: Record<string, unknown>) => (Array.isArray(rec.dimensions) ? rec.dimensions.find((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}/.test(d)) : undefined);

export function similarwebOverview(row: SwRow): { visits: number; metrics: Partial<SiteMetrics> } | null {
  const live = <T>(value: T) => ({ value, source: 'live' as const });
  const metrics: Partial<SiteMetrics> = {};
  const trendMonths = new Map<string, number>();
  const channelTotals = new Map<string, number>();
  const channelShares = new Map<string, number>();
  const deviceTotals = { desktop: 0, total: 0 };
  const geo = new Map<string, number>();
  const topCountries = new Map<string, number>();
  const keywords: { kw: string; vol: number }[] = [];
  const referrals: string[] = [];
  let visits: number | undefined;
  let keywordCount = 0;

  for (const { report, section, rec } of allRecords(row)) {
    const v = num(rec, 'monthly_visits', 'visits', 'value');
    const share = pct(num(rec, 'traffic_share', 'total_share', 'filtered_share', 'share', 'users_share', 'organic_share'));
    const metric = str(rec, 'metric') || '';
    if (section.includes('engagement') || section === 'overview') {
      visits ??= num(rec, 'monthly_visits');
      const bounce = num(rec, 'bounce_rate'); if (bounce != null) metrics.bounce = live(pct(bounce) ?? 0);
      const duration = num(rec, 'visit_duration'); if (duration != null) metrics.duration = live(Math.round(duration));
      const pages = num(rec, 'visit_pages'); if (pages != null) metrics.pages = live(Math.round(pages * 10) / 10);
      const kwc = num(rec, 'keyword_count', 'total_count'); if (kwc != null) keywordCount = Math.max(keywordCount, kwc);
      const bc = num(rec, 'backlink_count', 'referring_domains'); if (bc != null) metrics.backlinks = live(Math.round(bc));
    }
    /* Traffic trend arrives as weekly/daily {dimensions:[site,date],value} points;
       aggregate to calendar months so it reads like the monthly trend chart.
       Scoped to website_performance so referral/backlink trend sections stay out. */
    if (v != null && report === 'website_performance' && (section.includes('traffic') || section === 'visits_trend' || section === 'visits')) {
      const key = (dimDate(rec) || str(rec, 'date', 'month', 'period_start') || '').slice(0, 7);
      if (key) trendMonths.set(key, (trendMonths.get(key) || 0) + v);
    }
    if (isObj(rec.series_values)) for (const [k, val] of Object.entries(rec.series_values)) { if (typeof val === 'number') trendMonths.set(k.slice(0, 7), (trendMonths.get(k.slice(0, 7)) || 0) + val); }
    if (isObj(rec.total_traffic)) for (const [k, val] of Object.entries(rec.total_traffic)) { if (typeof val === 'number') trendMonths.set(k.slice(0, 7), (trendMonths.get(k.slice(0, 7)) || 0) + val); }
    /* Channels arrive as absolute visit counts per metric (data.total.direct ...);
       normalize to shares after summing. */
    const channelMatch = metric.match(/^data\.total\.(\w+)$/);
    if (v != null && channelMatch && channelMatch[1] !== 'value' && (section.includes('channel') || report === 'marketing_channels' || section.includes('marketing'))) {
      const name = channelNames[channelMatch[1]] || channelMatch[1];
      channelTotals.set(name, (channelTotals.get(name) || 0) + v);
    } else {
      const channel = str(rec, 'channel', 'source', 'network');
      if (channel && share != null && (section.includes('channel') || section.includes('source') || section.includes('marketing') || section.includes('social'))) {
        channelShares.set(channel, Math.max(channelShares.get(channel) || 0, share));
      }
    }
    if (section === 'devices' && v != null) {
      deviceTotals.total += v;
      if (/desktop/i.test(metric)) deviceTotals.desktop += v;
    } else {
      const device = str(rec, 'device', 'platform');
      if (device && /desktop/i.test(device)) { const ds = pct(num(rec, 'share', 'traffic_share', 'visits_share')); if (ds != null) metrics.desktop = live(ds); }
    }
    const countryCode = str(rec, 'country', 'country_code', 'country_name')
      || (typeof rec.country_id === 'string' && /^[A-Za-z]{2}$/.test(rec.country_id) ? rec.country_id.toUpperCase() : undefined)
      || (typeof rec.country_id === 'number' ? numericCountries[rec.country_id] : undefined);
    if (countryCode && share != null && (section.includes('geo') || section === 'audience' || section.includes('demograph'))) {
      const [name, continent] = countries[countryCode.toUpperCase()] || [countryCode, 'Other'];
      topCountries.set(name, Math.max(topCountries.get(name) || 0, share));
      geo.set(continent, (geo.get(continent) || 0) + share);
    }
    const kw = str(rec, 'keyword');
    if (kw) keywords.push({ kw, vol: num(rec, 'clicks', 'search_volume', 'visits', 'value') || 0 });
    if (report === 'referral' && section === 'referrals') {
      const d = str(rec, 'domain', 'site', 'referring_domain');
      if (d && !referrals.includes(d)) referrals.push(d);
    }
  }

  const sorted = [...trendMonths.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => Math.round(v));
  if (sorted.length) metrics.trend = live(sorted.slice(-12));
  visits ??= sorted[sorted.length - 1];
  if (visits == null) return null;
  /* Two channel shapes resolve to one share list: absolute visit counts get
     normalized; records that already carried shares keep their own scale. */
  const absTotal = [...channelTotals.values()].reduce((s, v) => s + v, 0);
  const mix = absTotal ? [...channelTotals.entries()].map(([name, v]) => ({ name, share: Math.round((v / absTotal) * 1000) / 10 })) : [...channelShares.entries()].map(([name, share]) => ({ name, share }));
  if (mix.length) metrics.mix = live(mix.sort((a, b) => b.share - a.share));
  if (deviceTotals.total > 0 && deviceTotals.desktop > 0) metrics.desktop = live(Math.round((deviceTotals.desktop / deviceTotals.total) * 1000) / 10);
  if (topCountries.size) metrics.countries = live([...topCountries.entries()].map(([name, share]) => ({ name, share: Math.round(share * 10) / 10 })).sort((a, b) => b.share - a.share).slice(0, 8));
  if (geo.size) metrics.regions = live([...geo.entries()].map(([name, share]) => ({ name, share: Math.round(share * 10) / 10 })).sort((a, b) => b.share - a.share));
  if (keywords.length) metrics.topKeywords = live(keywords.sort((a, b) => b.vol - a.vol).slice(0, 8).map(k => k.kw));
  keywordCount = Math.max(keywordCount, keywords.length, (row.report_context?.keywords?.item_count as number | undefined) || 0);
  if (keywordCount) metrics.keywords = live(keywordCount);
  if (referrals.length) metrics.referrals = live(referrals.slice(0, 8));
  return { visits: Math.round(visits), metrics };
}

export type SimilarHit = { domain: string; title?: string; description?: string; visits?: number; globalRank?: number | null; category?: string };

export function similarwebSites(row: SwRow): SimilarHit[] {
  const out: SimilarHit[] = [], seen = new Set<string>();
  for (const { rec } of allRecords(row)) {
    const domain = str(rec, 'domain', 'site', 'website');
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    const cat = rec.category;
    /* Source categories arrive as "Top_Category~Sub_Category"; keep the leaf label. */
    const label = typeof cat === 'string' ? cat.split('~').pop()!.replace(/_/g, ' ').toLowerCase() : undefined;
    out.push({
      domain,
      title: str(rec, 'title', 'name'),
      description: label || str(rec, 'description'),
      visits: num(rec, 'monthly_visits', 'visits', 'total_visits'),
      globalRank: num(rec, 'global_rank', 'rank') ?? null,
      category: label,
    });
  }
  return out;
}
