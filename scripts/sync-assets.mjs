import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const sources = await Promise.all(['src/images.ts', 'src/audioService.ts'].map(file => readFile(path.join(root, file), 'utf8')));
let urls = [...new Set(sources.join('\n').match(/https:\/\/fastly\.jsdelivr\.net\/gh\/xia-skot\/Catan_Pics\/(?:img|audio)\/[^'"\s`]+\.(?:png|jpg|mp3)/g))];
try {
  const previous = JSON.parse(await readFile(path.join(root, 'src/assetManifest.json'), 'utf8'));
  urls = [...new Set([...urls, ...previous.sources])];
} catch (error) { if (error.code !== 'ENOENT') throw error; }
if (!urls.length) throw new Error('No asset sources found');
const manifest = { version: '', images: {}, audio: {}, sources: urls };
const checksums = [];
for (const url of urls) {
  const match = url.match(/Catan_Pics\/(img|audio)\/(.+)$/);
  const [, group, name] = match;
  const targetGroup = group === 'img' ? 'images' : 'audio';
  const primary = `https://raw.githubusercontent.com/xia-skot/Catan_Pics/main/${group}/${name}`;
  let response;
  for (const candidate of [primary, url]) {
    try {
      response = await fetch(candidate, { signal: AbortSignal.timeout(20000) });
      if (response.ok) break;
    } catch {}
  }
  if (!response?.ok) throw new Error(`Cannot download ${name}`);
  const data = Buffer.from(await response.arrayBuffer());
  const hash = createHash('sha256').update(data).digest('hex').slice(0, 16);
  const target = `/assets/${targetGroup}/${hash}${path.extname(name)}`;
  await mkdir(path.join(root, 'public/assets', targetGroup), { recursive: true });
  await writeFile(path.join(root, 'public', target), data);
  manifest[targetGroup][name] = target;
  checksums.push(hash);
  console.log(`${targetGroup}: ${name} (${data.length} bytes)`);
}
manifest.version = createHash('sha256').update(checksums.sort().join('')).digest('hex').slice(0, 12);
await writeFile(path.join(root, 'src/assetManifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Saved ${urls.length} assets, version ${manifest.version}`);
