import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Comparison, { SourceBadge } from '../src/components/comparison';
import Ghost from '../src/components/ghost';
import Witch from '../src/components/witch';
import type { Run } from '../src/lib/types';
import { seededMetrics } from '../src/lib/metrics';
describe('Arc comparison states', () => {
  it('keeps provenance explicit without treating simulated data as an error', () => {
    for (const source of ['live', 'simulated']) expect(renderToStaticMarkup(createElement(SourceBadge, { source }))).toContain(source);
  });
  it('offers a recovery action for missing snapshots', () => {
    const html = renderToStaticMarkup(createElement(Comparison, { run: { snapshots: [] } as unknown as Run }));
    expect(html).toContain('Comparison data is missing');
    expect(html).toContain('Start an analysis');
  });
  it('renders both websites and the modeled regional map without browser globals', () => {
    const snapshots = ['linear.app', 'asana.com'].map(domain => ({ domain, metrics: seededMetrics(domain) }));
    const html = renderToStaticMarkup(createElement(Comparison, { run: { snapshots } as unknown as Run }));
    expect(html).toContain('linear.app');
    expect(html).toContain('asana.com');
    expect(html).toContain('simulated');
    expect(html).toContain('Schematic world choropleth');
  });
});
describe('original Jev ghost', () => {
  it('renders an idle mascot at the requested size without browser globals', () => {
    const html = renderToStaticMarkup(createElement(Ghost, { size: 112 }));
    expect(html).toContain('width="112"');
    expect(html).toContain('data-mode="idle"');
    expect(html).toContain('ghost-hem');
    expect(html).toContain('ghost-shadow');
  });
  it('provides working and completed expressions with a sparkle', () => {
    const working = renderToStaticMarkup(createElement(Ghost, { mode: 'working' }));
    const done = renderToStaticMarkup(createElement(Ghost, { mode: 'done' }));
    expect(working).toContain('data-mode="working"');
    expect(done).toContain('data-mode="done"');
    expect(done).toContain('ghost-sparkle');
    expect(done).not.toEqual(working);
  });
});
describe('young brewing witch', () => {
  it('renders a working brew with a stirring arm, bubbles and steam', () => {
    const html = renderToStaticMarkup(createElement(Witch));
    expect(html).toContain('data-mode="working"');
    expect(html).toContain('Young witch stirring a bubbling cauldron');
    expect(html).toContain('width="200"');
    expect(html).toContain('bubble');
    expect(html).toContain('steam');
  });
  it('changes expression and pose on completion while respecting size', () => {
    const html = renderToStaticMarkup(createElement(Witch, { size: 96, mode: 'done' }));
    expect(html).toContain('width="96"');
    expect(html).toContain('data-mode="done"');
    expect(html).toContain('celebrating her finished brew');
    expect(html).not.toEqual(renderToStaticMarkup(createElement(Witch)));
  });
});
