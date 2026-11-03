import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, BookOpenText, CircleCheck, CircleDashed, Hourglass } from 'lucide-react';
import { Skeleton } from '../../../components/ui';
import type { AnalysisSymbol, DashboardApi, DocsReport, RepositoryAnalysis } from '../../../data/dashboard';
import { FailureNote, formatBytes, formatNumber, type Resource } from '../common';
import { extractFacts, uniqueCalls, type SourceFacts } from '../code/facts';
import { relationsOf, type RelationView } from '../code/symbols';
import { TabBar, useTabIds } from '../code/TabBar';

export type InspectorTab = 'explanation' | 'signature' | 'relationships' | 'docs';
export interface OpenFile { path: string; language: string | null; lines: string[]; sizeBytes: number | null }
export type Show = (path: string, line: number, endLine?: number) => void;

export function SourceChip({ path, line, endLine, show, label, current }: { path: string; line: number; endLine?: number; show: Show; label?: string; current?: string | null }) {
  const span = endLine && endLine !== line ? `${line}-${endLine}` : `${line}`;
  const name = path === current ? `L${span}` : `${path.split('/').pop()}:${span}`;
  return <button type="button" className="source-chip" data-testid="source-chip" title={`${path}, line ${span}`} onClick={() => show(path, line, endLine)}>
    <span>{label ? `${label} · ${name}` : name}</span><span className="sr-only">, show in the code pane</span>
  </button>;
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return <section className="ex-section"><header><h3>{title}</h3>{aside}</header>{children}</section>;
}

const docOf = (docs: Resource<DocsReport>, symbol: AnalysisSymbol) => docs.status === 'ready' ? docs.data.documents.find(document => document.id === symbol.id) ?? null : null;

/** Facts are read from the file on screen, so they always agree with the code pane. */
export function useFacts(file: OpenFile | null, symbol: AnalysisSymbol | null): SourceFacts | null {
  return useMemo(() => file && symbol && symbol.path === file.path ? extractFacts(file.lines, symbol.line, symbol.endLine, file.language) : null, [file, symbol]);
}

export function Inspector({ mode, analysis, docs, file, symbol, fileSymbols, show, select }: {
  mode: DashboardApi['mode']; analysis: Resource<RepositoryAnalysis>; docs: Resource<DocsReport>; file: OpenFile | null; symbol: AnalysisSymbol | null; fileSymbols: AnalysisSymbol[];
  show: Show; select: (symbol: AnalysisSymbol) => void;
}) {
  const [tab, setTab] = useState<InspectorTab>('explanation');
  const ids = useTabIds('ex-inspector');
  const facts = useFacts(file, symbol);
  const relations = useMemo(() => analysis.status === 'ready' && symbol ? relationsOf(analysis.data, symbol) : [], [analysis, symbol]);
  const tabs: { id: InspectorTab; label: string; count?: number }[] = [
    { id: 'explanation', label: 'Explanation' }, { id: 'signature', label: 'Signature' },
    { id: 'relationships', label: 'Relationships', count: symbol ? relations.length : undefined }, { id: 'docs', label: 'Docs' },
  ];

  if (!file) return <p className="pane-note">Open a file from the tree. Its symbols, relationships and documentation appear here.</p>;
  if (analysis.status === 'loading') return <div className="pane-note"><Skeleton label="Loading the analysis" /></div>;
  if (analysis.status === 'failed') return <>
    <FailureNote failure={analysis.failure} retry={analysis.retry} />
    <p className="pane-note">Without an analysis the code is shown as-is, with no symbols, badges or relationships.</p>
  </>;
  if (!symbol) return <ModuleSummary file={file} symbols={fileSymbols} select={select} analysis={analysis.data} />;

  return <div className="ex-inspector" data-testid="inspector" data-symbol={symbol.qualifiedName}>
    <header className="ex-inspector-head">
      <span className="ex-kind">{symbol.kind}</span>
      <h3 title={symbol.qualifiedName}>{symbol.name}</h3>
      <p className="mono">{symbol.qualifiedName}</p>
    </header>
    <TabBar label="Symbol details" tabs={tabs} active={tab} onChange={setTab} ids={ids} testId="inspector-tabs" />
    <div role="tabpanel" id={ids.panel(tab)} aria-labelledby={ids.tab(tab)} className="ex-tab-panel" tabIndex={0} data-testid={`inspector-${tab}`}>
      {tab === 'explanation' && <Explanation mode={mode} symbol={symbol} facts={facts} docs={docs} show={show} />}
      {tab === 'signature' && <Signature symbol={symbol} facts={facts} show={show} />}
      {tab === 'relationships' && <Relationships relations={relations} symbol={symbol} show={show} select={select} analysis={analysis.data} />}
      {tab === 'docs' && <Docs mode={mode} symbol={symbol} facts={facts} docs={docs} show={show} />}
    </div>
  </div>;
}

