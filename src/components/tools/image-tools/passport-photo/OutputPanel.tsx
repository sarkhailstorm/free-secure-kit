'use client';

import { useMemo, useState } from 'react';
import { Download, Loader2, Printer, TriangleAlert } from 'lucide-react';
import { useToast } from '@/components/ToastProvider';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { downloadBlob } from '@/lib/download';
import { formatBytes, plural } from '@/lib/format';
import {
  describePassportError,
  renderPhoto,
  renderSheet,
  sheetCapacity,
  SHEETS,
  sizeLabel,
  type BackgroundChoice,
  type Layout,
  type MaskData,
  type PhotoSpec,
} from '@/lib/passport-photo';

type Format = 'image/jpeg' | 'image/png';

export function OutputPanel({
  bitmap,
  mask,
  spec,
  layout,
  background,
  onBackground,
  blocked,
}: {
  bitmap: ImageBitmap;
  mask: MaskData | null;
  spec: PhotoSpec;
  layout: Layout;
  background: BackgroundChoice;
  onBackground: (next: BackgroundChoice) => void;
  /** True when a check says this photo cannot be used as it is. */
  blocked: boolean;
}) {
  const toast = useToast();
  const [format, setFormat] = useState<Format>('image/jpeg');
  const [sheetId, setSheetId] = useState(SHEETS[0].id);
  const [busy, setBusy] = useState<'photo' | 'sheet' | null>(null);
  const [saved, setSaved] = useState<{ bytes: number } | null>(null);

  const sheet = SHEETS.find((item) => item.id === sheetId) ?? SHEETS[0];
  const capacity = useMemo(
    () => sheetCapacity(sheet, spec.widthMm, spec.heightMm),
    [sheet, spec.heightMm, spec.widthMm],
  );

  const options = useMemo(
    () => ({ spec, layout, background, format, quality: 0.94 as const }),
    [background, format, layout, spec],
  );

  async function savePhoto() {
    setBusy('photo');
    try {
      const result = await renderPhoto(bitmap, options, mask);
      downloadBlob(result.blob, result.filename);
      setSaved({ bytes: result.blob.size });
    } catch (err) {
      toast.error(describePassportError(err));
    } finally {
      setBusy(null);
    }
  }

  async function saveSheet() {
    setBusy('sheet');
    try {
      const photo = await renderPhoto(bitmap, options, mask);
      const result = await renderSheet(photo.blob, spec.widthMm, spec.heightMm, sheet);
      downloadBlob(
        result.blob,
        `${spec.country} ${spec.document.toLowerCase()} photos - ${sheet.label}.jpg`,
      );
      toast.success(`${plural(result.copies, 'copy', 'copies')} on one ${sheet.label} print.`);
    } catch (err) {
      toast.error(describePassportError(err));
    } finally {
      setBusy(null);
    }
  }

  const replacing = background.kind === 'colour';

  return (
    <Card>
      <CardHeader
        title="Save it"
        description="Nothing is uploaded. The file is built here and saved straight to your device."
      />

      <div className="flex flex-col gap-5 px-5 py-4">
        <div>
          <p className="text-[13px] font-medium text-ink">Background</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Choice
              selected={!replacing}
              onClick={() => onBackground({ kind: 'keep' })}
              label="Leave it alone"
            />
            {spec.background.swatches.map((colour) => (
              <button
                key={colour}
                type="button"
                onClick={() => onBackground({ kind: 'colour', colour })}
                disabled={!mask}
                title={mask ? `Replace with ${colour}` : 'The cut-out did not work on this photo'}
                className={cn(
                  'h-9 w-9 rounded-lg border-2 shadow-sm transition-transform disabled:cursor-not-allowed disabled:opacity-40',
                  replacing && background.colour === colour
                    ? 'border-accent scale-105'
                    : 'border-line hover:scale-105',
                )}
                style={{ backgroundColor: colour }}
              >
                <span className="sr-only">Replace the background with {colour}</span>
              </button>
            ))}
          </div>

          {replacing ? (
            <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn/5 px-3.5 py-3">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
              <p className="text-[13px] leading-relaxed text-ink">
                Most passport offices, including the UK and the US, refuse a photo that has been
                edited &mdash; and changing the background counts. Re-taking the photo against a
                plain wall is the safe way. Use this only where you know editing is allowed.
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 border-t border-line pt-4">
          <div>
            <p className="text-[13px] font-medium text-ink">One photo</p>
            <p className="mt-0.5 text-[13px] text-muted">
              {sizeLabel(spec)} at {spec.dpi} dpi
              {saved ? ` — last saved ${formatBytes(saved.bytes)}` : ''}
            </p>
            <div className="mt-2 inline-flex rounded-lg border border-line p-0.5">
              {(['image/jpeg', 'image/png'] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFormat(id)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors',
                    format === id ? 'bg-accent text-accent-ink' : 'text-muted hover:text-ink',
                  )}
                >
                  {id === 'image/jpeg' ? 'JPEG' : 'PNG'}
                </button>
              ))}
            </div>
          </div>

          <Button variant="primary" onClick={savePhoto} disabled={busy !== null}>
            {busy === 'photo' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Download className="h-4 w-4" aria-hidden />
            )}
            Save the photo
          </Button>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 border-t border-line pt-4">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-ink">A sheet to print</p>
            <p className="mt-0.5 max-w-md text-[13px] leading-relaxed text-muted">
              {capacity.copies > 0
                ? `${plural(capacity.copies, 'copy', 'copies')} on one print, with lines to cut along. Any shop that prints photos can do this for pennies.`
                : 'This photo is larger than that print. Pick a bigger one.'}
            </p>
            <select
              value={sheetId}
              onChange={(e) => setSheetId(e.target.value)}
              aria-label="Print size"
              className="mt-2 h-9 rounded-lg border border-line bg-surface px-2 text-[13px] text-ink focus:border-accent focus:outline-none"
            >
              {SHEETS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label} &mdash; {item.hint}
                </option>
              ))}
            </select>
          </div>

          <Button onClick={saveSheet} disabled={busy !== null || capacity.copies === 0}>
            {busy === 'sheet' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Printer className="h-4 w-4" aria-hidden />
            )}
            Save the print sheet
          </Button>
        </div>

        {blocked ? (
          <p className="text-[13px] leading-relaxed text-warn">
            Something above says this photo will not pass as it is. You can still save it, but it is
            worth fixing first.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function Choice({
  selected,
  onClick,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-9 rounded-lg border px-3 text-[13px] font-medium transition-colors',
        selected
          ? 'border-accent bg-accent text-accent-ink'
          : 'border-line bg-surface text-muted hover:text-ink',
      )}
    >
      {label}
    </button>
  );
}
