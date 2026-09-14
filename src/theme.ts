/**
 * Brand tokens lifted from the Riskyc Fashion app (tailwind.config.js) so
 * RiskyC Chat reads as the same brand family, not a different app. Accent
 * colors (brand/gold) stay constant across light/dark — like WhatsApp's
 * green, they're the same in both modes; only surfaces/text/hairlines swap.
 */
export type Palette = {
  background: string;
  surface: string;
  /** Subtle brand-tinted panel bg: search bars, toggle tracks. */
  tint1: string;
  /** A touch stronger: avatars, incoming bubbles, row icon chips. */
  tint2: string;
  textPrimary: string;
  textMuted: string;
  hairline: string;
  inputBorder: string;

  brand50: string;
  brand100: string;
  brand200: string;
  brand300: string;
  brand400: string;
  brand500: string;
  brand600: string;
  brand700: string;
  brand800: string;
  brand900: string;

  gold400: string;
  gold500: string;
  gold600: string;
};

const accents = {
  brand50: '#fff0f5',
  brand100: '#ffe0eb',
  brand200: '#ffc2d4',
  brand300: '#ff94b3',
  brand400: '#ff5585',
  brand500: '#ff1a5e',
  brand600: '#e6004a',
  brand700: '#c2003d',
  brand800: '#990030',
  brand900: '#7a0027',

  gold400: '#f5c842',
  gold500: '#e6b800',
  gold600: '#cc9f00',
} as const;

export const lightPalette: Palette = {
  ...accents,
  background: '#fff8fa',
  surface: '#ffffff',
  tint1: '#fff0f5',
  tint2: '#ffe0eb',
  textPrimary: '#2b1016',
  textMuted: '#8a5a66',
  hairline: '#f5e2e7',
  inputBorder: '#ffc2d4',
};

export const darkPalette: Palette = {
  ...accents,
  background: '#150c0f',
  surface: '#1f1317',
  tint1: '#2a1920',
  tint2: '#341f28',
  textPrimary: '#f5e8ea',
  textMuted: '#c79aa4',
  hairline: '#3a2830',
  inputBorder: '#4a2e38',
};

export const fonts = {
  display: 'PlayfairDisplay_700Bold',
  displayItalicMedium: 'PlayfairDisplay_600SemiBold_Italic',
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemiBold: 'Inter_600SemiBold',
  sansBold: 'Inter_700Bold',
} as const;

/** For components that render the same regardless of light/dark (Button shadow, Logo). */
export const brandAccents = accents;

export const gradients = {
  brand: [accents.brand400, accents.brand600] as const,
  gold: [accents.gold400, accents.gold600] as const,
};

/**
 * The tab bar floats above the screen edge (like WhatsApp's iOS bar) instead
 * of docking flush to it, so React Navigation no longer reserves space for
 * it automatically — every tab screen has to leave room for it manually
 * using these same numbers, or its own content/FAB ends up hidden behind it.
 */
export const tabBarLayout = {
  height: 58,
  bottomMargin: 12,
  sideMargin: 16,
};

/** Bottom padding for a tab screen's scrollable content, clearing the floating bar. */
export function TAB_BAR_CLEARANCE(insetsBottom: number): number {
  return insetsBottom + tabBarLayout.bottomMargin + tabBarLayout.height + 20;
}

/** `bottom` offset for a FAB that should float just above the tab bar. */
export function fabBottomOffset(insetsBottom: number): number {
  return insetsBottom + tabBarLayout.bottomMargin + tabBarLayout.height + 16;
}
