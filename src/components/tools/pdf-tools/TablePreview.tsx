import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';
import { plural } from '@/lib/format';
import { PREVIEW_ROWS } from '@/lib/pdf-to-excel/constants';
import type { Cell, Column, Row, RowFlag, Sheet } from '@/lib/pdf-to-excel';

const REASON: Record<RowFlag, string> = {
  balance: 'This balance doesn’t add up from the amounts on this row.',
  type: 'This isn’t a number we could read.',
  overflow: 'Text here was wider than its column.',
  sparse: 'There’s almost nothing on this row.',
  pageBreak: 'This row was split across two pages.',
};

const KIND: Record<Column['kind'], string> = {
  text: 'Text',
  date: 'Date',
  number: 'Number',
  money: 'Amount',
};

const OFF_TYPE = 'We couldn’t read this as a number, so it’s left exactly as it was.';

function headerName(sheet: Sheet, column: Column): string {
  const named = sheet.header?.[column.index]?.trim() ?? column.header.trim();
  return named !== '' ? named : `Column ${column.index + 1}`;
}

function columnHint(sheet: Sheet, column: Column): string {
  const voted =
    column.kind === 'date' &&
    sheet.rows.some((row) => {
      const value = row.cells[column.index]?.value;
      return value !== undefined && value.kind === 'date' && value.ambiguous;
    });
  if (voted) {
    return column.dateOrder === 'mdy'
      ? 'read as month/day/year'
      : 'read as day/month/year';
  }
  return column.balance ? 'Running balance' : KIND[column.kind];
}

function CellText({ cell }: { cell: Cell | undefined }) {
  if (!cell || cell.value.kind === 'empty') return null;
  if (cell.offType) {
    return (
      <span
        className="font-mono text-[12px] underline decoration-dotted underline-offset-2"
        title={OFF_TYPE}
      >
        {cell.raw}
      </span>
    );
  }
  if (cell.value.kind === 'number') {
    return (
      <span className="font-mono tabular-nums">{cell.value.value.toFixed(cell.value.decimals)}</span>
    );
  }
  if (cell.value.kind === 'date') {
    return <span className="font-mono tabular-nums">{cell.value.iso}</span>;
  }
  return <>{cell.value.text}</>;
}

function BodyRow({ row, columns }: { row: Row; columns: Column[] }) {
  const reasons = row.flags.map((flag) => REASON[flag]).join(' ');
  return (
    <tr className={cn('border-t border-line', !row.ok && 'bg-warn/10')}>
      <td className="w-7 px-1.5 py-1.5 align-top" title={row.ok ? undefined : reasons}>
        {row.ok ? null : (
          <TriangleAlert className="h-3.5 w-3.5 text-warn" aria-label={reasons} />
        )}
      </td>
      {columns.map((column) => (
        <td
          key={column.index}
          className={cn(
            'max-w-[22rem] px-2.5 py-1.5 align-top text-[13px] text-ink',
            column.align === 'right' && 'text-right',
          )}
        >
          <CellText cell={row.cells[column.index]} />
        </td>
      ))}
    </tr>
  );
}

export function TablePreview({ sheet }: { sheet: Sheet }) {
  const [all, setAll] = useState(false);

  const body = sheet.header === null ? sheet.rows : sheet.rows.slice(1);
  const shown = all ? body : body.slice(0, PREVIEW_ROWS);
  const flagged = sheet.rows.filter((row) => !row.ok).length;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] text-muted">
        <span className="font-medium text-ink">{plural(body.length, 'row')} found.</span>{' '}
        {flagged > 0
          ? `${plural(flagged, 'row')} ${flagged === 1 ? 'needs' : 'need'} checking.`
          : 'None need checking.'}
      </p>

      <div className="max-h-[26rem] overflow-auto rounded-xl border border-line">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-elevated">
            <tr>
              <th className="w-7 px-1.5 py-2" />
              {sheet.columns.map((column) => (
                <th
                  key={column.index}
                  scope="col"
                  className={cn(
                    'px-2.5 py-2 text-[13px] font-medium text-ink',
                    column.align === 'right' && 'text-right',
                  )}
                >
                  <span className="block truncate">{headerName(sheet, column)}</span>
                  <span className="block text-[11px] font-normal text-faint">
                    {columnHint(sheet, column)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => (
              <BodyRow key={i} row={row} columns={sheet.columns} />
            ))}
          </tbody>
        </table>
      </div>

      {body.length > PREVIEW_ROWS ? (
        <button
          type="button"
          onClick={() => setAll(!all)}
          className="self-start text-[13px] font-medium text-accent hover:underline"
        >
          {all ? 'Show fewer rows' : `Show all ${body.length.toLocaleString()} rows`}
        </button>
      ) : null}
    </div>
  );
}
