/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // MapForge design system — dark theme
        bg: {
          base:     '#0A0A0F',  // fond principal
          surface:  '#111118',  // cards, panels
          elevated: '#1A1A24',  // dropdowns, modals
          border:   '#2A2A38',  // séparateurs
        },
        accent: {
          DEFAULT: '#FF6B35',
          hover:   '#FF8555',
          muted:   'rgba(255,107,53,0.12)',
        },
        text: {
          primary:   '#F0F0F5',
          secondary: '#8888AA',
          muted:     '#55556A',
        },
        // Heatmap (froid → chaud)
        heat: {
          cold: '#1E40AF',
          mid:  '#16A34A',
          warm: '#D97706',
          hot:  '#DC2626',
        },
        success: '#22C55E',
        warning: '#F59E0B',
        error:   '#EF4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '8px',
        lg: '12px',
        xl: '16px',
      },
      boxShadow: {
        panel: '0 4px 24px rgba(0,0,0,0.4)',
        glow:  '0 0 20px rgba(255,107,53,0.15)',
      },
    },
  },
  plugins: [],
}
