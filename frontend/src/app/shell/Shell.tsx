import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Kbd } from '../../components/ui';
import { NoiseOverlay } from '../../components/fx';
import { durations, easeOutExpo } from '../../design/motion';
import { useMotionPreference } from '../../lib/motion';
import { useApi, useDataStore, useResource } from '../../data/source';
import { useResolvedMode } from '../../viz/store';
import { detectWebGL } from '../../viz/capability';
import { destinationAt, destinations } from '../nav';
import { useShellStore } from '../store';
import { CommandPalette } from './CommandPalette';
import { Rail } from './Rail';
import { isMac, TopBar } from './TopBar';
import '../shell.css';

/** Grid, drifting glow and grain. The layer moves slower than page content, on transform only. */
function Atmosphere() {
  const layer = useRef<HTMLDivElement>(null);
  const reduced = useMotionPreference();
  useEffect(() => {
    if (reduced) { if (layer.current) layer.current.style.transform = ''; return; }
    let frame = 0, target = 0;
    const apply = () => { frame = 0; if (layer.current) layer.current.style.transform = `translate3d(0, ${(target * -.06).toFixed(1)}px, 0)`; };
    const onScroll = (event: Event) => {
      const element = event.target as HTMLElement;
      if (!element.matches?.('[data-page-scroll]')) return;
      target = element.scrollTop;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => { document.removeEventListener('scroll', onScroll, { capture: true }); cancelAnimationFrame(frame); };
  }, [reduced]);
  return <div className="app-world" aria-hidden="true" data-testid="atmosphere">
    <div className="app-world-layer" ref={layer}><div className="app-grid" /><div className="app-orb one" /><div className="app-orb two" /><div className="app-orb three" /></div>
    <NoiseOverlay />
  </div>;
}

const SEQUENCE_MS = 1100;
const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
/** Chart stages own their single-key commands, such as F, 0, + and -, while focused. */
const inChart = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest('.viz-stage');

function useGlobalShortcuts() {
  const navigate = useNavigate();
  /** Outlives the listener, which is replaced whenever navigate changes, so a pending G is not dropped mid-sequence. */
  const pending = useRef(0);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      /** Timed from when each key was pressed, not when it was handled, so a busy main thread cannot break a sequence. */
      const pendingG = pending.current;
      const state = useShellStore.getState();
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') { event.preventDefault(); state.setPaletteOpen(!state.paletteOpen); return; }
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target) || inChart(event.target)) return;
      if (state.paletteOpen || !state.singleKeyShortcuts) return;
      if (event.key === '?') { event.preventDefault(); state.setShortcutsOpen(!state.shortcutsOpen); return; }
      if (state.shortcutsOpen) return;
      if (event.key === '/') { event.preventDefault(); state.setPaletteOpen(true); return; }
      if (event.key === '[') { event.preventDefault(); state.setPinned(!state.pinned); return; }
      if (pendingG && event.timeStamp - pendingG < SEQUENCE_MS) {
        pending.current = 0;
        const destination = destinations.find(item => item.key === event.key.toLowerCase());
        if (destination) { event.preventDefault(); navigate(destination.path); }
        return;
      }
      pending.current = event.key.toLowerCase() === 'g' ? event.timeStamp : 0;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
}

/** Modal focus handling shared by the shortcuts overlay and the navigation drawer. */
function useModalFocus(open: boolean, panel: React.RefObject<HTMLElement>) {
  const previous = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      previous.current = document.activeElement as HTMLElement | null;
      panel.current?.querySelector<HTMLElement>('button, a[href]')?.focus();
      return;
    }
    if (previous.current?.isConnected) previous.current.focus();
    previous.current = null;
  }, [open, panel]);
  return (event: ReactKeyboardEvent) => {
    if (event.key !== 'Tab' || !panel.current) return;
    const focusable = [...panel.current.querySelectorAll<HTMLElement>('button, a[href]')];
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
}

