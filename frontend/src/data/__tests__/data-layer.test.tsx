import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createRealApi, UNREACHABLE, INVALID_RESPONSE, type PhaseTwoApi } from '../api';
import { describeFailure, JOB_REQUIRED, PENDING, type RepositoryScope } from '../dashboard';
import { buildShopflow, SHOPFLOW } from '../demo/shopflow';
import { createDemoApi } from '../demoApi';
import { createLiveApi, withRetry } from '../liveApi';
import { dataConfig, useDataStore, useResource } from '../source';

const scope: RepositoryScope = { repositoryId: 'p1', snapshotId: 's1' };

describe('shopflow-api demo fixture', () => {
  const fixture = buildShopflow();

  it('holds exactly the totals from the UI specification', () => {
    expect(SHOPFLOW).toMatchObject({ name: 'shopflow-api', files: 214, functions: 1386, classes: 142, coverageBefore: 41, coverageAfter: 78 });
    expect(SHOPFLOW.claims).toEqual({ total: 3912, verified: 3305, uncertain: 402, unsupported: 205 });
    expect(fixture.files).toHaveLength(214);
    expect(fixture.symbols.filter(symbol => symbol.kind === 'class')).toHaveLength(142);
    expect(fixture.symbols.filter(symbol => symbol.kind !== 'class')).toHaveLength(1386);
    expect(fixture.claims).toHaveLength(3912);
    expect(fixture.claims.filter(claim => claim.status === 'verified')).toHaveLength(3305);
    expect(fixture.claims.filter(claim => claim.status === 'uncertain')).toHaveLength(402);
    expect(fixture.claims.filter(claim => claim.status === 'unsupported')).toHaveLength(205);
  });

  it('derives coverage from its own symbols, at 41 percent rising to 78', () => {
    const total = fixture.symbols.length;
    const existing = fixture.symbols.filter(symbol => symbol.documented).length;
    const generated = fixture.symbols.filter(symbol => symbol.willBeGenerated).length;
    expect(Math.round(existing / total * 100)).toBe(41);
    expect(Math.round((existing + generated) / total * 100)).toBe(78);
    expect(fixture.symbols.some(symbol => symbol.documented && symbol.willBeGenerated)).toBe(false);
  });

  it('is stable between builds', () => {
    const again = buildShopflow();
    expect(again.files).toEqual(fixture.files);
    expect(again.symbols).toEqual(fixture.symbols);
    expect(again.claims).toEqual(fixture.claims);
    expect(again.graph).toEqual(fixture.graph);
  });

  it('has unique paths and identifiers, believable text and a 600+ node graph with valid edges', () => {
    expect(new Set(fixture.files.map(file => file.path)).size).toBe(214);
    expect(new Set(fixture.symbols.map(symbol => symbol.qualifiedName)).size).toBe(fixture.symbols.length);
    expect(fixture.graph.nodes.length).toBeGreaterThanOrEqual(600);
    const ids = new Set(fixture.graph.nodes.map(node => node.id));
    expect(ids.size).toBe(fixture.graph.nodes.length);
    expect(fixture.graph.edges.every(edge => ids.has(edge.source) && ids.has(edge.target) && edge.source !== edge.target)).toBe(true);
    expect(JSON.stringify(fixture.symbols.slice(0, 50))).not.toMatch(/lorem|ipsum/i);
  });

  it('serves the original interface, labeled as demo data', async () => {
    const api = createDemoApi({ latency: false });
    const overview = await api.getOverview();
    expect(overview).toMatchObject({ repository: 'shopflow-api', files: 214, functions: 1386, classes: 142, coverageBefore: 41, coverageAfter: 78, claims: SHOPFLOW.claims });
    expect(overview.provenance.kind).toBe('demo');
    expect((await api.getClaims()).provenance.kind).toBe('demo');
    expect((await api.getGraph()).provenance.kind).toBe('demo');
    expect((await api.getDocs()).documents).toHaveLength(214 - 214 + 1386 + 142);
    expect((await api.getStats()).files).toBe(214);
    const file = fixture.files.find(item => item.language === 'Python')!;
    expect((await api.getFile(file.path)).content).toContain('Illustrative demo source');
    await expect(api.getFile('missing.py')).rejects.toMatchObject({ code: 'file_not_found', status: 404 });
    expect(await api.getFileTree()).not.toHaveLength(0);
  });
});