function Explanation({ mode, symbol, facts, docs, show }: { mode: DashboardApi['mode']; symbol: AnalysisSymbol; facts: SourceFacts | null; docs: Resource<DocsReport>; show: Show }) {
  const record = docOf(docs, symbol);
  return <>
    <Section title="Explanation" aside={mode === 'demo' ? <span className="status-chip amber">Demo, illustrative</span> : <span className="status-chip muted">Pending</span>}>
      {docs.status === 'loading' && <Skeleton label="Loading the explanation" />}
      {docs.status === 'ready' && record && <p className="ex-prose" data-testid="explanation-text">{record.summary}</p>}
      {docs.status === 'ready' && !record && <p className="ex-muted">The documentation record has no entry for this symbol.</p>}
      {docs.status === 'failed' && <FailureNote failure={docs.failure} compact />}
      {mode === 'demo' && <p className="ex-fine">Fixture text written for the demo. No model produced it, and it is not a verified statement about the code.</p>}
      <div className="source-chips"><SourceChip path={symbol.path} line={symbol.line} endLine={symbol.endLine} show={show} label="Definition" current={symbol.path} /></div>
    </Section>
    <Section title="Parameters" aside={<span className="ex-fine">Read from source</span>}>
      {!facts ? <Skeleton label="Reading parameters" /> : facts.params.length ? <ul className="ex-params">{facts.params.map(param => <li key={param.name}><code>{param.name}</code>{param.type && <span className="mono ex-type">{param.type}</span>}{param.defaultValue && <span className="ex-fine">= {param.defaultValue}</span>}</li>)}</ul> : <p className="ex-muted">No parameters.</p>}
      {facts?.declaration && <div className="source-chips"><SourceChip path={symbol.path} line={facts.declaration.line} show={show} label="Declaration" current={symbol.path} /></div>}
    </Section>
    <Section title="Returns" aside={<span className="ex-fine">Read from source</span>}>
      {facts && <>
        <p className="ex-muted">{facts.returnType ? <>Annotated as <code>{facts.returnType}</code>.</> : 'No return annotation.'}</p>
        {facts.returns.length ? <ul className="ex-facts">{facts.returns.map(item => <li key={item.line}><code>return {item.text}</code><SourceChip path={symbol.path} line={item.line} show={show} current={symbol.path} /></li>)}</ul> : symbol.kind !== 'class' && <p className="ex-muted">No return statement.</p>}
        {!!facts.raises.length && <><h4>Raises</h4><ul className="ex-facts">{facts.raises.map(item => <li key={item.line}><code>{item.text}</code><SourceChip path={symbol.path} line={item.line} show={show} current={symbol.path} /></li>)}</ul></>}
      </>}
    </Section>
  </>;
}

