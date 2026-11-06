// Build only: writes the service worker that lets the installed game play offline.
// It lists every file of the build, and changes whenever any of them does, which is how
// a browser knows there is a new version to fetch.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const TEMPLATE = fileURLToPath(new URL('./sw.template.js', import.meta.url));

export function pwa(): Plugin {
  let dist = 'dist';
  return {
    name: 'the-line-pwa',
    apply: 'build',
    configResolved(config) { dist = resolve(config.root, config.build.outDir); },
    closeBundle() {
      const files = readdirSync(dist, { recursive: true, withFileTypes: true })
        .filter((f) => f.isFile() && f.name !== 'sw.js')
        .map((f) => join(f.parentPath, f.name))
        .sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f.slice(dist.length)).update(readFileSync(f));
      const urls = ['./', ...files.map((f) => './' + relative(dist, f).replaceAll('\\', '/'))];
      const sw = readFileSync(TEMPLATE, 'utf8')
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__FILES__', JSON.stringify(urls));
      writeFileSync(join(dist, 'sw.js'), sw);
    },
  };
}
