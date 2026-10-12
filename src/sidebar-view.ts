/**
 * 左侧边栏：范围选择、掌握度仪表盘、五张图、待复习队列、笔记清单。
 */

import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type MemoryCurvePlugin from "./main";
import { fill, strings, type Strings } from "./i18n";
import { ALL_SCOPE, ROOT_SCOPE, listFolders, listNotes } from "./scanner";
import {
  BUCKET_ORDER,
  buildStats,
  dayLabel,
  dueQueue,
  localDayIndex,
  proficiency,
  summarize,
  type Bucket,
  type NoteStat,
} from "./model";
import { donutRing, folderBars, heatmap, loadBars, stackedBar, type DistributionRow, type HeatCell, type LoadRow } from "./charts";

export const VIEW_TYPE_SIDEBAR = "memory-curve-sidebar";

/** 分档对应的配色序号，与 styles.css 里的 .mc-seg-N / .mc-dot-N 对齐。 */
const BUCKET_COLOR: Record<Bucket, number> = {
  mastered: 0,
  familiar: 1,
  fuzzy: 2,
  forgetting: 3,
  baseline: 4,
  unreviewed: 5,
};

function bucketLabel(s: Strings, bucket: Bucket): string {
  switch (bucket) {
    case "mastered":
      return s.bucketMastered;
    case "familiar":
      return s.bucketFamiliar;
    case "fuzzy":
      return s.bucketFuzzy;
    case "forgetting":
      return s.bucketForgetting;
    case "baseline":
      return s.bucketBaseline;
    default:
      return s.bucketUnreviewed;
  }
}

