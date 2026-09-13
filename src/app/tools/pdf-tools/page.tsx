import type { Metadata } from 'next';
import { getTool } from '@/config';
import { ToolShell } from '@/components/ToolShell';
import { PdfTools } from '@/components/tools/pdf-tools/PdfTools';

const tool = getTool('pdf-tools');

export const metadata: Metadata = {
  title: tool.name,
  description: tool.description,
};

export default function Page() {
  return (
    <ToolShell id="pdf-tools">
      <PdfTools />
    </ToolShell>
  );
}
