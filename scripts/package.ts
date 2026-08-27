// Builds store-ready zips for both browsers into release/. Each build runs
// with the SS_* dev overrides stripped from the environment, goes to a temp
// dir (dist/ and dist-firefox/ are left alone), and is verified to point at
// the production API before zipping.

import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { zipSync, type Zippable } from 'fflate';

const root = path.join(import.meta.dir, '..');
const release_dir = path.join(root, 'release');

const env = { ...process.env };
delete env.SS_API_URL;
delete env.SS_SITE_URL;
delete env.SS_STATIC_URL;

function listFiles(dir: string, prefix = ''): { abs: string, key: string }[] {
  const out: { abs: string, key: string }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    // Zip entry names always use forward slashes, whatever the build OS.
    const key = prefix + entry.name;
    if (entry.isDirectory()) out.push(...listFiles(abs, `${key}/`));
    else out.push({ abs, key });
  }
  return out;
}

const { version } = await Bun.file(path.join(root, 'manifest.json')).json() as { version: string };
mkdirSync(release_dir, { recursive: true });

for (const target of ['chrome', 'firefox'] as const) {
  const outdir = path.join(release_dir, `build-${target}`);
  const build = Bun.spawnSync(['bun', 'build.ts', ...(target === 'firefox' ? ['--firefox'] : [])], {
    cwd: root,
    env: { ...env, SS_OUTDIR: outdir },
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (!build.success) process.exit(build.exitCode || 1);

  const manifest = await Bun.file(path.join(outdir, 'manifest.json')).json() as { host_permissions?: string[] };
  if (!manifest.host_permissions?.includes('https://api.skinsniper.com/*')) {
    console.error(`package: ${target} build does not point at production, refusing to zip`
      + ` (host_permissions: ${JSON.stringify(manifest.host_permissions)})`);
    process.exit(1);
  }

  const files: Zippable = {};
  for (const { abs, key } of listFiles(outdir)) {
    files[key] = new Uint8Array(await Bun.file(abs).arrayBuffer());
  }
  const zip_path = path.join(release_dir, `skinsniper-steam-extension-${version}-${target}.zip`);
  await Bun.write(zip_path, zipSync(files, { level: 9 }));
  rmSync(outdir, { recursive: true, force: true });
  console.log(`Packaged release/${path.basename(zip_path)} (${Object.keys(files).length} files)`);
}
