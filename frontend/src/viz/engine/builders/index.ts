import type { VizKind, VizModel } from '../../types';
import type { BuildContext, BuiltScene, SceneBuilder } from '../scene';
import { buildBar, buildHeatmap, buildHistogram, buildLine, buildScatter, buildSparkline, buildTimeline } from './cartesian';
import { buildDonut, buildNetwork, buildRadial, buildTreemap, buildWordCloud } from './other';

const builders: { [K in VizKind]: SceneBuilder<Extract<VizModel, { kind: K }>> } = {
  bar: buildBar, histogram: buildHistogram, line: buildLine, sparkline: buildSparkline, heatmap: buildHeatmap, scatter: buildScatter,
  timeline: buildTimeline, donut: buildDonut, radial: buildRadial, treemap: buildTreemap, wordcloud: buildWordCloud, network: buildNetwork,
};

export function buildScene(model: VizModel, context: BuildContext): BuiltScene {
  return (builders[model.kind] as SceneBuilder<VizModel>)(model, context);
}
