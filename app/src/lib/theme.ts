// The app's colors. Dark by default; Settings → Display can switch to light, or to "auto": light
// during the day, dark in the evening and night (see displayMode.ts).
//
// `colors` is one shared object whose values are swapped when the display changes, so code keeps
// reading `colors.text` and simply gets the current value the next time it draws.

const DARK = {
  bg: '#0e1120',
  card: '#181c33',
  cardBorder: '#262b4a',
  text: '#e8eaf6',
  muted: '#8a90b2',
  accent: '#9fa8ff', // buttons, selected chips, links
  warm: '#ffc47a', // "want to" items and notes
  danger: '#ff7b86',
  success: '#7be0a8', // "done" items
  successBg: '#15241f',
  chip: '#232846',
};

const LIGHT: typeof DARK = {
  bg: '#f3f4fa',
  card: '#ffffff',
  cardBorder: '#d9dcec',
  text: '#1a1d33',
  muted: '#5f6688',
  accent: '#4c57c9', // darker accents, so they read on white (and white text reads on them)
  warm: '#b26a00',
  danger: '#c8323f',
  success: '#1c8a55',
  successBg: '#e3f4ea',
  chip: '#e9ebf6',
};

export type ThemeName = 'dark' | 'light';

export const colors = { ...DARK };

let current: ThemeName = 'dark';
export const themeName = () => current;

/** Swap every color to the given theme. Screens redraw through useThemeName() (displayMode.ts). */
export function applyTheme(name: ThemeName) {
  current = name;
  Object.assign(colors, name === 'light' ? LIGHT : DARK);
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = 12;
