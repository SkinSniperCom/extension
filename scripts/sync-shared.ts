// Copies the shared source files from the SkinSniper monorepo's common/ into
// src/shared/, prepending a generated-file header. In a standalone checkout of
// this repo the monorepo is absent and the committed copies are used as-is.
//
// Run directly (bun run sync-shared) or via build.ts, which invokes it on every
// build inside the monorepo so the copies cannot drift.

import { existsSync } from 'node:fs';
import path from 'node:path';

const SHARED_FILES = ['currency.ts', 'extension.ts'];

const root = path.join(import.meta.dir, '..');
const common_dir = path.join(root, '..', 'common');
const shared_dir = path.join(root, 'src', 'shared');

export async function syncShared(): Promise<void> {
  // Marker-file check: a sibling dir merely named common/ must not trigger a sync.
  if (!existsSync(path.join(common_dir, 'extension.ts'))) return;
  for (const name of SHARED_FILES) {
    const source = await Bun.file(path.join(common_dir, name)).text();
    const header = `// Synced verbatim from the SkinSniper monorepo (common/${name}) by\n`
      + '// scripts/sync-shared.ts - edit the original there, not this copy.\n\n';
    const target = path.join(shared_dir, name);
    const next = header + source;
    const current = existsSync(target) ? await Bun.file(target).text() : null;
    if (current !== next) {
      await Bun.write(target, next);
      console.log(`sync-shared: updated src/shared/${name}`);
    }
  }
}

if (import.meta.main) await syncShared();
