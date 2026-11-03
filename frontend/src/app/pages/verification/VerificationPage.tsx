import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Check, CircleHelp, Search, ThumbsDown, ThumbsUp, Undo2, X } from 'lucide-react';
import { Kbd, Skeleton } from '../../../components/ui';
import { CountUp, ScrambleText } from '../../../components/fx';
import type { AnalysisSymbol, Claim, ClaimStatus, ClaimsReport, RepositoryAnalysis } from '../../../data/dashboard';
import { useApi, useResource, useScope } from '../../../data/source';
import { VisualizationContainer } from '../../../viz/components/VisualizationContainer';
import { useReducedMotion } from '../../../viz/store';
import type { VizState } from '../../../viz/types';
import type { Destination } from '../../nav';
import { FailureNote, formatNumber, SourceTag, usePageData, useWorkScope, type Resource } from '../common';
import { CodeView, useHighlighted, type CodeViewHandle, type LineMark } from '../code/CodeView';
import { extractFacts, uniqueCalls } from '../code/facts';
import { splitLines } from '../code/highlight';
import { usePageKeys } from '../code/keys';
import { PaneDivider, usePaneSizes } from '../code/Panes';
import { toViz } from '../derive';
import { useReviews, useWorkStore, type ReviewDecision } from '../workStore';
import { locateEvidence } from './evidence';
import './verification.css';

const STATUS_LABEL: Record<ClaimStatus, string> = { verified: 'Verified', uncertain: 'Uncertain', unsupported: 'Unsupported' };
const DECISION_LABEL: Record<ReviewDecision, string> = { approved: 'Approved', rejected: 'Rejected', uncertain: 'Marked uncertain' };
type StatusFilter = ClaimStatus | 'all';
type ReviewFilter = ReviewDecision | 'all' | 'unreviewed';
const ROW = 76;

