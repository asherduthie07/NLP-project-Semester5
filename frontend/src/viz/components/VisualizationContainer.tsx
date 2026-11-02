import { Component, lazy, memo, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { AnimatePresence, motion, useInView } from 'framer-motion';
import { AlertTriangle, Box, Check, Crosshair, Download, FileJson, Grid2x2, Hourglass, Image as ImageIcon, Info, Link2, Maximize2, Minus, MoveUpRight, Plus, RefreshCw, RotateCcw, Square, Table2, X } from 'lucide-react';
import { Chip, Kbd, Skeleton } from '../../components/ui';
import { CornerBrackets } from '../../components/fx';
import { detectWebGL } from '../capability';
import { exportCsv, exportJson, exportPng } from '../export';
import { applyHidden, datumIds, describeDatum, encodings, isEmptyModel, legendItems, provenanceLabel, summarize, toTable } from '../model';
import { rampCss } from '../palette';
import { vizRegistry, load3DRenderer } from '../registry';
import { useSelectionStore } from '../selection';
import { useReducedMotion, useResolvedMode, useVizStore } from '../store';
import type { RendererProps, SourceRef, TooltipContent, VizMode, VizModel, VizState } from '../types';
import type { StageHandle, ThreeDProps } from './ThreeDChartRenderer';

const ThreeDChartRenderer = lazy(load3DRenderer) as unknown as React.ComponentType<ThreeDProps>;
const EMPTY: readonly string[] = [];

export function TwoDChartRenderer(props: RendererProps) {
  const Renderer = vizRegistry[props.model.kind].renderer2D;
  return <div className="viz-stage-2d" data-testid="viz-2d"><Renderer {...props} /></div>;
}
const Memo2D = memo(TwoDChartRenderer);

/** Falls back to the 2D renderer if the 3D path throws. A chart must never go blank because of the GPU. */
class StageBoundary extends Component<{ onFailure: (reason: string) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, _info: ErrorInfo) { this.props.onFailure(error.message); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function InteractiveTooltip({ content, point }: { content: TooltipContent | null; point: { x: number; y: number } | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const show = !!content && !!point;
  useEffect(() => {
    const element = ref.current;
    if (!element?.showPopover) return;
    /** Popover puts the tooltip in the top layer, clear of panel clipping, transforms and the analysis dialog. */
    if (show && !element.matches(':popover-open')) element.showPopover();
    if (!show && element.matches(':popover-open')) element.hidePopover();
  }, [show]);
  useEffect(() => {
    const element = ref.current;
    if (!element || !point) return;
    const { offsetWidth: width, offsetHeight: height } = element;
    const x = Math.min(window.innerWidth - width - 10, point.x + 16), y = point.y + height + 18 > window.innerHeight ? point.y - height - 12 : point.y + 16;
    element.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
  });
  return <div ref={ref} {...{ popover: 'manual' }} className="viz-tooltip" data-testid="viz-tooltip" aria-hidden="true">
    {content && <>
      <strong>{content.title}</strong>
      {content.rows.map(row => <span className="viz-tooltip-row" key={row.label}><span>{row.color && <i style={{ background: `var(${row.color})` }} />}{row.label}</span><b className="mono">{row.value}</b></span>)}
      {content.source && <em className="mono">{sourceText(content.source)}</em>}
    </>}
  </div>;
}

const sourceText = (source: SourceRef) => `${source.path}${source.startLine ? `:${source.startLine}${source.endLine ? `–${source.endLine}` : ''}` : ''}`;

export function ChartLegend({ model, hidden, onToggle }: { model: VizModel; hidden: ReadonlySet<string>; onToggle: (id: string) => void }) {
  const items = legendItems(model);
  if (model.kind === 'heatmap') {
    const max = Math.max(...model.values.flat()), min = Math.min(...model.values.flat());
    return <div className="viz-legend" aria-label={`Color scale from ${min} to ${max} ${model.valueLabel}`}><span className="mono">{min}</span><span className="viz-ramp" style={{ background: rampCss }} /><span className="mono">{max}</span><span>{model.valueLabel}</span></div>;
  }
  if (!items.length) return null;
  return <div className="viz-legend" role="group" aria-label="Show or hide series">{items.map(item => {
    const off = hidden.has(item.id);
    return <button key={item.id} type="button" aria-pressed={!off} className={off ? 'off' : ''} onClick={() => onToggle(item.id)}><i style={{ background: `var(${item.color})` }} />{item.label}</button>;
  })}</div>;
}

export function DataTableView({ model }: { model: VizModel }) {
  const table = useMemo(() => toTable(model), [model]);
  return <div className="viz-table-wrap" tabIndex={0} role="region" aria-label={`${model.title} data table`}><table className="viz-table"><caption className="sr-only">{model.title}. {model.provenance.source}</caption><thead><tr>{table.columns.map((column, index) => <th scope="col" key={`${column}${index}`}>{column}</th>)}</tr></thead><tbody>{table.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => c === 0 ? <th scope="row" key={c}>{cell}</th> : <td className="mono" key={c}>{typeof cell === 'number' ? cell.toLocaleString('en-US') : cell}</td>)}</tr>)}</tbody></table></div>;
}

