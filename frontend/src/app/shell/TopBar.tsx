import { Link } from 'react-router-dom';
import { Bell, ChevronDown, CircleAlert, CircleCheck, CircleUser, DatabaseZap, FlaskConical, GitBranch, GitCommitHorizontal, History, Info, LoaderCircle, Menu as MenuIcon, RefreshCw, Search, TriangleAlert, type LucideIcon } from 'lucide-react';
import { Kbd } from '../../components/ui';
import { useApi, useDataStore, useResource, useScope } from '../../data/source';
import type { AnalysisState, DataMode, Repository, ShellNotification, SnapshotInfo } from '../../data/dashboard';
import { ModeSwitch } from '../../viz/components/VisualizationContainer';
import { useShellStore } from '../store';
import { MenuItem, MenuNote, Popover } from './Menu';
import type { Resource } from '../../data/source';

const short = (commit: string | null) => commit ? commit.slice(0, 7) : null;
export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

function RepositoryMenu({ repositories }: { repositories: Resource<Repository[]> }) {
  const repositoryId = useDataStore(state => state.repositoryId);
  const select = useDataStore(state => state.selectRepository);
  const mode = useDataStore(state => state.mode);
  if (repositories.status === 'loading') return <span className="repo-switcher placeholder" role="status"><LoaderCircle size={14} className="spin" aria-hidden="true" />Loading repositories</span>;
  if (repositories.status === 'failed') return <span className="repo-switcher failed" role="alert"><CircleAlert size={14} aria-hidden="true" /><span>{repositories.failure.title}</span>{repositories.failure.retryable && <button type="button" className="icon-button small" aria-label="Retry loading repositories" onClick={repositories.retry}><RefreshCw size={12} /></button>}</span>;
  if (!repositories.data.length) return <span className="repo-switcher placeholder" role="status"><DatabaseZap size={14} aria-hidden="true" />{mode === 'live' ? 'No repositories imported' : 'No repositories'}</span>;
  const current = repositories.data.find(item => item.id === repositoryId) ?? repositories.data[0];
  return <>
    <Popover label={`Repository: ${current.name}. Switch repository`} testId="repo-switcher" triggerClass="repo-switcher" trigger={<>
      <span className="repo-name">{current.name}</span><ChevronDown size={13} aria-hidden="true" />
    </>}>
      {close => <>
        <MenuNote>{mode === 'demo' ? 'One illustrative repository is available in Demo data.' : `${repositories.data.length} from the backend`}</MenuNote>
        {repositories.data.map(item => <MenuItem key={item.id} checked={item.id === current.id} onSelect={() => { select(item.id, item.latestSnapshotId); close(); }}>
          <strong>{item.name}</strong><small>{item.origin ?? item.sourceKind}</small>
        </MenuItem>)}
      </>}
    </Popover>
    <span className="repo-meta" data-testid="repo-meta">
      <span title={current.branch ? 'Branch' : 'The backend does not record a branch'}><GitBranch size={12} aria-hidden="true" /><span className="sr-only">Branch </span>{current.branch ?? 'branch not recorded'}</span>
      <span title={current.commit ? 'Commit' : 'This snapshot has no commit'} className="mono"><GitCommitHorizontal size={12} aria-hidden="true" /><span className="sr-only">Commit </span>{short(current.commit) ?? 'no commit'}</span>
      {current.languages.slice(0, 2).map(language => <span key={language.name} className="language-chip">{language.name}<b className="mono">{language.share}%</b></span>)}
    </span>
  </>;
}

const statusLook: Record<AnalysisState, { tone: string; pulse: boolean }> = {
  complete: { tone: 'mint', pulse: true }, running: { tone: 'cyan', pulse: true }, queued: { tone: 'amber', pulse: true }, failed: { tone: 'coral', pulse: false }, none: { tone: 'muted', pulse: false },
};

