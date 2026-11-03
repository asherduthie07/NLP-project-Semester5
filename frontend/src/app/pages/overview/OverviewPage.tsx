import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDownRight, ArrowRight, ArrowUpRight, ArrowUpDown, CircleDashed, CircleCheck, FilterX, GitFork, Hourglass, LoaderCircle, Orbit, Unlink } from 'lucide-react';
import { motion } from 'framer-motion';
import { ProgressRing, Skeleton } from '../../../components/ui';
import { CountUp, ScrambleText, SpotlightCard } from '../../../components/fx';
import { ApiError } from '../../../data/api';
import { JOB_REQUIRED, type ClaimSummary, type CoveragePoint, type FailureView, type Overview, type RepositoryAnalysis } from '../../../data/dashboard';
import { useApi, useScope } from '../../../data/source';
import { VisualizationContainer } from '../../../viz/components/VisualizationContainer';
import { useReducedMotion } from '../../../viz/store';
import type { ColorToken, VizState } from '../../../viz/types';
import { ScrollPanel } from '../../layout/ScrollPanel';
import type { Destination } from '../../nav';
import { ActivityLog } from '../pages';
import { FailureNote, formatNumber, formatWhen, SourceTag, usePageData, useWorkScope, vizState, type Resource } from '../common';
import { architectureMap, completeness, coverageChart, delta, dependencyStats, gapHeatmap, groupOf, languageDonut, moduleRows, moduleTreemap, toViz, type CoverageSeries, type ModuleRow } from '../derive';
import { useReviews, useWorkStore } from '../workStore';
import './overview.css';

interface Filter { group: string | null; language: string | null }

function filterAnalysis(analysis: RepositoryAnalysis, filter: Filter, ignore: (keyof Filter)[] = []): RepositoryAnalysis {
  const group = ignore.includes('group') ? null : filter.group, language = ignore.includes('language') ? null : filter.language;
  if (!group && !language) return analysis;
  const files = analysis.files.filter(file => (!group || groupOf(file.path) === group || file.path.startsWith(`${group}/`)) && (!language || file.language === language));
  const paths = new Set(files.map(file => file.path));
  return { ...analysis, files, symbols: analysis.symbols.filter(symbol => paths.has(symbol.path)), relations: analysis.relations.filter(relation => paths.has(relation.path)) };
}

const pct = (part: number, whole: number) => whole ? Math.round(part / whole * 1000) / 10 : 0;

