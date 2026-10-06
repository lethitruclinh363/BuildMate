import type { Transition, Variants } from 'framer-motion';

export const easeOutSoft: Transition = {
  duration: 0.55,
  ease: [0.22, 1, 0.36, 1],
};

/** Opacity only. A resting translate would shift the map canvas. */
export const pageVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: easeOutSoft },
  exit: { opacity: 0, transition: { duration: 0.25 } },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { ...easeOutSoft, delay: 0.08 * i },
  }),
};

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