export function VerificationPage({ item }: { item: Destination }) {
  const api = useApi();
  const claims = usePageData('getClaims', (adapter, scope) => adapter.getClaims(scope));
  const analysis = usePageData('getAnalysis', (adapter, scope) => adapter.getAnalysis(scope));
  const workScope = useWorkScope();
  const reviews = useReviews(workScope);
  const review = useWorkStore(state => state.review);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [decision, setDecision] = useState<ReviewFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [sizes, setSize] = usePaneSizes('verification', [400]);

  const filtered = useMemo(() => {
    if (claims.status !== 'ready') return [];
    const needle = query.trim().toLowerCase();
    return claims.data.claims.filter(claim => (status === 'all' || claim.status === status)
      && (decision === 'all' || (decision === 'unreviewed' ? !reviews[claim.id] : reviews[claim.id] === decision))
      && (!needle || claim.text.toLowerCase().includes(needle) || claim.symbol.toLowerCase().includes(needle) || claim.id.includes(needle)));
  }, [claims, status, decision, query, reviews]);
  const index = Math.max(0, filtered.findIndex(claim => claim.id === selectedId));
  const selected = filtered[index] ?? null;

  const decide = useCallback((claim: Claim, value: ReviewDecision | null) => {
    review(workScope, claim.id, value);
    setAnnouncement(value ? `${claim.id} ${DECISION_LABEL[value].toLowerCase()}` : `${claim.id} review cleared`);
  }, [review, workScope]);
  const move = useCallback((step: number) => {
    if (!filtered.length) return;
    const next = filtered[Math.max(0, Math.min(filtered.length - 1, index + step))];
    setSelectedId(next.id);
    setAnnouncement(`${next.id}, ${STATUS_LABEL[next.status]}, ${index + step + 1} of ${filtered.length}`);
  }, [filtered, index]);

  usePageKeys(useCallback((key: string) => {
    if (!selected) return false;
    if (key === 'j') { move(1); return true; }
    if (key === 'k') { move(-1); return true; }
    const value: ReviewDecision | null = key === 'a' ? 'approved' : key === 'r' ? 'rejected' : key === 'u' ? 'uncertain' : null;
    if (!value) return false;
    decide(selected, reviews[selected.id] === value ? null : value);
    return true;
  }, [selected, move, decide, reviews]));

  const reviewed = claims.status === 'ready' ? claims.data.claims.filter(claim => reviews[claim.id]).length : 0;
  const style = { '--vf-queue': `${sizes[0]}px` } as CSSProperties;

  return <div className="page-frame verification" data-testid="verification-page" data-page="verification">
    <div className="sr-only" aria-live="polite" data-testid="verification-announcer">{announcement}</div>
    <header className="vf-head">
      <div>
        <span className="vf-eyebrow">Claim verification</span>
        <h1 tabIndex={-1}><span className="sr-only">{item.label}, </span><ScrambleText>{claims.status === 'ready' ? `${formatNumber.format(claims.data.summary.total)} claims` : item.label}</ScrambleText></h1>
      </div>
      <SourceTag mode={api.mode} />
      <p className="vf-keys" aria-label="Keyboard: J and K move, A approves, R rejects, U marks uncertain"><Kbd>J</Kbd><Kbd>K</Kbd> move <Kbd>A</Kbd> approve <Kbd>R</Kbd> reject <Kbd>U</Kbd> uncertain</p>
    </header>
    {claims.status === 'failed' && <div className="pane vf-unavailable" data-testid="claims-unavailable">
      <FailureNote failure={claims.failure} retry={claims.retry} />
      <p className="pane-note">The Phase II backend extracts structure, not claims. Claim extraction and verification arrive in a later phase, so this page shows no claims, scores or review queue for Live data instead of borrowing Demo numbers.</p>
    </div>}
    {claims.status !== 'failed' && <>
      <SummaryStrip claims={claims} reviewed={reviewed} reviews={reviews} status={status} setStatus={setStatus} />
      <div className="vf-panes" style={style}>
        <section className="pane vf-queue-pane" aria-label="Claims queue">
          <div className="pane-head vf-queue-head">
            <h2>Queue</h2>
            <span className="pane-eyebrow" data-testid="queue-count">{claims.status === 'ready' ? `${formatNumber.format(filtered.length)} shown` : '…'}</span>
          </div>
          <div className="vf-filters">
            <label className="vf-search"><Search size={13} aria-hidden="true" /><span className="sr-only">Search claims</span><input type="search" placeholder="Search claims or symbols" value={query} onChange={event => setQuery(event.target.value)} data-testid="claim-search" />{query && <button type="button" className="icon-button small" aria-label="Clear search" onClick={() => setQuery('')}><X size={12} /></button>}</label>
            <Chips label="Status" value={status} onChange={setStatus} testId="status-filter" options={[{ value: 'all', label: 'All' }, { value: 'verified', label: 'Verified' }, { value: 'uncertain', label: 'Uncertain' }, { value: 'unsupported', label: 'Unsupported' }]} />
            <Chips label="Review" value={decision} onChange={setDecision} testId="review-filter" options={[{ value: 'all', label: 'Any' }, { value: 'unreviewed', label: 'To review' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }, { value: 'uncertain', label: 'Uncertain' }]} />
          </div>
          {claims.status === 'loading' ? <div className="pane-note"><Skeleton label="Loading claims" /><Skeleton width="80%" label="Loading claims" /></div>
            : <ClaimQueue claims={filtered} selectedId={selected?.id ?? null} reviews={reviews} onSelect={id => setSelectedId(id)} />}
        </section>
        <PaneDivider label="Resize the queue" value={sizes[0]} min={300} max={620} onChange={value => setSize(0, value)} testId="divider-queue" />
        <section className="pane vf-evidence-pane" aria-label="Evidence">
          {selected ? <EvidenceView claim={selected} analysis={analysis} decision={reviews[selected.id] ?? null} decide={value => decide(selected, value)} position={index + 1} total={filtered.length} />
            : <p className="pane-note">{claims.status === 'ready' ? 'No claim matches these filters.' : ''}</p>}
        </section>
      </div>
    </>}
  </div>;
}

