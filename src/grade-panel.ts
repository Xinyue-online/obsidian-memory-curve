/**
 * 打分面板：复习标签页的页脚与悬浮打分窗共用同一套 0–5 打分 UI。
 * 6 个档位按「越熟练越绿」的色阶排开，键盘 0–5 也能打分。
 */

import { strings, type Strings } from "./i18n";
import type MemoryCurvePlugin from "./main";

export interface GradePanelOptions {
  /** 面板标题，例如「这篇记得怎么样？」 */
  prompt: string;
  /** 标题右侧的小字提示，例如「键盘 0–5 直接打分」 */
  hint?: string;
  /** 左下角说明文字 */
  note?: string;
  showSkip?: boolean;
  showNext?: boolean;
  skipLabel?: string;
  nextLabel?: string;
  onGrade(grade: number): void;
  onSkip?(): void;
  onNext?(): void;
}

/** 取某个分数档的中文/英文短标签。 */
export function gradeLabelOf(s: Strings, q: number): string {
  const table = [s.grade0, s.grade1, s.grade2, s.grade3, s.grade4, s.grade5];
  return table[q] ?? String(q);
}

/** 渲染打分面板，返回面板根节点。 */
export function buildGradePanel(
  parent: HTMLElement,
  plugin: MemoryCurvePlugin,
  opts: GradePanelOptions,
): HTMLElement {
  const s = strings(plugin.settings.language);
  const card = parent.createDiv({ cls: "mc-grade-card" });

  const head = card.createDiv({ cls: "mc-grade-head" });
  head.createDiv({ cls: "mc-grade-prompt", text: opts.prompt });
  if (opts.hint) head.createDiv({ cls: "mc-grade-hint", text: opts.hint });

  const grid = card.createDiv({ cls: "mc-grade-grid" });
  for (let q = 0; q <= 5; q += 1) {
    const label = gradeLabelOf(s, q);
    const tile = grid.createEl("button", {
      cls: `mc-grade-tile mc-grade-tile-${q}`,
      attr: { type: "button", "aria-label": `${q} ${label}` },
    });
    tile.createSpan({ cls: "mc-grade-num", text: String(q) });
    tile.createSpan({ cls: "mc-grade-label", text: label });
    tile.addEventListener("click", () => opts.onGrade(q));
  }

  // 说明文字与「跳过 / 下一篇」都可有可无；一个都没有时整行不渲染，免得留块空白。
  const hasActions =
    Boolean(opts.note) || Boolean(opts.showSkip && opts.onSkip) || Boolean(opts.showNext && opts.onNext);
  if (hasActions) {
    const actions = card.createDiv({ cls: "mc-grade-actions" });
    if (opts.note) actions.createDiv({ cls: "mc-grade-note", text: opts.note });
    actions.createDiv({ cls: "mc-grade-spacer" });

    if (opts.showSkip && opts.onSkip) {
      const skip = actions.createEl("button", {
        cls: "mc-button mc-button-ghost",
        text: opts.skipLabel ?? s.skip,
      });
      skip.addEventListener("click", () => opts.onSkip?.());
    }
    if (opts.showNext && opts.onNext) {
      const next = actions.createEl("button", {
        cls: "mc-button mc-button-secondary",
        text: opts.nextLabel ?? s.next,
      });
      next.addEventListener("click", () => opts.onNext?.());
    }
  }

  return card;
}