function AnalysisPill() {
  const api = useApi();
  const scope = useScope();
  const status = useResource(scope ? `${api.mode}:${scope.snapshotId}:${scope.jobId ?? ''}` : null, () => api.getAnalysisStatus(scope!), api.mode === 'live' && scope?.jobId ? 5000 : undefined);
  if (!scope) return <span className="status-pill tone-muted" data-testid="analysis-status" title="Select a repository first"><span className="status-dot still" />No repository</span>;
  if (status.status === 'loading') return <span className="status-pill tone-muted" data-testid="analysis-status" role="status"><LoaderCircle size={12} className="spin" aria-hidden="true" />Checking analysis</span>;
  if (status.status === 'failed') return <button type="button" className="status-pill tone-coral" data-testid="analysis-status" title={status.failure.message} onClick={status.retry}><CircleAlert size={12} aria-hidden="true" />Status unavailable</button>;
  const look = statusLook[status.data.state];
  return <span className={`status-pill tone-${look.tone}`} data-testid="analysis-status" data-state={status.data.state} title={status.data.detail}><span className={`status-dot ${look.pulse ? '' : 'still'}`} />{status.data.label}{api.mode === 'demo' && <em>demo</em>}</span>;
}

function SnapshotMenu() {
  const api = useApi();
  const repositoryId = useDataStore(state => state.repositoryId);
  const snapshotId = useDataStore(state => state.snapshotId);
  const selectSnapshot = useDataStore(state => state.selectSnapshot);
  const snapshots = useResource<SnapshotInfo[]>(repositoryId ? `${api.mode}:${repositoryId}` : null, () => api.getSnapshots(repositoryId!));
  if (!repositoryId || snapshots.status !== 'ready' || !snapshots.data.length) return <span className="bar-chip disabled" data-testid="snapshot-selector" title={snapshots.status === 'failed' ? snapshots.failure.message : 'No snapshot is available'}><History size={13} aria-hidden="true" />No snapshot</span>;
  const current = snapshots.data.find(item => item.id === snapshotId) ?? snapshots.data[0];
  return <Popover label={`Snapshot: ${current.label}. Change snapshot`} testId="snapshot-selector" triggerClass="bar-chip" trigger={<><History size={13} aria-hidden="true" /><span className="bar-chip-text">{current.label}</span><ChevronDown size={12} aria-hidden="true" /></>}>
    {close => <>{snapshots.data.map(item => <MenuItem key={item.id} checked={item.id === current.id} onSelect={() => { selectSnapshot(item.id); close(); }}>
      <strong>{item.label}</strong><small className="mono">{short(item.commit) ?? 'no commit'} · {item.createdAt.slice(0, 10)}{item.note ? ` · ${item.note}` : ''}</small>
    </MenuItem>)}{api.mode === 'demo' && <MenuNote>Both demo snapshots are illustrative.</MenuNote>}</>}
  </Popover>;
}

function DataModeMenu() {
  const mode = useDataStore(state => state.mode);
  const setMode = useDataStore(state => state.setMode);
  const options: { mode: DataMode; label: string; detail: string }[] = [
    { mode: 'demo', label: 'Demo data', detail: 'Seeded shopflow-api fixture. Illustrative only.' },
    { mode: 'live', label: 'Live backend', detail: 'CodeAtlas API. Shows only what it returns.' },
  ];
  return <Popover label={`${mode === 'demo' ? 'Demo data, illustrative' : 'Live backend'}. Change data source`} testId="data-mode" triggerClass={`data-chip ${mode}`} trigger={<>{mode === 'demo' ? <FlaskConical size={13} aria-hidden="true" /> : <DatabaseZap size={13} aria-hidden="true" />}<span>{mode === "demo" ? "Demo data" : "Live backend"}</span><ChevronDown size={12} aria-hidden="true" /></>}>
    {close => <>{options.map(option => <MenuItem key={option.mode} checked={mode === option.mode} onSelect={() => { setMode(option.mode); close(); }}><strong>{option.label}</strong><small>{option.detail}</small></MenuItem>)}</>}
  </Popover>;
}

