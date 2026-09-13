import type { Metadata } from 'next';
import { getTool } from '@/config';
import { ToolShell } from '@/components/ToolShell';
import { ImageCompressor } from '@/components/tools/image-compressor/ImageCompressor';

const tool = getTool('image-compressor');

export const metadata: Metadata = { title: tool.name, description: tool.description };

export default function Page() {
  return (
    <ToolShell id="image-compressor">
      <ImageCompressor />
    </ToolShell>
  );
}
