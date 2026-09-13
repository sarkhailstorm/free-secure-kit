import type { Metadata } from 'next';
import { getTool } from '@/config';
import { ToolShell } from '@/components/ToolShell';
import { FormatConverter } from '@/components/tools/json-csv-yaml-converter/FormatConverter';

const tool = getTool('json-csv-yaml-converter');

export const metadata: Metadata = { title: tool.name, description: tool.description };

export default function Page() {
  return (
    <ToolShell id="json-csv-yaml-converter">
      <FormatConverter />
    </ToolShell>
  );
}
