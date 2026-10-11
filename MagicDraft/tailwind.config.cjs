/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        bg: '#020617',
        panel: '#111827',
        accent: '#38bdf8',
        success: '#34d399',
        warn: '#fbbf24',
        danger: '#f87171'
      }
    }
  },
  plugins: []
};
