'use client';
import { useState, type FormEvent } from 'react';
import { ArrowRight, Search, X } from 'lucide-react';
import type { CompetitorSuggestion } from '@/lib/competitors';
import { Button, Checkbox, EmptyState, Skeleton } from './ui';

export default function VariantPicker({ domain, max, planLabel, suggested, selected, source, discovery, coverage, busy, onToggle, onAddCustom, onGather, onRetry }: {
  domain: string; max: number; planLabel: string;
  suggested: CompetitorSuggestion[]; selected: string[]; source: string;
  discovery: boolean; coverage: string; busy: boolean;
  onToggle: (d: string) => void; onAddCustom: (d: string) => string | null; onGather: () => void; onRetry: () => void;
}) {
  const [draft, setDraft] = useState(''), [err, setErr] = useState('');
  const desc = (s: CompetitorSuggestion) => s.title || s.description || (source === 'simulated' ? 'Illustrative category peer' : 'Similar-site suggestion');
  const submit = (e: FormEvent) => { e.preventDefault(); const err = onAddCustom(draft); if (err) setErr(err); else { setDraft(''); setErr(''); } };
  return <section className="v2">
    <header className="v2-hero"><h2>Explore your competitors.<br/><span>Select what to analyse.</span></h2><p className="muted">Choose from popular competitors or add your own. We will help you compare key insights.</p></header>
    <form className="v2-add-form" onSubmit={submit}><div className="pick-search"><Search size={15} aria-hidden="true"/><input type="search" aria-label="Competitor domain" placeholder="Add a competitor URL (e.g. rival.com)" value={draft} onChange={e => setDraft(e.target.value)}/></div><Button variant="secondary">Add to list</Button></form>
    {discovery ? <Skeleton label="Finding competitors" lines={5}/> : suggested.length ? <div className="v2-grid">{suggested.map(s => <article key={s.domain} className="pick-card v2-card" data-selected={selected.includes(s.domain) || undefined}><span className="pick-logo"><img src={s.favicon || `https://www.google.com/s2/favicons?domain=${s.domain}&sz=64`} alt=""/></span><div className="pick-meta"><b>{s.domain}</b><span>{desc(s)}</span></div><Checkbox aria-label={`Select ${s.domain}`} checked={selected.includes(s.domain)} disabled={!selected.includes(s.domain) && selected.length >= max} onCheckedChange={() => onToggle(s.domain)}/></article>)}</div> : <EmptyState title={coverage === 'insufficient_data' ? 'No traffic data for this site yet' : 'No suggestions available'} description={coverage === 'insufficient_data' ? `The provider does not track ${domain} yet. Add your actual competitor domains above.` : 'Add your actual competitor domain above, or retry discovery.'} action={<Button variant="secondary" onClick={onRetry}>Retry discovery</Button>}/>}
    {err ? <p className="chip-error" role="alert">{err}</p> : null}
    <p className="hint">{source === 'simulated' ? 'Simulated suggestions are a starting point, not verified competitors.' : 'Live discovery, ranked by similarity. Select peers relevant to your market.'} {planLabel} allows {max} competitor{max === 1 ? '' : 's'}.</p>
    <div className="v2-dock"><b>{selected.length} competitor{selected.length === 1 ? '' : 's'} selected</b>{selected.length ? <div className="v2-chips">{selected.map(d => <span key={d} className="v2-chip"><img src={`https://www.google.com/s2/favicons?domain=${d}&sz=64`} alt=""/>{d}<button type="button" aria-label={`Remove ${d}`} onClick={() => onToggle(d)}><X size={12} aria-hidden="true"/></button></span>)}</div> : null}<Button variant="primary" disabled={!selected.length || discovery || busy} onClick={onGather}>Add to analyse <ArrowRight size={15}/></Button></div>
  </section>;
}
