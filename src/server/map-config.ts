import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

export function publicMapConfig() {
  let local: Record<string, string | undefined> = {};
  for (const path of ['.env', '.env.local']) {
    try {
      local = { ...local, ...parseEnv(readFileSync(path, 'utf8')) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  const token =
    process.env.VITE_MAPBOX_ACCESS_TOKEN ??
    local.VITE_MAPBOX_ACCESS_TOKEN ??
    '';
  return {
    mapboxAccessToken: token.startsWith('pk.') ? token : '',
    mapboxStyleUrl:
      process.env.VITE_MAPBOX_STYLE_URL ?? local.VITE_MAPBOX_STYLE_URL ?? '',
  };
}
