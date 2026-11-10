import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publicUrl } from '../src/lib/net';
const mocks = vi.hoisted(() => ({ resolve4: vi.fn(), resolve6: vi.fn() }));
vi.mock('node:dns/promises', () => mocks);
beforeEach(() => { vi.resetAllMocks(); mocks.resolve4.mockResolvedValue(['93.184.215.14']); mocks.resolve6.mockResolvedValue([]); });
afterEach(() => vi.restoreAllMocks());
describe('Workers-compatible public DNS resolution', () => {
  it('accepts a public hostname using resolve4/resolve6, not unsupported lookup', async () => { expect((await publicUrl('https://example.com')).hostname).toBe('example.com'); });
  it('handles an IPv4-only host', async () => { mocks.resolve6.mockRejectedValueOnce(new Error('ENODATA')); await expect(publicUrl('https://example.com')).resolves.toBeInstanceOf(URL); });
  it('rejects missing DNS answers', async () => { mocks.resolve4.mockResolvedValueOnce([]); await expect(publicUrl('https://example.com')).rejects.toThrow(/resolve/); });
  it('rejects private DNS destinations', async () => { mocks.resolve4.mockResolvedValueOnce(['127.0.0.1']); await expect(publicUrl('https://example.com')).rejects.toThrow(/Private network/); });
  it('rejects literal IPs and local names before resolving', async () => { await expect(publicUrl('http://127.0.0.1')).rejects.toThrow(/public domain/); expect(mocks.resolve4).not.toHaveBeenCalled(); });
});
