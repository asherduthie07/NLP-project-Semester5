export const easeOutExpo = [0.16, 1, 0.3, 1] as const;
export const durations = { feedback: 0.12, enter: 0.6, count: 1.4, scramble: 0.7, toast: 4, loop: 12 } as const;
export const spring = { type: 'spring', stiffness: 420, damping: 30 } as const;
export const softSpring = { type: 'spring', stiffness: 180, damping: 26 } as const;
export const entrance = {
  hidden: { opacity: 0, y: 16, filter: 'blur(6px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: durations.enter, ease: easeOutExpo } },
};
export const stagger = { visible: { transition: { staggerChildren: 0.06 } } };