function Chips<T extends string>({ label, value, options, onChange, testId }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; testId: string }) {
  return <div className="vf-chips" role="group" aria-label={label} data-testid={testId}>
    {options.map(option => <button key={option.value} type="button" aria-pressed={value === option.value} className={`vf-chip ${option.value}`} onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div>;
}

function SummaryStrip({ claims, reviewed, reviews, status, setStatus }: { claims: Resource<ClaimsReport>; reviewed: number; reviews: Record<string, ReviewDecision>; status: StatusFilter; setStatus: (value: StatusFilter) => void }) {
  const reduced = useReducedMotion();
  const states = useMemo<{ bar: VizState; ring: VizState }>(() => {
    if (claims.status !== 'ready') return { bar: { status: 'loading' }, ring: { status: 'loading' } };
    const { summary } = claims.data, provenance = toViz(claims.data.provenance);
    const score = summary.total ? Math.round(summary.verified / summary.total * 1000) / 10 : 0;
    return {
      bar: { status: 'ready', model: { kind: 'bar', id: 'verification-status', title: 'Claim status', description: 'Claims by status, as the record states them.', provenance, layout: 'stacked', orientation: 'horizontal', valueLabel: 'Claims',
        categories: [{ id: 'claims', label: 'Claims' }],
        series: [{ id: 'verified', label: 'Verified', color: '--mint', values: [summary.verified] }, { id: 'uncertain', label: 'Uncertain', color: '--amber', values: [summary.uncertain] }, { id: 'unsupported', label: 'Unsupported', color: '--coral', values: [summary.unsupported] }] } },
      ring: { status: 'ready', model: { kind: 'radial', id: 'verification-score', title: 'Verification score', description: 'Share of claims the record marks verified.', unit: '%', provenance, metrics: [{ id: 'score', label: 'Verified share', value: score, max: 100, color: '--mint', status: `${formatNumber.format(summary.verified)} of ${formatNumber.format(summary.total)}` }] } },
    };
  }, [claims]);
  const summary = claims.status === 'ready' ? claims.data.summary : null;
  const counts = { approved: 0, rejected: 0, uncertain: 0 };
  Object.values(reviews).forEach(value => { counts[value] += 1; });
  return <section className="vf-summary" aria-label="Verification summary" data-testid="verification-summary">
    <div className="vf-counts">
      {(['verified', 'uncertain', 'unsupported'] as ClaimStatus[]).map(key => <button key={key} type="button" className={`vf-count ${key}`} aria-pressed={status === key} data-testid={`count-${key}`} onClick={() => setStatus(status === key ? 'all' : key)}>
        <span className="vf-count-label">{STATUS_LABEL[key]}</span>
        <strong>{summary ? (reduced ? formatNumber.format(summary[key]) : <CountUp value={summary[key]} />) : '…'}</strong>
        <span className="vf-count-share">{summary?.total ? `${Math.round(summary[key] / summary.total * 1000) / 10}%` : ''}</span>
      </button>)}
      <div className="vf-count review" data-testid="review-progress">
        <span className="vf-count-label">Your review</span>
        <strong>{formatNumber.format(reviewed)}</strong>
        <span className="vf-count-share">{counts.approved} approved, {counts.rejected} rejected, {counts.uncertain} uncertain. Saved in this browser.</span>
      </div>
    </div>
    <div className="vf-bar"><VisualizationContainer id="verification-status" title="Claim status" height={150} compact state={states.bar} onDatumActivate={id => { const series = id.split('|')[1] as ClaimStatus; setStatus(status === series ? 'all' : series); }} /></div>
    <div className="vf-ring"><VisualizationContainer id="verification-score" title="Verification score" height={150} compact state={states.ring} /></div>
  </section>;
}

/** Fixed-height rows, rendered only near the viewport, so the 3,912 demo claims scroll without lag. */
function ClaimQueue({ claims, selectedId, reviews, onSelect }: { claims: Claim[]; selectedId: string | null; reviews: Record<string, ReviewDecision>; onSelect: (id: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 600 });
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let frame = 0;
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setView({ top: element.scrollTop, height: element.clientHeight })); };
    update();
    element.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => { cancelAnimationFrame(frame); element.removeEventListener('scroll', update); observer.disconnect(); };
  }, []);
  const selectedIndex = claims.findIndex(claim => claim.id === selectedId);
  /** Keeps the selected row in view when J and K move past the edge. */
  useEffect(() => {
    const element = host.current;
    if (!element || selectedIndex < 0) return;
    const top = selectedIndex * ROW;
    if (top < element.scrollTop) element.scrollTop = top;
    else if (top + ROW > element.scrollTop + element.clientHeight) element.scrollTop = top + ROW - element.clientHeight;
  }, [selectedIndex]);
  const first = Math.max(0, Math.floor(view.top / ROW) - 6), last = Math.min(claims.length, Math.ceil((view.top + view.height) / ROW) + 6);
  return <div ref={host} className="vf-queue pane-body" role="listbox" aria-label="Claims" tabIndex={0} aria-activedescendant={selectedId ? `claim-${selectedId}` : undefined} data-testid="claim-queue"
    onKeyDown={event => {
      const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : event.key === 'PageDown' ? 8 : event.key === 'PageUp' ? -8 : 0;
      if (!step || !claims.length) return;
      event.preventDefault();
      onSelect(claims[Math.max(0, Math.min(claims.length - 1, Math.max(0, selectedIndex) + step))].id);
    }}>
    <div style={{ height: claims.length * ROW, position: 'relative' }}>
      {claims.slice(first, last).map((claim, offset) => {
        const decision = reviews[claim.id];
        return <div key={claim.id} id={`claim-${claim.id}`} role="option" aria-selected={claim.id === selectedId} data-testid="claim-row" data-status={claim.status} data-decision={decision ?? ''}
          className={`vf-row${claim.id === selectedId ? ' selected' : ''}`} style={{ top: (first + offset) * ROW, height: ROW - 4 }} onClick={() => onSelect(claim.id)}>
          <div className="vf-row-top">
            <span className={`status-chip ${claim.status}`}>{STATUS_LABEL[claim.status]}</span>
            {decision && <span className={`status-chip ${decision === 'uncertain' ? 'amber' : decision}`}>{decision === 'approved' ? <Check size={10} aria-hidden="true" /> : decision === 'rejected' ? <X size={10} aria-hidden="true" /> : <CircleHelp size={10} aria-hidden="true" />}{DECISION_LABEL[decision]}</span>}
            <span className="vf-conf" title="The claim record carries no confidence score, so none is shown">confidence n/a</span>
            <span className="vf-id">{claim.id}</span>
          </div>
          <p className="vf-text">{claim.text}</p>
          <span className="vf-module mono">{claim.path}</span>
        </div>;
      })}
    </div>
  </div>;
}