export function OverviewPage({ item }: { item: Destination }) {
  const api = useApi();
  const overview = usePageData('getOverview', (adapter, scope) => adapter.getOverview(scope));
  const analysis = usePageData('getAnalysis', (adapter, scope) => adapter.getAnalysis(scope));
  const history = usePageData('getCoverageHistory', (adapter, scope) => adapter.getCoverageHistory(scope));
  const status = usePageData('getAnalysisStatus', (adapter, scope) => scope ? adapter.getAnalysisStatus(scope) : Promise.reject(new ApiError(JOB_REQUIRED, 'Select a repository first.', 0)));
  const [filter, setFilter] = useState<Filter>({ group: null, language: null });
  const toggle = (key: keyof Filter, value: string) => setFilter(current => ({ ...current, [key]: current[key] === value ? null : value }));
  const workScope = useWorkScope();
  const reviews = useReviews(workScope);
  const exports = useWorkStore(state => state.exports);
  const claims = overview.status === 'ready' ? overview.data.claims : null;
  /** Chart models are derived once per record and filter, never on unrelated renders. */
  const charts = useMemo(() => ({
    heatmap: vizState(analysis, data => gapHeatmap(filterAnalysis(data, filter, ['group']), toViz(data.provenance, data.snapshotId))),
    languages: vizState(analysis, data => languageDonut(filterAnalysis(data, filter, ['language']), toViz(data.provenance, data.snapshotId))),
    architecture: vizState(analysis, data => architectureMap(filterAnalysis(data, filter, ['group']), toViz(data.provenance, data.snapshotId))),
  }), [analysis, filter]);

  return <div className="page-frame page-scroll overview" data-testid="overview-page" data-page="overview">
    <header className="ov-hud" data-testid="overview-hud">
      <div className="ov-hud-title">
        <span className="ov-hud-label">Repository overview</span>
        <h1 tabIndex={-1}><span className="sr-only">{item.label}, </span><ScrambleText>{overview.status === 'ready' ? overview.data.repository : 'Repository'}</ScrambleText></h1>
      </div>
      <dl className="ov-hud-meta">
        <div><dt>Snapshot</dt><dd className="mono">{analysis.status === 'ready' ? analysis.data.snapshotId.slice(0, 18) : '…'}</dd></div>
        <div><dt>Analysis</dt><dd>{status.status === 'ready' ? <span className={`ov-state ${status.data.state}`}><i />{status.data.label}</span> : status.status === 'failed' ? <span className="amber">{status.failure.title}</span> : '…'}</dd></div>
        <div><dt>Analyzed</dt><dd>{analysis.status === 'ready' ? formatWhen(analysis.data.analyzedAt) ?? 'Not recorded by the API' : '…'}</dd></div>
        <div><dt>Source</dt><dd><SourceTag mode={api.mode} /></dd></div>
      </dl>
      {(filter.group || filter.language) && <div className="ov-filters" role="group" aria-label="Active filters" data-testid="overview-filters">
        {filter.group && <button type="button" className="ov-filter-chip" onClick={() => toggle('group', filter.group!)}>Module {filter.group}<FilterX size={12} aria-hidden="true" /><span className="sr-only">, remove filter</span></button>}
        {filter.language && <button type="button" className="ov-filter-chip" onClick={() => toggle('language', filter.language!)}>Language {filter.language}<FilterX size={12} aria-hidden="true" /><span className="sr-only">, remove filter</span></button>}
        <button type="button" className="text-link" onClick={() => setFilter({ group: null, language: null })}>Clear all</button>
      </div>}
    </header>

    <KpiRow overview={overview} analysis={analysis} history={history} />

    <div className="ov-grid">
      <CoveragePanel history={history} overview={overview} />
      <CompletenessPanel overview={overview} analysis={analysis} history={history} reviewed={Object.keys(reviews).length} published={exports.some(record => record.scope === workScope && record.status === 'complete' && record.format !== 'csv-modules' && record.format !== 'json-report')} />
      <AttentionTable analysis={analysis} filter={filter} />
      <div className="ov-cell ov-heatmap"><VisualizationContainer id="overview-gaps" title="Documentation gaps" height={300} state={charts.heatmap} onDatumActivate={id => { const model = charts.heatmap.status === 'ready' ? charts.heatmap.model : null; const label = model?.kind === 'heatmap' ? model.yLabels[Number(id.split('|')[1])] : undefined; if (label) toggle('group', label); }} /></div>
      <div className="ov-cell ov-donut"><VisualizationContainer id="overview-languages" title="Language distribution" height={240} state={charts.languages} onDatumActivate={id => toggle('language', id)} /></div>
      <div className="ov-cell ov-treemap"><TreemapCell analysis={analysis} filter={filter} /></div>
      <DependencyCards analysis={analysis} filter={filter} />
      <div className="ov-cell ov-arch"><VisualizationContainer id="overview-architecture" title="Architecture map" height={260} state={charts.architecture} onDatumActivate={id => toggle('group', id)} /></div>
      <div className="ov-cell ov-activity"><ActivityLog /></div>
      <TerminalLog analysis={analysis} overview={overview} />
    </div>

    <PipelineStrip analysis={analysis} claims={claims} overviewStatus={overview.status} history={history} />
  </div>;
}

/* KPI row */

interface Kpi { id: string; label: string; value: number | null; suffix?: string; sub: ReactNode; spark: number[] | null; color: ColorToken; pending?: FailureView | string }

