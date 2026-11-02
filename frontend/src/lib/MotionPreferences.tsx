import { useEffect, type ReactNode } from 'react';
import { MotionConfig } from 'framer-motion';
import { useMotionPreference } from './motion';

/** Explicit skip prevents transforms under reduced motion; CSS/GSAP use the same preference. */
export function MotionPreferences({ children }: { children: ReactNode }) {
  const reduced = useMotionPreference();
  useEffect(() => { document.documentElement.dataset.reducedMotion = String(reduced); }, [reduced]);
  return <MotionConfig reducedMotion="never" skipAnimations={reduced}>{children}</MotionConfig>;
}
