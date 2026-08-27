// Bundles the extension into dist/ (Chrome) or dist-firefox/ (--firefox).
// Firefox MV3 has no service-worker backgrounds, so its manifest swaps the
// background key to an event-page script; everything else is shared.
//
// Env overrides for a dev backend: SS_API_URL, SS_SITE_URL. SS_OUTDIR
// overrides the output directory (used by scripts/package.ts).

import { cpSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { syncShared } from './scripts/sync-shared';

// Inside the monorepo this refreshes src/shared/ from common/ before bundling;
// in a standalone checkout it is a no-op and the committed copies are used.
await syncShared();

const firefox = process.argv.includes('--firefox');
const root = import.meta.dir;
const outdir = process.env.SS_OUTDIR
  ? path.resolve(process.env.SS_OUTDIR)
  : path.join(root, firefox ? 'dist-firefox' : 'dist');

const api_url = (process.env.SS_API_URL ?? 'https://api.skinsniper.com').replace(/\/$/, '');
const site_url = (process.env.SS_SITE_URL ?? 'https://skinsniper.com').replace(/\/$/, '');
const static_url = (process.env.SS_STATIC_URL ?? 'https://static.skinsniper.com').replace(/\/$/, '');

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

const result = await Bun.build({
  entrypoints: [
    path.join(root, 'src/background.ts'),
    path.join(root, 'src/market.ts'),
    path.join(root, 'src/inventory.ts'),
    path.join(root, 'src/popup.ts'),
  ],
  outdir,
  target: 'browser',
  // Content scripts are classic scripts, not modules; iife keeps them valid.
  format: 'iife',
  define: {
    __API_URL__: JSON.stringify(api_url),
    __SITE_URL__: JSON.stringify(site_url),
    __STATIC_URL__: JSON.stringify(static_url),
  },
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

const manifest = await Bun.file(path.join(root, 'manifest.json')).json();
// API host for the background fetches; site host so chrome.cookies can read the
// user's currency/language preferences off skinsniper.com.
manifest.host_permissions = [...new Set([`${new URL(api_url).origin}/*`, `${new URL(site_url).origin}/*`])];
if (firefox) {
  manifest.background = { scripts: ['background.js'] };
  manifest.browser_specific_settings = {
    gecko: {
      // Not steam@skinsniper.com: AMO keeps a deleted add-on's ID reserved
      // forever, and the first listing under that ID was deleted.
      id: 'extension@skinsniper.com',
      // 140 is where Firefox understands data_collection_permissions below, so
      // anyone who can install also gets the consent screen it declares. No
      // gecko_android key: that would opt the add-on into Firefox for Android,
      // where the Steam panel is untested.
      strict_min_version: '140.0',
      // AMO requires an explicit data-collection declaration. The only thing
      // that leaves the browser is the market name of the item read off the
      // Steam page, sent to api.skinsniper.com to look its prices up; that is
      // Mozilla's "websiteContent". No telemetry, so nothing optional.
      data_collection_permissions: { required: ['websiteContent'] },
    },
  };
}
await Bun.write(path.join(outdir, 'manifest.json'), JSON.stringify(manifest, null, 2));

for (const file of ['src/panel.css', 'src/popup.css', 'src/popup.html', 'assets/logo.svg']) {
  cpSync(path.join(root, file), path.join(outdir, path.basename(file)));
}
cpSync(path.join(root, 'icons'), path.join(outdir, 'icons'), { recursive: true });
cpSync(path.join(root, '_locales'), path.join(outdir, '_locales'), { recursive: true });
// Browser locale fallback strips the region (pt-PT -> pt -> default_locale),
// so region-free aliases catch e.g. pt-PT and zh-TW browsers, the same way
// skinsniper.com serves one pt/zh to everyone. Build-time copies, not source.
for (const [alias, source] of [['pt', 'pt_BR'], ['zh', 'zh_CN']] as const) {
  cpSync(path.join(root, '_locales', source), path.join(outdir, '_locales', alias), { recursive: true });
}

console.log(`Built ${firefox ? 'Firefox' : 'Chrome'} extension -> ${outdir} (api: ${api_url}, site: ${site_url})`);