function KpiRow({ overview, analysis, history }: { overview: Resource<Overview>; analysis: Resource<RepositoryAnalysis>; history: Resource<CoveragePoint[]> }) {
  const api = useApi();
  const window30 = history.status === 'ready' ? history.data.slice(-30) : null;
  const series = (pick: (point: CoveragePoint) => number) => window30 ? window30.map(pick) : null;
  if (overview.status === 'loading') return <section className="ov-kpis" aria-label="Key figures" aria-busy="true" data-testid="overview-kpis"><h2 className="sr-only">Key figures</h2>{Array.from({ length: 6 }, (_, index) => <div key={index} className="card spotlight ov-kpi"><Skeleton width="50%" label="Loading figure" /><Skeleton width="80%" label="Loading figure" /></div>)}</section>;
  if (overview.status === 'failed') return <section className="ov-kpis failed" aria-label="Key figures" data-testid="overview-kpis"><h2 className="sr-only">Key figures</h2><FailureNote failure={overview.failure} retry={overview.retry} /></section>;
  const data = overview.data;
  const claimsPending = 'Claim verification has no endpoint in the current backend. It arrives with Phase IV.';
  const coverageNow = data.coverageAfter ?? data.coverageBefore;
  const kpis: Kpi[] = [
    { id: 'files', label: 'Files analyzed', value: analysis.status === 'ready' ? analysis.data.statistics.files : data.files, sub: analysis.status === 'ready' ? `${formatNumber.format(analysis.data.files.length)} in the snapshot` : 'In the snapshot', spark: series(point => point.files), color: '--blue' },
    { id: 'functions', label: 'Functions', value: data.functions, sub: 'Functions, methods and constructors', spark: series(point => point.functions), color: '--cyan' },
    { id: 'classes', label: 'Classes', value: data.classes, sub: 'Classes, interfaces, enums and records', spark: series(point => point.classes), color: '--violet' },
    { id: 'coverage', label: 'Doc coverage', value: coverageNow, suffix: '%', sub: data.coverageAfter === null ? 'Existing documentation only' : `${data.coverageBefore}% existing, ${data.coverageAfter}% with generated`, spark: series(point => point.existing + point.generated), color: '--mint' },
    { id: 'verified', label: 'Verified claims', value: data.claims?.verified ?? null, sub: data.claims ? `${pct(data.claims.verified, data.claims.total)}% of ${formatNumber.format(data.claims.total)} claims` : '', spark: series(point => point.verified), color: '--mint', pending: data.claims ? undefined : claimsPending },
    { id: 'review', label: 'Needs review', value: data.claims ? data.claims.uncertain + data.claims.unsupported : null, sub: data.claims ? `${formatNumber.format(data.claims.uncertain)} uncertain, ${formatNumber.format(data.claims.unsupported)} unsupported` : '', spark: series(point => point.needsReview), color: '--amber', pending: data.claims ? undefined : claimsPending },
  ];
  return <section className="ov-kpis" aria-label="Key figures" data-testid="overview-kpis">
    <h2 className="sr-only">Key figures</h2>
    {kpis.map((kpi, index) => <KpiCard key={kpi.id} kpi={kpi} index={index} historyNote={history.status === 'failed' ? history.failure.message : null} mode={api.mode} />)}
  </section>;
}

function KpiCard({ kpi, index, historyNote, mode }: { kpi: Kpi; index: number; historyNote: string | null; mode: 'demo' | 'live' }) {
  const reduced = useReducedMotion();
  const change = kpi.spark ? delta(kpi.spark) : null;
  const sparkState: VizState | null = kpi.spark ? { status: 'ready', model: { kind: 'sparkline', id: `kpi-${kpi.id}`, title: `${kpi.label}, last 30 days`, provenance: { kind: mode === 'demo' ? 'demo' : 'measured', source: mode === 'demo' ? 'Illustrative demo history.' : 'Backend history.' }, values: kpi.spark, color: kpi.color } } : null;
  return <motion.div initial={reduced ? false : { opacity: 0, y: 16, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ delay: index * .06, duration: .5 }}>
    <SpotlightCard className="ov-kpi" data-testid={`kpi-${kpi.id}`} data-pending={kpi.pending ? true : undefined}>
      <span className="ov-kpi-label">{kpi.label}</span>
      {kpi.pending
        ? <><strong className="ov-kpi-value pending"><Hourglass size={16} aria-hidden="true" />Pending</strong><span className="ov-kpi-sub">{typeof kpi.pending === 'string' ? kpi.pending : kpi.pending.message}</span></>
        : <>
          <strong className="ov-kpi-value">{kpi.value === null ? '—' : <><CountUp value={kpi.value} />{kpi.suffix}</>}</strong>
          <span className="ov-kpi-sub">{kpi.sub}</span>
          <span className={`ov-kpi-delta ${change === null ? 'none' : change > 0 ? 'up' : change < 0 ? 'down' : 'flat'}`} data-testid={`kpi-delta-${kpi.id}`}>
            {change === null ? kpi.spark ? 'No baseline 30 days ago' : 'No history' : <>{change > 0 ? <ArrowUpRight size={12} aria-hidden="true" /> : change < 0 ? <ArrowDownRight size={12} aria-hidden="true" /> : null}{change > 0 ? '+' : ''}{change}% in 30 days</>}
          </span>
        </>}
      <div className="ov-kpi-spark">{sparkState ? <VisualizationContainer id={`kpi-${kpi.id}`} compact height={40} state={sparkState} /> : !kpi.pending && <span className="ov-kpi-nohistory" title={historyNote ?? undefined}>No history in this source</span>}</div>
    </SpotlightCard>
  </motion.div>;
}

