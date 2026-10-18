// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Astryx Design Tokens
 *
 * Defines all design tokens using StyleX defineVars.
 * - *Defaults: Plain objects with default values (used by defineVars and themes)
 * - *Vars: CSS custom properties that themes can override via createTheme
 *
 * SYNC: When modified, run `node scripts/generate-token-docs.mjs` to update docs.
 * CI checks for drift via --check flag. Adding or removing a token FAMILY (a
 * whole `*Defaults` group) also means updating:
 * - /packages/cli/assets/theme.template.ts (its inventory of what exists)
 *
 * Domain tokens (syntax highlighting, data visualization) live separately in
 * /packages/core/src/theme/domainTokens/ — they're tree-shaken from core components.
 */

import * as stylex from '@stylexjs/stylex';

// =============================================================================
// Color Tokens
// =============================================================================

export const colorDefaults = {
  // Core semantic
  '--color-accent': 'light-dark(#0064E0, #2694FE)',
  '--color-accent-muted': 'light-dark(#3585FD33, #0C87EF3F)',
  '--color-on-accent': 'light-dark(#FFFFFF, #FFFFFF)',
  '--color-neutral': 'light-dark(#2B383D1A, #DFE2E533)',
  '--color-background-surface': 'light-dark(#FFFFFF, #1F1F22)',
  '--color-background-body': 'light-dark(#F1F4F7, #111112)',
  '--color-overlay': 'light-dark(#0A131766, #11111299)',
  '--color-overlay-hover': 'light-dark(#2B383D0C, #FFFFFF0C)',
  '--color-overlay-pressed': 'light-dark(#2B383D19, #FFFFFF19)',
  '--color-background-muted': 'light-dark(#2B383D0C, #1111127F)',

  // Text
  '--color-text-primary': 'light-dark(#0A1317, #DFE2E5)',
  '--color-text-secondary': 'light-dark(#4E606F, #AAAFB5)',
  '--color-text-disabled': 'light-dark(#A4B0BC, #6F747C)',
  '--color-text-accent': 'light-dark(#0064E0, #4CA3FF)',
  '--color-on-dark': 'light-dark(#FFFFFF, #FFFFFF)',
  '--color-on-light': 'light-dark(#000000, #000000)',

  // Icon
  '--color-icon-accent': 'light-dark(#0064E0, #2694FE)',
  '--color-icon-primary': 'light-dark(#0A1317, #DFE2E5)',
  '--color-icon-secondary': 'light-dark(#4E606F, #AAAFB5)',
  '--color-icon-disabled': 'light-dark(#A4B0BC, #6F747C)',

  // Surface variants
  '--color-background-card': 'light-dark(#FFFFFF, #1F1F22)',
  '--color-background-popover': 'light-dark(#FFFFFF, #28292C)',
  '--color-background-inverted': 'light-dark(#0A1317, #FFFFFF)',
  '--color-background-error-inverted': 'light-dark(#A20025, #E53149)',

  // Status/Sentiment
  '--color-success': 'light-dark(#2F7D33, #3E7B40)',
  '--color-success-muted': 'light-dark(#4A984C33, #5895583F)',
  '--color-on-success': 'light-dark(#FFFFFF, #FFFFFF)',
  '--color-error': 'light-dark(#E71E40, #F64054)',
  '--color-error-muted': 'light-dark(#E71E4033, #F640543F)',
  '--color-on-error': 'light-dark(#FFFFFF, #FFFFFF)',
  '--color-warning': 'light-dark(#E9AF08, #F2C00B)',
  '--color-warning-muted': 'light-dark(#D9A20033, #D1A6003F)',
  '--color-on-warning': 'light-dark(#0A1317, #111112)',

  // Border
  '--color-border': 'light-dark(#2B383D19, #F2F4F619)',
  '--color-border-emphasized': 'light-dark(#CCD3DB, #494D53)',

  // Effects
  '--color-skeleton': 'light-dark(#CCD3DB, #5A5E66)',
  // "Channel on body" — slim affordances that need to read against body
  // luminance (ProgressBar tracks, Slider rails, Switch off-state). Default
  // is the same low-contrast surface as --color-skeleton; themes can
  // override per their neutral ramp if 1-D channels need more weight.
  '--color-track': 'light-dark(#CCD3DB, #5A5E66)',
  '--color-shadow': 'light-dark(#2B383D1A, #0000004C)',
  // Hover tint: black in light mode, white in dark mode - used with color-mix for hover states
  '--color-tint-hover': 'light-dark(#000000, #FFFFFF)',

  // Blue
  '--color-background-blue': 'light-dark(#1D74EF33, #0078DB33)',
  '--color-border-blue': 'light-dark(#0064E0, #2694FE)',
  '--color-icon-blue': 'light-dark(#0064E0, #2694FE)',
  '--color-text-blue': 'light-dark(#003583, #B6D8FF)',

  // Cyan
  '--color-background-cyan': 'light-dark(#29AFCB33, #49ADC433)',
  '--color-border-cyan': 'light-dark(#00A2BE, #00788D)',
  '--color-icon-cyan': 'light-dark(#29AFCB, #5DBAD1)',
  '--color-text-cyan': 'light-dark(#00505F, #B1EEFE)',

  // Gray
  '--color-background-gray': 'light-dark(#0A131733, #6469724C)',
  '--color-border-gray': 'light-dark(#5D788F, #7C828A)',
  '--color-icon-gray': 'light-dark(#4E606F, #AAAFB5)',
  '--color-text-gray': 'light-dark(#0A1317, #DFE2E5)',

  // Green
  '--color-background-green': 'light-dark(#6AB26B33, #74AF7533)',
  '--color-border-green': 'light-dark(#2F7D33, #589558)',
  '--color-icon-green': 'light-dark(#2F7D33, #65A266)',
  '--color-text-green': 'light-dark(#00490B, #BCE0BB)',

  // Orange
  '--color-background-orange': 'light-dark(#E97E1D33, #DF843F33)',
  '--color-border-orange': 'light-dark(#E97E1D, #A54F00)',
  '--color-icon-orange': 'light-dark(#D97000, #EB9352)',
  '--color-text-orange': 'light-dark(#622700, #FFB37E)',

  // Pink
  '--color-background-pink': 'light-dark(#E2579633, #D7639533)',
  '--color-border-pink': 'light-dark(#EF67A3, #BB477C)',
  '--color-icon-pink': 'light-dark(#B52970, #D76395)',
  '--color-text-pink': 'light-dark(#70003F, #FFA9CA)',

  // Purple
  '--color-background-purple': 'light-dark(#7952FF33, #7952FF33)',
  '--color-border-purple': 'light-dark(#8E7CFF, #6D46EA)',
  '--color-icon-purple': 'light-dark(#603BD2, #7952FF)',
  '--color-text-purple': 'light-dark(#3B2287, #B3ADFF)',

  // Red
  '--color-background-red': 'light-dark(#E71E4033, #E5314933)',
  '--color-border-red': 'light-dark(#E71E40, #F64054)',
  '--color-icon-red': 'light-dark(#D40034, #E53149)',
  '--color-text-red': 'light-dark(#750017, #FFAEAD)',

  // Teal
  '--color-background-teal': 'light-dark(#34B5A133, #4FB1A033)',
  '--color-border-teal': 'light-dark(#01A894, #007C6D)',
  '--color-icon-teal': 'light-dark(#009986, #39A593)',
  '--color-text-teal': 'light-dark(#003A32, #81C9BB)',

  // Yellow
  '--color-background-yellow': 'light-dark(#D9A20033, #D1A60033)',
  '--color-border-yellow': 'light-dark(#B78800, #A27F00)',
  '--color-icon-yellow': 'light-dark(#F3BE42, #FFDF8C)',
  '--color-text-yellow': 'light-dark(#6A4D00, #FBD052)',

  // Syntax highlighting
} as const;