export class MemoryCurveSidebarView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: MemoryCurvePlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_SIDEBAR;
  }

  getDisplayText(): string {
    return strings(this.plugin.settings.language).sidebarTitle;
  }

  getIcon(): string {
    return "activity";
  }

  async onOpen(): Promise<void> {
    await this.refresh();
  }

  /** 全量重绘。数据量（百篇级）不大，直接重建 DOM 最简单也最不容易错。 */
  async refresh(): Promise<void> {
    const s = strings(this.plugin.settings.language);
    const tz = this.plugin.tzOffsetMinutes;
    const now = Date.now();
    const scope = this.plugin.currentScope;

    const root = this.contentEl;
    root.empty();
    root.addClass("mc-sidebar");

    const notes = listNotes(this.app, scope);
    const records = this.plugin.store.snapshot();
    const params = this.plugin.params();
    const stats = buildStats(
      notes.map((file) => file.path),
      records,
      now,
      params,
    );
    const summary = summarize(stats);

    this.renderToolbar(root, s, scope, notes.length);
    this.renderDashboard(root, s, summary, records, now);
    this.renderCharts(root, s, stats, summary, now, tz, scope);
    this.renderQueue(root, s, stats);
    this.renderNoteList(root, s, stats, now, tz);
  }

  // ---------------------------------------------------------------- 工具条

  private renderToolbar(parent: HTMLElement, s: Strings, scope: string, noteCount: number): void {
    const bar = parent.createDiv({ cls: "mc-toolbar" });

    const select = bar.createEl("select", { cls: "dropdown mc-scope-select" });
    select.createEl("option", { text: s.scopeAll, value: ALL_SCOPE });
    select.createEl("option", { text: s.scopeRoot, value: ROOT_SCOPE });
    for (const folder of listFolders(this.app)) {
      select.createEl("option", { text: folder, value: folder });
    }
    select.value = scope;
    select.addEventListener("change", () => {
      this.plugin.setScope(select.value);
    });

    const refresh = bar.createEl("button", { cls: "mc-icon-button", attr: { "aria-label": s.refresh } });
    setIcon(refresh, "refresh-cw");
    refresh.addEventListener("click", () => {
      void this.plugin.rescan();
    });

    bar.createSpan({ cls: "mc-toolbar-count", text: fill("{n} " + s.notesCount, { n: noteCount }) });
  }

  // ------------------------------------------------------------ 掌握度面板

  private renderDashboard(
    parent: HTMLElement,
    s: Strings,
    summary: ReturnType<typeof summarize>,
    records: ReturnType<MemoryCurvePlugin["store"]["snapshot"]>,
    now: number,
  ): void {
    const section = parent.createDiv({ cls: "mc-section mc-dashboard" });
    const lines = [
      `${s.notesCount} ${summary.total}`,
      `${s.dueCount} ${summary.dueCount}`,
      `${s.baselineCount} ${summary.baselineCount}`,
      `${s.streakDays} ${this.plugin.streak(records.values(), now)}`,
    ];
    // 掌握度只看「真正复习过」的笔记：基线单独一档，不参与平均，也不随时间衰减。
    const reviewed = summary.averageReviewed;
    const chart = section.createDiv({ cls: "mc-chart-host" });
    chart.innerHTML = donutRing(reviewed ?? 0, lines, reviewed === null ? "—" : undefined);

    const footer = section.createDiv({ cls: "mc-dashboard-footer" });
    footer.createSpan({ cls: "mc-k", text: s.masteryReviewed });
    footer.createSpan({
      cls: "mc-v",
      text: reviewed === null ? s.noReviewedYet : `${Math.round(reviewed * 100)}%`,
    });
    footer.createSpan({ cls: "mc-k", text: s.bucketBaseline });
    footer.createSpan({
      cls: "mc-v",
      text: `${summary.baselineCount}`,
    });
  }

  // ------------------------------------------------------------------ 图表

  private renderCharts(
    parent: HTMLElement,
    s: Strings,
    stats: readonly NoteStat[],
    summary: ReturnType<typeof summarize>,
    now: number,
    tz: number,
    scope: string,
  ): void {
    // 熟练度分布
    const rows: DistributionRow[] = BUCKET_ORDER.map((bucket) => ({
      bucket,
      label: bucketLabel(s, bucket),
      count: summary.counts[bucket],
      colorIndex: BUCKET_COLOR[bucket],
    }));
    this.chartBlock(parent, s.distribution, (host) => {
      host.innerHTML = stackedBar(rows, summary.total);
    });

    // 复习负荷：未来 14 天
    const today = localDayIndex(now, tz);
    const buckets = new Array<number>(14).fill(0);
    for (const stat of stats) {
      if (!stat.record) continue;
      const day = Math.max(today, localDayIndex(stat.record.due, tz));
      const offset = day - today;
      if (offset >= 0 && offset < 14) buckets[offset] += 1;
    }
    const loadRows: LoadRow[] = buckets.map((count, offset) => {
      const date = new Date((today + offset) * 86_400_000);
      return {
        label: `${date.getUTCMonth() + 1}/${date.getUTCDate()}`,
        count,
        isToday: offset === 0,
      };
    });
    this.chartBlock(parent, s.loadTitle, (host) => {
      host.innerHTML = loadBars(loadRows);
    });

    // 复习日历：最近 15 周
    const weeks = 15;
    const activity = this.plugin.activity(now);
    const weekday = (today + 4) % 7; // 0 = 周日
    const gridEnd = today + (6 - weekday);
    const gridStart = gridEnd - (weeks * 7 - 1);
    const cells: HeatCell[] = [];
    for (let col = 0; col < weeks; col += 1) {
      for (let row = 0; row < 7; row += 1) {
        const day = gridStart + col * 7 + row;
        if (day > today) continue;
        cells.push({
          col,
          row,
          count: activity.get(day) ?? 0,
          label: dayLabel(day, tz),
        });
      }
    }
    this.chartBlock(parent, s.calendarTitle, (host) => {
      host.innerHTML = heatmap(cells, weeks, s.lessLabel, s.moreLabel);
      host.createDiv({
        cls: "mc-chart-caption",
        text: `${dayLabel(gridStart, tz)} → ${dayLabel(today, tz)}`,
      });
    });

    // 文件夹对比：按相对当前范围的一级文件夹分组
    const groups = new Map<string, NoteStat[]>();
    for (const stat of stats) {
      const key = relativeGroup(stat.path, scope, s.scopeRoot);
      const list = groups.get(key);
      if (list) list.push(stat);
      else groups.set(key, [stat]);
    }
    const folderRows = [...groups.entries()]
      .map(([name, list]) => {
        // 基线不算复习，也不显示会衰减的熟练度：整组都没复习过就留空。
        const reviewed = list.filter((stat) => !stat.baseline && stat.score !== null);
        const sum = reviewed.reduce((acc, stat) => acc + (stat.score ?? 0), 0);
        return {
          name: `${name} (${list.length})`,
          average: reviewed.length === 0 ? null : sum / reviewed.length,
          count: list.length,
        };
      })
      .sort((a, b) => (b.average ?? -1) - (a.average ?? -1))
      .slice(0, 8);
    this.chartBlock(parent, s.folderTitle, (host) => {
      host.innerHTML = folderBars(folderRows);
    });
  }

  private chartBlock(parent: HTMLElement, title: string, paint: (host: HTMLElement) => void): void {
    const section = parent.createDiv({ cls: "mc-section mc-chart-block" });
    section.createDiv({ cls: "mc-section-title", text: title });
    const host = section.createDiv({ cls: "mc-chart-host" });
    paint(host);
  }

  // ------------------------------------------------------------ 待复习队列

  private renderQueue(parent: HTMLElement, s: Strings, stats: readonly NoteStat[]): void {
    const section = parent.createDiv({ cls: "mc-section" });
    const header = section.createDiv({ cls: "mc-section-header" });
    header.createDiv({ cls: "mc-section-title", text: s.queueTitle });

    const start = header.createEl("button", { cls: "mc-button mc-button-cta", text: s.cmdStartReview });
    start.addEventListener("click", () => {
      void this.plugin.startReview();
    });

    section.createDiv({ cls: "mc-hint", text: s.queueHint });

    const queue = dueQueue(stats, 10);
    if (queue.length === 0) {
      section.createDiv({ cls: "mc-empty", text: s.queueEmpty });
      return;
    }

    const list = section.createDiv({ cls: "mc-queue" });
    for (const stat of queue) {
      const item = list.createDiv({ cls: "mc-queue-item" });
      item.createSpan({ cls: "mc-queue-name", text: titleOf(stat.path) });
      if (stat.baseline) item.createSpan({ cls: "mc-badge", text: s.badgeBaseline });
      item.addEventListener("click", () => {
        void this.plugin.openReview(stat.path);
      });
    }
  }

  // -------------------------------------------------------------- 笔记清单

  private renderNoteList(parent: HTMLElement, s: Strings, stats: readonly NoteStat[], now: number, tz: number): void {
    const section = parent.createDiv({ cls: "mc-section" });
    section.createDiv({ cls: "mc-section-title", text: `${s.listTitle} (${stats.length})` });

    if (stats.length === 0) {
      section.createDiv({ cls: "mc-empty", text: s.emptyScope });
      return;
    }

    const list = section.createDiv({ cls: "mc-notes" });
    for (const stat of stats) {
      const row = list.createDiv({ cls: "mc-note" });
      row.addEventListener("click", () => {
        void this.plugin.openReview(stat.path);
      });

      const head = row.createDiv({ cls: "mc-note-head" });
      head.createSpan({ cls: "mc-note-title", text: titleOf(stat.path) });
      if (stat.baseline) head.createSpan({ cls: "mc-badge", text: s.badgeBaseline });
      // 基线不显示会衰减的熟练度：它还没被真正复习过，只留一个「—」。
      const shown = stat.baseline ? null : stat.score;
      head.createSpan({
        cls: "mc-note-score",
        text: shown === null ? "—" : `${Math.round(shown * 100)}%`,
      });

      row.createDiv({ cls: "mc-note-path", text: stat.path });

      const bar = row.createDiv({ cls: "mc-note-bar" });
      const fillEl = bar.createDiv({ cls: `mc-note-bar-fill mc-seg-${BUCKET_COLOR[stat.bucket]}` });
      fillEl.style.width = `${Math.round((shown ?? 0) * 100)}%`;

      const meta = row.createDiv({ cls: "mc-note-meta" });
      meta.createSpan({ cls: `mc-dot mc-dot-${BUCKET_COLOR[stat.bucket]}`, text: bucketLabel(s, stat.bucket) });
      meta.createSpan({ text: `${s.colLast} ${lastText(stat, s, now, tz)}` });
      meta.createSpan({ text: `${s.colDue} ${dueText(stat, s, now, tz)}` });
      meta.createSpan({ text: `${s.colTimes} ${stat.record?.times ?? 0}` });
    }
  }
}

