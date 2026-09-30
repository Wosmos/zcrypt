import type { ReactNode } from "react";
import { Check, X } from "@/lib/icons";
import { LogoIcon } from "@/components/ui/logo";

interface ComparisonCell {
  good: boolean;
  note: ReactNode;
}

export interface ComparisonRow {
  label: string;
  zcrypt: ComparisonCell;
  other: ComparisonCell;
}

function Cell({ cell, col }: { cell: ComparisonCell; col: string }) {
  return (
    <span className="vs-cell">
      <span className="vs-col">{col}</span>
      <span className="vs-cell-body">
        {cell.good ? (
          <Check className="vs-ck vs-ck-yes" strokeWidth={2.5} role="img" aria-label="Yes" />
        ) : (
          <X className="vs-ck vs-ck-no" strokeWidth={2} role="img" aria-label="No" />
        )}
        <span>{cell.note}</span>
      </span>
    </span>
  );
}

export function ComparisonTable({ otherName, rows }: { otherName: string; rows: ComparisonRow[] }) {
  return (
    <div className="vs-cmp">
      <table className="vs-table">
        <caption className="sr-only">zcrypt compared with {otherName}</caption>
        <thead>
          <tr>
            <td className="vs-rl" />
            <th scope="col" className="vs-z">
              <span className="vs-cn">
                <LogoIcon size={20} hover={false} />
                zcrypt
              </span>
            </th>
            <th scope="col">{otherName}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row" className="vs-rl">
                {row.label}
              </th>
              <td className="vs-z">
                <Cell cell={row.zcrypt} col="zcrypt" />
              </td>
              <td>
                <Cell cell={row.other} col={otherName} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
