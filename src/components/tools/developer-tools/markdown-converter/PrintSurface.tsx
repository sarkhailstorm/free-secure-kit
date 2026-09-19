import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  PRINT_BODY_CLASS,
  PRINT_ROOT_ID,
  printStylesheet,
  type ThemeId,
} from '@/lib/markdown-converter/themes';

export function PrintSurface({ html, themeId }: { html: string; themeId: ThemeId }) {
  const [mounted, setMounted] = useState(false);

  // document.body only exists in the browser; the page is prerendered.
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div id={PRINT_ROOT_ID} aria-hidden>
      <style dangerouslySetInnerHTML={{ __html: printStylesheet(themeId) }} />
      {/* Sanitised upstream in lib/markdown-converter/render. */}
      <div className={PRINT_BODY_CLASS} dangerouslySetInnerHTML={{ __html: html }} />
    </div>,
    document.body,
  );
}
