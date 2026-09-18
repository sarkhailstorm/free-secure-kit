'use client';

import { useId } from 'react';
import { ExternalLink } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { sizeLabel, SPEC_ORDER, SPECS, type PhotoSpec, type SpecId } from '@/lib/passport-photo';

/** What a custom size lets someone set, when their form asks for something odd. */
export interface CustomSize {
  widthMm: number;
  heightMm: number;
  headMinMm: number;
  headMaxMm: number;
}

export const DEFAULT_CUSTOM: CustomSize = {
  widthMm: 35,
  heightMm: 45,
  headMinMm: 29,
  headMaxMm: 34,
};

export function DocumentPicker({
  specId,
  onSpecId,
  custom,
  onCustom,
  spec,
}: {
  specId: SpecId;
  onSpecId: (id: SpecId) => void;
  custom: CustomSize;
  onCustom: (next: CustomSize) => void;
  /** The spec in force, custom sizes already folded in. */
  spec: PhotoSpec;
}) {
  const selectId = useId();

  const groups: { country: string; ids: SpecId[] }[] = [];
  for (const id of SPEC_ORDER) {
    const country = SPECS[id].country;
    const last = groups[groups.length - 1];
    if (last && last.country === country) last.ids.push(id);
    else groups.push({ country, ids: [id] });
  }

  return (
    <Card>
      <CardHeader
        title="What is the photo for?"
        description="Every country asks for a different size, and a different head height within it."
      />
      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[15rem] flex-1">
            <label htmlFor={selectId} className="text-[13px] font-medium text-ink">
              Document
            </label>
            <select
              id={selectId}
              value={specId}
              onChange={(e) => onSpecId(e.target.value as SpecId)}
              className="mt-1.5 h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink shadow-sm focus:border-accent focus:outline-none"
            >
              {groups.map((group) => (
                <optgroup key={group.country} label={group.country}>
                  {group.ids.map((id) => (
                    <option key={id} value={id}>
                      {SPECS[id].document}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <dl className="flex gap-5">
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-faint">Photo</dt>
              <dd className="mt-0.5 text-sm font-medium text-ink">{sizeLabel(spec)}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-faint">Head</dt>
              <dd className="mt-0.5 text-sm font-medium text-ink">
                {spec.headMinMm}&ndash;{spec.headMaxMm} mm
              </dd>
            </div>
          </dl>
        </div>

        {specId === 'custom' ? (
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-elevated p-3 sm:grid-cols-4">
            <MmField
              label="Width"
              value={custom.widthMm}
              onChange={(widthMm) => onCustom({ ...custom, widthMm })}
            />
            <MmField
              label="Height"
              value={custom.heightMm}
              onChange={(heightMm) => onCustom({ ...custom, heightMm })}
            />
            <MmField
              label="Smallest head"
              value={custom.headMinMm}
              onChange={(headMinMm) => onCustom({ ...custom, headMinMm })}
            />
            <MmField
              label="Largest head"
              value={custom.headMaxMm}
              onChange={(headMaxMm) => onCustom({ ...custom, headMaxMm })}
            />
          </div>
        ) : null}

        <div className="text-[13px] leading-relaxed text-muted">
          <p>
            <span className="font-medium text-ink">Background:</span> {spec.background.label}.
          </p>
          {spec.notes?.map((note) => (
            <p key={note} className="mt-1">
              {note}
            </p>
          ))}
          {spec.source ? (
            <a
              href={spec.source}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 font-medium text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
            >
              Check the official rules
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function MmField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-[11px] font-medium uppercase tracking-wide text-faint">
        {label}
      </label>
      <div className="mt-1 flex items-center gap-1.5">
        <input
          id={id}
          type="number"
          min={10}
          max={200}
          step={0.5}
          value={value}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next) && next > 0) onChange(next);
          }}
          className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm tabular-nums text-ink focus:border-accent focus:outline-none"
        />
        <span className="text-xs text-faint">mm</span>
      </div>
    </div>
  );
}
