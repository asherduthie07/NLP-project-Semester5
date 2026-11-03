import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Command } from 'cmdk';
import { Box, Braces, CircleAlert, DatabaseZap, FileCode2, FlaskConical, FolderGit2, Keyboard, Palette, PanelLeft, RefreshCw, Search, Square, type LucideIcon } from 'lucide-react';
import { Kbd, Skeleton } from '../../components/ui';
import { durations, easeOutExpo } from '../../design/motion';
import { useApi, useDataStore, useResource, useScope } from '../../data/source';
import type { Repository, SearchFile, SearchSection, SearchSymbol } from '../../data/dashboard';
import { useVizStore } from '../../viz/store';
import { fuzzyMatch, highlightParts } from '../fuzzy';
import { destinations } from '../nav';
import { useShellStore } from '../store';

const PER_GROUP = 8;

interface Entry { id: string; title: string; detail?: string; icon: LucideIcon; run: () => void; keywords?: string; hint?: ReactNode; testId?: string }
interface Scored extends Entry { score: number; indices: number[] }

function rank(query: string, entries: Entry[], limit: number): Scored[] {
  const scored: Scored[] = [];
  for (const entry of entries) {
    const onTitle = fuzzyMatch(query, entry.title);
    if (onTitle) { scored.push({ ...entry, score: onTitle.score + 5, indices: onTitle.indices }); continue; }
    /** Descriptions only match as written, because scattered letters across a sentence are noise. */
    const needle = query.trim().toLowerCase();
    if (needle && `${entry.detail ?? ''} ${entry.keywords ?? ''}`.toLowerCase().includes(needle)) scored.push({ ...entry, score: 30, indices: [] });
  }
  return (query.trim() ? scored.sort((a, b) => b.score - a.score) : scored).slice(0, limit);
}

function Highlight({ text, indices }: { text: string; indices: number[] }) {
  return <>{highlightParts(text, indices).map((part, index) => part.match ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>)}</>;
}

function Row({ entry, order }: { entry: Scored; order: number }) {
  const Icon = entry.icon;
  return <Command.Item value={entry.id} onSelect={entry.run} data-testid={entry.testId} style={{ animationDelay: `${Math.min(order, 8) * 18}ms` }}>
    <Icon size={15} aria-hidden="true" />
    <span className="palette-row-text"><span className="palette-title"><Highlight text={entry.title} indices={entry.indices} /></span>{entry.detail && <small>{entry.detail}</small>}</span>
    {entry.hint}
  </Command.Item>;
}

function Unavailable({ title, reason, testId, onRetry }: { title: string; reason: string; testId: string; onRetry?: () => void }) {
  return <div className="palette-unavailable" data-testid={testId}><CircleAlert size={14} aria-hidden="true" /><div><strong>{title}</strong><p>{reason}</p></div>{onRetry && <button type="button" className="icon-button small" aria-label="Retry search" onClick={onRetry}><RefreshCw size={12} /></button>}</div>;
}

const sectionItems = <T,>(section: SearchSection<T> | undefined): T[] => section?.status === 'ok' ? section.items : [];

