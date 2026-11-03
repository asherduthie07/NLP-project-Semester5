import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronRight, ListTree, ScanSearch } from 'lucide-react';
import { Skeleton } from '../../../components/ui';
import { ScrambleText } from '../../../components/fx';
import type { AnalysisSymbol, FileNode } from '../../../data/dashboard';
import { useApi, useResource, useScope } from '../../../data/source';
import type { Destination } from '../../nav';
import { FailureNote, SourceTag, usePageData } from '../common';
import { CodeView, useHighlighted, type CodeViewHandle, type Flash, type GutterBadge, type LineMark } from '../code/CodeView';
import { extractFacts } from '../code/facts';
import { splitLines } from '../code/highlight';
import { PaneDivider, usePaneSizes } from '../code/Panes';
import { ancestry, fileCoverage, symbolAt, symbolsIn } from '../code/symbols';
import { isDocumentable } from '../derive';
import { FileTree } from './FileTree';
import { Inspector, type OpenFile } from './Inspector';
import './explorer.css';

const findFile = (nodes: FileNode[], path: string): FileNode | null => {
  for (const node of nodes) {
    if (node.path === path && node.type === 'file') return node;
    const found = node.children ? findFile(node.children, path) : null;
    if (found) return found;
  }
  return null;
};
const firstFile = (nodes: FileNode[]): string | null => {
  const sorted = [...nodes].sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'file' ? -1 : 1);
  for (const node of sorted) { if (node.type === 'file') return node.path; const found = firstFile(node.children ?? []); if (found) return found; }
  return null;
};

interface HoverCard { symbol: AnalysisSymbol; top: number }

