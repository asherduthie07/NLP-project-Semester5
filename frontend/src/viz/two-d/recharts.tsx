import { useId, useMemo } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Rectangle, ReferenceDot, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { barDatumId, valueTicks } from '../model';
import { formatValue, niceTicks } from '../scale';
import { useReducedMotion, useVizStore } from '../store';
import type { BarModel, HistogramModel, LineModel, RendererProps, ScatterModel, VizModel } from '../types';

const axisTick = { fill: 'var(--text-mid)', fontSize: 10, fontFamily: 'var(--font-mono)' };
const axisProps = { tick: axisTick, tickLine: false, axisLine: { stroke: 'var(--line-strong)' } };
const NoTooltip = () => null;

function useAnimated() {
  const reduced = useReducedMotion();
  return useVizStore(state => state.chartAnimation) && !reduced;
}
function pointerOf(event: unknown): { x: number; y: number } | undefined {
  const mouse = event as { clientX?: number; clientY?: number } | undefined;
  return mouse?.clientX === undefined ? undefined : { x: mouse.clientX, y: mouse.clientY ?? 0 };
}
const dimmed = (id: string, activeId: string | null, selected: ReadonlySet<string>) => (activeId === null && selected.size === 0) || id === activeId || selected.has(id) ? 1 : .32;

function Bars({ model, activeId, selected, onHover, onSelect }: RendererProps & { model: BarModel }) {
  const animated = useAnimated();
  const ticks = valueTicks(model);
  const rows = useMemo(() => model.categories.map((category, index) => ({ id: category.id, label: category.label, ...Object.fromEntries(model.series.map(series => [series.id, series.values[index]])) })), [model]);
  const horizontal = model.orientation === 'horizontal';
  const label = { value: model.unit ?? model.valueLabel, fill: 'var(--text-mid)', fontSize: 9, fontFamily: 'var(--font-mono)' };
  const value = { type: 'number' as const, domain: [0, ticks[ticks.length - 1]], ticks, tickFormatter: (tick: number) => formatValue(tick), ...axisProps };
  const category = { type: 'category' as const, dataKey: 'label', interval: 0, ...axisProps };
  return <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 200 }}>
    <BarChart accessibilityLayer={false} data={rows} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 12, right: 18, bottom: 4, left: 4 }} barCategoryGap="22%" onMouseLeave={() => onHover(null)}>
      <CartesianGrid stroke="var(--line)" vertical={horizontal} horizontal={!horizontal} />
      {horizontal ? <><XAxis {...value} /><YAxis {...category} width={108} /></> : <><XAxis {...category} /><YAxis {...value} width={46} label={{ ...label, angle: -90, position: 'insideLeft' }} /></>}
      <Tooltip content={NoTooltip} cursor={{ fill: 'var(--line)' }} />
      {model.series.map(series => <Bar key={series.id} dataKey={series.id} name={series.label} stackId={model.layout === 'stacked' ? 'stack' : undefined} fill={`var(${series.color})`} isAnimationActive={animated} animationDuration={700}
        shape={(props: unknown) => {
          const shape = props as { index: number } & Record<string, unknown>;
          const id = barDatumId(model.categories[shape.index]?.id ?? '', series.id);
          return <Rectangle {...shape} radius={horizontal ? [0, 3, 3, 0] : model.layout === 'stacked' ? 0 : [3, 3, 0, 0]} fillOpacity={dimmed(id, activeId, selected)} stroke={selected.has(id) ? 'var(--text-hi)' : 'none'} onMouseEnter={event => onHover(id, pointerOf(event))} onMouseMove={event => onHover(id, pointerOf(event))} onClick={() => onSelect(id)} style={{ cursor: 'pointer', transition: 'fill-opacity var(--duration-fast)' }} />;
        }} />)}
    </BarChart>
  </ResponsiveContainer>;
}

function Histogram({ model, activeId, selected, onHover, onSelect }: RendererProps & { model: HistogramModel }) {
  const animated = useAnimated();
  const ticks = valueTicks(model);
  const rows = useMemo(() => model.bins.map(bin => ({ id: bin.id, label: `${bin.x0}`, count: bin.count })), [model]);
  return <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 200 }}>
    <BarChart accessibilityLayer={false} data={rows} margin={{ top: 12, right: 18, bottom: 4, left: 4 }} barCategoryGap={1} onMouseLeave={() => onHover(null)}>
      <CartesianGrid stroke="var(--line)" vertical={false} />
      <XAxis dataKey="label" {...axisProps} />
      <YAxis type="number" domain={[0, ticks[ticks.length - 1]]} ticks={ticks} width={46} {...axisProps} />
      <Tooltip content={NoTooltip} cursor={{ fill: 'var(--line)' }} />
      <Bar dataKey="count" fill={`var(${model.color})`} isAnimationActive={animated} animationDuration={700}
        shape={(props: unknown) => {
          const shape = props as { index: number } & Record<string, unknown>;
          const id = model.bins[shape.index]?.id ?? '';
          return <Rectangle {...shape} radius={[2, 2, 0, 0]} fillOpacity={dimmed(id, activeId, selected)} stroke={selected.has(id) ? 'var(--text-hi)' : 'none'} onMouseEnter={event => onHover(id, pointerOf(event))} onMouseMove={event => onHover(id, pointerOf(event))} onClick={() => onSelect(id)} style={{ cursor: 'pointer' }} />;
        }} />
    </BarChart>
  </ResponsiveContainer>;
}

