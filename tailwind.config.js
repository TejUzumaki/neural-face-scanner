/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'monospace',
        ],
      },
      colors: {
        accent: '#8cff6a',
        violet: '#9b7cff',
      },
      boxShadow: {
        glass: '0 24px 80px rgba(0,0,0,.42)',
      },
    },
  },
  plugins: [],
}