function EvidenceView({ claim, analysis, decision, decide, position, total }: { claim: Claim; analysis: Resource<RepositoryAnalysis>; decision: ReviewDecision | null; decide: (value: ReviewDecision | null) => void; position: number; total: number }) {
  const api = useApi();
  const scope = useScope() ?? undefined;
  const reduced = useReducedMotion();
  const file = useResource(`${api.mode}:file:${scope?.snapshotId ?? ''}:${claim.path}`, () => api.getFile(claim.path, scope));
  const symbol: AnalysisSymbol | null = analysis.status === 'ready' ? analysis.data.symbols.find(entry => entry.qualifiedName === claim.symbol) ?? null : null;
  const lines = useMemo(() => file.status === 'ready' ? splitLines(file.data.content) : null, [file]);
  const highlighted = useHighlighted(file.status === 'ready' ? file.data.content : null, claim.path, file.status === 'ready' ? file.data.language : null);
  const span = symbol ? { start: symbol.line, end: symbol.endLine } : { start: claim.line, end: claim.line + 15 };
  const from = Math.max(1, span.start - 2), to = lines ? Math.min(lines.length, span.end + 2) : span.end + 2;
  const evidence = useMemo(() => lines ? locateEvidence(claim.text, lines, span.start, span.end) : null, [lines, claim.text, span.start, span.end]);
  const facts = useMemo(() => lines ? extractFacts(lines, span.start, span.end, file.status === 'ready' ? file.data.language : null) : null, [lines, span.start, span.end, file]);
  const marks = useMemo(() => {
    const map = new Map<number, LineMark>();
    for (let line = span.start; line <= span.end; line += 1) map.set(line, 'focus');
    evidence?.support.forEach(line => map.set(line, 'support'));
    evidence?.contradict.forEach(line => map.set(line, 'contradict'));
    return map;
  }, [evidence, span.start, span.end]);
  const target = evidence?.support[0] ?? evidence?.contradict[0] ?? span.start;
  const tone = evidence?.support.length ? 'support' : evidence?.contradict.length ? 'contradict' : 'neutral';

  const grid = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const code = useRef<CodeViewHandle>(null);
  const [connector, setConnector] = useState<{ d: string; offscreen: boolean; width: number; height: number } | null>(null);
  const measure = useCallback(() => {
    const box = grid.current?.getBoundingClientRect(), origin = card.current?.getBoundingClientRect(), line = code.current?.lineElement(target)?.getBoundingClientRect(), view = code.current?.container()?.getBoundingClientRect();
    if (!box || !origin || !line || !view) { setConnector(current => current && null); return; }
    const y1 = origin.top + Math.min(origin.height / 2, 46) - box.top, x1 = origin.right - box.left;
    const raw = line.top + line.height / 2;
    const y2 = Math.max(view.top + 8, Math.min(view.bottom - 8, raw)) - box.top, x2 = view.left - box.left + 18;
    const bend = Math.max(24, (x2 - x1) / 2);
    const next = { d: `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`, offscreen: raw < view.top || raw > view.bottom, width: box.width, height: box.height };
    setConnector(current => current && current.d === next.d && current.offscreen === next.offscreen && current.width === next.width && current.height === next.height ? current : next);
  }, [target]);
  useLayoutEffect(() => { measure(); }, [measure, highlighted, claim.id]);
  useEffect(() => {
    const observer = new ResizeObserver(measure);
    if (grid.current) observer.observe(grid.current);
    return () => observer.disconnect();
  }, [measure]);
  /** Bring the evidence line into view whenever the claim changes. */
  useEffect(() => {
    const container = code.current?.container(), line = code.current?.lineElement(target);
    if (container && line) { container.scrollTop = Math.max(0, line.offsetTop - container.clientHeight / 3); measure(); }
  }, [target, highlighted, claim.id, measure]);

  return <div className="vf-evidence" data-testid="evidence-view" data-claim={claim.id}>
    <div className="pane-head"><h2>Evidence</h2><span className="pane-eyebrow">{formatNumber.format(position)} of {formatNumber.format(total)}</span></div>
    <div ref={grid} className="vf-evidence-grid">
      <div className="vf-left">
        <article ref={card} className={`vf-claim ${claim.status}`} data-testid="claim-card">
          <header><span className={`status-chip ${claim.status}`}>{STATUS_LABEL[claim.status]}</span><span className="vf-id">{claim.id}</span></header>
          <p className="vf-claim-text">{claim.text}</p>
          <p className="vf-claim-symbol mono">{claim.symbol}</p>
          <div className="vf-actions" role="group" aria-label="Review this claim">
            <button type="button" aria-pressed={decision === 'approved'} className="vf-act approve" onClick={() => decide(decision === 'approved' ? null : 'approved')} data-testid="approve"><ThumbsUp size={13} aria-hidden="true" />Approve <Kbd>A</Kbd></button>
            <button type="button" aria-pressed={decision === 'rejected'} className="vf-act reject" onClick={() => decide(decision === 'rejected' ? null : 'rejected')} data-testid="reject"><ThumbsDown size={13} aria-hidden="true" />Reject <Kbd>R</Kbd></button>
            <button type="button" aria-pressed={decision === 'uncertain'} className="vf-act uncertain" onClick={() => decide(decision === 'uncertain' ? null : 'uncertain')} data-testid="mark-uncertain"><CircleHelp size={13} aria-hidden="true" />Uncertain <Kbd>U</Kbd></button>
            {decision && <button type="button" className="vf-act clear" onClick={() => decide(null)}><Undo2 size={13} aria-hidden="true" />Clear</button>}
          </div>
          <p className="vf-fine">The status comes from the claim record{api.mode === 'demo' ? ', which is illustrative demo data' : ''}. Your decision is a separate review, saved in this browser.</p>
        </article>
        <section className="vf-facts" aria-label="Extracted facts" data-testid="facts">
          <h3>Extracted facts</h3>
          {!facts || !evidence ? <Skeleton label="Reading facts" /> : <ul>
            <Fact ok={!!evidence.support.length} unknown={!evidence.rule} label={evidence.rule ? `Claim says it ${evidence.rule.assertion}` : 'No line rule for this kind of claim'}
              detail={!evidence.rule ? 'Read the span yourself.' : evidence.support.length ? `Matching line${evidence.support.length > 1 ? 's' : ''} ${evidence.support.join(', ')}` : 'No matching line in the span'} />
            {!!evidence.contradict.length && <Fact ok={false} label={`Possible contradiction: ${evidence.rule?.contradictReason ?? 'see marked lines'}`} detail={`Line${evidence.contradict.length > 1 ? 's' : ''} ${evidence.contradict.join(', ')}`} />}
            <Fact ok={!!facts.params.length} neutral label={facts.params.length ? `Parameters: ${facts.params.map(param => param.type ? `${param.name}: ${param.type}` : param.name).join(', ')}` : 'No parameters'} />
            <Fact ok={!!facts.returnType} neutral={!facts.returnType} label={facts.returnType ? `Return type: ${facts.returnType}` : 'No return type annotation'} detail={facts.returns.length ? `Returns ${[...new Set(facts.returns.map(item => item.text))].join(', ')}` : undefined} />
            <Fact ok neutral={!uniqueCalls(facts).length} label={uniqueCalls(facts).length ? `Calls: ${uniqueCalls(facts).map(call => call.text).join(', ')}` : 'Calls nothing'} />
            {!!facts.raises.length && <Fact ok neutral label={`Raises: ${[...new Set(facts.raises.map(item => item.text))].join(', ')}`} />}
          </ul>}
          <p className="vf-fine">Facts are parsed from the source on the right. The line rule is text search over this span: it points at lines, it does not verify the claim and does not change its status.</p>
        </section>
      </div>
      <div className="vf-code">
        <div className="vf-code-head mono"><span>{claim.path}</span><span>{symbol ? `lines ${symbol.line} to ${symbol.endLine}` : analysis.status === 'loading' ? '' : `near line ${claim.line}`}</span></div>
        {file.status === 'loading' && <div className="pane-note"><Skeleton label="Loading source" /><Skeleton width="70%" label="Loading source" /></div>}
        {file.status === 'failed' && <FailureNote failure={file.failure} retry={file.retry} />}
        {highlighted && <CodeView ref={code} lines={highlighted.slice(from - 1, to)} start={from} marks={marks} label={`Evidence from ${claim.path}`} onScroll={measure} testId="evidence-code" />}
        <div className="vf-legend" aria-hidden="true"><i className="support" />matching line <i className="contradict" />possible contradiction <i className="focus" />symbol span</div>
      </div>
      {connector && <svg className={`vf-connector ${tone}${connector.offscreen ? ' offscreen' : ''}${reduced ? '' : ' animate'}`} width={connector.width} height={connector.height} aria-hidden="true" data-testid="connector">
        <path key={`${claim.id}-${target}`} d={connector.d} pathLength={1} />
      </svg>}
    </div>
  </div>;
}

function Fact({ ok, label, detail, neutral = false, unknown = false }: { ok: boolean; label: string; detail?: string; neutral?: boolean; unknown?: boolean }) {
  const state = unknown ? 'unknown' : neutral ? 'neutral' : ok ? 'ok' : 'missing';
  return <li className={`vf-fact ${state}`} data-state={state}>
    {state === 'missing' ? <X size={13} aria-label="Not found" /> : state === 'unknown' ? <CircleHelp size={13} aria-label="No rule" /> : <Check size={13} aria-label="Found in source" />}
    <span><span className="vf-fact-label">{label}</span>{detail && <small>{detail}</small>}</span>
  </li>;
}
