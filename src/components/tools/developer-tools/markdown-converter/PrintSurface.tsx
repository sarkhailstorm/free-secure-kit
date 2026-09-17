'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  PRINT_BODY_CLASS,
  PRINT_ROOT_ID,
  printStylesheet,
  type ThemeId,
} from '@/lib/markdown-converter/themes';

/**
 * A copy of the document parked at the end of `<body>`, hidden on screen and
 * revealed only by the print stylesheet — which simultaneously hides every
 * other direct child of `<body>` (header, tool page, editor, controls, toasts).
 *
 * Printing a real element rather than rasterising a canvas is what makes the
 * resulting PDF searchable, selectable and small. The portal lives at body
 * level so that "hide everything except this" can be expressed as one rule
 * instead of unsetting the styles of a dozen ancestors.
 */
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
