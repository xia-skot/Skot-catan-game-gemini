import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const origin = new URL(process.argv[2] || 'https://catan-game02.onrender.com');
const manifest = JSON.parse(await readFile(new URL('src/assetManifest.json', root), 'utf8'));
const paths = [...new Set([...Object.values(manifest.images), ...Object.values(manifest.audio)])];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { checkedAt: new Date().toISOString(), origin: origin.origin, shell: null, assets: [] };

async function check(path, compare = false) {
  const start = performance.now();
  try {
    const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(25000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    const result = { path, status: response.status, type: response.headers.get('content-type'), bytes: bytes.length,
      milliseconds: Math.round(performance.now() - start), cache: response.headers.get('cache-control') };
    if (compare) result.matchesLocal = hash(bytes) === hash(await readFile(new URL(`public${path}`, root)));
    return { result, text: bytes.toString('utf8') };
  } catch (error) {
    return { result: { path, error: error.message, milliseconds: Math.round(performance.now() - start) }, text: '' };
  }
}

const shell = await check('/');
report.shell = shell.result;
report.bundles = [];
const bundles = [...new Set(shell.text.match(/\/assets\/[^"'\s<>]+\.(?:js|css)/g) || [])];
for (const path of bundles) {
  const asset = await check(path);
  report.bundles.push(asset.result);
  if (path.endsWith('.js')) {
    for (const child of new Set(asset.text.match(/App-[\w-]+\.js/g) || [])) {
      report.bundles.push((await check(`/assets/${child}`)).result);
    }
  }
}
let cursor = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (cursor < paths.length) {
    const { result } = await check(paths[cursor++], true);
    report.assets.push(result);
    console.log(JSON.stringify(result));
  }
}));
const failures = report.assets.filter(asset => asset.status !== 200 || !asset.matchesLocal);
await writeFile(new URL('DEPLOYMENT-ASSET-CHECK.json', root), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ shell: report.shell, bundles: report.bundles, checked: paths.length,
  failures: failures.length, maxMilliseconds: Math.max(...report.assets.map(asset => asset.milliseconds)),
  report: fileURLToPath(new URL('DEPLOYMENT-ASSET-CHECK.json', root)) }));
if (failures.length || report.shell.status !== 200 || report.bundles.some(asset => asset.status !== 200)) process.exitCode = 1;
