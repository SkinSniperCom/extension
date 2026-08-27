import { runtime } from './messages';

// Firefox MV3 treats host permissions as revocable: from Firefox 127 the
// install prompt grants them, but the user can switch a site off at any time
// and hosts added by an update are never granted automatically. Without them
// the background's API calls are CORS-blocked (api.skinsniper.com allows the
// site origin only) and no content script is injected on Steam.
export function requiredOrigins(): string[] {
  const manifest = runtime.runtime.getManifest() as chrome.runtime.ManifestV3;
  const script_matches = (manifest.content_scripts ?? []).flatMap((script) => script.matches ?? []);
  return [...new Set([...(manifest.host_permissions ?? []), ...script_matches])];
}

// Chrome grants host permissions on install, so this is true there and the
// popup's banner never shows. A browser without the permissions API (or one
// that refuses the query) is treated as fine: a false alarm would be worse.
export async function hasAccess(): Promise<boolean> {
  try {
    return await runtime.permissions.contains({ origins: requiredOrigins() });
  } catch {
    return true;
  }
}
