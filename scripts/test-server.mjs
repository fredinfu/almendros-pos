import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, relative as pathRelative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve('dist/almendros-pos/browser'),
  mount = process.env.TEST_SUBPATH ?? '/';
let version = 0;
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
// Local isolated acceptance server; never included in the Pages artifact.
http
  .createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname === '/__test_update' && req.method === 'POST') {
        version++;
        res.end('updated');
        return;
      }
      if (!pathname.startsWith(mount)) {
        res.writeHead(404);
        res.end();
        return;
      }
      const relative = decodeURIComponent(pathname.slice(mount.length)) || 'index.html';
      const file = resolve(root, relative);
      if (pathRelative(root, file).startsWith('..') || isAbsolute(pathRelative(root, file))) {
        res.writeHead(403);
        res.end();
        return;
      }
      let data = await readFile(file);
      if (version && relative === 'index.html')
        data = Buffer.from(data.toString() + `\n<!-- acceptance-update-${version} -->`);
      if (version && relative === 'ngsw.json') {
        const m = JSON.parse(data);
        const index = Buffer.from(
          (await readFile(resolve(root, 'index.html'), 'utf8')) +
            `\n<!-- acceptance-update-${version} -->`,
        );
        m.hashTable[m.index] = createHash('sha1').update(index).digest('hex');
        m.timestamp += version;
        data = Buffer.from(JSON.stringify(m));
      }
      res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end();
    }
  })
  .listen(4173);
