import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../src/app/api/run/[id]/advance/route';
import { template } from '../src/lib/pipeline/synthesize';
import { runStep } from '../src/lib/run-stage';
import type { Run } from '../src/lib/types';

const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), triage: vi.fn(), story: vi.fn(), synthesize: vi.fn() }));
vi.mock('../src/lib/store', () => ({ get: mocks.get, put: mocks.put, locked: async (_key: string, fn: () => Promise<unknown>) => fn() }));
vi.mock('../src/lib/workspace', () => ({ workspace: async () => 'test' }));
vi.mock('../src/lib/pipeline/triage', () => ({ triage: mocks.triage }));
vi.mock('../src/lib/pipeline/story', () => ({ generateStory: mocks.story }));
vi.mock('../src/lib/pipeline/synthesize', async importOriginal => ({ ...await importOriginal<object>(), synthesize: mocks.synthesize }));
const input: Run['input'] = { product: 'https://linear.app', competitors: ['https://asana.com'], budget: 3000, region: 'US', plan: 'PREMIUM' };
const legacy: Run = { id: 'legacy', workspace: 'test', createdAt: '', input, snapshots: [], output: template(input, []), evidence: [], noiseFiltered: 50, compliance: [], timings: { synthesis: 12 }, providers: { synthesis: 'deterministic' } };
const story = { title: 'Analysis', sections: [], provider: 'deterministic' };
const advance = (stage = 'analysis') => POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ stage }) }), { params: Promise.resolve({ id: 'legacy' }) });
beforeEach(() => { vi.clearAllMocks(); mocks.get.mockResolvedValue(structuredClone(legacy)); mocks.story.mockResolvedValue(story); mocks.triage.mockResolvedValue({ evidence: [], noiseFiltered: 0, provider: 'heuristic' }); });

describe('advancing a saved playbook to analysis', () => {
  it('adds a story without replacing or hiding a legacy strategy', async () => {
    const response = await advance();
    expect(response.status).toBe(200);
    const { run } = await response.json();
    expect(run.stage).toBe('strategy');
    expect(run.story).toEqual(story);
    expect(run.output).toEqual(legacy.output);
    expect(run.compliance).toEqual(legacy.compliance);
    expect(run.noiseFiltered).toBe(legacy.noiseFiltered);
    expect(run.providers.synthesis).toBe('deterministic');
    expect(runStep(run, 'analysis')).toBe('analysis');
    expect(runStep(run, 'strategy')).toBe('strategy');
    expect(mocks.triage).not.toHaveBeenCalled();
    expect(mocks.synthesize).not.toHaveBeenCalled();
    expect(mocks.put).toHaveBeenCalledOnce();
  });
  it('does not regenerate an existing strategy when advancing directly to strategy', async () => {
    const response = await advance('strategy');
    expect(response.status).toBe(200);
    expect((await response.json()).run.output).toEqual(legacy.output);
    expect(mocks.synthesize).not.toHaveBeenCalled();
  });
  it('still triages a new comparison and advances to analysis', async () => {
    mocks.get.mockResolvedValue({ ...structuredClone(legacy), stage: 'comparison' });
    const response = await advance();
    expect((await response.json()).run.stage).toBe('analysis');
    expect(mocks.triage).toHaveBeenCalledOnce();
  });
  it('returns 404 for missing runs and does not generate content', async () => {
    mocks.get.mockResolvedValue(undefined);
    expect((await advance()).status).toBe(404);
    expect(mocks.story).not.toHaveBeenCalled();
  });
  it('does not persist a failed story generation', async () => {
    mocks.story.mockRejectedValueOnce(new Error('Provider failed'));
    expect((await advance()).status).toBe(500);
    expect(mocks.put).not.toHaveBeenCalled();
  });
});
