const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { promisify } = require('node:util');
const project = path.resolve(__dirname, '..');
const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);
const fingerprint = (name, data) => {
  const ext = path.extname(name);
  const hash = crypto.createHash('sha256').update(data).digest('hex').slice(0, 12);
  return `${name.slice(0, -ext.length)}.${hash}${ext}`;
};

function securityPolicy(html) {
  return /<meta\b[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"[^>]*>/i.exec(html)?.[1];
}

function refreshInlineHashes(html) {
  const policy = securityPolicy(html);
  if (!policy || !/\bscript-src\s/.test(policy)) throw new Error('index.html must define a script-src Content Security Policy.');
  const hashes = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter(([, attrs, body]) => !/\bsrc\s*=/i.test(attrs) && body.trim())
    .map(([, , body]) => `'sha256-${crypto.createHash('sha256').update(body.replace(/\r\n?/g, '\n')).digest('base64')}'`);
  const updated = policy.replace(/\bscript-src\s+([^;]*)/, (_, sources) =>
    `script-src ${[...sources.split(/\s+/).filter(source => source && !/^'sha(?:256|384|512)-/.test(source)), ...new Set(hashes)].join(' ')}`);
  return html.replace(policy, updated);
}

function validateReferences(html, css, files) {
  const published = new Set(files);
  const origin = 'https://8sora8.com';
  const check = (reference, context, dependency = true) => {
    if (!reference || reference.startsWith('#') || reference.startsWith('data:')) return;
    const url = new URL(reference.replace(/&amp;/g, '&'), `${origin}/`);
    if (url.origin !== origin) {
      if (dependency) throw new Error(`External runtime dependency in ${context}: ${reference}`);
      return;
    }
    const name = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
    if (!published.has(name)) throw new Error(`Missing or wrong-case published reference in ${context}: ${reference}`);
  };
  // Navigation/social URLs may lead elsewhere. Scripts, styles and images must
  // remain first-party so mainland visitors do not wait for a foreign CDN.
  for (const [, tag, attributes] of html.matchAll(/<([a-z][\w-]*)\b([^>]*?)>/gi)) {
    const attrs = Object.fromEntries([...attributes.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
      .map(([, name, double, single]) => [name.toLowerCase(), double ?? single]));
    const kind = tag.toLowerCase();
    if (attrs.href) check(attrs.href, `<${kind}>`, kind !== 'a' && attrs.rel !== 'canonical');
    for (const attribute of ['src', 'poster']) if (attrs[attribute]) check(attrs[attribute], `<${kind} ${attribute}>`);
    if (attrs.srcset) for (const candidate of attrs.srcset.split(',')) check(candidate.trim().split(/\s+/)[0], `<${kind} srcset>`);
    if (kind === 'meta' && /^(?:og:image|twitter:image)$/.test(attrs.property || attrs.name || '')) check(attrs.content, `<meta ${attrs.property || attrs.name}>`);
  }
  for (const [, reference] of css.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/gi)) check(reference, 'styles.css');
  for (const [, reference] of css.matchAll(/@import\s+["']([^"']+)["']/gi)) check(reference, 'styles.css @import');
}

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};

function cacheControl(name) {
  if (/\.[a-f0-9]{12}\.(?:js|css|webp|png)$/.test(name) || /^assets\/share-card\.[a-f0-9]{12}\.jpg$/.test(name)) return 'public, max-age=31536000, immutable';
  // Track URLs stay readable and can be replaced in a future deploy. A bounded
  // browser cache saves repeat cross-border transfers without pinning old audio.
  if (/\.mp3$/.test(name)) return 'public, max-age=86400, must-revalidate';
  return 'no-cache';
}

