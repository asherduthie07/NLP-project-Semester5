import { useCallback, useEffect, useRef, useState } from 'react';

/** Pane widths in pixels, remembered per page in this browser. */
export function usePaneSizes(key: string, defaults: number[]): [number[], (index: number, value: number) => void] {
  const [sizes, setSizes] = useState<number[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`codeatlas.panes.${key}`) ?? 'null') as unknown;
      if (Array.isArray(saved) && saved.length === defaults.length && saved.every(value => typeof value === 'number' && Number.isFinite(value))) return saved as number[];
    } catch { /* Storage can be unavailable; the defaults apply. */ }
    return defaults;
  });
  useEffect(() => {
    try { localStorage.setItem(`codeatlas.panes.${key}`, JSON.stringify(sizes)); } catch { /* Not persisted. */ }
  }, [key, sizes]);
  const set = useCallback((index: number, value: number) => setSizes(current => current.map((size, at) => at === index ? Math.round(value) : size)), []);
  return [sizes, set];
}

/**
 * Draggable divider between two panes. `invert` is for a pane to the right of its divider, which grows as the
 * pointer moves left. Arrow keys move it by 16 px, Home and End jump to the limits.
 */
export function PaneDivider({ label, value, min, max, onChange, invert = false, testId }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void; invert?: boolean; testId?: string }) {
  const [dragging, setDragging] = useState(false);
  const origin = useRef<{ x: number; value: number } | null>(null);
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  return <div role="separator" aria-orientation="vertical" aria-label={label} aria-valuenow={value} aria-valuemin={min} aria-valuemax={max} tabIndex={0}
    className={`pane-divider${dragging ? ' dragging' : ''}`} data-testid={testId}
    onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); origin.current = { x: event.clientX, value }; setDragging(true); }}
    onPointerMove={event => { if (!origin.current) return; const delta = event.clientX - origin.current.x; onChange(clamp(origin.current.value + (invert ? -delta : delta))); }}
    onPointerUp={() => { origin.current = null; setDragging(false); }}
    onPointerCancel={() => { origin.current = null; setDragging(false); }}
    onDoubleClick={() => onChange(clamp((min + max) / 2))}
    onKeyDown={event => {
      const step = event.key === 'ArrowLeft' ? -16 : event.key === 'ArrowRight' ? 16 : 0;
      if (step) { event.preventDefault(); onChange(clamp(value + (invert ? -step : step))); }
      else if (event.key === 'Home') { event.preventDefault(); onChange(min); }
      else if (event.key === 'End') { event.preventDefault(); onChange(max); }
    }}>
    <span aria-hidden="true" />
  </div>;
}
