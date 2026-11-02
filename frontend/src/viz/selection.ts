import { create } from 'zustand';

/** SelectionManager. Lives outside the renderers, so a mode switch cannot lose it. Charts in one group share a selection (cross-filtering). */
interface SelectionStore {
  selected: Record<string, string[]>;
  hovered: Record<string, string | null>;
  toggle: (group: string, id: string) => void;
  clear: (group: string) => void;
  setHovered: (group: string, id: string | null) => void;
}

export const useSelectionStore = create<SelectionStore>(set => ({
  selected: {},
  hovered: {},
  toggle: (group, id) => set(state => {
    const current = state.selected[group] ?? [];
    return { selected: { ...state.selected, [group]: current.includes(id) ? current.filter(item => item !== id) : [...current, id] } };
  }),
  clear: group => set(state => ({ selected: { ...state.selected, [group]: [] } })),
  setHovered: (group, id) => set(state => state.hovered[group] === id ? state : { hovered: { ...state.hovered, [group]: id } }),
}));