export function ModeSwitch({ chartId, compact = false }: { chartId?: string; compact?: boolean }) {
  const resolved = useResolvedMode(chartId);
  const setGlobal = useVizStore(state => state.setGlobalMode);
  const setOverride = useVizStore(state => state.setOverride);
  const uid = useId();
  const capability = detectWebGL();
  const blocked = resolved.source === 'fallback';
  const choose = (mode: VizMode) => { if (!blocked) { if (chartId) setOverride(chartId, mode); else setGlobal(mode); } };
  const options: { mode: VizMode; label: string; icon: ReactNode }[] = [{ mode: '3d', label: '3D', icon: <Box size={compact ? 11 : 13} /> }, { mode: '2d', label: '2D', icon: <Square size={compact ? 11 : 13} /> }];
  return <div role="radiogroup" aria-label={chartId ? 'Visualization mode for this chart' : 'Visualization mode for all charts'} className={`viz-mode ${compact ? 'compact' : ''}`} title={blocked ? resolved.reason : capability.renderer ?? undefined}>
    {options.map(option => {
      const checked = resolved.mode === option.mode, disabled = blocked && option.mode === '3d';
      return <button key={option.mode} type="button" role="radio" aria-checked={checked} aria-disabled={disabled} disabled={disabled} tabIndex={checked ? 0 : -1} onClick={() => choose(option.mode)} onKeyDown={event => {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); choose(option.mode === '3d' ? '2d' : '3d'); (event.currentTarget.parentElement?.querySelector('[tabindex="-1"]') as HTMLElement | null)?.focus(); }
      }}>
        {checked && <motion.span className="viz-mode-pill" layoutId={`${uid}-pill`} transition={{ type: 'spring', stiffness: 420, damping: 30 }} />}
        <span className="viz-mode-label">{option.icon}{option.label}</span>
      </button>;
    })}
  </div>;
}

function Tool({ label, onClick, children, pressed }: { label: string; onClick: () => void; children: ReactNode; pressed?: boolean }) {
  return <button type="button" className="viz-tool" aria-label={label} aria-pressed={pressed} data-tip={label} onClick={onClick}>{children}</button>;
}

