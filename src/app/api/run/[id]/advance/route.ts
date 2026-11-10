import { get, put, locked } from '@/lib/store';
import { workspace } from '@/lib/workspace';
import type { Run } from '@/lib/types';
import { triage } from '@/lib/pipeline/triage';
import { generateStory } from '@/lib/pipeline/story';
import { synthesize } from '@/lib/pipeline/synthesize';
import { scoreCompliance } from '@/lib/pipeline/compliance';
import { PLANS } from '@/lib/plans';
import { runStep } from '@/lib/run-stage';
export const maxDuration = 120;
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params, ws = await workspace(); const body = await req.json().catch(() => null);
  if (!['analysis', 'strategy'].includes(body?.stage)) return Response.json({ error: 'Unknown stage.' }, { status: 400 });
  return locked('advance:' + id, async () => {
    const run = await get<Run>('run:' + id); if (!run || run.workspace !== ws) return Response.json({ error: 'Run not found.' }, { status: 404 });
    try {
      const hasStrategy = runStep(run) === 'strategy';
      if (hasStrategy) run.stage = 'strategy';
      if (!run.story) { const t = Date.now(); if (!hasStrategy) { const result = await triage(run.snapshots.flatMap(s => s.snippets), run.input.plan); run.evidence = result.evidence; run.noiseFiltered = result.noiseFiltered; run.providers.triage = result.provider; } run.story = await generateStory(run); run.timings.analysis = Date.now() - t; run.stage = hasStrategy ? 'strategy' : 'analysis'; }
      if (body.stage === 'strategy' && run.stage !== 'strategy') { const t = Date.now(); const result = await synthesize(run.input, run.evidence, run.snapshots); run.output = result.output; run.providers.synthesis = result.provider; const regions = PLANS[run.input.plan].regional ? ['US', 'EU', 'UK'] : [run.input.region]; run.compliance = run.output.messages.map(m => regions.map(r => scoreCompliance(m.headline + ' ' + m.body, r))); run.stage = 'strategy'; run.timings.strategy = Date.now() - t; }
      run.timings.total = Object.entries(run.timings).filter(([key]) => key !== 'total').reduce((n, [, v]) => n + v, 0); await put('run:' + id, run); return Response.json({ run });
    } catch { return Response.json({ error: 'Could not complete this step. Please retry.' }, { status: 500 }); }
  });
}
