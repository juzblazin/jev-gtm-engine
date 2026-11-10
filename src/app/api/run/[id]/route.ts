import { get } from '@/lib/store';
import { workspace } from '@/lib/workspace';
import type { Run } from '@/lib/types';
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) { const { id } = await ctx.params; const run = await get<Run>('run:' + id); if (!run || run.workspace !== await workspace()) return Response.json({ error: 'Run not found in this workspace.' }, { status: 404 }); return Response.json({ run }); }
