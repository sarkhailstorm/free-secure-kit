'use client';

import { useState } from 'react';
import { ImageDown, Scissors } from 'lucide-react';
import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { cn } from '@/lib/cn';
import { BackgroundRemoverPanel } from './BackgroundRemoverPanel';
import { ImageCompressor } from './ImageCompressor';

type Mode = 'compress' | 'background';

const TABS: readonly TabItem<Mode>[] = [
  { id: 'compress', label: 'Compress', icon: <ImageDown className="h-3.5 w-3.5" aria-hidden /> },
  {
    id: 'background',
    label: 'Remove background',
    icon: <Scissors className="h-3.5 w-3.5" aria-hidden />,
  },
];

export function ImageTools() {
  const [mode, setMode] = useState<Mode>('compress');

  return (
    <div
      className="flex flex-col gap-5"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
    >
      <Tabs tabs={TABS} active={mode} onChange={setMode} label="Image tools" />

      <div
        role="tabpanel"
        aria-label="Compress"
        hidden={mode !== 'compress'}
        className={cn(mode !== 'compress' && 'hidden')}
      >
        <ImageCompressor />
      </div>
      <div
        role="tabpanel"
        aria-label="Remove background"
        hidden={mode !== 'background'}
        className={cn(mode !== 'background' && 'hidden')}
      >
        <BackgroundRemoverPanel />
      </div>
    </div>
  );
}
