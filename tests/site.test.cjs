const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { build, project, validateReferences } = require('../tools/build.cjs');
const { startServer } = require('../tools/serve.cjs');
const get = (origin, resource, options = {}) => new Promise((resolve, reject) => {
  const req = http.request(new URL(resource, origin), options, res => {
    const chunks = [];
    res.on('data', chunk => chunks.push(chunk));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data: Buffer.concat(chunks) }));
  });
  req.on('error', reject); req.end();
});

test('Published assets, compression, caching and audio streaming', async t => {
  const outDir = path.join(project, 'test-results/build');
  const manifest = await build(outDir);
  const { server, origin } = await startServer({ root: outDir, production: true });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const html = await fs.readFile(path.join(outDir, 'index.html'), 'utf8');
  await t.test('Every local HTML reference exists with exact filename case', async () => {
    const refs = [...html.matchAll(/(?:src|href)="([^"#]+)"|url\('([^']+)'\)/g)].map(match => match[1] || match[2]);
    for (const ref of refs.filter(ref => !/^https?:/.test(ref))) {
      assert(manifest.files.includes(ref), `Missing published reference: ${ref}`);
      assert.equal((await get(origin, ref)).status, 200);
    }
    assert.equal(manifest.files.filter(file => file.endsWith('.mp3')).length, 11);
    assert.equal(manifest.files.filter(file => /\.(jpg|cjs)$/.test(file) && !/^assets\/share-card\.[a-f0-9]{12}\.jpg$/.test(file)).length, 0);
    assert(!/<audio[^>]*\ssrc=/.test(html));
    const shareImages = manifest.files.filter(file => /^assets\/share-card\.[a-f0-9]{12}\.jpg$/.test(file));
    const imageFiles = manifest.files.filter(file => /\.(webp|png)$/.test(file));
    let bytes = 0;
    for (const file of imageFiles) bytes += (await fs.stat(path.join(outDir, file))).size;
    assert(bytes < 30000, `Image budget exceeded: ${bytes}`);
    // Social crawlers fetch the large card; browsers do not request OG images
    // during page rendering, so it has a separate size allowance.
    assert.equal(shareImages.length, 1);
    for (const file of shareImages) {
      assert((await fs.stat(path.join(outDir, file))).size <= 200000, `Share image budget exceeded: ${file}`);
      const image = await get(origin, file);
      assert.equal(image.status, 200);
      assert.equal(image.headers['content-type'], 'image/jpeg');
    }
    // The avatar moved from an HTML style attribute to CSS for strict CSP.
    // Its published CSS URL must follow the image's content hash as well.
    const css = await fs.readFile(path.join(outDir, manifest.files.find(file => file.endsWith('.css'))), 'utf8');
    for (const [, ref] of css.matchAll(/url\(['"]?(assets\/[^)'"\s]+)['"]?\)/g)) {
      assert(manifest.files.includes(ref), `Missing CSS asset: ${ref}`);
      assert(/\.[a-f0-9]{12}\./.test(ref), `Unversioned CSS asset: ${ref}`);
      assert.equal((await get(origin, ref)).status, 200);
    }
    assert.throws(() => validateReferences('<img src="assets/Avatar.webp">', '', ['assets/avatar.webp']), /wrong-case/);
    assert.throws(() => validateReferences('<script src="https://cdn.example.com/app.js"></script>', '', []), /External runtime dependency/);
    assert.throws(() => validateReferences('', '@import "https://cdn.example.com/font.css";', []), /External runtime dependency/);
    const robots = await get(origin, 'robots.txt');
    const sitemap = await get(origin, 'sitemap.xml');
    assert.equal(robots.status, 200);
    assert.equal(sitemap.status, 200);
    assert.match(robots.headers['content-type'], /^text\/plain/);
    assert.match(sitemap.headers['content-type'], /^application\/xml/);
    assert.match(robots.data.toString(), /Sitemap: https:\/\/8sora8\.com\/sitemap\.xml/);
    assert.deepEqual([...sitemap.data.toString().matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]), ['https://8sora8.com/']);
  });
  await t.test('Published CSP permits interactions while rejecting injected scripts and plug-ins', async () => {
    const page = await get(origin, '/');
    const policy = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
    assert.equal(page.headers['content-security-policy'], policy);
    assert.equal(page.headers['x-content-type-options'], 'nosniff');
    assert.equal(page.headers['referrer-policy'], 'strict-origin-when-cross-origin');
    assert.equal(page.headers['permissions-policy'], undefined);
    assert(!/unsafe-inline|unsafe-eval/.test(/(?:^|;)\s*script-src\s+([^;]+)/.exec(policy)[1]));
    assert(policy.includes("default-src 'self'"));
    assert(policy.includes("object-src 'none'"));
    assert(policy.includes("base-uri 'self'"));
    assert(policy.includes("form-action 'self'"));
    for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (/\bsrc=/.test(attrs) || !body.trim()) continue;
      const hash = crypto.createHash('sha256').update(body.replace(/\r\n?/g, '\n')).digest('base64');
      assert(policy.includes(`'sha256-${hash}'`));
    }
    assert((await fs.readFile(path.join(outDir, '_headers'), 'utf8')).includes(`Content-Security-Policy: ${policy}`));
  });
  await t.test('Netlify Drop receives complete cache rules without conflicting wildcard directives', async () => {
    const published = await fs.readFile(path.join(outDir, '_headers'), 'utf8');
    const rules = new Map(published.trim().split(/\r?\n\s*\r?\n/).map(block => {
      const [route, ...lines] = block.split(/\r?\n/);
      const headers = Object.fromEntries(lines.map(line => {
        const separator = line.indexOf(':');
        return [line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim()];
      }));
      return [route, headers];
    }));
    assert.equal(rules.get('/*')['cache-control'], undefined);
    assert.equal(rules.get('/')['cache-control'], 'no-cache');
    assert.equal(rules.get('/index.html')['cache-control'], 'no-cache');
    for (const name of manifest.files.filter(name => /\.(js|css|webp|png)$/.test(name) || /^assets\/share-card\.[a-f0-9]{12}\.jpg$/.test(name))) {
      assert.equal(rules.get(`/${name}`)?.['cache-control'], 'public, max-age=31536000, immutable', name);
    }
    for (let track = 1; track <= 11; track++) {
      assert.equal(rules.get(`/${track}.mp3`)?.['cache-control'], 'public, max-age=86400, must-revalidate');
    }
    for (const name of ['robots.txt', 'sitemap.xml']) assert.equal(rules.get(`/${name}`)?.['cache-control'], 'no-cache');
    // Netlify owns transport negotiation; hand-written values here can break
    // seeking or serve compressed bytes with incorrect representation metadata.
    assert(!/^\s+(?:Accept-Ranges|Content-Range|Content-Encoding|Content-Length):/im.test(published));
    assert(!/Cross-Origin-(?:Opener|Embedder)-Policy|X-Frame-Options|Permissions-Policy/i.test(published));
  });
  await t.test('Brotli/gzip decode exactly and content negotiation respects q=0', async () => {
    for (const file of manifest.files.filter(file => /\.(html|css|js)$/.test(file))) {
      const original = await fs.readFile(path.join(outDir, file));
      const br = await get(origin, file, { headers: { 'Accept-Encoding': 'br, gzip' } });
      assert.equal(br.headers['content-encoding'], 'br');
      assert.deepEqual(zlib.brotliDecompressSync(br.data), original);
      const gz = await get(origin, file, { headers: { 'Accept-Encoding': 'br;q=0, gzip;q=1' } });
      assert.equal(gz.headers['content-encoding'], 'gzip');
      assert.deepEqual(zlib.gunzipSync(gz.data), original);
      const raw = await get(origin, file, { headers: { 'Accept-Encoding': 'br;q=0, gzip;q=0' } });
      assert.equal(raw.headers['content-encoding'], undefined);
      assert.deepEqual(raw.data, original);
    }
    // Includes seeking, playlist, volume, Media Session, accessible controls and
    // audio-reactive effects. No third-party build or runtime bundle is needed.
    const transferBudget = 28 * 1024;
    assert(manifest.text.brotliBytes < transferBudget, `Brotli text budget exceeded: ${manifest.text.brotliBytes} / ${transferBudget} bytes`);
  });
  await t.test('Hashed assets are immutable; HTML revalidates with ETag', async () => {
    const page = await get(origin, '/');
    assert.equal(page.headers['cache-control'], 'no-cache');
    const cached = await get(origin, '/', { headers: { 'If-None-Match': page.headers.etag } });
    assert.equal(cached.status, 304); assert.equal(cached.data.length, 0);
    const css = manifest.files.find(file => file.endsWith('.css'));
    assert((await get(origin, css)).headers['cache-control'].includes('immutable'));
    const dateCached = await get(origin, '/', { headers: { 'If-Modified-Since': page.headers['last-modified'] } });
    assert.equal(dateCached.status, 304);
    const precedence = await get(origin, '/', { headers: { 'If-None-Match': '"outdated"', 'If-Modified-Since': page.headers['last-modified'] } });
    assert.equal(precedence.status, 200);
  });
  await t.test('An outdated precompressed variant falls back to complete original content', async () => {
    const name = manifest.files.find(file => file.endsWith('.js'));
    const original = await fs.readFile(path.join(outDir, name));
    const stat = await fs.stat(path.join(outDir, name));
    const stale = new Date(stat.mtimeMs - 2000);
    await fs.utimes(path.join(outDir, `${name}.br`), stale, stale);
    const response = await get(origin, name, { headers: { 'Accept-Encoding': 'br' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers['content-encoding'], undefined);
    assert.deepEqual(response.data, original);
    await fs.utimes(path.join(outDir, `${name}.br`), stat.mtime, stat.mtime);
  });
  await t.test('New build hashes are served without restarting preview', async () => {
    const source = Buffer.from('/* rebuild fixture */');
    const hash = require('node:crypto').createHash('sha256').update(source).digest('hex').slice(0, 12);
    const name = `app.${hash}.js`;
    await fs.writeFile(path.join(outDir, name), source);
    const response = await get(origin, name);
    assert.equal(response.status, 200);
    assert.deepEqual(response.data, source);
    assert.equal((await get(origin, name.toUpperCase())).status, 404);
  });
  await t.test('Audio byte ranges, suffixes, invalid ranges, HEAD and If-Range', async () => {
    const audio = await fs.readFile(path.join(outDir, '1.mp3'));
    for (const [header, start, end] of [['bytes=0-127', 0, 127], ['bytes=-128', audio.length - 128, audio.length - 1], [`bytes=${audio.length - 128}-`, audio.length - 128, audio.length - 1]]) {
      const response = await get(origin, '1.mp3', { headers: { Range: header } });
      assert.equal(response.status, 206);
      assert.equal(response.headers['content-range'], `bytes ${start}-${end}/${audio.length}`);
      assert.deepEqual(response.data, audio.subarray(start, end + 1));
    }
    for (const range of [`bytes=${audio.length}-`, 'bytes=99-20', 'bytes=-0']) {
      const response = await get(origin, '1.mp3', { headers: { Range: range } });
      assert.equal(response.status, 416);
      assert.equal(response.headers['content-range'], `bytes */${audio.length}`);
    }
    const head = await get(origin, '1.mp3', { method: 'HEAD', headers: { Range: 'bytes=0-9' } });
    assert.equal(head.status, 200); assert.equal(head.data.length, 0);
    assert.equal(Number(head.headers['content-length']), audio.length);
    assert.equal(head.headers['cache-control'], 'public, max-age=86400, must-revalidate');
    assert.equal(head.headers['content-encoding'], undefined);
    const stale = await get(origin, '1.mp3', { headers: { Range: 'bytes=0-9', 'If-Range': 'Thu, 01 Jan 1970 00:00:00 GMT' } });
    assert.equal(stale.status, 200); assert.equal(stale.data.length, audio.length);
    const current = await get(origin, '1.mp3', { headers: { Range: 'bytes=0-9', 'If-Range': head.headers['last-modified'] } });
    assert.equal(current.status, 206); assert.deepEqual(current.data, audio.subarray(0, 10));
    const future = await get(origin, '1.mp3', { headers: { Range: 'bytes=0-9', 'If-Range': 'Thu, 01 Jan 2099 00:00:00 GMT' } });
    assert.equal(future.status, 200); assert.equal(future.data.length, audio.length);
  });
  await t.test('Tooling, dotfiles, wrong-case and traversal paths are not public', async () => {
    for (const file of ['package.json', '.git/config', 'tools/serve.cjs', 'APP.js', 'assets/../package.json', '%2e%2e%2findex.html', '%5c..%5cindex.html']) {
      assert.equal((await get(origin, file)).status, 404, file);
    }
    assert.equal((await get(origin, '/', { method: 'POST' })).status, 405);
    assert.equal((await get(origin, '/', { headers: { Host: 'attacker.example' } })).status, 421);
  });
});