/* Coverage over time */

const RANGES = [{ days: 7, label: '7d' }, { days: 30, label: '30d' }, { days: 90, label: '90d' }];
const SERIES: { id: CoverageSeries; label: string }[] = [{ id: 'both', label: 'Both' }, { id: 'existing', label: 'Existing' }, { id: 'generated', label: 'Generated' }];

function Pills<T extends string | number>({ label, value, options, onChange, testId }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (value: T) => void; testId: string }) {
  return <div className="ov-pills" role="radiogroup" aria-label={label} data-testid={testId}>
    {options.map(option => <button key={option.id} type="button" role="radio" aria-checked={value === option.id} onClick={() => onChange(option.id)}>
      {value === option.id && <motion.span layoutId={`${testId}-pill`} className="ov-pill-plate" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
      <span>{option.label}</span>
    </button>)}
  </div>;
}

function CoveragePanel({ history, overview }: { history: Resource<CoveragePoint[]>; overview: Resource<Overview> }) {
  const [days, setDays] = useState(30);
  const [series, setSeries] = useState<CoverageSeries>('both');
  const api = useApi();
  const state = useMemo<VizState>(() => history.status === 'failed' && history.failure.kind === 'pending'
    ? { status: 'unavailable', title: 'No coverage history in this source', message: `${history.failure.message}${overview.status === 'ready' ? ` The current measured coverage is ${overview.data.coverageBefore}%.` : ''}` }
    : vizState(history, data => coverageChart(data, days, series, { kind: api.mode === 'demo' ? 'demo' : 'measured', source: api.mode === 'demo' ? 'Illustrative demo history ending at the fixture figures.' : 'Backend history.' })), [history, overview, days, series, api.mode]);
  return <div className="ov-cell ov-coverage">
    <div className="ov-chart-controls">
      <Pills label="Time range" value={days} options={RANGES.map(range => ({ id: range.days, label: range.label }))} onChange={setDays} testId="coverage-range" />
      <Pills label="Series" value={series} options={SERIES} onChange={setSeries} testId="coverage-series" />
    </div>
    <VisualizationContainer id="overview-coverage" title="Documentation coverage over time" featured height={290} state={state} selectionGroup="overview-time" />
  </div>;
}

/* Completeness */

function CompletenessPanel({ overview, analysis, history, reviewed, published }: { overview: Resource<Overview>; analysis: Resource<RepositoryAnalysis>; history: Resource<CoveragePoint[]>; reviewed: number; published: boolean }) {
  const ready = overview.status === 'ready' && analysis.status === 'ready';
  const result = useMemo(() => {
    if (overview.status !== 'ready' || analysis.status !== 'ready') return null;
    const { claims, coverageAfter } = overview.data, stats = analysis.data.statistics;
    return completeness({
      parsed: pct(stats.files, analysis.data.files.length),
      summarized: coverageAfter,
      verified: claims ? pct(claims.verified, claims.total) : null,
      reviewed: claims ? pct(reviewed, claims.total) : null,
      published: claims ? (published ? coverageAfter ?? overview.data.coverageBefore : 0) : null,
    }, toViz(analysis.data.provenance));
  }, [overview, analysis, reviewed, published]);
  const estimate = useMemo(() => {
    if (history.status === 'failed') return 'Not estimated. This source keeps no history.';
    if (history.status !== 'ready') return null;
    const recent = history.data.slice(-7).map(point => point.existing + point.generated);
    const slope = (recent.at(-1)! - recent[0]) / Math.max(1, recent.length - 1);
    if (slope <= 0.01) return 'Not estimated. Coverage has not moved in 7 days.';
    const days = Math.ceil((100 - recent.at(-1)!) / slope);
    return `About ${days} days at the 7-day rate`;
  }, [history]);
  const blockers = useMemo(() => {
    if (analysis.status !== 'ready') return [];
    const stats = analysis.data.statistics, list: { id: string; label: string; to: string; tone: 'coral' | 'amber' }[] = [];
    const claims = overview.status === 'ready' ? overview.data.claims : null;
    if (claims?.unsupported) list.push({ id: 'unsupported', label: `${formatNumber.format(claims.unsupported)} unsupported claims`, to: '/app/verification', tone: 'coral' });
    const unresolved = (stats.relationships_by_status.unresolved ?? 0) + (stats.relationships_by_status.ambiguous ?? 0);
    if (unresolved) list.push({ id: 'unresolved', label: `${formatNumber.format(unresolved)} unresolved relationships`, to: '/app/graph', tone: 'amber' });
    const cycles = dependencyStats(analysis.data).cycles.length;
    if (cycles) list.push({ id: 'cycles', label: `${cycles} import ${cycles === 1 ? 'cycle' : 'cycles'}`, to: '/app/graph', tone: 'amber' });
    const errors = analysis.data.issues.filter(issue => issue.severity === 'error').length;
    if (errors) list.push({ id: 'issues', label: `${errors} analysis errors`, to: '/app/intelligence', tone: 'coral' });
    return list;
  }, [analysis, overview]);
  return <section className="ov-cell ov-complete card" aria-labelledby="ov-complete-title" data-testid="completeness-panel">
    <header className="ov-panel-head"><h2 id="ov-complete-title">Documentation completeness</h2>{analysis.status === 'ready' && <SourceTag mode={analysis.data.provenance.kind === 'demo' ? 'demo' : 'live'} />}</header>
    {!ready && overview.status !== 'failed' && analysis.status !== 'failed' && <div className="ov-complete-body"><Skeleton width="60%" label="Loading completeness" /><Skeleton label="Loading completeness" /></div>}
    {analysis.status === 'failed' && <FailureNote failure={analysis.failure} retry={analysis.retry} />}
    {overview.status === 'failed' && analysis.status !== 'failed' && <FailureNote failure={overview.failure} retry={overview.retry} />}
    {result && <div className="ov-complete-body">
      <div className="ov-ring" data-testid="completeness-overall">{result.overall === null ? <span className="amber">Pending</span> : <ProgressRing value={result.overall} label={`Documentation completeness ${result.overall}%`} />}<small>Mean of the stages that have data</small></div>
      <ul className="ov-stages" aria-label="Pipeline stages">
        {result.model.metrics.map(metric => <li key={metric.id} data-testid={`stage-${metric.id}`}><span>{metric.label}</span><span className="ov-bar" aria-hidden="true"><i style={{ width: `${metric.value}%`, background: `var(${metric.color})` }} /></span><b className="mono">{metric.value}%</b></li>)}
        {result.pending.map(label => <li key={label} className="pending" data-testid={`stage-${label.toLowerCase()}`}><span>{label}</span><span className="ov-bar" aria-hidden="true" /><b><Hourglass size={11} aria-hidden="true" />Phase IV</b></li>)}
      </ul>
      <dl className="ov-complete-facts">
        <div><dt>Est. completion</dt><dd data-testid="estimate">{estimate ?? '…'}</dd></div>
        <div><dt>Blockers</dt><dd>{blockers.length ? <ul className="ov-blockers">{blockers.map(blocker => <li key={blocker.id}><Link to={blocker.to} className={blocker.tone}>{blocker.label}<ArrowRight size={11} aria-hidden="true" /></Link></li>)}</ul> : <span className="mint">None found in this record</span>}</dd></div>
      </dl>
    </div>}
  </section>;
}

/* Attention table */

type SortKey = 'path' | 'functions' | 'coverage' | 'meanLength' | 'status' | 'score';
const STATUS_RANK = { critical: 0, attention: 1, healthy: 2 } as const;

function AttentionTable({ analysis, filter }: { analysis: Resource<RepositoryAnalysis>; filter: Filter }) {
  const navigate = useNavigate();
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({ key: 'score', descending: true });
  const [all, setAll] = useState(false);
  const rows = useMemo(() => analysis.status === 'ready' ? moduleRows(filterAnalysis(analysis.data, filter)).filter(row => row.documentable > 0) : [], [analysis, filter]);
  const sorted = useMemo(() => {
    const value = (row: ModuleRow): number | string => sort.key === 'status' ? STATUS_RANK[row.status] : sort.key === 'path' ? row.path : row[sort.key] ?? -1;
    return [...rows].sort((a, b) => { const x = value(a), y = value(b); const order = typeof x === 'string' ? x.localeCompare(y as string) : x - (y as number); return (sort.descending ? -order : order) || a.path.localeCompare(b.path); });
  }, [rows, sort]);
  const shown = all ? sorted : sorted.slice(0, 8);
  const when = analysis.status === 'ready' ? formatWhen(analysis.data.analyzedAt) : null;
  const header = (key: SortKey, label: string, title?: string) => <th scope="col" aria-sort={sort.key === key ? (sort.descending ? 'descending' : 'ascending') : 'none'}>
    <button type="button" title={title} onClick={() => setSort(current => ({ key, descending: current.key === key ? !current.descending : key !== 'path' }))}>{label}<ArrowUpDown size={11} aria-hidden="true" /></button>
  </th>;
  return <section className="ov-cell ov-table card" aria-labelledby="ov-table-title" data-testid="attention-table">
    <header className="ov-panel-head">
      <h2 id="ov-table-title">Top modules needing attention</h2>
      <span className="panel-eyebrow">{rows.length ? `${formatNumber.format(rows.length)} modules with symbols` : ''}</span>
    </header>
    {analysis.status === 'loading' && <div className="ov-table-skeleton">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} label="Loading modules" />)}</div>}
    {analysis.status === 'failed' && <FailureNote failure={analysis.failure} retry={analysis.retry} />}
    {analysis.status === 'ready' && <div className="ov-table-scroll" tabIndex={0} aria-label="Modules table, scrollable">
      <table>
        <thead><tr>{header('path', 'Module')}{header('functions', 'Functions')}{header('coverage', 'Coverage')}{header('meanLength', 'Complexity', 'Proxy: mean callable length in lines. Phase II does not measure cyclomatic complexity.')}<th scope="col"><span>Last analyzed</span></th>{header('status', 'Status')}<th scope="col"><span className="sr-only">Open</span></th></tr></thead>
        <tbody>
          {shown.map(row => <tr key={row.path} data-testid="attention-row" onClick={() => navigate(`/app/explorer?path=${encodeURIComponent(row.path)}`)}>
            <td><span className="ov-crumb" title={row.path}>{row.path.split('/').map((part, index, parts) => <span key={index} className={index === parts.length - 1 ? 'leaf' : ''}>{part}</span>)}</span></td>
            <td className="mono">{row.functions}</td>
            <td><span className="ov-inline-bar" aria-hidden="true"><i style={{ width: `${row.coverage ?? 0}%` }} /></span><span className="mono">{row.coverage ?? 0}%</span></td>
            <td className="mono" title="Mean callable length in lines">{row.meanLength ?? '—'}</td>
            <td className="ov-muted">{when ?? 'Not recorded'}</td>
            <td><span className={`ov-chip ${row.status}`}>{row.status === 'critical' ? 'Critical' : row.status === 'attention' ? 'Needs docs' : 'Healthy'}{row.inCycle ? ', cycle' : ''}</span></td>
            <td><Link className="ov-row-action" to={`/app/explorer?path=${encodeURIComponent(row.path)}`} aria-label={`Open ${row.path} in the explorer`} onClick={event => event.stopPropagation()}><ArrowRight size={13} /></Link></td>
          </tr>)}
        </tbody>
      </table>
    </div>}
    {analysis.status === 'ready' && sorted.length > 8 && <button type="button" className="ov-view-all" onClick={() => setAll(value => !value)} data-testid="view-all-modules">{all ? 'Show top 8' : `View all ${formatNumber.format(sorted.length)} modules`}</button>}
  </section>;
}

