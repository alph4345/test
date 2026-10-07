// Builds the claude.ai-hosted copy of n0va Books into a folder.
// The hosted page is the same app as index.html, written as the page fragment the
// Artifact publisher expects (it adds <!doctype>, <head> and <body> itself).
//
//   node bookkeeping/scripts/build-hosted.mjs <out-dir>
//
// Publish <out-dir>/index.html as the page and every other file in <out-dir> alongside it,
// with capabilities: { db: { rules: [{ path: '', read: 'admin', write: 'admin' }] }, user: {}, downloads: true }
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] || join(root, 'dist'));

const html = readFileSync(join(root, 'index.html'), 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];

// Keep the title (first, so it is found), the font links and the stylesheet.
const keep = head
  .split('\n')
  .filter((line) => /<title>|fonts\.g|href="app\.css"/.test(line))
  .join('\n');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'index.html'), keep + '\n' + body.trim() + '\n');
cpSync(join(root, 'app.css'), join(out, 'app.css'));
cpSync(join(root, 'js'), join(out, 'js'), { recursive: true });
cpSync(join(root, 'vendor'), join(out, 'vendor'), { recursive: true, filter: (src) => !src.endsWith('.md') });
console.log('Built hosted copy in ' + out);
