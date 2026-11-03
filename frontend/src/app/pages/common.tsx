import { Link } from 'react-router-dom';
import { CircleAlert, Hourglass, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { useApi, useResource, useScope, type Resource } from '../../data/source';
import type { DashboardApi, FailureView, RepositoryScope } from '../../data/dashboard';
import type { VizModel, VizState } from '../../viz/types';

/** Shared plumbing for the dashboard pages: one resource per adapter method, honest failure display and chart state. */
export type { Resource };

export function useWorkScope() {
  const api = useApi();
  const scope = useScope();
  return `${api.mode}:${scope?.snapshotId ?? 'none'}`;
}

/** Loads one adapter method for the current scope. The key changes with mode, snapshot and job, so stale data is never shown. */
export function usePageData<T>(method: string, load: (api: DashboardApi, scope: RepositoryScope | undefined) => Promise<T>, needsScope = false): Resource<T> {
  const api = useApi();
  const scope = useScope() ?? undefined;
  const key = needsScope && !scope ? null : `${api.mode}:${method}:${scope?.snapshotId ?? ''}:${scope?.jobId ?? ''}`;
  return useResource(key, () => load(api, scope));
}

export function vizState<T>(resource: Resource<T>, build: (data: T) => VizModel | VizState): VizState {
  if (resource.status === 'loading') return { status: 'loading' };
  if (resource.status === 'failed') return failureState(resource.failure, resource.retry);
  const built = build(resource.data);
  return 'status' in built ? built : { status: 'ready', model: built };
}

export function failureState(failure: FailureView, retry: () => void): VizState {
  return failure.retryable ? { status: 'error', message: `${failure.title}. ${failure.message}`, onRetry: retry } : { status: 'unavailable', title: failure.title, message: failure.message };
}

export function FailureNote({ failure, retry, compact = false }: { failure: FailureView; retry?: () => void; compact?: boolean }) {
  const pending = failure.kind === 'pending' || failure.kind === 'needs-job';
  return <p className={`failure-note ${failure.kind} ${compact ? 'compact' : ''}`} role="status" data-failure={failure.kind}>
    {pending ? <Hourglass size={13} aria-hidden="true" /> : <CircleAlert size={13} aria-hidden="true" />}
    <span><strong>{failure.title}.</strong> {failure.message}{failure.kind === 'needs-job' && <> <Link className="text-link" to="/app/settings">Open Settings</Link></>}</span>
    {failure.retryable && retry && <button type="button" className="icon-button small" aria-label="Retry" onClick={retry}><RefreshCw size={12} /></button>}
  </p>;
}

/** Labels where a figure comes from. Demo values are always marked illustrative. */
export function SourceTag({ mode, children }: { mode: DashboardApi['mode']; children?: ReactNode }) {
  return <span className={`source-tag ${mode}`} data-testid="source-tag">{mode === 'demo' ? 'Demo, illustrative' : 'Live, measured'}{children}</span>;
}

export const formatNumber = new Intl.NumberFormat('en-US');
export const formatBytes = (bytes: number) => bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
export const formatWhen = (iso: string | null) => iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC' : null;