export function VisualizationToolbar({ chartId, mode, stage, table, setTable, onExport, onFullscreen, fullscreen, followsGlobal, onFollow }: {
  chartId: string; mode: VizMode; stage: React.RefObject<StageHandle | null>; table: boolean; setTable: (value: boolean) => void;
  onExport: (format: 'png' | 'csv' | 'json') => void; onFullscreen: () => void; fullscreen: boolean; followsGlobal: boolean; onFollow: () => void;
}) {
  const [exportOpen, setExportOpen] = useState(false);
  return <div className="viz-toolbar" role="toolbar" aria-label="Chart controls">
    <ModeSwitch chartId={chartId} compact />
    {!followsGlobal && <Tool label="Follow the global mode" onClick={onFollow}><Link2 size={13} /></Tool>}
    {mode === '3d' && !table && <span className="viz-tool-group">
      <button type="button" className="viz-tool-text" onClick={() => stage.current?.preset('iso')}>Iso</button>
      <button type="button" className="viz-tool-text" onClick={() => stage.current?.preset('front')}>Front</button>
      <button type="button" className="viz-tool-text" onClick={() => stage.current?.preset('top')}>Top</button>
      <span className="viz-tool-zoom">
        <Tool label="Zoom in" onClick={() => stage.current?.zoom(1.2)}><Plus size={13} /></Tool>
        <Tool label="Zoom out" onClick={() => stage.current?.zoom(1 / 1.2)}><Minus size={13} /></Tool>
      </span>
      <Tool label="Reset camera" onClick={() => stage.current?.reset()}><RotateCcw size={13} /></Tool>
    </span>}
    <span className="viz-toolbar-end">
      <Tool label={table ? 'Show chart' : 'Show data table'} pressed={table} onClick={() => setTable(!table)}><Table2 size={13} /></Tool>
      <span className="viz-export">
        <Tool label="Export" pressed={exportOpen} onClick={() => setExportOpen(!exportOpen)}><Download size={13} /></Tool>
        {exportOpen && <span className="viz-export-menu" role="group" aria-label="Export format">
          {!table && <button type="button" onClick={() => { onExport('png'); setExportOpen(false); }}><ImageIcon size={12} />PNG snapshot</button>}
          <button type="button" onClick={() => { onExport('csv'); setExportOpen(false); }}><Grid2x2 size={12} />CSV data</button>
          <button type="button" onClick={() => { onExport('json'); setExportOpen(false); }}><FileJson size={12} />JSON model</button>
        </span>}
      </span>
      <Tool label={fullscreen ? 'Close analysis mode' : 'Open analysis mode'} onClick={onFullscreen}>{fullscreen ? <X size={13} /> : <Maximize2 size={13} />}</Tool>
    </span>
  </div>;
}

function StateView({ state, height }: { state: Exclude<VizState, { status: 'ready' }>; height: number }) {
  if (state.status === 'loading') return <div className="viz-state" style={{ height }} role="status" aria-label="Loading chart"><Skeleton width="70%" label="Loading chart data" /><Skeleton width="92%" label="Loading chart data" /><Skeleton width="48%" label="Loading chart data" /></div>;
  if (state.status === 'empty') return <div className="viz-state" style={{ height }} role="status"><Crosshair size={18} /><strong>No data</strong><span>{state.message}</span></div>;
  if (state.status === 'unavailable') return <div className="viz-state" style={{ height }} role="status"><Hourglass size={18} /><strong>{state.title}</strong><span>{state.message}</span></div>;
  return <div className="viz-state error" style={{ height }} role="alert"><AlertTriangle size={18} /><strong>This chart could not load</strong><span>{state.message}</span>{state.onRetry && <button type="button" className="button button-ghost" onClick={state.onRetry}><RefreshCw size={12} />Retry</button>}</div>;
}

interface BodyProps { id: string; model: VizModel; height: number; fullscreen: boolean; compact: boolean; selectionGroup: string; warnings?: string[]; hidden: ReadonlySet<string>; toggleHidden: (id: string) => void; toggleFullscreen: () => void; table: boolean; setTable: (value: boolean) => void; onDatumActivate?: (id: string, source?: SourceRef) => void; description?: string; }

