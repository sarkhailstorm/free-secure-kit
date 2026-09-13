'use client';

import { useState } from 'react';
import { Binary, CaseSensitive, Eraser, GitCompare } from 'lucide-react';
import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { CasePanel } from './CasePanel';
import { DiffPanel } from './DiffPanel';
import { EncodePanel } from './EncodePanel';
import { WhitespacePanel } from './WhitespacePanel';

type SectionId = 'diff' | 'case' | 'whitespace' | 'encode';

const TABS: readonly TabItem<SectionId>[] = [
  { id: 'diff', label: 'Diff', icon: <GitCompare className="h-3.5 w-3.5" aria-hidden /> },
  { id: 'case', label: 'Case', icon: <CaseSensitive className="h-3.5 w-3.5" aria-hidden /> },
  {
    id: 'whitespace',
    label: 'Whitespace',
    icon: <Eraser className="h-3.5 w-3.5" aria-hidden />,
  },
  { id: 'encode', label: 'Encode', icon: <Binary className="h-3.5 w-3.5" aria-hidden /> },
];

/**
 * Four small text tools behind one tab strip.
 *
 * Every panel stays mounted so switching tabs never loses what you typed —
 * the inactive ones are hidden rather than unmounted.
 */
export function TextUtilities() {
  const [section, setSection] = useState<SectionId>('diff');

  return (
    <div className="space-y-6">
      <Tabs
        tabs={TABS}
        active={section}
        onChange={setSection}
        label="Text utilities"
        className="max-w-full"
      />

      <div
        className={section === 'diff' ? 'block animate-fade-in' : 'hidden'}
        role="tabpanel"
        aria-label="Diff checker"
      >
        <DiffPanel />
      </div>
      <div
        className={section === 'case' ? 'block animate-fade-in' : 'hidden'}
        role="tabpanel"
        aria-label="Case converter"
      >
        <CasePanel />
      </div>
      <div
        className={section === 'whitespace' ? 'block animate-fade-in' : 'hidden'}
        role="tabpanel"
        aria-label="Whitespace cleaner"
      >
        <WhitespacePanel />
      </div>
      <div
        className={section === 'encode' ? 'block animate-fade-in' : 'hidden'}
        role="tabpanel"
        aria-label="Encode and decode"
      >
        <EncodePanel />
      </div>
    </div>
  );
}
