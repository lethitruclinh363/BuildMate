import { cn } from '@/lib/cn';
import { useI18n } from '@/locales';
import type { ComplaintStatus } from '../types/complaint.types';
import { complaintTimeline } from '../types/complaintStatus';

export function ComplaintTimeline({ status }: { status: ComplaintStatus }) {
  const { t } = useI18n();
  const steps = complaintTimeline(status);
  return (
    <ol className="space-y-3">
      {steps.map((step) => (
        <li key={step.key} className="flex items-start gap-3">
          <span
            className={cn(
              'mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full',
              step.current ? 'bg-copper-400' : step.done ? 'bg-navy-800' : 'bg-navy-800/20'
            )}
          />
          <p className={cn('text-sm', step.current ? 'font-semibold text-navy-800' : 'text-ink-500')}>
            {t(`complaint.timeline${step.key[0].toUpperCase()}${step.key.slice(1)}`)}
          </p>
        </li>
      ))}
    </ol>
  );
}
