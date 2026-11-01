import type { Config } from 'tailwindcss';
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: { colors: { canvas: 'var(--bg-0)', panel: 'var(--bg-1)', cyan: 'var(--cyan)' } } },
  plugins: [],
} satisfies Config;
