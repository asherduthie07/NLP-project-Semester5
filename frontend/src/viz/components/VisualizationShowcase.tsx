import { useEffect, useState } from 'react';
import { Card } from '../../components/ui';
import { vizDemo } from '../../data/vizDemo';
import analysis from '../../../../docs/07-findings/phase-2/analysis.json';
import type { ExploratoryStatistics } from '../../data/api';
import { exploratoryModels } from '../adapters/backend';
import { detectWebGL } from '../capability';
import type { EngineDiagnostics } from '../engine/engine';
import { useResolvedMode } from '../store';
import type { Provenance } from '../types';
import { ModeSwitch, VisualizationContainer } from './VisualizationContainer';

declare global { interface Window { __codeatlasViz?: { diagnostics: () => EngineDiagnostics } } }

const measured: Provenance = { kind: 'measured', source: `Phase II ${analysis.analyzer_version} over the ${analysis.provenance}` };
const stats = exploratoryModels(analysis.statistics as unknown as ExploratoryStatistics, measured);

function RenderConsole() {
  const resolved = useResolvedMode();
  const capability = detectWebGL();
  const [diagnostics, setDiagnostics] = useState<EngineDiagnostics | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setDiagnostics(window.__codeatlasViz?.diagnostics() ?? null), 1000);
    return () => clearInterval(timer);
  }, []);
  return <Card className="viz-console" data-testid="viz-console">
    <ModeSwitch />
    <p className="viz-console-copy">Sets every chart below. A chart can override it from its own toolbar; choosing here clears those overrides. Saved in this browser.</p>
    <div className="viz-console-meta">
      <span>MODE <b data-testid="global-mode">{resolved.mode.toUpperCase()}</b> <span>({resolved.source})</span></span>
      <span>GPU <b data-testid="gpu-tier">{capability.tier}</b></span>
      <span>WEBGL CONTEXTS <b data-testid="viz-contexts">{diagnostics?.contexts ?? 0}</b></span>
      <span>LIVE STAGES <b>{diagnostics?.stages ?? 0}</b></span>
      <span>QUALITY <b>{diagnostics?.quality ?? 'n/a'}</b></span>
      <span>JS FRAME <b>{diagnostics && diagnostics.frames ? `${diagnostics.averageFrameMs.toFixed(1)} ms` : 'n/a'}</b></span>
    </div>
  </Card>;
}

export default function VisualizationShowcase() {
  const [attempt, setAttempt] = useState(0);
  return <>
    <RenderConsole />
    <div className="viz-kpis">{vizDemo.sparklines.map((model, index) => <Card className="viz-kpi" key={model.id}>
      <strong className="mono">{model.values[model.values.length - 1]}</strong>
      <span>{model.title} · illustrative</span>
      <VisualizationContainer id={model.id} state={{ status: 'ready', model }} compact height={46} key={index} />
    </Card>)}</div>

    <div className="viz-subhead"><h3>Chart kinds</h3><p>Sample data. Every kind renders real geometry in 3D and a full chart in 2D from one model.</p></div>
    <div className="viz-gallery">
      <VisualizationContainer className="span-8" featured id={vizDemo.coverage.id} state={{ status: 'ready', model: vizDemo.coverage }} height={300} />
      <VisualizationContainer id={vizDemo.completeness.id} state={{ status: 'ready', model: vizDemo.completeness }} height={300} />
      <VisualizationContainer className="span-6" id={vizDemo.groupedBars.id} state={{ status: 'ready', model: vizDemo.groupedBars }} />
      <VisualizationContainer className="span-6" id={vizDemo.stackedBars.id} state={{ status: 'ready', model: vizDemo.stackedBars }} />
      <VisualizationContainer id={vizDemo.claims.id} state={{ status: 'ready', model: vizDemo.claims }} />
      <VisualizationContainer className="span-8" id={vizDemo.gaps.id} state={{ status: 'ready', model: vizDemo.gaps }} />
      <VisualizationContainer className="span-6" id={vizDemo.sizes.id} state={{ status: 'ready', model: vizDemo.sizes }} height={300} />
      <VisualizationContainer className="span-6" id={vizDemo.fan.id} state={{ status: 'ready', model: vizDemo.fan }} height={300} />
      <VisualizationContainer id={vizDemo.fanFlat.id} state={{ status: 'ready', model: vizDemo.fanFlat }} />
      <VisualizationContainer id={vizDemo.lengths.id} state={{ status: 'ready', model: vizDemo.lengths }} />
      <VisualizationContainer id={vizDemo.words.id} state={{ status: 'ready', model: vizDemo.words }} />
      <VisualizationContainer className="span-6" id={vizDemo.activity.id} state={{ status: 'ready', model: vizDemo.activity }} height={300} />
      <VisualizationContainer className="span-6" id={vizDemo.network.id} state={{ status: 'ready', model: vizDemo.network }} height={300} />
    </div>

    <div className="viz-subhead"><h3>Measured data</h3><p>Real Phase II statistics for the synthetic fixture corpus, passed through the backend adapter. Code and documentation vocabularies stay separate.</p></div>
    <div className="viz-gallery">
      <VisualizationContainer className="span-6" id={stats.identifiers.id} state={{ status: 'ready', model: stats.identifiers }} />
      <VisualizationContainer className="span-6" id={stats.documentationTerms.id} state={{ status: 'ready', model: stats.documentationTerms }} />
      <VisualizationContainer id={stats.tokenCategories.id} state={{ status: 'ready', model: stats.tokenCategories }} />
      <VisualizationContainer id={stats.identifierLengths.id} state={{ status: 'ready', model: stats.identifierLengths }} />
      <VisualizationContainer id={stats.documentationByKind.id} state={{ status: 'ready', model: stats.documentationByKind }} />
    </div>

    <div className="viz-subhead"><h3>Honest states</h3><p>What a chart shows instead of data. A failed request never falls back to sample values.</p></div>
    <div className="viz-gallery">
      <VisualizationContainer id="state-loading" title="Loading" state={{ status: 'loading' }} height={150} />
      <VisualizationContainer id="state-empty" title="Empty" state={{ status: 'empty', message: 'This snapshot has no circular dependencies.' }} height={150} />
      <VisualizationContainer key={attempt} id="state-error" title="Request failed" state={{ status: 'error', message: `The analysis API did not respond (attempt ${attempt + 1}).`, onRetry: () => setAttempt(value => value + 1) }} height={150} />
      <VisualizationContainer className="span-12" id="state-phase4" title="NER precision, recall and F1" state={{ status: 'unavailable', title: 'Not evaluated', message: 'Coming in Phase IV. No model has been trained or scored, so no metrics are shown.' }} height={120} />
    </div>
  </>;
}
