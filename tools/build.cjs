const fs = require('node:fs/promises');
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

async function build(outDir = path.join(project, 'dist')) {
  // Overwrite only generated files. Never recursively delete a caller's directory.
  await fs.mkdir(path.join(outDir, 'assets'), { recursive: true });
  let html = await fs.readFile(path.join(project, 'index.html'), 'utf8');
  const assets = (await fs.readdir(path.join(project, 'assets'))).filter(name => /\.(webp|png)$/.test(name)).sort();
  const textFiles = new Map();
  const files = [];
  const write = async (name, data) => { await fs.writeFile(path.join(outDir, name), data); files.push(name); };
  for (const name of ['app.js', 'styles.css', ...assets.map(name => `assets/${name}`)]) {
    const data = await fs.readFile(path.join(project, name));
    const hashed = fingerprint(name, data);
    html = html.replaceAll(name, hashed);
    await write(hashed, data);
    if (/\.(js|css)$/.test(name)) textFiles.set(hashed, data);
  }
  textFiles.set('index.html', Buffer.from(html));
  await write('index.html', html);
  let rawBytes = 0, brotliBytes = 0, gzipBytes = 0;
  for (const [name, data] of textFiles) {
    const br = await brotli(data, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } });
    const gz = await gzip(data, { level: 9 });
    await write(`${name}.br`, br);
    await write(`${name}.gz`, gz);
    rawBytes += data.length; brotliBytes += br.length; gzipBytes += gz.length;
  }
  // Keep original audio quality; audio is fetched only after a play gesture.
  for (const name of [...Array.from({ length: 11 }, (_, i) => `${i + 1}.mp3`), 'LICENSE']) {
    await fs.copyFile(path.join(project, name), path.join(outDir, name));
    files.push(name);
  }
  const result = { files: files.sort(), text: { rawBytes, brotliBytes, gzipBytes } };
  await fs.writeFile(path.join(outDir, 'build-manifest.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}

module.exports = { build, project };
if (require.main === module) build().then(result => console.log(JSON.stringify(result.text))).catch(error => { console.error(error); process.exitCode = 1; });
