import { formatMrlSpec, formatQtyWithUnit, mrlIndex, type MrlLineView } from '@/lib/mrl-display';
import { useI18n } from '@/locales';

export function MaterialItemLines({
  items,
  numbered = true,
  compact = false,
}: {
  items: MrlLineView[];
  numbered?: boolean;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const rows = items || [];
  if (!rows.length) {
    return <p className="text-sm text-ink-400">{t('mrl.emptyItems')}</p>;
  }
  return (
    <ol className={compact ? 'space-y-2' : 'divide-y divide-navy-800/8'}>
      {rows.map((row, index) => {
        const spec = formatMrlSpec(row.specification);
        const notes = String(row.notes || '').trim();
        return (
          <li key={row.id || `${row.name}-${index}`} className={compact ? '' : 'py-3 first:pt-0 last:pb-0'}>
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 font-semibold text-navy-800">
                {numbered ? <span className="mr-1.5 font-medium text-ink-400">{mrlIndex(index)}.</span> : null}
                {row.name}
              </p>
              <p className="shrink-0 text-sm font-medium text-navy-800">{formatQtyWithUnit(row.quantity, row.unit)}</p>
            </div>
            <p className="mt-0.5 text-sm text-ink-500">
              {t('mrl.spec')}: {spec || t('mrl.specMissing')}
            </p>
            {notes ? <p className="mt-0.5 text-sm text-ink-400">{notes}</p> : null}
            {row.amountLabel ? (
              <p className="mt-0.5 text-right text-xs font-semibold text-navy-800">{row.amountLabel}</p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
