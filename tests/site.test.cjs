const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const { build, project } = require('../tools/build.cjs');
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
    assert.equal(manifest.files.filter(file => /\.(jpg|cjs)$/.test(file)).length, 0);
    assert(!/<audio[^>]*\ssrc=/.test(html));
    const imageFiles = manifest.files.filter(file => /\.(webp|png)$/.test(file));
    let bytes = 0;
    for (const file of imageFiles) bytes += (await fs.stat(path.join(outDir, file))).size;
    assert(bytes < 30000, `Image budget exceeded: ${bytes}`);
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
    assert(manifest.text.brotliBytes < 16384); // Includes the audio-reactive canvas; no runtime bundles.
  });
  await t.test('Hashed assets are immutable; HTML revalidates with ETag', async () => {
    const page = await get(origin, '/');
    assert.equal(page.headers['cache-control'], 'no-cache');
    const cached = await get(origin, '/', { headers: { 'If-None-Match': page.headers.etag } });
    assert.equal(cached.status, 304); assert.equal(cached.data.length, 0);
    const css = manifest.files.find(file => file.endsWith('.css'));
    assert((await get(origin, css)).headers['cache-control'].includes('immutable'));
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
    const stale = await get(origin, '1.mp3', { headers: { Range: 'bytes=0-9', 'If-Range': 'Thu, 01 Jan 1970 00:00:00 GMT' } });
    assert.equal(stale.status, 200); assert.equal(stale.data.length, audio.length);
  });
  await t.test('Tooling, dotfiles, wrong-case and traversal paths are not public', async () => {
    for (const file of ['package.json', '.git/config', 'tools/serve.cjs', 'APP.js', 'assets/../package.json', '%2e%2e%2findex.html', '%5c..%5cindex.html']) {
      assert.equal((await get(origin, file)).status, 404, file);
    }
    assert.equal((await get(origin, '/', { method: 'POST' })).status, 405);
  });
});
