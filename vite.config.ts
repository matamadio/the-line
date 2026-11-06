import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { editorSave } from './tools/editor-save';
import { pwa } from './tools/pwa';

const page = (name: string) => fileURLToPath(new URL(`./${name}.html`, import.meta.url));

export default defineConfig({
  // Relative, so the build works under any path (GitHub Pages serves it from /the-line/).
  base: './',
  plugins: [editorSave(), pwa()],
  build: {
    rollupOptions: {
      input: { game: page('index'), lab: page('lab'), difficulty: page('difficulty') },
    },
  },
  test: { include: ['test/**/*.test.ts'] },
});