function Lines({ model, activeId, selected, onHover, onSelect }: RendererProps & { model: LineModel }) {
  const animated = useAnimated();
  const uid = useId().replace(/:/g, '');
  const ticks = valueTicks(model);
  const rows = useMemo(() => model.categories.map((category, index) => ({ id: category.id, label: category.label, ...Object.fromEntries(model.series.map(series => [series.id, series.values[index]])) })), [model]);
  const focus = activeId ?? [...selected][selected.size - 1] ?? null;
  const focusIndex = model.categories.findIndex(category => category.id === focus);
  return <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 200 }}>
    <AreaChart accessibilityLayer={false} data={rows} margin={{ top: 12, right: 18, bottom: 4, left: 4 }}
      onMouseMove={(state: { activeTooltipIndex?: number | string | null }, event: unknown) => {
        const index = Number(state.activeTooltipIndex);
        if (state.activeTooltipIndex !== null && state.activeTooltipIndex !== undefined && model.categories[index]) onHover(model.categories[index].id, pointerOf(event));
      }}
      onMouseLeave={() => onHover(null)}
      onClick={(state: { activeTooltipIndex?: number | string | null }) => {
        const category = model.categories[Number(state.activeTooltipIndex)];
        if (category) onSelect(category.id);
      }}>
      <defs>{model.series.map(series => <linearGradient key={series.id} id={`${uid}-${series.id}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={`var(${series.color})`} stopOpacity={model.variant === 'area' ? .42 : .08} /><stop offset="1" stopColor={`var(${series.color})`} stopOpacity={0} /></linearGradient>)}</defs>
      <CartesianGrid stroke="var(--line)" vertical={false} />
      <XAxis dataKey="label" minTickGap={24} {...axisProps} />
      <YAxis type="number" domain={[0, ticks[ticks.length - 1]]} ticks={ticks} width={46} tickFormatter={(tick: number) => formatValue(tick)} {...axisProps} />
      <Tooltip content={NoTooltip} cursor={false} />
      {model.series.map(series => <Area key={series.id} type="monotone" dataKey={series.id} name={series.label} stroke={`var(${series.color})`} strokeWidth={2} fill={`url(#${uid}-${series.id})`} dot={false} activeDot={false} isAnimationActive={animated} animationDuration={900} style={{ filter: `drop-shadow(0 0 5px color-mix(in srgb, var(${series.color}) 45%, transparent))` }} />)}
      {focusIndex >= 0 && <ReferenceLine x={model.categories[focusIndex].label} stroke="var(--text-mid)" strokeDasharray="3 3" />}
      {focusIndex >= 0 && model.series.map(series => <ReferenceDot key={series.id} x={model.categories[focusIndex].label} y={series.values[focusIndex]} r={4} fill={`var(${series.color})`} stroke="var(--bg-0)" strokeWidth={2} />)}
    </AreaChart>
  </ResponsiveContainer>;
}

function Points({ model, activeId, selected, onHover, onSelect }: RendererProps & { model: ScatterModel }) {
  const animated = useAnimated();
  const xTicks = niceTicks(Math.max(0, ...model.points.map(point => point.x)));
  const yTicks = niceTicks(Math.max(0, ...model.points.map(point => point.y)));
  return <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 200 }}>
    <ScatterChart accessibilityLayer={false} margin={{ top: 12, right: 18, bottom: 16, left: 4 }} onMouseLeave={() => onHover(null)}>
      <CartesianGrid stroke="var(--line)" />
      <XAxis type="number" dataKey="x" name={model.xLabel} domain={[0, xTicks[xTicks.length - 1]]} ticks={xTicks} {...axisProps} label={{ value: model.xLabel, position: 'insideBottom', offset: -10, fill: 'var(--text-mid)', fontSize: 9, fontFamily: 'var(--font-mono)' }} />
      <YAxis type="number" dataKey="y" name={model.yLabel} domain={[0, yTicks[yTicks.length - 1]]} ticks={yTicks} width={46} {...axisProps} label={{ value: model.yLabel, angle: -90, position: 'insideLeft', fill: 'var(--text-mid)', fontSize: 9, fontFamily: 'var(--font-mono)' }} />
      {/* A third measured quantity is shown as point size in 2D, so no measured dimension is dropped. */}
      {model.zLabel ? <ZAxis type="number" dataKey="z" range={[24, 240]} name={model.zLabel} /> : <ZAxis type="number" range={[64, 64]} />}
      <Tooltip content={NoTooltip} cursor={false} />
      {model.groups.map(group => <Scatter key={group.id} name={group.label} data={model.points.filter(point => point.group === group.id)} fill={`var(${group.color})`} isAnimationActive={animated}
        shape={(props: unknown) => {
          const shape = props as { cx: number; cy: number; width?: number; payload: { id: string } };
          const id = shape.payload.id, focused = id === activeId || selected.has(id);
          const radius = (shape.width ?? 8) / 2;
          return <circle cx={shape.cx} cy={shape.cy} r={focused ? radius * 1.5 : radius} fill={`var(${group.color})`} fillOpacity={dimmed(id, activeId, selected) * .9} stroke={focused ? 'var(--text-hi)' : 'none'} onMouseEnter={event => onHover(id, pointerOf(event))} onMouseMove={event => onHover(id, pointerOf(event))} onClick={() => onSelect(id)} style={{ cursor: 'pointer' }} />;
        }} />)}
    </ScatterChart>
  </ResponsiveContainer>;
}

export default function RechartsRenderer(props: RendererProps) {
  const model: VizModel = props.model;
  switch (model.kind) {
    case 'bar': return <Bars {...props} model={model} />;
    case 'histogram': return <Histogram {...props} model={model} />;
    case 'line': return <Lines {...props} model={model} />;
    case 'scatter': return <Points {...props} model={model} />;
    default: return null;
  }
}
