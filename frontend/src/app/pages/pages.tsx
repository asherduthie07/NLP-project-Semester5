import { useId, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CircleAlert, CircleCheck, Hourglass, KeyRound, LoaderCircle, RefreshCw } from 'lucide-react';
import { Button, Kbd, Skeleton, Toggle } from '../../components/ui';
import { ScrambleText } from '../../components/fx';
import { hasApiKey, setApiKey, useApi, useDataStore, useResource, useScope } from '../../data/source';
import { ApiError } from '../../data/api';
import type { DashboardApi, DataMode, RepositoryScope } from '../../data/dashboard';
import { ModeSwitch, VisualizationContainer } from '../../viz/components/VisualizationContainer';
import { useVizStore, type LabelDensity, type MotionOverride, type QualityPreference } from '../../viz/store';
import { detectWebGL } from '../../viz/capability';
import type { VizState } from '../../viz/types';
import { ScrollPanel } from '../layout/ScrollPanel';
import { destinations, type Destination } from '../nav';
import { useShellStore } from '../store';
import { CHART_SHORTCUTS, SHORTCUTS } from '../shell/Shell';

const number = new Intl.NumberFormat('en-US');

function PageHead({ item, badge }: { item: Destination; badge: ReactNode }) {
  return <header className="page-head">
    <div className="page-eyebrow">{badge}</div>
    <h1 tabIndex={-1}><ScrambleText>{item.label}</ScrambleText></h1>
    <p>{item.summary}</p>
  </header>;
}

/** What a page's adapter call currently returns. It reports the real outcome and invents nothing for missing records. */
const readiness: Record<string, { label: string; load: (api: DashboardApi, scope: RepositoryScope | undefined) => Promise<string> }[]> = {
  overview: [
    { label: 'getOverview()', load: async (api, scope) => { const data = await api.getOverview(scope); return `${number.format(data.files)} files, ${number.format(data.functions)} functions, ${number.format(data.classes)} classes, ${data.coverageBefore}% coverage${data.coverageAfter === null ? '' : ` rising to ${data.coverageAfter}%`}`; } },
    { label: 'getStats()', load: async (api, scope) => { const data = await api.getStats(scope); return `${data.languages.length} languages, ${data.symbolsByKind.length} symbol kinds`; } },
  ],
  explorer: [
    { label: 'getFileTree()', load: async (api, scope) => { const data = await api.getFileTree(scope); return `${data.length} top-level entries`; } },
    { label: 'getSearchIndex()', load: async (api, scope) => { if (!scope) throw new ApiError('analysis_job_required', 'Select a repository first.', 0); const data = await api.getSearchIndex(scope); return `${data.files.status === 'ok' ? `${number.format(data.files.items.length)} files` : 'files unavailable'}, ${data.symbols.status === 'ok' ? `${number.format(data.symbols.items.length)} symbols` : 'symbols unavailable'}`; } },
  ],
  graph: [{ label: 'getGraph()', load: async (api, scope) => { const data = await api.getGraph(scope); return `${number.format(data.nodes.length)} nodes, ${number.format(data.edges.length)} edges`; } }],
  docs: [{ label: 'getDocs()', load: async (api, scope) => { const data = await api.getDocs(scope); return `${number.format(data.documents.length)} documentable symbols, ${data.coverageBefore}% rising to ${data.coverageAfter}%`; } }],
  intelligence: [
    { label: 'getStats()', load: async (api, scope) => { const data = await api.getStats(scope); return `${data.documentationCoverage}% documentation coverage`; } },
    { label: 'getDocs()', load: async (api, scope) => { const data = await api.getDocs(scope); return `${number.format(data.documents.length)} documentable symbols`; } },
  ],
  verification: [{ label: 'getClaims()', load: async (api, scope) => { const { summary } = await api.getClaims(scope); return `${number.format(summary.total)} claims: ${number.format(summary.verified)} verified, ${number.format(summary.uncertain)} uncertain, ${number.format(summary.unsupported)} unsupported`; } }],
  exports: [],
};

