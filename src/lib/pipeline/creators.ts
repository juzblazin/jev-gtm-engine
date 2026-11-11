/* CH-05 creator footprint: YouTube + LinkedIn + X via treg. Finds posts about the brand,
   detects sponsorship indicators, computes engagement, then Jev-scores relationship type
   and poachability for the creator-seeding sprint. */
import { hasTreg, tregCall, tregPost } from '@/lib/treg';

export type CreatorPost = { platform: 'YOUTUBE' | 'LINKEDIN' | 'X'; handle: string; name: string; followers: number | null; tier: string; postUrl: string; publishedAt: string; text: string; sponsored: boolean; indicators: string[]; views: number | null; comments: number | null; engagementRate: number | null; relationship?: string; poachability?: number; jevConfidence?: number };
export type CreatorReport = { posts: CreatorPost[]; cost: number };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const tier = (n: number | null) => n == null ? 'unknown' : n < 10000 ? 'nano' : n < 100000 ? 'micro' : 'macro';
const disclosures = (t: string) => (t.match(/#ad\b|#sponsored\b|#partner\b|\?ref=|\?via=|discount code|use code|affiliate/gi) || []).slice(0, 4);
const engagement = (views: number | null, likes: number | null, comments: number | null, followers: number | null) => { const base = views || followers; return base && (likes != null || comments != null) ? Math.round((((likes || 0) + (comments || 0)) / base) * 10000) / 100 : null; };

type YtRow = { channel?: string; title?: string; url?: string; views?: number; published?: string; description?: string };
type LiPost = { author?: { name?: string } | string; text?: string; url?: string; followers?: number; comments?: number; posted_at?: string };
type XPost = { author?: string | { username?: string; name?: string }; username?: string; text?: string; url?: string; likes?: number; replies?: number; views?: number; created_at?: string; followers?: number };

async function youtube(brand: string): Promise<CreatorPost[]> {
  const { data } = await tregPost<{ rows?: YtRow[] }>('crawl4ai.youtube.search.videos', { query: `${brand} review`, limit: 8 }, 30000);
  return (data.rows || []).filter(r => r.channel && r.title).map(r => ({ platform: 'YOUTUBE' as const, handle: r.channel!, name: r.channel!, followers: null, tier: 'unknown', postUrl: r.url || '', publishedAt: r.published || '', text: `${r.title}. ${r.description || ''}`, sponsored: disclosures(`${r.title} ${r.description}`).length > 0, indicators: disclosures(`${r.title} ${r.description}`), views: r.views ?? null, comments: null, engagementRate: null }));
}
async function linkedin(brand: string): Promise<CreatorPost[]> {
  const { data } = await tregCall<{ posts?: LiPost[] }>('scrapecreators.x.v1-linkedin-search-posts', { query: brand, trim: 'true' }, 30000);
  return (data.posts || []).filter(p => p.text).slice(0, 8).map(p => { const name = typeof p.author === 'string' ? p.author : p.author?.name || 'unknown'; return { platform: 'LINKEDIN' as const, handle: name, name, followers: p.followers ?? null, tier: tier(p.followers ?? null), postUrl: p.url || '', publishedAt: p.posted_at || '', text: p.text!.slice(0, 800), sponsored: disclosures(p.text!).length > 0, indicators: disclosures(p.text!), views: null, comments: p.comments ?? null, engagementRate: engagement(null, null, p.comments ?? null, p.followers ?? null) }; });
}
async function xSearch(brand: string): Promise<CreatorPost[]> {
  const { data } = await tregPost<{ posts?: XPost[]; rows?: XPost[] }>('crawl4ai.x.search.posts', { query: brand, limit: 8 }, 30000);
  const rows = data.posts || data.rows || [];
  return rows.filter(p => p.text).map(p => { const handle = typeof p.author === 'string' ? p.author : p.author?.username || p.username || 'unknown'; const name = typeof p.author === 'object' ? p.author?.name || handle : handle; return { platform: 'X' as const, handle, name, followers: p.followers ?? null, tier: tier(p.followers ?? null), postUrl: p.url || '', publishedAt: p.created_at || '', text: p.text!.slice(0, 800), sponsored: disclosures(p.text!).length > 0, indicators: disclosures(p.text!), views: p.views ?? null, comments: p.replies ?? null, engagementRate: engagement(p.views ?? null, p.likes ?? null, p.replies ?? null, p.followers ?? null) }; });
}
async function subscriberCount(handle: string): Promise<number | null> {
  try { const { data } = await tregPost<{ subscriber_count?: number; subscribers?: number }>('crawl4ai.youtube.channel.profile', { channel: handle }, 20000); return data.subscriber_count ?? data.subscribers ?? null; } catch { return null; }
}

const relationships = { paid: 'Paid Sponsorship / Affiliate Partner', organic_positive: 'Organic Positive Review', organic_complaint: 'Organic Complaint / Criticism' };
async function triagePost(p: CreatorPost): Promise<CreatorPost> {
  try {
    const { data } = await tregPost<{ answers?: { relationship_type?: { choice?: string; confidence?: number }; poachability?: { score?: number } } }>('openrouter.ai-judge.decide', { model: 'typesafe/jev-1.13', state: `# Post\n\n<post platform="${p.platform}" author="${esc(p.name)}" sponsored="${p.sponsored}">${esc(p.text.slice(0, 2000))}</post>`, questions: { relationship_type: { type: 'choice', instructions: 'What is the poster\'s relationship to the software vendor discussed in <post>? Disclosure tags, affiliate links and overt promotion indicate paid partnership.', criteria: relationships }, poachability: { type: 'score', instructions: 'How poachable is this creator for a rival vendor\'s seeding sprint? Independent niche educators who review several tools in the category score high; exclusive brand employees or one-off users score low.', criteria: ['Brand employee or exclusive ambassador', 'Loyal single-tool advocate', 'Generalist who mentions tools casually', 'Category reviewer covering multiple tools', 'Independent niche educator built for tool comparisons'] } } }, 30000);
    const rel = data.answers?.relationship_type?.choice, poach = data.answers?.poachability?.score;
    return { ...p, relationship: relationships[rel as keyof typeof relationships] || undefined, poachability: poach == null ? undefined : Math.min(5, Math.max(1, Math.round(poach) + 1)), jevConfidence: data.answers?.relationship_type?.confidence };
  } catch { return p; }
}

export async function creatorIngest(domain: string): Promise<CreatorReport | null> {
  if (!hasTreg()) return null;
  const brand = domain.split('.')[0];
  const calls = await Promise.allSettled([youtube(brand), linkedin(brand), xSearch(brand)]);
  const posts = calls.flatMap(c => c.status === 'fulfilled' ? c.value : []);
  if (!posts.length) return null;
  const ytChannels = [...new Set(posts.filter(p => p.platform === 'YOUTUBE' && p.followers == null).map(p => p.handle))].slice(0, 5);
  const subs = new Map(await Promise.all(ytChannels.map(async h => [h, await subscriberCount(h)] as const)));
  for (const p of posts) if (p.platform === 'YOUTUBE' && subs.has(p.handle)) { p.followers = subs.get(p.handle)!; p.tier = tier(p.followers); }
  const triaged = await Promise.all(posts.slice(0, 12).map(triagePost));
  const rest = posts.slice(12).map(p => ({ ...p }));
  return { posts: [...triaged, ...rest], cost: 0 };
}
