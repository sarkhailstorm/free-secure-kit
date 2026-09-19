import type { BackgroundRule, PhotoSpec, SheetSpec, SpecId } from './types';

const LIGHT_GREY: BackgroundRule = {
  label: 'Plain light grey or cream',
  swatches: ['#f2f2f0', '#e8e8e4', '#dedbd2'],
};

const WHITE: BackgroundRule = {
  label: 'Plain white or off-white',
  swatches: ['#ffffff', '#fafaf8', '#f4f4f2'],
};

const WHITE_OR_GREY: BackgroundRule = {
  label: 'Plain white or light grey',
  swatches: ['#ffffff', '#f2f2f0', '#e8e8e4'],
};

const NO_EDITING =
  'Do not retouch the photo. Cropping and resizing are fine; changing the background or the face is not.';

export const SPECS: Record<SpecId, PhotoSpec> = {
  'uk-passport': {
    id: 'uk-passport',
    country: 'United Kingdom',
    document: 'Passport',
    widthMm: 35,
    heightMm: 45,
    headMinMm: 29,
    headMaxMm: 34,
    background: LIGHT_GREY,
    digital: { minPx: 600, maxPx: 1125, minBytes: 50_000, maxBytes: 10_000_000 },
    dpi: 600,
    source: 'https://www.gov.uk/photos-for-passports',
    notes: [
      'The photo must have been taken in the last month.',
      'Neutral expression, mouth closed, eyes open, no head tilt.',
      NO_EDITING,
    ],
  },
  'uk-driving-licence': {
    id: 'uk-driving-licence',
    country: 'United Kingdom',
    document: 'Driving licence',
    widthMm: 35,
    heightMm: 45,
    headMinMm: 29,
    headMaxMm: 34,
    background: LIGHT_GREY,
    dpi: 600,
    source: 'https://www.gov.uk/driving-licence-photo',
    notes: ['The same photo rules as a UK passport.', NO_EDITING],
  },
  'us-passport': {
    id: 'us-passport',
    country: 'United States',
    document: 'Passport or visa',
    widthMm: 50.8,
    heightMm: 50.8,
    headMinMm: 25,
    headMaxMm: 35,
    eyeMinMm: 28,
    eyeMaxMm: 35,
    background: WHITE,
    digital: { minPx: 600, maxPx: 1200 },
    dpi: 500,
    source: 'https://travel.state.gov/en/passports/apply/help/photos.html',
    notes: [
      'Taken in the last six months.',
      'The eyes must sit between 28 mm and 35 mm up from the bottom edge.',
      NO_EDITING,
    ],
  },
  'schengen-visa': {
    id: 'schengen-visa',
    country: 'Europe',
    document: 'Schengen visa',
    widthMm: 35,
    heightMm: 45,
    headMinMm: 32,
    headMaxMm: 36,
    background: WHITE_OR_GREY,
    dpi: 600,
    source: 'https://home-affairs.ec.europa.eu/policies/schengen-borders-and-visa/visa-policy_en',
    notes: ['Follows the ICAO standard, so the face fills 70-80% of the photo.', NO_EDITING],
  },
  'ireland-passport': {
    id: 'ireland-passport',
    country: 'Ireland',
    document: 'Passport',
    widthMm: 35,
    heightMm: 45,
    headMinMm: 29,
    headMaxMm: 34,
    background: WHITE_OR_GREY,
    dpi: 600,
    source: 'https://www.dfa.ie/passports/passport-photographs/',
    notes: [NO_EDITING],
  },
  'australia-passport': {
    id: 'australia-passport',
    country: 'Australia',
    document: 'Passport',
    widthMm: 35,
    heightMm: 45,
    headMinMm: 32,
    headMaxMm: 36,
    background: WHITE,
    dpi: 600,
    source: 'https://www.passports.gov.au/getting-passport-how-it-works/photo-guidelines',
    notes: ['Two identical prints are needed, and a guarantor signs the back of one.', NO_EDITING],
  },
  'canada-passport': {
    id: 'canada-passport',
    country: 'Canada',
    document: 'Passport',
    widthMm: 50,
    heightMm: 70,
    headMinMm: 31,
    headMaxMm: 36,
    background: WHITE_OR_GREY,
    dpi: 600,
    source:
      'https://www.canada.ca/en/immigration-refugees-citizenship/services/canadian-passports/photos.html',
    notes: [
      'Canada asks for the photo to be taken by a commercial photographer, who writes their name, address and the date on the back. A photo made here will not be accepted for a Canadian passport.',
      NO_EDITING,
    ],
  },
  'india-passport': {
    id: 'india-passport',
    country: 'India',
    document: 'Passport',
    widthMm: 35,
    heightMm: 45,
    headMinMm: 32,
    headMaxMm: 36,
    background: WHITE,
    dpi: 600,
    source: 'https://www.passportindia.gov.in/',
    notes: [
      'India moved from the square 2 x 2 inch photo to this size recently. Check the current rule before you send it.',
      NO_EDITING,
    ],
  },
  'india-oci': {
    id: 'india-oci',
    country: 'India',
    document: 'OCI card or visa',
    widthMm: 50.8,
    heightMm: 50.8,
    headMinMm: 25,
    headMaxMm: 35,
    background: WHITE,
    dpi: 500,
    source: 'https://ociservices.gov.in/',
    notes: ['The square photo is still used for OCI cards, and for visas applied for abroad.'],
  },
  'icao-35x45': {
    id: 'icao-35x45',
    country: 'Anywhere else',
    document: 'Standard 35 x 45 mm',
    widthMm: 35,
    heightMm: 45,
    headMinMm: 32,
    headMaxMm: 36,
    background: WHITE_OR_GREY,
    dpi: 600,
    source: 'https://www.icao.int/Security/FAL/PassportStandards',
    notes: ['The size most countries use. Check your own country before you send it.'],
  },
  'icao-51x51': {
    id: 'icao-51x51',
    country: 'Anywhere else',
    document: 'Standard 2 x 2 inch',
    widthMm: 50.8,
    heightMm: 50.8,
    headMinMm: 25,
    headMaxMm: 35,
    eyeMinMm: 28,
    eyeMaxMm: 35,
    background: WHITE,
    dpi: 500,
    source: 'https://www.icao.int/Security/FAL/PassportStandards',
    notes: ['The square size used by the United States and a few others.'],
  },
  custom: {
    id: 'custom',
    country: 'Your own',
    document: 'Custom size',
    widthMm: 35,
    heightMm: 45,
    headMinMm: 29,
    headMaxMm: 34,
    background: WHITE_OR_GREY,
    dpi: 600,
    source: '',
    notes: ['Type in whatever your form asks for.'],
  },
};

