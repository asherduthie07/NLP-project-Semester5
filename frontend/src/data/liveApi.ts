import { ApiError, createRealApi, type PhaseTwoApi, type SourceSnapshot } from './api';
import { INVALID_RESPONSE, JOB_REQUIRED, PENDING, UNREACHABLE, type AnalysisState, type DashboardApi, type DataProvenance, type FileNode, type LanguageShare, type Repository, type RepositoryScope } from './dashboard';

const MEASURED: DataProvenance = { kind: 'measured', source: 'CodeAtlas backend, Phase II static analysis.' };

export interface LiveConfig {
  baseUrl: string;
  getKey?: () => string;
  retries?: number;
  retryDelayMs?: number;
  /** Injected for tests. */
  transport?: PhaseTwoApi;
}

const pending = (what: string): ApiError => new ApiError(PENDING, `${what} has no endpoint in the current backend. It depends on later phases, so nothing is shown instead.`, 0);
const needsJob = (what: string): ApiError => new ApiError(JOB_REQUIRED, `${what} needs a completed Phase II analysis job. The API cannot list jobs for a snapshot, so add the job ID in Settings.`, 0);

function isTransient(error: unknown) {
  if (error instanceof ApiError) return error.code === UNREACHABLE || error.status >= 500;
  return false;
}

/** Retries reads only on transport and server failures. A 4xx is an answer, so it is never retried. */
export async function withRetry<T>(read: () => Promise<T>, retries: number, delayMs: number): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try { return await read(); } catch (error) {
      if (attempt >= retries || !isTransient(error)) throw error;
      await new Promise(resolve => setTimeout(resolve, delayMs * 2 ** attempt));
    }
  }
}

function expectArray<T>(value: T[], what: string): T[] {
  if (!Array.isArray(value)) throw new ApiError(INVALID_RESPONSE, `The backend returned an unexpected shape for ${what}.`, 0);
  return value;
}

function languageShares(files: { language: string }[]): LanguageShare[] {
  const counts = new Map<string, number>();
  files.forEach(file => counts.set(file.language, (counts.get(file.language) ?? 0) + 1));
  return [...counts].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name: name[0].toUpperCase() + name.slice(1), files: count, share: Math.round(count / files.length * 1000) / 10 }));
}

function treeFrom(paths: { path: string; language: string | null; sizeBytes: number }[]): FileNode[] {
  const root: FileNode[] = [];
  for (const file of paths) {
    let level = root, prefix = '';
    const parts = file.path.split('/');
    parts.forEach((part, index) => {
      prefix = prefix ? `${prefix}/${part}` : part;
      if (index === parts.length - 1) { level.push({ path: file.path, name: part, type: 'file', language: file.language, sizeBytes: file.sizeBytes }); return; }
      let directory = level.find(node => node.type === 'directory' && node.name === part);
      if (!directory) { directory = { path: prefix, name: part, type: 'directory', language: null, sizeBytes: null, children: [] }; level.push(directory); }
      level = directory.children!;
    });
  }
  return root;
}

const createdAt = (snapshot: SourceSnapshot) => snapshot.created_at ?? '';
/** Sums the named keys. Plain indexing would read "constructor" from Object.prototype, and that is a real symbol kind. */
const countKinds = (byKind: Record<string, number>, kinds: string[]) => Object.entries(byKind).reduce((sum, [kind, value]) => kinds.includes(kind) ? sum + value : sum, 0);
const FUNCTION_KINDS = ['function', 'method', 'constructor'], CLASS_KINDS = ['class', 'interface', 'enum', 'record'];

const newestFirst = (snapshots: SourceSnapshot[]) => [...snapshots].sort((a, b) => createdAt(b).localeCompare(createdAt(a)));

