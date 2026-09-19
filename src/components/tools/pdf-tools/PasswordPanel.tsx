'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { CircleCheckBig, Download, Eye, EyeOff, KeyRound, LockOpen, RotateCcw } from 'lucide-react';
import { useToast } from '@/components/ToastProvider';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Dropzone } from '@/components/ui/Dropzone';
import { downloadBlob } from '@/lib/download';
import { baseName, formatBytes } from '@/lib/format';
import { describePdfError, looksLikePdf } from '@/lib/pdf-tools/errors';
import {
  isUnlockerReady,
  unlockerDownloadSize,
  unlockPdf,
  type UnlockOutcome,
} from '@/lib/pdf-tools/password';
import { downloadName } from '@/lib/pdf-tools/pdf';
import { ErrorNote, Note, Progress } from './shared';

type Stage =
  | { kind: 'empty' }
  | { kind: 'working'; message: string; ratio: number | null }
  | { kind: 'asking'; wrong: boolean }
  | { kind: 'done'; blob: Blob; removed: 'password' | 'restrictions' }
  | { kind: 'not-protected' };

interface Picked {
  file: File;
  bytes: Uint8Array;
}

export function PasswordPanel() {
  const toast = useToast();
  const passwordId = useId();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: 'empty' });
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadHint, setDownloadHint] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      if (await isUnlockerReady()) return;
      const size = await unlockerDownloadSize();
      if (live) setDownloadHint(size);
    })();
    return () => {
      live = false;
    };
  }, []);

  const reset = useCallback(() => {
    setPicked(null);
    setStage({ kind: 'empty' });
    setPassword('');
    setReveal(false);
    setError(null);
  }, []);

  const attempt = useCallback(
    async (target: Picked, attemptPassword: string) => {
      setError(null);
      setStage({
        kind: 'working',
        message: downloadHint
          ? `Getting the unlocker ready — a one-time ${downloadHint} download.`
          : 'Opening your PDF…',
        ratio: null,
      });

      try {
        // Fresh copy each time: qpdf consumes the bytes, so a retry needs the original.
        const outcome: UnlockOutcome = await unlockPdf(target.bytes.slice(), attemptPassword);
        setDownloadHint(null);

        if (outcome.kind === 'not-protected') {
          setStage({ kind: 'not-protected' });
          return;
        }
        if (outcome.kind === 'needs-password') {
          setStage({ kind: 'asking', wrong: false });
          window.setTimeout(() => field.current?.focus(), 0);
          return;
        }
        if (outcome.kind === 'wrong-password') {
          setStage({ kind: 'asking', wrong: true });
          window.setTimeout(() => field.current?.select(), 0);
          return;
        }

        setStage({
          kind: 'done',
          blob: new Blob([outcome.bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' }),
          removed: outcome.removed,
        });
        setPassword('');
      } catch (err) {
        setError(describePdfError(err, target.file.name));
        setStage({ kind: 'empty' });
      }
    },
    [downloadHint],
  );

  const onFiles = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      if (!looksLikePdf(file)) {
        setError('Choose a PDF.');
        return;
      }
      reset();
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const target = { file, bytes };
        setPicked(target);
        await attempt(target, '');
      } catch (err) {
        setError(describePdfError(err, file.name));
      }
    },
    [attempt, reset],
  );

  function save() {
    if (stage.kind !== 'done' || !picked) return;
    downloadBlob(stage.blob, downloadName(`${baseName(picked.file.name)} - unlocked`, 'pdf', 'unlocked.pdf'));
    toast.success('Saved. The copy opens without a password.');
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title="Open a password-protected PDF"
          description="Banks lock statements with a password, and most upload forms will not take a locked file. Type the password in and get an unlocked copy back."
        />
        <div className="px-5 py-4 text-[13px] leading-relaxed text-muted">
          <p>
            This only works with a password you already have. It cannot guess one, and it cannot
            open a file you are not meant to open.
          </p>
          <p className="mt-1.5">
            Your PDF and your password stay in this tab. Neither is uploaded, saved or sent
            anywhere.
          </p>
        </div>
      </Card>

      {!picked ? (
        <Dropzone
          onFiles={onFiles}
          accept="application/pdf,.pdf"
          title="Drop a locked PDF here"
          hint={
            downloadHint
              ? `The unlocker is a one-time ${downloadHint} download, fetched when you drop a file.`
              : 'Nothing is uploaded. The file is opened on this device.'
          }
          icon={<KeyRound className="h-5 w-5" aria-hidden />}
        />
      ) : null}

      {error ? <ErrorNote message={error} /> : null}

      {picked ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{picked.file.name}</p>
              <p className="text-[13px] text-muted">{formatBytes(picked.file.size)}</p>
            </div>
            <Button size="sm" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Another file
            </Button>
          </div>

          <div className="px-5 py-4">
            {stage.kind === 'working' ? (
              <Progress label={stage.message} done={stage.ratio ?? 0} total={1} />
            ) : null}

            {stage.kind === 'not-protected' ? (
              <Note>
                This PDF is not protected, so there is nothing to remove. You can use it as it is.
              </Note>
            ) : null}

            {stage.kind === 'asking' ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (password.length > 0) void attempt(picked, password);
                }}
              >
                <label htmlFor={passwordId} className="text-[13px] font-medium text-ink">
                  The password for this PDF
                </label>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">
                  Banks often use your date of birth, or part of your account number. The email the
                  PDF came with usually says which.
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[13rem] flex-1">
                    <input
                      ref={field}
                      id={passwordId}
                      type={reveal ? 'text' : 'password'}
                      value={password}
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-10 w-full rounded-xl border border-line bg-surface pl-3 pr-10 text-sm text-ink shadow-sm focus:border-accent focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setReveal((on) => !on)}
                      aria-label={reveal ? 'Hide the password' : 'Show the password'}
                      className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition-colors hover:text-ink"
                    >
                      {reveal ? (
                        <EyeOff className="h-4 w-4" aria-hidden />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden />
                      )}
                    </button>
                  </div>
                  <Button type="submit" variant="primary" disabled={password.length === 0}>
                    <LockOpen className="h-4 w-4" aria-hidden />
                    Unlock it
                  </Button>
                </div>
                {stage.wrong ? (
                  <p className="mt-2.5 text-[13px] text-danger" role="alert">
                    That password did not open the file. Check it and try again.
                  </p>
                ) : null}
              </form>
            ) : null}

            {stage.kind === 'done' ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-2.5">
                  <CircleCheckBig className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />
                  <div className="text-[13px] leading-relaxed">
                    <p className="font-medium text-ink">
                      {stage.removed === 'password'
                        ? 'Unlocked. The copy opens without a password.'
                        : 'Unlocked. The copy can be printed and copied from.'}
                    </p>
                    <p className="text-muted">{formatBytes(stage.blob.size)}</p>
                  </div>
                </div>
                <Button variant="primary" onClick={save}>
                  <Download className="h-4 w-4" aria-hidden />
                  Save the unlocked PDF
                </Button>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
