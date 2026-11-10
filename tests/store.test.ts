import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get, put } from '../src/lib/store';

const mocks = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), getFile: vi.fn(), putFile: vi.fn(), neon: vi.fn() }));
vi.mock('@neondatabase/serverless', () => ({ neon: mocks.neon }));
vi.mock('drizzle-orm/neon-http', () => ({ drizzle: () => ({ select: () => ({ from: () => ({ where: mocks.select }) }), insert: () => ({ values: () => ({ onConflictDoUpdate: mocks.insert }) }) }) }));
vi.mock('../src/lib/store-file', () => ({ getFile: mocks.getFile, putFile: mocks.putFile }));
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('DATABASE_URL', ''); vi.stubEnv('BOO_RUNTIME', ''); });
afterEach(() => vi.unstubAllEnvs());

describe('runtime storage routing', () => {
  it('uses Neon HTTP without touching the file store on Workers', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://test:test@host.neon.tech/test');
    vi.stubEnv('BOO_RUNTIME', 'cloudflare');
    mocks.select.mockResolvedValue([{ value: { saved: true } }]);
    expect(await get('run:test')).toEqual({ saved: true });
    await put('run:test', { saved: true });
    expect(mocks.neon).toHaveBeenCalledTimes(2);
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(mocks.getFile).not.toHaveBeenCalled();
    expect(mocks.putFile).not.toHaveBeenCalled();
  });
  it('returns undefined for missing Neon records', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://test:test@host.neon.tech/test');
    mocks.select.mockResolvedValue([]);
    expect(await get('missing')).toBeUndefined();
  });
  it('rejects missing Worker storage instead of falling back to fs', async () => {
    vi.stubEnv('BOO_RUNTIME', 'cloudflare');
    await expect(get('missing')).rejects.toThrow(/Worker secret/);
    await expect(put('run:test', {})).rejects.toThrow(/Worker secret/);
    expect(mocks.getFile).not.toHaveBeenCalled();
    expect(mocks.putFile).not.toHaveBeenCalled();
  });
  it('preserves the zero-key Node.js file backend', async () => {
    mocks.getFile.mockResolvedValue({ saved: true });
    expect(await get('run:test')).toEqual({ saved: true });
    await put('run:test', {});
    expect(mocks.putFile).toHaveBeenCalledOnce();
  });
  it('surfaces database failures instead of silently switching backends', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://test:test@host.neon.tech/test');
    mocks.select.mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(get('run:test')).rejects.toThrow('Database unavailable');
    expect(mocks.getFile).not.toHaveBeenCalled();
  });
});