function TreemapCell({ analysis, filter }: { analysis: Resource<RepositoryAnalysis>; filter: Filter }) {
  const navigate = useNavigate();
  const state = useMemo(() => vizState(analysis, data => moduleTreemap(moduleRows(filterAnalysis(data, filter)), toViz(data.provenance, data.snapshotId))), [analysis, filter]);
  return <VisualizationContainer id="overview-treemap" title="Module size" height={240} state={state} onDatumActivate={(_, source) => { if (source?.path) navigate(`/app/explorer?path=${encodeURIComponent(source.path)}`); }} />;
}

function DependencyCards({ analysis, filter }: { analysis: Resource<RepositoryAnalysis>; filter: Filter }) {
  const stats = useMemo(() => analysis.status === 'ready' ? dependencyStats(filterAnalysis(analysis.data, filter)) : null, [analysis, filter]);
  return <section className="ov-cell ov-deps" aria-label="Dependency statistics" data-testid="dependency-cards">
    <div className="ov-dep card">
      <span className="ov-dep-icon"><GitFork size={14} aria-hidden="true" /></span><h3>Most imported</h3>
      {!stats ? analysis.status === 'failed' ? <FailureNote failure={analysis.failure} compact /> : <Skeleton label="Loading dependencies" /> : stats.mostImported.length ? <ol>{stats.mostImported.map(entry => <li key={entry.path}><Link className="text-link" to={`/app/explorer?path=${encodeURIComponent(entry.path)}`} title={entry.path}>{entry.path.split('/').pop()}</Link><b className="mono">{entry.count}</b></li>)}</ol> : <p className="ov-muted">No resolved imports</p>}
    </div>
    <div className="ov-dep card">
      <span className="ov-dep-icon"><Orbit size={14} aria-hidden="true" /></span><h3>Circular dependencies</h3>
      {stats ? <><strong className="mono" data-testid="cycle-count">{stats.cycles.length}</strong><p className="ov-muted">{stats.cycles.length ? `Largest spans ${Math.max(...stats.cycles.map(cycle => cycle.length))} files` : 'No import cycles'}</p></> : analysis.status === 'failed' ? null : <Skeleton label="Loading dependencies" />}
    </div>
    <div className="ov-dep card">
      <span className="ov-dep-icon"><Unlink size={14} aria-hidden="true" /></span><h3>Orphan files</h3>
      {stats ? <><strong className="mono" data-testid="orphan-count">{stats.orphans.length}</strong><p className="ov-muted" title={stats.orphans.slice(0, 6).join('\n')}>{stats.orphans.length ? 'Code files with no resolved imports in or out' : 'Every code file is connected'}</p></> : analysis.status === 'failed' ? null : <Skeleton label="Loading dependencies" />}
    </div>
  </section>;
}

