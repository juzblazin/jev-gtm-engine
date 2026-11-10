import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../src/app/api/competitors/route';
import { POST } from '../src/app/api/analyze/route';
import { normalizeHost } from '../src/lib/competitors';

const mocks = vi.hoisted(() => ({ pipeline: vi.fn(), get: vi.fn(), put: vi.fn(), locked: vi.fn(), workspace: vi.fn() }));
vi.mock('../src/lib/pipeline', () => ({ pipeline: mocks.pipeline }));
vi.mock('../src/lib/store', () => ({ get: mocks.get, put: mocks.put, locked: mocks.locked }));
vi.mock('../src/lib/workspace', () => ({ workspace: mocks.workspace }));
beforeEach(() => { vi.clearAllMocks(); mocks.workspace.mockResolvedValue('workspace'); mocks.locked.mockImplementation(async (_key, fn) => fn()); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const input = { product: 'https://linear.app', competitors: ['https://asana.com'], budget: 3000, region: 'US', plan: 'PREMIUM' };
const request = (competitors: string[]) => new Request('http://localhost/api/analyze', { method: 'POST', body: JSON.stringify({ ...input, competitors }) });

describe('normalized competitor identity', () => {
  it('strips protocols, case, www and paths consistently', () => {
    for (const value of ['www.LINEAR.app/', 'https://WWW.Linear.App/pricing', 'LINEAR.APP']) expect(normalizeHost(value)).toBe('linear.app');
  });
  it('filters self and deduplicates live suggestions before applying the limit', async () => {
    vi.stubEnv('SIMILARWEB_API_KEY', 'test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ similar_sites: [{ url: 'https://www.LINEAR.app/' }, { site: 'LINEAR.APP' }, { url: 'https://www.Asana.com/pricing' }, { site: 'asana.com/' }, { url: 'monday.com/' }, { url: 'https://' }] })));
    const response = await GET(new Request('http://localhost/api/competitors?domain=https://WWW.Linear.App/'));
    expect(await response.json()).toEqual({ domains: ['asana.com', 'monday.com'], source: 'live' });
  });
  it('falls back without returning self when the provider only suggests self', async () => {
    vi.stubEnv('SIMILARWEB_API_KEY', 'test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ similar_sites: [{ url: 'www.linear.app/' }] })));
    const result = await (await GET(new Request('http://localhost/api/competitors?domain=linear.app'))).json();
    expect(result.source).toBe('simulated');
    expect(result.domains).not.toContain('linear.app');
  });
  it('rejects self-comparison before trial storage or ingestion', async () => {
    const response = await POST(request(['https://www.LINEAR.app/pricing']));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/other than your own site/);
    expect(mocks.locked).not.toHaveBeenCalled();
    expect(mocks.pipeline).not.toHaveBeenCalled();
  });
});