export function CommandPalette({ repositories }: { repositories: Repository[] }) {
  const open = useShellStore(state => state.paletteOpen);
  const setOpen = useShellStore(state => state.setPaletteOpen);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const deferred = useDeferredValue(query);
  const navigate = useNavigate();
  const api = useApi();
  const scope = useScope();
  const panel = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const index = useResource(open && scope ? `${api.mode}:${scope.snapshotId}:${scope.jobId ?? ''}` : null, () => api.getSearchIndex(scope!));

  /** The input takes focus during the commit that opens the palette, so the origin has to be tracked before that. */
  useEffect(() => {
    const track = (event: FocusEvent) => { if (event.target instanceof HTMLElement && !event.target.closest('[data-testid=command-palette]')) returnFocus.current = event.target; };
    document.addEventListener('focusin', track);
    return () => document.removeEventListener('focusin', track);
  }, []);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) { wasOpen.current = true; setQuery(''); return; }
    if (wasOpen.current && returnFocus.current?.isConnected) returnFocus.current.focus();
    wasOpen.current = false;
  }, [open]);

  const close = () => setOpen(false);
  const go = (path: string) => { close(); navigate(path); };
  const setGlobalMode = useVizStore(state => state.setGlobalMode);
  const dataMode = useDataStore(state => state.mode);
  const setDataMode = useDataStore(state => state.setMode);
  const selectRepository = useDataStore(state => state.selectRepository);
  const pinned = useShellStore(state => state.pinned);
  const setPinned = useShellStore(state => state.setPinned);
  const setShortcutsOpen = useShellStore(state => state.setShortcutsOpen);

  const pages: Entry[] = destinations.map(item => ({ id: `page:${item.id}`, title: item.label, detail: item.milestone ? `Pending, ${item.milestone}` : item.summary, icon: item.icon, run: () => go(item.path), hint: <span className="palette-keys" aria-hidden="true"><Kbd>G</Kbd><Kbd>{item.key.toUpperCase()}</Kbd></span> }));
  const actions: Entry[] = [
    { id: 'action:3d', title: 'Show all charts in 3D', icon: Box, keywords: 'visualization mode switch', run: () => { setGlobalMode('3d'); close(); } },
    { id: 'action:2d', title: 'Show all charts in 2D', icon: Square, keywords: 'visualization mode switch flat', run: () => { setGlobalMode('2d'); close(); } },
    { id: 'action:data', title: dataMode === 'demo' ? 'Switch to the Live backend' : 'Switch to Demo data', icon: dataMode === 'demo' ? DatabaseZap : FlaskConical, keywords: 'data source mode demo live', run: () => { setDataMode(dataMode === 'demo' ? 'live' : 'demo'); close(); } },
    { id: 'action:pin', title: pinned ? 'Unpin the sidebar' : 'Pin the sidebar open', icon: PanelLeft, keywords: 'rail navigation', run: () => { setPinned(!pinned); close(); } },
    { id: 'action:keys', title: 'Show keyboard shortcuts', icon: Keyboard, keywords: 'help', run: () => { close(); setShortcutsOpen(true); } },
    { id: 'action:design', title: 'Open the design system', icon: Palette, keywords: 'components showcase tokens', run: () => go('/design-system') },
  ];
  const repos: Entry[] = repositories.map(repository => ({ id: `repo:${repository.id}`, title: repository.name, detail: repository.origin ?? repository.sourceKind, icon: FolderGit2, keywords: 'repository switch', run: () => { selectRepository(repository.id, repository.latestSnapshotId); close(); } }));

  const data = index.status === 'ready' ? index.data : null;
  const fileEntries = useMemo<Entry[]>(() => sectionItems<SearchFile>(data?.files).map(file => ({ id: `file:${file.id}`, title: file.path, detail: file.language ?? undefined, icon: FileCode2, run: () => undefined })), [data]);
  const symbolEntries = useMemo<Entry[]>(() => sectionItems<SearchSymbol>(data?.symbols).map(symbol => ({ id: `symbol:${symbol.id}`, title: symbol.name, detail: `${symbol.symbolKind} · ${symbol.qualifiedName}`, icon: Braces, run: () => undefined })), [data]);
  const searching = deferred.trim().length > 0;

  const groups = useMemo(() => {
    const files = searching ? rank(deferred, fileEntries, PER_GROUP) : [];
    const symbols = searching ? rank(deferred, symbolEntries, PER_GROUP) : [];
    return { files, symbols };
  }, [deferred, searching, fileEntries, symbolEntries]);
  const pageRows = rank(deferred, pages, 9);
  const actionRows = rank(deferred, actions, 6);
  const repoRows = rank(deferred, repos, 5);
  const fileRows = groups.files.map(entry => ({ ...entry, run: () => go(`/app/explorer?path=${encodeURIComponent(entry.title)}`) }));
  const symbolRows = groups.symbols.map(entry => ({ ...entry, run: () => go(`/app/explorer?symbol=${encodeURIComponent(entry.detail?.split(' · ')[1] ?? entry.title)}`) }));
  const total = pageRows.length + actionRows.length + repoRows.length + fileRows.length + symbolRows.length;

  function trap(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key !== 'Tab' || !panel.current) return;
    const focusable = [...panel.current.querySelectorAll<HTMLElement>('input, button')];
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  /** cmdk picks its first row before these results render, so Enter could open a stale row. The selection follows the results here. */
  const firstRow = pageRows[0]?.id ?? actionRows[0]?.id ?? repoRows[0]?.id ?? fileRows[0]?.id ?? symbolRows[0]?.id ?? '';
  const topResult = deferred.trim() ? `${deferred}|${firstRow}` : firstRow;
  useEffect(() => { setSelected(firstRow); }, [topResult]); // eslint-disable-line react-hooks/exhaustive-deps

  let order = 0;
  const rows = (entries: Scored[]) => entries.map(entry => <Row key={entry.id} entry={entry} order={order++} />);

  return <AnimatePresence>
    {open && <motion.div key="palette" className="palette-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: durations.feedback * 1.5 }} onPointerDown={event => { if (event.target === event.currentTarget) close(); }}>
      <motion.div ref={panel} className="palette" role="dialog" aria-modal="true" aria-label="Command palette" data-testid="command-palette" initial={{ opacity: 0, y: -14, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: .99 }} transition={{ duration: .2, ease: easeOutExpo }} onKeyDown={trap}>
        <Command shouldFilter={false} loop label="Command palette" value={selected} onValueChange={setSelected}>
          <div className="palette-input"><Search size={16} aria-hidden="true" /><Command.Input autoFocus value={query} onValueChange={setQuery} placeholder="Search pages, actions, repositories, files and symbols" /><Kbd>Esc</Kbd></div>
          <Command.List className="palette-list">
            {total === 0 && <div className="palette-empty" data-testid="palette-empty" role="status">No results for “{deferred}”{data?.symbols.status === 'unavailable' ? '. Symbols were not searched.' : ''}</div>}
            {pageRows.length > 0 && <Command.Group heading="Pages">{rows(pageRows)}</Command.Group>}
            {actionRows.length > 0 && <Command.Group heading="Actions">{rows(actionRows)}</Command.Group>}
            {repoRows.length > 0 && <Command.Group heading="Repositories">{rows(repoRows)}</Command.Group>}
            {searching && fileRows.length > 0 && <Command.Group heading={`Files${data?.files.status === 'ok' && data.files.note ? `, ${data.files.note}` : ''}`}>{rows(fileRows)}</Command.Group>}
            {searching && symbolRows.length > 0 && <Command.Group heading={`Symbols${data?.symbols.status === 'ok' && data.symbols.note ? `, ${data.symbols.note}` : ''}`}>{rows(symbolRows)}</Command.Group>}
            {searching && scope && index.status === 'loading' && <div className="palette-loading" role="status" aria-label="Searching repository records"><Skeleton width="70%" label="Searching repository records" /><Skeleton width="52%" label="Searching repository records" /></div>}
            {searching && index.status === 'failed' && <Unavailable testId="palette-index-failed" title={`File and symbol search unavailable. ${index.failure.title}.`} reason={index.failure.message} onRetry={index.failure.retryable ? index.retry : undefined} />}
            {searching && !scope && <Unavailable testId="palette-no-scope" title="File and symbol search unavailable" reason="No repository is selected, so only pages and actions were searched." />}
            {searching && data?.symbols.status === 'unavailable' && <Unavailable testId="palette-symbols-unavailable" title="Symbols not searched" reason={data.symbols.reason} />}
            {searching && data?.files.status === 'unavailable' && <Unavailable testId="palette-files-unavailable" title="Files not searched" reason={data.files.reason} />}
          </Command.List>
          <div className="palette-footer"><span><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span><span><Kbd>↵</Kbd> open</span><span className={`palette-source ${api.mode}`}>{api.mode === 'demo' ? 'Demo data, illustrative' : 'Live backend'}</span></div>
        </Command>
      </motion.div>
    </motion.div>}
  </AnimatePresence>;
}
