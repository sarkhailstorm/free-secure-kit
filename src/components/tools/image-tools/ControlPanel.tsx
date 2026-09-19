'use client';

import { useId, useState } from 'react';
import { MapPinOff, RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Slider } from '@/components/ui/Slider';
import {
  FORMAT_OPTIONS,
  RESIZE_PRESETS,
  describeResize,
  parsePixelInput,
  qualityEffect,
} from '@/lib/image-compressor/settings';
import type {
  CompressSettings,
  OutputFormat,
  ResizeSettings,
  ResizePresetId,
} from '@/lib/image-compressor/types';
import { ChoiceGroup, type Choice } from './ChoiceGroup';

const presetChoices: readonly Choice<ResizePresetId>[] = RESIZE_PRESETS.map((p) => ({
  id: p.id,
  label: p.max ? `${p.label} ${p.max}` : p.label,
  detail: p.detail,
}));

const formatChoices: readonly Choice<OutputFormat>[] = FORMAT_OPTIONS.map((f) => ({
  id: f.id,
  label: f.label,
}));

const numberField =
  'h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink transition-colors placeholder:text-faint focus:border-accent/60 disabled:cursor-not-allowed disabled:opacity-45';

function qualityHint(format: OutputFormat): string {
  if (format === 'original') {
    return 'Lower means a smaller file — softer detail in JPEG and WebP, fewer colours in PNG.';
  }
  return qualityEffect(format) === 'colours'
    ? 'PNG has no lossy setting, so this trims its colour palette instead — low values posterise.'
    : 'Lower means a smaller file and softer detail.';
}

function resizeIsActive(resize: ResizeSettings): boolean {
  if (resize.preset === 'original') return false;
  if (resize.preset === 'custom') return Boolean(resize.customWidth || resize.customHeight);
  return true;
}

export function ControlPanel({
  settings,
  onChange,
  onRerun,
  disabled,
  canRerun,
  stale,
}: {
  settings: CompressSettings;
  onChange: (next: CompressSettings) => void;
  onRerun: () => void;
  disabled: boolean;
  canRerun: boolean;
  stale: boolean;
}) {
  const widthId = useId();
  const heightId = useId();
  const [widthText, setWidthText] = useState(
    settings.resize.customWidth ? String(settings.resize.customWidth) : '',
  );
  const [heightText, setHeightText] = useState(
    settings.resize.customHeight ? String(settings.resize.customHeight) : '',
  );

  function setResize(patch: Partial<CompressSettings['resize']>) {
    onChange({ ...settings, resize: { ...settings.resize, ...patch } });
  }

  return (
    <Card>
      <CardHeader
        title="Compression settings"
        description="Applied to every image in the batch. Change them and re-run as often as you like."
        actions={
          canRerun ? (
            <Button
              variant={stale ? 'primary' : 'secondary'}
              size="sm"
              onClick={onRerun}
              disabled={disabled}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Re-compress all
            </Button>
          ) : null
        }
      />

      <div className="grid gap-6 p-5 md:grid-cols-3">
        <div>
          <Slider
            label="Quality"
            value={settings.quality}
            min={10}
            max={100}
            step={1}
            suffix="%"
            disabled={disabled}
            hint={qualityHint(settings.format)}
            onChange={(quality) => onChange({ ...settings, quality })}
          />
        </div>

        <div>
          <p className="text-[13px] font-medium text-ink">Resize</p>
          <ChoiceGroup
            label="Resize preset"
            className="mt-2"
            choices={presetChoices}
            value={settings.resize.preset}
            disabled={disabled}
            onChange={(preset) => setResize({ preset })}
          />

          {settings.resize.preset === 'custom' ? (
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <div>
                <label htmlFor={widthId} className="block text-[11px] font-medium text-muted">
                  Max width (px)
                </label>
                <input
                  id={widthId}
                  type="number"
                  min={1}
                  max={20000}
                  step={1}
                  inputMode="numeric"
                  placeholder="auto"
                  className={`mt-1 ${numberField}`}
                  value={widthText}
                  disabled={disabled}
                  onChange={(e) => {
                    setWidthText(e.target.value);
                    setResize({ customWidth: parsePixelInput(e.target.value) });
                  }}
                />
              </div>
              <div>
                <label htmlFor={heightId} className="block text-[11px] font-medium text-muted">
                  Max height (px)
                </label>
                <input
                  id={heightId}
                  type="number"
                  min={1}
                  max={20000}
                  step={1}
                  inputMode="numeric"
                  placeholder="auto"
                  className={`mt-1 ${numberField}`}
                  value={heightText}
                  disabled={disabled}
                  onChange={(e) => {
                    setHeightText(e.target.value);
                    setResize({ customHeight: parsePixelInput(e.target.value) });
                  }}
                />
              </div>
            </div>
          ) : null}

          <p className="mt-1.5 text-xs text-faint">
            {describeResize(settings.resize)}.
            {resizeIsActive(settings.resize)
              ? ' Aspect ratio is kept, and an image already smaller than the target is left alone.'
              : ''}
          </p>
        </div>

        <div>
          <p className="text-[13px] font-medium text-ink">Output format</p>
          <ChoiceGroup
            label="Output format"
            className="mt-2"
            choices={formatChoices}
            value={settings.format}
            disabled={disabled}
            onChange={(format) => onChange({ ...settings, format })}
          />
          <p className="mt-1.5 flex items-start gap-1.5 text-xs text-faint">
            <Sparkles className="mt-px h-3 w-3 shrink-0 text-accent" aria-hidden />
            <span>
              WebP usually wins — same visual quality, noticeably smaller than JPEG or PNG.
            </span>
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2.5 border-t border-line px-5 py-3.5">
        <MapPinOff className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />
        <p className="text-[13px] leading-relaxed text-muted">
          <span className="font-medium text-ink">EXIF metadata is always stripped.</span> Re-encoding
          rebuilds each image from its pixels, so camera model, timestamps and{' '}
          <span className="font-medium text-ink">GPS location</span> are dropped from every file you
          download. There is no switch to turn this off, and nothing to opt out of.
        </p>
      </div>
    </Card>
  );
}
