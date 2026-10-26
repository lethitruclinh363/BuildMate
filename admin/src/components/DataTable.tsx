import type { ReactNode } from 'react';

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
    <div className="overflow-x-auto rounded-xl border border-[#E1E7ED] bg-white shadow-sm">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-[#E1E7ED] bg-[#F8FAFC] text-xs font-semibold uppercase tracking-wider text-[#526477]">
            {columns.map((col) => (
              <th key={col} className="px-4 py-3.5 whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E1E7ED]">
          {rows.map((row, i) => (
            <tr key={i} className="text-[#16283C] transition-colors hover:bg-[#F8FAFC]">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3.5 align-middle [&_a]:font-semibold [&_a]:text-[#2B6280] hover:[&_a]:text-[#173B4F] hover:[&_a]:underline">
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
