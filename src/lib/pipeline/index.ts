import { randomUUID } from 'node:crypto';
import { PLANS } from '@/lib/plans';
import { get, put } from '@/lib/store';
import type { Input, Run } from '@/lib/types';
import { ingest } from './ingest';
import { triage } from './triage';
import { synthesize } from './synthesize';
import { scoreCompliance } from './compliance';
export async function pipeline(input: Input, workspace: string, emit: (data: unknown) => void) {
  const start = Date.now(), timings: Record<string, number> = {};
  const stage = (layer: string, status: string, ms?: number) => emit({ type: 'progress', layer, status, ms });
  stage('Layer 1', 'Checking 7-day cache & dispatching six parallel channels'); let t = Date.now();
  const results = await Promise.all([input.product, ...input.competitors].map(ingest));
  timings.ingestion = Date.now() - t; stage('Layer 1', `${results.filter(r => r.cached).length}/${results.length} domains from cache`, timings.ingestion);
  stage('Layer 1.5', 'Classifying friction & filtering confidence below 90%'); t = Date.now();
  const triaged = await triage(results.flatMap(r => r.snapshot.snippets), input.plan); timings.triage = Date.now() - t;
  stage('Layer 1.5', `${triaged.noiseFiltered}% noise filtered`, timings.triage);
  stage('Layer 2', 'Synthesizing the competitive playbook'); t = Date.now();
  const synthesis = await synthesize(input, triaged.evidence); timings.synthesis = Date.now() - t; stage('Layer 2', 'Playbook ready', timings.synthesis);
  stage('Layer 3', 'Checking regional comparative-advertising risk'); t = Date.now();
  const regions = PLANS[input.plan].regional ? ['US', 'EU', 'UK'] : [input.region];
  const compliance = synthesis.output.messages.map(m => regions.map(region => scoreCompliance(m.headline + ' ' + m.body, region)));
  timings.compliance = Date.now() - t; timings.total = Date.now() - start;
  const run: Run = { id: randomUUID(), workspace, createdAt: new Date().toISOString(), input, evidence: triaged.evidence, noiseFiltered: triaged.noiseFiltered, snapshots: results.map(r => r.snapshot), output: synthesis.output, compliance, timings, providers: { triage: triaged.provider, synthesis: synthesis.provider } };
  await put('run:' + run.id, run); const history = await get<string[]>('history:' + workspace) || []; await put('history:' + workspace, [run.id, ...history].slice(0, 100));
  stage('Layer 3', 'Compliance screening complete · not legal advice', timings.compliance); emit({ type: 'result', run }); return run;
}
