import { motion } from 'framer-motion';
import type { MouseEventHandler, ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface CardProps {
  hover?: boolean;
  children: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLDivElement>;
}

export function Card({ className, hover = true, children, onClick }: CardProps) {
  return (
    <motion.div
      whileHover={hover ? { y: -6, boxShadow: '0 22px 50px -20px rgba(11, 46, 74, 0.35)' } : undefined}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClick}
      className={cn(
        'rounded-[22px] border border-navy-800/8 bg-white/90 p-6 shadow-card backdrop-blur-sm',
        className
      )}
    >
      {children}
    </motion.div>
  );
}
