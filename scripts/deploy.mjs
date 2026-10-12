/**
 * 把构建产物部署进 Obsidian 笔记库的插件目录。
 *
 * 目标库（两种方式，二选一；都不给就报错退出，脚本里不带任何个人路径）：
 *   1) node scripts/deploy.mjs --vault="D:\path\to\your\vault"
 *   2) MEMORY_CURVE_VAULT="D:\path\to\your\vault" npm run deploy
 *
 * 目标目录：<库>/.obsidian/plugins/memory-curve/
 *
 * 只拷 main.js / manifest.json / styles.css 三个文件，不碰笔记、不碰 data/。
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function resolveVault() {
  const arg = process.argv.find((a) => a.startsWith("--vault="));
  if (arg) {
    return arg.slice("--vault=".length).replace(/^"(.*)"$/, "$1");
  }
  return process.env.MEMORY_CURVE_VAULT ?? null;
}

const vault = resolveVault();

if (!vault) {
  console.error(
    [
      "[deploy] 没有指定笔记库路径，请用下面任一方式：",
      '  1) node scripts/deploy.mjs --vault="D:\\path\\to\\your\\vault"',
      '  2) MEMORY_CURVE_VAULT="D:\\path\\to\\your\\vault" npm run deploy',
      '  3) 也可以把上面第 2 种方式写进 package.json 的 scripts，给自己省事。',
    ].join("\n"),
  );
  process.exit(1);
}

const vaultRoot = path.resolve(vault);
const pluginDir = path.join(vaultRoot, ".obsidian", "plugins", "memory-curve");

const files = ["main.js", "manifest.json", "styles.css"];

if (!fs.existsSync(path.join(vaultRoot, ".obsidian"))) {
  console.error(`[deploy] 这个路径不像 Obsidian 笔记库，找不到：${path.join(vaultRoot, ".obsidian")}`);
  process.exit(1);
}

fs.mkdirSync(pluginDir, { recursive: true });

for (const f of files) {
  const from = path.resolve(f);
  if (!fs.existsSync(from)) {
    console.error(`[deploy] 缺少构建产物：${from}（先跑 npm run build）`);
    process.exit(1);
  }
  fs.copyFileSync(from, path.join(pluginDir, f));
  console.log(`[deploy] ${f} -> ${path.join(pluginDir, f)}`);
}

console.log("[deploy] 完成");
