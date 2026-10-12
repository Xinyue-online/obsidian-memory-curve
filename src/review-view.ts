/**
 * 复习标签页：主区域专用视图，只读渲染笔记 + 底部手动打分。
 * 明确不做：编辑、写 frontmatter、pop-out。关闭标签页不写任何东西。
 */

import { Component, ItemView, MarkdownRenderer, Notice, TFile, WorkspaceLeaf, type ViewStateResult } from "obsidian";
import type MemoryCurvePlugin from "./main";
import { fill, strings } from "./i18n";
import { buildGradePanel } from "./grade-panel";
import { dayLabel, localDayIndex, proficiency, successCount } from "./model";
import { titleOf } from "./sidebar-view";

export const VIEW_TYPE_REVIEW = "memory-curve-review";

interface ReviewViewState {
  path: string;
}

export class MemoryCurveReviewView extends ItemView {
  private path = "";
  private infoEl: HTMLElement | null = null;
  private mdComponent: Component | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: MemoryCurvePlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_REVIEW;
  }

  getDisplayText(): string {
    return this.path ? titleOf(this.path) : strings(this.plugin.settings.language).reviewTitle;
  }

  getIcon(): string {
    return "book-open";
  }

  getState(): Record<string, unknown> {
    return { path: this.path };
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    if (state && typeof state === "object" && "path" in state) {
      this.path = String((state as ReviewViewState).path ?? "");
    }
    await super.setState(state, result);
    await this.renderAll();
  }

  async onOpen(): Promise<void> {
    // 数字键 0–5 直接打分，阅读时不用移开手。
    for (let q = 0; q <= 5; q += 1) {
      this.scope?.register([], String(q), (event) => {
        event.preventDefault();
        void this.submit(q);
        return false;
      });
    }
    await this.renderAll();
  }

  /** 轻量刷新（打分后、参数变更后）：只更新信息行，不重排正文，避免打断阅读位置。 */
  refresh(): void {
    this.renderInfo();
  }

  // ---------------------------------------------------------------- 渲染

  private async renderAll(): Promise<void> {
    const s = strings(this.plugin.settings.language);
    const root = this.contentEl;
    root.empty();
    root.addClass("mc-review");

    if (!this.path) {
      root.createDiv({ cls: "mc-review-missing", text: s.missingNote });
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(this.path);
    if (!(file instanceof TFile)) {
      root.createDiv({ cls: "mc-review-missing", text: s.missingNote });
      return;
    }

    const header = root.createDiv({ cls: "mc-review-header" });
    header.createDiv({ cls: "mc-review-title", text: file.basename });
    header.createDiv({ cls: "mc-review-path", text: file.path });
    this.infoEl = header.createDiv({ cls: "mc-review-info" });
    this.renderInfo();

    const body = root.createDiv({ cls: "mc-review-body markdown-rendered" });
    const content = await this.app.vault.cachedRead(file);
    if (this.mdComponent) this.removeChild(this.mdComponent);
    const comp = new Component();
    this.addChild(comp);
    this.mdComponent = comp;
    await MarkdownRenderer.render(this.app, content, body, file.path, comp);

    const footer = root.createDiv({ cls: "mc-review-footer" });
    buildGradePanel(footer, this.plugin, {
      prompt: s.reviewPrompt,
      hint: s.gradeHint,
      note: s.reviewReadonly,
      showSkip: true,
      showNext: true,
      skipLabel: s.skip,
      nextLabel: s.next,
      onGrade: (q) => {
        void this.submit(q);
      },
      onSkip: () => {
        void this.goNext(false);
      },
      onNext: () => {
        void this.goNext(true);
      },
    });
  }

  private renderInfo(): void {
    const el = this.infoEl;
    if (!el) return;
    const s = strings(this.plugin.settings.language);
    const tz = this.plugin.tzOffsetMinutes;
    const now = Date.now();
    const record = this.plugin.store.get(this.path);
    el.empty();

    if (!record) {
      el.createSpan({ cls: "mc-badge", text: s.badgeBaseline });
      el.createSpan({ text: s.never });
      return;
    }

    if (record.baseline) el.createSpan({ cls: "mc-badge", text: s.badgeBaseline });
    el.createSpan({
      cls: "mc-v",
      text: record.baseline ? "—" : `${Math.round((proficiency(record, now, this.plugin.params()) ?? 0) * 100)}%`,
    });
    el.createSpan({
      text: fill(s.reviewInfo, {
        s: Math.round(record.stability * 10) / 10,
        n: successCount(record),
        l: record.lapses,
        d: dayLabel(localDayIndex(record.due, tz), tz),
      }),
    });
  }

  // ---------------------------------------------------------------- 动作

  private async submit(q: number): Promise<void> {
    const s = strings(this.plugin.settings.language);
    if (!this.app.vault.getAbstractFileByPath(this.path)) {
      new Notice(s.missingNote);
      return;
    }
    await this.plugin.store.grade(this.path, q, Date.now());
    new Notice(fill(s.gradedToast, { q }));
    this.plugin.refreshViews(false);
    await this.goNext(false);
  }

  private async goNext(announceEmpty: boolean): Promise<void> {
    const s = strings(this.plugin.settings.language);
    const next = this.plugin.nextDue(this.path);
    if (!next) {
      if (announceEmpty) new Notice(s.noNext);
      return;
    }
    await this.plugin.openReview(next, this.leaf);
  }
}