/** Maps the implemented Phase II API onto the dashboard interface. Every other method fails with a typed reason, and none reach for demo data. */
export function createLiveApi({ baseUrl, getKey, retries = 2, retryDelayMs = 300, transport }: LiveConfig): DashboardApi {
  const api = transport ?? createRealApi(`${baseUrl}/api/v1`, getKey);
  const read = <T,>(call: () => Promise<T>) => withRetry(call, retries, retryDelayMs);
  const requireScope = (scope: RepositoryScope | undefined, what: string): RepositoryScope => {
    if (!scope) throw new ApiError(JOB_REQUIRED, `${what} needs a selected repository snapshot.`, 0);
    return scope;
  };
  const jobOf = (scope: RepositoryScope | undefined, what: string): string => {
    if (!scope?.jobId) throw needsJob(what);
    return scope.jobId;
  };
  return {
    mode: 'live',
    getHealth: async () => {
      const health = await read(() => api.getHealth());
      return { reachable: health.status === 'ok', scope: health.scope ?? 'unknown', schemaVersion: health.schema_version ?? 'unknown' };
    },
    getRepositories: async () => {
      const projects = expectArray(await read(() => api.getProjects()), 'projects');
      return Promise.all(projects.map(async (project): Promise<Repository> => {
        const id = project.id;
        if (!id) throw new ApiError(INVALID_RESPONSE, 'The backend returned a project without an ID.', 0);
        const snapshots = newestFirst(expectArray(await read(() => api.getSnapshots(id)), 'snapshots'));
        const latest = snapshots[0];
        return { id, name: project.name, origin: latest?.origin ?? null, sourceKind: latest?.source_kind ?? 'unknown', branch: null, commit: latest?.commit_sha ?? null, languages: latest ? languageShares(latest.manifest.files) : [], latestSnapshotId: latest?.id ?? null };
      }));
    },
    getSnapshots: async repositoryId => newestFirst(expectArray(await read(() => api.getSnapshots(repositoryId)), 'snapshots')).map(snapshot => ({
      id: snapshot.id,
      label: `${snapshot.source_kind} snapshot, ${createdAt(snapshot).slice(0, 10)}`,
      commit: snapshot.commit_sha ?? null,
      createdAt: createdAt(snapshot),
      note: `${snapshot.manifest.files.length} files`,
    })),
    getAnalysisStatus: async scope => {
      if (!scope.jobId) return { state: 'none', label: 'No analysis job', detail: 'The API cannot list jobs for a snapshot. Add a job ID in Settings to track one.', jobId: null };
      const job = await read(() => api.getJob(scope.jobId!));
      const state = job.status as AnalysisState;
      const label = state === 'complete' ? 'Analysis complete' : state === 'failed' ? 'Analysis failed' : state === 'running' ? 'Analysis running' : 'Analysis queued';
      return { state, label, detail: `${job.kind} job ${job.id}, ${job.issues?.length ?? 0} issues`, jobId: job.id };
    },
    getNotifications: async () => { throw pending('Notifications'); },
    getActivity: async scope => {
      if (!scope.jobId) throw needsJob('The activity log');
      const issues = expectArray(await read(() => api.getIssues(scope.jobId!)), 'issues');
      return issues.map((issue, index) => ({ id: `${issue.code}-${index}`, at: issue.severity, level: issue.severity === 'error' || issue.severity === 'warning' ? 'warn' : 'info', message: `${issue.code}: ${issue.message}` }));
    },
    getSearchIndex: async scope => {
      const manifest = await read(() => api.getManifest(scope.snapshotId));
      const files = expectArray(manifest.files, 'manifest files').map(file => ({ kind: 'file' as const, id: file.id, path: file.relative_path, language: file.language }));
      if (!scope.jobId) return { files: { status: 'ok', items: files }, symbols: { status: 'unavailable', reason: 'Symbol search needs a completed analysis job. Add its ID in Settings.' } };
      const paths = new Map(files.map(file => [file.id, file.path]));
      try {
        const analysis = await read(() => api.getAnalysis(scope.jobId!));
        return { files: { status: 'ok', items: files }, symbols: { status: 'ok', items: analysis.symbols.map(symbol => ({ kind: 'symbol', id: symbol.id, name: symbol.name, qualifiedName: symbol.qualified_name, symbolKind: symbol.kind, path: paths.get(symbol.file_id) ?? null })) } };
      } catch (error) {
        const reason = error instanceof ApiError ? `Symbols could not load: ${error.message}` : 'Symbols could not load.';
        return { files: { status: 'ok', items: files }, symbols: { status: 'unavailable', reason } };
      }
    },
    getOverview: async scope => {
      const stats = await read(() => api.getOverview(jobOf(scope, 'The overview')));
      return { repository: requireScope(scope, 'The overview').repositoryId, files: stats.files, functions: countKinds(stats.symbols_by_kind, FUNCTION_KINDS), classes: countKinds(stats.symbols_by_kind, CLASS_KINDS), coverageBefore: Math.round(stats.documentation_coverage * 1000) / 10, coverageAfter: null, claims: null, provenance: MEASURED };
    },
    getFileTree: async scope => {
      const manifest = await read(() => api.getManifest(requireScope(scope, 'The file tree').snapshotId));
      return treeFrom(expectArray(manifest.files, 'manifest files').map(file => ({ path: file.relative_path, language: file.language, sizeBytes: file.size_bytes })));
    },
    getFile: async (path, scope) => {
      const { snapshotId } = requireScope(scope, 'A file');
      const manifest = await read(() => api.getManifest(snapshotId));
      const file = manifest.files.find(item => item.relative_path === path);
      if (!file) throw new ApiError('file_not_found', `${path} is not in this snapshot.`, 404);
      const content = await read(() => api.getOriginal(snapshotId, file.id));
      return { path, language: file.language, content, provenance: { kind: 'measured', source: 'Original bytes from the snapshot.' } };
    },
    getGraph: async scope => {
      const graph = await read(() => api.getGraph(jobOf(scope, 'The knowledge graph')));
      return {
        nodes: graph.nodes.map(node => ({ id: node.id, label: node.name, kind: node.kind, cluster: node.file_id, path: null })),
        edges: graph.edges.flatMap(edge => edge.target_id ? [{ source: edge.source_id, target: edge.target_id, kind: edge.kind }] : []),
        provenance: MEASURED,
      };
    },
    getDocs: async () => { throw pending('Documentation generation'); },
    getClaims: async () => { throw pending('Claim verification'); },
    getStats: async scope => {
      const stats = await read(() => api.getOverview(jobOf(scope, 'Repository statistics')));
      const total = Object.values(stats.languages).reduce((sum, value) => sum + value, 0);
      return {
        files: stats.files, functions: countKinds(stats.symbols_by_kind, FUNCTION_KINDS), classes: countKinds(stats.symbols_by_kind, CLASS_KINDS),
        languages: Object.entries(stats.languages).map(([name, files]) => ({ name: name[0].toUpperCase() + name.slice(1), files, share: total ? Math.round(files / total * 1000) / 10 : 0 })),
        documentationCoverage: Math.round(stats.documentation_coverage * 1000) / 10,
        symbolsByKind: Object.entries(stats.symbols_by_kind).map(([kind, value]) => ({ kind, count: value })),
        provenance: MEASURED,
      };
    },
  };
}
