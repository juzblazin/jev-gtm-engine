/* CH-03 sentiment worker: Trustpilot + Reddit via treg (no G2/Capterra connector exists
   in the catalog). Mines 1–3-star reviews and Reddit threads from the last ~180 days,
   splits complaint text into sentences, then Jev-triages each: friction category,
   persona impact, churn severity and the strongest verbatim evidence sentence. */
import { hasTreg, tregCall, tregPost } from '@/lib/treg';

export type MinedReview = { source: 'trustpilot' | 'reddit'; id: string; url: string; publishedAt: string; rating: number | null; author: string; text: string; category?: string; persona?: string; churn?: number; evidence?: string; confidence?: number };
export type ReviewReport = { reviews: MinedReview[]; totalScanned: number; cost: number };

const fromDate = () => new Date(Date.now() - 180 * 86400000);
const sentences = (text: string) => text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+/g)?.map(s => s.trim()).filter(s => s.length > 20 && s.length < 400) || [text.trim().slice(0, 400)];
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

type TpReview = { review_id?: string; rating?: number; title?: string; text?: string; date?: string; author?: string; url?: string };
type RedditPost = { id?: string; url?: string; created_utc?: number; subreddit?: string; title?: string; selftext?: string; score?: number };
type RedditComment = { body?: string; ups?: number; score?: number; created_utc?: number };

async function trustpilot(domain: string, cutoff: Date): Promise<{ reviews: MinedReview[]; scanned: number; cost: number }> {
  const { data, costMicro } = await tregPost<{ reviews?: TpReview[] }>('crawl4ai.trustpilot.business.reviews', { domain: `www.${domain}`, limit: 40, stars: 1 }, 45000);
  const all = data.reviews || [];
  const reviews = all.filter(r => (r.rating || 5) <= 3 && r.date && new Date(r.date) >= cutoff && r.text)
    .map(r => ({ source: 'trustpilot' as const, id: r.review_id || '', url: r.url || '', publishedAt: r.date!, rating: r.rating || null, author: r.author || 'anonymous', text: `${r.title ? r.title + '. ' : ''}${r.text}` }));
  return { reviews, scanned: all.length, cost: costMicro || 0 };
}

async function reddit(domain: string, cutoff: Date): Promise<{ reviews: MinedReview[]; scanned: number; cost: number }> {
  let cost = 0;
  const brand = domain.split('.')[0];
  const { data, costMicro } = await tregCall<{ posts?: RedditPost[] }>('scrapecreators.reddit.search.posts', { query: brand, sort: 'relevance', timeframe: 'year', trim: 'true' }, 30000);
  cost += costMicro || 0;
  const posts = (data.posts || []).filter(p => p.created_utc && new Date(p.created_utc * 1000) >= cutoff && (p.selftext || p.title)).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 8);
  const reviews: MinedReview[] = [];
  for (const [i, p] of posts.entries()) {
    let text = `${p.title || ''}. ${p.selftext || ''}`.trim();
    if (i < 3 && p.url) { // top-3 threads: mine the top comments for unfiltered objections
      try {
        const c = await tregPost<{ comments?: RedditComment[] }>('crawl4ai.reddit.post.comments', { url: p.url, sort: 'top', limit: 15 }, 30000);
        cost += c.costMicro || 0;
        const top = (c.data.comments || []).filter(cm => cm.body && new Date((cm.created_utc || 0) * 1000) >= cutoff).sort((a, b) => (b.ups ?? b.score ?? 0) - (a.ups ?? a.score ?? 0)).slice(0, 5);
        if (top.length) text += ' Comments: ' + top.map(cm => cm.body!.replace(/\s+/g, ' ')).join(' ');
      } catch { /* post text alone still counts */ }
    }
    reviews.push({ source: 'reddit', id: p.id || '', url: p.url || '', publishedAt: new Date((p.created_utc || 0) * 1000).toISOString(), rating: null, author: `r/${p.subreddit || '?'}`, text });
  }
  return { reviews, scanned: (data.posts || []).length, cost };
}

const frictionCategories = { hidden_pricing: 'Hidden Pricing / Renewal Overages', slow_onboarding: 'Slow Onboarding / Setup Complexity', missing_feature: 'Missing Core Feature / Integration', buggy_ux: 'Buggy UX / Reliability', poor_support: 'Poor Customer Support' };
const personas = { economic_buyer: 'Economic Buyer (CFO / VP / Budget Owner)', daily_operator: 'Daily Operator (Practitioner / End-User)' };

async function triageReview(r: MinedReview): Promise<MinedReview> {
  const sents = sentences(r.text).slice(0, 8);
  const sentCriteria: Record<string, string> = {};
  sents.forEach((s, i) => { sentCriteria[`s${i}`] = s.slice(0, 300); });
  const questions: Record<string, unknown> = {
    primary_friction_category: { type: 'choice', instructions: 'Which category best describes the main complaint in <review>?', criteria: frictionCategories },
    persona_impact: { type: 'choice', instructions: 'Which buyer persona is hurt most by the problem described in <review>?', criteria: personas },
    churn_severity: { type: 'score', instructions: 'How likely is the author of <review> to be actively leaving or warning others away from this product?', criteria: ['No churn signal — casual remark', 'Mild frustration', 'Noticeable dissatisfaction', 'Strong complaint, evaluating alternatives', 'Actively leaving or already switched'] },
  };
  if (sents.length > 1) questions.verbatim_evidence_sentence = { type: 'choice', instructions: 'Which sentence in <review> is the single most concrete, verifiable complaint a marketer could cite?', criteria: sentCriteria };
  try {
    const { data } = await tregPost<{ answers?: Record<string, { choice?: string; confidence?: number; score?: number }> }>('openrouter.ai-judge.decide', { model: 'typesafe/jev-1.13', state: `# Review\n\n<review source="${r.source}" author="${esc(r.author)}">${esc(r.text.slice(0, 4000))}</review>`, questions }, 30000);
    const a = data.answers || {}, cat = a.primary_friction_category, per = a.persona_impact, sev = a.churn_severity, sent = a.verbatim_evidence_sentence;
    const confidence = cat?.confidence ?? 0;
    return { ...r, category: frictionCategories[cat?.choice as keyof typeof frictionCategories] || 'Unclassified', persona: personas[per?.choice as keyof typeof personas] || 'Unclassified', churn: Math.min(5, Math.max(1, Math.round(sev?.score ?? 0) + 1)), evidence: sent?.choice ? sents[Number(sent.choice.slice(1))] || sents[0] : sents[0], confidence };
  } catch { return { ...r, evidence: sents[0], confidence: 0 }; }
}

export async function reviewIngest(domain: string): Promise<ReviewReport | null> {
  if (!hasTreg()) return null;
  const cutoff = fromDate();
  const [tp, rd] = await Promise.allSettled([trustpilot(domain, cutoff), reddit(domain, cutoff)]);
  if (tp.status !== 'fulfilled' && rd.status !== 'fulfilled') return null;
  let cost = 0, scanned = 0; const mined: MinedReview[] = [];
  if (tp.status === 'fulfilled') { mined.push(...tp.value.reviews); scanned += tp.value.scanned; cost += tp.value.cost; }
  if (rd.status === 'fulfilled') { mined.push(...rd.value.reviews); scanned += rd.value.scanned; cost += rd.value.cost; }
  const kept = await Promise.all(mined.slice(0, 14).map(triageReview));
  return { reviews: kept, totalScanned: scanned, cost };
}
