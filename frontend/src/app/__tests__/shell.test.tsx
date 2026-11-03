import { describe, expect, it } from 'vitest';
import { fuzzyMatch, highlightParts } from '../fuzzy';
import { destinationAt, destinations } from '../nav';

describe('fuzzy search', () => {
  it('prefers a direct match at a word start, and returns exact highlight positions', () => {
    const match = fuzzyMatch('order', 'app/services/orders.py')!;
    expect(match.indices).toEqual([13, 14, 15, 16, 17]);
    expect(match.score).toBeGreaterThan(fuzzyMatch('order', 'app/services/reorders.py')!.score);
  });
  it('matches a subsequence and ranks consecutive letters higher', () => {
    expect(fuzzyMatch('crt', 'create_order')!.indices).toEqual([0, 1, 4]);
    expect(fuzzyMatch('cro', 'create_order')!.score).toBeLessThan(fuzzyMatch('cre', 'create_order')!.score);
  });
  it('rejects missing letters and matches scattered across a long string', () => {
    expect(fuzzyMatch('xyz', 'create_order')).toBeNull();
    expect(fuzzyMatch('order', 'Data source, visualization and navigation preferences.')).toBeNull();
  });
  it('treats an empty query as a neutral match, ignoring case and spaces', () => {
    expect(fuzzyMatch('  ', 'anything')).toEqual({ score: 0, indices: [] });
    expect(fuzzyMatch('KNOW graph', 'Knowledge Graph')).not.toBeNull();
  });
  it('splits text into highlighted runs that rebuild the original', () => {
    const parts = highlightParts('orders.py', [0, 1, 2, 7]);
    expect(parts).toEqual([{ text: 'ord', match: true }, { text: 'ers.', match: false }, { text: 'p', match: true }, { text: 'y', match: false }]);
    expect(parts.map(part => part.text).join('')).toBe('orders.py');
    expect(highlightParts('plain', [])).toEqual([{ text: 'plain', match: false }]);
  });
});

describe('navigation', () => {
  it('has all destinations from the brief, in order', () => {
    expect(destinations.map(item => item.label)).toEqual(['Import & Analyze', 'Overview', 'Codebase Explorer', 'Knowledge Graph', 'Documentation Studio', 'Documentation Intelligence', 'Verification', 'Exports', 'Settings', 'Help']);
  });
  it('gives every destination a unique route and shortcut', () => {
    expect(new Set(destinations.map(item => item.path)).size).toBe(10);
    expect(new Set(destinations.map(item => item.key)).size).toBe(10);
  });
  it('marks a page as working only when it has no pending milestone', () => {
    expect(destinations.filter(item => !item.milestone).map(item => item.id)).toEqual(['import', 'overview', 'explorer', 'graph', 'docs', 'intelligence', 'verification', 'exports', 'settings', 'help']);
    destinations.filter(item => item.milestone).forEach(item => expect(item.planned.length).toBeGreaterThan(0));
  });
  it('resolves nested paths, and does not confuse similar prefixes', () => {
    expect(destinationAt('/app/graph/node')?.id).toBe('graph');
    expect(destinationAt('/app/graphs')).toBeUndefined();
    expect(destinationAt('/app/missing')).toBeUndefined();
  });
});
