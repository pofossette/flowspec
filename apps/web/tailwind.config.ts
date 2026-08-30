import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        panel: {
          bg: 'var(--panel-bg)',
          surface: 'var(--panel-surface)',
          elevated: 'var(--panel-elevated)',
          line: 'var(--panel-line)',
          text: 'var(--panel-text)',
          muted: 'var(--panel-muted)',
          accent: 'var(--panel-accent)',
          accentStrong: 'var(--panel-accent-strong)',
          accentContrast: 'var(--panel-accent-contrast)',
        },
      },
    },
  },
  plugins: [],
};

export default config;
