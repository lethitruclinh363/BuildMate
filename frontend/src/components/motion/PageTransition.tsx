import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { pageVariants } from '@/lib/motion';

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/** Framer Motion page wrapper only — never Radix Slot. */
export function PageTransition({ children, className }: PageTransitionProps) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={className}
    >
      {children}
    </motion.div>
  );
}
