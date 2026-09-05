const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const project = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.mp3': 'audio/mpeg' };

function parseRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value || '');
  // A server may ignore unsupported/malformed ranges, including multipart ranges.
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return false;
  return { start, end };
}

function encodings(header = '') {
  const entries = header.toLowerCase().split(',').map(part => {
    const [name, ...params] = part.trim().split(';');
    const q = params.find(param => param.trim().startsWith('q='));
    return [name, q ? Number(q.trim().slice(2)) : 1];
  });
  const accepted = new Map(entries);
  return ['br', 'gzip'].map(name => [name, accepted.get(name) ?? accepted.get('*') ?? 0])
    .filter(([, q]) => q > 0 && q <= 1).sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

async function startServer({ root = project, port = 0, production = false } = {}) {
  root = path.resolve(root);
  // Explicit public-file inventory also checks exact case on Windows.
  const publicFiles = new Set((await fsp.readdir(root)).filter(name => /^(index\.html|(?:app|styles)(?:\.[a-f0-9]{12})?\.(?:js|css)|(?:[1-9]|10|11)\.mp3|LICENSE)$/.test(name)));
  for (const name of await fsp.readdir(path.join(root, 'assets'))) {
    if (/\.(webp|png)$/.test(name)) publicFiles.add(`assets/${name}`);
  }
  const server = http.createServer(async (req, res) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
      let name;
      try { name = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'; }
      catch { res.writeHead(400).end(); return; }
      if (!publicFiles.has(name)) {
        // A new build can introduce new content hashes while preview is open.
        // Refresh only narrowly allowed assets; keep exact-case validation.
        const generated = /^(?:(?:app|styles)\.[a-f0-9]{12}\.(?:js|css)|assets\/[a-z0-9.-]+\.(?:webp|png))$/.test(name);
        if (generated) {
          const folder = path.dirname(path.join(root, name));
          if ((await fsp.readdir(folder)).includes(path.basename(name))) publicFiles.add(name);
        }
        if (!publicFiles.has(name)) { res.writeHead(404).end('Not found'); return; }
      }
      const original = path.join(root, name);
      let file = original, encoding;
      if (production && !req.headers.range && /\.(html|css|js)$/.test(name)) {
        for (const candidate of encodings(req.headers['accept-encoding'])) {
          const compressed = `${original}.${candidate === 'br' ? 'br' : 'gz'}`;
          try { await fsp.access(compressed); file = compressed; encoding = candidate; break; } catch {}
        }
      }
      const stat = await fsp.stat(file);
      const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
      const headers = {
        'Content-Type': mime[path.extname(name)] || 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': production ? (/\.[a-f0-9]{12}\./.test(name) ? 'public, max-age=31536000, immutable' : 'no-cache') : 'no-store',
        'Accept-Ranges': 'bytes', ETag: etag, 'Last-Modified': stat.mtime.toUTCString(),
        Vary: 'Accept-Encoding'
      };
      if (encoding) headers['Content-Encoding'] = encoding;
      const tags = req.headers['if-none-match'];
      if (tags && (tags === '*' || tags.split(',').some(tag => tag.trim().replace(/^W\//, '') === etag.replace(/^W\//, '')))) {
        res.writeHead(304, headers).end(); return;
      }
      const ifRange = req.headers['if-range'];
      // Weak ETags cannot validate If-Range; an unchanged Last-Modified date can.
      const useRange = !ifRange || (Number.isFinite(Date.parse(ifRange)) && Math.floor(stat.mtimeMs / 1000) <= Date.parse(ifRange) / 1000);
      const range = req.method === 'GET' && useRange ? parseRange(req.headers.range, stat.size) : null;
      if (range === false) { res.writeHead(416, { ...headers, 'Content-Range': `bytes */${stat.size}` }).end(); return; }
      if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${stat.size}`;
      headers['Content-Length'] = range ? range.end - range.start + 1 : stat.size;
      res.writeHead(range ? 206 : 200, headers);
      if (req.method === 'HEAD' || stat.size === 0) { res.end(); return; }
      const stream = fs.createReadStream(file, range || undefined);
      res.on('close', () => stream.destroy());
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    } catch (error) {
      if (res.headersSent) res.destroy();
      else res.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

module.exports = { startServer, parseRange, encodings };
if (require.main === module) {
  const production = process.argv.includes('--dist');
  startServer({ root: production ? path.join(project, 'dist') : project, port: Number(process.env.PORT || 4173), production })
    .then(({ origin }) => console.log(`Preview: ${origin}`))
    .catch(error => { console.error(error); process.exitCode = 1; });
}