function fakeTransport(overrides: Partial<PhaseTwoApi> = {}): PhaseTwoApi {
  const missing = (name: string) => () => Promise.reject(new Error(`Unexpected call: ${name}`));
  const names = ['getHealth', 'getOriginal', 'getProjects', 'getSnapshots', 'getManifest', 'importFiles', 'importZip', 'importGitHub', 'startPreprocessing', 'getJob', 'getResults', 'getIssues', 'getStatistics', 'startAnalysis', 'getAnalysis', 'getOverview', 'getGraph'] as const;
  return { mode: 'real', ...Object.fromEntries(names.map(name => [name, missing(name)])), ...overrides } as PhaseTwoApi;
}
const snapshot = (id: string, date: string, commit: string | null = null) => ({ id, project_id: 'p1', content_hash: 'h', created_at: date, source_kind: 'zip', origin: 'upload', commit_sha: commit, manifest: { snapshot_id: id, files: [{ id: 'f1', snapshot_id: id, relative_path: 'src/a.py', language: 'python', content_hash: 'x', size_bytes: 9, encoding: 'utf-8', analysis_status: 'ok' }, { id: 'f2', snapshot_id: id, relative_path: 'src/b.java', language: 'java', content_hash: 'y', size_bytes: 9, encoding: 'utf-8', analysis_status: 'ok' }] } });

