/**
 * 五张手写 SVG 图表。零依赖：不引 d3 / chart.js，避免打包体积与 CSP 麻烦。
 *
 * 每个函数都只返回 SVG 字符串，颜色与字号全部走 styles.css 里的 CSS 类，
 * 所以深浅色主题切换不需要重画。
 */

import type { Bucket } from "./model";

/** 转义进 SVG 文本的字符串。 */
export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** 环形仪表：当前范围的掌握度（只看真正复习过的笔记）。centerText 可覆盖中心的百分比文字。 */
export function donutRing(value: number, lines: readonly string[], centerText?: string): string {
  const pct = Math.round(clamp01(value) * 100);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const filled = clamp01(value) * circumference;
  const caption = lines
    .map((line, index) => `<text class="mc-chart-note" x="116" y="${40 + index * 15}">${escapeXml(line)}</text>`)
    .join("\n  ");

  return `<svg class="mc-chart mc-chart-donut" viewBox="0 0 240 116" preserveAspectRatio="xMidYMid meet" role="img">
  <g transform="translate(58,58)">
    <circle class="mc-ring-track" r="${radius}" cx="0" cy="0" fill="none" stroke-width="12" />
    <circle class="mc-ring-value" r="${radius}" cx="0" cy="0" fill="none" stroke-width="12"
      stroke-dasharray="${filled.toFixed(2)} ${(circumference - filled).toFixed(2)}"
      stroke-linecap="butt" transform="rotate(-90)" />
    <text class="mc-ring-pct" x="0" y="5" text-anchor="middle">${centerText === undefined ? `${pct}%` : escapeXml(centerText)}</text>
  </g>
  ${caption}
</svg>`;
}

export interface DistributionRow {
  bucket: Bucket;
  label: string;
  count: number;
  colorIndex: number;
}

/** 堆叠横条：熟练 / 熟悉 / 模糊 / 遗忘中 / 基线 / 未复习 各占多少篇。 */
export function stackedBar(rows: readonly DistributionRow[], total: number): string {
  const width = 256;
  const height = 96;
  const sum = Math.max(1, total);
  let x = 0;
  const segments: string[] = [];
  for (const row of rows) {
    if (row.count <= 0) continue;
    const segmentWidth = (row.count / sum) * width;
    segments.push(
      `<rect class="mc-seg mc-seg-${row.colorIndex}" x="${x.toFixed(2)}" y="8" width="${segmentWidth.toFixed(2)}" height="18" />`,
    );
    x += segmentWidth;
  }
  if (segments.length === 0) {
    segments.push(`<rect class="mc-seg mc-seg-empty" x="0" y="8" width="${width}" height="18" />`);
  }

  const legend = rows
    .map((row, index) => {
      const column = index % 2;
      const line = Math.floor(index / 2);
      const lx = column === 0 ? 2 : 130;
      const ly = 48 + line * 18;
      return `<g class="mc-legend-item">
    <rect class="mc-seg mc-seg-${row.colorIndex}" x="${lx}" y="${ly - 9}" width="9" height="9" />
    <text class="mc-chart-label" x="${lx + 13}" y="${ly}">${escapeXml(row.label)} ${row.count}</text>
  </g>`;
    })
    .join("\n  ");

  return `<svg class="mc-chart mc-chart-stack" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img">
  <g>${segments.join("")}</g>
  ${legend}
</svg>`;
}

export interface LoadRow {
  label: string;
  count: number;
  isToday: boolean;
}

/** 未来 14 天每天到期几篇。 */
export function loadBars(rows: readonly LoadRow[]): string {
  const width = 256;
  const chartHeight = 58;
  const baseline = 74;
  const gap = 3;
  const barWidth = (width - gap * (rows.length - 1)) / Math.max(1, rows.length);
  const max = Math.max(1, ...rows.map((row) => row.count));

  const bars = rows
    .map((row, index) => {
      const x = index * (barWidth + gap);
      const ratio = row.count / max;
      const height = row.count === 0 ? 1.5 : Math.max(3, ratio * chartHeight);
      const y = baseline - height;
      const cls = row.isToday ? "mc-bar mc-bar-today" : row.count === 0 ? "mc-bar mc-bar-zero" : "mc-bar";
      const value =
        row.count > 0
          ? `<text class="mc-chart-tiny" x="${(x + barWidth / 2).toFixed(2)}" y="${(y - 3).toFixed(2)}" text-anchor="middle">${row.count}</text>`
          : "";
      const tick =
        index % 3 === 0
          ? `<text class="mc-chart-tiny" x="${(x + barWidth / 2).toFixed(2)}" y="${baseline + 12}" text-anchor="middle">${escapeXml(row.label)}</text>`
          : "";
      return `<g><rect class="${cls}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${height.toFixed(2)}" rx="2" />${value}${tick}</g>`;
    })
    .join("\n  ");

  return `<svg class="mc-chart mc-chart-load" viewBox="0 0 ${width} 96" preserveAspectRatio="none" role="img">
  <line class="mc-axis" x1="0" y1="${baseline}" x2="${width}" y2="${baseline}" />
  ${bars}
</svg>`;
}

