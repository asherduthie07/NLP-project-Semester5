import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PhaseTwoApi } from '../api';
import { PENDING } from '../dashboard';
import { importCycles, namingPattern } from '../analysisMath';
import { buildCoverageHistory, buildDemoAnalysis } from '../demo/analysis';
import { buildShopflow, SHOPFLOW } from '../demo/shopflow';
import { createLiveApi } from '../liveApi';

describe('demo analysis record', () => {
  const fixture = buildShopflow();
  const analysis = buildDemoAnalysis(fixture);

  it('places every symbol on its own code, with docstrings only where documented', () => {
    for (const symbol of analysis.symbols.slice(0, 400)) {
      const lines = fixture.source(symbol.path)!.content.split('\n');
      const head = lines[symbol.line - 1];
      expect(head).toContain(symbol.kind === 'class' ? `class ${symbol.name}:` : `def ${symbol.name}(`);
      expect(lines[symbol.line].includes('"""')).toBe(symbol.documented);
      expect(symbol.endLine).toBeGreaterThanOrEqual(symbol.line);
      expect(symbol.endLine).toBeLessThanOrEqual(lines.length);
    }
  });

  it('agrees with the fixture totals and coverage', () => {
    const stats = analysis.statistics;
    expect(stats.files).toBe(SHOPFLOW.files);
    expect((stats.symbols_by_kind.function ?? 0) + (stats.symbols_by_kind.method ?? 0)).toBe(SHOPFLOW.functions);
    expect(stats.symbols_by_kind.class).toBe(SHOPFLOW.classes);
    expect(Math.round(stats.documentation_coverage * 100)).toBe(SHOPFLOW.coverageBefore);
    expect(stats.function_lengths).toHaveLength(SHOPFLOW.functions);
    expect(stats.docstring_lengths.length).toBe(stats.documented_symbols + 1 * fixture.files.filter(file => file.language === 'Python').length);
    expect(stats.token_types.identifier).toBeGreaterThan(0);
    expect(stats.lexical_diversity).toBeGreaterThan(0);
    expect(stats.lexical_diversity).toBeLessThan(1);
  });

  it('keeps unresolved and external relationships without a target', () => {
    const open = analysis.relations.filter(relation => relation.resolution !== 'confirmed');
    expect(open.length).toBeGreaterThan(0);
    expect(open.every(relation => relation.target === null)).toBe(true);
    expect(analysis.statistics.relationships_by_status.external).toBe(open.filter(relation => relation.resolution === 'external').length);
  });

  it('is stable between builds', () => {
    expect(buildDemoAnalysis(buildShopflow()).statistics).toEqual(analysis.statistics);
  });

  it('has 90 days of history ending at the fixture coverage', () => {
    const history = buildCoverageHistory();
    expect(history).toHaveLength(90);
    expect(history.at(-1)).toMatchObject({ date: '2026-11-01', existing: SHOPFLOW.coverageBefore, generated: SHOPFLOW.coverageAfter - SHOPFLOW.coverageBefore, files: SHOPFLOW.files });
  });
});

describe('analysis helpers', () => {
  it('finds import cycles and nothing else', () => {
    expect(importCycles([{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }, { source: 'b', target: 'c' }])).toEqual([['a', 'b']]);
    expect(importCycles([{ source: 'a', target: 'b' }])).toEqual([]);
  });
  it('classifies naming conventions', () => {
    expect(['get_order', 'OrderService', 'getOrder', 'MAX_RETRIES', 'self'].map(namingPattern)).toEqual(['snake_case', 'PascalCase', 'camelCase', 'UPPER_CASE', 'other']);
  });
});

describe('live analysis mapping', () => {
  /** Statistics from the committed Phase II findings, produced by the real analyzer. The findings file condenses symbols, so those are built in API shape here. */
  const statistics = JSON.parse(readFileSync(resolve(process.cwd(), '../docs/07-findings/phase-2/analysis.json'), 'utf-8')).statistics;
  const evidence = (line: number, end: number) => ({ schema_version: '1.0', snapshot_id: 's1', file_id: 'f1', relative_path: 'catalog.py', span: { schema_version: '1.0', start: { schema_version: '1.0', line, column: 0 }, end: { schema_version: '1.0', line: end, column: 0 } } });
  const symbol = { schema_version: '1.0', id: 'sym1', snapshot_id: 's1', file_id: 'f1', name: 'Catalog', qualified_name: 'catalog.Catalog', kind: 'class', parent_id: null, documented: true, evidence: evidence(3, 16), analyzer_version: 'x' };
  const relationship = { schema_version: '1.0', id: 'r1', snapshot_id: 's1', source_id: 'sym1', target_id: null, target_name: 'json', kind: 'imports', resolution: 'external', evidence: evidence(1, 1), analyzer_version: 'x' };
  const manifest = { schema_version: '1.0', snapshot_id: 's1', files: [{ id: 'f1', snapshot_id: 's1', relative_path: 'catalog.py', language: 'python', content_hash: 'h', size_bytes: 120, encoding: 'utf-8', analysis_status: 'pending' }] };
  const transport = { getAnalysis: async () => ({ schema_version: '1.0', snapshot_id: 's1', preprocessing_job_id: 'p', symbols: [symbol], relationships: [relationship], endpoints: [], statistics, issues: [], analyzer_version: 'x' }), getManifest: async () => manifest } as unknown as PhaseTwoApi;

  it('maps the analyzer record without changing its numbers', async () => {
    const api = createLiveApi({ baseUrl: '', transport });
    const result = await api.getAnalysis({ repositoryId: 'p1', snapshotId: 's1', jobId: 'j1' });
    expect(result.statistics).toEqual(statistics);
    expect(result.files).toEqual([{ id: 'f1', path: 'catalog.py', language: 'Python', sizeBytes: 120 }]);
    expect(result.symbols[0]).toMatchObject({ id: 'sym1', path: 'catalog.py', line: 3, endLine: 16, documented: true, parentId: null });
    expect(result.relations[0]).toMatchObject({ target: null, targetName: 'json', resolution: 'external', line: 1 });
    expect(result.analyzedAt).toBeNull();
    expect(result.provenance.kind).toBe('measured');
  });

  it('needs a job, and reports coverage history as pending', async () => {
    const api = createLiveApi({ baseUrl: '', transport });
    await expect(api.getAnalysis({ repositoryId: 'p1', snapshotId: 's1' })).rejects.toMatchObject({ code: 'analysis_job_required' });
    await expect(api.getCoverageHistory()).rejects.toMatchObject({ code: PENDING });
  });
});
