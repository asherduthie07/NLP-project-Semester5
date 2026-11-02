import { ApiError, INVALID_RESPONSE, UNREACHABLE } from './api';

/** The dashboard's data seam. Demo and Live implement the same interface, and nothing moves data between them. */
export type DataMode = 'demo' | 'live';

export interface DataProvenance { kind: 'demo' | 'measured'; source: string }
export interface RepositoryScope { repositoryId: string; snapshotId: string; jobId?: string | null }

export interface LanguageShare { name: string; files: number; share: number }
export interface Repository {
  id: string;
  name: string;
  origin: string | null;
  sourceKind: string;
  /** The Phase II API records no branch, so Live reports null rather than guessing. */
  branch: string | null;
  commit: string | null;
  languages: LanguageShare[];
  latestSnapshotId: string | null;
}
export interface SnapshotInfo { id: string; label: string; commit: string | null; createdAt: string; note: string | null }

export type AnalysisState = 'complete' | 'running' | 'queued' | 'failed' | 'none';
export interface AnalysisStatus { state: AnalysisState; label: string; detail: string; jobId: string | null }

export interface ServiceHealth { reachable: boolean; scope: string; schemaVersion: string }
export interface ShellNotification { id: string; tone: 'info' | 'success' | 'warning' | 'error'; title: string; detail: string; at: string | null }
export interface ActivityEntry { id: string; at: string; level: 'info' | 'ok' | 'warn'; message: string }

export interface ClaimSummary { total: number; verified: number; uncertain: number; unsupported: number }
export interface Overview {
  repository: string;
  files: number;
  functions: number;
  classes: number;
  /** Existing coverage in percent. */
  coverageBefore: number;
  /** Null until a documentation generator exists for this source. */
  coverageAfter: number | null;
  claims: ClaimSummary | null;
  provenance: DataProvenance;
}

export interface FileNode { path: string; name: string; type: 'file' | 'directory'; language: string | null; sizeBytes: number | null; children?: FileNode[] }
export interface FileDocument { path: string; language: string | null; content: string; provenance: DataProvenance }

export interface GraphNode { id: string; label: string; kind: string; cluster: string; path: string | null }
export interface GraphEdge { source: string; target: string; kind: string }
export interface DashboardGraph { nodes: GraphNode[]; edges: GraphEdge[]; provenance: DataProvenance }

export interface DocumentRecord { id: string; path: string; symbol: string; kind: string; existing: boolean; generated: boolean; summary: string }
export interface DocsReport { coverageBefore: number; coverageAfter: number; documents: DocumentRecord[]; provenance: DataProvenance }

export type ClaimStatus = 'verified' | 'uncertain' | 'unsupported';
export interface Claim { id: string; status: ClaimStatus; text: string; symbol: string; path: string; line: number }
export interface ClaimsReport { summary: ClaimSummary; claims: Claim[]; provenance: DataProvenance }

export interface RepositoryStats {
  files: number;
  functions: number;
  classes: number;
  languages: LanguageShare[];
  documentationCoverage: number;
  symbolsByKind: { kind: string; count: number }[];
  provenance: DataProvenance;
}

export interface SearchFile { kind: 'file'; id: string; path: string; language: string | null }
export interface SearchSymbol { kind: 'symbol'; id: string; name: string; qualifiedName: string; symbolKind: string; path: string | null }
/** A section is either searchable or says why it is not. An empty list always means no records, never missing access. */
export type SearchSection<T> = { status: 'ok'; items: T[]; note?: string } | { status: 'unavailable'; reason: string };
export interface SearchIndex { files: SearchSection<SearchFile>; symbols: SearchSection<SearchSymbol> }

export interface DashboardApi {
  readonly mode: DataMode;
  getHealth(): Promise<ServiceHealth>;
  getRepositories(): Promise<Repository[]>;
  getSnapshots(repositoryId: string): Promise<SnapshotInfo[]>;
  getAnalysisStatus(scope: RepositoryScope): Promise<AnalysisStatus>;
  getNotifications(scope: RepositoryScope): Promise<ShellNotification[]>;
  getActivity(scope: RepositoryScope): Promise<ActivityEntry[]>;
  getSearchIndex(scope: RepositoryScope): Promise<SearchIndex>;
  /** The original interface from the UI specification, section 8. Demo ignores the scope because it holds one repository. */
  getOverview(scope?: RepositoryScope): Promise<Overview>;
  getFileTree(scope?: RepositoryScope): Promise<FileNode[]>;
  getFile(path: string, scope?: RepositoryScope): Promise<FileDocument>;
  getGraph(scope?: RepositoryScope): Promise<DashboardGraph>;
  getDocs(scope?: RepositoryScope): Promise<DocsReport>;
  getClaims(scope?: RepositoryScope): Promise<ClaimsReport>;
  getStats(scope?: RepositoryScope): Promise<RepositoryStats>;
}

/** Failure codes the shell distinguishes. Anything else is shown as a request error. */
export const PENDING = 'integration_pending';
export const JOB_REQUIRED = 'analysis_job_required';
export { INVALID_RESPONSE, UNREACHABLE };

export interface FailureView { kind: 'pending' | 'needs-job' | 'unreachable' | 'error'; title: string; message: string; retryable: boolean }

export function describeFailure(error: unknown): FailureView {
  if (error instanceof ApiError) {
    if (error.code === PENDING) return { kind: 'pending', title: 'Integration pending', message: error.message, retryable: false };
    if (error.code === JOB_REQUIRED) return { kind: 'needs-job', title: 'Analysis job required', message: error.message, retryable: false };
    if (error.code === UNREACHABLE) return { kind: 'unreachable', title: 'Backend unreachable', message: error.message, retryable: true };
    if (error.code === 'unauthorized') return { kind: 'error', title: 'API key required', message: 'The backend rejected this request. Add its API key in Settings.', retryable: true };
    return { kind: 'error', title: 'Request failed', message: error.message, retryable: error.status === 0 || error.status >= 500 || error.status === 409 };
  }
  return { kind: 'error', title: 'Something went wrong', message: error instanceof Error ? error.message : 'The request could not be completed.', retryable: true };
}
