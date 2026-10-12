/**
 * 记忆曲线：本地间隔重复复习插件。
 * 数据只落在插件目录的 data/reviews.json，绝不改笔记内容、不写 frontmatter。
 */

import { Notice, Plugin, TFile, TFolder, type TAbstractFile, type WorkspaceLeaf } from "obsidian";
import { fill, strings } from "./i18n";
import { ALL_SCOPE, listNotes } from "./scanner";
import { ReviewStore } from "./store";
import { DEFAULT_SETTINGS, MemoryCurveSettingTab, type MemoryCurveSettings } from "./settings";
import { MemoryCurveSidebarView, VIEW_TYPE_SIDEBAR } from "./sidebar-view";
import { MemoryCurveReviewView, VIEW_TYPE_REVIEW } from "./review-view";
import { MemoryCurveGradeModal } from "./grade-modal";
import {
  activityByDay,
  buildStats,
  dueQueue,
  reviewStreak,
  type ModelParams,
  type NoteStat,
  type ReviewRecord,
} from "./model";

export default class MemoryCurvePlugin extends Plugin {
  settings: MemoryCurveSettings = { ...DEFAULT_SETTINGS };
  store!: ReviewStore;
  /** 面板当前选中的范围（运行期状态，不落盘；默认值来自设置）。 */
  currentScope: string = ALL_SCOPE;

  private scanTimer: number | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.currentScope = this.settings.defaultScope;

    this.store = new ReviewStore(this.app, this);
    await this.store.load();

    this.registerView(VIEW_TYPE_SIDEBAR, (leaf) => new MemoryCurveSidebarView(leaf, this));
    this.registerView(VIEW_TYPE_REVIEW, (leaf) => new MemoryCurveReviewView(leaf, this));

    const t = strings(this.settings.language);
    this.addRibbonIcon("activity", t.ribbonTooltip, () => {
      void this.activateSidebar();
    });

    this.addCommand({
      id: "open-panel",
      name: t.cmdOpenSidebar,
      callback: () => {
        void this.activateSidebar();
      },
    });

    this.addCommand({
      id: "start-review",
      name: t.cmdStartReview,
      callback: () => {
        void this.startReview();
      },
    });

