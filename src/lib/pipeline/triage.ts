import { z } from 'zod';
import type { Evidence, Snippet } from '@/lib/types';
import type { Plan } from '@/lib/plans';
import { hasTreg, tregPost } from '@/lib/treg';
export interface TriageClient { classify(snippets: Snippet[]): Promise<Evidence[]>; }
function heuristic(s: Snippet): Evidence {
  const financial = /pric|cost|budget|billing|fees|ROI/i.test(s.text), ux = /onboard|workflow|setup|confus|slow/i.test(s.text);
  return { ...s, quote: s.text, category: financial ? 'Financial' : ux ? 'UX Friction' : 'Other', severity: /hidden|difficult|confus|expensive/i.test(s.text) ? 5 : 3, confidence: financial && ux ? 0.94 : financial || ux ? 0.92 : 0.72 };
}
export class HeuristicTriage implements TriageClient {
  async classify(snippets: Snippet[]): Promise<Evidence[]> { return snippets.map(heuristic); }
}
const categories: Record<string, Evidence['category']> = { financial: 'Financial', ux_friction: 'UX Friction', other: 'Other' };
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
type JevAnswers = { answers?: { category?: { choice?: string; confidence?: number }; severity?: { score?: number } } };
class JevTriage implements TriageClient {
  async classify(snippets: Snippet[]): Promise<Evidence[]> {
    return Promise.all(snippets.map(async s => {
      try {
        const { data } = await tregPost<JevAnswers>('openrouter.ai-judge.decide', {
          model: 'typesafe/jev-1.13',
          state: `# Evidence\n\n<snippet>${esc(s.text)}</snippet>`,
          questions: {
            category: { type: 'choice', instructions: 'Which friction bucket does <snippet> describe? Pick the dominant friction.', criteria: { financial: 'Pricing, contracts, billing, fees, ROI or budget concerns', ux_friction: 'Onboarding, usability, workflow, performance or reliability complaints', other: 'Anything else' } },
            severity: { type: 'score', instructions: 'How severe is the problem described in <snippet> for a paying business customer?', criteria: ['Trivial, cosmetic issue', 'Minor annoyance', 'Noticeable friction', 'Meaningful recurring problem', 'Deal-breaking, churn-driving problem'] },
          },
        });
        const cat = data.answers?.category, sev = data.answers?.severity;
        return { ...s, quote: s.text, category: categories[cat?.choice || ''] || 'Other', severity: Math.min(5, Math.max(1, Math.round(sev?.score ?? 2) + 1)), confidence: cat?.confidence ?? 0 };
      } catch { return heuristic(s); }
    }));
  }
}
const resultSchema = z.array(z.object({ id: z.string(), category: z.enum(['Financial', 'UX Friction', 'Other']), severity: z.number().int().min(1).max(5), confidence: z.number().min(0).max(1), quote: z.string().min(1) }));
class LegacyJevTriage implements TriageClient {
  async classify(snippets: Snippet[]): Promise<Evidence[]> {
    const r = await fetch(process.env.JEV_API_URL!, { method: 'POST', headers: { Authorization: `Bearer ${process.env.JEV_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ snippets, categories: ['Financial', 'UX Friction', 'Other'], instructions: 'Return a JSON array: id, category, severity 1-5, confidence 0-1, exact verbatim quote.' }), signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error('Jev adapter unavailable');
    return resultSchema.parse(await r.json()).flatMap(e => { const s = snippets.find(s => s.id === e.id); return s && s.text.includes(e.quote) ? [{ ...s, ...e }] : []; });
  }
}
export function filterEvidence(cards: Evidence[], plan: Plan) {
  const high = cards.filter(c => c.confidence >= 0.90).sort((a, b) => b.severity - a.severity || b.confidence - a.confidence);
  return plan === 'FREE_TRIAL' ? high.slice(0, Math.ceil(high.length * 0.1)) : high;
}
export async function triage(snippets: Snippet[], plan: Plan) {
  let cards: Evidence[], provider = 'local heuristic (scores are not empirically calibrated)';
  try {
    if (hasTreg()) { cards = await new JevTriage().classify(snippets); provider = 'Jev typed decisions via Treg'; }
    else if (process.env.JEV_API_KEY && process.env.JEV_API_URL) { cards = await new LegacyJevTriage().classify(snippets); provider = 'Jev configurable adapter'; }
    else throw new Error('No configured Jev adapter');
  } catch { cards = await new HeuristicTriage().classify(snippets); }
  const evidence = filterEvidence(cards, plan).map(e => plan === 'SCALE' ? { ...e, velocity: 0 } : e);
  return { evidence, noiseFiltered: snippets.length ? Math.round((1 - evidence.length / snippets.length) * 100) : 0, provider };
}
