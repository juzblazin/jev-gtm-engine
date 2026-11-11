'use client';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { seededMetrics, type SiteMetrics } from '@/lib/metrics';
import type { Run, Snapshot } from '@/lib/types';
import SegmentedControl from './arc/segmented-control/segmented-control';
import { Badge, EmptyState, Progress, Sparkline } from './ui';

export function SourceBadge({ source }: { source: string }) { return <span className="source-badge"><Badge>{source}</Badge></span>; }

const fmt = (n: number | null | undefined, suffix = '') => n == null ? '–' : `${n.toLocaleString('en-US')}${suffix}`;
const pct = (n: number | null | undefined) => n == null ? '–' : `${Math.round(n * 10) / 10}%`;
const cut = (s: string, n: number) => s.length > n ? `${s.slice(0, n)}…` : s;

function Section({ tag, title, children }: { tag: string; title: string; children: ReactNode }) {
  return <section className="compare-section"><header className="compare-section-head"><h3>{title}</h3><span className="worker-tag">{tag}</span></header>{children}</section>;
}
function SigTable({ sites, focus, rows }: { sites: Snapshot[]; focus: number; rows: { label: string; note?: string; cell: (m: SiteMetrics, i: number) => ReactNode }[] }) {
  return <div className="responsive-scroll"><table className="compare-table"><thead><tr><th scope="col">Signal</th>{sites.map((s, i) => <th scope="col" key={s.domain} className={i === focus ? 'focus-col' : undefined}>{s.domain}{i === 0 ? ' (you)' : ''}</th>)}</tr></thead><tbody>{rows.map(r => <tr key={r.label}><th scope="row"><span className="signal-name">{r.label}</span>{r.note ? <span className="signal-source">{r.note}</span> : null}</th>{sites.map((s, i) => <td key={s.domain} className={i === focus ? 'focus-col' : undefined}>{r.cell((s as Snapshot & { _m: SiteMetrics })._m ?? s.metrics, i)}</td>)}</tr>)}</tbody></table></div>;
}
function SiteTable({ sites, columns, rows }: { sites: Snapshot[]; columns: string[]; rows: (m: SiteMetrics, s: Snapshot) => ReactNode[] }) {
  return <div className="responsive-scroll"><table className="compare-table"><thead><tr><th scope="col">Site</th>{columns.map(c => <th scope="col" key={c}>{c}</th>)}</tr></thead><tbody>{sites.map((s, i) => <tr key={s.domain}><th scope="row">{s.domain}{i === 0 ? ' (you)' : ''}</th>{rows((s as Snapshot & { _m: SiteMetrics })._m ?? s.metrics, s).map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>;
}
const dash = <span className="cell-sub">–</span>;
function Mode<T>(vals: T[]): T | undefined { const c = new Map<T, number>(); vals.forEach(v => v !== undefined && c.set(v, (c.get(v) ?? 0) + 1)); return [...c].sort((a, b) => b[1] - a[1])[0]?.[0]; }

export default function Comparison({ run }: { run: Run }) {
  const [index, setIndex] = useState('1');
  const sites = run.snapshots;
  if (sites.length < 2) return <EmptyState title="Comparison data is missing" description="Start another landscape to gather a fresh snapshot." action={<Link href="/">Start an analysis</Link>}/>;
  const focus = Number(index);
  sites.forEach(s => { (s as Snapshot & { _m?: SiteMetrics })._m = { ...seededMetrics(s.domain), ...s.metrics }; });
  const m = (s: Snapshot) => (s as Snapshot & { _m: SiteMetrics })._m;

  return <div className="section-stack">
    <div className="comparison-control"><p>Compare the signals before deciding where to act.</p><div className="competitor-switch"><span>Compare competitor</span><SegmentedControl label="Compare competitor" value={index} onValueChange={setIndex} options={sites.slice(1).map((s, i) => ({ value: String(i + 1), label: s.domain }))}/></div></div>

    <Section tag="CH-01" title="Traffic and engagement">
      <SigTable sites={sites} focus={focus} rows={[
        { label: 'Monthly visits', note: m(sites[0]).visits.source, cell: x => fmt(x.visits.value) },
        { label: 'Monthly traffic trend', note: m(sites[0]).trend.source, cell: x => <Sparkline data={x.trend.value} label="Monthly traffic trend" interactive={false} width={130} height={30}/> },
        { label: 'Desktop traffic', note: m(sites[0]).desktop.source, cell: x => <>{pct(x.desktop.value)}<span className="cell-sub">{fmt(100 - x.desktop.value)}% mobile</span></> },
        { label: 'Bounce rate', note: m(sites[0]).bounce.source, cell: x => pct(x.bounce.value) },
        { label: 'Average visit', note: m(sites[0]).duration.source, cell: x => fmt(x.duration.value, 's') },
        { label: 'Pages per visit', note: m(sites[0]).pages.source, cell: x => fmt(x.pages.value) },
        { label: 'Top countries', note: m(sites[0]).countries.source, cell: x => <span className="cell-sub">{x.countries.value.slice(0, 3).map(c => `${c.name} ${c.share}%`).join(', ') || '–'}</span> },
        { label: 'Top channel', note: m(sites[0]).mix.source, cell: x => <span className="cell-sub">{x.mix.value.slice(0, 2).map(c => `${c.name} ${c.share}%`).join(', ') || '–'}</span> },
      ]}/>
    </Section>

    <Section tag="CH-02" title="Search visibility">
      <SiteTable sites={sites} columns={['Ranked keywords', 'Domain authority', 'Backlinks', 'Decaying pages', 'Switching-intent keywords']} rows={x => [
        fmt(x.keywords.value), fmt(x.authority.value), fmt(x.backlinks.value),
        x.seo ? fmt(x.seo.value.decayingPages.length) : dash,
        x.seo ? fmt(x.seo.value.keywords.filter(k => k.funnelStage === 'Bottom-of-Funnel Evaluation').length) : dash,
      ]}/>
      <h5 className="sub-head">Top keywords</h5>
      <SiteTable sites={sites} columns={['Keywords', 'Best volume']} rows={x => [
        <span key="kw" className="cell-sub">{x.topKeywords.value.slice(0, 6).join(', ') || '–'}</span>,
        x.seo?.value.keywords[0] ? fmt(x.seo.value.keywords[0].volume) : dash,
      ]}/>
      <h5 className="sub-head">Decaying pages to target</h5>
      <SiteTable sites={sites} columns={['Page', 'Keywords down/lost', 'Est. visits']} rows={x => {
        const p = x.seo?.value.decayingPages[0];
        return p ? [<span key="p" className="cell-sub">{cut(p.url, 60)}</span>, fmt(p.isDown + p.isLost), fmt(p.etv)] : [dash, dash, dash];
      }}/>
    </Section>

    <Section tag="CH-03" title="Reviews and community complaints">
      <SiteTable sites={sites} columns={['Mined', 'Top friction', 'Top churn', 'Evidence']} rows={x => {
        const r = x.reviews?.value;
        if (!r?.reviews.length) return [dash, dash, dash, dash];
        const top = [...r.reviews].sort((a, b) => (b.churn ?? 0) - (a.churn ?? 0))[0];
        return [fmt(r.reviews.length), Mode(r.reviews.map(v => v.category)) ?? dash, top?.churn ? `${top.churn}/5` : dash, <span key="e" className="cell-sub">“{cut(top?.evidence || top?.text || '', 90)}”</span>];
      }}/>
    </Section>

    <Section tag="CH-04" title="Ad library and proven winners">
      <SiteTable sites={sites} columns={['Creatives', 'Controls 60d+', 'Longest running', 'Top hook angle']} rows={x => {
        const r = x.adIntel?.value;
        if (!r?.ads.length) return [dash, dash, dash, dash];
        return [fmt(r.ads.length), fmt(r.provenWinners), fmt(Math.max(...r.ads.map(a => a.daysActive), 0), 'd'), Mode(r.ads.map(a => a.hookAngle)) ?? dash];
      }}/>
      <h5 className="sub-head">Channel mix</h5>
      {sites.map(s => <div key={s.domain} className="mix-row"><span className="mix-domain">{s.domain}</span><div className="mix-bars">{m(s).mix.value.map(c => <Progress key={c.name} label={c.name} value={c.share} showValue/>)}</div></div>)}
    </Section>

    <Section tag="CH-05" title="Creator and influencer footprint">
      <SiteTable sites={sites} columns={['Posts', 'Poachable creators', 'Top relationship', 'Latest']} rows={x => {
        const r = x.creators?.value;
        if (!r?.posts.length) return [dash, dash, dash, dash];
        const top = [...r.posts].sort((a, b) => (b.poachability ?? 0) - (a.poachability ?? 0))[0];
        return [fmt(r.posts.length), fmt(r.posts.filter(p => (p.poachability ?? 0) >= 4).length), Mode(r.posts.map(p => p.relationship)) ?? dash, <span key="l" className="cell-sub">{cut(`${top?.name ?? ''}: ${top?.text ?? ''}`, 80)}</span>];
      }}/>
    </Section>

    <Section tag="CH-06" title="Packaging and pricing">
      <SiteTable sites={sites} columns={['Value metric', 'Free motion', 'Annual discount', 'Vulnerability', 'Changelog (90d)']} rows={x => {
        const r = x.pricingIntel?.value;
        if (!r) return [dash, dash, dash, dash, dash];
        return [r.valueMetric, r.freeMotion, r.annualDiscountPct != null ? `${r.annualDiscountPct}%` : dash, r.vulnerability ?? dash, fmt(r.changelog.length)];
      }}/>
    </Section>
  </div>;
}
