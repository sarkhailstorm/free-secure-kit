import type { Metadata } from 'next';
import { getTool } from '@/config';
import { ToolShell } from '@/components/ToolShell';
import { ImageTools } from '@/components/tools/image-tools/ImageTools';

const tool = getTool('image-tools');

export const metadata: Metadata = { title: tool.name, description: tool.description };

export default function Page() {
  return (
    <ToolShell id="image-tools">
      <ImageTools />
    </ToolShell>
  );
}
