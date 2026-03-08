"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registry = void 0;
exports.loadPlugins = loadPlugins;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
exports.registry = [];
function loadPlugins(app, pluginsDir) {
    if (!fs_1.default.existsSync(pluginsDir))
        return;
    const entries = fs_1.default.readdirSync(pluginsDir).sort();
    for (const name of entries) {
        const pluginPath = path_1.default.join(pluginsDir, name);
        const indexFileTs = path_1.default.join(pluginPath, 'index.ts');
        const indexFileJs = path_1.default.join(pluginPath, 'index.js');
        if (!fs_1.default.statSync(pluginPath).isDirectory() || (!fs_1.default.existsSync(indexFileTs) && !fs_1.default.existsSync(indexFileJs)))
            continue;
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const mod = require(pluginPath);
            if (!mod.router || !mod.meta) {
                console.log(`  [plugin] ${name} ⚠️  (missing router or meta)`);
                continue;
            }
            app.use(mod.meta.url, mod.router);
            exports.registry.push(mod.meta);
            console.log(`  [plugin] ${name} ✅  ${mod.meta.url}`);
        }
        catch (e) {
            console.log(`  [plugin] ${name} ❌ `, e.message);
        }
    }
}