export const colorVars = stylex.defineVars(colorDefaults);

// =============================================================================
// Spacing Tokens
// =============================================================================

// rem, like the type scale, so gaps and padding grow with the reader's root
// font size instead of tightening around larger text. At the default 16px
// root every step is still 4px × step: --spacing-2 is 8px, --spacing-4 16px.
export const spacingDefaults = {
  '--spacing-0': '0rem',
  '--spacing-0-5': '0.125rem',
  '--spacing-1': '0.25rem',
  '--spacing-1-5': '0.375rem',
  '--spacing-2': '0.5rem',
  '--spacing-3': '0.75rem',
  '--spacing-4': '1rem',
  '--spacing-5': '1.25rem',
  '--spacing-6': '1.5rem',
  '--spacing-7': '1.75rem',
  '--spacing-8': '2rem',
  '--spacing-9': '2.25rem',
  '--spacing-10': '2.5rem',
  '--spacing-11': '2.75rem',
  '--spacing-12': '3rem',
} as const;

export const spacingVars = stylex.defineVars(spacingDefaults);

// =============================================================================
// Size Tokens
// =============================================================================

export const sizeDefaults = {
  '--size-element-sm': '28px',
  '--size-element-md': '32px',
  '--size-element-lg': '36px',
} as const;

export const sizeVars = stylex.defineVars(sizeDefaults);

