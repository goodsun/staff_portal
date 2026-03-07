import { Express, Router } from 'express';
import fs from 'fs';
import path from 'path';

export interface PluginMeta {
  name: string;
  icon: string;
  desc: string;
  layer: 'core' | 'standard' | 'custom';
  url: string;
}

export interface LaboPlugin {
  meta: PluginMeta;
  router: Router;
}

export const registry: PluginMeta[] = [];

export function loadPlugins(app: Express, pluginsDir: string): void {
  if (!fs.existsSync(pluginsDir)) return;

  const entries = fs.readdirSync(pluginsDir).sort();
  for (const name of entries) {
    const pluginPath = path.join(pluginsDir, name);
    const indexFile = path.join(pluginPath, 'index.ts');
    if (!fs.statSync(pluginPath).isDirectory() || !fs.existsSync(indexFile)) continue;

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(pluginPath) as LaboPlugin;
      if (!mod.router || !mod.meta) {
        console.log(`  [plugin] ${name} ⚠️  (missing router or meta)`);
        continue;
      }
      app.use(mod.meta.url, mod.router);
      registry.push(mod.meta);
      console.log(`  [plugin] ${name} ✅  ${mod.meta.url}`);
    } catch (e) {
      console.log(`  [plugin] ${name} ❌ `, (e as Error).message);
    }
  }
}
