import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { heatDatumId } from '../model';
import { useReducedMotion } from '../store';
import { rampColor, resolveToken } from '../palette';
import { arcLayout, formatValue, layoutWords, networkLayout, niceTicks, squarify } from '../scale';
import type { DonutModel, HeatmapModel, NetworkModel, RadialModel, RendererProps, SparklineModel, TimelineModel, TreemapModel, VizModel, WordCloudModel } from '../types';

function useSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 480, height: 260 });
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width > 0) setSize({ width: entry.contentRect.width, height: entry.contentRect.height }); });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}
const opacityFor = (id: string, activeId: string | null, selected: ReadonlySet<string>) => (activeId === null && selected.size === 0) || id === activeId || selected.has(id) ? 1 : .32;
const handlers = (id: string, { onHover, onSelect }: Pick<RendererProps, 'onHover' | 'onSelect'>) => ({
  onMouseEnter: (event: React.MouseEvent) => onHover(id, { x: event.clientX, y: event.clientY }),
  onMouseMove: (event: React.MouseEvent) => onHover(id, { x: event.clientX, y: event.clientY }),
  onClick: () => onSelect(id),
  'data-datum': id,
  style: { cursor: 'pointer' },
});

function arcPath(radius: number, inner: number, start: number, end: number, cx: number, cy: number) {
  const point = (r: number, angle: number) => `${cx + Math.sin(angle) * r} ${cy - Math.cos(angle) * r}`;
  const large = end - start > Math.PI ? 1 : 0;
  return `M${point(radius, start)}A${radius} ${radius} 0 ${large} 1 ${point(radius, end)}L${point(inner, end)}A${inner} ${inner} 0 ${large} 0 ${point(inner, start)}Z`;
}

function Donut(props: RendererProps & { model: DonutModel }) {
  const { model, activeId, selected } = props;
  const arcs = arcLayout(model.segments);
  const total = model.segments.reduce((sum, segment) => sum + Math.max(segment.value, 0), 0);
  return <svg className="viz-svg" viewBox="0 0 320 240" aria-hidden="true">
    {arcs.map(arc => {
      const single = arc.end - arc.start >= Math.PI * 2 - 1e-6;
      const focused = arc.item.id === activeId || selected.has(arc.item.id);
      const mid = (arc.start + arc.end) / 2, shift = focused ? 6 : 0;
      return <g key={arc.item.id} {...handlers(arc.item.id, props)} transform={`translate(${Math.sin(mid) * shift} ${-Math.cos(mid) * shift})`} opacity={opacityFor(arc.item.id, activeId, selected)}>
        {single ? <path d={`${arcPath(96, 60, 0, Math.PI, 160, 120)}${arcPath(96, 60, Math.PI, Math.PI * 2, 160, 120)}`} fill={`var(${arc.item.color})`} /> : <path d={arcPath(96, 60, arc.start, arc.end, 160, 120)} fill={`var(${arc.item.color})`} stroke="var(--bg-1)" strokeWidth={1.5} />}
        {arc.share >= .05 && <text x={160 + Math.sin(mid) * 112} y={120 - Math.cos(mid) * 112} textAnchor="middle" dominantBaseline="middle" className="viz-text-value">{(arc.share * 100).toFixed(1)}%</text>}
      </g>;
    })}
    <text x={160} y={120} textAnchor="middle" dominantBaseline="middle" className="viz-text-key">{formatValue(total, model.unit)}</text>
  </svg>;
}

function Radial(props: RendererProps & { model: RadialModel }) {
  const { model, activeId, selected } = props;
  const count = Math.max(model.metrics.length, 1);
  const stroke = Math.min(14, 72 / count), gap = stroke * 1.55;
  const lead = model.metrics[0];
  return <svg className="viz-svg" viewBox="0 0 320 240" aria-hidden="true">
    {model.metrics.map((metric, i) => {
      const radius = 104 - i * gap, share = Math.min(1, metric.value / metric.max);
      return <g key={metric.id} {...handlers(metric.id, props)} opacity={opacityFor(metric.id, activeId, selected)}>
        <circle cx={160} cy={120} r={radius} fill="none" stroke="var(--bg-3)" strokeWidth={stroke * .6} />
        <circle cx={160} cy={120} r={radius} fill="none" stroke={`var(${metric.color})`} strokeWidth={stroke} strokeLinecap="round" pathLength={100} strokeDasharray={`${share * 100} 100`} transform="rotate(-90 160 120)" />
      </g>;
    })}
    {lead && <text x={160} y={120} textAnchor="middle" dominantBaseline="middle" className="viz-text-key">{`${(lead.value / lead.max * 100).toFixed(lead.value % 1 ? 1 : 0)}%`}</text>}
  </svg>;
}

