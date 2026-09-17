import type { Metadata } from 'next';
import { getTool } from '@/config';
import { ToolShell } from '@/components/ToolShell';
import { DeveloperTools } from '@/components/tools/developer-tools/DeveloperTools';

const tool = getTool('developer-tools');

export const metadata: Metadata = { title: tool.name, description: tool.description };

export default function Page() {
  return (
    <ToolShell id="developer-tools">
      <DeveloperTools />
    </ToolShell>
  );
}
