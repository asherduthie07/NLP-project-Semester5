import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { describeFailure, type DashboardApi, type DataMode, type FailureView, type RepositoryScope } from './dashboard';
import { createDemoApi } from './demoApi';
import { createLiveApi } from './liveApi';

/** VITE_DATA_MODE sets the default for a deployment, VITE_API_BASE points Live at another origin. Neither is a secret. */
export function dataConfig(env: Pick<ImportMetaEnv, 'VITE_DATA_MODE' | 'VITE_API_BASE'> = import.meta.env) {
  return { defaultMode: (env.VITE_DATA_MODE === 'live' ? 'live' : 'demo') as DataMode, apiBase: (env.VITE_API_BASE ?? '').replace(/\/+$/, '') };
}

interface DataStore {
  mode: DataMode;
  repositoryId: string | null;
  snapshotId: string | null;
  /** Analysis job per snapshot, entered by the user because the API has no way to list them. */
  jobIds: Record<string, string>;
  setMode: (mode: DataMode) => void;
  selectRepository: (repositoryId: string | null, snapshotId: string | null) => void;
  selectSnapshot: (snapshotId: string | null) => void;
  setJobId: (snapshotId: string, jobId: string) => void;
}

/** Selection never crosses modes: changing mode clears it, so a demo ID can never reach the backend or the reverse. */
export const useDataStore = create<DataStore>()(persist(set => ({
  mode: dataConfig().defaultMode,
  repositoryId: null,
  snapshotId: null,
  jobIds: {},
  setMode: mode => set(state => state.mode === mode ? state : { mode, repositoryId: null, snapshotId: null }),
  selectRepository: (repositoryId, snapshotId) => set({ repositoryId, snapshotId }),
  selectSnapshot: snapshotId => set({ snapshotId }),
  setJobId: (snapshotId, jobId) => set(state => {
    const jobIds = { ...state.jobIds };
    if (jobId.trim()) jobIds[snapshotId] = jobId.trim(); else delete jobIds[snapshotId];
    return { jobIds };
  }),
}), { name: 'codeatlas.data.v1', storage: createJSONStorage(() => localStorage) }));

/** Held in memory for the session only, and never written to storage or bundled. */
let apiKey = '';
export const setApiKey = (key: string) => { apiKey = key; };
export const hasApiKey = () => apiKey.length > 0;

const adapters = new Map<DataMode, DashboardApi>();
export function getApi(mode: DataMode): DashboardApi {
  let api = adapters.get(mode);
  if (!api) {
    api = mode === 'demo' ? createDemoApi() : createLiveApi({ baseUrl: dataConfig().apiBase, getKey: () => apiKey });
    adapters.set(mode, api);
  }
  return api;
}

export function useApi(): DashboardApi { return getApi(useDataStore(state => state.mode)); }

export function useScope(): RepositoryScope | null {
  const repositoryId = useDataStore(state => state.repositoryId);
  const snapshotId = useDataStore(state => state.snapshotId);
  const jobId = useDataStore(state => snapshotId ? state.jobIds[snapshotId] ?? null : null);
  return useMemo(() => repositoryId && snapshotId ? { repositoryId, snapshotId, jobId } : null, [repositoryId, snapshotId, jobId]);
}

export type Resource<T> =
  | { status: 'loading'; data: null; failure: null; retry: () => void }
  | { status: 'ready'; data: T; failure: null; retry: () => void }
  | { status: 'failed'; data: null; failure: FailureView; retry: () => void };

/**
 * Loads one async value with loading, failure and retry. A response for an older key is dropped,
 * and a failure clears the previous value, so old or demo data is never left on screen.
 */
export function useResource<T>(key: string | null, load: () => Promise<T>, refreshMs?: number): Resource<T> {
  const [state, setState] = useState<{ key: string | null; status: 'loading' | 'ready' | 'failed'; data: T | null; failure: FailureView | null }>({ key, status: 'loading', data: null, failure: null });
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(load);
  latest.current = load;
  const retry = useCallback(() => { setState(previous => ({ ...previous, status: 'loading' })); setAttempt(value => value + 1); }, []);
  useEffect(() => {
    if (key === null) return;
    let live = true;
    latest.current().then(
      data => { if (live) setState({ key, status: 'ready', data, failure: null }); },
      (error: unknown) => { if (live) setState({ key, status: 'failed', data: null, failure: describeFailure(error) }); },
    );
    return () => { live = false; };
  }, [key, attempt]);
  useEffect(() => {
    if (!refreshMs || key === null) return;
    const timer = window.setInterval(() => { if (!document.hidden) setAttempt(value => value + 1); }, refreshMs);
    return () => window.clearInterval(timer);
  }, [key, refreshMs]);
  if (state.key !== key || state.status === 'loading') return { status: 'loading', data: null, failure: null, retry };
  if (state.status === 'failed') return { status: 'failed', data: null, failure: state.failure!, retry };
  return { status: 'ready', data: state.data as T, failure: null, retry };
}
