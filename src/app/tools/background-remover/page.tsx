import type { Metadata } from 'next';
import { getTool } from '@/config';
import { ToolShell } from '@/components/ToolShell';
import { BackgroundRemoverPanel } from '@/components/tools/background-remover/BackgroundRemoverPanel';

const tool = getTool('background-remover');

export const metadata: Metadata = { title: tool.name, description: tool.description };

export default function Page() {
  return (
    <ToolShell id="background-remover">
      <BackgroundRemoverPanel />
    </ToolShell>
  );
}