// =============================================================================
// Border Tokens
// =============================================================================

export const borderDefaults = {
  '--border-width': '1px',
} as const;

export const borderVars = stylex.defineVars(borderDefaults);

export type BorderVarName = keyof typeof borderDefaults;

// =============================================================================
// Focus Tokens
// =============================================================================
// The keyboard focus ring, as one definition for the whole system. Values come
// from Design Conventions §User Interaction States: 2px --color-accent at 3px
// offset. Components read these through utils/focusOutline.stylex.ts; the
// `:focus-visible` condition stays in core, so a theme can restyle the ring
// but cannot show it to pointer users.

export const focusDefaults = {
  '--focus-outline-width': '2px',
  '--focus-outline-style': 'solid',
  '--focus-outline-color': 'var(--color-accent)',
  '--focus-outline-offset': '3px',
} as const;

export const focusVars = stylex.defineVars(focusDefaults);

// =============================================================================
// Radius Tokens
// =============================================================================

export const radiusDefaults = {
  '--radius-none': '0px',
  '--radius-inner': '4px',
  '--radius-element': '8px',
  '--radius-container': '12px',
  '--radius-page': '28px',
  // Chat surfaces (bubbles, composer, drawer) are intentionally rounder than
  // cards in the same view. Tracks --radius-page's value by default but is a
  // distinct token so chat rounding can be themed independently. See #2072.
  '--radius-chat': '28px',
  '--radius-full': '9999px',
} as const;

export const radiusVars = stylex.defineVars(radiusDefaults);

// =============================================================================
// Shadow Tokens
// =============================================================================
// Shadow tokens: low → med → high (ascending intensity).
// Inset shadows: for input state rings.

export const shadowDefaults = {
  // Outer elevation shadows (ascending intensity: low < med < high)
  '--shadow-low':
    '0px 1px 1px light-dark(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.2)), 0px 2px 8px light-dark(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.2))',
  '--shadow-med':
    '0px 1px 2px light-dark(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.2)), 0px 2px 12px light-dark(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.2))',
  '--shadow-high':
    '0px 2px 2px light-dark(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.2)), 0px 8px 24px light-dark(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.3))',
  // Inset shadows for input border rings (interaction + validation states)
  '--shadow-inset-hover':
    'inset 0px 0px 0px 2px light-dark(rgba(5, 54, 89, 0.15), rgba(223, 226, 229, 0.2))',
  '--shadow-inset-selected': 'inset 0px 0px 0px 2px rgba(1, 113, 227, 0.5)',
  '--shadow-inset-success': 'inset 0px 0px 0px 2px rgba(38, 167, 86, 0.3)',
  '--shadow-inset-warning': 'inset 0px 0px 0px 2px rgba(226, 164, 0, 0.3)',
  '--shadow-inset-error': 'inset 0px 0px 0px 2px rgba(227, 25, 59, 0.3)',
} as const;

export const shadowVars = stylex.defineVars(shadowDefaults);

// =============================================================================
// Motion Tokens — Duration
// =============================================================================
// Duration primitives: pick a duration that matches the visual weight.
// Three bands: fast (micro-interactions), medium (entrance/exit), slow (continuous).
// min/max variants derive from base × ratio (default ratio ≈ 0.75).
// See motion in defineTheme for computed generation.

export const durationDefaults = {
  '--duration-fast-min': '130ms',
  '--duration-fast': '175ms',
  '--duration-fast-max': '230ms',
  '--duration-medium-min': '310ms',
  '--duration-medium': '410ms',
  '--duration-medium-max': '550ms',
  '--duration-slow-min': '730ms',
  '--duration-slow': '975ms',
  '--duration-slow-max': '1300ms',
} as const;

