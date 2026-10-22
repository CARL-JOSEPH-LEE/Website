const http = require('node:http');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { securityPolicy, securityHeaders, cacheControl } = require('./build.cjs');
const project = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8' };

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
  const publicFiles = new Set((await fsp.readdir(root)).filter(name => /^(index\.html|(?:app|styles)(?:\.[a-f0-9]{12})?\.(?:js|css)|(?:[1-9]|10|11)\.mp3|LICENSE|robots\.txt|sitemap\.xml)$/.test(name)));
  for (const name of await fsp.readdir(path.join(root, 'assets'))) {
    if (/\.(webp|png)$/.test(name) || /^share-card(?:\.[a-f0-9]{12})?\.jpg$/.test(name)) publicFiles.add(`assets/${name}`);
  }
  const server = http.createServer({ headersTimeout: 10000, requestTimeout: 15000, connectionsCheckingInterval: 1000, maxHeaderSize: 8192 }, async (req, res) => {
    let handle;
    try {
      for (const [name, value] of Object.entries(securityHeaders)) res.setHeader(name, value);
      // Binding to loopback alone does not prevent DNS rebinding from a hostile
      // website. Only browser requests addressed to this local preview are valid.
      if (!/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(req.headers.host || '')) { res.writeHead(421).end(); return; }
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
      let name;
      try { name = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'; }
      catch { res.writeHead(400).end(); return; }
      if (!publicFiles.has(name)) {
        // A new build can introduce new content hashes while preview is open.
        // Refresh only narrowly allowed assets; keep exact-case validation.
        const generated = /^(?:(?:app|styles)\.[a-f0-9]{12}\.(?:js|css)|assets\/[a-z0-9.-]+\.(?:webp|png)|assets\/share-card\.[a-f0-9]{12}\.jpg)$/.test(name);
        if (generated) {
          const folder = path.dirname(path.join(root, name));
          if ((await fsp.readdir(folder)).includes(path.basename(name))) publicFiles.add(name);
        }
        if (!publicFiles.has(name)) { res.writeHead(404).end('Not found'); return; }
      }
      const original = path.join(root, name);
      // Keep the descriptor used for stat and streaming: a concurrent rebuild
      // can rename a file without changing the bytes behind an open descriptor.
      handle = await fsp.open(original, 'r');
      const originalStat = await handle.stat();
      if (!originalStat.isFile()) { res.writeHead(404).end(); return; }
      if (name.endsWith('.html')) {
        const policy = securityPolicy(await handle.readFile('utf8'));
        if (policy) res.setHeader('Content-Security-Policy', policy);
      }
      let stat = originalStat, encoding;
      if (production && !req.headers.range && /\.(html|css|js)$/.test(name)) {
        for (const candidate of encodings(req.headers['accept-encoding'])) {
          const compressed = `${original}.${candidate === 'br' ? 'br' : 'gz'}`;
          let compressedHandle;
          try {
            compressedHandle = await fsp.open(compressed, 'r');
            const compressedStat = await compressedHandle.stat();
            // A sidecar left by an interrupted or concurrent rebuild must never
            // be served as a different version of the original representation.
            if (!compressedStat.isFile() || compressedStat.mtimeMs !== originalStat.mtimeMs) continue;
            await handle.close();
            handle = compressedHandle; compressedHandle = undefined;
            stat = compressedStat; encoding = candidate;
            break;
          } catch (error) { if (error.code !== 'ENOENT') throw error; }
          finally { if (compressedHandle) await compressedHandle.close(); }
        }
      }
      const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
      const headers = {
        'Content-Type': mime[path.extname(name)] || 'text/plain; charset=utf-8',
        'Cache-Control': production ? cacheControl(name) : 'no-store',
        'Accept-Ranges': 'bytes', ETag: etag, 'Last-Modified': stat.mtime.toUTCString(),
        Vary: 'Accept-Encoding'
      };
      if (encoding) headers['Content-Encoding'] = encoding;
      const tags = req.headers['if-none-match'];
      if (tags && (tags === '*' || tags.split(',').some(tag => tag.trim().replace(/^W\//, '') === etag.replace(/^W\//, '')))) {
        res.writeHead(304, headers).end(); return;
      }
      const modifiedSince = Date.parse(req.headers['if-modified-since']);
      if (!tags && Number.isFinite(modifiedSince) && Math.floor(stat.mtimeMs / 1000) <= modifiedSince / 1000) {
        res.writeHead(304, headers).end(); return;
      }
      const ifRange = req.headers['if-range'];
      // Unlike If-Modified-Since, If-Range requires an exact date match; future
      // dates and weak ETags cannot authorize a partial representation.
      const useRange = !ifRange || ifRange === stat.mtime.toUTCString();
      const range = req.method === 'GET' && useRange ? parseRange(req.headers.range, stat.size) : null;
      if (range === false) { res.writeHead(416, { ...headers, 'Content-Range': `bytes */${stat.size}` }).end(); return; }
      if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${stat.size}`;
      headers['Content-Length'] = range ? range.end - range.start + 1 : stat.size;
      // A rapid seek/track change may abort while file I/O above is pending.
      // Do not orphan a stream by attaching it after the response has closed.
      if (res.destroyed) return;
      res.writeHead(range ? 206 : 200, headers);
      if (req.method === 'HEAD' || stat.size === 0) { res.end(); return; }
      // readFile() above advances the HTML descriptor; start must be explicit.
      const stream = handle.createReadStream({ start: range?.start ?? 0, end: range?.end });
      // Keep the FileHandle alive and explicitly close it in finally on normal
      // completion, stream errors and aborted requests alike.
      await pipeline(stream, res);
    } catch (error) {
      if (res.headersSent) res.destroy();
      else res.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
    } finally { if (handle) await handle.close().catch(() => {}); }
  });
  server.maxHeadersCount = 64;
  server.maxRequestsPerSocket = 100;
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
