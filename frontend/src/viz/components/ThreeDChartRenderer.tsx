import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { useIsPresent } from 'framer-motion';
import { resolveToken } from '../palette';
import { useReducedMotion, useVizStore } from '../store';
import type { RendererProps } from '../types';
import { buildScene } from '../engine/builders';
import { Stage, vizEngine, type EngineStatus } from '../engine/engine';
import type { CameraPreset } from '../engine/scene';

window.__codeatlasViz = vizEngine;

export interface StageHandle {
  preset: (preset: CameraPreset) => void;
  reset: () => void;
  zoom: (factor: number) => void;
  orbit: (azimuth: number, polar: number) => void;
  focus: (id: string) => void;
}
export interface ThreeDProps extends RendererProps {
  chartId: string;
  entry: 'grow' | 'lift' | 'none';
  fullscreen: boolean;
  handle: Ref<StageHandle>;
  onFailure: (reason: string) => void;
}

/** Binds a chart to the shared engine. Mounting, unmounting and model changes are the only lifecycle events. */
export default function ThreeDChartRenderer({ model, activeId, selected, onHover, onSelect, chartId, entry, fullscreen, handle, onFailure }: ThreeDProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const callbacks = useRef({ onHover, onSelect, onFailure, entry });
  const interaction = useRef({ activeId, selected });
  const reduced = useReducedMotion();
  const sensitivity = useVizStore(state => state.cameraSensitivity);
  const chartAnimation = useVizStore(state => state.chartAnimation);
  const labels = useVizStore(state => state.labels);
  const [status, setStatus] = useState<EngineStatus>(vizEngine.status);
  const isPresent = useIsPresent();
  useEffect(() => { callbacks.current = { onHover, onSelect, onFailure, entry }; interaction.current = { activeId, selected }; });

  useImperativeHandle(handle, () => ({
    preset: preset => stageRef.current?.camera({ type: 'preset', preset }),
    reset: () => stageRef.current?.camera({ type: 'reset' }),
    zoom: factor => stageRef.current?.camera({ type: 'zoom', factor }),
    orbit: (azimuth, polar) => stageRef.current?.camera({ type: 'orbit', azimuth, polar }),
    focus: id => stageRef.current?.camera({ type: 'focus', id }),
  }), []);

  useEffect(() => vizEngine.subscribe(setStatus), []);

  useEffect(() => {
    if (!canvas.current || !overlay.current) return;
    let stage: Stage;
    try {
      stage = new Stage({ canvas: canvas.current, overlay: overlay.current, reduced, sensitivity, fullscreen, onHover: (id, point) => callbacks.current.onHover(id, point), onSelect: id => callbacks.current.onSelect(id) });
    } catch (error) {
      callbacks.current.onFailure(error instanceof Error ? error.message : 'WebGL could not start.');
      return;
    }
    stageRef.current = stage;
    return () => {
      stage.rememberCamera(chartId);
      stage.dispose();
      stageRef.current = null;
    };
  }, [chartId, reduced, sensitivity, fullscreen]);

  const firstBuild = useRef(true);
  useEffect(() => {
    let cancelled = false;
    const build = async () => {
      /** Word sprites rasterize text once, so the display face must have loaded first. */
      if (model.kind === 'wordcloud') await document.fonts?.load?.('500 72px "Space Grotesk"');
      const stage = stageRef.current;
      if (cancelled || !stage) return;
      try {
        const entryMode = !chartAnimation ? 'none' : firstBuild.current ? callbacks.current.entry : 'none';
        stage.setScene(buildScene(model, { resolve: resolveToken }), chartId, entryMode, !firstBuild.current);
        stage.setInteraction(interaction.current.activeId, interaction.current.selected);
        firstBuild.current = false;
      } catch (error) {
        callbacks.current.onFailure(error instanceof Error ? error.message : 'The 3D scene could not be built.');
      }
    };
    void build();
    return () => { cancelled = true; firstBuild.current = true; };
  }, [model, chartId, chartAnimation, labels, reduced, sensitivity, fullscreen]);

  useEffect(() => { stageRef.current?.setInteraction(activeId, selected); }, [activeId, selected]);
  /** Leaving 3D: the camera settles onto the 2D-aligned view while the renderers crossfade. */
  useEffect(() => { if (!isPresent) stageRef.current?.camera({ type: 'flatten' }); }, [isPresent]);

  return <div className="viz-stage-3d" data-testid="viz-3d">
    <canvas ref={canvas} className="viz-canvas-3d" aria-hidden="true" />
    <div ref={overlay} className="viz-overlay" aria-hidden="true" />
    {status === 'lost' && <div className="viz-context-notice" role="status">Recovering the 3D renderer…</div>}
  </div>;
}
