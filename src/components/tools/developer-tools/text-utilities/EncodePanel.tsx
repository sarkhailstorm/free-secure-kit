'use client';

import { useMemo, useState } from 'react';
import { CornerDownLeft, KeyRound, ShieldAlert, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Tabs, type TabItem } from '@/components/ui/Tabs';
import {
  base64Decode,
  base64Encode,
  decodeJwt,
  htmlEscape,
  htmlUnescape,
  urlDecode,
  urlEncode,
  type JwtResult,
  type UrlScope,
} from '@/lib/text-utilities/encode';
import {
  CheckboxRow,
  CopyButton,
  EmptyState,
  ErrorNote,
  Pill,
  SelectField,
  TextField,
} from './shared';

type EncodeMode = 'base64' | 'url' | 'html' | 'jwt';
type Direction = 'encode' | 'decode';

const MODE_TABS: readonly TabItem<EncodeMode>[] = [
  { id: 'base64', label: 'Base64' },
  { id: 'url', label: 'URL' },
  { id: 'html', label: 'HTML entities' },
  { id: 'jwt', label: 'JWT decode' },
];

const DIRECTION_TABS: readonly TabItem<Direction>[] = [
  { id: 'encode', label: 'Encode' },
  { id: 'decode', label: 'Decode' },
];

interface ConversionResult {
  output: string;
  error: string | null;
}

function attempt(run: () => string): ConversionResult {
  try {
    return { output: run(), error: null };
  } catch (err) {
    return {
      output: '',
      error: err instanceof Error ? err.message : 'That input could not be converted.',
    };
  }
}

export function EncodePanel() {
  const [mode, setMode] = useState<EncodeMode>('base64');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[13px] font-medium text-ink">Format</span>
        <Tabs tabs={MODE_TABS} active={mode} onChange={setMode} label="Encoding format" />
      </div>

      {/* All four keep their own text while you switch between them. */}
      <div className={mode === 'base64' ? 'block' : 'hidden'} role="tabpanel" aria-label="Base64">
        <Base64Section />
      </div>
      <div className={mode === 'url' ? 'block' : 'hidden'} role="tabpanel" aria-label="URL encoding">
        <UrlSection />
      </div>
      <div className={mode === 'html' ? 'block' : 'hidden'} role="tabpanel" aria-label="HTML entities">
        <HtmlSection />
      </div>
      <div className={mode === 'jwt' ? 'block' : 'hidden'} role="tabpanel" aria-label="JWT decode">
        <JwtSection />
      </div>
    </div>
  );
}

function Converter({
  title,
  description,
  direction,
  onDirection,
  value,
  onValue,
  options,
  result,
  placeholder,
  copyMessage,
  footnote,
}: {
  title: string;
  description: React.ReactNode;
  direction: Direction;
  onDirection: (direction: Direction) => void;
  value: string;
  onValue: (value: string) => void;
  options?: React.ReactNode;
  result: ConversionResult;
  placeholder: string;
  copyMessage: string;
  footnote?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader
        title={title}
        description={description}
        actions={
          <Button size="sm" variant="ghost" onClick={() => onValue('')} disabled={!value.length}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Clear
          </Button>
        }
      />

      <div className="flex flex-col gap-3 border-b border-line px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          tabs={DIRECTION_TABS}
          active={direction}
          onChange={onDirection}
          label="Direction"
        />
        {options ? <div className="flex flex-wrap items-center gap-4">{options}</div> : null}
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-2">
        <TextField
          label={direction === 'encode' ? 'Plain text' : 'Encoded text'}
          value={value}
          onChange={onValue}
          rows={9}
          placeholder={placeholder}
        />

        <div className="flex min-w-0 flex-col">
          {result.error && value.length > 0 ? (
            <div className="flex min-h-full flex-col">
              <p className="pb-1.5 text-[13px] font-medium text-ink">
                {direction === 'encode' ? 'Encoded' : 'Decoded'}
              </p>
              <ErrorNote>{result.error}</ErrorNote>
            </div>
          ) : (
            <TextField
              label={direction === 'encode' ? 'Encoded' : 'Decoded'}
              value={result.output}
              readOnly
              rows={9}
              actions={
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onValue(result.output)}
                    disabled={!result.output}
                    title="Feed this result back into the input"
                  >
                    <CornerDownLeft className="h-3.5 w-3.5" aria-hidden />
                    <span className="sr-only">Use result as input</span>
                  </Button>
                  <CopyButton
                    text={result.output}
                    label="Copy"
                    successMessage={copyMessage}
                    disabled={!result.output}
                  />
                </>
              }
            />
          )}
        </div>
      </div>

      {footnote ? (
        <p className="border-t border-line px-5 py-3 text-[12px] leading-relaxed text-faint">
          {footnote}
        </p>
      ) : null}
    </Card>
  );
}

