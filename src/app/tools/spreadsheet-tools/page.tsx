import type { Metadata } from 'next';
import { getTool } from '@/config';
import { ToolShell } from '@/components/ToolShell';
import { SpreadsheetTools } from '@/components/tools/spreadsheet-tools/SpreadsheetTools';

const tool = getTool('spreadsheet-tools');

export const metadata: Metadata = { title: tool.name, description: tool.description };

export default function Page() {
  return (
    <ToolShell id="spreadsheet-tools">
      <SpreadsheetTools />
    </ToolShell>
  );
}
