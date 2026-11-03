import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { RendererProps, VizKind } from './types';

/**
 * VisualizationRegistry. `satisfies Record<VizKind, ...>` makes dual-mode support a compile-time rule: a new
 * chart kind does not build until it has a 2D renderer and a 3D scene builder (see engine/builders/index.ts).
 */
const recharts = lazy(() => import('./two-d/recharts'));
const svg = lazy(() => import('./two-d/svg'));

export const vizRegistry = {
  bar: { label: 'Bar chart', renderer2D: recharts, technology2D: 'Recharts' },
  histogram: { label: 'Histogram', renderer2D: recharts, technology2D: 'Recharts' },
  line: { label: 'Line / area chart', renderer2D: recharts, technology2D: 'Recharts' },
  scatter: { label: 'Scatter plot', renderer2D: recharts, technology2D: 'Recharts' },
  donut: { label: 'Donut chart', renderer2D: svg, technology2D: 'SVG' },
  radial: { label: 'Radial / progress ring', renderer2D: svg, technology2D: 'SVG' },
  heatmap: { label: 'Heatmap', renderer2D: svg, technology2D: 'SVG' },
  treemap: { label: 'Treemap', renderer2D: svg, technology2D: 'SVG' },
  sparkline: { label: 'Sparkline', renderer2D: svg, technology2D: 'SVG' },
  wordcloud: { label: 'Word cloud', renderer2D: svg, technology2D: 'SVG' },
  timeline: { label: 'Timeline', renderer2D: svg, technology2D: 'SVG' },
  network: { label: 'Network graph', renderer2D: svg, technology2D: 'Canvas 2D' },
} satisfies Record<VizKind, { label: string; renderer2D: LazyExoticComponent<ComponentType<RendererProps>>; technology2D: string }>;

/** Dynamic so that three.js is never fetched until a chart actually renders in 3D. */
export const load3DRenderer = () => import('./components/ThreeDChartRenderer');
