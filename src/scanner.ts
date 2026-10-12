/**
 * 笔记扫描与范围过滤。
 *
 * 一律走 Obsidian 原生 `vault.getMarkdownFiles()`：
 * 它已经排除了隐藏目录（含 `.obsidian`），所以统计出来的是「真正的笔记」，
 * 不会把第三方插件自己的 README / SKILL.md 当成复习对象。
 */

import { App, TFile } from "obsidian";

/** 库根目录的伪路径，作为「根目录」下拉项的值。 */
export const ROOT_SCOPE = "/";

/** 全库范围用空串表示。 */
export const ALL_SCOPE = "";

/** 列出库内全部文件夹（含子目录），按路径排序，不含根。 */
export function listFolders(app: App): string[] {
  const folders = new Set<string>();
  for (const file of app.vault.getMarkdownFiles()) {
    const parts = file.path.split("/");
    parts.pop();
    let prefix = "";
    for (const part of parts) {
      prefix = prefix ? `${prefix}/${part}` : part;
      folders.add(prefix);
    }
  }
  return [...folders].sort((a, b) => a.localeCompare(b, "zh"));
}

/** 取笔记所在的一级文件夹；根目录返回 ROOT_SCOPE。 */
export function folderOf(path: string): string {
  const index = path.indexOf("/");
  return index === -1 ? ROOT_SCOPE : path.slice(0, index);
}

/** 按范围过滤 md 笔记。scope 为空串 = 全库；ROOT_SCOPE = 仅根目录。 */
export function listNotes(app: App, scope: string): TFile[] {
  const all = app.vault.getMarkdownFiles();
  const filtered = all.filter((file) => inScope(file.path, scope));
  return filtered.sort((a, b) => a.path.localeCompare(b.path, "zh"));
}

/** 判断路径是否落在范围内。 */
export function inScope(path: string, scope: string): boolean {
  if (scope === ALL_SCOPE) return true;
  if (scope === ROOT_SCOPE) return !path.includes("/");
  return path === scope || path.startsWith(`${scope}/`);
}

/** 统计每个一级文件夹下的笔记数。 */
export function countByTopFolder(app: App): Map<string, number> {
  const counts = new Map<string, number>();
  for (const file of app.vault.getMarkdownFiles()) {
    const folder = folderOf(file.path);
    counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }
  return counts;
}
