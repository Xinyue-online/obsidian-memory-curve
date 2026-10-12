/** 中英文案。视图只从这里取字，不硬编码。 */

export type Lang = "zh" | "en";

export interface Strings {
  pluginName: string;
  ribbonTooltip: string;
  cmdOpenSidebar: string;
  cmdStartReview: string;
  sidebarTitle: string;
  scope: string;
  scopeAll: string;
  scopeRoot: string;
  refresh: string;
  rescan: string;
  rescanDone: string;
  notesCount: string;
  dueCount: string;
  baselineCount: string;
  streakDays: string;
  mastery: string;
  masteryAll: string;
  masteryReviewed: string;
  noReviewedYet: string;
  bucketMastered: string;
  bucketFamiliar: string;
  bucketFuzzy: string;
  bucketForgetting: string;
  bucketBaseline: string;
  bucketUnreviewed: string;
  distribution: string;
  loadTitle: string;
  calendarTitle: string;
  folderTitle: string;
  queueTitle: string;
  queueHint: string;
  listTitle: string;
  colScore: string;
  colLast: string;
  colDue: string;
  colTimes: string;
  never: string;
  today: string;
  dueNow: string;
  inDays: string;
  daysAgo: string;
  badgeBaseline: string;
  emptyScope: string;
  queueEmpty: string;
  reviewTitle: string;
  reviewPrompt: string;
  skip: string;
  next: string;
  noNext: string;
  gradedToast: string;
  reviewInfo: string;
  reviewReadonly: string;
  gradeHint: string;
  cmdGradeCurrent: string;
  modalTitle: string;
  chipScore: string;
  chipStability: string;
  chipSuccess: string;
  chipLapse: string;
  chipTimes: string;
  chipDue: string;
  missingNote: string;
  saveFailed: string;
  settingsTitle: string;
  settingStability: string;
  settingStabilityDesc: string;
  settingThreshold: string;
  settingThresholdDesc: string;
  settingScope: string;
  settingScopeDesc: string;
  settingOnlyCurrent: string;
  settingOnlyCurrentDesc: string;
  settingAutoClose: string;
  settingAutoCloseDesc: string;
  settingLanguage: string;
  settingLanguageDesc: string;
  settingRecalc: string;
  settingRecalcDesc: string;
  settingRecalcButton: string;
  settingRecalcDone: string;
  grade0: string;
  grade1: string;
  grade2: string;
  grade3: string;
  grade4: string;
  grade5: string;
  lessLabel: string;
  moreLabel: string;
}

const zh: Strings = {
  pluginName: "记忆曲线",
  ribbonTooltip: "记忆曲线：打开面板",
  cmdOpenSidebar: "打开记忆曲线面板",
  cmdStartReview: "开始复习",
  sidebarTitle: "记忆曲线",
  scope: "范围",
  scopeAll: "全库",
  scopeRoot: "根目录",
  refresh: "刷新",
  rescan: "重新扫描",
  rescanDone: "已扫描 {n} 篇笔记",
  notesCount: "笔记",
  dueCount: "待复习",
  baselineCount: "基线",
  streakDays: "连续天数",
  mastery: "掌握度",
  masteryAll: "整体掌握度",
  masteryReviewed: "仅已复习",
  noReviewedYet: "尚未真正复习",
  bucketMastered: "熟练",
  bucketFamiliar: "熟悉",
  bucketFuzzy: "模糊",
  bucketForgetting: "遗忘中",
  bucketBaseline: "基线",
  bucketUnreviewed: "未复习",
  distribution: "熟练度分布",
  loadTitle: "复习负荷（未来 14 天）",
  calendarTitle: "复习日历",
  folderTitle: "文件夹对比",
  queueTitle: "最该复习的 10 篇",
  queueHint: "基线笔记从未打过分，排在前面",
  listTitle: "笔记清单",
  colScore: "熟练度",
  colLast: "上次",
  colDue: "下次到期",
  colTimes: "次数",
  never: "从未",
  today: "今天",
  dueNow: "已到期",
  inDays: "{n} 天后",
  daysAgo: "{n} 天前",
  badgeBaseline: "基线",
  emptyScope: "这个范围里没有 md 笔记",
  queueEmpty: "本范围没有待复习的笔记，休息一下",
  reviewTitle: "复习",
  reviewPrompt: "这篇记得怎么样？",
  skip: "跳过",
  next: "下一篇",
  noNext: "没有下一篇待复习了",
  gradedToast: "已记录 {q} 分",
  reviewInfo: "稳定度 {s} 天 · 成功 {n} 次 · 失败 {l} 次 · 下次 {d}",
  reviewReadonly: "只读渲染，关闭标签页不写任何东西",
  gradeHint: "键盘 0–5 直接打分",
  cmdGradeCurrent: "评价当前笔记",
  modalTitle: "评价这篇笔记",
  chipScore: "熟练度",
  chipStability: "稳定度",
  chipSuccess: "成功",
  chipLapse: "失败",
  chipTimes: "复习次数",
  chipDue: "下次到期",
  missingNote: "找不到这篇笔记，可能已被删除或改名",
  saveFailed: "记忆曲线：数据写入失败，请检查插件目录 data/ 的写入权限",
  settingsTitle: "记忆曲线设置",
  settingStability: "稳定度初值 S0（天）",
  settingStabilityDesc: "冷启动基线用 3 天：遗忘曲线在 t=S 时保持率降到 1/e≈0.37，3 天是个保守起点，配 0.75 阈值约 0.86 天后到期。",
  settingThreshold: "到期保持率阈值",
  settingThresholdDesc: "保持率 R(t) 低于该值即判定到期。0.75 意味着间隔约 S·ln(1/0.75)≈0.288S。",
  settingScope: "默认范围",
  settingScopeDesc: "打开面板时默认统计的文件夹。",
  settingOnlyCurrent: "只复习当前文件夹",
  settingOnlyCurrentDesc: "开启后，待复习队列只包含面板当前选中文件夹内的笔记。",
  settingAutoClose: "悬浮打分窗：打分后自动关闭",
  settingAutoCloseDesc: "开启（默认）时，点 0–5 或按数字键打完分就关掉窗口，窗口里不再显示「跳过 / 下一篇」；关闭后打完分原地换下一篇，两个按钮会保留。",
  settingLanguage: "语言",
  settingLanguageDesc: "侧边栏与复习页的界面语言。",
  settingRecalc: "按新参数重算",
  settingRecalcDesc: "改动 S0 或阈值后，重算所有记录的到期时间；未打分的基线会跟着新的 S0 走。",
  settingRecalcButton: "立即重算",
  settingRecalcDone: "已按新参数重算全部记录",
  grade0: "完全忘了",
  grade1: "几乎忘了",
  grade2: "很吃力",
  grade3: "想起来了",
  grade4: "比较轻松",
  grade5: "脱口而出",
  lessLabel: "少",
  moreLabel: "多",
};

