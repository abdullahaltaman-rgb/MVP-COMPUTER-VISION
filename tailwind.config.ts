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
        // ── هوية التصاميم المعتمدة (design/) — الأخضر السعودي ──
        saudi: {
          DEFAULT: '#165D3A',
          deep: '#0E3D26',
          darkest: '#0B3320',
          light: '#1B6B44',
          bright: '#1E7248',
        },
        ink: {
          DEFAULT: '#0F2942',
          muted: '#38505F',
          soft: '#5B6B78',
          faint: '#8A99A5',
        },
        canvas: '#F4F7F5',
        line: '#E3EBE5',
        sand: '#F3E7CC',
        ok: '#1B7A4A',
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
        'om-in': { from: { opacity: '0', transform: 'translateY(-6px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        blink: 'blink 1.2s steps(2, start) infinite',
        'slide-in': 'slide-in 0.28s ease-out',
        'om-in': 'om-in 0.45s ease',
      },
    },
  },
  plugins: [],
};

export default config;
