import { describe, expect, it } from 'vitest';
import { suggestions, validateSelection } from '../src/lib/competitors';
import { seededMetrics } from '../src/lib/metrics';
import { narrative } from '../src/lib/pipeline/story';
import { template } from '../src/lib/pipeline/synthesize';
import type { Input, Run } from '../src/lib/types';
describe('competitor selection', () => {
  it('enforces limits before ingestion and rejects empty/duplicate selections', () => { expect(() => validateSelection('FREE_TRIAL', ['https://asana.com', 'https://monday.com'])).toThrow(/at most 1/); expect(() => validateSelection('PREMIUM', [])).toThrow(/at least one/); expect(() => validateSelection('SCALE', ['https://asana.com', 'https://www.asana.com'])).toThrow(/distinct/); expect(() => validateSelection('PREMIUM', ['https://asana.com'])).not.toThrow(); });
  it('offers stable category peers and excludes the input site', () => { expect(suggestions('stripe.com')).toContain('adyen.com'); expect(suggestions('stripe.com')).not.toContain('stripe.com'); expect(suggestions('unknown.example')).toEqual(suggestions('unknown.example')); });
});
describe('structured metric determinism', () => {
  it('is domain seeded, normalized, labeled and coherent', () => { const m = seededMetrics('linear.app'); expect(m).toEqual(seededMetrics('WWW.LINEAR.APP')); expect(m).not.toEqual(seededMetrics('asana.com')); expect(Object.values(m).every(v => v.source === 'simulated')).toBe(true); expect(m.mix.value.reduce((n, c) => n + c.share, 0)).toBe(100); expect(m.mix.value.every(c => c.share >= 0)).toBe(true); expect(m.regions.value.reduce((n, c) => n + c.share, 0)).toBe(100); expect(m.trend.value).toHaveLength(12); });
});
describe('metric-led story', () => {
  it('references computed traffic, bounce differences, campaigns and budget', () => {
    const input: Input = { product: 'https://linear.app', competitors: ['https://asana.com'], budget: 3000, region: 'EU', plan: 'PREMIUM' };
    const snapshots = ['linear.app', 'asana.com'].map(domain => ({ domain, metrics: seededMetrics(domain), visits: seededMetrics(domain).visits.value, snippets: [], router: 'simulated', fetchedAt: new Date().toISOString() }));
    const run: Run = { id: 'test', workspace: 'test', input, snapshots, output: template(input, []), evidence: [], compliance: [], timings: {}, providers: {}, noiseFiltered: 0, createdAt: '' };
    const story = narrative(run), text = story.sections.map(s => s.body).join(' ');
    expect(text).toContain(snapshots[1].visits.toLocaleString('en-US')); expect(text).toContain(Math.abs(snapshots[0].visits - snapshots[1].visits).toLocaleString('en-US')); expect(text).toContain(`${snapshots[1].metrics.bounce.value}%`); expect(text).toContain('$3,000'); expect(text).toContain('EU'); expect(text).toContain(snapshots[1].metrics.ads.value[0].headline); expect(text).toContain('creator'); expect(text).toContain('modeled');
    expect(narrative({ ...run, snapshots: [] }).sections).toEqual([]);
  });
});
