import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function DataTable({
  columns,
  rows,
  empty,
}: {
  columns: string[];
  rows: ReactNode[][];
  empty?: ReactNode;
}) {
  if (!rows.length) return <>{empty}</>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-white/8 text-sm text-white/55">
            {columns.map((col) => (
              <th key={col} className="px-3 py-3 font-semibold">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={cn('border-b border-white/[0.05] text-white/80', i % 2 === 1 && 'bg-white/[0.02]')}>
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-3 align-middle">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
