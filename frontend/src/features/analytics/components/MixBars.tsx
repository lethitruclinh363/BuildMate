import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

export function MixBars({ items }: { items: { label: string; value: number; tone?: string }[] }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex justify-between text-xs text-ink-500">
            <span>{item.label}</span>
            <span>{item.value}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-navy-800/8">
            <div
              className={cn('h-full rounded-full bg-navy-800', item.tone === 'copper' && 'bg-copper-400')}
              style={{ width: `${Math.round((item.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card hover={false} className="p-4">
      <p className="text-sm text-ink-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-navy-800">{value}</p>
    </Card>
  );
}
