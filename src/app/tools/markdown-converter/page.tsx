import type { Metadata } from 'next';
import { getTool } from '@/config';
import { ToolShell } from '@/components/ToolShell';
import { MarkdownConverter } from '@/components/tools/markdown-converter/MarkdownConverter';

const tool = getTool('markdown-converter');

export const metadata: Metadata = { title: tool.name, description: tool.description };

export default function Page() {
  return (
    <ToolShell id="markdown-converter">
      <MarkdownConverter />
    </ToolShell>
  );
}
