import { useState } from 'react';
import { Link } from 'react-router-dom';
import { createRealApi, type Job } from '../../data/api';
import { dataConfig, getApiKey, useDataStore } from '../../data/source';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function completed(api: ReturnType<typeof createRealApi>, job: Job): Promise<Job> {
  for (let attempt = 0; attempt < 120; attempt++) {
    const current = await api.getJob(job.id);
    if (current.status === 'complete') return current;
    if (current.status === 'failed') throw new Error(`${current.kind} failed: ${(current.issues ?? []).map(issue => issue.message).join('; ')}`);
    await pause(1000);
  }
  throw new Error(`${job.kind} is still running. Revisit this page and check job ${job.id}.`);
}

export function WorkflowPage() {
  const setMode = useDataStore(state => state.setMode);
  const selectRepository = useDataStore(state => state.selectRepository);
  const setJobId = useDataStore(state => state.setJobId);
  const refreshRepositories = useDataStore(state => state.refreshRepositories);
  const [files, setFiles] = useState<File[]>([]);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('Imported repository');
  const [stage, setStage] = useState('Ready');
  const [busy, setBusy] = useState(false);
  const [jobId, showJob] = useState('');
  const base = dataConfig().apiBase;
  async function run() {
    setBusy(true);
    showJob('');
    try {
      const api = createRealApi(`${base}/api/v1`, getApiKey);
      setStage('Uploading source');
      let snapshot;
      if (url.trim()) {
        const imported = await completed(api, await api.importGitHub(url.trim(), name));
        if (!imported.snapshot_id) throw new Error('GitHub import finished without a snapshot');
        const projects = await api.getProjects();
        const project = projects.find(item => item.id === imported.project_id);
        if (!project) throw new Error('Imported project could not be found');
        snapshot = (await api.getSnapshots(project.id!)).find(item => item.id === imported.snapshot_id);
      } else if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) snapshot = await api.importZip(files[0], name);
      else if (files.length) snapshot = await api.importFiles(files, name);
      else throw new Error('Choose Python/Java files, a ZIP, or a public GitHub URL.');
      if (!snapshot) throw new Error('Import produced no snapshot');
      setStage('Preprocessing source');
      await completed(api, await api.startPreprocessing(snapshot.id));
      setStage('Analyzing structure');
      const analysis = await completed(api, await api.startAnalysis(snapshot.id));
      setMode('live');
      selectRepository(snapshot.project_id!, snapshot.id);
      setJobId(snapshot.id, analysis.id);
      refreshRepositories();
      showJob(analysis.id);
      setStage('Analysis complete. Open the dashboards and generate documentation.');
    } catch (error) { setStage(error instanceof Error ? error.message : 'Workflow failed'); }
    finally { setBusy(false); }
  }
  return <div className="page-frame"><header className="page-head"><div className="page-eyebrow">Live source workflow</div><h1>Import &amp; Analyze</h1><p>Python and Java files, ZIP archive, or a public GitHub repository.</p></header>
    <div className="panel-grid two"><section className="panel" style={{ padding: 24 }}><label className="field"><span>Repository name</span><input value={name} onChange={event => setName(event.target.value)} /></label>
      <label className="field"><span>Source files or one ZIP</span><input type="file" multiple accept=".py,.java,.zip" onChange={event => setFiles(Array.from(event.target.files ?? []))} /></label>
      <label className="field"><span>Or public GitHub URL</span><input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://github.com/owner/repository" /></label>
      <button type="button" disabled={busy} onClick={run}>{busy ? 'Working…' : 'Upload and analyze'}</button>
      <p role="status">{stage}</p>{jobId && <p>Analysis job: <code>{jobId}</code></p>}</section>
      <section className="panel" style={{ padding: 24 }}><h2>Results</h2><p>Generated summaries retain source references. Behavioral claims require review.</p>
      {jobId && <nav style={{ display: 'grid', gap: 12 }}><Link to="/app/overview">Repository Overview</Link><Link to="/app/explorer">Codebase Explorer</Link><Link to="/app/graph">Knowledge Graph</Link><Link to="/app/intelligence">NLP Intelligence</Link><Link to="/app/docs">Documentation Studio</Link><Link to="/app/verification">Verification</Link><Link to="/app/exports">Exports</Link></nav>}</section></div></div>;
}
