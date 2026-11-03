import { useEffect, useRef } from 'react';
import { useShellStore } from '../../store';

/** Matches the shell's "g" sequence window, so a page key right after G is left to the shell. */
const SEQUENCE_MS = 1100;

/**
 * Single-key page shortcuts. They yield to typing, modifier chords, open overlays, the shell's G sequences and the
 * "single-key shortcuts" setting. Return true from the handler when it used the key.
 */
export function usePageKeys(handler: (key: string, event: KeyboardEvent) => boolean) {
  const latest = useRef(handler);
  useEffect(() => { latest.current = handler; }, [handler]);
  useEffect(() => {
    let lastG = 0;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.closest('[role="dialog"], dialog'))) return;
      const shell = useShellStore.getState();
      if (shell.paletteOpen || shell.shortcutsOpen || !shell.singleKeyShortcuts) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (key === 'g') { lastG = event.timeStamp; return; }
      if (event.timeStamp - lastG < SEQUENCE_MS) { lastG = 0; return; }
      if (latest.current(key, event)) event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
