import type { Metadata } from 'next';
import { getTool } from '@/config';
import { ToolShell } from '@/components/ToolShell';
import { PassportPhoto } from '@/components/tools/passport-photo/PassportPhoto';

const tool = getTool('passport-photo');

export const metadata: Metadata = { title: tool.name, description: tool.description };

export default function Page() {
  return (
    <ToolShell id="passport-photo">
      <PassportPhoto />
    </ToolShell>
  );
}
