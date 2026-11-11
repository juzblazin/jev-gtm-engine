/* AIsa MCP gateway adapter: one key reaches published provider APIs (Similarweb,
   SE Ranking and others) through https://mcp.aisa.one/mcp. Paid tools follow the
   documented flow: batch_quote, then batch_use only when the estimate fits the
   configured per-call cap. Search/schema/quote calls are free; only batch_use
   spends, so a missing wallet balance degrades to the existing fallbacks. */
export function hasAisa() { return !!process.env.AISA_API_KEY; }
const maxCostUsd = () => Number(process.env.AISA_MAX_COST_USD || 0.5);
const AISA_MCP = 'https://mcp.aisa.one/mcp';
let nextId = 0;

type JsonRpc = { result?: { isError?: boolean; structuredContent?: unknown; content?: { text?: unknown }[]; error?: unknown }; error?: { message?: string } };

async function rpc(method: string, params: unknown, timeoutMs = 30000): Promise<unknown> {
  const r = await fetch(AISA_MCP, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${process.env.AISA_API_KEY}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++nextId, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`AIsa ${method} HTTP ${r.status}`);
  const text = await r.text();
  let payload: JsonRpc | null = null;
  if (text.trimStart().startsWith('data:')) {
    for (const line of text.split('\n')) { if (line.startsWith('data:')) { try { payload = JSON.parse(line.slice(5)) as JsonRpc; } catch { /* keep last parseable frame */ } } }
  } else payload = JSON.parse(text) as JsonRpc;
  if (!payload) throw new Error('AIsa returned an unreadable frame');
  if (payload.error) throw new Error(`AIsa ${method}: ${payload.error.message || 'rpc error'}`);
  const result = payload.result as { isError?: boolean; structuredContent?: unknown; content?: { text?: string }[] } | undefined;
  if (result?.isError) throw new Error((result.structuredContent as { error?: { message?: string } })?.error?.message || 'AIsa tool error');
  if (result?.structuredContent) return result.structuredContent as unknown;
  const inner = result?.content?.[0]?.text;
  return inner ? JSON.parse(inner as string) : result;
}

async function callTool(name: string, args: Record<string, unknown>, timeoutMs = 30000) { return rpc('tools/call', { name, arguments: args }, timeoutMs); }

export type AisaSimilarSite = { domain?: string; category?: string; rank?: number; affinity?: number };

/* Direct REST API: Similarweb similar-sites through the console gateway. Monthly
   granularity over the last three completed months; the response carries an
   audience-affinity score and global rank per domain. Throws on HTTP or balance
   errors so callers fall back to the next provider. */
export async function aisaSimilarSites(domain: string, limit = 8): Promise<AisaSimilarSite[]> {
  const end = new Date(); end.setUTCDate(0); // last day of the previous month
  const start = new Date(end); start.setUTCDate(1); start.setUTCMonth(start.getUTCMonth() - 2);
  const month = (d: Date) => d.toISOString().slice(0, 7);
  const params = new URLSearchParams({ domain, start_date: month(start), end_date: month(end), country: 'ww', limit: String(limit) });
  const r = await fetch(`https://console.aisa.one/apis/v1/similarweb/website/similar-sites?${params}`, { headers: { Authorization: `Bearer ${process.env.AISA_API_KEY}` }, signal: AbortSignal.timeout(30000) });
  const result = await r.json() as { error?: { message?: string }; data?: AisaSimilarSite[] };
  if (!r.ok || result.error || !Array.isArray(result.data)) throw new Error(result.error?.message || `AIsa similar-sites HTTP ${r.status}`);
  return result.data;
}

type QuoteResult = { successful: boolean; data?: { estimated_cost_micros_usd?: number }; error?: { message?: string } };

/* Quote first, then execute only inside the configured spend boundary. Throws on
   upstream/validation failures and on estimates above the cap; callers catch and
   fall back to their existing provider or simulated data. */
export async function aisaUse<T = unknown>(tool: string, args: Record<string, unknown>, opts: { capUsd?: number; timeoutMs?: number } = {}): Promise<{ data: T; estimateUsd: number }> {
  const cap = opts.capUsd ?? maxCostUsd();
  const quote = await callTool('batch_quote', { calls: [{ call_id: 'c', tool, arguments: args }] }, opts.timeoutMs) as { results?: QuoteResult[] };
  const q = quote.results?.[0];
  if (!q?.successful) throw new Error(`AIsa quote failed for ${tool}: ${q?.error?.message || 'unknown'}`);
  const estimateUsd = (q.data?.estimated_cost_micros_usd || 0) / 1e6;
  if (estimateUsd > cap) throw new Error(`AIsa ${tool} estimate $${estimateUsd.toFixed(3)} exceeds cap $${cap}`);
  const out = await callTool('batch_use', { calls: [{ call_id: 'c', tool, arguments: args }] }, opts.timeoutMs) as { results?: { successful: boolean; data?: T; error?: { message?: string; status?: number } }[] };
  const u = out.results?.[0];
  if (!u?.successful) throw new Error(`AIsa ${tool} failed: ${u?.error?.message || 'unknown'} (${u?.error?.status || 'no status'})`);
  return { data: u.data as T, estimateUsd };
}