function Signature({ symbol, facts, show }: { symbol: AnalysisSymbol; facts: SourceFacts | null; show: Show }) {
  return <>
    <Section title="Declaration">
      <pre className="ex-signature" tabIndex={0} aria-label="Declaration">{facts?.declaration?.text ?? symbol.signature ?? symbol.name}</pre>
      <div className="source-chips"><SourceChip path={symbol.path} line={symbol.line} endLine={symbol.endLine} show={show} label="Span" current={symbol.path} /></div>
    </Section>
    <Section title="Facts">
      <dl className="ex-dl">
        <div><dt>Kind</dt><dd>{symbol.kind}</dd></div>
        <div><dt>Lines</dt><dd>{symbol.line} to {symbol.endLine} ({symbol.endLine - symbol.line + 1})</dd></div>
        <div><dt>Documented</dt><dd>{symbol.documented ? <span className="mint">Yes</span> : <span className="coral">No</span>}</dd></div>
        <div><dt>Recorded signature</dt><dd className="mono">{symbol.signature ?? 'Not recorded'}</dd></div>
      </dl>
    </Section>
    {facts && !!facts.params.length && <Section title="Parameters">
      <table className="ex-table"><thead><tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Default</th></tr></thead>
        <tbody>{facts.params.map(param => <tr key={param.name}><td className="mono">{param.name}</td><td className="mono">{param.type ?? <span className="ex-muted">none</span>}</td><td className="mono">{param.defaultValue ?? <span className="ex-muted">required</span>}</td></tr>)}</tbody></table>
    </Section>}
    {facts && !!uniqueCalls(facts).length && <Section title="Calls in the body" aside={<span className="ex-fine">Read from source</span>}>
      <ul className="ex-facts">{uniqueCalls(facts).map(call => <li key={call.text}><code>{call.text}()</code><SourceChip path={symbol.path} line={call.line} show={show} current={symbol.path} /></li>)}</ul>
    </Section>}
  </>;
}

const RELATION_LABEL: Record<string, [string, string]> = { contains: ['Contains', 'Defined in'], imports: ['Imports', 'Imported by'], calls: ['Calls', 'Called by'], inherits: ['Inherits from', 'Inherited by'], implements: ['Implements', 'Implemented by'] };

function Relationships({ relations, symbol, show, select, analysis }: { relations: RelationView[]; symbol: AnalysisSymbol; show: Show; select: (symbol: AnalysisSymbol) => void; analysis: RepositoryAnalysis }) {
  const parent = symbol.parentId ? analysis.symbols.find(entry => entry.id === symbol.parentId) ?? null : null;
  const children = analysis.symbols.filter(entry => entry.parentId === symbol.id);
  const groups = new Map<string, RelationView[]>();
  relations.forEach(view => { const key = RELATION_LABEL[view.relation.kind]?.[view.direction === 'out' ? 0 : 1] ?? view.relation.kind; groups.set(key, [...(groups.get(key) ?? []), view]); });
  if (!relations.length && !parent && !children.length) return <p className="ex-muted">The analysis records no relationships for this symbol.</p>;
  return <>
    {parent && !relations.some(view => view.relation.kind === 'contains' && view.direction === 'in') && <Section title="Member of"><ul className="ex-relations"><li><button type="button" className="text-link" onClick={() => select(parent)}>{parent.qualifiedName}</button></li></ul></Section>}
    {!!children.length && <Section title={`Members (${children.length})`}><ul className="ex-relations">{children.map(child => <li key={child.id}><button type="button" className="text-link" onClick={() => select(child)}>{child.name}</button><span className="ex-fine">{child.kind}</span></li>)}</ul></Section>}
    {[...groups].map(([title, views]) => <Section key={title} title={`${title} (${views.length})`}>
      <ul className="ex-relations" data-testid="relation-group">{views.map(view => <li key={`${view.relation.id}-${view.direction}`}>
        {view.direction === 'out' ? <ArrowUpRight size={12} aria-hidden="true" /> : <ArrowDownLeft size={12} aria-hidden="true" />}
        {view.other ? <button type="button" className="text-link" onClick={() => select(view.other!)}>{view.label}</button> : <span className="mono">{view.label}</span>}
        <span className={`status-chip ${view.relation.resolution === 'confirmed' ? 'mint' : view.relation.resolution === 'external' ? 'cyan' : 'amber'}`}>{view.relation.resolution}</span>
        <SourceChip path={view.relation.path} line={view.relation.line} show={show} current={symbol.path} />
      </li>)}</ul>
    </Section>)}
  </>;
}

