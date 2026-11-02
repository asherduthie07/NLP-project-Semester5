import type { components } from './generated';

type Schemas = components['schemas'];
export type Project = Schemas['Project'];
export type SourceSnapshot = Schemas['SourceSnapshot'];
export type ImportManifest = Schemas['ImportManifest'];
export type Job = Schemas['Job'];
export type CAIR = Schemas['CAIR'];
export type PipelineIssue = Schemas['PipelineIssue'];
export type PreprocessingStatistics = Schemas['PreprocessingStatistics'];
export type Configuration = Schemas['PreprocessingConfig'];
export type StructuralAnalysis = Schemas['StructuralAnalysis'];
export type ExploratoryStatistics = Schemas['ExploratoryStatistics'];
export type DependencyGraph = Schemas['DependencyGraph'];

/** Both adapters expose their provenance. M1 contains no synthetic analysis results. */
export interface PhaseOneApi {
  readonly mode: 'real' | 'mock';
  getHealth(): Promise<{ status: string; scope?: string; schema_version?: string }>;
  getOriginal(snapshotId: string, fileId: string): Promise<string>;
  getProjects(): Promise<Project[]>;
  getSnapshots(projectId: string): Promise<SourceSnapshot[]>;
  getManifest(snapshotId: string): Promise<ImportManifest>;
  importFiles(files: File[], name: string): Promise<SourceSnapshot>;
  importZip(file: File, name: string): Promise<SourceSnapshot>;
  importGitHub(url: string, name: string): Promise<Job>;
  startPreprocessing(snapshotId: string, configuration?: Configuration): Promise<Job>;
  getJob(jobId: string): Promise<Job>;
  getResults(jobId: string): Promise<CAIR>;
  getIssues(jobId: string): Promise<PipelineIssue[]>;
  getStatistics(jobId: string): Promise<PreprocessingStatistics>;
}

/** Phase II extends the same transport seam without changing M1 or future dashboard mocks. */
export interface PhaseTwoApi extends PhaseOneApi {
  startAnalysis(snapshotId: string): Promise<Job>;
  getAnalysis(jobId: string): Promise<StructuralAnalysis>;
  getOverview(jobId: string): Promise<ExploratoryStatistics>;
  getGraph(jobId: string): Promise<DependencyGraph>;
}

/** Transport failures the shell tells apart from a server's own answer. */
export const UNREACHABLE = 'service_unreachable';
export const INVALID_RESPONSE = 'invalid_response';

export class ApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) { super(message); }
}

/** Fetch adapter for /api/v1. API keys are supplied at runtime, never bundled. */
export function createRealApi(base = '/api/v1', getKey: () => string = () => '', timeoutMs = 15000): PhaseTwoApi {
  async function send(path: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    const key = getKey(); if (key) headers.set('x-api-key', key);
    let response: Response;
    /** Only reads time out. Uploads can legitimately take longer than any fixed limit. */
    try { response = await fetch(`${base}${path}`, { ...init, headers, signal: init?.method ? undefined : AbortSignal.timeout(timeoutMs) }); }
    catch { throw new ApiError(UNREACHABLE, 'The CodeAtlas backend could not be reached. Check that it is running.', 0); }
    if (!response.ok) {
      const body: unknown = await response.clone().json().catch(() => null);
      /** A proxy answers for a stopped backend with a bare 5xx, which is not a server response. */
      if (body === null && response.status >= 500) throw new ApiError(UNREACHABLE, 'The CodeAtlas backend could not be reached. Check that it is running.', response.status);
      const detail = typeof body === 'object' && body !== null && 'error' in body ? body.error : null;
      const code = detail && typeof detail === 'object' && 'code' in detail ? String(detail.code) : 'http_error';
      const message = detail && typeof detail === 'object' && 'message' in detail ? String(detail.message) : `Request failed (${response.status})`;
      throw new ApiError(code, message, response.status);
    }
    return response;
  }
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await send(path, init);
    try { return await response.json() as T; }
    catch { throw new ApiError(INVALID_RESPONSE, 'The server answered with something other than the CodeAtlas API.', response.status); }
  }
  function json(body: unknown): RequestInit { return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
  const id = encodeURIComponent;
  return {
    mode: 'real',
    getHealth: () => request('/health'),
    getOriginal: async (snapshotId, fileId) => (await send(`/snapshots/${id(snapshotId)}/files/${id(fileId)}/original`)).text(),
    getProjects: () => request('/projects'),
    getSnapshots: projectId => request(`/projects/${id(projectId)}/snapshots`),
    getManifest: snapshotId => request(`/snapshots/${id(snapshotId)}/manifest`),
    importFiles: (files, name) => { const body = new FormData(); files.forEach(file => body.append('files', file)); return request(`/imports/files?name=${id(name)}`, { method: 'POST', body }); },
    importZip: (file, name) => { const body = new FormData(); body.append('file', file); return request(`/imports/zip?name=${id(name)}`, { method: 'POST', body }); },
    importGitHub: (url, name) => request('/imports/github', json({ url, name })),
    startPreprocessing: (snapshotId, configuration) => request(`/snapshots/${id(snapshotId)}/preprocessing`, json(configuration ? { configuration } : {})),
    getJob: jobId => request(`/jobs/${id(jobId)}`),
    getResults: jobId => request(`/jobs/${id(jobId)}/results`),
    getIssues: jobId => request(`/jobs/${id(jobId)}/issues`),
    getStatistics: jobId => request(`/jobs/${id(jobId)}/statistics`),
    startAnalysis: snapshotId => request(`/snapshots/${id(snapshotId)}/analysis`, json({})),
    getAnalysis: jobId => request(`/jobs/${id(jobId)}/analysis`),
    getOverview: jobId => request(`/jobs/${id(jobId)}/overview`),
    getGraph: jobId => request(`/jobs/${id(jobId)}/graph`),
  };
}
