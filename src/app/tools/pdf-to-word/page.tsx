import type { Metadata } from 'next';
import { getTool } from '@/config';
import { ToolShell } from '@/components/ToolShell';
import { PdfToWordPanel } from '@/components/tools/pdf-to-word/PdfToWordPanel';

const tool = getTool('pdf-to-word');

export const metadata: Metadata = { title: tool.name, description: tool.description };

export default function Page() {
  return (
    <ToolShell id="pdf-to-word">
      <PdfToWordPanel />
    </ToolShell>
  );
}