function Docs({ mode, symbol, facts, docs, show }: { mode: DashboardApi['mode']; symbol: AnalysisSymbol; facts: SourceFacts | null; docs: Resource<DocsReport>; show: Show }) {
  const record = docOf(docs, symbol);
  return <>
    <Section title="Existing documentation" aside={symbol.documented ? <span className="status-chip mint"><CircleCheck size={10} aria-hidden="true" />Documented</span> : <span className="status-chip coral"><CircleDashed size={10} aria-hidden="true" />Undocumented</span>}>
      {facts?.docstring ? <>
        <blockquote className="ex-docstring" data-testid="docstring">{facts.docstring.text || '(empty docstring)'}</blockquote>
        <div className="source-chips"><SourceChip path={symbol.path} line={facts.docstring.line} endLine={facts.docstring.endLine} show={show} label="Docstring" current={symbol.path} /></div>
      </> : <p className="ex-muted">{symbol.documented ? 'The analysis marks this symbol documented, but no docstring follows its declaration in this file.' : 'No docstring in the source.'}</p>}
    </Section>
    <Section title="Generated documentation" aside={mode === 'demo' ? <span className="status-chip amber">Demo, illustrative</span> : undefined}>
      {docs.status === 'loading' && <Skeleton label="Loading documentation" />}
      {docs.status === 'failed' && <FailureNote failure={docs.failure} compact />}
      {docs.status === 'ready' && (record ? <p className="ex-prose">{record.generated ? <><BookOpenText size={12} aria-hidden="true" /> The demo documentation pass adds a docstring for this symbol.</> : record.existing ? 'Already documented, so the demo pass leaves it unchanged.' : <><Hourglass size={12} aria-hidden="true" /> Still undocumented after the demo pass.</>}</p> : <p className="ex-muted">No documentation record for this symbol.</p>)}
      <p><Link className="text-link" to={`/app/docs?symbol=${encodeURIComponent(symbol.qualifiedName)}`}>Open in Documentation Studio</Link></p>
    </Section>
  </>;
}

function ModuleSummary({ file, symbols, select, analysis }: { file: OpenFile; symbols: AnalysisSymbol[]; select: (symbol: AnalysisSymbol) => void; analysis: RepositoryAnalysis }) {
  const documented = symbols.filter(symbol => symbol.documented).length;
  const imports = analysis.relations.filter(relation => relation.kind === 'imports' && relation.path === file.path).length;
  return <div className="ex-inspector" data-testid="inspector" data-symbol="">
    <header className="ex-inspector-head"><span className="ex-kind">module</span><h3>{file.path.split('/').pop()}</h3><p className="mono">{file.path}</p></header>
    <div className="ex-tab-panel">
      <Section title="File">
        <dl className="ex-dl">
          <div><dt>Language</dt><dd>{file.language ?? 'Unknown'}</dd></div>
          <div><dt>Lines</dt><dd>{formatNumber.format(file.lines.length)}</dd></div>
          {file.sizeBytes !== null && <div><dt>Size</dt><dd>{formatBytes(file.sizeBytes)}</dd></div>}
          <div><dt>Symbols</dt><dd>{symbols.length}, {documented} documented</dd></div>
          <div><dt>Import statements</dt><dd>{imports}</dd></div>
        </dl>
      </Section>
      <Section title="Outline">
        {symbols.length ? <ul className="ex-relations">{symbols.map(symbol => <li key={symbol.id} style={{ paddingLeft: symbol.parentId && symbols.some(other => other.id === symbol.parentId) ? 14 : 0 }}>
          <span className={`ex-doc-dot ${symbol.documented ? 'good' : 'poor'}`} aria-hidden="true" />
          <button type="button" className="text-link" onClick={() => select(symbol)}>{symbol.name}</button><span className="ex-fine">{symbol.kind}, line {symbol.line}</span>
        </li>)}</ul> : <p className="ex-muted">The analysis records no symbols in this file.</p>}
      </Section>
    </div>
  </div>;
}
