'use client';

import { useState } from 'react';
import { Combine, FileType2, Images, KeyRound, Minimize2, Scissors, Table2 } from 'lucide-react';
import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { cn } from '@/lib/cn';
import { CompressPanel } from './CompressPanel';
import { ExcelPanel } from './ExcelPanel';
import { ImagesPanel } from './ImagesPanel';
import { MergePanel } from './MergePanel';
import { PasswordPanel } from './PasswordPanel';
import { SplitPanel } from './SplitPanel';
import { WordPanel } from './WordPanel';

type Mode = 'merge' | 'split' | 'compress' | 'unlock' | 'images' | 'word' | 'excel';

const TABS: readonly TabItem<Mode>[] = [
  { id: 'merge', label: 'Merge', icon: <Combine className="h-3.5 w-3.5" aria-hidden /> },
  { id: 'split', label: 'Split', icon: <Scissors className="h-3.5 w-3.5" aria-hidden /> },
  { id: 'compress', label: 'Compress', icon: <Minimize2 className="h-3.5 w-3.5" aria-hidden /> },
  { id: 'unlock', label: 'Unlock', icon: <KeyRound className="h-3.5 w-3.5" aria-hidden /> },
  { id: 'images', label: 'Images to PDF', icon: <Images className="h-3.5 w-3.5" aria-hidden /> },
  { id: 'word', label: 'PDF to Word', icon: <FileType2 className="h-3.5 w-3.5" aria-hidden /> },
  { id: 'excel', label: 'PDF to Excel', icon: <Table2 className="h-3.5 w-3.5" aria-hidden /> },
];

export function PdfTools() {
  const [mode, setMode] = useState<Mode>('merge');

  return (
    <div
      className="flex flex-col gap-5"
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
      <div
        role="tabpanel"
        aria-label="Unlock"
        hidden={mode !== 'unlock'}
        className={cn(mode !== 'unlock' && 'hidden')}
      >
        <PasswordPanel />
      </div>
      <div
        role="tabpanel"
        aria-label="Images to PDF"
        hidden={mode !== 'images'}
        className={cn(mode !== 'images' && 'hidden')}
      >
        <ImagesPanel />
      </div>
      <div
        role="tabpanel"
        aria-label="PDF to Word"
        hidden={mode !== 'word'}
        className={cn(mode !== 'word' && 'hidden')}
      >
        <WordPanel />
      </div>
      <div
        role="tabpanel"
        aria-label="PDF to Excel"
        hidden={mode !== 'excel'}
        className={cn(mode !== 'excel' && 'hidden')}
      >
        <ExcelPanel />
      </div>
    </div>
  );
}
