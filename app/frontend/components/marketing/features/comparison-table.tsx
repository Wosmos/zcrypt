import { LogoIcon } from "@/components/ui/logo";
import { T } from "@/components/i18n/t";
import { ComparisonMark } from "./comparison-mark";

export interface ComparisonRow {
  id: string;
  zcryptOwn?: boolean;
  otherGood: boolean;
}

function Cell({ good, noteKey, col }: { good: boolean; noteKey: string; col: string }) {
  return (
    <span className="vs-cell">
      <span className="vs-col">{col}</span>
      <span className="vs-cell-body">
        <ComparisonMark good={good} />
        <span>
          <T k={noteKey} />
        </span>
      </span>
    </span>
  );
}

export function ComparisonTable({
  ns,
  otherName,
  rows,
}: {
  ns: string;
  otherName: string;
  rows: ComparisonRow[];
}) {
  return (
    <div className="vs-cmp">
      <table className="vs-table">
        <caption className="sr-only">
          <T k="site.vs.common.caption" values={{ name: otherName }} />
        </caption>
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
            <tr key={row.id}>
              <th scope="row" className="vs-rl">
                <T k={`site.vs.common.rows.${row.id}`} />
              </th>
              <td className="vs-z">
                <Cell
                  good
                  noteKey={
                    row.zcryptOwn
                      ? `site.vs.${ns}.rows.${row.id}.zcrypt`
                      : `site.vs.common.z.${row.id}`
                  }
                  col="zcrypt"
                />
              </td>
              <td>
                <Cell
                  good={row.otherGood}
                  noteKey={`site.vs.${ns}.rows.${row.id}.other`}
                  col={otherName}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
