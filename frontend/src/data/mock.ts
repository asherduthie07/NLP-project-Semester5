import { ApiError, type PhaseTwoApi } from './api';

/** Empty development adapter. Never fabricates imports, processing, or model output. */
export function createMockApi(): PhaseTwoApi {
  async function unavailable(): Promise<never> { throw new ApiError('mock_only', 'Use the real adapter for source analysis.', 501); }
  return {
    mode: 'mock', getProjects: async () => [], getSnapshots: async () => [],
    getManifest: unavailable, importFiles: unavailable, importZip: unavailable,
    importGitHub: unavailable, startPreprocessing: unavailable, getJob: unavailable,
    getResults: unavailable, getIssues: unavailable, getStatistics: unavailable,
    startAnalysis: unavailable, getAnalysis: unavailable, getOverview: unavailable, getGraph: unavailable,
  };
}

/** The original shopflow-api dashboard fixtures are deferred to M3. */
export const designSystemDemo = { mode: 'mock', illustrative: true, counter: 1386, progress: 76 } as const;
