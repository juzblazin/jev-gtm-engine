import { inputSchema } from '@/lib/types';
import { enforcePlan, GateError } from '@/lib/plans';
import { get, put, locked } from '@/lib/store';
import { workspace } from '@/lib/workspace';
import { pipeline } from '@/lib/pipeline';
import { SelectionError, validateSelection } from '@/lib/competitors';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'Enter valid URLs, 1–5 competitors, a positive budget, plan and region.', details: parsed.error.flatten() }, { status: 400 });
  const id = await workspace(), input = parsed.data;
  try { validateSelection(input.plan, input.competitors, input.product); await locked('trial:' + id, async () => { enforcePlan(input.plan, input.competitors.length, !!await get('trial:' + id)); if (input.plan === 'FREE_TRIAL') await put('trial:' + id, true); }); }
  catch (e) { return Response.json({ error: (e as Error).message }, { status: e instanceof GateError ? 403 : e instanceof SelectionError ? 400 : 500 }); }
  const stream = new ReadableStream({ async start(controller) { const encoder = new TextEncoder(); const emit = (data: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); try { await pipeline(input, id, emit, body.guided === true); } catch (e) { console.error('analyze pipeline failed:', e); emit({ type: 'error', error: 'Analysis could not be saved. Check storage configuration and try again.' }); } finally { controller.close(); } } });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' } });
}
