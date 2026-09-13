import type { Metadata } from 'next';
import { getTool } from '@/config';
import { ToolShell } from '@/components/ToolShell';
import { TextUtilities } from '@/components/tools/text-utilities/TextUtilities';

const tool = getTool('text-utilities');

export const metadata: Metadata = { title: tool.name, description: tool.description };

export default function Page() {
  return (
    <ToolShell id="text-utilities">
      <TextUtilities />
    </ToolShell>
  );
}
