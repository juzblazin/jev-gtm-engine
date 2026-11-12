import { z } from 'zod';
import { get, put, locked } from '@/lib/store';
import { workspace } from '@/lib/workspace';
import { domainOf, ingest } from '@/lib/pipeline/ingest';
import { PLANS } from '@/lib/plans';
import { normalizeHost } from '@/lib/competitors';
import type { Run } from '@/lib/types';

const bodySchema = z.object({ url: z.string().url() });
const HOST_RE = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/;

type Ctx = { params: Promise<{ id: string }> };

async function resolve(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return { error: Response.json({ error: 'Enter a valid competitor URL.' }, { status: 400 }) };
  let host = '';
  try { host = normalizeHost(parsed.data.url); } catch { /* reported below */ }
  if (!HOST_RE.test(host)) return { error: Response.json({ error: 'Enter a valid competitor domain.' }, { status: 400 }) };
  return { id, host };
}

async function ownRun(id: string) {
  const run = await get<Run>('run:' + id);
  return run && run.workspace === await workspace() ? run : null;
}

export async function POST(req: Request, ctx: Ctx) {
  const r = await resolve(req, ctx);
  if ('error' in r) return r.error;
  return locked('run:' + r.id, async () => {
    const run = await ownRun(r.id);
    if (!run) return Response.json({ error: 'Run not found in this workspace.' }, { status: 404 });
    if (r.host === domainOf(run.input.product)) return Response.json({ error: 'Choose a competitor other than your own site.' }, { status: 400 });
    if (run.snapshots.some(s => s.domain === r.host)) return Response.json({ error: `${r.host} is already in this comparison.` }, { status: 409 });
    const max = PLANS[run.input.plan]?.max_competitors ?? 5;
    if (run.input.competitors.length >= max) return Response.json({ error: `${PLANS[run.input.plan]?.label ?? 'This plan'} allows ${max} competitor${max === 1 ? '' : 's'}. Change plan to add more.` }, { status: 403 });
    const { snapshot } = await ingest(`https://${r.host}`, undefined, run.input.region);
    run.input.competitors.push(`https://${r.host}`);
    run.snapshots.push(snapshot);
    await put('run:' + r.id, run);
    return Response.json({ run });
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const r = await resolve(req, ctx);
  if ('error' in r) return r.error;
  return locked('run:' + r.id, async () => {
    const run = await ownRun(r.id);
    if (!run) return Response.json({ error: 'Run not found in this workspace.' }, { status: 404 });
    const kept = run.input.competitors.filter(u => domainOf(u) !== r.host);
    if (kept.length === run.input.competitors.length) return Response.json({ error: `${r.host} is not in this comparison.` }, { status: 404 });
    if (!kept.length) return Response.json({ error: 'Keep at least one competitor.' }, { status: 400 });
    run.input.competitors = kept;
    run.snapshots = run.snapshots.filter((s, i) => i === 0 || s.domain !== r.host);
    await put('run:' + r.id, run);
    return Response.json({ run });
  });
}