/* Terminal log */

function terminalLines(analysis: RepositoryAnalysis, overview: Overview | null): { level: 'info' | 'ok' | 'warn'; text: string }[] {
  const stats = analysis.statistics, rows = moduleRows(analysis);
  const groups = new Map<string, ModuleRow[]>();
  rows.forEach(row => { if (!groups.has(row.group)) groups.set(row.group, []); groups.get(row.group)!.push(row); });
  const lines: { level: 'info' | 'ok' | 'warn'; text: string }[] = [
    { level: 'info', text: `[import] snapshot ${analysis.snapshotId}: ${analysis.files.length} files` },
    { level: 'ok', text: `[parse] resolved ${stats.files} files, ${formatNumber.format(stats.tokens)} tokens` },
    { level: 'info', text: `[symbols] ${Object.entries(stats.symbols_by_kind).map(([kind, count]) => `${count} ${kind}`).join(', ')}` },
  ];
  [...groups].sort((a, b) => a[0].localeCompare(b[0])).forEach(([group, members]) => {
    const documentable = members.reduce((sum, row) => sum + row.documentable, 0), documented = members.reduce((sum, row) => sum + row.documented, 0);
    if (documentable) lines.push({ level: documented / documentable < .3 ? 'warn' : 'info', text: `[analyze] ${group}: ${members.length} files, ${documentable} symbols, ${pct(documented, documentable)}% documented` });
  });
  Object.entries(stats.relationships_by_status).forEach(([state, count]) => lines.push({ level: state === 'unresolved' || state === 'ambiguous' ? 'warn' : 'info', text: `[relate] ${count} ${state} relationships` }));
  if (stats.circular_dependencies.length) lines.push({ level: 'warn', text: `[graph] ${stats.circular_dependencies.length} import cycles reported` });
  analysis.issues.forEach(issue => lines.push({ level: 'warn', text: `[${issue.severity}] ${issue.code}: ${issue.message}${issue.path ? ` (${issue.path}${issue.line ? `:${issue.line}` : ''})` : ''}` }));
  if (overview?.coverageAfter !== null && overview?.coverageAfter !== undefined) lines.push({ level: 'ok', text: `[summarize] coverage ${overview.coverageBefore}% -> ${overview.coverageAfter}%` });
  if (overview?.claims) lines.push({ level: overview.claims.unsupported ? 'warn' : 'ok', text: `[verify] ${overview.claims.verified} verified, ${overview.claims.uncertain} uncertain, ${overview.claims.unsupported} unsupported` });
  lines.push({ level: 'ok', text: `[done] coverage ${Math.round(stats.documentation_coverage * 1000) / 10}% existing` });
  return lines;
}

