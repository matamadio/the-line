// Dev server only: lets the editors write their data files, so "Save" in the browser
// shows up as a normal file change in git. Production builds have no such endpoints,
// and the editors fall back to copying the JSON to the clipboard.

import { writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const dataFile = (name: string) => fileURLToPath(new URL(`../src/data/${name}`, import.meta.url));

/** Pairs of numbers on one line, so the file stays readable and diffs stay small. */
function formatAnim(data: unknown) {
  return JSON.stringify(data, null, 2)
    .replace(/\[\s+(-?[\d.e-]+),\s+(-?[\d.e-]+)\s+\]/g, '[$1, $2]')
    .replace(/"(snawave)": \[([^\]]*)\]/g, (_m, k: string, v: string) => `"${k}": [${v.split(',').map((x) => x.trim()).join(', ')}]`) + '\n';
}

/** Number lists on one line: a point, an eye, a short outline. */
function formatBoss(data: { shapes?: unknown; powers?: unknown }) {
  if (typeof data !== 'object' || !data || typeof data.shapes !== 'object' || typeof data.powers !== 'object') throw new Error('shapes and powers');
  return JSON.stringify(data, null, 2).replace(/\[\s+(-?[\d.e-]+(?:,\s+-?[\d.e-]+)*)\s+\]/g, (_m, v: string) => `[${v.split(',').map((x) => x.trim()).join(', ')}]`) + '\n';
}

function formatDifficulty(data: Record<string, unknown>) {
  if (Object.values(data).some((v) => typeof v !== 'number')) throw new Error('numbers only');
  return JSON.stringify(data, null, 2) + '\n';
}

/** Only pages served by this dev server may write, not another site open in the same browser. */
function sameOrigin(req: IncomingMessage) {
  const origin = req.headers.origin;
  return !origin || new URL(origin).host === req.headers.host;
}

function saveTo(file: string, format: (data: never) => string) {
  return (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
    if (!sameOrigin(req)) { res.statusCode = 403; res.end(); return; }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        writeFileSync(dataFile(file), format(JSON.parse(body) as never));
        res.end('saved');
      } catch (e) {
        res.statusCode = 400;
        res.end(String(e));
      }
    });
  };
}

export const editorSave = (): Plugin => ({
  name: 'editor-save',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__anim', saveTo('anim.json', formatAnim));
    server.middlewares.use('/__boss', saveTo('boss.json', formatBoss));
    server.middlewares.use('/__difficulty', saveTo('difficulty.json', formatDifficulty));
  },
});
