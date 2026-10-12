/**
 * reviews.json 读写与路径迁移。
 *
 * 落盘位置：<插件目录>/data/reviews.json
 * 键是 vault 相对路径（正斜杠），与 md 一一对应。
 *
 * 写入策略：先写 .tmp 再 rename，避免 Obsidian 被杀掉时留下半个 JSON；
 * Windows 上 rename 不能覆盖已存在文件，会退化为直接写正式文件。
 * 迁移策略：靠 vault 的 rename / delete 事件跟随笔记改名、清理删除。
 */

import { App, Notice, TAbstractFile, TFile, TFolder, normalizePath } from "obsidian";
import type MemoryCurvePlugin from "./main";
import { strings } from "./i18n";
import {
  applyGrade,
  applyParams,
  createBaseline,
  normalizeRecord,
  type ModelParams,
  type ReviewRecord,
} from "./model";

/** 数据文件格式版本。 */
export const DATA_VERSION = 1;

interface StoreFile {
  version: number;
  notes: Record<string, ReviewRecord>;
}

export class ReviewStore {
  private notes = new Map<string, ReviewRecord>();

  constructor(
    private readonly app: App,
    private readonly plugin: MemoryCurvePlugin,
  ) {}

  /** 数据目录（vault 相对路径）。 */
  get dir(): string {
    const base =
      this.plugin.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}`;
    return normalizePath(`${base}/data`);
  }

  /** 数据文件路径。 */
  get filePath(): string {
    return normalizePath(`${this.dir}/reviews.json`);
  }

  /** 从磁盘读入。文件不存在或损坏都退化为空数据，不抛错。 */
  async load(): Promise<void> {
    const adapter = this.app.vault.adapter;
    this.notes.clear();
    try {
      if (!(await adapter.exists(this.filePath))) return;
      const raw = await adapter.read(this.filePath);
      const parsed = JSON.parse(raw) as Partial<StoreFile>;
      const params = this.plugin.params();
      const now = Date.now();
      for (const [path, record] of Object.entries(parsed.notes ?? {})) {
        this.notes.set(path, normalizeRecord(record, now, params));
      }
    } catch (error) {
      console.error("[记忆曲线] reviews.json 读取失败，按空数据继续", error);
      this.notes.clear();
    }
  }

  /** 当前记录表快照。 */
  snapshot(): Map<string, ReviewRecord> {
    return new Map(this.notes);
  }

  get(path: string): ReviewRecord | undefined {
    return this.notes.get(path);
  }

  size(): number {
    return this.notes.size;
  }

  /** 给还没有记录的笔记补冷启动基线，返回新增条数。 */
  ensureBaseline(paths: readonly string[], now: number): number {
    const params = this.plugin.params();
    let created = 0;
    for (const path of paths) {
      if (this.notes.has(path)) continue;
      this.notes.set(path, createBaseline(now, params));
      created += 1;
    }
    return created;
  }

  /** 清掉已经不在库里的记录（防止 delete 事件丢失）。只按全库路径判断。 */
  prune(validPaths: ReadonlySet<string>): number {
    let removed = 0;
    for (const path of [...this.notes.keys()]) {
      if (!validPaths.has(path)) {
        this.notes.delete(path);
        removed += 1;
      }
    }
    return removed;
  }

  /** 记一次手动打分。 */
  async grade(path: string, q: number, now: number): Promise<ReviewRecord> {
    const params = this.plugin.params();
    const existing = this.notes.get(path) ?? createBaseline(now, params);
    const updated = applyGrade(existing, q, now, params);
    this.notes.set(path, updated);
    await this.save();
    return updated;
  }

  /** 设置变更后按新参数重算所有记录。 */
  async applyParamsToAll(): Promise<void> {
    const params = this.plugin.params();
    for (const [path, record] of this.notes) {
      this.notes.set(path, applyParams(record, params));
    }
    await this.save();
  }

  /** 笔记（或整个文件夹）改名时迁移键。 */
  async handleRename(file: TAbstractFile, oldPath: string): Promise<void> {
    if (file instanceof TFolder) {
      const prefix = `${oldPath}/`;
      let changed = false;
      const next = new Map<string, ReviewRecord>();
      for (const [path, record] of this.notes) {
        if (path.startsWith(prefix)) {
          next.set(`${file.path}/${path.slice(prefix.length)}`, record);
          changed = true;
        } else {
          next.set(path, record);
        }
      }
      if (changed) {
        this.notes = next;
        await this.save();
      }
      return;
    }

    if (file instanceof TFile && file.extension === "md") {
      const record = this.notes.get(oldPath);
      if (!record) return;
      this.notes.delete(oldPath);
      this.notes.set(file.path, record);
      await this.save();
    }
  }

  /** 笔记（或整个文件夹）删除时清记录。 */
  async handleDelete(file: TAbstractFile): Promise<void> {
    if (file instanceof TFolder) {
      const prefix = `${file.path}/`;
      let changed = false;
      for (const path of [...this.notes.keys()]) {
        if (path.startsWith(prefix)) {
          this.notes.delete(path);
          changed = true;
        }
      }
      if (changed) await this.save();
      return;
    }

    if (this.notes.delete(file.path)) await this.save();
  }

  /**
   * 原子写盘：先写 .tmp 再替换。
   * 注意 Obsidian 的 adapter.rename 在 Windows 上会拒绝覆盖已存在的目标文件
   * （抛 "Destination file already exists!"），所以替换失败时退化为直接写正式文件。
   */
  async save(): Promise<boolean> {
    const adapter = this.app.vault.adapter;
    const payload: StoreFile = { version: DATA_VERSION, notes: Object.fromEntries(this.notes) };
    const json = JSON.stringify(payload, null, 2);
    const tmp = `${this.filePath}.tmp`;
    try {
      if (!(await adapter.exists(this.dir))) {
        await adapter.mkdir(this.dir);
      }
      await adapter.write(tmp, json);
      try {
        await adapter.rename(tmp, this.filePath);
      } catch {
        await adapter.write(this.filePath, json);
        if (await adapter.exists(tmp)) await adapter.remove(tmp);
      }
      return true;
    } catch (error) {
      console.error("[记忆曲线] reviews.json 写入失败", error);
      new Notice(strings(this.plugin.settings.language).saveFailed);
      return false;
    }
  }

  /** 往数据目录写一个辅助 JSON（自检报告等）。 */
  async writeAux(name: string, data: unknown): Promise<void> {
    const adapter = this.app.vault.adapter;
    try {
      if (!(await adapter.exists(this.dir))) {
        await adapter.mkdir(this.dir);
      }
      await adapter.write(normalizePath(`${this.dir}/${name}`), JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`[记忆曲线] ${name} 写入失败`, error);
    }
  }

  /** 当前生效的模型参数（转发给插件，避免各模块各自读设置）。 */
  params(): ModelParams {
    return this.plugin.params();
  }
}