function VizBody({ id, model, height, fullscreen, compact, selectionGroup, warnings, hidden, toggleHidden, toggleFullscreen, table, setTable, onDatumActivate }: BodyProps) {
  const resolved = useResolvedMode(id);
  const setOverride = useVizStore(state => state.setOverride);
  const reduced = useReducedMotion();
  const visible = useMemo(() => applyHidden(model, hidden), [model, hidden]);
  const ids = useMemo(() => datumIds(visible), [visible]);
  const selectedList = useSelectionStore(state => state.selected[selectionGroup] ?? EMPTY);
  const selected = useMemo(() => new Set(selectedList), [selectedList]);
  const hovered = useSelectionStore(state => state.hovered[selectionGroup] ?? null);
  const setHovered = useSelectionStore(state => state.setHovered);
  const toggle = useSelectionStore(state => state.toggle);
  const clear = useSelectionStore(state => state.clear);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const stage = useRef<StageHandle | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const switched = useRef(false);
  const lastMode = useRef(resolved.mode);
  const instructions = useId();
  const mode: VizMode = failure ? '2d' : resolved.mode;
  if (lastMode.current !== mode) { switched.current = true; lastMode.current = mode; }

  const onHover = useCallback((datum: string | null, point?: { x: number; y: number }) => {
    setHovered(selectionGroup, datum);
    setPointer(datum && point ? point : null);
  }, [selectionGroup, setHovered]);
  const onSelect = useCallback((datum: string) => {
    toggle(selectionGroup, datum);
    const content = describeDatum(visible, datum);
    onDatumActivate?.(datum, content?.source);
  }, [selectionGroup, toggle, visible, onDatumActivate]);
  const onFailure = useCallback((reason: string) => setFailure(reason), []);

  const keyboardId = focusIndex !== null ? ids[focusIndex] ?? null : null;
  const activeId = hovered ?? keyboardId;
  const tooltip = useMemo(() => hovered && pointer ? describeDatum(visible, hovered) : null, [hovered, pointer, visible]);
  const readoutId = keyboardId ?? selectedList[selectedList.length - 1] ?? null;
  const readout = useMemo(() => readoutId ? describeDatum(visible, readoutId) : null, [readoutId, visible]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const orbitStep = .18;
    if (mode === '3d' && event.shiftKey && event.key.startsWith('Arrow')) {
      event.preventDefault();
      stage.current?.orbit(event.key === 'ArrowLeft' ? -orbitStep : event.key === 'ArrowRight' ? orbitStep : 0, event.key === 'ArrowUp' ? -orbitStep : event.key === 'ArrowDown' ? orbitStep : 0);
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); setFocusIndex(index => index === null ? 0 : Math.min(ids.length - 1, index + 1)); }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); setFocusIndex(index => index === null ? 0 : Math.max(0, index - 1)); }
    else if ((event.key === 'Enter' || event.key === ' ') && keyboardId) { event.preventDefault(); onSelect(keyboardId); }
    else if (event.key === 'Escape' && (keyboardId || selectedList.length)) { event.stopPropagation(); event.preventDefault(); setFocusIndex(null); clear(selectionGroup); }
    else if (mode === '3d' && (event.key === '+' || event.key === '=')) stage.current?.zoom(1.2);
    else if (mode === '3d' && event.key === '-') stage.current?.zoom(1 / 1.2);
    else if (mode === '3d' && event.key === '0') stage.current?.reset();
    else if (mode === '3d' && event.key.toLowerCase() === 'f' && keyboardId) stage.current?.focus(keyboardId);
  };

  const run = (format: 'png' | 'csv' | 'json') => {
    if (format === 'csv') exportCsv(visible);
    else if (format === 'json') exportJson(visible);
    else if (root.current) exportPng(root.current, visible, mode).then(() => setExportError(null), (error: unknown) => setExportError(error instanceof Error ? error.message : 'The chart could not be exported.'));
  };

  const channels = encodings(visible);
  const empty = isEmptyModel(visible);
  const entry: ThreeDProps['entry'] = switched.current ? 'lift' : 'grow';
  const renderer: RendererProps = { model: visible, activeId, selected, onHover, onSelect };
  const stageElement = empty
    ? <div className="viz-state" role="status"><Crosshair size={18} /><strong>All series are hidden</strong><span>Turn a series back on in the legend.</span></div>
    : <AnimatePresence initial={false}>
      <motion.div key={mode} className="viz-stage-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .32 }}>
        <Suspense fallback={<div className="viz-state" role="status" aria-label="Loading renderer"><Skeleton width="68%" label="Loading renderer" /><Skeleton width="86%" label="Loading renderer" /></div>}>
          {mode === '3d'
            ? <StageBoundary onFailure={onFailure}><ThreeDChartRenderer {...renderer} chartId={id} entry={entry} fullscreen={fullscreen} handle={stage} onFailure={onFailure} /></StageBoundary>
            : <Memo2D {...renderer} />}
        </Suspense>
      </motion.div>
    </AnimatePresence>;

  if (compact) return <div className="viz-compact" ref={root} style={{ height }} role="img" aria-label={summarize(visible)} data-mode={mode} data-chart={id}>{stageElement}<InteractiveTooltip content={tooltip} point={pointer} /></div>;

  return <div ref={root} className="viz-body" data-mode={mode} data-chart={id}>
    <header className="viz-header">
      <div className="viz-titles"><h3>{model.title}</h3>{model.description && <p>{model.description}</p>}</div>
      <Chip tone={model.provenance.kind === 'measured' ? 'mint' : model.provenance.kind === 'demo' ? 'amber' : 'violet'}><span title={model.provenance.source}>{provenanceLabel[model.provenance.kind]}</span></Chip>
    </header>
    <VisualizationToolbar chartId={id} mode={mode} stage={stage} table={table} setTable={setTable} onExport={run} onFullscreen={toggleFullscreen} fullscreen={fullscreen} followsGlobal={resolved.source !== 'override'} onFollow={() => setOverride(id, null)} />
    {(failure || resolved.source === 'fallback') && <p className="viz-notice" role="status"><Info size={12} />Showing 2D. {failure ?? resolved.reason}</p>}
    {exportError && <p className="viz-notice warn" role="alert"><AlertTriangle size={12} />Export failed. {exportError}</p>}
    {warnings?.map(warning => <p key={warning} className="viz-notice warn" role="status"><AlertTriangle size={12} />{warning}</p>)}
    {table
      ? <DataTableView model={visible} />
      : <div className="viz-stage" style={{ height }} tabIndex={0} role="group" aria-roledescription={mode === '3d' ? 'interactive 3D chart' : 'interactive chart'} aria-label={summarize(visible)} aria-describedby={instructions} onKeyDown={onKeyDown}>
        {stageElement}
      </div>}
    <span id={instructions} className="sr-only">Arrow keys move between data points. Enter selects. Escape clears.{mode === '3d' ? ' Shift plus arrow keys orbit the camera. Plus and minus zoom. Zero resets. F focuses the current point.' : ''} The data table button lists every value.</span>
    <div className="viz-footer">
      <ChartLegend model={model} hidden={hidden} onToggle={toggleHidden} />
      {mode === '3d' && !table && <div className="viz-encodings" aria-label="What each visual channel means">{Object.entries(channels).map(([channel, meaning]) => <span key={channel} className={/not data/.test(meaning) ? 'not-data' : ''}><b>{channel}</b> {meaning}</span>)}</div>}
    </div>
    <div className="viz-readout" aria-live="polite" data-testid="viz-readout">
      {readout ? <><Check size={11} className="cyan" /><strong>{readout.title}</strong>{readout.rows.map(row => <span key={row.label}>{row.label} <b className="mono">{row.value}</b></span>)}
        {readout.source && <button type="button" className="viz-source" onClick={() => readoutId && onDatumActivate?.(readoutId, readout.source)}>{sourceText(readout.source)}<MoveUpRight size={10} /></button>}
        {selectedList.length > 0 && <button type="button" className="viz-clear" onClick={() => { clear(selectionGroup); setFocusIndex(null); }}>Clear</button>}
      </> : <span className="viz-hint">{mode === '3d' ? <>Drag to orbit · <Kbd>Ctrl</Kbd> + scroll to zoom · click to select</> : 'Hover for values · click to select'}</span>}
    </div>
    <InteractiveTooltip content={tooltip} point={pointer} />
  </div>;
}

