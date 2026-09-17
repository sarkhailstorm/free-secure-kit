'use client';

import { useState } from 'react';
import {
  ArrowLeftRight,
  Binary,
  CaseSensitive,
  Eraser,
  FileCode2,
  GitCompare,
} from 'lucide-react';
import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { cn } from '@/lib/cn';
import { FormatConverter } from './json-csv-yaml-converter/FormatConverter';
import { MarkdownConverter } from './markdown-converter/MarkdownConverter';
import { CasePanel } from './text-utilities/CasePanel';
import { DiffPanel } from './text-utilities/DiffPanel';
import { EncodePanel } from './text-utilities/EncodePanel';
import { WhitespacePanel } from './text-utilities/WhitespacePanel';

type Mode = 'convert' | 'markdown' | 'diff' | 'case' | 'whitespace' | 'encode';

const TABS: readonly TabItem<Mode>[] = [
  {
    id: 'convert',
    label: 'JSON, CSV & YAML',
    icon: <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />,
  },
  { id: 'markdown', label: 'Markdown', icon: <FileCode2 className="h-3.5 w-3.5" aria-hidden /> },
  { id: 'diff', label: 'Diff', icon: <GitCompare className="h-3.5 w-3.5" aria-hidden /> },
  { id: 'case', label: 'Case', icon: <CaseSensitive className="h-3.5 w-3.5" aria-hidden /> },
  { id: 'whitespace', label: 'Whitespace', icon: <Eraser className="h-3.5 w-3.5" aria-hidden /> },
  { id: 'encode', label: 'Encode', icon: <Binary className="h-3.5 w-3.5" aria-hidden /> },
];

export function DeveloperTools() {
  const [mode, setMode] = useState<Mode>('convert');

  return (
    <div
      className="flex flex-col gap-5"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
    >
      <Tabs tabs={TABS} active={mode} onChange={setMode} label="Developer tools" />

      <div
        role="tabpanel"
        aria-label="JSON, CSV and YAML converter"
        hidden={mode !== 'convert'}
        className={cn(mode !== 'convert' && 'hidden')}
      >
        <FormatConverter />
      </div>
      <div
        role="tabpanel"
        aria-label="Markdown converter"
        hidden={mode !== 'markdown'}
        className={cn(mode !== 'markdown' && 'hidden')}
      >
        <MarkdownConverter active={mode === 'markdown'} />
      </div>
      <div
        role="tabpanel"
        aria-label="Diff checker"
        hidden={mode !== 'diff'}
        className={cn(mode !== 'diff' && 'hidden')}
      >
        <DiffPanel />
      </div>
      <div
        role="tabpanel"
        aria-label="Case converter"
        hidden={mode !== 'case'}
        className={cn(mode !== 'case' && 'hidden')}
      >
        <CasePanel />
      </div>
      <div
        role="tabpanel"
        aria-label="Whitespace cleaner"
        hidden={mode !== 'whitespace'}
        className={cn(mode !== 'whitespace' && 'hidden')}
      >
        <WhitespacePanel />
      </div>
      <div
        role="tabpanel"
        aria-label="Encode and decode"
        hidden={mode !== 'encode'}
        className={cn(mode !== 'encode' && 'hidden')}
      >
        <EncodePanel />
      </div>
    </div>
  );
}