    this.addCommand({
      id: "grade-current",
      name: t.cmdGradeCurrent,
      // 默认快捷键 Ctrl/Cmd+Shift+G，可在「设置 → 快捷键」里改；左栏不放按钮。
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "G" }],
      callback: () => {
        void this.gradeCurrentNote();
      },
    });

    this.addSettingTab(new MemoryCurveSettingTab(this.app, this));

    this.registerEvent(
      this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
        void this.onRename(file, oldPath);
      }),
    );
    this.registerEvent(
      this.app.vault.on("delete", (file: TAbstractFile) => {
        void this.onDelete(file);
      }),
    );
    this.registerEvent(
      this.app.vault.on("create", (file: TAbstractFile) => {
        if (file instanceof TFile && file.extension === "md") this.scheduleScan();
      }),
    );

    // 到期判定随时间推移而变，定时轻量重绘面板（不动复习页正文）。
    this.registerInterval(window.setInterval(() => this.refreshViews(false), 15 * 60 * 1000));

    this.app.workspace.onLayoutReady(() => {
      void this.bootstrap();
    });
  }

  onunload(): void {
    if (this.scanTimer !== null) window.clearTimeout(this.scanTimer);
  }

  private async bootstrap(): Promise<void> {
    await this.rescan(false);
    await this.activateSidebar();
  }

  // ------------------------------------------------------------ 参数与查询

  /** 本机时区相对 UTC 的分钟偏移（东经为正），用于把时间戳归到「本地自然日」。 */
  get tzOffsetMinutes(): number {
    return -new Date().getTimezoneOffset();
  }

  params(): ModelParams {
    return {
      initialStability: this.settings.initialStability,
      retentionThreshold: this.settings.retentionThreshold,
    };
  }

  streak(records: Iterable<ReviewRecord>, now: number): number {
    return reviewStreak(records, now, this.tzOffsetMinutes);
  }

  activity(_now: number): Map<number, number> {
    return activityByDay(this.store.snapshot().values(), this.tzOffsetMinutes);
  }

  /** 待复习队列使用的范围：开启「只复习当前文件夹」时跟随面板，否则按全库挑最该复习的。 */
  private queueScope(): string {
    return this.settings.onlyCurrentFolder ? this.currentScope : ALL_SCOPE;
  }

  statsFor(scope: string, now: number = Date.now()): NoteStat[] {
    const paths = listNotes(this.app, scope).map((file) => file.path);
    return buildStats(paths, this.store.snapshot(), now, this.params());
  }

  /** 下一篇待复习笔记的路径（可排除当前这篇）。 */
  nextDue(exclude?: string): string | null {
    const queue = dueQueue(this.statsFor(this.queueScope()), 20);
    for (const stat of queue) {
      if (stat.path !== exclude) return stat.path;
    }
    return null;
  }

  // ---------------------------------------------------------------- 视图

  async activateSidebar(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_SIDEBAR);
    if (existing.length === 0) {
      const leaf = this.app.workspace.getLeftLeaf(false);
      if (!leaf) return;
      await leaf.setViewState({ type: VIEW_TYPE_SIDEBAR, active: true });
    }
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_SIDEBAR);
    if (leaves.length > 0) this.app.workspace.revealLeaf(leaves[0]);
  }

  /** 在主区域打开（或复用）复习标签页。 */
  async openReview(path: string, reuse?: WorkspaceLeaf): Promise<void> {
    let leaf: WorkspaceLeaf | null = reuse ?? null;
    if (!leaf) {
      const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_REVIEW);
      leaf = existing.length > 0 ? existing[0] : this.app.workspace.getLeaf("tab");
    }
    await leaf.setViewState({ type: VIEW_TYPE_REVIEW, active: true, state: { path } });
    this.app.workspace.revealLeaf(leaf);
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
  }

  async startReview(): Promise<void> {
    const next = this.nextDue();
    if (!next) {
      new Notice(strings(this.settings.language).queueEmpty);
      return;
    }
    await this.openReview(next);
  }

  /**
   * 悬浮打分窗：优先给「当前打开的笔记」打分（读着笔记顺手评），
   * 没有可评的当前笔记时退到最该复习的一篇。只写 reviews.json。
   */
  async gradeCurrentNote(path?: string): Promise<void> {
    const s = strings(this.settings.language);
    let target = path ?? "";
    if (!target) {
      const active = this.app.workspace.getActiveFile();
      const hidden = active ? active.path.split("/").some((seg) => seg.startsWith(".")) : true;
      if (active && active.extension === "md" && !hidden) target = active.path;
    }
    if (!target) target = this.nextDue() ?? "";
    if (!target) {
      new Notice(s.queueEmpty);
      return;
    }
    if (this.store.ensureBaseline([target], Date.now()) > 0) await this.store.save();
    new MemoryCurveGradeModal(this.app, this, target).open();
  }

  setScope(scope: string): void {
    this.currentScope = scope;
    this.refreshViews(true);
  }

  /** 重绘所有面板；force=true 时连复习页信息行一起刷新。 */
  refreshViews(force: boolean): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_SIDEBAR)) {
      const view = leaf.view;
      if (view instanceof MemoryCurveSidebarView) void view.refresh();
    }
    if (force) {
      for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_REVIEW)) {
        const view = leaf.view;
        if (view instanceof MemoryCurveReviewView) view.refresh();
      }
    }
  }

  // ------------------------------------------------------------ 数据维护

  /** 全库扫描：补基线、清失效记录、写盘、重绘。 */
  async rescan(announce = true): Promise<number> {
    const paths = this.app.vault.getMarkdownFiles().map((file) => file.path);
    const now = Date.now();
    this.store.ensureBaseline(paths, now);
    this.store.prune(new Set(paths));
    await this.store.save();
    this.refreshViews(true);
    if (announce) {
      new Notice(fill(strings(this.settings.language).rescanDone, { n: paths.length }));
    }
    return paths.length;
  }

  private scheduleScan(): void {
    if (this.scanTimer !== null) window.clearTimeout(this.scanTimer);
    this.scanTimer = window.setTimeout(() => {
      this.scanTimer = null;
      void this.rescan(false);
    }, 1500);
  }

  private async onRename(file: TAbstractFile, oldPath: string): Promise<void> {
    await this.store.handleRename(file, oldPath);
    if (file instanceof TFolder || (file instanceof TFile && file.extension === "md")) {
      this.refreshViews(true);
    }
  }

  private async onDelete(file: TAbstractFile): Promise<void> {
    await this.store.handleDelete(file);
    if (file instanceof TFolder || (file instanceof TFile && file.extension === "md")) {
      this.refreshViews(true);
    }
  }

  /** 设置变更后按新参数重算全部记录。 */
  async recalculate(): Promise<void> {
    await this.store.applyParamsToAll();
    this.refreshViews(true);
  }

  // ---------------------------------------------------------------- 设置

  async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as Partial<MemoryCurveSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.refreshViews(true);
  }
}
