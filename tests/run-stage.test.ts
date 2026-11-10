import { describe, expect, it } from 'vitest';
import { runStep } from '../src/lib/run-stage';
import { template } from '../src/lib/pipeline/synthesize';
import type { Run } from '../src/lib/types';

const input: Run['input'] = { product: 'https://linear.app', competitors: ['https://asana.com'], budget: 3000, region: 'US', plan: 'PREMIUM' };
const legacy: Run = { id: 'legacy', workspace: 'test', createdAt: '', input, snapshots: [], output: template(input, []), evidence: [], noiseFiltered: 0, compliance: [], timings: {}, providers: {} };
const story: Run['story'] = { title: 'Analysis', sections: [], provider: 'deterministic' };

describe('saved run stage inference', () => {
  it('reopens a pre-guided completed playbook without a stage or story', () => {
    expect(runStep(legacy)).toBe('strategy');
    expect(runStep(legacy, 'strategy')).toBe('strategy');
  });
  it('keeps explicit guided stages ahead of their placeholder strategy output', () => {
    expect(runStep({ ...legacy, stage: 'comparison' })).toBe('compare');
    expect(runStep({ ...legacy, stage: 'analysis', story })).toBe('analysis');
  });
  it('infers analysis from a story and strategy from completed synthesis', () => {
    expect(runStep({ ...legacy, story })).toBe('analysis');
    expect(runStep({ ...legacy, story, providers: { synthesis: 'deterministic' } })).toBe('strategy');
  });
  it('allows deliberate navigation back and tolerates an unloaded run', () => {
    expect(runStep(legacy, 'compare')).toBe('compare');
    expect(runStep({ ...legacy, story, stage: 'strategy' }, 'analysis')).toBe('analysis');
    expect(runStep(null)).toBe('compare');
  });
});
