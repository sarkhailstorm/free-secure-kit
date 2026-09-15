import type { Emu, HalfPt, Pt, Px96, Twip } from '../types';

export const tw = (pt: Pt): Twip => Math.round(pt * 20);
export const hp = (pt: Pt): HalfPt => Math.round(pt * 2);
// Unrounded: docx multiplies by 9525 and rounds to EMU itself, so a whole pixel is not needed.
export const px96 = (pt: Pt): Px96 => (pt * 96) / 72;
export const emu = (pt: Pt): Emu => Math.round(pt * 12700);
export const borderEighths = (pt: Pt): number => Math.min(96, Math.max(2, Math.round(pt * 8)));

export function hex(colour: string | null, fallback = '000000'): string {
  if (!colour) return fallback;
  const clean = colour.replace(/^#/, '').toUpperCase();
  return /^[0-9A-F]{6}$/.test(clean) ? clean : fallback;
}