/** 文件名（去掉 .md）。 */
export function titleOf(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  return base.endsWith(".md") ? base.slice(0, -3) : base;
}

/** 相对当前范围的一级文件夹名。 */
function relativeGroup(path: string, scope: string, rootLabel: string): string {
  let relative = path;
  if (scope !== ALL_SCOPE) {
    if (path === scope) return rootLabel;
    relative = path.startsWith(`${scope}/`) ? path.slice(scope.length + 1) : path;
  }
  const index = relative.indexOf("/");
  return index === -1 ? rootLabel : relative.slice(0, index);
}

function lastText(stat: NoteStat, s: Strings, now: number, tz: number): string {
  if (!stat.record || stat.record.times === 0) return s.never;
  const days = localDayIndex(now, tz) - localDayIndex(stat.record.last, tz);
  return days <= 0 ? s.today : fill(s.daysAgo, { n: days });
}

function dueText(stat: NoteStat, s: Strings, now: number, tz: number): string {
  if (!stat.record) return s.dueNow;
  const days = localDayIndex(stat.record.due, tz) - localDayIndex(now, tz);
  return days <= 0 ? s.dueNow : fill(s.inDays, { n: days });
}

/** 供复习页复用：单篇笔记的熟练度快照。 */
export function scoreOf(stat: NoteStat): number | null {
  return stat.score;
}

/** 供复习页复用：按路径取熟练度。 */
export function proficiencyFor(
  path: string,
  plugin: MemoryCurvePlugin,
  now: number,
): number | null {
  const record = plugin.store.get(path);
  if (!record) return null;
  return proficiency(record, now, plugin.params());
}