function ReadinessRow({ label, load }: { label: string; load: () => Promise<string> }) {
  const api = useApi();
  const scope = useScope();
  const result = useResource(`${api.mode}:${label}:${scope?.snapshotId ?? ''}:${scope?.jobId ?? ''}`, load);
  return <li className="readiness-row" data-testid={`readiness-${label}`} data-state={result.status === 'failed' ? result.failure.kind : result.status}>
    <code>{label}</code>
    {result.status === 'loading' && <Skeleton width="60%" label={`Loading ${label}`} />}
    {result.status === 'ready' && <span className="readiness-ok"><CircleCheck size={13} aria-hidden="true" /><span>{result.data}<em className={api.mode === 'demo' ? 'amber' : 'mint'}>{api.mode === 'demo' ? ' Illustrative' : ' From the backend'}</em></span></span>}
    {result.status === 'failed' && <span className={`readiness-failed ${result.failure.kind}`}>{result.failure.kind === 'pending' || result.failure.kind === 'needs-job' ? <Hourglass size={13} aria-hidden="true" /> : <CircleAlert size={13} aria-hidden="true" />}<span><strong>{result.failure.title}.</strong> {result.failure.message}{result.failure.kind === 'needs-job' && <> <Link className="text-link" to="/app/settings">Open Settings</Link></>}</span>{result.failure.retryable && <button type="button" className="icon-button small" aria-label={`Retry ${label}`} onClick={result.retry}><RefreshCw size={12} /></button>}</span>}
  </li>;
}

/** The chart proves the shared system works inside the shell. Its data comes only from the current adapter. */
function ClaimsChart() {
  const api = useApi();
  const scope = useScope();
  const overview = useResource(`${api.mode}:${scope?.snapshotId ?? ''}:${scope?.jobId ?? ''}`, () => api.getOverview(scope ?? undefined));
  const state = useMemo<VizState>(() => {
    if (overview.status === 'loading') return { status: 'loading' };
    if (overview.status === 'failed') {
      const { failure } = overview;
      return failure.retryable ? { status: 'error', message: failure.message, onRetry: overview.retry } : { status: 'unavailable', title: failure.title, message: failure.message };
    }
    const { claims, provenance } = overview.data;
    if (!claims) return { status: 'unavailable', title: 'Claims integration pending', message: 'This backend does not extract claims yet, so there is no chart to draw.' };
    return { status: 'ready', model: { kind: 'donut', id: 'shell-claims', title: 'Claim status', description: 'From the current data source.', provenance, segments: [{ id: 'verified', label: 'Verified', value: claims.verified, color: '--mint' }, { id: 'uncertain', label: 'Uncertain', value: claims.uncertain, color: '--amber' }, { id: 'unsupported', label: 'Unsupported', value: claims.unsupported, color: '--coral' }] } };
  }, [overview]);
  return <div className="panel-chart" data-testid="shell-chart" data-loading={overview.status === 'loading' || undefined}><VisualizationContainer id="shell-claims" state={state} title="Claim status" height={240} /></div>;
}

export function ActivityLog() {
  const api = useApi();
  const scope = useScope();
  const activity = useResource(scope ? `${api.mode}:${scope.snapshotId}:${scope.jobId ?? ''}` : null, () => api.getActivity(scope!));
  return <ScrollPanel title="Activity" eyebrow={api.mode === 'demo' ? 'Illustrative log' : 'Job issues'} autoScroll testId="activity-panel">
    {!scope && <p className="panel-note" role="status">No repository is selected.</p>}
    {scope && activity.status === 'loading' && <Skeleton label="Loading activity" />}
    {scope && activity.status === 'failed' && <p className="panel-note" role="status"><strong>{activity.failure.title}.</strong> {activity.failure.message}</p>}
    {scope && activity.status === 'ready' && !activity.data.length && <p className="panel-note" role="status">This job recorded no issues.</p>}
    {scope && activity.status === 'ready' && <ol className="activity-log terminal-text">{activity.data.map(entry => <li key={entry.id} data-level={entry.level}><time>{entry.at}</time><span>{entry.message}</span></li>)}</ol>}
  </ScrollPanel>;
}

export function PendingPage({ item }: { item: Destination }) {
  const [params] = useSearchParams();
  const api = useApi();
  const scope = useScope() ?? undefined;
  const requested = params.get('path') ?? params.get('symbol');
  const checks = readiness[item.id] ?? [];
  return <div className="page-frame" data-testid="pending-page" data-page={item.id}>
    <PageHead item={item} badge={<span className="pending-badge" data-testid="pending-badge"><Hourglass size={12} aria-hidden="true" />Page pending, milestone {item.milestone}</span>} />
    {requested && <p className="page-notice" role="status" data-testid="requested-target"><strong>{requested}</strong> was found, but this page cannot open it until {item.milestone}.</p>}
    <div className={`panel-grid ${item.id === 'overview' ? 'three' : 'two'}`}>
      <ScrollPanel title="Planned for this page" eyebrow="Not built yet" testId="planned-panel">
        <ul className="planned-list">{item.planned.map(line => <li key={line}>{line}</li>)}</ul>
      </ScrollPanel>
      <ScrollPanel title="Data readiness" eyebrow={api.mode === 'demo' ? 'Demo adapter' : 'Live adapter'} testId="readiness-panel">
        {checks.length
          ? <ul className="readiness-list">{checks.map(check => <ReadinessRow key={check.label} label={check.label} load={() => check.load(api, scope)} />)}</ul>
          : <p className="panel-note" role="status" data-testid="no-export-endpoint">Neither data source has an export service yet. Individual charts already export PNG, CSV and JSON from their own toolbars.</p>}
      </ScrollPanel>
      {item.id === 'overview' && <div className="panel-stack">
        <ClaimsChart />
        <ActivityLog />
      </div>}
    </div>
  </div>;
}

