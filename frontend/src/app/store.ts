import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface ShellStore {
  pinned: boolean;
  /** WCAG 2.1.4: single-character shortcuts can be turned off. */
  singleKeyShortcuts: boolean;
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  drawerOpen: boolean;
  setPinned: (pinned: boolean) => void;
  setSingleKeyShortcuts: (enabled: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setDrawerOpen: (open: boolean) => void;
}

export const useShellStore = create<ShellStore>()(persist(set => ({
  pinned: false,
  singleKeyShortcuts: true,
  paletteOpen: false,
  shortcutsOpen: false,
  drawerOpen: false,
  setPinned: pinned => set({ pinned }),
  setSingleKeyShortcuts: singleKeyShortcuts => set({ singleKeyShortcuts }),
  setPaletteOpen: paletteOpen => set({ paletteOpen }),
  setShortcutsOpen: shortcutsOpen => set({ shortcutsOpen }),
  setDrawerOpen: drawerOpen => set({ drawerOpen }),
}), {
  name: 'codeatlas.shell.v1',
  storage: createJSONStorage(() => localStorage),
  partialize: ({ pinned, singleKeyShortcuts }) => ({ pinned, singleKeyShortcuts }),
}));
