import { z } from 'zod';
import { seededMetrics } from '@/lib/metrics';
import type { Run, Story } from '@/lib/types';
export function narrative(run: Run): Story {
  if (!run.snapshots.length) return { title: 'More signals needed.', sections: [], provider: 'Deterministic metric-led narrative' };
  const own = run.snapshots[0], user = own.metrics || seededMetrics(own.domain);
  return { title: 'The opening hiding in the numbers.', provider: 'Deterministic metric-led narrative', sections: run.snapshots.slice(1).flatMap(s => {
    const m = s.metrics || seededMetrics(s.domain), difference = m.visits.value - user.visits.value;
    const search = m.mix.value.find(c => c.name === 'Search')?.share || 0;
    return [{ heading: `${s.domain} · The advantage`, body: `${s.domain} attracts ${m.visits.value.toLocaleString('en-US')} monthly visits versus ${own.domain} at ${user.visits.value.toLocaleString('en-US')}: ${Math.abs(difference).toLocaleString('en-US')} ${difference >= 0 ? 'more' : 'fewer'} visits. Search accounts for ${search}% of its traffic. Its ${m.keywords.value.toLocaleString('en-US')} organic keywords suggest an education-led acquisition strategy to investigate.` }, { heading: 'The audience & campaign play', body: `${m.desktop.value}% desktop usage suggests a work-context audience hypothesis, not verified firmographics. The ${m.ads.value[0].platform} creative “${m.ads.value[0].headline}” leads with workflow simplicity. ${m.social.value[1].activity}. Test tutorial and creator-led distribution before assuming influencer ROI.` }, { heading: 'The gap you can test', body: `A ${m.bounce.value}% bounce rate and ${m.pages.value} pages per visit suggest testing a clearer landing-page journey. Your bounce rate is ${user.bounce.value}% (${Math.abs(m.bounce.value - user.bounce.value)} percentage points ${user.bounce.value <= m.bounce.value ? 'lower' : 'higher'}). Build a comparison page around ${m.topKeywords.value[2]}, then run an opt-in pilot within your $${run.input.budget.toLocaleString('en-US')} monthly budget in ${run.input.region}. Validate these modeled signals with first-party analytics before spending.` }]; }) };
}
export async function generateStory(run: Run): Promise<Story> {
  const fallback = narrative(run);
  const prompt = `Write a specific competitive narrative as JSON {title:string,sections:[{heading:string,body:string}]}. Reference exact metric differences, audience hypotheses, campaigns/top ads, influencer strategy, SEO, strengths, gaps and growth opportunities. Label simulated data as hypotheses. No invented live facts. Data: ${JSON.stringify({ snapshots: run.snapshots, evidence: run.evidence, budget: run.input.budget, region: run.input.region })}`;
  try {
    let text = '', provider = '';
    if (process.env.ANTHROPIC_API_KEY) { const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514', max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }), signal: AbortSignal.timeout(45000) }); if (!r.ok) throw new Error(); const d = await r.json(); text = d.content[0].text; provider = 'Anthropic + Jev evidence'; }
    else if (process.env.GEMINI_API_KEY) { const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || 'gemini-2.5-flash'}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }), signal: AbortSignal.timeout(45000) }); if (!r.ok) throw new Error(); const d = await r.json(); text = d.candidates[0].content.parts[0].text; provider = 'Gemini + Jev evidence'; }
    else return fallback;
    const result = z.object({ title: z.string(), sections: z.array(z.object({ heading: z.string(), body: z.string() })).min(1) }).parse(JSON.parse(text.replace(/^```json\s*|```$/g, '').trim())); return { ...result, provider };
  } catch { return fallback; }
}
