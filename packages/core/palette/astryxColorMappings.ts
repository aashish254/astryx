// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Maps Astryx's core color roles to reviewed generated palette stops.
 * @input The runtime-sized Astryx palette reference projection.
 * @output Light and dark values for every core color token.
 * @position Private authoring and audit record for colorDefaults in tokens.stylex.ts.
 */

import {astryxPaletteRefs} from './astryxPaletteRefs.generated';

const {blue, cyan, green, neutral, orange, pink, purple, red, teal, yellow} =
  astryxPaletteRefs;

export const astryxColorMappings = {
  '--color-accent': [blue.light[50], blue.dark[60]],
  '--color-accent-muted': [`${blue.light[60]}33`, `${blue.dark[55]}3f`],
  '--color-on-accent': [neutral.light[100], neutral.dark[100]],
  '--color-neutral': [`${neutral.light[20]}1a`, `${neutral.dark[90]}33`],
  '--color-background-surface': [neutral.light[100], neutral.dark[15]],
  '--color-background-body': [neutral.light[95], neutral.dark[5]],
  '--color-overlay': [`${neutral.light[5]}66`, `${neutral.dark[5]}99`],
  '--color-overlay-hover': [`${neutral.light[20]}0c`, `${neutral.dark[100]}0c`],
  '--color-overlay-pressed': [
    `${neutral.light[20]}19`,
    `${neutral.dark[100]}19`,
  ],
  '--color-background-muted': [
    `${neutral.light[20]}0c`,
    `${neutral.dark[5]}7f`,
  ],
  '--color-text-primary': [neutral.light[5], neutral.dark[90]],
  '--color-text-secondary': [neutral.light[35], neutral.dark[75]],
  '--color-text-disabled': [neutral.light[70], neutral.dark[55]],
  '--color-text-accent': [blue.light[50], blue.dark[65]],
  '--color-on-dark': [neutral.light[100], neutral.dark[100]],
  '--color-on-light': [neutral.light[0], neutral.dark[0]],
  '--color-icon-accent': [blue.light[50], blue.dark[60]],
  '--color-icon-primary': [neutral.light[5], neutral.dark[90]],
  '--color-icon-secondary': [neutral.light[35], neutral.dark[75]],
  '--color-icon-disabled': [neutral.light[70], neutral.dark[55]],
  '--color-background-card': [neutral.light[100], neutral.dark[15]],
  '--color-background-popover': [neutral.light[100], neutral.dark[20]],
  '--color-background-inverted': [neutral.light[5], neutral.dark[100]],
  '--color-background-error-inverted': [red.light[35], red.dark[55]],
  '--color-success': [green.light[45], green.dark[45]],
  '--color-success-muted': [`${green.light[55]}33`, `${green.dark[55]}3f`],
  '--color-on-success': [neutral.light[100], neutral.dark[100]],
  '--color-error': [red.light[50], red.dark[60]],
  '--color-error-muted': [`${red.light[50]}33`, `${red.dark[60]}3f`],
  '--color-on-error': [neutral.light[100], neutral.dark[100]],
  '--color-warning': [yellow.light[75], yellow.dark[80]],
  '--color-warning-muted': [`${yellow.light[70]}33`, `${yellow.dark[70]}3f`],
  '--color-on-warning': [neutral.light[5], neutral.dark[5]],
  '--color-border': [`${neutral.light[20]}19`, `${neutral.dark[95]}19`],
  '--color-border-emphasized': [neutral.light[85], neutral.dark[35]],
  '--color-skeleton': [neutral.light[85], neutral.dark[45]],
  '--color-track': [neutral.light[85], neutral.dark[45]],
  '--color-shadow': [`${neutral.light[20]}1a`, `${neutral.dark[0]}4c`],
  '--color-tint-hover': [neutral.light[0], neutral.dark[100]],
  '--color-background-blue': [`${blue.light[55]}33`, `${blue.dark[50]}33`],
  '--color-border-blue': [blue.light[50], blue.dark[60]],
  '--color-icon-blue': [blue.light[50], blue.dark[60]],
  '--color-text-blue': [blue.light[25], blue.dark[85]],
  '--color-background-cyan': [`${cyan.light[65]}33`, `${cyan.dark[65]}33`],
  '--color-border-cyan': [cyan.light[60], cyan.dark[45]],
  '--color-icon-cyan': [cyan.light[65], cyan.dark[70]],
  '--color-text-cyan': [cyan.light[30], cyan.dark[90]],
  '--color-background-gray': [`${neutral.light[5]}33`, `${neutral.dark[50]}4c`],
  '--color-border-gray': [neutral.light[45], neutral.dark[60]],
  '--color-icon-gray': [neutral.light[35], neutral.dark[75]],
  '--color-text-gray': [neutral.light[5], neutral.dark[90]],
  '--color-background-green': [`${green.light[65]}33`, `${green.dark[65]}33`],
  '--color-border-green': [green.light[45], green.dark[55]],
  '--color-icon-green': [green.light[45], green.dark[60]],
  '--color-text-green': [green.light[25], green.dark[85]],
  '--color-background-orange': [
    `${orange.light[65]}33`,
    `${orange.dark[65]}33`,
  ],
  '--color-border-orange': [orange.light[65], orange.dark[45]],
  '--color-icon-orange': [orange.light[60], orange.dark[70]],
  '--color-text-orange': [orange.light[25], orange.dark[80]],
  '--color-background-pink': [`${pink.light[60]}33`, `${pink.dark[60]}33`],
  '--color-border-pink': [pink.light[65], pink.dark[50]],
  '--color-icon-pink': [pink.light[45], pink.dark[60]],
  '--color-text-pink': [pink.light[25], pink.dark[80]],
  '--color-background-purple': [
    `${purple.light[50]}33`,
    `${purple.dark[50]}33`,
  ],
  '--color-border-purple': [purple.light[60], purple.dark[45]],
  '--color-icon-purple': [purple.light[40], purple.dark[50]],
  '--color-text-purple': [purple.light[25], purple.dark[75]],
  '--color-background-red': [`${red.light[50]}33`, `${red.dark[55]}33`],
  '--color-border-red': [red.light[50], red.dark[60]],
  '--color-icon-red': [red.light[45], red.dark[55]],
  '--color-text-red': [red.light[25], red.dark[80]],
  '--color-background-teal': [`${teal.light[65]}33`, `${teal.dark[65]}33`],
  '--color-border-teal': [teal.light[60], teal.dark[45]],
  '--color-icon-teal': [teal.light[55], teal.dark[60]],
  '--color-text-teal': [teal.light[20], teal.dark[75]],
  '--color-background-yellow': [
    `${yellow.light[70]}33`,
    `${yellow.dark[70]}33`,
  ],
  '--color-border-yellow': [yellow.light[60], yellow.dark[55]],
  '--color-icon-yellow': [yellow.light[80], yellow.dark[90]],
  '--color-text-yellow': [yellow.light[35], yellow.dark[85]],
} as const;

export default astryxColorMappings;