function Heatmap(props: RendererProps & { model: HeatmapModel }) {
  const { model, activeId, selected } = props;
  const host = useRef<HTMLDivElement>(null);
  const { width, height } = useSize(host);
  const left = 78, top = 8, bottom = 22;
  const columns = model.xLabels.length, rows = model.yLabels.length;
  const cellW = (width - left - 8) / Math.max(columns, 1), cellH = (height - top - bottom) / Math.max(rows, 1);
  const max = Math.max(1e-9, ...model.values.flat());
  const step = Math.ceil(columns / Math.max(1, Math.floor((width - left) / 42)));
  return <div ref={host} className="viz-fill"><svg width={width} height={height} aria-hidden="true">
    {model.values.map((row, y) => row.map((value, x) => {
      const id = heatDatumId(x, y), focused = id === activeId || selected.has(id);
      return <rect key={id} x={left + x * cellW + 1} y={top + y * cellH + 1} width={Math.max(cellW - 2, 1)} height={Math.max(cellH - 2, 1)} rx={3} fill={rampColor(value / max, resolveToken)} stroke={focused ? 'var(--text-hi)' : 'none'} {...handlers(id, props)} opacity={opacityFor(id, activeId, selected)} />;
    }))}
    {model.yLabels.map((label, y) => <text key={label} x={left - 8} y={top + (y + .5) * cellH} textAnchor="end" dominantBaseline="middle" className="viz-text-axis">{label}</text>)}
    {model.xLabels.map((label, x) => x % step === 0 && <text key={label} x={left + (x + .5) * cellW} y={height - 7} textAnchor="middle" className="viz-text-axis">{label}</text>)}
  </svg></div>;
}

function Treemap(props: RendererProps & { model: TreemapModel }) {
  const { model, activeId, selected } = props;
  const host = useRef<HTMLDivElement>(null);
  const { width, height } = useSize(host);
  const tiles = useMemo(() => squarify(model.nodes, width, height), [model.nodes, width, height]);
  return <div ref={host} className="viz-fill"><svg width={width} height={height} aria-hidden="true">
    {tiles.map(tile => {
      const color = model.groups.find(group => group.id === tile.item.group)?.color ?? '--cyan';
      const focused = tile.item.id === activeId || selected.has(tile.item.id);
      const fits = Math.floor((tile.w - 16) / 6.4);
      const show = fits >= 6 && tile.h > 34;
      const name = tile.item.label.length <= fits ? tile.item.label : `…${tile.item.label.slice(1 - fits)}`;
      return <g key={tile.item.id} {...handlers(tile.item.id, props)} opacity={opacityFor(tile.item.id, activeId, selected)}>
        <rect x={tile.x + 1} y={tile.y + 1} width={Math.max(tile.w - 2, 1)} height={Math.max(tile.h - 2, 1)} rx={4} fill={`color-mix(in srgb, var(${color}) 62%, var(--bg-0))`} stroke={focused ? 'var(--text-hi)' : `color-mix(in srgb, var(${color}) 40%, transparent)`} />
        {show && <><text x={tile.x + 9} y={tile.y + 17} className="viz-text-tile">{name}</text><text x={tile.x + 9} y={tile.y + 30} className="viz-text-tile-value">{formatValue(tile.item.value, model.unit)}</text></>}
      </g>;
    })}
  </svg></div>;
}

function Sparkline({ model, activeId, onHover, onSelect }: RendererProps & { model: SparklineModel }) {
  const host = useRef<HTMLDivElement>(null);
  const { width, height } = useSize(host);
  const count = model.values.length;
  const min = Math.min(...model.values), range = Math.max(...model.values) - min || 1;
  const x = (index: number) => 2 + (count > 1 ? index / (count - 1) : .5) * (width - 4);
  const y = (value: number) => height - 3 - (value - min) / range * (height - 8);
  const line = model.values.map((value, index) => `${x(index)},${y(value)}`).join(' ');
  const pick = (event: React.MouseEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const index = Math.max(0, Math.min(count - 1, Math.round((event.clientX - rect.left - 2) / Math.max(rect.width - 4, 1) * (count - 1))));
    return `${index}`;
  };
  const active = activeId === null ? null : Number(activeId);
  return <div ref={host} className="viz-fill"><svg width={width} height={height} aria-hidden="true" onMouseMove={event => onHover(pick(event), { x: event.clientX, y: event.clientY })} onMouseLeave={() => onHover(null)} onClick={event => onSelect(pick(event))}>
    <polygon points={`${x(0)},${height} ${line} ${x(count - 1)},${height}`} fill={`color-mix(in srgb, var(${model.color}) 18%, transparent)`} />
    <polyline points={line} fill="none" stroke={`var(${model.color})`} strokeWidth={1.75} strokeLinejoin="round" />
    {active !== null && model.values[active] !== undefined && <circle cx={x(active)} cy={y(model.values[active])} r={3} fill={`var(${model.color})`} stroke="var(--bg-0)" />}
  </svg></div>;
}