describe('live adapter', () => {
  it('maps projects and snapshots, newest first, and never invents a branch', async () => {
    const api = createLiveApi({ baseUrl: '', transport: fakeTransport({
      getProjects: async () => [{ schema_version: '1.0', id: 'p1', name: 'real-repo' }],
      getSnapshots: async () => [snapshot('old', '2026-01-01T00:00:00Z'), snapshot('new', '2026-06-01T00:00:00Z', 'abcdef1234')] as never,
    }) });
    const [repository] = await api.getRepositories();
    expect(repository).toMatchObject({ id: 'p1', name: 'real-repo', branch: null, commit: 'abcdef1234', latestSnapshotId: 'new' });
    expect(repository.languages.map(language => language.name)).toEqual(['Python', 'Java']);
    expect((await api.getSnapshots('p1')).map(item => item.id)).toEqual(['new', 'old']);
  });

  it('states what the backend cannot provide rather than filling it in', async () => {
    const api = createLiveApi({ baseUrl: '', transport: fakeTransport() });
    await expect(api.getDocs(scope)).rejects.toMatchObject({ code: JOB_REQUIRED });
    await expect(api.getClaims(scope)).rejects.toMatchObject({ code: JOB_REQUIRED });
    await expect(api.getNotifications(scope)).rejects.toMatchObject({ code: PENDING });
    await expect(api.getOverview(scope)).rejects.toMatchObject({ code: JOB_REQUIRED });
    await expect(api.getGraph(scope)).rejects.toMatchObject({ code: JOB_REQUIRED });
    await expect(api.getStats(scope)).rejects.toMatchObject({ code: JOB_REQUIRED });
    expect(await api.getAnalysisStatus(scope)).toMatchObject({ state: 'none', jobId: null });
  });

  it('leaves claims and generated coverage null, because Phase II measures neither', async () => {
    const api = createLiveApi({ baseUrl: '', transport: fakeTransport({
      getOverview: async () => ({ files: 3, languages: { python: 3 }, documentation_coverage: .5, symbols_by_kind: { function: 4, method: 2, class: 1 } }) as never,
    }) });
    const overview = await api.getOverview({ ...scope, jobId: 'j1' });
    expect(overview).toMatchObject({ files: 3, functions: 6, classes: 1, coverageBefore: 50, coverageAfter: null, claims: null });
    expect(overview.provenance.kind).toBe('measured');
  });

  it('searches manifest files without a job, and says symbols were not searched', async () => {
    const api = createLiveApi({ baseUrl: '', transport: fakeTransport({ getManifest: async () => snapshot('s1', '2026-01-01').manifest as never }) });
    const index = await api.getSearchIndex(scope);
    expect(index.files).toMatchObject({ status: 'ok', items: [{ path: 'src/a.py' }, { path: 'src/b.java' }] });
    expect(index.symbols.status).toBe('unavailable');
  });

  it('retries transport and server failures only, and never a client error', async () => {
    const flaky = vi.fn().mockRejectedValueOnce(new ApiError(UNREACHABLE, 'down', 0)).mockRejectedValueOnce(new ApiError('boom', 'broken', 503)).mockResolvedValue('ok');
    await expect(withRetry(flaky, 2, 0)).resolves.toBe('ok');
    expect(flaky).toHaveBeenCalledTimes(3);
    const denied = vi.fn().mockRejectedValue(new ApiError('missing', 'gone', 404));
    await expect(withRetry(denied, 2, 0)).rejects.toMatchObject({ status: 404 });
    expect(denied).toHaveBeenCalledTimes(1);
    const down = vi.fn().mockRejectedValue(new ApiError(UNREACHABLE, 'down', 0));
    await expect(withRetry(down, 2, 0)).rejects.toMatchObject({ code: UNREACHABLE });
    expect(down).toHaveBeenCalledTimes(3);
  });

  it('rejects a response that does not have the contract shape', async () => {
    const api = createLiveApi({ baseUrl: '', retries: 0, transport: fakeTransport({ getProjects: async () => ({ detail: 'nope' }) as never }) });
    await expect(api.getRepositories()).rejects.toMatchObject({ code: INVALID_RESPONSE });
  });

  it('fails with the backend failure, and no demo identifier or number reaches the result', async () => {
    const down = (): Promise<never> => Promise.reject(new ApiError(UNREACHABLE, 'down', 0));
    const api = createLiveApi({ baseUrl: '', retries: 0, transport: fakeTransport({ getProjects: down, getManifest: down, getOverview: down, getJob: down }) });
    const outcomes = await Promise.allSettled([api.getRepositories(), api.getSearchIndex(scope), api.getOverview({ ...scope, jobId: 'j' }), api.getAnalysisStatus({ ...scope, jobId: 'j' })]);
    expect(outcomes.every(outcome => outcome.status === 'rejected')).toBe(true);
    expect(JSON.stringify(outcomes)).not.toMatch(/shopflow|3912|1386/);
  });
});

describe('fetch transport', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('reports a refused connection as unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(createRealApi('/api/v1').getProjects()).rejects.toMatchObject({ code: UNREACHABLE });
  });
  it('reports a bare proxy 500 as unreachable, and keeps the API error code otherwise', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
    await expect(createRealApi('/api/v1').getProjects()).rejects.toMatchObject({ code: UNREACHABLE, status: 500 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'preprocessing_pending', message: 'Wait.' } }), { status: 409 })));
    await expect(createRealApi('/api/v1').getOverview('j')).rejects.toMatchObject({ code: 'preprocessing_pending', status: 409, message: 'Wait.' });
  });
  it('flags HTML from a static host as not the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<!doctype html>', { status: 200 })));
    await expect(createRealApi('/api/v1').getProjects()).rejects.toMatchObject({ code: INVALID_RESPONSE });
  });
  it('sends the runtime key as a header', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    await createRealApi('/api/v1', () => 'secret').getProjects();
    expect((fetcher.mock.calls[0][1] as RequestInit).headers).toBeInstanceOf(Headers);
    expect(((fetcher.mock.calls[0][1] as RequestInit).headers as Headers).get('x-api-key')).toBe('secret');
  });
});