function TerminalLog({ analysis, overview }: { analysis: Resource<RepositoryAnalysis>; overview: Resource<Overview> }) {
  const reduced = useReducedMotion();
  const lines = useMemo(() => analysis.status === 'ready' ? terminalLines(analysis.data, overview.status === 'ready' ? overview.data : null) : [], [analysis, overview]);
  const [count, setCount] = useState(0);
  const hovered = useRef(false);
  useEffect(() => {
    if (!lines.length) return;
    if (reduced) { setCount(lines.length); return; }
    setCount(0);
    const timer = window.setInterval(() => { if (!hovered.current && !document.hidden) setCount(value => value >= lines.length ? value : value + 1); }, 340);
    return () => window.clearInterval(timer);
  }, [lines, reduced]);
  const mode = analysis.status === 'ready' ? analysis.data.provenance.kind : null;
  return <div className="ov-cell ov-terminal" onMouseEnter={() => { hovered.current = true; }} onMouseLeave={() => { hovered.current = false; }}>
    <ScrollPanel title="Analysis log" eyebrow={mode === 'demo' ? 'Illustrative replay' : 'Replay of the job record'} autoScroll testId="terminal-panel">
      {analysis.status === 'loading' && <Skeleton label="Loading log" />}
      {analysis.status === 'failed' && <FailureNote failure={analysis.failure} retry={analysis.retry} />}
      {analysis.status === 'ready' && <div className="terminal ov-term terminal-text" role="log" aria-live="off" data-testid="terminal-log">
        {lines.slice(0, count).map((line, index) => <div key={index} className={`ov-term-line ${line.level}`}>{line.text}</div>)}
        <span className="ov-cursor" aria-hidden="true">▍</span>
      </div>}
    </ScrollPanel>
  </div>;
}