function netlifyHeaders(html, resources) {
  const block = (route, headers) => `${route}\n${Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`).join('\n')}`;
  // Exact cache rules avoid overlapping Cache-Control fields: Netlify combines
  // repeated fields instead of giving the most specific route precedence.
  const pageHeaders = { 'Cache-Control': cacheControl('index.html'), 'Content-Security-Policy': securityPolicy(html) };
  return [
    block('/*', securityHeaders),
    ...['/', '/index.html'].map(route => block(route, pageHeaders)),
    ...resources.map(name => block(`/${name}`, { 'Cache-Control': cacheControl(name) }))
  ].join('\n\n') + '\n';
}

async function build(outDir = path.join(project, 'dist')) {
  // Build tooling stays out of the browser and the dependency-free dev server.
  const { transform } = require('esbuild');
  // Overwrite only generated files. Never recursively delete a caller's directory.
  await fs.mkdir(path.join(outDir, 'assets'), { recursive: true });
  let html = (await fs.readFile(path.join(project, 'index.html'), 'utf8')).replace(/\r\n?/g, '\n');
  const previous = await fs.stat(path.join(outDir, 'index.html')).catch(error => { if (error.code !== 'ENOENT') throw error; });
  // One version stamp binds each compressed representation to its original.
  const stamp = new Date(Math.max(Date.now(), Math.ceil(previous?.mtimeMs || 0) + 1));
  const assets = (await fs.readdir(path.join(project, 'assets'))).filter(name => /\.(webp|png)$/.test(name) || name === 'share-card.jpg').sort();
  const names = new Map();
  const textFiles = new Map();
  const files = [];
  // A preview request must never observe a partially written asset or audio file.
  const publish = async (name, prepare, modified) => {
    const target = path.join(outDir, name);
    const temporary = `${target}.${crypto.randomUUID()}.tmp`;
    try {
      await prepare(temporary);
      if (modified) await fs.utimes(temporary, modified, modified);
      await fs.rename(temporary, target);
      files.push(name);
    } finally { await fs.rm(temporary, { force: true }); }
  };
  const write = (name, data, modified) => publish(name, temporary => fs.writeFile(temporary, data, { flag: 'wx' }), modified);
  for (const name of assets.map(name => `assets/${name}`)) {
    const data = await fs.readFile(path.join(project, name));
    const hashed = fingerprint(name, data);
    names.set(name, hashed);
    await write(hashed, data);
  }
  const rewriteAssets = text => { for (const [name, hashed] of names) text = text.replaceAll(name, hashed); return text; };
  for (const name of ['app.js', 'styles.css']) {
    const javascript = name.endsWith('.js');
    const source = (await fs.readFile(path.join(project, name), 'utf8')).replace(/\r\n?/g, '\n');
    const optimized = await transform(javascript ? source : rewriteAssets(source), {
      loader: javascript ? 'js' : 'css',
      charset: 'utf8',
      legalComments: 'none',
      minifyWhitespace: true,
      // Preserve CSS syntax, selector order and old-WebView fallbacks exactly.
      // JavaScript is parsed and safely lowered; no runtime library is added.
      ...(javascript ? {
        target: ['chrome80', 'edge80', 'firefox78', 'safari13.1'],
        minifyIdentifiers: true,
        minifySyntax: true,
      } : {}),
    });
    const data = Buffer.from(optimized.code);
    const hashed = fingerprint(name, data);
    names.set(name, hashed);
    await write(hashed, data, stamp);
    textFiles.set(hashed, data);
  }
  html = refreshInlineHashes(rewriteAssets(html));
  textFiles.set('index.html', Buffer.from(html));
  let rawBytes = 0, brotliBytes = 0, gzipBytes = 0;
  let pageRepresentations;
  for (const [name, data] of textFiles) {
    const [br, gz] = await Promise.all([
      brotli(data, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }),
      gzip(data, { level: 9 })
    ]);
    if (name === 'index.html') pageRepresentations = { br, gz };
    else {
      await write(`${name}.br`, br, stamp);
      await write(`${name}.gz`, gz, stamp);
    }
    rawBytes += data.length; brotliBytes += br.length; gzipBytes += gz.length;
  }
  // Keep original audio quality; audio is fetched only after a play gesture.
  for (const name of [...Array.from({ length: 11 }, (_, i) => `${i + 1}.mp3`), 'LICENSE', 'robots.txt', 'sitemap.xml']) {
    await publish(name, temporary => fs.copyFile(path.join(project, name), temporary, constants.COPYFILE_EXCL));
  }
  const css = textFiles.get(names.get('styles.css')).toString('utf8');
  validateReferences(html, css, [...files, 'index.html']);
  // Netlify Drop reads this independently of netlify.toml: uploading dist/ is
  // sufficient for both the cache policy and lightweight security headers.
  // Range and encoding headers belong to Netlify's native static file server.
  const cacheable = files.filter(name => /\.(?:js|css|webp|png|mp3|txt|xml)$/.test(name) || /^assets\/share-card\.[a-f0-9]{12}\.jpg$/.test(name));
  await write('_headers', netlifyHeaders(html, cacheable));
  // Remove stale variants before replacing mutable HTML. Until new variants are
  // published, content negotiation safely falls back to the complete raw page.
  await Promise.all(['br', 'gz'].map(extension => fs.rm(path.join(outDir, `index.html.${extension}`), { force: true })));
  await write('index.html', html, stamp);
  await write('index.html.br', pageRepresentations.br, stamp);
  await write('index.html.gz', pageRepresentations.gz, stamp);
  const result = { files: [...files].sort(), text: { rawBytes, brotliBytes, gzipBytes } };
  await publish('build-manifest.json', temporary => fs.writeFile(temporary, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' }));
  return result;
}

module.exports = { build, project, securityPolicy, securityHeaders, refreshInlineHashes, validateReferences, cacheControl, netlifyHeaders };
if (require.main === module) build().then(result => console.log(JSON.stringify(result.text))).catch(error => { console.error(error); process.exitCode = 1; });
