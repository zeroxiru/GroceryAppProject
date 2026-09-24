/**
 * Tokens from the "Daily Bazar POS" design system (project/tokens.json) that
 * the /pos components use. Kept separate from COLORS so the existing screens
 * are untouched; the POS components migrate to these as they're rebuilt.
 */
export const POS = {
  brand900: '#0F3D2E',
  brand600: '#116C41', // darkened from the app green to hold 4.5:1 with white text
  brand100: '#E3F3E9',
  surface100: '#F6F8F6',
  surface200: '#EDF1EE',
  ink900: '#14231C',
  ink600: '#55675D',
  ink400: '#8FA096',
  border200: '#DCE6DF',
  border600: '#749081',
  warning600: '#7A4E0F',
  warning100: '#FCEFD8',
  danger600: '#C7402F',
  danger100: '#FBE4E1',
  tagInk: '#3A2E2C',
} as const;

/** Category tag backgrounds (tag-1 … tag-8). Always paired with a text label, never colour alone. */
export const TAG_COLORS = [
  '#FBE2E1', '#FDE9CE', '#FBF3C6', '#DCEFDD',
  '#D6EEEA', '#DAEAF6', '#E6E1F5', '#F1E0EC',
] as const;

/**
 * A category always gets the same tag colour — on the chip, on the product
 * badge, everywhere — because it's derived from the category key itself, not
 * from list order (which shifts as products are added or sold).
 */
export function tagColorFor(categoryKey: string | undefined | null): string {
  if (!categoryKey) return TAG_COLORS[1];
  let h = 0;
  for (let i = 0; i < categoryKey.length; i++) h = (h * 31 + categoryKey.charCodeAt(i)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}