/* Status strip */

type StepState = 'done' | 'running' | 'pending' | 'waiting' | 'failed';
function PipelineStrip({ analysis, claims, overviewStatus, history }: { analysis: Resource<RepositoryAnalysis>; claims: ClaimSummary | null; overviewStatus: Resource<Overview>['status']; history: Resource<CoveragePoint[]> }) {
  const api = useApi();
  const scope = useScope();
  const workScope = useWorkScope();
  const exported = useWorkStore(state => state.exports.some(record => record.scope === workScope && record.status === 'complete'));
  const analyzed: StepState = analysis.status === 'ready' ? 'done' : analysis.status === 'loading' ? 'running' : analysis.failure?.kind === 'needs-job' ? 'waiting' : 'failed';
  const later: StepState = api.mode === 'demo' ? 'done' : 'pending';
  const steps: { id: string; label: string; state: StepState }[] = [
    { id: 'upload', label: 'Upload', state: api.mode === 'demo' || scope ? 'done' : 'waiting' },
    { id: 'parse', label: 'Parse AST', state: analyzed },
    { id: 'extract', label: 'Extract facts', state: analyzed },
    { id: 'summarize', label: 'Summarize', state: later },
    { id: 'verify', label: 'Verify', state: claims ? 'done' : later },
    { id: 'publish', label: 'Publish', state: api.mode === 'live' ? 'pending' : exported ? 'done' : 'waiting' },
  ];
  const score = claims ? pct(claims.verified, claims.total) : null;
  const unsupported = claims ? pct(claims.unsupported, claims.total) : null;
  const last = analysis.status === 'ready' ? formatWhen(analysis.data.analyzedAt) : null;
  const icon = (state: StepState) => state === 'done' ? <CircleCheck size={13} aria-hidden="true" /> : state === 'running' ? <LoaderCircle size={13} className="spin" aria-hidden="true" /> : state === 'pending' ? <Hourglass size={13} aria-hidden="true" /> : <CircleDashed size={13} aria-hidden="true" />;
  const label = { done: 'complete', running: 'running', pending: 'integration pending', waiting: 'not started', failed: 'failed' };
  return <section className="ov-strip card" aria-label="Analysis pipeline status" data-testid="pipeline-strip">
    <ol className="ov-steps">
      {steps.map((step, index) => <li key={step.id} className={step.state} data-testid={`step-${step.id}`} data-state={step.state}>
        {icon(step.state)}<span>{step.label}</span><span className="sr-only">, {label[step.state]}</span>
        {index < steps.length - 1 && <i className="ov-step-link" aria-hidden="true"><b /></i>}
      </li>)}
    </ol>
    <dl className="ov-strip-facts">
      <div><dt>Last analysis</dt><dd>{analysis.status === 'ready' ? last ?? 'Not recorded by the API' : '…'}</dd></div>
      <div><dt>Verification score</dt><dd data-testid="verification-score">{score !== null ? `${score}%` : overviewStatus === 'loading' ? '…' : <span className="amber">Pending</span>}</dd></div>
      <div><dt>Unsupported rate</dt><dd>{unsupported !== null ? `${unsupported}%` : overviewStatus === 'loading' ? '…' : <span className="amber">Pending</span>}</dd></div>
      <div><dt>History</dt><dd>{history.status === 'ready' ? `${history.data.length} days, illustrative` : history.status === 'failed' ? <span className="amber">None in this source</span> : '…'}</dd></div>
    </dl>
  </section>;
}
