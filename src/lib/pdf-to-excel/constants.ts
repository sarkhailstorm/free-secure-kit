import type { Pt } from '@/lib/pdf-to-word/types';

// Word leaves 3.4–3.5 pt between one cell's border rect and the next at 9 pt body
export const RULE_JOIN_GAP = (bodySize: Pt): Pt => Math.max(4, 0.5 * bodySize);
// Word's top border clears the first vertical by 3.5 pt; at SEG_TOL the header row is lost
export const RULE_TOUCH_TOL: Pt = 4;

// Under 3 pages a repeat means nothing: a 2-page statement kept 2 of 41 lines without this
export const FURNITURE_MIN_PAGES = 3;
export const FURNITURE_MIN_HITS = 2;
export const FURNITURE_SHARE = 0.5;
// A header sits at the same height on every page; "TESCO STORES" does not
export const FURNITURE_Y_SD: Pt = 3;

export const PROFILE_BUCKET: Pt = 0.5;
// The narrowest real column gap measured is 12.5 pt at 8.5 pt body
export const GUTTER_MIN = (bodySize: Pt): Pt => Math.max(4, 0.7 * bodySize);
// Centre of the 0.05–0.12 window where unruled and ruled both resolve to 6 columns
export const GUTTER_FRAC_SCOUT = 0.08;
// With the prose gone, no line may cross a gutter — this is what finds zebra's 5th column
export const GUTTER_FRAC_STRICT = 0;
// Right-aligned amount edges cluster within 3 pt; ragged edges spread 9–33 pt
export const EDGE_TOL: Pt = 3;
export const ALIGN_SHARE_MIN = 0.8;

export const BAND_HEADER_LOOKUP = 2;
export const BAND_HEADER_FILL = 0.6;
// Wrapped tails sit within 2.2 line heights; the next block starts further down
export const BAND_TAIL_GAP = 2.2;
// Own model on own pages: 0–0.7 %. A model that does not belong: 7.3 % and up
export const PAGE_FIT_MAX = 0.05;

export const TYPE_MIN_SAMPLE = 3;
// 60 % found the money columns on all five tagged tables
export const TYPE_SHARE_MIN = 0.6;
export const MONEY_DECIMALS_MIN = 2;
export const DECIMALS_MAX = 4;

export const BALANCE_MIN_COVER = 0.8;
// Above this the column is not a running balance at all, so nothing is flagged
export const BALANCE_MAX_BREAK_SHARE = 0.2;

export const COL_WIDTH_MIN = 8;
export const COL_WIDTH_MAX = 60;
export const PREVIEW_ROWS = 50;
export const SHEET_NAME_MAX = 31;
export { PAGE_WARN_THRESHOLD } from '@/lib/pdf-to-word/constants';
