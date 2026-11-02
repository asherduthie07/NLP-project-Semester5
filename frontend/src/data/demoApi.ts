import { ApiError } from './api';
import type { DashboardApi, DataProvenance, RepositoryScope } from './dashboard';
import type { Shopflow } from './demo/shopflow';

export const DEMO_PROVENANCE: DataProvenance = { kind: 'demo', source: 'Seeded shopflow-api fixture. Illustrative, not an analysis result.' };

/** The specification's skeleton pass: page data takes 600 to 1200 ms, chosen per method so it stays stable between reloads. */
const latencyFor = (method: string) => 600 + [...method].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 601;

export interface DemoOptions { latency?: boolean }

/** Implements the original mock interface. The fixture loads on first use, so Live sessions never download it. */
export function createDemoApi({ latency = true }: DemoOptions = {}): DashboardApi {
  let data: Promise<Shopflow> | null = null;
  const load = () => (data ??= import('./demo/shopflow').then(module => module.buildShopflow()));
  const page = async <T,>(method: string, read: (fixture: Shopflow, constants: typeof import('./demo/shopflow').SHOPFLOW) => T): Promise<T> => {
    const [fixture, { SHOPFLOW }] = await Promise.all([load(), import('./demo/shopflow')]);
    if (latency) await new Promise(resolve => setTimeout(resolve, latencyFor(method)));
    return read(fixture, SHOPFLOW);
  };
  const immediate = async <T,>(read: (fixture: Shopflow, constants: typeof import('./demo/shopflow').SHOPFLOW) => T): Promise<T> => {
    const [fixture, { SHOPFLOW }] = await Promise.all([load(), import('./demo/shopflow')]);
    return read(fixture, SHOPFLOW);
  };
  return {
    mode: 'demo',
    getHealth: async () => ({ reachable: true, scope: 'demo fixture', schemaVersion: 'none' }),
    getRepositories: () => immediate((fixture, s) => [{ id: s.id, name: s.name, origin: s.origin, sourceKind: 'demo', branch: s.branch, commit: s.commit, languages: fixture.languages, latestSnapshotId: 'demo-snapshot-generated' }]),
    getSnapshots: async () => [
      { id: 'demo-snapshot-generated', label: 'v2.4.0, documentation generated', commit: 'a3f9c21', createdAt: '2026-10-28T09:12:00Z', note: 'Coverage 78%' },
      { id: 'demo-snapshot-baseline', label: 'v2.3.0, baseline', commit: '7be04d6', createdAt: '2026-09-14T16:40:00Z', note: 'Coverage 41%' },
    ],
    getAnalysisStatus: async () => ({ state: 'complete', label: 'Analysis complete', detail: 'Illustrative status from the demo fixture. No analysis ran.', jobId: null }),
    getNotifications: async () => [
      { id: 'demo-n1', tone: 'success', title: 'Documentation pass finished', detail: 'Coverage rose from 41% to 78% in the demo fixture.', at: '2026-10-28T09:12:00Z' },
      { id: 'demo-n2', tone: 'warning', title: '205 unsupported claims', detail: 'Illustrative claims in the demo fixture need review.', at: '2026-10-28T09:11:00Z' },
    ],
    getActivity: () => immediate(fixture => fixture.symbols.slice(0, 40).map((symbol, index) => ({ id: `demo-a${index}`, at: `09:${String(40 - index).padStart(2, '0')}`, level: index % 11 === 0 ? 'warn' : index % 3 === 0 ? 'ok' : 'info', message: `${index % 3 === 0 ? 'Verified' : index % 11 === 0 ? 'Flagged' : 'Parsed'} ${symbol.qualifiedName}` }))),
    getSearchIndex: (_scope: RepositoryScope) => immediate(fixture => ({
      files: { status: 'ok', items: fixture.files.map(file => ({ kind: 'file', id: file.id, path: file.path, language: file.language })), note: 'Demo fixture' },
      symbols: { status: 'ok', items: fixture.symbols.map(symbol => ({ kind: 'symbol', id: symbol.id, name: symbol.name, qualifiedName: symbol.qualifiedName, symbolKind: symbol.kind, path: symbol.path })), note: 'Demo fixture' },
    })),
    getOverview: () => page('getOverview', (_, s) => ({ repository: s.name, files: s.files, functions: s.functions, classes: s.classes, coverageBefore: s.coverageBefore, coverageAfter: s.coverageAfter, claims: { ...s.claims }, provenance: DEMO_PROVENANCE })),
    getFileTree: () => page('getFileTree', fixture => fixture.tree),
    getFile: path => page('getFile', fixture => {
      const found = fixture.source(path);
      if (!found) throw new ApiError('file_not_found', `${path} is not in the demo fixture.`, 404);
      return { path, language: found.file.language, content: found.content, provenance: DEMO_PROVENANCE };
    }),
    getGraph: () => page('getGraph', fixture => ({ ...fixture.graph, provenance: DEMO_PROVENANCE })),
    getDocs: () => page('getDocs', (fixture, s) => ({ coverageBefore: s.coverageBefore, coverageAfter: s.coverageAfter, documents: fixture.documents, provenance: DEMO_PROVENANCE })),
    getClaims: () => page('getClaims', (fixture, s) => ({ summary: { ...s.claims }, claims: fixture.claims, provenance: DEMO_PROVENANCE })),
    getStats: () => page('getStats', (fixture, s) => ({
      files: s.files, functions: s.functions, classes: s.classes, languages: fixture.languages, documentationCoverage: s.coverageBefore,
      symbolsByKind: ['function', 'method', 'class'].map(kind => ({ kind, count: fixture.symbols.filter(symbol => symbol.kind === kind).length })),
      provenance: DEMO_PROVENANCE,
    })),
  };
}
