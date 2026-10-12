/**
 * 悬浮打分窗：给「当前正在读的笔记」打分，不占主区域的独立只读标签页。
 * 只写 reviews.json，笔记正文一个字都不动；关闭窗口不写任何东西。
 * 默认打完分就关窗；设置里关掉「打分后自动关闭」则改为原地换下一篇。
 */

import { Modal, Notice, TFile, type App } from "obsidian";
import { fill, strings, type Strings } from "./i18n";
import { dayLabel, localDayIndex, proficiency, successCount, type ReviewRecord } from "./model";
import { buildGradePanel } from "./grade-panel";
import type MemoryCurvePlugin from "./main";

interface ChipSpec {
  key: string;
  value: string;
}

export class MemoryCurveGradeModal extends Modal {
  constructor(
    app: App,
    private readonly plugin: MemoryCurvePlugin,
    private path: string,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("mc-modal");
    // 数字键 0–5 直接打分，不用把鼠标挪到底部。
    for (let q = 0; q <= 5; q += 1) {
      this.scope.register([], String(q), (event) => {
        event.preventDefault();
        void this.submit(q);
        return false;
      });
    }
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  // ---------------------------------------------------------------- 渲染

  private render(): void {
    const s = strings(this.plugin.settings.language);
    const root = this.contentEl;
    root.empty();
    root.addClass("mc-modal-body");
    this.titleEl.setText(s.modalTitle);

    const file = this.app.vault.getAbstractFileByPath(this.path);
    if (!(file instanceof TFile)) {
      root.createDiv({ cls: "mc-review-missing", text: s.missingNote });
      return;
    }

    const head = root.createDiv({ cls: "mc-modal-note" });
    const titleRow = head.createDiv({ cls: "mc-modal-title-row" });
    titleRow.createDiv({ cls: "mc-modal-title", text: file.basename });
    const record = this.plugin.store.get(this.path);
    if (record?.baseline) titleRow.createSpan({ cls: "mc-badge", text: s.badgeBaseline });
    head.createDiv({ cls: "mc-modal-path", text: file.path });

    this.renderChips(root, s, record);

    // 默认「打完分就关窗」：那种模式下跳过/下一篇没意义，索性不渲染。
    const stayOpen = !this.plugin.settings.closeAfterGrade;
    buildGradePanel(root, this.plugin, {
      prompt: s.reviewPrompt,
      hint: s.gradeHint,
      showSkip: stayOpen,
      showNext: stayOpen,
      skipLabel: s.skip,
      nextLabel: s.next,
      onGrade: (q) => {
        void this.submit(q);
      },
      onSkip: stayOpen ? () => this.goNext(false) : undefined,
      onNext: stayOpen ? () => this.goNext(true) : undefined,
    });
  }

  private renderChips(parent: HTMLElement, s: Strings, record: ReviewRecord | undefined): void {
    const now = Date.now();
    const tz = this.plugin.tzOffsetMinutes;
    const dayUnit = this.plugin.settings.language === "zh" ? " 天" : "d";
    const chips: ChipSpec[] = [];

    if (!record) {
      chips.push({ key: s.chipScore, value: s.never });
    } else {
      // 基线和面板一致：不显示会随时间衰减的百分比。
      const score = record.baseline
        ? "—"
        : `${Math.round((proficiency(record, now, this.plugin.params()) ?? 0) * 100)}%`;
      chips.push({ key: s.chipScore, value: score });
      chips.push({ key: s.chipStability, value: `${Math.round(record.stability * 10) / 10}${dayUnit}` });
      chips.push({ key: s.chipSuccess, value: String(successCount(record)) });
      chips.push({ key: s.chipLapse, value: String(record.lapses) });
      chips.push({ key: s.chipTimes, value: String(record.times) });
      chips.push({ key: s.chipDue, value: dayLabel(localDayIndex(record.due, tz), tz) });
    }

    const row = parent.createDiv({ cls: "mc-chips" });
    for (const chip of chips) {
      const el = row.createDiv({ cls: "mc-chip" });
      el.createSpan({ cls: "mc-chip-k", text: chip.key });
      el.createSpan({ cls: "mc-chip-v", text: chip.value });
    }
  }

  // ---------------------------------------------------------------- 动作

  private async submit(grade: number): Promise<void> {
    const s = strings(this.plugin.settings.language);
    if (!(this.app.vault.getAbstractFileByPath(this.path) instanceof TFile)) {
      new Notice(s.missingNote);
      return;
    }
    await this.plugin.store.grade(this.path, grade, Date.now());
    new Notice(fill(s.gradedToast, { q: grade }));
    this.plugin.refreshViews(false);
    if (this.plugin.settings.closeAfterGrade) {
      this.close();
      return;
    }
    this.goNext(false);
  }

  private goNext(announceEmpty: boolean): void {
    const s = strings(this.plugin.settings.language);
    const next = this.plugin.nextDue(this.path);
    if (!next) {
      if (announceEmpty) new Notice(s.noNext);
      return;
    }
    this.path = next;
    this.render();
  }
}
