import { ShieldCheck } from 'lucide-react';
import { privacyBadge } from '@/config';
import { cn } from '@/lib/cn';

/** The trust badge shown on every tool page. */
export function PrivacyBadge({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        'inline-flex items-center gap-2 rounded-xl border border-ok/25 bg-ok/10 px-3 py-2 text-[13px] font-medium text-ok',
        className,
      )}
    >
      <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
      {privacyBadge}
    </p>
  );
}
