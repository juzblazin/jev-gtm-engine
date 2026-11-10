'use client';
import { useState } from 'react';
import Link from 'next/link';
import { seededMetrics, type Metric, type SiteMetrics } from '@/lib/metrics';
import type { Run } from '@/lib/types';
import { AnimatedCounter } from './arc/animated-counter/animated-counter';
import SegmentedControl from './arc/segmented-control/segmented-control';
import { Badge, Card, EmptyState, MetricCard, Progress, Sparkline } from './ui';
export function SourceBadge({ source }: { source: string }) { return <span className="source-badge"><Badge>{source}</Badge></span>; }
function World({ metric }: { metric: SiteMetrics['regions'] }) {
  const paths = ['M35 44L64 27L104 30L129 51L111 69L91 72L81 95L63 89L51 67L29 60Z', 'M94 103L115 112L128 143L116 169L103 190L94 163L89 133Z', 'M171 45L196 34L212 48L204 67L181 71L164 60Z', 'M177 80L206 75L220 103L211 134L192 152L180 125L169 102Z', 'M210 36L253 23L300 39L326 69L302 82L281 72L269 99L245 94L224 69L207 65Z', 'M281 142L310 130L331 147L322 168L294 173L278 158Z'];
  const continents = ['North America', 'South America', 'Europe', 'Africa', 'Asia', 'Oceania'];
  return <div><svg viewBox="0 0 360 210" className="world" role="img" aria-label="Schematic world choropleth by continent"><g stroke="var(--surface)" strokeWidth="3">{paths.map((d, i) => { const region = metric.value.find(r => r.name === continents[i]); return <path key={d} d={d} fill="var(--accent)" fillOpacity={.25 + (region?.share || 0) / 65}><title>{`${continents[i]}: ${region?.share || 0}%`}</title></path>; })}</g><path d="M15 198H345" stroke="var(--border)" strokeDasharray="3 5"/></svg><div className="region-legend">{metric.value.map(r => <span key={r.name}>{r.name} <b>{r.share}%</b></span>)}</div></div>;
}

function Value({ title, metric, suffix = '', context = 'Illustrative metric' }: { title: string; metric: Metric<number>; suffix?: string; context?: string }) { return <MetricCard label={title} value={metric.value} suffix={suffix} context={`${metric.source} · ${context}`}/>; }
function SiteColumn({ domain, metrics: m, own }: { domain: string; metrics: SiteMetrics; own: boolean }) {
  return <section className="site-column"><div className="site-heading"><h2>{domain}</h2><Badge>{own ? 'Your website' : 'Competitor'}</Badge></div>
    <div className="metric-section"><Value title="Monthly visits" metric={m.visits} context="Visits per month"/><Sparkline data={m.trend.value} label="Monthly traffic trend" interactive width={480} height={112}/><SourceBadge source={m.trend.source}/><div className="metric-pair"><Value title="Desktop traffic" metric={m.desktop} suffix="%" context={`${100 - m.desktop.value}% mobile`}/><Value title="Average visit" metric={m.duration} suffix="s" context="Duration in seconds"/><Value title="Bounce rate" metric={m.bounce} suffix="%"/><div className="compact-metric"><h4>Pages per visit</h4><AnimatedCounter value={m.pages.value} decimals={1}/><SourceBadge source={m.pages.source}/></div></div></div>
    <div className="metric-section"><h3>Search visibility</h3><div className="metric-pair"><Value title="Organic keywords" metric={m.keywords}/><Value title="Domain authority" metric={m.authority} context="Score out of 100"/><Value title="Backlinks" metric={m.backlinks}/></div><div className="row"><h4>Top keywords</h4><SourceBadge source={m.topKeywords.source}/></div><div className="keyword-list">{m.topKeywords.value.map(k => <Badge key={k}>{k}</Badge>)}</div></div>
    <div className="metric-section"><div className="row"><h3>Traffic channel mix</h3><SourceBadge source={m.mix.source}/></div>{m.mix.value.map(c => <Progress key={c.name} label={c.name} value={c.share} showValue/>)}<div className="row"><h4>Top referring domains</h4><SourceBadge source={m.referrals.source}/></div><p>{m.referrals.value.join(' · ')}</p></div>
    <div className="metric-section"><div className="row"><h3>Visitors by region</h3><SourceBadge source={m.regions.source}/></div><World metric={m.regions}/><p className="hint">Schematic regional map. Shares of modeled visits.</p></div>
    <div className="metric-section"><div className="row"><h3>Running ads</h3><SourceBadge source={m.ads.source}/></div>{m.ads.value.length ? m.ads.value.map(ad => <Card key={ad.platform} title={ad.headline.replace(/\.$/, '')} description={ad.copy} meta={ad.platform} status={`First seen ${ad.firstSeen}`}><Badge>Sample creative</Badge></Card>) : <EmptyState title="No ads available" description="Review the other channels for a starting point."/>}</div>
    <div className="metric-section"><div className="row"><h3>Social and creator activity</h3><SourceBadge source={m.social.source}/></div>{m.social.value.map(item => <div className="social-item" key={item.platform}><div className="row"><h4>{item.platform}</h4><span>{item.followers.toLocaleString('en-US')} followers</span></div><p>{item.activity}</p></div>)}</div>
  </section>;
}
export default function Comparison({ run }: { run: Run }) {
  const [index, setIndex] = useState('1'), own = run.snapshots[0], rival = run.snapshots[Number(index)];
  if (!own || !rival) return <EmptyState title="Comparison data is missing" description="Start another landscape to gather a fresh snapshot." action={<Link href="/">Start an analysis</Link>}/>;
  return <div className="section-stack"><div className="comparison-control"><p>Compare the signals before deciding where to act.</p><div className="competitor-switch"><span>Compare competitor</span><SegmentedControl label="Compare competitor" value={index} onValueChange={setIndex} options={run.snapshots.slice(1).map((s, i) => ({ value: String(i + 1), label: s.domain }))}/></div></div><div className="comparison-grid"><SiteColumn domain={own.domain} metrics={own.metrics || seededMetrics(own.domain)} own/><SiteColumn domain={rival.domain} metrics={rival.metrics || seededMetrics(rival.domain)} own={false}/></div></div>;
}
