import { z } from 'zod';
import type { Evidence, Snippet } from '@/lib/types';
import type { Plan } from '@/lib/plans';
export interface TriageClient { classify(snippets: Snippet[]): Promise<Evidence[]>; }
export class HeuristicTriage implements TriageClient {
  async classify(snippets: Snippet[]): Promise<Evidence[]> { return snippets.map(s => {
    const financial = /pric|cost|budget|billing|fees|ROI/i.test(s.text), ux = /onboard|workflow|setup|confus|slow/i.test(s.text);
    return { ...s, quote: s.text, category: financial ? 'Financial' : ux ? 'UX Friction' : 'Other', severity: /hidden|difficult|confus|expensive/i.test(s.text) ? 5 : 3, confidence: financial && ux ? 0.94 : financial || ux ? 0.92 : 0.72 };
  }); }
}
const resultSchema = z.array(z.object({ id: z.string(), category: z.enum(['Financial', 'UX Friction', 'Other']), severity: z.number().int().min(1).max(5), confidence: z.number().min(0).max(1), quote: z.string().min(1) }));
class JevTriage implements TriageClient {
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
  try { if (!process.env.JEV_API_KEY || !process.env.JEV_API_URL) throw new Error('No configured Jev adapter'); cards = await new JevTriage().classify(snippets); provider = 'Jev configurable adapter'; } catch { cards = await new HeuristicTriage().classify(snippets); }
  const evidence = filterEvidence(cards, plan).map(e => plan === 'SCALE' ? { ...e, velocity: 0 } : e);
  return { evidence, noiseFiltered: snippets.length ? Math.round((1 - evidence.length / snippets.length) * 100) : 0, provider };
}
