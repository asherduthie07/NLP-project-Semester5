import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { detectWebGL, type GpuTier, type WebGLCapability } from './capability';
import type { VizMode } from './types';

export type QualityPreference = 'auto' | 'low' | 'medium' | 'high';
export type MotionOverride = 'system' | 'reduce' | 'full';
export type LabelDensity = 'none' | 'key' | 'all';

interface VizPreferences {
  /** null follows the device-based default. */
  globalMode: VizMode | null;
  overrides: Record<string, VizMode>;
  quality: QualityPreference;
  labels: LabelDensity;
  glow: number;
  cameraSensitivity: number;
  chartAnimation: boolean;
  motion: MotionOverride;
}
interface VizStore extends VizPreferences {
  /** Runtime only: set when the GPU context is lost and cannot be recovered. */
  webglFailed: boolean;
  setGlobalMode: (mode: VizMode) => void;
  setOverride: (chartId: string, mode: VizMode | null) => void;
  setPreference: <K extends keyof VizPreferences>(key: K, value: VizPreferences[K]) => void;
  setWebglFailed: (failed: boolean) => void;
}

export const useVizStore = create<VizStore>()(persist(set => ({
  globalMode: null,
  overrides: {},
  quality: 'auto',
  labels: 'key',
  glow: 60,
  cameraSensitivity: 1,
  chartAnimation: true,
  motion: 'system',
  webglFailed: false,
  setGlobalMode: mode => set({ globalMode: mode, overrides: {} }),
  setOverride: (chartId, mode) => set(state => {
    const overrides = { ...state.overrides };
    if (mode) overrides[chartId] = mode; else delete overrides[chartId];
    return { overrides };
  }),
  setPreference: (key, value) => set({ [key]: value }),
  setWebglFailed: failed => set({ webglFailed: failed }),
}), {
  name: 'codeatlas.viz.v1',
  storage: createJSONStorage(() => localStorage),
  partialize: ({ globalMode, overrides, quality, labels, glow, cameraSensitivity, chartAnimation, motion }) => ({ globalMode, overrides, quality, labels, glow, cameraSensitivity, chartAnimation, motion }),
}));

export interface ResolvedMode {
  mode: VizMode;
  source: 'override' | 'global' | 'auto' | 'fallback';
  reason: string;
}

/** Pure mode resolution, in priority order: hardware limits, then the chart's override, the global choice, the device default. */
export function resolveMode(input: { override?: VizMode; global: VizMode | null; capability: Pick<WebGLCapability, 'tier' | 'reason'>; failed: boolean; reducedMotion: boolean }): ResolvedMode {
  if (input.capability.tier === 'none') return { mode: '2d', source: 'fallback', reason: input.capability.reason };
  if (input.failed) return { mode: '2d', source: 'fallback', reason: 'The GPU context was lost and could not be recovered.' };
  if (input.override) return { mode: input.override, source: 'override', reason: 'Set for this chart.' };
  if (input.global) return { mode: input.global, source: 'global', reason: 'Set for all charts.' };
  if (input.reducedMotion) return { mode: '2d', source: 'auto', reason: 'Reduced motion is on, so charts start in 2D.' };
  if (input.capability.tier === 'software') return { mode: '2d', source: 'auto', reason: input.capability.reason };
  return { mode: '3d', source: 'auto', reason: 'This device supports 3D.' };
}

const mediaQuery = '(prefers-reduced-motion: reduce)';
function subscribeMedia(callback: () => void) {
  const media = window.matchMedia(mediaQuery);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}
export function useSystemReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMedia, () => window.matchMedia(mediaQuery).matches, () => true);
}
export function useReducedMotion(): boolean {
  const system = useSystemReducedMotion();
  const motion = useVizStore(state => state.motion);
  return motion === 'system' ? system : motion === 'reduce';
}

export function useResolvedMode(chartId?: string): ResolvedMode {
  const override = useVizStore(state => chartId ? state.overrides[chartId] : undefined);
  const global = useVizStore(state => state.globalMode);
  const failed = useVizStore(state => state.webglFailed);
  const reducedMotion = useReducedMotion();
  return resolveMode({ override, global, capability: detectWebGL(), failed, reducedMotion });
}

export interface QualityProfile { name: 'low' | 'medium' | 'high'; pixelRatio: number; ambient: boolean; maxLabels: number }
export const qualityProfiles: Record<QualityProfile['name'], QualityProfile> = {
  low: { name: 'low', pixelRatio: 1, ambient: false, maxLabels: 16 },
  medium: { name: 'medium', pixelRatio: 1.5, ambient: true, maxLabels: 32 },
  high: { name: 'high', pixelRatio: 2, ambient: true, maxLabels: 64 },
};
export function qualityFor(preference: QualityPreference, tier: GpuTier): QualityProfile {
  if (preference !== 'auto') return qualityProfiles[preference];
  return qualityProfiles[tier === 'high' ? 'high' : tier === 'low' ? 'medium' : 'low'];
}
