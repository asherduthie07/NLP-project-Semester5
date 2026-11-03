import { useId, useRef } from 'react';

/** Controlled tabs with roving focus: arrow keys, Home and End. Panels use `tabPanelProps` for their ARIA wiring. */
export function useTabIds(prefix?: string) {
  const generated = useId();
  const base = prefix ?? generated;
  return { tab: (id: string) => `${base}-tab-${id}`, panel: (id: string) => `${base}-panel-${id}` };
}

export function TabBar<T extends string>({ label, tabs, active, onChange, ids, testId }: { label: string; tabs: { id: T; label: string; count?: number }[]; active: T; onChange: (id: T) => void; ids: ReturnType<typeof useTabIds>; testId?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const select = (index: number) => {
    const id = tabs[index].id;
    onChange(id);
    root.current?.querySelector<HTMLButtonElement>(`[data-tab="${id}"]`)?.focus();
  };
  return <div ref={root} role="tablist" aria-label={label} className="ca-tabs" data-testid={testId}>
    {tabs.map((tab, index) => <button key={tab.id} type="button" role="tab" className="ca-tab" data-tab={tab.id} id={ids.tab(tab.id)} aria-controls={ids.panel(tab.id)} aria-selected={active === tab.id} tabIndex={active === tab.id ? 0 : -1}
      onClick={() => onChange(tab.id)}
      onKeyDown={event => {
        const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
        if (next !== null) { event.preventDefault(); select(next); }
      }}>{tab.label}{tab.count !== undefined && <span className="ca-tab-count"> {tab.count}</span>}</button>)}
  </div>;
}
