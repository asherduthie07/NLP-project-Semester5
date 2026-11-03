import { useReducedMotion } from '../viz/store';

/** Reactive motion preference (system setting or the app override), shared by CSS, GSAP, and motion primitives. */
export const useMotionPreference: () => boolean = useReducedMotion;
