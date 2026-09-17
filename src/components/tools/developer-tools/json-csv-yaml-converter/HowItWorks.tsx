'use client';

import { ChevronDown } from 'lucide-react';

const RULES: readonly { term: string; body: string }[] = [
  {
    term: 'Nested objects become dotted columns',
    body: '{ "address": { "city": "London" } } flattens to a column called address.city, and rebuilds into a real object on the way back.',
  },
  {
    term: 'Arrays become numbered columns',
    body: 'tags.0, tags.1, tags.2 — and any path segment that is bare digits turns back into an array rather than an object.',
  },
  {
    term: 'Keys that contain a dot still work',
    body: 'A key written literally as "a.b" is escaped in the header as a\\.b, so it is never mistaken for two levels of nesting. A key that is only digits is escaped the same way.',
  },
  {
    term: 'Empty cells and nulls are different things',
    body: 'A null is written as the word null. An empty cell reads back as an empty string — except under an array index, where it is treated as a gap so ragged lists keep their length.',
  },
  {
    term: 'Type reading is a choice, not a guess you are stuck with',
    body: 'By default 42 becomes a number and true a boolean. Leading zeros, very long digit strings and anything that would lose precision are always kept as text. Turn the toggle off to keep every cell exactly as typed.',
  },
  {
    term: 'Converting to the same format just tidies it',
    body: 'JSON and YAML are re-indented. CSV is re-quoted and given the delimiter you picked, with every cell value left byte-for-byte alone.',
  },
];

/** Collapsed by default — the rules only matter once something looks odd. */
export function HowItWorks() {
  return (
    <details className="group rounded-2xl border border-line bg-surface shadow-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-ink">
            How nesting is flattened and rebuilt
          </h2>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
            The six rules that decide whether a round trip comes back unchanged.
          </p>
        </div>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-faint transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>

      <dl className="grid gap-x-6 gap-y-4 border-t border-line px-5 py-4 sm:grid-cols-2">
        {RULES.map((rule) => (
          <div key={rule.term}>
            <dt className="text-[13px] font-medium text-ink">{rule.term}</dt>
            <dd className="mt-1 text-[13px] leading-relaxed text-muted">{rule.body}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
