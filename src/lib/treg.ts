/* treg tool catalog: server-side calls to https://treg.to/call/<tool-id>.
   One team token in TREG_TOKEN reaches 4,100+ tools; credentials stay on treg's server. */
const TREG_BASE = 'https://treg.to';

export type TregResult<T> = { data: T; costMicro: number | null; servedBy: string | null };

export function hasTreg() { return !!process.env.TREG_TOKEN; }

export async function tregCall<T = unknown>(toolId: string, params: Record<string, string | number | boolean> = {}, timeoutMs = 30000): Promise<TregResult<T>> {
  const url = new URL(`${TREG_BASE}/call/${toolId}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const r = await fetch(url, { headers: { 'X-Treg-Token': process.env.TREG_TOKEN! }, signal: AbortSignal.timeout(timeoutMs) });
  const costMicro = Number(r.headers.get('X-Treg-Cost-Micro')) || null;
  const servedBy = r.headers.get('X-Treg-Served-By');
  if (!r.ok) throw new Error(`treg ${toolId} failed: ${r.status}`);
  return { data: (await r.json()) as T, costMicro, servedBy };
}

export async function tregPost<T = unknown>(toolId: string, body: unknown, timeoutMs = 30000): Promise<TregResult<T>> {
  const r = await fetch(`${TREG_BASE}/call/${toolId}`, { method: 'POST', headers: { 'X-Treg-Token': process.env.TREG_TOKEN!, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  const costMicro = Number(r.headers.get('X-Treg-Cost-Micro')) || null;
  const servedBy = r.headers.get('X-Treg-Served-By');
  if (!r.ok) throw new Error(`treg ${toolId} failed: ${r.status}`);
  return { data: (await r.json()) as T, costMicro, servedBy };
}
