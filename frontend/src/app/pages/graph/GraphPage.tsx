import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, Crosshair, ExternalLink, Gauge, Maximize, Minus, Moon, Plus, RotateCcw, Search, SlidersHorizontal, Sun, X } from 'lucide-react';
import { Toast } from '../../../components/ui';
import { easeOutExpo } from '../../../design/motion';
import { useApi, useResource, useScope } from '../../../data/source';
import type { DashboardGraph, RepositoryAnalysis } from '../../../data/dashboard';
import { rampCss } from '../../../viz/palette';
import { useReducedMotion, useResolvedMode, useVizStore } from '../../../viz/store';
import type { Destination } from '../../nav';
import { useShellStore } from '../../store';
import { FailureNote, formatNumber, SourceTag, usePageData, type Resource } from '../common';
import { benchmarkGraph, buildGraphData, EDGE_KINDS, searchNodes, type ColorBy, type EdgeKind, type GNode, type GraphData } from './model';
import { languageLegend } from './layout';
import type { GraphHighlight, GraphSettings, GraphStats, GraphView, GraphViewOptions } from './view';
import { CanvasGraphView } from './canvas2d';
import './graph.css';

const EDGE_LABELS: Record<EdgeKind, { label: string; dash: string; color: string }> = {
  imports: { label: 'Imports', dash: '', color: 'var(--blue)' },
  inherits: { label: 'Inheritance', dash: '6 4', color: 'var(--violet)' },
  calls: { label: 'Calls', dash: '1.5 3.5', color: 'var(--cyan)' },
  contains: { label: 'Contains', dash: '', color: 'var(--graph-contains)' },
};
const COLOR_BY: { id: ColorBy; label: string }[] = [{ id: 'module', label: 'Module' }, { id: 'language', label: 'Language' }, { id: 'coverage', label: 'Doc coverage' }];
const THEME_KEY = 'codeatlas.graph.theme';
const BENCH_MAX = 5000;
const SEQUENCE_MS = 1100;

