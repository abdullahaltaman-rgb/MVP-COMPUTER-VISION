import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: '#16294A',
        green: '#1B7A43',
        gold: '#B8934A',
        amber: '#E0982C',
        red: '#CE4A3C',
        mist: '#F0F3F7',
        'navy-800': '#1E3560',
        'navy-700': '#274176',
      },
      fontFamily: {
        kufi: ['var(--font-kufi)', 'sans-serif'],
        sans: ['var(--font-naskh)', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(22,41,74,0.08), 0 1px 2px rgba(22,41,74,0.06)',
        panel: '0 4px 24px rgba(22,41,74,0.10)',
      },
      keyframes: {
        blink: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.25' } },
        'slide-in': { from: { transform: 'translateX(-12px)', opacity: '0' }, to: { transform: 'translateX(0)', opacity: '1' } },
        pulse2: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.5' } },
      },
      animation: {
        blink: 'blink 1.2s steps(2, start) infinite',
        'slide-in': 'slide-in 0.28s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