function Base64Section() {
  const [direction, setDirection] = useState<Direction>('encode');
  const [urlSafe, setUrlSafe] = useState(false);
  const [value, setValue] = useState('');

  const result = useMemo<ConversionResult>(() => {
    if (value.length === 0) return { output: '', error: null };
    return attempt(() => (direction === 'encode' ? base64Encode(value, urlSafe) : base64Decode(value)));
  }, [value, direction, urlSafe]);

  return (
    <Converter
      title="Base64"
      description="Unicode-safe: text is converted to UTF-8 bytes first, so accents and emoji survive the trip."
      direction={direction}
      onDirection={setDirection}
      value={value}
      onValue={setValue}
      result={result}
      placeholder={direction === 'encode' ? 'Type anything — café, 日本語, 🎉' : 'Paste Base64 here…'}
      copyMessage={direction === 'encode' ? 'Base64 copied.' : 'Decoded text copied.'}
      options={
        <CheckboxRow
          label="URL-safe alphabet"
          checked={urlSafe}
          onChange={setUrlSafe}
          hint="Uses - and _ and drops the = padding"
        />
      }
      footnote={
        direction === 'decode'
          ? 'Decoding accepts both the standard and URL-safe alphabets, with or without padding.'
          : null
      }
    />
  );
}

const SCOPE_OPTIONS: readonly { value: UrlScope; label: string }[] = [
  { value: 'component', label: 'Component (encodeURIComponent)' },
  { value: 'full', label: 'Whole URL (encodeURI)' },
];

function UrlSection() {
  const [direction, setDirection] = useState<Direction>('encode');
  const [scope, setScope] = useState<UrlScope>('component');
  const [value, setValue] = useState('');

  const result = useMemo<ConversionResult>(() => {
    if (value.length === 0) return { output: '', error: null };
    return attempt(() =>
      direction === 'encode' ? urlEncode(value, scope) : urlDecode(value, scope),
    );
  }, [value, direction, scope]);

  return (
    <Converter
      title="URL escaping"
      description="Component mode escapes everything including / ? & =. Whole-URL mode leaves the structure of a link intact."
      direction={direction}
      onDirection={setDirection}
      value={value}
      onValue={setValue}
      result={result}
      placeholder={
        direction === 'encode'
          ? 'https://example.com/search?q=hello world'
          : 'https://example.com/search?q=hello%20world'
      }
      copyMessage={direction === 'encode' ? 'Encoded URL copied.' : 'Decoded URL copied.'}
      options={
        <div className="w-full min-w-[15rem] sm:w-auto">
          <SelectField label="Scope" value={scope} onChange={setScope} options={SCOPE_OPTIONS} />
        </div>
      }
    />
  );
}

function HtmlSection() {
  const [direction, setDirection] = useState<Direction>('encode');
  const [value, setValue] = useState('');

  const result = useMemo<ConversionResult>(() => {
    if (value.length === 0) return { output: '', error: null };
    return attempt(() => (direction === 'encode' ? htmlEscape(value) : htmlUnescape(value)));
  }, [value, direction]);

  return (
    <Converter
      title="HTML entities"
      description={
        `Escapes the five characters that break markup (& < > " and ') so HTML can be shown as text, and turns named or numeric entities back again.`
      }
      direction={direction}
      onDirection={setDirection}
      value={value}
      onValue={setValue}
      result={result}
      placeholder={
        direction === 'encode' ? '<a href="/x">Tom & Jerry</a>' : '&lt;a&gt;Tom &amp; Jerry&lt;/a&gt;'
      }
      copyMessage={direction === 'encode' ? 'Escaped HTML copied.' : 'Unescaped text copied.'}
      footnote="Unescaping is done with a lookup table rather than the browser's HTML parser, so pasted markup is never executed."
    />
  );
}

