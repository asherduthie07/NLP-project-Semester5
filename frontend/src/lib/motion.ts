import { useSyncExternalStore } from 'react';

const preference = '(prefers-reduced-motion: reduce)';
function subscribe(callback: () => void) {
  const media = window.matchMedia(preference);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}
/** Reactive media preference, shared by CSS, GSAP, and motion primitives. */
export function useMotionPreference(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(preference).matches, () => true);
}