function WordCloud(props: RendererProps & { model: WordCloudModel }) {
  const { model, activeId, selected } = props;
  const words = useMemo(() => layoutWords(model.words, 640, 320), [model.words]);
  return <svg className="viz-svg" viewBox="-320 -160 640 320" aria-hidden="true">
    {words.map(word => <text key={word.id} x={word.x} y={word.y} textAnchor="middle" dominantBaseline="middle" fontSize={word.size} fill={`var(${model.categories.find(category => category.id === word.word.category)?.color ?? '--cyan'})`} fontFamily="var(--font-display)" fontWeight={500} {...handlers(word.id, props)} opacity={opacityFor(word.id, activeId, selected)}>{word.text}</text>)}
  </svg>;
}

function Timeline(props: RendererProps & { model: TimelineModel }) {
  const { model, activeId, selected } = props;
  const host = useRef<HTMLDivElement>(null);
  const { width, height } = useSize(host);
  const left = 88, right = 18, bottom = 24, top = 10;
  const times = model.events.map(event => event.time);
  const min = Math.min(...times), max = Math.max(...times), range = max - min || 1;
  const x = (time: number) => left + (time - min) / range * (width - left - right);
  const rowHeight = (height - top - bottom) / Math.max(model.lanes.length, 1);
  const peak = niceTicks(Math.max(0, ...model.events.map(event => event.value))).at(-1) ?? 1;
  const baseline = (lane: string) => top + (model.lanes.findIndex(item => item.id === lane) + 1) * rowHeight - 4;
  return <div ref={host} className="viz-fill"><svg width={width} height={height} aria-hidden="true">
    {model.lanes.map(lane => <g key={lane.id}><line x1={left} x2={width - right} y1={baseline(lane.id)} y2={baseline(lane.id)} stroke="var(--line-strong)" /><text x={left - 8} y={baseline(lane.id)} textAnchor="end" className="viz-text-axis">{lane.label}</text></g>)}
    {model.events.map(event => {
      const lane = model.lanes.find(item => item.id === event.lane);
      const stem = event.value / peak * (rowHeight - 10), focused = event.id === activeId || selected.has(event.id);
      return <g key={event.id} {...handlers(event.id, props)} opacity={opacityFor(event.id, activeId, selected)}>
        <line x1={x(event.time)} x2={x(event.time)} y1={baseline(event.lane)} y2={baseline(event.lane) - stem} stroke={`var(${lane?.color ?? '--cyan'})`} strokeWidth={2} />
        <circle cx={x(event.time)} cy={baseline(event.lane) - stem} r={focused ? 5 : 3.5} fill={`var(${lane?.color ?? '--cyan'})`} stroke={focused ? 'var(--text-hi)' : 'none'} />
      </g>;
    })}
    {niceTicks(range, 5).map(tick => min + tick <= max && <text key={tick} x={x(min + tick)} y={height - 7} textAnchor="middle" className="viz-text-axis">{formatValue(min + tick)}</text>)}
  </svg></div>;
}