function Segmented<T extends string>({ label, value, options, onChange, testId }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; testId?: string }) {
  const id = useId();
  return <div className="setting-row"><span id={id}>{label}</span><div className="segmented" role="radiogroup" aria-labelledby={id} data-testid={testId}>
    {options.map((option, index) => <button key={option.value} type="button" role="radio" aria-checked={value === option.value} tabIndex={value === option.value ? 0 : -1} onClick={() => onChange(option.value)} onKeyDown={event => {
      const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      const next = options[(index + step + options.length) % options.length];
      onChange(next.value);
      (event.currentTarget.parentElement?.children[(index + step + options.length) % options.length] as HTMLElement | undefined)?.focus();
    }}>{option.label}</button>)}
  </div></div>;
}

function ConnectionCheck() {
  const api = useApi();
  const [attempt, setAttempt] = useState(0);
  const health = useResource(`${api.mode}:${attempt}`, () => api.getHealth());
  return <div className="connection" data-testid="connection" data-state={health.status === 'failed' ? health.failure.kind : health.status}>
    {health.status === 'loading' && <span role="status"><LoaderCircle size={13} className="spin" aria-hidden="true" />Checking connection</span>}
    {health.status === 'ready' && <span role="status" className={api.mode === 'demo' ? 'amber' : 'mint'}><CircleCheck size={13} aria-hidden="true" />{api.mode === 'demo' ? 'Demo fixture. No backend is involved.' : `Backend reachable. Scope ${health.data.scope}, schema ${health.data.schemaVersion}.`}</span>}
    {health.status === 'failed' && <span role="alert" className="coral"><CircleAlert size={13} aria-hidden="true" /><span><strong>{health.failure.title}.</strong> {health.failure.message} Demo data is not used in its place.</span></span>}
    <Button variant="ghost" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={12} />Check again</Button>
  </div>;
}

