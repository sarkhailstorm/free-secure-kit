'use client';

import { useState } from 'react';
import { ArrowLeft, Check, LoaderCircle, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { plural } from '@/lib/format';
import { rowsAffected, type SpellingReport } from '@/lib/csv-cleaner/cluster';
import type { ClusterReason, ValueCluster } from '@/lib/csv-cleaner/types';

const REASON: Record<ClusterReason, string> = {
  case: 'Only the capital letters differ.',
  whitespace: 'Only the spaces differ.',
  punctuation: 'Only the punctuation differs.',
  accents: 'Only the accents differ.',
  'word-order': 'The same words in a different order — check these are really the same thing.',
  'near-spelling': 'Spelled slightly differently.',
};

function GroupCard({
  cluster,
  busy,
  onAccept,
  onIgnore,
}: {
  cluster: ValueCluster;
  busy: boolean;
  onAccept: (keep: string) => void;
  onIgnore: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cluster.suggested);
  const keep = draft.trim() || cluster.suggested;

  return (
    <div className="rounded-xl border border-line bg-bg px-4 py-3.5">
      <ul className="space-y-1">
        {cluster.members.map((member) => {
          const winner = member.value === keep;
          return (
            <li key={member.value} className="flex items-baseline justify-between gap-3">
              <span
                className={cn(
                  'min-w-0 flex-1 truncate font-mono text-[13px]',
                  winner ? 'font-medium text-ink' : 'text-muted',
                )}
                title={member.value}
              >
                {member.value || '(blank)'}
              </span>
              <span className="shrink-0 font-mono text-[12px] tabular-nums text-faint">
                {plural(member.count, 'row')}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-2.5 text-[12px] leading-relaxed text-muted">{REASON[cluster.reason]}</p>

      {editing ? (
        <div className="mt-3">
          <label className="block text-[12px] font-medium text-ink" htmlFor={`keep-${cluster.id}`}>
            Which spelling should they all become?
          </label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {cluster.members.map((member) => (
              <Button
                key={member.value}
                size="sm"
                variant={member.value === keep ? 'primary' : 'secondary'}
                onClick={() => setDraft(member.value)}
              >
                {member.value || '(blank)'}
              </Button>
            ))}
          </div>
          <input
            id={`keep-${cluster.id}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="mt-2 h-9 w-full rounded-lg border border-line bg-bg px-2.5 font-mono text-[13px] text-ink outline-none transition-colors focus:border-accent/60"
          />
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button size="md" variant="primary" disabled={busy} onClick={() => onAccept(keep)}>
              <Check className="h-3.5 w-3.5" aria-hidden />
              Use this spelling
            </Button>
            <Button size="md" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="md" variant="primary" disabled={busy} onClick={() => onAccept(keep)}>
            <Check className="h-3.5 w-3.5" aria-hidden />
            Make them all &ldquo;{keep}&rdquo;
          </Button>
          <Button size="md" variant="secondary" onClick={() => setEditing(true)}>
            Keep a different one
          </Button>
          <Button size="md" variant="ghost" disabled={busy} onClick={onIgnore}>
            Leave these alone
          </Button>
        </div>
      )}

      <p className="mt-2 text-[12px] text-faint">
        {plural(rowsAffected(cluster, keep), 'row')} would change.
      </p>
    </div>
  );
}

export interface SpellingColumn {
  /** ORIGINAL column index — what `CleanOptions.spellingMerges` is keyed by. */
  columnIndex: number;
  columnName: string;
  report: SpellingReport;
}

export interface SpellingPanelProps {
  columns: readonly SpellingColumn[];
  /** The column being worked through, by ORIGINAL column index; null lists the columns. */
  activeColumn: number | null;
  onActiveColumnChange: (columnIndex: number | null) => void;
  /** Groups said yes to: `ValueCluster.id` -> the spelling every member becomes. */
  accepted: Readonly<Record<string, string>>;
  /** Groups set aside, by `ValueCluster.id`. */
  ignored: ReadonlySet<string>;
  onAccept: (cluster: ValueCluster, keep: string) => void;
  onIgnore: (cluster: ValueCluster) => void;
  onUndo: (cluster: ValueCluster) => void;
  busy?: boolean;
}

export function SpellingPanel({
  columns,
  activeColumn,
  onActiveColumnChange,
  accepted,
  ignored,
  onAccept,
  onIgnore,
  onUndo,
  busy = false,
}: SpellingPanelProps) {
  const withGroups = columns.filter(
    (column) => column.report.clusters.length + column.report.wordOrderClusters.length > 0,
  );
  const open = withGroups.find((column) => column.columnIndex === activeColumn);

  if (withGroups.length === 0 && !busy) return null;

  const groups = open ? [...open.report.clusters, ...open.report.wordOrderClusters] : [];
  const answered = (cluster: ValueCluster) =>
    accepted[cluster.id] !== undefined || ignored.has(cluster.id);
  const current = groups.find((cluster) => !answered(cluster));
  const done = groups.filter(answered);

  return (
    <Card>
      <CardHeader
        title="Merge similar spellings"
        description={
          open
            ? `Different spellings of the same thing in “${open.columnName}”, one group at a time.`
            : 'Different spellings of the same thing. Nothing is merged until you say so.'
        }
        actions={
          open ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-9"
              onClick={() => onActiveColumnChange(null)}
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              All columns
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-3 px-5 py-4">
        {busy ? (
          <p className="flex items-center gap-2 text-[13px] text-muted">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin text-accent" aria-hidden />
            Looking for spellings that match…
          </p>
        ) : null}

        {!open ? (
          <ul className="rounded-xl border border-line bg-bg px-3.5 py-1">
            {withGroups.map((column) => {
              const total = column.report.clusters.length + column.report.wordOrderClusters.length;
              return (
                <li
                  key={column.columnIndex}
                  className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2.5 first:border-t-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[13px] text-ink">
                      {column.columnName || `Column ${column.columnIndex + 1}`}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted">
                      {plural(total, 'group')} to look at
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-9"
                    onClick={() => onActiveColumnChange(column.columnIndex)}
                  >
                    Look at these
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {open && current ? (
          <>
            <p className="text-[12px] font-medium uppercase tracking-wide text-faint">
              Group {done.length + 1} of {groups.length}
            </p>
            <GroupCard
              key={current.id}
              cluster={current}
              busy={busy}
              onAccept={(keep) => onAccept(current, keep)}
              onIgnore={() => onIgnore(current)}
            />
          </>
        ) : null}

        {open && !current && groups.length > 0 ? (
          <p className="text-[13px] text-muted">
            Every group in this column has an answer. Pick another column to carry on.
          </p>
        ) : null}

        {done.length > 0 ? (
          <ul className="rounded-xl border border-line bg-bg px-3.5 py-1">
            {done.map((cluster) => {
              const keep = accepted[cluster.id];
              return (
                <li
                  key={cluster.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 first:border-t-0"
                >
                  <p className="min-w-0 flex-1 truncate text-[12px] text-muted">
                    {keep === undefined
                      ? `${plural(cluster.members.length, 'spelling')} left alone`
                      : `${plural(cluster.members.length, 'spelling')} became “${keep}”`}
                  </p>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => onUndo(cluster)}>
                    <Undo2 className="h-3.5 w-3.5" aria-hidden />
                    Undo
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {open?.report.searchCapped || open?.report.clustersTruncated ? (
          <p className="text-[12px] leading-relaxed text-faint">
            This column has a great many different values, so we stopped looking after a while.
            There may be more matches than the groups above.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