/** Compact network for previews. The full M4 graph extends this Canvas2D path with d3-force interaction. */
function Network({ model, activeId, selected, onHover, onSelect }: RendererProps & { model: NetworkModel }) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const { width, height } = useSize(host);
  const nodes = useMemo(() => { const ids = new Set(model.nodes.map(node => node.id)); return networkLayout(model).filter(node => ids.has(node.id)); }, [model]);
  const place = useMemo(() => {
    const scale = Math.min(width, height) / 2 * .9;
    return (node: { x: number; y: number }) => ({ x: width / 2 + node.x * scale * Math.min(1.5, width / height), y: height / 2 + node.y * scale });
  }, [width, height]);
  const reduced = useReducedMotion();
  const flowing = !!model.flow && !reduced;
  useEffect(() => {
    const element = canvas.current, context = element?.getContext('2d');
    if (!element || !context) return;
    const ratio = window.devicePixelRatio || 1;
    element.width = width * ratio; element.height = height * ratio;
    let frame = 0, last = 0, visible = true;
    const observer = flowing ? new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }) : null;
    observer?.observe(element);
    const tick = (time: number) => {
      frame = requestAnimationFrame(tick);
      if (!visible || document.hidden || time - last < 33) return;
      last = time;
      draw(time / 60);
    };
    draw(0);
    if (flowing) frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); };
    function draw(offset: number) {
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const byId = new Map(nodes.map(node => [node.id, node]));
    const focus = activeId ?? [...selected][selected.size - 1] ?? null;
    const neighbors = new Set<string>();
    model.edges.forEach(edge => { if (edge.source === focus) neighbors.add(edge.target); if (edge.target === focus) neighbors.add(edge.source); });
    const edgeColor = { imports: resolveToken('--blue'), inherits: resolveToken('--violet'), calls: resolveToken('--cyan'), contains: resolveToken('--text-low') };
    model.edges.forEach(edge => {
      const a = byId.get(edge.source), b = byId.get(edge.target);
      if (!a || !b) return;
      const from = place(a), to = place(b);
      const linked = focus !== null && (edge.source === focus || edge.target === focus);
      context.globalAlpha = focus === null ? (edge.kind === 'contains' ? .16 : .34) : linked ? .95 : .06;
      context.strokeStyle = linked ? resolveToken('--text-hi') : edgeColor[edge.kind];
      context.lineWidth = linked ? 1.3 : .8;
      context.setLineDash(model.flow && edge.kind === 'imports' ? [6, 5] : edge.kind === 'inherits' ? [5, 3] : edge.kind === 'calls' ? [1.5, 3] : []);
      context.lineDashOffset = model.flow ? -offset : 0;
      context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); context.stroke();
    });
    context.setLineDash([]);
    context.lineDashOffset = 0;
    nodes.forEach(node => {
      const { x, y } = place(node);
      const radius = 2.2 + 1.5 * Math.sqrt(node.degree);
      const color = resolveToken(model.clusters.find(cluster => cluster.id === node.cluster)?.color ?? '--cyan');
      context.globalAlpha = focus === null || node.id === focus || neighbors.has(node.id) ? 1 : .18;
      context.fillStyle = color;
      context.shadowColor = color;
      context.shadowBlur = node.degree > 6 ? 12 : 0;
      context.beginPath(); context.arc(x, y, node.id === focus ? radius * 1.5 : radius, 0, Math.PI * 2); context.fill();
    });
    context.shadowBlur = 0;
    context.globalAlpha = 1;
    context.fillStyle = resolveToken('--text-mid');
    context.font = `10px ${resolveToken('--font-mono')}`;
    context.textAlign = 'center';
    context.strokeStyle = resolveToken('--bg-0');
    context.lineWidth = 3;
    context.fillStyle = resolveToken('--text-hi');
    [...nodes].sort((a, b) => b.degree - a.degree).slice(0, 8).forEach(node => { const { x, y } = place(node); context.strokeText(node.label, x, y - 8 - Math.sqrt(node.degree)); context.fillText(node.label, x, y - 8 - Math.sqrt(node.degree)); });
    }
  }, [model.edges, model.clusters, model.flow, flowing, nodes, place, activeId, selected, width, height]);
  const pick = (event: React.MouseEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    let best: string | null = null, bestDistance = 12;
    nodes.forEach(node => { const at = place(node), distance = Math.hypot(at.x - x, at.y - y); if (distance < bestDistance) { bestDistance = distance; best = node.id; } });
    return best;
  };
  return <div ref={host} className="viz-fill"><canvas ref={canvas} style={{ width, height, display: 'block', cursor: 'crosshair' }} aria-hidden="true" onMouseMove={event => onHover(pick(event), { x: event.clientX, y: event.clientY })} onMouseLeave={() => onHover(null)} onClick={event => { const id = pick(event); if (id) onSelect(id); }} /></div>;
}

export default function SvgRenderer(props: RendererProps) {
  const model: VizModel = props.model;
  switch (model.kind) {
    case 'donut': return <Donut {...props} model={model} />;
    case 'radial': return <Radial {...props} model={model} />;
    case 'heatmap': return <Heatmap {...props} model={model} />;
    case 'treemap': return <Treemap {...props} model={model} />;
    case 'sparkline': return <Sparkline {...props} model={model} />;
    case 'wordcloud': return <WordCloud {...props} model={model} />;
    case 'timeline': return <Timeline {...props} model={model} />;
    case 'network': return <Network {...props} model={model} />;
    default: return null;
  }
}
