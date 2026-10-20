// prerender.mjs — Snapshot each route after `vite build` so crawlers get real HTML.
// Every route gets its own title, meta description, canonical, and rendered body
// (H1, copy, links) instead of the shared SPA shell pointing at the homepage.
// Output: dist/index.html for "/", dist/<route>/index.html for the rest.

import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { homedir } from 'node:os';

const DIST = new URL('../dist/', import.meta.url).pathname;
const ORIGIN = 'https://gifteddreamers.org';

// Per-route title/description (shared with App.tsx). Keep descriptions under 155 chars.
const ROUTES = JSON.parse(await readFile(new URL('../lib/route-meta.json', import.meta.url), 'utf8'));

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.xml': 'application/xml',
};

// Minimal static server with SPA fallback, serving the pristine shell
const shell = await readFile(join(DIST, 'index.html'), 'utf8');
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(DIST, path);
  try {
    if ((await stat(file)).isFile()) {
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      return res.end(await readFile(file));
    }
  } catch {}
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(shell);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const candidates = [
    join(homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
    join(homedir(), '.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell'),
  ];
  return candidates.find(existsSync);
}

const escapeAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function setHead(html, route, { title, description }) {
  const url = route === '/' ? `${ORIGIN}/` : `${ORIGIN}${route}`;
  const t = escapeAttr(title);
  const d = escapeAttr(description);
  const rules = [
    [/<title>[^<]*<\/title>/, `<title>${t}</title>`],
    [/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${d}" />`],
    [/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${url}" />`],
    [/<meta property="og:url" content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${url}" />`],
    [/<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${t}" />`],
    [/<meta property="og:description" content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${d}" />`],
    [/<meta name="twitter:title" content="[^"]*"\s*\/?>/, `<meta name="twitter:title" content="${t}" />`],
    [/<meta name="twitter:description" content="[^"]*"\s*\/?>/, `<meta name="twitter:description" content="${d}" />`],
  ];
  for (const [re, rep] of rules) {
    if (!re.test(html)) throw new Error(`${route}: head tag not found for ${re}`);
    html = html.replace(re, rep);
  }
  return html;
}

const browser = await chromium.launch({ executablePath: findChromium() });
const page = await browser.newPage();
let failed = false;

for (const [route, meta] of Object.entries(ROUTES)) {
  await page.goto(base + route, { waitUntil: 'networkidle' });
  await page.waitForSelector('main h1', { timeout: 15000 });
  // Capture only the rendered app body; head comes from the pristine shell so
  // runtime-injected tags (preloads, third-party scripts) don't get baked in.
  const rootHtml = await page.evaluate(() => {
    const root = document.getElementById('root').cloneNode(true);
    // Drop the cookie banner (fixed bottom bar) — it depends on per-visitor consent
    root.querySelectorAll('.fixed.bottom-0').forEach((el) => el.remove());
    return root.innerHTML;
  });

  const ROOT_RE = /(<div id="root"[^>]*>)\s*(?:<!--[^]*?-->\s*)?<\/div>/;
  if (!ROOT_RE.test(shell)) throw new Error('could not find empty <div id="root"> in shell');
  let html = shell.replace(ROOT_RE, (_, open) => `${open}${rootHtml}</div>`);
  html = setHead(html, route, meta);

  const out = route === '/' ? join(DIST, 'index.html') : join(DIST, route.slice(1), 'index.html');
  await mkdir(join(out, '..'), { recursive: true });
  await writeFile(out, html);

  const h1 = (rootHtml.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) failed = true;
  console.log(`${h1 === 1 ? '✓' : '✗'} ${route.padEnd(20)} h1=${h1} desc=${meta.description.length}`);
}

await browser.close();
server.close();
if (failed) {
  console.error('prerender: some routes did not have exactly one <h1>');
  process.exit(1);
}