export const durationVars = stylex.defineVars(durationDefaults);

export type DurationVarName = keyof typeof durationDefaults;

// =============================================================================
// Motion Tokens — Easing
// =============================================================================

export const easeDefaults = {
  '--ease-standard': 'cubic-bezier(0.24, 1, 0.4, 1)',
} as const;

export const easeVars = stylex.defineVars(easeDefaults);

export type EaseVarName = keyof typeof easeDefaults;
// =============================================================================
// Typography Tokens - Font Families
// =============================================================================

export const typographyDefaults = {
  '--font-family-body':
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  '--font-family-code': '"SF Mono", Monaco, Consolas, monospace',
  '--font-family-heading':
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
} as const;

export const typographyVars = stylex.defineVars(typographyDefaults);

// =============================================================================
// Typography Tokens - Text Sizes
// =============================================================================

export const textSizeDefaults = {
  // Full geometric scale: round(14 × 1.2^step) / 16, default base=14, ratio=1.2
  '--font-size-4xs': '0.375rem', // step -5: 6px (14 × 1.2⁻⁵ ≈ 5.63 → 6)
  '--font-size-3xs': '0.4375rem', // step -4: 7px (14 × 1.2⁻⁴ ≈ 6.75 → 7)
  '--font-size-2xs': '0.5rem', // step -3: 8px (14 × 1.2⁻³ ≈ 8.10 → 8)
  '--font-size-xs': '0.625rem', // step -2: 10px (14 × 1.2⁻² ≈ 9.72 → 10)
  '--font-size-sm': '0.75rem', // step -1: 12px (14 × 1.2⁻¹ ≈ 11.67 → 12)
  '--font-size-base': '0.875rem', // step  0: 14px — base anchor
  '--font-size-lg': '1.0625rem', // step +1: 17px (14 × 1.2¹ ≈ 16.8 → 17)
  '--font-size-xl': '1.25rem', // step +2: 20px (14 × 1.2² ≈ 20.16 → 20)
  '--font-size-2xl': '1.5rem', // step +3: 24px (14 × 1.2³ ≈ 24.19 → 24)
  '--font-size-3xl': '1.8125rem', // step +4: 29px (14 × 1.2⁴ ≈ 29.03 → 29)
  '--font-size-4xl': '2.1875rem', // step +5: 35px (14 × 1.2⁵ ≈ 34.84 → 35)
  '--font-size-5xl': '2.625rem', // step +6: 42px (14 × 1.2⁶ ≈ 41.80 → 42)
} as const;

export const textSizeVars = stylex.defineVars(textSizeDefaults);

// =============================================================================
// Typography Tokens - Font Weights
// =============================================================================

export const fontWeightDefaults = {
  '--font-weight-normal': '400', // body, captions, code
  '--font-weight-medium': '500', // subheadlines, data viz
  '--font-weight-semibold': '600', // emphasized body, titles
  '--font-weight-bold': '700', // strong emphasis, headings
} as const;

export const fontWeightVars = stylex.defineVars(fontWeightDefaults);

// =============================================================================
// Token Types
// =============================================================================

export type ColorVarName = keyof typeof colorDefaults;
export type SpacingVarName = keyof typeof spacingDefaults;
export type SizeVarName = keyof typeof sizeDefaults;
export type RadiusVarName = keyof typeof radiusDefaults;
export type ShadowVarName = keyof typeof shadowDefaults;
export type TypographyVarName = keyof typeof typographyDefaults;
export type TextSizeVarName = keyof typeof textSizeDefaults;
export type FontWeightVarName = keyof typeof fontWeightDefaults;

// =============================================================================
// Typography Tokens - Type Scale (computed from base=14, ratio=1.2)
// =============================================================================
// These tokens are the source of truth for heading and text sizing.
// Components reference these tokens so that themes
// can override them via typography.scale in defineTheme.
//
// Default scale: base=14px, ratio=1.2, h4 anchored to base.
// Suggested starting points:
//   Dense/functional: { base: 12, ratio: 1.125 }
//   Default:          { base: 14, ratio: 1.2 }
//   Airy/editorial:   { base: 16, ratio: 1.25 }

