import { useState } from 'react';
import { useApi, useScope, useResource, getApiKey, dataConfig } from '../../data/source';
import { FailureNote } from './common';

export function DocumentationPage({ title = 'Documentation Studio' }: { title?: string }) {
  const api = useApi();
  const scope = useScope();
  const docs = useResource(scope ? `${api.mode}:${scope.jobId}:docs` : null, () => api.getDocs(scope!));
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const current = docs.status === 'ready' ? docs.data.documents.find(item => item.id === selected) ?? docs.data.documents[0] : null;
  async function download() {
    if (!scope?.jobId || api.mode !== 'live') return;
    const response = await fetch(`${dataConfig().apiBase}/api/v1/jobs/${encodeURIComponent(scope.jobId)}/documentation/export`, { headers: getApiKey() ? { 'x-api-key': getApiKey() } : {} });
    if (!response.ok) { setMessage(`Export failed (${response.status})`); return; }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a'); link.href = url; link.download = 'codeatlas-docs.zip'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000); setMessage('Markdown package downloaded.');
  }
  return <div className="page-frame"><header className="page-head"><div className="page-eyebrow">{api.mode === 'demo' ? 'Demo, illustrative' : 'Live, source referenced'}</div><h1>{title}</h1><p>Structural summaries and source evidence. Review semantic claims before publishing.</p></header>
    {!scope && <p>Select a repository first.</p>}{docs.status === 'loading' && <p role="status">Loading documentation…</p>}
    {docs.status === 'failed' && <FailureNote failure={docs.failure} retry={docs.retry} />}
    {docs.status === 'ready' && <div className="panel-grid two"><section className="panel" style={{ padding: 20 }}><h2>{docs.data.documents.length} symbols</h2><p>Existing source documentation: {docs.data.coverageBefore}%. Generated text is a separate artifact.</p><div style={{ maxHeight: 520, overflow: 'auto' }}>{docs.data.documents.map(item => <button type="button" key={item.id} onClick={() => setSelected(item.id)} style={{ display: 'block', margin: '8px 0' }}>{item.kind} {item.symbol}</button>)}</div></section>
      <section className="panel" style={{ padding: 20 }}><h2>{current?.symbol ?? 'Select a symbol'}</h2>{current && <><p>{current.summary}</p><p>Source: <code>{current.path}</code></p><p>Review required for behavioral claims.</p></>}{api.mode === 'live' && <button type="button" onClick={download}>Export Markdown package</button>}<p role="status">{message}</p></section></div>}
  </div>;
}
export function ExportsPage() { return <DocumentationPage title="Exports" />; }
export function IntelligencePage() {
  const api = useApi(); const scope = useScope();
  const docs = useResource(scope ? `${api.mode}:${scope.jobId}:nlp` : null, () => api.getDocs(scope!));
  const [symbol, setSymbol] = useState('');
  const [method, setMethod] = useState<'baseline' | 'codet5' | 'ner'>('baseline');
  const [result, setResult] = useState('');
  const [running, setRunning] = useState(false);
  async function infer() {
    if (!scope?.jobId || !symbol) return;
    setRunning(true); setResult('Running inference…');
    try {
      const headers = { 'Content-Type': 'application/json', ...(getApiKey() ? { 'x-api-key': getApiKey() } : {}) };
      const root = `${dataConfig().apiBase}/api/v1/nlp/snapshots/${encodeURIComponent(scope.snapshotId)}`;
      const response = await fetch(`${root}/jobs`, { method: 'POST', headers, body: JSON.stringify({ analysis_job_id: scope.jobId, symbol_id: symbol, method }) });
      if (!response.ok) throw new Error(`Inference request failed (${response.status})`);
      const job = await response.json() as { id: string; status: string };
      let state = job.status;
      for (let count = 0; count < 120 && state !== 'complete' && state !== 'failed'; count++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const poll = await fetch(`${dataConfig().apiBase}/api/v1/jobs/${encodeURIComponent(job.id)}`, { headers });
        state = (await poll.json() as { status: string }).status;
      }
      if (state !== 'complete') throw new Error(`Inference ${state}. Check the NLP runtime and checkpoint.`);
      const output = await fetch(`${root}/jobs/${encodeURIComponent(job.id)}/result`, { headers });
      if (!output.ok) throw new Error(`Result unavailable (${output.status})`);
      const payload = await output.json() as { text?: string; status?: string; entities?: unknown[]; warnings?: string[]; grounding?: unknown[] };
      setResult(JSON.stringify(payload, null, 2));
    } catch (error) { setResult(error instanceof Error ? error.message : 'Inference failed'); }
    finally { setRunning(false); }
  }
  return <div className="page-frame"><header className="page-head"><div className="page-eyebrow">{api.mode === 'demo' ? 'Demo, illustrative' : 'Live, Phase IV'}</div><h1>Documentation Intelligence</h1><p>Run the deterministic baseline, CodeT5, or the trained NER checkpoint on a source symbol.</p></header>
    {docs.status === 'loading' && <p>Loading…</p>}{docs.status === 'failed' && <FailureNote failure={docs.failure} retry={docs.retry} />}
    {docs.status === 'ready' && <section className="panel" style={{ padding: 24 }}><h2>{docs.data.documents.length} generated symbol summaries</h2><p>Source documentation coverage: {docs.data.coverageBefore}%. Generated text requires review.</p>
      {api.mode === 'live' && <><label className="field"><span>Function or method</span><select value={symbol} onChange={event => setSymbol(event.target.value)}><option value="">Select a symbol</option>{docs.data.documents.filter(item => ['function', 'method', 'constructor'].includes(item.kind)).map(item => <option key={item.id} value={item.id}>{item.symbol} — {item.path}</option>)}</select></label>
      <label className="field"><span>Model</span><select value={method} onChange={event => setMethod(event.target.value as typeof method)}><option value="baseline">Deterministic baseline</option><option value="codet5">CodeT5 transformer</option><option value="ner">Code NER checkpoint</option></select></label>
      <button type="button" disabled={!symbol || running} onClick={infer}>Run NLP</button><pre style={{ whiteSpace: 'pre-wrap', maxHeight: 480, overflow: 'auto' }} role="status">{result}</pre></>}</section>}</div>;
}
