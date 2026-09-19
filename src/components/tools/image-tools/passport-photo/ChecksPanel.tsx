import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { plural } from '@/lib/format';
import type { Check, Severity } from '@/lib/passport-photo';

const LOOK: Record<Severity, { icon: typeof Info; tone: string; ring: string }> = {
  blocker: { icon: CircleAlert, tone: 'text-danger', ring: 'border-danger/30 bg-danger/5' },
  warning: { icon: TriangleAlert, tone: 'text-warn', ring: 'border-warn/30 bg-warn/5' },
  note: { icon: Info, tone: 'text-muted', ring: 'border-line bg-elevated' },
};

export function ChecksPanel({ checks }: { checks: readonly Check[] }) {
  const problems = checks.filter((check) => check.severity !== 'note');

  return (
    <Card>
      <CardHeader
        title="Before you send it"
        description="The things that get a photo turned down, checked on your own device."
      />
      <div className="px-5 py-4">
        {problems.length === 0 ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-ok/30 bg-ok/5 px-3.5 py-3">
            <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />
            <p className="text-[13px] leading-relaxed text-ink">
              Nothing here looks wrong. A person still has to approve it, so read the rules on the
              official page before you send it.
            </p>
          </div>
        ) : (
          <p className="sr-only">{plural(problems.length, 'thing')} to look at.</p>
        )}

        <ul className={cn('flex flex-col gap-2', problems.length > 0 ? '' : 'mt-3')}>
          {checks.map((check) => {
            const look = LOOK[check.severity];
            const Icon = look.icon;
            return (
              <li
                key={check.id}
                className={cn('flex items-start gap-2.5 rounded-xl border px-3.5 py-3', look.ring)}
              >
                <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', look.tone)} aria-hidden />
                <div className="min-w-0 text-[13px] leading-relaxed">
                  <p className="text-ink">{check.message}</p>
                  {check.fix ? <p className="mt-0.5 text-muted">{check.fix}</p> : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}