export function SettingsPage({ item }: { item: Destination }) {
  const mode = useDataStore(state => state.mode);
  const setMode = useDataStore(state => state.setMode);
  const snapshotId = useDataStore(state => state.snapshotId);
  const jobId = useDataStore(state => snapshotId ? state.jobIds[snapshotId] ?? '' : '');
  const setJobId = useDataStore(state => state.setJobId);
  const [keySaved, setKeySaved] = useState(hasApiKey());
  const viz = useVizStore();
  const pinned = useShellStore(state => state.pinned);
  const setPinned = useShellStore(state => state.setPinned);
  const singleKey = useShellStore(state => state.singleKeyShortcuts);
  const setSingleKey = useShellStore(state => state.setSingleKeyShortcuts);
  const capability = detectWebGL();
  return <div className="page-frame" data-testid="settings-page">
    <PageHead item={item} badge={<span className="page-eyebrow-text">Saved in this browser</span>} />
    <div className="panel-grid three">
      <ScrollPanel title="Data source" eyebrow="Demo or Live" testId="settings-data">
        <Segmented<DataMode> label="Source" value={mode} testId="settings-data-mode" onChange={setMode} options={[{ value: 'demo', label: 'Demo data' }, { value: 'live', label: 'Live backend' }]} />
        <p className="panel-note">{mode === 'demo' ? 'Everything shown comes from the seeded shopflow-api fixture. It is illustrative and not an analysis result.' : 'Everything shown comes from the CodeAtlas API. If it is unreachable, pages say so and show nothing else.'}</p>
        <ConnectionCheck />
        {mode === 'live' && <>
          <label className="field"><span><KeyRound size={12} aria-hidden="true" />API key, kept in memory for this tab only</span><input type="password" autoComplete="off" placeholder={keySaved ? 'Key set for this session' : 'Not needed on loopback'} data-testid="api-key" onChange={event => { setApiKey(event.target.value); setKeySaved(event.target.value.length > 0); }} /></label>
          <label className="field"><span>Analysis job ID for this snapshot</span><input type="text" spellCheck={false} value={jobId} disabled={!snapshotId} placeholder={snapshotId ? 'From the analysis request' : 'Select a repository first'} data-testid="job-id" onChange={event => { if (snapshotId) setJobId(snapshotId, event.target.value); }} /></label>
          <p className="panel-note">The API cannot list jobs for a snapshot, so overview, graph and symbol data need this ID.</p>
        </>}
      </ScrollPanel>
      <ScrollPanel title="Visualization" eyebrow="All charts" testId="settings-viz">
        <div className="setting-row"><span>Mode</span><ModeSwitch compact /></div>
        <p className="panel-note">WebGL: {capability.tier === 'none' ? capability.reason : `${capability.tier} tier${capability.renderer ? `, ${capability.renderer}` : ''}`}.</p>
        <Segmented<QualityPreference> label="3D quality" value={viz.quality} onChange={value => viz.setPreference('quality', value)} options={[{ value: 'auto', label: 'Auto' }, { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }]} />
        <Segmented<LabelDensity> label="Labels" value={viz.labels} onChange={value => viz.setPreference('labels', value)} options={[{ value: 'none', label: 'None' }, { value: 'key', label: 'Key' }, { value: 'all', label: 'All' }]} />
        <Segmented<MotionOverride> label="Motion" value={viz.motion} testId="settings-motion" onChange={value => viz.setPreference('motion', value)} options={[{ value: 'system', label: 'System' }, { value: 'reduce', label: 'Reduce' }, { value: 'full', label: 'Full' }]} />
        <Toggle label="Idle chart animation" checked={viz.chartAnimation} onChange={value => viz.setPreference('chartAnimation', value)} />
      </ScrollPanel>
      <ScrollPanel title="Navigation" eyebrow="Shell" testId="settings-nav">
        <Toggle label="Keep the sidebar pinned open" checked={pinned} onChange={setPinned} />
        <Toggle label="Single-key shortcuts" checked={singleKey} onChange={setSingleKey} />
        <p className="panel-note">Turn these off if they clash with speech input or other assistive tools. <Kbd>Ctrl</Kbd> <Kbd>K</Kbd> always works.</p>
        <p className="panel-note"><Link className="text-link" to="/design-system">Open the design system</Link></p>
      </ScrollPanel>
    </div>
  </div>;
}

export function HelpPage({ item }: { item: Destination }) {
  return <div className="page-frame" data-testid="help-page">
    <PageHead item={item} badge={<span className="page-eyebrow-text">Dashboard shell, milestone M2</span>} />
    <div className="panel-grid three">
      <ScrollPanel title="What is built" eyebrow="Status">
        <ul className="status-list">{destinations.map(entry => <li key={entry.id}><Link className="text-link" to={entry.path}>{entry.label}</Link><span className={entry.milestone ? 'amber' : 'mint'}>{entry.milestone ? `Pending, ${entry.milestone}` : 'Available'}</span></li>)}</ul>
      </ScrollPanel>
      <ScrollPanel title="Data modes" eyebrow="Demo and Live">
        <p className="panel-note"><strong>Demo data</strong> is a seeded fixture for an illustrative repository named shopflow-api. No analysis ran on it, and its numbers are not results.</p>
        <p className="panel-note"><strong>Live backend</strong> shows what the CodeAtlas API returns. Files and snapshots come from imports, and symbols and statistics from a completed Phase II analysis job. Documentation, claims and notifications have no endpoint yet, so they read as pending.</p>
        <p className="panel-note">The app never switches between the two on its own. If the backend fails, it shows the failure.</p>
      </ScrollPanel>
      <ScrollPanel title="Keyboard shortcuts" eyebrow="Press ? anywhere">
        <dl className="shortcut-table">{SHORTCUTS.map(entry => <div key={entry.label}><dt>{entry.label}</dt><dd>{entry.keys.map(key => <Kbd key={key}>{key}</Kbd>)}</dd></div>)}</dl>
        <h3 className="panel-subhead">In a focused chart</h3>
        <dl className="shortcut-table">{CHART_SHORTCUTS.map(entry => <div key={entry.label}><dt>{entry.label}</dt><dd>{entry.keys.map(key => <Kbd key={key}>{key}</Kbd>)}</dd></div>)}</dl>
      </ScrollPanel>
    </div>
  </div>;
}

