import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#f0f3f8',
          100: '#d9e0ed',
          200: '#b3c2db',
          300: '#8da3c9',
          400: '#6785b7',
          500: '#4166a5',
          600: '#2d4f8a',
          700: '#1e3a6e',
          800: '#162a52',
          900: '#0F1C2E',
          950: '#080e17',
        },
        amber: {
          50: '#fdf8f0',
          100: '#faecd7',
          200: '#f5d9af',
          300: '#efc087',
          400: '#e8a75f',
          500: '#D4943C',
          600: '#b87a2e',
          700: '#9a6222',
          800: '#7c4d18',
          900: '#5e3a10',
        },
      },
      fontFamily: {
        serif: ['DM Serif Display', 'Georgia', 'serif'],
        sans: ['Outfit', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
}
export default config
