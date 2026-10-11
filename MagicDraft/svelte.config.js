import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const isGithubPages = !!process.env.GITHUB_ACTIONS;

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: '404.html'
    }),
    paths: {
      base: isGithubPages ? '/draft-magic' : ''
    },
    prerender: {
      entries: ['*']
    }
  }
};

export default config;
