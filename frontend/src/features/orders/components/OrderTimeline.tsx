import { motion } from 'framer-motion';
import { Check, Circle, CircleDot } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useI18n } from '@/locales';
import type { OrderStatus } from '../types/order.types';
import { buildTimeline } from '../types/orderStatus';

export function OrderTimeline({ status }: { status: OrderStatus }) {
  const { t } = useI18n();
  const steps = buildTimeline(status);

  return (
    <ol className="space-y-0">
      {steps.map((step, index) => (
        <motion.li
          key={step.key}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.06 * index, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="flex gap-3"
        >
          <div className="flex flex-col items-center">
            <span
              className={cn(
                'grid h-8 w-8 place-items-center rounded-full border',
                step.done && 'border-emerald-600 bg-emerald-600 text-white',
                step.current && 'border-copper-400 bg-copper-100 text-copper-700',
                !step.done && !step.current && 'border-navy-800/15 bg-white text-ink-400'
              )}
            >
              {step.done ? <Check className="h-4 w-4" /> : step.current ? <CircleDot className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
            </span>
            {index < steps.length - 1 ? (
              <span className={cn('my-1 w-px flex-1 min-h-6', step.done ? 'bg-emerald-500' : 'bg-navy-800/10')} />
            ) : null}
          </div>
          <p
            className={cn(
              'pb-6 pt-1.5 text-sm',
              step.done && 'font-medium text-navy-800',
              step.current && 'font-semibold text-copper-700',
              !step.done && !step.current && 'text-ink-400'
            )}
          >
            {t(`orders.timeline.${step.key}`)}
          </p>
        </motion.li>
      ))}
    </ol>
  );
}
