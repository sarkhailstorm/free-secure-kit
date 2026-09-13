import type { Metadata } from 'next';
import { getTool } from '@/config';
import { ToolShell } from '@/components/ToolShell';
import { CsvCleaner } from '@/components/tools/csv-cleaner/CsvCleaner';

const tool = getTool('csv-cleaner');

export const metadata: Metadata = { title: tool.name, description: tool.description };

export default function Page() {
  return (
    <ToolShell id="csv-cleaner">
      <CsvCleaner />
    </ToolShell>
  );
}
