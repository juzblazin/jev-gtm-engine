import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
export async function publicUrl(raw: string) {
  const u = new URL(raw);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || (u.port && !['80', '443'].includes(u.port))) throw new Error('Only public HTTP(S) URLs are supported.');
  if (isIP(u.hostname.replace(/[\[\]]/g, '')) || !u.hostname.includes('.') || u.hostname.endsWith('.local')) throw new Error('Use a public domain, not a local address.');
  const addresses = await lookup(u.hostname, { all: true });
  if (addresses.some(({ address: a }) => /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.|::1|f[cd]|fe80)/i.test(a))) throw new Error('Private network destinations are blocked.');
  return u;
}
export async function fetchPublic(raw: string, init?: RequestInit) { await publicUrl(raw); return fetch(raw, { ...init, redirect: 'error', signal: AbortSignal.timeout(6000) }); }