describe('failure descriptions', () => {
  it('tells pending, missing job, unreachable and auth apart', () => {
    expect(describeFailure(new ApiError(PENDING, 'x', 0))).toMatchObject({ kind: 'pending', retryable: false });
    expect(describeFailure(new ApiError(JOB_REQUIRED, 'x', 0))).toMatchObject({ kind: 'needs-job', retryable: false });
    expect(describeFailure(new ApiError(UNREACHABLE, 'x', 0))).toMatchObject({ kind: 'unreachable', retryable: true });
    expect(describeFailure(new ApiError('unauthorized', 'x', 401))).toMatchObject({ title: 'API key required' });
    expect(describeFailure(new ApiError('not_found', 'x', 404))).toMatchObject({ kind: 'error', retryable: false });
    expect(describeFailure(new Error('x'))).toMatchObject({ kind: 'error', retryable: true });
  });
});

describe('data mode selection', () => {
  beforeEach(() => { localStorage.clear(); useDataStore.setState({ mode: 'demo', repositoryId: null, snapshotId: null, jobIds: {} }); });

  it('defaults to demo unless the environment selects live', () => {
    expect(dataConfig({}).defaultMode).toBe('demo');
    expect(dataConfig({ VITE_DATA_MODE: 'live', VITE_API_BASE: 'https://api.example.test/' })).toEqual({ defaultMode: 'live', apiBase: 'https://api.example.test' });
    expect(dataConfig({ VITE_DATA_MODE: 'other' }).defaultMode).toBe('demo');
  });
  it('clears the selection when the mode changes, so IDs never cross sources', () => {
    useDataStore.getState().selectRepository('demo-shopflow-api', 'demo-snapshot-generated');
    useDataStore.getState().setMode('live');
    expect(useDataStore.getState()).toMatchObject({ mode: 'live', repositoryId: null, snapshotId: null });
  });
  it('keeps job IDs per snapshot, and removes a blank one', () => {
    useDataStore.getState().setJobId('s1', ' job-1 ');
    expect(useDataStore.getState().jobIds).toEqual({ s1: 'job-1' });
    useDataStore.getState().setJobId('s1', '');
    expect(useDataStore.getState().jobIds).toEqual({});
  });
  it('never persists an API key', async () => {
    const { setApiKey } = await import('../source');
    setApiKey('secret-key');
    useDataStore.getState().setMode('live');
    expect(JSON.stringify({ ...localStorage })).not.toContain('secret-key');
    setApiKey('');
  });
});

describe('useResource', () => {
  it('drops a late response from the previous key', async () => {
    let resolveOld: (value: string) => void = () => undefined;
    const old = new Promise<string>(resolve => { resolveOld = resolve; });
    const { result, rerender } = renderHook(({ id, load }) => useResource(id, load), { initialProps: { id: 'a', load: () => old } });
    expect(result.current.status).toBe('loading');
    rerender({ id: 'b', load: () => Promise.resolve('new') });
    await waitFor(() => expect(result.current.data).toBe('new'));
    await act(async () => { resolveOld('stale'); await old; });
    expect(result.current.data).toBe('new');
  });
  it('shows loading on a new key rather than the old value', async () => {
    const { result, rerender } = renderHook(({ id, load }) => useResource(id, load), { initialProps: { id: 'demo', load: () => Promise.resolve('demo value') } });
    await waitFor(() => expect(result.current.data).toBe('demo value'));
    rerender({ id: 'live', load: () => new Promise<string>(() => undefined) });
    expect(result.current.status).toBe('loading');
    expect(result.current.data).toBeNull();
  });
  it('reports failure with no data, and recovers on retry', async () => {
    const load = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new ApiError(UNREACHABLE, 'down', 0)).mockResolvedValue('back');
    const { result } = renderHook(() => useResource('key', load));
    await waitFor(() => expect(result.current.status).toBe('failed'));
    expect(result.current.data).toBeNull();
    expect(result.current.failure?.kind).toBe('unreachable');
    act(() => result.current.retry());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.data).toBe('back'));
  });
  it('does nothing without a key', () => {
    const load = vi.fn(() => Promise.resolve('x'));
    const { result } = renderHook(() => useResource(null, load));
    expect(result.current.status).toBe('loading');
    expect(load).not.toHaveBeenCalled();
  });
});
