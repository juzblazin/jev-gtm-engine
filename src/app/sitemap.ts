import type { MetadataRoute } from 'next';
import { playbooks } from '@/lib/playbooks';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001';
  return [
    { url: base, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/playbooks`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/workspace`, changeFrequency: 'monthly', priority: 0.3 },
    ...playbooks.map(p => ({ url: `${base}/playbooks/${p.id}`, changeFrequency: 'monthly' as const, priority: 0.7 })),
  ];
}
