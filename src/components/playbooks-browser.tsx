'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import SegmentedControl from './arc/segmented-control/segmented-control';
import { Badge, Button, Card, EmptyState, Input } from './ui';
import { categories, playbooksByCategory } from '@/lib/playbooks';
import SiteShot from './site-shot';

export default function PlaybooksBrowser() {
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return playbooksByCategory(category).filter(p => !q || p.title.toLowerCase().includes(q) || p.summary.toLowerCase().includes(q) || p.exampleDomain.includes(q));
  }, [category, query]);
  const options = ['All', ...categories].map(value => ({ value, label: value, accessory: value === 'All' ? String(playbooksByCategory('All').length) : undefined }));
  return <>
    <div className="playbook-controls">
      <SegmentedControl label="Filter by business model" options={options} value={category} onValueChange={setCategory}/>
      <Input label="Search playbooks" placeholder="Search by motion, domain or tactic" value={query} onChange={e => setQuery(e.target.value)}/>
    </div>
    {filtered.length ? <div className="playbook-grid">{filtered.map(p => (
      <Card key={p.id} title={p.title} meta={<Badge>{p.category}</Badge>} description={p.summary}
        media={<SiteShot domain={p.exampleDomain} width={1280} height={800} alt={`${p.exampleDomain} landing page`} className="playbook-shot" localSrc={`/playbooks/${p.id}.webp`}/>}
        avatar={<img src={`https://www.google.com/s2/favicons?domain=${p.exampleDomain}&sz=128`} alt="" className="playbook-logo"/>}
        status={`Exemplar: ${p.exampleDomain}`}
        action={<Link href={`/playbooks/${p.id}`}><Button variant="secondary">Analyse this play <ArrowRight size={14}/></Button></Link>}>
        <ul className="playbook-moves">{p.moves.map(m => <li key={m}>{m}</li>)}</ul>
        <p className="playbook-foot"><span>{p.outcome}</span><span className="muted">Channels: {p.channels.join(' · ')}</span></p>
      </Card>
    ))}</div> : <EmptyState title="No playbooks match" description="Try another category or clear the search." action={<Button variant="secondary" onClick={() => { setQuery(''); setCategory('All'); }}>Reset filters</Button>}/>}
  </>;
}
