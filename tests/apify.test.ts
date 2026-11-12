import { describe, expect, it } from 'vitest';
import { similarwebOverview, similarwebSites, type SwRow } from '../src/lib/apify';

/* Captured shapes from a real agentx/similarweb-pro-scraper run for asana.com
   (dataset GmgFEkX2ZbZrbSoir): metric/dimensions/value records, weekly traffic
   points, numeric ISO country ids, file-backed keywords/referral hydrated inline. */
const row: SwRow = {
  website: 'asana.com',
  item_count: 100,
  website_performance: {
    profile: [{ title: 'Asana', monthly_visits: 3086959, global_rank: 1142, period_start: null, period_end: null }],
    engagement: [{ domain: 'asana.com', monthly_visits: 37704056.7, visit_duration: 685.7, visit_pages: 7.35, bounce_rate: 0.2579, period_start: '2026-05-01', period_end: '2026-10-31' }],
    devices: [
      { metric: 'data.desktop', value: 214212580, period_start: '2026-05-01', period_end: '2026-10-31' },
      { metric: 'data.mobile_web', value: 12011760, period_start: '2026-05-01', period_end: '2026-10-31' },
    ],
    traffic_trend: [
      { metric: 'data.total.value', dimensions: ['asana.com', '2026-05-01'], value: 8346263, period_start: '2026-05-01', period_end: '2026-10-31' },
      { metric: 'data.total.value', dimensions: ['asana.com', '2026-05-08'], value: 8940008, period_start: '2026-05-01', period_end: '2026-10-31' },
      { metric: 'data.total.value', dimensions: ['asana.com', '2026-06-05'], value: 8739670, period_start: '2026-05-01', period_end: '2026-10-31' },
      { metric: 'data.total.value', dimensions: ['asana.com', '2026-10-01'], value: 9000000, period_start: '2026-05-01', period_end: '2026-10-31' },
    ],
    visit_totals: [{ domain: 'asana.com', visits: 226224340, traffic_share: 1, period_start: '2026-05-01', period_end: '2026-10-31' }],
    geography: [
      { country_id: 840, traffic_share: 0.3393, period_start: '2026-05-01', period_end: '2026-10-31' },
      { country_id: 392, traffic_share: 0.0805, period_start: '2026-05-01', period_end: '2026-10-31' },
      { country_id: 826, traffic_share: 0.0435, period_start: '2026-05-01', period_end: '2026-10-31' },
    ],
    channels: [
      { metric: 'data.total.direct', value: 173365689, period_start: '2026-05-01', period_end: '2026-10-31' },
      { metric: 'data.total.search_organic', value: 11871959, period_start: '2026-05-01', period_end: '2026-10-31' },
      { metric: 'data.total.email', value: 13423208, period_start: '2026-05-01', period_end: '2026-10-31' },
      { metric: 'data.total.social_organic', value: 10896312, period_start: '2026-05-01', period_end: '2026-10-31' },
      { metric: 'data.total.gen_ai', value: 1431666, period_start: '2026-05-01', period_end: '2026-10-31' },
    ],
  },
  keywords: {
    keywords: [
      { keyword: 'asana', clicks: 2377370, search_volume: 839940, cpc: 4.8, difficulty: 77, primary_intent: 'Navigational', top_url: 'https://asana.com', period_start: '2026-05-01', period_end: '2026-10-31' },
      { keyword: 'asana login', clicks: 225260, search_volume: 41820, period_start: '2026-05-01', period_end: '2026-10-31' },
    ],
  },
  referral: {
    referrals: [{ domain: 'okta.com', traffic_share: 0.13, visits: 1553679, global_rank: 244, period_start: '2026-05-01', period_end: '2026-10-31' }],
    outgoing: [{ domain: 'google.com', period_start: '2026-05-01', period_end: '2026-10-31' }],
  },
  report_context: { keywords: { storage: 'inline', file_url: null, item_count: 42 } },
};

const similarRow: SwRow = {
  website: 'asana.com',
  similar_sites: {
    competitors: [
      { domain: 'monday.com', category: 'Computers_Electronics_and_Technology~Computers_Electronics_and_Technology', affinity: 1, global_rank: 1078, period_start: '2026-08-01', period_end: '2026-10-31' },
      { domain: 'atlassian.com', category: 'Computers_Electronics_and_Technology~Programming_and_Developer_Software', affinity: 0.92, global_rank: 1046, period_start: '2026-08-01', period_end: '2026-10-31' },
    ],
  },
};

describe('similarwebOverview', () => {
  const out = similarwebOverview(row)!;
  it('reads monthly engagement without confusing profile or 6-month totals', () => {
    expect(out.visits).toBe(37704057);
    expect(out.metrics.bounce?.value).toBeCloseTo(25.8, 0);
    expect(out.metrics.duration?.value).toBe(686);
    expect(out.metrics.pages?.value).toBe(7.4);
  });
  it('aggregates weekly traffic points into monthly sums', () => {
    expect(out.metrics.trend?.value).toEqual([17286271, 8739670, 9000000]);
  });
  it('normalizes absolute channel counts into shares', () => {
    const mix = out.metrics.mix!.value;
    expect(mix[0].name).toBe('Direct');
    expect(mix[0].share).toBeCloseTo(82.2, 0);
    expect(mix.map(c => c.name)).toContain('AI referrals');
  });
  it('computes desktop share from absolute device visits', () => {
    expect(out.metrics.desktop?.value).toBeCloseTo(94.7, 0);
  });
  it('maps numeric ISO countries to names and regions', () => {
    expect(out.metrics.countries?.value[0]).toEqual({ name: 'United States', share: 33.9 });
    expect(out.metrics.regions?.value[0].name).toBe('North America');
    expect(out.metrics.regions?.value.some(r => r.name === 'Asia')).toBe(true);
  });
  it('surfaces top keywords, keyword count and referring domains only', () => {
    expect(out.metrics.topKeywords?.value[0]).toBe('asana');
    expect(out.metrics.keywords?.value).toBe(42);
    expect(out.metrics.referrals?.value).toEqual(['okta.com']);
  });
  it('returns null when no visit metric exists', () => {
    expect(similarwebOverview({ website: 'x.com', similar_sites: { competitors: [{ domain: 'y.com' }] } })).toBeNull();
  });
});

describe('similarwebSites', () => {
  it('maps competitor records with cleaned categories and ranks', () => {
    const sites = similarwebSites(similarRow);
    expect(sites).toHaveLength(2);
    expect(sites[0]).toMatchObject({ domain: 'monday.com', globalRank: 1078, category: 'computers electronics and technology' });
    expect(sites[1].description).toBe('programming and developer software');
  });
});