/** VisualizationContainer: the one way any chart in the app is rendered. It owns state, so a mode switch cannot lose it. */
export function VisualizationContainer({ id, state, title, height = 280, compact = false, featured = false, selectionGroup, onDatumActivate, className = '' }: { id: string; state: VizState; title?: string; height?: number; compact?: boolean; featured?: boolean; selectionGroup?: string; onDatumActivate?: (id: string, source?: SourceRef) => void; className?: string }) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [table, setTable] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  /** Off-screen charts do not initialize a renderer until they first come near the viewport. */
  const inView = useInView(host, { once: true, margin: '240px' });
  useEffect(() => {
    const element = dialog.current;
    if (!element?.showModal) return;
    if (fullscreen && !element.open) element.showModal();
    if (!fullscreen && element.open) element.close();
  }, [fullscreen]);
  const toggleHidden = useCallback((item: string) => setHidden(current => {
    const next = new Set(current);
    if (next.has(item)) next.delete(item); else next.add(item);
    return next;
  }), []);
  const toggleFullscreen = useCallback(() => setFullscreen(value => !value), []);
  const ready = state.status === 'ready';
  const emptyModel = ready && isEmptyModel(state.model);

  if (compact) return <div ref={host} data-viz-card={id} className={`viz-host ${className}`}>{ready && inView && !emptyModel ? <VizBody id={id} model={state.model} height={height} fullscreen={false} compact selectionGroup={selectionGroup ?? id} hidden={hidden} toggleHidden={toggleHidden} toggleFullscreen={toggleFullscreen} table={false} setTable={setTable} /> : <div style={{ height }} />}</div>;

  const frame = <div ref={host} data-viz-card={id} className={`card viz-card ${featured ? 'featured' : className}`}>
    {!ready || emptyModel
      ? <><header className="viz-header"><div className="viz-titles"><h3>{ready ? state.model.title : title ?? 'Chart'}</h3></div></header><StateView state={ready ? { status: 'empty', message: 'The source record contains no values for this chart.' } : state as Exclude<VizState, { status: 'ready' }>} height={height} /></>
      : inView
        ? fullscreen
          ? <div className="viz-state" style={{ height: height + 128 }} role="status"><Maximize2 size={18} /><strong>Open in analysis mode</strong></div>
          : <VizBody id={id} model={state.model} height={height} fullscreen={false} compact={false} selectionGroup={selectionGroup ?? id} warnings={state.warnings} hidden={hidden} toggleHidden={toggleHidden} toggleFullscreen={toggleFullscreen} table={table} setTable={setTable} onDatumActivate={onDatumActivate} />
        : <div style={{ height: height + 128 }} />}
    {ready && <dialog ref={dialog} className="viz-dialog" aria-label={`${state.model.title}, analysis mode`} onClose={() => setFullscreen(false)}>
      {fullscreen && <VizBody id={id} model={state.model} height={Math.max(420, window.innerHeight - 260)} fullscreen compact={false} selectionGroup={selectionGroup ?? id} warnings={state.warnings} hidden={hidden} toggleHidden={toggleHidden} toggleFullscreen={toggleFullscreen} table={table} setTable={setTable} onDatumActivate={onDatumActivate} />}
    </dialog>}
  </div>;
  return featured ? <div className={className}><CornerBrackets>{frame}</CornerBrackets></div> : frame;
}
