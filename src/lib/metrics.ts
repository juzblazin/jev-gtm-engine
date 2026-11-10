export type Source = 'live' | 'simulated';
export type Metric<T> = { value: T; source: Source };
export type SiteMetrics = {
  visits: Metric<number>; trend: Metric<number[]>; desktop: Metric<number>; keywords: Metric<number>; authority: Metric<number>; backlinks: Metric<number>;
  topKeywords: Metric<string[]>; duration: Metric<number>; bounce: Metric<number>; pages: Metric<number>;
  mix: Metric<{ name: string; share: number }[]>; referrals: Metric<string[]>; regions: Metric<{ name: string; share: number }[]>;
  ads: Metric<{ platform: string; headline: string; copy: string; firstSeen: string }[]>;
  social: Metric<{ platform: string; followers: number; activity: string }[]>;
};
export function seededMetrics(raw: string): SiteMetrics {
  const domain = raw.toLowerCase().replace(/^www\./, ''); let seed = 2166136261;
  for (const char of domain) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const next = (min: number, max: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return min + seed % (max - min + 1); };
  const m = <T>(value: T): Metric<T> => ({ value, source: 'simulated' });
  const visits = next(20000, 900000), desktop = next(48, 81), name = domain.split('.')[0];
  const shares = [next(20, 36), next(25, 40), next(4, 9), next(5, 9), next(3, 5)]; shares.push(100 - shares.reduce((a, b) => a + b, 0));
  return { visits: m(visits), trend: m(Array.from({ length: 12 }, (_, i) => Math.round(visits * (0.65 + i * .025 + next(0, 15) / 100)))), desktop: m(desktop), keywords: m(next(1200, 32000)), authority: m(next(35, 88)), backlinks: m(next(8000, 680000)), topKeywords: m([name, `${name} pricing`, `${name} alternatives`, 'workflow software', 'team collaboration']), duration: m(next(95, 340)), bounce: m(next(28, 64)), pages: m(next(20, 65) / 10), mix: m(['Direct', 'Search', 'Social', 'Referral', 'Paid', 'Email'].map((name, i) => ({ name, share: shares[i] }))), referrals: m(['g2.com', 'reddit.com', 'producthunt.com']), regions: m([{ name: 'North America', share: 42 }, { name: 'Europe', share: 30 }, { name: 'Asia', share: 18 }, { name: 'South America', share: 5 }, { name: 'Africa', share: 3 }, { name: 'Oceania', share: 2 }]), ads: m([{ platform: 'Google Search', headline: `${name}: make work flow`, copy: 'Bring your team together. Explore a simpler way to plan and deliver.', firstSeen: '2026-09-14' }, { platform: 'LinkedIn', headline: 'Your next chapter of growth', copy: 'See how a connected workflow helps teams focus on what matters.', firstSeen: '2026-10-02' }]), social: m([{ platform: 'LinkedIn', followers: next(8000, 170000), activity: '3 posts/week · product education and customer stories' }, { platform: 'YouTube / creators', followers: next(1200, 45000), activity: 'Tutorial-led partnerships · 2 creator collaborations/month (modeled)' }]) };
}