const noticeIcon: Record<ShellNotification['tone'], { icon: LucideIcon; tone: string }> = { info: { icon: Info, tone: 'cyan' }, success: { icon: CircleCheck, tone: 'mint' }, warning: { icon: TriangleAlert, tone: 'amber' }, error: { icon: CircleAlert, tone: 'coral' } };

function Notifications() {
  const api = useApi();
  const scope = useScope();
  const notes = useResource(scope ? `${api.mode}:${scope.snapshotId}` : null, () => api.getNotifications(scope!));
  const count = notes.status === 'ready' ? notes.data.length : 0;
  return <Popover label={count ? `Notifications, ${count}` : 'Notifications'} kind="dialog" align="end" testId="notifications" triggerClass="icon-button" trigger={<><Bell size={16} aria-hidden="true" />{count > 0 && <span className="bell-count" aria-hidden="true">{count}</span>}</>}>
    {() => <div className="notification-list">
      <h2>Notifications</h2>
      {notes.status === 'loading' && <p className="menu-note" role="status">Loading.</p>}
      {notes.status === 'failed' && <p className="menu-note" data-testid="notifications-unavailable"><strong>{notes.failure.title}.</strong> {notes.failure.message}</p>}
      {notes.status === 'ready' && !notes.data.length && <p className="menu-note">Nothing new.</p>}
      {notes.status === 'ready' && notes.data.map(note => { const look = noticeIcon[note.tone]; const Icon = look.icon; return <article key={note.id} className="notification"><Icon size={14} className={look.tone} aria-hidden="true" /><div><strong>{note.title}</strong><p>{note.detail}</p></div></article>; })}
      {api.mode === 'demo' && notes.status === 'ready' && <p className="menu-note">Illustrative notifications from the demo fixture.</p>}
    </div>}
  </Popover>;
}

function UserMenu() {
  const setShortcutsOpen = useShellStore(state => state.setShortcutsOpen);
  return <Popover label="Session menu" align="end" testId="user-menu" triggerClass="avatar" trigger={<CircleUser size={18} aria-hidden="true" />}>
    {close => <>
      <MenuNote><strong>Local session.</strong> The backend has no user accounts yet, so there is no profile or sign-in.</MenuNote>
      <Link to="/app/settings" className="menu-item" role="menuitem" tabIndex={-1} onClick={() => close()}><span className="menu-item-body"><strong>Settings</strong></span></Link>
      <Link to="/app/help" className="menu-item" role="menuitem" tabIndex={-1} onClick={() => close()}><span className="menu-item-body"><strong>Help</strong></span></Link>
      <MenuItem onSelect={() => { close(); setShortcutsOpen(true); }}><strong>Keyboard shortcuts</strong></MenuItem>
    </>}
  </Popover>;
}

export function TopBar({ repositories }: { repositories: Resource<Repository[]> }) {
  const setPaletteOpen = useShellStore(state => state.setPaletteOpen);
  const setDrawerOpen = useShellStore(state => state.setDrawerOpen);
  return <header className="topbar" data-testid="topbar">
    <div className="topbar-row">
      <button type="button" className="icon-button drawer-trigger" aria-label="Open navigation" onClick={() => setDrawerOpen(true)}><MenuIcon size={17} /></button>
      <RepositoryMenu repositories={repositories} />
      <button type="button" className="search-entry" data-testid="search-entry" aria-keyshortcuts="Control+K Meta+K" onClick={() => setPaletteOpen(true)}>
        <Search size={14} aria-hidden="true" /><span className="search-entry-text">Search pages, files, symbols</span><span className="search-entry-keys" aria-hidden="true"><Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd><Kbd>K</Kbd></span>
      </button>
      <div className="topbar-group">
        <AnalysisPill />
        <SnapshotMenu />
        <DataModeMenu />
        <div data-testid="global-mode-switch"><ModeSwitch compact /></div>
        <Notifications />
        <UserMenu />
      </div>
    </div>
  </header>;
}