export const SPEC_ORDER: readonly SpecId[] = [
  'uk-passport',
  'uk-driving-licence',
  'us-passport',
  'schengen-visa',
  'ireland-passport',
  'india-passport',
  'india-oci',
  'australia-passport',
  'canada-passport',
  'icao-35x45',
  'icao-51x51',
  'custom',
];

export const DEFAULT_SPEC: SpecId = 'uk-passport';

export function getSpec(id: SpecId): PhotoSpec {
  return SPECS[id];
}

export function sizeLabel(spec: { widthMm: number; heightMm: number }): string {
  const round = (mm: number) => (Number.isInteger(mm) ? String(mm) : mm.toFixed(1));
  return `${round(spec.widthMm)} × ${round(spec.heightMm)} mm`;
}

export const SHEETS: readonly SheetSpec[] = [
  {
    id: '6x4',
    label: '6 × 4 inch',
    widthMm: 152.4,
    heightMm: 101.6,
    hint: 'The standard photo print. Cheapest, and every shop does it.',
  },
  {
    id: '7x5',
    label: '7 × 5 inch',
    widthMm: 177.8,
    heightMm: 127,
    hint: 'A larger print, so more copies on one sheet.',
  },
  {
    id: 'a4',
    label: 'A4',
    widthMm: 210,
    heightMm: 297,
    hint: 'For printing at home on photo paper.',
  },
];

export const DEFAULT_SHEET = '6x4';
