import { z } from 'zod';
import type { SiteMetrics } from './metrics';
export const inputSchema = z.object({ product: z.string().url(), competitors: z.array(z.string().url()).min(1).max(5), budget: z.number().positive().max(100000000), region: z.enum(['US', 'EU', 'UK', 'Global']), plan: z.enum(['FREE_TRIAL', 'PREMIUM', 'SCALE']) });
export type Input = z.infer<typeof inputSchema>;
export type Snippet = { id: string; domain: string; channel: string; text: string; source: 'live' | 'simulated' };
export type Evidence = Snippet & { category: 'Financial' | 'UX Friction' | 'Other'; severity: number; confidence: number; quote: string; velocity?: number };
export type Snapshot = { domain: string; fetchedAt: string; snippets: Snippet[]; visits: number; router: string; metrics?: SiteMetrics; cards?: import('./pipeline/cards').EvidenceCard[] };
export const synthesisSchema = z.object({
  summary: z.string(), icp: z.object({ industry: z.string(), size: z.string(), revenue: z.string(), triggers: z.array(z.string()) }),
  matrix: z.array(z.object({ dimension: z.string(), product: z.string(), competitors: z.array(z.object({ domain: z.string(), finding: z.string() })) })),
  personas: z.array(z.object({ role: z.string(), goal: z.string(), friction: z.string(), message: z.string() })),
  messages: z.array(z.object({ headline: z.string(), body: z.string(), evidenceIds: z.array(z.string()) })),
  channels: z.array(z.object({ name: z.string(), intent: z.number().min(0).max(100), saturation: z.number().min(0).max(100), gapIndex: z.number(), playbook: z.string() })),
  sprints: z.array(z.object({ id: z.string(), title: z.string(), budget: z.number().nonnegative(), hypothesis: z.string(), kpi: z.string(), duration: z.string(), targetAccounts: z.array(z.string()), messaging: z.string() })),
});
export type Synthesis = z.infer<typeof synthesisSchema>;
export type Compliance = { region: string; score: number; risk: 'low' | 'review' | 'high'; rationale: string; rewrite: string };
export type Story = { title: string; sections: { heading: string; body: string }[]; provider: string };
export type Run = { id: string; workspace: string; createdAt: string; input: Input; evidence: Evidence[]; noiseFiltered: number; snapshots: Snapshot[]; output: Synthesis; compliance: Compliance[][]; timings: Record<string, number>; providers: Record<string, string>; stage?: 'comparison' | 'analysis' | 'strategy'; story?: Story };