export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: [isMac ? '⌘' : 'Ctrl', 'K'], label: 'Open the command palette' },
  { keys: ['/'], label: 'Open search' },
  { keys: ['?'], label: 'Show this list' },
  { keys: ['['], label: 'Pin or unpin the sidebar' },
  ...destinations.map(item => ({ keys: ['G', item.key.toUpperCase()], label: `Go to ${item.label}` })),
  { keys: ['Esc'], label: 'Close the open dialog or menu' },
];
export const CHART_SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['←', '→'], label: 'Move between data points' },
  { keys: ['Enter'], label: 'Select a data point' },
  { keys: ['Esc'], label: 'Clear the selection' },
  { keys: ['Shift', '←', '→'], label: 'Orbit the camera in 3D' },
  { keys: ['+', '-'], label: 'Zoom in 3D' },
  { keys: ['0'], label: 'Reset the camera in 3D' },
  { keys: ['F'], label: 'Frame the focused data point in 3D' },
];

function ShortcutsOverlay() {
  const open = useShellStore(state => state.shortcutsOpen);
  const setOpen = useShellStore(state => state.setShortcutsOpen);
  const panel = useRef<HTMLDivElement>(null);
  const trap = useModalFocus(open, panel);
  return <AnimatePresence>
    {open && <motion.div className="palette-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: durations.feedback * 1.5 }} onPointerDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <motion.div ref={panel} className="shortcuts" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" data-testid="shortcuts" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: .2, ease: easeOutExpo }} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } trap(event); }}>
        <div className="shortcuts-head"><h2>Keyboard shortcuts</h2><button type="button" className="icon-button" aria-label="Close shortcuts" onClick={() => setOpen(false)}><X size={15} /></button></div>
        <div className="shortcuts-columns">
          <dl>{SHORTCUTS.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.keys.map(key => <Kbd key={key}>{key}</Kbd>)}</dd></div>)}</dl>
          <dl><div className="shortcuts-heading"><dt>In a focused chart</dt></div>{CHART_SHORTCUTS.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.keys.map(key => <Kbd key={key}>{key}</Kbd>)}</dd></div>)}</dl>
        </div>
      </motion.div>
    </motion.div>}
  </AnimatePresence>;
}

function NavigationDrawer() {
  const open = useShellStore(state => state.drawerOpen);
  const setOpen = useShellStore(state => state.setDrawerOpen);
  const panel = useRef<HTMLDivElement>(null);
  const trap = useModalFocus(open, panel);
  return <AnimatePresence>
    {open && <motion.div className="drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: durations.feedback * 1.5 }} onPointerDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <motion.div ref={panel} className="drawer" role="dialog" aria-modal="true" aria-label="Navigation" initial={{ x: -260 }} animate={{ x: 0 }} exit={{ x: -260 }} transition={{ duration: .24, ease: easeOutExpo }} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } trap(event); }}>
        <Rail variant="drawer" />
      </motion.div>
    </motion.div>}
  </AnimatePresence>;
}

function StatusStrip() {
  const { pathname } = useLocation();
  const mode = useDataStore(state => state.mode);
  const viz = useResolvedMode();
  const destination = destinationAt(pathname);
  return <footer className="status-strip" data-testid="status-strip" aria-label="Session status">
    <span>{pathname}</span>
    <span className={mode === 'demo' ? 'amber' : 'mint'}>{mode === 'demo' ? 'Demo data, illustrative' : 'Live backend'}</span>
    <span>Charts {viz.mode.toUpperCase()}, {viz.source}</span>
    <span>GPU {detectWebGL().tier}</span>
    {destination?.milestone && <span className="status-strip-end">Page pending, {destination.milestone}</span>}
  </footer>;
}

/** Keeps a real repository selected for the current mode, and clears the selection when the source has none. */
function useRepositories() {
  const api = useApi();
  const repositories = useResource(api.mode, () => api.getRepositories());
  const repositoryId = useDataStore(state => state.repositoryId);
  const select = useDataStore(state => state.selectRepository);
  useEffect(() => {
    if (repositories.status === 'loading') return;
    if (repositories.status === 'failed') { if (repositoryId) select(null, null); return; }
    if (!repositories.data.length) { if (repositoryId) select(null, null); return; }
    if (!repositories.data.some(item => item.id === repositoryId)) select(repositories.data[0].id, repositories.data[0].latestSnapshotId);
  }, [repositories, repositoryId, select]);
  return repositories;
}

