/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Space Grotesk', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        accent: '#00ffff',
        danger: '#ff5555',
        panel: 'rgba(20, 20, 20, 0.6)',
        border: 'rgba(255, 255, 255, 0.1)'
      }
    },
  },
  plugins: [],
}
