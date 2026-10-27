import { defineConfig } from 'vite';

// Production builds are served from GitHub Pages at /NotThePots/.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/NotThePots/' : '/',
  build: { chunkSizeWarningLimit: 1200 },
}));