const EXIT_MS = 260;
interface Layer { path: string; node: ReactNode; seq: number }
const makeInert = (element: HTMLElement | null) => element?.setAttribute('inert', '');

/**
 * Crossfades routes. The outgoing page is removed by a timer rather than by an exit-animation callback, because a page
 * that suspends while exiting can lose that callback and stay in the DOM, invisible but still read by screen readers.
 */
function PageLayers({ path, outlet, reduced }: { path: string; outlet: ReactNode; reduced: boolean }) {
  const [shown, setShown] = useState<Layer>({ path, node: outlet, seq: 0 });
  const [leaving, setLeaving] = useState<Layer | null>(null);
  if (shown.path !== path) {
    setLeaving(reduced ? null : shown);
    setShown({ path, node: outlet, seq: shown.seq + 1 });
  }
  useEffect(() => {
    if (!leaving) return;
    const handle = window.setTimeout(() => setLeaving(null), EXIT_MS);
    return () => window.clearTimeout(handle);
  }, [leaving]);
  const shift = reduced ? 0 : 1;
  return <>
    {leaving && <motion.div key={leaving.seq} ref={makeInert} className="page-layer leaving" aria-hidden="true" data-testid="page-layer" initial={{ opacity: 1, y: 0 }} animate={{ opacity: 0, y: -6 * shift }} transition={{ duration: EXIT_MS / 1000, ease: easeOutExpo }}>{leaving.node}</motion.div>}
    <motion.div key={shown.seq} className="page-layer" data-page-scroll="" data-page-current="" data-testid="page-layer" initial={shown.seq ? { opacity: 0, y: 10 * shift } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .26, ease: easeOutExpo }}>{outlet}</motion.div>
  </>;
}

export function Shell() {
  const location = useLocation();
  const outlet = useOutlet();
  const reduced = useMotionPreference();
  const pinned = useShellStore(state => state.pinned);
  const repositories = useRepositories();
  const main = useRef<HTMLElement>(null);
  const shownPath = useRef(location.pathname);
  const destination = destinationAt(location.pathname);
  useGlobalShortcuts();

  /** Route changes move focus to the new heading and announce the page, as a full navigation would. */
  useEffect(() => {
    document.title = `${destination?.label ?? 'Not found'} | CodeAtlas AI`;
    if (shownPath.current === location.pathname) return;
    shownPath.current = location.pathname;
    const handle = window.setTimeout(() => {
      /** The outgoing page is still fading at this point, and the incoming one is last in the DOM. */
      const headings = main.current?.querySelectorAll<HTMLElement>('[data-page-current] h1');
      headings?.[headings.length - 1]?.focus({ preventScroll: true });
    }, reduced ? 0 : 60);
    return () => window.clearTimeout(handle);
  }, [location.pathname, destination, reduced]);

  return <div className={`shell ${pinned ? 'pinned' : ''}`} data-testid="shell">
    <a href="#app-main" className="skip-link" onClick={event => { event.preventDefault(); main.current?.querySelector<HTMLElement>('[data-page-current] h1')?.focus(); }}>Skip to content</a>
    <Atmosphere />
    <Rail />
    <div className="shell-column">
      <TopBar repositories={repositories} />
      <main id="app-main" ref={main} className="shell-main">
        <PageLayers path={location.pathname} outlet={outlet} reduced={reduced} />
      </main>
      <StatusStrip />
    </div>
    <NavigationDrawer />
    <CommandPalette repositories={repositories.status === 'ready' ? repositories.data : []} />
    <ShortcutsOverlay />
    <div className="sr-only" role="status" aria-live="polite" data-testid="route-announcer">{destination ? `${destination.label} page` : 'Page not found'}</div>
  </div>;
}

export function NotFoundPage() {
  const { pathname } = useLocation();
  return <div className="page-pad"><header className="page-head"><h1 tabIndex={-1}>Page not found</h1><p>{pathname} is not part of the dashboard. <Link to="/app/overview" className="text-link">Go to Overview</Link></p></header></div>;
}
