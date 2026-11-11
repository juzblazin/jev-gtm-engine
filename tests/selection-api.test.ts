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
  it('streams SSE progress before ingestion completes without buffering the response', async () => {
    let complete!: () => void;
    const gate = new Promise<void>(resolve => { complete = resolve; });
    mocks.pipeline.mockImplementationOnce(async (_input, _workspace, emit) => {
      emit({ type: 'progress', layer: 'Layer 1', status: 'Gathering' });
      await gate;
      emit({ type: 'result', run: { id: 'streamed' } });
    });
    const response = await POST(request(['https://asana.com']));
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain('Gathering');
    complete();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('streamed');
    expect((await reader.read()).done).toBe(true);
  });
  it.each([
    ['https://asana.com', 'https://asana.com'],
    ['https://www.ASANA.com/pricing', 'http://asana.com/'],
  ])('returns 400 for duplicate identities: %s and %s', async (first, second) => {
    const response = await POST(request([first, second]));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/distinct competitors.*Duplicate domains/);
    expect(mocks.locked).not.toHaveBeenCalled();
    expect(mocks.pipeline).not.toHaveBeenCalled();
  });
  it('accepts distinct competitors and starts ingestion', async () => {
    const response = await POST(request(['https://asana.com', 'https://monday.com']));
    expect(response.status).toBe(200);
    await response.text();
    expect(mocks.pipeline).toHaveBeenCalledOnce();
  });
  it('keeps unexpected storage failures as 500 errors', async () => {
    mocks.locked.mockRejectedValueOnce(new Error('Storage unavailable'));
    const response = await POST(request(['https://asana.com']));
    expect(response.status).toBe(500);
    expect(mocks.pipeline).not.toHaveBeenCalled();
  });
  it('strips protocols, case, www and paths consistently', () => {
    for (const value of ['www.LINEAR.app/', 'https://WWW.Linear.App/pricing', 'LINEAR.APP']) expect(normalizeHost(value)).toBe('linear.app');
  });
  it('filters self and deduplicates live suggestions before applying the limit', async () => {
    vi.stubEnv('SIMILARWEB_API_KEY', 'test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ similar_sites: [{ url: 'https://www.LINEAR.app/' }, { site: 'LINEAR.APP' }, { url: 'https://www.Asana.com/pricing' }, { site: 'asana.com/' }, { url: 'monday.com/' }, { url: 'https://' }] })));
    const response = await GET(new Request('http://localhost/api/competitors?domain=https://WWW.Linear.App/'));
    expect(await response.json()).toEqual({ competitors: [{ domain: 'asana.com' }, { domain: 'monday.com' }], domains: ['asana.com', 'monday.com'], source: 'live' });
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
