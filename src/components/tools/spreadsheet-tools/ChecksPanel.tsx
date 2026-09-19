import { Info, TriangleAlert } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { plural } from '@/lib/format';
import { describeCheck } from '@/lib/csv-cleaner/checks';
import type { CheckFinding, ChecksReport, Severity } from '@/lib/csv-cleaner/types';

const TONE: Record<Severity, { box: string; icon: string }> = {
  serious: { box: 'border-danger/30 bg-danger/10', icon: 'text-danger' },
  warning: { box: 'border-warn/30 bg-warn/10', icon: 'text-warn' },
  info: { box: 'border-line bg-elevated', icon: 'text-muted' },
};

function FindingNote({ finding }: { finding: CheckFinding }) {
  const { title, detail } = describeCheck(finding);
  const tone = TONE[finding.severity];
  const Icon = finding.severity === 'info' ? Info : TriangleAlert;

  return (
    <div
      className={cn('flex items-start gap-2.5 rounded-xl border px-3.5 py-3', tone.box)}
      role={finding.severity === 'serious' ? 'alert' : undefined}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone.icon)} aria-hidden />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-ink">{title}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">{detail}</p>

        {finding.samples.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {finding.samples.map((sample) => (
              <code
                key={sample}
                className="max-w-full truncate rounded-md bg-line/60 px-1.5 py-0.5 font-mono text-[12px] text-muted"
              >
                {sample}
              </code>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export interface ChecksPanelProps {
  /** `runChecks(...)` for the sheet on screen. Null while it is still running. */
  report: ChecksReport | null;
}

export function ChecksPanel({ report }: ChecksPanelProps) {
  if (!report || report.findings.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="Things to check"
        description="Cleaning cannot put these right, so have a look before you save."
      />

      <div className="flex flex-col gap-3 px-5 py-4">
        {report.findings.map((finding, i) => (
          <FindingNote key={`${finding.kind}-${finding.columnIndex ?? 'sheet'}-${i}`} finding={finding} />
        ))}

        {report.sampled ? (
          <p className="text-[12px] leading-relaxed text-faint">
            This sheet is a big one, so only the first {plural(report.rowsScanned, 'row')} were
            looked at. There may be more further down.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
