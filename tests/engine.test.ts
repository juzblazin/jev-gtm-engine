import { describe, it, expect } from 'vitest';
import { enforcePlan, PLANS } from '../src/lib/plans';
import { filterEvidence, HeuristicTriage } from '../src/lib/pipeline/triage';
import { isFresh } from '../src/lib/pipeline/ingest';
import { scoreCompliance } from '../src/lib/pipeline/compliance';
import { template } from '../src/lib/pipeline/synthesize';
import type { Evidence, Input } from '../src/lib/types';
const cards: Evidence[] = Array.from({ length: 20 }, (_, i) => ({ id: String(i), domain: 'example.com', channel: 'reviews', text: 'hidden costs', quote: 'hidden costs', source: 'simulated', category: 'Financial', severity: 5, confidence: i === 19 ? 0.89 : 0.90 }));
describe('tier gate', () => {
  it('enforces exact limits and one trial', () => { expect(Object.values(PLANS).map(p => p.max_competitors)).toEqual([1, 3, 5]); for (const p of ['FREE_TRIAL', 'PREMIUM', 'SCALE'] as const) { expect(() => enforcePlan(p, PLANS[p].max_competitors, false)).not.toThrow(); expect(() => enforcePlan(p, PLANS[p].max_competitors + 1, false)).toThrow(/at most/); } expect(() => enforcePlan('FREE_TRIAL', 1, true)).toThrow(/one free trial/); expect(() => enforcePlan('PREMIUM', 3, true)).not.toThrow(); });
});
describe('triage', () => {
  it('drops below 90%, retains top 10% on free', () => { expect(filterEvidence(cards, 'FREE_TRIAL')).toHaveLength(2); expect(filterEvidence(cards, 'PREMIUM')).toHaveLength(19); expect(filterEvidence(cards, 'SCALE').every(c => c.confidence >= .9)).toBe(true); });
  it('handles no qualifying evidence', () => { expect(filterEvidence([], 'FREE_TRIAL')).toEqual([]); expect(filterEvidence(cards.map(c => ({ ...c, confidence: .5 })), 'SCALE')).toEqual([]); });
  it('preserves verbatim quote and classifies', async () => { const result = await new HeuristicTriage().classify([{ ...cards[0], text: 'Onboarding is confusing' }]); expect(result[0].quote).toBe('Onboarding is confusing'); expect(result[0].category).toBe('UX Friction'); });
});
describe('compliance', () => {
  it('scores denigration more strictly in EU/UK', () => { expect(scoreCompliance('Their product is garbage', 'EU').score).toBeGreaterThan(scoreCompliance('Their product is garbage', 'US').score); expect(scoreCompliance('Their product is garbage', 'UK').risk).toBe('high'); expect(scoreCompliance('The best product', 'US').risk).toBe('review'); });
  it('handles neutral and empty content', () => { expect(scoreCompliance('Explore our documented workflow', 'US').risk).toBe('low'); expect(scoreCompliance('', 'EU').score).toBe(0); expect(scoreCompliance('scam', 'EU').rewrite).not.toContain('scam'); });
});
describe('cache freshness', () => {
  const now = Date.now(); it('is strictly less than 7 days', () => { expect(isFresh(new Date(now - 7 * 86400000 + 1).toISOString(), now)).toBe(true); expect(isFresh(new Date(now - 7 * 86400000).toISOString(), now)).toBe(false); });
  it('rejects invalid and future timestamps', () => { expect(isFresh('')).toBe(false); expect(isFresh('invalid')).toBe(false); expect(isFresh(new Date(now + 10000).toISOString(), now)).toBe(false); });
});
describe('deterministic synthesis', () => { it('respects persona, sprint and budget entitlements with empty evidence', () => { for (const plan of ['FREE_TRIAL', 'PREMIUM', 'SCALE'] as const) { const input: Input = { product: 'https://example.com', competitors: ['https://example.org'], budget: 1000, region: 'EU', plan }; const output = template(input, []); expect(output.personas).toHaveLength(PLANS[plan].personas); expect(output.sprints).toHaveLength(PLANS[plan].sprints); expect(output.sprints.reduce((n, s) => n + s.budget, 0)).toBeLessThanOrEqual(1000); expect(output.summary).toContain('EU'); expect(output.channels[0].gapIndex).toBeGreaterThan(output.channels[1].gapIndex); } }); });
