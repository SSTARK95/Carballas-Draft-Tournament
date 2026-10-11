import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

const isGithubPages = !!process.env.GITHUB_ACTIONS;

export default defineConfig({
  plugins: [
    sveltekit(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Magic Draft Manager',
        short_name: 'Magic Draft',
        description: 'Gestor de torneos de draft para Magic: The Gathering.',
        theme_color: '#0f172a',
        background_color: '#020617',
        display: 'standalone',
        start_url: isGithubPages ? '/draft-magic/' : '/',
        scope: isGithubPages ? '/draft-magic/' : '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts']
  }
});
