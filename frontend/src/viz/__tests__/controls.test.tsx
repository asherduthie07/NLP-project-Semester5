import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vizDemo } from '../../data/vizDemo';
import { classifyRenderer, detectWebGL, resetCapabilityForTests } from '../capability';
import { DataTableView, ChartLegend, ModeSwitch, VisualizationContainer } from '../components/VisualizationContainer';
import { useSelectionStore } from '../selection';
import { qualityFor, resolveMode, useVizStore } from '../store';
import { toTable } from '../model';

const reset = () => {
  useVizStore.setState({ globalMode: '2d', overrides: {}, webglFailed: false, motion: 'system' });
  useSelectionStore.setState({ selected: {}, hovered: {} });
};
const hardware = { tier: 'high', reason: 'ok' } as const;

describe('resolveMode', () => {
  it('defaults to 3D on capable devices and 2D otherwise', () => {
    expect(resolveMode({ global: null, capability: hardware, failed: false, reducedMotion: false })).toMatchObject({ mode: '3d', source: 'auto' });
    expect(resolveMode({ global: null, capability: { tier: 'low', reason: '' }, failed: false, reducedMotion: false }).mode).toBe('3d');
    expect(resolveMode({ global: null, capability: { tier: 'software', reason: '' }, failed: false, reducedMotion: false }).mode).toBe('2d');
    expect(resolveMode({ global: null, capability: hardware, failed: false, reducedMotion: true }).mode).toBe('2d');
  });
  it('applies chart override over global, and hardware limits over both', () => {
    expect(resolveMode({ global: '2d', override: '3d', capability: hardware, failed: false, reducedMotion: false })).toMatchObject({ mode: '3d', source: 'override' });
    expect(resolveMode({ global: '3d', capability: hardware, failed: false, reducedMotion: true })).toMatchObject({ mode: '3d', source: 'global' });
    expect(resolveMode({ global: '3d', override: '3d', capability: { tier: 'none', reason: 'No WebGL' }, failed: false, reducedMotion: false })).toMatchObject({ mode: '2d', source: 'fallback', reason: 'No WebGL' });
    expect(resolveMode({ global: '3d', override: '3d', capability: hardware, failed: true, reducedMotion: false })).toMatchObject({ mode: '2d', source: 'fallback' });
  });
});

describe('capability', () => {
  it('classifies renderers', () => {
    expect(classifyRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)', 8, 8)).toBe('software');
    expect(classifyRenderer('ANGLE (Intel, Intel(R) HD Graphics 520 Direct3D11)', 8, 8)).toBe('low');
    expect(classifyRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)', 12, 16)).toBe('high');
    expect(classifyRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)', 4, 16)).toBe('low');
  });
  it('reports no WebGL when no context is available', () => {
    resetCapabilityForTests();
    expect(detectWebGL()).toMatchObject({ tier: 'none', renderer: null });
    resetCapabilityForTests();
  });
  it('maps quality from tier unless the user chose one', () => {
    expect(qualityFor('auto', 'high').name).toBe('high');
    expect(qualityFor('auto', 'low').name).toBe('medium');
    expect(qualityFor('auto', 'software').name).toBe('low');
    expect(qualityFor('high', 'software').name).toBe('high');
  });
});

describe('preferences', () => {
  beforeEach(reset);
  it('persists the global mode and clears overrides when it changes', () => {
    act(() => useVizStore.getState().setOverride('chart', '3d'));
    act(() => useVizStore.getState().setGlobalMode('3d'));
    expect(useVizStore.getState().overrides).toEqual({});
    const saved = JSON.parse(localStorage.getItem('codeatlas.viz.v1')!).state;
    expect(saved.globalMode).toBe('3d');
    expect(saved.webglFailed).toBeUndefined();
  });
  it('stores and removes per-chart overrides', () => {
    act(() => useVizStore.getState().setOverride('chart', '2d'));
    expect(JSON.parse(localStorage.getItem('codeatlas.viz.v1')!).state.overrides).toEqual({ chart: '2d' });
    act(() => useVizStore.getState().setOverride('chart', null));
    expect(useVizStore.getState().overrides).toEqual({});
  });
});

describe('ModeSwitch', () => {
  beforeEach(reset);
  it('offers 2D only, with the reason, when WebGL is unavailable', () => {
    resetCapabilityForTests();
    render(<ModeSwitch />);
    const group = screen.getByRole('radiogroup', { name: 'Visualization mode for all charts' });
    expect(within(group).getByRole('radio', { name: '3D' })).toBeDisabled();
    expect(within(group).getByRole('radio', { name: '2D' })).toHaveAttribute('aria-checked', 'true');
    expect(group.title).toMatch(/WebGL/);
  });
});

describe('ChartLegend', () => {
  it('reports toggles and exposes state', async () => {
    const onToggle = vi.fn();
    render(<ChartLegend model={vizDemo.groupedBars} hidden={new Set(['documented'])} onToggle={onToggle} />);
    expect(screen.getByRole('button', { name: 'Total' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Documented' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'Total' }));
    expect(onToggle).toHaveBeenCalledWith('total');
  });
  it('shows a labeled scale for heatmaps', () => {
    const values = vizDemo.gaps.values.flat();
    render(<ChartLegend model={vizDemo.gaps} hidden={new Set()} onToggle={() => undefined} />);
    expect(screen.getByText(String(Math.max(...values)))).toBeInTheDocument();
    expect(screen.getByText('gaps')).toBeInTheDocument();
  });
});

describe('DataTableView', () => {
  it('lists exactly the model values', () => {
    render(<DataTableView model={vizDemo.claims} />);
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(toTable(vizDemo.claims).rows.length + 1);
    expect(within(table).getByRole('rowheader', { name: 'Verified' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: '3,305' })).toBeInTheDocument();
  });
});

describe('VisualizationContainer states', () => {
  beforeEach(reset);
  it('shows loading', () => {
    render(<VisualizationContainer id="a" title="Chart" state={{ status: 'loading' }} />);
    expect(screen.getByRole('status', { name: 'Loading chart' })).toBeInTheDocument();
  });
  it('shows empty with its reason', () => {
    render(<VisualizationContainer id="a" title="Chart" state={{ status: 'empty', message: 'Nothing here.' }} />);
    expect(screen.getByText('No data')).toBeInTheDocument();
    expect(screen.getByText('Nothing here.')).toBeInTheDocument();
  });
  it('treats a ready model with no values as empty, not as a blank chart', () => {
    render(<VisualizationContainer id="a" state={{ status: 'ready', model: { ...vizDemo.claims, segments: [] } }} />);
    expect(screen.getByText('No data')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Claim status' })).toBeInTheDocument();
  });
  it('shows an error as an alert with retry, and no chart or sample data', async () => {
    const onRetry = vi.fn();
    render(<VisualizationContainer id="a" title="Chart" state={{ status: 'error', message: 'API down', onRetry }} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('API down');
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText(/Illustrative|Demo data/)).toBeNull();
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
  it('shows later-phase capabilities as unavailable', () => {
    render(<VisualizationContainer id="a" title="NER F1" state={{ status: 'unavailable', title: 'Not evaluated', message: 'Coming in Phase IV.' }} />);
    expect(screen.getByText('Not evaluated')).toBeInTheDocument();
    expect(screen.queryByText(/%/)).toBeNull();
  });
});