export const typeScaleDefaults = {
  // Sizes are var() references to raw size tokens.
  // Line heights are hardcoded computed values (4px grid snapped, tiered target).
  // When typography.scale is used in defineTheme, both raw tokens AND these semantic
  // tokens are overridden together.
  //
  // Step mapping: h6=-2, h5=-1, h4=0(base), h3=+1, h2=+2, h1=+3
  //
  // Heading tokens
  '--text-heading-1-size': 'var(--font-size-2xl)', // step +3: 24px
  '--text-heading-1-weight': 'var(--font-weight-semibold)',
  '--text-heading-1-leading': '1.3333', // 24px → 32px (target 1.4, 4px snap)
  '--text-heading-2-size': 'var(--font-size-xl)', // step +2: 20px
  '--text-heading-2-weight': 'var(--font-weight-semibold)',
  '--text-heading-2-leading': '1.4', // 20px → 28px (target 1.4, 4px snap)
  '--text-heading-3-size': 'var(--font-size-lg)', // step +1: 17px
  '--text-heading-3-weight': 'var(--font-weight-semibold)',
  '--text-heading-3-leading': '1.4118', // 17px → 24px (target 1.5, 4px snap)
  '--text-heading-4-size': 'var(--font-size-base)', // step  0: 14px — base anchor
  '--text-heading-4-weight': 'var(--font-weight-semibold)',
  '--text-heading-4-leading': '1.4286', // 14px → 20px (target 1.5, 4px snap)
  '--text-heading-5-size': 'var(--font-size-sm)', // step -1: 12px
  '--text-heading-5-weight': 'var(--font-weight-semibold)',
  '--text-heading-5-leading': '1.6667', // 12px → 20px (target 1.5, 4px snap)
  '--text-heading-6-size': 'var(--font-size-xs)', // step -2: 10px
  '--text-heading-6-weight': 'var(--font-weight-semibold)',
  '--text-heading-6-leading': '1.6', // 10px → 16px (target 1.5, min dominated)

  // Text tokens — body/label/code at base(0), large at +1, supporting at -1
  '--text-body-size': 'var(--font-size-base)', // 14px
  '--text-body-weight': 'var(--font-weight-normal)',
  '--text-body-leading': '1.4286', // 14px → 20px
  '--text-large-size': 'var(--font-size-lg)', // 17px
  '--text-large-weight': 'var(--font-weight-semibold)',
  '--text-large-leading': '1.4118', // 17px → 24px
  '--text-label-size': 'var(--font-size-base)', // 14px
  '--text-label-weight': 'var(--font-weight-medium)',
  '--text-label-leading': '1.4286', // 14px → 20px
  '--text-code-size': 'var(--font-size-base)', // 14px
  '--text-code-weight': 'var(--font-weight-normal)',
  '--text-code-leading': '1.4286', // 14px → 20px
  '--text-supporting-size': 'var(--font-size-sm)', // 12px
  '--text-supporting-weight': 'var(--font-weight-normal)',
  '--text-supporting-leading': '1.6667', // 12px → 20px

  // Display tokens — continue the geometric progression above h1.
  // Display 1 = step +6 (largest, 42px), Display 3 = step +4 (29px, closest to h1).
  // Line heights are tighter (~1.2) than headings (~1.3) since large text reads better tight.
  // Font weight is normal (400) to balance the visual presence of large sizes.
  '--text-display-1-size': 'var(--font-size-5xl)', // 42px (14 × 1.2⁶, largest)
  '--text-display-1-weight': 'var(--font-weight-normal)',
  '--text-display-1-leading': '1.2381',
  '--text-display-2-size': 'var(--font-size-4xl)', // 35px (14 × 1.2⁵)
  '--text-display-2-weight': 'var(--font-weight-normal)',
  '--text-display-2-leading': '1.2571',
  '--text-display-3-size': 'var(--font-size-3xl)', // 29px (14 × 1.2⁴, closest to h1)
  '--text-display-3-weight': 'var(--font-weight-normal)',
  '--text-display-3-leading': '1.2414',
} as const;

export const typeScaleVars = stylex.defineVars(typeScaleDefaults);

export type TypeScaleVarName = keyof typeof typeScaleDefaults;