function JwtSection() {
  const [token, setToken] = useState('');

  const decoded = useMemo<{ value: JwtResult; error: null } | { value: null; error: string } | null>(
    () => {
      if (token.trim().length === 0) return null;
      try {
        return { value: decodeJwt(token, Date.now()), error: null };
      } catch (err) {
        return {
          value: null,
          error: err instanceof Error ? err.message : 'That token could not be decoded.',
        };
      }
    },
    [token],
  );

  const result = decoded?.value ?? null;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-warn/30 bg-warn/10 px-4 py-3.5">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
        <div className="min-w-0 text-[13px] leading-relaxed text-ink">
          <p className="font-semibold">The signature is not verified.</p>
          <p className="mt-1 text-muted">
            This is a <strong className="font-medium text-ink">decoder, not a validator</strong>.
            Anyone can write a JWT and base64 its contents, so nothing shown below proves the token
            is genuine, unexpired in the eyes of a server, or issued by who it claims. Only the
            issuer&rsquo;s key can tell you that.
          </p>
          <p className="mt-1 text-muted">
            The decoding happens in this browser tab. Your token is never sent anywhere — which is
            the point, since a real access token is a password in disguise.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Token"
          description="Paste a JWT — three base64url parts separated by dots. A leading “Bearer ” is ignored."
          actions={
            <Button size="sm" variant="ghost" onClick={() => setToken('')} disabled={!token.length}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Clear
            </Button>
          }
        />
        <div className="p-5">
          <TextField
            label="JWT"
            value={token}
            onChange={setToken}
            rows={5}
            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NSJ9.signature"
          />
        </div>
      </Card>

      {decoded?.error ? <ErrorNote>{decoded.error}</ErrorNote> : null}

      {!decoded ? (
        <Card>
          <div className="p-5">
            <EmptyState
              icon={<KeyRound className="h-4 w-4" aria-hidden />}
              title="No token yet"
              body="Paste a token above to see its header, payload and timestamp claims in plain English."
            />
          </div>
        </Card>
      ) : null}

      {result ? (
        <>
          <Card>
            <CardHeader
              title="Status"
              description="Read from the token's own claims — not checked against any server."
            />
            <div className="flex flex-wrap items-center gap-2 p-5">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] font-medium',
                  result.validity.state === 'expired' && 'bg-danger/15 text-danger',
                  result.validity.state === 'valid' && 'bg-ok/15 text-ok',
                  result.validity.state === 'not-yet-valid' && 'bg-warn/15 text-warn',
                  result.validity.state === 'unknown' && 'bg-line/60 text-muted',
                )}
              >
                {result.validity.state === 'expired'
                  ? 'Expired'
                  : result.validity.state === 'valid'
                    ? 'Not expired'
                    : result.validity.state === 'not-yet-valid'
                      ? 'Not valid yet'
                      : 'No expiry claim'}
              </span>
              <span className="text-[13px] text-muted">{result.validity.detail}</span>
              {result.algorithm ? <Pill tone="accent">alg: {result.algorithm}</Pill> : null}
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <JsonPanel title="Header" json={result.header} copyMessage="JWT header copied." />
            <JsonPanel title="Payload" json={result.payload} copyMessage="JWT payload copied." />
          </div>

          {result.claims.length > 0 ? (
            <Card>
              <CardHeader
                title="Claims"
                description="Standard timestamp claims are shown as real dates in your local time."
              />
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full min-w-[34rem] border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-line">
                      <th scope="col" className="px-5 py-2.5 font-medium text-muted">
                        Claim
                      </th>
                      <th scope="col" className="px-5 py-2.5 font-medium text-muted">
                        Value
                      </th>
                      <th scope="col" className="px-5 py-2.5 font-medium text-muted">
                        Meaning
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.claims.map((claim) => (
                      <tr key={claim.name} className="border-b border-line last:border-0">
                        <td className="whitespace-nowrap px-5 py-2.5 text-ink">{claim.name}</td>
                        <td className="max-w-[18rem] break-words px-5 py-2.5 font-mono text-[12px] text-muted">
                          {claim.raw}
                        </td>
                        <td className="px-5 py-2.5 text-muted">{claim.meaning || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Signature"
              description="Shown for reference only — it is not checked here."
            />
            <p className="scroll-thin overflow-x-auto break-all px-5 py-4 font-mono text-[12px] text-muted">
              {result.signature}
            </p>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function JsonPanel({
  title,
  json,
  copyMessage,
}: {
  title: string;
  json: string;
  copyMessage: string;
}) {
  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader
        title={title}
        actions={<CopyButton text={json} label="Copy" successMessage={copyMessage} />}
      />
      <div className="scroll-thin max-h-80 overflow-auto p-4">
        <pre className="min-w-0 whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-ink">
          {json}
        </pre>
      </div>
    </Card>
  );
}
