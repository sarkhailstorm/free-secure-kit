'use client';

import { useState } from 'react';
import { Combine, Minimize2, Scissors } from 'lucide-react';
import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { cn } from '@/lib/cn';
import { CompressPanel } from './CompressPanel';
import { MergePanel } from './MergePanel';
import { SplitPanel } from './SplitPanel';

type Mode = 'merge' | 'split' | 'compress';

const TABS: readonly TabItem<Mode>[] = [
  { id: 'merge', label: 'Merge', icon: <Combine className="h-3.5 w-3.5" aria-hidden /> },
  { id: 'split', label: 'Split', icon: <Scissors className="h-3.5 w-3.5" aria-hidden /> },
  { id: 'compress', label: 'Compress', icon: <Minimize2 className="h-3.5 w-3.5" aria-hidden /> },
];

/**
 * Merge, split and compress, each with its own files.
 *
 * All three panels stay mounted so that switching tabs never throws away a
 * queue you built up or a document you already opened.
 */
export function PdfTools() {
  const [mode, setMode] = useState<Mode>('merge');

  return (
    <div
      className="flex flex-col gap-5"
      // A file dropped just beside a drop zone would otherwise be opened by
      // the browser, throwing away whatever was queued up here.
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
    >
      <Tabs tabs={TABS} active={mode} onChange={setMode} label="PDF tools" />

      <div role="tabpanel" aria-label="Merge" hidden={mode !== 'merge'} className={cn(mode !== 'merge' && 'hidden')}>
        <MergePanel active={mode === 'merge'} />
      </div>
      <div role="tabpanel" aria-label="Split" hidden={mode !== 'split'} className={cn(mode !== 'split' && 'hidden')}>
        <SplitPanel />
      </div>
      <div
        role="tabpanel"
        aria-label="Compress"
        hidden={mode !== 'compress'}
        className={cn(mode !== 'compress' && 'hidden')}
      >
        <CompressPanel />
      </div>
    </div>
  );
}
