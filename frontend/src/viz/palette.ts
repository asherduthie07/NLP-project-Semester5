import type { ColorToken } from './types';

export type ColorResolver = (token: ColorToken) => string;

/** Reads a design token. Three.js needs concrete colors; SVG can keep `var()`. */
export const resolveToken: ColorResolver = token => getComputedStyle(document.documentElement).getPropertyValue(token).trim() || '#000000';

function rgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map(char => char + char).join('') : value;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

const stops: ColorToken[] = ['--bg-3', '--violet', '--blue', '--cyan'];

/** Sequential ramp shared by 2D and 3D heatmaps. t is the normalized value in [0, 1]. */
export function rampColor(t: number, resolve: ColorResolver): string {
  const clamped = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(clamped));
  const local = clamped - index;
  const a = rgb(resolve(stops[index])), b = rgb(resolve(stops[index + 1]));
  return `#${a.map((channel, i) => Math.round(channel + (b[i] - channel) * local).toString(16).padStart(2, '0')).join('')}`;
}
export const rampCss = `linear-gradient(90deg, ${stops.map(token => `var(${token})`).join(', ')})`;
