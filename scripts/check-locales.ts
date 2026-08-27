// Validates _locales/ against the en catalog: every locale must parse, carry
// exactly the en key set, keep placeholder blocks and $TOKEN$ references, and
// respect the Chrome Web Store limits (name 45 chars, description 132). Also
// checks code<->catalog parity: every en key must be referenced from src/ or
// the manifest, since t() falls back to the raw key and a typo on either side
// would render silently.
// Run: bun scripts/check-locales.ts

import { readdirSync } from 'node:fs';
import path from 'node:path';

type Placeholder = { content: string, example?: string };
type Message = { message: string, description?: string, placeholders?: Record<string, Placeholder> };
type Catalog = Record<string, Message>;

const LIMITS: Record<string, number> = { ext_name: 45, ext_description: 132 };

const locales_dir = path.join(import.meta.dir, '..', '_locales');
const en = await Bun.file(path.join(locales_dir, 'en', 'messages.json')).json() as Catalog;
const en_keys = Object.keys(en).sort();

let error_count = 0;
function fail(locale: string, message: string): void {
  error_count++;
  console.error(`${locale}: ${message}`);
}

function tokensOf(msg: Message): string[] {
  return Object.keys(msg.placeholders ?? {}).map((name) => `$${name.toUpperCase()}$`);
}

for (const locale of readdirSync(locales_dir).sort()) {
  const errors_before = error_count;
  let catalog: Catalog;
  try {
    catalog = await Bun.file(path.join(locales_dir, locale, 'messages.json')).json() as Catalog;
  } catch (error) {
    fail(locale, `messages.json does not parse: ${String(error)}`);
    continue;
  }

  const keys = Object.keys(catalog).sort();
  for (const key of en_keys.filter((k) => !keys.includes(k))) fail(locale, `missing key ${key}`);
  for (const key of keys.filter((k) => !en_keys.includes(k))) fail(locale, `unknown key ${key}`);

  for (const key of keys) {
    const msg = catalog[key];
    const source = en[key];
    if (!msg || !source) continue;
    if (typeof msg.message !== 'string' || !msg.message.trim()) {
      fail(locale, `${key}: empty message`);
      continue;
    }
    const limit = LIMITS[key];
    if (limit && [...msg.message].length > limit) {
      fail(locale, `${key}: ${[...msg.message].length} chars, limit ${limit}: ${msg.message}`);
    }
    for (const [name, src_ph] of Object.entries(source.placeholders ?? {})) {
      const own = msg.placeholders?.[name];
      if (!own) fail(locale, `${key}: placeholders.${name} block missing`);
      else if (own.content !== src_ph.content) {
        fail(locale, `${key}: placeholders.${name}.content is ${own.content}, en has ${src_ph.content}`);
      }
    }
    for (const token of tokensOf(source)) {
      if (!msg.message.toUpperCase().includes(token)) fail(locale, `${key}: ${token} missing from message`);
    }
  }
  if (error_count === errors_before) console.log(`${locale}: ok (${keys.length} keys)`);
}

const root = path.join(import.meta.dir, '..');
let haystack = await Bun.file(path.join(root, 'manifest.json')).text();
for (const file of new Bun.Glob('src/**/*.{ts,html}').scanSync({ cwd: root })) {
  haystack += await Bun.file(path.join(root, file)).text();
}
for (const key of en_keys) {
  if (!haystack.includes(`'${key}'`) && !haystack.includes(`"${key}"`) && !haystack.includes(`__MSG_${key}__`)) {
    fail('en', `key ${key} is not referenced anywhere in src/ or manifest.json`);
  }
}

if (error_count) process.exit(1);
console.log('All locales pass.');
