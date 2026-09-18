'use client';

import { useState } from 'react';
import { ImageDown, ScanFace, Scissors } from 'lucide-react';
import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { cn } from '@/lib/cn';
import { BackgroundRemoverPanel } from './BackgroundRemoverPanel';
import { ImageCompressor } from './ImageCompressor';
import { PassportPhoto } from './passport-photo/PassportPhoto';

type Mode = 'passport' | 'compress' | 'background';

const TABS: readonly TabItem<Mode>[] = [
  {
    id: 'passport',
    label: 'Passport photo',
    icon: <ScanFace className="h-3.5 w-3.5" aria-hidden />,
  },
  { id: 'compress', label: 'Compress', icon: <ImageDown className="h-3.5 w-3.5" aria-hidden /> },
  {
    id: 'background',
    label: 'Remove background',
    icon: <Scissors className="h-3.5 w-3.5" aria-hidden />,
  },
];

export function ImageTools() {
  const [mode, setMode] = useState<Mode>('passport');

  return (
    <div
      className="flex flex-col gap-5"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
    >
      <Tabs tabs={TABS} active={mode} onChange={setMode} label="Image tools" />

      <div
        role="tabpanel"
        aria-label="Passport photo"
        hidden={mode !== 'passport'}
        className={cn(mode !== 'passport' && 'hidden')}
      >
        <PassportPhoto />
      </div>
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
