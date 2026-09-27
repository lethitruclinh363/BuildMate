import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';

interface QueryStateProps {
  loading: boolean;
  error?: string | null;
  empty?: boolean;
  emptyTitle: string;
  emptyBody: string;
  emptyIcon?: ReactNode;
  onRetry?: () => void;
  children: ReactNode;
}

export function QueryState({
  loading,
  error,
  empty,
  emptyTitle,
  emptyBody,
  emptyIcon,
  onRetry,
  children,
}: QueryStateProps) {
  if (loading) return <Spinner />;
  if (error) return <ErrorState body={error} onRetry={onRetry} />;
  if (empty) {
    return <EmptyState icon={emptyIcon || <Inbox className="h-5 w-5" />} title={emptyTitle} body={emptyBody} />;
  }
  return <>{children}</>;
}