const en: Strings = {
  pluginName: "Memory Curve",
  ribbonTooltip: "Memory Curve: open panel",
  cmdOpenSidebar: "Open memory curve panel",
  cmdStartReview: "Start reviewing",
  sidebarTitle: "Memory Curve",
  scope: "Scope",
  scopeAll: "Whole vault",
  scopeRoot: "Vault root",
  refresh: "Refresh",
  rescan: "Rescan",
  rescanDone: "Scanned {n} notes",
  notesCount: "Notes",
  dueCount: "Due",
  baselineCount: "Baseline",
  streakDays: "Day streak",
  mastery: "Mastery",
  masteryAll: "Overall mastery",
  masteryReviewed: "Reviewed only",
  noReviewedYet: "nothing reviewed yet",
  bucketMastered: "Mastered",
  bucketFamiliar: "Familiar",
  bucketFuzzy: "Fuzzy",
  bucketForgetting: "Forgetting",
  bucketBaseline: "Baseline",
  bucketUnreviewed: "Not reviewed",
  distribution: "Proficiency distribution",
  loadTitle: "Review load (next 14 days)",
  calendarTitle: "Review calendar",
  folderTitle: "Folder comparison",
  queueTitle: "Top 10 to review",
  queueHint: "baseline notes rank first — they were never graded",
  listTitle: "Notes",
  colScore: "Score",
  colLast: "Last",
  colDue: "Due",
  colTimes: "Times",
  never: "never",
  today: "today",
  dueNow: "due now",
  inDays: "in {n}d",
  daysAgo: "{n}d ago",
  badgeBaseline: "baseline",
  emptyScope: "No markdown notes in this scope",
  queueEmpty: "Nothing due in this scope — take a break",
  reviewTitle: "Review",
  reviewPrompt: "How well did you recall this?",
  skip: "Skip",
  next: "Next",
  noNext: "No more notes due",
  gradedToast: "Recorded grade {q}",
  reviewInfo: "Stability {s}d · {n} passes · {l} lapses · next {d}",
  reviewReadonly: "read-only render; closing the tab writes nothing",
  gradeHint: "press 0–5 to grade",
  cmdGradeCurrent: "Grade current note",
  modalTitle: "Grade this note",
  chipScore: "Retention",
  chipStability: "Stability",
  chipSuccess: "Recalls",
  chipLapse: "Lapses",
  chipTimes: "Reviews",
  chipDue: "Next due",
  missingNote: "Note not found — it may have been deleted or renamed",
  saveFailed: "Memory Curve: failed to write data — check write access to the plugin data/ folder",
  settingsTitle: "Memory Curve settings",
  settingStability: "Initial stability S0 (days)",
  settingStabilityDesc: "Baseline starts at 3 days: retention decays to 1/e≈0.37 at t=S, and 3 days with a 0.75 threshold first comes due after ~0.86 days.",
  settingThreshold: "Due retention threshold",
  settingThresholdDesc: "A note is due once R(t) drops below this. 0.75 means an interval of about S·ln(1/0.75)≈0.288S.",
  settingScope: "Default scope",
  settingScopeDesc: "Folder the panel aggregates on open.",
  settingOnlyCurrent: "Review current folder only",
  settingOnlyCurrentDesc: "When on, the due queue only contains notes from the folder selected in the panel.",
  settingAutoClose: "Grade window: close after grading",
  settingAutoCloseDesc: "On (default): picking 0–5 (or pressing a number key) closes the window, and its Skip / Next buttons are hidden. Off: the window stays open and moves on to the next due note, with both buttons shown.",
  settingLanguage: "Language",
  settingLanguageDesc: "Language of the sidebar and review view.",
  settingRecalc: "Recalculate",
  settingRecalcDesc: "After changing S0 or the threshold, recompute due dates; ungraded baselines adopt the new S0.",
  settingRecalcButton: "Recalculate now",
  settingRecalcDone: "All records recalculated with the new parameters",
  grade0: "blank",
  grade1: "barely",
  grade2: "hard",
  grade3: "recalled",
  grade4: "easy",
  grade5: "instant",
  lessLabel: "less",
  moreLabel: "more",
};

const TABLES: Record<Lang, Strings> = { zh, en };

/** 取某语言的文案表。 */
export function strings(lang: Lang): Strings {
  return TABLES[lang] ?? TABLES.zh;
}

/** 简易插值：{n}、{q} 之类。 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}