export function ExplorerPage({ item }: { item: Destination }) {
  const api = useApi();
  const scope = useScope() ?? undefined;
  const [params, setParams] = useSearchParams();
  const tree = usePageData('getFileTree', (adapter, current) => adapter.getFileTree(current));
  const analysis = usePageData('getAnalysis', (adapter, current) => adapter.getAnalysis(current));
  const docs = usePageData('getDocs', (adapter, current) => adapter.getDocs(current));
  const [sizes, setSize] = usePaneSizes('explorer', [270, 360]);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverCard | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const code = useRef<CodeViewHandle>(null);
  const codeWrap = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number>(0);
  const pendingLine = useRef<number | null>(null);

  const requestedPath = params.get('path');
  const requestedLine = Number(params.get('line')) || null;
  const requestedSymbol = params.get('symbol');

  /** `?symbol=` from the command palette resolves to its file and line once the analysis has loaded. */
  useEffect(() => {
    if (!requestedSymbol || analysis.status !== 'ready') return;
    const symbol = analysis.data.symbols.find(entry => entry.qualifiedName === requestedSymbol || entry.id === requestedSymbol);
    if (symbol) setParams({ path: symbol.path, line: String(symbol.line) }, { replace: true });
  }, [requestedSymbol, analysis, setParams]);

  const fallbackPath = tree.status === 'ready' ? firstFile(tree.data) : null;
  /** While the analysis loads, a requested symbol is not resolved yet. If it never resolves, the page says so and opens a file. */
  const symbolPending = !!requestedSymbol && analysis.status === 'loading';
  const symbolMissing = !!requestedSymbol && analysis.status !== 'loading';
  const path = symbolPending ? null : requestedPath ?? fallbackPath;
  const treeNode = tree.status === 'ready' && path ? findFile(tree.data, path) : null;
  const fileResource = useResource(path ? `${api.mode}:file:${scope?.snapshotId ?? ''}:${path}` : null, () => api.getFile(path!, scope));
  const file = useMemo<OpenFile | null>(() => fileResource.status === 'ready' ? { path: fileResource.data.path, language: fileResource.data.language, lines: splitLines(fileResource.data.content), sizeBytes: treeNode?.sizeBytes ?? null } : null, [fileResource, treeNode]);
  const highlighted = useHighlighted(fileResource.status === 'ready' ? fileResource.data.content : null, path ?? '', fileResource.status === 'ready' ? fileResource.data.language : null);

  const fileSymbols = useMemo(() => analysis.status === 'ready' && path ? symbolsIn(analysis.data, path) : [], [analysis, path]);
  const coverage = useMemo(() => analysis.status === 'ready' ? fileCoverage(analysis.data) : null, [analysis]);
  const selected = fileSymbols.find(symbol => symbol.id === selectedId) ?? null;
  const declarations = useMemo(() => new Map(fileSymbols.map(symbol => [symbol.line, symbol])), [fileSymbols]);

  /** A requested line selects the innermost symbol there and flashes it, once the file and analysis are in. */
  useEffect(() => {
    if (!file || !requestedLine || pendingLine.current === requestedLine) return;
    if (analysis.status === 'loading') return;
    pendingLine.current = requestedLine;
    const symbol = symbolAt(fileSymbols, requestedLine);
    setSelectedId(symbol?.id ?? null);
    setFlash({ line: requestedLine, endLine: symbol && symbol.line === requestedLine ? Math.min(symbol.endLine, requestedLine + 2) : requestedLine, nonce: Date.now() });
  }, [file, requestedLine, fileSymbols, analysis.status]);

  const openFile = useCallback((next: string) => {
    pendingLine.current = null;
    setSelectedId(null);
    setHover(null);
    setParams({ path: next }, { replace: false });
  }, [setParams]);
  const select = useCallback((symbol: AnalysisSymbol) => {
    setHover(null);
    setSelectedId(symbol.id);
    pendingLine.current = symbol.line;
    setParams({ path: symbol.path, line: String(symbol.line) }, { replace: symbol.path === path });
    setFlash({ line: symbol.line, endLine: symbol.line, nonce: Date.now() });
  }, [setParams, path]);
  const show = useCallback((target: string, line: number, endLine?: number) => {
    if (target !== path) { pendingLine.current = line; setParams({ path: target, line: String(line) }); setSelectedId(null); }
    setFlash({ line, endLine: endLine ?? line, nonce: Date.now() });
  }, [path, setParams]);

  const badges = useMemo(() => new Map<number, GutterBadge>(fileSymbols.filter(symbol => isDocumentable(symbol.kind)).map(symbol => [symbol.line, symbol.documented
    ? { tone: 'mint', short: 'D', label: `${symbol.name} is documented` }
    : { tone: 'coral', short: 'U', label: `${symbol.name} is undocumented` }])), [fileSymbols]);
  const marks = useMemo(() => {
    const map = new Map<number, LineMark>();
    if (selected) for (let line = selected.line; line <= selected.endLine; line += 1) map.set(line, 'focus');
    return map;
  }, [selected]);

  const onPointerLine = useCallback((line: number | null, element: HTMLElement | null) => {
    window.clearTimeout(hoverTimer.current);
    const symbol = line !== null ? declarations.get(line) : undefined;
    if (!symbol || !element || !codeWrap.current) { hoverTimer.current = window.setTimeout(() => setHover(null), 260); return; }
    const top = element.getBoundingClientRect().bottom - codeWrap.current.getBoundingClientRect().top + 4;
    hoverTimer.current = window.setTimeout(() => setHover({ symbol, top }), 280);
  }, [declarations]);
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  const crumbs = selected && analysis.status === 'ready' ? ancestry(analysis.data, selected) : [];
  const style = { '--ex-left': `${sizes[0]}px`, '--ex-right': `${sizes[1]}px` } as CSSProperties;

  return <div className="page-frame explorer" data-testid="explorer-page" data-page="explorer">
    <header className="ex-head">
      <h1 tabIndex={-1}><span className="sr-only">{item.label}, </span><ScrambleText>{path ? path.split('/').pop()! : item.label}</ScrambleText></h1>
      {path && <p className="ex-path mono" data-testid="explorer-path">{path}</p>}
      <SourceTag mode={api.mode} />
    </header>
    {symbolMissing && <p className="page-notice" role="status" data-testid="symbol-missing"><strong>{requestedSymbol}</strong> is not in {analysis.status === 'failed' ? 'any loaded analysis, because the analysis is unavailable' : 'this analysis'}.</p>}
    <div className="ex-panes" style={style}>
      <section className="pane ex-pane-tree" aria-label="Files">
        <div className="pane-head"><h2>Files</h2>{coverage && <span className="ex-legend" aria-hidden="true"><i className="good" />70%+<i className="fair" />40%+<i className="poor" />less</span>}</div>
        <div className="pane-body">
          {tree.status === 'loading' && <div className="pane-note"><Skeleton label="Loading files" /><Skeleton width="70%" label="Loading files" /></div>}
          {tree.status === 'failed' && <FailureNote failure={tree.failure} retry={tree.retry} />}
          {tree.status === 'ready' && <FileTree tree={tree.data} selected={path} onOpen={openFile} coverage={coverage} />}
        </div>
      </section>
      <PaneDivider label="Resize the file tree" value={sizes[0]} min={180} max={480} onChange={value => setSize(0, value)} testId="divider-left" />
      <section className="pane ex-pane-code" aria-label="Source">
        <div className="pane-head ex-code-head">
          <nav aria-label="Symbol breadcrumb" className="ex-crumbs" data-testid="breadcrumb">
            {path?.split('/').map((part, index, parts) => <span key={index} className={index === parts.length - 1 && !crumbs.length ? 'current' : ''}>{part}{(index < parts.length - 1 || crumbs.length > 0) && <ChevronRight size={11} aria-hidden="true" />}</span>)}
            {crumbs.map((symbol, index) => <span key={symbol.id} className={index === crumbs.length - 1 ? 'current' : ''}><button type="button" className="ex-crumb" onClick={() => select(symbol)}>{symbol.name}</button>{index < crumbs.length - 1 && <ChevronRight size={11} aria-hidden="true" />}</span>)}
          </nav>
          {!!fileSymbols.length && <div className="ex-outline">
            <button type="button" className="ex-outline-button" aria-expanded={outlineOpen} aria-haspopup="true" data-testid="outline-button" onClick={() => setOutlineOpen(value => !value)}><ListTree size={13} aria-hidden="true" />Outline <span className="ex-fine">{fileSymbols.length}</span></button>
            {outlineOpen && <div className="ex-outline-menu" role="menu" aria-label="Symbols in this file" data-testid="outline-menu" onKeyDown={event => {
              if (event.key === 'Escape') { setOutlineOpen(false); (event.currentTarget.previousElementSibling as HTMLElement | null)?.focus(); }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
                const at = items.indexOf(document.activeElement as HTMLElement);
                items[(at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
              }
            }}>
              {fileSymbols.map((symbol, index) => <button key={symbol.id} type="button" role="menuitem" autoFocus={index === 0} className={symbol.parentId && fileSymbols.some(other => other.id === symbol.parentId) ? 'nested' : ''} onClick={() => { setOutlineOpen(false); select(symbol); }}>
                <span className={`ex-doc-dot ${symbol.documented ? 'good' : 'poor'}`} aria-hidden="true" />{symbol.name}<span className="ex-fine">{symbol.line}</span>
              </button>)}
            </div>}
          </div>}
        </div>
        <div ref={codeWrap} className="ex-code-wrap">
          {!path && tree.status === 'ready' && <p className="pane-note">This snapshot has no files.</p>}
          {path && fileResource.status === 'loading' && <div className="pane-note"><Skeleton label="Loading source" /><Skeleton width="80%" label="Loading source" /><Skeleton width="60%" label="Loading source" /></div>}
          {fileResource.status === 'failed' && <FailureNote failure={fileResource.failure} retry={fileResource.retry} />}
          {highlighted && <CodeView ref={code} lines={highlighted} label={`Source of ${path}`} badges={badges} marks={marks} flash={flash} onPointerLine={analysis.status === 'ready' ? onPointerLine : undefined} onScroll={() => setHover(null)} testId="code-view" />}
          {hover && file && <ExplanationCard card={hover} file={file} explanation={docs.status === 'ready' ? docs.data.documents.find(document => document.id === hover.symbol.id)?.summary ?? null : null} demo={api.mode === 'demo'}
            onKeep={() => window.clearTimeout(hoverTimer.current)} onLeave={() => { hoverTimer.current = window.setTimeout(() => setHover(null), 200); }} onInspect={() => select(hover.symbol)} />}
        </div>
      </section>
      <PaneDivider label="Resize the inspector" value={sizes[1]} min={280} max={560} invert onChange={value => setSize(1, value)} testId="divider-right" />
      <section className="pane ex-pane-inspector" aria-label="Inspector">
        <div className="pane-head"><h2>Inspector</h2><span className="pane-eyebrow">{selected ? selected.kind : 'File'}</span></div>
        <div className="pane-body">
          <Inspector mode={api.mode} analysis={analysis} docs={docs} file={file} symbol={selected} fileSymbols={fileSymbols} show={show} select={select} />
        </div>
      </section>
    </div>
  </div>;
}

function ExplanationCard({ card, file, explanation, demo, onKeep, onLeave, onInspect }: { card: HoverCard; file: OpenFile; explanation: string | null; demo: boolean; onKeep: () => void; onLeave: () => void; onInspect: () => void }) {
  const { symbol } = card;
  const facts = useMemo(() => extractFacts(file.lines, symbol.line, symbol.endLine, file.language), [file, symbol]);
  return <div className="ex-hover-card" role="tooltip" data-testid="hover-card" style={{ top: card.top }} onPointerEnter={onKeep} onPointerLeave={onLeave}>
    <header><span className="ex-kind">{symbol.kind}</span><strong>{symbol.name}</strong>{symbol.documented ? <span className="status-chip mint">Documented</span> : <span className="status-chip coral">Undocumented</span>}</header>
    <code className="ex-hover-sig">{facts.declaration?.text ?? symbol.name}</code>
    {facts.docstring && <p className="ex-hover-doc"><span className="ex-fine">Docstring</span> {facts.docstring.text}</p>}
    {explanation ? <p className="ex-hover-doc"><span className="ex-fine">{demo ? 'Demo explanation, illustrative' : 'Explanation'}</span> {explanation}</p> : !demo && <p className="ex-fine">AI explanations are integration pending. The facts above are read from the source.</p>}
    <p className="ex-fine">{facts.params.length} parameter{facts.params.length === 1 ? '' : 's'}, {facts.returns.length} return statement{facts.returns.length === 1 ? '' : 's'}, lines {symbol.line} to {symbol.endLine}</p>
    <button type="button" className="text-link" onClick={onInspect}><ScanSearch size={12} aria-hidden="true" /> Open in the inspector</button>
  </div>;
}