export interface HeatCell {
  /** 第几周，0 在最左。 */
  col: number;
  /** 周内第几天，0 = 周日。 */
  row: number;
  count: number;
  label: string;
}

/** GitHub 风格热力图：按天记复习次数。 */
export function heatmap(cells: readonly HeatCell[], weeks: number, less: string, more: string): string {
  const cell = 13;
  const step = 16;
  const gridWidth = step * weeks - (step - cell);
  const width = gridWidth + 4;
  const top = 6;
  const gridHeight = step * 7 - (step - cell);
  const height = top + gridHeight + 22;

  const rects = cells
    .map((entry) => {
      const x = 2 + entry.col * step;
      const y = top + entry.row * step;
      const level = entry.count === 0 ? 0 : entry.count <= 1 ? 1 : entry.count <= 3 ? 2 : entry.count <= 6 ? 3 : 4;
      return `<rect class="mc-heat mc-heat-${level}" x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2"><title>${escapeXml(entry.label)}: ${entry.count}</title></rect>`;
    })
    .join("\n  ");

  const legendY = top + gridHeight + 12;
  return `<svg class="mc-chart mc-chart-heat" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMinYMin meet" role="img">
  ${rects}
  <g class="mc-heat-legend">
    <text class="mc-chart-tiny" x="2" y="${legendY}">${escapeXml(less)}</text>
    <rect class="mc-heat mc-heat-0" x="24" y="${legendY - 9}" width="10" height="10" rx="2" />
    <rect class="mc-heat mc-heat-1" x="36" y="${legendY - 9}" width="10" height="10" rx="2" />
    <rect class="mc-heat mc-heat-2" x="48" y="${legendY - 9}" width="10" height="10" rx="2" />
    <rect class="mc-heat mc-heat-3" x="60" y="${legendY - 9}" width="10" height="10" rx="2" />
    <rect class="mc-heat mc-heat-4" x="72" y="${legendY - 9}" width="10" height="10" rx="2" />
    <text class="mc-chart-tiny" x="86" y="${legendY}">${escapeXml(more)}</text>
  </g>
</svg>`;
}

export interface FolderRow {
  name: string;
  /** null = 该文件夹里还没有真正复习过的笔记，不显示会衰减的百分比。 */
  average: number | null;
  count: number;
}

/** 横向条形：各一级文件夹平均熟练度（只看真正复习过的笔记）。 */
export function folderBars(rows: readonly FolderRow[]): string {
  const width = 256;
  const rowHeight = 22;
  const height = Math.max(rowHeight, rows.length * rowHeight + 4);
  const barLeft = 82;
  const barWidth = 132;

  const content = rows
    .map((row, index) => {
      const y = 4 + index * rowHeight;
      const ratio = row.average === null ? 0 : clamp01(row.average);
      const filled = ratio * barWidth;
      const value = row.average === null ? "—" : `${Math.round(ratio * 100)}%`;
      return `<g>
    <text class="mc-chart-label" x="0" y="${y + 12}">${escapeXml(clip(row.name, 9))}</text>
    <rect class="mc-folder-track" x="${barLeft}" y="${y + 3}" width="${barWidth}" height="11" rx="3" />
    <rect class="mc-folder-value" x="${barLeft}" y="${y + 3}" width="${filled.toFixed(2)}" height="11" rx="3" />
    <text class="mc-chart-tiny" x="${barLeft + barWidth + 5}" y="${y + 12}">${escapeXml(value)}</text>
  </g>`;
    })
    .join("\n  ");

  return `<svg class="mc-chart mc-chart-folder" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img">
  ${content}
</svg>`;
}
