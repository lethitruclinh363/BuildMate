import type { MouseEventHandler, ReactNode } from 'react';
import { SoftCard } from '@/components/ui/surfaces';

interface CardProps {
  hover?: boolean;
  children: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLDivElement>;
}

/** Shared soft surface. Prefer a list row when items repeat. */
export function Card(props: CardProps) {
  return <SoftCard {...props} />;
}