function readTheme(): 'dark' | 'light' {
  try { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
}

/** Waits for the analysis too, so coverage colors and the layout are built once from complete data. */
function useGraphData(graph: Resource<DashboardGraph>, analysis: Resource<RepositoryAnalysis>, bench: number | null): GraphData | null {
  return useMemo(() => {
    if (graph.status !== 'ready' || analysis.status === 'loading') return null;
    const source = bench ? benchmarkGraph(graph.data, bench) : graph.data;
    const data = buildGraphData(source, analysis.status === 'ready' ? analysis.data : null);
    return bench ? { ...data, synthetic: source.nodes.length } : data;
  }, [graph, analysis, bench]);
}

export function GraphPage({ item }: { item: Destination }) {
  const api = useApi();
  const [params] = useSearchParams();
  const requested = Number(params.get('bench'));
  const bench = api.mode === 'demo' && Number.isFinite(requested) && requested > 0 ? Math.min(BENCH_MAX, Math.round(requested)) : null;
  const graph = usePageData('getGraph', (client, scope) => client.getGraph(scope));
  const analysis = usePageData('getAnalysis', (client, scope) => client.getAnalysis(scope));
  const data = useGraphData(graph, analysis, bench);

  return <div className="page-frame graph-page" data-testid="graph-page" data-page="graph">
    <header className="graph-hud">
      <div>
        <span className="graph-hud-label">Knowledge graph</span>
        <h1 tabIndex={-1}><span className="sr-only">{item.label}, </span>{data ? `${formatNumber.format(data.nodes.length)} ${data.nodes.length === 1 ? 'node' : 'nodes'}, ${formatNumber.format(data.edges.length)} ${data.edges.length === 1 ? 'edge' : 'edges'}` : 'Modules, classes and functions'}</h1>
      </div>
      <div className="graph-hud-meta">
        <SourceTag mode={api.mode} />
        {data?.synthetic && <span className="graph-chip warn" data-testid="graph-synthetic">Synthetic benchmark, not a repository</span>}
        {analysis.status === 'failed' && graph.status === 'ready' && <span className="graph-chip" title={analysis.failure.message}>Coverage unavailable: {analysis.failure.title}</span>}
      </div>
    </header>
    {graph.status === 'failed'
      ? <div className="graph-empty" data-testid="graph-failure"><FailureNote failure={graph.failure} retry={graph.retry} /></div>
      : data ? <GraphWorkspace key={`${api.mode}:${bench ?? 0}`} data={data} demo={api.mode === 'demo'} /> : <div className="graph-empty" role="status" data-testid="graph-loading"><span className="graph-spinner" aria-hidden="true" />Loading the graph</div>}
  </div>;
}

function GraphWorkspace({ data, demo }: { data: GraphData; demo: boolean }) {
  const resolved = useResolvedMode('graph');
  const setOverride = useVizStore(state => state.setOverride);
  const reduced = useReducedMotion();
  const [failed3d, setFailed3d] = useState<string | null>(null);
  const mode = failed3d ? '2d' : resolved.mode;

  const [edgeKinds, setEdgeKinds] = useState<ReadonlySet<EdgeKind>>(() => new Set(EDGE_KINDS));
  const [hiddenClusters, setHiddenClusters] = useState<ReadonlySet<string>>(() => new Set());
  const [colorBy, setColorBy] = useState<ColorBy>('module');
  const [hulls, setHulls] = useState(true);
  const [labels, setLabels] = useState(true);
  const [fade, setFade] = useState(true);
  const [charge, setCharge] = useState(260);
  const [performance, setPerformance] = useState(false);
  const performanceTouched = useRef(false);
  const [theme, setTheme] = useState(readTheme);
  const [hover, setHover] = useState<{ node: GNode; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<GNode | null>(null);
  const [focus, setFocus] = useState<GNode | null>(null);
  const [query, setQuery] = useState('');
  const [layout, setLayout] = useState(1);
  const layoutRef = useRef(layout); layoutRef.current = layout;
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [panelOpen, setPanelOpen] = useState(true);

  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const labelLayer = useRef<HTMLDivElement>(null);
  const minimap = useRef<HTMLCanvasElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const view = useRef<GraphView | null>(null);

  const [hiddenKinds, setHiddenKinds] = useState<ReadonlySet<string>>(() => new Set());
  const kinds = useMemo(() => [...new Set(data.nodes.map(node => node.kind))].sort().map(kind => ({ kind, count: data.nodes.filter(node => node.kind === kind).length })), [data]);
  const filter = useMemo(() => ({ edgeKinds, hiddenClusters, hiddenKinds }), [edgeKinds, hiddenClusters, hiddenKinds]);
  const settings: GraphSettings = useMemo(() => ({ filter, colorBy, hulls, labels, fade, charge, performance }), [filter, colorBy, hulls, labels, fade, charge, performance]);
  const matches = useMemo(() => new Set(query.trim() ? searchNodes(data, query, 200).map(node => node.id) : []), [data, query]);
  const highlight: GraphHighlight = useMemo(() => ({ hover: hover?.node ?? null, selected, focus, matches }), [hover, selected, focus, matches]);
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const highlightRef = useRef(highlight); highlightRef.current = highlight;

  const select = useCallback((node: GNode | null, fly = false) => {
    setSelected(node);
    if (!node) { setFocus(null); setAnnouncement('Selection cleared'); return; }
    setFocus(current => current && current !== node ? node : current);
    setAnnouncement(`Selected ${node.label}, ${node.kind}, ${data.neighbors.get(node.id)?.size ?? 0} connections`);
    if (fly) view.current?.flyTo(node);
  }, [data]);
  const selectRef = useRef(select); selectRef.current = select;

  /** One renderer per mode. The canvas element is replaced too, because a canvas keeps the first context type it was given. */
  useEffect(() => {
    if (!canvas.current || !host.current || !labelLayer.current) return;
    const options: GraphViewOptions = {
      canvas: canvas.current, host: host.current, labels: labelLayer.current, minimap: minimap.current, data, reduced, charge: settingsRef.current.charge,
      onHover: (node, point) => setHover(node && point ? { node, x: point.x, y: point.y } : null),
      onSelect: node => selectRef.current(node),
      onFocus: node => { selectRef.current(node); setFocus(node); },
      onLayout: share => setLayout(share),
      onFailure: message => { setFailed3d(message); setNotice(message); },
    };
    let cancelled = false, created: GraphView | null = null;
    const start = (next: GraphView) => {
      if (cancelled) { next.dispose(); return; }
      created = next;
      view.current = next;
      next.apply(settingsRef.current);
      next.highlight(highlightRef.current);
    };
    if (mode === '3d') {
      setLayout(0);
      import('./scene3d').then(module => {
        if (cancelled) return;
        try { start(new module.SceneGraphView(options)); } catch (error) { setFailed3d(error instanceof Error ? error.message : 'WebGL could not start.'); }
      }, () => setFailed3d('The 3D renderer could not be loaded.'));
    } else start(new CanvasGraphView(options));
    return () => { cancelled = true; created?.dispose(); if (view.current === created) view.current = null; setHover(null); };
  }, [data, mode, reduced]);

  useEffect(() => { view.current?.apply(settings); }, [settings]);
  useEffect(() => { view.current?.highlight(highlight); }, [highlight]);
  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* The theme still applies for this visit. */ }
    view.current?.refreshTheme();
  }, [theme]);

  /** HUD counters, and the automatic switch to performance mode when frames are measured slow. */
  useEffect(() => {
    let slow = 0;
    const timer = window.setInterval(() => {
      const current = view.current?.stats() ?? null;
      setStats(current);
      /** Decided on frames the view animated by itself: when input paces the frames, a low rate says nothing about rendering. */
      if (!current || current.recentFrame === null || settingsRef.current.performance || performanceTouched.current || layoutRef.current < 1) { slow = 0; return; }
      slow = current.recentFrame > 24 ? slow + 1 : 0;
      if (slow >= 2) { slow = 0; setPerformance(true); setNotice(`Performance mode turned on: frames took ${current.recentFrame} ms while the view moved, below 60 frames per second.`); }
    }, 500);
    return () => window.clearInterval(timer);
  }, []);

  /** Test and measurement hook: read-only statistics and node positions. */
  useEffect(() => {
    const hook = { stats: () => view.current?.stats() ?? null, resetStats: () => view.current?.resetStats(), drift: (on: boolean) => view.current?.setDrift(on), locate: (id: string) => { const node = data.byId.get(id); return node ? view.current?.locate(node) ?? null : null; }, mode: () => view.current?.mode ?? null, nodes: () => data.nodes.map(node => node.id) };
    (window as unknown as { __codeatlasGraph?: typeof hook }).__codeatlasGraph = hook;
    return () => { delete (window as unknown as { __codeatlasGraph?: typeof hook }).__codeatlasGraph; };
  }, [data]);

  const screenshot = useCallback(async () => {
    try {
      const blob = await view.current!.screenshot();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `codeatlas-graph-${demo ? 'demo-' : ''}${mode}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setToast(`Saved ${link.download}`);
    } catch (error) { setToast(`Screenshot failed: ${error instanceof Error ? error.message : 'unknown error'}`); }
  }, [demo, mode]);

  const toggleFocus = useCallback(() => {
    if (focus) { setFocus(null); setAnnouncement('Focus cleared'); return; }
    if (!selected) { setAnnouncement('Select a node to focus on it'); return; }
    setFocus(selected);
    view.current?.flyTo(selected);
    setAnnouncement(`Focused on ${selected.label} and its ${data.neighbors.get(selected.id)?.size ?? 0} neighbors`);
  }, [focus, selected, data]);

  const fullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else stage.current?.requestFullscreen().catch(() => setToast('Fullscreen is not available here.'));
  }, []);

  /** S, R and F act on the graph. They yield to typing, open overlays and the shell's G sequences. */
  useEffect(() => {
    let lastG = 0;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.ctrlKey || event.metaKey || event.altKey || (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))) return;
      const shell = useShellStore.getState();
      if (shell.paletteOpen || shell.shortcutsOpen || !shell.singleKeyShortcuts) return;
      const key = event.key.toLowerCase();
      if (key === 'g') { lastG = event.timeStamp; return; }
      if (event.timeStamp - lastG < SEQUENCE_MS) { lastG = 0; return; }
      if (key === 's') { event.preventDefault(); void screenshot(); }
      else if (key === 'r') { event.preventDefault(); view.current?.reset(); setAnnouncement('View reset'); }
      else if (key === 'f') { event.preventDefault(); toggleFocus(); }
      else if (event.key === 'Escape' && (focus || selected)) { if (focus) setFocus(null); else select(null); }
      else if (event.key === '+' || event.key === '=') view.current?.zoom(1.3);
      else if (event.key === '-') view.current?.zoom(1 / 1.3);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screenshot, toggleFocus, focus, selected, select]);

  /** Read after the theme attribute is applied, because the legend shows the canvas theme's colors. */
  const [legend, setLegend] = useState<ReturnType<typeof languageLegend> | null>(null);
  useEffect(() => { setLegend(colorBy === 'language' && host.current ? languageLegend(host.current, data) : null); }, [colorBy, data, theme]);
  const counts = { nodes: stats?.nodes ?? data.nodes.length, edges: stats?.edges ?? data.edges.length };

  return <div className={`graph-workspace ${panelOpen ? '' : 'panel-closed'}`} ref={host} data-graph-theme={theme} data-testid="graph-workspace">
    <div className="sr-only" aria-live="polite" data-testid="graph-announcer">{announcement}</div>
    <aside className="graph-panel" aria-label="Graph controls" data-testid="graph-controls" hidden={!panelOpen}>
      <SearchBox data={data} query={query} setQuery={setQuery} input={searchInput} onPick={node => { select(node, true); }} />
      <fieldset className="graph-group">
        <legend>Edge types</legend>
        {EDGE_KINDS.map(kind => <label key={kind} className="graph-check">
          <input type="checkbox" checked={edgeKinds.has(kind)} onChange={() => setEdgeKinds(current => { const next = new Set(current); if (next.has(kind)) next.delete(kind); else next.add(kind); return next; })} />
          <svg width="28" height="8" aria-hidden="true"><line x1="1" y1="4" x2="27" y2="4" stroke={EDGE_LABELS[kind].color} strokeWidth="2" strokeDasharray={EDGE_LABELS[kind].dash} strokeLinecap="round" /></svg>
          <span>{EDGE_LABELS[kind].label}</span>
          <span className="graph-count">{formatNumber.format(data.edges.filter(edge => edge.kind === kind).length)}</span>
        </label>)}
      </fieldset>
      <fieldset className="graph-group">
        <legend>Node kinds</legend>
        {kinds.map(({ kind, count }) => <label key={kind} className="graph-check graph-check-kind" data-testid="kind-filter">
          <input type="checkbox" checked={!hiddenKinds.has(kind)} onChange={() => setHiddenKinds(current => { const next = new Set(current); if (next.has(kind)) next.delete(kind); else next.add(kind); return next; })} />
          <span>{kind}</span>
          <span className="graph-count">{formatNumber.format(count)}</span>
        </label>)}
      </fieldset>
      <fieldset className="graph-group">
        <legend>Clusters</legend>
        <div className="graph-inline-actions">
          <button type="button" className="text-link" onClick={() => setHiddenClusters(new Set())}>Show all</button>
          <button type="button" className="text-link" onClick={() => setHiddenClusters(new Set(data.clusters.map(cluster => cluster.id)))}>Hide all</button>
        </div>
        {data.clusters.map(cluster => <label key={cluster.id} className="graph-check" data-testid="cluster-filter">
          <input type="checkbox" checked={!hiddenClusters.has(cluster.id)} onChange={() => setHiddenClusters(current => { const next = new Set(current); if (next.has(cluster.id)) next.delete(cluster.id); else next.add(cluster.id); return next; })} />
          <i className="graph-swatch" style={{ background: `var(${cluster.color})` }} aria-hidden="true" />
          <span className="graph-cluster-name" title={cluster.label}>{cluster.label}</span>
          <span className="graph-count">{formatNumber.format(cluster.count)}</span>
        </label>)}
      </fieldset>
      <div className="graph-group">
        <span className="graph-group-title" id="graph-color-by">Color by</span>
        <div className="segmented" role="radiogroup" aria-labelledby="graph-color-by">
          {COLOR_BY.map(option => <button key={option.id} type="button" role="radio" aria-checked={colorBy === option.id} onClick={() => setColorBy(option.id)}>{option.label}</button>)}
        </div>
        {colorBy === 'coverage' && <div className="graph-ramp" data-testid="coverage-legend"><span style={{ background: rampCss }} /><small>0% documented</small><small>100%</small>{data.nodes.every(node => node.coverage === null) && <p className="ov-muted">No coverage in this source, so every node is grey.</p>}</div>}
        {colorBy === 'language' && legend && <ul className="graph-legend">{legend.map(entry => <li key={entry.id}><i className="graph-swatch" style={{ background: entry.color }} aria-hidden="true" />{entry.label}</li>)}</ul>}
      </div>
      <div className="graph-group graph-switches">
        <Switch label="Cluster hulls" checked={hulls} onChange={setHulls} />
        <Switch label="Labels" checked={labels} onChange={setLabels} />
        <Switch label="Fade unselected" checked={fade} onChange={setFade} />
        <Switch label="Performance mode" checked={performance} onChange={value => { performanceTouched.current = true; setPerformance(value); }} />
      </div>
      <div className="graph-group">
        <label className="graph-range">
          <span>Repulsion <span className="mono">{charge}</span></span>
          <input type="range" min={80} max={600} step={20} value={charge} onChange={event => setCharge(Number(event.target.value))} aria-describedby="graph-force-note" />
        </label>
        <p className="ov-muted" id="graph-force-note">{mode === '3d' ? 'In 3D the layout re-settles, then the view updates.' : 'The layout re-settles live.'}</p>
        <button type="button" className="graph-button" onClick={() => view.current?.reheat()}>Re-run layout</button>
      </div>
    </aside>

    <div className="graph-stage" ref={stage} data-testid="graph-stage" data-mode={mode}>
      <canvas key={mode} ref={canvas} className="graph-canvas" data-testid="graph-canvas" role="img" aria-label={`${mode === '3d' ? '3D' : '2D'} knowledge graph of ${counts.nodes} nodes and ${counts.edges} edges. Use the search box to find and select nodes.`} />
      <div className="graph-labels" ref={labelLayer} aria-hidden="true" />
      <div className="graph-toolbar" role="toolbar" aria-label="Graph view">
        <button type="button" className="icon-button small" aria-label={panelOpen ? 'Hide controls' : 'Show controls'} aria-pressed={panelOpen} onClick={() => setPanelOpen(open => !open)}><SlidersHorizontal size={14} /></button>
        <div className="segmented" role="radiogroup" aria-label="Graph mode" data-testid="graph-mode">
          {(['3d', '2d'] as const).map(option => <button key={option} type="button" role="radio" aria-checked={mode === option} disabled={option === '3d' && (!!failed3d || resolved.source === 'fallback')} title={option === '3d' && resolved.source === 'fallback' ? resolved.reason : undefined} onClick={() => setOverride('graph', option)}>{option.toUpperCase()}</button>)}
        </div>
        <button type="button" className="icon-button small" aria-label="Zoom in" onClick={() => view.current?.zoom(1.3)}><Plus size={14} /></button>
        <button type="button" className="icon-button small" aria-label="Zoom out" onClick={() => view.current?.zoom(1 / 1.3)}><Minus size={14} /></button>
        <button type="button" className="icon-button small" aria-label="Reset view (R)" title="Reset view (R)" onClick={() => view.current?.reset()}><RotateCcw size={14} /></button>
        <button type="button" className="icon-button small" aria-label="Focus on selection (F)" title="Focus on selection (F)" aria-pressed={!!focus} onClick={toggleFocus}><Crosshair size={14} /></button>
        <button type="button" className="icon-button small" aria-label="Save screenshot (S)" title="Save screenshot (S)" onClick={() => void screenshot()}><Camera size={14} /></button>
        <button type="button" className="icon-button small" aria-label={theme === 'dark' ? 'Light canvas' : 'Dark canvas'} title={theme === 'dark' ? 'Light canvas' : 'Dark canvas'} data-testid="graph-theme" onClick={() => setTheme(current => current === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}</button>
        <button type="button" className="icon-button small" aria-label="Fullscreen" onClick={fullscreen}><Maximize size={14} /></button>
      </div>
      {layout < 1 && <div className="graph-progress" role="progressbar" aria-label="Settling the layout" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(layout * 100)} data-testid="graph-progress"><span style={{ transform: `scaleX(${layout})` }} />Settling layout {Math.round(layout * 100)}%</div>}
      {notice && <div className="graph-notice" role="status" data-testid="graph-notice"><Gauge size={13} aria-hidden="true" /><span>{notice}</span><button type="button" className="icon-button small" aria-label="Dismiss" onClick={() => setNotice(null)}><X size={12} /></button></div>}
      <dl className="graph-counters" data-testid="graph-counters">
        <div><dt>FPS</dt><dd data-testid="graph-fps">{stats?.fps ?? 'idle'}</dd></div>
        <div><dt>Nodes</dt><dd>{formatNumber.format(counts.nodes)}</dd></div>
        <div><dt>Edges</dt><dd>{formatNumber.format(counts.edges)}</dd></div>
        <div><dt>Labels</dt><dd>{stats?.labels ?? 0}</dd></div>
        <div><dt>Mode</dt><dd>{mode.toUpperCase()}{performance ? ', fast' : ''}</dd></div>
      </dl>
      <canvas ref={minimap} className="graph-minimap" data-testid="graph-minimap" aria-label="Minimap. Click to move the view." role="img" />
      {hover && <div className="graph-tooltip" role="tooltip" style={{ left: hover.x, top: hover.y }} data-testid="graph-tooltip">
        <strong>{hover.node.label}</strong>
        <span>{hover.node.kind} · {data.clusters.find(cluster => cluster.id === hover.node.cluster)?.label}</span>
        <span>{data.neighbors.get(hover.node.id)?.size ?? 0} connections{hover.node.coverage !== null ? ` · ${Math.round(hover.node.coverage)}% documented` : ''}</span>
      </div>}
      <AnimatePresence>
        {selected && <Inspector key="inspector" node={selected} data={data} reduced={reduced} focused={focus === selected} onClose={() => select(null)} onPick={node => select(node, true)} onFocus={toggleFocus} />}
      </AnimatePresence>
    </div>
    <Toast message={toast} onClose={() => setToast(null)} />
  </div>;
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={checked} className="toggle-row graph-switch" onClick={() => onChange(!checked)}><span>{label}</span><span className={`toggle ${checked ? 'on' : ''}`}><span /></span></button>;
}

/** Combobox: typing highlights every match on the canvas; Enter or a click flies to one and selects it. */
function SearchBox({ data, query, setQuery, input, onPick }: { data: GraphData; query: string; setQuery: (value: string) => void; input: RefObject<HTMLInputElement>; onPick: (node: GNode) => void }) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const results = useMemo(() => searchNodes(data, query, 8), [data, query]);
  const pick = (node: GNode) => { onPick(node); setOpen(false); };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive(index => Math.min(results.length - 1, index + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(0, index - 1)); }
    else if (event.key === 'Enter' && results[active]) { event.preventDefault(); pick(results[active]); }
    else if (event.key === 'Escape') { event.stopPropagation(); if (query) setQuery(''); else input.current?.blur(); setOpen(false); }
  };
  const expanded = open && results.length > 0;
  return <div className="graph-search">
    <label className="graph-search-field">
      <Search size={14} aria-hidden="true" />
      <span className="sr-only">Search nodes</span>
      <input ref={input} type="search" role="combobox" aria-expanded={expanded} aria-controls="graph-search-results" aria-autocomplete="list" aria-activedescendant={expanded ? `graph-result-${active}` : undefined} placeholder="Search nodes" value={query} data-testid="graph-search"
        onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 150)} onKeyDown={onKeyDown} />
    </label>
    {query.trim() && <p className="graph-search-count" data-testid="graph-search-count">{results.length ? `${formatNumber.format(searchNodes(data, query, 200).length)} matches highlighted` : 'No matches'}</p>}
    {expanded && <ul id="graph-search-results" role="listbox" className="graph-results" aria-label="Matching nodes">
      {results.map((node, index) => <li key={node.id} id={`graph-result-${index}`} role="option" aria-selected={index === active} onMouseDown={event => { event.preventDefault(); pick(node); }} onMouseEnter={() => setActive(index)}>
        <strong>{node.label}</strong><span>{node.kind}{node.path ? ` · ${node.path}` : ''}</span>
      </li>)}
    </ul>}
  </div>;
}

function Inspector({ node, data, reduced, focused, onClose, onPick, onFocus }: { node: GNode; data: GraphData; reduced: boolean; focused: boolean; onClose: () => void; onPick: (node: GNode) => void; onFocus: () => void }) {
  const api = useApi();
  const scope = useScope() ?? undefined;
  const source = useResource(node.path ? `${api.mode}:graph-file:${scope?.snapshotId ?? ''}:${node.path}` : null, () => api.getFile(node.path!, scope));
  const cluster = data.clusters.find(entry => entry.id === node.cluster);
  const groups = useMemo(() => {
    const result = new Map<string, GNode[]>();
    data.edges.forEach(edge => {
      const other = edge.source === node ? edge.target : edge.target === node ? edge.source : null;
      if (!other) return;
      const key = edge.kind === 'contains' ? (edge.source === node ? 'Contains' : 'Defined in') : edge.kind === 'inherits' ? (edge.source === node ? 'Inherits from' : 'Inherited by') : edge.kind === 'imports' ? (edge.source === node ? 'Imports' : 'Imported by') : (edge.source === node ? 'Calls' : 'Called by');
      const list = result.get(key);
      if (list) { if (!list.includes(other)) list.push(other); } else result.set(key, [other]);
    });
    return [...result];
  }, [data, node]);
  const closeButton = useRef<HTMLButtonElement>(null);
  const snippet = useMemo(() => {
    if (source.status !== 'ready') return null;
    const lines = source.data.content.split('\n');
    /** A final newline ends the last line; it does not start another. */
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    if (node.line && node.line > lines.length) return { start: node.line, lines: [] as string[], truncated: false, outside: lines.length };
    const start = node.line ? node.line - 1 : 0, end = Math.min(lines.length, node.line ? Math.max(node.endLine ?? node.line, node.line) : 30, start + 40);
    return { start: start + 1, lines: lines.slice(start, end), truncated: (node.endLine ?? end) > end || (!node.line && lines.length > end), outside: null as number | null };
  }, [source, node]);
  const explorer = node.path ? `/app/explorer?path=${encodeURIComponent(node.path)}${node.line ? `&line=${node.line}` : ''}` : null;

  return <motion.aside className="graph-inspector" aria-label={`Inspector: ${node.label}`} data-testid="graph-inspector"
    initial={reduced ? false : { x: 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={reduced ? { opacity: 0 } : { x: 24, opacity: 0 }} transition={{ duration: reduced ? 0 : .24, ease: easeOutExpo }}
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
    <header>
      <span className="graph-kind">{node.kind}</span>
      <h2>{node.label}</h2>
      <button ref={closeButton} type="button" className="icon-button small" aria-label="Close inspector" onClick={onClose}><X size={14} /></button>
    </header>
    <dl className="graph-facts">
      <div><dt>Cluster</dt><dd><i className="graph-swatch" style={{ background: cluster ? `var(${cluster.color})` : undefined }} aria-hidden="true" />{cluster?.label ?? node.cluster}</dd></div>
      <div><dt>Path</dt><dd className="mono">{node.path ?? 'Not recorded'}{node.line ? `:${node.line}${node.endLine && node.endLine !== node.line ? `–${node.endLine}` : ''}` : ''}</dd></div>
      <div><dt>Language</dt><dd>{node.language ?? 'Not recorded'}</dd></div>
      <div><dt>Connections</dt><dd>{data.neighbors.get(node.id)?.size ?? 0} ({node.degree} edges)</dd></div>
      <div><dt>Documentation</dt><dd>{node.coverage === null ? 'Not recorded' : node.kind === 'module' ? `${Math.round(node.coverage)}% of symbols documented` : node.coverage >= 100 ? 'Has a docstring' : 'No docstring'}</dd></div>
    </dl>
    <div className="graph-inspector-actions">
      {explorer && <Link className="graph-button" to={explorer}><ExternalLink size={13} aria-hidden="true" />Open in Explorer</Link>}
      <button type="button" className="graph-button" aria-pressed={focused} onClick={onFocus}><Crosshair size={13} aria-hidden="true" />{focused ? 'Leave focus' : 'Focus neighborhood'}</button>
    </div>
    <section aria-label="Relationships" className="graph-relations">
      {groups.length === 0 && <p className="ov-muted">No relationships in this graph.</p>}
      {groups.map(([label, nodes]) => <div key={label}>
        <h3>{label} <span className="graph-count">{nodes.length}</span></h3>
        <ul>{nodes.slice(0, 12).map(other => <li key={other.id}><button type="button" title={other.path ?? undefined} onClick={() => onPick(other)}>{other.label}<small>{other.kind === 'module' && other.path?.includes('/') ? other.path.split('/').slice(-2, -1)[0] + '/' : other.kind}</small></button></li>)}</ul>
        {nodes.length > 12 && <p className="ov-muted">And {nodes.length - 12} more.</p>}
      </div>)}
    </section>
    <section aria-label="Source" className="graph-source">
      <h3>Source</h3>
      {!node.path ? <p className="ov-muted">This node has no file path.</p>
        : source.status === 'loading' ? <p className="ov-muted" role="status">Loading source</p>
          : source.status === 'failed' ? <FailureNote failure={source.failure} retry={source.retry} compact />
            : snippet && snippet.outside !== null ? <p className="ov-muted" data-testid="graph-snippet-outside">The analysis places this symbol at line {snippet.start}, but the file has {snippet.outside} lines. The file may have changed since it was analyzed.</p>
            : snippet && <pre data-testid="graph-snippet" tabIndex={0} aria-label={`Source of ${node.label}`}><code>{snippet.lines.map((line, index) => <span key={index}><b>{snippet.start + index}</b>{line || ' '}{'\n'}</span>)}</code></pre>}
      {snippet?.truncated && <p className="ov-muted">Showing the first {snippet.lines.length} lines.</p>}
    </section>
  </motion.aside>;
}

